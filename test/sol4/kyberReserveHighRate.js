const ConversionRates = artifacts.require("ConversionRates");
const EnhancedStepFunctions = artifacts.require("MockEnhancedStepFunctions");
const TestToken = artifacts.require("TestToken");
const Reserve = artifacts.require("MockKyberReserveHighRate");
const SanityRates = artifacts.require("SanityRates");

const Helper = require("../helper.js");
const BN = web3.utils.BN;

//global variables
//////////////////
const precisionUnits = (new BN(10).pow(new BN(18)));
const ethAddress = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
const zeroAddress = '0x0000000000000000000000000000000000000000';
const precision = new BN(10).pow(new BN(18));
const maxAllowance = new BN(2).pow(new BN(255));
const MAX_RATE =  precisionUnits.mul(new BN(10 ** 7));

//balances
let expectedReserveBalanceWei = new BN(0);
let reserveTokenBalance = [];
let reserveTokenImbalance = [];

let expectedReserveBalanceWei2 = new BN(0);
let reserveTokenBalance2 = [];
let reserveTokenImbalance2 = [];

//permission groups
let admin;
let operator;
let alerter;
let network;
let withDrawAddress;

//contracts
let convRatesInst;
let convRatesInst2;
let reserveInst;
let reserveInst2;
let sanityRate = 0;

//block data
let priceUpdateBlock;
let currentBlock;
let validRateDurationInBlocks = 1000;

//tokens data
////////////
let numTokens = 5;
let tokens = [];
let tokenAdd = [];

// imbalance data
let minimalRecordResolution = new BN(2); //low resolution so I don't lose too much data. then easier to compare calculated imbalance values.
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
let qtyBuyStepX = [0, 150, 350, 700,  1400];
let qtyBuyStepY = [0,  0, -70, -160, -3000];

//imbalance buy steps
let imbalanceBuyStepX = [-8500, -2800, -1500, 0, 1500, 2800,  4500];
let imbalanceBuyStepY = [ 1300,   130,    43, 0,   0, -110, -1600];
let imbalanceBuyStepYNew = [ 1300,   130,    43, 0,   0, -110, -160, -1600];

//sell
//sell price will be 1 / buy (assuming no spread) so sell is actually buy price in other direction
let qtySellStepX = [0, 150, 350, 700, 1400];
let qtySellStepY = [0,   0, 120, 170, 3000];

//sell imbalance step
let imbalanceSellStepX = [-8500, -2800, -1000, 0, 1000, 2800,  4500];
let imbalanceSellStepY = [-1500,  -320,   -75, 0,    0,  110,   650];
let imbalanceSellStepYNew = [-1500,  -320,   -75, 0,    0,  110,   350, 650];


//compact data.
let sells = [];
let buys = [];
let indices = [];
let compactBuyArr = [];
let compactSellArr = [];

contract('KyberReserveHighRate', function(accounts) {
    it("should init globals. init ConversionRates Inst, init tokens and add to pricing inst. set basic data per token.", async function () {
        // set account addresses
        admin = accounts[0];
        operator = accounts[1];
        network = accounts[2];
        user1 = accounts[4];
        user2 = accounts[5];
        withDrawAddress = accounts[6];
        sanityRate = accounts[7];
        alerter = accounts[8];
        walletForToken = accounts[9];
        user3 = accounts[8];
        user4 = accounts[9];

        currentBlock = priceUpdateBlock = await Helper.getCurrentBlock();

//        console.log("current block: " + currentBlock);
        //init contracts
        convRatesInst = await ConversionRates.new(admin);
        convRatesInst2 = await EnhancedStepFunctions.new(admin);

        //set pricing general parameters
        await convRatesInst.setValidRateDurationInBlocks(validRateDurationInBlocks);
        await convRatesInst2.setValidRateDurationInBlocks(validRateDurationInBlocks);

        //create and add token addresses...
        for (let i = 0; i < numTokens; ++i) {
            token = await TestToken.new("test" + i, "tst" + i, 18);
            tokens[i] = token;
            tokenAdd[i] = token.address;
            await convRatesInst.addToken(token.address);
            await convRatesInst.setTokenControlInfo(token.address, minimalRecordResolution, maxPerBlockImbalance, maxTotalImbalance);
            await convRatesInst.enableTokenTrade(token.address);
            await convRatesInst2.addToken(token.address);
            await convRatesInst2.setTokenControlInfo(token.address, minimalRecordResolution, maxPerBlockImbalance, maxTotalImbalance);
            await convRatesInst2.enableTokenTrade(token.address);
        }

        Helper.assertEqual(tokens.length, numTokens, "bad number tokens");

        let result = await convRatesInst.addOperator(operator);
        await convRatesInst.addAlerter(alerter);
        await convRatesInst2.addOperator(operator);
        await convRatesInst2.addAlerter(alerter);
    });

    it("should set base prices + compact data price factor + step function. for all tokens.", async function () {
        //buy is ether to token rate. sale is token to ether rate. so sell == 1 / buy. assuming we have no spread.
        let tokensPerEther;
        let ethersPerToken;

        for (i = 0; i < numTokens; ++i) {
            tokensPerEther = precisionUnits.mul(new BN((i + 1) * 3));
            ethersPerToken = precisionUnits.div(new BN((i + 1) * 3));
            baseBuyRate.push(tokensPerEther);
            baseSellRate.push(ethersPerToken);
        }
        Helper.assertEqual(baseBuyRate.length, tokens.length);
        Helper.assertEqual(baseSellRate.length, tokens.length);

        buys.length = sells.length = indices.length = 0;

        await convRatesInst.setBaseRate(tokenAdd, baseBuyRate, baseSellRate, buys, sells, currentBlock, indices, {from: operator});
        await convRatesInst2.setBaseRate(tokenAdd, baseBuyRate, baseSellRate, buys, sells, currentBlock, indices, {from: operator});

        //set compact data
        compactBuyArr = [0, 0, 0, 0, 0, 06, 07, 08, 09, 1, 0, 11, 12, 13, 14];
        let compactBuyHex = Helper.bytesToHex(compactBuyArr);
        buys.push(compactBuyHex);

        compactSellArr = [0, 0, 0, 0, 0, 26, 27, 28, 29, 30, 31, 32, 33, 34];
        let compactSellHex = Helper.bytesToHex(compactSellArr);
        sells.push(compactSellHex);

        indices[0] = 0;

        Helper.assertEqual(indices.length, sells.length, "bad sells array size");
        Helper.assertEqual(indices.length, buys.length, "bad buys array size");

        await convRatesInst.setCompactData(buys, sells, currentBlock, indices, {from: operator});
        await convRatesInst2.setCompactData(buys, sells, currentBlock, indices, {from: operator});

        //all start with same step functions.
        for (let i = 0; i < numTokens; ++i) {
            await convRatesInst.setQtyStepFunction(tokenAdd[i], qtyBuyStepX, qtyBuyStepY, qtySellStepX, qtySellStepY, {from:operator});
            await convRatesInst.setImbalanceStepFunction(tokenAdd[i], imbalanceBuyStepX, imbalanceBuyStepY, imbalanceSellStepX, imbalanceSellStepY, {from:operator});
            await convRatesInst2.setImbalanceStepFunction(tokenAdd[i], imbalanceBuyStepX, imbalanceBuyStepYNew, imbalanceSellStepX, imbalanceSellStepYNew, {from:operator});
        }
    });

    it("should init reserve and set all reserve data including balances", async function () {
        reserveInst = await Reserve.new(network, convRatesInst.address, admin);
        await reserveInst.setContracts(network, convRatesInst.address, zeroAddress);
        reserveInst2 = await Reserve.new(network, convRatesInst2.address, admin);
        await reserveInst2.setContracts(network, convRatesInst2.address, zeroAddress);

        await reserveInst.addOperator(operator);
        await reserveInst.addAlerter(alerter);
        await convRatesInst.setReserveAddress(reserveInst.address);

        await reserveInst2.addOperator(operator);
        await reserveInst2.addAlerter(alerter);
        await convRatesInst2.setReserveAddress(reserveInst2.address);
        for (let i = 0; i < numTokens; ++i) {
            await reserveInst.approveWithdrawAddress(tokenAdd[i],accounts[0],true);
            await reserveInst2.approveWithdrawAddress(tokenAdd[i],accounts[0],true);
        }

        //set reserve balance. 10000 wei ether + per token 1000 wei ether value according to base price.
        let reserveEtherInit = 5000 * 2;
        await Helper.sendEtherWithPromise(accounts[9], reserveInst.address, reserveEtherInit);
        await Helper.sendEtherWithPromise(accounts[9], reserveInst2.address, reserveEtherInit);

        let balance = await Helper.getBalancePromise(reserveInst.address);
        expectedReserveBalanceWei = balance;

        Helper.assertEqual(balance, reserveEtherInit, "wrong ether balance");

        balance = await Helper.getBalancePromise(reserveInst2.address);
        Helper.assertEqual(balance, reserveEtherInit, "wrong ether balance");
        expectedReserveBalanceWei2 = balance;

        //transfer tokens to reserve. each token same wei balance
        for (let i = 0; i < numTokens; ++i) {
            token = tokens[i];
            let amount = (new BN(reserveEtherInit)).mul(baseBuyRate[i]).div(precisionUnits);
            await token.transfer(reserveInst.address, amount);
            let balance = await token.balanceOf(reserveInst.address);
            Helper.assertEqual(amount, balance);
            await token.transfer(reserveInst2.address, amount);
            balance = await token.balanceOf(reserveInst2.address);
            Helper.assertEqual(amount, balance);

            reserveTokenBalance.push(amount);
            reserveTokenImbalance.push(new BN(0));

            reserveTokenBalance2.push(amount);
            reserveTokenImbalance2.push(new BN(0));
        }
    });

    it("test MAX_RATE as expected for internal calcDstQty, decimals 11, 17", async function() {
        const srcQty = new BN(5000);
        const decimals1 = 11;
        const decimals2 = 17;
        let rate = MAX_RATE;

        const expectedDstQty = Helper.calcDstQty(srcQty, decimals1, decimals2, rate);

        const rxDestQty = await reserveInst.MockCalcDstQty(srcQty, decimals1, decimals2, rate);
        Helper.assertEqual(expectedDstQty, rxDestQty);

        rate = MAX_RATE.add(new BN(1));
        try {
            await reserveInst.MockCalcDstQty(srcQty, decimals1, decimals2, rate);
            assert(false,  "shouldn't reach this line. expected line above to throw.")
        } catch(e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("test MAX_RATE as expected for internal calcSrcQty, decimals 17, 18", async function() {
        const dstQty = new BN(50000000000);
        const decimals1 = 17;
        const decimals2 = 18;

        let rate = MAX_RATE;

        const expectedSrcQty = Helper.calcSrcQty(dstQty, decimals1, decimals2, rate);

        const rxSrcQty = await reserveInst.MockCalcSrcQty(dstQty, decimals1, decimals2, rate);
        Helper.assertEqual(expectedSrcQty, rxSrcQty);

        rate = MAX_RATE.add(new BN(1));
        try {
            await reserveInst.MockCalcSrcQty(dstQty, decimals1, decimals2, rate);
            assert(false,  "shouldn't reach this line. expected line above to throw.")
        } catch(e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("test MAX_RATE as expected for internal calcDstQty, decimals 16, 9", async function() {
        const srcQty = new BN("39458304598");
        const decimals1 = 16;
        const decimals2 = 9;
        let rate = new BN("23049820349820934");

        const expectedDstQty = Helper.calcDstQty(srcQty, decimals1, decimals2, rate);

        const rxDestQty = await reserveInst.MockCalcDstQty(srcQty, decimals1, decimals2, rate);
        Helper.assertEqual(expectedDstQty, rxDestQty);
    });

    it("test internal calcSrcQty, decimals 17, 8", async function() {
        const dstQty = new BN("52304958340");
        const decimals1 = 17;
        const decimals2 = 8;

        let rate = new BN("92873498374594387");

        const expectedSrcQty = Helper.calcSrcQty(dstQty, decimals1, decimals2, rate);

        const rxSrcQty = await reserveInst.MockCalcSrcQty(dstQty, decimals1, decimals2, rate);
        Helper.assertEqual(expectedSrcQty, rxSrcQty);
    });

    it("should perform small buy (no steps) and check: balances changed, rate is expected rate.", async function () {
        let tokenInd = 3;
        let token = tokens[tokenInd]; //choose some token
        let amountWei = new BN(2);

        //verify base rate
        let buyRate = await reserveInst.getConversionRate(ethAddress, tokenAdd[tokenInd], amountWei, currentBlock);
        let expectedRate = baseBuyRate[tokenInd];
        let destQty = amountWei.mul(baseBuyRate[tokenInd]).div(precisionUnits);
        let extraBps = getExtraBpsForBuyQuantity(destQty);
        expectedRate = Helper.addBps(expectedRate, extraBps);
        extraBps = getExtraBpsForImbalanceBuyQuantity(reserveTokenImbalance[tokenInd].add(destQty));
        expectedRate = Helper.addBps(expectedRate, extraBps);

        //check correct rate calculated
        Helper.assertEqual(buyRate, expectedRate, "unexpected rate.");

        //perform trade
        await reserveInst.trade(ethAddress, amountWei, tokenAdd[tokenInd], user1, buyRate, true, {from:network, value:amountWei});

        //check higher ether balance on reserve
        expectedReserveBalanceWei = expectedReserveBalanceWei.add(amountWei);
        let balance = await Helper.getBalancePromise(reserveInst.address);
        Helper.assertEqual(balance, expectedReserveBalanceWei, "bad reserve balance wei");

        //check token balances
        ///////////////////////

        //check token balance on user1
        let tokenTweiBalance = await token.balanceOf(user1);
        let expectedTweiAmount = expectedRate.mul(amountWei).div(precisionUnits);
        Helper.assertEqual(tokenTweiBalance, expectedTweiAmount, "bad token balance");

        //check lower token balance on reserve
        //below is true since all tokens and ether have same decimals (18)
        reserveTokenBalance[tokenInd] = reserveTokenBalance[tokenInd].sub(expectedTweiAmount);
        let recordImbal = expectedTweiAmount.div(minimalRecordResolution).mul(minimalRecordResolution);
        reserveTokenImbalance[tokenInd] = reserveTokenImbalance[tokenInd].add(recordImbal); //imbalance represents how many missing tokens
        let reportedBalance = await token.balanceOf(reserveInst.address);
        Helper.assertEqual(reportedBalance, reserveTokenBalance[tokenInd], "bad token balance on reserve");
    });

    it("should perform a few buys with steps and check: correct balances change, rate is expected rate.", async function () {
        let tokenInd = 2;
        let token = tokens[tokenInd]; //choose some token
        let amountWei;
        let totalWei = new BN(0);
        let totalExpectedTwei = new BN(0);

        for (let i = 0; i < 19; i++) {
            amountWei = new BN((7 * i) + 11 * 1);
            let buyRate = await reserveInst.getConversionRate(ethAddress, tokenAdd[tokenInd], amountWei, currentBlock);

            //verify price/rate against set price
            let expectedRate = new BN(baseBuyRate[tokenInd]);
            //rate update
            let extraBps = compactBuyArr[tokenInd] * 10;
            expectedRate = Helper.addBps(expectedRate, extraBps);
            //first calculate number of destination tokens according to basic rate
//            console.log("expected1" + expectedRate)
            let destQty = amountWei.mul(expectedRate).div(precisionUnits);
            extraBps = getExtraBpsForBuyQuantity(destQty);
            expectedRate = Helper.addBps(expectedRate, extraBps);
//            console.log("expected2" + expectedRate)
            extraBps = getExtraBpsForImbalanceBuyQuantity(reserveTokenImbalance[tokenInd].add(destQty));
            expectedRate = Helper.addBps(expectedRate, extraBps);
//console.log("expected3" + expectedRate)

            //function calculateRateAmount(isBuy, tokenInd, srcQty, maxDestAmount)
//            let expected = calculateRateAmount(true, tokenInd, amountWei)
//            console.log("expected from function" + expected);
            Helper.assertEqual(buyRate, expectedRate, "unexpected rate. loop: " + i);

            let expectedTweiAmount = expectedRate.mul(amountWei).div(precisionUnits);
            totalExpectedTwei = totalExpectedTwei.add(expectedTweiAmount);
            reserveTokenBalance[tokenInd] = reserveTokenBalance[tokenInd].sub(expectedTweiAmount);

            let reportedBalance = await token.balanceOf(reserveInst.address);
            await reserveInst.trade(ethAddress, amountWei, tokenAdd[tokenInd], user1, buyRate, true, {from : network, value:amountWei});
            let recordImbal = expectedTweiAmount.div(minimalRecordResolution).mul(minimalRecordResolution);
            reserveTokenImbalance[tokenInd] = reserveTokenImbalance[tokenInd].add(recordImbal); //imbalance represents how many missing tokens
            totalWei = totalWei.add(amountWei);
            reportedBalance = await token.balanceOf(reserveInst.address);
            Helper.assertEqual(reportedBalance, reserveTokenBalance[tokenInd], "bad token balance on reserve. loop: " + i);
        };

        //check higher ether balance on reserve
        expectedReserveBalanceWei = expectedReserveBalanceWei.add(totalWei);
        let balance = await Helper.getBalancePromise(reserveInst.address);
        Helper.assertEqual(balance, expectedReserveBalanceWei, "bad reserve balance");

        //check lower token balance in reserve
        let reportedBalance = await token.balanceOf(reserveInst.address);
        Helper.assertEqual(reportedBalance, reserveTokenBalance[tokenInd], "bad token balance on reserve");

        //check token balance on user1
        let tokenTweiBalance = await token.balanceOf(user1);
        Helper.assertEqual(tokenTweiBalance, totalExpectedTwei, "bad token balance");
    });

    it("should perform a few buys with steps and check: correct balances change, rate is expected rate. Also tokens are in a wallet", async function () {
        let tokenInd = 1;
        let token = tokens[tokenInd]; //choose some token
        let amountWei;
        let totalWei = new BN(0);
        let totalExpectedTwei = new BN(0);

        // transfer tokens to wallet
        await reserveInst.withdrawToken(token.address,
                                        await token.balanceOf(reserveInst.address),
                                        walletForToken);

        // set allowance
        await token.approve(reserveInst.address,maxAllowance,{from:walletForToken});

        // set wallet address
        await reserveInst.setTokenWallet(token.address,walletForToken);

        for (let i = 0; i < 19; i++) {
            amountWei = new BN((7 * i) + 1);
            let buyRate = await reserveInst.getConversionRate(ethAddress, tokenAdd[tokenInd], amountWei, currentBlock);

            //verify price/rate against set price
            let expectedRate = baseBuyRate[tokenInd];
            //first calculate number of destination tokens according to basic rate
            let destQty = amountWei.mul(expectedRate).div(precisionUnits);
            let extraBps = getExtraBpsForBuyQuantity(destQty);
            expectedRate = Helper.addBps(expectedRate, extraBps);
            extraBps = getExtraBpsForImbalanceBuyQuantity(reserveTokenImbalance[tokenInd].add(destQty));
            expectedRate = Helper.addBps(expectedRate, extraBps);

            Helper.assertEqual(buyRate, expectedRate, "unexpected rate.");

            let expectedTweiAmount = expectedRate.mul(amountWei).div(precisionUnits);
            totalExpectedTwei = totalExpectedTwei.add(expectedTweiAmount);
            reserveTokenBalance[tokenInd] = reserveTokenBalance[tokenInd].sub(expectedTweiAmount);

            await reserveInst.trade(ethAddress, amountWei, tokenAdd[tokenInd], user1, buyRate, true, {from : network, value:amountWei});
            totalWei = totalWei.add(amountWei);
            let recordImbal = expectedTweiAmount.div(minimalRecordResolution).mul(minimalRecordResolution);
            reserveTokenImbalance[tokenInd] = reserveTokenImbalance[tokenInd].add(recordImbal)
        };

        //check higher ether balance on reserve
        expectedReserveBalanceWei = expectedReserveBalanceWei.add(totalWei);
        let balance = await Helper.getBalancePromise(reserveInst.address);
        Helper.assertEqual(balance, expectedReserveBalanceWei, "bad reserve balance");

        //check lower token balance in reserve
        let reportedBalance = await token.balanceOf(walletForToken);
        Helper.assertEqual(reportedBalance, reserveTokenBalance[tokenInd], "bad token balance on reserve");

        //check token balance on user1
        let tokenTweiBalance = await token.balanceOf(user1);
        Helper.assertEqual(tokenTweiBalance, totalExpectedTwei, "bad token balance");
    });


    it("should perform small sell and check: balances changed, rate is expected rate.", async function () {
        let tokenInd = 3;
        let token = tokens[tokenInd]; //choose some token
        let amountTwei = new BN(25);

        //no need to transfer initial balance to user
        //in the full scenario. user approves network which collects the tokens and approves reserve
        //which collects tokens from network.
        //so here transfer tokens to network and approve allowance from network to reserve.
        await token.transfer(network, amountTwei);

        //verify sell rate
        let sellRate = await reserveInst.getConversionRate(tokenAdd[tokenInd], ethAddress, amountTwei, currentBlock);

        let expectedRate = baseSellRate[tokenInd];
        let extraBps = getExtraBpsForSellQuantity(amountTwei);
        expectedRate = Helper.addBps(expectedRate, extraBps);

        //check correct rate calculated
        Helper.assertEqual(sellRate, expectedRate, "unexpected rate.");

        //pre trade step, approve allowance from user to network.
        await token.approve(reserveInst.address, amountTwei, {from: network});

        //perform trade
        await reserveInst.trade(tokenAdd[tokenInd], amountTwei, ethAddress, user2, sellRate, true, {from:network});

        //check lower ether balance on reserve
        let amountWei = amountTwei.mul(expectedRate).div(precisionUnits);
        expectedReserveBalanceWei = expectedReserveBalanceWei.sub(amountWei);
        let balance = await Helper.getBalancePromise(reserveInst.address);
        Helper.assertEqual(balance, expectedReserveBalanceWei, "bad reserve balance wei");

        //check token balances
        ///////////////////////

        //check token balance on network zeroed
        let tokenTweiBalance = await token.balanceOf(network);

        Helper.assertEqual(tokenTweiBalance, 0, "bad token balance");

        //check token balance on reserve was updated (higher)
        //below is true since all tokens and ether have same decimals (18)
        reserveTokenBalance[tokenInd] = reserveTokenBalance[tokenInd].add(amountTwei);
        let recordImbal = new BN(divSolidity(amountTwei.mul(new BN(-1)), minimalRecordResolution)).mul(minimalRecordResolution);
        reserveTokenImbalance[tokenInd] = reserveTokenImbalance[tokenInd].add(recordImbal); //imbalance represents how many missing tokens
        let reportedBalance = await token.balanceOf(reserveInst.address);
        Helper.assertEqual(reportedBalance, reserveTokenBalance[tokenInd], "bad token balance on reserve");
    });

    it("should verify trade success when validation disabled.", async function () {
        let tokenInd = 3;
        let token = tokens[tokenInd]; //choose some token
        let amountTwei = new BN(25);


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
        let amountWei = amountTwei.mul(sellRate).div(precisionUnits);
        expectedReserveBalanceWei = expectedReserveBalanceWei.sub(amountWei);
        let balance = await Helper.getBalancePromise(reserveInst.address);
        Helper.assertEqual(balance, expectedReserveBalanceWei, "bad reserve balance wei");

        //check token balances
        ///////////////////////

        //check token balance on network zeroed
        let tokenTweiBalance = await token.balanceOf(network);

        Helper.assertEqual(tokenTweiBalance, 0, "bad token balance");

        //check token balance on reserve was updated (higher)
        //below is true since all tokens and ether have same decimals (18)
        reserveTokenBalance[tokenInd] = reserveTokenBalance[tokenInd].add(amountTwei);
        let recordImbal = (new BN(divSolidity(amountTwei.mul(new BN(-1)), minimalRecordResolution))).mul(minimalRecordResolution);
        reserveTokenImbalance[tokenInd] = reserveTokenImbalance[tokenInd].add(recordImbal); //imbalance represents how many missing tokens
        let reportedBalance = await token.balanceOf(reserveInst.address);
        Helper.assertEqual(reportedBalance, reserveTokenBalance[tokenInd], "bad token balance on reserve");
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
            let amountTwei = new BN((i + 1) * 31);

            await token.transfer(network, amountTwei);

            //verify sell rate
            let sellRate = await reserveInst.getConversionRate(tokenAdd[tokenInd], ethAddress, amountTwei, currentBlock);

            let expectedRate = baseSellRate[tokenInd];
            let extraBps = getExtraBpsForSellQuantity(amountTwei);
            expectedRate = Helper.addBps(expectedRate, extraBps);
            extraBps = getExtraBpsForImbalanceSellQuantity((reserveTokenImbalance[tokenInd].sub(amountTwei)));
            expectedRate = Helper.addBps(expectedRate, extraBps);
            expectedRate = expectedRate;

            //check correct rate calculated
            Helper.assertEqual(sellRate, expectedRate, "unexpected rate.");

            //pre trade step, approve allowance from network to reserve (on reserve test we skip step where user sends to netwok)
            await token.approve(reserveInst.address, amountTwei, {from: network});

            //perform trade
            await reserveInst.trade(tokenAdd[tokenInd], amountTwei, ethAddress, user2, sellRate, true, {from:network});

            //check lower ether balance on reserve
            let amountWei = amountTwei.mul(expectedRate).div(precisionUnits);
            expectedReserveBalanceWei = expectedReserveBalanceWei.sub(amountWei);
            let balance = await Helper.getBalancePromise(reserveInst.address);
            Helper.assertEqual(balance, expectedReserveBalanceWei, "bad reserve balance wei");

            //check token balances
            ///////////////////////

            //check token balance on network zeroed
            let tokenTweiBalance = await token.balanceOf(network);

            Helper.assertEqual(tokenTweiBalance, 0, "bad token balance network");

            //check token balance on reserve was updated (higher)
            //below is true since all tokens and ether have same decimals (18)
            reserveTokenBalance[tokenInd] = reserveTokenBalance[tokenInd].add(amountTwei);
            let recordImbal = new BN(divSolidity(amountTwei.mul(new BN(-1)), minimalRecordResolution)).mul(minimalRecordResolution);
            reserveTokenImbalance[tokenInd] = reserveTokenImbalance[tokenInd].add(recordImbal); //imbalance represents how many missing tokens
            let reportedBalance = await token.balanceOf(reserveInst.address);
            Helper.assertEqual(reportedBalance, reserveTokenBalance[tokenInd], "bad token balance on reserve");
        }
    });

    it("should test sell trade reverted without token approved.", async function () {
        let tokenInd = 2;
        let token = tokens[tokenInd]; //choose some token
        let amount = new BN(300);

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
        let amount = new BN(300);

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
        let amount = new BN(300);

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
        let amountLow = new BN(1);
        let amountHigh = new BN(300);

        let sellRate = await reserveInst.getConversionRate(tokenAdd[tokenInd], ethAddress, amountLow, currentBlock);

        await token.transfer(network, amountLow.add(amountHigh));
        await token.approve(reserveInst.address, amountLow.add(amountHigh), {from: network});

        //
        try {
            await reserveInst.trade(tokenAdd[tokenInd], amountLow, ethAddress, user2, sellRate, true, {from:network});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        await reserveInst.trade(tokenAdd[tokenInd], amountHigh, ethAddress, user2, sellRate, true, {from:network});
        reserveTokenBalance[tokenInd] = reserveTokenBalance[tokenInd].add(amountHigh);
        let recordImbal = (new BN(divSolidity(new BN(-1).mul(amountHigh), minimalRecordResolution))).mul(minimalRecordResolution);
        reserveTokenImbalance[tokenInd] = reserveTokenImbalance[tokenInd].add(recordImbal);
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
       let amount = new BN(300);

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
       reserveTokenBalance[tokenInd] = reserveTokenBalance[tokenInd].add(amount);
       reserveTokenImbalance[tokenInd] = reserveTokenImbalance[tokenInd].sub(amount);
    });

    it("should test reverted scenario for set contracts call.", async function () {
        //legal call
        await reserveInst.setContracts(network, convRatesInst.address, zeroAddress, {from:admin});

        try {
            await reserveInst.setContracts(zeroAddress, convRatesInst.address, zeroAddress, {from:admin});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await reserveInst.setContracts(network, zeroAddress, zeroAddress, {from:admin});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("should test get src qty when dst qty is very small and source is near 0.", async function () {
        //legal call
        let srcDecimal = 3;
        let destDecimal = 18;
        let token3Dec = await TestToken.new("test", "tst", 3);
        let dstQty = new BN(200);
        let rate = precisionUnits.div(new BN(2));

        //make sure src qty rounded up.
        let getSrcQTY = await reserveInst.getSrcQty(token3Dec.address, ethAddress, dstQty, rate);  
        let srcQty = Helper.calcSrcQty(dstQty, srcDecimal, destDecimal, rate);
        Helper.assertEqual(srcQty, getSrcQTY, "bad src qty");
    
        getSrcQTY = await reserveInst.getSrcQty(ethAddress, token3Dec.address, dstQty, rate);
        srcQty = Helper.calcSrcQty(dstQty, destDecimal, srcDecimal, rate);
        Helper.assertEqual(srcQty, getSrcQTY, "bad src qty");

    });

    it("should test get src qty reverted when decimals diff > max decimals diff (18).", async function () {
        //max decimal diff is defined in contract Utils.sol MAX_DECIMALS
        let srcDecimal = 3;
        let destDecimal = 18;
        let token3Dec = await TestToken.new("test", "tst", 3);
        let token30Dec = await TestToken.new("test", "tst", 30);
        let dstQty = new BN(300);
        let rate = precisionUnits.div(new BN(2));

        //first get src qty when decimal diff is legal
        getSrcQTY = await reserveInst.getSrcQty(ethAddress, token3Dec.address, dstQty, rate);
        let srcQty = Helper.calcSrcQty(dstQty, destDecimal, srcDecimal, rate);
        Helper.assertEqual(srcQty, getSrcQTY, "bad src qty");

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
        let amount = new BN(10);
        let token = tokens[tokenInd];

        // first token
        await reserveInst.approveWithdrawAddress(tokenAdd[tokenInd], withDrawAddress, true);
        await reserveInst.withdraw(tokenAdd[tokenInd], amount, withDrawAddress, {from: operator});

        reserveTokenBalance[tokenInd] = reserveTokenBalance[tokenInd].sub(amount);
        let reportedBalance = await token.balanceOf(walletForToken);
        Helper.assertEqual(reportedBalance, reserveTokenBalance[tokenInd], "bad token balance on reserve");

        reportedBalance = await token.balanceOf(withDrawAddress);
        Helper.assertEqual(reportedBalance, amount, "bad token balance on withdraw address");

        expectedReserveBalanceWei = await Helper.getBalancePromise(reserveInst.address);

        //ether
        await reserveInst.approveWithdrawAddress(ethAddress, withDrawAddress, true);
        await reserveInst.withdraw(ethAddress, amount, withDrawAddress, {from: operator});

        expectedReserveBalanceWei = expectedReserveBalanceWei.sub(amount);
        reportedBalance = await Helper.getBalancePromise(reserveInst.address);
        Helper.assertEqual(reportedBalance, expectedReserveBalanceWei, "bad eth balance on reserve");
    });

    it ("should test reverted scenarios for withdraw", async function() {
        let tokenInd = 1;
        let amount = new BN(10);

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

    it ("should test reverted scenarios for setTokenWallet", async function() {
        let tokenInd = 1;

        try {
            await reserveInst.setTokenWallet(tokenAdd[tokenInd], zeroAddress, {from:admin});
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await reserveInst.setTokenWallet(tokenAdd[tokenInd], withDrawAddress, {from:operator});
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it ("should test get dest qty", async function() {
        let srcQty = new BN(100);
        let rate = precision.div(new BN(2)); //1 to 2. in precision units

        let srcDecimal = 10;
        let dstDecimal = 13;

        let tokenA = await TestToken.new("source", "src", srcDecimal);
        let tokenB = await TestToken.new("dest", "dst", dstDecimal);

        //get dest QTY
        let expectedDestQty = Helper.calcDstQty(srcQty, srcDecimal, dstDecimal, rate);

        let reportedDstQty = await reserveInst.getDestQty(tokenA.address, tokenB.address, srcQty, rate);

        Helper.assertEqual(expectedDestQty, reportedDstQty, "unexpected dst qty");
    });

    it ("should test get src qty", async function() {
        let rate = precision.div(new BN(2)); //1 to 2. in precision units

        let srcDecimal = 10;
        let dstDecimal = 13;

        let tokenA = await TestToken.new("source", "src", srcDecimal);
        let tokenB = await TestToken.new("dest", "dst", dstDecimal);

        //get src qty
        let dstQty = new BN(100000);
        let expectedSrcQty = Helper.calcSrcQty(dstQty, srcDecimal, dstDecimal, rate);

        let reportedSrcQty = await reserveInst.getSrcQty(tokenA.address, tokenB.address, dstQty, rate);

        Helper.assertEqual(expectedSrcQty, reportedSrcQty, "unexpected dst qty");
    });

    it ("should test get conversion rate options", async function() {
        let tokenInd = 3;
        let amountTwei = new BN(3);

        //test normal case.
        let sellRate = await reserveInst.getConversionRate(tokenAdd[tokenInd], ethAddress, amountTwei, currentBlock);

        let expectedRate = baseSellRate[tokenInd];
        let extraBps = getExtraBpsForSellQuantity(amountTwei);
        expectedRate = Helper.addBps(expectedRate, extraBps);
        extraBps = getExtraBpsForImbalanceSellQuantity((reserveTokenImbalance[tokenInd].sub(amountTwei)));
        expectedRate = Helper.addBps(expectedRate, extraBps);
        expectedRate = expectedRate;

        //check correct rate calculated
        Helper.assertEqual(sellRate, expectedRate, "unexpected rate.");

        //disable trade and test
        await reserveInst.disableTrade({from: alerter})
        sellRate = await reserveInst.getConversionRate(tokenAdd[tokenInd], ethAddress, amountTwei, currentBlock);
        Helper.assertEqual(0, sellRate, "rate not 0");
        await reserveInst.enableTrade({from:admin});

        //try token to token
        sellRate = await reserveInst.getConversionRate(tokenAdd[tokenInd], tokenAdd[2], amountTwei, currentBlock);
        Helper.assertEqual(0, sellRate, "rate not 0");

        //test normal case.
        sellRate = await reserveInst.getConversionRate(tokenAdd[tokenInd], ethAddress, amountTwei, currentBlock);

        //check correct rate calculated
        Helper.assertEqual(sellRate, expectedRate, "unexpected rate.");
    });

    it ("should test get conversion rate return 0 when sanity rate is lower the calculated rate", async function() {
        let tokenInd = 1;
        let token = tokens[tokenInd]; //choose some token
        let amount = new BN(30);

        let sellRate = await reserveInst.getConversionRate(tokenAdd[tokenInd], ethAddress, amount, currentBlock);

        await token.transfer(network, amount);
        await token.approve(reserveInst.address, amount, {from: network});

        //set sanity rate data...
        sanityRate = await SanityRates.new(admin);
        await sanityRate.addOperator(operator);
        let tokens2 = [tokenAdd[tokenInd]];

        //set low rate - that will be smaller then calculated and cause return value 0
        let rates2 = [new BN(sellRate).div(new BN(2))];

        await sanityRate.setSanityRates(tokens2, rates2, {from: operator});
        let diffs = [1000];
        await sanityRate.setReasonableDiff(tokens2, diffs, {from: admin});

        await reserveInst.setContracts(network, convRatesInst.address, sanityRate.address, {from:admin});

        let nowRate = await reserveInst.getConversionRate(tokenAdd[tokenInd], ethAddress, amount, currentBlock);

        Helper.assertEqual(nowRate, 0, "expected zero rate.");

        //set high sanity rate. that will not fail the calculated rate.
        rates2 = [new BN(sellRate).mul(new BN(2))];
        await sanityRate.setSanityRates(tokens2, rates2, {from: operator});
        nowRate = await reserveInst.getConversionRate(tokenAdd[tokenInd], ethAddress, amount, currentBlock);
        Helper.assertGreater(nowRate, 0, "expected valid rate.");
        await reserveInst.setContracts(network, convRatesInst.address, zeroAddress, {from:admin});
    });

    it("should zero reserve balance and see that get rate returns zero when not enough dest balance", async function() {
        let tokenInd = 1;
        let amountTwei = new BN(maxPerBlockImbalance - 1);
        let token = tokens[tokenInd];
        let srcQty = new BN(50); //some high number of figure out ~rate

        await token.approve(reserveInst.address,0,{from:walletForToken});
        let rate = await reserveInst.getConversionRate(ethAddress, tokenAdd[tokenInd], srcQty, currentBlock);
        Helper.assertEqual(rate, 0, "expected rate 0");

        await token.approve(reserveInst.address,maxAllowance,{from:walletForToken});
        rate = await reserveInst.getConversionRate(ethAddress, tokenAdd[tokenInd], srcQty, currentBlock);
        assert.notEqual(rate, 0, "expected rate is not 0");

        let balance = await token.balanceOf(walletForToken);
        await reserveInst.approveWithdrawAddress(tokenAdd[tokenInd], withDrawAddress, true);
        await reserveInst.withdraw(tokenAdd[tokenInd], balance, withDrawAddress, {from: operator});

        balance = await token.balanceOf(walletForToken);

        Helper.assertEqual(balance.valueOf(0), 0, "expected balance 0");

        rate = await reserveInst.getConversionRate(ethAddress, tokenAdd[tokenInd], srcQty, currentBlock);
        Helper.assertEqual(rate, 0, "expected rate 0");
    });

    it("should test can't init this contract with empty contracts (address 0).", async function () {
        let reserve;

        try {
           reserve = await Reserve.new(network, convRatesInst.address, zeroAddress);
           assert(false, "throw was expected in line above.")
        } catch(e){
           assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
           reserve =  await Reserve.new(network, zeroAddress, admin);
           assert(false, "throw was expected in line above.")
        } catch(e){
           assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
           reserve =  await Reserve.new(zeroAddress, convRatesInst.address, admin);
           assert(false, "throw was expected in line above.")
        } catch(e){
           assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        reserve = await Reserve.new(network, convRatesInst.address, admin);

        try {
           await reserve.setContracts(zeroAddress, convRatesInst.address, zeroAddress);
           assert(false, "throw was expected in line above.")
        } catch(e){
           assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
           await reserve.setContracts(network, zeroAddress, zeroAddress);
           assert(false, "throw was expected in line above.")
        } catch(e){
           assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //sanity rates can currently be empty
        await reserve.setContracts(network, convRatesInst.address, zeroAddress);
    });

    it("enhance step func: should perform small buy (no steps) and check: balances changed, rate is expected rate.", async function () {
        let tokenInd = 3;
        let token = tokens[tokenInd]; //choose some token
        let amountWei = new BN(2);

        //verify base rate
        let buyRate = await reserveInst2.getConversionRate(ethAddress, tokenAdd[tokenInd], amountWei, currentBlock);
        let expectedRate = baseBuyRate[tokenInd];

        //check correct rate calculated
        Helper.assertEqual(buyRate, expectedRate, "unexpected rate.");

        //perform trade
        await reserveInst2.trade(ethAddress, amountWei, tokenAdd[tokenInd], user3, buyRate, true, {from:network, value:amountWei});

        //check higher ether balance on reserve
        expectedReserveBalanceWei2 = (expectedReserveBalanceWei2).add(amountWei);
        let balance = await Helper.getBalancePromise(reserveInst2.address);
        Helper.assertEqual(balance, expectedReserveBalanceWei2, "bad reserve balance wei");

        //check token balances
        ///////////////////////

        //check token balance on user3
        let tokenTweiBalance = await token.balanceOf(user3);
        let expectedTweiAmount = expectedRate.mul(amountWei).div(precisionUnits);
        Helper.assertEqual(tokenTweiBalance, expectedTweiAmount, "bad token balance");

        //check lower token balance on reserve
        //below is true since all tokens and ether have same decimals (18)
        reserveTokenBalance2[tokenInd] = reserveTokenBalance2[tokenInd].sub(expectedTweiAmount);
        reserveTokenImbalance2[tokenInd] = reserveTokenImbalance2[tokenInd].add(expectedTweiAmount); //imbalance represents how many missing tokens
        let reportedBalance = await token.balanceOf(reserveInst2.address);
        Helper.assertEqual(reportedBalance, reserveTokenBalance2[tokenInd], "bad token balance on reserve");
    });

    it("enhance step func: should perform a few buys with steps and check: correct balances change, rate is expected rate.", async function () {
        let tokenInd = 2;
        let token = tokens[tokenInd]; //choose some token
        let amountWei;
        let totalWei = new BN(0);
        let totalExpectedTwei = new BN(0);
        let initialTokenImbalance = await convRatesInst2.getImbalancePerToken(tokenAdd[tokenInd], 0);
        reserveTokenImbalance2[tokenInd] = initialTokenImbalance.totalImbalance;

        for (let i = 0; i < 19; i++) {
            amountWei = new BN((7 * i) + 11);
            currentBlock = await Helper.getCurrentBlock();
            let buyRate = await reserveInst2.getConversionRate(ethAddress, tokenAdd[tokenInd], amountWei, currentBlock);

            //verify price/rate against set price
            let expectedRate = baseBuyRate[tokenInd];
            // add rate update
            extraBps = compactBuyArr[tokenInd] * 10;
            expectedRate = Helper.addBps(expectedRate, extraBps);
            //first calculate number of destination tokens according to basic rate
            let destQty = Helper.calcDstQty(amountWei, 18, 18, expectedRate);
            extraBps = getExtraBpsForImbalanceBuyQuantityNew(reserveTokenImbalance2[tokenInd].toNumber(), destQty.toNumber());
            expectedRate = Helper.addBps(expectedRate, extraBps);
            Helper.assertEqual(buyRate, expectedRate, "unexpected rate. loop: " + i);

            //update balances based on new rate
            let expectedTweiAmount = Helper.calcDstQty(amountWei, 18, 18, expectedRate);
            totalExpectedTwei = totalExpectedTwei.add(expectedTweiAmount);
            reserveTokenBalance2[tokenInd] = reserveTokenBalance2[tokenInd].sub(expectedTweiAmount);
            let recordImbal = expectedTweiAmount.div(minimalRecordResolution).mul(minimalRecordResolution);
            reserveTokenImbalance2[tokenInd] = reserveTokenImbalance2[tokenInd].add(recordImbal);
            await reserveInst2.trade(ethAddress, amountWei, tokenAdd[tokenInd], user3, buyRate, true, {from : network, value:amountWei});
            totalWei = totalWei.add(amountWei);
        };

        //check higher ether balance on reserve
        expectedReserveBalanceWei2 = expectedReserveBalanceWei2.add(totalWei);
        let balance = await Helper.getBalancePromise(reserveInst2.address);
        Helper.assertEqual(balance, expectedReserveBalanceWei2, "bad reserve balance");

        //check lower token balance in reserve
        let reportedBalance = await token.balanceOf(reserveInst2.address);
        Helper.assertEqual(reportedBalance, reserveTokenBalance2[tokenInd], "bad token balance on reserve");

        //check token balance on user3
        let tokenTweiBalance = await token.balanceOf(user3);
        Helper.assertEqual(tokenTweiBalance, totalExpectedTwei, "bad token balance");
    });

    it("enhance step func: should perform a few buys with steps and check: correct balances change, rate is expected rate. Also tokens are in a wallet", async function () {
        let tokenInd = 1;
        let token = tokens[tokenInd]; //choose some token
        let amountWei;
        let totalWei = new BN(0);
        let totalExpectedTwei = new BN(0);
        let initialTokenImbalance = await convRatesInst2.getImbalancePerToken(tokenAdd[tokenInd], 0);
        reserveTokenImbalance2[tokenInd] = initialTokenImbalance.totalImbalance;

        // transfer tokens to wallet
        await reserveInst2.withdrawToken(token.address,
                                        await token.balanceOf(reserveInst2.address),
                                        walletForToken);

        // set allowance
        await token.approve(reserveInst2.address,maxAllowance,{from:walletForToken});

        // set wallet address
        await reserveInst2.setTokenWallet(token.address,walletForToken);

        for (let i = 0; i < 19; i++) {
            amountWei = new BN(12 * i + 2);
            currentBlock = await Helper.getCurrentBlock();
            let buyRate = await reserveInst2.getConversionRate(ethAddress, tokenAdd[tokenInd], amountWei, currentBlock);

            //verify price/rate against set price
            let expectedRate = baseBuyRate[tokenInd];
            // add rate update
            let extraBps = compactBuyArr[tokenInd] * 10;
            expectedRate = Helper.addBps(expectedRate, extraBps);
            //first calculate number of destination tokens according to basic rate
            let destQty = Helper.calcDstQty(amountWei, 18, 18, expectedRate);
            extraBps = getExtraBpsForImbalanceBuyQuantityNew(reserveTokenImbalance2[tokenInd].toNumber(), destQty.toNumber());
            expectedRate = Helper.addBps(expectedRate, extraBps);

            Helper.assertEqual(buyRate, expectedRate, "unexpected rate. loop: " + i);

            let expectedTweiAmount = Helper.calcDstQty(amountWei, 18, 18, expectedRate);
            totalExpectedTwei = totalExpectedTwei.add(expectedTweiAmount);
            reserveTokenBalance2[tokenInd] = reserveTokenBalance2[tokenInd].sub(expectedTweiAmount);
            let recordImbal = expectedTweiAmount.div(minimalRecordResolution).mul(minimalRecordResolution);
            reserveTokenImbalance2[tokenInd] = reserveTokenImbalance2[tokenInd].add(recordImbal);

            await reserveInst2.trade(ethAddress, amountWei, tokenAdd[tokenInd], user3, buyRate, true, {from : network, value:amountWei});
            totalWei = totalWei.add(amountWei);
        };

        //check higher ether balance on reserve
        expectedReserveBalanceWei2 = expectedReserveBalanceWei2.add(totalWei);
        let balance = await Helper.getBalancePromise(reserveInst2.address);
        Helper.assertEqual(balance, expectedReserveBalanceWei2, "bad reserve balance");

        //check lower token balance in reserve
        let reportedBalance = await token.balanceOf(walletForToken);
        Helper.assertEqual(reportedBalance, reserveTokenBalance2[tokenInd], "bad token balance on reserve");

        //check token balance on user3
        let tokenTweiBalance = await token.balanceOf(user3);
        Helper.assertEqual(tokenTweiBalance, totalExpectedTwei, "bad token balance");
    });

    it("enhance step func: should perform a few sells with steps and check: correct balances change, rate is expected rate.", async function () {
        let tokenInd = 2;
        let token = tokens[tokenInd]; //choose some token
        let amountTwei;

        for (let i = 0; i < 19; i++) {
            amountTwei = new BN(50 + 32 * i);

            await token.transfer(network, amountTwei);

            currentBlock = await Helper.getCurrentBlock();
            //verify sell rate
            let sellRate = await reserveInst2.getConversionRate(tokenAdd[tokenInd], ethAddress, amountTwei, currentBlock);
            let expectedRate = baseSellRate[tokenInd];

            // add rate update
            let extraBps = compactSellArr[tokenInd] * 10;
            expectedRate = Helper.addBps(expectedRate, extraBps);

            //first calculate number of destination tokens according to basic rate
            let destQty = Helper.calcDstQty(amountTwei, 18, 18, expectedRate);
            extraBps = getExtraBpsForImbalanceSellQuantityNew(reserveTokenImbalance2[tokenInd].toNumber(), amountTwei.toNumber());
            expectedRate = Helper.addBps(expectedRate, extraBps);

            //check correct rate calculated
            Helper.assertEqual(sellRate, expectedRate, "unexpected rate. loop: " + i);

            //pre trade step, approve allowance from user to network.
            await token.approve(reserveInst2.address, amountTwei, {from: network});

            //perform trade
            await reserveInst2.trade(tokenAdd[tokenInd], amountTwei, ethAddress, user4, sellRate, true, {from:network});

            //check lower ether balance on reserve
            let amountWei = Helper.calcDstQty(amountTwei, 18, 18, expectedRate);
            expectedReserveBalanceWei2 = expectedReserveBalanceWei2.sub(amountWei);
            let balance = await Helper.getBalancePromise(reserveInst2.address);
            Helper.assertEqual(balance, expectedReserveBalanceWei2, "bad reserve balance wei");

            //check token balances
            ///////////////////////

            //check token balance on network zeroed
            let tokenTweiBalance = await token.balanceOf(network);

            Helper.assertEqual(tokenTweiBalance, 0, "bad token balance");

            //check token balance on reserve was updated (higher)
            //below is true since all tokens and ether have same decimals (18)
            reserveTokenBalance2[tokenInd] = reserveTokenBalance2[tokenInd].add(amountTwei);
            let recordImbal = (new BN(divSolidity(amountTwei.mul(new BN(-1)), minimalRecordResolution))).mul(minimalRecordResolution);
            reserveTokenImbalance2[tokenInd] = reserveTokenImbalance2[tokenInd].add(recordImbal); //imbalance represents how many missing tokens
            let reportedBalance = await token.balanceOf(reserveInst2.address);
            Helper.assertEqual(reportedBalance, reserveTokenBalance2[tokenInd], "bad token balance on reserve");
        };

    });
});

function convertRateToPricingRate (baseRate) {
    // conversion rate in pricing is in precision units (10 ** 18) so
    // rate 1 to 50 is 50 * 10 ** 18
    // rate 50 to 1 is 1 / 50 * 10 ** 18 = 10 ** 18 / 50a
        return ((new BN(10).pow(new BN(18))).mul(baseRate));
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

function getExtraBpsForImbalanceBuyQuantityNew(imbalance, qty) {
    return getExtraBpsForQuantity(imbalance, imbalance + qty, imbalanceBuyStepX, imbalanceBuyStepYNew);
};

function getExtraBpsForImbalanceSellQuantityNew(imbalance, qty) {
    return getExtraBpsForQuantity(imbalance - qty, imbalance, imbalanceSellStepX, imbalanceSellStepYNew);
};

function getExtraBpsForQuantity(from, to, stepX, stepY) {
    if (stepY.length == 0 || (from == to)) { return 0; }
    let len = stepX.length;

    let change = 0;
    let fromVal = from;
    let qty = to - from;

    for(let i = 0; i < len; i++) {
        if (stepX[i] <= fromVal) { continue; }
        if (stepY[i] == -10000) { return -10000; }
        if (stepX[i] >= to) {
            change += (to - fromVal) * stepY[i];
            return divSolidity(change, qty);
        } else {
            change += (stepX[i] - fromVal) * stepY[i];
            fromVal = stepX[i];
        }
    }
    if (fromVal < to) {
        if (stepY[len] == -10000) { return -10000; }
        change += (to - fromVal) * stepY[len];
    }
    return divSolidity(change, qty);
}

function compareRates (receivedRate, expectedRate) {
    expectedRate = expectedRate - (expectedRate % 10);
    receivedRate = receivedRate - (receivedRate % 10);
    Helper.assertEqual(expectedRate, receivedRate, "different rates");
};

function calculateRateAmount(isBuy, tokenInd, srcQty, reserveIndex, maxDestAmount) {
    let expectedRate;
    let expectedAmount;
    let baseArray;
    let imbalanceArray;
    let expected = [];

    if (reserveIndex != 1 && reserveIndex != 2) return "error";

    if (isBuy) {
        if (reserveIndex == 1) {
            imbalanceArray = reserve1TokenImbalance;
            baseArray = baseBuyRate1;
        } else {
            baseArray = baseBuyRate2;
            imbalanceArray = reserve2TokenImbalance;
        }

    } else {
        if (reserveIndex == 1) {
            imbalanceArray = reserve1TokenImbalance;
            baseArray = baseSellRate1;
        } else {
            imbalanceArray = reserve2TokenImbalance;
            baseArray = baseSellRate2;
        }
    }

    if (isBuy) {
        expectedRate = (new BN(baseArray[tokenInd]));
        let dstQty = Helper.calcDstQty(srcQty, 18, tokenDecimals[tokenInd], expectedRate);
        let extraBps = getExtraBpsForBuyQuantity(dstQty);
        expectedRate = Helper.addBps(expectedRate, extraBps);
        let relevantImbalance = imbalanceArray[tokenInd] * 1 + dstQty * 1;
        extraBps = getExtraBpsForImbalanceBuyQuantity(relevantImbalance);
        expectedRate = Helper.addBps(expectedRate, extraBps);
        expectedAmount = Helper.calcDstQty(srcQty, 18, tokenDecimals[tokenInd], expectedRate);
    } else {
        expectedRate = (new BN(baseArray[tokenInd]));
        let extraBps = getExtraBpsForSellQuantity(srcQty);
        expectedRate = Helper.addBps(expectedRate, extraBps);
        let relevantImbalance = imbalanceArray[tokenInd] - srcQty;
        extraBps = getExtraBpsForImbalanceSellQuantity(relevantImbalance);
        expectedRate = Helper.addBps(expectedRate, extraBps);
        expectedAmount = Helper.calcDstQty(srcQty, tokenDecimals[tokenInd], 18, expectedRate);
    }

    expected = [expectedRate, expectedAmount];
    return expected;
}

function divSolidity(a, b) {
    let c = a / b;
    if (c < 0) { return Math.ceil(c); }
    return Math.floor(c);
}