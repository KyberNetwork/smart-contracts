let MockUtils = artifacts.require("./mockContracts/MockUtils.sol")

let Helper = require("./helper.js");
let BigNumber = require('bignumber.js');

let ethAddress = '0x00eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
let precision = new BigNumber(10).pow(18);

let utils;

contract('utils', function(accounts) {
    it("should init utils and tokens.", async function () {
        utils = await MockUtils.new();
    });

    it("check dest qty calculation.", async function () {
        let srcQty = 100;
        let rate = precision.div(2); //1 to 2. in precision units

        //first check when dest decimals > src decimals
        let srcDecimal = 10;
        let dstDecimal = 20;

        let expectedDestQty = (srcQty * rate / precision) * (10 ** (dstDecimal - srcDecimal));

        let reportedDstQty = await utils.mockCalcDstQty(srcQty, srcDecimal, dstDecimal, rate);

        assert.equal(expectedDestQty.valueOf(), reportedDstQty.valueOf(), "unexpected dst qty");

        //check when dest decimals < src decimals
        srcQty = 100000000000;
        srcDecimal = 20;
        dstDecimal = 10;

        expectedDestQty = srcQty * rate / (precision * 10 ** (srcDecimal - dstDecimal));
        reportedDstQty = await utils.mockCalcDstQty(srcQty, srcDecimal, dstDecimal, rate);

        assert.equal(expectedDestQty, reportedDstQty.valueOf(), "unexpected dst qty");
    });

    it("check src qty calculation.", async function () {
        let dstQty = 100000;
        let rate = precision.mul(2); //2 to 1. in precision units

        //check when dest decimals > src decimals
        dstQty = 10000000;
        let srcDecimal = 10;
        let dstDecimal = 16;

        let expectedSrcQty = (((precision / rate)* dstQty * (10**(srcDecimal - dstDecimal))));
        let reportedSrcQty = await utils.mockCalcSrcQty(dstQty, srcDecimal, dstDecimal, rate);

        assert.equal(expectedSrcQty, reportedSrcQty.valueOf(), "unexpected src qty");

        //check when dest decimals < src decimals
        srcDecimal = 12;
        dstDecimal = 10;

        expectedSrcQty = (((precision / rate)* dstQty * (10**(srcDecimal - dstDecimal))));
        reportedSrcQty = await utils.mockCalcSrcQty(dstQty, srcDecimal, dstDecimal, rate.valueOf());
        assert.equal(expectedSrcQty, reportedSrcQty.valueOf(), "unexpected src qty");
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
