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
let network;

//users
let user1
let user2

//contracts
let convRatesInst;
let reserveInst;
let liquidityConvRatesInst;
let token
let tokenAdd

//block data
let currentBlock;

//general calculation related consts
const e = new BigNumber("2.7182818284590452353602874713527");
const expectedDiffInPct = new BigNumber(0.1);

// default values
const precision = BigNumber(10).pow(18);
const formulaPrecisionBits = 40;
const formulaPrecision = BigNumber(2).pow(formulaPrecisionBits)
const tokenDecimals = 18
const tokenPrecision = BigNumber(10).pow(tokenDecimals)
const e0 = 69.3147180559
const t0 = 1000000.0
const r = 0.01
const p0 = 0.00005
const pMin = 0.5 * p0
const pMax = 2 * p0
const feePercent = 0.25
const maxCapBuyInEth = 61
const maxCapSellInEth = 201

// default values in contract common units
const feeInBps = feePercent * 100
const EInFp = BigNumber(e0).mul(formulaPrecision);
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

function tForCurPWithoutFees(r, curP) {
    let oneOverPmax = BigNumber(1).div(pMax);
    let oneOverCurP = BigNumber(curP); // no 1/X since theory assumes the price is 1/price
    let oneOverR = BigNumber(1).div(r);
    let t = oneOverR.mul(oneOverCurP.minus(oneOverPmax));
    return t;
}

function assertAbsDiff(val1, val2, expectedDiffInPct) {
    assert(Helper.checkAbsDiff(val1,val2,expectedDiffInPct),
            "exp result diff is " + Helper.absDiff(val1,val2).toString(10));
}

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
                maxBuyRateInPrecision,
                minBuyRateInPrecision,
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

    it("should perform a series of buys and check: correct balances change, rate is expected rate.", async function () {
        let prevBuyRate = 0;
        await liquidityConvRatesInst.resetCollectedFees()

        while (true) {
            //TODO - Make a separate function, no need for InWei etc.., can make single line
            // get current e0 and t0 (before the trade)
            currentEInWei = await Helper.getBalancePromise(reserveInst.address);
            currentEInEth = currentEInWei.div(precision)
            currentTInTwei = await token.balanceOf(reserveInst.address);
            currentTInTokens = currentTInTwei.div(tokenPrecision)
            currentUserTokenTweiBalance = await token.balanceOf(user1);
            collectedFeesInTweiBefore = await liquidityConvRatesInst.collectedFeesInTwei()
            collectedFeesInTokensBefore = collectedFeesInTweiBefore.div(tokenPrecision);

            // choose amount to trade
            if (prevBuyRate == 0) {
                //amountEth = 10.0; //50.0
                amountEth = 10.0;
            }
            else {
                //break;
                amountEth = 5.0; // 5.0
            }
            amountWei = BigNumber(amountEth).mul(precision);

            // get expected and actual rate
            expectedRate = priceForDeltaE(feePercent, r, pMin, amountEth, currentEInEth).mul(precision)
            //expectedDestQty = calcDeltaT(r, pMin, amountEth, currentEInEth)
            buyRate = await reserveInst.getConversionRate(ethAddress, token.address, amountWei, currentBlock);

            //console.log("buyRate: " + buyRate.toString())
            expectedDestQty = calcDeltaT(r, pMin, amountEth, currentEInEth)
            console.log("expectedDestQty: " + expectedDestQty.toString())
            yaronEInFp = currentEInEth.mul(formulaPrecision)
            yarondDeltaEInFp = BigNumber(amountEth).mul(formulaPrecision)
            yaronDeltaT = await liquidityConvRatesInst.deltaTFunc(rInFp, pMinInFp, yaronEInFp, yarondDeltaEInFp, formulaPrecision); 

//            console.log("\n\n\n\n\n\n\n\********************************")
//            console.log("r :" + r.toString());
//            console.log("pMin :" + pMin.toString());
//            console.log("amountEth :" + amountEth.toString());
//            console.log("currentEInEth :" + currentEInEth.toString());
            console.log("yaronDeltaT :" + yaronDeltaT.div(formulaPrecision).toString())
//            console.log("expectedDestQty: " + expectedDestQty.toString())
//            console.log("\n\n\n\n\n\n\n********************************")

            // expect to eventually get 0 rate when tokens are depleted or rate went lower than min buy rate. 
            if (buyRate == 0 || buyRate == 222 || buyRate == 333) {
                assert((expectedDestQty < currentTInTokens) || (BigNumber(expectedRate).lt(minBuyRateInPrecision)),
                       "got 0 rate without justification ")
                break;
            }

            // make sure prices (tokens/eth) are getting lower as tokens are depleted.
            if (!prevBuyRate) {
                prevBuyRate = buyRate;
            } else {
                assert(buyRate.lt(prevBuyRate));
                prevBuyRate = buyRate;
            }
            assertAbsDiff(buyRate, expectedRate, expectedDiffInPct);

            //perform trade
            await reserveInst.trade(ethAddress, amountWei, token.address, user1, buyRate, true, {from:network, value:amountWei});

            // check reserve eth balance after the trade (got more eth) is as expected.
            expectedReserveBalanceWei = currentEInWei.add(amountWei);
            let balance = await Helper.getBalancePromise(reserveInst.address);
            assert.equal(balance.valueOf(), expectedReserveBalanceWei.valueOf(), "bad reserve balance wei");

            //check token balance on user1 after the trade (got more tokens) is as expected. 
            tokenTweiBalance = await token.balanceOf(user1);
            tradeExpectedTweiAmount = expectedRate.mul(amountWei).div(precision)
            expectedTweiAmount = currentUserTokenTweiBalance.plus(tradeExpectedTweiAmount);
            assertAbsDiff(tokenTweiBalance, expectedTweiAmount, expectedDiffInPct);

            //check reserve token balance after the trade (lost some tokens) is as expected.
            tradeActualTweiAmount = buyRate.mul(amountWei).div(precision)
            console.log("tradeActualTweiAmount in tokens: " + tradeActualTweiAmount.div(tokenPrecision).toString());
            reserveTokenBalance = reserveTokenBalance.minus(tradeActualTweiAmount);
            let reportedBalance = await token.balanceOf(reserveInst.address);
            assertAbsDiff(reportedBalance, reserveTokenBalance, expectedDiffInPct);

            // get current e0 and t0 (after the trade) //TBD - make this a function
            currentEInWeiAfter = await Helper.getBalancePromise(reserveInst.address);
            currentEInEthAfter = currentEInWeiAfter.div(precision)
            currentTInTweiAfter = await token.balanceOf(reserveInst.address);
            currentTInTokensAfter = currentTInTweiAfter.div(tokenPrecision)
            currentUserTokenTweiBalanceAfter = await token.balanceOf(user1);

            console.log("***********" + currentEInEth.toString())
            console.log("currentEInEthAfter: " + currentEInEthAfter.toString())
            console.log("currentTInTokensAfter: " + currentTInTokensAfter.toString())

            // check collected fees in token is right.
            let collectedFeesInTwei = await liquidityConvRatesInst.collectedFeesInTwei()
            console.log("collectedFeesInTwei: " + collectedFeesInTwei.toString())
            let collectedFeesInTokensAfter = collectedFeesInTwei.div(tokenPrecision);
            console.log("collectedFeesInTokensAfter: " + collectedFeesInTokensAfter.toString())
            let collectedFeesInTokensDiff = collectedFeesInTokensAfter.minus(collectedFeesInTokensBefore)
            console.log("collectedFeesInTokensDiff: " + collectedFeesInTokensDiff.toString())
            let expectedCollectedFeesDiff = tradeActualTweiAmount.mul(feePercent / 100).div(tokenPrecision * ((100 - feePercent)/100));
            console.log("expectedCollectedFeesDiff: " + expectedCollectedFeesDiff.toString())

            // check amount of extra tokens is at least as collectedFeesIntokens
            // TODO - move to a separate function.
            if (feePercent != 0) {
                let pOfCUrE = pOfE(r, pMin, currentEInEth);
                let rateFor0InPrecision = await liquidityConvRatesInst.getRate(tokenAdd, 0, true, 0);
                let rateFor0 = rateFor0InPrecision.div(precision);
                let curP = rateFor0.valueOf();
                console.log("curP: " + curP);
                expectedTWithoutFees = tForCurPWithoutFees(r, curP)
                console.log("expectedTWithoutFees: " + expectedTWithoutFees.toString());
                expectedFeesAccordingToTheory = currentTInTokensAfter.minus(expectedTWithoutFees);
                console.log("expectedFeesAccordingToTheory: " + expectedFeesAccordingToTheory.toString());
                assertAbsDiff(collectedFeesInTokensAfter.toString(), expectedFeesAccordingToTheory.toString(), expectedDiffInPct);
            }

        };


    });

    it("should perform a series of sells and check: correct balances change, rate is expected rate.", async function () {
        let prevSellRate = 0;

        //no need to transfer initial balance to user
        //in the full scenario. user approves network which collects the tokens and approves reserve
        //which collects tokens from network.
        //so here transfer tokens to network and approve allowance from network to reserve.
        Tx4InTwei = BigNumber(t0).mul(4).mul(tokenPrecision)
        await token.transfer(network, Tx4InTwei);

        while (true) {
            // get current e0 and t0
            currentEInWei = await Helper.getBalancePromise(reserveInst.address);
            currentEInEth = currentEInWei.div(precision)
            currentTInTwei = await token.balanceOf(reserveInst.address);
            currentTInTokens = currentTInTwei.div(tokenPrecision)
            currentNetworkTokenTweiBalance = await token.balanceOf(network);
            collectedFeesInTweiBefore = await liquidityConvRatesInst.collectedFeesInTwei()
            collectedFeesInTokensBefore = collectedFeesInTweiBefore.div(tokenPrecision);

            console.log("***********")
            //console.log("currentEInEth: " + currentEInEth.toString())
            //console.log("currentTInTokens: " + currentTInTokens.toString())

            // choose amount to trade
            if (prevSellRate == 0) {
                amountTokens = 1900000.00
            }
            else {
                amountTokens = 50000.00
            }

            amountTwei = BigNumber(amountTokens).mul(tokenPrecision)
            amountTokensAfterFees = amountTokens * (100 - feePercent) / 100;
            //amountWei = BigNumber(amountEth).mul(precision);

            // get expected and actual rate
            //priceForDeltaT(r, pMin, deltaT, curE)
            expectedRate = priceForDeltaT(feePercent, r, pMin, amountTokens, currentEInEth).mul(precision).valueOf();
            expectedDestQty = calcDeltaE(r, pMin, amountTokensAfterFees, currentEInEth) ;
            sellRate = await reserveInst.getConversionRate(token.address, ethAddress, amountTwei, currentBlock);
            //buyRate = await reserveInst.getConversionRate(ethAddress, token.address, amountWei, currentBlock);

            //rateFor0 = await liquidityConvRatesInst.getRate(tokenAdd, 0, false, 0)
            //console.log("rateFor0: " + rateFor0.toString());

            //console.log("expectedRate: " + expectedRate.toString());
            //console.log("sellRate: " + sellRate.toString());
            //console.log("expectedDestQty: " + expectedDestQty.toString());
            // expect to eventually get 0 rate when tokens are depleted or rate went lower than min buy rate. 
            if ((sellRate == 0 || sellRate == 222 || sellRate == 333)) {
                assert((expectedDestQty < currentEInEth) || (BigNumber(expectedRate).lt(maxSellRateInPrecision)),
                       "got 0 rate without justification ")
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

            //console.log("tokenAdd: " + tokenAdd.toString());
            //console.log("amountTwei: " + amountTwei.toString());
            //console.log("ethAddress: " + ethAddress.toString());
            //console.log("user2: " + user2.toString());
            //console.log("sellRate: " + sellRate.toString());
            //balance = await token.balanceOf(admin);
            //console.log("balance: " + balance.toString());
            
            //pre trade step, approve allowance from user to network.
            await token.approve(reserveInst.address, amountTwei, {from: network});
            await reserveInst.trade(token.address, amountTwei, ethAddress, user2, sellRate, true, {from:network});

            // check reserve eth balance after the trade (reserve lost some eth) is as expected.
            tradeExpectedWeiAmount = BigNumber(expectedDestQty).mul(precision).abs()
            console.log("tradeExpectedWeiAmount: " + tradeExpectedWeiAmount.toString())
            expectedReserveBalanceWei = currentEInWei.minus(tradeExpectedWeiAmount);
            console.log("expectedReserveBalanceWei: " + expectedReserveBalanceWei.toString())
            let balance = await Helper.getBalancePromise(reserveInst.address);
            //assert.equal(balance.valueOf(), expectedReserveBalanceWei.valueOf(), "bad reserve balance wei");
            assertAbsDiff(balance, expectedReserveBalanceWei, expectedDiffInPct);

            //check token balance on network after the trade (lost some tokens) is as expected. 
            tokenTweiBalance = await token.balanceOf(network);
            tradeExpectedTweiAmount = amountTwei;
            expectedTweiAmount = currentNetworkTokenTweiBalance.minus(tradeExpectedTweiAmount);
            console.log("tradeExpectedTweiAmount: " + tradeExpectedTweiAmount.toString())
            console.log("expectedTweiAmount: " + expectedTweiAmount.toString())
            console.log("tokenTweiBalance: " + tokenTweiBalance.toString())
            assertAbsDiff(tokenTweiBalance, expectedTweiAmount, expectedDiffInPct);

            //check reserve token balance after the trade (got some tokens) is as expected.
            tradeActualTweiAmount = amountTwei //sellRate.mul(amountWei).div(precision)
            console.log("reserveTokenBalance: " + reserveTokenBalance.toString())
            console.log("tradeActualTweiAmount: " + tradeActualTweiAmount.toString())
            reserveTokenBalance = reserveTokenBalance.plus(tradeActualTweiAmount);
            console.log("reserveTokenBalance: " + reserveTokenBalance.toString())
            reportedBalance = await token.balanceOf(reserveInst.address);
            assertAbsDiff(reportedBalance.toString(), reserveTokenBalance.toString(), expectedDiffInPct);

            // get current e0 and t0 (after the trade) //TBD - make this a function
            currentEInWeiAfter = await Helper.getBalancePromise(reserveInst.address);
            currentEInEthAfter = currentEInWeiAfter.div(precision)
            currentTInTweiAfter = await token.balanceOf(reserveInst.address);
            currentTInTokensAfter = currentTInTweiAfter.div(tokenPrecision)
            currentUserTokenTweiBalanceAfter = await token.balanceOf(user1);

            console.log("***********" + currentEInEth.toString())
            console.log("currentEInEthAfter: " + currentEInEthAfter.toString())
            console.log("currentTInTokensAfter: " + currentTInTokensAfter.toString())

            // check collected fees in token is right.
            let collectedFeesInTwei = await liquidityConvRatesInst.collectedFeesInTwei()
            console.log("collectedFeesInTwei: " + collectedFeesInTwei.toString())
            let collectedFeesInTokensAfter = collectedFeesInTwei.div(tokenPrecision);
            console.log("collectedFeesInTokensAfter: " + collectedFeesInTokensAfter.toString())
            let collectedFeesInTokensDiff = collectedFeesInTokensAfter.minus(collectedFeesInTokensBefore)
            console.log("collectedFeesInTokensDiff: " + collectedFeesInTokensDiff.toString())
            let expectedCollectedFeesDiff = amountTwei.mul(feePercent / 100).div(tokenPrecision)
            console.log("expectedCollectedFeesDiff: " + expectedCollectedFeesDiff.toString())
            assertAbsDiff(expectedCollectedFeesDiff.toString(), collectedFeesInTokensDiff.toString(), expectedDiffInPct);

            // check amount of extra tokens is at least as collectedFeesIntokens
            // TODO - move to a separate function.
            if (feePercent != 0) {
                let pOfCUrE = pOfE(r, pMin, currentEInEth);
                let rateFor0InPrecision = await liquidityConvRatesInst.getRate(tokenAdd, 0, true, 0);
                let rateFor0 = rateFor0InPrecision.div(precision);
                let curP = rateFor0.valueOf();
                console.log("curP: " + curP);
                expectedTWithoutFees = tForCurPWithoutFees(r, curP)
                console.log("expectedTWithoutFees: " + expectedTWithoutFees.toString());
                expectedFeesAccordingToTheory = currentTInTokensAfter.minus(expectedTWithoutFees);
                console.log("expectedFeesAccordingToTheory: " + expectedFeesAccordingToTheory.toString());
                assertAbsDiff(collectedFeesInTokensAfter.toString(), expectedFeesAccordingToTheory.toString(), expectedDiffInPct);
            }


        };

    });
});
