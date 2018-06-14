#!/usr/bin/env node

const Web3 = require("web3");
const fs = require("fs");
const path = require('path');
const RLP = require('rlp');
const BigNumber = require('bignumber.js');

const mainnetUrls = ['https://mainnet.infura.io',
                     'https://semi-node.kyber.network',
                     'https://api.mycryptoapi.com/eth',
                     'https://api.myetherapi.com/eth',
                     'https://mew.giveth.io/'];

const mainnetUrl = 'https://mainnet.infura.io';
const kovanPublicNode = 'https://kovan.infura.io';
const ropstenPublicNode = 'https://ropsten.infura.io';

const localURL = 'http://localhost';

let rpcUrl;

let ouputLogString = "";
let ouputErrString = "";


process.on('unhandledRejection', console.error.bind(console));

const {network} = require('yargs')
    .usage('Usage: $0 --network (m-mainnet, r-ropsten, k-kovan)')
    .demandOption(['network'])
    .argv;

const solc = require('solc')


const liquidityReserveAdd = '0x91be8fa21dc21cff073e07bae365669e154d6ee1';

//contract sources
const contractPath = "../contracts/";
//
const input = {
  "ConversionRatesInterface.sol" : fs.readFileSync(contractPath + 'ConversionRatesInterface.sol', 'utf8'),
  "LiquidityFormula.sol" : fs.readFileSync(contractPath + 'LiquidityFormula.sol', 'utf8'),
  "LiquidityConversionRates.sol" : fs.readFileSync(contractPath + 'LiquidityConversionRates.sol', 'utf8'),
  "PermissionGroups.sol" : fs.readFileSync(contractPath + 'PermissionGroups.sol', 'utf8'),
  "ERC20Interface.sol" : fs.readFileSync(contractPath + 'ERC20Interface.sol', 'utf8'),
  "SanityRatesInterface.sol" : fs.readFileSync(contractPath + 'SanityRatesInterface.sol', 'utf8'),
  "Utils.sol" : fs.readFileSync(contractPath + 'Utils.sol', 'utf8'),
  "Withdrawable.sol" : fs.readFileSync(contractPath + 'Withdrawable.sol', 'utf8'),
  "KyberReserve.sol" : fs.readFileSync(contractPath + 'KyberReserve.sol', 'utf8'),
  "KyberReserveInterface.sol" : fs.readFileSync(contractPath + 'KyberReserveInterface.sol', 'utf8'),
};

let solcOutput;
let web3;

const ethAddress = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';


//contract instances
let liquidityConversionRateAdd
let LiqudityConvRateInst;

async function main() {

    myLog(0, 1, "solc version: " + solc.version());

    switch (network){
        case 'm':
            rpcUrl = mainnetUrl;
            break;
        case 'k':
            rpcUrl = kovanPublicNode;
            break;
        case 'r':
            rpcUrl = ropstenPublicNode;
            break;
        default: {
            myLog(1, 0, "error: invalid network parameter, choose: m / r / k");
        }
    }

    web3 = new Web3(new Web3.providers.HttpProvider(rpcUrl));

    myLog(0, 0, "starting compilation");
    solcOutput = await solc.compile({ sources: input }, 1);
    console.log(solcOutput.errors);
    //console.log(output);
    myLog(0, 0, "finished compilation");

    await readReserve(liquidityReserveAdd);

    //call contracts
    await readLiquidityConversionRate(liquidityConversionRateAdd, liquidityReserveAdd);

}

let reserveABI;
let needReadReserveABI = 1;

async function readReserve(reserveAdd){
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

    let Reserve = await new web3.eth.Contract(reserveABI, reserveAdd);

    let abi = solcOutput.contracts["KyberReserve.sol:KyberReserve"].interface;
    ExpectedRate = await new web3.eth.Contract(JSON.parse(abi), reserveAdd);

    myLog(0, 0, '');
    myLog(0, 0, '');

    myLog(0, 0, ("Reserve address: " + reserveAdd));
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

    //read addresses
    let enabled = await await Reserve.methods.tradeEnabled().call();
    myLog((enabled == false), 0, ("trade enabled = " + enabled));

    liquidityConversionRateAdd = (await Reserve.methods.conversionRatesContract().call()).toLowerCase();
    myLog(0, 1, "liquidityConversionRateAdd: " + liquidityConversionRateAdd);
};

async function reportReserveBalance(reserveAddress) {
    myLog(0, 0, '');
    myLog(0, 0, "Current Reserve Balances for reserve: " + reserveAddress);
    myLog(0, 0, "-----------------------------------------------------------");
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

async function readLiquidityConversionRate(liquidityConvRateAddress, reserveAddress) {
    if (needReadRatesABI == 1) {
        needReadRatesABI = 0;
        try {
            let abi = solcOutput.contracts["LiquidityConversionRates.sol:LiquidityConversionRates"].interface;
            conversionRatesABI = JSON.parse(abi);
        } catch (e) {
            myLog(0, 0, e);
            throw e;
        }
    }

    LiqudityConvRateInst = await new web3.eth.Contract(conversionRatesABI, liquidityConvRateAddress);
    Rate = LiqudityConvRateInst;

    myLog(0, 0, '');

    myLog(0, 0, ("Conversion Rate address: " +  liquidityConvRateAddress));
    myLog(0, 0, ("-------------------------------------------------------------------"));


    //verify binary as expected.
    let blockCode = await web3.eth.getCode(liquidityConvRateAddress);
    let solcCode = '0x' + (solcOutput.contracts["LiquidityConversionRates.sol:LiquidityConversionRates"].runtimeBytecode);

    if (blockCode != solcCode){
        myLog(1, 0, "blockchain Code:");
        myLog(0, 0, blockCode);
        myLog(1, 0, "solc Code:");
        myLog(0, 0, solcCode);

        myLog(0, 0, '');
        myLog(1, 0, "Byte code from block chain doesn't match locally compiled code.")
        myLog(0, 0, '')
    } else {
        myLog(0, 0, "Code on blockchain matches locally compiled code");
        myLog(0, 0, '');
    }

    let token = await Rate.methods.token().call();
    myLog(0, 0, "token: " + token);
    let reserveContract = (await Rate.methods.reserveContract().call()).toLowerCase();
    myLog((reserveAddress != reserveContract), 0, "reserveContract: " + reserveContract);
    let numFpBits = await Rate.methods.numFpBits().call();
    myLog(0, 0, "numFpBits: " + numFpBits);
    let formulaPrecision = await Rate.methods.formulaPrecision().call();
    myLog(0, 0, "formulaPrecision: " + formulaPrecision);
    let rInFp = await Rate.methods.rInFp().call();
    myLog(0, 0, "rInFp: " + rInFp);
    let pMinInFp = await Rate.methods.pMinInFp().call();
    myLog(0, 0, "pMinInFp: " + pMinInFp);
    let maxEthCapBuyInFp = await Rate.methods.maxEthCapBuyInFp().call();
    myLog(0, 0, "maxEthCapBuyInFp: " + maxEthCapBuyInFp);
    let maxEthCapSellInFp = await Rate.methods.maxEthCapSellInFp().call();
    myLog(0, 0, "maxEthCapSellInFp: " + maxEthCapSellInFp);
    let maxQtyInFp = await Rate.methods.maxQtyInFp().call();
    myLog(0, 0, "maxQtyInFp: " + maxQtyInFp);
    let feeInBps = await Rate.methods.feeInBps().call();
    myLog(0, 0, "feeInBps: " + feeInBps);
    let collectedFeesInTwei = await Rate.methods.collectedFeesInTwei().call();
    myLog(0, 0, "collectedFeesInTwei: " + collectedFeesInTwei);
    let maxBuyRateInPrecision = await Rate.methods.maxBuyRateInPrecision().call();
    myLog(0, 0, "maxBuyRateInPrecision: " + maxBuyRateInPrecision);
    let minBuyRateInPrecision = await Rate.methods.minBuyRateInPrecision().call();
    myLog(0, 0, "minBuyRateInPrecision: " + minBuyRateInPrecision);
    let maxSellRateInPrecision = await Rate.methods.maxSellRateInPrecision().call();
    myLog(0, 0, "maxSellRateInPrecision: " + maxSellRateInPrecision);
    let minSellRateInPrecision = await Rate.methods.minSellRateInPrecision().call();
    myLog(0, 0, "minSellRateInPrecision: " + minSellRateInPrecision);
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



main();
