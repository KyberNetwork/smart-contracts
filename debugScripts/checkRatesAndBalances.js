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
  "Utils.sol" : fs.readFileSync(contractPath + 'Utils.sol', 'utf8'),
  "FeeBurnerInterface.sol" : fs.readFileSync(contractPath + 'FeeBurnerInterface.sol', 'utf8'),
  "VolumeImbalanceRecorder.sol" : fs.readFileSync(contractPath + 'VolumeImbalanceRecorder.sol', 'utf8'),
  "WhiteListInterface.sol" : fs.readFileSync(contractPath + 'WhiteListInterface.sol', 'utf8'),
  "KyberNetwork.sol" : fs.readFileSync(contractPath + 'KyberNetwork.sol', 'utf8'),
  "KyberReserveInterface.sol" : fs.readFileSync(contractPath + 'KyberReserveInterface.sol', 'utf8'),
  "Withdrawable.sol" : fs.readFileSync(contractPath + 'Withdrawable.sol', 'utf8'),
  "KyberReserve.sol" : fs.readFileSync(contractPath + 'KyberReserve.sol', 'utf8'),
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
let Reserves = [];
let ConversionRates = [];         // one per reserve

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
let jsonReserveAdd;

let kyberNetworkAdd = '0x0';
let ouputLogString = "";
let ouputErrString = "";
let nodeId = 0;

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
const solcOutputPath = "./solcNetworkOuput.json";


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

    numReserves = await Network.methods.getNumReserves().call();
    let reservesAddresses = await Network.methods.getReserves().call();
    for (let i = 0; i < numReserves; i++) {
        reservesAdd[i] =  (reservesAddresses[i]).toLowerCase();
        myLog((i == 0 && jsonReserveAdd != reservesAdd[0]), 0, ("reserveAdd " + i + ": " + reservesAdd[i]));
    }

    // now reserves
    for (let i = 0; i < numReserves; i++) {
        await readReserve(reservesAdd[i], i, (reservesAdd[i] == jsonReserveAdd));
    }
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


    //read addresses
    let enabled = await await Reserve.methods.tradeEnabled().call();
    myLog((enabled == false), 0, ("trade enabled = " + enabled));

    ratesAdd[index] = (await Reserve.methods.conversionRatesContract().call()).toLowerCase();
    myLog((index == 0 && jsonRatesAdd != ratesAdd[0]), 0, ("ratesAdd " + index + ": " + ratesAdd[index]));

    await reportReserveBalance(reserveAdd);

    //call contracts
    await readConversionRate(ratesAdd[index], reserveAdd, index, isKyberReserve);
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

    tokensPerReserve[index] = await Rate.methods.getListedTokens().call();

    let toks = tokensPerReserve[index];
    let tokNames = '';
    toks.forEach(function(name){
        tokNames += a2n(name) + " ";
    });

    myLog(0, 0, "token list: " + tokNames);

    let numTokens = tokensPerReserve[index].length;

    for (let i = 0; i < numTokens; i++) {
        await readTokenRatesInConversionRate(conversionRateAddress, tokensPerReserve[index][i], index, isKyberReserve);
    }
};

async function readTokenRatesInConversionRate(conversionRateAddress, tokenAdd, reserveIndex, isKyberReserve) {
    let Rate = ConversionRates[reserveIndex];
    tokenAdd = tokenAdd.toLowerCase();

    myLog(0, 0, '');

    myLog(0, 0, ("token " + a2n(tokenAdd, 1)));
    myLog(0, 0, ("-T---------------------------------------------"));

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

