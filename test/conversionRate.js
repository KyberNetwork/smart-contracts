var ConversionRates = artifacts.require("./ConversionRates.sol");
var TestToken = artifacts.require("./mockContracts/TestToken.sol");
var Wrapper = artifacts.require("./mockContracts/Wrapper.sol");

var Helper = require("./helper.js");
var BigNumber = require('bignumber.js');

//global variables
var precisionUnits = (new BigNumber(10).pow(18));
var token;
var minimalRecordResolution = 2; //low resolution so I don't lose too much data. then easier to compare calculated imbalance values.
var maxPerBlockImbalance = 4000;
var maxTotalImbalance = maxPerBlockImbalance * 12;
var admin;
var rateUpdateBlock;
var currentBlock = 3000;
var wrapper;
var numTokens = 17;
var tokens = [];
var operator;
var reserveAddress;
var validRateDurationInBlocks = 1000;
var buys = [];
var sells = [];
var indices = [];
var qtyBuyStepX = [];
var qtyBuyStepY = [];
var qtySellStepX = [];
var qtySellStepY = [];
var imbalanceBuyStepX = [];
var imbalanceBuyStepY = [];
var imbalanceSellStepX = [];
var imbalanceSellStepY = [];
var compactBuyArr1 = [];
var compactBuyArr2 = [];
var compactSellArr1 = [];
var compactSellArr2 = [];

var convRatesInst;

contract('ConversionRates', function(accounts) {
    it("should test bytes14.", async function () {
        var arr = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
        var hexArr = Helper.bytesToHex(arr);
        var byte;

        wrapper = await Wrapper.new();

        for (var i = 0; i < 14; i++) {
            byte = await wrapper.getInt8FromByte(hexArr, i);
//            console.log("byte " + i + ": " + byte.valueOf());
            assert.equal(byte.valueOf(), arr[i], "bad bytes 14. index: " + i);
        }
    });

    it("should init ConversionRates Inst and set general parameters.", async function () {
        //init contracts
        convRatesInst = await ConversionRates.new(accounts[0], {});

        //set pricing general parameters
        convRatesInst.setValidRateDurationInBlocks(validRateDurationInBlocks);

        //create and add tokens. actually only addresses...
        for (var i = 0; i < numTokens; ++i) {
            token = await TestToken.new("test" + i, "tst" + i, 18);
            tokens[i] = token.address;
            await convRatesInst.addToken(token.address);
            await convRatesInst.setTokenControlInfo(token.address, minimalRecordResolution, maxPerBlockImbalance, maxTotalImbalance);
            await convRatesInst.enableTokenTrade(token.address);
        }

        assert.equal(tokens.length, numTokens, "bad number tokens");

        // set account addresses
        operator = accounts[1];
        reserveAddress = accounts[2];

        await convRatesInst.addOperator(operator);
        await convRatesInst.setReserveAddress(reserveAddress);
    });

    it("should set base rates for all tokens then get and verify.", async function () {
        // set base rate
        var baseBuy = [];
        var baseSell = [];

        //buy is ether to token rate. sale is token to ether rate. so sell == 1 / buy. assuming we have no spread.
        var ethToTokenRate;
        var tokenToEthRate;

        for (i = 0; i < numTokens; ++i) {
            ethToTokenRate = convertRateToPricingRate((i + 1) * 10);
            tokenToEthRate = convertRateToPricingRate(Number((1 / ((i + 1) * 10)).toFixed(13)));
            baseBuy.push(ethToTokenRate);
            baseSell.push(tokenToEthRate);
        }

        assert.equal(baseBuy.length, tokens.length);
        assert.equal(baseSell.length, tokens.length);

        buys.length = sells.length = indices.length = 0;

        await convRatesInst.setBaseRate(tokens, baseBuy, baseSell, buys, sells, currentBlock, indices, {from: operator});

        //get base rate - validate data
        var thisSell;
        var thisBuy;
        for (i = 0; i < numTokens; ++i) {
            thisBuy = await convRatesInst.getBasicRate(tokens[i], true);
            thisSell = await convRatesInst.getBasicRate(tokens[i], false);
            assert.equal(thisBuy.valueOf(), baseBuy[i], "wrong base buy rate.");
            assert.equal(thisSell.valueOf(), baseSell[i], "wrong base sell rate.");
        }
    });

    it("should set compact data all tokens then get and verify.", async function () {
        //set compact data
        compactBuyArr1 = [1, 2, 03, 04, 05, 06, 07, 08, 09, 10, 11, 12, 13, 14];
        compactBuyArr2 = [15, 16, 17, 04, 05, 06, 07, 08, 09, 10, 11, 12, 13, 14];
        var compactBuyHex = Helper.bytesToHex(compactBuyArr1);
        buys.push(compactBuyHex);
        compactBuyHex = Helper.bytesToHex(compactBuyArr2);
        buys.push(compactBuyHex);

        compactSellArr1 = [21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34];
        compactSellArr2 = [35, 36, 37, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34];
        var compactSellHex = Helper.bytesToHex(compactSellArr1);
        sells.push(compactSellHex);
        compactSellHex = Helper.bytesToHex(compactSellArr2);
        sells.push(compactSellHex);

        indices[0] = 0;
        indices[1] = 1;

        assert.equal(indices.length, sells.length, "bad array size");
        assert.equal(indices.length, buys.length, "bad array size");

        await convRatesInst.setCompactData(buys, sells, currentBlock, indices, {from: operator});

        //get compact data for all tokens and verify as expected
        for (i = 0; i < numTokens; ++i) {
            var arrIndex = Math.floor (i / 14);
            var fieldIndex = i % 14;
            var compactResArr = await convRatesInst.getCompactData(tokens[i]);
            var compactBuy;
            var compactSell;

            assert.equal(compactResArr[0].valueOf(), arrIndex, "wrong array " + i);
            assert.equal(compactResArr[1].valueOf(), fieldIndex, "wrong field index " + i);
            if (arrIndex == 0) {
                compactBuy = compactBuyArr1;
                compactSell = compactSellArr1;
            }
            else
            {
                compactBuy = compactBuyArr2;
                compactSell = compactSellArr2;
            }
            assert.equal(compactResArr[2].valueOf(), compactBuy[fieldIndex], "wrong buy: " + i);
            assert.equal(compactResArr[3].valueOf(), compactSell[fieldIndex], "wrong sell: " + i);
        }

        //get block number from compact data and verify
        var blockNum = await convRatesInst.getRateUpdateBlock(tokens[3]);

        assert.equal(blockNum, currentBlock, "bad block number returned");

        var blockNum = await convRatesInst.getRateUpdateBlock(tokens[11]);

        assert.equal(blockNum, currentBlock, "bad block number returned");
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
        
        for (var i = 0; i < numTokens; ++i) {
            await convRatesInst.setQtyStepFunction(tokens[i], qtyBuyStepX, qtyBuyStepY, qtySellStepX, qtySellStepY, {from:operator});
            await convRatesInst.setImbalanceStepFunction(tokens[i], imbalanceBuyStepX, imbalanceBuyStepY, imbalanceSellStepX, imbalanceSellStepY, {from:operator});
        }
    });

    it("should get buy rate with update according to compact data update.", async function () {
        var tokenInd = 7;
        var token = tokens[tokenInd]; //choose some token
        var baseBuyRate = await convRatesInst.getBasicRate(token, true);

        // get rate without activating quantity step function (small amount).
        var srcQty = 2;
        var expectedRate = (new BigNumber(baseBuyRate));
        var extraBps = compactBuyArr1[tokenInd] * 10;
        expectedRate = addBps(expectedRate, extraBps);
        var dstQty = new BigNumber(srcQty).mul(expectedRate).div(precisionUnits);
        extraBps = getExtraBpsForBuyQuantity(dstQty);
        expectedRate = addBps(expectedRate, extraBps);
        extraBps = getExtraBpsForImbalanceBuyQuantity(dstQty);
        expectedRate = addBps(expectedRate, extraBps);

        var receivedRate = await convRatesInst.getRate(token, currentBlock, true, srcQty);

        assert.equal(expectedRate.valueOf(), receivedRate.valueOf(), "bad rate");
    });

    it("should get buy rate when compact data has boundary values (-128, 127).", async function () {
        var tokenInd = 7;
        var token = tokens[tokenInd]; //choose some token
        var baseBuyRate = await convRatesInst.getBasicRate(token, true);

        //update compact data
        indices.length = 0;
        indices[0] = 0; // we update 1st cell in compact data
        compactBuyArr1[tokenInd] = -128;
        var compactHex = Helper.bytesToHex(compactBuyArr1);
        buys.length = 0;
        buys.push(compactHex);
        sells.length = 0;
        compactHex = Helper.bytesToHex(compactSellArr1);
        sells.push(compactHex);
        convRatesInst.setCompactData(buys, sells, currentBlock, indices, {from: operator});

        // get rate with the updated compact data.
        var srcQty = 5;
        var expectedRate = (new BigNumber(baseBuyRate));
        var extraBps = compactBuyArr1[tokenInd] * 10;
        expectedRate = addBps(expectedRate, extraBps);
        var dstQty = new BigNumber(srcQty).mul(expectedRate).div(precisionUnits);
        extraBps = getExtraBpsForBuyQuantity(dstQty);
        expectedRate = addBps(expectedRate, extraBps);
        extraBps = getExtraBpsForImbalanceBuyQuantity(dstQty);
        expectedRate = addBps(expectedRate, extraBps);


        var receivedRate = await convRatesInst.getRate(token, currentBlock, true, srcQty);

        assert.equal(expectedRate.valueOf(), receivedRate.valueOf(), "bad rate");

        //update compact data
        compactBuyArr1[tokenInd] = 127;
        var compactHex = Helper.bytesToHex(compactBuyArr1);
        buys.length = 0;
        buys.push(compactHex);
        convRatesInst.setCompactData(buys, sells, currentBlock, indices, {from: operator});

        // get rate without activating quantity step function (small amount).
        var srcQty = 11;
        var expectedRate = (new BigNumber(baseBuyRate));
        var extraBps = compactBuyArr1[tokenInd] * 10;
        expectedRate = addBps(expectedRate, extraBps);
        var dstQty = new BigNumber(srcQty).mul(expectedRate).div(precisionUnits);
        extraBps = getExtraBpsForBuyQuantity(dstQty);
        expectedRate = addBps(expectedRate, extraBps);
        extraBps = getExtraBpsForImbalanceBuyQuantity(dstQty);
        expectedRate = addBps(expectedRate, extraBps);

        var receivedRate = await convRatesInst.getRate(token, currentBlock, true, srcQty);

        assert.equal(expectedRate.valueOf(), receivedRate.valueOf(), "bad rate");
    });

    it("should get buy rate when updating only 2nd cell compact data.", async function () {
        var tokenInd = 16;
        var token = tokens[tokenInd]; //choose some token
        var baseBuyRate = await convRatesInst.getBasicRate(token, true);

        //update compact data
        indices.length = 0;
        indices[0] = 1; // we update 2nd cell in compact data
        compactBuyArr2[tokenInd - 14] = -128;
        var compactHex = Helper.bytesToHex(compactBuyArr2);
        buys.length = 0;
        buys.push(compactHex);
        sells.length = 0;
        compactHex = Helper.bytesToHex(compactSellArr2);
        sells.push(compactHex);
        convRatesInst.setCompactData(buys, sells, currentBlock, indices, {from: operator});

        // get rate without activating quantity step function (small amount).

        // calculate expected rate
        var srcQty = 21;
        var expectedRate = (new BigNumber(baseBuyRate));
        var extraBps = compactBuyArr2[tokenInd - 14] * 10;
        expectedRate = addBps(expectedRate, extraBps);
        var dstQty = new BigNumber(srcQty).mul(expectedRate).div(precisionUnits);
        extraBps = getExtraBpsForBuyQuantity(dstQty);
        expectedRate = addBps(expectedRate, extraBps);
        extraBps = getExtraBpsForImbalanceBuyQuantity(dstQty);
        expectedRate = addBps(expectedRate, extraBps);

        var receivedRate = await convRatesInst.getRate(token, currentBlock, true, srcQty);

        assert.equal(expectedRate.valueOf(), receivedRate.valueOf(), "bad rate");
    });

    it("should get buy rate with compact data and quantity step.", async function () {
        var tokenInd = 11;
        var token = tokens[tokenInd]; //choose some token
        var baseBuyRate = await convRatesInst.getBasicRate(token, true);

        // calculate expected rate
        var srcQty = 17;
        var expectedRate = (new BigNumber(baseBuyRate));
        var extraBps = compactBuyArr1[tokenInd] * 10;
        expectedRate = addBps(expectedRate, extraBps);
        var dstQty = new BigNumber(srcQty).mul(expectedRate).div(precisionUnits);
        extraBps = getExtraBpsForBuyQuantity(dstQty);
        expectedRate = addBps(expectedRate, extraBps);
        extraBps = getExtraBpsForImbalanceBuyQuantity(dstQty);
        expectedRate = addBps(expectedRate, extraBps);

        var receivedRate = await convRatesInst.getRate(token, currentBlock, true, srcQty);

        assert.equal(expectedRate.valueOf(), receivedRate.valueOf(), "bad rate");
    });

    it("should get buy rate quantity step and compact data update with token index > 14.", async function () {
        var tokenInd = 15;
        var token = tokens[tokenInd]; //choose some token
        var baseBuyRate = await convRatesInst.getBasicRate(token, true);

        // get rate
        var srcQty = 24;
        var expectedRate = (new BigNumber(baseBuyRate));
        var extraBps = compactBuyArr2[tokenInd - 14] * 10;
        expectedRate = addBps(expectedRate, extraBps);
        var dstQty = new BigNumber(srcQty).mul(expectedRate).div(precisionUnits);
        extraBps = getExtraBpsForBuyQuantity(dstQty);
        expectedRate = addBps(expectedRate, extraBps);
        extraBps = getExtraBpsForImbalanceBuyQuantity(dstQty);
        expectedRate = addBps(expectedRate, extraBps);

        var receivedRate = await convRatesInst.getRate(token, currentBlock, true, srcQty);

        assert.equal(expectedRate.valueOf(), receivedRate.valueOf(), "bad rate");
    });

    it("should add imbalance. get buy rate with with compact data + quantity step + imbalance step.", async function () {
        var tokenInd = 8;
        var token = tokens[tokenInd]; //choose some token
        var baseBuyRate = await convRatesInst.getBasicRate(token, true);

        // get rate
        var buyQty = 15;
        var imbalance = 95;
        var expectedRate = (new BigNumber(baseBuyRate));
        var extraBps = compactBuyArr1[tokenInd] * 10;
        expectedRate = addBps(expectedRate, extraBps);
        var dstQty = new BigNumber(buyQty).mul(expectedRate).div(precisionUnits);
        //quantity bps
        extraBps = getExtraBpsForBuyQuantity(dstQty);
        expectedRate = addBps(expectedRate, extraBps);
        //imbalance bps
        extraBps = getExtraBpsForImbalanceBuyQuantity(imbalance + (dstQty * 1));
        expectedRate = addBps(expectedRate, extraBps);

        //record imbalance
        await convRatesInst.recordImbalance(token, imbalance, currentBlock, currentBlock, {from: reserveAddress});

        var receivedRate = await convRatesInst.getRate(token, currentBlock, true, buyQty);
        assert.equal(expectedRate.valueOf(), receivedRate.valueOf(), "bad rate");
    });

    it("should add imbalance and get sell rate with with compact data + quantity step + imbalance step.", async function () {
        var tokenInd = 16;
        var token = tokens[tokenInd]; //choose some token
        var baseSellRate = await convRatesInst.getBasicRate(token, false);
        var acceptedDiff = 1;

        // get rate
        var sellQty = 500;
        var imbalance = 1800;
        var expectedRate = (new BigNumber(baseSellRate));
        //calc compact data
        var extraBps = compactSellArr2[tokenInd - 14] * 10;
        expectedRate = addBps(expectedRate, extraBps);
        //calc quantity steps
        extraBps = getExtraBpsForSellQuantity(sellQty);
        expectedRate = addBps(expectedRate, extraBps);
        //calc imbalance steps
        extraBps = getExtraBpsForImbalanceSellQuantity(imbalance - (sellQty * 1));
        expectedRate = addBps(expectedRate, extraBps);

        //record imbalance
        await convRatesInst.recordImbalance(token, imbalance, currentBlock, currentBlock, {from: reserveAddress});

        var receivedRate = await convRatesInst.getRate(token, currentBlock, false, sellQty);

        //round rates a bit

        compareRates(receivedRate, expectedRate);
    });
});

function convertRateToPricingRate (baseRate) {
// conversion rate in pricing is in precision units (10 ** 18) so
// rate 1 to 50 is 50 * 10 ** 18
// rate 50 to 1 is 1 / 50 * 10 ** 18
    return ((new BigNumber(10).pow(18)).mul(baseRate).floor());
};

function getExtraBpsForBuyQuantity(qty) {
    for (var i = 0; i < qtyBuyStepX.length; i++) {
        if (qty <= qtyBuyStepX[i]) return qtyBuyStepY[i];
    }
    return qtyBuyStepY[qtyBuyStepY.length - 1];
};

function getExtraBpsForSellQuantity(qty) {
    for (var i = 0; i < qtySellStepX.length; i++) {
        if (qty <= qtySellStepX[i]) return qtySellStepY[i];
    }
    return qtySellStepY[qtySellStepY.length - 1];
};

function getExtraBpsForImbalanceBuyQuantity(qty) {
    for (var i = 0; i < imbalanceBuyStepX.length; i++) {
        if (qty <= imbalanceBuyStepX[i]) return imbalanceBuyStepY[i];
    }
    return (imbalanceBuyStepY[imbalanceBuyStepY.length - 1]);
};

function getExtraBpsForImbalanceSellQuantity(qty) {
    for (var i = 0; i < imbalanceSellStepX.length; i++) {
        if (qty <= imbalanceSellStepX[i]) return imbalanceSellStepY[i];
    }
    return (imbalanceSellStepY[imbalanceSellStepY.length - 1]);
};

function addBps (rate, bps) {
    return (rate.mul(10000 + bps).div(10000));
};

function compareRates (receivedRate, expectedRate) {
    expectedRate = expectedRate - (expectedRate % 10);
    receivedRate = receivedRate - (receivedRate % 10);
    assert.equal(expectedRate, receivedRate, "different rates");
};