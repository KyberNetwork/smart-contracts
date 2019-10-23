const Web3 = require('web3');
const web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8545'));

let TestToken = artifacts.require("TestTokenV5.sol");
let WethToken = artifacts.require("WethTokenV5.sol");
let MockOtcOrderbook = artifacts.require("MockOtcOrderbook.sol");
let Eth2DaiReserve = artifacts.require("Eth2DaiReserve.sol");

let Helper = require("../test/helper.js");
let BigNumber = require('bignumber.js');

const ethAddress = '0x00eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const precision = new BigNumber(10).pow(18);
const feeBps = new BigNumber(25);

const initOTCDaiBalance = new BigNumber(2000000).mul(BigNumber(10).pow(18));
const initOTCWethBalance = new BigNumber(1000).mul(BigNumber(10).pow(18));

const minDaiBal  = (new BigNumber(1000)).mul(BigNumber(10).pow(18))
const maxDaiBal  = (new BigNumber(10000)).mul(BigNumber(10).pow(18))
const initDaiBal = (new BigNumber(5000)).mul(BigNumber(10).pow(18))
const minSpreadInBps = 70;
const permiumBps     = 10;

const maxTraverse = 20;
const maxTraverseX = 4160;
const maxTraverseY = 493146;
const maxTake = 10;
const maxTakeX = 2560;
const maxTakeY = 260431;
const minSupport = (new BigNumber(10)).pow(17); // 0.1 ether
const minSupportX = 7000;
const minSupportY = 193750;

let admin;
let alerter;
let operator;
let otc;
let reserve;
let network;
let user;

let myWethToken;
let myDaiToken;

contract('Eth2DaiReserve', function(accounts) {
    before("one time init", async() => {
        admin = accounts[0];
        network = accounts[0];
        alerter = accounts[0];
        operator = accounts[0];
        user = accounts[1];

        myWethToken = await WethToken.new("my weth token", "weth", 18);
        myDaiToken = await TestToken.new("my dai token", "dai", 18);
        otc = await MockOtcOrderbook.new(myWethToken.address, myDaiToken.address);
        reserve = await Eth2DaiReserve.new(network, feeBps.valueOf(), otc.address, myWethToken.address, admin);

        await reserve.listToken(myDaiToken.address);
        await reserve.setTokenConfigData(
            myDaiToken.address,
            maxTraverse, maxTraverseX, maxTraverseY,
            maxTake, maxTakeX, maxTakeY,
            minSupportX, minSupportY, minSupport
        )
        reserve.addAlerter(alerter);
        reserve.addOperator(operator);

        await myDaiToken.approve(reserve.address, (new BigNumber(2)).pow(255), {from: network});
    });

    beforeEach("running before each test", async() => {
        // reset otc data
        await otc.resetOffersData();
    });

    it("Test transfer tokens to otc, reserve and user", async function() {
        // transfer weth and dai to contracts
        await myWethToken.transfer(otc.address, initOTCWethBalance);
        let balance;
        balance = await myWethToken.balanceOf(otc.address);
        assert.equal(balance.valueOf(), initOTCWethBalance.valueOf(), "init balance weth is not correct");
        await myDaiToken.transfer(otc.address, initOTCDaiBalance);
        balance = await myDaiToken.balanceOf(otc.address);
        assert.equal(balance.valueOf(), initOTCDaiBalance.valueOf(), "init balance weth is not correct");

        // transfer 1000k DAI to users
        await myDaiToken.transfer(user, (new BigNumber(10)).pow(18).mul(1000000));
    });
  
    it("Should check correct token data", async function() {
        let a;
        // min eth support, max traverse, max take
        a = await reserve.getTokenBasicDataPub(myDaiToken.address);
        assert.equal(a[0].valueOf(), minSupport.valueOf(), "min eth support is not correct");
        assert.equal(a[1].valueOf(), (new BigNumber(maxTraverse)).valueOf(), "max traverse is not correct");
        assert.equal(a[2].valueOf(), (new BigNumber(maxTake)).valueOf(), "max takes is not correct");
        a = await reserve.getFactorDataPub(myDaiToken.address);
        assert.equal(a[0].valueOf(), (new BigNumber(maxTraverseX)).valueOf(), "max traverse x is not correct");
        assert.equal(a[1].valueOf(), (new BigNumber(maxTraverseY)).valueOf(), "max traverse y is not correct");
        assert.equal(a[2].valueOf(), (new BigNumber(maxTakeX)).valueOf(), "max take x is not correct");
        assert.equal(a[3].valueOf(), (new BigNumber(maxTakeY)).valueOf(), "max take y is not correct");
        assert.equal(a[4].valueOf(), (new BigNumber(minSupportX)).valueOf(), "min support x is not correct");
        assert.equal(a[5].valueOf(), (new BigNumber(minSupportY)).valueOf(), "min support y is not correct");
    });

    it("Should test getConversionRate returns 0 token not listed", async function() {
        await otc.setBuyOffer(2, myDaiToken.address, 3 * 300 * precision, myWethToken.address, 3 * precision); // rate: 300
        await otc.setSellOffer(3, myWethToken.address, 3 * precision, myDaiToken.address, 3 * 300 * precision); // rate: 300

        let token = await TestToken.new("test token", "tes", 18);
        let result;
        result = await reserve.getConversionRate(ethAddress, token.address, 1 * precision, 0);
        assert.equal(result.valueOf(), 0, "rate should be 0 as token is not listed");

        result = await reserve.getConversionRate(token.address, ethAddress, 20 * precision, 0);
        assert.equal(result.valueOf(), 0, "rate should be 0 as token is not listed");

        result = await reserve.getConversionRate(ethAddress, myDaiToken.address, 1 * precision, 0);
        assert.notEqual(result.valueOf(), 0, "should have rate as token is listed");
    });

    it("Should test getConversionRate returns 0 trade not enable", async function() {
        await otc.setBuyOffer(2, myDaiToken.address, 3 * 300 * precision, myWethToken.address, 3 * precision); // rate: 300
        await otc.setSellOffer(3, myWethToken.address, 3 * precision, myDaiToken.address, 3 * 300 * precision); // rate: 300

        await reserve.disableTrade({from: alerter});
        let result;
        // not have sell order
        result = await reserve.getConversionRate(ethAddress, myDaiToken.address, 1 * precision, 0);
        assert.equal(result.valueOf(), 0, "rate should be 0 as trade is not enable");

        result = await reserve.getConversionRate(myDaiToken.address, ethAddress, 20 * precision, 0);
        assert.equal(result.valueOf(), 0, "rate should be 0 as trade is not enable");

        await reserve.enableTrade({from: admin});
        result = await reserve.getConversionRate(ethAddress, myDaiToken.address, 1 * precision, 0);
        assert.notEqual(result.valueOf(), 0, "should have rate as trade is enable");
    });

    it("Should test getConversionRate returns 0 amount is smaller than min support eth (eth -> dai)", async function() {
        await otc.setBuyOffer(1, myDaiToken.address, 300 * precision, myWethToken.address, 1 * precision);// rate: 300
        await otc.setBuyOffer(2, myDaiToken.address, 1.5 * 280 * precision, myWethToken.address, 1.5 * precision);// rate: 280
        await otc.setBuyOffer(3, myDaiToken.address, 3.5 * 250 * precision, myWethToken.address, 3.5 * precision); // rate: 250
        await otc.setBuyOffer(4, myDaiToken.address, 4 * 245 * precision, myWethToken.address, 4 * precision); // rate: 245
        await otc.setBuyOffer(5, myDaiToken.address, 10 * 240 * precision, myWethToken.address, 10 * precision); // rate: 240

        result = await reserve.getConversionRate(ethAddress, myDaiToken.address, minSupport, 0);
        assert.notEqual(result.valueOf(), 0, "should have rate");

        result = await reserve.getConversionRate(ethAddress, myDaiToken.address, minSupport.sub(1), 0);
        assert.equal(result.valueOf(), 0, "rate should be 0");
    });

    it("Should test getConversionRate returns correct rate with apply fee without internal inventory (eth -> dai)", async function() {
        await otc.setBuyOffer(1, myDaiToken.address, 300 * precision, myWethToken.address, 1 * precision);// rate: 300
        await otc.setBuyOffer(2, myDaiToken.address, 1.5 * 280 * precision, myWethToken.address, 1.5 * precision);// rate: 280
        await otc.setBuyOffer(3, myDaiToken.address, 3.5 * 250 * precision, myWethToken.address, 3.5 * precision); // rate: 250
        await otc.setBuyOffer(4, myDaiToken.address, 4 * 245 * precision, myWethToken.address, 4 * precision); // rate: 245
        await otc.setBuyOffer(5, myDaiToken.address, 10 * 240 * precision, myWethToken.address, 10 * precision); // rate: 240

        let result;
        let expectedRate;
        let newFeeBps;
        
        try {
            newFeeBps = 25;
            await reserve.setFeeBps(newFeeBps);
            result = await reserve.getConversionRate(ethAddress, myDaiToken.address, 1.5 * precision, 0);
            expectedRate = (new BigNumber(280)).mul(precision);
            expectedRate = addBps(expectedRate, newFeeBps * -1);
            expectedRate = applyInternalInventory(expectedRate, false);
            assert.equal(result.valueOf(), expectedRate.valueOf(), "rate is not correct");

            result = await reserve.getConversionRate(ethAddress, myDaiToken.address, 4 * precision, 0);
            // dest amount = 3.5 * 250 + 0.5 * 280 = 1015
            // rate = 1015 / 4 = 253.75
            expectedRate = (new BigNumber(1015)).mul(precision).div(4);
            expectedRate = addBps(expectedRate, newFeeBps * -1);
            expectedRate = applyInternalInventory(expectedRate, false);
            assert.equal(result.valueOf(), expectedRate.valueOf(), "rate is not correct");

            newFeeBps = 50;
            await reserve.setFeeBps(newFeeBps);
            result = await reserve.getConversionRate(ethAddress, myDaiToken.address, 1.5 * precision, 0);
            expectedRate = (new BigNumber(280)).mul(precision);
            expectedRate = addBps(expectedRate, newFeeBps * -1);
            expectedRate = applyInternalInventory(expectedRate, false);
            assert.equal(result.valueOf(), expectedRate.valueOf(), "rate is not correct");

            newFeeBps = 0;
            await reserve.setFeeBps(newFeeBps);
            result = await reserve.getConversionRate(ethAddress, myDaiToken.address, 1.5 * precision, 0);
            expectedRate = (new BigNumber(280)).mul(precision);
            expectedRate = addBps(expectedRate, newFeeBps * -1);
            expectedRate = applyInternalInventory(expectedRate, false);
            assert.equal(result.valueOf(), expectedRate.valueOf(), "rate is not correct");

            newFeeBps = 25;
            await reserve.setFeeBps(newFeeBps);
            result = await reserve.getConversionRate(ethAddress, myDaiToken.address, 6 * precision, 0);
            // dest amount = 3.5 * 250 + 2.5 * 245 = 1487.5
            // rate = 1,487.5 / 6 = 247.9166666667
            expectedRate = (new BigNumber(3.5 * 250 + 2.5 * 245)).mul(precision).div(6).floor();
            expectedRate = addBps(expectedRate, newFeeBps * -1);
            let newExpectedRate = applyInternalInventory(expectedRate, false); // expect rate is reduced by 1
            assert.equal(expectedRate.sub(1).valueOf(), newExpectedRate.valueOf(), "expected rate is reduced by 1")
            assert.equal(result.valueOf(), newExpectedRate.valueOf(), "rate is not correct");

        } catch (e) {
            await reserve.setFeeBps(feeBps);
            assert(false, "shouldn't fail or revert");
        }

        await reserve.setFeeBps(feeBps);
    });

    it("Should test getConversionRate still returns rate even slippage is not ok with no internal inventory (eth -> dai)", async function() {
        await otc.setBuyOffer(2, myDaiToken.address, 3 * 300 * precision, myWethToken.address, 3 * precision); // rate: 300

        let result;
        
        // not have sell order
        result = await reserve.getConversionRate(ethAddress, myDaiToken.address, 1.5 * precision, 0);
        assert.notEqual(result.valueOf(), 0, "should still have rate when there is arbitrage");

        await otc.setSellOffer(1, myWethToken.address, 1 * precision, myDaiToken.address, 200 * precision); // rate: 200

        // have sell order but create arbitrage
        result = await reserve.getConversionRate(ethAddress, myDaiToken.address, 1.5 * precision, 0);
        assert.notEqual(result.valueOf(), 0, "should still have rate when there is arbitrage");

        await otc.resetOffersData();
    });

    it("Should test getConversionRate returns 0 can not take any offers or not enough to take (eth -> dai)", async function() {
        await otc.setBuyOffer(2, myDaiToken.address, 2 * 300 * precision, myWethToken.address, 2 * precision); // rate: 300
        await otc.setBuyOffer(3, myDaiToken.address, 2.2 * 290 * precision, myWethToken.address, 2.2 * precision); // rate: 290
        await otc.setBuyOffer(4, myDaiToken.address, 2.6 * 280 * precision, myWethToken.address, 2.6 * precision); // rate: 280
        await otc.setBuyOffer(5, myDaiToken.address, 2.6 * 270 * precision, myWethToken.address, 2.6 * precision); // rate: 270
        await otc.setBuyOffer(6, myDaiToken.address, 2.6 * 270 * precision, myWethToken.address, 2.6 * precision); // rate: 270
        await otc.setBuyOffer(7, myDaiToken.address, 10 * 265 * precision, myWethToken.address, 10 * precision); // rate: 265

        let result;
        result = await reserve.getConversionRate(ethAddress, myDaiToken.address, 10 * precision, 0);
        assert.equal(result.valueOf(), 0, "rate should be 0 as can not take any offers");
    
        result = await reserve.getConversionRate(ethAddress, myDaiToken.address, 6 * precision, 0);
        assert.equal(result.valueOf(), 0, "rate should be 0 as not enough offers to take, maxTakes reached");

        result = await reserve.getConversionRate(ethAddress, myDaiToken.address, 6 * precision, 0);
        assert.equal(result.valueOf(), 0, "rate should be 0 as not enough offers to take, maxTraverse reached");
    });

    it("Should test getConversionRate returns 0 when slippage is not ok with no internal inventory (dai -> eth)", async function() {
        let result;
        
        result = await reserve.getConversionRate(myDaiToken.address, ethAddress, 200 * precision, 0);
        assert.equal(result.valueOf(), 0, "should have no rate");

        // no buy offer
        await otc.setSellOffer(1, myWethToken.address, 1 * precision, myDaiToken.address, 200 * precision); // rate: 200
        result = await reserve.getConversionRate(myDaiToken.address, ethAddress, 200 * precision, 0);
        assert.equal(result.valueOf(), 0, "should have no rate");

        // have both buy & sell, but slippage is not ok
        await otc.setBuyOffer(2, myDaiToken.address, 5 * 210 * precision, myWethToken.address, 5 * precision); // rate: 210
        result = await reserve.getConversionRate(myDaiToken.address, ethAddress, 200 * precision, 0);
        assert.equal(result.valueOf(), 0, "should have no rate");

        await otc.resetOffersData();

        // no sell offer
        await otc.setBuyOffer(2, myDaiToken.address, 5 * 210 * precision, myWethToken.address, 5 * precision); // rate: 210
        result = await reserve.getConversionRate(myDaiToken.address, ethAddress, 200 * precision, 0);
        assert.equal(result.valueOf(), 0, "should have no rate");
    });

    it("Should test getConversionRate returns correct rate with apply fee without internal inventory (dai -> eth)", async function() {
        // median rate: 200
        await otc.setBuyOffer(1, myDaiToken.address, 5 * 190 * precision, myWethToken.address, 5 * precision); // rate: 190
        await otc.setSellOffer(2, myWethToken.address, 5 * precision, myDaiToken.address, 210 * 5 * precision); // rate: 210
        await otc.setSellOffer(3, myWethToken.address, 6 * precision, myDaiToken.address, 212 * 6 * precision); // rate: 212
        await otc.setSellOffer(4, myWethToken.address, 4 * precision, myDaiToken.address, 216 * 4 * precision); // rate: 216
        await otc.setSellOffer(5, myWethToken.address, 6 * precision, myDaiToken.address, 220 * 6 * precision); // rate: 220

        let result;
        let expectedRate;
        let newFeeBps;
        
        newFeeBps = 25;
        await reserve.setFeeBps(newFeeBps);
        result = await reserve.getConversionRate(myDaiToken.address, ethAddress, 2 * 210 * precision, 0);
        expectedRate = (new BigNumber(precision)).div(210).floor();
        expectedRate = addBps(expectedRate, newFeeBps * -1);
        expectedRate = applyInternalInventory(expectedRate, false);
        assert.equal(result.valueOf(), expectedRate.valueOf(), "rate is not correct");

        newFeeBps = 50;
        await reserve.setFeeBps(newFeeBps);
        result = await reserve.getConversionRate(myDaiToken.address, ethAddress, 2 * 210 * precision, 0);
        expectedRate = (new BigNumber(precision)).div(210).floor();
        expectedRate = addBps(expectedRate, newFeeBps * -1);
        expectedRate = applyInternalInventory(expectedRate, false);
        assert.equal(result.valueOf(), expectedRate.valueOf(), "rate is not correct");

        newFeeBps = 0;
        await reserve.setFeeBps(newFeeBps);
        result = await reserve.getConversionRate(myDaiToken.address, ethAddress, 2 * 210 * precision, 0);
        expectedRate = (new BigNumber(280)).mul(precision);
        expectedRate = (new BigNumber(precision)).div(210).floor();
        expectedRate = applyInternalInventory(expectedRate, false);
        assert.equal(result.valueOf(), expectedRate.valueOf(), "rate is not correct");

        newFeeBps = 25;
        await reserve.setFeeBps(newFeeBps);
        result = await reserve.getConversionRate(myDaiToken.address, ethAddress, (5 * 210 + 3 * 212) * precision, 0);
        // dest amount = 8
        // rate = 8 * 10^18 / (5 * 210 + 3 * 212)
        expectedRate = (new BigNumber(precision)).mul(8).div(5 * 210 + 3 * 212).floor();
        expectedRate = addBps(expectedRate, newFeeBps * -1);
        let newExpectedRate = applyInternalInventory(expectedRate, false); // expect rate is reduced by 1
        assert.equal(expectedRate.sub(1).valueOf(), newExpectedRate.valueOf(), "expected rate is reduced by 1")
        assert.equal(result.valueOf(), newExpectedRate.valueOf(), "rate is not correct");

        await reserve.setFeeBps(feeBps);
    });

    it("Should test getConversionRate returns 0 can not take any offers or not enough to take (dai -> eth)", async function() {
        // median rate: 200
        await otc.setBuyOffer(1, myDaiToken.address, 5 * 190 * precision, myWethToken.address, 5 * precision); // rate: 190
        await otc.setSellOffer(2, myWethToken.address, 1 * precision, myDaiToken.address, 210 * 1 * precision); // rate: 210
        await otc.setSellOffer(3, myWethToken.address, 2.2 * precision, myDaiToken.address, 212 * 2.2 * precision); // rate: 212
        await otc.setSellOffer(4, myWethToken.address, 2.6 * precision, myDaiToken.address, 216 * 2.6 * precision); // rate: 216
        await otc.setSellOffer(5, myWethToken.address, 2.6 * precision, myDaiToken.address, 220 * 2.6 * precision); // rate: 220
        await otc.setSellOffer(6, myWethToken.address, 3 * precision, myDaiToken.address, 224 * 3 * precision); // rate: 222
        await otc.setSellOffer(6, myWethToken.address, 10 * precision, myDaiToken.address, 225 * 10 * precision); // rate: 222

        let result;
        result = await reserve.getConversionRate(myDaiToken.address, ethAddress, 20 * 200 * precision, 0);
        assert.equal(result.valueOf(), 0, "rate should be 0 as can not take any offers");
    
        result = await reserve.getConversionRate(ethAddress, myDaiToken.address, 6 * precision, 0);
        assert.equal(result.valueOf(), 0, "rate should be 0 as not enough offers to take, maxTakes reached");

        result = await reserve.getConversionRate(ethAddress, myDaiToken.address, 6 * precision, 0);
        assert.equal(result.valueOf(), 0, "rate should be 0 as not enough offers to take, maxTraverse reached");
    });

    it("Should test getConversionRate returns 0 amount is smaller than min support eth (dai -> eth)", async function() {
        // median rate: 200
        await otc.setBuyOffer(1, myDaiToken.address, 190 * precision, myWethToken.address, 1 * precision); // rate: 190
        await otc.setSellOffer(2, myWethToken.address, 1 * precision, myDaiToken.address, 210 * 1 * precision); // rate: 210
        await otc.setSellOffer(3, myWethToken.address, 2.2 * precision, myDaiToken.address, 212 * 2.2 * precision); // rate: 212
        await otc.setSellOffer(4, myWethToken.address, 2.6 * precision, myDaiToken.address, 216 * 2.6 * precision); // rate: 216
        await otc.setSellOffer(5, myWethToken.address, 2.6 * precision, myDaiToken.address, 220 * 2.6 * precision); // rate: 220

        result = await reserve.getConversionRate(myDaiToken.address, ethAddress, minSupport.div(2).mul(200), 0);
        assert.equal(result.valueOf(), 0, "rate should be 0");

        result = await reserve.getConversionRate(myDaiToken.address, ethAddress, minSupport.mul(200), 0);
        assert.notEqual(result.valueOf(), 0, "should have rate");
    });

    it("Should test showBestOffers takes only first offer (eth -> dai)", async function() {
        await otc.setBuyOffer(1, myDaiToken.address, 3000 * precision, myWethToken.address, 10 * precision);
        await otc.setBuyOffer(2, myDaiToken.address, 20250 * precision, myWethToken.address, 101 * precision);
        await otc.setBuyOffer(3, myDaiToken.address, 20000 * precision, myWethToken.address, 100 * precision);

        let result = await reserve.showBestOffers(myDaiToken.address, true, 5);
        assert.equal(result[0].valueOf(), 1500 * precision, "dest amount should be correct");
        assert.equal(result[1].valueOf(), 1500, "dest amount should be 1500");
        assert.equal(result[2].length, 1, "Should take only 1 offer");
        assert.equal(result[2][0].valueOf(), 1, "offer id should be 1");

        result = await reserve.showBestOffers(myDaiToken.address, true, 10);
        assert.equal(result[0].valueOf(), 3000 * precision, "dest amount should be correct");
        assert.equal(result[1].valueOf(), 3000, "dest amount should be correct");
        assert.equal(result[2].length, 1, "Should take only 1 offer");
        assert.equal(result[2][0].valueOf(), 1, "offer id should be correct");
    });

    it("Should test showBestOffers takes only last traverse offer (eth -> dai)", async function() {
        await otc.setBuyOffer(1, myDaiToken.address, 300 * precision, myWethToken.address, 1 * precision);
        await otc.setBuyOffer(2, myDaiToken.address, 400 * precision, myWethToken.address, 1.5 * precision);
        await otc.setBuyOffer(3, myDaiToken.address, 500 * precision, myWethToken.address, 2 * precision);
        await otc.setBuyOffer(4, myDaiToken.address, 539 * precision, myWethToken.address, 2.2 * precision);
        await otc.setBuyOffer(5, myDaiToken.address, 2400 * precision, myWethToken.address, 10 * precision);

        let result = await reserve.showBestOffers(myDaiToken.address, true, 5);
        assert.equal(result[0].valueOf(), 240 * 5 * precision, "dest amount should be correct");
        assert.equal(result[1].valueOf(), 240 * 5, "dest amount should be correct");
        assert.equal(result[2].length, 1, "Should take only 1 offer");
        assert.equal(result[2][0].valueOf(), 5, "offer id should be correct");

        result = await reserve.showBestOffers(myDaiToken.address, true, 10);
        assert.equal(result[0].valueOf(), 2400 * precision, "dest amount should be correct");
        assert.equal(result[1].valueOf(), 2400, "dest amount should be correct");
        assert.equal(result[2].length, 1, "Should take only 1 offer");
        assert.equal(result[2][0].valueOf(), 5, "offer id should be correct");
    });

    it("Should test showBestOffers takes 2 offers (eth -> dai)", async function() {
        await otc.setBuyOffer(1, myDaiToken.address, 300 * precision, myWethToken.address, 1 * precision);// rate: 300
        await otc.setBuyOffer(2, myDaiToken.address, 400 * precision, myWethToken.address, 1.5 * precision);// rate: 266.66
        await otc.setBuyOffer(3, myDaiToken.address, 2.5 * 250 * precision, myWethToken.address, 2.5 * precision); // rate: 250
        await otc.setBuyOffer(4, myDaiToken.address, 3 * 245 * precision, myWethToken.address, 3 * precision); // rate: 245
        await otc.setBuyOffer(5, myDaiToken.address, 2400 * precision, myWethToken.address, 10 * precision); // rate: 240

        let result = await reserve.showBestOffers(myDaiToken.address, true, 10);
        // take 3 eth from offer 4 and 7 eth from offer 5
        assert.equal(result[0].valueOf(), (3 * 245 + 240 * 7) * precision, "dest amount should be correct");
        assert.equal(result[1].valueOf(), (3 * 245 + 240 * 7), "dest amount should be correct");
        assert.equal(result[2].length, 2, "Should take only 2 offers");
        assert.equal(result[2][0].valueOf(), 4, "offer id should be correct");
        assert.equal(result[2][1].valueOf(), 5, "offer id should be correct");

        result = await reserve.showBestOffers(myDaiToken.address, true, 5);
        // take 2.5 eth from offer 3 and 2.5 eth from offer 4
        assert.equal(result[0].valueOf(), 1237.5 * precision, "dest amount should be correct");
        assert.equal(result[1].valueOf(), 1237, "dest amount should be correct");
        assert.equal(result[2].length, 2, "Should take 2 offers");
        assert.equal(result[2][0].valueOf(), 3, "offer id should be correct");
        assert.equal(result[2][1].valueOf(), 4, "offer id should be correct");
    });

    it("Should test showBestOffers takes offers with biggest previous skip (eth -> dai)", async function() {
        await otc.setBuyOffer(1, myDaiToken.address, 300 * precision, myWethToken.address, 1 * precision);// rate: 300
        await otc.setBuyOffer(2, myDaiToken.address, 1.5 * 270 * precision, myWethToken.address, 1.5 * precision);// rate: 270
        await otc.setBuyOffer(3, myDaiToken.address, 8.5 * 250 * precision, myWethToken.address, 8.5 * precision); // rate: 250
        await otc.setBuyOffer(4, myDaiToken.address, 3 * 245 * precision, myWethToken.address, 3 * precision); // rate: 245
        await otc.setBuyOffer(5, myDaiToken.address, 2400 * precision, myWethToken.address, 10 * precision); // rate: 240

        let result = await reserve.showBestOffers(myDaiToken.address, true, 10);
        // take 8.5 eth from offer 3 and 1.5 eth from offer 2
        assert.equal(result[0].valueOf(), (8.5 * 250 + 1.5 * 270) * precision, "dest amount should be correct");
        assert.equal(result[1].valueOf(), (8.5 * 250 + 1.5 * 270), "dest amount should be correct");
        assert.equal(result[2].length, 2, "Should take only 2 offers");
        assert.equal(result[2][0].valueOf(), 3, "offer id should be correct");
        assert.equal(result[2][1].valueOf(), 2, "offer id should be correct");

        // taking biggest skip but not optimal one
        // taking offer 1 and 3 should be better than taking offer 2 and 3
        result = await reserve.showBestOffers(myDaiToken.address, true, 9);
        // take 8.5 eth from offer 3 and 0.5 eth from offer 2
        assert.equal(result[0].valueOf(), (8.5 * 250 + 0.5 * 270) * precision, "dest amount should be correct");
        assert.equal(result[1].valueOf(), (8.5 * 250 + 0.5 * 270), "dest amount should be correct");
        assert.equal(result[2].length, 2, "Should take only 2 offers");
        assert.equal(result[2][0].valueOf(), 3, "offer id should be correct");
        assert.equal(result[2][1].valueOf(), 2, "offer id should be correct");
    });

    it("Should test showBestOffers not enough to take (maxTraverse reached) (eth -> dai)", async function() {
        await otc.setBuyOffer(1, myDaiToken.address, 300 * precision, myWethToken.address, 1 * precision);// rate: 300
        await otc.setBuyOffer(2, myDaiToken.address, 400 * precision, myWethToken.address, 1.5 * precision);// rate: 266.66
        await otc.setBuyOffer(3, myDaiToken.address, 1.5 * 250 * precision, myWethToken.address, 1.5 * precision); // rate: 250
        await otc.setBuyOffer(4, myDaiToken.address, 3 * 245 * precision, myWethToken.address, 3 * precision); // rate: 245
        await otc.setBuyOffer(5, myDaiToken.address, 10 * 240 * precision, myWethToken.address, 10 * precision); // rate: 240

        let result = await reserve.showBestOffers(myDaiToken.address, true, 20);
        assert.equal(result[0].valueOf(), 0, "dest amount should be correct");
        assert.equal(result[1].valueOf(), 0, "dest amount should be correct");
        assert.equal(result[2].length, 0, "not take any offer");
    });

    it("Should test showBestOffers takes maxTake offers (not enough + enough src amount) (eth -> dai)", async function() {
        await otc.setBuyOffer(1, myDaiToken.address, 300 * precision, myWethToken.address, 1 * precision);// rate: 300
        await otc.setBuyOffer(2, myDaiToken.address, 400 * precision, myWethToken.address, 1.5 * precision);// rate: 266.66
        await otc.setBuyOffer(3, myDaiToken.address, 3.5 * 250 * precision, myWethToken.address, 3.5 * precision); // rate: 250
        await otc.setBuyOffer(4, myDaiToken.address, 4 * 245 * precision, myWethToken.address, 4 * precision); // rate: 245
        await otc.setBuyOffer(5, myDaiToken.address, 10 * 240 * precision, myWethToken.address, 10 * precision); // rate: 240

        let result = await reserve.showBestOffers(myDaiToken.address, true, 18);
        assert.equal(result[0].valueOf(), 0, "dest amount should be correct");
        assert.equal(result[1].valueOf(), 0, "dest amount should be correct");
        assert.equal(result[2].length, 0, "Not take any offer");

        result = await reserve.showBestOffers(myDaiToken.address, true, 16);
        assert.equal(result[0].valueOf(), (3.5 * 250 + 4 * 245 + 8.5 * 240) * precision, "dest amount should be correct");
        assert.equal(result[1].valueOf(), 3.5 * 250 + 4 * 245 + 8.5 * 240, "dest amount should be correct");
        assert.equal(result[2].length, 3, "Still can take offers");
        assert.equal(result[2][0].valueOf(), 3, "offer id should be correct");
        assert.equal(result[2][1].valueOf(), 4, "offer id should be correct");
        assert.equal(result[2][2].valueOf(), 5, "offer id should be correct");
    });

    it("Should test showBestOffers takes all offers read (eth -> dai)", async function() {
        await otc.setBuyOffer(3, myDaiToken.address, 5 * 250 * precision, myWethToken.address, 5 * precision); // rate: 250
        await otc.setBuyOffer(4, myDaiToken.address, 4 * 245 * precision, myWethToken.address, 4 * precision); // rate: 245
        await otc.setBuyOffer(5, myDaiToken.address, 10 * 240 * precision, myWethToken.address, 10 * precision); // rate: 240

        let result = await reserve.showBestOffers(myDaiToken.address, true, 19);
        assert.equal(result[0].valueOf(), (5 * 250 + 4 * 245 + 10 * 240) * precision, "dest amount should be correct");
        assert.equal(result[1].valueOf(), 5 * 250 + 4 * 245 + 10 * 240, "dest amount should be correct");
        assert.equal(result[2].length, 3, "Still can take offers");
        assert.equal(result[2][0].valueOf(), 3, "offer id should be correct");
        assert.equal(result[2][1].valueOf(), 4, "offer id should be correct");
        assert.equal(result[2][2].valueOf(), 5, "offer id should be correct");

        result = await reserve.showBestOffers(myDaiToken.address, true, 9);
        assert.equal(result[0].valueOf(), (5 * 250 + 4 * 245) * precision, "dest amount should be correct");
        assert.equal(result[1].valueOf(), 5 * 250 + 4 * 245, "dest amount should be correct");
        assert.equal(result[2].length, 2, "Still can take offers");
        assert.equal(result[2][0].valueOf(), 3, "offer id should be correct");
        assert.equal(result[2][1].valueOf(), 4, "offer id should be correct");

        result = await reserve.showBestOffers(myDaiToken.address, true, 8);
        assert.equal(result[0].valueOf(), (5 * 250 + 3 * 245) * precision, "dest amount should be correct");
        assert.equal(result[1].valueOf(), 5 * 250 + 3 * 245, "dest amount should be correct");
        assert.equal(result[2].length, 2, "Still can take offers");
        assert.equal(result[2][0].valueOf(), 3, "offer id should be correct");
        assert.equal(result[2][1].valueOf(), 4, "offer id should be correct");
    });

    it("Should test showBestOffers not take any offers as amount is lower than minOrderSize (eth -> dai)", async function() {
        // order 10 eth, minOrderSize should be 2.6375
        await otc.setBuyOffer(3, myDaiToken.address, 2 * 250 * precision, myWethToken.address, 2 * precision); // rate: 250
        await otc.setBuyOffer(4, myDaiToken.address, 2 * 245 * precision, myWethToken.address, 2 * precision); // rate: 245
        await otc.setBuyOffer(5, myDaiToken.address, 2.2 * 240 * precision, myWethToken.address, 2.2 * precision); // rate: 240
        await otc.setBuyOffer(6, myDaiToken.address, 2.5 * 240 * precision, myWethToken.address, 2.5 * precision); // rate: 240
        await otc.setBuyOffer(7, myDaiToken.address, 2.6 * 240 * precision, myWethToken.address, 2.6 * precision); // rate: 240

        let result = await reserve.showBestOffers(myDaiToken.address, true, 10);
        assert.equal(result[0].valueOf(), 0, "dest amount should be correct");
        assert.equal(result[1].valueOf(), 0, "dest amount should be correct");
        assert.equal(result[2].length, 0, "shouldn't take any offer");
    });

    it("Should test showBestOffers takes only maxTakes (eth -> dai)", async function() {
        for(let id = 1; id <= maxTraverse; id++) {
            await otc.setBuyOffer(id, myDaiToken.address, 30 * 300 * precision, myWethToken.address, 30 * precision);// rate: 300
        }

        let result = await reserve.showBestOffers(myDaiToken.address, true, 30 * maxTake + 1);
        assert.equal(result[0].valueOf(), 0, "dest amount should be correct");
        assert.equal(result[1].valueOf(), 0, "dest amount should be correct");
        assert.equal(result[2].length, 0, "Shouldn't take any offers");

        result = await reserve.showBestOffers(myDaiToken.address, true, 30 * maxTake);
        assert.equal(result[0].valueOf(), 30 * maxTake * 300 * precision, "dest amount should be correct");
        assert.equal(result[1].valueOf(), 30 * maxTake * 300, "dest amount should be correct");
        assert.equal(result[2].length, maxTake, "Should take all maxTake offers");
        for(let id = 1; id <= maxTake; id++) {
            assert.equal(result[2][id - 1], id, "Should take correct offer's id");
        }
        await otc.resetOffersData();
    });

    it("Should test showBestOffers returns 0 when no sell or buy orders (dai -> eth)", async function() {
        let result = await reserve.showBestOffers(myDaiToken.address, false, 400);
        assert.equal(result[0].valueOf(), 0 * precision, "dest amount should be correct");
        assert.equal(result[1].valueOf(), 0, "dest amount should be correct");
        assert.equal(result[2].length, 0, "Should not take any offers");

        await otc.setBuyOffer(1, myDaiToken.address, 5 * 200 * precision, myWethToken.address, 5 * precision); // rate: 200
        result = await reserve.showBestOffers(myDaiToken.address, false, 400);
        assert.equal(result[0].valueOf(), 0 * precision, "dest amount should be correct");
        assert.equal(result[1].valueOf(), 0, "dest amount should be correct");
        assert.equal(result[2].length, 0, "Should not take any offers");

        await otc.resetOffersData();
        await otc.setSellOffer(2, myWethToken.address, 10 * precision, myDaiToken.address, 201 * 10 * precision); // rate: 201
        result = await reserve.showBestOffers(myDaiToken.address, false, 400);
        assert.equal(result[0].valueOf(), 0 * precision, "dest amount should be correct");
        assert.equal(result[1].valueOf(), 0, "dest amount should be correct");
        assert.equal(result[2].length, 0, "Should not take any offers");
    });

    it("Should test showBestOffers takes only first offer (dai -> eth)", async function() {
        // making median rate is 200
        await otc.setBuyOffer(1, myDaiToken.address, 5 * 190 * precision, myWethToken.address, 5 * precision); // rate: 190
        await otc.setSellOffer(2, myWethToken.address, 10 * precision, myDaiToken.address, 210 * 10 * precision); // rate: 210

        await otc.setSellOffer(3, myWethToken.address, 2 * precision, myDaiToken.address, 220 * 2 * precision); // rate: 220

        let result;
        result = await reserve.showBestOffers(myDaiToken.address, false, 210 * 2);
        assert.equal(result[0].valueOf(), 2 * precision, "dest amount should be correct");
        assert.equal(result[1].valueOf(), 2, "dest amount should be correct");
        assert.equal(result[2].length, 1, "Should take 1 offer");
        assert.equal(result[2][0].valueOf(), 2, "Should take correct offer's id");
    });

    it("Should test showBestOffers takes only last traverse offer (dai -> eth)", async function() {
        // making median rate is 200
        await otc.setBuyOffer(1, myDaiToken.address, 5 * 190 * precision, myWethToken.address, 5 * precision); // rate: 190
        await otc.setSellOffer(2, myWethToken.address, 1 * precision, myDaiToken.address, 210 * 1 * precision); // rate: 210

        await otc.setSellOffer(3, myWethToken.address, 3 * precision, myDaiToken.address, 220 * 3 * precision); // rate: 220

        let result;
        result = await reserve.showBestOffers(myDaiToken.address, false, 2.4 * 220);
        assert.equal(result[0].valueOf(), 2.4 * precision, "dest amount should be correct");
        assert.equal(result[1].valueOf(), 2, "dest amount should be correct"); // rounded down
        assert.equal(result[2].length, 1, "Should take 1 offer");
        assert.equal(result[2][0].valueOf(), 3, "Should take correct offer's id");
    });

    it("Should test showBestOffers takes 2 offers (dai -> eth)", async function() {
        // making median rate is 200
        await otc.setBuyOffer(1, myDaiToken.address, 5 * 190 * precision, myWethToken.address, 5 * precision); // rate: 190
        await otc.setSellOffer(2, myWethToken.address, 1 * precision, myDaiToken.address, 210 * 1 * precision); // rate: 210

        await otc.setSellOffer(3, myWethToken.address, 3 * precision, myDaiToken.address, 215 * 3 * precision); // rate: 215
        await otc.setSellOffer(4, myWethToken.address, 4 * precision, myDaiToken.address, 220 * 4 * precision); // rate: 220

        let result;
        result = await reserve.showBestOffers(myDaiToken.address, false, 3 * 215 + 2 * 220);
        // 3 eth from order 3 and 2 eth from order 4
        assert.equal(result[0].valueOf(), 5 * precision, "dest amount should be correct");
        assert.equal(result[1].valueOf(), 5, "dest amount should be correct"); // rounded down
        assert.equal(result[2].length, 2, "Should take first offer");
        assert.equal(result[2][0].valueOf(), 3, "Should take correct offer's id");
        assert.equal(result[2][1].valueOf(), 4, "Should take correct offer's id");
    });

    it("Should test showBestOffers takes biggest skip offer (dai -> eth)", async function() {
        // making median rate is 200
        await otc.setBuyOffer(1, myDaiToken.address, 5 * 190 * precision, myWethToken.address, 5 * precision); // rate: 190
        await otc.setSellOffer(2, myWethToken.address, 1 * precision, myDaiToken.address, 210 * 1 * precision); // rate: 210
        await otc.setSellOffer(3, myWethToken.address, 2 * precision, myDaiToken.address, 212 * 2 * precision); // rate: 212

        await otc.setSellOffer(4, myWethToken.address, 3 * precision, myDaiToken.address, 216 * 3 * precision); // rate: 216
        await otc.setSellOffer(5, myWethToken.address, 4 * precision, myDaiToken.address, 220 * 4 * precision); // rate: 220

        let result;
        result = await reserve.showBestOffers(myDaiToken.address, false, 3 * 216 + 1.5 * 212);
        // 3 eth from order 4 and 1.5 eth from order 2
        assert.equal(result[0].valueOf(), 4.5 * precision, "dest amount should be correct");
        assert.equal(result[1].valueOf(), 4, "dest amount should be correct"); // rounded down
        assert.equal(result[2].length, 2, "Should take first offer");
        assert.equal(result[2][0].valueOf(), 4, "Should take correct offer's id");
        assert.equal(result[2][1].valueOf(), 3, "Should take correct offer's id");

        // taking biggest skip but not optimal
        result = await reserve.showBestOffers(myDaiToken.address, false, 3 * 216 + 1 * 212);
        // 3 eth from order 4 and 1 eth from order 2
        // actually should take 3 eth from order 4 and 212/210 eth from order 1
        assert.equal(result[0].valueOf(), 4 * precision, "dest amount should be correct");
        assert.equal(result[1].valueOf(), 4, "dest amount should be correct"); // rounded down
        assert.equal(result[2].length, 2, "Should take first offer");
        assert.equal(result[2][0].valueOf(), 4, "Should take correct offer's id");
        assert.equal(result[2][1].valueOf(), 3, "Should take correct offer's id");
    });

    it("Should test showBestOffers not enough to take (maxTraverse reached) (dai -> eth)", async function() {
        // making median rate is 200
        await otc.setBuyOffer(1, myDaiToken.address, 5 * 190 * precision, myWethToken.address, 5 * precision); // rate: 190
        await otc.setSellOffer(2, myWethToken.address, 1 * precision, myDaiToken.address, 210 * 1 * precision); // rate: 210
        await otc.setSellOffer(3, myWethToken.address, 2 * precision, myDaiToken.address, 212 * 2 * precision); // rate: 212

        await otc.setSellOffer(4, myWethToken.address, 10 * precision, myDaiToken.address, 216 * 10 * precision); // rate: 216
        await otc.setSellOffer(5, myWethToken.address, 1 * precision, myDaiToken.address, 220 * 1 * precision); // rate: 220

        let result;
        result = await reserve.showBestOffers(myDaiToken.address, false, 20 * 200);
        assert.equal(result[0].valueOf(), 0, "dest amount should be correct");
        assert.equal(result[1].valueOf(), 0, "dest amount should be correct");
        assert.equal(result[2].length, 0, "Shouldn't take any offers");
    });

    it("Should test showBestOffers takes maxTakes (not enough and enough src amount) (dai -> eth)", async function() {
        // making median rate is 200
        await otc.setBuyOffer(1, myDaiToken.address, 5 * 190 * precision, myWethToken.address, 5 * precision); // rate: 190
        await otc.setSellOffer(2, myWethToken.address, 1 * precision, myDaiToken.address, 210 * 1 * precision); // rate: 210
        await otc.setSellOffer(3, myWethToken.address, 4 * precision, myDaiToken.address, 212 * 4 * precision); // rate: 212

        await otc.setSellOffer(4, myWethToken.address, 4 * precision, myDaiToken.address, 216 * 4 * precision); // rate: 216
        await otc.setSellOffer(5, myWethToken.address, 1 * precision, myDaiToken.address, 220 * 1 * precision); // rate: 220

        let result;
        // not enough src amount to take
        result = await reserve.showBestOffers(myDaiToken.address, false, 10 * 200);
        assert.equal(result[0].valueOf(), 0, "dest amount should be correct");
        assert.equal(result[1].valueOf(), 0, "dest amount should be correct");
        assert.equal(result[2].length, 0, "Shouldn't take first offer");

        // enough src amount to take
        result = await reserve.showBestOffers(myDaiToken.address, false, 4 * 212 + 3 * 216);
        assert.equal(result[0].valueOf(), 7 * precision, "dest amount should be correct");
        assert.equal(result[1].valueOf(), 7, "dest amount should be correct"); 
        assert.equal(result[2].length, 2, "Should take 2 offers");
        assert.equal(result[2][0].valueOf(), 3, "Should take correct offer's id");
        assert.equal(result[2][1].valueOf(), 4, "Should take correct offer's id");
    });

    it("Should test showBestOffers takes all offers read (dai -> eth)", async function() {
        // making median rate is 200
        await otc.setBuyOffer(1, myDaiToken.address, 5 * 190 * precision, myWethToken.address, 5 * precision); // rate: 190
        await otc.setSellOffer(2, myWethToken.address, 7 * precision, myDaiToken.address, 210 * 7 * precision); // rate: 210
        await otc.setSellOffer(3, myWethToken.address, 6 * precision, myDaiToken.address, 212 * 6 * precision); // rate: 212

        await otc.setSellOffer(4, myWethToken.address, 10 * precision, myDaiToken.address, 216 * 10 * precision); // rate: 216
        await otc.setSellOffer(5, myWethToken.address, 4 * precision, myDaiToken.address, 220 * 4 * precision); // rate: 220

        let result;
        result = await reserve.showBestOffers(myDaiToken.address, false, 7 * 210 + 4 * 212);
        assert.equal(result[0].valueOf(), 11 * precision, "dest amount should be correct");
        assert.equal(result[1].valueOf(), 11, "dest amount should be correct");
        assert.equal(result[2].length, 2, "Should take 2 offers");
        assert.equal(result[2][0].valueOf(), 2, "Should take correct offer's id");
        assert.equal(result[2][1].valueOf(), 3, "Should take correct offer's id");

        result = await reserve.showBestOffers(myDaiToken.address, false, 7 * 210 + 6 * 212 + 10 * 216);
        assert.equal(result[0].valueOf(), 23 * precision, "dest amount should be correct");
        assert.equal(result[1].valueOf(), 23, "dest amount should be correct");
        assert.equal(result[2].length, 3, "Should take 3 offers");
        assert.equal(result[2][0].valueOf(), 2, "Should take correct offer's id");
        assert.equal(result[2][1].valueOf(), 3, "Should take correct offer's id");
        assert.equal(result[2][2].valueOf(), 4, "Should take correct offer's id");
    });

    it("Should test showBestOffers not take any offers as amount is lower than minOrderSize (dai -> eth)", async function() {
        // making median rate is 200
        await otc.setBuyOffer(1, myDaiToken.address, 5 * 190 * precision, myWethToken.address, 5 * precision); // rate: 190
        await otc.setSellOffer(2, myWethToken.address, 1 * precision, myDaiToken.address, 210 * 2 * precision); // rate: 210
        await otc.setSellOffer(3, myWethToken.address, 1 * precision, myDaiToken.address, 212 * 2 * precision); // rate: 212

        await otc.setSellOffer(4, myWethToken.address, 2.5 * precision, myDaiToken.address, 216 * 2.5 * precision); // rate: 216
        await otc.setSellOffer(5, myWethToken.address, 2.6 * precision, myDaiToken.address, 220 * 2.6 * precision); // rate: 220
        await otc.setSellOffer(6, myWethToken.address, 2.6 * precision, myDaiToken.address, 225 * 2.6 * precision); // rate: 225
        await otc.setSellOffer(7, myWethToken.address, 10 * precision, myDaiToken.address, 230 * 10 * precision); // rate: 230

        let result;
        // equivalent eth: 10, min order size: 2.6375, max traverse: 5
        result = await reserve.showBestOffers(myDaiToken.address, false, 10 * 200);
        assert.equal(result[0].valueOf(), 0, "dest amount should be correct");
        assert.equal(result[1].valueOf(), 0, "dest amount should be correct");
        assert.equal(result[2].length, 0, "Shouldn't take any offers");
    });

    it("Should test showBestOffers traverse only maxTraverse offer (dai -> eth)", async function() {
        await otc.setBuyOffer(1, myDaiToken.address, 1 * 190 * precision, myWethToken.address, 1 * precision); // rate: 190
        for(let id = 1; id <= maxTraverse; id++) {
            await otc.setSellOffer(id + 1, myWethToken.address, 1 * precision, myDaiToken.address, 210 * 1 * precision); // rate: 210
        }
        await otc.setSellOffer(maxTraverse + 2, myWethToken.address, 400 * precision, myDaiToken.address, 220 * 400 * precision); // rate: 220

        let result = await reserve.showBestOffers(myDaiToken.address, false, 400 * 220);
        assert.equal(result[0].valueOf(), 0, "dest amount should be correct");
        assert.equal(result[1].valueOf(), 0, "dest amount should be correct");
        assert.equal(result[2].length, 0, "Shouldn't take any offers");

        await otc.resetOffersData();
        await otc.setBuyOffer(1, myDaiToken.address, 1 * 190 * precision, myWethToken.address, 5 * precision); // rate: 190
        for(let id = 1; id < maxTraverse; id++) {
            await otc.setSellOffer(id + 1, myWethToken.address, 1 * precision, myDaiToken.address, 210 * 1 * precision); // rate: 210
        }
        await otc.setSellOffer(maxTraverse + 1, myWethToken.address, 400 * precision, myDaiToken.address, 220 * 400 * precision); // rate: 220

        result = await reserve.showBestOffers(myDaiToken.address, false, 400 * 220);
        assert.equal(result[0].valueOf(), 400 * precision, "dest amount should be correct");
        assert.equal(result[1].valueOf(), 400, "dest amount should be correct");
        assert.equal(result[2].length, 1, "Should take last offer");
        assert.equal(result[2][0], maxTraverse + 1, "Should take last offer");
    });

    it("Should test showBestOffers takes only maxTakes offers (dai -> eth)", async function() {
        await otc.setBuyOffer(1, myDaiToken.address, 1 * 190 * precision, myWethToken.address, 1 * precision); // rate: 190
        for(let id = 1; id <= maxTraverse; id++) {
            await otc.setSellOffer(id + 1, myWethToken.address, 30 * precision, myDaiToken.address, 210 * 30 * precision); // rate: 210
        }

        let result = await reserve.showBestOffers(myDaiToken.address, false, 30 * maxTake * 210 + 1);
        assert.equal(result[0].valueOf(), 0, "dest amount should be correct");
        assert.equal(result[1].valueOf(), 0, "dest amount should be correct");
        assert.equal(result[2].length, 0, "Shouldn't take any offers");

        result = await reserve.showBestOffers(myDaiToken.address, false, 30 * maxTake * 210);
        assert.equal(result[0].valueOf(), 30 * maxTake * precision, "dest amount should be correct");
        assert.equal(result[1].valueOf(), 30 * maxTake, "dest amount should be correct");
        assert.equal(result[2].length, maxTake, "Should take correct number offers");
        for(let id = 1; id <= maxTake; id++) {
            assert.equal(result[2][id - 1], id + 1, "Should take correct offer's id");
        }

        await otc.resetOffersData();
    });

    // test init reserve contract
    it("Should test can not init reserve contract with invalid arguments", async function() {
        try {
            _ = await Eth2DaiReserve.new(0, feeBps.valueOf(), otc.address, myWethToken.address, admin);
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
        try {
            _ = await Eth2DaiReserve.new(network, 10000, otc.address, myWethToken.address, admin);
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
        try {
            _ = await Eth2DaiReserve.new(network, feeBps.valueOf(), 0, myWethToken.address, admin);
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
        try {
            _ = await Eth2DaiReserve.new(network, feeBps.valueOf(), otc.address, 0, admin);
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
        try {
            _ = await Eth2DaiReserve.new(network, feeBps.valueOf(), otc.address, myWethToken.address, 0);
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
        _ = await Eth2DaiReserve.new(network, feeBps.valueOf(), otc.address, myWethToken.address, admin);
    });

    it("Should test can not list empty token", async function() {
        try {
            await reserve.listToken(0);
            assert(false, "throw was expected in line above.")
        } catch(e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("Should test can not list token if it is already listed", async function() {
        let newToken = await TestToken.new("test token", "test", 18);
        await reserve.listToken(newToken.address);
        try {
            await reserve.listToken(newToken.address);
            assert(false, "throw was expected in line above.")
        } catch(e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
        await reserve.delistToken(newToken.address);
    });

    it("Should test can not list token with decimals is not 18", async function() {
        let newToken = await TestToken.new("test token", "test", 10);
        try {
            await reserve.listToken(newToken.address);
            assert(false, "throw was expected in line above.")
        } catch(e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("Should test can not delist token if it not listed", async function() {
        let newToken = await TestToken.new("test token", "test", 18);
        try {
            await reserve.delistToken(newToken.address);
            assert(false, "throw was expected in line above.")
        } catch(e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
        await reserve.listToken(newToken.address);
        await reserve.delistToken(newToken.address);
    });

    it("Should test can not set fee of 10000", async function() {
        await reserve.setFeeBps(feeBps);
        try {
            await reserve.setFeeBps(10000);
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("Should test can not set token info for token that is not listed", async function() {
        let newToken = await TestToken.new("test token", "test", 18);
        try {
            await reserve.setTokenConfigData(
                newToken.address,
                maxTraverse, maxTraverseX, maxTraverseY,
                maxTake, maxTakeX, maxTakeY,
                minSupportX, minSupportY, minSupport
            )
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
        await reserve.listToken(newToken.address);
        await reserve.setTokenConfigData(
            newToken.address,
            maxTraverse, maxTraverseX, maxTraverseY,
            maxTake, maxTakeX, maxTakeY,
            minSupportX, minSupportY, minSupport
        )
        await reserve.delistToken(newToken.address);
    });

    it("Should test can not set token info with amount overflows", async function() {
        let bigNumber32 = (new BigNumber(2)).pow(32);
        let bigNumber96 = (new BigNumber(2)).pow(96);
        try {
            await reserve.setTokenConfigData(
                myDaiToken.address,
                bigNumber32, maxTraverseX, maxTraverseY,
                maxTake, maxTakeX, maxTakeY,
                minSupportX, minSupportY, minSupport
            )
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await reserve.setTokenConfigData(
                myDaiToken.address,
                maxTraverse, bigNumber32, maxTraverseY,
                maxTake, maxTakeX, maxTakeY,
                minSupportX, minSupportY, minSupport
            )
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await reserve.setTokenConfigData(
                myDaiToken.address,
                maxTraverse, maxTraverseX, bigNumber32,
                maxTake, maxTakeX, maxTakeY,
                minSupportX, minSupportY, minSupport
            )
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await reserve.setTokenConfigData(
                myDaiToken.address,
                maxTraverse, maxTraverseX, maxTraverseY,
                bigNumber32, maxTakeX, maxTakeY,
                minSupportX, minSupportY, minSupport
            )
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await reserve.setTokenConfigData(
                myDaiToken.address,
                maxTraverse, maxTraverseX, maxTraverseY,
                maxTake, bigNumber32, maxTakeY,
                minSupportX, minSupportY, minSupport
            )
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await reserve.setTokenConfigData(
                myDaiToken.address,
                maxTraverse, maxTraverseX, maxTraverseY,
                maxTake, maxTakeX, bigNumber32,
                minSupportX, minSupportY, minSupport
            )
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await reserve.setTokenConfigData(
                myDaiToken.address,
                maxTraverse, maxTraverseX, maxTraverseY,
                maxTake, maxTakeX, maxTakeY,
                bigNumber32, minSupportY, minSupport
            )
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await reserve.setTokenConfigData(
                myDaiToken.address,
                maxTraverse, maxTraverseX, maxTraverseY,
                maxTake, maxTakeX, maxTakeY,
                minSupportX, bigNumber32, minSupport
            )
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        bigNumber32 = bigNumber32.sub(1);
        bigNumber96 = bigNumber96.sub(1);

        await reserve.setTokenConfigData(
            myDaiToken.address,
            bigNumber32, bigNumber32, bigNumber32,
            bigNumber32, bigNumber32, bigNumber32,
            bigNumber32, bigNumber32, bigNumber96
        )

        await reserve.setTokenConfigData(
            myDaiToken.address,
            maxTraverse, maxTraverseX, maxTraverseY,
            maxTake, maxTakeX, maxTakeY,
            minSupportX, minSupportY, minSupport
        )
    });

    // test setting contracts
    it("Should test can not set contracts with invalid network or otc", async function() {
        try {
            await reserve.setContracts(0, otc.address);
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
        try {
            await reserve.setContracts(network, 0);
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
        try {
            await reserve.setContracts(0, 0);
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
        await reserve.setContracts(network, otc.address);
    });

    it("Should test set internal inventory enable", async function() {
        let token = await TestToken.new("test token", "tst", 18);

        // failed token is not listed
        try {
            await reserve.setInternalInventoryEnable(token.address, true, {from: admin});
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        // failed alread disabled
        try {
            await reserve.setInternalInventoryEnable(myDaiToken.address, false, {from: admin});
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        // success enable
        await reserve.setInternalInventoryEnable(myDaiToken.address, true, {from: admin});

        // failed to enable again
        try {
            await reserve.setInternalInventoryEnable(myDaiToken.address, true, {from: admin});
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        // success disable
        await reserve.setInternalInventoryEnable(myDaiToken.address, false, {from: admin});
    });

    it("Should test trade with trade is not enable", async function() {
        // making median rate is 200
        await otc.setBuyOffer(1, myDaiToken.address, 20 * 190 * precision, myWethToken.address, 20 * precision); // rate: 190
        await otc.setSellOffer(2, myWethToken.address, 20 * precision, myDaiToken.address, 210 * 20 * precision); // rate: 210

        let amountEth = (new BigNumber(10)).pow(18);
        let amountDai = (new BigNumber(10)).pow(18).mul(200);
        let eth2daiRate = await reserve.getConversionRate(ethAddress, myDaiToken.address, amountEth, 0);
        let dai2ethRate = await reserve.getConversionRate(myDaiToken.address, ethAddress, amountDai, 0);

        assert.notEqual(eth2daiRate.valueOf(), 0, "should have rate eth to dai");
        assert.notEqual(dai2ethRate.valueOf(), 0, "should have rate dai to eth");

        await reserve.disableTrade({from: alerter});
        try {
            await reserve.trade(ethAddress, amountEth, myDaiToken.address, user, eth2daiRate, true, {from: network, value: amountEth});
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await reserve.trade(myDaiToken.address, amountDai, ethAddress, user, dai2ethRate, true, {from: network});
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        await reserve.enableTrade({from: admin});
    });

    it("Should test trade msg sender is not network", async function() {
        // making median rate is 200
        await otc.setBuyOffer(1, myDaiToken.address, 20 * 190 * precision, myWethToken.address, 20 * precision); // rate: 190
        await otc.setSellOffer(2, myWethToken.address, 20 * precision, myDaiToken.address, 210 * 20 * precision); // rate: 210

        let amountEth = (new BigNumber(10)).pow(18);
        let amountDai = (new BigNumber(10)).pow(18).mul(200);
        let eth2daiRate = await reserve.getConversionRate(ethAddress, myDaiToken.address, amountEth, 0);
        let dai2ethRate = await reserve.getConversionRate(myDaiToken.address, ethAddress, amountDai, 0);

        try {
            await reserve.trade(ethAddress, amountEth, myDaiToken.address, user, eth2daiRate, true, {from: accounts[1], value: amountEth});
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await reserve.trade(myDaiToken.address, amountDai, ethAddress, user, dai2ethRate, true, {from: accounts[1]});
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("Should test trade token is invalid (src & dest are not ETH or token is not listed)", async function() {
        // making median rate is 200
        await otc.setBuyOffer(1, myDaiToken.address, 20 * 190 * precision, myWethToken.address, 20 * precision); // rate: 190
        await otc.setSellOffer(2, myWethToken.address, 20 * precision, myDaiToken.address, 210 * 20 * precision); // rate: 210

        let amountEth = (new BigNumber(10)).pow(18);
        let amountDai = (new BigNumber(10)).pow(18).mul(200);

        let eth2daiRate = await reserve.getConversionRate(ethAddress, myDaiToken.address, amountEth, 0);
        let dai2ethRate = await reserve.getConversionRate(myDaiToken.address, ethAddress, amountDai, 0);

        let token = await TestToken.new("test token", "tst", 18);
        await token.transfer(user, (new BigNumber(2)).pow(18).mul(1000));
        try {
            await reserve.trade(token.address, amountEth, myDaiToken.address, user, eth2daiRate, true, {from: network});
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await reserve.trade(myDaiToken.address, amountDai, token.address, user, dai2ethRate, true, {from: network});
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await reserve.trade(ethAddress, amountEth, token.address, user, eth2daiRate, true, {from: network, value: amountEth});
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await reserve.trade(token.address, amountDai, ethAddress, user, dai2ethRate, true, {from: network});
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("Should test trade msg value and src amount are not correct", async function() {
        // making median rate is 200
        await otc.setBuyOffer(1, myDaiToken.address, 20 * 190 * precision, myWethToken.address, 20 * precision); // rate: 190
        await otc.setSellOffer(2, myWethToken.address, 20 * precision, myDaiToken.address, 210 * 20 * precision); // rate: 210

        let amountEth = (new BigNumber(10)).pow(18);
        let amountDai = (new BigNumber(10)).pow(18).mul(200);
        let eth2daiRate = await reserve.getConversionRate(ethAddress, myDaiToken.address, amountEth, 0);
        let dai2ethRate = await reserve.getConversionRate(myDaiToken.address, ethAddress, amountDai, 0);

        try {
            await reserve.trade(ethAddress, amountEth, myDaiToken.address, user, eth2daiRate, false, {from: network, value: 0});
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await reserve.trade(ethAddress, amountEth, myDaiToken.address, user, eth2daiRate, false, {from: network, value: amountEth.sub(10)});
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await reserve.trade(myDaiToken.address, amountDai, ethAddress, user, dai2ethRate, false, {from: network, value: 1});
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("Should test trade conversion rate is 0", async function() {
        // making median rate is 200
        await otc.setBuyOffer(1, myDaiToken.address, 20 * 190 * precision, myWethToken.address, 20 * precision); // rate: 190
        await otc.setSellOffer(2, myWethToken.address, 20 * precision, myDaiToken.address, 210 * 20 * precision); // rate: 210

        let amountEth = (new BigNumber(10)).pow(18);
        let amountDai = (new BigNumber(10)).pow(18).mul(200);

        try {
            await reserve.trade(ethAddress, amountEth, myDaiToken.address, user, 0, false, {from: network, value: amountEth});
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            // bypass validating but user expected amount is still 0
            await reserve.trade(ethAddress, amountEth, myDaiToken.address, user, 0, true, {from: network, value: amountEth});
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await reserve.trade(myDaiToken.address, amountDai, ethAddress, user, 0, false, {from: network});
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            // bypass validating but user expected amount is still 0
            await reserve.trade(myDaiToken.address, amountDai, ethAddress, user, 0, true, {from: network});
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("Should test trade is reverted when conversion rate is higher than actual rate", async function() {
        // making median rate is 200
        await otc.setBuyOffer(1, myDaiToken.address, 20 * 190 * precision, myWethToken.address, 20 * precision); // rate: 190
        await otc.setSellOffer(2, myWethToken.address, 20 * precision, myDaiToken.address, 210 * 20 * precision); // rate: 210

        let amountEth = (new BigNumber(1)).mul(precision);
        let amountDai = (new BigNumber(200)).mul(precision);

        await reserve.setFeeBps(0);

        let eth2daiRate = await reserve.getConversionRate(ethAddress, myDaiToken.address, amountEth, 0);
        let dai2ethRate = await reserve.getConversionRate(myDaiToken.address, ethAddress, amountDai, 0);

        try {
            await reserve.trade(ethAddress, amountEth, myDaiToken.address, user, eth2daiRate.add(2), true, {from: network, value: amountEth});
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await reserve.trade(myDaiToken.address, amountDai, ethAddress, user, dai2ethRate.add(2), true, {from: network});
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        await reserve.trade(ethAddress, amountEth, myDaiToken.address, user, eth2daiRate, true, {from: network, value: amountEth});
        await reserve.trade(myDaiToken.address, amountDai, ethAddress, user, dai2ethRate, true, {from: network});
        await reserve.setFeeBps(feeBps);
    });

    it("Should test trade is reverted conversion rate enables internal inventory but not have enough balances for internal inventory", async function() {
        // making median rate is 200
        await otc.setBuyOffer(1, myDaiToken.address, 20 * 190 * precision, myWethToken.address, 20 * precision); // rate: 190
        await otc.setSellOffer(2, myWethToken.address, 20 * precision, myDaiToken.address, 210 * 20 * precision); // rate: 210

        let amountEth = (new BigNumber(1)).mul(precision);
        let amountDai = (new BigNumber(200)).mul(precision);

        let eth2daiRate = await reserve.getConversionRate(ethAddress, myDaiToken.address, amountEth, 0);
        let dai2ethRate = await reserve.getConversionRate(myDaiToken.address, ethAddress, amountDai, 0);

        try {
            await reserve.trade(ethAddress, amountEth, myDaiToken.address, user, eth2daiRate.sub(1), true, {from: network, value: amountEth});
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await reserve.trade(myDaiToken.address, amountDai, ethAddress, user, dai2ethRate.sub(1), true, {from: network});
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("Should test trade is reverted conversion rate > 0 but actual rate is 0", async function() {
        let amountEth = (new BigNumber(1)).mul(precision);
        let amountDai = (new BigNumber(200)).mul(precision);

        await otc.resetOffersData();
        let eth2daiRate = await reserve.getConversionRate(ethAddress, myDaiToken.address, amountEth, 0);
        let dai2ethRate = await reserve.getConversionRate(myDaiToken.address, ethAddress, amountDai, 0);
        assert.equal(eth2daiRate.valueOf(), 0, "eth to dai rate should be 0");
        assert.equal(dai2ethRate.valueOf(), 0, "eth to dai rate should be 0");

        try {
            await reserve.trade(ethAddress, amountEth, myDaiToken.address, user, (new BigNumber(10)).pow(18).mul(200), true, {from: network, value: amountEth});
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await reserve.trade(myDaiToken.address, amountDai, ethAddress, user, (new BigNumber(10)).pow(18).div(200).floor(), true, {from: network});
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        await otc.setSellOffer(2, myWethToken.address, 20 * precision, myDaiToken.address, 210 * 20 * precision); // rate: 210
        // not have buy offer, dai -> eth should be still failed
        dai2ethRate = await reserve.getConversionRate(myDaiToken.address, ethAddress, amountDai, 0);
        assert.equal(dai2ethRate.valueOf(), 0, "eth to dai rate should be 0");
        try {
            await reserve.trade(myDaiToken.address, amountDai, ethAddress, user, (new BigNumber(10)).pow(18).div(200).floor(), true, {from: network});
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        await otc.setBuyOffer(1, myDaiToken.address, 20 * 220 * precision, myWethToken.address, 20 * precision); // rate: 220
        // slippage is not ok, dai -> eth should be still fail
        dai2ethRate = await reserve.getConversionRate(myDaiToken.address, ethAddress, amountDai, 0);
        assert.equal(dai2ethRate.valueOf(), 0, "eth to dai rate should be 0");
        try {
            await reserve.trade(myDaiToken.address, amountDai, ethAddress, user, (new BigNumber(10)).pow(18).div(200).floor(), true, {from: network});
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
        await otc.resetOffersData();
        // making median rate is 200
        await otc.setBuyOffer(1, myDaiToken.address, 20 * 190 * precision, myWethToken.address, 20 * precision); // rate: 190
        await otc.setSellOffer(2, myWethToken.address, 20 * precision, myDaiToken.address, 210 * 20 * precision); // rate: 210

        amountEth = (new BigNumber(21)).mul(precision);
        amountDai = (new BigNumber(21)).mul(precision).mul(220);

        try {
            await reserve.trade(ethAddress, amountEth, myDaiToken.address, user, (new BigNumber(10)).pow(18).mul(200), true, {from: network, value: amountEth});
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
        try {
            await reserve.trade(myDaiToken.address, amountDai, ethAddress, user, (new BigNumber(10)).pow(18).div(200).floor(), true, {from: network});
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("Should test buy and sell with correct balance", async function() {
        // making median rate is 200
        await otc.setBuyOffer(1, myDaiToken.address, 20 * 190 * precision, myWethToken.address, 20 * precision); // rate: 190
        await otc.setSellOffer(2, myWethToken.address, 20 * precision, myDaiToken.address, 210 * 20 * precision); // rate: 210

        let amountEth = (new BigNumber(1)).mul(precision);
        let amountDai = (new BigNumber(200)).mul(precision);

        await Helper.sendEtherWithPromise(user, network, amountEth);
        await myDaiToken.transfer(network, amountDai);

        let expectedUserETHBal = await Helper.getBalancePromise(user);
        let expectedUserDaiBal = await myDaiToken.balanceOf(user);

        let eth2daiRate = await reserve.getConversionRate(ethAddress, myDaiToken.address, amountEth, 0);
        let dai2ethRate = await reserve.getConversionRate(myDaiToken.address, ethAddress, amountDai, 0);

        await reserve.trade(ethAddress, amountEth, myDaiToken.address, user, eth2daiRate, true, {from: network, value: amountEth});
        expectedUserDaiBal = expectedUserDaiBal.add(calcDstQty(amountEth, 18, 18, eth2daiRate));

        let newUserEthBal = await Helper.getBalancePromise(user);
        let newUserDaiBal = await myDaiToken.balanceOf(user);

        assert.equal(expectedUserETHBal.valueOf(), newUserEthBal.valueOf(), "eth balance should be correct after traded");
        assert.equal(expectedUserDaiBal.valueOf(), newUserDaiBal.valueOf(), "dai balance should be correct after traded");

        await reserve.trade(myDaiToken.address, amountDai, ethAddress, user, dai2ethRate, true, {from: network});
        expectedUserETHBal = expectedUserETHBal.add(calcDstQty(amountDai, 18, 18, dai2ethRate));

        newUserEthBal = await Helper.getBalancePromise(user);
        newUserDaiBal = await myDaiToken.balanceOf(user);

        assert.equal(expectedUserDaiBal.valueOf(), newUserDaiBal.valueOf(), "dai balance should be correct after traded");
        assert.equal(expectedUserETHBal.valueOf(), newUserEthBal.valueOf(), "eth balance should be correct after traded");
    });

    it("Should test few buy & sell trades", async function() {
        await otc.resetOffersData();
        await otc.setBuyOffer(1, myDaiToken.address, 2 * 190 * precision, myWethToken.address, 2 * precision);
        await otc.setBuyOffer(2, myDaiToken.address, 4 * 188 * precision, myWethToken.address, 4 * precision);
        await otc.setBuyOffer(3, myDaiToken.address, 6 * 185 * precision, myWethToken.address, 6 * precision);
        await otc.setBuyOffer(4, myDaiToken.address, 8 * 180 * precision, myWethToken.address, 8 * precision);
        await otc.setBuyOffer(5, myDaiToken.address, 12 * 178 * precision, myWethToken.address, 12 * precision);

        await otc.setSellOffer(6, myWethToken.address, 2 * precision, myDaiToken.address, 210 * 2 * precision);
        await otc.setSellOffer(7, myWethToken.address, 3 * precision, myDaiToken.address, 212 * 3 * precision);
        await otc.setSellOffer(8, myWethToken.address, 4 * precision, myDaiToken.address, 216 * 4 * precision);
        await otc.setSellOffer(9, myWethToken.address, 5 * precision, myDaiToken.address, 220 * 5 * precision);
        await otc.setSellOffer(10, myWethToken.address, 12 * precision, myDaiToken.address, 225 * 12 * precision);

        for(let i = 1; i <= 10; i++) {
            let amountEth = (new BigNumber(i)).mul(precision).mul(1.5).floor();
            let eth2daiRate = await reserve.getConversionRate(ethAddress, myDaiToken.address, amountEth, 0);
            assert.notEqual(eth2daiRate.valueOf(), 0, "rate eth -> dai shouldn't be 0");
            await reserve.trade(ethAddress, amountEth, myDaiToken.address, user, eth2daiRate, true, {from: network, value: amountEth});
            let amountDai = (new BigNumber(i)).mul(precision).mul(200 + i * 2).mul(1.5).floor();
            let dai2ethRate = await reserve.getConversionRate(myDaiToken.address, ethAddress, amountDai, 0);
            assert.notEqual(dai2ethRate.valueOf(), 0, "rate dai -> eth shouldn't be 0");
            await reserve.trade(myDaiToken.address, amountDai, ethAddress, user, dai2ethRate, true, {from: network});
        }
    });
  });
  
function addBps(price, bps) {
    return price.mul(10000 + bps).div(10000).floor();
};

function applyInternalInventory(rate, useInternalInventory) {
    return rate.modulo(2) == (useInternalInventory ? 1 : 0)
    ? rate
    : rate.sub(1);
}

function calcDstQty(srcQty, srcDecimals, dstDecimals, rate) {
    rate = new BigNumber(rate);
    if (dstDecimals >= srcDecimals) {
        let decimalDiff = (new BigNumber(10)).pow(dstDecimals - srcDecimals);
        return (rate.mul(srcQty).mul(decimalDiff).div(precision)).floor();
    } else {
        let decimalDiff = (new BigNumber(10)).pow(srcDecimals - dstDecimals);
        return (rate.mul(srcQty).div(decimalDiff.mul(precision))).floor();
    }
}