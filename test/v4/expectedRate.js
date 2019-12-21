const ConversionRates = artifacts.require("ConversionRates.sol");
const EnhancedStepFunctions = artifacts.require("./EnhancedStepFunctions.sol");
const TestToken = artifacts.require("mockContracts/TestToken.sol");
const Reserve = artifacts.require("KyberReserve.sol");
const MaliciousReserve = artifacts.require("MaliciousReserve.sol");
const Network = artifacts.require("KyberNetwork.sol");
const MockNetwork = artifacts.require("MockKyberNetwork.sol");
const WhiteList = artifacts.require("WhiteList.sol");
const ExpectedRate = artifacts.require("ExpectedRate.sol");
const FeeBurner = artifacts.require("FeeBurner.sol");
const MockUtils = artifacts.require("MockUtils.sol");

const Helper = require("./helper.js");
const BN = web3.utils.BN;


const ethAddress = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
const zeroAddress = '0x0000000000000000000000000000000000000000';
const precisionUnits = (new BN(10).pow(new BN(18)));
const ethToKncRatePrecision = precisionUnits.mul(new BN(550));
const gasPrice = (new BN(10).pow(new BN(9)).mul(new BN(50)));

const bps = 10000;
let minSlippageBps = 400;
let quantityFactor = 2;
let expectedRates;

//permission groups
let admin;
let operator;
let alerter;
let sanityRates;
let networkProxy;
let network;

//tokens data
////////////
let numTokens = 3;
let tokens = [];
let tokenAdd = [];

// imbalance data
let minimalRecordResolution = 2; //low resolution so I don't lose too much data. then easier to compare calculated imbalance values.
let maxPerBlockImbalance = 4000;
let maxTotalImbalance = maxPerBlockImbalance * 12;

let MAX_RATE;
let kncAddress;

contract('ExpectedRate', function(accounts) {
    before("init globals", async function() {
        const knc = await TestToken.new("kyber network crystal", "KNC", 18);
        kncAddress = knc.address;

        // set account addresses
        admin = accounts[0];
        operator = accounts[1];
        alerter = accounts[2];

    })

    it("should init kyber network and all its components.", async function () {
        //block data
        let priceUpdateBlock;
        let currentBlock;
        let validRateDurationInBlocks = 1000;

        //base buy and sell rates (prices)
        let baseBuyRate1 = [];
        let baseSellRate1 = [];

        //quantity buy steps
        let qtyBuyStepX = [0, 150, 350, 700,  1400];
        let qtyBuyStepY = [0,  0, -50, -160, -3000];

        //imbalance buy steps
        let imbalanceBuyStepX = [-8500, -2800, -1000, 0, 1000, 2800,  4500];
        let imbalanceBuyStepY = [ 2000,   1600,    200, 0,   0, -500, -1600];
        let imbalanceBuyStepYNew = [ 2000,   1600,    200, 0,   0, -500, -1600, -2000];

        //sell price will be 1 / buy (assuming no spread) so sell is actually buy price in other direction
        let qtySellStepX = [ 0, 150, 350, 700, 1400];
        let qtySellStepY = [ 0,  0, -50, -160, -3000];

        //sell imbalance step
        let imbalanceSellStepX = [-8500, -2800, -750, 0, 750, 2800,  4500];
        let imbalanceSellStepY = [ -2000,   -1600,    -400, 0,   0, -1600, -2000];
        let imbalanceSellStepYNew = [ -2000,   -1600,    -400, 0,   0, -1600, -2000, -3000];

        //compact data.
        let sells = [];
        let buys = [];
        let indices = [];
        let compactBuyArr = [];
        let compactSellArr = [];

        currentBlock = priceUpdateBlock = await Helper.getCurrentBlock();

        //init contracts
        pricing1 = await ConversionRates.new(admin);
        pricing2 = await EnhancedStepFunctions.new(admin);

        //set pricing general parameters
        await pricing1.setValidRateDurationInBlocks(validRateDurationInBlocks);
        await pricing2.setValidRateDurationInBlocks(validRateDurationInBlocks);

        //create and add token addresses...
        for (let i = 0; i < numTokens; ++i) {
            token = await TestToken.new("test" + i, "tst" + i, 18);
            tokens[i] = token;
            tokenAdd[i] = token.address;
            await pricing1.addToken(token.address);
            await pricing1.setTokenControlInfo(token.address, minimalRecordResolution, maxPerBlockImbalance, maxTotalImbalance);
            await pricing1.enableTokenTrade(token.address);
            await pricing2.addToken(token.address);
            await pricing2.setTokenControlInfo(token.address, minimalRecordResolution, maxPerBlockImbalance, maxTotalImbalance);
            await pricing2.enableTokenTrade(token.address);
        }

        assert.equal(tokens.length, numTokens, "bad number tokens");

        let result = await pricing1.addOperator(operator);
        await pricing2.addOperator(operator);

        //buy is ether to token rate. sale is token to ether rate. so sell == 1 / buy. assuming we have no spread.
        let tokensPerEther;
        let ethersPerToken;

        for (i = 0; i < numTokens; ++i) {
            tokensPerEther = (new BN(precisionUnits.mul(new BN((i + 1) * 3))));
            ethersPerToken = (new BN(precisionUnits.div(new BN((i + 1) * 3))));
            baseBuyRate1.push(tokensPerEther);
            baseSellRate1.push(ethersPerToken);
        }

        assert.equal(baseBuyRate1.length, tokens.length);
        assert.equal(baseSellRate1.length, tokens.length);
        buys.length = sells.length = indices.length = 0;

        await pricing1.setBaseRate(tokenAdd, baseBuyRate1, baseSellRate1, buys, sells, currentBlock, indices, {from: operator});
        await pricing2.setBaseRate(tokenAdd, baseBuyRate1, baseSellRate1, buys, sells, currentBlock, indices, {from: operator});

        //set compact data
        compactBuyArr = [0, 0, 0, 0, 0, 06, 07, 08, 09, 10, 11, 12, 13, 14];
        let compactBuyHex = Helper.bytesToHex(compactBuyArr);
        buys.push(compactBuyHex);

        compactSellArr = [0, 0, 0, 0, 0, 26, 27, 28, 29, 30, 31, 32, 33, 34];
        let compactSellHex = Helper.bytesToHex(compactSellArr);
        sells.push(compactSellHex);

        indices[0] = 0;

        assert.equal(indices.length, sells.length, "bad sells array size");
        assert.equal(indices.length, buys.length, "bad buys array size");

        await pricing1.setCompactData(buys, sells, currentBlock, indices, {from: operator});
        await pricing2.setCompactData(buys, sells, currentBlock, indices, {from: operator});

        //all start with same step functions.
        for (let i = 0; i < numTokens; ++i) {
            await pricing1.setQtyStepFunction(tokenAdd[i], qtyBuyStepX, qtyBuyStepY, qtySellStepX, qtySellStepY, {from:operator});
            await pricing1.setImbalanceStepFunction(tokenAdd[i], imbalanceBuyStepX, imbalanceBuyStepY, imbalanceSellStepX, imbalanceSellStepY, {from:operator});
            await pricing2.setImbalanceStepFunction(tokenAdd[i], imbalanceBuyStepX, imbalanceBuyStepYNew, imbalanceSellStepX, imbalanceSellStepYNew, {from:operator});
        }

        network = await Network.new(admin);
        await network.addOperator(operator);
        reserve1 = await Reserve.new(network.address, pricing1.address, admin);
        reserve2 = await Reserve.new(network.address, pricing2.address, admin);
        await pricing1.setReserveAddress(reserve1.address);
        await pricing2.setReserveAddress(reserve2.address);
        await reserve1.addAlerter(alerter);
        await reserve2.addAlerter(alerter);
        for (i = 0; i < numTokens; ++i) {
            await reserve1.approveWithdrawAddress(tokenAdd[i],accounts[0],true);
            await reserve2.approveWithdrawAddress(tokenAdd[i],accounts[0],true);
        }

        //set reserve balance. 10000 wei ether + per token 1000 wei ether value according to base rate.
        let reserveEtherInit = 5000 * 2;
        await Helper.sendEtherWithPromise(accounts[8], reserve1.address, reserveEtherInit);
        await Helper.sendEtherWithPromise(accounts[8], reserve2.address, reserveEtherInit);

        let balance = await Helper.getBalancePromise(reserve1.address);
        expectedReserve1BalanceWei = balance;
        Helper.assertEqual(balance, reserveEtherInit, "wrong ether balance");
        balance = await Helper.getBalancePromise(reserve2.address);
        Helper.assertEqual(balance, reserveEtherInit, "wrong ether balance");

        //transfer tokens to reserve. each token same wei balance
        for (let i = 0; i < numTokens; ++i) {
            token = tokens[i];
            let amount1 = (new BN(reserveEtherInit)).mul(new BN(baseBuyRate1[i])).div(precisionUnits);
            await token.transfer(reserve1.address, amount1);
            let balance = await token.balanceOf(reserve1.address);
            Helper.assertEqual(amount1, balance);
            await token.transfer(reserve2.address, amount1);
            balance = await token.balanceOf(reserve2.address);
            Helper.assertEqual(amount1, balance);
        }

        // add reserves
        await network.addReserve(reserve1.address, false, {from: operator});

        //set contracts
        feeBurner = await FeeBurner.new(admin, tokenAdd[0], network.address, ethToKncRatePrecision);
        let kgtToken = await TestToken.new("kyber genesis token", "KGT", 0);
        whiteList = await WhiteList.new(admin, kgtToken.address);
        await whiteList.addOperator(operator);
        await whiteList.setCategoryCap(0, 1000, {from:operator});
        await whiteList.setSgdToEthRate(30000, {from:operator});

        expectedRates = await ExpectedRate.new(network.address, kncAddress, admin);
        await expectedRates.addOperator(operator);

        await network.setWhiteList(whiteList.address);
        await network.setExpectedRate(expectedRates.address);
        await network.setFeeBurner(feeBurner.address);
        networkProxy = accounts[9];
        await network.setKyberProxy(networkProxy);
        await network.setParams(gasPrice, 15);
        await network.setEnable(true);
        let price = await network.maxGasPrice();
        Helper.assertEqual(price, gasPrice);

        //list tokens per reserve
        for (let i = 0; i < numTokens; i++) {
            await network.listPairForReserve(reserve1.address, tokenAdd[i], true, true, true, {from: operator});
        }

        let mockUtils = await MockUtils.new();
        MAX_RATE = await mockUtils.getMaxRate();
    });

    it("should init expected rate.", async function () {
        await expectedRates.setWorstCaseRateFactor(minSlippageBps, {from: operator});
    });

    it("should test can't init expected rate with empty contracts (address 0).", async function () {
        let expectedRateT;

        try {
            expectedRateT =  await ExpectedRate.new(network.address, kncAddress, zeroAddress);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            expectedRateT =  await ExpectedRate.new(zeroAddress, kncAddress, admin);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        expectedRateT =  await ExpectedRate.new(network.address, kncAddress, admin);
    });

    it("should test eth to token. use qty slippage.", async function() {
        let tokenInd = 2;
        let qty = 9;
        quantityFactor = 10;

        await expectedRates.setQuantityFactor(quantityFactor, {from: operator});
        let myExpectedRate = await network.findBestRate(ethAddress, tokenAdd[tokenInd], qty);
        let qtySlippageRate = await network.findBestRate(ethAddress, tokenAdd[tokenInd], (qty * quantityFactor));

        let minSlippage =  (myExpectedRate[1].mul(new BN(10000 - minSlippageBps))).div(new BN(10000));

        qtySlippageRate = qtySlippageRate[1];

        if (qtySlippageRate.gt(minSlippage)) {
            qtySlippageRate = minSlippage;
            assert(false, "expect qty slippage rate to be lower");
        }

        rates = await expectedRates.getExpectedRate(ethAddress, tokenAdd[tokenInd], qty, false);

        Helper.assertEqual(rates[0], myExpectedRate[1], "unexpected rate");
        Helper.assertEqual(rates[1], qtySlippageRate, "unexpected rate");
    });

    it("should test eth to token. use min slippage.", async function() {
        let tokenInd = 2;
        let qty = 9;
        quantityFactor = 5;

        await expectedRates.setQuantityFactor(quantityFactor, {from: operator});
        let myExpectedRate = await network.findBestRate(ethAddress, tokenAdd[tokenInd], qty);
        let qtySlippageRate = await network.findBestRate(ethAddress, tokenAdd[tokenInd], (qty * quantityFactor));

        let minSlippage =  (myExpectedRate[1].mul(new BN(10000 - minSlippageBps))).div(new BN(10000));

        qtySlippageRate = qtySlippageRate[1];
        if (qtySlippageRate.gt(minSlippage)) {
            qtySlippageRate = minSlippage;
        } else {
            assert(false, "expect min slippage rate to be lower");
        }

        rates = await expectedRates.getExpectedRate(ethAddress, tokenAdd[tokenInd], qty, false);

        Helper.assertEqual(rates[0], myExpectedRate[1], "unexpected rate");
        Helper.assertEqual(rates[1], qtySlippageRate, "unexpected rate");
    });

    it("should test token to eth. use qty slippage.", async function() {
        let tokenInd = 2;
        let qty = 300;

        let myExpectedRate = await network.findBestRate(tokenAdd[tokenInd], ethAddress, qty);
        let qtySlippageRate = await network.findBestRate(tokenAdd[tokenInd], ethAddress, (qty * quantityFactor));

        let minSlippage = new BN(10000 - minSlippageBps).mul(myExpectedRate[1]).div(new BN(10000));

        qtySlippageRate = qtySlippageRate[1];

        if (qtySlippageRate.gt(minSlippage)) {
            qtySlippageRate = minSlippage;
            assert(false, "expect qty slippage rate to be lower");
        }

        rates = await expectedRates.getExpectedRate(tokenAdd[tokenInd], ethAddress, qty, false);

        Helper.assertEqual(rates[0], myExpectedRate[1], "unexpected rate");
        Helper.assertEqual(rates[1], qtySlippageRate, "unexpected rate");
    });

    it("should test token to eth. use min quantity.", async function() {
        let tokenInd = 2;
        let qty = 110;
        quantityFactor = 2;

        await expectedRates.setQuantityFactor(quantityFactor, {from: operator});
        let myExpectedRate = await network.findBestRate(tokenAdd[tokenInd], ethAddress, qty);
        let qtySlippageRate = await network.findBestRate(tokenAdd[tokenInd], ethAddress, (qty * quantityFactor));

        let minSlippage = new BN(10000 - minSlippageBps).mul(myExpectedRate[1]).div(new BN(10000));

        qtySlippageRate = qtySlippageRate[1];
        if (qtySlippageRate.gt(minSlippage)) {
            qtySlippageRate = minSlippage;
        } else {
            assert(false, "expect min slippage rate to be lower");
        }

        rates = await expectedRates.getExpectedRate(tokenAdd[tokenInd], ethAddress, qty, false);

        Helper.assertEqual(rates[0], myExpectedRate[1], "unexpected rate");
        Helper.assertEqual(rates[1], qtySlippageRate, "unexpected rate");
    });

    it("should verify get expected rate reverted when quantity factor is 0.", async function() {
        let qty = 100;
        rates = await expectedRates.getExpectedRate(tokenAdd[1], ethAddress, qty, false);

        await expectedRates.setQuantityFactor(0, {from: operator});

        try {
            rates = await expectedRates.getExpectedRate(tokenAdd[1], ethAddress, qty, false);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        await expectedRates.setQuantityFactor(2, {from: operator});
        rates = await expectedRates.getExpectedRate(tokenAdd[1], ethAddress, qty, false);
    });

    it("should verify set quantity factor reverts when > 100.", async function() {
        let legalFactor = 100;
        let illegalFactor = 101;

        await expectedRates.setQuantityFactor(legalFactor, {from: operator});
        let rxFactor = await expectedRates.quantityFactor();

        Helper.assertEqual(rxFactor, legalFactor);

        try {
            await expectedRates.setQuantityFactor(illegalFactor, {from: operator});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        rxFactor = await expectedRates.quantityFactor();
        Helper.assertEqual(rxFactor, legalFactor);
    });

    it("should verify set min slippage reverts when > 100 * 100.", async function() {
        let legalSlippage = 100 * 100;
        let illegalSlippage = 100 * 100 + 1 * 1;

        await expectedRates.setWorstCaseRateFactor(legalSlippage, {from: operator});
        let rxSlippage = await expectedRates.worstCaseRateFactorInBps();

        Helper.assertEqual(rxSlippage, legalSlippage);

        try {
            await expectedRates.setWorstCaseRateFactor(illegalSlippage, {from: operator});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        rxSlippage = await expectedRates.worstCaseRateFactorInBps();
        Helper.assertEqual(rxSlippage, legalSlippage);
    });

    it("should verify get expected rate reverts when qty > MAX QTY.", async function() {
        let legalQty = (new BN(10).pow(new BN(28)));
        let illegalQty = (new BN(10).pow(new BN(28))).add(new BN(1));
        let tokenInd = 1;

        //with quantity factor 1
        await expectedRates.setQuantityFactor(1, {from: operator});
        rates = await expectedRates.getExpectedRate(tokenAdd[tokenInd], ethAddress, legalQty, false);

        try {
            rates = await expectedRates.getExpectedRate(tokenAdd[tokenInd], ethAddress, illegalQty, false);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("should verify get expected rate reverts when qty * qtyFactor > MAX QTY.", async function() {
        let legalQty = (new BN(10).pow(new BN(28))).div(new BN(2));
        let illegalQty = (new BN(10).pow(new BN(28))).div(new BN(2)).add(new BN(1));
        let tokenInd = 1;

        //with quantity factor 2a
        await expectedRates.setQuantityFactor(2, {from: operator});
        rates = await expectedRates.getExpectedRate(tokenAdd[tokenInd], ethAddress, legalQty, false);

        illegalQty = legalQty.add(new BN(1));
        try {
            rates = await expectedRates.getExpectedRate(tokenAdd[tokenInd], ethAddress, illegalQty, false);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("should verify when qty 0, expected rate correct. expected isn't 0. slippage is 0", async function() {
        let tokenInd = 2;
        let qty = 0;
        quantityFactor = 2;

        await expectedRates.setWorstCaseRateFactor(minSlippageBps, {from: operator});

        rates = await expectedRates.getExpectedRate(tokenAdd[tokenInd], ethAddress, qty, false);
        let expectedRate = await network.searchBestRate(tokenAdd[tokenInd], ethAddress, qty, false);

        Helper.assertGreater(rates[0], 0, "unexpected rate");
        Helper.assertEqual(rates[0], expectedRate[1], "unexpected rate");
        Helper.assertEqual(rates[1], 0, "we expect slippage to be 0");
    });

    it("should verify when qty small, expected rate isn't 0. slippage is 0", async function() {
        let tokenInd = 2;
        let qty = 1;

        rates = await expectedRates.getExpectedRate(tokenAdd[tokenInd], ethAddress, qty, false);
        let expectedRate = await network.searchBestRate(tokenAdd[tokenInd], ethAddress, qty, false);
        Helper.assertEqual(rates[0], expectedRate[1], "unexpected rate");
        Helper.assertEqual(rates[1], 0, "unexpected rate");
    });

    it("test qty above max trade value, expected rate 0. slippage is 0", async function() {
        let tokenInd = 2;
        let qty = maxPerBlockImbalance;

        rates = await expectedRates.getExpectedRate(tokenAdd[tokenInd], ethAddress, qty, false);
        Helper.assertEqual(rates[0], 0)
        Helper.assertEqual(rates[1], 0)
    });

    it("test qty as max trade value, quantity factor 2 expected rate OK. slippage is 0", async function() {
        let tokenInd = 2;
        let qty = maxPerBlockImbalance - 1;

        rates = await expectedRates.getExpectedRate(tokenAdd[tokenInd], ethAddress, qty, false);
        Helper.assertGreater(rates[0], 0)
        Helper.assertEqual(rates[1], 0)
    });

    it("test qty as max trade value, quantity factor 1. expected rate OK. slippage little worse", async function() {
        let tokenInd = 2;
        let qty = maxPerBlockImbalance - 1;
        await expectedRates.setQuantityFactor(1, {from: operator});

        const myExpectedRate = await network.findBestRate(tokenAdd[tokenInd], ethAddress, qty);
        const slippage = (new BN(10000 - minSlippageBps).mul(new BN(myExpectedRate[1]))).div(new BN(10000));

        rates = await expectedRates.getExpectedRate(tokenAdd[tokenInd], ethAddress, qty, false);
        Helper.assertGreater(rates[0], 0)
        Helper.assertGreater(rates[1], 0)
        Helper.assertGreater(rates[0], rates[1])
        Helper.assertEqual(rates[0], myExpectedRate[1], "unexpected expected rate")

        Helper.assertEqual(rates[1], slippage, "unexpected slippage rate")
        await expectedRates.setQuantityFactor(quantityFactor, {from: operator});
    });

    it("should verify when qty 0, token to token rate as expected.", async function() {
        let tokenSrcInd = 2;
        let tokenDestInd = 1;
        let qty = 0;

        rates = await expectedRates.getExpectedRate(tokenAdd[tokenSrcInd], tokenAdd[tokenDestInd], qty, false);
        let srcToEthRate = await network.searchBestRate(tokenAdd[tokenSrcInd], ethAddress, qty, false);
        srcToEthRate = new BN(srcToEthRate[1]);
        let ethToDestRate = await network.searchBestRate(ethAddress, tokenAdd[tokenDestInd], qty, false);
        ethToDestRate = new BN(ethToDestRate[1]);

        Helper.assertGreater(rates[0], 0, "unexpected rate");
        Helper.assertEqual(rates[0], srcToEthRate.mul(ethToDestRate).div(precisionUnits), "unexpected rate");
        Helper.assertEqual(rates[1], 0, "unexpected rate");
    });

    it("should verify when src qty 0, findBestRate, findBestRateOnlyPermission and getExpectedRate don't revert", async function() {
        let tokenSrcInd = 2;
        let tokenDestInd = 1;
        let qty = 0;

        //create bad reserve that reverts for zero src qty rate queries
        let badReserve = await MaliciousReserve.new(network.address, pricing1.address, admin);

        //try to get rate with zero src qty, should revert
        try {
            await badReserve.getConversionRate(tokenAdd[tokenSrcInd],tokenAdd[tokenDestInd],qty,0);
            assert(false, "throw was expected in line above.")
        } catch(e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //add malicious reserve to network for ETH -> tokenDest
        await network.addReserve(badReserve.address, false, {from: operator});
        await network.listPairForReserve(badReserve.address, tokenAdd[tokenDestInd], true, true, true, {from: operator});
        
        //try to get rate
        rate = await network.findBestRate(tokenAdd[tokenSrcInd], tokenAdd[tokenDestInd], qty);
        Helper.assertEqual(rate[1], 0, "did not return zero rate");
        
        rate = await network.findBestRateOnlyPermission(tokenAdd[tokenSrcInd], tokenAdd[tokenDestInd], qty);
        Helper.assertEqual(rate[1], 0, "did not return zero rate");

        rate = await network.getExpectedRate(tokenAdd[tokenSrcInd], tokenAdd[tokenDestInd], qty);
        Helper.assertGreater(rate[0], 0, "unexpected rate");

        //unlist and remove bad reserve
        await network.listPairForReserve(badReserve.address, tokenAdd[tokenDestInd], true, true, false, {from: operator});    
    });

    it("should disable the first reserve and add the second one with new conversion rate", async function() {
        await reserve1.disableTrade({from: alerter});
        await network.addReserve(reserve2.address, false, {from: operator});

        //list tokens per reserve2
        for (let i = 0; i < numTokens; i++) {
            await network.listPairForReserve(reserve2.address, tokenAdd[i], true, true, true, {from: operator});
        }
    });

    it("step function enhancement: should test eth to token. use qty slippage.", async function() {
        let tokenInd = 2;
        let qty = 25;
        quantityFactor = 15;

        await expectedRates.setQuantityFactor(quantityFactor, {from: operator});
        let myExpectedRate = await network.findBestRate(ethAddress, tokenAdd[tokenInd], qty);
        let qtySlippageRate = await network.findBestRate(ethAddress, tokenAdd[tokenInd], (qty * quantityFactor));

        let minSlippage =  ((10000 - minSlippageBps) * myExpectedRate[1]) / 10000;

        qtySlippageRate = qtySlippageRate[1];

        if (qtySlippageRate > minSlippage) {
            qtySlippageRate = minSlippage;
            assert(false, "expect qty slippage rate to be lower");
        }

        rates = await expectedRates.getExpectedRate(ethAddress, tokenAdd[tokenInd], qty, true);

        Helper.assertEqual(rates[0], myExpectedRate[1], "unexpected rate");
        Helper.assertEqual(rates[1], qtySlippageRate, "unexpected rate");
    });

    it("step function enhancement: should test eth to token. use min slippage.", async function() {
        let tokenInd = 2;
        let qty = 60;
        quantityFactor = 5;

        await expectedRates.setQuantityFactor(quantityFactor, {from: operator});
        let myExpectedRate = await network.findBestRate(ethAddress, tokenAdd[tokenInd], qty);
        let qtySlippageRate = await network.findBestRate(ethAddress, tokenAdd[tokenInd], (qty * quantityFactor));

        let minSlippage =  myExpectedRate[1].mul(new BN((10000 - minSlippageBps))).div(new BN(10000));

        qtySlippageRate = qtySlippageRate[1];

        if (qtySlippageRate > minSlippage) {
            qtySlippageRate = minSlippage;
        } else {
            assert(false, "expect min slippage rate to be lower");
        }

        rates = await expectedRates.getExpectedRate(ethAddress, tokenAdd[tokenInd], qty, true);

        Helper.assertEqual(rates[0], myExpectedRate[1], "unexpected rate");
        Helper.assertEqual(rates[1], qtySlippageRate, "unexpected rate");
    });

    it("step function enhancement: should test token to eth. use qty slippage.", async function() {
        let tokenInd = 2;
        let qty = 700;

        let myExpectedRate = await network.findBestRate(tokenAdd[tokenInd], ethAddress, qty);
        let qtySlippageRate = await network.findBestRate(tokenAdd[tokenInd], ethAddress, (qty * quantityFactor));

        let minSlippage = new BN(10000 - minSlippageBps).mul(myExpectedRate[1]).div(new BN(10000));

        qtySlippageRate = qtySlippageRate[1];

        if (qtySlippageRate > minSlippage) {
            qtySlippageRate = minSlippage;
            assert(false, "expect qty slippage rate to be lower");
        }

        rates = await expectedRates.getExpectedRate(tokenAdd[tokenInd], ethAddress, qty, true);

        Helper.assertEqual(rates[0], myExpectedRate[1], "unexpected rate");
        Helper.assertEqual(rates[1], qtySlippageRate, "unexpected rate");
    });

    it("step function enhancement: should test token to eth. use min quantity.", async function() {
        let tokenInd = 2;
        let qty = 110;
        quantityFactor = 2;

        await expectedRates.setQuantityFactor(quantityFactor, {from: operator});
        let myExpectedRate = await network.findBestRate(tokenAdd[tokenInd], ethAddress, qty);
        let qtySlippageRate = await network.findBestRate(tokenAdd[tokenInd], ethAddress, (qty * quantityFactor));

        let minSlippage = new BN(10000 - minSlippageBps).mul(myExpectedRate[1]).div(new BN(10000));

        qtySlippageRate = qtySlippageRate[1];
        if (qtySlippageRate > minSlippage) {
            qtySlippageRate = minSlippage;
        } else {
            assert(false, "expect min slippage rate to be lower");
        }

        rates = await expectedRates.getExpectedRate(tokenAdd[tokenInd], ethAddress, qty, true);

        Helper.assertEqual(rates[0], myExpectedRate[1], "unexpected rate");
        Helper.assertEqual(rates[1], qtySlippageRate, "unexpected rate");
    });

    it("step function enhancement: should verify when qty 0, token to token rate as expected.", async function() {
        let tokenSrcInd = 2;
        let tokenDestInd = 1;
        let qty = 0;

        rates = await expectedRates.getExpectedRate(tokenAdd[tokenSrcInd], tokenAdd[tokenDestInd], qty, true);
        // if qty is 0, expected rate will set qty is 1
        let srcToEthRate = await network.searchBestRate(tokenAdd[tokenSrcInd], ethAddress, 1, true);
        srcToEthRate = new BN(srcToEthRate[1]);
        let ethToDestRate = await network.searchBestRate(ethAddress, tokenAdd[tokenDestInd], 1, true);
        ethToDestRate = new BN(ethToDestRate[1]);

        Helper.assertGreater(rates[0], 0, "unexpected rate");
        Helper.assertEqual(rates[0], srcToEthRate.mul(ethToDestRate).div(precisionUnits), "unexpected rate");
        Helper.assertEqual(rates[1], 0, "unexpected rate");
    });

    it("should verify when rate received from kyber network is > MAX_RATE, get expected rate return (0,0).", async function() {
        let mockNetwork = await MockNetwork.new();
        let tempExpectedRate = await ExpectedRate.new(mockNetwork.address, kncAddress, admin);

        let token = await TestToken.new("someToke", "some", 16);

        aRate = MAX_RATE.div(precisionUnits).add(new BN(100));
        let ethToTokRatePrecision = precisionUnits.mul(aRate);
        let tokToEthRatePrecision = precisionUnits.div(aRate);

        await mockNetwork.setPairRate(ethAddress, token.address, ethToTokRatePrecision);
        await mockNetwork.setPairRate(token.address, ethAddress, tokToEthRatePrecision);

        let rate = await mockNetwork.findBestRate(ethAddress, token.address, 1000);
        assert(rate[1].gt(MAX_RATE));

        const myRate = await tempExpectedRate.getExpectedRate(ethAddress, token.address, 1000, true);
        Helper.assertEqual(myRate[0], 0, "expected rate should be 0");
        Helper.assertEqual(myRate[1], 0, "expected rate should be 0");
    });

    it("should verify knc arbitrage.", async function() {
        const mockNetwork = await MockNetwork.new();
        const tempExpectedRate = await ExpectedRate.new(mockNetwork.address, kncAddress, admin);

        aRate = 1.2345;
        const ethToKncRatePrecision = precisionUnits.mul(new BN(aRate * 1.01 * 1000000)).div(new BN(1000000));
        const kncToEthRatePrecision = precisionUnits.mul(new BN(10000)).div(new BN(aRate * 10000));

        await mockNetwork.setPairRate(ethAddress, kncAddress, ethToKncRatePrecision);
        await mockNetwork.setPairRate(kncAddress, ethAddress, kncToEthRatePrecision);

        const feeBurnerQty = new BN(10).pow(new BN(18));

        // check exact qty
        const myRate1 = await tempExpectedRate.getExpectedRate(kncAddress,ethAddress,feeBurnerQty,true);
        Helper.assertEqual(myRate1[0], 0, "expected 0 rate in arbitrage");
        Helper.assertEqual(myRate1[1], 0, "expected 0 slippage rate in arbitrage");

        // check different qty
        const myRate2 = await tempExpectedRate.getExpectedRate(kncAddress,ethAddress,feeBurnerQty.add(new BN(1)),true);
        Helper.assertEqual(myRate2[0], kncToEthRatePrecision, "unexpected rate in arbitrage");

        // check converse direction
        const myRate3 = await tempExpectedRate.getExpectedRate(ethAddress,kncAddress,feeBurnerQty,true);
        Helper.assertEqual(myRate3[0], ethToKncRatePrecision, "expected 0 rate in arbitrage");

        // set non arbitrage rates
        const ethToKncRatePrecision2 = precisionUnits.mul(new BN(aRate * 10000)).div(new BN(10000));
        await mockNetwork.setPairRate(ethAddress, kncAddress, ethToKncRatePrecision2);

        // check exact qty
        const myRate4 = await tempExpectedRate.getExpectedRate(kncAddress,ethAddress,feeBurnerQty,true);
        Helper.assertEqual(myRate4[0], kncToEthRatePrecision, "expected rate in arbitrage");
    });

    it("should verify when knc arbitrage the check arbitrage function returns true. otherwise returns false.", async function() {
        const mockNetwork = await MockNetwork.new();
        const tempExpectedRate = await ExpectedRate.new(mockNetwork.address, kncAddress, admin);
        await tempExpectedRate.addOperator(operator);
        await tempExpectedRate.setQuantityFactor(1, {from: operator});

        aRate = 1.2345;
        const ethToKncRatePrecision = precisionUnits.mul(new BN(aRate * 1.01 * 1000000)).div(new BN(1000000));
        const kncToEthRatePrecision = precisionUnits.mul(new BN(10000)).div(new BN(aRate * 10000));

        await mockNetwork.setPairRate(ethAddress, kncAddress, ethToKncRatePrecision);
        await mockNetwork.setPairRate(kncAddress, ethAddress, kncToEthRatePrecision);

        let hasArb =  await tempExpectedRate.checkKncArbitrageRate(kncToEthRatePrecision)

        // check exact qty
        Helper.assertEqual(hasArb, true, "Arbitrage should exist");

        // set non arbitrage rates
        const ethToKncRatePrecision2 = precisionUnits.mul(new BN((aRate - 0.0001) * 10000)).div(new BN(10000));
        await mockNetwork.setPairRate(ethAddress, kncAddress, ethToKncRatePrecision2);

        hasArb = await tempExpectedRate.checkKncArbitrageRate(kncToEthRatePrecision);

        // check exact qty
        Helper.assertEqual(hasArb, false, "Arbitrage shouldn't exist");
    });
});


function log (string) {
    console.log(string);
};
