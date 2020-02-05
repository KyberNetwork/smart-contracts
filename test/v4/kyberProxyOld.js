const ProxyOld = artifacts.require("./KyberProxyOld.sol");
const ConversionRates = artifacts.require("MockConversionRate.sol");
const TestToken = artifacts.require("TestToken.sol");
const TokenReverseSend = artifacts.require("TokenReverseSend.sol");
const Reserve = artifacts.require("./KyberReserve.sol");
const MaliciousReserve = artifacts.require("../MaliciousReserve.sol");
const Network = artifacts.require("./KyberNetwork.sol");
const NetworkNoMaxDest = artifacts.require("KyberNetworkNoMaxDest.sol");
const MaliciousNetwork = artifacts.require("MaliciousKyberNetwork.sol");
const MaliciousNetwork2 = artifacts.require("MaliciousKyberNetwork2.sol");
const GenerousNetwork = artifacts.require("GenerousKyberNetwork.sol");

const OrderbookReserve = artifacts.require("MockOrderbookReserve.sol");
const PermissionlessOrderbookReserveLister = artifacts.require("PermissionlessOrderbookReserveLister.sol");
const OrderListFactory = artifacts.require("OrderListFactory.sol");
const MockMedianizer = artifacts.require("MockMedianizer.sol");

const Helper = require("./helper.js");
const BN = web3.utils.BN;
const truffleAssert = require('truffle-assertions');

//global variables
//////////////////
const precisionUnits = (new BN(10).pow(new BN(18)));
const max_rate = (precisionUnits.mul(new BN(10 ** 6))); //internal parameter in Utils.sol
const ethToKncRatePrecision = precisionUnits.mul(new BN(550));
const ethAddress = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
const lowerCaseEthAdd = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const zeroAddress = '0x0000000000000000000000000000000000000000';
const gasPrice = (new BN(10).pow(new BN(9)).mul(new BN(50)));
let negligibleRateDiff = 11;
let emptyHint = '0x';

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
let maker1;

//contracts
let pricing1;
let pricing2;
let pricing3;
let pricing4;

let reserve1;
let reserve2;
let reserve3;
let reserve4Mal;

let network;
let networkNoMaxDest;
let maliciousNetwork;
let maliciousNetwork2;
let generousNetwork;
let proxyOld;
let feeBurner;
let mainFeeBurner;

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
let tokenForMal;
let scammer;
let KNC;
let kncAddress;

//cap data for white list
let capWei = 1000;
let sgdToEthRate = 30000;

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
        scammer = accounts[8];
        maker1 = accounts[9];

        currentBlock = priceUpdateBlock = await Helper.getCurrentBlock();

//        console.log("current block: " + currentBlock);
        //init contracts
        pricing1 = await ConversionRates.new(admin);
        pricing2 = await ConversionRates.new(admin);
        pricing3 = await ConversionRates.new(admin);
        pricing4 = await ConversionRates.new(admin);

        //set pricing general parameters
        await pricing1.setValidRateDurationInBlocks(validRateDurationInBlocks);
        await pricing2.setValidRateDurationInBlocks(validRateDurationInBlocks);
        await pricing3.setValidRateDurationInBlocks(validRateDurationInBlocks);
        await pricing4.setValidRateDurationInBlocks(validRateDurationInBlocks);

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

        KNC = await TestToken.new("Kyber krystal", "KNC", 18);
        kncAddress = KNC.address;

        Helper.assertEqual(tokens.length, numTokens, "bad number tokens");

        uniqueToken = await TestToken.new("uinque", "unq", 15);
        await pricing3.addToken(uniqueToken.address);
        await pricing3.setTokenControlInfo(uniqueToken.address, minimalRecordResolution, maxPerBlockImbalance, maxTotalImbalance);
        await pricing3.enableTokenTrade(uniqueToken.address);

        tokenForMal = await TestToken.new("ForMal", "mal", 18);
        await pricing4.addToken(tokenForMal.address);
        await pricing4.setTokenControlInfo(tokenForMal.address, minimalRecordResolution, maxPerBlockImbalance, maxTotalImbalance);
        await pricing4.enableTokenTrade(tokenForMal.address);

        await pricing1.addOperator(operator);
        await pricing1.addAlerter(alerter);
        await pricing2.addOperator(operator);
        await pricing2.addAlerter(alerter);
        await pricing3.addOperator(operator);
        await pricing3.addAlerter(alerter);
        await pricing4.addOperator(operator);
        await pricing4.addAlerter(alerter);
        //        console.log(result.logs[0].args);
    });

    it("should set base rates + compact data rate factor + step function. for all tokens.", async function () {
        //buy is ether to token rate. sale is token to ether rate. so sell == 1 / buy. assuming we have no spread.
        let tokensPerEther;
        let ethersPerToken;

        for (i = 0; i < numTokens; ++i) {
            tokensPerEther = precisionUnits.mul(new BN((i + 1) * 3));
            ethersPerToken = precisionUnits.div(new BN((i + 1) * 3));
            baseBuyRate1.push(tokensPerEther);
            baseBuyRate2.push(tokensPerEther.mul(new BN(10100)).div(new BN(10000)));
            baseSellRate1.push(ethersPerToken);
            baseSellRate2.push(ethersPerToken.div(new BN(1000)).mul(new BN(980)));
        }

//        console.log('baseBuyRate1')
//        console.log(baseBuyRate1)
//        console.log('baseSellRate1')
//        console.log(baseSellRate1)

//        console.log('baseBuyRate2')
//        console.log(baseBuyRate2)
//        console.log('baseSellRate2')
//        console.log(baseSellRate2)

        Helper.assertEqual(baseBuyRate1.length, tokens.length);
        Helper.assertEqual(baseBuyRate2.length, tokens.length);
        Helper.assertEqual(baseSellRate1.length, tokens.length);
        Helper.assertEqual(baseSellRate2.length, tokens.length);

        buys.length = sells.length = indices.length = 0;

        await pricing1.setBaseRate(tokenAdd, baseBuyRate1, baseSellRate1, buys, sells, currentBlock, indices, {from: operator});
        await pricing2.setBaseRate(tokenAdd, baseBuyRate2, baseSellRate2, buys, sells, currentBlock, indices, {from: operator});

        let uniqueAddArr = [uniqueToken.address];
        let baseBuyUnique = [precisionUnits.mul(new BN(18))];
        let baseSellUnique = [precisionUnits.div(new BN(18))];
//        log(uniqueAddArr + "  " + baseBuyUnique + "  " + baseSellUnique)
        await pricing3.setBaseRate(uniqueAddArr, baseBuyUnique, baseSellUnique, buys, sells, currentBlock, indices, {from: operator});

        uniqueAddArr = [tokenForMal.address];
        baseBuyUnique = [precisionUnits.mul(new BN(2))];
        baseSellUnique = [precisionUnits.div(new BN(2))];
//        log(uniqueAddArr + "  " + baseBuyUnique + "  " + baseSellUnique)
        await pricing4.setBaseRate(uniqueAddArr, baseBuyUnique, baseSellUnique, buys, sells, currentBlock, indices, {from: operator});

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

        await pricing1.setCompactData(buys, sells, currentBlock, indices, {from: operator});
        await pricing2.setCompactData(buys, sells, currentBlock, indices, {from: operator});
        await pricing3.setCompactData(buys, sells, currentBlock, indices, {from: operator});
        await pricing4.setCompactData(buys, sells, currentBlock, indices, {from: operator});

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

        await pricing4.setQtyStepFunction(tokenForMal.address, qtyBuyStepX, qtyBuyStepY, qtySellStepX, qtySellStepY, {from:operator});
        await pricing4.setImbalanceStepFunction(tokenForMal.address, imbalanceBuyStepX, imbalanceBuyStepY, imbalanceSellStepX, imbalanceSellStepY, {from:operator});
    });

//     it("should init network and reserves and set all reserve data including balances", async function () {
//         network = await Network.new(admin);
//         await network.addOperator(operator);

//         reserve1 = await Reserve.new(network.address, pricing1.address, admin);
//         reserve2 = await Reserve.new(network.address, pricing2.address, admin);
//         reserve3 = await Reserve.new(network.address, pricing3.address, admin);
//         reserve4Mal = await MaliciousReserve.new(network.address, pricing4.address, admin, );

//         await pricing1.setReserveAddress(reserve1.address);
//         await pricing2.setReserveAddress(reserve2.address);
//         await pricing3.setReserveAddress(reserve3.address);
//         await pricing4.setReserveAddress(reserve4Mal.address);

//         await reserve1.addAlerter(alerter);
//         await reserve2.addAlerter(alerter);
//         await reserve3.addAlerter(alerter);
//         await reserve4Mal.addAlerter(alerter);

//         for (i = 0; i < numTokens; ++i) {
//             await reserve1.approveWithdrawAddress(tokenAdd[i], accounts[0], true);
//             await reserve2.approveWithdrawAddress(tokenAdd[i], accounts[0], true);
//         }
//         await reserve3.approveWithdrawAddress(uniqueToken.address, accounts[0], true);
//         await reserve4Mal.approveWithdrawAddress(tokenForMal.address, accounts[0], true);

//         //set reserve balance. 10**18 wei ether + per token 10**18 wei ether value according to base rate.
//         let reserveEtherInit = (new BN(10)).pow(new BN(19)).mul(new BN(2));
//         await Helper.sendEtherWithPromise(accounts[8], reserve1.address, reserveEtherInit);
//         await Helper.sendEtherWithPromise(accounts[9], reserve2.address, reserveEtherInit);
//         await Helper.sendEtherWithPromise(accounts[6], reserve3.address, reserveEtherInit);
//         await Helper.sendEtherWithPromise(accounts[6], reserve4Mal.address, (reserveEtherInit.div(new BN(10))));
//         await uniqueToken.transfer(reserve3.address, 1000000000000);
//         await tokenForMal.transfer(reserve4Mal.address, 1000000000000);

//         let balance = await Helper.getBalancePromise(reserve1.address);
//         expectedReserve1BalanceWei = new BN(balance);
//         Helper.assertEqual(balance, reserveEtherInit, "wrong ether balance");
//         balance = await Helper.getBalancePromise(reserve2.address);
//         expectedReserve2BalanceWei = new BN(balance);
//         Helper.assertEqual(balance, reserveEtherInit, "wrong ether balance");

//         //transfer tokens to reserve. each token same wei balance
//         for (let i = 0; i < numTokens; ++i) {
//             token = tokens[i];
//             let balance;
//             let amount1 = (new BN(reserveEtherInit.mul(new BN(30)))).div(precisionUnits).mul(baseBuyRate1[i]);

//             if(i == 0) {
//                 await token.transfer(walletForToken, amount1);
//                 await token.approve(reserve1.address,amount1,{from:walletForToken});
//                 await reserve1.setTokenWallet(token.address,walletForToken);
//                 balance = await token.balanceOf(walletForToken);
//             }
//             else {
//                 await token.transfer(reserve1.address, amount1);
//                 balance = await token.balanceOf(reserve1.address);
//             }

//             reserve1StartTokenBalance[i] = amount1;

//             let amount2 = (new BN(reserveEtherInit.mul(new BN(10)))).div(precisionUnits).mul(baseBuyRate2[i]);
//             reserve2StartTokenBalance[i] = amount2
//             await token.transfer(reserve2.address, amount2);

//             Helper.assertEqual(amount1, balance);
//             reserve1TokenBalance.push(amount1);
//             reserve2TokenBalance.push(amount2);
//             reserve1TokenImbalance.push(new BN(0));
//             reserve2TokenImbalance.push(new BN(0));
//         }
//     });

//     it("init kyber network proxy and kyber network data, list token pairs.", async function () {
//         // add reserves
//         await network.addReserve(reserve1.address, false, {from: operator});
//         await network.addReserve(reserve2.address, false, {from: operator});
//         await network.addReserve(reserve4Mal.address, false, {from: operator});

//         proxyOld = await ProxyOld.new(admin);

//         await network.setKyberProxy(proxyOld.address);

//         await proxyOld.setKyberNetworkContract(network.address);
//         await reserve4Mal.setKyberProxy(proxyOld.address);

//         await network.setParams(gasPrice, negligibleRateDiff);
//         await network.setEnable(true);
//         let price = await network.maxGasPrice();
//         Helper.assertEqual(price, gasPrice);

//         //list tokens per reserve
//         for (let i = 0; i < numTokens; i++) {
//             await network.listPairForReserve(reserve1.address, tokenAdd[i], true, true, true, {from: operator});
//             await network.listPairForReserve(reserve2.address, tokenAdd[i], true, true, true, {from: operator});
//         }

//         await network.listPairForReserve(reserve4Mal.address, tokenForMal.address, true, true, true, {from: operator});
//     });

//     it("should disable 1 reserve. perform buy and check: balances changed as expected.", async function () {
//         let tokenInd = 1;
//         let token = tokens[tokenInd]; //choose some token
//         let amountWei = 330 * 1;

//         //disable reserve 1
//         await reserve1.disableTrade({from:alerter});
//         let reserveIndex = 2;
//         try {
//             //verify base rate
//             let buyRate = await proxyOld.getExpectedRate(ethAddress, tokenAdd[tokenInd], amountWei);
//             let expected = calculateRateAmount(true, tokenInd, amountWei, reserveIndex);
//             let expectedRate = expected[0];
//             let expectedTweiAmount = expected[1];
//             expectedRate = calcCombinedRate(amountWei, precisionUnits, expectedRate, 18, tokenDecimals[tokenInd], expectedTweiAmount);

//             //check correct rate calculated
//             Helper.assertEqual(buyRate[0], expectedRate, "unexpected rate.");

//             //perform trade
//             let txData = await proxyOld.trade(ethAddress, amountWei, tokenAdd[tokenInd], user2, 50000,
//                 buyRate[1], walletId, {from:user1, value:amountWei});
// //            log(txData.logs[0].args)
// //            log("txData logs 0" + txData.logs[0])
//             assert.equal(txData.logs[0].event, 'ExecuteTrade');
//             assert.equal(txData.logs[0].args.trader, user1, "src address");
//             assert.equal(txData.logs[0].args.src, ethAddress, "src token");
//             Helper.assertEqual(txData.logs[0].args.actualSrcAmount, amountWei);
//             assert.equal(txData.logs[0].args.dest, tokenAdd[tokenInd]);
//             Helper.assertEqual(txData.logs[0].args.actualDestAmount, expectedTweiAmount);

//             //check higher ether balance on reserve
//             expectedReserve2BalanceWei = expectedReserve2BalanceWei.add(new BN(amountWei));
//             let balance = await Helper.getBalancePromise(reserve2.address);
//             Helper.assertEqual(balance, expectedReserve2BalanceWei, "bad reserve balance wei");

//             //check token balances
//             ///////////////////////

//             //check token balance on user2
//             let tokenTweiBalance = await token.balanceOf(user2);
//             Helper.assertEqual(tokenTweiBalance, expectedTweiAmount, "bad token balance");

//             //check lower token balance on reserve
//             reserve2TokenBalance[tokenInd] = reserve2TokenBalance[tokenInd].sub(new BN(expectedTweiAmount));
//             reserve2TokenImbalance[tokenInd] = new BN(expectedTweiAmount).mul(new BN(1)); //imbalance represents how many missing tokens
//             let reportedBalance = await token.balanceOf(reserve2.address);
//             Helper.assertEqual(reportedBalance, reserve2TokenBalance[tokenInd], "bad token balance on reserve");
//             //enable reserve trade
//             await reserve1.enableTrade({from:admin});
//         } catch (e) {
//             //enable reserve trade
//             await reserve1.enableTrade({from:admin});
//             console.log("oooops " + e);
//             throw e;
//         }
//         await reserve1.enableTrade({from:admin});
//     });

//     it("should disable 1 reserve. swap ether to token (simple API) check: balances changed as expected.", async function () {
//         let tokenInd = 1;
//         let token = tokens[tokenInd]; //choose some token
//         let amountWei = new BN(110);

//         //disable reserve 1
//         await reserve1.disableTrade({from:alerter});
//         let reserveIndex = 2;

//         //verify base rate
//         let buyRate = await proxyOld.getExpectedRate(ethAddress, tokenAdd[tokenInd], amountWei);
//         let expected = calculateRateAmount(true, tokenInd, amountWei, reserveIndex);
//         let expectedRate = expected[0];
//         let expectedTweiAmount = expected[1];
//         expectedRate = calcCombinedRate(amountWei, precisionUnits, expectedRate, 18, tokenDecimals[tokenInd], expectedTweiAmount);

//         //check correct rate calculated
//         Helper.assertEqual(buyRate[0], expectedRate, "unexpected rate.");

//         //perform trade
//         let txData = await proxyOld.swapEtherToToken(tokenAdd[tokenInd], buyRate[1], {from:user1, value:amountWei});

//         //check higher ether balance on reserve
//         expectedReserve2BalanceWei = expectedReserve2BalanceWei.add(amountWei);
//         let balance = await Helper.getBalancePromise(reserve2.address);
//         Helper.assertEqual(balance, expectedReserve2BalanceWei, "bad reserve balance wei");

//         //check token balances
//         ///////////////////////

//         //check token balance on user1
//         let tokenTweiBalance = await token.balanceOf(user1);
//         Helper.assertEqual(tokenTweiBalance, expectedTweiAmount, "bad token balance");

//         //check lower token balance on reserve
//         reserve2TokenBalance[tokenInd] = reserve2TokenBalance[tokenInd].sub(expectedTweiAmount);
//         reserve2TokenImbalance[tokenInd] = reserve2TokenImbalance[tokenInd].add(expectedTweiAmount); //imbalance represents how many missing tokens
//         let reportedBalance = await token.balanceOf(reserve2.address);
//         Helper.assertEqual(reportedBalance, reserve2TokenBalance[tokenInd], "bad token balance on reserve");
//         //enable reserve trade
//         await reserve1.enableTrade({from:admin});
//     });


//     it("should disable 1 reserve. perform sell and check: balances changed as expected.", async function () {
//         let tokenInd = 2;
//         let token = tokens[tokenInd]; //choose some token
//         let amountTwei = new BN(1030);

//         //disable reserve 1
//         await reserve1.disableTrade({from:alerter});
//         let reserveIndex = 2;
//         try {
//             //verify base rate
//             let rate = await proxyOld.getExpectedRate(tokenAdd[tokenInd], ethAddress, amountTwei);
//             let expected = calculateRateAmount(false, tokenInd, amountTwei, reserveIndex);
//             let expectedRate = expected[0];
//             let expectedAmountWei = expected[1];

//             expectedRate = calcCombinedRate(amountTwei, expectedRate, precisionUnits, tokenDecimals[tokenInd], 18, expectedAmountWei);

//             //check correct rate calculated
//             Helper.assertEqual(rate[0], expectedRate, "unexpected rate.");

//             await token.transfer(user1, amountTwei);
//             await token.approve(proxyOld.address, amountTwei, {from:user1})

//             //perform trade
//             let balance = await Helper.getBalancePromise(reserve2.address);
//             let txData = await proxyOld.trade(tokenAdd[tokenInd], amountTwei, ethAddress, user2, 500000,
//                             rate[1], walletId, {from:user1});

//             //check lower ether balance on reserve
//             expectedReserve2BalanceWei = expectedReserve2BalanceWei.sub(expectedAmountWei);
//             balance = await Helper.getBalancePromise(reserve2.address);
//             Helper.assertEqual(balance, expectedReserve2BalanceWei, "bad reserve balance wei");

//             //check token balances
//             ///////////////////////

//             //check token balance on user1
//             let tokenTweiBalance = await token.balanceOf(user1);
//             let expectedTweiAmount = 0;
//             Helper.assertEqual(tokenTweiBalance, expectedTweiAmount, "bad token balance");

//             //check higher token balance on reserve
//             reserve2TokenBalance[tokenInd] = reserve2TokenBalance[tokenInd].add(amountTwei);
//             reserve2TokenImbalance[tokenInd] = reserve2TokenImbalance[tokenInd].sub(amountTwei); //imbalance represents how many missing tokens
//             let reportedBalance = await token.balanceOf(reserve2.address);
//             Helper.assertEqual(reportedBalance, reserve2TokenBalance[tokenInd], "bad token balance on reserve");

//         } catch (e) {
//             //enable reserve trade
//             await reserve1.enableTrade({from:admin});
//             console.log("oooops " + e);
//             throw e;
//         }
//         await reserve1.enableTrade({from:admin});
//     });

//     it("should disable 1 reserve. swap token to ether (simple API): balances changed as expected.", async function () {
//         let tokenInd = 2;
//         let token = tokens[tokenInd]; //choose some token
//         let amountTwei = new BN(680);

//         //disable reserve 1
//         await reserve1.disableTrade({from:alerter});
//         let reserveIndex = 2;

//         //verify base rate
//         let rate = await proxyOld.getExpectedRate(tokenAdd[tokenInd], ethAddress, amountTwei);
//         let expected = calculateRateAmount(false, tokenInd, amountTwei, reserveIndex);
//         let expectedRate = expected[0];
//         let expectedAmountWei = expected[1];

//         expectedRate = calcCombinedRate(amountTwei, expectedRate, precisionUnits, tokenDecimals[tokenInd], 18, expectedAmountWei);

//         //check correct rate calculated
//         Helper.assertEqual(rate[0], expectedRate, "unexpected rate.");

//         await token.transfer(user1, amountTwei);
//         await token.approve(proxyOld.address, amountTwei, {from:user1})

//         //perform trade
//         let balance = await Helper.getBalancePromise(reserve2.address);
//         let txData = await proxyOld.swapTokenToEther(tokenAdd[tokenInd], amountTwei, rate[1], {from:user1});

//         //check lower ether balance on reserve
//         expectedReserve2BalanceWei = expectedReserve2BalanceWei.sub(expectedAmountWei);
//         balance = await Helper.getBalancePromise(reserve2.address);
//         Helper.assertEqual(balance, expectedReserve2BalanceWei, "bad reserve balance wei");

//         //check token balances
//         ///////////////////////

//         //check token balance on user1
//         let tokenTweiBalance = await token.balanceOf(user1);
//         let expectedTweiAmount = 0;
//         Helper.assertEqual(tokenTweiBalance, expectedTweiAmount, "bad token balance");

//         //check higher token balance on reserve
//         reserve2TokenBalance[tokenInd] = reserve2TokenBalance[tokenInd].add(amountTwei);
//         reserve2TokenImbalance[tokenInd] = reserve2TokenImbalance[tokenInd].sub(amountTwei); //imbalance represents how many missing tokens
//         let reportedBalance = await token.balanceOf(reserve2.address);
//         Helper.assertEqual(reportedBalance, reserve2TokenBalance[tokenInd], "bad token balance on reserve");

//         await reserve1.enableTrade({from:admin});
//     });


//     it("use trade with hint. disable 1 reserve. perform buy and check: balances changed as expected.", async function () {
//         let tokenInd = 1;
//         let token = tokens[tokenInd]; //choose some token
//         let amountWei = new BN(330);

//         //disable reserve 1
//         await reserve1.disableTrade({from:alerter});
//         let reserveIndex = 2;
//         try {
//             //verify base rate
//             let buyRate = await proxyOld.getExpectedRate(ethAddress, tokenAdd[tokenInd], amountWei);
//             let expected = calculateRateAmount(true, tokenInd, amountWei, reserveIndex);
//             let expectedRate = expected[0];
//             let expectedTweiAmount = expected[1];
//             expectedRate = calcCombinedRate(amountWei, precisionUnits, expectedRate, 18, tokenDecimals[tokenInd], expectedTweiAmount);

//             //check correct rate calculated
//             Helper.assertEqual(buyRate[0], expectedRate, "unexpected rate.");

//             let userStartTwei = await token.balanceOf(user2);

//             //perform trade
//             let txData = await proxyOld.tradeWithHint(ethAddress, amountWei, tokenAdd[tokenInd], user2, 50000,
//                 buyRate[1], walletId, emptyHint, {from:user1, value:amountWei});

//             //check higher ether balance on reserve
//             expectedReserve2BalanceWei = expectedReserve2BalanceWei.add(amountWei);
//             let balance = await Helper.getBalancePromise(reserve2.address);
//             Helper.assertEqual(balance, expectedReserve2BalanceWei, "bad reserve balance wei");

//             //check token balances
//             ///////////////////////

//             //check token balance on user2
//             let tokenTweiBalance = await token.balanceOf(user2);
//             Helper.assertEqual(tokenTweiBalance, expectedTweiAmount.add(userStartTwei), "bad token balance");

//             //check lower token balance on reserve
//             reserve2TokenBalance[tokenInd] = reserve2TokenBalance[tokenInd].sub(expectedTweiAmount);
//             reserve2TokenImbalance[tokenInd] = reserve2TokenImbalance[tokenInd].add(expectedTweiAmount); //imbalance represents how many missing tokens
//             let reportedBalance = await token.balanceOf(reserve2.address);
//             Helper.assertEqual(reportedBalance, reserve2TokenBalance[tokenInd], "bad token balance on reserve");
//             //enable reserve trade
//             await reserve1.enableTrade({from:admin});
//         } catch (e) {
//             //enable reserve trade
//             await reserve1.enableTrade({from:admin});
//             console.log("oooops " + e);
//             throw e;
//         }
//         await reserve1.enableTrade({from:admin});
//     });

//     it("use trade with hint. see hint size > 0 reverts", async function () {
//         let tokenInd = 1;
//         let token = tokens[tokenInd]; //choose some token
//         let amountWei = new BN(330);

//         let buyRate = await proxyOld.getExpectedRate(ethAddress, tokenAdd[tokenInd], amountWei);

//         let hint = '0x123';

//         let user2BalanceBefore = await token.balanceOf(user2);

//         //perform trade
//         try {
//             await proxyOld.tradeWithHint(ethAddress, amountWei, tokenAdd[tokenInd], user2, 50000,
//                 buyRate[1], walletId, hint, {from:user1, value:amountWei});
//             assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected revert but got: " + e);
//         }

//         let user2BalanceAfter = await token.balanceOf(user2);
//         Helper.assertEqual(user2BalanceAfter, user2BalanceBefore);
//     });

//     it("use trade with hint. disable 1 reserve. perform sell and check: balances changed as expected.", async function () {
//         let tokenInd = 2;
//         let token = tokens[tokenInd]; //choose some token
//         let amountTwei = new BN(1030);

//         //disable reserve 1
//         await reserve1.disableTrade({from:alerter});
//         let reserveIndex = 2;
//         try {
//             //verify base rate
//             let rate = await proxyOld.getExpectedRate(tokenAdd[tokenInd], ethAddress, amountTwei);
//             let expected = calculateRateAmount(false, tokenInd, amountTwei, reserveIndex);
//             let expectedRate = expected[0];
//             let expectedAmountWei = expected[1];

//             expectedRate = calcCombinedRate(amountTwei, expectedRate, precisionUnits, tokenDecimals[tokenInd], 18, expectedAmountWei);

//             //check correct rate calculated
//             Helper.assertEqual(rate[0], expectedRate, "unexpected rate.");

//             await token.transfer(user1, amountTwei);
//             await token.approve(proxyOld.address, amountTwei, {from:user1})

//             //perform trade
//             let balance = await Helper.getBalancePromise(reserve2.address);
//             let txData = await proxyOld.tradeWithHint(tokenAdd[tokenInd], amountTwei, ethAddress, user2, 500000,
//                             rate[1], walletId, emptyHint, {from:user1});

//             //check lower ether balance on reserve
//             expectedReserve2BalanceWei = expectedReserve2BalanceWei.sub(expectedAmountWei);
//             balance = await Helper.getBalancePromise(reserve2.address);
//             Helper.assertEqual(balance, expectedReserve2BalanceWei, "bad reserve balance wei");

//             //check token balances
//             ///////////////////////

//             //check token balance on user1
//             let tokenTweiBalance = await token.balanceOf(user1);
//             let expectedTweiAmount = 0;
//             Helper.assertEqual(tokenTweiBalance, expectedTweiAmount, "bad token balance");

//             //check higher token balance on reserve
//             reserve2TokenBalance[tokenInd] = reserve2TokenBalance[tokenInd].add(amountTwei);
//             reserve2TokenImbalance[tokenInd] = reserve2TokenImbalance[tokenInd].sub(amountTwei); //imbalance represents how many missing tokens
//             let reportedBalance = await token.balanceOf(reserve2.address);
//             Helper.assertEqual(reportedBalance, reserve2TokenBalance[tokenInd], "bad token balance on reserve");
//             //enable reserve trade
//             await reserve1.enableTrade({from:admin});
//         } catch (e) {
//             //enable reserve trade
//             await reserve1.enableTrade({from:admin});
//             console.log("oooops " + e);
//             throw e;
//         }
//         await reserve1.enableTrade({from:admin});
//     });

//     it("perform buy with reserve rate diff > negligibleDiff. make sure buy from correct reserve.", async function () {
//         let tokenInd = 2;
//         let token = tokens[tokenInd]; //choose some token
//         let amountWei = new BN(35);

//         //compare reserve buy rates for token
//         let buyRate1 = await reserve1.getConversionRate(ethAddress, tokenAdd[tokenInd], amountWei, currentBlock + 10);
//         let buyRate2 = await reserve2.getConversionRate(ethAddress, tokenAdd[tokenInd], amountWei, currentBlock + 10);
//         let rates = await proxyOld.getExpectedRate(ethAddress, tokenAdd[tokenInd], amountWei);

//         let negligibleDiff = 1 * (await network.negligibleRateDiff());
//         //make sure reserve 2 has higher buy rate > negligibleDiff
//         if ((buyRate2 * 10000 / (10000 + negligibleDiff) <= buyRate1)) {
//             assert(false, "buy rate reserve 2 not bigger by negligibleDiff: " + (negligibleDiff / 10000));
//         }

// //        log("buy rate 1: " + buyRate1 + " buyRate2 " + buyRate2 + " diff rate: " + (buyRate2 * 10000 / (10000 + negligibleDiff)) );
//         //perform trade
//         let txData = await proxyOld.trade(ethAddress, amountWei, tokenAdd[tokenInd], user1, 800, rates[1],
//                             walletId, {from:user1, value:amountWei});
//         console.log('trade ether to token without randomize reserve. gasUsed: ' + txData.receipt.gasUsed);

//         //check higher ether balance on reserve 2
//         expectedReserve2BalanceWei = expectedReserve2BalanceWei.add(amountWei);

//         let balance = await Helper.getBalancePromise(reserve2.address);
//         Helper.assertEqual(balance, expectedReserve2BalanceWei, "bad reserve balance wei");

//         //check token balances
//         ///////////////////////

//         //check token balance on user1
//         let tokenTweiBalance = await token.balanceOf(user1);
//         let expectedTweiAmount = calcDstQty(amountWei, 18, tokenDecimals[tokenInd], buyRate2);
//         Helper.assertEqual(tokenTweiBalance, expectedTweiAmount, "bad token balance");

//         //check lower token balance on reserve
//         //below is true since all tokens and ether have same decimals (18)
//         reserve2TokenBalance[tokenInd] = reserve2TokenBalance[tokenInd].sub(expectedTweiAmount);
//         reserve2TokenImbalance[tokenInd] += reserve2TokenImbalance[tokenInd].add(expectedTweiAmount); //imbalance represents how many missing tokens
//         let reportedBalance = await token.balanceOf(reserve2.address);
//         Helper.assertEqual(reportedBalance, reserve2TokenBalance[tokenInd], "bad token balance on reserve");
//     });

//     it("should set reserve sell rate diff > negligibleDiff. perform sell and make sure done on expected reserve.", async function () {
//         let tokenInd = 0;
//         let token = tokens[tokenInd]; //choose some token
//         let amountTwei = new BN(39);

//         //compare reserve sell rates for token
//         let sellRate1 = await reserve1.getConversionRate(tokenAdd[tokenInd], ethAddress, amountTwei, currentBlock + 10);
//         let sellRate2 = await reserve2.getConversionRate(tokenAdd[tokenInd], ethAddress, amountTwei, currentBlock + 10);
//         let negligibleDiff = 1 * (await network.negligibleRateDiff());
//         let rates = await proxyOld.getExpectedRate(tokenAdd[tokenInd], ethAddress, amountTwei);

//         //make sure reserve 1 has higher sell rate > negligibleDiff
//         let sellRate1MinEps = sellRate1 * 10000 / (10000 * 1 + negligibleDiff * 1);
//         if (sellRate1MinEps <= sellRate2) {
//             assert(false, "rate too small. rate1: " + sellRate1 + " rate1minEps " + sellRate1MinEps + " rate2 " + sellRate2);
//         }

//         // transfer funds to user and approve funds to network
//         await token.transfer(user1, amountTwei);
//         await token.approve(proxyOld.address, amountTwei, {from:user1})

//         // start balance for user2.
//         const startEtherBalanceUser2 = new BN(await Helper.getBalancePromise(user2));

//         //perform trade
//         //API: trade(ERC20 src, srcAmount, ERC20 dest, destAddress, maxDestAmount, minConversionRate, walletId)
//         let txData = await proxyOld.trade(tokenAdd[tokenInd], amountTwei, ethAddress, user2, 300000, rates[1],
//                         walletId, {from:user1, value:0});
//         console.log('trade token to ether without randomize reserve. gasUsed: ' + txData.receipt.gasUsed);

//         //check ether balances, reserve 1 and user2
//         let expectedWeiAmount = calcDstQty(amountTwei, tokenDecimals[tokenInd], 18, sellRate1);
//         expectedReserve1BalanceWei = expectedReserve1BalanceWei.sub(expectedWeiAmount);
//         let balance = await Helper.getBalancePromise(reserve1.address);
//         Helper.assertEqual(balance, expectedReserve1BalanceWei, "bad reserve balance wei");

//         let expectedEthBalanceUser2 = startEtherBalanceUser2.add(expectedWeiAmount);
//         balance = await Helper.getBalancePromise(user2);
//         Helper.assertEqual(balance, expectedEthBalanceUser2, "bad balance user2.");

//         //check token balances
//         ///////////////////////

//         //check token balance on user1
//         let user1TokenTweiBalance = await token.balanceOf(user1);

//         Helper.assertEqual(user1TokenTweiBalance, 0, "bad token balance");

//         //check higher token balance on reserve
//         //below is true since all tokens and ether have same decimals (18)
//         reserve1TokenBalance[tokenInd] = reserve1TokenBalance[tokenInd].add(amountTwei);
//         let reportedBalance = await token.balanceOf(walletForToken);
//         Helper.assertEqual(reportedBalance, reserve1TokenBalance[tokenInd], "bad token balance on reserve");
//     });

//     it("should test low 'max dest amount' on sell. make sure it reduces source amount.", async function () {
//         let tokenInd = 0;
//         let token = tokens[tokenInd]; //choose some token
//         let amountTwei = 3000;
//         let maxDestAmountLow = 50000;
//         let maxDestAmountHigh = 50000000;

//         let rates = await proxyOld.getExpectedRate(tokenAdd[tokenInd], ethAddress, amountTwei);
//         let minRate = rates[0];

//         // transfer funds to user and approve funds to network
//         await token.transfer(user1, amountTwei);
//         await token.approve(proxyOld.address, amountTwei, {from:user1})

//         //perform full amount trade. see token balance on user 1 zero
//         let txData = await proxyOld.trade(tokenAdd[tokenInd], amountTwei, ethAddress, user2, maxDestAmountHigh,
//                             minRate, walletId, {from:user1});
//         console.log("trade token to ether. gas used: " + txData.receipt.gasUsed)

//         //check token balance on user1 is zero
//         let tokenTweiBalance = await token.balanceOf(user1);
//         Helper.assertEqual(tokenTweiBalance, 0, "bad token balance");

//         // transfer funds to user and approve funds to network
//         await token.transfer(user1, amountTwei);
//         await token.approve(proxyOld.address, amountTwei, {from:user1})

//         //user2 initial balance
//         let user2InitBalance = await Helper.getBalancePromise(user2);

//         rates = await proxyOld.getExpectedRate(tokenAdd[tokenInd], ethAddress, amountTwei);
//         minRate = rates[1];

//         //perform blocked amount trade. see token balance on user 1 above zero
//         let result = await proxyOld.trade(tokenAdd[tokenInd], amountTwei, ethAddress, user2, maxDestAmountLow,
//                         minRate, walletId, {from:user1});

//         //check used ethers as expected.
//         let user2PostBalance = await Helper.getBalancePromise(user2);

// //        console.log("init user balance: " + user2InitBalance + " post balance: " + user2PostBalance + " diff " + user2PostBalance*1 - user2InitBalance*1);

//         //check token balance on user1
//         tokenTweiBalance = await token.balanceOf(user1);
//         assert(tokenTweiBalance > 0, "bad token balance");
//     });

//     it("should test low 'max dest amount' on buy. make sure it reduces source amount.", async function () {
//         let tokenInd = 0;
//         let token = tokens[tokenInd]; //choose some token
//         let amountWei = 110000 * 1;
//         let maxDestAmountLow = 11;
//         let maxDestAmountHigh = 30000;

//         let rates = await proxyOld.getExpectedRate(ethAddress, tokenAdd[tokenInd], amountWei);
//         let minRate = rates[0];

//         let initialTokBalUser2 = token.balanceOf(user2);

//         //perform full amount trade. see full token balance on user 2
//         let txData = await proxyOld.trade(ethAddress, amountWei, tokenAdd[tokenInd], user2, maxDestAmountHigh,
//                         minRate, walletId, {from:user1, value:amountWei});
//         console.log("trade ether to token with low max dest amount. gas used: " + txData.receipt.gasUsed)

//         let postTokenBalUser2 = await token.balanceOf(user2);

//         let actualTradedTokens1 = postTokenBalUser2*1 - initialTokBalUser2*1;

//         rates = await proxyOld.getExpectedRate(ethAddress, tokenAdd[tokenInd], amountWei);
//         minRate = rates[0];

//         //perform limited amount trade
//         let trade = await proxyOld.trade(ethAddress, amountWei, tokenAdd[tokenInd], user2, maxDestAmountLow,
//                         minRate, walletId, {from:user1, value:amountWei});

//         let post2ndTokenBalUser2 = await token.balanceOf(user2);

//         let actualTradedTokens2 = post2ndTokenBalUser2*1 - postTokenBalUser2*1;

//         Helper.assertEqual(actualTradedTokens2*1, maxDestAmountLow, "unexpected token balance");
//     });

//     it("should set reserve rate diff < negligibleDiff (negligible diff) perform 20 buys in loop. make sure buys from both reserves.", async function () {
//         let tokenInd = 3;
//         let token = tokens[tokenInd]; //choose some token
//         let amountWei = new BN(100);
//         let numTrades = new BN(20);

//         //compare reserve buy rates for token
//         let buyRate1 = await reserve1.getConversionRate(ethAddress, tokenAdd[tokenInd], amountWei, currentBlock + 10);
//         let buyRate2 = await reserve2.getConversionRate(ethAddress, tokenAdd[tokenInd], amountWei, currentBlock + 10);

//         let negligibleDiff = 400; // 400 / 10000 = 4%
//         await network.setParams(gasPrice, negligibleDiff);

//         //make sure reserve 2 has lower buy rate that is smaller then negligibleDiff
//         if ((buyRate2 * 10000 / (10000 + negligibleDiff) > buyRate1)) {
//             assert(false, "buy rate reserve 2 not smaller by negligibleDiff: " + (negligibleDiff / 10000));
//         }

//         //take initial balance from both reserves
//         let tokPreBalance1 = new BN(await token.balanceOf(reserve1.address));
//         let tokPreBalance2 = new BN(await token.balanceOf(reserve2.address));
//         let ethPreBalance1 = new BN(await Helper.getBalancePromise(reserve1.address));
//         let ethPreBalance2 = new BN(await Helper.getBalancePromise(reserve2.address));

//         //perform 20 trades
//         let minRate = 0;
//         let maxDestAmount = 2000;
//         let cumulativeGas = new BN(0);
//         for (let i = 0; i < numTrades; i++){
//             let txData = await proxyOld.trade(ethAddress, amountWei, tokenAdd[tokenInd], user2, maxDestAmount,
//                             minRate, walletId, {from:user1, value:amountWei});
//             cumulativeGas = cumulativeGas.add(new BN(txData.receipt.gasUsed));
//         }
//         let avgGas = cumulativeGas.div(numTrades);
//         log("average gas usage " + numTrades + " buys. ether to token: " + avgGas);

//         //again take balance from both reserves
//         let tokPostBalance1 = new BN(await token.balanceOf(reserve1.address));
//         let tokPostBalance2 = new BN(await token.balanceOf(reserve2.address));
//         let ethPostBalance1 = new BN(await Helper.getBalancePromise(reserve1.address));
//         let ethPostBalance2 = new BN(await Helper.getBalancePromise(reserve2.address));

//         //check higher ether balance on both
//         Helper.assertGreater(ethPostBalance2,ethPreBalance2,"expected more ether here.");
//         Helper.assertGreater(ethPostBalance1,ethPreBalance1,"expected more ether here.");

//         //check lower token balance on both
//         Helper.assertLesser(tokPostBalance1,tokPreBalance1, "expected more token here.");
//         Helper.assertLesser(tokPostBalance2,tokPreBalance2, "expected more token here.");

//         await network.setParams(gasPrice, negligibleRateDiff);
//     });

//     it("should verify trade reverted when network disabled.", async function () {
//         let tokenInd = 0;
//         let token = tokens[tokenInd]; //choose some token
//         let amountWei = new BN(98000);
//         let minConversionRate = 0;

//         //disable trade
//         await network.setEnable(false);

//         //perform trade
//         try {
//              await proxyOld.trade(ethAddress, amountWei, tokenAdd[tokenInd], user2, 2000,
//                 minConversionRate, walletId, {from:user1, value:amountWei});
//              assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected revert but got: " + e);
//         }

//         //enable trade
//         await network.setEnable(true);

//         await proxyOld.trade(ethAddress, amountWei, tokenAdd[tokenInd], user2, 2000,
//                 minConversionRate, walletId, {from:user1, value:amountWei});
//     });

//     it("should verify buy reverted when bad ether amount is sent.", async function () {
//         let tokenInd = 0;
//         let token = tokens[tokenInd]; //choose some token
//         let amountWei = 83000;
//         let minConversionRate = 0;

//         //perform trade
//         try {
//              await proxyOld.trade(ethAddress, amountWei, tokenAdd[tokenInd], user2, 2000,
//                 minConversionRate, walletId, {from:user1, value:amountWei*1-1});
//              assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected revert but got: " + e);
//         }

//         await proxyOld.trade(ethAddress, amountWei, tokenAdd[tokenInd], user2, 2000,
//                 minConversionRate, walletId, {from:user1, value:amountWei});
//     });

//     it("should verify sell reverted when not enough token allowance.", async function () {
//         let tokenInd = 1;
//         let token = tokens[tokenInd]; //choose some token
//         let amountTWei = 15*1;

//         let allowance = await token.allowance(user1, proxyOld.address);
// //        log("allowance " + allowance)
//         Helper.assertEqual(allowance, 0);
//         //for this test to work, user allowance has to be 0

//         // transfer funds to user and approve funds to network
//         await token.transfer(user1, amountTWei);
//         await token.approve(proxyOld.address, amountTWei*1-1, {from:user1})

//         try {
//             await proxyOld.trade(tokenAdd[tokenInd], amountTWei, ethAddress, user2, 5000, 0, walletId, {from:user1});
//             assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected revert but got: " + e);
//         }

//         //add missing allowance
//         await token.approve(proxyOld.address, amountTWei, {from:user1})

//         //perform same trade
//         await proxyOld.trade(tokenAdd[tokenInd], amountTWei, ethAddress, user2, 5000, 0, walletId, {from:user1});
//     });

//     it("should verify sell reverted when not enough tokens in source address allowance.", async function () {
//         let tokenInd = 1;
//         let token = tokens[tokenInd]; //choose some token
//         let amountTWei = 15*1;

//         let balance = await token.balanceOf(user1);
//         await token.transfer(user2, balance, {from: user1});
//         balance = await token.balanceOf(user1);

//         Helper.assertEqual(balance, 0);
//         //for this test to work, user balance has to be 0

//         // transfer funds to user and approve funds to network
//         await token.transfer(user1, amountTWei - 1);
//         await token.approve(proxyOld.address, amountTWei, {from:user1})

//         try {
//             await proxyOld.trade(tokenAdd[tokenInd], amountTWei, ethAddress, user2, 5000, 0, walletId, {from:user1});
//             assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected revert but got: " + e);
//         }

//         //add missing tokens
//         await token.transfer(user1, 1);

//         //perform same trade
//         await proxyOld.trade(tokenAdd[tokenInd], amountTWei, ethAddress, user2, 5000, 0, walletId, {from:user1});
//     });

//     it("should verify sell reverted when sent with ether value.", async function () {
//         let tokenInd = 1;
//         let token = tokens[tokenInd]; //choose some token
//         let amountTWei = 15*1;

//         // transfer funds to user and approve funds to network
//         await token.transfer(user1, amountTWei);
//         await token.approve(proxyOld.address, amountTWei, {from:user1})

//         try {
//             await proxyOld.trade(tokenAdd[tokenInd], amountTWei, ethAddress, user2, 5000, 0,
//                 walletId, {from:user1, value: 10});
//             assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected revert but got: " + e);
//         }

//         //perform same trade
//         await proxyOld.trade(tokenAdd[tokenInd], amountTWei, ethAddress, user2, 5000, 0, walletId, {from:user1, value: 0});
//     });

//     it("should verify trade reverted when dest amount (actual amount) is 0.", async function () {
//         let tokenInd = 3;
//         let token = tokens[tokenInd]; //choose some token
//         let amountTweiLow = 1;
//         let amountTWeiHi = 80;

//         // transfer funds to user and approve funds to network
//         await token.transfer(network.address, amountTWeiHi);
//         await token.transfer(user1, amountTWeiHi);
//         await token.approve(proxyOld.address, amountTWeiHi, {from:user1})

//         let sellRate1 = await reserve1.getConversionRate(tokenAdd[tokenInd], ethAddress, amountTweiLow, currentBlock + 10);
//         rates = await proxyOld.getExpectedRate(tokenAdd[tokenInd], ethAddress, amountTweiLow);
//         minRate = rates[1];

//         //try with low amount Twei
//         try {
//             await proxyOld.trade(tokenAdd[tokenInd], amountTweiLow, ethAddress, user2, 3000, minRate,
//                     walletId, {from:user1});
//             assert(false, "throw was expected in line above.")
//         }
//         catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected revert but got: " + e);
//         }

//         //perform same trade with higher value to see success
//         let destAmount = await proxyOld.trade(tokenAdd[tokenInd], amountTWeiHi, ethAddress, user2, 3000,
//             minRate, walletId, {from:user1});
//     });

//     it("should verify trade reverted when gas price above set max.", async function () {
//         let tokenInd = 3;
//         let token = tokens[tokenInd]; //choose some token
//         let amountWei = new BN(41);
//         let minConversionRate = 0;
//         let maxPrice = await proxyOld.maxGasPrice();
//         let highGas = maxPrice.add(new BN(1));

//         //perform trade
//         try {
//              await proxyOld.trade(ethAddress, amountWei, tokenAdd[tokenInd], user2, 2000,
//                 minConversionRate, walletId, {from:user1, value:amountWei, gasPrice: highGas});
//              assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected revert but got: " + e);
//         }

//         //see trade success with good gas price
//         await proxyOld.trade(ethAddress, amountWei, tokenAdd[tokenInd], user2, 2000,
//                   minConversionRate, walletId, {from:user1, value:amountWei, gasPrice: maxPrice});
//     });

//     it("should verify trade reverted src amount > max src amount (10**28).", async function () {
//         let tokenInd = 3;
//         let token = tokens[tokenInd]; //choose some token
//         let amountTWei = (new BN(10).pow(new BN(28))).add(new BN(1));

//         // transfer funds to user and approve funds to network - for all trades in this 'it'
//         await token.transfer(user1, amountTWei);
//         await token.approve(proxyOld.address, amountTWei, {from:user1})

//         //more ether to reserve
//         await Helper.sendEtherWithPromise(accounts[7], reserve1.address, 11050000000000000000);

//         //set high imbalance values - to avoid block trade due to total imbalance per block
//         let highImbalance = amountTWei.mul(new BN(4));
//         await pricing1.setTokenControlInfo(token.address, new BN(10).pow(new BN(14)), highImbalance, highImbalance);
//         //set large category cap for user 1
       
//         //MODIFY RATE
//         tokensPerEther = (new BN(10)).pow(new BN(24));
//         ethersPerToken = (new BN(precisionUnits.div(new BN(1000000000))));
//         oldBaseBuy = baseBuyRate1[tokenInd];
//         oldBaseSell = baseSellRate1[tokenInd];
//         baseBuyRate1[tokenInd] = tokensPerEther;
//         baseSellRate1[tokenInd] = ethersPerToken;
//         buys.length = sells.length = indices.length = 0;
//         await pricing1.setBaseRate(tokenAdd, baseBuyRate1, baseSellRate1, buys, sells, currentBlock, indices, {from: operator});

//         try {
//             await proxyOld.trade(tokenAdd[tokenInd], amountTWei, ethAddress, user2, amountTWei,
//                 0, walletId, {from:user1});
//             assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected revert but got: " + e);
//         }

//         //see same trade performed when value is 1 less
//         await proxyOld.trade(tokenAdd[tokenInd], amountTWei.sub(new BN(1)), ethAddress,
//                 user2, amountTWei, 0, walletId, {from:user1});
//         baseBuyRate1[tokenInd] = oldBaseBuy;
//         baseSellRate1[tokenInd] = oldBaseSell;
//         await pricing1.setBaseRate(tokenAdd, baseBuyRate1, baseSellRate1, buys, sells, currentBlock, indices, {from: operator});
//         await pricing1.setTokenControlInfo(token.address, minimalRecordResolution, maxPerBlockImbalance, maxTotalImbalance);
//     });

//     it("should verify trade reverted when rate below min rate.", async function () {
//         let tokenInd = 1;
//         let token = tokens[tokenInd]; //choose some token
//         let amountTWei = new BN(35);

//         // transfer funds to user and approve funds to network - for all trades in this 'it'
//         await token.transfer(user1, amountTWei);
//         await token.approve(proxyOld.address, amountTWei, {from:user1})

//         let rates = await proxyOld.getExpectedRate(tokenAdd[tokenInd], ethAddress, amountTWei);
//         let minConvRate = rates[0];
//         let minSetRate = minConvRate.add(new BN(1));
//         try {
//             await proxyOld.trade(tokenAdd[tokenInd], amountTWei, ethAddress, user2, amountTWei,
//                         minSetRate, walletId, {from:user1});
//             assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected revert but got: " + e);
//         }

//         //same trade with zero min rate
//         await proxyOld.trade(tokenAdd[tokenInd], amountTWei, ethAddress, user2,
//                     amountTWei, 0, walletId, {from:user1});
//     });

//     it("should verify trade reverted when rate above max rate.", async function () {
//         let tokenInd = 1;
//         let token = tokens[tokenInd]; //choose some token
//         let amountTWei = new BN(35);

//         // transfer funds to user and approve funds to network - for all trades in this 'it'
//         await token.transfer(user1, amountTWei);
//         await token.approve(proxyOld.address, amountTWei, {from:user1})

//         //modify rate
//         baseSellRate1[tokenInd] = max_rate;
//         baseSellRate2[tokenInd] = max_rate;

//         buys.length = sells.length = indices.length = 0;

//         await pricing1.setBaseRate(tokenAdd, baseBuyRate1, baseSellRate1, buys, sells, currentBlock, indices, {from: operator});
//         await pricing2.setBaseRate(tokenAdd, baseBuyRate2, baseSellRate2, buys, sells, currentBlock, indices, {from: operator});

//         try {
//             await proxyOld.trade(tokenAdd[tokenInd], amountTWei, ethAddress, user2, 5000, 0, walletId, {from:user1});
//             assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected revert but got: " + e);
//         }

//         //modify rate back to normal
//         tokensPerEther = (new BN(precisionUnits.mul(new BN((tokenInd + 1) * 3))));
//         baseSellRate1[tokenInd] = tokensPerEther;
//         baseSellRate2[tokenInd] = tokensPerEther;

//         buys.length = sells.length = indices.length = 0;

//         await pricing1.setBaseRate(tokenAdd, baseBuyRate1, baseSellRate1, buys, sells, currentBlock, indices, {from: operator});
//         await pricing2.setBaseRate(tokenAdd, baseBuyRate2, baseSellRate2, buys, sells, currentBlock, indices, {from: operator});

//         //see same trade performed when normal rate
//         await proxyOld.trade(tokenAdd[tokenInd], amountTWei, ethAddress,
//                 user2, amountTWei, 0, walletId, {from:user1});
//     });

//     it("should verify trade reverted when dest address 0.", async function () {
//         let tokenInd = 3;
//         let token = tokens[tokenInd]; //choose some token
//         let amountWei = new BN(18);
//         let minConversionRate = 0;

//         //perform trade
//         try {
//              await proxyOld.trade(ethAddress, amountWei, tokenAdd[tokenInd], zeroAddress, 2000, minConversionRate,
//                 walletId, {from:user1, value:amountWei});
//              assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected revert but got: " + e);
//         }

//         //see same trade performed with valid value
//         await proxyOld.trade(ethAddress, amountWei, tokenAdd[tokenInd], user2, 2000, minConversionRate,
//             walletId, {from:user1, value:amountWei});
//     });

//     it("should test can't init this contract with empty contracts (address 0) or with non admin.", async function () {
//         let proxyTemp;

//         try {
//             proxyTemp = await ProxyOld.new(zeroAddress);
//             assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected revert but got: " + e);
//         }

//         proxyTemp = await ProxyOld.new(admin);

//         let rxNetworkAddress = await proxyTemp.kyberNetworkContract();
//         assert.equal(rxNetworkAddress, 0);

//         await proxyTemp.setKyberNetworkContract(network.address);

//         rxNetworkAddress = await proxyTemp.kyberNetworkContract();
//         assert.equal(rxNetworkAddress, network.address);

//         try {
//             await proxyTemp.setKyberNetworkContract(zeroAddress);
//             assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected revert but got: " + e);
//         }

//         rxNetworkAddress = await proxyTemp.kyberNetworkContract();
//         assert.equal(rxNetworkAddress, network.address);
//     });

//     it("should set kyberNetwork and test event.", async function () {

//         let tempNetworkAdd = accounts[7];
//         let result = await proxyOld.setKyberNetworkContract(tempNetworkAdd);

// //        log (result.logs[0].args)
//         assert.equal(result.logs[0].args.newNetworkContract, tempNetworkAdd);
//         assert.equal(result.logs[0].args.oldNetworkContract, network.address);

//         result = await proxyOld.setKyberNetworkContract(network.address);
//     });


//     it("should test getter. user cap in Wei.", async function () {

//         let capFromNetwork = await network.getUserCapInWei(user2);
//         let capFromProxy = await proxyOld.getUserCapInWei(user2);

//         Helper.assertEqual(capFromNetwork, capFromProxy, "cap in wei should match");
//     });

//     it("should test getter. user cap in token Wei. see reverts", async function () {
//         let tokenAddress = tokenAdd[2];

//         try {
//             let capFromNetwork = await network.getUserCapInTokenWei(user2, tokenAddress);
//             assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected revert but got: " + e);
//         }
//     });

//     it("should test getter. max gas price.", async function () {
//         let maxGasFromNetwork = await network.maxGasPrice();
//         let maxGasFromProxy = await proxyOld.maxGasPrice();

//         Helper.assertEqual(maxGasFromNetwork, maxGasFromProxy, "values from proxy and network should match.");
//     });

//     it("should test getter. max gas price.", async function () {

//         await network.setEnable(false);

//         let enabledFromNetwork = await network.enabled();
//         let enabledFromProxy = await proxyOld.enabled();

//         Helper.assertEqual(enabledFromNetwork, enabledFromProxy, "values from proxy and network should match.");

//         await network.setEnable(true);

//         enabledFromNetwork = await network.enabled();
//         enabledFromProxy = await proxyOld.enabled();

//         Helper.assertEqual(enabledFromNetwork, enabledFromProxy, "values from proxy and network should match.");
//     });

//     it("use setInfo (UI info) and see value returned in getter.", async function () {
//         let info = new BN(15);
//         let field = web3.utils.fromAscii('10');

//         await network.setInfo(field, info, {from: operator});
//         let rxInfo = await proxyOld.info(field);
//         Helper.assertEqual(info, rxInfo, "info data doesn't match");
//     });

//     it("should test token to token trade 1 reserve.", async function () {
//         let tokenSrcInd = 1;
//         let tokenDestInd = 0;
//         let tokenSrc = tokens[tokenSrcInd];
//         let tokenDest = tokens[tokenDestInd];
//         let srcAmountTwei = new BN(1450);
//         let maxDestAmount = (new BN(10)).pow(new BN(18));

//         //reset max imbalance values - for working with higher numbers
//         currentBlock = await Helper.getCurrentBlock();

//         //set compact data
//         compactBuyArr = [0, 0, 0, 0, 0, 06, 07, 08, 09, 10, 11, 12, 13, 14];
//         let compactBuyHex = Helper.bytesToHex(compactBuyArr);
//         buys.push(compactBuyHex);

//         compactSellArr = [0, 0, 0, 0, 0, 26, 27, 28, 29, 30, 31, 32, 33, 34];
//         let compactSellHex = Helper.bytesToHex(compactSellArr);
//         sells.push(compactSellHex);

//         indices[0] = 0;
//         await pricing1.setBaseRate(tokenAdd, baseBuyRate1, baseSellRate1, buys, sells, currentBlock, indices, {from: operator});
//         await pricing2.setBaseRate(tokenAdd, baseBuyRate2, baseSellRate2, buys, sells, currentBlock, indices, {from: operator});
//         priceUpdateBlock = currentBlock;

//         maxPerBlockImbalance = new BN(5).mul(new BN(10).pow(new BN(18)));
//         maxTotalImbalance = maxPerBlockImbalance;

//         //set higher imbalance values - and set local imbalance values to 0 since we update compact data.
//         for (let i = 0; i < numTokens; ++i) {
//             await pricing1.setTokenControlInfo(tokenAdd[i], minimalRecordResolution, maxPerBlockImbalance, maxTotalImbalance);
//             await pricing2.setTokenControlInfo(tokenAdd[i], minimalRecordResolution, maxPerBlockImbalance, maxTotalImbalance);
//             //update balance in imbalance values
//             reserve2TokenBalance[i] = new BN(await tokens[i].balanceOf(reserve2.address));
//             reserve2TokenImbalance[i] = new BN(0);
//             if (i == 0) {
//                 reserve1TokenBalance[i] = new BN(await tokens[i].balanceOf(walletForToken));
//             } else {
//                 reserve1TokenBalance[i] = new BN(await tokens[i].balanceOf(reserve1.address));
//             }
//             reserve1TokenImbalance[i] = new BN(0);
// //            log(i + " reserve2TokenImbalance: " + reserve2TokenImbalance[i] + " reserve1TokenImbalance: " + reserve1TokenImbalance[i])
//         }

//         await reserve1.disableTrade({from:alerter});

//         try {
//             //verify base rate
//             let buyRate = await proxyOld.getExpectedRate(tokenAdd[tokenSrcInd], tokenAdd[tokenDestInd], srcAmountTwei);

//             // first token to eth rate
//             let expected = calculateRateAmount(false, tokenSrcInd, srcAmountTwei, 2);
//             let expectedSellRate = expected[0];
//             let expectedEthQtyWei = expected[1];
// //            log('expectedSell ' + expected )

//             //eth to token
//             expected = calculateRateAmount(true, tokenDestInd, expectedEthQtyWei, 2);
//             let expectedBuyRate = expected[0];
//             expectedDestTokensTwei = expected[1];
// //            log('expectedBuy ' + expected )

//             //calcCombinedRate(srcQty, sellRate, buyRate, srcDecimals, dstDecimals)
//             let combinedRate = calcCombinedRate(srcAmountTwei, expectedSellRate, expectedBuyRate, tokenDecimals[tokenSrcInd], tokenDecimals[tokenDestInd], expectedDestTokensTwei);

//             //check correct rate calculated
//             Helper.assertEqual(buyRate[0], combinedRate, "unexpected rate.");

//             //perform trade
//             // transfer funds to user and approve funds to network - for all trades in this 'it'
//             await tokenSrc.transfer(user1, srcAmountTwei);
//             await tokenSrc.approve(proxyOld.address, srcAmountTwei, {from:user1})

//             let startBalanceTokenDestUser2 = await tokenDest.balanceOf(user2);
//             let startBalanceTokenSrcUser1 = await tokenSrc.balanceOf(user1);
//     //        function trade(src, srcAmount, dest, destAddress, maxDestAmount, minConversionRate, walletId)

//             let result = await proxyOld.trade(tokenAdd[tokenSrcInd], srcAmountTwei, tokenAdd[tokenDestInd],
//                 user2, maxDestAmount, buyRate[1], walletId, {from:user1});

//             //update balance and imbalance
//             reserve2TokenBalance[tokenSrcInd] = (reserve2TokenBalance[tokenSrcInd]).add(srcAmountTwei);
//             reserve2TokenImbalance[tokenSrcInd] = reserve2TokenImbalance[tokenSrcInd].sub(srcAmountTwei);
//             reserve2TokenBalance[tokenDestInd] = reserve2TokenBalance[tokenDestInd].sub(expectedDestTokensTwei);
//             reserve2TokenImbalance[tokenDestInd] =  reserve2TokenImbalance[tokenDestInd].add(expectedDestTokensTwei); //more missing tokens

//             //check token balances
//             ///////////////////////

//             //check higher tokenDest balance on user2
//             let rate = new BN(buyRate[0]);
//             let tokenDestUser2Balance = await tokenDest.balanceOf(user2);
//             let expectedBalanceTokenDestUser2 = startBalanceTokenDestUser2.add(expectedDestTokensTwei);
//             Helper.assertEqual(expectedBalanceTokenDestUser2, tokenDestUser2Balance, "bad token balance");

//             //check lower tokenSrc balance on user1
//             let tokenSrcUser1Balance = await tokenSrc.balanceOf(user1);
//             let expectedBalanceTokenSrcUser1 = startBalanceTokenSrcUser1.sub(srcAmountTwei);
//             Helper.assertEqual(tokenSrcUser1Balance, expectedBalanceTokenSrcUser1, "bad token balance");

//             //check token balance on reserve
//             //tokenSrc
//             reportedBalance = await tokenSrc.balanceOf(reserve2.address);
//             Helper.assertEqual(reportedBalance, reserve2TokenBalance[tokenSrcInd], "bad token balance on reserve");

//             //tokenDest
//             reportedBalance = await tokenDest.balanceOf(reserve2.address);
//             Helper.assertEqual(reportedBalance, reserve2TokenBalance[tokenDestInd], "bad token balance on reserve");
//         } catch(e) {
//             await reserve1.enableTrade({from:admin});
//             throw(e);
//         }
//         await reserve1.enableTrade({from:admin});
//     });

//     it("should test token to token swap (simple API) 2 different reserves.", async function () {
//         let tokenSrcInd = 1;
//         let tokenDestInd = 3;
//         let tokenSrc = tokens[tokenSrcInd];
//         let tokenDest = tokens[tokenDestInd];
//         let srcAmountTwei = new BN(321);
//         let maxDestAmount = (new BN(10)).pow(new BN(18));

//         await pricing1.disableTokenTrade(tokenAdd[tokenSrcInd], {from: alerter});
//         await pricing2.disableTokenTrade(tokenAdd[tokenDestInd], {from: alerter});

//         try {
//             //rate
//             let buyRate = await proxyOld.getExpectedRate(tokenAdd[tokenSrcInd], tokenAdd[tokenDestInd], srcAmountTwei);
//             //calculate rates
//             // first token to eth rate
//             let expected = calculateRateAmount(false, tokenSrcInd, srcAmountTwei, 2);
//             let expectedSellRate = expected[0];
//             let expectedEthQtyWei = expected[1];

//             //eth to token
//             expected = calculateRateAmount(true, tokenDestInd, expectedEthQtyWei, 1);
//             let expectedBuyRate = expected[0];
//             expectedDestTokensTwei = expected[1];

//             let combinedRate = calcCombinedRate(srcAmountTwei, expectedSellRate, expectedBuyRate, tokenDecimals[tokenSrcInd], tokenDecimals[tokenDestInd], expectedDestTokensTwei);

//  //        check correct rate calculated
//             Helper.assertEqual(buyRate[0], combinedRate, "unexpected rate.");

//              //perform trade
//             // transfer funds to user and approve funds to network
//             await tokenSrc.transfer(user1, srcAmountTwei);
//             await tokenSrc.approve(proxyOld.address, srcAmountTwei, {from:user1})

//             let startBalanceTokenDestUser1 = await tokenDest.balanceOf(user1);
//             let startBalanceTokenSrcUser1 = await tokenSrc.balanceOf(user1);

//     //        function trade(src, srcAmount, dest, destAddress, maxDestAmount, minConversionRate, walletId)

//             result = await proxyOld.swapTokenToToken(tokenAdd[tokenSrcInd], srcAmountTwei, tokenAdd[tokenDestInd],
//                 buyRate[1], {from:user1});
// //            log(result.logs[0].args);
// //            log(result.logs[1].args);

//             //update balance and imbalance
//             reserve2TokenBalance[tokenSrcInd] = reserve2TokenBalance[tokenSrcInd].add(srcAmountTwei);
//             reserve2TokenImbalance[tokenSrcInd] = reserve2TokenImbalance[tokenSrcInd].sub(srcAmountTwei); // less missing tokens.
//             reserve1TokenBalance[tokenDestInd] = reserve1TokenBalance[tokenDestInd].sub(expectedDestTokensTwei);
//             reserve1TokenImbalance[tokenDestInd] = reserve1TokenImbalance[tokenDestInd].add(expectedDestTokensTwei);

//     //        check token balances
//             ///////////////////
//             //check tokenDest balance on user2
//             let rate = new BN(buyRate[0]);
//             let tokenDestUser1Balance = await tokenDest.balanceOf(user1);
//             let expectedBalanceTokenDestUser1 = startBalanceTokenDestUser1.add(expectedDestTokensTwei);
//             Helper.assertEqual(expectedBalanceTokenDestUser1, tokenDestUser1Balance, "bad token balance");

//             //check tokenSrc balance on user1
//             let tokenSrcUser1Balance = await tokenSrc.balanceOf(user1);
//             let expectedBalanceTokenSrcUser1 = startBalanceTokenSrcUser1.sub(srcAmountTwei);
//             Helper.assertEqual(tokenSrcUser1Balance, expectedBalanceTokenSrcUser1, "bad token balance");

//             //check token balance on reserve
//             //tokenSrc
//             reportedBalance = await tokenSrc.balanceOf(reserve2.address);
//             Helper.assertEqual(reportedBalance, reserve2TokenBalance[tokenSrcInd], "bad token balance on reserve");

//             //tokenDest
//             reportedBalance = await tokenDest.balanceOf(reserve1.address);
//             Helper.assertEqual(reportedBalance, reserve1TokenBalance[tokenDestInd], "bad token balance on reserve");
//             reportedBalance = await tokenDest.balanceOf(reserve2.address);
//             Helper.assertEqual(reportedBalance, reserve2TokenBalance[tokenDestInd], "bad token balance on reserve");

//             await pricing1.enableTokenTrade(tokenAdd[tokenSrcInd]);
//             await pricing2.enableTokenTrade(tokenAdd[tokenDestInd]);
//         } catch(e) {
//             await pricing1.enableTokenTrade(tokenAdd[tokenSrcInd]);
//             await pricing2.enableTokenTrade(tokenAdd[tokenDestInd]);
//             throw(e);
//         }
//     });

//     it("should test token to token trade 2 different reserves. other numbers.", async function () {
//         let tokenSrcInd = 1;
//         let tokenDestInd = 0;
//         let tokenSrc = tokens[tokenSrcInd];
//         let tokenDest = tokens[tokenDestInd];
//         let srcAmountTwei = new BN(2451);
//         let maxDestAmount = (new BN(10)).pow(new BN(18));

//         await pricing1.disableTokenTrade(tokenAdd[tokenSrcInd], {from: alerter});
//         await pricing2.disableTokenTrade(tokenAdd[tokenDestInd], {from: alerter});

//         try {
//             //rate
//             let buyRate = await proxyOld.getExpectedRate(tokenAdd[tokenSrcInd], tokenAdd[tokenDestInd], srcAmountTwei);

//             //calculate rates
//             // first token to eth rate
//             let expected = calculateRateAmount(false, tokenSrcInd, srcAmountTwei, 2);
//             let expectedSellRate = expected[0];
//             let expectedEthQtyWei = expected[1];
// //            log('expectedSell ' + expected )

//             //eth to token
//             expected = calculateRateAmount(true, tokenDestInd, expectedEthQtyWei, 1);
//             let expectedBuyRate = expected[0];
//             expectedDestTokensTwei = expected[1];
// //            log('expectedBuy ' + expected )

//             let combinedRate = calcCombinedRate(srcAmountTwei, expectedSellRate, expectedBuyRate, tokenDecimals[tokenSrcInd], tokenDecimals[tokenDestInd], expectedDestTokensTwei);

//  //        check correct rate calculated
//             Helper.assertEqual(buyRate[0], combinedRate, "unexpected rate.");

//              //perform trade
//             // transfer funds to user and approve funds to network
//             await tokenSrc.transfer(user1, srcAmountTwei);
//             await tokenSrc.approve(proxyOld.address, srcAmountTwei, {from:user1})

//             let startBalanceTokenDestUser2 = await tokenDest.balanceOf(user2);
//             let startBalanceTokenSrcUser1 = await tokenSrc.balanceOf(user1);

//     //        function trade(src, srcAmount, dest, destAddress, maxDestAmount, minConversionRate, walletId)

//             result = await proxyOld.trade(tokenAdd[tokenSrcInd], srcAmountTwei, tokenAdd[tokenDestInd], user2,
//                         maxDestAmount, buyRate[1], walletId, {from:user1});
// //            log(result.logs[0].args);
// //            log(result.logs[1].args);

//             //update balance and imbalance
//             reserve2TokenBalance[tokenSrcInd] = reserve2TokenBalance[tokenSrcInd].add(srcAmountTwei);
//             reserve2TokenImbalance[tokenSrcInd] = reserve2TokenImbalance[tokenSrcInd].sub(srcAmountTwei); // less missing tokens.
//             reserve1TokenBalance[tokenDestInd] = reserve1TokenBalance[tokenDestInd].sub(expectedDestTokensTwei);
//             reserve1TokenImbalance[tokenDestInd] = reserve1TokenImbalance[tokenDestInd].add(expectedDestTokensTwei);

//     //        check token balances
//             ///////////////////
//             //check tokenDest balance on user2
//             let rate = new BN(buyRate[0]);
//             let tokenDestUser2Balance = await tokenDest.balanceOf(user2);
//             let expectedBalanceTokenDestUser2 = startBalanceTokenDestUser2.add(expectedDestTokensTwei);
//             Helper.assertEqual(expectedBalanceTokenDestUser2, tokenDestUser2Balance, "bad token balance");

//             //check tokenSrc balance on user1
//             let tokenSrcUser1Balance = await tokenSrc.balanceOf(user1);
//             let expectedBalanceTokenSrcUser1 = startBalanceTokenSrcUser1.sub(srcAmountTwei);
//             Helper.assertEqual(tokenSrcUser1Balance, expectedBalanceTokenSrcUser1, "bad token balance");

//             //check token balance on reserve
//             //tokenSrc
//             reportedBalance = await tokenSrc.balanceOf(reserve2.address);
//             Helper.assertEqual(reportedBalance, reserve2TokenBalance[tokenSrcInd], "bad token balance on reserve");

//             //tokenDest
//             if (tokenDestInd != 0) {
//                 reportedBalance = await tokenDest.balanceOf(reserve1.address);
//             } else {
//                 reportedBalance = await tokenDest.balanceOf(walletForToken);
//             }

//             Helper.assertEqual(reportedBalance, reserve1TokenBalance[tokenDestInd], "bad token balance on reserve");
//             reportedBalance = await tokenDest.balanceOf(reserve2.address);
//             Helper.assertEqual(reportedBalance, reserve2TokenBalance[tokenDestInd], "bad token balance on reserve");

//             await pricing1.enableTokenTrade(tokenAdd[tokenSrcInd]);
//             await pricing2.enableTokenTrade(tokenAdd[tokenDestInd]);
//         } catch(e) {
//             await pricing1.enableTokenTrade(tokenAdd[tokenSrcInd]);
//             await pricing2.enableTokenTrade(tokenAdd[tokenDestInd]);
//             throw(e);
//         }
//     });

//     it("should test token to token trade with limited max dest amount.", async function () {
//         //when limiting max dest amount can't work with small numbers.
//         //it has some issue as follows:
// //        when user request maxDestAmount for a trade, we re-calculate the src amount so he would get the exact amount he requested.
// //
// //        lets assume user wants SOME token which converts 1 eth to 100 SOME.
// //        what could happen
// //
// //        user requests max dest amount of 101 SOME tokens.
// //        we re calculate source amount and round it up to 2 (the naive calculation would round it to 1).
// //        now trade it 2 ether --> 101 SOME.
// //        on the end of our trade a check sure user wasn't "cheated" with this formula:
// //        require(
// //        (userDestBalanceAfter - userDestBalanceBefore)
// //        >=
// //        calcDstQty((userSrcBalanceBefore - userSrcBalanceAfter), ..., ...., minConversionRate));
// //        min conversion rate here could be around 95-100 so according to this calculation user should get "at least" 190 SOME. but he got only 101 so - trade is reverted.

//         let tokenSrcInd = 0;
//         let tokenDestInd = 1;
//         let tokenSrc = tokens[tokenSrcInd];
//         let tokenDest = tokens[tokenDestInd];
//         let srcAmountTwei = new BN(10).pow(new BN(5));
//         let maxDestAmount = new BN(10).pow(new BN(5));

//         await pricing2.disableTokenTrade(tokenAdd[tokenSrcInd], {from: alerter});
//         await pricing1.disableTokenTrade(tokenAdd[tokenDestInd], {from: alerter});

//         //rate
//         let buyRate = await proxyOld.getExpectedRate(tokenAdd[tokenSrcInd], tokenAdd[tokenDestInd], srcAmountTwei);

//         //calculate rates
//         // first token to eth rate
//         let expected = calculateRateAmount(false, tokenSrcInd, srcAmountTwei, 1);
//         let expectedSellRate = expected[0];
//         let expectedEthQtyWei = expected[1];
//         //            log('expectedEthQtyWei ' + expectedEthQtyWei)

//         //eth to token
//         expected = calculateRateAmount(true, tokenDestInd, expectedEthQtyWei, 2);
//         let expectedBuyRate = expected[0];
//         let expectedDestTokensTwei = expected[1];

//         let combinedRate = calcCombinedRate(srcAmountTwei, expectedSellRate, expectedBuyRate, tokenDecimals[tokenSrcInd], tokenDecimals[tokenDestInd], expectedDestTokensTwei);

// //        check correct rate calculated
//         Helper.assertEqual(buyRate[0], combinedRate, "unexpected rate.");

//         //calc real amounts from max
//         //api:  calcSrcQty(dstQty, srcDecimals, dstDecimals, rate)
//         let expectedEthQtyWeiForDestTokens = calcSrcQty(maxDestAmount, 18, tokenDecimals[tokenDestInd], expectedBuyRate);
// //        log('expectedEthQtyWeiForDestTokens for maxDest amount ' + expectedEthQtyWeiForDestTokens);

//         let expectedSrcTweiForWeiAmount = calcSrcQty(expectedEthQtyWeiForDestTokens, tokenDecimals[tokenSrcInd], 18, expectedSellRate);
// //        log('expectedSrcForMaxAmount ' + expectedSrcForMaxAmount)

//         // perform trade
//         // transfer funds to user and approve funds to network - for all trades in this 'it'
//         await tokenSrc.transfer(user2, srcAmountTwei);
//         await tokenSrc.approve(proxyOld.address, srcAmountTwei, {from:user2})

//         let startBalanceNetworkWei =  await Helper.getBalancePromise(network.address);
//         let startBalanceNetworkTokDest = await tokenDest.balanceOf(network.address);
//         let startBalanceTokenDestUser1 = await tokenDest.balanceOf(user1);
//         let startBalanceTokenSrcUser2 = await tokenSrc.balanceOf(user2);
// //        function trade(src, srcAmount, dest, destAddress, maxDestAmount, minConversionRate, walletId)
//         result = await proxyOld.trade(tokenAdd[tokenSrcInd], srcAmountTwei, tokenAdd[tokenDestInd], user1, maxDestAmount,
//                             buyRate[1], walletId, {from:user2});
// //        console.log(result.logs);
// //        console.log(result.logs[0].args);
// //        console.log(result.logs[1].args);
// //        console.log(result.logs[4].args);

// //        check token balances
//         /////////////////////

//         //check tokenDest balance on user1
//         let rate = new BN(buyRate[0]);
//         let tokenDestUser1Balance = await tokenDest.balanceOf(user1);
//         let expectedBalanceTokenDestUser1 = startBalanceTokenDestUser1.add(maxDestAmount);
//         Helper.assertEqual(expectedBalanceTokenDestUser1, tokenDestUser1Balance, "bad token balance");

//         //check tokenSrc balance on user2
//         let tokenSrcUser2Balance = await tokenSrc.balanceOf(user2);
//         let expectedBalanceTokenSrcUser2 = startBalanceTokenSrcUser2.sub(expectedSrcTweiForWeiAmount);
//         Helper.assertEqual(tokenSrcUser2Balance, expectedBalanceTokenSrcUser2, "bad token balance");

//         //check token balance on reserve
//         //tokenSrc
//         reserve1TokenBalance[tokenSrcInd] = reserve1TokenBalance[tokenSrcInd].add(expectedSrcTweiForWeiAmount);
//         reserve1TokenImbalance[tokenSrcInd] = reserve1TokenImbalance[tokenSrcInd].sub(expectedSrcTweiForWeiAmount); //imbalance represents how many missing tokens
//         if(tokenSrcInd != 0) {
//             reportedBalance = await tokenSrc.balanceOf(reserve1.address);
//         } else {
//             reportedBalance = await tokenSrc.balanceOf(walletForToken);
//         }
//         Helper.assertEqual(reportedBalance, reserve1TokenBalance[tokenSrcInd], "bad token balance on reserve");

//         //tokenDest
//         reserve2TokenBalance[tokenDestInd] = reserve2TokenBalance[tokenDestInd].sub(maxDestAmount);
//         //notice here the reserve sends expectedDestTwei - its not aware of max dest amount
//         reserve2TokenImbalance[tokenDestInd] = reserve2TokenImbalance[tokenDestInd].add(maxDestAmount); //imbalance represents how many missing tokens
//         reportedBalance = await tokenDest.balanceOf(reserve2.address);
//         Helper.assertEqual(reportedBalance, reserve2TokenBalance[tokenDestInd], "bad token balance on reserve");

//         //////////////////////////////
//         //notice, network will also have some minor balance, since we calculate src rate according to max Dest.
//         //reserve sends network amount according to src and rate. network sends amount according to maxDest it requested.
//         //outcome is some leftover Weis in network contract.
//         ////////////////////
//         let expectedSentWeiFromTrade1ToNetwork = calcDstQty(expectedSrcTweiForWeiAmount, tokenDecimals[tokenSrcInd], 18, expectedSellRate);
//         let expectedNetworkWei = expectedSentWeiFromTrade1ToNetwork.add(new BN(startBalanceNetworkWei)).sub(new BN(expectedEthQtyWeiForDestTokens));
//         let networkBalanceWei = await Helper.getBalancePromise(network.address);
// //        log("networkBalanceWei " + networkBalanceWei + " expectedNetworkWei " + expectedNetworkWei)
//         Helper.assertEqual(networkBalanceWei, expectedNetworkWei, "network should have different wei balance");

//         let networkBalanceTweiDest = await tokenDest.balanceOf(network.address);
//         let expectedDestTwei = calcDstQty(expectedEthQtyWeiForDestTokens, 18, tokenDecimals[tokenDestInd], expectedBuyRate);
//         let expecteNetworkDestTwei = expectedDestTwei.add(startBalanceNetworkTokDest).sub(maxDestAmount);
//         Helper.assertEqual(networkBalanceTweiDest, expecteNetworkDestTwei, "network should have different wei balance");

//         await pricing2.enableTokenTrade(tokenAdd[tokenSrcInd]);
//         await pricing1.enableTokenTrade(tokenAdd[tokenDestInd]);
//     });

//     it("should test token to token - limited max dest amount - different numbers.", async function () {
//         let tokenSrcInd = 1;
//         let tokenDestInd = 2;
//         let tokenSrc = tokens[tokenSrcInd];
//         let tokenDest = tokens[tokenDestInd];
//         let srcAmountTwei = new BN(7853);
//         let maxDestAmount = new BN(8500);

//         await pricing2.disableTokenTrade(tokenAdd[tokenSrcInd], {from: alerter});
//         await pricing1.disableTokenTrade(tokenAdd[tokenDestInd], {from: alerter});

//         //rate
//         let buyRate = await proxyOld.getExpectedRate(tokenAdd[tokenSrcInd], tokenAdd[tokenDestInd], srcAmountTwei);

//         //calculate rates
//         // first token to eth rate
//         let expected = calculateRateAmount(false, tokenSrcInd, srcAmountTwei, 1);
//         let expectedSellRate = expected[0];
//         let expectedEthQtyWei = expected[1];
//         //            log('expectedEthQtyWei ' + expectedEthQtyWei)

//         //eth to token
//         expected = calculateRateAmount(true, tokenDestInd, expectedEthQtyWei, 2);
//         let expectedBuyRate = expected[0];
//         let expectedDestTokensTwei = expected[1];

//         let combinedRate = calcCombinedRate(srcAmountTwei, expectedSellRate, expectedBuyRate, tokenDecimals[tokenSrcInd], tokenDecimals[tokenDestInd], expectedDestTokensTwei);

//         //        check correct rate calculated
//         Helper.assertEqual(buyRate[0], combinedRate, "unexpected rate.");

//         //calc real amounts from max
//         //api:  calcSrcQty(dstQty, srcDecimals, dstDecimals, rate)
//         let expectedEthQtyWeiForDestTokens = calcSrcQty(maxDestAmount, 18, tokenDecimals[tokenDestInd], expectedBuyRate);
//         //        log('expectedEthQtyWeiForDestTokens for maxDest amount ' + expectedEthQtyWeiForDestTokens);

//         let expectedSrcTweiForWeiAmount = calcSrcQty(expectedEthQtyWeiForDestTokens, tokenDecimals[tokenSrcInd], 18, expectedSellRate);
//         //        log('expectedSrcForMaxAmount ' + expectedSrcForMaxAmount)

//         // perform trade
//         // transfer funds to user and approve funds to network - for all trades in this 'it'
//         await tokenSrc.transfer(user2, srcAmountTwei);
//         await tokenSrc.approve(proxyOld.address, srcAmountTwei, {from:user2})

//         let startBalanceNetworkWei =  await Helper.getBalancePromise(network.address);
//         let startBalanceNetworkTokDest = await tokenDest.balanceOf(network.address);
//         let startBalanceTokenDestUser1 = await tokenDest.balanceOf(user1);
//         let startBalanceTokenSrcUser2 = await tokenSrc.balanceOf(user2);

//         //        function trade(src, srcAmount, dest, destAddress, maxDestAmount, minConversionRate, walletId)
//         result = await proxyOld.trade(tokenAdd[tokenSrcInd], srcAmountTwei, tokenAdd[tokenDestInd], user1, maxDestAmount,
//                          buyRate[1], walletId, {from:user2});
//         //        console.log(result.logs);
//         //        console.log(result.logs[0].args);
//         //        console.log(result.logs[1].args);
//         //        console.log(result.logs[4].args);

//         //        check token balances
//         /////////////////////

//         //check tokenDest balance on user1
//         let rate = new BN(buyRate[0]);
//         let tokenDestUser1Balance = await tokenDest.balanceOf(user1);
//         let expectedBalanceTokenDestUser1 = startBalanceTokenDestUser1.add(maxDestAmount);
//         Helper.assertEqual(expectedBalanceTokenDestUser1, tokenDestUser1Balance, "bad token balance");

//         //check tokenSrc balance on user2
//         let tokenSrcUser2Balance = await tokenSrc.balanceOf(user2);
//         let expectedBalanceTokenSrcUser2 = startBalanceTokenSrcUser2.sub(expectedSrcTweiForWeiAmount);
//         Helper.assertEqual(tokenSrcUser2Balance, expectedBalanceTokenSrcUser2, "bad token balance");

//         //check token balance on reserve
//         //tokenSrc
//         reserve1TokenBalance[tokenSrcInd] = reserve1TokenBalance[tokenSrcInd].add(expectedSrcTweiForWeiAmount);
//         reserve1TokenImbalance[tokenSrcInd] = reserve1TokenImbalance[tokenSrcInd].sub(expectedSrcTweiForWeiAmount); //imbalance represents how many missing tokens
//         reportedBalance = await tokenSrc.balanceOf(reserve1.address);
//         Helper.assertEqual(reportedBalance, reserve1TokenBalance[tokenSrcInd], "bad token balance on reserve");

//         //tokenDest
//         reserve2TokenBalance[tokenDestInd] = reserve2TokenBalance[tokenDestInd].sub(maxDestAmount);
//         //notice here the reserve sends expectedDestTwei - its not aware of max dest amount
//         reserve2TokenImbalance[tokenDestInd] = reserve2TokenImbalance[tokenDestInd].add(maxDestAmount); //imbalance represents how many missing tokens
//         reportedBalance = await tokenDest.balanceOf(reserve2.address);
//         Helper.assertEqual(reportedBalance, reserve2TokenBalance[tokenDestInd], "bad token balance on reserve");

//         //////////////////////////////
//         //notice, network will also have some minor balance, since we calculate src rate according to max Dest.
//         //reserve sends network amount according to src and rate. network sends amount according to maxDest it requested.
//         //outcome is some leftover Weis in network contract.
//         ////////////////////
//         let expectedSentWeiFromTrade1ToNetwork = calcDstQty(expectedSrcTweiForWeiAmount, tokenDecimals[tokenSrcInd], 18, expectedSellRate);

//         let expectedNetworkWei = expectedSentWeiFromTrade1ToNetwork.add(new BN(startBalanceNetworkWei)).sub(new BN(expectedEthQtyWeiForDestTokens));
//         let networkBalanceWei = await Helper.getBalancePromise(network.address);
//         //        log("networkBalanceWei " + networkBalanceWei + " expectedNetworkWei " + expectedNetworkWei)
//         Helper.assertEqual(networkBalanceWei, expectedNetworkWei, "network should have different wei balance");

//         let networkBalanceTweiDest = await tokenDest.balanceOf(network.address);
//         let expectedDestTwei = calcDstQty(expectedEthQtyWeiForDestTokens, 18, tokenDecimals[tokenDestInd], expectedBuyRate);
//         let expecteNetworkDestTwei = expectedDestTwei.add(new BN(startBalanceNetworkTokDest)).sub(maxDestAmount);
//         Helper.assertEqual(networkBalanceTweiDest, expecteNetworkDestTwei, "network should have different wei balance");

//         await pricing2.enableTokenTrade(tokenAdd[tokenSrcInd]);
//         await pricing1.enableTokenTrade(tokenAdd[tokenDestInd]);
//     });

//     it("verify trade is reverted when malicious reserve tries recursive call = tries to call kyber trade function.", async function () {

//         await reserve4Mal.setDestAddress(scammer);
//         let rxScammer = await reserve4Mal.scammer();
//         assert.equal(rxScammer, scammer);

//         let scamTokenn = tokens[1];
//         await reserve4Mal.setDestToken(scamTokenn.address);
//         let rxToken = await reserve4Mal.scamToken();
//         assert.equal(rxToken, scamTokenn.address);

//         let amountWei = 330;

//         //first see we have rates
//         let buyRate = await proxyOld.getExpectedRate(ethAddress, tokenForMal.address, amountWei);
//         assert(buyRate[0] != 0);
//         assert(buyRate[1] != 0);

//         //test trade from malicious
//         let balanceBefore = await scamTokenn.balanceOf(scammer);
//         //here test the internal trade in malicious is valid
//         await reserve4Mal.doTrade();

//         let balanceAfter = await scamTokenn.balanceOf(scammer);
//         assert(balanceAfter > balanceBefore);

//         //see trade success when numRecursive is 0
//         await reserve4Mal.setNumRecursive(0);
//         await proxyOld.trade(ethAddress, amountWei, tokenForMal.address, user2, 50000, buyRate[1], walletId, {from:user1, value:amountWei});

//         //see trade ether to token reverts when num recursive > 0
//         await reserve4Mal.setNumRecursive(1);

//         try {
//             await proxyOld.trade(ethAddress, amountWei, tokenForMal.address, user2, 50000,
//                          buyRate[1], walletId, {from:user1, value:amountWei});
//             assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected revert but got: " + e);
//         }
//     });

//     it("should verify revert when token to token trade with same src and dest token.", async function () {
//         let tokenSrcInd = 1;
//         let tokenDestInd = 1;
//         let tokenSrc = tokens[tokenSrcInd];
//         let tokenDest = tokens[tokenDestInd];
//         let srcAmountTwei = new BN(136);
//         let maxDestAmount = (new BN(10)).pow(new BN(18));

//         rate = await proxyOld.getExpectedRate(tokenSrc.address, tokenDest.address, srcAmountTwei);

//         let ethBalance = await Helper.getBalancePromise(reserve1.address);
//         ethBalance = await Helper.getBalancePromise(reserve2.address);
//         let destTokBalance = await tokenDest.balanceOf(reserve1.address)
//         destTokBalance = await tokenDest.balanceOf(reserve2.address)

//         let expectedDestAmount = calcDstQty(srcAmountTwei, tokenDecimals[tokenSrcInd], tokenDecimals[tokenDestInd], rate[0]);

//         await tokenSrc.transfer(user1, srcAmountTwei);
//         await tokenSrc.approve(proxyOld.address, srcAmountTwei, {from:user1})

//         let user1SrcTokBalanceBefore = new BN(await tokenSrc.balanceOf(user1));
//         let user2DestTokBalanceBefore = new BN(await tokenDest.balanceOf(user2));

//         //log("trade " + i + " srcInd: " + tokenSrcInd + " dest ind: " + tokenDestInd + " srcQty: " + srcAmountTwei);
//         //see trade reverts
//         try {
//             let result = await proxyOld.trade(tokenSrc.address, srcAmountTwei, tokenDest.address, user2, maxDestAmount,
//                   rate[1], walletId, {from:user1});
//             assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected revert but got: " + e);
//         }

//         let expectedUser1SrcTokBalanceAfter = user1SrcTokBalanceBefore;
//         let expectedUser2DestTokBalanceAfter = user2DestTokBalanceBefore;

//         let user1SrcTokBalanceAfter = await tokenSrc.balanceOf(user1);
//         let user2DestTokBalanceAfter = await tokenDest.balanceOf(user2);

//         Helper.assertEqual(user1SrcTokBalanceAfter, expectedUser1SrcTokBalanceAfter);
//         Helper.assertEqual(user2DestTokBalanceAfter, expectedUser2DestTokBalanceAfter, "expect no balance change...")
//         assert(user2DestTokBalanceAfter >= expectedUser2DestTokBalanceAfter, "not enough dest token transferred");
//     });

//     it("test token to token, a few trades, both reserves.", async function () {
//         let tokenSrcInd;
//         let tokenDestInd;
//         let tokenSrc = tokens[tokenSrcInd];
//         let tokenDest = tokens[tokenDestInd];
//         let maxDestAmount = (new BN(10)).pow(new BN(17));

//         let srcAmountTwei = new BN(3450).sub(new BN(1960));
//         let cumulativeGas = new BN(0);
//         let numTrades = 19;
//         for (let i = 0; i < numTrades; i++) {
//             tokenSrcInd = (i + 1) % numTokens;
//             tokenDestInd = i % numTokens;
//             tokenSrc = tokens[tokenSrcInd];
//             tokenDest = tokens[tokenDestInd];
//             srcAmountTwei = new BN(17 + (i * 168));
// //            srcAmountTwei = new BN(743);

// //            log("src amount: " + srcAmountTwei + " index src: " + tokenSrcInd + " tokenSrc: " + tokenSrc.address + " ind: " + tokenDestInd + " token dest " + tokenDest.address);
//             rate = await proxyOld.getExpectedRate(tokenSrc.address, tokenDest.address, srcAmountTwei);

//             let ethBalance = await Helper.getBalancePromise(reserve1.address);
// //            log("eth balance 1 " + ethBalance);
//             ethBalance = await Helper.getBalancePromise(reserve2.address);
// //            log("eth balance 2 " + ethBalance);
//             let destTokBalance = await tokenDest.balanceOf(reserve1.address)
// //            log("dest token balance 1 " + destTokBalance);
//             destTokBalance = await tokenDest.balanceOf(reserve2.address)
// //            log("dest token balance 2 " + destTokBalance);

// //            log(i  + " expected rate: " + rate);
//             let expectedDestAmount = calcDstQty(srcAmountTwei, tokenDecimals[tokenSrcInd], tokenDecimals[tokenDestInd], rate[0]);
// //            log ("src Amount: " + srcAmountTwei +  " expected dest: " + expectedDestAmount)

//             await tokenSrc.transfer(user1, srcAmountTwei);
//             await tokenSrc.approve(proxyOld.address, srcAmountTwei, {from:user1})

//             let user1SrcTokBalanceBefore = new BN(await tokenSrc.balanceOf(user1));
//             let user2DestTokBalanceBefore = new BN(await tokenDest.balanceOf(user2));

// //            log("trade " + i + " srcInd: " + tokenSrcInd + " dest ind: " + tokenDestInd + " srcQty: " + srcAmountTwei);
//             let result = await proxyOld.trade(tokenSrc.address, srcAmountTwei, tokenDest.address, user2, maxDestAmount,
//                                  rate[1], walletId, {from:user1});
//             cumulativeGas = cumulativeGas.add(new BN(result.receipt.gasUsed));

//             let expectedUser1SrcTokBalanceAfter = user1SrcTokBalanceBefore.sub(srcAmountTwei);
//             let expectedUser2DestTokBalanceAfter = user2DestTokBalanceBefore.add(expectedDestAmount);

//             let user1SrcTokBalanceAfter = await tokenSrc.balanceOf(user1);
//             let user2DestTokBalanceAfter = await tokenDest.balanceOf(user2);

//             //for token to token can't calculate the exact dest amount.
//             //since this trade is done in two steps. src --> eth. then eth-->dest. the decimals data is lost.
//             //since EVM has no decimals.
//             //but rate reflects rate1 * rate2. and doesn't reflect the lost decimals between step 1 and step 2.
//             Helper.assertEqual(user1SrcTokBalanceAfter, expectedUser1SrcTokBalanceAfter);
//             assert(1 >= (user2DestTokBalanceAfter.sub(expectedUser2DestTokBalanceAfter)), " diff from calculated rate to actual balance should be 1")
// //            log("expected trade value: " + expectedDestAmount)
//             assert(user2DestTokBalanceAfter >= expectedUser2DestTokBalanceAfter, "not enough dest token transferred");
//         };
//     });


//     it("init smart malicious network and set all contracts and params", async function () {
//         maliciousNetwork = await MaliciousNetwork.new(admin);
//         await maliciousNetwork.addOperator(operator);

//         await reserve1.setContracts(maliciousNetwork.address, pricing1.address, zeroAddress);
//         await reserve2.setContracts(maliciousNetwork.address, pricing2.address, zeroAddress);

//         // add reserves
//         await maliciousNetwork.addReserve(reserve1.address, false, {from: operator});
//         await maliciousNetwork.addReserve(reserve2.address, false, {from: operator});

//         await maliciousNetwork.setKyberProxy(proxyOld.address);

//         await proxyOld.setKyberNetworkContract(maliciousNetwork.address);

//         //set contracts
//         await maliciousNetwork.setFeeBurner(feeBurner.address);
//         await maliciousNetwork.setParams(gasPrice, negligibleRateDiff);
//         await maliciousNetwork.setEnable(true);
//         let price = await maliciousNetwork.maxGasPrice();
//         Helper.assertEqual(price, gasPrice);

//         //list tokens per reserve
//         for (let i = 0; i < numTokens; i++) {
//             await maliciousNetwork.listPairForReserve(reserve1.address, tokenAdd[i], true, true, true, {from: operator});
//             await maliciousNetwork.listPairForReserve(reserve2.address, tokenAdd[i], true, true, true, {from: operator});
//         }
//     });

//     it("verify sell with malicious network reverts when using exact rate as min rate", async function () {
//         //trade data
//         let tokenInd = 2;
//         let token = tokens[tokenInd]; //choose some token
//         let amountTwei = new BN(1123);

//         //disable reserve 1
//         await reserve1.disableTrade({from:alerter});

//         // trade with steeling reverts
//         //////////////////////////////

//         let myWalletAddress = await maliciousNetwork.myWallet();
//         let myWallBalance = await Helper.getBalancePromise(myWalletAddress);

//         //set steal amount to 1 wei
//         let myFee = 1;
//         await maliciousNetwork.setMyFeeWei(myFee);
//         let rxFeeWei = await maliciousNetwork.myFeeWei();
//         Helper.assertEqual(rxFeeWei, myFee);

//         //get rate
//         let rate = await proxyOld.getExpectedRate(tokenAdd[tokenInd], ethAddress, amountTwei);

//         await token.transfer(user1, amountTwei);
//         await token.approve(proxyOld.address, amountTwei, {from:user1})

//         //see trade reverts
//         try {
//             await proxyOld.trade(tokenAdd[tokenInd], amountTwei, ethAddress, user2, 500000,
//                  rate[0], walletId, {from:user1});
//             assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected revert but got: " + e);
//         }

//         //set steal fee to 0 and see trade success
//         await maliciousNetwork.setMyFeeWei(0);
//         rxFeeWei = await maliciousNetwork.myFeeWei();
//         Helper.assertEqual(rxFeeWei, 0);

//         await proxyOld.trade(tokenAdd[tokenInd], amountTwei, ethAddress, user2, 500000,
//                      rate[0], walletId, {from:user1});
//         await reserve1.enableTrade({from:admin});
//     });

//     it("verify buy with malicious network reverts when using exact rate as min rate", async function () {
//         //trade data
//         let tokenInd = 2;
//         let token = tokens[tokenInd]; //choose some token
//         let amountWei = new BN(960);

//         // trade with steeling reverts
//         //////////////////////////////

//         //set "myFee" (malicious) amount to 1 wei
//         let myFee = 1;
//         await maliciousNetwork.setMyFeeWei(myFee);
//         let rxFeeWei = await maliciousNetwork.myFeeWei();
//         Helper.assertEqual(rxFeeWei, myFee);

//         //get rate
//         let rate = await proxyOld.getExpectedRate(ethAddress, tokenAdd[tokenInd], amountWei);

//         //see trade reverts
//         try {
//             await proxyOld.trade(ethAddress, amountWei, tokenAdd[tokenInd], user2, 500000,
//                  rate[0], walletId, {from:user1, value: amountWei});
//             assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected revert but got: " + e);
//         }

//         //set steal fee to 0 and see trade success
//         await maliciousNetwork.setMyFeeWei(0);

//         await proxyOld.trade(ethAddress, amountWei, tokenAdd[tokenInd], user2, 500000,
//                 rate[0], walletId, {from:user1, value: amountWei});
//     });

//     it("verify buy with malicious network reverts when using slippage rate as min rate - depending on taken amount", async function () {
//         //trade data
//         let tokenInd = 2;
//         let token = tokens[tokenInd]; //choose some token
//         let amountWei = new BN(960);

//         // trade with steeling reverts
//         //////////////////////////////

//         //get rate
//         let rate = await proxyOld.getExpectedRate(ethAddress, tokenAdd[tokenInd], amountWei);

//         //use "small fee"
//         let mySmallFee = 3;
//         await maliciousNetwork.setMyFeeWei(mySmallFee);
//         let rxFeeWei = await maliciousNetwork.myFeeWei();
//         Helper.assertEqual(rxFeeWei, mySmallFee);

//         //with slippage as min rate doesn't revert
//         await proxyOld.trade(ethAddress, amountWei, tokenAdd[tokenInd], user2, 500000,
//                 rate[1], walletId, {from:user1, value: amountWei});

//         //with higher fee should revert
//         mySmallFee = 4;
//         await maliciousNetwork.setMyFeeWei(mySmallFee);
//         rxFeeWei = await maliciousNetwork.myFeeWei();
//         Helper.assertEqual(rxFeeWei, mySmallFee);

//         //see trade reverts
//         try {
//             await proxyOld.trade(ethAddress, amountWei, tokenAdd[tokenInd], user2, 500000,
//                  rate[1], walletId, {from:user1, value: amountWei});
//             assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected revert but got: " + e);
//         }

//     });

//     it("verify when user sets min rate to 0 all tokens can be stolen", async function () {
//         //trade data
//         let tokenInd = 3;
//         let token = tokens[tokenInd]; //choose some token
//         let amountWei = new BN(125);

//         // trade with steeling reverts
//         //////////////////////////////
//         //get rate
//         let myWalletAddress = await maliciousNetwork.myWallet();
//         let myWallBalance = await Helper.getBalancePromise(myWalletAddress);

//         let rate = await proxyOld.getExpectedRate(ethAddress, tokenAdd[tokenInd], amountWei);

//         //calc dest amount
//         let expectedDest = (new BN(amountWei)).mul(rate[0]).div(precisionUnits);

//         //expected dest has 1 wei error
//         let mySmallFee = new BN(expectedDest - 1);
//         await maliciousNetwork.setMyFeeWei(mySmallFee);
//         let rxFeeWei = await maliciousNetwork.myFeeWei();
//         Helper.assertEqual(rxFeeWei, mySmallFee);

//         let myWalletStartBalance =  await token.balanceOf(myWalletAddress);

//         //with min rate 0
//         await proxyOld.trade(ethAddress, amountWei, tokenAdd[tokenInd], user2, 500000,
//                 0, walletId, {from:user1, value: amountWei});

//         let myWalletExpectedBalance = (new BN(myWalletStartBalance)).add(mySmallFee);
//         let balance = await token.balanceOf(myWalletAddress);

//         Helper.assertEqual(balance, myWalletExpectedBalance)
//     });

//     it("init malicious network returning wrong actual dest, and set all contracts and params", async function () {
//         maliciousNetwork2 = await MaliciousNetwork2.new(admin);
//         await maliciousNetwork2.addOperator(operator);

//         await reserve1.setContracts(maliciousNetwork2.address, pricing1.address, zeroAddress);
//         await reserve2.setContracts(maliciousNetwork2.address, pricing2.address, zeroAddress);

//         // add reserves
//         await maliciousNetwork2.addReserve(reserve1.address, false, {from: operator});
//         await maliciousNetwork2.addReserve(reserve2.address, false, {from: operator});

//         await maliciousNetwork2.setKyberProxy(proxyOld.address);

//         await proxyOld.setKyberNetworkContract(maliciousNetwork2.address);

//         //set contracts
//         feeBurner = await FeeBurner.new(admin, tokenAdd[0], maliciousNetwork2.address, ethToKncRatePrecision);
//         await maliciousNetwork2.setFeeBurner(feeBurner.address);
//         await maliciousNetwork2.setParams(gasPrice, negligibleRateDiff);
//         await maliciousNetwork2.setEnable(true);
//         let price = await maliciousNetwork2.maxGasPrice();
//         Helper.assertEqual(price, gasPrice);

//         //list tokens per reserve
//         for (let i = 0; i < numTokens; i++) {
//             await maliciousNetwork2.listPairForReserve(reserve1.address, tokenAdd[i], true, true, true, {from: operator});
//             await maliciousNetwork2.listPairForReserve(reserve2.address, tokenAdd[i], true, true, true, {from: operator});
//         }
//     });

//     it("verify sell with malicious network2 reverts when using any min rate (0).", async function () {
//         //trade data
//         let tokenInd = 2;
//         let token = tokens[tokenInd]; //choose some token
//         let amountTwei = 1123;

//         //disable reserve 1
//         await reserve1.disableTrade({from:alerter});

//         // trade with steeling reverts
//         //////////////////////////////

//         let myWalletAddress = await maliciousNetwork2.myWallet();
//         let myWallBalance = await Helper.getBalancePromise(myWalletAddress);

//         //set steal amount to 1 wei
//         let myFee = 1;
//         await maliciousNetwork2.setMyFeeWei(myFee);
//         let rxFeeWei = await maliciousNetwork2.myFeeWei();
//         Helper.assertEqual(rxFeeWei, myFee);

//         //get rate
//         let rate = await proxyOld.getExpectedRate(tokenAdd[tokenInd], ethAddress, amountTwei);

//         await token.transfer(user1, amountTwei);
//         await token.approve(proxyOld.address, amountTwei, {from:user1})

//         //see trade reverts
//         // with this malicious network it reverts since wrong actual dest amount is returned.
//         try {
//             let result = await proxyOld.trade(tokenAdd[tokenInd], amountTwei, ethAddress, user2, 500000,
//                  0, walletId, {from:user1});
//             assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected revert but got: " + e);
//         }

//         //set steal fee to 0 and see trade success
//         await maliciousNetwork2.setMyFeeWei(0);
//         rxFeeWei = await maliciousNetwork2.myFeeWei();
//         Helper.assertEqual(rxFeeWei, 0);

//         await proxyOld.trade(tokenAdd[tokenInd], amountTwei, ethAddress, user2, 500000,
//                      rate[0], walletId, {from:user1});
//         await reserve1.enableTrade({from:admin});
//     });

//     it("verify buy with malicious network reverts with any rate (even 0) as min rate", async function () {
//         //trade data
//         let tokenInd = 2;
//         let token = tokens[tokenInd]; //choose some token
//         let amountWei = 960;

//         // trade with steeling reverts
//         //////////////////////////////

//         //set "myFee" (malicious) amount to 1 wei
//         let myFee = 2;
//         await maliciousNetwork2.setMyFeeWei(myFee);
//         let rxFeeWei = await maliciousNetwork2.myFeeWei();
//         Helper.assertEqual(rxFeeWei, myFee);

//         //get rate
//         let rate = await proxyOld.getExpectedRate(ethAddress, tokenAdd[tokenInd], amountWei);

//         //see trade reverts
//         try {
//             await proxyOld.trade(ethAddress, amountWei, tokenAdd[tokenInd], user2, 500000,
//                  0, walletId, {from:user1, value: amountWei});
//             assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected revert but got: " + e);
//         }

//         //set steal fee to 0 and see trade success
//         await maliciousNetwork2.setMyFeeWei(0);

//         await proxyOld.trade(ethAddress, amountWei, tokenAdd[tokenInd], user2, 500000,
//                 rate[0], walletId, {from:user1, value: amountWei});
//     });

//     it("init network with no max dest check. set all contracts and params", async function () {
//         networkNoMaxDest = await NetworkNoMaxDest.new(admin);
//         await networkNoMaxDest.addOperator(operator);

//         await reserve1.setContracts(networkNoMaxDest.address, pricing1.address, zeroAddress);
//         await reserve2.setContracts(networkNoMaxDest.address, pricing2.address, zeroAddress);

//         // add reserves
//         await networkNoMaxDest.addReserve(reserve1.address, false, {from: operator});
//         await networkNoMaxDest.addReserve(reserve2.address, false, {from: operator});

//         await networkNoMaxDest.setKyberProxy(proxyOld.address);

//         await proxyOld.setKyberNetworkContract(networkNoMaxDest.address);

//         //set contracts
//         feeBurner = await FeeBurner.new(admin, tokenAdd[0], networkNoMaxDest.address, ethToKncRatePrecision);
//         await networkNoMaxDest.setFeeBurner(feeBurner.address);
//         await networkNoMaxDest.setParams(gasPrice, negligibleRateDiff);
//         await networkNoMaxDest.setEnable(true);

//         let price = await networkNoMaxDest.maxGasPrice();
//         Helper.assertEqual(price, gasPrice);

//         //list tokens per reserve
//         for (let i = 0; i < numTokens; i++) {
//             await networkNoMaxDest.listPairForReserve(reserve1.address, tokenAdd[i], true, true, true, {from: operator});
//             await networkNoMaxDest.listPairForReserve(reserve2.address, tokenAdd[i], true, true, true, {from: operator});
//         }
//     });

//     it("verify sell with low max dest amount reverts.", async function () {
//         //trade data
//         let tokenInd = 2;
//         let token = tokens[tokenInd]; //choose some token
//         let amountTwei = 721;

//         //disable reserve 1
//         await reserve1.disableTrade({from:alerter});

//         //get rate
//         let rate = await proxyOld.getExpectedRate(tokenAdd[tokenInd], ethAddress, amountTwei);

//         // first token to eth rate
//         let expected = calculateRateAmount(false, tokenInd, amountTwei, 2);
//         let expectedEthQtyWei = expected[1];
//         let lowMaxDest = expectedEthQtyWei - 80;

//         await token.transfer(user1, amountTwei);
//         await token.approve(proxyOld.address, amountTwei, {from:user1})

//         //see trade reverts
//         // with this malicious network it reverts since wrong actual dest amount is returned.
//         try {
//             await proxyOld.trade(tokenAdd[tokenInd], amountTwei, ethAddress, user2, lowMaxDest,
//                  rate[1], walletId, {from:user1});
//             assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected revert but got: " + e);
//         }

//         //high max dest shouldn't revert
//         await proxyOld.trade(tokenAdd[tokenInd], amountTwei, ethAddress, user2, (expectedEthQtyWei + 30 * 1),
//                      rate[1], walletId, {from:user1});
//         await reserve1.enableTrade({from:admin});
//     });

//     it("verify buy with network without max dest reverts if dest amount is below actual dest amount", async function () {
//         //trade data
//         let tokenInd = 2;
//         let token = tokens[tokenInd]; //choose some token
//         let amountWei = 960;

//         //disable reserve 1
//         await reserve1.disableTrade({from:alerter});

//         //get rate
//         let rate = await proxyOld.getExpectedRate(ethAddress, tokenAdd[tokenInd], amountWei);

//         //eth to token
//         expected = calculateRateAmount(true, tokenInd, amountWei, 2);
//         let expectedDestTokensTwei = expected[1];
//         let lowMaxDest = expectedDestTokensTwei - 13;

//         //see trade reverts
//         try {
//             await proxyOld.trade(ethAddress, amountWei, tokenAdd[tokenInd], user2, lowMaxDest,
//                  rate[1], walletId, {from:user1, value: amountWei});
//             assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected revert but got: " + e);
//         }

//         //high max dest shouldn't revert here
//         await proxyOld.trade(ethAddress, amountWei, tokenAdd[tokenInd], user2, (expectedDestTokensTwei + 15),
//                 rate[0], walletId, {from:user1, value: amountWei});
//         await reserve1.enableTrade({from:admin});
//     });

//     it("init 'generous' network with trade reverse direction, could result in overflow.", async function () {
//         // in next tests - testing strange situasions that could cause overflow.
//         // 1. if src token amount after trade is higher then src amount before trade.
//         // 2. if dest amount for dest toekn after trade is lower then before trade
//         generousNetwork = await GenerousNetwork.new(admin);
//         await generousNetwork.addOperator(operator);

//         await reserve1.setContracts(generousNetwork.address, pricing1.address, zeroAddress);
//         await reserve2.setContracts(generousNetwork.address, pricing2.address, zeroAddress);

//         // add reserves
//         await generousNetwork.addReserve(reserve1.address, false, {from: operator});
//         await generousNetwork.addReserve(reserve2.address, false, {from: operator});

//         await generousNetwork.setKyberProxy(proxyOld.address);

//         await proxyOld.setKyberNetworkContract(generousNetwork.address);

//         //set contracts
//         feeBurner = await FeeBurner.new(admin, tokenAdd[0], generousNetwork.address, ethToKncRatePrecision);
//         await generousNetwork.setFeeBurner(feeBurner.address);
//         await generousNetwork.setParams(gasPrice, negligibleRateDiff);
//         await generousNetwork.setEnable(true);

//         let price = await generousNetwork.maxGasPrice();
//         Helper.assertEqual(price, gasPrice);

//         //list tokens per reserve
//         for (let i = 0; i < numTokens; i++) {
//             await generousNetwork.listPairForReserve(reserve1.address, tokenAdd[i], true, true, true, {from: operator});
//             await generousNetwork.listPairForReserve(reserve2.address, tokenAdd[i], true, true, true, {from: operator});
//         }
//     });

//     it("verify trade with reverses trade = (src address before is lower then source address after), reverts.", async function () {
//         //trade data
//         let tokenInd = numTokens - 1;
//         let token = tokens[tokenInd]; //choose some token
//         let amountTwei = 1313;

//         //get rate
//         let rate = await proxyOld.getExpectedRate(tokenAdd[tokenInd], ethAddress, amountTwei);

//         let balanceBefore = await token.balanceOf(operator);
// //        log("balance " + balanceBefore)
//         await token.transferFrom(operator, operator, 755)
//         balanceBefore = await token.balanceOf(operator);
//         await token.transferFrom(operator, operator, 855)
//         balanceBefore = await token.balanceOf(operator);

//         await token.transfer(user1, amountTwei);
//         await token.approve(proxyOld.address, amountTwei, {from:user1})

//         //see trade reverts
//         try {
//             await proxyOld.trade(tokenAdd[tokenInd], amountTwei, ethAddress, user2, 9000000,
//                  rate[1], walletId, {from:user1});
//             assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected revert but got: " + e);
//         }
//     });

//     it("verify trade with reversed trade (malicious token or network) ->dest address after is lower then dest address before, reverts.", async function () {
//         //trade data
//         let tokenInd = numTokens - 1;
//         let token = tokens[tokenInd]; //choose some token
//         let amountWei = 1515;

//         //get rate
//         let rate = await proxyOld.getExpectedRate(ethAddress, tokenAdd[tokenInd], amountWei);
// //        log("rate " + rate[0])

//         //want user 2 to have some initial balance
//         await token.transfer(user2, 2000);

//         //see trade reverts
//         try {
//             await proxyOld.trade(ethAddress, amountWei, tokenAdd[tokenInd], user2, 9000000,
//                  rate[1], walletId, {from:user1, value: amountWei});
//             assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected revert but got: " + e);
//         }

//     });


//     describe("permissionless order book reserve", function() {
//         const permissionlessTokDecimals = 18;
//         let orderListFactory;
//         let reserveLister;
//         let medianizer;
//         let permissionlessTok;
//         let orderbookReserve;
//         let orderbookReserveTok0;
//         let token0;
//         let token1;
//         let maxOrdersPerTrade = 100;
//         let minNewOrderValueUSD = 1000;
//         let dollarsPerEthPrecision = precisionUnits.mul(new BN(400));
//         let minNewOrderValue;
//         let rateHint;

//         it("add permission less order book reserve for new token using reserve lister. see success... ", async() => {
//             await proxyOld.setKyberNetworkContract(network.address);
//             await reserve1.setContracts(network.address, pricing1.address, zeroAddress);
//             await reserve2.setContracts(network.address, pricing2.address, zeroAddress);

//             feeBurner = mainFeeBurner;

//             orderListFactory = await OrderListFactory.new();
//             medianizer = await MockMedianizer.new();
//             await medianizer.setValid(true);
//             await medianizer.setEthPrice(dollarsPerEthPrecision);

//             rateHint = new BN(await network.PERM_HINT_GET_RATE());

//             let unsupportedTokens = [];
//             reserveLister = await PermissionlessOrderbookReserveLister.new(network.address, orderListFactory.address,
//                 medianizer.address, KNC.address, unsupportedTokens, maxOrdersPerTrade, minNewOrderValueUSD);

//             await network.addOperator(reserveLister.address);
//             await feeBurner.addOperator(reserveLister.address);

//             permissionlessTok = await TestToken.new("permissionLess", "PRM", permissionlessTokDecimals);
//             let tokenAdd = permissionlessTok.address;

//             let rc = await reserveLister.addOrderbookContract(tokenAdd);
//             rc = await reserveLister.initOrderbookContract(tokenAdd);
//             rc = await reserveLister.listOrderbookContract(tokenAdd);

//             //verify reserve exists in network
//             let reserveAddress = await network.reservesPerTokenDest(tokenAdd, 0);
//             let listReserveAddress = await reserveLister.reserves(tokenAdd);
//             Helper.assertEqual(reserveAddress, listReserveAddress);

//             orderbookReserve = await OrderbookReserve.at(reserveAddress);
//             let rxLimits = await orderbookReserve.limits();

//             minNewOrderValue = new BN(rxLimits[2]);
// //            log ("minNewOrderValue: " + minNewOrderValue)
//         });

//         it("deposit tokens to new orderbookReserve, make token to eth orders, see proxy returns rate value", async() => {
//             //maker deposits tokens
//             let amountKnc = new BN(600).mul(new BN(10).pow(new BN(18)));
//             let amountTokenWeiDeposit = (new BN(30).mul(new BN(10).pow(new BN(18))).add(new BN(600)));
//             await makerDeposit(orderbookReserve, permissionlessTok, maker1, 0, amountTokenWeiDeposit, amountKnc);

//             let orderSrcAmountTwei = new BN(9).mul(new BN(10).pow(new BN(18)));
//             let orderDstWei = minNewOrderValue;

//             // first getExpectedRate eth to new token should return 0
//             let rate = await network.getExpectedRate(ethAddress, permissionlessTok.address, new BN(10).pow(new BN(18)));
//             Helper.assertEqual(rate[0], 0);
//             let permRate = await network.getExpectedRateOnlyPermission(ethAddress, permissionlessTok.address, new BN(10).pow(new BN(18)));
//             Helper.assertEqual(permRate[0], 0);

//             //now add order
//             //////////////
//             rc = await orderbookReserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei, {from: maker1});
//             rc = await orderbookReserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei.add(new BN(200)), {from: maker1});
//     //        log(rc.logs[0].args)

//             // now getConversionRate > 0
//             let totalPayValue = (orderDstWei.mul(new BN(2))).add(new BN(200));
//             let expectedRate = precisionUnits.mul(new BN(orderSrcAmountTwei).mul(new BN(2))).div(totalPayValue);
//             rate = await proxyOld.getExpectedRate(ethAddress, permissionlessTok.address, totalPayValue);

//             Helper.assertEqual(rate[0].div(new BN(10)), expectedRate.div(new BN(10)));

//             let permissionedOnlyQty = totalPayValue.add(rateHint);
//             permRate = await proxyOld.getExpectedRate(ethAddress, permissionlessTok.address, permissionedOnlyQty);
//             Helper.assertEqual(permRate[0], 0);

//             let orderList = await orderbookReserve.getTokenToEthOrderList();
//             Helper.assertEqual(orderList.length, 2);
//         });

//         it("deposit EthWei to new orderbookReserve, make eth to token orders, see proxy returns rate value", async() => {
//             //maker deposits tokens
//             let numOrders = new BN(2);
//             let amountKnc = new BN(600).mul(new BN(10).pow(new BN(18)));
//             let amountEthWeiDeposit = minNewOrderValue.mul(numOrders);
//             await makerDeposit(orderbookReserve, permissionlessTok, maker1, amountEthWeiDeposit, 0, amountKnc);

//             let orderSrcWei = minNewOrderValue;
//             let orderDstAmountTwei = new BN(9).mul(new BN(10).pow(new BN(18)));

//             // first getExpectedRate eth to new toekn should return 0
//             let rate = await proxyOld.getExpectedRate(permissionlessTok.address, ethAddress, new BN(10).pow(new BN(18)));
//             Helper.assertEqual(rate[0], 0);

//             //now add orders
//             //////////////
//             rc = await orderbookReserve.submitEthToTokenOrder(orderSrcWei, orderDstAmountTwei, {from: maker1});
//             rc = await orderbookReserve.submitEthToTokenOrder(orderSrcWei, (orderDstAmountTwei.add(new BN(1000))), {from: maker1});
//     //        log(rc.logs[0].args)

//             let totalPayValue = (orderDstAmountTwei.mul(new BN(2))).add(new BN(1000));

//             // now getConversionRate > 0
//             let expectedRate = precisionUnits.mul(orderSrcWei.mul(new BN(2))).div(totalPayValue);
//             rate = await proxyOld.getExpectedRate(permissionlessTok.address, ethAddress, totalPayValue);
//             let reserveRate = await orderbookReserve.getConversionRate(permissionlessTok.address, ethAddress, totalPayValue, 1);
//             Helper.assertEqual(reserveRate.div(new BN(10)), rate[0].div(new BN(10)), "rate from reserve should match rate from network")

//             let permissionedOnlyQty = totalPayValue.add(rateHint);
//             let permRate = await proxyOld.getExpectedRate(permissionlessTok.address, ethAddress, permissionedOnlyQty);
//             Helper.assertEqual(permRate[0], 0);

//             Helper.assertEqual(rate[0].div(new BN(10)), expectedRate.div(new BN(10)));

//             orderList = await orderbookReserve.getEthToTokenOrderList();
//             Helper.assertEqual(orderList.length, 2);
//         });

//         it("trade ETH to token permissionless through network", async() => {
//             let user2InitialTok = await permissionlessTok.balanceOf(user2);

//             let orderList = await orderbookReserve.getTokenToEthOrderList();
//             let totalPayValue = new BN(0);
//             for(let i = 0; i < orderList.length; i++) {
//                 let orderData = await orderbookReserve.getTokenToEthOrder(orderList[i]);
//                 totalPayValue = totalPayValue.add(orderData[2]);
//             }

// //            log("total pay value ether Wei: " + totalPayValue);
//             let rate = await proxyOld.getExpectedRate(ethAddress, permissionlessTok.address, totalPayValue);

//             //trade
//             let txData = await proxyOld.tradeWithHint(ethAddress, totalPayValue, permissionlessTok.address, user2, new BN(10).pow(new BN(30)),
//                             rate[1], zeroAddress, emptyHint, {from:user1, value:totalPayValue});
//             log("take 2 Eth to token orders gas: " + txData.receipt.gasUsed);

//             orderList = await orderbookReserve.getTokenToEthOrderList();
//             Helper.assertEqual(orderList.length, 0);

//             let expectedTokenTransfer = totalPayValue.mul(rate[0]).div(precisionUnits);
//             let expectedBalance = expectedTokenTransfer.add(user2InitialTok);

//             let user2TokBalanceAfter = await permissionlessTok.balanceOf(user2);
//             Helper.assertEqual(user2TokBalanceAfter.div(new BN(100)), expectedBalance.div(new BN(100)));
//         });

//         it("trade permissionless token to ETH through network", async() => {
//             let user2InitialEth = await Helper.getBalancePromise(user2);

//             let orderList = await orderbookReserve.getEthToTokenOrderList();
//             let totalPayValue = new BN(0);
//             for(let i = 0; i < orderList.length; i++) {
//                 let orderData = await orderbookReserve.getEthToTokenOrder(orderList[i]);
//                 totalPayValue = totalPayValue.add(orderData[2]);
//             }

// //            log("total pay value token Wei: " + totalPayValue);
//             let rate = await network.getExpectedRate(permissionlessTok.address, ethAddress, totalPayValue);

//             //see maker token funds before trade
//             let makerTokFundsBefore = new BN(await orderbookReserve.makerFunds(maker1, permissionlessTok.address));

//             //trade
//             await permissionlessTok.transfer(user1, totalPayValue);
//             await permissionlessTok.approve(proxyOld.address, totalPayValue, {from:user1})
//             let txData = await proxyOld.tradeWithHint(permissionlessTok.address, totalPayValue, ethAddress, user2,
//                         new BN(10).pow(new BN(30)), rate[1], zeroAddress, emptyHint, {from:user1});
//             log("take 2 tokenToEth orders gas: " + txData.receipt.gasUsed);

//             //see maker received the tokens
//             let makerTokFundsAfter = await orderbookReserve.makerFunds(maker1, permissionlessTok.address);
//             let expectedMakerTokFunds = makerTokFundsBefore.add(totalPayValue);
//             Helper.assertEqual(makerTokFundsAfter, expectedMakerTokFunds);

//             //see order list is empty
//             orderList = await orderbookReserve.getEthToTokenOrderList();
//             Helper.assertEqual(orderList.length, 0);

//             let expectedEthWeiTransfer = totalPayValue.mul(rate[0]).div(precisionUnits);

//             let expectedBalance = expectedEthWeiTransfer.add(new BN(user2InitialEth));

//             let user2EthBalanceAfter = new BN(await Helper.getBalancePromise(user2));
//             Helper.assertEqual(user2EthBalanceAfter.div(new BN(1000)), expectedBalance.div(new BN(1000)));
//         });

//         it("create order book reserve for token that is already listed in regular reserve. list it in network", async() => {
//             token0 = tokens[0].address;
//             let rc = await reserveLister.addOrderbookContract(token0);
//             rc = await reserveLister.initOrderbookContract(token0);
//             rc = await reserveLister.listOrderbookContract(token0);

//             //verify reserve exists in network
//             let reserveAddress = await network.reservesPerTokenDest(token0, 2);
//             let listReserveAddress = await reserveLister.reserves(token0);
//             Helper.assertEqual(reserveAddress, listReserveAddress);

//             orderbookReserveTok0 = await OrderbookReserve.at(reserveAddress);
//         })

//         it("list an existing token with better rate then other reserves (buy), get rate with / without permissionless, see rate diff", async() => {
//             //maker deposits tokens
//             let amountKnc = new BN(600).mul(new BN(10).pow(new BN(18)));
//             let amountTokenWeiDeposit = (new BN(20).mul(new BN(10).pow(new BN(18)))).add(new BN(600));
//             await makerDeposit(orderbookReserveTok0, tokens[0], maker1, 0, amountTokenWeiDeposit, amountKnc);

//             let orderSrcAmountTwei = new BN(9).mul(new BN(10).pow(new BN(18)));
//             let orderDstWei = minNewOrderValue;

//             let tradeValue = new BN(10000);
//             let networkRateBefore = await proxyOld.getExpectedRate(ethAddress, token0, tradeValue);

//             //now add order
//             //////////////
//             rc = await orderbookReserveTok0.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei, {from: maker1});
//             let orderList = await orderbookReserveTok0.getTokenToEthOrderList();
//             Helper.assertEqual(orderList.length, 1);

//             // now getConversionRate > 0
//             let expectedRate = precisionUnits.mul(orderSrcAmountTwei).div(orderDstWei);
//             let networkRate = await proxyOld.getExpectedRate(ethAddress, token0, tradeValue);
//             let reserveRate = await orderbookReserveTok0.getConversionRate(ethAddress, token0, tradeValue, 3);
//             Helper.assertEqual(reserveRate, networkRate[0]);
// //            log("reserve rate: " + reserveRate)
// //            log("network rate: " + networkRate)

// //            Helper.assertEqual(networkRate[0].div(new BN(10)), expectedRate.div(new BN(10)));

//             let permissionedOnlyQty = rateHint.add(tradeValue);
//             let networkRateOnlyPerm = await proxyOld.getExpectedRate(ethAddress, token0, permissionedOnlyQty);

//             Helper.assertEqual(networkRateOnlyPerm[0], networkRateBefore[0]);
//         })

//         it("trade (buy) token listed regular and order book. see token taken from order book reserve(better rate)", async() => {
//             let tradeValue = new BN(10000);
//             let rate = await network.getExpectedRate(ethAddress, token0, tradeValue);

//             //trade
//             let makerEthFundsBefore = new BN(await orderbookReserveTok0.makerFunds(maker1, ethAddress));
//             let txData = await proxyOld.tradeWithHint(ethAddress, tradeValue, token0, user2,
//                         new BN(10).pow(new BN(30)), rate[1], zeroAddress, emptyHint, {from:user1, value: tradeValue});

//             let makerEthFundsAfter = await orderbookReserveTok0.makerFunds(maker1, ethAddress);
//             let expectedMakerEthFunds = makerEthFundsBefore.add(tradeValue);

//             Helper.assertEqual(makerEthFundsAfter, expectedMakerEthFunds);
//         })

//         it("trade (buy) token listed regular and order book. when permissionless not allowed. see token taken from regular reserve", async() => {
//             let tradeValue = new BN(98765);
//             let permissionedOnlyQty = rateHint.add(tradeValue);
//             let rate = await proxyOld.getExpectedRate(ethAddress, token0, permissionedOnlyQty);

//             //trade
//             let hint = 'PERM';
//             let hintBytes32 = web3.utils.fromAscii(hint);

//             let makerEthFundsBefore = new BN(await orderbookReserveTok0.makerFunds(maker1, ethAddress));

//             let txData = await proxyOld.tradeWithHint(ethAddress, tradeValue, token0, user2,
//                 new BN(10).pow(new BN(30)), rate[1], zeroAddress, hintBytes32, {from:user1, value: tradeValue});

//             let makerEthFundsAfter = await orderbookReserveTok0.makerFunds(maker1, ethAddress);

//             Helper.assertEqual(makerEthFundsAfter, makerEthFundsBefore);
//         })

//         it("list an existing token with better rate then other reserves (sell), get rate with / without permissionless, see rate diff", async() => {
//             //maker deposits Eth
//             let amountEthWeiDeposit = minNewOrderValue.add(new BN(600));
//             await makerDeposit(orderbookReserveTok0, tokens[0], maker1, amountEthWeiDeposit, 0, 0);

//             let orderSrcAmountWei = minNewOrderValue;
//             let orderDstTwei = new BN(1.7).mul(new BN(10).pow(new BN(14)));

//             let tradeValue = 10000;
//             let networkRateBefore = await network.getExpectedRate(token0, ethAddress, tradeValue);

//             //now add order
//             //////////////
//             rc = await orderbookReserveTok0.submitEthToTokenOrder(orderSrcAmountWei, orderDstTwei, {from: maker1});
//             let orderList = await orderbookReserveTok0.getEthToTokenOrderList();
//             Helper.assertEqual(orderList.length, 1);

//             // now getConversionRate > 0
//             let expectedRate = precisionUnits.mul(orderSrcAmountWei).div(orderDstTwei);
//             let networkRate = await network.getExpectedRate(token0, ethAddress, tradeValue);
//             let reserveRate = await orderbookReserveTok0.getConversionRate(token0, ethAddress, tradeValue, 3);
//             Helper.assertEqual(reserveRate, networkRate[0]);
// //            log("reserve rate: " + reserveRate)
// //            log("network rate: " + networkRate)

// //            Helper.assertEqual(networkRate[0].div(new BN(10)), expectedRate.div(new BN(10)));

//             let networkRateOnlyPerm = await network.getExpectedRateOnlyPermission(token0, ethAddress, tradeValue);

//             Helper.assertEqual(networkRateOnlyPerm[0], networkRateBefore[0]);
//         })

//         it("trade (sell) token listed regular and order book. see token taken from order book reserve(better rate)", async() => {
//             let tradeValue = new BN(10000);
//             let rate = await proxyOld.getExpectedRate(token0, ethAddress, tradeValue);

//             //trade
//             let makerTokFundsBefore = new BN(await orderbookReserveTok0.makerFunds(maker1, token0));

//             await tokens[0].transfer(user1, tradeValue);
//             await tokens[0].approve(proxyOld.address, tradeValue, {from:user1})

//             let txData = await proxyOld.tradeWithHint(token0, tradeValue, ethAddress, user2,
//                 new BN(10).pow(new BN(30)), rate[1], zeroAddress, emptyHint, {from:user1});

//             let makerTokFundsAfter = await orderbookReserveTok0.makerFunds(maker1, token0);
//             let expectedMakerTokFunds = makerTokFundsBefore.add(tradeValue);

//             Helper.assertEqual(makerTokFundsAfter, expectedMakerTokFunds);
//         })

//         it("trade (sell) token listed regular and order book permissionless not allowed. see token taken from regular reserve", async() => {
//             let tradeValue = new BN(10000);
//             let tradeValueForPermmissioned = rateHint.add(tradeValue);
//             let rate = await proxyOld.getExpectedRate(token0, ethAddress, tradeValueForPermmissioned);

//             //trade
//             let hint = 'PERM';
//             let hintBytes32 = web3.utils.fromAscii(hint);

//             let makerTokFundsBefore = new BN(await orderbookReserveTok0.makerFunds(maker1, token0));

//             await tokens[0].transfer(user1, tradeValue);
//             await tokens[0].approve(proxyOld.address, tradeValue, {from:user1})
//             let txData = await proxyOld.tradeWithHint(token0, tradeValue, ethAddress, user2,
//                 new BN(10).pow(new BN(30)), rate[1], zeroAddress, hintBytes32, {from:user1});

//             let makerTokFundsAfter = await orderbookReserveTok0.makerFunds(maker1, token0);

//             Helper.assertEqual(makerTokFundsAfter, makerTokFundsBefore);
//         });

//         it("get rate token to token with token listed regular and permissionless. see diff", async() => {
//             let tradeValue = new BN(10000);
//             token1 = tokens[1].address;

//             let rate = await proxyOld.getExpectedRate(token0, token1, tradeValue);
//             let tradeValueForPermmissioned = rateHint.add(tradeValue);
//             let permRate = await proxyOld.getExpectedRate(token0, token1, tradeValueForPermmissioned);
//             assert(rate[0] > permRate[0], "rate: " + rate[0] + " !>  permission only rate: " +
//                 permRate[0]);
//         });

//         it("trade token to token with / without permissionless. see as expected", async() => {
//             let tradeValue = new BN(10000);
//             let rate = await proxyOld.getExpectedRate(token0, token1, tradeValue);

//             //trade
//             let makerTokFundsBefore = new BN(await orderbookReserveTok0.makerFunds(maker1, token0));

//             await tokens[0].transfer(user1, tradeValue);
//             await tokens[0].approve(proxyOld.address, tradeValue, {from:user1});
// //            let txData = await proxyOld.tradeWithHint(token0, tradeValue, token1, user2,
// //                        new BN(10).pow(new BN(30)), rate[1], 0, 0, {from:user1});
//             let txData = await proxyOld.tradeWithHint(token0, tradeValue, token1, user2,
//                 new BN(10).pow(new BN(30)), 0, zeroAddress, emptyHint, {from:user1});
//             log("token to token with permissionless. partial order amount. gas: " + txData.receipt.gasUsed);

//             let makerTokFundsAfter1 = await orderbookReserveTok0.makerFunds(maker1, token0);
//             let expectedMakerTokFunds = makerTokFundsBefore.add(tradeValue);

//             Helper.assertEqual(makerTokFundsAfter1, expectedMakerTokFunds);

//             //now only permissioned
//             let tradeValueForPermmissioned = rateHint.add(tradeValue);
//             rate = await proxyOld.getExpectedRate(token0, token1, tradeValueForPermmissioned);
//             let hint = web3.utils.fromAscii("PERM");

//             await tokens[0].transfer(user1, tradeValue);
//             await tokens[0].approve(proxyOld.address, tradeValue, {from:user1})
//             txData = await proxyOld.tradeWithHint(token0, tradeValue, token1, user2,
//                                 new BN(10).pow(new BN(30)), rate[1], zeroAddress, hint, {from:user1});
//             let makerTokFundsAfter2 = await orderbookReserveTok0.makerFunds(maker1, token0);
//             Helper.assertEqual(makerTokFundsAfter1, makerTokFundsAfter2);
//         })

//         it("trade token to token with / without permissionless. see as expected", async() => {
//             let tradeValue = new BN(10000);
//             let rate = await network.getExpectedRate(token1, token0, tradeValue);

//             //trade
//             let makerTokFundsBefore = new BN(await orderbookReserveTok0.makerFunds(maker1, ethAddress));
//             await tokens[1].transfer(user1, tradeValue);
//             await tokens[1].approve(proxyOld.address, tradeValue, {from:user1})
//             let txData = await proxyOld.tradeWithHint(token1, tradeValue, token0, user2,
//                 new BN(10).pow(new BN(30)), rate[1], zeroAddress, emptyHint, {from: user1});
//             log("token to token with permissionless. partial order amount. gas: " + txData.receipt.gasUsed);

//             let makerTokFundsAfter1 = await orderbookReserveTok0.makerFunds(maker1, ethAddress);
//             assert(makerTokFundsAfter1 > makerTokFundsBefore, "makerTokFundsAfter1: " + makerTokFundsAfter1 +
//                 " should be > makerTokFundsBefore: " + makerTokFundsBefore);

//             //now only permissioned
//             let tradeValueForPermmissioned = rateHint.add(tradeValue);
//             rate = await proxyOld.getExpectedRate(token1, token0, tradeValueForPermmissioned);

//             let hint = web3.utils.fromAscii("PERM");
//             await tokens[1].transfer(user1, tradeValue);
//             await tokens[1].approve(proxyOld.address, tradeValue, {from:user1})
//             txData = await proxyOld.tradeWithHint(token1, tradeValue, token0, user2,
//                 new BN(10).pow(new BN(30)), rate[1], zeroAddress, hint, {from:user1});

//             let makerTokFundsAfter2 = await orderbookReserveTok0.makerFunds(maker1, ethAddress);
//             Helper.assertEqual(makerTokFundsAfter1, makerTokFundsAfter2);
//         });

//         it("Add 9 'spam' orders Eth to token see gas affect on trade with other reserve.", async() => {
//             let numOrders = new BN(10);
//             let amountKnc = new BN(600).mul(new BN(10).pow(new BN(18)));
//             let tokIndex = 0;
//             let tokenAdd = tokens[tokIndex].address;
//             let amountEthWeiDeposit = minNewOrderValue.mul(numOrders);
//             await makerDeposit(orderbookReserveTok0, tokens[tokIndex], maker1, amountEthWeiDeposit, 0, amountKnc);

//             let orderSrcWei = minNewOrderValue;
//             //calculate smallest possible dest amount. one that achieves max_rate
//             let orderDstAmountTwei = calcSrcQty(orderSrcWei, tokenDecimals[tokIndex], 18, max_rate);
// //            log('orderSrcWei ' + orderSrcWei);
// //            log('orderDstAmountTwei ' + orderDstAmountTwei);

// //            let orderRate = calcRateFromQty(orderDstAmountTwei, orderSrcWei, tokenDecimals[tokIndex], 18);
// //            Helper.assertEqual(orderRate.div(100), max_rate.div(100));
// //            log("orderRate " + orderRate)
//             orderList = await orderbookReserveTok0.getEthToTokenOrderList();
// //            log("order list: " + orderList)
//             for (let i = 0; i < orderList.length; i++) {
//                 await orderbookReserveTok0.cancelEthToTokenOrder(orderList[i], {from: maker1})
//             }

//             //add 9 orders
//             //////////////
//             let totalPayValue = new BN(0);
//             for(let i = 0; i < 9; i++) {
//                 await orderbookReserveTok0.submitEthToTokenOrder(orderSrcWei, (orderDstAmountTwei.add(new BN(10 * i))), {from: maker1});
//                 totalPayValue = totalPayValue.add(orderDstAmountTwei.add(new BN(10 * i)));
//             }

// //            orderList = await orderbookReserveTok0.getEthToTokenOrderList();
// //            log("order list: " + orderList)

//             //see good rate value for this amount
//             goodRate = await proxyOld.getExpectedRate(tokenAdd, ethAddress, totalPayValue);
//             //not as good when a bit higher quantity
//             let regularRate = await network.getExpectedRate(tokenAdd, ethAddress, totalPayValue.add(new BN(4)));
//             assert(goodRate[0] > regularRate[0]);

//             //now trade this token with permission less disabled. see gas
//             let hint = 'PERM';
//             let hintBytes32 = web3.utils.fromAscii(hint);
//             let tradeValue = totalPayValue.add(new BN(4));

//             await tokens[0].transfer(user1, tradeValue);
//             await tokens[0].approve(proxyOld.address, tradeValue, {from:user1})
//             let txPermData = await proxyOld.tradeWithHint(token0, tradeValue, ethAddress, user2,
//                 new BN(10).pow(new BN(30)), regularRate[1], zeroAddress, hintBytes32, {from: user1});
//             log("gas only permissioned: " + txPermData.receipt.gasUsed);

//             await tokens[0].transfer(user1, tradeValue);
//             await tokens[0].approve(proxyOld.address, tradeValue, {from:user1})
//             txPermLessData = await proxyOld.tradeWithHint(token0, tradeValue, ethAddress, user2,
//                 new BN(10).pow(new BN(30)), regularRate[1], zeroAddress, emptyHint, {from:user1});
//             log("gas with traversing permissionless 9 orders (not taking): " + txPermLessData.receipt.gasUsed);

//             log("gas effect of traversing 9 orders in get rate (not taking): " +
//                 (txPermLessData.receipt.gasUsed - txPermData.receipt.gasUsed));

//             await tokens[0].transfer(user1, totalPayValue);
//             await tokens[0].approve(proxyOld.address, totalPayValue, {from:user1})
//             txData = await proxyOld.tradeWithHint(token0, totalPayValue, ethAddress, user2,
//                 new BN(10).pow(new BN(30)), regularRate[1], zeroAddress, emptyHint, {from:user1});
//             log("gas 9 orders from permissionless: " + txData.receipt.gasUsed);
//         });

//         it("Add 5 'spam' orders Eth to token see gas affect on trade with other reserve.", async() => {
//             let numOrders = new BN(10);
//             let amountKnc = new BN(600).mul(new BN(10).pow(new BN(18)));
//             let tokIndex = 0;
//             let tokenAdd = tokens[tokIndex].address;
//             let amountEthWeiDeposit = minNewOrderValue.mul(numOrders);
//             await makerDeposit(orderbookReserveTok0, tokens[tokIndex], maker1, amountEthWeiDeposit, 0, amountKnc);

//             let orderSrcWei = minNewOrderValue;
//             //calculate smallest possible dest amount. one that achieves max_rate
//             let orderDstAmountTwei = calcSrcQty(orderSrcWei, tokenDecimals[tokIndex], 18, max_rate);
//             orderList = await orderbookReserveTok0.getEthToTokenOrderList();

//             for (let i = 0; i < orderList.length; i++) {
//                 await orderbookReserveTok0.cancelEthToTokenOrder(orderList[i], {from: maker1})
//             }

//             //add 9 orders
//             //////////////
//             let totalPayValue = new BN(0);
//             for(let i = 0; i < 5; i++) {
//                 await orderbookReserveTok0.submitEthToTokenOrder(orderSrcWei, (orderDstAmountTwei.add(new BN(10 * i))), {from: maker1});
//                 totalPayValue = totalPayValue.add(orderDstAmountTwei.add(new BN(10 * i)));
//             }

//             //see good rate value for this amount
//             goodRate = await network.getExpectedRate(tokenAdd, ethAddress, totalPayValue);
//             //not as good when a bit higher quantity
//             let regularRate = await network.getExpectedRate(tokenAdd, ethAddress, totalPayValue.add(new BN(4)));
//             assert(goodRate[0] > regularRate[0]);

//             //now trade this token with permission less disabled. see gas
//             let hint = 'PERM';
//             let hintBytes32 = web3.utils.fromAscii(hint);
//             let tradeValue = totalPayValue.add(new BN(4));

//             await tokens[0].transfer(user1, tradeValue);
//             await tokens[0].approve(proxyOld.address, tradeValue, {from:user1})
//             let txPermData = await proxyOld.tradeWithHint(token0, tradeValue, ethAddress, user2,
//                 new BN(10).pow(new BN(30)), regularRate[1], zeroAddress, hintBytes32, {from: user1});
//             log("gas only permissioned: " + txPermData.receipt.gasUsed);

//             await tokens[0].transfer(user1, tradeValue);
//             await tokens[0].approve(proxyOld.address, tradeValue, {from:user1})
//             txPermLessData = await proxyOld.tradeWithHint(token0, tradeValue, ethAddress, user2,
//                 new BN(10).pow(new BN(30)), regularRate[1], zeroAddress, emptyHint, {from:user1});
//             log("gas with traversing permissionless 5 orders (not taking): " + txPermLessData.receipt.gasUsed);

//             log("gas effect of traversing 5 orders in get rate (not taking): " +
//                 (txPermLessData.receipt.gasUsed - txPermData.receipt.gasUsed));

//             await tokens[0].transfer(user1, totalPayValue);
//             await tokens[0].approve(proxyOld.address, totalPayValue, {from:user1})
//             txData = await proxyOld.tradeWithHint(token0, totalPayValue, ethAddress, user2,
//                                       new BN(10).pow(new BN(30)), goodRate[1], zeroAddress, emptyHint, {from:user1});
//             log("gas 5 orders from permissionless: " + txData.receipt.gasUsed);
//         });

//         it("see gas consumption when taking 3.6, 4.6, 5.6, 6.6, 7.6 orders. take as sell (take token to Eth). remaining removed.", async() => {
//             //maker deposits tokens
//             let numOrders = new BN(27);
//             let amountKnc = new BN(600).mul(new BN(10).pow(new BN(18)));
//             let amountEthWeiDeposit = minNewOrderValue.mul(numOrders);
//             await makerDeposit(orderbookReserve, permissionlessTok, maker1, amountEthWeiDeposit, 0, amountKnc);

//             let orderSrcWei = minNewOrderValue;
//             //calculate smallest possible dest amount. one that achieves max_rate
//             let orderDstAmountTwei = calcSrcQty(orderSrcWei, permissionlessTokDecimals, 18, max_rate);

//             //4 orders
//             //////////////
//             let totalPayValue = new BN(0);
//             for(let i = 0; i < 4; i++) {
//                 await orderbookReserve.submitEthToTokenOrder(orderSrcWei, (orderDstAmountTwei.add(new BN(100 * i))), {from: maker1});
//                 totalPayValue = totalPayValue.add(orderDstAmountTwei.add(new BN(100 * i)));
//             }

//             orderList = await orderbookReserve.getEthToTokenOrderList();
//             Helper.assertEqual(orderList.length, 4);

//             let tradeValue = totalPayValue.sub(orderDstAmountTwei.mul(new BN(0.3)));
//             await permissionlessTok.transfer(user1, tradeValue);
//             await permissionlessTok.approve(proxyOld.address, tradeValue, {from:user1})
//             txData = await proxyOld.tradeWithHint(permissionlessTok.address, tradeValue, ethAddress, user2,
//                                                     new BN(10).pow(new BN(30)), 10, zeroAddress, emptyHint, {from: user1});
//             log("gas price taking 3.7 orders. remaining removed: " + txData.receipt.gasUsed);

//             orderList = await orderbookReserve.getEthToTokenOrderList();
//             Helper.assertEqual(orderList.length, 0);

//             //5 orders
//             //////////////
//             totalPayValue = new BN(0);
//             for(let i = 0; i < 5; i++) {
//                 await orderbookReserve.submitEthToTokenOrder(orderSrcWei, (orderDstAmountTwei.add(new BN(100 * i))), {from: maker1});
//                 totalPayValue = totalPayValue.add(orderDstAmountTwei.add(new BN(100 * i)));
//             }

//             orderList = await orderbookReserve.getEthToTokenOrderList();
//             Helper.assertEqual(orderList.length, 5);

//             tradeValue = totalPayValue.sub(orderDstAmountTwei.mul(new BN(0.3)));
//             await permissionlessTok.transfer(user1, tradeValue);
//             await permissionlessTok.approve(proxyOld.address, tradeValue, {from:user1})
//             txData = await proxyOld.tradeWithHint(permissionlessTok.address, tradeValue, ethAddress, user2,
//                                                 new BN(10).pow(new BN(30)), 10, zeroAddress, emptyHint, {from: user1});
//             log("gas price taking 4.7 orders. remaining removed: " + txData.receipt.gasUsed);

//             orderList = await orderbookReserve.getEthToTokenOrderList();
//             Helper.assertEqual(orderList.length, 0);

//             //6 orders
//             //////////////
//             totalPayValue = new BN(0);
//             for(let i = 0; i < 6; i++) {
//                 await orderbookReserve.submitEthToTokenOrder(orderSrcWei, (orderDstAmountTwei.add(new BN(100 * i))), {from: maker1});
//                 totalPayValue = totalPayValue.add(orderDstAmountTwei.add(new BN(100 * i)));
//             }

//             orderList = await orderbookReserve.getEthToTokenOrderList();
//             Helper.assertEqual(orderList.length, 6);

//             tradeValue = totalPayValue.sub(orderDstAmountTwei.mul(new BN(0.3)));
//             await permissionlessTok.transfer(user1, tradeValue);
//             await permissionlessTok.approve(proxyOld.address, tradeValue, {from:user1})
//             txData = await proxyOld.tradeWithHint(permissionlessTok.address, tradeValue, ethAddress, user2,
//                                                     new BN(10).pow(new BN(30)), 10, zeroAddress, emptyHint, {from: user1});
//             log("gas price taking 5.7 orders. remaining removed: " + txData.receipt.gasUsed);

//             orderList = await orderbookReserve.getEthToTokenOrderList();
//             Helper.assertEqual(orderList.length, 0);

//             //7 orders
//             //////////////
//             totalPayValue = new BN(0);
//             for(let i = 0; i < 7; i++) {
//                 await orderbookReserve.submitEthToTokenOrder(orderSrcWei, (orderDstAmountTwei.add(new BN(100 * i))), {from: maker1});
//                 totalPayValue = totalPayValue.add(orderDstAmountTwei.add(new BN(100 * i)));
//             }

//             orderList = await orderbookReserve.getEthToTokenOrderList();
//             Helper.assertEqual(orderList.length, 7);

//             tradeValue = totalPayValue.sub(orderDstAmountTwei.mul(new BN(0.3)));
//             await permissionlessTok.transfer(user1, tradeValue);
//             await permissionlessTok.approve(proxyOld.address, tradeValue, {from:user1})
//             txData = await proxyOld.tradeWithHint(permissionlessTok.address, tradeValue, ethAddress, user2,
//                                                     new BN(10).pow(new BN(30)), 10, zeroAddress, emptyHint, {from: user1});
//             log("gas price taking 6.7 orders. remaining removed: " + txData.receipt.gasUsed);

//             orderList = await orderbookReserve.getEthToTokenOrderList();
//             Helper.assertEqual(orderList.length, 0);
//         });

//         it("see gas consumption when taking 3.6, 4.6, 5.6, 6.6, 7.6 orders. take as buy (take Eth to token). remaining removed.", async() => {
//             //maker deposits tokens
//             let numOrders = 27;
//             let amountKnc = new BN(600).mul(new BN(10).pow(new BN(18)));
//             let amountTokenWeiDeposit = (new BN(21).mul(new BN(10).pow(new BN(18)))).add(new BN(600));
//             await makerDeposit(orderbookReserve, permissionlessTok, maker1, 0, amountTokenWeiDeposit, amountKnc);

//             let orderDstAmountWei = minNewOrderValue;
//             //calculate smallest possible src amount. one that achieves max_rate
//             let orderSrcTwei = orderDstAmountWei.div(new BN(12));

//             //4 orders
//             //////////////
//             let totalPayValue = new BN(0);
//             for(let i = 0; i < 4; i++) {
//                 await orderbookReserve.submitTokenToEthOrder(orderSrcTwei, (orderDstAmountWei.add(new BN(10 * i))), {from: maker1});
//                 totalPayValue = totalPayValue.add(orderDstAmountWei.add(new BN(10 * i)));
//             }

//             orderList = await orderbookReserve.getTokenToEthOrderList();
//             Helper.assertEqual(orderList.length, 4);

//             let tradeValue = totalPayValue.sub(orderDstAmountWei.mul(new BN(0.3)));
//             txData = await proxyOld.tradeWithHint(ethAddress, tradeValue, permissionlessTok.address, user2,
//                                                 new BN(10).pow(new BN(30)), 10, zeroAddress, emptyHint, {from: user1, value: tradeValue});
//             log("gas price taking 3.7 orders. remaining removed: " + txData.receipt.gasUsed);

//             orderList = await orderbookReserve.getTokenToEthOrderList();
//             Helper.assertEqual(orderList.length, 0);

//             //5 orders
//             //////////////
//             totalPayValue = new BN(0);
//             for(let i = 0; i < 5; i++) {
//                 await orderbookReserve.submitTokenToEthOrder(orderSrcTwei, (orderDstAmountWei.add(new BN(10 * i))), {from: maker1});
//                 totalPayValue = totalPayValue.add(orderDstAmountWei.add(new BN(10 * i)));
//             }

//             orderList = await orderbookReserve.getTokenToEthOrderList();
//             Helper.assertEqual(orderList.length, 5);

//             tradeValue = totalPayValue.sub(orderDstAmountWei.mul(new BN(0.3)));
//             txData = await proxyOld.tradeWithHint(ethAddress, tradeValue, permissionlessTok.address, user2,
//                                                 new BN(10).pow(new BN(30)), 10, zeroAddress, emptyHint, {from: user1, value: tradeValue});
//             log("gas price taking 4.7 orders. remaining removed: " + txData.receipt.gasUsed);

//             orderList = await orderbookReserve.getTokenToEthOrderList();
//             Helper.assertEqual(orderList.length, 0);

//             //6 orders
//             //////////////
//             totalPayValue = new BN(0);
//             for(let i = 0; i < 6; i++) {
//                 await orderbookReserve.submitTokenToEthOrder(orderSrcTwei, (orderDstAmountWei.add(new BN(10 * i))), {from: maker1});
//                 totalPayValue = totalPayValue.add(orderDstAmountWei.add(new BN(10 * i)));
//             }

//             orderList = await orderbookReserve.getTokenToEthOrderList();
//             Helper.assertEqual(orderList.length, 6);

//             tradeValue = totalPayValue.sub(orderDstAmountWei.mul(new BN(0.3)));
//             txData = await proxyOld.tradeWithHint(ethAddress, tradeValue, permissionlessTok.address, user2,
//                                                 new BN(10).pow(new BN(30)), 10, zeroAddress, emptyHint, {from: user1, value: tradeValue});
//             log("gas price taking 5.7 orders. remaining removed: " + txData.receipt.gasUsed);

//             orderList = await orderbookReserve.getTokenToEthOrderList();
//             Helper.assertEqual(orderList.length, 0);

//             //7 orders
//             //////////////
//             totalPayValue = new BN(0);
//             for(let i = 0; i < 7; i++) {
//                 await orderbookReserve.submitTokenToEthOrder(orderSrcTwei, (orderDstAmountWei.add(new BN(10 * i))), {from: maker1});
//                 totalPayValue = totalPayValue.add(orderDstAmountWei.add(new BN(10 * i)));
//             }

//             orderList = await orderbookReserve.getTokenToEthOrderList();
//             Helper.assertEqual(orderList.length, 7);

//             tradeValue = totalPayValue.sub(orderDstAmountWei.mul(new BN(0.3)));
//             txData = await proxyOld.tradeWithHint(ethAddress, tradeValue, permissionlessTok.address, user2,
//                                                 new BN(10).pow(new BN(30)), 10, zeroAddress, emptyHint, {from: user1, value: tradeValue});
//             log("gas price taking 6.7 orders. remaining removed: " + txData.receipt.gasUsed);

//             orderList = await orderbookReserve.getTokenToEthOrderList();
//             Helper.assertEqual(orderList.length, 0);
//         });
//     });
});

function convertRateToConversionRatesRate (baseRate) {
    // conversion rate in pricing is in precision units (new BN(10).pow(new BN(18))) so
    // rate 1 to 50 is 50 * new BN(10).pow(new BN(18))
    // rate 50 to 1 is 1 / 50 * new BN(10).pow(new BN(18)) = new BN(10).pow(new BN(18)) / 50
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

function addBps (rate, bps) {
    return (rate.mul(10000 + bps).div(10000));
};

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
        let dstQty = calcDstQty(srcQty, 18, tokenDecimals[tokenInd], expectedRate);
        let extraBps = getExtraBpsForBuyQuantity(dstQty);
        expectedRate = Helper.addBps(expectedRate, extraBps);
        let relevantImbalance = imbalanceArray[tokenInd] * 1 + dstQty * 1;
        extraBps = getExtraBpsForImbalanceBuyQuantity(relevantImbalance);
        expectedRate = Helper.addBps(expectedRate, extraBps);
        expectedAmount = calcDstQty(srcQty, 18, tokenDecimals[tokenInd], expectedRate);
    } else {
        expectedRate = (new BN(baseArray[tokenInd]));
        let extraBps = getExtraBpsForSellQuantity(srcQty);
        expectedRate = Helper.addBps(expectedRate, extraBps);
        let relevantImbalance = imbalanceArray[tokenInd] - srcQty;
        extraBps = getExtraBpsForImbalanceSellQuantity(relevantImbalance);
        expectedRate = Helper.addBps(expectedRate, extraBps);
        expectedAmount = calcDstQty(srcQty, tokenDecimals[tokenInd], 18, expectedRate);
    }

    expected = [expectedRate, expectedAmount];
    return expected;
}

function calcDstQty(srcQty, srcDecimals, dstDecimals, rate) {
    srcQty = new BN(srcQty);
    rate = new BN(rate);
    if (dstDecimals >= srcDecimals) {
        let decimalDiff = (new BN(10)).pow(new BN(dstDecimals - srcDecimals));
        return rate.mul(srcQty).mul(decimalDiff).div(precisionUnits);
    } else {
        let decimalDiff = (new BN(10)).pow(new BN(dstDecimals - srcDecimals));
        return rate.mul(srcQty).div(decimalDiff.mul(precisionUnits));
    }
}

function calcSrcQty(dstQty, srcDecimals, dstDecimals, rate) {
    //source quantity is rounded up. to avoid dest quantity being too low.
    let srcQty;
    let numerator;
    let denominator;
    if (srcDecimals >= dstDecimals) {
        numerator = precisionUnits.mul(dstQty).mul((new BN(10)).pow(new BN(srcDecimals - dstDecimals)));
        denominator = new BN(rate);
    } else {
        numerator = precisionUnits.mul(dstQty);
        denominator = (new BN(rate)).mul((new BN(10)).pow(new BN(dstDecimals - srcDecimals)));
    }
    srcQty = (numerator.add(denominator.sub(new BN(1)))).div(denominator); //avoid rounding down errors
    return srcQty;
}

function calcCombinedRate(srcQty, sellRate, buyRate, srcDecimals, dstDecimals, destQty) {
    // calculates rate from src and expected dest amount.
    let rate;
    srcQty = new BN(srcQty);
    destQty = new BN(destQty);
    if (dstDecimals >= srcDecimals) {
        rate = new BN(precisionUnits.mul(destQty)).div(((new BN(10)).pow(new BN(dstDecimals - srcDecimals))).mul(srcQty));
    } else {
        rate = new BN(precisionUnits.mul(destQty).mul((new BN(10)).pow(new BN(srcDecimals - dstDecimals)))).div(srcQty);
    }
    return rate;
}

function log (string) {
    console.log(string);
};

async function makerDeposit(res, permTok, maker, ethWei, tokenTwei, kncTwei) {

    await permTok.approve(res.address, tokenTwei, {from: admin});
    await res.depositToken(maker, tokenTwei, {from: admin});
    await KNC.approve(res.address, kncTwei, {from: admin});
    await res.depositKncForFee(maker, kncTwei, {from: admin});
    await res.depositEther(maker, {from: maker, value: ethWei});
}

function calcRateFromQty(srcAmount, dstAmount, srcDecimals, dstDecimals) {
    if (dstDecimals >= srcDecimals) {
        let decimals = new BN(10 ** (dstDecimals - srcDecimals));
        return ((precisionUnits.mul(dstAmount)).div(decimals.mul(srcAmount)));
    } else {
        let decimals = new BN(10 ** (srcDecimals - dstDecimals));
        return ((precisionUnits.mul(dstAmount).mul(decimals)).div(srcAmount));
    }
}
