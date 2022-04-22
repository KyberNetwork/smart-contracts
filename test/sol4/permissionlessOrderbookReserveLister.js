// const TestToken = artifacts.require("TestToken.sol");
// const nimbleNetwork = artifacts.require("nimbleNetwork.sol");
// const nimbleNetworkFailsListing = artifacts.require("MockNetworkFailsListing.sol");
// const nimbleNetworkProxy = artifacts.require("nimbleNetworkProxy.sol");
// const FeeBurner = artifacts.require("FeeBurner.sol");
// const WhiteList = artifacts.require("WhiteList.sol");

// const OrderbookReserve = artifacts.require("MockOrderbookReserve.sol");
// const PermissionlessOrderbookReserveLister = artifacts.require("PermissionlessOrderbookReserveLister.sol");
// const OrderListFactory = artifacts.require("OrderListFactory.sol");
// const MockMedianizer = artifacts.require("MockMedianizer.sol");
// const MocknimbleNetwork = artifacts.require("./MocknimbleNetwork.sol");

// const Helper = require("../helper.js");
// const BN = web3.utils.BN;

// const zeroAddress = '0x0000000000000000000000000000000000000000';

// require("chai")
//     .use(require("chai-as-promised"))
//     .should()

// //global variables
// //////////////////
// const precisionUnits = new BN(10).pow(new BN(18));
// const gasPrice = new BN(10).pow(new BN(9)).mul(new BN(50));
// const ethAddress = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

// let withDrawAddress;

// //contracts
// let reserve;
// let network;
// let feeBurner;
// let whiteList;
// let expectedRate;
// let nimbleProxy;
// let reserveLister;
// let orderFactory;
// let medianizer;

// //tokens data
// ////////////
// let token;
// let tokenAdd;
// let NIMToken;
// let NIMAddress;

// const negligibleRateDiff = 11;
// const ethToNIMRatePrecision = precisionUnits.mul(new BN(550));
// const maxOrdersPerTrade = 5;
// const minNewOrderValueUsd = 1000;
// let dollarsPerEthPrecision = precisionUnits.mul(new BN(200));

// //addresses
// let admin;
// let operator;
// let maker1;
// let user1;

// let init = true;

// let currentBlock;

// const LISTING_NONE = 0;
// const LISTING_STATE_ADDED = 1;
// const LISTING_STATE_INIT = 2;
// const LISTING_STATE_LISTED = 3;

// let minNewOrderWei;

// let unSupportedTok1;
// let unSupportedTok2;
// let unSupportedTok3;

// let unsupportedTokens = [];

// contract('PermissionlessOrderbookReserveLister', function (accounts) {

//     // TODO: consider changing to beforeEach with a separate deploy per test
//     before('setup contract before all tests', async () => {

//         admin = accounts[0];
//         whiteList = accounts[1];
//         expectedRate = accounts[2];
//         nimbleProxy = accounts[3];
//         operator = accounts[4];
//         maker1 = accounts[5];
//         user1 = accounts[6];

//         token = await TestToken.new("the token", "TOK", 18);
//         tokenAdd = token.address;

//         NIMToken = await TestToken.new("nimble Crystals", "NIM", 18);
//         NIMAddress = NIMToken.address;
//         network = await nimbleNetwork.new(admin);
//         feeBurner = await FeeBurner.new(admin, NIMAddress, network.address, ethToNIMRatePrecision);
//         orderFactory = await OrderListFactory.new();
//         medianizer = await MockMedianizer.new();
//         await medianizer.setValid(true);
//         await medianizer.setEthPrice(dollarsPerEthPrecision);
//     });

//     it("init network and reserveLister. see init success.", async function () {

//         //set contracts
//         await network.setnimbleProxy(nimbleProxy);
//         await network.setWhiteList(whiteList);
//         await network.setExpectedRate(expectedRate);
//         await network.setFeeBurner(feeBurner.address);
//         await network.setParams(gasPrice, negligibleRateDiff);
//         await network.addOperator(operator);
//         await network.setEnable(true);

//         unSupportedTok1 = await TestToken.new("unsupported1", "ho no.", 16);
//         unSupportedTok2 = await TestToken.new("unsupported1", "ho no.", 16);
//         unSupportedTok3 = await TestToken.new("unsupported1", "ho no.", 16);

//         unsupportedTokens.push(unSupportedTok1.address);
//         unsupportedTokens.push(unSupportedTok2.address);
//         unsupportedTokens.push(unSupportedTok3.address);

// //log(network.address + " " + feeBurnerResolver.address + " " + NIMAddress)
//         reserveLister = await PermissionlessOrderbookReserveLister.new(
//             network.address,
//             orderFactory.address,
//             medianizer.address,
//             NIMAddress,
//             unsupportedTokens,
//             maxOrdersPerTrade,
//             minNewOrderValueUsd
//         );

//         // lister should be added as a feeburner operator.
//         await feeBurner.addOperator(reserveLister.address, {from: admin});
//         const feeBurnerOperators = await feeBurner.getOperators();
//         feeBurnerOperators.should.include(reserveLister.address);

//         let nimbleAdd = await reserveLister.nimbleNetworkContract();
//         Helper.assertEqual(nimbleAdd, network.address);

//         add = await reserveLister.orderFactoryContract();
//         Helper.assertEqual(add, orderFactory.address);

//         let rxNIM = await reserveLister.NIMToken();
//         Helper.assertEqual(rxNIM, NIMAddress);

//         await network.addOperator(reserveLister.address);
//     });

//     it("verify lister global parameters", async() => {

//         let address = await reserveLister.medianizerContract();
//         Helper.assertEqual(address, medianizer.address);
// //        log("address" + medianizer.address)
//         address = await reserveLister.nimbleNetworkContract();
//         Helper.assertEqual(address, network.address)
//         address = await reserveLister.orderFactoryContract();
//         Helper.assertEqual(address, orderFactory.address)
//         address = await reserveLister.NIMToken();
//         Helper.assertEqual(address, NIMAddress)

//         let value = await reserveLister.ORDERBOOK_BURN_FEE_BPS();
//         Helper.assertEqual(value, 25);
//         value = await reserveLister.maxOrdersPerTrade();
//         Helper.assertEqual(value, maxOrdersPerTrade);
//         value = await reserveLister.minNewOrderValueUsd();
//         Helper.assertEqual(value, minNewOrderValueUsd);
//     })

//     it("test adding and listing order book reserve, get through network contract and through lister", async() => {
//         let rc = await reserveLister.addOrderbookContract(tokenAdd);
//         log("add reserve gas: " + rc.receipt.gasUsed);

//         rc = await reserveLister.initOrderbookContract(tokenAdd);
//         log("init reserve gas: " + rc.receipt.gasUsed);

//         rc = await reserveLister.listOrderbookContract(tokenAdd);
//         log("list reserve gas: " + rc.receipt.gasUsed);
// //
//         let reserveAddress = await network.reservesPerTokenDest(tokenAdd, 0);
//         let listReserveAddress = await reserveLister.reserves(tokenAdd);
//         Helper.assertEqual(reserveAddress, listReserveAddress);

//         reserve = await OrderbookReserve.at(reserveAddress);
//         let rxLimits = await reserve.limits();

//         minNewOrderWei = rxLimits[2];

//         let rxContracts = await reserve.contracts();
//         Helper.assertEqual(rxContracts[0], NIMAddress);
//         Helper.assertEqual(rxContracts[1], token.address);
//         Helper.assertEqual(rxContracts[2], feeBurner.address);
//         Helper.assertEqual(rxContracts[3], network.address);
//         Helper.assertEqual(rxContracts[4], medianizer.address);
//     })

//     it("see listing arbitrary address = no token contract - reverts", async() => {
//         try {
//             let rc = await reserveLister.addOrderbookContract(accounts[9]);
//             assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }
//     })

//     it("maker sure can't add same token twice.", async() => {
//         // make sure its already added
//         let ready =  await reserveLister.getOrderbookListingStage(tokenAdd);
//         Helper.assertEqual(ready[1], LISTING_STATE_LISTED);

//         try {
//             let rc = await reserveLister.addOrderbookContract(tokenAdd);
//             assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         try {
//             rc = await reserveLister.initOrderbookContract(tokenAdd);
//             assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         try {
//             rc = await reserveLister.listOrderbookContract(tokenAdd);
//             assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }
//     })

//     it("verify if network list token pairs fails, listing is reverted.", async() => {
// //set contracts
//         const tok = await TestToken.new("sdf", "sdf", 14);
//         const networkFail = await nimbleNetworkFailsListing.new(admin);

//         await networkFail.setnimbleProxy(nimbleProxy);
//         await networkFail.setExpectedRate(expectedRate);
//         await networkFail.setFeeBurner(feeBurner.address);
//         await networkFail.setParams(gasPrice, negligibleRateDiff);
//         await networkFail.setEnable(true);

//         let tempLister = await PermissionlessOrderbookReserveLister.new(
//             networkFail.address,
//             orderFactory.address,
//             medianizer.address,
//             NIMAddress,
//             unsupportedTokens,
//             maxOrdersPerTrade,
//             minNewOrderValueUsd
//         );

//         // lister should be added as a feeburner operator.
//         await feeBurner.addOperator(tempLister.address, {from: admin});
//         await networkFail.addOperator(tempLister.address);

//         await tempLister.addOrderbookContract(tok.address);
//         await tempLister.initOrderbookContract(tok.address);

//         try {
//             await tempLister.listOrderbookContract(tok.address);
//             assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         let listingStage = await tempLister.getOrderbookListingStage(tok.address);
//         Helper.assertEqual(listingStage[1], LISTING_STATE_INIT)
//     });

//     it("maker sure in each listing stage can only perform the next stage listing.", async() => {
//         // make sure its already added
//         let newToken = await TestToken.new("token", "TOK", 18);
//         newTokAdd = newToken.address;

//         let listed =  await reserveLister.getOrderbookListingStage(newTokAdd);
//         Helper.assertEqual(listed[1], LISTING_NONE);

//         try {
//             rc = await reserveLister.initOrderbookContract(newTokAdd);
//             assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         try {
//             rc = await reserveLister.listOrderbookContract(newTokAdd);
//             assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         let rc = await reserveLister.addOrderbookContract(newTokAdd);

//         listed =  await reserveLister.getOrderbookListingStage(newTokAdd);
//         Helper.assertEqual(listed[1], LISTING_STATE_ADDED);

//         try {
//             let rc = await reserveLister.addOrderbookContract(newTokAdd);
//             assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         try {
//             rc = await reserveLister.listOrderbookContract(newTokAdd);
//             assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         rc = await reserveLister.initOrderbookContract(newTokAdd);

//         listed =  await reserveLister.getOrderbookListingStage(newTokAdd);
//         Helper.assertEqual(listed[1], LISTING_STATE_INIT);

//         try {
//             rc = await reserveLister.initOrderbookContract(newTokAdd);
//             assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         try {
//             let rc = await reserveLister.addOrderbookContract(newTokAdd);
//             assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         rc = await reserveLister.listOrderbookContract(newTokAdd);

//         listed =  await reserveLister.getOrderbookListingStage(newTokAdd);
//         Helper.assertEqual(listed[1], LISTING_STATE_LISTED);

//         try {
//             rc = await reserveLister.initOrderbookContract(newTokAdd);
//             assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         try {
//             let rc = await reserveLister.addOrderbookContract(newTokAdd);
//             assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         try {
//             rc = await reserveLister.listOrderbookContract(newTokAdd);
//             assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         listed =  await reserveLister.getOrderbookListingStage(newTokAdd);
//         Helper.assertEqual(listed[1], LISTING_STATE_LISTED);
//     })

//     it("make sure can't list unsupported tokens.", async() => {
//         // make sure its already added
//         let isListed =  await reserveLister.getOrderbookListingStage(unSupportedTok1.address);
//         Helper.assertEqual(isListed[1], LISTING_NONE);

//         try {
//             let rc = await reserveLister.addOrderbookContract(unSupportedTok1.address);
//             assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         try {
//             let rc = await reserveLister.addOrderbookContract(unSupportedTok2.address);
//             assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }
//     })

//     it("test reserve - maker deposit tokens, ethers, NIM, validate updated in contract", async function () {

//         let amountTwei = precisionUnits.mul(new BN(500)); //500 tokens
//         let amountNIM = precisionUnits.mul(new BN(600));
//         let amountEth = precisionUnits.mul(new BN(2));

//         let res = await OrderbookReserve.at(await reserveLister.reserves(tokenAdd));

//         await makerDeposit(res, maker1, amountEth, amountTwei, amountNIM, NIMToken);

//         let rxNumTwei = await res.makerFunds(maker1, tokenAdd);
//         Helper.assertEqual(rxNumTwei, amountTwei);

//         let rxNIMTwei = await res.makerUnlockedNIM(maker1);
//         Helper.assertEqual(rxNIMTwei, amountNIM);

//         rxNIMTwei = await res.makerRequiredNIMStake(maker1);
//         Helper.assertEqual(rxNIMTwei, 0);

//         //makerDepositEther
//         let rxWei = await res.makerFunds(maker1, ethAddress);
//         Helper.assertEqual(rxWei, amountEth);

//         await res.withdrawEther(rxWei, {from: maker1})
//         rxWei = await res.makerFunds(maker1, ethAddress);
//         Helper.assertEqual(rxWei, 0);
//     });

//     it("add and list order book reserve, see getter has correct ready flag.", async() => {
//         newToken = await TestToken.new("new token", "NEW", 18);
//         newTokenAdd = newToken.address;

//         let ready =  await reserveLister.getOrderbookListingStage(newTokenAdd);
//         Helper.assertEqual(ready[0], zeroAddress);
//         Helper.assertEqual(ready[1], LISTING_NONE);

//         let rc = await reserveLister.addOrderbookContract(newTokenAdd);
//         let reserveAddress = await reserveLister.reserves(newTokenAdd);

//         ready = await reserveLister.getOrderbookListingStage(newTokenAdd);
//         Helper.assertEqual(ready[0], reserveAddress);
//         Helper.assertEqual(ready[1], LISTING_STATE_ADDED);

//         rc = await reserveLister.initOrderbookContract(newTokenAdd);

//         ready =  await reserveLister.getOrderbookListingStage(newTokenAdd);
//         Helper.assertEqual(ready[0], reserveAddress);
//         Helper.assertEqual(ready[1], LISTING_STATE_INIT);

//         rc = await reserveLister.listOrderbookContract(newTokenAdd);

//         ready =  await reserveLister.getOrderbookListingStage(newTokenAdd);
//         Helper.assertEqual(ready[0], reserveAddress);
//         Helper.assertEqual(ready[1], LISTING_STATE_LISTED);
//     })

//     it("verify can't construct new lister with address 0.", async() => {

//         let newLister;

//         try {
//             newLister = await PermissionlessOrderbookReserveLister.new(zeroAddress, orderFactory.address, medianizer.address, NIMAddress, unsupportedTokens, maxOrdersPerTrade, minNewOrderValueUsd);
//             assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         try {
//             newLister = await PermissionlessOrderbookReserveLister.new(network.address, zeroAddress, medianizer.address, NIMAddress, unsupportedTokens, maxOrdersPerTrade, minNewOrderValueUsd);
//             assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         try {
//             newLister = await PermissionlessOrderbookReserveLister.new(network.address, orderFactory.address, zeroAddress, NIMAddress, unsupportedTokens, maxOrdersPerTrade, minNewOrderValueUsd);
//             assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         try {
//             newLister = await PermissionlessOrderbookReserveLister.new(network.address, orderFactory.address, medianizer.address, zeroAddress, unsupportedTokens, maxOrdersPerTrade, minNewOrderValueUsd);
//             assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         let unsupported = [zeroAddress, unSupportedTok1.address]
//         try {
//             newLister = await PermissionlessOrderbookReserveLister.new(network.address, orderFactory.address, medianizer.address, NIMAddress, unsupported, maxOrdersPerTrade, minNewOrderValueUsd);
//             assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         try {
//             newLister = await PermissionlessOrderbookReserveLister.new(network.address, orderFactory.address, medianizer.address, NIMAddress, unsupportedTokens, 1, minNewOrderValueUsd);
//             assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         try {
//             newLister = await PermissionlessOrderbookReserveLister.new(network.address, orderFactory.address, medianizer.address, NIMAddress, unsupportedTokens, maxOrdersPerTrade, 0);
//             assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         //and now. at last.
//         newLister = await PermissionlessOrderbookReserveLister.new(network.address, orderFactory.address, medianizer.address, NIMAddress, unsupportedTokens, maxOrdersPerTrade, minNewOrderValueUsd);

//         assert (newLister.address != 0);
//     })

//     it("verify if order book reserve init fails. can't list it on nimble.", async() => {

//         let newLister;

//         let dummyOrdersFactory = accounts[8];

//         newLister = await PermissionlessOrderbookReserveLister.new(network.address, dummyOrdersFactory, medianizer.address, NIMAddress, unsupportedTokens, maxOrdersPerTrade, minNewOrderValueUsd);

//         let rc = await newLister.addOrderbookContract(tokenAdd);

//         // init should fail
//         try {
//             rc = await newLister.initOrderbookContract(tokenAdd);
//             assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         let listingStage = await newLister.getOrderbookListingStage(tokenAdd);
//         Helper.assertEqual(listingStage[1], LISTING_STATE_ADDED);
//     })

//     it("verify if listing on nimble fails. reserve listing reverts and stage will stay in init stage.", async() => {

//         newToken = await TestToken.new("new token", "NEW", 18);
//         newTokenAdd = newToken.address;

//         let rc = await reserveLister.addOrderbookContract(newTokenAdd);
//         rc = await reserveLister.initOrderbookContract(newTokenAdd);

//         let listingStage =  await reserveLister.getOrderbookListingStage(newTokenAdd);
//         Helper.assertEqual(listingStage[1], LISTING_STATE_INIT);

//         //remove permissions on nimble.
//         await network.removeOperator(reserveLister.address)

//         try {
//             rc = await reserveLister.listOrderbookContract(newTokenAdd);
//             assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         listingStage =  await reserveLister.getOrderbookListingStage(newTokenAdd);
//         Helper.assertEqual(listingStage[1], LISTING_STATE_INIT);

//         //add permissions on nimble.
//         await network.addOperator(reserveLister.address)

//         rc = await reserveLister.listOrderbookContract(newTokenAdd);

//         listingStage =  await reserveLister.getOrderbookListingStage(newTokenAdd);
//         Helper.assertEqual(listingStage[1], LISTING_STATE_LISTED);
//     })
// });


// contract('PermissionlessOrderbookReserveLister_feeBurner_tests', function (accounts) {

//     let orderFactory;
//     let medianizer;
//     let NIMToken;
//     let NIMAddress;

//     before("one time init", async() => {
//         orderFactory = await OrderListFactory.new();
//         medianizer = await MockMedianizer.new();
//         await medianizer.setValid(true);
//         await medianizer.setEthPrice(dollarsPerEthPrecision);
//         token = await TestToken.new("the token", "tok", 18);
//         NIMToken = await TestToken.new("nimble crystals", "NIM", 18);
//         NIMAddress = NIMToken.address;
//     })

//     beforeEach('setup contract before all tests', async () => {
//         admin = accounts[0];
//         operator = accounts[1];
//         expectedRate = accounts[2];
//         maker = accounts[4];
//         taker = accounts[5];
//     });

//     it("listing orderbook reserve so that it could burn fees", async () => {

//         // prepare nimble network
//         const nimbleNetwork = await nimbleNetwork.new(admin);

//         const nimbleProxy = await nimbleNetworkProxy.new(admin);
//         await nimbleProxy.setnimbleNetworkContract(
//             nimbleNetwork.address,
//             {from: admin}
//         );

//         const feeBurner = await FeeBurner.new(
//             admin,
//             NIMToken.address,
//             nimbleNetwork.address,
//             ethToNIMRatePrecision
//         );

//         const lister = await PermissionlessOrderbookReserveLister.new(
//             nimbleNetwork.address,
//             orderFactory.address,
//             medianizer.address,
//             NIMToken.address,
//             unsupportedTokens,
//             maxOrdersPerTrade,
//             minNewOrderValueUsd
//         );

//         // configure feeburner
//         await feeBurner.addOperator(lister.address, {from: admin});


//         // setup WhiteList
//         const whiteList = await WhiteList.new(admin, NIMToken.address);
//         await whiteList.addOperator(operator, {from: admin});
//         await whiteList.setCategoryCap(0, 1000, {from: operator});
//         await whiteList.setSgdToEthRate(new BN(30000).mul(new BN(10).pow(new BN(18))), {from: operator});

//         // configure nimble network
//         await nimbleNetwork.setnimbleProxy(nimbleProxy.address);
//         await nimbleNetwork.setWhiteList(whiteList.address);
//         await nimbleNetwork.setExpectedRate(expectedRate);
//         await nimbleNetwork.setFeeBurner(feeBurner.address);
//         await nimbleNetwork.setParams(gasPrice, negligibleRateDiff);
//         await nimbleNetwork.addOperator(operator);
//         await nimbleNetwork.setEnable(true);
//         await nimbleNetwork.addOperator(lister.address);

//         // list an order book reserve
//         await lister.addOrderbookContract(token.address);
//         await lister.initOrderbookContract(token.address);
//         await lister.listOrderbookContract(token.address);

//         // add orders
//         const reserve = await OrderbookReserve.at(
//             await lister.reserves(token.address)
//         );

//         let rxLimits = await reserve.limits();
//         minNewOrderWei = rxLimits[2];

//         let amountTokenInWei = new BN(0);
//         let amountNIMInWei = precisionUnits.mul(new BN(600));
//         let amountEthInWei = new BN(minNewOrderWei);

//         await makerDeposit(
//             reserve,
//             maker,
//             amountEthInWei /* ethWei */,
//             amountTokenInWei /* tokenTwei */,
//             amountNIMInWei /* NIMTwei */,
//             NIMToken
//         );

//         const tokenTweiToSwap = precisionUnits.mul(new BN(12));
//         const ethWeiSrcAmount = new BN(minNewOrderWei);
//         await reserve.submitEthToTokenOrder(
//             ethWeiSrcAmount /* srcAmount */,
//             tokenTweiToSwap /* dstAmount */,
//             {from: maker}
//         );

//         // swap token to ETH
//         await token.transfer(taker, tokenTweiToSwap);
//         await token.approve(nimbleProxy.address, tokenTweiToSwap, {from: taker});
//         let tradeLog = await nimbleProxy.swapTokenToEther(
//             token.address /* token */,
//             tokenTweiToSwap /* src amount*/,
//             1 /* minConversionRate */,
//             {from: taker}
//         );

//         let actualWeiValue = new BN(tradeLog.logs[0].args.actualDestAmount);
//         Helper.assertLesser(actualWeiValue, ethWeiSrcAmount)
//         Helper.assertGreater(actualWeiValue, ethWeiSrcAmount.sub(new BN(100)))

//         // burn fees
//         const result = await feeBurner.burnReserveFees(reserve.address);

//         // Assert
//         const burnAssignedFeesEvent = result.logs[0];
//         burnAssignedFeesEvent.event.should.equal('BurnAssignedFees');
//         burnAssignedFeesEvent.args.reserve.should.equal(reserve.address);

//         const ethNIMRatePrecision = await feeBurner.NIMPerEthRatePrecision();
//         const burnReserveFeeBps = await lister.ORDERBOOK_BURN_FEE_BPS();

//         // (ethWeiToSwap * (ethNIMRatePrecision) * (25: BURN_FEE_BPS) / 10000) - 1
//         const NIMAmount = actualWeiValue.mul(ethNIMRatePrecision).div(precisionUnits);
//         const expectedBurnFeesInNIMWei = NIMAmount.mul(burnReserveFeeBps).div(new BN(10000)).sub(new BN(1));

//         Helper.assertEqual(burnAssignedFeesEvent.args.quantity, expectedBurnFeesInNIMWei);
//     });

//     it("list order book reserve. see can't unlist if NIM rate is in boundaries. can unlist when NIM rate too low", async() => {
//         // prepare nimble network
//         const nimbleNetwork = await nimbleNetwork.new(admin);
//         const mockNetwork = await MocknimbleNetwork.new(admin);

//         let ethNIMRate = new BN(100);
//         let ethToNIMRatePrecision = precisionUnits.mul(ethNIMRate);

//         const feeBurner = await FeeBurner.new(
//             admin,
//             NIMToken.address,
//             mockNetwork.address,
//             ethToNIMRatePrecision
//         );

//         ethToNIMRatePrecision = precisionUnits.mul(ethNIMRate);
//         let NIMToEthRatePrecision = precisionUnits.div(ethNIMRate);

//         await mockNetwork.setPairRate(ethAddress, NIMAddress, ethToNIMRatePrecision);
//         await mockNetwork.setPairRate(NIMAddress, ethAddress, NIMToEthRatePrecision);

//         await feeBurner.setNIMRate();

//         const lister = await PermissionlessOrderbookReserveLister.new(
//             nimbleNetwork.address,
//             orderFactory.address,
//             medianizer.address,
//             NIMAddress,
//             unsupportedTokens,
//             maxOrdersPerTrade,
//             minNewOrderValueUsd
//         );

//         // configure feeburner
//         await feeBurner.addOperator(lister.address, {from: admin});

//         // configure nimble network
//         await nimbleNetwork.setFeeBurner(feeBurner.address);
//         await nimbleNetwork.addOperator(lister.address);

//         // list an order book reserve
//         await lister.addOrderbookContract(token.address);
//         await lister.initOrderbookContract(token.address);
//         await lister.listOrderbookContract(token.address);

//         // add orders
//         const reserve = await OrderbookReserve.at(
//             await lister.reserves(token.address)
//         );

//         let baseNIMEthRate = await reserve.NIMPerEthBaseRatePrecision();

//         let reserveIndex = 0;
//         let address = await nimbleNetwork.reserves(reserveIndex);
//         Helper.assertEqual(address, reserve.address);

//          // see unlist fails
//         try {
//             await lister.unlistOrderbookContract(token.address, reserveIndex);
//             assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         let stakeFactor = await reserve.BURN_TO_STAKE_FACTOR();
//         ethNIMRate = ethNIMRate.mul(stakeFactor.add(new BN(1)));

//         ethToNIMRatePrecision = precisionUnits.mul(ethNIMRate);
//         NIMToEthRatePrecision = precisionUnits.div(ethNIMRate.mul(new BN(101)).div(new BN(100)));

//         await mockNetwork.setPairRate(ethAddress, NIMAddress, ethToNIMRatePrecision);
//         await mockNetwork.setPairRate(NIMAddress, ethAddress, NIMToEthRatePrecision);

//         let tradeBlocked = await reserve.NIMRateBlocksTrade();
//         Helper.assertEqual(tradeBlocked, false);

//         await feeBurner.setNIMRate();
//         tradeBlocked = await reserve.NIMRateBlocksTrade();
//         Helper.assertEqual(tradeBlocked, true);

//         await lister.unlistOrderbookContract(token.address, reserveIndex);

//         let listing = await lister.getOrderbookListingStage(token.address);
//         Helper.assertEqual(listing[1], LISTING_NONE);
//     })

//     it("lister. see list and unlist fail when lister not operator in network", async() => {

//         // prepare nimble network
//         const nimbleNetwork = await nimbleNetwork.new(admin);
//         const mockNetwork = await MocknimbleNetwork.new(admin);

//         let ethNIMRate = new BN(100);
//         let ethToNIMRatePrecision = precisionUnits.mul(ethNIMRate);

//         const feeBurner = await FeeBurner.new(
//             admin,
//             NIMToken.address,
//             mockNetwork.address,
//             ethToNIMRatePrecision
//         );

//         ethToNIMRatePrecision = precisionUnits.mul(ethNIMRate);
//         let NIMToEthRatePrecision = precisionUnits.div(ethNIMRate);

//         await mockNetwork.setPairRate(ethAddress, NIMAddress, ethToNIMRatePrecision);
//         await mockNetwork.setPairRate(NIMAddress, ethAddress, NIMToEthRatePrecision);

//         await feeBurner.setNIMRate();

//         const lister = await PermissionlessOrderbookReserveLister.new(
//             nimbleNetwork.address,
//             orderFactory.address,
//             medianizer.address,
//             NIMAddress,
//             unsupportedTokens,
//             maxOrdersPerTrade,
//             minNewOrderValueUsd
//         );

//         // configure feeburner
//         await feeBurner.addOperator(lister.address, {from: admin});

//         // configure nimble network
//         await nimbleNetwork.setFeeBurner(feeBurner.address);

//         // list an order book reserve
//         await lister.addOrderbookContract(token.address);
//         await lister.initOrderbookContract(token.address);

//         try {
//              await lister.listOrderbookContract(token.address);
//              assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         await nimbleNetwork.addOperator(lister.address);
//         //now should succeed
//         await lister.listOrderbookContract(token.address);

//         const reserve = await OrderbookReserve.at(
//             await lister.reserves(token.address)
//         );

//         //create a large rate change so unlisting is possible
//         let stakeFactor = await reserve.BURN_TO_STAKE_FACTOR();
//         ethNIMRate = ethNIMRate.mul(new BN(stakeFactor).add(new BN(1)));
//         ethToNIMRatePrecision = precisionUnits.mul(ethNIMRate);
//         NIMToEthRatePrecision = precisionUnits.div(ethNIMRate.mul(new BN(101)).div(new BN(100)));

//         await mockNetwork.setPairRate(ethAddress, NIMAddress, ethToNIMRatePrecision);
//         await mockNetwork.setPairRate(NIMAddress, ethAddress, NIMToEthRatePrecision);
//         await feeBurner.setNIMRate();

//         await nimbleNetwork.removeOperator(lister.address);

//         let reserveIndex = 0;

//         try {
//              await lister.unlistOrderbookContract(token.address, reserveIndex);
//              assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         await nimbleNetwork.addOperator(lister.address);
//         await lister.unlistOrderbookContract(token.address, reserveIndex);
//     })

//     it("see listing fails when lister not operator in fee burner", async() => {

//         // prepare nimble network
//         const nimbleNetwork = await nimbleNetwork.new(admin);
//         const mockNetwork = await MocknimbleNetwork.new(admin);

//         let ethNIMRate = new BN(100);
//         let ethToNIMRatePrecision = precisionUnits.mul(ethNIMRate);

//         const feeBurner = await FeeBurner.new(
//             admin,
//             NIMToken.address,
//             mockNetwork.address,
//             ethToNIMRatePrecision
//         );

//         ethToNIMRatePrecision = precisionUnits.mul(ethNIMRate);
//         let NIMToEthRatePrecision = precisionUnits.div(ethNIMRate);

//         await mockNetwork.setPairRate(ethAddress, NIMAddress, ethToNIMRatePrecision);
//         await mockNetwork.setPairRate(NIMAddress, ethAddress, NIMToEthRatePrecision);

//         await feeBurner.setNIMRate();

//         const lister = await PermissionlessOrderbookReserveLister.new(
//             nimbleNetwork.address,
//             orderFactory.address,
//             medianizer.address,
//             NIMAddress,
//             unsupportedTokens,
//             maxOrdersPerTrade,
//             minNewOrderValueUsd
//         );

//         // configure nimble network
//         await nimbleNetwork.setFeeBurner(feeBurner.address);
//         await nimbleNetwork.addOperator(lister.address);

//         // list an order book reserve
//         await lister.addOrderbookContract(token.address);
//         await lister.initOrderbookContract(token.address);

//         try {
//              await lister.listOrderbookContract(token.address);
//              assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         // configure feeburner
//         await feeBurner.addOperator(lister.address, {from: admin});

//         //now should succeed
//         await lister.listOrderbookContract(token.address);
//     })

//     it("see unlisting possible only for reserves that are fully listed (list stage)", async() => {

//         // prepare nimble network
//         const nimbleNetwork = await nimbleNetwork.new(admin);
//         const mockNetwork = await MocknimbleNetwork.new(admin);

//         let ethNIMRate = new BN(100);
//         let ethToNIMRatePrecision = precisionUnits.mul(ethNIMRate);

//         const feeBurner = await FeeBurner.new(
//             admin,
//             NIMToken.address,
//             mockNetwork.address,
//             ethToNIMRatePrecision
//         );

//         ethToNIMRatePrecision = precisionUnits.mul(ethNIMRate);
//         let NIMToEthRatePrecision = precisionUnits.div(ethNIMRate);

//         await mockNetwork.setPairRate(ethAddress, NIMAddress, ethToNIMRatePrecision);
//         await mockNetwork.setPairRate(NIMAddress, ethAddress, NIMToEthRatePrecision);

//         await feeBurner.setNIMRate();

//         const lister = await PermissionlessOrderbookReserveLister.new(
//             nimbleNetwork.address,
//             orderFactory.address,
//             medianizer.address,
//             NIMAddress,
//             unsupportedTokens,
//             maxOrdersPerTrade,
//             minNewOrderValueUsd
//         );

//         // configure feeburner
//         await feeBurner.addOperator(lister.address, {from: admin});

//         // configure nimble network
//         await nimbleNetwork.setFeeBurner(feeBurner.address);
//         await nimbleNetwork.addOperator(lister.address);

//         // list an order book reserve
//         await lister.addOrderbookContract(token.address);

//         const reserve = await OrderbookReserve.at(
//             await lister.reserves(token.address)
//         );

//         //create a large rate change so unlisting is possible
//         let stakeFactor = await reserve.BURN_TO_STAKE_FACTOR();
//         ethNIMRate = ethNIMRate.mul(new BN(stakeFactor).add(new BN(1)));

//         ethToNIMRatePrecision = precisionUnits.mul(ethNIMRate);
//         NIMToEthRatePrecision = precisionUnits.div(ethNIMRate.mul(new BN(101)).div(new BN(100)));

//         await mockNetwork.setPairRate(ethAddress, NIMAddress, ethToNIMRatePrecision);
//         await mockNetwork.setPairRate(NIMAddress, ethAddress, NIMToEthRatePrecision);
//         await feeBurner.setNIMRate();

//         let reserveIndex = 0;

//         try {
//              await lister.unlistOrderbookContract(token.address, reserveIndex);
//              assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         let listing = await lister.getOrderbookListingStage(token.address);
//         Helper.assertEqual(listing[1], LISTING_STATE_ADDED);

//         await lister.initOrderbookContract(token.address);

//         try {
//              await lister.unlistOrderbookContract(token.address, reserveIndex);
//              assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         listing = await lister.getOrderbookListingStage(token.address);
//         Helper.assertEqual(listing[1], LISTING_STATE_INIT);

//         //now should succeed
//         await lister.listOrderbookContract(token.address);

//         listing = await lister.getOrderbookListingStage(token.address);
//         Helper.assertEqual(listing[1], LISTING_STATE_LISTED);

//         await lister.unlistOrderbookContract(token.address, reserveIndex);
//         listing = await lister.getOrderbookListingStage(token.address);
//         Helper.assertEqual(listing[1], LISTING_NONE);
//     })
// });

// function log(str) {
//     console.log(str);
// }

// async function makerDeposit(res, maker, ethWei, tokenTwei, NIMTwei, NIMToken) {
//     await token.approve(res.address, tokenTwei, {from: admin});
//     await res.depositToken(maker, tokenTwei, {from: admin});
//     await NIMToken.approve(res.address, NIMTwei, {from: admin});
//     await res.depositNIMForFee(maker, NIMTwei, {from: admin});
//     await res.depositEther(maker, {from: maker, value: ethWei});
// }
