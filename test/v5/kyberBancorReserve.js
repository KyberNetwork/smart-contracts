const Web3 = require('web3');

let TestToken = artifacts.require("Token.sol");
let MockBancorNetwork = artifacts.require("MockBancorNetwork.sol");
let KyberBancorReserve = artifacts.require("KyberBancorReserve.sol");

let Helper = require("../v4/helper.js");
let BigNumber = require('bignumber.js');

const ethAddress = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
const precision = new BigNumber(10).pow(18);
const feeBps = new BigNumber(0);

const initEthBalance = new BigNumber(50).mul(new BigNumber(10).pow(18));
const initBntBalance = new BigNumber(1000000).mul(new BigNumber(10).pow(18));

// 1 ETH = 500 BNT
const ethToBntRate = new BigNumber(10).pow(18).mul(500);
const bntToEthRate = new BigNumber(10).pow(18).div(500);

const zeroAddress = 0;

const tokenDecimal = 18;

let admin;
let alerter;
let operator;
let bancorNetwork;
let reserve;
let network;
let user;

let bancorEthToken;
let bancorBntToken;

contract('KyberBancorNetwork', function(accounts) {
    before("one time init", async() => {
        admin = accounts[0];
        network = accounts[1];
        alerter = accounts[2];
        operator = accounts[3];
        user = accounts[4];

        bancorEthToken = await TestToken.new("BancorETH", "BETH", tokenDecimal);
        bancorBntToken = await TestToken.new("BancorBNT", "BBNT", tokenDecimal);
        bancorNetwork = await MockBancorNetwork.new(bancorEthToken.address, bancorBntToken.address);
        reserve = await KyberBancorReserve.new(
            bancorNetwork.address,
            network,
            feeBps,
            bancorEthToken.address,
            bancorBntToken.address,
            admin
        );

        await reserve.addAlerter(alerter);
        await reserve.addOperator(operator);

        await bancorBntToken.approve(reserve.address, new BigNumber(2).pow(255), {from: network});
    });

    beforeEach("running before each test", async() => {
        // reset exchange rate
        await bancorNetwork.setExchangeRate(ethToBntRate, bntToEthRate);
    });

    it("Test transfer tokens to bancor network, reserve and user", async function() {
        // transfer weth and dai to contracts
        await bancorBntToken.transfer(bancorNetwork.address, initBntBalance.valueOf());
        let balance;
        balance = await bancorBntToken.balanceOf(bancorNetwork.address);
        assert.equal(balance.valueOf(), initBntBalance.valueOf(), "init balance bnt is not correct");

        await Helper.sendEtherWithPromise(user, bancorNetwork.address, initEthBalance);
        balance = await Helper.getBalancePromise(bancorNetwork.address);
        assert.equal(balance.valueOf(), initEthBalance.valueOf(), "init balance eth is not correct");
    });

    it("Should test getConversionRate returns 0 when token is not bnt", async function() {
        let token = await TestToken.new("test token", "tes", 18);
        let result;
        result = await reserve.getConversionRate(ethAddress, token.address, 1 * precision, 0);
        assert.equal(result.valueOf(), 0, "rate should be 0 as token is not bnt");

        result = await reserve.getConversionRate(token.address, ethAddress, 20 * precision, 0);
        assert.equal(result.valueOf(), 0, "rate should be 0 as token is not bnt");

        result = await reserve.getConversionRate(ethAddress, bancorBntToken.address, 1 * precision, 0);
        assert.equal(result.valueOf(), ethToBntRate.valueOf(), "should have eth -> bnt rate as token is bnt");

        result = await reserve.getConversionRate(bancorBntToken.address, ethAddress, 20 * precision, 0);
        assert.equal(result.valueOf(), bntToEthRate.valueOf(), "should have bnt -> eth as token is bnt");
    });

    it("Should test getConversionRate returns 0 when trade not enable", async function() {
        await reserve.disableTrade({from: alerter});
        let result;
        // not have sell order
        result = await reserve.getConversionRate(ethAddress, bancorBntToken.address, 1 * precision, 0);
        assert.equal(result.valueOf(), 0, "rate should be 0 as trade is not enable");

        result = await reserve.getConversionRate(bancorBntToken.address, ethAddress, 20 * precision, 0);
        assert.equal(result.valueOf(), 0, "rate should be 0 as trade is not enable");

        await reserve.enableTrade({from: admin});
        result = await reserve.getConversionRate(ethAddress, bancorBntToken.address, 1 * precision, 0);
        assert.notEqual(result.valueOf(), 0, "should have rate as trade is enable");
    });

    it("Should test getConversionRate returns 0 when srcQty is 0", async function() {
        let result = await reserve.getConversionRate(ethAddress, bancorBntToken.address, 0, 0);
        assert.equal(result.valueOf(), 0, "rate should be 0 when src qty is 0"); 

        result = await reserve.getConversionRate(bancorBntToken.address, ethAddress, 0, 0);
        assert.equal(result.valueOf(), 0, "rate should be 0 when src qty is 0");  
    });

    it("Should test getConversionRate returns correct rate", async function() {
        let amountETH = new BigNumber(10).pow(18);
        let amountBNT = new BigNumber(10).pow(18);

        await bancorNetwork.setExchangeRate(ethToBntRate, bntToEthRate);
        let result;

        result = await reserve.getConversionRate(ethAddress, bancorBntToken.address, amountETH, 0);
        assert.equal(result.valueOf(), ethToBntRate.valueOf(), "should return correct eth to bnt rate");

        result = await reserve.getConversionRate(bancorBntToken.address, ethAddress, amountBNT, 0);
        assert.equal(result.valueOf(), bntToEthRate.valueOf(), "should return correct bnt to eth rate");

        let newEthToBntRate = new BigNumber(10).pow(18).mul(100);
        let newBntToEthRate = new BigNumber(10).pow(18).div(100);

        await bancorNetwork.setExchangeRate(newEthToBntRate, newBntToEthRate);

        result = await reserve.getConversionRate(ethAddress, bancorBntToken.address, amountETH, 0);
        assert.equal(result.valueOf(), newEthToBntRate.valueOf(), "should return correct eth to bnt rate");

        result = await reserve.getConversionRate(bancorBntToken.address, ethAddress, amountBNT, 0);
        assert.equal(result.valueOf(), newBntToEthRate.valueOf(), "should return correct bnt to eth rate");
    });

    it("Should test getConversionRate returns 0 when path is not correct", async function() {
        let testNewToken = await TestToken.new("Test token", "TST", tokenDecimal);
        let testBancorNetwork = await MockBancorNetwork.new(testNewToken.address, bancorBntToken.address);
        let testReserve = await KyberBancorReserve.new(
            testBancorNetwork.address,
            network,
            feeBps,
            bancorEthToken.address,
            bancorBntToken.address,
            admin
        );
        await testBancorNetwork.setExchangeRate(ethToBntRate, bntToEthRate);
        await Helper.sendEtherWithPromise(user, testBancorNetwork.address, initEthBalance);
        await bancorBntToken.transfer(testBancorNetwork.address, initBntBalance);
        let amount = new BigNumber(10).pow(tokenDecimal);
        let rate = await testReserve.getConversionRate(ethAddress, bancorBntToken.address, amount, 0);
        assert.equal(rate.valueOf(), 0, "rate should be 0 as path is incorrect");
        rate = await testReserve.getConversionRate(bancorBntToken.address, ethAddress, amount, 0);
        assert.equal(rate.valueOf(), 0, "rate should be 0 as path is incorrect");

        testBancorNetwork = await MockBancorNetwork.new(bancorEthToken.address, testNewToken.address);
        testReserve = await KyberBancorReserve.new(
            testBancorNetwork.address,
            network,
            feeBps,
            bancorEthToken.address,
            bancorBntToken.address,
            admin
        );
        await testBancorNetwork.setExchangeRate(ethToBntRate, bntToEthRate);
        await Helper.sendEtherWithPromise(user, testBancorNetwork.address, initEthBalance);
        await bancorBntToken.transfer(testBancorNetwork.address, initBntBalance);
        amount = new BigNumber(10).pow(tokenDecimal);
        rate = await testReserve.getConversionRate(ethAddress, bancorBntToken.address, amount, 0);
        assert.equal(rate.valueOf(), 0, "rate should be 0 as path is incorrect");
        rate = await testReserve.getConversionRate(bancorBntToken.address, ethAddress, amount, 0);
        assert.equal(rate.valueOf(), 0, "rate should be 0 as path is incorrect");
    });

    // test init reserve contract
    it("Should test can not init reserve contract with invalid arguments", async function() {
        try {
            _ = await KyberBancorReserve.new(
                zeroAddress,
                network,
                feeBps.valueOf(),
                bancorEthToken.address,
                bancorBntToken.address,
                admin
            );
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
        try {
            _ = await KyberBancorReserve.new(
                bancorNetwork.address,
                zeroAddress,
                feeBps.valueOf(),
                bancorEthToken.address,
                bancorBntToken.address,
                admin
            );
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
        try {
            _ = await KyberBancorReserve.new(
                bancorNetwork.address,
                network,
                feeBps.valueOf(),
                zeroAddress,
                bancorBntToken.address,
                admin
            );
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
        try {
            _ = await KyberBancorReserve.new(
                bancorNetwork.address,
                network,
                feeBps.valueOf(),
                bancorEthToken.address,
                zeroAddress,
                admin
            );
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
        try {
            _ = await KyberBancorReserve.new(
                bancorNetwork.address,
                network,
                feeBps.valueOf(),
                bancorEthToken.address,
                bancorBntToken.address,
                zeroAddress
            );
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
        _ = await KyberBancorReserve.new(
            bancorNetwork.address,
            network,
            feeBps.valueOf(),
            bancorEthToken.address,
            bancorBntToken.address,
            admin
        );
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

    it("Should test can not set fee when sender is not admin", async function() {
        await reserve.setFeeBps(feeBps, {from: admin});
        try {
            await reserve.setFeeBps(feeBps, {from: user});
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    // test setting contracts
    it("Should test can not set contracts with invalid network or bancor network", async function() {
        try {
            await reserve.setKyberNetwork(zeroAddress);
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
        try {
            await reserve.setBancorContract(zeroAddress);
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
        try {
            await reserve.setKyberNetwork(network, {from: user});
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
        try {
            await reserve.setBancorContract(bancorNetwork.address, {from: user});
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        await reserve.setKyberNetwork(network, {from: admin});
        await reserve.setBancorContract(bancorNetwork.address, {from: admin});
    });

    it("Should test trade is reverted when trade is not enable", async function() {
        let amountEth = (new BigNumber(10)).pow(18);
        let amountBnt = (new BigNumber(10)).pow(18).mul(500);
        let ethToBntRate = await reserve.getConversionRate(ethAddress, bancorBntToken.address, amountEth, 0);
        let bntToEthRate = await reserve.getConversionRate(bancorBntToken.address, ethAddress, amountBnt, 0);

        assert.notEqual(ethToBntRate.valueOf(), 0, "should have rate eth to bnt");
        assert.notEqual(bntToEthRate.valueOf(), 0, "should have rate bnt to eth");

        await reserve.disableTrade({from: alerter});
        try {
            await reserve.trade(ethAddress, amountEth, bancorBntToken.address, user, ethToBntRate, true, {from: network, value: amountEth});
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        await bancorBntToken.transfer(network, amountBnt);
        try {
            await reserve.trade(bancorBntToken.address, amountBnt, ethAddress, user, bntToEthRate, true, {from: network});
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        await reserve.enableTrade({from: admin});
    });

    it("Should test trade is reverted when msg sender is not network", async function() {
        let amountEth = (new BigNumber(10)).pow(18);
        let amountBnt = (new BigNumber(10)).pow(18).mul(500);
        let ethToBntRate = await reserve.getConversionRate(ethAddress, bancorBntToken.address, amountEth, 0);
        let bntToEthRate = await reserve.getConversionRate(bancorBntToken.address, ethAddress, amountBnt, 0);

        try {
            await reserve.trade(ethAddress, amountEth, bancorBntToken.address, user, ethToBntRate, true, {from: user, value: amountEth});
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await reserve.trade(bancorBntToken.address, amountBnt, ethAddress, user, bntToEthRate, true, {from: user});
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("Should test trade is reverted when token is invalid (src & dest are not ETH or token is not bnt)", async function() {
        let amountEth = (new BigNumber(10)).pow(18);
        let amountBnt = (new BigNumber(10)).pow(18).mul(500);
        let ethToBntRate = await reserve.getConversionRate(ethAddress, bancorBntToken.address, amountEth, 0);
        let bntToEthRate = await reserve.getConversionRate(bancorBntToken.address, ethAddress, amountBnt, 0);

        let token = await TestToken.new("test token", "tst", 18);
        await token.transfer(network, (new BigNumber(2)).pow(18).mul(1000));
        try {
            await reserve.trade(token.address, amountEth, bancorBntToken.address, user, ethToBntRate, true, {from: network});
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await reserve.trade(bancorBntToken.address, amountBnt, token.address, user, bntToEthRate, true, {from: network});
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await reserve.trade(ethAddress, amountEth, token.address, user, ethToBntRate, true, {from: network, value: amountEth});
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await reserve.trade(token.address, amountBnt, ethAddress, user, bntToEthRate, true, {from: network});
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("Should test trade is reverted when msg value and src amount are not correct", async function() {
        let amountEth = (new BigNumber(10)).pow(18);
        let amountBnt = (new BigNumber(10)).pow(18).mul(500);
        let ethToBntRate = await reserve.getConversionRate(ethAddress, bancorBntToken.address, amountEth, 0);
        let bntToEthRate = await reserve.getConversionRate(bancorBntToken.address, ethAddress, amountBnt, 0);

        try {
            await reserve.trade(ethAddress, amountEth, bancorBntToken.address, user, ethToBntRate, true, {from: network, value: 0});
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await reserve.trade(ethAddress, amountEth, bancorBntToken.address, user, ethToBntRate, true, {from: network, value: amountEth.sub(10)});
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await reserve.trade(bancorBntToken.address, amountBnt, ethAddress, user, bntToEthRate, true, {from: network, value: 1});
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("Should test trade is reverted when conversion rate is 0", async function() {
        let amountEth = (new BigNumber(10)).pow(18);
        let amountBnt = (new BigNumber(10)).pow(18).mul(500);

        try {
            await reserve.trade(ethAddress, amountEth, bancorBntToken.address, user, 0, true, {from: network, value: amountEth});
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            // bypass validating but user expected amount is still 0
            await reserve.trade(ethAddress, amountEth, bancorBntToken.address, user, 0, false, {from: network, value: amountEth});
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await reserve.trade(bancorBntToken.address, amountBnt, ethAddress, user, 0, true, {from: network});
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            // bypass validating but user expected amount is still 0
            await reserve.trade(bancorBntToken.address, amountBnt, ethAddress, user, 0, true, {from: network});
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("Should test trade is reverted when conversion rate is higher than actual rate", async function() {
        let amountEth = (new BigNumber(10)).pow(18);
        let amountBnt = (new BigNumber(10)).pow(18).mul(500);

        await reserve.setFeeBps(0, {from: admin});

        let ethToBntRate = await reserve.getConversionRate(ethAddress, bancorBntToken.address, amountEth, 0);
        let bntToEthRate = await reserve.getConversionRate(bancorBntToken.address, ethAddress, amountBnt, 0);

        try {
            await reserve.trade(ethAddress, amountEth, bancorBntToken.address, user, ethToBntRate.add(2), true, {from: network, value: amountEth});
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await reserve.trade(bancorBntToken.address, amountBnt, ethAddress, user, bntToEthRate.add(2), true, {from: network});
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        await reserve.trade(ethAddress, amountEth, bancorBntToken.address, user, ethToBntRate, true, {from: network, value: amountEth});
        await bancorBntToken.transfer(network, amountBnt);
        await reserve.trade(bancorBntToken.address, amountBnt, ethAddress, user, bntToEthRate, true, {from: network});
        await reserve.setFeeBps(feeBps, {from: admin});
    });

    it("Should test trade is reverted when src amount is 0", async function() {
        let ethToBntRate = await reserve.getConversionRate(ethAddress, bancorBntToken.address, precision, 0);
        let bntToEthRate = await reserve.getConversionRate(bancorBntToken.address, ethAddress, precision, 0);
        try {
            await reserve.trade(ethAddress, 0, bancorBntToken.address, user, ethToBntRate, true, {from: network, value: 0});
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await reserve.trade(bancorBntToken.address, 0, ethAddress, user, bntToEthRate, true, {from: network});
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("Should test buy balance changes as expected", async function() {
        let amountEth = (new BigNumber(10)).pow(18);

        await reserve.setFeeBps(0, {from: admin});

        let ethToBntRate = await reserve.getConversionRate(ethAddress, bancorBntToken.address, amountEth, 0);

        let destAmount = calcDstQty(amountEth, tokenDecimal, tokenDecimal, ethToBntRate);

        let expectedUserBalance = await bancorBntToken.balanceOf(user);
        expectedUserBalance = expectedUserBalance.add(destAmount);
        await reserve.trade(ethAddress, amountEth, bancorBntToken.address, user, ethToBntRate, true, {from: network, value: amountEth});
        let userBalanceAfter = await bancorBntToken.balanceOf(user);
        assert.equal(expectedUserBalance.valueOf(), userBalanceAfter.valueOf(), "user balance must change as expected")
    });

    it("Should test few buys with rates change, balance change as expected", async function() {
        await reserve.setFeeBps(0, {from: admin});
        for(let id = 1; id <= 15; id++) {
            let amountEth = (new BigNumber(10)).pow(18).div(id + 1).floor();
            let newEthToBntRate = (new BigNumber(10)).pow(18).mul(2 * id + 10);
            await bancorNetwork.setExchangeRate(newEthToBntRate, 0);

            let ethToBntRate = await reserve.getConversionRate(ethAddress, bancorBntToken.address, amountEth, 0);
            assert.equal(newEthToBntRate.valueOf(), ethToBntRate.valueOf(), "new rate should be correct");

            let destAmount = calcDstQty(amountEth, tokenDecimal, tokenDecimal, ethToBntRate);

            let expectedUserBalance = await bancorBntToken.balanceOf(user);
            expectedUserBalance = expectedUserBalance.add(destAmount);
            await reserve.trade(ethAddress, amountEth, bancorBntToken.address, user, ethToBntRate, true, {from: network, value: amountEth});
            let userBalanceAfter = await bancorBntToken.balanceOf(user);
            assert.equal(expectedUserBalance.valueOf(), userBalanceAfter.valueOf(), "user balance must change as expected")
        }
    });

    it("Should test sell balance changes as expected", async function() {
        let amountBnt = (new BigNumber(10)).pow(18).mul(500);

        await reserve.setFeeBps(0, {from: admin});

        let bntToEthRate = await reserve.getConversionRate(bancorBntToken.address, ethAddress, amountBnt, 0);

        let destAmount = calcDstQty(amountBnt, tokenDecimal, tokenDecimal, bntToEthRate);

        let expectedUserBalance = await Helper.getBalancePromise(user);
        expectedUserBalance = expectedUserBalance.add(destAmount);
        await bancorBntToken.transfer(network, amountBnt);
        await reserve.trade(bancorBntToken.address, amountBnt, ethAddress, user, bntToEthRate, true, {from: network});
        let userBalanceAfter = await Helper.getBalancePromise(user);
        assert.equal(expectedUserBalance.valueOf(), userBalanceAfter.valueOf(), "user balance must change as expected")
    });

    it("Should test few sells with rates change, balance change as expected", async function() {
        await reserve.setFeeBps(0, {from: admin});
        for(let id = 1; id <= 15; id++) {
            let amountBnt = (new BigNumber(10)).pow(18).mul(id * 2 + 10);

            let newBntToEthRate = (new BigNumber(10)).pow(18).div(2 * id).floor();
            await bancorNetwork.setExchangeRate(0, newBntToEthRate);
            let bntToEthRate = await reserve.getConversionRate(bancorBntToken.address, ethAddress, amountBnt, 0);
            assert.equal(newBntToEthRate.valueOf(), bntToEthRate.valueOf(), "new rate should be correct");

            let destAmount = calcDstQty(amountBnt, tokenDecimal, tokenDecimal, bntToEthRate);

            let expectedUserBalance = await Helper.getBalancePromise(user);
            expectedUserBalance = expectedUserBalance.add(destAmount);
            await bancorBntToken.transfer(network, amountBnt);
            await reserve.trade(bancorBntToken.address, amountBnt, ethAddress, user, bntToEthRate, true, {from: network});
            let userBalanceAfter = await Helper.getBalancePromise(user);
            assert.equal(expectedUserBalance.valueOf(), userBalanceAfter.valueOf(), "user balance must change as expected")
        }
    });
  });

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
