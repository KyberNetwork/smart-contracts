var TestToken = artifacts.require("./TestToken.sol");
var Reserve = artifacts.require("./KyberReserve.sol");
var Network = artifacts.require("./KyberNetwork.sol");
var Wallet = artifacts.require("./KyberWallet.sol");
var Bank   = artifacts.require("./MockCenteralBank.sol");
var CenteralizedExchange = artifacts.require("./MockExchangeDepositAddress.sol");
var BigNumber = require('bignumber.js');

var wallet;

var token0;
var tokenAddress0;
var token1;
var tokenAddress1;
var token02;
var tokenAddress2;

var tokenOwner;

var network;
var networkOwner;

var reserve;
var reserveOwner;

var ethAddress = new BigNumber("0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee");

var conversionRate0 = (((new BigNumber(10)).pow(18)).mul(2));
var counterConversionRate0 = (((new BigNumber(10)).pow(18)).div(2));

var conversionRate1 = (((new BigNumber(10)).pow(18)).mul(4));
var counterConversionRate1 = (((new BigNumber(10)).pow(18)).div(4));

var conversionRate2 = (((new BigNumber(10)).pow(18)).mul(8));
var counterConversionRate2 = (((new BigNumber(10)).pow(18)).div(8));

var expBlock0 = 10**10;
var expBlock1 = 10**11;
var expBlock2 = 10**12;


var bittrex;
var polo;
var bank;

contract('Scenario One', function(accounts) {

  beforeEach(function(done){
    done();
  });
  afterEach(function(done){
    done();
  });

  
  it("create token 0", function() {
    tokenOwner = accounts[0];
    return TestToken.new("Test 0", "TST0",{from:tokenOwner}).then(function(instance){
        token0 = instance;
        tokenAddress0 = token0.address;  
    });
  });

  it("create token 1", function() {
    tokenOwner = accounts[0];
    return TestToken.new("Test 1", "TST1",{from:tokenOwner}).then(function(instance){
        token1 = instance;
        tokenAddress1 = token1.address;
    });
  });

  it("create token 2", function() {
    tokenOwner = accounts[0];
    return TestToken.new("Test 2", "TST2",{from:tokenOwner}).then(function(instance){
        token2 = instance;
        tokenAddress2 = token2.address;
    });
  });


  it("create bank and transfer funds", function() {
    var amount = (new BigNumber(10)).pow(40);  
    return Bank.new().then(function(instance){
        bank = instance;
        return token0.transfer(bank.address, amount);
    }).then(function(){
        return token1.transfer(bank.address, amount);    
    }).then(function(){
        return token2.transfer(bank.address, amount);    
    }).then(function(){
        return bank.depositEther({value: (new BigNumber(10)).pow(18)});
    });
  });


  it("create POLO exchange", function() {
    return CenteralizedExchange.new("POLO",bank.address).then(function(instance){
        polo = instance;  
    });
  });

  it("create Bittrex exchange", function() {
    return CenteralizedExchange.new("Bittrex",bank.address).then(function(instance){
        bittrex = instance;  
    });
  });


  it("create network", function() {
    networkOwner = accounts[0];
    return Network.new(networkOwner).then(function(instance){
        network = instance;  
    });
  });

  it("create reserve", function() {
    reserveOwner = accounts[0];
    return Reserve.new(network.address, reserveOwner).then(function(instance){
        reserve = instance;  
    });
  });

  it("deposit test tokens", function() {
    var amount = (new BigNumber(10)).pow(24);
    return token0.approve(reserve.address,amount,{from:reserveOwner}).then(function(){
        return reserve.depositToken(tokenAddress0, amount, {from:reserveOwner});        
    }).then(function(){
        return token1.approve(reserve.address,amount,{from:reserveOwner});
    }).then(function(){
        return reserve.depositToken(tokenAddress1, amount, {from:reserveOwner});
    }).then(function(){
        return token2.approve(reserve.address,amount,{from:reserveOwner});
    }).then(function(){
        return reserve.depositToken(tokenAddress2, amount, {from:reserveOwner});
    });
  });
  
  it("list test token0 vs ETH in reserve", function() {
    return reserve.setRate([tokenAddress0],
                           [ethAddress],
                           [conversionRate0],
                           [expBlock0],
                           true, {from:reserveOwner}).then(function(instance){
    });
  });

  it("list ETH vs test token in reserve", function() {
    return reserve.setRate([ethAddress],
                           [tokenAddress0],
                           [counterConversionRate0],
                           [expBlock0],
                           true, {from:reserveOwner}).then(function(instance){
    });
  });

  it("list test token1 vs ETH in reserve", function() {
    return reserve.setRate([tokenAddress1],
                           [ethAddress],
                           [conversionRate1],
                           [expBlock1],
                           true, {from:reserveOwner}).then(function(instance){
    });
  });

  it("list ETH vs test token in reserve", function() {
    return reserve.setRate([ethAddress],
                           [tokenAddress1],
                           [counterConversionRate1],
                           [expBlock1],
                           true, {from:reserveOwner}).then(function(instance){
    });
  });

  it("list test token2 vs ETH in reserve", function() {
    return reserve.setRate([tokenAddress2],
                           [ethAddress],
                           [conversionRate2],
                           [expBlock2],
                           true, {from:reserveOwner}).then(function(instance){
    });
  });

  it("list ETH vs test token2 in reserve", function() {
    return reserve.setRate([ethAddress],
                           [tokenAddress2],
                           [counterConversionRate2],
                           [expBlock2],
                           true, {from:reserveOwner}).then(function(instance){
    });
  });



  it("send ETH to reserve", function() {
    return reserve.depositEther({from:reserveOwner, value:100000}).then(function(instance){
  
    });
  });
  
  it("add reserve to network", function() {
    return network.addReserve(reserve.address, true, {from:networkOwner}).then(function(instance){
  
    });
  });
  
  it("list pair 0 to network", function() {
    return network.listPairForReserve(reserve.address, tokenAddress0, ethAddress, true, {from:networkOwner}).then(function(instance){
    });
  });

  it("list pair 1 to network", function() {
    return network.listPairForReserve(reserve.address, tokenAddress1, ethAddress, true, {from:networkOwner}).then(function(instance){
    });
  });

  it("list pair 2 to network", function() {
    return network.listPairForReserve(reserve.address, tokenAddress2, ethAddress, true, {from:networkOwner}).then(function(instance){
    });
  });


  it("list revesre pair 0 to network", function() {
    return network.listPairForReserve(reserve.address, ethAddress, tokenAddress0, true, {from:networkOwner}).then(function(instance){
    });
  });

  it("list revesre pair 1 to network", function() {
    return network.listPairForReserve(reserve.address, ethAddress, tokenAddress1, true, {from:networkOwner}).then(function(instance){
    });
  });

  it("list revesre pair 2 to network", function() {
    return network.listPairForReserve(reserve.address, ethAddress, tokenAddress2, true, {from:networkOwner}).then(function(instance){
    });
  });


  it("do trade token 0", function() {
    return token0.approve(network.address, 2000, {from:tokenOwner, gas:4000000}).then(function(result){
        return network.trade( tokenAddress0, 2000, ethAddress, tokenOwner, 0xFFFFFFFF, conversionRate0, false);
    }).then(function(result){
        return token0.balanceOf(reserve.address);
    }).then(function(result){
        console.log(result.toString(10));
        return reserve.getBalance(ethAddress);
    }).then(function(result){
        console.log(result.toString(10));
        return network.getBalance(ethAddress);
    }).then(function(result){
        console.log(result.toString(10));    
    });
  });
  
  it("do revese trade token 0", function() {
    return network.trade( ethAddress, 1001, tokenAddress0, tokenOwner, 0xFFFFFFFF, counterConversionRate0, false,{value:1001}).then(function(result){
    }).then(function(result){
        return token0.balanceOf(reserve.address);
    }).then(function(result){
        console.log(result.toString(10));
        return reserve.getBalance(ethAddress);
    }).then(function(result){
        console.log(result.toString(10));
        return network.getBalance(ethAddress);
    }).then(function(result){
        console.log(result.toString(10));    
    });
  });


  it("do trade token 1", function() {
    return token1.approve(network.address, 2000, {from:tokenOwner, gas:4000000}).then(function(result){
        return network.trade( tokenAddress1, 2000, ethAddress, tokenOwner, 0xFFFFFFFF, conversionRate1, false);
    }).then(function(result){
        //assert.equal(true,false,"mg");
        return token1.balanceOf(reserve.address);
    }).then(function(result){
        console.log(result.toString(10));
        return reserve.getBalance(ethAddress);
    }).then(function(result){
        console.log(result.toString(10));
        return network.getBalance(ethAddress);
    }).then(function(result){
        console.log(result.toString(10));    
    });
  });
  
  it("do revese trade token 1", function() {
    return network.trade( ethAddress, 1001, tokenAddress1, tokenOwner, 0xFFFFFFFF, counterConversionRate1, false,{value:1001}).then(function(result){
    }).then(function(result){
        return token1.balanceOf(reserve.address);
    }).then(function(result){
        console.log(result.toString(10));
        return reserve.getBalance(ethAddress);
    }).then(function(result){
        console.log(result.toString(10));
        return network.getBalance(ethAddress);
    }).then(function(result){
        console.log(result.toString(10));    
    });
  });

  it("do trade token 2", function() {
    return token2.approve(network.address, 2000, {from:tokenOwner, gas:4000000}).then(function(result){
        return network.trade( tokenAddress2, 2000, ethAddress, tokenOwner, 0xFFFFFFFF, conversionRate2, false);
    }).then(function(result){
        //assert.equal(true,false,"mg");
        return token2.balanceOf(reserve.address);
    }).then(function(result){
        console.log(result.toString(10));
        return reserve.getBalance(ethAddress);
    }).then(function(result){
        console.log(result.toString(10));
        return network.getBalance(ethAddress);
    }).then(function(result){
        console.log(result.toString(10));    
    });
  });
  
  it("do revese trade token 2", function() {
    return network.trade( ethAddress, 1001, tokenAddress2, tokenOwner, 0xFFFFFFFF, counterConversionRate2, false,{value:1001}).then(function(result){
    }).then(function(result){
        return token2.balanceOf(reserve.address);
    }).then(function(result){
        console.log(result.toString(10));
        return reserve.getBalance(ethAddress);
    }).then(function(result){
        console.log(result.toString(10));
        return network.getBalance(ethAddress);
    }).then(function(result){
        console.log(result.toString(10));    
    });
  });

  it("get rate info", function() {
    var rate;
    var expBlock;
    var balance;
  
    return network.getRate( tokenAddress0, ethAddress, 0 ).then(function(result){
        rate = result[0];
        expBlock = result[1];
        balance = result[2];
        assert.equal(conversionRate0.toString(10), rate.toString(10), "conversion rate 0 is not as expected");
        
        return network.getRate( tokenAddress1, ethAddress, 0 );
    }).then(function(result){
        rate = result[0];
        assert.equal(conversionRate1.toString(10), rate.toString(10), "conversion rate 1 is not as expected");
        return network.getRate( tokenAddress2, ethAddress, 0 );                
    }).then(function(result){
        rate = result[0];
        assert.equal(conversionRate2.toString(10), rate.toString(10), "conversion rate 2 is not as expected");
        return network.getRate( ethAddress, tokenAddress0, 0 );                
    }).then(function(result){
        rate = result[0];
        assert.equal(counterConversionRate0.toString(10), rate.toString(10), "counter conversion rate 0 is not as expected");
        return network.getRate( ethAddress, tokenAddress1, 0 );                
    }).then(function(result){
        rate = result[0];
        assert.equal(counterConversionRate1.toString(10), rate.toString(10), "counter conversion rate 1 is not as expected");
        return network.getRate( ethAddress, tokenAddress2, 0 );                
    }).then(function(result){
        rate = result[0];
        assert.equal(counterConversionRate2.toString(10), rate.toString(10), "counter conversion rate 1 is not as expected");                
    });
    
   });
/*
   it("make kyber wallet", function() {
     return Wallet.new( network.address, {from:accounts[4]}).then(function(result){
        wallet = result;
        // deposit ether
        return wallet.recieveEther({value: 100000});                 
     });
   });
    
   it("basic trade ETH=>token0 with transfer", function() {
     return wallet.convertAndCall( ethAddress, 10000,
                                   tokenAddress0, 100000000000000,
                                   counterConversionRate0,
                                   wallet.address, // send to self
                                   "", // empty data
                                   false, // do actual transfer
                                   false // throw on fail
                                   , {from:accounts[4]}).then(function(result){
        // get balance
        return token0.balanceOf(wallet.address);
     }).then(function(balance){
        assert.equal(balance.toString(10), "5000", "unexpected balance");
     });
   });

   it("trade ETH=>token1 with approve", function() {
     abi = [{"constant":true,"inputs":[],"name":"ETH_TOKEN_ADDRESS","outputs":[{"name":"","type":"address"}],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"srcToken","type":"address"},{"name":"srcAmount","type":"uint256"},{"name":"destToken","type":"address"},{"name":"maxDestAmount","type":"uint256"},{"name":"minRate","type":"uint256"},{"name":"destination","type":"address"},{"name":"destinationData","type":"bytes"},{"name":"onlyApproveTokens","type":"bool"},{"name":"throwOnFail","type":"bool"}],"name":"convertAndCall","outputs":[],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"network","type":"address"}],"name":"setKyberNetwork","outputs":[],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"token","type":"address"},{"name":"from","type":"address"},{"name":"amount","type":"uint256"}],"name":"recieveTokens","outputs":[],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"owner","outputs":[{"name":"","type":"address"}],"payable":false,"type":"function"},{"constant":false,"inputs":[],"name":"recieveEther","outputs":[],"payable":true,"type":"function"},{"constant":true,"inputs":[],"name":"kyberNetwork","outputs":[{"name":"","type":"address"}],"payable":false,"type":"function"},{"inputs":[{"name":"_kyberNetwork","type":"address"}],"payable":false,"type":"constructor"},{"payable":true,"type":"fallback"},{"anonymous":false,"inputs":[{"indexed":true,"name":"origin","type":"address"},{"indexed":false,"name":"error","type":"uint256"},{"indexed":false,"name":"errorInfo","type":"uint256"}],"name":"ErrorReport","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"owner","type":"address"},{"indexed":false,"name":"kyberNetwork","type":"address"}],"name":"NewWallet","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"sender","type":"address"},{"indexed":false,"name":"network","type":"address"}],"name":"SetKyberNetwork","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"name":"sender","type":"address"},{"indexed":false,"name":"amountInWei","type":"uint256"}],"name":"IncomingEther","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"name":"from","type":"address"},{"indexed":false,"name":"token","type":"address"},{"indexed":false,"name":"amount","type":"uint256"}],"name":"IncomingTokens","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"sender","type":"address"},{"indexed":false,"name":"destination","type":"address"},{"indexed":false,"name":"destAmount","type":"uint256"}],"name":"ConvertAndCall","type":"event"}];
     var Web3 = require('web3');
     var web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:8545"));
     var contractClass = web3.eth.contract(abi);
     var contractInstance = contractClass.at( wallet.address );
     var data = contractInstance.recieveTokens.getData( tokenAddress1, wallet.address, 2500);
     //console.log(data);               

     return wallet.convertAndCall( ethAddress, 10000,
                                   tokenAddress1, 100000000000000,
                                   counterConversionRate1,
                                   wallet.address, // send to self
                                   data,
                                   true, // do approve
                                   false // throw on fail
                                   , {from:accounts[4]}).then(function(result){
        return token1.allowance(wallet.address, wallet.address);         
     }).then(function(balance){                                   
        assert.equal(balance.toString(10), "0", "unexpected allowance");
        return token1.balanceOf(wallet.address);         
     }).then(function(balance){
        assert.equal(balance.toString(10), "2500", "unexpected balance");
     });
   });


   it("trade token1=>ETH", function() {
     abi = [{"constant":true,"inputs":[],"name":"ETH_TOKEN_ADDRESS","outputs":[{"name":"","type":"address"}],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"srcToken","type":"address"},{"name":"srcAmount","type":"uint256"},{"name":"destToken","type":"address"},{"name":"maxDestAmount","type":"uint256"},{"name":"minRate","type":"uint256"},{"name":"destination","type":"address"},{"name":"destinationData","type":"bytes"},{"name":"onlyApproveTokens","type":"bool"},{"name":"throwOnFail","type":"bool"}],"name":"convertAndCall","outputs":[],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"network","type":"address"}],"name":"setKyberNetwork","outputs":[],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"token","type":"address"},{"name":"from","type":"address"},{"name":"amount","type":"uint256"}],"name":"recieveTokens","outputs":[],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"owner","outputs":[{"name":"","type":"address"}],"payable":false,"type":"function"},{"constant":false,"inputs":[],"name":"recieveEther","outputs":[],"payable":true,"type":"function"},{"constant":true,"inputs":[],"name":"kyberNetwork","outputs":[{"name":"","type":"address"}],"payable":false,"type":"function"},{"inputs":[{"name":"_kyberNetwork","type":"address"}],"payable":false,"type":"constructor"},{"payable":true,"type":"fallback"},{"anonymous":false,"inputs":[{"indexed":true,"name":"origin","type":"address"},{"indexed":false,"name":"error","type":"uint256"},{"indexed":false,"name":"errorInfo","type":"uint256"}],"name":"ErrorReport","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"owner","type":"address"},{"indexed":false,"name":"kyberNetwork","type":"address"}],"name":"NewWallet","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"sender","type":"address"},{"indexed":false,"name":"network","type":"address"}],"name":"SetKyberNetwork","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"name":"sender","type":"address"},{"indexed":false,"name":"amountInWei","type":"uint256"}],"name":"IncomingEther","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"name":"from","type":"address"},{"indexed":false,"name":"token","type":"address"},{"indexed":false,"name":"amount","type":"uint256"}],"name":"IncomingTokens","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"sender","type":"address"},{"indexed":false,"name":"destination","type":"address"},{"indexed":false,"name":"destAmount","type":"uint256"}],"name":"ConvertAndCall","type":"event"}];
     var Web3 = require('web3');
     var web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:8545"));
     var contractClass = web3.eth.contract(abi);
     var contractInstance = contractClass.at( wallet.address );
     var data = contractInstance.recieveEther.getData();
     //console.log(data);               

     return wallet.convertAndCall( tokenAddress1, 2500,
                                   ethAddress, 100000000000000,
                                   conversionRate1,
                                   wallet.address, // send to self
                                   data,
                                   true, // do approve - but not relevant
                                   false // throw on fail
                                   , {from:accounts[4]}).then(function(result){
        });
   });

*/

  it("withdraw tokens", function() {
    var amount = (new BigNumber(10)).pow(4);
    return reserve.withdraw(token0.address, amount, polo.address);
  });

  it("withdraw ether", function() {
    var amount = (new BigNumber(10)).pow(1);
    return reserve.withdraw(ethAddress, amount, bittrex.address);
  });

  it("transfer eth from exchange", function() {
    var amount = (new BigNumber(10)).pow(1);
    return bittrex.withdraw(ethAddress, amount, reserve.address);
  });

  it("transfer token from exchange", function() {
    var amount = (new BigNumber(10)).pow(1);
    return polo.withdraw(token0.address, amount, reserve.address);
  });



   it("print address", function() {
      console.log("token0 = " + token0.address.toString(16));
      console.log("token1 = " + token1.address.toString(16));      
      console.log("token2 = " + token2.address.toString(16));
      console.log("bank = " + bank.address.toString(16));
      console.log("polo = " + polo.address.toString(16));
      console.log("bittrex = " + bittrex.address.toString(16));      
      console.log("reserve = " + reserve.address.toString(16));
      console.log("network = " + network.address.toString(16));
      
      console.log("reserve owner = " + accounts[0].toString(16));      
            
   });


  
});
