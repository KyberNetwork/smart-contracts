#!/usr/bin/env node

const Web3 = require("web3");
const fs = require("fs");
const path = require('path');
const RLP = require('rlp');
const BigNumber = require('bignumber.js')

process.on('unhandledRejection', console.error.bind(console))

const { gasPriceGwei, rpcUrl} = require('yargs')
    .usage('Usage: $0 --gas-price-gwei [gwei] --rpc-url [url]')
    .demandOption(['gasPriceGwei', 'rpcUrl'])
    .boolean('printPrivateKey')
    .boolean('dontSendTx')
    .argv;

const web3 = new Web3(new Web3.providers.HttpProvider(rpcUrl));
const solc = require('solc')

const rand = web3.utils.randomHex(7);
let privateKey = web3.utils.sha3("js sucks" + rand);

const account = web3.eth.accounts.privateKeyToAccount(privateKey);
console.log(privateKey);
const sender = account.address;
const gasPrice = BigNumber(gasPriceGwei).mul(10 ** 9);
const signedTxs = [];
let nonce;
let chainId;

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
    web3.eth.sendSignedTransaction(signedTx.rawTransaction, {from:sender});
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

const input = {
    "TestToken.sol" : fs.readFileSync(contractPath + 'mockContracts/TestToken.sol', 'utf8')
};

let output;
let bigNum;

async function main() {

//    bigNum = web3.utils.toBN(10**25);
//    bigNum = bigNum.pow(10);
//    console.log(bigNum);
//    return;

    nonce = await web3.eth.getTransactionCount(sender);
    console.log("nonce",nonce);

    console.log('solc.version')
    console.log(solc.version())

    chainId = chainId || await web3.eth.net.getId()
    console.log('chainId', chainId);

    console.log("starting compilation");
    output = await solc.compile({ sources: input }, 1);
    console.log(output.errors);
    console.log("finished compilation");

    await waitForEth();

    let contractInst;
    let address;

    console.log("deploying test token");

    let kncToken = {};
    kncToken.symbol = "KNC";
    kncToken.name = "KyberNetwork";
    kncToken.decimals = 18;
    await deployToken(kncToken);

    let eosToken = {};
    eosToken.symbol = "EOS";
    eosToken.name = "Eos";
    eosToken.decimals = 18;
    await deployToken(eosToken);

    let omgToken = {};
    omgToken.symbol = "OMG";
    omgToken.name = "OmiseGO";
    omgToken.decimals = 18;
    await deployToken(omgToken)

    let saltToken = {};
    saltToken.symbol = "SALT";
    saltToken.name = "SALT";
    saltToken.decimals = 8;
    await deployToken(saltToken);

    let sntToken = {};
    sntToken.symbol = "SNT";
    sntToken.name = "STATUS";
    sntToken.decimals = 18;
    await deployToken(sntToken);
}


async function deployToken (token) {
    [token.address, token.inst] = await deployContract(output, "TestToken.sol:TestToken",
            [token.name, token.symbol, token.decimals]);

    console.log("token " + token.symbol + " address " + token.address.toString());
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


main()