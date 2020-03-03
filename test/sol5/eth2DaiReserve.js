const TestToken = artifacts.require("Token.sol");
const WethToken = artifacts.require("WethToken.sol");
const MockOtcOrderbook = artifacts.require("MockOtcOrderbook.sol");
const Eth2DaiReserve = artifacts.require("Eth2DaiReserve.sol");
const Helper = require("../helper.js");

const BN = web3.utils.BN;

const zeroBN = new BN(0);
const daiTokenInewi = (new BN(10).pow(new BN(18)));
const tokenDecimals = new BN(18);

const precision = (new BN(10).pow(new BN(18)));
const max_rate = (precision.mul(new BN(10 ** 6))); //internal parameter in Utils.sol
const ethAddress = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
const zeroAddress = '0x0000000000000000000000000000000000000000';
const feeBps = new BN(25);

const initOTCDaiBalance = daiTokenInewi.mul(new BN(2000000));
const initOTCWethBalance = daiTokenInewi.mul(new BN(1000));

const minDaiBal  = daiTokenInewi.mul(new BN(1000));
const maxDaiBal  = daiTokenInewi.mul(new BN(10000));
const initDaiBal = daiTokenInewi.mul(new BN(5000));
const minSpreadInBps = new BN(20);
const pricePremiumBps = 10;

const maxTraverse = new BN(20);
const maxTraverseX = new BN(4160);
const maxTraverseY = new BN(493146);
const maxTake = new BN(10);
const maxTakeX = new BN(2560);
const maxTakeY = new BN(260431);
const minSupport = (new BN(10)).pow(new BN(17)); // 0.1 ether
const minSupportX = new BN(7000);
const minSupportY = new BN(193750);

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
        admin = accounts[6];
        network = accounts[1];
        alerter = accounts[2];
        operator = accounts[3];
        user = accounts[4];

        myWethToken = await WethToken.new("my weth token", "weth", 18);
        myDaiToken = await TestToken.new("my dai token", "dai", 18);
        otc = await MockOtcOrderbook.new(myWethToken.address, myDaiToken.address);
        reserve = await Eth2DaiReserve.new(network, feeBps, otc.address, myWethToken.address, admin);

        await reserve.listToken(myDaiToken.address, {from: admin});
        await reserve.setTokenConfigData(
            myDaiToken.address,
            maxTraverse, maxTraverseX, maxTraverseY,
            maxTake, maxTakeX, maxTakeY,
            minSupportX, minSupportY, minSupport,
            {from: admin}
        )
        reserve.addAlerter(alerter, {from: admin});
        reserve.addOperator(operator, {from: admin});

        await myDaiToken.approve(reserve.address, (new BN(2)).pow(new BN(255)), {from: network});
    });

    beforeEach("running before each test", async() => {
        // reset otc data
        await otc.resetOffersData();
    });

    it("Test transfer tokens to otc, reserve and user", async function() {
        // transfer weth and dai to contracts
        await myWethToken.transfer(otc.address, initOTCWethBalance);

        let balance = await myWethToken.balanceOf(otc.address);
        Helper.assertEqual(balance, initOTCWethBalance, "init balance weth is not correct");
        await myDaiToken.transfer(otc.address, initOTCDaiBalance);
        balance = await myDaiToken.balanceOf(otc.address);
        Helper.assertEqual(balance, initOTCDaiBalance, "init balance weth is not correct");

        // transfer 1000k DAI to users
        await myDaiToken.transfer(user, (daiTokenInewi.mul(new BN(1000000))));
    });

    it("Should check correct token data", async function() {
        let a;
        // min eth support, max traverse, max take
        a = await reserve.getTokenBasicDataPub(myDaiToken.address);
        Helper.assertEqual(a[0], minSupport, "min eth support is not correct");
        Helper.assertEqual(a[1], maxTraverse, "max traverse is not correct");
        Helper.assertEqual(a[2], maxTake, "max takes is not correct");
        a = await reserve.getFactorDataPub(myDaiToken.address);
        Helper.assertEqual(a[0], maxTraverseX, "max traverse x is not correct");
        Helper.assertEqual(a[1], maxTraverseY, "max traverse y is not correct");
        Helper.assertEqual(a[2], maxTakeX, "max take x is not correct");
        Helper.assertEqual(a[3], maxTakeY, "max take y is not correct");
        Helper.assertEqual(a[4], minSupportX, "min support x is not correct");
        Helper.assertEqual(a[5], minSupportY, "min support y is not correct");
        a = await reserve.getInternalInventoryDataPub(myDaiToken.address);
        Helper.assertEqual(a[0], false, "internal inventory should be disable");
    });

    it("Should test getConversionRate returns 0 token not listed", async function() {
        await otc.setBuyOffer(2, myDaiToken.address, precision.mul(new BN(3 * 300)), myWethToken.address, precision.mul(new BN(3))); // rate: 300
        await otc.setSellOffer(3, myWethToken.address, precision.mul(new BN(3)), myDaiToken.address, precision.mul(new BN(3 * 300))); // rate: 300

        let token = await TestToken.new("test token", "tes", 18);
        let result;
        result = await reserve.getConversionRate(ethAddress, token.address, precision, 0);
        Helper.assertEqual(result, 0, "rate should be 0 as token is not listed");

        result = await reserve.getConversionRate(token.address, ethAddress, precision.mul(new BN(20)), 0);
        Helper.assertEqual(result, 0, "rate should be 0 as token is not listed");

        result = await reserve.getConversionRate(ethAddress, myDaiToken.address, precision, 0);
        Helper.assertGreater(result, 0, "should have rate as token is listed");
    });

    it("Should test getConversionRate returns 0 trade not enable", async function() {
        await otc.setBuyOffer(2, myDaiToken.address, precision.mul(new BN(3 * 300)), myWethToken.address, precision.mul(new BN(3))); // rate: 300
        await otc.setSellOffer(3, myWethToken.address, precision.mul(new BN(3)), myDaiToken.address, precision.mul(new BN(3 * 300))); // rate: 300

        await reserve.disableTrade({from: alerter});
        let result;
        // not have sell order
        result = await reserve.getConversionRate(ethAddress, myDaiToken.address, precision, 0);
        Helper.assertEqual(result, 0, "rate should be 0 as trade is not enable");

        result = await reserve.getConversionRate(myDaiToken.address, ethAddress, precision.mul(new BN(20)), 0);
        Helper.assertEqual(result, 0, "rate should be 0 as trade is not enable");

        await reserve.enableTrade({from: admin});
        result = await reserve.getConversionRate(ethAddress, myDaiToken.address, precision, 0);
        Helper.assertGreater(result, 0, "should have rate as trade is enable");
    });

    it("Should test getConversionRate returns 0 amount is smaller than min support eth (eth -> dai)", async function() {
        await otc.setBuyOffer(1, myDaiToken.address, precision.mul(new BN(300)), myWethToken.address, precision);// rate: 300
        await otc.setBuyOffer(2, myDaiToken.address, precision.mul(new BN(280 * 1.5)), myWethToken.address, precision.mul(new BN(15)).div(new BN(10)));// rate: 280
        await otc.setBuyOffer(3, myDaiToken.address, precision.mul(new BN(250 * 3.5)), myWethToken.address, precision.mul(new BN(35)).div(new BN(10))); // rate: 250
        await otc.setBuyOffer(4, myDaiToken.address, precision.mul(new BN(4 * 245)), myWethToken.address, precision.mul(new BN(4))); // rate: 245
        await otc.setBuyOffer(5, myDaiToken.address, precision.mul(new BN(240 * 10)), myWethToken.address, precision.mul(new BN(10))); // rate: 240

        result = await reserve.getConversionRate(ethAddress, myDaiToken.address, minSupport, 0);
        Helper.assertGreater(result, 0, "should have rate");

        result = await reserve.getConversionRate(ethAddress, myDaiToken.address, minSupport.sub(new BN(1)), 0);
        Helper.assertEqual(result, 0, "rate should be 0");
    });

    it("Should test getConversionRate returns correct rate with apply fee without internal inventory (eth -> dai)", async function() {
        await otc.setBuyOffer(1, myDaiToken.address, precision.mul(new BN(300)), myWethToken.address, precision.mul(new BN(1)));// rate: 300
        await otc.setBuyOffer(2, myDaiToken.address, precision.mul(new BN(1.5 * 280)), myWethToken.address, precision.mul(new BN(15)).div(new BN(10)));// rate: 280
        await otc.setBuyOffer(3, myDaiToken.address, precision.mul(new BN(3.5 * 250)), myWethToken.address, precision.mul(new BN(35)).div(new BN(10))); // rate: 250
        await otc.setBuyOffer(4, myDaiToken.address, precision.mul(new BN(4 * 245)), myWethToken.address, precision.mul(new BN(4))); // rate: 245
        await otc.setBuyOffer(5, myDaiToken.address, precision.mul(new BN(10 * 240)), myWethToken.address, precision.mul(new BN(10))); // rate: 240

        let result;
        let expectedRate;
        let newFeeBps;
        
        try {
            newFeeBps = 25;
            await reserve.setFeeBps(newFeeBps, {from: admin});
            result = await reserve.getConversionRate(ethAddress, myDaiToken.address, precision.mul(new BN(15)).div(new BN(10)), 0);
            expectedRate = (new BN(280)).mul(precision);
            expectedRate = Helper.addBps(expectedRate, newFeeBps * -1);
            expectedRate = applyInternalInventory(expectedRate, false);
            Helper.assertEqual(result, expectedRate, "rate is not correct");

            result = await reserve.getConversionRate(ethAddress, myDaiToken.address, precision.mul(new BN(4)), 0);
            // dest amount = 3.5 * 250 + 0.5 * 280 = 1015
            // rate = 1015 / 4 = 253.75
            expectedRate = (new BN(1015)).mul(precision).div(new BN(4));
            expectedRate = Helper.addBps(expectedRate, newFeeBps * -1);
            expectedRate = applyInternalInventory(expectedRate, false);
            Helper.assertEqual(result, expectedRate, "rate is not correct");

            newFeeBps = 50;
            await reserve.setFeeBps(newFeeBps, {from: admin});
            result = await reserve.getConversionRate(ethAddress, myDaiToken.address, precision.mul(new BN(15)).div(new BN(10)), 0);
            expectedRate = (new BN(280)).mul(precision);
            expectedRate = Helper.addBps(expectedRate, newFeeBps * -1);
            expectedRate = applyInternalInventory(expectedRate, false);
            Helper.assertEqual(result, expectedRate, "rate is not correct");

            newFeeBps = 0;
            await reserve.setFeeBps(newFeeBps, {from: admin});
            result = await reserve.getConversionRate(ethAddress, myDaiToken.address, precision.mul(new BN(15)).div(new BN(10)), 0);
            expectedRate = (new BN(280)).mul(precision);
            expectedRate = Helper.addBps(expectedRate, newFeeBps * -1);
            expectedRate = applyInternalInventory(expectedRate, false);
            Helper.assertEqual(result, expectedRate, "rate is not correct");

            newFeeBps = 25;
            await reserve.setFeeBps(newFeeBps, {from: admin});
            result = await reserve.getConversionRate(ethAddress, myDaiToken.address, precision.mul(new BN(6)), 0);
            // dest amount = 3.5 * 250 + 2.5 * 245 = 1487.5
            // rate = 1,487.5 / 6 = 247.9166666667
            expectedRate = (new BN((3.5 * 250 + 2.5 * 245) * 10)).mul(precision).div(new BN(60));
            expectedRate = Helper.addBps(expectedRate, newFeeBps * -1);
            let newExpectedRate = applyInternalInventory(expectedRate, false); // expect rate is reduced by 1
            Helper.assertEqual(expectedRate.sub(new BN(1)), newExpectedRate, "expected rate is reduced by 1");
            Helper.assertEqual(result, newExpectedRate, "rate is not correct");

        } catch (e) {
            await reserve.setFeeBps(feeBps, {from: admin});
            assert(false, "shouldn't fail or revert");
        }

        await reserve.setFeeBps(feeBps, {from: admin});
    });

    it("Should test getConversionRate still returns rate even spread is not ok with no internal inventory (eth -> dai)", async function() {
        await otc.setBuyOffer(2, myDaiToken.address, precision.mul(new BN(300 * 3)), myWethToken.address, precision.mul(new BN(3))); // rate: 300

        let result;

        // not have sell order
        result = await reserve.getConversionRate(ethAddress, myDaiToken.address, precision.mul(new BN(15)).div(new BN(10)), 0);
        Helper.assertGreater(result, 0, "should still have rate when there is arbitrage");

        await otc.setSellOffer(1, myWethToken.address, precision, myDaiToken.address, precision.mul(new BN(200))); // rate: 200

        // have sell order but create arbitrage
        result = await reserve.getConversionRate(ethAddress, myDaiToken.address, precision.mul(new BN(15)).div(new BN(10)), 0);
        Helper.assertGreater(result, 0, "should still have rate when there is arbitrage");
    });

    it("Should test getConversionRate returns 0 with srcQty is 0", async function() {
        await otc.setBuyOffer(1, myDaiToken.address, precision.mul(new BN(5 * 190)), myWethToken.address, precision.mul(new BN(5))); // rate: 190
        await otc.setSellOffer(2, myWethToken.address, precision.mul(new BN(5)), myDaiToken.address, precision.mul(new BN(210 * 5))); // rate: 210

        let result;

        result = await reserve.getConversionRate(ethAddress, myDaiToken.address, 0, 0);
        Helper.assertEqual(result, 0, "should return 0 for srcqty = 0");

        result = await reserve.getConversionRate(ethAddress, myDaiToken.address, 0, 0);
        Helper.assertEqual(result, 0, "should return 0 for srcqty = 0");
    });

    it("Should test getConversionRate returns 0 can not take any offers or not enough to take (eth -> dai)", async function() {
        await otc.setBuyOffer(2, myDaiToken.address, precision.mul(new BN(300 * 2)), myWethToken.address, precision.mul(new BN(2))); // rate: 300
        await otc.setBuyOffer(3, myDaiToken.address, precision.mul(new BN(290 * 22)).div(new BN(10)), myWethToken.address, precision.mul(new BN(22)).div(new BN(10))); // rate: 290
        await otc.setBuyOffer(4, myDaiToken.address, precision.mul(new BN(280 * 2.6)), myWethToken.address, precision.mul(new BN(26)).div(new BN(10))); // rate: 280
        await otc.setBuyOffer(5, myDaiToken.address, precision.mul(new BN(270 * 2.6)), myWethToken.address, precision.mul(new BN(26)).div(new BN(10))); // rate: 270
        await otc.setBuyOffer(6, myDaiToken.address, precision.mul(new BN(270 * 2.6)), myWethToken.address, precision.mul(new BN(26)).div(new BN(10))); // rate: 270
        await otc.setBuyOffer(7, myDaiToken.address, precision.mul(new BN(10 * 265)), myWethToken.address, precision.mul(new BN(10))); // rate: 265

        let result;
        result = await reserve.getConversionRate(ethAddress, myDaiToken.address, precision.mul(new BN(10)), 0);
        Helper.assertEqual(result, 0, "rate should be 0 as can not take any offers");
    
        result = await reserve.getConversionRate(ethAddress, myDaiToken.address, precision.mul(new BN(6)), 0);
        Helper.assertEqual(result, 0, "rate should be 0 as not enough offers to take, maxTakes reached");

        result = await reserve.getConversionRate(ethAddress, myDaiToken.address, precision.mul(new BN(6)), 0);
        Helper.assertEqual(result, 0, "rate should be 0 as not enough offers to take, maxTraverse reached");
    });

    it("Should test getConversionRate returns 0 when spread is not ok with no internal inventory (dai -> eth)", async function() {
        let result;

        result = await reserve.getConversionRate(myDaiToken.address, ethAddress, precision.mul(new BN(200)), 0);
        Helper.assertEqual(result, 0, "should have no rate");

        // no buy offer
        await otc.setSellOffer(1, myWethToken.address, precision, myDaiToken.address, precision.mul(new BN(200))); // rate: 200
        result = await reserve.getConversionRate(myDaiToken.address, ethAddress, precision.mul(new BN(200)), 0);
        Helper.assertEqual(result, 0, "should have no rate");

        // have both buy & sell, but spread is not ok
        await otc.setBuyOffer(2, myDaiToken.address, precision.mul(new BN(5 * 210)), myWethToken.address, precision.mul(new BN(5))); // rate: 210
        result = await reserve.getConversionRate(myDaiToken.address, ethAddress, precision.mul(new BN(200)), 0);
        Helper.assertEqual(result, 0, "should have no rate");

        await otc.resetOffersData();

        // no sell offer
        await otc.setBuyOffer(2, myDaiToken.address, precision.mul(new BN(5 * 210)), myWethToken.address, precision.mul(new BN(5))); // rate: 210
        result = await reserve.getConversionRate(myDaiToken.address, ethAddress, precision.mul(new BN(200)), 0);
        Helper.assertEqual(result, 0, "should have no rate");
    });

    it("Should test getConversionRate returns correct rate with apply fee without internal inventory (dai -> eth)", async function() {
        // median rate: 200
        await otc.setBuyOffer(1, myDaiToken.address, precision.mul(new BN(5 * 190)), myWethToken.address, precision.mul(new BN(5))); // rate: 190
        await otc.setSellOffer(2, myWethToken.address, precision.mul(new BN(5)), myDaiToken.address, precision.mul(new BN(5 * 210))); // rate: 210
        await otc.setSellOffer(3, myWethToken.address, precision.mul(new BN(6)), myDaiToken.address, precision.mul(new BN(212 * 6))); // rate: 212
        await otc.setSellOffer(4, myWethToken.address, precision.mul(new BN(4)), myDaiToken.address, precision.mul(new BN(216 * 4))); // rate: 216
        await otc.setSellOffer(5, myWethToken.address, precision.mul(new BN(6)), myDaiToken.address, precision.mul(new BN(220 * 6))); // rate: 220

        let result;
        let expectedRate;
        let newFeeBps;

        newFeeBps = 25;
        await reserve.setFeeBps(newFeeBps, {from: admin});
        result = await reserve.getConversionRate(myDaiToken.address, ethAddress, precision.mul(new BN(2 * 210)), 0);
        expectedRate = precision.div(new BN(210));
        expectedRate = Helper.addBps(expectedRate, newFeeBps * -1);
        expectedRate = applyInternalInventory(expectedRate, false);
        Helper.assertEqual(result, expectedRate, "rate is not correct");

        newFeeBps = 50;
        await reserve.setFeeBps(newFeeBps, {from: admin});
        result = await reserve.getConversionRate(myDaiToken.address, ethAddress, precision.mul(new BN(2 * 210)), 0);
        expectedRate = precision.div(new BN(210));
        expectedRate = Helper.addBps(expectedRate, newFeeBps * -1);
        expectedRate = applyInternalInventory(expectedRate, false);
        Helper.assertEqual(result, expectedRate, "rate is not correct");

        newFeeBps = 0;
        await reserve.setFeeBps(newFeeBps, {from: admin});
        result = await reserve.getConversionRate(myDaiToken.address, ethAddress, precision.mul(new BN(2 * 210)), 0);
        expectedRate = (new BN(280)).mul(precision);
        expectedRate = precision.div(new BN(210));
        expectedRate = applyInternalInventory(expectedRate, false);
        Helper.assertEqual(result, expectedRate, "rate is not correct");

        newFeeBps = 25;
        await reserve.setFeeBps(newFeeBps, {from: admin});
        result = await reserve.getConversionRate(myDaiToken.address, ethAddress, precision.mul(new BN(5 * 210 + 3 * 212)), 0);
        // dest amount = 8
        // rate = 8 * 10^18 / (5 * 210 + 3 * 212)
        expectedRate = precision.mul(new BN(8)).div(new BN(5 * 210 + 3 * 212));
        expectedRate = Helper.addBps(expectedRate, newFeeBps * -1);
        let newExpectedRate = applyInternalInventory(expectedRate, false); // expect rate is reduced by 1
        Helper.assertEqual(expectedRate.sub(new BN(1)), newExpectedRate, "expected rate is reduced by 1")
        Helper.assertEqual(result, newExpectedRate, "rate is not correct");

        await reserve.setFeeBps(feeBps, {from: admin});
    });

    it("Should test getConversionRate returns 0 can not take any offers or not enough to take (dai -> eth)", async function() {
        // median rate: 200
        await otc.setBuyOffer(1, myDaiToken.address, precision.mul(new BN(5 * 190)), myWethToken.address, precision.mul(new BN(5))); // rate: 190
        await otc.setSellOffer(2, myWethToken.address, precision, myDaiToken.address, precision.mul(new BN(210))); // rate: 210
        await otc.setSellOffer(3, myWethToken.address, precision.mul(new BN(22)).div(new BN(10)), myDaiToken.address, precision.mul(new BN(212 * 22)).div(new BN(10))); // rate: 212
        await otc.setSellOffer(4, myWethToken.address, precision.mul(new BN(26)).div(new BN(10)), myDaiToken.address, precision.mul(new BN(216 * 26)).div(new BN(10))); // rate: 216
        await otc.setSellOffer(5, myWethToken.address, precision.mul(new BN(26)).div(new BN(10)), myDaiToken.address, precision.mul(new BN(220 * 26)).div(new BN(10))); // rate: 220
        await otc.setSellOffer(6, myWethToken.address, precision.mul(new BN(3)), myDaiToken.address, precision.mul(new BN(224 * 3))); // rate: 222
        await otc.setSellOffer(6, myWethToken.address, precision.mul(new BN(10)), myDaiToken.address, precision.mul(new BN(10 * 225))); // rate: 222

        let result;
        result = await reserve.getConversionRate(myDaiToken.address, ethAddress, precision.mul(new BN(20 * 200)), 0);
        Helper.assertEqual(result, 0, "rate should be 0 as can not take any offers");

        result = await reserve.getConversionRate(ethAddress, myDaiToken.address, precision.mul(new BN(6)), 0);
        Helper.assertEqual(result, 0, "rate should be 0 as not enough offers to take, maxTakes reached");

        result = await reserve.getConversionRate(ethAddress, myDaiToken.address, precision.mul(new BN(6)), 0);
        Helper.assertEqual(result, 0, "rate should be 0 as not enough offers to take, maxTraverse reached");
    });

    it("Should test getConversionRate returns 0 amount is smaller than min support eth (dai -> eth)", async function() {
        // median rate: 200
        await otc.setBuyOffer(1, myDaiToken.address, precision.mul(new BN(190)), myWethToken.address, precision); // rate: 190
        await otc.setSellOffer(2, myWethToken.address, precision, myDaiToken.address, precision.mul(new BN(210))); // rate: 210
        await otc.setSellOffer(3, myWethToken.address, precision.mul(new BN(22)).div(new BN(10)), myDaiToken.address, precision.mul(new BN(212  * 22)).div(new BN(10))); // rate: 212
        await otc.setSellOffer(4, myWethToken.address, precision.mul(new BN(26)).div(new BN(10)), myDaiToken.address, precision.mul(new BN(216  * 26)).div(new BN(10))); // rate: 216
        await otc.setSellOffer(5, myWethToken.address, precision.mul(new BN(26)).div(new BN(10)), myDaiToken.address, precision.mul(new BN(220 * 26)).div(new BN(10))); // rate: 220

        result = await reserve.getConversionRate(myDaiToken.address, ethAddress, minSupport.div(new BN(2)).mul(new BN(200)), 0);
        Helper.assertEqual(result, 0, "rate should be 0");

        result = await reserve.getConversionRate(myDaiToken.address, ethAddress, minSupport.mul(new BN(200)), 0);
        Helper.assertGreater(result, 0, "should have rate");
    });

    it("Should test showBestOffers returns 0 when src amount is 0", async function() {
        await otc.setBuyOffer(1, myDaiToken.address, precision.mul(new BN(3000)), myWethToken.address, precision.mul(new BN(10)));
        await otc.setBuyOffer(2, myDaiToken.address, precision.mul(new BN(20250)), myWethToken.address, precision.mul(new BN(101)));
        await otc.setBuyOffer(3, myDaiToken.address, precision.mul(new BN(20000)), myWethToken.address, precision.mul(new BN(100)));

        let result = await reserve.showBestOffers(myDaiToken.address, true, 0);
        Helper.assertEqual(result[0], 0, "dest amount should be 0");
        Helper.assertEqual(result[1], 0, "dest amount should be 0");
        Helper.assertEqual(result[2].length, 0, "Should not take any offers");

        result = await reserve.showBestOffers(myDaiToken.address, false, 0);
        Helper.assertEqual(result[0], 0, "dest amount should be 0");
        Helper.assertEqual(result[1], 0, "dest amount should be 0");
        Helper.assertEqual(result[2].length, 0, "Should not take any offers");
    });

    it("Should test showBestOffers takes only first offer (eth -> dai)", async function() {
        await otc.setBuyOffer(1, myDaiToken.address, precision.mul(new BN(3000)), myWethToken.address, precision.mul(new BN(10)));
        await otc.setBuyOffer(2, myDaiToken.address, precision.mul(new BN(20250)), myWethToken.address, precision.mul(new BN(101)));
        await otc.setBuyOffer(3, myDaiToken.address, precision.mul(new BN(20000)), myWethToken.address, precision.mul(new BN(100)));

        let result = await reserve.showBestOffers(myDaiToken.address, true, 5);
        Helper.assertEqual(result[0], precision.mul(new BN(1500)), "dest amount should be correct");
        Helper.assertEqual(result[1], 1500, "dest amount should be 1500");
        Helper.assertEqual(result[2].length, 1, "Should take only 1 offer");
        Helper.assertEqual(result[2][0], 1, "offer id should be 1");

        result = await reserve.showBestOffers(myDaiToken.address, true, 10);
        Helper.assertEqual(result[0], precision.mul(new BN(3000)), "dest amount should be correct");
        Helper.assertEqual(result[1], 3000, "dest amount should be correct");
        Helper.assertEqual(result[2].length, 1, "Should take only 1 offer");
        Helper.assertEqual(result[2][0], 1, "offer id should be correct");
    });

    it("Should test showBestOffers takes only last traverse offer (eth -> dai)", async function() {
        await otc.setBuyOffer(1, myDaiToken.address, precision.mul(new BN(300)), myWethToken.address, precision);
        await otc.setBuyOffer(2, myDaiToken.address, precision.mul(new BN(400)), myWethToken.address, precision.mul(new BN(15)).div(new BN(10)));
        await otc.setBuyOffer(3, myDaiToken.address, precision.mul(new BN(500)), myWethToken.address, precision.mul(new BN(2)));
        await otc.setBuyOffer(4, myDaiToken.address, precision.mul(new BN(539)), myWethToken.address, precision.mul(new BN(22)).div(new BN(10)));
        await otc.setBuyOffer(5, myDaiToken.address, precision.mul(new BN(2400)), myWethToken.address, precision.mul(new BN(10)));

        let result = await reserve.showBestOffers(myDaiToken.address, true, 5);
        Helper.assertEqual(result[0], precision.mul(new BN(240 * 5)), "dest amount should be correct");
        Helper.assertEqual(result[1], 240 * 5, "dest amount should be correct");
        Helper.assertEqual(result[2].length, 1, "Should take only 1 offer");
        Helper.assertEqual(result[2][0], 5, "offer id should be correct");

        result = await reserve.showBestOffers(myDaiToken.address, true, 10);
        Helper.assertEqual(result[0], precision.mul(new BN(2400)), "dest amount should be correct");
        Helper.assertEqual(result[1], 2400, "dest amount should be correct");
        Helper.assertEqual(result[2].length, 1, "Should take only 1 offer");
        Helper.assertEqual(result[2][0], 5, "offer id should be correct");
    });

    it("Should test showBestOffers takes 2 offers (eth -> dai)", async function() {
        await otc.setBuyOffer(1, myDaiToken.address, precision.mul(new BN(300)), myWethToken.address, precision);// rate: 300
        await otc.setBuyOffer(2, myDaiToken.address, precision.mul(new BN(400)), myWethToken.address, precision.mul(new BN(15)).div(new BN(10)));// rate: 266.66
        await otc.setBuyOffer(3, myDaiToken.address, precision.mul(new BN(2.5 * 250)), myWethToken.address, precision.mul(new BN(25)).div(new BN(10))); // rate: 250
        await otc.setBuyOffer(4, myDaiToken.address, precision.mul(new BN(3 * 245)), myWethToken.address, precision.mul(new BN(3))); // rate: 245
        await otc.setBuyOffer(5, myDaiToken.address, precision.mul(new BN(2400)), myWethToken.address, precision.mul(new BN(10))); // rate: 240

        let result = await reserve.showBestOffers(myDaiToken.address, true, 10);
        // take 3 eth from offer 4 and 7 eth from offer 5
        Helper.assertEqual(result[0], precision.mul(new BN(3 * 245 + 240 * 7)), "dest amount should be correct");
        Helper.assertEqual(result[1], (3 * 245 + 240 * 7), "dest amount should be correct");
        Helper.assertEqual(result[2].length, 2, "Should take only 2 offers");
        Helper.assertEqual(result[2][0], 4, "offer id should be correct");
        Helper.assertEqual(result[2][1], 5, "offer id should be correct");

        result = await reserve.showBestOffers(myDaiToken.address, true, 5);
        // take 2.5 eth from offer 3 and 2.5 eth from offer 4
        Helper.assertEqual(result[0], precision.mul(new BN(10 * 1237.5)).div(new BN(10)), "dest amount should be correct");
        Helper.assertEqual(result[1], 1237, "dest amount should be correct");
        Helper.assertEqual(result[2].length, 2, "Should take 2 offers");
        Helper.assertEqual(result[2][0], 3, "offer id should be correct");
        Helper.assertEqual(result[2][1], 4, "offer id should be correct");
    });

    it("Should test showBestOffers takes offers with biggest previous skip (eth -> dai)", async function() {
        await otc.setBuyOffer(1, myDaiToken.address, precision.mul(new BN(300)), myWethToken.address, precision);// rate: 300
        await otc.setBuyOffer(2, myDaiToken.address, precision.mul(new BN(1.5 * 270)), myWethToken.address, precision.mul(new BN(15)).div(new BN(10)));// rate: 270
        await otc.setBuyOffer(3, myDaiToken.address, precision.mul(new BN(8.5 * 250)), myWethToken.address, precision.mul(new BN(85)).div(new BN(10))); // rate: 250
        await otc.setBuyOffer(4, myDaiToken.address, precision.mul(new BN(3 * 245)), myWethToken.address, precision.mul(new BN(3))); // rate: 245
        await otc.setBuyOffer(5, myDaiToken.address, precision.mul(new BN(2400)), myWethToken.address, precision.mul(new BN(10))); // rate: 240

        let result = await reserve.showBestOffers(myDaiToken.address, true, 10);
        // take 8.5 eth from offer 3 and 1.5 eth from offer 2
        Helper.assertEqual(result[0], precision.mul(new BN(8.5 * 250 + 1.5 * 270)), "dest amount should be correct");
        Helper.assertEqual(result[1], (8.5 * 250 + 1.5 * 270), "dest amount should be correct");
        Helper.assertEqual(result[2].length, 2, "Should take only 2 offers");
        Helper.assertEqual(result[2][0], 3, "offer id should be correct");
        Helper.assertEqual(result[2][1], 2, "offer id should be correct");

        // taking biggest skip but not optimal one
        // taking offer 1 and 3 should be better than taking offer 2 and 3
        result = await reserve.showBestOffers(myDaiToken.address, true, 9);
        // take 8.5 eth from offer 3 and 0.5 eth from offer 2
        Helper.assertEqual(result[0], precision.mul(new BN((8.5 * 250 + 0.5 * 270))), "dest amount should be correct");
        Helper.assertEqual(result[1], (8.5 * 250 + 0.5 * 270), "dest amount should be correct");
        Helper.assertEqual(result[2].length, 2, "Should take only 2 offers");
        Helper.assertEqual(result[2][0], 3, "offer id should be correct");
        Helper.assertEqual(result[2][1], 2, "offer id should be correct");
    });

    it("Should test showBestOffers not enough to take (maxTraverse reached) (eth -> dai)", async function() {
        await otc.setBuyOffer(1, myDaiToken.address, precision.mul(new BN(300)), myWethToken.address, precision);// rate: 300
        await otc.setBuyOffer(2, myDaiToken.address, precision.mul(new BN(400)), myWethToken.address, precision.mul(new BN(15)).div(new BN(10)));// rate: 266.66
        await otc.setBuyOffer(3, myDaiToken.address, precision.mul(new BN(1.5 * 250)), myWethToken.address, precision.mul(new BN(15)).div(new BN(10))); // rate: 250
        await otc.setBuyOffer(4, myDaiToken.address, precision.mul(new BN(3 * 245)), myWethToken.address, precision.mul(new BN(3))); // rate: 245
        await otc.setBuyOffer(5, myDaiToken.address, precision.mul(new BN(10 * 240)), myWethToken.address, precision.mul(new BN(10))); // rate: 240

        let result = await reserve.showBestOffers(myDaiToken.address, true, 20);
        Helper.assertEqual(result[0], 0, "dest amount should be correct");
        Helper.assertEqual(result[1], 0, "dest amount should be correct");
        Helper.assertEqual(result[2].length, 0, "not take any offer");
    });

    it("Should test showBestOffers takes maxTake offers (not enough + enough src amount) (eth -> dai)", async function() {
        await otc.setBuyOffer(1, myDaiToken.address, precision.mul(new BN(300)), myWethToken.address, precision);// rate: 300
        await otc.setBuyOffer(2, myDaiToken.address, precision.mul(new BN(400)), myWethToken.address, precision.mul(new BN(15)).div(new BN(10)));// rate: 266.66
        await otc.setBuyOffer(3, myDaiToken.address, precision.mul(new BN(3.5 * 250)), myWethToken.address, precision.mul(new BN(35)).div(new BN(10))); // rate: 250
        await otc.setBuyOffer(4, myDaiToken.address, precision.mul(new BN(4 * 245)), myWethToken.address, precision.mul(new BN(4))); // rate: 245
        await otc.setBuyOffer(5, myDaiToken.address, precision.mul(new BN(10 * 240)), myWethToken.address, precision.mul(new BN(10))); // rate: 240

        let result = await reserve.showBestOffers(myDaiToken.address, true, 18);
        Helper.assertEqual(result[0], 0, "dest amount should be correct");
        Helper.assertEqual(result[1], 0, "dest amount should be correct");
        Helper.assertEqual(result[2].length, 0, "Not take any offer");

        result = await reserve.showBestOffers(myDaiToken.address, true, 16);
        Helper.assertEqual(result[0], precision.mul(new BN((3.5 * 250 + 4 * 245 + 8.5 * 240))), "dest amount should be correct");
        Helper.assertEqual(result[1], 3.5 * 250 + 4 * 245 + 8.5 * 240, "dest amount should be correct");
        Helper.assertEqual(result[2].length, 3, "Still can take offers");
        Helper.assertEqual(result[2][0], 3, "offer id should be correct");
        Helper.assertEqual(result[2][1], 4, "offer id should be correct");
        Helper.assertEqual(result[2][2], 5, "offer id should be correct");
    });

    it("Should test showBestOffers takes all offers read (eth -> dai)", async function() {
        await otc.setBuyOffer(3, myDaiToken.address, precision.mul(new BN(5 * 250)), myWethToken.address, precision.mul(new BN(5))); // rate: 250
        await otc.setBuyOffer(4, myDaiToken.address, precision.mul(new BN(4 * 245)), myWethToken.address, precision.mul(new BN(4))); // rate: 245
        await otc.setBuyOffer(5, myDaiToken.address, precision.mul(new BN(10 * 240)), myWethToken.address, precision.mul(new BN(10))); // rate: 240

        let result = await reserve.showBestOffers(myDaiToken.address, true, 19);
        Helper.assertEqual(result[0], precision.mul(new BN(5 * 250 + 4 * 245 + 10 * 240)), "dest amount should be correct");
        Helper.assertEqual(result[1], new BN(5 * 250 + 4 * 245 + 10 * 240), "dest amount should be correct");
        Helper.assertEqual(result[2].length, 3, "Still can take offers");
        Helper.assertEqual(result[2][0], 3, "offer id should be correct");
        Helper.assertEqual(result[2][1], 4, "offer id should be correct");
        Helper.assertEqual(result[2][2], 5, "offer id should be correct");

        result = await reserve.showBestOffers(myDaiToken.address, true, 9);
        Helper.assertEqual(result[0], precision.mul(new BN(5 * 250 + 4 * 245)), "dest amount should be correct");
        Helper.assertEqual(result[1], 5 * 250 + 4 * 245, "dest amount should be correct");
        Helper.assertEqual(result[2].length, 2, "Still can take offers");
        Helper.assertEqual(result[2][0], 3, "offer id should be correct");
        Helper.assertEqual(result[2][1], 4, "offer id should be correct");

        result = await reserve.showBestOffers(myDaiToken.address, true, 8);
        Helper.assertEqual(result[0], precision.mul(new BN(5 * 250 + 3 * 245)), "dest amount should be correct");
        Helper.assertEqual(result[1], 5 * 250 + 3 * 245, "dest amount should be correct");
        Helper.assertEqual(result[2].length, 2, "Still can take offers");
        Helper.assertEqual(result[2][0], 3, "offer id should be correct");
        Helper.assertEqual(result[2][1], 4, "offer id should be correct");
    });

    it("Should test showBestOffers not take any offers as amount is lower than minOrderSize (eth -> dai)", async function() {
        // order 10 eth, minOrderSize should be 2.6375
        await otc.setBuyOffer(3, myDaiToken.address, precision.mul(new BN(2 * 250)), myWethToken.address, precision.mul(new BN(2))); // rate: 250
        await otc.setBuyOffer(4, myDaiToken.address, precision.mul(new BN(2 * 245)), myWethToken.address, precision.mul(new BN(2))); // rate: 245
        await otc.setBuyOffer(5, myDaiToken.address, precision.mul(new BN(2.2 * 240)), myWethToken.address, precision.mul(new BN(22)).div(new BN(10))); // rate: 240
        await otc.setBuyOffer(6, myDaiToken.address, precision.mul(new BN(2.5 * 240)), myWethToken.address, precision.mul(new BN(25)).div(new BN(10))); // rate: 240
        await otc.setBuyOffer(7, myDaiToken.address, precision.mul(new BN(2.6 * 240)), myWethToken.address, precision.mul(new BN(26)).div(new BN(10))); // rate: 240

        let result = await reserve.showBestOffers(myDaiToken.address, true, 10);
        Helper.assertEqual(result[0], 0, "dest amount should be correct");
        Helper.assertEqual(result[1], 0, "dest amount should be correct");
        Helper.assertEqual(result[2].length, 0, "shouldn't take any offer");
    });

    it("Should test showBestOffers takes only maxTakes (eth -> dai)", async function() {
        for(let id = 1; id <= maxTraverse; id++) {
            await otc.setBuyOffer(id, myDaiToken.address, precision.mul(new BN(30 * 300)), myWethToken.address, precision.mul(new BN(30)));// rate: 300
        }

        let result = await reserve.showBestOffers(myDaiToken.address, true, maxTake.mul(new BN(30).add(new BN(1))));
        Helper.assertEqual(result[0], 0, "dest amount should be correct");
        Helper.assertEqual(result[1], 0, "dest amount should be correct");
        Helper.assertEqual(result[2].length, 0, "Shouldn't take any offers");

        result = await reserve.showBestOffers(myDaiToken.address, true, maxTake.mul(new BN(30)));
        Helper.assertEqual(result[0], maxTake.mul(new BN(30)).mul(precision).mul(new BN(300)), "dest amount should be correct");
        Helper.assertEqual(result[1], maxTake.mul(new BN(30 * 300)), "dest amount should be correct");
        Helper.assertEqual(result[2].length, maxTake, "Should take all maxTake offers");
        for(let id = 1; id <= maxTake; id++) {
            Helper.assertEqual(result[2][id - 1], id, "Should take correct offer's id");
        }
        await otc.resetOffersData();
    });

    it("Should test showBestOffers returns 0 when no sell or buy orders (dai -> eth)", async function() {
        let result = await reserve.showBestOffers(myDaiToken.address, false, 400);
        Helper.assertEqual(result[0], precision.mul(new BN(0)), "dest amount should be correct");
        Helper.assertEqual(result[1], 0, "dest amount should be correct");
        Helper.assertEqual(result[2].length, 0, "Should not take any offers");

        await otc.setBuyOffer(1, myDaiToken.address, precision.mul(new BN(5 * 200)), myWethToken.address, precision.mul(new BN(5))); // rate: 200
        result = await reserve.showBestOffers(myDaiToken.address, false, 400);
        Helper.assertEqual(result[0], precision.mul(new BN(0)), "dest amount should be correct");
        Helper.assertEqual(result[1], 0, "dest amount should be correct");
        Helper.assertEqual(result[2].length, 0, "Should not take any offers");

        await otc.resetOffersData();
        await otc.setSellOffer(2, myWethToken.address, precision.mul(new BN(10)), myDaiToken.address, precision.mul(new BN(10)).mul(new BN(201))); // rate: 201
        result = await reserve.showBestOffers(myDaiToken.address, false, 400);
        Helper.assertEqual(result[0], precision.mul(new BN(0)), "dest amount should be correct");
        Helper.assertEqual(result[1], 0, "dest amount should be correct");
        Helper.assertEqual(result[2].length, 0, "Should not take any offers");
    });

    it("Should test showBestOffers takes only first offer (dai -> eth)", async function() {
        // making median rate is 200
        await otc.setBuyOffer(1, myDaiToken.address, precision.mul(new BN(5 * 190)), myWethToken.address, precision.mul(new BN(5))); // rate: 190
        await otc.setSellOffer(2, myWethToken.address, precision.mul(new BN(10)), myDaiToken.address, precision.mul(new BN(10 * 210))); // rate: 210

        await otc.setSellOffer(3, myWethToken.address, precision.mul(new BN(2)), myDaiToken.address, precision.mul(new BN(220 * 2))); // rate: 220

        let result;
        result = await reserve.showBestOffers(myDaiToken.address, false, 210 * 2);
        Helper.assertEqual(result[0], precision.mul(new BN(2)), "dest amount should be correct");
        Helper.assertEqual(result[1], 2, "dest amount should be correct");
        Helper.assertEqual(result[2].length, 1, "Should take 1 offer");
        Helper.assertEqual(result[2][0], 2, "Should take correct offer's id");
    });

    it("Should test showBestOffers takes only last traverse offer (dai -> eth)", async function() {
        // making median rate is 200
        await otc.setBuyOffer(1, myDaiToken.address, precision.mul(new BN(5 * 190)), myWethToken.address, precision.mul(new BN(5))); // rate: 190
        await otc.setSellOffer(2, myWethToken.address, precision, myDaiToken.address, precision.mul(new BN(210))); // rate: 210

        await otc.setSellOffer(3, myWethToken.address, precision.mul(new BN(3)), myDaiToken.address, precision.mul(new BN(220 * 3))); // rate: 220

        let result;
        result = await reserve.showBestOffers(myDaiToken.address, false, 2.4 * 220);
        Helper.assertEqual(result[0], precision.mul(new BN(24)).div(new BN(10)), "dest amount should be correct");
        Helper.assertEqual(result[1], 2, "dest amount should be correct"); // rounded down
        Helper.assertEqual(result[2].length, 1, "Should take 1 offer");
        Helper.assertEqual(result[2][0], 3, "Should take correct offer's id");
    });

    it("Should test showBestOffers takes 2 offers (dai -> eth)", async function() {
        // making median rate is 200
        await otc.setBuyOffer(1, myDaiToken.address, precision.mul(new BN(5 * 190)), myWethToken.address, precision.mul(new BN(5))); // rate: 190
        await otc.setSellOffer(2, myWethToken.address, precision, myDaiToken.address, precision.mul(new BN(210))); // rate: 210

        await otc.setSellOffer(3, myWethToken.address, precision.mul(new BN(3)), myDaiToken.address, precision.mul(new BN(215 * 3))); // rate: 215
        await otc.setSellOffer(4, myWethToken.address, precision.mul(new BN(4)), myDaiToken.address, precision.mul(new BN(220 * 4))); // rate: 220

        let result;
        result = await reserve.showBestOffers(myDaiToken.address, false, 3 * 215 + 2 * 220);
        // 3 eth from order 3 and 2 eth from order 4
        Helper.assertEqual(result[0], precision.mul(new BN(5)), "dest amount should be correct");
        Helper.assertEqual(result[1], 5, "dest amount should be correct"); // rounded down
        Helper.assertEqual(result[2].length, 2, "Should take first offer");
        Helper.assertEqual(result[2][0], 3, "Should take correct offer's id");
        Helper.assertEqual(result[2][1], 4, "Should take correct offer's id");
    });

    it("Should test showBestOffers takes biggest skip offer (dai -> eth)", async function() {
        // making median rate is 200
        await otc.setBuyOffer(1, myDaiToken.address, precision.mul(new BN(5 * 190)), myWethToken.address, precision.mul(new BN(5))); // rate: 190
        await otc.setSellOffer(2, myWethToken.address, precision, myDaiToken.address, precision.mul(new BN(210))); // rate: 210
        await otc.setSellOffer(3, myWethToken.address, precision.mul(new BN(2)), myDaiToken.address, precision.mul(new BN(212 * 2))); // rate: 212

        await otc.setSellOffer(4, myWethToken.address, precision.mul(new BN(3)), myDaiToken.address, precision.mul(new BN(216 * 3))); // rate: 216
        await otc.setSellOffer(5, myWethToken.address, precision.mul(new BN(4)), myDaiToken.address, precision.mul(new BN(220 * 4))); // rate: 220

        let result;
        result = await reserve.showBestOffers(myDaiToken.address, false, 3 * 216 + 1.5 * 212);
        // 3 eth from order 4 and 1.5 eth from order 2
        Helper.assertEqual(result[0], precision.mul(new BN(45)).div(new BN(10)), "dest amount should be correct");
        Helper.assertEqual(result[1], 4, "dest amount should be correct"); // rounded down
        Helper.assertEqual(result[2].length, 2, "Should take first offer");
        Helper.assertEqual(result[2][0], 4, "Should take correct offer's id");
        Helper.assertEqual(result[2][1], 3, "Should take correct offer's id");

        // taking biggest skip but not optimal
        result = await reserve.showBestOffers(myDaiToken.address, false, 3 * 216 + 1 * 212);
        // 3 eth from order 4 and 1 eth from order 2
        // actually should take 3 eth from order 4 and 212/210 eth from order 1
        Helper.assertEqual(result[0], precision.mul(new BN(4)), "dest amount should be correct");
        Helper.assertEqual(result[1], 4, "dest amount should be correct"); // rounded down
        Helper.assertEqual(result[2].length, 2, "Should take first offer");
        Helper.assertEqual(result[2][0], 4, "Should take correct offer's id");
        Helper.assertEqual(result[2][1], 3, "Should take correct offer's id");
    });

    it("Should test showBestOffers not enough to take (maxTraverse reached) (dai -> eth)", async function() {
        // making median rate is 200
        await otc.setBuyOffer(1, myDaiToken.address, precision.mul(new BN(5 * 190)), myWethToken.address, precision.mul(new BN(5))); // rate: 190
        await otc.setSellOffer(2, myWethToken.address, precision, myDaiToken.address, precision.mul(new BN(210))); // rate: 210
        await otc.setSellOffer(3, myWethToken.address, precision.mul(new BN(2)), myDaiToken.address, precision.mul(new BN(212 * 2))); // rate: 212

        await otc.setSellOffer(4, myWethToken.address, precision.mul(new BN(10)), myDaiToken.address, precision.mul(new BN(10 * 216))); // rate: 216
        await otc.setSellOffer(5, myWethToken.address, precision, myDaiToken.address, precision.mul(new BN(220))); // rate: 220

        let result;
        result = await reserve.showBestOffers(myDaiToken.address, false, 20 * 200);
        Helper.assertEqual(result[0], 0, "dest amount should be correct");
        Helper.assertEqual(result[1], 0, "dest amount should be correct");
        Helper.assertEqual(result[2].length, 0, "Shouldn't take any offers");
    });

    it("Should test showBestOffers takes maxTakes (not enough and enough src amount) (dai -> eth)", async function() {
        // making median rate is 200
        await otc.setBuyOffer(1, myDaiToken.address, precision.mul(new BN(5 * 190)), myWethToken.address, precision.mul(new BN(5))); // rate: 190
        await otc.setSellOffer(2, myWethToken.address, precision, myDaiToken.address, precision.mul(new BN(210))); // rate: 210
        await otc.setSellOffer(3, myWethToken.address, precision.mul(new BN(4)), myDaiToken.address, precision.mul(new BN(212 * 4))); // rate: 212

        await otc.setSellOffer(4, myWethToken.address, precision.mul(new BN(4)), myDaiToken.address, precision.mul(new BN(216 * 4))); // rate: 216
        await otc.setSellOffer(5, myWethToken.address, precision, myDaiToken.address, precision.mul(new BN(220))); // rate: 220

        let result;
        // not enough src amount to take
        result = await reserve.showBestOffers(myDaiToken.address, false, 10 * 200);
        Helper.assertEqual(result[0], 0, "dest amount should be correct");
        Helper.assertEqual(result[1], 0, "dest amount should be correct");
        Helper.assertEqual(result[2].length, 0, "Shouldn't take first offer");

        // enough src amount to take
        result = await reserve.showBestOffers(myDaiToken.address, false, 4 * 212 + 3 * 216);
        Helper.assertEqual(result[0], precision.mul(new BN(7)), "dest amount should be correct");
        Helper.assertEqual(result[1], 7, "dest amount should be correct"); 
        Helper.assertEqual(result[2].length, 2, "Should take 2 offers");
        Helper.assertEqual(result[2][0], 3, "Should take correct offer's id");
        Helper.assertEqual(result[2][1], 4, "Should take correct offer's id");
    });

    it("Should test showBestOffers takes all offers read (dai -> eth)", async function() {
        // making median rate is 200
        await otc.setBuyOffer(1, myDaiToken.address, precision.mul(new BN(5 * 190)), myWethToken.address, precision.mul(new BN(5))); // rate: 190
        await otc.setSellOffer(2, myWethToken.address, precision.mul(new BN(7)), myDaiToken.address, precision.mul(new BN(210 * 7))); // rate: 210
        await otc.setSellOffer(3, myWethToken.address, precision.mul(new BN(6)), myDaiToken.address, precision.mul(new BN(212 * 6))); // rate: 212

        await otc.setSellOffer(4, myWethToken.address, precision.mul(new BN(10)), myDaiToken.address, precision.mul(new BN(216 * 10))); // rate: 216
        await otc.setSellOffer(5, myWethToken.address, precision.mul(new BN(4)), myDaiToken.address, precision.mul(new BN(220 * 4))); // rate: 220

        let result;
        result = await reserve.showBestOffers(myDaiToken.address, false, 7 * 210 + 4 * 212);
        Helper.assertEqual(result[0], precision.mul(new BN(11)), "dest amount should be correct");
        Helper.assertEqual(result[1], 11, "dest amount should be correct");
        Helper.assertEqual(result[2].length, 2, "Should take 2 offers");
        Helper.assertEqual(result[2][0], 2, "Should take correct offer's id");
        Helper.assertEqual(result[2][1], 3, "Should take correct offer's id");

        result = await reserve.showBestOffers(myDaiToken.address, false, 7 * 210 + 6 * 212 + 10 * 216);
        Helper.assertEqual(result[0], precision.mul(new BN(23)), "dest amount should be correct");
        Helper.assertEqual(result[1], 23, "dest amount should be correct");
        Helper.assertEqual(result[2].length, 3, "Should take 3 offers");
        Helper.assertEqual(result[2][0], 2, "Should take correct offer's id");
        Helper.assertEqual(result[2][1], 3, "Should take correct offer's id");
        Helper.assertEqual(result[2][2], 4, "Should take correct offer's id");
    });

    it("Should test showBestOffers not take any offers as amount is lower than minOrderSize (dai -> eth)", async function() {
        // making median rate is 200
        await otc.setBuyOffer(1, myDaiToken.address, precision.mul(new BN(5 * 190)), myWethToken.address, precision.mul(new BN(5))); // rate: 190
        await otc.setSellOffer(2, myWethToken.address, precision, myDaiToken.address, precision.mul(new BN(210 * 2))); // rate: 210
        await otc.setSellOffer(3, myWethToken.address, precision, myDaiToken.address, precision.mul(new BN(212 * 2))); // rate: 212

        await otc.setSellOffer(4, myWethToken.address, precision.mul(new BN(25)).div(new BN(10)), myDaiToken.address, precision.mul(new BN(216 * 2.5))); // rate: 216
        await otc.setSellOffer(5, myWethToken.address, precision.mul(new BN(26)).div(new BN(10)), myDaiToken.address, precision.mul(new BN(220 * 26)).div(new BN(10))); // rate: 220
        await otc.setSellOffer(6, myWethToken.address, precision.mul(new BN(26)).div(new BN(10)), myDaiToken.address, precision.mul(new BN(225)).div(new BN(10))); // rate: 225
        await otc.setSellOffer(7, myWethToken.address, precision.mul(new BN(10)), myDaiToken.address, precision.mul(new BN(10 * 230))); // rate: 230

        let result;
        // equivalent eth: 10, min order size: 2.6375, max traverse: 5
        result = await reserve.showBestOffers(myDaiToken.address, false, 10 * 200);
        Helper.assertEqual(result[0], 0, "dest amount should be correct");
        Helper.assertEqual(result[1], 0, "dest amount should be correct");
        Helper.assertEqual(result[2].length, 0, "Shouldn't take any offers");
    });

    it("Should test showBestOffers traverse only maxTraverse offer (dai -> eth)", async function() {
        await otc.setBuyOffer(1, myDaiToken.address, precision.mul(new BN(190 * 1)), myWethToken.address, precision); // rate: 190
        for(let id = 1; id <= maxTraverse; id++) {
            await otc.setSellOffer(id + 1, myWethToken.address, precision, myDaiToken.address, precision.mul(new BN(210))); // rate: 210
        }
        await otc.setSellOffer(maxTraverse + 2, myWethToken.address, precision.mul(new BN(400)), myDaiToken.address, precision.mul(new BN(220 * 400))); // rate: 220

        let result = await reserve.showBestOffers(myDaiToken.address, false, 400 * 220);
        Helper.assertEqual(result[0], 0, "dest amount should be correct");
        Helper.assertEqual(result[1], 0, "dest amount should be correct");
        Helper.assertEqual(result[2].length, 0, "Shouldn't take any offers");

        await otc.resetOffersData();
        await otc.setBuyOffer(1, myDaiToken.address, precision.mul(new BN(190 * 1)), myWethToken.address, precision.mul(new BN(5))); // rate: 190
        for(let id = 1; id < maxTraverse; id++) {
            await otc.setSellOffer(id + 1, myWethToken.address, precision, myDaiToken.address, precision.mul(new BN(210))); // rate: 210
        }
        await otc.setSellOffer(maxTraverse + 1, myWethToken.address, precision.mul(new BN(400)), myDaiToken.address, precision.mul(new BN(220 * 400))); // rate: 220

        result = await reserve.showBestOffers(myDaiToken.address, false, 400 * 220);
        Helper.assertEqual(result[0], precision.mul(new BN(400)), "dest amount should be correct");
        Helper.assertEqual(result[1], 400, "dest amount should be correct");
        Helper.assertEqual(result[2].length, 1, "Should take last offer");
        Helper.assertEqual(result[2][0], maxTraverse + 1, "Should take last offer");
    });

    it("Should test showBestOffers takes only maxTakes offers (dai -> eth)", async function() {
        await otc.setBuyOffer(1, myDaiToken.address, precision.mul(new BN(190 * 1)), myWethToken.address, precision); // rate: 190
        for(let id = 1; id <= maxTraverse; id++) {
            await otc.setSellOffer(id + 1, myWethToken.address, precision.mul(new BN(30)), myDaiToken.address, precision.mul(new BN(210 * 30))); // rate: 210
        }

        let result = await reserve.showBestOffers(myDaiToken.address, false, maxTake.mul(new BN(30 * 210)).add(new BN(1)));
        Helper.assertEqual(result[0], 0, "dest amount should be correct");
        Helper.assertEqual(result[1], 0, "dest amount should be correct");
        Helper.assertEqual(result[2].length, 0, "Shouldn't take any offers");

        result = await reserve.showBestOffers(myDaiToken.address, false, maxTake.mul(new BN(30 * 210)));
        Helper.assertEqual(result[0], precision.mul(maxTake.mul(new BN(30))), "dest amount should be correct");
        Helper.assertEqual(result[1], maxTake.mul(new BN(30)), "dest amount should be correct");
        Helper.assertEqual(result[2].length, maxTake, "Should take correct number offers");
        for(let id = 1; id <= maxTake; id++) {
            Helper.assertEqual(result[2][id - 1], id + 1, "Should take correct offer's id");
        }

        await otc.resetOffersData();
    });

    // test init reserve contract
    it("Should test can not init reserve contract with invalid arguments", async function() {
        try {
            _ = await Eth2DaiReserve.new(zeroAddress, feeBps, otc.address, myWethToken.address, admin);
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
            _ = await Eth2DaiReserve.new(network, feeBps, zeroAddress, myWethToken.address, admin);
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
        try {
            _ = await Eth2DaiReserve.new(network, feeBps, otc.address, zeroAddress, admin);
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
        try {
            _ = await Eth2DaiReserve.new(network, feeBps, otc.address, myWethToken.address, zeroAddress);
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
        _ = await Eth2DaiReserve.new(network, feeBps, otc.address, myWethToken.address, admin);
    });

    it("Should test can not list empty token", async function() {
        try {
            await reserve.listToken(zeroAddress, {from: admin});
            assert(false, "throw was expected in line above.")
        } catch(e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("Should test can not list token if it is already listed", async function() {
        let newToken = await TestToken.new("test token", "test", 18);
        await reserve.listToken(newToken.address, {from: admin});
        try {
            await reserve.listToken(newToken.address, {from: admin});
            assert(false, "throw was expected in line above.")
        } catch(e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
        await reserve.delistToken(newToken.address, {from: admin});
    });

    it("Should test can not list token with decimals is not 18", async function() {
        let newToken = await TestToken.new("test token", "test", 10);
        try {
            await reserve.listToken(newToken.address, {from: admin});
            assert(false, "throw was expected in line above.")
        } catch(e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("Should test can not delist token if it not listed", async function() {
        let newToken = await TestToken.new("test token", "test", 18);
        try {
            await reserve.delistToken(newToken.address, {from: admin});
            assert(false, "throw was expected in line above.")
        } catch(e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
        await reserve.listToken(newToken.address, {from: admin});
        await reserve.delistToken(newToken.address, {from: admin});
    });

    it("Should test can not set fee of 10000", async function() {
        await reserve.setFeeBps(feeBps, {from: admin});
        try {
            await reserve.setFeeBps(10000, {from: admin});
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("Should test can not set fee sender is not admin", async function() {
        await reserve.setFeeBps(feeBps, {from: admin});
        try {
            await reserve.setFeeBps(feeBps, {from: user});
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
                minSupportX, minSupportY, minSupport,
                {from: admin}
            )
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
        await reserve.listToken(newToken.address, {from: admin});
        await reserve.setTokenConfigData(
            newToken.address,
            maxTraverse, maxTraverseX, maxTraverseY,
            maxTake, maxTakeX, maxTakeY,
            minSupportX, minSupportY, minSupport,
            {from: admin}
        )
        await reserve.delistToken(newToken.address, {from: admin});
    });

    it("Should test can not set token info sender is not admin", async function() {
        try {
            await reserve.setTokenConfigData(
                myDaiToken.address,
                maxTraverse, maxTraverseX, maxTraverseY,
                maxTake, maxTakeX, maxTakeY,
                minSupportX, minSupportY, minSupport,
                {from: user}
            )
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("Should test can not set token info with amount is out of range", async function() {
        let BN32 = (new BN(2)).pow(new BN(32));
        let BN96 = (new BN(2)).pow(new BN(96));
        try {
            await reserve.setTokenConfigData(
                myDaiToken.address,
                BN32, maxTraverseX, maxTraverseY,
                maxTake, maxTakeX, maxTakeY,
                minSupportX, minSupportY, minSupport,
                {from: admin}
            )
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await reserve.setTokenConfigData(
                myDaiToken.address,
                maxTraverse, BN32, maxTraverseY,
                maxTake, maxTakeX, maxTakeY,
                minSupportX, minSupportY, minSupport,
                {from: admin}
            )
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await reserve.setTokenConfigData(
                myDaiToken.address,
                maxTraverse, maxTraverseX, BN32,
                maxTake, maxTakeX, maxTakeY,
                minSupportX, minSupportY, minSupport,
                {from: admin}
            )
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await reserve.setTokenConfigData(
                myDaiToken.address,
                maxTraverse, maxTraverseX, maxTraverseY,
                BN32, maxTakeX, maxTakeY,
                minSupportX, minSupportY, minSupport,
                {from: admin}
            )
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await reserve.setTokenConfigData(
                myDaiToken.address,
                maxTraverse, maxTraverseX, maxTraverseY,
                maxTake, BN32, maxTakeY,
                minSupportX, minSupportY, minSupport,
                {from: admin}
            )
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await reserve.setTokenConfigData(
                myDaiToken.address,
                maxTraverse, maxTraverseX, maxTraverseY,
                maxTake, maxTakeX, BN32,
                minSupportX, minSupportY, minSupport,
                {from: admin}
            )
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await reserve.setTokenConfigData(
                myDaiToken.address,
                maxTraverse, maxTraverseX, maxTraverseY,
                maxTake, maxTakeX, maxTakeY,             BN32, minSupportY, minSupport,
                {from: admin}
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
                minSupportX, BN32, minSupport,
                {from: admin}
            )
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        BN32 = BN32.sub(new BN(1));
        BN96 = BN96.sub(new BN(1));

        await reserve.setTokenConfigData(
            myDaiToken.address,
            BN32, BN32, BN32,
            BN32, BN32, BN32,
            BN32, BN32, BN96,
            {from: admin}
        )

        await reserve.setTokenConfigData(
            myDaiToken.address,
            maxTraverse, maxTraverseX, maxTraverseY,
            maxTake, maxTakeX, maxTakeY,
            minSupportX, minSupportY, minSupport,
            {from: admin}
        )
    });

    // test setting contracts
    it("Should test can not set contracts with invalid network or otc", async function() {
        try {
            await reserve.setContracts(zeroAddress, otc.address, {from: admin});
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
        try {
            await reserve.setContracts(network, zeroAddress, {from: admin});
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
        try {
            await reserve.setContracts(zeroAddress, zeroAddress, {from: admin});
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
        await reserve.setContracts(network, otc.address, {from: admin});
    });

    it("Should test trade with trade is not enable", async function() {
        // making median rate is 200
        await otc.setBuyOffer(1, myDaiToken.address, precision.mul(new BN(20 * 190)), myWethToken.address, precision.mul(new BN(20))); // rate: 190
        await otc.setSellOffer(2, myWethToken.address, precision.mul(new BN(20)), myDaiToken.address, precision.mul(new BN(210 * 20))); // rate: 210

        let amountEth = (new BN(10)).pow(new BN(18));
        let amountDai = (new BN(10)).pow(new BN(18)).mul(new BN(200));
        let eth2daiRate = await reserve.getConversionRate(ethAddress, myDaiToken.address, amountEth, 0);
        let dai2ethRate = await reserve.getConversionRate(myDaiToken.address, ethAddress, amountDai, 0);

        Helper.assertGreater(eth2daiRate, 0, "should have rate eth to dai");
        Helper.assertGreater(dai2ethRate, 0, "should have rate dai to eth");

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
        await otc.setBuyOffer(1, myDaiToken.address, precision.mul(new BN(20 * 190)), myWethToken.address, precision.mul(new BN(20))); // rate: 190
        await otc.setSellOffer(2, myWethToken.address, precision.mul(new BN(20)), myDaiToken.address, precision.mul(new BN(210 * 20))); // rate: 210

        let amountEth = (new BN(10)).pow(new BN(18));
        let amountDai = (new BN(10)).pow(new BN(18)).mul(new BN(200));
        let eth2daiRate = await reserve.getConversionRate(ethAddress, myDaiToken.address, amountEth, 0);
        let dai2ethRate = await reserve.getConversionRate(myDaiToken.address, ethAddress, amountDai, 0);

        try {
            await reserve.trade(ethAddress, amountEth, myDaiToken.address, user, eth2daiRate, true, {from: user, value: amountEth});
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await reserve.trade(myDaiToken.address, amountDai, ethAddress, user, dai2ethRate, true, {from: user});
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("Should test trade token is invalid (src & dest are not ETH or token is not listed)", async function() {
        // making median rate is 200
        await otc.setBuyOffer(1, myDaiToken.address, precision.mul(new BN(20 * 190)), myWethToken.address, precision.mul(new BN(20))); // rate: 190
        await otc.setSellOffer(2, myWethToken.address, precision.mul(new BN(20)), myDaiToken.address, precision.mul(new BN(210 * 20))); // rate: 210

        let amountEth = (new BN(10)).pow(new BN(18));
        let amountDai = (new BN(10)).pow(new BN(18)).mul(new BN(200));

        let eth2daiRate = await reserve.getConversionRate(ethAddress, myDaiToken.address, amountEth, 0);
        let dai2ethRate = await reserve.getConversionRate(myDaiToken.address, ethAddress, amountDai, 0);

        let token = await TestToken.new("test token", "tst", 18);
        await token.transfer(user, (new BN(2)).pow(new BN(18)).mul(new BN(1000)));
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
        await otc.setBuyOffer(1, myDaiToken.address, precision.mul(new BN(20 * 190)), myWethToken.address, precision.mul(new BN(20))); // rate: 190
        await otc.setSellOffer(2, myWethToken.address, precision.mul(new BN(20)), myDaiToken.address, precision.mul(new BN(210 * 20))); // rate: 210

        let amountEth = (new BN(10)).pow(new BN(18));
        let amountDai = (new BN(10)).pow(new BN(18)).mul(new BN(200));
        let eth2daiRate = await reserve.getConversionRate(ethAddress, myDaiToken.address, amountEth, 0);
        let dai2ethRate = await reserve.getConversionRate(myDaiToken.address, ethAddress, amountDai, 0);

        try {
            await reserve.trade(ethAddress, amountEth, myDaiToken.address, user, eth2daiRate, false, {from: network, value: 0});
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await reserve.trade(ethAddress, amountEth, myDaiToken.address, user, eth2daiRate, false, {from: network, value: amountEth.sub(new BN(10))});
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
        await otc.setBuyOffer(1, myDaiToken.address, precision.mul(new BN(20 * 190)), myWethToken.address, precision.mul(new BN(20))); // rate: 190
        await otc.setSellOffer(2, myWethToken.address, precision.mul(new BN(20)), myDaiToken.address, precision.mul(new BN(210 * 20))); // rate: 210

        let amountEth = (new BN(10)).pow(new BN(18));
        let amountDai = daiTokenInewi.mul(new BN(200));

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
        await otc.setBuyOffer(1, myDaiToken.address, precision.mul(new BN(20 * 190)), myWethToken.address, precision.mul(new BN(20))); // rate: 190
        await otc.setSellOffer(2, myWethToken.address, precision.mul(new BN(20)), myDaiToken.address, precision.mul(new BN(210 * 20))); // rate: 210

        let amountEth = (new BN(1)).mul(precision);
        let amountDai = (new BN(200)).mul(precision);

        await reserve.setFeeBps(0, {from: admin});

        let eth2daiRate = await reserve.getConversionRate(ethAddress, myDaiToken.address, amountEth, 0);
        let dai2ethRate = await reserve.getConversionRate(myDaiToken.address, ethAddress, amountDai, 0);

        try {
            await reserve.trade(ethAddress, amountEth, myDaiToken.address, user, eth2daiRate.add(new BN(2)), true, {from: network, value: amountEth});
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await reserve.trade(myDaiToken.address, amountDai, ethAddress, user, dai2ethRate.add(new BN(2)), true, {from: network});
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        await reserve.trade(ethAddress, amountEth, myDaiToken.address, user, eth2daiRate, true, {from: network, value: amountEth});
        await myDaiToken.transfer(network, amountDai);
        await reserve.trade(myDaiToken.address, amountDai, ethAddress, user, dai2ethRate, true, {from: network});
        await reserve.setFeeBps(feeBps, {from: admin});
    });

    it("Should test trade is reverted conversion rate enables internal inventory but not have enough balances for internal inventory", async function() {
        // making median rate is 200
        await otc.setBuyOffer(1, myDaiToken.address, precision.mul(new BN(20 * 190)), myWethToken.address, precision.mul(new BN(20))); // rate: 190
        await otc.setSellOffer(2, myWethToken.address, precision.mul(new BN(20)), myDaiToken.address, precision.mul(new BN(210 * 20))); // rate: 210

        let amountEth = (new BN(1)).mul(precision);
        let amountDai = (new BN(200)).mul(precision);

        let eth2daiRate = await reserve.getConversionRate(ethAddress, myDaiToken.address, amountEth, 0);
        let dai2ethRate = await reserve.getConversionRate(myDaiToken.address, ethAddress, amountDai, 0);

        try {
            await reserve.trade(ethAddress, amountEth, myDaiToken.address, user, eth2daiRate.sub(new BN(1)), true, {from: network, value: amountEth});
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await reserve.trade(myDaiToken.address, amountDai, ethAddress, user, dai2ethRate.sub(new BN(1)), true, {from: network});
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("Should test trade is reverted conversion rate > 0 but actual rate is 0", async function() {
        let amountEth = (new BN(1)).mul(precision);
        let amountDai = (new BN(200)).mul(precision);

        await otc.resetOffersData();
        let eth2daiRate = await reserve.getConversionRate(ethAddress, myDaiToken.address, amountEth, 0);
        let dai2ethRate = await reserve.getConversionRate(myDaiToken.address, ethAddress, amountDai, 0);
        Helper.assertEqual(eth2daiRate, 0, "eth to dai rate should be 0");
        Helper.assertEqual(dai2ethRate, 0, "eth to dai rate should be 0");

        try {
            await reserve.trade(ethAddress, amountEth, myDaiToken.address, user, (new BN(10)).pow(new BN(18)).mul(new BN(200)), true, {from: network, value: amountEth});
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await reserve.trade(myDaiToken.address, amountDai, ethAddress, user, daiTokenInewi.div(new BN(200)), true, {from: network});
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        await otc.setSellOffer(2, myWethToken.address, precision.mul(new BN(20)), myDaiToken.address, precision.mul(new BN(210 * 20))); // rate: 210
        // not have buy offer, dai -> eth should be still failed
        dai2ethRate = await reserve.getConversionRate(myDaiToken.address, ethAddress, amountDai, 0);
        Helper.assertEqual(dai2ethRate, 0, "eth to dai rate should be 0");
        try {
            await reserve.trade(myDaiToken.address, amountDai, ethAddress, user, (new BN(10)).pow(new BN(18)).div(new BN(200)), true, {from: network});
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        await otc.setBuyOffer(1, myDaiToken.address, precision.mul(new BN(20 * 220)), myWethToken.address, precision.mul(new BN(20))); // rate: 220
        // spread is not ok, dai -> eth should be still fail
        dai2ethRate = await reserve.getConversionRate(myDaiToken.address, ethAddress, amountDai, 0);
        Helper.assertEqual(dai2ethRate, 0, "eth to dai rate should be 0");
        try {
            await reserve.trade(myDaiToken.address, amountDai, ethAddress, user, (new BN(10)).pow(new BN(18)).div(new BN(200)), true, {from: network});
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
        await otc.resetOffersData();
        // making median rate is 200
        await otc.setBuyOffer(1, myDaiToken.address, precision.mul(new BN(20 * 190)), myWethToken.address, precision.mul(new BN(20))); // rate: 190
        await otc.setSellOffer(2, myWethToken.address, precision.mul(new BN(20)), myDaiToken.address, precision.mul(new BN(210 * 20))); // rate: 210

        amountEth = (new BN(21)).mul(precision);
        amountDai = (new BN(21)).mul(precision).mul(new BN(220));

        try {
            await reserve.trade(ethAddress, amountEth, myDaiToken.address, user, (new BN(10)).pow(new BN(18)).mul(new BN(200)), true, {from: network, value: amountEth});
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
        try {
            await reserve.trade(myDaiToken.address, amountDai, ethAddress, user, (new BN(10)).pow(new BN(18)).div(new BN(200)), true, {from: network});
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("Should test few buy and sell trades with correct offers taken from showBestOffers & correct balances change", async function() {
        // making median rate is 200
        await otc.setBuyOffer(1, myDaiToken.address, precision.mul(new BN(2 * 190)), myWethToken.address, precision.mul(new BN(2)));
        await otc.setBuyOffer(2, myDaiToken.address, precision.mul(new BN(4 * 188)), myWethToken.address, precision.mul(new BN(4)));
        await otc.setBuyOffer(3, myDaiToken.address, precision.mul(new BN(6 * 185)), myWethToken.address, precision.mul(new BN(6)));
        await otc.setBuyOffer(4, myDaiToken.address, precision.mul(new BN(8 * 180)), myWethToken.address, precision.mul(new BN(8)));
        await otc.setBuyOffer(5, myDaiToken.address, precision.mul(new BN(12 * 178)), myWethToken.address, precision.mul(new BN(12)));

        await otc.setSellOffer(6, myWethToken.address, precision.mul(new BN(2)), myDaiToken.address, precision.mul(new BN(210 * 2)));
        await otc.setSellOffer(7, myWethToken.address, precision.mul(new BN(3)), myDaiToken.address, precision.mul(new BN(212 * 3)));
        await otc.setSellOffer(8, myWethToken.address, precision.mul(new BN(4)), myDaiToken.address, precision.mul(new BN(216 * 4)));
        await otc.setSellOffer(9, myWethToken.address, precision.mul(new BN(5)), myDaiToken.address, precision.mul(new BN(220 * 5)));
        await otc.setSellOffer(10, myWethToken.address, precision.mul(new BN(12)), myDaiToken.address, precision.mul(new BN(225 * 12)));

        for(let i = 1; i <= 10; i++) {
            let amountEth = (new BN(i)).mul(precision).mul(new BN(2));
            let amountDai = (new BN(i)).mul(precision).mul(new BN(200 + i * 2)).mul(new BN(2));

            await Helper.sendEtherWithPromise(user, network, amountEth);
            await myDaiToken.transfer(network, amountDai);

            let expectedUserETHBal = await Helper.getBalancePromise(user);
            let expectedUserDaiBal = await myDaiToken.balanceOf(user);

            let offersEthToken = await reserve.showBestOffers(myDaiToken.address, true, amountEth.div(precision));
            let offersTokenEth = await reserve.showBestOffers(myDaiToken.address, false, amountDai.div(precision));

            let eth2daiRate = await reserve.getConversionRate(ethAddress, myDaiToken.address, amountEth, 0);
            let dai2ethRate = await reserve.getConversionRate(myDaiToken.address, ethAddress, amountDai, 0);

            let rate = Helper.calcRateFromQty(amountEth, offersEthToken[0], tokenDecimals, tokenDecimals);
            rate = Helper.addBps(rate, -1 * feeBps);
            rate = applyInternalInventory(rate, false);
            Helper.assertEqual(rate, eth2daiRate, "eth to dai rate should be correct, loop: " + i);

            rate = Helper.calcRateFromQty(amountDai, offersTokenEth[0], tokenDecimals, tokenDecimals);
            rate = Helper.addBps(rate, -1 * feeBps);
            rate = applyInternalInventory(rate, false);
            Helper.assertEqual(rate, dai2ethRate, "dai to eth rate should be correct, loop: " + i);

            expectedUserDaiBal = expectedUserDaiBal.add(Helper.calcDstQty(amountEth, tokenDecimals, tokenDecimals, eth2daiRate));
            await reserve.trade(ethAddress, amountEth, myDaiToken.address, user, eth2daiRate, true, {from: network, value: amountEth});

            let newUserEthBal = await Helper.getBalancePromise(user);
            let newUserDaiBal = await myDaiToken.balanceOf(user);

            Helper.assertEqual(expectedUserETHBal, newUserEthBal, "eth balance should be correct after traded, loop: " + i);
            Helper.assertEqual(expectedUserDaiBal, newUserDaiBal, "dai balance should be correct after traded, loop: " + i);

            expectedUserETHBal = expectedUserETHBal.add(Helper.calcDstQty(amountDai, tokenDecimals, tokenDecimals, dai2ethRate));
            await reserve.trade(myDaiToken.address, amountDai, ethAddress, user, dai2ethRate, true, {from: network});

            newUserEthBal = await Helper.getBalancePromise(user);
            newUserDaiBal = await myDaiToken.balanceOf(user);

            Helper.assertEqual(expectedUserDaiBal, newUserDaiBal, "dai balance should be correct after traded, loop: " + i);
            Helper.assertEqual(expectedUserETHBal, newUserEthBal, "eth balance should be correct after traded, loop: " + i);
        }
    });

    it("Should test set internal inventory failed sender is not admin", async function() {
        try {
            await reserve.setInternalInventoryData(
                myDaiToken.address,
                true,
                0,
                0,
                0,
                0,
                {from: operator}
            )
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("Should test set internal inventory failed token is not listed", async function() {
        let token = await TestToken.new("test token", "tst", 18);
        try {
            await reserve.setInternalInventoryData(
                token.address,
                true,
                0,
                0,
                0,
                0,
                {from: admin}
            )
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("Should test set internal inventory failed data is out of range", async function() {
        let power32 = (new BN(2)).pow(new BN(32));
        let power95 = (new BN(2)).pow(new BN(95));
        let power96 = power95.mul(new BN(2));

        // min spread is out of range
        try {
            await reserve.setInternalInventoryData(
                myDaiToken.address,
                true,
                minDaiBal,
                maxDaiBal,
                pricePremiumBps,
                power32,
                {from: admin}
            )
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        // price premium bps is out of range
        try {
            await reserve.setInternalInventoryData(
                myDaiToken.address,
                true,
                minDaiBal,
                maxDaiBal,
                power32,
                minSpreadInBps,
                {from: admin}
            )
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        // max dail bal is out of range
        try {
            await reserve.setInternalInventoryData(
                myDaiToken.address,
                true,
                minDaiBal,
                power96,
                pricePremiumBps,
                minSpreadInBps,
                {from: admin}
            )
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        // min dail bal is out of range
        try {
            await reserve.setInternalInventoryData(
                myDaiToken.address,
                true,
                power95,
                maxDaiBal,
                pricePremiumBps,
                minSpreadInBps,
                {from: admin}
            )
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        // all overflow
        try {
            await reserve.setInternalInventoryData(
                myDaiToken.address,
                true,
                power95,
                power96,
                power32,
                power32,
                {from: admin}
            )
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("Should test set internal inventory successfully and correct data set", async function() {
        await reserve.setInternalInventoryData(
            myDaiToken.address,
            true,
            minDaiBal,
            maxDaiBal,
            pricePremiumBps,
            minSpreadInBps,
            {from: admin}
        )

        let data = await reserve.getInternalInventoryDataPub(myDaiToken.address);
        Helper.assertEqual(data[0], true, "internal inventory should be enabled");
        Helper.assertEqual(data[1], minDaiBal, "min dai bal should be correct");
        Helper.assertEqual(data[2], maxDaiBal, "max dai bal should be correct");
        Helper.assertEqual(data[3], pricePremiumBps, "price premiums should be correct");
        Helper.assertEqual(data[4], minSpreadInBps, "internal inventory should be correct");

        await reserve.setInternalInventoryData(
            myDaiToken.address,
            false,
            minDaiBal,
            maxDaiBal,
            pricePremiumBps,
            minSpreadInBps,
            {from: admin}
        )

        data = await reserve.getInternalInventoryDataPub(myDaiToken.address);
        Helper.assertEqual(data[0], false, "internal inventory should be disabled");
        Helper.assertEqual(data[1], minDaiBal, "min dai bal should be correct");
        Helper.assertEqual(data[2], maxDaiBal, "max dai bal should be correct");
        Helper.assertEqual(data[3], pricePremiumBps, "price premiums should be correct");
        Helper.assertEqual(data[4], minSpreadInBps, "internal inventory should be correct");
    });

    it("Should test disable internal inventory and get rate as expected", async function() {
        await reserve.setInternalInventoryData(
            myDaiToken.address,
            false,
            minDaiBal,
            maxDaiBal,
            pricePremiumBps,
            minSpreadInBps,
            {from: admin}
        )

        await reserve.setFeeBps(feeBps, {from: admin});

        await otc.setBuyOffer(1, myDaiToken.address, precision.mul(new BN(5 * 190)), myWethToken.address, precision.mul(new BN(5))); // rate: 190
        await otc.setSellOffer(2, myWethToken.address, precision.mul(new BN(5)), myDaiToken.address, precision.mul(new BN(210 * 5))); // rate: 210

        let expectedEth2DaiRate = (new BN(190)).mul(precision);
        expectedEth2DaiRate = Helper.addBps(expectedEth2DaiRate, -1 * feeBps);
        expectedEth2DaiRate = applyInternalInventory(expectedEth2DaiRate, false);

        let expectedDai2EthRate = precision.div(new BN(210));
        expectedDai2EthRate = Helper.addBps(expectedDai2EthRate, -1 * feeBps);
        expectedDai2EthRate = applyInternalInventory(expectedDai2EthRate, false);

        let eth2DaiRate = await reserve.getConversionRate(ethAddress, myDaiToken.address, precision, 0);
        let dai2EthRate = await reserve.getConversionRate(myDaiToken.address, ethAddress, precision.mul(new BN(100)), 0);

        Helper.assertEqual(expectedEth2DaiRate, eth2DaiRate, "rate eth -> dai is not correct");
        Helper.assertEqual(expectedDai2EthRate, dai2EthRate, "rate dai -> eth is not correct");
    });

    it("Should test not use internal inventory when not enough eth & token ", async function() {
        await reserve.setInternalInventoryData(
            myDaiToken.address,
            true,
            minDaiBal,
            maxDaiBal,
            pricePremiumBps,
            minSpreadInBps,
            {from: admin}
        )

        await reserve.setFeeBps(feeBps, {from: admin});

        await otc.setBuyOffer(1, myDaiToken.address, precision.mul(new BN(5 * 190)), myWethToken.address, precision.mul(new BN(5))); // rate: 190
        await otc.setSellOffer(2, myWethToken.address, precision.mul(new BN(5)), myDaiToken.address, precision.mul(new BN(210 * 5))); // rate: 210

        let expectedEth2DaiRate = (new BN(190)).mul(precision);
        expectedEth2DaiRate = Helper.addBps(expectedEth2DaiRate, -1 * feeBps);
        expectedEth2DaiRate = applyInternalInventory(expectedEth2DaiRate, false);

        let expectedDai2EthRate = precision.div(new BN(210));
        expectedDai2EthRate = Helper.addBps(expectedDai2EthRate, -1 * feeBps);
        expectedDai2EthRate = applyInternalInventory(expectedDai2EthRate, false);

        let balance = await Helper.getBalancePromise(reserve.address);
        let tokenBal = await myDaiToken.balanceOf(reserve.address);

        // withdraw all ETH and token
        await reserve.withdrawEther(balance, user, {from: admin});
        await reserve.withdrawToken(myDaiToken.address, tokenBal, user, {from: admin});

        balance = precision.sub(new BN(1));
        tokenBal = precision.mul(new BN(190)).sub(new BN(1));
        await Helper.sendEtherWithPromise(user, reserve.address, balance);
        await myDaiToken.transfer(reserve.address, tokenBal);

        // sell 1 eth for 190 dai, but not enough 190 dai in the reserve
        let eth2DaiRate = await reserve.getConversionRate(ethAddress, myDaiToken.address, precision, 0);
        // sell 210 dai for 1 eth, but not enough 1 eth in the reserve
        let dai2EthRate = await reserve.getConversionRate(myDaiToken.address, ethAddress, precision.mul(new BN(210)), 0);

        Helper.assertEqual(expectedEth2DaiRate, eth2DaiRate, "rate eth -> dai is not correct");
        Helper.assertEqual(expectedDai2EthRate, dai2EthRate, "rate dai -> eth is not correct");
    });

    it("Should test not use internal inventory when after trade token balance will be lower than min token bal", async function() {
        await reserve.setInternalInventoryData(
            myDaiToken.address,
            true,
            minDaiBal,
            maxDaiBal,
            pricePremiumBps,
            minSpreadInBps,
            {from: admin}
        )

        await reserve.setFeeBps(feeBps, {from: admin});

        await otc.setBuyOffer(1, myDaiToken.address, precision.mul(new BN(5 * 190)), myWethToken.address, precision.mul(new BN(5))); // rate: 190
        await otc.setSellOffer(2, myWethToken.address, precision.mul(new BN(5)), myDaiToken.address, precision.mul(new BN(210 * 5))); // rate: 210

        let expectedEth2DaiRate = (new BN(190)).mul(precision);
        expectedEth2DaiRate = Helper.addBps(expectedEth2DaiRate, -1 * feeBps);
        expectedEth2DaiRate = applyInternalInventory(expectedEth2DaiRate, false);

        let tokenBal = await myDaiToken.balanceOf(reserve.address);

        await reserve.withdrawToken(myDaiToken.address, tokenBal, user, {from: admin});

        tokenBal = precision.mul(new BN(190)).add(minDaiBal).sub(new BN(1));
        await myDaiToken.transfer(reserve.address, tokenBal);

        let eth2DaiRate = await reserve.getConversionRate(ethAddress, myDaiToken.address, precision, 0);

        Helper.assertEqual(expectedEth2DaiRate, eth2DaiRate, "rate eth -> dai is not correct");
    });

    it("Should test not use internal inventory when after trade token balance will be higher than max token bal", async function() {
        await reserve.setInternalInventoryData(
            myDaiToken.address,
            true,
            minDaiBal,
            maxDaiBal,
            pricePremiumBps,
            minSpreadInBps,
            {from: admin}
        )

        await reserve.setFeeBps(feeBps, {from: admin});

        await otc.setBuyOffer(1, myDaiToken.address, precision.mul(new BN(5 * 190)), myWethToken.address, precision.mul(new BN(5))); // rate: 190
        await otc.setSellOffer(2, myWethToken.address, precision.mul(new BN(5)), myDaiToken.address, precision.mul(new BN(210 * 5))); // rate: 210

        let expectedDai2EthRate = precision.div(new BN(210));
        expectedDai2EthRate = Helper.addBps(expectedDai2EthRate, -1 * feeBps);
        expectedDai2EthRate = applyInternalInventory(expectedDai2EthRate, false);

        let ethBal = await Helper.getBalancePromise(reserve.address);
        let tokenBal = await myDaiToken.balanceOf(reserve.address);

        // withdraw all ETH and token
        await reserve.withdrawEther(ethBal, user, {from: admin});
        await reserve.withdrawToken(myDaiToken.address, tokenBal, user, {from: admin});

        ethBal = precision.mul(new BN(2));
        tokenBal = maxDaiBal.sub(precision.mul(new BN(190))).add(new BN(1));
        await Helper.sendEtherWithPromise(user, reserve.address, ethBal);
        await myDaiToken.transfer(reserve.address, tokenBal);

        let dai2EthRate = await reserve.getConversionRate(myDaiToken.address, ethAddress, precision.mul(new BN(210)), 0);

        Helper.assertEqual(expectedDai2EthRate, dai2EthRate, "rate dai -> eth is not correct");
    });

    it("Should test not use internal inventory spread is not ok", async function() {
        await reserve.setInternalInventoryData(
            myDaiToken.address,
            true,
            minDaiBal,
            maxDaiBal,
            pricePremiumBps,
            minSpreadInBps,
            {from: admin}
        )

        await reserve.setFeeBps(feeBps, {from: admin});

        await otc.setBuyOffer(1, myDaiToken.address, precision.mul(new BN(5 * 210)), myWethToken.address, precision.mul(new BN(5))); // rate: 210
        await otc.setSellOffer(2, myWethToken.address, precision.mul(new BN(5)), myDaiToken.address, precision.mul(new BN(190 * 5))); // rate: 190

        let expectedEth2DaiRate = precision.mul(new BN(210));
        expectedEth2DaiRate = Helper.addBps(expectedEth2DaiRate, -1 * feeBps);
        expectedEth2DaiRate = applyInternalInventory(expectedEth2DaiRate, false);

        let ethBal = await Helper.getBalancePromise(reserve.address);
        let tokenBal = await myDaiToken.balanceOf(reserve.address);

        // withdraw all ETH and token
        await reserve.withdrawEther(ethBal, user, {from: admin});
        await reserve.withdrawToken(myDaiToken.address, tokenBal, user, {from: admin});

        ethBal = precision.mul(new BN(2));
        tokenBal = minDaiBal.add(precision.mul(new BN(190)).mul(new BN(2)));

        await Helper.sendEtherWithPromise(user, reserve.address, ethBal);
        await myDaiToken.transfer(reserve.address, tokenBal);

        let eth2DaiRate = await reserve.getConversionRate(ethAddress, myDaiToken.address, precision, 0);

        Helper.assertEqual(expectedEth2DaiRate, eth2DaiRate, "rate eth -> dai is not correct");
    });

    it("Should test not use internal inventory spread is lower than minSpreadBps", async function() {

        await reserve.setFeeBps(feeBps, {from: admin});

        await otc.setBuyOffer(1, myDaiToken.address, precision.mul(new BN(5 * 190)), myWethToken.address, precision.mul(new BN(5)));
        await otc.setSellOffer(2, myWethToken.address, precision.mul(new BN(5)), myDaiToken.address, precision.mul(new BN(210 * 5)));

        // spread: 20 / 190 = ~1052 (bps)
        await reserve.setInternalInventoryData(
            myDaiToken.address,
            true,
            minDaiBal,
            maxDaiBal,
            pricePremiumBps,
            1053, // higher than orderbook's spread
            {from: admin}
        )

        let expectedEth2DaiRate = precision.mul(new BN(190));
        expectedEth2DaiRate = Helper.addBps(expectedEth2DaiRate, -1 * feeBps);
        expectedEth2DaiRate = applyInternalInventory(expectedEth2DaiRate, false);

        let ethBal = await Helper.getBalancePromise(reserve.address);
        let tokenBal = await myDaiToken.balanceOf(reserve.address);

        // withdraw all ETH and token
        await reserve.withdrawEther(ethBal, user, {from: admin});
        await reserve.withdrawToken(myDaiToken.address, tokenBal, user, {from: admin});

        ethBal = precision.mul(new BN(2));
        tokenBal = minDaiBal.add(precision.mul(new BN(190)).mul(new BN(2)));
        await Helper.sendEtherWithPromise(user, reserve.address, ethBal);
        await myDaiToken.transfer(reserve.address, tokenBal);

        let eth2DaiRate = await reserve.getConversionRate(ethAddress, myDaiToken.address, precision, 0);

        Helper.assertEqual(expectedEth2DaiRate, eth2DaiRate, "rate eth -> dai is not correct");
    });

    it("Should test using internal inventory rate as expected for eth -> dai", async function() {
        await reserve.setFeeBps(feeBps, {from: admin});

        await otc.setBuyOffer(1, myDaiToken.address, precision.mul(new BN(5 * 190)), myWethToken.address, precision.mul(new BN(5)));
        await otc.setSellOffer(2, myWethToken.address, precision.mul(new BN(5)), myDaiToken.address, precision.mul(new BN(210 * 5)));

        await reserve.setInternalInventoryData(
            myDaiToken.address,
            true,
            minDaiBal,
            maxDaiBal,
            pricePremiumBps,
            minSpreadInBps,
            {from: admin}
        )

        let expectedEth2DaiRate = precision.mul(new BN(190));
        expectedEth2DaiRate = Helper.addBps(expectedEth2DaiRate, pricePremiumBps);
        expectedEth2DaiRate = applyInternalInventory(expectedEth2DaiRate, true);

        let ethBal = await Helper.getBalancePromise(reserve.address);
        let tokenBal = await myDaiToken.balanceOf(reserve.address);

        // withdraw all ETH and token
        await reserve.withdrawEther(ethBal, user, {from: admin});
        await reserve.withdrawToken(myDaiToken.address, tokenBal, user, {from: admin});

        ethBal = precision.mul(new BN(2));
        tokenBal = minDaiBal.add(precision.mul(new BN(2000)));

        await Helper.sendEtherWithPromise(user, reserve.address, ethBal);
        await myDaiToken.transfer(reserve.address, tokenBal);

        let eth2DaiRate = await reserve.getConversionRate(ethAddress, myDaiToken.address, precision, 0);

        Helper.assertEqual(expectedEth2DaiRate, eth2DaiRate, "rate eth -> dai is not correct");
    });

    it("Should test using internal inventory balances are correct after trade eth -> dai", async function() {
        await reserve.setFeeBps(feeBps, {from: admin});

        await otc.setBuyOffer(1, myDaiToken.address, precision.mul(new BN(5 * 190)), myWethToken.address, precision.mul(new BN(5)));
        await otc.setSellOffer(2, myWethToken.address, precision.mul(new BN(5)), myDaiToken.address, precision.mul(new BN(210 * 5)));

        await reserve.setInternalInventoryData(
            myDaiToken.address,
            true,
            minDaiBal,
            maxDaiBal,
            pricePremiumBps,
            minSpreadInBps,
            {from: admin}
        )

        let expectedEth2DaiRate = precision.mul(new BN(190));
        expectedEth2DaiRate = Helper.addBps(expectedEth2DaiRate, pricePremiumBps);
        expectedEth2DaiRate = applyInternalInventory(expectedEth2DaiRate, true);

        let ethBal = await Helper.getBalancePromise(reserve.address);
        let tokenBal = await myDaiToken.balanceOf(reserve.address);

        // withdraw all ETH and token
        await reserve.withdrawEther(ethBal, user, {from: admin});
        await reserve.withdrawToken(myDaiToken.address, tokenBal, user, {from: admin});

        ethBal = precision.mul(new BN(2));
        tokenBal = minDaiBal.add(precision.mul(new BN(2000)));

        await Helper.sendEtherWithPromise(user, reserve.address, ethBal);
        await myDaiToken.transfer(reserve.address, tokenBal);

        let expectedDaiBalAfter = tokenBal.sub(expectedEth2DaiRate);
        let expectedEthBalAfter = ethBal.add(precision);

        await reserve.trade(ethAddress, precision, myDaiToken.address, user, expectedEth2DaiRate, false, {from: network, value: precision});

        ethBal = await Helper.getBalancePromise(reserve.address);
        tokenBal = await myDaiToken.balanceOf(reserve.address);

        Helper.assertEqual(expectedEthBalAfter, ethBal, "eth balance is not correct after trade");
        Helper.assertEqual(expectedDaiBalAfter, tokenBal, "dai balance is not correct after trade");
    });

    it("Should test using internal inventory rate as expected for dai -> eth", async function() {
        await reserve.setFeeBps(feeBps, {from: admin});

        await otc.setBuyOffer(1, myDaiToken.address, precision.mul(new BN(5 * 190)), myWethToken.address, precision.mul(new BN(5)));
        await otc.setSellOffer(2, myWethToken.address, precision.mul(new BN(5)), myDaiToken.address, precision.mul(new BN(210 * 5)));

        await reserve.setInternalInventoryData(
            myDaiToken.address,
            true,
            minDaiBal,
            maxDaiBal,
            pricePremiumBps,
            minSpreadInBps,
            {from: admin}
        )

        let expectedDai2EthRate = precision.div(new BN(210));
        expectedDai2EthRate = Helper.addBps(expectedDai2EthRate, pricePremiumBps);
        expectedDai2EthRate = applyInternalInventory(expectedDai2EthRate, true);

        let ethBal = await Helper.getBalancePromise(reserve.address);
        let tokenBal = await myDaiToken.balanceOf(reserve.address);

        // withdraw all ETH and token
        await reserve.withdrawEther(ethBal, user, {from: admin});
        await reserve.withdrawToken(myDaiToken.address, tokenBal, user, {from: admin});

        ethBal = precision.mul(new BN(2));
        tokenBal = minDaiBal.add(precision.mul(new BN(2000)));

        await Helper.sendEtherWithPromise(user, reserve.address, ethBal);
        await myDaiToken.transfer(reserve.address, tokenBal);

        let dai2EthRate = await reserve.getConversionRate(myDaiToken.address, ethAddress, precision.mul(new BN(200)), 0);

        Helper.assertEqual(expectedDai2EthRate, dai2EthRate, "rate eth -> dai is not correct");
    });

    it("Should test using internal inventory balances are correct after trade dai -> eth", async function() {
        await reserve.setFeeBps(feeBps, {from: admin});

        await otc.setBuyOffer(1, myDaiToken.address, precision.mul(new BN(5 * 190)), myWethToken.address, precision.mul(new BN(5)));
        await otc.setSellOffer(2, myWethToken.address, precision.mul(new BN(5)), myDaiToken.address, precision.mul(new BN(210 * 5)));

        await reserve.setInternalInventoryData(
            myDaiToken.address,
            true,
            minDaiBal,
            maxDaiBal,
            pricePremiumBps,
            minSpreadInBps,
            {from: admin}
        )

        let expectedDai2EthRate = precision.div(new BN(210));
        expectedDai2EthRate = Helper.addBps(expectedDai2EthRate, pricePremiumBps);
        expectedDai2EthRate = applyInternalInventory(expectedDai2EthRate, true);

        let ethBal = await Helper.getBalancePromise(reserve.address);
        let tokenBal = await myDaiToken.balanceOf(reserve.address);

        // withdraw all ETH and token
        await reserve.withdrawEther(ethBal, user, {from: admin});
        await reserve.withdrawToken(myDaiToken.address, tokenBal, user, {from: admin});

        ethBal = precision.mul(new BN(5));
        tokenBal = minDaiBal.add(precision.mul(new BN(2000)));
        await Helper.sendEtherWithPromise(user, reserve.address, ethBal);
        await myDaiToken.transfer(reserve.address, tokenBal);

        let tradeAmount = precision.mul(new BN(200));
        let ethAmount = expectedDai2EthRate.mul(tradeAmount).div(precision);

        let expectedDaiBalAfter = tokenBal.add(tradeAmount);
        let expectedEthBalAfter = ethBal.sub(ethAmount);

        // trade 200 dai
        await myDaiToken.transfer(network, tradeAmount);
        await reserve.trade(myDaiToken.address, tradeAmount, ethAddress, user, expectedDai2EthRate, false, {from: network});

        ethBal = await Helper.getBalancePromise(reserve.address);
        tokenBal = await myDaiToken.balanceOf(reserve.address);

        Helper.assertEqual(expectedEthBalAfter, ethBal, "eth balance is not correct after trade");
        Helper.assertEqual(expectedDaiBalAfter, tokenBal, "dai balance is not correct after trade");
    });

    it("Should test few buy and sell trades after setting new otc contract", async function() {
        let newOTC = await MockOtcOrderbook.new(myWethToken.address, myDaiToken.address);
        await myWethToken.transfer(newOTC.address, initOTCWethBalance);
        await myDaiToken.transfer(newOTC.address, initOTCDaiBalance);

        // delist dai first
        await reserve.delistToken(myDaiToken.address, {from: admin});
        // set new otc contract
        await reserve.setContracts(network, newOTC.address, {from: admin});
        // list dai + set config data again
        await reserve.listToken(myDaiToken.address, {from: admin});
        await reserve.setTokenConfigData(
            myDaiToken.address,
            maxTraverse, maxTraverseX, maxTraverseY,
            maxTake, maxTakeX, maxTakeY,
            minSupportX, minSupportY, minSupport,
            {from: admin}
        )

        let recordedOTC = await reserve.otc();
        assert.equal(recordedOTC, newOTC.address, "otc is not set correctly");

        // making median rate is 200
        await newOTC.setBuyOffer(1, myDaiToken.address, precision.mul(new BN(2 * 190)), myWethToken.address, precision.mul(new BN(2)));
        await newOTC.setBuyOffer(2, myDaiToken.address, precision.mul(new BN(4 * 188)), myWethToken.address, precision.mul(new BN(4)));
        await newOTC.setBuyOffer(3, myDaiToken.address, precision.mul(new BN(6 * 185)), myWethToken.address, precision.mul(new BN(6)));
        await newOTC.setBuyOffer(4, myDaiToken.address, precision.mul(new BN(8 * 180)), myWethToken.address, precision.mul(new BN(8)));
        await newOTC.setBuyOffer(5, myDaiToken.address, precision.mul(new BN(12 * 178)), myWethToken.address, precision.mul(new BN(12)));

        await newOTC.setSellOffer(6, myWethToken.address, precision.mul(new BN(2)), myDaiToken.address, precision.mul(new BN(210 * 2)));
        await newOTC.setSellOffer(7, myWethToken.address, precision.mul(new BN(3)), myDaiToken.address, precision.mul(new BN(212 * 3)));
        await newOTC.setSellOffer(8, myWethToken.address, precision.mul(new BN(4)), myDaiToken.address, precision.mul(new BN(216 * 4)));
        await newOTC.setSellOffer(9, myWethToken.address, precision.mul(new BN(5)), myDaiToken.address, precision.mul(new BN(220 * 5)));
        await newOTC.setSellOffer(10, myWethToken.address, precision.mul(new BN(12)), myDaiToken.address, precision.mul(new BN(225 * 12)));

        for(let i = 1; i <= 10; i++) {
            let amountEth = (new BN(i)).mul(precision).mul(new BN(2));
            let amountDai = (new BN(i)).mul(precision).mul(new BN(200 + i * 2)).mul(new BN(2));

            await Helper.sendEtherWithPromise(user, network, amountEth);
            await myDaiToken.transfer(network, amountDai);

            let expectedUserETHBal = await Helper.getBalancePromise(user);
            let expectedUserDaiBal = await myDaiToken.balanceOf(user);

            let offersEthToken = await reserve.showBestOffers(myDaiToken.address, true, amountEth.div(precision));
            let offersTokenEth = await reserve.showBestOffers(myDaiToken.address, false, amountDai.div(precision));

            let eth2daiRate = await reserve.getConversionRate(ethAddress, myDaiToken.address, amountEth, 0);
            let dai2ethRate = await reserve.getConversionRate(myDaiToken.address, ethAddress, amountDai, 0);

            let rate = Helper.calcRateFromQty(amountEth, offersEthToken[0], tokenDecimals, tokenDecimals);
            rate = Helper.addBps(rate, -1 * feeBps);
            rate = applyInternalInventory(rate, false);
            Helper.assertEqual(rate, eth2daiRate, "eth to dai rate should be correct, loop: " + i);

            rate = Helper.calcRateFromQty(amountDai, offersTokenEth[0], tokenDecimals, tokenDecimals);
            rate = Helper.addBps(rate, -1 * feeBps);
            rate = applyInternalInventory(rate, false);
            Helper.assertEqual(rate, dai2ethRate, "dai to eth rate should be correct, loop: " + i);

            expectedUserDaiBal = expectedUserDaiBal.add(Helper.calcDstQty(amountEth, tokenDecimals, tokenDecimals, eth2daiRate));
            await reserve.trade(ethAddress, amountEth, myDaiToken.address, user, eth2daiRate, true, {from: network, value: amountEth});

            let newUserEthBal = await Helper.getBalancePromise(user);
            let newUserDaiBal = await myDaiToken.balanceOf(user);

            Helper.assertEqual(expectedUserETHBal, newUserEthBal, "eth balance should be correct after traded, loop: " + i);
            Helper.assertEqual(expectedUserDaiBal, newUserDaiBal, "dai balance should be correct after traded, loop: " + i);

            expectedUserETHBal = expectedUserETHBal.add(Helper.calcDstQty(amountDai, tokenDecimals, tokenDecimals, dai2ethRate));
            await reserve.trade(myDaiToken.address, amountDai, ethAddress, user, dai2ethRate, true, {from: network});

            newUserEthBal = await Helper.getBalancePromise(user);
            newUserDaiBal = await myDaiToken.balanceOf(user);

            Helper.assertEqual(expectedUserDaiBal, newUserDaiBal, "dai balance should be correct after traded, loop: " + i);
            Helper.assertEqual(expectedUserETHBal, newUserEthBal, "eth balance should be correct after traded, loop: " + i);
        }
        await reserve.delistToken(myDaiToken.address, {from: admin});
        await reserve.setContracts(network, otc.address, {from: admin});
        await reserve.listToken(myDaiToken.address, {from: admin});
        await reserve.setTokenConfigData(
            myDaiToken.address,
            maxTraverse, maxTraverseX, maxTraverseY,
            maxTake, maxTakeX, maxTakeY,
            minSupportX, minSupportY, minSupport,
            {from: admin}
        )
    });

    it("Should test few buy and sell trades after setting new network contract", async function() {
        let newNetwork = accounts[8];
        await reserve.setContracts(newNetwork, otc.address, {from: admin});
        await myDaiToken.approve(reserve.address, (new BN(2)).pow(new BN(255)), {from: newNetwork});
        // making median rate is 200
        await otc.setBuyOffer(1, myDaiToken.address, precision.mul(new BN(2 * 190)), myWethToken.address, precision.mul(new BN(2)));
        await otc.setBuyOffer(2, myDaiToken.address, precision.mul(new BN(4 * 188)), myWethToken.address, precision.mul(new BN(4)));
        await otc.setBuyOffer(3, myDaiToken.address, precision.mul(new BN(6 * 185)), myWethToken.address, precision.mul(new BN(6)));
        await otc.setBuyOffer(4, myDaiToken.address, precision.mul(new BN(8 * 180)), myWethToken.address, precision.mul(new BN(8)));
        await otc.setBuyOffer(5, myDaiToken.address, precision.mul(new BN(12 * 178)), myWethToken.address, precision.mul(new BN(12)));

        await otc.setSellOffer(6, myWethToken.address, precision.mul(new BN(2)), myDaiToken.address, precision.mul(new BN(210 * 2)));
        await otc.setSellOffer(7, myWethToken.address, precision.mul(new BN(3)), myDaiToken.address, precision.mul(new BN(212 * 3)));
        await otc.setSellOffer(8, myWethToken.address, precision.mul(new BN(4)), myDaiToken.address, precision.mul(new BN(216 * 4)));
        await otc.setSellOffer(9, myWethToken.address, precision.mul(new BN(5)), myDaiToken.address, precision.mul(new BN(220 * 5)));
        await otc.setSellOffer(10, myWethToken.address, precision.mul(new BN(12)), myDaiToken.address, precision.mul(new BN(225 * 12)));

        for(let i = 1; i <= 10; i++) {
            let amountEth = (new BN(i)).mul(precision).mul(new BN(2));
            let amountDai = (new BN(i)).mul(precision).mul(new BN(200 + i * 2)).mul(new BN(2));

            await Helper.sendEtherWithPromise(user, newNetwork, amountEth);
            await myDaiToken.transfer(newNetwork, amountDai);

            let expectedUserETHBal = await Helper.getBalancePromise(user);
            let expectedUserDaiBal = await myDaiToken.balanceOf(user);

            let offersEthToken = await reserve.showBestOffers(myDaiToken.address, true, amountEth.div(precision));
            let offersTokenEth = await reserve.showBestOffers(myDaiToken.address, false, amountDai.div(precision));

            let eth2daiRate = await reserve.getConversionRate(ethAddress, myDaiToken.address, amountEth, 0);
            let dai2ethRate = await reserve.getConversionRate(myDaiToken.address, ethAddress, amountDai, 0);

            let rate = Helper.calcRateFromQty(amountEth, offersEthToken[0], tokenDecimals, tokenDecimals);
            rate = Helper.addBps(rate, -1 * feeBps);
            rate = applyInternalInventory(rate, false);
            Helper.assertEqual(rate, eth2daiRate, "eth to dai rate should be correct, loop: " + i);

            rate = Helper.calcRateFromQty(amountDai, offersTokenEth[0], tokenDecimals, tokenDecimals);
            rate = Helper.addBps(rate, -1 * feeBps);
            rate = applyInternalInventory(rate, false);
            Helper.assertEqual(rate, dai2ethRate, "dai to eth rate should be correct, loop: " + i);

            expectedUserDaiBal = expectedUserDaiBal.add(Helper.calcDstQty(amountEth, tokenDecimals, tokenDecimals, eth2daiRate));
            await reserve.trade(ethAddress, amountEth, myDaiToken.address, user, eth2daiRate, true, {from: newNetwork, value: amountEth});

            let newUserEthBal = await Helper.getBalancePromise(user);
            let newUserDaiBal = await myDaiToken.balanceOf(user);

            Helper.assertEqual(expectedUserETHBal, newUserEthBal, "eth balance should be correct after traded, loop: " + i);
            Helper.assertEqual(expectedUserDaiBal, newUserDaiBal, "dai balance should be correct after traded, loop: " + i);

            expectedUserETHBal = expectedUserETHBal.add(Helper.calcDstQty(amountDai, tokenDecimals, tokenDecimals, dai2ethRate));
            await reserve.trade(myDaiToken.address, amountDai, ethAddress, user, dai2ethRate, true, {from: newNetwork});

            newUserEthBal = await Helper.getBalancePromise(user);
            newUserDaiBal = await myDaiToken.balanceOf(user);

            Helper.assertEqual(expectedUserDaiBal, newUserDaiBal, "dai balance should be correct after traded, loop: " + i);
            Helper.assertEqual(expectedUserETHBal, newUserEthBal, "eth balance should be correct after traded, loop: " + i);
        }
        await reserve.setContracts(network, otc.address, {from: admin});
    });
  });

function applyInternalInventory(rate, useInternalInventory) {
    if (useInternalInventory) {
        if (rate.mod(new BN(2)).eq(new BN(1))) return rate;
        return rate.sub(new BN(1));
    } else {
        if(rate.mod(new BN(2)).isZero()) return rate;
        return rate.sub(new BN(1));
    }
}

function log(str) {
    console.log(str);
}
