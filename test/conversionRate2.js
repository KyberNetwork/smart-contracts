//let ConversionRates = artifacts.require("./ConversionRates.sol");
let ConversionRates = artifacts.require("./mockContracts/MockConversionRate2.sol");
let TestToken = artifacts.require("./mockContracts/TestToken.sol");
let Wrapper = artifacts.require("./mockContracts/Wrapper.sol");

let Helper = require("./helper.js");
let BigNumber = require('bignumber.js');

//global variables
let precisionUnits = (new BigNumber(10).pow(18));
let token;
let minimalRecordResolution = 2; //low resolution so I don't lose too much data. then easier to compare calculated imbalance values.
let maxPerBlockImbalance = 4000;
let maxTotalImbalance = maxPerBlockImbalance * 12;
let admin;
let alerter;
let currentBlock = 3000;
let lastSetCompactBlock = currentBlock;
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

let convRatesInst;

contract('ConversionRates2', function(accounts) {
    it("should init globals", function() {
        admin = accounts[0];
        alerter = accounts[1];
        operator = accounts[2];
        reserveAddress = accounts[3];
    })

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

    it("should set base rates for all tokens.", async function () {
        // set base rate

        //buy is ether to token rate. sale is token to ether rate. so sell == 1 / buy. assuming we have no spread.
        let ethToTokenRate;
        let tokenToEthRate;

        for (i = 0; i < numTokens; ++i) {
            ethToTokenRate = convertRateToPricingRate((i + 1) * 10);
            tokenToEthRate = convertRateToPricingRate(Number((1 / ((i + 1) * 10)).toFixed(13)));
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
            assert.deepEqual(thisBuy.valueOf(), baseBuy[i].valueOf(), "wrong base buy rate.");
            assert.deepEqual(thisSell.valueOf(), baseSell[i].valueOf(), "wrong base sell rate.");
        }
    });

    it("should set compact data all tokens.", async function () {
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

            assert.equal(compactResArr[0].valueOf(), arrIndex.valueOf(), "wrong array " + i);
            assert.equal(compactResArr[1].valueOf(), fieldIndex.valueOf(), "wrong field index " + i);
            if (arrIndex == 0) {
                compactBuy = compactBuyArr1;
                compactSell = compactSellArr1;
            }
            else
            {
                compactBuy = compactBuyArr2;
                compactSell = compactSellArr2;
            }
            assert.equal(compactResArr[2].valueOf(), compactBuy[fieldIndex].valueOf(), "wrong buy: " + i);
            assert.equal(compactResArr[3].valueOf(), compactSell[fieldIndex].valueOf(), "wrong sell: " + i);
        }

        //get block number from compact data and verify
        let blockNum = await convRatesInst.getRateUpdateBlock(tokens[3]);

        assert.equal(blockNum.valueOf(), currentBlock.valueOf(), "bad block number returned");

        blockNum = await convRatesInst.getRateUpdateBlock(tokens[11]);

        assert.equal(blockNum.valueOf(), currentBlock.valueOf(), "bad block number returned");
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

    it("should get buy rate with update according to compact data update.", async function () {
        let tokenInd = 7;
        let token = tokens[tokenInd]; //choose some token
        let baseBuyRate = await convRatesInst.getBasicRate(token, true);

        // get rate without activating quantity step function (small amount).
        let srcQty = 2;
        let expectedRate = (new BigNumber(baseBuyRate));
        let extraBps = compactBuyArr1[tokenInd] * 10;
        expectedRate = addBps(expectedRate, extraBps);
        let dstQty = new BigNumber(srcQty).mul(expectedRate).div(precisionUnits);
        dstQty = dstQty.floor();
        extraBps = getExtraBpsForBuyQuantity(dstQty);
        expectedRate = addBps(expectedRate, extraBps);
        extraBps = getExtraBpsForImbalanceBuyQuantity(dstQty);
        expectedRate = addBps(expectedRate, extraBps);
        let receivedRate = await convRatesInst.getRate(token, currentBlock, true, srcQty);

        assert.deepEqual(expectedRate.valueOf(), receivedRate.valueOf(), "bad rate");
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
        convRatesInst.setCompactData(buys, sells, currentBlock, indices, {from: operator});
        lastSetCompactBlock = currentBlock;

        // get rate with the updated compact data.
        let srcQty = 5;
        let expectedRate = (new BigNumber(baseBuyRate));
        let extraBps = compactBuyArr1[tokenInd] * 10;
        expectedRate = addBps(expectedRate, extraBps);
        let dstQty = new BigNumber(srcQty).mul(expectedRate).div(precisionUnits);
        dstQty = dstQty.floor();
        extraBps = getExtraBpsForBuyQuantity(dstQty);
        expectedRate = addBps(expectedRate, extraBps);
        extraBps = getExtraBpsForImbalanceBuyQuantity(dstQty);
        expectedRate = addBps(expectedRate, extraBps);

        let receivedRate = await convRatesInst.getRate(token, currentBlock, true, srcQty);

        assert.deepEqual(expectedRate.valueOf(), receivedRate.valueOf(), "bad rate");

        //update compact data
        compactBuyArr1[tokenInd] = 127;
        compactHex = Helper.bytesToHex(compactBuyArr1);
        buys.length = 0;
        buys.push(compactHex);
        convRatesInst.setCompactData(buys, sells, currentBlock, indices, {from: operator});
        lastSetCompactBlock = currentBlock;

        // get rate without activating quantity step function (small amount).
        srcQty = 11;
        expectedRate = (new BigNumber(baseBuyRate));
        extraBps = compactBuyArr1[tokenInd] * 10;
        expectedRate = addBps(expectedRate, extraBps);
        dstQty = new BigNumber(srcQty).mul(expectedRate).div(precisionUnits);
        dstQty = dstQty.floor();
        extraBps = getExtraBpsForBuyQuantity(dstQty);
        expectedRate = addBps(expectedRate, extraBps);
        extraBps = getExtraBpsForImbalanceBuyQuantity(dstQty);
        expectedRate = addBps(expectedRate, extraBps);

        receivedRate = await convRatesInst.getRate(token, currentBlock, true, srcQty);

        assert.deepEqual(expectedRate.valueOf(), receivedRate.valueOf(), "bad rate");
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
        convRatesInst.setCompactData(buys, sells, currentBlock, indices, {from: operator});
        lastSetCompactBlock = currentBlock;

        // get rate without activating quantity step function (small amount).

        // calculate expected rate
        let srcQty = 21;
        let expectedRate = (new BigNumber(baseBuyRate));
        let extraBps = compactBuyArr2[tokenInd - 14] * 10;
        expectedRate = addBps(expectedRate, extraBps);
        let dstQty = new BigNumber(srcQty).mul(expectedRate).div(precisionUnits);
        dstQty = dstQty.floor();
        extraBps = getExtraBpsForBuyQuantity(dstQty);
        expectedRate = addBps(expectedRate, extraBps);
        extraBps = getExtraBpsForImbalanceBuyQuantity(dstQty);
        expectedRate = addBps(expectedRate, extraBps);

        let receivedRate = await convRatesInst.getRate(token, currentBlock, true, srcQty);

        assert.deepEqual(expectedRate.valueOf(), receivedRate.valueOf(), "bad rate");
    });

    it("should get buy rate with compact data and quantity step.", async function () {
        let tokenInd = 11;
        let token = tokens[tokenInd]; //choose some token
        let baseBuyRate = await convRatesInst.getBasicRate(token, true);

        // calculate expected rate
        let srcQty = 17;
        let expectedRate = (new BigNumber(baseBuyRate));
        let extraBps = compactBuyArr1[tokenInd] * 10;
        expectedRate = addBps(expectedRate, extraBps);
        let dstQty = new BigNumber(srcQty).mul(expectedRate).div(precisionUnits);
        dstQty = dstQty.floor();
        extraBps = getExtraBpsForBuyQuantity(dstQty);
        expectedRate = addBps(expectedRate, extraBps);
        extraBps = getExtraBpsForImbalanceBuyQuantity(dstQty);
        expectedRate = addBps(expectedRate, extraBps);

        let receivedRate = await convRatesInst.getRate(token, currentBlock, true, srcQty);

        assert.deepEqual(expectedRate.valueOf(), receivedRate.valueOf(), "bad rate");
    });

    it("should get buy rate quantity step and compact data update with token index > 14.", async function () {
        let tokenInd = 15;
        let token = tokens[tokenInd]; //choose some token
        let baseBuyRate = await convRatesInst.getBasicRate(token, true);

        // get rate
        let srcQty = 24;
        let expectedRate = (new BigNumber(baseBuyRate));
        let extraBps = compactBuyArr2[tokenInd - 14] * 10;
        expectedRate = addBps(expectedRate, extraBps);
        let dstQty = new BigNumber(srcQty).mul(expectedRate).div(precisionUnits);
        dstQty = dstQty.floor();
        extraBps = getExtraBpsForBuyQuantity(dstQty);
        expectedRate = addBps(expectedRate, extraBps);
        extraBps = getExtraBpsForImbalanceBuyQuantity(dstQty);
        expectedRate = addBps(expectedRate, extraBps);

        let receivedRate = await convRatesInst.getRate(token, currentBlock, true, srcQty);

        assert.deepEqual(expectedRate.valueOf(), receivedRate.valueOf(), "bad rate");
    });

    it("should add imbalance. get buy rate with with compact data + quantity step + imbalance step.", async function () {
        let tokenInd = 8;
        let token = tokens[tokenInd]; //choose some token
        let baseBuyRate = await convRatesInst.getBasicRate(token, true);

        // get rate
        let buyQty = 15;
        let imbalance = 95;
        let expectedRate = (new BigNumber(baseBuyRate));
        let extraBps = compactBuyArr1[tokenInd] * 10;
        expectedRate = addBps(expectedRate, extraBps);
        let dstQty = new BigNumber(buyQty).mul(expectedRate).div(precisionUnits);
        dstQty = dstQty.floor();
        //quantity bps
        extraBps = getExtraBpsForBuyQuantity(dstQty);
        expectedRate = addBps(expectedRate, extraBps);
        //imbalance bps
        extraBps = getExtraBpsForImbalanceBuyQuantity(imbalance + (dstQty * 1));
        expectedRate = addBps(expectedRate, extraBps);

        //record imbalance
        await convRatesInst.recordImbalance(token, imbalance, currentBlock, currentBlock, {from: reserveAddress});

        let receivedRate = await convRatesInst.getRate(token, currentBlock, true, buyQty);
        assert.deepEqual(expectedRate.valueOf(), receivedRate.valueOf(), "bad rate");
    });

    it("should add imbalance and get sell rate with with compact data + quantity step + imbalance step.", async function () {
        let tokenInd = 16;
        let token = tokens[tokenInd]; //choose some token
        let baseSellRate = await convRatesInst.getBasicRate(token, false);

        // get rate
        let sellQty = 500;
        let imbalance = 1800;
        let expectedRate = (new BigNumber(baseSellRate));
        //calc compact data
        let extraBps = compactSellArr2[tokenInd - 14] * 10;
        expectedRate = addBps(expectedRate, extraBps);
        //calc quantity steps
        extraBps = getExtraBpsForSellQuantity(sellQty);
        expectedRate = addBps(expectedRate, extraBps);
        //calc imbalance steps
        extraBps = getExtraBpsForImbalanceSellQuantity(imbalance - (sellQty * 1));
        expectedRate = addBps(expectedRate, extraBps);

        //record imbalance
        await convRatesInst.recordImbalance(token, imbalance, currentBlock, currentBlock, {from: reserveAddress});

        let receivedRate = await convRatesInst.getRate(token, currentBlock, false, sellQty);

        //round rates a bit
        compareRates(receivedRate, expectedRate);
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

    it("should verify get rate returns 0 if token disabled.", async function () {
        let qty = 3000;
        let index = 5;

        let rate = await convRatesInst.getRate(tokens[index], currentBlock, false, qty);

        assert(rate > 0, "unexpected rate");

        await convRatesInst.disableTokenTrade(tokens[index], {from: alerter});
        rate = await convRatesInst.getRate(tokens[index], currentBlock, false, qty);
        assert(rate == 0, "unexpected rate");

        await convRatesInst.enableTokenTrade(tokens[index]);
    });

    it("should verify get rate returns 0 if token minimal record resolution is zero.", async function () {
        let qty = 3000;
        let index = 5;

        let rate = await convRatesInst.getRate(tokens[index], currentBlock, false, qty);

        assert(rate > 0, "unexpected rate");

        await convRatesInst.setTokenControlInfo(tokens[index], 0, 0, 0);
        rate = await convRatesInst.getRate(tokens[index], currentBlock, false, qty);
        assert(rate == 0, "unexpected rate");

        await convRatesInst.setTokenControlInfo(tokens[index], minimalRecordResolution, maxPerBlockImbalance, maxTotalImbalance);
    });

    it("should verify get rate returns 0 block is high (bigger then expiration block).", async function () {
        let qty = 3000;
        let index = 5;

        let rate = await convRatesInst.getRate(tokens[index], currentBlock, false, qty);

        assert(rate > 0, "unexpected rate");

        rate = await convRatesInst.getRate(tokens[index], currentBlock*1 + 2000, false, qty);
        assert(rate == 0, "unexpected rate");
    });

    it("should verify get rate returns 0 when qty above block imbalance.", async function () {
        let qty = maxPerBlockImbalance * 1 - 1;
        let index = 5;

        let rate = await convRatesInst.getRate(tokens[index], currentBlock, false, qty);

        assert(rate > 0, "unexpected rate");

        qty = qty * 1 + 2;
        rate = await convRatesInst.getRate(tokens[index], currentBlock, false, qty);
        assert(rate == 0, "unexpected rate");
    });

    it("should verify get rate returns 0 when qty + total imbalance are above maxTotalImbalance.", async function () {
        let qty = (maxPerBlockImbalance * -1 + 2);
        let index = 11;
        let totalImbalance = 0;
        let token = tokens[index];
        let imbalance = qty;

        let lastSetBlock = await convRatesInst.getUpdateRateBlockFromCompact(token);
        assert.equal(lastSetBlock.valueOf(), lastSetCompactBlock, "unexpected block");

        while ((totalImbalance + imbalance) > (-maxTotalImbalance)) {
            await convRatesInst.recordImbalance(token, imbalance, lastSetCompactBlock, currentBlock++, {from: reserveAddress});
            totalImbalance += imbalance;
        }

        qty = maxTotalImbalance + totalImbalance - 1;
        let rximbalance = await convRatesInst.mockGetImbalance(token, lastSetCompactBlock, currentBlock);
        assert.equal(rximbalance[0].valueOf(), totalImbalance, "bad imbalance");

        let maxTotal = await convRatesInst.mockGetMaxTotalImbalance(token);
        assert.equal(maxTotalImbalance, maxTotal.valueOf(), "unexpected max total imbalance.");

        //we are near total imbalance so small getRate will get legal rate.
        let rate = await convRatesInst.getRate(token, currentBlock, false, qty);

        assert(rate > 0, "expected rate > 0, received: " + rate);

        //high get rate should get 0.
        rate = await convRatesInst.getRate(token, currentBlock, false, (qty + 1));

        assert.equal(rate.valueOf(), 0, "unexpected rate");
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

    it("should verify set step functions for qty reverted when amounts are negative.", async function () {
        let index = 1;

        qtyBuyStepX = [15, 30, 100, 150];
        qtyBuyStepY = [8, 30, 70, 100];
        qtySellStepX = [15, 30, 70, 100];
        qtySellStepY = [8, 30, 70, 100];

        await convRatesInst.setQtyStepFunction(tokens[index], qtyBuyStepX, qtyBuyStepY, qtySellStepX, qtySellStepY, {from:operator});

        // bps can be negative
        qtyBuyStepY = [-8, 30, 70, 100];
        qtySellStepY = [-8, 30, 70, 100];
        await convRatesInst.setQtyStepFunction(tokens[index], qtyBuyStepX, qtyBuyStepY, qtySellStepX, qtySellStepY, {from:operator});

        qtyBuyStepX = [-15, 30, 100, 150];

        try {
            await convRatesInst.setQtyStepFunction(tokens[index], qtyBuyStepX, qtyBuyStepY, qtySellStepX, qtySellStepY, {from:operator});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        // all non-negative, should pass
        qtyBuyStepX = [0, 30, 100, 150];
        await convRatesInst.setQtyStepFunction(tokens[index], qtyBuyStepX, qtyBuyStepY, qtySellStepX, qtySellStepY, {from:operator});

        qtyBuyStepX = [15, 30, 100, 150];
        qtySellStepX = [-15, 30, 150, 100];
        try {
            await convRatesInst.setQtyStepFunction(tokens[index], qtyBuyStepX, qtyBuyStepY, qtySellStepX, qtySellStepY, {from:operator});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        qtyBuyStepX = [-15];
        qtyBuyStepY = [8];
        qtySellStepX = [15];
        qtySellStepY = [8];
        try {
            await convRatesInst.setQtyStepFunction(tokens[index], qtyBuyStepX, qtyBuyStepY, qtySellStepX, qtySellStepY, {from:operator});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        qtyBuyStepX = [15];
        qtySellStepX = [-15];
        try {
            await convRatesInst.setQtyStepFunction(tokens[index], qtyBuyStepX, qtyBuyStepY, qtySellStepX, qtySellStepY, {from:operator});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("should verify set step functions for qty reverted when amounts are not increasing.", async function () {
        let index = 1;

        qtyBuyStepX = [15, 30, 100, 150];
        qtyBuyStepY = [8, 30, 70, 100];
        qtySellStepX = [15, 30, 70, 100];
        qtySellStepY = [8, 30, 70, 100];

        await convRatesInst.setQtyStepFunction(tokens[index], qtyBuyStepX, qtyBuyStepY, qtySellStepX, qtySellStepY, {from:operator});
        qtyBuyStepX = [15, 30, 150, 100];

        try {
            await convRatesInst.setQtyStepFunction(tokens[index], qtyBuyStepX, qtyBuyStepY, qtySellStepX, qtySellStepY, {from:operator});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        qtyBuyStepX = [15, 30, 100, 100];
        try {
            await convRatesInst.setQtyStepFunction(tokens[index], qtyBuyStepX, qtyBuyStepY, qtySellStepX, qtySellStepY, {from:operator});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        qtyBuyStepX = [15, 30, 100, 150];
        qtySellStepX = [15, 30, 150, 100];

        try {
            await convRatesInst.setQtyStepFunction(tokens[index], qtyBuyStepX, qtyBuyStepY, qtySellStepX, qtySellStepY, {from:operator});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        qtySellStepX = [15, 30, 100, 100];
        try {
            await convRatesInst.setQtyStepFunction(tokens[index], qtyBuyStepX, qtyBuyStepY, qtySellStepX, qtySellStepY, {from:operator});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        qtyBuyStepX = [15];
        qtyBuyStepY = [8];
        qtySellStepX = [15];
        qtySellStepY = [8];
        await convRatesInst.setQtyStepFunction(tokens[index], qtyBuyStepX, qtyBuyStepY, qtySellStepX, qtySellStepY, {from:operator});

        qtyBuyStepX = [];
        qtyBuyStepY = [];
        qtySellStepX = [];
        qtySellStepY = [];
        await convRatesInst.setQtyStepFunction(tokens[index], qtyBuyStepX, qtyBuyStepY, qtySellStepX, qtySellStepY, {from:operator});
    });

    it("should verify set step functions for imbalance reverted when amounts are not increasing.", async function () {
        let index = 1;

        imbalanceBuyStepX = [15, 30, 70, 100, 200];
        imbalanceBuyStepY = [8, 30, 70, 100, 120];
        imbalanceSellStepX = [15, 30, 70, 100, 200];
        imbalanceSellStepY = [8, 30, 70, 100, 120];

        await convRatesInst.setImbalanceStepFunction(tokens[index], imbalanceBuyStepX, imbalanceBuyStepY, imbalanceSellStepX, imbalanceSellStepY, {from:operator});

        imbalanceBuyStepX = [15, 30, 70, 200, 100];
        try {
            await convRatesInst.setImbalanceStepFunction(tokens[index], imbalanceBuyStepX, imbalanceBuyStepY, imbalanceSellStepX, imbalanceSellStepY, {from:operator});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        imbalanceBuyStepX = [15, 30, 70, 100, 100];
        try {
            await convRatesInst.setImbalanceStepFunction(tokens[index], imbalanceBuyStepX, imbalanceBuyStepY, imbalanceSellStepX, imbalanceSellStepY, {from:operator});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        imbalanceBuyStepX = [15, 30, 70, 100, 200];
        imbalanceSellStepX = [15, 30, 70, 200, 100];

        try {
            await convRatesInst.setImbalanceStepFunction(tokens[index], imbalanceBuyStepX, imbalanceBuyStepY, imbalanceSellStepX, imbalanceSellStepY, {from:operator});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        imbalanceSellStepX = [15, 30, 70, 100, 100];
        try {
            await convRatesInst.setImbalanceStepFunction(tokens[index], imbalanceBuyStepX, imbalanceBuyStepY, imbalanceSellStepX, imbalanceSellStepY, {from:operator});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        imbalanceBuyStepX = [15];
        imbalanceBuyStepY = [8];
        imbalanceSellStepX = [15];
        imbalanceSellStepY = [8];
        await convRatesInst.setImbalanceStepFunction(tokens[index], imbalanceBuyStepX, imbalanceBuyStepY, imbalanceSellStepX, imbalanceSellStepY, {from:operator});

        imbalanceBuyStepX = [];
        imbalanceBuyStepY = [];
        imbalanceSellStepX = [];
        imbalanceSellStepY = [];
        await convRatesInst.setImbalanceStepFunction(tokens[index], imbalanceBuyStepX, imbalanceBuyStepY, imbalanceSellStepX, imbalanceSellStepY, {from:operator});
    });

    it("should test getting bps from executing step function as expected", async function () {
        let tokenInd = 1;
        let token = tokens[tokenInd];
        // Case1: qty negative, 0 < qty < all steps
        let stepX = [-200, -100, -50];
        let stepY = [-20, -10, -5];
        await convRatesInst.setImbalanceStepFunction(token, stepX, stepY, stepX, stepY, {from:operator});
        let bps = getExtraBpsForQuantity(-300, stepX, stepY);
        // (-300 - (-200)) * (-20) + (-200 - (-100)) * (-10) + (-100 - (-50)) * (-5) + (-50 - 0) * -5 = 3500
        assert.equal(divSolidity(3500, -300), bps, "bad bps");
        let contractBps = await convRatesInst.mockExecuteStepFunction(token, -300);
        assert.equal(contractBps.valueOf(), bps, "bad bps");

        // Case2: qty negative, all steps < qty < 0
        stepX = [-200, -100, -50];
        stepY = [-20, -10, -5];
        bps = getExtraBpsForQuantity(-25, stepX, stepY);
        // (-25 - 0) * -5
        assert.equal(-5, bps, "bad bps");
        await convRatesInst.setImbalanceStepFunction(token, stepX, stepY, stepX, stepY, {from:operator});
        contractBps = await convRatesInst.mockExecuteStepFunction(token, -25);
        assert.equal(contractBps.valueOf(), bps, "bad bps");

        // Case2: qty negative, first step < qty < last step < 0
        stepX = [-200, -100, -50];
        stepY = [-20, -10, -5];
        bps = getExtraBpsForQuantity(-75, stepX, stepY);
        // (-75 - (-50)) * (-5) + (-50 - 0) * (-5)
        assert.equal(-5, bps, "bad bps");
        await convRatesInst.setImbalanceStepFunction(token, stepX, stepY, stepX, stepY, {from:operator});
        contractBps = await convRatesInst.mockExecuteStepFunction(token, -75);
        assert.equal(contractBps.valueOf(), bps, "bad bps");

        // Case3: qty negative, all steps negative except last one is 0
        stepX = [-200, -100, -50, 0];
        stepY = [-20, -10, -5, 1];
        // (-300 - (-200)) * (-20) + (-200 - (-100)) * (-10) + (-100 - (-50)) * (-5) + (-50 - 0) * 1 = 3200
        bps = getExtraBpsForQuantity(-300, stepX, stepY);
        assert.equal(divSolidity(3200, -300), bps, "bad bps");
        await convRatesInst.setImbalanceStepFunction(token, stepX, stepY, stepX, stepY, {from:operator});
        contractBps = await convRatesInst.mockExecuteStepFunction(token, -300);
        assert.equal(contractBps.valueOf(), bps, "bad bps");

        // Case4: qty negative, all steps negative except last one is positive, qty < all steps
        stepX = [-200, -100, -50, 10];
        stepY = [-20, -10, -5, 2];
        // (-300 - (-200)) * (-20) + (-200 - (-100)) * (-10) + (-100 - (-50)) * (-5) + (-50 - 0) * 2 = 3150
        bps = getExtraBpsForQuantity(-300, stepX, stepY);
        assert.equal(divSolidity(3150, -300), bps, "bad bps");
        await convRatesInst.setImbalanceStepFunction(token, stepX, stepY, stepX, stepY, {from:operator});
        contractBps = await convRatesInst.mockExecuteStepFunction(token, -300);
        assert.equal(contractBps.valueOf(), bps, "bad bps");

        // Case5: qty negative, all steps negative except last one is positive, first step < qty < last step
        // (-150 - (-100)) * (-10) + (-100 - (-50)) * (-5) + (-50 - 0) * 2 = 650
        bps = getExtraBpsForQuantity(-150, stepX, stepY);
        assert.equal(divSolidity(650, -150), bps, "bad bps");
        await convRatesInst.setImbalanceStepFunction(token, stepX, stepY, stepX, stepY, {from:operator});
        contractBps = await convRatesInst.mockExecuteStepFunction(token, -150);
        assert.equal(contractBps.valueOf(), bps, "bad bps");

        // Case6: qty negative, all steps non-negative with first step is 0
        stepX = [0, 10, 20, 30];
        stepY = [0, 20, 50, 100];
        bps = getExtraBpsForQuantity(-100, stepX, stepY);
        assert.equal(0, bps, "bad bps for negative qty with all non-negative qty");
        await convRatesInst.setImbalanceStepFunction(token, stepX, stepY, stepX, stepY, {from:operator});
        contractBps = await convRatesInst.mockExecuteStepFunction(token, -100);
        assert.equal(contractBps.valueOf(), bps, "bad bps");

        // Case7: qty negative, all steps non-negative with first step is 0
        stepX = [10, 20, 30];
        stepY = [20, 50, 100];
        bps = getExtraBpsForQuantity(-100, stepX, stepY);
        assert.equal(20, bps, "bad bps for negative qty with all non-negative qty");
        await convRatesInst.setImbalanceStepFunction(token, stepX, stepY, stepX, stepY, {from:operator});
        contractBps = await convRatesInst.mockExecuteStepFunction(token, -100);
        assert.equal(contractBps.valueOf(), bps, "bad bps");

        // Case8: qty is 0, fallback to old logic
        stepX = [10, 20, 30];
        stepY = [20, 50, 100];
        bps = getExtraBpsForQuantity(0, stepX, stepY);
        assert.equal(20, bps, "bad bps for 0 qty");
        contractBps = await convRatesInst.mockExecuteStepFunction(token, 0);
        await convRatesInst.setImbalanceStepFunction(token, stepX, stepY, stepX, stepY, {from:operator});
        assert.equal(contractBps.valueOf(), bps, "bad bps");

        stepX = [-100, -50, -30];
        stepY = [20, 50, 100];
        bps = getExtraBpsForQuantity(0, stepX, stepY);
        assert.equal(100, bps, "bad bps for 0 qty");
        await convRatesInst.setImbalanceStepFunction(token, stepX, stepY, stepX, stepY, {from:operator});
        contractBps = await convRatesInst.mockExecuteStepFunction(token, 0);
        assert.equal(contractBps.valueOf(), bps, "bad bps");

        // Case9: qty is positive, all steps are negative
        stepX = [-100, -50, -30];
        stepY = [20, 50, 100];
        bps = getExtraBpsForQuantity(20, stepX, stepY);
        assert.equal(100, bps, "bad bps for 0 qty");
        await convRatesInst.setImbalanceStepFunction(token, stepX, stepY, stepX, stepY, {from:operator});
        contractBps = await convRatesInst.mockExecuteStepFunction(token, 20);
        assert.equal(contractBps.valueOf(), bps, "bad bps");

        // Case10: qty is positive, 0 < first step < qty < last step
        stepX = [10, 30, 50];
        stepY = [20, 50, 100];
        bps = getExtraBpsForQuantity(40, stepX, stepY);
        // (10 * 20 + 20 * 50 + 10 * 100) = 2200
        assert.equal(divSolidity(2200, 40), bps, "bad bps for positive qty not all steps");
        await convRatesInst.setImbalanceStepFunction(token, stepX, stepY, stepX, stepY, {from:operator});
        contractBps = await convRatesInst.mockExecuteStepFunction(token, 40);
        assert.equal(contractBps.valueOf(), bps, "bad bps");

        // Case11: qty is positive, 0 < all steps < qty
        stepX = [10, 30, 50];
        stepY = [20, 50, 100];
        bps = getExtraBpsForQuantity(120, stepX, stepY);
        // (10 * 20 + 20 * 50 + 20 * 100 + 70 * 100) = 10200
        assert.equal(divSolidity(10200, 120), bps, "bad bps for positive qty all steps");
        await convRatesInst.setImbalanceStepFunction(token, stepX, stepY, stepX, stepY, {from:operator});
        contractBps = await convRatesInst.mockExecuteStepFunction(token, 120);
        assert.equal(contractBps.valueOf(), bps, "bad bps");

        // Case12: qty is positive, first step < 0 < qty < last step
        stepX = [-100, -50, 10, 30, 150];
        stepY = [-30, -15, 20, 50, 100];
        bps = getExtraBpsForQuantity(120, stepX, stepY);
        // (10 * 20 + 20 * 50 + 20 * 100 + 70 * 100) = 10200
        assert.equal(divSolidity(10200, 120), bps, "bad bps for positive qty all steps");
        await convRatesInst.setImbalanceStepFunction(token, stepX, stepY, stepX, stepY, {from:operator});
        contractBps = await convRatesInst.mockExecuteStepFunction(token, 120);
        assert.equal(contractBps.valueOf(), bps, "bad bps");

        // Case13: qty is positive, step is empty
        stepX = [];
        stepY = [];
        bps = getExtraBpsForQuantity(120, stepX, stepY);
        // (10 * 20 + 20 * 50 + 20 * 100 + 70 * 100) = 10200
        assert.equal(0, bps, "bad bps: should be 0 when step is empty");
        await convRatesInst.setImbalanceStepFunction(token, stepX, stepY, stepX, stepY, {from:operator});
        contractBps = await convRatesInst.mockExecuteStepFunction(token, 120);
        assert.equal(contractBps.valueOf(), bps, "bad bps");
    });
});

function convertRateToPricingRate (baseRate) {
// conversion rate in pricing is in precision units (10 ** 18) so
// rate 1 to 50 is 50 * 10 ** 18
// rate 50 to 1 is 1 / 50 * 10 ** 18
    return ((new BigNumber(10).pow(18)).mul(baseRate).floor());
};

function getExtraBpsForBuyQuantity(qty) {
    return getExtraBpsForQuantity(qty, qtyBuyStepX, qtyBuyStepY);
};

function getExtraBpsForSellQuantity(qty) {
    return getExtraBpsForQuantity(qty, qtySellStepX, qtySellStepY);
};

function getExtraBpsForImbalanceBuyQuantity(qty) {
    return getExtraBpsForQuantity(qty, imbalanceBuyStepX, imbalanceBuyStepY);
};

function getExtraBpsForImbalanceSellQuantity(qty) {
    return getExtraBpsForQuantity(qty, imbalanceSellStepX, imbalanceSellStepY);
};

function getExtraBpsForQuantity(qty, stepX, stepY) {
    let len = stepX.length;
    if (len == 0) { return 0; }
    if (qty == 0) {
        for(let i = 0; i < len; i++) {
            if (qty <= stepX[i]) { return stepY[i]; }
        }
        return stepY[len - 1];
    }
    let change = 0;
    let lastStepAmount = 0;
    if (qty > 0) {
        for(let i = 0; i < len; i++) {
            if (stepX[i] <= 0) { continue; }
            if (qty <= stepX[i]) {
                change += (qty - lastStepAmount) * stepY[i];
                lastStepAmount = qty;
                break;
            }
            change += (stepX[i] - lastStepAmount) * stepY[i];
            lastStepAmount = stepX[i];
        }
        if (qty > lastStepAmount) {
            change += (qty - lastStepAmount) * stepY[stepY.length - 1];
        }
    } else {
        lastStepAmount = qty;
        for(let i = 0; i < len; i++) {
            if (stepX[i] >= 0) {
                change += lastStepAmount * stepY[i];
                lastStepAmount = 0;
                break;
            }
            if (lastStepAmount < stepX[i]) {
                change += (lastStepAmount - stepX[i]) * stepY[i];
                lastStepAmount = stepX[i];
            }
        }
        if (lastStepAmount < 0) {
            change += lastStepAmount * stepY[len - 1];
        }
    }
    return divSolidity(change, qty);
}

function addBps (rate, bps) {
    return (rate.mul(10000 + bps).div(10000));
};

function compareRates (receivedRate, expectedRate) {
    expectedRate = expectedRate - (expectedRate % 10);
    receivedRate = receivedRate - (receivedRate % 10);
    assert.deepEqual(expectedRate, receivedRate, "different rates");
};

function divSolidity(a, b) {
    let c = a / b;
    if (c < 0) { return Math.ceil(c); }
    return Math.floor(c);
}