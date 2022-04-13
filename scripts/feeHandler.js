#!/usr/bin/env node

const KNC_MINIMAL_TX_AMOUNT = 100
const RETRIALS = 60

const solc = require("solc")
const Web3 = require("web3");
const fs = require("fs");
const path = require('path');
const BigNumber = require('bignumber.js')

const contractPath = path.join(__dirname, "../contracts/");
const wrapperContractPath = path.join(__dirname, "../contracts/wrapperContracts/");
const input = {
    "ConversionRatesInterface.sol" : fs.readFileSync(contractPath + 'ConversionRatesInterface.sol', 'utf8'),
    "ConversionRates.sol" : fs.readFileSync(contractPath + 'ConversionRates.sol', 'utf8'),
    //  "LiquidityConversionRates.sol" : fs.readFileSync(contractPath + 'LiquidityConversionRates.sol', 'utf8'),
    //  "LiquidityFormula.sol" : fs.readFileSync(contractPath + 'LiquidityFormula.sol', 'utf8'),
    "PermissionGroups.sol" : fs.readFileSync(contractPath + 'PermissionGroups.sol', 'utf8'),
    "ERC20Interface.sol" : fs.readFileSync(contractPath + 'ERC20Interface.sol', 'utf8'),
    "MockERC20.sol" : fs.readFileSync(contractPath + 'mockContracts/MockERC20.sol', 'utf8'),
    "SanityRatesInterface.sol" : fs.readFileSync(contractPath + 'SanityRatesInterface.sol', 'utf8'),
    "ExpectedRateInterface.sol" : fs.readFileSync(contractPath + 'ExpectedRateInterface.sol', 'utf8'),
    "SanityRates.sol" : fs.readFileSync(contractPath + 'SanityRates.sol', 'utf8'),
    "ExpectedRate.sol" : fs.readFileSync(contractPath + 'ExpectedRate.sol', 'utf8'),
    "Utils.sol" : fs.readFileSync(contractPath + 'Utils.sol', 'utf8'),
    "Utils2.sol" : fs.readFileSync(contractPath + 'Utils2.sol', 'utf8'),
    "FeeBurnerInterface.sol" : fs.readFileSync(contractPath + 'FeeBurnerInterface.sol', 'utf8'),
    "VolumeImbalanceRecorder.sol" : fs.readFileSync(contractPath + 'VolumeImbalanceRecorder.sol', 'utf8'),
    "FeeBurner.sol" : fs.readFileSync(contractPath + 'FeeBurner.sol', 'utf8'),
    "WhiteListInterface.sol" : fs.readFileSync(contractPath + 'WhiteListInterface.sol', 'utf8'),
    "NimbleNetwork.sol" : fs.readFileSync(contractPath + 'NimbleNetwork.sol', 'utf8'),
    "NimbleNetworkInterface.sol" : fs.readFileSync(contractPath + 'NimbleNetworkInterface.sol', 'utf8'),
    "SimpleNetworkInterface.sol" : fs.readFileSync(contractPath + 'SimpleNetworkInterface.sol', 'utf8'),
    "NimbleNetworkProxyInterface.sol" : fs.readFileSync(contractPath + 'NimbleNetworkProxyInterface.sol', 'utf8'),
    "NimbleNetworkProxy.sol" : fs.readFileSync(contractPath + 'NimbleNetworkProxy.sol', 'utf8'),
    "WhiteList.sol" : fs.readFileSync(contractPath + 'WhiteList.sol', 'utf8'),
    "NimbleReserveInterface.sol" : fs.readFileSync(contractPath + 'NimbleReserveInterface.sol', 'utf8'),
    "Withdrawable.sol" : fs.readFileSync(contractPath + 'Withdrawable.sol', 'utf8'),
    "NimbleReserve.sol" : fs.readFileSync(contractPath + 'NimbleReserve.sol', 'utf8'),
    "NimbleReserveV1.sol" : fs.readFileSync(contractPath + 'previousContracts/NimbleReserveV1.sol', 'utf8'),
    "WrapConversionRate.sol" : fs.readFileSync(contractPath + 'wrapperContracts/WrapConversionRate.sol', 'utf8'),
    "WrapFeeBurner.sol" : fs.readFileSync(contractPath + 'wrapperContracts/WrapFeeBurner.sol', 'utf8'),
    "WrapperBase.sol" : fs.readFileSync(contractPath + 'wrapperContracts/WrapperBase.sol', 'utf8'),
    "WrapReadTokenData.sol" : fs.readFileSync(contractPath + 'wrapperContracts/WrapReadTokenData.sol', 'utf8'),
    /*    permission less order book reserve */
    "OrderList.sol" : fs.readFileSync(contractPath + 'permissionless/OrderList.sol', 'utf8'),
    "OrderListInterface.sol" : fs.readFileSync(contractPath + 'permissionless/OrderListInterface.sol', 'utf8'),
    "OrderListFactoryInterface.sol" : fs.readFileSync(contractPath + 'permissionless/OrderListFactoryInterface.sol', 'utf8'),
    "OrderIdManager.sol" : fs.readFileSync(contractPath + 'permissionless/OrderIdManager.sol', 'utf8'),
    "OrderbookReserve.sol" : fs.readFileSync(contractPath + 'permissionless/OrderbookReserve.sol', 'utf8'),
    "OrderbookReserveInterface.sol" : fs.readFileSync(contractPath + 'permissionless/OrderbookReserveInterface.sol', 'utf8'),
    "PermissionlessOrderbookReserveLister.sol" : fs.readFileSync(contractPath + 'permissionless/PermissionlessOrderbookReserveLister.sol', 'utf8'),
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
let feeBurnerWrapperAddress;
let networkContract;
let feeBurnerContract;
let kncTokenContract;
let feeBurnerWrapperContract;
let wallets;
let feeSharingWallets;
let erc20Abi;
let networkAbi;
let feeBurnerAbi;
let feeBurnerWrapperAbi;

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
                console.log()
                console.log()
                console.log("unsuccesfull tx", txHash)
                console.log()
                console.log()
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

async function enoughWalletFeesToSend(reserveAddress, walletAddress)
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

function getAllWalletAddresses() {
    let walletAddresses = [];
    for (let wallet in wallets) {
        walletAddresses.push(wallets[wallet]);
    }
    for (let walletIndex in feeSharingWallets) {
        walletAddresses.push(feeSharingWallets[walletIndex]);
    }
    return walletAddresses;
}

async function sendFeesToWallets(reserveAddress) {
    console.log("sendFeesToWallets")
    walletAddresses = getAllWalletAddresses()
    for (let walletAddressIndex in walletAddresses) {
        walletAddress = walletAddresses[walletAddressIndex]
        console.log("walletAddress", walletAddress)
        let enough = await enoughWalletFeesToSend(reserveAddress, walletAddress);
        console.log("enough", enough)
        if (enough) {
            await sendTx(feeBurnerContract.methods.sendFeeToWallet(walletAddress, reserveAddress));
        }
    }
}

async function validateReserveKNCWallet(reserveAddress) {
    console.log("validateReserveKNCWallet")

    let reserveKNCWallet = await feeBurnerContract.methods.reserveKNCWallet(reserveAddress).call();
    console.log("reserveKNCWallet", reserveKNCWallet)
 
    let reserveWalletBalance = await kncTokenContract.methods.balanceOf(reserveKNCWallet).call();
    console.log("reserveWalletBalance", kncWeiToKNCString(reserveWalletBalance));

    let reserveWalletAllowance = await kncTokenContract.methods.allowance(reserveKNCWallet, feeBurnerAddress).call();
    console.log("reserveWalletAllowance", kncWeiToKNCString(reserveWalletAllowance));

    let walletUsableKnc = BigNumber.min(reserveWalletAllowance, reserveWalletBalance)
    console.log("walletUsableKnc", kncWeiToKNCString(walletUsableKnc));

    let totalFeesToBurnAndSend
    let reserveFeeToBurn = await feeBurnerContract.methods.reserveFeeToBurn(reserveAddress).call();
    console.log("reserveFeeToBurn", kncWeiToKNCString(reserveFeeToBurn))
    totalFeesToBurnAndSend = reserveFeeToBurn

    walletAddresses = getAllWalletAddresses()
    for (let walletAddressIndex in walletAddresses) {
        walletAddress = walletAddresses[walletAddressIndex];
        console.log("walletAddress", walletAddress)
        let walletFeeToSend = await feeBurnerContract.methods.reserveFeeToWallet(reserveAddress, walletAddress).call();
        console.log("walletFeeToSend", kncWeiToKNCString(walletFeeToSend))
        totalFeesToBurnAndSend = BigNumber(totalFeesToBurnAndSend).add(walletFeeToSend)
    }
    console.log("totalFeesToBurnAndSend", kncWeiToKNCString(totalFeesToBurnAndSend))

    if (BigNumber(walletUsableKnc).lt(totalFeesToBurnAndSend))
    {
        console.log()
        console.log()
        console.log("validation error. walletUsableKnc " + kncWeiToKNCString(walletUsableKnc) + " is less than totalFeesToBurnAndSend " + kncWeiToKNCString(totalFeesToBurnAndSend))
        console.log()
        console.log()
        errors += 1
        return false
    }
    return true
}

function getConfig() {
    try{
        content = fs.readFileSync(configPath, 'utf8');
        jsonOutput = JSON.parse(content);
        networkAddress = jsonOutput["internal network"]
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
    networkAbi = output.contracts["NimbleNetwork.sol:NimbleNetwork"].interface;
    feeBurnerAbi = output.contracts["FeeBurner.sol:FeeBurner"].interface;
    feeBurnerWrapperAbi = output.contracts["WrapFeeBurner.sol:WrapFeeBurner"].interface;
}

async function getGasPrice() {
    if (typeof gasPriceGwei != 'undefined') {
        gasPrice = BigNumber(gasPriceGwei).mul(10 ** 9);
    }
    else {
        gasPrice = parseInt((await web3.eth.getGasPrice()) * 1.3);
    }
}

async function doMain() {

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

    // get fee burner wrapper (admin of from fee burner wrapper)
    feeBurnerWrapperAddress = await feeBurnerContract.methods.admin().call();
    console.log("feeBurnerWrapperAddress", feeBurnerWrapperAddress);
    feeBurnerWrapperContract = new web3.eth.Contract(JSON.parse(feeBurnerWrapperAbi), feeBurnerWrapperAddress);

    feeSharingWallets = await feeBurnerWrapperContract.methods.getFeeSharingWallets().call();
    console.log("feeSharingWallets", feeSharingWallets);

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
        console.log();
        console.log("reserveAddress", reserveAddress)
        console.log("-------------------------------------");
        canHandleReserve = await validateReserveKNCWallet(reserveAddress)
        if (canHandleReserve) {
            await burnReservesFees(reserveAddress);
            await sendFeesToWallets(reserveAddress);
        }
    }

    // account for spent eth
    finalSenderBalance = await web3.eth.getBalance(sender)
    ethSpentInProcess = BigNumber(initialSenderBalance).sub(finalSenderBalance)
    predictedRunsLeft =  BigNumber(finalSenderBalance).div(ethSpentInProcess).toString()

    // summary prints
    console.log("***** performed " + txs +" txs, got " + errors + " errors *****")
    console.log("***** spent " + weiToEthString(ethSpentInProcess) + " ETH in the process, sender balance now " + weiToEthString(finalSenderBalance) + "ETH, expected to last " + predictedRunsLeft + " more runs *****")
    process.exit(errors)
}

async function main() {
    try {
        await doMain();
    }
    catch(err) {
       console.log("caught an exception: " + err)
       process.exit(1)
    }
}

process.on('unhandledRejection', console.error.bind(console))

const { configPath, gasPriceGwei, privateKeyFile } = require('yargs')
    .usage('Usage: $0 --config-path [path] --gas-price-gwei [gwei] --private-key-file [file]')
    .demandOption(['privateKeyFile', 'configPath'])
    .argv;

main();
