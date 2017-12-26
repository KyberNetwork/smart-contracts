var TestToken = artifacts.require("./TestToken.sol");
var Reserve = artifacts.require("./KyberReserve.sol");
var Network = artifacts.require("./KyberNetwork.sol");
var Pricing = artifacts.require("./Pricing.sol");
var Bank   = artifacts.require("./MockCentralBank.sol");
var Whitelist  = artifacts.require("./KyberWhiteList.sol");
var Wrapper   = artifacts.require("./Wrapper.sol");
var CentralizedExchange = artifacts.require("./MockExchange.sol");
var BigNumber = require('bignumber.js');

var tokenSymbol = [];//["OMG", "DGD", "CVC", "FUN", "MCO", "GNT", "ADX", "PAY",
                   //"BAT", "KNC", "EOS", "LINK"];
var tokenName = [];//[ "OmiseGO", "Digix", "Civic", "FunFair", "Monaco", "Golem",
//"Adex", "TenX", "BasicAttention", "KyberNetwork", "Eos", "ChainLink" ];

var tokenDecimals = [];//[18,9,8,8,8,18,4,18,18,18,18,18]

var tokenInitialReserveBalance = [];

var reserveInitialEth;

var tokenInstance = [];


var conversionRate = (((new BigNumber(10)).pow(18)).mul(2));
var counterConversionRate = (((new BigNumber(10)).pow(18)).div(2));

var expBlock = 10**10;

var tokenOwner;

var network;
var networkOwner;

var reserve;
var reserveOwner;

var ethAddress = new BigNumber("0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee");

var exchanges = [];// ["Bittrex", "Liqui", "Poloniex", "Binance", "Bitfinex"];
var exchangesInstance = [];
var exchangeDepositAddresses = [];

var bank;
var wrapper;

var whitelist;
var pricing;


var nam;// = "0xc6bc2f7b73da733366985f5f5b485262b45a77a3";
var victor;// = "0x760d30979eb313a2d23c53e4fb55986183b0ffd9";
var duc;// = "0x25B8b1F2c21A70B294231C007e834Ad2de04f51F";


var outputFileName;

////////////////////////////////////////////////////////////////////////////////

var getNetwork = function(){
  var id = web3.version.network;
  if(id >= 1500000000000){
    return "testrpc";
  }
  else if( id == 17 || id == 4447) {
    return "dev";
  }
  else if( id == 42 ) {
    return "kovan";
  }
  else {
    return "unknown";
  }
};

////////////////////////////////////////////////////////////////////////////////

var parseInput = function( jsonInput ) {
    // tokens
    var tokenInfo = jsonInput["tokens"];
    Object.keys(tokenInfo).forEach(function(key) {
      var val = tokenInfo[key];
      var symbol = key;
      var name = val["name"];
      var decimals = val["decimals"];
      var initialBalance = val["reserve balance"];
      if( initialBalance === undefined ) {
        initialBalance = jsonInput["default reserve balances"]["token"];
      }

      tokenSymbol.push(key);
      tokenName.push(name);
      tokenDecimals.push(decimals);
      tokenInitialReserveBalance.push(initialBalance);
    });

    // exchanges
    var exchangeInfo = jsonInput["exchanges"];
    exchangeInfo.forEach(function(exchange) {
      exchanges.push(exchange);
    });

    // special addresses
    var specialAddresses = jsonInput["special addresses"];
    victor = specialAddresses["victor"];
    nam = specialAddresses["nam"];
    duc = specialAddresses["duc"];

    // output file name
    outputFileName = jsonInput["output filename"];

    // reserve initial ether
    reserveInitialEth = jsonInput["default reserve balances"]["ether"];
};

////////////////////////////////////////////////////////////////////////////////

var deployTokens = function( owner ){
  return new Promise(function (fulfill, reject){

      var inputs = [];

      for (var i = 0 ; i < tokenSymbol.length ; i++ ) {
          inputs.push(i);
      }

     return inputs.reduce(function (promise, item) {
      return promise.then(function () {
          var symbol = tokenSymbol[item];
          var name = tokenName[item];
          var decimals = tokenDecimals[item];
          return TestToken.new(name, symbol, decimals, {from:owner});
      }).then(function(instance){
          tokenInstance.push(instance);
      });

      }, Promise.resolve()).then(function(){
          fulfill(true);
      }).catch(function(err){
          reject(err);
      });
  });
};

////////////////////////////////////////////////////////////////////////////////

var transferFundsToBank = function( owner, bankAddress, amount ) {
  return new Promise(function (fulfill, reject){

      var inputs = [];

      for (var i = 0 ; i < tokenInstance.length ; i++ ) {
          inputs.push(tokenInstance[i]);
      }

     return inputs.reduce(function (promise, item) {
      return promise.then(function () {
          return item.transfer(bankAddress, amount, {from:owner});
      });

      }, Promise.resolve()).then(function(){
          fulfill(true);
      }).catch(function(err){
          reject(err);
      });
  });
};

////////////////////////////////////////////////////////////////////////////////

var depositTokensToReserve = function( owner, reserveInstance ) {
  return new Promise(function (fulfill, reject){

      var inputs = [];

      for (var i = 0 ; i < tokenInstance.length ; i++ ) {
          inputs.push(i);
      }

      var actualAmount;
     return inputs.reduce(function (promise, item) {
       var token = tokenInstance[item];
       var amount = tokenInitialReserveBalance[item];
      return promise.then(function () {
          return token.decimals();
      }).then(function(decimals){
          actualAmount = new BigNumber(amount).mul(new BigNumber(10).pow(decimals));
          return token.transfer(reserveInstance.address, actualAmount, {from:owner});
          //return token.approve(reserveInstance.address, actualAmount, {from:owner});
      //}).then(function(){
        //return reserve.depositToken(token.address, actualAmount, {from:owner})
      }).then(function(){
        // send some tokens to duc
        return token.transfer(duc, actualAmount,{from:owner});
      });

      }, Promise.resolve()).then(function(){
          fulfill(true);
      }).catch(function(err){
          reject(err);
      });
  });
};

////////////////////////////////////////////////////////////////////////////////

var createExchanges = function( owner, bankAddress ) {
    return new Promise(function (fulfill, reject){

        var inputs = [];

        for (var i = 0 ; i < exchanges.length ; i++ ) {
          inputs.push(exchanges[i]);
        }

        return inputs.reduce(function (promise, item) {
            return promise.then(function () {
                return CentralizedExchange.new(item, bankAddress, {from:owner});
            }).then(function(instance){
                exchangesInstance.push(instance);
                return addDepositAddressToExchange(instance, owner);
            });
        }, Promise.resolve()).then(function(){
            fulfill(true);
        }).catch(function(err){
            reject(err);
        });
    });
};

/////////////////////////////////////////////////////////////////


var addDepositAddressToExchange = function( exchange, owner ) {
    return new Promise(function (fulfill, reject){

        var tokens = [];
        var depositAddresses = {}; //dict (JS object) of deposit address per token for this exchange

        //create array of tokens
        for (var i = 0 ; i < tokenInstance.length ; i++ ) {
            tokens.push(i);
        }

        return tokens.reduce(function (promise, item) {
            return promise.then(function () {
                return exchange.addMockDepositAddress( tokenInstance[item].address, {from:owner});
            }).then(function(){
                return exchange.tokenDepositAddresses(tokenInstance[item].address)
            }).then (function (mockDepositAddress){
                depositAddresses[tokenSymbol[item]] = mockDepositAddress;
            });
        }, Promise.resolve()).then(function(){
            return exchange.addMockDepositAddress(ethAddress, {from:owner});
        }).then(function(){
            return exchange.tokenDepositAddresses(ethAddress);
        }).then(function(depositAddress) {
            depositAddresses["ETH"] = depositAddress;
            exchangeDepositAddresses.push(depositAddresses);
            fulfill(true);
        }).catch(function(err){
          reject(err);
        });
    });
};

////////////////////////////////////////////////////////////////////////////////

var transferOwnershipInExchangesAndBank = function( owner, newOwners ) {
  return new Promise(function (fulfill, reject){

      var inputs = [];
      function OwnerAndExchange( owner, exchangesInstance) {
        this.owner = owner;
        this.exchangesInstance = exchangesInstance;
      }

      for (var i = 0 ; i < exchanges.length ; i++ ) {
        for( var j = 0 ; j < newOwners.length ; j++ ) {
          inputs.push(new OwnerAndExchange(newOwners[j],exchangesInstance[i]));
        }
      }

     return inputs.reduce(function (promise, item) {
      return promise.then(function () {
          return item.exchangesInstance.addOwner(item.owner);
      }).then(function(){
        return bank.addOwner(item.owner);
      });

      }, Promise.resolve()).then(function(){
          fulfill(true);
      }).catch(function(err){
          reject(err);
      });
  });
};

////////////////////////////////////////////////////////////////////////////////

var listTokens = function( owner, reserve, network, expBlock, rate, convRate ) {
  return new Promise(function (fulfill, reject){

      var inputs = [];

      for (var i = 0 ; i < tokenInstance.length ; i++ ) {
          inputs.push(tokenInstance[i]);
      }

     return inputs.reduce(function (promise, item) {
      var tokenAddress = item.address;
      return promise.then(function () {
          // list (eth=>token) in reserve
          // list (token=>eth) in reserve
          // list (eth=>token) in network
          // list (token=>eth) in network
          return pricing.addToken( tokenAddress );
      }).then(function(){
        return item.decimals();
      }).then(function(decimals){
          return pricing.setTokenControlInfo( tokenAddress,
                                              10**(decimals-2),
                                              (10 ** decimals) * 10000,
                                              (10 ** decimals) * 1000000 );
      }).then(function(){
          return pricing.enableTokenTrade( tokenAddress );
      }).then(function(){
          var x = [0];
          var y = [0];
          return pricing.setQtyStepFunction(tokenAddress,
                                            x,
                                            y,
                                            x,
                                            y );
      }).then(function(){
        var x = [0];
        var y = [0];
        return pricing.setImbalanceStepFunction(tokenAddress,
                                          x,
                                          y,
                                          x,
                                          y );
      }).then(function(){
        return pricing.setBasePrice( [tokenAddress],
                                     [convRate],
                                     [rate],
                                     [0/*,2,3,4,5,6,7,8,9,10,11,12,13,14*/],
                                     [0/*,2,3,4,5,6,7,8,9,10,11,12,13,14*/],
                                     web3.eth.blockNumber,
                                     [0] );
      }).then(function(){
        return network.listPairForReserve(reserve.address,
                                          tokenAddress,
                                          ethAddress,
                                          true,
                                          {from:networkOwner});
      }).then(function(){
        return network.listPairForReserve(reserve.address,
                                          ethAddress,
                                          tokenAddress,
                                          true,
                                          {from:networkOwner});
      });

      }, Promise.resolve()).then(function(){
          fulfill(true);
      }).catch(function(err){
          reject(err);
      });
  });
};

////////////////////////////////////////////////////////////////////////////////

var sendEtherWithPromise = function( sender, recv, amount ) {
    return new Promise(function(fulfill, reject){
            web3.eth.sendTransaction({to: recv, from: sender, value: amount}, function(error, result){
            if( error ) {
                return reject(error);
            }
            else {
                return fulfill(true);
            }
        });
    });
};

////////////////////////////////////////////////////////////////////////////////

contract('Deployment', function(accounts) {

  beforeEach(function(done){
    done();
  });
  afterEach(function(done){
    done();
  });

  it("check network", function() {
    var networkId = getNetwork();
    if( networkId == "kovan" || networkId == "testrpc" || networkId == "dev" ) {
      console.log("network", networkId);
    }
    else {
      console.log("unsupported network", networkId);
      assert.fail("unsupported network", networkId);
    }
  });

  it("read parameters from file", function() {
    var fs = require("fs");
    try{
      var content = JSON.parse(fs.readFileSync("deployment_input.json", 'utf8'));
      parseInput(content);
    }
    catch(err) {
      console.log(err);
      assert.fail(err.toString());
    }
  });

  it("create tokens", function() {
//    console.log(accounts[0]);

    this.timeout(30000000);
    tokenOwner = accounts[0];
    return deployTokens(tokenOwner);
  });

  it("create bank and transfer funds", function() {
    var amount = (new BigNumber(10)).pow(40+18);
    return Bank.new().then(function(instance){
        bank = instance;
        return transferFundsToBank(tokenOwner, bank.address, amount);
        // TODO - deposit ether
    }).then(function(){
      return bank.depositEther({value:10}); // deposit 10 wei
    }).then(function(){
      if( getNetwork() === "dev" ) {
        var bankInitialEth = new BigNumber(10**18).mul(10**10);
        console.log("depositing " + bankInitialEth.toString() + " ether to bank");
        return sendEtherWithPromise(accounts[0],bank.address,bankInitialEth);
      }
    });
  });

  it("create exchanges", function() {
    return createExchanges( tokenOwner, bank.address );
  });

  it("withdraw ETH from exchange", function() {
    return exchangesInstance[0].withdraw(ethAddress,1,accounts[0],{from:tokenOwner});
  });

  it("withdraw token from exchange", function() {
    var depositAddress = exchangeDepositAddresses[0][tokenSymbol[0]];
    return exchangesInstance[1].withdraw(tokenInstance[0].address,2,depositAddress,{from:tokenOwner}).then(function(){
      return tokenInstance[0].balanceOf(depositAddress);
    }).then(function(result){
      assert.equal(result.valueOf(), new BigNumber(2).valueOf(), "unexpected balance");
    });
  });

  it("withdraw token from exchange to exchange and clear funds", function() {
    var depositAddress = exchangeDepositAddresses[0][tokenSymbol[0]];
    return exchangesInstance[0].clearBalances([tokenInstance[0].address, ethAddress],[1,0]).then(function(){
        return tokenInstance[0].balanceOf(depositAddress);
    }).then(function(result){
      assert.equal(result.valueOf(), new BigNumber(1).valueOf(), "unexpected balance");
    });
  });

  it("create whitelist", function() {
    return Whitelist.new(accounts[0]).then(function(instance){
        whitelist = instance;
        return whitelist.addOperator(accounts[0]);
    }).then(function(){
        return whitelist.setCategoryCap(0,5000);
    }).then(function(){
      return whitelist.setSgdToEthRate((new BigNumber(10).pow(15)).mul(2));
    });
  });

  it("create network", function() {
    networkOwner = accounts[0];
    return Network.new(networkOwner,{gas:6000000}).then(function(instance){
        network = instance;
        // set whitelist
        return network.setKyberWhiteList(whitelist.address);
    });
  });

  it("create pricing", function() {
    return Pricing.new(accounts[0],{gas:6000000}).then(function(instance){
        pricing = instance;
        return pricing.addOperator(victor,{from:accounts[0]});
    }).then(function(result){
        return pricing.addOperator(accounts[0],{from:accounts[0]});
    });
  });

  it("create reserve and deposit tokens", function() {
    this.timeout(30000000);
    reserveOwner = accounts[0];
    return Reserve.new(network.address,pricing.address, reserveOwner,{gas:6000000}).then(function(instance){
        reserve = instance;
    }).then(function(){
        return pricing.setValidPriceDurationInBlocks(new BigNumber(100));
    }).then(function(){
        return pricing.setReserveAddress(reserve.address);
    }).then(function(){
        return depositTokensToReserve( tokenOwner, reserve );
    }).then(function(){
      if( getNetwork() == "dev" ) {
        console.log("depositing " + reserveInitialEth.toString() + " ether to reserve");
        var amount = new BigNumber(reserveInitialEth).mul(10**18);
        return sendEtherWithPromise(accounts[0],reserve.address,amount);
      }
    });
  });

  it("add reserve to network", function() {
    return network.addReserve(reserve.address, true, {from:networkOwner});
  });

  it("list tokens", function() {
    this.timeout(30000000);
    return listTokens( tokenOwner, reserve, network, expBlock, conversionRate, counterConversionRate );
  });

  it("create wrapper", function() {
    var balance0;
    var balance1;
    return Wrapper.new().then(function(instance){
      wrapper = instance;
      return wrapper.getBalances( reserve.address, [tokenInstance[0].address,
                                                    tokenInstance[1].address] );
    }).then(function(result){
      balance0 = result[0];
      balance1 = result[1];
      return tokenInstance[0].balanceOf(reserve.address);
    }).then(function(result){
      assert.equal(balance0.valueOf(), result.valueOf(), "unexpected balance 0");
      return tokenInstance[1].balanceOf(reserve.address);
    }).then(function(result){
      assert.equal(balance1.valueOf(), result.valueOf(), "unexpected balance 1");
      //return wrapper.getPrices( reserve.address, [tokenInstance[0].address,
      //                          tokenInstance[1].address], [ethAddress, ethAddress]);
    }).then(function(result){
      //console.log("===");
      //console.log(result);
      //console.log("===");
    });
  });

  it("set eth to dgd rate", function() {
    return pricing.setBasePrice( [tokenInstance[1].address],
                                 [0x47d40a969bd7c0021],
                                 [conversionRate],
                                 [0],
                                 [0],
                                 web3.eth.blockNumber,
                                 [0] );
  });

  it("add operator in reserve", function() {
    return reserve.addOperator(victor);
  });

  it("transfer ownership in exchanges", function() {
    this.timeout(30000000);
    return transferOwnershipInExchangesAndBank(tokenOwner,nam).then(function(){
    return exchangesInstance[1].owners(nam[1]);
  }).then(function(result){
    assert.equal(result.valueOf(),true.valueOf(), "unexpected owner address");
  });
});


  it("do a single exchange", function() {
    var dgdAddress = tokenInstance[1].address;
    var ethAmount = 1 * 10**16;
    var rate = 0x47d40a969bd7c0021;
    var expectedDgd = (ethAmount * rate / 10**18) / (10**18 / 10**tokenDecimals[1]);
    var destAddress = "0x001adbc838ede392b5b054a47f8b8c28f2fa9f3c";

    return network.trade(ethAddress,
                         ethAmount,
                         dgdAddress,
                         destAddress,
                         new BigNumber(2).pow(255),
                         rate,{value:ethAmount}).then(function(result){
       //for( var i = 0 ; i < result.receipt.logs.length ; i++ )
       //console.log(result.receipt.logs[i].data);


       return tokenInstance[1].balanceOf(destAddress);
    }).then(function(result){
      if( result.valueOf() > expectedDgd.valueOf() + 10 ) {
        assert.fail("unexpected dgd balacne", result.valueOf(), expectedDgd.valueOf() );
      }
      if( result.valueOf() < expectedDgd.valueOf() - 10 ) {
        assert.fail("unexpected dgd balacne", result.valueOf(), expectedDgd.valueOf() );
      }
    });
  });


  it("print addresses", function() {
    tokensDict = {};
    console.log("\ntokens");
    tokensDict["ETH"] = {"address" : "0x" + ethAddress.toString(16), "name" : "Ethereum", "decimals" : 18 };
    for( var i = 0 ; i < tokenSymbol.length ; i++ ) {
      //console.log(tokenSymbol[i] + " : " + tokenInstance[i].address );
      tokenDict = {"address" : tokenInstance[i].address,
                   "name" : tokenName[i],
                   "decimals" : tokenDecimals[i]};
      tokensDict[tokenSymbol[i]] = tokenDict;
    }
    exchangesDepositAddressesDict = {};
    exchangesAddressDict = {};
    for( var exchangeInd = 0 ; exchangeInd < exchanges.length ; exchangeInd++ ) {
      exchangesAddressDict[exchanges[exchangeInd]] = exchangesInstance[exchangeInd].address;
      exchangesDepositAddressesDict[exchanges[exchangeInd]] = exchangeDepositAddresses[exchangeInd];
    }

    dict = { "tokens" : tokensDict, "exchangesAddress" : exchangesAddressDict, "exchanges" : exchangesDepositAddressesDict };
    dict["bank"] = bank.address;
    dict["reserve"] = reserve.address;
    dict["pricing"] = pricing.address;
    dict["network"] = network.address;
    dict["wrapper"] = wrapper.address;

    var json = JSON.stringify(dict, null, 2);

    console.log(json);

    // writefilesync.js
    var fs = require('fs');
    fs.writeFileSync(outputFileName, json);

    console.log("json file is saved in " + outputFileName);
  });
});
