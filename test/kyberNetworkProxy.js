let NetworkProxy = artifacts.require("./KyberNetworkProxy.sol");
let ConversionRates = artifacts.require("./mockContracts/MockConversionRate.sol");
let TestToken = artifacts.require("./mockContracts/TestToken.sol");
let TokenReverseSend = artifacts.require("./mockContracts/TokenReverseSend.sol");
let Reserve = artifacts.require("./KyberReserve.sol");
let Network = artifacts.require("./KyberNetwork.sol");
let NetworkNoMaxDest = artifacts.require("./mockContracts/KyberNetworkNoMaxDest.sol");
let MaliciousNetwork = artifacts.require("./mockContracts/MaliciousKyberNetwork.sol");
let MaliciousNetwork2 = artifacts.require("./mockContracts/MaliciousKyberNetwork2.sol");
let GenerousNetwork = artifacts.require("./mockContracts/GenerousKyberNetwork.sol");
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
let negligibleRateDiff = 11;

//balances
let expectedReserve1BalanceWei = 0;
let expectedReserve2BalanceWei = 0;
let reserve1TokenBalance = [];
let reserve2TokenBalance = [];
let reserve1TokenImbalance = [];
let reserve2TokenImbalance = [];
let reserve1StartTokenBalance = [];
let reserve2StartTokenBalance = [];

//permission groups
let admin;
let operator;
let alerter;
let sanityRates;
let user1;
let user2;
let walletForToken;
let walletId;

//contracts
let pricing1;
let pricing2;
let pricing3
let reserve1;
let reserve2;
let reserve3;
let whiteList;
let expectedRate;
let network;
let networkNoMaxDest;
let maliciousNetwork;
let maliciousNetwork2;
let generousNetwork;
let networkProxy;
let feeBurner;

//block data
let priceUpdateBlock;
let currentBlock;
let validRateDurationInBlocks = 5100;

//tokens data
////////////
let numTokens = 4;
let tokens = [];
let tokenAdd = [];
let tokenDecimals = [];
let uniqueToken;

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
let qtyBuyStepX = [0, 150, 350, 700,  1400];
let qtyBuyStepY = [0,  0, -70, -160, -3000];

//imbalance buy steps
let imbalanceBuyStepX = [-8500, -2800, -1500, 0, 1500, 2800,  4500];
let imbalanceBuyStepY = [ 1300,   130,    43, 0,   0, -110, -1600];

//sell
//sell price will be 1 / buy (assuming no spread) so sell is actually buy price in other direction
let qtySellStepX = [0, 150, 350, 700, 1400];
let qtySellStepY = [0,   0, 120, 170, 3000];

//sell imbalance step
let imbalanceSellStepX = [-8500, -2800, -1500, 0, 1500, 2800,  4500];
let imbalanceSellStepY = [-1500,  -320,   -75, 0,    0,  110,   650];


//compact data.
let sells = [];
let buys = [];
let indices = [];
let compactBuyArr = [];
let compactSellArr = [];

let oldBaseBuy;
let oldBaseSell;

contract('KyberNetworkProxy', function(accounts) {
    it("should init globals. init 2 ConversionRates Inst, init tokens and add to pricing inst. set basic data per token.", async function () {
        // set account addresses
        admin = accounts[0];
        operator = accounts[1];
        alerter = accounts[2];
        user1 = accounts[4];
        user2 = accounts[5];
        walletId = accounts[6];
        walletForToken = accounts[7];

        currentBlock = priceUpdateBlock = await Helper.getCurrentBlock();

//        console.log("current block: " + currentBlock);
        //init contracts
        pricing1 = await ConversionRates.new(admin, {});
        pricing2 = await ConversionRates.new(admin, {});
        pricing3 = await ConversionRates.new(admin, {});

        //set pricing general parameters
        await pricing1.setValidRateDurationInBlocks(validRateDurationInBlocks);
        await pricing2.setValidRateDurationInBlocks(validRateDurationInBlocks);
        await pricing3.setValidRateDurationInBlocks(validRateDurationInBlocks);

        //create and add token addresses...
        for (let i = 0; i < numTokens; ++i) {
            tokenDecimals[i] = 15 * 1 + 1 * i;
            if (i == numTokens - 1) {
                token = await TokenReverseSend.new("test" + i, "tst" + i, tokenDecimals[i]);
            } else {
                token = await TestToken.new("test" + i, "tst" + i, tokenDecimals[i]);
            }
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

        uniqueToken = await TestToken.new("uinque", "unq", 15);
        await pricing3.addToken(uniqueToken.address);
        await pricing3.setTokenControlInfo(uniqueToken.address, minimalRecordResolution, maxPerBlockImbalance, maxTotalImbalance);
        await pricing3.enableTokenTrade(uniqueToken.address);

        await pricing1.addOperator(operator);
        await pricing1.addAlerter(alerter);
        await pricing2.addOperator(operator);
        await pricing2.addAlerter(alerter);
        await pricing3.addOperator(operator);
        await pricing3.addAlerter(alerter);
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
            baseSellRate2.push(ethersPerToken.div(1000).mul(980));
        }

//        console.log('baseBuyRate1')
//        console.log(baseBuyRate1)
//        console.log('baseSellRate1')
//        console.log(baseSellRate1)

//        console.log('baseBuyRate2')
//        console.log(baseBuyRate2)
//        console.log('baseSellRate2')
//        console.log(baseSellRate2)

        assert.equal(baseBuyRate1.length, tokens.length);
        assert.equal(baseBuyRate2.length, tokens.length);
        assert.equal(baseSellRate1.length, tokens.length);
        assert.equal(baseSellRate2.length, tokens.length);

        buys.length = sells.length = indices.length = 0;

        await pricing1.setBaseRate(tokenAdd, baseBuyRate1, baseSellRate1, buys, sells, currentBlock, indices, {from: operator});
        await pricing2.setBaseRate(tokenAdd, baseBuyRate2, baseSellRate2, buys, sells, currentBlock, indices, {from: operator});

        let uniqueAddArr = [uniqueToken.address];
        let baseBuyUnique = [precisionUnits.mul(18).valueOf()];
        let baseSellUnique = [precisionUnits.div(18).valueOf()];
//        log(uniqueAddArr + "  " + baseBuyUnique + "  " + baseSellUnique)
        await pricing3.setBaseRate(uniqueAddArr, baseBuyUnique, baseSellUnique, buys, sells, currentBlock, indices, {from: operator});
        //set compact data
        compactBuyArr = [0, 0, 0, 0, 0, 06, 07, 08, 09, 1, 0, 11, 12, 13, 14];
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
        await pricing3.setCompactData(buys, sells, currentBlock, indices, {from: operator});

        //all start with same step functions.
        let zeroArr = [0];
        for (let i = 0; i < numTokens; ++i) {
            await pricing1.setQtyStepFunction(tokenAdd[i], qtyBuyStepX, qtyBuyStepY, qtySellStepX, qtySellStepY, {from:operator});
            await pricing2.setQtyStepFunction(tokenAdd[i], qtyBuyStepX, qtyBuyStepY, qtySellStepX, qtySellStepY, {from:operator});
            await pricing1.setImbalanceStepFunction(tokenAdd[i], imbalanceBuyStepX, imbalanceBuyStepY, imbalanceSellStepX, imbalanceSellStepY, {from:operator});
            await pricing2.setImbalanceStepFunction(tokenAdd[i], imbalanceBuyStepX, imbalanceBuyStepY, imbalanceSellStepX, imbalanceSellStepY, {from:operator});
        }

        await pricing3.setQtyStepFunction(uniqueToken.address, qtyBuyStepX, qtyBuyStepY, qtySellStepX, qtySellStepY, {from:operator});
        await pricing3.setImbalanceStepFunction(uniqueToken.address, imbalanceBuyStepX, imbalanceBuyStepY, imbalanceSellStepX, imbalanceSellStepY, {from:operator});
    });

    it("should init network and reserves and set all reserve data including balances", async function () {
        network = await Network.new(admin);
        await network.addOperator(operator);

        reserve1 = await Reserve.new(network.address, pricing1.address, admin);
        reserve2 = await Reserve.new(network.address, pricing2.address, admin);
        reserve3 = await Reserve.new(network.address, pricing3.address, admin);

        await pricing1.setReserveAddress(reserve1.address);
        await pricing2.setReserveAddress(reserve2.address);
        await pricing3.setReserveAddress(reserve3.address);

        await reserve1.addAlerter(alerter);
        await reserve2.addAlerter(alerter);
        await reserve3.addAlerter(alerter);

        for (i = 0; i < numTokens; ++i) {
            await reserve1.approveWithdrawAddress(tokenAdd[i], accounts[0], true);
            await reserve2.approveWithdrawAddress(tokenAdd[i], accounts[0], true);
        }
        await reserve3.approveWithdrawAddress(uniqueToken.address, accounts[0], true);

        //set reserve balance. 10**18 wei ether + per token 10**18 wei ether value according to base rate.
        let reserveEtherInit = (new BigNumber(10)).pow(19);
        await Helper.sendEtherWithPromise(accounts[8], reserve1.address, reserveEtherInit);
        await Helper.sendEtherWithPromise(accounts[9], reserve2.address, reserveEtherInit);
        await Helper.sendEtherWithPromise(accounts[6], reserve3.address, reserveEtherInit);
        await uniqueToken.transfer(reserve3.address, 1000000000000);

        let balance = await Helper.getBalancePromise(reserve1.address);
        expectedReserve1BalanceWei = new BigNumber (balance.valueOf());
        assert.equal(balance.valueOf(), reserveEtherInit, "wrong ether balance");
        balance = await Helper.getBalancePromise(reserve2.address);
        expectedReserve2BalanceWei = new BigNumber(balance.valueOf());
        assert.equal(balance.valueOf(), reserveEtherInit, "wrong ether balance");

        //transfer tokens to reserve. each token same wei balance
        for (let i = 0; i < numTokens; ++i) {
            token = tokens[i];
            let balance;
            let amount1 = (new BigNumber(reserveEtherInit)).div(precisionUnits).mul(baseBuyRate1[i]).floor();

            if(i == 0) {
                await token.transfer(walletForToken, amount1.valueOf());
                await token.approve(reserve1.address,amount1.valueOf(),{from:walletForToken});
                await reserve1.setTokenWallet(token.address,walletForToken);
                balance = await token.balanceOf(walletForToken);
            }
            else {
                await token.transfer(reserve1.address, amount1.valueOf());
                balance = await token.balanceOf(reserve1.address);
            }

            reserve1StartTokenBalance[i] = amount1;

            let amount2 = (new BigNumber(reserveEtherInit)).div(precisionUnits).mul(baseBuyRate2[i]).floor();
            reserve2StartTokenBalance[i] = amount2
            await token.transfer(reserve2.address, amount2.valueOf());

            assert.equal(amount1.valueOf(), balance.valueOf());
            reserve1TokenBalance.push(amount1);
            reserve2TokenBalance.push(amount2);
            reserve1TokenImbalance.push(0);
            reserve2TokenImbalance.push(0);
        }
    });

    it("init kyber network proxy and kyber network data, list token pairs.", async function () {
        // add reserves
        await network.addReserve(reserve1.address, true);
        await network.addReserve(reserve2.address, true);

        networkProxy = await NetworkProxy.new(admin);

        await network.setKyberProxy(networkProxy.address);

        await networkProxy.setKyberNetworkContract(network.address);

        //set contracts
        feeBurner = await FeeBurner.new(admin, tokenAdd[0], network.address);
        let kgtToken = await TestToken.new("kyber genesis token", "KGT", 0);
        whiteList = await WhiteList.new(admin, kgtToken.address);
        await whiteList.addOperator(operator);
        await whiteList.setCategoryCap(0, 1000, {from:operator});
        await whiteList.setSgdToEthRate(30000, {from:operator});

        expectedRate = await ExpectedRate.new(network.address, admin);
        await network.setWhiteList(whiteList.address);
        await network.setExpectedRate(expectedRate.address);
        await network.setFeeBurner(feeBurner.address);
        await network.setParams(gasPrice.valueOf(), negligibleRateDiff);
        await network.setEnable(true);
        let price = await network.maxGasPrice();
        assert.equal(price.valueOf(), gasPrice.valueOf());

        //list tokens per reserve
        for (let i = 0; i < numTokens; i++) {
            await network.listPairForReserve(reserve1.address, tokenAdd[i], true, true, true);
            await network.listPairForReserve(reserve2.address, tokenAdd[i], true, true, true);
        }
    });

    it("should disable 1 reserve. perform buy and check: balances changed as expected.", async function () {
        let tokenInd = 1;
        let token = tokens[tokenInd]; //choose some token
        let amountWei = 330 * 1;

        //disable reserve 1
        await reserve1.disableTrade({from:alerter});
        let reserveIndex = 2;
        try {
            //verify base rate
            let buyRate = await networkProxy.getExpectedRate(ethAddress, tokenAdd[tokenInd], amountWei);
            let expected = calculateRateAmount(true, tokenInd, amountWei, reserveIndex);
            let expectedRate = expected[0];
            let expectedTweiAmount = expected[1];
            expectedRate = calcCombinedRate(amountWei, precisionUnits, expectedRate, 18, tokenDecimals[tokenInd], expectedTweiAmount);

            //check correct rate calculated
            assert.equal(buyRate[0].valueOf(), expectedRate.valueOf(), "unexpected rate.");

            //perform trade
            let txData = await networkProxy.trade(ethAddress, amountWei, tokenAdd[tokenInd], user2, 50000,
                buyRate[1].valueOf(), walletId, {from:user1, value:amountWei});

            //check higher ether balance on reserve
            expectedReserve2BalanceWei = expectedReserve2BalanceWei.add(amountWei);
            let balance = await Helper.getBalancePromise(reserve2.address);
            assert.equal(balance.valueOf(), expectedReserve2BalanceWei.valueOf(), "bad reserve balance wei");

            //check token balances
            ///////////////////////

            //check token balance on user2
            let tokenTweiBalance = await token.balanceOf(user2);
            assert.equal(tokenTweiBalance.valueOf(), expectedTweiAmount.valueOf(), "bad token balance");

            //check lower token balance on reserve
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

    it("should disable 1 reserve. swap ether to token (simple API) check: balances changed as expected.", async function () {
        let tokenInd = 1;
        let token = tokens[tokenInd]; //choose some token
        let amountWei = 110 * 1;

        //disable reserve 1
        await reserve1.disableTrade({from:alerter});
        let reserveIndex = 2;

        //verify base rate
        let buyRate = await networkProxy.getExpectedRate(ethAddress, tokenAdd[tokenInd], amountWei);
        let expected = calculateRateAmount(true, tokenInd, amountWei, reserveIndex);
        let expectedRate = expected[0];
        let expectedTweiAmount = expected[1];
        expectedRate = calcCombinedRate(amountWei, precisionUnits, expectedRate, 18, tokenDecimals[tokenInd], expectedTweiAmount);

        //check correct rate calculated
        assert.equal(buyRate[0].valueOf(), expectedRate.valueOf(), "unexpected rate.");

        //perform trade
        let txData = await networkProxy.swapEtherToToken(tokenAdd[tokenInd], buyRate[1].valueOf(), {from:user1, value:amountWei});

        //check higher ether balance on reserve
        expectedReserve2BalanceWei = expectedReserve2BalanceWei.add(amountWei);
        let balance = await Helper.getBalancePromise(reserve2.address);
        assert.equal(balance.valueOf(), expectedReserve2BalanceWei.valueOf(), "bad reserve balance wei");

        //check token balances
        ///////////////////////

        //check token balance on user1
        let tokenTweiBalance = await token.balanceOf(user1);
        assert.equal(tokenTweiBalance.valueOf(), expectedTweiAmount.valueOf(), "bad token balance");

        //check lower token balance on reserve
        reserve2TokenBalance[tokenInd] -= expectedTweiAmount;
        reserve2TokenImbalance[tokenInd] += (expectedTweiAmount * 1); //imbalance represents how many missing tokens
        let reportedBalance = await token.balanceOf(reserve2.address);
        assert.equal(reportedBalance.valueOf(), reserve2TokenBalance[tokenInd].valueOf(), "bad token balance on reserve");
        //enable reserve trade
        await reserve1.enableTrade({from:admin});
    });


    it("should disable 1 reserve. perform sell and check: balances changed as expected.", async function () {
        let tokenInd = 2;
        let token = tokens[tokenInd]; //choose some token
        let amountTwei = 1030 * 1;

        //disable reserve 1
        await reserve1.disableTrade({from:alerter});
        let reserveIndex = 2;
        try {
            //verify base rate
            let rate = await networkProxy.getExpectedRate(tokenAdd[tokenInd], ethAddress, amountTwei);
            let expected = calculateRateAmount(false, tokenInd, amountTwei, reserveIndex);
            let expectedRate = expected[0].valueOf();
            let expectedAmountWei = expected[1].valueOf();

            expectedRate = calcCombinedRate(amountTwei, expectedRate, precisionUnits, tokenDecimals[tokenInd], 18, expectedAmountWei);

            //check correct rate calculated
            assert.equal(rate[0].valueOf(), expectedRate.valueOf(), "unexpected rate.");

            await token.transfer(user1, amountTwei);
            await token.approve(networkProxy.address, amountTwei, {from:user1})

            //perform trade
            let balance = await Helper.getBalancePromise(reserve2.address);
            let txData = await networkProxy.trade(tokenAdd[tokenInd], amountTwei, ethAddress, user2, 500000,
                            rate[1].valueOf(), walletId, {from:user1});

            //check lower ether balance on reserve
            expectedReserve2BalanceWei = expectedReserve2BalanceWei.sub(expectedAmountWei);
            balance = await Helper.getBalancePromise(reserve2.address);
            assert.equal(balance.valueOf(), expectedReserve2BalanceWei.valueOf(), "bad reserve balance wei");

            //check token balances
            ///////////////////////

            //check token balance on user1
            let tokenTweiBalance = await token.balanceOf(user1);
            let expectedTweiAmount = 0;
            assert.equal(tokenTweiBalance.valueOf(), expectedTweiAmount.valueOf(), "bad token balance");

            //check higher token balance on reserve
            reserve2TokenBalance[tokenInd] = reserve2TokenBalance[tokenInd] * 1 + amountTwei * 1;
            reserve2TokenImbalance[tokenInd] -= (amountTwei * 1); //imbalance represents how many missing tokens
            let reportedBalance = await token.balanceOf(reserve2.address);
            assert.equal(reportedBalance.valueOf(), reserve2TokenBalance[tokenInd].valueOf(), "bad token balance on reserve");

        } catch (e) {
            //enable reserve trade
            await reserve1.enableTrade({from:admin});
            console.log("oooops " + e);
            throw e;
        }
        await reserve1.enableTrade({from:admin});
    });

    it("should disable 1 reserve. swap token to ether (simple API): balances changed as expected.", async function () {
        let tokenInd = 2;
        let token = tokens[tokenInd]; //choose some token
        let amountTwei = 680;

        //disable reserve 1
        await reserve1.disableTrade({from:alerter});
        let reserveIndex = 2;

        //verify base rate
        let rate = await networkProxy.getExpectedRate(tokenAdd[tokenInd], ethAddress, amountTwei);
        let expected = calculateRateAmount(false, tokenInd, amountTwei, reserveIndex);
        let expectedRate = expected[0].valueOf();
        let expectedAmountWei = expected[1].valueOf();

        expectedRate = calcCombinedRate(amountTwei, expectedRate, precisionUnits, tokenDecimals[tokenInd], 18, expectedAmountWei);

        //check correct rate calculated
        assert.equal(rate[0].valueOf(), expectedRate.valueOf(), "unexpected rate.");

        await token.transfer(user1, amountTwei);
        await token.approve(networkProxy.address, amountTwei, {from:user1})

        //perform trade
        let balance = await Helper.getBalancePromise(reserve2.address);
        let txData = await networkProxy.swapTokenToEther(tokenAdd[tokenInd], amountTwei, rate[1].valueOf(), {from:user1});

        //check lower ether balance on reserve
        expectedReserve2BalanceWei = expectedReserve2BalanceWei.sub(expectedAmountWei);
        balance = await Helper.getBalancePromise(reserve2.address);
        assert.equal(balance.valueOf(), expectedReserve2BalanceWei.valueOf(), "bad reserve balance wei");

        //check token balances
        ///////////////////////

        //check token balance on user1
        let tokenTweiBalance = await token.balanceOf(user1);
        let expectedTweiAmount = 0;
        assert.equal(tokenTweiBalance.valueOf(), expectedTweiAmount.valueOf(), "bad token balance");

        //check higher token balance on reserve
        reserve2TokenBalance[tokenInd] = reserve2TokenBalance[tokenInd] * 1 + amountTwei * 1;
        reserve2TokenImbalance[tokenInd] -= (amountTwei * 1); //imbalance represents how many missing tokens
        let reportedBalance = await token.balanceOf(reserve2.address);
        assert.equal(reportedBalance.valueOf(), reserve2TokenBalance[tokenInd].valueOf(), "bad token balance on reserve");

        await reserve1.enableTrade({from:admin});
    });


    it("use trade with hint. disable 1 reserve. perform buy and check: balances changed as expected.", async function () {
        let tokenInd = 1;
        let token = tokens[tokenInd]; //choose some token
        let amountWei = 330 * 1;

        //disable reserve 1
        await reserve1.disableTrade({from:alerter});
        let reserveIndex = 2;
        try {
            //verify base rate
            let buyRate = await networkProxy.getExpectedRate(ethAddress, tokenAdd[tokenInd], amountWei);
            let expected = calculateRateAmount(true, tokenInd, amountWei, reserveIndex);
            let expectedRate = expected[0];
            let expectedTweiAmount = expected[1];
            expectedRate = calcCombinedRate(amountWei, precisionUnits, expectedRate, 18, tokenDecimals[tokenInd], expectedTweiAmount);

            //check correct rate calculated
            assert.equal(buyRate[0].valueOf(), expectedRate.valueOf(), "unexpected rate.");

            let userStartTwei = await token.balanceOf(user2);

            //perform trade
            let txData = await networkProxy.tradeWithHint(ethAddress, amountWei, tokenAdd[tokenInd], user2, 50000,
                buyRate[1].valueOf(), walletId, 0, {from:user1, value:amountWei});

            //check higher ether balance on reserve
            expectedReserve2BalanceWei = expectedReserve2BalanceWei.add(amountWei);
            let balance = await Helper.getBalancePromise(reserve2.address);
            assert.equal(balance.valueOf(), expectedReserve2BalanceWei.valueOf(), "bad reserve balance wei");

            //check token balances
            ///////////////////////

            //check token balance on user2
            let tokenTweiBalance = await token.balanceOf(user2);
            assert.equal(tokenTweiBalance.valueOf(), expectedTweiAmount.add(userStartTwei).valueOf(), "bad token balance");

            //check lower token balance on reserve
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

    it("use trade with hint. see hint size > 0 reverts", async function () {
        let tokenInd = 1;
        let token = tokens[tokenInd]; //choose some token
        let amountWei = 330 * 1;

        let buyRate = await networkProxy.getExpectedRate(ethAddress, tokenAdd[tokenInd], amountWei);

        let hint = '0x123';

        let user2BalanceBefore = await token.balanceOf(user2);

        //perform trade
        try {
            await networkProxy.tradeWithHint(ethAddress, amountWei, tokenAdd[tokenInd], user2, 50000,
                buyRate[1].valueOf(), walletId, hint, {from:user1, value:amountWei});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected revert but got: " + e);
        }

        let user2BalanceAfter = await token.balanceOf(user2);
        assert.equal(user2BalanceAfter.valueOf(), user2BalanceBefore.valueOf());
    });

    it("use trade with hint. disable 1 reserve. perform sell and check: balances changed as expected.", async function () {
        let tokenInd = 2;
        let token = tokens[tokenInd]; //choose some token
        let amountTwei = 1030 * 1;

        //disable reserve 1
        await reserve1.disableTrade({from:alerter});
        let reserveIndex = 2;
        try {
            //verify base rate
            let rate = await networkProxy.getExpectedRate(tokenAdd[tokenInd], ethAddress, amountTwei);
            let expected = calculateRateAmount(false, tokenInd, amountTwei, reserveIndex);
            let expectedRate = expected[0].valueOf();
            let expectedAmountWei = expected[1].valueOf();

            expectedRate = calcCombinedRate(amountTwei, expectedRate, precisionUnits, tokenDecimals[tokenInd], 18, expectedAmountWei);

            //check correct rate calculated
            assert.equal(rate[0].valueOf(), expectedRate.valueOf(), "unexpected rate.");

            await token.transfer(user1, amountTwei);
            await token.approve(networkProxy.address, amountTwei, {from:user1})

            //perform trade
            let balance = await Helper.getBalancePromise(reserve2.address);
            let txData = await networkProxy.tradeWithHint(tokenAdd[tokenInd], amountTwei, ethAddress, user2, 500000,
                            rate[1].valueOf(), walletId, 0, {from:user1});

            //check lower ether balance on reserve
            expectedReserve2BalanceWei = expectedReserve2BalanceWei.sub(expectedAmountWei);
            balance = await Helper.getBalancePromise(reserve2.address);
            assert.equal(balance.valueOf(), expectedReserve2BalanceWei.valueOf(), "bad reserve balance wei");

            //check token balances
            ///////////////////////

            //check token balance on user1
            let tokenTweiBalance = await token.balanceOf(user1);
            let expectedTweiAmount = 0;
            assert.equal(tokenTweiBalance.valueOf(), expectedTweiAmount.valueOf(), "bad token balance");

            //check higher token balance on reserve
            reserve2TokenBalance[tokenInd] = reserve2TokenBalance[tokenInd] * 1 + amountTwei * 1;
            reserve2TokenImbalance[tokenInd] -= (amountTwei * 1); //imbalance represents how many missing tokens
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
        let amountWei = 35;

        //compare reserve buy rates for token
        let buyRate1 = await reserve1.getConversionRate(ethAddress, tokenAdd[tokenInd], amountWei, currentBlock + 10);
        let buyRate2 = await reserve2.getConversionRate(ethAddress, tokenAdd[tokenInd], amountWei, currentBlock + 10);
        let rates = await networkProxy.getExpectedRate(ethAddress, tokenAdd[tokenInd], amountWei);

        let negligibleDiff = 1 * (await network.negligibleRateDiff());
        //make sure reserve 2 has higher buy rate > negligibleDiff
        if ((buyRate2 * 10000 / (10000 + negligibleDiff) <= buyRate1)) {
            assert(false, "buy rate reserve 2 not bigger by negligibleDiff: " + (negligibleDiff / 10000));
        }

//        log("buy rate 1: " + buyRate1 + " buyRate2 " + buyRate2 + " diff rate: " + (buyRate2 * 10000 / (10000 + negligibleDiff)) );
        //perform trade
        let txData = await networkProxy.trade(ethAddress, amountWei, tokenAdd[tokenInd], user1, 800, rates[1].valueOf(),
                            walletId, {from:user1, value:amountWei});
        console.log('trade ether to token without randomize reserve. gasUsed: ' + txData.receipt.gasUsed);

        //check higher ether balance on reserve 2
        expectedReserve2BalanceWei = expectedReserve2BalanceWei.add(amountWei);

        let balance = await Helper.getBalancePromise(reserve2.address);
        assert.equal(balance.valueOf(), expectedReserve2BalanceWei.valueOf(), "bad reserve balance wei");

        //check token balances
        ///////////////////////

        //check token balance on user1
        let tokenTweiBalance = await token.balanceOf(user1);
        let expectedTweiAmount = calcDstQty(amountWei, 18, tokenDecimals[tokenInd], buyRate2);
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
        let amountTwei = 39;

        //compare reserve sell rates for token
        let sellRate1 = await reserve1.getConversionRate(tokenAdd[tokenInd], ethAddress, amountTwei, currentBlock + 10);
        let sellRate2 = await reserve2.getConversionRate(tokenAdd[tokenInd], ethAddress, amountTwei, currentBlock + 10);
        let negligibleDiff = 1 * (await network.negligibleRateDiff());
        let rates = await networkProxy.getExpectedRate(tokenAdd[tokenInd], ethAddress, amountTwei);

        //make sure reserve 1 has higher sell rate > negligibleDiff
        let sellRate1MinEps = sellRate1 * 10000 / (10000 * 1 + negligibleDiff * 1);
        if (sellRate1MinEps <= sellRate2) {
            assert(false, "rate too small. rate1: " + sellRate1 + " rate1minEps " + sellRate1MinEps + " rate2 " + sellRate2);
        }

        // transfer funds to user and approve funds to network
        await token.transfer(user1, amountTwei);
        await token.approve(networkProxy.address, amountTwei, {from:user1})

        // start balance for user2.
        const startEtherBalanceUser2 = new BigNumber(await Helper.getBalancePromise(user2));

        //perform trade
        //API: trade(ERC20 src, srcAmount, ERC20 dest, destAddress, maxDestAmount, minConversionRate, walletId)
        let txData = await networkProxy.trade(tokenAdd[tokenInd], amountTwei, ethAddress, user2, 300000, rates[1].valueOf(),
                        walletId, {from:user1, value:0});
        console.log('trade token to ether without randomize reserve. gasUsed: ' + txData.receipt.gasUsed);

        //check ether balances, reserve 1 and user2
        let expectedWeiAmount = calcDstQty(amountTwei, tokenDecimals[tokenInd], 18, sellRate1);
        expectedReserve1BalanceWei = expectedReserve1BalanceWei.sub(expectedWeiAmount);
        let balance = await Helper.getBalancePromise(reserve1.address);
        assert.equal(balance.valueOf(), expectedReserve1BalanceWei.valueOf(), "bad reserve balance wei");

        let expectedEthBalanceUser2 = startEtherBalanceUser2.add(expectedWeiAmount);
        balance = await Helper.getBalancePromise(user2);
        assert.equal(balance.valueOf(), expectedEthBalanceUser2.valueOf(), "bad balance user2.");

        //check token balances
        ///////////////////////

        //check token balance on user1
        let user1TokenTweiBalance = await token.balanceOf(user1);

        assert.equal(user1TokenTweiBalance.valueOf(), 0, "bad token balance");

        //check higher token balance on reserve
        //below is true since all tokens and ether have same decimals (18)
        reserve1TokenBalance[tokenInd] = (reserve1TokenBalance[tokenInd] * 1) + (amountTwei * 1);
        let reportedBalance = await token.balanceOf(walletForToken);
        assert.equal(reportedBalance.valueOf(), reserve1TokenBalance[tokenInd].valueOf(), "bad token balance on reserve");
    });

    it("should test low 'max dest amount' on sell. make sure it reduces source amount.", async function () {
        let tokenInd = 0;
        let token = tokens[tokenInd]; //choose some token
        let amountTwei = 3000;
        let maxDestAmountLow = 50000;
        let maxDestAmountHigh = 50000000;

        let rates = await networkProxy.getExpectedRate(tokenAdd[tokenInd], ethAddress, amountTwei);
        let minRate = rates[0].valueOf();

        // transfer funds to user and approve funds to network
        await token.transfer(user1, amountTwei);
        await token.approve(networkProxy.address, amountTwei, {from:user1})

        //perform full amount trade. see token balance on user 1 zero
        let txData = await networkProxy.trade(tokenAdd[tokenInd], amountTwei, ethAddress, user2, maxDestAmountHigh,
                            minRate, walletId, {from:user1});
        console.log("trade token to ether. gas used: " + txData.receipt.gasUsed)

        //check token balance on user1 is zero
        let tokenTweiBalance = await token.balanceOf(user1);
        assert.equal(tokenTweiBalance.valueOf(), 0, "bad token balance");

        // transfer funds to user and approve funds to network
        await token.transfer(user1, amountTwei);
        await token.approve(networkProxy.address, amountTwei, {from:user1})

        //user2 initial balance
        let user2InitBalance = await Helper.getBalancePromise(user2);

        rates = await networkProxy.getExpectedRate(tokenAdd[tokenInd], ethAddress, amountTwei);
        minRate = rates[1].valueOf();

        //perform blocked amount trade. see token balance on user 1 above zero
        let result = await networkProxy.trade(tokenAdd[tokenInd], amountTwei, ethAddress, user2, maxDestAmountLow,
                        minRate, walletId, {from:user1});

        //check used ethers as expected.
        let user2PostBalance = await Helper.getBalancePromise(user2);

//        console.log("init user balance: " + user2InitBalance + " post balance: " + user2PostBalance + " diff " + user2PostBalance*1 - user2InitBalance*1);

        //check token balance on user1
        tokenTweiBalance = await token.balanceOf(user1);
        assert(tokenTweiBalance.valueOf() > 0, "bad token balance");
    });

    it("should test low 'max dest amount' on buy. make sure it reduces source amount.", async function () {
        let tokenInd = 0;
        let token = tokens[tokenInd]; //choose some token
        let amountWei = 110000 * 1;
        let maxDestAmountLow = 11;
        let maxDestAmountHigh = 30000;

        let rates = await networkProxy.getExpectedRate(ethAddress, tokenAdd[tokenInd], amountWei);
        let minRate = rates[0].valueOf();

        let initialTokBalUser2 = token.balanceOf(user2);

        //perform full amount trade. see full token balance on user 2
        let txData = await networkProxy.trade(ethAddress, amountWei, tokenAdd[tokenInd], user2, maxDestAmountHigh,
                        minRate, walletId, {from:user1, value:amountWei});
        console.log("trade ether to token with low max dest amount. gas used: " + txData.receipt.gasUsed)

        let postTokenBalUser2 = await token.balanceOf(user2);

        let actualTradedTokens1 = postTokenBalUser2.valueOf()*1 - initialTokBalUser2.valueOf()*1;

        rates = await networkProxy.getExpectedRate(ethAddress, tokenAdd[tokenInd], amountWei);
        minRate = rates[0].valueOf();

        //perform limited amount trade
        let trade = await networkProxy.trade(ethAddress, amountWei, tokenAdd[tokenInd], user2, maxDestAmountLow,
                        minRate, walletId, {from:user1, value:amountWei});

        let post2ndTokenBalUser2 = await token.balanceOf(user2);

        let actualTradedTokens2 = post2ndTokenBalUser2.valueOf()*1 - postTokenBalUser2.valueOf()*1;

        assert.equal(actualTradedTokens2*1, maxDestAmountLow, "unexpected token balance");
    });

    it("should set reserve rate diff < negligibleDiff (negligible diff) perform 20 buys in loop. make sure buys from both reserves.", async function () {
        let tokenInd = 3;
        let token = tokens[tokenInd]; //choose some token
        let amountWei = 100;
        let numTrades = 20;

        //compare reserve buy rates for token
        let buyRate1 = await reserve1.getConversionRate(ethAddress, tokenAdd[tokenInd], amountWei, currentBlock + 10);
        let buyRate2 = await reserve2.getConversionRate(ethAddress, tokenAdd[tokenInd], amountWei, currentBlock + 10);

        let negligibleDiff = 400; // 400 / 10000 = 4%
        await network.setParams(gasPrice.valueOf(), negligibleDiff);

        //make sure reserve 2 has lower buy rate that is smaller then negligibleDiff
        if ((buyRate2 * 10000 / (10000 + negligibleDiff) > buyRate1)) {
            assert(false, "buy rate reserve 2 not smaller by negligibleDiff: " + (negligibleDiff / 10000));
        }

        //take initial balance from both reserves
        let tokPreBalance1 = new BigNumber(await token.balanceOf(reserve1.address));
        let tokPreBalance2 = new BigNumber(await token.balanceOf(reserve2.address));
        let ethPreBalance1 = new BigNumber(await Helper.getBalancePromise(reserve1.address));
        let ethPreBalance2 = new BigNumber(await Helper.getBalancePromise(reserve2.address));

        //perform 20 trades
        let minRate = 0;
        let maxDestAmount = 2000;
        let cumulativeGas = new BigNumber(0);
        for (let i = 0; i < numTrades; i++){
            let txData = await networkProxy.trade(ethAddress, amountWei, tokenAdd[tokenInd], user2, maxDestAmount,
                            minRate, walletId, {from:user1, value:amountWei});
            cumulativeGas = cumulativeGas.add(txData.receipt.gasUsed);
        }
        let avgGas = cumulativeGas.div(numTrades);
        log("average gas usage " + numTrades + " buys. ether to token: " + avgGas.floor().valueOf());

        //again take balance from both reserves
        let tokPostBalance1 = new BigNumber(await token.balanceOf(reserve1.address));
        let tokPostBalance2 = new BigNumber(await token.balanceOf(reserve2.address));
        let ethPostBalance1 = new BigNumber(await Helper.getBalancePromise(reserve1.address));
        let ethPostBalance2 = new BigNumber(await Helper.getBalancePromise(reserve2.address));

        //check higher ether balance on both
        assert(ethPostBalance2.gt(ethPreBalance2), "expected more ether here.");
        assert(ethPostBalance1.gt(ethPreBalance1), "expected more ether here.");

        //check lower token balance on both
        assert(tokPostBalance1.lt(tokPreBalance1), "expected more token here.");
        assert(tokPostBalance2.lt(tokPreBalance2), "expected more token here.");

        await network.setParams(gasPrice.valueOf(), negligibleRateDiff);
    });

    it("should verify trade reverted when network disabled.", async function () {
        let tokenInd = 0;
        let token = tokens[tokenInd]; //choose some token
        let amountWei = 98000;
        let minConversionRate = 0;

        //disable trade
        await network.setEnable(false);

        //perform trade
        try {
             await networkProxy.trade(ethAddress, amountWei, tokenAdd[tokenInd], user2, 2000,
                minConversionRate, walletId, {from:user1, value:amountWei});
             assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected revert but got: " + e);
        }

        //enable trade
        await network.setEnable(true);

        await networkProxy.trade(ethAddress, amountWei, tokenAdd[tokenInd], user2, 2000,
                minConversionRate, walletId, {from:user1, value:amountWei});
    });

    it("should verify buy reverted when bad ether amount is sent.", async function () {
        let tokenInd = 0;
        let token = tokens[tokenInd]; //choose some token
        let amountWei = 83000;
        let minConversionRate = 0;

        //perform trade
        try {
             await networkProxy.trade(ethAddress, amountWei, tokenAdd[tokenInd], user2, 2000,
                minConversionRate, walletId, {from:user1, value:amountWei*1-1});
             assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected revert but got: " + e);
        }

        await networkProxy.trade(ethAddress, amountWei, tokenAdd[tokenInd], user2, 2000,
                minConversionRate, walletId, {from:user1, value:amountWei});
    });

    it("should verify sell reverted when not enough token allowance.", async function () {
        let tokenInd = 1;
        let token = tokens[tokenInd]; //choose some token
        let amountTWei = 15*1;

        let allowance = await token.allowance(user1, networkProxy.address);
//        log("allowance " + allowance)
        assert.equal(allowance, 0);
        //for this test to work, user allowance has to be 0

        // transfer funds to user and approve funds to network
        await token.transfer(user1, amountTWei);
        await token.approve(networkProxy.address, amountTWei*1-1, {from:user1})

        try {
            await networkProxy.trade(tokenAdd[tokenInd], amountTWei.valueOf(), ethAddress, user2, 5000, 0, walletId, {from:user1});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected revert but got: " + e);
        }

        //add missing allowance
        await token.approve(networkProxy.address, amountTWei, {from:user1})

        //perform same trade
        await networkProxy.trade(tokenAdd[tokenInd], amountTWei.valueOf(), ethAddress, user2, 5000, 0, walletId, {from:user1});
    });

    it("should verify sell reverted when not enough tokens in source address allowance.", async function () {
        let tokenInd = 1;
        let token = tokens[tokenInd]; //choose some token
        let amountTWei = 15*1;

        let balance = await token.balanceOf(user1);
        await token.transfer(user2, balance.valueOf(), {from: user1});
        balance = await token.balanceOf(user1);

        assert.equal(balance.valueOf(), 0);
        //for this test to work, user balance has to be 0

        // transfer funds to user and approve funds to network
        await token.transfer(user1, amountTWei - 1);
        await token.approve(networkProxy.address, amountTWei, {from:user1})

        try {
            await networkProxy.trade(tokenAdd[tokenInd], amountTWei.valueOf(), ethAddress, user2, 5000, 0, walletId, {from:user1});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected revert but got: " + e);
        }

        //add missing tokens
        await token.transfer(user1, 1);

        //perform same trade
        await networkProxy.trade(tokenAdd[tokenInd], amountTWei.valueOf(), ethAddress, user2, 5000, 0, walletId, {from:user1});
    });

    it("should verify sell reverted when sent with ether value.", async function () {
        let tokenInd = 1;
        let token = tokens[tokenInd]; //choose some token
        let amountTWei = 15*1;

        // transfer funds to user and approve funds to network
        await token.transfer(user1, amountTWei);
        await token.approve(networkProxy.address, amountTWei, {from:user1})

        try {
            await networkProxy.trade(tokenAdd[tokenInd], amountTWei.valueOf(), ethAddress, user2, 5000, 0,
                walletId, {from:user1, value: 10});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected revert but got: " + e);
        }

        //perform same trade
        await networkProxy.trade(tokenAdd[tokenInd], amountTWei.valueOf(), ethAddress, user2, 5000, 0, walletId, {from:user1, value: 0});
    });

    it("should verify trade reverted when dest amount (actual amount) is 0.", async function () {
        let tokenInd = 3;
        let token = tokens[tokenInd]; //choose some token
        let amountTweiLow = 1;
        let amountTWeiHi = 80;

        // transfer funds to user and approve funds to network
        await token.transfer(network.address, amountTWeiHi);
        await token.transfer(user1, amountTWeiHi);
        await token.approve(networkProxy.address, amountTWeiHi, {from:user1})

        let sellRate1 = await reserve1.getConversionRate(tokenAdd[tokenInd], ethAddress, amountTweiLow, currentBlock + 10);
        rates = await networkProxy.getExpectedRate(tokenAdd[tokenInd], ethAddress, amountTweiLow);
        minRate = rates[1].valueOf();

        //try with low amount Twei
        try {
            await networkProxy.trade(tokenAdd[tokenInd], amountTweiLow, ethAddress, user2, 3000, minRate,
                    walletId, {from:user1});
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected revert but got: " + e);
        }

        //perform same trade with higher value to see success
        let destAmount = await networkProxy.trade(tokenAdd[tokenInd], amountTWeiHi, ethAddress, user2, 3000,
            minRate, walletId, {from:user1});
    });

    it("should verify trade reverted when gas price above set max.", async function () {
        let tokenInd = 3;
        let token = tokens[tokenInd]; //choose some token
        let amountWei = 41;
        let minConversionRate = 0;
        let maxPrice = await networkProxy.maxGasPrice();
        let highGas = maxPrice * 2;

        //perform trade
        try {
             await networkProxy.trade(ethAddress, amountWei, tokenAdd[tokenInd], user2, 2000,
                minConversionRate, walletId, {from:user1, value:amountWei, gasPrice: highGas});
             assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected revert but got: " + e);
        }

        //see trade success with good gas price
        await networkProxy.trade(ethAddress, amountWei, tokenAdd[tokenInd], user2, 2000,
                  minConversionRate, walletId, {from:user1, value:amountWei, gasPrice: maxPrice});
    });

    it("should verify trade reverted when ether amount above user cap in white list.", async function () {
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
             await networkProxy.trade(ethAddress, amountWei, tokenAdd[tokenInd], user2, 2000,
                minConversionRate, walletId, {from:user2, value:amountWei});
             assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected revert but got: " + e);
        }

        //set normal wei to sgd rate.
        await whiteList.setSgdToEthRate(30000, {from: operator});
        await whiteList.setCategoryCap(2, 100, {from:operator}); //1 sgd

        //see trade success with good gas price
        await networkProxy.trade(ethAddress, amountWei, tokenAdd[tokenInd], user2, 2000,
                  minConversionRate, walletId, {from:user2, value:amountWei});
    });

    it("should verify trade reverted src amount > max src amount (10**28).", async function () {
        let tokenInd = 3;
        let token = tokens[tokenInd]; //choose some token
        let amountTWei = (new BigNumber(10).pow(28)).add(1);

        // transfer funds to user and approve funds to network - for all trades in this 'it'
        await token.transfer(user1, amountTWei);
        await token.approve(networkProxy.address, amountTWei, {from:user1})

        //more ether to reserve
        await Helper.sendEtherWithPromise(accounts[7], reserve1.address, 11050000000000000000);

        //set high imbalance values - to avoid block trade due to total imbalance per block
        let highImbalance = amountTWei.mul(4).valueOf();
        await pricing1.setTokenControlInfo(token.address, new BigNumber(10).pow(14), highImbalance, highImbalance);
        //set large category cap for user 1
        await whiteList.setUserCategory(user1, 1, {from: operator});
        await whiteList.setCategoryCap(1, amountTWei.mul(2).valueOf(), {from:operator});

        //MODIFY RATE
        tokensPerEther = (new BigNumber(10)).pow(24);
        ethersPerToken = (new BigNumber(precisionUnits.div(1000000000)).floor());
        oldBaseBuy = baseBuyRate1[tokenInd];
        oldBaseSell = baseSellRate1[tokenInd];
        baseBuyRate1[tokenInd] = tokensPerEther.valueOf();
        baseSellRate1[tokenInd] = ethersPerToken.valueOf();
        buys.length = sells.length = indices.length = 0;
        await pricing1.setBaseRate(tokenAdd, baseBuyRate1, baseSellRate1, buys, sells, currentBlock, indices, {from: operator});

        try {
            await networkProxy.trade(tokenAdd[tokenInd], amountTWei.valueOf(), ethAddress, user2, amountTWei.valueOf(),
                0, walletId, {from:user1});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected revert but got: " + e);
        }

        //see same trade performed when value is 1 less
        await networkProxy.trade(tokenAdd[tokenInd], amountTWei.sub(1).valueOf(), ethAddress,
                user2, amountTWei.valueOf(), 0, walletId, {from:user1});
        baseBuyRate1[tokenInd] = oldBaseBuy;
        baseSellRate1[tokenInd] = oldBaseSell;
        await pricing1.setBaseRate(tokenAdd, baseBuyRate1, baseSellRate1, buys, sells, currentBlock, indices, {from: operator});
        await pricing1.setTokenControlInfo(token.address, minimalRecordResolution, maxPerBlockImbalance, maxTotalImbalance);
    });

    it("should verify trade reverted when rate below min rate.", async function () {
        let tokenInd = 1;
        let token = tokens[tokenInd]; //choose some token
        let amountTWei = 35*1;

        // transfer funds to user and approve funds to network - for all trades in this 'it'
        await token.transfer(user1, amountTWei);
        await token.approve(networkProxy.address, amountTWei, {from:user1})

        let rates = await networkProxy.getExpectedRate(tokenAdd[tokenInd], ethAddress, amountTWei);
        let minConvRate = rates[0].valueOf();
        let minSetRate = minConvRate + 1 * 1;
        try {
            await networkProxy.trade(tokenAdd[tokenInd], amountTWei.valueOf(), ethAddress, user2, amountTWei.valueOf(),
                        minSetRate, walletId, {from:user1});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected revert but got: " + e);
        }

        //same trade with zero min rate
        await networkProxy.trade(tokenAdd[tokenInd], amountTWei.valueOf(), ethAddress, user2,
                    amountTWei.valueOf(), 0, walletId, {from:user1});
    });

    it("should verify trade reverted when rate above max rate.", async function () {
        let tokenInd = 1;
        let token = tokens[tokenInd]; //choose some token
        let amountTWei = 35*1;

        // transfer funds to user and approve funds to network - for all trades in this 'it'
        await token.transfer(user1, amountTWei);
        await token.approve(networkProxy.address, amountTWei, {from:user1})

        let maxRate = (new BigNumber(10).pow(24)).valueOf();
        //modify rate
        baseSellRate1[tokenInd] = maxRate;
        baseSellRate2[tokenInd] = maxRate;

        buys.length = sells.length = indices.length = 0;

        await pricing1.setBaseRate(tokenAdd, baseBuyRate1, baseSellRate1, buys, sells, currentBlock, indices, {from: operator});
        await pricing2.setBaseRate(tokenAdd, baseBuyRate2, baseSellRate2, buys, sells, currentBlock, indices, {from: operator});

        try {
            await networkProxy.trade(tokenAdd[tokenInd], amountTWei, ethAddress, user2, 5000, 0, walletId, {from:user1});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected revert but got: " + e);
        }

        //modify rate back to normal
        tokensPerEther = (new BigNumber(precisionUnits.mul((tokenInd + 1) * 3)).floor());
        baseSellRate1[tokenInd] = tokensPerEther.valueOf();
        baseSellRate2[tokenInd] = tokensPerEther.valueOf();

        buys.length = sells.length = indices.length = 0;

        await pricing1.setBaseRate(tokenAdd, baseBuyRate1, baseSellRate1, buys, sells, currentBlock, indices, {from: operator});
        await pricing2.setBaseRate(tokenAdd, baseBuyRate2, baseSellRate2, buys, sells, currentBlock, indices, {from: operator});

        //see same trade performed when normal rate
        await networkProxy.trade(tokenAdd[tokenInd], amountTWei, ethAddress,
                user2, amountTWei.valueOf(), 0, walletId, {from:user1});
    });

    it("should verify trade reverted when dest address 0.", async function () {
        let tokenInd = 3;
        let token = tokens[tokenInd]; //choose some token
        let amountWei = 18 * 1;
        let minConversionRate = 0;

        //perform trade
        try {
             await networkProxy.trade(ethAddress, amountWei, tokenAdd[tokenInd], 0, 2000, minConversionRate,
                walletId, {from:user1, value:amountWei});
             assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected revert but got: " + e);
        }

        //see same trade performed with valid value
        await networkProxy.trade(ethAddress, amountWei, tokenAdd[tokenInd], user2, 2000, minConversionRate,
            walletId, {from:user1, value:amountWei});
    });

    it("should test can't init this contract with empty contracts (address 0) or with non admin.", async function () {
        let proxyTemp;

        try {
            proxyTemp = await NetworkProxy.new(0);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected revert but got: " + e);
        }

        proxyTemp = await NetworkProxy.new(admin);

        let rxNetworkAddress = await proxyTemp.kyberNetworkContract();
        assert.equal (rxNetworkAddress.valueOf(), 0);

        await proxyTemp.setKyberNetworkContract(network.address);

        rxNetworkAddress = await proxyTemp.kyberNetworkContract();
        assert.equal (rxNetworkAddress.valueOf(), network.address);

        try {
            await proxyTemp.setKyberNetworkContract(0);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected revert but got: " + e);
        }

        rxNetworkAddress = await proxyTemp.kyberNetworkContract();
        assert.equal (rxNetworkAddress.valueOf(), network.address);
    });

    it("should set kyberNetwork and test event.", async function () {

        let tempNetworkAdd = accounts[7];
        let result = await networkProxy.setKyberNetworkContract(tempNetworkAdd);

//        log (result.logs[0].args)
        assert.equal(result.logs[0].args.newNetworkContract, tempNetworkAdd);
        assert.equal(result.logs[0].args.oldNetworkContract, network.address);

        result = await networkProxy.setKyberNetworkContract(network.address);
    });


    it("should test getter. user cap in Wei.", async function () {

        let capFromNetwork = await network.getUserCapInWei(user2);
        let capFromProxy = await networkProxy.getUserCapInWei(user2);

        assert.equal(capFromNetwork.valueOf(), capFromProxy.valueOf(), "cap in wei should match");
    });

    it("should test getter. user cap in token Wei. see reverts", async function () {
        let tokenAddress = tokenAdd[2];

        try {
            let capFromNetwork = await network.getUserCapInTokenWei(user2, tokenAddress);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected revert but got: " + e);
        }
    });

    it("should test getter. max gas price.", async function () {
        let maxGasFromNetwork = await network.maxGasPrice();
        let maxGasFromProxy = await networkProxy.maxGasPrice();

        assert.equal(maxGasFromNetwork.valueOf(), maxGasFromProxy.valueOf(), "values from proxy and network should match.");
    });

    it("should test getter. max gas price.", async function () {

        await network.setEnable(false);

        let enabledFromNetwork = await network.enabled();
        let enabledFromProxy = await networkProxy.enabled();

        assert.equal(enabledFromNetwork.valueOf(), enabledFromProxy.valueOf(), "values from proxy and network should match.");

        await network.setEnable(true);

        enabledFromNetwork = await network.enabled();
        enabledFromProxy = await networkProxy.enabled();

        assert.equal(enabledFromNetwork.valueOf(), enabledFromProxy.valueOf(), "values from proxy and network should match.");
    });

    it("use setInfo (UI info) and see value returned in getter.", async function () {
        let info = 15;
        let field = 10;

        await network.setInfo(field, info, {from: operator});
        let rxInfo = await networkProxy.info(field);
        assert.equal(info, rxInfo.valueOf(), "info data doesn't match");
    });

    it("should test token to token trade 1 reserve.", async function () {
        let tokenSrcInd = 1;
        let tokenDestInd = 0;
        let tokenSrc = tokens[tokenSrcInd];
        let tokenDest = tokens[tokenDestInd];
        let srcAmountTwei = 1450 * 1;
        let maxDestAmount = (new BigNumber(10)).pow(18);

        //reset max imbalance values - for working with higher numbers
        currentBlock = await Helper.getCurrentBlock();

        //set compact data
        compactBuyArr = [0, 0, 0, 0, 0, 06, 07, 08, 09, 10, 11, 12, 13, 14];
        let compactBuyHex = Helper.bytesToHex(compactBuyArr);
        buys.push(compactBuyHex);

        compactSellArr = [0, 0, 0, 0, 0, 26, 27, 28, 29, 30, 31, 32, 33, 34];
        let compactSellHex = Helper.bytesToHex(compactSellArr);
        sells.push(compactSellHex);

        indices[0] = 0;
        await pricing1.setBaseRate(tokenAdd, baseBuyRate1, baseSellRate1, buys, sells, currentBlock, indices, {from: operator});
        await pricing2.setBaseRate(tokenAdd, baseBuyRate2, baseSellRate2, buys, sells, currentBlock, indices, {from: operator});
        priceUpdateBlock = currentBlock;

        maxPerBlockImbalance = 60000000;
        maxTotalImbalance = 12 * maxPerBlockImbalance;

        //set higher imbalance values - and set local imbalance values to 0 since we update compact data.
        for (let i = 0; i < numTokens; ++i) {
            await pricing1.setTokenControlInfo(tokenAdd[i], minimalRecordResolution, maxPerBlockImbalance, maxTotalImbalance);
            await pricing2.setTokenControlInfo(tokenAdd[i], minimalRecordResolution, maxPerBlockImbalance, maxTotalImbalance);
            //update balance in imbalance values
            reserve2TokenBalance[i] = new BigNumber(await tokens[i].balanceOf(reserve2.address));
            reserve2TokenImbalance[i] = new BigNumber(0);
            if (i == 0) {
                reserve1TokenBalance[i] = new BigNumber(await tokens[i].balanceOf(walletForToken));
            } else {
                reserve1TokenBalance[i] = new BigNumber(await tokens[i].balanceOf(reserve1.address));
            }
            reserve1TokenImbalance[i] = new BigNumber(0);
//            log(i + " reserve2TokenImbalance: " + reserve2TokenImbalance[i] + " reserve1TokenImbalance: " + reserve1TokenImbalance[i])
        }

        await reserve1.disableTrade({from:alerter});

        try {
            //verify base rate
            let buyRate = await networkProxy.getExpectedRate(tokenAdd[tokenSrcInd], tokenAdd[tokenDestInd], srcAmountTwei);

            // first token to eth rate
            let expected = calculateRateAmount(false, tokenSrcInd, srcAmountTwei, 2);
            let expectedSellRate = expected[0];
            let expectedEthQtyWei = expected[1];
//            log('expectedSell ' + expected )

            //eth to token
            expected = calculateRateAmount(true, tokenDestInd, expectedEthQtyWei, 2);
            let expectedBuyRate = expected[0];
            expectedDestTokensTwei = expected[1];
//            log('expectedBuy ' + expected )

            //calcCombinedRate(srcQty, sellRate, buyRate, srcDecimals, dstDecimals)
            let combinedRate = calcCombinedRate(srcAmountTwei, expectedSellRate, expectedBuyRate, tokenDecimals[tokenSrcInd], tokenDecimals[tokenDestInd], expectedDestTokensTwei);

            //check correct rate calculated
            assert.equal(buyRate[0].valueOf(), combinedRate.valueOf(), "unexpected rate.");

            //perform trade
            // transfer funds to user and approve funds to network - for all trades in this 'it'
            await tokenSrc.transfer(user1, srcAmountTwei);
            await tokenSrc.approve(networkProxy.address, srcAmountTwei, {from:user1})

            let startBalanceTokenDestUser2 = await tokenDest.balanceOf(user2);
            let startBalanceTokenSrcUser1 = await tokenSrc.balanceOf(user1);
    //        function trade(src, srcAmount, dest, destAddress, maxDestAmount, minConversionRate, walletId)

            let result = await networkProxy.trade(tokenAdd[tokenSrcInd], srcAmountTwei, tokenAdd[tokenDestInd],
                user2, maxDestAmount, buyRate[1].valueOf(), walletId, {from:user1});

            //update balance and imbalance
            reserve2TokenBalance[tokenSrcInd] = (reserve2TokenBalance[tokenSrcInd]).add(srcAmountTwei);
            reserve2TokenImbalance[tokenSrcInd] = reserve2TokenImbalance[tokenSrcInd].sub(srcAmountTwei);
            reserve2TokenBalance[tokenDestInd] = reserve2TokenBalance[tokenDestInd].sub(expectedDestTokensTwei);
            reserve2TokenImbalance[tokenDestInd] =  reserve2TokenImbalance[tokenDestInd].add(expectedDestTokensTwei); //more missing tokens

            //check token balances
            ///////////////////////

            //check higher tokenDest balance on user2
            let rate = new BigNumber(buyRate[0].valueOf());
            let tokenDestUser2Balance = await tokenDest.balanceOf(user2);
            let expectedBalanceTokenDestUser2 = startBalanceTokenDestUser2.add(expectedDestTokensTwei);
            assert.equal(expectedBalanceTokenDestUser2.valueOf(), tokenDestUser2Balance.valueOf(), "bad token balance");

            //check lower tokenSrc balance on user1
            let tokenSrcUser1Balance = await tokenSrc.balanceOf(user1);
            let expectedBalanceTokenSrcUser1 = startBalanceTokenSrcUser1.sub(srcAmountTwei);
            assert.equal(tokenSrcUser1Balance.valueOf(), expectedBalanceTokenSrcUser1.valueOf(), "bad token balance");

            //check token balance on reserve
            //tokenSrc
            reportedBalance = await tokenSrc.balanceOf(reserve2.address);
            assert.equal(reportedBalance.valueOf(), reserve2TokenBalance[tokenSrcInd].valueOf(), "bad token balance on reserve");

            //tokenDest
            reportedBalance = await tokenDest.balanceOf(reserve2.address);
            assert.equal(reportedBalance.valueOf(), reserve2TokenBalance[tokenDestInd].valueOf(), "bad token balance on reserve");
        } catch(e) {
            await reserve1.enableTrade({from:admin});
            throw(e);
        }
        await reserve1.enableTrade({from:admin});
    });

    it("should test token to token swap (simple API) 2 different reserves.", async function () {
        let tokenSrcInd = 1;
        let tokenDestInd = 3;
        let tokenSrc = tokens[tokenSrcInd];
        let tokenDest = tokens[tokenDestInd];
        let srcAmountTwei = 321;
        let maxDestAmount = (new BigNumber(10)).pow(18);

        await pricing1.disableTokenTrade(tokenAdd[tokenSrcInd], {from: alerter});
        await pricing2.disableTokenTrade(tokenAdd[tokenDestInd], {from: alerter});

        try {
            //rate
            let buyRate = await networkProxy.getExpectedRate(tokenAdd[tokenSrcInd], tokenAdd[tokenDestInd], srcAmountTwei);
            //calculate rates
            // first token to eth rate
            let expected = calculateRateAmount(false, tokenSrcInd, srcAmountTwei, 2);
            let expectedSellRate = expected[0];
            let expectedEthQtyWei = expected[1];

            //eth to token
            expected = calculateRateAmount(true, tokenDestInd, expectedEthQtyWei, 1);
            let expectedBuyRate = expected[0];
            expectedDestTokensTwei = expected[1];

            let combinedRate = calcCombinedRate(srcAmountTwei, expectedSellRate, expectedBuyRate, tokenDecimals[tokenSrcInd], tokenDecimals[tokenDestInd], expectedDestTokensTwei);

 //        check correct rate calculated
            assert.equal(buyRate[0].valueOf(), combinedRate.valueOf(), "unexpected rate.");

             //perform trade
            // transfer funds to user and approve funds to network
            await tokenSrc.transfer(user1, srcAmountTwei);
            await tokenSrc.approve(networkProxy.address, srcAmountTwei, {from:user1})

            let startBalanceTokenDestUser1 = await tokenDest.balanceOf(user1);
            let startBalanceTokenSrcUser1 = await tokenSrc.balanceOf(user1);

    //        function trade(src, srcAmount, dest, destAddress, maxDestAmount, minConversionRate, walletId)

            result = await networkProxy.swapTokenToToken(tokenAdd[tokenSrcInd], srcAmountTwei, tokenAdd[tokenDestInd],
                buyRate[1].valueOf(), {from:user1});
//            log(result.logs[0].args);
//            log(result.logs[1].args);

            //update balance and imbalance
            reserve2TokenBalance[tokenSrcInd] = reserve2TokenBalance[tokenSrcInd].add(srcAmountTwei);
            reserve2TokenImbalance[tokenSrcInd] = reserve2TokenImbalance[tokenSrcInd].sub(srcAmountTwei); // less missing tokens.
            reserve1TokenBalance[tokenDestInd] = reserve1TokenBalance[tokenDestInd].sub(expectedDestTokensTwei);
            reserve1TokenImbalance[tokenDestInd] = reserve1TokenImbalance[tokenDestInd].add(expectedDestTokensTwei);

    //        check token balances
            ///////////////////
            //check tokenDest balance on user2
            let rate = new BigNumber(buyRate[0].valueOf());
            let tokenDestUser1Balance = await tokenDest.balanceOf(user1);
            let expectedBalanceTokenDestUser1 = startBalanceTokenDestUser1.add(expectedDestTokensTwei);
            assert.equal(expectedBalanceTokenDestUser1.valueOf(), tokenDestUser1Balance.valueOf(), "bad token balance");

            //check tokenSrc balance on user1
            let tokenSrcUser1Balance = await tokenSrc.balanceOf(user1);
            let expectedBalanceTokenSrcUser1 = startBalanceTokenSrcUser1.sub(srcAmountTwei);
            assert.equal(tokenSrcUser1Balance.valueOf(), expectedBalanceTokenSrcUser1.valueOf(), "bad token balance");

            //check token balance on reserve
            //tokenSrc
            reportedBalance = await tokenSrc.balanceOf(reserve2.address);
            assert.equal(reportedBalance.valueOf(), reserve2TokenBalance[tokenSrcInd].valueOf(), "bad token balance on reserve");

            //tokenDest
            reportedBalance = await tokenDest.balanceOf(reserve1.address);
            assert.equal(reportedBalance.valueOf(), reserve1TokenBalance[tokenDestInd].valueOf(), "bad token balance on reserve");
            reportedBalance = await tokenDest.balanceOf(reserve2.address);
            assert.equal(reportedBalance.valueOf(), reserve2TokenBalance[tokenDestInd].valueOf(), "bad token balance on reserve");

            await pricing1.enableTokenTrade(tokenAdd[tokenSrcInd]);
            await pricing2.enableTokenTrade(tokenAdd[tokenDestInd]);
        } catch(e) {
            await pricing1.enableTokenTrade(tokenAdd[tokenSrcInd]);
            await pricing2.enableTokenTrade(tokenAdd[tokenDestInd]);
            throw(e);
        }
    });

    it("should test token to token trade 2 different reserves. other numbers.", async function () {
        let tokenSrcInd = 1;
        let tokenDestInd = 0;
        let tokenSrc = tokens[tokenSrcInd];
        let tokenDest = tokens[tokenDestInd];
        let srcAmountTwei = 2451;
        let maxDestAmount = (new BigNumber(10)).pow(18);

        await pricing1.disableTokenTrade(tokenAdd[tokenSrcInd], {from: alerter});
        await pricing2.disableTokenTrade(tokenAdd[tokenDestInd], {from: alerter});

        try {
            //rate
            let buyRate = await networkProxy.getExpectedRate(tokenAdd[tokenSrcInd], tokenAdd[tokenDestInd], srcAmountTwei);

            //calculate rates
            // first token to eth rate
            let expected = calculateRateAmount(false, tokenSrcInd, srcAmountTwei, 2);
            let expectedSellRate = expected[0];
            let expectedEthQtyWei = expected[1];
//            log('expectedSell ' + expected )

            //eth to token
            expected = calculateRateAmount(true, tokenDestInd, expectedEthQtyWei, 1);
            let expectedBuyRate = expected[0];
            expectedDestTokensTwei = expected[1];
//            log('expectedBuy ' + expected )

            let combinedRate = calcCombinedRate(srcAmountTwei, expectedSellRate, expectedBuyRate, tokenDecimals[tokenSrcInd], tokenDecimals[tokenDestInd], expectedDestTokensTwei);

 //        check correct rate calculated
            assert.equal(buyRate[0].valueOf(), combinedRate.valueOf(), "unexpected rate.");

             //perform trade
            // transfer funds to user and approve funds to network
            await tokenSrc.transfer(user1, srcAmountTwei);
            await tokenSrc.approve(networkProxy.address, srcAmountTwei, {from:user1})

            let startBalanceTokenDestUser2 = await tokenDest.balanceOf(user2);
            let startBalanceTokenSrcUser1 = await tokenSrc.balanceOf(user1);

    //        function trade(src, srcAmount, dest, destAddress, maxDestAmount, minConversionRate, walletId)

            result = await networkProxy.trade(tokenAdd[tokenSrcInd], srcAmountTwei, tokenAdd[tokenDestInd], user2,
                        maxDestAmount, buyRate[1].valueOf(), walletId, {from:user1});
//            log(result.logs[0].args);
//            log(result.logs[1].args);

            //update balance and imbalance
            reserve2TokenBalance[tokenSrcInd] = reserve2TokenBalance[tokenSrcInd].add(srcAmountTwei);
            reserve2TokenImbalance[tokenSrcInd] = reserve2TokenImbalance[tokenSrcInd].sub(srcAmountTwei); // less missing tokens.
            reserve1TokenBalance[tokenDestInd] = reserve1TokenBalance[tokenDestInd].sub(expectedDestTokensTwei);
            reserve1TokenImbalance[tokenDestInd] = reserve1TokenImbalance[tokenDestInd].add(expectedDestTokensTwei);

    //        check token balances
            ///////////////////
            //check tokenDest balance on user2
            let rate = new BigNumber(buyRate[0].valueOf());
            let tokenDestUser2Balance = await tokenDest.balanceOf(user2);
            let expectedBalanceTokenDestUser2 = startBalanceTokenDestUser2.add(expectedDestTokensTwei);
            assert.equal(expectedBalanceTokenDestUser2.valueOf(), tokenDestUser2Balance.valueOf(), "bad token balance");

            //check tokenSrc balance on user1
            let tokenSrcUser1Balance = await tokenSrc.balanceOf(user1);
            let expectedBalanceTokenSrcUser1 = startBalanceTokenSrcUser1.sub(srcAmountTwei);
            assert.equal(tokenSrcUser1Balance.valueOf(), expectedBalanceTokenSrcUser1.valueOf(), "bad token balance");

            //check token balance on reserve
            //tokenSrc
            reportedBalance = await tokenSrc.balanceOf(reserve2.address);
            assert.equal(reportedBalance.valueOf(), reserve2TokenBalance[tokenSrcInd].valueOf(), "bad token balance on reserve");

            //tokenDest
            if (tokenDestInd != 0) {
                reportedBalance = await tokenDest.balanceOf(reserve1.address);
            } else {
                reportedBalance = await tokenDest.balanceOf(walletForToken);
            }

            assert.equal(reportedBalance.valueOf(), reserve1TokenBalance[tokenDestInd].valueOf(), "bad token balance on reserve");
            reportedBalance = await tokenDest.balanceOf(reserve2.address);
            assert.equal(reportedBalance.valueOf(), reserve2TokenBalance[tokenDestInd].valueOf(), "bad token balance on reserve");

            await pricing1.enableTokenTrade(tokenAdd[tokenSrcInd]);
            await pricing2.enableTokenTrade(tokenAdd[tokenDestInd]);
        } catch(e) {
            await pricing1.enableTokenTrade(tokenAdd[tokenSrcInd]);
            await pricing2.enableTokenTrade(tokenAdd[tokenDestInd]);
            throw(e);
        }
    });

    it("should test token to token trade with limited max dest amount.", async function () {
        //when limiting max dest amount can't work with small numbers.
        //it has some issue as follows:
//        when user request maxDestAmount for a trade, we re-calculate the src amount so he would get the exact amount he requested.
//
//        lets assume user wants SOME token which converts 1 eth to 100 SOME.
//        what could happen
//
//        user requests max dest amount of 101 SOME tokens.
//        we re calculate source amount and round it up to 2 (the naive calculation would round it to 1).
//        now trade it 2 ether --> 101 SOME.
//        on the end of our trade a check sure user wasn't "cheated" with this formula:
//        require(
//        (userDestBalanceAfter - userDestBalanceBefore)
//        >=
//        calcDstQty((userSrcBalanceBefore - userSrcBalanceAfter), ..., ...., minConversionRate));
//        min conversion rate here could be around 95-100 so according to this calculation user should get "at least" 190 SOME. but he got only 101 so - trade is reverted.

        let tokenSrcInd = 0;
        let tokenDestInd = 1;
        let tokenSrc = tokens[tokenSrcInd];
        let tokenDest = tokens[tokenDestInd];
        let srcAmountTwei = (new BigNumber(10)).pow(5);
        let maxDestAmount = (new BigNumber(10)).pow(5);

        await pricing2.disableTokenTrade(tokenAdd[tokenSrcInd], {from: alerter});
        await pricing1.disableTokenTrade(tokenAdd[tokenDestInd], {from: alerter});

        //rate
        let buyRate = await networkProxy.getExpectedRate(tokenAdd[tokenSrcInd], tokenAdd[tokenDestInd], srcAmountTwei.valueOf());

        //calculate rates
        // first token to eth rate
        let expected = calculateRateAmount(false, tokenSrcInd, srcAmountTwei, 1);
        let expectedSellRate = expected[0];
        let expectedEthQtyWei = expected[1];
        //            log('expectedEthQtyWei ' + expectedEthQtyWei)

        //eth to token
        expected = calculateRateAmount(true, tokenDestInd, expectedEthQtyWei, 2);
        let expectedBuyRate = expected[0];
        let expectedDestTokensTwei = expected[1];

        let combinedRate = calcCombinedRate(srcAmountTwei, expectedSellRate, expectedBuyRate, tokenDecimals[tokenSrcInd], tokenDecimals[tokenDestInd], expectedDestTokensTwei);

//        check correct rate calculated
        assert.equal(buyRate[0].valueOf(), combinedRate.valueOf(), "unexpected rate.");

        //calc real amounts from max
        //api:  calcSrcQty(dstQty, srcDecimals, dstDecimals, rate)
        let expectedEthQtyWeiForDestTokens = calcSrcQty(maxDestAmount, 18, tokenDecimals[tokenDestInd], expectedBuyRate);
//        log('expectedEthQtyWeiForDestTokens for maxDest amount ' + expectedEthQtyWeiForDestTokens);

        let expectedSrcTweiForWeiAmount = calcSrcQty(expectedEthQtyWeiForDestTokens, tokenDecimals[tokenSrcInd], 18, expectedSellRate);
//        log('expectedSrcForMaxAmount ' + expectedSrcForMaxAmount.valueOf())

        // perform trade
        // transfer funds to user and approve funds to network - for all trades in this 'it'
        await tokenSrc.transfer(user2, srcAmountTwei);
        await tokenSrc.approve(networkProxy.address, srcAmountTwei, {from:user2})

        let startBalanceNetworkWei =  await Helper.getBalancePromise(network.address);
        let startBalanceNetworkTokDest = await tokenDest.balanceOf(network.address);
        let startBalanceTokenDestUser1 = await tokenDest.balanceOf(user1);
        let startBalanceTokenSrcUser2 = await tokenSrc.balanceOf(user2);
//        function trade(src, srcAmount, dest, destAddress, maxDestAmount, minConversionRate, walletId)
        result = await networkProxy.trade(tokenAdd[tokenSrcInd], srcAmountTwei, tokenAdd[tokenDestInd], user1, maxDestAmount,
                            buyRate[1].valueOf(), walletId, {from:user2});
//        console.log(result.logs);
//        console.log(result.logs[0].args);
//        console.log(result.logs[1].args);
//        console.log(result.logs[4].args);

//        check token balances
        /////////////////////

        //check tokenDest balance on user1
        let rate = new BigNumber(buyRate[0].valueOf());
        let tokenDestUser1Balance = await tokenDest.balanceOf(user1);
        let expectedBalanceTokenDestUser1 = startBalanceTokenDestUser1.add(maxDestAmount);
        assert.equal(expectedBalanceTokenDestUser1.valueOf(), tokenDestUser1Balance.valueOf(), "bad token balance");

        //check tokenSrc balance on user2
        let tokenSrcUser2Balance = await tokenSrc.balanceOf(user2);
        let expectedBalanceTokenSrcUser2 = startBalanceTokenSrcUser2.sub(expectedSrcTweiForWeiAmount);
        assert.equal(tokenSrcUser2Balance.valueOf(), expectedBalanceTokenSrcUser2.valueOf(), "bad token balance");

        //check token balance on reserve
        //tokenSrc
        reserve1TokenBalance[tokenSrcInd] = reserve1TokenBalance[tokenSrcInd].add(expectedSrcTweiForWeiAmount);
        reserve1TokenImbalance[tokenSrcInd] = reserve1TokenImbalance[tokenSrcInd].sub(expectedSrcTweiForWeiAmount); //imbalance represents how many missing tokens
        if(tokenSrcInd != 0) {
            reportedBalance = await tokenSrc.balanceOf(reserve1.address);
        } else {
            reportedBalance = await tokenSrc.balanceOf(walletForToken);
        }
        assert.equal(reportedBalance.valueOf(), reserve1TokenBalance[tokenSrcInd], "bad token balance on reserve");

        //tokenDest
        reserve2TokenBalance[tokenDestInd] = reserve2TokenBalance[tokenDestInd].sub(maxDestAmount);
        //notice here the reserve sends expectedDestTwei - its not aware of max dest amount
        reserve2TokenImbalance[tokenDestInd] = reserve2TokenImbalance[tokenDestInd].add(maxDestAmount); //imbalance represents how many missing tokens
        reportedBalance = await tokenDest.balanceOf(reserve2.address);
        assert.equal(reportedBalance.valueOf(), reserve2TokenBalance[tokenDestInd].valueOf(), "bad token balance on reserve");

        //////////////////////////////
        //notice, network will also have some minor balance, since we calculate src rate according to max Dest.
        //reserve sends network amount according to src and rate. network sends amount according to maxDest it requested.
        //outcome is some leftover Weis in network contract.
        ////////////////////
        let expectedSentWeiFromTrade1ToNetwork = calcDstQty(expectedSrcTweiForWeiAmount, tokenDecimals[tokenSrcInd], 18, expectedSellRate);

        let expectedNetworkWei = expectedSentWeiFromTrade1ToNetwork.add(startBalanceNetworkWei).sub(expectedEthQtyWeiForDestTokens);
        let networkBalanceWei = await Helper.getBalancePromise(network.address);
//        log("networkBalanceWei " + networkBalanceWei + " expectedNetworkWei " + expectedNetworkWei)
        assert.equal(networkBalanceWei.valueOf(), expectedNetworkWei.valueOf(), "network should have different wei balance");

        let networkBalanceTweiDest = await tokenDest.balanceOf(network.address);
        let expectedDestTwei = calcDstQty(expectedEthQtyWeiForDestTokens, 18, tokenDecimals[tokenDestInd], expectedBuyRate);
        let expecteNetworkDestTwei = expectedDestTwei.add(startBalanceNetworkTokDest).sub(maxDestAmount);
        assert.equal(networkBalanceTweiDest.valueOf(), expecteNetworkDestTwei.valueOf(), "network should have different wei balance");

        await pricing2.enableTokenTrade(tokenAdd[tokenSrcInd]);
        await pricing1.enableTokenTrade(tokenAdd[tokenDestInd]);
    });

    it("should test token to token - limited max dest amount - different numbers.", async function () {
        let tokenSrcInd = 1;
        let tokenDestInd = 2;
        let tokenSrc = tokens[tokenSrcInd];
        let tokenDest = tokens[tokenDestInd];
        let srcAmountTwei = new BigNumber(7853);
        let maxDestAmount = new BigNumber(8500);

        await pricing2.disableTokenTrade(tokenAdd[tokenSrcInd], {from: alerter});
        await pricing1.disableTokenTrade(tokenAdd[tokenDestInd], {from: alerter});

        //rate
        let buyRate = await networkProxy.getExpectedRate(tokenAdd[tokenSrcInd], tokenAdd[tokenDestInd], srcAmountTwei.valueOf());

        //calculate rates
        // first token to eth rate
        let expected = calculateRateAmount(false, tokenSrcInd, srcAmountTwei, 1);
        let expectedSellRate = expected[0];
        let expectedEthQtyWei = expected[1];
        //            log('expectedEthQtyWei ' + expectedEthQtyWei)

        //eth to token
        expected = calculateRateAmount(true, tokenDestInd, expectedEthQtyWei, 2);
        let expectedBuyRate = expected[0];
        let expectedDestTokensTwei = expected[1];

        let combinedRate = calcCombinedRate(srcAmountTwei, expectedSellRate, expectedBuyRate, tokenDecimals[tokenSrcInd], tokenDecimals[tokenDestInd], expectedDestTokensTwei);

        //        check correct rate calculated
        assert.equal(buyRate[0].valueOf(), combinedRate.valueOf(), "unexpected rate.");

        //calc real amounts from max
        //api:  calcSrcQty(dstQty, srcDecimals, dstDecimals, rate)
        let expectedEthQtyWeiForDestTokens = calcSrcQty(maxDestAmount, 18, tokenDecimals[tokenDestInd], expectedBuyRate);
        //        log('expectedEthQtyWeiForDestTokens for maxDest amount ' + expectedEthQtyWeiForDestTokens);

        let expectedSrcTweiForWeiAmount = calcSrcQty(expectedEthQtyWeiForDestTokens, tokenDecimals[tokenSrcInd], 18, expectedSellRate);
        //        log('expectedSrcForMaxAmount ' + expectedSrcForMaxAmount.valueOf())

        // perform trade
        // transfer funds to user and approve funds to network - for all trades in this 'it'
        await tokenSrc.transfer(user2, srcAmountTwei);
        await tokenSrc.approve(networkProxy.address, srcAmountTwei, {from:user2})

        let startBalanceNetworkWei =  await Helper.getBalancePromise(network.address);
        let startBalanceNetworkTokDest = await tokenDest.balanceOf(network.address);
        let startBalanceTokenDestUser1 = await tokenDest.balanceOf(user1);
        let startBalanceTokenSrcUser2 = await tokenSrc.balanceOf(user2);

        //        function trade(src, srcAmount, dest, destAddress, maxDestAmount, minConversionRate, walletId)
        result = await networkProxy.trade(tokenAdd[tokenSrcInd], srcAmountTwei, tokenAdd[tokenDestInd], user1, maxDestAmount,
                         buyRate[1].valueOf(), walletId, {from:user2});
        //        console.log(result.logs);
        //        console.log(result.logs[0].args);
        //        console.log(result.logs[1].args);
        //        console.log(result.logs[4].args);

        //        check token balances
        /////////////////////

        //check tokenDest balance on user1
        let rate = new BigNumber(buyRate[0].valueOf());
        let tokenDestUser1Balance = await tokenDest.balanceOf(user1);
        let expectedBalanceTokenDestUser1 = startBalanceTokenDestUser1.add(maxDestAmount);
        assert.equal(expectedBalanceTokenDestUser1.valueOf(), tokenDestUser1Balance.valueOf(), "bad token balance");

        //check tokenSrc balance on user2
        let tokenSrcUser2Balance = await tokenSrc.balanceOf(user2);
        let expectedBalanceTokenSrcUser2 = startBalanceTokenSrcUser2.sub(expectedSrcTweiForWeiAmount);
        assert.equal(tokenSrcUser2Balance.valueOf(), expectedBalanceTokenSrcUser2.valueOf(), "bad token balance");

        //check token balance on reserve
        //tokenSrc
        reserve1TokenBalance[tokenSrcInd] = reserve1TokenBalance[tokenSrcInd].add(expectedSrcTweiForWeiAmount);
        reserve1TokenImbalance[tokenSrcInd] = reserve1TokenImbalance[tokenSrcInd].sub(expectedSrcTweiForWeiAmount); //imbalance represents how many missing tokens
        reportedBalance = await tokenSrc.balanceOf(reserve1.address);
        assert.equal(reportedBalance.valueOf(), reserve1TokenBalance[tokenSrcInd], "bad token balance on reserve");

        //tokenDest
        reserve2TokenBalance[tokenDestInd] = reserve2TokenBalance[tokenDestInd].sub(maxDestAmount);
        //notice here the reserve sends expectedDestTwei - its not aware of max dest amount
        reserve2TokenImbalance[tokenDestInd] = reserve2TokenImbalance[tokenDestInd].add(maxDestAmount); //imbalance represents how many missing tokens
        reportedBalance = await tokenDest.balanceOf(reserve2.address);
        assert.equal(reportedBalance.valueOf(), reserve2TokenBalance[tokenDestInd].valueOf(), "bad token balance on reserve");

        //////////////////////////////
        //notice, network will also have some minor balance, since we calculate src rate according to max Dest.
        //reserve sends network amount according to src and rate. network sends amount according to maxDest it requested.
        //outcome is some leftover Weis in network contract.
        ////////////////////
        let expectedSentWeiFromTrade1ToNetwork = calcDstQty(expectedSrcTweiForWeiAmount, tokenDecimals[tokenSrcInd], 18, expectedSellRate);

        let expectedNetworkWei = expectedSentWeiFromTrade1ToNetwork.add(startBalanceNetworkWei).sub(expectedEthQtyWeiForDestTokens);
        let networkBalanceWei = await Helper.getBalancePromise(network.address);
        //        log("networkBalanceWei " + networkBalanceWei + " expectedNetworkWei " + expectedNetworkWei)
        assert.equal(networkBalanceWei.valueOf(), expectedNetworkWei.valueOf(), "network should have different wei balance");

        let networkBalanceTweiDest = await tokenDest.balanceOf(network.address);
        let expectedDestTwei = calcDstQty(expectedEthQtyWeiForDestTokens, 18, tokenDecimals[tokenDestInd], expectedBuyRate);
        let expecteNetworkDestTwei = expectedDestTwei.add(startBalanceNetworkTokDest).sub(maxDestAmount);
        assert.equal(networkBalanceTweiDest.valueOf(), expecteNetworkDestTwei.valueOf(), "network should have different wei balance");

        await pricing2.enableTokenTrade(tokenAdd[tokenSrcInd]);
        await pricing1.enableTokenTrade(tokenAdd[tokenDestInd]);
    });


    it("should verify revert when token to token trade with same src and dest token.", async function () {
        let tokenSrcInd = 1;
        let tokenDestInd = 1;
        let tokenSrc = tokens[tokenSrcInd];
        let tokenDest = tokens[tokenDestInd];
        let srcAmountTwei = 136;
        let maxDestAmount = (new BigNumber(10)).pow(18);

        rate = await networkProxy.getExpectedRate(tokenSrc.address, tokenDest.address, srcAmountTwei.valueOf());

        let ethBalance = await Helper.getBalancePromise(reserve1.address);
        ethBalance = await Helper.getBalancePromise(reserve2.address);
        let destTokBalance = await tokenDest.balanceOf(reserve1.address)
        destTokBalance = await tokenDest.balanceOf(reserve2.address)

        let expectedDestAmount = calcDstQty(srcAmountTwei, tokenDecimals[tokenSrcInd], tokenDecimals[tokenDestInd], rate[0]);

        await tokenSrc.transfer(user1, srcAmountTwei);
        await tokenSrc.approve(networkProxy.address, srcAmountTwei, {from:user1})

        let user1SrcTokBalanceBefore = new BigNumber(await tokenSrc.balanceOf(user1));
        let user2DestTokBalanceBefore = new BigNumber(await tokenDest.balanceOf(user2));

        //log("trade " + i + " srcInd: " + tokenSrcInd + " dest ind: " + tokenDestInd + " srcQty: " + srcAmountTwei);
        //see trade reverts
        try {
            let result = await networkProxy.trade(tokenSrc.address, srcAmountTwei.valueOf(), tokenDest.address, user2, maxDestAmount.valueOf(),
                  rate[1].valueOf(), walletId, {from:user1});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected revert but got: " + e);
        }

        let expectedUser1SrcTokBalanceAfter = user1SrcTokBalanceBefore;
        let expectedUser2DestTokBalanceAfter = user2DestTokBalanceBefore;

        let user1SrcTokBalanceAfter = await tokenSrc.balanceOf(user1);
        let user2DestTokBalanceAfter = await tokenDest.balanceOf(user2);

        assert.equal(user1SrcTokBalanceAfter.valueOf(), expectedUser1SrcTokBalanceAfter.valueOf());
        assert.equal(user2DestTokBalanceAfter.valueOf(), expectedUser2DestTokBalanceAfter.valueOf(), "expect no balance change...")
        assert(user2DestTokBalanceAfter.valueOf() >= expectedUser2DestTokBalanceAfter.valueOf(), "not enough dest token transferred");
    });

    it("test token to token, a few trades, both reserves.", async function () {
        let tokenSrcInd;
        let tokenDestInd;
        let tokenSrc = tokens[tokenSrcInd];
        let tokenDest = tokens[tokenDestInd];
        let maxDestAmount = (new BigNumber(10)).pow(17);

        let srcAmountTwei = new BigNumber(3450 - (1 * 1960));
        let cumulativeGas = new BigNumber(0);
        let numTrades = 19;
        for (let i = 0; i < numTrades; i++) {
            tokenSrcInd = (i + 1) % numTokens;
            tokenDestInd = i % numTokens;
            tokenSrc = tokens[tokenSrcInd];
            tokenDest = tokens[tokenDestInd];
            srcAmountTwei = new BigNumber(17 + (i * 168));
//            srcAmountTwei = new BigNumber(743);

//            log("src amount: " + srcAmountTwei.valueOf() + " index src: " + tokenSrcInd + " tokenSrc: " + tokenSrc.address + " ind: " + tokenDestInd + " token dest " + tokenDest.address);
            rate = await networkProxy.getExpectedRate(tokenSrc.address, tokenDest.address, srcAmountTwei.valueOf());

            let ethBalance = await Helper.getBalancePromise(reserve1.address);
//            log("eth balance 1 " + ethBalance);
            ethBalance = await Helper.getBalancePromise(reserve2.address);
//            log("eth balance 2 " + ethBalance);
            let destTokBalance = await tokenDest.balanceOf(reserve1.address)
//            log("dest token balance 1 " + destTokBalance);
            destTokBalance = await tokenDest.balanceOf(reserve2.address)
//            log("dest token balance 2 " + destTokBalance);

//            log(i  + " expected rate: " + rate.valueOf());
            let expectedDestAmount = calcDstQty(srcAmountTwei, tokenDecimals[tokenSrcInd], tokenDecimals[tokenDestInd], rate[0]);
//            log ("src Amount: " + srcAmountTwei.valueOf() +  " expected dest: " + expectedDestAmount.valueOf())

            await tokenSrc.transfer(user1, srcAmountTwei);
            await tokenSrc.approve(networkProxy.address, srcAmountTwei, {from:user1})

            let user1SrcTokBalanceBefore = new BigNumber(await tokenSrc.balanceOf(user1));
            let user2DestTokBalanceBefore = new BigNumber(await tokenDest.balanceOf(user2));

//            log("trade " + i + " srcInd: " + tokenSrcInd + " dest ind: " + tokenDestInd + " srcQty: " + srcAmountTwei);
            let result = await networkProxy.trade(tokenSrc.address, srcAmountTwei.valueOf(), tokenDest.address, user2, maxDestAmount.valueOf(),
                                 rate[1].valueOf(), walletId, {from:user1});
            cumulativeGas = cumulativeGas.add(result.receipt.gasUsed);

            let expectedUser1SrcTokBalanceAfter = user1SrcTokBalanceBefore.sub(srcAmountTwei);
            let expectedUser2DestTokBalanceAfter = user2DestTokBalanceBefore.add(expectedDestAmount);

            let user1SrcTokBalanceAfter = await tokenSrc.balanceOf(user1);
            let user2DestTokBalanceAfter = await tokenDest.balanceOf(user2);

            //for token to token can't calculate the exact dest amount.
            //since this trade is done in two steps. src --> eth. then eth-->dest. the decimals data is lost.
            //since EVM has no decimals.
            //but rate reflects rate1 * rate2. and doesn't reflect the lost decimals between step 1 and step 2.
            assert.equal(user1SrcTokBalanceAfter.valueOf(), expectedUser1SrcTokBalanceAfter.valueOf());
            assert(1 >= (user2DestTokBalanceAfter.sub(expectedUser2DestTokBalanceAfter)).valueOf(), " diff from calculated rate to actual balance should be 1")
//            log("expected trade value: " + expectedDestAmount)
            assert(user2DestTokBalanceAfter.valueOf() >= expectedUser2DestTokBalanceAfter.valueOf(), "not enough dest token transferred");
        };
    });


    it("init smart malicious network and set all contracts and params", async function () {
        maliciousNetwork = await MaliciousNetwork.new(admin);
        await maliciousNetwork.addOperator(operator);

        await reserve1.setContracts(maliciousNetwork.address, pricing1.address, 0);
        await reserve2.setContracts(maliciousNetwork.address, pricing2.address, 0);

        // add reserves
        await maliciousNetwork.addReserve(reserve1.address, true);
        await maliciousNetwork.addReserve(reserve2.address, true);

        await maliciousNetwork.setKyberProxy(networkProxy.address);

        await networkProxy.setKyberNetworkContract(maliciousNetwork.address);

        //set contracts
        await maliciousNetwork.setWhiteList(whiteList.address);
        await maliciousNetwork.setExpectedRate(expectedRate.address);
        await maliciousNetwork.setFeeBurner(feeBurner.address);
        await maliciousNetwork.setParams(gasPrice.valueOf(), negligibleRateDiff);
        await maliciousNetwork.setEnable(true);
        let price = await maliciousNetwork.maxGasPrice();
        assert.equal(price.valueOf(), gasPrice.valueOf());

        //list tokens per reserve
        for (let i = 0; i < numTokens; i++) {
            await maliciousNetwork.listPairForReserve(reserve1.address, tokenAdd[i], true, true, true);
            await maliciousNetwork.listPairForReserve(reserve2.address, tokenAdd[i], true, true, true);
        }
    });

    it("verify sell with malicious network reverts when using exact rate as min rate", async function () {
        //trade data
        let tokenInd = 2;
        let token = tokens[tokenInd]; //choose some token
        let amountTwei = 1123;

        //disable reserve 1
        await reserve1.disableTrade({from:alerter});

        // trade with steeling reverts
        //////////////////////////////

        let myWalletAddress = await maliciousNetwork.myWallet();
        let myWallBalance = await Helper.getBalancePromise(myWalletAddress);

        //set steal amount to 1 wei
        let myFee = 1;
        await maliciousNetwork.setMyFeeWei(myFee);
        let rxFeeWei = await maliciousNetwork.myFeeWei();
        assert.equal(rxFeeWei.valueOf(), myFee);

        //get rate
        let rate = await networkProxy.getExpectedRate(tokenAdd[tokenInd], ethAddress, amountTwei);

        await token.transfer(user1, amountTwei);
        await token.approve(networkProxy.address, amountTwei, {from:user1})

        //see trade reverts
        try {
            await networkProxy.trade(tokenAdd[tokenInd], amountTwei, ethAddress, user2, 500000,
                 rate[0].valueOf(), walletId, {from:user1});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected revert but got: " + e);
        }

        //set steal fee to 0 and see trade success
        await maliciousNetwork.setMyFeeWei(0);
        rxFeeWei = await maliciousNetwork.myFeeWei();
        assert.equal(rxFeeWei.valueOf(), 0);

        await networkProxy.trade(tokenAdd[tokenInd], amountTwei, ethAddress, user2, 500000,
                     rate[0].valueOf(), walletId, {from:user1});
        await reserve1.enableTrade({from:admin});
    });

    it("verify buy with malicious network reverts when using exact rate as min rate", async function () {
        //trade data
        let tokenInd = 2;
        let token = tokens[tokenInd]; //choose some token
        let amountWei = 960;

        // trade with steeling reverts
        //////////////////////////////

        //set "myFee" (malicious) amount to 1 wei
        let myFee = 1;
        await maliciousNetwork.setMyFeeWei(myFee);
        let rxFeeWei = await maliciousNetwork.myFeeWei();
        assert.equal(rxFeeWei.valueOf(), myFee);

        //get rate
        let rate = await networkProxy.getExpectedRate(ethAddress, tokenAdd[tokenInd], amountWei);

        //see trade reverts
        try {
            await networkProxy.trade(ethAddress, amountWei, tokenAdd[tokenInd], user2, 500000,
                 rate[0].valueOf(), walletId, {from:user1, value: amountWei});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected revert but got: " + e);
        }

        //set steal fee to 0 and see trade success
        await maliciousNetwork.setMyFeeWei(0);

        await networkProxy.trade(ethAddress, amountWei, tokenAdd[tokenInd], user2, 500000,
                rate[0].valueOf(), walletId, {from:user1, value: amountWei});
    });

    it("verify buy with malicious network reverts when using slippage rate as min rate - depending on taken amount", async function () {
        //trade data
        let tokenInd = 2;
        let token = tokens[tokenInd]; //choose some token
        let amountWei = 960;

        // trade with steeling reverts
        //////////////////////////////

        //get rate
        let rate = await networkProxy.getExpectedRate(ethAddress, tokenAdd[tokenInd], amountWei);

        //use "small fee"
        let mySmallFee = 3;
        await maliciousNetwork.setMyFeeWei(mySmallFee);
        let rxFeeWei = await maliciousNetwork.myFeeWei();
        assert.equal(rxFeeWei.valueOf(), mySmallFee);

        //with slippage as min rate doesn't revert
        await networkProxy.trade(ethAddress, amountWei, tokenAdd[tokenInd], user2, 500000,
                rate[1].valueOf(), walletId, {from:user1, value: amountWei});

        //with higher fee should revert
        mySmallFee = 4;
        await maliciousNetwork.setMyFeeWei(mySmallFee);
        rxFeeWei = await maliciousNetwork.myFeeWei();
        assert.equal(rxFeeWei.valueOf(), mySmallFee);

        //see trade reverts
        try {
            await networkProxy.trade(ethAddress, amountWei, tokenAdd[tokenInd], user2, 500000,
                 rate[1].valueOf(), walletId, {from:user1, value: amountWei});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected revert but got: " + e);
        }

    });

    it("verify when user sets min rate to 0 all tokens can be stolen", async function () {
        //trade data
        let tokenInd = 3;
        let token = tokens[tokenInd]; //choose some token
        let amountWei = 125;

        // trade with steeling reverts
        //////////////////////////////
        //get rate
        let myWalletAddress = await maliciousNetwork.myWallet();
        let myWallBalance = await Helper.getBalancePromise(myWalletAddress);

        let rate = await networkProxy.getExpectedRate(ethAddress, tokenAdd[tokenInd], amountWei);

        //calc dest amount
        let expectedDest = (new BigNumber(amountWei)).mul(rate[0].valueOf()).div(precisionUnits);

        //expected dest has 1 wei error
        let mySmallFee = expectedDest - 1;
        await maliciousNetwork.setMyFeeWei(mySmallFee);
        let rxFeeWei = await maliciousNetwork.myFeeWei();
        assert.equal(rxFeeWei.valueOf(), mySmallFee);

        let myWalletStartBalance =  await token.balanceOf(myWalletAddress);

        //with min rate 0
        await networkProxy.trade(ethAddress, amountWei, tokenAdd[tokenInd], user2, 500000,
                0, walletId, {from:user1, value: amountWei});

        let myWalletExpectedBalance = (new BigNumber(myWalletStartBalance)).add(mySmallFee);
        let balance = await token.balanceOf(myWalletAddress);

        assert.equal(balance.valueOf(), myWalletExpectedBalance.valueOf())
    });

    it("init malicious network returning wrong actual dest, and set all contracts and params", async function () {
        maliciousNetwork2 = await MaliciousNetwork2.new(admin);
        await maliciousNetwork2.addOperator(operator);

        await reserve1.setContracts(maliciousNetwork2.address, pricing1.address, 0);
        await reserve2.setContracts(maliciousNetwork2.address, pricing2.address, 0);

        // add reserves
        await maliciousNetwork2.addReserve(reserve1.address, true);
        await maliciousNetwork2.addReserve(reserve2.address, true);

        await maliciousNetwork2.setKyberProxy(networkProxy.address);

        await networkProxy.setKyberNetworkContract(maliciousNetwork2.address);

        //set contracts
        await maliciousNetwork2.setWhiteList(whiteList.address);
        await maliciousNetwork2.setExpectedRate(expectedRate.address);
        feeBurner = await FeeBurner.new(admin, tokenAdd[0], maliciousNetwork2.address);
        await maliciousNetwork2.setFeeBurner(feeBurner.address);
        await maliciousNetwork2.setParams(gasPrice.valueOf(), negligibleRateDiff);
        await maliciousNetwork2.setEnable(true);
        let price = await maliciousNetwork2.maxGasPrice();
        assert.equal(price.valueOf(), gasPrice.valueOf());

        //list tokens per reserve
        for (let i = 0; i < numTokens; i++) {
            await maliciousNetwork2.listPairForReserve(reserve1.address, tokenAdd[i], true, true, true);
            await maliciousNetwork2.listPairForReserve(reserve2.address, tokenAdd[i], true, true, true);
        }
    });

    it("verify sell with malicious network2 reverts when using any min rate (0).", async function () {
        //trade data
        let tokenInd = 2;
        let token = tokens[tokenInd]; //choose some token
        let amountTwei = 1123;

        //disable reserve 1
        await reserve1.disableTrade({from:alerter});

        // trade with steeling reverts
        //////////////////////////////

        let myWalletAddress = await maliciousNetwork2.myWallet();
        let myWallBalance = await Helper.getBalancePromise(myWalletAddress);

        //set steal amount to 1 wei
        let myFee = 1;
        await maliciousNetwork2.setMyFeeWei(myFee);
        let rxFeeWei = await maliciousNetwork2.myFeeWei();
        assert.equal(rxFeeWei.valueOf(), myFee);

        //get rate
        let rate = await networkProxy.getExpectedRate(tokenAdd[tokenInd], ethAddress, amountTwei);

        await token.transfer(user1, amountTwei);
        await token.approve(networkProxy.address, amountTwei, {from:user1})

        //see trade reverts
        // with this malicious network it reverts since wrong actual dest amount is returned.
        try {
            let result = await networkProxy.trade(tokenAdd[tokenInd], amountTwei, ethAddress, user2, 500000,
                 0, walletId, {from:user1});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected revert but got: " + e);
        }

        //set steal fee to 0 and see trade success
        await maliciousNetwork2.setMyFeeWei(0);
        rxFeeWei = await maliciousNetwork2.myFeeWei();
        assert.equal(rxFeeWei.valueOf(), 0);

        await networkProxy.trade(tokenAdd[tokenInd], amountTwei, ethAddress, user2, 500000,
                     rate[0].valueOf(), walletId, {from:user1});
        await reserve1.enableTrade({from:admin});
    });

    it("verify buy with malicious network reverts with any rate (even 0) as min rate", async function () {
        //trade data
        let tokenInd = 2;
        let token = tokens[tokenInd]; //choose some token
        let amountWei = 960;

        // trade with steeling reverts
        //////////////////////////////

        //set "myFee" (malicious) amount to 1 wei
        let myFee = 2;
        await maliciousNetwork2.setMyFeeWei(myFee);
        let rxFeeWei = await maliciousNetwork2.myFeeWei();
        assert.equal(rxFeeWei.valueOf(), myFee);

        //get rate
        let rate = await networkProxy.getExpectedRate(ethAddress, tokenAdd[tokenInd], amountWei);

        //see trade reverts
        try {
            await networkProxy.trade(ethAddress, amountWei, tokenAdd[tokenInd], user2, 500000,
                 0, walletId, {from:user1, value: amountWei});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected revert but got: " + e);
        }

        //set steal fee to 0 and see trade success
        await maliciousNetwork2.setMyFeeWei(0);

        await networkProxy.trade(ethAddress, amountWei, tokenAdd[tokenInd], user2, 500000,
                rate[0].valueOf(), walletId, {from:user1, value: amountWei});
    });

    it("init network with no max dest check. set all contracts and params", async function () {
        networkNoMaxDest = await NetworkNoMaxDest.new(admin);
        await networkNoMaxDest.addOperator(operator);

        await reserve1.setContracts(networkNoMaxDest.address, pricing1.address, 0);
        await reserve2.setContracts(networkNoMaxDest.address, pricing2.address, 0);

        // add reserves
        await networkNoMaxDest.addReserve(reserve1.address, true);
        await networkNoMaxDest.addReserve(reserve2.address, true);

        await networkNoMaxDest.setKyberProxy(networkProxy.address);

        await networkProxy.setKyberNetworkContract(networkNoMaxDest.address);

        //set contracts
        await networkNoMaxDest.setWhiteList(whiteList.address);
        await networkNoMaxDest.setExpectedRate(expectedRate.address);
        feeBurner = await FeeBurner.new(admin, tokenAdd[0], networkNoMaxDest.address);
        await networkNoMaxDest.setFeeBurner(feeBurner.address);
        await networkNoMaxDest.setParams(gasPrice.valueOf(), negligibleRateDiff);
        await networkNoMaxDest.setEnable(true);
        let price = await networkNoMaxDest.maxGasPrice();
        assert.equal(price.valueOf(), gasPrice.valueOf());

        //list tokens per reserve
        for (let i = 0; i < numTokens; i++) {
            await networkNoMaxDest.listPairForReserve(reserve1.address, tokenAdd[i], true, true, true);
            await networkNoMaxDest.listPairForReserve(reserve2.address, tokenAdd[i], true, true, true);
        }
    });

    it("verify sell with low max dest amount reverts.", async function () {
        //trade data
        let tokenInd = 2;
        let token = tokens[tokenInd]; //choose some token
        let amountTwei = 721;

        //disable reserve 1
        await reserve1.disableTrade({from:alerter});

        //get rate
        let rate = await networkProxy.getExpectedRate(tokenAdd[tokenInd], ethAddress, amountTwei);

        // first token to eth rate
        let expected = calculateRateAmount(false, tokenInd, amountTwei, 2);
        let expectedEthQtyWei = expected[1];
        let lowMaxDest = expectedEthQtyWei - 80;

        await token.transfer(user1, amountTwei);
        await token.approve(networkProxy.address, amountTwei, {from:user1})

        //see trade reverts
        // with this malicious network it reverts since wrong actual dest amount is returned.
        try {
            await networkProxy.trade(tokenAdd[tokenInd], amountTwei, ethAddress, user2, lowMaxDest,
                 rate[1].valueOf(), walletId, {from:user1});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected revert but got: " + e);
        }

        //high max dest shouldn't revert
        await networkProxy.trade(tokenAdd[tokenInd], amountTwei, ethAddress, user2, (expectedEthQtyWei + 30 * 1),
                     rate[1].valueOf(), walletId, {from:user1});
        await reserve1.enableTrade({from:admin});
    });

    it("verify buy with network without max dest reverts if dest amount is below actual dest amount", async function () {
        //trade data
        let tokenInd = 2;
        let token = tokens[tokenInd]; //choose some token
        let amountWei = 960;

        //disable reserve 1
        await reserve1.disableTrade({from:alerter});

        //get rate
        let rate = await networkProxy.getExpectedRate(ethAddress, tokenAdd[tokenInd], amountWei);

        //eth to token
        expected = calculateRateAmount(true, tokenInd, amountWei, 2);
        let expectedDestTokensTwei = expected[1];
        let lowMaxDest = expectedDestTokensTwei - 13;

        //see trade reverts
        try {
            await networkProxy.trade(ethAddress, amountWei, tokenAdd[tokenInd], user2, lowMaxDest,
                 rate[1].valueOf(), walletId, {from:user1, value: amountWei});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected revert but got: " + e);
        }

        //high max dest shouldn't revert here
        await networkProxy.trade(ethAddress, amountWei, tokenAdd[tokenInd], user2, (expectedDestTokensTwei + 15),
                rate[0].valueOf(), walletId, {from:user1, value: amountWei});
        await reserve1.enableTrade({from:admin});
    });

    it("init 'generous' network with trade reverse direction, could result in overflow.", async function () {
        // in next tests - testing strange situasions that could cause overflow.
        // 1. if src token amount after trade is higher then src amount before trade.
        // 2. if dest amount for dest toekn after trade is lower then before trade
        generousNetwork = await GenerousNetwork.new(admin);
        await generousNetwork.addOperator(operator);

        await reserve1.setContracts(generousNetwork.address, pricing1.address, 0);
        await reserve2.setContracts(generousNetwork.address, pricing2.address, 0);

        // add reserves
        await generousNetwork.addReserve(reserve1.address, true);
        await generousNetwork.addReserve(reserve2.address, true);

        await generousNetwork.setKyberProxy(networkProxy.address);

        await networkProxy.setKyberNetworkContract(generousNetwork.address);

        //set contracts
        await generousNetwork.setWhiteList(whiteList.address);
        await generousNetwork.setExpectedRate(expectedRate.address);
        feeBurner = await FeeBurner.new(admin, tokenAdd[0], generousNetwork.address);
        await generousNetwork.setFeeBurner(feeBurner.address);
        await generousNetwork.setParams(gasPrice.valueOf(), negligibleRateDiff);
        await generousNetwork.setEnable(true);
        let price = await generousNetwork.maxGasPrice();
        assert.equal(price.valueOf(), gasPrice.valueOf());

        //list tokens per reserve
        for (let i = 0; i < numTokens; i++) {
            await generousNetwork.listPairForReserve(reserve1.address, tokenAdd[i], true, true, true);
            await generousNetwork.listPairForReserve(reserve2.address, tokenAdd[i], true, true, true);
        }
    });

    it("verify trade with reverses trade = (src address before is lower then source address after), reverts.", async function () {
        //trade data
        let tokenInd = numTokens - 1;
        let token = tokens[tokenInd]; //choose some token
        let amountTwei = 1313;

        //get rate
        let rate = await networkProxy.getExpectedRate(tokenAdd[tokenInd], ethAddress, amountTwei);

        let balanceBefore = await token.balanceOf(operator);
//        log("balance " + balanceBefore)
        await token.transferFrom(operator, operator, 755)
        balanceBefore = await token.balanceOf(operator);
        await token.transferFrom(operator, operator, 855)
        balanceBefore = await token.balanceOf(operator);

        await token.transfer(user1, amountTwei);
        await token.approve(networkProxy.address, amountTwei, {from:user1})

        //see trade reverts
        try {
            await networkProxy.trade(tokenAdd[tokenInd], amountTwei, ethAddress, user2, 9000000,
                 rate[1].valueOf(), walletId, {from:user1});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected revert but got: " + e);
        }
    });

    it("verify trade with reverses trade = (dest address after is lower then dest address before), reverts.", async function () {
        //trade data
        let tokenInd = numTokens - 1;
        let token = tokens[tokenInd]; //choose some token
        let amountWei = 1515;

        //get rate
        let rate = await networkProxy.getExpectedRate(ethAddress, tokenAdd[tokenInd], amountWei);
//        log("rate " + rate[0])

        //want user 2 to have some initial balance
        await token.transfer(user2, 2000);

        //see trade reverts
        try {
            await networkProxy.trade(ethAddress, amountWei, tokenAdd[tokenInd], user2, 9000000,
                 rate[1].valueOf(), walletId, {from:user1, value: amountWei});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected revert but got: " + e);
        }
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
        expectedRate = (new BigNumber(baseArray[tokenInd]));
        let dstQty = calcDstQty(srcQty, 18, tokenDecimals[tokenInd], expectedRate);
        let extraBps = getExtraBpsForBuyQuantity(dstQty);
        expectedRate = addBps(expectedRate, extraBps);
        let relevantImbalance = imbalanceArray[tokenInd] * 1 + dstQty * 1;
        extraBps = getExtraBpsForImbalanceBuyQuantity(relevantImbalance);
        expectedRate = addBps(expectedRate, extraBps);
        expectedAmount = calcDstQty(srcQty, 18, tokenDecimals[tokenInd], expectedRate);
    } else {
        expectedRate = (new BigNumber(baseArray[tokenInd]));
        let extraBps = getExtraBpsForSellQuantity(srcQty);
        expectedRate = addBps(expectedRate, extraBps);
        let relevantImbalance = imbalanceArray[tokenInd] - srcQty;
        extraBps = getExtraBpsForImbalanceSellQuantity(relevantImbalance.valueOf());
        expectedRate = addBps(expectedRate, extraBps);
        expectedAmount = calcDstQty(srcQty, tokenDecimals[tokenInd], 18, expectedRate);
    }
    expectedAmount = expectedAmount.floor();
    expectedRate = expectedRate.floor();

    expected = [expectedRate, expectedAmount];
    return expected;
}

function calcDstQty(srcQty, srcDecimals, dstDecimals, rate) {
    rate = new BigNumber(rate);
    if (dstDecimals >= srcDecimals) {
        let decimalDiff = (new BigNumber(10)).pow(dstDecimals - srcDecimals);
        return (rate.mul(srcQty).mul(decimalDiff).div(precisionUnits)).floor();
    } else {
        let decimalDiff = (new BigNumber(10)).pow(srcDecimals - dstDecimals);
        return (rate.mul(srcQty).div(decimalDiff.mul(precisionUnits))).floor();
    }
}

function calcSrcQty(dstQty, srcDecimals, dstDecimals, rate) {
    //source quantity is rounded up. to avoid dest quantity being too low.
    let srcQty;
    let numerator;
    let denominator;
    if (srcDecimals >= dstDecimals) {
        numerator = precisionUnits.mul(dstQty).mul((new BigNumber(10)).pow(srcDecimals - dstDecimals));
        denominator = new BigNumber(rate);
    } else {
        numerator = precisionUnits.mul(dstQty);
        denominator = (new BigNumber(rate)).mul((new BigNumber(10)).pow(dstDecimals - srcDecimals));
    }
    srcQty = (numerator.add(denominator.sub(1))).div(denominator).floor(); //avoid rounding down errors
    return srcQty;
}

function calcCombinedRate(srcQty, sellRate, buyRate, srcDecimals, dstDecimals, destQty) {
    let rate;
    if (false) {
        rate = (sellRate.mul(srcQty).div(precisionUnits).floor()).mul(buyRate).div(srcQty).floor();
    } else {
        if (dstDecimals >= srcDecimals) {
            rate = (precisionUnits.mul(destQty)).div(((new BigNumber(10)).pow(dstDecimals - srcDecimals)).mul(srcQty));
        } else {
            rate = (precisionUnits.mul(destQty).mul((new BigNumber(10)).pow(srcDecimals - dstDecimals))).div(srcQty);
        }
    }
    return rate.floor();
}

function log (string) {
    console.log(string);
};