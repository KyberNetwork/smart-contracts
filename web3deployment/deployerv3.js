#!/usr/bin/env node

const Web3 = require("web3");
const fs = require("fs");
const RLP = require('rlp');
const BigNumber = require('bignumber.js')
var output;

process.on('unhandledRejection', console.error.bind(console))

const { configPath, gasPriceGwei, printPrivateKey, rpcUrl, signedTxOutput, dontSendTx, chainId: chainIdInput } = require('yargs')
    .usage('Usage: $0 --config-path [path] --gas-price-gwei [gwei] --print-private-key [bool] --rpc-url [url] --signed-tx-output [path] --dont-send-tx [bool] --chain-id')
    .demandOption(['configPath', 'gasPriceGwei', 'rpcUrl'])
    .boolean('printPrivateKey')
    .boolean('dontSendTx')
    .argv;
const web3 = new Web3(new Web3.providers.HttpProvider(rpcUrl));

const rand = web3.utils.randomHex(7);
const privateKey = web3.utils.sha3("js sucks" + rand);
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
    gasLimit = Math.round(1.1 * gasLimit);
  }
  catch (e) {
    gasLimit = 800 * 1000;
  }

  if(txTo !== null) {
    gasLimit = 800 * 1000;
  }

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

//token addresses
let dgxTokenAddress;
let kncTokenAddress;
let wethTokenAddress;

//contract addresses
let expectedRateAddress;
let factoryAddress;
let feeBurnerAddress;
let feeBurnerWrapperProxyAddress;
let medianizerAddress;
let networkAddress;
let permissionlessOrderbookReserveListerAddress;
let proxyAddress;
let whitelistAddress;
let wrapFeeBurnerAddress;

let expectedRateContract;
let factoryContract;
let feeBurnerContract;
let wrapFeeBurnerContract;
let networkContract;
let permissionlessOrderbookReserveListerContract;

//permissions
let expectedRatePermissions;
let feeBurnerPermissions;
let networkPermissions;
let wrapFeeBurnerPermissions;

//misc variables needed for contracts deployment
let maxGasPrice = 50 * 1000 * 1000 * 1000;
let negDiffInBps = 15;
let taxWalletAddress = 0x0;
let defaultWalletFeesBps = 3000;
let taxFeesBps = 0;
let minExpectedRateSlippage = 300;
let maxOrdersPerTrade = '5';
let minOrderValueUsd = '1000';

class Reserve {
  constructor(jsonInput) {
    this.address = jsonInput["address"];
    this.fees = jsonInput["fees"];
    this.wallet = jsonInput["KNCWallet"];
    this.tokens = jsonInput["tokens"];
  }
}

class Wallet {
  constructor(jsonInput) {
    this.id = jsonInput["id"];
    this.fees = jsonInput["fees"];
  }
}

let reserveDataArray = [];
let walletDataArray = [];


const ethAddress = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

function parseInput( jsonInput ) {
    const reserveData = jsonInput["reserves"];
    const walletData = jsonInput["wallets"];

    // reserve array
    Object.values(reserveData).forEach(function(reserve) {
      reserveDataArray.push(new Reserve(reserve));
    });

    // wallet array
    Object.values(walletData).forEach(function(wallet) {
      walletDataArray.push(new Wallet(wallet));
    });

    networkPermissions = jsonInput.permission["KyberNetwork"];
    feeBurnerPermissions = jsonInput.permission["FeeBurner"];
    wrapFeeBurnerPermissions = jsonInput.permission["WrapFeeBurner"];
    expectedRatePermissions = jsonInput.permission["ExpectedRate"];

    maxGasPrice = jsonInput["max gas price"].toString();
    negDiffInBps = jsonInput["neg diff in bps"].toString();
    minExpectedRateSlippage = jsonInput["min expected rate slippage"].toString();
    defaultWalletFeesBps = jsonInput["default wallet fees bps"].toString();
    taxFeesBps = jsonInput["tax fees bps"].toString();
    taxWalletAddress = jsonInput["tax wallet address"];
    initialKncToEthRatePrecision = jsonInput["KNC to ETH rate"].toString();

    dgxTokenAddress = jsonInput["addresses"].dgx;
    kncTokenAddress = jsonInput["addresses"].knc;
    wethTokenAddress = jsonInput["addresses"].weth;
    medianizerAddress = jsonInput["addresses"].medianizer;
    proxyAddress = jsonInput["addresses"].proxy;
    whitelistAddress = jsonInput["addresses"].whitelist;
    feeBurnerWrapperProxyAddress = jsonInput["addresses"].feeBurnerWrapperProxy;

    // output file name
    outputFileName = jsonInput["output filename"];
};

async function setPermissions(contract, permJson) {
  console.log("set operator(s)");
  for(let i = 0 ; i < permJson.operator.length ; i++ ) {
    const operator = permJson.operator[i];
    console.log(operator);
    await sendTx(contract.methods.addOperator(operator));
  }
  console.log("set alerter(s)");
  for(let i = 0 ; i < permJson.alerter.length ; i++ ) {
    const alerter = permJson.alerter[i];
    console.log(alerter);
    await sendTx(contract.methods.addAlerter(alerter));
  }
  console.log("transferAdminQuickly");
  const admin = permJson.admin;
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
  console.log("finished compilation");

  if (!dontSendTx) {
    await waitForEth();
  }

  // await initialiseContractInstances(output);
  await deployAllContacts(output);
  await setNetworkAddresses();
  await setTempOperatorToContracts();
  await addPermissionlessListerToNetwork();
  await addReservesToStorage();
  await configureAndEnableNetwork();
  await configureFeeBurner();
  await setNonDefaultWalletFees();
  await handoverFeeBurnerToWrapper();
  await setDefaultWalletFees();
  await configureExpectedRate();

  console.log("last nonce is", nonce);
  oneLastThing();
  //printParams(JSON.parse(content));
  const signedTxsJson = JSON.stringify({ from: sender, txs: signedTxs }, null, 2);
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
    dictOutput["max gas price"] = jsonInput["max gas price"];
    dictOutput["neg diff in bps"] = jsonInput["neg diff in bps"];
    dictOutput["min expected rate slippage"] = jsonInput["min expected rate slippage"];
    dictOutput["tax fees bps"] = jsonInput["tax fees bps"];
    dictOutput["network"] = networkAddress;
    dictOutput["feeburner"] = feeBurnerAddress;
    dictOutput["expected rate"] = expectedRateAddress;
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

async function deployAllContacts(output) {
  console.log("deploying kyber network");
  [networkAddress,networkContract] = await deployContract(output, "KyberNetwork.sol:KyberNetwork", [sender]);
  console.log("network", networkAddress);

  console.log("deploying fee burner");
  [feeBurnerAddress, feeBurnerContract] = await deployContract(output, "FeeBurner.sol:FeeBurner", [sender,kncTokenAddress,networkAddress, initialKncToEthRatePrecision]);
  console.log("fee burner", feeBurnerAddress);

  console.log("deploying expected rates");
  [expectedRateAddress, expectedRateContract] = await deployContract(output, "ExpectedRate.sol:ExpectedRate", [networkAddress,kncTokenAddress,sender]);
  console.log("expected rate", expectedRateAddress);

  console.log("deploy orderbook factory");
  [factoryAddress, factoryContract] = await deployContract(output, "OrderListFactory.sol:OrderListFactory", [sender]);
  console.log("factory", factoryAddress);
  
  console.log("deploying permissionless lister");
  [permissionlessOrderbookReserveListerAddress, permissionlessOrderbookReserveListerContract] = await deployContract(
      output, "PermissionlessOrderbookReserveLister.sol:PermissionlessOrderbookReserveLister",
      [
        networkAddress,
        factoryAddress,
        medianizerAddress,
        kncTokenAddress,
        [dgxTokenAddress, wethTokenAddress],
        maxOrdersPerTrade,
        minOrderValueUsd
      ]
  );
  console.log("permissionless orderbook lister", permissionlessOrderbookReserveListerAddress);

  console.log("deploying wrap fee burner");
  [wrapFeeBurnerAddress, wrapFeeBurnerContract] = await deployContract(output, "WrapFeeBurner.sol:WrapFeeBurner", [feeBurnerAddress]);
  console.log("wrap fee burner", wrapFeeBurnerAddress);
}

async function initialiseContractInstances(output) {
  //add production addresses if something breaks during deployment
  networkAddress = "";
  feeBurnerAddress = "";
  expectedRateAddress = "";
  factoryAddress = "";
  permissionlessOrderbookReserveListerAddress = "";
  wrapFeeBurnerAddress = "";

  networkContract = new web3.eth.Contract(JSON.parse(output.contracts["KyberNetwork.sol:KyberNetwork"].interface), networkAddress);
  feeBurnerContract = new web3.eth.Contract(JSON.parse(output.contracts["FeeBurner.sol:FeeBurner"].interface), feeBurnerAddress);
  expectedRateContract = new web3.eth.Contract(JSON.parse(output.contracts["ExpectedRate.sol:ExpectedRate"].interface), expectedRateAddress);
  factoryContract = new web3.eth.Contract(JSON.parse(output.contracts["OrderListFactory.sol:OrderListFactory"].interface), factoryAddress);
  permissionlessOrderbookReserveListerContract = new web3.eth.Contract(
    JSON.parse(output.contracts["PermissionlessOrderbookReserveLister.sol:PermissionlessOrderbookReserveLister"].interface), 
    permissionlessOrderbookReserveListerAddress
  );
  wrapFeeBurnerContract = new web3.eth.Contract(JSON.parse(output.contracts["WrapFeeBurner.sol:WrapFeeBurner"].interface), wrapFeeBurnerAddress);
}

async function setNetworkAddresses() {
  // set proxy of network
  console.log("set proxy of network");
  await sendTx(networkContract.methods.setKyberProxy(proxyAddress));

  // set whitelist
  console.log("set whitelist address");
  if (whitelistAddress != "0x0000000000000000000000000000000000000000") {
    await sendTx(networkContract.methods.setWhiteList(whitelistAddress));
  }

  // set expected rate contract
  console.log("set expected rate address");
  await sendTx(networkContract.methods.setExpectedRate(expectedRateAddress));

  // set fee burner contract
  console.log("set fee burner contract");
  await sendTx(networkContract.methods.setFeeBurner(feeBurnerAddress));
}

async function setTempOperatorToContracts() {
  // add operator to network
  console.log("network - set temp operator");
  await sendTx(networkContract.methods.addOperator(sender));
  console.log("fee burner - set temp operator");
  await sendTx(feeBurnerContract.methods.addOperator(sender));
  console.log("expected rate - set temp operator");
  await sendTx(expectedRateContract.methods.addOperator(sender));
}

async function addPermissionlessListerToNetwork() {
  // set permissionless orderbook lister as network operator
  console.log("network - set permissionless lister");
  await sendTx(networkContract.methods.addOperator(permissionlessOrderbookReserveListerAddress));
}

async function addReservesToStorage() {
  // add reserve to network
  console.log("Add reserves to network");
  for(let i = 0 ; i < reserveDataArray.length ; i++) {
    const reserve = reserveDataArray[i];
    console.log(`Adding reserve ${reserve.address}`);
    await sendTx(networkContract.methods.addReserve(reserve.address,false));
    const tokens = reserve.tokens;
    for(let j = 0 ; j < tokens.length ; j++) {
      token = tokens[j];
      console.log(`listing token ${token.address} for reserve ${reserve.address}`);
      await sendTx(networkContract.methods.listPairForReserve(reserve.address,token.address,token.ethToToken,token.tokenToEth,true));
    }
    
    if (reserve.wallet != '0x0000000000000000000000000000000000000000') {
      console.log(`set fees for reserve ${reserve.address}`);
      await sendTx(feeBurnerContract.methods.setReserveData(reserve.address,
        reserve.fees,
        reserve.wallet));
    }
  }
}

async function configureAndEnableNetwork() {
  // set params
  console.log("network set params");
  await sendTx(networkContract.methods.setParams(maxGasPrice,
                                                 negDiffInBps));

  console.log("network enable");
  await sendTx(networkContract.methods.setEnable(true));

  console.log("network - remove temp operator");
  await sendTx(networkContract.methods.removeOperator(sender));
  await setPermissions(networkContract, networkPermissions);
}

async function configureFeeBurner() {
  // burn fee
  console.log("set KNC to ETH rate");
  await sendTx(feeBurnerContract.methods.setKNCRate());
  if (taxFeesBps != 0) {
    console.log("set tax fees bps");
    await sendTx(feeBurnerContract.methods.setTaxInBps(taxFeesBps));
  }
  if(taxWalletAddress != '' && taxWalletAddress != 0) {
    console.log("set tax wallet address");
    await sendTx(feeBurnerContract.methods.setTaxWallet(taxWalletAddress));
  }
}

async function setNonDefaultWalletFees() {
  //set wallet fees for non-standard fees
  for(let i = 0 ; i < walletDataArray.length; i++) {
    const wallet = walletDataArray[i];
    if (wallet.fees != defaultWalletFeesBps) {
      console.log(`Setting wallet fee of ${wallet.fees} bps for ${wallet.id}`);
      await sendTx(feeBurnerContract.methods.setWalletFees(wallet.id, wallet.fees));
    }
  }
}

async function handoverFeeBurnerToWrapper() {
  console.log("fee burner - remove temp operator");
  await sendTx(feeBurnerContract.methods.removeOperator(sender));
  console.log("fee burner - set fee burner admin to be deployed wrapper fee burner");
  feeBurnerPermissions.admin = wrapFeeBurnerAddress;
  console.log("fee burner - set lister to be one of the operators")
  feeBurnerPermissions.operator.push(permissionlessOrderbookReserveListerAddress);
  await setPermissions(feeBurnerContract, feeBurnerPermissions);
  await setPermissions(wrapFeeBurnerContract, wrapFeeBurnerPermissions);
}

async function setDefaultWalletFees() {
  console.log("set wallet fees using wrapper fee burner for standard fees");
  for(let i = 0 ; i < walletDataArray.length ; i++) {
    const wallet = walletDataArray[i];
    if (wallet.fees == defaultWalletFeesBps) {
      console.log(`Setting wallet fee for ${wallet.id}`);
      await sendTx(wrapFeeBurnerContract.methods.registerWalletForFeeSharing(wallet.id));
    }
  }
}

async function configureExpectedRate() {
  // expected rates
  console.log("expected rate - set slippage to 3%");
  await sendTx(expectedRateContract.methods.setWorstCaseRateFactor(minExpectedRateSlippage));
  console.log("expected rate - set qty factor to 1");
  await sendTx(expectedRateContract.methods.setQuantityFactor(1));
  console.log("expected rate - remove temp operator");
  await sendTx(expectedRateContract.methods.removeOperator(sender));
  await setPermissions(expectedRateContract, expectedRatePermissions);
}

function oneLastThing() {
  console.log("\x1b[41m%s\x1b[0m" ,"REMINDER: Don't forget to send DGX to network contract!!");
}

let filename;
let content;

try{
  content = fs.readFileSync(configPath, 'utf8');
  //console.log(content.substring(2892,2900));
  //console.log(content.substring(3490,3550));
  parseInput(JSON.parse(content));
}
catch(err) {
  console.log(err);
  process.exit(-1)
}

main();

//console.log(deployContract(output, "cont",5));
