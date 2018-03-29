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
  "WrapConversionRate.sol" : fs.readFileSync(contractPath + 'wrapperContracts/WrapConversionRate.sol', 'utf8'),
  "WrapperBase.sol" : fs.readFileSync(contractPath + 'wrapperContracts/WrapperBase.sol', 'utf8')
};

let solcOutput;

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
let ERC20Inst = [];
let ERC20Adds = [];
let kncInst;

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
let deploymentJson;
let addressesToNames = {};
let tokenSymbolToAddress = {};
let jsonTokenList = [];
let jsonKyberTokenList = [];
let jsonWithdrawAddresses = [];
let minRecordResolutionPerToken = {};
let maxPerBlockImbalancePerToken = {};
let maxTotalImbalancePerToken = {};
let decimalsPerToken = {};
let whiteListedAddresses = [];
let jsonTestersCat;
let jsonKYCCat;
let jsonKYCCap;
let jsonUsersCat;
let jsonUsersCap;
let jsonEmailCat;
let jsonEmailCap;
let jsonTestersCap;
let jsonDefaultCap;
let jsonKGTCap;
let jsonWeiPerSGD;
let jsonKGTAddress;
let kgtHolderCategory;
let jsonValidDurationBlock;
let jsonMaxGasPrice;
let jsonNegDiffBps;
let jsonMinExpectedRateSlippage;
let jsonKNCWallet;
let jsonKNC2EthRate;
let jsonTaxFeeBps;
let jsonTaxWalletAddress;
let jsonFeeBurnerAdd;
let jsonRatesAdd;
let jsonWrapConversionRate;
let jsonReserveAdd;

let kyberNetworkAdd = '0x0';
let jsonKNCAddress;
let ouputLogString = "";
let ouputErrString = "";
let nodeId = 0;


// show / not show
// set to 0 to avoid showing in report
//////////////////
const runExpectedRate = 1;
const runWhiteList = 1;
const runFeeBurner = 1;
const printAdminETC = 1;
const showStepFunctions = 1;
const readTokenDataInConvRate = true;
const verifyWhitelistedAddresses = false;
const saveSpyrosDict = false;
const verifyTokenDataOnblockChain = false;
const spyrosDictPath = './spyrosOutputfile.json';

// code
////////
////////
const mainnetUrls = ['https://mainnet.infura.io',
                     'https://semi-node.kyber.network',
                     'https://api.mycryptoapi.com/eth',
                     'https://api.myetherapi.com/eth',
                     'https://mew.giveth.io/'];

const kovanPublicNode = 'https://kovan.infura.io';
const ropstenPublicNode = 'https://ropsten.infura.io';

let infuraUrl = '';
const localURL = 'http://localhost';
const solcOutputPath = "./solcOuput.json";
const SpyrosDict = {};


let deployInputJsonPath = '';

//run the code
main();

async function main (){
    if (processScriptInputParameters() == false) {
        printHelp();
        return;
    }

    await getCompiledContracts();

    await init(infuraUrl);

    if (await readDeploymentJSON(deployInputJsonPath) == false) {
        printHelp();
        return;
    };

    await readKyberNetwork(kyberNetworkAdd);

    //write output logs
    let fileName = deployInputJsonPath + ".log";
    fs.writeFileSync(fileName, ouputLogString, function(err) {
        if(err) {
            return console.log(err);
        }

        myLog(0, 1, "saved log to: " + fileName);
    });

    fileName = deployInputJsonPath + ".err";
    fs.writeFileSync(fileName, ouputErrString, function(err) {
        if(err) {
            return console.log(err);
        }

        myLog(0, 1, "saved error file to: " + fileName);
    });

    if (saveSpyrosDict == true) {
        const spyrosJsonOut = JSON.stringify(SpyrosDict, null, 2);
        fs.writeFileSync(spyrosDictPath, spyrosJsonOut);
    }
}


//functions
///////////
function processScriptInputParameters() {
    if (process.argv.length < 4) {
        myLog(0, 0, '');
        myLog(1, 0, "error: not enough argument. Required 2. Received  " + (process.argv.length - 2) + " arguments.");
        return false;
    }

    switch (process.argv[2]){
        case '1':
        case 'm':
            if (process.argv.length > 4) {
                nodeId = process.argv[4];
            } else {
                nodeId = 0;
            };
            infuraUrl = mainnetUrls[nodeId];
            break;
        case '2':
        case 'k':
            infuraUrl = kovanPublicNode;
            break;
        case '3':
        case 'r':
            infuraUrl = ropstenPublicNode;
            break;
        default: {
            myLog(0, 0, '');
            myLog(1, 0, "error: invalid 1st parameter: " + process.argv[2])
            return false;
        }
    }

    deployInputJsonPath = process.argv[3];

    if (process.argv.length > 4) {
        nodeId = process.argv[4];
    } else {
        nodeId = 0;
    }

}

function printHelp () {
    console.log("usage: \'node readVerifyDeployment.js network inputFile nodeID\'.");
    console.log("network options: m / k / r.  (m = mainnet, k = kovan, r = ropsten)");
    console.log("nodeID: 0 - 3 for different public nodes for mainnet")
    console.log("input file = deployment summary json file. Insert path from current directory.");
    console.log("Ex: \'node readVerifyDeployment.js m mainnet.json\'");
    console.log("Another example: \'node readVerifyDeployment.js k kovanOut.json\'");
}


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
//        myLog(1, 0, "blockchain Code:");
//        myLog(0, 0, blockCode);
        myLog(0, 0, '');
        myLog(1, 0, "Byte code from block chain doesn't match locally compiled code.")
        myLog(0, 0, '')
    } else {
        myLog(0, 0, "Code on blockchain matches locally compiled code");
        myLog(0, 0, '');
    }

    //read addresses and create contract instances.
    feeBurnerAdd = (await Network.methods.feeBurnerContract().call()).toLowerCase();
    whiteListAdd = (await Network.methods.whiteListContract().call()).toLowerCase();
    expectedRateAdd = (await Network.methods.expectedRateContract().call()).toLowerCase();

    myLog(0, 1, ("enable: " + await Network.methods.enabled().call() + "!!!"));
    await printAdminAlertersOperators(Network, "KyberNetwork");
    myLog((feeBurnerAdd!=jsonFeeBurnerAdd), 0, ("feeBurnerAdd: " + feeBurnerAdd));
    myLog((whiteListAdd == 0), 0, ("whiteListAdd: " + whiteListAdd));
    myLog((expectedRateAdd == 0), 0, ("expectedRateAdd: " + expectedRateAdd));

    let maxGas = await Network.methods.maxGasPrice().call();
    myLog((maxGas != jsonMaxGasPrice), maxGas < 10000, ("maxGas: " + maxGas + " = " + (maxGas  / 1000 / 1000 / 1000) + " gwei"));

    let negligibleRateDiff = await Network.methods.negligibleRateDiff().call();
    myLog((negligibleRateDiff != jsonNegDiffBps), 0, ("negligibleRateDiff: " + negligibleRateDiff + " = " + bpsToPercent(negligibleRateDiff) + "%"));


    numReserves = await Network.methods.getNumReserves().call();
    let reservesAddresses = await Network.methods.getReserves().call();
    for (let i = 0; i < numReserves; i++) {
        reservesAdd[i] =  (reservesAddresses[i]).toLowerCase();
        myLog((i == 0 && jsonReserveAdd != reservesAdd[0]), 0, ("reserveAdd " + i + ": " + reservesAdd[i]));
    }

    await readWhiteListData(whiteListAdd);
    await readExpectedRateData(expectedRateAdd);

    // now reserves
    for (let i = 0; i < numReserves; i++) {
        await readReserve(reservesAdd[i], i, (reservesAdd[i] == jsonReserveAdd));
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

    myLog(0, 0, ("white list contract data "));
    myLog(0, 0, ("-------------------------"));

    //verify binary as expected.
    let blockCode = await web3.eth.getCode(whiteListAdd);
    let solcCode = '0x' + (solcOutput.contracts["WhiteList.sol:WhiteList"].runtimeBytecode);

    if (blockCode != solcCode){
//        myLog(1, 0, "blockchain Code:");
//        myLog(0, 0, blockCode);
        myLog(0, 0, '');
        myLog(1, 0, "Byte code from block chain doesn't match locally compiled code.")
        myLog(0, 0, '')
    } else {
        myLog(0, 0, "Code on blockchain matches locally compiled code");
        myLog(0, 0, '');
    }

    await printAdminAlertersOperators(WhiteList, "WhiteList");
    let weiPerSgd = await WhiteList.methods.weiPerSgd().call();
    SpyrosDict["weiPerSgd"] = weiPerSgd.valueOf();
    myLog((weiPerSgd == 0), (weiPerSgd != jsonWeiPerSGD), ("weiPerSgd: " + weiPerSgd + " = " + getAmountTokens(weiPerSgd, ethAddress) + " tokens."));
    let kgtAddress = await WhiteList.methods.kgtToken().call();
    myLog((kgtAddress.toLowerCase() != jsonKGTAddress || kgtAddress == 0), 0, ("KGT Address: " + kgtAddress));
    kgtHolderCategory = parseInt(await WhiteList.methods.kgtHolderCategory().call(), 10);

    myLog(0, 0, '');
    myLog(0, 0, "Category Cap SGD SGD SGD SGD");
    let defaultCap = await WhiteList.methods.categoryCap(0).call();
    myLog((defaultCap != jsonDefaultCap), 1, ("default cap: " + defaultCap + ". (for all users without specific category set)"));

    //see category events
    let categorySetEvents = await WhiteList.getPastEvents("CategoryCapSet", {fromBlock: 0, toBlock: 'latest'});

//    console.log(categorySetEvents);
    let categoriesDict = {};
    let numCategories = 0;

    for(let i = 0; i < categorySetEvents.length; i++) {
       let cat = parseInt(categorySetEvents[i].returnValues.category, 10);
       let sgdCap = categorySetEvents[i].returnValues.sgdCap;
       categoriesDict[cat] = sgdCap;
    };

    for (let cat in categoriesDict) {
        let sgdCap = categoriesDict[cat];
        let category = parseInt(cat, 10);
        if (sgdCap > 0) numCategories ++;
        let isError = false;
        switch (category) {
            case 0:
                if (sgdCap != jsonDefaultCap) {isError = true};
                categoryStr = "default";
                break;
            case jsonTestersCat:
                if (sgdCap != jsonTestersCap) {isError = true};
                categoryStr = "tester";
                break;
            case jsonUsersCat:
                if (sgdCap != jsonUsersCap) {isError = true};
                categoryStr = "user";
                break;
            case kgtHolderCategory:
                if (sgdCap != jsonKGTCap) {isError = true};
                categoryStr = "kgt holder";
                break;
            case jsonEmailCat:
                if (sgdCap != jsonEmailCap) {isError = true};
                categoryStr = "Email listed.";
                break;
            case jsonKYCCat:
                if (sgdCap != jsonKYCCap) {isError = true};
                categoryStr = "KYC.";
                break;
            default:
                isError = true;
                categoryStr = "not listed in json";
        }

        myLog(isError, 0, ("whitelist category " + categoryStr + ": " + cat + " cap: " + sgdCap + " SGD."));
    }

    if (numCategories == 0) {
        myLog(0, 0, '')
        myLog(1, 0, "No category has cap > 0. meaning trading is blocked for all addresses.")
        myLog(0, 0, '')
    }

    if (verifyWhitelistedAddresses != true) return;


    myLog(0, 0, '');
    myLog(0, 0, "Verify all white listed addresses. compare json and whitelisted events from blockchain");
    myLog(0, 0, "--------------------------------------------------------------------------------------");

    //verify whitelisted addresses.
    //all white listing events

    let testersWhiteListed = deploymentJson["whitelist params"]["testers"];
    let usersWhiteListed = deploymentJson["whitelist params"]["users"];

    let whiteListEvents = {};
    let whiteListedArr = [];
    let whiteListedCat3 = [];

    let eventsReference = await WhiteList.getPastEvents("UserCategorySet", {fromBlock: 0, toBlock: 'latest'});
    for(let i = 0; i < eventsReference.length; i++) {
        whiteListedArr.push((eventsReference[i].returnValues.user).toLowerCase());

        //make sure last event sets current value
        whiteListEvents[(eventsReference[i].returnValues.user).toLowerCase()] = eventsReference[i].returnValues.category;
    }

    for (let address in whiteListEvents) {
        console.log(address);
        if (whiteListEvents[address] == 3) {
            whiteListedCat3.push(address.toLowerCase());
        }
    }

    whiteListedArr.sort();
    whiteListedCat3.sort();
    let cat3Str = '';

    for (let i = 0; i < whiteListedCat3.length; i++) {
        cat3Str += whiteListedCat3[i] + "\n";
    };

    let whiteListedCat3Path = './whitelistedCat3.txt';
    fs.writeFileSync(whiteListedCat3Path, cat3Str, function(err) {
        if(err) {
            return console.log(err);
        }

        console.log("Saved cat 3 white listed addresses to: " + whiteListedCat3Path);
    });

    for(let i = 0; i < whiteListedArr.length; i++ ) {
        if (whiteListEvents[whiteListedArr[i]] == 0) {
            continue;
        }

        let addressEventCat = parseInt(whiteListEvents[whiteListedArr[i]], 10);
        let isAddressListedAsTester = false;
        let isAddressListedAsUser = false;
        for (let j = 0; j < testersWhiteListed.length; j++) {
            if (testersWhiteListed[j].toLowerCase() == whiteListedArr[i]) {
                isAddressListedAsTester = true;
                break;
            }
        }
        for (let j = 0; j < usersWhiteListed.length; j++) {
            if (usersWhiteListed[j].toLowerCase() == whiteListedArr[i]) {
                isAddressListedAsUser = true;
                break;
            }
        }
        let isWarning, isError;

        switch (addressEventCat) {
            case jsonUsersCat:
                if (!isAddressListedAsUser) {
                    if (isAddressListedAsTester) isWarning = true;
                    else isError = true;
                }
                break;
            case jsonTestersCat:
                if (!isAddressListedAsTester) {
                    if (isAddressListedAsUser) isWarning = true;
                    else isError = true;
                }
                break;
            default:
                isError = true;
        }

        myLog(isError, isWarning, "Address: " + whiteListedArr[i] + " whitelisted, category: " +
            addressEventCat + ". Tester: " + isAddressListedAsTester + "    User: " + isAddressListedAsUser);
    }

    let numTestersUnlisted = 0;

    //make sure no address from json was left out
    for (let i = 0; i < testersWhiteListed.length; i++) {
        if (whiteListEvents[testersWhiteListed[i].toLowerCase()] != jsonTestersCat.toString(10)) {
            let cat = whiteListEvents[testersWhiteListed[i].toLowerCase()];
            myLog((cat == 0), (cat > 0), "Address: " + testersWhiteListed[i] + " from json, expected cat: " + jsonTestersCat +
                ". Current category: " + cat);
        }
    }

    for (let i = 0; i < usersWhiteListed.length; i++) {
        if (whiteListEvents[usersWhiteListed[i].toLowerCase()] != jsonUsersCat.toString(10)) {
            let cat = whiteListEvents[usersWhiteListed[i].toLowerCase()];
            myLog((cat == 0), (cat > 0), "Address: " + usersWhiteListed[i] + " from json, expected cat: " + jsonUsersCat +
                ". Current category: " + cat);
        }
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
//        myLog(1, 0, "blockchain Code:");
//        myLog(0, 0, blockCode);
        myLog(0, 0, '');
        myLog(1, 0, "Byte code from block chain doesn't match locally compiled code.")
        myLog(0, 0, '')
    } else {
        myLog(0, 0, "Code on blockchain matches locally compiled code");
        myLog(0, 0, '');
    }


    await printAdminAlertersOperators(ExpectedRate, "ExpectedRate");

    let kyberAddress = (await ExpectedRate.methods.kyberNetwork().call()).toLowerCase();
    myLog((kyberAddress != kyberNetworkAdd), 0, ("kyber address: " + kyberAddress));
    let quantityFactor = await ExpectedRate.methods.quantityFactor().call();
    assert(quantityFactor > 0, "quantity factor must be greater then 0.");
    myLog(0, 0, ("quantityFactor: " + quantityFactor));
    let minSlippageFactorInBps = await ExpectedRate.methods.minSlippageFactorInBps().call();
    //todo what is the minimum for minSlippageFactorInBps
    assert(minSlippageFactorInBps > 0, "minSlippageFactorInBps must be greater then 0.");
    myLog((minSlippageFactorInBps != jsonMinExpectedRateSlippage), 0, ("minSlippageFactorInBps: " + minSlippageFactorInBps + " == " + bpsToPercent(minSlippageFactorInBps) + "%"));
};

let reserveABI;
let needReadReserveABI = 1;

async function readReserve(reserveAdd, index, isKyberReserve){
    if (needReadReserveABI == 1) {
        needReadReserveABI = 0;
        try {
            let abi = solcOutput.contracts["KyberReserve.sol:KyberReserve"].interface;
            reserveABI = JSON.parse(abi);
        } catch (e) {
            myLog(0, 0, e);
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
//        myLog(1, 0, "blockchain Code:");
//        myLog(0, 0, blockCode);
        myLog(0, 0, '');
        myLog(1, 0, "Byte code from block chain doesn't match locally compiled code.")
        myLog(0, 0, '')
    } else {
        myLog(0, 0, "Code on blockchain matches locally compiled code");
        myLog(0, 0, '');
    }
    if (isKyberReserve) await printAdminAlertersOperators(Reserve, "KyberReserve");

    //read addresses
    let enabled = await await Reserve.methods.tradeEnabled().call();
    myLog((enabled == false), 0, ("trade enabled = " + enabled));

    let kyber = (await Reserve.methods.kyberNetwork().call()).toLowerCase();
    myLog((kyber != kyberNetworkAdd), 0, ("kyberNetwork " + kyber));
    ratesAdd[index] = (await Reserve.methods.conversionRatesContract().call()).toLowerCase();
    myLog((index == 0 && jsonRatesAdd != ratesAdd[0]), 0, ("ratesAdd " + index + ": " + ratesAdd[index]));
    sanityRateAdd[index] = await Reserve.methods.sanityRatesContract().call();
    myLog(0, 0, ("sanityRateAdd " + index + ": " + sanityRateAdd[index]));

    await reportReserveBalance(reserveAdd);

    await verifyApprovedWithdrawAddress(Reserve, isKyberReserve);

    //call contracts
    await readFeeBurnerDataForReserve(feeBurnerAdd, reserveAdd, index, isKyberReserve);
    await readConversionRate(ratesAdd[index], reserveAdd, index, isKyberReserve);
    await readSanityRate(sanityRateAdd[index], reserveAdd, index, tokensPerReserve[index], isKyberReserve);
};

async function reportReserveBalance(reserveAddress) {
    myLog(0, 0, '');
    myLog(0, 0, "Current Reserve Balances for reserve: " + reserveAddress);
    myLog(0, 0, "-----------S--------------------------------------------P--");
    //ether first
    let ethBal = await web3.eth.getBalance(reserveAddress);
    myLog(0, 0, "Eth: " + ethBal + " wei = " + getAmountTokens(ethBal, ethAddress) + " tokens.");

    //ERC20
    for (let i = 0; i < ERC20Inst.length; i++) {
        let balance = await ERC20Inst[i].methods.balanceOf(reserveAddress).call();
        myLog(0, 0, (a2n(ERC20Adds[i], 0) + ": " + balance + " twei = " + getAmountTokens(balance, ERC20Adds[i]) + " tokens."));
    }
}

async function verifyApprovedWithdrawAddress (reserveContract, isKyberReserve) {
    //verify approved withdrawal addresses are set
    let jsonWithDrawAdds = {};
    if (isKyberReserve) {
        myLog(0, 0, '');
        myLog(0, 0, "Test approved withdrawal addresses per Exchange for reserve");
        myLog(0, 0, "-----------S--------------------------------------------P--");
        let exchanges = deploymentJson["exchanges"];
        for (let exchange in exchanges){
            myLog(0, 0, '');
            myLog(0, 0, "Exchange: " + exchange);
            myLog(0, 0, "--------------------------");
            let tokensInEx = exchanges[exchange];
            for (let token in tokensInEx) {
                let withDrawAdd = tokensInEx[token];
                let tokenAdd = tokenSymbolToAddress[token];
                let sha3 = await twoStringsSoliditySha(tokenAdd, withDrawAdd);
                jsonWithDrawAdds[sha3] = true;
                let isApproved = await reserveContract.methods.approvedWithdrawAddresses(sha3.toString(16)).call();
                myLog((isApproved == false), 0, "Token: " + token + " withdraw address " + withDrawAdd + " approved in reserve: " + isApproved);
            }
        }
    }

    myLog(0, 0, '');
    myLog(0, 0, "Iterating all token approve events. verify approved tokens listed in json.")
    myLog(0, 0, "---------------------------------------------Y-------R-------------------- ")
    // see all events for approve withdraw address
    let eventsReference = await reserveContract.getPastEvents("WithdrawAddressApproved", {fromBlock: 0, toBlock: 'latest'});

//    console.log(eventsReference);
    let sha3ToTokens = {};
    let sha3ToAddresses = {};
    let refSha3 = [];
    let withDrawAdds = [];

    // iterate all withdrawal approve events.
    for(let i = 0 ; i < eventsReference.length ; i++ ) {

        sha3Approved = await twoStringsSoliditySha(eventsReference[i].returnValues.token, eventsReference[i].returnValues.addr);
        withDrawAdds.push(eventsReference[i].returnValues.addr);
        refSha3.push(sha3Approved);
        sha3ToAddresses[sha3Approved] = (eventsReference[i].returnValues.addr).toLowerCase();

        if (eventsReference[i].returnValues.approve == true){
            sha3ToTokens[sha3Approved] = (eventsReference[i].returnValues.token).toLowerCase();
        } else {
            sha3ToTokens[sha3Approved] = '';
        }
    }

    for (let i = 0; i < refSha3.length; i++) {
        let sha3Adds = refSha3[i];
        let isListedInJson = true;
        if (isKyberReserve) isListedInJson = false;

        if (sha3ToTokens[sha3Adds] != '') {
            // address currently approved
            if (isKyberReserve) {
                if (jsonWithDrawAdds[sha3Adds] == true) {
                    isListedInJson = true;
                }
            }
            myLog((isListedInJson == false), 0, "Token: " + a2n(sha3ToTokens[sha3Adds], 0) + " withdrawal address: " +
                sha3ToAddresses[sha3Adds] + " listed in json: " + isListedInJson );
        }
    };
}


async function readFeeBurnerDataForReserve(feeBurnerAddress, reserveAddress, index, isKyberReserve) {
    myLog(0, 0, '');

    if (runFeeBurner == 0) {
        myLog(0, 1, "not showing feeBurner. set runFeeBurner = 1 to show it.");
        return;
    }

    try {
        let abi = solcOutput.contracts["FeeBurner.sol:FeeBurner"].interface;
        FeeBurner = await new web3.eth.Contract(JSON.parse(abi), feeBurnerAddress);
    } catch (e) {
        myLog(0, 0, e);
        throw e;
    }

    myLog(0, 0, ("fee burner data for reserve " + index + ":" + a2n(reserveAddress)));
    myLog(0, 0, ("------O----S----------------------------T--------------------H----"));

    //verify binary as expected.
    let blockCode = await web3.eth.getCode(feeBurnerAddress);
    let solcCode = '0x' + (solcOutput.contracts["FeeBurner.sol:FeeBurner"].runtimeBytecode);

    if (blockCode != solcCode){
//        myLog(1, 0, "blockchain Code:");
//        myLog(0, 0, blockCode);
        myLog(0, 0, '');
        myLog(1, 0, "Byte code from block chain doesn't match locally compiled code.")
        myLog(0, 0, '')
   } else {
       myLog(0, 0, "Code on blockchain matches locally compiled code");
       myLog(0, 0, '');
   }

    if (isKyberReserve) await printAdminAlertersOperators(FeeBurner, "FeeBurner");
    let reserveFees = await FeeBurner.methods.reserveFeesInBps(reserveAddress).call();
    myLog((reserveFees < 10), 0, ("reserveFeesInBps: " + reserveFees + " == " + bpsToPercent(reserveFees) + "%"));
    let KNCWallet = (await FeeBurner.methods.reserveKNCWallet(reserveAddress).call()).toLowerCase();
    let raiseFlag = (KNCWallet == 0);
    if(isKyberReserve) raiseFlag = raiseFlag || (jsonKNCWallet != KNCWallet);
    myLog(raiseFlag, 0, ("reserveKNCWallet: " + KNCWallet));
    let kncWalletBalance = await kncInst.methods.balanceOf(KNCWallet).call();
    let walletTokenBalance = getAmountTokens(kncWalletBalance.valueOf(), jsonKNCAddress);
    myLog((walletTokenBalance.valueOf() < 30), (walletTokenBalance.valueOf() < 70), ("reserveKNCWallet balance: " + walletTokenBalance + " KNC tokens"));

    let feeToBurn = await FeeBurner.methods.reserveFeeToBurn(reserveAddress).call();
    myLog(0, 0, ("reserveFeeToBurn: " + feeToBurn + " twei == " + getAmountTokens(feeToBurn, jsonKNCAddress) + " KNC tokens."));
    let KNCAddress = (await FeeBurner.methods.knc().call()).toLowerCase();
    raiseFlag = isKyberReserve && (KNCAddress != jsonKNCAddress);
    myLog(raiseFlag, 0, ("KNCAddress: " + KNCAddress));
    let kncPerEthRate = await FeeBurner.methods.kncPerETHRate().call();
    SpyrosDict["kncPerEthRate"] = kncPerEthRate.valueOf();
    myLog((kncPerEthRate.valueOf() == 0), (kncPerEthRate != jsonKNC2EthRate), ("kncPerEthRate: " + kncPerEthRate));
    if (isKyberReserve) {
        let kyberNetwork = (await FeeBurner.methods.kyberNetwork().call()).toLowerCase();
        myLog((kyberNetwork != kyberNetworkAdd), 0, ("kyberNetworkAdd: " + kyberNetwork));
        let taxFeeBps = await FeeBurner.methods.taxFeeBps().call()
        myLog((taxFeeBps != jsonTaxFeeBps), 0, ("tax fee in bps: " + taxFeeBps + " = " + bpsToPercent(taxFeeBps) + "%"));
        let taxWalletAdd = await FeeBurner.methods.taxWallet().call()
        myLog((taxWalletAdd.toLowerCase() != jsonTaxWalletAddress.toLowerCase()), 0, ("tax wallet address: " + taxWalletAdd));
    }
    let payedSoFar = await FeeBurner.methods.feePayedPerReserve(reserveAddress).call();
    myLog(0, 0, "Fees payed so far by reserve (burn + tax): " + getAmountTokens(payedSoFar, jsonKNCAddress) + " knc tokens.");


    //todo: get addresses for wallets that receive fees and print addresses + fees.
//    myLog(0, 0, ("reserveFeeToWallet: " + await FeeBurner.methods.reserveFeeToWal let(reserveAddress).call());
}

let conversionRatesABI;
let needReadRatesABI = 1;

async function readConversionRate(conversionRateAddress, reserveAddress, index, isKyberReserve) {
    if (needReadRatesABI == 1) {
        needReadRatesABI = 0;
        try {
            let abi = solcOutput.contracts["ConversionRates.sol:ConversionRates"].interface;
            conversionRatesABI = JSON.parse(abi);
        } catch (e) {
            myLog(0, 0, e);
            throw e;
        }
    }
    ConversionRates[index] = await new web3.eth.Contract(conversionRatesABI, conversionRateAddress);
    Rate = ConversionRates[index];

    myLog(0, 0, '');

    myLog(0, 0, ("Conversion Rate " + index + " address: " +  conversionRateAddress));
    myLog(0, 0, ("--------E-----------------G------------------------R---------------"));


    //verify binary as expected.
    let blockCode = await web3.eth.getCode(conversionRateAddress);
    let solcCode = '0x' + (solcOutput.contracts["ConversionRates.sol:ConversionRates"].runtimeBytecode);

    if (blockCode != solcCode){
//        myLog(1, 0, "blockchain Code:");
//        myLog(0, 0, blockCode);
        myLog(0, 0, '');
        myLog(1, 0, "Byte code from block chain doesn't match locally compiled code.")
        myLog(0, 0, '')
    } else {
        myLog(0, 0, "Code on blockchain matches locally compiled code");
         myLog(0, 0, '');
    }

    if (isKyberReserve && jsonWrapConversionRate != 0) {
        //verify wrapper binary
        let admin = (await Rate.methods.admin().call()).toLowerCase();
        myLog((admin != jsonWrapConversionRate), 0, "Admin is wrapper contract: " + (admin == jsonWrapConversionRate));
        readConversionRateWrapper(jsonWrapConversionRate);
    }

    if(isKyberReserve) await printAdminAlertersOperators(Rate, "ConversionRates");

    let validRateDurationInBlocks = await Rate.methods.validRateDurationInBlocks().call();
    myLog((validRateDurationInBlocks != jsonValidDurationBlock), 0, ("validRateDurationInBlocks: " + validRateDurationInBlocks));
    let reserveContractAdd = (await Rate.methods.reserveContract().call()).toLowerCase();
    myLog((reserveAddress != reserveContractAdd), 0, ("reserveContract: " + reserveContractAdd));
    tokensPerReserve[index] = await Rate.methods.getListedTokens().call();

    let toks = tokensPerReserve[index];
    let tokNames = '';
    toks.forEach(function(name){
        tokNames += a2n(name) + " ";
    });

    myLog(0, 0, "token list: " + tokNames);

    verifyTokenListMatchingDeployJSON(index, tokensPerReserve[index], isKyberReserve);

    await validateReserveTokensListedOnNetwork(tokensPerReserve[index], reserveAddress);

    let numTokens = tokensPerReserve[index].length;

    if (readTokenDataInConvRate == false) return;

    if (isKyberReserve) SpyrosDict["kyber"] = {};
	else SpyrosDict["other" + index] = {};


    myLog(0, 0, ("Verify all json token list is listed in conversion rate contract "));
    myLog(0, 0, "-------E---------------A-----------------------------------------");

    for (let i = 0; i < numTokens; i++) {
        await readTokenDataInConversionRate(conversionRateAddress, tokensPerReserve[index][i], index, isKyberReserve);
    }
};

async function verifyTokenListMatchingDeployJSON (reserveIndex, tokenList, isKyberReserve) {

    myLog(0, 0, '');
    myLog(0, 0, ("Verify all json token list is listed in conversion rate contract "));
    myLog(0, 0, "-------E---------------A-----------------------------------------");

    let jsonToksList;

    if (isKyberReserve) jsonToksList = jsonKyberTokenList;
    else jsonToksList = jsonTokenList;
    jsonToksList.forEach(function(address) {
        if (addressesToNames[address] != "ETH"){
            //Ether will not be listed in the rates contract.
            let listedStr = ' not listed';
            let isListed = 1;
            if (isKyberReserve) isListed = 0;
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

async function readConversionRateWrapper(convRateWrapperAddress) {
    try {
        let abi = solcOutput.contracts["WrapConversionRate.sol:WrapConversionRate"].interface;
        wrapConversionRatesABI = JSON.parse(abi);
    } catch (e) {
        myLog(0, 0, e);
        throw e;
    }

    let WrapConversionRateInst = await new web3.eth.Contract(wrapConversionRatesABI, convRateWrapperAddress);

    myLog(0, 0, '');

    myLog(0, 0, ("Conversion Rates wrapper address: " +  convRateWrapperAddress));
    myLog(0, 0, ("--------------------------------------------------------------------"));


    //verify binary as expected.
    let blockCode = await web3.eth.getCode(convRateWrapperAddress);
    let solcCode = '0x' + (solcOutput.contracts["WrapConversionRate.sol:WrapConversionRate"].runtimeBytecode);

    if (blockCode != solcCode){
//        myLog(1, 0, "blockchain Code:");
//        myLog(0, 0, blockCode);
        myLog(0, 0, '');
        myLog(1, 0, "Byte code from block chain doesn't match locally compiled code.")
        myLog(0, 0, '')
    } else {
        myLog(0, 0, "Code on blockchain matches locally compiled code");
         myLog(0, 0, '');
    }
}

const showStepFuncMsg = 1;

async function readTokenDataInConversionRate(conversionRateAddress, tokenAdd, reserveIndex, isKyberReserve) {
    let Rate = ConversionRates[reserveIndex];
    tokenAdd = tokenAdd.toLowerCase();

    myLog(0, 0, '');

    myLog(0, 0, ("token " + a2n(tokenAdd, 1)));
    myLog(0, 0, ("-T---------------------------------------------"));
    let basic = await Rate.methods.getTokenBasicData(tokenAdd).call();
    myLog((basic[0] == false), (basic[1] == false), ("listed = " + basic[0] + ". Enabled = " + basic[1]));

    let ether = web3.utils.toBN(10).pow(web3.utils.toBN(18));
    let precisionPartial = web3.utils.toBN(10).pow(web3.utils.toBN(12));
    let blockNum = await web3.eth.getBlockNumber();
    let buyRate1Eth = await Rate.methods.getRate(tokenAdd, blockNum, true, ether).call();
    let etherToToken = (web3.utils.toBN(buyRate1Eth.valueOf()).div(precisionPartial)) / 1000000;

    let raiseFlag = isKyberReserve && (buyRate1Eth == 0);
    myLog(raiseFlag, 0, ("for 1 eth. eth to " + a2n(tokenAdd, 0) + " rate is: " + buyRate1Eth +
        " (1 eth = " + etherToToken + " " + a2n(tokenAdd, 0) + ")"));
    let sellRate100Tokens = await Rate.methods.getRate(tokenAdd, blockNum, false, 100).call();
    tokens100ToEth = (web3.utils.toBN(sellRate100Tokens).div(precisionPartial)) / 10000;
    raiseFlag = isKyberReserve && (sellRate100Tokens == 0);
    myLog(raiseFlag, 0, ("for 100 " + a2n(tokenAdd, 0) + " tokens. Token to eth rate is " +
        sellRate100Tokens + " (100 " + a2n(tokenAdd, 0) + " = " + tokens100ToEth + " ether)"));

    //read imbalance info
    let tokenName = a2n(tokenAdd, 0);
    let tokenDict = {};

    let controlInfo = await Rate.methods.getTokenControlInfo(tokenAdd).call();
    //print resolution data
    raiseFlag = isKyberReserve && (controlInfo[0] != minRecordResolutionPerToken[tokenAdd]);
    myLog(0, raiseFlag, ("minRecordResolution: " + controlInfo[0] + " = " +
        getAmountTokens(controlInfo[0], tokenAdd) + " tokens."));

    //print max per block data
    raiseFlag = isKyberReserve && (controlInfo[1] != maxPerBlockImbalancePerToken[tokenAdd]);
    myLog(0, raiseFlag, ("maxPerBlockImbalance: " + controlInfo[1] + " = " +
        getAmountTokens(controlInfo[1], tokenAdd) + " tokens."));
    tokenDict['maxPerBlockImbalance'] = controlInfo[1].valueOf();

    //print max total imbalance data
    raiseFlag = isKyberReserve && (controlInfo[2] != maxTotalImbalancePerToken[tokenAdd]);
    myLog(0, raiseFlag, ("maxTotalImbalance: " + controlInfo[2] + " = " +
        getAmountTokens(controlInfo[2], tokenAdd) + " tokens."));
    tokenDict['maxTotalImbalance'] = controlInfo[2].valueOf();

    if (showStepFunctions == 0) {
        if (showStepFuncMsg) {
            myLog(0, 1, "not showing step functions. set showStepFunctions = 1 to show it.");
            showStepFuncMsg = 0;
        }
        return;
    }

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

    if (isKyberReserve) {
        SpyrosDict["kyber"][tokenName] = tokenDict;
    } else {
		SpyrosDict["other" + reserveIndex][tokenName] = tokenDict;
    }
};

async function getStepFunctionXYArr(tokenAdd, commandID, rateContract) {
    let ValsXY = [];
    let ValsX = [];
    let ValsY = [];

    let lengthX = await rateContract.methods.getStepFunctionData(tokenAdd, commandID, 0).call();

    commandID ++;
    for (let i = 0; i < lengthX; i++) {
        ValsX[i] = getAmountTokens(await rateContract.methods.getStepFunctionData(tokenAdd, commandID, i).call(), tokenAdd);
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
let needSanityRateABI = 1;

async function readSanityRate(sanityRateAddress, reserveAddress, index, tokens, isKyberReserve) {
    if (sanityRateAddress == 0) {
        myLog(0, 0, "");
        myLog(0, 1, ("sanity rate not configured for reserve: " + reserveAddress));
        return;
    }

    if (needSanityRateABI == 1) {
        needSanityRateABI = 0;
        try {
            let abi = solcOutput.contracts["SanityRates.sol:SanityRates"].interface;
            sanityRatesABI = JSON.parse(abi);
        } catch (e) {
            myLog(0, 0, e);
            throw e;
        }
    }

    myLog(0, 0, '');

    SanityRates[index] = await new web3.eth.Contract(sanityRatesABI, sanityRateAddress);
    let Sanity = SanityRates[index];

    myLog(0, 0, ("sanity Rates " + index + " address: " + sanityRateAddress ));
    myLog(0, 0, ("-------------------------------------------------------------------"));

    //verify binary as expected.
    let blockCode = await web3.eth.getCode(sanityRateAddress);
    let solcCode = '0x' + (solcOutput.contracts["SanityRates.sol:SanityRates"].runtimeBytecode);

    if (blockCode != solcCode){
//        myLog(1, 0, "blockchain Code:");
//        myLog(0, 0, blockCode);
        myLog(0, 0, '');
        myLog(0, 0, '');
        myLog(1, 0, "Byte code from block chain doesn't match locally compiled code.")
        myLog(1, 0, "Byte code from block chain doesn't match locally compiled code.")
        return;
    } else {
        myLog(0, 0, "Code on blockchain matches locally compiled code");
        myLog(0, 0, '');
    }

    if(isKyberReserve) await printAdminAlertersOperators(Sanity, "SanityRate");

    for (let i = 0; i < tokens.length; i++) {
        let rate = await Sanity.methods.tokenRate(tokens[i]).call();
        let diff = await Sanity.methods.reasonableDiffInBps(tokens[i]).call();

        myLog(0, 0, "Token: " + a2n (tokens[i], 0) + " rate: " + rate + " reasonableDiffInBps: " + diff);
    }
};

async function validateReserveTokensListedOnNetwork(tokens, reserveAddress) {
    let isListed;
    let keccak;

    myLog(0, 0, '');
    myLog(0, 0, "Validate reserve tokens listed on network contract reserve: " + reserveAddress);
    myLog(0, 0, "-------------------------------------------------------------------------------------------")
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
async function printAdminAlertersOperators(contract, jsonKey) {
    if (printAdminETC == 0) {
        if (adminAlerterMessage) {
            myLog(0, 1, "not showing Admin operator alerter. set printAdminETC = 1 to show it.");
            adminAlerterMessage = 0;
        }
        return;
    }

    let permissionList = deploymentJson["permission"][jsonKey];
    let jsonAdmin;
    let jsonOperators;
    let jsonAlerters;
    try {
        jsonAlerters = permissionList["alerter"];
        jsonOperators = permissionList["operator"];
        jsonAdmin = (permissionList["admin"]).toLowerCase();
    } catch (e) {
        jsonAlerters = '';
        jsonOperators = '';
        jsonAdmin = '';
    }

    //admin
    let admin = await contract.methods.admin().call();
    let isApproved = (admin.toLowerCase() == jsonAdmin);
    myLog((isApproved == false), 0, ("Admin: " + admin + " approved: " + isApproved));
    let pendingAdmin = await contract.methods.pendingAdmin().call();
    myLog((pendingAdmin != 0), 0, ("Pending Admin: " + pendingAdmin));

    //operators
    let operators = await contract.methods.getOperators().call();
    operators.forEach(function (operator) {
        let isApproved = false;
        if (jsonOperators != '') {
            jsonOperators.forEach(function(jsonOperator){
                if (operator.toLowerCase() == jsonOperator.toLowerCase()) {
                    isApproved = true;
                }
            });
        };
        myLog(isApproved == false, 0, "Operator: " + operator + " is approved: " + isApproved);
    });
    if (operators.length == 0) myLog(0, 1, "No operators defined for contract " + jsonKey);

    //alerters
    let alerters = await contract.methods.getAlerters().call();

    alerters.forEach(function (alerter) {
        let isApproved = false;
        if (jsonAlerters != '') {
            jsonAlerters.forEach(function(jsonAlerter){
                if (alerter.toLowerCase() == jsonAlerter.toLowerCase()) {
                    isApproved = true;
                }
            });
        };
        myLog(isApproved == false, 0, "Alerters: " + alerter + " is approved: " + isApproved);
    });
    if (alerters.length == 0) myLog(0, 1, "No alerters defined for contract " + jsonKey);
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

async function readDeploymentJSON(filePath) {
    myLog(0, 0, '');
    myLog(0, 1, "reading deployment json from: " + filePath);
    try{
        deploymentJson = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch(err) {
        myLog(0, 0, err);
        assert.fail(err.toString());
    }

    let json = deploymentJson;
    let address;

    //tokens
    myLog(0, 0, "reading tokens from local json");
//    let tokenInfo = json["tokens"];
    if (verifyTokenDataOnblockChain) {
        myLog(0, 0, '');
        myLog(0, 0, "validate token data on block chain");
        myLog(0, 0, "----------------------------------");
    }

    let tokenInfo = json["tokens"];

    for (let key in tokenInfo) {
        let tokenData = tokenInfo[key];
        await jsonVerifyTokenData(tokenData, key);
    }

    myLog(0, 0, "json - reading contract addresses");
    address = (json["feeburner"]).toLowerCase();
    addressesToNames[address] = "feeBurner";
    jsonFeeBurnerAdd = address;

    address = (json["pricing"]).toLowerCase();
    addressesToNames[address] = "conversionRate";
    jsonRatesAdd = address;

    try {
        address = (json["pricing wrapper"]).toLowerCase();
        addressesToNames[address] = "conversionRateWrapper";
        jsonWrapConversionRate = address;
    } catch(e) {
        jsonWrapConversionRate = 0;
    }


    address = (json["network"]).toLowerCase();
    addressesToNames[address] = "kyber-network";
    kyberNetworkAdd = address;

    address = (json["reserve"]).toLowerCase();
    addressesToNames[address] = "reserve";
    jsonReserveAdd = address;

    myLog(0, 0, "reading exchanges.");
    let exchanges = json["exchanges"];
    Object.keys(exchanges).forEach(function(key) {
        let exchange = key;
        myLog(0, 0, exchange);
        let tokenPerEx = exchanges[key];
        let tokenNames = Object.keys(tokenPerEx);
        let exchangeWithdrawAdd = 0;
        if (tokenPerEx[tokenNames[0]] == tokenPerEx[tokenNames[1]]) {
            //seems like same withdrawal address for all tokens.
            exchangeWithdrawAdd = tokenPerEx[tokenNames[0]];
            addressesToNames[exchangeWithdrawAdd.toLowerCase()] = exchange + "-withdraw";
            jsonWithdrawAddresses.push(exchangeWithdrawAdd.toLowerCase());
        }

        Object.keys(tokenPerEx).forEach(function(key) {
            address = (tokenPerEx[key]).toLowerCase();
            if (address != exchangeWithdrawAdd) {
                let name = exchange + "-" + key;
                addressesToNames[address] = name;
                jsonWithdrawAddresses.push(address);
            } else {
//                myLog(0, 0, "same withdraw address")
            }
        });
    });

    jsonMaxGasPrice = json["max gas price"];
    jsonNegDiffBps = json["neg diff in bps"];
    jsonMinExpectedRateSlippage = json["min expected rate slippage"];
    jsonKNCWallet = (json["KNC wallet"]).toLowerCase();
    jsonKNC2EthRate = json["KNC to ETH rate"];
    try {
        jsonTaxFeeBps = json["tax fees bps"];
        jsonTaxWalletAddress = json["tax wallet address"];
    } catch (e) {
        jsonTaxFeeBps = 2000;
        jsonTaxWalletAddress = 0x0;
    }

    jsonValidDurationBlock = json["valid duration block"];
    jsonKYCCat = deploymentJson["whitelist params"]["KYC category"];
    jsonKYCCap = deploymentJson["whitelist params"]["KYC cap"];
    jsonTestersCat = deploymentJson["whitelist params"]["testers category"];
    jsonTestersCap = deploymentJson["whitelist params"]["testers cap"];
    jsonUsersCat = deploymentJson["whitelist params"]["users category"];
    jsonUsersCap = deploymentJson["whitelist params"]["users cap"];
    jsonEmailCat = deploymentJson["whitelist params"]["email category"];
    jsonEmailCap = deploymentJson["whitelist params"]["email cap"];
    jsonDefaultCap = deploymentJson["whitelist params"]["default cap"];
    jsonKGTAddress = (deploymentJson["whitelist params"]["KGT address"]).toLowerCase();
    jsonKGTCap = deploymentJson["whitelist params"]["KGT cap"];
    try {
        jsonWeiPerSGD = deploymentJson["whitelist params"]["wei per SGD"];
    } catch(e) {
        jsonWeiPerSGD = 1;
    }
};

async function jsonVerifyTokenData (tokenData, symbol) {
    let name = tokenData["name"];
    let address = (tokenData["address"]).toLowerCase();
    let decimals = tokenData["decimals"];
    let internalUse = tokenData["internal use"];

    addressesToNames[address] = symbol;
    tokenSymbolToAddress[symbol] = address;
    jsonTokenList.push(address);
    if (internalUse == true) {
        jsonKyberTokenList.push(address);
    }
    decimalsPerToken[address] = decimals;

    if (symbol == 'ETH') {
        return;
    }

    minRecordResolutionPerToken[address] = tokenData["minimalRecordResolution"];
    maxPerBlockImbalancePerToken[address] = tokenData["maxPerBlockImbalance"];
    maxTotalImbalancePerToken[address] = tokenData["maxTotalImbalance"];

    // read from web: symbol, name, decimal and see matching what we have
    let abi = solcOutput.contracts["MockERC20.sol:MockERC20"].interface;
    let ERC20 = await new web3.eth.Contract(JSON.parse(abi), address);
    if (symbol == 'KNC') {
        kncInst = ERC20;
        jsonKNCAddress = address;
    }
    ERC20Inst.push(ERC20);
    ERC20Adds.push(address);

    //verify token data on blockchain.
    if (verifyTokenDataOnblockChain == false) return;

    if (symbol == "EOS") {
        let rxDecimals = await ERC20.methods.decimals().call();
        myLog((!(rxDecimals == decimals)), 0, "Address: " + address  + " " + symbol + ". Name: " + name + ". Decimals: " + decimals);
        return;
    }

    let rxName = await ERC20.methods.name().call();
    let rxSymbol = await ERC20.methods.symbol().call();
    let rxDecimals = await ERC20.methods.decimals().call();

    if (!(rxSymbol == symbol && rxDecimals == decimals)){
        myLog((rxName != name), 0, "rxName " + rxName + " name " + name);
        myLog((rxSymbol != symbol), 0, "rxSymbol " + rxSymbol + " symbol " + symbol);
        myLog((rxDecimals != decimals), 0, "rxDecimals " + rxDecimals + " decimals " + decimals);
    } else {
        myLog((!(rxSymbol == symbol && rxDecimals == decimals)), 0, "Address: " + address  + " " + symbol + ". Name: " + rxName + ". Decimals: " + decimals);
    }
};

async function readAccountsJSON(filePath) {
    myLog(0, 0, '');

    let accInput;
    console.log ("reading accounts json from: " + filePath);
    try{
        accInput = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch(err) {
        myLog(0, 0, err);
        assert.fail(err.toString());
    }

    let address;

    //tokens
    let accounts = accInput["accounts"];
    Object.keys(accounts).forEach(function(key) {
        address = (accounts[key]).toLowerCase();

        addressesToNames[address] = key;
        myLog(0, 0, key + " " + address);
    });
    addressesToNames["0x0000000000000000000000000000000000000000"] = "none";
};

function getAmountTokens(amountTwei, tokenAdd) {
    let digits = decimalsPerToken[tokenAdd];
//    myLog(0, 0, "decimals " + decimals + "amountTwei " + amountTwei)
    let stringAmount = amountTwei.toString(10);
    let integer = stringAmount.substring(0,stringAmount.length - digits);
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


//address to name
function a2n(address, showAddWithName) {
    let name;
    try {
        name = addressesToNames[address.toLowerCase()];
        if (name === 'undefined') {
            name = address;
        } else if (showAddWithName) {
            name += " " + address.toLowerCase();
        }
    } catch(e) {
        name = address;
    }

    return name;
}


function bpsToPercent (bpsValue) {
    return (bpsValue / 100);
};

async function getCompiledContracts() {
    try{
        solcOutput = JSON.parse(fs.readFileSync(solcOutputPath, 'utf8'));
    } catch(err) {
        console.log(err.toString());
        myLog(0, 0, "starting compilation");
        solcOutput = await solc.compile({ sources: input }, 1);
        //    console.log(solcOutput);
        myLog(0, 0, "finished compilation");
        let solcOutJson = JSON.stringify(solcOutput, null, 2);
        fs.writeFileSync(solcOutputPath, solcOutJson, function(err) {
            if(err) {
                return console.log(err);
            }

            console.log("Saved solc output to: " + solcOutputPath);
        });
    }
}

function myLog(error, highlight, string) {
    if (error) {
//        console.error(string);
        console.log('\x1b[31m%s\x1b[0m', string);
        ouputErrString += "\nerror: " + string;
        ouputLogString += "\nerror: " + string;
    } else if (highlight) {
        console.log('\x1b[33m%s\x1b[0m', string);
        ouputErrString += "\nwarning: " + string;
        ouputLogString += "\nwarning: " + string;
    } else {
        console.log('\x1b[32m%s\x1b[0m', string);
        ouputLogString += "\n     " + string;
    }
};

