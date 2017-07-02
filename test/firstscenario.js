var TestToken = artifacts.require("./TestToken.sol");
var Reserve = artifacts.require("./KyberReserve.sol");
var Network = artifacts.require("./KyberNetwork.sol");
var BigNumber = require('bignumber.js');

var token;
var tokenAddress;
var tokenOwner;

var network;
var networkOwner;

var reserve;
var reserveOwner;

var ethAddress = new BigNumber("0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee");

var conversionRate = (((new BigNumber(10)).pow(18)).mul(2));

contract('Scenario One', function(accounts) {

  beforeEach(function(done){
    done();
  });
  afterEach(function(done){
    done();
  });

  
  it("create token", function() {
    tokenOwner = accounts[0];
    return TestToken.new({from:tokenOwner}).then(function(instance){
        token = instance;
        tokenAddress = token.address;  
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
  
  it("list test token vs ETH in reserve", function() {
    return reserve.setRate([tokenAddress],
                           [ethAddress],
                           [conversionRate],
                           [10000000],
                           true, {from:reserveOwner}).then(function(instance){
    });
  });

  it("send ETH to reserve", function() {
    return reserve.depositEther({from:reserveOwner, value:10000}).then(function(instance){
  
    });
  });
  
  it("add reserve to network", function() {
    return network.addReserve(reserve.address, true, {from:networkOwner}).then(function(instance){
  
    });
  });
  
  it("list pair to network", function() {
    return network.listPairForReserve(reserve.address, tokenAddress, ethAddress, true, {from:networkOwner}).then(function(instance){
    });
  });

  it("do trade", function() {
    return token.approve(network.address, 2000, {from:tokenOwner, gas:4000000}).then(function(result){
        return network.trade( tokenAddress, 2000, ethAddress, tokenOwner, 0xFFFFFFFF, conversionRate, false);
    }).then(function(result){
        return token.balanceOf(reserve.address);
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
