const MockUtils4 = artifacts.require("MockUtils4.sol")
const Helper = require("../helper.js");
const TestToken = artifacts.require("TestToken.sol");
const TokenNoDecimal = artifacts.require("TokenNoDecimal.sol");
const expectRevert = require('@openzeppelin/test-helpers');
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

    it("should check get decimals for token without decimals API. see reverts", async function () {
        let tokenNoDecimal = await TokenNoDecimal.new("noDec", "dec", 18);
        let token = await TestToken.new("regular", "reg", 16);
        console.log("xxxx", tokenNoDecimal.address)

        try {
            await utils4.mockSetDecimals(tokenNoDecimal.address);
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //this should succeed.
        await utils4.mockSetDecimals(token.address);

        //now get deicmals to see values
        await expectRevert.unspecified(utils4.mockSetDecimals(tokenNoDecimal.address));

        decimals = await utils4.mockSetDecimals(token.address);
        Helper.assertEqual(decimals, 16);
    });

})