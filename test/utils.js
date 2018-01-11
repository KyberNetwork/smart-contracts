var MockUtils = artifacts.require("./mockContracts/MockUtils.sol")

var Helper = require("./helper.js");
var BigNumber = require('bignumber.js');

var ethAddress = '0x00eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
var precision = new BigNumber(10).pow(18);

var utils;

contract('utils', function(accounts) {
    it("should init utils and tokens.", async function () {
        utils = await MockUtils.new();
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
            await utils.mockCalcSrcQty(30, 10, 30, 1500);
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("check dest qty calculation.", async function () {
        var srcQty = 100;
        var rate = precision.div(2); //1 to 2. in precision units

        //first check when dest decimals > src decimals
        var srcDecimal = 10;
        var dstDecimal = 20;

        var expectedDestQty = (srcQty * rate / precision) * (10 ** (dstDecimal - srcDecimal));

        var reportedDstQty = await utils.mockCalcDstQty(srcQty, srcDecimal, dstDecimal, rate);

        assert.equal(expectedDestQty.valueOf(), reportedDstQty.valueOf(), "unexpected dst qty");

        //check when dest decimals < src decimals
        srcQty = 100000000000;
        var srcDecimal = 20;
        var dstDecimal = 10;

        expectedDestQty = srcQty * rate / (precision * 10 ** (srcDecimal - dstDecimal));
        reportedDstQty = await utils.mockCalcDstQty(srcQty, srcDecimal, dstDecimal, rate);

        assert.equal(expectedDestQty, reportedDstQty.valueOf(), "unexpected dst qty");
    });

    it("check src qty calculation.", async function () {
        var dstQty = 100000;
        var rate = precision.mul(2); //2 to 1. in precision units

        //check when dest decimals > src decimals
        dstQty = 10000000;
        var srcDecimal = 10;
        var dstDecimal = 16;

        var expectedSrcQty = (((precision / rate)* dstQty * (10**(srcDecimal - dstDecimal))));
        var reportedSrcQty = await utils.mockCalcSrcQty(dstQty, srcDecimal, dstDecimal, rate);

        assert.equal(expectedSrcQty, reportedSrcQty.valueOf(), "unexpected src qty");

        //check when dest decimals < src decimals
        var srcDecimal = 12;
        var dstDecimal = 10;

        expectedSrcQty = (((precision / rate)* dstQty * (10**(srcDecimal - dstDecimal))));
        reportedSrcQty = await utils.mockCalcSrcQty(dstQty, srcDecimal, dstDecimal, rate.valueOf());
        assert.equal(expectedSrcQty, reportedSrcQty.valueOf(), "unexpected src qty");
    });
});
