#!/usr/bin/env node

const Web3 = require("web3");
const fs = require("fs");
const path = require('path');
const RLP = require('rlp');
const BN = Web3.utils.BN;

process.on('unhandledRejection', console.error.bind(console))

const { configPath, gasPriceGwei, printPrivateKey, rpcUrl, signedTxOutput, dontSendTx, networkAddress, chainId: chainIdInput } = require('yargs')
    .usage('Usage: $0 --config-path [path] --gas-price-gwei [gwei] --print-private-key [bool] --rpc-url [url] --signed-tx-output [path] --dont-send-tx [bool] --network-address [address] --chain-id')
    .demandOption(['configPath', 'gasPriceGwei', 'rpcUrl', 'networkAddress'])
    .boolean('printPrivateKey')
    .boolean('dontSendTx')
    .argv;
let web3 = new Web3(new Web3.providers.HttpProvider(rpcUrl));

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
const gasPrice = new BN(gasPriceGwei).mul(new BN(10).pow(new BN(9)));
const signedTxs = [];
let nonce;
let chainId = chainIdInput;

async function sendTx(txObject, gasLimit) {
  const txTo = txObject._parent.options.address;

  try {
    gasLimit = (gasLimit == undefined) ? await txObject.estimateGas() : gasLimit;
    gasLimit = Math.round(1.1 * gasLimit);
  }
  catch (e) {
    gasLimit = 800000;
  }

  if(txTo !== null) {
    gasLimit = 800000;
  }

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

async function deployContract(solcOutput, contractName, name, ctorArgs) {

  const actualName = contractName;
  const contract = solcOutput.contracts[actualName][name];
  const bytecode = contract["evm"]["bytecode"]["object"];
  const abi = contract['abi'];
  const myContract = new web3.eth.Contract(abi);

  const deploy = myContract.deploy({data:"0x" + bytecode, arguments: ctorArgs});
  let address = "0x" + web3.utils.sha3(RLP.encode([sender,nonce])).slice(12).substring(14);
  address = web3.utils.toChecksumAddress(address);

  await sendTx(deploy, 6500000);

  myContract.options.address = address;

  return [address,myContract];
}

//addresses
let reserveAddress;
let pricingAddress;

//contracts
let reserveContract;
let pricingContract;

//permissions
let reservePermissions;
let pricingPermissions;

let whitelistAddresses = {};

const ethAddress = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
let token;
const tokenNameToAddress = { "ETH" : ethAddress };


function parseInput( jsonInput ) {
    // token
    const tokenInfo = jsonInput["token"];
    const symbol = tokenInfo.symbol;
    const name = tokenInfo.name;
    const address = tokenInfo.address;
    tokenNameToAddress[symbol] = address;
    token = address;

    //withdrawAddresses
    whitelistAddresses = jsonInput["whitelistedAddresses"];

    //permissions
    reservePermissions = jsonInput.permission["reserve"];
    pricingPermissions = jsonInput.permission["pricing"];

    // output file name
    outputFileName = jsonInput["output filename"];
};

async function setPermissions(contract, permJson) {
  for(let i = 0 ; i < permJson.operators.length ; i++ ) {
    const operator = permJson.operators[i];
    console.log(`adding operator: ${operator}`);
    await sendTx(contract.methods.addOperator(operator));
  }

  for(let i = 0 ; i < permJson.alerters.length ; i++ ) {
    const alerter = permJson.alerters[i];
    console.log(`adding alerter: ${alerter}`);
    await sendTx(contract.methods.addAlerter(alerter));
  }

  const admin = permJson.admin;
  console.log(`transferring admin to ${admin}`);
  await sendTx(contract.methods.transferAdminQuickly(admin));
}


async function main() {
  nonce = await web3.eth.getTransactionCount(sender);
  console.log("nonce",nonce);

  chainId = chainId || await web3.eth.net.getId()
  console.log('chainId', chainId);
  console.log("starting compilation");
  output = await require("./compileContracts.js").compileContracts("sol4");
  // console.log(output);
  console.log("finished compilation");

  web3 = new Web3(new Web3.providers.HttpProvider(rpcUrl));

  if (!dontSendTx) {
    await waitForEth();
  }

  await deployPricingContract(output);
  await deployReserveContract(output);
  await connectPricingToReserve();
  await setWhitelistAddresses();
  await handoverPermissions();

  console.log("last nonce is", nonce);

  printParams(JSON.parse(content));
  const signedTxsJson = JSON.stringify({ from: sender, txs: signedTxs }, null, 2);
  if (signedTxOutput) {
    fs.writeFileSync(signedTxOutput, signedTxsJson);
  }
}

async function deployPricingContract(output) {
  console.log("deploying pricing contract");
  [pricingAddress,pricingContract] = await deployContract(output, "LiquidityConversionRates.sol", "LiquidityConversionRates", [sender,token]);
  console.log(`pricingAddress: ${pricingAddress}`)
}

async function deployReserveContract(output) {
  console.log("deploying reserve contract");
  [reserveAddress,reserveContract] = await deployContract(output, "KyberReserve.sol", "KyberReserve", [networkAddress, pricingAddress, sender]);
  console.log(`reserveAddress: ${reserveAddress}`)
}

async function connectPricingToReserve() {
  console.log('point pricing to reserve');
  await sendTx(pricingContract.methods.setReserveAddress(reserveAddress));
}

async function setWhitelistAddresses() {
  console.log("whitelist deposit addresses");
  for (tokenSymbol of Object.keys(whitelistAddresses)) {
    let tokenAddress = tokenNameToAddress[tokenSymbol];
    let depositAddresses = whitelistAddresses[tokenSymbol];
    for (let depositAddress of depositAddresses) {
      console.log(`allowing ${tokenSymbol} to be withdrawn to ${depositAddress}`);
      await sendTx(reserveContract.methods.approveWithdrawAddress(tokenAddress, depositAddress, true));
    }
  }
}

async function handoverPermissions() {
  console.log("Setting permissions for pricing");
  await setPermissions(pricingContract, pricingPermissions);
  console.log("Setting permissions for reserve");
  await setPermissions(reserveContract, reservePermissions);
}


function printParams(jsonInput) {
    dictOutput = {};
    dictOutput["token"] = jsonInput.token;
    dictOutput["whitelistedAddresses"] = jsonInput.whitelistedAddresses;
    dictOutput["permission"] = jsonInput.permission;
    dictOutput["reserve"] = reserveAddress;
    dictOutput["pricing"] = pricingAddress;
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
    console.log(`Sender: ${sender}`)
    const balance = await web3.eth.getBalance(sender);
    console.log("waiting for balance to account " + sender);
    if(balance.toString() !== "0") {
      console.log("received " + balance.toString() + " wei");
      return;
    }
    else await sleep(10000);
  }
}


let filename;
let content;

try{
  content = fs.readFileSync(configPath, 'utf8');
  parseInput(JSON.parse(content));
}
catch(err) {
  console.log(err);
  process.exit(-1)
}

main();
