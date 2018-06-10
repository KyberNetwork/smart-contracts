let LiquidityConversionRates = artifacts.require("./LiquidityConversionRates.sol");
let TestToken = artifacts.require("./mockContracts/TestToken.sol");
let Wrapper = artifacts.require("./mockContracts/Wrapper.sol");
let Reserve = artifacts.require("./KyberReserve");
let SanityRates = artifacts.require("./SanityRates");

let Helper = require("./helper.js");
let BigNumber = require('bignumber.js');

//global variables
//////////////////
//let precisionUnits = (new BigNumber(10).pow(18));
let ethAddress = '0x00eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
//let precision = new BigNumber(10).pow(18);

//balances
let expectedReserveBalanceWei = 0;
let reserveTokenBalance = 0;
let reserveTokenImbalance = 0;

//permission groups
let admin;
let operator;
let alerter;
let network;
let withDrawAddress;

//contracts
let convRatesInst;
let reserveInst;
let sanityRate = 0;

//block data
let priceUpdateBlock;
let currentBlock;
let validRateDurationInBlocks = 1000;

//tokens data
////////////
let numTokens = 1;
let tokens = [];
let tokenAdd = [];

// imbalance data
let minimalRecordResolution = 2; //low resolution so I don't lose too much data. then easier to compare calculated imbalance values.
let maxPerBlockImbalance = 4000;
let maxTotalImbalance = maxPerBlockImbalance * 12;

// all price steps in bps (basic price steps).
// 100 bps means rate change will be: price * (100 + 10000) / 10000 == raise rate in 1%
// higher rate is better for user. will get more dst quantity for his tokens.
// all x values represent token imbalance. y values represent equivalent steps in bps.
// buyImbalance represents coin shortage. higher buy imbalance = more tokens were bought.
// generally. speaking, if imbalance is higher we want to have:
//      - smaller buy bps (negative) to lower rate when buying token with ether.
//      - bigger sell bps to have higher rate when buying ether with token.
////////////////////

//base buy and sell rates (prices)
let baseBuyRate = [];
let baseSellRate = [];

//quantity buy steps
let qtyBuyStepX = [-1400, -700, -150, 0, 150, 350, 700,  1400];
let qtyBuyStepY = [ 1000,   75,   25, 0,  0, -70, -160, -3000];

//imbalance buy steps
let imbalanceBuyStepX = [-8500, -2800, -1500, 0, 1500, 2800,  4500];
let imbalanceBuyStepY = [ 1300,   130,    43, 0,   0, -110, -1600];

//sell
//sell price will be 1 / buy (assuming no spread) so sell is actually buy price in other direction
let qtySellStepX = [-1400, -700, -150, 0, 150, 350, 700, 1400];
let qtySellStepY = [-300,   -80,  -15, 0,   0, 120, 170, 3000];

//sell imbalance step
let imbalanceSellStepX = [-8500, -2800, -1500, 0, 1500, 2800,  4500];
let imbalanceSellStepY = [-1500,  -320,   -75, 0,    0,  110,   650];


//compact data.
let sells = [];
let buys = [];
let indices = [];
let compactBuyArr = [];
let compactSellArr = [];

//////////////////////////////////////////////

const e = new BigNumber("2.7182818284590452353602874713527");
const expectedDiffInPct = new BigNumber(0.4);
const PRECISION = BigNumber(10).pow(18);
const precision_bits = 30;
const precision = BigNumber(2).pow(precision_bits)
const token_decimals = 18
const weiDecimalsPrecision = BigNumber(10).pow(18)
const tokenPrecision = BigNumber(10).pow(token_decimals)
const E = 69.3147180559
const T = 1000000.0 //from Pmax
const r = 0.01
const P0 = 0.00005
const Pmin = 0.5 * P0
const Pmax = 2 * P0
const feePercent = 0.25
const deltaE = 2.7
const deltaT = 120.0
const maxCapBuyInEth = 61
const maxCapSellInEth = 101

const EInFp = BigNumber(E).mul(precision);
const rInFp = BigNumber(r).mul(precision);
const PminInFp = BigNumber(Pmin).mul(precision);
const numFpBits = precision_bits
const deltaEInFp = BigNumber(deltaE).mul(precision);
const deltaTInFp = BigNumber(deltaT).mul(precision);
const maxCapBuyInWei = BigNumber(maxCapBuyInEth).mul(PRECISION);
const maxCapSellInWei = BigNumber(maxCapSellInEth).mul(PRECISION);
const feeInBps = feePercent * 100
const maxBuyRateInPRECISION = (BigNumber(1).div(Pmin)).mul(PRECISION)
const minBuyRateInPRECISION = (BigNumber(1).div(Pmax)).mul(PRECISION)
const maxSellRateInPRECISION = BigNumber(Pmax).mul(PRECISION);
const minSellRateInPRECISION = BigNumber(Pmin).mul(PRECISION);

//////////////////////////////////////////////

function pOfE(r, Pmin, curE) { 
    return Helper.exp(e, BigNumber(r).mul(curE)).mul(Pmin);
}

function buyPriceForZeroQuant(r, Pmin, curE) { 
    pOfERes = pOfE(r, Pmin, curE);
    return BigNumber(1).div(pOfERes);
}

function sellPriceForZeroQuant(r, Pmin, curE) { 
      return pOfE(r, Pmin, curE);
}

function calcDeltaT(r, Pmin, deltaE, curE) {
    let eMinusRDeltaE = Helper.exp(e, BigNumber(-r).mul(deltaE))
    let eMinus1 = eMinusRDeltaE.minus(1)
    let rP = BigNumber(r).mul(pOfE(r, Pmin, curE))
    return eMinus1.div(rP)
}

function calcDeltaE(r, Pmin, deltaT, curE) {
    let rPdeltaT = BigNumber(r).mul(pOfE(r, Pmin, curE)).mul(deltaT)
    let onePlusRPdeltaT = BigNumber(1).plus(rPdeltaT)
    let lnOnePlusrPdeltaT = Helper.ln(onePlusRPdeltaT)
    return lnOnePlusrPdeltaT.mul(-1).div(r)
}

function priceForDeltaE(feePercent, r, Pmin, deltaE, curE) { 
    let deltaT = calcDeltaT(r, Pmin, deltaE, curE).abs();
    let factor = (100-feePercent)/100
    let deltaTAfterReducedFee = deltaT.mul(factor.toString())
    return BigNumber(deltaTAfterReducedFee).div(deltaE);
}

function priceForDeltaT(feePercent, r, Pmin, qtyBeforeReduce, curE) {
    let deltaTAfterReducingFee = qtyBeforeReduce * (100 - feePercent) / 100;
    let deltaE = calcDeltaE(r, Pmin, deltaTAfterReducingFee, curE).abs();
    return deltaE.div(qtyBeforeReduce);
}
/////////////////////////////

contract('KyberReserve', function(accounts) {
    it("should init globals. init ConversionRates Inst, token, set liquidity params .", async function () {
        // set account addresses
        admin = accounts[0];
        operator = accounts[1];
        network = accounts[2];
        user1 = accounts[4];
        user2 = accounts[5];
        withDrawAddress = accounts[6];
        sanityRate = accounts[7];
        alerter = accounts[8];

        currentBlock = priceUpdateBlock = await Helper.getCurrentBlock();

        token = await TestToken.new("test", "tst", 18);
        tokenAdd = token.address;

        liquidityConvRatesInst = await LiquidityConversionRates.new(admin, token.address);

        await liquidityConvRatesInst.setLiquidityParams(rInFp, PminInFp, numFpBits, maxCapBuyInWei, maxCapSellInWei, feeInBps, maxBuyRateInPRECISION, minBuyRateInPRECISION, maxSellRateInPRECISION, minSellRateInPRECISION) 
    });


    it("should init reserve and set all reserve data including balances", async function () {
        reserveInst = await Reserve.new(network, liquidityConvRatesInst.address, admin);
        await reserveInst.setContracts(network, liquidityConvRatesInst.address, 0);

        await reserveInst.addOperator(operator);
        await reserveInst.addAlerter(alerter);
        await liquidityConvRatesInst.setReserveAddress(reserveInst.address);

        //set reserve balance. 10000 wei ether + per token 1000 wei ether value according to base price.
        let reserveEtherInit = (BigNumber(10).pow(18)).mul(E);
        await Helper.sendEtherWithPromise(accounts[9], reserveInst.address, reserveEtherInit);
        
        let balance = await Helper.getBalancePromise(reserveInst.address);
        expectedReserveBalanceWei = balance.valueOf();

        assert.equal(balance.valueOf(), reserveEtherInit, "wrong ether balance");

        //transfer tokens to reserve.
        let amount = (BigNumber(10).pow(token_decimals)).mul(T);
        await token.transfer(reserveInst.address, amount.valueOf());
        balance = await token.balanceOf(reserveInst.address);
        assert.equal(amount.valueOf(), balance.valueOf());

        reserveTokenBalance = amount;
        reserveTokenImbalance = 0;
    });

    it("should test getConversionRate of buy rate for zero quantity.", async function () {
        expectedResult = buyPriceForZeroQuant(r, Pmin, E).mul(PRECISION).valueOf()
        amountWei = 0
        result = await reserveInst.getConversionRate(ethAddress, token.address, amountWei, currentBlock);

        assert(Helper.checkAbsDiff(expectedResult,result,expectedDiffInPct),
               "exp result diff is " + Helper.absDiff(expectedResult,result).toString(10));
    });

    it("should test getConversionRate of sell rate for zero quantity.", async function () {
        expectedResult = sellPriceForZeroQuant(r, Pmin, E).mul(PRECISION).valueOf()
        //result =  await liqConvRatesInst.sellRateZeroQuantity(EInFp);
        amountWei = 0;
        result = await reserveInst.getConversionRate(token.address, ethAddress, amountWei, currentBlock);

        assert(Helper.checkAbsDiff(expectedResult,result,expectedDiffInPct),
               "exp result diff is " + Helper.absDiff(expectedResult,result).toString(10));
    });

    it("should test getConversionRate of buy rate for non zero quantity.", async function () {
        expectedResult = priceForDeltaE(feePercent, r, Pmin, deltaE, E).mul(PRECISION).valueOf()
        amountWei = BigNumber(10).pow(18).mul(deltaE)
        result = await reserveInst.getConversionRate(ethAddress, token.address, amountWei, currentBlock);

        assert(Helper.checkAbsDiff(expectedResult,result,expectedDiffInPct),
               "exp result diff is " + Helper.absDiff(expectedResult,result).toString(10) +
               " actual result diff in percents is " + Helper.absDiffInPercent(expectedResult,result).toString(10));
    });

    it("should test getConversionRate of sell rate for non zero quantity.", async function () {
        expectedResult = priceForDeltaT(feePercent, r, Pmin, deltaT, E).mul(PRECISION).valueOf()
        amountWei = BigNumber(10).pow(token_decimals).mul(deltaT)
        result = await reserveInst.getConversionRate(token.address, ethAddress, amountWei, currentBlock);

        assert(Helper.checkAbsDiff(expectedResult,result,expectedDiffInPct),
               "exp result diff is " + Helper.absDiff(expectedResult,result).toString(10) +
               " actual result diff in percents is " + Helper.absDiffInPercent(expectedResult,result).toString(10));
    });

    it("should perform a series of buys and check: correct balances change, rate is expected rate.", async function () {
        let prevBuyRate = 0; 
        while (true) {
            // get current E and T
            currentEInWei = await Helper.getBalancePromise(reserveInst.address);
            currentEInEth = currentEInWei.div(weiDecimalsPrecision)
            currentTInTwei = await token.balanceOf(reserveInst.address);
            currentTInTokens = currentTInTwei.div(tokenPrecision)
            currentUserTokenTweiBalance = await token.balanceOf(user1);

            //console.log("***********" + currentEInEth.toString())
            //console.log("currentEInEth: " + currentEInEth.toString())
            //console.log("currentTInTokens: " + currentTInTokens.toString())

            // choose amount to trade
            if (prevBuyRate == 0) {
                amountEth = 50.0;
            }
            else {
                amountEth = 2.0;
            }
            amountWei = BigNumber(amountEth).mul(weiDecimalsPrecision);

            // get expected and actual rate
            expectedRate = priceForDeltaE(feePercent, r, Pmin, amountEth, currentEInEth).mul(PRECISION)
            expectedDestQty = calcDeltaT(r, Pmin, amountEth, currentEInEth)
            buyRate = await reserveInst.getConversionRate(ethAddress, token.address, amountWei, currentBlock);

            //console.log("buyRate: " + buyRate.toString())
            expectedDestQty = calcDeltaT(r, Pmin, amountEth, currentEInEth)
            //console.log("expectedDestQty: " + expectedDestQty.toString())

            // expect to eventually get 0 rate when tokens are depleted or rate went lower than min buy rate. 
            if (buyRate == 0 || buyRate == 222 || buyRate == 333) {
                assert((expectedDestQty < currentTInTokens) || (BigNumber(expectedRate).lt(minBuyRateInPRECISION)),
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
            assert(Helper.checkAbsDiff(buyRate, expectedRate, expectedDiffInPct),
                    "exp result diff is " + Helper.absDiff(expectedResult,result).toString(10));

            //perform trade
            await reserveInst.trade(ethAddress, amountWei, token.address, user1, buyRate, true, {from:network, value:amountWei});

            // check reserve eth balance after the trade (got more eth) is as expected.
            expectedReserveBalanceWei = currentEInWei.add(amountWei);
            let balance = await Helper.getBalancePromise(reserveInst.address);
            assert.equal(balance.valueOf(), expectedReserveBalanceWei.valueOf(), "bad reserve balance wei");

            //check token balance on user1 after the trade (got more tokens) is as expected. 
            tokenTweiBalance = await token.balanceOf(user1);
            tradeExpectedTweiAmount = expectedRate.mul(amountWei).div(PRECISION)
            expectedTweiAmount = currentUserTokenTweiBalance.plus(tradeExpectedTweiAmount);
            assert(Helper.checkAbsDiff(tokenTweiBalance, expectedTweiAmount, expectedDiffInPct),
                    "exp result diff is " + Helper.absDiff(expectedResult,result).toString(10));

            //check reserve token balance after the trade (lost some tokens) is as expected.
            tradeActualTweiAmount = buyRate.mul(amountWei).div(PRECISION)
            reserveTokenBalance = reserveTokenBalance.minus(tradeActualTweiAmount);
            reserveTokenImbalance += (tradeActualTweiAmount * 1); //imbalance represents how many missing tokens
            reportedBalance = await token.balanceOf(reserveInst.address);
            assert(Helper.checkAbsDiff(reportedBalance.toString(), reserveTokenBalance.toString(), expectedDiffInPct),
                    "exp result diff is " + Helper.absDiff(expectedResult,result).toString(10));
        };

        // calculate amount of taxes
        //tokenTweiBalance = await token.balanceOf(user1);
        reportedBalance = await token.balanceOf(reserveInst.address);
        collectedFeesInTwei = await liquidityConvRatesInst.collectedFeesInTwei()
        console.log("reportedBalance: " + reportedBalance.toString());
        console.log("collectedFeesInTwei: " + collectedFeesInTwei.toString());
    });

    it("should perform a series of sells and check: correct balances change, rate is expected rate.", async function () {
        let prevSellRate = 0;

        //no need to transfer initial balance to user
        //in the full scenario. user approves network which collects the tokens and approves reserve
        //which collects tokens from network.
        //so here transfer tokens to network and approve allowance from network to reserve.
        Tx4InTwei = BigNumber(T).mul(4).mul(tokenPrecision)
        await token.transfer(network, Tx4InTwei);

        while (true) {
            // get current E and T
            currentEInWei = await Helper.getBalancePromise(reserveInst.address);
            currentEInEth = currentEInWei.div(weiDecimalsPrecision)
            currentTInTwei = await token.balanceOf(reserveInst.address);
            currentTInTokens = currentTInTwei.div(tokenPrecision)
            currentNetworkTokenTweiBalance = await token.balanceOf(network);

            //console.log("***********")
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
            //amountWei = BigNumber(amountEth).mul(weiDecimalsPrecision);

            // get expected and actual rate
            //priceForDeltaT(r, Pmin, deltaT, curE)
            expectedRate = priceForDeltaT(feePercent, r, Pmin, amountTokens, currentEInEth).mul(PRECISION).valueOf();
            expectedDestQty = calcDeltaE(r, Pmin, amountTokensAfterFees, currentEInEth) ;
            sellRate = await reserveInst.getConversionRate(token.address, ethAddress, amountTwei, currentBlock);
            //buyRate = await reserveInst.getConversionRate(ethAddress, token.address, amountWei, currentBlock);

            //rateFor0 = await liquidityConvRatesInst.getRate(tokenAdd, 0, false, 0)
            //console.log("rateFor0: " + rateFor0.toString());

            //console.log("expectedRate: " + expectedRate.toString());
            //console.log("sellRate: " + sellRate.toString());
            //console.log("expectedDestQty: " + expectedDestQty.toString());
            // expect to eventually get 0 rate when tokens are depleted or rate went lower than min buy rate. 
            if ((sellRate == 0 || sellRate == 222 || sellRate == 333)) {
                assert((expectedDestQty < currentEInEth) || (BigNumber(expectedRate).lt(maxSellRateInPRECISION)),
                       "got 0 rate without justification ")
                break;
            }

            assert(Helper.checkAbsDiff(sellRate, expectedRate, expectedDiffInPct),
                    "exp result diff is " + Helper.absDiff(expectedResult,result).toString(10));

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
            tradeExpectedWeiAmount = BigNumber(expectedDestQty).mul(PRECISION).abs()
            console.log("tradeExpectedWeiAmount: " + tradeExpectedWeiAmount.toString())
            expectedReserveBalanceWei = currentEInWei.minus(tradeExpectedWeiAmount);
            console.log("expectedReserveBalanceWei: " + expectedReserveBalanceWei.toString())
            let balance = await Helper.getBalancePromise(reserveInst.address);
            //assert.equal(balance.valueOf(), expectedReserveBalanceWei.valueOf(), "bad reserve balance wei");
            assert(Helper.checkAbsDiff(balance, expectedReserveBalanceWei, expectedDiffInPct),
                    "exp result diff is " + Helper.absDiff(expectedResult,result).toString(10));


            //check token balance on network after the trade (lost some tokens) is as expected. 
            tokenTweiBalance = await token.balanceOf(network);
            tradeExpectedTweiAmount = amountTwei;
            expectedTweiAmount = currentNetworkTokenTweiBalance.minus(tradeExpectedTweiAmount);
            console.log("tradeExpectedTweiAmount: " + tradeExpectedTweiAmount.toString())
            console.log("expectedTweiAmount: " + expectedTweiAmount.toString())
            console.log("tokenTweiBalance: " + tokenTweiBalance.toString())
            assert(Helper.checkAbsDiff(tokenTweiBalance, expectedTweiAmount, expectedDiffInPct),
                    "exp result diff is " + Helper.absDiff(expectedResult,result).toString(10));


            //check reserve token balance after the trade (got some tokens) is as expected.
            tradeActualTweiAmount = amountTwei //sellRate.mul(amountWei).div(PRECISION)
            console.log("reserveTokenBalance: " + reserveTokenBalance.toString())
            console.log("tradeActualTweiAmount: " + tradeActualTweiAmount.toString())
            reserveTokenBalance = reserveTokenBalance.plus(tradeActualTweiAmount);
            console.log("reserveTokenBalance: " + reserveTokenBalance.toString())
            //reserveTokenImbalance -= (tradeActualTweiAmount * 1); //imbalance represents how many missing tokens
            reportedBalance = await token.balanceOf(reserveInst.address);
            assert(Helper.checkAbsDiff(reportedBalance.toString(), reserveTokenBalance.toString(), expectedDiffInPct),
                    "exp result diff is " + Helper.absDiff(expectedResult,result).toString(10));

        };

        // calculate amount of taxes
        //tokenTweiBalance = await token.balanceOf(user1);
        //reportedBalance = await token.balanceOf(reserveInst.address);
        collectedFeesInTwei = await liquidityConvRatesInst.collectedFeesInTwei()
        //console.log("reportedBalance: " + reportedBalance.toString());
        console.log("collectedFeesInTwei: " + collectedFeesInTwei.toString());
        console.log("minSellRateInPRECISION: " + minSellRateInPRECISION.toString())

    });

    
    return;
    it("should perform small sell and check: balances changed, rate is expected rate.", async function () {
        let tokenInd = 3;
        let token = tokens[tokenInd]; //choose some token
        let amountTwei = 25 * 1;

        //no need to transfer initial balance to user
        //in the full scenario. user approves network which collects the tokens and approves reserve
        //which collects tokens from network.
        //so here transfer tokens to network and approve allowance from network to reserve.
        await token.transfer(network, amountTwei);

        //verify sell rate
        let sellRate = await reserveInst.getConversionRate(tokenAdd[tokenInd], ethAddress, amountTwei, currentBlock);

        let expectedRate = (new BigNumber(baseSellRate[tokenInd]));
        let extraBps = getExtraBpsForSellQuantity(amountTwei);
        expectedRate = addBps(expectedRate, extraBps);
        expectedRate.floor();

        //check correct rate calculated
        assert.equal(sellRate.valueOf(), expectedRate.valueOf(), "unexpected rate.");

        //pre trade step, approve allowance from user to network.
        await token.approve(reserveInst.address, amountTwei, {from: network});

        //perform trade
        await reserveInst.trade(tokenAdd[tokenInd], amountTwei, ethAddress, user2, sellRate, true, {from:network});

        //check lower ether balance on reserve
        let amountWei = (new BigNumber(amountTwei).mul(expectedRate)).div(precisionUnits).floor();
        expectedReserveBalanceWei = (new BigNumber(expectedReserveBalanceWei)).sub(amountWei).floor();
        let balance = await Helper.getBalancePromise(reserveInst.address);
        assert.equal(balance.valueOf(), expectedReserveBalanceWei.valueOf(), "bad reserve balance wei");

        //check token balances
        ///////////////////////

        //check token balance on network zeroed
        let tokenTweiBalance = await token.balanceOf(network);

        assert.equal(tokenTweiBalance.valueOf(), 0, "bad token balance");

        //check token balance on reserve was updated (higher)
        //below is true since all tokens and ether have same decimals (18)
        reserveTokenBalance[tokenInd] += (amountTwei * 1);
        reserveTokenImbalance[tokenInd] -= (amountTwei * 1); //imbalance represents how many missing tokens
        let reportedBalance = await token.balanceOf(reserveInst.address);
        assert.equal(reportedBalance.valueOf(), reserveTokenBalance[tokenInd].valueOf(), "bad token balance on reserve");
    });

    it("should verify trade success when validation disabled.", async function () {
        let tokenInd = 3;
        let token = tokens[tokenInd]; //choose some token
        let amountTwei = 25 * 1;


        //no need to transfer initial balance to user
        //in the full scenario. user approves network which collects the tokens and approves reserve
        //which collects tokens from network.
        //so here transfer tokens to network and approve allowance from network to reserve.
        await token.transfer(network, amountTwei);

        //pre trade step, approve allowance from user to network.
        await token.approve(reserveInst.address, amountTwei, {from: network});

        //sell rate
        let sellRate = await reserveInst.getConversionRate(tokenAdd[tokenInd], ethAddress, amountTwei, currentBlock);

        //perform trade
        await reserveInst.trade(tokenAdd[tokenInd], amountTwei, ethAddress, user2, sellRate, false, {from:network});

        //check lower ether balance on reserve
        let amountWei = (new BigNumber(amountTwei).mul(sellRate)).div(precisionUnits).floor();
        expectedReserveBalanceWei = (new BigNumber(expectedReserveBalanceWei)).sub(amountWei).floor();
        let balance = await Helper.getBalancePromise(reserveInst.address);
        assert.equal(balance.valueOf(), expectedReserveBalanceWei.valueOf(), "bad reserve balance wei");

        //check token balances
        ///////////////////////

        //check token balance on network zeroed
        let tokenTweiBalance = await token.balanceOf(network);

        assert.equal(tokenTweiBalance.valueOf(), 0, "bad token balance");

        //check token balance on reserve was updated (higher)
        //below is true since all tokens and ether have same decimals (18)
        reserveTokenBalance[tokenInd] += (amountTwei * 1);
        reserveTokenImbalance[tokenInd] -= (amountTwei * 1); //imbalance represents how many missing tokens
        let reportedBalance = await token.balanceOf(reserveInst.address);
        assert.equal(reportedBalance.valueOf(), reserveTokenBalance[tokenInd].valueOf(), "bad token balance on reserve");
    });


    it("should perform a few sells with steps. check: balances changed, rate is expected rate.", async function () {
        let tokenInd = 3;
        let token = tokens[tokenInd]; //choose some token

        //no need to transfer initial balance to user
        //in the full scenario. user approves network which collects the tokens and approves reserve
        //which collects tokens from network.
        //so here transfer tokens to network and approve allowance from network to reserve.
        for (let i = 0; i < 17; ++i)
        {
            let amountTwei = (i + 1) * 31;

            await token.transfer(network, amountTwei);

            //verify sell rate
            let sellRate = await reserveInst.getConversionRate(tokenAdd[tokenInd], ethAddress, amountTwei, currentBlock);

            let expectedRate = (new BigNumber(baseSellRate[tokenInd])).floor();
            let extraBps = getExtraBpsForSellQuantity(amountTwei);
            expectedRate = addBps(expectedRate, extraBps);
            extraBps = getExtraBpsForImbalanceSellQuantity((reserveTokenImbalance[tokenInd] - (amountTwei * 1)));
            expectedRate = addBps(expectedRate, extraBps);
            expectedRate = expectedRate.floor();

            //check correct rate calculated
            assert.equal(sellRate.valueOf(), expectedRate.valueOf(), "unexpected rate.");

            //pre trade step, approve allowance from network to reserve (on reserve test we skip step where user sends to netwok)
            await token.approve(reserveInst.address, amountTwei, {from: network});

            //perform trade
            await reserveInst.trade(tokenAdd[tokenInd], amountTwei, ethAddress, user2, sellRate, true, {from:network});

            //check lower ether balance on reserve
            let amountWei = (new BigNumber(amountTwei).mul(expectedRate)).div(precisionUnits).floor();
            expectedReserveBalanceWei = (new BigNumber(expectedReserveBalanceWei)).sub(amountWei).floor();
            let balance = await Helper.getBalancePromise(reserveInst.address);
            assert.equal(balance.valueOf(), expectedReserveBalanceWei.valueOf(), "bad reserve balance wei");

            //check token balances
            ///////////////////////

            //check token balance on network zeroed
            let tokenTweiBalance = await token.balanceOf(network);

            assert.equal(tokenTweiBalance.valueOf(), 0, "bad token balance network");

            //check token balance on reserve was updated (higher)
            //below is true since all tokens and ether have same decimals (18)
            reserveTokenBalance[tokenInd] += (amountTwei * 1);
            reserveTokenImbalance[tokenInd] -= (amountTwei * 1); //imbalance represents how many missing tokens
            let reportedBalance = await token.balanceOf(reserveInst.address);
            assert.equal(reportedBalance.valueOf(), reserveTokenBalance[tokenInd].valueOf(), "bad token balance on reserve");
        }
    });

    it("should test sell trade reverted without token approved.", async function () {
        let tokenInd = 2;
        let token = tokens[tokenInd]; //choose some token
        let amount = 300 * 1;

        let sellRate = await reserveInst.getConversionRate(tokenAdd[tokenInd], ethAddress, amount, currentBlock);

        await token.transfer(network, amount);

        //
        try {
            await reserveInst.trade(tokenAdd[tokenInd], amount, ethAddress, user2, sellRate, true, {from:network});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //now see success with approve
        await token.approve(reserveInst.address, amount, {from: network});
        await reserveInst.trade(tokenAdd[tokenInd], amount, ethAddress, user2, sellRate, true, {from:network});
    });

    it("should test trade reverted when trade disabled .", async function () {
        let tokenInd = 2;
        let token = tokens[tokenInd]; //choose some token
        let amount = 300 * 1;

        let sellRate = await reserveInst.getConversionRate(tokenAdd[tokenInd], ethAddress, amount, currentBlock);

        await token.transfer(network, amount);
        await token.approve(reserveInst.address, amount, {from: network});

        await reserveInst.disableTrade({from:alerter});
        //
        try {
            await reserveInst.trade(tokenAdd[tokenInd], amount, ethAddress, user2, sellRate, true, {from:network});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        await reserveInst.enableTrade({from:admin});
        //now see success on same trade when enabled
        await reserveInst.trade(tokenAdd[tokenInd], amount, ethAddress, user2, sellRate, true, {from:network});
    });

    it("should test trade reverted when conversion rate 0.", async function () {
        let tokenInd = 2;
        let token = tokens[tokenInd]; //choose some token
        let amount = 300 * 1;

        let sellRate = await reserveInst.getConversionRate(tokenAdd[tokenInd], ethAddress, amount, currentBlock);

        await token.transfer(network, amount);
        await token.approve(reserveInst.address, amount, {from: network});

        //
        try {
            await reserveInst.trade(tokenAdd[tokenInd], amount, ethAddress, user2, 0, true, {from:network});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        await reserveInst.trade(tokenAdd[tokenInd], amount, ethAddress, user2, sellRate, true, {from:network});
    });

    it("should test trade reverted when dest amount is 0.", async function () {
        let tokenInd = 1;
        let token = tokens[tokenInd]; //choose some token
        let amountLow = 1 * 1;
        let amountHigh = 300 * 1;

        let sellRate = await reserveInst.getConversionRate(tokenAdd[tokenInd], ethAddress, amountLow, currentBlock);

        await token.transfer(network, (amountLow*1 + amountHigh*1));
        await token.approve(reserveInst.address, (amountLow*1 + amountHigh*1), {from: network});

        //
        try {
            await reserveInst.trade(tokenAdd[tokenInd], amountLow, ethAddress, user2, sellRate, true, {from:network});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        await reserveInst.trade(tokenAdd[tokenInd], amountHigh, ethAddress, user2, sellRate, true, {from:network});
        reserveTokenBalance[tokenInd] = reserveTokenBalance[tokenInd]*1 + amountHigh*1;
        reserveTokenImbalance[tokenInd] = reserveTokenImbalance[tokenInd]*1 - amountHigh*1;
    });

    it("should test buy trade reverted when not sending correct ether value.", async function () {
        let tokenInd = 4;
        let token = tokens[tokenInd]; //choose some token
        let amount = 3;

        let rate = await reserveInst.getConversionRate(ethAddress, tokenAdd[tokenInd], amount, currentBlock);

       //test trade reverted when sending wrong ether value
        try {
            await reserveInst.trade(ethAddress, amount, tokenAdd[tokenInd], user2, rate, true, {from:network, value:1});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //see it works when sending correct value
        await reserveInst.trade(ethAddress, amount, tokenAdd[tokenInd], user2, rate, true, {from:network, value:amount});
    });

    it("should test trade reverted when not sent from network.", async function () {
        let tokenInd = 4;
        let token = tokens[tokenInd]; //choose some token
        let amount = 3;
        let rate = await reserveInst.getConversionRate(ethAddress, tokenAdd[tokenInd], amount, currentBlock);

       //test trade reverted when sending wrong ether value
        try {
            await reserveInst.trade(ethAddress, amount, tokenAdd[tokenInd], user2, rate, true, {from:operator, value:amount});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //see same trade works when sending correct value
        await reserveInst.trade(ethAddress, amount, tokenAdd[tokenInd], user2, rate, true, {from:network, value:amount});
    });

    it("should test trade reverted when sending ether value with sell trade.", async function () {
       let tokenInd = 1;
       let token = tokens[tokenInd]; //choose some token
       let amount = 300 * 1;

       let sellRate = await reserveInst.getConversionRate(tokenAdd[tokenInd], ethAddress, amount, currentBlock);

       await token.transfer(network, amount);
       await token.approve(reserveInst.address, amount, {from: network});

       //
       try {
           await reserveInst.trade(tokenAdd[tokenInd], amount, ethAddress, user2, sellRate, true, {from:network, value:3});
           assert(false, "throw was expected in line above.")
       } catch(e){
           assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
       }

       await reserveInst.trade(tokenAdd[tokenInd], amount, ethAddress, user2, sellRate, true, {from:network, value: 0});
       reserveTokenBalance[tokenInd] = reserveTokenBalance[tokenInd]*1 + amount*1;
       reserveTokenImbalance[tokenInd] = reserveTokenImbalance[tokenInd]*1 - amount*1;
    });

    it("should test reverted scenario for set contracts call.", async function () {
        //legal call
        await reserveInst.setContracts(network, convRatesInst.address, 0, {from:admin});

        try {
            await reserveInst.setContracts(0, convRatesInst.address, 0, {from:admin});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await reserveInst.setContracts(network, 0, 0, {from:admin});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("should test get src qty when dst qty is very small and source is near 0.", async function () {
        //legal call
        let token3Dec = await TestToken.new("test", "tst", 3);
        let dstQty = 200;
        let rate = precisionUnits / 2;

        //make sure src qty rounded up.
        let getSrcQTY = await reserveInst.getSrcQty(token3Dec.address, ethAddress, dstQty, rate);
        let calcSrcQty = (new BigNumber(10)).pow(3 - 18).mul(precisionUnits).mul(dstQty).div(rate).ceil();
        assert.equal(calcSrcQty.valueOf(), getSrcQTY.valueOf(), "bad src qty");

        getSrcQTY = await reserveInst.getSrcQty(ethAddress, token3Dec.address, dstQty, rate);
        calcSrcQty = (precisionUnits / rate ) * dstQty / ((10 ** (3 - 18)));;
        assert.equal(calcSrcQty.valueOf(), getSrcQTY.valueOf(), "bad src qty");

    });

    it("should test get src qty reverted when decimals diff > max decimals diff (18).", async function () {
        //max decimal diff is defined in contract Utils.sol MAX_DECIMALS
        let token3Dec = await TestToken.new("test", "tst", 3);
        let token30Dec = await TestToken.new("test", "tst", 30);
        let dstQty = 300;
        let rate = precisionUnits / 2;

        //first get src qty when decimal diff is legal
        getSrcQTY = await reserveInst.getSrcQty(ethAddress, token3Dec.address, dstQty, rate);
        calcSrcQty = (precisionUnits / rate ) * dstQty / ((10 ** (3 - 18)));;
        assert.equal(calcSrcQty.valueOf(), getSrcQTY.valueOf(), "bad src qty");

        getSrcQTY = await reserveInst.getSrcQty(ethAddress, token3Dec.address, dstQty, rate);
        calcSrcQty = (precisionUnits / rate ) * dstQty / ((10 ** (3 - 18)));;
        assert.equal(calcSrcQty.valueOf(), getSrcQTY.valueOf(), "bad src qty");

        //see reverted when qty decimal diff > max decimal diff
        try {
           getSrcQTY = await reserveInst.getSrcQty(token30Dec.address, token3Dec.address, dstQty, rate);
           assert(false, "throw was expected in line above.")
        } catch(e){
           assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //see reverted when qty diff > max diff
        try {
           getSrcQTY = await reserveInst.getSrcQty(token3Dec.address, token30Dec.address, dstQty, rate);
           assert(false, "throw was expected in line above.")
        } catch(e){
           assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("should approve withdraw address and withdraw. token and ether", async function () {
        let tokenInd = 1;
        let amount = 10;
        let token = tokens[tokenInd];

        // first token
        await reserveInst.approveWithdrawAddress(tokenAdd[tokenInd], withDrawAddress, true);
        await reserveInst.withdraw(tokenAdd[tokenInd], amount, withDrawAddress, {from: operator});

        reserveTokenBalance[tokenInd] -= amount;
        let reportedBalance = await token.balanceOf(reserveInst.address);
        assert.equal(reportedBalance.valueOf(), reserveTokenBalance[tokenInd].valueOf(), "bad token balance on reserve");

        reportedBalance = await token.balanceOf(withDrawAddress);
        assert.equal(reportedBalance.valueOf(), amount, "bad token balance on withdraw address");

        expectedReserveBalanceWei = await Helper.getBalancePromise(reserveInst.address);

        //ether
        await reserveInst.approveWithdrawAddress(ethAddress, withDrawAddress, true);
        await reserveInst.withdraw(ethAddress, amount, withDrawAddress, {from: operator});

        expectedReserveBalanceWei -= amount;
        reportedBalance = await Helper.getBalancePromise(reserveInst.address);
        assert.equal(reportedBalance.valueOf(), expectedReserveBalanceWei, "bad eth balance on reserve");
    });

    it ("should test reverted scenarios for withdraw", async function() {
        let tokenInd = 1;
        let amount = 10;

        //make sure withdraw reverted from non operator
        try {
            await reserveInst.withdraw(tokenAdd[tokenInd], amount, withDrawAddress);
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //make sure withdraw reverted to non approved token
        try {
            await reserveInst.withdraw(tokenAdd[tokenInd - 1], amount, withDrawAddress, {from: operator});
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //make sure withdraw reverted to non approved address
        try {
            await reserveInst.withdraw(tokenAdd[tokenInd], amount, accounts[9], {from: operator});
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it ("should test get dest qty", async function() {
        let srcQty = 100;
        let rate = precision.div(2); //1 to 2. in precision units

        let srcDecimal = 10;
        let dstDecimal = 13;

        let tokenA = await TestToken.new("source", "src", srcDecimal);
        let tokenB = await TestToken.new("dest", "dst", dstDecimal);

        //get dest QTY
        let expectedDestQty = (srcQty * rate / precision) * (10 ** (dstDecimal - srcDecimal));

        let reportedDstQty = await reserveInst.getDestQty(tokenA.address, tokenB.address, srcQty, rate);

        assert.equal(expectedDestQty.valueOf(), reportedDstQty.valueOf(), "unexpected dst qty");
    });

    it ("should test get src qty", async function() {
        let rate = precision.div(2); //1 to 2. in precision units

        let srcDecimal = 10;
        let dstDecimal = 13;

        let tokenA = await TestToken.new("source", "src", srcDecimal);
        let tokenB = await TestToken.new("dest", "dst", dstDecimal);

        //get src qty
        let dstQty = 100000;
        let expectedSrcQty = (((precision / rate)* dstQty * (10**(srcDecimal - dstDecimal))));

        let reportedSrcQty = await reserveInst.getSrcQty(tokenA.address, tokenB.address, dstQty, rate);

        assert.equal(expectedSrcQty.valueOf(), reportedSrcQty.valueOf(), "unexpected dst qty");
    });

    it ("should test get conversion rate options", async function() {
        let tokenInd = 3;
        let amountTwei = 3;

        //test normal case.
        let sellRate = await reserveInst.getConversionRate(tokenAdd[tokenInd], ethAddress, amountTwei, currentBlock);

        let expectedRate = (new BigNumber(baseSellRate[tokenInd])).floor();
        let extraBps = getExtraBpsForSellQuantity(amountTwei);
        expectedRate = addBps(expectedRate, extraBps);
        extraBps = getExtraBpsForImbalanceSellQuantity((reserveTokenImbalance[tokenInd] - (amountTwei * 1)));
        expectedRate = addBps(expectedRate, extraBps);
        expectedRate = expectedRate.floor();

        //check correct rate calculated
        assert.equal(sellRate.valueOf(), expectedRate.valueOf(), "unexpected rate.");

        //disable trade and test
        await reserveInst.disableTrade({from: alerter})
        sellRate = await reserveInst.getConversionRate(tokenAdd[tokenInd], ethAddress, amountTwei, currentBlock);
        assert.equal(0, sellRate.valueOf(), "rate not 0");
        await reserveInst.enableTrade({from:admin});

        //try token to token
        sellRate = await reserveInst.getConversionRate(tokenAdd[tokenInd], tokenAdd[2], amountTwei, currentBlock);
        assert.equal(0, sellRate.valueOf(), "rate not 0");

        //test normal case.
        sellRate = await reserveInst.getConversionRate(tokenAdd[tokenInd], ethAddress, amountTwei, currentBlock);

        //check correct rate calculated
        assert.equal(sellRate.valueOf(), expectedRate.valueOf(), "unexpected rate.");
    });

    it ("should test get conversion rate return 0 when sanity rate is lower the calculated rate", async function() {
        let tokenInd = 1;
        let token = tokens[tokenInd]; //choose some token
        let amount = 30 * 1;

        let sellRate = await reserveInst.getConversionRate(tokenAdd[tokenInd], ethAddress, amount, currentBlock);

        await token.transfer(network, amount);
        await token.approve(reserveInst.address, amount, {from: network});

        //set sanity rate data...
        sanityRate = await SanityRates.new(admin);
        await sanityRate.addOperator(operator);
        let tokens2 = [tokenAdd[tokenInd]];

        //set low rate - that will be smaller then calculated and cause return value 0
        let rates2 = [new BigNumber(sellRate).div(2).floor()];

        await sanityRate.setSanityRates(tokens2, rates2, {from: operator});
        let diffs = [1000];
        await sanityRate.setReasonableDiff(tokens2, diffs, {from: admin});

        await reserveInst.setContracts(network, convRatesInst.address, sanityRate.address, {from:admin});

        let nowRate = await reserveInst.getConversionRate(tokenAdd[tokenInd], ethAddress, amount, currentBlock);

        assert.equal(nowRate.valueOf(), 0, "expected zero rate.");

        //set high sanity rate. that will not fail the calculated rate.
        rates2 = [new BigNumber(sellRate).mul(2).floor()];
        await sanityRate.setSanityRates(tokens2, rates2, {from: operator});
        nowRate = await reserveInst.getConversionRate(tokenAdd[tokenInd], ethAddress, amount, currentBlock);
        assert(nowRate.valueOf() > 0, "expected valid rate.");
        await reserveInst.setContracts(network, convRatesInst.address, 0, {from:admin});
    });

    it("should zero reserve balance and see that get rate returns zero when not enough dest balance", async function() {
        let tokenInd = 1;
        let amountTwei = maxPerBlockImbalance - 1;
        let token = tokens[tokenInd];
        let srcQty = 50; //some high number of figure out ~rate


        let balance = await token.balanceOf(reserveInst.address);
        await reserveInst.approveWithdrawAddress(tokenAdd[tokenInd], withDrawAddress, true);
        await reserveInst.withdraw(tokenAdd[tokenInd], balance, withDrawAddress, {from: operator});

        balance = await token.balanceOf(reserveInst.address);

        assert.equal(balance.valueOf(0), 0, "expected balance 0");

        let rate = await reserveInst.getConversionRate(ethAddress, tokenAdd[tokenInd], srcQty, currentBlock);
        assert.equal(rate.valueOf(), 0, "expected rate 0");
    });

    it("should test can't init this contract with empty contracts (address 0).", async function () {
        let reserve;

        try {
           reserve = await Reserve.new(network, convRatesInst.address, 0);
           assert(false, "throw was expected in line above.")
        } catch(e){
           assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
           reserve =  await Reserve.new(network, 0, admin);
           assert(false, "throw was expected in line above.")
        } catch(e){
           assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
           reserve =  await Reserve.new(0, convRatesInst.address, admin);
           assert(false, "throw was expected in line above.")
        } catch(e){
           assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        reserve = await Reserve.new(network, convRatesInst.address, admin);

        try {
           await reserve.setContracts(0, convRatesInst.address, 0);
           assert(false, "throw was expected in line above.")
        } catch(e){
           assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
           await reserve.setContracts(network, 0, 0);
           assert(false, "throw was expected in line above.")
        } catch(e){
           assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //sanity rates can currently be empty
        await reserve.setContracts(network, convRatesInst.address, 0);
    });
});

function convertRateToPricingRate (baseRate) {
// conversion rate in pricing is in precision units (10 ** 18) so
// rate 1 to 50 is 50 * 10 ** 18
// rate 50 to 1 is 1 / 50 * 10 ** 18 = 10 ** 18 / 50a
    return ((new BigNumber(10).pow(18)).mul(baseRate).floor());
};

function getExtraBpsForBuyQuantity(qty) {
    for (let i = 0; i < qtyBuyStepX.length; i++) {
        if (qty <= qtyBuyStepX[i]) return qtyBuyStepY[i];
    }
    return qtyBuyStepY[qtyBuyStepY.length - 1];
};

function getExtraBpsForSellQuantity(qty) {
    for (let i = 0; i < qtySellStepX.length; i++) {
        if (qty <= qtySellStepX[i]) return qtySellStepY[i];
    }
    return qtySellStepY[qtySellStepY.length - 1];
};

function getExtraBpsForImbalanceBuyQuantity(qty) {
    for (let i = 0; i < imbalanceBuyStepX.length; i++) {
        if (qty <= imbalanceBuyStepX[i]) return imbalanceBuyStepY[i];
    }
    return (imbalanceBuyStepY[imbalanceBuyStepY.length - 1]);
};

function getExtraBpsForImbalanceSellQuantity(qty) {
    for (let i = 0; i < imbalanceSellStepX.length; i++) {
        if (qty <= imbalanceSellStepX[i]) return imbalanceSellStepY[i];
    }
    return (imbalanceSellStepY[imbalanceSellStepY.length - 1]);
};

function addBps (price, bps) {
    return (price.mul(10000 + bps).div(10000));
};

function compareRates (receivedRate, expectedRate) {
    expectedRate = expectedRate - (expectedRate % 10);
    receivedRate = receivedRate - (receivedRate % 10);
    assert.equal(expectedRate, receivedRate, "different prices");
};