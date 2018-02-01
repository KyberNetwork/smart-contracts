//web3 modules
const Web3 = require('web3');

//general purpose npm moudles
const fs = require('fs');
const assert = require('assert');
const compareVersions = require('compare-versions');
const solc = require('solc');

//contract sources
const contractPath = "../contracts/";

var input = {
  "ConversionRatesInterface.sol" : fs.readFileSync(contractPath + 'ConversionRatesInterface.sol', 'utf8'),
  "ConversionRates.sol" : fs.readFileSync(contractPath + 'ConversionRates.sol', 'utf8'),
  "PermissionGroups.sol" : fs.readFileSync(contractPath + 'PermissionGroups.sol', 'utf8'),
  "ERC20Interface.sol" : fs.readFileSync(contractPath + 'ERC20Interface.sol', 'utf8'),
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
};

let solcOutput;


//ABI files
const networkABIFile = '../contracts/abi/KyberNetwork.abi';
const reserveABIFile = '../contracts/abi/KyberReserve.abi';
const whiteListABIFile = '../contracts/abi/WhiteList.abi';
const feeBurnerABIFile = '../contracts/abi/FeeBurner.abi';
const expectedRateABIFile = '../contracts/abi/ExpectedRate.abi';
const conversionRateABIFile = '../contracts/abi/ConversionRates.abi';
const sanityRateABIFile = '../contracts/abi/SanityRates.abi';


const gasLimit = 1*100000;

const ethAddress = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

// variables
///////////

//contract addresses
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
let deploymentInput;
let addressesToNames = {};
let jsonTokenList = [];
let jsonWithdrawAddresses = [];
let minRecordResolutionPerToken = {};
let maxPerBlockImbalancePerToken = {};
let maxTotalImbalancePerToken = {};
let decimalsPerToken = {};

// show / not show
// set to 0 to avoid showing in report
//////////////////
const runExpectedRate = 1;
const runWhiteList = 1;
const runFeeBurner = 1;
const printAdminETC = 1;
const showStepFunctions = 1;
const useNamesForAddresses = 1;

// code
////////
////////

const infuraUrl = 'https://mainnet.infura.io';
//const infuraUrl = 'https://kovan.infura.io';
const localURL = 'http://localhost';

const deployInputJsonPath = './deployment_script_input_mainnet.json';
let deployOutputJsonPath = './deployment_mainnet.json';

let kyberNetworkAdd = '0x0';

//run the code
main();

async function main (){
    console.log("starting compilation");
    solcOutput = await solc.compile({ sources: input }, 1);
//    console.log(solcOutput);
    console.log("finished compilation");

    await init(infuraUrl);
    await readDeploymentInJSON(deployInputJsonPath);
    await readDeploymentOutJSON(deployOutputJsonPath);
    await readKyberNetwork(kyberNetworkAdd);
}

//functions
///////////
async function readKyberNetwork(kyberNetworkAdd){
    let abi = solcOutput.contracts["KyberNetwork.sol:KyberNetwork"].interface;
    Network = await new web3.eth.Contract(JSON.parse(abi), kyberNetworkAdd);

    //verify binary as expected.
    let blockCode = await web3.eth.getCode(kyberNetworkAdd);
    let solcCode = '0x' + (solcOutput.contracts["KyberNetwork.sol:KyberNetwork"].runtimeBytecode);

    myLog(0, 0, (""));
    myLog(0, 0, ("kyberNetworkAdd: " + kyberNetworkAdd));
    myLog(0, 0, ("------------------------------------------------------------"));

    if (blockCode != solcCode){
        myLog(1, 0, "blockchain Code:");
        console.log(blockCode);
        console.log()
        myLog(1, 0, "Byte code from block chain doesn't match locally compiled code.")
        console.log()
    } else {
        myLog(0, 0, "Code on blockchain matches locally compiled code");
        myLog(0, 0, '');
    }

    //read addresses and create contract instances.
    let feeAdd = (await Network.methods.feeBurnerContract().call()).toLowerCase();
    whiteListAdd = (await Network.methods.whiteListContract().call()).toLowerCase();
    expectedRateAdd = (await Network.methods.expectedRateContract().call()).toLowerCase();


    myLog(0, 1, ("enable: " + await Network.methods.enabled().call() + "!!!"));
    await printAdminAlertersOperators(Network);
    myLog((feeAdd!=feeBurnerAdd), (feeAdd == 0), ("feeBurnerAdd: " + feeBurnerAdd));
    feeBurnerAdd = feeAdd;
    myLog((whiteListAdd == 0), 0, ("whiteListAdd: " + whiteListAdd));
    myLog((expectedRateAdd == 0), 0, ("expectedRateAdd: " + expectedRateAdd));

    let maxGasGwei = (await Network.methods.maxGasPrice().call()) / 1000 / 1000 / 1000;
    myLog((maxGasGwei < 10), (maxGasGwei < 25), ("maxGas: " + maxGasGwei + " gwei"));
    assert(maxGasGwei != 0, "max Gas must be set");

    let negligibleRateDiff = await Network.methods.negligibleRateDiff().call();
    myLog(0, 0, ("negligibleRateDiff: " + negligibleRateDiff + " = " + bpsToPercent(negligibleRateDiff) + "%"));


    numReserves = await Network.methods.getNumReserves().call();
    let addressess = await Network.methods.getReserves().call();
    for (let i = 0; i < numReserves; i++) {
        reservesAdd[i] =  addressess[i];
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

    let abi = solcOutput.contracts["WhiteList.sol:WhiteList"].interface;
    WhiteList = await new web3.eth.Contract(JSON.parse(abi), whiteListAdd);

    //verify binary as expected.
    let blockCode = await web3.eth.getCode(whiteListAdd);
    let solcCode = '0x' + (solcOutput.contracts["WhiteList.sol:WhiteList"].runtimeBytecode);

    if (blockCode != solcCode){
        myLog(1, 0, "blockchain Code:");
        console.log(blockCode);
        console.log()
        myLog(1, 0, "Byte code from block chain doesn't match locally compiled code.")
        console.log()
    } else {
        myLog(0, 0, "Code on blockchain matches locally compiled code");
        myLog(0, 0, '');
    }


    myLog(0, 0, ("white list contract data "));
    myLog(0, 0, ("-------------------------"));
    await printAdminAlertersOperators(WhiteList);
    let weiPerSgd = await WhiteList.methods.weiPerSgd().call();
    myLog((weiPerSgd == 0), 0, ("weiPerSgd: " + weiPerSgd + " = " + getAmountTokens(weiPerSgd, ethAddress) + " tokens."));
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

    let abi = solcOutput.contracts["ExpectedRate.sol:ExpectedRate"].interface;
    ExpectedRate = await new web3.eth.Contract(JSON.parse(abi), expectedRateAdd);


    myLog(0, 0, ("expected Rate contract data "));
    myLog(0, 0, ("----------------------------"));

    //verify binary as expected.
    let blockCode = await web3.eth.getCode(expectedRateAdd);
    let solcCode = '0x' + (solcOutput.contracts["ExpectedRate.sol:ExpectedRate"].runtimeBytecode);

    if (blockCode != solcCode){
        myLog(1, 0, "blockchain Code:");
        console.log(blockCode);
        console.log()
        myLog(1, 0, "Byte code from block chain doesn't match locally compiled code.")
        console.log()
    } else {
        myLog(0, 0, "Code on blockchain matches locally compiled code");
        myLog(0, 0, '');
    }


    await printAdminAlertersOperators(ExpectedRate);

    let kyberAddress = (await ExpectedRate.methods.kyberNetwork().call()).toLowerCase();
    myLog((kyberAddress != kyberNetworkAdd), 0, ("kyber address: " + kyberAddress));
    let quantityFactor = await ExpectedRate.methods.quantityFactor().call();
    assert(quantityFactor > 0, "quantity factor must be greater then 0.");
    myLog(0, 0, ("quantityFactor: " + quantityFactor));
    let minSlippageFactorInBps = await ExpectedRate.methods.minSlippageFactorInBps().call();
    //todo what is the minimum for minSlippageFactorInBps
    assert(minSlippageFactorInBps > 0, "minSlippageFactorInBps must be greater then 0.");
    myLog(0, 0, ("minSlippageFactorInBps: " + minSlippageFactorInBps + " == " + bpsToPercent(minSlippageFactorInBps) + "%"));
};

let reserveABI;
let needReadReserveABI = 1;

async function readReserve(reserveAdd, index){
    if (needReadReserveABI == 1) {
        needReadReserveABI = 0;
        try {
            let abi = solcOutput.contracts["KyberReserve.sol:KyberReserve"].interface;
            reserveABI = JSON.parse(abi);
        } catch (e) {
            console.log(e);
            throw e;
        }
    }

    Reserves[index] = await new web3.eth.Contract(reserveABI, reserveAdd);
    let Reserve = Reserves[index];

    let abi = solcOutput.contracts["KyberReserve.sol:KyberReserve"].interface;
    ExpectedRate = await new web3.eth.Contract(JSON.parse(abi), reserveAdd);

    myLog(0, 0, '');
    myLog(0, 0, '');

    myLog(0, 0, ("Reserve " + index + " address: " + a2n(reserveAdd, 1)));
    myLog(0, 0, ("---------------------------------------------------------"));

    //verify binary as expected.
    let blockCode = await web3.eth.getCode(reserveAdd);
    let solcCode = '0x' + (solcOutput.contracts["KyberReserve.sol:KyberReserve"].runtimeBytecode);

    if (blockCode != solcCode){
        myLog(1, 0, "blockchain Code:");
        console.log(blockCode);
        console.log()
        myLog(1, 0, "Byte code from block chain doesn't match locally compiled code.")
        console.log()
    } else {
        myLog(0, 0, "Code on blockchain matches locally compiled code");
        myLog(0, 0, '');
    }

    //read addresses
    ratesAdd[index] = await Reserve.methods.conversionRatesContract().call();
    sanityRateAdd[index] = await Reserve.methods.sanityRatesContract().call();
    let isApproved = await Reserve.methods.approvedWithdrawAddresses(ethAddress).call();

    await printAdminAlertersOperators(Reserve);
    myLog(0, 0, ("ratesAdd " + index + ": " + ratesAdd[index]));
    myLog(0, 0, ("sanityRateAdd " + index + ": " + sanityRateAdd[index]));

    await readFeeBurnerDataForReserve(feeBurnerAdd, reserveAdd, index);
    await readConversionRate(ratesAdd[index], reserveAdd, index);
    await readSanityRate(sanityRateAdd[index], reserveAdd, index, tokensPerReserve[index]);
};


async function verifyApprovedWithdrawAddress (tokenList) {
    //verify approved withdrawal addresses are set
    for (let i = 0; i < jsonWithdrawAddresses.length; i++) {
        let address = jsonWithdrawAddresses[i];
        let isApproved = await Reserve.methods.approvedWithdrawAddresses(address).call();
        if (isApproved == true) {
            approvedStr = " approved for withdrawal.";
        } else {
            approvedStr = " not approved for withdrawal.";
        }

        myLog(0, isApproved, ("Address: " + a2n(address, 1) + approvedStr));
    };
}


async function readFeeBurnerDataForReserve(feeBurnerAddress, reserveAddress, index) {
    myLog(0, 0, '');

    if (runFeeBurner == 0) {
        myLog(0, 1, "not showing feeBurner. set runFeeBurner = 1 to show it.");
        return;
    }

    try {
        let abi = solcOutput.contracts["FeeBurner.sol:FeeBurner"].interface;
        FeeBurner = await new web3.eth.Contract(JSON.parse(abi), feeBurnerAdd);
    } catch (e) {
        console.log(e);
        throw e;
    }

    myLog(0, 0, ("fee burner data for reserve " + index + ":" + a2n(reserveAddress)));
    myLog(0, 0, ("-------------------------------------------------------------------"));

    //verify binary as expected.
    let blockCode = await web3.eth.getCode(feeBurnerAdd);
    let solcCode = '0x' + (solcOutput.contracts["FeeBurner.sol:FeeBurner"].runtimeBytecode);

    if (blockCode != solcCode){
        myLog(1, 0, "blockchain Code:");
        console.log(blockCode);
        console.log()
        myLog(1, 0, "Byte code from block chain doesn't match locally compiled code.")
        console.log()
   } else {
       myLog(0, 0, "Code on blockchain matches locally compiled code");
       myLog(0, 0, '');
   }

    if (index == 0)await printAdminAlertersOperators(FeeBurner);
    let reserveFees = await FeeBurner.methods.reserveFeesInBps(reserveAddress).call();
    myLog(0, 0, ("reserveFeesInBps: " + reserveFees + " == " + bpsToPercent(reserveFees) + "%"));
    myLog(0, 0, ("reserveKNCWallet: " + await FeeBurner.methods.reserveKNCWallet(reserveAddress).call()));
    feeToBurn = await FeeBurner.methods.reserveFeeToBurn(reserveAddress).call();
    myLog(0, 0, ("reserveFeeToBurn: " + feeToBurn + " twei. == " + feeToBurn / (10 ** 18) + " KNC tokens."));
//    myLog(0, 0, ("reserveFeeToWallet: " + await FeeBurner.methods.reserveFeeToWallet(reserveAddress).call());
}

let conversionRatesABI;
let needReadRatesABI = 1;

async function readConversionRate(conversionRateAddress, reserveAddress, index) {
    if (needReadRatesABI == 1) {
        needReadRatesABI = 0;
        try {
            let abi = solcOutput.contracts["ConversionRates.sol:ConversionRates"].interface;
            conversionRatesABI = JSON.parse(abi);
        } catch (e) {
            console.log(e);
            throw e;
        }
    }
    ConversionRates[index] = await new web3.eth.Contract(conversionRatesABI, conversionRateAddress);
    Rate = ConversionRates[index];

    myLog(0, 0, '');

    myLog(0, 0, ("Conversion Rate " + index + " address: " +  conversionRateAddress));
    myLog(0, 0, ("-------------------------------------------------------------------"));


    //verify binary as expected.
    let blockCode = await web3.eth.getCode(conversionRateAddress);
    let solcCode = '0x' + (solcOutput.contracts["ConversionRates.sol:ConversionRates"].runtimeBytecode);

    if (blockCode != solcCode){
        myLog(1, 0, "blockchain Code:");
        console.log(blockCode);
        console.log()
        myLog(1, 0, "Byte code from block chain doesn't match locally compiled code.")
        console.log()
    } else {
        myLog(0, 0, "Code on blockchain matches locally compiled code");
         myLog(0, 0, '');
    }

    await printAdminAlertersOperators(Rate);
    myLog(0, 0, ("validRateDurationInBlocks: " + await Rate.methods.validRateDurationInBlocks().call()));
    let reserveContractAdd = await Rate.methods.reserveContract().call();
    myLog((reserveAddress != reserveContractAdd), 0, ("reserveContract: " + reserveContractAdd));
    tokensPerReserve[index] = await Rate.methods.getListedTokens().call();

    let toks = tokensPerReserve[index];
    let tokNames = '';
    toks.forEach(function(name){
        tokNames += a2n(name) + " ";
    });

    myLog(0, 0, "token list: " + tokNames);


    verifyTokenListMatchingDeployJSON(index, tokensPerReserve[index]);

    await validateReserveTokensListedOnNetwork(tokensPerReserve[index], reserveAddress);

    let numTokens = tokensPerReserve[index].length;
    for (let i = 0; i < numTokens; i++) {
        await readTokenDataInConversionRate(conversionRateAddress, tokensPerReserve[index][i], index);
    }
};

async function verifyTokenListMatchingDeployJSON (reserveIndex, tokenList) {

    console.log();
    myLog(0, 0, ("Verify all json token list is listed in conversion rate contract "));
    console.log("----------------------------------------------------------------");

    //verify json reserve address is this reserve address
    jsonTokenList.forEach(function(address) {
        if (addressesToNames[address] != "ETH"){
            //Ether will not be listed in the rates contract.
            let listedStr = ' not listed';
            let isListed = 0;
            for (let i = 0; i < tokenList.length; i++) {
                if (tokenList[i].toLowerCase() == address){
                    listedStr = ' listed. ';
                    isListed = 1;
                    break;
                }
            }

            myLog(!isListed, 0, ("token from Json: " + a2n(address, 1) + listedStr));
        };
    });
};

let showStepFuncMsg = 1;

async function readTokenDataInConversionRate(conversionRateAddress, tokenAdd, reserveIndex) {
    let Rate = ConversionRates[reserveIndex];
    tokenAdd = tokenAdd.toLowerCase();

    myLog(0, 0, '');

    myLog(0, 0, ("token " + a2n(tokenAdd, 1)));
    myLog(0, 0, ("-----------------------------------------------"));
    let basic = await Rate.methods.getTokenBasicData(tokenAdd).call();
    myLog((basic[0] == false), (basic[1] == false), ("listed = " + basic[0] + ". Enabled = " + basic[1]));

    //todo how to pass bool value to contrace? reslut is always the same...
    let buy = await Rate.methods.getBasicRate(tokenAdd, true).call();
    myLog((buy == 0), 0, ("basic eth to token rate: " + buy));
    let sell = await Rate.methods.getBasicRate(tokenAdd, false).call();
    myLog((sell == 0), 0, ("basic token to Eth rate: " + buy));

    //read imbalance info

    let controlInfo = await Rate.methods.getTokenControlInfo(tokenAdd).call();
    myLog((controlInfo[0] != minRecordResolutionPerToken[tokenAdd]),
        0, ("minRecordResolution: " + controlInfo[0] + " = " +
        getAmountTokens(controlInfo[0], tokenAdd) + " tokens."));
    myLog((controlInfo[1] != maxPerBlockImbalancePerToken[tokenAdd]), 0,
        ("maxPerBlockImbalance: " + controlInfo[1] + " = " +
        getAmountTokens(controlInfo[1], tokenAdd) + " tokens."));
    myLog((controlInfo[2] != maxTotalImbalancePerToken[tokenAdd]), 0,
        ("maxTotalImbalance: " + controlInfo[2] + " = " +
        getAmountTokens(controlInfo[2], tokenAdd) + " tokens."));


    if (showStepFunctions == 0) {
        if (showStepFuncMsg) {
            myLog(0, 1, "not showing step functions. set showStepFunctions = 1 to show it.");
            showStepFuncMsg = 0;
        }
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
};

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

let sanityRatesABI;

async function readSanityRate(sanityRateAddress, reserveAddress, index, tokens) {
    if (index == 0) {
        sanityRatesABIStr = fs.readFileSync(sanityRateABIFile, 'utf8');
        sanityRatesABI = JSON.parse(sanityRatesABIStr);
    }

    myLog(0, 0, '');

    if (sanityRateAdd == 0) {
        myLog(0, 1, ("sanity rate not configured for reserve: " + a2n(reserveAddress, 0)));
        return;
    }

    SanityRates[index] = await new web3.eth.Contract(sanityRatesABI, sanityRateAddress);
    let Sanity = SanityRates[index];

    myLog(0, 0, ("sanity Rates " + index + " address: " + sanityRateAddress ));
    myLog(0, 0, ("-------------------------------------------------------------------"));

    //verify binary as expected.
//    let blockCode = await web3.eth.getCode(sanityRateAddress);
//    let solcCode = '0x' + (solcOutput.contracts[""].runtimeBytecode);
//
//    if (blockCode != solcCode){
//        myLog(1, 0, "blockchain Code:");
//        console.log(blockCode);
//        console.log()
//        myLog(1, 0, "Byte code from block chain doesn't match locally compiled code.")
//        console.log()
//        myLog(0, 0, "Code on blockchain matches locally compiled code");
//    }

    await printAdminAlertersOperators(SanityRates[index]);
    for (let i = 0; i < tokens.length; i++) {
        let rate = await Sanity.methods.tokenRate(tokens[i]).call();
        let diff = await Sanity.methods.reasonableDiffInBps(tokens[i]).call();

        myLog(0, 0, "Token: " + tokens[i] + " rate: " + rate + " reasonableDiffInBps: " + diff);
    }
};

async function validateReserveTokensListedOnNetwork(tokens, reserveAddress) {
    let isListed;
    let keccak;

    console.log();
    console.log("Validate reserve tokens listed on network contract reserve: " + a2n(reserveAddress, 0))
    console.log("-------------------------------------------------------------------------------------------")
    //check tokens listed eth->token and token to eth
    //todo - how to use keccak correctly.
    for (let i = 0; i < tokens.length; i++){
        keccak = await twoStringsSoliditySha(ethAddress, tokens[i]);
        isListedTo = await Network.methods.perReserveListedPairs(reserveAddress, keccak).call();
        if (isListedTo == false) {
            myLog(1, 0, ("eth   to   " + a2n(tokens[i]) + " not listed in kyberNetwork;"))
        }

        keccak = await twoStringsSoliditySha(tokens[i], ethAddress);
        isListedFrom = await Network.methods.perReserveListedPairs(reserveAddress, keccak.toString(16)).call();;
        if (isListedFrom == false) {
            myLog(1, 0, (a2n(tokens[i]) + "   to   eth. not listed in kyberNetwork;"))
        }

        if (isListedFrom == true && isListedTo == true) {
            myLog(0, 0, ("eth to " + a2n(tokens[i]) + " listed both directions."));
        }
    }
};


async function twoStringsSoliditySha(str1, str2) {
    let str1Cut = str1.slice(2);
    let str2Cut = str2.slice(2);
    let combinedSTR = str1Cut + str2Cut;

    // Convert a string to a byte array
    for (var bytes = [], c = 0; c < combinedSTR.length; c += 2)
        bytes.push(parseInt(combinedSTR.substr(c, 2), 16));

    let sha3Res = await web3.utils.sha3(bytes);
    return sha3Res;
};

let adminAlerterMessage = 1;
async function printAdminAlertersOperators(contract) {
    if (printAdminETC == 0) {
        if (adminAlerterMessage) {
            myLog(0, 1, "not showing Admin operator alerter. set printAdminETC = 1 to show it.");
            adminAlerterMessage = 0;
        }
        return;
    }
    myLog(0, 0, ("Admin: " + (a2n(await contract.methods.admin().call(), 1))));
    let pendingAdmin = await contract.methods.pendingAdmin().call();
    myLog(0, (pendingAdmin != 0), ("Pending Admin: " + a2n(pendingAdmin, 1)));
    myLog(0, 0, ("Alerters: " + await contract.methods.getAlerters().call()));
    myLog(0, 0, ("Operators: " + await contract.methods.getOperators().call()));
}

async function init(nodeUrl){
    //web3 instance

    web3 = new Web3(new Web3.providers.HttpProvider(nodeUrl));

    let goodVersion = compareVersions('1.0', web3.version);
    if (goodVersion < 0) {
        myLog(1, 0, "bad web3 version. Please install version 1.0 or higher.");
    }

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

async function readDeploymentOutJSON(filePath) {
    console.log();
    console.log ("reading deployment output json from: " + filePath);
    try{
        deploymentInput = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch(err) {
        console.log(err);
        assert.fail(err.toString());
    }

    let input = deploymentInput;
    let address;

    //tokens
    console.log("reading tokens");
    let tokenInfo = input["tokens"];
    Object.keys(tokenInfo).forEach(function(key) {
        let val = tokenInfo[key];
        let symbol = key;
        let name = val["name"];
        address = (val["address"]).toLowerCase();
        addressesToNames[address] = symbol;
        jsonTokenList.push(address);
    });

    console.log("reading contract addresses");
    address = (input["feeburner"]).toLowerCase();
    addressesToNames[address] = "feeBurner";
    feeBurnerAdd = address;

    address = (input["pricing"]).toLowerCase();
    addressesToNames[address] = "conversionRate";
    ratesAdd[0] = address;

    address = (input["network"]).toLowerCase();
    addressesToNames[address] = "kyber-network";
    kyberNetworkAdd = address;

    address = (input["reserve"]).toLowerCase();
    addressesToNames[address] = "reserve";
    reservesAdd[0] = address;

    console.log("reading exchanges.");
    let exchanges = input["exchanges"];
    Object.keys(exchanges).forEach(function(key) {
        let exchange = key;
        console.log(exchange);
        let tokenPerEx = exchanges[key];
        let tokenNames = Object.keys(tokenPerEx);
        let exchangeWithdrawAdd = 0;
        if (tokenPerEx[tokenNames[0]] == tokenPerEx[tokenNames[1]]) {
            //seems like same withdrawal address for all tokens.
            exchangeWithdrawAdd = tokenPerEx[tokenNames[0]];
            addressesToNames[exchangeWithdrawAdd.toLowerCase()] = exchange + "-withdraw";
            jsonWithdrawAddresses.push(exchangeWithdrawAdd.toLowerCase());
//            console.log("addressesToNames[tokenPerEx[tokenNames[0]]] " + addressesToNames[tokenPerEx[tokenNames[0]]]);
        }

        Object.keys(tokenPerEx).forEach(function(key) {
            address = (tokenPerEx[key]).toLowerCase();
            if (address != exchangeWithdrawAdd) {
                let name = exchange + "-" + key;
                addressesToNames[address] = name;
                jsonWithdrawAddresses.push(address);
            } else {
//                console.log("same withdraw address")
            }
        });
    });
};

async function readDeploymentInJSON(filePath) {
    console.log();
    console.log ("reading deployment input json from: " + filePath);
    try{
        deploymentInput = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch(err) {
        console.log(err);
        assert.fail(err.toString());
    }

    let input = deploymentInput;
    let address;

    //tokens
    console.log("reading tokens");
    let tokenInfo = input["tokens"];
    Object.keys(tokenInfo).forEach(function(key) {
        let tokenData = tokenInfo[key];
        jsonVerifyTokenData(tokenData, key);
    });

    // add ether to arrays
    decimalsPerToken[ethAddress] = 18;
    addressesToNames[ethAddress] = 'ETH';


    deployOutputJsonPath = './' + input["output filename"];
    myLog(0, 0, ("deploy Script output file: " + deployOutputJsonPath));
};


async function jsonVerifyTokenData (tokenData, symbol) {

    let name = tokenData["name"];
    let address = (tokenData["address"]).toLowerCase();
    let decimals = tokenData["decimals"];

    // read from web: symbol, name, decimal and see matching what we have



    minRecordResolutionPerToken[address] = tokenData["minimalRecordResolution"];
    maxPerBlockImbalancePerToken[address] = tokenData["maxPerBlockImbalance"];
    maxTotalImbalancePerToken[address] = tokenData["maxTotalImbalance"];
    decimalsPerToken[address] = decimals;

    addressesToNames[address] = symbol;
};

async function readAccountsJSON(filePath) {
    console.log();

    let accInput;
    console.log ("reading accounts json from: " + filePath);
    try{
        accInput = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch(err) {
        console.log(err);
        assert.fail(err.toString());
    }

    let address;

    //tokens
    let accounts = accInput["accounts"];
    Object.keys(accounts).forEach(function(key) {
        address = (accounts[key]).toLowerCase();

        addressesToNames[address] = key;
        console.log(key + " " + address);
    });
    addressesToNames["0x0000000000000000000000000000000000000000"] = "none";
};

function getAmountTokens(amountTwei, tokenAdd) {
    let decimals = decimalsPerToken[tokenAdd];
//    console.log("decimals " + decimals + "amountTwei " + amountTwei)
    let amount = web3.utils.toBN(amountTwei);
    let factor = web3.utils.toBN(10).pow(web3.utils.toBN(decimals));
    return (amount.div(factor).toString());
}


//address to name
function a2n(address, showAddWithName) {
    let name;
    if (useNamesForAddresses){
        try {
            name =  addressesToNames[address.toLowerCase()];
            if (showAddWithName) {
                name += " " + address.toLowerCase();
            }
        } catch(e) {
            name = address;
        };
    } else {
        name = address;
    }

    return name;
}
function bpsToPercent (bpsValue) {
    return (bpsValue / 100);
};

function myLog(error, highlight, string) {
    if (error) {
        console.error(string);
        console.log('\x1b[31m%s\x1b[0m', string);
    } else if (highlight) {
        console.log('\x1b[33m%s\x1b[0m', string);
    } else {
        console.log('\x1b[32m%s\x1b[0m', string);
    }
};



