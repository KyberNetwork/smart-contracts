//web3 modules
const Web3 = require('web3');
const fs = require('fs');
const assert = require('assert');
const solc = require('solc');
const compareVersions = require('compare-versions');

//contract sources
const contractPath = "../contracts/";

var input = {
    "ConversionRatesInterface.sol" : fs.readFileSync(contractPath + 'ConversionRatesInterface.sol', 'utf8'),
    "ConversionRates.sol" : fs.readFileSync(contractPath + 'ConversionRates.sol', 'utf8'),
    "PermissionGroups.sol" : fs.readFileSync(contractPath + 'PermissionGroups.sol', 'utf8'),
    "ERC20Interface.sol" : fs.readFileSync(contractPath + 'ERC20Interface.sol', 'utf8'),
    "MockERC20.sol" : fs.readFileSync(contractPath + 'mockContracts/MockERC20.sol', 'utf8'),
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
};

//global
let solcOutput;
let web3 = new Web3();

const mainnetPublicNode = 'https://mainnet.infura.io';
const kovanPublicNode = 'https://kovan.infura.io';
const ropstenPublicNode = 'https://ropsten.infura.io';

let infuraUrl = '';

const ethAddress = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

//tx values
//let tokenAdd, traderAdd;
//let isBuy;
//let tradeQty;
let txHash;
let blockNumber;
let kyberNetworkAdd = '';
let expectedRateAdd;
let addressesToNames = {};

//contract instances
let tokenInst;
let NetWorkInst;
let expectedInst;
let numBlocksToGoBack = 40;


//run the code
main();

async function main (){
    if (processScriptInputParams() == false) {
        printHelp();
        return;
    }

    await init(infuraUrl);

    console.log()

    await getCompiledContracts();

    await processTransaction(txHash);
}


async function processTransaction(txHash){

    let txData  = await web3.eth.getTransaction(txHash);

    blockNumber = txData.blockNumber;
    kyberNetworkAdd = txData.to;

    let traderAdd = txData.from;

    let msgEthValue = web3.utils.toBN(txData.value);
    let gasPrice = txData.gasPrice;
    let input = txData.input;

    let srcTokenAdd = '0x' + input.slice(34, 74);
    let tradeQty = web3.utils.toBN('0x' + input.slice(74, 138));
    let dstTokenAdd = '0x' + input.slice(162, 202);
    let maxDestAmount = web3.utils.toBN('0x' + input.slice(266, 330));
    let minConvRate = web3.utils.toBN('0x' + input.slice(330, 394));
    let walletAdd = '0x' + input.slice(418, 458);
    let errString = '';
    let isBuy;

    let tokAdd;

    if (srcTokenAdd == ethAddress) {
        isBuy = true;
        tokAdd = dstTokenAdd;
    } else {
        if (dstTokenAdd != ethAddress) {
            errString = 'both trade sides are tokens.';
        }
        isBuy = false;
        tokAdd = srcTokenAdd;
    }

    errString += await checkBalances (tokAdd, traderAdd, blockNumber, tradeQty, msgEthValue, isBuy);

    let err = await checkMinConversionRate(blockNumber, srcTokenAdd, dstTokenAdd, tradeQty, minConvRate);

    errString += err;

    if (errString == '') errString = "no issue found";

    console.log("block   token buy  qty\t\t      result");

    console.log(blockNumber + " " + a2n(tokAdd, 0) + "   " + isBuy + " " + tradeQty + " " + errString);

    if (err != '') {
        console.log();
        console.log();
        await checkPrevBlockExpectedRate(blockNumber, srcTokenAdd, dstTokenAdd, tradeQty, minConvRate, numBlocksToGoBack)
    }
}

const solcOutputPath = "./solcOuput.json";
async function getCompiledContracts() {
    try{
        solcOutput = JSON.parse(fs.readFileSync(solcOutputPath, 'utf8'));
    } catch(err) {
        console.log(err.toString());
        console.log("starting compilation");
        solcOutput = await solc.compile({ sources: input }, 1);
        //    console.log(solcOutput);
        console.log("finished compilation");
        let solcOutJson = JSON.stringify(solcOutput, null, 2);
        fs.writeFileSync(solcOutputPath, solcOutJson, function(err) {
            if(err) {
                return console.log(err);
            }

            console.log("Saved solc output to: " + solcOutputPath);
        });
    }
}

//functions
///////////
function processScriptInputParams() {
    if (process.argv.length < 4) {
        console.log('');
        console.log("error: not enough argument. Required 2. Received  " + (process.argv.length - 2) + " arguments.");
        return false;
    }

    switch (process.argv[2]){
        case 'm':
            infuraUrl = mainnetPublicNode;
            break;
        case 'k':
            infuraUrl = kovanPublicNode;
            break;
        case 'r':
            infuraUrl = ropstenPublicNode;
            break;
        default: {
            console.log('');
            console.log("error: invalid 1st parameter: " + process.argv[2]);
            return false;
        }
    }

    txHash = process.argv[3];

    if (!web3.utils.isHex(txHash)){
        console.log("Illegal tx Hash input (not hex): " + txHash);
        return false;
    }

    if (txHash.length != 66){
        console.log("Illegal tx Hash input: " + txHash + ",  wrong size: " + txHash.length);
        return false;
    }

}

function printHelp () {
    console.log("usage: \'node debugFailTx network txHash\'.");
    console.log("network options: m (mainnet) / r (ropsten) / k (kovan).");
}

haveTokenInst = 0;

async function checkBalances(tokenAdd, traderAdd, blockNumber, tradeQty, msgEthValue, isBuy) {
    let errString = '';

    let abi = solcOutput.contracts["MockERC20.sol:MockERC20"].interface;
    tokenInst = await new web3.eth.Contract(JSON.parse(abi), tokenAdd);

    // check to see if token balance changed in this block. if it did. its trade success.
    txData = await tokenInst.methods.balanceOf(traderAdd).encodeABI();
    let tokenBalance = web3.utils.toBN(await web3.eth.call({to:tokenAdd, data:txData}, blockNumber));
    let prevTokenBalance = web3.utils.toBN(await web3.eth.call({to:tokenAdd, data:txData}, (blockNumber - 1)));

    if (tokenBalance.cmp(prevTokenBalance) == 0) {
        errString += "Trade failed. ";
    }

    if (isBuy) {
        let userBalance = web3.utils.toBN('0x' + await web3.eth.getBalance(traderAdd, blockNumber).valueOf());
        let prevBalance = web3.utils.toBN('0x' + await web3.eth.getBalance(traderAdd, (blockNumber - 1)).valueOf());
//        console.log("current balance: " + userBalance.toString(16) + "\nprev block balance: " + prevBalance.toString(16));
        if(tradeQty.gt(prevBalance)) errString += " user eth balance: " + prevBalance.toString(16) + " < Trade qty: " + tradeQty.toString(16);
        if(msgEthValue.cmp(tradeQty) != 0) errString += (" Trade qty not equal msg value.");
        //make sure reserve has enough tokens.

    } else {
        let txData = await tokenInst.methods.allowance(traderAdd, kyberNetworkAdd).encodeABI();
        let allowance = web3.utils.toBN(await web3.eth.call({to:tokenAdd, data:txData}, (blockNumber)));

        if (msgEthValue != 0) errString += "Bad msg value: " + msgEthValue + " expected 0";
        if(tradeQty.gt(allowance)) errString += " Allowance: " + allowance + " < trade qty: " + tradeQty;

        //use token balance of previous block. this blocks balance reflects operations in this block as well.
        if (tradeQty.gt(prevTokenBalance)) errString += " Token balance: " + prevTokenBalance.toString(16) +  " < Trade qty: " + tradeQty.toString(16);
    }

    return errString;
}

async function checkMinConversionRate(blockNumber, src, dest, tradeQty, minConversionRate) {
    let errString = '';

    let abi = solcOutput.contracts["KyberNetwork.sol:KyberNetwork"].interface;
    NetWorkInst = await new web3.eth.Contract(JSON.parse(abi), kyberNetworkAdd);

    expectedRateAdd = await NetWorkInst.methods.expectedRateContract().call();
    abi = solcOutput.contracts["ExpectedRate.sol:ExpectedRate"].interface;
//    console.log("expectedRateAdd: " + expectedRateAdd);
    expectedInst = await new web3.eth.Contract(JSON.parse(abi), expectedRateAdd);

    let txData = await expectedInst.methods.getExpectedRate(src, dest, tradeQty).encodeABI();
    let rates = await web3.eth.call({to:expectedRateAdd, data:txData}, (blockNumber - 1));
    let expectedRate = web3.utils.toBN(rates.slice(0, 66));
    let slippageRate = web3.utils.toBN('0x' + rates.slice(66));

//    console.log("expectedRate: " + expectedRate.toString(16) + " slippageRate: " + slippageRate.toString(16));


    if (minConversionRate.gt(expectedRate)) {
        errString += "Min conversion rate too high. Min rate: " + minConversionRate.toString(16) +
            " current rate: " + expectedRate.toString(16);

    }

    return errString;
}

async function checkPrevBlockExpectedRate(blockNumber, src, dest, tradeQty, minConversionRate, goBackNumBlocks) {

    let block;
    //run back in blocks to find where this was the expected rate
    let prevExRate = 0;
    let prevSlipRate = 0;
    console.log("block \t expected\t      slippage");
    let txData = await expectedInst.methods.getExpectedRate(src, dest, tradeQty).encodeABI();

    for (block = blockNumber; block > (blockNumber - goBackNumBlocks); block--) {
        let rates = await web3.eth.call({to:kyberNetworkAdd, data:txData}, block);
        expectedRate = web3.utils.toBN(rates.slice(0, 66));
        slippageRate = web3.utils.toBN('0x' + rates.slice(66));

        if ((expectedRate.cmp(prevExRate) != 0) || (slippageRate.cmp(prevSlipRate) != 0)) {
            console.log(block + "  " + expectedRate.toString(16) + "  " + slippageRate.toString(16));
        }
        prevSlipRate = slippageRate;
        prevExRate = expectedRate;
        if ((slippageRate.cmp(minConversionRate) == 0)) {
            console.log("When going back: " + (blockNumber - block).toString(10) + " can find slippage rate same as min rate set.");
            break;
        }
    }
    console.log();
    console.log("done traversing blocks, down to: " + block);
}


async function init(nodeUrl){
    //web3 instance

    web3.setProvider(new Web3.providers.HttpProvider(nodeUrl));

    let goodVersion = compareVersions('1.0', web3.version);
    if (goodVersion < 0) {
        console.log("bad web3 version. Please install version 1.0 or higher.");
    }

    console.log(("web 3 version " + web3.version));
    let isListening;
    try {
        isListening = await web3.eth.net.isListening();
    } catch (e) {
        console.log(("can't connect to node: " + nodeUrl + ". check your internet connection. Or possibly check status of this node."));
        console.log(("exception: " + e));
        throw(e);
    }
    numPeers = await web3.eth.net.getPeerCount();
    console.log(( "node " + nodeUrl + " listening: " + isListening.toString() + " with " + numPeers + " peers"));

    //token names. enable translation. address to name
    for (let key in tokenDict.tokens) {
        let tokenData = tokenDict.tokens[key];
        let symbol = key;
        let address = tokenData['address'];
        addressesToNames[address.toLowerCase()] = symbol;
    }
};


async function findTxInBlock(blockNumber, myAddress){
    let block = await web3.eth.getBlock(blockNumber, true);
    let txs = [];

    if (block != null && block.transactions != null) {

        block.transactions.forEach( function(txData) {
            if (myAddress == "*" || myAddress == txData.from || myAddress == txData.to) {
                console.log("Found tx in block: " + blockNumber + " from: " + block.timestamp + " " +
                    new Date(block.timestamp * 1000).toGMTString());
                txs.push(txData);
            }
        });
    }

    return txs;
};


async function getTransactionsByAddress(myAddress, startBlockNumber, endBlockNumber) {
    if (endBlockNumber == null) {
        endBlockNumber = await web3.eth.blockNumber;
        console.log("Using endBlockNumber: " + endBlockNumber);
    }
    if (startBlockNumber == null) {
        startBlockNumber = endBlockNumber - 1000;
        console.log("Using startBlockNumber: " + startBlockNumber);
    }
    console.log("Searching for transactions to/from account \"" + myAddress + "\" within blocks "  + startBlockNumber + " and " + endBlockNumber);

    for (let i = startBlockNumber; i <= endBlockNumber; i++) {
        if (i % 1000 == 0) {
            console.log("Searching block " + i);
        }

    }
}

//address to name
function a2n(address, showAddWithName) {
    let name;
    try {
        name =  addressesToNames[address.toLowerCase()];
        if (showAddWithName == 1) {
            name += " " + address.toLowerCase();
        }
    } catch(e) {
        name = address;
    }

    return name;
}

const tokenDict = {
  "tokens": {
    "OMG": {
      "address": "0xd26114cd6EE289AccF82350c8d8487fedB8A0C07",
    },
    "KNC": {
      "address": "0xdd974D5C2e2928deA5F71b9825b8b646686BD200",
    },
    "EOS": {
      "address": "0x86Fa049857E0209aa7D9e616F7eb3b3B78ECfdb0",
    },
    "SALT": {
      "address": "0x4156D3342D5c385a87D264F90653733592000581",
    },
    "SNT": {
      "address": "0x744d70fdbe2ba4cf95131626614a1763df805b9e",
    },
    "ETH": {
      "address": "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
    },
    "ELF": {
      "address": "0xbf2179859fc6d5bee9bf9158632dc51678a4100e",
    },
    "POWR": {
      "address": "0x595832f8fc6bf59c85c527fec3740a1b7a361269",
    },
    "MANA": {
      "address": "0x0f5d2fb29fb7d3cfee444a200298f468908cc942",
    },
    "BAT": {
      "address": "0x0d8775f648430679a709e98d2b0cb6250d2887ef",
    },
    "REQ": {
      "address": "0x8f8221afbb33998d8584a2b05749ba73c37a938a",
    },
    "GTO": {
      "address": "0xc5bbae50781be1669306b9e001eff57a2957b09d",
    }
  }
};