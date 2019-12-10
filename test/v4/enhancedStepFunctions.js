
//let ConversionRates = artifacts.require("./ConversionRates.sol");
let MockEnhancedStepFunctions = artifacts.require("./mockContracts/MockEnhancedStepFunctions.sol");
let TestToken = artifacts.require("./mockContracts/TestToken.sol");
let Wrapper = artifacts.require("./mockContracts/Wrapper.sol");

let Helper = require("./helper.js");
<<<<<<< HEAD
const BN = web3.utils.BN;

require("chai")
    .use(require("chai-as-promised"))
    .use(require("chai-bn")(BN))
    .should();

//global variables
let precisionUnits = (new BN(10).pow(new BN(18)));
=======
let BigNumber = require('bignumber.js');

//global variables
let precisionUnits = (new BigNumber(10).pow(18));
>>>>>>> Development to Master. Istanbul changes. buidl. (#471)
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
let imbalanceBuyStepX = [];
let imbalanceBuyStepY = [];
let imbalanceSellStepX = [];
let imbalanceSellStepY = [];
let compactBuyArr1 = [];
let compactBuyArr2 = [];
let compactSellArr1 = [];
let compactSellArr2 = [];

// getStepFunctionData command IDs

let comID_BuyRateStpImbalanceXLength = 8;
let comID_BuyRateStpImbalanceParamX = 9;
let comID_BuyRateStpImbalanceYLength = 10;
let comID_BuyRateStpImbalanceParamY = 11;

let comID_SellRateStpImbalanceXLength = 12;
let comID_SellRateStpImbalanceParamX = 13;
let comID_SellRateStpImbalanceYLength = 14;
let comID_SellRateStpImbalanceParamY = 15;

let convRatesInst;

contract('EnhancedStepFunctions', function(accounts) {
    it("should init globals", function() {
        admin = accounts[0];
        alerter = accounts[1];
        operator = accounts[2];
        reserveAddress = accounts[3];
    })

    it("should init EnhancedStepFunctions Inst and set general parameters.", async function () {
        //init contracts
        convRatesInst = await MockEnhancedStepFunctions.new(admin);

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
<<<<<<< HEAD
            tokenToEthRate = (new BN(10).pow(new BN(18))).div(new BN((i + 1) * 10));
=======
            tokenToEthRate = convertRateToPricingRate(Number((1 / ((i + 1) * 10)).toFixed(13)));
>>>>>>> Development to Master. Istanbul changes. buidl. (#471)
            baseBuy.push(ethToTokenRate);
            baseSell.push(tokenToEthRate);
        }

        assert.deepEqual(baseBuy.length, tokens.length);
        assert.deepEqual(baseSell.length, tokens.length);

        buys.length = sells.length = indices.length = 0;

        currentBlock = await Helper.getCurrentBlock();

        await convRatesInst.setBaseRate(tokens, baseBuy, baseSell, buys, sells, currentBlock, indices, {from: operator});

        //get base rate - validate data
        let thisSell;
        let thisBuy;
        for (i = 0; i < numTokens; ++i) {
            thisBuy = await convRatesInst.getBasicRate(tokens[i], true);
            thisSell = await convRatesInst.getBasicRate(tokens[i], false);
<<<<<<< HEAD
            Helper.assertEqual(thisBuy, baseBuy[i], "wrong base buy rate.");
            Helper.assertEqual(thisSell, baseSell[i], "wrong base sell rate.");
=======
            assert.deepEqual(thisBuy.valueOf(), baseBuy[i].valueOf(), "wrong base buy rate.");
            assert.deepEqual(thisSell.valueOf(), baseSell[i].valueOf(), "wrong base sell rate.");
>>>>>>> Development to Master. Istanbul changes. buidl. (#471)
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

<<<<<<< HEAD
        Helper.assertEqual(blockNum, currentBlock, "bad block number returned");

        blockNum = await convRatesInst.getRateUpdateBlock(tokens[11]);

        Helper.assertEqual(blockNum, currentBlock, "bad block number returned");
=======
        assert.equal(blockNum.valueOf(), currentBlock.valueOf(), "bad block number returned");

        blockNum = await convRatesInst.getRateUpdateBlock(tokens[11]);

        assert.equal(blockNum.valueOf(), currentBlock.valueOf(), "bad block number returned");
>>>>>>> Development to Master. Istanbul changes. buidl. (#471)
    });

    it("should revert when setting qty step functions.", async function () {
        let qtyBuyStepX = [0, 180, 330, 900, 1500];
        let qtyBuyStepY = [-10, 35, 150, 310, 1100, 1500];
        let qtySellStepX = [0, 1500, 3000, 7000, 30000];
        let qtySellStepY = [-20, 45, 190, 360, 1800, 2000];
        
        for (let i = 0; i < numTokens; ++i) {
            try {
                await convRatesInst.setQtyStepFunction(tokens[i], qtyBuyStepX, qtyBuyStepY, qtySellStepX, qtySellStepY, {from:operator});
                assert(false, "throw was expected in line above.")
            } catch (e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }
        }
    });

    it("should set step functions imbalance.", async function () {
        imbalanceBuyStepX = [-100, 180, 330, 900, 1500];
        imbalanceBuyStepY = [-10, 35, 150, 310, 1100, 1500];
        imbalanceSellStepX = [-200, 1500, 3000, 7000, 30000];
        imbalanceSellStepY = [-20, 45, 190, 360, 1800, 2000];
        
        for (let i = 0; i < numTokens; ++i) {
            await convRatesInst.setImbalanceStepFunction(tokens[i], imbalanceBuyStepX, imbalanceBuyStepY, imbalanceSellStepX, imbalanceSellStepY, {from:operator});
        }
    });

    it("should get imbalance buy step function and verify numbers.", async function () {
        tokenId = 1; //

        // x axis
        let received = await convRatesInst.getStepFunctionData(tokens[tokenId], comID_BuyRateStpImbalanceXLength, 0); //get length
<<<<<<< HEAD
        Helper.assertEqual(received, imbalanceBuyStepX.length, "length don't match");

        // now y axis
        received = await convRatesInst.getStepFunctionData(tokens[tokenId], comID_BuyRateStpImbalanceYLength, 0); //get length
        Helper.assertEqual(received, imbalanceBuyStepY.length, "length don't match");
=======
        assert.equal(received.valueOf(), imbalanceBuyStepX.length, "length don't match");

        // now y axis
        received = await convRatesInst.getStepFunctionData(tokens[tokenId], comID_BuyRateStpImbalanceYLength, 0); //get length
        assert.equal(received.valueOf(), imbalanceBuyStepY.length, "length don't match"); //x and y must match.
>>>>>>> Development to Master. Istanbul changes. buidl. (#471)

        //iterate x and y values and compare
        for (let i = 0; i < imbalanceBuyStepX.length; ++i) {
            received = await convRatesInst.getStepFunctionData(tokens[tokenId], comID_BuyRateStpImbalanceParamX, i); //get x value in cell i
<<<<<<< HEAD
            Helper.assertEqual(received, imbalanceBuyStepX[i], "mismatch for x value in cell: " + i);
            received = await convRatesInst.getStepFunctionData(tokens[tokenId], comID_BuyRateStpImbalanceParamY, i); //get x value in cell i
            Helper.assertEqual(received, imbalanceBuyStepY[i], "mismatch for y value in cell: " + i);
=======
            assert.equal(received.valueOf(), imbalanceBuyStepX[i], "mismatch for x value in cell: " + i);
            received = await convRatesInst.getStepFunctionData(tokens[tokenId], comID_BuyRateStpImbalanceParamY, i); //get x value in cell i
            assert.equal(received.valueOf(), imbalanceBuyStepY[i], "mismatch for y value in cell: " + i);
>>>>>>> Development to Master. Istanbul changes. buidl. (#471)
        }
    });

    it("should get imbalance sell step function and verify numbers.", async function () {
        tokenId = 3; //

        // x axis
        let received = await convRatesInst.getStepFunctionData(tokens[tokenId], comID_SellRateStpImbalanceXLength, 0); //get length
<<<<<<< HEAD
        Helper.assertEqual(received, imbalanceSellStepX.length, "length don't match");

        // now y axis
        received = await convRatesInst.getStepFunctionData(tokens[tokenId], comID_SellRateStpImbalanceYLength, 0); //get length
        Helper.assertEqual(received, imbalanceSellStepY.length, "length don't match");
=======
        assert.equal(received.valueOf(), imbalanceSellStepX.length, "length don't match");

        // now y axis
        received = await convRatesInst.getStepFunctionData(tokens[tokenId], comID_SellRateStpImbalanceYLength, 0); //get length
        assert.equal(received.valueOf(), imbalanceSellStepY.length, "length don't match"); //x and y must match.
>>>>>>> Development to Master. Istanbul changes. buidl. (#471)

        //iterate x and y values and compare
        for (let i = 0; i < imbalanceSellStepX.length; ++i) {
            received = await convRatesInst.getStepFunctionData(tokens[tokenId], comID_SellRateStpImbalanceParamX, i); //get x value in cell i
<<<<<<< HEAD
            Helper.assertEqual(received, imbalanceSellStepX[i], "mismatch for x value in cell: " + i);
            received = await convRatesInst.getStepFunctionData(tokens[tokenId], comID_SellRateStpImbalanceParamY, i); //get x value in cell i
            Helper.assertEqual(received, imbalanceSellStepY[i], "mismatch for y value in cell: " + i);
=======
            assert.equal(received.valueOf(), imbalanceSellStepX[i], "mismatch for x value in cell: " + i);
            received = await convRatesInst.getStepFunctionData(tokens[tokenId], comID_SellRateStpImbalanceParamY, i); //get x value in cell i
            assert.equal(received.valueOf(), imbalanceSellStepY[i], "mismatch for y value in cell: " + i);
>>>>>>> Development to Master. Istanbul changes. buidl. (#471)
        }
    });

    it("should get set function data reverts with illegal command ID.", async function () {
        tokenId = 1; //
        try {
            _ = await convRatesInst.getStepFunctionData(tokens[tokenId], 19, 0); //get length
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
        // first 8 commands for old qty step func which alr removed
        for(let i = 0; i < 8; i++) {
            try {
                _ = await convRatesInst.getStepFunctionData(tokens[tokenId], i, 0);
                assert(false, "throw was expected in line above.")
            } catch(e){
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }
        }
    });

    it("should test encode and decode function correct value", async function () {
        let x = -100;
        let y = 100;
        let val = await convRatesInst.mockEncodeStepData(x, y);
        let decode = await convRatesInst.mockDecodeStepData(val);
<<<<<<< HEAD
        Helper.assertEqual(decode[0], x, "decode x wrong value");
        Helper.assertEqual(decode[1], y, "decode y wrong value");
        y = 0;
        val = await convRatesInst.mockEncodeStepData(x, y);
        decode = await convRatesInst.mockDecodeStepData(val);
        Helper.assertEqual(decode[0], x, "decode x wrong value");
        Helper.assertEqual(decode[1], y, "decode y wrong value");
=======
        assert.equal(decode[0].valueOf(), x, "decode x wrong value");
        assert.equal(decode[1].valueOf(), y, "decode y wrong value");
        y = 0;
        val = await convRatesInst.mockEncodeStepData(x, y);
        decode = await convRatesInst.mockDecodeStepData(val);
        assert.equal(decode[0].valueOf(), x, "decode x wrong value");
        assert.equal(decode[1].valueOf(), y, "decode y wrong value");
>>>>>>> Development to Master. Istanbul changes. buidl. (#471)
        x = 100;
        y = -100;
        val = await convRatesInst.mockEncodeStepData(x, y);
        decode = await convRatesInst.mockDecodeStepData(val);
<<<<<<< HEAD
        Helper.assertEqual(decode[0], x, "decode x wrong value");
        Helper.assertEqual(decode[1], y, "decode y wrong value");
        y = 0;
        val = await convRatesInst.mockEncodeStepData(x, y);
        decode = await convRatesInst.mockDecodeStepData(val);
        Helper.assertEqual(decode[0], x, "decode x wrong value");
        Helper.assertEqual(decode[1], y, "decode y wrong value");
=======
        assert.equal(decode[0].valueOf(), x, "decode x wrong value");
        assert.equal(decode[1].valueOf(), y, "decode y wrong value");
        y = 0;
        val = await convRatesInst.mockEncodeStepData(x, y);
        decode = await convRatesInst.mockDecodeStepData(val);
        assert.equal(decode[0].valueOf(), x, "decode x wrong value");
        assert.equal(decode[1].valueOf(), y, "decode y wrong value");
>>>>>>> Development to Master. Istanbul changes. buidl. (#471)
        x = -10;
        y = -123;
        val = await convRatesInst.mockEncodeStepData(x, y);
        decode = await convRatesInst.mockDecodeStepData(val);
<<<<<<< HEAD
        Helper.assertEqual(decode[0], x, "decode x wrong value");
        Helper.assertEqual(decode[1], y, "decode y wrong value");
=======
        assert.equal(decode[0].valueOf(), x, "decode x wrong value");
        assert.equal(decode[1].valueOf(), y, "decode y wrong value");
>>>>>>> Development to Master. Istanbul changes. buidl. (#471)
        x = 10;
        y = 123;
        val = await convRatesInst.mockEncodeStepData(x, y);
        decode = await convRatesInst.mockDecodeStepData(val);
<<<<<<< HEAD
        Helper.assertEqual(decode[0], x, "decode x wrong value");
        Helper.assertEqual(decode[1], y, "decode y wrong value");
=======
        assert.equal(decode[0].valueOf(), x, "decode x wrong value");
        assert.equal(decode[1].valueOf(), y, "decode y wrong value");
>>>>>>> Development to Master. Istanbul changes. buidl. (#471)
    });

    it("should return MAX value for X with special value of step X", async function() {
        // checking for overflow
<<<<<<< HEAD
        let x = (new BN(2)).pow(new BN(127)).sub(new BN(1));
        let y = 0;
        let val = await convRatesInst.mockEncodeStepData(x, y);
        let decode = await convRatesInst.mockDecodeStepData(val);
        x = await convRatesInst.mockGetImbalanceMax();
        Helper.assertEqual(decode[0], x, "decode x1 wrong value");
        Helper.assertEqual(decode[1], y, "decode y wrong value");

        x = (new BN(2)).pow(new BN(127)).sub(new BN(2));
        val = await convRatesInst.mockEncodeStepData(x, y);
        decode = await convRatesInst.mockDecodeStepData(val);
        Helper.assertEqual(decode[0], x, "decode x2 wrong value");
=======
        let x = (new BigNumber(2)).pow(127).sub(1);
        let y = 0;
        let val = await convRatesInst.mockEncodeStepData(x.valueOf(), y);
        let decode = await convRatesInst.mockDecodeStepData(val);
        x = await convRatesInst.mockGetImbalanceMax();
        assert.equal(decode[0].valueOf(), x.valueOf(), "decode x1 wrong value");
        assert.equal(decode[1].valueOf(), y, "decode y wrong value");

        x = (new BigNumber(2)).pow(127).sub(2);
        val = await convRatesInst.mockEncodeStepData(x.valueOf(), y);
        decode = await convRatesInst.mockDecodeStepData(val);
        assert.equal(decode[0].valueOf(), x.valueOf(), "decode x2 wrong value");
>>>>>>> Development to Master. Istanbul changes. buidl. (#471)
    });


    it("should revert encode data when x overflows", async function() {
        // checking for overflow
<<<<<<< HEAD
        let x = (new BN(2)).pow(new BN(127));
        let y = 0;
        try {
            _ = await convRatesInst.mockEncodeStepData(x, y);
=======
        let x = (new BigNumber(2)).pow(127);
        let y = 0;
        try {
            _ = await convRatesInst.mockEncodeStepData(x.valueOf(), y);
>>>>>>> Development to Master. Istanbul changes. buidl. (#471)
            assert(false, "Should revert at line above")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
<<<<<<< HEAD
        x = (new BN(2)).pow(new BN(127)).add(new BN(1)).mul(new BN(-1));
        try {
            _ = await convRatesInst.mockEncodeStepData(x, y);
=======
        x = (new BigNumber(2)).pow(127).add(1).mul(-1);
        try {
            _ = await convRatesInst.mockEncodeStepData(x.valueOf(), y);
>>>>>>> Development to Master. Istanbul changes. buidl. (#471)
            assert(false, "Should revert at line above")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("should revert encode data when y overflows", async function() {
        // checking for overflow
        let x = 0;
<<<<<<< HEAD
        let y = (new BN(2)).pow(new BN(127));
        try {
            _ = await convRatesInst.mockEncodeStepData(x, y);
=======
        let y = (new BigNumber(2)).pow(127);
        try {
            _ = await convRatesInst.mockEncodeStepData(x, y.valueOf());
>>>>>>> Development to Master. Istanbul changes. buidl. (#471)
            assert(false, "Should revert at line above")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
<<<<<<< HEAD
        y = (new BN(2)).pow(new BN(127)).add(new BN(1)).mul(new BN(-1));
        try {
            _ = await convRatesInst.mockEncodeStepData(x, y);
=======
        y = (new BigNumber(2)).pow(127).add(1).mul(-1);
        try {
            _ = await convRatesInst.mockEncodeStepData(x, y.valueOf());
>>>>>>> Development to Master. Istanbul changes. buidl. (#471)
            assert(false, "Should revert at line above")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("check checkMultOverflow", async function () {
<<<<<<< HEAD
        const big = new BN(2).pow(new BN(128));
        const small = new BN(2).pow(new BN(100));
        const negativeBig = new BN(2).pow(new BN(128)).mul(new BN(-1));
=======
        const big = new BigNumber(2).pow(128);
        const small = new BigNumber(2).pow(100);
        const negativeBig = new BigNumber(2).pow(128).mul(-1);
>>>>>>> Development to Master. Istanbul changes. buidl. (#471)

        let overflow;
        overflow = await convRatesInst.mockCheckMultiOverflow(big, big);
        assert( overflow, "big * big should overflow");

        overflow = await convRatesInst.mockCheckMultiOverflow(big, negativeBig);
        assert( overflow, "big * negativeBig should overflow");

        overflow = await convRatesInst.mockCheckMultiOverflow(small, big);
        assert( !overflow, "big * small should not overflow");

        overflow = await convRatesInst.mockCheckMultiOverflow(small, negativeBig);
        assert( !overflow, "negativeBig * small should not overflow");

        overflow = await convRatesInst.mockCheckMultiOverflow(negativeBig, negativeBig);
        assert( overflow, "negativeBig * negativeBig should overflow");

        overflow = await convRatesInst.mockCheckMultiOverflow(0, big);
        assert( !overflow, "0 * big should not overflow");

        overflow = await convRatesInst.mockCheckMultiOverflow(big, 0);
        assert( !overflow, "big * 0 should not overflow");
    });

    it("check value of MAX_IMBALANCE is correct", async function () {
<<<<<<< HEAD
        let value = new BN(2).pow(new BN(255)).sub(new BN(1));
=======
        let value = new BigNumber(2).pow(255).sub(1);
>>>>>>> Development to Master. Istanbul changes. buidl. (#471)

        let isEqual = await convRatesInst.mockCheckValueMaxImbalance(value);
        assert( isEqual, "value of max imbalance should be correct");

<<<<<<< HEAD
        value = value.sub(new BN(1));
=======
        value = value.sub(1);
>>>>>>> Development to Master. Istanbul changes. buidl. (#471)
        isEqual = await convRatesInst.mockCheckValueMaxImbalance(value);
        assert( !isEqual, "value of max imbalance should be correct");
    });

    it("should get buy rate with update according to compact data update.", async function () {
        let tokenInd = 7;
        let token = tokens[tokenInd]; //choose some token
        let baseBuyRate = await convRatesInst.getBasicRate(token, true);

        // get rate without activating quantity step function (small amount).
        let srcQty = 2;
<<<<<<< HEAD
        let expectedRate = (new BN(baseBuyRate));
        let extraBps = compactBuyArr1[tokenInd] * 10;
        expectedRate = Helper.addBps(expectedRate, extraBps);
        let dstQty = new BN(srcQty).mul(expectedRate).div(precisionUnits);
        dstQty = dstQty;
        extraBps = getExtraBpsForImbalanceBuyQuantity(0, dstQty * 1);
        expectedRate = Helper.addBps(expectedRate, extraBps);
        let receivedRate = await convRatesInst.getRate(token, currentBlock, true, srcQty);

        Helper.assertEqual(receivedRate, expectedRate, "bad rate");
=======
        let expectedRate = (new BigNumber(baseBuyRate));
        let extraBps = compactBuyArr1[tokenInd] * 10;
        expectedRate = addBps(expectedRate, extraBps);
        let dstQty = new BigNumber(srcQty).mul(expectedRate).div(precisionUnits);
        dstQty = dstQty.floor();
        extraBps = getExtraBpsForImbalanceBuyQuantity(0, dstQty * 1);
        expectedRate = addBps(expectedRate, extraBps);
        let receivedRate = await convRatesInst.getRate(token, currentBlock, true, srcQty);

        assert.deepEqual(expectedRate.valueOf(), receivedRate.valueOf(), "bad rate");
>>>>>>> Development to Master. Istanbul changes. buidl. (#471)
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
<<<<<<< HEAD
        let expectedRate = (new BN(baseBuyRate));
        let extraBps = compactBuyArr1[tokenInd] * 10;
        expectedRate = Helper.addBps(expectedRate, extraBps);
        let dstQty = new BN(srcQty).mul(expectedRate).div(precisionUnits);
        dstQty = dstQty;
        extraBps = getExtraBpsForImbalanceBuyQuantity(0, dstQty);
        expectedRate = Helper.addBps(expectedRate, extraBps);

        let receivedRate = await convRatesInst.getRate(token, currentBlock, true, srcQty);

        Helper.assertEqual(receivedRate, expectedRate, "bad rate");
=======
        let expectedRate = (new BigNumber(baseBuyRate));
        let extraBps = compactBuyArr1[tokenInd] * 10;
        expectedRate = addBps(expectedRate, extraBps);
        let dstQty = new BigNumber(srcQty).mul(expectedRate).div(precisionUnits);
        dstQty = dstQty.floor();
        extraBps = getExtraBpsForImbalanceBuyQuantity(0, dstQty);
        expectedRate = addBps(expectedRate, extraBps);

        let receivedRate = await convRatesInst.getRate(token, currentBlock, true, srcQty);

        assert.deepEqual(expectedRate.valueOf(), receivedRate.valueOf(), "bad rate");
>>>>>>> Development to Master. Istanbul changes. buidl. (#471)

        //update compact data
        compactBuyArr1[tokenInd] = 127;
        compactHex = Helper.bytesToHex(compactBuyArr1);
        buys.length = 0;
        buys.push(compactHex);
        await convRatesInst.setCompactData(buys, sells, currentBlock, indices, {from: operator});
        lastSetCompactBlock = currentBlock;

        // get rate without activating quantity step function (small amount).
        srcQty = 11;
<<<<<<< HEAD
        expectedRate = (new BN(baseBuyRate));
        extraBps = compactBuyArr1[tokenInd] * 10;
        expectedRate = Helper.addBps(expectedRate, extraBps);
        dstQty = new BN(srcQty).mul(expectedRate).div(precisionUnits);
        dstQty = dstQty;
        extraBps = getExtraBpsForImbalanceBuyQuantity(0, dstQty);
        expectedRate = Helper.addBps(expectedRate, extraBps);

        receivedRate = await convRatesInst.getRate(token, currentBlock, true, srcQty);

        Helper.assertEqual(receivedRate, expectedRate, "bad rate");
=======
        expectedRate = (new BigNumber(baseBuyRate));
        extraBps = compactBuyArr1[tokenInd] * 10;
        expectedRate = addBps(expectedRate, extraBps);
        dstQty = new BigNumber(srcQty).mul(expectedRate).div(precisionUnits);
        dstQty = dstQty.floor();
        extraBps = getExtraBpsForImbalanceBuyQuantity(0, dstQty);
        expectedRate = addBps(expectedRate, extraBps);

        receivedRate = await convRatesInst.getRate(token, currentBlock, true, srcQty);

        assert.deepEqual(expectedRate.valueOf(), receivedRate.valueOf(), "bad rate");
>>>>>>> Development to Master. Istanbul changes. buidl. (#471)
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
<<<<<<< HEAD
        let expectedRate = (new BN(baseBuyRate));
        let extraBps = compactBuyArr2[tokenInd - 14] * 10;
        expectedRate = Helper.addBps(expectedRate, extraBps);
        let dstQty = new BN(srcQty).mul(expectedRate).div(precisionUnits);
        dstQty = dstQty;
        extraBps = getExtraBpsForImbalanceBuyQuantity(0, dstQty);
        expectedRate = Helper.addBps(expectedRate, extraBps);

        let receivedRate = await convRatesInst.getRate(token, currentBlock, true, srcQty);

        Helper.assertEqual(receivedRate, expectedRate, "bad rate");
=======
        let expectedRate = (new BigNumber(baseBuyRate));
        let extraBps = compactBuyArr2[tokenInd - 14] * 10;
        expectedRate = addBps(expectedRate, extraBps);
        let dstQty = new BigNumber(srcQty).mul(expectedRate).div(precisionUnits);
        dstQty = dstQty.floor();
        extraBps = getExtraBpsForImbalanceBuyQuantity(0, dstQty);
        expectedRate = addBps(expectedRate, extraBps);

        let receivedRate = await convRatesInst.getRate(token, currentBlock, true, srcQty);

        assert.deepEqual(expectedRate.valueOf(), receivedRate.valueOf(), "bad rate");
>>>>>>> Development to Master. Istanbul changes. buidl. (#471)
    });

    it("should get buy rate with compact data and quantity step.", async function () {
        let tokenInd = 11;
        let token = tokens[tokenInd]; //choose some token
        let baseBuyRate = await convRatesInst.getBasicRate(token, true);

        // calculate expected rate
        let srcQty = 17;
<<<<<<< HEAD
        let expectedRate = (new BN(baseBuyRate));
        let extraBps = compactBuyArr1[tokenInd] * 10;
        expectedRate = Helper.addBps(expectedRate, extraBps);
        let dstQty = new BN(srcQty).mul(expectedRate).div(precisionUnits);
        dstQty = dstQty;
        extraBps = getExtraBpsForImbalanceBuyQuantity(0, dstQty);
        expectedRate = Helper.addBps(expectedRate, extraBps);

        let receivedRate = await convRatesInst.getRate(token, currentBlock, true, srcQty);

        Helper.assertEqual(receivedRate, expectedRate, "bad rate");
=======
        let expectedRate = (new BigNumber(baseBuyRate));
        let extraBps = compactBuyArr1[tokenInd] * 10;
        expectedRate = addBps(expectedRate, extraBps);
        let dstQty = new BigNumber(srcQty).mul(expectedRate).div(precisionUnits);
        dstQty = dstQty.floor();
        extraBps = getExtraBpsForImbalanceBuyQuantity(0, dstQty);
        expectedRate = addBps(expectedRate, extraBps);

        let receivedRate = await convRatesInst.getRate(token, currentBlock, true, srcQty);

        assert.deepEqual(expectedRate.valueOf(), receivedRate.valueOf(), "bad rate");
>>>>>>> Development to Master. Istanbul changes. buidl. (#471)
    });

    it("should get buy rate quantity step and compact data update with token index > 14.", async function () {
        let tokenInd = 15;
        let token = tokens[tokenInd]; //choose some token
        let baseBuyRate = await convRatesInst.getBasicRate(token, true);

        // get rate
        let srcQty = 24;
<<<<<<< HEAD
        let expectedRate = (new BN(baseBuyRate));
        let extraBps = compactBuyArr2[tokenInd - 14] * 10;
        expectedRate = Helper.addBps(expectedRate, extraBps);
        let dstQty = new BN(srcQty).mul(expectedRate).div(precisionUnits);
        dstQty = dstQty;
        extraBps = getExtraBpsForImbalanceBuyQuantity(0, dstQty);
        expectedRate = Helper.addBps(expectedRate, extraBps);

        let receivedRate = await convRatesInst.getRate(token, currentBlock, true, srcQty);

        Helper.assertEqual(receivedRate, expectedRate, "bad rate");
=======
        let expectedRate = (new BigNumber(baseBuyRate));
        let extraBps = compactBuyArr2[tokenInd - 14] * 10;
        expectedRate = addBps(expectedRate, extraBps);
        let dstQty = new BigNumber(srcQty).mul(expectedRate).div(precisionUnits);
        dstQty = dstQty.floor();
        extraBps = getExtraBpsForImbalanceBuyQuantity(0, dstQty);
        expectedRate = addBps(expectedRate, extraBps);

        let receivedRate = await convRatesInst.getRate(token, currentBlock, true, srcQty);

        assert.deepEqual(expectedRate.valueOf(), receivedRate.valueOf(), "bad rate");
>>>>>>> Development to Master. Istanbul changes. buidl. (#471)
    });

    it("should add imbalance. get buy rate with with compact data + quantity step + imbalance step.", async function () {
        let tokenInd = 8;
        let token = tokens[tokenInd]; //choose some token
        let baseBuyRate = await convRatesInst.getBasicRate(token, true);

        // get rate
        let buyQty = 15;
        let imbalance = 96;
<<<<<<< HEAD
        let expectedRate = (new BN(baseBuyRate));
        let extraBps = compactBuyArr1[tokenInd] * 10;
        expectedRate = Helper.addBps(expectedRate, extraBps);
        let dstQty = new BN(buyQty).mul(expectedRate).div(precisionUnits);
        dstQty = dstQty;
        //imbalance bps
        extraBps = getExtraBpsForImbalanceBuyQuantity(imbalance, dstQty * 1.0);
        expectedRate = Helper.addBps(expectedRate, extraBps);
=======
        let expectedRate = (new BigNumber(baseBuyRate));
        let extraBps = compactBuyArr1[tokenInd] * 10;
        expectedRate = addBps(expectedRate, extraBps);
        let dstQty = new BigNumber(buyQty).mul(expectedRate).div(precisionUnits);
        dstQty = dstQty.floor();
        //imbalance bps
        extraBps = getExtraBpsForImbalanceBuyQuantity(imbalance, dstQty * 1.0);
        expectedRate = addBps(expectedRate, extraBps);
>>>>>>> Development to Master. Istanbul changes. buidl. (#471)

        //record imbalance
        await convRatesInst.recordImbalance(token, imbalance, currentBlock, currentBlock, {from: reserveAddress});
        let receivedRate = await convRatesInst.getRate(token, currentBlock, true, buyQty);
<<<<<<< HEAD
        Helper.assertEqual(receivedRate, expectedRate, "bad rate");
=======
        assert.deepEqual(expectedRate.valueOf(), receivedRate.valueOf(), "bad rate");
>>>>>>> Development to Master. Istanbul changes. buidl. (#471)
    });

    it("should add imbalance and get sell rate with with compact data + quantity step + imbalance step.", async function () {
        let tokenInd = 16;
        let token = tokens[tokenInd]; //choose some token
        let baseSellRate = await convRatesInst.getBasicRate(token, false);

        // get rate
        let sellQty = 500;
        let imbalance = 1800;
<<<<<<< HEAD
        let expectedRate = (new BN(baseSellRate));
        //calc compact data
        let extraBps = compactSellArr2[tokenInd - 14] * 10;
        expectedRate = Helper.addBps(expectedRate, extraBps);
        //calc imbalance steps
        extraBps = getExtraBpsForImbalanceSellQuantity(imbalance, sellQty);
        expectedRate = Helper.addBps(expectedRate, extraBps);
=======
        let expectedRate = (new BigNumber(baseSellRate));
        //calc compact data
        let extraBps = compactSellArr2[tokenInd - 14] * 10;
        expectedRate = addBps(expectedRate, extraBps);
        //calc imbalance steps
        extraBps = getExtraBpsForImbalanceSellQuantity(imbalance, sellQty);
        expectedRate = addBps(expectedRate, extraBps);
>>>>>>> Development to Master. Istanbul changes. buidl. (#471)

        //record imbalance
        await convRatesInst.recordImbalance(token, imbalance, currentBlock, currentBlock, {from: reserveAddress});

        let receivedRate = await convRatesInst.getRate(token, currentBlock, false, sellQty);

        //round rates a bit
<<<<<<< HEAD
        Helper.assertEqual(receivedRate, expectedRate, "bad rate");
=======
        compareRates(receivedRate, expectedRate);
>>>>>>> Development to Master. Istanbul changes. buidl. (#471)
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
        imbalanceBuyStepX.length = imbalanceBuyStepY.length - 1;
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
        imbalanceBuyStepY.length = imbalanceBuyStepX.length + 1;
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
        imbalanceSellStepX.length = imbalanceSellStepY.length - 1;
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
        imbalanceSellStepY.length = imbalanceSellStepX.length + 1;
        await convRatesInst.setImbalanceStepFunction(tokens[4], imbalanceBuyStepX, imbalanceBuyStepY, imbalanceSellStepX, imbalanceSellStepY, {from:operator});
    });

    it("should verify get rate returns 0 if token disabled.", async function () {
        let qty = 3000;
        let index = 5;

        let rate = await convRatesInst.getRate(tokens[index], currentBlock, false, qty);

<<<<<<< HEAD
        Helper.assertGreater(rate, 0, "unexpected rate");

        await convRatesInst.disableTokenTrade(tokens[index], {from: alerter});
        rate = await convRatesInst.getRate(tokens[index], currentBlock, false, qty);
        Helper.assertEqual(rate, 0, "unexpected rate");
=======
        assert(rate > 0, "unexpected rate");

        await convRatesInst.disableTokenTrade(tokens[index], {from: alerter});
        rate = await convRatesInst.getRate(tokens[index], currentBlock, false, qty);
        assert(rate == 0, "unexpected rate");
>>>>>>> Development to Master. Istanbul changes. buidl. (#471)

        await convRatesInst.enableTokenTrade(tokens[index]);
    });

    it("should verify get rate returns 0 if token minimal record resolution is zero.", async function () {
        let qty = 3000;
        let index = 5;

        let rate = await convRatesInst.getRate(tokens[index], currentBlock, false, qty);

<<<<<<< HEAD
        Helper.assertGreater(rate, 0, "unexpected rate");

        await convRatesInst.setTokenControlInfo(tokens[index], 0, 0, 0);
        rate = await convRatesInst.getRate(tokens[index], currentBlock, false, qty);
        Helper.assertEqual(rate, 0, "unexpected rate");
=======
        assert(rate > 0, "unexpected rate");

        await convRatesInst.setTokenControlInfo(tokens[index], 0, 0, 0);
        rate = await convRatesInst.getRate(tokens[index], currentBlock, false, qty);
        assert(rate == 0, "unexpected rate");
>>>>>>> Development to Master. Istanbul changes. buidl. (#471)

        await convRatesInst.setTokenControlInfo(tokens[index], minimalRecordResolution, maxPerBlockImbalance, maxTotalImbalance);
    });

    it("should verify get rate returns 0 block is high (bigger then expiration block).", async function () {
        let qty = 3000;
        let index = 5;

        let rate = await convRatesInst.getRate(tokens[index], currentBlock, false, qty);

<<<<<<< HEAD
        Helper.assertGreater(rate, 0, "unexpected rate");

        rate = await convRatesInst.getRate(tokens[index], currentBlock*1 + 2000, false, qty);
        Helper.assertEqual(rate, 0, "unexpected rate");
=======
        assert(rate > 0, "unexpected rate");

        rate = await convRatesInst.getRate(tokens[index], currentBlock*1 + 2000, false, qty);
        assert(rate == 0, "unexpected rate");
>>>>>>> Development to Master. Istanbul changes. buidl. (#471)
    });

    it("should verify get rate returns 0 when qty above block imbalance.", async function () {
        let qty = maxPerBlockImbalance * 1 - 1;
        let index = 5;

        let rate = await convRatesInst.getRate(tokens[index], currentBlock, false, qty);

<<<<<<< HEAD
        Helper.assertGreater(rate, 0, "unexpected rate");

        qty = qty * 1 + 2;
        rate = await convRatesInst.getRate(tokens[index], currentBlock, false, qty);
        Helper.assertEqual(rate, 0, "unexpected rate");
=======
        assert(rate > 0, "unexpected rate");

        qty = qty * 1 + 2;
        rate = await convRatesInst.getRate(tokens[index], currentBlock, false, qty);
        assert(rate == 0, "unexpected rate");
>>>>>>> Development to Master. Istanbul changes. buidl. (#471)
    });

    it("should verify get rate returns 0 when qty + total imbalance are above maxTotalImbalance.", async function () {
        let qty = (maxPerBlockImbalance * -1 + 2);
        let index = 11;
        let totalImbalance = 0;
        let token = tokens[index];
        let imbalance = qty;

        let lastSetBlock = await convRatesInst.getUpdateRateBlockFromCompact(token);
<<<<<<< HEAD
        Helper.assertEqual(lastSetBlock, lastSetCompactBlock, "unexpected block");
=======
        assert.equal(lastSetBlock.valueOf(), lastSetCompactBlock, "unexpected block");
>>>>>>> Development to Master. Istanbul changes. buidl. (#471)

        while ((totalImbalance + imbalance) > (-maxTotalImbalance)) {
            await convRatesInst.recordImbalance(token, imbalance, lastSetCompactBlock, currentBlock++, {from: reserveAddress});
            totalImbalance += imbalance;
        }

        qty = maxTotalImbalance + totalImbalance - 1;
        let rximbalance = await convRatesInst.getImbalancePerToken(token, currentBlock);
<<<<<<< HEAD
        Helper.assertEqual(rximbalance[0], totalImbalance, "bad imbalance");

        let maxTotal = await convRatesInst.mockGetMaxTotalImbalance(token);
        Helper.assertEqual(maxTotal, maxTotalImbalance, "unexpected max total imbalance.");
=======
        assert.equal(rximbalance[0].valueOf(), totalImbalance, "bad imbalance");

        let maxTotal = await convRatesInst.mockGetMaxTotalImbalance(token);
        assert.equal(maxTotalImbalance, maxTotal.valueOf(), "unexpected max total imbalance.");
>>>>>>> Development to Master. Istanbul changes. buidl. (#471)

        //we are near total imbalance so small getRate will get legal rate.
        let rate = await convRatesInst.getRate(token, currentBlock, false, qty);

<<<<<<< HEAD
        Helper.assertGreater(rate, 0, "expected rate > 0, received: " + rate);
=======
        assert(rate > 0, "expected rate > 0, received: " + rate);
>>>>>>> Development to Master. Istanbul changes. buidl. (#471)

        //high get rate should get 0.
        rate = await convRatesInst.getRate(token, currentBlock, false, (qty + 1));

<<<<<<< HEAD
        Helper.assertEqual(rate, 0, "unexpected rate");
=======
        assert.equal(rate.valueOf(), 0, "unexpected rate");
>>>>>>> Development to Master. Istanbul changes. buidl. (#471)
    });

    it("should verify get rate returns 0 when qty + total imbalance are above step with y = -10000", async function () {
        let tokenInd = 1;
        currentBlock = await Helper.getCurrentBlock();
        let curImbalance = await convRatesInst.getImbalancePerToken(tokens[tokenInd], currentBlock);

        imbalanceSellStepX = [-500, -200, -100, 100];
        imbalanceSellStepY = [-10000, -500, -200, -50, 0];
        await convRatesInst.setImbalanceStepFunction(tokens[tokenInd], imbalanceBuyStepX, imbalanceBuyStepY, imbalanceSellStepX, imbalanceSellStepY, {from:operator});
        // reset imbalance to 0
<<<<<<< HEAD
        await convRatesInst.recordImbalance(tokens[tokenInd], new BN(curImbalance[0]).mul(new BN(-1)), 0, currentBlock, {from: reserveAddress});
        // amount sell above 500 should return 0 rate
        let sellRate = await convRatesInst.getRate(tokens[tokenInd], currentBlock, false, 501);

        Helper.assertEqual(sellRate, 0, "unexpected rate: should be 0");
        sellRate = await convRatesInst.getRate(tokens[tokenInd], currentBlock, false, 200);
        Helper.assertGreater(sellRate, 0, "unexpected rate: should not be 0");
=======
        await convRatesInst.recordImbalance(tokens[tokenInd], curImbalance[0].mul(-1).valueOf(), 0, currentBlock, {from: reserveAddress});
        // amount sell above 500 should return 0 rate
        let sellRate = await convRatesInst.getRate(tokens[tokenInd], currentBlock, false, 501);
        assert(sellRate.valueOf() == 0, "unexpected rate: should be 0");
        sellRate = convRatesInst.getRate(tokens[tokenInd], currentBlock, false, 200);
        assert(sellRate.valueOf() != 0, "unexpected rate: should not be 0");

>>>>>>> Development to Master. Istanbul changes. buidl. (#471)
        // buy
        imbalanceBuyStepX = [0, 200, 300, 500];
        imbalanceBuyStepY = [0, -100, -200, -500, -10000];
        let srcQty = 2;
        let baseBuyRate = await convRatesInst.getBasicRate(tokens[tokenInd], true);
<<<<<<< HEAD
        let expectedRate = (new BN(baseBuyRate));
        let extraBps = compactBuyArr1[tokenInd] * 10;
        expectedRate = Helper.addBps(expectedRate, extraBps);
        let dstQty = new BN(srcQty).mul(expectedRate).div(precisionUnits);
        await convRatesInst.setImbalanceStepFunction(tokens[tokenInd], imbalanceBuyStepX, imbalanceBuyStepY, imbalanceSellStepX, imbalanceSellStepY, {from:operator});
        await convRatesInst.recordImbalance(tokens[tokenInd], 400, 0, currentBlock, {from: reserveAddress});
        let buyRate = await convRatesInst.getRate(tokens[tokenInd], currentBlock, true, srcQty);
        Helper.assertGreater(buyRate, 0, "unexpected rate: should not be 0");
=======
        let expectedRate = (new BigNumber(baseBuyRate));
        let extraBps = compactBuyArr1[tokenInd] * 10;
        expectedRate = addBps(expectedRate, extraBps);
        let dstQty = new BigNumber(srcQty).mul(expectedRate).div(precisionUnits);
        dstQty = dstQty.floor();

        await convRatesInst.setImbalanceStepFunction(tokens[tokenInd], imbalanceBuyStepX, imbalanceBuyStepY, imbalanceSellStepX, imbalanceSellStepY, {from:operator});
        await convRatesInst.recordImbalance(tokens[tokenInd], 400, 0, currentBlock, {from: reserveAddress});
        let buyRate = await convRatesInst.getRate(tokens[tokenInd], currentBlock, true, srcQty);
        assert(buyRate.valueOf() != 0, "unexpected rate: should not be 0");
>>>>>>> Development to Master. Istanbul changes. buidl. (#471)
        // dstQty + cur_imbal > 500
        await convRatesInst.recordImbalance(tokens[tokenInd], 110, 0, currentBlock, {from: reserveAddress});
        curImbalance = await convRatesInst.getImbalancePerToken(tokens[tokenInd], currentBlock);
        buyRate = await convRatesInst.getRate(tokens[tokenInd], currentBlock, true, srcQty);
<<<<<<< HEAD
        Helper.assertEqual(buyRate, 0, "unexpected rate: should be 0");
=======
        assert(buyRate.valueOf() == 0, "unexpected rate: should be 0");
>>>>>>> Development to Master. Istanbul changes. buidl. (#471)
    });

    it("should verify set step functions for imbalance reverted when more them max steps (16).", async function () {
        let index = 1;

        imbalanceBuyStepX = [15, 30, 70, 100, 200, 500, 700, 900, 1100, 1500, 1600, 1700, 1800, 1900, 2000];
        imbalanceBuyStepY = [8, 30, 70, 100, 120, 150, 170, 190, 210, 250, 300, 320, 330, 340, 350, 360];
        imbalanceSellStepX = [15, 30, 70, 100, 200, 500, 700, 900, 1100, 1500, 1600, 1700, 1800, 1900, 2000];
        imbalanceSellStepY = [8, 30, 70, 100, 120, 150, 170, 190, 210, 250, 300, 320, 330, 340, 350, 360];

        await convRatesInst.setImbalanceStepFunction(tokens[index], imbalanceBuyStepX, imbalanceBuyStepY, imbalanceSellStepX, imbalanceSellStepY, {from:operator});

        //set illegal value for buy steps.
        imbalanceBuyStepX[15] = 2100;
        imbalanceBuyStepY[16] = 400;

        try {
            await convRatesInst.setImbalanceStepFunction(tokens[index], imbalanceBuyStepX, imbalanceBuyStepY, imbalanceSellStepX, imbalanceSellStepY, {from:operator});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }


        //remove extra step and see success again
        imbalanceBuyStepX.length = 15;
        imbalanceBuyStepY.length = 16;
        await convRatesInst.setImbalanceStepFunction(tokens[index], imbalanceBuyStepX, imbalanceBuyStepY, imbalanceSellStepX, imbalanceSellStepY, {from:operator});

        //set illegal value for sell steps.
        imbalanceSellStepX[15] = 2100;
        imbalanceSellStepY[16] = 400;

        try {
            await convRatesInst.setImbalanceStepFunction(tokens[index], imbalanceBuyStepX, imbalanceBuyStepY, imbalanceSellStepX, imbalanceSellStepY, {from:operator});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("should verify set step functions for imbalance reverted when amounts are not increasing.", async function () {
        let index = 1;

        imbalanceBuyStepX = [15, 30, 70, 100, 200];
        imbalanceBuyStepY = [8, 30, 70, 100, 120, 150];
        imbalanceSellStepX = [15, 30, 70, 100, 200];
        imbalanceSellStepY = [8, 30, 70, 100, 120, 150];

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
        imbalanceBuyStepY = [8, 10];
        imbalanceSellStepX = [15];
        imbalanceSellStepY = [8, 10];
        await convRatesInst.setImbalanceStepFunction(tokens[index], imbalanceBuyStepX, imbalanceBuyStepY, imbalanceSellStepX, imbalanceSellStepY, {from:operator});

        imbalanceBuyStepX = [];
        imbalanceBuyStepY = [2];
        imbalanceSellStepX = [];
        imbalanceSellStepY = [2];
        await convRatesInst.setImbalanceStepFunction(tokens[index], imbalanceBuyStepX, imbalanceBuyStepY, imbalanceSellStepX, imbalanceSellStepY, {from:operator});
    });

    it("should verify set step functions for imbalance reverted when step Y smaller than min bps adjustment", async function () {
        let index = 1;

        imbalanceBuyStepX = [15, 30, 70, 100, 200];
        imbalanceBuyStepY = [8, 30, 70, 100, 120, 150];
        imbalanceSellStepX = [15, 30, 70, 100, 200];
        imbalanceSellStepY = [8, 30, 70, 100, 120, 150];

        await convRatesInst.setImbalanceStepFunction(tokens[index], imbalanceBuyStepX, imbalanceBuyStepY, imbalanceSellStepX, imbalanceSellStepY, {from:operator});

        imbalanceBuyStepY = [-10001, 30, 70, 100, 120, 150];
        try {
            await convRatesInst.setImbalanceStepFunction(tokens[index], imbalanceBuyStepX, imbalanceBuyStepY, imbalanceSellStepX, imbalanceSellStepY, {from:operator});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        imbalanceBuyStepY = [8, 30, 70, 100, 120, 150];
        imbalanceSellStepY = [-10001, 30, 70, 100, 120, 150];
        try {
            await convRatesInst.setImbalanceStepFunction(tokens[index], imbalanceBuyStepX, imbalanceBuyStepY, imbalanceSellStepX, imbalanceSellStepY, {from:operator});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        imbalanceSellStepY = [-10000, 30, 70, 100, 120, 150];
        await convRatesInst.setImbalanceStepFunction(tokens[index], imbalanceBuyStepX, imbalanceBuyStepY, imbalanceSellStepX, imbalanceSellStepY, {from:operator});

        imbalanceBuyStepY = [-10000, 30, 70, 100, 120, 150];
        imbalanceSellStepY = [8, 30, 70, 100, 120, 150];
        await convRatesInst.setImbalanceStepFunction(tokens[index], imbalanceBuyStepX, imbalanceBuyStepY, imbalanceSellStepX, imbalanceSellStepY, {from:operator});
    });

    it("should verify set step functions for imbalance reverted when step Y greater than max bps adjustment", async function () {
        let index = 1;

        imbalanceBuyStepX = [15, 30, 70, 100, 200];
        imbalanceBuyStepY = [8, 30, 70, 100, 120, 10000];
        imbalanceSellStepX = [15, 30, 70, 100, 200];
        imbalanceSellStepY = [8, 30, 70, 100, 120, 150];

        await convRatesInst.setImbalanceStepFunction(tokens[index], imbalanceBuyStepX, imbalanceBuyStepY, imbalanceSellStepX, imbalanceSellStepY, {from:operator});

        imbalanceBuyStepY = [15, 30, 70, 100, 120, 10001];
        try {
            await convRatesInst.setImbalanceStepFunction(tokens[index], imbalanceBuyStepX, imbalanceBuyStepY, imbalanceSellStepX, imbalanceSellStepY, {from:operator});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        imbalanceBuyStepY = [8, 30, 70, 100, 120, 150];
        imbalanceSellStepY = [0, 30, 70, 100, 120, 10001];
        try {
            await convRatesInst.setImbalanceStepFunction(tokens[index], imbalanceBuyStepX, imbalanceBuyStepY, imbalanceSellStepX, imbalanceSellStepY, {from:operator});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        imbalanceSellStepY = [0, 30, 70, 100, 120, 10000];
        await convRatesInst.setImbalanceStepFunction(tokens[index], imbalanceBuyStepX, imbalanceBuyStepY, imbalanceSellStepX, imbalanceSellStepY, {from:operator});

        imbalanceBuyStepY = [0, 30, 70, 100, 120, 10000];
        imbalanceSellStepY = [8, 30, 70, 100, 120, 150];
        await convRatesInst.setImbalanceStepFunction(tokens[index], imbalanceBuyStepX, imbalanceBuyStepY, imbalanceSellStepX, imbalanceSellStepY, {from:operator});
    });

    it("should verify set step functions for imbalance reverted when step x is max value (2**127-1)", async function () {
        let index = 1;

        imbalanceBuyStepX = [15, 30, 70, 100, 200];
        imbalanceBuyStepY = [8, 30, 70, 100, 120, 150];
        imbalanceSellStepX = [15, 30, 70, 100, 200];
        imbalanceSellStepY = [8, 30, 70, 100, 120, 150];

        await convRatesInst.setImbalanceStepFunction(tokens[index], imbalanceBuyStepX, imbalanceBuyStepY, imbalanceSellStepX, imbalanceSellStepY, {from:operator});

<<<<<<< HEAD
        imbalanceBuyStepX = [15, 30, 70, 100, (new BN(2)).pow(new BN(127)).sub(new BN(1))];
=======
        imbalanceBuyStepX = [15, 30, 70, 100, (new BigNumber(2)).pow(127).sub(1).valueOf()];
>>>>>>> Development to Master. Istanbul changes. buidl. (#471)
        try {
            await convRatesInst.setImbalanceStepFunction(tokens[index], imbalanceBuyStepX, imbalanceBuyStepY, imbalanceSellStepX, imbalanceSellStepY, {from:operator});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        imbalanceBuyStepX = [15, 30, 70, 100, 200];
<<<<<<< HEAD
        imbalanceSellStepX = [15, 30, 70, 100, (new BN(2)).pow(new BN(127)).sub(new BN(1))];
=======
        imbalanceSellStepX = [15, 30, 70, 100, (new BigNumber(2)).pow(127).sub(1).valueOf()];
>>>>>>> Development to Master. Istanbul changes. buidl. (#471)
        try {
            await convRatesInst.setImbalanceStepFunction(tokens[index], imbalanceBuyStepX, imbalanceBuyStepY, imbalanceSellStepX, imbalanceSellStepY, {from:operator});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

<<<<<<< HEAD
        imbalanceSellStepX = [15, 30, 70, 100, (new BN(2)).pow(new BN(127)).sub(new BN(2))];
        imbalanceBuyStepX = [15, 30, 70, 100, (new BN(2)).pow(new BN(127)).sub(new BN(2))];
=======
        imbalanceSellStepX = [15, 30, 70, 100, (new BigNumber(2)).pow(127).sub(2).valueOf()];
        imbalanceBuyStepX = [15, 30, 70, 100, (new BigNumber(2)).pow(127).sub(2).valueOf()];
>>>>>>> Development to Master. Istanbul changes. buidl. (#471)
        await convRatesInst.setImbalanceStepFunction(tokens[index], imbalanceBuyStepX, imbalanceBuyStepY, imbalanceSellStepX, imbalanceSellStepY, {from:operator});
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

    it("should verify getImbalancePerToken returns correct data as recorded or when overflow.", async function () {
        let tokenInd = 5;

        currentBlock = await Helper.getCurrentBlock();

        // Getting imbalance after add
        let curImbalance = await convRatesInst.getImbalancePerToken(tokens[tokenInd], currentBlock);
        //now the same from reserve address
        await convRatesInst.recordImbalance(tokens[tokenInd], 30, 0, currentBlock, {from: reserveAddress});
        let newImbalance = await convRatesInst.getImbalancePerToken(tokens[tokenInd], currentBlock);
<<<<<<< HEAD
        let expectedImbalance = curImbalance[0].add(new BN(30));
        Helper.assertEqual(expectedImbalance, newImbalance[0], "total imbalance does not match");
        let expectedBlockImbalance = curImbalance[1].add(new BN(30));
        Helper.assertEqual(expectedBlockImbalance, newImbalance[1], "block imbalance does not match");
=======
        let expectedImbalance = curImbalance[0].add(30);
        assert.equal(expectedImbalance.valueOf(), newImbalance[0].valueOf(), "total imbalance does not match");
        let expectedBlockImbalance = curImbalance[1].add(30);
        assert.equal(expectedBlockImbalance.valueOf(), newImbalance[1].valueOf(), "block imbalance does not match");
>>>>>>> Development to Master. Istanbul changes. buidl. (#471)

        // Getting imbalance after sub
        await convRatesInst.recordImbalance(tokens[tokenInd], -30, 0, currentBlock, {from: reserveAddress});
        newImbalance = await convRatesInst.getImbalancePerToken(tokens[tokenInd], currentBlock);
<<<<<<< HEAD
        expectedImbalance = expectedImbalance.sub(new BN(30));
        Helper.assertEqual(expectedImbalance, newImbalance[0], "total imbalance does not match");
        expectedBlockImbalance = expectedBlockImbalance.sub(new BN(30));
        Helper.assertEqual(expectedBlockImbalance, newImbalance[1], "block imbalance does not match");

        newImbalance = await convRatesInst.getImbalancePerToken(tokens[tokenInd], currentBlock);
        let imbalanceBlock0 = await convRatesInst.getImbalancePerToken(tokens[tokenInd], 0);
        Helper.assertEqual(newImbalance[0], imbalanceBlock0[0], "imbalance must be the same when sending 0 as current block");
        Helper.assertEqual(newImbalance[1], imbalanceBlock0[1], "imbalance must be the same when sending 0 as current block");

        // Getting imbalance + block imbal overflow
        let maxValue = (new BN(2)).pow(new BN(255)).sub(new BN(1)); // 2^255 - 1
        let newAddImbalAmount = (new BN(2).pow(new BN(10))).sub(expectedImbalance);
        try {
            // set big resolution so it will overflow and return default max value
            await convRatesInst.recordImbalance(tokens[tokenInd], newAddImbalAmount, 0, currentBlock, {from: reserveAddress});
            await convRatesInst.setTokenControlInfo(tokens[tokenInd], maxValue, maxPerBlockImbalance, maxTotalImbalance);
            newImbalance = await convRatesInst.getImbalancePerToken(tokens[tokenInd], currentBlock);
            let imbalanceMax = await convRatesInst.mockGetImbalanceMax();
            Helper.assertEqual(imbalanceMax, newImbalance[1], "block imbalance does not match");
            Helper.assertEqual(imbalanceMax, newImbalance[0], "total imbalance does not match");

            expectedBlockImbalance = expectedBlockImbalance.add(newAddImbalAmount);
            expectedBlockImbalance = expectedBlockImbalance.div(new BN(minimalRecordResolution));
            expectedImbalance = expectedImbalance.add(newAddImbalAmount);
            expectedImbalance = expectedImbalance.div(new BN(minimalRecordResolution));
=======
        expectedImbalance = expectedImbalance.sub(30);
        assert.equal(expectedImbalance.valueOf(), newImbalance[0].valueOf(), "total imbalance does not match");
        expectedBlockImbalance = expectedBlockImbalance.sub(30);
        assert.equal(expectedBlockImbalance.valueOf(), newImbalance[1].valueOf(), "block imbalance does not match");

        newImbalance = await convRatesInst.getImbalancePerToken(tokens[tokenInd], currentBlock);
        let imbalanceBlock0 = await convRatesInst.getImbalancePerToken(tokens[tokenInd], 0);
        assert.equal(newImbalance[0].valueOf(), imbalanceBlock0[0].valueOf(), "imbalance must be the same when sending 0 as current block");
        assert.equal(newImbalance[1].valueOf(), imbalanceBlock0[1].valueOf(), "imbalance must be the same when sending 0 as current block");

        // Getting imbalance + block imbal overflow
        let maxValue = (new BigNumber(2)).pow(255).sub(1); // 2^255 - 1
        let newAddImbalAmount = (new BigNumber(2).pow(10)).sub(expectedImbalance);
        try {
            // set big resolution so it will overflow and return default max value
            await convRatesInst.recordImbalance(tokens[tokenInd], newAddImbalAmount, 0, currentBlock, {from: reserveAddress});
            await convRatesInst.setTokenControlInfo(tokens[tokenInd], maxValue.valueOf(), maxPerBlockImbalance, maxTotalImbalance);
            newImbalance = await convRatesInst.getImbalancePerToken(tokens[tokenInd], currentBlock);
            let imbalanceMax = await convRatesInst.mockGetImbalanceMax();
            assert.equal(imbalanceMax.valueOf(), newImbalance[1].valueOf(), "block imbalance does not match");
            assert.equal(imbalanceMax.valueOf(), newImbalance[0].valueOf(), "total imbalance does not match");

            expectedBlockImbalance = expectedBlockImbalance.add(newAddImbalAmount);
            expectedBlockImbalance = expectedBlockImbalance.div(minimalRecordResolution);
            expectedImbalance = expectedImbalance.add(newAddImbalAmount);
            expectedImbalance = expectedImbalance.div(minimalRecordResolution);
>>>>>>> Development to Master. Istanbul changes. buidl. (#471)

            // set smaller resolution so it won't overflow
            let newResolution = 10;
            await convRatesInst.setTokenControlInfo(tokens[tokenInd], newResolution, maxPerBlockImbalance, maxTotalImbalance);
<<<<<<< HEAD
            expectedBlockImbalance = expectedBlockImbalance.mul(new BN(newResolution));
            expectedImbalance = expectedImbalance.mul(new BN(newResolution));
            newImbalance = await convRatesInst.getImbalancePerToken(tokens[tokenInd], currentBlock);
            Helper.assertEqual(expectedBlockImbalance, newImbalance[1], "block imbalance does not match");
            Helper.assertEqual(expectedImbalance, newImbalance[0], "total imbalance does not match");
=======
            expectedBlockImbalance = expectedBlockImbalance.mul(newResolution);
            expectedImbalance = expectedImbalance.mul(newResolution);
            newImbalance = await convRatesInst.getImbalancePerToken(tokens[tokenInd], currentBlock);
            assert.equal(expectedBlockImbalance.valueOf(), newImbalance[1].valueOf(), "block imbalance does not match");
            assert.equal(expectedImbalance.valueOf(), newImbalance[0].valueOf(), "total imbalance does not match");
>>>>>>> Development to Master. Istanbul changes. buidl. (#471)

            // fallback to default config
            await convRatesInst.setTokenControlInfo(tokens[tokenInd], minimalRecordResolution, maxPerBlockImbalance, maxTotalImbalance);
        } catch (e) {
            // fallback to default config
            await convRatesInst.setTokenControlInfo(tokens[tokenInd], minimalRecordResolution, maxPerBlockImbalance, maxTotalImbalance);
            assert(false, "Unexpected throw with error: " + e);
        }
    });

    it("should test getting bps from executing step function as expected", async function () {
        let tokenInd = 1;
        let token = tokens[tokenInd];
        // Case1: from < to < all step Xs
        let stepX = [-200, -100, -50];
        let stepY = [-20, -10, -5, -2];
        await convRatesInst.setImbalanceStepFunction(token, stepX, stepY, stepX, stepY, {from:operator});
        let bps = getExtraBpsForQuantity(-400, -300, stepX, stepY);
        // 100 * -20
<<<<<<< HEAD
        Helper.assertEqual(-20, bps, "bad bps");
        let contractBps = await convRatesInst.mockExecuteStepFunction(token, -400, -300);
        Helper.assertEqual(contractBps, bps, "bad bps");
=======
        assert.equal(-20, bps, "bad bps");
        let contractBps = await convRatesInst.mockExecuteStepFunction(token, -400, -300);
        assert.equal(contractBps.valueOf(), bps, "bad bps");
>>>>>>> Development to Master. Istanbul changes. buidl. (#471)

        // Case2: qty negative, all steps < qty < 0
        stepX = [-200, -100, -50];
        stepY = [-20, -10, -5, -2];
        bps = getExtraBpsForQuantity(-25, 0, stepX, stepY);
        // 25 * -2
<<<<<<< HEAD
        Helper.assertEqual(-2, bps, "bad bps");
        await convRatesInst.setImbalanceStepFunction(token, stepX, stepY, stepX, stepY, {from:operator});
        contractBps = await convRatesInst.mockExecuteStepFunction(token, -25, 0);
        Helper.assertEqual(contractBps, bps, "bad bps");
=======
        assert.equal(-2, bps, "bad bps");
        await convRatesInst.setImbalanceStepFunction(token, stepX, stepY, stepX, stepY, {from:operator});
        contractBps = await convRatesInst.mockExecuteStepFunction(token, -25, 0);
        assert.equal(contractBps.valueOf(), bps, "bad bps");
>>>>>>> Development to Master. Istanbul changes. buidl. (#471)

        // Case2: first step < from < last step < to
        stepX = [-200, -100, -50];
        stepY = [-20, -10, -5, -2];
        bps = getExtraBpsForQuantity(-75, 10, stepX, stepY);
        // 25 * (-5) + 60 * (-2)
<<<<<<< HEAD
        Helper.assertEqual(divSolidity(-245, 85), bps, "bad bps");
        await convRatesInst.setImbalanceStepFunction(token, stepX, stepY, stepX, stepY, {from:operator});
        contractBps = await convRatesInst.mockExecuteStepFunction(token, -75, 10);
        Helper.assertEqual(contractBps, bps, "bad bps");
=======
        assert.equal(divSolidity(-245, 85), bps, "bad bps");
        await convRatesInst.setImbalanceStepFunction(token, stepX, stepY, stepX, stepY, {from:operator});
        contractBps = await convRatesInst.mockExecuteStepFunction(token, -75, 10);
        assert.equal(contractBps.valueOf(), bps, "bad bps");
>>>>>>> Development to Master. Istanbul changes. buidl. (#471)

        // Case3: from < first step < second last step < to < last step
        stepX = [-200, -100, -50, 0];
        stepY = [-20, -10, -5, 1, 5];
        // 100 * (-20) + 100 * (-10) + 50 * (-5) + 20 * 1 = -3230
        bps = getExtraBpsForQuantity(-300, -25, stepX, stepY);
<<<<<<< HEAD
        Helper.assertEqual(divSolidity(-3230, 275), bps, "bad bps 1");
        await convRatesInst.setImbalanceStepFunction(token, stepX, stepY, stepX, stepY, {from:operator});
        contractBps = await convRatesInst.mockExecuteStepFunction(token, -300, -25);
        Helper.assertEqual(contractBps, bps, "bad bps 2");
=======
        assert.equal(divSolidity(-3230, 275), bps, "bad bps 1");
        await convRatesInst.setImbalanceStepFunction(token, stepX, stepY, stepX, stepY, {from:operator});
        contractBps = await convRatesInst.mockExecuteStepFunction(token, -300, -25);
        assert.equal(contractBps.valueOf(), bps, "bad bps 2");
>>>>>>> Development to Master. Istanbul changes. buidl. (#471)

        // Case4: from < first step < last step < to
        stepX = [-200, -100, -50, 10];
        stepY = [-20, -10, -5, 2, 5];
        // 100 * (-20) + 100 * (-10) + 50 * (-5) + 60 * 2 + 5 * 5 = -3105
        bps = getExtraBpsForQuantity(-300, 15, stepX, stepY);
<<<<<<< HEAD
        Helper.assertEqual(divSolidity(-3105, 315), bps, "bad bps 1");
        await convRatesInst.setImbalanceStepFunction(token, stepX, stepY, stepX, stepY, {from:operator});
        contractBps = await convRatesInst.mockExecuteStepFunction(token, -300, 15);
        Helper.assertEqual(contractBps, bps, "bad bps 2");
=======
        assert.equal(divSolidity(-3105, 315), bps, "bad bps 1");
        await convRatesInst.setImbalanceStepFunction(token, stepX, stepY, stepX, stepY, {from:operator});
        contractBps = await convRatesInst.mockExecuteStepFunction(token, -300, 15);
        assert.equal(contractBps.valueOf(), bps, "bad bps 2");
>>>>>>> Development to Master. Istanbul changes. buidl. (#471)

        // Case5: first step < from < last step < to
        // 50 * (-10) + 50 * (-5) + 60 * 2  + 10 * 5 = -580
        bps = getExtraBpsForQuantity(-150, 20, stepX, stepY);
<<<<<<< HEAD
        Helper.assertEqual(divSolidity(-580, 170), bps, "bad bps");
        await convRatesInst.setImbalanceStepFunction(token, stepX, stepY, stepX, stepY, {from:operator});
        contractBps = await convRatesInst.mockExecuteStepFunction(token, -150, 20);
        Helper.assertEqual(contractBps, bps, "bad bps");
=======
        assert.equal(divSolidity(-580, 170), bps, "bad bps");
        await convRatesInst.setImbalanceStepFunction(token, stepX, stepY, stepX, stepY, {from:operator});
        contractBps = await convRatesInst.mockExecuteStepFunction(token, -150, 20);
        assert.equal(contractBps.valueOf(), bps, "bad bps");
>>>>>>> Development to Master. Istanbul changes. buidl. (#471)

        // Case6: from < 0 = first step = to
        stepX = [0, 10, 20, 30];
        stepY = [0, 20, 50, 100, 120];
        bps = getExtraBpsForQuantity(-100, 0, stepX, stepY);
<<<<<<< HEAD
        Helper.assertEqual(0, bps, "bad bps for negative qty with all non-negative qty");
        await convRatesInst.setImbalanceStepFunction(token, stepX, stepY, stepX, stepY, {from:operator});
        contractBps = await convRatesInst.mockExecuteStepFunction(token, -100, 0);
        Helper.assertEqual(contractBps, bps, "bad bps");
=======
        assert.equal(0, bps, "bad bps for negative qty with all non-negative qty");
        await convRatesInst.setImbalanceStepFunction(token, stepX, stepY, stepX, stepY, {from:operator});
        contractBps = await convRatesInst.mockExecuteStepFunction(token, -100, 0);
        assert.equal(contractBps.valueOf(), bps, "bad bps");
>>>>>>> Development to Master. Istanbul changes. buidl. (#471)

        // Case7: from < 0 < first step < to < last step
        stepX = [10, 20, 30];
        stepY = [20, 50, 100, 120];
        bps = getExtraBpsForQuantity(-100, 5, stepX, stepY);
<<<<<<< HEAD
        Helper.assertEqual(20, bps, "bad bps for negative qty with all non-negative qty");
        await convRatesInst.setImbalanceStepFunction(token, stepX, stepY, stepX, stepY, {from:operator});
        contractBps = await convRatesInst.mockExecuteStepFunction(token, -100, 5);
        Helper.assertEqual(contractBps, bps, "bad bps");
=======
        assert.equal(20, bps, "bad bps for negative qty with all non-negative qty");
        await convRatesInst.setImbalanceStepFunction(token, stepX, stepY, stepX, stepY, {from:operator});
        contractBps = await convRatesInst.mockExecuteStepFunction(token, -100, 5);
        assert.equal(contractBps.valueOf(), bps, "bad bps");
>>>>>>> Development to Master. Istanbul changes. buidl. (#471)

        // Case8: from = to
        stepX = [10, 20, 30];
        stepY = [20, 50, 100, 120];
        bps = getExtraBpsForQuantity(0, 0, stepX, stepY);
<<<<<<< HEAD
        Helper.assertEqual(0, bps, "bad bps for 0 qty");
        contractBps = await convRatesInst.mockExecuteStepFunction(token, 0, 0);
        await convRatesInst.setImbalanceStepFunction(token, stepX, stepY, stepX, stepY, {from:operator});
        Helper.assertEqual(contractBps, bps, "bad bps");
=======
        assert.equal(0, bps, "bad bps for 0 qty");
        contractBps = await convRatesInst.mockExecuteStepFunction(token, 0, 0);
        await convRatesInst.setImbalanceStepFunction(token, stepX, stepY, stepX, stepY, {from:operator});
        assert.equal(contractBps.valueOf(), bps, "bad bps");
>>>>>>> Development to Master. Istanbul changes. buidl. (#471)

        stepX = [-100, -50, -30];
        stepY = [20, 50, 100, 120];
        bps = getExtraBpsForQuantity(120, 120, stepX, stepY);
<<<<<<< HEAD
        Helper.assertEqual(0, bps, "bad bps for 0 qty");
        await convRatesInst.setImbalanceStepFunction(token, stepX, stepY, stepX, stepY, {from:operator});
        contractBps = await convRatesInst.mockExecuteStepFunction(token, 120, 120);
        Helper.assertEqual(contractBps, bps, "bad bps");
=======
        assert.equal(0, bps, "bad bps for 0 qty");
        await convRatesInst.setImbalanceStepFunction(token, stepX, stepY, stepX, stepY, {from:operator});
        contractBps = await convRatesInst.mockExecuteStepFunction(token, 120, 120);
        assert.equal(contractBps.valueOf(), bps, "bad bps");
>>>>>>> Development to Master. Istanbul changes. buidl. (#471)

        // Case9: last step < 0 < from < to
        stepX = [-100, -50, -30];
        stepY = [20, 50, 100, 120];
        bps = getExtraBpsForQuantity(0, 20, stepX, stepY);
<<<<<<< HEAD
        Helper.assertEqual(120, bps, "bad bps for 0 qty");
        await convRatesInst.setImbalanceStepFunction(token, stepX, stepY, stepX, stepY, {from:operator});
        contractBps = await convRatesInst.mockExecuteStepFunction(token, 0, 20);
        Helper.assertEqual(contractBps, bps, "bad bps");
=======
        assert.equal(120, bps, "bad bps for 0 qty");
        await convRatesInst.setImbalanceStepFunction(token, stepX, stepY, stepX, stepY, {from:operator});
        contractBps = await convRatesInst.mockExecuteStepFunction(token, 0, 20);
        assert.equal(contractBps.valueOf(), bps, "bad bps");
>>>>>>> Development to Master. Istanbul changes. buidl. (#471)

        // Case10: from = 0 < first step < to < last step
        stepX = [10, 30, 50];
        stepY = [20, 50, 100, 120];
        bps = getExtraBpsForQuantity(0, 40, stepX, stepY);
        // (10 * 20 + 20 * 50 + 10 * 100) = 2200
<<<<<<< HEAD
        Helper.assertEqual(divSolidity(2200, 40), bps, "bad bps for positive qty not all steps");
        await convRatesInst.setImbalanceStepFunction(token, stepX, stepY, stepX, stepY, {from:operator});
        contractBps = await convRatesInst.mockExecuteStepFunction(token, 0, 40);
        Helper.assertEqual(contractBps, bps, "bad bps");
=======
        assert.equal(divSolidity(2200, 40), bps, "bad bps for positive qty not all steps");
        await convRatesInst.setImbalanceStepFunction(token, stepX, stepY, stepX, stepY, {from:operator});
        contractBps = await convRatesInst.mockExecuteStepFunction(token, 0, 40);
        assert.equal(contractBps.valueOf(), bps, "bad bps");
>>>>>>> Development to Master. Istanbul changes. buidl. (#471)

        // Case11: from = 0 < all step < to
        stepX = [10, 30, 50];
        stepY = [20, 50, 100, 120];
        bps = getExtraBpsForQuantity(0, 120, stepX, stepY);
        // (10 * 20 + 20 * 50 + 20 * 100 + 70 * 120) = 11600
<<<<<<< HEAD
        Helper.assertEqual(divSolidity(11600, 120), bps, "bad bps for positive qty all steps");
        await convRatesInst.setImbalanceStepFunction(token, stepX, stepY, stepX, stepY, {from:operator});
        contractBps = await convRatesInst.mockExecuteStepFunction(token, 0, 120);
        Helper.assertEqual(contractBps, bps, "bad bps");
=======
        assert.equal(divSolidity(11600, 120), bps, "bad bps for positive qty all steps");
        await convRatesInst.setImbalanceStepFunction(token, stepX, stepY, stepX, stepY, {from:operator});
        contractBps = await convRatesInst.mockExecuteStepFunction(token, 0, 120);
        assert.equal(contractBps.valueOf(), bps, "bad bps");
>>>>>>> Development to Master. Istanbul changes. buidl. (#471)

        // Case12: first step < 0 = from < to < last step
        stepX = [-100, -50, 10, 30, 150];
        stepY = [-30, -15, 20, 50, 100, 120];
        bps = getExtraBpsForQuantity(0, 120, stepX, stepY);
        // (10 * 20 + 20 * 50 + 20 * 100 + 70 * 100) = 10200
<<<<<<< HEAD
        Helper.assertEqual(divSolidity(10200, 120), bps, "bad bps for positive qty all steps");
        await convRatesInst.setImbalanceStepFunction(token, stepX, stepY, stepX, stepY, {from:operator});
        contractBps = await convRatesInst.mockExecuteStepFunction(token, 0, 120);
        Helper.assertEqual(contractBps, bps, "bad bps");
=======
        assert.equal(divSolidity(10200, 120), bps, "bad bps for positive qty all steps");
        await convRatesInst.setImbalanceStepFunction(token, stepX, stepY, stepX, stepY, {from:operator});
        contractBps = await convRatesInst.mockExecuteStepFunction(token, 0, 120);
        assert.equal(contractBps.valueOf(), bps, "bad bps");
>>>>>>> Development to Master. Istanbul changes. buidl. (#471)

        // Case13: X is empty
        stepX = [];
        stepY = [2];
        bps = getExtraBpsForQuantity(0, 120, stepX, stepY);
<<<<<<< HEAD
        Helper.assertEqual(2, bps, "bad bps: should be 0 when step is empty");
        await convRatesInst.setImbalanceStepFunction(token, stepX, stepY, stepX, stepY, {from:operator});
        contractBps = await convRatesInst.mockExecuteStepFunction(token, 0, 120);
        Helper.assertEqual(contractBps, bps, "bad bps");
=======
        assert.equal(2, bps, "bad bps: should be 0 when step is empty");
        await convRatesInst.setImbalanceStepFunction(token, stepX, stepY, stepX, stepY, {from:operator});
        contractBps = await convRatesInst.mockExecuteStepFunction(token, 0, 120);
        assert.equal(contractBps.valueOf(), bps, "bad bps");
>>>>>>> Development to Master. Istanbul changes. buidl. (#471)

        // Case14: Step fall into step with y = -10000
        stepX = [-100, 100, 200, 300];
        stepY = [0, -100, -200, -300, -10000];
        bps = getExtraBpsForQuantity(0, 301, stepX, stepY);
<<<<<<< HEAD
        Helper.assertEqual(-10000, bps, "bad bps: should be -10000 when fall into step with y = -10000");
        await convRatesInst.setImbalanceStepFunction(token, stepX, stepY, stepX, stepY, {from:operator});
        contractBps = await convRatesInst.mockExecuteStepFunction(token, 0, 301);
        Helper.assertEqual(contractBps, bps, "bad bps");

        bps = getExtraBpsForQuantity(301, 1000, stepX, stepY);
        Helper.assertEqual(-10000, bps, "bad bps: should be -10000 when fall into step with y = -10000");
        await convRatesInst.setImbalanceStepFunction(token, stepX, stepY, stepX, stepY, {from:operator});
        contractBps = await convRatesInst.mockExecuteStepFunction(token, 301, 10000);
        Helper.assertEqual(contractBps, bps, "bad bps");

        stepY = [-10000, -100, -200, -300, -500];
        bps = getExtraBpsForQuantity(-101, 0, stepX, stepY);
        Helper.assertEqual(-10000, bps, "bad bps: should be -10000 when fall into step with y = -10000");
        await convRatesInst.setImbalanceStepFunction(token, stepX, stepY, stepX, stepY, {from:operator});
        contractBps = await convRatesInst.mockExecuteStepFunction(token, -101, 0);
        Helper.assertEqual(contractBps, bps, "bad bps");

        bps = getExtraBpsForQuantity(-200, -101, stepX, stepY);
        Helper.assertEqual(-10000, bps, "bad bps: should be -10000 when fall into step with y = -10000");
        await convRatesInst.setImbalanceStepFunction(token, stepX, stepY, stepX, stepY, {from:operator});
        contractBps = await convRatesInst.mockExecuteStepFunction(token, -200, -101);
        Helper.assertEqual(contractBps, bps, "bad bps");
=======
        assert.equal(-10000, bps, "bad bps: should be -10000 when fall into step with y = -10000");
        await convRatesInst.setImbalanceStepFunction(token, stepX, stepY, stepX, stepY, {from:operator});
        contractBps = await convRatesInst.mockExecuteStepFunction(token, 0, 301);
        assert.equal(contractBps.valueOf(), bps, "bad bps");

        bps = getExtraBpsForQuantity(301, 1000, stepX, stepY);
        assert.equal(-10000, bps, "bad bps: should be -10000 when fall into step with y = -10000");
        await convRatesInst.setImbalanceStepFunction(token, stepX, stepY, stepX, stepY, {from:operator});
        contractBps = await convRatesInst.mockExecuteStepFunction(token, 301, 10000);
        assert.equal(contractBps.valueOf(), bps, "bad bps");

        stepY = [-10000, -100, -200, -300, -500];
        bps = getExtraBpsForQuantity(-101, 0, stepX, stepY);
        assert.equal(-10000, bps, "bad bps: should be -10000 when fall into step with y = -10000");
        await convRatesInst.setImbalanceStepFunction(token, stepX, stepY, stepX, stepY, {from:operator});
        contractBps = await convRatesInst.mockExecuteStepFunction(token, -101, 0);
        assert.equal(contractBps.valueOf(), bps, "bad bps");

        bps = getExtraBpsForQuantity(-200, -101, stepX, stepY);
        assert.equal(-10000, bps, "bad bps: should be -10000 when fall into step with y = -10000");
        await convRatesInst.setImbalanceStepFunction(token, stepX, stepY, stepX, stepY, {from:operator});
        contractBps = await convRatesInst.mockExecuteStepFunction(token, -200, -101);
        assert.equal(contractBps.valueOf(), bps, "bad bps");
>>>>>>> Development to Master. Istanbul changes. buidl. (#471)

        // Spyros tests, current imbalance = 0
        stepX = [10, 20, 30];
        stepY = [0,-10,-20,-10000];
        // amount 10, bps is 0
        bps = getExtraBpsForQuantity(0, 10, stepX, stepY);
<<<<<<< HEAD
        Helper.assertEqual(0, bps, "bad bps: should be 0");
        await convRatesInst.setImbalanceStepFunction(token, stepX, stepY, stepX, stepY, {from:operator});
        contractBps = await convRatesInst.mockExecuteStepFunction(token, 0, 10);
        Helper.assertEqual(contractBps, bps, "bad bps");
        // amount 11, bps is (0 * 10 + -10 * 1) / 11
        bps = getExtraBpsForQuantity(0, 11, stepX, stepY);
        Helper.assertEqual(divSolidity(-10, 11), bps, "bad bps");
        await convRatesInst.setImbalanceStepFunction(token, stepX, stepY, stepX, stepY, {from:operator});
        contractBps = await convRatesInst.mockExecuteStepFunction(token, 0, 11);
        Helper.assertEqual(contractBps, bps, "bad bps");
        // amount 29, bps is (0 * 10 + -10 * 10 + -20 * 9) / 29 = -10
        bps = getExtraBpsForQuantity(0, 29, stepX, stepY);
        Helper.assertEqual(divSolidity(-280, 29), bps, "bad bps");
        await convRatesInst.setImbalanceStepFunction(token, stepX, stepY, stepX, stepY, {from:operator});
        contractBps = await convRatesInst.mockExecuteStepFunction(token, 0, 29);
        Helper.assertEqual(contractBps, bps, "bad bps");
        // amount 31, bps is -10000, rate is 0
        bps = getExtraBpsForQuantity(0, 31, stepX, stepY);
        Helper.assertEqual(-10000, bps, "bad bps: should be -10000");
        await convRatesInst.setImbalanceStepFunction(token, stepX, stepY, stepX, stepY, {from:operator});
        contractBps = await convRatesInst.mockExecuteStepFunction(token, 0, 31);
        Helper.assertEqual(contractBps, bps, "bad bps");
=======
        assert.equal(0, bps, "bad bps: should be 0");
        await convRatesInst.setImbalanceStepFunction(token, stepX, stepY, stepX, stepY, {from:operator});
        contractBps = await convRatesInst.mockExecuteStepFunction(token, 0, 10);
        assert.equal(contractBps.valueOf(), bps, "bad bps");
        // amount 11, bps is (0 * 10 + -10 * 1) / 11
        bps = getExtraBpsForQuantity(0, 11, stepX, stepY);
        assert.equal(divSolidity(-10, 11), bps, "bad bps");
        await convRatesInst.setImbalanceStepFunction(token, stepX, stepY, stepX, stepY, {from:operator});
        contractBps = await convRatesInst.mockExecuteStepFunction(token, 0, 11);
        assert.equal(contractBps.valueOf(), bps, "bad bps");
        // amount 29, bps is (0 * 10 + -10 * 10 + -20 * 9) / 29 = -10
        bps = getExtraBpsForQuantity(0, 29, stepX, stepY);
        assert.equal(divSolidity(-280, 29), bps, "bad bps");
        await convRatesInst.setImbalanceStepFunction(token, stepX, stepY, stepX, stepY, {from:operator});
        contractBps = await convRatesInst.mockExecuteStepFunction(token, 0, 29);
        assert.equal(contractBps.valueOf(), bps, "bad bps");
        // amount 31, bps is -10000, rate is 0
        bps = getExtraBpsForQuantity(0, 31, stepX, stepY);
        assert.equal(-10000, bps, "bad bps: should be -10000");
        await convRatesInst.setImbalanceStepFunction(token, stepX, stepY, stepX, stepY, {from:operator});
        contractBps = await convRatesInst.mockExecuteStepFunction(token, 0, 31);
        assert.equal(contractBps.valueOf(), bps, "bad bps");
>>>>>>> Development to Master. Istanbul changes. buidl. (#471)
    });
});

function convertRateToPricingRate (baseRate) {
// conversion rate in pricing is in precision units (10 ** 18) so
// rate 1 to 50 is 50 * 10 ** 18
// rate 50 to 1 is 1 / 50 * 10 ** 18
<<<<<<< HEAD
    return (new BN(10).pow(new BN(18))).mul(new BN(baseRate));
=======
    return ((new BigNumber(10).pow(18)).mul(baseRate).floor());
>>>>>>> Development to Master. Istanbul changes. buidl. (#471)
};

function getExtraBpsForImbalanceBuyQuantity(current, qty) {
    return getExtraBpsForQuantity(current, current + qty, imbalanceBuyStepX, imbalanceBuyStepY);
};

function getExtraBpsForImbalanceSellQuantity(current, qty) {
    return getExtraBpsForQuantity(current - qty, current, imbalanceSellStepX, imbalanceSellStepY);
};

function getExtraBpsForQuantity(from, to, stepX, stepY) {
    if (stepY.length == 0) { return 0; }
    let len = stepX.length;
    if (from == to) {
        return 0;
    }
    let change = 0;
    let qty = to - from;
    for(let i = 0; i < len; i++) {
        if (stepX[i] <= from) { continue; }
        if (stepY[i] == -10000) { return -10000; }
        if (stepX[i] >= to) {
            change += (to - from) * stepY[i];
            from = to;
            break;
        } else {
            change += (stepX[i] - from) * stepY[i];
            from = stepX[i];
        }
    }
    if (from < to) {
        if (stepY[len] == -10000) { return -10000; }
        change += (to - from) * stepY[len];
    }
    return divSolidity(change, qty);
}

<<<<<<< HEAD
=======
function addBps (rate, bps) {
    return (rate.mul(10000 + bps).div(10000));
};

>>>>>>> Development to Master. Istanbul changes. buidl. (#471)
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