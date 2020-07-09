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
let networkHistoryAddress = "";
let feeHandlerHistoryAddress = "";
let daoHistoryAddress = "";
let matchingEngineHistoryAddress = "";
let storageAddress = "";
let networkAddress = "";
let matchingEngineAddress = "";
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

const keypress = async () => {
  process.stdin.setRawMode(true)
  return new Promise(resolve => process.stdin.once('data', data => {
    const byteArray = [...data]
    if (byteArray.length > 0 && byteArray[0] === 3) {
      console.log('^C')
      process.exit(1)
    }
    process.stdin.setRawMode(false)
    resolve()
  }))
}

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

async function deployContract(artifacts, contractName, ctorArgs) {

  const contract = artifacts[contractName];
  const bytecode = contract.bytecode;
  const abi = contract.abi;
  const myContract = new web3.eth.Contract(abi);

  const deploy = myContract.deploy({data: bytecode, arguments: ctorArgs});
  let address = "0x" + web3.utils.sha3(RLP.encode([sender,nonce])).slice(12).substring(14);
  address = web3.utils.toChecksumAddress(address);

  await sendTx(deploy, 6500000);

  myContract.options.address = address;

  return [address,myContract];
}

//token addresses
let allTokens;
let kncTokenAddress;

//contracts
let feeHandlerContract;
let networkHistoryContract;
let feeHandlerHistoryContract;
let daoHistoryContract;
let matchingEngineHistoryContract;
let storageContract;
let matchingEngineContract;
let networkContract;
let proxyContract;
let daoContract;

//permissions
let matchingEnginePermissions;
let networkPermissions;
let proxyPermissions;
let storagePermissions;
let daoOperator;

//misc variables needed for contracts deployment, should be obtained from input json
let isFeeAccounted;
let isEntitledRebate;
let maxGasPrice = (new BN(50).mul(new BN(10).pow(new BN(9)))).toString();
let negDiffInBps;
let burnBlockInterval;
let epochPeriod;
let startTimestamp;
let networkFeeBps;
let rewardFeeBps;
let rebateFeeBps;
let contractsOutputFilename;
let reserveTypes;

class Reserve {
  constructor(jsonInput, reserveTypes) {
    this.address = jsonInput["address"],
    this.type = reserveTypes[jsonInput["type"]],
    this.tokens = jsonInput["tokens"],
    this.wallet = jsonInput["rebateWallet"],
    this.id = jsonInput["id"],
    this.name = jsonInput["name"]
  }
}

// class Wallet {
//   constructor(jsonInput) {
//     this.id = jsonInput["id"];
//     this.fees = jsonInput["fees"]; //custom fees?
//   }
// }

let reserveDataArray = [];

function parseInput(jsonInput) {
    reserveTypes = jsonInput["reserveTypes"];
    const reserveData = jsonInput["reserves"];
    const walletData = jsonInput["wallets"];
    allTokens = jsonInput["tokens"];

    // reserve array
    Object.values(reserveData).forEach(function(reserve) {
      reserveDataArray.push(new Reserve(reserve, reserveTypes));
    });

    //permissions
    matchingEnginePermissions = jsonInput.permission["MatchingEngine"];
    networkPermissions = jsonInput.permission["Network"];
    proxyPermissions = jsonInput.permission["Proxy"];
    storagePermissions = jsonInput.permission["Storage"];
    daoOperator = jsonInput.permission["KyberDao"]["DaoOperator"]

    //constants
    isFeeAccounted = jsonInput["isFeeAccounted"];
    isEntitledRebate = jsonInput["isEntitledRebate"];
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
    contractsOutputFilename = jsonInput["contracts filename"];
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

async function pressToContinue() {
  console.log("Checkpoint... Press any key to continue!");
  await keypress();
}

async function main() {
  nonce = await web3.eth.getTransactionCount(sender);
  console.log("nonce",nonce);

  chainId = chainId || await web3.eth.net.getId()
  console.log('chainId', chainId);
  console.log('compiling contracts and retrieving artifacts...');
  output = await require("../retrieveArtifacts.js").retrieveArtifacts();

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
  await deployStorageContracts(output);
  await deployNetworkContract(output);
  await deployProxyContract(output);
  await deployFeeHandlerContract(output);
  await deployDaoContract(output);
  await getStakingAddress();
  /////////////////////////////////////////

  //IF DEPLOYMENT BREAKS:
  // 1) Replace relevant contract addresses (if any) variables on top
  // 2) Use ONLY ONE of the following functions below:
  exportContractAddresses();
  await pressToContinue();
  // await fullDeployment();

  //////////////////
  // REDEPLOYMENT //
  //////////////////
  // await redeployNetwork();
  // await redeployProxy();
  // await setDaoInFeeHandler();

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
  await setStorageAddressInAllHistoricalContracts();
  await setNetworkAddressInMatchingEngine();
  await setNetworkAddressInStorage();
  await setStorageAddressInMatchingEngine();
  await pressToContinue();
  await set_Fee_MatchEngine_Gas_ContractsInNetwork();
  await pressToContinue();
  await setDaoInNetwork();
  await setDaoInFeeHandler();
  await setProxyInNetwork();
  await setNetworkInProxy();
  await setHintHandlerInProxy();
  await setTempOperatorToStorage();

  ///////////
  // BREAK //
  ///////////
  await pressToContinue();
  await setFeeAccountedDataInStorage();
  await setRebateEntitledDataInStorage();
  await addReserves();
  await listTokensForReserves();
  await configureNetwork();
  await pressToContinue();

  ///////////
  // BREAK //
  ///////////
  await pressToContinue();
  await removeTempOperator([storageContract]);
  await pressToContinue();
  await setPermissionsInProxy();
  await pressToContinue();
  await setPermissionsInNetwork();
  await pressToContinue();
  await setPermissionsInMatchingEngine();
  await pressToContinue();
  await setPermissionsInStorage();
  await setPermissionsInHistories();
}

function exportContractAddresses() {
  console.log("Exporting contract addresses...");
  dictOutput = {};
  dictOutput["networkHistory"] = networkHistoryAddress;
  dictOutput["feeHandlerHistory"] = feeHandlerHistoryAddress;
  dictOutput["daoHistory"] = daoHistoryAddress;
  dictOutput["matchingEngineHistory"] = matchingEngineHistoryAddress;
  dictOutput["storage"] = storageAddress;
  dictOutput["network"] = networkAddress;
  dictOutput["matchingEngine"] = matchingEngineAddress;
  dictOutput["proxy"] = proxyAddress;
  dictOutput["feeHandler"] = feeHandlerAddress;
  dictOutput["gasHelper"] = gasHelperAddress;
  dictOutput["staking"] = stakingAddress;
  dictOutput["dao"] = daoAddress;
  const json = JSON.stringify(dictOutput, null, 2);
  console.log(contractsOutputFilename, 'write');
  fs.writeFileSync(contractsOutputFilename, json);
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
    [matchingEngineAddress, matchingEngineContract] = await deployContract(output, "KyberMatchingEngine", [sender]);
    console.log(`matchingEngine: ${matchingEngineAddress}`);
    await pressToContinue();
  } else {
    console.log("Instantiating matching engine...");
    matchingEngineContract = new web3.eth.Contract(
      output["KyberMatchingEngine"].abi, matchingEngineAddress
    );
  }
}

async function deployStorageContracts(output) {
  // network history
  if (networkHistoryAddress == "") {
    console.log("deploy networkHistory");
    [networkHistoryAddress, networkHistoryContract] = await deployContract(output, "KyberHistory", [sender]);
    console.log(`networkHistory: ${networkHistoryAddress}`);
  } else {
    console.log("instantiating networkHistory...");
    networkHistoryContract = new web3.eth.Contract(
      output["KyberHistory"].abi, networkHistoryAddress
    );
  }

  // feeHandlerhistory
  if (feeHandlerHistoryAddress == "") {
    console.log("deploy feeHandlerHistory");
    [feeHandlerHistoryAddress, feeHandlerHistoryContract] = await deployContract(output, "KyberHistory", [sender]);
    console.log(`feeHandlerHistory: ${feeHandlerHistoryAddress}`);
  } else {
    console.log("instantiating feeHandlerHistory...");
    feeHandlerHistoryContract = new web3.eth.Contract(
      output["KyberHistory"].abi, feeHandlerHistoryAddress
    );
  }

  // kyberDao history
  if (daoHistoryAddress == "") {
    console.log("deploy daoHistory");
    [daoHistoryAddress, daoHistoryContract] = await deployContract(output, "KyberHistory", [sender]);
    console.log(`daoHistory: ${daoHistoryAddress}`);
  } else {
    console.log("instantiating daoHistory...");
    daoHistoryContract = new web3.eth.Contract(
      output["KyberHistory"].abi, daoHistoryAddress
    );
  }

  // matchingEngine history
  if (matchingEngineHistoryAddress == "") {
    console.log("deploy matchingEngineHistory");
    [matchingEngineHistoryAddress, matchingEngineHistoryContract] = await deployContract(output, "KyberHistory", [sender]);
    console.log(`matchingEngineHistory: ${matchingEngineHistoryAddress}`);
  } else {
    console.log("instantiating matchingEngineHistory...");
    matchingEngineHistoryContract = new web3.eth.Contract(
      output["KyberHistory"].abi, matchingEngineHistoryAddress
    );
  }

  if (storageAddress == "") {
    console.log("deploying storage");
    [storageAddress, storageContract] = await deployContract(
      output,
      "KyberStorage",
      [sender, networkHistoryAddress, feeHandlerHistoryAddress, daoHistoryAddress, matchingEngineHistoryAddress]
      );
    console.log(`storage: ${storageAddress}`);
    await pressToContinue();
  } else {
    console.log("Instantiating storage...");
    storageContract = new web3.eth.Contract(
      output["KyberStorage"].abi, storageAddress
    );
  }
}

async function deployNetworkContract(output) {
  if (networkAddress == "") {
    console.log("deploying kyber network");
    [networkAddress, networkContract] = await deployContract(output, "KyberNetwork", [sender, storageAddress]);
    console.log(`network: ${networkAddress}`);
    await pressToContinue();
  } else {
    console.log("Instantiating network...");
    networkContract = new web3.eth.Contract(
    output["KyberNetwork"].abi, networkAddress
    );
  }
}

async function deployProxyContract(output) {
  if (proxyAddress == "") {
    console.log("deploying KNProxy");
    [proxyAddress, proxyContract] = await deployContract(output, "KyberNetworkProxy", [sender]);
    console.log(`KNProxy: ${proxyAddress}`);
    await pressToContinue();
  } else {
    console.log("Instantiating proxy...");
    proxyContract = new web3.eth.Contract(
      output["KyberNetworkProxy"].abi, proxyAddress
    );
  }
}

async function deployFeeHandlerContract(output) {
  if (feeHandlerAddress == "") {
    console.log("deploying feeHandler");
    [feeHandlerAddress, feeHandlerContract] = await deployContract(
      output, "KyberFeeHandler", 
      [sender, proxyAddress, networkAddress, kncTokenAddress, burnBlockInterval, daoOperator]
    );
    console.log(`Fee Handler: ${feeHandlerAddress}`);
    await pressToContinue();
  } else {
    console.log("Instantiating feeHandler...");
    feeHandlerContract = new web3.eth.Contract(
      output["KyberFeeHandler"].abi, feeHandlerAddress
    );
  }
}

async function deployDaoContract(output) {
    if (daoAddress == "") {
        console.log("deploying Dao and staking contracts");
        [daoAddress, daoContract] = await deployContract(
            output, "KyberDao",
            [
              epochPeriod, startTimestamp, kncTokenAddress,
              networkFeeBps, rewardFeeBps, rebateFeeBps, daoOperator
            ]
        );
        console.log(`Dao: ${daoAddress}`);
    } else {
        console.log("Instantiating Dao...");
        daoContract = new web3.eth.Contract(
          output["KyberDao"].abi, daoAddress
        );
    }
    // Note: Staking contract need not be instantiated, since it doesn't require any setup
    console.log("\x1b[41m%s\x1b[0m" ,"Wait for tx to be mined before continuing (will call daoContract for staking address)");
    await pressToContinue();
};

async function getStakingAddress() {
  stakingAddress = await daoContract.methods.staking().call();
  console.log(`Staking: ${stakingAddress}`);
}

async function waitForMatchingEngineAndStorageUpdate() {
  while(true) {
    let matchingEngineNetwork = await matchingEngineContract.methods.kyberNetwork().call();
    let storageNetwork = await storageContract.methods.kyberNetwork().call();
    if (matchingEngineNetwork == networkAddress && storageNetwork == networkAddress) {
      return;
    } else if (matchingEngineNetwork != networkAddress) {
      console.log(`matching engine not pointing to network`);
      console.log(`Current matchingEngine network address: ${matchingEngineNetwork}`);
      console.log(`Waiting...`);
      await sleep(25000);
    } else {
      console.log(`storage not pointing to network`);
      console.log(`Current storage network address: ${storageNetwork}`);
      console.log(`Waiting...`);
      await sleep(25000);
    }
  }
}

async function checkZeroProxies() {
    let networkProxies = await storageContract.methods.getKyberProxies().call();
    if (networkProxies.length > 0) {
      console.log("\x1b[41m%s\x1b[0m" ,"Existing kyberProxies in storage, remove before proceeding");
      process.exit(1);
    }
    return;
}

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

async function setStorageAddressInAllHistoricalContracts() {
  console.log("set storage in historical contracts");
  await setStorageAddressInHistoricalContract(networkHistoryContract);
  await setStorageAddressInHistoricalContract(feeHandlerHistoryContract);
  await setStorageAddressInHistoricalContract(daoHistoryContract);
  await setStorageAddressInHistoricalContract(matchingEngineHistoryContract);
}

async function setStorageAddressInHistoricalContract(contractInstance) {
  await sendTx(contractInstance.methods.setStorageContract(storageAddress));
}

async function set_Fee_MatchEngine_Gas_ContractsInNetwork() {
  console.log("set feeHandler, matchingEngine and gas helper in network");
  await sendTx(networkContract.methods.setContracts(
    feeHandlerAddress, matchingEngineAddress, gasHelperAddress,
  ));
}

async function setDaoInNetwork() {
  console.log("Setting dao address in network");
  await sendTx(networkContract.methods.setKyberDaoContract(daoAddress));
}

async function setDaoInFeeHandler() {
  console.log("Setting dao address in fee handler");
  await sendTx(feeHandlerContract.methods.setDaoContract(daoAddress));
}

async function setProxyInNetwork() {
  console.log("set proxy in network");
  await sendTx(networkContract.methods.addKyberProxy(proxyAddress));
}

async function setNetworkInProxy() {
  console.log("setting network in proxy");
  await sendTx(proxyContract.methods.setKyberNetwork(networkAddress));
}

async function setHintHandlerInProxy() {
  console.log("setting hint handler in proxy");
  await sendTx(proxyContract.methods.setHintHandler(matchingEngineAddress));
}

async function setTempOperatorToStorage() {
  // add operator to network
  console.log("set temp operator: storage");
  await sendTx(storageContract.methods.addOperator(sender));
}

async function setFeeAccountedDataInStorage() {
  console.log("set fee paying data: storage");
  await sendTx(storageContract.methods.setFeeAccountedPerReserveType(
    isFeeAccounted["FPR"], isFeeAccounted["APR"], isFeeAccounted["BRIDGE"], isFeeAccounted["UTILITY"], isFeeAccounted["CUSTOM"], isFeeAccounted["ORDERBOOK"]
  ));
}

async function setRebateEntitledDataInStorage() {
  console.log("set rebate entitled data: storage");
  await sendTx(storageContract.methods.setEntitledRebatePerReserveType(
    isEntitledRebate["FPR"], isEntitledRebate["APR"], isEntitledRebate["BRIDGE"], isEntitledRebate["UTILITY"], isEntitledRebate["CUSTOM"], isEntitledRebate["ORDERBOOK"]
  ));
}

async function addReserves(reserveIndex) {
  // add reserve to network
  console.log("Add reserves to storage");
  reserveIndex = (reserveIndex == undefined) ? 0 : reserveIndex;
  for (let i = reserveIndex ; i < reserveDataArray.length ; i++) {
    const reserve = reserveDataArray[i];
    console.log(`Reserve array index ${i}`);
    if (reserve.name != undefined) {
      console.log(`Adding ${reserve.name}: ${reserve.address}`);
    } else {
      console.log(`Adding reserve ${reserve.address}`);
    }
    await sendTx(storageContract.methods.addReserve(reserve.address, reserve.id, reserve.type, reserve.wallet));
    await pressToContinue();
  }
}

async function listTokensForReserves(reserveIndex, tokenIndex) {
  reserveIndex = (reserveIndex == undefined) ? 0 : reserveIndex;
  tokenIndex = (tokenIndex == undefined) ? 0 : tokenIndex;
  for (let i = reserveIndex ; i < reserveDataArray.length ; i++) {
    let reserve = reserveDataArray[i];
    // if not FPR, skip listing
    if (reserve.type != reserveTypes["FPR"]) continue;
    let tokens = reserve.tokens;
    for (let j = tokenIndex ; j < tokens.length ; j++) {
      token = tokens[j];
      console.log(`Reserve array index ${i}, token array index ${j}`);
      if (reserve.name != undefined) {
        console.log(`listing token ${token.address} for reserve ${reserve.name}`);
      } else {
        console.log(`listing token ${token.address} for reserve ${reserve.id}`);
      }
      await sendTx(storageContract.methods.listPairForReserve(reserve.id,token.address,token.ethToToken,token.tokenToEth,true));
      await pressToContinue();
    }
  }
}

async function configureAndEnableNetwork() {
  // set params
  console.log("network set params");
  await sendTx(networkContract.methods.setParams(maxGasPrice, negDiffInBps));
                    
  console.log("network enable");
  await sendTx(networkContract.methods.setEnable(true));
}

async function enableNetwork() {
  console.log("enabling network");
  await sendTx(networkContract.methods.setEnable(true));
}

async function removeTempOperator(contractInstances) {
  for (let contractInstance of contractInstances) {
    console.log(`remove temp operator`);
    await sendTx(contractInstance.methods.removeOperator(sender));
  }
}

async function setPermissionsInNetwork() {
  console.log('setting permissions in network');
  await setPermissions(networkContract, networkPermissions);
}

async function setPermissionsInProxy() {
  console.log('setting permissions in proxy');
  await setPermissions(proxyContract, proxyPermissions);
}

async function setPermissionsInMatchingEngine() {
  console.log('setting permissions in matchingEngine');
  await setPermissions(matchingEngineContract, matchingEnginePermissions);
}

async function setPermissionsInStorage() {
  console.log('setting permissions in storage');
  await setPermissions(storageContract, storagePermissions);
}

async function setPermissionsInHistories() {
  console.log('setting permissions in histories');
  await setPermissions(networkHistoryContract, storagePermissions);
  await setPermissions(feeHandlerHistoryContract, storagePermissions);
  await setPermissions(daoHistoryContract, storagePermissions);
  await setPermissions(matchingEngineHistoryContract, storagePermissions);
}

async function redeployNetwork() {
  await waitForMatchingEngineAndStorageUpdate();
  await pressToContinue();
  await setTempOperatorToNetwork();
  await set_Fee_MatchEngine_Gas_ContractsInNetwork();
  await pressToContinue();
  await setDaoInNetwork();
  await setProxyInNetwork();
  await pressToContinue();
  await listReservesForTokens();
  await configureAndEnableNetwork();
  await pressToContinue();
  await removeTempOperator([networkContract]);
  await setPermissionsInNetwork();
}

async function setTempOperatorToNetwork() {
  // add operator to network
  console.log("set temp operator: network");
  await sendTx(networkContract.methods.addOperator(sender));
}

async function listReservesForTokens() {
  for (let j = tokenIndex ; j < allTokens.length ; j++) {
    token = allTokens[j];
    console.log(`Giving allowance to reserves for token ${token}`);
    await sendTx(networkContract.methods.listReservesForToken(token, 0, 8, true));
  }
}

async function redeployProxy() {
  await checkZeroProxies();
  await setNetworkInProxy();
  await setHintHandlerInProxy();
  await pressToContinue();
  await setPermissionsInProxy();
}

function lastFewThings() {
  console.log("\x1b[41m%s\x1b[0m" ,"REMINDER: Don't forget to send DGX to network contract!!");
  process.exit(0);
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
