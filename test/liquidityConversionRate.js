let LiquidityConversionRates = artifacts.require("./LiquidityConversionRates.sol");
let ConversionRates = artifacts.require("./mockContracts/MockConversionRate.sol");
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
let comID_BuyRateStpQtyXLength = 0;
let comID_BuyRateStpQtyParamX = 1;
let comID_BuyRateStpQtyYLength = 2;
let comID_BuyRateStpQtyParamY = 3;

let comID_SellRateStpQtyXLength = 4;
let comID_SellRateStpQtyParamX = 5;
let comID_SellRateStpQtyYLength = 6;
let comID_SellRateStpQtyParamY = 7;

let comID_BuyRateStpImbalanceXLength = 8;
let comID_BuyRateStpImbalanceParamX = 9;
let comID_BuyRateStpImbalanceYLength = 10;
let comID_BuyRateStpImbalanceParamY = 11;

let comID_SellRateStpImbalanceXLength = 12;
let comID_SellRateStpImbalanceParamX = 13;
let comID_SellRateStpImbalanceYLength = 14;
let comID_SellRateStpImbalanceParamY = 15;

//////////////////////////////
const e = new BigNumber("2.7182818284590452353602874713527");
const expectedDiffInPct = new BigNumber(1/100);
const PRECISION = BigNumber(10).pow(18);
let liqConvRatesInst;




function pOfE(r, Pmin) { 
  //P(E) = Pmin*e^(r·E)
    return Helper.exp(e, BigNumber(r).mul(E)).mul(Pmin);
}

function calcDeltaT(r, Pmin, deltaE) {
    eMinusRDeltaE = Helper.exp(e, BigNumber(-r).mul(deltaE))
    //console.log("eMinusRDeltaE: " + eMinusRDeltaE.valueOf())
    eMinus1 = eMinusRDeltaE.minus(1)
    //console.log("eMinus1: " + eMinus1.valueOf())
    rP = BigNumber(r).mul(pOfE(r, Pmin))
    return eMinus1.div(rP)
}

function calcDeltaE(r, Pmin, deltaT) {
    rPdeltaT = BigNumber(r).mul(pOfE(r, Pmin)).mul(deltaT)
    onePlusRPdeltaT = BigNumber(1).plus(rPdeltaT)
    lnOnePlusrPdeltaT = Helper.ln(onePlusRPdeltaT)
    return lnOnePlusrPdeltaT.mul(-1).div(r)
}

function priceForDeltaE(feePercent, r, Pmin, deltaE) { 
    deltaT = calcDeltaT(r, Pmin, deltaE).abs();
    factor = (100-feePercent)/100
    deltaTAfterReducedFee = deltaT.mul(factor)
    return BigNumber(deltaTAfterReducedFee).div(deltaE);
}

function priceForDeltaT(r, Pmin, deltaT) {
    deltaE = calcDeltaE(r, Pmin, deltaT).abs();
    return deltaE.div(deltaT);
}


contract('LiquidityConversionRates', function(accounts) {
    it("should init globals", function() {
        admin = accounts[0];
        alerter = accounts[1];
        operator = accounts[2];
        reserveAddress = accounts[3];
    })

    it("should init LiquidityConversionRates Inst.", async function () {
        //create token
        token = await TestToken.new("test", "tst", 18);

        //init contracts
        liqConvRatesInst = await LiquidityConversionRates.new(admin, token.address, reserveAddress);
    });

    it("should test abs.", async function () {
        input = new BigNumber(10).pow(18).mul(7);
        output = new BigNumber(10).pow(18).mul(7);
        result = await liqConvRatesInst.abs(input);
        assert.equal(result.valueOf(), output.valueOf(), "bad result");

        input = new BigNumber(10).pow(18).mul(-5);
        output = new BigNumber(10).pow(18).mul(5);
        result = await liqConvRatesInst.abs(input);
        assert.equal(result.valueOf(), output.valueOf(), "bad result");

        input = new BigNumber(10).pow(18).mul(0);
        output = new BigNumber(10).pow(18).mul(0);
        result = await liqConvRatesInst.abs(input);
        assert.equal(result.valueOf(), output.valueOf(), "bad result");
    });

    it("should test calculation of collected fee.", async function () {
        //input 1458
        //fee percent = 3.7
        //before fees = 1458 / ((100 - 3.7)/100) = 1514.01869159
        //expected output = 0.037 * 1514.01869159 = 3.7 * 1514.01869159

        precision = 100000
        input = 1458 * precision
        feePercent = 3.7
        expectedValueBeforeReducingFee = input / ((100 - feePercent)/100)
        expectedResult = (feePercent / 100) * expectedValueBeforeReducingFee

        feeInBps = feePercent * 100
        result =  await liqConvRatesInst.calcCollectedFee(input, feeInBps);
        console.log("expectedResult: " + expectedResult)
        console.log("result: " + result)
        assert.equal(Math.floor(result), Math.floor(expectedResult), "bad result");
    });

    it("should test reducing fees from amount.", async function () {
        precision = 100000
        input = 5763 * precision;
        feePercent = 2.67
        feeInBps = feePercent * 100
        expectedResult =  input * (100 - feePercent) / 100;

        result =  await liqConvRatesInst.reduceFee(input, feeInBps);
        console.log("expectedResult: " + expectedResult)
        console.log("result: " + result)
        assert.equal(Math.floor(result.valueOf()), Math.floor(expectedResult), "bad result");
    });

    it("should test converting from wei to formula precision.", async function () {
        precision = 100000
        input = BigNumber(10).pow(18).mul(7); // 7*10^18 wei
        weiDecimalsPrecision = BigNumber(10).pow(18)
        expectedResult = input.mul(precision).div(weiDecimalsPrecision) 

        result =  await liqConvRatesInst.fromWeiToFp(input, precision);
        console.log("expectedResult: " + expectedResult)
        console.log("result: " + result)
        assert.equal(Math.floor(result.valueOf()), Math.floor(expectedResult), "bad result");
    });

    it("should test converting from token wei to formula precision.", async function () {
        token_decimals = 8
        token = await TestToken.new("test", "tst", token_decimals);
        precision_bits = 30;
        tokenPrecision = BigNumber(10).pow(token_decimals)
        precision = BigNumber(2).pow(precision_bits)

        input = BigNumber(10).pow(token_decimals).mul(17); // 17*10^token wei
        expectedResult = input.mul(precision).div(tokenPrecision) 

        result =  await liqConvRatesInst.fromTweiToFp(token.address, input, precision);
        console.log("expectedResult: " + expectedResult);
        console.log("result: " + result);
        assert.equal(Math.floor(result.valueOf()), Math.floor(expectedResult), "bad result");
    });

    it("should test calculation of buy rate for zero quantity.", async function () {
        precision_bits = 30;
        precision = BigNumber(2).pow(precision_bits)
        E = 69.31
        r = 0.01
        Pmin = 0.05
        expectedResult = pOfE(r, Pmin).mul(PRECISION).valueOf()

        EInFp = BigNumber(E).mul(precision);
        rInFp = BigNumber(r).mul(precision);
        PminInFp = BigNumber(Pmin).mul(precision);
        result =  await liqConvRatesInst.buyRateZeroQuantity(EInFp, rInFp, PminInFp, precision, PRECISION);

        console.log("expectedResult: " + expectedResult);
        console.log("result: " + result);

        assert(Helper.checkAbsDiff(expectedResult,result,expectedDiffInPct),
               "exp result diff is " + Helper.absDiff(expectedResult,result).toString(10));
    });

    it("should test calculation of sell rate for zero quantity.", async function () {
        precision_bits = 30;
        precision = BigNumber(2).pow(precision_bits)
        E = 69.31
        r = 0.01
        Pmin = 0.05
        buy_rate = pOfE(r, Pmin)
        expectedResult = (BigNumber(1).div(buy_rate)).mul(PRECISION).valueOf()

        EInFp = BigNumber(E).mul(precision);
        rInFp = BigNumber(r).mul(precision);
        PminInFp = BigNumber(Pmin).mul(precision);
        result =  await liqConvRatesInst.sellRateZeroQuantity(EInFp, rInFp, PminInFp, precision, PRECISION);

        console.log("expectedResult: " + expectedResult);
        console.log("result: " + result);

        assert(Helper.checkAbsDiff(expectedResult,result,expectedDiffInPct),
               "exp result diff is " + Helper.absDiff(expectedResult,result).toString(10));
    });

    it("should test calculation of deltaT.", async function () {
        precision_bits = 30;
        precision = BigNumber(2).pow(precision_bits)
        E = 69.31
        r = 0.01
        Pmin = 0.05
        deltaE = 30.0
        expectedResult = calcDeltaT(r, Pmin, deltaE).abs().mul(precision).valueOf()

        EInFp = BigNumber(E).mul(precision);
        rInFp = BigNumber(r).mul(precision);
        PminInFp = BigNumber(Pmin).mul(precision);
        deltaEInFp = BigNumber(deltaE).mul(precision);
        result =  await liqConvRatesInst.deltaTFunc(rInFp, PminInFp, EInFp, deltaEInFp, precision);

        console.log("expectedResult: " + expectedResult);
        console.log("result: " + result);

        assert(Helper.checkAbsDiff(expectedResult,result,expectedDiffInPct),
               "exp result diff is " + Helper.absDiff(expectedResult,result).toString(10) +
               " actual result diff in percents is " + Helper.absDiffInPercent(expectedResult,result).toString(5));

    });

    it("should test calculation of buy rate for non zero quantity.", async function () {
        precision_bits = 30;
        precision = BigNumber(2).pow(precision_bits)
        E = 69.31
        r = 0.01
        Pmin = 0.05
        feePercent = 2.678
        deltaE = 30.0
        expectedResult = priceForDeltaE(feePercent, r, Pmin, deltaE).mul(PRECISION).valueOf()

        EInFp = BigNumber(E).mul(precision);
        rInFp = BigNumber(r).mul(precision);
        PminInFp = BigNumber(Pmin).mul(precision);
        deltaEInFp = BigNumber(deltaE).mul(precision);
        feeInBps = feePercent * 100
        result =  await liqConvRatesInst.buyRate(feeInBps, deltaEInFp, EInFp, rInFp, PminInFp, precision, PRECISION)

        console.log("expectedResult: " + expectedResult);
        console.log("result: " + result);

        assert(Helper.checkAbsDiff(expectedResult,result,expectedDiffInPct),
               "exp result diff is " + Helper.absDiff(expectedResult,result).toString(10) +
               " actual result diff in percents is " + Helper.absDiffInPercent(expectedResult,result).toString(5));
    });

    it("should test calculation of deltaE.", async function () {
        precision_bits = 30;
        precision = BigNumber(2).pow(precision_bits)
        E = 69.31
        r = 0.01
        Pmin = 0.05
        deltaT = 120.0
        expectedResult = calcDeltaE(r, Pmin, deltaT).abs().mul(precision).valueOf()

        EInFp = BigNumber(E).mul(precision);
        rInFp = BigNumber(r).mul(precision);
        PminInFp = BigNumber(Pmin).mul(precision);
        deltaTInFp = BigNumber(deltaT).mul(precision);
        result =  await liqConvRatesInst.deltaEFunc(rInFp, PminInFp, EInFp, deltaTInFp, precision, precision_bits);

        console.log("expectedResult: " + expectedResult);
        console.log("result: " + result);

        assert(Helper.checkAbsDiff(expectedResult,result,expectedDiffInPct),
               "exp result diff is " + Helper.absDiff(expectedResult,result).toString(10) +
               " actual result diff in percents is " + Helper.absDiffInPercent(expectedResult,result).toString(5));
    });

    it("should test calculation of sell rate for non zero quantity.", async function () {
        precision_bits = 30;
        precision = BigNumber(2).pow(precision_bits)
        E = 69.31
        r = 0.01
        Pmin = 0.05
        deltaT = 120.0
        expectedResult = priceForDeltaT(r, Pmin, deltaT).mul(PRECISION).valueOf()

        EInFp = BigNumber(E).mul(precision);
        rInFp = BigNumber(r).mul(precision);
        PminInFp = BigNumber(Pmin).mul(precision);
        deltaTInFp = BigNumber(deltaT).mul(precision);
        result =  await liqConvRatesInst.sellRate(deltaTInFp, EInFp, rInFp, PminInFp, precision, PRECISION, precision_bits);

        console.log("expectedResult: " + expectedResult);
        console.log("result: " + result);

        assert(Helper.checkAbsDiff(expectedResult,result,expectedDiffInPct),
               "exp result diff is " + Helper.absDiff(expectedResult,result).toString(10) +
               " actual result diff in percents is " + Helper.absDiffInPercent(expectedResult,result).toString(5));
    });

    it("should test setting of liquidity params", async function () {
        precision_bits = 30;
        precision = BigNumber(2).pow(precision_bits)
        E = 69.31
        r = 0.01
        Pmin = 0.05
        feePercent = 2.67
        deltaE = 30.0
        maxCapBuyInEth = 5
        maxCapSellInEth = 5

        rInFp = BigNumber(r).mul(precision);
        PminInFp = BigNumber(Pmin).mul(precision);
        numFpBits = precision_bits
        maxCapBuyInWei = BigNumber(maxCapBuyInEth).mul(PRECISION);
        maxCapSellInWei = BigNumber(maxCapSellInEth).mul(PRECISION);
        feeInBps = feePercent * 100
        maxRateInPRECISION = BigNumber(10).pow(55)
        minRateInPRECISION = 0
        await liqConvRatesInst.setLiquidityParams(rInFp, PminInFp, numFpBits, maxCapBuyInWei, maxCapSellInWei, feeInBps, maxRateInPRECISION, minRateInPRECISION) 
    });
    
    it("should test recording of imbalance.", async function () {
        //TODO - this and previous tests assume contract is already deployed, should check if ok..
        buyAmountInTwei = BigNumber(10).pow(token_decimals).mul(7.12)

        expectedValueBeforeReducingFee = buyAmountInTwei.mul(3) / ((100 - feePercent)/100) // TODO - this calc is a duplication, move to general place...
        expectedResult = BigNumber(((feePercent / 100) * expectedValueBeforeReducingFee).toString())

        await liqConvRatesInst.recordImbalance(token.address, buyAmountInTwei, 3000, 3000, {from: reserveAddress})
        await liqConvRatesInst.recordImbalance(token.address, buyAmountInTwei.mul(2), 3000, 3000, {from: reserveAddress})
        result = await liqConvRatesInst.collectedFeesInTwei()

        console.log("expectedResult: " + expectedResult);
        console.log("result: " + result);

        assert(Helper.checkAbsDiff(expectedResult,result,expectedDiffInPct),
                "exp result diff is " + Helper.absDiff(expectedResult,result).toString(10) +
                " actual result diff in percents is " + Helper.absDiffInPercent(expectedResult,result).toString(5));

    });
    it("should test resetting of imbalance.", async function () {
        //TODO - this and previous tests assume contract is already deployed, should check if ok..

        beforeReset = await liqConvRatesInst.collectedFeesInTwei();
        console.log("beforeReset: " + beforeReset.toString())
        assert.notEqual(beforeReset, 0, "bad result");

        await liqConvRatesInst.resetCollectedFees()
        result = await liqConvRatesInst.collectedFeesInTwei()
        expectedResult = 0

        console.log("expectedResult: " + expectedResult);
        console.log("result: " + result);

        assert.equal(result, expectedResult, "bad result");
    });
 
    /////////// from here it's not only flat function testing /////////////
/*
    it("should test get rate with E.", async function () {
        //TODO - this and previous tests assume contract is already deployed, should check if ok..

        beforeReset = await liqConvRatesInst.collectedFeesInTwei();
        console.log("beforeReset: " + beforeReset.toString())
        assert.notEqual(beforeReset, 0, "bad result");

        await liqConvRatesInst.resetCollectedFees()
        result = await liqConvRatesInst.collectedFeesInTwei()
        expectedResult = 0

        console.log("expectedResult: " + expectedResult);
        console.log("result: " + result);

        assert.equal(result, expectedResult, "bad result");
    });
*/
});