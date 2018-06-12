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
const r = 0.01
const p0 = 0.00005
const pMin = 0.5 * p0
const pMax = 2 * p0
const feePercent = 0.25
const maxCapBuyInEth = 61
const maxCapSellInEth = 201

// default values deducted from r, pMim and pMin/pMax ratio from p0
const e0 = eForCurPWithoutFees(r, p0)
const t0 = tForCurPWithoutFees(r, p0)

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

function pOfE(r, pMin, curE) { 
    return Helper.exp(e, BigNumber(r).mul(curE)).mul(pMin);
}

function buyPriceForZeroQuant(r, pMin, curE) { 
    pOfERes = pOfE(r, pMin, curE);
    return BigNumber(1).div(pOfERes);
}

function sellPriceForZeroQuant(r, pMin, curE) { 
      return pOfE(r, pMin, curE);
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

async function sellRateForZeroQuantInPrecision() {
    let rate = await liqConvRatesInst.getRate(tokenAdd, 0, false, 0);
    return rate;
}

async function buyRateForZeroQuantInPrecision() {
    let rate = await liqConvRatesInst.getRate(tokenAdd, 0, true, 0);
    return rate;
}

async function getExpectedTWithoutFees() {
    let rateFor0InPrecision = await sellRateForZeroQuantInPrecision();
    let rateFor0 = rateFor0InPrecision.div(precision);
    return tForCurPWithoutFees(r, rateFor0.valueOf());
}

function assertAbsDiff(val1, val2, expectedDiffInPct) {
    val1 = val1.toString()
    val2 = val2.toString()
    assert(Helper.checkAbsDiff(val1,val2,expectedDiffInPct),
            "first val is " + val1 +
            " second val is " + val2 +
            " result diff is " + Helper.absDiff(val1, val2).toString(10) +
            " actual result diff in percents is " + Helper.absDiffInPercent(val1,val2).toString(10));
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
    const deltaE = 2.7
    const deltaEInFp = BigNumber(deltaE).mul(formulaPrecision);
    const deltaT = 120.0
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
        await liqConvRatesInst.setLiquidityParams(rInFp, pMinInFp, formulaPrecisionBits, maxCapBuyInWei, maxCapSellInWei, feeInBps, maxSellRateInPrecision, minSellRateInPrecision) 
    });

    it("should test calculation of collected fee for buy case.", async function () {
        await liqConvRatesInst.resetCollectedFees()

        let input = 1458 * formulaPrecision
        let expectedValueBeforeReducingFee = input / ((100 - feePercent)/100)
        let expectedResult = (feePercent / 100) * expectedValueBeforeReducingFee

        await liqConvRatesInst.recordImbalance(token.address, input, 0, 0, {from: reserveAddress})
        result = await liqConvRatesInst.collectedFeesInTwei()
        assertAbsDiff(result, expectedResult, expectedDiffInPct)
    });

    it("should test calculation of collected fee for sell case.", async function () {
        await liqConvRatesInst.resetCollectedFees()
        let input = -1458 * formulaPrecision
        let expectedResult = (-input) * (feePercent / 100)

        await liqConvRatesInst.recordImbalance(token.address, input, 0, 0, {from: reserveAddress})
        result = await liqConvRatesInst.collectedFeesInTwei()
        assertAbsDiff(result, expectedResult, expectedDiffInPct)
    });

    it("should test reducing fees from amount.", async function () {
        let input = 5763 * formulaPrecision;
        let expectedResult =  input * (100 - feePercent) / 100;
        let result =  await liqConvRatesInst.reduceFee(input);
        assertAbsDiff(result, expectedResult, expectedDiffInPct)
    });

    it("should test converting from wei to formula formulaPrecision.", async function () {
        let input = BigNumber(7).mul(precision)
        let expectedResult = input.mul(formulaPrecision).div(precision) 
        let result =  await liqConvRatesInst.fromWeiToFp(input);
        assertAbsDiff(result, expectedResult, expectedDiffInPct)
    });

    it("should test converting from token wei to formula formulaPrecision.", async function () {
        let input = BigNumber(10).pow(tokenDecimals).mul(17);
        let expectedResult = input.mul(formulaPrecision).div(tokenPrecision) 
        let result =  await liqConvRatesInst.fromTweiToFp(input);
        assertAbsDiff(result, expectedResult, expectedDiffInPct)
    });

    it("should test calculation of buy rate for zero quantity.", async function () {
        let expectedResult = buyPriceForZeroQuant(r, pMin, e0).mul(precision).valueOf()
        let result =  await liqConvRatesInst.buyRateZeroQuantity(eInFp);
        assertAbsDiff(result, expectedResult, expectedDiffInPct)
    });

    it("should test calculation of sell rate for zero quantity.", async function () {
        let expectedResult = sellPriceForZeroQuant(r, pMin, e0).mul(precision).valueOf()
        let result =  await liqConvRatesInst.sellRateZeroQuantity(eInFp);
        assertAbsDiff(result, expectedResult, expectedDiffInPct)
    });

    it("should test calculation of deltaT.", async function () {
        let expectedResult = calcDeltaT(r, pMin, deltaE, e0).abs().mul(formulaPrecision).valueOf()
        let result =  await liqConvRatesInst.deltaTFunc(rInFp, pMinInFp, eInFp, deltaEInFp, formulaPrecision);
        assertAbsDiff(result, expectedResult, expectedDiffInPct)
    });

    it("should test calculation of buy rate for non zero quantity.", async function () {
        let expectedResult = priceForDeltaE(feePercent, r, pMin, deltaE, e0).mul(precision).valueOf()
        let result =  await liqConvRatesInst.buyRate(eInFp, deltaEInFp)
        assertAbsDiff(result, expectedResult, expectedDiffInPct)
    });

    it("should test calculation of deltaE.", async function () {
        let expectedResult = calcDeltaE(r, pMin, deltaT, e0).abs().mul(formulaPrecision).valueOf()
        let result =  await liqConvRatesInst.deltaEFunc(rInFp, pMinInFp, eInFp, deltaTInFp, formulaPrecision, formulaPrecisionBits);
        assertAbsDiff(result, expectedResult, expectedDiffInPct)
    });

    it("should test calculation of sell rate for non zero quantity.", async function () {
        let expectedResult = priceForDeltaT(feePercent, r, pMin, deltaT, e0).mul(precision).valueOf()
        let deltaTAfterReducingFeeInFp = BigNumber(deltaTInFp).mul((100 - feePercent) / 100);
        let result =  await liqConvRatesInst.sellRate(eInFp, deltaTInFp, deltaTAfterReducingFeeInFp);
        result = result[0]
        assertAbsDiff(result, expectedResult, expectedDiffInPct)
    });

    it("should test recording of imbalance.", async function () {
        let buyAmountInTwei = BigNumber(10).pow(tokenDecimals).mul(deltaT)

        let expectedValueBeforeReducingFee = buyAmountInTwei.mul(3) / ((100 - feePercent)/100) // TODO - this calc is a duplication, move to general place...
        let expectedResult = BigNumber(((feePercent / 100) * expectedValueBeforeReducingFee).toString())

        await liqConvRatesInst.recordImbalance(token.address, buyAmountInTwei, 3000, 3000, {from: reserveAddress})
        await liqConvRatesInst.recordImbalance(token.address, buyAmountInTwei.mul(2), 3000, 3000, {from: reserveAddress})
        let result = await liqConvRatesInst.collectedFeesInTwei()

        assertAbsDiff(result, expectedResult, expectedDiffInPct)
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
        assertAbsDiff(result, expectedResult, expectedDiffInPct)
    });

    it("should test getrate for buy=true and qtyInSrcWei = 0.", async function () {
        let expectedResult = buyPriceForZeroQuant(r, pMin, e0).mul(precision).valueOf()
        let qtyInSrcWei = 0
        let result =  await liqConvRatesInst.getRateWithE(token.address,true,qtyInSrcWei,eInFp);
        assertAbsDiff(result, expectedResult, expectedDiffInPct)
    });

    it("should test getrate for buy=false and qtyInSrcWei = non_0.", async function () {
        let qtyInSrcWei = BigNumber(deltaT).mul(tokenPrecision)
        let expectedResult = priceForDeltaT(feePercent, r, pMin, deltaT, e0).mul(precision).valueOf()
        let result =  await liqConvRatesInst.getRateWithE(token.address,false,qtyInSrcWei,eInFp);
        assertAbsDiff(result, expectedResult, expectedDiffInPct)
    });

    it("should test getrate for buy=false and qtyInSrcWei = 0.", async function () {
        let expectedResult = sellPriceForZeroQuant(r, pMin, e0).mul(precision).valueOf()
        let qtyInSrcWei = 0
        let result =  await liqConvRatesInst.getRateWithE(token.address,false,qtyInSrcWei,eInFp);
        assertAbsDiff(result, expectedResult, expectedDiffInPct)
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

        assertAbsDiff(result, expectedResult, expectedDiffInPct)
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
        let qtyInSrcWei = BigNumber(maxCapSellInEth + 1.0).mul(precision)
        let result =  await liqConvRatesInst.getRateWithE(token.address,true,qtyInSrcWei,eInFp);
        assert.equal(result, 0, "bad result");
    });

    it("should test get rate", async function () {
        let balance = await Helper.getBalancePromise(reserveAddress);
        let eInEth = balance.div(precision)
        let expectedResult = priceForDeltaE(feePercent, r, pMin, deltaE, eInEth).mul(precision)
        let qtyInSrcWei = BigNumber(deltaE).mul(precision)
        let result =  await liqConvRatesInst.getRate(token.address, 0, true, qtyInSrcWei);
        assertAbsDiff(result, expectedResult, expectedDiffInPct)
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


contract('KyberReserve', function(accounts) {
    it("should init globals. init ConversionRates Inst, token, set liquidity params .", async function () {
        // set account addresses
        admin = accounts[0];
        network = accounts[2];
        user1 = accounts[4];
        user2 = accounts[5];

        currentBlock = await Helper.getCurrentBlock();

        token = await TestToken.new("test", "tst", 18);
        tokenAdd = token.address;

        liquidityConvRatesInst = await LiquidityConversionRates.new(admin, token.address);
        await liquidityConvRatesInst.setLiquidityParams(
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
        reserveInst = await Reserve.new(network, liquidityConvRatesInst.address, admin);
        await reserveInst.setContracts(network, liquidityConvRatesInst.address, 0);

        await liquidityConvRatesInst.setReserveAddress(reserveInst.address);

        //set reserve balance.
        let reserveEtherInit = (BigNumber(10).pow(18)).mul(e0);
        await Helper.sendEtherWithPromise(accounts[9], reserveInst.address, reserveEtherInit);
        
        let balance = await Helper.getBalancePromise(reserveInst.address);
        expectedReserveBalanceWei = balance.valueOf();

        assert.equal(balance.valueOf(), reserveEtherInit, "wrong ether balance");

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
        assertAbsDiff(expectedResult,result,expectedDiffInPct);
    });

    it("should test getConversionRate of sell rate for zero quantity.", async function () {
        let expectedResult = sellPriceForZeroQuant(r, pMin, e0).mul(precision).valueOf()
        let amountWei = 0;
        let result = await reserveInst.getConversionRate(token.address, ethAddress, amountWei, currentBlock);
        assertAbsDiff(expectedResult, result, expectedDiffInPct);
    });

    it("should test getConversionRate of buy rate for non zero quantity.", async function () {
        let deltaE = 2.7
        let expectedResult = priceForDeltaE(feePercent, r, pMin, deltaE, e0).mul(precision).valueOf()
        let amountWei = BigNumber(10).pow(18).mul(deltaE)
        let result = await reserveInst.getConversionRate(ethAddress, token.address, amountWei, currentBlock);
        assertAbsDiff(expectedResult, result, expectedDiffInPct);
    });

    it("should test getConversionRate of sell rate for non zero quantity.", async function () {
        let deltaT = 120.0
        let expectedResult = priceForDeltaT(feePercent, r, pMin, deltaT, e0).mul(precision).valueOf()
        let amountWei = BigNumber(10).pow(tokenDecimals).mul(deltaT)
        let result = await reserveInst.getConversionRate(token.address, ethAddress, amountWei, currentBlock);
        assertAbsDiff(expectedResult, result, expectedDiffInPct);
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
            amountEth = (!prevBuyRate) ? 60.0 : 3.0
            amountWei = BigNumber(amountEth).mul(precision);

            // get expected and actual rate
            expectedRate = priceForDeltaE(feePercent, r, pMin, amountEth, balancesBefore["EInEth"]).mul(precision)
            buyRate = await reserveInst.getConversionRate(ethAddress, token.address, amountWei, currentBlock);

            // make sure buys are only ended when we are around 1/Pmax 
            if (buyRate == 0) {
                let rateFor0 = await buyRateForZeroQuantInPrecision();
                let expectedMinRate = (BigNumber(1).div(pMax)).mul(precision);
                let thresholdPriceexpectedDiffInPct = BigNumber(1.0);
                assertAbsDiff(rateFor0, expectedMinRate, thresholdPriceexpectedDiffInPct);
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
            assertAbsDiff(buyRate, expectedRate, expectedDiffInPct);

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
            assertAbsDiff(balancesAfter["User1Twei"], expectedUser1TweiAmount, expectedDiffInPct);

            // check reserve token balance after the trade (lost some tokens) is as expected.
            tradeActualTweiAmount = buyRate.mul(amountWei).div(precision)
            expectedReserveTokenBalance = balancesBefore["TInTwei"].minus(tradeActualTweiAmount);
            assertAbsDiff(balancesAfter["TInTwei"], expectedReserveTokenBalance, expectedDiffInPct);

            // check collected fees for this trade is as expected
            expectedCollectedFeesDiff = tradeActualTweiAmount.mul(feePercent / 100).div(tokenPrecision * ((100 - feePercent)/100));
            collectedFeesInTokensDiff = balancesAfter["collectedFeesInTokens"].minus(balancesBefore["collectedFeesInTokens"])
            assertAbsDiff(expectedCollectedFeesDiff, collectedFeesInTokensDiff, expectedDiffInPct);

            // check amount of extra tokens is at least as collected fees
            if (feePercent != 0) {
                expectedTWithoutFees = await getExpectedTWithoutFees();
                expectedFeesAccordingToTheory = balancesAfter["TInTokens"].minus(expectedTWithoutFees);
                assertAbsDiff(balancesAfter["collectedFeesInTokens"], expectedFeesAccordingToTheory, expectedDiffInPct);
            };
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
            amountTokens = (!prevSellRate) ? 1900000 : 50000
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
                let rateFor0 = await sellRateForZeroQuantInPrecision();
                let expectedMinRate = BigNumber(pMin).mul(precision);
                let thresholdPriceexpectedDiffInPct = BigNumber(1.0);
                assertAbsDiff(rateFor0, expectedMinRate, thresholdPriceexpectedDiffInPct);
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
            assertAbsDiff(sellRate, expectedRate, expectedDiffInPct);

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
            assertAbsDiff(balancesAfter["EInWei"], expectedReserveBalanceWei, expectedDiffInPct);

            //check token balance on network after the trade (lost some tokens) is as expected. 
            expectedTweiAmount = balancesBefore["networkTwei"].minus(amountTwei);
            assertAbsDiff(balancesAfter["networkTwei"], expectedTweiAmount, expectedDiffInPct);

            //check reserve token balance after the trade (got some tokens) is as expected.
            expectedReserveTokenBalance = balancesBefore["TInTwei"].plus(amountTwei);
            assertAbsDiff(balancesAfter["TInTwei"], expectedReserveTokenBalance, expectedDiffInPct);

            // check collected fees for this trade is as expected
            expectedCollectedFeesDiff = amountTwei.mul(feePercent / 100).div(tokenPrecision);
            collectedFeesInTokensDiff = balancesAfter["collectedFeesInTokens"].minus(balancesBefore["collectedFeesInTokens"])
            assertAbsDiff(expectedCollectedFeesDiff, collectedFeesInTokensDiff, expectedDiffInPct);

            // check amount of extra tokens is at least as collected fees
            if (feePercent != 0) {
                expectedTWithoutFees = await getExpectedTWithoutFees();
                expectedFeesAccordingToTheory = balancesAfter["TInTokens"].minus(expectedTWithoutFees);
                assertAbsDiff(balancesAfter["collectedFeesInTokens"], expectedFeesAccordingToTheory, expectedDiffInPct);
            };
        };

        // make sure at least a few iterations were done
        assert(iterations > 3, "not enough iterations, bad run");
    });
});
