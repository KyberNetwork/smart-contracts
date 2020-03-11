const MockUtils4 = artifacts.require("MockUtils4.sol")
const Helper = require("../helper.js");
const BN = web3.utils.BN;

const PRECISION = new BN(10).pow(new BN(18));
const MAX_QTY = new BN(10).pow(new BN(28));
const MAX_RATE = new BN(10).pow(new BN(24));

const MAX_DECIMALS = 18;
const ETH_DECIMALS = 18;
const BPS = 10000;

contract('utils4', function (accounts) {
    before("should init global", async function () {
        utils4 = await MockUtils4.new();
    })

    it("check constant variable", async function () {
        Helper.assertEqual(await utils4.mockGetPrecision(), PRECISION, "precision is not correct")
        Helper.assertEqual(await utils4.mockGetMaxRate(), MAX_RATE, "maxrate is not correct")
        Helper.assertEqual(await utils4.mockGetMaxQty(), MAX_QTY, "max qty is not correct")
        Helper.assertEqual(await utils4.mockGetMaxDecimals(), MAX_DECIMALS, "max decimals is not correct")
        Helper.assertEqual(await utils4.mockGetEthDecimals(), ETH_DECIMALS, "eth decimal is not correct")
        Helper.assertEqual(await utils4.mockGetBPS(), BPS, "bps is not correct")
    })
})