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
let operator1;
let operator2;
let operator3;
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
        operator1 = accounts[2];
        operator2 = accounts[3];
        operator3 = accounts[4];
        reserveAddress = accounts[5];

        //init contracts
        convRatesInst = await ConversionRates.new(admin);

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

        await wrapConvRateInst.addOperator(operator1);
        await wrapConvRateInst.addOperator(operator2);
        await wrapConvRateInst.addOperator(operator3);

        //transfer admin to wrapper
        await convRatesInst.transferAdmin(wrapConvRateInst.address);
        await wrapConvRateInst.claimWrappedContractAdmin({from: operator1});
    });

    it("should test add token using wrapper. and verify data with get data", async function () {
        //new token
        token = await TestToken.new("test6", "tst6", 18);
        //prepare add token data

        await wrapConvRateInst.setAddTokenData(token.address, minRecordResWrap, maxPerBlockImbWrap, maxTotalImbWrap, {from: operator1});
        addTokenNonce++;

        let addData = await wrapConvRateInst.getAddTokenData();
        assert.equal(addData[0].valueOf(), addTokenNonce);
        assert.equal(addData[1].valueOf(), token.address);
        assert.equal(addData[2].valueOf(), minRecordResWrap);
        assert.equal(addData[3].valueOf(), maxPerBlockImbWrap);
        assert.equal(addData[4].valueOf(), maxTotalImbWrap);


        await wrapConvRateInst.approveAddTokenData(addTokenNonce, {from:operator1});
        await wrapConvRateInst.approveAddTokenData(addTokenNonce, {from:operator2});
        await wrapConvRateInst.approveAddTokenData(addTokenNonce, {from:operator3});

        let tokenInfo = await convRatesInst.getTokenControlInfo(token.address);

        assert.equal(tokenInfo[0].valueOf(), minRecordResWrap);
        assert.equal(tokenInfo[1].valueOf(), maxPerBlockImbWrap);
        assert.equal(tokenInfo[2].valueOf(), maxTotalImbWrap);
    });

    it("should test set valid duration in blocks and verify data with get data", async function () {
        await wrapConvRateInst.setValidDurationData(validRateDurationInBlocks, {from: operator1});
        validDurationNonce++;

        let validDurationInfo = await wrapConvRateInst.getValidDurationBlocksData();
        assert.equal(validDurationInfo[0].valueOf(), validDurationNonce);
        assert.equal(validDurationInfo[1].valueOf(), validRateDurationInBlocks);


        await wrapConvRateInst.approveValidDurationData(validDurationNonce, {from:operator1});
        await wrapConvRateInst.approveValidDurationData(validDurationNonce, {from:operator2});
        await wrapConvRateInst.approveValidDurationData(validDurationNonce, {from:operator3});

        rxValidDuration = await convRatesInst.validRateDurationInBlocks();

        assert.equal(rxValidDuration.valueOf(), validRateDurationInBlocks);
    });

    it("should test update token control info using wrapper. And getting info before update", async function () {
        // verify existing imbalance values for tokens;
        let tokenInfo;

        //get info for token 0
        tokenInfo = await convRatesInst.getTokenControlInfo(tokens[0]);

        //verify set values before updating
        assert.equal(tokenInfo[0].valueOf(), minimalRecordResolution);
        assert.equal(tokenInfo[1].valueOf(), maxPerBlockImbalance);
        assert.equal(tokenInfo[2].valueOf(), maxTotalImbalance);

        //prepare new values for tokens
        let maxPerBlockList = [maxPerBlockImbWrap, maxTotalImbWrap];
        let maxTotalList = [maxTotalImbWrap, maxTotalImbWrap];

        await wrapConvRateInst.setTokenInfoData(tokens, maxPerBlockList, maxTotalList, {from: operator1});
        tokenInfoNonce++;

        //verify token info before setting
        let tokenInfoPending = await wrapConvRateInst.getTokenInfoData();
        assert.equal(tokenInfoPending[0].valueOf(), tokenInfoNonce);
        assert.equal(tokenInfoPending[1].valueOf(), tokens.length);
        assert.deepEqual(tokenInfoPending[2].valueOf(), tokens);
        assert.equal(tokenInfoPending[3].valueOf()[0], maxPerBlockList[0]);
        assert.equal(tokenInfoPending[3].valueOf()[1], maxPerBlockList[1]);
        assert.equal(tokenInfoPending[4].valueOf()[0], maxTotalList[0]);
        assert.equal(tokenInfoPending[4].valueOf()[1], maxTotalList[1]);

        let rxNonce = await wrapConvRateInst.getTokenInfoNonce();
        let nonce = rxNonce.valueOf();
        assert.equal(nonce, tokenInfoNonce);

        //approve
        await wrapConvRateInst.approveTokenControlInfo(nonce, {from: operator1});
        await wrapConvRateInst.approveTokenControlInfo(nonce, {from: operator2});
        await wrapConvRateInst.approveTokenControlInfo(nonce, {from: operator3});

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
        await wrapConvRateInst.claimWrappedContractAdmin({from: operator1});

        ratesAdmin = await convRatesInst.admin();
        assert.equal(wrapConvRateInst.address, ratesAdmin.valueOf());
    });

    it("should test set data in middle of approve signatures.", async function () {
        //new token
        token = await TestToken.new("test9", "tst9", 18);

        //prepare add token data
        let minResolution = 6;
        let maxPerBlock = 200;
        let maxTotal = 400;

        await wrapConvRateInst.setAddTokenData(token.address, minResolution, maxPerBlock, maxTotal, {from: operator1});
        addTokenNonce++;

        let addData = await wrapConvRateInst.getAddTokenData();
        assert.equal(addData[0].valueOf(), addTokenNonce);
        assert.equal(addData[1].valueOf(), token.address);
        assert.equal(addData[2].valueOf(), minResolution);
        assert.equal(addData[3].valueOf(), maxPerBlock);
        assert.equal(addData[4].valueOf(), maxTotal);

        //verify tracking data
        await wrapConvRateInst.approveAddTokenData(addTokenNonce, {from:operator1});
        await wrapConvRateInst.approveAddTokenData(addTokenNonce, {from:operator2});

        let rxSignatures = await wrapConvRateInst.getAddTokenSignatures();
        assert.equal(rxSignatures[0], operator1);
        assert.equal(rxSignatures[1], operator2);

        //add token again.
        await wrapConvRateInst.setAddTokenData(token.address, minResolution, maxPerBlock, maxTotal, {from: operator1});
        addTokenNonce++;

        //check updated track data
        addData = await wrapConvRateInst.getAddTokenData();
        rxNonce = addData[0].valueOf();
        rxSignatures = await wrapConvRateInst.getAddTokenSignatures();
        assert.equal(rxNonce.valueOf(), addTokenNonce);
        assert.equal(rxSignatures.length, 0);

        await wrapConvRateInst.approveAddTokenData(addTokenNonce, {from:operator1});
        await wrapConvRateInst.approveAddTokenData(addTokenNonce, {from:operator2});
        await wrapConvRateInst.approveAddTokenData(addTokenNonce, {from:operator3});

        let tokenInfo = await convRatesInst.getTokenControlInfo(token.address);

        assert.equal(tokenInfo[0].valueOf(), minResolution);
        assert.equal(tokenInfo[1].valueOf(), maxPerBlock);
        assert.equal(tokenInfo[2].valueOf(), maxTotal);
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
        await wrapConvRateInst.claimWrappedContractAdmin({from: operator1});

        ratesAdmin = await convRatesInst.admin();
        assert.equal(wrapConvRateInst.address, ratesAdmin.valueOf());
    });

    it("should test only operator can call set and approve function.", async function() {
        //add token data
        try {
            await wrapConvRateInst.setAddTokenData(accounts[9], minimalRecordResolution, maxPerBlockImbalance, maxTotalImbalance, {from: admin});
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await wrapConvRateInst.approveAddTokenData(addTokenNonce, {from:operator1});
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //token info data
        let maxPerBlockList = [maxPerBlockImbWrap, maxTotalImbWrap];
        let maxTotalList = [maxTotalImbWrap, maxTotalImbWrap];

        try {
            await wrapConvRateInst.setTokenInfoData(tokens, maxPerBlockList, maxTotalList, {from: admin});
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await wrapConvRateInst.approveTokenControlInfo(tokenInfoNonce, {from:admin});
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //valid duration
        try {
            await wrapConvRateInst.setValidDurationData(validDurationNonce, {from:admin});
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await wrapConvRateInst.approveValidDurationData(validDurationNonce, {from:admin});
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
            await wrapConvRateInst.setAddTokenData(0, minResolution, maxPerBlock, maxTotal, {from: operator1});
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await wrapConvRateInst.setAddTokenData(token.address, 0, maxPerBlock, maxTotal, {from: operator1});
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await wrapConvRateInst.setAddTokenData(token.address, minResolution, 0, maxTotal, {from: operator1});
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await wrapConvRateInst.setAddTokenData(token.address, minResolution, maxPerBlock, 0, {from: operator1});
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        await wrapConvRateInst.setAddTokenData(token.address, minResolution, maxPerBlock, maxTotal, {from: operator1});
        addTokenNonce++;
    });

    it("test can't set token info data with arrays that have different length.", async function() {
        let maxPerBlockList = [maxPerBlockImbWrap];
        let maxTotalList = [maxTotalImbWrap, maxTotalImbWrap];

        try {
            await wrapConvRateInst.setTokenInfoData(tokens, maxPerBlockList, maxTotalList, {from: operator1});
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }


        maxPerBlockList = [maxPerBlockImbWrap, maxPerBlockImbWrap];
        maxTotalList = [maxTotalImbWrap];
        try {
            await wrapConvRateInst.setTokenInfoData(tokens, maxPerBlockList, maxTotalList, {from: operator1});
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        maxPerBlockList = [maxPerBlockImbWrap, maxPerBlockImbWrap, maxPerBlockImbWrap];
        maxTotalList = [maxTotalImbWrap, maxTotalImbWrap, maxTotalImbWrap];
        try {
            await wrapConvRateInst.setTokenInfoData(tokens, maxPerBlockList, maxTotalList, {from: operator1});
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        maxPerBlockList = [maxPerBlockImbWrap, maxPerBlockImbWrap];
        maxTotalList = [maxTotalImbWrap, maxTotalImbWrap];

        await wrapConvRateInst.setTokenInfoData(tokens, maxPerBlockList, maxTotalList, {from: operator1});
        tokenInfoNonce++;
    });

    it("should test each operator can approve only once per new data that was set.", async function() {
         //prepare new values for tokens
        let maxPerBlockList = [maxPerBlockImbWrap, maxTotalImbWrap];
        let maxTotalList = [maxTotalImbWrap, maxTotalImbWrap];

        await wrapConvRateInst.setTokenInfoData(tokens, maxPerBlockList, maxTotalList, {from: operator1});
        tokenInfoNonce++;

        //approve
        await wrapConvRateInst.approveTokenControlInfo(tokenInfoNonce, {from: operator1});
        try {
            await wrapConvRateInst.approveTokenControlInfo(tokenInfoNonce, {from: operator1});
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //new token
        token = await TestToken.new("test9", "tst9", 18);

        //prepare add token data
        let minResolution = 6;
        let maxPerBlock = 200;
        let maxTotal = 400;

        await wrapConvRateInst.setAddTokenData(token.address, minResolution, maxPerBlock, maxTotal, {from: operator1});
        addTokenNonce++;

        //approve
        await wrapConvRateInst.approveAddTokenData(addTokenNonce, {from:operator1});
        try {
            await wrapConvRateInst.approveAddTokenData(addTokenNonce, {from:operator1});
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("tests when all approve and data sent. additional approve with no new data will revert.", async function() {
        //new token
        token = await TestToken.new("test9", "tst9", 18);

        //prepare add token data
        let minResolution = 10;
        let maxPerBlock = 300;
        let maxTotal = 600;

        await wrapConvRateInst.setAddTokenData(token.address, minResolution, maxPerBlock, maxTotal, {from: operator1});
        addTokenNonce++;

        //approve
        await wrapConvRateInst.approveAddTokenData(addTokenNonce, {from:operator1});
        await wrapConvRateInst.approveAddTokenData(addTokenNonce, {from:operator2});
        await wrapConvRateInst.approveAddTokenData(addTokenNonce, {from:operator3});

        //see data was set.
        //get token info, see updated
        tokenInfo = await convRatesInst.getTokenControlInfo(token.address);

        //verify set values before updating
        assert.equal(tokenInfo[0].valueOf(), minResolution);
        assert.equal(tokenInfo[1].valueOf(), maxPerBlock);
        assert.equal(tokenInfo[2].valueOf(), maxTotal);

        try {
            await wrapConvRateInst.approveAddTokenData(addTokenNonce, {from:operator1});
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("tests API getControlInfoPerToken.", async function() {
        //legal index
        //prepare new values for tokens
        let maxPerBlockList = [maxPerBlockImbWrap, maxTotalImbWrap];
        let maxTotalList = [maxTotalImbWrap, maxTotalImbWrap];

        await wrapConvRateInst.setTokenInfoData(tokens, maxPerBlockList, maxTotalList, {from: operator1});
        tokenInfoNonce++;

        //verify token info
        let tokenInfo = await wrapConvRateInst.getControlInfoPerToken(0);

        assert.equal(tokenInfo[0].valueOf(), tokens[0]);
        assert.equal(tokenInfo[1].valueOf(), maxPerBlockList[0]);
        assert.equal(tokenInfo[2].valueOf(), maxTotalList[0]);
        assert.equal(tokenInfo[3].valueOf(), tokenInfoNonce);

        //verify token info
        tokenInfo = await wrapConvRateInst.getControlInfoPerToken(1);

        assert.equal(tokenInfo[0].valueOf(), tokens[1]);
        assert.equal(tokenInfo[1].valueOf(), maxPerBlockList[1]);
        assert.equal(tokenInfo[2].valueOf(), maxTotalList[1]);
        assert.equal(tokenInfo[3].valueOf(), tokenInfoNonce);

        //try illegal index
        try {
            tokenInfo = await wrapConvRateInst.getControlInfoPerToken(2);
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("validate signatures for token control info.", async function() {
        //legal index
        //prepare new values for tokens
        let maxPerBlockList = [maxPerBlockImbWrap, maxTotalImbWrap];
        let maxTotalList = [maxTotalImbWrap, maxTotalImbWrap];

        await wrapConvRateInst.setTokenInfoData(tokens, maxPerBlockList, maxTotalList, {from: operator1});
        tokenInfoNonce++;

        let numTokensSetInfo = await wrapConvRateInst.getTokenInfoNumToknes();
        assert.equal(numTokensSetInfo.valueOf(), 2);

        let rxSignatures = await wrapConvRateInst.getTokenInfoSignatures();
        assert.equal(rxSignatures.length, 0);

//        verify tracking data
        await wrapConvRateInst.approveTokenControlInfo(tokenInfoNonce, {from:operator1});
        await wrapConvRateInst.approveTokenControlInfo(tokenInfoNonce, {from:operator2});

        rxSignatures = await wrapConvRateInst.getAddTokenSignatures();
        assert.equal(rxSignatures[0], operator1);
        assert.equal(rxSignatures[1], operator2);
    });

    it("validate signatures for valid block duration.", async function() {
        await wrapConvRateInst.setValidDurationData(20, {from: operator1});
        validDurationNonce++;

        let rxSignatures = await wrapConvRateInst.getValidDurationSignatures();
        assert.equal(rxSignatures.length, 0);

        //verify tracking data
        await wrapConvRateInst.approveValidDurationData(validDurationNonce, {from:operator1});
        await wrapConvRateInst.approveValidDurationData(validDurationNonce, {from:operator2});

        rxSignatures = await wrapConvRateInst.getValidDurationSignatures();
        assert.equal(rxSignatures[0], operator1);
        assert.equal(rxSignatures[1], operator2);

        //set invalid duration and see signatures remained.
        //try illegal index
        try {
            await wrapConvRateInst.setValidDurationData(4, {from: operator1});
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
        rxSignatures = await wrapConvRateInst.getValidDurationSignatures();
        assert.equal(rxSignatures.length, 2);
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