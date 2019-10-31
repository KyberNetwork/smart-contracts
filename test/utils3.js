const MockUtils3 = artifacts.require("./mockContracts/MockUtils3.sol");

const Helper = require("./helper.js");
const BigNumber = require('bignumber.js');

const PRECISION = new BigNumber(10).pow(18);
const MAX_QTY = new BigNumber(10).pow(28);
const MAX_RATE = new BigNumber(10).pow(24);
const MAX_DECIMAL_DIFF = 18;

let utils3;

contract('utils3', function(accounts) {
    before("one time init", async() => {
        user = accounts[7];
        utils3 = await MockUtils3.new();
    });

    it("test calc dest amount correctly.", async function () {
        let srcDecimal = 15;
        let destDecimal = 17;
        let srcQty = (new BigNumber(10)).pow(srcDecimal).mul(531);
        let rate = (new BigNumber(10)).pow(destDecimal).mul(3423);

        let expectedDest = calcDestQty(srcDecimal, destDecimal, srcQty, rate);
        let destAmount = await utils3.mockCalcDestAmountWithDecimals(srcDecimal, destDecimal, srcQty, rate);

        assert.equal(destAmount.valueOf(), expectedDest.floor().valueOf());

        srcDecimal = 18;
        destDecimal = 15;
        srcQty = (new BigNumber(10)).pow(srcDecimal).mul(531);
        rate = (new BigNumber(10)).pow(destDecimal).mul(3423);

        expectedDest = calcDestQty(srcDecimal, destDecimal, srcQty, rate);
        destAmount = await utils3.mockCalcDestAmountWithDecimals(srcDecimal, destDecimal, srcQty, rate);

        assert.equal(destAmount.valueOf(), expectedDest.floor().valueOf());

        srcDecimal = 18;
        destDecimal = 18;
        srcQty = (new BigNumber(10)).pow(srcDecimal).mul(531);
        rate = (new BigNumber(10)).pow(destDecimal).mul(3423);

        expectedDest = calcDestQty(srcDecimal, destDecimal, srcQty, rate);
        destAmount = await utils3.mockCalcDestAmountWithDecimals(srcDecimal, destDecimal, srcQty, rate);

        assert.equal(destAmount.valueOf(), expectedDest.floor().valueOf());
    });

    it("test calc functionality with high src quantity.", async function () {
        let srcDecimal = 15;
        let destDecimal = 17;
        let srcQty = MAX_QTY;
        let rate = 11531;

        //should work with max decimal diff.
        let expectedDestAmount = calcDestQty(srcDecimal, destDecimal, srcQty, rate);
        let destAmount = await utils3.mockCalcDestAmountWithDecimals(srcDecimal, destDecimal, srcQty, rate);

        assert.equal(destAmount.valueOf(), expectedDestAmount.floor().valueOf());

        //should revert when qty above max
        srcQty = MAX_QTY.add(1);
        try {
            let destAmount = await utils3.mockCalcDestAmountWithDecimals(srcDecimal, destDecimal, srcQty, rate);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("test calc functionality with high rate.", async function () {
        let srcDecimal = 15;
        let destDecimal = 17;
        let srcQty = 12311;
        let rate = MAX_RATE;

        //should work with max decimal diff.
        let expectedDestAmount = calcDestQty(srcDecimal, destDecimal, srcQty, rate);
        let destAmount = await utils3.mockCalcDestAmountWithDecimals(srcDecimal, destDecimal, srcQty, rate);

        assert.equal(destAmount.valueOf(), expectedDestAmount.floor().valueOf());

        //should revert when rate above max rate
        rate = MAX_RATE.add(1);
        try {
            let destAmount = await utils3.mockCalcDestAmountWithDecimals(srcDecimal, destDecimal, srcQty, rate);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });
    
    it("test calc functionality with high decimal diff is reverted.", async function () {
        let srcDecimal = 4;
        let destDecimal = srcDecimal + MAX_DECIMAL_DIFF * 1;
        let srcQty = 795;
        let rate = 9853;

        //should work with max decimal diff.rate
        let expectedDestAmount = calcDestQty(srcDecimal, destDecimal, srcQty, rate);
        let destAmount = await utils3.mockCalcDestAmountWithDecimals(srcDecimal, destDecimal, srcQty, rate);

        assert.equal(destAmount.valueOf(), expectedDestAmount.floor().valueOf());

        //should revert when qty above max
        destDecimal += 1 * 1;
        try {
            let destAmount = await utils3.mockCalcDestAmountWithDecimals(srcDecimal, destDecimal, srcQty, rate);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("test calc functionality with high decimal diff is reverted.", async function () {
        let destDecimal = 9;
        let srcDecimal = destDecimal + MAX_DECIMAL_DIFF * 1;
        let srcQty = 795;
        let rate = 9853;

        //should work with max decimal diff.
        let expectedDestAmount = calcDestQty(srcDecimal, destDecimal, srcQty, rate);
        let destAmount = await utils3.mockCalcDestAmountWithDecimals(srcDecimal, destDecimal, srcQty, rate);

        assert.equal(destAmount.valueOf(), expectedDestAmount.floor().valueOf());

        //should revert when qty above max
        srcDecimal += 1 * 1;
        try {
            let destAmount = await utils3.mockCalcDestAmountWithDecimals(srcDecimal, destDecimal, srcQty, rate);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });
});

function calcDestQty (srcDecimal, dstDecimal, srcQty, rate) {
    let result;
    if (dstDecimal >= srcDecimal) {
        result = ((((new BigNumber(srcQty)).mul(rate).mul((new BigNumber(10)).pow(dstDecimal - srcDecimal))).div(PRECISION)));
    } else {
        result = ((new BigNumber(srcQty)).mul(rate).div(PRECISION.mul((new BigNumber(10)).pow(srcDecimal - dstDecimal))));
    }
    return result.floor();
}
