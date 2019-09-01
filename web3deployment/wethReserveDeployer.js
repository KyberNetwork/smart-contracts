#!/usr/bin/env node

const Web3 = require("web3");
const fs = require("fs");
const path = require('path');
const RLP = require('rlp');
const BigNumber = require('bignumber.js')

process.on('unhandledRejection', console.error.bind(console))

//current run command: node web3deployment/wethReserveDeployer.js --gas-price-gwei 3 --rpc-url https://mainnet.infura.io 
const { gasPriceGwei, printPrivateKey, rpcUrl, signedTxOutput, dontSendTx, chainId: chainIdInput } = require('yargs')
    .usage('Usage: $0 --gas-price-gwei [gwei] --print-private-key [bool] --rpc-url [url] --signed-tx-output [path] --dont-send-tx [bool] --chain-id')
    .demandOption(['gasPriceGwei', 'rpcUrl'])
    .boolean('printPrivateKey')
    .boolean('dontSendTx')
    .argv;
const web3 = new Web3(new Web3.providers.HttpProvider(rpcUrl));
const solc = require('solc')

const rand = web3.utils.randomHex(7);

const privateKey = web3.utils.sha3("in joy we trust" + rand);
console.log("privateKey", privateKey);

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
const gasPrice = BigNumber(gasPriceGwei).mul(10 ** 9);
const signedTxs = [];
let nonce;
let chainId = chainIdInput;

console.log("from",sender);

async function sendTx(txObject) {
    const txTo = txObject._parent.options.address;

    let gasLimit;
    try {
        gasLimit = await txObject.estimateGas();
    }
    catch (e) {
        gasLimit = 500 * 1000;
    }

    if(txTo !== null) {
        gasLimit = 500 * 1000;
    }

    gasLimit *= 1.2;
    gasLimit -= gasLimit % 1;

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

async function deployContract(solcOutput, contractName, ctorArgs) {

    const actualName = contractName;
    const bytecode = solcOutput.contracts[actualName].bytecode;

    const abi = solcOutput.contracts[actualName].interface;
    const myContract = new web3.eth.Contract(JSON.parse(abi));
    const deploy = myContract.deploy({data:"0x" + bytecode, arguments: ctorArgs});
    let address = "0x" + web3.utils.sha3(RLP.encode([sender,nonce])).slice(12).substring(14);
    address = web3.utils.toChecksumAddress(address);

    await sendTx(deploy);

    myContract.options.address = address;


    return [address,myContract];
}

const contractPath = path.join(__dirname, "../contracts/");
const wethContractPath = path.join(__dirname, "../contracts/wethContracts/");


const input = {
    "PermissionGroups.sol" : fs.readFileSync(contractPath + 'PermissionGroups.sol', 'utf8'),
    "ERC20Interface.sol" : fs.readFileSync(contractPath + 'ERC20Interface.sol', 'utf8'),
    "Withdrawable.sol" : fs.readFileSync(contractPath + 'Withdrawable.sol', 'utf8'),
    "Utils.sol" : fs.readFileSync(contractPath + 'Utils.sol', 'utf8'),
    "Utils2.sol" : fs.readFileSync(contractPath + 'Utils2.sol', 'utf8'),
    "KyberReserveInterface.sol" : fs.readFileSync(contractPath + 'KyberReserveInterface.sol', 'utf8'),
    "KyberWethReserve.sol" : fs.readFileSync(wethContractPath + 'KyberWethReserve.sol', 'utf8')
};

const ethAddress = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const kyberNetworkAddress = '0x706aBcE058DB29eB36578c463cf295F180a1Fe9C'; //staging
const wethTokenAddress = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const adminAddress = '0xF9eF59dB62f56aF114380A7496Fd51172dafD41d';

async function main() {
    nonce = await web3.eth.getTransactionCount(sender);
    console.log("nonce",nonce);

    chainId = chainId || await web3.eth.net.getId()
    console.log('chainId', chainId);

    console.log("starting compilation");
    const output = await solc.compile({ sources: input }, 1);
    console.log(output.errors);
    console.log("finished compilation");

    if (!dontSendTx) {
        // tmp:
        //await waitForEth();
    }

    [kyberWethReserveAddress, kyberWethReserveContract] = await deployContract(
        output,
        "KyberWethReserve.sol:KyberWethReserve",
        [kyberNetworkAddress, wethTokenAddress, adminAddress]
    );

    console.log("kyberWethReserveAddress: " + kyberWethReserveAddress)
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
        }
        else await sleep(10000)
    }
}

main();
