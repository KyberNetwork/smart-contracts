//var ConvertLib = artifacts.require("./ConvertLib.sol");
//var MetaCoin = artifacts.require("./MetaCoin.sol");

var TestToken = artifacts.require("./TestToken.sol");
var Reserve = artifacts.require("./KyberReserve.sol");
var Network = artifacts.require("./KyberNetwork.sol");
var BigNumber = require('bignumber.js');


var owner = 0x6d87462cb31c1217cf1ed61b4fcc37f823c61624;
var token;
var network;
var reserve;

var ethAddress = new BigNumber("0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee");
var conversionRate = (((new BigNumber(10)).pow(18)).mul(2));

module.exports = function(deployer) {
    owner = new BigNumber("0x61c52da71bfef53b2b2f8e1b7e06ee4dd93559c3");
    deployer.then(function(){
        return TestToken.new();
    }).then(function(tokenInstance){
        token = tokenInstance;
        return Network.new(owner);            
    }).then(function(networkInstance){
        network= networkInstance;
        return Reserve.new(network.address, owner); 
    }).then(function(reserveInstance){
        reserve = reserveInstance;
        //list test token vs ETH in reserve
        return reserve.setRate([token.address],
                                [ethAddress],
                                [conversionRate],
                                [10000000],
                                true );
    }).then(function(){
        // send ether to reserve
        return reserve.depositEther({value:10000});        
    }).then(function(){
        // add reserve to network
        return network.addReserve(reserve.address, true);    
    }).then(function(){
        return network.listPairForReserve(reserve.address, token.address, ethAddress, true);    
    });

  
};