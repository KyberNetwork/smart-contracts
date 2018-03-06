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
let validRateDurationInBlocks = 1000;

let convRatesInst;
let wrapConvRateInst;

let addTokenNonce = 0;
let tokenInfoNonce = 0;

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
        await convRatesInst.addOperator(wrapConvRateInst.address);

        //transfer admin to wrapper
        await convRatesInst.transferAdmin(wrapConvRateInst.address);
        await wrapConvRateInst.claimWrappedContractAdmin();
    });

    it("should test add token using wrapper. and verify data with get data", async function () {
        //new token
        token = await TestToken.new("test6", "tst6", 18);
        //prepare add token data

        await wrapConvRateInst.setAddTokenData(token.address, minRecordResWrap, maxPerBlockImbWrap, maxTotalImbWrap, {from: operator1});
        addTokenNonce++;

        let addData = await wrapConvRateInst.getAddTokenParameters();
        assert.equal(addData[0].valueOf(), token.address);
        assert.equal(addData[1].valueOf(), minRecordResWrap);
        assert.equal(addData[2].valueOf(), maxPerBlockImbWrap);
        assert.equal(addData[3].valueOf(), maxTotalImbWrap);


        let rxNonce = await wrapConvRateInst.getAddTokenNonce();
        let nonce = rxNonce.valueOf();

        await wrapConvRateInst.approveAddTokenData(nonce, {from:operator1});
        await wrapConvRateInst.approveAddTokenData(nonce, {from:operator2});
        await wrapConvRateInst.approveAddTokenData(nonce, {from:operator3});

        let tokenInfo = await convRatesInst.getTokenControlInfo(token.address);

        assert.equal(tokenInfo[0].valueOf(), minRecordResWrap);
        assert.equal(tokenInfo[1].valueOf(), maxPerBlockImbWrap);
        assert.equal(tokenInfo[2].valueOf(), maxTotalImbWrap);
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
        assert.deepEqual(tokenInfoPending[0].valueOf(), tokens);
        assert.equal(tokenInfoPending[1].valueOf()[0], maxPerBlockList[0]);
        assert.equal(tokenInfoPending[1].valueOf()[1], maxPerBlockList[1]);
        assert.equal(tokenInfoPending[2].valueOf()[0], maxTotalList[0]);
        assert.equal(tokenInfoPending[2].valueOf()[1], maxTotalList[1]);

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
        await wrapConvRateInst.claimWrappedContractAdmin();

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

        let addData = await wrapConvRateInst.getAddTokenParameters();
        assert.equal(addData[0].valueOf(), token.address);
        assert.equal(addData[1].valueOf(), minResolution);
        assert.equal(addData[2].valueOf(), maxPerBlock);
        assert.equal(addData[3].valueOf(), maxTotal);

        //verify tracking data
        await wrapConvRateInst.approveAddTokenData(addTokenNonce, {from:operator1});
        await wrapConvRateInst.approveAddTokenData(addTokenNonce, {from:operator2});

        let rxNonce = await wrapConvRateInst.getAddTokenNonce();
        let rxSignatures = await wrapConvRateInst.getAddTokenSignatures();
        assert.equal(rxNonce.valueOf(), addTokenNonce);
        assert.equal(rxSignatures[0], operator1);
        assert.equal(rxSignatures[1], operator2);

        //add token again.
        await wrapConvRateInst.setAddTokenData(token.address, minResolution, maxPerBlock, maxTotal, {from: operator1});
        addTokenNonce++;

        //check updated track data
        rxNonce = await wrapConvRateInst.getAddTokenNonce();
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


    it("should test add and fetch admin.", async function() {
        let ratesAdmin = await convRatesInst.admin();
        assert.equal(wrapConvRateInst.address, ratesAdmin.valueOf());


        await wrapConvRateInst.transferWrappedContractAdmin(admin);
        await convRatesInst.claimAdmin({from: admin});

        ratesAdmin = await convRatesInst.admin();
        assert.equal(admin, ratesAdmin.valueOf());

        //transfer admin to wrapper
        await convRatesInst.transferAdmin(wrapConvRateInst.address);
        await wrapConvRateInst.claimWrappedContractAdmin();

        ratesAdmin = await convRatesInst.admin();
        assert.equal(wrapConvRateInst.address, ratesAdmin.valueOf());
    });

    it("should test only operator can call set and approve function.", async function() {
        try {
            await wrapConvRateInst.setAddTokenData(accounts[9], minimalRecordResolution, maxPerBlockImbalance, maxTotalImbalance, {from: admin});
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        let maxPerBlockList = [maxPerBlockImbWrap, maxTotalImbWrap];
        let maxTotalList = [maxTotalImbWrap, maxTotalImbWrap];

        try {
            await wrapConvRateInst.setTokenInfoData(tokens, maxPerBlockList, maxTotalList, {from: admin});
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        let rxNonce = await wrapConvRateInst.getAddTokenNonce();

        try {
            await wrapConvRateInst.approveAddTokenData(rxNonce, {from:operator1});
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        rxNonce = await wrapConvRateInst.getTokenInfoNonce();

        try {
            await wrapConvRateInst.approveAddTokenData(rxNonce, {from:admin});
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
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
});