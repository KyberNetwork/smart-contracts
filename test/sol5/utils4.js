const MockUtils4 = artifacts.require("MockUtils4.sol")
const Helper = require("../helper.js");
const TestToken = artifacts.require("TestToken.sol");
const TokenNoDecimal = artifacts.require("TokenNoDecimal.sol");
const { expectRevert } = require('@openzeppelin/test-helpers');
const BN = web3.utils.BN;
const { BPS, precisionUnits, ethDecimals, ethAddress, zeroAddress, emptyHint } = require("../helper.js");


const PRECISION = new BN(10).pow(new BN(18));
const MAX_QTY = new BN(10).pow(new BN(28));
const MAX_RATE = new BN(10).pow(new BN(25));

const MAX_DECIMALS = 18;

contract('utils4', function (accounts) {
    before("should init global", async function () {
        utils4 = await MockUtils4.new();
    })

    it("check constant variable", async function () {
        Helper.assertEqual(await utils4.mockGetPrecision(), PRECISION, "precision is not correct")
        Helper.assertEqual(await utils4.mockGetMaxRate(), MAX_RATE, "maxrate is not correct")
        Helper.assertEqual(await utils4.mockGetMaxQty(), MAX_QTY, "max qty is not correct")
        Helper.assertEqual(await utils4.mockGetMaxDecimals(), MAX_DECIMALS, "max decimals is not correct")
        Helper.assertEqual(await utils4.mockGetEthDecimals(), ethDecimals, "eth decimal is not correct")
        Helper.assertEqual(await utils4.mockGetBPS(), BPS, "bps is not correct")
        Helper.assertEqual(await utils4.mockGetEthTokenAddress(), ethAddress, "eth address is not correct")
    })

    it("test get eth balance", async function () {
        user = accounts[9]
        let balanceEth = await Helper.getBalancePromise(user);
        balance = await utils4.mockGetBalance(ethAddress, user);
        Helper.assertEqual(balance, balanceEth);
    })

    it("test get token balance", async function () {
        let token = await TestToken.new("regular", "reg", 16);
        let tokenBalance = 600;
        let user = accounts[8]

        await token.transfer(user, tokenBalance);

        let balance = await utils4.mockGetBalance(token.address, user);
        Helper.assertEqual(balance, tokenBalance);
    })

    it("should check get decimals for normal token", async function () {
        Helper.assertEqual(await utils4.mockGetDecimals(ethAddress), ethDecimals);
        await utils4.mockSetDecimals(ethAddress);
        Helper.assertEqual(await utils4.mockGetDecimals(ethAddress), ethDecimals);

        let token = await TestToken.new("regular", "reg", 16);
        await utils4.mockSetDecimals(token.address);
        Helper.assertEqual(await utils4.mockGetDecimals(token.address), 16);
    });

    it("should check get update decimals for normal token", async function () {
        // check logical
        Helper.assertEqual(await utils4.mockCheckGetUpdateDecimals.call(ethAddress), ethDecimals)
        let token = await TestToken.new("regular", "reg", 16);
        Helper.assertEqual(await utils4.mockCheckGetUpdateDecimals.call(token.address), 16);
        // check gas consumtion
        let tx1 = await utils4.mockCheckGetUpdateDecimals(token.address)
        let tx2 = await utils4.mockCheckGetUpdateDecimals(token.address)
        Helper.assertGreater(tx1.receipt.gasUsed, tx2.receipt.gasUsed)
    });

    it("should check get decimals for token without decimals API. see reverts", async function () {
        let tokenNoDecimal = await TokenNoDecimal.new("noDec", "dec", 18);

        //now get deicmals to see values
        await expectRevert.unspecified(utils4.mockSetDecimals(tokenNoDecimal.address));
        await expectRevert.unspecified(utils4.mockGetDecimals(tokenNoDecimal.address));
        await expectRevert.unspecified(utils4.mockCheckGetUpdateDecimals(tokenNoDecimal.address));
    });

    it("check dest qty calculation for high quantities.", async function () {
        let srcQty = MAX_QTY.div(new BN(2));
        let rate = MAX_RATE;

        //first check when dest decimals > src decimals
        let srcDecimal = 10;
        let dstDecimal = 20;

        //should work with max Qty
        let expectedDestQty = Helper.calcDstQty(srcQty, srcDecimal, dstDecimal, rate);
        let reportedDstQty = await utils4.mockCalcDstQty(srcQty, srcDecimal, dstDecimal, rate);
        Helper.assertEqual(expectedDestQty, reportedDstQty, "unexpected dst qty");

        //next check when dest decimals > src decimals
        srcDecimal = 20;
        dstDecimal = 10;

        //should work with max Qty
        expectedDestQty = Helper.calcDstQty(srcQty, srcDecimal, dstDecimal, rate);
        reportedDstQty = await utils4.mockCalcDstQty(srcQty, srcDecimal, dstDecimal, rate);
        Helper.assertEqual(expectedDestQty, reportedDstQty, "unexpected dst qty");

        //should revert
        rate = MAX_RATE.add(new BN(1));
        await expectRevert(
            utils4.mockCalcDstQty(srcQty, srcDecimal, dstDecimal, rate),
            "rate > MAX_RATE"
        )
        rate = MAX_RATE
        srcQty = MAX_QTY.add(new BN(1))
        await expectRevert(
            utils4.mockCalcDstQty(srcQty, srcDecimal, dstDecimal, rate),
            "srcQty > MAX_QTY"
        )
    });


    it("check src qty calculation for high quantities.", async function () {
        let dstQty = MAX_QTY.div(new BN(2));
        let rate = MAX_RATE;

        //first check when dest decimals > src decimals
        let srcDecimal = 10;
        let dstDecimal = 20;

        let expectedDestQty = Helper.calcSrcQty(dstQty, srcDecimal, dstDecimal, rate);
        let reportedDstQty = await utils4.mockCalcSrcQty(dstQty, srcDecimal, dstDecimal, rate);
        Helper.assertEqual(expectedDestQty, reportedDstQty, "unexpected dst qty");

        //next check when dest decimals > src decimals
        srcDecimal = 20;
        dstDecimal = 10;

        expectedDestQty = Helper.calcSrcQty(dstQty, srcDecimal, dstDecimal, rate);
        reportedDstQty = await utils4.mockCalcSrcQty(dstQty, srcDecimal, dstDecimal, rate);
        Helper.assertEqual(expectedDestQty, reportedDstQty, "unexpected dst qty");

        //should revert
        rate = MAX_RATE.add(new BN(1));
        await expectRevert(
            utils4.mockCalcSrcQty(dstQty, srcDecimal, dstDecimal, rate),
            "rate > MAX_RATE"
        )
        rate = MAX_RATE
        dstQty = MAX_QTY.add(new BN(1))
        await expectRevert(
            utils4.mockCalcSrcQty(dstQty, srcDecimal, dstDecimal, rate),
            "dstQty > MAX_QTY"
        )
    });


    it("should check when decimals diff > 18 calc reverted.", async function () {
        await expectRevert(
            utils4.mockCalcDstQty(30, 10, 30, 1500),
            "dst - src > MAX_DECIMALS"
        )
        await expectRevert(
            utils4.mockCalcDstQty(30, 30, 10, 1500),
            "src - dst > MAX_DECIMALS"
        )
        await expectRevert(
            utils4.mockCalcSrcQty(30, 10, 30, 1500),
            "dst - src > MAX_DECIMALS"
        )
        await expectRevert(
            utils4.mockCalcSrcQty(30, 30, 10, 1500),
            "src - dst > MAX_DECIMALS"
        )
    });

})