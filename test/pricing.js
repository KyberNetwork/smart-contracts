var Pricing = artifacts.require("./Pricing.sol");
var TestToken = artifacts.require("./mockContracts/TestToken.sol");
var Wrapper = artifacts.require("./mockContracts/Wrapper.sol");

var Helper = require("./helper.js");
var BigNumber = require('bignumber.js');

//global variables
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
        pricingInst = await Pricing.new(accounts[0], {gas: 5000000});

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
        baseBuyRate = 1000;
        baseSellRate = 1100;
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
    });

    it("should set step functions qty and imbalance.", async function () {
        qtyBuyStepX = [15, 30, 70];
        qtyBuyStepY = [0, 30, 70];
        qtySellStepX = [155, 305, 705];
        qtySellStepY = [0, 32, 70];
        imbalanceBuyStepX = [180, 330, 900, 1500];
        imbalanceBuyStepY = [0, 150, 310, 1100];
        imbalanceSellStepX = [1500, 3000, 7000, 30000];
        imbalanceSellStepY = [0, 150, 310, 1200];
        
        for (var i = 0; i < numTokens; ++i) {
            await pricingInst.setQtyStepFunction(tokens[i], qtyBuyStepX, qtyBuyStepY, qtySellStepX, qtySellStepY, {from:operator});
            await pricingInst.setImbalanceStepFunction(tokens[i], imbalanceBuyStepX, imbalanceBuyStepY, imbalanceSellStepX, imbalanceSellStepY, {from:operator});
        }
    });

    it("should perform a single buy and see price updated according to compact data update.", async function () {
        var tokenInd = 7;
        var token = tokens[tokenInd]; //choose some token
        var baseBuyPrice = await pricingInst.getBasicPrice(token, true);
        var baseSellPrice = await pricingInst.getBasicPrice(token, false);

        // get price without activating quantity step function (small amount).
        var buyQty = 5;
        var expectedPrice = (new BigNumber(baseBuyPrice)).mul(1000 + compactBuyArr1[tokenInd]).div(1000);
        var receivedPrice = await pricingInst.getPrice(token, currentBlock, true, buyQty);

        assert.equal(expectedPrice.valueOf(), receivedPrice.valueOf(), "bad price");
    });

    it("should perform a single buy and see price update with compact data and quantity step.", async function () {
        var tokenInd = 11;
        var token = tokens[tokenInd]; //choose some token
        var baseBuyPrice = await pricingInst.getBasicPrice(token, true);
        var baseSellPrice = await pricingInst.getBasicPrice(token, false);

        // get price
        var buyQty = 17;
        var expectedPrice = (new BigNumber(baseBuyPrice));
        var extraBps = compactBuyArr1[tokenInd] * 10;
        expectedPrice = addBps(expectedPrice, extraBps);
        extraBps = getExtraBpsForBuyQuantity(buyQty);
        expectedPrice = addBps(expectedPrice, extraBps);

        var receivedPrice = await pricingInst.getPrice(token, currentBlock, true, buyQty);

        assert.equal(expectedPrice.valueOf(), receivedPrice.valueOf(), "bad price");
    });

    it("should add imbalance and perform a single buy and see price update with compact data and quantity step.", async function () {
        var tokenInd = 16;
        var token = tokens[tokenInd]; //choose some token
        var baseBuyPrice = await pricingInst.getBasicPrice(token, true);
        var baseSellPrice = await pricingInst.getBasicPrice(token, false);

        // get price
        var buyQty = 100;
        var imbalance = 400;
        var expectedPrice = (new BigNumber(baseBuyPrice));
        var extraBps = compactBuyArr2[tokenInd - 14] * 10;
        expectedPrice = addBps(expectedPrice, extraBps);
        extraBps = getExtraBpsForBuyQuantity(buyQty);
        expectedPrice = addBps(expectedPrice, extraBps);

        extraBps = getExtraBpsForImbalanceBuyQuantity(imbalance);
        expectedPrice = addBps(expectedPrice, extraBps);

        //record imbalance
        await pricingInst.recoredImbalance(token, imbalance, currentBlock, currentBlock, {from: reserveAddress});

        var receivedPrice = await pricingInst.getPrice(token, currentBlock, true, buyQty);

        assert.equal(expectedPrice.valueOf(), receivedPrice.valueOf(), "bad price");
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

function getExtraBpsForImbalanceBuyQuantity(qty) {
    for (var i = 0; i < imbalanceBuyStepX.length; i++) {
        if (qty <= imbalanceBuyStepX[i]) return imbalanceBuyStepY[i];
    }
    return (imbalanceBuyStepY[imbalanceBuyStepY.length - 1]);
};

function addBps (price, bps) {
    return (price.mul(10000 + bps).div(10000));
};