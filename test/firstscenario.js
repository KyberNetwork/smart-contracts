var TestToken = artifacts.require("./TestToken.sol");
var Reserve = artifacts.require("./KyberReserve.sol");
var Network = artifacts.require("./KyberNetwork.sol");
var BigNumber = require('bignumber.js');

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
    var amount = (new BigNumber(10)).pow(40);
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

  
});
