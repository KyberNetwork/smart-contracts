let SanityRates = artifacts.require("./SanityRates.sol")

let Helper = require("../helper.js");
const BN = web3.utils.BN;

//global variables
const ethAddress = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
const zeroAddress = '0x0000000000000000000000000000000000000000';
const precisionUnits = (new BN(10).pow(new BN(18)));
const bps = new BN(10000);

let sanityRates;
let admin;
let operator;
let numTokens = 4;
let tokens = [];
let rates = [];
let reasonableDiffs = [];

contract('SanityRates', function(accounts) {
    it("should init globals and init sanity rates.", async function () {
        admin = accounts[0];
//      tokens[0] = accounts[1];
//      tokens[1] = accounts[2];
//      tokens[2] = accounts[3];
//      tokens[3] = accounts[4];
        operator = accounts[5];

        for (let i = 0; i < numTokens; i++) {
            tokens[i] = accounts[i + 1];
            rates[i] = (new BN(i + 1)).mul(precisionUnits.div(new BN(10)));
            reasonableDiffs[i] = new BN(i * 100);
        }

        sanityRates = await SanityRates.new(admin);
        await sanityRates.addOperator(operator);

        await sanityRates.setSanityRates(tokens, rates, {from: operator});
        await sanityRates.setReasonableDiff(tokens, reasonableDiffs);
    });

    it("check rates for token 0 (where diff is 0) so only tests rates.", async function () {
        let tokenToEthRate = await sanityRates.getSanityRate(tokens[0], ethAddress);
        Helper.assertEqual(tokenToEthRate, rates[0], "unexpected rate");

        let expectedEthToToken = precisionUnits.mul(precisionUnits).div(tokenToEthRate);
        let ethToTokenRate = await sanityRates.getSanityRate(ethAddress, tokens[0]);
        Helper.assertEqual(expectedEthToToken, ethToTokenRate, "unexpected rate");
    });

    it("check rates with reasonable diff.", async function () {
        let tokenInd = 1;
        let expectedTokenToEthRate = rates[tokenInd].mul(bps.add(reasonableDiffs[tokenInd])).div(bps);

        let tokenToEthRate = await sanityRates.getSanityRate(tokens[tokenInd], ethAddress);
        Helper.assertEqual(tokenToEthRate, expectedTokenToEthRate, "unexpected rate");

        let expectedEthToToken = precisionUnits.mul(precisionUnits).div(rates[tokenInd]).mul(bps.add(reasonableDiffs[tokenInd])).div(bps);
        let ethToTokenRate = await sanityRates.getSanityRate(ethAddress, tokens[tokenInd]);
        Helper.assertEqual(expectedEthToToken, ethToTokenRate, "unexpected rate");
    });

    it("should test can't init this contract with empty contracts (address 0).", async function () {
        let sanityRatess;

        try {
           sanityRatess = await SanityRates.new(zeroAddress);
           assert(false, "throw was expected in line above.")
        } catch(e){
           assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        sanityRatess = await SanityRates.new(admin);
    });

    it("should test can't init diffs when array lengths aren't the same.", async function () {
        reasonableDiffs.push(8);
        try {
            await sanityRates.setReasonableDiff(tokens, reasonableDiffs);
            assert(false, "throw was expected in line above.")
        } catch(e){
           assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        reasonableDiffs.length = tokens.length;

        await sanityRates.setReasonableDiff(tokens, reasonableDiffs);
    });

    it("should test can't init diffs when value > max diff (10000 = 100%).", async function () {
        reasonableDiffs[0] =  new BN(10001);

        try {
            await sanityRates.setReasonableDiff(tokens, reasonableDiffs);
            assert(false, "throw was expected in line above.")
        } catch(e){
           assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        reasonableDiffs[0] = new BN(10000);;

        await sanityRates.setReasonableDiff(tokens, reasonableDiffs);
    });

    it("should test can't init rates when array lengths aren't the same.", async function () {
        rates.push(new BN(8));
        try {
            await sanityRates.setSanityRates(tokens, rates, {from: operator});
            assert(false, "throw was expected in line above.")
        } catch(e){
           assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        rates.length = tokens.length;

        await sanityRates.setSanityRates(tokens, rates, {from: operator});
    });

    it("should test reverts when sanity rate > maxRate (10**24).", async function () {
        let legalRate = (new BN(10)).pow(new BN(24));
        let illegalRate = legalRate.add(new BN(1));

        rates[0] = illegalRate;

        try {
            await sanityRates.setSanityRates(tokens, rates, {from: operator});
            assert(false, "throw was expected in line above.")
        } catch(e){
           assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        rates[0] = legalRate;
        await sanityRates.setSanityRates(tokens, rates, {from: operator});
    });

    it("should test return rate 0 when both are tokens (no ether).", async function () {
        let rate0 = await sanityRates.getSanityRate(tokens[1], tokens[2]);
        Helper.assertEqual(rate0, 0, "0 rate expected");
        rate0 = await sanityRates.getSanityRate(tokens[0], tokens[1]);
        Helper.assertEqual(rate0, 0, "0 rate expected");
        rate0 = await sanityRates.getSanityRate(tokens[2], tokens[3]);
        Helper.assertEqual(rate0, 0, "0 rate expected");
    });
});
