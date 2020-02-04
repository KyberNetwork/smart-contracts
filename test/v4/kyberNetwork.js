// const ConversionRates = artifacts.require("MockConversionRate.sol");
// const EnhancedStepFunctions = artifacts.require("MockEnhancedStepFunctions.sol");
// const TestToken = artifacts.require("TestToken.sol");
// const TestTokenFailing = artifacts.require("TestTokenFailing.sol");
// const TestTokenTransferFailing = artifacts.require("TestTokenTransferFailing.sol");
// const Reserve = artifacts.require("KyberReserve.sol");
// const Network = artifacts.require("KyberNetwork.sol");
// const WhiteList = artifacts.require("WhiteList.sol");
// const ExpectedRate = artifacts.require("ExpectedRate.sol");
// const FeeBurner = artifacts.require("FeeBurner.sol");

// const OrderbookReserve = artifacts.require("MockOrderbookReserve.sol");
// const PermissionlessOrderbookReserveLister = artifacts.require("PermissionlessOrderbookReserveLister.sol");
// const OrderListFactory = artifacts.require("OrderListFactory.sol");
// const MockMedianizer = artifacts.require("MockMedianizer.sol");

// const Helper = require("./helper.js");
// const BN = web3.utils.BN;
// const truffleAssert = require('truffle-assertions');

// //global variables
// //////////////////
// const precisionUnits = (new BN(10).pow(new BN(18)));
// const max_rate = (precisionUnits.mul(new BN(10 ** 6))); //internal parameter in Utils.sol
// const ethAddress = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
// const zeroAddress = '0x0000000000000000000000000000000000000000';
// const gasPrice = (new BN(10).pow(new BN(9)).mul(new BN(50)));
// let negligibleRateDiff = 11;
// let emptyHint = '0x';

// //balances
// let expectedReserve1BalanceWei = 0;
// let expectedReserve2BalanceWei = 0;
// let expectedReserve4BalanceWei = 0;
// let reserve1TokenBalance = [];
// let reserve2TokenBalance = [];
// let reserve4TokenBalance = [];
// let reserve1TokenImbalance = [];
// let reserve2TokenImbalance = [];
// let reserve4TokenImbalance = [];
// let reserve1StartTokenBalance = [];
// let reserve2StartTokenBalance = [];
// let reserve4StartTokenBalance = [];

// //permission groups
// let admin;
// let operator;
// let alerter;
// let sanityRates;
// let user1;
// let user2;
// let user3;
// let walletForToken;
// let walletId;
// let maker1;

// //contracts
// let pricing1;
// let pricing2;
// let pricing3;
// let pricing4; // new conversion rate
// let reserve1;
// let reserve2;
// let reserve3;
// let reserve4; // reserve with new conversion rate
// let whiteList;
// let expectedRate;
// let network;
// let networkProxy;
// let feeBurner;

// //block data
// let priceUpdateBlock;
// let currentBlock;
// let validRateDurationInBlocks = 5100;

// //tokens data
// ////////////
// let numTokens = 4;
// let tokens = [];
// let tokenAdd = [];
// let tokenDecimals = [];
// let uniqueToken;
// let failingTransferToken;
// let failingToken;

// let KNC;
// let kncAddress;
// const ethToKncRatePrecision = precisionUnits.mul(new BN(550));

// //cap data for white list
// let capWei = 1000;
// let sgdToEthRate = 30000;

// // imbalance data
// let minimalRecordResolution = 2; //low resolution so I don't lose too much data. then easier to compare calculated imbalance values.
// let maxPerBlockImbalance = 4000;
// let maxTotalImbalance = maxPerBlockImbalance * 12;

// // all price steps in bps (basic price steps).
// // 100 bps means rate change will be: price * (100 + 10000) / 10000 == raise rate in 1%
// // higher rate is better for user. will get more dst quantity for his tokens.
// // all x values represent token imbalance. y values represent equivalent steps in bps.
// // buyImbalance represents coin shortage. higher buy imbalance = more tokens were bought.
// // generally. speaking, if imbalance is higher we want to have:
// //      - smaller buy bps (negative) to lower rate when buying token with ether.
// //      - bigger sell bps to have higher rate when buying ether with token.
// ////////////////////

// //base buy and sell rates (prices)
// let baseBuyRate1 = [];
// let baseBuyRate2 = [];
// let baseBuyRate4 = [];
// let baseSellRate1 = [];
// let baseSellRate2 = [];
// let baseSellRate4 = [];

// //quantity buy steps
// let qtyBuyStepX = [0, 150, 350, 800, 1800];
// let qtyBuyStepY = [0,  0, -70, -160, -1200];

// //imbalance buy steps
// let imbalanceBuyStepX = [-1800, -800, -350, -150, 0, 150, 350, 800, 1800];
// let imbalanceBuyStepY = [1000, 300,   130,    43, 0,   0, -110, -600, -1600];
// let imbalanceBuyStepYNew = [1000, 300,   130,    43, 0,   0, -110, -600, -1300, -1600];

// //sell
// //sell price will be 1 / buy (assuming no spread) so sell is actually buy price in other direction
// let qtySellStepX = [0, 150, 350, 800, 1800];
// let qtySellStepY = [0, 0, 120, 170, 1200];

// //sell imbalance step
// let imbalanceSellStepX = [-1500, -1000, -600, -350, -160, -100, 0, 150, 800, 1800];
// let imbalanceSellStepY = [-400, -100, -90, -80, -43, -12, 0, 0, 110, 1600];
// let imbalanceSellStepYNew = [-400, -100, -90, -80, -43, -12, 0, 0, 110, 600, 1600];


// //compact data.
// let sells = [];
// let buys = [];
// let indices = [];
// let compactBuyArr = [];
// let compactSellArr = [];

// let oldBaseBuy;
// let oldBaseSell;

// contract('KyberNetwork', function(accounts) {
//     it("should init globals. init 2 ConversionRates Inst, init tokens and add to pricing inst. set basic data per token.", async function () {
//         // set account addresses
//         admin = accounts[0];
//         networkProxy = accounts[0];
//         operator = accounts[1];
//         alerter = accounts[2];
//         user1 = accounts[4];
//         user2 = accounts[5];
//         walletId = accounts[6];
//         walletForToken = accounts[7];
//         maker1 = accounts[8];

//         currentBlock = priceUpdateBlock = await Helper.getCurrentBlock();

// //        console.log("current block: " + currentBlock);
//         //init contracts
//         pricing1 = await ConversionRates.new(admin);
//         pricing2 = await ConversionRates.new(admin);
//         pricing3 = await ConversionRates.new(admin);
//         pricing4 = await EnhancedStepFunctions.new(admin);

//         //set pricing general parameters
//         await pricing1.setValidRateDurationInBlocks(validRateDurationInBlocks);
//         await pricing2.setValidRateDurationInBlocks(validRateDurationInBlocks);
//         await pricing3.setValidRateDurationInBlocks(validRateDurationInBlocks);
//         await pricing4.setValidRateDurationInBlocks(validRateDurationInBlocks);

//         //create and add token addresses...
//         for (let i = 0; i < numTokens; ++i) {
//             tokenDecimals[i] = 15 * 1 + 1 * i;
//             token = await TestToken.new("test" + i, "tst" + i, tokenDecimals[i]);
//             tokens[i] = token;
//             tokenAdd[i] = token.address;

//             await pricing1.addToken(token.address);
//             await pricing1.setTokenControlInfo(token.address, minimalRecordResolution, maxPerBlockImbalance, maxTotalImbalance);
//             await pricing1.enableTokenTrade(token.address);
//             await pricing2.addToken(token.address);
//             await pricing2.setTokenControlInfo(token.address, minimalRecordResolution, maxPerBlockImbalance, maxTotalImbalance);
//             await pricing2.enableTokenTrade(token.address);
//             await pricing4.addToken(token.address);
//             await pricing4.setTokenControlInfo(token.address, minimalRecordResolution, maxPerBlockImbalance, maxTotalImbalance);
//             await pricing4.enableTokenTrade(token.address);
//         }

//         KNC = await TestToken.new("Kyber krystal", "KNC", 18);
//         kncAddress = KNC.address;
//         await pricing3.addToken(kncAddress);
//         await pricing3.setTokenControlInfo(kncAddress, minimalRecordResolution, maxPerBlockImbalance, maxTotalImbalance);
//         await pricing3.enableTokenTrade(kncAddress);

//         Helper.assertEqual(tokens.length, numTokens, "bad number tokens");

//         uniqueToken = await TestToken.new("unique", "unq", 15);
//         await pricing3.addToken(uniqueToken.address);
//         await pricing3.setTokenControlInfo(uniqueToken.address, minimalRecordResolution, maxPerBlockImbalance, maxTotalImbalance);
//         await pricing3.enableTokenTrade(uniqueToken.address);

//         failingTransferToken = await TestTokenTransferFailing.new("Kyber krystal", "KNC", 18);
//         await pricing3.addToken(failingTransferToken.address);
//         await pricing3.setTokenControlInfo(failingTransferToken.address, minimalRecordResolution, maxPerBlockImbalance, maxTotalImbalance);
//         await pricing3.enableTokenTrade(failingTransferToken.address);

//         await pricing1.addOperator(operator);
//         await pricing1.addAlerter(alerter);
//         await pricing2.addOperator(operator);
//         await pricing2.addAlerter(alerter);
//         await pricing3.addOperator(operator);
//         await pricing3.addAlerter(alerter);
//         await pricing4.addOperator(operator);
//         await pricing4.addAlerter(alerter);
//         //        console.log(result.logs[0].args);
//     });

//     it("should set base rates + compact data rate factor + step function. for all tokens.", async function () {
//         //buy is ether to token rate. sale is token to ether rate. so sell == 1 / buy. assuming we have no spread.
//         let tokensPerEther;
//         let ethersPerToken;

//         for (i = 0; i < numTokens; ++i) {
//             tokensPerEther = precisionUnits.mul(new BN((i + 1) * 3));
//             ethersPerToken = precisionUnits.div(new BN((i + 1) * 3));
//             baseBuyRate1.push(tokensPerEther);
//             baseBuyRate2.push(tokensPerEther.mul(new BN(10100)).div(new BN(10000)));
//             baseBuyRate4.push(tokensPerEther);
//             baseSellRate1.push(ethersPerToken);
//             baseSellRate2.push(ethersPerToken.div(new BN(1000)).mul(new BN(980)));
//             baseSellRate4.push(ethersPerToken);
//         }

// //        console.log('baseBuyRate1')
// //        console.log(baseBuyRate1)
// //        console.log('baseSellRate1')
// //        console.log(baseSellRate1)

// //        console.log('baseBuyRate2')
// //        console.log(baseBuyRate2)
// //        console.log('baseSellRate2')
// //        console.log(baseSellRate2)

//         Helper.assertEqual(baseBuyRate1.length, tokens.length);
//         Helper.assertEqual(baseBuyRate2.length, tokens.length);
//         Helper.assertEqual(baseBuyRate4.length, tokens.length);
//         Helper.assertEqual(baseSellRate1.length, tokens.length);
//         Helper.assertEqual(baseSellRate2.length, tokens.length);
//         Helper.assertEqual(baseSellRate4.length, tokens.length);

//         buys.length = sells.length = indices.length = 0;

//         await pricing1.setBaseRate(tokenAdd, baseBuyRate1, baseSellRate1, buys, sells, currentBlock, indices, {from: operator});
//         await pricing2.setBaseRate(tokenAdd, baseBuyRate2, baseSellRate2, buys, sells, currentBlock, indices, {from: operator});
//         await pricing4.setBaseRate(tokenAdd, baseBuyRate4, baseSellRate4, buys, sells, currentBlock, indices, {from: operator});

//         let uniqueAddArr = [uniqueToken.address];
//         let baseBuyUnique = [precisionUnits.mul(new BN(18))];
//         let baseSellUnique = [precisionUnits.div(new BN(18))];
//         let kncAddressArr = [kncAddress];
//         let arr = [failingTransferToken.address]
// //        log(uniqueAddArr + "  " + baseBuyUnique + "  " + baseSellUnique)
//         await pricing3.setBaseRate(uniqueAddArr, baseBuyUnique, baseSellUnique, buys, sells, currentBlock, indices, {from: operator});
//         await pricing3.setBaseRate(kncAddressArr, baseBuyUnique, baseSellUnique, buys, sells, currentBlock, indices, {from: operator});
//         await pricing3.setBaseRate(arr, baseBuyUnique, baseSellUnique, buys, sells, currentBlock, indices, {from: operator});
//         //set compact data
//         compactBuyArr = [0, 0, 0, 0, 0, 06, 07, 08, 09, 1, 0, 11, 12, 13, 14];
//         let compactBuyHex = Helper.bytesToHex(compactBuyArr);
//         buys.push(compactBuyHex);

//         compactSellArr = [0, 0, 0, 0, 0, 26, 27, 28, 29, 30, 31, 32, 33, 34];
//         let compactSellHex = Helper.bytesToHex(compactSellArr);
//         sells.push(compactSellHex);

//         indices[0] = 0;

//         Helper.assertEqual(indices.length, sells.length, "bad sells array size");
//         Helper.assertEqual(indices.length, buys.length, "bad buys array size");

//         await pricing1.setCompactData(buys, sells, currentBlock, indices, {from: operator});
//         await pricing2.setCompactData(buys, sells, currentBlock, indices, {from: operator});
//         await pricing3.setCompactData(buys, sells, currentBlock, indices, {from: operator});
//         await pricing4.setCompactData(buys, sells, currentBlock, indices, {from: operator});

//         //all start with same step functions.
//         let zeroArr = [0];
//         for (let i = 0; i < numTokens; ++i) {
//             await pricing1.setQtyStepFunction(tokenAdd[i], qtyBuyStepX, qtyBuyStepY, qtySellStepX, qtySellStepY, {from:operator});
//             await pricing2.setQtyStepFunction(tokenAdd[i], qtyBuyStepX, qtyBuyStepY, qtySellStepX, qtySellStepY, {from:operator});
//             await pricing1.setImbalanceStepFunction(tokenAdd[i], imbalanceBuyStepX, imbalanceBuyStepY, imbalanceSellStepX, imbalanceSellStepY, {from:operator});
//             await pricing2.setImbalanceStepFunction(tokenAdd[i], imbalanceBuyStepX, imbalanceBuyStepY, imbalanceSellStepX, imbalanceSellStepY, {from:operator});
//             await pricing4.setImbalanceStepFunction(tokenAdd[i], imbalanceBuyStepX, imbalanceBuyStepYNew, imbalanceSellStepX, imbalanceSellStepYNew, {from:operator});
//         }

//         await pricing3.setQtyStepFunction(uniqueToken.address, qtyBuyStepX, qtyBuyStepY, qtySellStepX, qtySellStepY, {from:operator});
//         await pricing3.setImbalanceStepFunction(uniqueToken.address, imbalanceBuyStepX, imbalanceBuyStepY, imbalanceSellStepX, imbalanceSellStepY, {from:operator});
//         await pricing3.setQtyStepFunction(failingTransferToken.address, qtyBuyStepX, qtyBuyStepY, qtySellStepX, qtySellStepY, {from:operator});
//         await pricing3.setImbalanceStepFunction(failingTransferToken.address, imbalanceBuyStepX, imbalanceBuyStepY, imbalanceSellStepX, imbalanceSellStepY, {from:operator});
//         await pricing3.setQtyStepFunction(kncAddress, qtyBuyStepX, qtyBuyStepY, qtySellStepX, qtySellStepY, {from:operator});
//         await pricing3.setImbalanceStepFunction(kncAddress, imbalanceBuyStepX, imbalanceBuyStepY, imbalanceSellStepX, imbalanceSellStepY, {from:operator});
//     });

//     it("should init network and reserves and set all reserve data including balances", async function () {
//         network = await Network.new(admin);
//         await network.addOperator(operator);

//         reserve1 = await Reserve.new(network.address, pricing1.address, admin);
//         reserve2 = await Reserve.new(network.address, pricing2.address, admin);
//         reserve3 = await Reserve.new(network.address, pricing3.address, admin);
//         reserve4 = await Reserve.new(network.address, pricing4.address, admin);

//         await pricing1.setReserveAddress(reserve1.address);
//         await pricing2.setReserveAddress(reserve2.address);
//         await pricing3.setReserveAddress(reserve3.address);
//         await pricing4.setReserveAddress(reserve4.address);

//         await reserve1.addAlerter(alerter);
//         await reserve2.addAlerter(alerter);
//         await reserve3.addAlerter(alerter);
//         await reserve4.addAlerter(alerter);
      
//         for (i = 0; i < numTokens; ++i) {
//             await reserve1.approveWithdrawAddress(tokenAdd[i], accounts[0], true);
//             await reserve2.approveWithdrawAddress(tokenAdd[i], accounts[0], true);
//             await reserve4.approveWithdrawAddress(tokenAdd[i], accounts[0], true);
//         }
//         await reserve3.approveWithdrawAddress(uniqueToken.address, accounts[0], true);
//         await reserve3.approveWithdrawAddress(failingTransferToken.address, accounts[0], true);
//         await reserve3.approveWithdrawAddress(kncAddress, accounts[0], true);

//         //set reserve balance. 10**18 wei ether + per token 10**18 wei ether value according to base rate.
//         let reserveEtherInit = (new BN(10)).pow(new BN(19)).mul(new BN(2));
//         await Helper.sendEtherWithPromise(accounts[8], reserve1.address, reserveEtherInit);
//         await Helper.sendEtherWithPromise(accounts[9], reserve2.address, reserveEtherInit);
//         await Helper.sendEtherWithPromise(accounts[6], reserve3.address, reserveEtherInit);
//         await Helper.sendEtherWithPromise(accounts[9], reserve4.address, reserveEtherInit);
//         await uniqueToken.transfer(reserve3.address, 1000000000000);
//         await failingTransferToken.transfer(reserve3.address, 1000000000000);
//         await KNC.transfer(reserve3.address, (new BN(10).pow(new BN(24))));

//         let balance = await Helper.getBalancePromise(reserve1.address);
//         expectedReserve1BalanceWei = new BN(balance);
//         Helper.assertEqual(balance, reserveEtherInit, "wrong ether balance");
//         balance = await Helper.getBalancePromise(reserve2.address);
//         expectedReserve2BalanceWei = new BN(balance);
//         Helper.assertEqual(balance, reserveEtherInit, "wrong ether balance");
//         balance = await Helper.getBalancePromise(reserve4.address);
//         expectedReserve4BalanceWei = new BN(balance);
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

//             let amount4 = (new BN(reserveEtherInit)).div(precisionUnits).mul(baseBuyRate4[i]);
//             reserve4StartTokenBalance[i] = amount4
//             await token.transfer(reserve4.address, amount4);

//             Helper.assertEqual(amount1, balance);
//             reserve1TokenBalance.push(amount1);
//             reserve2TokenBalance.push(amount2);
//             reserve4TokenBalance.push(amount4);
//             reserve1TokenImbalance.push(new BN(0));
//             reserve2TokenImbalance.push(new BN(0));
//             reserve4TokenImbalance.push(new BN(0));
//         }
//     });

//     it("test Kyber global parameters", async() => {
//         let hint = await network.PERM_HINT_GET_RATE();
//         Helper.assertEqual(hint, (new BN(2).pow(new BN(255))));
//     })

//     it("should init Kyber network data, list token pairs.", async function () {
//         // add reserves
//         await network.addReserve(reserve1.address, false, {from: operator});
//         await network.addReserve(reserve2.address, false, {from: operator});

//         await network.setKyberProxy(networkProxy);

//         //set contracts
//         feeBurner = await FeeBurner.new(admin, tokenAdd[0], network.address, ethToKncRatePrecision);
//         let kgtToken = await TestToken.new("Kyber genesis token", "KGT", 0);
//         whiteList = await WhiteList.new(admin, kgtToken.address);
//         await whiteList.addOperator(operator);
//         await whiteList.setCategoryCap(0, capWei, {from:operator});
//         await whiteList.setSgdToEthRate(sgdToEthRate, {from:operator});

//         expectedRate = await ExpectedRate.new(network.address, KNC.address, admin);
//         await network.setWhiteList(whiteList.address);
//         await network.setExpectedRate(expectedRate.address);
//         await network.setFeeBurner(feeBurner.address);
//         await network.setParams(gasPrice, negligibleRateDiff);
//         await network.setEnable(true);
//         let price = await network.maxGasPrice();
//         Helper.assertEqual(price, gasPrice);

//         //list tokens per reserve
//         for (let i = 0; i < numTokens; i++) {
//             await network.listPairForReserve(reserve1.address, tokenAdd[i], true, true, true, {from: operator});
//             await network.listPairForReserve(reserve2.address, tokenAdd[i], true, true, true, {from: operator});
//         }
//     });

//     it("test kyber network set contract events", async() => {

//         let tempNetwork = await Network.new(admin);
//         let txData = await tempNetwork.addOperator(operator);
//         truffleAssert.eventEmitted(txData, 'OperatorAdded', (ev) => {
//                                 return (
//                                     ev.newOperator === operator
//                                     && ev.isAdd === true
//                                 )
//                             });

//         txData = await tempNetwork.addReserve(reserve1.address, false, {from: operator});
//         truffleAssert.eventEmitted(txData, 'AddReserveToNetwork', (ev) => {
//                                         return (
//                                             ev.reserve === reserve1.address
//                                             && ev.isPermissionless === false
//                                         )
//                                     });

//         txData = await tempNetwork.setKyberProxy(networkProxy);
//         truffleAssert.eventEmitted(txData, 'KyberProxySet', (ev) => {
//                                         return (
//                                             ev.proxy === networkProxy
//                                             && ev.sender === accounts[0]
//                                         )
//                                     });

//         txData = await tempNetwork.setExpectedRate(expectedRate.address);
// //        log('txData.logs[0].args')
// //        log(txData.logs[0])
//         truffleAssert.eventEmitted(txData, 'ExpectedRateContractSet', (ev) => {
//                                         return (
//                                             ev.newContract === expectedRate.address
//                                             && ev.currentContract === zeroAddress
//                                         )
//                                     });

//         txData = await tempNetwork.setFeeBurner(feeBurner.address);
//         truffleAssert.eventEmitted(txData, 'FeeBurnerContractSet', (ev) => {
//                                         return (
//                                             ev.newContract === feeBurner.address
//                                             && ev.currentContract === zeroAddress
//                                         )
//                                     });

//         txData = await tempNetwork.setParams(gasPrice, negligibleRateDiff);
// //        truffleAssert.eventEmitted(txData, 'KyberNetwrokParamsSet', (ev) => {
// //                                        return (
// //                                            ev.maxGasPrice === gasPrice
// //                                            && ev.negligibleRateDiff === negligibleRateDiff
// //                                        )
// //                                    });

//         Helper.assertEqual(txData.logs[0].args.maxGasPrice, gasPrice);
//         Helper.assertEqual(txData.logs[0].args.negligibleRateDiff, negligibleRateDiff);

//         txData = await tempNetwork.setEnable(true);
//         truffleAssert.eventEmitted(txData, 'KyberNetworkSetEnable', (ev) => {
//                                         return (
//                                             ev.isEnabled === true
//                                         )
//                                     });

//         //list token
//         txData = await tempNetwork.listPairForReserve(reserve1.address, tokenAdd[0], true, true, true, {from: operator});
//         assert.equal(txData.logs[0].event, 'ListReservePairs');
//         assert.equal(txData.logs[0].args.src, ethAddress);
//         assert.equal(txData.logs[0].args.dest, tokenAdd[0]);
//         assert.equal(txData.logs[0].args.add, true);
//         assert.equal(txData.logs[1].args.dest, ethAddress);
//         assert.equal(txData.logs[1].args.src, tokenAdd[0]);
//         assert.equal(txData.logs[1].args.add, true);

//         txData = await tempNetwork.listPairForReserve(reserve1.address, tokenAdd[0], true, true, false, {from: operator});
//         assert.equal(txData.logs[0].args.src, ethAddress);
//         assert.equal(txData.logs[0].args.dest, tokenAdd[0]);
//         assert.equal(txData.logs[0].args.add, false);
//         assert.equal(txData.logs[1].args.dest, ethAddress);
//         assert.equal(txData.logs[1].args.src, tokenAdd[0]);
//         assert.equal(txData.logs[1].args.add, false);

//         txData = await tempNetwork.listPairForReserve(reserve1.address, tokenAdd[1], true, false, true, {from: operator});
//         assert.equal(txData.logs[0].args.src, ethAddress);
//         assert.equal(txData.logs[0].args.dest, tokenAdd[1]);
//         assert.equal(txData.logs[0].args.add, true);

//         txData = await tempNetwork.listPairForReserve(reserve1.address, tokenAdd[1], true, false, false, {from: operator});
//         assert.equal(txData.logs[0].args.src, ethAddress);
//         assert.equal(txData.logs[0].args.dest, tokenAdd[1]);
//         assert.equal(txData.logs[0].args.add, false);

//         txData = await tempNetwork.listPairForReserve(reserve1.address, tokenAdd[2], false, true, true, {from: operator});
//         assert.equal(txData.logs[0].args.dest, ethAddress);
//         assert.equal(txData.logs[0].args.src, tokenAdd[2]);
//         assert.equal(txData.logs[0].args.add, true);
//     })

//     it("test enable API", async() => {
//         let isEnabled = await network.enabled();
//         assert.equal(isEnabled, true);

//         await network.setEnable(false);

//         isEnabled = await network.enabled();
//         assert.equal(isEnabled, false);

//         await network.setEnable(true);
//     })

//     it("should disable 1 reserve. perform buy and check: balances changed as expected.", async function () {
//         let tokenInd = 1;
//         let token = tokens[tokenInd]; //choose some token
//         let amountWei = 330 * 1;

//         //disable reserve 1
//         await reserve1.disableTrade({from:alerter});
//         let reserveIndex = 2;
//         try {
//             //verify base rate
//             let buyRate = await network.getExpectedRate(ethAddress, tokenAdd[tokenInd], amountWei);
//             let expected = calculateRateAmount(true, tokenInd, amountWei, reserveIndex);
//             let expectedRate = expected[0];
//             let expectedTweiAmount = expected[1];

//             expectedRate = calcCombinedRate(amountWei, precisionUnits, expectedRate, 18, tokenDecimals[tokenInd], expectedTweiAmount);

//             //check correct rate calculated
//             Helper.assertEqual(buyRate[0], expectedRate, "unexpected rate.");

//             //perform trade
//             let txData = await network.tradeWithHint(user1, ethAddress, amountWei, tokenAdd[tokenInd], user2, 50000,
//                 buyRate[1], walletId, emptyHint, {from:networkProxy, value:amountWei});
// //            log(txData.logs[0].args)
// //            log("txData logs 0" + txData.logs[0])
//             assert.equal(txData.logs[0].event, 'KyberTrade');
//             assert.equal(txData.logs[0].args.trader, user1, "src address");
//             assert.equal(txData.logs[0].args.src, ethAddress, "src token");
//             assert.equal(txData.logs[0].args.srcAmount, amountWei);
//             assert.equal(txData.logs[0].args.destAddress, user2);
//             assert.equal(txData.logs[0].args.dest, tokenAdd[tokenInd]);
//             Helper.assertEqual(txData.logs[0].args.dstAmount, expectedTweiAmount);
//             assert.equal(txData.logs[0].args.ethWeiValue, amountWei);
//             assert.equal(txData.logs[0].args.hint, null);
//             assert.equal(txData.logs[0].args.reserve1, '0x0000000000000000000000000000000000000000');
//             assert.equal(txData.logs[0].args.reserve2, reserve2.address);

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

//     it("should disable 1 reserve. perform sell and check: balances changed as expected.", async function () {
//         let tokenInd = 2;
//         let token = tokens[tokenInd]; //choose some token
//         let amountTwei = new BN(1030);

//         //disable reserve 1
//         await reserve1.disableTrade({from:alerter});
//         let reserveIndex = 2;
//         try {
//             //verify base rate
//             let rate = await network.getExpectedRate(tokenAdd[tokenInd], ethAddress, amountTwei);
//             let expected = calculateRateAmount(false, tokenInd, amountTwei, reserveIndex);
//             let expectedRate = expected[0];
//             let expectedAmountWei = expected[1];

//             expectedRate = calcCombinedRate(amountTwei, expectedRate, precisionUnits, tokenDecimals[tokenInd], 18, expectedAmountWei);

//             //check correct rate calculated
//             Helper.assertEqual(rate[0], expectedRate, "unexpected rate.");

//             await token.transfer(network.address, amountTwei);
// //            await token.approve(network.address, amountTwei, {from:user1})

//             //perform trade
//             let balance = await Helper.getBalancePromise(reserve2.address);
//             let txData = await network.tradeWithHint(user1, tokenAdd[tokenInd], amountTwei, ethAddress, user2, 500000,
//                             rate[1], walletId, emptyHint, {from:networkProxy});
//             assert.equal(txData.logs[1].event, 'KyberTrade');
//             assert.equal(txData.logs[1].args.trader, user1, "src address");
//             assert.equal(txData.logs[1].args.dest, ethAddress, "src token");
//             Helper.assertEqual(txData.logs[1].args.srcAmount, amountTwei);
//             assert.equal(txData.logs[1].args.destAddress, user2);
//             assert.equal(txData.logs[1].args.src, tokenAdd[tokenInd]);
//             Helper.assertEqual(txData.logs[1].args.dstAmount, expectedAmountWei);
//             Helper.assertEqual(txData.logs[1].args.ethWeiValue, expectedAmountWei);
//             assert.equal(txData.logs[1].args.hint, null);
//             assert.equal(txData.logs[1].args.reserve2, zeroAddress);
//             assert.equal(txData.logs[1].args.reserve1, reserve2.address);

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
//             reserve2TokenBalance[tokenInd] = reserve2TokenBalance[tokenInd].mul(new BN(1)).add(amountTwei).mul(new BN(1));
//             reserve2TokenImbalance[tokenInd] = reserve2TokenImbalance[tokenInd].sub(amountTwei).mul(new BN(1)); //imbalance represents how many missing tokens
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
//         let rates = await network.getExpectedRate(ethAddress, tokenAdd[tokenInd], amountWei);

//         let negligibleDiff = 1 * (await network.negligibleRateDiff());
//         //make sure reserve 2 has higher buy rate > negligibleDiff
//         if ((buyRate2 * 10000 / (10000 + negligibleDiff) <= buyRate1)) {
//             assert(false, "buy rate reserve 2 not bigger by negligibleDiff: " + (negligibleDiff / 10000));
//         }

// //        log("buy rate 1: " + buyRate1 + " buyRate2 " + buyRate2 + " diff rate: " + (buyRate2 * 10000 / (10000 + negligibleDiff)) );
//         //perform trade
//         let txData = await network.tradeWithHint(user1, ethAddress, amountWei, tokenAdd[tokenInd], user1, 800, rates[1],
//                             walletId, emptyHint, {from:networkProxy, value:amountWei});
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
//         reserve2TokenImbalance[tokenInd] = reserve2TokenImbalance[tokenInd].add(expectedTweiAmount); //imbalance represents how many missing tokens
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
//         let rates = await network.getExpectedRate(tokenAdd[tokenInd], ethAddress, amountTwei);

//         //make sure reserve 1 has higher sell rate > negligibleDiff
//         let sellRate1MinEps = sellRate1 * 10000 / (10000 * 1 + negligibleDiff * 1);
//         if (sellRate1MinEps <= sellRate2) {
//             assert(false, "rate too small. rate1: " + sellRate1 + " rate1minEps " + sellRate1MinEps + " rate2 " + sellRate2);
//         }

//         // transfer funds to user and approve funds to network
//         await token.transfer(network.address, amountTwei);
// //        await token.approve(network.address, amountTwei, {from:user1})

//         // start balance for user2.
//         const startEtherBalanceUser2 = new BN(await Helper.getBalancePromise(user2));

//         //perform trade
//         //API: trade(ERC20 src, srcAmount, ERC20 dest, destAddress, maxDestAmount, minConversionRate, walletId)
//         let txData = await network.tradeWithHint(user1, tokenAdd[tokenInd], amountTwei, ethAddress, user2, 300000, rates[1],
//                         walletId, emptyHint, {from:networkProxy, value:0});
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
//         let amountTwei = new BN(3000);
//         let maxDestAmountLow = new BN(50000);
//         let maxDestAmountHigh = new BN(50000000);

//         let rates = await network.getExpectedRate(tokenAdd[tokenInd], ethAddress, amountTwei);
//         let minRate = rates[0];

//         // transfer funds to user and approve funds to network
//         await token.transfer(network.address, amountTwei);
// //        await token.approve(network.address, amountTwei, {from:user1})

//         //perform full amount trade. see token balance on user 1 zero
//         let txData = await network.tradeWithHint(user1, tokenAdd[tokenInd], amountTwei, ethAddress, user2, maxDestAmountHigh,
//                             minRate, walletId, emptyHint, {from:networkProxy});
//         console.log("trade token to ether. gas used: " + txData.receipt.gasUsed)

//         //check token balance on user1 is zero
//         let tokenTweiBalance = await token.balanceOf(user1);
//         Helper.assertEqual(tokenTweiBalance, 0, "bad token balance");

//         // transfer funds to user and approve funds to network
//         await token.transfer(network.address, amountTwei);
// //        await token.approve(network.address, amountTwei, {from:user1})

//         //user2 initial balance
//         let user2InitBalance = await Helper.getBalancePromise(user2);

//         rates = await network.getExpectedRate(tokenAdd[tokenInd], ethAddress, amountTwei);
//         minRate = rates[1];

//         //perform blocked amount trade. see token balance on user 1 above zero
//         let result = await network.tradeWithHint(user1, tokenAdd[tokenInd], amountTwei, ethAddress, user2, maxDestAmountLow,
//                         minRate, walletId, emptyHint, {from:networkProxy});

//         //check used ethers as expected.
//         let user2PostBalance = await Helper.getBalancePromise(user2);

//         //check token balance on user1
//         tokenTweiBalance = await token.balanceOf(user1);
//         assert(tokenTweiBalance > 0, "bad token balance");
//     });

//     it("should test low 'max dest amount' with failing transfer token. see trade reverted.", async function () {
//         let token = failingTransferToken; //choose some token
//         let amountTwei = new BN(3000);
//         let maxDestAmount = new BN(11);

//         await network.addReserve(reserve3.address, false, {from: operator});
//         await network.listPairForReserve(reserve3.address, token.address, true, true, true, {from: operator});

//         //see token supported
//         let rate = await network.getExpectedRate(token.address, ethAddress, amountTwei);
//         assert(rate[0] > 0, "rate: " + rate[0]);

//         // transfer funds to user and approve funds to network
//         await token.transfer(network.address, amountTwei);

//         try {
//             await network.tradeWithHint(user1, failingTransferToken.address, amountTwei, ethAddress, user2, maxDestAmount,
//                 1, walletId, emptyHint, {from:networkProxy});
//             assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }
//     });

//     it("should test trade with failing transfer token. see trade reverted.", async function () {
//         let token = failingTransferToken; //choose some token
//         let amountWei = 450;
//         let minConversionRate = 0;

//         //buy
//         try {
//              await network.tradeWithHint(user1, ethAddress, amountWei, token.address, user2, (new BN(10)).pow(new BN(21)),
//                 minConversionRate, walletId, emptyHint, {from:networkProxy, value:amountWei});
//              assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }
//         await network.removeReserve(reserve3.address, 2, {from: operator});
//     });

//     it("should test low 'max dest amount' on buy. make sure it reduces source amount.", async function () {
//         let tokenInd = 0;
//         let token = tokens[tokenInd]; //choose some token
//         let amountWei = 110000 * 1;
//         let maxDestAmountLow = 11;
//         let maxDestAmountHigh = 30000;

//         let rates = await network.getExpectedRate(ethAddress, tokenAdd[tokenInd], amountWei);
//         let minRate = rates[0];

//         let initialTokBalUser2 = token.balanceOf(user2);

//         //perform full amount trade. see full token balance on user 2
//         let txData = await network.tradeWithHint(user1, ethAddress, amountWei, tokenAdd[tokenInd], user2, maxDestAmountHigh,
//                         minRate, walletId, emptyHint, {from:networkProxy, value:amountWei});
//         console.log("trade ether to token with low max dest amount. gas used: " + txData.receipt.gasUsed)

//         let postTokenBalUser2 = await token.balanceOf(user2);

//         let actualTradedTokens1 = postTokenBalUser2*1 - initialTokBalUser2*1;

//         rates = await network.getExpectedRate(ethAddress, tokenAdd[tokenInd], amountWei);
//         minRate = rates[0];

//         //perform limited amount trade
//         let trade = await network.tradeWithHint(user1, ethAddress, amountWei, tokenAdd[tokenInd], user2, maxDestAmountLow,
//                         minRate, walletId, emptyHint, {from:networkProxy, value:amountWei});

//         let post2ndTokenBalUser2 = await token.balanceOf(user2);

//         let actualTradedTokens2 = post2ndTokenBalUser2*1 - postTokenBalUser2*1;

//         Helper.assertEqual(actualTradedTokens2*1, maxDestAmountLow, "unexpected token balance");
//     });

//     it("should set reserve rate diff < negligibleDiff (negligible diff) perform 20 buys in loop. make sure buys from both reserves.", async function () {
//         let tokenInd = 3;
//         let token = tokens[tokenInd]; //choose some token
//         let amountWei = 100;
//         let numTrades = 20;

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
//             let txData = await network.tradeWithHint(user1, ethAddress, amountWei, tokenAdd[tokenInd], user2, maxDestAmount,
//                             minRate, walletId, emptyHint, {from:networkProxy, value:amountWei});
//             cumulativeGas = cumulativeGas.add(new BN(txData.receipt.gasUsed));
//         }
//         let avgGas = cumulativeGas.div(new BN(numTrades));
//         log("average gas usage " + numTrades + " buys. ether to token: " + avgGas);

//         //again take balance from both reserves
//         let tokPostBalance1 = new BN(await token.balanceOf(reserve1.address));
//         let tokPostBalance2 = new BN(await token.balanceOf(reserve2.address));
//         let ethPostBalance1 = new BN(await Helper.getBalancePromise(reserve1.address));
//         let ethPostBalance2 = new BN(await Helper.getBalancePromise(reserve2.address));

//         //check higher ether balance on both
//         assert(ethPostBalance2.gt(ethPreBalance2), "expected more ether here.");
//         assert(ethPostBalance1.gt(ethPreBalance1), "expected more ether here.");

//         //check lower token balance on both
//         assert(tokPostBalance1.lt(tokPreBalance1), "expected more token here.");
//         assert(tokPostBalance2.lt(tokPreBalance2), "expected more token here.");

//         await network.setParams(gasPrice, negligibleRateDiff);
//     });

//     it("should set reserve rate diff < negligibleDiff perform 20 sells in loop. make sure sells from both reserves.", async function () {
//         let tokenInd = 3;
//         let token = tokens[tokenInd]; //choose some token
//         let amountTWei = 119;
//         let numLoops = 20;

//         // transfer funds to user and approve funds to network
//         await token.transfer(network.address, amountTWei*numLoops);
// //        await token.approve(network.address, amountTWei*numLoops, {from:user1})

//         //compare reserve sell rates for token
//         let sellRate1 = await reserve1.getConversionRate(tokenAdd[tokenInd], ethAddress, amountTWei, currentBlock + 10);
//         let sellRate2 = await reserve2.getConversionRate(tokenAdd[tokenInd], ethAddress, amountTWei, currentBlock + 10);

//         let negligibleDiff = 2000; // 750 / 10000 = 7.5%
//         await network.setParams(gasPrice, negligibleDiff);

//         //make sure reserve 1 has higher sell rate < negligibleDiff
//         let sellRate1MinEps = sellRate1 * 10000 / (10000 * 1 + negligibleDiff * 1);
//         if (sellRate1MinEps > sellRate2) {
//             assert(false, "rate too small. rate1: " + sellRate1 + " rate1minEps " + sellRate1MinEps + " rate2 " + sellRate2);
//         }

//         //take initial balance from both reserves
//         let tokPreBalance1 = new BN(await token.balanceOf(reserve1.address));
//         let tokPreBalance2 = new BN(await token.balanceOf(reserve2.address));
//         let ethPreBalance1 = new BN(await Helper.getBalancePromise(reserve1.address));
//         let ethPreBalance2 = new BN(await Helper.getBalancePromise(reserve2.address));

//         //perform 20 trades
//         let minRate = 0;
//         let maxDestAmount = 90000;
//         let cumulativeGas = new BN(0);
//         for (let i = 0; i < numLoops; i++){
//             let txData = await network.tradeWithHint(user1, tokenAdd[tokenInd], amountTWei, ethAddress, user2, maxDestAmount,
//                         minRate, walletId, emptyHint, {from:networkProxy});
//             cumulativeGas = cumulativeGas.add(new BN(txData.receipt.gasUsed));
//         }
//         let avgGas = cumulativeGas.div(new BN(numLoops));
//         log("average gas usage " + numLoops + " sells. token to ether: " + avgGas);

//         //again take balance from both reserves
//         let tokPostBalance1 = new BN(await token.balanceOf(reserve1.address));
//         let tokPostBalance2 = new BN(await token.balanceOf(reserve2.address));
//         let ethPostBalance1 = new BN(await Helper.getBalancePromise(reserve1.address));
//         let ethPostBalance2 = new BN(await Helper.getBalancePromise(reserve2.address));

//         //check lower eth balance on both
//         assert(ethPostBalance2.lt(ethPreBalance2), "expected more ether here.");
//         assert(ethPostBalance1.lt(ethPreBalance1), "expected more ether here.");

//         //check higher token balance on both
//         assert(tokPostBalance1.gt(tokPreBalance1), "expected more token here.");
//         assert(tokPostBalance2.gt(tokPreBalance2), "expected more token here.");

//         await network.setParams(gasPrice, negligibleRateDiff);
//     });

//     it("should verify trade reverted when 0 source amount.", async function () {
//         let tokenInd = 0;
//         let token = tokens[tokenInd]; //choose some token
//         let amountWei = new BN(98000);
//         let minConversionRate = 0;

//         //perform trade
//         try {
//              await network.tradeWithHint(user1, ethAddress, 0, tokenAdd[tokenInd], user2, new BN(10).pow(new BN(21)),
//                 minConversionRate, walletId, emptyHint, {from:networkProxy, value:0});
//              assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }
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
//              await network.tradeWithHint(user1, ethAddress, amountWei, tokenAdd[tokenInd], user2, 2000,
//                 minConversionRate, walletId, emptyHint, {from:networkProxy, value:amountWei});
//              assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         //enable trade
//         await network.setEnable(true);

//         await network.tradeWithHint(user1, ethAddress, amountWei, tokenAdd[tokenInd], user2, 2000,
//                 minConversionRate, walletId, emptyHint, {from:networkProxy, value:amountWei});
//     });

//     it("should verify trade reverted when handle fee fails (due to different network address in burner).", async function () {
//         let tokenInd = 0;
//         let token = tokens[tokenInd]; //choose some token
//         let amountWei = 250;
//         let minConversionRate = 0;

//         let tempBurner = await FeeBurner.new(admin, tokenAdd[0], user1, ethToKncRatePrecision);

//         await network.setFeeBurner(tempBurner.address);

//         //perform trade
//         try {
//              await network.tradeWithHint(user1, ethAddress, amountWei, tokenAdd[tokenInd], user2, (new BN(10)).pow(new BN(21)),
//                 minConversionRate, walletId, emptyHint, {from:networkProxy, value:amountWei});
//              assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         let amountTwei = 1000;
//         await token.transfer(network.address, amountTwei)
//         try {
//              await network.tradeWithHint(user1, tokenAdd[tokenInd], amountTwei, ethAddress, user2, (new BN(10)).pow(new BN(21)),
//                 minConversionRate, walletId, emptyHint, {from:networkProxy});
//              assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         try {
//              await network.tradeWithHint(user1, tokenAdd[tokenInd], amountTwei, tokenAdd[1], user2, (new BN(10)).pow(new BN(21)),
//                 minConversionRate, walletId, emptyHint, {from:networkProxy});
//              assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         //enable trade
//         await network.setFeeBurner(feeBurner.address);
//     });

//     it("should verify trade reverted when handle fee fails (due to different network address in burner).", async function () {
//         let tokenInd = 0;
//         let token = tokens[tokenInd]; //choose some token
//         let amountWei = new BN(450);
//         let minConversionRate = 0;

//         let tempBurner = await FeeBurner.new(admin, tokenAdd[0], user1, ethToKncRatePrecision);

//         await network.setFeeBurner(tempBurner.address);

//         //perform trade
//         try {
//              await network.tradeWithHint(user1, ethAddress, amountWei, tokenAdd[tokenInd], user2, (new BN(10)).pow(new BN(21)),
//                 minConversionRate, walletId, emptyHint, {from:networkProxy, value:amountWei});
//              assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         let amountTwei = 4000;
//         await token.transfer(network.address, amountTwei)
//         try {
//              await network.tradeWithHint(user1, tokenAdd[tokenInd], amountTwei, ethAddress, user2, (new BN(10)).pow(new BN(21)),
//                 minConversionRate, walletId, emptyHint, {from:networkProxy});
//              assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         try {
//              await network.tradeWithHint(user1, tokenAdd[tokenInd], amountTwei, tokenAdd[1], user2, (new BN(10)).pow(new BN(21)),
//                 minConversionRate, walletId, emptyHint, {from:networkProxy});
//              assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         //enable trade
//         await network.setFeeBurner(feeBurner.address);
//     });

//     it("should verify trade reverted when hint size no as expected (0 or 4 bytes)", async() => {
//         let tokenInd = 0;
//         let token = tokens[tokenInd]; //choose some token
//         let amountWei = new BN(150);
//         let minConversionRate = 0;

//         let hint = "PERMM";
//         let hintBytes32 = web3.utils.fromAscii(hint);

//         //perform trade
//         try {
//              await network.tradeWithHint(user1, ethAddress, amountWei, tokenAdd[tokenInd], user2, (new BN(10)).pow(new BN(21)),
//                 minConversionRate, walletId, hintBytes32, {from:networkProxy, value:amountWei});
//              assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }
//     })

//     it("should verify trade reverted when different network address in reserve.", async function () {
//         let tokenInd = 0;
//         let token = tokens[tokenInd]; //choose some token
//         let amountWei = new BN(30);
//         let minConversionRate = 0;
//         let wrongNetworkAddress = accounts[6];

//         await reserve1.setContracts(wrongNetworkAddress, pricing1.address, zeroAddress);
//         await reserve2.disableTrade({from: alerter});
//         await reserve3.disableTrade({from: alerter});

//         try {
//              await network.tradeWithHint(user1, ethAddress, amountWei, tokenAdd[tokenInd], user2, (new BN(10)).pow(new BN(21)),
//                 minConversionRate, walletId, emptyHint, {from:networkProxy, value:amountWei});
//              assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         let amountTwei = 3000;
//         await token.transfer(network.address, amountTwei)
//         try {
//              await network.tradeWithHint(user1, tokenAdd[tokenInd], amountTwei, ethAddress, user2, (new BN(10)).pow(new BN(21)),
//                 minConversionRate, walletId, emptyHint, {from:networkProxy});
//              assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         try {
//              await network.tradeWithHint(user1, tokenAdd[tokenInd], amountTwei, tokenAdd[1], user2, (new BN(10)).pow(new BN(21)),
//                 minConversionRate, walletId, emptyHint, {from:networkProxy});
//              assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         //enable trade
//         await reserve1.setContracts(network.address, pricing1.address, zeroAddress);
//         await reserve2.enableTrade({from:admin});
//         await reserve3.enableTrade({from:admin});
//     });

//     it("should verify trade reverted when different network address in reserve.", async function () {
//         let tokenInd = 1;
//         let token = tokens[tokenInd]; //choose some token
//         let amountWei = 30;
//         let minConversionRate = 0;
//         let wrongNetworkAddress = accounts[6];

//         await reserve1.setContracts(wrongNetworkAddress, pricing1.address, zeroAddress);
//         await reserve2.disableTrade({from: alerter});
//         await reserve3.disableTrade({from: alerter});

//         try {
//             await network.tradeWithHint(user1, ethAddress, amountWei, tokenAdd[tokenInd], user2, (new BN(10)).pow(new BN(21)),
//                minConversionRate, walletId, emptyHint, {from:networkProxy, value:amountWei});
//             assert(false, "throw was expected in line above.")
//         } catch(e){
//            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         let amountTwei = 1500;
//         await token.transfer(network.address, amountTwei)
//         try {
//             await network.tradeWithHint(user1, tokenAdd[tokenInd], amountTwei, ethAddress, user2, (new BN(10)).pow(new BN(21)),
//                minConversionRate, walletId, emptyHint, {from:networkProxy});
//             assert(false, "throw was expected in line above.")
//         } catch(e){
//            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         try {
//             await network.tradeWithHint(user1, tokenAdd[tokenInd], amountTwei, tokenAdd[1], user2, (new BN(10)).pow(new BN(21)),
//                minConversionRate, walletId, emptyHint, {from:networkProxy});
//             assert(false, "throw was expected in line above.")
//         } catch(e){
//            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         //enable trade
//         await reserve1.setContracts(network.address, pricing1.address, zeroAddress);
//         await reserve2.enableTrade({from:admin});
//         await reserve3.enableTrade({from:admin});
//     });

//     it("should verify trade reverted when sender isn't networkProxy.", async function () {
//         let tokenInd = 0;
//         let token = tokens[tokenInd]; //choose some token
//         let amountWei = new BN(10000);
//         let minConversionRate = 0;

//         //perform trade
//         try {
//              await network.tradeWithHint(user1, ethAddress, amountWei, tokenAdd[tokenInd], user2, 2000,
//                 minConversionRate, walletId, emptyHint, {from:user1, value:amountWei});
//              assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         // same trade from network proxy
//         await network.tradeWithHint(user1, ethAddress, amountWei, tokenAdd[tokenInd], user2, 2000,
//                 minConversionRate, walletId, emptyHint, {from:networkProxy, value:amountWei});
//     });

//     it("should verify buy reverted when bad ether amount is sent.", async function () {
//         let tokenInd = 0;
//         let token = tokens[tokenInd]; //choose some token
//         let amountWei = 83000;
//         let minConversionRate = 0;

//         //perform trade
//         try {
//              await network.tradeWithHint(user1, ethAddress, amountWei, tokenAdd[tokenInd], user2, 2000,
//                 minConversionRate, walletId, emptyHint, {from:networkProxy, value:amountWei*1-1});
//              assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         await network.tradeWithHint(user1, ethAddress, amountWei, tokenAdd[tokenInd], user2, 2000,
//                 minConversionRate, walletId, emptyHint, {from:networkProxy, value:amountWei});
//     });

//     it("should verify sell reverted when not enough token allowance.", async function () {
//         let tokenInd = 1;
//         let token = tokens[tokenInd]; //choose some token
//         let amountTWei = new BN(1501);

//         // transfer funds to user and approve funds to network
//         let networkBalance = await token.balanceOf(network.address);
//         await token.transfer(network.address, amountTWei.sub(networkBalance).sub(new BN(1)));

//         try {
//             await network.tradeWithHint(user1, tokenAdd[tokenInd], amountTWei, ethAddress, user2, 50000, 0, walletId, emptyHint, {from:networkProxy});
//             assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         //add missing allowance
//         await token.transfer(network.address, 1);
// //        await token.approve(network.address, amountTWei*1, {from:user1});

//         //perform same trade
//         await network.tradeWithHint(user1, tokenAdd[tokenInd], amountTWei, ethAddress, user2, 50000, 0, walletId, emptyHint, {from:networkProxy});
//     });

//     it("should verify sell reverted when sent with ether value.", async function () {
//         let tokenInd = 1;
//         let token = tokens[tokenInd]; //choose some token
//         let amountTWei = 15*1;

//         // transfer funds to user and approve funds to network
//         await token.transfer(network.address, amountTWei*1);
// //        await token.approve(network.address, amountTWei*1, {from:user1})

//         try {
//             await network.tradeWithHint(user1, tokenAdd[tokenInd], amountTWei, ethAddress, user2, 5000, 0,
//                 walletId, emptyHint, {from:networkProxy, value: 10});
//             assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         //perform same trade
//         await network.tradeWithHint(user1, tokenAdd[tokenInd], amountTWei, ethAddress, user2, 5000, 0, walletId, emptyHint, {from:networkProxy, value: 0});
//     });

//     it("should verify trade reverted when dest amount (actual amount) is 0.", async function () {
//         let tokenInd = 3;
//         let token = tokens[tokenInd]; //choose some token
//         let amountTweiLow = 1;
//         let amountTWeiHi = 80;

//         // transfer funds to user and approve funds to network
//         await token.transfer(network.address, amountTWeiHi);
// //        await token.approve(network.address, amountTWeiHi, {from:user1})

//         let sellRate1 = await reserve1.getConversionRate(tokenAdd[tokenInd], ethAddress, amountTweiLow, currentBlock + 10);
//         rates = await network.getExpectedRate(tokenAdd[tokenInd], ethAddress, amountTweiLow);
// //        log("rates = " + rates[0])
//         minRate = rates[1];

//         //try with low amount Twei
//         try {
//             await network.tradeWithHint(user1, tokenAdd[tokenInd], amountTweiLow, ethAddress, user2, 3000, minRate,
//                     walletId, emptyHint, {from:networkProxy});
//             assert(false, "throw was expected in line above.")
//         }
//         catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         //perform same trade with higher value to see success
//         let destAmount = await network.tradeWithHint(user1, tokenAdd[tokenInd], amountTWeiHi, ethAddress, user2, 3000,
//             minRate, walletId, emptyHint, {from:networkProxy});
//     });

//     it("should verify trade reverted (token to token) when dest amount (actual amount) is 0.", async function () {
//         let tokenSrcInd = 3;
//         let tokenDestInd = 2;
//         let token = tokens[tokenSrcInd]; //choose some token
//         let amountTweiLow = 1;
//         let amountTWeiHi = 600;

//         // transfer funds to user and approve funds to network
//         await token.transfer(network.address, amountTWeiHi);
// //        await token.approve(network.address, amountTWeiHi, {from:user1})

//         rates = await network.getExpectedRate(tokenAdd[tokenSrcInd], tokenAdd[tokenDestInd], amountTweiLow);
// //        log("rates = " + rates[0] + " min rate " + rates[1])
//         minRate = rates[1];

//         //try with low amount Twei
//         try {
//             await network.tradeWithHint(user1, tokenAdd[tokenSrcInd], amountTweiLow, tokenAdd[tokenDestInd], user2, 3000, minRate,
//                     walletId, emptyHint, {from:networkProxy});
//             assert(false, "throw was expected in line above.")
//         }
//         catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         //perform same trade with higher value to see success
//         await network.tradeWithHint(user1, tokenAdd[tokenSrcInd], amountTWeiHi, tokenAdd[tokenDestInd], user2, 300000, minRate,
//                             walletId, emptyHint, {from:networkProxy});
//     });

//     it("should verify for qty 0 return rate is 0", async function () {
//         let tokenSrcInd = 3;
//         let tokenDestInd = 2;
//         let token = tokens[tokenSrcInd]; //choose some token
//         let amountTweiLow = 1;
//         let amountTWeiHi = 600;

//         // transfer funds to user and approve funds to network
//         await token.transfer(network.address, amountTWeiHi);
// //        await token.approve(network.address, amountTWeiHi, {from:user1})

//         rates = await network.getExpectedRate(tokenAdd[tokenSrcInd], tokenAdd[tokenDestInd], 0);
// //        Helper.assertEqual(0, rates[0]);
//     });

//     it("verify when whitelist contract isn't set. user gets 'infinte' cap", async() => {
//         let userCap = await network.getUserCapInWei(user1);
//         Helper.assertEqual(userCap, (capWei * sgdToEthRate));

//         await network.setWhiteList(zeroAddress);

//         let infiniteCap = (new BN(2)).pow(new BN(255));
//         userCap = await network.getUserCapInWei(user1);
//         Helper.assertEqual(userCap, infiniteCap);

//         await network.setWhiteList(whiteList.address);
//     });

//     it("verify getUserCapInTokenWei always reverts", async() => {

//         try {
//             await network.getUserCapInTokenWei(user1, tokens[0].address);
//             assert(false, "throw was expected in line above.")
//         }         catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }
//     })

//     it("should test listing and unlisting pairs. compare to listed pairs API.", async function () {
//         let tokenInd = 2;
//         let tokenAddress = tokenAdd[tokenInd];

//         let reserveGet = await network.reservesPerTokenDest(tokenAddress, 0);
//         Helper.assertEqual(reserve1.address, reserveGet);
//         reserveGet = await network.reservesPerTokenDest(tokenAddress, 1);
//         Helper.assertEqual(reserve2.address, reserveGet);
//         reserveGet = await network.reservesPerTokenSrc(tokenAddress, 0);
//         Helper.assertEqual(reserve1.address, reserveGet);
//         reserveGet = await network.reservesPerTokenSrc(tokenAddress, 1);
//         Helper.assertEqual(reserve2.address, reserveGet);

//         //unlist reserve 1 both buy and sell.
//         await network.listPairForReserve(reserve1.address, tokenAdd[tokenInd], true, true, false, {from: operator});
//         reserveGet = await network.reservesPerTokenDest(tokenAddress, 0);
//         Helper.assertEqual(reserve2.address, reserveGet);

//         try {
//             reserveGet = await network.reservesPerTokenDest(tokenAddress, 1);
//             assert(false, "throw was expected in line above.")
//         }
//         catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         reserveGet = await network.reservesPerTokenSrc(tokenAddress, 0);
//         Helper.assertEqual(reserve2.address, reserveGet);

//         try {
//             reserveGet = await network.reservesPerTokenSrc(tokenAddress, 1);
//             assert(false, "throw was expected in line above.")
//         }
//         catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         //unlist reserve2 only eth to token
//         await network.listPairForReserve(reserve2.address, tokenAdd[tokenInd], true, false, false, {from: operator});

//         // here non listed
//         try {
//             reserveGet = await network.reservesPerTokenDest(tokenAddress, 1);
//             assert(false, "throw was expected in line above.")
//         }
//         catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         //here no change
//         reserveGet = await network.reservesPerTokenSrc(tokenAddress, 0);
//         Helper.assertEqual(reserve2.address, reserveGet);

//         try {
//             reserveGet = await network.reservesPerTokenSrc(tokenAddress, 1);
//             assert(false, "throw was expected in line above.")
//         }
//         catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         //list back reserve 2 buy and sell. see not added twice
//         await network.listPairForReserve(reserve2.address, tokenAdd[tokenInd], true, true, true, {from: operator});
//         reserveGet = await network.reservesPerTokenDest(tokenAddress, 0);
//         Helper.assertEqual(reserve2.address, reserveGet);

//         try {
//             reserveGet = await network.reservesPerTokenDest(tokenAddress, 1);
//             assert(false, "throw was expected in line above.")
//         }
//         catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         reserveGet = await network.reservesPerTokenSrc(tokenAddress, 0);
//         Helper.assertEqual(reserve2.address, reserveGet);

//         try {
//             reserveGet = await network.reservesPerTokenSrc(tokenAddress, 1);
//             assert(false, "throw was expected in line above.")
//         }
//         catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         //list back reserve 1 token to eth
//         await network.listPairForReserve(reserve1.address, tokenAdd[tokenInd], false, true, true, {from: operator});
//         reserveGet = await network.reservesPerTokenDest(tokenAddress, 0);
//         Helper.assertEqual(reserve2.address, reserveGet);

//         try {
//             reserveGet = await network.reservesPerTokenDest(tokenAddress, 1);
//             assert(false, "throw was expected in line above.")
//         }
//         catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         reserveGet = await network.reservesPerTokenSrc(tokenAddress, 0);
//         Helper.assertEqual(reserve2.address, reserveGet);
//         reserveGet = await network.reservesPerTokenSrc(tokenAddress, 1);
//         Helper.assertEqual(reserve1.address, reserveGet);

//         try {
//             reserveGet = await network.reservesPerTokenSrc(tokenAddress, 2);
//             assert(false, "throw was expected in line above.")
//         }
//         catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         //list back reserve 1 eth to token
//         await network.listPairForReserve(reserve1.address, tokenAdd[tokenInd], true, false, true, {from: operator});
//         reserveGet = await network.reservesPerTokenDest(tokenAddress, 0);
//         Helper.assertEqual(reserve2.address, reserveGet);
//         reserveGet = await network.reservesPerTokenDest(tokenAddress, 1);
//         Helper.assertEqual(reserve1.address, reserveGet);

//         try {
//             reserveGet = await network.reservesPerTokenSrc(tokenAddress, 2);
//             assert(false, "throw was expected in line above.")
//         }
//         catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         reserveGet = await network.reservesPerTokenSrc(tokenAddress, 0);
//         Helper.assertEqual(reserve2.address, reserveGet);
//         reserveGet = await network.reservesPerTokenSrc(tokenAddress, 1);
//         Helper.assertEqual(reserve1.address, reserveGet);

//         try {
//             reserveGet = await network.reservesPerTokenSrc(tokenAddress, 2);
//             assert(false, "throw was expected in line above.")
//         }
//         catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }
//     });

//     it("should test getter for reserves rates, showReservesRate.", async function () {
//         let tokenInd = 2;
//         let tokenAddress = tokenAdd[tokenInd];
//         let amount = 1000;

//         let reserve1BuyRate = await reserve1.getConversionRate(ethAddress, tokenAddress, amount, currentBlock)
// //        log("reserve1BuyRate " + reserve1BuyRate.toString())
//         let reserve2BuyRate = await reserve2.getConversionRate(ethAddress, tokenAddress, amount, currentBlock)
// //        log("reserve2BuyRate " + reserve2BuyRate)
//         let reserve1SellRate = await reserve1.getConversionRate(tokenAddress, ethAddress, amount, currentBlock)
// //        log("reserve1SellRate " + reserve1SellRate.toString())
//         let reserve2SellRate = await reserve2.getConversionRate(tokenAddress, ethAddress, amount, currentBlock)
// //        log("reserve2SellRate " + reserve2SellRate.toString())

//         let ratesReserves = await network.getReservesRates(tokenAddress, 0);
// //        log("ratesReserves[0][0]" + ratesReserves[0][0])
// //        log("ratesReserves[0][1]" + ratesReserves[0][1].toString())
// //        log("ratesReserves[1][0]" + ratesReserves[1][0].toString())
// //        log("rates[1][1]" + ratesReserves[1][1].toString())

//         Helper.assertEqual(ratesReserves[0][0].toString(), reserve2.address)
//         Helper.assertEqual(ratesReserves[0][1].toString(), reserve1.address)
//         Helper.assertEqual(ratesReserves[1][0].toString(), reserve2BuyRate.toString(), "rate should be > 0")
//         Helper.assertEqual(ratesReserves[1][1].toString(), reserve1BuyRate.toString(), "rate should be > 0")
//         Helper.assertEqual(ratesReserves[2][0].toString(), reserve2.address)
//         Helper.assertEqual(ratesReserves[2][1].toString(), reserve1.address)
//         Helper.assertEqual(ratesReserves[3][0].toString(), reserve2SellRate.toString(), "rate should be > 0")
//         Helper.assertEqual(ratesReserves[3][1].toString(), reserve1SellRate.toString(), "rate should be > 0")

//         //disable token trade on 1 reserve, see rate affect
//         await pricing1.disableTokenTrade(tokenAddress, {from: alerter});

//         ratesReserves = await network.getReservesRates(tokenAddress, 0);

//         Helper.assertEqual(ratesReserves[0][0].toString(), reserve2.address)
//         Helper.assertEqual(ratesReserves[0][1].toString(), reserve1.address)
//         Helper.assertEqual(ratesReserves[1][0].toString(), reserve2BuyRate.toString(), "rate should be > 0")
//         Helper.assertEqual(ratesReserves[1][1].toString(), 0, "rate should be 0")
//         Helper.assertEqual(ratesReserves[2][0].toString(), reserve2.address)
//         Helper.assertEqual(ratesReserves[2][1].toString(), reserve1.address)
//         Helper.assertEqual(ratesReserves[3][0].toString(), reserve2SellRate.toString(), "rate should be > 0")
//         Helper.assertEqual(ratesReserves[3][1].toString(), 0, "rate should be 0")

//         await pricing2.disableTokenTrade(tokenAddress, {from: alerter});

//         ratesReserves = await network.getReservesRates(tokenAddress, 0);

//         Helper.assertEqual(ratesReserves[0][0].toString(), reserve2.address)
//         Helper.assertEqual(ratesReserves[0][1].toString(), reserve1.address)
//         Helper.assertEqual(ratesReserves[1][0].toString(), 0, "rate should be 0")
//         Helper.assertEqual(ratesReserves[1][1].toString(), 0, "rate should be 0")
//         Helper.assertEqual(ratesReserves[2][0].toString(), reserve2.address)
//         Helper.assertEqual(ratesReserves[2][1].toString(), reserve1.address)
//         Helper.assertEqual(ratesReserves[3][0].toString(), 0, "rate should be 0")
//         Helper.assertEqual(ratesReserves[3][1].toString(), 0, "rate should be 0")


//         await pricing1.enableTokenTrade(tokenAddress, {from: admin});
//         await pricing2.enableTokenTrade(tokenAddress, {from: admin});

//         ratesReserves = await network.getReservesRates(tokenAddress, 0);

//         Helper.assertEqual(ratesReserves[0][0].toString(), reserve2.address)
//         Helper.assertEqual(ratesReserves[0][1].toString(), reserve1.address)
//         Helper.assertEqual(ratesReserves[1][0].toString(), reserve2BuyRate.toString(), "rate should be > 0")
//         Helper.assertEqual(ratesReserves[1][1].toString(), reserve1BuyRate.toString(), "rate should be > 0")
//         Helper.assertEqual(ratesReserves[2][0].toString(), reserve2.address)
//         Helper.assertEqual(ratesReserves[2][1].toString(), reserve1.address)
//         Helper.assertEqual(ratesReserves[3][0].toString(), reserve2SellRate.toString(), "rate should be > 0")
//         Helper.assertEqual(ratesReserves[3][1].toString(), reserve1SellRate.toString(), "rate should be > 0")
//     });

//     it("should test getter for reserves rates, see amount function parameter is used.", async function () {
//         let tokenInd = 2;
//         let tokenAddress = tokenAdd[tokenInd];
//         let amount = 1000;

//         let reserve1BuyRate = await reserve1.getConversionRate(ethAddress, tokenAddress, amount, currentBlock)
// //        log("reserve1BuyRate " + reserve1BuyRate.toString())
//         let reserve2BuyRate = await reserve2.getConversionRate(ethAddress, tokenAddress, amount, currentBlock)
// //        log("reserve2BuyRate " + reserve2BuyRate)
//         let reserve1SellRate = await reserve1.getConversionRate(tokenAddress, ethAddress, amount, currentBlock)
// //        log("reserve1SellRate " + reserve1SellRate.toString())
//         let reserve2SellRate = await reserve2.getConversionRate(tokenAddress, ethAddress, amount, currentBlock)
//         let ratesReserves = await network.getReservesRates(tokenAddress, 0);

//         Helper.assertEqual(ratesReserves[1][0].toString(), reserve2BuyRate.toString(), "rate should be > 0")
//         Helper.assertEqual(ratesReserves[1][1].toString(), reserve1BuyRate.toString(), "rate should be > 0")
//         Helper.assertEqual(ratesReserves[3][0].toString(), reserve2SellRate.toString(), "rate should be > 0")
//         Helper.assertEqual(ratesReserves[3][1].toString(), reserve1SellRate.toString(), "rate should be > 0")

//          // this amount is not supported so should result in 0 rates
//         ratesReserves = await network.getReservesRates(tokenAddress, (new BN(10)).pow(new BN(19)));

//         Helper.assertEqual(ratesReserves[1][0].toString(), 0, "rate should be 0")
//         Helper.assertEqual(ratesReserves[1][1].toString(), 0, "rate should be 0")
//         Helper.assertEqual(ratesReserves[3][0].toString(), 0, "rate should be 0")
//         Helper.assertEqual(ratesReserves[3][1].toString(), 0, "rate should be 0")
//     });

//     it("should test can't list pairs if reserve not added.", async function () {
//         //here list should fail
//         try {
//             await network.listPairForReserve(reserve3.address, uniqueToken.address, true, true, true, {from: operator});
//             assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         await network.addReserve(reserve3.address, false, {from: operator});
//         await network.listPairForReserve(reserve3.address, uniqueToken.address, true, true, true, {from: operator});

//         reserveGet = await network.reservesPerTokenSrc(uniqueToken.address, 0);
//         Helper.assertEqual(reserve3.address, reserveGet);
//     });

//     it("should test can't list token that its approve API fails.", async function () {
//         let failingToken = await TestTokenFailing.new("failing tok", "fail", 14);

//         //here list should revert
//         try {
//             await network.listPairForReserve(reserve3.address, failingToken.address, true, true, true, {from: operator});
//             assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         // remove listing should revert
//         try {
//             await network.listPairForReserve(reserve3.address, failingToken.address, false, true, false, {from: operator});
//             assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }
//     });

//     it("should test listing and unlisting new pair for new reserve. see rate changes. token to eth. as expected.", async function () {
//         let testedToken = uniqueToken.address;
//         let amount = 1231;

//         currentBlock = await Helper.getCurrentBlock();
//         //first see get rate from reserve gives rates
//         let rate = await reserve3.getConversionRate(ethAddress, testedToken, amount, currentBlock + 10);
//         assert(rate > 0);
//         rate = await reserve3.getConversionRate(testedToken, ethAddress, (amount), currentBlock + 10);
//         assert(rate > 0);

//         //first unlist token
//         await network.listPairForReserve(reserve3.address, uniqueToken.address, true, true, false, {from: operator});

//         let rates = await network.getExpectedRate(ethAddress, testedToken, amount);
//         Helper.assertEqual(0, rates[0]);
//         rates = await network.getExpectedRate(testedToken, ethAddress, amount);
//         Helper.assertEqual(0, rates[0]);

//         //list token. buy (eth to token)
//         await network.listPairForReserve(reserve3.address, testedToken, true, false, true, {from: operator});
//         rates = await network.getExpectedRate(ethAddress, testedToken, amount);
//         assert(rates[0] > 0);
//         rates = await network.getExpectedRate(testedToken, ethAddress, amount);
//         assert(rates[0] == 0);

//         //list token. sell
//         await network.listPairForReserve(reserve3.address, testedToken, false, true, true, {from: operator});
//         rates = await network.getExpectedRate(ethAddress, testedToken, amount);
//         assert(rates[0] > 0);
//         rates = await network.getExpectedRate(testedToken, ethAddress, amount);
//         assert(rates[0] > 0);

//         //unlist token. buy
//         await network.listPairForReserve(reserve3.address, testedToken, true, false, false, {from: operator});
//         rates = await network.getExpectedRate(ethAddress, testedToken, amount);
//         assert(rates[0] == 0);
//         rates = await network.getExpectedRate(testedToken, ethAddress, amount);
//         assert(rates[0] > 0);

//         //unlist token. sell
//         await network.listPairForReserve(reserve3.address, testedToken, false, true, false, {from: operator});
//         rates = await network.getExpectedRate(ethAddress, testedToken, amount);
//         assert(rates[0] == 0);
//         rates = await network.getExpectedRate(testedToken, ethAddress, amount);
//         assert(rates[0] == 0);
//     });

//     it("should test listing and unlisting new pair for new reserve. see rate changes. token to token. as expected.", async function () {
//         let listedToken = tokens[1];
//         let testedToken = uniqueToken.address;
//         let amount = 430;
//         let maxDestAmount = (new BN(10)).pow(new BN(18));
//         let manyTokens = (new BN(10)).pow(new BN(8));

//         currentBlock = await Helper.getCurrentBlock();
//         //first see get rate from reserve gives rates
//         let rate = await reserve3.getConversionRate(ethAddress, testedToken, amount, currentBlock + 10);
//         assert(rate > 0);
//         rate = await reserve3.getConversionRate(testedToken, ethAddress, amount, currentBlock + 10);
//         assert(rate > 0);

//         //send user 1 tokens from both types and approve network
//         await uniqueToken.transfer(user1, manyTokens);
//         await listedToken.transfer(user1, manyTokens);
//         await uniqueToken.approve(networkProxy, manyTokens, {from: user1})
//         await listedToken.approve(networkProxy, manyTokens, {from: user1})

//         let user1UniqueBalance = new BN(await uniqueToken.balanceOf(user1));
//         let user1ListedBalance = new BN(await listedToken.balanceOf(user1));
//         let user2UniqueBalance = new BN(await uniqueToken.balanceOf(user2));
//         let user2ListedBalance = new BN(await listedToken.balanceOf(user2));

//         //first unlist token
//         await network.listPairForReserve(reserve3.address, uniqueToken.address, true, true, false, {from: operator});
//         let rates = await network.getExpectedRate(listedToken.address, testedToken, amount);
//         Helper.assertEqual(0, rates[0]);
//         rates = await network.getExpectedRate(testedToken, listedToken.address, amount);
//         Helper.assertEqual(0, rates[0]);

//         // trade both sides should revert
//         try {
//              await network.tradeWithHint(user1, listedToken.address, amount, uniqueToken.address, user2, maxDestAmount,
//                 0 ,walletId, emptyHint, {from:networkProxy});
//              assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }
//         try {
//              await network.tradeWithHint(user1, uniqueToken.address, amount, listedToken.address, user2, maxDestAmount,
//                 0 ,walletId, emptyHint, {from:networkProxy});
//              assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         let user1UniqueBalanceAfter = new BN(await uniqueToken.balanceOf(user1));
//         let user1ListedBalanceAfter = new BN(await listedToken.balanceOf(user1));
//         let user2UniqueBalanceAfter = new BN(await uniqueToken.balanceOf(user2));
//         let user2ListedBalanceAfter = new BN(await listedToken.balanceOf(user2));
//         Helper.assertEqual(user1UniqueBalanceAfter, user1UniqueBalance);
//         Helper.assertEqual(user2UniqueBalanceAfter, user2UniqueBalance);
//         Helper.assertEqual(user1ListedBalanceAfter, user1ListedBalance);
//         Helper.assertEqual(user2ListedBalanceAfter, user2ListedBalance);
//         user2UniqueBalance = user2UniqueBalanceAfter;
//         user1ListedBalance = user1ListedBalanceAfter;
//         user1UniqueBalance = user1UniqueBalanceAfter;
//         user2ListedBalance = user2ListedBalanceAfter;

//         //list token. buy (eth to token)
//         await network.listPairForReserve(reserve3.address, testedToken, true, false, true, {from: operator});
//         rates = await network.getExpectedRate(listedToken.address, testedToken, amount);
//         assert(rates[0] > 0);
//         rates = await network.getExpectedRate(testedToken, listedToken.address, amount);
//         assert(rates[0] == 0);

//         // trade
//         await listedToken.transferFrom(user1, network.address, amount, {from:networkProxy});
//         await network.tradeWithHint(user1, listedToken.address, amount, uniqueToken.address, user2, maxDestAmount,
//                 emptyHint ,walletId, emptyHint, {from:networkProxy});
//         try {
//              await network.tradeWithHint(user1, uniqueToken.address, amount, listedToken.address, user2, maxDestAmount,
//                 emptyHint ,walletId, emptyHint, {from:networkProxy});
//              assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }


//         user1UniqueBalanceAfter = new BN(await uniqueToken.balanceOf(user1));
//         user1ListedBalanceAfter = new BN(await listedToken.balanceOf(user1));
//         user2UniqueBalanceAfter = new BN(await uniqueToken.balanceOf(user2));
//         user2ListedBalanceAfter = new BN(await listedToken.balanceOf(user2));
//         Helper.assertEqual(user1UniqueBalanceAfter, user1UniqueBalance);
//         assert(user2UniqueBalanceAfter > user2UniqueBalance);
//         assert(user1ListedBalanceAfter.lt(user1ListedBalance), "balance before: " + user1ListedBalance + " balance after: " + user1ListedBalanceAfter);
//         Helper.assertEqual(user2ListedBalanceAfter, user2ListedBalance);
//         user2UniqueBalance = user2UniqueBalanceAfter;
//         user1ListedBalance = user1ListedBalanceAfter;

//         //list token. sell
//         await network.listPairForReserve(reserve3.address, testedToken, false, true, true, {from: operator});
//         rates = await network.getExpectedRate(listedToken.address, testedToken, amount);
//         assert(rates[0] > 0);
//         rates = await network.getExpectedRate(testedToken, listedToken.address, amount);
//         assert(rates[0] > 0);

//         // trade both sides should succeed
//         await listedToken.transferFrom(user1, network.address, amount, {from:networkProxy});
//         await network.tradeWithHint(user1, listedToken.address, amount, uniqueToken.address, user2, maxDestAmount,
//                 0 ,walletId, emptyHint, {from:networkProxy});
//         await uniqueToken.transferFrom(user1, network.address, amount, {from:networkProxy});
//         await network.tradeWithHint(user1, uniqueToken.address, amount, listedToken.address, user2, maxDestAmount,
//                 0 ,walletId, emptyHint, {from:networkProxy});


//         user1UniqueBalanceAfter = new BN(await uniqueToken.balanceOf(user1));
//         user1ListedBalanceAfter = new BN(await listedToken.balanceOf(user1));
//         user2UniqueBalanceAfter = new BN(await uniqueToken.balanceOf(user2));
//         user2ListedBalanceAfter = new BN(await listedToken.balanceOf(user2));
//         Helper.assertLesser(user1UniqueBalanceAfter,user1UniqueBalance, "unexpected user 1 balance change");
//         Helper.assertGreater(user2UniqueBalanceAfter, user2UniqueBalance, "unexpected user 2 balance change");
//         Helper.assertLesser(user1ListedBalanceAfter, user1ListedBalance, "unexpected user 1 listed balance change");
//         Helper.assertGreater(user2ListedBalanceAfter, user2ListedBalance, "unexpected user 2 listed balance change");
//         user2UniqueBalance = user2UniqueBalanceAfter;
//         user1ListedBalance = user1ListedBalanceAfter;
//         user1UniqueBalance = user1UniqueBalanceAfter;
//         user2ListedBalance = user2ListedBalanceAfter;

//         //unlist token. buy
//         await network.listPairForReserve(reserve3.address, testedToken, true, false, false, {from: operator});
//         rates = await network.getExpectedRate(listedToken.address, testedToken, amount);
//         assert(rates[0] == 0);
//         rates = await network.getExpectedRate(testedToken, listedToken.address, amount);
//         assert(rates[0] > 0);

//         // trade both sides
//         await uniqueToken.transferFrom(user1, network.address, amount, {from:networkProxy});
//         await network.tradeWithHint(user1, uniqueToken.address, amount, listedToken.address, user2, maxDestAmount,
//             0 ,walletId, emptyHint, {from:networkProxy});
//         try {
//             await network.tradeWithHint(user1, listedToken.address, amount, uniqueToken.address, user2, maxDestAmount,
//                 0 ,walletId, emptyHint, {from:networkProxy});
//             assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }


//         user1UniqueBalanceAfter = new BN(await uniqueToken.balanceOf(user1));
//         user1ListedBalanceAfter = new BN(await listedToken.balanceOf(user1));
//         user2UniqueBalanceAfter = new BN(await uniqueToken.balanceOf(user2));
//         user2ListedBalanceAfter = new BN(await listedToken.balanceOf(user2));
//         Helper.assertLesser(user1UniqueBalanceAfter, user1UniqueBalance, "unexpected user 1 balance change");
//         Helper.assertEqual(user2UniqueBalanceAfter, user2UniqueBalance, "unexpected user 2 balance change");
//         Helper.assertEqual(user1ListedBalanceAfter, user1ListedBalance, "unexpected user 1 balance change");
//         Helper.assertGreater(user2ListedBalanceAfter, user2ListedBalance, "unexpected user 2 listed balance change");
//         user2UniqueBalance = user2UniqueBalanceAfter;
//         user1ListedBalance = user1ListedBalanceAfter;
//         user1UniqueBalance = user1UniqueBalanceAfter;
//         user2ListedBalance = user2ListedBalanceAfter;

//         //unlist token. sell
//         await network.listPairForReserve(reserve3.address, testedToken, false, true, false, {from: operator});
//         rates = await network.getExpectedRate(listedToken.address, testedToken, amount);
//         assert(rates[0] == 0);
//         rates = await network.getExpectedRate(testedToken, listedToken.address, amount);
//         assert(rates[0] == 0);

//         // trade both sides should revert
//         try {
//              await network.tradeWithHint(user1, listedToken.address, amount, uniqueToken.address, user2, maxDestAmount,
//                 0 ,walletId, emptyHint, {from:networkProxy});
//              assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }
//         try {
//              await network.tradeWithHint(user1, uniqueToken.address, amount, listedToken.address, user2, maxDestAmount,
//                 0 ,walletId, emptyHint, {from:networkProxy});
//              assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }


//         user1UniqueBalanceAfter = new BN(await uniqueToken.balanceOf(user1));
//         user1ListedBalanceAfter = new BN(await listedToken.balanceOf(user1));
//         user2UniqueBalanceAfter = new BN(await uniqueToken.balanceOf(user2));
//         user2ListedBalanceAfter = new BN(await listedToken.balanceOf(user2));
//         Helper.assertEqual(user1UniqueBalanceAfter, user1UniqueBalance);
//         Helper.assertEqual(user2UniqueBalanceAfter, user2UniqueBalance);
//         Helper.assertEqual(user1ListedBalanceAfter, user1ListedBalance);
//         Helper.assertEqual(user2ListedBalanceAfter, user2ListedBalance);
//     });

//     it("should verify buy reverted when unlisting pair.", async function () {
//         let tokenInd = 3;
//         let token = tokens[tokenInd]; //choose some token
//         let amountWei = 150 * 1;
//         let minConversionRate = 0;

//         //unlist and verify trade reverted.
//         await network.listPairForReserve(reserve1.address, tokenAdd[tokenInd], true, false, false, {from: operator});
//         await network.listPairForReserve(reserve2.address, tokenAdd[tokenInd], true, false, false, {from: operator});

//         //perform trade
//         try {
//              await network.tradeWithHint(user1, ethAddress, amountWei, tokenAdd[tokenInd], user2, 2000,
//                 minConversionRate, walletId, emptyHint, {from:networkProxy, value:amountWei});
//              assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         //list back
//         await network.listPairForReserve(reserve1.address, tokenAdd[tokenInd], true, false, true, {from: operator});
//         await network.listPairForReserve(reserve2.address, tokenAdd[tokenInd], true, false, true, {from: operator});

//         await network.tradeWithHint(user1, ethAddress, amountWei, tokenAdd[tokenInd], user2, 2000,
//                 minConversionRate, walletId, emptyHint, {from:networkProxy, value:amountWei});
//     });

//     it("should verify sell reverted when unlisting pair.", async function () {
//         let tokenInd = 1;
//         let token = tokens[tokenInd]; //choose some token
//         let amountTWei = 30* 1;
//         let minConversionRate = 0;
//         let maxDestAmount = 1000;

//         // transfer funds to user and approve funds to network
//         await token.transfer(network.address, amountTWei);
// //        await token.approve(network.address, amountTWei*2, {from:user1});

//         //unlist and verify trade reverted.
//         await network.listPairForReserve(reserve1.address, tokenAdd[tokenInd], false, true, false, {from: operator});
//         await network.listPairForReserve(reserve2.address, tokenAdd[tokenInd], false, true, false, {from: operator});

//         //perform trade
//         try {
//              await network.tradeWithHint(user1, tokenAdd[tokenInd], amountTWei, ethAddress, user2, maxDestAmount,
//                 minConversionRate, walletId, emptyHint, {from:networkProxy});
//              assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         //list back
//         await network.listPairForReserve(reserve1.address, tokenAdd[tokenInd], false, true, true, {from: operator});
//         await network.listPairForReserve(reserve2.address, tokenAdd[tokenInd], false, true, true, {from: operator});

//         await network.tradeWithHint(user1, tokenAdd[tokenInd], amountTWei, ethAddress, user2, maxDestAmount,
//             minConversionRate, walletId, emptyHint, {from:networkProxy});
//     });

//     it("should verify trade reverted when gas price above set max.", async function () {
//         let tokenInd = 3;
//         let token = tokens[tokenInd]; //choose some token
//         let amountWei = 41;
//         let minConversionRate = 0;
//         let maxPrice = await network.maxGasPrice();
//         let highGas = maxPrice.add(new BN(1));

//         //perform trade
//         try {
//              await network.tradeWithHint(user1, ethAddress, amountWei, tokenAdd[tokenInd], user2, 2000,
//                 minConversionRate, walletId, emptyHint, {from:networkProxy, value:amountWei, gasPrice: highGas});
//              assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         //see trade success with good gas price
//         await network.tradeWithHint(user1, ethAddress, amountWei, tokenAdd[tokenInd], user2, 2000,
//                   minConversionRate, walletId, emptyHint, {from:networkProxy, value:amountWei, gasPrice: maxPrice});
//     });

//     it("should verify trade reverted when ether amount above user cap in white list.", async function () {
//         let tokenInd = 0;
//         let token = tokens[tokenInd]; //choose some token
//         let amountWei = 1000 * 1;
//         let minConversionRate = 0;

//         //set low cap for category cap for user 2
//         await whiteList.setUserCategory(user2, 2, {from: operator});
//         await whiteList.setCategoryCap(2, 1, {from:operator}); //1 sgd

//         //set low wei to sgd rate.
//         await whiteList.setSgdToEthRate(10, {from: operator});

//         //perform trade
//         try {
//              await network.tradeWithHint(user2, ethAddress, amountWei, tokenAdd[tokenInd], user2, 2000,
//                 minConversionRate, walletId, emptyHint, {from:networkProxy, value:amountWei});
//              assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         //set normal wei to sgd rate.
//         await whiteList.setSgdToEthRate(30000, {from: operator});
//         await whiteList.setCategoryCap(2, 100, {from:operator}); //1 sgd

//         //see trade success with good gas price
//         await network.tradeWithHint(user2, ethAddress, amountWei, tokenAdd[tokenInd], user2, 2000,
//                   minConversionRate, walletId, emptyHint, {from:networkProxy, value:amountWei});
//     });

//     it("should verify trade reverted src amount > max src amount (10**28).", async function () {
//         let tokenInd = 3;
//         let token = tokens[tokenInd]; //choose some token
//         let amountTWei = (new BN(10).pow(new BN(28))).add(new BN(1));

//         // transfer funds to user and approve funds to network - for all trades in this 'it'
//         await token.transfer(network.address, amountTWei);

//         //more ether to reserve
//         await Helper.sendEtherWithPromise(accounts[7], reserve1.address, 11050000000000000000);

//         //set high imbalance values - to avoid block trade due to total imbalance per block
//         let highImbalance = amountTWei.mul(new BN(4));
//         await pricing1.setTokenControlInfo(token.address, new BN(10).pow(new BN(14)), highImbalance, highImbalance);
//         //set large category cap for user 1
//         await whiteList.setUserCategory(user1, 1, {from: operator});
//         await whiteList.setCategoryCap(1, amountTWei.mul(new BN(2)), {from:operator});

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
//             await network.tradeWithHint(user1, tokenAdd[tokenInd], amountTWei, ethAddress, user2, amountTWei,
//                 0, walletId, emptyHint, {from:networkProxy});
//             assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         //see same trade performed when value is 1 less
//         await network.tradeWithHint(user1, tokenAdd[tokenInd], amountTWei.sub(new BN(1)), ethAddress,
//                 user2, amountTWei, 0, walletId, emptyHint, {from:networkProxy});
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
//         await token.transfer(network.address, amountTWei);
// //        await token.approve(network.address, amountTWei, {from:user1})

//         let rates = await network.getExpectedRate(tokenAdd[tokenInd], ethAddress, amountTWei);
//         let minConvRate = new BN(rates[0]);
//         let minSetRate = minConvRate.mul(new BN(2));
//         try {
//             await network.tradeWithHint(user1, tokenAdd[tokenInd], amountTWei, ethAddress, user2, amountTWei,
//                         minSetRate, walletId, emptyHint, {from:networkProxy});
//             assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         //same trade with zero min rate
//         await network.tradeWithHint(user1, tokenAdd[tokenInd], amountTWei, ethAddress, user2,
//                     amountTWei, 0, walletId, emptyHint, {from:networkProxy});
//     });

//     it("should verify trade reverted when rate above max rate.", async function () {
//         let tokenInd = 1;
//         let token = tokens[tokenInd]; //choose some token
//         let amountTWei = 35*1;

//         // transfer funds to user and approve funds to network - for all trades in this 'it'
//         await token.transfer(network.address, amountTWei);

//         //modify rate
//         baseSellRate1[tokenInd] = max_rate;
//         baseSellRate2[tokenInd] = max_rate;

//         buys.length = sells.length = indices.length = 0;

//         await pricing1.setBaseRate(tokenAdd, baseBuyRate1, baseSellRate1, buys, sells, currentBlock, indices, {from: operator});
//         await pricing2.setBaseRate(tokenAdd, baseBuyRate2, baseSellRate2, buys, sells, currentBlock, indices, {from: operator});

//         try {
//             await network.tradeWithHint(user1, tokenAdd[tokenInd], amountTWei, ethAddress, user2, 5000, 0, walletId, emptyHint, {from:networkProxy});
//             assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         //modify rate back to normal
//         tokensPerEther = (new BN(precisionUnits).mul(new BN((tokenInd + 1) * 3)));
//         baseSellRate1[tokenInd] = tokensPerEther;
//         baseSellRate2[tokenInd] = tokensPerEther;

//         buys.length = sells.length = indices.length = 0;

//         await pricing1.setBaseRate(tokenAdd, baseBuyRate1, baseSellRate1, buys, sells, currentBlock, indices, {from: operator});
//         await pricing2.setBaseRate(tokenAdd, baseBuyRate2, baseSellRate2, buys, sells, currentBlock, indices, {from: operator});

//         //see same trade performed when normal rate
//         await network.tradeWithHint(user1, tokenAdd[tokenInd], amountTWei, ethAddress,
//                 user2, amountTWei, 0, walletId, emptyHint, {from:networkProxy});
//     });

//     it("should verify trade reverted when dest address 0.", async function () {
//         let tokenInd = 3;
//         let token = tokens[tokenInd]; //choose some token
//         let amountWei = 18 * 1;
//         let minConversionRate = 0;

//         //perform trade
//         try {
//              await network.tradeWithHint(user1, ethAddress, amountWei, tokenAdd[tokenInd], zeroAddress, 2000, minConversionRate,
//                 walletId, emptyHint, {from:networkProxy, value:amountWei});
//              assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         //see same trade performed with valid value
//         await network.tradeWithHint(user1, ethAddress, amountWei, tokenAdd[tokenInd], user2, 2000, minConversionRate,
//             walletId, emptyHint, {from:networkProxy, value:amountWei});
//     });

//     it("should get reserve list and verify addresses.", async function () {
//         let reserves = await network.getReserves();

//         Helper.assertEqual(reserves.length, 3, "unexpected number of reserves.");

//         Helper.assertEqual(reserves[0], reserve1.address, "unexpected reserve address.");
//         Helper.assertEqual(reserves[1], reserve2.address, "unexpected reserve address.");
//         Helper.assertEqual(reserves[2], reserve3.address, "unexpected reserve address.");
//     });

//     it("should verify same reserve can't be added twice.", async function () {
//         let numRes = await network.getNumReserves();

//         Helper.assertEqual(numRes, 3, "unexpected number of reserves.");

//         //try adding existing reserve
//         try {
//             await network.addReserve(reserve1.address, false, {from: operator});
//             assert(false, "throw was expected in line above.");
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         // remove reserves and see same add success.
//         await network.removeReserve(reserve1.address, 0, {from: operator});

//         await network.addReserve(reserve1.address, false, {from: operator});
//     });

//     it("should remove reserves and verify reserve array length is 0.", async function () {
//         let numRes = await network.getNumReserves();

//         Helper.assertEqual(numRes, 3, "unexpected number of reserves.");

//         // remove reserves
//         await network.removeReserve(reserve1.address, 2, {from: operator});
//         await network.removeReserve(reserve2.address, 1, {from: operator});
//         await network.removeReserve(reserve3.address, 0, {from: operator});

//         numRes = await network.getNumReserves();

//         Helper.assertEqual(numRes, 0, "unexpected number of reserves.");

//         await network.addReserve(reserve1.address, false, {from: operator});
//         await network.addReserve(reserve2.address, false, {from: operator});
//         await network.addReserve(reserve3.address, false, {from: operator});

//         numRes = await network.getNumReserves();

//         Helper.assertEqual(numRes, 3, "unexpected number of reserves.");
//     });

//     it("verify remove reserve revert scenario", async() => {
//         // remove fails when wrong index.
//         try {
//             await network.removeReserve(reserve1.address, 1, {from: operator});
//             assert(false, "throw was expected in line above.");
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         await network.removeReserve(reserve1.address, 0, {from: operator});

//         // remove fails when not added.
//         try {
//             await network.removeReserve(reserve1.address, 0, {from: operator});
//             assert(false, "throw was expected in line above.");
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         await network.addReserve(reserve1.address, false, {from: operator});
//     })

//     it("should test can't init this contract with empty contracts (address 0).", async function () {
//         let networkTemp;

//         try {
//             networkTemp = await Network.new(zeroAddress);
//             assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         networkTemp = await Network.new(admin);

//         //white list can be set to 0...
//         await networkTemp.setWhiteList(zeroAddress);


//         try {
//             await networkTemp.setExpectedRate(zeroAddress);
//             assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         try {
//             await networkTemp.setFeeBurner(zeroAddress);
//             assert(false, "throw was expected in line above.")
//         } catch(e){
//            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         try {
//             await networkTemp.setKyberProxy(zeroAddress);
//             assert(false, "throw was expected in line above.")
//         } catch(e){
//            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }
//     });

//     it("should test can't set enable if any mandatory contract has zero value = wasn't set.", async function () {
//         const networkTemp = await Network.new(admin);

//         //verify can't enable without set contracts
//         try {
//             await networkTemp.setEnable(true);
//             assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         await networkTemp.setWhiteList(whiteList.address);
//         try {
//             await networkTemp.setEnable(true);
//             assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         await networkTemp.setFeeBurner(feeBurner.address);
//         try {
//             await networkTemp.setEnable(true);
//             assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         await networkTemp.setExpectedRate(expectedRate.address);
//         try {
//             await networkTemp.setEnable(true);
//             assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         await networkTemp.setKyberProxy(networkProxy);
//         await networkTemp.setEnable(true);
//     });

//     it("should verify network reverts when setting negligible rate diff > 10000.", async function () {
//         let legalNegRateDiff = 100 * 100;
//         let illegalNegRateDiff = (100 * 100) + 1;
//         let currentNegRateDiff = await network.negligibleRateDiff();

//         try {
//             await network.setParams(gasPrice, illegalNegRateDiff);
//             assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         await network.setParams(gasPrice, legalNegRateDiff);
//         let negDiff = await network.negligibleRateDiff();

//         Helper.assertEqual(negDiff, legalNegRateDiff);
//         await network.setParams(gasPrice, currentNegRateDiff);
//     });

//     it("should verify get expected rate reverts when rates contracts not set (address 0).", async function () {
//         let networkTemp;
//         let amountTwei = 30;

//         networkTemp = await Network.new(admin);

//         try {
//             await networkTemp.getExpectedRate(tokenAdd[2], ethAddress, amountTwei);
//             assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         //set expected rate and see no throw
//         await networkTemp.setWhiteList(whiteList.address);
//         await networkTemp.setExpectedRate(expectedRate.address);
//         await networkTemp.setFeeBurner(feeBurner.address);
//         await networkTemp.setParams(gasPrice, negligibleRateDiff);

//         await networkTemp.getExpectedRate(tokenAdd[2], ethAddress, amountTwei);
//     });

//     it("should use setInfo (UI info) and check value is set.", async () => {
//         let info = new BN(15);
//         let field = web3.utils.fromAscii('10');

//         await network.setInfo(field, info, {from: operator});
//         let rxInfo = await network.info(field);
//         Helper.assertEqual(info, rxInfo, "info data doesn't match");
//     });

//     describe("token to token trades", function() {
//         it("should test token to token trade 1 reserve.", async () => {
//             let tokenSrcInd = 1;
//             let tokenDestInd = 0;
//             let tokenSrc = tokens[tokenSrcInd];
//             let tokenDest = tokens[tokenDestInd];
//             let srcAmountTwei = new BN(1450);
//             let maxDestAmount = (new BN(10)).pow(new BN(18));

//             //reset max imbalance values - for working with higher numbers
//             currentBlock = await Helper.getCurrentBlock();

//             //set compact data
//             compactBuyArr = [0, 0, 0, 0, 0, 06, 07, 08, 09, 10, 11, 12, 13, 14];
//             let compactBuyHex = Helper.bytesToHex(compactBuyArr);
//             buys.push(compactBuyHex);

//             compactSellArr = [0, 0, 0, 0, 0, 26, 27, 28, 29, 30, 31, 32, 33, 34];
//             let compactSellHex = Helper.bytesToHex(compactSellArr);
//             sells.push(compactSellHex);

//             indices[0] = 0;
//             await pricing1.setBaseRate(tokenAdd, baseBuyRate1, baseSellRate1, buys, sells, currentBlock, indices, {from: operator});
//             await pricing2.setBaseRate(tokenAdd, baseBuyRate2, baseSellRate2, buys, sells, currentBlock, indices, {from: operator});
//             priceUpdateBlock = currentBlock;

//             maxPerBlockImbalance = (new BN(5)).mul((new BN(10)).pow(new BN(18)));
//             maxTotalImbalance = maxPerBlockImbalance.mul(new BN(12));

//             //set higher imbalance values - and set local imbalance values to 0 since we update compact data.
//             for (let i = 0; i < numTokens; ++i) {
//                 await pricing1.setTokenControlInfo(tokenAdd[i], minimalRecordResolution, maxPerBlockImbalance, maxTotalImbalance);
//                 await pricing2.setTokenControlInfo(tokenAdd[i], minimalRecordResolution, maxPerBlockImbalance, maxTotalImbalance);
//                 //update balance in imbalance values
//                 reserve2TokenBalance[i] = new BN(await tokens[i].balanceOf(reserve2.address));
//                 reserve2TokenImbalance[i] = new BN(0);
//                 if (i == 0) {
//                     reserve1TokenBalance[i] = new BN(await tokens[i].balanceOf(walletForToken));
//                 } else {
//                     reserve1TokenBalance[i] = new BN(await tokens[i].balanceOf(reserve1.address));
//                 }
//                 reserve1TokenImbalance[i] = new BN(0);
//     //            log(i + " reserve2TokenImbalance: " + reserve2TokenImbalance[i] + " reserve1TokenImbalance: " + reserve1TokenImbalance[i])
//             }

//             await reserve1.disableTrade({from:alerter});

//             try {
//                 //verify base rate
//                 let buyRate = await network.getExpectedRate(tokenAdd[tokenSrcInd], tokenAdd[tokenDestInd], srcAmountTwei);

//                 // first token to eth rate
//                 let expected = calculateRateAmount(false, tokenSrcInd, srcAmountTwei, 2);
//                 let expectedSellRate = expected[0];
//                 let expectedEthQtyWei = expected[1];
//     //            log('expectedSell ' + expected )

//                 //eth to token
//                 expected = calculateRateAmount(true, tokenDestInd, expectedEthQtyWei, 2);
//                 let expectedBuyRate = expected[0];
//                 expectedDestTokensTwei = expected[1];
//     //            log('expectedBuy ' + expected )

//                 //calcCombinedRate(srcQty, sellRate, buyRate, srcDecimals, dstDecimals)
//                 let combinedRate = calcCombinedRate(srcAmountTwei, expectedSellRate, expectedBuyRate, tokenDecimals[tokenSrcInd], tokenDecimals[tokenDestInd], expectedDestTokensTwei);

//                 //check correct rate calculated
//                 Helper.assertEqual(buyRate[0], combinedRate, "unexpected rate.");

//                 //perform trade
//                 // transfer funds to user and approve funds to network - for all trades in this 'it'
//                 await tokenSrc.transfer(user1, srcAmountTwei);
//                 await tokenSrc.approve(networkProxy, srcAmountTwei, {from:user1})

//                 let startBalanceTokenDestUser2 = await tokenDest.balanceOf(user2);
//                 let startBalanceTokenSrcUser1 = await tokenSrc.balanceOf(user1);
//         //        function trade(src, srcAmount, dest, destAddress, maxDestAmount, minConversionRate, walletId)

//                 await tokenSrc.transferFrom(user1, network.address, srcAmountTwei, {from: networkProxy});
//                 let result = await network.tradeWithHint(user1, tokenAdd[tokenSrcInd], srcAmountTwei, tokenAdd[tokenDestInd],
//                     user2, maxDestAmount, buyRate[1], walletId, emptyHint, {from:networkProxy});

//                 assert.equal(result.logs[1].event, 'KyberTrade');
//                 assert.equal(result.logs[1].args.trader, user1, "src address");
//                 assert.equal(result.logs[1].args.src, tokenAdd[tokenSrcInd], "src token");
//                 Helper.assertEqual(result.logs[1].args.srcAmount, srcAmountTwei);
//                 assert.equal(result.logs[1].args.destAddress, user2);
//                 assert.equal(result.logs[1].args.dest, tokenAdd[tokenDestInd]);
//                 Helper.assertEqual(result.logs[1].args.dstAmount, expectedDestTokensTwei);
//                 Helper.assertEqual(result.logs[1].args.ethWeiValue, expectedEthQtyWei);
//                 assert.equal(result.logs[1].args.hint, null);
//                 assert.equal(result.logs[1].args.reserve2, reserve2.address);
//                 assert.equal(result.logs[1].args.reserve1, reserve2.address);

//                 //update balance and imbalance
//                 reserve2TokenBalance[tokenSrcInd] = (reserve2TokenBalance[tokenSrcInd]).add(srcAmountTwei);
//                 reserve2TokenImbalance[tokenSrcInd] = reserve2TokenImbalance[tokenSrcInd].sub(srcAmountTwei);
//                 reserve2TokenBalance[tokenDestInd] = reserve2TokenBalance[tokenDestInd].sub(expectedDestTokensTwei);
//                 reserve2TokenImbalance[tokenDestInd] =  reserve2TokenImbalance[tokenDestInd].add(expectedDestTokensTwei); //more missing tokens

//                 //check token balances
//                 ///////////////////////

//                 //check higher tokenDest balance on user2
//                 let rate = new BN(buyRate[0]);
//                 let tokenDestUser2Balance = await tokenDest.balanceOf(user2);
//                 let expectedBalanceTokenDestUser2 = startBalanceTokenDestUser2.add(expectedDestTokensTwei);
//                 Helper.assertEqual(expectedBalanceTokenDestUser2, tokenDestUser2Balance, "bad token balance");

//                 //check lower tokenSrc balance on user1
//                 let tokenSrcUser1Balance = await tokenSrc.balanceOf(user1);
//                 let expectedBalanceTokenSrcUser1 = startBalanceTokenSrcUser1.sub(srcAmountTwei);
//                 Helper.assertEqual(tokenSrcUser1Balance, expectedBalanceTokenSrcUser1, "bad token balance");

//                 //check token balance on reserve
//                 //tokenSrc
//                 reportedBalance = await tokenSrc.balanceOf(reserve2.address);
//                 Helper.assertEqual(reportedBalance, reserve2TokenBalance[tokenSrcInd], "bad token balance on reserve");

//                 //tokenDest
//                 reportedBalance = await tokenDest.balanceOf(reserve2.address);
//                 Helper.assertEqual(reportedBalance, reserve2TokenBalance[tokenDestInd], "bad token balance on reserve");
//             } catch(e) {
//                 await reserve1.enableTrade({from:admin});
//                 throw(e);
//             }
//             await reserve1.enableTrade({from:admin});
//         });

//         it("should test token to token trade 2 different reserves.", async function () {
//             let tokenSrcInd = 1;
//             let tokenDestInd = 3;
//             let tokenSrc = tokens[tokenSrcInd];
//             let tokenDest = tokens[tokenDestInd];
//             let srcAmountTwei = new BN(1956);
//             let maxDestAmount = (new BN(10)).pow(new BN(18));

//             await pricing1.disableTokenTrade(tokenAdd[tokenSrcInd], {from: alerter});
//             await pricing2.disableTokenTrade(tokenAdd[tokenDestInd], {from: alerter});

//             try {
//                 //rate
//                 let buyRate = await network.getExpectedRate(tokenAdd[tokenSrcInd], tokenAdd[tokenDestInd], srcAmountTwei);
//                 //calculate rates
//                 // first token to eth rate
//                 let expected = calculateRateAmount(false, tokenSrcInd, srcAmountTwei, 2);
//                 let expectedSellRate = expected[0];
//                 let expectedEthQtyWei = expected[1];

//                 //eth to token
//                 expected = calculateRateAmount(true, tokenDestInd, expectedEthQtyWei, 1);
//                 let expectedBuyRate = expected[0];
//                 expectedDestTokensTwei = expected[1];

//                 let combinedRate = calcCombinedRate(srcAmountTwei, expectedSellRate, expectedBuyRate, tokenDecimals[tokenSrcInd], tokenDecimals[tokenDestInd], expectedDestTokensTwei);

//      //        check correct rate calculated
//                 Helper.assertEqual(buyRate[0], combinedRate, "unexpected rate.");

//                  //perform trade
//                 // transfer funds to user and approve funds to network
//                 await tokenSrc.transfer(user1, srcAmountTwei);
//                 await tokenSrc.approve(networkProxy, srcAmountTwei, {from:user1})

//                 let startBalanceTokenDestUser2 = await tokenDest.balanceOf(user2);
//                 let startBalanceTokenSrcUser1 = await tokenSrc.balanceOf(user1);

//         //        function trade(src, srcAmount, dest, destAddress, maxDestAmount, minConversionRate, walletId)

//                 await tokenSrc.transferFrom(user1, network.address, srcAmountTwei, {from: networkProxy});
//                 result = await network.tradeWithHint(user1, tokenAdd[tokenSrcInd], srcAmountTwei, tokenAdd[tokenDestInd],
//                         user2, maxDestAmount, buyRate[1], walletId, emptyHint, {from:networkProxy});
//     //            log(result.logs[0].args);
//     //            log(result.logs[1].args);

//                 //update balance and imbalance
//                 reserve2TokenBalance[tokenSrcInd] = reserve2TokenBalance[tokenSrcInd].add(srcAmountTwei);
//                 reserve2TokenImbalance[tokenSrcInd] = reserve2TokenImbalance[tokenSrcInd].sub(srcAmountTwei); // less missing tokens.
//                 reserve1TokenBalance[tokenDestInd] = reserve1TokenBalance[tokenDestInd].sub(expectedDestTokensTwei);
//                 reserve1TokenImbalance[tokenDestInd] = reserve1TokenImbalance[tokenDestInd].add(expectedDestTokensTwei);

//         //        check token balances
//                 ///////////////////
//                 //check tokenDest balance on user2
//                 let rate = new BN(buyRate[0]);
//                 let tokenDestUser2Balance = await tokenDest.balanceOf(user2);
//                 let expectedBalanceTokenDestUser2 = startBalanceTokenDestUser2.add(expectedDestTokensTwei);
//                 Helper.assertEqual(expectedBalanceTokenDestUser2, tokenDestUser2Balance, "bad token balance");

//                 //check tokenSrc balance on user1
//                 let tokenSrcUser1Balance = await tokenSrc.balanceOf(user1);
//                 let expectedBalanceTokenSrcUser1 = startBalanceTokenSrcUser1.sub(srcAmountTwei);
//                 Helper.assertEqual(tokenSrcUser1Balance, expectedBalanceTokenSrcUser1, "bad token balance");

//                 //check token balance on reserve
//                 //tokenSrc
//                 reportedBalance = await tokenSrc.balanceOf(reserve2.address);
//                 Helper.assertEqual(reportedBalance, reserve2TokenBalance[tokenSrcInd], "bad token balance on reserve");

//                 //tokenDest
//                 reportedBalance = await tokenDest.balanceOf(reserve1.address);
//                 Helper.assertEqual(reportedBalance, reserve1TokenBalance[tokenDestInd], "bad token balance on reserve");
//                 reportedBalance = await tokenDest.balanceOf(reserve2.address);
//                 Helper.assertEqual(reportedBalance, reserve2TokenBalance[tokenDestInd], "bad token balance on reserve");

//                 await pricing1.enableTokenTrade(tokenAdd[tokenSrcInd]);
//                 await pricing2.enableTokenTrade(tokenAdd[tokenDestInd]);
//             } catch(e) {
//                 await pricing1.enableTokenTrade(tokenAdd[tokenSrcInd]);
//                 await pricing2.enableTokenTrade(tokenAdd[tokenDestInd]);
//                 throw(e);
//             }
//         });

//         it("should test token to token trade 2 different reserves. other numbers.", async function () {
//             let tokenSrcInd = 1;
//             let tokenDestInd = 0;
//             let tokenSrc = tokens[tokenSrcInd];
//             let tokenDest = tokens[tokenDestInd];
//             let srcAmountTwei = new BN(2451);
//             let maxDestAmount = (new BN(10)).pow(new BN(18));

//             await pricing1.disableTokenTrade(tokenAdd[tokenSrcInd], {from: alerter});
//             await pricing2.disableTokenTrade(tokenAdd[tokenDestInd], {from: alerter});

//             try {
//                 //rate
//                 let buyRate = await network.getExpectedRate(tokenAdd[tokenSrcInd], tokenAdd[tokenDestInd], srcAmountTwei);

//                 //calculate rates
//                 // first token to eth rate
//                 let expected = calculateRateAmount(false, tokenSrcInd, srcAmountTwei, 2);
//                 let expectedSellRate = expected[0];
//                 let expectedEthQtyWei = expected[1];
//     //            log('expectedSell ' + expected )

//                 //eth to token
//                 expected = calculateRateAmount(true, tokenDestInd, expectedEthQtyWei, 1);
//                 let expectedBuyRate = expected[0];
//                 expectedDestTokensTwei = expected[1];
//     //            log('expectedBuy ' + expected )

//                 let combinedRate = calcCombinedRate(srcAmountTwei, expectedSellRate, expectedBuyRate, tokenDecimals[tokenSrcInd], tokenDecimals[tokenDestInd], expectedDestTokensTwei);

//      //        check correct rate calculated
//                 Helper.assertEqual(buyRate[0], combinedRate, "unexpected rate.");

//                  //perform trade
//                 // transfer funds to user and approve funds to network
//                 await tokenSrc.transfer(user1, srcAmountTwei);
//                 await tokenSrc.approve(networkProxy, srcAmountTwei, {from:user1})

//                 let startBalanceTokenDestUser2 = await tokenDest.balanceOf(user2);
//                 let startBalanceTokenSrcUser1 = await tokenSrc.balanceOf(user1);

//         //        function trade(src, srcAmount, dest, destAddress, maxDestAmount, minConversionRate, walletId)

//                 await tokenSrc.transferFrom(user1, network.address, srcAmountTwei, {from: networkProxy});
//                 result = await network.tradeWithHint(user1, tokenAdd[tokenSrcInd], srcAmountTwei, tokenAdd[tokenDestInd], user2, maxDestAmount, buyRate[1], walletId, emptyHint, {from:networkProxy});
//     //            log(result.logs[0].args);
//     //            log(result.logs[1].args);

//                 //update balance and imbalance
//                 reserve2TokenBalance[tokenSrcInd] = reserve2TokenBalance[tokenSrcInd].add(srcAmountTwei);
//                 reserve2TokenImbalance[tokenSrcInd] = reserve2TokenImbalance[tokenSrcInd].sub(srcAmountTwei); // less missing tokens.
//                 reserve1TokenBalance[tokenDestInd] = reserve1TokenBalance[tokenDestInd].sub(expectedDestTokensTwei);
//                 reserve1TokenImbalance[tokenDestInd] = reserve1TokenImbalance[tokenDestInd].add(expectedDestTokensTwei);

//         //        check token balances
//                 ///////////////////
//                 //check tokenDest balance on user2
//                 let rate = new BN(buyRate[0]);
//                 let tokenDestUser2Balance = await tokenDest.balanceOf(user2);
//                 let expectedBalanceTokenDestUser2 = startBalanceTokenDestUser2.add(expectedDestTokensTwei);
//                 Helper.assertEqual(expectedBalanceTokenDestUser2, tokenDestUser2Balance, "bad token balance");

//                 //check tokenSrc balance on user1
//                 let tokenSrcUser1Balance = await tokenSrc.balanceOf(user1);
//                 let expectedBalanceTokenSrcUser1 = startBalanceTokenSrcUser1.sub(srcAmountTwei);
//                 Helper.assertEqual(tokenSrcUser1Balance, expectedBalanceTokenSrcUser1, "bad token balance");

//                 //check token balance on reserve
//                 //tokenSrc
//                 reportedBalance = await tokenSrc.balanceOf(reserve2.address);
//                 Helper.assertEqual(reportedBalance, reserve2TokenBalance[tokenSrcInd], "bad token balance on reserve");

//                 //tokenDest
//                 if (tokenDestInd != 0) {
//                     reportedBalance = await tokenDest.balanceOf(reserve1.address);
//                 } else {
//                     reportedBalance = await tokenDest.balanceOf(walletForToken);
//                 }

//                 Helper.assertEqual(reportedBalance, reserve1TokenBalance[tokenDestInd], "bad token balance on reserve");
//                 reportedBalance = await tokenDest.balanceOf(reserve2.address);
//                 Helper.assertEqual(reportedBalance, reserve2TokenBalance[tokenDestInd], "bad token balance on reserve");

//                 await pricing1.enableTokenTrade(tokenAdd[tokenSrcInd]);
//                 await pricing2.enableTokenTrade(tokenAdd[tokenDestInd]);
//             } catch(e) {
//                 await pricing1.enableTokenTrade(tokenAdd[tokenSrcInd]);
//                 await pricing2.enableTokenTrade(tokenAdd[tokenDestInd]);
//                 throw(e);
//             }
//         });

//         it("should test token to token trade with limited max dest amount.", async function () {
//             //when limiting max dest amount can't work with small numbers.
//             //it has some issue as follows:
//     //        when user request maxDestAmount for a trade, we re-calculate the src amount so he would get the exact amount he requested.
//     //
//     //        lets assume user wants SOME token which converts 1 eth to 100 SOME.
//     //        what could happen
//     //
//     //        user requests max dest amount of 101 SOME tokens.
//     //        we re calculate source amount and round it up to 2 (the naive calculation would round it to 1).
//     //        now trade it 2 ether --> 101 SOME.
//     //        on the end of our trade a check sure user wasn't "cheated" with this formula:
//     //        require(
//     //        (userDestBalanceAfter - userDestBalanceBefore)
//     //        >=
//     //        calcDstQty((userSrcBalanceBefore - userSrcBalanceAfter), ..., ...., minConversionRate));
//     //        min conversion rate here could be around 95-100 so according to this calculation user should get "at least" 190 SOME. but he got only 101 so - trade is reverted.

//             let tokenSrcInd = 0;
//             let tokenDestInd = 1;
//             let tokenSrc = tokens[tokenSrcInd];
//             let tokenDest = tokens[tokenDestInd];
//             let srcAmountTwei = (new BN(10)).pow(new BN(5));
//             let maxDestAmount = (new BN(10)).pow(new BN(5));

//             await pricing2.disableTokenTrade(tokenAdd[tokenSrcInd], {from: alerter});
//             await pricing1.disableTokenTrade(tokenAdd[tokenDestInd], {from: alerter});

//             //rate
//             let buyRate = await network.getExpectedRate(tokenAdd[tokenSrcInd], tokenAdd[tokenDestInd], srcAmountTwei);

//             //calculate rates
//             // first token to eth rate
//             let expected = calculateRateAmount(false, tokenSrcInd, srcAmountTwei, 1);
//             let expectedSellRate = expected[0];
//             let expectedEthQtyWei = expected[1];
//             //            log('expectedEthQtyWei ' + expectedEthQtyWei)

//             //eth to token
//             expected = calculateRateAmount(true, tokenDestInd, expectedEthQtyWei, 2);
//             let expectedBuyRate = expected[0];
//             let expectedDestTokensTwei = expected[1];

//             let combinedRate = calcCombinedRate(srcAmountTwei, expectedSellRate, expectedBuyRate, tokenDecimals[tokenSrcInd], tokenDecimals[tokenDestInd], expectedDestTokensTwei);

//     //        check correct rate calculated
//             Helper.assertEqual(buyRate[0], combinedRate, "unexpected rate.");

//             //calc real amounts from max
//             //api:  calcSrcQty(dstQty, srcDecimals, dstDecimals, rate)
//             let expectedEthQtyWeiForDestTokens = calcSrcQty(maxDestAmount, 18, tokenDecimals[tokenDestInd], expectedBuyRate);
//     //        log('expectedEthQtyWeiForDestTokens for maxDest amount ' + expectedEthQtyWeiForDestTokens);

//             let expectedSrcTweiForWeiAmount = calcSrcQty(expectedEthQtyWeiForDestTokens, tokenDecimals[tokenSrcInd], 18, expectedSellRate);
//     //        log('expectedSrcForMaxAmount ' + expectedSrcForMaxAmount)

//             // perform trade
//             // transfer funds to user and approve funds to network - for all trades in this 'it'
//             await tokenSrc.transfer(user2, srcAmountTwei);
//             await tokenSrc.approve(networkProxy, srcAmountTwei, {from:user2})

//             let startBalanceNetworkWei =  new BN(await Helper.getBalancePromise(network.address));
//             let startBalanceNetworkTokDest = new BN(await tokenDest.balanceOf(network.address));
//             let startBalanceTokenDestUser1 = new BN(await tokenDest.balanceOf(user1));
//             let startBalanceTokenSrcUser2 = new BN(await tokenSrc.balanceOf(user2));
//     //        function trade(src, srcAmount, dest, destAddress, maxDestAmount, minConversionRate, walletId)

//             await tokenSrc.transferFrom(user2, network.address, srcAmountTwei, {from: networkProxy});
//             result = await network.tradeWithHint(user2, tokenAdd[tokenSrcInd], srcAmountTwei, tokenAdd[tokenDestInd], user1, maxDestAmount,
//                                 buyRate[1], walletId, emptyHint, {from:networkProxy});
//     //        console.log(result.logs);
//     //        console.log(result.logs[0].args);
//     //        console.log(result.logs[1].args);
//     //        console.log(result.logs[4].args);

//     //        check token balances
//             /////////////////////

//             //check tokenDest balance on user1
//             let rate = new BN(buyRate[0]);
//             let tokenDestUser1Balance = await tokenDest.balanceOf(user1);
//             let expectedBalanceTokenDestUser1 = startBalanceTokenDestUser1.add(maxDestAmount);
//             Helper.assertEqual(expectedBalanceTokenDestUser1, tokenDestUser1Balance, "bad token balance");

//             //check tokenSrc balance on user2
//             let tokenSrcUser2Balance = await tokenSrc.balanceOf(user2);
//             let expectedBalanceTokenSrcUser2 = startBalanceTokenSrcUser2.sub(expectedSrcTweiForWeiAmount);
//             Helper.assertEqual(tokenSrcUser2Balance, expectedBalanceTokenSrcUser2, "bad token balance");

//             //check token balance on reserve
//             //tokenSrc
//             reserve1TokenBalance[tokenSrcInd] = reserve1TokenBalance[tokenSrcInd].add(expectedSrcTweiForWeiAmount);
//             reserve1TokenImbalance[tokenSrcInd] = reserve1TokenImbalance[tokenSrcInd].sub(expectedSrcTweiForWeiAmount); //imbalance represents how many missing tokens
//             if(tokenSrcInd != 0) {
//                 reportedBalance = await tokenSrc.balanceOf(reserve1.address);
//             } else {
//                 reportedBalance = await tokenSrc.balanceOf(walletForToken);
//             }
//             Helper.assertEqual(reportedBalance, reserve1TokenBalance[tokenSrcInd], "bad token balance on reserve");

//             //tokenDest
//             reserve2TokenBalance[tokenDestInd] = reserve2TokenBalance[tokenDestInd].sub(maxDestAmount);
//             //notice here the reserve sends expectedDestTwei - its not aware of max dest amount
//             reserve2TokenImbalance[tokenDestInd] = reserve2TokenImbalance[tokenDestInd].add(maxDestAmount); //imbalance represents how many missing tokens
//             reportedBalance = await tokenDest.balanceOf(reserve2.address);
//             Helper.assertEqual(reportedBalance, reserve2TokenBalance[tokenDestInd], "bad token balance on reserve");

//             //////////////////////////////
//             //notice, network will also have some minor balance, since we calculate src rate according to max Dest.
//             //reserve sends network amount according to src and rate. network sends amount according to maxDest it requested.
//             //outcome is some leftover Weis in network contract.
//             ////////////////////
//             let expectedSentWeiFromTrade1ToNetwork = calcDstQty(expectedSrcTweiForWeiAmount, tokenDecimals[tokenSrcInd], 18, expectedSellRate);

//             let expectedNetworkWei = expectedSentWeiFromTrade1ToNetwork.add(startBalanceNetworkWei).sub(expectedEthQtyWeiForDestTokens);
//             let networkBalanceWei = await Helper.getBalancePromise(network.address);
//     //        log("networkBalanceWei " + networkBalanceWei + " expectedNetworkWei " + expectedNetworkWei)
//             Helper.assertEqual(networkBalanceWei, expectedNetworkWei, "network should have different wei balance");

//             let networkBalanceTweiDest = await tokenDest.balanceOf(network.address);
//             let expectedDestTwei = calcDstQty(expectedEthQtyWeiForDestTokens, 18, tokenDecimals[tokenDestInd], expectedBuyRate);
//             let expecteNetworkDestTwei = expectedDestTwei.add(startBalanceNetworkTokDest).sub(maxDestAmount);
//             Helper.assertEqual(networkBalanceTweiDest, expecteNetworkDestTwei, "network should have different wei balance");

//             await pricing2.enableTokenTrade(tokenAdd[tokenSrcInd]);
//             await pricing1.enableTokenTrade(tokenAdd[tokenDestInd]);
//         });

//         it("should test token to token - limited max dest amount - different numbers.", async function () {
//             let tokenSrcInd = 1;
//             let tokenDestInd = 2;
//             let tokenSrc = tokens[tokenSrcInd];
//             let tokenDest = tokens[tokenDestInd];
//             let srcAmountTwei = new BN(7853);
//             let maxDestAmount = new BN(8500);

//             await pricing2.disableTokenTrade(tokenAdd[tokenSrcInd], {from: alerter});
//             await pricing1.disableTokenTrade(tokenAdd[tokenDestInd], {from: alerter});

//             //rate
//             let buyRate = await network.getExpectedRate(tokenAdd[tokenSrcInd], tokenAdd[tokenDestInd], srcAmountTwei);

//             //calculate rates
//             // first token to eth rate
//             let expected = calculateRateAmount(false, tokenSrcInd, srcAmountTwei, 1);
//             let expectedSellRate = expected[0];
//             let expectedEthQtyWei = expected[1];
//             //            log('expectedEthQtyWei ' + expectedEthQtyWei)

//             //eth to token
//             expected = calculateRateAmount(true, tokenDestInd, expectedEthQtyWei, 2);
//             let expectedBuyRate = expected[0];
//             let expectedDestTokensTwei = expected[1];

//             let combinedRate = calcCombinedRate(srcAmountTwei, expectedSellRate, expectedBuyRate, tokenDecimals[tokenSrcInd], tokenDecimals[tokenDestInd], expectedDestTokensTwei);

//             //        check correct rate calculated
//             Helper.assertEqual(buyRate[0], combinedRate, "unexpected rate.");

//             //calc real amounts from max
//             //api:  calcSrcQty(dstQty, srcDecimals, dstDecimals, rate)
//             let expectedEthQtyWeiForDestTokens = calcSrcQty(maxDestAmount, 18, tokenDecimals[tokenDestInd], expectedBuyRate);
//             //        log('expectedEthQtyWeiForDestTokens for maxDest amount ' + expectedEthQtyWeiForDestTokens);

//             let expectedSrcTweiForWeiAmount = calcSrcQty(expectedEthQtyWeiForDestTokens, tokenDecimals[tokenSrcInd], 18, expectedSellRate);
//             //        log('expectedSrcForMaxAmount ' + expectedSrcForMaxAmount)

//             // perform trade
//             // transfer funds to user and approve funds to network - for all trades in this 'it'
//             await tokenSrc.transfer(user2, srcAmountTwei);
//             await tokenSrc.approve(networkProxy, srcAmountTwei, {from:user2})

//             let startBalanceNetworkWei =  new BN(await Helper.getBalancePromise(network.address));
//             let startBalanceNetworkTokDest = new BN(await tokenDest.balanceOf(network.address));
//             let startBalanceTokenDestUser1 = new BN(await tokenDest.balanceOf(user1));
//             let startBalanceTokenSrcUser2 = new BN(await tokenSrc.balanceOf(user2));
//             await tokenSrc.transferFrom(user2, network.address, srcAmountTwei, {from: networkProxy})
//             //        function trade(src, srcAmount, dest, destAddress, maxDestAmount, minConversionRate, walletId)
            
//             result = await network.tradeWithHint(user2, tokenAdd[tokenSrcInd], srcAmountTwei, tokenAdd[tokenDestInd], user1, maxDestAmount,
//                              buyRate[1], walletId, emptyHint, {from:networkProxy});
//             //        console.log(result.logs);
//             //        console.log(result.logs[0].args);
//             //        console.log(result.logs[1].args);
//             //        console.log(result.logs[4].args);

//             //        check token balances
//             /////////////////////

//             //check tokenDest balance on user1
//             let rate = new BN(buyRate[0]);
//             let tokenDestUser1Balance = await tokenDest.balanceOf(user1);
//             let expectedBalanceTokenDestUser1 = startBalanceTokenDestUser1.add(maxDestAmount);
//             Helper.assertEqual(expectedBalanceTokenDestUser1, tokenDestUser1Balance, "bad token balance");

//             //check tokenSrc balance on user2
//             let tokenSrcUser2Balance = await tokenSrc.balanceOf(user2);
//             let expectedBalanceTokenSrcUser2 = startBalanceTokenSrcUser2.sub(expectedSrcTweiForWeiAmount);
//             Helper.assertEqual(tokenSrcUser2Balance, expectedBalanceTokenSrcUser2, "bad token balance");

//             //check token balance on reserve
//             //tokenSrc
//             reserve1TokenBalance[tokenSrcInd] = reserve1TokenBalance[tokenSrcInd].add(expectedSrcTweiForWeiAmount);
//             reserve1TokenImbalance[tokenSrcInd] = reserve1TokenImbalance[tokenSrcInd].sub(expectedSrcTweiForWeiAmount); //imbalance represents how many missing tokens
//             reportedBalance = await tokenSrc.balanceOf(reserve1.address);
//             Helper.assertEqual(reportedBalance, reserve1TokenBalance[tokenSrcInd], "bad token balance on reserve");

//             //tokenDest
//             reserve2TokenBalance[tokenDestInd] = reserve2TokenBalance[tokenDestInd].sub(maxDestAmount);
//             //notice here the reserve sends expectedDestTwei - its not aware of max dest amount
//             reserve2TokenImbalance[tokenDestInd] = reserve2TokenImbalance[tokenDestInd].add(maxDestAmount); //imbalance represents how many missing tokens
//             reportedBalance = await tokenDest.balanceOf(reserve2.address);
//             Helper.assertEqual(reportedBalance, reserve2TokenBalance[tokenDestInd], "bad token balance on reserve");

//             //////////////////////////////
//             //notice, network will also have some minor balance, since we calculate src rate according to max Dest.
//             //reserve sends network amount according to src and rate. network sends amount according to maxDest it requested.
//             //outcome is some leftover Weis in network contract.
//             ////////////////////
//             let expectedSentWeiFromTrade1ToNetwork = calcDstQty(expectedSrcTweiForWeiAmount, tokenDecimals[tokenSrcInd], 18, expectedSellRate);

//             let expectedNetworkWei = expectedSentWeiFromTrade1ToNetwork.add(startBalanceNetworkWei).sub(expectedEthQtyWeiForDestTokens);
//             let networkBalanceWei = await Helper.getBalancePromise(network.address);
//             //        log("networkBalanceWei " + networkBalanceWei + " expectedNetworkWei " + expectedNetworkWei)
//             Helper.assertEqual(networkBalanceWei, expectedNetworkWei, "network should have different wei balance");

//             let networkBalanceTweiDest = await tokenDest.balanceOf(network.address);
//             let expectedDestTwei = calcDstQty(expectedEthQtyWeiForDestTokens, 18, tokenDecimals[tokenDestInd], expectedBuyRate);
//             let expecteNetworkDestTwei = expectedDestTwei.add(startBalanceNetworkTokDest).sub(maxDestAmount);
//             Helper.assertEqual(networkBalanceTweiDest, expecteNetworkDestTwei, "network should have different wei balance");

//             await pricing2.enableTokenTrade(tokenAdd[tokenSrcInd]);
//             await pricing1.enableTokenTrade(tokenAdd[tokenDestInd]);
//         });

//         it("should test token to token trade with same src and dest token.", async function () {
//             let tokenSrcInd = 1;
//             let tokenDestInd = 1;
//             let tokenSrc = tokens[tokenSrcInd];
//             let tokenDest = tokens[tokenDestInd];
//             let srcAmountTwei = new BN(36);
//             let maxDestAmount = (new BN(10)).pow(new BN(18));

//             buyRate = await network.getExpectedRate(tokenSrc.address, tokenDest.address, srcAmountTwei);
//             Helper.assertEqual(buyRate[0], 0, "Rate returned is not zero for same src & dst token");

//             let ethBalance = await Helper.getBalancePromise(reserve1.address);
//             ethBalance = await Helper.getBalancePromise(reserve2.address);
//             let destTokBalance = await tokenDest.balanceOf(reserve1.address)
//             destTokBalance = await tokenDest.balanceOf(reserve2.address)

//             await tokenSrc.transfer(user1, srcAmountTwei);
//             await tokenSrc.approve(networkProxy, srcAmountTwei, {from:user1})

//             let user1SrcTokBalanceBefore = new BN(await tokenSrc.balanceOf(user1));
//             let user2DestTokBalanceBefore = new BN(await tokenDest.balanceOf(user2));

//             await tokenSrc.transferFrom(user1, network.address, srcAmountTwei, {from: networkProxy});

//             //see trade reverts
//             try {
//                 let result = await network.tradeWithHint(user1, tokenSrc.address, srcAmountTwei, tokenDest.address, user2, maxDestAmount,
//                                 buyRate[1], walletId, emptyHint, {from:networkProxy});
//                 assert(false, "throw was expected in line above.")
//             } catch(e){
//                 assert(Helper.isRevertErrorMessage(e), "expected revert but got: " + e);
//             }

//             let expectedUser1SrcTokBalanceAfter = user1SrcTokBalanceBefore.sub(srcAmountTwei);
//             let expectedUser2DestTokBalanceAfter = user2DestTokBalanceBefore;

//             let user1SrcTokBalanceAfter = await tokenSrc.balanceOf(user1);
//             let user2DestTokBalanceAfter = await tokenDest.balanceOf(user2);

//             Helper.assertEqual(user1SrcTokBalanceAfter, expectedUser1SrcTokBalanceAfter);
//             Helper.assertEqual(user2DestTokBalanceAfter, expectedUser2DestTokBalanceAfter, " diff from calculated rate to actual balance should be 1")
//             //            log("expected trade value: " + expectedDestAmount)
//             assert(user2DestTokBalanceAfter >= expectedUser2DestTokBalanceAfter, "not enough dest token transferred");

//         });

//         it("test token to token, a few trades, both reserves.", async function () {
//             let tokenSrcInd;
//             let tokenDestInd;
//             let tokenSrc = tokens[tokenSrcInd];
//             let tokenDest = tokens[tokenDestInd];
//             let maxDestAmount = (new BN(10)).pow(new BN(17));

//             let srcAmountTwei = (new BN(3450)).sub(new BN(1960));
//             let cumulativeGas = new BN(0);
//             let numTrades = 19;
//             for (let i = 0; i < numTrades; i++) {
// //                log("start trade loop: " + i)
//                 tokenSrcInd = (i + 1) % numTokens;
//                 tokenDestInd = i % numTokens;
//                 tokenSrc = tokens[tokenSrcInd];
//                 tokenDest = tokens[tokenDestInd];
//                 srcAmountTwei = new BN(17).add(new BN(i * 168));
//     //            srcAmountTwei = new BN(743);

//     //            log("src amount: " + srcAmountTwei + " index src: " + tokenSrcInd + " tokenSrc: " + tokenSrc.address + " ind: " + tokenDestInd + " token dest " + tokenDest.address);
//                 rate = await network.getExpectedRate(tokenSrc.address, tokenDest.address, srcAmountTwei);

//                 let ethBalance = await Helper.getBalancePromise(reserve1.address);
//     //            log("eth balance 1 " + ethBalance);
//                 ethBalance = await Helper.getBalancePromise(reserve2.address);
//     //            log("eth balance 2 " + ethBalance);
//                 let destTokBalance = await tokenDest.balanceOf(reserve1.address)
//     //            log("dest token balance 1 " + destTokBalance);
//                 destTokBalance = await tokenDest.balanceOf(reserve2.address)
//     //            log("dest token balance 2 " + destTokBalance);

//     //            log(i  + " expected rate: " + rate);
//                 let expectedDestAmount = calcDstQty(srcAmountTwei, tokenDecimals[tokenSrcInd], tokenDecimals[tokenDestInd], rate[0]);
//     //            log ("src Amount: " + srcAmountTwei +  " expected dest: " + expectedDestAmount)

//                 await tokenSrc.transfer(user1, srcAmountTwei);
//                 await tokenSrc.approve(networkProxy, srcAmountTwei, {from:user1})

//                 let user1SrcTokBalanceBefore = new BN(await tokenSrc.balanceOf(user1));
//                 let user2DestTokBalanceBefore = new BN(await tokenDest.balanceOf(user2));

//                 await tokenSrc.transferFrom(user1, network.address, srcAmountTwei, {from: networkProxy});
//     //            log("trade " + i + " srcInd: " + tokenSrcInd + " dest ind: " + tokenDestInd + " srcQty: " + srcAmountTwei);
//                 let result = await network.tradeWithHint(user1, tokenSrc.address, srcAmountTwei, tokenDest.address, user2, maxDestAmount,
//                                      new BN(rate[1]), walletId, emptyHint, {from:networkProxy});
//                 cumulativeGas = cumulativeGas.add(new BN(result.receipt.gasUsed));

//                 let expectedUser1SrcTokBalanceAfter = user1SrcTokBalanceBefore.sub(srcAmountTwei);
//                 let expectedUser2DestTokBalanceAfter = user2DestTokBalanceBefore.add(expectedDestAmount);

//                 let user1SrcTokBalanceAfter = await tokenSrc.balanceOf(user1);
//                 let user2DestTokBalanceAfter = await tokenDest.balanceOf(user2);

//                 //for token to token can't calculate the exact dest amount.
//                 //since this trade is done in two steps. src --> eth. then eth-->dest. the decimals data is lost.
//                 //since EVM has no decimals.
//                 //but rate reflects rate1 * rate2. and doesn't reflect the lost decimals between step 1 and step 2.
//                 Helper.assertEqual(user1SrcTokBalanceAfter, expectedUser1SrcTokBalanceAfter);
//                 assert(1 >= (user2DestTokBalanceAfter.sub(expectedUser2DestTokBalanceAfter)), " diff from calculated rate to actual balance should be 1")
//     //            log("expected trade value: " + expectedDestAmount)
//                 assert(user2DestTokBalanceAfter >= expectedUser2DestTokBalanceAfter, "not enough dest token transferred");
//             }

//             let avgGas = cumulativeGas.div(new BN(numTrades));
//             log("average gas usage " + numTrades + " buys. token to token: " + avgGas);
//         });
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
//             orderListFactory = await OrderListFactory.new();
//             medianizer = await MockMedianizer.new();
//             await medianizer.setValid(true);
//             await medianizer.setEthPrice(dollarsPerEthPrecision);

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

//         it("deposit tokens to new orderbookReserve, make token to eth orders, see network returns rate value", async() => {
//             //maker deposits tokens
//             let amountKnc = new BN(600).mul(new BN(10).pow(new BN(18)));
//             let amountTokenWeiDeposit = new BN(30).mul((new BN(10)).pow(new BN(18))).add(new BN(600));
//             await makerDeposit(orderbookReserve, permissionlessTok, maker1, 0, amountTokenWeiDeposit, amountKnc);

//             let orderSrcAmountTwei = new BN(9).mul((new BN(10).pow(new BN(18))));
//             let orderDstWei = minNewOrderValue;

//             // first getExpectedRate eth to new toekn should return 0
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
//             let expectedRate = precisionUnits.mul(orderSrcAmountTwei.mul(new BN(2))).div(totalPayValue);
//             rate = await network.getExpectedRate(ethAddress, permissionlessTok.address, totalPayValue);

//             Helper.assertEqual(rate[0].div(new BN(10)), expectedRate.div(new BN(10)));

//             permRate = await network.getExpectedRateOnlyPermission(ethAddress, permissionlessTok.address, totalPayValue);
//             Helper.assertEqual(permRate[0], 0);

//             let orderList = await orderbookReserve.getTokenToEthOrderList();
//             Helper.assertEqual(orderList.length, 2);
//         });

//         it("verify getExpectedRateOnlyPermission reverts when expected rate contract doesn't exist (not set)", async() => {

//             let tempNetwork = await Network.new(admin);

//             try {
//                 await tempNetwork.getExpectedRateOnlyPermission(ethAddress, permissionlessTok.address, new BN(10).pow(new BN(18)));
//                 assert(false, "throw was expected in line above.")
//             } catch(e){
//                 assert(Helper.isRevertErrorMessage(e), "expected revert but got: " + e);
//             }
//         });

//         it("deposit EthWei to new orderbookReserve, make eth to token orders, see network returns rate value", async() => {
//             //maker deposits tokens
//             let numOrders = new BN(2);
//             let amountKnc = new BN(600).mul((new BN(10)).pow(new BN(18)));
//             let amountEthWeiDeposit = minNewOrderValue.mul(numOrders);
//             await makerDeposit(orderbookReserve, permissionlessTok, maker1, amountEthWeiDeposit, 0, amountKnc);

//             let orderSrcWei = minNewOrderValue;
//             let orderDstAmountTwei = new BN(9).mul(new BN(10).pow(new BN(18)));

//             // first getExpectedRate eth to new toekn should return 0
//             let rate = await network.getExpectedRate(permissionlessTok.address, ethAddress, new BN(10).pow(new BN(18)));
//             Helper.assertEqual(rate[0], 0);

//             //now add orders
//             //////////////
//             rc = await orderbookReserve.submitEthToTokenOrder(orderSrcWei, orderDstAmountTwei, {from: maker1});
//             rc = await orderbookReserve.submitEthToTokenOrder(orderSrcWei, (orderDstAmountTwei.add(new BN(1000))), {from: maker1});
//     //        log(rc.logs[0].args)

//             let totalPayValue = (orderDstAmountTwei.mul(new BN(2))).add(new BN(1000));

//             // now getConversionRate > 0
//             let expectedRate = precisionUnits.mul(orderSrcWei.mul(new BN(2))).div(totalPayValue);
//             rate = await network.getExpectedRate(permissionlessTok.address, ethAddress, totalPayValue);
//             let reserveRate = await orderbookReserve.getConversionRate(permissionlessTok.address, ethAddress, totalPayValue, 1);
//             Helper.assertEqual(reserveRate.div(new BN(10)), rate[0].div(new BN(10)), "rate from reserve should match rate from network")

//             let permRate = await network.getExpectedRateOnlyPermission(permissionlessTok.address, ethAddress, totalPayValue);
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
//             let rate = await network.getExpectedRate(ethAddress, permissionlessTok.address, totalPayValue);

//             //trade
//             let txData = await network.tradeWithHint(user1, ethAddress, totalPayValue, permissionlessTok.address, user2, (new BN(10)).pow(new BN(30)),
//                             rate[1], zeroAddress, emptyHint, {from:networkProxy, value:totalPayValue});
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
//             await permissionlessTok.transfer(network.address, totalPayValue);
//             let txData = await network.tradeWithHint(user1, permissionlessTok.address, totalPayValue, ethAddress, user2,
//                         (new BN(10)).pow(new BN(30)), rate[1], zeroAddress, emptyHint, {from:networkProxy});
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

<<<<<<< HEAD
//             //verify reserve exists in network
//             let reserveAddress = await network.reservesPerTokenDest(token0, 2);
//             let listReserveAddress = await reserveLister.reserves(token0);
//             Helper.assertEqual(reserveAddress, listReserveAddress);

//             orderbookReserveTok0 = await OrderbookReserve.at(reserveAddress);
//         })

//         it("list an existing token with better rate then other reserves (buy), get rate with / without permissionless, see rate diff", async() => {
//             //maker deposits tokens
//             let amountKnc = new BN(600).mul(new BN(10).pow(new BN(18)));
//             let amountTokenWeiDeposit = (new BN(20).mul(new BN(10).pow(new BN(18))).add(new BN(600)));
//             await makerDeposit(orderbookReserveTok0, tokens[0], maker1, 0, amountTokenWeiDeposit, amountKnc);

//             let orderSrcAmountTwei = new BN(9).mul(new BN(10).pow(new BN(18)));
//             let orderDstWei = minNewOrderValue;
=======
            //verify reserve exists in network
            let reserveAddress = await network.reservesPerTokenDest(token0, 2);
            let listReserveAddress = await reserveLister.reserves(token0);
            Helper.assertEqual(reserveAddress, listReserveAddress);

            orderbookReserveTok0 = await OrderbookReserve.at(reserveAddress);
        })

        it("list an existing token with better rate then other reserves (buy), get rate with / without permissionless, see rate diff", async() => {
            //maker deposits tokens
            let amountKnc = new BN(600).mul(new BN(10).pow(new BN(18)));
            let amountTokenWeiDeposit = (new BN(20).mul(new BN(10).pow(new BN(18))).add(new BN(600)));
            await makerDeposit(orderbookReserveTok0, tokens[0], maker1, 0, amountTokenWeiDeposit, amountKnc);

            let orderSrcAmountTwei = new BN(9).mul(new BN(10).pow(new BN(18)));
            let orderDstWei = minNewOrderValue;
>>>>>>> development

//             let tradeValue = 10000;
//             let networkRateBefore = await network.getExpectedRate(ethAddress, token0, tradeValue);

<<<<<<< HEAD
//             //now add order
//             //////////////
//             rc = await orderbookReserveTok0.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei, {from: maker1});
//             let orderList = await orderbookReserveTok0.getTokenToEthOrderList();
//             Helper.assertEqual(orderList.length, 1);

//             // now getConversionRate > 0
//             let expectedRate = precisionUnits.mul(orderSrcAmountTwei).div(orderDstWei);
//             let networkRate = await network.getExpectedRate(ethAddress, token0, tradeValue);
//             let reserveRate = await orderbookReserveTok0.getConversionRate(ethAddress, token0, tradeValue, 3);
//             Helper.assertEqual(reserveRate, networkRate[0]);
// //            log("reserve rate: " + reserveRate)
// //            log("network rate: " + networkRate)

// //            Helper.assertEqual(networkRate[0].div(10), expectedRate.div(10);
=======
            //now add order
            //////////////
            rc = await orderbookReserveTok0.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei, {from: maker1});
            let orderList = await orderbookReserveTok0.getTokenToEthOrderList();
            Helper.assertEqual(orderList.length, 1);

            // now getConversionRate > 0
            let expectedRate = precisionUnits.mul(orderSrcAmountTwei).div(orderDstWei);
            let networkRate = await network.getExpectedRate(ethAddress, token0, tradeValue);
            let reserveRate = await orderbookReserveTok0.getConversionRate(ethAddress, token0, tradeValue, 3);
            Helper.assertEqual(reserveRate, networkRate[0]);
//            log("reserve rate: " + reserveRate)
//            log("network rate: " + networkRate)

//            Helper.assertEqual(networkRate[0].div(10), expectedRate.div(10);
>>>>>>> development

//             let networkRateOnlyPerm = await network.getExpectedRateOnlyPermission(ethAddress, token0, tradeValue);

<<<<<<< HEAD
//             Helper.assertEqual(networkRateOnlyPerm[0], networkRateBefore[0]);
//         })

//         it("test getting rate only permissioned with hint", async() => {
//             rateHint = new BN(await network.PERM_HINT_GET_RATE());
//             let qty = new BN(10).pow(new BN(18));
=======
            Helper.assertEqual(networkRateOnlyPerm[0], networkRateBefore[0]);
        })

        it("test getting rate only permissioned with hint", async() => {
            rateHint = new BN(await network.PERM_HINT_GET_RATE());
            let qty = new BN(10).pow(new BN(18));
>>>>>>> development

//             let networkRate = await network.getExpectedRate(ethAddress, token0, qty);
//             let networkRateOnlyPerm = await network.getExpectedRateOnlyPermission(ethAddress, token0, qty);
//             let networkRateOnlyPermWhint = await network.getExpectedRate(ethAddress, token0, rateHint.add(qty));

<<<<<<< HEAD
//             assert(networkRate[0] != networkRateOnlyPerm[0]);
//             Helper.assertEqual(networkRateOnlyPerm[0], networkRateOnlyPermWhint[0]);
//         })

//         it("trade (buy) token listed regular and order book. see token taken from order book reserve(better rate)", async() => {
//             let tradeValue = new BN(10000);
//             let rate = await network.getExpectedRate(ethAddress, token0, tradeValue);

//             //trade
//             let makerEthFundsBefore = new BN(await orderbookReserveTok0.makerFunds(maker1, ethAddress));
//             let txData = await network.tradeWithHint(user1, ethAddress, tradeValue, token0, user2,
//                         (new BN(10)).pow(new BN(30)), rate[1], zeroAddress, emptyHint, {from:networkProxy, value: tradeValue});
=======
            assert(networkRate[0] != networkRateOnlyPerm[0]);
            Helper.assertEqual(networkRateOnlyPerm[0], networkRateOnlyPermWhint[0]);
        })

        it("trade (buy) token listed regular and order book. see token taken from order book reserve(better rate)", async() => {
            let tradeValue = new BN(10000);
            let rate = await network.getExpectedRate(ethAddress, token0, tradeValue);

            //trade
            let makerEthFundsBefore = new BN(await orderbookReserveTok0.makerFunds(maker1, ethAddress));
            let txData = await network.tradeWithHint(user1, ethAddress, tradeValue, token0, user2,
                        (new BN(10)).pow(new BN(30)), rate[1], zeroAddress, emptyHint, {from:networkProxy, value: tradeValue});
>>>>>>> development

//             let makerEthFundsAfter = await orderbookReserveTok0.makerFunds(maker1, ethAddress);
//             let expectedMakerEthFunds = makerEthFundsBefore.add(tradeValue);

<<<<<<< HEAD
//             Helper.assertEqual(makerEthFundsAfter, expectedMakerEthFunds);
//         })

//         it("trade (buy) token listed regular and order book. when permissionless not allowed. see token taken from regular reserve", async() => {
//             let tradeValue = 10000;
//             let rate = await network.getExpectedRateOnlyPermission(ethAddress, token0, tradeValue);

//             //trade
//             let hint = 'PERM';
//             let hintBytes32 = web3.utils.fromAscii(hint);

//             let makerEthFundsBefore = new BN(await orderbookReserveTok0.makerFunds(maker1, ethAddress));
//             let txData = await network.tradeWithHint(user1, ethAddress, tradeValue, token0, user2,
//                       (new BN(10)).pow(new BN(30)), rate[1], zeroAddress, hintBytes32, {from:networkProxy, value: tradeValue});

//             let makerEthFundsAfter = new BN(await orderbookReserveTok0.makerFunds(maker1, ethAddress));

//             Helper.assertEqual(makerEthFundsAfter, makerEthFundsBefore);
//         })

//         it("list an existing token with better rate then other reserves (sell), get rate with / without permissionless, see rate diff", async() => {
//             //maker deposits Eth
//             let amountEthWeiDeposit = minNewOrderValue.add(new BN(600));
//             await makerDeposit(orderbookReserveTok0, tokens[0], maker1, amountEthWeiDeposit, 0, 0);

//             let orderSrcAmountWei = minNewOrderValue;
//             let orderDstTwei = new BN(1.7).mul(new BN(10).pow(new BN(14)));

//             let tradeValue = new BN(10000);
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

// //            Helper.assertEqual(networkRate[0].div(10), expectedRate.div(10));

//             let networkRateOnlyPerm = await network.getExpectedRateOnlyPermission(token0, ethAddress, tradeValue);

//             Helper.assertEqual(networkRateOnlyPerm[0], networkRateBefore[0]);
//         })

//         it("trade (sell) token listed regular and order book. see token taken from order book reserve(better rate)", async() => {
//             let tradeValue = new BN(10000);
//             let rate = await network.getExpectedRate(token0, ethAddress, tradeValue);

//             //trade
//             let makerTokFundsBefore = new BN(await orderbookReserveTok0.makerFunds(maker1, token0));
//             await tokens[0].transfer(network.address, tradeValue);
//             let txData = await network.tradeWithHint(user1, token0, tradeValue, ethAddress, user2,
//                         (new BN(10)).pow(new BN(30)), rate[1], zeroAddress, emptyHint, {from:networkProxy});

//             let makerTokFundsAfter = await orderbookReserveTok0.makerFunds(maker1, token0);
//             let expectedMakerTokFunds = makerTokFundsBefore.add(tradeValue);

//             Helper.assertEqual(makerTokFundsAfter, expectedMakerTokFunds);
//         })

//         it("trade (sell) token listed regular and order book permissionless not allowed. see token taken from regular reserve", async() => {
//             let tradeValue = 10000;
//             let rate = await network.getExpectedRateOnlyPermission(token0, ethAddress, tradeValue);

//             //trade
//             let hint = 'PERM';
//             let hintBytes32 = web3.utils.fromAscii(hint);

//             let makerTokFundsBefore = new BN(await orderbookReserveTok0.makerFunds(maker1, token0));
//             await tokens[0].transfer(network.address, tradeValue);
//             let txData = await network.tradeWithHint(user1, token0, tradeValue, ethAddress, user2,
//                       (new BN(10)).pow(new BN(30)), rate[1], zeroAddress, hintBytes32, {from:networkProxy});

//             let makerTokFundsAfter = await orderbookReserveTok0.makerFunds(maker1, token0);

//             Helper.assertEqual(makerTokFundsAfter, makerTokFundsBefore);
//         });

//         it("get rate token to token with token listed regular and permissionless. see diff", async() => {
//             let tradeValue = new BN(10000);
//             token1 = tokens[1].address;

//             let rate = await network.getExpectedRate(token0, token1, tradeValue);
//             let permRate = await network.getExpectedRateOnlyPermission(token0, token1, tradeValue);
//             Helper.assertGreater(rate[0],permRate[0],"rate: " + rate[0] + " !>  permission only rate: " +
//             permRate[0]);

//             rate = await network.getExpectedRate(token1, token0, tradeValue);
//             permRate = await network.getExpectedRateOnlyPermission(token1, token0, tradeValue);
//             assert(rate[0] > permRate[0]);
//         });

//         it("trade token to token with / without permissionless. see as expected", async() => {
//             let tradeValue = new BN(10000);
//             let rate = await network.getExpectedRate(token0, token1, tradeValue);

//             //trade
//             let makerTokFundsBefore = new BN(await orderbookReserveTok0.makerFunds(maker1, token0));
//             await tokens[0].transfer(network.address, tradeValue);
//             let txData = await network.tradeWithHint(user1, token0, tradeValue, token1, user2,
//                         (new BN(10)).pow(new BN(30)), rate[1], zeroAddress, emptyHint, {from:networkProxy});
//             log("token to token with permissionless. partial order amount. gas: " + txData.receipt.gasUsed);

//             let makerTokFundsAfter1 = await orderbookReserveTok0.makerFunds(maker1, token0);
//             let expectedMakerTokFunds = makerTokFundsBefore.add(tradeValue);

//             Helper.assertEqual(makerTokFundsAfter1, expectedMakerTokFunds);

//             //now only permissioned
//             rate = await network.getExpectedRateOnlyPermission(token0, token1, tradeValue);
//             let hint = web3.utils.fromAscii("PERM");
//             await tokens[0].transfer(network.address, tradeValue);
//             txData = await network.tradeWithHint(user1, token0, tradeValue, token1, user2,
//                                 (new BN(10)).pow(new BN(30)), rate[1], zeroAddress, hint, {from:networkProxy});
//             let makerTokFundsAfter2 = await orderbookReserveTok0.makerFunds(maker1, token0);
//             Helper.assertEqual(makerTokFundsAfter1, makerTokFundsAfter2);
//         })

//         it("trade token to token with / without permissionless. see as expected", async() => {
//             let tradeValue = 10000;
//             let rate = await network.getExpectedRate(token1, token0, tradeValue);

//             //trade
//             let makerTokFundsBefore = new BN(await orderbookReserveTok0.makerFunds(maker1, ethAddress));
//             await tokens[1].transfer(network.address, tradeValue);
//             let txData = await network.tradeWithHint(user1, token1, tradeValue, token0, user2,
//                          (new BN(10)).pow(new BN(30)), rate[1], zeroAddress, emptyHint, {from:networkProxy});
//             log("token to token with permissionless. partial order amount. gas: " + txData.receipt.gasUsed);

//             let makerTokFundsAfter1 = await orderbookReserveTok0.makerFunds(maker1, ethAddress);
//             assert(makerTokFundsAfter1 > makerTokFundsBefore, "makerTokFundsAfter1: " + makerTokFundsAfter1 +
//                 " should be > makerTokFundsBefore: " + makerTokFundsBefore);

//             //now only permissioned
//             rate = await network.getExpectedRateOnlyPermission(token1, token0, tradeValue);
//             let hint = web3.utils.fromAscii("PERM");
//             await tokens[1].transfer(network.address, tradeValue);
//             txData = await network.tradeWithHint(user1, token1, tradeValue, token0, user2,
//                          (new BN(10)).pow(new BN(30)), rate[1], zeroAddress, hint, {from:networkProxy});
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
//             goodRate = await network.getExpectedRate(tokenAdd, ethAddress, totalPayValue);
//             //not as good when a bit higher quantity
//             let regularRate = await network.getExpectedRate(tokenAdd, ethAddress, totalPayValue.add(new BN(4)));
//             assert(goodRate[0] > regularRate[0]);

//             //now trade this token with permission less disabled. see gas
//             let hint = 'PERM';
//             let hintBytes32 = web3.utils.fromAscii(hint);
//             let tradeValue = totalPayValue.add(new BN(4));

//             await tokens[0].transfer(network.address, tradeValue);
//             let txPermData = await network.tradeWithHint(user1, token0, tradeValue, ethAddress, user2,
//                                   (new BN(10)).pow(new BN(30)), regularRate[1], zeroAddress, hintBytes32, {from:networkProxy});
//             log("gas only permissioned: " + txPermData.receipt.gasUsed);

//             await tokens[0].transfer(network.address, tradeValue);
//             txPermLessData = await network.tradeWithHint(user1, token0, tradeValue, ethAddress, user2,
//                                   (new BN(10)).pow(new BN(30)), regularRate[1], zeroAddress, emptyHint, {from:networkProxy});
//             log("gas with traversing permissionless 9 orders (not taking): " + txPermLessData.receipt.gasUsed);

//             log("gas effect of traversing 9 orders in get rate (not taking): " +
//                 (txPermLessData.receipt.gasUsed - txPermData.receipt.gasUsed));

//             await tokens[0].transfer(network.address, tradeValue);
//             txData = await network.tradeWithHint(user1, token0, totalPayValue, ethAddress, user2,
//                                               (new BN(10)).pow(new BN(30)), regularRate[1], zeroAddress, emptyHint, {from:networkProxy});
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

//             await tokens[0].transfer(network.address, tradeValue);
//             let txPermData = await network.tradeWithHint(user1, token0, tradeValue, ethAddress, user2,
//                                   (new BN(10)).pow(new BN(30)), regularRate[1], zeroAddress, hintBytes32, {from:networkProxy});
//             log("gas only permissioned: " + txPermData.receipt.gasUsed);

//             await tokens[0].transfer(network.address, tradeValue);
//             txPermLessData = await network.tradeWithHint(user1, token0, tradeValue, ethAddress, user2,
//                                   (new BN(10)).pow(new BN(30)), regularRate[1], zeroAddress, emptyHint, {from:networkProxy});
//             log("gas with traversing permissionless 5 orders (not taking): " + txPermLessData.receipt.gasUsed);

//             log("gas effect of traversing 5 orders in get rate (not taking): " +
//                 (txPermLessData.receipt.gasUsed - txPermData.receipt.gasUsed));

//             await tokens[0].transfer(network.address, tradeValue);
//             txData = await network.tradeWithHint(user1, token0, totalPayValue, ethAddress, user2,
//                                               (new BN(10)).pow(new BN(30)), regularRate[1], zeroAddress, emptyHint, {from:networkProxy});
//             log("gas 5 orders from permissionless: " + txData.receipt.gasUsed);
//         });

//         it("see gas consumption when taking 3.6, 4.6, 5.6, 6.6, 7.6 orders. remaining removed.", async() => {
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
//             await permissionlessTok.transfer(network.address, tradeValue);
//             txData = await network.tradeWithHint(user1, permissionlessTok.address, tradeValue, ethAddress, user2,
//                                                     (new BN(10)).pow(new BN(30)), 10, zeroAddress, emptyHint, {from:networkProxy});
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
//             await permissionlessTok.transfer(network.address, tradeValue);
//             txData = await network.tradeWithHint(user1, permissionlessTok.address, tradeValue, ethAddress, user2,
//                                                     (new BN(10)).pow(new BN(30)), 10, zeroAddress, emptyHint, {from:networkProxy});
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
//             await permissionlessTok.transfer(network.address, tradeValue);
//             txData = await network.tradeWithHint(user1, permissionlessTok.address, tradeValue, ethAddress, user2,
//                                                     (new BN(10)).pow(new BN(30)), 10, zeroAddress, emptyHint, {from:networkProxy});
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
//             await permissionlessTok.transfer(network.address, tradeValue);
//             txData = await network.tradeWithHint(user1, permissionlessTok.address, tradeValue, ethAddress, user2,
//                                                     (new BN(10)).pow(new BN(30)), 10, zeroAddress, emptyHint, {from:networkProxy});
//             log("gas price taking 6.7 orders. remaining removed: " + txData.receipt.gasUsed);

//             orderList = await orderbookReserve.getEthToTokenOrderList();
//             Helper.assertEqual(orderList.length, 0);
//         });
//     });

//     describe("enhanced step functions", function() {
//         it("enhance step func: setup reserve for enhance step function", async function () {
//             //disable reserve 1 & 2, add new reserve to network
//             await reserve1.disableTrade({from:alerter});
//             await reserve2.disableTrade({from:alerter});
//             await network.addReserve(reserve4.address, false, {from: operator});
//             for (let i = 0; i < numTokens; i++) {
//                 // unlist token for reserve 1 and 2
//                 await network.listPairForReserve(reserve1.address, tokenAdd[i], true, true, false, {from: operator});
//                 await network.listPairForReserve(reserve2.address, tokenAdd[i], true, true, false, {from: operator});
//                 await network.listPairForReserve(reserve4.address, tokenAdd[i], true, true, true, {from: operator});
//             }
//         });

//         it("should test token to eth with few steps function", async function () {
//             for(let step = 0; step < 5; step++) {
//                 let tokenInd = 2;
//                 let token = tokens[tokenInd]; //choose some token
//                 let amountTwei = new BN(100 * step + 20);
//                 let user = accounts[9];
//                 try {
//                     //verify base rate
//                     let rate = await network.getExpectedRate(tokenAdd[tokenInd], ethAddress, amountTwei);
//                     let expected = calculateRateAmountNewConversionRate(false, tokenInd, amountTwei);
//                     let expectedRate = expected[0];
//                     let expectedAmountWei = expected[1];
//                     expectedRate = calcCombinedRate(amountTwei, expectedRate, precisionUnits, tokenDecimals[tokenInd], 18, expectedAmountWei);
//                     //check correct rate calculated
//                     Helper.assertEqual(rate[0], expectedRate, "unexpected rate.");

//                     await token.transfer(network.address, amountTwei);

//                     //perform trade
//                     let txData = await network.tradeWithHint(user, tokenAdd[tokenInd], amountTwei, ethAddress, user, 500000,
//                                     rate[1], walletId, emptyHint, {from:networkProxy});
//                     if (step < 2) {
//                         console.log("Transaction gas used token to eth for " + (step + 1) + " sell steps: " + txData.receipt.gasUsed);
//                     }
//                     //check lower ether balance on reserve
//                     expectedReserve4BalanceWei = expectedReserve4BalanceWei.sub(expectedAmountWei);
//                     let balance = await Helper.getBalancePromise(reserve4.address);
//                     Helper.assertEqual(balance, expectedReserve4BalanceWei, "bad reserve balance wei");

//                     //check token balances
//                     ///////////////////////
//                     //check token balance on user
//                     let tokenTweiBalance = await token.balanceOf(user);
//                     let expectedTweiAmount = 0;
//                     Helper.assertEqual(tokenTweiBalance, expectedTweiAmount, "bad token balance");

//                     //check higher token balance on reserve
//                     reserve4TokenBalance[tokenInd] = reserve4TokenBalance[tokenInd].add(amountTwei);
//                     reserve4TokenImbalance[tokenInd] = reserve4TokenImbalance[tokenInd].sub(amountTwei); //imbalance represents how many missing tokens
//                     let reportedBalance = await token.balanceOf(reserve4.address);
//                     Helper.assertEqual(reportedBalance, reserve4TokenBalance[tokenInd], "bad token balance on reserve");
//                 } catch (e) {
//                     console.log("oooops " + e);
//                     throw e;
//                 }
//             }
//         });

//         it("should test few trades eth to token", async function () {
//             let numTrades = 10;
//             let gasUsed = 0;
//             for(let i = 0; i < numTrades; i++) {
//                 let tokenInd = 2;
//                 let token = tokens[tokenInd]; //choose some token
//                 let amountTwei = new BN(15 * i + 100);
//                 let user = accounts[9];
//                 try {
//                     //verify base rate
//                     let rate = await network.getExpectedRate(ethAddress, tokenAdd[tokenInd], amountTwei);
//                     //check correct rate calculated

//                     assert.notEqual(rate[0], 0, "rate should be not zero.");

//                     let userTokenBalanceBefore = await token.balanceOf(user);
//                     //perform trade
//                     let txData = await network.tradeWithHint(user, ethAddress, amountTwei, tokenAdd[tokenInd], user, 500000,
//                                     rate[1], walletId, emptyHint, {from:networkProxy, value: amountTwei});
//                     gasUsed += txData.receipt.gasUsed;
//                     let expectedAmountWei = txData.logs[0].args.dstAmount;
//                     //check higher ether balance on reserve
//                     expectedReserve4BalanceWei = expectedReserve4BalanceWei.add(amountTwei);
//                     let balance = await Helper.getBalancePromise(reserve4.address);
//                     Helper.assertEqual(balance, expectedReserve4BalanceWei, "bad reserve balance wei");

//                     //check token balances
//                     ///////////////////////
//                     //check token balance on user
//                     let tokenTweiBalance = await token.balanceOf(user);
//                     let expectedTweiAmount = userTokenBalanceBefore.add(expectedAmountWei);
//                     Helper.assertEqual(tokenTweiBalance, expectedTweiAmount, "bad token balance");

//                     //check lower token balance on reserve
//                     reserve4TokenBalance[tokenInd] = reserve4TokenBalance[tokenInd].sub(expectedAmountWei);
//                     reserve4TokenImbalance[tokenInd] = reserve4TokenImbalance[tokenInd].add(expectedAmountWei); //imbalance represents how many missing tokens
//                     let reportedBalance = await token.balanceOf(reserve4.address);
//                     Helper.assertEqual(reportedBalance, reserve4TokenBalance[tokenInd], "bad token balance on reserve");
//                 } catch (e) {
//                     console.log("oooops " + e);
//                     throw e;
//                 }
//             }
//             console.log("Average gas used for " + numTrades + " eth to token trades: " + gasUsed / numTrades);
//         });

//         it("should only enable new reserve. perform buy and check: balances changed as expected.", async function () {
//             let tokenInd = 1;
//             let token = tokens[tokenInd]; //choose some token
//             let amountWei = new BN(330);
//             let user = accounts[9];
//             try {
//                 //verify base rate
//                 let buyRate = await network.getExpectedRate(ethAddress, tokenAdd[tokenInd], amountWei);
//                 let expected = calculateRateAmountNewConversionRate(true, tokenInd, amountWei);
//                 let expectedRate = expected[0];
//                 let expectedTweiAmount = expected[1];
//                 let oldUserTokenBal = await token.balanceOf(user);

//                 expectedRate = calcCombinedRate(amountWei, precisionUnits, expectedRate, 18, tokenDecimals[tokenInd], expectedTweiAmount);

//                 //check correct rate calculated
//                 Helper.assertEqual(buyRate[0], expectedRate, "unexpected rate.");

//                 //perform trade
//                 let txData = await network.tradeWithHint(user, ethAddress, amountWei, tokenAdd[tokenInd], user, 50000,
//                     buyRate[1], walletId, emptyHint, {from:networkProxy, value:amountWei});
//                 console.log("Transaction gas used: " + txData.receipt.gasUsed);

//                 Helper.assertEqual(txData.logs[0].args.srcAmount, amountWei);
//                 Helper.assertEqual(txData.logs[0].args.dstAmount, expectedTweiAmount);

//                 //check higher ether balance on reserve
//                 expectedReserve4BalanceWei = expectedReserve4BalanceWei.add(amountWei);
//                 let balance = await Helper.getBalancePromise(reserve4.address);
//                 Helper.assertEqual(balance, expectedReserve4BalanceWei, "bad reserve balance wei");

//                 //check token balances
//                 ///////////////////////

//                 //check token balance on user
//                 let tokenTweiBalance = await token.balanceOf(user);
//                 Helper.assertEqual(tokenTweiBalance, oldUserTokenBal.add(expectedTweiAmount), "bad token balance");

//                 //check lower token balance on reserve
//                 reserve4TokenBalance[tokenInd] = reserve4TokenBalance[tokenInd].sub(expectedTweiAmount);
//                 reserve4TokenImbalance[tokenInd] = reserve4TokenImbalance[tokenInd].add(expectedTweiAmount); //imbalance represents how many missing tokens
//                 let reportedBalance = await token.balanceOf(reserve4.address);
//                 Helper.assertEqual(reportedBalance, reserve4TokenBalance[tokenInd], "bad token balance on reserve");
//             } catch (e) {
//                 console.log("oooops " + e);
//                 throw e;
//             }
//         });

//         it("should only enable new reserve perform sell and check: balances changed as expected.", async function () {
//             let tokenInd = 2;
//             let token = tokens[tokenInd]; //choose some token
//             let amountTwei = new BN(1030);
//             let user = accounts[9];
//             try {
//                 //verify base rate
//                 let rate = await network.getExpectedRate(tokenAdd[tokenInd], ethAddress, amountTwei);
//                 let expected = calculateRateAmountNewConversionRate(false, tokenInd, amountTwei);
//                 let expectedRate = expected[0];
//                 let expectedAmountWei = expected[1];
//                 expectedRate = calcCombinedRate(amountTwei, expectedRate, precisionUnits, tokenDecimals[tokenInd], 18, expectedAmountWei);
//                 //check correct rate calculated
//                 Helper.assertEqual(rate[0], expectedRate, "unexpected rate.");

//                 let userTokenBalBefore = await token.balanceOf(user);
//                 await token.transfer(network.address, amountTwei);

//                 //perform trade
//                 let txData = await network.tradeWithHint(user, tokenAdd[tokenInd], amountTwei, ethAddress, user, 500000,
//                                 rate[1], walletId, emptyHint, {from:networkProxy});
//                 console.log("Transaction gas used: " + txData.receipt.gasUsed);
//                 //check lower ether balance on reserve
//                 expectedReserve4BalanceWei = expectedReserve4BalanceWei.sub(expectedAmountWei);
//                 let balance = await Helper.getBalancePromise(reserve4.address);
//                 Helper.assertEqual(balance, expectedReserve4BalanceWei, "bad reserve balance wei");

//                 //check token balances
//                 ///////////////////////

//                 //check token balance on user
//                 let tokenTweiBalance = await token.balanceOf(user);
//                 Helper.assertEqual(tokenTweiBalance, userTokenBalBefore, "bad token balance");

//                 //check higher token balance on reserve
//                 reserve4TokenBalance[tokenInd] = reserve4TokenBalance[tokenInd].add(amountTwei);
//                 reserve4TokenImbalance[tokenInd] = reserve4TokenImbalance[tokenInd].sub(amountTwei); //imbalance represents how many missing tokens
//                 let reportedBalance = await token.balanceOf(reserve4.address);
//                 Helper.assertEqual(reportedBalance, reserve4TokenBalance[tokenInd], "bad token balance on reserve");
//             } catch (e) {
//                 console.log("oooops " + e);
//                 throw e;
//             }
//         });
//     });
// });

// function convertRateToConversionRatesRate (baseRate) {
// // conversion rate in pricing is in precision units (10 ** 18) so
// // rate 1 to 50 is 50 * 10 ** 18
// // rate 50 to 1 is 1 / 50 * 10 ** 18 = 10 ** 18 / 50a
//     return ((new BN(10).pow(new BN(18))).mul(baseRate));
// };

// function getExtraBpsForBuyQuantity(qty) {
//     for (let i = 0; i < qtyBuyStepX.length; i++) {
//         if (qty <= qtyBuyStepX[i]) return qtyBuyStepY[i];
//     }
//     return qtyBuyStepY[qtyBuyStepY.length - 1];
// };

// function getExtraBpsForSellQuantity(qty) {
//     for (let i = 0; i < qtySellStepX.length; i++) {
//         if (qty <= qtySellStepX[i]) return qtySellStepY[i];
//     }
//     return qtySellStepY[qtySellStepY.length - 1];
// };

// function getExtraBpsForImbalanceBuyQuantity(qty) {
//     for (let i = 0; i < imbalanceBuyStepX.length; i++) {
//         if (qty <= imbalanceBuyStepX[i]) return imbalanceBuyStepY[i];
//     }
//     return (imbalanceBuyStepY[imbalanceBuyStepY.length - 1]);
// };

// function getExtraBpsForImbalanceSellQuantity(qty) {
//     for (let i = 0; i < imbalanceSellStepX.length; i++) {
//         if (qty <= imbalanceSellStepX[i]) return imbalanceSellStepY[i];
//     }
//     return (imbalanceSellStepY[imbalanceSellStepY.length - 1]);
// };

// function compareRates (receivedRate, expectedRate) {
//     expectedRate = expectedRate - (expectedRate % 10);
//     receivedRate = receivedRate - (receivedRate % 10);
//     Helper.assertEqual(expectedRate, receivedRate, "different rates");
// };

// function calculateRateAmount(isBuy, tokenInd, srcQty, reserveIndex, maxDestAmount) {
//     let expectedRate;
//     let expectedAmount;
//     let baseArray;
//     let imbalanceArray;
//     let expected = [];

//     if (reserveIndex != 1 && reserveIndex != 2) return "error";

//     if (isBuy) {
//         if (reserveIndex == 1) {
//             imbalanceArray = reserve1TokenImbalance;
//             baseArray = baseBuyRate1;
//         } else {
//             baseArray = baseBuyRate2;
//             imbalanceArray = reserve2TokenImbalance;
//         }

//     } else {
//         if (reserveIndex == 1) {
//             imbalanceArray = reserve1TokenImbalance;
//             baseArray = baseSellRate1;
//         } else {
//             imbalanceArray = reserve2TokenImbalance;
//             baseArray = baseSellRate2;
//         }
//     }

//     if (isBuy) {
//         expectedRate = (new BN(baseArray[tokenInd]));
//         let dstQty = calcDstQty(srcQty, 18, tokenDecimals[tokenInd], expectedRate);
//         let extraBps = getExtraBpsForBuyQuantity(dstQty);
//         expectedRate = Helper.addBps(expectedRate, extraBps);
//         let relevantImbalance = imbalanceArray[tokenInd] * 1 + dstQty * 1;
//         extraBps = getExtraBpsForImbalanceBuyQuantity(relevantImbalance);
//         expectedRate = Helper.addBps(expectedRate, extraBps);
//         expectedAmount = calcDstQty(srcQty, 18, tokenDecimals[tokenInd], expectedRate);
//     } else {
//         expectedRate = (new BN(baseArray[tokenInd]));
//         let extraBps = getExtraBpsForSellQuantity(srcQty);
//         expectedRate = Helper.addBps(expectedRate, extraBps);
//         let relevantImbalance = imbalanceArray[tokenInd] - srcQty;
//         extraBps = getExtraBpsForImbalanceSellQuantity(relevantImbalance);
//         expectedRate = Helper.addBps(expectedRate, extraBps);
//         expectedAmount = calcDstQty(srcQty, tokenDecimals[tokenInd], 18, expectedRate);
//     }

//     expected = [expectedRate, expectedAmount];
//     return expected;
// }

// function getExtraBpsForImbalanceBuyQuantityNew(currentImbalance, qty) {
//     return getExtraBpsForQuantity(currentImbalance, currentImbalance + qty, imbalanceBuyStepX, imbalanceBuyStepYNew);
// };

// function getExtraBpsForImbalanceSellQuantityNew(currentImbalance, qty) {
//     return getExtraBpsForQuantity(currentImbalance - qty, currentImbalance, imbalanceSellStepX, imbalanceSellStepYNew);
// };

// function getExtraBpsForQuantity(from, to, stepX, stepY) {
//     if (stepY.length == 0) { return 0; }
//     let len = stepX.length;
//     if (from == to) {
//         return 0;
//     }
//     let change = 0;
//     let qty = to - from;
//     for(let i = 0; i < len; i++) {
//         if (stepX[i] <= from) { continue; }
//         if (stepY[i] == -10000) { return -10000; }
//         if (stepX[i] >= to) {
//             change += (to - from) * stepY[i];
//             from = to;
//             break;
//         } else {
//             change += (stepX[i] - from) * stepY[i];
//             from = stepX[i];
//         }
//     }
//     if (from < to) {
//         if (stepY[len] == -10000) { return -10000; }
//         change += (to - from) * stepY[len];
//     }
//     return divSolidity(change, qty);
// }

// function calculateRateAmountNewConversionRate(isBuy, tokenInd, srcQty) {
//     let expectedRate;
//     let expectedAmount;
//     let expected = [];

//     if (isBuy) {
//         expectedRate = (new BN(baseBuyRate4[tokenInd]));
//         let dstQty = calcDstQty(srcQty, 18, tokenDecimals[tokenInd], expectedRate);
//         let extraBps = getExtraBpsForImbalanceBuyQuantityNew(reserve4TokenImbalance[tokenInd] * 1, dstQty * 1);
//         expectedRate = Helper.addBps(expectedRate, extraBps);
//         expectedAmount = calcDstQty(srcQty, 18, tokenDecimals[tokenInd], expectedRate);
//     } else {
//         expectedRate = (new BN(baseSellRate4[tokenInd]));
//         let extraBps = getExtraBpsForImbalanceSellQuantityNew(reserve4TokenImbalance[tokenInd] * 1, srcQty * 1);
//         expectedRate = Helper.addBps(expectedRate, extraBps);
//         expectedAmount = calcDstQty(srcQty, tokenDecimals[tokenInd], 18, expectedRate);
//     }

//     expected = [expectedRate, expectedAmount];
//     return expected;
// }

// function compareRates (receivedRate, expectedRate) {
//     expectedRate = expectedRate - (expectedRate % 10);
//     receivedRate = receivedRate - (receivedRate % 10);
//     Helper.assertEqual(expectedRate, receivedRate, "different prices");
// };

// function calcDstQty(srcQty, srcDecimals, dstDecimals, rate) {
//     srcQty = new BN(srcQty);
//     rate = new BN(rate);
//     if (dstDecimals >= srcDecimals) {
//         let decimalDiff = (new BN(10)).pow(new BN(dstDecimals - srcDecimals));
//         return rate.mul(srcQty).mul(decimalDiff).div(precisionUnits);
//     } else {
//         let decimalDiff = (new BN(10)).pow(new BN(dstDecimals - srcDecimals));
//         return rate.mul(srcQty).div(decimalDiff.mul(precisionUnits));
//     }
// }

// function calcSrcQty(dstQty, srcDecimals, dstDecimals, rate) {
//     //source quantity is rounded up. to avoid dest quantity being too low.
//     let srcQty;
//     let numerator;
//     let denominator;
//     if (srcDecimals >= dstDecimals) {
//         numerator = precisionUnits.mul(dstQty).mul((new BN(10)).pow(new BN(srcDecimals - dstDecimals)));
//         denominator = new BN(rate);
//     } else {
//         numerator = precisionUnits.mul(dstQty);
//         denominator = (new BN(rate)).mul((new BN(10)).pow(new BN(dstDecimals - srcDecimals)));
//     }
//     srcQty = (numerator.add(denominator.sub(new BN(1)))).div(denominator); //avoid rounding down errors
//     return srcQty;
// }

// function calcCombinedRate(srcQty, sellRate, buyRate, srcDecimals, dstDecimals, destQty) {
//     // calculates rate from src and expected dest amount.
//     let rate;
//     srcQty = new BN(srcQty);
//     destQty = new BN(destQty);
//     if (dstDecimals >= srcDecimals) {
//         rate = new BN(precisionUnits.mul(destQty)).div(((new BN(10)).pow(new BN(dstDecimals - srcDecimals))).mul(srcQty));
//     } else {
//         rate = new BN(precisionUnits.mul(destQty).mul((new BN(10)).pow(new BN(srcDecimals - dstDecimals)))).div(srcQty);
//     }
//     return rate;
// }

// function log (string) {
//     console.log(string);
// };

// function divSolidity(a, b) {
//     let c = a / b;
//     if (c < 0) { return Math.ceil(c); }
//     return Math.floor(c);
// }

// async function makerDeposit(res, permTok, maker, ethWei, tokenTwei, kncTwei) {

//     await permTok.approve(res.address, tokenTwei, {from: admin});
//     await res.depositToken(maker, tokenTwei, {from: admin});
//     await KNC.approve(res.address, kncTwei, {from: admin});
//     await res.depositKncForFee(maker, kncTwei, {from: admin});
//     await res.depositEther(maker, {from: maker, value: ethWei});
// }


// function calcRateFromQty(srcAmount, dstAmount, srcDecimals, dstDecimals) {
//     if (dstDecimals >= srcDecimals) {
//         let decimals = new BN(10 ** (dstDecimals - srcDecimals));
//         return ((precisionUnits.mul(dstAmount)).div(decimals.mul(srcAmount)));
//     } else {
//         let decimals = new BN(10 ** (srcDecimals - dstDecimals));
//         return ((precisionUnits.mul(dstAmount).mul(decimals)).div(srcAmount));
//     }
// }
=======
            Helper.assertEqual(makerEthFundsAfter, expectedMakerEthFunds);
        })

        it("trade (buy) token listed regular and order book. when permissionless not allowed. see token taken from regular reserve", async() => {
            let tradeValue = 10000;
            let rate = await network.getExpectedRateOnlyPermission(ethAddress, token0, tradeValue);

            //trade
            let hint = 'PERM';
            let hintBytes32 = web3.utils.fromAscii(hint);

            let makerEthFundsBefore = new BN(await orderbookReserveTok0.makerFunds(maker1, ethAddress));
            let txData = await network.tradeWithHint(user1, ethAddress, tradeValue, token0, user2,
                      (new BN(10)).pow(new BN(30)), rate[1], zeroAddress, hintBytes32, {from:networkProxy, value: tradeValue});

            let makerEthFundsAfter = new BN(await orderbookReserveTok0.makerFunds(maker1, ethAddress));

            Helper.assertEqual(makerEthFundsAfter, makerEthFundsBefore);
        })

        it("list an existing token with better rate then other reserves (sell), get rate with / without permissionless, see rate diff", async() => {
            //maker deposits Eth
            let amountEthWeiDeposit = minNewOrderValue.add(new BN(600));
            await makerDeposit(orderbookReserveTok0, tokens[0], maker1, amountEthWeiDeposit, 0, 0);

            let orderSrcAmountWei = minNewOrderValue;
            let orderDstTwei = new BN(1.7).mul(new BN(10).pow(new BN(14)));

            let tradeValue = new BN(10000);
            let networkRateBefore = await network.getExpectedRate(token0, ethAddress, tradeValue);

            //now add order
            //////////////
            rc = await orderbookReserveTok0.submitEthToTokenOrder(orderSrcAmountWei, orderDstTwei, {from: maker1});
            let orderList = await orderbookReserveTok0.getEthToTokenOrderList();
            Helper.assertEqual(orderList.length, 1);

            // now getConversionRate > 0
            let expectedRate = precisionUnits.mul(orderSrcAmountWei).div(orderDstTwei);
            let networkRate = await network.getExpectedRate(token0, ethAddress, tradeValue);
            let reserveRate = await orderbookReserveTok0.getConversionRate(token0, ethAddress, tradeValue, 3);
            Helper.assertEqual(reserveRate, networkRate[0]);
//            log("reserve rate: " + reserveRate)
//            log("network rate: " + networkRate)

//            Helper.assertEqual(networkRate[0].div(10), expectedRate.div(10));

            let networkRateOnlyPerm = await network.getExpectedRateOnlyPermission(token0, ethAddress, tradeValue);

            Helper.assertEqual(networkRateOnlyPerm[0], networkRateBefore[0]);
        })

        it("trade (sell) token listed regular and order book. see token taken from order book reserve(better rate)", async() => {
            let tradeValue = new BN(10000);
            let rate = await network.getExpectedRate(token0, ethAddress, tradeValue);

            //trade
            let makerTokFundsBefore = new BN(await orderbookReserveTok0.makerFunds(maker1, token0));
            await tokens[0].transfer(network.address, tradeValue);
            let txData = await network.tradeWithHint(user1, token0, tradeValue, ethAddress, user2,
                        (new BN(10)).pow(new BN(30)), rate[1], zeroAddress, emptyHint, {from:networkProxy});

            let makerTokFundsAfter = await orderbookReserveTok0.makerFunds(maker1, token0);
            let expectedMakerTokFunds = makerTokFundsBefore.add(tradeValue);

            Helper.assertEqual(makerTokFundsAfter, expectedMakerTokFunds);
        })

        it("trade (sell) token listed regular and order book permissionless not allowed. see token taken from regular reserve", async() => {
            let tradeValue = 10000;
            let rate = await network.getExpectedRateOnlyPermission(token0, ethAddress, tradeValue);

            //trade
            let hint = 'PERM';
            let hintBytes32 = web3.utils.fromAscii(hint);

            let makerTokFundsBefore = new BN(await orderbookReserveTok0.makerFunds(maker1, token0));
            await tokens[0].transfer(network.address, tradeValue);
            let txData = await network.tradeWithHint(user1, token0, tradeValue, ethAddress, user2,
                      (new BN(10)).pow(new BN(30)), rate[1], zeroAddress, hintBytes32, {from:networkProxy});

            let makerTokFundsAfter = await orderbookReserveTok0.makerFunds(maker1, token0);

            Helper.assertEqual(makerTokFundsAfter, makerTokFundsBefore);
        });

        it("get rate token to token with token listed regular and permissionless. see diff", async() => {
            let tradeValue = new BN(10000);
            token1 = tokens[1].address;

            let rate = await network.getExpectedRate(token0, token1, tradeValue);
            let permRate = await network.getExpectedRateOnlyPermission(token0, token1, tradeValue);
            Helper.assertGreater(rate[0],permRate[0],"rate: " + rate[0] + " !>  permission only rate: " +
            permRate[0]);

            rate = await network.getExpectedRate(token1, token0, tradeValue);
            permRate = await network.getExpectedRateOnlyPermission(token1, token0, tradeValue);
            assert(rate[0] > permRate[0]);
        });

        it("trade token to token with / without permissionless. see as expected", async() => {
            let tradeValue = new BN(10000);
            let rate = await network.getExpectedRate(token0, token1, tradeValue);

            //trade
            let makerTokFundsBefore = new BN(await orderbookReserveTok0.makerFunds(maker1, token0));
            await tokens[0].transfer(network.address, tradeValue);
            let txData = await network.tradeWithHint(user1, token0, tradeValue, token1, user2,
                        (new BN(10)).pow(new BN(30)), rate[1], zeroAddress, emptyHint, {from:networkProxy});
            log("token to token with permissionless. partial order amount. gas: " + txData.receipt.gasUsed);

            let makerTokFundsAfter1 = await orderbookReserveTok0.makerFunds(maker1, token0);
            let expectedMakerTokFunds = makerTokFundsBefore.add(tradeValue);

            Helper.assertEqual(makerTokFundsAfter1, expectedMakerTokFunds);

            //now only permissioned
            rate = await network.getExpectedRateOnlyPermission(token0, token1, tradeValue);
            let hint = web3.utils.fromAscii("PERM");
            await tokens[0].transfer(network.address, tradeValue);
            txData = await network.tradeWithHint(user1, token0, tradeValue, token1, user2,
                                (new BN(10)).pow(new BN(30)), rate[1], zeroAddress, hint, {from:networkProxy});
            let makerTokFundsAfter2 = await orderbookReserveTok0.makerFunds(maker1, token0);
            Helper.assertEqual(makerTokFundsAfter1, makerTokFundsAfter2);
        })

        it("trade token to token with / without permissionless. see as expected", async() => {
            let tradeValue = 10000;
            let rate = await network.getExpectedRate(token1, token0, tradeValue);

            //trade
            let makerTokFundsBefore = new BN(await orderbookReserveTok0.makerFunds(maker1, ethAddress));
            await tokens[1].transfer(network.address, tradeValue);
            let txData = await network.tradeWithHint(user1, token1, tradeValue, token0, user2,
                         (new BN(10)).pow(new BN(30)), rate[1], zeroAddress, emptyHint, {from:networkProxy});
            log("token to token with permissionless. partial order amount. gas: " + txData.receipt.gasUsed);

            let makerTokFundsAfter1 = await orderbookReserveTok0.makerFunds(maker1, ethAddress);
            assert(makerTokFundsAfter1 > makerTokFundsBefore, "makerTokFundsAfter1: " + makerTokFundsAfter1 +
                " should be > makerTokFundsBefore: " + makerTokFundsBefore);

            //now only permissioned
            rate = await network.getExpectedRateOnlyPermission(token1, token0, tradeValue);
            let hint = web3.utils.fromAscii("PERM");
            await tokens[1].transfer(network.address, tradeValue);
            txData = await network.tradeWithHint(user1, token1, tradeValue, token0, user2,
                         (new BN(10)).pow(new BN(30)), rate[1], zeroAddress, hint, {from:networkProxy});
            let makerTokFundsAfter2 = await orderbookReserveTok0.makerFunds(maker1, ethAddress);
            Helper.assertEqual(makerTokFundsAfter1, makerTokFundsAfter2);
        });

        it("Add 9 'spam' orders Eth to token see gas affect on trade with other reserve.", async() => {
            let numOrders = new BN(10);
            let amountKnc = new BN(600).mul(new BN(10).pow(new BN(18)));
            let tokIndex = 0;
            let tokenAdd = tokens[tokIndex].address;
            let amountEthWeiDeposit = minNewOrderValue.mul(numOrders);
            await makerDeposit(orderbookReserveTok0, tokens[tokIndex], maker1, amountEthWeiDeposit, 0, amountKnc);

            let orderSrcWei = minNewOrderValue;
            //calculate smallest possible dest amount. one that achieves max_rate
            let orderDstAmountTwei = calcSrcQty(orderSrcWei, tokenDecimals[tokIndex], 18, max_rate);
//            log('orderSrcWei ' + orderSrcWei);
//            log('orderDstAmountTwei ' + orderDstAmountTwei);

//            let orderRate = calcRateFromQty(orderDstAmountTwei, orderSrcWei, tokenDecimals[tokIndex], 18);
//            Helper.assertEqual(orderRate.div(100), max_rate.div(100));
//            log("orderRate " + orderRate)
            orderList = await orderbookReserveTok0.getEthToTokenOrderList();
//            log("order list: " + orderList)
            for (let i = 0; i < orderList.length; i++) {
                await orderbookReserveTok0.cancelEthToTokenOrder(orderList[i], {from: maker1})
            }

            //add 9 orders
            //////////////
            let totalPayValue = new BN(0);
            for(let i = 0; i < 9; i++) {
                await orderbookReserveTok0.submitEthToTokenOrder(orderSrcWei, (orderDstAmountTwei.add(new BN(10 * i))), {from: maker1});
                totalPayValue = totalPayValue.add(orderDstAmountTwei.add(new BN(10 * i)));
            }

//            orderList = await orderbookReserveTok0.getEthToTokenOrderList();
//            log("order list: " + orderList)

            //see good rate value for this amount
            goodRate = await network.getExpectedRate(tokenAdd, ethAddress, totalPayValue);
            //not as good when a bit higher quantity
            let regularRate = await network.getExpectedRate(tokenAdd, ethAddress, totalPayValue.add(new BN(4)));
            assert(goodRate[0] > regularRate[0]);

            //now trade this token with permission less disabled. see gas
            let hint = 'PERM';
            let hintBytes32 = web3.utils.fromAscii(hint);
            let tradeValue = totalPayValue.add(new BN(4));

            await tokens[0].transfer(network.address, tradeValue);
            let txPermData = await network.tradeWithHint(user1, token0, tradeValue, ethAddress, user2,
                                  (new BN(10)).pow(new BN(30)), regularRate[1], zeroAddress, hintBytes32, {from:networkProxy});
            log("gas only permissioned: " + txPermData.receipt.gasUsed);

            await tokens[0].transfer(network.address, tradeValue);
            txPermLessData = await network.tradeWithHint(user1, token0, tradeValue, ethAddress, user2,
                                  (new BN(10)).pow(new BN(30)), regularRate[1], zeroAddress, emptyHint, {from:networkProxy});
            log("gas with traversing permissionless 9 orders (not taking): " + txPermLessData.receipt.gasUsed);

            log("gas effect of traversing 9 orders in get rate (not taking): " +
                (txPermLessData.receipt.gasUsed - txPermData.receipt.gasUsed));

            await tokens[0].transfer(network.address, tradeValue);
            txData = await network.tradeWithHint(user1, token0, totalPayValue, ethAddress, user2,
                                              (new BN(10)).pow(new BN(30)), regularRate[1], zeroAddress, emptyHint, {from:networkProxy});
            log("gas 9 orders from permissionless: " + txData.receipt.gasUsed);
        });

        it("Add 5 'spam' orders Eth to token see gas affect on trade with other reserve.", async() => {
            let numOrders = new BN(10);
            let amountKnc = new BN(600).mul(new BN(10).pow(new BN(18)));
            let tokIndex = 0;
            let tokenAdd = tokens[tokIndex].address;
            let amountEthWeiDeposit = minNewOrderValue.mul(numOrders);
            await makerDeposit(orderbookReserveTok0, tokens[tokIndex], maker1, amountEthWeiDeposit, 0, amountKnc);

            let orderSrcWei = minNewOrderValue;
            //calculate smallest possible dest amount. one that achieves max_rate
            let orderDstAmountTwei = calcSrcQty(orderSrcWei, tokenDecimals[tokIndex], 18, max_rate);
            orderList = await orderbookReserveTok0.getEthToTokenOrderList();

            for (let i = 0; i < orderList.length; i++) {
                await orderbookReserveTok0.cancelEthToTokenOrder(orderList[i], {from: maker1})
            }

            //add 9 orders
            //////////////
            let totalPayValue = new BN(0);
            for(let i = 0; i < 5; i++) {
                await orderbookReserveTok0.submitEthToTokenOrder(orderSrcWei, (orderDstAmountTwei.add(new BN(10 * i))), {from: maker1});
                totalPayValue = totalPayValue.add(orderDstAmountTwei.add(new BN(10 * i)));
            }

            //see good rate value for this amount
            goodRate = await network.getExpectedRate(tokenAdd, ethAddress, totalPayValue);
            //not as good when a bit higher quantity
            let regularRate = await network.getExpectedRate(tokenAdd, ethAddress, totalPayValue.add(new BN(4)));
            assert(goodRate[0] > regularRate[0]);

            //now trade this token with permission less disabled. see gas
            let hint = 'PERM';
            let hintBytes32 = web3.utils.fromAscii(hint);
            let tradeValue = totalPayValue.add(new BN(4));

            await tokens[0].transfer(network.address, tradeValue);
            let txPermData = await network.tradeWithHint(user1, token0, tradeValue, ethAddress, user2,
                                  (new BN(10)).pow(new BN(30)), regularRate[1], zeroAddress, hintBytes32, {from:networkProxy});
            log("gas only permissioned: " + txPermData.receipt.gasUsed);

            await tokens[0].transfer(network.address, tradeValue);
            txPermLessData = await network.tradeWithHint(user1, token0, tradeValue, ethAddress, user2,
                                  (new BN(10)).pow(new BN(30)), regularRate[1], zeroAddress, emptyHint, {from:networkProxy});
            log("gas with traversing permissionless 5 orders (not taking): " + txPermLessData.receipt.gasUsed);

            log("gas effect of traversing 5 orders in get rate (not taking): " +
                (txPermLessData.receipt.gasUsed - txPermData.receipt.gasUsed));

            await tokens[0].transfer(network.address, tradeValue);
            txData = await network.tradeWithHint(user1, token0, totalPayValue, ethAddress, user2,
                                              (new BN(10)).pow(new BN(30)), regularRate[1], zeroAddress, emptyHint, {from:networkProxy});
            log("gas 5 orders from permissionless: " + txData.receipt.gasUsed);
        });

        it("see gas consumption when taking 3.6, 4.6, 5.6, 6.6, 7.6 orders. remaining removed.", async() => {
            //maker deposits tokens
            let numOrders = new BN(27);
            let amountKnc = new BN(600).mul(new BN(10).pow(new BN(18)));
            let amountEthWeiDeposit = minNewOrderValue.mul(numOrders);
            await makerDeposit(orderbookReserve, permissionlessTok, maker1, amountEthWeiDeposit, 0, amountKnc);

            let orderSrcWei = minNewOrderValue;
            //calculate smallest possible dest amount. one that achieves max_rate
            let orderDstAmountTwei = calcSrcQty(orderSrcWei, permissionlessTokDecimals, 18, max_rate);

            //4 orders
            //////////////
            let totalPayValue = new BN(0);
            for(let i = 0; i < 4; i++) {
                await orderbookReserve.submitEthToTokenOrder(orderSrcWei, (orderDstAmountTwei.add(new BN(100 * i))), {from: maker1});
                totalPayValue = totalPayValue.add(orderDstAmountTwei.add(new BN(100 * i)));
            }

            orderList = await orderbookReserve.getEthToTokenOrderList();
            Helper.assertEqual(orderList.length, 4);

            let tradeValue = totalPayValue.sub(orderDstAmountTwei.mul(new BN(0.3)));
            await permissionlessTok.transfer(network.address, tradeValue);
            txData = await network.tradeWithHint(user1, permissionlessTok.address, tradeValue, ethAddress, user2,
                                                    (new BN(10)).pow(new BN(30)), 10, zeroAddress, emptyHint, {from:networkProxy});
            log("gas price taking 3.7 orders. remaining removed: " + txData.receipt.gasUsed);

            orderList = await orderbookReserve.getEthToTokenOrderList();
            Helper.assertEqual(orderList.length, 0);

            //5 orders
            //////////////
            totalPayValue = new BN(0);
            for(let i = 0; i < 5; i++) {
                await orderbookReserve.submitEthToTokenOrder(orderSrcWei, (orderDstAmountTwei.add(new BN(100 * i))), {from: maker1});
                totalPayValue = totalPayValue.add(orderDstAmountTwei.add(new BN(100 * i)));
            }

            orderList = await orderbookReserve.getEthToTokenOrderList();
            Helper.assertEqual(orderList.length, 5);

            tradeValue = totalPayValue.sub(orderDstAmountTwei.mul(new BN(0.3)));
            await permissionlessTok.transfer(network.address, tradeValue);
            txData = await network.tradeWithHint(user1, permissionlessTok.address, tradeValue, ethAddress, user2,
                                                    (new BN(10)).pow(new BN(30)), 10, zeroAddress, emptyHint, {from:networkProxy});
            log("gas price taking 4.7 orders. remaining removed: " + txData.receipt.gasUsed);

            orderList = await orderbookReserve.getEthToTokenOrderList();
            Helper.assertEqual(orderList.length, 0);

            //6 orders
            //////////////
            totalPayValue = new BN(0);
            for(let i = 0; i < 6; i++) {
                await orderbookReserve.submitEthToTokenOrder(orderSrcWei, (orderDstAmountTwei.add(new BN(100 * i))), {from: maker1});
                totalPayValue = totalPayValue.add(orderDstAmountTwei.add(new BN(100 * i)));
            }

            orderList = await orderbookReserve.getEthToTokenOrderList();
            Helper.assertEqual(orderList.length, 6);

            tradeValue = totalPayValue.sub(orderDstAmountTwei.mul(new BN(0.3)));
            await permissionlessTok.transfer(network.address, tradeValue);
            txData = await network.tradeWithHint(user1, permissionlessTok.address, tradeValue, ethAddress, user2,
                                                    (new BN(10)).pow(new BN(30)), 10, zeroAddress, emptyHint, {from:networkProxy});
            log("gas price taking 5.7 orders. remaining removed: " + txData.receipt.gasUsed);

            orderList = await orderbookReserve.getEthToTokenOrderList();
            Helper.assertEqual(orderList.length, 0);

            //7 orders
            //////////////
            totalPayValue = new BN(0);
            for(let i = 0; i < 7; i++) {
                await orderbookReserve.submitEthToTokenOrder(orderSrcWei, (orderDstAmountTwei.add(new BN(100 * i))), {from: maker1});
                totalPayValue = totalPayValue.add(orderDstAmountTwei.add(new BN(100 * i)));
            }

            orderList = await orderbookReserve.getEthToTokenOrderList();
            Helper.assertEqual(orderList.length, 7);

            tradeValue = totalPayValue.sub(orderDstAmountTwei.mul(new BN(0.3)));
            await permissionlessTok.transfer(network.address, tradeValue);
            txData = await network.tradeWithHint(user1, permissionlessTok.address, tradeValue, ethAddress, user2,
                                                    (new BN(10)).pow(new BN(30)), 10, zeroAddress, emptyHint, {from:networkProxy});
            log("gas price taking 6.7 orders. remaining removed: " + txData.receipt.gasUsed);

            orderList = await orderbookReserve.getEthToTokenOrderList();
            Helper.assertEqual(orderList.length, 0);
        });
    });

    describe("enhanced step functions", function() {
        it("enhance step func: setup reserve for enhance step function", async function () {
            //disable reserve 1 & 2, add new reserve to network
            await reserve1.disableTrade({from:alerter});
            await reserve2.disableTrade({from:alerter});
            await network.addReserve(reserve4.address, false, {from: operator});
            for (let i = 0; i < numTokens; i++) {
                // unlist token for reserve 1 and 2
                await network.listPairForReserve(reserve1.address, tokenAdd[i], true, true, false, {from: operator});
                await network.listPairForReserve(reserve2.address, tokenAdd[i], true, true, false, {from: operator});
                await network.listPairForReserve(reserve4.address, tokenAdd[i], true, true, true, {from: operator});
            }
        });

        it("should test token to eth with few steps function", async function () {
            for(let step = 0; step < 5; step++) {
                let tokenInd = 2;
                let token = tokens[tokenInd]; //choose some token
                let amountTwei = new BN(100 * step + 20);
                let user = accounts[9];
                try {
                    //verify base rate
                    let rate = await network.getExpectedRate(tokenAdd[tokenInd], ethAddress, amountTwei);
                    let expected = calculateRateAmountNewConversionRate(false, tokenInd, amountTwei);
                    let expectedRate = expected[0];
                    let expectedAmountWei = expected[1];
                    expectedRate = calcCombinedRate(amountTwei, expectedRate, precisionUnits, tokenDecimals[tokenInd], 18, expectedAmountWei);
                    //check correct rate calculated
                    Helper.assertEqual(rate[0], expectedRate, "unexpected rate.");

                    await token.transfer(network.address, amountTwei);

                    //perform trade
                    let txData = await network.tradeWithHint(user, tokenAdd[tokenInd], amountTwei, ethAddress, user, 500000,
                                    rate[1], walletId, emptyHint, {from:networkProxy});
                    if (step < 2) {
                        console.log("Transaction gas used token to eth for " + (step + 1) + " sell steps: " + txData.receipt.gasUsed);
                    }
                    //check lower ether balance on reserve
                    expectedReserve4BalanceWei = expectedReserve4BalanceWei.sub(expectedAmountWei);
                    let balance = await Helper.getBalancePromise(reserve4.address);
                    Helper.assertEqual(balance, expectedReserve4BalanceWei, "bad reserve balance wei");

                    //check token balances
                    ///////////////////////
                    //check token balance on user
                    let tokenTweiBalance = await token.balanceOf(user);
                    let expectedTweiAmount = 0;
                    Helper.assertEqual(tokenTweiBalance, expectedTweiAmount, "bad token balance");

                    //check higher token balance on reserve
                    reserve4TokenBalance[tokenInd] = reserve4TokenBalance[tokenInd].add(amountTwei);
                    reserve4TokenImbalance[tokenInd] = reserve4TokenImbalance[tokenInd].sub(amountTwei); //imbalance represents how many missing tokens
                    let reportedBalance = await token.balanceOf(reserve4.address);
                    Helper.assertEqual(reportedBalance, reserve4TokenBalance[tokenInd], "bad token balance on reserve");
                } catch (e) {
                    console.log("oooops " + e);
                    throw e;
                }
            }
        });

        it("should test few trades eth to token", async function () {
            let numTrades = 10;
            let gasUsed = 0;
            for(let i = 0; i < numTrades; i++) {
                let tokenInd = 2;
                let token = tokens[tokenInd]; //choose some token
                let amountTwei = new BN(15 * i + 100);
                let user = accounts[9];
                try {
                    //verify base rate
                    let rate = await network.getExpectedRate(ethAddress, tokenAdd[tokenInd], amountTwei);
                    //check correct rate calculated

                    assert.notEqual(rate[0], 0, "rate should be not zero.");

                    let userTokenBalanceBefore = await token.balanceOf(user);
                    //perform trade
                    let txData = await network.tradeWithHint(user, ethAddress, amountTwei, tokenAdd[tokenInd], user, 500000,
                                    rate[1], walletId, emptyHint, {from:networkProxy, value: amountTwei});
                    gasUsed += txData.receipt.gasUsed;
                    let expectedAmountWei = txData.logs[0].args.dstAmount;
                    //check higher ether balance on reserve
                    expectedReserve4BalanceWei = expectedReserve4BalanceWei.add(amountTwei);
                    let balance = await Helper.getBalancePromise(reserve4.address);
                    Helper.assertEqual(balance, expectedReserve4BalanceWei, "bad reserve balance wei");

                    //check token balances
                    ///////////////////////
                    //check token balance on user
                    let tokenTweiBalance = await token.balanceOf(user);
                    let expectedTweiAmount = userTokenBalanceBefore.add(expectedAmountWei);
                    Helper.assertEqual(tokenTweiBalance, expectedTweiAmount, "bad token balance");

                    //check lower token balance on reserve
                    reserve4TokenBalance[tokenInd] = reserve4TokenBalance[tokenInd].sub(expectedAmountWei);
                    reserve4TokenImbalance[tokenInd] = reserve4TokenImbalance[tokenInd].add(expectedAmountWei); //imbalance represents how many missing tokens
                    let reportedBalance = await token.balanceOf(reserve4.address);
                    Helper.assertEqual(reportedBalance, reserve4TokenBalance[tokenInd], "bad token balance on reserve");
                } catch (e) {
                    console.log("oooops " + e);
                    throw e;
                }
            }
            console.log("Average gas used for " + numTrades + " eth to token trades: " + gasUsed / numTrades);
        });

        it("should only enable new reserve. perform buy and check: balances changed as expected.", async function () {
            let tokenInd = 1;
            let token = tokens[tokenInd]; //choose some token
            let amountWei = new BN(330);
            let user = accounts[9];
            try {
                //verify base rate
                let buyRate = await network.getExpectedRate(ethAddress, tokenAdd[tokenInd], amountWei);
                let expected = calculateRateAmountNewConversionRate(true, tokenInd, amountWei);
                let expectedRate = expected[0];
                let expectedTweiAmount = expected[1];
                let oldUserTokenBal = await token.balanceOf(user);

                expectedRate = calcCombinedRate(amountWei, precisionUnits, expectedRate, 18, tokenDecimals[tokenInd], expectedTweiAmount);

                //check correct rate calculated
                Helper.assertEqual(buyRate[0], expectedRate, "unexpected rate.");

                //perform trade
                let txData = await network.tradeWithHint(user, ethAddress, amountWei, tokenAdd[tokenInd], user, 50000,
                    buyRate[1], walletId, emptyHint, {from:networkProxy, value:amountWei});
                console.log("Transaction gas used: " + txData.receipt.gasUsed);

                Helper.assertEqual(txData.logs[0].args.srcAmount, amountWei);
                Helper.assertEqual(txData.logs[0].args.dstAmount, expectedTweiAmount);

                //check higher ether balance on reserve
                expectedReserve4BalanceWei = expectedReserve4BalanceWei.add(amountWei);
                let balance = await Helper.getBalancePromise(reserve4.address);
                Helper.assertEqual(balance, expectedReserve4BalanceWei, "bad reserve balance wei");

                //check token balances
                ///////////////////////

                //check token balance on user
                let tokenTweiBalance = await token.balanceOf(user);
                Helper.assertEqual(tokenTweiBalance, oldUserTokenBal.add(expectedTweiAmount), "bad token balance");

                //check lower token balance on reserve
                reserve4TokenBalance[tokenInd] = reserve4TokenBalance[tokenInd].sub(expectedTweiAmount);
                reserve4TokenImbalance[tokenInd] = reserve4TokenImbalance[tokenInd].add(expectedTweiAmount); //imbalance represents how many missing tokens
                let reportedBalance = await token.balanceOf(reserve4.address);
                Helper.assertEqual(reportedBalance, reserve4TokenBalance[tokenInd], "bad token balance on reserve");
            } catch (e) {
                console.log("oooops " + e);
                throw e;
            }
        });

        it("should only enable new reserve perform sell and check: balances changed as expected.", async function () {
            let tokenInd = 2;
            let token = tokens[tokenInd]; //choose some token
            let amountTwei = new BN(1030);
            let user = accounts[9];
            try {
                //verify base rate
                let rate = await network.getExpectedRate(tokenAdd[tokenInd], ethAddress, amountTwei);
                let expected = calculateRateAmountNewConversionRate(false, tokenInd, amountTwei);
                let expectedRate = expected[0];
                let expectedAmountWei = expected[1];
                expectedRate = calcCombinedRate(amountTwei, expectedRate, precisionUnits, tokenDecimals[tokenInd], 18, expectedAmountWei);
                //check correct rate calculated
                Helper.assertEqual(rate[0], expectedRate, "unexpected rate.");

                let userTokenBalBefore = await token.balanceOf(user);
                await token.transfer(network.address, amountTwei);

                //perform trade
                let txData = await network.tradeWithHint(user, tokenAdd[tokenInd], amountTwei, ethAddress, user, 500000,
                                rate[1], walletId, emptyHint, {from:networkProxy});
                console.log("Transaction gas used: " + txData.receipt.gasUsed);
                //check lower ether balance on reserve
                expectedReserve4BalanceWei = expectedReserve4BalanceWei.sub(expectedAmountWei);
                let balance = await Helper.getBalancePromise(reserve4.address);
                Helper.assertEqual(balance, expectedReserve4BalanceWei, "bad reserve balance wei");

                //check token balances
                ///////////////////////

                //check token balance on user
                let tokenTweiBalance = await token.balanceOf(user);
                Helper.assertEqual(tokenTweiBalance, userTokenBalBefore, "bad token balance");

                //check higher token balance on reserve
                reserve4TokenBalance[tokenInd] = reserve4TokenBalance[tokenInd].add(amountTwei);
                reserve4TokenImbalance[tokenInd] = reserve4TokenImbalance[tokenInd].sub(amountTwei); //imbalance represents how many missing tokens
                let reportedBalance = await token.balanceOf(reserve4.address);
                Helper.assertEqual(reportedBalance, reserve4TokenBalance[tokenInd], "bad token balance on reserve");
            } catch (e) {
                console.log("oooops " + e);
                throw e;
            }
        });
    });
});

function convertRateToConversionRatesRate (baseRate) {
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

function getExtraBpsForImbalanceBuyQuantityNew(currentImbalance, qty) {
    return getExtraBpsForQuantity(currentImbalance, currentImbalance + qty, imbalanceBuyStepX, imbalanceBuyStepYNew);
};

function getExtraBpsForImbalanceSellQuantityNew(currentImbalance, qty) {
    return getExtraBpsForQuantity(currentImbalance - qty, currentImbalance, imbalanceSellStepX, imbalanceSellStepYNew);
};

function getExtraBpsForQuantity(from, to, stepX, stepY) {
    if (stepY.length == 0) { return 0; }
    let len = stepX.length;
    if (from == to) {
        return 0;
    }
    let change = 0;
    let qty = to - from;
    for(let i = 0; i < len; i++) {
        if (stepX[i] <= from) { continue; }
        if (stepY[i] == -10000) { return -10000; }
        if (stepX[i] >= to) {
            change += (to - from) * stepY[i];
            from = to;
            break;
        } else {
            change += (stepX[i] - from) * stepY[i];
            from = stepX[i];
        }
    }
    if (from < to) {
        if (stepY[len] == -10000) { return -10000; }
        change += (to - from) * stepY[len];
    }
    return divSolidity(change, qty);
}

function calculateRateAmountNewConversionRate(isBuy, tokenInd, srcQty) {
    let expectedRate;
    let expectedAmount;
    let expected = [];

    if (isBuy) {
        expectedRate = (new BN(baseBuyRate4[tokenInd]));
        let dstQty = calcDstQty(srcQty, 18, tokenDecimals[tokenInd], expectedRate);
        let extraBps = getExtraBpsForImbalanceBuyQuantityNew(reserve4TokenImbalance[tokenInd] * 1, dstQty * 1);
        expectedRate = Helper.addBps(expectedRate, extraBps);
        expectedAmount = calcDstQty(srcQty, 18, tokenDecimals[tokenInd], expectedRate);
    } else {
        expectedRate = (new BN(baseSellRate4[tokenInd]));
        let extraBps = getExtraBpsForImbalanceSellQuantityNew(reserve4TokenImbalance[tokenInd] * 1, srcQty * 1);
        expectedRate = Helper.addBps(expectedRate, extraBps);
        expectedAmount = calcDstQty(srcQty, tokenDecimals[tokenInd], 18, expectedRate);
    }

    expected = [expectedRate, expectedAmount];
    return expected;
}

function compareRates (receivedRate, expectedRate) {
    expectedRate = expectedRate - (expectedRate % 10);
    receivedRate = receivedRate - (receivedRate % 10);
    Helper.assertEqual(expectedRate, receivedRate, "different prices");
};

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

function divSolidity(a, b) {
    let c = a / b;
    if (c < 0) { return Math.ceil(c); }
    return Math.floor(c);
}

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
>>>>>>> development
