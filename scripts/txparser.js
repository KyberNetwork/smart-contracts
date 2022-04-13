var Web3 = require('web3');

url = "http://localhost:8545/jsonrpc";
//url = "http://13.229.54.28:8545/"; // override
var web3 = new Web3(new Web3.providers.HttpProvider(url));
var BigNumber = web3.utils.BN;
  var fs = require("fs");

////////////////////////////////////////////////////////////////////////////////

var erc20Abi = [{"constant":false,"inputs":[{"name":"_spender","type":"address"},{"name":"_value","type":"uint256"}],"name":"approve","outputs":[{"name":"success","type":"bool"}],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[],"name":"totalSupply","outputs":[{"name":"totalSupply","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"_from","type":"address"},{"name":"_to","type":"address"},{"name":"_value","type":"uint256"}],"name":"transferFrom","outputs":[{"name":"success","type":"bool"}],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[{"name":"_owner","type":"address"}],"name":"balanceOf","outputs":[{"name":"balance","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"_to","type":"address"},{"name":"_value","type":"uint256"}],"name":"transfer","outputs":[{"name":"success","type":"bool"}],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[{"name":"_owner","type":"address"},{"name":"_spender","type":"address"}],"name":"allowance","outputs":[{"name":"remaining","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"anonymous":false,"inputs":[{"indexed":true,"name":"_from","type":"address"},{"indexed":true,"name":"_to","type":"address"},{"indexed":false,"name":"_value","type":"uint256"}],"name":"Transfer","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"_owner","type":"address"},{"indexed":true,"name":"_spender","type":"address"},{"indexed":false,"name":"_value","type":"uint256"}],"name":"Approval","type":"event"}];


var pricingAbi =
[{"constant":false,"inputs":[{"name":"alerter","type":"address"}],"name":"removeAlerter","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[{"name":"token","type":"address"},{"name":"currentBlockNumber","type":"uint256"},{"name":"buy","type":"bool"},{"name":"qty","type":"uint256"}],"name":"getPrice","outputs":[{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"reserve","type":"address"}],"name":"setReserveAddress","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"name":"token","type":"address"}],"name":"disableTokenTrade","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"name":"token","type":"address"}],"name":"enableTokenTrade","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"name":"tokens","type":"address[]"},{"name":"baseBuy","type":"uint256[]"},{"name":"baseSell","type":"uint256[]"},{"name":"buy","type":"bytes14[]"},{"name":"sell","type":"bytes14[]"},{"name":"blockNumber","type":"uint256"},{"name":"indices","type":"uint256[]"}],"name":"setBasePrice","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[],"name":"pendingAdmin","outputs":[{"name":"","type":"address"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[{"name":"","type":"uint256"}],"name":"alertersGroup","outputs":[{"name":"","type":"address"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"token","type":"address"},{"name":"amount","type":"uint256"},{"name":"sendTo","type":"address"}],"name":"withdrawToken","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"name":"newAlerter","type":"address"}],"name":"addAlerter","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[{"name":"token","type":"address"}],"name":"getPriceUpdateBlock","outputs":[{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"numTokensInCurrentCompactData","outputs":[{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"validPriceDurationInBlocks","outputs":[{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"buy","type":"bytes14[]"},{"name":"sell","type":"bytes14[]"},{"name":"blockNumber","type":"uint256"},{"name":"indices","type":"uint256[]"}],"name":"setCompactData","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"name":"duration","type":"uint256"}],"name":"setValidPriceDurationInBlocks","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"name":"newAdmin","type":"address"}],"name":"transferAdmin","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[],"name":"claimAdmin","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"name":"token","type":"address"},{"name":"xBuy","type":"int256[]"},{"name":"yBuy","type":"int256[]"},{"name":"xSell","type":"int256[]"},{"name":"ySell","type":"int256[]"}],"name":"setQtyStepFunction","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[{"name":"token","type":"address"},{"name":"buy","type":"bool"}],"name":"getBasicPrice","outputs":[{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"newOperator","type":"address"}],"name":"addOperator","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[],"name":"reserveContract","outputs":[{"name":"","type":"address"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"operator","type":"address"}],"name":"removeOperator","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"name":"token","type":"address"},{"name":"xBuy","type":"int256[]"},{"name":"yBuy","type":"int256[]"},{"name":"xSell","type":"int256[]"},{"name":"ySell","type":"int256[]"}],"name":"setImbalanceStepFunction","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"name":"token","type":"address"},{"name":"minimalRecordResolution","type":"uint256"},{"name":"maxPerBlockImbalance","type":"uint256"},{"name":"maxTotalImbalance","type":"uint256"}],"name":"setTokenControlInfo","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"name":"token","type":"address"},{"name":"buyAmount","type":"int256"},{"name":"priceUpdateBlock","type":"uint256"},{"name":"currentBlock","type":"uint256"}],"name":"recordImbalance","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"name":"amount","type":"uint256"},{"name":"sendTo","type":"address"}],"name":"withdrawEther","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"name":"token","type":"address"}],"name":"addToken","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[{"name":"token","type":"address"}],"name":"getCompactData","outputs":[{"name":"","type":"uint256"},{"name":"","type":"uint256"},{"name":"","type":"bytes1"},{"name":"","type":"bytes1"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[{"name":"token","type":"address"}],"name":"getTokenControlInfo","outputs":[{"name":"","type":"uint256"},{"name":"","type":"uint256"},{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"admin","outputs":[{"name":"","type":"address"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[{"name":"","type":"uint256"}],"name":"operatorsGroup","outputs":[{"name":"","type":"address"}],"payable":false,"stateMutability":"view","type":"function"},{"inputs":[{"name":"_admin","type":"address"}],"payable":false,"stateMutability":"nonpayable","type":"constructor"},{"anonymous":false,"inputs":[{"indexed":false,"name":"token","type":"address"},{"indexed":false,"name":"amount","type":"uint256"},{"indexed":false,"name":"sendTo","type":"address"}],"name":"WithdrawToken","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"name":"amount","type":"uint256"},{"indexed":false,"name":"sendTo","type":"address"}],"name":"WithdrawEther","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"name":"pendingAdmin","type":"address"}],"name":"TransferAdmin","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"name":"newAdmin","type":"address"},{"indexed":false,"name":"previousAdmin","type":"address"}],"name":"ClaimAdmin","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"name":"newAlerter","type":"address"},{"indexed":false,"name":"isAdd","type":"bool"}],"name":"AddAlerter","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"name":"newOperator","type":"address"},{"indexed":false,"name":"isAdd","type":"bool"}],"name":"AddOperator","type":"event"}]

////////////////////////////////////////////////////////////////////////////////

var allAbis = [erc20Abi];
var contracts = ["NimbleReserve", "NimbleNetwork", "ConversionRates"];
var mockContracts = ["MockCentralBank", "Wrapper"];
var configFile = "deployment_dev.json";

////////////////////////////////////////////////////////////////////////////////

var readAbisFromFile = function( abiFileNames, mock ) {

  var prefix = "./contracts/abi/";
  if( mock ) {
    prefix = "./contracts/mockContracts/abi/";
  }

  for( var i = 0 ; i < abiFileNames.length ; i++ ){
    var abiString = fs.readFileSync(prefix + abiFileNames[i] + ".abi", 'utf8');

    var abiJson = JSON.parse(abiString);
    allAbis.push(abiJson);
  }
};

////////////////////////////////////////////////////////////////////////////////

var getFunctionNameAndInputs = function( txData ) {
  for( var abiIndex = 0 ; abiIndex < allAbis.length ; abiIndex++ ){
    var jsonAbi = allAbis[abiIndex];
    for( var i = 0 ; i < jsonAbi.length ; i++ ) {
      var func = jsonAbi[i];
      if( func["type"] == "function" ) {
        var sig = web3.eth.abi.encodeFunctionSignature(
          { name: func["name"], type : func["type"], inputs : func["inputs"] }
        );
        if( sig.substring(0,10) === txData.substring(0,10) )
          return [func["name"],func["inputs"]];
      }
    }
  }
};

////////////////////////////////////////////////////////////////////////////////

var decodeData = function( txData, name, inputs ) {
  var dictData = web3.eth.abi.decodeParameters( inputs, txData.substring(10));
  console.log(name);
  console.log("--------------------------");
  for( var i = 0 ; i < inputs.length ; i++ ) {
    var key = inputs[i].name;
    var value = dictData[key];
    if( inputs[i].type == "address" ) {
      value = addressString(value);
    }
    console.log(key + ":", value);
  }
  console.log("");
};

////////////////////////////////////////////////////////////////////////////////

var decodeTx = function(txHash) {
  return new Promise(function (fulfill, reject){
    web3.eth.getTransaction(txHash).then(function(result){
      importantAddressNames[web3.utils.toChecksumAddress(result.from)] = "sender";

      console.log("block",result.blockNumber);
      console.log("from:", result.from);
      console.log("to:", addressString(result.to));
      console.log("gasLimit:", result.gas);

      sender = result.from;
      gasPrice = web3.utils.toBN(result.gasPrice);
      currentBlock = web3.utils.toBN(result.blockNumber);


      var txData = result.input;
      var [name,inputs] = getFunctionNameAndInputs(txData);

      // get reciept to get used gas
      web3.eth.getTransactionReceipt(txHash,function(err,result){
        gasUsed = web3.utils.toBN(result.gasUsed);
        gasFee = gasPrice.mul(gasUsed);



        console.log("gas Used:", gasUsed.toString(10));
        console.log("gas Price:", gasPrice.toString(10));
        console.log("gas Fee: " + web3.utils.fromWei(gasFee,"ether") + " ETH");


        console.log("-----");

        decodeData(txData,name,inputs);

        fulfill(true);
      });
    });
  });
};

////////////////////////////////////////////////////////////////////////////////

var balancesBefore = {}; // user to (symbol to number dict)
var balancesAfter = {}; // user to (symbol to number dict)
var gasPrice;
var gasUsed;
var gasFee;
var sender;
var currentBlock;
var decimals = {}; // symbol to number
var importantAddressNames = {}; // address to name

////////////////////////////////////////////////////////////////////////////////

var configJson = JSON.parse(fs.readFileSync(configFile, 'utf8'));

var parseConfigJson = function() {
  var tokenInfo = configJson["tokens"];
  var tokenSymbols = Object.keys(tokenInfo);
  for( var i = 0 ; i < tokenSymbols.length ; i++ ) {
    decimals[tokenSymbols[i]] = tokenInfo[tokenSymbols[i]].decimals;
    var address = web3.utils.toChecksumAddress(tokenInfo[tokenSymbols[i]].address);
      importantAddressNames[address] = tokenSymbols[i];
  }


  // get exchanges
  var exchageInfo = configJson["exchanges"];
  var exchanges = Object.keys(exchageInfo);
  for( var i = 0 ; i < exchanges.length ; i++ ) {
    var name = exchanges[i];
    var exchange = exchageInfo[name];
    for( var tokenInd = 0 ; tokenInd < tokenSymbols.length ; tokenInd++ ) {
      var symbol = tokenSymbols[tokenInd];
      var address = web3.utils.toChecksumAddress(exchange[symbol]);
      importantAddressNames[address] = name + "_" + symbol;
    }
  }

  // get other items
  var names = ["bank", "reserve", "network", "wrapper"];
  for( var i = 0 ; i < names.length ; i++ ) {
    var name = names[i];
    address = web3.utils.toChecksumAddress(configJson[names[i]]);
    importantAddressNames[address] = name;
  }
};

var addressString = function(address) {
  if( importantAddressNames[web3.utils.toChecksumAddress(address)] ) {
    return importantAddressNames[web3.utils.toChecksumAddress(address)];
  }
  return address;
};

////////////////////////////////////////////////////////////////////////////////

var getETHBalanceWithPromise = function(userAddress, blockNumber) {
  return new Promise(function (fulfill, reject){
    web3.eth.getBalance(userAddress,blockNumber,function(err,result){
      if( err ) return reject(err);
      else {
        return fulfill(web3.utils.toBN(result));
      }
    });
  });
};

////////////////////////////////////////////////////////////////////////////////

var getTokenBalanceWithPromise = function(userAddress, tokenAddress, blockNumber) {
  return new Promise(function (fulfill, reject){
    var tokenInstance = new web3.eth.Contract(erc20Abi,tokenAddress);

    var txData = tokenInstance.methods.balanceOf(web3.utils.toChecksumAddress(userAddress)).encodeABI();
    web3.eth.call({to:tokenAddress, data:txData},blockNumber,function(err,result){
      if( err ) return reject(err);
      else {
        return fulfill(web3.utils.toBN(result));
      }
    });
  });
};


////////////////////////////////////////////////////////////////////////////////

var getPricingValidBlock = function(contractAddress, abi, blockNumber) {
  return new Promise(function (fulfill, reject){
    var pricingInstance = new web3.eth.Contract(abi,contractAddress);
    var txData = pricingInstance.methods.validPriceDurationInBlocks().encodeABI();
    web3.eth.call({to:contractAddress, data:txData},blockNumber,function(err,result){
      if( err ) return reject(err);
      else {
        return fulfill(web3.utils.toBN(result));
      }
    });
  });
};


////////////////////////////////////////////////////////////////////////////////

var getTokenBalancesWithPromise = function(userAddress, blockNumber, before ) {
  if( before ) {
    balancesBefore[userAddress] = {};
  }
  else {
    balancesAfter[userAddress] = {};
  }
  return new Promise(function (fulfill, reject){
    var tokenInfo = configJson["tokens"];
    var keys = Object.keys(tokenInfo);
    var tokens = [];
    for( var i = 0 ; i < keys.length ; i++ ) {
      var tokenInstance = new web3.eth.Contract(erc20Abi,keys[i].address);
      tokens.push({symbol:keys[i], address:tokenInfo[keys[i]].address});
    }

    return tokens.reduce(function (promise, item) {
     return promise.then(function () {
         if( item.symbol == "ETH" ) return getETHBalanceWithPromise(userAddress, blockNumber);
         else return getTokenBalanceWithPromise(userAddress,item.address, blockNumber);
     }).then(function(result,err){
       var symbol = item.symbol;
         if( err ) return reject(err);

         if( before ) {
           balancesBefore[userAddress][symbol] = result;
         }
         else {
           balancesAfter[userAddress][symbol] = result;
         }
     });

     }, Promise.resolve()).then(function(){
         fulfill(true);
     }).catch(function(err){
         reject(err);
     });


  });
};

////////////////////////////////////////////////////////////////////////////////

var fromTokenWei = function( amount, symbol ) {
  var stringAmount = amount.toString(10);
  var digits = decimals[symbol];
  var integer = stringAmount.substring(0,stringAmount.length - digits);
  var fraction = stringAmount.substring(stringAmount.length - digits);
  if( fraction.length < digits) {
    fraction = web3.utils.toBN(10).pow(
      web3.utils.toBN(fraction.length - digits)).toString(10).substring(1) +
     fraction;
  }

  return integer + "." + fraction;
};

////////////////////////////////////////////////////////////////////////////////

var printBalanceDiff = function( userAddress ) {
  var tokens = Object.keys(balancesAfter[userAddress]);
  for( var i = 0 ; i < tokens.length ; i++ ) {
    var symbol = tokens[i];
    var balanceBefore = web3.utils.toBN(0);
    if( balancesBefore[userAddress] ) {
        balancesBefore = balancesBefore[userAddress][symbol];
    }
    var balanceAfter  = balancesAfter[userAddress][symbol];

    if( symbol == "ETH" &&
        web3.utils.toChecksumAddress(userAddress) == web3.utils.toChecksumAddress(sender) ) {
        balanceAfter = balanceAfter.add(gasFee);
    }

    if( balanceBefore.lt(balanceAfter) ) {
      console.log(addressString(userAddress),
        "recieved " + fromTokenWei(balanceAfter.sub(balanceBefore),symbol) + " " + symbol);
    }
    else if( balanceBefore.gt(balanceAfter) ) {
      console.log(addressString(userAddress),
        "sent " + fromTokenWei(balanceBefore.sub(balanceAfter),symbol) + " " + symbol);
    }
  }
};

////////////////////////////////////////////////////////////////////////////////

var printAllAddressesBalanceDiff = function(fromScratch) {
  return new Promise(function (fulfill, reject){
    var beforeBlock = currentBlock.sub(web3.utils.toBN(1));
    var importantAddresses = Object.keys(importantAddressNames);
    return importantAddresses.reduce(function (promise, item) {
     return promise.then(function () {
         return getTokenBalancesWithPromise(item, beforeBlock,true && (!fromScratch));
     }).then(function(){
       return getTokenBalancesWithPromise(item, currentBlock,false);
     }).then(function(){
       printBalanceDiff(item);
     });

     }, Promise.resolve()).then(function(){
         fulfill(true);
     }).catch(function(err){
         reject(err);
     });
  });
};

////////////////////////////////////////////////////////////////////////////////
//console.log(process.argv);

parseConfigJson();
readAbisFromFile(contracts, false);
readAbisFromFile(mockContracts, true);

var command = process.argv[2];
var txHash;
if( command == "--txhash" ) {
  txHash = process.argv[3];
  console.log("tx hash",txHash);
  return  decodeTx(txHash/*"0x38e47e503ecd83eee9a37b9325e057cb5d5d1cdece6f80dbe4fa38335dc48277"*/).then(function(){
    return printAllAddressesBalanceDiff(false);

  });
}
else if( command == "--getvalidpricedurationinblocks" ) {
  var address = process.argv[3];
  abi = pricingAbi;
  console.log("pricing address",address);
  return getPricingValidBlock(address, abi, "latest").then(function(result){
    console.log(result);
  });
}
else if( command == "--getbalance"){
  if( process.argv.length > 3 ) {
    importantAddressNames[web3.utils.toChecksumAddress(process.argv[3])] = "user address";
  }
  return web3.eth.getBlockNumber().then(function(blockNumber) {
    currentBlock = web3.utils.toBN(blockNumber);
    return printAllAddressesBalanceDiff(true);
  });
}
