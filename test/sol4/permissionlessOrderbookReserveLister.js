// const TestToken = artifacts.require("TestToken.sol");
// const KyberNetwork = artifacts.require("KyberNetwork.sol");
// const KyberNetworkFailsListing = artifacts.require("MockNetworkFailsListing.sol");
// const KyberNetworkProxy = artifacts.require("KyberNetworkProxy.sol");
// const FeeBurner = artifacts.require("FeeBurner.sol");
// const WhiteList = artifacts.require("WhiteList.sol");

// const OrderbookReserve = artifacts.require("MockOrderbookReserve.sol");
// const PermissionlessOrderbookReserveLister = artifacts.require("PermissionlessOrderbookReserveLister.sol");
// const OrderListFactory = artifacts.require("OrderListFactory.sol");
// const MockMedianizer = artifacts.require("MockMedianizer.sol");
// const MockKyberNetwork = artifacts.require("./MockKyberNetwork.sol");

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
// let kyberProxy;
// let reserveLister;
// let orderFactory;
// let medianizer;

// //tokens data
// ////////////
// let token;
// let tokenAdd;
// let KNCToken;
// let kncAddress;

// const negligibleRateDiff = 11;
// const ethToKncRatePrecision = precisionUnits.mul(new BN(550));
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
//         kyberProxy = accounts[3];
//         operator = accounts[4];
//         maker1 = accounts[5];
//         user1 = accounts[6];

//         token = await TestToken.new("the token", "TOK", 18);
//         tokenAdd = token.address;

//         KNCToken = await TestToken.new("Kyber Crystals", "KNC", 18);
//         kncAddress = KNCToken.address;
//         network = await KyberNetwork.new(admin);
//         feeBurner = await FeeBurner.new(admin, kncAddress, network.address, ethToKncRatePrecision);
//         orderFactory = await OrderListFactory.new();
//         medianizer = await MockMedianizer.new();
//         await medianizer.setValid(true);
//         await medianizer.setEthPrice(dollarsPerEthPrecision);
//     });

//     it("init network and reserveLister. see init success.", async function () {

//         //set contracts
//         await network.setKyberProxy(kyberProxy);
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

// //log(network.address + " " + feeBurnerResolver.address + " " + kncAddress)
//         reserveLister = await PermissionlessOrderbookReserveLister.new(
//             network.address,
//             orderFactory.address,
//             medianizer.address,
//             kncAddress,
//             unsupportedTokens,
//             maxOrdersPerTrade,
//             minNewOrderValueUsd
//         );

//         // lister should be added as a feeburner operator.
//         await feeBurner.addOperator(reserveLister.address, {from: admin});
//         const feeBurnerOperators = await feeBurner.getOperators();
//         feeBurnerOperators.should.include(reserveLister.address);

//         let kyberAdd = await reserveLister.kyberNetworkContract();
//         Helper.assertEqual(kyberAdd, network.address);

//         add = await reserveLister.orderFactoryContract();
//         Helper.assertEqual(add, orderFactory.address);

//         let rxKnc = await reserveLister.kncToken();
//         Helper.assertEqual(rxKnc, kncAddress);

//         await network.addOperator(reserveLister.address);
//     });

//     it("verify lister global parameters", async() => {

//         let address = await reserveLister.medianizerContract();
//         Helper.assertEqual(address, medianizer.address);
// //        log("address" + medianizer.address)
//         address = await reserveLister.kyberNetworkContract();
//         Helper.assertEqual(address, network.address)
//         address = await reserveLister.orderFactoryContract();
//         Helper.assertEqual(address, orderFactory.address)
//         address = await reserveLister.kncToken();
//         Helper.assertEqual(address, kncAddress)

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
//         Helper.assertEqual(rxContracts[0], kncAddress);
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
//         const networkFail = await KyberNetworkFailsListing.new(admin);

//         await networkFail.setKyberProxy(kyberProxy);
//         await networkFail.setExpectedRate(expectedRate);
//         await networkFail.setFeeBurner(feeBurner.address);
//         await networkFail.setParams(gasPrice, negligibleRateDiff);
//         await networkFail.setEnable(true);

//         let tempLister = await PermissionlessOrderbookReserveLister.new(
//             networkFail.address,
//             orderFactory.address,
//             medianizer.address,
//             kncAddress,
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

//     it("test reserve - maker deposit tokens, ethers, knc, validate updated in contract", async function () {

//         let amountTwei = precisionUnits.mul(new BN(500)); //500 tokens
//         let amountKnc = precisionUnits.mul(new BN(600));
//         let amountEth = precisionUnits.mul(new BN(2));

//         let res = await OrderbookReserve.at(await reserveLister.reserves(tokenAdd));

//         await makerDeposit(res, maker1, amountEth, amountTwei, amountKnc, KNCToken);

//         let rxNumTwei = await res.makerFunds(maker1, tokenAdd);
//         Helper.assertEqual(rxNumTwei, amountTwei);

//         let rxKncTwei = await res.makerUnlockedKnc(maker1);
//         Helper.assertEqual(rxKncTwei, amountKnc);

//         rxKncTwei = await res.makerRequiredKncStake(maker1);
//         Helper.assertEqual(rxKncTwei, 0);

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
//             newLister = await PermissionlessOrderbookReserveLister.new(zeroAddress, orderFactory.address, medianizer.address, kncAddress, unsupportedTokens, maxOrdersPerTrade, minNewOrderValueUsd);
//             assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         try {
//             newLister = await PermissionlessOrderbookReserveLister.new(network.address, zeroAddress, medianizer.address, kncAddress, unsupportedTokens, maxOrdersPerTrade, minNewOrderValueUsd);
//             assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         try {
//             newLister = await PermissionlessOrderbookReserveLister.new(network.address, orderFactory.address, zeroAddress, kncAddress, unsupportedTokens, maxOrdersPerTrade, minNewOrderValueUsd);
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
//             newLister = await PermissionlessOrderbookReserveLister.new(network.address, orderFactory.address, medianizer.address, kncAddress, unsupported, maxOrdersPerTrade, minNewOrderValueUsd);
//             assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         try {
//             newLister = await PermissionlessOrderbookReserveLister.new(network.address, orderFactory.address, medianizer.address, kncAddress, unsupportedTokens, 1, minNewOrderValueUsd);
//             assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         try {
//             newLister = await PermissionlessOrderbookReserveLister.new(network.address, orderFactory.address, medianizer.address, kncAddress, unsupportedTokens, maxOrdersPerTrade, 0);
//             assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         //and now. at last.
//         newLister = await PermissionlessOrderbookReserveLister.new(network.address, orderFactory.address, medianizer.address, kncAddress, unsupportedTokens, maxOrdersPerTrade, minNewOrderValueUsd);

//         assert (newLister.address != 0);
//     })

//     it("verify if order book reserve init fails. can't list it on kyber.", async() => {

//         let newLister;

//         let dummyOrdersFactory = accounts[8];

//         newLister = await PermissionlessOrderbookReserveLister.new(network.address, dummyOrdersFactory, medianizer.address, kncAddress, unsupportedTokens, maxOrdersPerTrade, minNewOrderValueUsd);

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

//     it("verify if listing on kyber fails. reserve listing reverts and stage will stay in init stage.", async() => {

//         newToken = await TestToken.new("new token", "NEW", 18);
//         newTokenAdd = newToken.address;

//         let rc = await reserveLister.addOrderbookContract(newTokenAdd);
//         rc = await reserveLister.initOrderbookContract(newTokenAdd);

//         let listingStage =  await reserveLister.getOrderbookListingStage(newTokenAdd);
//         Helper.assertEqual(listingStage[1], LISTING_STATE_INIT);

//         //remove permissions on kyber.
//         await network.removeOperator(reserveLister.address)

//         try {
//             rc = await reserveLister.listOrderbookContract(newTokenAdd);
//             assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         listingStage =  await reserveLister.getOrderbookListingStage(newTokenAdd);
//         Helper.assertEqual(listingStage[1], LISTING_STATE_INIT);

//         //add permissions on kyber.
//         await network.addOperator(reserveLister.address)

//         rc = await reserveLister.listOrderbookContract(newTokenAdd);

//         listingStage =  await reserveLister.getOrderbookListingStage(newTokenAdd);
//         Helper.assertEqual(listingStage[1], LISTING_STATE_LISTED);
//     })
// });


// contract('PermissionlessOrderbookReserveLister_feeBurner_tests', function (accounts) {

//     let orderFactory;
//     let medianizer;
//     let kncToken;
//     let kncAddress;

//     before("one time init", async() => {
//         orderFactory = await OrderListFactory.new();
//         medianizer = await MockMedianizer.new();
//         await medianizer.setValid(true);
//         await medianizer.setEthPrice(dollarsPerEthPrecision);
//         token = await TestToken.new("the token", "tok", 18);
//         kncToken = await TestToken.new("kyber crystals", "knc", 18);
//         kncAddress = kncToken.address;
//     })

//     beforeEach('setup contract before all tests', async () => {
//         admin = accounts[0];
//         operator = accounts[1];
//         expectedRate = accounts[2];
//         maker = accounts[4];
//         taker = accounts[5];
//     });

//     it("listing orderbook reserve so that it could burn fees", async () => {

//         // prepare kyber network
//         const kyberNetwork = await KyberNetwork.new(admin);

//         const kyberProxy = await KyberNetworkProxy.new(admin);
//         await kyberProxy.setKyberNetworkContract(
//             kyberNetwork.address,
//             {from: admin}
//         );

//         const feeBurner = await FeeBurner.new(
//             admin,
//             kncToken.address,
//             kyberNetwork.address,
//             ethToKncRatePrecision
//         );

//         const lister = await PermissionlessOrderbookReserveLister.new(
//             kyberNetwork.address,
//             orderFactory.address,
//             medianizer.address,
//             kncToken.address,
//             unsupportedTokens,
//             maxOrdersPerTrade,
//             minNewOrderValueUsd
//         );

//         // configure feeburner
//         await feeBurner.addOperator(lister.address, {from: admin});


//         // setup WhiteList
//         const whiteList = await WhiteList.new(admin, kncToken.address);
//         await whiteList.addOperator(operator, {from: admin});
//         await whiteList.setCategoryCap(0, 1000, {from: operator});
//         await whiteList.setSgdToEthRate(new BN(30000).mul(new BN(10).pow(new BN(18))), {from: operator});

//         // configure kyber network
//         await kyberNetwork.setKyberProxy(kyberProxy.address);
//         await kyberNetwork.setWhiteList(whiteList.address);
//         await kyberNetwork.setExpectedRate(expectedRate);
//         await kyberNetwork.setFeeBurner(feeBurner.address);
//         await kyberNetwork.setParams(gasPrice, negligibleRateDiff);
//         await kyberNetwork.addOperator(operator);
//         await kyberNetwork.setEnable(true);
//         await kyberNetwork.addOperator(lister.address);

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
//         let amountKncInWei = precisionUnits.mul(new BN(600));
//         let amountEthInWei = new BN(minNewOrderWei);

//         await makerDeposit(
//             reserve,
//             maker,
//             amountEthInWei /* ethWei */,
//             amountTokenInWei /* tokenTwei */,
//             amountKncInWei /* kncTwei */,
//             kncToken
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
//         await token.approve(kyberProxy.address, tokenTweiToSwap, {from: taker});
//         let tradeLog = await kyberProxy.swapTokenToEther(
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

//         const ethKncRatePrecision = await feeBurner.kncPerEthRatePrecision();
//         const burnReserveFeeBps = await lister.ORDERBOOK_BURN_FEE_BPS();

//         // (ethWeiToSwap * (ethKncRatePrecision) * (25: BURN_FEE_BPS) / 10000) - 1
//         const kncAmount = actualWeiValue.mul(ethKncRatePrecision).div(precisionUnits);
//         const expectedBurnFeesInKncWei = kncAmount.mul(burnReserveFeeBps).div(new BN(10000)).sub(new BN(1));

//         Helper.assertEqual(burnAssignedFeesEvent.args.quantity, expectedBurnFeesInKncWei);
//     });

//     it("list order book reserve. see can't unlist if knc rate is in boundaries. can unlist when knc rate too low", async() => {
//         // prepare kyber network
//         const kyberNetwork = await KyberNetwork.new(admin);
//         const mockNetwork = await MockKyberNetwork.new(admin);

//         let ethKncRate = new BN(100);
//         let ethToKncRatePrecision = precisionUnits.mul(ethKncRate);

//         const feeBurner = await FeeBurner.new(
//             admin,
//             kncToken.address,
//             mockNetwork.address,
//             ethToKncRatePrecision
//         );

//         ethToKncRatePrecision = precisionUnits.mul(ethKncRate);
//         let kncToEthRatePrecision = precisionUnits.div(ethKncRate);

//         await mockNetwork.setPairRate(ethAddress, kncAddress, ethToKncRatePrecision);
//         await mockNetwork.setPairRate(kncAddress, ethAddress, kncToEthRatePrecision);

//         await feeBurner.setKNCRate();

//         const lister = await PermissionlessOrderbookReserveLister.new(
//             kyberNetwork.address,
//             orderFactory.address,
//             medianizer.address,
//             kncAddress,
//             unsupportedTokens,
//             maxOrdersPerTrade,
//             minNewOrderValueUsd
//         );

//         // configure feeburner
//         await feeBurner.addOperator(lister.address, {from: admin});

//         // configure kyber network
//         await kyberNetwork.setFeeBurner(feeBurner.address);
//         await kyberNetwork.addOperator(lister.address);

//         // list an order book reserve
//         await lister.addOrderbookContract(token.address);
//         await lister.initOrderbookContract(token.address);
//         await lister.listOrderbookContract(token.address);

//         // add orders
//         const reserve = await OrderbookReserve.at(
//             await lister.reserves(token.address)
//         );

//         let baseKncEthRate = await reserve.kncPerEthBaseRatePrecision();

//         let reserveIndex = 0;
//         let address = await kyberNetwork.reserves(reserveIndex);
//         Helper.assertEqual(address, reserve.address);

//          // see unlist fails
//         try {
//             await lister.unlistOrderbookContract(token.address, reserveIndex);
//             assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         let stakeFactor = await reserve.BURN_TO_STAKE_FACTOR();
//         ethKncRate = ethKncRate.mul(stakeFactor.add(new BN(1)));

//         ethToKncRatePrecision = precisionUnits.mul(ethKncRate);
//         kncToEthRatePrecision = precisionUnits.div(ethKncRate.mul(new BN(101)).div(new BN(100)));

//         await mockNetwork.setPairRate(ethAddress, kncAddress, ethToKncRatePrecision);
//         await mockNetwork.setPairRate(kncAddress, ethAddress, kncToEthRatePrecision);

//         let tradeBlocked = await reserve.kncRateBlocksTrade();
//         Helper.assertEqual(tradeBlocked, false);

//         await feeBurner.setKNCRate();
//         tradeBlocked = await reserve.kncRateBlocksTrade();
//         Helper.assertEqual(tradeBlocked, true);

//         await lister.unlistOrderbookContract(token.address, reserveIndex);

//         let listing = await lister.getOrderbookListingStage(token.address);
//         Helper.assertEqual(listing[1], LISTING_NONE);
//     })

//     it("lister. see list and unlist fail when lister not operator in network", async() => {

//         // prepare kyber network
//         const kyberNetwork = await KyberNetwork.new(admin);
//         const mockNetwork = await MockKyberNetwork.new(admin);

//         let ethKncRate = new BN(100);
//         let ethToKncRatePrecision = precisionUnits.mul(ethKncRate);

//         const feeBurner = await FeeBurner.new(
//             admin,
//             kncToken.address,
//             mockNetwork.address,
//             ethToKncRatePrecision
//         );

//         ethToKncRatePrecision = precisionUnits.mul(ethKncRate);
//         let kncToEthRatePrecision = precisionUnits.div(ethKncRate);

//         await mockNetwork.setPairRate(ethAddress, kncAddress, ethToKncRatePrecision);
//         await mockNetwork.setPairRate(kncAddress, ethAddress, kncToEthRatePrecision);

//         await feeBurner.setKNCRate();

//         const lister = await PermissionlessOrderbookReserveLister.new(
//             kyberNetwork.address,
//             orderFactory.address,
//             medianizer.address,
//             kncAddress,
//             unsupportedTokens,
//             maxOrdersPerTrade,
//             minNewOrderValueUsd
//         );

//         // configure feeburner
//         await feeBurner.addOperator(lister.address, {from: admin});

//         // configure kyber network
//         await kyberNetwork.setFeeBurner(feeBurner.address);

//         // list an order book reserve
//         await lister.addOrderbookContract(token.address);
//         await lister.initOrderbookContract(token.address);

//         try {
//              await lister.listOrderbookContract(token.address);
//              assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         await kyberNetwork.addOperator(lister.address);
//         //now should succeed
//         await lister.listOrderbookContract(token.address);

//         const reserve = await OrderbookReserve.at(
//             await lister.reserves(token.address)
//         );

//         //create a large rate change so unlisting is possible
//         let stakeFactor = await reserve.BURN_TO_STAKE_FACTOR();
//         ethKncRate = ethKncRate.mul(new BN(stakeFactor).add(new BN(1)));
//         ethToKncRatePrecision = precisionUnits.mul(ethKncRate);
//         kncToEthRatePrecision = precisionUnits.div(ethKncRate.mul(new BN(101)).div(new BN(100)));

//         await mockNetwork.setPairRate(ethAddress, kncAddress, ethToKncRatePrecision);
//         await mockNetwork.setPairRate(kncAddress, ethAddress, kncToEthRatePrecision);
//         await feeBurner.setKNCRate();

//         await kyberNetwork.removeOperator(lister.address);

//         let reserveIndex = 0;

//         try {
//              await lister.unlistOrderbookContract(token.address, reserveIndex);
//              assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         await kyberNetwork.addOperator(lister.address);
//         await lister.unlistOrderbookContract(token.address, reserveIndex);
//     })

//     it("see listing fails when lister not operator in fee burner", async() => {

//         // prepare kyber network
//         const kyberNetwork = await KyberNetwork.new(admin);
//         const mockNetwork = await MockKyberNetwork.new(admin);

//         let ethKncRate = new BN(100);
//         let ethToKncRatePrecision = precisionUnits.mul(ethKncRate);

//         const feeBurner = await FeeBurner.new(
//             admin,
//             kncToken.address,
//             mockNetwork.address,
//             ethToKncRatePrecision
//         );

//         ethToKncRatePrecision = precisionUnits.mul(ethKncRate);
//         let kncToEthRatePrecision = precisionUnits.div(ethKncRate);

//         await mockNetwork.setPairRate(ethAddress, kncAddress, ethToKncRatePrecision);
//         await mockNetwork.setPairRate(kncAddress, ethAddress, kncToEthRatePrecision);

//         await feeBurner.setKNCRate();

//         const lister = await PermissionlessOrderbookReserveLister.new(
//             kyberNetwork.address,
//             orderFactory.address,
//             medianizer.address,
//             kncAddress,
//             unsupportedTokens,
//             maxOrdersPerTrade,
//             minNewOrderValueUsd
//         );

//         // configure kyber network
//         await kyberNetwork.setFeeBurner(feeBurner.address);
//         await kyberNetwork.addOperator(lister.address);

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

//         // prepare kyber network
//         const kyberNetwork = await KyberNetwork.new(admin);
//         const mockNetwork = await MockKyberNetwork.new(admin);

//         let ethKncRate = new BN(100);
//         let ethToKncRatePrecision = precisionUnits.mul(ethKncRate);

//         const feeBurner = await FeeBurner.new(
//             admin,
//             kncToken.address,
//             mockNetwork.address,
//             ethToKncRatePrecision
//         );

//         ethToKncRatePrecision = precisionUnits.mul(ethKncRate);
//         let kncToEthRatePrecision = precisionUnits.div(ethKncRate);

//         await mockNetwork.setPairRate(ethAddress, kncAddress, ethToKncRatePrecision);
//         await mockNetwork.setPairRate(kncAddress, ethAddress, kncToEthRatePrecision);

//         await feeBurner.setKNCRate();

//         const lister = await PermissionlessOrderbookReserveLister.new(
//             kyberNetwork.address,
//             orderFactory.address,
//             medianizer.address,
//             kncAddress,
//             unsupportedTokens,
//             maxOrdersPerTrade,
//             minNewOrderValueUsd
//         );

//         // configure feeburner
//         await feeBurner.addOperator(lister.address, {from: admin});

//         // configure kyber network
//         await kyberNetwork.setFeeBurner(feeBurner.address);
//         await kyberNetwork.addOperator(lister.address);

//         // list an order book reserve
//         await lister.addOrderbookContract(token.address);

//         const reserve = await OrderbookReserve.at(
//             await lister.reserves(token.address)
//         );

//         //create a large rate change so unlisting is possible
//         let stakeFactor = await reserve.BURN_TO_STAKE_FACTOR();
//         ethKncRate = ethKncRate.mul(new BN(stakeFactor).add(new BN(1)));

//         ethToKncRatePrecision = precisionUnits.mul(ethKncRate);
//         kncToEthRatePrecision = precisionUnits.div(ethKncRate.mul(new BN(101)).div(new BN(100)));

//         await mockNetwork.setPairRate(ethAddress, kncAddress, ethToKncRatePrecision);
//         await mockNetwork.setPairRate(kncAddress, ethAddress, kncToEthRatePrecision);
//         await feeBurner.setKNCRate();

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

// async function makerDeposit(res, maker, ethWei, tokenTwei, kncTwei, kncToken) {
//     await token.approve(res.address, tokenTwei, {from: admin});
//     await res.depositToken(maker, tokenTwei, {from: admin});
//     await kncToken.approve(res.address, kncTwei, {from: admin});
//     await res.depositKncForFee(maker, kncTwei, {from: admin});
//     await res.depositEther(maker, {from: maker, value: ethWei});
// }
