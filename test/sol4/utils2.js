const MockUtils2 = artifacts.require("./mockContracts/MockUtils2.sol");
const TokenNoDecimal = artifacts.require("./mockContracts/TokenNoDecimal.sol");
const TestToken = artifacts.require("./mockContracts/TestToken.sol");

const Helper = require("../helper.js");
const BN = web3.utils.BN;

const ethAddress = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
const PRECISION = new BN(10).pow(new BN(18));
const MAX_QTY = new BN(10).pow(new BN(28));
const MAX_RATE = new BN(10).pow(new BN(24));
const MAX_DECIMAL_DIFF = 18;

let utils2;
let user;

contract('utils2', function(accounts) {
    it("should init utils and tokens.", async function () {
        user = accounts[7];
        utils2 = await MockUtils2.new();
    });

    it("should check get decimals for token without decimals API. see reverts", async function () {
        let tokenNoDecimal = await TokenNoDecimal.new("noDec",  "dec", 18);
        let token = await TestToken.new("regular", "reg", 16);

        try {
            await utils2.mockSetDecimalsSafe(tokenNoDecimal.address);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //this should succeed.
        await utils2.mockSetDecimalsSafe(token.address);
	
	//now get deicmals to see values
	let decimals = await utils2.mockGetDecimalsSafe(tokenNoDecimal.address);
        Helper.assertEqual(decimals, 0, "decimals should be 0 since values wasn't set");

        decimals = await utils2.mockGetDecimalsSafe(token.address);
        Helper.assertEqual(decimals, 16);
    });

    it("should test get balance function", async function () {
        let token = await TestToken.new("regular", "reg", 16);
        let tokenBalance = 600;

        await token.transfer(user, tokenBalance);

        let balance = await utils2.getBalance(token.address, user);
        Helper.assertEqual(balance, tokenBalance);

        await Helper.sendEtherWithPromise(user, accounts[3], 110500000);


        let balanceEth = await Helper.getBalancePromise(user);
        balance = await utils2.getBalance(ethAddress, user);
        Helper.assertEqual(balance, balanceEth);
    });

    it("test calc rate from qty.", async function () {
        let srcDecimal = 15;
        let destDecimal = 17;
        let srcQty = 531;
        let destQty = 11531;

        let expectedRate = Helper.calcRateFromQty(srcQty, destQty,srcDecimal, destDecimal);
        let rxRate = await utils2.mockCalcRateFromQty(srcQty, destQty, srcDecimal, destDecimal);

        Helper.assertEqual(rxRate, expectedRate);
    });

    it("test calc rate from qty. other numbers", async function () {
       let srcDecimal = 15;
       let destDecimal = 9;
       let srcQty = 5313535;
       let destQty = 11531;

       let expectedRate = Helper.calcRateFromQty(srcQty, destQty,srcDecimal, destDecimal);
       let rxRate = await utils2.mockCalcRateFromQty(srcQty, destQty, srcDecimal, destDecimal);

       Helper.assertEqual(rxRate, expectedRate);
    });

    it("test calc functionality with high src quantity.", async function () {
        let srcDecimal = 15;
        let destDecimal = 17;
        let srcQty = MAX_QTY;
        let destQty = 11531;

        //should work with max qty.
        let expectedRate = Helper.calcRateFromQty(srcQty, destQty,srcDecimal, destDecimal);
        let rxRate = await utils2.mockCalcRateFromQty(srcQty, destQty, srcDecimal, destDecimal);

        Helper.assertEqual(rxRate, expectedRate);

        //should revert when qty above max
        srcQty = MAX_QTY.add(new BN(1));
        try {
            let rxRate = await utils2.mockCalcRateFromQty(srcQty, destQty, srcDecimal, destDecimal);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("test calc functionality with high dest quantity.", async function () {
        let srcDecimal = 15;
        let destDecimal = 17;
        let srcQty = 1;
        let destQty = MAX_QTY;

        //should work with max qty.
        let expectedRate = Helper.calcRateFromQty(srcQty, destQty,srcDecimal, destDecimal);
        let rxRate = await utils2.mockCalcRateFromQty(srcQty, destQty, srcDecimal, destDecimal);

        Helper.assertEqual(rxRate, expectedRate);
//        assert(expectedRate.lt(MAX_RATE), "Rate too high. rate: " + expectedRate + "  max rate: " + MAX_RATE);

        //should revert when qty above max
        destQty = MAX_QTY.add(new BN(1));
        try {
            let rxRate = await utils2.mockCalcRateFromQty(srcQty, destQty, srcDecimal, destDecimal);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("test calc functionality with high decimal diff is reverted.", async function () {
        let srcDecimal = 4;
        let destDecimal = srcDecimal + MAX_DECIMAL_DIFF * 1;
        let srcQty = 795;
        let destQty = 9853;

        //should work with max decimal diff.
        let expectedRate = Helper.calcRateFromQty(srcQty, destQty,srcDecimal, destDecimal);
        let rxRate = await utils2.mockCalcRateFromQty(srcQty, destQty, srcDecimal, destDecimal);

        Helper.assertEqual(rxRate, expectedRate);

        //should revert when qty above max
        destDecimal += 1 * 1;
        try {
            let rxRate = await utils2.mockCalcRateFromQty(srcQty, destQty, srcDecimal, destDecimal);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("test calc functionality with high decimal diff is reverted.", async function () {
        let destDecimal = 9;
        let srcDecimal = destDecimal + MAX_DECIMAL_DIFF * 1;
        let srcQty = 795;
        let destQty = 9853;

        //should work with max decimal diff.
        let expectedRate = Helper.calcRateFromQty(srcQty, destQty,srcDecimal, destDecimal);
        let rxRate = await utils2.mockCalcRateFromQty(srcQty, destQty, srcDecimal, destDecimal);

        Helper.assertEqual(rxRate, expectedRate);

        //should revert when qty above max
        srcDecimal += 1 * 1;
        try {
            let rxRate = await utils2.mockCalcRateFromQty(srcQty, destQty, srcDecimal, destDecimal);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });
});
