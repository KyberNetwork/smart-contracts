let LiquidityConversionRates = artifacts.require("./LiquidityConversionRates.sol");
let TestToken = artifacts.require("./mockContracts/TestToken.sol");
let Helper = require("./helper.js");
let BigNumber = require('bignumber.js');

const e = new BigNumber("2.7182818284590452353602874713527");
const expectedDiffInPct = new BigNumber(1/100);
const PRECISION = BigNumber(10).pow(18);
const precision_bits = 30;
const precision = BigNumber(2).pow(precision_bits)
const token_decimals = 16
const weiDecimalsPrecision = BigNumber(10).pow(18)
const tokenPrecision = BigNumber(10).pow(token_decimals)
const E = 69.31
const r = 0.01
const Pmin = 0.05
const feePercent = 2.67
const deltaE = 30.0
const deltaT = 120.0
const maxCapBuyInEth = 5
const maxCapSellInEth = 5

const EInFp = BigNumber(E).mul(precision);
const rInFp = BigNumber(r).mul(precision);
const PminInFp = BigNumber(Pmin).mul(precision);
const numFpBits = precision_bits
const deltaEInFp = BigNumber(deltaE).mul(precision);
const deltaTInFp = BigNumber(deltaT).mul(precision);
const maxCapBuyInWei = BigNumber(maxCapBuyInEth).mul(PRECISION);
const maxCapSellInWei = BigNumber(maxCapSellInEth).mul(PRECISION);
const feeInBps = feePercent * 100
const maxRateInPRECISION = BigNumber(10).pow(55)
const minRateInPRECISION = 0

let liqConvRatesInst;

function pOfE(r, Pmin) { 
  //P(E) = Pmin*e^(r·E)
    return Helper.exp(e, BigNumber(r).mul(E)).mul(Pmin);
}

function calcDeltaT(r, Pmin, deltaE) {
    let eMinusRDeltaE = Helper.exp(e, BigNumber(-r).mul(deltaE))
    let eMinus1 = eMinusRDeltaE.minus(1)
    let rP = BigNumber(r).mul(pOfE(r, Pmin))
    return eMinus1.div(rP)
}

function calcDeltaE(r, Pmin, deltaT) {
    let rPdeltaT = BigNumber(r).mul(pOfE(r, Pmin)).mul(deltaT)
    let onePlusRPdeltaT = BigNumber(1).plus(rPdeltaT)
    let lnOnePlusrPdeltaT = Helper.ln(onePlusRPdeltaT)
    return lnOnePlusrPdeltaT.mul(-1).div(r)
}

function priceForDeltaE(feePercent, r, Pmin, deltaE) { 
    let deltaT = calcDeltaT(r, Pmin, deltaE).abs();
    let factor = (100-feePercent)/100
    let deltaTAfterReducedFee = deltaT.mul(factor.toString())
    return BigNumber(deltaTAfterReducedFee).div(deltaE);
}

function priceForDeltaT(r, Pmin, deltaT) {
    let deltaE = calcDeltaE(r, Pmin, deltaT).abs();
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
        token = await TestToken.new("test", "tst", token_decimals);

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

        input = 1458 * precision
        expectedValueBeforeReducingFee = input / ((100 - feePercent)/100)
        expectedResult = (feePercent / 100) * expectedValueBeforeReducingFee

        result =  await liqConvRatesInst.calcCollectedFee(input, feeInBps);
        console.log("expectedResult: " + expectedResult)
        console.log("result: " + result)
        assert.equal(Math.floor(result), Math.floor(expectedResult), "bad result");
    });

    it("should test reducing fees from amount.", async function () {
        input = 5763 * precision;
        expectedResult =  input * (100 - feePercent) / 100;

        result =  await liqConvRatesInst.reduceFee(input, feeInBps);
        console.log("expectedResult: " + expectedResult)
        console.log("result: " + result)
        assert.equal(Math.floor(result.valueOf()), Math.floor(expectedResult), "bad result");
    });

    it("should test converting from wei to formula precision.", async function () {
        input = BigNumber(10).pow(18).mul(7); // 7*10^18 wei
        expectedResult = input.mul(precision).div(weiDecimalsPrecision) 

        result =  await liqConvRatesInst.fromWeiToFp(input, precision);
        console.log("expectedResult: " + expectedResult)
        console.log("result: " + result)
        assert.equal(Math.floor(result.valueOf()), Math.floor(expectedResult), "bad result");
    });

    it("should test converting from token wei to formula precision.", async function () {
        input = BigNumber(10).pow(token_decimals).mul(17);
        expectedResult = input.mul(precision).div(tokenPrecision) 

        result =  await liqConvRatesInst.fromTweiToFp(token.address, input, precision);
        console.log("expectedResult: " + expectedResult);
        console.log("result: " + result);
        assert.equal(Math.floor(result.valueOf()), Math.floor(expectedResult), "bad result");
    });

    it("should set liquidity params", async function () {
        await liqConvRatesInst.setLiquidityParams(rInFp, PminInFp, numFpBits, maxCapBuyInWei, maxCapSellInWei, feeInBps, maxRateInPRECISION, minRateInPRECISION) 
    });

    it("should test calculation of buy rate for zero quantity.", async function () {
        expectedResult = pOfE(r, Pmin).mul(PRECISION).valueOf()
        result =  await liqConvRatesInst.buyRateZeroQuantity(EInFp);

        console.log("expectedResult: " + expectedResult);
        console.log("result: " + result);

        assert(Helper.checkAbsDiff(expectedResult,result,expectedDiffInPct),
               "exp result diff is " + Helper.absDiff(expectedResult,result).toString(10));
    });

    it("should test calculation of sell rate for zero quantity.", async function () {
        buy_rate = pOfE(r, Pmin)
        expectedResult = (BigNumber(1).div(buy_rate)).mul(PRECISION).valueOf()
        result =  await liqConvRatesInst.sellRateZeroQuantity(EInFp);

        console.log("expectedResult: " + expectedResult);
        console.log("result: " + result);

        assert(Helper.checkAbsDiff(expectedResult,result,expectedDiffInPct),
               "exp result diff is " + Helper.absDiff(expectedResult,result).toString(10));
    });

    it("should test calculation of deltaT.", async function () {
        expectedResult = calcDeltaT(r, Pmin, deltaE).abs().mul(precision).valueOf()
        result =  await liqConvRatesInst.deltaTFunc(rInFp, PminInFp, EInFp, deltaEInFp, precision);

        console.log("expectedResult: " + expectedResult);
        console.log("result: " + result);

        assert(Helper.checkAbsDiff(expectedResult,result,expectedDiffInPct),
               "exp result diff is " + Helper.absDiff(expectedResult,result).toString(10) +
               " actual result diff in percents is " + Helper.absDiffInPercent(expectedResult,result).toString(5));
    });

    it("should test calculation of buy rate for non zero quantity.", async function () {
        expectedResult = priceForDeltaE(feePercent, r, Pmin, deltaE).mul(PRECISION).valueOf()
        result =  await liqConvRatesInst.buyRate(EInFp, deltaEInFp)

        console.log("expectedResult: " + expectedResult);
        console.log("result: " + result);

        assert(Helper.checkAbsDiff(expectedResult,result,expectedDiffInPct),
               "exp result diff is " + Helper.absDiff(expectedResult,result).toString(10) +
               " actual result diff in percents is " + Helper.absDiffInPercent(expectedResult,result).toString(5));
    });

    it("should test calculation of deltaE.", async function () {
        console.log("r: " + r)
        console.log("Pmin: " + Pmin)
        console.log("deltaT: " + deltaT)
        console.log("precision: " + precision)
        
        expectedResult = calcDeltaE(r, Pmin, deltaT).abs().mul(precision).valueOf()
        result =  await liqConvRatesInst.deltaEFunc(rInFp, PminInFp, EInFp, deltaTInFp, precision, precision_bits);

        console.log("expectedResult: " + expectedResult);
        console.log("result: " + result);

        assert(Helper.checkAbsDiff(expectedResult,result,expectedDiffInPct),
               "exp result diff is " + Helper.absDiff(expectedResult,result).toString(10) +
               " actual result diff in percents is " + Helper.absDiffInPercent(expectedResult,result).toString(5));
    });

    it("should test calculation of sell rate for non zero quantity.", async function () {
        expectedResult = priceForDeltaT(r, Pmin, deltaT).mul(PRECISION).valueOf()
        result =  await liqConvRatesInst.sellRate(EInFp, deltaTInFp);

        console.log("expectedResult: " + expectedResult);
        console.log("result: " + result);

        assert(Helper.checkAbsDiff(expectedResult,result,expectedDiffInPct),
               "exp result diff is " + Helper.absDiff(expectedResult,result).toString(10) +
               " actual result diff in percents is " + Helper.absDiffInPercent(expectedResult,result).toString(5));
    });

    it("should test recording of imbalance.", async function () {
        buyAmountInTwei = BigNumber(10).pow(token_decimals).mul(deltaT)

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