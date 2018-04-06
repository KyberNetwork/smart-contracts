#!/usr/bin/env node

const NetworkAddress = "0x964f35fae36d75b1e72770e244f6595b68508cf5";
const NetworkAbi = '[{"constant":false,"inputs":[{"name":"alerter","type":"address"}],"name":"removeAlerter","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"name":"reserve","type":"address"},{"name":"src","type":"address"},{"name":"dest","type":"address"},{"name":"add","type":"bool"}],"name":"listPairForReserve","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[{"name":"","type":"address"},{"name":"","type":"bytes32"}],"name":"perReserveListedPairs","outputs":[{"name":"","type":"bool"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"getReserves","outputs":[{"name":"","type":"address[]"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"enabled","outputs":[{"name":"","type":"bool"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"pendingAdmin","outputs":[{"name":"","type":"address"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"getOperators","outputs":[{"name":"","type":"address[]"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"token","type":"address"},{"name":"amount","type":"uint256"},{"name":"sendTo","type":"address"}],"name":"withdrawToken","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[],"name":"maxGasPrice","outputs":[{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"newAlerter","type":"address"}],"name":"addAlerter","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[],"name":"negligibleRateDiff","outputs":[{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"feeBurnerContract","outputs":[{"name":"","type":"address"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"expectedRateContract","outputs":[{"name":"","type":"address"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"whiteListContract","outputs":[{"name":"","type":"address"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"field","type":"bytes32"},{"name":"value","type":"uint256"}],"name":"setInfo","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[{"name":"user","type":"address"}],"name":"getUserCapInWei","outputs":[{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"newAdmin","type":"address"}],"name":"transferAdmin","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"name":"_enable","type":"bool"}],"name":"setEnable","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[],"name":"claimAdmin","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[{"name":"","type":"address"}],"name":"isReserve","outputs":[{"name":"","type":"bool"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"newAdmin","type":"address"}],"name":"transferAdminQuickly","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[],"name":"getAlerters","outputs":[{"name":"","type":"address[]"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[{"name":"src","type":"address"},{"name":"dest","type":"address"},{"name":"srcQty","type":"uint256"}],"name":"getExpectedRate","outputs":[{"name":"expectedRate","type":"uint256"},{"name":"slippageRate","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[{"name":"","type":"uint256"}],"name":"reserves","outputs":[{"name":"","type":"address"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"newOperator","type":"address"}],"name":"addOperator","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"name":"reserve","type":"address"},{"name":"add","type":"bool"}],"name":"addReserve","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"name":"operator","type":"address"}],"name":"removeOperator","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"name":"_whiteList","type":"address"},{"name":"_expectedRate","type":"address"},{"name":"_feeBurner","type":"address"},{"name":"_maxGasPrice","type":"uint256"},{"name":"_negligibleRateDiff","type":"uint256"}],"name":"setParams","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[{"name":"","type":"bytes32"}],"name":"info","outputs":[{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[{"name":"src","type":"address"},{"name":"dest","type":"address"},{"name":"srcQty","type":"uint256"}],"name":"findBestRate","outputs":[{"name":"","type":"uint256"},{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"src","type":"address"},{"name":"srcAmount","type":"uint256"},{"name":"dest","type":"address"},{"name":"destAddress","type":"address"},{"name":"maxDestAmount","type":"uint256"},{"name":"minConversionRate","type":"uint256"},{"name":"walletId","type":"address"}],"name":"trade","outputs":[{"name":"","type":"uint256"}],"payable":true,"stateMutability":"payable","type":"function"},{"constant":false,"inputs":[{"name":"amount","type":"uint256"},{"name":"sendTo","type":"address"}],"name":"withdrawEther","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[],"name":"getNumReserves","outputs":[{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[{"name":"token","type":"address"},{"name":"user","type":"address"}],"name":"getBalance","outputs":[{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"admin","outputs":[{"name":"","type":"address"}],"payable":false,"stateMutability":"view","type":"function"},{"inputs":[{"name":"_admin","type":"address"}],"payable":false,"stateMutability":"nonpayable","type":"constructor"},{"payable":true,"stateMutability":"payable","type":"fallback"},{"anonymous":false,"inputs":[{"indexed":true,"name":"sender","type":"address"},{"indexed":false,"name":"amount","type":"uint256"}],"name":"EtherReceival","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"sender","type":"address"},{"indexed":false,"name":"src","type":"address"},{"indexed":false,"name":"dest","type":"address"},{"indexed":false,"name":"actualSrcAmount","type":"uint256"},{"indexed":false,"name":"actualDestAmount","type":"uint256"}],"name":"ExecuteTrade","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"name":"reserve","type":"address"},{"indexed":false,"name":"add","type":"bool"}],"name":"AddReserveToNetwork","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"name":"reserve","type":"address"},{"indexed":false,"name":"src","type":"address"},{"indexed":false,"name":"dest","type":"address"},{"indexed":false,"name":"add","type":"bool"}],"name":"ListReservePairs","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"name":"token","type":"address"},{"indexed":false,"name":"amount","type":"uint256"},{"indexed":false,"name":"sendTo","type":"address"}],"name":"TokenWithdraw","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"name":"amount","type":"uint256"},{"indexed":false,"name":"sendTo","type":"address"}],"name":"EtherWithdraw","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"name":"pendingAdmin","type":"address"}],"name":"TransferAdminPending","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"name":"newAdmin","type":"address"},{"indexed":false,"name":"previousAdmin","type":"address"}],"name":"AdminClaimed","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"name":"newAlerter","type":"address"},{"indexed":false,"name":"isAdd","type":"bool"}],"name":"AlerterAdded","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"name":"newOperator","type":"address"},{"indexed":false,"name":"isAdd","type":"bool"}],"name":"OperatorAdded","type":"event"}]'
const feeBurnerAbi = '[{"constant":false,"inputs":[{"name":"alerter","type":"address"}],"name":"removeAlerter","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[{"name":"","type":"address"}],"name":"reserveKNCWallet","outputs":[{"name":"","type":"address"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"rate","type":"uint256"}],"name":"setKNCRate","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[{"name":"","type":"address"},{"name":"","type":"address"}],"name":"reserveFeeToWallet","outputs":[{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"pendingAdmin","outputs":[{"name":"","type":"address"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"getOperators","outputs":[{"name":"","type":"address[]"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[{"name":"","type":"address"}],"name":"reserveFeeToBurn","outputs":[{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"taxWallet","outputs":[{"name":"","type":"address"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[{"name":"","type":"address"}],"name":"reserveFeesInBps","outputs":[{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"taxFeeBps","outputs":[{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"token","type":"address"},{"name":"amount","type":"uint256"},{"name":"sendTo","type":"address"}],"name":"withdrawToken","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"name":"newAlerter","type":"address"}],"name":"addAlerter","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[{"name":"","type":"address"}],"name":"walletFeesInBps","outputs":[{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"reserve","type":"address"},{"name":"feesInBps","type":"uint256"},{"name":"kncWallet","type":"address"}],"name":"setReserveData","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"name":"wallet","type":"address"},{"name":"feesInBps","type":"uint256"}],"name":"setWalletFees","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"name":"newAdmin","type":"address"}],"name":"transferAdmin","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[],"name":"claimAdmin","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"name":"newAdmin","type":"address"}],"name":"transferAdminQuickly","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[],"name":"getAlerters","outputs":[{"name":"","type":"address[]"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"kncPerETHRate","outputs":[{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"newOperator","type":"address"}],"name":"addOperator","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"name":"_taxFeeBps","type":"uint256"}],"name":"setTaxInBps","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"name":"operator","type":"address"}],"name":"removeOperator","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[],"name":"kyberNetwork","outputs":[{"name":"","type":"address"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"amount","type":"uint256"},{"name":"sendTo","type":"address"}],"name":"withdrawEther","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[{"name":"","type":"address"}],"name":"feePayedPerReserve","outputs":[{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"wallet","type":"address"},{"name":"reserve","type":"address"}],"name":"sendFeeToWallet","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[],"name":"knc","outputs":[{"name":"","type":"address"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"_taxWallet","type":"address"}],"name":"setTaxWallet","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"name":"reserve","type":"address"}],"name":"burnReserveFees","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[],"name":"admin","outputs":[{"name":"","type":"address"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"tradeWeiAmount","type":"uint256"},{"name":"reserve","type":"address"},{"name":"wallet","type":"address"}],"name":"handleFees","outputs":[{"name":"","type":"bool"}],"payable":false,"stateMutability":"nonpayable","type":"function"},{"inputs":[{"name":"_admin","type":"address"},{"name":"kncToken","type":"address"},{"name":"_kyberNetwork","type":"address"}],"payable":false,"stateMutability":"nonpayable","type":"constructor"},{"anonymous":false,"inputs":[{"indexed":false,"name":"reserve","type":"address"},{"indexed":false,"name":"wallet","type":"address"},{"indexed":false,"name":"walletFee","type":"uint256"}],"name":"AssignFeeToWallet","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"name":"reserve","type":"address"},{"indexed":false,"name":"burnFee","type":"uint256"}],"name":"AssignBurnFees","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"reserve","type":"address"},{"indexed":false,"name":"sender","type":"address"},{"indexed":false,"name":"quantity","type":"uint256"}],"name":"BurnAssignedFees","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"reserve","type":"address"},{"indexed":false,"name":"sender","type":"address"},{"indexed":false,"name":"taxWallet","type":"address"},{"indexed":false,"name":"quantity","type":"uint256"}],"name":"SendTaxFee","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"wallet","type":"address"},{"indexed":false,"name":"reserve","type":"address"},{"indexed":false,"name":"sender","type":"address"}],"name":"SendWalletFees","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"name":"token","type":"address"},{"indexed":false,"name":"amount","type":"uint256"},{"indexed":false,"name":"sendTo","type":"address"}],"name":"TokenWithdraw","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"name":"amount","type":"uint256"},{"indexed":false,"name":"sendTo","type":"address"}],"name":"EtherWithdraw","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"name":"pendingAdmin","type":"address"}],"name":"TransferAdminPending","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"name":"newAdmin","type":"address"},{"indexed":false,"name":"previousAdmin","type":"address"}],"name":"AdminClaimed","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"name":"newAlerter","type":"address"},{"indexed":false,"name":"isAdd","type":"bool"}],"name":"AlerterAdded","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"name":"newOperator","type":"address"},{"indexed":false,"name":"isAdd","type":"bool"}],"name":"OperatorAdded","type":"event"}]' 
const wallets = {"olympus": "0x09227deaeE08a5Ba9D6Eb057F922aDfAd191c36c",
                 "imtoken": "0xb9E29984Fe50602E7A619662EBED4F90D93824C7",
                 "trust": "0xf1aa99c69715f423086008eb9d06dc1e35cc504d",
                 "cipher": "0xDD61803d4a56C597E0fc864F7a20eC7158c6cBA5" }
const KNC_MINIMAL_TX_AMOUNT = 10
const RETRIALS = 60

const Web3 = require("web3");
const fs = require("fs");
const path = require('path');
const BigNumber = require('bignumber.js')

const url = "https://mainnet.infura.io";
const web3 = new Web3(new Web3.providers.HttpProvider(url));

let privateKey;
let account
let sender
let gasPrice
const signedTxs = [];
let nonce;
let errors = 0;
let txs = 0;
let Network
let FeeBurner

function getNetwork() {
    Network = new web3.eth.Contract(JSON.parse(NetworkAbi), NetworkAddress);
}

function get_sender(){
    try {  
        let data = fs.readFileSync(privateKeyFile, 'utf8');
        privateKey = data;
    } catch(e) {
        console.log('Error:', e.stack);
    }

    account = web3.eth.accounts.privateKeyToAccount("0x"+privateKey);
    sender = account.address;
}

function sleep(ms){
    return new Promise(resolve=>{
        setTimeout(resolve,ms)
    })
}

async function waitForTx(txHash) {
    let retrials = RETRIALS;
    while(retrials--) {
        const reciept = await web3.eth.getTransactionReceipt(txHash)
        if(reciept != null) {
            // tx is mined
            if (reciept.status == '0x1'){
                console.log("successfull tx", txHash)
            }
            else
            {
                console.log("unsuccesfull tx", txHash)
                errors++;
            }
            return;
        }
        else{
            // tx is not mined yet
            await sleep(5000)
        }
    }
}

async function sendTx(txObject) {
    txs++

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
    signedTxs.push(signedTx.rawTransaction)
    console.log("sendSignedTransaction")
    txHash = await web3.eth.sendSignedTransaction(signedTx.rawTransaction, {from:sender});
    await waitForTx(txHash.transactionHash);
}

async function enoughReserveFeesToBurn(reserve_address) {
    let reserveFeeToBurn = (await FeeBurner.methods.reserveFeeToBurn(reserve_address).call()).toLowerCase();
    console.log("reserveFeeToBurn", reserveFeeToBurn)
    return (reserveFeeToBurn.toString() >= KNC_MINIMAL_TX_AMOUNT)
}

async function enoughWalletFeesToBurn(reserve_address, wallet_address)
{
    let walletFeeToSend = (await FeeBurner.methods.reserveFeeToWallet(reserve_address, wallet_address).call()).toLowerCase();
    console.log("walletFeeToSend", walletFeeToSend)
    return (walletFeeToSend.toString() >= KNC_MINIMAL_TX_AMOUNT)
}

async function burnReservesFees(reserve_address) {
    console.log("burnReservesFees")
    let enough = await enoughReserveFeesToBurn(reserve_address);
    console.log("enough", enough)
    if (enough) {
        await sendTx(FeeBurner.methods.burnReserveFees(reserve_address));
    }
}

async function sendFeesToWallets(reserve_address) {
    console.log("sendFeesToWallets")
    for (let wallet in wallets) {
        let wallet_address = wallets[wallet];
        console.log("wallet_address", wallet_address)
        let enough = await enoughWalletFeesToBurn(reserve_address, wallet_address);
        console.log("enough", enough)
        if (enough) {
            await sendTx(FeeBurner.methods.sendFeeToWallet(wallet_address, reserve_address));
        }
    }
}

async function main() {
    getNetwork()

    get_sender()
    console.log("sender",sender);

    if (typeof gasPriceGwei != 'undefined') {
        gasPrice = BigNumber(gasPriceGwei).mul(10 ** 9);
    }
    else {
        gasPrice = await web3.eth.getGasPrice()
    }
    console.log("gasPrice", gasPrice.toString())

    nonce = await web3.eth.getTransactionCount(sender);
    console.log("nonce",nonce);
    
    let reserves = await Network.methods.getReserves().call();
    console.log("reserves",reserves);

    let feeBurnerAddress = await Network.methods.feeBurnerContract().call();
    console.log("feeBurnerAddress",feeBurnerAddress);

    FeeBurner = new web3.eth.Contract(JSON.parse(feeBurnerAbi), feeBurnerAddress);

    for (let reserve_index in reserves) {
        let reserve_address = reserves[reserve_index];
        console.log("reserve_address", reserve_address)
        await burnReservesFees(reserve_address);
        await sendFeesToWallets(reserve_address);
    }

    console.log("***** performed " + txs +" txs, " + errors + " failed *****")
    process.exit(errors)
}

process.on('unhandledRejection', console.error.bind(console))

const { gasPriceGwei, privateKeyFile } = require('yargs')
    .usage('Usage: $0 --gas-price-gwei [gwei] --private-key-file [file]')
    .demandOption(['privateKeyFile'])
    .argv;

main();
