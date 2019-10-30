let ConversionRates = artifacts.require("./mockContracts/MockConversionRate.sol");
let TestToken = artifacts.require("./mockContracts/TestToken.sol");
let WrapConversionRate = artifacts.require("./wrapperContracts/WrapConversionRate.sol");

let Helper = require("./helper.js");
let BigNumber = require('bignumber.js');

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
let validRateDurationInBlocks = 60;

let convRatesInst;
let wrapConvRateInst;

let addTokenNonce = 0;
let tokenInfoNonce = 0;
let validDurationNonce = 0;

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
            token = await TestToken.new("test" + i, "tst" + i, 18);
            tokens[i] = token.address;
            await convRatesInst.addToken(token.address);
            await convRatesInst.setTokenControlInfo(token.address, minimalRecordResolution, maxPerBlockImbalance, maxTotalImbalance);
            await convRatesInst.enableTokenTrade(token.address);
        }
        assert.deepEqual(tokens.length, numTokens, "bad number tokens");

        await convRatesInst.setReserveAddress(reserveAddress);
    });

    it("should init ConversionRates wrapper and set as conversion rate admin.", async function () {
        wrapConvRateInst = await WrapConversionRate.new(convRatesInst.address, admin);

        //transfer admin to wrapper
//        await wrapConvRateInst.addOperator(operator, {from: admin});
        await convRatesInst.transferAdmin(wrapConvRateInst.address);
        await wrapConvRateInst.claimWrappedContractAdmin({from: admin});
    });

    it("should test add token using wrapper. and verify data with get data", async function () {
        //new token
        token = await TestToken.new("test6", "tst6", 18);
        //prepare add token data

        await wrapConvRateInst.addToken(token.address, minRecordResWrap, maxPerBlockImbWrap, maxTotalImbWrap, {from: admin});
        
        let tokenInfo = await convRatesInst.getTokenControlInfo(token.address);

        assert.equal(tokenInfo[0].valueOf(), minRecordResWrap);
        assert.equal(tokenInfo[1].valueOf(), maxPerBlockImbWrap);
        assert.equal(tokenInfo[2].valueOf(), maxTotalImbWrap);
    });

    it("should test set valid duration in blocks and verify data with get data", async function () {
        await wrapConvRateInst.setValidDurationData(validRateDurationInBlocks, {from: admin});
        
        rxValidDuration = await convRatesInst.validRateDurationInBlocks();

        assert.equal(rxValidDuration.valueOf(), validRateDurationInBlocks);
    });

    it("should test enabling token trade using wrapper", async function () {
        let enabled = await convRatesInst.mockIsTokenTradeEnabled(token.address);
        assert.equal(enabled, true, "trade should be enabled");

        await convRatesInst.disableTokenTrade(token.address, {from: alerter});
        enabled = await convRatesInst.mockIsTokenTradeEnabled(token.address);
        assert.equal(enabled, false, "trade should be disabled");

        await wrapConvRateInst.enableTokenTrade(token.address, {from: admin});
        enabled = await convRatesInst.mockIsTokenTradeEnabled(token.address);
        assert.equal(enabled, true, "trade should be enabled");
    });

    it("should test setting reserve address using wrapper", async function () {
        let resAdd = await convRatesInst.reserveContract();
        assert.equal(resAdd, reserveAddress)

        await wrapConvRateInst.setReserveAddress(accounts[3], {from: admin});
        resAdd = await convRatesInst.reserveContract();
        assert.equal(resAdd, accounts[3]);

        await wrapConvRateInst.setReserveAddress(reserveAddress, {from: admin});
        resAdd = await convRatesInst.reserveContract();
        assert.equal(resAdd, reserveAddress);
    });

    it("should test update token control info using wrapper. And getting info before update", async function () {
        //prepare new values for tokens
        let maxPerBlockList = [maxPerBlockImbWrap, maxTotalImbWrap];
        let maxTotalList = [maxTotalImbWrap, maxTotalImbWrap];

        await wrapConvRateInst.setTokenControlData(tokens, maxPerBlockList, maxTotalList, {from: admin});
        tokenInfoNonce++;

        //get token info, see updated
        tokenInfo = await convRatesInst.getTokenControlInfo(tokens[0]);

        //verify set values before updating
        assert.equal(tokenInfo[0].valueOf(), minimalRecordResolution);
        assert.equal(tokenInfo[1].valueOf(), maxPerBlockImbWrap);
        assert.equal(tokenInfo[2].valueOf(), maxTotalImbWrap);
    });

    it("should test transfer and claim admin of wrapped contract.", async function() {
        let ratesAdmin = await convRatesInst.admin();
        assert.equal(wrapConvRateInst.address, ratesAdmin.valueOf());

        await wrapConvRateInst.transferWrappedContractAdmin(admin);
        await convRatesInst.claimAdmin({from: admin});

        ratesAdmin = await convRatesInst.admin();
        assert.equal(admin, ratesAdmin.valueOf());

        //transfer admin to wrapper
        await convRatesInst.transferAdmin(wrapConvRateInst.address);
        await wrapConvRateInst.claimWrappedContractAdmin({from: admin});

        ratesAdmin = await convRatesInst.admin();
        assert.equal(wrapConvRateInst.address, ratesAdmin.valueOf());
    });

    it("should test transfer and fetch admin.", async function() {
        let ratesAdmin = await convRatesInst.admin();
        assert.equal(wrapConvRateInst.address, ratesAdmin.valueOf());

        await wrapConvRateInst.transferWrappedContractAdmin(admin);
        await convRatesInst.claimAdmin({from: admin});

        ratesAdmin = await convRatesInst.admin();
        assert.equal(admin, ratesAdmin.valueOf());

        //transfer admin to wrapper
        await convRatesInst.transferAdmin(wrapConvRateInst.address);
        await wrapConvRateInst.claimWrappedContractAdmin({from: admin});

        ratesAdmin = await convRatesInst.admin();
        assert.equal(wrapConvRateInst.address, ratesAdmin.valueOf());
    });

    it("should test only admin can call functions.", async function() {
        //add token data
        let token1 = await TestToken.new("test6", "tst6", 18);

        try {
            await wrapConvRateInst.addToken(token1.address, minRecordResWrap, maxPerBlockImbWrap, maxTotalImbWrap, {from: accounts[7]});
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //token info data
        let maxPerBlockList = [maxPerBlockImbWrap, maxTotalImbWrap];
        let maxTotalList = [maxTotalImbWrap, maxTotalImbWrap];

        try {
            await wrapConvRateInst.setTokenControlData(tokens, maxPerBlockList, maxTotalList, {from: accounts[7]});
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //valid duration
        try {
            await wrapConvRateInst.setValidDurationData(validDurationNonce, {from: accounts[7]});
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

         //valid duration
        try {
            await wrapConvRateInst.enableTokenTrade(token.address, {from: accounts[7]});
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

         //valid duration
        try {
            await wrapConvRateInst.setReserveAddress(accounts[6], {from: accounts[7]});
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("test can't init wrapper with contract with address 0.", async function() {
        let wrapper;

        try {
            wrapper = await WrapConversionRate.new(0, admin);
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            wrapper = await WrapConversionRate.new(convRatesInst.address, 0);
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
        wrapper = await WrapConversionRate.new(convRatesInst.address, admin);
    });


    it("test can't add token with zero values.", async function() {
        //new token
        token = await TestToken.new("test9", "tst9", 18);

        //prepare add token data
        let minResolution = 6;
        let maxPerBlock = 200;
        let maxTotal = 400;

        try {
            await wrapConvRateInst.addToken(0, minResolution, maxPerBlock, maxTotal, {from: admin});
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await wrapConvRateInst.addToken(token.address, 0, maxPerBlock, maxTotal, {from: admin});
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await wrapConvRateInst.addToken(token.address, minResolution, 0, maxTotal, {from: admin});
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await wrapConvRateInst.addToken(token.address, minResolution, maxPerBlock, 0, {from: admin});
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        await wrapConvRateInst.addToken(token.address, minResolution, maxPerBlock, maxTotal, {from: admin});
        addTokenNonce++;
    });

    it("test can't set token control data with arrays that have different length.", async function() {
        let maxPerBlockList = [maxPerBlockImbWrap];
        let maxTotalList = [maxTotalImbWrap, maxTotalImbWrap];

        try {
            await wrapConvRateInst.setTokenControlData(tokens, maxPerBlockList, maxTotalList, {from: admin});
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }


        maxPerBlockList = [maxPerBlockImbWrap, maxPerBlockImbWrap];
        maxTotalList = [maxTotalImbWrap];
        try {
            await wrapConvRateInst.setTokenControlData(tokens, maxPerBlockList, maxTotalList, {from: admin});
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        maxPerBlockList = [maxPerBlockImbWrap, maxPerBlockImbWrap, maxPerBlockImbWrap];
        maxTotalList = [maxTotalImbWrap, maxTotalImbWrap, maxTotalImbWrap];
        try {
            await wrapConvRateInst.setTokenControlData(tokens, maxPerBlockList, maxTotalList, {from: admin});
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        maxPerBlockList = [maxPerBlockImbWrap, maxPerBlockImbWrap];
        maxTotalList = [maxTotalImbWrap, maxTotalImbWrap];

        await wrapConvRateInst.setTokenControlData(tokens, maxPerBlockList, maxTotalList, {from: admin});
        tokenInfoNonce++;
    });

    it("init wrapper with illegal values.", async function() {
        let wrapper;

        try {
            wrapper = await WrapConversionRate.new(0, admin);
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }


        try {
            wrapper = await WrapConversionRate.new(convRatesInst.address, 0);
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        wrapper = await WrapConversionRate.new(convRatesInst.address, admin);
    });

});