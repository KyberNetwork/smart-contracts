const MockUtils3 = artifacts.require("./mockContracts/MockUtils3.sol");

const Helper = require("../helper.js");
const BN = web3.utils.BN;

const PRECISION = new BN(10).pow(new BN(18));
const MAX_QTY = new BN(10).pow(new BN(28));
const MAX_RATE = new BN(10).pow(new BN(24));
const MAX_DECIMAL_DIFF = 18;

let utils3;

contract('utils3', function(accounts) {
    before("one time init", async() => {
        user = accounts[7];
        utils3 = await MockUtils3.new();
    });

    it("test calc dest amount correctly.", async function () {
        let srcDecimal = 15;
        let dstDecimal = 17;
        let srcQty = (new BN(10)).pow(new BN(srcDecimal)).mul(new BN(531));
        let rate = (new BN(10)).pow(new BN(dstDecimal)).mul(new BN(3423));

        let expectedDest = Helper.calcDstQty(srcQty, srcDecimal, dstDecimal, rate);
        let destAmount = await utils3.mockCalcDestAmountWithDecimals(srcDecimal, dstDecimal, srcQty, rate);

        Helper.assertEqual(destAmount, expectedDest);

        srcDecimal = 18;
        dstDecimal = 15;
        srcQty = (new BN(10)).pow(new BN(srcDecimal)).mul(new BN(531));
        rate = (new BN(10)).pow(new BN(dstDecimal)).mul(new BN(3423));

        expectedDest = Helper.calcDstQty(srcQty, srcDecimal, dstDecimal, rate);
        destAmount = await utils3.mockCalcDestAmountWithDecimals(srcDecimal, dstDecimal, srcQty, rate);

        Helper.assertEqual(destAmount, expectedDest);

        srcDecimal = 18;
        dstDecimal = 18;
        srcQty = (new BN(10)).pow(new BN(srcDecimal)).mul(new BN(531));
        rate = (new BN(10)).pow(new BN(dstDecimal)).mul(new BN(3423));

        expectedDest = Helper.calcDstQty(srcQty, srcDecimal, dstDecimal, rate);
        destAmount = await utils3.mockCalcDestAmountWithDecimals(srcDecimal, dstDecimal, srcQty, rate);

        Helper.assertEqual(destAmount, expectedDest);
    });

    it("test calc functionality with high decimal diff is reverted.", async function () {
        let dstDecimal = 9;
        let srcDecimal = dstDecimal + MAX_DECIMAL_DIFF * 1;
        let srcQty = 795;
        let rate = 9853;

        //should work with max decimal diff.
        let expectedDestAmount = Helper.calcDstQty(srcQty, srcDecimal, dstDecimal, rate);
        let destAmount = await utils3.mockCalcDestAmountWithDecimals(srcDecimal, dstDecimal, srcQty, rate);

        Helper.assertEqual(destAmount, expectedDestAmount);

        //should revert when qty above max
        srcDecimal += 1 * 1;
        try {
            let destAmount = await utils3.mockCalcDestAmountWithDecimals(srcDecimal, dstDecimal, srcQty, rate);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });
});
