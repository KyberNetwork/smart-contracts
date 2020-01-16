#!/usr/bin/env node

const Web3 = require("web3");
const fs = require("fs");
const path = require('path');
const RLP = require('rlp');
const BigNumber = require('bignumber.js')

process.on('unhandledRejection', console.error.bind(console))

const { configPath, gasPriceGwei, printPrivateKey, rpcUrl, signedTxOutput, dontSendTx, networkAddress, chainId: chainIdInput } = require('yargs')
    .usage('Usage: $0 --config-path [path] --gas-price-gwei [gwei] --print-private-key [bool] --rpc-url [url] --signed-tx-output [path] --dont-send-tx [bool] --network-address [address] --chain-id')
    .demandOption(['gasPriceGwei', 'rpcUrl'])
    .boolean('printPrivateKey')
    .boolean('dontSendTx')
    .argv;
const web3 = new Web3(new Web3.providers.HttpProvider(rpcUrl));
const solc = require('solc')

const rand = web3.utils.randomHex(7);
const privateKey = web3.utils.sha3("js sucks" + rand);
//console.log("privateKey", privateKey);

if (printPrivateKey) {
  console.log("privateKey", privateKey);
  let path = "privatekey_"  + web3.utils.randomHex(7) + ".txt";
  fs.writeFileSync(path, privateKey, function(err) {
      if(err) {
          return console.log(err);
      }
  });
}
const account = web3.eth.accounts.privateKeyToAccount(privateKey);
const sender = account.address;
const gasPrice = BigNumber(gasPriceGwei).mul(10 ** 9);
const signedTxs = [];
let nonce;
let chainId = chainIdInput;

console.log("from",sender);

async function sendTx(txObject) {
    const txTo = txObject._parent.options.address;

    let gasLimit;
    try {
        gasLimit = await txObject.estimateGas();
    } catch (e) {
        gasLimit = 500 * 1000;
    }

    if(txTo !== null) {
        gasLimit = 500 * 1000;
    }

    gasLimit *= 1.2;
    gasLimit -= gasLimit % 1;
    //console.log(gasLimit);
    const txData = txObject.encodeABI();
    const txFrom = account.address;
    const txKey = account.privateKey;

    const tx = {
        from : txFrom,
        to : txTo,
        nonce : nonce,
        data : txData,
        gas : gasLimit,
        chainId,
        gasPrice
    };

    const signedTx = await web3.eth.accounts.signTransaction(tx, txKey);
    nonce++;
    // don't wait for confirmation
    signedTxs.push(signedTx.rawTransaction)
    if (!dontSendTx) {
        web3.eth.sendSignedTransaction(signedTx.rawTransaction, {from:sender});
    }
}

async function deployContract(solcOutput, contractName, ctorArgs) {

    const actualName = contractName;
    const bytecode = solcOutput.contracts[actualName].bytecode;

    const abi = solcOutput.contracts[actualName].interface;
    const myContract = new web3.eth.Contract(JSON.parse(abi));
    const deploy = myContract.deploy({data:"0x" + bytecode, arguments: ctorArgs});
    let address = "0x" + web3.utils.sha3(RLP.encode([sender,nonce])).slice(12).substring(14);
    address = web3.utils.toChecksumAddress(address);

    await sendTx(deploy);

    myContract.options.address = address;


    return [address,myContract];
}

const contractPath = path.join(__dirname, "../contracts/");

let reserveAddress;
let conversionRatesAddress;

let reserveContract;
let conversionRatesContract;

let reservePermissions;
let conversionRatesPermissions;

const depositAddresses = [];
let validDurationBlock = 24;
let taxWalletAddress = 0x0;

const ethAddress = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

const tokens = [];
const tokenControlInfo = {};
const tokenNameToAddress = { "ETH" : ethAddress };


function parseInput( jsonInput ) {
    // tokens
    const tokenInfo = jsonInput["tokens"];
    Object.keys(tokenInfo).forEach(function(key) {
      const val = tokenInfo[key];
      const symbol = key;
      const name = val["name"];
      const address = val["address"];

      tokenNameToAddress[symbol] = address;

      tokens.push(address);
      const dict = {
        minimalRecordResolution : val["minimalRecordResolution"],
        maxPerBlockImbalance : val["maxPerBlockImbalance"],
        maxTotalImbalance : val["maxTotalImbalance"]
      };
      tokenControlInfo[address] = dict;
    });

    // exchanges
    const exchangeInfo = jsonInput["exchanges"];
    Object.keys(exchangeInfo).forEach(function(exchange) {
      Object.keys(exchangeInfo[exchange]).forEach(function(token){
        const depositAddress = exchangeInfo[exchange][token];
        const dict = {};
        dict[token] = depositAddress;
        depositAddresses.push(dict);
      });
    });

    reservePermissions = jsonInput.permission["KyberReserve"];
    conversionRatesPermissions = jsonInput.permission["ConversionRates"];
    validDurationBlock = jsonInput["valid duration block"];

    // output file name
    outputFileName = jsonInput["output filename"];
};

async function setPermissions(contract, alerters, operators, admin) {
    console.log("set operator(s) " + contract.address);
    for(let i = 0 ; i < operators.length ; i++ ) {
        const operator = operators[i];
        console.log(operator);
        await sendTx(contract.methods.addOperator(operator));
    }

    console.log("set alerter(s)");
    for(let i = 0 ; i < alerters.length ; i++ ) {
        const alerter = alerters[i];
        console.log(alerter);
        await sendTx(contract.methods.addAlerter(alerter));
    }

    console.log("transferAdminQuickly");
    console.log(admin);
    await sendTx(contract.methods.transferAdminQuickly(admin));
}

async function main() {
    nonce = await web3.eth.getTransactionCount(sender);
    console.log("nonce",nonce);

    chainId = chainId || await web3.eth.net.getId()
    console.log('chainId', chainId);
    console.log('starting compilation');
    output = await require("./compileContracts.js").compileContracts();
    console.log(output.errors)
    console.log("finished compilation");

    if (!dontSendTx) {
        await waitForEth();
    }

    let networkAddress = '0x65bF64Ff5f51272f729BDcD7AcFB00677ced86Cd';
    console.log('network address: ', networkAddress);

    console.log("deploying EnhancedStepFunctions");
    [conversionRatesAddress,conversionRatesContract] = await deployContract(output, "EnhancedStepFunctions.sol:EnhancedStepFunctions", [sender]);
    console.log("enhanced steps fpr pricing contract", conversionRatesAddress);

    console.log("deploying kyber reserve");
    [reserveAddress,reserveContract] = await deployContract(output, "KyberReserve.sol:KyberReserve", [networkAddress,conversionRatesAddress,sender]);

    console.log("reserve", reserveAddress);

    console.log("deploying enhanced step functions wrapper");
    [wrapperAddress, wrapperContract] = await deployContract(output, "WrapConversionRate.sol:WrapConversionRate", [conversionRatesAddress]);

    console.log("wrapperAddress", wrapperAddress);

    let stepsSetterContract;
    let stepsSetterAddress;

    console.log("deploying step function setter.");
    [stepsSetterAddress, stepsSetterContract] = await deployContract(output, "WrapConversionRate.sol:WrapConversionRate", [conversionRatesAddress]);

    operators = ['0xF76d38Da26c0c0a4ce8344370D7Ae4c34B031dea','0xf3d872b9e8d314820dc8e99dafbe1a3feedc27d5']
    admin = '0xf3d872b9e8d314820dc8e99dafbe1a3feedc27d5';

    await setPermissions(reserveContract, operators, operators, admin);
    await setPermissions(wrapperContract, operators, operators, admin);
    await setPermissions(stepsSetterContract, operators, operators, admin);

    operators.push(stepsSetterAddress);
    await setPermissions(conversionRatesContract, operators, operators, admin);
console.log(operators)
    console.log("done for now...")
return;

    // conversion rates
    console.log("conversion rate - add token");
    for( let i = 0 ; i < tokens.length ; i++ ) {
        console.log(tokens[i]);
        await sendTx(conversionRatesContract.methods.addToken(tokens[i]));
    }

    console.log("conversion rate - set valid duration block");
    await sendTx(conversionRatesContract.methods.setValidRateDurationInBlocks(validDurationBlock));
    console.log("conversion rate - setReserveAddress");
    await sendTx(conversionRatesContract.methods.setReserveAddress(reserveAddress));

    console.log("conversion rate - set control info");
    for( let i = 0 ; i < tokens.length ; i++ ) {
    console.log(tokens[i]);
    const dict = tokenControlInfo[tokens[i]];
    await sendTx(conversionRatesContract.methods.setTokenControlInfo(tokens[i],
                                                                     dict.minimalRecordResolution,
                                                                     dict.maxPerBlockImbalance,
                                                                     dict.maxTotalImbalance));
    }

    console.log("conversion rate - enable token trade");
    for( let i = 0 ; i < tokens.length ; i++ ) {
    console.log(tokens[i]);
    const dict = tokenControlInfo[tokens[i]];
    await sendTx(conversionRatesContract.methods.enableTokenTrade(tokens[i]));
    }

    console.log("conversion rate - add temp operator");
    await sendTx(conversionRatesContract.methods.addOperator(sender));
    console.log("conversion rate - set qty step function to 0");
    for( let i = 0 ; i < tokens.length ; i++ ) {
    console.log(tokens[i]);
    await sendTx(conversionRatesContract.methods.setQtyStepFunction(tokens[i],
                                                                    [0],
                                                                    [0],
                                                                    [0],
                                                                    [0]));
    }

    console.log("conversion rate - set imbalance step function to 0");
    for( let i = 0 ; i < tokens.length ; i++ ) {
        console.log(tokens[i]);
        await sendTx(conversionRatesContract.methods.setImbalanceStepFunction(tokens[i],
                                                                        [0],
                                                                        [0],
                                                                        [0],
                                                                        [0]));
    }

    console.log("conversion rate - remove temp operator");
    await sendTx(conversionRatesContract.methods.removeOperator(sender));

    await setPermissions(conversionRatesContract, conversionRatesPermissions);

    console.log("last nonce is", nonce);

    if (signedTxOutput) {
        fs.writeFileSync(signedTxOutput, signedTxsJson);
    }
}

function printParams(jsonInput) {
    dictOutput = {};
    dictOutput["tokens"] = jsonInput.tokens;
    dictOutput["tokens"]["ETH"] = {"name" : "Ethereum", "decimals" : 18, "address" : ethAddress };
    dictOutput["exchanges"] = jsonInput.exchanges;
    dictOutput["permission"] = jsonInput.permission;
    dictOutput["valid duration block"] = jsonInput["valid duration block"];
    dictOutput["reserve"] = reserveAddress;
    dictOutput["pricing"] = conversionRatesAddress;
    dictOutput["network"] = networkAddress;
    const json = JSON.stringify(dictOutput, null, 2);
    console.log(json);
    const outputFileName = jsonInput["output filename"];
    console.log(outputFileName, 'write');
    fs.writeFileSync(outputFileName, json);
}


function sleep(ms){
    return new Promise(resolve=>{
        setTimeout(resolve,ms)
    })
}

async function waitForEth() {
  while(true) {
    const balance = await web3.eth.getBalance(sender);
    console.log("waiting for balance to account " + sender);
    if(balance.toString() !== "0") {
      console.log("received " + balance.toString() + " wei");
      return;
    }
    else await sleep(10000)
  }
}


let filename;
let content;

main();
