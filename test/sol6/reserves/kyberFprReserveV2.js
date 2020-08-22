const ConversionRates = artifacts.require("MockEnhancedStepFunctions.sol");
const TestToken = artifacts.require("TestToken.sol");
const WethToken = artifacts.require("Weth9.sol");
const Reserve = artifacts.require("KyberFprReserveV2");
const SanityRates = artifacts.require("SanityRates");
const NoPayableFallback = artifacts.require("NoPayableFallback");

const Helper = require("../../helper.js");
const BN = web3.utils.BN;

//global variables
//////////////////
const {BPS, precisionUnits, ethDecimals, ethAddress, zeroAddress, 
    zeroBN, MAX_QTY, MAX_RATE, MAX_ALLOWANCE} = require("../../helper.js");
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

        currentBlock = await Helper.getCurrentBlock();
        weth = await WethToken.new("WrapETH", "WETH", 18);

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
            await weth.deposit({value: reserveEtherInit});
            await weth.transfer(tokenWallet, reserveEtherInit);

            await reserveInst.approveWithdrawAddress(weth.address, withdrawAddress, true, {from: admin});

            let balance = await weth.balanceOf(tokenWallet);
            expectedReserveBalanceWei = new BN(0);
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

        beforeEach("reset balance and allowance of network", async() => {
            for(let i = 0; i < numTokens; i++) {
                await tokens[i].approve(reserveInst.address, 0, {from: network});
                let tokenBal = await tokens[i].balanceOf(network);
                if (tokenBal.gt(zeroBN)) {
                    await tokens[i].transfer(accounts[0], tokenBal, {from: network});
                }
            }
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
                await tokens[i].approve(reserveInst.address, MAX_ALLOWANCE, {from: walletForToken});
            }
        });

        beforeEach("reset balance and allowance of network", async() => {
            for(let i = 0; i < numTokens; i++) {
                await tokens[i].approve(reserveInst.address, 0, {from: network});
                let tokenBal = await tokens[i].balanceOf(network);
                if (tokenBal.gt(zeroBN)) {
                    await tokens[i].transfer(accounts[0], tokenBal, {from: network});
                }
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

            let conversionRate = await reserveInst.getConversionRate(ethAddress, tokenAdd[tokenInd], amountWei, currentBlock);
            Helper.assertGreater(conversionRate, 0, "conversion rate should be > 0");

            await tokens[tokenInd].approve(reserveInst.address, 0, {from: walletForToken});

            conversionRate = await reserveInst.getConversionRate(ethAddress, tokenAdd[tokenInd], amountWei, currentBlock);

            Helper.assertEqual(0, conversionRate, "conversion rate should be 0");

            // fake conversion rate to 1
            conversionRate = precisionUnits;
            await expectRevert.unspecified(
                reserveInst.trade(ethAddress, amountWei, tokenAdd[tokenInd],
                    user1, conversionRate, true,
                    {
                        from: network,
                        value: amountWei
                    }
                )
            )

            await tokens[tokenInd].approve(reserveInst.address, MAX_ALLOWANCE, {from: walletForToken});

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
                        from: network,
                        value: amountWei
                    }
                )
            )

            await tokens[tokenInd].approve(reserveInst.address, MAX_ALLOWANCE, {from: walletForToken});
        });

        it("Test buy is reverted when walletForToken does not have enough balance", async() => {
            let tokenInd = 2;
            let amountWei = new BN(200);

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
                        from: network,
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
                        from: network,
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

    describe("#Test using weth", async() => {
        before("setup contracts", async() => {
            await setupConversionRatesContract(true);
            // using wallet for token, wallet for weth
            await generalSetupReserveContract(true, true);

            // approve
            await reserveInst.setTokenWallet(weth.address, walletForToken, {from: admin});
            await weth.approve(reserveInst.address, MAX_ALLOWANCE, {from: walletForToken});
            for(let i = 0; i < numTokens; i++) {
                await reserveInst.setTokenWallet(tokenAdd[i], walletForToken, {from: admin});
                await tokens[i].approve(reserveInst.address, MAX_ALLOWANCE, {from: walletForToken});
            }
        });

        beforeEach("reset balance and allowance of network", async() => {
            for(let i = 0; i < numTokens; i++) {
                await tokens[i].approve(reserveInst.address, 0, {from: network});
                let tokenBal = await tokens[i].balanceOf(network);
                if (tokenBal.gt(zeroBN)) {
                    await tokens[i].transfer(accounts[0], tokenBal, {from: network});
                }
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
                walletForToken, // wallet to hold src token
                walletForToken, // wallet to hold dest token
                true, // using weth
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
                    walletForToken, // address to hold src token
                    walletForToken, // address to hold dest token
                    true, // using weth
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
                walletForToken, // wallet to hold dest token
                true, // using weth
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
                    walletForToken, // address to hold dest token
                    true, // using weth
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
                walletForToken, // wallet to hold src token
                walletForToken, // wallet to hold dest token
                true, // using weth
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
                walletForToken, // wallet to hold dest token
                true, // using weth
                false // validate
            );
        });

        it("Test buy is successful when no weth balance or allowance", async() => {
            let tokenInd = 3;
            let amountWei = new BN(20);

            // set allowance to 0
            await weth.approve(reserveInst.address, 0, {from: walletForToken});

            await tradeAndVerifyData(
                reserveInst,
                true, // is buy
                tokenInd,
                amountWei,
                user1, // recipient
                walletForToken, // wallet to hold src token
                walletForToken, // wallet to hold dest token
                true, // using weth
                false // disable validate
            );

            // set back allowance to max
            await weth.approve(reserveInst.address, MAX_ALLOWANCE, {from: walletForToken});
            // withdraw all weth
            let wethBalance = expectedReserveBalanceWeth;
            if (wethBalance.gt(zeroBN)) {
                await weth.transfer(accounts[0], wethBalance, {from: walletForToken});
                expectedReserveBalanceWeth = new BN(0);
            }

            await tradeAndVerifyData(
                reserveInst,
                true, // is buy
                tokenInd,
                amountWei,
                user1, // recipient
                walletForToken, // wallet to hold src token
                walletForToken, // wallet to hold dest token
                true, // using weth
                false // disable validate
            );

            // transfer back weth
            if (wethBalance.gt(zeroBN)) {
                await weth.transfer(walletForToken, wethBalance, {from: accounts[0]});
                expectedReserveBalanceWeth = expectedReserveBalanceWeth.add(wethBalance);
            }
        });

        it("Test sell is reverted not enough allowance for weth", async() => {
            let tokenInd = 2;
            let token = tokens[tokenInd];
            let amountTwei = new BN(30);

            // transfer and approve token to network
            await token.transfer(network, amountTwei);
            await token.approve(reserveInst.address, amountTwei, {from: network});

            let conversionRate = await reserveInst.getConversionRate(tokenAdd[tokenInd], ethAddress, amountTwei, currentBlock);
            Helper.assertGreater(conversionRate, 0);
            let destQty = Helper.calcDstQty(amountTwei, tokenDecimals[tokenInd], ethDecimals, conversionRate);

            await weth.approve(reserveInst.address, 0, {from: walletForToken});
            await weth.approve(reserveInst.address, destQty.sub(new BN(1)), {from: walletForToken});

            await expectRevert.unspecified(
                reserveInst.trade(tokenAdd[tokenInd], amountTwei, ethAddress,
                    user1, conversionRate, true,
                    {
                        from: network
                    }
                )
            )

            await weth.approve(reserveInst.address, 0, {from: walletForToken});
            await weth.approve(reserveInst.address, destQty, {from: walletForToken});

            await tradeAndVerifyData(
                reserveInst,
                false, // is buy = false
                tokenInd,
                amountTwei,
                user1, // recipient
                walletForToken, // wallet to hold src token
                walletForToken, // wallet to hold dest token
                true, // using weth
                false // validate
            );

            await weth.approve(reserveInst.address, 0, {from: walletForToken});
            await weth.approve(reserveInst.address, MAX_ALLOWANCE, {from: walletForToken});
        });

        it("Test sell is reverted not enough weth balance", async() => {
            let tokenInd = 2;
            let token = tokens[tokenInd];
            let amountTwei = new BN(30);

            // transfer and approve token to network
            await token.transfer(network, amountTwei);
            await token.approve(reserveInst.address, amountTwei, {from: network});

            let conversionRate = await reserveInst.getConversionRate(tokenAdd[tokenInd], ethAddress, amountTwei, currentBlock);
            Helper.assertGreater(conversionRate, 0);
            let destQty = Helper.calcDstQty(amountTwei, tokenDecimals[tokenInd], ethDecimals, conversionRate);

            let wethBalance = expectedReserveBalanceWeth;
            if (wethBalance.gt(destQty)) {
                let remainToken = destQty.sub(new BN(1));
                expectedReserveBalanceWeth = remainToken;
                await weth.transfer(accounts[0], wethBalance.sub(remainToken), {from: walletForToken});
            }

            await expectRevert.unspecified(
                reserveInst.trade(tokenAdd[tokenInd], amountTwei, ethAddress,
                    user1, conversionRate, true,
                    {
                        from: network
                    }
                )
            )

            let newWethBalance = expectedReserveBalanceWeth;
            if (destQty.gt(newWethBalance)) {
                let addedAmount = destQty.sub(newWethBalance);
                expectedReserveBalanceWeth = expectedReserveBalanceWeth.add(addedAmount);
                await weth.transfer(walletForToken, addedAmount);
            }

            await tradeAndVerifyData(
                reserveInst,
                false, // is buy = false
                tokenInd,
                amountTwei,
                user1, // recipient
                walletForToken, // wallet to hold src token
                walletForToken, // wallet to hold dest token
                true, // using weth
                false // validate
            );

            // transfer more weth to wallet
            await weth.deposit({value: wethBalance});
            await weth.transfer(walletForToken, wethBalance);
            expectedReserveBalanceWeth = expectedReserveBalanceWeth.add(wethBalance);
        });

        it("Test sell is reverted, reserve has eth but reserve uses weth and does not enough weth", async() => {
            let tokenInd = 2;
            let token = tokens[tokenInd];
            let amountTwei = new BN(30);

            // transfer and approve token to network
            await token.transfer(network, amountTwei);
            await token.approve(reserveInst.address, amountTwei, {from: network});

            let conversionRate = await reserveInst.getConversionRate(tokenAdd[tokenInd], ethAddress, amountTwei, currentBlock);
            Helper.assertGreater(conversionRate, 0);
            let destQty = Helper.calcDstQty(amountTwei, tokenDecimals[tokenInd], ethDecimals, conversionRate);

            // transfer enough eth to reserve
            await Helper.sendEtherWithPromise(withdrawAddress, reserveInst.address, destQty);
            expectedReserveBalanceWei = expectedReserveBalanceWei.add(destQty);

            // approve less, expect to revert
            await weth.approve(reserveInst.address, 0, {from: walletForToken});
            await weth.approve(reserveInst.address, destQty.sub(new BN(1)), {from: walletForToken});

            await expectRevert.unspecified(
                reserveInst.trade(tokenAdd[tokenInd], amountTwei, ethAddress,
                    user1, conversionRate, true,
                    {
                        from: network
                    }
                )
            )

            // approve max again
            await weth.approve(reserveInst.address, 0, {from: walletForToken});
            await weth.approve(reserveInst.address, MAX_ALLOWANCE, {from: walletForToken});

            // withdraw some weth
            let wethBalance = expectedReserveBalanceWeth;
            if (wethBalance.gt(destQty)) {
                let remainToken = destQty.sub(new BN(1));
                expectedReserveBalanceWeth = remainToken;
                await weth.transfer(accounts[0], wethBalance.sub(remainToken), {from: walletForToken});
            }

            await expectRevert.unspecified(
                reserveInst.trade(tokenAdd[tokenInd], amountTwei, ethAddress,
                    user1, conversionRate, true,
                    {
                        from: network
                    }
                )
            )

            // transfer back weth
            if (wethBalance.gt(expectedReserveBalanceWeth)) {
                let amountToTransfer = wethBalance.sub(expectedReserveBalanceWeth);
                await weth.transfer(walletForToken, amountToTransfer, {from: accounts[0]});
                expectedReserveBalanceWeth = expectedReserveBalanceWeth.add(amountToTransfer);
            }

            // withdraw all eth
            await reserveInst.approveWithdrawAddress(ethAddress, withdrawAddress, {from: admin});
            await reserveInst.withdraw(ethAddress, expectedReserveBalanceWei, withdrawAddress, {from: operator});
            expectedReserveBalanceWei = new BN(0);
        });

        it("Test set weth token wallet to reserve address, should trade with eth", async() => {
            // either zero address or reserve's address, reserve should trade with eth
            let tokenWallets = [zeroAddress, reserveInst.address];
            for(let i = 0; i < 2; i++) {
                await reserveInst.setTokenWallet(weth.address, tokenWallets[i], {from: admin});
                // Test buy, eth goes to reserve
                let tokenInd = 2;
                let amountWei = new BN(200);

                await tradeAndVerifyData(
                    reserveInst,
                    true, // is buy = true
                    tokenInd,
                    amountWei,
                    user1, // recipient
                    reserveInst.address, // wallet to hold src token
                    walletForToken, // wallet to hold dest token
                    false, // using weth
                    false // validate
                );

                // withdraw all eth
                await reserveInst.withdraw(ethAddress, expectedReserveBalanceWei, withdrawAddress, {from: operator});
                expectedReserveBalanceWei = new BN(0);

                let amountTwei = new BN(100);
                let conversionRate = await reserveInst.getConversionRate(tokenAdd[tokenInd], ethAddress, amountTwei, currentBlock);
                // rate should be 0 as we haven't transferred eth to reserve yet
                Helper.assertEqual(conversionRate, 0);

                // transfer some eth to reserve
                await Helper.sendEtherWithPromise(withdrawAddress, reserveInst.address, precisionUnits);
                expectedReserveBalanceWei = expectedReserveBalanceWei.add(precisionUnits);
                conversionRate = await reserveInst.getConversionRate(tokenAdd[tokenInd], ethAddress, amountTwei, currentBlock);
                let destQty = Helper.calcDstQty(amountTwei, tokenDecimals[tokenInd], ethDecimals, conversionRate);
                // should have rate now
                Helper.assertGreater(conversionRate, 0);

                // transfer and approve token to network
                await tokens[tokenInd].transfer(network, amountTwei);
                await tokens[tokenInd].approve(reserveInst.address, amountTwei, {from: network});

                await tradeAndVerifyData(
                    reserveInst,
                    false, // is buy = false
                    tokenInd,
                    amountTwei,
                    user1, // recipient
                    walletForToken, // wallet to hold src token
                    reserveInst.address, // wallet to hold dest token
                    false, // using weth
                    false // validate
                );
            }
            // set back token wallet
            await reserveInst.setTokenWallet(weth.address, walletForToken, {from: admin});
        });

        it("Test set token wallet to reserve address, should trade as normal", async() => {
            // either zero address or reserve's address, reserve should trade with eth
            let tokenWallets = [zeroAddress, reserveInst.address];
            let tokenInd = 2;
            for(let i = 0; i < 2; i++) {
                await reserveInst.setTokenWallet(tokenAdd[tokenInd], tokenWallets[i], {from: admin});
                reserveTokenBalance[tokenInd] = await tokens[tokenInd].balanceOf(reserveInst.address);
                // test sell, should be successful without token in reserve
                let amountTwei = new BN(100);

                // transfer and approve token to network
                await tokens[tokenInd].transfer(network, amountTwei);
                await tokens[tokenInd].approve(reserveInst.address, amountTwei, {from: network});

                await tradeAndVerifyData(
                    reserveInst,
                    false, // is buy = false
                    tokenInd,
                    amountTwei,
                    user1, // recipient
                    reserveInst.address, // wallet to hold src token
                    walletForToken, // wallet to hold dest token
                    true, // using weth
                    false // validate
                );

                // withdraw all token
                await reserveInst.withdraw(tokenAdd[tokenInd], reserveTokenBalance[tokenInd], withdrawAddress, {from: operator});
                reserveTokenBalance[tokenInd] = new BN(0);
                // test buy
                let amountWei = new BN(200);

                // rate should be 0, as 0 token in reserve
                let conversionRate = await reserveInst.getConversionRate(ethAddress, tokenAdd[tokenInd], amountWei, currentBlock);
                Helper.assertEqual(conversionRate, 0);

                // transfer some token to reserve
                let amountToTransfer = new BN(tokenUnits(tokenDecimals[tokenInd])).mul(new BN(10000));
                reserveTokenBalance[tokenInd] = amountToTransfer;
                await tokens[tokenInd].transfer(reserveInst.address, amountToTransfer);

                await tradeAndVerifyData(
                    reserveInst,
                    true, // is buy = true
                    tokenInd,
                    amountWei,
                    user1, // recipient
                    walletForToken, // wallet to hold src token
                    reserveInst.address, // wallet to hold dest token
                    true, // using weth
                    false // validate
                );
            }
            // set back token wallet
            await reserveInst.setTokenWallet(tokenAdd[tokenInd], walletForToken, {from: admin});
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

            // trade success with max gas price
            await reserveInst.trade(ethAddress, amountWei, tokenAdd[tokenInd],
                user1, conversionRate, true,
                {
                    from: network,
                    value: amountWei,
                    gasPrice: maxGasPrice
                }
            )

            // set new lower max gas price
            let newMaxGasPrice = maxGasPrice.sub(new BN(1));
            await reserveInst.setMaxGasPrice(newMaxGasPrice, {from: operator});

            // trade revert with previous max gas price
            await expectRevert(
                reserveInst.trade(ethAddress, amountWei, tokenAdd[tokenInd],
                    user1, conversionRate, true,
                    {
                        from: network,
                        value: amountWei,
                        gasPrice: maxGasPrice
                    }
                ),
                "gas price too high"
            );
            await reserveInst.setMaxGasPrice(maxGasPrice, {from: operator});
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
        });
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
            await setupConversionRatesContract(false);
            reserve = await Reserve.new(
                network,
                convRatesInst.address,
                weth.address,
                maxGasPrice,
                admin
            );
            await reserve.addAlerter(alerter, {from: admin});
            await reserve.addOperator(operator, {from: admin});
        });

        it("Test revert set max gas price sender not operator", async() => {
            let newMaxGasWei = new BN(10 * 1000000000);
            await expectRevert(
                reserve.setMaxGasPrice(newMaxGasWei, {from: alerter}),
                "only operator"
            )
            await expectRevert(
                reserve.setMaxGasPrice(newMaxGasWei, {from: admin}),
                "only operator"
            )
            await reserve.setMaxGasPrice(newMaxGasWei, {from: operator});
            await reserve.setMaxGasPrice(maxGasPrice, {from: operator});
        });

        it("Test set max gas price event", async() => {
            let newMaxGasWei = new BN(10 * 1000000000);
            let tx = await reserve.setMaxGasPrice(newMaxGasWei, {from: operator});
            expectEvent(tx, "MaxGasPriceUpdated", {
                newMaxGasPrice: newMaxGasWei
            })
            tx = await reserve.setMaxGasPrice(maxGasPrice, {from: operator});
            expectEvent(tx, "MaxGasPriceUpdated", {
                newMaxGasPrice: maxGasPrice
            });
            // set the same value, still got event
            tx = await reserve.setMaxGasPrice(maxGasPrice, {from: operator});
            expectEvent(tx, "MaxGasPriceUpdated", {
                newMaxGasPrice: maxGasPrice
            })
        });

        it("Test max gas price after updated successfully", async() => {
            let newMaxGasWei = new BN(10 * 1000000000);
            await reserve.setMaxGasPrice(newMaxGasWei, {from: operator});
            Helper.assertEqual(newMaxGasWei, await reserve.maxGasPriceWei());
            await reserve.setMaxGasPrice(maxGasPrice, {from: operator});
            Helper.assertEqual(maxGasPrice, await reserve.maxGasPriceWei());
        });
    });

    describe("#Test set token wallet", async() => {
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
            await reserve.addOperator(operator, {from: admin});
        });

        it("Test set token wallet reverts not admin", async() => {
            let tokenAddresses = [ethAddress, weth.address, tokenAdd[1], tokenAdd[2]];
            for(let i = 0; i < tokenAddresses.length; i++) {
                await expectRevert(
                    reserve.setTokenWallet(tokenAddresses[i], withdrawAddress, {from: operator}),
                    "only admin"
                );

            }
        });

        it("Test set token wallet successful, data changes, event emits", async() => {
            let tokenAddresses = [ethAddress, weth.address, tokenAdd[1], tokenAdd[2]];
            let wallets = [withdrawAddress, reserve.address, zeroAddress];
            for(let i = 0; i < tokenAddresses.length; i++) {
                for(let j = 0; j < wallets.length; j++) {
                    let tx = await reserve.setTokenWallet(tokenAddresses[i], wallets[j], {from: admin});
                    expectEvent(tx, "NewTokenWallet", {
                        token: tokenAddresses[i],
                        wallet: wallets[j]
                    });
                    Helper.assertEqual(
                        wallets[j],
                        await reserve.tokenWallet(tokenAddresses[i]),
                        "wrong token wallet set"
                    )
                }
            }
        });
    });

    describe("#Test setContracts", async() => {
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
            await reserve.addOperator(operator, {from: admin});
        });

        it("Test setContracts reverts not admin", async() => {
            await expectRevert(
                reserve.setContracts(
                    network,
                    convRatesInst.address,
                    weth.address,
                    zeroAddress,
                    {from: operator}
                ),
                "only admin"
            )
        });

        it("Test setContracts reverts params are invalid", async() => {
            await expectRevert(
                reserve.setContracts(
                    zeroAddress,
                    convRatesInst.address,
                    weth.address,
                    zeroAddress,
                    {from: admin}
                ),
                "kyberNetwork 0"
            );
            await expectRevert(
                reserve.setContracts(
                    network,
                    zeroAddress,
                    weth.address,
                    zeroAddress,
                    {from: admin}
                ),
                "conversionRates 0"
            );
            await expectRevert(
                reserve.setContracts(
                    network,
                    convRatesInst.address,
                    zeroAddress,
                    zeroAddress,
                    {from: admin}
                ),
                "weth 0"
            );
            // can set with sanity rate zero
            await reserve.setContracts(
                network,
                convRatesInst.address,
                weth.address,
                zeroAddress,
                {from: admin}
            );
        });

        it("Test setContracts is successful, data changes, event emits", async() => {
            let tx = await reserve.setContracts(
                network,
                convRatesInst.address,
                weth.address,
                zeroAddress,
                {from: admin}
            );
            expectEvent(tx, "SetContractAddresses", {
                network: network,
                rate: convRatesInst.address,
                weth: weth.address,
                sanity: zeroAddress
            });
            Helper.assertEqual(network, await reserve.kyberNetwork());
            Helper.assertEqual(convRatesInst.address, await reserve.conversionRatesContract());
            Helper.assertEqual(weth.address, await reserve.weth());
            Helper.assertEqual(zeroAddress, await reserve.sanityRatesContract());
            tx = await reserve.setContracts(
                accounts[0],
                accounts[1],
                accounts[2],
                accounts[3],
                {from: admin}
            );
            expectEvent(tx, "SetContractAddresses", {
                network: accounts[0],
                rate: accounts[1],
                weth: accounts[2],
                sanity: accounts[3]
            });
            Helper.assertEqual(accounts[0], await reserve.kyberNetwork());
            Helper.assertEqual(accounts[1], await reserve.conversionRatesContract());
            Helper.assertEqual(accounts[2], await reserve.weth());
            Helper.assertEqual(accounts[3], await reserve.sanityRatesContract());
            await reserve.setContracts(
                network,
                convRatesInst.address,
                weth.address,
                zeroAddress,
                {from: admin}
            );
        });
    });

    describe("#Test getBalance", async() => {
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
            await reserve.addOperator(operator, {from: admin});
        });

        it("Test getBalance eth when using eth", async() => {
            let addresses = [zeroAddress, reserve.address];
            let reserveBalance = new BN(0);
            await reserve.approveWithdrawAddress(ethAddress, withdrawAddress, {from: admin});
            for(let i = 0; i < addresses.length; i++) {
                await reserve.setTokenWallet(weth.address, addresses[i], {from: admin});
                let amount = new BN(Helper.getRandomInt(10, 100));
                await Helper.sendEtherWithPromise(accounts[0], reserve.address, amount);
                reserveBalance = reserveBalance.add(amount);
                Helper.assertEqual(
                    reserveBalance,
                    await reserve.getBalance(ethAddress),
                    "eth balance is wrong"
                );
                // withdraw and check balance
                amount = new BN(Helper.getRandomInt(1, 10));
                await reserve.withdraw(ethAddress, amount, withdrawAddress, {from: operator});
                reserveBalance = reserveBalance.sub(amount);
                Helper.assertEqual(
                    reserveBalance,
                    await reserve.getBalance(ethAddress),
                    "eth balance is wrong"
                );
            }
        });

        it("Test getBalance eth when using weth", async() => {
            await reserve.setTokenWallet(weth.address, walletForToken, {from: admin});
            // send some eth to reserve, shouldn't affect result of getBalance
            await Helper.sendEtherWithPromise(accounts[0], reserve.address, new BN(1000));
            // reset allowance, check get balance is 0
            await weth.approve(reserve.address, 0, {from: walletForToken});
            await weth.deposit({from: walletForToken, value: new BN(10)});
            Helper.assertEqual(0, await reserve.getBalance(ethAddress));

            // approve less than balance
            await weth.approve(reserve.address, new BN(2), {from: walletForToken});
            Helper.assertEqual(new BN(2), await reserve.getBalance(ethAddress));

            // approve more than balance
            await weth.approve(reserve.address, 0, {from: walletForToken});
            await weth.approve(reserve.address, MAX_ALLOWANCE, {from: walletForToken});

            Helper.assertEqual(
                await weth.balanceOf(walletForToken),
                await reserve.getBalance(ethAddress)
            );
        });

        it("Test getBalance token when token is in reserve", async() => {
            let tokenInd = 1;
            let addresses = [zeroAddress, reserve.address];
            let reserveTokenBalance = new BN(0);
            await reserve.approveWithdrawAddress(tokenAdd[tokenInd], withdrawAddress, {from: admin});
            for(let i = 0; i < addresses.length; i++) {
                await reserve.setTokenWallet(tokenAdd[tokenInd], addresses[i], {from: admin});
                let amount = new BN(Helper.getRandomInt(10, 100));
                await tokens[tokenInd].transfer(reserve.address, amount);
                reserveTokenBalance = reserveTokenBalance.add(amount);
                Helper.assertEqual(
                    reserveTokenBalance,
                    await reserve.getBalance(tokenAdd[tokenInd]),
                    "token balance is wrong"
                );
                // withdraw and check balance
                amount = new BN(Helper.getRandomInt(1, 10));
                await reserve.withdraw(tokenAdd[tokenInd], amount, withdrawAddress, {from: operator});
                reserveTokenBalance = reserveTokenBalance.sub(amount);
                Helper.assertEqual(
                    reserveTokenBalance,
                    await reserve.getBalance(tokenAdd[tokenInd]),
                    "token balance is wrong"
                );
            }
        });

        it("Test getBalance when token is in walletForToken", async() => {
            let tokenInd = 1;
            let token = tokens[tokenInd];
            await reserve.setTokenWallet(tokenAdd[tokenInd], walletForToken, {from: admin});
            // transfer some token to reserve, shouldn't affect result
            await token.transfer(reserve.address, new BN(100));

            // reset allowance, check get balance is 0
            await token.approve(reserve.address, 0, {from: walletForToken});
            await token.transfer(walletForToken, new BN(10));
            Helper.assertEqual(0, await reserve.getBalance(tokenAdd[tokenInd]));

            // approve less than balance
            await token.approve(reserve.address, new BN(2), {from: walletForToken});
            Helper.assertEqual(new BN(2), await reserve.getBalance(tokenAdd[tokenInd]));

            // approve more than balance
            await token.approve(reserve.address, 0, {from: walletForToken});
            await token.approve(reserve.address, MAX_ALLOWANCE, {from: walletForToken});

            Helper.assertEqual(
                await token.balanceOf(walletForToken),
                await reserve.getBalance(tokenAdd[tokenInd])
            );

            // deposit more token to reserve, get balance shouldn't affect
            await token.transfer(reserve.address, new BN(100));
            Helper.assertEqual(
                await token.balanceOf(walletForToken),
                await reserve.getBalance(tokenAdd[tokenInd])
            );
        });
    });

    describe("#Test withdrawal", async() => {
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
            await reserve.addOperator(operator, {from: admin});
        });

        it("Test revert approve withdrawl address sender not admin", async() => {
            let tokenAddresses = [ethAddress, weth.address, tokenAdd[1], tokenAdd[3]];
            for(let i = 0; i < tokenAddresses.length; i++) {
                await expectRevert(
                    reserve.approveWithdrawAddress(tokenAddresses[i], withdrawAddress, false, {from: operator}),
                    "only admin"
                )
                await expectRevert(
                    reserve.approveWithdrawAddress(tokenAddresses[i], withdrawAddress, true, {from: operator}),
                    "only admin"
                )
            }
        });

        it("Test approve withdrawal address event", async() => {
            let tokenAddresses = [ethAddress, weth.address, tokenAdd[1], tokenAdd[3]];
            for(let i = 0; i < tokenAddresses.length; i++) {
                let tx = await reserve.approveWithdrawAddress(tokenAddresses[i], withdrawAddress, false, {from: admin});
                expectEvent(tx, "WithdrawAddressApproved", {
                    token: tokenAddresses[i],
                    addr: withdrawAddress,
                    approve: false
                })
                tx = await reserve.approveWithdrawAddress(tokenAddresses[i], withdrawAddress, true, {from: admin});
                expectEvent(tx, "WithdrawAddressApproved", {
                    token: tokenAddresses[i],
                    addr: withdrawAddress,
                    approve: true
                })
            }
        });

        it("Test approve withdrawal address data changes as expected", async() => {
            let tokenAddresses = [ethAddress, weth.address, tokenAdd[1], tokenAdd[3]];
            let addresses = [accounts[0], withdrawAddress, accounts[3]];
            for(let i = 0; i < tokenAddresses.length; i++) {
                for(let j = 0; j < addresses.length; j++) {
                    await reserve.approveWithdrawAddress(tokenAddresses[i], addresses[j], true, {from: admin});
                    let approve = await reserve.isAddressApprovedForWithdrawal(tokenAddresses[i], addresses[j]);
                    Helper.assertEqual(true, approve);
                    // reset approval
                    await reserve.approveWithdrawAddress(tokenAddresses[i], addresses[j], false, {from: admin});
                    approve = await reserve.isAddressApprovedForWithdrawal(tokenAddresses[i], addresses[j]);
                    Helper.assertEqual(false, approve);
                }
            }
        });

        it("Test revert withdraw sender not operator", async() => {
            await reserve.approveWithdrawAddress(ethAddress, withdrawAddress, true, {from: admin});
            await Helper.sendEtherWithPromise(accounts[0], reserve.address, precisionUnits);
            await expectRevert(
                reserve.withdraw(ethAddress, precisionUnits, withdrawAddress, {from: admin}),
                "only operator"
            );
            // can withdraw eth with operator
            await reserve.withdraw(ethAddress, precisionUnits, withdrawAddress, {from: operator});

            // check token
            let tokenInd = 1;
            await reserve.approveWithdrawAddress(tokenAdd[tokenInd], withdrawAddress, true, {from: admin});
            let tokenAmount = tokenUnits(tokenDecimals[tokenInd]);
            await tokens[tokenInd].transfer(reserve.address, tokenAmount);
            await expectRevert(
                reserve.withdraw(tokenAdd[tokenInd], tokenAmount, withdrawAddress, {from: admin}),
                "only operator"
            );
            // can withdraw token with operator
            await reserve.withdraw(tokenAdd[tokenInd], tokenAmount, withdrawAddress, {from: operator});
        });

        it("Test revert withdraw recipient is not approved", async() => {
            await reserve.approveWithdrawAddress(ethAddress, withdrawAddress, false, {from: admin});
            await Helper.sendEtherWithPromise(accounts[0], reserve.address, precisionUnits);
            await expectRevert(
                reserve.withdraw(ethAddress, precisionUnits, withdrawAddress, {from: operator}),
                "destination is not approved"
            );
            let tokenInd = 1;
            await reserve.approveWithdrawAddress(tokenAdd[tokenInd], withdrawAddress, false, {from: admin});
            let tokenAmount = tokenUnits(tokenDecimals[tokenInd]);
            await tokens[tokenInd].transfer(reserve.address, tokenAmount);
            await expectRevert(
                reserve.withdraw(tokenAdd[tokenInd], tokenAmount, withdrawAddress, {from: operator}),
                "destination is not approved"
            );
        });

        describe("Test withdraw eth", async() => {
            before("approve withdrawl address", async() => {
                await reserve.approveWithdrawAddress(ethAddress, withdrawAddress, true, {from: admin});
                await Helper.sendEtherWithPromise(accounts[0], reserve.address, precisionUnits);
            });

            it("Test withdraw eth success, balance changes", async() => {
                let withdrawlAddressBal = await Helper.getBalancePromise(withdrawAddress);
                let reserveEthBal = await Helper.getBalancePromise(reserve.address);

                // withdraw
                await reserve.withdraw(ethAddress, precisionUnits, withdrawAddress, {from: operator});

                withdrawlAddressBal = withdrawlAddressBal.add(precisionUnits);
                reserveEthBal = reserveEthBal.sub(precisionUnits);
                Helper.assertEqual(
                    withdrawlAddressBal,
                    await Helper.getBalancePromise(withdrawAddress),
                    "wrong eth bal for withdrawl address"
                );
                Helper.assertEqual(
                    reserveEthBal,
                    await Helper.getBalancePromise(reserve.address),
                    "wrong eth bal for reserve"
                );
            });

            it("Test withdraw eth event", async() => {
                await Helper.sendEtherWithPromise(withdrawAddress, reserve.address, precisionUnits);
                // withdraw
                let tx = await reserve.withdraw(ethAddress, precisionUnits, withdrawAddress, {from: operator});

                expectEvent(tx, "WithdrawFunds", {
                    token: ethAddress,
                    amount: precisionUnits,
                    destination: withdrawAddress
                });
            });

            it("Test withdraw address can not receive eth", async() => {
                let contract = await NoPayableFallback.new();
                await reserve.approveWithdrawAddress(ethAddress, contract.address, true, {from: admin});
                // transfer some eth to reserve
                await Helper.sendEtherWithPromise(accounts[0], reserve.address, precisionUnits);
                // withdraw should fail, contract doesn't allow to receive eth
                await expectRevert(
                    reserve.withdraw(ethAddress, precisionUnits, contract.address, {from: operator}),
                    "transfer back eth failed"
                );
                let anotherReserve = await Reserve.new(
                    network,
                    convRatesInst.address,
                    weth.address,
                    maxGasPrice,
                    admin
                );
                // approve, withdraw and verify balance
                let withdrawAmount = new BN(100);
                await reserve.approveWithdrawAddress(ethAddress, anotherReserve.address, true, {from: admin});
                await reserve.withdraw(ethAddress, withdrawAmount, anotherReserve.address, {from: operator});
                Helper.assertEqual(withdrawAmount, await Helper.getBalancePromise(anotherReserve.address));
                // send all eth back to accounts
                await reserve.approveWithdrawAddress(ethAddress, accounts[0], true, {from: admin});
                reserve.withdraw(ethAddress, precisionUnits.sub(withdrawAmount), accounts[0], {from: operator});
            });

            it("Test withdraw not enough eth", async() => {
                let reserveEthBal = await Helper.getBalancePromise(reserve.address);
                await expectRevert.unspecified(
                    reserve.withdraw(ethAddress, reserveEthBal.add(new BN(1)), withdrawAddress, {from: operator})
                )
            });

            it("Test set token wallet for eth, should withdraw reserve's eth", async() => {
                await reserve.setTokenWallet(ethAddress, walletForToken, {from: admin});
                let withdrawlAddressBal = await Helper.getBalancePromise(withdrawAddress);
                let reserveEthBal = await Helper.getBalancePromise(reserve.address);
                // withdraw
                await reserve.withdraw(ethAddress, precisionUnits, withdrawAddress, {from: operator});

                withdrawlAddressBal = withdrawlAddressBal.add(precisionUnits);
                reserveEthBal = reserveEthBal.sub(precisionUnits);

                Helper.assertEqual(
                    withdrawlAddressBal,
                    await Helper.getBalancePromise(withdrawAddress),
                    "wrong eth bal for withdrawl address"
                );
                Helper.assertEqual(
                    reserveEthBal,
                    await Helper.getBalancePromise(reserve.address),
                    "wrong eth bal for reserve"
                );
            });
        });

        describe("Test withdraw weth or token", async() => {
            before("approve withdrawl address", async() => {
                await reserve.approveWithdrawAddress(weth.address, withdrawAddress, true, {from: admin});
                for(let i = 0; i < numTokens; i++) {
                    await reserve.approveWithdrawAddress(tokenAdd[i], withdrawAddress, true, {from: admin});
                }
            });

            it("Test set token wallet to 0x0 or reserve, withdraw token success, balance changes, event emits", async() => {
                let tokenWallets = [zeroAddress, reserve.address];
                let tokenList = [weth, tokens[1], tokens[3]];

                for(let i = 0; i < tokenList.length; i++) {
                    for(let j = 0; j < tokenWallets.length; j++) {
                        await reserve.setTokenWallet(tokenList[i].address, tokenWallets[j], {from: admin});

                        let amount = new BN(10).pow(new BN(await tokenList[i].decimals()));
                        // transfer token to reserve
                        if (tokenList[i] == weth) {
                            // need to deposit to get weth first
                            await weth.deposit({value: amount});
                        }
                        await tokenList[i].transfer(reserve.address, amount);

                        let walletBal = await tokenList[i].balanceOf(withdrawAddress);
                        let reserveBal = await tokenList[i].balanceOf(reserve.address);

                        let tx = await reserve.withdraw(tokenList[i].address, amount, withdrawAddress, {from: operator});
                        expectEvent(tx, "WithdrawFunds", {
                            token: tokenList[i].address,
                            amount: amount,
                            destination: withdrawAddress
                        });

                        walletBal = walletBal.add(amount);
                        reserveBal = reserveBal.sub(amount);

                        Helper.assertEqual(
                            walletBal,
                            await tokenList[i].balanceOf(withdrawAddress),
                            "wrong token bal for withdrawl address"
                        );
                        Helper.assertEqual(
                            reserveBal,
                            await tokenList[i].balanceOf(reserve.address),
                            "wrong token bal for reserve"
                        );
                    }
                }
            });

            it("Test set token wallet to wallet address, withdraw token success, balance changes", async() => {
                let tokenList = [weth, tokens[1], tokens[3]];
                for(let i = 0; i < tokenList.length; i++) {
                    await reserve.setTokenWallet(tokenList[i].address, walletForToken, {from: admin});
                    let amount = new BN(10).pow(new BN(await tokenList[i].decimals()));
                    // init 1 token to wallet
                    if (tokenList[i] == weth) {
                        await weth.deposit({from: walletForToken, value: amount});
                    } else {
                        await tokenList[i].transfer(walletForToken, amount);
                    }
                    // approve allowance
                    await tokenList[i].approve(reserve.address, amount, {from: walletForToken});

                    let walletBal = await tokenList[i].balanceOf(withdrawAddress);
                    let reserveBal = await tokenList[i].balanceOf(walletForToken);

                    await reserve.withdraw(tokenList[i].address, amount, withdrawAddress, {from: operator});

                    walletBal = walletBal.add(amount);
                    reserveBal = reserveBal.sub(amount);

                    Helper.assertEqual(
                        walletBal,
                        await tokenList[i].balanceOf(withdrawAddress),
                        "wrong token bal for withdrawl address"
                    );
                    Helper.assertEqual(
                        reserveBal,
                        await tokenList[i].balanceOf(walletForToken),
                        "wrong token bal for walletForToken"
                    );
                }
            });

            it("Test withdraw should revert, not enough balance or allowance", async() => {
                let tokenList = [weth, tokens[1], tokens[3]];
                for(let i = 0; i < tokenList.length; i++) {
                    // amount of token to deposit to reserve
                    // test 2 scenarios: no token in reserve, or have enough token in reserve
                    let tokenAmount = tokenUnits(await tokenList[i].decimals());
                    let depositedAmounts = [zeroBN, tokenAmount];
                    let withdrawalAmount = tokenAmount;
                    await reserve.setTokenWallet(tokenList[i].address, walletForToken, {from: admin});

                    for(let i = 0; i < depositedAmounts.length; i++) {
                        // transfer token to reserve if needed
                        if (depositedAmounts[i].gt(zeroBN)) {
                            if (tokenList[i] == weth) {
                                // need to get some weth first
                                await weth.deposit({value: depositedAmounts[i]});
                            }
                            // transfer token to reserve
                            await tokenList[i].transfer(reserve.address, depositedAmounts[i]);
                        }

                        // make sure not enough allowance
                        await tokenList[i].approve(reserve.address, 0, {from: walletForToken});
                        await tokenList[i].approve(reserve.address, withdrawalAmount.sub(new BN(1)), {from: walletForToken});

                        // deposit enough token to walletForToken
                        if (tokenList[i] == weth) {
                            await weth.deposit({value: withdrawalAmount, from: walletForToken});
                        } else {
                            await tokenList[i].transfer(walletForToken, withdrawalAmount);
                        }

                        // withdraw should revert, not enough allowance
                        await expectRevert.unspecified(
                            reserve.withdraw(tokenList[i].address, withdrawalAmount, withdrawAddress, {from: operator})
                        );

                        // make sure enough allowance
                        await tokenList[i].approve(reserve.address, 0, {from: walletForToken});
                        await tokenList[i].approve(reserve.address, withdrawalAmount, {from: walletForToken});

                        // withdraw token to make sure not enough balance
                        let tokenBalance = await tokenList[i].balanceOf(walletForToken);
                        // leave only (withdrawalAmount - 1) token in wallet
                        let remainTokenAmount = withdrawalAmount.sub(new BN(1));
                        if (tokenBalance.gt(remainTokenAmount)) {
                            if (tokenList[i] == weth) {
                                // withdraw weth
                                await weth.withdraw(tokenBalance.sub(remainTokenAmount), {from: walletForToken});
                            } else {
                                await tokenList[i].transfer(accounts[0], tokenBalance.sub(remainTokenAmount), {from: walletForToken});
                            }
                        }
                        // withdraw should revert, enough allowance but not enough balance
                        await expectRevert.unspecified(
                            reserve.withdraw(tokenList[i].address, withdrawalAmount, withdrawAddress, {from: operator})
                        );
                    }
                }
            });
        });
    });
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
