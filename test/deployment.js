var TestToken = artifacts.require("./TestToken.sol");
var Reserve = artifacts.require("./KyberReserve.sol");
var Network = artifacts.require("./KyberNetwork.sol");
var Wallet = artifacts.require("./KyberWallet.sol");
var Bank   = artifacts.require("./MockCenteralBank.sol");
var Wrapper   = artifacts.require("./Wrapper.sol");
var CenteralizedExchange = artifacts.require("./MockExchangeDepositAddress.sol");
var BigNumber = require('bignumber.js');

var wallet;

var tokenSymbol = ["OMG", "DGD", "CVC", "FUN", "MCO", "GNT", "ADX", "PAY",
                   "BAT", "KNC", "EOS", "LINK"];
var tokenName = tokenSymbol;
var tokenDecimals = [18,9,8,8,8,18,4,18,18,18,18,18]

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

var exchanges = ["Bittrex", "Liqui", "Poloniex", "Binance", "Bitfinex"];
var exchangesInstance = [];

var bank;
var wrapper;

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

var depositTokensToReserve = function( owner, reserveInstance, amount ) {
  return new Promise(function (fulfill, reject){

      var inputs = [];

      for (var i = 0 ; i < tokenInstance.length ; i++ ) {
          inputs.push(tokenInstance[i]);
      }

      var actualAmount;
     return inputs.reduce(function (promise, item) {
      return promise.then(function () {
          return item.decimals();
      }).then(function(decimals){
          actualAmount = new BigNumber(amount).mul(new BigNumber(10).pow(decimals));
          return item.approve(reserveInstance.address, actualAmount, {from:owner});
      }).then(function(){
        return reserve.depositToken(item.address, actualAmount, {from:owner})
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
          return CenteralizedExchange.new(item, bankAddress, {from:owner});
      }).then(function(instance){
        exchangesInstance.push(instance);
        // deposit 1 wei
        return instance.depositEther({value:1}); // deposit 1 wei
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
          return reserve.setRate([tokenAddress],
                                 [ethAddress],
                                 [rate],
                                 [expBlock],
                                 true, {from:reserveOwner});
      }).then(function(){
        return reserve.setRate([ethAddress],
                               [tokenAddress],
                               [convRate],
                               [expBlock],
                               true, {from:reserveOwner});
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

contract('Deployment', function(accounts) {

  beforeEach(function(done){
    done();
  });
  afterEach(function(done){
    done();
  });


  it("create tokens", function() {
    console.log(accounts[0]);

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
    });
  });

  it("create exchanges", function() {
    return createExchanges( tokenOwner, bank.address );
  });

  it("withdraw ETH from exchange", function() {
    return exchangesInstance[0].withdraw(ethAddress,2,accounts[0],{from:tokenOwner});
  });

  it("withdraw token from exchange", function() {
    return exchangesInstance[1].withdraw(tokenInstance[0].address,2,exchangesInstance[0].address,{from:tokenOwner}).then(function(){
      return tokenInstance[0].balanceOf(exchangesInstance[0].address);
    }).then(function(result){
      assert.equal(result.valueOf(), new BigNumber(2).valueOf(), "unexpected balance");
    });
  });

  it("withdraw token from exchange to exchange and clear funds", function() {
    return exchangesInstance[0].clearBalances([tokenInstance[0].address, ethAddress],[1,0]).then(function(){
        return tokenInstance[0].balanceOf(exchangesInstance[0].address);
    }).then(function(result){
      assert.equal(result.valueOf(), new BigNumber(1).valueOf(), "unexpected balance");
    });
  });


  it("create network", function() {
    networkOwner = accounts[0];
    return Network.new(networkOwner).then(function(instance){
        network = instance;
    });
  });

  it("create reserve and deposit tokens", function() {
    reserveOwner = accounts[0];
    return Reserve.new(network.address, reserveOwner).then(function(instance){
        reserve = instance;
        var amount = (new BigNumber(10)).pow(4);
        return depositTokensToReserve( tokenOwner, reserve, amount );
    });

    // TODO deposit ether
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
      assert.equal(balance0.valueOf(), result.valueOf(), "unexpeted balance 0");
      return tokenInstance[1].balanceOf(reserve.address);
    }).then(function(result){
      assert.equal(balance1.valueOf(), result.valueOf(), "unexpeted balance 1");
      return wrapper.getPrices( reserve.address, [tokenInstance[0].address,
                                tokenInstance[1].address], [ethAddress, ethAddress]);
    }).then(function(result){
      console.log("===");
      console.log(result);
      console.log("===");
    });
  });

  it("transfer ownership in reserve", function() {
    return reserve.changeOwner("0x001adbc838ede392b5b054a47f8b8c28f2fa9f3f");
    return listTokens( tokenOwner, reserve, network, expBlock, conversionRate, counterConversionRate );
  });

  it("do a single exchange", function() {
    var dgdAddress = tokenInstance[1].address;
    var ethAmount = 10**18;
    var expectedDgd = (ethAmount * counterConversionRate / 10**18) / (10**18 / 10**tokenDecimals[1]);
    var destAddress = "0x001adbc838ede392b5b054a47f8b8c28f2fa9f3c";

    return network.trade(ethAddress,
                         ethAmount,
                         dgdAddress,
                         destAddress,
                         new BigNumber(2).pow(255),
                         0x6eccddb2eeb8000,
                         true,{value:10**18}).then(function(){

       return tokenInstance[1].balanceOf(destAddress);
    }).then(function(result){
      assert.equal(result.valueOf(), expectedDgd.valueOf(), "unexpected dgd balance");
    });
  });



  it("print addresses", function() {
    console.log("\ntokens");
    for( var i = 0 ; i < tokenSymbol.length ; i++ ) {
      console.log(tokenSymbol[i] + " : " + tokenInstance[i].address );
    }
    console.log("\nexchanges");
    for( var i = 0 ; i < exchanges.length ; i++ ) {
      console.log( exchanges[i] + " : " + exchangesInstance[i].address );
    }
    console.log("\nbank : " + bank.address );
    console.log("reserve : " + reserve.address );
    console.log("network : " + network.address );
    console.log("wrapper : " + wrapper.address );
  });
});
