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
const rand = web3.utils.randomHex(7);
let privateKey = web3.utils.sha3("js sucks" + rand);
if (printPrivateKey) {
  console.log("privateKey", privateKey);
  let path = "privatekey_"  + web3.utils.randomHex(7) + ".txt";
  fs.writeFileSync(path, privateKey, function(err) {
      if(err) {
          return console.log(err);
      }
  });
}
//REPLACE PRIVATE KEY HERE
// privateKey = "";

//contract addresses: REPLACE IF SOMETHING BREAKS DURING DEPLOYMENT
let matchingEngineAddress = "";
let storageAddress = "";
let networkAddress = "";
let proxyAddress = "";
let feeHandlerAddress = "";
let gasHelperAddress = "";
let stakingAddress = "";
let daoAddress = "";

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

//token addresses
let kncTokenAddress;

//contracts
let feeHandlerContract;
let matchingEngineContract;
let networkContract;
let proxyContract;
let stakingContract;
let storageContract;
let kyberDaoContract;

//permissions
let matchingEnginePermissions;
let networkPermissions;
let proxyPermissions;
let storagePermissions;
let daoOperator;

//misc variables needed for contracts deployment, should be obtained from input json
let isFeeAccounted;
let maxGasPrice = (new BN(50).mul(new BN(10).pow(new BN(9)))).toString();
let negDiffInBps;
let burnBlockInterval;
let epochPeriod;
let startTimestamp;
let networkFeeBps;
let rewardFeeBps;
let rebateFeeBps;

class Reserve {
  constructor(jsonInput, reserveTypes) {
    this.address = jsonInput["address"],
    this.type = reserveTypes[jsonInput["type"]],
    this.tokens = jsonInput["tokens"],
    this.wallet = jsonInput["rebateWallet"],
    this.id = jsonInput["id"]
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
    const reserveTypes = jsonInput["reserveTypes"];
    const reserveData = jsonInput["reserves"];
    const walletData = jsonInput["wallets"];

    // reserve array
    Object.values(reserveData).forEach(function(reserve) {
      reserveDataArray.push(new Reserve(reserve, reserveTypes));
    });

    // wallet array
    Object.values(walletData).forEach(function(wallet) {
      walletDataArray.push(new Wallet(wallet));
    });

    //permissions
    matchingEnginePermissions = jsonInput.permission["MatchingEngine"];
    networkPermissions = jsonInput.permission["Network"];
    proxyPermissions = jsonInput.permission["Proxy"];
    storagePermissions = jsonInput.permission["Storage"];
    daoOperator = jsonInput.permission["KyberDao"]["DaoOperator"]

    //constants
    isFeeAccounted = jsonInput["isFeeAccounted"];
    maxGasPrice = jsonInput["max gas price"].toString();
    negDiffInBps = jsonInput["neg diff in bps"].toString();
    burnBlockInterval = jsonInput["burn block interval"].toString();
    epochPeriod = jsonInput["epoch period"].toString();
    startTimestamp = jsonInput["start timestamp"].toString();;
    networkFeeBps = jsonInput["network fee bps"].toString();;
    rewardFeeBps = jsonInput["reward fee bps"].toString();;
    rebateFeeBps = jsonInput["rebate bps"].toString();;

    kncTokenAddress = jsonInput["addresses"].knc;
    gasHelperAddress = jsonInput["addresses"].gasHelper;

    // output file name
    outputFileName = jsonInput["output filename"];
};

async function setPermissions(contract, contractPermissions) {
    for(let i = 0 ; i < contractPermissions.operators.length ; i++ ) {
      const operator = contractPermissions.operators[i];
      console.log(`adding operator: ${operator}`);
      await sendTx(contract.methods.addOperator(operator));
    }
  
    for(let i = 0 ; i < contractPermissions.alerters.length ; i++ ) {
      const alerter = contractPermissions.alerters[i];
      console.log(`adding alerter: ${alerter}`);
      await sendTx(contract.methods.addAlerter(alerter));
    }
  
    const admin = contractPermissions.admin;
    console.log(`transferring admin to ${admin}`);
    await sendTx(contract.methods.transferAdminQuickly(admin));
  }

const keypress = async () => {
  process.stdin.setRawMode(true)
  return new Promise(resolve => process.stdin.once('data', () => {
    process.stdin.setRawMode(false)
    resolve()
  }))
}

async function pressToContinue() {
  console.log("Checkpoint... Press any key to continue!");
  await keypress();
}

async function main() {
  nonce = await web3.eth.getTransactionCount(sender);
  console.log("nonce",nonce);

  chainId = chainId || await web3.eth.net.getId()
  console.log('chainId', chainId);
  console.log('starting compilation');
  output = await require("../compileContracts.js").compileContracts("sol5");
  console.log("finished compilation");

  //reinstantiate web3 (solc overwrites something)
  web3 = new Web3(new Web3.providers.HttpProvider(rpcUrl));
  if (!dontSendTx) {
    await waitForEth();
  }

  verifyInput();

  /////////////////////////////////////////
  // CONTRACT INSTANTIATION / DEPLOYMENT //
  /////////// DO NOT TOUCH ////////////////
  await deployMatchingEngineContract(output);
  await deployStorageContract(output);
  await deployNetworkContract(output);
  await deployProxyContract(output);
  await deployFeeHandlerContract(output);
  await deployStakingContract(output);
  await deployKyberDaoContract(output);
  /////////////////////////////////////////

  //IF DEPLOYMENT BREAKS:
  // 1) Replace relevant contract addresses (if any) variables on top
  // 2) Use ONLY ONE of the following functions below:
  // NOTE: Redeploying network == fullDeployment
  await pressToContinue();
  await fullDeployment();

  //////////////////
  // REDEPLOYMENT //
  //////////////////
  await setupMatchingEngine();
  await setupKyberDaoStuff();

  /////////////////////
  // ADDING RESERVES //
  /////////////////////
  // NOTE: Replace RESERVE_INDEX if continuing from specific index
  // await addReserves(RESERVE_INDEX);

  /////////////////////////
  // LISTING TOKEN PAIRS //
  /////////////////////////
  // NOTE: Replace RESERVE_INDEX & TOKEN_INDEX if process stopped halfway, and need to continue from specific index
  // await listTokensForReserves(RESERVE_INDEX, TOKEN_INDEX);

  console.log("last nonce is", nonce);
  lastFewThings();
  //printParams(JSON.parse(content));
  const signedTxsJson = JSON.stringify({ from: sender, txs: signedTxs }, null, 2);
  if (signedTxOutput) {
    fs.writeFileSync(signedTxOutput, signedTxsJson);
  }
}

async function fullDeployment() {
  await setNetworkAddressInMatchingEngine();
  await setNetworkAddressInStorage();
  await setStorageAddressInMatchingEngine();
  await set_Fee_MatchEngine_Gas_ContractsInNetwork();
  await setKyberDaoInNetwork();
  await setKyberDaoInFeeHandler();
  await setKyberDaoInStaking();
  await setProxyInNetwork();
  await setNetworkInProxy();
  await setTempOperatorToNetwork();

  ///////////
  // BREAK //
  ///////////
  await pressToContinue();
  await setFeeAccountedDataInStorage();
  await addReserves();
  await listTokensForReserves();
  await configureAndEnableNetwork();

  ///////////
  // BREAK //
  ///////////
  await pressToContinue();
  await removeTempOperator([networkContract]);
  await pressToContinue();
  await setPermissionsInProxy();
  await pressToContinue();
  await setPermissionsInNetwork();
  await pressToContinue();
  await setPermissionsInMatchingEngine();
  await pressToContinue();
  await setPermissionsInStorage();
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
    dictOutput["trade logic"] = matchingEngineAddress;
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

function verifyInput() {
  if (startTimestamp <= Math.round((new Date()).getTime() / 1000)) {
    console.log("start timestamp too early, increase its value");
    process.exit(1);
  }
}

async function deployMatchingEngineContract(output) {
  if (matchingEngineAddress == "") {
    console.log("deploying matching engine");
    [matchingEngineAddress, matchingEngineContract] = await deployContract(output, "KyberMatchingEngine.sol", "KyberMatchingEngine", [sender]);
    console.log(`matchingEngine: ${matchingEngineAddress}`);
  } else {
    console.log("Instantiating matching engine...");
    matchingEngineContract = new web3.eth.Contract(
      output.contracts["KyberMatchingEngine.sol"]["KyberMatchingEngine"].abi, matchingEngineAddress
    );
  }
}

async function deployStorageContract(output) {
  if (storageAddress == "") {
    console.log("deploying storage");
    [storageAddress, storageContract] = await deployContract(output, "KyberStorage.sol", "KyberStorage", [sender]);
    console.log(`storage: ${storageAddress}`);
  } else {
    console.log("Instantiating storage...");
    storageContract = new web3.eth.Contract(
      output.contracts["KyberStorage.sol"]["KyberStorage"].abi, storageAddress
    );
  }
}

async function deployNetworkContract(output) {
  if (networkAddress == "") {
    console.log("deploying kyber network");
    [networkAddress, networkContract] = await deployContract(output, "KyberNetwork.sol", "KyberNetwork", [sender, storageAddress]);
    console.log(`network: ${networkAddress}`);
  } else {
    console.log("Instantiating network...");
    networkContract = new web3.eth.Contract(
    output.contracts["KyberNetwork.sol"]["KyberNetwork"].abi, networkAddress
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
    proxyContract = new web3.eth.Contract(
      output.contracts["KyberNetworkProxy.sol"]["KyberNetworkProxy"].abi, proxyAddress
    );
  }
}

async function deployFeeHandlerContract(output) {
  if (feeHandlerAddress == "") {
    console.log("deploying feeHandler");
    [feeHandlerAddress, feeHandlerContract] = await deployContract(
      output, "KyberFeeHandler.sol", "KyberFeeHandler", 
      [sender, proxyAddress, networkAddress, kncTokenAddress, burnBlockInterval, daoOperator]
    );
    console.log(`Fee Handler: ${feeHandlerAddress}`);
  } else {
    console.log("Instantiating feeHandler...");
    feeHandlerContract = new web3.eth.Contract(
      output.contracts["KyberFeeHandler.sol"]["KyberFeeHandler"].abi, feeHandlerAddress
    );
  }
}

async function deployStakingContract(output) {
    if (stakingAddress == "") {
        console.log("deploying staking contract");
        [stakingAddress, stakingContract] = await deployContract(
            output, "KyberStaking.sol", "KyberStaking", 
            [kncTokenAddress, epochPeriod, startTimestamp, sender]
        );
        console.log(`Staking: ${stakingAddress}`);
    } else {
        console.log("Instantiating staking...");
        stakingContract = new web3.eth.Contract(
        output.contracts["KyberStaking.sol"]["KyberStaking"].abi, stakingAddress
        );
    }
};

async function deployKyberDaoContract(output) {
    if (daoAddress == "") {
        console.log("deploying KyberDao contract");
        [daoAddress, kyberDaoContract] = await deployContract(
            output, "KyberDao.sol", "KyberDao",
            [
              epochPeriod, startTimestamp, stakingAddress, feeHandlerAddress, kncTokenAddress,
              networkFeeBps, rewardFeeBps, rebateFeeBps, daoOperator
            ]
        );
        console.log(`KyberDao: ${daoAddress}`);
    } else {
        console.log("Instantiating KyberDao...");
        kyberDaoContract = new web3.eth.Contract(
        output.contracts["KyberDao.sol"]["KyberDao"].abi, daoAddress
        );
    }
};

async function setNetworkAddressInMatchingEngine(tempAddress) {
  console.log("set network in matching engine");
  if (tempAddress == undefined) {
    await sendTx(matchingEngineContract.methods.setNetworkContract(networkAddress));
  } else {
    await sendTx(matchingEngineContract.methods.setNetworkContract(tempAddress));
  }
}

async function setNetworkAddressInStorage(tempAddress) {
  console.log("set network in storage");
  if (tempAddress == undefined) {
    await sendTx(storageContract.methods.setNetworkContract(networkAddress));
  } else {
    await sendTx(storageContract.methods.setNetworkContract(tempAddress));
  }
}

async function setStorageAddressInMatchingEngine(tempAddress) {
  console.log("set storage in matching engine");
  if (tempAddress == undefined) {
    await sendTx(matchingEngineContract.methods.setKyberStorage(storageAddress));
  } else {
    await sendTx(matchingEngineContract.methods.setKyberStorage(tempAddress));
  }
}

async function set_Fee_MatchEngine_Gas_ContractsInNetwork() {
  console.log("set feeHandler, matchingEngine and gas helper in network");
  await sendTx(networkContract.methods.setContracts(
    feeHandlerAddress, matchingEngineAddress, gasHelperAddress,
  ));
}

async function setKyberDaoInNetwork() {
  console.log("Setting KyberDao address in network");
  await sendTx(networkContract.methods.setKyberDaoContract(daoAddress));
}

async function setKyberDaoInFeeHandler() {
  console.log("Setting KyberDao address in fee handler");
  await sendTx(feeHandlerContract.methods.setDaoContract(daoAddress));
}

async function setKyberDaoInStaking() {
  console.log("Setting KyberDao address in staking");
  await sendTx(stakingContract.methods.updateKyberDaoAddressAndRemoveSetter(daoAddress));
}

async function setProxyInNetwork() {
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

async function setFeeAccountedDataInStorage() {
  console.log("set fee paying data: matching engine");
  await sendTx(storageContract.methods.setFeeAccountedPerReserveType(
    isFeeAccounted["FPR"], isFeeAccounted["APR"], isFeeAccounted["BRIDGE"], isFeeAccounted["UTILITY"], isFeeAccounted["CUSTOM"], isFeeAccounted["ORDERBOOK"]
  ));
}

async function addReserves(reserveIndex) {
  // add reserve to network
  console.log("Add reserves to network");
  reserveIndex = (reserveIndex == undefined) ? 0 : reserveIndex;
  for (let i = reserveIndex ; i < reserveDataArray.length ; i++) {
    const reserve = reserveDataArray[i];
    console.log(`Reserve array index ${i}`);
    console.log(`Adding reserve ${reserve.address}`);
    await sendTx(networkContract.methods.addReserve(reserve.address, reserve.id, reserve.type, reserve.wallet));
    await pressToContinue();
  }
}

async function listTokensForReserves(reserveIndex, tokenIndex) {
  reserveIndex = (reserveIndex == undefined) ? 0 : reserveIndex;
  tokenIndex = (tokenIndex == undefined) ? 0 : tokenIndex;
  for (let i = reserveIndex ; i < reserveDataArray.length ; i++) {
    const reserve = reserveDataArray[i];
    const tokens = reserve.tokens;
    for (let j = tokenIndex ; j < tokens.length ; j++) {
      token = tokens[j];
      console.log(`Reserve array index ${i}, token array index ${j}`);
      console.log(`listing token ${token.address} for reserve ${reserve.address}`);
      await sendTx(networkContract.methods.listPairForReserve(reserve.address,token.address,token.ethToToken,token.tokenToEth,true));
    }
    await pressToContinue();
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

async function removeTempOperator(contractInstances) {
    for (let contractInstance of contractInstances) {
      console.log(`remove temp operator`);
      await sendTx(contractInstance.methods.removeOperator(sender));
    }
}

async function setPermissionsInNetwork() {
    await setPermissions(networkContract, networkPermissions);
}

async function setPermissionsInProxy() {
    await setPermissions(proxyContract, proxyPermissions);
}

async function setPermissionsInMatchingEngine() {
    await setPermissions(matchingEngineContract, matchingEnginePermissions);
}

async function setPermissionsInStorage() {
  await setPermissions(storageContract, storagePermissions);
}

async function setupMatchingEngine() {
  await setNetworkAddressInMatchingEngine();
  await setStorageAddressInMatchingEngine();
  await setPermissionsInMatchingEngine();
  console.log("\x1b[41m%s\x1b[0m" ,"REMINDER: Set matching engine in network contract!!");
};

async function setupKyberDaoStuff() {
  await setKyberDaoInFeeHandler();
  await setKyberDaoInStaking();
  console.log("\x1b[41m%s\x1b[0m" ,"REMINDER: Set KyberDao in network contract!!");
};

function lastFewThings() {
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

