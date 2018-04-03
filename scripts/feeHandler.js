#!/usr/bin/env node

//TODO get feeburner's address from network contract.
//const networkAddress = 0x964f35fae36d75b1e72770e244f6595b68508cf5;
//Network = await new web3.eth.Contract(JSON.parse(abi), networkAddress);
//feeBurnerAdd = (await Network.methods.feeBurnerContract().call()).toLowerCase();

const feeBurnerAddress = 0x07f6e905f2a1559cD9FD43CB92F8a1062A3CA706;
const feeBurnerAbi = [{"constant":false,"inputs":[{"name":"alerter","type":"address"}],"name":"removeAlerter","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[{"name":"","type":"address"}],"name":"reserveKNCWallet","outputs":[{"name":"","type":"address"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"rate","type":"uint256"}],"name":"setKNCRate","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[{"name":"","type":"address"},{"name":"","type":"address"}],"name":"reserveFeeToWallet","outputs":[{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"pendingAdmin","outputs":[{"name":"","type":"address"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"getOperators","outputs":[{"name":"","type":"address[]"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[{"name":"","type":"address"}],"name":"reserveFeeToBurn","outputs":[{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"taxWallet","outputs":[{"name":"","type":"address"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[{"name":"","type":"address"}],"name":"reserveFeesInBps","outputs":[{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"taxFeeBps","outputs":[{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"token","type":"address"},{"name":"amount","type":"uint256"},{"name":"sendTo","type":"address"}],"name":"withdrawToken","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"name":"newAlerter","type":"address"}],"name":"addAlerter","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[{"name":"","type":"address"}],"name":"walletFeesInBps","outputs":[{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"reserve","type":"address"},{"name":"feesInBps","type":"uint256"},{"name":"kncWallet","type":"address"}],"name":"setReserveData","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"name":"wallet","type":"address"},{"name":"feesInBps","type":"uint256"}],"name":"setWalletFees","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"name":"newAdmin","type":"address"}],"name":"transferAdmin","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[],"name":"claimAdmin","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"name":"newAdmin","type":"address"}],"name":"transferAdminQuickly","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[],"name":"getAlerters","outputs":[{"name":"","type":"address[]"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"kncPerETHRate","outputs":[{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"newOperator","type":"address"}],"name":"addOperator","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"name":"_taxFeeBps","type":"uint256"}],"name":"setTaxInBps","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"name":"operator","type":"address"}],"name":"removeOperator","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[],"name":"kyberNetwork","outputs":[{"name":"","type":"address"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"amount","type":"uint256"},{"name":"sendTo","type":"address"}],"name":"withdrawEther","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[{"name":"","type":"address"}],"name":"feePayedPerReserve","outputs":[{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"wallet","type":"address"},{"name":"reserve","type":"address"}],"name":"sendFeeToWallet","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[],"name":"knc","outputs":[{"name":"","type":"address"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"_taxWallet","type":"address"}],"name":"setTaxWallet","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"name":"reserve","type":"address"}],"name":"burnReserveFees","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[],"name":"admin","outputs":[{"name":"","type":"address"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"tradeWeiAmount","type":"uint256"},{"name":"reserve","type":"address"},{"name":"wallet","type":"address"}],"name":"handleFees","outputs":[{"name":"","type":"bool"}],"payable":false,"stateMutability":"nonpayable","type":"function"},{"inputs":[{"name":"_admin","type":"address"},{"name":"kncToken","type":"address"},{"name":"_kyberNetwork","type":"address"}],"payable":false,"stateMutability":"nonpayable","type":"constructor"},{"anonymous":false,"inputs":[{"indexed":false,"name":"reserve","type":"address"},{"indexed":false,"name":"wallet","type":"address"},{"indexed":false,"name":"walletFee","type":"uint256"}],"name":"AssignFeeToWallet","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"name":"reserve","type":"address"},{"indexed":false,"name":"burnFee","type":"uint256"}],"name":"AssignBurnFees","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"reserve","type":"address"},{"indexed":false,"name":"sender","type":"address"},{"indexed":false,"name":"quantity","type":"uint256"}],"name":"BurnAssignedFees","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"reserve","type":"address"},{"indexed":false,"name":"sender","type":"address"},{"indexed":false,"name":"taxWallet","type":"address"},{"indexed":false,"name":"quantity","type":"uint256"}],"name":"SendTaxFee","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"wallet","type":"address"},{"indexed":false,"name":"reserve","type":"address"},{"indexed":false,"name":"sender","type":"address"}],"name":"SendWalletFees","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"name":"token","type":"address"},{"indexed":false,"name":"amount","type":"uint256"},{"indexed":false,"name":"sendTo","type":"address"}],"name":"TokenWithdraw","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"name":"amount","type":"uint256"},{"indexed":false,"name":"sendTo","type":"address"}],"name":"EtherWithdraw","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"name":"pendingAdmin","type":"address"}],"name":"TransferAdminPending","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"name":"newAdmin","type":"address"},{"indexed":false,"name":"previousAdmin","type":"address"}],"name":"AdminClaimed","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"name":"newAlerter","type":"address"},{"indexed":false,"name":"isAdd","type":"bool"}],"name":"AlerterAdded","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"name":"newOperator","type":"address"},{"indexed":false,"name":"isAdd","type":"bool"}],"name":"OperatorAdded","type":"event"}] 

const wallets = {"olympus": 0x09227deaeE08a5Ba9D6Eb057F922aDfAd191c36c,
                 "imtoken": 0xb9E29984Fe50602E7A619662EBED4F90D93824C7,
                 "trust": 0xf1aa99c69715f423086008eb9d06dc1e35cc504d,
                 "cipher": 0xDD61803d4a56C597E0fc864F7a20eC7158c6cBA5 }

//TODO get reserves ant their addresses from network contract. 
//feeBurnerAdd = (await Network.methods. getReserves().call()).toLowerCase();

const reserves = {"kyber": 0x63825c174ab367968ec60f061753d3bbd36a0d8f,
                  "prycto": 0x2aab2b157a03915c8a73adae735d0cf51c872f31 }

const Web3 = require("web3");
const fs = require("fs");
const path = require('path');
const BigNumber = require('bignumber.js') //TODO: Check if can remove this as new web3 already contains bingmumber.

process.on('unhandledRejection', console.error.bind(console))

const { gasPriceGwei } = require('yargs')
    .usage('Usage: $0 --gas-price-gwei [gwei] --private-key-file [file]')
    .demandOption(['gasPriceGwei', 'privateKeyFile'])
    .argv;

url = "https://mainnet.infura.io";
const web3 = new Web3(new Web3.providers.HttpProvider(url));

let privateKey;
fs.readFile(privateKeyFile, 'utf8', function (err,data) {
  if (err) {
    return console.log(err);
  }
  privateKey = data;
  console.log(privateKey);
});

const account = web3.eth.accounts.privateKeyToAccount(privateKey);
const sender = account.address;
const gasPrice = BigNumber(gasPriceGwei).mul(10 ** 9);
const signedTxs = [];
let nonce;

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
      gasPrice
    };

    const signedTx = await web3.eth.accounts.signTransaction(tx, txKey);
    nonce++;
    // don't wait for confirmation
    signedTxs.push(signedTx.rawTransaction)
    web3.eth.sendSignedTransaction(signedTx.rawTransaction, {from:sender});
}

const FeeBurner = new web3.eth.Contract(JSON.parse(feeBurnerAbi), feeBurnerAddress);

async function enoughReserveFeesToBurn(reserve_address)
{
    let reserveFeeToBurn = (await FeeBurner.methods.reserveFeeToBurn(reserve_address).call()).toLowerCase();
    return (reserveFeeToBurn.toString() >= 10)
}

async function enoughWalletFeesToBurn(reserve_address, wallet_address)
{
    let walletFeeToBurn = (await FeeBurner.methods.reserveFeeToWallet(reserve_address, wallet_address).call()).toLowerCase();
    return (walletFeeToBurn.toString() >= 10)
}

async function burnReservesFees(reserve_address) {
    let enough = await enoughReserveFeesToBurn(reserve_address);
    if (enough) {
        await sendTx(FeeBurner.methods.burnReserveFees(reserve_address));
        //TODO: wait for completion, using 5s sleep each time.
        // https://github.com/ethereum/web3.js/issues/1138 - use this, if object that got is null it is not mined (pending), after it is not null check status field.
        // As reference Yaron sent me a tx that succeeded, and one tx that was in blockchain and reverted.
        // Note that fee burner now will fail. need to move knc to the wallet that is approved (rof kyber,prycto).
        // https://github.com/ethereum/web3.js/issues/1442
        // if tx failed print it, maybe the wallet (can understand later from etherscan, or account for it).
        // if tx still fails return error.
        // can do it in sendtx. if false - do not return error but list failed txs.
    }
}

async function sendFeesToWallets(reserve_address) {
    for (let wallet in wallets) {
        wallet_address = wallet_addresses[wallet];
        let enough = await enoughWalletFeesToBurn(reserve_address, wallet_address);
        if (enough) {
            await sendTx(FeeBurner.methods.sendFeeToWallet(wallet_address, reserve_address));
        }
    }
}

async function main() {
    nonce = await web3.eth.getTransactionCount(sender);
    console.log("nonce",nonce);

    for (let reserve in reserves) {
        let reserve_address = reserve[address];
        await burnReservesFees(reserve_address);
        await sendFeesToWallets(reserve_address);
      //TODO: wait for completion in same manner as above.
    }
}

main();

//TODO send Yaron address - not with the random, send from it.
