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
var imbalanceInst;
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
            await pricingInst.enableTokenTrade(token.address);
        }

        assert.equal(tokens.length, numTokens, "bad number tokens");

        // set account addresses
        operator = accounts[1];
        reserveAddress = accounts[2];


        pricingInst.addOperator(operator);
        pricingInst.setReserveAddress(reserveAddress);
    });

    it("should set base prices for all tokens then get and verify.", async function () {
        // set base price
        var baseBuy = [];
        var baseSell = [];
        baseForBuy = 1000;
        baseForSell = 1100;
        for (i = 0; i < numTokens; ++i) {
            baseBuy.push(baseForBuy - i);
            baseSell.push(baseForSell + i);
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
        var compactBuyArr1 = [1, 2, 03, 04, 05, 06, 07, 08, 09, 10, 11, 12, 13, 14];
        var compactBuyArr2 = [15, 16, 17, 04, 05, 06, 07, 08, 09, 10, 11, 12, 13, 14];
        var compactBuyHex = bytesToHex(compactBuyArr1);
        buys.push(compactBuyHex);
        compactBuyHex = bytesToHex(compactBuyArr2);
        buys.push(compactBuyHex);

        var compactSellArr1 = [21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34];
        var compactSellArr2 = [35, 36, 37, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34];
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

//        await pricingInst.setBasePrice()
//
//        await imbalanceInst.setTokenControlInfo(token.address, minimalRecordResolution, maxPerBlockImbalance, maxTotalImbalance);
    });
});

function bytesToHex(byteArray) {
    var strNum = toHexString(byteArray);
//    var num = new BigNumber(strNum, 16);
    var num = '0x' + strNum;
    return num;
};


function toHexString(byteArray) {
  return Array.from(byteArray, function(byte) {
    return ('0' + (byte & 0xFF).toString(16)).slice(-2);
  }).join('')
};