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
    it("should init globals and init VolumeImbalanceRecorder Inst.", async function() {
        //init globals
        imbalanceInst = await MockImbalanceRecorder.new(accounts[0]);
        token = await TestToken.new("test", "tst", 18);

        await imbalanceInst.setTokenControlInfo(token.address, minimalRecordResolution, maxPerBlockImbalance, maxTotalImbalance);
    });

    it("should test set functions revert for non admin.", async function() {

        try {
            await imbalanceInst.setTokenControlInfo(token.address, minimalRecordResolution,
                                                    maxPerBlockImbalance, maxTotalImbalance, {from:accounts[1]});
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("should test internal get functions.", async function() {
        //init globals
        imbalanceInst = await MockImbalanceRecorder.new(accounts[0]);
        token = await TestToken.new("test", "tst", 18);

        await imbalanceInst.setTokenControlInfo(token.address, minimalRecordResolution, maxPerBlockImbalance, maxTotalImbalance);

        //get token control info
        var controlInfoArr = await imbalanceInst.getTokenControlInfo(token.address);

        assert.equal(controlInfoArr[0].valueOf(), minimalRecordResolution, "unexpected minimal record resolution.");
        assert.equal(controlInfoArr[1].valueOf(), maxPerBlockImbalance, "unexpected maxPerBlockImbalance.");
        assert.equal(controlInfoArr[2].valueOf(), maxTotalImbalance, "maxTotalImbalance");

        var getMaxPerBlock = await imbalanceInst.getMaxBlockImbalance(token.address);
        assert.equal(getMaxPerBlock, maxPerBlockImbalance, "unexpected maxPerBlockImbalance.");

        var getMaxTotal = await imbalanceInst.getMaxImbalance(token.address);
        assert.equal(getMaxTotal, maxTotalImbalance, "maxTotalImbalance");
    });

    it("should test correct imbalance calculated on updates without block change and without price updates.", async function() {
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

        var imbalanceArr =  await imbalanceInst.getMockImbalance(token.address, priceUpdateBlock, currentBlock);

        assert.equal(imbalanceArr[1].valueOf(), totalBlockImbalance, "unexpected last block imbalance.");
        assert.equal(imbalanceArr[0].valueOf(), totalImbalanceSinceUpdate, "unexpected total imbalance.");
    });

    it("should test correct imbalance calculated on updates with block changes and without price updates.", async function() {
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

        var imbalanceArr =  await imbalanceInst.getMockImbalance(token.address, priceUpdateBlock, currBlocks[currBlocks.length - 1]);

        assert.equal(imbalanceArr[0].valueOf(), totalImbalanceSinceUpdate, "unexpected total imbalance.");
        assert.equal(imbalanceArr[1].valueOf(), lastBlockImbalance, "unexpected last block imbalance.");

    });

    it("should test correct imbalance calculated on updates with block changes and with price updates.", async function() {
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

        var imbalanceArr =  await imbalanceInst.getMockImbalance(token.address,
                                                             priceUpdateBlocks[priceUpdateBlocks.length - 1],
                                                             currBlocks[currBlocks.length - 1]);

        assert.equal(imbalanceArr[0].valueOf(), totalImbalanceSinceUpdate, "unexpected total imbalance.");
        assert.equal(imbalanceArr[1].valueOf(), lastBlockImbalance, "unexpected last block imbalance.");
    });

    it("should test correct imbalance calculated on updates with block changes and with price updates in middle of block.", async function() {
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

        var imbalanceArr =  await imbalanceInst.getMockImbalance(token.address,
                                                             priceUpdateBlocks[priceUpdateBlocks.length - 1],
                                                             currBlocks[currBlocks.length - 1]);

        assert.equal(imbalanceArr[0].valueOf(), totalImbalanceSinceUpdate, "unexpected total imbalance.");
        assert.equal(imbalanceArr[1].valueOf(), lastBlockImbalance, "unexpected last block imbalance.");
    });

    it("should test correct imbalance calculated when minimal resolution is a non dividable number.", async function() {
        var lastBlockImbalance = 0;
        var trades =            [160, 620, 64, -480, -6, 64, 210];
        var currBlocks =        [6000, 6001, 6001, 6002, 6002, 6002, 6002];
        var priceUpdateBlocks = [6000, 6000, 6000, 6000, 6000, 6002, 6002];
        var totalImbalanceSinceUpdate = 0;

        assert.equal(trades.length, currBlocks.length, "arrays mismatch");
        assert.equal(trades.length, priceUpdateBlocks.length, "arrays mismatch");

        //create new instance
        var imbalanceInst2 = await MockImbalanceRecorder.new(accounts[0]);

        //set even resolution
        newRecordResolution = 13;
        await imbalanceInst2.setTokenControlInfo(token.address, newRecordResolution, maxPerBlockImbalance, maxTotalImbalance);

        for (var i = 0; i < trades.length; ++i) {
            await imbalanceInst2.addTrade(token.address, trades[i], priceUpdateBlocks[i], currBlocks[i]);
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

        var imbalanceArr =  await imbalanceInst2.getMockImbalance(token.address,
                                                             priceUpdateBlocks[priceUpdateBlocks.length - 1],
                                                             currBlocks[currBlocks.length - 1]);

        assert(((imbalanceArr[0].valueOf() < totalImbalanceSinceUpdate + newRecordResolution) &&
                (imbalanceArr[0].valueOf() > totalImbalanceSinceUpdate - newRecordResolution)), "unexpected total imbalance.");
        assert(((imbalanceArr[1].valueOf() < lastBlockImbalance + newRecordResolution) &&
                (imbalanceArr[1].valueOf() > lastBlockImbalance - newRecordResolution)), "unexpected last block imbalance.");
    });

    it("should test scenario of price update mined late and some previous blocks should be recorded.", async function() {
        var trades =            [162, 621, 63, -480, -6];
        var currBlocks =        [20, 30, 32, 33, 34];
        var priceUpdateBlocks = [10, 10, 10, 10, 30];
        var totalImbalanceSinceUpdate = 0;
        var lastBlockImbalance = 0;

        var lastPriceUpdateBlock = priceUpdateBlocks[priceUpdateBlocks.length - 1];

        assert.equal(trades.length, currBlocks.length, "arrays mismatch");
        assert.equal(trades.length, priceUpdateBlocks.length, "arrays mismatch");

        //create new instance
        var imbalanceInst3 = await MockImbalanceRecorder.new(accounts[0]);
        var newRecordResolution = 3;
        await imbalanceInst3.setTokenControlInfo(token.address, newRecordResolution, maxPerBlockImbalance, maxTotalImbalance);

        for (var i = 0; i < trades.length; ++i) {
           await imbalanceInst3.addTrade(token.address, trades[i], priceUpdateBlocks[i], currBlocks[i]);
           if (i > 0 && (currBlocks[i] == currBlocks [i-1]))
               lastBlockImbalance += trades[i];
           else
               lastBlockImbalance = trades[i];

           if (currBlocks[i] >= lastPriceUpdateBlock) {
               totalImbalanceSinceUpdate += trades[i];
           }
        }

        var imbalanceArr =  await imbalanceInst3.getMockImbalance(token.address,
                                                            lastPriceUpdateBlock,
                                                            currBlocks[currBlocks.length - 1]);

        assert.equal(imbalanceArr[0].valueOf(), totalImbalanceSinceUpdate.valueOf(), "unexpected total imbalance.");
        assert.equal(imbalanceArr[1].valueOf(), lastBlockImbalance, "unexpected last block imbalance.");
    });

    it("should test scenario of crossing max buy imbalance.", async function() {
        var maxAllowedImbalance = await imbalanceInst.getMaxImbalance(token.address);
        var perBlockImbalance = (await imbalanceInst.getMaxBlockImbalance(token.address)) >>> 0;
        var currentBlock = priceUpdateBlock = 7000;
        var tradeSoFar = 0 >>> 0;

        while ((tradeSoFar + perBlockImbalance) <= maxAllowedImbalance) {
            await imbalanceInst.addTrade(token.address, perBlockImbalance, priceUpdateBlock, currentBlock);
            currentBlock += 1;
            tradeSoFar += perBlockImbalance;
        }

        perBlockImbalance += 800;

        await imbalanceInst.addTrade(token.address, perBlockImbalance, priceUpdateBlock, currentBlock);
        tradeSoFar += perBlockImbalance;

        var imbalanceArr =  await imbalanceInst.getMockImbalance(token.address, priceUpdateBlock, currentBlock);

        assert.equal(imbalanceArr[0].valueOf(), tradeSoFar, "unexpected total imbalance.");
        assert.equal(imbalanceArr[1].valueOf(), perBlockImbalance, "unexpected last block imbalance.");
    });

    it("should test get imbalance in range.", async function() {
        var trades =            [160, 620, 64, -480, -6, 64, 210, 300];
        var currBlocks =        [6000, 6001, 6001, 6002, 6002, 6002, 6007, 6008];
        var priceUpdateBlocks = [6000, 6000, 6000, 6000, 6000, 6000, 6000, 6000];
        var totalImbalanceInRange = 0;
        var firstGetBlock = 6001;
        var lastGetBlock = 6007

        assert.equal(trades.length, currBlocks.length, "arrays mismatch");
        assert.equal(trades.length, priceUpdateBlocks.length, "arrays mismatch");

        //create new instance
        var imbalanceInst2 = await MockImbalanceRecorder.new(accounts[0]);

        //set even resolution
        newRecordResolution = 2;
        await imbalanceInst2.setTokenControlInfo(token.address, newRecordResolution, maxPerBlockImbalance, maxTotalImbalance);

        for (var i = 0; i < trades.length; ++i) {
            await imbalanceInst2.addTrade(token.address, trades[i], priceUpdateBlocks[i], currBlocks[i]);

            if ((currBlocks[i] >= firstGetBlock) && (currBlocks[i] <= lastGetBlock)) {
                totalImbalanceInRange += trades[i];
           }
        }

        var imbalanceInRange = await imbalanceInst2.getMockImbalanceInRange(token.address, firstGetBlock, lastGetBlock);

        assert.equal((imbalanceInRange.valueOf() * newRecordResolution), totalImbalanceInRange, "unexpected total imbalance.");
    });

    it("should test record resolution influence under un convinient conditions.", async function() {
        var trade = 16;
        var currentBlock = priceUpdateBlock = 20000;
        var totalImbalanceSinceUpdate = 0;

        //create new instance
        var imbalanceInst2 = await MockImbalanceRecorder.new(accounts[0]);

        //set even resolution
        newRecordResolution = 17; //trade + 1
        await imbalanceInst2.setTokenControlInfo(token.address, newRecordResolution, maxPerBlockImbalance, maxTotalImbalance);

        for (var i = 0; i < 100; ++i) {
            await imbalanceInst2.addTrade(token.address, trade, priceUpdateBlock, currentBlock ++);

            totalImbalanceSinceUpdate += trade;
        }

        var imbalanceArr = await imbalanceInst2.getMockImbalance(token.address, priceUpdateBlock, currentBlock);

        console.log("reported imbalance: " + imbalanceArr[0].valueOf() + "accurate imbalance: " + totalImbalanceSinceUpdate);

        assert(((imbalanceArr[0].valueOf() < totalImbalanceSinceUpdate + newRecordResolution) &&
                (imbalanceArr[0].valueOf() > totalImbalanceSinceUpdate - newRecordResolution)), "unexpected total imbalance.");
    });

});
