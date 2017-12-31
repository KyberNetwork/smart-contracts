var MockImbalanceRecorder = artifacts.require("./mockContracts/MockImbalanceRecorder.sol");
var TestToken = artifacts.require("./mockContracts/TestToken.sol");

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
var currentBlock;

contract('VolumeImbalanceRecorder', function(accounts) {
    it("should init globals and init VolumeImbalanceRecorder Inst.", async function () {
        //init globals
        imbalanceInst = await MockImbalanceRecorder.new();
        token = await TestToken.new("test", "tst", 18);

        await imbalanceInst.setTokenControlInfo(token.address, minimalRecordResolution, maxPerBlockImbalance, maxTotalImbalance);
    });

    it("should test correct imbalance calculated on updates without block change and without price updates.", async function () {
        currentBlock = 1000;
        priceUpdateBlock = 990;
        var trades = [300, 700, 80, -200, -28];
        var totalBlockImbalance = 0;
        var totalImbalanceSinceUpdate = 0;

        for (var i = 0; i < trades.length; ++i) {
            await imbalanceInst.addTrade(token.address, trades[i], priceUpdateBlock, currentBlock);
            totalBlockImbalance += trades[i];
        }
        totalImbalanceSinceUpdate = totalBlockImbalance;

        var imbalanceArr =  await imbalanceInst.getImbalance(token.address, priceUpdateBlock, currentBlock);

        assert.equal(imbalanceArr[1].valueOf(), totalBlockImbalance, "unexpected last block imbalance.");
        assert.equal(imbalanceArr[0].valueOf(), totalImbalanceSinceUpdate, "unexpected total imbalance.");
    });

    it("should test correct imbalance calculated on updates with block changes and without price updates.", async function () {
        priceUpdateBlock = 1001;
        var lastBlockImbalance = 0;
        var trades = [300, 700, 80, -200, -96, 22];
        var currBlocks = [1010, 1010, 1011, 1080, 1350, 1350];
        var totalImbalanceSinceUpdate = 0;

        assert.equal(trades.length, currBlocks.length, "arrays mismatch");

        for (var i = 0; i < trades.length; ++i) {
            await imbalanceInst.addTrade(token.address, trades[i], priceUpdateBlock, currBlocks[i]);
            if (i > 0 && currBlocks[i] == currBlocks [i-1])
                lastBlockImbalance += trades[i];
            else
                lastBlockImbalance = trades[i];
            totalImbalanceSinceUpdate += trades[i];
        }

        var imbalanceArr =  await imbalanceInst.getImbalance(token.address, priceUpdateBlock, currBlocks[currBlocks.length - 1]);

        assert.equal(imbalanceArr[0].valueOf(), totalImbalanceSinceUpdate, "unexpected total imbalance.");
        assert.equal(imbalanceArr[1].valueOf(), lastBlockImbalance, "unexpected last block imbalance.");

    });

    it("should test correct imbalance calculated on updates with block changes and with price updates.", async function () {
        var lastBlockImbalance = 0;
        var trades =            [100, 500, 64, -480, -6, 64, 210];
        var currBlocks =        [2000, 2000, 2001, 2002, 2300, 2301, 2350];
        var priceUpdateBlocks = [2000, 2000, 2000, 2000, 2300, 2300, 2300];
        var totalImbalanceSinceUpdate = 0;

        assert.equal(trades.length, currBlocks.length, "arrays mismatch");
        assert.equal(trades.length, priceUpdateBlocks.length, "arrays mismatch");

        for (var i = 0; i < trades.length; ++i) {
            await imbalanceInst.addTrade(token.address, trades[i], priceUpdateBlocks[i], currBlocks[i]);
            if (i > 0 && (currBlocks[i] == currBlocks [i-1]))
                lastBlockImbalance += trades[i];
            else
                lastBlockImbalance = trades[i];

            if (i > 0 && (priceUpdateBlocks [i] > priceUpdateBlocks[i-1]))
                totalImbalanceSinceUpdate = trades[i];
            else
                totalImbalanceSinceUpdate += trades[i];
        }

        console.log("expected total imbalance " + totalImbalanceSinceUpdate + "current block: " + currBlocks[currBlocks.length - 1]);

        var imbalanceArr =  await imbalanceInst.getImbalance(token.address,
                                                             priceUpdateBlocks[priceUpdateBlocks.length - 1],
                                                             currBlocks[currBlocks.length - 1]);

        assert.equal(imbalanceArr[0].valueOf(), totalImbalanceSinceUpdate, "unexpected total imbalance.");
        assert.equal(imbalanceArr[1].valueOf(), lastBlockImbalance, "unexpected last block imbalance.");
    });

    it("should test correct imbalance calculated on updates with block changes and with price updates in middle of block.", async function () {
        var lastBlockImbalance = 0;
        var trades =            [160, 620, 64, -480, -6, 64, 210];
        var currBlocks =        [6000, 6001, 6001, 6002, 6002, 6002, 6002];
        var priceUpdateBlocks = [6000, 6000, 6000, 6000, 6000, 6002, 6002];
        var totalImbalanceSinceUpdate = 0;

        assert.equal(trades.length, currBlocks.length, "arrays mismatch");
        assert.equal(trades.length, priceUpdateBlocks.length, "arrays mismatch");

        for (var i = 0; i < trades.length; ++i) {
            await imbalanceInst.addTrade(token.address, trades[i], priceUpdateBlocks[i], currBlocks[i]);
            if (i > 0 && (currBlocks[i] == currBlocks [i-1]))
                lastBlockImbalance += trades[i];
            else
                lastBlockImbalance = trades[i];

            if (i > 0 && (priceUpdateBlocks [i] > priceUpdateBlocks[i-1])) {
                if (priceUpdateBlocks[i] = currBlocks[i])
                    totalImbalanceSinceUpdate = lastBlockImbalance;
                else
                    totalImbalanceSinceUpdate = trades[i];
            }
            else
                totalImbalanceSinceUpdate += trades[i];
        }

        var imbalanceArr =  await imbalanceInst.getImbalance(token.address,
                                                             priceUpdateBlocks[priceUpdateBlocks.length - 1],
                                                             currBlocks[currBlocks.length - 1]);

        assert.equal(imbalanceArr[0].valueOf(), totalImbalanceSinceUpdate, "unexpected total imbalance.");
        assert.equal(imbalanceArr[1].valueOf(), lastBlockImbalance, "unexpected last block imbalance.");
    });

//    it("should test when crossing total buy imbalance trade reverted.", async function () {
//        var maxAllowedImbalance = await imbalanceInst.getMaxTotalImbalance(token.address);
//        var perBlockImbalance = (await imbalanceInst.getMaxPerBlockImbalance(token.address)) >>> 0;
//        var currentBlock = 7000;
//        var tradeSoFar = 0 >>> 0;
//
//        while ((tradeSoFar + perBlockImbalance) <= maxAllowedImbalance){
//            await imbalanceInst.addTrade(token.address, perBlockImbalance, 7000, currentBlock);
//            currentBlock += 1;
//            tradeSoFar += perBlockImbalance;
//        }
//
//        console.log ("tradeSoFar: " + tradeSoFar + " max imbalance: " + maxAllowedImbalance);
//        try {
//            await imbalanceInst.addTrade(token.address, perBlockImbalance, 7000, currentBlock);
//            assert(false, "expected to throw error in line above.");
//        } catch(e){
//            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//        }
//
//        var imbalanceArr =  await imbalanceInst.getImbalance(token.address, priceUpdateBlock, currBlocks[currBlocks.length - 1]);
//
//        assert.equal(imbalanceArr[0].valueOf(), tradeSoFar, "unexpected total imbalance.");
//        assert.equal(imbalanceArr[1].valueOf(), perBlockImbalance, "unexpected last block imbalance.");
//    });

});
