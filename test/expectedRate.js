const ConversionRates = artifacts.require("ConversionRates.sol");
const TestToken = artifacts.require("mockContracts/TestToken.sol");
const Reserve = artifacts.require("KyberReserve.sol");
const Network = artifacts.require("KyberNetwork.sol");
const MockNetwork = artifacts.require("MockKyberNetwork.sol");
const NetworkFailingGetRate = artifacts.require("NetworkFailingGetRate.sol");
const WhiteList = artifacts.require("WhiteList.sol");
const ExpectedRate = artifacts.require("ExpectedRate.sol");
const FeeBurner = artifacts.require("FeeBurner.sol");
const MockUtils = artifacts.require("MockUtils.sol");

const Helper = require("./helper.js");
const BigNumber = require('bignumber.js');


const ethAddress = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
const precisionUnits = (new BigNumber(10).pow(18));
const ethToKncRatePrecision = precisionUnits.mul(550);
const gasPrice = (new BigNumber(10).pow(9).mul(50));

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
        let qtyBuyStepX = [-1400, -700, -150, 0, 150, 350, 700,  1400];
        let qtyBuyStepY = [ 1000,   75,   25, 0,  0, -50, -160, -3000];

        //imbalance buy steps
        let imbalanceBuyStepX = [-8500, -2800, -1500, 0, 1500, 2800,  4500];
        let imbalanceBuyStepY = [ 1300,   130,    43, 0,   0, -110, -1600];

        //sell price will be 1 / buy (assuming no spread) so sell is actually buy price in other direction
        let qtySellStepX = [-1400, -700, -150, 0, 150, 350, 700, 1400];
        let qtySellStepY = [ 1000,   75,   25, 0,  0, -50, -160, -3000];

        //sell imbalance step
        let imbalanceSellStepX = [-8500, -2800, -1500, 0, 1500, 2800,  4500];
        let imbalanceSellStepY = [ 1300,   130,    43, 0,   0, -110, -1600];

        //compact data.
        let sells = [];
        let buys = [];
        let indices = [];
        let compactBuyArr = [];
        let compactSellArr = [];

        currentBlock = priceUpdateBlock = await Helper.getCurrentBlock();

        //init contracts
        pricing1 = await ConversionRates.new(admin, {});

        //set pricing general parameters
        await pricing1.setValidRateDurationInBlocks(validRateDurationInBlocks);

        //create and add token addresses...
        for (let i = 0; i < numTokens; ++i) {
            token = await TestToken.new("test" + i, "tst" + i, 18);
            tokens[i] = token;
            tokenAdd[i] = token.address;
            await pricing1.addToken(token.address);
            await pricing1.setTokenControlInfo(token.address, minimalRecordResolution, maxPerBlockImbalance, maxTotalImbalance);
            await pricing1.enableTokenTrade(token.address);
        }

        assert.equal(tokens.length, numTokens, "bad number tokens");

        let result = await pricing1.addOperator(operator);

        //buy is ether to token rate. sale is token to ether rate. so sell == 1 / buy. assuming we have no spread.
        let tokensPerEther;
        let ethersPerToken;

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
        let compactBuyHex = Helper.bytesToHex(compactBuyArr);
        buys.push(compactBuyHex);

        compactSellArr = [0, 0, 0, 0, 0, 26, 27, 28, 29, 30, 31, 32, 33, 34];
        let compactSellHex = Helper.bytesToHex(compactSellArr);
        sells.push(compactSellHex);

        indices[0] = 0;

        assert.equal(indices.length, sells.length, "bad sells array size");
        assert.equal(indices.length, buys.length, "bad buys array size");

        await pricing1.setCompactData(buys, sells, currentBlock, indices, {from: operator});

        //all start with same step functions.
        for (let i = 0; i < numTokens; ++i) {
            await pricing1.setQtyStepFunction(tokenAdd[i], qtyBuyStepX, qtyBuyStepY, qtySellStepX, qtySellStepY, {from:operator});
            await pricing1.setImbalanceStepFunction(tokenAdd[i], imbalanceBuyStepX, imbalanceBuyStepY, imbalanceSellStepX, imbalanceSellStepY, {from:operator});
        }

        network = await Network.new(admin);
        await network.addOperator(operator);
        reserve1 = await Reserve.new(network.address, pricing1.address, admin);
        await pricing1.setReserveAddress(reserve1.address);
        await reserve1.addAlerter(alerter);
        for (i = 0; i < numTokens; ++i) {
            await reserve1.approveWithdrawAddress(tokenAdd[i],accounts[0],true);
        }

        //set reserve balance. 10000 wei ether + per token 1000 wei ether value according to base rate.
        let reserveEtherInit = 5000 * 2;
        await Helper.sendEtherWithPromise(accounts[8], reserve1.address, reserveEtherInit);

        let balance = await Helper.getBalancePromise(reserve1.address);
        expectedReserve1BalanceWei = balance.valueOf();
        assert.equal(balance.valueOf(), reserveEtherInit, "wrong ether balance");

        //transfer tokens to reserve. each token same wei balance
        for (let i = 0; i < numTokens; ++i) {
            token = tokens[i];
            let amount1 = (new BigNumber(reserveEtherInit)).div(precisionUnits).mul(baseBuyRate1[i]).floor();
            await token.transfer(reserve1.address, amount1.valueOf());
            let balance = await token.balanceOf(reserve1.address);
            assert.equal(amount1.valueOf(), balance.valueOf());
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
        await network.setParams(gasPrice.valueOf(), 15);
        await network.setEnable(true);
        let price = await network.maxGasPrice();
        assert.equal(price.valueOf(), gasPrice.valueOf());

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
            expectedRateT =  await ExpectedRate.new(network.address, kncAddress, 0);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            expectedRateT =  await ExpectedRate.new(0, kncAddress, admin);
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

        let minSlippage =  ((10000 - minSlippageBps) * myExpectedRate[1].valueOf()) / 10000;

        qtySlippageRate = qtySlippageRate[1].valueOf() * 1;
        if (qtySlippageRate > minSlippage) {
            qtySlippageRate = minSlippage;
            assert(false, "expect qty slippage rate to be lower");
        }

        rates = await expectedRates.getExpectedRate(ethAddress, tokenAdd[tokenInd], qty, false);

        assert.equal(rates[0].valueOf(), myExpectedRate[1].valueOf(), "unexpected rate");
        assert.equal(rates[1].valueOf(), qtySlippageRate, "unexpected rate");
    });

    it("should test eth to token. use min slippage.", async function() {
        let tokenInd = 2;
        let qty = 9;
        quantityFactor = 5;

        await expectedRates.setQuantityFactor(quantityFactor, {from: operator});
        let myExpectedRate = await network.findBestRate(ethAddress, tokenAdd[tokenInd], qty);
        let qtySlippageRate = await network.findBestRate(ethAddress, tokenAdd[tokenInd], (qty * quantityFactor));

        let minSlippage =  ((10000 - minSlippageBps) * myExpectedRate[1].valueOf()) / 10000;

        qtySlippageRate = qtySlippageRate[1].valueOf() * 1;
        if (qtySlippageRate > minSlippage) {
            qtySlippageRate = minSlippage;
        } else {
            assert(false, "expect min slippage rate to be lower");
        }

        rates = await expectedRates.getExpectedRate(ethAddress, tokenAdd[tokenInd], qty, false);

        assert.equal(rates[0].valueOf(), myExpectedRate[1].valueOf(), "unexpected rate");
        assert.equal(rates[1].valueOf(), qtySlippageRate, "unexpected rate");
    });

    it("should test token to eth. use qty slippage.", async function() {
        let tokenInd = 2;
        let qty = 300;

        let myExpectedRate = await network.findBestRate(tokenAdd[tokenInd], ethAddress, qty);
        let qtySlippageRate = await network.findBestRate(tokenAdd[tokenInd], ethAddress, (qty * quantityFactor));

        let minSlippage = new BigNumber(10000 - minSlippageBps).mul(myExpectedRate[1]).div(10000).floor();

        qtySlippageRate = qtySlippageRate[1].valueOf() * 1;
        if (qtySlippageRate > minSlippage) {
            qtySlippageRate = minSlippage;
            assert(false, "expect qty slippage rate to be lower");
        }

        rates = await expectedRates.getExpectedRate(tokenAdd[tokenInd], ethAddress, qty, false);

        assert.equal(rates[0].valueOf(), myExpectedRate[1].valueOf(), "unexpected rate");
        assert.equal(rates[1].valueOf(), qtySlippageRate.valueOf(), "unexpected rate");
    });

    it("should test token to eth. use min quantity.", async function() {
        let tokenInd = 2;
        let qty = 110;
        quantityFactor = 2;

        await expectedRates.setQuantityFactor(quantityFactor, {from: operator});
        let myExpectedRate = await network.findBestRate(tokenAdd[tokenInd], ethAddress, qty);
        let qtySlippageRate = await network.findBestRate(tokenAdd[tokenInd], ethAddress, (qty * quantityFactor));

        let minSlippage = new BigNumber(10000 - minSlippageBps).mul(myExpectedRate[1]).div(10000).floor();

        qtySlippageRate = qtySlippageRate[1].valueOf() * 1;
        if (qtySlippageRate > minSlippage) {
            qtySlippageRate = minSlippage;
        } else {
            assert(false, "expect min slippage rate to be lower");
        }

        rates = await expectedRates.getExpectedRate(tokenAdd[tokenInd], ethAddress, qty, false);

        assert.equal(rates[0].valueOf(), myExpectedRate[1].valueOf(), "unexpected rate");
        assert.equal(rates[1].valueOf(), qtySlippageRate.valueOf(), "unexpected rate");
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

        assert.equal(rxFactor, legalFactor);


        try {
            await expectedRates.setQuantityFactor(illegalFactor, {from: operator});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        rxFactor = await expectedRates.quantityFactor();
        assert.equal(rxFactor, legalFactor);
    });

    it("should verify set min slippage reverts when > 100 * 100.", async function() {
        let legalSlippage = 100 * 100;
        let illegalSlippage = 100 * 100 + 1 * 1;

        await expectedRates.setWorstCaseRateFactor(legalSlippage, {from: operator});
        let rxSlippage = await expectedRates.worstCaseRateFactorInBps();

        assert.equal(rxSlippage, legalSlippage);

        try {
            await expectedRates.setWorstCaseRateFactor(illegalSlippage, {from: operator});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        rxSlippage = await expectedRates.worstCaseRateFactorInBps();
        assert.equal(rxSlippage, legalSlippage);
    });

    it("should verify get expected rate reverts when qty > MAX QTY.", async function() {
        let legalQty = (new BigNumber(10).pow(28));
        let illegalQty = (new BigNumber(10).pow(28)).add(1);
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
        let legalQty = (new BigNumber(10).pow(28)).div(2);
        let illegalQty = (new BigNumber(10).pow(28)).div(2).add(1);
        let tokenInd = 1;

        //with quantity factor 2a
        await expectedRates.setQuantityFactor(2, {from: operator});
        rates = await expectedRates.getExpectedRate(tokenAdd[tokenInd], ethAddress, legalQty, false);

        illegalQty = legalQty.add(1);
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

        assert(rates[0].valueOf() != 0, "unexpected rate");
        assert.equal(rates[0].valueOf(), expectedRate[1].valueOf(), "unexpected rate");
        assert.equal(rates[1].valueOf(), 0, "we expect slippage to be 0");
    });

    it("should verify when qty small, expected rate isn't 0. slippage is 0", async function() {
        let tokenInd = 2;
        let qty = 1;

        rates = await expectedRates.getExpectedRate(tokenAdd[tokenInd], ethAddress, qty, false);
        let expectedRate = await network.searchBestRate(tokenAdd[tokenInd], ethAddress, qty, false);
        assert.equal(rates[0].valueOf(), expectedRate[1].valueOf(), "unexpected rate");
        assert(rates[1].valueOf() == 0, "unexpected rate");
    });

    it("test qty above max trade value, expected rate 0. slippage is 0", async function() {
        let tokenInd = 2;
        let qty = maxPerBlockImbalance;

        rates = await expectedRates.getExpectedRate(tokenAdd[tokenInd], ethAddress, qty, false);
        assert.equal(rates[0].valueOf(), 0)
        assert.equal(rates[1].valueOf(), 0)
    });

    it("test qty as max trade value, quantity factor 2 expected rate OK. slippage is 0", async function() {
        let tokenInd = 2;
        let qty = maxPerBlockImbalance - 1;

        rates = await expectedRates.getExpectedRate(tokenAdd[tokenInd], ethAddress, qty, false);
        assert(rates[0].valueOf() > 0)
        assert.equal(rates[1].valueOf(), 0)
    });

    it("test qty as max trade value, quantity factor 1. expected rate OK. slippage little worse", async function() {
        let tokenInd = 2;
        let qty = maxPerBlockImbalance - 1;
        await expectedRates.setQuantityFactor(1, {from: operator});

        const myExpectedRate = await network.findBestRate(tokenAdd[tokenInd], ethAddress, qty);
        const slippage = (new BigNumber(10000 - minSlippageBps).mul(new BigNumber(myExpectedRate[1]))).div(10000);

        rates = await expectedRates.getExpectedRate(tokenAdd[tokenInd], ethAddress, qty, false);
        assert(rates[0].valueOf() > 0)
        assert(rates[1].valueOf() > 0)
        assert(rates[0].valueOf() > rates[1].valueOf())
        assert.equal(rates[0].valueOf(), myExpectedRate[1].valueOf(), "unexpected expected rate")

        // overcome rounding issues in big number
        const rates1String = rates[1].toString(10);
        const slippageString = slippage.toString(10);
        assert.equal(rates1String, slippageString.substring(0, slippageString.indexOf('.')), "unexpected slippage rate")
        await expectedRates.setQuantityFactor(quantityFactor, {from: operator});
    });

    it("should verify when qty 0, token to token rate as expected.", async function() {
        let tokenSrcInd = 2;
        let tokenDestInd = 1;
        let qty = 0;

        rates = await expectedRates.getExpectedRate(tokenAdd[tokenSrcInd], tokenAdd[tokenDestInd], qty, false);
        let srcToEthRate = await network.searchBestRate(tokenAdd[tokenSrcInd], ethAddress, qty, false);
        srcToEthRate = new BigNumber(srcToEthRate[1].valueOf());
        let ethToDestRate = await network.searchBestRate(ethAddress, tokenAdd[tokenDestInd], qty, false);
        ethToDestRate = new BigNumber(ethToDestRate[1].valueOf());

        assert(rates[0].valueOf() != 0, "unexpected rate");
        assert.equal(rates[0].valueOf(), srcToEthRate.mul(ethToDestRate).div(precisionUnits).floor(), "unexpected rate");
        assert.equal(rates[1].valueOf(), 0, "unexpected rate");
    });

    it("should verify when rate received from kyber network is > MAX_RATE, get expected rate return (0,0).", async function() {
        let mockNetwork = await MockNetwork.new();
        let tempExpectedRate = await ExpectedRate.new(mockNetwork.address, kncAddress, admin);

        let token = await TestToken.new("someToke", "some", 16);

        aRate = MAX_RATE.div(precisionUnits).add(100);
        let ethToTokRatePrecision = precisionUnits.mul(aRate);
        let tokToEthRatePrecision = precisionUnits.div(aRate);

        await mockNetwork.setPairRate(ethAddress, token.address, ethToTokRatePrecision);
        await mockNetwork.setPairRate(token.address, ethAddress, tokToEthRatePrecision);

        let rate = await mockNetwork.findBestRate(ethAddress, token.address, 1000);
        assert(rate[1].gt(MAX_RATE));

        const myRate = await tempExpectedRate.getExpectedRate(ethAddress, token.address, 1000, true);
        assert.equal(myRate[0].valueOf(), 0, "expected rate should be 0");
        assert.equal(myRate[1].valueOf(), 0, "expected rate should be 0");
    });

    it("should verify knc arbitrage.", async function() {
        const mockNetwork = await MockNetwork.new();
        const tempExpectedRate = await ExpectedRate.new(mockNetwork.address, kncAddress, admin);

        aRate = 1.2345;
        const ethToKncRatePrecision = precisionUnits.mul(aRate * 1.01);
        const kncToEthRatePrecision = precisionUnits.div(aRate);

        await mockNetwork.setPairRate(ethAddress, kncAddress, ethToKncRatePrecision);
        await mockNetwork.setPairRate(kncAddress, ethAddress, kncToEthRatePrecision);

        const feeBurnerQty = new BigNumber(10**18);

        // check exact qty
        const myRate1 = await tempExpectedRate.getExpectedRate(kncAddress,ethAddress,feeBurnerQty,true);
        assert.equal(myRate1[0].valueOf(), 0, "expected 0 rate in arbitrage");
        assert.equal(myRate1[1].valueOf(), 0, "expected 0 slippage rate in arbitrage");

        // check different qty
        const myRate2 = await tempExpectedRate.getExpectedRate(kncAddress,ethAddress,feeBurnerQty.plus(1),true);
        assert.equal(myRate2[0].valueOf(), kncToEthRatePrecision.valueOf() * 1, "unexpected rate in arbitrage");

        // check converse direction
        const myRate3 = await tempExpectedRate.getExpectedRate(ethAddress,kncAddress,feeBurnerQty,true);
        assert.equal(myRate3[0].valueOf(), ethToKncRatePrecision.valueOf() * 1, "expected 0 rate in arbitrage");

        // set non arbitrage rates
        const ethToKncRatePrecision2 = precisionUnits.mul(aRate);
        await mockNetwork.setPairRate(ethAddress, kncAddress, ethToKncRatePrecision2);

        // check exact qty
        const myRate4 = await tempExpectedRate.getExpectedRate(kncAddress,ethAddress,feeBurnerQty,true);
        assert.equal(myRate4[0].valueOf(), kncToEthRatePrecision.valueOf() * 1, "expected rate in arbitrage");
    });

    it("should verify when knc arbitrage the check arbitrage function returns true. otherwise returns false.", async function() {
        const mockNetwork = await MockNetwork.new();
        const tempExpectedRate = await ExpectedRate.new(mockNetwork.address, kncAddress, admin);
        await tempExpectedRate.addOperator(operator);
        await tempExpectedRate.setQuantityFactor(1, {from: operator});

        aRate = 1.2345;
        const ethToKncRatePrecision = precisionUnits.mul(aRate * 1.01);
        const kncToEthRatePrecision = precisionUnits.div(aRate);

        await mockNetwork.setPairRate(ethAddress, kncAddress, ethToKncRatePrecision);
        await mockNetwork.setPairRate(kncAddress, ethAddress, kncToEthRatePrecision);

        let hasArb =  await tempExpectedRate.checkKncArbitrageRate(kncToEthRatePrecision)

        // check exact qty
        assert.equal(hasArb, true, "Arbitrage should exist");

        // set non arbitrage rates
        const ethToKncRatePrecision2 = precisionUnits.mul(aRate - 0.0001);
        await mockNetwork.setPairRate(ethAddress, kncAddress, ethToKncRatePrecision2);

        hasArb = await tempExpectedRate.checkKncArbitrageRate(kncToEthRatePrecision);

        // check exact qty
        assert.equal(hasArb, false, "Arbitrage shouldn't exist");
    });

    it("make sure call to find best rate will revert when less then 1 mil gas. in 'NetworkFailingGetRate'", async function() {
        const network = await NetworkFailingGetRate.new();

        const tempExpectedRate = await ExpectedRate.new(network.address, kncAddress, admin);
        await tempExpectedRate.addOperator(operator);
        await tempExpectedRate.setQuantityFactor(1, {from: operator});
        await network.setExpectedRateContract(tempExpectedRate.address);

        await network.setExpectedRateContract(tempExpectedRate.address);

        aRate = 1.2345;
        const ethToKncRatePrecision = precisionUnits.mul(aRate - 0.01);
        const kncToEthRatePrecision = precisionUnits.div(aRate);

        await network.setPairRate(ethAddress, kncAddress, ethToKncRatePrecision);
        await network.setPairRate(kncAddress, ethAddress, kncToEthRatePrecision);

        let rxEthToKnc = await network.findBestRate(ethAddress, kncAddress, 345, {gas: 1200000});
        assert.equal(rxEthToKnc[1].valueOf(), ethToKncRatePrecision.valueOf());

        //call with less then 1 million gas reverts
        try {
            await network.findBestRate(ethAddress, kncAddress, 345, {gas: 999000});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("should verify function 'getExpectedRate' with failing kyber network. returns 0 when 'findBestRate()' reverts.", async function() {
        // find best rate is called with assembly code. thus could fail without reverting. but for check arbitrage. rate 0 response means check can't happen.
        // when setting knc rate in fee burner. in underlying calls findBestRate is called 3 times. if 3rd one fails (Ex: out of gas) returned value
        // would be 0, in this case there is the problem with arbitrage check.
        const network = await NetworkFailingGetRate.new();

        const tempExpectedRate = await ExpectedRate.new(network.address, kncAddress, admin);
        const rxNetwork = await tempExpectedRate.kyberNetwork();
        await tempExpectedRate.addOperator(operator);
        await tempExpectedRate.setQuantityFactor(1, {from: operator});

        await network.setExpectedRateContract(tempExpectedRate.address);

        aRate = 1.2345;
        const ethToKncRatePrecision = precisionUnits.mul(aRate - 0.01);
        const kncToEthRatePrecision = precisionUnits.div(aRate);

        await network.setPairRate(ethAddress, kncAddress, ethToKncRatePrecision);
        await network.setPairRate(kncAddress, ethAddress, kncToEthRatePrecision);

        let rxEthToKnc = await network.getExpectedRate(ethAddress, kncAddress, 345);
        let rxKncToEth = await network.getExpectedRate(kncAddress, ethAddress, 345);

        assert.equal(rxEthToKnc[0].valueOf(), ethToKncRatePrecision.floor().valueOf());
        assert.equal(rxKncToEth[0].valueOf(), kncToEthRatePrecision.floor().valueOf());
//        log("rxEthToKnc " + rxEthToKnc[0])
//        log("rxKncToEth " + rxKncToEth[0])

        let rxEthToKnc2 =  await tempExpectedRate.getExpectedRate(ethAddress, kncAddress, 345, true, {gas: 1200001});
        assert.equal(rxEthToKnc2[0].valueOf(), rxEthToKnc[0].valueOf());

        let rxKncToEth2 =  await tempExpectedRate.getExpectedRate(kncAddress, ethAddress, 345, true, {gas: 1200001});
        assert.equal(rxKncToEth2[0].valueOf(), rxKncToEth[0].valueOf());

        rxEthToKnc2 =  await tempExpectedRate.getExpectedRate(ethAddress, kncAddress, 345, true, {gas: 990000});
        assert.equal(rxEthToKnc2[0].valueOf(), 0);

        rxKncToEth2 =  await tempExpectedRate.getExpectedRate(kncAddress, ethAddress, 345, true, {gas: 990000});
        assert.equal(rxKncToEth2[0].valueOf(), 0);
    });

    it("should verify function 'checkKncArbitrage' will return true if get rate fails and reutrns zero rate to this function.", async function() {
        // find best rate is called with assembly code. thus could fail without reverting. but for check arbitrage. rate 0 response means check can't happen.
        // when setting knc rate in fee burner. in underlying calls findBestRate is called 3 times. if 3rd one fails (Ex: out of gas) returned value
        // would be 0, in this case there is the problem with arbitrage check.
        const network = await NetworkFailingGetRate.new();

        const tempExpectedRate = await ExpectedRate.new(network.address, kncAddress, admin);
        await tempExpectedRate.addOperator(operator);
        await tempExpectedRate.setQuantityFactor(1, {from: operator});
        await network.setExpectedRateContract(tempExpectedRate.address);

        aRate = 1.2345;
        const ethToKncRatePrecision = precisionUnits.mul(aRate - 0.01);
        const kncToEthRatePrecision = precisionUnits.div(aRate);

        await network.setPairRate(ethAddress, kncAddress, ethToKncRatePrecision);
        await network.setPairRate(kncAddress, ethAddress, kncToEthRatePrecision);

        let rxEthToKnc = await network.getExpectedRate(ethAddress, kncAddress, 345);
        let rxKncToEth = await network.getExpectedRate(kncAddress, ethAddress, 345);

        let hasArb =  await tempExpectedRate.checkKncArbitrageRate(kncToEthRatePrecision)
        assert.equal(hasArb, false, "Arbitrage shouldn't exist");

        hasArb =  await tempExpectedRate.checkKncArbitrageRate(kncToEthRatePrecision, {gas: 990000})
        // here network should revert and get rate should avoid the revert and return 0
        assert.equal(hasArb, true, "Arbitrage should exist");
    });

    it("should verify when have knc arbitrage, set rate reverts.", async function() {
        const mockNetwork = await NetworkFailingGetRate.new();
        const tempExpectedRate = await ExpectedRate.new(mockNetwork.address, kncAddress, admin);
        await tempExpectedRate.addOperator(operator);
        await tempExpectedRate.setQuantityFactor(1, {from: operator});
        await mockNetwork.setExpectedRateContract(tempExpectedRate.address);

        const tempFeeBurner = await FeeBurner.new(admin, kncAddress, mockNetwork.address, 550 * 10 ** 18);
        aRate = 1.2345;
        const ethToKncRatePrecision = precisionUnits.mul(aRate * 1.01);
        const kncToEthRatePrecision = precisionUnits.div(aRate);

        await mockNetwork.setPairRate(ethAddress, kncAddress, ethToKncRatePrecision);
        await mockNetwork.setPairRate(kncAddress, ethAddress, kncToEthRatePrecision);

        let rxEthToKnc = await mockNetwork.getExpectedRate(ethAddress, kncAddress, 10 ** 19);
        let rxKncToEth = await mockNetwork.getExpectedRate(kncAddress, ethAddress, 10 ** 19);
        assert.equal(rxEthToKnc[0].valueOf(), ethToKncRatePrecision.floor().valueOf())
        assert.equal(rxKncToEth[0].valueOf(), kncToEthRatePrecision.floor().valueOf())

        //when checking this qty and arb exists. will return 0
        rxKncToEth = await mockNetwork.getExpectedRate(kncAddress, ethAddress, 10 ** 18);
        assert.equal(rxKncToEth[0].valueOf(), 0)

        let hasArb =  await tempExpectedRate.checkKncArbitrageRate(kncToEthRatePrecision)

        assert.equal(hasArb, true, "Arbitrage should exist");

        let burnerInitialkncRate = await tempFeeBurner.kncPerEthRatePrecision();
//         has arb. get rate will return 0. should revert.
        try {
            let rxx = await tempFeeBurner.setKNCRate();
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        let burnerkncRateAfterSet = await tempFeeBurner.kncPerEthRatePrecision();
        assert.equal(burnerkncRateAfterSet.valueOf(), burnerInitialkncRate.valueOf());
      });

      it("should verify when have no knc arbitrage, set rate success", async function() {
        const mockNetwork = await NetworkFailingGetRate.new();
        const tempExpectedRate = await ExpectedRate.new(mockNetwork.address, kncAddress, admin);
        await tempExpectedRate.addOperator(operator);
        await tempExpectedRate.setQuantityFactor(1, {from: operator});
        await mockNetwork.setExpectedRateContract(tempExpectedRate.address);

        const tempFeeBurner = await FeeBurner.new(admin, kncAddress, mockNetwork.address, 550 * 10 ** 18);
        aRate = 1.2345;
        const ethToKncRatePrecision = precisionUnits.mul(aRate * 1.01);
        const kncToEthRatePrecision = precisionUnits.div(aRate);

        await mockNetwork.setPairRate(ethAddress, kncAddress, ethToKncRatePrecision);
        await mockNetwork.setPairRate(kncAddress, ethAddress, kncToEthRatePrecision);

        let rxEthToKnc = await mockNetwork.getExpectedRate(ethAddress, kncAddress, 10 ** 19);
        let rxKncToEth = await mockNetwork.getExpectedRate(kncAddress, ethAddress, 10 ** 19);
        assert.equal(rxEthToKnc[0].valueOf(), ethToKncRatePrecision.floor().valueOf())
        assert.equal(rxKncToEth[0].valueOf(), kncToEthRatePrecision.floor().valueOf())

        // set non arbitrage rates
        const ethToKncRatePrecision2 = precisionUnits.mul(aRate - 0.0001);
        await mockNetwork.setPairRate(ethAddress, kncAddress, ethToKncRatePrecision2);

        hasArb = await tempExpectedRate.checkKncArbitrageRate(kncToEthRatePrecision);

        // check exact qty
        assert.equal(hasArb, false, "Arbitrage shouldn't exist");

        rxEthToKnc = await mockNetwork.getExpectedRate(ethAddress, kncAddress, 10 ** 18);
        rxKncToEth = await mockNetwork.getExpectedRate(kncAddress, ethAddress, 10 ** 18);

        assert.equal(rxEthToKnc[0].valueOf(), ethToKncRatePrecision2.floor().valueOf())
        assert.equal(rxKncToEth[0].valueOf(), kncToEthRatePrecision.floor().valueOf())

        // no arb. set rate should not fail
        let rx = await tempFeeBurner.setKNCRate();
        burnerkncRateAfterSet = await tempFeeBurner.kncPerEthRatePrecision();
        assert.equal(ethToKncRatePrecision2.valueOf(), burnerkncRateAfterSet.valueOf());
    });

    it("should verify function 'setKncRate' will fail if last call to findBestRate fails.", async function() {
        const mockNetwork = await NetworkFailingGetRate.new();
        const tempExpectedRate = await ExpectedRate.new(mockNetwork.address, kncAddress, admin);
        await tempExpectedRate.addOperator(operator);
        await tempExpectedRate.setQuantityFactor(1, {from: operator});
        await mockNetwork.setExpectedRateContract(tempExpectedRate.address);

        const tempFeeBurner = await FeeBurner.new(admin, kncAddress, mockNetwork.address, 550 * 10 ** 18);
        aRate = 1.2345;
        const ethToKncRatePrecision = precisionUnits.mul(aRate - 0.001);
        const kncToEthRatePrecision = precisionUnits.div(aRate);

        await mockNetwork.setPairRate(ethAddress, kncAddress, ethToKncRatePrecision);
        await mockNetwork.setPairRate(kncAddress, ethAddress, kncToEthRatePrecision);

        let hasArb =  await tempExpectedRate.checkKncArbitrageRate(kncToEthRatePrecision)

        assert.equal(hasArb, false, "Arbitrage shouldn't exist");

        let burnerInitialkncRate = await tempFeeBurner.kncPerEthRatePrecision();

        ///set knc rate with less then 3 milion gas - should fail and revert
        try {
            let rxx = await tempFeeBurner.setKNCRate({gas: 2800000});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        let burnerkncRateAfterSet = await tempFeeBurner.kncPerEthRatePrecision();
        assert.equal(burnerkncRateAfterSet.valueOf(), burnerInitialkncRate.valueOf());

        await tempFeeBurner.setKNCRate({gas: 3500000});
        burnerkncRateAfterSet = await tempFeeBurner.kncPerEthRatePrecision();
        assert.equal(ethToKncRatePrecision.valueOf(), burnerkncRateAfterSet.valueOf());
    });

    it("call getExpectedRate call to kyber reverts. getExpectedRate should return 0 and not revert. without permissionless", async() => {
        const mockNetwork = await MockNetwork.new();
        const tempExpectedRate = await ExpectedRate.new(mockNetwork.address, kncAddress, admin);
        await tempExpectedRate.addOperator(operator);
        await tempExpectedRate.setQuantityFactor(1, {from: operator});

        const token = await TestToken.new("someToke", "some", 16);

        const rate = precisionUnits.mul(1.01);
        await mockNetwork.setPairRate(ethAddress, token.address, rate);
        await mockNetwork.setPairRate(token.address, ethAddress, rate);

        aRate = 1.2345;
        const ethToKncRatePrecision = precisionUnits.mul(aRate);
        const kncToEthRatePrecision = precisionUnits.div(aRate);

        await mockNetwork.setPairRate(ethAddress, kncAddress, ethToKncRatePrecision);
        await mockNetwork.setPairRate(kncAddress, ethAddress, kncToEthRatePrecision);

        await mockNetwork.getExpectedRate(ethAddress, token.address, 1000);

        // see REVERT_HINT causes revert on network level
        const REVERT_HINT = await mockNetwork.REVERT_HINT();
        try {
            await mockNetwork.findBestRate(ethAddress, token.address, REVERT_HINT);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        // this returns good values - no revert
        rates = await tempExpectedRate.getExpectedRate(ethAddress, token.address, 5000, false);

        assert(rates[0].valueOf() > 0, "expected rate > 0");
        assert(rates[1].valueOf() > 0, "expected rate > 0");

        rates = await tempExpectedRate.getExpectedRate(ethAddress, token.address, REVERT_HINT, false);
        assert.equal(rates[0].valueOf(), 0, "unexpected rate");
        assert.equal(rates[1].valueOf(), 0, "unexpected rate");
    })
    
    it("call getExpectedRate call to kyber reverts. getExpectedRate should return 0 and not revert. including permissionless", async() => {
        const mockNetwork = await MockNetwork.new();
        const tempExpectedRate = await ExpectedRate.new(mockNetwork.address, kncAddress, admin);
        await tempExpectedRate.addOperator(operator);
        await tempExpectedRate.setQuantityFactor(1, {from: operator});

        const token = await TestToken.new("someToke", "some", 16);

        const rate = precisionUnits.mul(1.01);
        await mockNetwork.setPairRate(ethAddress, token.address, rate);
        await mockNetwork.setPairRate(token.address, ethAddress, rate);

        aRate = 1.2345;
        const ethToKncRatePrecision = precisionUnits.mul(aRate);
        const kncToEthRatePrecision = precisionUnits.div(aRate);

        await mockNetwork.setPairRate(ethAddress, kncAddress, ethToKncRatePrecision);
        await mockNetwork.setPairRate(kncAddress, ethAddress, kncToEthRatePrecision);

        await mockNetwork.getExpectedRate(ethAddress, token.address, 1000);

        // see REVERT_HINT causes revert on network level
        const REVERT_HINT = await mockNetwork.REVERT_HINT();
        try {
            await mockNetwork.findBestRate(ethAddress, token.address, REVERT_HINT);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        // this returns good values - no revert
        rates = await tempExpectedRate.getExpectedRate(ethAddress, token.address, 5000, true);

        assert(rates[0].valueOf() > 0, "expected rate > 0");
        assert(rates[1].valueOf() > 0, "expected rate > 0");

        rates = await tempExpectedRate.getExpectedRate(ethAddress, token.address, REVERT_HINT, true);
        assert.equal(rates[0].valueOf(), 0, "unexpected rate");
        assert.equal(rates[1].valueOf(), 0, "unexpected rate");
    })
});


function log (string) {
    console.log(string);
};
