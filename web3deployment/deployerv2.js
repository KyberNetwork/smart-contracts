#!/usr/bin/env node

const Web3 = require("web3");
const fs = require("fs");
const path = require('path');
const RLP = require('rlp');
const BigNumber = require('bignumber.js')

process.on('unhandledRejection', console.error.bind(console))

const { configPath, gasPriceGwei, printPrivateKey, rpcUrl, signedTxOutput, dontSendTx, chainId: chainIdInput } = require('yargs')
    .usage('Usage: $0 --config-path [path] --gas-price-gwei [gwei] --print-private-key [bool] --rpc-url [url] --signed-tx-output [path] --dont-send-tx [bool] --chain-id')
    .demandOption(['configPath', 'gasPriceGwei', 'rpcUrl'])
    .boolean('printPrivateKey')
    .boolean('dontSendTx')
    .argv;
const web3 = new Web3(new Web3.providers.HttpProvider(rpcUrl));
const solc = require('solc')

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
  }
  catch (e) {
    gasLimit = 500 * 1000;
  }

  if(txTo !== null) {
    gasLimit = 500 * 1000;
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

const contractPath = path.join(__dirname, "../contracts/");

const input = {
  "ConversionRatesInterface.sol" : fs.readFileSync(contractPath + 'ConversionRatesInterface.sol', 'utf8'),
  "ConversionRates.sol" : fs.readFileSync(contractPath + 'ConversionRates.sol', 'utf8'),
  "PermissionGroups.sol" : fs.readFileSync(contractPath + 'PermissionGroups.sol', 'utf8'),
  "ERC20Interface.sol" : fs.readFileSync(contractPath + 'ERC20Interface.sol', 'utf8'),
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
  "KyberNetwork.sol" : fs.readFileSync(contractPath + 'KyberNetwork.sol', 'utf8'),
  "KyberNetworkInterface.sol" : fs.readFileSync(contractPath + 'KyberNetworkInterface.sol', 'utf8'),
  "KyberNetworkProxyInterface.sol" : fs.readFileSync(contractPath + 'KyberNetworkProxyInterface.sol', 'utf8'),
  "KyberNetworkProxy.sol" : fs.readFileSync(contractPath + 'KyberNetworkProxy.sol', 'utf8'),
  "SimpleNetworkInterface.sol" : fs.readFileSync(contractPath + 'SimpleNetworkInterface.sol', 'utf8'),
  "WhiteList.sol" : fs.readFileSync(contractPath + 'WhiteList.sol', 'utf8'),
  "KyberReserveInterface.sol" : fs.readFileSync(contractPath + 'KyberReserveInterface.sol', 'utf8'),
  "Withdrawable.sol" : fs.readFileSync(contractPath + 'Withdrawable.sol', 'utf8'),
  "KyberReserve.sol" : fs.readFileSync(contractPath + 'KyberReserve.sol', 'utf8'),
  "Wrapper.sol" : fs.readFileSync(contractPath + 'mockContracts/Wrapper.sol', 'utf8')
};

let proxyAddress;
let networkAddress;
let reserveAddress;
let conversionRatesAddress;
let whitelistAddress;
let feeBurnerAddress;
let expectedRateAddress;
let wrapperAddress;

let proxyContract;
let networkContract;
let wrapperContract;
let expectedRateContract;

let networkPermissions;
let feeBurnerPermissions;
let expectedRatePermissions;

let maxGasPrice = 50 * 1000 * 1000 * 1000;
let negDiffInBps = 15;
let kncWallet;
let kncToEthRate = 307;
let taxWalletAddress = 0x0;
let taxFeesBps = 1000;
let minExpectedRateSlippage = 300;

class Reserve {
  constructor(jsonInput, name) {
    this.name = name;
    this.address = jsonInput["address"];
    this.fees = jsonInput["fees"];
    this.wallet = jsonInput["KNC wallet"];
    this.tokens = jsonInput["tokens"];
  }
}

class Wallet {
  constructor(jsonInput,name) {
    this.name = name;
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
    Object.keys(reserveData).forEach(function(reserve) {
      reserveDataArray.push(new Reserve(reserveData[reserve],reserve));
    });

    // wallet array
    Object.keys(walletData).forEach(function(wallet) {
      walletDataArray.push(new Wallet(walletData[wallet],wallet));
    });

    networkPermissions = jsonInput.permission["KyberNetwork"];
    feeBurnerPermissions = jsonInput.permission["FeeBurner"];
    expectedRatePermissions = jsonInput.permission["ExpectedRate"];

    maxGasPrice =  web3.utils.toBN(jsonInput["max gas price"]);
    negDiffInBps = web3.utils.toBN(jsonInput["neg diff in bps"]);
    minExpectedRateSlippage = web3.utils.toBN(jsonInput["min expected rate slippage"]);
    kncWallet = jsonInput["KNC wallet"];
    kncToEthRate = web3.utils.toBN(jsonInput["KNC to ETH rate"]);
    taxFeesBps = jsonInput["tax fees bps"];
    taxWalletAddress = jsonInput["tax wallet address"];
    whitelistAddress = jsonInput["whitelist"];

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

  console.log("starting compilation");
  const output = await solc.compile({ sources: input }, 1);
  //console.log(output);
  console.log("finished compilation");

  if (!dontSendTx) {
    await waitForEth();
  }

  console.log("deploying kyber network proxy");
  [proxyAddress,proxyContract] = await deployContract(output, "KyberNetworkProxy.sol:KyberNetworkProxy", [sender]);
  console.log("deploying kyber network");
  [networkAddress,networkContract] = await deployContract(output, "KyberNetwork.sol:KyberNetwork", [sender]);
  console.log("deploying fee burner");
  [feeBurnerAddress, feeBurnerContract] = await deployContract(output, "FeeBurner.sol:FeeBurner", [sender,"0xdd974D5C2e2928deA5F71b9825b8b646686BD200",networkAddress]);
  console.log("deploying expected rates");
  [expectedRateAddress, expectedRateContract] = await deployContract(output, "ExpectedRate.sol:ExpectedRate", [networkAddress,sender]);

  console.log("proxy", proxyAddress);
  console.log("network", networkAddress);
  console.log("feeBurner", feeBurnerAddress);
  console.log("expected rate", expectedRateAddress);

  // set network in proxy
  console.log("set network in proxy");
  await sendTx(proxyContract.methods.setKyberNetworkContract(networkAddress));

  // set permissions
  console.log("set proxy permissions");
  await setPermissions(proxyContract, networkPermissions);

  // set proxy of network
  console.log("set proxy of network");
  await sendTx(networkContract.methods.setKyberProxy(proxyAddress));

  // set whitelist
  console.log("set whitelist address");
  await sendTx(networkContract.methods.setWhiteList(whitelistAddress));

  // set expected rate contract
  console.log("set expected rate address");
  await sendTx(networkContract.methods.setExpectedRate(expectedRateAddress));

  // set fee burner contract
  console.log("set fee burner contract");
  await sendTx(networkContract.methods.setFeeBurner(feeBurnerAddress));

  // add reserve to network
  console.log("Add reserves to network");
  for(let i = 0 ; i < reserveDataArray.length ; i++) {
    const reserve = reserveDataArray[i];
    console.log(reserve.name);
    await sendTx(networkContract.methods.addReserve(reserve.address,true));
    const tokens = reserve.tokens;
    console.log("list reserve tokens");
    for(let j = 0 ; j < tokens.length ; j++) {
      await sendTx(networkContract.methods.listPairForReserve(reserve.address,tokens[j],true,true,true));
    }
    console.log("set reserve fees");
    await sendTx(feeBurnerContract.methods.setReserveData(reserve.address,
                                                          reserve.fees,
                                                          reserve.wallet));
  }

  // set params
  console.log("network set params");
  await sendTx(networkContract.methods.setParams(maxGasPrice,
                                                 negDiffInBps));

  console.log("network enable");
  await sendTx(networkContract.methods.setEnable(true));

  // set permissions
  await setPermissions(networkContract, networkPermissions);

  // burn fee
  console.log("set KNC to ETH rate");
  await sendTx(feeBurnerContract.methods.setKNCRate(kncToEthRate));
  console.log("set tax fees bps");
  await sendTx(feeBurnerContract.methods.setTaxInBps(taxFeesBps));
  if(taxWalletAddress != '' && taxWalletAddress != 0) {
    console.log("set wallet address");
    await sendTx(feeBurnerContract.methods.setTaxWallet(taxWalletAddress));
  }

  console.log("set wallet fees");
  for(let i = 0 ; i < walletDataArray.length ; i++) {
    const wallet = walletDataArray[i];
    console.log(wallet.name,wallet.id,wallet.fees);
    await sendTx(feeBurnerContract.methods.setWalletFees(wallet.id,wallet.fees));
  }

  await setPermissions(feeBurnerContract, feeBurnerPermissions);

  // expected rates
  console.log("expected rate - add temp operator");
  await sendTx(expectedRateContract.methods.addOperator(sender));
  console.log("expected rate - set slippage to 3%");
  await sendTx(expectedRateContract.methods.setWorstCaseRateFactor(minExpectedRateSlippage));
  console.log("expected rate - set qty factor to 1");
  await sendTx(expectedRateContract.methods.setQuantityFactor(1));
  console.log("expected rate - remove temp operator");
  await sendTx(expectedRateContract.methods.removeOperator(sender));

  await setPermissions(expectedRateContract, expectedRatePermissions);


  console.log("last nonce is", nonce);

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
    dictOutput["whitelist params"] = jsonInput["whitelist params"];
    dictOutput["max gas price"] = jsonInput["max gas price"];
    dictOutput["neg diff in bps"] = jsonInput["neg diff in bps"];
    dictOutput["min expected rate slippage"] = jsonInput["min expected rate slippage"];
    dictOutput["KNC wallet"] = kncWallet;
    dictOutput["KNC to ETH rate"] = jsonInput["KNC to ETH rate"];
    dictOutput["tax wallet address"] = jsonInput["tax wallet address"];
    dictOutput["tax fees bps"] = jsonInput["tax fees bps"];
    dictOutput["valid duration block"] = jsonInput["valid duration block"];
    dictOutput["reserve"] = reserveAddress;
    dictOutput["pricing"] = conversionRatesAddress;
    dictOutput["network"] = networkAddress;
    dictOutput["wrapper"] = wrapperAddress;
    dictOutput["feeburner"] = feeBurnerAddress;
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
