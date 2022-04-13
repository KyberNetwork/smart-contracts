//web3 modules
const Web3 = require('web3');

//general purpose npm moudles
const fs = require('fs');
const assert = require('assert');
const solc = require('solc');

const utils = require("./utils.js");
const myLog = utils.myLog;
const a2n = utils.a2n;
const addName2Add = utils.addName2Add;
const getNameFromAdd = utils.getNameFromAdd;

process.on('unhandledRejection', console.error.bind(console))




//// for using this script set data here
////////////////////////////////////////

const conversionRateAddress = '';
const wrapConversionRate = ''
const chain = ''; // r = ropsten, m = mainnet, k = kovan
let evmNodeUrl = '';

//////////////////////////////////
/////////////////////////////////

//contract sources
const contractPath = "../contracts/";

const input = {
    "ConversionRatesInterface.sol" : fs.readFileSync(contractPath + 'ConversionRatesInterface.sol', 'utf8'),
    "reserves/VolumeImbalanceRecorder.sol" : fs.readFileSync(contractPath + 'reserves/VolumeImbalanceRecorder.sol', 'utf8'),
    "ConversionRates.sol" : fs.readFileSync(contractPath + 'reserves/fprConversionRate/ConversionRates.sol', 'utf8'),
    "VolumeImbalanceRecorder.sol" : fs.readFileSync(contractPath + 'reserves/VolumeImbalanceRecorder.sol', 'utf8'),
    "reserves/fprConversionRate/ConversionRates.sol" : fs.readFileSync(contractPath + 'reserves/fprConversionRate/ConversionRates.sol', 'utf8'),
    "PermissionGroups.sol" : fs.readFileSync(contractPath + 'PermissionGroups.sol', 'utf8'),
    "ERC20Interface.sol" : fs.readFileSync(contractPath + 'ERC20Interface.sol', 'utf8'),
    "MockERC20.sol" : fs.readFileSync(contractPath + 'mock/MockERC20.sol', 'utf8'),
//    "SanityRatesInterface.sol" : fs.readFileSync(contractPath + 'SanityRatesInterface.sol', 'utf8'),
    "Utils.sol" : fs.readFileSync(contractPath + 'Utils.sol', 'utf8'),
    "Utils2.sol" : fs.readFileSync(contractPath + 'Utils2.sol', 'utf8'),
    "NimbleReserveInterface.sol" : fs.readFileSync(contractPath + 'NimbleReserveInterface.sol', 'utf8'),
    "Withdrawable.sol" : fs.readFileSync(contractPath + 'Withdrawable.sol', 'utf8'),
//    "NimbleReserve.sol" : fs.readFileSync(contractPath + 'NimbleReserve.sol', 'utf8'),
    "WrapConversionRate.sol" : fs.readFileSync(contractPath + 'wrappers/WrapConversionRate.sol', 'utf8'),
    "WrapperBase.sol" : fs.readFileSync(contractPath + 'wrappers/WrapperBase.sol', 'utf8'),
    "WrapReadTokenData.sol" : fs.readFileSync(contractPath + 'wrappers/WrapReadTokenData.sol', 'utf8'),
    /*    permission less order book reserve */
};

let solcOutput;

const ethAddress = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';



const ropstenReaderAddress = '0x6D3CbB74C9ad8be2d1aCa76d1156F6B3C9cF88CC';
const mainNetReaderAddress = '0x7FA7599413E53dED64b587cc5a607c384f600C66';
//
// code
////////
////////
const mainnetUrls = ['https://mainnet.infura.io',
                     'https://api.mycryptoapi.com/eth',
                     'https://api.myetherapi.com/eth',
                     'https://mew.giveth.io/'];

const kovanPublicNode = 'https://kovan.infura.io';
const ropstenPublicNode = 'https://ropsten.infura.io';

let tokenReaderAddress = '';

if (chain == 'r') {
    tokenReaderAddress = ropstenReaderAddress;
    evmNodeUrl = ropstenPublicNode;
} else if (chain == 'm') {
    tokenReaderAddress = mainNetReaderAddress;
    evmNodeUrl = mainnetUrls[0];
}

const localURL = 'http://localhost';
const solcOutputPath = "./solcOuput.json";
let deployInputJsonPath = '';

let conversionRateContract;

//run the code
main();

async function main(){

    if((chain == '') && (evmNodeUrl == '')) {
        myLog(0, 1, "please open this file and update settings in line 21")
        myLog(0, 1, "must choose which chain to use. (mainnet, ropsten, kovan, etc,,,")
        myLog(0, 1, "Alternatively can set must choose which chain to use. (mainnet, ropsten, kovan, etc,,,")
        return;
    }

    if(conversionRateAddress == '') {
        myLog(0, 1, "please open this file and update settings in line 21")
        myLog(0, 1, "must set conversion rate address to analyze.")
        return;
    }

    myLog(0, 1, 'notice, by default this script uses a public node with limited query rate')
    myLog(0, 1, 'If you have a non limited node URL, please open file and set evmNodeUrl')

    await getCompiledContracts();

    await init(evmNodeUrl);

    await readConversionRate(conversionRateAddress);

    myLog(0, 1, "")
    myLog(0, 1, "")
    myLog(0, 1, "And thats all for now folks")
}

let haveTokenReader;
let tokensPerReserve;

async function readConversionRate(conversionRateAddress) {
    try {
        let abi = solcOutput.contracts["ConversionRates.sol:ConversionRates"].interface;
        conversionRatesABI = JSON.parse(abi);
    } catch (e) {
        myLog(0, 0, e);
        throw e;
    }

    try {
        let abi = solcOutput.contracts["WrapReadTokenData.sol:WrapReadTokenData"].interface;
        wrapReadTokenDataABI = JSON.parse(abi);
    } catch (e) {
        myLog(0, 0, e);
        throw e;
    }

    if (tokenReaderAddress != '') {
        tokenReader = await new web3.eth.Contract(wrapReadTokenDataABI, tokenReaderAddress);
        haveTokenReader = true;
    } else {
        haveTokenReader = false;
    }

    conversionRateContract = await new web3.eth.Contract(conversionRatesABI, conversionRateAddress);
    Rate = conversionRateContract;

    myLog(0, 0, '');
    myLog(0, 0, ("Conversion Rate address: " +  conversionRateAddress));
    myLog(0, 0, ("--------------------------------------------------------------------"));

    //verify binary as expected.
    let blockCode = await web3.eth.getCode(conversionRateAddress);
    let solcCode = '0x' + (solcOutput.contracts["ConversionRates.sol:ConversionRates"].runtimeBytecode);

    if (blockCode != solcCode){
//        myLog(1, 0, "blockchain Code:");
//        myLog(0, 0, blockCode);
        myLog(0, 1, "Byte code from block chain doesn't match conversion rate. checking liquidity conversion rate.")
//        await readLiquidityConversionRate(conversionRateAddress, reserveAddress, index, isNimbleReserve);
//        return;
    } else {
        myLog(0, 0, "Code on blockchain matches locally compiled code");
         myLog(0, 0, '');
    }

    if (wrapConversionRate != '') {
        //verify wrapper binary
        let admin = (await Rate.methods.admin().call()).toLowerCase();
        myLog((admin != jsonWrapConversionRate), 0, "Admin is wrapper contract: " + (admin == jsonWrapConversionRate));
        await readConversionRateWrapper(jsonWrapConversionRate);
    }

//    if(isNimbleReserve) await printAdminAlertersOperators(Rate, "ConversionRates");

    let validRateDurationInBlocks = await Rate.methods.validRateDurationInBlocks().call();
    myLog(0, 0, ("validRateDurationInBlocks: " + validRateDurationInBlocks));
    let reserveContractAdd = (await Rate.methods.reserveContract().call()).toLowerCase();
    myLog(0, 0, ("reserveContract: " + reserveContractAdd));
    tokensPerReserve = await Rate.methods.getListedTokens().call();
    let numTokens = tokensPerReserve.length;
    let toks = tokensPerReserve;
    let tokNames = '';
    toks.forEach(async function(name){
        tokNames += await a2n(name, true, true, solcOutput) + " ";
    });

    myLog(0, 0, "token list: " + tokNames);
    myLog(0, 0, "token per reserve: " + tokensPerReserve);

    myLog(0, 0, "");
    myLog(0, 0, "");
    myLog(0, 0, ("Fetch data per token "));
    myLog(0, 0, "---------------------");

    for (let i = 0; i < numTokens; i++) {
        await readTokenDataInConversionRate(conversionRateAddress, tokensPerReserve[i]);
    }
};

async function readTokenDataInConversionRate(conversionRateAddress, tokenAdd) {
    let Rate = conversionRateContract;
    tokenAdd = tokenAdd.toLowerCase();
    let someStepsNotSet = false;

    myLog(0, 0, '');

    myLog(0, 0, ("token " + await a2n(tokenAdd, 1, true, solcOutput)));
    myLog(0, 0, ("-----------------------------------------------"));
    let basic = await Rate.methods.getTokenBasicData(tokenAdd).call();
    myLog((basic[0] == false), (basic[1] == false), ("listed = " + basic[0] + ". Enabled = " + basic[1]));

    //read imbalance info
    let tokenName = await a2n(tokenAdd, 0);
    let tokenDict = {};

    let controlInfo = await Rate.methods.getTokenControlInfo(tokenAdd).call();
    //print resolution data
    myLog(0, 0, ("minRecordResolution: " + controlInfo[0] + " = " +
        await getAmountTokens(controlInfo[0], tokenAdd) + " tokens."));

    //print max per block data
    myLog(0, 0, ("maxPerBlockImbalance: " + controlInfo[1] + " = " +
        await getAmountTokens(controlInfo[1], tokenAdd) + " tokens."));
    tokenDict['maxPerBlockImbalance'] = controlInfo[1].valueOf();

    //print max total imbalance data
    myLog(0, 0, ("maxTotalImbalance: " + controlInfo[2] + " = " +
        await getAmountTokens(controlInfo[2], tokenAdd) + " tokens."));
    tokenDict['maxTotalImbalance'] = controlInfo[2].valueOf();

    // get compact data
    let compactData = await Rate.methods.getCompactData(tokenAdd).call();

    myLog(0, 1, '');
    myLog(0, 1, 'compactData');
    myLog(0, 0, "compact data array index: " + compactData[0]);
    myLog(0, 0, "compact data field index: " + compactData[1]);
    myLog(0, 0, "compact data buy byte value: " + compactData[2]);
    myLog(0, 0, "compact data sell byte value: " + compactData[3]);

    // rate update block
    let rateUpdateBlock = await Rate.methods.getRateUpdateBlock(tokenAdd).call();

    myLog(0, 0, "rate update block: " + rateUpdateBlock);

    if (haveTokenReader) {
        let values = await tokenReader.methods.readQtyStepFunctions(conversionRateAddress, tokenAdd).call();
        for (let i = 0; i < values[1].length; i++) {
            values[1][i] = await getAmountTokens(values[1][i], tokenAdd);
        }
        for (let i = 0; i < values[4].length; i++) {
            values[4][i] = await getAmountTokens(values[4][i], tokenAdd);
        }
        myLog(values[1].length < 1, 0, ("buyRateQtyStepFunction X: " + values[1]));
        myLog(values[2].length < 1, 0, ("buyRateQtyStepFunction Y: " + values[2]));
        myLog(values[4].length < 1, 0, ("sellRateQtyStepFunction X: " + values[4]));
        myLog(values[5].length < 1, 0, ("sellRateQtyStepFunction Y: " + values[5]));

        if(values[1].length < 1 || values[1].length < 1 || values[4].length < 1 || values[5].length < 1) {
            someStepsNotSet = true;
        }

        values = await tokenReader.methods.readImbalanceStepFunctions(conversionRateAddress, tokenAdd).call();
        for (let i = 0; i < values[1].length; i++) {
            values[1][i] = await getAmountTokens(values[1][i], tokenAdd);
        }
        for (let i = 0; i < values[4].length; i++) {
            values[4][i] = await getAmountTokens(values[4][i], tokenAdd);
        }
        if(values[1].length < 1 || values[1].length < 1 || values[4].length < 1 || values[5].length < 1) {
            someStepsNotSet = true;
        }

        myLog(values[1].length < 1, 0, ("buyRateImbalanceStepFunction X: " + values[1]));
        myLog(values[2].length < 1, 0, ("buyRateImbalanceStepFunction Y: " + values[2]));
        myLog(values[4].length < 1, 0, ("sellRateImbalanceStepFunction X: " + values[4]));
        myLog(values[5].length < 1, 0, ("sellRateImbalanceStepFunction Y: " + values[5]));
        tokenDict["buyRateImbalanceStepFunction X: "] = values[1];
        tokenDict["buyRateImbalanceStepFunction Y: "] = values[2];
        tokenDict["sellRateImbalanceStepFunction X: "] = values[4];
        tokenDict["sellRateImbalanceStepFunction Y: "] = values[5];
    } else {
        //if no token reader contract
        buyRateQtyStepFunction = await getStepFunctionXYArr(tokenAdd, 0, Rate);
        assert.equal(buyRateQtyStepFunction[0].length, buyRateQtyStepFunction[1].length, "buyRateQtyStepFunction X Y different length");
        myLog(buyRateQtyStepFunction[0].length < 1, 0, ("buyRateQtyStepFunction X: " + buyRateQtyStepFunction[0]));
        myLog(buyRateQtyStepFunction[1].length < 1, 0, ("buyRateQtyStepFunction Y: " + buyRateQtyStepFunction[1]));

        sellRateQtyStepFunction = await getStepFunctionXYArr(tokenAdd, 4, Rate);
        assert.equal(sellRateQtyStepFunction[0].length, sellRateQtyStepFunction[1].length, "sellRateQtyStepFunction X Y different length");
        myLog(sellRateQtyStepFunction[0].length < 1, 0, ("sellRateQtyStepFunction X: " + sellRateQtyStepFunction[0]));
        myLog(sellRateQtyStepFunction[1].length < 1, 0, ("sellRateQtyStepFunction Y: " + sellRateQtyStepFunction[1]));


        buyRateImbalanceStepFunction = await getStepFunctionXYArr(tokenAdd, 8, Rate);
        assert.equal(buyRateImbalanceStepFunction[0].length, buyRateImbalanceStepFunction[1].length, "buyRateImbalanceStepFunction X Y different length");
        myLog(buyRateImbalanceStepFunction[0].length < 1, 0, ("buyRateImbalanceStepFunction X: " + buyRateImbalanceStepFunction[0]));
        myLog(buyRateImbalanceStepFunction[1].length < 1, 0, ("buyRateImbalanceStepFunction Y: " + buyRateImbalanceStepFunction[1]));
        tokenDict["buyRateImbalanceStepFunction X: "] = buyRateImbalanceStepFunction[0];
        tokenDict["buyRateImbalanceStepFunction Y: "] = buyRateImbalanceStepFunction[1];

        sellRateImbalanceStepFunction = await getStepFunctionXYArr(tokenAdd, 12, Rate);
        assert.equal(sellRateImbalanceStepFunction[0].length, sellRateImbalanceStepFunction[1].length, "sellRateImbalanceStepFunction X Y different length");
        myLog(sellRateImbalanceStepFunction[0].length < 1, 0, ("sellRateImbalanceStepFunction X: " + sellRateImbalanceStepFunction[0]));
        myLog(sellRateImbalanceStepFunction[1].length < 1, 0, ("sellRateImbalanceStepFunction Y: " + sellRateImbalanceStepFunction[1]));
        tokenDict["sellRateImbalanceStepFunction X: "] = sellRateImbalanceStepFunction[0];
        tokenDict["sellRateImbalanceStepFunction Y: "] = sellRateImbalanceStepFunction[1];

        if (buyRateQtyStepFunction[0].length < 1 || buyRateQtyStepFunction[1].length < 1 || sellRateQtyStepFunction[0].length < 1 ||
            sellRateQtyStepFunction[1].length < 1 || buyRateImbalanceStepFunction[0].length < 1 ||
            buyRateImbalanceStepFunction[1].length < 1 || sellRateImbalanceStepFunction[0].length < 1 ||
            sellRateImbalanceStepFunction[1].length < 1)
        {
            someStepsNotSet = true;
        }
    }

    if (someStepsNotSet) {

        myLog(1, 0, "")
        myLog(1, 0, "some step not set. get rate will revert")
        myLog(1, 0, "some step not set. get rate will revert")
        myLog(1, 0, "")
        return;
    }

    //buy price
    let ether = web3.utils.toBN(10).pow(web3.utils.toBN(18));

    let precisionPartial = web3.utils.toBN(10).pow(web3.utils.toBN(12));
    let blockNum = await web3.eth.getBlockNumber();
    let buyRate1Eth = await Rate.methods.getRate(tokenAdd, blockNum, true, ether.toString()).call();

    let etherToToken = (web3.utils.toBN(buyRate1Eth.valueOf()).div(precisionPartial)) / 1000000;

    let raiseFlag =  (buyRate1Eth == 0);
    myLog(raiseFlag, 0, ("for 1 eth. eth to " + await a2n(tokenAdd, 0) + " rate is: " + buyRate1Eth +
        " (1 eth = " + etherToToken + " " + await a2n(tokenAdd, 0) + ")"));

    //sell price
    let hundredTokensInTwei = web3.utils.toBN(10).pow(web3.utils.toBN(await getTokenDecimals(tokenAdd) * 1 + 4 * 1));
    let sellRateXTwei = await Rate.methods.getRate(tokenAdd, blockNum, false, hundredTokensInTwei.toString()).call();
    tokensTweixToEth = (web3.utils.toBN(sellRateXTwei).div(precisionPartial)) / 10000;
    raiseFlag =  (sellRateXTwei == 0);
    myLog(raiseFlag, 0, ("for 10000 " + await a2n(tokenAdd, 0) + " tokens. Token to eth rate is " +
        sellRateXTwei + " (10000 " + await a2n(tokenAdd, 0) + " tokens = " + tokensTweixToEth + " ether)"));
}

async function init(nodeUrl){
    //web3 instance

    web3 = new Web3(new Web3.providers.HttpProvider(nodeUrl));

    myLog(0, 0, ("web 3 version " + web3.version));
    let isListening;
    try {
        isListening = await web3.eth.net.isListening();
    } catch (e) {
        myLog(1, 0, ("can't connect to node: " + nodeUrl + ". check your internet connection. Or possibly check status of this node."));
        myLog(0, 0, ("exception: " + e));
        throw(e);
    }
    numPeers = await web3.eth.net.getPeerCount();
    myLog(0, 1, ( "node " + nodeUrl + " listening: " + isListening.toString() + " with " + numPeers + " peers"));
};

let decimalsPerToken = {};

async function getTokenDecimals (token) {
    if (decimalsPerToken[token] == undefined) {
        let abi = solcOutput.contracts["MockERC20.sol:MockERC20"].interface;
        let ERC20 = await new web3.eth.Contract(JSON.parse(abi), token);

        decimalsPerToken[token] = await ERC20.methods.decimals().call();
    }

    return decimalsPerToken[token];
}

async function getAmountTokens(amountTwei, tokenAdd) {
    let digits = await getTokenDecimals(tokenAdd);
//    myLog(0, 0, "decimals " + digits + "amountTwei " + amountTwei)
    let stringAmount = amountTwei.toString(10);
    let integer = stringAmount.substring(0,stringAmount.length - digits);
//    myLog(0, 0, "integer " + integer)
    let fraction = stringAmount.substring(stringAmount.length - digits);
    if( fraction.length < digits) {
        fraction = web3.utils.toBN(10).pow(web3.utils.toBN(fraction.length - digits)).toString(10).substring(1) + fraction;
    }

    fraction = fraction.replace(/0+$/,'');
    fraction = fraction.slice(0, 4); //enough 4 decimals.
    if (fraction == '') fraction = '0';
    if (integer == '') integer = '0';

    return integer + "." + fraction;
};

async function getCompiledContracts() {
    myLog(0, 0, "starting compilation");
    solcOutput = await solc.compile({ sources: input }, 1);
    console.log(solcOutput.errors);
//        console.log(solcOutput);
    myLog(0, 0, "finished compilation");
//    let solcOutJson = JSON.stringify(solcOutput, null, 2);
//    fs.writeFileSync(solcOutputPath, solcOutJson, function(err) {
//        if(err) {
//            return console.log(err);
//        }
//
//        console.log("Saved solc output to: " + solcOutputPath);
//    });
};
