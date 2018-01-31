var Web3 = require("web3");
var fs = require("fs");
var RLP = require('rlp');
url = "http://localhost:8545";
//url = "https://kovan.infura.io";
//url = "https://mainnet.infura.io";
var web3 = new Web3(new Web3.providers.HttpProvider(url));
var solc = require('solc')

var rand = "choose something random - this is not the real key";

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
    gasPrice : 5 * 1000 * 1000 * 1000
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

const contractPath = "./contracts/";

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
};

var networkAddress;
var reserveAddress;
var conversionRatesAddress;
var whitelistAddress;
var feeBurnerAddress;
var expectedRateAddress;

var networkContract;
var reserveContract;
var conversionRatesContract;
var whitelistContract;
var feeBurnerContract;
var expectedRateContract;

var admin = "0xBC33a1F908612640F2849b56b67a4De4d179C151";
var ilan = "0x4a48312f6981484c4204d8501ad3d93f4f4571bf";
var victor = "0x8bC3da587DeF887B5C822105729ee1D6aF05A5ca";
var depositAddresses = [];
var maxGasPrice = 50 * 1000 * 1000 * 1000;
var negDiffInBps = 15;
var minExpectedRateSlippage = 300;
var kncWallet = admin;
var kncToEthRate = 307;
var validDurationBlock = 24;

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
    for(var i = 0 ; i < exchangeInfo.length ; i++ ) {
      var exchange = exchangeInfo[i];
      Object.keys(exchange).forEach(function(name){
        depositDict = exchangeInfo[i][name];
        Object.keys(depositDict).forEach(function(token){
          var depositAddress = depositDict[token];
          var dict = {};
          dict[token] = depositAddress;
          depositAddresses.push(dict);
        });
      });
    }
    victor = jsonInput["victor"];
    admin = jsonInput["admin"];
    ilan = jsonInput["ilan"];

    maxGasPrice =  web3.utils.toBN(jsonInput["max gas price"]);
    negDiffInBps = web3.utils.toBN(jsonInput["neg diff in bps"]);
    minExpectedRateSlippage = web3.utils.toBN(jsonInput["min expected rate slippage"]);
    kncWallet = jsonInput["KNC wallet"];
    kncToEthRate = web3.utils.toBN(jsonInput["KNC to ETH rate"]);
    validDurationBlock = web3.utils.toBN(jsonInput["valid duration block"]);


    // output file name
    outputFileName = jsonInput["output filename"];
};


async function main() {
 nonce = await web3.eth.getTransactionCount(sender);
 console.log("nonce",nonce);


  console.log("starting compilation");
  var output = await solc.compile({ sources: input }, 1);
  //console.log(output);
  console.log("finished compilation");




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

  console.log("network", networkAddress);
  console.log("rates", conversionRatesAddress);
  console.log("reserve", reserveAddress);
  console.log("feeBurner", feeBurnerAddress);
  console.log("whitelistAddress", whitelistAddress);
  console.log("expectedRateAddress", expectedRateAddress);

  // add reserve to network
  console.log("Add reserve to network");
  //console.log(networkContract.methods.addReserve(reserveAddress,true));
  await sendTx(networkContract.methods.addReserve(reserveAddress,true));

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
  }

  // set params
  console.log("network set params");
  await sendTx(networkContract.methods.setParams(whitelistAddress,
                                                 expectedRateAddress,
                                                 feeBurnerAddress,
                                                 maxGasPrice,
                                                 negDiffInBps));

  // add operator
  console.log("network - add operator");
  await sendTx(networkContract.methods.addOperator(victor));
  // transfer admin ownership
  console.log("network transfer admin");
  await sendTx(networkContract.methods.transferAdminQuickly(admin));


  // reserve
  console.log("reserve set operator");
  await sendTx(reserveContract.methods.addOperator(victor));
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

  console.log("reserve transfer admin");
  await sendTx(reserveContract.methods.transferAdminQuickly(admin));


  // expected rates
  console.log("expected rate - add operator");
  await sendTx(expectedRateContract.methods.addOperator(ilan));
  console.log("expected rate - add temp operator");
  await sendTx(expectedRateContract.methods.addOperator(sender));
  console.log("expected rate - set slippage to 3%");
  await sendTx(expectedRateContract.methods.setMinSlippageFactor(minExpectedRateSlippage));
  console.log("expected rate - remove temp operator");
  await sendTx(expectedRateContract.methods.removeOperator(sender));

  console.log("expected rate transfer admin");
  await sendTx(expectedRateContract.methods.transferAdminQuickly(admin));


  // whitelist
  console.log("white list - add opeator 1");
  await sendTx(whitelistContract.methods.addOperator(ilan));
  console.log("white list - add temp opeator to set sgd rate");
  await sendTx(whitelistContract.methods.addOperator(sender));
  console.log("white list - set sgd rate");
  await sendTx(whitelistContract.methods.setSgdToEthRate(web3.utils.toBN("645161290322581")));
  console.log("white list - remove temp opeator to set sgd rate");
  await sendTx(whitelistContract.methods.removeOperator(sender));
  console.log("white list transfer admin");
  await sendTx(whitelistContract.methods.transferAdminQuickly(admin));

  // burn fee
  console.log("burn fee - set reserve data");
  await sendTx(feeBurnerContract.methods.setReserveData(reserveAddress,
                                                        25,
                                                        kncWallet));
  console.log("set kyber network");
  await sendTx(feeBurnerContract.methods.setKyberNetwork(networkAddress));
  console.log("set KNC to ETH rate");
  await sendTx(feeBurnerContract.methods.setKNCRate(kncToEthRate));
  console.log("burn fees transfer admin");
  await sendTx(feeBurnerContract.methods.transferAdminQuickly(admin));

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

  console.log("conversion rate - add operator");
  await sendTx(conversionRatesContract.methods.addOperator(victor));

  console.log("conversion rate - transfer admin");
  await sendTx(conversionRatesContract.methods.transferAdminQuickly(admin));

  console.log("last nonce is", nonce);
}

try{
  var content = fs.readFileSync("deployment_script_input.json", 'utf8');
  //console.log(content.substring(1470,1530));
  //console.log(content.substring(1400,1500));
  parseInput(JSON.parse(content));
}
catch(err) {
  console.log(err);
}

main();

//console.log(deployContract(output, "cont",5));
