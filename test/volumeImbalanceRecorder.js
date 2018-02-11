let MockImbalanceRecorder = artifacts.require("./mockContracts/MockImbalanceRecorder.sol");
let TestToken = artifacts.require("./mockContracts/TestToken.sol");

let Helper = require("./helper.js");
let BigNumber = require('bignumber.js');

//global variables
let token;
let minimalRecordResolution = 2; //low resolution so I don't lose too much data. then easier to compare calculated imbalance values.
let maxPerBlockImbalance = 4000;
let maxTotalImbalance = maxPerBlockImbalance * 12;
let imbalanceInst;
let admin;
let priceUpdateBlock;
let currentBlock;

contract('VolumeImbalanceRecorder', function(accounts) {
    it("should init globals and init VolumeImbalanceRecorder Inst.", async function() {
        //init globals
        admin = accounts[0];
        imbalanceInst = await MockImbalanceRecorder.new(admin);
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
        imbalanceInst = await MockImbalanceRecorder.new(admin);
        token = await TestToken.new("test", "tst", 18);

        await imbalanceInst.setTokenControlInfo(token.address, minimalRecordResolution, maxPerBlockImbalance, maxTotalImbalance);

        //get token control info
        let controlInfoArr = await imbalanceInst.getTokenControlInfo(token.address);

        assert.equal(controlInfoArr[0].valueOf(), minimalRecordResolution, "unexpected minimal record resolution.");
        assert.equal(controlInfoArr[1].valueOf(), maxPerBlockImbalance, "unexpected maxPerBlockImbalance.");
        assert.equal(controlInfoArr[2].valueOf(), maxTotalImbalance, "maxTotalImbalance");

        let getMaxPerBlock = await imbalanceInst.getMaxBlockImbalance(token.address);
        assert.equal(getMaxPerBlock, maxPerBlockImbalance, "unexpected maxPerBlockImbalance.");

        let getMaxTotal = await imbalanceInst.getMaxImbalance(token.address);
        assert.equal(getMaxTotal, maxTotalImbalance, "maxTotalImbalance");
    });

    it("should test encode / decode of token imbalance data.", async function() {
//        struct TokenImbalanceData {
//            int  lastBlockBuyUnitsImbalance;
//            uint lastBlock;
//
//            int  totalBuyUnitsImbalance;
//            uint lastPriceUpdateBlock;
//        }

        let bytes = [];
        bytes.length = 32;
        bytes[0] = 1;
        bytes[8] = 2;
        bytes[16] = 3;
        bytes[24] = 4;
        let startIntStr = Helper.bytesToHex(bytes);
        let startInt = (new BigNumber(Helper.bytesToHex(bytes)));
        let toStruct = await imbalanceInst.callDecodeTokenImbalanceData(startInt);

        let toInt = await imbalanceInst.callEncodeTokenImbalanceData(toStruct[0], toStruct[1], toStruct[2], toStruct[3]);

        assert.equal(startInt.valueOf(), toInt.valueOf(), "conversion failed");

        //test negative values.
        for (let i = 0; i < 32; ++i){
            bytes[i] = 0xff;
        }
        bytes[7] = -32;
        bytes[15] = -15;
        bytes[23] = -55;
        bytes[24] = -1002;
        startIntStr = Helper.bytesToHex(bytes);
        startInt = (new BigNumber(Helper.bytesToHex(bytes)));
        toStruct = await imbalanceInst.callDecodeTokenImbalanceData(startInt);

        toInt = await imbalanceInst.callEncodeTokenImbalanceData(toStruct[0], toStruct[1], toStruct[2], toStruct[3]);
        assert.equal(startInt.valueOf(), toInt.valueOf(), "conversion failed");
    });

    it("should test variable range for encode / decode of token imbalance data.", async function() {
    //        struct TokenImbalanceData {
    //            int  lastBlockBuyUnitsImbalance;
    //            uint lastBlock;
    //
    //            int  totalBuyUnitsImbalance;
    //            uint lastPriceUpdateBlock;
    //        }

        let pow_2_64 = (new BigNumber(2).pow(64).div(1));
        let pow_2_64_div2 = (new BigNumber(2).pow(64).div(2));
        let neg_pow_2_64_div2 = (new BigNumber(2).pow(64).div(2).mul(-1));

        let startStruct = [pow_2_64_div2.sub(1), pow_2_64.sub(1), pow_2_64_div2.sub(1), pow_2_64.sub(1)];

        let toInt = await imbalanceInst.callEncodeTokenImbalanceData(startStruct[0], startStruct[1], startStruct[2], startStruct[3]);

        let toStruct = await imbalanceInst.callDecodeTokenImbalanceData(toInt);

        for(let i =0; i < 4; i++){
            assert.equal(startStruct[i].valueOf(), toStruct[i].valueOf(), "array cell: " + i + " not equal");
        }

        startStruct = [neg_pow_2_64_div2.add(1), pow_2_64.sub(1), neg_pow_2_64_div2.add(1), pow_2_64.sub(1)];

        toInt = await imbalanceInst.callEncodeTokenImbalanceData(startStruct[0], startStruct[1], startStruct[2], startStruct[3]);

        toStruct = await imbalanceInst.callDecodeTokenImbalanceData(toInt);

        for(let i =0; i < 4; i++){
            assert.equal(startStruct[i].valueOf(), toStruct[i].valueOf(), "array cell: " + i + " not equal");
        }

    });


    it("should test correct negative imbalance calculated on updates without block change and without price updates.", async function() {
        currentBlock = 1002;
        priceUpdateBlock = 1001;
        let trades = [-200, -28];
        let totalBlockImbalance = 0;
        let totalImbalanceSinceUpdate = 0;

        for (let i = 0; i < trades.length; ++i) {
            await imbalanceInst.addTrade(token.address, trades[i], priceUpdateBlock, currentBlock);
            totalBlockImbalance += trades[i];
        }
        totalImbalanceSinceUpdate = totalBlockImbalance;

        let imbalanceArr =  await imbalanceInst.getMockImbalance(token.address, priceUpdateBlock, currentBlock);

        assert.equal(imbalanceArr[1].valueOf(), totalBlockImbalance, "unexpected last block imbalance.");
        assert.equal(imbalanceArr[0].valueOf(), totalImbalanceSinceUpdate, "unexpected total imbalance.");
    });

    it("should test correct imbalance calculated on updates with block changes and without price updates.", async function() {
        priceUpdateBlock = 1007;
        let lastBlockImbalance = 0;
        let trades = [300, 700, 80, -200, -96, 22];
        let currBlocks = [1010, 1010, 1011, 1080, 1350, 1350];
        let totalImbalanceSinceUpdate = 0;

        assert.equal(trades.length, currBlocks.length, "arrays mismatch");

        for (let i = 0; i < trades.length; ++i) {
            await imbalanceInst.addTrade(token.address, trades[i], priceUpdateBlock, currBlocks[i]);
            if (i > 0 && currBlocks[i] == currBlocks [i-1])
                lastBlockImbalance += trades[i];
            else
                lastBlockImbalance = trades[i];
            totalImbalanceSinceUpdate += trades[i];
        }

        let imbalanceArr =  await imbalanceInst.getMockImbalance(token.address, priceUpdateBlock, currBlocks[currBlocks.length - 1]);

        assert.equal(imbalanceArr[0].valueOf(), totalImbalanceSinceUpdate, "unexpected total imbalance.");
        assert.equal(imbalanceArr[1].valueOf(), lastBlockImbalance, "unexpected last block imbalance.");
    });

    it("should test correct imbalance calculated on updates with block changes and with price updates.", async function() {
        let lastBlockImbalance = 0;
        let trades =            [100, 500, 64, -480, -6, 64, 210];
        let currBlocks =        [2000, 2000, 2001, 2002, 2300, 2301, 2350];
        let priceUpdateBlocks = [2000, 2000, 2000, 2000, 2300, 2300, 2300];
        let totalImbalanceSinceUpdate = 0;

        assert.equal(trades.length, currBlocks.length, "arrays mismatch");
        assert.equal(trades.length, priceUpdateBlocks.length, "arrays mismatch");

        for (let i = 0; i < trades.length; ++i) {
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

        let imbalanceArr =  await imbalanceInst.getMockImbalance(token.address,
                                                             priceUpdateBlocks[priceUpdateBlocks.length - 1],
                                                             currBlocks[currBlocks.length - 1]);

        assert.equal(imbalanceArr[0].valueOf(), totalImbalanceSinceUpdate, "unexpected total imbalance.");
        assert.equal(imbalanceArr[1].valueOf(), lastBlockImbalance, "unexpected last block imbalance.");
    });

    it("should test correct imbalance calculated on updates with block changes and with price updates in middle of block.", async function() {
        let lastBlockImbalance = 0;
        let trades =            [160, 620, 64, -480, -6, 64, 210];
        let currBlocks =        [6000, 6001, 6001, 6002, 6002, 6002, 6002];
        let priceUpdateBlocks = [6000, 6000, 6000, 6000, 6000, 6002, 6002];
        let totalImbalanceSinceUpdate = 0;

        assert.equal(trades.length, currBlocks.length, "arrays mismatch");
        assert.equal(trades.length, priceUpdateBlocks.length, "arrays mismatch");

        for (let i = 0; i < trades.length; ++i) {
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

        let imbalanceArr =  await imbalanceInst.getMockImbalance(token.address,
                                                             priceUpdateBlocks[priceUpdateBlocks.length - 1],
                                                             currBlocks[currBlocks.length - 1]);

        assert.equal(imbalanceArr[0].valueOf(), totalImbalanceSinceUpdate, "unexpected total imbalance.");
        assert.equal(imbalanceArr[1].valueOf(), lastBlockImbalance, "unexpected last block imbalance.");
    });

    it("should test correct imbalance calculated when minimal resolution is a non dividable number.", async function() {
        let lastBlockImbalance = 0;
        let trades =            [160, 620, 64, -480, -6, 64, 210];
        let currBlocks =        [6000, 6001, 6001, 6002, 6002, 6002, 6002];
        let priceUpdateBlocks = [6000, 6000, 6000, 6000, 6000, 6002, 6002];
        let totalImbalanceSinceUpdate = 0;

        assert.equal(trades.length, currBlocks.length, "arrays mismatch");
        assert.equal(trades.length, priceUpdateBlocks.length, "arrays mismatch");

        //create new instance
        let imbalanceInst2 = await MockImbalanceRecorder.new(admin);

        //set even resolution
        newRecordResolution = 13;
        await imbalanceInst2.setTokenControlInfo(token.address, newRecordResolution, maxPerBlockImbalance, maxTotalImbalance);

        for (let i = 0; i < trades.length; ++i) {
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

        let imbalanceArr =  await imbalanceInst2.getMockImbalance(token.address,
                                                             priceUpdateBlocks[priceUpdateBlocks.length - 1],
                                                             currBlocks[currBlocks.length - 1]);

        assert(((imbalanceArr[0].valueOf() < totalImbalanceSinceUpdate + newRecordResolution) &&
                (imbalanceArr[0].valueOf() > totalImbalanceSinceUpdate - newRecordResolution)), "unexpected total imbalance.");
        assert(((imbalanceArr[1].valueOf() < lastBlockImbalance + newRecordResolution) &&
                (imbalanceArr[1].valueOf() > lastBlockImbalance - newRecordResolution)), "unexpected last block imbalance.");
    });

    it("should test scenario of price update mined late and some previous blocks should be recorded.", async function() {
        let trades =            [162, 621, 63, -480, -6];
        let currBlocks =        [20, 30, 32, 33, 34];
        let priceUpdateBlocks = [10, 10, 10, 10, 30];
        let totalImbalanceSinceUpdate = 0;
        let lastBlockImbalance = 0;

        let lastPriceUpdateBlock = priceUpdateBlocks[priceUpdateBlocks.length - 1];

        assert.equal(trades.length, currBlocks.length, "arrays mismatch");
        assert.equal(trades.length, priceUpdateBlocks.length, "arrays mismatch");

        //create new instance
        let imbalanceInst3 = await MockImbalanceRecorder.new(admin);
        let newRecordResolution = 3;
        await imbalanceInst3.setTokenControlInfo(token.address, newRecordResolution, maxPerBlockImbalance, maxTotalImbalance);

        for (let i = 0; i < trades.length; ++i) {
           await imbalanceInst3.addTrade(token.address, trades[i], priceUpdateBlocks[i], currBlocks[i]);
           if (i > 0 && (currBlocks[i] == currBlocks [i-1]))
               lastBlockImbalance += trades[i];
           else
               lastBlockImbalance = trades[i];

           if (currBlocks[i] >= lastPriceUpdateBlock) {
               totalImbalanceSinceUpdate += trades[i];
           }
        }

        let imbalanceArr =  await imbalanceInst3.getMockImbalance(token.address,
                                                            lastPriceUpdateBlock,
                                                            currBlocks[currBlocks.length - 1]);

        assert.equal(imbalanceArr[1].valueOf(), lastBlockImbalance, "unexpected last block imbalance.");
        assert.equal(imbalanceArr[0].valueOf(), totalImbalanceSinceUpdate.valueOf(), "unexpected total imbalance.");

    });

    it("should test scenario of crossing max buy imbalance.", async function() {
        let maxAllowedImbalance = await imbalanceInst.getMaxImbalance(token.address);
        let perBlockImbalance = (await imbalanceInst.getMaxBlockImbalance(token.address)) >>> 0;
        let currentBlock = priceUpdateBlock = 7000;
        let tradeSoFar = 0 >>> 0;

        while ((tradeSoFar + perBlockImbalance) <= maxAllowedImbalance) {
            await imbalanceInst.addTrade(token.address, perBlockImbalance, priceUpdateBlock, currentBlock);
            currentBlock += 1;
            tradeSoFar += perBlockImbalance;
        }

        perBlockImbalance += 800;

        await imbalanceInst.addTrade(token.address, perBlockImbalance, priceUpdateBlock, currentBlock);
        tradeSoFar += perBlockImbalance;

        let imbalanceArr =  await imbalanceInst.getMockImbalance(token.address, priceUpdateBlock, currentBlock);

        assert.equal(imbalanceArr[0].valueOf(), tradeSoFar, "unexpected total imbalance.");
        assert.equal(imbalanceArr[1].valueOf(), perBlockImbalance, "unexpected last block imbalance.");
    });

    it("should test get imbalance in range.", async function() {
        let trades =            [160, 620, 64, -480, -6, 64, 210];
        let currBlocks =        [6000, 6001, 6001, 6002, 6002, 6003, 6004];
        let priceUpdateBlocks = [6000, 6000, 6000, 6000, 6000, 6000, 6000];
        let totalImbalanceInRange = 0;
        let firstGetBlock = 6001;
        let lastGetBlock = 6003

        assert.equal(trades.length, currBlocks.length, "arrays mismatch");
        assert.equal(trades.length, priceUpdateBlocks.length, "arrays mismatch");

        //create new instance
        let imbalanceInst2 = await MockImbalanceRecorder.new(admin);

        //set even resolution
        newRecordResolution = 2;
        await imbalanceInst2.setTokenControlInfo(token.address, newRecordResolution, maxPerBlockImbalance, maxTotalImbalance);

        for (let i = 0; i < trades.length; ++i) {
            await imbalanceInst2.addTrade(token.address, trades[i], priceUpdateBlocks[i], currBlocks[i]);

            if ((currBlocks[i] >= firstGetBlock) && (currBlocks[i] <= lastGetBlock)) {
                totalImbalanceInRange += trades[i];
           }
        }

        let imbalanceInRange = await imbalanceInst2.getMockImbalanceInRange(token.address, firstGetBlock, lastGetBlock);

        assert.equal((imbalanceInRange.valueOf() * newRecordResolution), totalImbalanceInRange, "unexpected total imbalance.");
    });

    it("should test get imbalance in range reverted when start block > and block.", async function() {
        let imbalanceInRange = await imbalanceInst.getMockImbalanceInRange(token.address, priceUpdateBlock, (priceUpdateBlock + 2 * 1));

        try {
            let imbalanceInRange = await imbalanceInst.getMockImbalanceInRange(token.address, priceUpdateBlock, (priceUpdateBlock - 2 * 1));
            assert(false, "throw was expected in line above.")
        } catch(e){
           assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("should test record resolution influence when trades always below resolution.", async function() {
        let trade = 16;
        let currentBlock = priceUpdateBlock = 20000;
        let totalImbalanceSinceUpdate = 0;

        //create new instance
        let imbalanceInst2 = await MockImbalanceRecorder.new(admin);

        //set even resolution
        newRecordResolution = 17; //trade + 1
        await imbalanceInst2.setTokenControlInfo(token.address, newRecordResolution, maxPerBlockImbalance, maxTotalImbalance);

        for (let i = 0; i < 20; ++i) {
            await imbalanceInst2.addTrade(token.address, trade, priceUpdateBlock, currentBlock ++);

            totalImbalanceSinceUpdate += trade;
        }

        let imbalanceArr = await imbalanceInst2.getMockImbalance(token.address, priceUpdateBlock, currentBlock);

        assert.equal(imbalanceArr[0].valueOf(), 0, "unexpected total imbalance.");
    });

    it("should test can't init this contract with empty contracts (address 0).", async function () {
        let recorder;

        try {
           recorder = await MockImbalanceRecorder.new(0);
           assert(false, "throw was expected in line above.")
        } catch(e){
           assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //sanity rates can currently be empty
        recorder = await MockImbalanceRecorder.new(admin);
    });

    it("should test encode imbalance data reverts on data overflow or underflow.", async function() {
        let pow_2_64 = (new BigNumber(2).pow(64).div(1));
        let pow_2_64_div2 = (new BigNumber(2).pow(64).div(2));
        let neg_pow_2_64_div2 = (new BigNumber(2).pow(64).div(2).mul(-1));
        let legalValue = 100;

        /*function prototype
        function callEncodeTokenImbalanceData(
                int64 lastBlockBuyUnitsImbalance,
                uint64 lastBlock,
                int64 totalBuyUnitsImbalance,
                uint64 lastRateUpdateBlock
        */

        // start with legal call
        await imbalanceInst.callEncodeTokenImbalanceData(legalValue, legalValue, legalValue, legalValue);

        //test invalid range for lastBlockBuyUnitsImbalance
        try {
            await imbalanceInst.callEncodeTokenImbalanceData(pow_2_64_div2.sub(0).valueOf(), legalValue, legalValue, legalValue);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //see success
        await imbalanceInst.callEncodeTokenImbalanceData(pow_2_64_div2.sub(1).valueOf(), legalValue, legalValue, legalValue);

        try {
            await imbalanceInst.callEncodeTokenImbalanceData(neg_pow_2_64_div2.valueOf(), legalValue, legalValue, legalValue);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        await imbalanceInst.callEncodeTokenImbalanceData(neg_pow_2_64_div2.add(1).valueOf(), legalValue, legalValue, legalValue);

        //test invalid range for lastBlock
        try {
            await imbalanceInst.callEncodeTokenImbalanceData(legalValue, pow_2_64.valueOf(), legalValue, legalValue);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //see success
        await imbalanceInst.callEncodeTokenImbalanceData(legalValue, pow_2_64.sub(1).valueOf(), legalValue, legalValue);


        //test invalid range for totalBuyUnitsImbalance
        try {
            await imbalanceInst.callEncodeTokenImbalanceData(legalValue, legalValue, pow_2_64_div2.valueOf(), legalValue);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        await imbalanceInst.callEncodeTokenImbalanceData(legalValue, legalValue, pow_2_64_div2.sub(1).valueOf(), legalValue);

        try {
            await imbalanceInst.callEncodeTokenImbalanceData(legalValue, legalValue, neg_pow_2_64_div2.valueOf(), legalValue);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }


        await imbalanceInst.callEncodeTokenImbalanceData(legalValue, legalValue, neg_pow_2_64_div2.add(1).valueOf(), legalValue);

        //test invalid range for lastRateUpdateBlock
        try {
            await imbalanceInst.callEncodeTokenImbalanceData(legalValue, legalValue, legalValue, pow_2_64_div2 * 2);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "using" + pow_2_64 +  " expected throw but got: " + e);
        }

        await imbalanceInst.callEncodeTokenImbalanceData(legalValue, legalValue, legalValue, pow_2_64.sub(1));

    });
});
