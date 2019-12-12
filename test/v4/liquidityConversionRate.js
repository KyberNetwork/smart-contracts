let LiquidityConversionRates = artifacts.require("./LiquidityConversionRates.sol");
let TestToken = artifacts.require("./mockContracts/TestToken.sol");
let Reserve = artifacts.require("./KyberReserve");
let SanityRates = artifacts.require("./SanityRates");

let Helper = require("./helper.js");
let BigNumber = require('bignumber.js');

//global variables
let ethAddress = '0x00eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

//balances
let expectedReserveBalanceWei = 0;
let reserveTokenBalance = 0;

//permission groups
let admin;
let alerter;
let operator;
let network;

//users
let user1
let user2

//contracts
let convRatesInst;
let reserveInst;
let liqConvRatesInst;
let token
let tokenAdd

//block data
let currentBlock;

//general calculation related consts
const e = new BigNumber("2.7182818284590452353602874713527");
const expectedDiffInPct = new BigNumber(0.01);

// default values
const precision = BigNumber(10).pow(18);
const formulaPrecisionBits = 40;
const formulaPrecision = BigNumber(2).pow(formulaPrecisionBits)
const tokenDecimals = 18
const tokenPrecision = BigNumber(10).pow(tokenDecimals)
const ethDecimals = 18;
const ethPrecission = BigNumber(10).pow(ethDecimals);

const testing = "bbo";

/****** for BBO init: *******/
// for BBO we decided on a fixed pmin, pmax (0.5,2) and r (0.01).
// than we deposited the exact e0 and t0 to support it.
// so minPmin and maxPmax are exactly same as pMin and pMax 
/***************************/

/****** for Midas init: *******/
// for midas we first decided on a fixed pmin (0.5) and fixed e0, t0 (100, 1M).
// than calculated r to support it (0.01 * (69.315/100))).
// so min pmin is exactly as pmin.
// pmax is now bigger, but we set pmax as 2.
/***************************/

let r, p0, e0, t0, feePercent, maxCapBuyInEth, maxCapSellInEth, pMinRatio, pMaxRatio;

if (testing == "bbo") {
    r = 0.01
    p0 = 0.00002146
    e0 = 69.315
    t0 = 2329916.12
    feePercent = 0.25
    maxCapBuyInEth = 3
    maxCapSellInEth = 3
    pMinRatio = 0.5
    pMaxRatio = 2.0
} else if (testing == "midas") {
    r = 0.0069315
    p0 = 0.0001 // 1m tokens = 100 eth
    e0 = 100.0 //69.315
    t0 = 1000000.0 //1m TOKENS
    feePercent = 0.25
    maxCapBuyInEth = 10
    maxCapSellInEth = 10
    pMinRatio = 0.5
    pMaxRatio = 2.0
}

// determine theoretical minimal pMIn, maximal pMax according to r, p0, e0, t0.
// this is done just to make sure pMmin and pMax are in the range.
const minPmin = BigNumber(p0).div((Helper.exp(e, BigNumber(r).mul(e0))))
const maxPmax = BigNumber((p0 / (1 - r * p0 * t0)).toString())
const pMin = p0 * pMinRatio
const pMax = p0 * pMaxRatio

/*
console.log("pMin: " + pMin.toString())
console.log("pMax: " + pMax.toString())
console.log("minPmin: " + minPmin.toString())
console.log("maxPmax: " + maxPmax.toString())
console.log("pMinRatio: " + pMinRatio.toString())
console.log("pMaxRatio: " + pMaxRatio.toString())
*/

// default values in contract common units
const feeInBps = feePercent * 100
const eInFp = BigNumber(e0).mul(formulaPrecision);
const rInFp = BigNumber(r).mul(formulaPrecision);
const pMinInFp = BigNumber(pMin).mul(formulaPrecision);
const maxCapBuyInWei = BigNumber(maxCapBuyInEth).mul(precision);
const maxCapSellInWei = BigNumber(maxCapSellInEth).mul(precision);
const maxBuyRateInPrecision = (BigNumber(1).div(pMin)).mul(precision)
const minBuyRateInPrecision = (BigNumber(1).div(pMax)).mul(precision)
const maxSellRateInPrecision = BigNumber(pMax).mul(precision);
const minSellRateInPrecision = BigNumber(pMin).mul(precision);

// Note: new params array for APR, arrays should have same length
// To test new config, just put new data into corresponding array
// liquidity rate: percentage of the price should move each time trade 1 ETH worth of quantity
const newRs = [0.01, 0.016];
// initial rate: the initial rate of token/ETH 
const newP0s = [0.05, 0.01];
// initial ETH balance: ETH amount we should deposit into the reserve
const newE0s = [69.31471805598, 43.321698784];
// initial token balance: token amount we should deposit into the reserve
const newT0s = [1000.0, 3125.0];
// fee taken for each trade
const newFeePercents = [0.25, 0.25];
// The allowed quantity for one BUY trade in ETH
const newMaxCapBuyInEth = [10, 6];
// The allowed quantity for one SELL trade in ETH
const newMaxCapSellInEth = [10, 6];
// the minimum supported price factor ratio
const newpMinRatios = [0.5, 0.5];
// the maximum supported price factor ratio
const newpMaxRatios = [2.0, 2.0];
// token decimals for real case test
const newTokenDecimals = [18, 12];

// whether we should print logs or not
const printLogs = false;

function pOfE(r, pMin, curE) { 
    return Helper.exp(e, BigNumber(r).mul(curE)).mul(pMin);
}

function buyPriceForZeroQuant(r, pMin, curE) { 
    let pOfERes = pOfE(r, pMin, curE);
    let buyPrice = BigNumber(1).div(pOfERes);
    let buyPriceAfterFeesReduction = buyPrice.mul((100-feePercent)/100)
    return buyPriceAfterFeesReduction;
}

function sellPriceForZeroQuant(r, pMin, curE) { 
    let sellPrice = pOfE(r, pMin, curE);
    let sellPriceAfterFeeReduction = sellPrice.mul((100-feePercent)/100)
    return sellPriceAfterFeeReduction;
}

function calcDeltaT(r, pMin, deltaE, curE) {
    let eMinusRDeltaE = Helper.exp(e, BigNumber(-r).mul(deltaE))
    let eMinus1 = eMinusRDeltaE.minus(1)
    let rP = BigNumber(r).mul(pOfE(r, pMin, curE))
    return eMinus1.div(rP)
}

function calcDeltaE(r, pMin, deltaT, curE) {
    let rPdeltaT = BigNumber(r).mul(pOfE(r, pMin, curE)).mul(deltaT)
    let onePlusRPdeltaT = BigNumber(1).plus(rPdeltaT)
    let lnOnePlusrPdeltaT = Helper.ln(onePlusRPdeltaT)
    return lnOnePlusrPdeltaT.mul(-1).div(r)
}

function priceForDeltaE(feePercent, r, pMin, deltaE, curE) { 
    let deltaT = calcDeltaT(r, pMin, deltaE, curE).abs();
    let factor = (100-feePercent)/100
    let deltaTAfterReducedFee = deltaT.mul(factor.toString())
    return BigNumber(deltaTAfterReducedFee).div(deltaE);
}

function priceForDeltaT(feePercent, r, pMin, qtyBeforeReduce, curE) {
    let deltaTAfterReducingFee = qtyBeforeReduce * (100 - feePercent) / 100;
    let deltaE = calcDeltaE(r, pMin, deltaTAfterReducingFee, curE).abs();
    return deltaE.div(qtyBeforeReduce);
}

function tForCurPWithoutFees(r, curSellPrice) {
    let oneOverPmax = BigNumber(1).div(pMax);
    let oneOverCurSellPrice = BigNumber(1).div(curSellPrice);
    let oneOverR = BigNumber(1).div(r);
    let t = oneOverR.mul(oneOverCurSellPrice.minus(oneOverPmax));
    return t;
}

function eForCurPWithoutFees(r, curSellPrice) {
    return (Helper.ln(curSellPrice/pMin)/r).toString()
}

async function sellRateForZeroQuantInPrecision(eInEth) {
    let eFp = eInEth.mul(formulaPrecision); 
    let rateInPrecision = await liqConvRatesInst.sellRateZeroQuantity(eFp)
    return rateInPrecision;
}

async function buyRateForZeroQuantInPrecision(eInEth) {
    let eFp = eInEth.mul(formulaPrecision); 
    let rateInPrecision = await liqConvRatesInst.buyRateZeroQuantity(eFp)
    return rateInPrecision;
}

async function getExpectedTWithoutFees(curE) {
    let rateFor0 = pOfE(r, pMin, curE);
    return tForCurPWithoutFees(r, rateFor0.valueOf());
}

async function getBalances() {
    let balances = {}
    balances["EInWei"] = await Helper.getBalancePromise(reserveInst.address);
    balances["EInEth"] = balances["EInWei"].div(precision)
    balances["TInTwei"] = await token.balanceOf(reserveInst.address);
    balances["TInTokens"] = balances["TInTwei"].div(tokenPrecision)
    balances["User1Twei"] = await token.balanceOf(user1);
    balances["collectedFeesInTwei"] = await liqConvRatesInst.collectedFeesInTwei()
    balances["collectedFeesInTokens"] = balances["collectedFeesInTwei"].div(tokenPrecision);
    balances["networkTwei"] = await token.balanceOf(network);
    balances["networkTokens"] = balances["networkTwei"].div(tokenPrecision);
    return balances;
}


contract('LiquidityConversionRates', function(accounts) {
    const deltaE = 0.1
    const deltaEInFp = BigNumber(deltaE).mul(formulaPrecision);
    const deltaT = 2000
    const deltaTInFp = BigNumber(deltaT).mul(formulaPrecision);

    it("should init globals", function() {
        admin = accounts[0];
        alerter = accounts[1];
        operator = accounts[2];
        reserveAddress = accounts[3];
    })

    it("should init LiquidityConversionRates Inst and setting of reserve address", async function () {
        token = await TestToken.new("test", "tst", tokenDecimals);
        liqConvRatesInst = await LiquidityConversionRates.new(admin, token.address);
        liqConvRatesInst.setReserveAddress(reserveAddress)
    });

    it("should test abs.", async function () {
        let input = new BigNumber(10).pow(18).mul(7);
        let output = new BigNumber(10).pow(18).mul(7);
        let result = await liqConvRatesInst.abs(input);
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

    it("should set liquidity params", async function () {
        /*
        console.log("rInFp: " + rInFp.toString())
        console.log("pMinInFp: " + pMinInFp.toString())
        console.log("formulaPrecisionBits: " + formulaPrecisionBits.toString())
        console.log("maxCapBuyInWei: " + maxCapBuyInWei.toString())
        console.log("maxCapSellInWei: " + maxCapSellInWei.toString())
        console.log("feeInBps: " + feeInBps.toString())
        console.log("maxSellRateInPrecision: " + maxSellRateInPrecision.toString())
        console.log("minSellRateInPrecision: " + minSellRateInPrecision.toString())
         */
        await liqConvRatesInst.setLiquidityParams(rInFp, pMinInFp, formulaPrecisionBits, maxCapBuyInWei, maxCapSellInWei, feeInBps, maxSellRateInPrecision, minSellRateInPrecision) 
    });

    it("should test calculation of collected fee for buy case.", async function () {
        await liqConvRatesInst.resetCollectedFees()

        let input = 1458 * formulaPrecision
        let expectedValueBeforeReducingFee = input / ((100 - feePercent)/100)
        let expectedResult = (feePercent / 100) * expectedValueBeforeReducingFee

        await liqConvRatesInst.recordImbalance(token.address, input, 0, 0, {from: reserveAddress})
        result = await liqConvRatesInst.collectedFeesInTwei()
        Helper.assertAbsDiff(result, expectedResult, expectedDiffInPct)
    });

    it("should test calculation of collected fee for sell case.", async function () {
        await liqConvRatesInst.resetCollectedFees()
        let input = -1458 * formulaPrecision
        let expectedResult = (-input) * (feePercent / 100)

        await liqConvRatesInst.recordImbalance(token.address, input, 0, 0, {from: reserveAddress})
        result = await liqConvRatesInst.collectedFeesInTwei()
        Helper.assertAbsDiff(result, expectedResult, expectedDiffInPct)
    });

    it("should test reducing fees from amount.", async function () {
        let input = 5763 * formulaPrecision;
        let expectedResult =  input * (100 - feePercent) / 100;
        let result =  await liqConvRatesInst.valueAfterReducingFee(input);
        Helper.assertAbsDiff(result, expectedResult, expectedDiffInPct)
    });

    it("should test converting from wei to formula formulaPrecision.", async function () {
        let input = BigNumber(7).mul(precision)
        let expectedResult = input.mul(formulaPrecision).div(precision) 
        let result =  await liqConvRatesInst.fromWeiToFp(input);
        Helper.assertAbsDiff(result, expectedResult, expectedDiffInPct)
    });

    it("should test converting from token wei to formula formulaPrecision.", async function () {
        let input = BigNumber(10).pow(tokenDecimals).mul(17);
        let expectedResult = input.mul(formulaPrecision).div(tokenPrecision) 
        let result =  await liqConvRatesInst.fromTweiToFp(input);
        Helper.assertAbsDiff(result, expectedResult, expectedDiffInPct)
    });

    it("should test calculation of buy rate for zero quantity.", async function () {
        let expectedResult = buyPriceForZeroQuant(r, pMin, e0).mul(precision).valueOf()
        let result =  await liqConvRatesInst.buyRateZeroQuantity(eInFp);
        Helper.assertAbsDiff(result, expectedResult, expectedDiffInPct)
    });

    it("should test calculation of sell rate for zero quantity.", async function () {
        let expectedResult = sellPriceForZeroQuant(r, pMin, e0).mul(precision).valueOf()
        let result =  await liqConvRatesInst.sellRateZeroQuantity(eInFp);
        Helper.assertAbsDiff(result, expectedResult, expectedDiffInPct)
    });

    it("should test calculation of deltaT.", async function () {
        let expectedResult = calcDeltaT(r, pMin, deltaE, e0).abs().mul(formulaPrecision).valueOf()
        let result =  await liqConvRatesInst.deltaTFunc(rInFp, pMinInFp, eInFp, deltaEInFp, formulaPrecision);
        Helper.assertAbsDiff(result, expectedResult, expectedDiffInPct)
    });

    it("should test calculation of buy rate for non zero quantity.", async function () {
        let expectedResult = priceForDeltaE(feePercent, r, pMin, deltaE, e0).mul(precision).valueOf()
        let result =  await liqConvRatesInst.buyRate(eInFp, deltaEInFp)
        Helper.assertAbsDiff(result, expectedResult, expectedDiffInPct)
    });

    it("should test calculation of deltaE.", async function () {
        let expectedResult = calcDeltaE(r, pMin, deltaT, e0).abs().mul(formulaPrecision).valueOf()
        let result =  await liqConvRatesInst.deltaEFunc(rInFp, pMinInFp, eInFp, deltaTInFp, formulaPrecision, formulaPrecisionBits);
        Helper.assertAbsDiff(result, expectedResult, expectedDiffInPct)
    });

    it("should test calculation of sell rate for non zero quantity.", async function () {
        let expectedResult = priceForDeltaT(feePercent, r, pMin, deltaT, e0).mul(precision).valueOf()
        let deltaTAfterReducingFeeInFp = BigNumber(deltaTInFp).mul((100 - feePercent) / 100);
        let result =  await liqConvRatesInst.sellRate(eInFp, deltaTInFp, deltaTAfterReducingFeeInFp);
        result = result[0]
        Helper.assertAbsDiff(result, expectedResult, expectedDiffInPct)
    });

    it("should test recording of imbalance.", async function () {
        let buyAmountInTwei = BigNumber(10).pow(tokenDecimals).mul(deltaT)

        let expectedValueBeforeReducingFee = buyAmountInTwei.mul(3) / ((100 - feePercent)/100) // TODO - this calc is a duplication, move to general place...
        let expectedResult = BigNumber(((feePercent / 100) * expectedValueBeforeReducingFee).toString())

        await liqConvRatesInst.recordImbalance(token.address, buyAmountInTwei, 3000, 3000, {from: reserveAddress})
        await liqConvRatesInst.recordImbalance(token.address, buyAmountInTwei.mul(2), 3000, 3000, {from: reserveAddress})
        let result = await liqConvRatesInst.collectedFeesInTwei()

        Helper.assertAbsDiff(result, expectedResult, expectedDiffInPct)
    });

    it("should test resetting of imbalance not by admin.", async function () {
        try {
            await liqConvRatesInst.resetCollectedFees({from:operator})
            assert(false, "expected to throw error in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
        let afterReset = await liqConvRatesInst.collectedFeesInTwei();
        assert.notEqual(afterReset, 0, "bad result");

    });

    it("should test resetting of imbalance.", async function () {
        let beforeReset = await liqConvRatesInst.collectedFeesInTwei();
        assert.notEqual(beforeReset, 0, "bad result");

        await liqConvRatesInst.resetCollectedFees()
        let result = await liqConvRatesInst.collectedFeesInTwei()
        let expectedResult = 0
        assert.equal(result, expectedResult, "bad result");
    });

    it("should test getrate for buy=true and qtyInSrcWei = non_0.", async function () {
        let expectedResult = priceForDeltaE(feePercent, r, pMin, deltaE, e0).mul(precision).valueOf()
        let qtyInSrcWei = BigNumber(deltaE).mul(precision)
        let result =  await liqConvRatesInst.getRateWithE(token.address,true,qtyInSrcWei,eInFp);
        Helper.assertAbsDiff(result, expectedResult, expectedDiffInPct)
    });

    it("should test getrate for buy=true and qtyInSrcWei = 0.", async function () {
        let expectedResult = buyPriceForZeroQuant(r, pMin, e0).mul(precision).valueOf()
        let qtyInSrcWei = 0
        let result =  await liqConvRatesInst.getRateWithE(token.address,true,qtyInSrcWei,eInFp);
        Helper.assertAbsDiff(result, expectedResult, expectedDiffInPct)
    });

    it("should test getrate for buy=true and qtyInSrcWei very small.", async function () {
        let expectedResult = buyPriceForZeroQuant(r, pMin, e0).mul(precision).valueOf()
        let qtyInSrcWei = 10 // this is assumed to be rounded to 0 by fromTweiToFp.
        let result =  await liqConvRatesInst.getRateWithE(token.address,true,qtyInSrcWei,eInFp);
        Helper.assertAbsDiff(result, expectedResult, expectedDiffInPct)
        assert(result.valueOf != 0)
    });

    it("should test getrate for buy=false and qtyInSrcWei = non_0.", async function () {
        let qtyInSrcWei = BigNumber(deltaT).mul(tokenPrecision)
        let expectedResult = priceForDeltaT(feePercent, r, pMin, deltaT, e0).mul(precision).valueOf()
        let result =  await liqConvRatesInst.getRateWithE(token.address,false,qtyInSrcWei,eInFp);
        Helper.assertAbsDiff(result, expectedResult, expectedDiffInPct)
    });

    it("should test getrate for buy=false and qtyInSrcWei = 0.", async function () {
        let expectedResult = sellPriceForZeroQuant(r, pMin, e0).mul(precision).valueOf()
        let qtyInSrcWei = 0
        let result =  await liqConvRatesInst.getRateWithE(token.address,false,qtyInSrcWei,eInFp);
        Helper.assertAbsDiff(result, expectedResult, expectedDiffInPct)
    });

    it("should test getrate for buy=false and qtyInSrcWei very small.", async function () {
        let expectedResult = sellPriceForZeroQuant(r, pMin, e0).mul(precision).valueOf()
        let qtyInSrcWei = 10 // this is assumed to be rounded to 0 by fromTweiToFp.
        let result =  await liqConvRatesInst.getRateWithE(token.address,false,qtyInSrcWei,eInFp);
        Helper.assertAbsDiff(result, expectedResult, expectedDiffInPct)
        assert(result.valueOf != 0)
    });

    it("should test set liquidity params not as admin.", async function () {
        //try once to see it's working
        await liqConvRatesInst.setLiquidityParams(rInFp, pMinInFp, formulaPrecisionBits, maxCapBuyInWei, maxCapSellInWei, feeInBps, maxSellRateInPrecision, minSellRateInPrecision, {from: admin})

        currentFeeInBps = 10001
        try {
            await liqConvRatesInst.setLiquidityParams(rInFp, pMinInFp, formulaPrecisionBits, maxCapBuyInWei, maxCapSellInWei, feeInBps, maxSellRateInPrecision, minSellRateInPrecision, {from: operator}) 
            assert(false, "expected to throw error in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("should test setting formula precisioin bits != 40 .", async function () {
        //try once to see it's working
        await liqConvRatesInst.setLiquidityParams(rInFp, pMinInFp, formulaPrecisionBits, maxCapBuyInWei, maxCapSellInWei, feeInBps, maxSellRateInPrecision, minSellRateInPrecision, {from: admin})

        let wrong_formulaPrecisionBits = 41;

        try {
            await liqConvRatesInst.setLiquidityParams(rInFp, pMinInFp, wrong_formulaPrecisionBits, maxCapBuyInWei, maxCapSellInWei, feeInBps, maxSellRateInPrecision, minSellRateInPrecision, {from: admin})
            assert(false, "expected to throw error in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("should test can't set r = 0 .", async function () {
        //try once to see it's working
        await liqConvRatesInst.setLiquidityParams(rInFp, pMinInFp, formulaPrecisionBits, maxCapBuyInWei, maxCapSellInWei, feeInBps, maxSellRateInPrecision, minSellRateInPrecision, {from: admin})

        let wrong_rInFp = 0;

        try {
            await liqConvRatesInst.setLiquidityParams(wrong_rInFp, pMinInFp, formulaPrecisionBits, maxCapBuyInWei, maxCapSellInWei, feeInBps, maxSellRateInPrecision, minSellRateInPrecision, {from: admin})
            assert(false, "expected to throw error in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("should test can't set minSellRateInPrecision = 0 .", async function () {
        //try once to see it's working
        await liqConvRatesInst.setLiquidityParams(rInFp, pMinInFp, formulaPrecisionBits, maxCapBuyInWei, maxCapSellInWei, feeInBps, maxSellRateInPrecision, minSellRateInPrecision, {from: admin})

        let wrong_minSellRateInPrecision = 0;

        try {
            await liqConvRatesInst.setLiquidityParams(rInFp, pMinInFp, formulaPrecisionBits, maxCapBuyInWei, maxCapSellInWei, feeInBps, maxSellRateInPrecision, wrong_minSellRateInPrecision, {from: admin})
            assert(false, "expected to throw error in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("should test can't set pMin = 0 .", async function () {
        //try once to see it's working
        await liqConvRatesInst.setLiquidityParams(rInFp, pMinInFp, formulaPrecisionBits, maxCapBuyInWei, maxCapSellInWei, feeInBps, maxSellRateInPrecision, minSellRateInPrecision, {from: admin})

        let wrong_pMinInFp = 0;

        try {
            await liqConvRatesInst.setLiquidityParams(rInFp, wrong_pMinInFp, formulaPrecisionBits, maxCapBuyInWei, maxCapSellInWei, feeInBps, maxSellRateInPrecision, minSellRateInPrecision, {from: admin})
            assert(false, "expected to throw error in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("should test set liquidity params with illegal fee in BPS configuration.", async function () {
        //try once to see it's working
        let currentFeeInBps = feeInBps
        await liqConvRatesInst.setLiquidityParams(rInFp, pMinInFp, formulaPrecisionBits, maxCapBuyInWei, maxCapSellInWei, currentFeeInBps, maxSellRateInPrecision, minSellRateInPrecision)

        currentFeeInBps = 10001
        try {
            await liqConvRatesInst.setLiquidityParams(rInFp, pMinInFp, formulaPrecisionBits, maxCapBuyInWei, maxCapSellInWei, currentFeeInBps, maxSellRateInPrecision, minSellRateInPrecision) 
            assert(false, "expected to throw error in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("should test get rate with invalid token.", async function () {
        let otherToken = await TestToken.new("otherToken", "oth", tokenDecimals);
        let expectedResult = priceForDeltaE(feePercent, r, pMin, deltaE, e0).mul(precision).valueOf()
        let qtyInSrcWei = BigNumber(deltaE).mul(precision)
        let result =  await liqConvRatesInst.getRateWithE(otherToken.address,true,qtyInSrcWei,eInFp);
        assert.equal(result, 0, "bad result");
    });

    it("should test max sell rate smaller then expected rate and min sell rate larger then expected rate .", async function () {
        let qtyInSrcWei = BigNumber(deltaT).mul(tokenPrecision)
        let deltaTAfterReducingFee = deltaT * (100 - feePercent) / 100; //reduce fee, as done in getRateWithE
        let expectedResult = priceForDeltaT(feePercent, r, pMin, deltaTAfterReducingFee, e0).mul(precision).valueOf()
        let result =  await liqConvRatesInst.getRateWithE(token.address,false,qtyInSrcWei,eInFp);
        let gotResult = result

        Helper.assertAbsDiff(result, expectedResult, expectedDiffInPct)
        assert.notEqual(result, 0, "bad result");

        let currentMaxSellRateInPrecision= gotResult.minus(100)
        let currentMinSellRateInPrecision= minSellRateInPrecision
        await liqConvRatesInst.setLiquidityParams(rInFp, pMinInFp, formulaPrecisionBits, maxCapBuyInWei, maxCapSellInWei, feeInBps, currentMaxSellRateInPrecision, currentMinSellRateInPrecision)
        result =  await liqConvRatesInst.getRateWithE(token.address,false,qtyInSrcWei,eInFp);
        assert.equal(result, 0, "bad result");

        currentMaxSellRateInPrecision = maxSellRateInPrecision
        currentMinSellRateInPrecision = gotResult.plus(100)
        await liqConvRatesInst.setLiquidityParams(rInFp, pMinInFp, formulaPrecisionBits, maxCapBuyInWei, maxCapSellInWei, feeInBps, currentMaxSellRateInPrecision, currentMinSellRateInPrecision)
        result =  await liqConvRatesInst.getRateWithE(token.address,false,qtyInSrcWei,eInFp);
        assert.equal(result, 0, "bad result");

        //return things to normal
        await liqConvRatesInst.setLiquidityParams(rInFp, pMinInFp, formulaPrecisionBits, maxCapBuyInWei, maxCapSellInWei, feeInBps, maxSellRateInPrecision, minSellRateInPrecision)
    });

    it("should test exceeding max cap buy", async function () {
        let qtyInSrcWei = BigNumber(maxCapBuyInEth + 0.2).mul(precision)
        let result =  await liqConvRatesInst.getRateWithE(token.address,true,qtyInSrcWei,eInFp);
        assert.equal(result, 0, "bad result");
    });

    it("should test exceeding max cap sell", async function () {
        let sellQtyInTokens = (maxCapSellInEth / p0) * (1.1);
        let sellQtyInTwi = BigNumber(sellQtyInTokens.toString()).mul(tokenPrecision)
        let result =  await liqConvRatesInst.getRateWithE(token.address,false,sellQtyInTwi,eInFp);
        assert.equal(result.valueOf(), 0, "bad result");
    });

    it("should test get rate with E", async function () {
        let expectedResult = priceForDeltaE(feePercent, r, pMin, deltaE, e0).mul(precision)
        let qtyInSrcWei = BigNumber(deltaE).mul(precision)
        let result =  await liqConvRatesInst.getRateWithE(token.address, true, qtyInSrcWei, eInFp);
        Helper.assertAbsDiff(result, expectedResult, expectedDiffInPct);
    });

    it("should test recording of imbalance from non reserve address.", async function () {
        let buyAmountInTwei = BigNumber(10).pow(tokenDecimals).mul(deltaT)
        let expectedValueBeforeReducingFee = buyAmountInTwei.mul(3) / ((100 - feePercent)/100) // TODO - this calc is a duplication, move to general place...
        let expectedResult = BigNumber(((feePercent / 100) * expectedValueBeforeReducingFee).toString())
        try {
            await liqConvRatesInst.recordImbalance(token.address, buyAmountInTwei, 3000, 3000, {from: operator})
            assert(false, "expected to throw error in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }    
    });
});


contract('kyberReserve for Liquidity', function(accounts) {
    it("should init globals. init ConversionRates Inst, token, set liquidity params .", async function () {
        // set account addresses
        admin = accounts[0];
        network = accounts[2];
        user1 = accounts[4];
        user2 = accounts[5];

        currentBlock = await Helper.getCurrentBlock();

        token = await TestToken.new("test", "tst", 18);
        tokenAdd = token.address;

        liqConvRatesInst = await LiquidityConversionRates.new(admin, token.address);
        await liqConvRatesInst.setLiquidityParams(
                rInFp,
                pMinInFp,
                formulaPrecisionBits,
                maxCapBuyInWei,
                maxCapSellInWei,
                feeInBps,
                maxSellRateInPrecision,
                minSellRateInPrecision
            ) 
    });

    it("should init reserve and set all reserve data including balances", async function () {
        reserveInst = await Reserve.new(network, liqConvRatesInst.address, admin);
        await reserveInst.setContracts(network, liqConvRatesInst.address, 0);

        await liqConvRatesInst.setReserveAddress(reserveInst.address);

        //set reserve balance.
        let reserveEtherInit = (BigNumber(10).pow(18)).mul(e0);
        await Helper.sendEtherWithPromise(accounts[9], reserveInst.address, reserveEtherInit);
        
        let balance = await Helper.getBalancePromise(reserveInst.address);
        expectedReserveBalanceWei = balance.valueOf();

        assert.equal(balance.valueOf(), reserveEtherInit, "wrong ether balance");

        await reserveInst.approveWithdrawAddress(token.address,accounts[0],true);

        //transfer tokens to reserve.
        let amount = (BigNumber(10).pow(tokenDecimals)).mul(t0);
        await token.transfer(reserveInst.address, amount.valueOf());
        balance = await token.balanceOf(reserveInst.address);
        assert.equal(amount.valueOf(), balance.valueOf());

        reserveTokenBalance = amount;
    });

    it("should test getConversionRate of buy rate for zero quantity.", async function () {
        let expectedResult = buyPriceForZeroQuant(r, pMin, e0).mul(precision).valueOf()
        let amountWei = 0
        let result = await reserveInst.getConversionRate(ethAddress, token.address, amountWei, currentBlock);
        Helper.assertAbsDiff(expectedResult,result,expectedDiffInPct);
    });

    it("should test getConversionRate of sell rate for zero quantity.", async function () {
        let expectedResult = sellPriceForZeroQuant(r, pMin, e0).mul(precision).valueOf()
        let amountWei = 0;
        let result = await reserveInst.getConversionRate(token.address, ethAddress, amountWei, currentBlock);
        Helper.assertAbsDiff(expectedResult, result, expectedDiffInPct);
    });

    it("should test getConversionRate of buy rate for non zero quantity.", async function () {
        let deltaE = 2.7
        let expectedResult = priceForDeltaE(feePercent, r, pMin, deltaE, e0).mul(precision).valueOf()
        let amountWei = BigNumber(10).pow(18).mul(deltaE)
        let result = await reserveInst.getConversionRate(ethAddress, token.address, amountWei, currentBlock);
        Helper.assertAbsDiff(expectedResult, result, expectedDiffInPct);
    });

    it("should test getConversionRate of sell rate for non zero quantity.", async function () {
        let deltaT = 120.0
        let expectedResult = priceForDeltaT(feePercent, r, pMin, deltaT, e0).mul(precision).valueOf()
        let amountWei = BigNumber(10).pow(tokenDecimals).mul(deltaT)
        let result = await reserveInst.getConversionRate(token.address, ethAddress, amountWei, currentBlock);
        Helper.assertAbsDiff(expectedResult, result, expectedDiffInPct);
    });

    it("should perform a series of buys and check: correct balances change, rates and fees as expected.", async function () {
        let prevBuyRate = 0;
        let amountEth, amountWei;
        let buyRate, expectedRate;
        let expectedUser1TweiAmount;
        let tradeActualTweiAmount;
        let expectedReserveTokenBalance;
        let expectedCollectedFeesDiff, collectedFeesInTokensDiff;
        let balancesBefore, balancesAfter;
        let iterations = 0;

        while (true) {
            iterations++;
            balancesBefore = await getBalances();
            amountEth = (!prevBuyRate) ? 2.9 : 2.9
            amountWei = BigNumber(amountEth).mul(precision);

            // get expected and actual rate
            expectedRate = priceForDeltaE(feePercent, r, pMin, amountEth, balancesBefore["EInEth"]).mul(precision)
            buyRate = await reserveInst.getConversionRate(ethAddress, token.address, amountWei, currentBlock);

            // make sure buys are only ended when we are around 1/Pmax 
            if (buyRate == 0) {
                let rateFor0 = await buyRateForZeroQuantInPrecision((balancesBefore["EInEth"]));
                let expectedMinRate = (BigNumber(1).div(pMax)).mul(precision);
                let thresholdPriceexpectedDiffInPct = BigNumber(10.0);
                Helper.assertAbsDiff(rateFor0, expectedMinRate, thresholdPriceexpectedDiffInPct);
            }

            // expect to eventually get 0 rate when tokens are depleted or rate is lower than min buy rate.
            if (buyRate == 0) {
                let expectedDestQty = calcDeltaT(r, pMin, amountEth, balancesBefore["EInEth"])
                assert(
                    (expectedDestQty < balancesBefore["TInTokens"]) ||
                    (BigNumber(expectedRate).lt(minBuyRateInPrecision)),
                    "got 0 rate without justification "
                )
                break;
            }
            Helper.assertAbsDiff(buyRate, expectedRate, expectedDiffInPct);

            // make sure prices (tokens/eth) are getting lower as tokens are depleted.
            if (!prevBuyRate) {
                prevBuyRate = buyRate;
            } else {
                assert(buyRate.lt(prevBuyRate));
                prevBuyRate = buyRate;
            }

            //perform trade
            await reserveInst.trade(ethAddress, amountWei, token.address, user1, buyRate, true, {from:network, value:amountWei});
            balancesAfter = await getBalances();

            // check reserve eth balance after the trade (got more eth) is as expected.
            expectedReserveBalanceWei = balancesBefore["EInWei"].add(amountWei);
            assert.equal(balancesAfter["EInWei"].valueOf(), expectedReserveBalanceWei.valueOf(), "bad reserve balance wei");

            // check token balance on user1 after the trade (got more tokens) is as expected. 
            tradeExpectedTweiAmount = expectedRate.mul(amountWei).div(precision)
            expectedUser1TweiAmount = balancesBefore["User1Twei"].plus(tradeExpectedTweiAmount);
            Helper.assertAbsDiff(balancesAfter["User1Twei"], expectedUser1TweiAmount, expectedDiffInPct);

            // check reserve token balance after the trade (lost some tokens) is as expected.
            tradeActualTweiAmount = buyRate.mul(amountWei).div(precision)
            expectedReserveTokenBalance = balancesBefore["TInTwei"].minus(tradeActualTweiAmount);
            Helper.assertAbsDiff(balancesAfter["TInTwei"], expectedReserveTokenBalance, expectedDiffInPct);

            // check collected fees for this trade is as expected
            expectedCollectedFeesDiff = tradeActualTweiAmount.mul(feePercent / 100).div(tokenPrecision * ((100 - feePercent)/100));
            collectedFeesInTokensDiff = balancesAfter["collectedFeesInTokens"].minus(balancesBefore["collectedFeesInTokens"])
            Helper.assertAbsDiff(expectedCollectedFeesDiff, collectedFeesInTokensDiff, expectedDiffInPct);

            /* removed following test since now we allow putting bigger T0 than needed for calcs.
            // check amount of extra tokens is at least as collected fees
            if (feePercent != 0) {
                expectedTWithoutFees = await getExpectedTWithoutFees(balancesAfter["EInEth"]);
                expectedFeesAccordingToTheory = balancesAfter["TInTokens"].minus(expectedTWithoutFees);
                Helper.assertAbsDiff(balancesAfter["collectedFeesInTokens"], expectedFeesAccordingToTheory, expectedDiffInPct);
            };
            */
        };

        // make sure at least a few iterations were done
        assert(iterations > 3, "not enough iterations, bad run");
    });

    it("should perform a series of sells and check: correct balances change, rates and fees as expected.", async function () {
        let prevSellRate = 0;
        let iterations = 0;
        let amountTokens, amountTwei, amountTokensAfterFees;
        let expectedRate, expectedDestQty, sellRate;
        let balancesBefore, balancesAfter;

        //no need to transfer initial balance to user
        //in the full scenario. user approves network which collects the tokens and approves reserve
        //which collects tokens from network.
        //so here transfer tokens to network and approve allowance from network to reserve.
        let tx4InTwei = BigNumber(t0).mul(4).mul(tokenPrecision)
        await token.transfer(network, tx4InTwei);

        while (true) {
            iterations++;
            balancesBefore = await getBalances();
            amountTokens = (!prevSellRate) ? 50000 : 50000
            amountTwei = BigNumber(amountTokens).mul(tokenPrecision)
            amountTokensAfterFees = amountTokens * (100 - feePercent) / 100;

            // calculate expected qunatity
            expectedDestQty = calcDeltaE(r, pMin, amountTokensAfterFees, balancesBefore["EInEth"]) ;
            tradeExpectedWeiAmount = BigNumber(expectedDestQty).mul(precision).abs()

            // get expected and actual rate
            expectedRate = priceForDeltaT(feePercent, r, pMin, amountTokens, balancesBefore["EInEth"]).mul(precision).valueOf();
            sellRate = await reserveInst.getConversionRate(token.address, ethAddress, amountTwei, currentBlock);

            // make sure sells are only ended when we are around Pmin
            if (sellRate == 0) {
                let rateFor0 = await sellRateForZeroQuantInPrecision(balancesBefore["EInEth"]);
                let expectedMinRate = BigNumber(pMin).mul(precision);
                let thresholdPriceexpectedDiffInPct = BigNumber(10.0);
                Helper.assertAbsDiff(rateFor0, expectedMinRate, thresholdPriceexpectedDiffInPct);
            }

            // expect to eventually get 0 rate eth is depleted or rate is less than min sell rate.
            if (sellRate == 0) {
                assert(
                    (expectedDestQty < balancesBefore["EInEth"]) ||
                    (BigNumber(expectedRate).lt(minSellRateInPrecision)),
                    "got 0 rate without justification "
                )
                break;
            }
            Helper.assertAbsDiff(sellRate, expectedRate, expectedDiffInPct);

            // make sure prices (the/token) are getting lower as ether is depleted.
            if (!prevSellRate) {
                prevSellRate = sellRate;
            } else {
                assert(sellRate.lt(prevSellRate));
                prevSellRate = sellRate;
            }

            //pre trade step, approve allowance from user to network.
            await token.approve(reserveInst.address, amountTwei, {from: network});
            await reserveInst.trade(token.address, amountTwei, ethAddress, user2, sellRate, true, {from:network});
            balancesAfter = await getBalances();

            // check reserve eth balance after the trade (reserve lost some eth) is as expected.
            expectedReserveBalanceWei = balancesBefore["EInWei"].minus(tradeExpectedWeiAmount);
            Helper.assertAbsDiff(balancesAfter["EInWei"], expectedReserveBalanceWei, expectedDiffInPct);

            //check token balance on network after the trade (lost some tokens) is as expected. 
            expectedTweiAmount = balancesBefore["networkTwei"].minus(amountTwei);
            Helper.assertAbsDiff(balancesAfter["networkTwei"], expectedTweiAmount, expectedDiffInPct);

            //check reserve token balance after the trade (got some tokens) is as expected.
            expectedReserveTokenBalance = balancesBefore["TInTwei"].plus(amountTwei);
            Helper.assertAbsDiff(balancesAfter["TInTwei"], expectedReserveTokenBalance, expectedDiffInPct);

            // check collected fees for this trade is as expected
            expectedCollectedFeesDiff = amountTwei.mul(feePercent / 100).div(tokenPrecision);
            collectedFeesInTokensDiff = balancesAfter["collectedFeesInTokens"].minus(balancesBefore["collectedFeesInTokens"])
            Helper.assertAbsDiff(expectedCollectedFeesDiff, collectedFeesInTokensDiff, expectedDiffInPct);

            /* removed following test since now we allow putting bigger T0 than needed for calcs.
            // check amount of extra tokens is at least as collected fees
            if (feePercent != 0) {
                expectedTWithoutFees = await getExpectedTWithoutFees(balancesAfter["EInEth"]);
                expectedFeesAccordingToTheory = balancesAfter["TInTokens"].minus(expectedTWithoutFees);
                Helper.assertAbsDiff(balancesAfter["collectedFeesInTokens"], expectedFeesAccordingToTheory, expectedDiffInPct);
            };
            */
        };

        // make sure at least a few iterations were done
        assert(iterations > 3, "not enough iterations, bad run");
    });

    it("should check setting liquidity params again with new p0 and adjusting pmin and pmax to existing balances.", async function () {
        // assume price moved to 7/8 of current p0
        let newP0 = p0 * (7/8)
        let sameE0 = e0
        let sameT0 = t0

        // calculate new pmin and pmax to match the current price with existing inventory
        let newPmin = BigNumber(newP0).div((Helper.exp(e, BigNumber(r).mul(sameE0))))
        let newpMax = BigNumber((newP0 / (1 - r * newP0 * sameT0)).toString()) 

        // set new params in contract units
        let newEInFp = BigNumber(sameE0).mul(formulaPrecision);
        let newPMinInFp = BigNumber(newPmin).mul(formulaPrecision);
        let newMaxSellRateInPrecision = BigNumber(newpMax).mul(precision);
        let newMinSellRateInPrecision = BigNumber(newPmin).mul(precision);

        // set liquidity params again.
        await liqConvRatesInst.setLiquidityParams(
                rInFp,
                newPMinInFp,
                formulaPrecisionBits,
                maxCapBuyInWei,
                maxCapSellInWei,
                feeInBps,
                newMaxSellRateInPrecision,
                newMinSellRateInPrecision) 

        // check price is as expected
        let deltaE = 1.2
        let deltaEInFp = BigNumber(deltaE).mul(formulaPrecision);

        let expectedResult = priceForDeltaE(feePercent, r, newPmin, deltaE, sameE0).mul(precision).valueOf()
        let result =  await liqConvRatesInst.buyRate(newEInFp, deltaEInFp)
        Helper.assertAbsDiff(result, expectedResult, expectedDiffInPct)

        // make sure collected fees are not zeroed
        let collectedFees = await liqConvRatesInst.collectedFeesInTwei()
        assert.notEqual(collectedFees, 0, "bad result");

    });

    // with 0 fee, if user trades X eth -> Y token, then trades Y token -> X' eth, X' must not be greater than X for any X amount
    // test buy Y tokens using X eth and then sell Y tokens back
    it("Should test buy tokens and then sell back", async function() {
        let length = newRs.length;
        if (length != newP0s.length || length != newE0s.length || length != newT0s.length
            || length != newFeePercents.length || length != newMaxCapBuyInEth.length || length != newTokenDecimals.length
            || length != newMaxCapSellInEth.length || length != newpMinRatios.length || length != newpMaxRatios.length) {
            assert(false, "length of new config param arrays are not matched, please check again");
        }
        // if i < newRs.length, we test buy then check rate
        // otherwise test sell then check rate
        for (let id = 0; id < newRs.length; id++) {
            let currentBlock = await Helper.getCurrentBlock();

            let token = await TestToken.new("test", "tst", newTokenDecimals[id]);
            let tokenPrecision = BigNumber(10).pow(newTokenDecimals[id]);

            let newLiqConvRatesInst = await LiquidityConversionRates.new(admin, token.address);

            let feeInBps = 0;
            let pMin = newP0s[id] * newpMinRatios[id];
            let pMax = newP0s[id] * newpMaxRatios[id];

            let rInFp = BigNumber(newRs[id]).mul(formulaPrecision);
            let pMinInFp = BigNumber(pMin).mul(formulaPrecision);
            let maxCapBuyInWei = BigNumber(newMaxCapBuyInEth[id]).mul(precision);
            let maxCapSellInWei = BigNumber(newMaxCapSellInEth[id]).mul(precision);
            let maxSellRateInPrecision = BigNumber(pMax).mul(precision);
            let minSellRateInPrecision = BigNumber(pMin).mul(precision);

            await newLiqConvRatesInst.setLiquidityParams(
                rInFp,
                pMinInFp,
                formulaPrecisionBits,
                maxCapBuyInWei.mul(100), // set higher cap to prevent fail big tx
                maxCapSellInWei.mul(100), // set higher cap to prevent fail big tx
                feeInBps,
                maxSellRateInPrecision,
                minSellRateInPrecision
            );

            let reserveInst = await Reserve.new(network, newLiqConvRatesInst.address, admin);
            await reserveInst.setContracts(network, newLiqConvRatesInst.address, 0);

            await newLiqConvRatesInst.setReserveAddress(reserveInst.address);

            //set reserve balance.
            let reserveEtherInit = ethPrecission.mul(newE0s[id]);
            await Helper.sendEtherWithPromise(accounts[8], reserveInst.address, reserveEtherInit);

            await reserveInst.approveWithdrawAddress(token.address, accounts[0], true);

            //transfer tokens to reserve.
            let amount = tokenPrecision.mul(newT0s[id]);
            await token.transfer(reserveInst.address, amount.valueOf());

            let reserveTokenBalance = amount;

            // buy then check sell rate
            let totalSrcBuyAmount = BigNumber(0);
            let totalSellBackAmount = BigNumber(0);
            for(let tx = 0; tx <= 5; tx++) {
                let srcBuyAmount = maxCapBuyInWei.div(tx + 2).floor();
                totalSrcBuyAmount = totalSrcBuyAmount.add(srcBuyAmount);

                if (printLogs) {
                    console.log("==================== Logs for loop: " + id + ", tx: " + tx + " ====================")
                }
                let buyRate = await reserveInst.getConversionRate(ethAddress, token.address, srcBuyAmount, currentBlock);
                assert.notEqual(buyRate.valueOf(), 0, "buy rate should be greater than 0, loop: " + id);

                let expectedDestToken = calcDstQty(srcBuyAmount, ethDecimals, newTokenDecimals[id], buyRate);

                await reserveInst.trade(ethAddress, srcBuyAmount, token.address, user1, buyRate, true, {from:network, value: srcBuyAmount});
                let newReserveTokenBal = await token.balanceOf(reserveInst.address);

                let diffTokenBal = reserveTokenBalance.sub(newReserveTokenBal);
                reserveTokenBalance = newReserveTokenBal;
                assert.equal(diffTokenBal.valueOf(), expectedDestToken.valueOf(),  "token balance changed should be as expected, loop: " + id);

                totalSellBackAmount = totalSellBackAmount.add(diffTokenBal);

                // test for a single trade
                let sellRate = await reserveInst.getConversionRate(token.address, ethAddress, diffTokenBal, currentBlock);
                let tradeBackAmount = calcDstQty(diffTokenBal, newTokenDecimals[id], ethDecimals, sellRate);
                if (printLogs) {
                    console.log("Source buy amount wei: " + srcBuyAmount.valueOf() + ", eth: " + srcBuyAmount.div(ethPrecission).valueOf());
                    console.log("Dest amount twei: " + expectedDestToken.valueOf() + ", tokens: " + expectedDestToken.div(tokenPrecision).valueOf());
                    console.log("Trade back amount wei: " + tradeBackAmount.valueOf() + ", eth: " + tradeBackAmount.div(ethPrecission).valueOf());
                    console.log("Different src amount and traded back amount: " + srcBuyAmount.sub(tradeBackAmount).valueOf() + " at loop: " + id + " and tx: " + tx);
                }
                assert(srcBuyAmount * 1.0 >= tradeBackAmount * 1.0, "Trade back amount should be lower than src buy amount, loop: " + id);
                assert(srcBuyAmount.sub(tradeBackAmount) * 1.0 <= srcBuyAmount.div(BigNumber(10).pow(ethDecimals/2)).floor() * 1.0, "Different between trade back amount and src buy amount should be very small, loop: " + id);

                // Test for total src buy and sell back amounts
                sellRate = await reserveInst.getConversionRate(token.address, ethAddress, totalSellBackAmount, currentBlock);
                tradeBackAmount = calcDstQty(totalSellBackAmount, newTokenDecimals[id], ethDecimals, sellRate);
                if (printLogs) {
                    console.log("Different total src amount and total traded back amount: " + totalSrcBuyAmount.sub(tradeBackAmount).valueOf() + " at loop: " + id + " and tx: " + tx);
                }
                assert(totalSrcBuyAmount * 1.0 >= tradeBackAmount * 1.0, "Trade back amount should be lower than total src buy amount, loop: " + id);
                assert(totalSrcBuyAmount.sub(tradeBackAmount) * 1.0 <= totalSrcBuyAmount.div(BigNumber(10).pow(ethDecimals/2)).floor() * 1.0, "Different between trade back amount and total src buy amount should be very small, loop: " + id);
            }
        }
    });

    // with 0 fee, if user trades X token -> Y ETH, then trades Y ETH -> X' token, X' must not be greater than X for any X amount
    // test sell X token -> Y eth and then use Y eth to buy back token
    it("Should test sell tokens and then buy back", async function() {
        let length = newRs.length;
        if (length != newP0s.length || length != newE0s.length || length != newT0s.length
            || length != newFeePercents.length || length != newMaxCapBuyInEth.length || length != newTokenDecimals.length
            || length != newMaxCapSellInEth.length || length != newpMinRatios.length || length != newpMaxRatios.length) {
            assert(false, "length of new config param arrays are not matched, please check again");
        }
        // if i < newRs.length, we test buy then check rate
        // otherwise test sell then check rate
        for (let id = 0; id < newRs.length; id++) {
            let currentBlock = await Helper.getCurrentBlock();

            let token = await TestToken.new("test", "tst", newTokenDecimals[id]);

            let newLiqConvRatesInst = await LiquidityConversionRates.new(admin, token.address);

            let feeInBps = 0;
            let pMin = newP0s[id] * newpMinRatios[id];
            let pMax = newP0s[id] * newpMaxRatios[id];

            let rInFp = BigNumber(newRs[id]).mul(formulaPrecision);
            let pMinInFp = BigNumber(pMin).mul(formulaPrecision);
            let maxCapBuyInWei = BigNumber(newMaxCapBuyInEth[id]).mul(precision);
            let maxCapSellInWei = BigNumber(newMaxCapSellInEth[id]).mul(precision);
            let maxSellRateInPrecision = BigNumber(pMax).mul(precision);
            let minSellRateInPrecision = BigNumber(pMin).mul(precision);

            await newLiqConvRatesInst.setLiquidityParams(
                rInFp,
                pMinInFp,
                formulaPrecisionBits,
                maxCapBuyInWei.mul(100), // set higher cap to prevent fail big tx
                maxCapSellInWei.mul(100), // set higher cap to prevent fail big tx
                feeInBps,
                maxSellRateInPrecision,
                minSellRateInPrecision
            );

            let reserveInst = await Reserve.new(network, newLiqConvRatesInst.address, admin);
            await reserveInst.setContracts(network, newLiqConvRatesInst.address, 0);

            await newLiqConvRatesInst.setReserveAddress(reserveInst.address);

            //set reserve balance.
            let reserveEtherInit = ethPrecission.mul(newE0s[id]);
            await Helper.sendEtherWithPromise(accounts[8], reserveInst.address, reserveEtherInit);

            await reserveInst.approveWithdrawAddress(token.address, accounts[0], true);

            //transfer tokens to reserve.
            let amount = (BigNumber(10).pow(newTokenDecimals[id])).mul(newT0s[id]);
            await token.transfer(reserveInst.address, amount.valueOf());

            // sell then check buy rate
            let totalSrcSellAmount = BigNumber(0);
            let totalBuyBackAmount = BigNumber(0);
            for(let tx = 0; tx <= 5; tx++) {
                let srcSellAmount = maxCapBuyInWei.mul(newT0s[id]).div(newE0s[id]).div(BigNumber(10).pow(ethDecimals - newTokenDecimals[id])).div(tx + 2).floor(); // 1 token
                totalSrcSellAmount = totalSrcSellAmount.add(srcSellAmount);

                if (printLogs) {
                    console.log("==================== Logs for loop: " + id + ", tx: " + tx + " ====================")
                }

                let sellRate = await reserveInst.getConversionRate(token.address, ethAddress, srcSellAmount, currentBlock);
                assert.notEqual(sellRate.valueOf(), 0, "sell rate should be greater than 0, loop: " + id);

                let expectedDest = calcDstQty(srcSellAmount, newTokenDecimals[id], ethDecimals, sellRate);

                await token.transfer(network, srcSellAmount.valueOf());
                await token.approve(reserveInst.address, srcSellAmount, {from: network});
                await reserveInst.trade(token.address, srcSellAmount, ethAddress, user1, sellRate, true, {from: network});
                let newReserveEthBal = await Helper.getBalancePromise(reserveInst.address);

                let diffEthBal = reserveEtherInit.sub(newReserveEthBal);
                reserveEtherInit = newReserveEthBal;
                assert.equal(diffEthBal.valueOf(), expectedDest.valueOf(),  "balance changed should be as expected, loop: " + id);

                totalBuyBackAmount = totalBuyBackAmount.add(diffEthBal);

                let buyRate = await reserveInst.getConversionRate(ethAddress, token.address, diffEthBal, currentBlock);
                let tradeBackAmount = calcDstQty(diffEthBal, ethDecimals, newTokenDecimals[id], buyRate);
                if (printLogs) {
                    console.log("Source sell amount twei: " + srcSellAmount.valueOf() + ", tokens: " + srcSellAmount.div(tokenPrecision).valueOf());
                    console.log("Dest amount wei: " + expectedDest.valueOf() + ", eth: " + expectedDest.div(ethPrecission).valueOf());
                    console.log("Trade back amount twei: " + tradeBackAmount.valueOf() + ", tokens: " + tradeBackAmount.div(tokenPrecision).valueOf());
                    console.log("Different traded back amount and src sell amount: " + srcSellAmount.sub(tradeBackAmount).valueOf() + " at loop: " + id + " and tx: " + tx);
                }
                assert(tradeBackAmount * 1.0 <= srcSellAmount * 1.0, "Trade back amount should be lower than src sell amount, loop: " + id);
                assert(srcSellAmount.sub(tradeBackAmount) * 1.0 <= srcSellAmount.div(BigNumber(10).pow(newTokenDecimals[id]/2)).floor() * 1.0, "Different between trade back amount and src sell amount should be very small, loop: " + id);

                buyRate = await reserveInst.getConversionRate(ethAddress, token.address, totalBuyBackAmount, currentBlock);
                tradeBackAmount = calcDstQty(totalBuyBackAmount, ethDecimals, newTokenDecimals[id], buyRate);
                if (printLogs) {
                    console.log("Different expected dest and total src sell amount: " + totalSrcSellAmount.sub(expectedDest).valueOf() + " at loop: " + id + " and tx: " + tx);
                }
                assert(tradeBackAmount * 1.0 <= totalSrcSellAmount * 1.0, "Trade back amount should be lower than total src sell amount, loop: " + id);
                assert(totalSrcSellAmount.sub(tradeBackAmount) * 1.0 <= totalSrcSellAmount.div(BigNumber(10).pow(newTokenDecimals[id]/2)).floor() * 1.0, "Different between trade back amount and total src sell amount should be very small, loop: " + id);
            }
        }
    });

    // init new conversion rate, reserve, make a buy then check sell rate, make a sell and check buy rate
    it("Should allow buy/sell all inventory, check rate never fall above max rate or below min rate", async function() {
        let length = newRs.length;
        if (length != newP0s.length || length != newE0s.length || length != newT0s.length
            || length != newFeePercents.length || length != newMaxCapBuyInEth.length
            || length != newMaxCapSellInEth.length || length != newpMinRatios.length || length != newpMaxRatios.length) {
            assert(false, "length of new config param arrays are not matched, please check again");
        }

        // if i < newRs.length, we test buy then check rate
        // otherwise test sell then check rate
        for (let i = 0; i < newRs.length * 2; i++) {
            let id = i < newRs.length ? i : i - newRs.length;
            let currentBlock = await Helper.getCurrentBlock();

            let token = await TestToken.new("test", "tst", newTokenDecimals[id]);

            let newLiqConvRatesInst = await LiquidityConversionRates.new(admin, token.address);

            let feeInBps = 0;
            let pMin = newP0s[id] * newpMinRatios[id];
            let pMax = newP0s[id] * newpMaxRatios[id];

            let rInFp = BigNumber(newRs[id]).mul(formulaPrecision);
            let pMinInFp = BigNumber(pMin).mul(formulaPrecision);
            let maxCapBuyInWei = BigNumber(newMaxCapBuyInEth[id]).mul(precision);
            let maxCapSellInWei = BigNumber(newMaxCapSellInEth[id]).mul(precision);
            let maxSellRateInPrecision = BigNumber(pMax).mul(precision);
            let minSellRateInPrecision = BigNumber(pMin).mul(precision);

            await newLiqConvRatesInst.setLiquidityParams(
                rInFp,
                pMinInFp,
                formulaPrecisionBits,
                maxCapBuyInWei,
                maxCapSellInWei,
                feeInBps,
                maxSellRateInPrecision,
                minSellRateInPrecision
            );

            let reserveInst = await Reserve.new(network, newLiqConvRatesInst.address, admin);
            await reserveInst.setContracts(network, newLiqConvRatesInst.address, 0);

            await newLiqConvRatesInst.setReserveAddress(reserveInst.address);

            //set reserve balance.
            let reserveEtherInit = ethPrecission.mul(newE0s[id]);
            await Helper.sendEtherWithPromise(accounts[9], reserveInst.address, reserveEtherInit);

            await reserveInst.approveWithdrawAddress(token.address, accounts[0], true);

            //transfer tokens to reserve.
            let amount = (BigNumber(10).pow(newTokenDecimals[id])).mul(newT0s[id]);
            await token.transfer(reserveInst.address, amount.valueOf());

            if (i < newRs.length) {
                // buy then check sell rate
                let lastBuyRate = BigNumber(precision).div(newP0s[id]).floor();
                let srcAmount = maxCapBuyInWei;
                while (true) {
                    let bal = await token.balanceOf(reserveInst.address);
                    if (bal * 1.0 <= BigNumber(10).pow(newTokenDecimals[id]) * 1.0) { break; }
                    let buyRate = await reserveInst.getConversionRate(ethAddress, token.address, srcAmount, currentBlock);
                    if (buyRate.valueOf() == 0) {
                        while (true) {
                            srcAmount = srcAmount.div(2).floor();
                            if (srcAmount.valueOf() == 0) { break; }
                            buyRate = await reserveInst.getConversionRate(ethAddress, token.address, srcAmount, currentBlock);
                            if (buyRate.valueOf() != 0) { break; }
                        }
                        if (buyRate.valueOf() == 0) { break; }
                    }
                    lastBuyRate = buyRate;

                    await reserveInst.trade(ethAddress, srcAmount, token.address, user1, buyRate, true, {from:network, value: srcAmount});
                }
                // min sell rate is 1/max buy rate
                let minBuyRate = BigNumber(precision).div(pMax).floor();
                if (printLogs) {
                    console.log("Last buy rate found: " + lastBuyRate.valueOf());
                    console.log("Min supported buy rate: " + minBuyRate.valueOf());
                    console.log("Different last buy rate and min support buy rate: " + lastBuyRate.sub(minBuyRate).valueOf() + " at loop: " + i);
                }
                assert(lastBuyRate * 1.0 >= minBuyRate * 1.0, "buy rate must be greater or equal than min buy rate, loop: " + i);

                let tokenBal = await token.balanceOf(reserveInst.address);
                let amountEth = tokenBal.mul(precision).div(tokenBal).floor();
                // if rate is lower than minBuyRate, buying amountEth of ETH should get less than tokenBal of token
                // so balance of reserve is enough for transaction, but rate should be 0 as it is lower than minBuyRate
                let buyRate = await reserveInst.getConversionRate(ethAddress, token.address, amountEth, currentBlock);
                assert.equal(buyRate.valueOf(), 0, "buy rate should equal 0 as it falls under min sell rate");
            } else {
                // sell then check buy rate
                let lastSellRate = BigNumber(precision).mul(newP0s[id]).floor();
                let srcAmount = maxCapSellInWei.div(newP0s[id]).floor();
                while (true) {
                    let ethBal = await Helper.getBalancePromise(reserveInst.address);
                    let oneEth = BigNumber(10).pow(18);
                    if (ethBal * 1.0 < oneEth.div(100) * 1.0) { break; } // less than 0.001 ether
                    let sellRate = await reserveInst.getConversionRate(token.address, ethAddress, srcAmount, currentBlock);
                    if (sellRate.valueOf() == 0) {
                        while (true) {
                            srcAmount = srcAmount.div(2).floor();
                            sellRate = await reserveInst.getConversionRate(token.address, ethAddress, srcAmount, currentBlock);
                            if (sellRate.valueOf() != 0) { break; }
                        }
                        if (sellRate.valueOf() == 0) { break; }
                    }
                    lastSellRate = sellRate;

                    await token.transfer(network, srcAmount.valueOf());
                    await token.approve(reserveInst.address, srcAmount, {from: network});
                    await reserveInst.trade(token.address, srcAmount, ethAddress, user1, sellRate, true, {from: network});
                }
                let minSellRate = BigNumber(precision).mul(pMin).floor();
                if (printLogs) {
                    console.log("Last sell rate found: " + lastSellRate.valueOf());
                    console.log("Min supported sell rate: " + minSellRate.valueOf());
                    console.log("Different last sell rate and min support sell rate: " + lastSellRate.sub(minSellRate).valueOf() + " at loop: " + i);
                }
                assert(lastSellRate * 1.0 >= minSellRate * 1.0, "sell rate must be greater or equal than min sell rate, loop: " + i);

                let ethBal = await Helper.getBalancePromise(reserveInst.address);
                let amountToken = ethBal.mul(precision).div(minSellRate).floor();
                // if rate is lower than minSellRate, sell amountToken of token should get less than ethBal of ETH
                // so balance of reserve is enough for transaction, but rate should be 0 as it is lower than minSellRate
                let sellRate = await reserveInst.getConversionRate(token.address, ethAddress, amountToken, currentBlock);
                assert.equal(sellRate.valueOf(), 0, "sell rate should equal 0 as it falls under min sell rate");
            }
        }
    });

    it("should check getting prices for random values.", async function () {

        // changing values for this test
        let formulaPrecisionBitsOptions = {"standard": 40}
        let tokenDecimalsOptions = {"standard": 18, "like_dgx": 9, "like_btc:": 8, "small": 4}
        let rOptions = {"standard": 0.01,
                        "small_r": 0.001,
                        "large_r": 0.1}
        let pOptions = {"standard": 0.00023,
                        "low_value":0.0000067,
                        "high_price_comparing_to_eth": 0.2}
        let deltaEOptions = {"standard": 0.1, "small": 1/100000, "large": 10.0}

        for (let [key, randFormulaPrecisionBits] of Object.entries(formulaPrecisionBitsOptions)) {
            for (let [key, randTokenDecimals] of Object.entries(tokenDecimalsOptions)) {
                for (let [key, randR] of Object.entries(rOptions)) {
                    for (let [key, randP0] of Object.entries(pOptions)) {
                        for (let [key, randDeltaE] of Object.entries(deltaEOptions)) {

                            let randE0 = 69.315
                            let randT0 = 2329916.12
                            let randFormulaPrecision = BigNumber(2).pow(randFormulaPrecisionBits)
                            let randMaxCapBuyInEth = 11.0
                            let randMaxCapSellInEth = 11.0
                            let randFeePercent = feePercent
    
                            let randPmin = BigNumber(randP0).div((Helper.exp(e, BigNumber(randR).mul(randE0))))
                            let randPmax = BigNumber((randP0 / (1 - randR * randP0 * randT0)).toString()) 
    
                            let randDeltaEInFp = BigNumber(randDeltaE).mul(formulaPrecision);
                            let randEInFp = BigNumber(randE0).mul(randFormulaPrecision);
                            let randRInFp = BigNumber(randR).mul(randFormulaPrecision);
                            let randPminInFp = BigNumber(randPmin).mul(randFormulaPrecision);
                            let randMaxCapBuyInWei = BigNumber(randMaxCapBuyInEth).mul(precision);
                            let randMaxCapSellInWei = BigNumber(randMaxCapSellInEth).mul(precision);
                            let randFeeInBps = randFeePercent * 100
                            let randMaxSellRateInPrecision = BigNumber(randPmax).mul(precision);
                            let randMinSellRateInPrecision = BigNumber(randPmin).mul(precision);

                            let randToken = await TestToken.new("test", "tst", randTokenDecimals);
                            liqConvRatesInst = await LiquidityConversionRates.new(admin, randToken.address);
                            liqConvRatesInst.setReserveAddress(reserveAddress)

                            await liqConvRatesInst.setLiquidityParams(
                                    randRInFp,
                                    randPminInFp,
                                    randFormulaPrecisionBits,
                                    randMaxCapBuyInWei,
                                    randMaxCapSellInWei,
                                    randFeeInBps,
                                    randMaxSellRateInPrecision,
                                    randMinSellRateInPrecision)

                            let randQtyInSrcWei = BigNumber(randDeltaE).mul(precision)

                            let result = await liqConvRatesInst.getRateWithE(
                                    randToken.address,
                                    true,
                                    randQtyInSrcWei,
                                    randEInFp);

                            let expectedResult = priceForDeltaE(
                                    randFeePercent,
                                    randR,
                                    randPmin,
                                    randDeltaE,
                                    randE0).mul(precision).valueOf()
                            Helper.assertAbsDiff(result, expectedResult, expectedDiffInPct)
                        }
                    }
                }
            }  
        }
    });
});

function calcDstQty(srcQty, srcDecimals, dstDecimals, rate) {
    rate = new BigNumber(rate);
    if (dstDecimals >= srcDecimals) {
        let decimalDiff = (new BigNumber(10)).pow(dstDecimals - srcDecimals);
        return (rate.mul(srcQty).mul(decimalDiff).div(precision)).floor();
    } else {
        let decimalDiff = (new BigNumber(10)).pow(srcDecimals - dstDecimals);
        return (rate.mul(srcQty).div(decimalDiff.mul(precision))).floor();
    }
}