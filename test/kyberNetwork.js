let ConversionRates = artifacts.require("./mockContracts/MockConversionRate.sol");
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

contract('KyberNetwork', function(accounts) {
    it("should init globals. init 2 ConversionRates Inst, init tokens and add to pricing inst. set basic data per token.", async function () {
        // set account addresses
        admin = accounts[0];
        networkProxy = accounts[0];
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
            token = await TestToken.new("test" + i, "tst" + i, tokenDecimals[i]);
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

    it("should init kyber network data, list token pairs.", async function () {
        // add reserves
        await network.addReserve(reserve1.address, true);
        await network.addReserve(reserve2.address, true);

        await network.setKyberProxy(networkProxy);

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
            let buyRate = await network.getExpectedRate(ethAddress, tokenAdd[tokenInd], amountWei);
            let expected = calculateRateAmount(true, tokenInd, amountWei, reserveIndex);
            let expectedRate = expected[0];
            let expectedTweiAmount = expected[1];

            expectedRate = calcCombinedRate(amountWei, precisionUnits, expectedRate, 18, tokenDecimals[tokenInd], expectedTweiAmount);

            //check correct rate calculated
            assert.equal(buyRate[0].valueOf(), expectedRate.valueOf(), "unexpected rate.");

            //perform trade
            let txData = await network.tradeWithHint(user1, ethAddress, amountWei, tokenAdd[tokenInd], user2, 50000,
                buyRate[1].valueOf(), walletId, 0, {from:networkProxy, value:amountWei});

//            log(txData.logs[0].args)
            let exactEthAdd = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
            assert.equal(txData.logs[0].args.srcAddress, user1, "src address");
            assert.equal(txData.logs[0].args.srcToken, exactEthAdd, "src token");
            assert.equal(txData.logs[0].args.srcAmount.valueOf(), amountWei);
            assert.equal(txData.logs[0].args.destAddress, user2);
            assert.equal(txData.logs[0].args.destToken, tokenAdd[tokenInd]);
            assert.equal(txData.logs[0].args.destAmount.valueOf(), expectedTweiAmount.valueOf());

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

    it("should disable 1 reserve. perform sell and check: balances changed as expected.", async function () {
        let tokenInd = 2;
        let token = tokens[tokenInd]; //choose some token
        let amountTwei = 1030 * 1;

        //disable reserve 1
        await reserve1.disableTrade({from:alerter});
        let reserveIndex = 2;
        try {
            //verify base rate
            let rate = await network.getExpectedRate(tokenAdd[tokenInd], ethAddress, amountTwei);
            let expected = calculateRateAmount(false, tokenInd, amountTwei, reserveIndex);
            let expectedRate = expected[0].valueOf();
            let expectedAmountWei = expected[1].valueOf();

            expectedRate = calcCombinedRate(amountTwei, expectedRate, precisionUnits, tokenDecimals[tokenInd], 18, expectedAmountWei);

            //check correct rate calculated
            assert.equal(rate[0].valueOf(), expectedRate.valueOf(), "unexpected rate.");

            await token.transfer(network.address, amountTwei);
//            await token.approve(network.address, amountTwei, {from:user1})

            //perform trade
            let balance = await Helper.getBalancePromise(reserve2.address);
            let txData = await network.tradeWithHint(user1, tokenAdd[tokenInd], amountTwei, ethAddress, user2, 500000,
                            rate[1].valueOf(), walletId, 0, {from:networkProxy});
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
        let rates = await network.getExpectedRate(ethAddress, tokenAdd[tokenInd], amountWei);

        let negligibleDiff = 1 * (await network.negligibleRateDiff());
        //make sure reserve 2 has higher buy rate > negligibleDiff
        if ((buyRate2 * 10000 / (10000 + negligibleDiff) <= buyRate1)) {
            assert(false, "buy rate reserve 2 not bigger by negligibleDiff: " + (negligibleDiff / 10000));
        }

//        log("buy rate 1: " + buyRate1 + " buyRate2 " + buyRate2 + " diff rate: " + (buyRate2 * 10000 / (10000 + negligibleDiff)) );
        //perform trade
        let txData = await network.tradeWithHint(user1, ethAddress, amountWei, tokenAdd[tokenInd], user1, 800, rates[1].valueOf(),
                            walletId, 0, {from:networkProxy, value:amountWei});
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
        let rates = await network.getExpectedRate(tokenAdd[tokenInd], ethAddress, amountTwei);

        //make sure reserve 1 has higher sell rate > negligibleDiff
        let sellRate1MinEps = sellRate1 * 10000 / (10000 * 1 + negligibleDiff * 1);
        if (sellRate1MinEps <= sellRate2) {
            assert(false, "rate too small. rate1: " + sellRate1 + " rate1minEps " + sellRate1MinEps + " rate2 " + sellRate2);
        }

        // transfer funds to user and approve funds to network
        await token.transfer(network.address, amountTwei);
//        await token.approve(network.address, amountTwei, {from:user1})

        // start balance for user2.
        const startEtherBalanceUser2 = new BigNumber(await Helper.getBalancePromise(user2));

        //perform trade
        //API: trade(ERC20 src, srcAmount, ERC20 dest, destAddress, maxDestAmount, minConversionRate, walletId)
        let txData = await network.tradeWithHint(user1, tokenAdd[tokenInd], amountTwei, ethAddress, user2, 300000, rates[1].valueOf(),
                        walletId, 0, {from:networkProxy, value:0});
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

        let rates = await network.getExpectedRate(tokenAdd[tokenInd], ethAddress, amountTwei);
        let minRate = rates[0].valueOf();

        // transfer funds to user and approve funds to network
        await token.transfer(network.address, amountTwei);
//        await token.approve(network.address, amountTwei, {from:user1})

        //perform full amount trade. see token balance on user 1 zero
        let txData = await network.tradeWithHint(user1, tokenAdd[tokenInd], amountTwei, ethAddress, user2, maxDestAmountHigh,
                            minRate, walletId, 0, {from:networkProxy});
        console.log("trade token to ether. gas used: " + txData.receipt.gasUsed)

        //check token balance on user1 is zero
        let tokenTweiBalance = await token.balanceOf(user1);
        assert.equal(tokenTweiBalance.valueOf(), 0, "bad token balance");

        // transfer funds to user and approve funds to network
        await token.transfer(network.address, amountTwei);
//        await token.approve(network.address, amountTwei, {from:user1})

        //user2 initial balance
        let user2InitBalance = await Helper.getBalancePromise(user2);

        rates = await network.getExpectedRate(tokenAdd[tokenInd], ethAddress, amountTwei);
        minRate = rates[1].valueOf();

        //perform blocked amount trade. see token balance on user 1 above zero
        let result = await network.tradeWithHint(user1, tokenAdd[tokenInd], amountTwei, ethAddress, user2, maxDestAmountLow,
                        minRate, walletId, 0, {from:networkProxy});

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

        let rates = await network.getExpectedRate(ethAddress, tokenAdd[tokenInd], amountWei);
        let minRate = rates[0].valueOf();

        let initialTokBalUser2 = token.balanceOf(user2);

        //perform full amount trade. see full token balance on user 2
        let txData = await network.tradeWithHint(user1, ethAddress, amountWei, tokenAdd[tokenInd], user2, maxDestAmountHigh,
                        minRate, walletId, 0, {from:networkProxy, value:amountWei});
        console.log("trade ether to token with low max dest amount. gas used: " + txData.receipt.gasUsed)

        let postTokenBalUser2 = await token.balanceOf(user2);

        let actualTradedTokens1 = postTokenBalUser2.valueOf()*1 - initialTokBalUser2.valueOf()*1;

        rates = await network.getExpectedRate(ethAddress, tokenAdd[tokenInd], amountWei);
        minRate = rates[0].valueOf();

        //perform limited amount trade
        let trade = await network.tradeWithHint(user1, ethAddress, amountWei, tokenAdd[tokenInd], user2, maxDestAmountLow,
                        minRate, walletId, 0, {from:networkProxy, value:amountWei});

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
            let txData = await network.tradeWithHint(user1, ethAddress, amountWei, tokenAdd[tokenInd], user2, maxDestAmount,
                            minRate, walletId, 0, {from:networkProxy, value:amountWei});
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

    it("should set reserve rate diff < negligibleDiff perform 20 sells in loop. make sure sells from both reserves.", async function () {
        let tokenInd = 3;
        let token = tokens[tokenInd]; //choose some token
        let amountTWei = 119;
        let numLoops = 20;

        // transfer funds to user and approve funds to network
        await token.transfer(network.address, amountTWei*numLoops);
//        await token.approve(network.address, amountTWei*numLoops, {from:user1})

        //compare reserve sell rates for token
        let sellRate1 = await reserve1.getConversionRate(tokenAdd[tokenInd], ethAddress, amountTWei, currentBlock + 10);
        let sellRate2 = await reserve2.getConversionRate(tokenAdd[tokenInd], ethAddress, amountTWei, currentBlock + 10);

        let negligibleDiff = 2000; // 750 / 10000 = 7.5%
        await network.setParams(gasPrice.valueOf(), negligibleDiff);

        //make sure reserve 1 has higher sell rate < negligibleDiff
        let sellRate1MinEps = sellRate1 * 10000 / (10000 * 1 + negligibleDiff * 1);
        if (sellRate1MinEps > sellRate2) {
            assert(false, "rate too small. rate1: " + sellRate1 + " rate1minEps " + sellRate1MinEps + " rate2 " + sellRate2);
        }

        //take initial balance from both reserves
        let tokPreBalance1 = new BigNumber(await token.balanceOf(reserve1.address));
        let tokPreBalance2 = new BigNumber(await token.balanceOf(reserve2.address));
        let ethPreBalance1 = new BigNumber(await Helper.getBalancePromise(reserve1.address));
        let ethPreBalance2 = new BigNumber(await Helper.getBalancePromise(reserve2.address));

        //perform 20 trades
        let minRate = 0;
        let maxDestAmount = 90000;
        let cumulativeGas = new BigNumber(0);
        for (let i = 0; i < numLoops; i++){
            let txData = await network.tradeWithHint(user1, tokenAdd[tokenInd], amountTWei, ethAddress, user2, maxDestAmount,
                        minRate, walletId, 0, {from:networkProxy});
            cumulativeGas = cumulativeGas.add(txData.receipt.gasUsed);
        }
        let avgGas = cumulativeGas.div(numLoops);
        log("average gas usage " + numLoops + " sells. token to ether: " + avgGas.floor().valueOf());

        //again take balance from both reserves
        let tokPostBalance1 = new BigNumber(await token.balanceOf(reserve1.address));
        let tokPostBalance2 = new BigNumber(await token.balanceOf(reserve2.address));
        let ethPostBalance1 = new BigNumber(await Helper.getBalancePromise(reserve1.address));
        let ethPostBalance2 = new BigNumber(await Helper.getBalancePromise(reserve2.address));

        //check lower eth balance on both
        assert(ethPostBalance2.lt(ethPreBalance2), "expected more ether here.");
        assert(ethPostBalance1.lt(ethPreBalance1), "expected more ether here.");

        //check higher token balance on both
        assert(tokPostBalance1.gt(tokPreBalance1), "expected more token here.");
        assert(tokPostBalance2.gt(tokPreBalance2), "expected more token here.");

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
             await network.tradeWithHint(user1, ethAddress, amountWei, tokenAdd[tokenInd], user2, 2000,
                minConversionRate, walletId, 0, {from:networkProxy, value:amountWei});
             assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //enable trade
        await network.setEnable(true);

        await network.tradeWithHint(user1, ethAddress, amountWei, tokenAdd[tokenInd], user2, 2000,
                minConversionRate, walletId, 0, {from:networkProxy, value:amountWei});
    });

    it("should verify trade reverted when sender isn't networkProxy.", async function () {
        let tokenInd = 0;
        let token = tokens[tokenInd]; //choose some token
        let amountWei = 10000;
        let minConversionRate = 0;

        //perform trade
        try {
             await network.tradeWithHint(user1, ethAddress, amountWei, tokenAdd[tokenInd], user2, 2000,
                minConversionRate, walletId, 0, {from:user1, value:amountWei});
             assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        // same trade from network proxy
        await network.tradeWithHint(user1, ethAddress, amountWei, tokenAdd[tokenInd], user2, 2000,
                minConversionRate, walletId, 0, {from:networkProxy, value:amountWei});
    });

    it("should verify trade reverted when trade not sent from proxy.", async function () {
        let tokenInd = 0;
        let token = tokens[tokenInd]; //choose some token
        let amountWei = 98000;
        let minConversionRate = 0;

        //perform trade
        try {
             await network.tradeWithHint(user1, ethAddress, amountWei, tokenAdd[tokenInd], user2, 2000,
                minConversionRate, walletId, 0, {from:user1, value:amountWei});
             assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        await network.tradeWithHint(user1, ethAddress, amountWei, tokenAdd[tokenInd], user2, 2000,
                minConversionRate, walletId, 0, {from:networkProxy, value:amountWei});
    });

    it("should verify buy reverted when bad ether amount is sent.", async function () {
        let tokenInd = 0;
        let token = tokens[tokenInd]; //choose some token
        let amountWei = 83000;
        let minConversionRate = 0;

        //perform trade
        try {
             await network.tradeWithHint(user1, ethAddress, amountWei, tokenAdd[tokenInd], user2, 2000,
                minConversionRate, walletId, 0, {from:networkProxy, value:amountWei*1-1});
             assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        await network.tradeWithHint(user1, ethAddress, amountWei, tokenAdd[tokenInd], user2, 2000,
                minConversionRate, walletId, 0, {from:networkProxy, value:amountWei});
    });

    it("should verify sell reverted when not enough token allowance.", async function () {
        let tokenInd = 1;
        let token = tokens[tokenInd]; //choose some token
        let amountTWei = 15*1;

        // transfer funds to user and approve funds to network
        await token.transfer(network.address, amountTWei*1-1);
//        await token.approve(network.address, amountTWei*1-1, {from:user1})

        try {
            await network.tradeWithHint(user1, tokenAdd[tokenInd], amountTWei.valueOf(), ethAddress, user2, 5000, 0, walletId, 0, {from:networkProxy});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //add missing allowance
        await token.transfer(network.address, 1);
//        await token.approve(network.address, amountTWei*1, {from:user1});

        //perform same trade
        await network.tradeWithHint(user1, tokenAdd[tokenInd], amountTWei.valueOf(), ethAddress, user2, 5000, 0, walletId, 0, {from:networkProxy});
    });

    it("should verify sell reverted when sent with ether value.", async function () {
        let tokenInd = 1;
        let token = tokens[tokenInd]; //choose some token
        let amountTWei = 15*1;

        // transfer funds to user and approve funds to network
        await token.transfer(network.address, amountTWei*1);
//        await token.approve(network.address, amountTWei*1, {from:user1})

        try {
            await network.tradeWithHint(user1, tokenAdd[tokenInd], amountTWei.valueOf(), ethAddress, user2, 5000, 0,
                walletId, 0, {from:networkProxy, value: 10});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //perform same trade
        await network.tradeWithHint(user1, tokenAdd[tokenInd], amountTWei.valueOf(), ethAddress, user2, 5000, 0, walletId, 0, {from:networkProxy, value: 0});
    });

    it("should verify trade reverted when dest amount (actual amount) is 0.", async function () {
        let tokenInd = 3;
        let token = tokens[tokenInd]; //choose some token
        let amountTweiLow = 1;
        let amountTWeiHi = 80;

        // transfer funds to user and approve funds to network
        await token.transfer(network.address, amountTWeiHi);
//        await token.approve(network.address, amountTWeiHi, {from:user1})

        let sellRate1 = await reserve1.getConversionRate(tokenAdd[tokenInd], ethAddress, amountTweiLow, currentBlock + 10);
        rates = await network.getExpectedRate(tokenAdd[tokenInd], ethAddress, amountTweiLow);
//        log("rates = " + rates[0].valueOf())
        minRate = rates[1].valueOf();

        //try with low amount Twei
        try {
            await network.tradeWithHint(user1, tokenAdd[tokenInd], amountTweiLow, ethAddress, user2, 3000, minRate,
                    walletId, 0, {from:networkProxy});
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //perform same trade with higher value to see success
        let destAmount = await network.tradeWithHint(user1, tokenAdd[tokenInd], amountTWeiHi, ethAddress, user2, 3000,
            minRate, walletId, 0, {from:networkProxy});
    });

    it("should verify trade reverted (token to token) when dest amount (actual amount) is 0.", async function () {
        let tokenSrcInd = 3;
        let tokenDestInd = 2;
        let token = tokens[tokenSrcInd]; //choose some token
        let amountTweiLow = 1;
        let amountTWeiHi = 600;

        // transfer funds to user and approve funds to network
        await token.transfer(network.address, amountTWeiHi);
//        await token.approve(network.address, amountTWeiHi, {from:user1})

        rates = await network.getExpectedRate(tokenAdd[tokenSrcInd], tokenAdd[tokenDestInd], amountTweiLow);
//        log("rates = " + rates[0].valueOf() + " min rate " + rates[1].valueOf())
        minRate = rates[1].valueOf();

        //try with low amount Twei
        try {
            await network.tradeWithHint(user1, tokenAdd[tokenSrcInd], amountTweiLow, tokenAdd[tokenDestInd], user2, 3000, minRate,
                    walletId, 0, {from:networkProxy});
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //perform same trade with higher value to see success
        await network.tradeWithHint(user1, tokenAdd[tokenSrcInd], amountTWeiHi, tokenAdd[tokenDestInd], user2, 300000, minRate,
                            walletId, 0, {from:networkProxy});
    });

//    it("should verify for qty 0 return rate is 0", async function () {
//        let tokenSrcInd = 3;
//        let tokenDestInd = 2;
//        let token = tokens[tokenSrcInd]; //choose some token
//        let amountTweiLow = 1;
//        let amountTWeiHi = 600;
//
//        // transfer funds to user and approve funds to network
//        await token.transfer(network.address, amountTWeiHi);
////        await token.approve(network.address, amountTWeiHi, {from:user1})
//
//        rates = await network.getExpectedRate(tokenAdd[tokenSrcInd], tokenAdd[tokenDestInd], 0);
////        assert.equal(0, rates[0].valueOf());
//    });

    it("should test listing and unlisting pairs. compare to listed pairs API.", async function () {
        let tokenInd = 2;
        let tokenAddress = tokenAdd[tokenInd];

        let reserveGet = await network.reservesPerTokenDest(tokenAddress, 0);
        assert.equal(reserve1.address, reserveGet);
        reserveGet = await network.reservesPerTokenDest(tokenAddress, 1);
        assert.equal(reserve2.address, reserveGet);
        reserveGet = await network.reservesPerTokenSrc(tokenAddress, 0);
        assert.equal(reserve1.address, reserveGet);
        reserveGet = await network.reservesPerTokenSrc(tokenAddress, 1);
        assert.equal(reserve2.address, reserveGet);

        //unlist reserve 1 both buy and sell.
        await network.listPairForReserve(reserve1.address, tokenAdd[tokenInd], true, true, false);
        reserveGet = await network.reservesPerTokenDest(tokenAddress, 0);
        assert.equal(reserve2.address, reserveGet);
        try {
            reserveGet = await network.reservesPerTokenDest(tokenAddress, 1);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        reserveGet = await network.reservesPerTokenSrc(tokenAddress, 0);
        assert.equal(reserve2.address, reserveGet);
        try {
            reserveGet = await network.reservesPerTokenSrc(tokenAddress, 1);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //unlist reserve2 only eth to token
        await network.listPairForReserve(reserve2.address, tokenAdd[tokenInd], true, false, false);
        // here non listed
        try {
            reserveGet = await network.reservesPerTokenDest(tokenAddress, 1);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //here no change
        reserveGet = await network.reservesPerTokenSrc(tokenAddress, 0);
        assert.equal(reserve2.address, reserveGet);
        try {
            reserveGet = await network.reservesPerTokenSrc(tokenAddress, 1);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //list back reserve 2 buy and sell. see not added twice
        await network.listPairForReserve(reserve2.address, tokenAdd[tokenInd], true, true, true);
        reserveGet = await network.reservesPerTokenDest(tokenAddress, 0);
        assert.equal(reserve2.address, reserveGet);
        try {
            reserveGet = await network.reservesPerTokenDest(tokenAddress, 1);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        reserveGet = await network.reservesPerTokenSrc(tokenAddress, 0);
        assert.equal(reserve2.address, reserveGet);
        try {
            reserveGet = await network.reservesPerTokenSrc(tokenAddress, 1);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //list back reserve 1 token to eth
        await network.listPairForReserve(reserve1.address, tokenAdd[tokenInd], false, true, true);
        reserveGet = await network.reservesPerTokenDest(tokenAddress, 0);
        assert.equal(reserve2.address, reserveGet);
        try {
            reserveGet = await network.reservesPerTokenDest(tokenAddress, 1);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        reserveGet = await network.reservesPerTokenSrc(tokenAddress, 0);
        assert.equal(reserve2.address, reserveGet);
        reserveGet = await network.reservesPerTokenSrc(tokenAddress, 1);
        assert.equal(reserve1.address, reserveGet);
        try {
            reserveGet = await network.reservesPerTokenSrc(tokenAddress, 2);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //list back reserve 1 eth to token
        await network.listPairForReserve(reserve1.address, tokenAdd[tokenInd], true, false, true);
        reserveGet = await network.reservesPerTokenDest(tokenAddress, 0);
        assert.equal(reserve2.address, reserveGet);
        reserveGet = await network.reservesPerTokenDest(tokenAddress, 1);
        assert.equal(reserve1.address, reserveGet);
        try {
            reserveGet = await network.reservesPerTokenSrc(tokenAddress, 2);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        reserveGet = await network.reservesPerTokenSrc(tokenAddress, 0);
        assert.equal(reserve2.address, reserveGet);
        reserveGet = await network.reservesPerTokenSrc(tokenAddress, 1);
        assert.equal(reserve1.address, reserveGet);
        try {
            reserveGet = await network.reservesPerTokenSrc(tokenAddress, 2);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("should test can't list pairs if reserve not added.", async function () {
        //here list should fail
        try {
            await network.listPairForReserve(reserve3.address, uniqueToken.address, true, true, true);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            reserveGet = await network.reservesPerTokenSrc(uniqueToken.address, 0);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        await network.addReserve(reserve3.address, true);

        await network.listPairForReserve(reserve3.address, uniqueToken.address, true, true, true);

        reserveGet = await network.reservesPerTokenSrc(uniqueToken.address, 0);
        assert.equal(reserve3.address, reserveGet);
    });

    it("should test listing and unlisting new pair for new reserve. see rate changes. token to eth. as expected.", async function () {
        let testedToken = uniqueToken.address;
        let amount = 1231;

        currentBlock = await Helper.getCurrentBlock();
        //first see get rate from reserve gives rates
        let rate = await reserve3.getConversionRate(ethAddress, testedToken, amount, currentBlock + 10);
        assert(rate > 0);
        rate = await reserve3.getConversionRate(testedToken, ethAddress, (amount), currentBlock + 10);
        assert(rate > 0);

        //first unlist token
        await network.listPairForReserve(reserve3.address, uniqueToken.address, true, true, false);

        let rates = await network.getExpectedRate(ethAddress, testedToken, amount);
        assert.equal(0, rates[0].valueOf());
        rates = await network.getExpectedRate(testedToken, ethAddress, amount);
        assert.equal(0, rates[0].valueOf());

        //list token. buy (eth to token)
        await network.listPairForReserve(reserve3.address, testedToken, true, false, true);
        rates = await network.getExpectedRate(ethAddress, testedToken, amount);
        assert(rates[0].valueOf() > 0);
        rates = await network.getExpectedRate(testedToken, ethAddress, amount);
        assert(rates[0].valueOf() == 0);

        //list token. sell
        await network.listPairForReserve(reserve3.address, testedToken, false, true, true);
        rates = await network.getExpectedRate(ethAddress, testedToken, amount);
        assert(rates[0].valueOf() > 0);
        rates = await network.getExpectedRate(testedToken, ethAddress, amount);
        assert(rates[0].valueOf() > 0);

        //unlist token. buy
        await network.listPairForReserve(reserve3.address, testedToken, true, false, false);
        rates = await network.getExpectedRate(ethAddress, testedToken, amount);
        assert(rates[0].valueOf() == 0);
        rates = await network.getExpectedRate(testedToken, ethAddress, amount);
        assert(rates[0].valueOf() > 0);

        //unlist token. sell
        await network.listPairForReserve(reserve3.address, testedToken, false, true, false);
        rates = await network.getExpectedRate(ethAddress, testedToken, amount);
        assert(rates[0].valueOf() == 0);
        rates = await network.getExpectedRate(testedToken, ethAddress, amount);
        assert(rates[0].valueOf() == 0);
    });

    it("should test listing and unlisting new pair for new reserve. see rate changes. token to token. as expected.", async function () {
        let listedToken = tokens[1];
        let testedToken = uniqueToken.address;
        let amount = 430;
        let maxDestAmount = (new BigNumber(10)).pow(18);
        let manyTokens = (new BigNumber(10)).pow(8);

        currentBlock = await Helper.getCurrentBlock();
        //first see get rate from reserve gives rates
        let rate = await reserve3.getConversionRate(ethAddress, testedToken, amount, currentBlock + 10);
        assert(rate > 0);
        rate = await reserve3.getConversionRate(testedToken, ethAddress, amount, currentBlock + 10);
        assert(rate > 0);

        //send user 1 tokens from both types and approve network
        await uniqueToken.transfer(user1, manyTokens);
        await listedToken.transfer(user1, manyTokens);
        await uniqueToken.approve(networkProxy, manyTokens, {from: user1})
        await listedToken.approve(networkProxy, manyTokens, {from: user1})

        let user1UniqueBalance = new BigNumber(await uniqueToken.balanceOf(user1));
        let user1ListedBalance = new BigNumber(await listedToken.balanceOf(user1));
        let user2UniqueBalance = new BigNumber(await uniqueToken.balanceOf(user2));
        let user2ListedBalance = new BigNumber(await listedToken.balanceOf(user2));

        //first unlist token
        await network.listPairForReserve(reserve3.address, uniqueToken.address, true, true, false);
        let rates = await network.getExpectedRate(listedToken.address, testedToken, amount);
        assert.equal(0, rates[0].valueOf());
        rates = await network.getExpectedRate(testedToken, listedToken.address, amount);
        assert.equal(0, rates[0].valueOf());

        // trade both sides should revert
        try {
             await network.tradeWithHint(user1, listedToken.address, amount, uniqueToken.address, user2, maxDestAmount,
                0 ,walletId, 0, {from:networkProxy});
             assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
        try {
             await network.tradeWithHint(user1, uniqueToken.address, amount, listedToken.address, user2, maxDestAmount,
                0 ,walletId, 0, {from:networkProxy});
             assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        let user1UniqueBalanceAfter = new BigNumber(await uniqueToken.balanceOf(user1));
        let user1ListedBalanceAfter = new BigNumber(await listedToken.balanceOf(user1));
        let user2UniqueBalanceAfter = new BigNumber(await uniqueToken.balanceOf(user2));
        let user2ListedBalanceAfter = new BigNumber(await listedToken.balanceOf(user2));
        assert.equal(user1UniqueBalanceAfter.valueOf(), user1UniqueBalance.valueOf());
        assert.equal(user2UniqueBalanceAfter.valueOf(), user2UniqueBalance.valueOf());
        assert.equal(user1ListedBalanceAfter.valueOf(), user1ListedBalance.valueOf());
        assert.equal(user2ListedBalanceAfter.valueOf(), user2ListedBalance.valueOf());
        user2UniqueBalance = user2UniqueBalanceAfter;
        user1ListedBalance = user1ListedBalanceAfter;
        user1UniqueBalance = user1UniqueBalanceAfter;
        user2ListedBalance = user2ListedBalanceAfter;

        //list token. buy (eth to token)
        await network.listPairForReserve(reserve3.address, testedToken, true, false, true);
        rates = await network.getExpectedRate(listedToken.address, testedToken, amount);
        assert(rates[0].valueOf() > 0);
        rates = await network.getExpectedRate(testedToken, listedToken.address, amount);
        assert(rates[0].valueOf() == 0);

        // trade
        await listedToken.transferFrom(user1, network.address, amount, {from:networkProxy});
        await network.tradeWithHint(user1, listedToken.address, amount, uniqueToken.address, user2, maxDestAmount,
                0 ,walletId, 0, {from:networkProxy});
        try {
             await network.tradeWithHint(user1, uniqueToken.address, amount, listedToken.address, user2, maxDestAmount,
                0 ,walletId, 0, {from:networkProxy});
             assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }


        user1UniqueBalanceAfter = new BigNumber(await uniqueToken.balanceOf(user1));
        user1ListedBalanceAfter = new BigNumber(await listedToken.balanceOf(user1));
        user2UniqueBalanceAfter = new BigNumber(await uniqueToken.balanceOf(user2));
        user2ListedBalanceAfter = new BigNumber(await listedToken.balanceOf(user2));
        assert.equal(user1UniqueBalanceAfter.valueOf(), user1UniqueBalance.valueOf());
        assert(user2UniqueBalanceAfter.valueOf() > user2UniqueBalance.valueOf());
        assert(user1ListedBalanceAfter.lt(user1ListedBalance), "balance before: " + user1ListedBalance + " balance after: " + user1ListedBalanceAfter);
        assert.equal(user2ListedBalanceAfter.valueOf(), user2ListedBalance.valueOf());
        user2UniqueBalance = user2UniqueBalanceAfter;
        user1ListedBalance = user1ListedBalanceAfter;

        //list token. sell
        await network.listPairForReserve(reserve3.address, testedToken, false, true, true);
        rates = await network.getExpectedRate(listedToken.address, testedToken, amount);
        assert(rates[0].valueOf() > 0);
        rates = await network.getExpectedRate(testedToken, listedToken.address, amount);
        assert(rates[0].valueOf() > 0);

        // trade both sides should succeed
        await listedToken.transferFrom(user1, network.address, amount, {from:networkProxy});
        await network.tradeWithHint(user1, listedToken.address, amount, uniqueToken.address, user2, maxDestAmount,
                0 ,walletId, 0, {from:networkProxy});
        await uniqueToken.transferFrom(user1, network.address, amount, {from:networkProxy});
        await network.tradeWithHint(user1, uniqueToken.address, amount, listedToken.address, user2, maxDestAmount,
                0 ,walletId, 0, {from:networkProxy});


        user1UniqueBalanceAfter = new BigNumber(await uniqueToken.balanceOf(user1));
        user1ListedBalanceAfter = new BigNumber(await listedToken.balanceOf(user1));
        user2UniqueBalanceAfter = new BigNumber(await uniqueToken.balanceOf(user2));
        user2ListedBalanceAfter = new BigNumber(await listedToken.balanceOf(user2));
        assert(user1UniqueBalanceAfter.lt(user1UniqueBalance));
        assert(user2UniqueBalanceAfter.gt(user2UniqueBalance));
        assert(user1ListedBalanceAfter.lt(user1ListedBalance));
        assert(user2ListedBalanceAfter.gt(user2ListedBalance));
        user2UniqueBalance = user2UniqueBalanceAfter;
        user1ListedBalance = user1ListedBalanceAfter;
        user1UniqueBalance = user1UniqueBalanceAfter;
        user2ListedBalance = user2ListedBalanceAfter;

        //unlist token. buy
        await network.listPairForReserve(reserve3.address, testedToken, true, false, false);
        rates = await network.getExpectedRate(listedToken.address, testedToken, amount);
        assert(rates[0].valueOf() == 0);
        rates = await network.getExpectedRate(testedToken, listedToken.address, amount);
        assert(rates[0].valueOf() > 0);

        // trade both sides
        await uniqueToken.transferFrom(user1, network.address, amount, {from:networkProxy});
        await network.tradeWithHint(user1, uniqueToken.address, amount, listedToken.address, user2, maxDestAmount,
            0 ,walletId, 0, {from:networkProxy});
        try {
            await network.tradeWithHint(user1, listedToken.address, amount, uniqueToken.address, user2, maxDestAmount,
                0 ,walletId, 0, {from:networkProxy});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }


        user1UniqueBalanceAfter = new BigNumber(await uniqueToken.balanceOf(user1));
        user1ListedBalanceAfter = new BigNumber(await listedToken.balanceOf(user1));
        user2UniqueBalanceAfter = new BigNumber(await uniqueToken.balanceOf(user2));
        user2ListedBalanceAfter = new BigNumber(await listedToken.balanceOf(user2));
        assert(user1UniqueBalanceAfter.valueOf() < user1UniqueBalance.valueOf());
        assert(user2UniqueBalanceAfter.valueOf() == user2UniqueBalance.valueOf());
        assert(user1ListedBalanceAfter.valueOf() == user1ListedBalance.valueOf());
        assert(user2ListedBalanceAfter.valueOf() > user2ListedBalance.valueOf());
        user2UniqueBalance = user2UniqueBalanceAfter;
        user1ListedBalance = user1ListedBalanceAfter;
        user1UniqueBalance = user1UniqueBalanceAfter;
        user2ListedBalance = user2ListedBalanceAfter;

        //unlist token. sell
        await network.listPairForReserve(reserve3.address, testedToken, false, true, false);
        rates = await network.getExpectedRate(listedToken.address, testedToken, amount);
        assert(rates[0].valueOf() == 0);
        rates = await network.getExpectedRate(testedToken, listedToken.address, amount);
        assert(rates[0].valueOf() == 0);

        // trade both sides should revert
        try {
             await network.tradeWithHint(user1, listedToken.address, amount, uniqueToken.address, user2, maxDestAmount,
                0 ,walletId, 0, {from:networkProxy});
             assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
        try {
             await network.tradeWithHint(user1, uniqueToken.address, amount, listedToken.address, user2, maxDestAmount,
                0 ,walletId, 0, {from:networkProxy});
             assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }


        user1UniqueBalanceAfter = new BigNumber(await uniqueToken.balanceOf(user1));
        user1ListedBalanceAfter = new BigNumber(await listedToken.balanceOf(user1));
        user2UniqueBalanceAfter = new BigNumber(await uniqueToken.balanceOf(user2));
        user2ListedBalanceAfter = new BigNumber(await listedToken.balanceOf(user2));
        assert.equal(user1UniqueBalanceAfter.valueOf(), user1UniqueBalance.valueOf());
        assert.equal(user2UniqueBalanceAfter.valueOf(), user2UniqueBalance.valueOf());
        assert.equal(user1ListedBalanceAfter.valueOf(), user1ListedBalance.valueOf());
        assert.equal(user2ListedBalanceAfter.valueOf(), user2ListedBalance.valueOf());
    });

    it("should verify buy reverted when unlisting pair.", async function () {
        let tokenInd = 3;
        let token = tokens[tokenInd]; //choose some token
        let amountWei = 150 * 1;
        let minConversionRate = 0;

        //unlist and verify trade reverted.
        await network.listPairForReserve(reserve1.address, tokenAdd[tokenInd], true, false, false);
        await network.listPairForReserve(reserve2.address, tokenAdd[tokenInd], true, false, false);

        //perform trade
        try {
             await network.tradeWithHint(user1, ethAddress, amountWei, tokenAdd[tokenInd], user2, 2000,
                minConversionRate, walletId, 0, {from:networkProxy, value:amountWei});
             assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //list back
        await network.listPairForReserve(reserve1.address, tokenAdd[tokenInd], true, false, true);
        await network.listPairForReserve(reserve2.address, tokenAdd[tokenInd], true, false, true);

        await network.tradeWithHint(user1, ethAddress, amountWei, tokenAdd[tokenInd], user2, 2000,
                minConversionRate, walletId, 0, {from:networkProxy, value:amountWei});
    });

    it("should verify sell reverted when unlisting pair.", async function () {
        let tokenInd = 1;
        let token = tokens[tokenInd]; //choose some token
        let amountTWei = 30* 1;
        let minConversionRate = 0;
        let maxDestAmount = 1000;

        // transfer funds to user and approve funds to network
        await token.transfer(network.address, amountTWei);
//        await token.approve(network.address, amountTWei*2, {from:user1});

        //unlist and verify trade reverted.
        await network.listPairForReserve(reserve1.address, tokenAdd[tokenInd], false, true, false);
        await network.listPairForReserve(reserve2.address, tokenAdd[tokenInd], false, true, false);

        //perform trade
        try {
             await network.tradeWithHint(user1, tokenAdd[tokenInd], amountTWei, ethAddress, user2, maxDestAmount,
                minConversionRate, walletId, 0, {from:networkProxy});
             assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //list back
        await network.listPairForReserve(reserve1.address, tokenAdd[tokenInd], false, true, true);
        await network.listPairForReserve(reserve2.address, tokenAdd[tokenInd], false, true, true);

        await network.tradeWithHint(user1, tokenAdd[tokenInd], amountTWei, ethAddress, user2, maxDestAmount,
            minConversionRate, walletId, 0, {from:networkProxy});
    });

    it("should verify trade reverted when gas price above set max.", async function () {
        let tokenInd = 3;
        let token = tokens[tokenInd]; //choose some token
        let amountWei = 41;
        let minConversionRate = 0;
        let maxPrice = await network.maxGasPrice();
        let highGas = maxPrice * 2;

        //perform trade
        try {
             await network.tradeWithHint(user1, ethAddress, amountWei, tokenAdd[tokenInd], user2, 2000,
                minConversionRate, walletId, 0, {from:networkProxy, value:amountWei, gasPrice: highGas});
             assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //see trade success with good gas price
        await network.tradeWithHint(user1, ethAddress, amountWei, tokenAdd[tokenInd], user2, 2000,
                  minConversionRate, walletId, 0, {from:networkProxy, value:amountWei, gasPrice: maxPrice});
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
             await network.tradeWithHint(user2, ethAddress, amountWei, tokenAdd[tokenInd], user2, 2000,
                minConversionRate, walletId, 0, {from:networkProxy, value:amountWei});
             assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //set normal wei to sgd rate.
        await whiteList.setSgdToEthRate(30000, {from: operator});
        await whiteList.setCategoryCap(2, 100, {from:operator}); //1 sgd

        //see trade success with good gas price
        await network.tradeWithHint(user2, ethAddress, amountWei, tokenAdd[tokenInd], user2, 2000,
                  minConversionRate, walletId, 0, {from:networkProxy, value:amountWei});
    });

    it("should verify trade reverted src amount > max src amount (10**28).", async function () {
        let tokenInd = 3;
        let token = tokens[tokenInd]; //choose some token
        let amountTWei = (new BigNumber(10).pow(28)).add(1);

        // transfer funds to user and approve funds to network - for all trades in this 'it'
        await token.transfer(network.address, amountTWei);
//        await token.approve(network.address, amountTWei, {from:user1})

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
            await network.tradeWithHint(user1, tokenAdd[tokenInd], amountTWei.valueOf(), ethAddress, user2, amountTWei.valueOf(),
                0, walletId, 0, {from:networkProxy});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //see same trade performed when value is 1 less
        await network.tradeWithHint(user1, tokenAdd[tokenInd], amountTWei.sub(1).valueOf(), ethAddress,
                user2, amountTWei.valueOf(), 0, walletId, 0, {from:networkProxy});
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
        await token.transfer(network.address, amountTWei);
//        await token.approve(network.address, amountTWei, {from:user1})

        let rates = await network.getExpectedRate(tokenAdd[tokenInd], ethAddress, amountTWei);
        let minConvRate = rates[0].valueOf();
        let minSetRate = minConvRate*2;
        try {
            await network.tradeWithHint(user1, tokenAdd[tokenInd], amountTWei.valueOf(), ethAddress, user2, amountTWei.valueOf(),
                        minSetRate, walletId, 0, {from:networkProxy});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //same trade with zero min rate
        await network.tradeWithHint(user1, tokenAdd[tokenInd], amountTWei.valueOf(), ethAddress, user2,
                    amountTWei.valueOf(), 0, walletId, 0, {from:networkProxy});
    });

    it("should verify trade reverted when rate above max rate.", async function () {
        let tokenInd = 1;
        let token = tokens[tokenInd]; //choose some token
        let amountTWei = 35*1;

        // transfer funds to user and approve funds to network - for all trades in this 'it'
        await token.transfer(network.address, amountTWei);
//        await token.approve(network.address, amountTWei, {from:user1})

        let maxRate = (new BigNumber(10).pow(24)).valueOf();
        //modify rate
        baseSellRate1[tokenInd] = maxRate;
        baseSellRate2[tokenInd] = maxRate;

        buys.length = sells.length = indices.length = 0;

        await pricing1.setBaseRate(tokenAdd, baseBuyRate1, baseSellRate1, buys, sells, currentBlock, indices, {from: operator});
        await pricing2.setBaseRate(tokenAdd, baseBuyRate2, baseSellRate2, buys, sells, currentBlock, indices, {from: operator});

        try {
            await network.tradeWithHint(user1, tokenAdd[tokenInd], amountTWei, ethAddress, user2, 5000, 0, walletId, 0, {from:networkProxy});
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
        await network.tradeWithHint(user1, tokenAdd[tokenInd], amountTWei, ethAddress,
                user2, amountTWei.valueOf(), 0, walletId, 0, {from:networkProxy});
    });

    it("should verify trade reverted when dest address 0.", async function () {
        let tokenInd = 3;
        let token = tokens[tokenInd]; //choose some token
        let amountWei = 18 * 1;
        let minConversionRate = 0;

        //perform trade
        try {
             await network.tradeWithHint(user1, ethAddress, amountWei, tokenAdd[tokenInd], 0, 2000, minConversionRate,
                walletId, 0, {from:networkProxy, value:amountWei});
             assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //see same trade performed with valid value
        await network.tradeWithHint(user1, ethAddress, amountWei, tokenAdd[tokenInd], user2, 2000, minConversionRate,
            walletId, 0, {from:networkProxy, value:amountWei});
    });

    it("should get reserve list and verify addresses.", async function () {
        let reserves = await network.getReserves();

        assert.equal(reserves.length, 3, "unexpected number of reserves.");

        assert.equal(reserves[0].valueOf(), reserve1.address, "unexpected reserve address.");
        assert.equal(reserves[1].valueOf(), reserve2.address, "unexpected reserve address.");
        assert.equal(reserves[2].valueOf(), reserve3.address, "unexpected reserve address.");
    });

    it("should verify same reserve can't be added twice.", async function () {
        let numRes = await network.getNumReserves();

        assert.equal(numRes.valueOf(), 3, "unexpected number of reserves.");

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

        assert.equal(numRes.valueOf(), 3, "unexpected number of reserves.");

        // remove reserves
        await network.addReserve(reserve1.address, false);
        await network.addReserve(reserve2.address, false);
        await network.addReserve(reserve3.address, false);

        numRes = await network.getNumReserves();

        assert.equal(numRes.valueOf(), 0, "unexpected number of reserves.");

        await network.addReserve(reserve1.address, true);
        await network.addReserve(reserve2.address, true);
        await network.addReserve(reserve3.address, true);

        numRes = await network.getNumReserves();

        assert.equal(numRes.valueOf(), 3, "unexpected number of reserves.");
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
            await networkTemp.setWhiteList(0);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await networkTemp.setExpectedRate(0);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await networkTemp.setFeeBurner(0);
            assert(false, "throw was expected in line above.")
        } catch(e){
           assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await networkTemp.setKyberProxy(0);
            assert(false, "throw was expected in line above.")
        } catch(e){
           assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("should test can't set enable if any mandatory contract has zero value = wasn't set.", async function () {
        const networkTemp = await Network.new(admin);

        //verify can't enable without set contracts
        try {
            await networkTemp.setEnable(true);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        await networkTemp.setWhiteList(whiteList.address);
        try {
            await networkTemp.setEnable(true);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        await networkTemp.setFeeBurner(feeBurner.address);
        try {
            await networkTemp.setEnable(true);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        await networkTemp.setExpectedRate(expectedRate.address);
        try {
            await networkTemp.setEnable(true);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        await networkTemp.setKyberProxy(networkProxy);
        await networkTemp.setEnable(true);
    });

    it("should verify network reverts when negligible rate diff > 10000.", async function () {
        let legalNegRateDiff = 100 * 100;
        let illegalNegRateDiff = (100 * 100) + 1;
        let currentNegRateDiff = await network.negligibleRateDiff();

        try {
            await network.setParams(gasPrice.valueOf(), illegalNegRateDiff);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        await network.setParams(gasPrice.valueOf(), legalNegRateDiff);
        let negDiff = await network.negligibleRateDiff();

        assert.equal(negDiff, legalNegRateDiff);
        await network.setParams(gasPrice.valueOf(), currentNegRateDiff);
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
        await networkTemp.setWhiteList(whiteList.address);
        await networkTemp.setExpectedRate(expectedRate.address);
        await networkTemp.setFeeBurner(feeBurner.address);
        await networkTemp.setParams(gasPrice.valueOf(), negligibleRateDiff);

        await networkTemp.getExpectedRate(tokenAdd[2], ethAddress, amountTwei);
    });

    it("should use setInfo (UI info) and check value is set.", async function () {
        let info = 15;
        let field = 10;

        await network.setInfo(field, info, {from: operator});
        let rxInfo = await network.info(field);
        assert.equal(info.valueOf(), rxInfo.valueOf(), "info data doesn't match");
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
            let buyRate = await network.getExpectedRate(tokenAdd[tokenSrcInd], tokenAdd[tokenDestInd], srcAmountTwei);

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
            await tokenSrc.approve(networkProxy, srcAmountTwei, {from:user1})

            let startBalanceTokenDestUser2 = await tokenDest.balanceOf(user2);
            let startBalanceTokenSrcUser1 = await tokenSrc.balanceOf(user1);
    //        function trade(src, srcAmount, dest, destAddress, maxDestAmount, minConversionRate, walletId)

            await tokenSrc.transferFrom(user1, network.address, srcAmountTwei, {from: networkProxy});
            let result = await network.tradeWithHint(user1, tokenAdd[tokenSrcInd], srcAmountTwei, tokenAdd[tokenDestInd],
                user2, maxDestAmount, buyRate[1].valueOf(), walletId, 0, {from:networkProxy});

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

    it("should test token to token trade 2 different reserves.", async function () {
        let tokenSrcInd = 1;
        let tokenDestInd = 3;
        let tokenSrc = tokens[tokenSrcInd];
        let tokenDest = tokens[tokenDestInd];
        let srcAmountTwei = 1956;
        let maxDestAmount = (new BigNumber(10)).pow(18);

        await pricing1.disableTokenTrade(tokenAdd[tokenSrcInd], {from: alerter});
        await pricing2.disableTokenTrade(tokenAdd[tokenDestInd], {from: alerter});

        try {
            //rate
            let buyRate = await network.getExpectedRate(tokenAdd[tokenSrcInd], tokenAdd[tokenDestInd], srcAmountTwei);
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
            await tokenSrc.approve(networkProxy, srcAmountTwei, {from:user1})

            let startBalanceTokenDestUser2 = await tokenDest.balanceOf(user2);
            let startBalanceTokenSrcUser1 = await tokenSrc.balanceOf(user1);

    //        function trade(src, srcAmount, dest, destAddress, maxDestAmount, minConversionRate, walletId)

            await tokenSrc.transferFrom(user1, network.address, srcAmountTwei, {from: networkProxy});
            result = await network.tradeWithHint(user1, tokenAdd[tokenSrcInd], srcAmountTwei, tokenAdd[tokenDestInd],
                    user2, maxDestAmount, buyRate[1].valueOf(), walletId, 0, {from:networkProxy});
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
            let buyRate = await network.getExpectedRate(tokenAdd[tokenSrcInd], tokenAdd[tokenDestInd], srcAmountTwei);

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
            await tokenSrc.approve(networkProxy, srcAmountTwei, {from:user1})

            let startBalanceTokenDestUser2 = await tokenDest.balanceOf(user2);
            let startBalanceTokenSrcUser1 = await tokenSrc.balanceOf(user1);

    //        function trade(src, srcAmount, dest, destAddress, maxDestAmount, minConversionRate, walletId)

            await tokenSrc.transferFrom(user1, network.address, srcAmountTwei, {from: networkProxy});
            result = await network.tradeWithHint(user1, tokenAdd[tokenSrcInd], srcAmountTwei, tokenAdd[tokenDestInd], user2, maxDestAmount, buyRate[1].valueOf(), walletId, 0, {from:networkProxy});
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
        let buyRate = await network.getExpectedRate(tokenAdd[tokenSrcInd], tokenAdd[tokenDestInd], srcAmountTwei.valueOf());

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
        await tokenSrc.approve(networkProxy, srcAmountTwei, {from:user2})

        let startBalanceNetworkWei =  await Helper.getBalancePromise(network.address);
        let startBalanceNetworkTokDest = await tokenDest.balanceOf(network.address);
        let startBalanceTokenDestUser1 = await tokenDest.balanceOf(user1);
        let startBalanceTokenSrcUser2 = await tokenSrc.balanceOf(user2);
//        function trade(src, srcAmount, dest, destAddress, maxDestAmount, minConversionRate, walletId)

        await tokenSrc.transferFrom(user2, network.address, srcAmountTwei, {from: networkProxy});
        result = await network.tradeWithHint(user2, tokenAdd[tokenSrcInd], srcAmountTwei, tokenAdd[tokenDestInd], user1, maxDestAmount,
                            buyRate[1].valueOf(), walletId, 0, {from:networkProxy});
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
        let buyRate = await network.getExpectedRate(tokenAdd[tokenSrcInd], tokenAdd[tokenDestInd], srcAmountTwei.valueOf());

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
        await tokenSrc.approve(networkProxy, srcAmountTwei, {from:user2})

        let startBalanceNetworkWei =  await Helper.getBalancePromise(network.address);
        let startBalanceNetworkTokDest = await tokenDest.balanceOf(network.address);
        let startBalanceTokenDestUser1 = await tokenDest.balanceOf(user1);
        let startBalanceTokenSrcUser2 = await tokenSrc.balanceOf(user2);
        await tokenSrc.transferFrom(user2, network.address, srcAmountTwei, {from: networkProxy})
        //        function trade(src, srcAmount, dest, destAddress, maxDestAmount, minConversionRate, walletId)
        result = await network.tradeWithHint(user2, tokenAdd[tokenSrcInd], srcAmountTwei, tokenAdd[tokenDestInd], user1, maxDestAmount,
                         buyRate[1].valueOf(), walletId, 0, {from:networkProxy});
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

    it("should test token to token trade with same src and dest token.", async function () {
        let tokenSrcInd = 1;
        let tokenDestInd = 1;
        let tokenSrc = tokens[tokenSrcInd];
        let tokenDest = tokens[tokenDestInd];
        let srcAmountTwei = 136;
        let maxDestAmount = (new BigNumber(10)).pow(18);

        rate = await network.getExpectedRate(tokenSrc.address, tokenDest.address, srcAmountTwei.valueOf());

        let ethBalance = await Helper.getBalancePromise(reserve1.address);
        ethBalance = await Helper.getBalancePromise(reserve2.address);
        let destTokBalance = await tokenDest.balanceOf(reserve1.address)
        destTokBalance = await tokenDest.balanceOf(reserve2.address)

        let expectedDestAmount = calcDstQty(srcAmountTwei, tokenDecimals[tokenSrcInd], tokenDecimals[tokenDestInd], rate[0]);

        await tokenSrc.transfer(user1, srcAmountTwei);
        await tokenSrc.approve(networkProxy, srcAmountTwei, {from:user1})

        let user1SrcTokBalanceBefore = new BigNumber(await tokenSrc.balanceOf(user1));
        let user2DestTokBalanceBefore = new BigNumber(await tokenDest.balanceOf(user2));

        await tokenSrc.transferFrom(user1, network.address, srcAmountTwei, {from: networkProxy});

        //see trade reverts
        try {
            let result = await network.tradeWithHint(user1, tokenSrc.address, srcAmountTwei.valueOf(), tokenDest.address, user2, maxDestAmount.valueOf(),
                            rate[1].valueOf(), walletId, 0, {from:networkProxy});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected revert but got: " + e);
        }

        let expectedUser1SrcTokBalanceAfter = user1SrcTokBalanceBefore.sub(srcAmountTwei);
        let expectedUser2DestTokBalanceAfter = user2DestTokBalanceBefore;

        let user1SrcTokBalanceAfter = await tokenSrc.balanceOf(user1);
        let user2DestTokBalanceAfter = await tokenDest.balanceOf(user2);

        assert.equal(user1SrcTokBalanceAfter.valueOf(), expectedUser1SrcTokBalanceAfter.valueOf());
        assert.equal(user2DestTokBalanceAfter.valueOf(), expectedUser2DestTokBalanceAfter.valueOf(), " diff from calculated rate to actual balance should be 1")
        //            log("expected trade value: " + expectedDestAmount)
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
            rate = await network.getExpectedRate(tokenSrc.address, tokenDest.address, srcAmountTwei.valueOf());

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
            await tokenSrc.approve(networkProxy, srcAmountTwei, {from:user1})

            let user1SrcTokBalanceBefore = new BigNumber(await tokenSrc.balanceOf(user1));
            let user2DestTokBalanceBefore = new BigNumber(await tokenDest.balanceOf(user2));

            await tokenSrc.transferFrom(user1, network.address, srcAmountTwei, {from: networkProxy});
//            log("trade " + i + " srcInd: " + tokenSrcInd + " dest ind: " + tokenDestInd + " srcQty: " + srcAmountTwei);
            let result = await network.tradeWithHint(user1, tokenSrc.address, srcAmountTwei.valueOf(), tokenDest.address, user2, maxDestAmount.valueOf(),
                                 rate[1].valueOf(), walletId, 0, {from:networkProxy});
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
        }

        let avgGas = cumulativeGas.div(numTrades);
        log("average gas usage " + numTrades + " buys. token to token: " + avgGas.floor().valueOf());
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
    // calculates rate from src and expected dest amount.
    let rate;

    if (dstDecimals >= srcDecimals) {
        rate = (precisionUnits.mul(destQty)).div(((new BigNumber(10)).pow(dstDecimals - srcDecimals)).mul(srcQty));
    } else {
        rate = (precisionUnits.mul(destQty).mul((new BigNumber(10)).pow(srcDecimals - dstDecimals))).div(srcQty);
    }
    return rate.floor();
}

function log (string) {
    console.log(string);
};
