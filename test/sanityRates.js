var SanityRates = artifacts.require("./SanityRates.sol")

var Helper = require("./helper.js");
var BigNumber = require('bignumber.js');

var ethAddress = '0x00eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
var precision = new BigNumber(10).pow(18);
var bps = 10000;
var sanityRates;
var admin;
var operator;
var numTokens = 4;
var tokens = [];
var rates = [];
var reasonableDiffs = [];

contract('SanityRates', function(accounts) {
    it("should init globals and init sanity rates.", async function () {
        admin = accounts[0];
//      tokens[0] = accounts[1];
//      tokens[1] = accounts[2];
//      tokens[2] = accounts[3];
//      tokens[3] = accounts[4];
        operator = accounts[5];

        for (var i = 0; i < numTokens; i++) {
            tokens[i] = accounts[i + 1];
            rates[i] = (i + 1) * precision / 10;
            reasonableDiffs[i] = i * 100;
        }

        sanityRates = await SanityRates.new(admin);
        await sanityRates.addOperator(operator);

        await sanityRates.setSanityRates(tokens, rates, {from: operator});
        await sanityRates.setReasonableDiff(tokens, reasonableDiffs);
    });

    it("check rates for token 0 (where diff is 0) so only tests rates.", async function () {
        var tokenToEthRate = await sanityRates.getSanityRate(tokens[0], ethAddress);
        assert.equal(tokenToEthRate.valueOf(), rates[0], "unexpected rate");

        var expectedEthToToken = new BigNumber(precision).mul(precision).div(tokenToEthRate);
        var ethToTokenRate = await sanityRates.getSanityRate(ethAddress, tokens[0]);
        assert.equal(expectedEthToToken.valueOf(), ethToTokenRate.valueOf(), "unexpected rate");
    });

    it("check rates with reasonable diff.", async function () {
        var tokenInd = 1;
        var expectedTokenToEthRate = (new BigNumber(rates[tokenInd])).mul(bps * 1 + reasonableDiffs[tokenInd] * 1).div(bps).floor();

        var tokenToEthRate = await sanityRates.getSanityRate(tokens[tokenInd], ethAddress);
        assert.equal(tokenToEthRate.valueOf(), expectedTokenToEthRate.valueOf(), "unexpected rate");

        var expectedEthToToken = (new BigNumber(precision)).mul(precision).div(rates[tokenInd]).mul(bps * 1 + reasonableDiffs[tokenInd] * 1).div(bps).floor();;
        var ethToTokenRate = await sanityRates.getSanityRate(ethAddress, tokens[tokenInd]);
        assert.equal(expectedEthToToken.valueOf(), ethToTokenRate.valueOf(), "unexpected rate");
    });
});
