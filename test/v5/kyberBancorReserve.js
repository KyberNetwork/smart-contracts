const Web3 = require('web3');

let TestToken = artifacts.require("Token.sol");
let MockBancorNetwork = artifacts.require("MockBancorNetwork.sol");
let KyberBancorReserve = artifacts.require("KyberBancorReserve.sol");

let Helper = require("../v4/helper.js");
let BN = require('BN.js');

const ethAddress = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

const precision = new BN(10).pow(new BN(18));
const feeBps = new BN(0);

const initEthBalance = new BN(50).mul(new BN(10).pow(new BN(18)));
const initBntBalance = new BN(1000000).mul(new BN(10).pow(new BN(18)));

// 1 ETH = 500 BNT
const ethToBntRate = new BN(10).pow(new BN(18)).mul(new BN(500));
const bntToEthRate = new BN(10).pow(new BN(18)).div(new BN(500));

const zeroAddress = '0x0000000000000000000000000000000000000000';

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
        bancorETHBNTToken = await TestToken.new("BancorETHBNT", "BETHBNT", tokenDecimal);
        bancorBntToken = await TestToken.new("BancorBNT", "BBNT", tokenDecimal);
        bancorNetwork = await MockBancorNetwork.new(bancorEthToken.address, bancorETHBNTToken.address, bancorBntToken.address);
        reserve = await KyberBancorReserve.new(
            bancorNetwork.address,
            network,
            feeBps,
            bancorEthToken.address,
            bancorETHBNTToken.address,
            bancorBntToken.address,
            admin
        );

        await reserve.addAlerter(alerter);
        await reserve.addOperator(operator);

        await bancorBntToken.approve(reserve.address, new BN(2).pow(new BN(255)), {from: network});
    });

    beforeEach("running before each test", async() => {
        // reset exchange rate
        await bancorNetwork.setExchangeRate(ethToBntRate, bntToEthRate);
    });

    it("Test transfer tokens to bancor network, reserve and user", async function() {
        // transfer weth and dai to contracts
        await bancorBntToken.transfer(bancorNetwork.address, initBntBalance);
        let balance;
        balance = await bancorBntToken.balanceOf(bancorNetwork.address);

        await Helper.sendEtherWithPromise(user, bancorNetwork.address, initEthBalance);
        balance = await Helper.getBalancePromise(bancorNetwork.address);
        Helper.assertEqual(balance, initEthBalance, "init balance eth is not correct");
    });

    it("Should test getConversionRate returns 0 when token is not bnt", async function() {
        let result;
        let token = await TestToken.new("test token", "TST", 18);
        result = await reserve.getConversionRate(ethAddress, token.address, precision, 0);
        Helper.assertEqual(result, 0, "rate should be 0 as token is not bnt");

        result = await reserve.getConversionRate(token.address, ethAddress, precision.mul(new BN(20)), 0);
        Helper.assertEqual(result, 0, "rate should be 0 as token is not bnt");

        result = await reserve.getConversionRate(ethAddress, bancorBntToken.address, precision, 0);
        Helper.assertEqual(result, ethToBntRate, "should have eth -> bnt rate as token is bnt");

        result = await reserve.getConversionRate(bancorBntToken.address, ethAddress, precision.mul(new BN(20)), 0);
        Helper.assertEqual(result, bntToEthRate, "should have bnt -> eth as token is bnt");
    });

    it("Should test getConversionRate returns 0 when trade not enable", async function() {
        await reserve.disableTrade({from: alerter});
        let result;
        // not have sell order
        result = await reserve.getConversionRate(ethAddress, bancorBntToken.address, precision, 0);
        Helper.assertEqual(result, 0, "rate should be 0 as trade is not enable");

        result = await reserve.getConversionRate(bancorBntToken.address, ethAddress, precision.mul(new BN(20)), 0);
        Helper.assertEqual(result, 0, "rate should be 0 as trade is not enable");

        await reserve.enableTrade({from: admin});
        result = await reserve.getConversionRate(ethAddress, bancorBntToken.address, precision, 0);
        assert.notEqual(result, 0, "should have rate as trade is enable");
    });

    it("Should test getConversionRate returns 0 when srcQty is 0", async function() {
        let result = await reserve.getConversionRate(ethAddress, bancorBntToken.address, 0, 0);
        Helper.assertEqual(result, 0, "rate should be 0 when src qty is 0");

        result = await reserve.getConversionRate(bancorBntToken.address, ethAddress, 0, 0);
        Helper.assertEqual(result, 0, "rate should be 0 when src qty is 0");
    });

    it("Should test getConversionRate returns correct rate", async function() {
        let amountETH = new BN(10).pow(new BN(18));
        let amountBNT = new BN(10).pow(new BN(18));

        await bancorNetwork.setExchangeRate(ethToBntRate, bntToEthRate);
        let result;

        result = await reserve.getConversionRate(ethAddress, bancorBntToken.address, amountETH, 0);
        Helper.assertEqual(result, ethToBntRate, "should return correct eth to bnt rate");

        result = await reserve.getConversionRate(bancorBntToken.address, ethAddress, amountBNT, 0);
        Helper.assertEqual(result, bntToEthRate, "should return correct bnt to eth rate");

        let newEthToBntRate = new BN(10).pow(new BN(18)).mul(new BN(100));
        let newBntToEthRate = new BN(10).pow(new BN(18)).div(new BN(100));

        await bancorNetwork.setExchangeRate(newEthToBntRate, newBntToEthRate);

        result = await reserve.getConversionRate(ethAddress, bancorBntToken.address, amountETH, 0);
        Helper.assertEqual(result, newEthToBntRate, "should return correct eth to bnt rate");

        result = await reserve.getConversionRate(bancorBntToken.address, ethAddress, amountBNT, 0);
        Helper.assertEqual(result, newBntToEthRate, "should return correct bnt to eth rate");
    });

    it("Should test getConversionRate returns 0 when path is not correct", async function() {
        let testNewToken = await TestToken.new("Test token", "TST", tokenDecimal);
        let testBancorNetwork = await MockBancorNetwork.new(testNewToken.address, bancorBntToken.address, bancorBntToken.address);
        let testReserve = await KyberBancorReserve.new(
            testBancorNetwork.address,
            network,
            feeBps,
            bancorEthToken.address,
            bancorBntToken.address,
            bancorBntToken.address,
            admin
        );
        await testBancorNetwork.setExchangeRate(ethToBntRate, bntToEthRate);
        await Helper.sendEtherWithPromise(user, testBancorNetwork.address, initEthBalance);
        await bancorBntToken.transfer(testBancorNetwork.address, initBntBalance);
        let amount = new BN(10).pow(new BN(tokenDecimal));
        let rate = await testReserve.getConversionRate(ethAddress, bancorBntToken.address, amount, 0);
        Helper.assertEqual(rate, 0, "rate should be 0 as path is incorrect");
        rate = await testReserve.getConversionRate(bancorBntToken.address, ethAddress, amount, 0);
        Helper.assertEqual(rate, 0, "rate should be 0 as path is incorrect");

        testBancorNetwork = await MockBancorNetwork.new(bancorEthToken.address, testNewToken.address, testNewToken.address);
        testReserve = await KyberBancorReserve.new(
            testBancorNetwork.address,
            network,
            feeBps,
            bancorEthToken.address,
            testNewToken.address,
            bancorBntToken.address,
            admin
        );
        await testBancorNetwork.setExchangeRate(ethToBntRate, bntToEthRate);
        await Helper.sendEtherWithPromise(user, testBancorNetwork.address, initEthBalance);
        await bancorBntToken.transfer(testBancorNetwork.address, initBntBalance);
        amount = new BN(10).pow(new BN(tokenDecimal));
        rate = await testReserve.getConversionRate(ethAddress, bancorBntToken.address, amount, 0);
        Helper.assertEqual(rate, 0, "rate should be 0 as path is incorrect");
        rate = await testReserve.getConversionRate(bancorBntToken.address, ethAddress, amount, 0);
        Helper.assertEqual(rate, 0, "rate should be 0 as path is incorrect");
    });

    // test init reserve contract
    it("Should test can not init reserve contract with invalid arguments", async function() {
        try {
            _ = await KyberBancorReserve.new(
                zeroAddress,
                network,
                feeBps,
                bancorEthToken.address,
                bancorETHBNTToken.address,
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
                feeBps,
                bancorEthToken.address,
                bancorETHBNTToken.address,
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
                feeBps,
                zeroAddress,
                bancorETHBNTToken.address,
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
                feeBps,
                bancorEthToken.address,
                bancorETHBNTToken.address,
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
                feeBps,
                bancorEthToken.address,
                bancorETHBNTToken.address,
                bancorBntToken.address,
                zeroAddress
            );
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
        try {
            _ = await KyberBancorReserve.new(
                bancorNetwork.address,
                network,
                feeBps,
                bancorEthToken.address,
                zeroAddress,
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
            feeBps,
            bancorEthToken.address,
            bancorETHBNTToken.address,
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
        let amountEth = (new BN(10)).pow(new BN(18));
        let amountBnt = (new BN(10)).pow(new BN(18)).mul(new BN(500));
        let ethToBntRate = await reserve.getConversionRate(ethAddress, bancorBntToken.address, amountEth, 0);
        let bntToEthRate = await reserve.getConversionRate(bancorBntToken.address, ethAddress, amountBnt, 0);

        assert.notEqual(ethToBntRate, 0, "should have rate eth to bnt");
        assert.notEqual(bntToEthRate, 0, "should have rate bnt to eth");

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
        let amountEth = (new BN(10)).pow(new BN(18));
        let amountBnt = (new BN(10)).pow(new BN(18)).mul(new BN(500));
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
        let amountEth = (new BN(10)).pow(new BN(18));
        let amountBnt = (new BN(10)).pow(new BN(18)).mul(new BN(500));
        let ethToBntRate = await reserve.getConversionRate(ethAddress, bancorBntToken.address, amountEth, 0);
        let bntToEthRate = await reserve.getConversionRate(bancorBntToken.address, ethAddress, amountBnt, 0);

        let token = await TestToken.new("test token", "tst", 18);
        await token.transfer(network, (new BN(2)).pow(new BN(18)).mul(new BN(1000)));
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
        let amountEth = (new BN(10)).pow(new BN(18));
        let amountBnt = (new BN(10)).pow(new BN(18)).mul(new BN(500));
        let ethToBntRate = await reserve.getConversionRate(ethAddress, bancorBntToken.address, amountEth, 0);
        let bntToEthRate = await reserve.getConversionRate(bancorBntToken.address, ethAddress, amountBnt, 0);

        try {
            await reserve.trade(ethAddress, amountEth, bancorBntToken.address, user, ethToBntRate, true, {from: network, value: 0});
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await reserve.trade(ethAddress, amountEth, bancorBntToken.address, user, ethToBntRate, true, {from: network, value: amountEth.sub(new BN(10))});
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
        let amountEth = (new BN(10)).pow(new BN(18));
        let amountBnt = (new BN(10)).pow(new BN(18)).mul(new BN(500));

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
        let amountEth = (new BN(10)).pow(new BN(18));
        let amountBnt = (new BN(10)).pow(new BN(18)).mul(new BN(500));

        await reserve.setFeeBps(0, {from: admin});

        let ethToBntRate = await reserve.getConversionRate(ethAddress, bancorBntToken.address, amountEth, 0);
        let bntToEthRate = await reserve.getConversionRate(bancorBntToken.address, ethAddress, amountBnt, 0);

        try {
            await reserve.trade(ethAddress, amountEth, bancorBntToken.address, user, ethToBntRate.add(new BN(2)), true, {from: network, value: amountEth});
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await reserve.trade(bancorBntToken.address, amountBnt, ethAddress, user, bntToEthRate.add(new BN(2)), true, {from: network});
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
        let amountEth = (new BN(10)).pow(new BN(18));

        await reserve.setFeeBps(0, {from: admin});

        let ethToBntRate = await reserve.getConversionRate(ethAddress, bancorBntToken.address, amountEth, 0);

        let destAmount = Helper.calcDstQty(amountEth, tokenDecimal, tokenDecimal, ethToBntRate);

        let expectedUserBalance = await bancorBntToken.balanceOf(user);
        expectedUserBalance = expectedUserBalance.add(new BN(destAmount));
        await reserve.trade(ethAddress, amountEth, bancorBntToken.address, user, ethToBntRate, true, {from: network, value: amountEth});
        let userBalanceAfter = await bancorBntToken.balanceOf(user);
        Helper.assertEqual(expectedUserBalance, userBalanceAfter, "user balance must change as expected")
    });

    it("Should test few buys with rates change, balance change as expected", async function() {
        await reserve.setFeeBps(0, {from: admin});
        for(let id = 1; id <= 15; id++) {
            let amountEth = (new BN(10)).pow(new BN(18)).div(new BN(id + 1));
            let newEthToBntRate = (new BN(10)).pow(new BN(18)).mul(new BN(2 * id + 10));
            await bancorNetwork.setExchangeRate(newEthToBntRate, 0);

            let ethToBntRate = await reserve.getConversionRate(ethAddress, bancorBntToken.address, amountEth, 0);
            Helper.assertEqual(newEthToBntRate, ethToBntRate, "new rate should be correct");

            let destAmount = Helper.calcDstQty(amountEth, tokenDecimal, tokenDecimal, ethToBntRate);

            let expectedUserBalance = await bancorBntToken.balanceOf(user);
            expectedUserBalance = expectedUserBalance.add(new BN(destAmount));
            await reserve.trade(ethAddress, amountEth, bancorBntToken.address, user, ethToBntRate, true, {from: network, value: amountEth});
            let userBalanceAfter = await bancorBntToken.balanceOf(user);
            Helper.assertEqual(expectedUserBalance, userBalanceAfter, "user balance must change as expected")
        }
    });

    it("Should test sell balance changes as expected", async function() {
        let amountBnt = (new BN(10)).pow(new BN(18)).mul(new BN(500));

        await reserve.setFeeBps(0, {from: admin});

        let bntToEthRate = await reserve.getConversionRate(bancorBntToken.address, ethAddress, amountBnt, 0);

        let destAmount = Helper.calcDstQty(amountBnt, tokenDecimal, tokenDecimal, bntToEthRate);

        let expectedUserBalance = await Helper.getBalancePromise(user);
        expectedUserBalance = expectedUserBalance.add(new BN(destAmount));
        await bancorBntToken.transfer(network, amountBnt);
        await reserve.trade(bancorBntToken.address, amountBnt, ethAddress, user, bntToEthRate, true, {from: network});
        let userBalanceAfter = await Helper.getBalancePromise(user);
        Helper.assertEqual(expectedUserBalance, userBalanceAfter, "user balance must change as expected")
    });

    it("Should test few sells with rates change, balance change as expected", async function() {
        await reserve.setFeeBps(0, {from: admin});
        for(let id = 1; id <= 15; id++) {
            let amountBnt = (new BN(10)).pow(new BN(18)).mul(new BN(id * 2 + 10));

            let newBntToEthRate = (new BN(10)).pow(new BN(18)).div(new BN(2 * id));
            await bancorNetwork.setExchangeRate(0, newBntToEthRate);
            let bntToEthRate = await reserve.getConversionRate(bancorBntToken.address, ethAddress, amountBnt, 0);
            Helper.assertEqual(newBntToEthRate, bntToEthRate, "new rate should be correct");

            let destAmount = Helper.calcDstQty(amountBnt, tokenDecimal, tokenDecimal, bntToEthRate);

            let expectedUserBalance = await Helper.getBalancePromise(user);
            expectedUserBalance = expectedUserBalance.add(new BN(destAmount));
            await bancorBntToken.transfer(network, amountBnt);
            await reserve.trade(bancorBntToken.address, amountBnt, ethAddress, user, bntToEthRate, true, {from: network});
            let userBalanceAfter = await Helper.getBalancePromise(user);
            Helper.assertEqual(expectedUserBalance, userBalanceAfter, "user balance must change as expected")
        }
    });
  });