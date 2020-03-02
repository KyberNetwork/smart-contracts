const ConversionRates = artifacts.require("MockConversionRate.sol");
const TestToken = artifacts.require("TestToken.sol");
const Wrapper = artifacts.require("./mockContracts/Wrapper.sol");

const Helper = require("../helper.js");
const BN = web3.utils.BN;

//global variables
let precisionUnits = new BN(10).pow(new BN(18));
let token;
let minimalRecordResolution = 2; //low resolution so I don't lose too much data. then easier to compare calculated imbalance values.
let maxPerBlockImbalance = 4000;
let maxTotalImbalance = maxPerBlockImbalance * 12;
let admin;
let alerter;
let rateUpdateBlock;
let currentBlock = 3000;
let lastSetCompactBlock = currentBlock;
let wrapper;
let numTokens = 17;
let tokens = [];
let operator;
let reserveAddress;
let validRateDurationInBlocks = 1000;
let buys = [];
let sells = [];
let indices = [];
let baseBuy = [];
let baseSell = [];
let qtyBuyStepX = [];
let qtyBuyStepY = [];
let qtySellStepX = [];
let qtySellStepY = [];
let imbalanceBuyStepX = [];
let imbalanceBuyStepY = [];
let imbalanceSellStepX = [];
let imbalanceSellStepY = [];
let compactBuyArr1 = [];
let compactBuyArr2 = [];
let compactSellArr1 = [];
let compactSellArr2 = [];

// getStepFunctionData command IDs
const comID_BuyRateStpQtyXLength = 0;
const comID_BuyRateStpQtyParamX = 1;
const comID_BuyRateStpQtyYLength = 2;
const comID_BuyRateStpQtyParamY = 3;

const comID_SellRateStpQtyXLength = 4;
const comID_SellRateStpQtyParamX = 5;
const comID_SellRateStpQtyYLength = 6;
const comID_SellRateStpQtyParamY = 7;

const comID_BuyRateStpImbalanceXLength = 8;
const comID_BuyRateStpImbalanceParamX = 9;
const comID_BuyRateStpImbalanceYLength = 10;
const comID_BuyRateStpImbalanceParamY = 11;

const comID_SellRateStpImbalanceXLength = 12;
const comID_SellRateStpImbalanceParamX = 13;
const comID_SellRateStpImbalanceYLength = 14;
const comID_SellRateStpImbalanceParamY = 15;

let convRatesInst;

contract('ConversionRates', function(accounts) {
    it("should init globals", function() {
        admin = accounts[0];
        alerter = accounts[1];
        operator = accounts[2];
        reserveAddress = accounts[3];
    })
    it("should test bytes14.", async function () {
        let arr = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
        let hexArr = Helper.bytesToHex(arr);
        let byte;

        wrapper = await Wrapper.new();

        for (let i = 0; i < 14; i++) {
            byte = await wrapper.getInt8FromByte(hexArr, i);
            Helper.assertEqual(byte, arr[i], "bad bytes 14. index: " + i);
        }
    });

    it("should init ConversionRates Inst and set general parameters.", async function () {
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

        await convRatesInst.addOperator(operator);
        await convRatesInst.setReserveAddress(reserveAddress);
        await convRatesInst.addAlerter(alerter);
    });

    it("should set base rates for all tokens then get and verify.", async function () {
        // set base rate

        //buy is ether to token rate. sale is token to ether rate. so sell == 1 / buy. assuming we have no spread.
        let ethToTokenRate;
        let tokenToEthRate;

        for (i = 0; i < numTokens; ++i) {
            ethToTokenRate = convertRateToPricingRate((i + 1) * 10);
            tokenToEthRate = (new BN(10).pow(new BN(18))).div(new BN((i + 1) * 10));
            baseBuy.push(ethToTokenRate);
            baseSell.push(tokenToEthRate);
        }

        assert.deepEqual(baseBuy.length, tokens.length);
        assert.deepEqual(baseSell.length, tokens.length);

        buys.length = sells.length = indices.length = 0;

        await convRatesInst.setBaseRate(tokens, baseBuy, baseSell, buys, sells, currentBlock, indices, {from: operator});

        //get base rate - validate data
        let thisSell;
        let thisBuy;
        for (i = 0; i < numTokens; ++i) {
            thisBuy = await convRatesInst.getBasicRate(tokens[i], true);
            thisSell = await convRatesInst.getBasicRate(tokens[i], false);
            Helper.assertEqual(thisBuy, baseBuy[i], "wrong base buy rate");
            Helper.assertEqual(thisSell, baseSell[i], "wrong base sell rate");
        }
    });

    it("should set compact data all tokens then get and verify.", async function () {
        //set compact data
        compactBuyArr1 = [1, 2, 03, 04, 05, 06, 07, 08, 09, 10, 11, 12, 13, 14];
        compactBuyArr2 = [15, 16, 17, 04, 05, 06, 07, 08, 09, 10, 11, 12, 13, 14];
        let compactBuyHex = Helper.bytesToHex(compactBuyArr1);
        buys.push(compactBuyHex);
        compactBuyHex = Helper.bytesToHex(compactBuyArr2);
        buys.push(compactBuyHex);

        compactSellArr1 = [21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34];
        compactSellArr2 = [35, 36, 37, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34];
        let compactSellHex = Helper.bytesToHex(compactSellArr1);
        sells.push(compactSellHex);
        compactSellHex = Helper.bytesToHex(compactSellArr2);
        sells.push(compactSellHex);

        indices[0] = 0;
        indices[1] = 1;

        assert.deepEqual(indices.length, sells.length, "bad array size");
        assert.deepEqual(indices.length, buys.length, "bad array size");

        await convRatesInst.setCompactData(buys, sells, currentBlock, indices, {from: operator});
        lastSetCompactBlock = currentBlock;

        //get compact data for all tokens and verify as expected
        for (i = 0; i < numTokens; ++i) {
            let arrIndex = Math.floor (i / 14);
            let fieldIndex = i % 14;
            let compactResArr = await convRatesInst.getCompactData(tokens[i]);
            let compactBuy;
            let compactSell;

            assert.equal(compactResArr[0], arrIndex, "wrong array " + i);
            assert.equal(compactResArr[1], fieldIndex, "wrong field index " + i);
            if (arrIndex == 0) {
                compactBuy = compactBuyArr1;
                compactSell = compactSellArr1;
            }
            else
            {
                compactBuy = compactBuyArr2;
                compactSell = compactSellArr2;
            }
            assert.equal(compactResArr[2], compactBuy[fieldIndex], "wrong buy: " + i);
            assert.equal(compactResArr[3], compactSell[fieldIndex], "wrong sell: " + i);
        }

        //get block number from compact data and verify
        let blockNum = await convRatesInst.getRateUpdateBlock(tokens[3]);

        Helper.assertEqual(blockNum, currentBlock, "bad block number returned");

        blockNum = await convRatesInst.getRateUpdateBlock(tokens[11]);

        Helper.assertEqual(blockNum, currentBlock, "bad block number returned");
    });


    it("should verify setCompactData reverted when block number out of range.", async function () {
        let block = 0xffffffff1; //block number limited to size of int

        try {
            await convRatesInst.setCompactData(buys, sells, block, indices, {from: operator});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //see success on legal block
        let legalBlock = 0xffffffff - 1;
        await convRatesInst.setCompactData(buys, sells, legalBlock, indices, {from: operator});
        await convRatesInst.setCompactData(buys, sells, currentBlock, indices, {from: operator});
    });


    it("should set step functions qty and imbalance.", async function () {
        qtyBuyStepX = [15, 30, 70];
        qtyBuyStepY = [8, 30, 70];
        qtySellStepX = [155, 305, 705];
        qtySellStepY = [10, 32, 78];
        imbalanceBuyStepX = [180, 330, 900, 1500];
        imbalanceBuyStepY = [35, 150, 310, 1100];
        imbalanceSellStepX = [1500, 3000, 7000, 30000];
        imbalanceSellStepY = [45, 190, 360, 1800];

        for (let i = 0; i < numTokens; ++i) {
            await convRatesInst.setQtyStepFunction(tokens[i], qtyBuyStepX, qtyBuyStepY, qtySellStepX, qtySellStepY, {from:operator});
            await convRatesInst.setImbalanceStepFunction(tokens[i], imbalanceBuyStepX, imbalanceBuyStepY, imbalanceSellStepX, imbalanceSellStepY, {from:operator});
        }
    });

    it("should get qty buy step function and verify numbers.", async function () {
        tokenId = 1; //

        // x axis
        let received = await convRatesInst.getStepFunctionData(tokens[tokenId], comID_BuyRateStpQtyXLength, 0); //get length
        Helper.assertEqual(received, qtyBuyStepX.length, "length don't match");

        // now y axis
        received = await convRatesInst.getStepFunctionData(tokens[tokenId], comID_BuyRateStpQtyYLength, 0); //get length
        Helper.assertEqual(received, qtyBuyStepX.length, "length don't match");

        //iterate x and y values and compare
        for (let i = 0; i < qtyBuyStepX.length; ++i) {
            received = await convRatesInst.getStepFunctionData(tokens[tokenId], comID_BuyRateStpQtyParamX, i); //get x value in cell i
            Helper.assertEqual(received, qtyBuyStepX[i], "mismatch for x value in cell: " + i);
            received = await convRatesInst.getStepFunctionData(tokens[tokenId], comID_BuyRateStpQtyParamY, i); //get x value in cell i
            Helper.assertEqual(received, qtyBuyStepY[i], "mismatch for y value in cell: " + i);
        }
    });


    it("should get qty sell step function and verify numbers.", async function () {
        tokenId = 3; //

        // x axis
        let received = await convRatesInst.getStepFunctionData(tokens[tokenId], comID_SellRateStpQtyXLength, 0); //get length
        Helper.assertEqual(received, qtySellStepX.length, "length don't match");

        // now y axis
        received = await convRatesInst.getStepFunctionData(tokens[tokenId], comID_SellRateStpQtyYLength, 0); //get length
        Helper.assertEqual(received, qtySellStepX.length, "length don't match");

        //iterate x and y values and compare
        for (let i = 0; i < qtySellStepX.length; ++i) {
            received = await convRatesInst.getStepFunctionData(tokens[tokenId], comID_SellRateStpQtyParamX, i); //get x value in cell i
            Helper.assertEqual(received, qtySellStepX[i], "mismatch for x value in cell: " + i);
            received = await convRatesInst.getStepFunctionData(tokens[tokenId], comID_SellRateStpQtyParamY, i); //get x value in cell i
            Helper.assertEqual(received, qtySellStepY[i], "mismatch for y value in cell: " + i);
        }
    });

    it("should get imbalance buy step function and verify numbers.", async function () {
        tokenId = 1; //

        // x axis
        let received = await convRatesInst.getStepFunctionData(tokens[tokenId], comID_BuyRateStpImbalanceXLength, 0); //get length
        Helper.assertEqual(received, imbalanceBuyStepX.length, "length don't match");

        // now y axis
        received = await convRatesInst.getStepFunctionData(tokens[tokenId], comID_BuyRateStpImbalanceYLength, 0); //get length
        Helper.assertEqual(received, imbalanceBuyStepX.length, "length don't match");

        //iterate x and y values and compare
        for (let i = 0; i < imbalanceBuyStepX.length; ++i) {
            received = await convRatesInst.getStepFunctionData(tokens[tokenId], comID_BuyRateStpImbalanceParamX, i); //get x value in cell i
            Helper.assertEqual(received, imbalanceBuyStepX[i], "mismatch for x value in cell: " + i);
            received = await convRatesInst.getStepFunctionData(tokens[tokenId], comID_BuyRateStpImbalanceParamY, i); //get x value in cell i
            Helper.assertEqual(received, imbalanceBuyStepY[i], "mismatch for y value in cell: " + i);
        }
    });

    it("should get imbalance sell step function and verify numbers.", async function () {
        tokenId = 3; //

        // x axis
        let received = await convRatesInst.getStepFunctionData(tokens[tokenId], comID_SellRateStpImbalanceXLength, 0); //get length
        Helper.assertEqual(received, imbalanceSellStepX.length, "length don't match");

        // now y axis
        received = await convRatesInst.getStepFunctionData(tokens[tokenId], comID_SellRateStpImbalanceYLength, 0); //get length
        Helper.assertEqual(received, imbalanceSellStepX.length, "length don't match");

        //iterate x and y values and compare
        for (let i = 0; i < imbalanceSellStepX.length; ++i) {
            received = await convRatesInst.getStepFunctionData(tokens[tokenId], comID_SellRateStpImbalanceParamX, i); //get x value in cell i
            Helper.assertEqual(received, imbalanceSellStepX[i], "mismatch for x value in cell: " + i);
            received = await convRatesInst.getStepFunctionData(tokens[tokenId], comID_SellRateStpImbalanceParamY, i); //get x value in cell i
            Helper.assertEqual(received, imbalanceSellStepY[i], "mismatch for x value in cell: " + i);
        }
    });

    it("should get set function data reverts with illegal command ID.", async function () {
        tokenId = 1; //

        try {
            let received = await convRatesInst.getStepFunctionData(tokens[tokenId], 19, 0); //get length
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });


    it("should get and verify listed tokens.", async function () {
        let rxTokens = await convRatesInst.getListedTokens();
        Helper.assertEqual(rxTokens.length, tokens.length, "length don't match");

        for (let i = 0; i < tokens.length; i++){
            Helper.assertEqual(rxTokens[i], tokens[i], "address don't match");
        }
    });


    it("should test get token basic data works properly.", async function () {
        token = await TestToken.new("testt", "tst", 18);
        //see token not listed
        let basicData = await convRatesInst.getTokenBasicData(token.address);
        assert.equal(basicData[0], false, "token should not be listed");

        //add token and see listed
        await convRatesInst.addToken(token.address);
        basicData = await convRatesInst.getTokenBasicData(token.address);
        assert.equal(basicData[0], true, "token should  be listed");

        //see not enabled
        assert.equal(basicData[1], false, "token should not be enabled");

        //enable token and see enabled
        await convRatesInst.setTokenControlInfo(token.address, minimalRecordResolution, maxPerBlockImbalance, maxTotalImbalance);
        await convRatesInst.enableTokenTrade(token.address);
        basicData = await convRatesInst.getTokenBasicData(token.address);
        assert.equal(basicData[1], true, "token should be enabled");
    });

    it("should get buy rate with update according to compact data update.", async function () {
        let tokenInd = 7;
        let token = tokens[tokenInd]; //choose some token
        let baseBuyRate = await convRatesInst.getBasicRate(token, true);

        // get rate without activating quantity step function (small amount).
        let srcQty = 2;
        let expectedRate = (new BN(baseBuyRate));
        let extraBps = compactBuyArr1[tokenInd] * 10;
        expectedRate = Helper.addBps(expectedRate, extraBps);
        let dstQty = new BN(srcQty).mul(expectedRate).div(precisionUnits);
        extraBps = getExtraBpsForBuyQuantity(dstQty);
        expectedRate = Helper.addBps(expectedRate, extraBps);
        extraBps = getExtraBpsForImbalanceBuyQuantity(dstQty);
        expectedRate = Helper.addBps(expectedRate, extraBps);

        let receivedRate = await convRatesInst.getRate(token, currentBlock, true, srcQty);

        Helper.assertEqual(receivedRate, expectedRate, "bad rate");
    });


    it("should get buy rate when compact data has boundary values (-128, 127).", async function () {
        let tokenInd = 7;
        let token = tokens[tokenInd]; //choose some token
        let baseBuyRate = await convRatesInst.getBasicRate(token, true);

        //update compact data
        indices.length = 0;
        indices[0] = 0; // we update 1st cell in compact data
        compactBuyArr1[tokenInd] = -128;
        let compactHex = Helper.bytesToHex(compactBuyArr1);
        buys.length = 0;
        buys.push(compactHex);
        sells.length = 0;
        compactHex = Helper.bytesToHex(compactSellArr1);
        sells.push(compactHex);
        await convRatesInst.setCompactData(buys, sells, currentBlock, indices, {from: operator});
        lastSetCompactBlock = currentBlock;

        // get rate with the updated compact data.
        let srcQty = 5;
        let expectedRate = (new BN(baseBuyRate));
        let extraBps = compactBuyArr1[tokenInd] * 10;
        expectedRate = Helper.addBps(expectedRate, extraBps);
        let dstQty = new BN(srcQty).mul(expectedRate).div(precisionUnits);
        extraBps = getExtraBpsForBuyQuantity(dstQty);
        expectedRate = Helper.addBps(expectedRate, extraBps);
        extraBps = getExtraBpsForImbalanceBuyQuantity(dstQty);
        expectedRate = Helper.addBps(expectedRate, extraBps);


        let receivedRate = await convRatesInst.getRate(token, currentBlock, true, srcQty);

        assert(receivedRate.should.be.a.bignumber.that.equals(expectedRate), "bad rate");

        //update compact data
        compactBuyArr1[tokenInd] = 127;
        compactHex = Helper.bytesToHex(compactBuyArr1);
        buys.length = 0;
        buys.push(compactHex);
        await convRatesInst.setCompactData(buys, sells, currentBlock, indices, {from: operator});
        lastSetCompactBlock = currentBlock;

        // get rate without activating quantity step function (small amount).
        srcQty = 11;
        expectedRate = (new BN(baseBuyRate));
        extraBps = compactBuyArr1[tokenInd] * 10;
        expectedRate = Helper.addBps(expectedRate, extraBps);
        dstQty = new BN(srcQty).mul(expectedRate).div(precisionUnits);
        extraBps = getExtraBpsForBuyQuantity(dstQty);
        expectedRate = Helper.addBps(expectedRate, extraBps);
        extraBps = getExtraBpsForImbalanceBuyQuantity(dstQty);
        expectedRate = Helper.addBps(expectedRate, extraBps);

        receivedRate = await convRatesInst.getRate(token, currentBlock, true, srcQty);

        Helper.assertEqual(receivedRate, expectedRate, "bad rate");
    });


    it("should get buy rate when updating only 2nd cell compact data.", async function () {
        let tokenInd = 16;
        let token = tokens[tokenInd]; //choose some token
        let baseBuyRate = await convRatesInst.getBasicRate(token, true);

        //update compact data
        indices.length = 0;
        indices[0] = 1; // we update 2nd cell in compact data
        compactBuyArr2[tokenInd - 14] = -128;
        let compactHex = Helper.bytesToHex(compactBuyArr2);
        buys.length = 0;
        buys.push(compactHex);
        sells.length = 0;
        compactHex = Helper.bytesToHex(compactSellArr2);
        sells.push(compactHex);
        await convRatesInst.setCompactData(buys, sells, currentBlock, indices, {from: operator});
        lastSetCompactBlock = currentBlock;

        // get rate without activating quantity step function (small amount).

        // calculate expected rate
        let srcQty = 21;
        let expectedRate = (new BN(baseBuyRate));
        let extraBps = compactBuyArr2[tokenInd - 14] * 10;
        expectedRate = Helper.addBps(expectedRate, extraBps);
        let dstQty = new BN(srcQty).mul(expectedRate).div(precisionUnits);
        extraBps = getExtraBpsForBuyQuantity(dstQty);
        expectedRate = Helper.addBps(expectedRate, extraBps);
        extraBps = getExtraBpsForImbalanceBuyQuantity(dstQty);
        expectedRate = Helper.addBps(expectedRate, extraBps);

        let receivedRate = await convRatesInst.getRate(token, currentBlock, true, srcQty);

        Helper.assertEqual(receivedRate, expectedRate, "bad rate");
    });

    it("should get buy rate with compact data and quantity step.", async function () {
        let tokenInd = 11;
        let token = tokens[tokenInd]; //choose some token
        let baseBuyRate = await convRatesInst.getBasicRate(token, true);

        // calculate expected rate
        let srcQty = 17;
        let expectedRate = (new BN(baseBuyRate));
        let extraBps = compactBuyArr1[tokenInd] * 10;
        expectedRate = Helper.addBps(expectedRate, extraBps);
        let dstQty = new BN(srcQty).mul(expectedRate).div(precisionUnits);
        extraBps = getExtraBpsForBuyQuantity(dstQty);
        expectedRate = Helper.addBps(expectedRate, extraBps);
        extraBps = getExtraBpsForImbalanceBuyQuantity(dstQty);
        expectedRate = Helper.addBps(expectedRate, extraBps);

        let receivedRate = await convRatesInst.getRate(token, currentBlock, true, srcQty);

        Helper.assertEqual(receivedRate, expectedRate, "bad rate");
    });

    it("should get buy rate quantity step and compact data update with token index > 14.", async function () {
        let tokenInd = 15;
        let token = tokens[tokenInd]; //choose some token
        let baseBuyRate = await convRatesInst.getBasicRate(token, true);

        // get rate
        let srcQty = 24;
        let expectedRate = (new BN(baseBuyRate));
        let extraBps = compactBuyArr2[tokenInd - 14] * 10;
        expectedRate = Helper.addBps(expectedRate, extraBps);
        let dstQty = new BN(srcQty).mul(expectedRate).div(precisionUnits);
        extraBps = getExtraBpsForBuyQuantity(dstQty);
        expectedRate = Helper.addBps(expectedRate, extraBps);
        extraBps = getExtraBpsForImbalanceBuyQuantity(dstQty);
        expectedRate = Helper.addBps(expectedRate, extraBps);

        let receivedRate = await convRatesInst.getRate(token, currentBlock, true, srcQty);

        Helper.assertEqual(receivedRate, expectedRate, "bad rate");
    });

    it("should add imbalance. get buy rate with with compact data + quantity step + imbalance step.", async function () {
        let tokenInd = 8;
        let token = tokens[tokenInd]; //choose some token
        let baseBuyRate = await convRatesInst.getBasicRate(token, true);

        // get rate
        let buyQty = 15;
        let imbalance = 95;
        let expectedRate = (new BN(baseBuyRate));
        let extraBps = compactBuyArr1[tokenInd] * 10;
        expectedRate = Helper.addBps(expectedRate, extraBps);
        let dstQty = new BN(buyQty).mul(expectedRate).div(precisionUnits);
        //quantity bps
        extraBps = getExtraBpsForBuyQuantity(dstQty);
        expectedRate = Helper.addBps(expectedRate, extraBps);
        //imbalance bps
        extraBps = getExtraBpsForImbalanceBuyQuantity(imbalance + (dstQty * 1));
        expectedRate = Helper.addBps(expectedRate, extraBps);

        //record imbalance
        await convRatesInst.recordImbalance(token, imbalance, currentBlock, currentBlock, {from: reserveAddress});

        let receivedRate = await convRatesInst.getRate(token, currentBlock, true, buyQty);

        Helper.assertEqual(receivedRate, expectedRate, "bad rate");
    });

    it("should add imbalance and get sell rate with with compact data + quantity step + imbalance step.", async function () {
        let tokenInd = 16;
        let token = tokens[tokenInd]; //choose some token
        let baseSellRate = await convRatesInst.getBasicRate(token, false);
        let acceptedDiff = 1;

        // get rate
        let sellQty = 500;
        let imbalance = 1800;
        let expectedRate = (new BN(baseSellRate));
        //calc compact data
        let extraBps = compactSellArr2[tokenInd - 14] * 10;
        expectedRate = Helper.addBps(expectedRate, extraBps);
        //calc quantity steps
        extraBps = getExtraBpsForSellQuantity(sellQty);
        expectedRate = Helper.addBps(expectedRate, extraBps);
        //calc imbalance steps
        extraBps = getExtraBpsForImbalanceSellQuantity(imbalance - (sellQty * 1));
        expectedRate = Helper.addBps(expectedRate, extraBps);

        //record imbalance
        await convRatesInst.recordImbalance(token, imbalance, currentBlock, currentBlock, {from: reserveAddress});

        let receivedRate = await convRatesInst.getRate(token, currentBlock, false, sellQty);
        //round rates a bit

        Helper.assertEqual(receivedRate, expectedRate, "bad rate");
    });

    it("should verify addToken reverted when token already exists.", async function () {
        let tokenInd = 16;
        let token = tokens[tokenInd]; //choose some token

        try {
            await convRatesInst.addToken(token);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("should verify set compact data reverted when input arrays length don't match.", async function () {
        //set compact data
        sells.length = buys.length = indices.length = 0;

        compactBuyArr1 = [1, 2, 03, 04, 05, 06, 07, 08, 09, 10, 11, 12, 13, 14];
        compactBuyArr2 = [15, 16, 17, 04, 05, 06, 07, 08, 09, 10, 11, 12, 13, 14];
        let compactBuyHex = Helper.bytesToHex(compactBuyArr1);
        buys.push(compactBuyHex);
        compactBuyHex = Helper.bytesToHex(compactBuyArr2);
        buys.push(compactBuyHex);

        compactSellArr1 = [21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34];
        compactSellArr2 = [35, 36, 37, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34];
        let compactSellHex = Helper.bytesToHex(compactSellArr1);
        sells.push(compactSellHex);

        indices[0] = 0;
        indices[1] = 1;

        //compact sell arr smaller (1)
        try {
            await convRatesInst.setCompactData(buys, sells, currentBlock, indices, {from: operator});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //sells 2 buys 2. indices 3
        compactSellHex = Helper.bytesToHex(compactSellArr2);
        sells.push(compactSellHex);

        indices[2] = 5;

        try {
            await convRatesInst.setCompactData(buys, sells, currentBlock, indices, {from: operator});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //set indices to 2 and see success.
        indices.length = 2;
        await convRatesInst.setCompactData(buys, sells, currentBlock, indices, {from: operator});
        lastSetCompactBlock = currentBlock;
    });

    it("should verify set compact data reverted when input arrays length don't match num set tokens.", async function () {
        //set compact data
        sells[2] = buys[2] = Helper.bytesToHex([5]);
        indices[2] = 5;

        //length 3 but only two exist in contract
        try {
            await convRatesInst.setCompactData(buys, sells, currentBlock, indices, {from: operator});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        sells.length = buys.length = indices.length = 2;
        await convRatesInst.setCompactData(buys, sells, currentBlock, indices, {from: operator});
        lastSetCompactBlock = currentBlock;
    });

    it("should verify set base rate data reverted when input arrays length don't match each other.", async function () {
        //sells different length
        sells[2] = Helper.bytesToHex([5]);

        //length 3 for sells and buys. indices 2
        try {
            await convRatesInst.setBaseRate(tokens, baseBuy, baseSell, buys, sells, currentBlock, indices, {from: operator});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        sells.length = buys.length = indices.length = 2;
        await convRatesInst.setBaseRate(tokens, baseBuy, baseSell, buys, sells, currentBlock, indices, {from: operator});

        //buys different length
        buys[2] = Helper.bytesToHex([5]);

        //length 3 for sells and buys. indices 2
        try {
            await convRatesInst.setBaseRate(tokens, baseBuy, baseSell, buys, sells, currentBlock, indices, {from: operator});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        sells.length = buys.length = indices.length = 2;
        await convRatesInst.setBaseRate(tokens, baseBuy, baseSell, buys, sells, currentBlock, indices, {from: operator});

        //indices different length
        indices[2] = 5;

        //length 3 for sells and buys. indices 2
        try {
            await convRatesInst.setBaseRate(tokens, baseBuy, baseSell, buys, sells, currentBlock, indices, {from: operator});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        sells.length = buys.length = indices.length = 2;
        await convRatesInst.setBaseRate(tokens, baseBuy, baseSell, buys, sells, currentBlock, indices, {from: operator});

        //baseBuy different length
        baseBuy.push(Helper.bytesToHex([19]));

        //length 3 for sells and buys. indices 2
        try {
            await convRatesInst.setBaseRate(tokens, baseBuy, baseSell, buys, sells, currentBlock, indices, {from: operator});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        baseBuy.length = baseSell.length;
        await convRatesInst.setCompactData(buys, sells, currentBlock, indices, {from: operator});
        lastSetCompactBlock = currentBlock;

        //baseSell different length
        baseSell.push(Helper.bytesToHex([19]));

        //length 3 for sells and buys. indices 2
        try {
            await convRatesInst.setBaseRate(tokens, baseBuy, baseSell, buys, sells, currentBlock, indices, {from: operator});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        baseSell.length = baseBuy.length;
        await convRatesInst.setCompactData(buys, sells, currentBlock, indices, {from: operator});
        lastSetCompactBlock = currentBlock;
    });


    it("should verify set base rate data reverted when setting to unlisted token.", async function () {
        //sells different length
        let tokenAdd5 = tokens[5];
        let newToken = await TestToken.new("tst token", "tst", 18);
        tokens[5] = newToken.address;

        try {
            await convRatesInst.setBaseRate(tokens, baseBuy, baseSell, buys, sells, currentBlock, indices, {from: operator});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        tokens[5] = tokenAdd5;
        await convRatesInst.setBaseRate(tokens, baseBuy, baseSell, buys, sells, currentBlock, indices, {from: operator});
    });


    it("should verify set qty step reverted when input arrays lengths don't match.", async function () {
        //qty buy step x - change size. see set fails
        qtyBuyStepX.push(17);

        try {
            await convRatesInst.setQtyStepFunction(tokens[4], qtyBuyStepX, qtyBuyStepY, qtySellStepX, qtySellStepY, {from:operator});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //set size back and see set success
        qtyBuyStepX.length = qtyBuyStepY.length;
        await convRatesInst.setQtyStepFunction(tokens[4], qtyBuyStepX, qtyBuyStepY, qtySellStepX, qtySellStepY, {from:operator});

        //qty buy step x - change size. see set fails
        qtyBuyStepY.push(17);

        try {
            await convRatesInst.setQtyStepFunction(tokens[4], qtyBuyStepX, qtyBuyStepY, qtySellStepX, qtySellStepY, {from:operator});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //set size back and see set success
        qtyBuyStepY.length = qtyBuyStepX.length;
        await convRatesInst.setQtyStepFunction(tokens[4], qtyBuyStepX, qtyBuyStepY, qtySellStepX, qtySellStepY, {from:operator});

        //qty sell step x - change size. see set fails
        qtySellStepX.push(17);

        try {
            await convRatesInst.setQtyStepFunction(tokens[4], qtyBuyStepX, qtyBuyStepY, qtySellStepX, qtySellStepY, {from:operator});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //set size back and see set success
        qtySellStepX.length = qtySellStepY.length;
        await convRatesInst.setQtyStepFunction(tokens[4], qtyBuyStepX, qtyBuyStepY, qtySellStepX, qtySellStepY, {from:operator});

        //qty sell step y - change size. see set fails
        qtySellStepY.push(17);

        try {
            await convRatesInst.setQtyStepFunction(tokens[4], qtyBuyStepX, qtyBuyStepY, qtySellStepX, qtySellStepY, {from:operator});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //set size back and see set success
        qtySellStepY.length = qtySellStepX.length;
        await convRatesInst.setQtyStepFunction(tokens[4], qtyBuyStepX, qtyBuyStepY, qtySellStepX, qtySellStepY, {from:operator});
    });

    it("should verify set qty step reverted when token not listed.", async function () {
        let newToken = await TestToken.new("tst token", "tst", 18);
        try {
            await convRatesInst.setQtyStepFunction(newToken.address, qtyBuyStepX, qtyBuyStepY, qtySellStepX, qtySellStepY, {from:operator});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("should verify set imbalance step reverted when input arrays lengths don't match.", async function () {
        //imbalance buy step x - change size. see set fails
        imbalanceBuyStepX.push(17);

        try {
            await convRatesInst.setImbalanceStepFunction(tokens[4], imbalanceBuyStepX, imbalanceBuyStepY, imbalanceSellStepX, imbalanceSellStepY, {from:operator});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //set size back and see set success
        imbalanceBuyStepX.length = imbalanceBuyStepY.length;
        await convRatesInst.setImbalanceStepFunction(tokens[4], imbalanceBuyStepX, imbalanceBuyStepY, imbalanceSellStepX, imbalanceSellStepY, {from:operator});

        //imbalance buy step x - change size. see set fails
        imbalanceBuyStepY.push(17);

        try {
            await convRatesInst.setImbalanceStepFunction(tokens[4], imbalanceBuyStepX, imbalanceBuyStepY, imbalanceSellStepX, imbalanceSellStepY, {from:operator});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //set size back and see set success
        imbalanceBuyStepY.length = imbalanceBuyStepX.length;
        await convRatesInst.setImbalanceStepFunction(tokens[4], imbalanceBuyStepX, imbalanceBuyStepY, imbalanceSellStepX, imbalanceSellStepY, {from:operator});

        //imbalance sell step x - change size. see set fails
        imbalanceSellStepX.push(17);

        try {
            await convRatesInst.setImbalanceStepFunction(tokens[4], imbalanceBuyStepX, imbalanceBuyStepY, imbalanceSellStepX, imbalanceSellStepY, {from:operator});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //set size back and see set success
        imbalanceSellStepX.length = imbalanceSellStepY.length;
        await convRatesInst.setImbalanceStepFunction(tokens[4], imbalanceBuyStepX, imbalanceBuyStepY, imbalanceSellStepX, imbalanceSellStepY, {from:operator});

        //imbalance sell step y - change size. see set fails
        imbalanceSellStepY.push(17);

        try {
            await convRatesInst.setImbalanceStepFunction(tokens[4], imbalanceBuyStepX, imbalanceBuyStepY, imbalanceSellStepX, imbalanceSellStepY, {from:operator});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //set size back and see set success
        imbalanceSellStepY.length = imbalanceSellStepX.length;
        await convRatesInst.setImbalanceStepFunction(tokens[4], imbalanceBuyStepX, imbalanceBuyStepY, imbalanceSellStepX, imbalanceSellStepY, {from:operator});
    });

    it("should verify set qty step reverted when token not listed.", async function () {
        let newToken = await TestToken.new("tst token", "tst", 18);
        try {
            await convRatesInst.setImbalanceStepFunction(newToken.address, qtyBuyStepX, qtyBuyStepY, qtySellStepX, qtySellStepY, {from:operator});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("should verify enable token trade reverted if token not added(listed).", async function () {

        let someToken = await TestToken.new("testinggg", "ts11", 15);

        await convRatesInst.setTokenControlInfo(someToken.address, minimalRecordResolution, maxPerBlockImbalance, maxTotalImbalance);

        //try to enable token trade when not listed.
        try {
            await convRatesInst.enableTokenTrade(someToken.address);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //add token and see enable success
        await convRatesInst.addToken(someToken.address);
        await convRatesInst.enableTokenTrade(someToken.address);
    });

    it("should verify enable token trade reverted if token control info not set.", async function () {

        let someToken = await TestToken.new("testing", "tst9", 15);

        await convRatesInst.addToken(someToken.address);

        //try to enable token trade when not listed.
        try {
            await convRatesInst.enableTokenTrade(someToken.address);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //add token and see enable success
        await convRatesInst.setTokenControlInfo(someToken.address, minimalRecordResolution, maxPerBlockImbalance, maxTotalImbalance);
        await convRatesInst.enableTokenTrade(someToken.address);
    });

    it("should verify disable token trade reverted if token not listed.", async function () {

        let someToken = await TestToken.new("testing", "tst9", 15);

        //try to disable token trade when not listed.
        try {
            await convRatesInst.disableTokenTrade(someToken.address, {from: alerter});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //add token and see enable success
        await convRatesInst.addToken(someToken.address);
        await convRatesInst.disableTokenTrade(someToken.address, {from: alerter});
    });

    it("should verify get rate returns 0 if token disabled.", async function () {
        let qty = 3000;
        let index = 5;

        let rate = await convRatesInst.getRate(tokens[index], currentBlock, false, qty);
        Helper.assertGreater(rate, 0, "unexpected rate");

        await convRatesInst.disableTokenTrade(tokens[index], {from: alerter});
        rate = await convRatesInst.getRate(tokens[index], currentBlock, false, qty);
        Helper.assertEqual(rate, 0, "unexpected rate");

        await convRatesInst.enableTokenTrade(tokens[index]);
    });

    it("should verify get rate returns 0 if token minimal record resolution is zero.", async function () {
        let qty = 3000;
        let index = 5;

        let rate = await convRatesInst.getRate(tokens[index], currentBlock, false, qty);

        Helper.assertGreater(rate, 0, "unexpected rate");

        await convRatesInst.setTokenControlInfo(tokens[index], 0, 0, 0);
        rate = await convRatesInst.getRate(tokens[index], currentBlock, false, qty);
        Helper.assertEqual(rate, 0, "unexpected rate");

        await convRatesInst.setTokenControlInfo(tokens[index], minimalRecordResolution, maxPerBlockImbalance, maxTotalImbalance);
    });

    it("should verify get rate returns 0 block is high (bigger then expiration block).", async function () {
        let qty = 3000;
        let index = 5;

        let rate = await convRatesInst.getRate(tokens[index], currentBlock, false, qty);

        Helper.assertGreater(rate, 0, "unexpected rate");

        rate = await convRatesInst.getRate(tokens[index], currentBlock*1 + 2000, false, qty);
        Helper.assertEqual(rate, 0, "unexpected rate");
    });

    it("should verify get rate returns 0 when qty above block imbalance.", async function () {
        let qty = maxPerBlockImbalance * 1 - 1;
        let index = 5;

        let rate = await convRatesInst.getRate(tokens[index], currentBlock, false, qty);

        Helper.assertGreater(rate, 0, "unexpected rate");

        qty = qty * 1 + 2;
        rate = await convRatesInst.getRate(tokens[index], currentBlock, false, qty);
        Helper.assertEqual(rate, 0, "unexpected rate");
    });

    it("should verify get rate returns 0 when qty + total imbalance are above maxTotalImbalance.", async function () {
        let qty = (maxPerBlockImbalance * -1 + 2);
        let index = 11;
        let totalImbalance = 0;
        let token = tokens[index];
        let imbalance = qty;

        let lastSetBlock = await convRatesInst.getUpdateRateBlockFromCompact(token);
        Helper.assertEqual(lastSetBlock, lastSetCompactBlock, "unexpected block");

        while ((totalImbalance + imbalance) > (-maxTotalImbalance)) {
            await convRatesInst.recordImbalance(token, imbalance, lastSetCompactBlock, currentBlock++, {from: reserveAddress});
            totalImbalance += imbalance;
        }

        qty = maxTotalImbalance + totalImbalance - 1;
        let rximbalance = await convRatesInst.mockGetImbalance(token, lastSetCompactBlock, currentBlock);
        Helper.assertEqual(rximbalance[0], totalImbalance, "bad imbalance");

        let maxTotal = await convRatesInst.mockGetMaxTotalImbalance(token);
        Helper.assertEqual(maxTotal, maxTotalImbalance, "unexpected max total imbalance.");

        //we are near total imbalance so small getRate will get legal rate.
        let rate = await convRatesInst.getRate(token, currentBlock, false, qty);

        Helper.assertGreater(rate, 0, "expected rate > 0, received: " + rate);

        //high get rate should get 0.
        rate = await convRatesInst.getRate(token, currentBlock, false, (qty + 1));

        Helper.assertEqual(rate, 0, "unexpected rate");
    });


    it("should verify record imbalance reverted when not from reserve address.", async function () {
        //try record imbalance
        try {
            await convRatesInst.recordImbalance(tokens[5], 30, currentBlock, currentBlock, {from: alerter});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //now the same from reserve address
        await convRatesInst.recordImbalance(tokens[5], 30, currentBlock, currentBlock, {from: reserveAddress});
    });

    it("should verify set step functions for qty reverted when more them max steps (10).", async function () {
        let index = 1;

        qtyBuyStepX = [15, 30, 70, 100, 200, 500, 700, 900, 1100, 1500];
        qtyBuyStepY = [8, 30, 70, 100, 120, 150, 170, 190, 210, 250];
        qtySellStepX = [15, 30, 70, 100, 200, 500, 700, 900, 1100, 1500];
        qtySellStepY = [8, 30, 70, 100, 120, 150, 170, 190, 210, 250];

        await convRatesInst.setQtyStepFunction(tokens[index], qtyBuyStepX, qtyBuyStepY, qtySellStepX, qtySellStepY, {from:operator});

        //set illegal number of steps for buy
        qtyBuyStepX[10] = 1600;
        qtyBuyStepY[10] = 350;

        try {
            await convRatesInst.setQtyStepFunction(tokens[index], qtyBuyStepX, qtyBuyStepY, qtySellStepX, qtySellStepY, {from:operator});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //remove extra step and see success.
        qtyBuyStepY.length = qtyBuyStepX.length = 10;
        await convRatesInst.setQtyStepFunction(tokens[index], qtyBuyStepX, qtyBuyStepY, qtySellStepX, qtySellStepY, {from:operator});

        //set illegal number of steps for sell
        qtySellStepX[10] = 1600;
        qtySellStepY[10] = 350;

        try {
            await convRatesInst.setQtyStepFunction(tokens[index], qtyBuyStepX, qtyBuyStepY, qtySellStepX, qtySellStepY, {from:operator});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("should verify set step functions for imbalance reverted when more them max steps (10).", async function () {
        let index = 1;

        imbalanceBuyStepX = [15, 30, 70, 100, 200, 500, 700, 900, 1100, 1500];
        imbalanceBuyStepY = [8, 30, 70, 100, 120, 150, 170, 190, 210, 250];
        imbalanceSellStepX = [15, 30, 70, 100, 200, 500, 700, 900, 1100, 1500];
        imbalanceSellStepY = [8, 30, 70, 100, 120, 150, 170, 190, 210, 250];

        await convRatesInst.setImbalanceStepFunction(tokens[index], imbalanceBuyStepX, imbalanceBuyStepY, imbalanceSellStepX, imbalanceSellStepY, {from:operator});

        //set illegal value for buy steps.
        imbalanceBuyStepX[10] = 1600;
        imbalanceBuyStepY[10] = 350;

        try {
            await convRatesInst.setImbalanceStepFunction(tokens[index], imbalanceBuyStepX, imbalanceBuyStepY, imbalanceSellStepX, imbalanceSellStepY, {from:operator});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }


        //remove extra step and see success again
        imbalanceBuyStepX.length = imbalanceBuyStepY.length = 10;
        await convRatesInst.setImbalanceStepFunction(tokens[index], imbalanceBuyStepX, imbalanceBuyStepY, imbalanceSellStepX, imbalanceSellStepY, {from:operator});

        //set illegal value for sell steps.
        imbalanceSellStepX[10] = 1600;
        imbalanceSellStepY[10] = 350;

        try {
            await convRatesInst.setImbalanceStepFunction(tokens[index], imbalanceBuyStepX, imbalanceBuyStepY, imbalanceSellStepX, imbalanceSellStepY, {from:operator});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("should verify getCompactData reverted when token not listed.", async function () {
        let someToken = await TestToken.new("testing", "tst9", 15);

        try {
            let compactResArr = await convRatesInst.getCompactData(someToken.address);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //add token and see enable success
        await convRatesInst.addToken(someToken.address);
        compactResArr = await convRatesInst.getCompactData(someToken.address);
    });

    it("should verify add bps reverts for illegal values", async function () {
        let minLegalBps = -100 * 100;
        let maxLegalBps = new BN(10).pow(new BN(11));
        let legalRate = new BN(10).pow(new BN(24));
        let illegalRate = legalRate.add(new BN(1));
        let illegalBpsMinSide = minLegalBps - 1*1;
        let illegalBpsMaxSide = maxLegalBps.add(new BN(1));

        await convRatesInst.mockAddBps(legalRate, minLegalBps);
        await convRatesInst.mockAddBps(legalRate, maxLegalBps);

        //see fail with illegal rate
        try {
            await convRatesInst.mockAddBps(illegalRate, minLegalBps);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //see fail with illegal bps (min side)
        try {
            await convRatesInst.mockAddBps(legalRate, illegalBpsMinSide);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //see fail with illegal bps (max side)
        try {
            await convRatesInst.mockAddBps(legalRate, illegalBpsMaxSide);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

    });
});

function convertRateToPricingRate (baseRate) {
// conversion rate in pricing is in precision units (10 ** 18) so
// rate 1 to 50 is 50 * 10 ** 18
// rate 50 to 1 is 1 / 50 * 10 ** 18
    return new BN(10).pow(new BN(18)).mul(new BN(baseRate));
};

function getExtraBpsForBuyQuantity(qty) {
    for (let i = 0; i < qtyBuyStepX.length; i++) {
        if (qty <= qtyBuyStepX[i]) return qtyBuyStepY[i];
    }
    return qtyBuyStepY[qtyBuyStepY.length - 1];
};

function getExtraBpsForSellQuantity(qty) {
    for (let i = 0; i < qtySellStepX.length; i++) {
        if (qty <= qtySellStepX[i]) return qtySellStepY[i];
    }
    return qtySellStepY[qtySellStepY.length - 1];
};

function getExtraBpsForImbalanceBuyQuantity(qty) {
    for (let i = 0; i < imbalanceBuyStepX.length; i++) {
        if (qty <= imbalanceBuyStepX[i]) return imbalanceBuyStepY[i];
    }
    return (imbalanceBuyStepY[imbalanceBuyStepY.length - 1]);
};

function getExtraBpsForImbalanceSellQuantity(qty) {
    for (let i = 0; i < imbalanceSellStepX.length; i++) {
        if (qty <= imbalanceSellStepX[i]) return imbalanceSellStepY[i];
    }
    return (imbalanceSellStepY[imbalanceSellStepY.length - 1]);
};
