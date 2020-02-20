#!/usr/bin/env node

const Web3 = require("web3");
const fs = require("fs");
const path = require('path');
const RLP = require('rlp');
const BN = Web3.utils.BN;

process.on('unhandledRejection', console.error.bind(console))

const { gasPriceGwei, printPrivateKey, rpcUrl, signedTxOutput, dontSendTx, chainId: chainIdInput } = require('yargs')
    .usage('Usage: $0 --gas-price-gwei [gwei] --print-private-key [bool] --rpc-url [url] --signed-tx-output [path] --dont-send-tx [bool] --chain-id')
    .demandOption(['gasPriceGwei', 'rpcUrl'])
    .boolean('printPrivateKey')
    .boolean('dontSendTx')
    .argv;

const web3 = new Web3(new Web3.providers.HttpProvider(rpcUrl));
const solc = require('solc')

const rand = web3.utils.randomHex(7);
const privateKey = web3.utils.sha3("js sucks" + rand);

if (printPrivateKey) {
    let path = "privatekey_"  + web3.utils.randomHex(7) + ".txt";

    fs.writeFileSync(path, privateKey, function(err) {
        if(err) {
            return console.log(err);
        }
    });
}
const account = web3.eth.accounts.privateKeyToAccount(privateKey);
const sender = account.address;
const gasPrice = new BN(gasPriceGwei).mul(new BN(10 ** 9));
const signedTxs = [];
let nonce;
let chainId = chainIdInput;

console.log("from",sender);

async function sendTx(txObject) {
    const txTo = txObject._parent.options.address;

    let gasLimit;
    try {
        gasLimit = await txObject.estimateGas();
    } catch (e) {
        gasLimit = 800 * 1000;
    }

    if(txTo !== null) {
        gasLimit = 800 * 1000;
    }

    gasLimit *= 1.2;
    gasLimit -= gasLimit % 1;

    //console.log(gasLimit);
    const txData = txObject.encodeABI();
    const txFrom = account.address;
    const txKey = account.privateKey;

    const tx = {
        from : txFrom,
        to : txTo,
        nonce : nonce,
        data : txData,
        gas : gasLimit,
        chainId,
        gasPrice
    };

    const signedTx = await web3.eth.accounts.signTransaction(tx, txKey);
    nonce++;
    // don't wait for confirmation
    signedTxs.push(signedTx.rawTransaction)
    
    if (!dontSendTx) {
        web3.eth.sendSignedTransaction(signedTx.rawTransaction, {from:sender});
    }
}

async function deployContract(solcOutput, contractName, name, ctorArgs) {

    const actualName = contractName;
    const contract = solcOutput.contracts[actualName][name];
    const bytecode = contract["evm"]["bytecode"]["object"];
    const abi = contract['abi'];
    const myContract = new web3.eth.Contract(abi);

    const deploy = myContract.deploy({data:"0x" + bytecode, arguments: ctorArgs});
    let address = "0x" + web3.utils.sha3(RLP.encode([sender,nonce])).slice(12).substring(14);
    address = web3.utils.toChecksumAddress(address);

    await sendTx(deploy);

    myContract.options.address = address;

    return [address,myContract];
}

const ethAddress = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

async function main() {
    nonce = await web3.eth.getTransactionCount(sender);
    console.log("nonce",nonce);

    chainId = chainId || await web3.eth.net.getId()
    console.log('chainId', chainId);

    console.log('starting compilation');
    output = await require("./compileContractsV5.js.js.js").compileContracts();
    console.log(output.errors)
    console.log("finished compilation");

    if (!dontSendTx) {
        await waitForEth();
    }

    let addr;
    let contract;
    const desmond = '0xbDd33F411DA0B40018922a3BC69001B458227f5c';
    const ilan = '0x46a77D03A76232211CD2eabaE3e10e0dfe71CddA';
    const anton = '';
    let admin = desmond;

    [addr, contract] =
        // await deployContract(output, "GasHelper.sol:GasHelper", );
        await deployContract(output, "KyberNetworkProxy.sol", "KyberNetworkProxy", [sender]);

    console.log("Address: " + addr);

    await sendTx(contract.methods.addOperator(ilan));
    await sendTx(contract.methods.addOperator(desmond));

    await sendTx(contract.methods.transferAdminQuickly(admin));

    console.log("last nonce is", nonce);
}

function sleep(ms){
    return new Promise(resolve=>{
        setTimeout(resolve,ms)
    })
}

async function waitForEth() {
    while(true) {
        const balance = await web3.eth.getBalance(sender);
        console.log("waiting for balance to account " + sender);
  
        if(balance.toString() !== "0") {
            console.log("received " + balance.toString() + " wei");
            return;
        } else {
            await sleep(10000);
        }
    }
}

main();

