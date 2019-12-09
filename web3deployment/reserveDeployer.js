#!/usr/bin/env node

const Web3 = require("web3");
const fs = require("fs");
const path = require('path');
const RLP = require('rlp');
const BigNumber = require('bignumber.js')

process.on('unhandledRejection', console.error.bind(console))

const { configPath, gasPriceGwei, printPrivateKey, rpcUrl, signedTxOutput, dontSendTx, networkAddress, chainId: chainIdInput } = require('yargs')
    .usage('Usage: $0 --config-path [path] --gas-price-gwei [gwei] --print-private-key [bool] --rpc-url [url] --signed-tx-output [path] --dont-send-tx [bool] --network-address [address] --chain-id')
    .demandOption(['configPath', 'gasPriceGwei', 'rpcUrl', 'networkAddress'])
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
  'ConversionRatesInterface.sol': fs.readFileSync(
    contractPath + 'ConversionRatesInterface.sol',
    'utf8'
  ),
  'ConversionRates.sol': fs.readFileSync(
    contractPath + 'reserves/fprConversionRate/ConversionRates.sol',
    'utf8'
  ),
  'OrderbookReserve.sol': fs.readFileSync(
    contractPath +
      'reserves/orderBookReserve/permissionless/OrderbookReserve.sol',
    'utf8'
  ),
  'OrderbookReserveInterface.sol': fs.readFileSync(
    contractPath +
      'reserves/orderBookReserve/permissionless/OrderbookReserveInterface.sol',
    'utf8'
  ),
  'OrderListInterface.sol': fs.readFileSync(
    contractPath +
      'reserves/orderBookReserve/permissionless/OrderListInterface.sol',
    'utf8'
  ),
  'OrderListFactoryInterface.sol': fs.readFileSync(
    contractPath +
      'reserves/orderBookReserve/permissionless/OrderListFactoryInterface.sol',
    'utf8'
  ),
  'OrderIdManager.sol': fs.readFileSync(
    contractPath +
      'reserves/orderBookReserve/permissionless/OrderIdManager.sol',
    'utf8'
  ),
  'PermissionGroups.sol': fs.readFileSync(
    contractPath + 'PermissionGroups.sol',
    'utf8'
  ),
  'ERC20Interface.sol': fs.readFileSync(
    contractPath + 'ERC20Interface.sol',
    'utf8'
  ),
  'SanityRatesInterface.sol': fs.readFileSync(
    contractPath + 'SanityRatesInterface.sol',
    'utf8'
  ),
  'ExpectedRateInterface.sol': fs.readFileSync(
    contractPath + 'ExpectedRateInterface.sol',
    'utf8'
  ),
  'SanityRates.sol': fs.readFileSync(contractPath + 'SanityRates.sol', 'utf8'),
  'ExpectedRate.sol': fs.readFileSync(
    contractPath + 'ExpectedRate.sol',
    'utf8'
  ),
  'SimpleNetworkInterface.sol': fs.readFileSync(
    contractPath + 'SimpleNetworkInterface.sol',
    'utf8'
  ),
  'Utils.sol': fs.readFileSync(contractPath + 'Utils.sol', 'utf8'),
  'Utils2.sol': fs.readFileSync(contractPath + 'Utils2.sol', 'utf8'),
  'FeeBurnerInterface.sol': fs.readFileSync(
    contractPath + 'FeeBurnerInterface.sol',
    'utf8'
  ),
  'VolumeImbalanceRecorder.sol': fs.readFileSync(
    contractPath + 'reserves/VolumeImbalanceRecorder.sol',
    'utf8'
  ),
  'FeeBurner.sol': fs.readFileSync(contractPath + 'FeeBurner.sol', 'utf8'),
  'WhiteListInterface.sol': fs.readFileSync(
    contractPath + 'WhiteListInterface.sol',
    'utf8'
  ),
  'KyberNetwork.sol': fs.readFileSync(
    contractPath + 'KyberNetwork.sol',
    'utf8'
  ),
  'KyberNetworkInterface.sol': fs.readFileSync(
    contractPath + 'KyberNetworkInterface.sol',
    'utf8'
  ),
  'KyberNetworkProxy.sol': fs.readFileSync(
    contractPath + 'KyberNetworkProxy.sol',
    'utf8'
  ),
  'KyberNetworkProxyInterface.sol': fs.readFileSync(
    contractPath + 'KyberNetworkProxyInterface.sol',
    'utf8'
  ),
  'WhiteList.sol': fs.readFileSync(contractPath + 'WhiteList.sol', 'utf8'),
  'KyberReserveInterface.sol': fs.readFileSync(
    contractPath + 'KyberReserveInterface.sol',
    'utf8'
  ),
  'Withdrawable.sol': fs.readFileSync(
    contractPath + 'Withdrawable.sol',
    'utf8'
  ),
  'KyberReserve.sol': fs.readFileSync(
    contractPath + 'reserves/KyberReserve.sol',
    'utf8'
  )
}

let reserveAddress;
let conversionRatesAddress;

let reserveContract;
let conversionRatesContract;

let reservePermissions;
let conversionRatesPermissions;

const depositAddresses = [];
let validDurationBlock = 24;
let taxWalletAddress = 0x0;
let taxFeesBps = 1000;

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


  console.log("deploying conversion rates");
  [conversionRatesAddress,conversionRatesContract] = await deployContract(output, "ConversionRates.sol:ConversionRates", [sender]);
  console.log("deploying kyber reserve");
  [reserveAddress,reserveContract] = await deployContract(output, "KyberReserve.sol:KyberReserve", [networkAddress,conversionRatesAddress,sender]);

  console.log("rates", conversionRatesAddress);
  console.log("reserve", reserveAddress);

  // reserve
  console.log("whitelist deposit addresses");
  for( i = 0 ; i < depositAddresses.length ; i++ ) {
    const dict = depositAddresses[i];
    const tokenSymbol = Object.keys(dict)[0];
    const tokenAddress = tokenNameToAddress[tokenSymbol];
    const depositAddress = dict[tokenSymbol];
    console.log(tokenSymbol,tokenAddress,depositAddress);
    await sendTx(reserveContract.methods.approveWithdrawAddress(tokenAddress,
                                                                depositAddress,
                                                                true));
  }
  await setPermissions(reserveContract, reservePermissions);

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

  printParams(JSON.parse(content));
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
