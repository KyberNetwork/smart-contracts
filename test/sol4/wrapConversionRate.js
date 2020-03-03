const ConversionRates = artifacts.require("MockConversionRate.sol");
const TestToken = artifacts.require("TestToken.sol");
const WrapConversionRate = artifacts.require("WrapConversionRate.sol");

const Helper = require("../helper.js");
const BN = web3.utils.BN;
const zeroAddress = '0x0000000000000000000000000000000000000000';

//global variables
let minimalRecordResolution = 2; //low resolution so I don't lose too much data. then easier to compare calculated imbalance values.
let maxPerBlockImbalance = 4000;
let maxTotalImbalance = maxPerBlockImbalance * 2;

let minRecordResWrap = 4; //low resolution so I don't lose too much data. then easier to compare calculated imbalance values.
let maxPerBlockImbWrap = 1000;
let maxTotalImbWrap = 2000;

let admin;
let alerter;
let numTokens = 2;
let tokens = [];
let operator;
let reserveAddress;
let validRateDurationInBlocks = new BN(60);

let convRatesInst;
let wrapConvRateInst;

contract('WrapConversionRates', function(accounts) {
    it("should init ConversionRates Inst and set general parameters.", async function () {
        admin = accounts[0];
        alerter = accounts[1];
        operator = accounts[2];
        reserveAddress = accounts[5];

        //init contracts
        convRatesInst = await ConversionRates.new(admin);
        await convRatesInst.addAlerter(alerter);

        //set pricing general parameters
        convRatesInst.setValidRateDurationInBlocks(validRateDurationInBlocks);

        //create and add tokens. actually only addresses...
        for (let i = 0; i < numTokens; ++i) {
            let token = await TestToken.new("test" + i, "tst" + i, 18);
            tokens[i] = token.address;
            await convRatesInst.addToken(token.address);
            await convRatesInst.setTokenControlInfo(token.address, minimalRecordResolution, maxPerBlockImbalance, maxTotalImbalance);
            await convRatesInst.enableTokenTrade(token.address);
        }
        assert.deepEqual(tokens.length, numTokens, "bad number tokens");

        await convRatesInst.setReserveAddress(reserveAddress);
    });

    it("should init ConversionRates wrapper and set as conversion rate admin.", async function () {
        wrapConvRateInst = await WrapConversionRate.new(convRatesInst.address, {from: admin});

        //transfer admin to wrapper
//        await wrapConvRateInst.addOperator(operator, {from: admin});
        await convRatesInst.transferAdmin(wrapConvRateInst.address);
        let operators = await convRatesInst.getOperators();
        Helper.assertEqual(operators.length, 0);
        await wrapConvRateInst.claimWrappedContractAdmin({from: admin});

        operators = await convRatesInst.getOperators();
        Helper.assertEqual(operators.length, 1);
        Helper.assertEqual(operators[0], wrapConvRateInst.address)

        let rxAdmin = await convRatesInst.admin();
        Helper.assertEqual(rxAdmin, wrapConvRateInst.address);
    });

    it("should test add token using wrapper. and verify data with get data", async function () {
        //new token
        let token = await TestToken.new("test6", "tst6", 18);
        //prepare add token data

        await wrapConvRateInst.addToken(token.address, minRecordResWrap, maxPerBlockImbWrap, maxTotalImbWrap, {from: admin});
        let tokenInfo = await convRatesInst.getTokenControlInfo(token.address);

        Helper.assertEqual(tokenInfo[0], minRecordResWrap);
        Helper.assertEqual(tokenInfo[1], maxPerBlockImbWrap);
        Helper.assertEqual(tokenInfo[2], maxTotalImbWrap);
    });

    it("should test set valid duration in blocks and verify data ", async function () {
        await wrapConvRateInst.setValidDurationData(validRateDurationInBlocks, {from: admin});
        rxValidDuration = await convRatesInst.validRateDurationInBlocks();
        Helper.assertEqual(rxValidDuration, validRateDurationInBlocks);

        validRateDurationInBlocks.imul(new BN(2));
        await wrapConvRateInst.setValidDurationData(validRateDurationInBlocks, {from: admin});
        rxValidDuration = await convRatesInst.validRateDurationInBlocks();
        Helper.assertEqual(rxValidDuration, validRateDurationInBlocks);
    });

    it("should test enabling token trade using wrapper", async function () {
        let token = tokens[0];
        let enabled = await convRatesInst.mockIsTokenTradeEnabled(token);
        Helper.assertEqual(enabled, true, "trade should be enabled");

        await convRatesInst.disableTokenTrade(token, {from: alerter});
        enabled = await convRatesInst.mockIsTokenTradeEnabled(token);
        Helper.assertEqual(enabled, false, "trade should be disabled");

        await wrapConvRateInst.enableTokenTrade(token, {from: admin});
        enabled = await convRatesInst.mockIsTokenTradeEnabled(token);
        Helper.assertEqual(enabled, true, "trade should be enabled");
    });

    it("should test setting reserve address using wrapper", async function () {
        let resAdd = await convRatesInst.reserveContract();
        Helper.assertEqual(resAdd, reserveAddress)

        await wrapConvRateInst.setReserveAddress(accounts[3], {from: admin});
        resAdd = await convRatesInst.reserveContract();
        Helper.assertEqual(resAdd, accounts[3]);

        await wrapConvRateInst.setReserveAddress(reserveAddress, {from: admin});
        resAdd = await convRatesInst.reserveContract();
        Helper.assertEqual(resAdd, reserveAddress);
    });

    it("should test update token control info using wrapper. And check values updated", async function () {
        //prepare new values for tokens
        let maxPerBlockList = [maxPerBlockImbWrap, maxPerBlockImbWrap];
        let maxTotalList = [maxTotalImbWrap, maxTotalImbWrap];

        await wrapConvRateInst.setTokenControlData(tokens, maxPerBlockList, maxTotalList, {from: admin});

        //get token info, see updated
        tokenInfo = await convRatesInst.getTokenControlInfo(tokens[0]);

        //verify set values before updating
        Helper.assertEqual(tokenInfo[0], minimalRecordResolution);
        Helper.assertEqual(tokenInfo[1], maxPerBlockImbWrap);
        Helper.assertEqual(tokenInfo[2], maxTotalImbWrap);

        tokenInfo = await convRatesInst.getTokenControlInfo(tokens[1]);

        //verify set values before updating
        Helper.assertEqual(tokenInfo[0], minimalRecordResolution);
        Helper.assertEqual(tokenInfo[1], maxPerBlockImbWrap);
        Helper.assertEqual(tokenInfo[2], maxTotalImbWrap);

        maxPerBlockList = [maxPerBlockImbalance, maxPerBlockImbWrap];
        maxTotalList = [maxTotalImbalance, maxTotalImbWrap];

        await wrapConvRateInst.setTokenControlData(tokens, maxPerBlockList, maxTotalList, {from: admin});

        //get token info, see updated
        tokenInfo = await convRatesInst.getTokenControlInfo(tokens[0]);

        //verify set values before updating
        Helper.assertEqual(tokenInfo[0], minimalRecordResolution);
        Helper.assertEqual(tokenInfo[1], maxPerBlockImbalance);
        Helper.assertEqual(tokenInfo[2], maxTotalImbalance);

        tokenInfo = await convRatesInst.getTokenControlInfo(tokens[1]);
        //verify set values before updating
        Helper.assertEqual(tokenInfo[0], minimalRecordResolution);
        Helper.assertEqual(tokenInfo[1], maxPerBlockImbWrap);
        Helper.assertEqual(tokenInfo[2], maxTotalImbWrap);
    });

    it("should test update token min record resolution using wrapper. And check values updated", async function () {
        //prepare new values for tokens
        let minResolutionVals = [minRecordResWrap, minRecordResWrap];

        await wrapConvRateInst.setTokenMinResolution(tokens, minResolutionVals, {from: admin});

        //get token info, see updated
        tokenInfo = await convRatesInst.getTokenControlInfo(tokens[0]);

        //verify set values before updating
        Helper.assertEqual(tokenInfo[0], minRecordResWrap);
        Helper.assertEqual(tokenInfo[1], maxPerBlockImbalance);
        Helper.assertEqual(tokenInfo[2], maxTotalImbalance);

        //get token info, see updated
        tokenInfo = await convRatesInst.getTokenControlInfo(tokens[1]);

        //verify set values before updating
        Helper.assertEqual(tokenInfo[0], minRecordResWrap);
        Helper.assertEqual(tokenInfo[1], maxPerBlockImbWrap);
        Helper.assertEqual(tokenInfo[2], maxTotalImbWrap);

        minResolutionVals = [minRecordResWrap, minimalRecordResolution];

        await wrapConvRateInst.setTokenMinResolution(tokens, minResolutionVals, {from: admin});

        //get token info, see updated
        tokenInfo = await convRatesInst.getTokenControlInfo(tokens[0]);
        Helper.assertEqual(tokenInfo[0], minRecordResWrap);

        tokenInfo = await convRatesInst.getTokenControlInfo(tokens[1]);
        Helper.assertEqual(tokenInfo[0], minimalRecordResolution);
    });

    it("should test transfer and claim admin of wrapped contract.", async function() {
        let ratesAdmin = await convRatesInst.admin();
        Helper.assertEqual(wrapConvRateInst.address, ratesAdmin);

        await wrapConvRateInst.transferWrappedContractAdmin(admin, {from: admin});
        await convRatesInst.claimAdmin({from: admin});

        ratesAdmin = await convRatesInst.admin();
        Helper.assertEqual(admin, ratesAdmin);

        //transfer admin to wrapper
        await convRatesInst.transferAdmin(wrapConvRateInst.address, {from: admin});
        let pending = await convRatesInst.pendingAdmin();
        Helper.assertEqual(pending, wrapConvRateInst.address);

        // for additional claim must remove operator.
        await convRatesInst.removeOperator(wrapConvRateInst.address, {from: admin});
        await wrapConvRateInst.claimWrappedContractAdmin( {from: admin});

        ratesAdmin = await convRatesInst.admin();
        Helper.assertEqual(wrapConvRateInst.address, ratesAdmin);
    });

    it("should test only admin can call functions.", async function() {
        //add token data
        let token1 = await TestToken.new("test6", "tst6", 18);
        let token = tokens[0];

        try {
            await wrapConvRateInst.addToken(token1.address, minRecordResWrap, maxPerBlockImbWrap, maxTotalImbWrap, {from: accounts[7]});
            assert(false, "throw was expected in line above.")
        } catch(e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //token info data
        let maxPerBlockList = [maxPerBlockImbWrap, maxTotalImbWrap];
        let maxTotalList = [maxTotalImbWrap, maxTotalImbWrap];

        try {
            await wrapConvRateInst.setTokenControlData(tokens, maxPerBlockList, maxTotalList, {from: accounts[7]});
            assert(false, "throw was expected in line above.")
        } catch(e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //token min res data
        let minResolutionVals = [minimalRecordResolution, minimalRecordResolution];

        try {
            await wrapConvRateInst.setTokenMinResolution(tokens, minResolutionVals, {from: accounts[7]});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //enable token trade
        try {
            await wrapConvRateInst.enableTokenTrade(token, {from: accounts[7]});
            assert(false, "throw was expected in line above.")
        } catch(e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

         //ser reserve address
        try {
            await wrapConvRateInst.setReserveAddress(accounts[6], {from: accounts[7]});
            assert(false, "throw was expected in line above.")
        } catch(e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("test can't init wrapper with contract with address 0.", async function() {
        let wrapper;

        try {
            wrapper = await WrapConversionRate.new(zeroAddress, {from: admin});
            assert(false, "throw was expected in line above.")
        } catch(e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        wrapper = await WrapConversionRate.new(convRatesInst.address, {from: admin});
    });


    it("test can't add token with zero values.", async function() {
        //new token
        tokenN = await TestToken.new("test9", "tst9", 18);

        //prepare add token data
        let minResolution = 6;
        let maxPerBlock = 200;
        let maxTotal = 400;

        try {
            await wrapConvRateInst.addToken(zeroAddress, minResolution, maxPerBlock, maxTotal, {from: admin});
            assert(false, "throw was expected in line above.")
        } catch(e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await wrapConvRateInst.addToken(tokenN.address, 0, maxPerBlock, maxTotal, {from: admin});
            assert(false, "throw was expected in line above.")
        } catch(e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await wrapConvRateInst.addToken(tokenN.address, minResolution, 0, maxTotal, {from: admin});
            assert(false, "throw was expected in line above.")
        } catch(e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await wrapConvRateInst.addToken(tokenN.address, minResolution, maxPerBlock, 0, {from: admin});
            assert(false, "throw was expected in line above.")
        } catch(e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        await wrapConvRateInst.addToken(tokenN.address, minResolution, maxPerBlock, maxTotal, {from: admin});
    });

    it("test can't set token control data with arrays that have different length.", async function() {
        let maxPerBlockList = [maxPerBlockImbWrap];
        let maxTotalList = [maxTotalImbWrap, maxTotalImbWrap];

        try {
            await wrapConvRateInst.setTokenControlData(tokens, maxPerBlockList, maxTotalList, {from: admin});
            assert(false, "throw was expected in line above.")
        } catch(e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        maxPerBlockList = [maxPerBlockImbWrap, maxPerBlockImbWrap];
        maxTotalList = [maxTotalImbWrap];
        try {
            await wrapConvRateInst.setTokenControlData(tokens, maxPerBlockList, maxTotalList, {from: admin});
            assert(false, "throw was expected in line above.")
        } catch(e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        maxPerBlockList = [maxPerBlockImbWrap, maxPerBlockImbWrap, maxPerBlockImbWrap];
        maxTotalList = [maxTotalImbWrap, maxTotalImbWrap, maxTotalImbWrap];
        try {
            await wrapConvRateInst.setTokenControlData(tokens, maxPerBlockList, maxTotalList, {from: admin});
            assert(false, "throw was expected in line above.")
        } catch(e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        maxPerBlockList = [maxPerBlockImbWrap, maxPerBlockImbWrap];
        maxTotalList = [maxTotalImbWrap, maxTotalImbWrap];

        await wrapConvRateInst.setTokenControlData(tokens, maxPerBlockList, maxTotalList, {from: admin});
    });
});

function log(str) {
    console.log(str);
}
