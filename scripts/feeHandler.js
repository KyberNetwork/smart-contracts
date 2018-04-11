#!/usr/bin/env node

const KNC_MINIMAL_TX_AMOUNT = 10
const RETRIALS = 60

const solc = require("solc")
const Web3 = require("web3");
const fs = require("fs");
const path = require('path');
const BigNumber = require('bignumber.js')

const contractPath = path.join(__dirname, "../contracts/");
const input = {
    "ConversionRatesInterface.sol" : fs.readFileSync(contractPath + 'ConversionRatesInterface.sol', 'utf8'),
    "ConversionRates.sol" : fs.readFileSync(contractPath + 'ConversionRates.sol', 'utf8'),
    "PermissionGroups.sol" : fs.readFileSync(contractPath + 'PermissionGroups.sol', 'utf8'),
    "ERC20Interface.sol" : fs.readFileSync(contractPath + 'ERC20Interface.sol', 'utf8'),
    "SanityRatesInterface.sol" : fs.readFileSync(contractPath + 'SanityRatesInterface.sol', 'utf8'),
    "ExpectedRateInterface.sol" : fs.readFileSync(contractPath + 'ExpectedRateInterface.sol', 'utf8'),
    "SanityRates.sol" : fs.readFileSync(contractPath + 'SanityRates.sol', 'utf8'),
    "ExpectedRate.sol" : fs.readFileSync(contractPath + 'ExpectedRate.sol', 'utf8'),
    "Utils.sol" : fs.readFileSync(contractPath + 'Utils.sol', 'utf8'),
    "FeeBurnerInterface.sol" : fs.readFileSync(contractPath + 'FeeBurnerInterface.sol', 'utf8'),
    "VolumeImbalanceRecorder.sol" : fs.readFileSync(contractPath + 'VolumeImbalanceRecorder.sol', 'utf8'),
    "FeeBurner.sol" : fs.readFileSync(contractPath + 'FeeBurner.sol', 'utf8'),
    "WhiteListInterface.sol" : fs.readFileSync(contractPath + 'WhiteListInterface.sol', 'utf8'),
    "KyberNetwork.sol" : fs.readFileSync(contractPath + 'KyberNetwork.sol', 'utf8'),
    "WhiteList.sol" : fs.readFileSync(contractPath + 'WhiteList.sol', 'utf8'),
    "KyberReserveInterface.sol" : fs.readFileSync(contractPath + 'KyberReserveInterface.sol', 'utf8'),
    "Withdrawable.sol" : fs.readFileSync(contractPath + 'Withdrawable.sol', 'utf8'),
    "KyberReserve.sol" : fs.readFileSync(contractPath + 'KyberReserve.sol', 'utf8'),
    "Wrapper.sol" : fs.readFileSync(contractPath + 'mockContracts/Wrapper.sol', 'utf8')
};

const url = "https://mainnet.infura.io";
const web3 = new Web3(new Web3.providers.HttpProvider(url));

let privateKey;
let account
let sender
let gasPrice
let nonce;
let errors = 0;
let txs = 0;
let networkAddress;
let kncTokenAddress;
let feeBurnerAddress;
let networkContract;
let feeBurnerContract;
let kncTokenContract;
let wallets
let erc20Abi
let networkAbi
let feeBurnerAbi

function weiToEthString(wei) {
    return BigNumber(wei).div(10 ** 18).toString()
}

function kncWeiToKNCString(KNCWei) {
    return BigNumber(KNCWei).div(10 ** 18).toString()
}

function getSender(){
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
    errors++;
    return
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
    console.log("sendSignedTransaction")
    txHash = await web3.eth.sendSignedTransaction(signedTx.rawTransaction, {from:sender});
    await waitForTx(txHash.transactionHash);
}

async function enoughReserveFeesToBurn(reserveAddress) {
    let reserveFeeToBurn = (await feeBurnerContract.methods.reserveFeeToBurn(reserveAddress).call()).toLowerCase();
    console.log("reserveFeeToBurn", kncWeiToKNCString(reserveFeeToBurn))
    return (reserveFeeToBurn.toString() >= KNC_MINIMAL_TX_AMOUNT)
}

async function enoughWalletFeesToBurn(reserveAddress, walletAddress)
{
    let walletFeeToSend = (await feeBurnerContract.methods.reserveFeeToWallet(reserveAddress, walletAddress).call()).toLowerCase();
    console.log("walletFeeToSend", kncWeiToKNCString(walletFeeToSend))
    return (walletFeeToSend.toString() >= KNC_MINIMAL_TX_AMOUNT)
}

async function burnReservesFees(reserveAddress) {
    console.log("burnReservesFees")
    let enough = await enoughReserveFeesToBurn(reserveAddress);
    console.log("enough", enough)
    if (enough) {
        await sendTx(feeBurnerContract.methods.burnReserveFees(reserveAddress));
    }
}

async function sendFeesToWallets(reserveAddress) {
    console.log("sendFeesToWallets")
    for (let wallet in wallets) {
        let walletAddress = wallets[wallet];
        console.log("walletAddress", walletAddress)
        let enough = await enoughWalletFeesToBurn(reserveAddress, walletAddress);
        console.log("enough", enough)
        if (enough) {
            await sendTx(feeBurnerContract.methods.sendFeeToWallet(walletAddress, reserveAddress));
        }
    }
}

async function reserveKNCWalletDetails(reserveAddress) {
    let reserveKNCWallet = await feeBurnerContract.methods.reserveKNCWallet(reserveAddress).call();
    console.log("reserveKNCWallet", reserveKNCWallet)
 
    let reserveWalletBalance = await kncTokenContract.methods.balanceOf(reserveKNCWallet).call();
    console.log("reserveWalletBalance", kncWeiToKNCString(reserveWalletBalance));

    let reserveWalletAllowance = await kncTokenContract.methods.allowance(reserveKNCWallet, feeBurnerAddress).call();
    console.log("reserveWalletAllowance", kncWeiToKNCString(reserveWalletAllowance));
}

function getConfig() {
    try{
        content = fs.readFileSync(configPath, 'utf8');
        jsonOutput = JSON.parse(content);
        networkAddress = jsonOutput["network"]
        console.log("networkAddress", networkAddress)
        kncTokenAddress = jsonOutput["tokens"]["KNC"]["address"]
        console.log("kncTokenAddress", kncTokenAddress)
        wallets = jsonOutput["wallets"]
        console.log("wallets", wallets)
      }
      catch(err) {
        console.log(err);
        process.exit(-1)
      }
}

async function getAbis() {
    const output = await solc.compile({ sources: input }, 1);
    erc20Abi = output.contracts["ERC20Interface.sol:ERC20"].interface;
    networkAbi = output.contracts["KyberNetwork.sol:KyberNetwork"].interface;
    feeBurnerAbi = output.contracts["FeeBurner.sol:FeeBurner"].interface;
}

async function getGasPrice() {
    if (typeof gasPriceGwei != 'undefined') {
        gasPrice = BigNumber(gasPriceGwei).mul(10 ** 9);
    }
    else {
        gasPrice = await web3.eth.getGasPrice()
    }
}

async function main() {

    // get abis from compiled sources
    await getAbis()

    // get addresses from json file
    getConfig()

    // get contracts from abi and above addresses
    networkContract = new web3.eth.Contract(JSON.parse(networkAbi), networkAddress);
    kncTokenContract = new web3.eth.Contract(JSON.parse(erc20Abi), kncTokenAddress);

    // get additional addresses from contracts
    let reserves = await networkContract.methods.getReserves().call();
    console.log("reserves",reserves);
    
    feeBurnerAddress = await networkContract.methods.feeBurnerContract().call();
    console.log("feeBurnerAddress",feeBurnerAddress);

    // get additional contracts from abis and additional addresses
    feeBurnerContract = new web3.eth.Contract(JSON.parse(feeBurnerAbi), feeBurnerAddress);

    // get run specific attributes
    getSender()
    console.log("sender", sender);

    initialSenderBalance = await web3.eth.getBalance(sender)
    console.log("initialSenderBalance", weiToEthString(initialSenderBalance));

    await getGasPrice();
    console.log("gasPrice", gasPrice.toString());

    nonce = await web3.eth.getTransactionCount(sender);
    console.log("nonce",nonce);

    // burn and send fees
    for (let reserve_index in reserves) {
        let reserveAddress = reserves[reserve_index];
        console.log("reserveAddress", reserveAddress)
        await reserveKNCWalletDetails(reserveAddress)        
        await burnReservesFees(reserveAddress);
        await sendFeesToWallets(reserveAddress);
    }

    // account for spent eth
    finalSenderBalance = await web3.eth.getBalance(sender)
    ethSpentInProcess = BigNumber(initialSenderBalance).sub(finalSenderBalance)
    predictedRunsLeft =  BigNumber(finalSenderBalance).div(ethSpentInProcess).toString()

    // summary prints
    console.log("***** performed " + txs +" txs, " + errors + " failed *****")
    console.log("***** spent " + weiToEthString(ethSpentInProcess) + " ETH in the process, sender balance now " + weiToEthString(finalSenderBalance) + "ETH, expected to last " + predictedRunsLeft + " more runs *****")
    process.exit(errors)
}

process.on('unhandledRejection', console.error.bind(console))

const { configPath, gasPriceGwei, privateKeyFile } = require('yargs')
    .usage('Usage: $0 --config-path [path] --gas-price-gwei [gwei] --private-key-file [file]')
    .demandOption(['privateKeyFile', 'configPath'])
    .argv;

main();
