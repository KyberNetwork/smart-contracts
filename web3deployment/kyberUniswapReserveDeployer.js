#!/usr/bin/env node

const Web3 = require("web3");
const fs = require("fs");
const path = require("path");
const RLP = require("rlp");
const BN = Web3.utils.BN;

process.on("unhandledRejection", console.error.bind(console));

// current run command: npx node web3deployment/uniswapReserveDeployer.js --gas-price-gwei 10 --rpc-url https://mainnet.infura.io
const {
    gasPriceGwei,
    printPrivateKey,
    rpcUrl,
    signedTxOutput,
    dontSendTx,
    chainId: chainIdInput
} = require("yargs")
    .usage(
        "Usage: $0 --gas-price-gwei [gwei] --print-private-key [bool] --rpc-url [url] --signed-tx-output [path] --dont-send-tx [bool] --chain-id"
    )
    .demandOption(["gasPriceGwei", "rpcUrl"])
    .boolean("printPrivateKey")
    .boolean("dontSendTx").argv;
const web3 = new Web3(new Web3.providers.HttpProvider(rpcUrl));
const solc = require("solc");

const rand = web3.utils.randomHex(7);

const privateKey = web3.utils.sha3("in joy we trust" + rand);
console.log("privateKey", privateKey);

if (printPrivateKey) {
    let path = "privatekey_" + web3.utils.randomHex(7) + ".txt";
    fs.writeFileSync(path, privateKey, function(err) {
        if (err) {
            return console.log(err);
        }
    });
}
const account = web3.eth.accounts.privateKeyToAccount(privateKey);
const sender = account.address;
const gasPrice = new BN(gasPriceGwei).mul(new BN(10).pow(new BN (9)));
const signedTxs = [];
let nonce;
let chainId = chainIdInput;

console.log("from", sender);

async function sendTx(txObject) {
    const txTo = txObject._parent.options.address;

    let gasLimit;
    try {
        gasLimit = await txObject.estimateGas();
    } catch (e) {
        gasLimit = 500 * 1000;
    }

    if (txTo !== null) {
        gasLimit = 500 * 1000;
    }

    gasLimit *= 1.2;
    gasLimit -= gasLimit % 1;

    const txData = txObject.encodeABI();
    const txFrom = account.address;
    const txKey = account.privateKey;

    const tx = {
        from: txFrom,
        to: txTo,
        nonce: nonce,
        data: txData,
        gas: gasLimit,
        chainId,
        gasPrice
    };

    const signedTx = await web3.eth.accounts.signTransaction(tx, txKey);
    nonce++;
    // don't wait for confirmation
    signedTxs.push(signedTx.rawTransaction);
    if (!dontSendTx) {
        web3.eth.sendSignedTransaction(signedTx.rawTransaction, {
            from: sender
        });
    }
}

async function deployContract(solcOutput, contractName, ctorArgs) {
    const actualName = contractName;
    const bytecode = solcOutput.contracts[actualName].bytecode;

    const abi = solcOutput.contracts[actualName].interface;
    const myContract = new web3.eth.Contract(JSON.parse(abi));
    const deploy = myContract.deploy({
        data: "0x" + bytecode,
        arguments: ctorArgs
    });
    let address =
        "0x" +
        web3.utils
            .sha3(RLP.encode([sender, nonce]))
            .slice(12)
            .substring(14);
    address = web3.utils.toChecksumAddress(address);

    await sendTx(deploy);

    myContract.options.address = address;

    return [address, myContract];
}

const contractPath = path.join(__dirname, "../contracts/");
const uniswapContractPath = path.join(__dirname, "../contracts/uniswap/");

const input = {
    "PermissionGroups.sol": fs.readFileSync(
        contractPath + "PermissionGroups.sol",
        "utf8"
    ),
    "ERC20Interface.sol": fs.readFileSync(
        contractPath + "ERC20Interface.sol",
        "utf8"
    ),
    "Withdrawable.sol": fs.readFileSync(
        contractPath + "Withdrawable.sol",
        "utf8"
    ),
    "Utils.sol": fs.readFileSync(contractPath + "Utils.sol", "utf8"),
    "Utils2.sol": fs.readFileSync(contractPath + "Utils2.sol", "utf8"),
    "KyberReserveInterface.sol": fs.readFileSync(
        contractPath + "KyberReserveInterface.sol",
        "utf8"
    ),
    "KyberUniswapReserve.sol": fs.readFileSync(
        contractPath + "reserves/bridgeReserves/uniswap/KyberUniswapReserve.sol",
        "utf8"
    )
};

const ethAddress = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const feeBurnerAddress = "0x8007aa43792A392b221DC091bdb2191E5fF626d1"; // production
const uniswapFactoryAddress = "0xc0a47dFe034B400B47bDaD5FecDa2621de6c4d95";
const adminAddress = "0x2Fd6181541bEbe30D17CF3a5d9f40eBceCbdBA43";
const kyberNetworkAddress = "0x65bF64Ff5f51272f729BDcD7AcFB00677ced86Cd"; // production

async function main() {
    nonce = await web3.eth.getTransactionCount(sender);
    console.log("nonce", nonce);

    chainId = chainId || (await web3.eth.net.getId());
    console.log("chainId", chainId);

    console.log("starting compilation");
    const output = await solc.compile({ sources: input }, 1);
    console.log(output.errors);
    console.log("finished compilation");

    if (!dontSendTx) {
        // tmp:
        await waitForEth();
    }

    const [reserveAddress, reserveContract] = await deployContract(
        output,
        "KyberUniswapReserve.sol:KyberUniswapReserve",
        [uniswapFactoryAddress, sender, kyberNetworkAddress]
    );

    await sendTx(reserveContract.methods.setFee(1));

//    const reserveAddress = "";
//    const reserveContract = new web3.eth.Contract(JSON.parse(output.contracts["KyberUniswapReserve.sol:KyberUniswapReserve"].interface), reserveAddress);

    let operators = ["0xd3cc03c1d1e9d46f28aebc4ba26c5990c7ffbc3e"]

    for (let i = 0; i < operators.length; i++) {
        await sendTx(reserveContract.methods.addOperator(operators[i]));
    }

    await sendTx(reserveContract.methods.transferAdmin(adminAddress));

    console.log("reserveAddress: " + reserveAddress);
    console.log("last nonce is", nonce);
}

function sleep(ms) {
    return new Promise(resolve => {
        setTimeout(resolve, ms);
    });
}

async function waitForEth() {
    while (true) {
        const balance = await web3.eth.getBalance(sender);
        console.log("waiting for balance to account " + sender);
        if (balance.toString() !== "0") {
            console.log("received " + balance.toString() + " wei");
            return;
        } else await sleep(10000);
    }
}

main();
