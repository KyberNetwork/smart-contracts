var ConversionRates = artifacts.require("./ConversionRates.sol");
var TestToken = artifacts.require("./mockContracts/TestToken.sol");
var Reserve = artifacts.require("./KyberReserve.sol");
var Network = artifacts.require("./KyberNetwork.sol");
var WhiteList = artifacts.require("./WhiteList.sol");
var ExpectedRate = artifacts.require("./ExpectedRate.sol");
var FeeBurner = artifacts.require("./FeeBurner.sol");

var Helper = require("./helper.js");
var BigNumber = require('bignumber.js');


var ethAddress = '0x00eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
var bps = 10000;
var minSlippageBps = 400;
var quantityFactor = 3;
var expectedRates;

//permission groups
var admin;
var operator;
var alerter;
var sanityRates;
var network

//tokens data
////////////
var numTokens = 3;
var tokens = [];
var tokenAdd = [];

contract('ExpectedRates', function(accounts) {
    it("should init kyber network and all its components.", async function () {
        var gasPrice = (new BigNumber(10).pow(9).mul(50));
        var precisionUnits = (new BigNumber(10).pow(18));

        //block data
        var priceUpdateBlock;
        var currentBlock;
        var validRateDurationInBlocks = 1000;

        // imbalance data
        var minimalRecordResolution = 2; //low resolution so I don't lose too much data. then easier to compare calculated imbalance values.
        var maxPerBlockImbalance = 4000;
        var maxTotalImbalance = maxPerBlockImbalance * 12;

        //base buy and sell rates (prices)
        var baseBuyRate1 = [];
        var baseSellRate1 = [];

        //quantity buy steps
        var qtyBuyStepX = [-1400, -700, -150, 0, 150, 350, 700,  1400];
        var qtyBuyStepY = [ 1000,   75,   25, 0,  0, -50, -160, -3000];

        //imbalance buy steps
        var imbalanceBuyStepX = [-8500, -2800, -1500, 0, 1500, 2800,  4500];
        var imbalanceBuyStepY = [ 1300,   130,    43, 0,   0, -110, -1600];

        //sell price will be 1 / buy (assuming no spread) so sell is actually buy price in other direction
        var qtySellStepX = [-1400, -700, -150, 0, 150, 350, 700, 1400];
        var qtySellStepY = [ 1000,   75,   25, 0,  0, -50, -160, -3000];

        //sell imbalance step
        var imbalanceSellStepX = [-8500, -2800, -1500, 0, 1500, 2800,  4500];
        var imbalanceSellStepY = [ 1300,   130,    43, 0,   0, -110, -1600];

        //compact data.
        var sells = [];
        var buys = [];
        var indices = [];
        var compactBuyArr = [];
        var compactSellArr = [];

        // set account addresses
        admin = accounts[0];
        operator = accounts[1];
        alerter = accounts[2];

        currentBlock = priceUpdateBlock = await Helper.getCurrentBlock();

        //init contracts
        pricing1 = await ConversionRates.new(admin, {});

        //set pricing general parameters
        await pricing1.setValidRateDurationInBlocks(validRateDurationInBlocks);

        //create and add token addresses...
        for (var i = 0; i < numTokens; ++i) {
            token = await TestToken.new("test" + i, "tst" + i, 18);
            tokens[i] = token;
            tokenAdd[i] = token.address;
            await pricing1.addToken(token.address);
            await pricing1.setTokenControlInfo(token.address, minimalRecordResolution, maxPerBlockImbalance, maxTotalImbalance);
            await pricing1.enableTokenTrade(token.address);
        }

        assert.equal(tokens.length, numTokens, "bad number tokens");

        var result = await pricing1.addOperator(operator);

        //buy is ether to token rate. sale is token to ether rate. so sell == 1 / buy. assuming we have no spread.
        var tokensPerEther;
        var ethersPerToken;

        for (i = 0; i < numTokens; ++i) {
            tokensPerEther = (new BigNumber(precisionUnits.mul((i + 1) * 3)).floor());
            ethersPerToken = (new BigNumber(precisionUnits.div((i + 1) * 3)).floor());
            baseBuyRate1.push(tokensPerEther.valueOf());
            baseSellRate1.push(ethersPerToken.valueOf());
        }

        assert.equal(baseBuyRate1.length, tokens.length);
        assert.equal(baseSellRate1.length, tokens.length);
        buys.length = sells.length = indices.length = 0;

        await pricing1.setBaseRate(tokenAdd, baseBuyRate1, baseSellRate1, buys, sells, currentBlock, indices, {from: operator});

        //set compact data
        compactBuyArr = [0, 0, 0, 0, 0, 06, 07, 08, 09, 10, 11, 12, 13, 14];
        var compactBuyHex = Helper.bytesToHex(compactBuyArr);
        buys.push(compactBuyHex);

        compactSellArr = [0, 0, 0, 0, 0, 26, 27, 28, 29, 30, 31, 32, 33, 34];
        var compactSellHex = Helper.bytesToHex(compactSellArr);
        sells.push(compactSellHex);

        indices[0] = 0;

        assert.equal(indices.length, sells.length, "bad sells array size");
        assert.equal(indices.length, buys.length, "bad buys array size");

        await pricing1.setCompactData(buys, sells, currentBlock, indices, {from: operator});

        //all start with same step functions.
        for (var i = 0; i < numTokens; ++i) {
            await pricing1.setQtyStepFunction(tokenAdd[i], qtyBuyStepX, qtyBuyStepY, qtySellStepX, qtySellStepY, {from:operator});
            await pricing1.setImbalanceStepFunction(tokenAdd[i], imbalanceBuyStepX, imbalanceBuyStepY, imbalanceSellStepX, imbalanceSellStepY, {from:operator});
        }

        network = await Network.new(admin, {});
        reserve1 = await Reserve.new(network.address, pricing1.address, admin);
        await pricing1.setReserveAddress(reserve1.address);
        await reserve1.addAlerter(alerter);

        //set reserve balance. 10000 wei ether + per token 1000 wei ether value according to base rate.
        var reserveEtherInit = 5000 * 2;
        await Helper.sendEtherWithPromise(accounts[8], reserve1.address, reserveEtherInit);

        var balance = await Helper.getBalancePromise(reserve1.address);
        expectedReserve1BalanceWei = balance.valueOf();
        assert.equal(balance.valueOf(), reserveEtherInit, "wrong ether balance");

        //transfer tokens to reserve. each token same wei balance
        for (var i = 0; i < numTokens; ++i) {
            token = tokens[i];
            var amount1 = (new BigNumber(reserveEtherInit)).div(precisionUnits).mul(baseBuyRate1[i]).floor();
            await token.transfer(reserve1.address, amount1.valueOf());
            var balance = await token.balanceOf(reserve1.address);
            assert.equal(amount1.valueOf(), balance.valueOf());
        }

        // add reserves
        await network.addReserve(reserve1.address, true);

        //set contracts
        feeBurner = await FeeBurner.new(admin, tokenAdd[0]);
        feeBurner.setKyberNetwork(network.address);
        whiteList = await WhiteList.new(admin);
        await whiteList.addOperator(operator);
        await whiteList.setCategoryCap(0, 1000, {from:operator});
        await whiteList.setSgdToEthRate(30000, {from:operator});

        expectedRates = await ExpectedRate.new(network.address, admin);
        await network.setParams(whiteList.address, expectedRates.address, feeBurner.address, gasPrice.valueOf(), 15);
        var price = await network.maxGasPrice();
        assert.equal(price.valueOf(), gasPrice.valueOf());

        //list tokens per reserve
        for (var i = 0; i < numTokens; i++) {
            await network.listPairForReserve(reserve1.address, ethAddress, tokenAdd[i], true);
            await network.listPairForReserve(reserve1.address, tokenAdd[i], ethAddress, true);
        }
    });

    it("should init expected rates.", async function () {
        await expectedRates.addOperator(operator);
        await expectedRates.setMinSlippageFactor(minSlippageBps, {from: operator});
    });

    it("should test eth to token. use qty slippage.", async function() {
        var tokenInd = 2;
        var qty = 9;
        quantityFactor = 10;

        await expectedRates.setQuantityFactor(quantityFactor, {from: operator});
        var myExpectedRate = await network.findBestRate(ethAddress, tokenAdd[tokenInd], qty);
        var qtySlippageRate = await network.findBestRate(ethAddress, tokenAdd[tokenInd], (qty * quantityFactor));

        var minSlippage =  ((10000 - minSlippageBps) * myExpectedRate[1].valueOf()) / 10000;

        qtySlippageRate = qtySlippageRate[1].valueOf() * 1;
        if (qtySlippageRate > minSlippage) {
            qtySlippageRate = minSlippage;
            assert(false, "expect qty slippage rate to be lower");
        }

        rates = await expectedRates.getExpectedRate(ethAddress, tokenAdd[tokenInd], qty);

        assert.equal(rates[0].valueOf(), myExpectedRate[1].valueOf(), "unexpected rate");
        assert.equal(rates[1].valueOf(), qtySlippageRate, "unexpected rate");
    });

    it("should test eth to token. use min slippage.", async function() {
        var tokenInd = 2;
        var qty = 9;
        quantityFactor = 5;

        await expectedRates.setQuantityFactor(quantityFactor, {from: operator});
        var myExpectedRate = await network.findBestRate(ethAddress, tokenAdd[tokenInd], qty);
        var qtySlippageRate = await network.findBestRate(ethAddress, tokenAdd[tokenInd], (qty * quantityFactor));

        var minSlippage =  ((10000 - minSlippageBps) * myExpectedRate[1].valueOf()) / 10000;

        qtySlippageRate = qtySlippageRate[1].valueOf() * 1;
        if (qtySlippageRate > minSlippage) {
            qtySlippageRate = minSlippage;
        } else {
            assert(false, "expect min slippage rate to be lower");
        }

        rates = await expectedRates.getExpectedRate(ethAddress, tokenAdd[tokenInd], qty);

        assert.equal(rates[0].valueOf(), myExpectedRate[1].valueOf(), "unexpected rate");
        assert.equal(rates[1].valueOf(), qtySlippageRate, "unexpected rate");
    });

    it("should test token to eth. use slippage.", async function() {
        var tokenInd = 2;
        var qty = 300;

        var myExpectedRate = await network.findBestRate(tokenAdd[tokenInd], ethAddress, qty);
        var qtySlippageRate = await network.findBestRate(tokenAdd[tokenInd], ethAddress, (qty * quantityFactor));

        var minSlippage = new BigNumber(10000 - minSlippageBps).mul(myExpectedRate[1]).div(10000).floor();

        qtySlippageRate = qtySlippageRate[1].valueOf() * 1;
        if (qtySlippageRate > minSlippage) {
            qtySlippageRate = minSlippage;
            assert(false, "expect qty slippage rate to be lower");
        }

        rates = await expectedRates.getExpectedRate(tokenAdd[tokenInd], ethAddress, qty);

        assert.equal(rates[0].valueOf(), myExpectedRate[1].valueOf(), "unexpected rate");
        assert.equal(rates[1].valueOf(), qtySlippageRate.valueOf(), "unexpected rate");

    });

    it("should test token to eth. use min quantity.", async function() {
        var tokenInd = 2;
        var qty = 110;
        quantityFactor = 2;

        await expectedRates.setQuantityFactor(quantityFactor, {from: operator});
        var myExpectedRate = await network.findBestRate(tokenAdd[tokenInd], ethAddress, qty);
        var qtySlippageRate = await network.findBestRate(tokenAdd[tokenInd], ethAddress, (qty * quantityFactor));

        var minSlippage = new BigNumber(10000 - minSlippageBps).mul(myExpectedRate[1]).div(10000).floor();

        qtySlippageRate = qtySlippageRate[1].valueOf() * 1;
        if (qtySlippageRate > minSlippage) {
            qtySlippageRate = minSlippage;
        } else {
            assert(false, "expect min slippage rate to be lower");
        }

        rates = await expectedRates.getExpectedRate(tokenAdd[tokenInd], ethAddress, qty);

        assert.equal(rates[0].valueOf(), myExpectedRate[1].valueOf(), "unexpected rate");
        assert.equal(rates[1].valueOf(), qtySlippageRate.valueOf(), "unexpected rate");
    });
 });
