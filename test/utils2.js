const MockUtils2 = artifacts.require("./mockContracts/MockUtils2.sol");
const TokenNoDecimalApi = artifacts.require("./mockContracts/TokenNoDecimalApi.sol");
const TestToken = artifacts.require("./mockContracts/TestToken.sol");

const Helper = require("./helper.js");
const BigNumber = require('bignumber.js');

const ethAddress = '0x00eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const precision = new BigNumber(10).pow(18);

let utils2;

contract('utils2', function(accounts) {
    it("should init utils and tokens.", async function () {
        utils2 = await MockUtils2.new();
    });

    it("should check get decimals for token without decimals API.", async function () {
        let tokenNoDecimal = await TokenNoDecimalApi.new("noDec",  "dec", 18);
        let token = await TestToken.new("regular", "reg", 16);

        let decimals = await utils2.mockGetDecimalsSafe(tokenNoDecimal.address);
        assert.equal(decimals.valueOf(), 18);

        decimals = await utils2.mockGetDecimalsSafe(token.address);
        assert.equal(decimals.valueOf(), 16);
    });
});
