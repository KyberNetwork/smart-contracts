let MockUtils = artifacts.require("./mockContracts/MockUtils.sol")

const Helper = require("./helper.js");
const BN = web3.utils.BN;

const ethAddress = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
const lowerCaseEthAdd = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const zeroAddress = '0x0000000000000000000000000000000000000000';
const PRECISION = new BN(10).pow(new BN(18));
const MAX_QTY = new BN(10).pow(new BN(28));
const MAX_RATE = new BN(10).pow(new BN(24));
const MAX_DECIMAL_DIFF = 18;

let utils;

contract('utils', function(accounts) {
    it("should init utils and tokens.", async function () {
        utils = await MockUtils.new();
    });

    it("check dest qty calculation.", async function () {
        let srcQty = 100;
        let rate = PRECISION.div(new BN(2)); //1 to 2. in PRECISION units

        //first check when dest decimals > src decimals
        let srcDecimal = 10;
        let dstDecimal = 20;

        let expectedDestQty = calcDestQty(srcQty, rate, srcDecimal, dstDecimal);

        let reportedDstQty = await utils.mockCalcDstQty(srcQty, srcDecimal, dstDecimal, rate);

        assert.equal(expectedDestQty, reportedDstQty, "unexpected dst qty");

        //check when dest decimals < src decimals
        srcQty = 100000000000;
        srcDecimal = 20;
        dstDecimal = 10;

        expectedDestQty = srcQty * rate / (PRECISION * 10 ** (srcDecimal - dstDecimal));
        reportedDstQty = await utils.mockCalcDstQty(srcQty, srcDecimal, dstDecimal, rate);

        assert.equal(expectedDestQty, reportedDstQty, "unexpected dst qty");
    });

    it("check dest qty calculation for high quantities.", async function () {
        let srcQty = MAX_QTY;
        let rate = PRECISION.div(new BN(2));

        //first check when dest decimals > src decimals
        let srcDecimal = 10;
        let dstDecimal = 20;

        //should work with max Qty
        let expectedDestQty = calcDestQty(srcQty, rate, srcDecimal, dstDecimal);

        let reportedDstQty = await utils.mockCalcDstQty(srcQty, srcDecimal, dstDecimal, rate);

        assert.equal(expectedDestQty, reportedDstQty, "unexpected dst qty");

        //should revert
        srcQty = MAX_QTY.add(new BN(1));
        try {
            reportedDstQty = await utils.mockCalcDstQty(srcQty, srcDecimal, dstDecimal, rate);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("check dest qty calculation for high quantities.", async function () {
        let srcQty = MAX_QTY.div(new BN(2));
        let rate = MAX_RATE;

        //first check when dest decimals > src decimals
        let srcDecimal = 10;
        let dstDecimal = 20;

        //should work with max Qty
        let expectedDestQty = calcDestQty(srcQty, rate, srcDecimal, dstDecimal);

        let reportedDstQty = await utils.mockCalcDstQty(srcQty, srcDecimal, dstDecimal, rate);

        assert.equal(expectedDestQty, reportedDstQty, "unexpected dst qty");

        //should revert
        rate = MAX_RATE.add(new BN(1));
        try {
            reportedDstQty = await utils.mockCalcDstQty(srcQty, srcDecimal, dstDecimal, rate);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("check src qty calculation.", async function () {
        let dstQty = 100000;
        let rate = PRECISION.mul(new BN(5)); //2 to 1. in PRECISION units

        //check when dest decimals > src decimals
        let srcDecimal = 10;
        let dstDecimal = 16;

        let expectedSrcQty = calcSrcQty(dstQty, srcDecimal, dstDecimal, rate);
        let reportedSrcQty = await utils.mockCalcSrcQty(dstQty, srcDecimal, dstDecimal, rate);

        assert.equal(expectedSrcQty, reportedSrcQty, "unexpected src qty");

        //check when dest decimals < src decimals
        srcDecimal = 12;
        dstDecimal = 10;

        expectedSrcQty = (((PRECISION / rate)* dstQty * (10**(srcDecimal - dstDecimal))));
        reportedSrcQty = await utils.mockCalcSrcQty(dstQty, srcDecimal, dstDecimal, rate);
        assert.equal(expectedSrcQty, reportedSrcQty, "unexpected src qty");
    });

    it("check src qty calculation with high qty.", async function () {
        let dstQty = MAX_QTY;
        let rate = PRECISION.mul(new BN(3)); //2 to 1. in PRECISION units

        //check when dest decimals > src decimals
        let srcDecimal = 10;
        let dstDecimal = 16;

        let expectedSrcQty = calcSrcQty(dstQty, srcDecimal, dstDecimal, rate);
        let reportedSrcQty = await utils.mockCalcSrcQty(dstQty, srcDecimal, dstDecimal, rate);

        assert.equal(expectedSrcQty, reportedSrcQty, "unexpected src qty");

        //here should revert
        dstQty = MAX_QTY.add(new BN(1));

        try {
            reportedSrcQty = await utils.mockCalcSrcQty(dstQty, srcDecimal, dstDecimal, rate);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("check src qty calculation with high rate.", async function () {
        let dstQty = MAX_QTY.div(new BN(2));
        let rate = MAX_RATE;

        //check when dest decimals > src decimals
        let srcDecimal = 10;
        let dstDecimal = 16;

        let expectedSrcQty = calcSrcQty(dstQty, srcDecimal, dstDecimal, rate);
        let reportedSrcQty = await utils.mockCalcSrcQty(dstQty, srcDecimal, dstDecimal, rate);

//        console.log(reportedSrcQty.logs[0].args)
//        assert.equal(expectedSrcQty, reportedSrcQty, "unexpected src qty. expected: " + expectedSrcQty);

        //here should revert
        rate = MAX_RATE.add(new BN(1));

        try {
            reportedSrcQty = await utils.mockCalcSrcQty(dstQty, srcDecimal, dstDecimal, rate);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("should check when decimals diff > 18 calc reverted.", async function () {
        try {
            await utils.mockCalcDstQty(30, 10, 30, 1500);
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await utils.mockCalcDstQty(30, 30, 10, 1500);
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await utils.mockCalcSrcQty(30, 10, 30, 1500);
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("should check when decimals diff > 18 calc reverted.", async function () {
        try {
            await utils.mockCalcDstQty(30, 10, 30, 1500);
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await utils.mockCalcDstQty(30, 30, 10, 1500);
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await utils.mockCalcSrcQty(30, 10, 30, 1500);
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await utils.mockCalcSrcQty(30, 30, 10, 1500);
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });
});

function calcDestQty (srcQty, rate, srcDecimal, dstDecimal) {
    let result;
    if (dstDecimal >= srcDecimal) {
        result = (((new BN(srcQty)).mul(rate).mul((new BN(10)).pow(new BN(dstDecimal - srcDecimal)))).div(PRECISION));
    } else {
        result = (new BN(srcQty)).mul(rate).div(PRECISION.mul((new BN(10)).pow(new BN(srcDecimal - dstDecimal))));
    }
    return Math.floor(result)
}

function calcSrcQty(dstQty, srcDecimals, dstDecimals, rate) {
    //source quantity is rounded up. to avoid dest quantity being too low.
    let numerator;
    let denominator;
    if (srcDecimals >= dstDecimals) {
        numerator = PRECISION.mul(new BN(dstQty)).mul((new BN(10)).pow(new BN(srcDecimals - dstDecimals)));
        denominator = new BN(rate);
    } else {
        numerator = PRECISION.mul(new BN(dstQty));
        denominator = (new BN(rate)).mul((new BN(10)).pow(new BN(dstDecimals - srcDecimals)));
    }
//    console.log("numerator: " + numerator + " denominator: " + denominator)
    return Math.floor(((numerator.add(denominator).sub(new BN(1))).div(denominator))); //avoid rounding down errors
}

