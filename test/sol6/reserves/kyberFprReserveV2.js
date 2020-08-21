const ConversionRates = artifacts.require("MockEnhancedStepFunctions.sol");
const TestToken = artifacts.require("TestToken.sol");
const WethToken = artifacts.require("Weth9.sol");
const Reserve = artifacts.require("KyberFprReserveV2");
const SanityRates = artifacts.require("SanityRates");

const Helper = require("../../helper.js");
const BN = web3.utils.BN;

//global variables
//////////////////
const {BPS, precisionUnits, ethDecimals, ethAddress, zeroAddress, emptyHint, 
    zeroBN, MAX_QTY, MAX_RATE, MAX_ALLOWANCE} = require("../../helper.js");
const maxAllowance = new BN(2).pow(new BN(255));
const {expectEvent, expectRevert} = require('@openzeppelin/test-helpers');

//balances
let expectedReserveBalanceWei = new BN(0);
let expectedReserveBalanceWeth = new BN(0);
let reserveTokenBalance = [];
let reserveTokenImbalance = [];

//permission groups
let admin;
let operator;
let alerter;
let network;
let withdrawAddress;

//contracts
let weth;
let convRatesInst;
let reserveInst;
let sanityRate = 0;

//block data
let priceUpdateBlock;
let currentBlock;
let validRateDurationInBlocks = 1000;
let maxGasPrice = new BN(150).mul(new BN(10).pow(new BN(9))); // 150 * 10^9

//tokens data
////////////
let numTokens = 5;
let tokens = [];
let tokenDecimals = [];
let tokenAdd = [];

// imbalance data
let minimalRecordResolution = new BN(2); //low resolution so I don't lose too much data. then easier to compare calculated imbalance values.
let maxPerBlockImbalance = 40000;
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


//imbalance buy steps
let imbalanceBuyStepX = [-8500, -2800, -1500, 0, 1500, 2800, 4500];
let imbalanceBuyStepXs = [];
let imbalanceBuyStepY = [ 1300, 130, 43, 0, 0, -110, -160, -1600];


//sell imbalance step
let imbalanceSellStepX = [-8500, -2800, -1000, 0, 1000, 2800, 4500];
let imbalanceSellStepXs = [];
let imbalanceSellStepY = [-1500, -320, -75, 0, 0, 110, 350, 650];


//compact data.
let sells = [];
let buys = [];
let indices = [];
let compactBuyArr = [];
let compactSellArr = [];

contract('KyberFprReserveV2', function(accounts) {
    before("Global setup", async function () {
        // set account addresses
        admin = accounts[0];
        operator = accounts[1];
        network = accounts[2];
        user1 = accounts[4];
        user2 = accounts[5];
        withdrawAddress = accounts[6];
        sanityRate = accounts[7];
        alerter = accounts[8];
        walletForToken = accounts[9];
        user3 = accounts[8];
        user4 = accounts[9];

        currentBlock = priceUpdateBlock = await Helper.getCurrentBlock();
        weth = await WethToken.new();

        // create tokens
        for (let i = 0; i < numTokens; ++i) {
            tokenDecimals[i] = new BN(18);
            token = await TestToken.new("test" + i, "tst" + i, tokenDecimals[i]);
            tokens[i] = token;
            tokenAdd[i] = token.address;
        }
    });

    const setupConversionRatesContract = async function(needToken) {
        convRatesInst = await ConversionRates.new(admin);

        //set pricing general parameters
        await convRatesInst.setValidRateDurationInBlocks(validRateDurationInBlocks);

        // no need to setup token
        if (!needToken) { return; }

        //create and add token addresses...
        for (let i = 0; i < numTokens; ++i) {
            let token = tokens[i];
            await convRatesInst.addToken(token.address);
            await convRatesInst.setTokenControlInfo(token.address, minimalRecordResolution, maxPerBlockImbalance, maxTotalImbalance);
            await convRatesInst.enableTokenTrade(token.address);
        }

        Helper.assertEqual(tokens.length, numTokens, "bad number tokens");

        await convRatesInst.addOperator(operator);
        await convRatesInst.addAlerter(alerter);

        // init rates
        // buy is ether to token rate. sale is token to ether rate. so sell == 1 / buy. assuming we have no spread.
        let tokensPerEther;
        let ethersPerToken;
        baseBuyRate = [];
        baseSellRate = [];

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

        imbalanceBuyStepXs = [];
        imbalanceSellStepXs = [];

        //all start with same step functions.
        for (let i = 0; i < numTokens; ++i) {
            let buyX = [];
            let sellX = [];
            for(let j = 0; j < imbalanceBuyStepX.length; j++) {
                buyX.push(imbalanceBuyStepX[j] * 10);
            }
            for(let j = 0; j < imbalanceSellStepX.length; j++) {
                sellX.push(imbalanceSellStepX[j] * 10);
            }
            imbalanceBuyStepXs.push(buyX);
            imbalanceSellStepXs.push(sellX);
            await convRatesInst.setImbalanceStepFunction(tokenAdd[i], buyX, imbalanceBuyStepY, sellX, imbalanceSellStepY, {from:operator});
        }
    }

    const tradeAndVerifyData = async function(
        reserveInst, isBuy, tokenInd,
        srcAmount, recipient, srcTokenWallet, destTokenWallet, isUsingWeth, isValidate
    ) {

        let recipientDestTokenBal;
        if (isBuy) {
            recipientDestTokenBal = await tokens[tokenInd].balanceOf(recipient);
        } else {
            recipientDestTokenBal = await Helper.getBalancePromise(recipient);
        }

        let token = tokens[tokenInd];
        let srcAddress = isBuy ? ethAddress : tokenAdd[tokenInd];
        let destAddress = isBuy ? tokenAdd[tokenInd] : ethAddress;
        let conversionRate = await reserveInst.getConversionRate(
            srcAddress,
            destAddress,
            srcAmount,
            currentBlock
        );
        let expectedRate;
        if (isBuy) {
            expectedRate = baseBuyRate[tokenInd];
            let extraBps = compactBuyArr[tokenInd] * 10;
            expectedRate = Helper.addBps(expectedRate, extraBps);
            let destQty = Helper.calcDstQty(srcAmount, ethDecimals, tokenDecimals[tokenInd], expectedRate);
            extraBps = getExtraBpsForImbalanceBuyQuantity(tokenInd, reserveTokenImbalance[tokenInd].toNumber(), destQty.toNumber());
            expectedRate = Helper.addBps(expectedRate, extraBps);
        } else {
            expectedRate = baseSellRate[tokenInd];
            let extraBps = compactSellArr[tokenInd] * 10;
            expectedRate = Helper.addBps(expectedRate, extraBps);
            extraBps = getExtraBpsForImbalanceSellQuantity(tokenInd, reserveTokenImbalance[tokenInd].toNumber(), srcAmount.toNumber());
            expectedRate = Helper.addBps(expectedRate, extraBps);
        }

        // check correct rate calculated
        Helper.assertEqual(conversionRate, expectedRate, "unexpected rate.");

        //perform trade
        await reserveInst.trade(
            srcAddress,
            srcAmount,
            destAddress,
            recipient,
            conversionRate,
            isValidate,
            {
                from: network,
                value: isBuy ? srcAmount : 0
            }
        );

        // check reserve has received token
        if (isBuy) {
            let expectedDestAmount = Helper.calcDstQty(srcAmount, ethDecimals, tokenDecimals[tokenInd], conversionRate);
            // check reserve has received eth
            if (!isUsingWeth) {
                // eth is transferred to reserve
                expectedReserveBalanceWei = expectedReserveBalanceWei.add(srcAmount);
                let balance = await Helper.getBalancePromise(reserveInst.address);
                Helper.assertEqual(balance, expectedReserveBalanceWei, "bad reserve balance wei");
            } else {
                // weth is transferred to weth token wallet
                expectedReserveBalanceWeth = expectedReserveBalanceWeth.add(srcAmount);
                let wethBalance = await weth.balanceOf(srcTokenWallet);
                Helper.assertEqual(wethBalance, expectedReserveBalanceWeth, "bad reserve weth balance");
            }

            // check user has received token
            let tokenTweiBalance = await token.balanceOf(recipient);
            recipientDestTokenBal = recipientDestTokenBal.add(expectedDestAmount);
            Helper.assertEqual(tokenTweiBalance, recipientDestTokenBal, "bad recipient token balance");

            // check reserve's dest token balance
            reserveTokenBalance[tokenInd] = reserveTokenBalance[tokenInd].sub(expectedDestAmount);
            let destTokenBal = await token.balanceOf(destTokenWallet);
            Helper.assertEqual(destTokenBal, reserveTokenBalance[tokenInd], "bad reserve dest token");

            let recordImbal = expectedDestAmount.div(minimalRecordResolution).mul(minimalRecordResolution);
            reserveTokenImbalance[tokenInd] = reserveTokenImbalance[tokenInd].add(recordImbal);

            return expectedDestAmount;
        } else {
            let expectedDestAmount = Helper.calcDstQty(srcAmount, tokenDecimals[tokenInd], ethDecimals, conversionRate);
            // check reserve has received token
            reserveTokenBalance[tokenInd] = reserveTokenBalance[tokenInd].add(srcAmount);
            let srcTokenBal = await token.balanceOf(srcTokenWallet);
            Helper.assertEqual(srcTokenBal, reserveTokenBalance[tokenInd], "bad reserve src token");

            // check user has received eth
            let userEthBal = await Helper.getBalancePromise(recipient);
            recipientDestTokenBal = recipientDestTokenBal.add(expectedDestAmount);
            Helper.assertEqual(userEthBal, recipientDestTokenBal, "bad recipient eth balance");

            if (!isUsingWeth) {
                expectedReserveBalanceWei = expectedReserveBalanceWei.sub(expectedDestAmount);
                let balance = await Helper.getBalancePromise(reserveInst.address);
                Helper.assertEqual(balance, expectedReserveBalanceWei, "bad reserve balance wei");
            } else {
                // weth is transferred to weth token wallet
                expectedReserveBalanceWeth = expectedReserveBalanceWeth.sub(expectedDestAmount);
                let wethBalance = await weth.balanceOf(destTokenWallet);
                Helper.assertEqual(wethBalance, expectedReserveBalanceWeth, "bad reserve weth balance");
            }

            let recordImbal = new BN(divSolidity(srcAmount.mul(new BN(-1)), minimalRecordResolution)).mul(minimalRecordResolution);
            reserveTokenImbalance[tokenInd] = reserveTokenImbalance[tokenInd].add(recordImbal);
            return expectedDestAmount;
        }
    };

    const collectFundsAfterTests = async function(tokenWallet) {
        // collect eth
        let balance = await Helper.getBalancePromise(reserveInst.address);
        if (balance.gt(zeroBN)) {
            await reserveInst.withdraw(ethAddress, balance, withdrawAddress, {from: operator});
        }
        // collect weth
        balance = await weth.balanceOf(tokenWallet);
        if (balance.gt(zeroBN)) {
            await reserveInst.withdraw(weth.address, balance, withdrawAddress, {from: operator});
        }
        for(let i = 0; i < numTokens; i++) {
            let balance = await tokens[i].balanceOf(tokenWallet);
            if (balance.gt(zeroBN)) {
                await reserveInst.withdraw(tokenAdd[i], balance, withdrawAddress, {from: operator});
            }
        }
    }

    // general setup reserve contract with fund in token wallet
    // need to set token wallet manually
    const generalSetupReserveContract = async function(isUsingTokenWallet, isUsingWeth) {
        // init reserves and balances
        reserveInst = await Reserve.new(network, convRatesInst.address, weth.address, maxGasPrice, admin);
        await reserveInst.setContracts(network, convRatesInst.address, weth.address, zeroAddress);

        await reserveInst.addOperator(operator);
        await reserveInst.addAlerter(alerter);
        await convRatesInst.setReserveAddress(reserveInst.address);

        await reserveInst.approveWithdrawAddress(ethAddress, withdrawAddress, true, {from: admin});
        for (let i = 0; i < numTokens; ++i) {
            await reserveInst.approveWithdrawAddress(tokenAdd[i], withdrawAddress, true, {from: admin});
        }

        let tokenWallet = isUsingTokenWallet ? walletForToken : reserveInst.address;
        //set reserve balance
        let amountEth = new BN(10);
        let reserveEtherInit = precisionUnits.mul(amountEth);
        if (isUsingWeth) {
            // empty token wallet
            let wethBalance = await weth.balanceOf(tokenWallet);
            if (wethBalance.gt(zeroBN)) {
                weth.transfer(accounts[0], wethBalance, {from: tokenWallet});
            }
            await weth.transfer(tokenWallet, reserveEtherInit);

            let balance = await weth.balanceOf(tokenWallet);
            expectedReserveBalanceWei = 0;
            expectedReserveBalanceWeth = balance;

            Helper.assertEqual(balance, reserveEtherInit, "wrong weth balance");
        } else {
            await Helper.sendEtherWithPromise(withdrawAddress, reserveInst.address, reserveEtherInit);

            let balance = await Helper.getBalancePromise(reserveInst.address);
            expectedReserveBalanceWei = balance;
            expectedReserveBalanceWeth = new BN(0);

            Helper.assertEqual(balance, reserveEtherInit, "wrong ether balance");
        }

        //transfer tokens to reserve
        reserveTokenImbalance = [];
        reserveTokenBalance = [];
        for (let i = 0; i < numTokens; ++i) {
            // empty token wallet
            token = tokens[i];
            let tokenBalance = await token.balanceOf(tokenWallet);
            if (tokenBalance.gt(zeroBN)) {
                await token.transfer(accounts[0], tokenBalance, {from: tokenWallet});
            }
            let amount = (amountEth.mul(new BN((i + 1) * 3))).mul(tokenUnits(tokenDecimals[i]));
            await token.transfer(tokenWallet, amount);
            let balance = await token.balanceOf(tokenWallet);
            Helper.assertEqual(amount, balance);

            reserveTokenBalance.push(amount);
            // we set some garbage data
            reserveTokenImbalance.push(new BN(10));
        }
    }

    describe("#Test using eth + tokens in reserve", async() => {
        before("set up contracts", async() => {
            //init conversion rate
            await setupConversionRatesContract(true);
            await generalSetupReserveContract(false, false);
        });

        after("collect funds", async() => {
            await collectFundsAfterTests(reserveInst.address);
        });

        it("Test a small buy (no steps) and check: balances changed, rate is expected rate.", async function () {
            let tokenInd = 3;
            let amountWei = new BN(20);

            await tradeAndVerifyData(
                reserveInst,
                true, // is buy
                tokenInd,
                amountWei,
                user1, // recipient
                reserveInst.address, // wallet to hold src token
                reserveInst.address, // wallet to hold dest token
                false, // not using weth
                true // validate
            );
        });

        it("Test a few buys with steps and check: correct balances change, rate is expected rate.", async function () {
            let tokenInd = 3;

            for (let i = 0; i < 15; i++) {
                let amountWei = new BN(Helper.getRandomInt(10, 400));
                await tradeAndVerifyData(
                    reserveInst,
                    true, // is buy
                    tokenInd,
                    amountWei,
                    user1, // recipient
                    reserveInst.address, // address to hold src token
                    reserveInst.address, // address to hold dest token
                    false, // not using weth
                    true // validate
                );
            };
        });

        it("Test a small sell and check: balances changed, rate is expected rate.", async function () {
            let tokenInd = 3;
            let token = tokens[tokenInd];
            let amountTwei = new BN(25);

            // transfer and approve token to network
            await token.transfer(network, amountTwei);
            await token.approve(reserveInst.address, amountTwei, {from: network});

            await tradeAndVerifyData(
                reserveInst,
                false, // sell trade
                tokenInd,
                amountTwei,
                user1, // recipient
                reserveInst.address, // wallet to hold src token
                reserveInst.address, // wallet to hold dest token
                false, // not using weth
                true // validate
            );
        });

        it("Test a few sells with steps and check: correct balances change, rate is expected rate.", async function () {
            let tokenInd = 3;
            let token = tokens[tokenInd];

            for (let i = 0; i < 15; i++) {
                let amountTwei = new BN(Helper.getRandomInt(1000, 10000));
                // transfer and approve token to network
                await token.transfer(network, amountTwei);
                await token.approve(reserveInst.address, amountTwei, {from: network});

                await tradeAndVerifyData(
                    reserveInst,
                    false, // is buy
                    tokenInd,
                    amountTwei,
                    user1, // recipient
                    reserveInst.address, // address to hold src token
                    reserveInst.address, // address to hold dest token
                    false, // not using weth
                    true // validate
                );
            };
        });

        it("Test verify trade success when validation disabled.", async function () {
            let tokenInd = 3;
            let amountWei = new BN(20);

            // eth -> token
            await tradeAndVerifyData(
                reserveInst,
                true, // is buy
                tokenInd,
                amountWei,
                user1, // recipient
                reserveInst.address, // wallet to hold src token
                reserveInst.address, // wallet to hold dest token
                false, // not using weth
                false // disable validate
            );

            // token -> eth
            let token = tokens[tokenInd];
            let amountTwei = new BN(25);

            // transfer and approve token to network
            await token.transfer(network, amountTwei);
            await token.approve(reserveInst.address, amountTwei, {from: network});

            await tradeAndVerifyData(
                reserveInst,
                false, // sell trade
                tokenInd,
                amountTwei,
                user1, // recipient
                reserveInst.address, // wallet to hold src token
                reserveInst.address, // wallet to hold dest token
                false, // not using weth
                false // validate
            );
        });

        it("Test set token wallet to reserve, trade should be successful", async() => {
            let tokenInd = 2;
            await reserveInst.setTokenWallet(tokenAdd[tokenInd], reserveInst.address, {from: admin});

            // buy token
            await tradeAndVerifyData(
                reserveInst,
                true, // is buy
                tokenInd,
                new BN(20), // src amount
                user1, // recipient
                reserveInst.address, // wallet to hold src token
                reserveInst.address, // wallet to hold dest token
                false, // not using weth
                false // disable validate
            );
            // sell token
            let token = tokens[tokenInd];
            let amountTwei = new BN(100);

            // transfer and approve token to network
            await token.transfer(network, amountTwei);
            await token.approve(reserveInst.address, amountTwei, {from: network});

            await tradeAndVerifyData(
                reserveInst,
                false, // sell trade
                tokenInd,
                amountTwei,
                user1, // recipient
                reserveInst.address, // wallet to hold src token
                reserveInst.address, // wallet to hold dest token
                false, // not using weth
                false // validate
            );
        });

        it("Test getConversionRate returns 0 when not enough balance", async() => {
           // test buy, not enough token
           let tokenInd = 2;
           let amountWei = new BN(20);

           let conversionRate = await reserveInst.getConversionRate(ethAddress, tokenAdd[tokenInd], amountWei, currentBlock);
           Helper.assertGreater(conversionRate, 0);

           let destQty = Helper.calcDstQty(amountWei, ethDecimals, tokenDecimals[tokenInd], conversionRate);
           let tokenBal = reserveTokenBalance[tokenInd];
           if (tokenBal.gt(destQty)) {
               // without some tokens
               let remainToken = destQty.sub(new BN(1));
               reserveTokenBalance[tokenInd] = remainToken;
               await reserveInst.withdraw(tokenAdd[tokenInd], tokenBal.sub(remainToken), withdrawAddress, {from: operator});
           }

           // check conversion rate
           conversionRate = await reserveInst.getConversionRate(ethAddress, tokenAdd[tokenInd], amountWei, currentBlock);
           Helper.assertEqual(0, conversionRate);

           // test sell, not enough eth
           let amountTwei = new BN(300);
           conversionRate = await reserveInst.getConversionRate(tokenAdd[tokenInd], ethAddress, amountTwei, currentBlock);
           Helper.assertGreater(conversionRate, 0);

           destQty = Helper.calcDstQty(amountTwei, tokenDecimals[tokenInd], ethDecimals, conversionRate);
           let ethBalance = expectedReserveBalanceWei;
           if (ethBalance.gt(destQty)) {
               // without some tokens
               let remainToken = destQty.sub(new BN(1));
               expectedReserveBalanceWei = remainToken;
               await reserveInst.withdraw(ethAddress, ethBalance.sub(remainToken), withdrawAddress, {from: operator});
           }

           // check conversion rate
           conversionRate = await reserveInst.getConversionRate(tokenAdd[tokenInd], ethAddress, amountTwei, currentBlock);
           Helper.assertEqual(0, conversionRate);
        });
    });

    describe("#Test eth in reserve, tokens in another wallet", async() => {
        before("setup contracts", async() => {
            await setupConversionRatesContract(true);
            await generalSetupReserveContract(true, false);

            // approve
            for(let i = 0; i < numTokens; i++) {
                await reserveInst.setTokenWallet(tokenAdd[i], walletForToken, {from: admin});
                await tokens[i].approve(reserveInst.address, maxAllowance, {from: walletForToken});
            }
        });

        after("collect funds", async() => {
            await collectFundsAfterTests(walletForToken);
        });

        it("Test a small buy (no steps) and check: balances changed, rate is expected rate.", async function () {
            let tokenInd = 1;
            let amountWei = new BN(20);

            await tradeAndVerifyData(
                reserveInst,
                true, // is buy
                tokenInd,
                amountWei,
                user1, // recipient
                reserveInst.address, // wallet to hold src token
                walletForToken, // wallet to hold dest token
                false, // not using weth
                true // validate
            );
        });

        it("Test a few buys with steps and check: correct balances change, rate is expected rate", async function () {
            let tokenInd = 1;

            for (let i = 0; i < 15; i++) {
                let amountWei = new BN(Helper.getRandomInt(100, 1500));
                await tradeAndVerifyData(
                    reserveInst,
                    true, // is buy
                    tokenInd,
                    amountWei,
                    user1, // recipient
                    reserveInst.address, // address to hold src token
                    walletForToken, // address to hold dest token
                    false, // not using weth
                    true // validate
                );
            };
        });

        it("Test a small sell and check: balances changed, rate is expected rate.", async function () {
            let tokenInd = 1;
            let token = tokens[tokenInd];
            let amountTwei = new BN(300);

            // transfer and approve token to network
            await token.transfer(network, amountTwei);
            await token.approve(reserveInst.address, amountTwei, {from: network});

            await tradeAndVerifyData(
                reserveInst,
                false, // sell trade
                tokenInd,
                amountTwei,
                user1, // recipient
                walletForToken, // wallet to hold src token
                reserveInst.address, // wallet to hold dest token
                false, // not using weth
                true // validate
            );
        });

        it("Test a few sells with steps and check: correct balances change, rate is expected rate.", async function () {
            let tokenInd = 2;
            let token = tokens[tokenInd];

            for (let i = 0; i < 15; i++) {
                let amountTwei = new BN(Helper.getRandomInt(500, 5000));
                // transfer and approve token to network
                await token.transfer(network, amountTwei);
                await token.approve(reserveInst.address, amountTwei, {from: network});

                await tradeAndVerifyData(
                    reserveInst,
                    false, // sell trade
                    tokenInd,
                    amountTwei,
                    user1, // recipient
                    walletForToken, // address to hold src token
                    reserveInst.address, // address to hold dest token
                    false, // not using weth
                    true // validate
                );
            };
        });

        it("Test verify trade success when validation disabled.", async function () {
            let tokenInd = 3;
            let amountWei = new BN(20);

            // eth -> token
            await tradeAndVerifyData(
                reserveInst,
                true, // is buy
                tokenInd,
                amountWei,
                user1, // recipient
                reserveInst.address, // wallet to hold src token
                walletForToken, // wallet to hold dest token
                false, // not using weth
                false // disable validate
            );

            // token -> eth
            let token = tokens[tokenInd];
            let amountTwei = new BN(25);

            // transfer and approve token to network
            await token.transfer(network, amountTwei);
            await token.approve(reserveInst.address, amountTwei, {from: network});

            await tradeAndVerifyData(
                reserveInst,
                false, // is buy = false
                tokenInd,
                amountTwei,
                user1, // recipient
                walletForToken, // wallet to hold src token
                reserveInst.address, // wallet to hold dest token
                false, // not using weth
                false // validate
            );
        });

        it("Test buy is reverted when walletForToken does not give allowance to reserve", async() => {
            let tokenInd = 2;
            let amountWei = new BN(200);

            currentBlock = await Helper.getCurrentBlock();
            let conversionRate = await reserveInst.getConversionRate(ethAddress, tokenAdd[tokenInd], amountWei, currentBlock);
            Helper.assertGreater(conversionRate, 0, "conversion rate should be > 0");

            await tokens[tokenInd].approve(reserveInst.address, 0, {from: walletForToken});

            currentBlock = await Helper.getCurrentBlock();
            conversionRate = await reserveInst.getConversionRate(ethAddress, tokenAdd[tokenInd], amountWei, currentBlock);

            Helper.assertEqual(0, conversionRate, "conversion rate should be 0");

            // fake conversion rate to 1
            conversionRate = precisionUnits;
            await expectRevert.unspecified(
                reserveInst.trade(ethAddress, amountWei, tokenAdd[tokenInd],
                    user1, conversionRate, true,
                    {
                        from: admin,
                        value: amountWei
                    }
                )
            )

            await tokens[tokenInd].approve(reserveInst.address, maxAllowance, {from: walletForToken});

            currentBlock = await Helper.getCurrentBlock();
            conversionRate = await reserveInst.getConversionRate(ethAddress, tokenAdd[tokenInd], amountWei, currentBlock);
            Helper.assertGreater(conversionRate, 0, "conversion rate should be > 0");
            let destQty = Helper.calcDstQty(amountWei, ethDecimals, tokenDecimals[tokenInd], conversionRate);

            await tokens[tokenInd].approve(reserveInst.address, 0, {from: walletForToken});
            // approve less than destQty
            await tokens[tokenInd].approve(reserveInst.address, destQty.sub(new BN(1)), {from: walletForToken});

            await expectRevert.unspecified(
                reserveInst.trade(ethAddress, amountWei, tokenAdd[tokenInd],
                    user1, conversionRate, true,
                    {
                        from: admin,
                        value: amountWei
                    }
                )
            )

            await tokens[tokenInd].approve(reserveInst.address, maxAllowance, {from: walletForToken});
        });

        it("Test buy is reverted when walletForToken does not have enough balance", async() => {
            let tokenInd = 2;
            let amountWei = new BN(200);

            currentBlock = await Helper.getCurrentBlock();
            let conversionRate = await reserveInst.getConversionRate(ethAddress, tokenAdd[tokenInd], amountWei, currentBlock);
            Helper.assertGreater(conversionRate, 0, "conversion rate should be > 0");
            let destQty = Helper.calcDstQty(amountWei, ethDecimals, tokenDecimals[tokenInd], conversionRate);

            let tokenBal = reserveTokenBalance[tokenInd];

            if (tokenBal.gt(destQty)) {
                // transfer tokens from wallet
                // wallet should have (destQty - 1) tokens
                let remainToken = destQty.sub(new BN(1));
                reserveTokenBalance[tokenInd] = remainToken;
                await tokens[tokenInd].transfer(accounts[0], tokenBal.sub(remainToken), {from: walletForToken});
            }

            await expectRevert.unspecified(
                reserveInst.trade(ethAddress, amountWei, tokenAdd[tokenInd],
                    user1, conversionRate, true,
                    {
                        from: admin,
                        value: amountWei
                    }
                )
            )

            // transfer token to reserve, buy should still fail
            await tokens[tokenInd].transfer(reserveInst.address, destQty);
            await expectRevert.unspecified(
                reserveInst.trade(ethAddress, amountWei, tokenAdd[tokenInd],
                    user1, conversionRate, true,
                    {
                        from: admin,
                        value: amountWei
                    }
                )
            )

            // transfer back tokens
            await tokens[tokenInd].transfer(walletForToken, tokenBal);
            reserveTokenBalance[tokenInd] = reserveTokenBalance[tokenInd].add(tokenBal);
        });

        it("Test sell is successful when walletForToken does not give allowance to reserve", async() => {
            let tokenInd = 2;
            let token = tokens[tokenInd];
            let amountTwei = new BN(30);

            // transfer and approve token to network
            await token.transfer(network, amountTwei);
            await token.approve(reserveInst.address, amountTwei, {from: network});

            await tradeAndVerifyData(
                reserveInst,
                false, // sell trade
                tokenInd,
                amountTwei,
                user1, // recipient
                walletForToken, // wallet to hold src token
                reserveInst.address, // wallet to hold dest token
                false, // not using weth
                true // validate
            );
        });

        it("Test sell is successful when walletForToken does not have tokens", async() => {
            let tokenInd = 2;
            let token = tokens[tokenInd];
            let amountTwei = new BN(30);

            // transfer and approve token to network
            await token.transfer(network, amountTwei);
            await token.approve(reserveInst.address, amountTwei, {from: network});

            let tokenBal = reserveTokenBalance[tokenInd];

            if (tokenBal.gt(zeroBN)) {
                // transfer tokens from wallet
                await tokens[tokenInd].transfer(accounts[0], tokenBal, {from: walletForToken});
                reserveTokenBalance[tokenInd] = zeroBN;
            }

            await tradeAndVerifyData(
                reserveInst,
                false, // sell trade
                tokenInd,
                amountTwei,
                user1, // recipient
                walletForToken, // wallet to hold src token
                reserveInst.address, // wallet to hold dest token
                false, // not using weth
                true // validate
            );

            // transfer back token
            if (tokenBal.gt(zeroBN)) {
                // transfer tokens from wallet
                await tokens[tokenInd].transfer(walletForToken, tokenBal);
                reserveTokenBalance[tokenInd] = tokenBal;
            }
        });
    });

    describe("#Test doTrade revert invalid params", async() => {
        before("set up contracts", async() => {
            //init conversion rate
            await setupConversionRatesContract(true);
            //init reserve
            await generalSetupReserveContract(false, false);
        });

        after("collect funds", async() => {
            await collectFundsAfterTests(reserveInst.address);
        });

        it("Test revert trade not enabled", async() => {
            // get rate before disabling
            let tokenInd = 3;
            let amountWei = new BN(100);
            let conversionRate = precisionUnits; // assume rate = 1:1

            // disable trade
            await reserveInst.disableTrade({from: alerter});
            await expectRevert(
                reserveInst.trade(ethAddress, amountWei, tokenAdd[tokenInd],
                    user1, conversionRate, true,
                    {
                        from: network,
                        value: amountWei
                    }
                ),
                "trade not enable"
            )
            // re-enable trade
            await reserveInst.enableTrade({from: admin});
        });

        it("Test revert sender not network", async() => {
            let tokenInd = 3;
            let amountWei = new BN(100);
            let conversionRate = precisionUnits; // assume rate = 1:1

            await expectRevert(
                reserveInst.trade(ethAddress, amountWei, tokenAdd[tokenInd],
                    user1, conversionRate, true,
                    {
                        from: admin,
                        value: amountWei
                    }
                ),
                "wrong sender"
            );
        });

        it("Test revert gas price > max gas price", async() => {
            let tokenInd = 3;
            let amountWei = new BN(100);
            let conversionRate = precisionUnits; // assume rate = 1:1

            let maxGasPrice = await reserveInst.maxGasPriceWei();

            await expectRevert(
                reserveInst.trade(ethAddress, amountWei, tokenAdd[tokenInd],
                    user1, conversionRate, true,
                    {
                        from: network,
                        value: amountWei,
                        gasPrice: maxGasPrice.add(new BN(1))
                    }
                ),
                "gas price too high"
            );
        });

        it("Test revert conversion rate 0", async() => {
            let tokenInd = 3;
            let amountWei = new BN(100);

            await expectRevert(
                reserveInst.trade(ethAddress, amountWei, tokenAdd[tokenInd],
                    user1, 0, true,
                    {
                        from: network,
                        value: amountWei,
                    }
                ),
                "rate is 0"
            );
        });

        it("Test revert wrong msg value for eth -> token trade", async() => {
            let tokenInd = 3;
            let amountWei = new BN(100);
            let conversionRate = precisionUnits; // assume rate = 1:1

            await expectRevert(
                reserveInst.trade(ethAddress, amountWei, tokenAdd[tokenInd],
                    user1, conversionRate, true,
                    {
                        from: network,
                        value: amountWei.add(new BN(1)),
                    }
                ),
                "wrong msg value"
            );

            await expectRevert(
                reserveInst.trade(ethAddress, amountWei, tokenAdd[tokenInd],
                    user1, conversionRate, true,
                    {
                        from: network,
                        value: amountWei.sub(new BN(1)),
                    }
                ),
                "wrong msg value"
            );
        });

        it("Test revert bad msg value for token -> eth trade", async() => {
            let tokenInd = 3;
            let amountTwei = new BN(1000);
            let conversionRate = precisionUnits; // assume rate = 1:1

            await expectRevert(
                reserveInst.trade(tokenAdd[tokenInd], amountTwei, ethAddress,
                    user1, conversionRate, true,
                    {
                        from: network,
                        value: new BN(1)
                    }
                ),
                "bad msg value"
            );
        });

        it("Test revert not enough balance", async() => {
            let tokenInd = 3;
            let amountTwei = new BN(1000);
            let conversionRate = precisionUnits; // assume rate = 1:1

            let balance = await tokens[tokenInd].balanceOf(network);
            if (balance.gt(zeroBN)) {
                // collect tokens from network
                await tokens[tokenInd].transfer(accounts[0], balance, {from: network});
            }
            // make enough allowance
            await tokens[tokenInd].approve(reserveInst.address, amountTwei, {from: network});

            await expectRevert.unspecified(
                reserveInst.trade(tokenAdd[tokenInd], amountTwei, ethAddress,
                    user1, conversionRate, true,
                    {
                        from: network,
                        value: 0
                    }
                )
            );
            await tokens[tokenInd].approve(reserveInst.address, 0, {from: network});

            // not enough eth, need to use try/catch here
            balance = await Helper.getBalancePromise(network);
            try {
                await reserveInst.trade(ethAddress, balance, tokenAdd[tokenInd],
                    user1, conversionRate, true,
                    {
                        from: network,
                        value: balance.add(new BN(1))
                    }
                );
                assert(false, "expected revert in line above");
            } catch (e) { }
        });

        it("Test revert not enough allowance", async() => {
            let tokenInd = 3;
            let amountTwei = new BN(1000);
            let conversionRate = precisionUnits; // assume rate = 1:1

            // transfer enough src token
            await tokens[tokenInd].transfer(network, amountTwei);
            // make not enough allowance
            await tokens[tokenInd].approve(reserveInst.address, 0, {from: network});
            await tokens[tokenInd].approve(reserveInst.address, amountTwei.sub(new BN(1)), {from: network});

            await expectRevert.unspecified(
                reserveInst.trade(tokenAdd[tokenInd], amountTwei, ethAddress,
                    user1, conversionRate, true,
                    {
                        from: network,
                        value: 0
                    }
                )
            );
            await tokens[tokenInd].approve(reserveInst.address, 0, {from: network});
        });

        it("Test revert dest amount is 0", async() => {
            let tokenInd = 3;
            let amountTwei = new BN(1000);
            let conversionRate = 0;

            // validate = false -> no validate again
            // conversion rate = 0 -> dest amount = 0
            await expectRevert(
                reserveInst.trade(tokenAdd[tokenInd], amountTwei, ethAddress,
                    user1, conversionRate, false,
                    {
                        from: network,
                        value: 0
                    }
                ),
                "dest amount is 0"
            );
        });
    });

    describe("#Test constructor", async() => {
        before("setup conversion rate", async() => {
            await setupConversionRatesContract(false);
        });

        it("Test revert network 0", async() => {
            await expectRevert(
                Reserve.new(zeroAddress, convRatesInst.address, weth.address, 0, admin),
                "kyberNetwork 0"
            )
        });

        it("Test revert conversion rate 0", async() => {
            await expectRevert(
                Reserve.new(network, zeroAddress, weth.address, 0, admin),
                "ratesContract 0"
            )
        });

        it("Test revert weth 0", async() => {
            await expectRevert(
                Reserve.new(network, convRatesInst.address, zeroAddress, 0, admin),
                "weth 0"
            )
        });

        it("Test revert admin 0", async() => {
            await expectRevert(
                Reserve.new(network, convRatesInst.address, weth.address, 0, zeroAddress),
                "admin 0"
            )
        });

        it("Test correct data set", async() => {
            let reserve = await Reserve.new(
                network,
                convRatesInst.address,
                weth.address,
                maxGasPrice,
                admin
            );
            Helper.assertEqual(await reserve.kyberNetwork(), network);
            Helper.assertEqual(await reserve.conversionRatesContract(), convRatesInst.address);
            Helper.assertEqual(await reserve.sanityRatesContract(), zeroAddress);
            Helper.assertEqual(await reserve.weth(), weth.address);
            Helper.assertEqual(await reserve.maxGasPriceWei(), maxGasPrice);
            Helper.assertEqual(await reserve.tradeEnabled(), true);
            Helper.assertEqual(await reserve.admin(), admin);
        })
    });

    describe("#Test enable/disable trade", async() => {
        let reserve;
        before("setup reserve", async() => {
            await setupConversionRatesContract(false);
            reserve = await Reserve.new(
                network,
                convRatesInst.address,
                weth.address,
                maxGasPrice,
                admin
            );
            await reserve.addAlerter(alerter, {from: admin});
        });

        it("Test revert: enable trade, not admin", async() => {
            await expectRevert(
                reserve.enableTrade({from: alerter}),
                "only admin"
            )
        });

        it("Test enable trade correct event and data", async() => {
            let result = await reserve.enableTrade({from: admin});
            await expectEvent(result, "TradeEnabled", {
                enable: true
            })
            Helper.assertEqual(await reserve.tradeEnabled(), true);
            // enable again
            result = await reserve.enableTrade({from: admin});
            await expectEvent(result, "TradeEnabled", {
                enable: true
            })
            Helper.assertEqual(await reserve.tradeEnabled(), true);
            // disable and reenable
            await reserve.disableTrade({from: alerter});
            Helper.assertEqual(await reserve.tradeEnabled(), false);
            result = await reserve.enableTrade({from: admin});
            await expectEvent(result, "TradeEnabled", {
                enable: true
            })
            Helper.assertEqual(await reserve.tradeEnabled(), true);
        });

        it("Test revert: disable trade, not alerter", async() => {
            await expectRevert(
                reserve.disableTrade({from: admin}),
                "only alerter"
            )
        });

        it("Test disable trade correct event and data", async() => {
            let result = await reserve.disableTrade({from: alerter});
            await expectEvent(result, "TradeEnabled", {
                enable: false
            })
            Helper.assertEqual(await reserve.tradeEnabled(), false);
            // enable again
            result = await reserve.disableTrade({from: alerter});
            await expectEvent(result, "TradeEnabled", {
                enable: false
            })
            Helper.assertEqual(await reserve.tradeEnabled(), false);
            // disable and reenable
            await reserve.enableTrade({from: admin});
            Helper.assertEqual(await reserve.tradeEnabled(), true);
            result = await reserve.disableTrade({from: alerter});
            await expectEvent(result, "TradeEnabled", {
                enable: false
            })
            Helper.assertEqual(await reserve.tradeEnabled(), false);
        });
    });

    describe("#Test max gas price", async() => {
        before("setup reserve", async() => {
        });

        it("Test revert set max gas price sender not operator", async() => {
        });

        it("Test set max gas price event", async() => {
        });

        it("Test max gas price after updated successfully", async() => {
        });
    });

    describe("#Test withdrawal", async() => {
        before("setup reserve", async() => {
        });

        it("Test revert approve withdrawl address sender not admin", async() => {
        });

        it("Test approve withdrawal address event", async() => {
        });

        it("Test approve withdrawal address data changes as expected", async() => {
        });

        it("Test revert withdraw sender not operator", async() => {
        });

        it("Test revert withdraw recipient is not approved", async() => {
        });

        describe("Test withdraw eth", async() => {
            it("Test withdraw eth success, balance changes", async() => {
            });

            it("Test withdraw address can not receive eth", async() => {
            });

            it("Test withdraw not enogh eth", async() => {
            });
        });

        describe("Test withdraw weth", async() => {
            it("Test withdraw eth success, balance changes", async() => {
            });

            it("Test withdraw address can not receive eth", async() => {
            });

            it("Test withdraw not enogh eth", async() => {
            });
        });

        describe("Test withdraw other tokens", async() => {
            it("Test withdraw eth success, balance changes", async() => {
            });

            it("Test withdraw address can not receive eth", async() => {
            });

            it("Test withdraw not enogh eth", async() => {
            });
        });
    });

    // it("trade when eth is in reserve, but has set weth wallet != reserve with 0 weth");
    // it("trade when eth is in reserve, but has set weth wallet != reserve");
    // it("trade when no eth, no weth set")
    // it("trade when no eth, has weth set, no weth bal")
    // it("trade when no eth, has weth set, has weth bal")
});

function getExtraBpsForImbalanceBuyQuantity(index, imbalance, qty) {
    return getExtraBpsForQuantity(imbalance, imbalance + qty, imbalanceBuyStepXs[index], imbalanceBuyStepY);
};

function getExtraBpsForImbalanceSellQuantity(index, imbalance, qty) {
    return getExtraBpsForQuantity(imbalance - qty, imbalance, imbalanceSellStepXs[index], imbalanceSellStepY);
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

function divSolidity(a, b) {
    let c = a / b;
    if (c < 0) { return Math.ceil(c); }
    return Math.floor(c);
}

// returns 1 token of decimals d
function tokenUnits(d) {
    return new BN(10).pow(new BN(d));
}
