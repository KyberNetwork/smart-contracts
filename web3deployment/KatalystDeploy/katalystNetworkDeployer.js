#!/usr/bin/env node

const Web3 = require("web3");
const fs = require("fs");
const RLP = require('rlp');
const BN = Web3.utils.BN;
let output;

process.on('unhandledRejection', console.error.bind(console))

const { configPath, gasPriceGwei, printPrivateKey, rpcUrl, signedTxOutput, dontSendTx, chainId: chainIdInput } = require('yargs')
    .usage('Usage: $0 --config-path [path] --gas-price-gwei [gwei] --print-private-key [bool] --rpc-url [url] --signed-tx-output [path] --dont-send-tx [bool] --chain-id')
    .demandOption(['configPath', 'gasPriceGwei', 'rpcUrl'])
    .boolean('printPrivateKey')
    .boolean('dontSendTx')
    .argv;
let web3 = new Web3(new Web3.providers.HttpProvider(rpcUrl));
let privateKey = "0x18ff1b2a1556888ce95e2f10536d8678c02cb863bc6a3047f5ac242ccea3db70";
// const rand = web3.utils.randomHex(7);
// const privateKey = web3.utils.sha3("js sucks" + rand);
// if (printPrivateKey) {
//   console.log("privateKey", privateKey);
//   let path = "privatekey_"  + web3.utils.randomHex(7) + ".txt";
//   fs.writeFileSync(path, privateKey, function(err) {
//       if(err) {
//           return console.log(err);
//       }
//   });
// }
const account = web3.eth.accounts.privateKeyToAccount(privateKey);
const sender = account.address;
const gasPrice = new BN(gasPriceGwei).mul(new BN(10).pow(new BN(9)));
const signedTxs = [];
let nonce;
let chainId = chainIdInput;

console.log("from",sender);

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

  console.log(gasLimit);
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

  await sendTx(deploy, new BN(6500000));

  myContract.options.address = address;

  return [address,myContract];
}

//token addresses
let kncTokenAddress;

//contract addresses: REPLACE IF SOMETHING BREAKS DURING DEPLOYMENT
let tradeLogicAddress = "";
let proxyAddress = "";
let networkAddress = "";
let feeHandlerAddress = "";

//contracts
let tradeLogicContract;
let networkContract;
let proxyContract;
let feeHandlerContract;

//permissions
let tradeLogicPermissions;
let networkPermissions;
let proxyPermissions;

//misc variables needed for contracts deployment, should be obtained from input json
let maxGasPrice = (new BN(50).mul(new BN(10).pow(new BN(9)))).toString();
let negDiffInBps = '15';
let burnBlockInterval = '100';

class Reserve {
  constructor(jsonInput) {
    this.address = jsonInput["address"],
    this.tokens = jsonInput["tokens"],
    this.wallet = jsonInput["rebateWallet"],
    this.id = jsonInput["id"],
    this.isFeePaying = jsonInput["isFeePaying"]
  }
}

// class Wallet {
//   constructor(jsonInput) {
//     this.id = jsonInput["id"];
//     this.fees = jsonInput["fees"]; //custom fees?
//   }
// }

let reserveDataArray = [];
let walletDataArray = [];


const ethAddress = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const zeroAddress = "0x0000000000000000000000000000000000000000";

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

    tradeLogicPermissions = jsonInput.permission["TradeLogic"];
    networkPermissions = jsonInput.permission["Network"];
    proxyPermissions = jsonInput.permission["Proxy"];

    maxGasPrice = jsonInput["max gas price"].toString();
    negDiffInBps = jsonInput["neg diff in bps"].toString();
    burnBlockInterval = jsonInput["burn block interval"].toString();

    kncTokenAddress = jsonInput["addresses"].knc;

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
  console.log('starting compilation');
  output = await require("../compileContracts.js").compileContracts("v5");
  console.log("finished compilation");

  //reinstantiate web3 (solc overwrites something)
  web3 = new Web3(new Web3.providers.HttpProvider(rpcUrl));
  if (!dontSendTx) {
    await waitForEth();
  }

  //deployment: Replace contract addresses variables on top should something break during deployment
  await deployTradeLogicContract(output);
  await deployNetworkContract(output);
  await deployProxyContract(output);
  await deployFeeHandlerContract(output);

  await setNetworkAddressInTradeLogic();
  await setContractsInNetwork();
  await setNetworkInProxy();
  await setTempOperatorToNetwork();
  //   await setDAOContractInFeeHandler() and in network;
  await addReservesToNetwork();
  await listTokensForReserves();
  await configureAndEnableNetwork();

  await removeTempOperatorFromNetwork();
  await setPermissionsInProxy();
  await setPermissionsInNetwork();
  await setPermissionsInTradeLogic();

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
    dictOutput["addresses"] = jsonInput.addresses;
    dictOutput["reserves"] = jsonInput.reserves;
    dictOutput["wallets"] = jsonInput.wallets;
    dictOutput["permission"] = jsonInput.permission;
    dictOutput["max gas price"] = jsonInput["max gas price"];
    dictOutput["neg diff in bps"] = jsonInput["neg diff in bps"];
    dictOutput["burn block interval"] = jsonInput["burn block interval"];
    dictOutput["trade logic"] = tradeLogicAddress;
    dictOutput["network"] = networkAddress;
    dictOutput["proxy"] = proxyAddress;
    dictOutput["fee handler"] = feeHandlerAddress;
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

async function deployTradeLogicContract(output) {
    if (tradeLogicAddress == "") {
        console.log("deploying trade logic");
        [tradeLogicAddress, tradeLogicContract] = await deployContract(output, "KyberTradeLogic.sol", "KyberTradeLogic", [sender]);
        console.log(`tradeLogic: ${tradeLogicAddress}`);
    } else {
        console.log("Instantiating trade logic...");
        tradeLogicContract = new web3.eth.Contract(JSON.parse(
            output.contracts["KyberTradeLogic.sol"]["KyberTradeLogic"].abi), tradeLogicAddress
        );
    }
}

async function deployNetworkContract(output) {
    if (networkAddress == "") {
        console.log("deploying kyber network");
        [networkAddress, networkContract] = await deployContract(output, "KyberNetwork.sol", "KyberNetwork", [sender]);
        console.log(`network: ${networkAddress}`);
    } else {
        console.log("Instantiating network...");
        networkContract = new web3.eth.Contract(JSON.parse(
            output.contracts["KyberNetwork.sol:KyberNetwork"].abi), networkAddress
        );
    }
}

async function deployProxyContract(output) {
    if (proxyAddress == "") {
        console.log("deploying KNProxy");
        [proxyAddress, proxyContract] = await deployContract(output, "KyberNetworkProxy.sol", "KyberNetworkProxy", [sender]);
        console.log(`KNProxy: ${proxyAddress}`);
    } else {
        console.log("Instantiating proxy...");
        proxyContract = new web3.eth.Contract(JSON.parse(
            output.contracts["KyberNetworkProxy.sol:KyberNetworkProxy"].abi), proxyAddress
        );
    }
}

async function deployFeeHandlerContract(output) {
    if (feeHandlerAddress == "") {
        console.log("deploying feeHandler");
        [feeHandlerAddress, feeHandlerContract] = await deployContract(
            output, "FeeHandler.sol", "FeeHandler", 
            [sender, proxyAddress, networkAddress, kncTokenAddress, burnBlockInterval]
        );
        console.log(`Fee Handler: ${feeHandlerAddress}`);
    } else {
        console.log("Instantiating feeHandler...");
        feeHandlerContract = new web3.eth.Contract(JSON.parse(
            output.contracts["FeeHandler.sol:FeeHandler"].abi), feeHandlerAddress
        );
    }
}

async function setNetworkAddressInTradeLogic() {
  console.log("set network in trade logic");
  await sendTx(tradeLogicContract.methods.setNetworkContract(networkAddress));
}

async function setContractsInNetwork() {
    console.log("set feeHandler and tradeLogic in network");
    await sendTx(networkContract.methods.setContracts(
        feeHandlerAddress, tradeLogicAddress, zeroAddress
    ));

    console.log("set proxy in network");
    await sendTx(networkContract.methods.addKyberProxy(proxyAddress));
}

async function setNetworkInProxy() {
    console.log("setting network in proxy");
    await sendTx(proxyContract.methods.setKyberNetwork(networkAddress));
}
  
async function setTempOperatorToNetwork() {
  // add operator to network
  console.log("set temp operator: network");
  await sendTx(networkContract.methods.addOperator(sender));
}

async function addPermissionlessListerToNetwork() {
  // set permissionless orderbook lister as network operator
  console.log("network - set permissionless lister");
  await sendTx(networkContract.methods.addOperator(permissionlessOrderbookReserveListerAddress));
}

async function addReservesToNetwork() {
  // add reserve to network
  console.log("Add reserves to network");
  for (let i = 0 ; i < reserveDataArray.length ; i++) {
    const reserve = reserveDataArray[i];
    console.log(`At index ${i} of reserve array`);
    console.log(`Adding reserve ${reserve.address}`);
    await sendTx(networkContract.methods.addReserve(reserve.address, reserve.id, reserve.isFeePaying, reserve.wallet));
  }
}

async function listTokensForReserves() {
    for (let i = 0 ; i < reserveDataArray.length ; i++) {
        const reserve = reserveDataArray[i];
        const tokens = reserve.tokens;
        for (let j = 0 ; j < tokens.length ; j++) {
            token = tokens[j];
            console.log(`listing token ${token.address} for reserve ${reserve.address}`);
        await sendTx(networkContract.methods.listPairForReserve(reserve.address,token.address,token.ethToToken,token.tokenToEth,true));
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
}

async function removeTempOperatorFromNetwork() {
    console.log("network - remove temp operator");
    await sendTx(networkContract.methods.removeOperator(sender));
}

async function setPermissionsInNetwork() {
    await setPermissions(networkContract, networkPermissions);
}

async function setPermissionsInProxy() {
    await setPermissions(proxyContract, proxyPermissions);
}

async function setPermissionsInTradeLogic() {
    await setPermissions(tradeLogicContract, tradeLogicPermissions);
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
