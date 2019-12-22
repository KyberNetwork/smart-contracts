const MockUtils3 = artifacts.require("./mockContracts/MockUtils3.sol");

const Helper = require("./helper.js");
const BN = web3.utils.BN;

const ethAddress = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
const lowerCaseEthAdd = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const zeroAddress = '0x0000000000000000000000000000000000000000';
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
        let destDecimal = 17;
        let srcQty = (new BN(10)).pow(new BN(srcDecimal)).mul(new BN(531));
        let rate = (new BN(10)).pow(new BN(destDecimal)).mul(new BN(3423));

        let expectedDest = calcDestQty(srcDecimal, destDecimal, srcQty, rate);
        let destAmount = await utils3.mockCalcDestAmountWithDecimals(srcDecimal, destDecimal, srcQty, rate);

        assert.equal(destAmount, Math.floor(expectedDest));

        srcDecimal = 18;
        destDecimal = 15;
        srcQty = (new BN(10)).pow(new BN(srcDecimal)).mul(new BN(531));
        rate = (new BN(10)).pow(new BN(destDecimal)).mul(new BN(3423));

        expectedDest = calcDestQty(srcDecimal, destDecimal, srcQty, rate);
        destAmount = await utils3.mockCalcDestAmountWithDecimals(srcDecimal, destDecimal, srcQty, rate);

        assert.equal(destAmount, Math.floor(expectedDest));

        srcDecimal = 18;
        destDecimal = 18;
        srcQty = (new BN(10)).pow(new BN(srcDecimal)).mul(new BN(531));
        rate = (new BN(10)).pow(new BN(destDecimal)).mul(new BN(3423));

        expectedDest = calcDestQty(srcDecimal, destDecimal, srcQty, rate);
        destAmount = await utils3.mockCalcDestAmountWithDecimals(srcDecimal, destDecimal, srcQty, rate);

        assert.equal(destAmount, Math.floor(expectedDest));
    });

    it("test calc functionality with high decimal diff is reverted.", async function () {
        let destDecimal = 9;
        let srcDecimal = destDecimal + MAX_DECIMAL_DIFF * 1;
        let srcQty = 795;
        let rate = 9853;

        //should work with max decimal diff.
        let expectedDestAmount = calcDestQty(srcDecimal, destDecimal, srcQty, rate);
        let destAmount = await utils3.mockCalcDestAmountWithDecimals(srcDecimal, destDecimal, srcQty, rate);

        assert.equal(destAmount, Math.floor(expectedDestAmount));

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
        result = ((new BN(srcQty)).mul(rate).mul((new BN(10)).pow(new BN(dstDecimal - srcDecimal)))).div(PRECISION);
    } else {
        result = (new BN(srcQty)).mul(new BN(rate)).div(PRECISION.mul((new BN(10)).pow(new BN(srcDecimal - dstDecimal))));
    }
    return Math.floor(result);
}
