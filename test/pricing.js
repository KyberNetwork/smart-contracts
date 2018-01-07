var Pricing = artifacts.require("./Pricing.sol");
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
var priceUpdateBlock;
var currentBlock = 3000;
var wrapper;
var numTokens = 17;
var tokens = [];
var operator;
var reserveAddress;
var validPriceDurationInBlocks = 1000;
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

var pricingInst;

contract('Pricing', function(accounts) {
    it("should test bytes14.", async function () {
        var arr = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
        var hexArr = bytesToHex(arr);
        var byte;

        wrapper = await Wrapper.new();

        for (var i = 0; i < 14; i++) {
            byte = await wrapper.getInt8FromByte(hexArr, i);
//            console.log("byte " + i + ": " + byte.valueOf());
            assert.equal(byte.valueOf(), arr[i], "bad bytes 14. index: " + i);
        }
    });

    it("should init Pricing Inst and set general parameters.", async function () {
        //init contracts
        pricingInst = await Pricing.new(accounts[0], {gas: 4700000});

        //set pricing general parameters
        pricingInst.setValidPriceDurationInBlocks(validPriceDurationInBlocks);

        //create and add tokens. actually only addresses...
        for (var i = 0; i < numTokens; ++i) {
            token = await TestToken.new("test" + i, "tst" + i, 18);
            tokens[i] = token.address;
            await pricingInst.addToken(token.address);
            await pricingInst.setTokenControlInfo(token.address, minimalRecordResolution, maxPerBlockImbalance, maxTotalImbalance);
            await pricingInst.enableTokenTrade(token.address);
        }

        assert.equal(tokens.length, numTokens, "bad number tokens");

        // set account addresses
        operator = accounts[1];
        reserveAddress = accounts[2];

        await pricingInst.addOperator(operator);
        await pricingInst.setReserveAddress(reserveAddress);
    });

    it("should set base prices for all tokens then get and verify.", async function () {
        // set base price
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

        await pricingInst.setBasePrice(tokens, baseBuy, baseSell, buys, sells, currentBlock, indices, {from: operator});

        //get base price - validate data
        var thisSell;
        var thisBuy;
        for (i = 0; i < numTokens; ++i) {
            thisBuy = await pricingInst.getBasicPrice(tokens[i], true);
            thisSell = await pricingInst.getBasicPrice(tokens[i], false);
            assert.equal(thisBuy.valueOf(), baseBuy[i], "wrong base buy price.");
            assert.equal(thisSell.valueOf(), baseSell[i], "wrong base sell price.");
        }
    });

    it("should set compact data all tokens then get and verify.", async function () {
        //set compact data
        compactBuyArr1 = [1, 2, 03, 04, 05, 06, 07, 08, 09, 10, 11, 12, 13, 14];
        compactBuyArr2 = [15, 16, 17, 04, 05, 06, 07, 08, 09, 10, 11, 12, 13, 14];
        var compactBuyHex = bytesToHex(compactBuyArr1);
        buys.push(compactBuyHex);
        compactBuyHex = bytesToHex(compactBuyArr2);
        buys.push(compactBuyHex);

        compactSellArr1 = [21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34];
        compactSellArr2 = [35, 36, 37, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34];
        var compactSellHex = bytesToHex(compactSellArr1);
        sells.push(compactSellHex);
        compactSellHex = bytesToHex(compactSellArr2);
        sells.push(compactSellHex);

        indices[0] = 0;
        indices[1] = 1;

        assert.equal(indices.length, sells.length, "bad array size");
        assert.equal(indices.length, buys.length, "bad array size");

        await pricingInst.setCompactData(buys, sells, currentBlock, indices, {from: operator});

        //get compact data for all tokens and verify as expected
        for (i = 0; i < numTokens; ++i) {
            var arrIndex = Math.floor (i / 14);
            var fieldIndex = i % 14;
            var compactResArr = await pricingInst.getCompactData(tokens[i]);
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
        var blockNum = await pricingInst.getPriceUpdateBlock(tokens[3]);

        assert.equal(blockNum, currentBlock, "bad block number returned");

        var blockNum = await pricingInst.getPriceUpdateBlock(tokens[11]);

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
            await pricingInst.setQtyStepFunction(tokens[i], qtyBuyStepX, qtyBuyStepY, qtySellStepX, qtySellStepY, {from:operator});
            await pricingInst.setImbalanceStepFunction(tokens[i], imbalanceBuyStepX, imbalanceBuyStepY, imbalanceSellStepX, imbalanceSellStepY, {from:operator});
        }
    });

    it("should get buy price with update according to compact data update.", async function () {
        var tokenInd = 7;
        var token = tokens[tokenInd]; //choose some token
        var baseBuyPrice = await pricingInst.getBasicPrice(token, true);

        // get price without activating quantity step function (small amount).
        var srcQty = 2;
        var expectedPrice = (new BigNumber(baseBuyPrice));
        var extraBps = compactBuyArr1[tokenInd] * 10;
        expectedPrice = addBps(expectedPrice, extraBps);
        var dstQty = new BigNumber(srcQty).mul(expectedPrice).div(precisionUnits);
        extraBps = getExtraBpsForBuyQuantity(dstQty);
        expectedPrice = addBps(expectedPrice, extraBps);
        extraBps = getExtraBpsForImbalanceBuyQuantity(dstQty);
        expectedPrice = addBps(expectedPrice, extraBps);

        var receivedPrice = await pricingInst.getPrice(token, currentBlock, true, srcQty);

        assert.equal(expectedPrice.valueOf(), receivedPrice.valueOf(), "bad price");
    });

    it("should get buy price when compact data has boundary values (-128, 127).", async function () {
        var tokenInd = 7;
        var token = tokens[tokenInd]; //choose some token
        var baseBuyPrice = await pricingInst.getBasicPrice(token, true);

        //update compact data
        indices.length = 0;
        indices[0] = 0; // we update 1st cell in compact data
        compactBuyArr1[tokenInd] = -128;
        var compactHex = bytesToHex(compactBuyArr1);
        buys.length = 0;
        buys.push(compactHex);
        sells.length = 0;
        compactHex = bytesToHex(compactSellArr1);
        sells.push(compactHex);
        pricingInst.setCompactData(buys, sells, currentBlock, indices, {from: operator});

        // get price with the updated compact data.
        var srcQty = 5;
        var expectedPrice = (new BigNumber(baseBuyPrice));
        var extraBps = compactBuyArr1[tokenInd] * 10;
        expectedPrice = addBps(expectedPrice, extraBps);
        var dstQty = new BigNumber(srcQty).mul(expectedPrice).div(precisionUnits);
        extraBps = getExtraBpsForBuyQuantity(dstQty);
        expectedPrice = addBps(expectedPrice, extraBps);
        extraBps = getExtraBpsForImbalanceBuyQuantity(dstQty);
        expectedPrice = addBps(expectedPrice, extraBps);


        var receivedPrice = await pricingInst.getPrice(token, currentBlock, true, srcQty);

        assert.equal(expectedPrice.valueOf(), receivedPrice.valueOf(), "bad price");

        //update compact data
        compactBuyArr1[tokenInd] = 127;
        var compactHex = bytesToHex(compactBuyArr1);
        buys.length = 0;
        buys.push(compactHex);
        pricingInst.setCompactData(buys, sells, currentBlock, indices, {from: operator});

        // get price without activating quantity step function (small amount).
        var srcQty = 11;
        var expectedPrice = (new BigNumber(baseBuyPrice));
        var extraBps = compactBuyArr1[tokenInd] * 10;
        expectedPrice = addBps(expectedPrice, extraBps);
        var dstQty = new BigNumber(srcQty).mul(expectedPrice).div(precisionUnits);
        extraBps = getExtraBpsForBuyQuantity(dstQty);
        expectedPrice = addBps(expectedPrice, extraBps);
        extraBps = getExtraBpsForImbalanceBuyQuantity(dstQty);
        expectedPrice = addBps(expectedPrice, extraBps);

        var receivedPrice = await pricingInst.getPrice(token, currentBlock, true, srcQty);

        assert.equal(expectedPrice.valueOf(), receivedPrice.valueOf(), "bad price");
    });

    it("should get buy price when updating only 2nd cell compact data.", async function () {
        var tokenInd = 16;
        var token = tokens[tokenInd]; //choose some token
        var baseBuyPrice = await pricingInst.getBasicPrice(token, true);

        //update compact data
        indices.length = 0;
        indices[0] = 1; // we update 2nd cell in compact data
        compactBuyArr2[tokenInd - 14] = -128;
        var compactHex = bytesToHex(compactBuyArr2);
        buys.length = 0;
        buys.push(compactHex);
        sells.length = 0;
        compactHex = bytesToHex(compactSellArr2);
        sells.push(compactHex);
        pricingInst.setCompactData(buys, sells, currentBlock, indices, {from: operator});

        // get price without activating quantity step function (small amount).

        // calculate expected price
        var srcQty = 21;
        var expectedPrice = (new BigNumber(baseBuyPrice));
        var extraBps = compactBuyArr2[tokenInd - 14] * 10;
        expectedPrice = addBps(expectedPrice, extraBps);
        var dstQty = new BigNumber(srcQty).mul(expectedPrice).div(precisionUnits);
        extraBps = getExtraBpsForBuyQuantity(dstQty);
        expectedPrice = addBps(expectedPrice, extraBps);
        extraBps = getExtraBpsForImbalanceBuyQuantity(dstQty);
        expectedPrice = addBps(expectedPrice, extraBps);

        var receivedPrice = await pricingInst.getPrice(token, currentBlock, true, srcQty);

        assert.equal(expectedPrice.valueOf(), receivedPrice.valueOf(), "bad price");
    });

    it("should get buy price with compact data and quantity step.", async function () {
        var tokenInd = 11;
        var token = tokens[tokenInd]; //choose some token
        var baseBuyPrice = await pricingInst.getBasicPrice(token, true);

        // calculate expected price
        var srcQty = 17;
        var expectedPrice = (new BigNumber(baseBuyPrice));
        var extraBps = compactBuyArr1[tokenInd] * 10;
        expectedPrice = addBps(expectedPrice, extraBps);
        var dstQty = new BigNumber(srcQty).mul(expectedPrice).div(precisionUnits);
        extraBps = getExtraBpsForBuyQuantity(dstQty);
        expectedPrice = addBps(expectedPrice, extraBps);
        extraBps = getExtraBpsForImbalanceBuyQuantity(dstQty);
        expectedPrice = addBps(expectedPrice, extraBps);

        var receivedPrice = await pricingInst.getPrice(token, currentBlock, true, srcQty);

        assert.equal(expectedPrice.valueOf(), receivedPrice.valueOf(), "bad price");
    });

    it("should get buy price quantity step and compact data update with token index > 14.", async function () {
        var tokenInd = 15;
        var token = tokens[tokenInd]; //choose some token
        var baseBuyPrice = await pricingInst.getBasicPrice(token, true);

        // get price
        var srcQty = 24;
        var expectedPrice = (new BigNumber(baseBuyPrice));
        var extraBps = compactBuyArr2[tokenInd - 14] * 10;
        expectedPrice = addBps(expectedPrice, extraBps);
        var dstQty = new BigNumber(srcQty).mul(expectedPrice).div(precisionUnits);
        extraBps = getExtraBpsForBuyQuantity(dstQty);
        expectedPrice = addBps(expectedPrice, extraBps);
        extraBps = getExtraBpsForImbalanceBuyQuantity(dstQty);
        expectedPrice = addBps(expectedPrice, extraBps);

        var receivedPrice = await pricingInst.getPrice(token, currentBlock, true, srcQty);

        assert.equal(expectedPrice.valueOf(), receivedPrice.valueOf(), "bad price");
    });

    it("should add imbalance. get buy price with with compact data + quantity step + imbalance step.", async function () {
        var tokenInd = 8;
        var token = tokens[tokenInd]; //choose some token
        var baseBuyPrice = await pricingInst.getBasicPrice(token, true);

        // get price
        var buyQty = 15;
        var imbalance = 95;
        var expectedPrice = (new BigNumber(baseBuyPrice));
        var extraBps = compactBuyArr1[tokenInd] * 10;
        expectedPrice = addBps(expectedPrice, extraBps);
        var dstQty = new BigNumber(buyQty).mul(expectedPrice).div(precisionUnits);
        //quantity bps
        extraBps = getExtraBpsForBuyQuantity(dstQty);
        expectedPrice = addBps(expectedPrice, extraBps);
        //imbalance bps
        extraBps = getExtraBpsForImbalanceBuyQuantity(imbalance + (dstQty * 1));
        expectedPrice = addBps(expectedPrice, extraBps);

        //record imbalance
        await pricingInst.recordImbalance(token, imbalance, currentBlock, currentBlock, {from: reserveAddress});

        var receivedPrice = await pricingInst.getPrice(token, currentBlock, true, buyQty);
        assert.equal(expectedPrice.valueOf(), receivedPrice.valueOf(), "bad price");
    });

    it("should add imbalance and get sell price with with compact data + quantity step + imbalance step.", async function () {
        var tokenInd = 16;
        var token = tokens[tokenInd]; //choose some token
        var baseSellPrice = await pricingInst.getBasicPrice(token, false);
        var acceptedDiff = 1;

        // get price
        var sellQty = 500;
        var imbalance = 1800;
        var expectedPrice = (new BigNumber(baseSellPrice));
        //calc compact data
        var extraBps = compactSellArr2[tokenInd - 14] * 10;
        expectedPrice = addBps(expectedPrice, extraBps);
        //calc quantity steps
        extraBps = getExtraBpsForSellQuantity(sellQty);
        expectedPrice = addBps(expectedPrice, extraBps);
        //calc imbalance steps
        extraBps = getExtraBpsForImbalanceSellQuantity(imbalance - (sellQty * 1));
        expectedPrice = addBps(expectedPrice, extraBps);

        //record imbalance
        await pricingInst.recordImbalance(token, imbalance, currentBlock, currentBlock, {from: reserveAddress});

        var receivedPrice = await pricingInst.getPrice(token, currentBlock, false, sellQty);

        //round prices a bit

        comparePrices(receivedPrice, expectedPrice);
    });
});

function bytesToHex(byteArray) {
    var strNum = toHexString(byteArray);
    var num = '0x' + strNum;
    return num;
};

function toHexString(byteArray) {
  return Array.from(byteArray, function(byte) {
    return ('0' + (byte & 0xFF).toString(16)).slice(-2);
  }).join('')
};

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

function addBps (price, bps) {
    return (price.mul(10000 + bps).div(10000));
};

function comparePrices (receivedPrice, expectedPrice) {
    expectedPrice = expectedPrice - (expectedPrice % 10);
    receivedPrice = receivedPrice - (receivedPrice % 10);
    assert.equal(expectedPrice, receivedPrice, "different prices");
};