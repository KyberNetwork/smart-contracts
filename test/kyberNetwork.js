let ConversionRates = artifacts.require("./ConversionRates.sol");
let TestToken = artifacts.require("./mockContracts/TestToken.sol");
let Reserve = artifacts.require("./KyberReserve.sol");
let Network = artifacts.require("./KyberNetwork.sol");
let WhiteList = artifacts.require("./WhiteList.sol");
let ExpectedRate = artifacts.require("./ExpectedRate.sol");
let FeeBurner = artifacts.require("./FeeBurner.sol");

let Helper = require("./helper.js");
let BigNumber = require('bignumber.js');

//global variables
//////////////////
let precisionUnits = (new BigNumber(10).pow(18));
let ethAddress = '0x00eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
let gasPrice = (new BigNumber(10).pow(9).mul(50));
let negligibleRateDiff = 15;

//balances
let expectedReserve1BalanceWei = 0;
let expectedReserve2BalanceWei = 0;
let reserve1TokenBalance = [];
let reserve2TokenBalance = [];
let reserve1TokenImbalance = [];
let reserve2TokenImbalance = [];

//permission groups
let admin;
let operator;
let alerter;
let sanityRates;
let user1;
let user2;
let walletId;

//contracts
let pricing1;
let pricing2;
let reserve1;
let reserve2;
let whiteList;
let expectedRate;
let network;
let feeBurner;

//block data
let priceUpdateBlock;
let currentBlock;
let validRateDurationInBlocks = 5000;

//tokens data
////////////
let numTokens = 4;
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
let baseBuyRate1 = [];
let baseBuyRate2 = [];
let baseSellRate1 = [];
let baseSellRate2 = [];

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

contract('KyberNetwork', function(accounts) {
    it("should init globals. init 2 ConversionRates Inst, init tokens and add to pricing inst. set basic data per token.", async function () {
        // set account addresses
        admin = accounts[0];
        operator = accounts[1];
        alerter = accounts[2];
        user1 = accounts[4];
        user2 = accounts[5];
        walletId = accounts[6];

        currentBlock = priceUpdateBlock = await Helper.getCurrentBlock();

//        console.log("current block: " + currentBlock);
        //init contracts
        pricing1 = await ConversionRates.new(admin, {});
        pricing2 = await ConversionRates.new(admin, {});

        //set pricing general parameters
        await pricing1.setValidRateDurationInBlocks(validRateDurationInBlocks);
        await pricing2.setValidRateDurationInBlocks(validRateDurationInBlocks);

        //create and add token addresses...
        for (let i = 0; i < numTokens; ++i) {
            token = await TestToken.new("test" + i, "tst" + i, 18);
            tokens[i] = token;
            tokenAdd[i] = token.address;
            await pricing1.addToken(token.address);
            await pricing1.setTokenControlInfo(token.address, minimalRecordResolution, maxPerBlockImbalance, maxTotalImbalance);
            await pricing1.enableTokenTrade(token.address);
            await pricing2.addToken(token.address);
            await pricing2.setTokenControlInfo(token.address, minimalRecordResolution, maxPerBlockImbalance, maxTotalImbalance);
            await pricing2.enableTokenTrade(token.address);
        }

        assert.equal(tokens.length, numTokens, "bad number tokens");

        let result = await pricing1.addOperator(operator);
        result = await pricing2.addOperator(operator);
        //        console.log(result.logs[0].args);
    });

    it("should set base rates + compact data rate factor + step function. for all tokens.", async function () {
        //buy is ether to token rate. sale is token to ether rate. so sell == 1 / buy. assuming we have no spread.
        let tokensPerEther;
        let ethersPerToken;

        for (i = 0; i < numTokens; ++i) {
            tokensPerEther = (new BigNumber(precisionUnits.mul((i + 1) * 3)).floor());
            ethersPerToken = (new BigNumber(precisionUnits.div((i + 1) * 3)).floor());
            baseBuyRate1.push(tokensPerEther.valueOf());
            baseBuyRate2.push(tokensPerEther.valueOf() * 10100 / 10000);
            baseSellRate1.push(ethersPerToken.valueOf());
            baseSellRate2.push(ethersPerToken.valueOf()  * 10000 / 10300);
        }

        assert.equal(baseBuyRate1.length, tokens.length);
        assert.equal(baseBuyRate2.length, tokens.length);
        assert.equal(baseSellRate1.length, tokens.length);
        assert.equal(baseSellRate2.length, tokens.length);

        buys.length = sells.length = indices.length = 0;

        await pricing1.setBaseRate(tokenAdd, baseBuyRate1, baseSellRate1, buys, sells, currentBlock, indices, {from: operator});
        await pricing2.setBaseRate(tokenAdd, baseBuyRate2, baseSellRate2, buys, sells, currentBlock, indices, {from: operator});

        //set compact data
        compactBuyArr = [0, 0, 0, 0, 0, 06, 07, 08, 09, 10, 11, 12, 13, 14];
        let compactBuyHex = Helper.bytesToHex(compactBuyArr);
        buys.push(compactBuyHex);

        compactSellArr = [0, 0, 0, 0, 0, 26, 27, 28, 29, 30, 31, 32, 33, 34];
        let compactSellHex = Helper.bytesToHex(compactSellArr);
        sells.push(compactSellHex);

        indices[0] = 0;

        assert.equal(indices.length, sells.length, "bad sells array size");
        assert.equal(indices.length, buys.length, "bad buys array size");

        await pricing1.setCompactData(buys, sells, currentBlock, indices, {from: operator});
        await pricing2.setCompactData(buys, sells, currentBlock, indices, {from: operator});

        //all start with same step functions.
        for (let i = 0; i < numTokens; ++i) {
            await pricing1.setQtyStepFunction(tokenAdd[i], qtyBuyStepX, qtyBuyStepY, qtySellStepX, qtySellStepY, {from:operator});
            await pricing2.setQtyStepFunction(tokenAdd[i], qtyBuyStepX, qtyBuyStepY, qtySellStepX, qtySellStepY, {from:operator});
            await pricing1.setImbalanceStepFunction(tokenAdd[i], imbalanceBuyStepX, imbalanceBuyStepY, imbalanceSellStepX, imbalanceSellStepY, {from:operator});
            await pricing2.setImbalanceStepFunction(tokenAdd[i], imbalanceBuyStepX, imbalanceBuyStepY, imbalanceSellStepX, imbalanceSellStepY, {from:operator});
        }
    });

    it("should init network and 2 reserves and set all reserve data including balances", async function () {
        network = await Network.new(admin);
        await network.addOperator(operator);
        reserve1 = await Reserve.new(network.address, pricing1.address, admin);
        reserve2 = await Reserve.new(network.address, pricing2.address, admin);
        await pricing1.setReserveAddress(reserve1.address);
        await pricing2.setReserveAddress(reserve2.address);
        await reserve1.addAlerter(alerter);
        await reserve2.addAlerter(alerter);

        //set reserve balance. 10000 wei ether + per token 1000 wei ether value according to base rate.
        let reserveEtherInit = 5000 * 2;
        await Helper.sendEtherWithPromise(accounts[8], reserve1.address, reserveEtherInit);
        await Helper.sendEtherWithPromise(accounts[8], reserve2.address, reserveEtherInit);

        let balance = await Helper.getBalancePromise(reserve1.address);
        expectedReserve1BalanceWei = balance.valueOf();
        assert.equal(balance.valueOf(), reserveEtherInit, "wrong ether balance");
        balance = await Helper.getBalancePromise(reserve2.address);
        expectedReserve2BalanceWei = balance.valueOf();
        assert.equal(balance.valueOf(), reserveEtherInit, "wrong ether balance");

        //transfer tokens to reserve. each token same wei balance
        for (let i = 0; i < numTokens; ++i) {
            token = tokens[i];
            let amount1 = (new BigNumber(reserveEtherInit)).div(precisionUnits).mul(baseBuyRate1[i]).floor();
            await token.transfer(reserve1.address, amount1.valueOf());
            let amount2 = (new BigNumber(reserveEtherInit)).div(precisionUnits).mul(baseBuyRate2[i]).floor();
            await token.transfer(reserve2.address, amount2.valueOf());
            let balance = await token.balanceOf(reserve1.address);
            assert.equal(amount1.valueOf(), balance.valueOf());
            reserve1TokenBalance.push(amount1);
            reserve2TokenBalance.push(amount2);
            reserve1TokenImbalance.push(0);
            reserve2TokenImbalance.push(0);
        }
    });

    it("should init kyber network data, list token pairs.", async function () {
        // add reserves
        await network.addReserve(reserve1.address, true);
        await network.addReserve(reserve2.address, true);

        //set contracts
        feeBurner = await FeeBurner.new(admin, tokenAdd[0], network.address);
        let kgtToken = await TestToken.new("kyber genesis token", "KGT", 0);
        whiteList = await WhiteList.new(admin, kgtToken.address);
        await whiteList.addOperator(operator);
        await whiteList.setCategoryCap(0, 1000, {from:operator});
        await whiteList.setSgdToEthRate(30000, {from:operator});

        expectedRate = await ExpectedRate.new(network.address, admin);
        await network.setParams(whiteList.address, expectedRate.address, feeBurner.address, gasPrice.valueOf(), negligibleRateDiff);
        await network.setEnable(true);
        let price = await network.maxGasPrice();
        assert.equal(price.valueOf(), gasPrice.valueOf());

        //list tokens per reserve
        for (let i = 0; i < numTokens; i++) {
            await network.listPairForReserve(reserve1.address, ethAddress, tokenAdd[i], true);
            await network.listPairForReserve(reserve1.address, tokenAdd[i], ethAddress, true);
            await network.listPairForReserve(reserve2.address, ethAddress, tokenAdd[i], true);
            await network.listPairForReserve(reserve2.address, tokenAdd[i], ethAddress, true);
        }
    });

    it("should disable 1 reserve. perform buy and check: balances changed as expected.", async function () {
        let tokenInd = 1;
        let token = tokens[tokenInd]; //choose some token
        let amountWei = 4 * 1;

        //disable reserve 1
        await reserve1.disableTrade({from:alerter});
        try {
            //verify base rate
            let buyRate = await network.getExpectedRate(ethAddress, tokenAdd[tokenInd], amountWei);
            let expectedRate = (new BigNumber(baseBuyRate2[tokenInd]));
            let dstQty = (new BigNumber(amountWei).mul(baseBuyRate2[tokenInd])).div(precisionUnits).floor();
            let extraBps = getExtraBpsForBuyQuantity(dstQty);
            expectedRate = addBps(expectedRate, extraBps);
            //let extraBps = getExtraBpsForImbalanceBuyQuantity(dstQty);
            //expectedRate = addBps(expectedRate, extraBps);

            //check correct rate calculated
            assert.equal(buyRate[0].valueOf(), expectedRate.valueOf(), "unexpected rate.");

            //perform trade
            await network.trade(ethAddress, amountWei, tokenAdd[tokenInd], user2, 100, buyRate[1].valueOf(), walletId, {from:user1, value:amountWei});

            //check higher ether balance on reserve
            expectedReserve2BalanceWei = (expectedReserve2BalanceWei * 1) + amountWei;
            expectedReserve2BalanceWei -= expectedReserve2BalanceWei % 1;
            let balance = await Helper.getBalancePromise(reserve2.address);
            assert.equal(balance.valueOf(), expectedReserve2BalanceWei, "bad reserve balance wei");

            //check token balances
            ///////////////////////

            //check token balance on user2
            let tokenTweiBalance = await token.balanceOf(user2);
            let expectedTweiAmount = expectedRate.mul(amountWei).div(precisionUnits).floor();
            assert.equal(tokenTweiBalance.valueOf(), expectedTweiAmount.valueOf(), "bad token balance");

            //check lower token balance on reserve
            //below is true since all tokens and ether have same decimals (18)
            reserve2TokenBalance[tokenInd] -= expectedTweiAmount;
            reserve2TokenImbalance[tokenInd] += (expectedTweiAmount * 1); //imbalance represents how many missing tokens
            let reportedBalance = await token.balanceOf(reserve2.address);
            assert.equal(reportedBalance.valueOf(), reserve2TokenBalance[tokenInd].valueOf(), "bad token balance on reserve");
            //enable reserve trade
            await reserve1.enableTrade({from:admin});
        } catch (e) {
            //enable reserve trade
            await reserve1.enableTrade({from:admin});
            console.log("oooops " + e);
            throw e;
        }
        await reserve1.enableTrade({from:admin});
    });

    it("perform buy with reserve rate diff > negligibleDiff. make sure buy from correct reserve.", async function () {
        let tokenInd = 2;
        let token = tokens[tokenInd]; //choose some token
        let amountWei = 35 * 1;

        //compare reserve buy rates for token
        let buyRate1 = await reserve1.getConversionRate(ethAddress, tokenAdd[tokenInd], amountWei, currentBlock + 10);
        let buyRate2 = await reserve2.getConversionRate(ethAddress, tokenAdd[tokenInd], amountWei, currentBlock + 10);

        let negligibleDiff = 1 * (await network.negligibleRateDiff());

        //make sure reserve 2 has higher buy rate > negligibleDiff
        if ((buyRate2 * 10000 / (10000 + negligibleDiff) <= buyRate1)) {
            assert(false, "buy rate reserve 2 not bigger by negligibleDiff: " + (negligibleDiff / 10000));
        }

        //perform trade
        await network.trade(ethAddress, amountWei, tokenAdd[tokenInd], user1, 800, buyRate2, walletId, {from:user1, value:amountWei});

        //check higher ether balance on reserve 2
        expectedReserve2BalanceWei = (expectedReserve2BalanceWei * 1) + amountWei;

        let balance = await Helper.getBalancePromise(reserve2.address);
        assert.equal(balance.valueOf(), expectedReserve2BalanceWei, "bad reserve balance wei");

        //check token balances
        ///////////////////////

        //check token balance on user1
        let tokenTweiBalance = await token.balanceOf(user1);
        let expectedTweiAmount = (new BigNumber(buyRate2)).mul(amountWei).div(precisionUnits).floor();
        assert.equal(tokenTweiBalance.valueOf(), expectedTweiAmount.valueOf(), "bad token balance");

        //check lower token balance on reserve
        //below is true since all tokens and ether have same decimals (18)
        reserve2TokenBalance[tokenInd] -= expectedTweiAmount;
        reserve2TokenImbalance[tokenInd] += (expectedTweiAmount * 1); //imbalance represents how many missing tokens
        let reportedBalance = await token.balanceOf(reserve2.address);
        assert.equal(reportedBalance.valueOf(), reserve2TokenBalance[tokenInd].valueOf(), "bad token balance on reserve");
    });

    it("should set reserve sell rate diff > negligibleDiff. perform sell and make sure done on expected reserve.", async function () {
        let tokenInd = 0;
        let token = tokens[tokenInd]; //choose some token
        let amountTwei = 35 * 1;

        //compare reserve sell rates for token
        let sellRate1 = await reserve1.getConversionRate(tokenAdd[tokenInd], ethAddress, amountTwei, currentBlock + 10);
        let sellRate2 = await reserve2.getConversionRate(tokenAdd[tokenInd], ethAddress, amountTwei, currentBlock + 10);
        let negligibleDiff = 1 * (await network.negligibleRateDiff());

        //make sure reserve 1 has higher sell rate > negligibleDiff
        let sellRate1MinEps = sellRate1 * 10000 / (10000 * 1 + negligibleDiff * 1);
        if (sellRate1MinEps <= sellRate2) {
            assert(false, "rate too small. rate1: " + sellRate1 + " rate1minEps " + sellRate1MinEps + " rate2 " + sellRate2);
        }

        // transfer funds to user and approve funds to network
        await token.transfer(user1, amountTwei);
        await token.approve(network.address, amountTwei, {from:user1})


        //perform trade
        let rates = await network.getExpectedRate(tokenAdd[tokenInd], ethAddress, amountTwei);
        let destAmount = await network.trade(tokenAdd[tokenInd], amountTwei, ethAddress, user2, 3000, sellRate1, walletId, {from:user1, value:0});

        //check lower ether balance on reserve 1
        let expectedWeiAmount = (new BigNumber(sellRate1)).mul(amountTwei).div(precisionUnits).floor();
        expectedReserve1BalanceWei = (expectedReserve1BalanceWei * 1) - (expectedWeiAmount * 1);
        expectedReserve1BalanceWei -= expectedReserve1BalanceWei % 1;
        let balance = await Helper.getBalancePromise(reserve1.address);
        assert.equal(balance.valueOf(), expectedReserve1BalanceWei, "bad reserve balance wei");

        //check token balances
        ///////////////////////

        //check token balance on user1
        let tokenTweiBalance = await token.balanceOf(user1);

        assert.equal(tokenTweiBalance.valueOf(), 0, "bad token balance");

        //check higher token balance on reserve
        //below is true since all tokens and ether have same decimals (18)
        reserve1TokenBalance[tokenInd] = (reserve1TokenBalance[tokenInd] * 1) + (amountTwei * 1);
        let reportedBalance = await token.balanceOf(reserve1.address);
        assert.equal(reportedBalance.valueOf(), reserve1TokenBalance[tokenInd].valueOf(), "bad token balance on reserve");
    });

    it("should test low 'max dest amount' on sell. make sure it reduces source amount.", async function () {
        let tokenInd = 0;
        let token = tokens[tokenInd]; //choose some token
        let amountTwei = 100 * 1;
        let maxDestAmountLow = 3;
        let maxDestAmountHigh = 3000;

        let rates = await network.getExpectedRate(tokenAdd[tokenInd], ethAddress, amountTwei);
        let minRate = rates[0].valueOf();

        // transfer funds to user and approve funds to network
        await token.transfer(user1, amountTwei);
        await token.approve(network.address, amountTwei, {from:user1})

        //perform full amount trade. see token balance on user 1 zero
        let destAmount = await network.trade(tokenAdd[tokenInd], amountTwei, ethAddress, user2, maxDestAmountHigh, minRate, walletId, {from:user1});

        //check token balance on user1 is zero
        let tokenTweiBalance = await token.balanceOf(user1);
        assert.equal(tokenTweiBalance.valueOf(), 0, "bad token balance");

        // transfer funds to user and approve funds to network
        await token.transfer(user1, amountTwei);
        await token.approve(network.address, amountTwei, {from:user1})

        //user2 initial balance
        let user2InitBalance = await Helper.getBalancePromise(user2);

        //perform blocked amount trade. see token balance on user 1 zero
        destAmount = await network.trade(tokenAdd[tokenInd], amountTwei, ethAddress, user2, maxDestAmountLow, minRate, walletId, {from:user1});

        //check used ethers as expected.
        let userPostBalance = await Helper.getBalancePromise(user2);

//        console.log("init user balance: " + user2InitBalance + " post balance: " + userPostBalance + " diff " + userPostBalance*1 - user2InitBalance*1);

        //check token balance on user1
        tokenTweiBalance = await token.balanceOf(user1);
        assert(tokenTweiBalance.valueOf() > 0, "bad token balance");
    });


    it("should test low 'max dest amount' on buy. make sure it reduces source amount.", async function () {
        let tokenInd = 0;
        let token = tokens[tokenInd]; //choose some token
        let amountWei = 8 * 1;
        let maxDestAmountLow = 15;
        let maxDestAmountHigh = 3000;

        let rates = await network.getExpectedRate(ethAddress, tokenAdd[tokenInd], amountWei);
        let minRate = rates[0].valueOf();

        let initialTokBalUser2 = token.balanceOf(user2);

        //perform full amount trade. see full token balance on user 2
        await network.trade(ethAddress, amountWei, tokenAdd[tokenInd], user2, maxDestAmountHigh, minRate, walletId, {from:user1, value:amountWei});

        let postTokenBalUser2 = await token.balanceOf(user2);

        let actualTradedTokens1 = postTokenBalUser2.valueOf()*1 - initialTokBalUser2.valueOf()*1;

        //perform limited amount trade
        await network.trade(ethAddress, amountWei, tokenAdd[tokenInd], user2, maxDestAmountLow, minRate, walletId, {from:user1, value:amountWei});

        let post2ndTokenBalUser2 = await token.balanceOf(user2);

        let actualTradedTokens2 = post2ndTokenBalUser2.valueOf()*1 - postTokenBalUser2.valueOf()*1;

        assert.equal((post2ndTokenBalUser2.valueOf()*1 - postTokenBalUser2.valueOf()*1), maxDestAmountLow, "unexpected token balance");
        assert.equal(actualTradedTokens2*1, maxDestAmountLow, "unexpected token balance");
    });

    it("should set reserve rate diff < negligibleDiff (negligible diff) perform 20 buys in loop. make sure buys from both reserves.", async function () {
        let tokenInd = 3;
        let token = tokens[tokenInd]; //choose some token
        let amountWei = 10;

        //compare reserve buy rates for token
        let buyRate1 = await reserve1.getConversionRate(ethAddress, tokenAdd[tokenInd], amountWei, currentBlock + 10);
        let buyRate2 = await reserve2.getConversionRate(ethAddress, tokenAdd[tokenInd], amountWei, currentBlock + 10);

        let negligibleDiff = 400; // 400 / 10000 = 4%
        await network.setParams(whiteList.address, expectedRate.address, feeBurner.address, gasPrice.valueOf(), negligibleDiff);

        //make sure reserve 2 has lower buy rate that is smaller then negligibleDiff
        if ((buyRate2 * 10000 / (10000 + negligibleDiff) > buyRate1)) {
            assert(false, "buy rate reserve 2 not smaller by negligibleDiff: " + (negligibleDiff / 10000));
        }

        //take initial balance from both reserves
        let tokPreBalance1 = await token.balanceOf(reserve1.address);
        let tokPreBalance2 = await token.balanceOf(reserve2.address);
        let ethPreBalance1 = await Helper.getBalancePromise(reserve1.address);
        let ethPreBalance2 = await Helper.getBalancePromise(reserve2.address);

        //perform 20 trades
        let minRate = 0;
        let maxDestAmount = 2000;
        for (let i = 0; i < 20; i++){
            await network.trade(ethAddress, amountWei, tokenAdd[tokenInd], user2, maxDestAmount, minRate, walletId, {from:user1, value:amountWei});
        }

        //again take balance from both reserves
        let tokPostBalance1 = await token.balanceOf(reserve1.address);
        let tokPostBalance2 = await token.balanceOf(reserve2.address);
        let ethPostBalance1 = await Helper.getBalancePromise(reserve1.address);
        let ethPostBalance2 = await Helper.getBalancePromise(reserve2.address);

        //check higher ether balance on both
        assert(ethPostBalance2*1 > ethPreBalance2*1, "expected more ether here.");
        assert(ethPostBalance1*1 > ethPreBalance1*1, "expected more ether here.");

        //check lower token balance on both
        assert(tokPostBalance1 < tokPreBalance1, "expected more token here.");
        assert(tokPostBalance2 < tokPreBalance2, "expected more token here.");

        await network.setParams(whiteList.address, expectedRate.address, feeBurner.address, gasPrice.valueOf(), negligibleRateDiff);
    });

    it("should set reserve rate diff < negligibleDiff perform 20 sells in loop. make sure sells from both reserves.", async function () {
        let tokenInd = 3;
        let token = tokens[tokenInd]; //choose some token
        let amountTWei = 60;
        let numLoops = 20;

        // transfer funds to user and approve funds to network
        await token.transfer(user1, amountTWei*numLoops);
        await token.approve(network.address, amountTWei*numLoops, {from:user1})

        //compare reserve sell rates for token
        let sellRate1 = await reserve1.getConversionRate(tokenAdd[tokenInd], ethAddress, amountTWei, currentBlock + 10);
        let sellRate2 = await reserve2.getConversionRate(tokenAdd[tokenInd], ethAddress, amountTWei, currentBlock + 10);

        let negligibleDiff = 500; // 500 / 10000 = 5%
        await network.setParams(whiteList.address, expectedRate.address, feeBurner.address, gasPrice.valueOf(), negligibleDiff);

        //make sure reserve 1 has higher sell rate < negligibleDiff
        let sellRate1MinEps = sellRate1 * 10000 / (10000 * 1 + negligibleDiff * 1);
        if (sellRate1MinEps > sellRate2) {
            assert(false, "rate too small. rate1: " + sellRate1 + " rate1minEps " + sellRate1MinEps + " rate2 " + sellRate2);
        }

        //take initial balance from both reserves
        let tokPreBalance1 = await token.balanceOf(reserve1.address);
        let tokPreBalance2 = await token.balanceOf(reserve2.address);
        let ethPreBalance1 = await Helper.getBalancePromise(reserve1.address);
        let ethPreBalance2 = await Helper.getBalancePromise(reserve2.address);

        //perform 20 trades
        let minRate = 0;
        let maxDestAmount = 900;
        for (let i = 0; i < numLoops; i++){
            await network.trade(tokenAdd[tokenInd], amountTWei, ethAddress, user2, maxDestAmount, minRate, walletId, {from:user1});
        }

        //again take balance from both reserves
        let tokPostBalance1 = await token.balanceOf(reserve1.address);
        let tokPostBalance2 = await token.balanceOf(reserve2.address);
        let ethPostBalance1 = await Helper.getBalancePromise(reserve1.address);
        let ethPostBalance2 = await Helper.getBalancePromise(reserve2.address);

        //check lower eth balance on both
        assert(ethPostBalance2*1 < ethPreBalance2*1, "expected more ether here.");
        assert(ethPostBalance1*1 < ethPreBalance1*1, "expected more ether here.");


        //check higher token balance on both
        assert(tokPostBalance1*1 > tokPreBalance1*1, "expected more token here.");
        assert(tokPostBalance2*1 > tokPreBalance2*1, "expected more token here.");

        await network.setParams(whiteList.address, expectedRate.address, feeBurner.address, gasPrice.valueOf(), negligibleRateDiff);
    });

    it("should verify trade reverted when network disabled.", async function () {
        let tokenInd = 0;
        let token = tokens[tokenInd]; //choose some token
        let amountWei = 4 * 1;
        let minConversionRate = 0;

        //disable trade
        await network.setEnable(false);

        //perform trade
        try {
             await network.trade(ethAddress, amountWei, tokenAdd[tokenInd], user2, 2000,
                minConversionRate, walletId, {from:user1, value:amountWei});
             assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //enable trade
        await network.setEnable(true);

        await network.trade(ethAddress, amountWei, tokenAdd[tokenInd], user2, 2000,
                minConversionRate, walletId, {from:user1, value:amountWei});
    });

    it("should verify buy reverted when bad ether amount is sent.", async function () {
        let tokenInd = 0;
        let token = tokens[tokenInd]; //choose some token
        let amountWei = 4 * 1;
        let minConversionRate = 0;

        //perform trade
        try {
             await network.trade(ethAddress, amountWei, tokenAdd[tokenInd], user2, 2000,
                minConversionRate, walletId, {from:user1, value:amountWei*1-1});
             assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        await network.trade(ethAddress, amountWei, tokenAdd[tokenInd], user2, 2000,
                minConversionRate, walletId, {from:user1, value:amountWei});
    });

    it("should verify sell reverted when no token allowance.", async function () {
        let tokenInd = 1;
        let token = tokens[tokenInd]; //choose some token
        let amountTWei = 15*1;

        // transfer funds to user and approve funds to network
        await token.transfer(user1, amountTWei*1-1);
        await token.approve(network.address, amountTWei*1-1, {from:user1})

        try {
            await network.trade(tokenAdd[tokenInd], amountTWei.valueOf(), ethAddress, user2, 5000, 0, walletId, {from:user1});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //add missing allowance
        await token.transfer(user1, amountTWei*1);
        await token.approve(network.address, amountTWei*1, {from:user1});

        //perform same trade
        await network.trade(tokenAdd[tokenInd], amountTWei.valueOf(), ethAddress, user2, 5000, 0, walletId, {from:user1});
    });

    it("should verify sell reverted when sent with ether value.", async function () {
        let tokenInd = 1;
        let token = tokens[tokenInd]; //choose some token
        let amountTWei = 15*1;

        // transfer funds to user and approve funds to network
        await token.transfer(user1, amountTWei*1);
        await token.approve(network.address, amountTWei*1, {from:user1})

        try {
            await network.trade(tokenAdd[tokenInd], amountTWei.valueOf(), ethAddress, user2, 5000, 0, walletId, {from:user1, value: 10});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }   

        //perform same trade
        await network.trade(tokenAdd[tokenInd], amountTWei.valueOf(), ethAddress, user2, 5000, 0, walletId, {from:user1, value: 0});
    });


    it("should verify trade reverted when dest amount (actual amount) is 0.", async function () {
        let tokenInd = 2;
        let token = tokens[tokenInd]; //choose some token
        let amountTweiLow = 1 * 1;
        let amountTWeiHi = 80 * 1;

        // transfer funds to user and approve funds to network
        await token.transfer(user1, amountTWeiHi);
        await token.approve(network.address, amountTWeiHi, {from:user1})

        let sellRate1 = await reserve1.getConversionRate(tokenAdd[tokenInd], ethAddress, amountTweiLow, currentBlock + 10);

        //try with low amount Twei
        try {
            await network.trade(tokenAdd[tokenInd], amountTweiLow, ethAddress, user2, 3000, sellRate1, walletId, {from:user1});
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //perform same trade with higher value to see success
        let destAmount = await network.trade(tokenAdd[tokenInd], amountTWeiHi, ethAddress, user2, 3000, sellRate1, walletId, {from:user1});
    });

    it("should verify buy reverted when unlisting pair.", async function () {
        let tokenInd = 0;
        let token = tokens[tokenInd]; //choose some token
        let amountWei = 4 * 1;
        let minConversionRate = 0;

        //unlist and verify trade reverted.
        await network.listPairForReserve(reserve1.address, ethAddress, tokenAdd[tokenInd], false);
        await network.listPairForReserve(reserve2.address, ethAddress, tokenAdd[tokenInd], false);

        //perform trade
        try {
             await network.trade(ethAddress, amountWei, tokenAdd[tokenInd], user2, 2000,
                minConversionRate, walletId, {from:user1, value:amountWei});
             assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //list back
        await network.listPairForReserve(reserve1.address, ethAddress, tokenAdd[tokenInd], true);
        await network.listPairForReserve(reserve2.address, ethAddress, tokenAdd[tokenInd], true);

        await network.trade(ethAddress, amountWei, tokenAdd[tokenInd], user2, 2000,
                minConversionRate, walletId, {from:user1, value:amountWei});
    });

    it("should verify sell reverted when unlisting pair.", async function () {
        let tokenInd = 1;
        let token = tokens[tokenInd]; //choose some token
        let amountTWei = 30* 1;
        let minConversionRate = 0;
        let maxDestAmount = 1000;

        // transfer funds to user and approve funds to network
        await token.transfer(user1, amountTWei*2);
        await token.approve(network.address, amountTWei*2, {from:user1});

        //unlist and verify trade reverted.
        await network.listPairForReserve(reserve1.address, tokenAdd[tokenInd], ethAddress, false);
        await network.listPairForReserve(reserve2.address, tokenAdd[tokenInd], ethAddress, false);

        //perform trade
        try {
             await network.trade(tokenAdd[tokenInd], amountTWei, ethAddress, user2, maxDestAmount,
                minConversionRate, walletId, {from:user1});
             assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //list back
        await network.listPairForReserve(reserve1.address, tokenAdd[tokenInd], ethAddress, true);
        await network.listPairForReserve(reserve2.address, tokenAdd[tokenInd], ethAddress, true);

        await network.trade(tokenAdd[tokenInd], amountTWei, ethAddress, user2, maxDestAmount,
            minConversionRate, walletId, {from:user1});
    });


    it("should verify trade reverted when gas price above set max.", async function () {
        let tokenInd = 0;
        let token = tokens[tokenInd]; //choose some token
        let amountWei = 4 * 1;
        let minConversionRate = 0;
        let maxPrice = await network.maxGasPrice();
        let highGas = maxPrice * 2;

        //perform trade
        try {
             await network.trade(ethAddress, amountWei, tokenAdd[tokenInd], user2, 2000,
                minConversionRate, walletId, {from:user1, value:amountWei, gasPrice: highGas});
             assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //see trade success with good gas price
        await network.trade(ethAddress, amountWei, tokenAdd[tokenInd], user2, 2000,
                  minConversionRate, walletId, {from:user1, value:amountWei, gasPrice: maxPrice});
    });


    it("should verify trade when ether amount above user cap in white list.", async function () {
        let tokenInd = 0;
        let token = tokens[tokenInd]; //choose some token
        let amountWei = 1000 * 1;
        let minConversionRate = 0;

        //set low cap for category cap for user 2
        await whiteList.setUserCategory(user2, 2, {from: operator});
        await whiteList.setCategoryCap(2, 1, {from:operator}); //1 sgd

        //set low wei to sgd rate.
        await whiteList.setSgdToEthRate(10, {from: operator});

        //perform trade
        try {
             await network.trade(ethAddress, amountWei, tokenAdd[tokenInd], user2, 2000,
                minConversionRate, walletId, {from:user2, value:amountWei});
             assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //set normal wei to sgd rate.
        await whiteList.setSgdToEthRate(30000, {from: operator});
        await whiteList.setCategoryCap(2, 100, {from:operator}); //1 sgd

        //see trade success with good gas price
        await network.trade(ethAddress, amountWei, tokenAdd[tokenInd], user2, 2000,
                  minConversionRate, walletId, {from:user2, value:amountWei});
    });
    it("should verify trade reverted src amount > max src amount (10**28).", async function () {
        let tokenInd = 2;
        let token = tokens[tokenInd]; //choose some token
        let amountTWei = new BigNumber(10).pow(28);

        // transfer funds to user and approve funds to network - for all trades in this 'it'
        await token.transfer(user1, amountTWei);
        await token.approve(network.address, amountTWei, {from:user1})

        //more ether to reserve
        await Helper.sendEtherWithPromise(accounts[7], reserve1.address, 11050000000000000000);

        //set high imbalance values - to avoid block trade due to total imbalance per block
        let highImbalance = amountTWei.mul(4).valueOf();
        await pricing1.setTokenControlInfo(token.address, new BigNumber(10).pow(14), highImbalance, highImbalance);
        //set large category cap for user 1
        await whiteList.setUserCategory(user1, 1, {from: operator});
        await whiteList.setCategoryCap(1, amountTWei.mul(2).valueOf(), {from:operator});

        //MODIFY RATE
        tokensPerEther = (new BigNumber(precisionUnits.mul(1000000000)).floor());
        ethersPerToken = (new BigNumber(precisionUnits.div(1000000000)).floor());
        baseBuyRate1[tokenInd] = tokensPerEther.valueOf();
        baseSellRate1[tokenInd] = ethersPerToken.valueOf();
        buys.length = sells.length = indices.length = 0;
        await pricing1.setBaseRate(tokenAdd, baseBuyRate1, baseSellRate1, buys, sells, currentBlock, indices, {from: operator});

        try {
            await network.trade(tokenAdd[tokenInd], amountTWei.valueOf(), ethAddress, user2, amountTWei.valueOf(), 0, walletId, {from:user1});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //see same trade performed when value is 1 less
        await network.trade(tokenAdd[tokenInd], amountTWei.sub(1).valueOf(), ethAddress,
                user2, amountTWei.valueOf(), 0, walletId, {from:user1});
    });

    it("should verify trade reverted when rate below min rate.", async function () {
        let tokenInd = 1;
        let token = tokens[tokenInd]; //choose some token
        let amountTWei = 35*1;

        // transfer funds to user and approve funds to network - for all trades in this 'it'
        await token.transfer(user1, amountTWei);
        await token.approve(network.address, amountTWei, {from:user1})

        let rates = await network.getExpectedRate(tokenAdd[tokenInd], ethAddress, amountTWei);
        let minConvRate = rates[0].valueOf();
        let minSetRate = minConvRate*2;
        try {
            await network.trade(tokenAdd[tokenInd], amountTWei.valueOf(), ethAddress, user2, amountTWei.valueOf(), minSetRate, walletId, {from:user1});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //same trade with zero min rate
        await network.trade(tokenAdd[tokenInd], amountTWei.valueOf(), ethAddress, user2, amountTWei.valueOf(), 0, walletId, {from:user1});
    });

    it("should verify trade reverted when rate above max rate.", async function () {
        let tokenInd = 1;
        let token = tokens[tokenInd]; //choose some token
        let amountTWei = 35*1;

        // transfer funds to user and approve funds to network - for all trades in this 'it'
        await token.transfer(user1, amountTWei);
        await token.approve(network.address, amountTWei, {from:user1})

        let maxRate = (new BigNumber(10).pow(24)).valueOf();
        //modify rate
        baseSellRate1[tokenInd] = maxRate;
        baseSellRate2[tokenInd] = maxRate;

        buys.length = sells.length = indices.length = 0;

        await pricing1.setBaseRate(tokenAdd, baseBuyRate1, baseSellRate1, buys, sells, currentBlock, indices, {from: operator});
        await pricing2.setBaseRate(tokenAdd, baseBuyRate2, baseSellRate2, buys, sells, currentBlock, indices, {from: operator});

        try {
            await network.trade(tokenAdd[tokenInd], amountTWei, ethAddress, user2, 5000, 0, walletId, {from:user1});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //modify rate back to normal
        tokensPerEther = (new BigNumber(precisionUnits.mul((tokenInd + 1) * 3)).floor());
        baseSellRate1[tokenInd] = tokensPerEther.valueOf();
        baseSellRate2[tokenInd] = tokensPerEther.valueOf();

        buys.length = sells.length = indices.length = 0;

        await pricing1.setBaseRate(tokenAdd, baseBuyRate1, baseSellRate1, buys, sells, currentBlock, indices, {from: operator});
        await pricing2.setBaseRate(tokenAdd, baseBuyRate2, baseSellRate2, buys, sells, currentBlock, indices, {from: operator});

        //see same trade performed when normal rate
        await network.trade(tokenAdd[tokenInd], amountTWei, ethAddress,
                user2, amountTWei.valueOf(), 0, walletId, {from:user1});
    });

    it("should verify trade reverted when dest address 0.", async function () {
        let tokenInd = 0;
        let token = tokens[tokenInd]; //choose some token
        let amountWei = 4 * 1;
        let minConversionRate = 0;

        //perform trade
        try {
             await network.trade(ethAddress, amountWei, tokenAdd[tokenInd], 0, 2000, minConversionRate, walletId, {from:user1, value:amountWei});
             assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //see same trade performed with valid value
        await network.trade(ethAddress, amountWei, tokenAdd[tokenInd], user2, 2000, minConversionRate, walletId, {from:user1, value:amountWei});
    });

    it("should get reserve list and verify addresses.", async function () {
        let reserves = await network.getReserves();

        assert.equal(reserves.length, 2, "unexpected number of reserves.");

        assert.equal(reserves[0].valueOf(), reserve1.address, "unexpected reserve address.");
        assert.equal(reserves[1].valueOf(), reserve2.address, "unexpected reserve address.");
    });

    it("should verify same reserve can't be added twice.", async function () {
        let numRes = await network.getNumReserves();

        assert.equal(numRes.valueOf(), 2, "unexpected number of reserves.");

        //try adding existing reserve
        try {
            await network.addReserve(reserve1.address, true);
            assert(false, "throw was expected in line above.");
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        // remove reserves and see same add success.
        await network.addReserve(reserve1.address, false);

        await network.addReserve(reserve1.address, true);
    });

    it("should remove reserves and verify reserve array length is 0.", async function () {
        let numRes = await network.getNumReserves();

        assert.equal(numRes.valueOf(), 2, "unexpected number of reserves.");

        // remove reserves
        await network.addReserve(reserve1.address, false);
        await network.addReserve(reserve2.address, false);

        numRes = await network.getNumReserves();

        assert.equal(numRes.valueOf(), 0, "unexpected number of reserves.");

        await network.addReserve(reserve1.address, true);
        await network.addReserve(reserve2.address, true);
    });

    it("should test can't init this contract with empty contracts (address 0).", async function () {
        let networkTemp;

        try {
            networkTemp = await Network.new(0);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        networkTemp = await Network.new(admin);

        try {
            await networkTemp.setParams(0, expectedRate.address, feeBurner.address, gasPrice.valueOf(), negligibleRateDiff);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await networkTemp.setParams(whiteList.address, 0, feeBurner.address, gasPrice.valueOf(), negligibleRateDiff);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await networkTemp.setParams(whiteList.address, expectedRate.address, 0, gasPrice.valueOf(), negligibleRateDiff);
            assert(false, "throw was expected in line above.")
        } catch(e){
           assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //verify can't enable without set contracts
        try {
            await networkTemp.setEnable(true);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        await networkTemp.setParams(whiteList.address, expectedRate.address, feeBurner.address, gasPrice.valueOf(), negligibleRateDiff);
        await networkTemp.setEnable(true);
    });

    it("should verify can't reverts when negligible rate diff > 10000.", async function () {
        let legalNegRateDiff = 100 * 100;
        let illegalNegRateDiff = (100 * 100) + 1;
        let currentNegRateDiff = await network.negligibleRateDiff();

        try {
            await network.setParams(whiteList.address, expectedRate.address, feeBurner.address, gasPrice.valueOf(), illegalNegRateDiff);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        await network.setParams(whiteList.address, expectedRate.address, feeBurner.address, gasPrice.valueOf(), legalNegRateDiff);
        let negDiff = await network.negligibleRateDiff();

        assert.equal(negDiff, legalNegRateDiff);
        await network.setParams(whiteList.address, expectedRate.address, feeBurner.address, gasPrice.valueOf(), currentNegRateDiff);
    });


    it("should verify get expected rate reverts when rates contracts not set (address 0).", async function () {
        let networkTemp;
        let amountTwei = 30;

        networkTemp = await Network.new(admin);

        try {
            await networkTemp.getExpectedRate(tokenAdd[2], ethAddress, amountTwei);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //set expected rate and see no throw
        await networkTemp.setParams(whiteList.address, expectedRate.address, feeBurner.address, gasPrice.valueOf(), negligibleRateDiff);
        await networkTemp.getExpectedRate(tokenAdd[2], ethAddress, amountTwei);
    });

    it("should use setInfo (UI info) and check value is set.", async function () {
        let info = 15;
        let field = 10;

        await network.setInfo(field, info, {from: operator});
        let rxInfo = await network.info(field);
        assert.equal(info.valueOf(), rxInfo.valueOf(), "info data doesn't match");
    });
});

function convertRateToConversionRatesRate (baseRate) {
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

function addBps (rate, bps) {
    return (rate.mul(10000 + bps).div(10000));
};

function compareRates (receivedRate, expectedRate) {
    expectedRate = expectedRate - (expectedRate % 10);
    receivedRate = receivedRate - (receivedRate % 10);
    assert.equal(expectedRate, receivedRate, "different rates");
};
