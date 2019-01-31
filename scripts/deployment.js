const TestToken = artifacts.require("./TestToken.sol");
const Reserve = artifacts.require("./KyberReserve.sol");
const Network = artifacts.require("./KyberNetwork.sol");
const NetworkProxy = artifacts.require("./KyberNetworkProxy.sol");
const ConversionRates = artifacts.require("./ConversionRates.sol");
const Bank   = artifacts.require("./MockCentralBank.sol");
const Whitelist  = artifacts.require("./WhiteList.sol");
const FeeBurner = artifacts.require("./FeeBurner.sol");
const ExpectedRate = artifacts.require("./ExpectedRate.sol");
const Wrapper   = artifacts.require("./Wrapper.sol");
const CentralizedExchange = artifacts.require("./MockExchange.sol");
const BigNumber = require('bignumber.js');

var tokenSymbol = [];//["OMG", "DGD", "CVC", "FUN", "MCO", "GNT", "ADX", "PAY",
                   //"BAT", "KNC", "EOS", "LINK"];
var tokenName = [];//[ "OmiseGO", "Digix", "Civic", "FunFair", "Monaco", "Golem",
//"Adex", "TenX", "BasicAttention", "KyberNetwork", "Eos", "ChainLink" ];

var internalUseTokens = []
var listedTokens = []

var tokenDecimals = [];//[18,9,8,8,8,18,4,18,18,18,18,18]

var tokenInitialReserveBalance = [];

var reserveInitialEth;

var tokenInstance = [];
var kncInstance;
var kgtInstance;
const kgtName = "Kyber genesis token";
const kgtSymbol = "KGT";
const kgtDec = 0;


var conversionRate = (((new BigNumber(10)).pow(18)).mul(2));
var counterConversionRate = (((new BigNumber(10)).pow(18)).div(2));

const expBlock = 10**10;
const validBlockDuration = 256;
const maxGas = 4612388;
const precisionUnits = new BigNumber(10 ** 18);
var tokenOwner;

var networkProxy;
var networkProxyOwner;

var network;
var networkOwner;

var reserve;
var reserveOwner;

var ethAddress = new BigNumber("0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee");

var exchanges = [];// ["Bittrex", "Liqui", "Huobi", "Binance", "Bitfinex"];
var exchangesInstance = [];
var exchangeDepositAddresses = [];
var supportedTokens = {}

var bank;
var wrapper;

var whitelist;
var conversionRates;
var feeBurner;
var expectedRate;

var nam;// = "0xc6bc2f7b73da733366985f5f5b485262b45a77a3";
var victor_1;// = "0x760d30979eb313a2d23c53e4fb55986183b0ffd9";
var victor_2;// = "0xEDd15B61505180B3A0C25B193dF27eF10214D851";
var victor_3;// = "0x13922f1857c0677f79e4bbb16ad2c49faa620829";
var duc;// = "0x25B8b1F2c21A70B294231C007e834Ad2de04f51F";


var outputFileName;

////////////////////////////////////////////////////////////////////////////////

var getNetwork = function(){
  var id = web3.version.network;
  if(id >= 1500000000000){
    return "testrpc";
  } else if(id == 5777) {
    return "ganache";
  } else if( id == 17 || id == 4447) {
    return "dev";
  } else if( id == 42 ) {
    return "kovan";
  } else if( id == 3 ) {
    return "ropsten";
  } else {
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

    internalUseTokens = jsonInput["internal use tokens"]
    listedTokens = jsonInput["listed tokens"]

    // exchanges
    var exchangeInfo = jsonInput["exchanges"];
    exchangeInfo.forEach(function(exchange) {
      exchanges.push(exchange);
    });
    supportedTokens = jsonInput["supported_tokens"];

    // special addresses
    var specialAddresses = jsonInput["special addresses"];
    victor_1 = specialAddresses["victor_1"];
    victor_2 = specialAddresses["victor_2"];
    victor_3 = specialAddresses["victor_3"];
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


      //deploy all tokens from json
      return inputs.reduce(function (promise, item) {
       return promise.then(function () {
           var symbol = tokenSymbol[item];
           var name = tokenName[item];
           var decimals = tokenDecimals[item];
           return TestToken.new(name, symbol, decimals, {from:owner});
       }).then(function(instance){
           if( tokenSymbol[item] === "KNC" ) {
             console.log("found knc");
             kncInstance = instance;
           }
           tokenInstance.push(instance);
       })
      }, Promise.resolve()).then(function(){
          return TestToken.new(kgtName, kgtSymbol, kgtDec).then(function (instance) {
            kgtInstance = instance;
          }).then(function(){
            fulfill(true);
          });
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

var getBlockNumberWithPromise = function( ) {
    return new Promise(function(fulfill, reject){
            web3.eth.getBlockNumber(function(error, result){
            if( error ) {
                return reject(error);
            }
            else {
                return fulfill(result);
            }
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
                return addDepositAddressToExchange(instance, owner, item);
            });
        }, Promise.resolve()).then(function(){
            fulfill(true);
        }).catch(function(err){
            reject(err);
        });
    });
};

/////////////////////////////////////////////////////////////////


var addDepositAddressToExchange = function( exchange, owner, exchangeName ) {
    return new Promise(function (fulfill, reject){

        var tokens = [];
        var depositAddresses = {}; //dict (JS object) of deposit address per token for this exchange

        //create array of tokens
        for (var i = 0 ; i < tokenInstance.length ; i++ ) {
            if (supportedTokens[exchangeName].indexOf(tokenSymbol[i].toLowerCase()) >= 0) {
              tokens.push(i);
            }
        }

        return tokens.reduce(function (promise, item) {
            return promise.then(function () {
                return exchange.addMockDepositAddress( tokenInstance[item].address, {from:owner});
            }).then(function(){
                return exchange.tokenDepositAddresses(tokenInstance[item].address)
            }).then (function (mockDepositAddress){
                depositAddresses[tokenSymbol[item]] = mockDepositAddress;
                return reserve.approveWithdrawAddress(tokenInstance[item].address, mockDepositAddress, true);
            });
        }, Promise.resolve()).then(function(){
            return exchange.addMockDepositAddress(ethAddress, {from:owner});
        }).then(function(){
            return exchange.tokenDepositAddresses(ethAddress);
        }).then(function(depositAddress) {
            depositAddresses["ETH"] = depositAddress;
            exchangeDepositAddresses.push(depositAddresses);
	          return reserve.approveWithdrawAddress(ethAddress, depositAddress, true);
        }).then(function(){
            fulfill(true);
        }).catch(function(err){
          reject(err);
        });
    });
};

////////////////////////////////////////////////////////////////////////////////

var approveIntermediateAccount = function( addr ) {
  return new Promise(function (fulfill, reject){

      var tokens = [];

      //create array of tokens
      for (var i = 0 ; i < tokenInstance.length ; i++ ) {
          tokens.push(i);
      }

      return tokens.reduce(function (promise, item) {
          return promise.then(function () {
              return reserve.approveWithdrawAddress(tokenInstance[item].address, addr, true);
          });
      }, Promise.resolve()).then(function(){
          return reserve.approveWithdrawAddress(ethAddress, addr, true);
      }).then(function(){
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
          return conversionRates.addToken( tokenAddress );
      }).then(function(){
        return item.decimals();
      }).then(function(decimals){
          return conversionRates.setTokenControlInfo( tokenAddress,
                                              10**(decimals-2),
                                              (10 ** decimals) * 50000,
                                              (10 ** decimals) * 1000000 );
      }).then(function(){
          return conversionRates.enableTokenTrade( tokenAddress );
      }).then(function(){
          var x = [0];
          var y = [0];
          return conversionRates.setQtyStepFunction(tokenAddress,
                                            x,
                                            y,
                                            x,
                                            y );
      }).then(function(){
        var x = [0];
        var y = [0];
        return conversionRates.setImbalanceStepFunction(tokenAddress,
                                          x,
                                          y,
                                          x,
                                          y );
      }).then(function(){
        return conversionRates.setBaseRate( [tokenAddress],
                                     [convRate],
                                     [rate],
                                     [0/*,2,3,4,5,6,7,8,9,10,11,12,13,14*/],
                                     [0/*,2,3,4,5,6,7,8,9,10,11,12,13,14*/],
                                     web3.eth.blockNumber,
                                     [0] );
      }).then(function(){
        return network.listPairForReserve(reserve.address,
                                          tokenAddress,
                                          true,
                                          true,
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
    if( networkId == "kovan" || networkId == "testrpc" || networkId == "dev" || networkId == "ropsten" || networkId == "ganache" ) {
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
    this.timeout(31000000);
    tokenOwner = accounts[0];
    return deployTokens(tokenOwner);
  });

  it("create bank and transfer funds", function() {
    this.timeout(31000000);
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

  it("create whitelist", function() {
    this.timeout(31000000);
    return Whitelist.new(accounts[0], kgtInstance.address).then(function(instance){
        whitelist = instance;
        return whitelist.addOperator(accounts[0]);
    }).then(function(){
        return whitelist.setCategoryCap(0,5000);
    }).then(function(){
        return whitelist.setCategoryCap(1,0);
    }).then(function(){
        return whitelist.setCategoryCap(2,1000);
    }).then(function(){
        return whitelist.setUserCategory("0x9f1a678b0079773b5c4f5aa8573132d2b8bcb1e7",1);
    }).then(function(){
        //transfer kgt to this user to it will be treated as category 2.
        kgtInstance.transfer("0x089bAa07Eb9097031bABC99DBa4222D85521883E", 1);
    }).then(function(){
        return whitelist.setSgdToEthRate((new BigNumber(10).pow(15)).mul(2));
    });
  });

  it("create network", function() {
    this.timeout(31000000);
    networkOwner = accounts[0];
    networkOperator = accounts[0];
    return Network.new(networkOwner,{gas:maxGas}).then(function(instance){
        network = instance;
    });
  });

  it("create network proxy", function() {
    this.timeout(31000000);
    networkProxyOwner = accounts[0];
    return NetworkProxy.new(networkProxyOwner,{gas:maxGas}).then(function(instance){
      networkProxy = instance;
    });
  });

  it("create conversionRates", function() {
    this.timeout(31000000);
    return ConversionRates.new(accounts[0],{gas:maxGas}).then(function(instance){
        conversionRates = instance;
        return conversionRates.addOperator(accounts[0],{from:accounts[0]});
    });
  });

  it("create reserve and deposit tokens", function() {
    this.timeout(30000000);
    reserveOwner = accounts[0];
    return Reserve.new(network.address, conversionRates.address, reserveOwner,{gas:maxGas}).then(function(instance){
        reserve = instance;
    }).then(function(){
        return conversionRates.setValidRateDurationInBlocks(new BigNumber(1000000));
    }).then(function(){
        return conversionRates.setReserveAddress(reserve.address);
    }).then(function(){
        return depositTokensToReserve( tokenOwner, reserve );
    }).then(function(){
      if( getNetwork() == "dev" ) {
        console.log("depositing " + reserveInitialEth.toString() + " ether to reserve");
        var amount = new BigNumber(reserveInitialEth).mul(10**18);
        return sendEtherWithPromise(accounts[0],reserve.address,amount);
      }
      else if( getNetwork() == "testrpc" ) {
        var initAmount = 5;
        console.log("depositing " + initAmount.toString() + " ether to reserve");
        var amount = new BigNumber(initAmount).mul(10**18);
        return sendEtherWithPromise(accounts[0],reserve.address,amount);
      }

    });
  });

  it("create exchanges", function() {
    this.timeout(31000000);
    return createExchanges( tokenOwner, bank.address );
  });

  it ("approve intermediate account", function() {
    this.timeout(31000000);
    return approveIntermediateAccount(victor_3);
  });

  it("withdraw ETH from exchange", function() {
    this.timeout(31000000);
    return exchangesInstance[0].withdraw(ethAddress,1,accounts[0],{from:tokenOwner});
  });

  it("withdraw token from exchange", function() {
    this.timeout(31000000);
    var depositAddress = exchangeDepositAddresses[0][tokenSymbol[0]];
    return exchangesInstance[1].withdraw(tokenInstance[0].address,2,depositAddress,{from:tokenOwner}).then(function(){
      return tokenInstance[0].balanceOf(depositAddress);
    }).then(function(result){
      assert.equal(result.valueOf(), new BigNumber(2).valueOf(), "unexpected balance");
    });
  });

  it("withdraw token from exchange to exchange and clear funds", function() {
    this.timeout(31000000);
    var depositAddress = exchangeDepositAddresses[0][tokenSymbol[0]];
    return exchangesInstance[0].clearBalances([tokenInstance[0].address, ethAddress],[1,0]).then(function(){
        return tokenInstance[0].balanceOf(depositAddress);
    }).then(function(result){
      assert.equal(result.valueOf(), new BigNumber(1).valueOf(), "unexpected balance");
    });
  });

  it("create burning fees", function() {
    this.timeout(31000000);
    initialKncRate = precisionUnits.mul(431);
    return FeeBurner.new(accounts[0],kncInstance.address, network.address, initialKncRate).then(function(instance){
        feeBurner = instance;
        return feeBurner.addOperator(accounts[0],{from:accounts[0]});
    }).then(function(result){
      return kncInstance.approve(feeBurner.address, new BigNumber(10**18).mul(10000),{from:accounts[0]});
    }).then(function(){
      // set fees for reserve
      // 0.25% from accounts
      return feeBurner.setReserveData(reserve.address,25, accounts[0]);
    }).then(function(){
      return feeBurner.setWalletFees(0,50);
    }).then(function(){
      return feeBurner.setTaxInBps(2000);
    })/*.then(function(){
      return feeBurner.setTaxWallet(0); // zero address will revert
    })*/;
  });

  it("create expected rate", function() {
    this.timeout(31000000);
    return ExpectedRate.new(network.address, kncInstance.address, accounts[0]).then(function(instance){
        expectedRate = instance;
    }).then(function(){
        return expectedRate.addOperator(accounts[0]);
    }).then(function(){
        return expectedRate.setWorstCaseRateFactor(500);
    });
  });

  it("set network proxy params", function() {
    this.timeout(31000000);
    // set contracts and enable network
    return networkProxy.setKyberNetworkContract(network.address);
  });

  it("set network params", function() {
    this.timeout(31000000);
    // set contracts and enable network

    return network.setWhiteList(whitelist.address).then(function(){
        return network.setExpectedRate(expectedRate.address);
    }).then(function(){
        return network.setFeeBurner(feeBurner.address);
    }).then(function(){
        return network.setKyberProxy(networkProxy.address);
    }).then(function(){
        return network.setParams(50*10**9, 15); //50 gwei, 15 negligible diff
    }).then( function() {
        return network.setEnable(true);
    }).then( function() {
        return network.addOperator(networkOperator);
    });
  });

  it("add reserve to network", function() {
    this.timeout(31000000);
    return network.addReserve(reserve.address, true, {from:networkOwner});
  });

  it("list tokens", function() {
    this.timeout(30000000);
    return listTokens( tokenOwner, reserve, network, expBlock, conversionRate, counterConversionRate );
  });

  it("create wrapper", function() {
    this.timeout(31000000);
    var balance0;
    var balance1;
    var allowance0;
    var allowance1;
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
      return wrapper.getTokenAllowances(tokenOwner, networkProxy.address, [tokenInstance[0].address, tokenInstance[1].address]);
    }).then(function(result){
      allowance0 = result[0];
      allowance1 = result[1];
      return tokenInstance[0].allowance(tokenOwner, networkProxy.address);
    }).then(function(result){
      assert.equal(allowance0.valueOf(), result.valueOf(), "unexpected allowance 0");
      return tokenInstance[1].allowance(tokenOwner, networkProxy.address);
    }).then(function(result){
      assert.equal(allowance1.valueOf(), result.valueOf(), "unexpected allowance 1");
      //return wrapper.getRates( reserve.address, [tokenInstance[0].address,
      //                          tokenInstance[1].address], [ethAddress, ethAddress]);
    }).then(function(result){
      //console.log("===");
      //console.log(result);
      //console.log("===");
    });
  });

  it("add operator in conversionRates", function() {
    this.timeout(31000000);
    return conversionRates.addOperator(victor_1);
  });

  it("add operator in conversionRates", function() {
    this.timeout(31000000);
    return conversionRates.addOperator(victor_2);
  });

  it("add operator in expectedRate", function() {
    this.timeout(31000000);
    return expectedRate.addOperator(victor_1);
  });

  it("add operator in expectedRate", function() {
    this.timeout(31000000);
    return expectedRate.addOperator(victor_2);
  });

  it("add operator in reserve", function() {
    this.timeout(31000000);
    return reserve.addOperator(victor_1);
  });

  it("add operator in reserve", function() {
    this.timeout(31000000);
    return reserve.addOperator(victor_2);
  });

  it("transfer ownership in exchanges", function() {
    this.timeout(30000000);
    return transferOwnershipInExchangesAndBank(tokenOwner,nam).then(function(){
    return exchangesInstance[1].owners(nam[1]);
  }).then(function(result){
    assert.equal(result.valueOf(),true.valueOf(), "unexpected owner address");
  });
});


it("make some optimizations", function() {
  // send 1 twei to kyber network
  return tokenInstance[1].transfer(network.address,0).then(function(){
    // send 1 wei of knc to fee burner
    return tokenInstance[1].transfer("0x001adbc838ede392b5b054a47f8b8c28f2fa9f3c",1);
  }).then(function(){
    return kncInstance.transfer(feeBurner.address,1);
  }).then(function(){
    return tokenInstance[1].balanceOf(network.address);
  }).then(function(result){
    console.log("balance", result.valueOf());
  });
});


it("set eth to dgd rate", function() {
  return getBlockNumberWithPromise().then(function(blockNumber){
    return conversionRates.setBaseRate( [tokenInstance[1].address],
                                 [0x47d40a969bd7c0021],
                                 [conversionRate],
                                 [0],
                                 [0],
                                 blockNumber,
                                 [0] );
  });
});



  it("do a single exchange", function() {
    this.timeout(31000000);
    var dgdAddress = tokenInstance[1].address;
    var ethAmount = 1 * 10**16;
    var rate = 0x47d40a969bd7c0021;
    var expectedDgd = (ethAmount * rate / 10**18) / (10**18 / 10**tokenDecimals[1]);
    var destAddress = "0x001adbc838ede392b5b054a47f8b8c28f2fa9f3c";

    return networkProxy.trade(ethAddress,
                         ethAmount,
                         dgdAddress,
                         destAddress,
                         new BigNumber(2).pow(255),
                         rate,0,{value:ethAmount, gasPrice:49 * 10**9}).then(function(result){
       //for( var i = 0 ; i < result.receipt.logs.length ; i++ )
       //console.log(result.receipt.logs[i].data);


       return tokenInstance[1].balanceOf(destAddress);
    }).then(function(result){
      if( result.valueOf() > expectedDgd.valueOf() + 100 ) {
        assert.fail("unexpected dgd balance", result.valueOf(), expectedDgd.valueOf() );
      }
      if( result.valueOf() < expectedDgd.valueOf() - 100 ) {
        assert.fail("unexpected dgd balance", result.valueOf(), expectedDgd.valueOf() );
      }
    }).then(function(){
      return tokenInstance[1].balanceOf(network.address);
    }).then(function(result){
      console.log("balance 2", result.valueOf());
    });
  });

  it("do converse exchange", function() {
    this.timeout(31000000);
    var tokenInd = 1;
    var dgdAddress = tokenInstance[tokenInd].address;
    var dgdAmount = 7**tokenDecimals[tokenInd];//zelda
    var rate = conversionRate;
    var destAddress = "0x001adbc838ede392b5b054a47f8b8c28f2fa9f3c";

    return tokenInstance[tokenInd].approve(networkProxy.address,dgdAmount).then(function(){
    return networkProxy.trade(dgdAddress,
                           dgdAmount,
                           ethAddress,
                           destAddress,
                           new BigNumber(2).pow(255),
                           rate,0,{value:0, gasPrice:49* 10**9});
    }).then(function(result){
      for( var i = 0 ; i < result.receipt.logs.length ; i++ ) {
        console.log(result.receipt.logs[i].data);
      }
    });
  });

  it("check time duration block", function() {
    this.timeout(31000000);
    return conversionRates.validRateDurationInBlocks().then(function(result){
      assert.equal(result.valueOf(), 1000000, "unexpected valid rate duration block");
    });
  });

  it("print addresses", function() {
    tokensDict = {};
    console.log("\ntokens");
    tokensDict["ETH"] = {"address" : "0x" + ethAddress.toString(16),
                         "name" : "Ethereum",
                         "decimals" : 18,
                         "internal use": true,
                         "listed": true};
    for( var i = 0 ; i < tokenSymbol.length ; i++ ) {
      //console.log(tokenSymbol[i] + " : " + tokenInstance[i].address );
      var symbol = tokenSymbol[i].toLowerCase();
      tokenDict = {
        "address" : tokenInstance[i].address,
        "name" : tokenName[i],
        "decimals" : tokenDecimals[i],
        "internal use": internalUseTokens.indexOf(symbol) >= 0,
        "listed": listedTokens.indexOf(symbol) >= 0
      };
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
    dict["pricing"] = conversionRates.address;
    dict["network"] = networkProxy.address;
    dict["internal network"] = network.address;
    dict["wrapper"] = wrapper.address;
    dict["feeburner"] = feeBurner.address;
    dict["KGT address"] = kgtInstance.address;
    dict["third_party_reserves"] = [];

    var json = JSON.stringify(dict, null, 2);

    console.log(json);

    // writefilesync.js
    var fs = require('fs');
    fs.writeFileSync(outputFileName, json);

    console.log("json file is saved in " + outputFileName);
  });

  it("reduce valid block duration to: " + validBlockDuration, function() {
    this.timeout(31000000);
    return conversionRates.setValidRateDurationInBlocks(validBlockDuration);
  });
});
