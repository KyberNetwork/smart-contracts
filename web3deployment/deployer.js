var Web3 = require("web3");
var fs = require("fs");
var RLP = require('rlp');
var mainnetGasPrice = 1 * 10**9;
var kovanGasPrice = 50 * 10 ** 9;

var mainnet = true;

if (mainnet) {
  url = "https://mainnet.infura.io";
}
else {
  url = "http://localhost:8545";
  //url = "https://kovan.infura.io";
}


var web3 = new Web3(new Web3.providers.HttpProvider(url));
var solc = require('solc')

var rand = web3.utils.randomHex(999);
var privateKey = web3.utils.sha3("js sucks" + rand);
var account = web3.eth.accounts.privateKeyToAccount(privateKey);
var sender = account.address;
var nonce;

console.log("from",sender);

async function sendTx(txObject) {
  var txTo = txObject._parent.options.address;

  var gasLimit;
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
  var txData = txObject.encodeABI();
  var txFrom = account.address;
  var txKey = account.privateKey;

  var tx = {
    from : txFrom,
    to : txTo,
    nonce : nonce,
    data : txData,
    gas : gasLimit,
    gasPrice : mainnet ? mainnetGasPrice : kovanGasPrice
  };

  var signedTx = await web3.eth.accounts.signTransaction(tx, txKey);
  nonce++;
  // don't wait for confirmation
  web3.eth.sendSignedTransaction(signedTx.rawTransaction,{from:sender});
}

async function deployContract(solcOutput, contractName, ctorArgs) {

  var actualName = contractName;
  var bytecode = solcOutput.contracts[actualName].bytecode;

  var abi = solcOutput.contracts[actualName].interface;
  var myContract = new web3.eth.Contract(JSON.parse(abi));
  var deploy = myContract.deploy({data:"0x" + bytecode, arguments: ctorArgs});
  var address = "0x" + web3.utils.sha3(RLP.encode([sender,nonce])).slice(12).substring(14);
  address = web3.utils.toChecksumAddress(address);

  await sendTx(deploy);

  myContract.options.address = address;


  return [address,myContract];



}

const contractPath = "../contracts/";

var input = {
  "ConversionRatesInterface.sol" : fs.readFileSync(contractPath + 'ConversionRatesInterface.sol', 'utf8'),
  "ConversionRates.sol" : fs.readFileSync(contractPath + 'ConversionRates.sol', 'utf8'),
  "PermissionGroups.sol" : fs.readFileSync(contractPath + 'PermissionGroups.sol', 'utf8'),
  "ERC20Interface.sol" : fs.readFileSync(contractPath + 'ERC20Interface.sol', 'utf8'),
  "SanityRatesInterface.sol" : fs.readFileSync(contractPath + 'SanityRatesInterface.sol', 'utf8'),
  "ExpectedRateInterface.sol" : fs.readFileSync(contractPath + 'ExpectedRateInterface.sol', 'utf8'),
  "SanityRates.sol" : fs.readFileSync(contractPath + 'SanityRates.sol', 'utf8'),
  "ExpectedRate.sol" : fs.readFileSync(contractPath + 'ExpectedRate.sol', 'utf8'),
  "Utils.sol" : fs.readFileSync(contractPath + 'Utils.sol', 'utf8'),
  "FeeBurnerInterface.sol" : fs.readFileSync(contractPath + 'FeeBurnerInterface.sol', 'utf8'),
  "VolumeImbalanceRecorder.sol" : fs.readFileSync(contractPath + 'VolumeImbalanceRecorder.sol', 'utf8'),
  "FeeBurner.sol" : fs.readFileSync(contractPath + 'FeeBurner.sol', 'utf8'),
  "WhiteListInterface.sol" : fs.readFileSync(contractPath + 'WhiteListInterface.sol', 'utf8'),
  "KyberNetwork.sol" : fs.readFileSync(contractPath + 'KyberNetwork.sol', 'utf8'),
  "WhiteList.sol" : fs.readFileSync(contractPath + 'WhiteList.sol', 'utf8'),
  "KyberReserveInterface.sol" : fs.readFileSync(contractPath + 'KyberReserveInterface.sol', 'utf8'),
  "Withdrawable.sol" : fs.readFileSync(contractPath + 'Withdrawable.sol', 'utf8'),
  "KyberReserve.sol" : fs.readFileSync(contractPath + 'KyberReserve.sol', 'utf8'),
  "Wrapper.sol" : fs.readFileSync(contractPath + 'mockContracts/Wrapper.sol', 'utf8')
};

var networkAddress;
var reserveAddress;
var conversionRatesAddress;
var whitelistAddress;
var feeBurnerAddress;
var expectedRateAddress;
var wrapperAddress;

var networkContract;
var reserveContract;
var conversionRatesContract;
var whitelistContract;
var feeBurnerContract;
var expectedRateContract;
var wrapperContract;

var networkPermissions;
var reservePermissions;
var conversionRatesPermissions;
var whitelistPermissions;
var feeBurnerPermissions;
var expectedRatePermissions;

var depositAddresses = [];
var maxGasPrice = 50 * 1000 * 1000 * 1000;
var negDiffInBps = 15;
var minExpectedRateSlippage = 300;
var kncWallet;
var kncToEthRate = 307;
var validDurationBlock = 24;
var testers;
var testersCat;
var testersCap;
var users;
var usersCat;
var usersCap;

var ethAddress = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

var tokens = [];
var tokenControlInfo = {};
var tokenNameToAddress = { "ETH" : ethAddress };


function parseInput( jsonInput ) {
    // tokens
    var tokenInfo = jsonInput["tokens"];
    Object.keys(tokenInfo).forEach(function(key) {
      var val = tokenInfo[key];
      var symbol = key;
      var name = val["name"];
      var address = val["address"];

      tokenNameToAddress[symbol] = address;

      tokens.push(address);
      var dict = {
        minimalRecordResolution : web3.utils.toBN(val["minimalRecordResolution"]),
        maxPerBlockImbalance : web3.utils.toBN(val["maxPerBlockImbalance"]),
        maxTotalImbalance : web3.utils.toBN(val["maxTotalImbalance"])
      };
      tokenControlInfo[address] = dict;
    });

    // exchanges
    var exchangeInfo = jsonInput["exchanges"];
    Object.keys(exchangeInfo).forEach(function(exchange) {
      Object.keys(exchangeInfo[exchange]).forEach(function(token){
        var depositAddress = exchangeInfo[exchange][token];
        var dict = {};
        dict[token] = depositAddress;
        depositAddresses.push(dict);
      });
    });

    networkPermissions = jsonInput.permission["KyberNetwork"];
    reservePermissions = jsonInput.permission["KyberReserve"];
    conversionRatesPermissions = jsonInput.permission["ConversionRates"];
    whitelistPermissions = jsonInput.permission["WhiteList"];
    feeBurnerPermissions = jsonInput.permission["FeeBurner"];
    expectedRatePermissions = jsonInput.permission["ExpectedRate"];

    maxGasPrice =  web3.utils.toBN(jsonInput["max gas price"]);
    negDiffInBps = web3.utils.toBN(jsonInput["neg diff in bps"]);
    minExpectedRateSlippage = web3.utils.toBN(jsonInput["min expected rate slippage"]);
    kncWallet = jsonInput["KNC wallet"];
    kncToEthRate = web3.utils.toBN(jsonInput["KNC to ETH rate"]);
    validDurationBlock = web3.utils.toBN(jsonInput["valid duration block"]);
    testers = jsonInput["whitelist params"]["testers"];
    testersCat = jsonInput["whitelist params"]["testers category"];
    testersCap = jsonInput["whitelist params"]["category cap"];
    users = jsonInput["whitelist params"]["users"];
    usersCat = jsonInput["whitelist params"]["users category"];
    usersCap = jsonInput["whitelist params"]["category cap"];

    // output file name
    outputFileName = jsonInput["output filename"];
};

async function setPermissions(contract, permJson) {
  console.log("set operator(s)");
  for(var i = 0 ; i < permJson.operator.length ; i++ ) {
    var operator = permJson.operator[i];
    console.log(operator);
    await sendTx(contract.methods.addOperator(operator));
  }
  console.log("set alerter(s)");
  for(var i = 0 ; i < permJson.alerter.length ; i++ ) {
    var alerter = permJson.alerter[i];
    console.log(alerter);
    await sendTx(contract.methods.addAlerter(alerter));
  }
  console.log("transferAdminQuickly");
  var admin = permJson.admin;
  console.log(admin);
  await sendTx(contract.methods.transferAdminQuickly(admin));
}


async function main() {
  nonce = await web3.eth.getTransactionCount(sender);
  console.log("nonce",nonce);

  console.log("starting compilation");
  var output = await solc.compile({ sources: input }, 1);
  //console.log(output);
  console.log("finished compilation");

  await waitForEth();


  console.log("deploying kyber network");
  [networkAddress,networkContract] = await deployContract(output, "KyberNetwork.sol:KyberNetwork", [sender]);
  console.log("deploying conversion rates");
  [conversionRatesAddress,conversionRatesContract] = await deployContract(output, "ConversionRates.sol:ConversionRates", [sender]);
  console.log("deploying kyber reserve");
  [reserveAddress,reserveContract] = await deployContract(output, "KyberReserve.sol:KyberReserve", [networkAddress,conversionRatesAddress,sender]);
  console.log("deploying fee burner");
  [feeBurnerAddress, feeBurnerContract] = await deployContract(output, "FeeBurner.sol:FeeBurner", [sender,"0xdd974D5C2e2928deA5F71b9825b8b646686BD200"]);
  console.log("deploying whitelist");
  [whitelistAddress, whitelistContract] = await deployContract(output, "WhiteList.sol:WhiteList", [sender]);
  console.log("deploying expected rates");
  [expectedRateAddress, expectedRateContract] = await deployContract(output, "ExpectedRate.sol:ExpectedRate", [networkAddress,sender]);
  console.log("deploying wrapper");
  [wrapperAddress, wrapperContract] = await deployContract(output, "Wrapper.sol:Wrapper", [networkAddress,sender]);

  console.log("network", networkAddress);
  console.log("rates", conversionRatesAddress);
  console.log("reserve", reserveAddress);
  console.log("feeBurner", feeBurnerAddress);
  console.log("whitelistAddress", whitelistAddress);
  console.log("expectedRateAddress", expectedRateAddress);
  console.log("wrapperAddress", wrapperAddress);

  // add reserve to network
  console.log("Add reserve to network");
  //console.log(networkContract.methods.addReserve(reserveAddress,true));
  await sendTx(networkContract.methods.addReserve(reserveAddress,true));

  console.log("add temp operator to set info data");
  await sendTx(networkContract.methods.addOperator(sender));
  // list tokens
  for( i = 0 ; i < tokens.length ; i++ ) {
    console.log("listing eth", tokens[i]);
    await sendTx(networkContract.methods.listPairForReserve(reserveAddress,
                                                            ethAddress,
                                                            tokens[i],
                                                            true));
    await sendTx(networkContract.methods.listPairForReserve(reserveAddress,
                                                            tokens[i],
                                                            ethAddress,
                                                            true));

    var srcString1 = web3.utils.sha3("src token " + (2*i).toString());
    var destString1 = web3.utils.sha3("dest token " + (2*i).toString());
    var srcString2 = web3.utils.sha3("src token " + (2*i + 1).toString());
    var destString2 = web3.utils.sha3("dest token " + (2*i + 1).toString());

    await sendTx(networkContract.methods.setInfo(srcString1, ethAddress));
    await sendTx(networkContract.methods.setInfo(destString1, tokens[i]));
    await sendTx(networkContract.methods.setInfo(srcString2, tokens[i]));
    await sendTx(networkContract.methods.setInfo(destString2, ethAddress));
  }
  console.log("set num listed pairs info");
  var numListPairsString = web3.utils.sha3("num listed pairs");
  await sendTx(networkContract.methods.setInfo(numListPairsString,tokens.length * 2));
  console.log("delete temp operator to set info data");
  await sendTx(networkContract.methods.removeOperator(sender));

  // set params
  console.log("network set params");
  await sendTx(networkContract.methods.setParams(whitelistAddress,
                                                 expectedRateAddress,
                                                 feeBurnerAddress,
                                                 maxGasPrice,
                                                 negDiffInBps));

  console.log("network enable");
  await sendTx(networkContract.methods.setEnable(true));

  // add operator
  await setPermissions(networkContract, networkPermissions);

  // reserve
  console.log("whitelist deposit addresses");
  for( i = 0 ; i < depositAddresses.length ; i++ ) {
    var dict = depositAddresses[i];
    var tokenSymbol = Object.keys(dict)[0];
    var tokenAddress = tokenNameToAddress[tokenSymbol];
    var depositAddress = dict[tokenSymbol];
    console.log(tokenSymbol,tokenAddress,depositAddress);
    await sendTx(reserveContract.methods.approveWithdrawAddress(tokenAddress,
                                                                depositAddress,
                                                                true));
  }
  await setPermissions(reserveContract, reservePermissions);

  // expected rates
  console.log("expected rate - add temp operator");
  await sendTx(expectedRateContract.methods.addOperator(sender));
  console.log("expected rate - set slippage to 3%");
  await sendTx(expectedRateContract.methods.setMinSlippageFactor(minExpectedRateSlippage));
  console.log("expected rate - set qty factor to 1");
  await sendTx(expectedRateContract.methods.setQuantityFactor(1));
  console.log("expected rate - remove temp operator");
  await sendTx(expectedRateContract.methods.removeOperator(sender));

  await setPermissions(expectedRateContract, expectedRatePermissions);


  // whitelist
  console.log("white list - add temp opeator to set sgd rate");
  await sendTx(whitelistContract.methods.addOperator(sender));
  console.log("white list - set sgd rate");
  await sendTx(whitelistContract.methods.setSgdToEthRate(web3.utils.toBN("645161290322581")));
  console.log("white list - init users list");
  for(var i = 0 ; i < users.length ; i++ ) {
    console.log(users[i]);
    await sendTx(whitelistContract.methods.setUserCategory(users[i],usersCat));
  }
  console.log("white list - set cat cap");
  await sendTx(whitelistContract.methods.setCategoryCap(usersCat, usersCap));
  console.log("white list - init tester list");
  for(var i = 0 ; i < testers.length ; i++ ) {
    console.log(testers[i]);
    await sendTx(whitelistContract.methods.setUserCategory(testers[i],testersCat));
  }
  console.log("white list - set cat cap");
  await sendTx(whitelistContract.methods.setCategoryCap(testersCat, testersCap));
  console.log("white list - remove temp opeator to set sgd rate");
  await sendTx(whitelistContract.methods.removeOperator(sender));

  await setPermissions(whitelistContract, whitelistPermissions);

  // burn fee
  console.log("burn fee - set reserve data");
  await sendTx(feeBurnerContract.methods.setReserveData(reserveAddress,
                                                        25,
                                                        kncWallet));
  console.log("set kyber network");
  await sendTx(feeBurnerContract.methods.setKyberNetwork(networkAddress));
  console.log("set KNC to ETH rate");
  await sendTx(feeBurnerContract.methods.setKNCRate(kncToEthRate));

  await setPermissions(feeBurnerContract, feeBurnerPermissions);

  // conversion rates
  console.log("conversion rate - add token");
  for( var i = 0 ; i < tokens.length ; i++ ) {
    console.log(tokens[i]);
    await sendTx(conversionRatesContract.methods.addToken(tokens[i]));
  }

  console.log("conversion rate - set valid duration block");
  await sendTx(conversionRatesContract.methods.setValidRateDurationInBlocks(validDurationBlock));
  console.log("conversion rate - setReserveAddress");
  await sendTx(conversionRatesContract.methods.setReserveAddress(reserveAddress));

  console.log("conversion rate - set control info");
  for( var i = 0 ; i < tokens.length ; i++ ) {
    console.log(tokens[i]);
    var dict = tokenControlInfo[tokens[i]];
    await sendTx(conversionRatesContract.methods.setTokenControlInfo(tokens[i],
                                                                     dict.minimalRecordResolution,
                                                                     dict.maxPerBlockImbalance,
                                                                     dict.maxTotalImbalance));
  }

  console.log("conversion rate - enable token trade");
  for( var i = 0 ; i < tokens.length ; i++ ) {
    console.log(tokens[i]);
    var dict = tokenControlInfo[tokens[i]];
    await sendTx(conversionRatesContract.methods.enableTokenTrade(tokens[i]));
  }

  console.log("conversion rate - add temp operator");
  await sendTx(conversionRatesContract.methods.addOperator(sender));
  console.log("conversion rate - set qty step function to 0");
  for( var i = 0 ; i < tokens.length ; i++ ) {
    console.log(tokens[i]);
    await sendTx(conversionRatesContract.methods.setQtyStepFunction(tokens[i],
                                                                    [0],
                                                                    [0],
                                                                    [0],
                                                                    [0]));
  }
  console.log("conversion rate - set imbalance step function to 0");
  for( var i = 0 ; i < tokens.length ; i++ ) {
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
}

function printParams(jsonInput) {
    dictOutput = {};
    dictOutput["tokens"] = jsonInput.tokens;
    dictOutput["tokens"]["ETH"] = {"name" : "Ethereum", "decimals" : 18, "address" : ethAddress };
    dictOutput["exchanges"] = jsonInput.exchanges;
    dictOutput["reserve"] = reserveAddress;
    dictOutput["pricing"] = conversionRatesAddress;
    dictOutput["network"] = networkAddress;
    dictOutput["wrapper"] = wrapperAddress;
    dictOutput["feeburner"] = feeBurnerAddress;
    var json = JSON.stringify(dictOutput, null, 2);
    console.log(json);
    var outputFileName = jsonInput["output filename"];
    fs.writeFileSync(outputFileName, json);
}


function sleep(ms){
    return new Promise(resolve=>{
        setTimeout(resolve,ms)
    })
}

async function waitForEth() {
  while(true) {
    var balance = await web3.eth.getBalance(sender);
    console.log("waiting for balance to account " + sender);
    if(balance.toString() !== "0") {
      console.log("received " + balance.toString() + " wei");
      return;
    }
    else await sleep(10000)
  }
}


var filename;
var content;
if(mainnet) {
  filename = "deployment_script_input_mainnet_stage.json";
}
else {
  filename = "deployment_script_input_kovan.json"
}
try{
  content = fs.readFileSync(filename, 'utf8');
  //console.log(content.substring(2892,2900));
  //console.log(content.substring(3490,3550));
  parseInput(JSON.parse(content));
}
catch(err) {
  console.log(err);
}

main();





//console.log(deployContract(output, "cont",5));
