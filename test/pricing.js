var Pricing = artifacts.require("./Pricing.sol");
var TestToken = artifacts.require("./mockContracts/TestToken.sol");

var Helper = require("./helper.js");
var BigNumber = require('bignumber.js');

//global variables
var token;
var minimalRecordResolution = 2; //low resolution so I don't lose too much data. then easier to compare calculated imbalance values.
var maxPerBlockImbalance = 4000;
var maxTotalImbalance = maxPerBlockImbalance * 12;
var imbalanceInst;
var admin;
var priceUpdateBlock;
var currentBlock = 3000;

contract('Pricing', function(accounts) {
    
});
