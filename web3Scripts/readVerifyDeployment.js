//web3 modules
const Tx = require('ethereumjs-tx');
const Web3 = require('web3');
const Web3Eth = require('web3-eth');
const ethjsaccount = require('ethjs-account');
const signer = require('ethjs-signer');

//general purpose npm moudles
const BigNumber = require('bignumber.js');
const request = require('request');
const requestPromise = require('request-promise');
const readFilePromise = require('fs-readfile-promise');
const fs = require('fs');
const assert = require('assert');
const compareVersions = require('compare-versions');

const ethAddress = '0x00eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';


//ABI files
const networkABIFile = './contracts/abi/KyberNetwork.abi';
const reserveABIFile = './contracts/abi/KyberReserve.abi';
const whiteListABIFile = './contracts/abi/WhiteList.abi';
const feeBurnerABIFile = './contracts/abi/FeeBurner.abi';
const expectedRateABIFile = './contracts/abi/ExpectedRate.abi';
const conversionRateABIFile = './contracts/abi/ConversionRates.abi';
const sanityRateABIFile = './contracts/abi/SanityRates.abi';

const gasLimit = new BigNumber( 100000 );

// variables
///////////

//contract addresses
const kyberNetworkAdd = '0x803e2b13a11c21ec0616cead4a3d2ebe1326f5b0';
let whiteListAdd;
let feeBurnerAdd;
let expectedRateAdd;
let numReserves;
let reservesAdd = [];
let ratesAdd = [];      // one per reserve
let sanityRateAdd = []; // one per reserve

//contract instances
let Network;
let WhiteList;
let FeeBurner;
let ExpectedRate;
let Reserves = [];
let ConversionRates = [];         // one per reserve
let SanityRates = [];   // one per reserve

//parameters
let tokensPerReserve = [];//[reserve index][token address]

// show / not show
// set to 0 to avoid showing in report
//////////////////
const runExpectedRate = 1;
const runWhiteList = 1;
const runFeeBurner = 1;
const printAdminETC = 1;
const showStepFunctions = 1;

// code
////////
////////


main();


async function main (){
    await init();
    await readKyberNetwork(kyberNetworkAdd);
}

//functions
///////////
async function readKyberNetwork(kyberNetworkAdd){
    let networkABIStr = fs.readFileSync(networkABIFile, 'utf8');
    let networkABI = JSON.parse(networkABIStr);
    Network = await new web3.eth.Contract(networkABI, kyberNetworkAdd);

    //read addresses and create contract instances.
    feeBurnerAdd = await Network.methods.feeBurnerContract().call();    
    whiteListAdd = await Network.methods.whiteListContract().call();
    expectedRateAdd = await Network.methods.expectedRateContract().call();

    myLog(0, 0, (""));
    myLog(0, 0, ("kyberNetworkAdd: " + kyberNetworkAdd));
    myLog(0, 0, ("------------------------------------------------------------"));
    myLog(0, 1, ("enable: " + await Network.methods.enabled().call() + "!!!!!!!!!!!!!!!!!!!!"));
    await printAdminAlertersOperators(Network);
    myLog(0, 0, ("feeBurnerAdd: " + feeBurnerAdd));
    myLog((whiteListAdd == 0), 0, ("whiteListAdd: " + whiteListAdd));
    myLog(0, 0, ("expectedRateAdd: " + expectedRateAdd));
    assert(((feeBurnerAdd != 0) && (whiteListAdd != 0) && (expectedRateAdd != 0)), "contract addresses must be set");
    let maxGasGwei = (await Network.methods.maxGasPrice().call()) / 1000 / 1000 / 1000;
    myLog((maxGasGwei < 10), (maxGasGwei < 25), ("maxGas: " + maxGasGwei + " gwei"));
    assert(maxGasGwei != 0, "max Gas must be set");

    let negligibleRateDiff = await Network.methods.negligibleRateDiff().call();
    myLog(0, 0, ("negligibleRateDiff: " + negligibleRateDiff + " = " + bpsToPercent(negligibleRateDiff) + "%"));


    numReserves = await Network.methods.getNumReserves().call();
    let addressess = await Network.methods.getReserves().call();
//    tokensPerReserve = [numReserves][];
    for (let i = 0; i < numReserves; i++) {
        reservesAdd[i] =  addressess[i];
//        reservesAdd[i] =  await web3.eth.call({to: kyberNetworkAdd, data: Network.methods.reserves(1).encodeABI()});
//        reservesAdd[i] = await Network.methods.reserves(1).call();
        myLog(0, 0, ("reserveAdd " + i + ": " + reservesAdd[i]));
    }

    await readWhiteListData(whiteListAdd);
    await readExpectedRateData(expectedRateAdd);

    // now reserves
    for (let i = 0; i < numReserves; i++) {
        await readReserve(reservesAdd[i], i);
    }
};

async function readWhiteListData(whiteListAddress) {
    myLog(0, 0, '');

    if (runWhiteList == 0) {
        myLog(0, 1, "not showing WhiteList. set runWhiteList = 1 to show it.");
        return;
    }

    let whiteListABIStr = fs.readFileSync(whiteListABIFile, 'utf8');
    let whiteListABI = JSON.parse(whiteListABIStr);
    WhiteList = await new web3.eth.Contract(whiteListABI, whiteListAdd);

    myLog(0, 0, ("white list contract data "));
    myLog(0, 0, ("-------------------------"));
    await printAdminAlertersOperators(WhiteList);
    let weiPerSgd = await WhiteList.methods.weiPerSgd().call();
    assert(weiPerSgd != 0, "assert. wei per SGD not set");
    myLog(0, 0, ("weiPerSgd: " + weiPerSgd));
    myLog(0, 0, ("default cap: " + await WhiteList.methods.categoryCap(0).call() + ". (for all users without specific category set)"));
    let cap = 0;
    let categoryIndex = 1;
    while(categoryIndex < 6) {
        //iterate on first categories. if cap above 0 print it.
        cap = await WhiteList.methods.categoryCap(categoryIndex).call();
        if (cap > 0) {
            myLog(0, 0, ("whitelist category: " + categoryIndex + " cap: " + cap + " SGD."));
        }
        categoryIndex++;
    }
}


async function readExpectedRateData(expectedRateAddress) {
    myLog(0, 0, '');

    if (runExpectedRate == 0) {
        myLog(0, 1, "not showing ExpectedRate. set runExpectedRate = 1 to show it.");
        return;
    }

    let expectedRateABIStr = fs.readFileSync(expectedRateABIFile, 'utf8');
    let expectedRateABI = JSON.parse(expectedRateABIStr);
    ExpectedRate = await new web3.eth.Contract(expectedRateABI, expectedRateAdd);

    myLog(0, 0, ("expected Rate contract data "));
    myLog(0, 0, ("----------------------------"));
    await printAdminAlertersOperators(ExpectedRate);
    //todo: how to read network address
//    let kyberAddress = await ExpectedRate.methods.kyberNetwork().call();
//    myLog(0, 0, ("kyber address: " + kyberAddress);
//    assert.equal(kyberNetworkAdd, kyberAddress, "Wrong kyber network address");
//    let kyberAddress =  await web3.eth.call({to: expectedRateAdd, data: ExpectedRate.methods.kyberNetwork().encodeABI()});
//    myLog(0, 0, ("kyber address: " + kyberAddress);
    let quantityFactor = await ExpectedRate.methods.quantityFactor().call();
    assert(quantityFactor > 0, "quantity factor must be greater then 0.");
    myLog(0, 0, ("quantityFactor: " + quantityFactor + " twei"));
    let minSlippageFactorInBps = await ExpectedRate.methods.minSlippageFactorInBps().call();
    //todo what is the minimum for minSlippageFactorInBps
    assert(minSlippageFactorInBps > 0, "minSlippageFactorInBps must be greater then 0.");
    myLog(0, 0, ("minSlippageFactorInBps: " + minSlippageFactorInBps + " == " + bpsToPercent(minSlippageFactorInBps) + "%"));
};

let reserveABIStr;
let reserveABI;

async function readReserve(reserveAdd, index){
    if (index == 0) {
        reserveABIStr = fs.readFileSync(reserveABIFile, 'utf8');
        reserveABI = JSON.parse(reserveABIStr);
    }
    Reserves[index] = await new web3.eth.Contract(reserveABI, reserveAdd);
    let Reserve = Reserves[index];

    //read addresses
    ratesAdd[index] = await Reserve.methods.conversionRatesContract().call();
    sanityRateAdd[index] = await Reserve.methods.sanityRatesContract().call();

    myLog(0, 0, '');
    myLog(0, 0, '');

    myLog(0, 0, ("Reserve " + index + " address: " + reserveAdd));
    myLog(0, 0, ("---------------------------------------------------------"));
    await printAdminAlertersOperators(Reserve);
    myLog(0, 0, ("ratesAdd " + index + ": " + ratesAdd[index]));
    myLog(0, 0, ("sanityRateAdd " + index + ": " + sanityRateAdd[index]));

    await readFeeBurnerDataForReserve(feeBurnerAdd, reserveAdd, index);
    await readSanityRate(sanityRateAdd[index], reserveAdd, index);
    await readConversionRate(ratesAdd[index], reserveAdd, index);
};

let feeBurnerABIStr;
let feeBurnerABI;

async function readFeeBurnerDataForReserve(feeBurnerAddress, reserveAddress, index) {
    myLog(0, 0, '');

    if (runFeeBurner == 0) {
        myLog(0, 1, "not showing feeBurner. set runFeeBurner = 1 to show it.");
        return;
    }

    if (index == 0) {
        feeBurnerABIStr = fs.readFileSync(feeBurnerABIFile, 'utf8');
        feeBurnerABI = JSON.parse(feeBurnerABIStr);
        FeeBurner = await new web3.eth.Contract(feeBurnerABI, feeBurnerAdd);
    }


    myLog(0, 0, ("fee burner data for reserve " + index + ":" + reserveAddress));
    myLog(0, 0, ("-------------------------------------------------------------------"));
    if (index == 0)await printAdminAlertersOperators(FeeBurner);
    let reserveFees = await FeeBurner.methods.reserveFeesInBps(reserveAddress).call();
    myLog(0, 0, ("reserveFeesInBps: " + reserveFees + " == " + bpsToPercent(reserveFees) + "%"));
    myLog(0, 0, ("reserveKNCWallet: " + await FeeBurner.methods.reserveKNCWallet(reserveAddress).call()));
    feeToBurn = await FeeBurner.methods.reserveFeeToBurn(reserveAddress).call();
    myLog(0, 0, ("reserveFeeToBurn: " + feeToBurn + " twei. == " + feeToBurn / (10 ** 18) + " KNC tokens."));
//    myLog(0, 0, ("reserveFeeToWallet: " + await FeeBurner.methods.reserveFeeToWallet(reserveAddress).call());
}

let conversionRatesABIStr;
let conversionRatesABI;

async function readConversionRate(conversionRateAddress, reserveAddress, index) {
    if (index == 0) {
        conversionRatesABIStr = fs.readFileSync(conversionRateABIFile, 'utf8');
        conversionRatesABI = JSON.parse(conversionRatesABIStr);
    }
    ConversionRates[index] = await new web3.eth.Contract(conversionRatesABI, conversionRateAddress);
    Rate = ConversionRates[index];

    myLog(0, 0, '');

    myLog(0, 0, ("Coversion Rate " + index + " address: " +  conversionRateAddress));
    myLog(0, 0, ("-------------------------------------------------------------------"));
    await printAdminAlertersOperators(Rate);
    myLog(0, 0, ("validRateDurationInBlocks: " + await Rate.methods.validRateDurationInBlocks().call()));
    let reserveContractAdd = await Rate.methods.reserveContract().call();
    myLog(0, 0, ("reserveContract: " + reserveContractAdd));
    assert.equal(reserveContractAdd, reserveAddress);
    tokensPerReserve[index] = await Rate.methods.getListedTokens().call();
    myLog(0, 0, ("tokens: " + tokensPerReserve[index]));

    await validateReserveTokensListedOnNetwork(tokensPerReserve[index], reserveAddress);

    let numTokens = tokensPerReserve[index].length;
    for (let i = 0; i < numTokens; i++) {
        await readTokenDataInConversionRate(conversionRateAddress, tokensPerReserve[index][i], index);
    }
};

async function readTokenDataInConversionRate(conversionRateAddress, tokenAdd, reserveIndex) {
    let Rate = ConversionRates[reserveIndex];

    myLog(0, 0, '');

    myLog(0, 0, ("token " + tokenAdd ));
    myLog(0, 0, ("-----------------------------------------------"));
    let basic = await Rate.methods.getTokenBasicData(tokenAdd).call();
    myLog((basic[0] == false), (basic[1] == false), ("listed = " + basic[0] + ". Enabled = " + basic[1]));

    //todo how to pass bool value to contrace? reslut is always the same...
    let buy = await Rate.methods.getBasicRate(tokenAdd, true).call();
    myLog((buy == 0), 0, ("basic eth to token rate: " + buy));
    let sell = await Rate.methods.getBasicRate(tokenAdd, false).call();
    myLog((sell == 0), 0, ("basic token to Eth rate: " + buy));

    if (showStepFunctions == 0) {
        myLog(0, 1, "not showing step functions. set showStepFunctions = 1 to show it.");
        return;
    }

    buyRateQtyStepFunction = await getStepFunctionXYArr(tokenAdd, 0, Rate);
    assert.equal(buyRateQtyStepFunction[0].length, buyRateQtyStepFunction[1].length, "buyRateQtyStepFunction X Y different length");
    myLog(0, 0, ("buyRateQtyStepFunction X: " + buyRateQtyStepFunction[0]));
    myLog(0, 0, ("buyRateQtyStepFunction Y: " + buyRateQtyStepFunction[1]));

    sellRateQtyStepFunction = await getStepFunctionXYArr(tokenAdd, 4, Rate);
    assert.equal(sellRateQtyStepFunction[0].length, sellRateQtyStepFunction[1].length, "sellRateQtyStepFunction X Y different length");
    myLog(0, 0, ("sellRateQtyStepFunction X: " + sellRateQtyStepFunction[0]));
    myLog(0, 0, ("sellRateQtyStepFunction Y: " + sellRateQtyStepFunction[1]));

    buyRateImbalanceStepFunction = await getStepFunctionXYArr(tokenAdd, 8, Rate);
    assert.equal(buyRateImbalanceStepFunction[0].length, buyRateImbalanceStepFunction[1].length, "buyRateImbalanceStepFunction X Y different length");
    myLog(0, 0, ("buyRateImbalanceStepFunction X: " + buyRateImbalanceStepFunction[0]));
    myLog(0, 0, ("buyRateImbalanceStepFunction Y: " + buyRateImbalanceStepFunction[1]));

    sellRateImbalanceStepFunction = await getStepFunctionXYArr(tokenAdd, 12, Rate);
    assert.equal(sellRateImbalanceStepFunction[0].length, sellRateImbalanceStepFunction[1].length, "sellRateImbalanceStepFunction X Y different length");
    myLog(0, 0, ("sellRateImbalanceStepFunction X: " + sellRateImbalanceStepFunction[0]));
    myLog(0, 0, ("sellRateImbalanceStepFunction Y: " + sellRateImbalanceStepFunction[1]));

}

async function getStepFunctionXYArr(tokenAdd, commandID, rateContract) {
    let ValsXY = [];
    let ValsX = [];
    let ValsY = [];

    let lengthX = await rateContract.methods.getStepFunctionData(tokenAdd, commandID, 0).call();

    commandID ++;
    for (let i = 0; i < lengthX; i++) {
        ValsX[i] = await rateContract.methods.getStepFunctionData(tokenAdd, commandID, i).call();
    }

    commandID++;
    let lengthY = await rateContract.methods.getStepFunctionData(tokenAdd, commandID, 0).call();

    commandID++;
    for (i = 0; i < lengthY; i++) {
        ValsY[i] = await rateContract.methods.getStepFunctionData(tokenAdd, commandID, i).call();
    }

    ValsXY[0] = ValsX;
    ValsXY[1] = ValsY;
    return ValsXY;
}

let sanityRatesABIStr;
let sanityRatesABI;

async function readSanityRate(sanityRateAddress, reserveAddress, index) {
    if (index == 0) {
        sanityRatesABIStr = fs.readFileSync(sanityRateABIFile, 'utf8');
        sanityRatesABI = JSON.parse(sanityRatesABIStr);
    }

    myLog(0, 0, '');

    if (sanityRateAdd == 0) {
        myLog(0, 1, ("sanity rate not configured for reserve: " + reserveAddress));
        return;
    }

    SanityRates[index] = await new web3.eth.Contract(sanityRatesABI, sanityRateAddress);

    myLog(0, 0, ("sanity Rates " + index + " address: " + sanityRateAddress ));
    myLog(0, 0, ("-------------------------------------------------------------------"));
    await printAdminAlertersOperators(SanityRates[index]);
//    myLog(0, 0, ("ratesAdd " + index + ": " + ratesAdd[index]);
//    myLog(0, 0, ("sanityRateAdd " + index + ": " + sanityRateAdd[index]);
//
//    await readFeeBurnerDataForReserve(feeBurnerAdd, reserveAdd, index);
};

async function validateReserveTokensListedOnNetwork(tokens, reserveAddress) {
    let isListed;
    let keccak;

    //check tokens listed eth->token and token to eth
    //todo - how to use keccak correctly.
    for (let i = 0; i < tokens.length; i++){
        keccak = web3.utils.soliditySha3(ethAddress, tokens[i]);
        isListed = await Network.methods.perReserveListedPairs(reserveAddress, keccak).call();;
        if (isListed == false) {
            myLog(1, 0, ("eth to " + tokens[i] + " for reserve: " + reserveAddress + " not listed in kyberNetwork;"))
        }

        keccak = web3.utils.soliditySha3(tokens[i], ethAddress);
        isListed = await Network.methods.perReserveListedPairs(reserveAddress, keccak).call();;
        if (isListed == false) {
            myLog(1, 0, (tokens[i] + "to eth for reserve: " + reserveAddress + " not listed in kyberNetwork;"))
        }
    }
};

async function printAdminAlertersOperators(contract) {
    if (printAdminETC == 0) {
        myLog(0, 1, "not showing Admin operator alerter. set printAdminETC = 1 to show it.");
        return;
    }
    myLog(0, 0, ("Admin: " + await contract.methods.admin().call()));
    let pendingAdmin = await contract.methods.pendingAdmin().call();
    myLog(0, (pendingAdmin != 0), ("Pending Admin: " + pendingAdmin));
    myLog(0, 0, ("Alerters: " + await contract.methods.getAlerters().call()));
    myLog(0, 0, ("Operators: " + await contract.methods.getOperators().call()));
}

async function init(){
    //web3 instance
    const infuraUrl =  'https://mainnet.infura.io';
    web3 = new Web3(new Web3.providers.HttpProvider(infuraUrl));

    let goodVersion = compareVersions('1.0', web3.version);
    if (goodVersion < 0) {
        myLog(1, 0, "bad web3 version. Please install version 1.0 or higher.");
    }

    myLog(0, 0, ("web 3 version " + web3.version));
    let isListening;
    try {
        isListening = await web3.eth.net.isListening();
    } catch (e) {
        myLog(1, 0, ("can't connect to node: " + infuraUrl + ". check your internet connection. Or possibly check status of this node."));
        myLog(0, 0, ("exception: " + e));
        throw(e);
    }
    myLog(0, 0, ( "node " + infuraUrl + " listening: " + isListening.toString() + " with " +/* numPeers + */" peers"));
};

async function sendRawTx(tx, nonce) {
    // Set the headers
    var headers = {
        //'User-Agent':       'Super Agent/0.0.1',
        'Content-Type':     'Content-Type: application/json',
    };

    // Configure the request
    var options = {
        url: infuraUrl,
        method: 'POST',
        headers: headers,
        json:true,
        body: {"jsonrpc": "2.0",'method': 'eth_sendRawTransaction', 'params': [tx], "id" : parseInt(nonce.toString(10))}
    };


    return requestPromise (options);
};

function bpsToPercent (bpsValue) {
    return (bpsValue / 100);
};

function myLog(error, highlight, string) {
    if (error) {
        console.log('\x1b[31m%s\x1b[0m', string);
    } else if (highlight) {
        console.log('\x1b[33m%s\x1b[0m', string);
    } else {
        console.log(string);
    }
}



