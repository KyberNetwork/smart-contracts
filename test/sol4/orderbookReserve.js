// const TestToken = artifacts.require("TestToken.sol");
// const NetworkProxy = artifacts.require("KyberNetworkProxy.sol");
// const KyberNetwork = artifacts.require("KyberNetwork.sol");
// const FeeBurner = artifacts.require("FeeBurner.sol");
// const OrderList = artifacts.require("OrderList.sol");
// const OrderListFactory = artifacts.require("OrderListFactory.sol");
// const OrderbookReserve = artifacts.require("OrderbookReserve.sol");
// const MockOrderbookReserve = artifacts.require("MockOrderbookReserve.sol");
// const TestTokenFailing = artifacts.require("TestTokenFailing.sol");
// const TestTokenTransferFailing = artifacts.require("TestTokenTransferFailing.sol");
// const MockMedianizer = artifacts.require("MockMedianizer.sol");
// const MockKyberNetwork = artifacts.require("MockKyberNetwork.sol");
// const PermissionlessOrderbookReserveLister = artifacts.require("PermissionlessOrderbookReserveLister.sol");
// const MockUtils = artifacts.require("MockUtils.sol");

// const Helper = require("../helper.js");
// const BN = web3.utils.BN;
// const lowRate = new BN(42);

// //global variables
// const ethAddress = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
// const zeroAddress = '0x0000000000000000000000000000000000000000';
// const PRECISION = new BN(10).pow(new BN(18));
// const gasPrice = new BN(50).mul(new BN(String(10 ** 9)));
// const negligibleRateDiff = new BN(11);
// const initialEthKncRate = new BN(280);
// const initialEthToKncRatePrecision = PRECISION.mul(new BN(initialEthKncRate));
// const BPS = new BN(10000);
// const ethDecimals = new BN(18);
// const token18Dec = new BN(10).pow(new BN(18));

// let MAX_RATE = PRECISION.mul(new BN(String(10 ** 6))); //internal parameter in Utils.sol.
// let MAX_QTY = new BN(10).pow(new BN(28));

// //permission groups
// let admin;
// let withDrawAddress;

// //contracts
// let reserve;
// let feeBurner;
// let network;
// let ordersFactory;
// let medianizer;

// //tokens data
// let token;
// let tokenAdd;
// let KNCToken;
// let kncAddress;
// const tokenDecimals = 18;

// let headId;
// let tailId;

// //addresses
// let user1;
// let user2;
// let maker1;
// let maker2;
// let maker3;
// let operator;
// let taker;

// let firstFreeOrderIdPerReserveList;

// let numOrderIdsPerMaker;

// let currentBlock;

// let burnToStakeFactor;

// let makerBurnFeeBps = 25;
// let maxOrdersPerTrade = 10;
// let minOrderSizeDollar = 1000;
// let minNewOrderWei;
// let baseKncPerEthRatePrecision;
// let dollarsPerEthPrecision = PRECISION.mul(new BN(500));

// contract('OrderbookReserve', async (accounts) => {

//     before('one time init. tokens, accounts', async() => {
//         admin = accounts[0];
//         user1 = accounts[1];
//         user2 = accounts[2];
//         maker1 = accounts[3];
//         maker2 = accounts[4];
//         maker3 = accounts[5];
//         network = accounts[6];
        
//         token = await TestToken.new("the token", "TOK", tokenDecimals);
//         tokenAdd = token.address;

//         KNCToken = await TestToken.new("Kyber Crystals", "KNC", 18);
//         kncAddress = KNCToken.address;

//         feeBurner = await FeeBurner.new(admin, kncAddress, network, initialEthToKncRatePrecision);

//         ordersFactory = await OrderListFactory.new();
//         medianizer = await MockMedianizer.new();
//         await medianizer.setValid(true);
//         await medianizer.setEthPrice(dollarsPerEthPrecision);

//         currentBlock = await Helper.getCurrentBlock();

//         reserve = await OrderbookReserve.new(kncAddress, tokenAdd, feeBurner.address, network, medianizer.address,
//             ordersFactory.address, minOrderSizeDollar, maxOrdersPerTrade, makerBurnFeeBps);
//         await reserve.init();
//         numOrderIdsPerMaker = await reserve.NUM_ORDERS();
//         burnToStakeFactor = await reserve.BURN_TO_STAKE_FACTOR();

//         let ordersAdd = await reserve.tokenToEthList();
//         let orders = await OrderList.at(ordersAdd);
//         headId = await orders.HEAD_ID();
//         tailId = await orders.TAIL_ID();

//         let rxLimits = await reserve.limits();
//         minNewOrderWei = rxLimits[2];

//         baseKncPerEthRatePrecision = await reserve.kncPerEthBaseRatePrecision();
//         firstFreeOrderIdPerReserveList = (await orders.nextFreeId());

//         let mockUtils = await MockUtils.new();
//         MAX_RATE = await mockUtils.getMaxRate();
//         MAX_QTY = await mockUtils.getMaxQty();
//     });

//     beforeEach('setup contract for each test', async () => {
//         reserve = await OrderbookReserve.new(kncAddress, tokenAdd, feeBurner.address, network, medianizer.address,
//             ordersFactory.address, minOrderSizeDollar, maxOrdersPerTrade, makerBurnFeeBps);
//         await reserve.init();
//     });

//     afterEach('withdraw ETH from contracts', async () => {
//         let orderList = await reserve.getEthToTokenOrderList();
//         for (let i = 0; i < orderList.length; i++) {
//             //start from 1 since first order is head
//             try{await reserve.cancelEthToTokenOrder(orderList[i], {from: maker1});
//             } catch(e) {};
//         }

//         let rxWei = await reserve.makerFunds(maker1, ethAddress);
//         if (rxWei > 0) {
//             await reserve.withdrawEther(rxWei, {from: maker1})
//         }

//         rxWei = await reserve.makerFunds(maker2, ethAddress);
//         if (rxWei > 0) {
//             await reserve.withdrawEther(rxWei, {from: maker2})
//         }
//     });

//     it("test globals.", async () => {
//         let rxContracts = await reserve.contracts();
//         Helper.assertEqual(rxContracts[0], kncAddress);
//         Helper.assertEqual(rxContracts[1], tokenAdd);
//         Helper.assertEqual(rxContracts[2], feeBurner.address);
//         Helper.assertEqual(rxContracts[3], network);
//         Helper.assertEqual(rxContracts[4], medianizer.address);

//         let rxLimits = await reserve.limits();
//         Helper.assertEqual(rxLimits[0], minOrderSizeDollar);
//         Helper.assertEqual(rxLimits[1], maxOrdersPerTrade);
//         Helper.assertEqual(rxLimits[2], PRECISION.mul(new BN(2)));
//         Helper.assertEqual(rxLimits[3], PRECISION.mul(new BN(1)));

//         let rxBaseKncPerEthPrecision = await reserve.kncPerEthBaseRatePrecision();
//         Helper.assertEqual(initialEthToKncRatePrecision, rxBaseKncPerEthPrecision);

//         let burnFees = await reserve.makerBurnFeeBps();
//         Helper.assertEqual(burnFees, makerBurnFeeBps);

//         let localFeeBps = 70;
//         let reserve2 = await OrderbookReserve.new(kncAddress, tokenAdd, feeBurner.address, network, medianizer.address, ordersFactory.address, minOrderSizeDollar, maxOrdersPerTrade, localFeeBps);
//         burnFees = await reserve2.makerBurnFeeBps();
//         Helper.assertEqual(burnFees, localFeeBps);

//         let headIdInReserve = await reserve.HEAD_ID();
//         let tailIdInReserve = await reserve.TAIL_ID();
//         Helper.assertEqual(headId, headIdInReserve);
//         Helper.assertEqual(tailId, tailIdInReserve);

//         let permHintForGetRate = await reserve.permHint
//     });

//     it("test events, 'take full order' event, 'take partial order' event", async()=> {
//         let tokenWeiDepositAmount = token18Dec.mul(new BN(60));
//         let kncTweiDepositAmount = PRECISION.mul(new BN(600));
//         let ethWeiDepositAmount = PRECISION.mul(new BN(0));
//         await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

//         let valueWei = PRECISION.mul(new BN(2));
//         let valueTwei = token18Dec.mul(new BN(12));

//         //add orders
//         await reserve.submitTokenToEthOrder(valueTwei, valueWei, {from: maker1});
//         await reserve.submitTokenToEthOrder(valueTwei, valueWei.add(new BN(100)), {from: maker1});

//         // legal trade
//         let payValueWei = valueWei.div(new BN(2));
//         let rate = await reserve.getConversionRate(ethAddress, tokenAdd, payValueWei, 0);
//         rc = await reserve.trade(ethAddress, payValueWei, tokenAdd, user1, rate, false, {from: network, value: payValueWei});
//         Helper.assertEqual(rc.logs[0].event, 'PartialOrderTaken');
//         Helper.assertEqual(rc.logs[0].args.maker, maker1);
//         Helper.assertEqual(rc.logs[0].args.orderId, firstFreeOrderIdPerReserveList);
//         Helper.assertEqual(rc.logs[0].args.isEthToToken, true);
//         Helper.assertEqual(rc.logs[0].args.isRemoved, false);

//         Helper.assertEqual(rc.logs[1].event, 'OrderbookReserveTrade');
//         Helper.assertEqual(rc.logs[1].args.srcToken, ethAddress.toLowerCase());
//         Helper.assertEqual(rc.logs[1].args.dstToken, tokenAdd.toLowerCase());
//         Helper.assertEqual(rc.logs[1].args.srcAmount, payValueWei);
//         Helper.assertEqual(rc.logs[1].args.dstAmount, valueTwei.div(new BN(2)));

//         payValueWei = valueWei.div(new BN(2)).sub(new BN(500))
//         rate = await reserve.getConversionRate(ethAddress, tokenAdd, payValueWei, 0);
//         rc = await reserve.trade(ethAddress, payValueWei, tokenAdd, user1, rate, false, {from: network, value: payValueWei});
//         Helper.assertEqual(rc.logs[0].event, 'PartialOrderTaken');
//         Helper.assertEqual(rc.logs[0].args.maker, maker1);
//         Helper.assertEqual(rc.logs[0].args.orderId, firstFreeOrderIdPerReserveList);
//         Helper.assertEqual(rc.logs[0].args.isEthToToken, true);
//         Helper.assertEqual(rc.logs[0].args.isRemoved, true);

//         payValueWei = valueWei.add(new BN(100))
//         rate = await reserve.getConversionRate(ethAddress, tokenAdd, payValueWei, 0);
//         rc = await reserve.trade(ethAddress, payValueWei, tokenAdd, user1, rate, false, {from: network, value: payValueWei});
//         Helper.assertEqual(rc.logs[0].event, 'FullOrderTaken');
//         Helper.assertEqual(rc.logs[0].args.maker, maker1);
//         Helper.assertEqual(rc.logs[0].args.orderId, firstFreeOrderIdPerReserveList * 1 + 1 * 1);
//         Helper.assertEqual(rc.logs[0].args.isEthToToken, true);
//     });

//     describe("test various revert scenarios", function() {
//         it("verify ctor parameters for order book reserve. no zero values", async() => {

//             await OrderbookReserve.new(kncAddress, tokenAdd, feeBurner.address, network, medianizer.address, ordersFactory.address, minOrderSizeDollar, maxOrdersPerTrade, makerBurnFeeBps);

//             try {
//                 await OrderbookReserve.new(zeroAddress, tokenAdd, feeBurner.address, network, medianizer.address, ordersFactory.address, minOrderSizeDollar, maxOrdersPerTrade, makerBurnFeeBps);
//                 assert(false, "throw was expected in line above.")
//             } catch(e){
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//             }

//             try {
//                 await OrderbookReserve.new(kncAddress, zeroAddress, feeBurner.address, network, medianizer.address, ordersFactory.address,  minOrderSizeDollar, maxOrdersPerTrade, makerBurnFeeBps);
//                 assert(false, "throw was expected in line above.")
//             } catch(e) {
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//             }

//             try {
//                 await OrderbookReserve.new(kncAddress, tokenAdd, zeroAddress, network, medianizer.address, ordersFactory.address,  minOrderSizeDollar, maxOrdersPerTrade, makerBurnFeeBps);
//                 assert(false, "throw was expected in line above.")
//             } catch(e) {
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//             }

//             try {
//                 await OrderbookReserve.new(kncAddress, tokenAdd, feeBurner.address, zeroAddress, medianizer.address, ordersFactory.address,  minOrderSizeDollar, maxOrdersPerTrade, makerBurnFeeBps);
//                 assert(false, "throw was expected in line above.")
//             } catch(e) {
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//             }

//             try {
//                 await OrderbookReserve.new(kncAddress, tokenAdd, feeBurner.address, network, zeroAddress, ordersFactory.address, minOrderSizeDollar, maxOrdersPerTrade, makerBurnFeeBps);
//                 assert(false, "throw was expected in line above.")
//             } catch(e) {
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//             }

//             try {
//                 await OrderbookReserve.new(kncAddress, tokenAdd, feeBurner.address, network, medianizer.address, zeroAddress, minOrderSizeDollar, maxOrdersPerTrade, makerBurnFeeBps);
//                 assert(false, "throw was expected in line above.")
//             } catch(e) {
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//             }

//             try {
//                 await OrderbookReserve.new(kncAddress, tokenAdd, feeBurner.address, network, medianizer.address, ordersFactory.address, 0, maxOrdersPerTrade, makerBurnFeeBps);
//                 assert(false, "throw was expected in line above.")
//             } catch(e) {
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//             }

//             try {
//                 await OrderbookReserve.new(kncAddress, tokenAdd, feeBurner.address, network, medianizer.address, ordersFactory.address,  minOrderSizeDollar, 0, makerBurnFeeBps);
//                 assert(false, "throw was expected in line above.")
//             } catch(e) {
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//             }
//             try {
//                 await OrderbookReserve.new(kncAddress, tokenAdd, feeBurner.address, network, medianizer.address, ordersFactory.address,  minOrderSizeDollar, maxOrdersPerTrade, 0);
//                 assert(false, "throw was expected in line above.")
//             } catch(e) {
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//             }

//             let maxBurnFee = await reserve.MAX_BURN_FEE_BPS();

//             try {
//                 await OrderbookReserve.new(kncAddress, tokenAdd, feeBurner.address, network, medianizer.address, ordersFactory.address,  minOrderSizeDollar, maxOrdersPerTrade, maxBurnFee.add(new BN(1)));
//                 assert(false, "throw was expected in line above.")
//             } catch(e) {
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//             }
//         });

//         it("take partial order revert conditions", async() => {
//             let res = await MockOrderbookReserve.new(kncAddress, tokenAdd, feeBurner.address, network, medianizer.address, ordersFactory.address, minOrderSizeDollar, maxOrdersPerTrade, makerBurnFeeBps);

//             try {
//                 await res.testTakePartialOrder(maker1, 3, ethAddress, tokenAdd, 100, 200, 199, 101);
//                 assert(false, "throw was expected in line above.")
//             } catch(e) {
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//             }

//             try {
//                 await res.testTakePartialOrder(maker1, 3, ethAddress, tokenAdd, 100, 200, 201, 99);
//                 assert(false, "throw was expected in line above.")
//             } catch(e) {
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//             }
//         })

//         it("verify 2nd init for same reserve doesn't deploy new orderList", async() => {
//             let listEthToToken = await reserve.ethToTokenList();
//             let listTokenToEth = await reserve.tokenToEthList();

//             await reserve.init();

//             Helper.assertEqual(listEthToToken, (await reserve.ethToTokenList()))
//             Helper.assertEqual(listTokenToEth, (await reserve.tokenToEthList()))
//         })

//         it("verify can't deploy reserve if eth to dollar price is not valid", async() => {
//             let res = await OrderbookReserve.new(kncAddress, tokenAdd, feeBurner.address, network, medianizer.address, ordersFactory.address, minOrderSizeDollar, maxOrdersPerTrade, makerBurnFeeBps);

//             await medianizer.setValid(false);

//             try {
//                 res = await OrderbookReserve.new(kncAddress, tokenAdd, feeBurner.address, network, medianizer.address, ordersFactory.address, minOrderSizeDollar, maxOrdersPerTrade, makerBurnFeeBps);
//                 assert(false, "throw was expected in line above.")
//             } catch(e) {
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//             }

//             await medianizer.setValid(true);
//         })

//         it("verify can't set min order size Eth when price result from medianizer is out of range", async() => {
//             await reserve.setMinOrderSizeEth();

//             let rxLimits = await reserve.limits();
//             let minNewOrderWeiValue = rxLimits[2];

//             await medianizer.setEthPrice(0);
//             try {
//                 await reserve.setMinOrderSizeEth();
//                 assert(false, "throw was expected in line above.")
//             } catch(e) {
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//             }

//             rxLimits = await reserve.limits();
//             Helper.assertEqual(minNewOrderWeiValue, rxLimits[2]);

//             let maxUsdPerEth = await reserve.MAX_USD_PER_ETH();
//             let maxUsdPerEthInWei = PRECISION.mul(maxUsdPerEth);

//             await medianizer.setEthPrice(maxUsdPerEthInWei);
//             try {
//                 await reserve.setMinOrderSizeEth();
//                 assert(false, "throw was expected in line above.")
//             } catch(e) {
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//             }

//             rxLimits = await reserve.limits();
//             Helper.assertEqual(minNewOrderWeiValue, rxLimits[2]);

//             await medianizer.setEthPrice(dollarsPerEthPrecision);
//             await medianizer.setValid(true);
//         })

//         it("verify can't construct order book reserve if approve knc to burner fails.", async() => {
//             let res;

//             let failingKnc = await TestTokenFailing.new("kyber no approve", "KNC", 18);

//             try {
//                 await OrderbookReserve.new(failingKnc.address, tokenAdd, feeBurner.address, network, medianizer.address, ordersFactory.address,  minOrderSizeDollar, maxOrdersPerTrade, makerBurnFeeBps);
//                 assert(false, "throw was expected in line above.")
//             } catch(e) {
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//             }

//             await OrderbookReserve.new(kncAddress, tokenAdd, feeBurner.address, network, medianizer.address, ordersFactory.address,  minOrderSizeDollar, maxOrdersPerTrade, makerBurnFeeBps);
//         });

//         it("verify 2nd init call for same token works OK.", async() => {
//             let res = await OrderbookReserve.new(kncAddress, tokenAdd, feeBurner.address, network, medianizer.address, ordersFactory.address,  minOrderSizeDollar, maxOrdersPerTrade, makerBurnFeeBps);

//             await res.init({from: accounts[1]});

//             //see 2nd init from correct sender has good results.
//             await res.init({from: accounts[0]});
//         });

//         it("verify get rate works only for token->Eth or eth->token. other options revert", async() => {
//             let rate = await reserve.getConversionRate(tokenAdd, ethAddress, token18Dec, 0);
//             Helper.assertEqual(rate, 0);
//             rate = await reserve.getConversionRate(ethAddress, tokenAdd, token18Dec, 0);
//             Helper.assertEqual(rate, 0);

//             let otherTok = await TestToken.new("other", "oth", 15);
//             let address = otherTok.address;

//             try {
//                 rate = await reserve.getConversionRate(ethAddress, ethAddress, token18Dec, 0);
//                 assert(false, "throw was expected in line above.")
//             } catch(e) {
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//             }

//             try {
//                 rate = await reserve.getConversionRate(tokenAdd, tokenAdd, token18Dec, 0);
//                 assert(false, "throw was expected in line above.")
//             } catch(e) {
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//             }

//             try {
//                 rate = await reserve.getConversionRate(address, tokenAdd, token18Dec, 0);
//                 assert(false, "throw was expected in line above.")
//             } catch(e) {
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//             }

//             try {
//                 rate = await reserve.getConversionRate(tokenAdd, address, token18Dec, 0);
//                 assert(false, "throw was expected in line above.")
//             } catch(e) {
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//             }

//             try {
//                 rate = await reserve.getConversionRate(address, ethAddress, token18Dec, 0);
//                 assert(false, "throw was expected in line above.")
//             } catch(e) {
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//             }

//             try {
//                 rate = await reserve.getConversionRate(ethAddress, address, token18Dec, 0);
//                 assert(false, "throw was expected in line above.")
//             } catch(e) {
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//             }
//         });

//         it("verify get add order hint reverts if Eth value is below min order value", async() => {
//             let weiAmount = new BN(minNewOrderWei);
//             let tweiAmount = new BN(String(9 * 10 ** 12));

//             await reserve.getEthToTokenAddOrderHint(weiAmount, tweiAmount);

//             try {
//                 await reserve.getEthToTokenAddOrderHint(weiAmount.sub(new BN(1)), tweiAmount);
//                 assert(false, "throw was expected in line above.")
//             } catch(e) {
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//             }

//             await reserve.getTokenToEthAddOrderHint(tweiAmount, weiAmount);

//             try {
//                 await reserve.getTokenToEthAddOrderHint(tweiAmount, weiAmount.sub(new BN(1)));
//                 assert(false, "throw was expected in line above.")
//             } catch(e) {
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//             }
//         })

//         it("verify get update order hint reverts if Eth value is below min order value", async() => {
//             let tokenWeiDepositAmount = token18Dec.mul(new BN(30));
//             let kncTweiDepositAmount = PRECISION.mul(new BN(600));
//             let ethWeiDepositAmount = PRECISION.mul(new BN(3));
//             await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

//             let weiAmount = new BN(minNewOrderWei);
//             let tweiAmount = new BN(String(9 * 10 ** 12));

//             await reserve.submitTokenToEthOrder(tweiAmount, weiAmount, {from: maker1});
//             await reserve.submitEthToTokenOrder(weiAmount, tweiAmount, {from: maker1});
//             let orderId = firstFreeOrderIdPerReserveList;

//             await reserve.getEthToTokenUpdateOrderHint(orderId, weiAmount.add(new BN(1)), tweiAmount);

//             try {
//                 await reserve.getEthToTokenUpdateOrderHint(orderId, weiAmount.sub(new BN(1)), tweiAmount);
//                 assert(false, "throw was expected in line above.")
//             } catch(e) {
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//             }

//             await reserve.getTokenToEthUpdateOrderHint(orderId, tweiAmount, weiAmount.add(new BN(1)));

//             try {
//                 await reserve.getTokenToEthUpdateOrderHint(orderId, tweiAmount, weiAmount.sub(new BN(1)));
//                 assert(false, "throw was expected in line above.")
//             } catch(e) {
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//             }
//         })

//         it("verify trade with token source only works for token->Eth. other options revert", async() => {
//             let tokenWeiDepositAmount = token18Dec.mul(new BN(0));
//             let kncTweiDepositAmount = PRECISION.mul(new BN(600));
//             let ethWeiDepositAmount = PRECISION.mul(new BN(10));
//             await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

//             let valueWei = PRECISION.mul(new BN(5));
//             let valueTwei = token18Dec.mul(new BN(15));

//             //add orders
//             let rc = await reserve.submitEthToTokenOrder(valueWei, valueTwei, {from: maker1});

//             //validate we have rate values
//             let payValueTwei = 30000;
//             let rate = await reserve.getConversionRate(tokenAdd, ethAddress, payValueTwei, 0);
//             assert(rate != 0);

//             let otherTok = await TestToken.new("other", "oth", 15);
//             let otherTokAddress = otherTok.address;

//             // legal trade
//             await token.transfer(network, payValueTwei);
//             await token.approve(reserve.address, payValueTwei, {from: network})
//             rc = await reserve.trade(tokenAdd, payValueTwei, ethAddress, user1, rate, false, {from: network});

//             // prepare trade
//             await token.transfer(network, payValueTwei);
//             await token.approve(reserve.address, payValueTwei, {from: network})

//             rate = await reserve.getConversionRate(tokenAdd, ethAddress, payValueTwei, 0);
//             try {
//                 await reserve.trade(tokenAdd, payValueTwei, tokenAdd, user1, rate, false, {from:network});
//                 assert(false, "throw was expected in line above.")
//             } catch(e) {
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//             }

//             try {
//                 await reserve.trade(tokenAdd, payValueTwei, otherTokAddress, user1, rate, false, {from:network});
//                 assert(false, "throw was expected in line above.")
//             } catch(e) {
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//             }

//             //verify trade is legal
//             rc = await reserve.trade(tokenAdd, payValueTwei, ethAddress, user1, rate, false, {from: network});
//         });

//         it("verify trade with eth source only works for Eth->token. other options revert", async() => {
//             let tokenWeiDepositAmount = token18Dec.mul(new BN(60));
//             let kncTweiDepositAmount = PRECISION.mul(new BN(600));
//             let ethWeiDepositAmount = PRECISION.mul(new BN(0));
//             await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

//             let valueWei = PRECISION.mul(new BN(5));
//             let valueTwei = token18Dec.mul(new BN(15));

//             //add orders
//             let rc = await reserve.submitTokenToEthOrder(valueTwei, valueWei, {from: maker1});

//             let otherTok = await TestToken.new("other", "oth", 15);
//             let otherTokAddress = otherTok.address;

//             // legal trade
//             let payValueWei = 3000;
//             //validate we have rate values
//             let rate = await reserve.getConversionRate(ethAddress, tokenAdd, payValueWei, 0);
//             assert(rate != 0);
//             rc = await reserve.trade(ethAddress, payValueWei, tokenAdd, user1, rate, false, {from: network, value: payValueWei});

//             try {
//                 await reserve.trade(ethAddress, payValueWei, ethAddress, user1, rate, false, {from: network, value: payValueWei});
//                 assert(false, "throw was expected in line above.")
//             } catch(e) {
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//             }

//             try {
//                 await reserve.trade(ethAddress, payValueWei, otherTokAddress, user1, rate, false, {from: network, value: payValueWei});
//                 assert(false, "throw was expected in line above.")
//             } catch(e) {
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//             }

//             //verify trade is legal
//             rate = await reserve.getConversionRate(ethAddress, tokenAdd, payValueWei, 0);
//             await reserve.trade(ethAddress, payValueWei, tokenAdd, user1, rate, false, {from: network, value: payValueWei});
//         });

//         it("verify trade illegal message eth value revert", async() => {
//             let tokenWeiDepositAmount = token18Dec.mul(new BN(90));
//             let kncTweiDepositAmount = PRECISION.mul(new BN(600));
//             let ethWeiDepositAmount = PRECISION.mul(new BN(5));
//             await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

//             let valueWei = PRECISION.mul(new BN(5));
//             let valueTwei = token18Dec.mul(new BN(15));

//             //add orders
//             await reserve.submitTokenToEthOrder(valueTwei, valueWei, {from: maker1});
//             await reserve.submitEthToTokenOrder(valueWei, valueTwei, {from: maker1});

//             // legal trade
//             let payValueWei = 3000;
//             let rate = await reserve.getConversionRate(ethAddress, tokenAdd, payValueWei, 0);
//             await reserve.trade(ethAddress, payValueWei, tokenAdd, user1, rate, false, {from: network, value: payValueWei});

//             let badMessageValue = 3001;
            
//             rate = await reserve.getConversionRate(ethAddress, tokenAdd, payValueWei, 0);
//             try {
//                 await reserve.trade(ethAddress, payValueWei, tokenAdd, user1, rate, false, {from: network, value: badMessageValue});
//                 assert(false, "throw was expected in line above.")
//             } catch(e) {
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//             }

//             // legal trade
//             let payValueTwei = 30000;
//             await token.transfer(network, payValueTwei);
//             await token.approve(reserve.address, payValueTwei, {from: network})
//             rate = await reserve.getConversionRate(tokenAdd, ethAddress, payValueTwei, 0);
//             await reserve.trade(tokenAdd, payValueTwei, ethAddress, user1, rate, false, {from: network});

//             //now with wrong message value
//             await token.transfer(network, payValueTwei);
//             await token.approve(reserve.address, payValueTwei, {from: network})
//             rate = await reserve.getConversionRate(tokenAdd, ethAddress, payValueTwei, 0);
//             try {
//                 await reserve.trade(tokenAdd, payValueTwei, ethAddress, user1, rate, false, {from:network, value: 1});
//                 assert(false, "throw was expected in line above.")
//             } catch(e) {
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//             }
//         });

//         it("verify trade token to eth with not enough tokens approved to reserve, reverts", async() => {
//             let tokenWeiDepositAmount = token18Dec.mul(new BN(0));
//             let kncTweiDepositAmount = PRECISION.mul(new BN(600));
//             let ethWeiDepositAmount = PRECISION.mul(new BN(5));
//             await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

//             let valueWei = PRECISION.mul(new BN(5));
//             let valueTwei = token18Dec.mul(new BN(15));

//             //add orders
//             await reserve.submitEthToTokenOrder(valueWei, valueTwei, {from: maker1});

//             // legal trade
//             let payValueTwei = 11000;
//             await token.transfer(network, payValueTwei);
//             await token.approve(reserve.address, payValueTwei, {from: network})
//             let rate = await reserve.getConversionRate(tokenAdd, ethAddress, payValueTwei, 0);
//             await reserve.trade(tokenAdd, payValueTwei, ethAddress, user1, rate, false, {from: network});

//             // legal trade
//             payValueTwei = 13000;
//             let badTransferValue = 12999;
//             await token.transfer(network, badTransferValue);
//             await token.approve(reserve.address, badTransferValue, {from: network});
//             rate = await reserve.getConversionRate(tokenAdd, ethAddress, payValueTwei, 0);

//             try {
//                 await reserve.trade(tokenAdd, payValueTwei, ethAddress, user1, rate, false, {from:network});
//                 assert(false, "throw was expected in line above.")
//             } catch(e) {
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//             }
//         });

//         it("verify trade eth to token reverts if token transfer fails", async() => {
//             let failToken = await TestTokenTransferFailing.new("failing", "fail", 18, {from: network});
//             let failAdd = failToken.address;
//             let aReserve = await OrderbookReserve.new(kncAddress, failAdd, feeBurner.address, network, medianizer.address,
//                         ordersFactory.address, minOrderSizeDollar, maxOrdersPerTrade, makerBurnFeeBps);
//             await aReserve.init();

//             let tokenWeiDepositAmount = token18Dec.mul(new BN(20));
//             let kncTweiDepositAmount = PRECISION.mul(new BN(600));
//             let ethWeiDepositAmount = PRECISION.mul(new BN(5));

//             await failToken.approve(aReserve.address, tokenWeiDepositAmount, {from: network});
//             await aReserve.depositToken(maker1, tokenWeiDepositAmount, {from: network});
//             await KNCToken.approve(aReserve.address, kncTweiDepositAmount);
//             await aReserve.depositKncForFee(maker1, kncTweiDepositAmount);
//             await aReserve.depositEther(maker1, {from: maker1, value: ethWeiDepositAmount});

//             let valueWei = PRECISION.mul(new BN(5));
//             let valueTwei = token18Dec.mul(new BN(15));

//             //add orders
//             await aReserve.submitTokenToEthOrder(valueTwei, valueWei, {from: maker1});

//             // legal trade
//             let payValueWei = 11000;

//             try {
//                 await aReserve.trade(ethAddress, payValueWei, failAdd, user1, lowRate, false, {from: network, value: payValueWei});
//                 assert(false, "throw was expected in line above.")
//             } catch(e) {
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//             }
//         });

//         it("verify trade when actual rate too low reverts", async() => {
//             let ethWeiDepositAmount = PRECISION.mul(new BN(6)).add(new BN(20000));
//             let kncTweiDepositAmount = PRECISION.mul(new BN(600));
//             await makerDeposit(maker1, ethWeiDepositAmount, 0, kncTweiDepositAmount);

//             let srcAmountWei = PRECISION.mul(new BN(2)).add(new BN(500)); // 2 ether
//             let orderDstTwei = token18Dec.mul(new BN(9));

//             let rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
//             let bestOrderID = rc.logs[0].args.orderId;

//             orderDstTwei = orderDstTwei.add(new BN(2000));
//             rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
//             // insert order as 3rd in list
//             orderDstTwei = orderDstTwei.add(new BN(2000));
//             rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});

//             // get rate for current state
//             let rate = await reserve.getConversionRate(tokenAdd, ethAddress, orderDstTwei, 0);

//             // remove fist order (best)
//             await reserve.cancelEthToTokenOrder(bestOrderID, {from: maker1});

//             await token.transfer(network, orderDstTwei);
//             await token.approve(reserve.address, orderDstTwei, {from: network});

//             try {
//                 await reserve.trade(tokenAdd, orderDstTwei, ethAddress, user1, rate, false, {from:network});
//                 assert(false, "throw was expected in line above.")
//             } catch(e) {
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//             }

//             //with current rate should succeed.
//             rate = await reserve.getConversionRate(tokenAdd, ethAddress, orderDstTwei, 0);
//             await reserve.trade(tokenAdd, orderDstTwei, ethAddress, user1, rate, false, {from: network});
//         });

//         it("verify add order batch with bad array sizes reverts", async() => {
//             let tokenWeiDepositAmount = token18Dec.mul(new BN(0));
//             let kncTweiDepositAmount = PRECISION.mul(new BN(600));
//             let ethWeiDepositAmount = PRECISION.mul(new BN(10)).add(new BN(30000));
//             await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

//             orderSrc = PRECISION.mul(new BN(2));
//             orderDst = PRECISION.mul(new BN(6));

//             let makeOrdersSrcAmounts = [orderSrc, orderSrc, orderSrc];
//             let badSrcAmounts = [orderSrc, orderSrc, orderSrc, orderSrc]
//             let makeOrdersDstAmount = [orderDst, orderDst.add(new BN(200)), orderDst.add(new BN(500))];
//             let badDstAmounts  = [orderDst, orderDst.add(new BN(200)), orderDst.add(new BN(500)), orderDst];
//             let hintArray = [0, 0, 0];
//             let badHintArr = [0, 0, 0, 0]
//             let isAfterMyPrevOrder = [false, false, false];
//             let badIsAfter = [false, false]
//             let isBuyOrder = [true, true, true];
//             let badIsBuyOrder = [true, true];

//             let totalPayValue = new BN(0);
//             for (let i = 0; i < makeOrdersSrcAmounts.length; i++) {
//                 totalPayValue = totalPayValue.add(makeOrdersDstAmount[i]);
//             }

//             //legal batch order
//             rc = await reserve.addOrderBatch(isBuyOrder, makeOrdersSrcAmounts, makeOrdersDstAmount, hintArray,
//                                         isAfterMyPrevOrder, {from: maker1});


//             await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

//             //failing batch orders
//             try {
//                 await reserve.addOrderBatch(badIsBuyOrder, makeOrdersSrcAmounts, makeOrdersDstAmount, hintArray,
//                                         isAfterMyPrevOrder, {from: maker1});
//                 assert(false, "throw was expected in line above.")
//             } catch(e) {
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//             }
//             try {
//                 await reserve.addOrderBatch(isBuyOrder, badSrcAmounts, makeOrdersDstAmount, hintArray,
//                                         isAfterMyPrevOrder, {from: maker1});
//                 assert(false, "throw was expected in line above.")
//             } catch(e) {
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//             }

//             try {
//                 await reserve.addOrderBatch(isBuyOrder, makeOrdersSrcAmounts, badDstAmounts, hintArray,
//                                         isAfterMyPrevOrder, {from: maker1});
//                 assert(false, "throw was expected in line above.")
//             } catch(e) {
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//             }

//             try {
//                 await reserve.addOrderBatch(isBuyOrder, makeOrdersSrcAmounts, makeOrdersDstAmount, badHintArr,
//                                         isAfterMyPrevOrder, {from: maker1});
//                 assert(false, "throw was expected in line above.")
//             } catch(e) {
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//             }

//             try {
//                 await reserve.addOrderBatch(isBuyOrder, makeOrdersSrcAmounts, makeOrdersDstAmount, hintArray,
//                                         badIsAfter, {from: maker1});
//                 assert(false, "throw was expected in line above.")
//             } catch(e) {
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//             }
//         })

//         it("verify update order batch with bad array sizes reverts", async() => {
//             let tokenWeiDepositAmount = token18Dec.mul(new BN(0));
//             let kncTweiDepositAmount = PRECISION.mul(new BN(600));
//             let ethWeiDepositAmount = PRECISION.mul(new BN(10)).add(new BN(30000));
//             await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

//             orderSrc = PRECISION.mul(new BN(2));
//             orderDst = PRECISION.mul(new BN(6));

//             let makeOrdersSrcAmounts = [orderSrc, orderSrc, orderSrc];
//             let badSrcAmounts = [orderSrc, orderSrc, orderSrc, orderSrc]
//             let makeOrdersDstAmount = [orderDst, orderDst.add(new BN(200)), orderDst.add(new BN(500))];
//             let badDstAmounts  = [orderDst, orderDst.add(new BN(200)), orderDst.add(new BN(500)), orderDst];
//             let hintArray = [0, 0, 0];
//             let badHintArr = [0, 0, 0, 0]
//             let isAfterMyPrevOrder = [false, false, false];
//             let isBuyOrder = [true, true, true];
//             let badIsBuyOrder = [true, true];

//             let totalPayValue = new BN(0);
//             for (let i = 0; i < makeOrdersSrcAmounts.length; i++) {
//                 totalPayValue = totalPayValue.add(makeOrdersDstAmount[i]);
//             }

//             //legal batch update order
//             rc = await reserve.addOrderBatch(isBuyOrder, makeOrdersSrcAmounts, makeOrdersDstAmount, hintArray,
//                                         isAfterMyPrevOrder, {from: maker1});

//             let ordersArray = [firstFreeOrderIdPerReserveList,
//                                firstFreeOrderIdPerReserveList*1 + 1*1,
//                                firstFreeOrderIdPerReserveList*1 + 2*1];

//             let badOrdersArray = [firstFreeOrderIdPerReserveList,
//                                   firstFreeOrderIdPerReserveList*1 + 1*1];


//             rc = await reserve.updateOrderBatch(isBuyOrder, ordersArray, makeOrdersSrcAmounts,
//                             makeOrdersDstAmount, hintArray, {from: maker1})

//             //failing update batch orders
//             try {
//                 rc = await reserve.updateOrderBatch(badIsBuyOrder, ordersArray, makeOrdersSrcAmounts,
//                             makeOrdersDstAmount, hintArray, {from: maker1})
//                 assert(false, "throw was expected in line above.")
//             } catch(e) {
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//             }

//             try {
//                 rc = await reserve.updateOrderBatch(isBuyOrder, badOrdersArray, makeOrdersSrcAmounts,
//                             makeOrdersDstAmount, hintArray, {from: maker1})
//                 assert(false, "throw was expected in line above.")
//             } catch(e) {
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//             }

//             try {
//                 rc = await reserve.updateOrderBatch(isBuyOrder, ordersArray, badSrcAmounts,
//                                 makeOrdersDstAmount, hintArray, {from: maker1})
//                 assert(false, "throw was expected in line above.")
//             } catch(e) {
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//             }

//             try {
//                 rc = await reserve.updateOrderBatch(isBuyOrder, ordersArray, makeOrdersSrcAmounts,
//                                 badDstAmounts, hintArray, {from: maker1})
//                 assert(false, "throw was expected in line above.")
//             } catch(e) {
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//             }

//             try {
//                 rc = await reserve.updateOrderBatch(isBuyOrder, ordersArray, makeOrdersSrcAmounts,
//                             makeOrdersDstAmount, badHintArr, {from: maker1})
//                 assert(false, "throw was expected in line above.")
//             } catch(e) {
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//             }
//         })

//         it("verify trade not from network reverts", async() => {
//             let tokenWeiDepositAmount = token18Dec.mul(new BN(90));
//             let kncTweiDepositAmount = PRECISION.mul(new BN(600));
//             let ethWeiDepositAmount = PRECISION.mul(new BN(10));
//             await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

//             let valueWei = PRECISION.mul(new BN(5));
//             let valueTwei = token18Dec.mul(new BN(15));

//             //add order
//             await reserve.submitTokenToEthOrder(valueTwei, valueWei, {from: maker1});

//             // legal trade - from network
//             let payValueWei = 3000;
//             let rate = await reserve.getConversionRate(ethAddress, tokenAdd, payValueWei, 0);
//             await reserve.trade(ethAddress, payValueWei, tokenAdd, user1, rate, false, {from:network, value: payValueWei});

//             rate = await reserve.getConversionRate(ethAddress, tokenAdd, payValueWei, 0);

//             try {
//                 await reserve.trade(ethAddress, payValueWei, tokenAdd, user1, rate, false, {from:maker3, value: payValueWei});
//                 assert(false, "throw was expected in line above.")
//             } catch(e) {
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//             }
//         });

//         it("verify trade with src Amount >= max qty reverts.", async() => {
//             let tokenWeiDepositAmount = token18Dec.mul(new BN(0));
//             let kncTweiDepositAmount = PRECISION.mul(new BN(600));
//             let ethWeiDepositAmount = PRECISION.mul(new BN(7));
//             await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

//             let valueWei = PRECISION.mul(new BN(2));
//             let valueTwei = MAX_QTY.sub(new BN(1));

//             //add order
//             await reserve.submitEthToTokenOrder(valueWei, valueTwei, {from: maker1});
//             await reserve.submitEthToTokenOrder(valueWei, valueTwei, {from: maker1});
//             await reserve.submitEthToTokenOrder(valueWei, valueTwei, {from: maker1});

//             // legal trade - below max Qty
//             let payValueTwei = MAX_QTY;
//             await token.transfer(network, payValueTwei);
//             await token.approve(reserve.address, payValueTwei, {from: network})
//             let rate = await reserve.getConversionRate(tokenAdd, ethAddress, payValueTwei, 0);
//             await reserve.trade(tokenAdd, payValueTwei, ethAddress, user1, rate, false, {from:network});

//             payValueTwei = payValueTwei.add(new BN(1));
//             await token.transfer(network, payValueTwei);
//             await token.approve(reserve.address, payValueTwei, {from: network})

//             try {
//                 await reserve.trade(tokenAdd, payValueTwei, ethAddress, user1, rate, false, {from:network});
//                 assert(false, "throw was expected in line above.")
//             } catch(e) {
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//             }
//         });

//         it("verify get rate with src Amount >= max qty reverts.", async() => {
//             let tokenWeiDepositAmount = token18Dec.mul(new BN(0));
//             let kncTweiDepositAmount = PRECISION.mul(new BN(600));
//             let ethWeiDepositAmount = PRECISION.mul(new BN(7));
//             await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

//             let valueWei = PRECISION.mul(new BN(2));
//             let valueTwei = MAX_QTY.sub(new BN(1));

//             //add order
//             await reserve.submitEthToTokenOrder(valueWei, valueTwei, {from: maker1});
//             await reserve.submitEthToTokenOrder(valueWei, valueTwei, {from: maker1});
//             await reserve.submitEthToTokenOrder(valueWei, valueTwei, {from: maker1});

//             // legal trade - below max Qty
//             let payValueTwei = MAX_QTY;
//             let rate = await reserve.getConversionRate(tokenAdd, ethAddress, payValueTwei, 0);

//             payValueTwei = payValueTwei.add(new BN(1));

//             try {
//                 await reserve.getConversionRate(tokenAdd, ethAddress, payValueTwei, 0);
//                 assert(false, "throw was expected in line above.")
//             } catch(e) {
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//             }
//         });

//         it("verify trade with not enough tokens for taker src amount, reverts.", async() => {
//             let tokenWeiDepositAmount = token18Dec.mul(new BN(0));
//             let kncTweiDepositAmount = PRECISION.mul(new BN(600));
//             let ethWeiDepositAmount = PRECISION.mul(new BN(7));
//             await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

//             let valueWei = PRECISION.mul(new BN(2));
//             let valueTwei = token18Dec.mul(new BN(9));

//             //add order
//             await reserve.submitEthToTokenOrder(valueWei, valueTwei, {from: maker1});

//             let payValueTwei = valueTwei.add(new BN(1));
//             await token.transfer(network, payValueTwei);
//             await token.approve(reserve.address, payValueTwei, {from: network})
//             let rate = await reserve.getConversionRate(tokenAdd, ethAddress, payValueTwei, 0);

//             try {
//                 await reserve.trade(tokenAdd, payValueTwei, ethAddress, user1, rate, false, {from:network});
//                 assert(false, "throw was expected in line above.")
//             } catch(e) {
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//             }
//         });
//     });

//     describe ("deposit funds, bind funds, withdraw funds", function() {
//         it("maker deposit tokens, ethers, knc, validate updated in contract", async () => {
//             let tokenWeiDepositAmount = token18Dec.mul(new BN(50));
//             let kncTweiDepositAmount = PRECISION.mul(new BN(600));
//             let ethWeiDepositAmount = PRECISION.mul(new BN(2));

//             await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

//             let rxNumTwei = await reserve.makerFunds(maker1, tokenAdd);
//             Helper.assertEqual(rxNumTwei, tokenWeiDepositAmount);

//             let rxKncTwei = await reserve.makerUnlockedKnc(maker1);
//             Helper.assertEqual(rxKncTwei, kncTweiDepositAmount);

//             rxKncTwei = await reserve.makerRequiredKncStake(maker1);
//             Helper.assertEqual(rxKncTwei, 0);

//             //makerDepositEther
//             let rxWei = await reserve.makerFunds(maker1, ethAddress);
//             Helper.assertEqual(rxWei, ethWeiDepositAmount);

//             await reserve.withdrawEther( rxWei, {from: maker1})
//             rxWei = await reserve.makerFunds(maker1, ethAddress);
//             Helper.assertEqual(rxWei, 0);
//         });

//         it("maker deposit tokens, ethers, knc, withdraw and see sums updated", async () => {
//             let tokenWeiDepositAmount = token18Dec.mul(new BN(50));
//             let kncTweiDepositAmount = PRECISION.mul(new BN(60));
//             let ethWeiDepositAmount = PRECISION.mul(new BN(2));

//             await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

//             let rxNumTwei = await reserve.makerFunds(maker1, tokenAdd);
//             Helper.assertEqual(rxNumTwei, tokenWeiDepositAmount);

//             let rxKncTwei = await reserve.makerUnlockedKnc(maker1);
//             Helper.assertEqual(rxKncTwei, kncTweiDepositAmount);

//             rxKncTwei = await reserve.makerRequiredKncStake(maker1);
//             Helper.assertEqual(rxKncTwei, 0);

//             let rxWei = await reserve.makerFunds(maker1, ethAddress);
//             Helper.assertEqual(rxWei, ethWeiDepositAmount);

//             //withdrawEth
//             await reserve.withdrawEther( rxWei, {from: maker1})
//             rxWei = await reserve.makerFunds(maker1, ethAddress);
//             Helper.assertEqual(rxWei, 0);

//             //withdraw token
//             await reserve.withdrawToken(tokenWeiDepositAmount.div(new BN(2)), {from: maker1})
//             rxTwei = await reserve.makerFunds(maker1, tokenAdd);
//             Helper.assertEqual(rxTwei, (tokenWeiDepositAmount.div(new BN(2))));

//             //withdraw knc
//             await reserve.withdrawKncFee(kncTweiDepositAmount.div(new BN(2)), {from: maker1})
//             rxKncTwei = await reserve.makerUnlockedKnc(maker1);
//             Helper.assertEqual(rxKncTwei, (kncTweiDepositAmount.div(new BN(2))));
//         });

//         it("test deposit token reverts when maker address 0", async()=> {
//             let tokenTweiDepositAmount = token18Dec.mul(new BN(2));

//             await token.approve(reserve.address, tokenTweiDepositAmount);
//             try {
//                 await reserve.depositToken(zeroAddress, tokenTweiDepositAmount);
//                 assert(false, "throw was expected in line above.")
//             } catch(e){
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//             }
//         })

//         it("test deposit token reverts when approve amount < deposit token call amount", async()=> {
//             let tokenTweiDepositAmount = token18Dec.mul(new BN(2));

//             await token.approve(reserve.address, tokenTweiDepositAmount.sub(new BN(1)));
//             try {
//                 await reserve.depositToken(maker1, tokenTweiDepositAmount);
//                 assert(false, "throw was expected in line above.")
//             } catch(e){
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//             }
//         })

//         it("test deposit token reverts when amount >= maxQty", async()=> {
//             let tokenTweiDepositAmount = new BN(MAX_QTY);

//             await token.approve(reserve.address, tokenTweiDepositAmount);
//             try {
//                 await reserve.depositToken(maker1, tokenTweiDepositAmount);
//                 assert(false, "throw was expected in line above.")
//             } catch(e){
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//             }
//             await reserve.depositToken(maker1, tokenTweiDepositAmount.sub(new BN(1)));
//         })

//         it("test deposit ether reverts for maker address 0", async()=> {
//             try {
//                 await reserve.depositEther(zeroAddress, {value: 1000});
//                 assert(false, "throw was expected in line above.")
//             } catch(e){
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//             }
//             await reserve.depositEther(maker1, {value: 1000});
//         })

//         it("test deposit knc reverts when maker address 0", async()=> {
//             let tokenTweiDepositAmount = token18Dec.mul(new BN(2));

//             await KNCToken.approve(reserve.address, tokenTweiDepositAmount);
//             try {
//                 await reserve.depositKncForFee(zeroAddress, tokenTweiDepositAmount);
//                 assert(false, "throw was expected in line above.")
//             } catch(e){
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//             }
//         })

//         it("test deposit knc reverts when approve amount < deposit token call amount", async()=> {
//             let tokenTweiDepositAmount = token18Dec.mul(new BN(2));

//             await KNCToken.approve(reserve.address, tokenTweiDepositAmount.sub(new BN(1)));
//             try {
//                 await reserve.depositKncForFee(maker1, tokenTweiDepositAmount);
//                 assert(false, "throw was expected in line above.")
//             } catch(e){
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//             }
//             await reserve.depositKncForFee(maker1, tokenTweiDepositAmount.sub(new BN(1)));
//         })

//         it("test deposit knc reverts when amount >= maxQty", async()=> {
//             let tokenTweiDepositAmount = MAX_QTY;

//             await KNCToken.approve(reserve.address, tokenTweiDepositAmount);
//             try {
//                 await reserve.depositKncForFee(maker1, tokenTweiDepositAmount);
//                 assert(false, "throw was expected in line above.")
//             } catch(e){
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//             }
//             await reserve.depositKncForFee(maker1, tokenTweiDepositAmount.sub(new BN(1)));
//         })

//         it("test withdraw token reverts when amount above free amount", async() => {
//             let tokenTweiDepositAmount = token18Dec.mul(new BN(20));
//             await token.approve(reserve.address, tokenTweiDepositAmount);
//             await reserve.depositToken(maker1, tokenTweiDepositAmount);

//             try {
//                 await reserve.withdrawToken(tokenTweiDepositAmount.add(new BN(1)), {from: maker1});
//                 assert(false, "throw was expected in line above.")
//             } catch(e){
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//             }
//             await reserve.withdrawToken(tokenTweiDepositAmount, {from: maker1});
//         })

//         it("test withdraw ether reverts when amount above free amount", async() => {
//             let weiDepositAmount = PRECISION.mul(new BN(2));

//             await reserve.depositEther(maker1, {value: weiDepositAmount});

//             try {
//                 await reserve.withdrawEther(weiDepositAmount.add(new BN(1)), {from: maker1});
//                 assert(false, "throw was expected in line above.")
//             } catch(e){
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//             }
//             await reserve.withdrawEther(weiDepositAmount, {from: maker1});
//         })

//         it("test withdraw token reverts if token transfer doesn't return true =~ fails", async() => {
//             let failingTok = await TestTokenTransferFailing.new("no transfer", "NTNC", 11);
//             let aReserve = await OrderbookReserve.new(kncAddress, failingTok.address, feeBurner.address, network,
//                         medianizer.address, ordersFactory.address, minOrderSizeDollar, maxOrdersPerTrade, makerBurnFeeBps);
//             await aReserve.init();

//             let tokenTweiDepositAmount = token18Dec.mul(new BN(20));
//             await failingTok.approve(aReserve.address, tokenTweiDepositAmount);
//             await aReserve.depositToken(maker1, tokenTweiDepositAmount);

//             try {
//                 await aReserve.withdrawToken(tokenTweiDepositAmount, {from: maker1});
//                 assert(false, "throw was expected in line above.")
//             } catch(e){
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//             }
//         })

//         it("test withdraw KNC reverts when amount above total maker knc amount", async() => {
//             let tokenTweiDepositAmount = token18Dec.mul(new BN(20));
//             await KNCToken.approve(reserve.address, tokenTweiDepositAmount);
//             await reserve.depositKncForFee(maker1, tokenTweiDepositAmount);

//             try {
//                 await reserve.withdrawKncFee(tokenTweiDepositAmount.add(new BN(1)), {from: maker1});
//                 assert(false, "throw was expected in line above.")
//             } catch(e){
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//             }
//             await reserve.withdrawKncFee(tokenTweiDepositAmount, {from: maker1});
//         })

//         it("test withdraw KNC reverts when amount above maker unlocked knc amount", async() => {
//             let tokenTweiDepositAmount = token18Dec.mul(new BN(20));
//             await KNCToken.approve(reserve.address, tokenTweiDepositAmount);
//             await reserve.depositKncForFee(maker1, tokenTweiDepositAmount);

//             let orderWei = PRECISION.mul(new BN(2));
//             let orderTwei = token18Dec.mul(new BN(1));

//             await reserve.depositEther(maker1, {value: orderWei});

//             await reserve.submitEthToTokenOrder(orderWei, orderTwei, {from: maker1});

//             let unlockedKnc = await reserve.makerUnlockedKnc(maker1);

//             try {
//                 await reserve.withdrawKncFee(unlockedKnc.add(new BN(1)), {from: maker1});
//                 assert(false, "throw was expected in line above.")
//             } catch(e){
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//             }
//             await reserve.withdrawKncFee(unlockedKnc, {from: maker1});
//         })

//         it("test withdraw KNC reverts if knc transfer doesn't return true =~ fails", async() => {
//             let failingKnc = await TestTokenTransferFailing.new("KNC no transfer", "NTNC", 11);
//             let aReserve = await OrderbookReserve.new(failingKnc.address, tokenAdd, feeBurner.address, network, medianizer.address, ordersFactory.address,  minOrderSizeDollar, maxOrdersPerTrade, makerBurnFeeBps);
//             await aReserve.init();

//             let tokenTweiDepositAmount = token18Dec.mul(new BN(20));
//             await failingKnc.approve(aReserve.address, tokenTweiDepositAmount);
//             await aReserve.depositKncForFee(maker1, tokenTweiDepositAmount);

//             try {
//                 await aReserve.withdrawKncFee(tokenTweiDepositAmount, {from: maker1});
//                 assert(false, "throw was expected in line above.")
//             } catch(e){
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//             }
//         })

//         it("perform few knc deposits from same maker. later knc deposit from other maker. see sums correct.", async () => {
//             let tokenWeiDepositAmount = new BN(500);
//             let kncTweiDepositAmount = PRECISION.mul(new BN(10));
//             let ethWeiDepositAmount = new BN(300);
//             await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);
//             await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);
//             await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);
//             await makerDeposit(maker2, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);
//             await makerDeposit(maker2, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

//             //maker1 balances
//             let rxNumTwei = await reserve.makerFunds(maker1, tokenAdd);
//             Helper.assertEqual(rxNumTwei, tokenWeiDepositAmount.mul(new BN(3)));

//             let rxKncTwei = await reserve.makerUnlockedKnc(maker1);
//             Helper.assertEqual(rxKncTwei, kncTweiDepositAmount.mul(new BN(3)));

//             let rxWei = await reserve.makerFunds(maker1, ethAddress);
//             Helper.assertEqual(rxWei, ethWeiDepositAmount.mul(new BN(3)));

//             //maker2 balances
//             rxNumTwei = await reserve.makerFunds(maker2, tokenAdd);
//             Helper.assertEqual(rxNumTwei, tokenWeiDepositAmount.mul(new BN(2)));

//             rxKncTwei = await reserve.makerUnlockedKnc(maker2);
//             Helper.assertEqual(rxKncTwei, kncTweiDepositAmount.mul(new BN(2)));

//             rxWei = await reserve.makerFunds(maker2, ethAddress);
//             Helper.assertEqual(rxWei, ethWeiDepositAmount.mul(new BN(2)));
//         });

//         it("perform few knc deposits from same maker. later knc deposit from other maker. see allocated order IDs correct.", async () => {
//             let tokenWeiDepositAmount = new BN(500);
//             let kncTweiDepositAmount = PRECISION.mul(new BN(300));
//             let ethWeiDepositAmount = PRECISION;

//             await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);
//             await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);
//             await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);
//             await makerDeposit(maker2, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);
//             await makerDeposit(maker2, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

//             let srcAmountWei = PRECISION.mul(new BN(2));
//             let orderDstTwei = token18Dec.mul(new BN(9));

//             //add order from maker1
//             let rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
//             let orderId = rc.logs[0].args.orderId;
//             Helper.assertEqual(orderId, firstFreeOrderIdPerReserveList);

//             //add order from maker2
//             rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker2});
//             orderId = rc.logs[0].args.orderId;
//             Helper.assertEqual(orderId, (firstFreeOrderIdPerReserveList  * 1 + 1 * numOrderIdsPerMaker));
//         });

//         it("maker deposit knc, test bind knc.", async () => {
//             let kncTweiDepositAmount = PRECISION.mul(new BN(2));

//             let mockReserve = await MockOrderbookReserve.new(kncAddress, tokenAdd, feeBurner.address, network, medianizer.address, ordersFactory.address,  minOrderSizeDollar, maxOrdersPerTrade, makerBurnFeeBps);
//             await mockReserve.init();

//             await makerDepositFull(maker1, mockReserve, token, 0, 0, kncTweiDepositAmount);
//             let stakedKnc = await mockReserve.makerRequiredKncStake(maker1);
//             Helper.assertEqual(stakedKnc, 0);

//             let freeKnc = await mockReserve.makerUnlockedKnc(maker1);
//             Helper.assertEqual(freeKnc, kncTweiDepositAmount);

//             let weiValueForStakeCalc = new BN(String(10 ** 16));
//             let expectedStake = await mockReserve.calcKncStake(weiValueForStakeCalc);
//             Helper.assertLesser(expectedStake, kncTweiDepositAmount, "expected Stake: " + expectedStake +
//                 " !< " + kncTweiDepositAmount);

//             await mockReserve.testBindStakes(maker1, weiValueForStakeCalc);

//             stakedKnc = await mockReserve.makerRequiredKncStake(maker1);
//             Helper.assertEqual(stakedKnc, expectedStake);

//             freeKnc = await mockReserve.makerUnlockedKnc(maker1);
//             Helper.assertEqual(freeKnc, kncTweiDepositAmount.sub(expectedStake));

//             let weiValueForStakeCalc2nd = new BN(String(10 ** 15));
//             await mockReserve.testBindStakes(maker1, weiValueForStakeCalc2nd);
//             let expectedStake2nd = await mockReserve.calcKncStake(weiValueForStakeCalc2nd);
//             expectedStake = expectedStake.add(expectedStake2nd);

//             stakedKnc = await mockReserve.makerRequiredKncStake(maker1);
//             Helper.assertEqual(stakedKnc, expectedStake);

//             freeKnc = await mockReserve.makerUnlockedKnc(maker1);
//             Helper.assertEqual(freeKnc, kncTweiDepositAmount.sub(expectedStake));
//         });

//         it("maker deposit knc, bind knc. test release knc stakes", async () => {
//              let kncTweiDepositAmount = PRECISION.mul(new BN(2));

//             let mockReserve = await MockOrderbookReserve.new(kncAddress, tokenAdd, feeBurner.address, network, medianizer.address, ordersFactory.address,  minOrderSizeDollar, maxOrdersPerTrade, makerBurnFeeBps);
//             await mockReserve.init();

//             await makerDepositFull(maker1, mockReserve, token, 0, 0, kncTweiDepositAmount);
//             let weiValueForStakeCalc = new BN(String(10 ** 17));
//             await mockReserve.testBindStakes(maker1, weiValueForStakeCalc);

//             let initialStakedKnc = await mockReserve.makerRequiredKncStake(maker1);
//             let freeKnc = await mockReserve.makerUnlockedKnc(maker1);

//             // now release
//             let releaseAmountWei = new BN(String(10 ** 17));
//             await mockReserve.testHandleStakes(maker1, releaseAmountWei, 0);
//             let expectedKncRelease = await mockReserve.calcKncStake(releaseAmountWei);

//             let stakedKnc = await mockReserve.makerRequiredKncStake(maker1);
//             Helper.assertEqual(stakedKnc, initialStakedKnc.sub(expectedKncRelease));

//             let expectedFreeKnc = freeKnc.add(expectedKncRelease);
//             freeKnc = await mockReserve.makerUnlockedKnc(maker1);
//             Helper.assertEqual(freeKnc, expectedFreeKnc);
//         });

//         it("test release order stakes(using bind stakes). doesn't underflow if released wei amount is higher the total orders wei", async () => {
//              let kncTweiDepositAmount = PRECISION.mul(new BN(2));

//             let mockReserve = await MockOrderbookReserve.new(kncAddress, tokenAdd, feeBurner.address, network, medianizer.address, ordersFactory.address,  minOrderSizeDollar, maxOrdersPerTrade, makerBurnFeeBps);
//             await mockReserve.init();

//             await makerDepositFull(maker1, mockReserve, token, 0, 0, kncTweiDepositAmount);

//             let weiValueToBindStake = new BN(String(10 ** 17));
//             await mockReserve.testBindStakes(maker1, weiValueToBindStake);
//             let stakedWei = await mockReserve.makerTotalOrdersWei(maker1);

//             Helper.assertEqual(stakedWei, weiValueToBindStake);

//             // release more wei.
//             let weiToRelease = weiValueToBindStake.sub(weiValueToBindStake.mul(new BN(2)).add(new BN(5000)));
//             await mockReserve.testBindStakes(maker1, weiToRelease);

//             stakedWei = await mockReserve.makerTotalOrdersWei(maker1);
//             Helper.assertEqual(stakedWei, 0);
//         });

//         it("test release order stakes(using release stakes). doesn't underflow if released wei amount is higher the total orders wei", async () => {
//              let kncTweiDepositAmount = PRECISION.mul(new BN(2));

//             let mockReserve = await MockOrderbookReserve.new(kncAddress, tokenAdd, feeBurner.address, network, medianizer.address, ordersFactory.address,  minOrderSizeDollar, maxOrdersPerTrade, makerBurnFeeBps);
//             await mockReserve.init();

//             await makerDepositFull(maker1, mockReserve, token, 0, 0, kncTweiDepositAmount);

//             let weiValueToBindStake = new BN(String(10 ** 17));
//             await mockReserve.testBindStakes(maker1, weiValueToBindStake);
//             let stakedWei = await mockReserve.makerTotalOrdersWei(maker1);
//             Helper.assertEqual(stakedWei, weiValueToBindStake);

//             // release more wei.
//             let weiToRelease = weiValueToBindStake.sub(weiValueToBindStake.mul(new BN(2)).add(new BN(5000)));
//             await mockReserve.testHandleStakes(maker1, weiToRelease, 0);

//             stakedWei = await mockReserve.makerTotalOrdersWei(maker1);
//             Helper.assertEqual(stakedWei, 0);
//         });

//         it("test release order stakes, if weiForBurn > weiToRelease, reverts", async () => {
//             let kncTweiDepositAmount = PRECISION.mul(new BN(2));

//             let mockReserve = await MockOrderbookReserve.new(kncAddress, tokenAdd, feeBurner.address, network, medianizer.address, ordersFactory.address,  minOrderSizeDollar, maxOrdersPerTrade, makerBurnFeeBps);
//             await mockReserve.init();

//             await makerDepositFull(maker1, mockReserve, token, 0, 0, kncTweiDepositAmount);

//             let weiValueToBindStake = new BN(String(10 ** 17));
//             await mockReserve.testBindStakes(maker1, weiValueToBindStake);
//             let stakedWei = await mockReserve.makerTotalOrdersWei(maker1);
//             Helper.assertEqual(stakedWei, weiValueToBindStake);

//             // release more wei.
//             let weiToRelease = 100;
//             let weiToBurn = 101;

//             try {
//                 await mockReserve.testHandleStakes(maker1, weiToRelease, weiToBurn);
//                 assert(false, "throw was expected in line above.")
//             } catch(e) {
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//             }
//         });

//         it("change knc rate so stake amount < burn amount, see unlocked knc return 0 - no underflow", async() => {
//             let kncTweiDepositAmount = PRECISION.mul(new BN(30));

//             let mockReserve = await MockOrderbookReserve.new(kncAddress, tokenAdd, feeBurner.address, network, medianizer.address, ordersFactory.address,  minOrderSizeDollar, maxOrdersPerTrade, makerBurnFeeBps);
//             await mockReserve.init();

//             await makerDepositFull(maker1, mockReserve, token, 0, new BN(10).pow(new BN(19)), kncTweiDepositAmount);

//             let orderSrcAmountTwei = token18Dec.mul(new BN(6));
//             let orderDstWei = new BN(minNewOrderWei);

//             //add orders
//             let rc = await mockReserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei, {from: maker1});
//             let rate = await mockReserve.getConversionRate(ethAddress, tokenAdd, new BN(10).pow(new BN(8)), 522);
//             Helper.assertGreater(rate, 0);

//             let freeKnc1 = await mockReserve.makerUnlockedKnc(maker1);
//             await mockReserve.withdrawKncFee(freeKnc1, {from: maker1});

//             let kncPerEthRate = await mockReserve.kncPerEthBaseRatePrecision();

//             await mockReserve.setBaseKncPerEthRate(kncPerEthRate.mul(new BN(2)));
//             let requiredStake = await mockReserve.makerRequiredKncStake(maker1);
//             let makerKnc = await mockReserve.makerKnc(maker1);
// //            assert(requiredStake > makerKnc, "makerKnc " + makerKnc + " require stake " + requiredStake)

//             let freeKnc = await mockReserve.makerUnlockedKnc(maker1);
//             Helper.assertEqual(freeKnc, 0);
//         });

//         it("maker add buy token order. see funds updated.", async () => {
//             let ethWeiDepositAmount = PRECISION.mul(new BN(2)).add(new BN(200));
//             let kncTweiDepositAmount = PRECISION.mul(new BN(600));

//             await makerDeposit(maker1, ethWeiDepositAmount, 0, kncTweiDepositAmount);

//             let srcAmountWei = PRECISION.mul(new BN(2));
//             let orderDstTwei = token18Dec.mul(new BN(9));

//             //check maker free token funds
//             let rxFreeWei = await reserve.makerFunds(maker1, ethAddress);
//             Helper.assertEqual(rxFreeWei, ethWeiDepositAmount );

//             //add order
//             let rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
//             let expectedFreeWei = ethWeiDepositAmount.sub(srcAmountWei);

//             rxFreeWei = await reserve.makerFunds(maker1, ethAddress);
//             Helper.assertEqual(rxFreeWei, expectedFreeWei );
//         });
//     });

//     describe("add and remove orders", function() {
//         it("test getMakerOrders eth to token", async() => {
//             let ethWeiDepositAmount = PRECISION.mul(new BN(20));
//             let kncTweiDepositAmount = PRECISION.mul(new BN(600));
//             await makerDeposit(maker1, ethWeiDepositAmount, 0, kncTweiDepositAmount);

//             let srcAmountWei = PRECISION.mul(new BN(2));
//             let orderDstTwei = token18Dec.mul(new BN(9));

//             //add order
//             let rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
//             let order1Id = rc.logs[0].args.orderId;

//             let orderList = await reserve.getEthToTokenMakerOrderIds(maker1);
//             Helper.assertEqual(orderList[0], order1Id);

//             //add order
//             rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
//             let order2Id = rc.logs[0].args.orderId;
//             rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
//             let order3Id = rc.logs[0].args.orderId;
//             rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
//             let order4Id = rc.logs[0].args.orderId;

//             orderList = await reserve.getEthToTokenMakerOrderIds(maker1);
//             Helper.assertEqual(orderList[0], order1Id);
//             Helper.assertEqual(orderList[1], order2Id);
//             Helper.assertEqual(orderList[2], order3Id);
//             Helper.assertEqual(orderList[3], order4Id);

//             await reserve.cancelEthToTokenOrder(orderList[2], {from: maker1});

//             orderList = await reserve.getEthToTokenMakerOrderIds(maker1);
//             Helper.assertEqual(orderList[0], order1Id);
//             Helper.assertEqual(orderList[1], order2Id);
//             Helper.assertEqual(orderList[2], order4Id);

//             rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
//             order3Id = rc.logs[0].args.orderId;

//             orderList = await reserve.getEthToTokenMakerOrderIds(maker1);
//             Helper.assertEqual(orderList[0], order1Id);
//             Helper.assertEqual(orderList[1], order2Id);
//             Helper.assertEqual(orderList[2], order3Id);
//             Helper.assertEqual(orderList[3], order4Id);
//         });

//         it("test getMakerOrders eth to token with two makers", async() => {
//             let ethWeiDepositAmount = PRECISION.mul(new BN(20));
//             let kncTweiDepositAmount = PRECISION.mul(new BN(600));
//             await makerDeposit(maker1, ethWeiDepositAmount, 0, kncTweiDepositAmount);
//             await makerDeposit(maker2, ethWeiDepositAmount, 0, kncTweiDepositAmount);

//             let srcAmountWei = PRECISION.mul(new BN(2));
//             let orderDstTwei = token18Dec.mul(new BN(9));

//             //add orders maker1
//             let rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
//             let maker1order1Id = rc.logs[0].args.orderId;
//             rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
//             let maker1order2Id = rc.logs[0].args.orderId;
//             rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
//             let maker1order3Id = rc.logs[0].args.orderId;
//             rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
//             let maker1order4Id = rc.logs[0].args.orderId;

//             //query orders maker1
//             orderList = await reserve.getEthToTokenMakerOrderIds(maker1);
//             Helper.assertEqual(orderList[0], maker1order1Id);
//             Helper.assertEqual(orderList[1], maker1order2Id);
//             Helper.assertEqual(orderList[2], maker1order3Id);
//             Helper.assertEqual(orderList[3], maker1order4Id);

//             //add orders maker2
//             rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker2});
//             let maker2order1Id = rc.logs[0].args.orderId;
//             rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker2});
//             let maker2order2Id = rc.logs[0].args.orderId;
//             rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker2});
//             let maker2order3Id = rc.logs[0].args.orderId;

//             //query maker2
//             orderList = await reserve.getEthToTokenMakerOrderIds(maker2);
//             Helper.assertEqual(orderList[0], maker2order1Id);
//             Helper.assertEqual(orderList[1], maker2order2Id);
//             Helper.assertEqual(orderList[2], maker2order3Id);

//             // cancler orders maker 1
//             await reserve.cancelEthToTokenOrder(maker1order3Id, {from: maker1});
//             await reserve.cancelEthToTokenOrder(maker1order1Id, {from: maker1});

//             //query maker1 again
//             orderList = await reserve.getEthToTokenMakerOrderIds(maker1);
//             Helper.assertEqual(orderList[0], maker1order2Id);
//             Helper.assertEqual(orderList[1], maker1order4Id);

//             // Cancel for maker2 and query
//             await reserve.cancelEthToTokenOrder(maker2order2Id, {from: maker2});
//             orderList = await reserve.getEthToTokenMakerOrderIds(maker2);
//             Helper.assertEqual(orderList[0], maker2order1Id);
//             Helper.assertEqual(orderList[1], maker2order3Id);

//             //submer for maker1 and query
//             rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
//             maker1order1Id = rc.logs[0].args.orderId;

//             orderList = await reserve.getEthToTokenMakerOrderIds(maker1);
//             Helper.assertEqual(orderList[0], maker1order1Id);
//             Helper.assertEqual(orderList[1], maker1order2Id);
//             Helper.assertEqual(orderList[2], maker1order4Id);
//         });

//         it("test getMakerOrders token to eth with two makers", async() => {
//             let tokenWeiDepositAmount = token18Dec.mul(new BN(80));
//             let kncTweiDepositAmount = PRECISION.mul(new BN(600));
//             await makerDeposit(maker1, 0, tokenWeiDepositAmount, kncTweiDepositAmount);
//             await makerDeposit(maker2, 0, tokenWeiDepositAmount, kncTweiDepositAmount);

//             let srcTwei = token18Dec.mul(new BN(2));
//             let dstWei = PRECISION.mul(new BN(9));

//             //add orders maker1
//             let rc = await reserve.submitTokenToEthOrder(srcTwei, dstWei, {from: maker1});
//             let maker1order1Id = rc.logs[0].args.orderId;
//             rc = await reserve.submitTokenToEthOrder(srcTwei, dstWei, {from: maker1});
//             let maker1order2Id = rc.logs[0].args.orderId;
//             rc = await reserve.submitTokenToEthOrder(srcTwei, dstWei, {from: maker1});
//             let maker1order3Id = rc.logs[0].args.orderId;
//             rc = await reserve.submitTokenToEthOrder(srcTwei, dstWei, {from: maker1});
//             let maker1order4Id = rc.logs[0].args.orderId;

//             //query orders maker1
//             orderList = await reserve.getTokenToEthMakerOrderIds(maker1);
//             Helper.assertEqual(orderList[0], maker1order1Id);
//             Helper.assertEqual(orderList[1], maker1order2Id);
//             Helper.assertEqual(orderList[2], maker1order3Id);
//             Helper.assertEqual(orderList[3], maker1order4Id);

//             //add orders maker2
//             rc = await reserve.submitTokenToEthOrder(srcTwei, dstWei, {from: maker2});
//             let maker2order1Id = rc.logs[0].args.orderId;
//             rc = await reserve.submitTokenToEthOrder(srcTwei, dstWei, {from: maker2});
//             let maker2order2Id = rc.logs[0].args.orderId;
//             rc = await reserve.submitTokenToEthOrder(srcTwei, dstWei, {from: maker2});
//             let maker2order3Id = rc.logs[0].args.orderId;

//             //query maker2
//             orderList = await reserve.getTokenToEthMakerOrderIds(maker2);
//             Helper.assertEqual(orderList[0], maker2order1Id);
//             Helper.assertEqual(orderList[1], maker2order2Id);
//             Helper.assertEqual(orderList[2], maker2order3Id);

//             // cancler orders maker 1
//             await reserve.cancelTokenToEthOrder(maker1order3Id, {from: maker1});
//             await reserve.cancelTokenToEthOrder(maker1order1Id, {from: maker1});

//             //query maker1 again
//             orderList = await reserve.getTokenToEthMakerOrderIds(maker1);
//             Helper.assertEqual(orderList[0], maker1order2Id);
//             Helper.assertEqual(orderList[1], maker1order4Id);

//             // Cancel for maker2 and query
//             await reserve.cancelTokenToEthOrder(maker2order2Id, {from: maker2});
//             orderList = await reserve.getTokenToEthMakerOrderIds(maker2);
//             Helper.assertEqual(orderList[0], maker2order1Id);
//             Helper.assertEqual(orderList[1], maker2order3Id);

//             //submer for maker1 and query
//             rc = await reserve.submitTokenToEthOrder(srcTwei, dstWei, {from: maker1});
//             maker1order1Id = rc.logs[0].args.orderId;

//             orderList = await reserve.getTokenToEthMakerOrderIds(maker1);
//             Helper.assertEqual(orderList[0], maker1order1Id);
//             Helper.assertEqual(orderList[1], maker1order2Id);
//             Helper.assertEqual(orderList[2], maker1order4Id);
//         });

//         it("maker add buy token order. see rate updated. verify order details.", async () => {
//             let ethWeiDepositAmount = PRECISION.mul(new BN(20));
//             let kncTweiDepositAmount = PRECISION.mul(new BN(600));
//             await makerDeposit(maker1, ethWeiDepositAmount, 0, kncTweiDepositAmount);

//             let srcAmountWei = PRECISION.mul(new BN(2));
//             let orderDstTwei = token18Dec.mul(new BN(9));

//             // first getConversionRate should return 0
//             let rate = await reserve.getConversionRate(tokenAdd, ethAddress, token18Dec, 0);
//             Helper.assertEqual(rate, 0);

//             //add order
//             let rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
//             let orderId = rc.logs[0].args.orderId;

//             let orderDetails = await reserve.getEthToTokenOrder(rc.logs[0].args.orderId);

//             Helper.assertEqual(orderDetails[0], maker1);
//             Helper.assertEqual(orderDetails[1], srcAmountWei);
//             Helper.assertEqual(orderDetails[2], orderDstTwei);
//             Helper.assertEqual(orderDetails[3], headId); // prev should be buy head id - since first
//             Helper.assertEqual(orderDetails[4], tailId); // next should be tail ID - since last

//             rate = await reserve.getConversionRate(token.address, ethAddress, token18Dec, 0);
//             let expectedRate = token18Dec.mul(srcAmountWei).div(orderDstTwei);
//             Helper.assertEqual(rate, expectedRate);
//         });

//         it("maker add eth to token order. rate > MAX_RATE, see revert for add and update.", async () => {
//             let ethWeiDepositAmount = PRECISION.mul(new BN(20));
//             let kncTweiDepositAmount = PRECISION.mul(new BN(600));
//             await makerDeposit(maker1, ethWeiDepositAmount, 0, kncTweiDepositAmount);

//             srcAmountWei = PRECISION.mul(new BN(2));
//             orderDstTwei = new BN(String(2 * 10 ** 12));

//             orderRate = Helper.calcRateFromQty(orderDstTwei, srcAmountWei, 18, 18);
//             Helper.assertEqual(orderRate, MAX_RATE);

//             let rate = await reserve.getConversionRate(tokenAdd, ethAddress, token18Dec, 0);
//             Helper.assertEqual(rate, 0);

//             //add order
//             let rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
//             let orderId = rc.logs[0].args.orderId;

//             rate = await reserve.getConversionRate(token.address, ethAddress, orderDstTwei, 0);
//             let expectedRate = token18Dec.mul(srcAmountWei).div(orderDstTwei);
//             Helper.assertEqual(rate, expectedRate);

//             let illegalOrderDstTwei = orderDstTwei.sub(new BN(1))
//             orderRate = Helper.calcRateFromQty(illegalOrderDstTwei, srcAmountWei, 18, 18);
//             Helper.assertGreater(orderRate, MAX_RATE);

//             try {
//                 await reserve.submitEthToTokenOrder(srcAmountWei, illegalOrderDstTwei, {from: maker1});
//                 assert(false, "throw was expected in line above.")
//             } catch(e) {
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//             }

//             //see also update fails
//             try {
//                 await reserve.updateEthToTokenOrder(orderId, srcAmountWei, illegalOrderDstTwei, {from: maker1});
//                 assert(false, "throw was expected in line above.")
//             } catch(e) {
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//             }

//             rate = await reserve.getConversionRate(token.address, ethAddress, orderDstTwei, 0);
//             expectedRate = token18Dec.mul(srcAmountWei).div(orderDstTwei);
//             Helper.assertEqual(rate, expectedRate);
//         });

//         it("test min eth to token order size. see revert when wei size below min", async() => {
//             let ethWeiDepositAmount = PRECISION.mul(new BN(20));
//             let kncTweiDepositAmount = PRECISION.mul(new BN(600));
//             let tokenTweiDepositAmount = token18Dec.mul(new BN(0));
//             await makerDeposit(maker1, ethWeiDepositAmount, tokenTweiDepositAmount, kncTweiDepositAmount);

//             let weiAmount = new BN(minNewOrderWei);
//             let tweiAmount = new BN(String(9 * 10 ** 12));

//             //add order legal
//             await reserve.submitEthToTokenOrder(weiAmount, tweiAmount, {from: maker1});

//             try {
//                 await reserve.submitEthToTokenOrder(weiAmount.sub(new BN(1)), tweiAmount, {from: maker1});
//                 assert(false, "throw was expected in line above.")
//             } catch(e) {
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//             }

//             try {
//                 await reserve.updateEthToTokenOrder(firstFreeOrderIdPerReserveList, weiAmount.sub(new BN(1)), tweiAmount, {from: maker1});
//                 assert(false, "throw was expected in line above.")
//             } catch(e) {
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//             }

//             await reserve.updateEthToTokenOrder(firstFreeOrderIdPerReserveList, weiAmount.add(new BN(1)), tweiAmount, {from: maker1});
//         })

//         it("test min token to eth order size. see revert when wei size below min", async() => {
//             let ethWeiDepositAmount = PRECISION.mul(new BN(0));
//             let kncTweiDepositAmount = PRECISION.mul(new BN(600));
//             let tokenTweiDepositAmount = token18Dec.mul(new BN(2));
//             await makerDeposit(maker1, ethWeiDepositAmount, tokenTweiDepositAmount, kncTweiDepositAmount);

//             let weiAmount = new BN(minNewOrderWei);
//             let tweiAmount = new BN(String(9 * 10 ** 12));

//             //add order legal
//             await reserve.submitTokenToEthOrder(tweiAmount, weiAmount, {from: maker1});

//             try {
//                 await reserve.submitTokenToEthOrder(tweiAmount, weiAmount.sub(new BN(1)), {from: maker1});
//                 assert(false, "throw was expected in line above.")
//             } catch(e) {
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//             }

//             try {
//                 await reserve.updateTokenToEthOrder(firstFreeOrderIdPerReserveList, tweiAmount,  weiAmount.sub(new BN(1)), {from: maker1});
//                 assert(false, "throw was expected in line above.")
//             } catch(e) {
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//             }

//             await reserve.updateTokenToEthOrder(firstFreeOrderIdPerReserveList, tweiAmount,  weiAmount.add(new BN(1)), {from: maker1});
//         })

//         it("maker add token to eth order. rate > MAX_RATE, see revert for 'add' and 'update'.", async () => {
//             let tokenTweiDepositAmount = new BN(20).mul(new BN(10).pow(new BN(25)));
//             let kncTweiDepositAmount = PRECISION.mul(new BN(600));
//             await makerDeposit(maker1, 0, tokenTweiDepositAmount, kncTweiDepositAmount);

//             srcAmountTwei = new BN(2).mul(new BN(10).pow(new BN(24)));
//             orderDstWei = PRECISION.mul(new BN(2));

//             orderRate = Helper.calcRateFromQty(orderDstWei, srcAmountTwei, 18, 18);
//             Helper.assertEqual(orderRate, MAX_RATE);

//             let rate = await reserve.getConversionRate(tokenAdd, ethAddress, token18Dec, 0);
//             Helper.assertEqual(rate, 0);

//             //add order
//             let rc = await reserve.submitTokenToEthOrder(srcAmountTwei, orderDstWei, {from: maker1});
//             let orderId = rc.logs[0].args.orderId;

//             rate = await reserve.getConversionRate(ethAddress, token.address, orderDstTwei, 0);
//             let expectedRate = token18Dec.mul(srcAmountTwei).div(orderDstWei);
//             Helper.assertEqual(rate, expectedRate);

//             let illegalOrderDstWei = orderDstWei.sub(new BN(1))
//             orderRate = Helper.calcRateFromQty(illegalOrderDstWei, srcAmountTwei, 18, 18);
//             assert(orderRate.gt(MAX_RATE));

//             try {
//                 await reserve.updateEthToTokenOrder(orderId, srcAmountWei, illegalOrderDstWei, {from: maker1});
//                 assert(false, "throw was expected in line above.")
//             } catch(e) {
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//             }

//             //see also update fails
//             try {
//                 await reserve.submitEthToTokenOrder(srcAmountWei, illegalOrderDstWei, {from: maker1});
//                 assert(false, "throw was expected in line above.")
//             } catch(e) {
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//             }

//             rate = await reserve.getConversionRate(ethAddress, token.address, orderDstTwei, 0);
//             expectedRate = token18Dec.mul(srcAmountWei).div(orderDstTwei);
//             Helper.assertEqual(rate, expectedRate);
//         });

//         it("maker add buy token order. cancel order and see canceled.", async () => {
//             let ethWeiDepositAmount = PRECISION.mul(new BN(20));
//             await makerDeposit(maker1, ethWeiDepositAmount, 0, PRECISION.mul(new BN(600)));

//             let srcAmountWei = PRECISION.mul(new BN(2));
//             let orderDstTwei = token18Dec.mul(new BN(9));

//             //add order
//             let rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});

//             let orderList = await reserve.getEthToTokenOrderList();
//             Helper.assertEqual(orderList.length, 1);

//             rc = await reserve.cancelEthToTokenOrder(orderList[0], {from: maker1});

//             orderList = await reserve.getEthToTokenOrderList();
//             Helper.assertEqual(orderList.length, 0);
//         });

//         it("maker add sell token order. see rate updated. verify order details.", async () => {
//             let kncTweiDepositAmount = PRECISION.mul(new BN(600));
//             let tokenWeiDepositAmount = token18Dec.mul(new BN(9)).add(new BN(3000));
//             await makerDeposit(maker1, 0, tokenWeiDepositAmount, kncTweiDepositAmount);

//             let orderSrcAmountTwei = token18Dec.mul(new BN(9));
//             let orderDstWei = PRECISION.mul(new BN(2));

//             // first getConversionRate should return 0
//             let rate = await reserve.getConversionRate(ethAddress, tokenAdd, token18Dec, 0);
//             Helper.assertEqual(rate, 0);

//             //add order
//             let rc = await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei, {from: maker1});

//             let orderDetails = await reserve.getTokenToEthOrder(rc.logs[0].args.orderId);

//             Helper.assertEqual(orderDetails[0], maker1);
//             Helper.assertEqual(orderDetails[1], orderSrcAmountTwei);
//             Helper.assertEqual(orderDetails[2], orderDstWei);
//             Helper.assertEqual(orderDetails[3], headId); // prev should be sell head id - since first
//             Helper.assertEqual(orderDetails[4], tailId); // next should be tail ID - since last

//             let orderList = await reserve.getTokenToEthOrderList();
//             Helper.assertEqual(orderList.length, 1); //sell head only

//             rate = await reserve.getConversionRate(ethAddress, token.address, token18Dec, 0);
//             let expectedRate = token18Dec.mul(orderSrcAmountTwei).div(orderDstWei);
//             Helper.assertEqual(rate, expectedRate);
//         });

//         it("verify 'add order' with src / dst amount above MAX_QTY revert", async() => {
//             let tokenWeiDepositAmount = MAX_QTY.div(new BN(4));
//             let kncTweiDepositAmount = MAX_QTY.sub(new BN(1));
//             let ethWeiDepositAmount = new BN(0);

//             await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);
//             await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);
//             await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);
//             await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);
//             await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

//             let valueWei = MAX_QTY.sub(new BN(1));
//             let valueTwei = MAX_QTY.sub(new BN(1));

//             try {
//                 await reserve.submitTokenToEthOrder(valueTwei.add(new BN(1)), valueWei, {from: maker1});
//                 assert(false, "throw was expected in line above.")
//             } catch(e) {
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//             }

//             try {
//                 await reserve.submitTokenToEthOrder(valueTwei, valueWei.add(new BN(1)), {from: maker1});
//                 assert(false, "throw was expected in line above.")
//             } catch(e) {
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//             }

//             //add order
//             await reserve.submitTokenToEthOrder(valueTwei, valueWei, {from: maker1});
//         })

//         it("verify 'update order' with src / dst amount above MAX_QTY revert", async() => {
//             let tokenWeiDepositAmount = MAX_QTY.div(new BN(4));
//             let kncTweiDepositAmount = MAX_QTY.sub(new BN(1));
//             let ethWeiDepositAmount = new BN(0);

//             await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);
//             await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);
//             await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);
//             await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);
//             await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

//             let valueWei = MAX_QTY.sub(new BN(1));
//             let valueTwei = MAX_QTY.sub(new BN(1));

//             //add order
//             let rc = await reserve.submitTokenToEthOrder(valueTwei, valueWei, {from: maker1});
//             let orderId = rc.logs[0].args.orderId;

//             try {
//                 await reserve.updateTokenToEthOrder(orderId, valueTwei.add(new BN(1)), valueWei, {from: maker1});
//                 assert(false, "throw was expected in line above.")
//             } catch(e) {
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//             }

//             try {
//                 await reserve.updateTokenToEthOrder(orderId, valueTwei, valueWei.add(new BN(1)), {from: maker1});
//                 assert(false, "throw was expected in line above.")
//             } catch(e) {
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//             }
//         })

//         it("maker add buy token order. update to smaller illegal amount, see reverted.", async () => {
//             let ethWeiDepositAmount = PRECISION.mul(new BN(2)).add(new BN(700));
//             let kncTweiDepositAmount = PRECISION.mul(new BN(600));
//             await makerDeposit(maker1, ethWeiDepositAmount, 0, kncTweiDepositAmount);

//             let srcAmountWei = PRECISION.mul(new BN(2)).add(new BN(300));
//             let orderDstTwei = token18Dec.mul(new BN(9));

//             //check maker free token funds
//             let rxFreeWei = await reserve.makerFunds(maker1, ethAddress);
//             Helper.assertEqual(rxFreeWei, ethWeiDepositAmount );

//             //add order
//             let rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
//             let orderId = rc.logs[0].args.orderId;

//             let expectedFreeWei = ethWeiDepositAmount.sub(srcAmountWei);
//             rxFreeWei = await reserve.makerFunds(maker1, ethAddress);
//             Helper.assertEqual(rxFreeWei, expectedFreeWei );


//             let expectedStake = await reserve.calcKncStake(srcAmountWei);
//             let actualStake = await reserve.makerRequiredKncStake(maker1);
//             Helper.assertEqual(expectedStake, actualStake);
//             let freeKnc = await reserve.makerUnlockedKnc(maker1);
//             Helper.assertEqual(freeKnc, kncTweiDepositAmount.sub(expectedStake));
//             let updatedSource = PRECISION.mul(new BN(2)).sub(new BN(100));

//             // update source amount
//             try {
//                 rc = await reserve.updateEthToTokenOrder(orderId, updatedSource, orderDstTwei, {from: maker1});
//                 assert(false, "throw was expected in line above.")
//             } catch(e) {
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//             }

//             rxFreeWei = await reserve.makerFunds(maker1, ethAddress);
//             Helper.assertEqual(rxFreeWei, expectedFreeWei);

//             expectedStake = await reserve.calcKncStake(srcAmountWei);
//             actualStake = await reserve.makerRequiredKncStake(maker1);
//             Helper.assertEqual(expectedStake, actualStake);
//             freeKnc = await reserve.makerUnlockedKnc(maker1);
//             Helper.assertEqual(freeKnc, kncTweiDepositAmount.sub(expectedStake));
//         });

//         it("maker add few buy orders. update order with/out change position. see position correct", async() => {
//             let ethWeiDepositAmount = PRECISION.mul(new BN(8)).add(new BN(6000));
//             let kncTweiDepositAmount = PRECISION.mul(new BN(600));
//             await makerDeposit(maker1, ethWeiDepositAmount, 0, kncTweiDepositAmount);

//             let srcAmountWei = PRECISION.mul(new BN(2)).add(new BN(300)); // 2 ether
//             let orderDstTwei = token18Dec.mul(new BN(9));

//             // insert 1st order
//             let rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
//             let order1ID = rc.logs[0].args.orderId;

//             // insert order as 2nd
//             orderDstTwei = orderDstTwei.add(new BN(100));
//             rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
//             let order2ID = rc.logs[0].args.orderId;

//             // insert order as 3rd
//             orderDstTwei = orderDstTwei.add(new BN(100));
//             rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
//             let order3ID = rc.logs[0].args.orderId;

//             // insert order as 4th
//             orderDstTwei = orderDstTwei.add(new BN(100));
//             rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
//             let order4ID = rc.logs[0].args.orderId;

//             // get order list and see 2nd order is 2nd
//             let list = await reserve.getEthToTokenOrderList();
//             Helper.assertEqual(list[1], order2ID);

//             //get 2nd order data.
//             orderDetails = await reserve.getEthToTokenOrder(order2ID);
//             let order2DestTwei = new BN(orderDetails[2]);
//             order2DestTwei = order2DestTwei.add(new BN(50));

//             //update order
//             await reserve.updateEthToTokenOrder(order2ID, srcAmountWei, order2DestTwei, {from: maker1});

//             // get order list and see 2nd order is 2nd
//             list = await reserve.getEthToTokenOrderList();
//             Helper.assertEqual(list[1], order2ID);

//             //now update so position changes to 3rd
//             order2DestTwei = order2DestTwei.add(new BN(70));

//             //update order
//             await reserve.updateEthToTokenOrder(order2ID, srcAmountWei, order2DestTwei, {from: maker1});

//             // get order list and see 2nd order is 3rd now
//             list = await reserve.getEthToTokenOrderList();
//             Helper.assertEqual(list[2], order2ID);

//             //now update so position changes to 1st
//             order2DestTwei = order2DestTwei.sub(new BN(500));

//             //update order
//             await reserve.updateEthToTokenOrder(order2ID, srcAmountWei, order2DestTwei, {from: maker1});

//             // get order list and see 2nd order is 1st now
//             list = await reserve.getEthToTokenOrderList();
//             Helper.assertEqual(list[0], order2ID);
//         });

//         it("verify order sorting can handle minimum value differences.", async() => {
//             let ethWeiDepositAmount = PRECISION.mul(new BN(6)).add(new BN(6000));
//             let kncTweiDepositAmount = PRECISION.mul(new BN(600));
//             await makerDeposit(maker1, ethWeiDepositAmount, 0, kncTweiDepositAmount);

//             let srcAmountWei = PRECISION.mul(new BN(2)).add(new BN(300)); // 2 ether
//             let orderDstTwei = token18Dec.mul(new BN(9));

//             // insert 1st order
//             let rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
//             let order1ID = rc.logs[0].args.orderId;

//             // insert order as 2nd
//             rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei.add(new BN(1)), {from: maker1});
//             let order2ID = rc.logs[0].args.orderId;

//             // insert order as 1st
//             rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei.sub(new BN(1)), {from: maker1});
//             let order3ID = rc.logs[0].args.orderId;

//             list = await reserve.getEthToTokenOrderList();
//             Helper.assertEqual(list[0], order3ID);
//             Helper.assertEqual(list[1], order1ID);
//             Helper.assertEqual(list[2], order2ID);
//         })

//         it("maker add few buy orders. update order with correct hints. with / without move position. see success and print gas", async() => {
//             let ethWeiDepositAmount = PRECISION.mul(new BN(8)).add(new BN(6000));
//             let kncTweiDepositAmount = PRECISION.mul(new BN(600));
//             await makerDeposit(maker1, ethWeiDepositAmount, 0, kncTweiDepositAmount);

//             let srcAmountWei = PRECISION.mul(new BN(2)).add(new BN(300)); // 2 ether
//             let orderDstTwei = token18Dec.mul(new BN(9));

//             // insert 1st order
//             let rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
//             let order1ID = rc.logs[0].args.orderId;

//             // insert order as 2nd
//             orderDstTwei = orderDstTwei.add(new BN(100));
//             rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
//             let order2ID = rc.logs[0].args.orderId;

//             // insert order as 3rd
//             orderDstTwei = orderDstTwei.add(new BN(100));
//             rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
//             let order3ID = rc.logs[0].args.orderId;

//             // insert order as 4th
//             orderDstTwei = orderDstTwei.add(new BN(100));
//             rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
//             let order4ID = rc.logs[0].args.orderId;

//             // get order list and see as expected
//             let list = await reserve.getEthToTokenOrderList();
//             Helper.assertEqual(list[0], order1ID);
//             Helper.assertEqual(list[1], order2ID);
//             Helper.assertEqual(list[2], order3ID);
//             Helper.assertEqual(list[3], order4ID);

//             //get 2nd order data.
//             orderDetails = await reserve.getEthToTokenOrder(order2ID);
//             let order2DestTwei = new BN(orderDetails[2]);
//             order2DestTwei = order2DestTwei.add(new BN(50));

//             //update order only amounts
//             rc = await reserve.updateEthToTokenOrderWHint(order2ID, srcAmountWei, order2DestTwei, order1ID, {from: maker1});

//             // get order list and see 2nd order is 2nd
//             list = await reserve.getEthToTokenOrderList();
//             Helper.assertEqual(list[1], order2ID);

//             //now update so position changes to 3rd
//             order2DestTwei = order2DestTwei.add(new BN(70));

//             rc = await reserve.updateEthToTokenOrderWHint(order2ID, srcAmountWei, order2DestTwei, order3ID, {from: maker1});
//             list = await reserve.getEthToTokenOrderList();
//             Helper.assertEqual(list[2], order2ID);

//             //now update so position changes to 1st
//             order2DestTwei = order2DestTwei.sub(new BN(500));

//             //update order only amounts
//             rc = await reserve.updateEthToTokenOrderWHint(order2ID, srcAmountWei, order2DestTwei, headId, {from: maker1});

//             // get order list and see 2nd order is 1st now
//             list = await reserve.getEthToTokenOrderList();
//             Helper.assertEqual(list[0], order2ID);
//         });

//         it("maker adds buy orders. compare gas for update with / without hint", async() => {
//             let ethWeiDepositAmount = PRECISION.mul(new BN(8)).add(new BN(6000));
//             let kncTweiDepositAmount = PRECISION.mul(new BN(600));
//             await makerDeposit(maker1, ethWeiDepositAmount, 0, kncTweiDepositAmount);

//             let srcAmountWei = PRECISION.mul(new BN(2)).add(new BN(500)); // 2 ether
//             let orderDstTwei = token18Dec.mul(new BN(9));

//             // insert 1st order
//             let rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
//             let order1ID = rc.logs[0].args.orderId;
//             rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei.add(new BN(200)), {from: maker1});
//             let order2ID = rc.logs[0].args.orderId;
//             rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei.add(new BN(300)), {from: maker1});
//             let order3ID = rc.logs[0].args.orderId;
//             rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei.add(new BN(400)), {from: maker1});
//             let order4ID = rc.logs[0].args.orderId;

//             // update first to be last without hint
//             rc = await reserve.updateEthToTokenOrder(order1ID, srcAmountWei, orderDstTwei.add(new BN(500)), {from: maker1});
//             let updateWithoutHint = rc.receipt.gasUsed;

//             let list = await reserve.getEthToTokenOrderList();
//             Helper.assertEqual(list[3], order1ID);

//             // update first to be last with hint
//             rc = await reserve.updateEthToTokenOrderWHint(order2ID, srcAmountWei, orderDstTwei.add(new BN(600)), order1ID, {from: maker1});
//             let updateWithHint = rc.receipt.gasUsed;
//             list = await reserve.getEthToTokenOrderList();
//             Helper.assertEqual(list[3], order2ID);

//             Helper.assertGreater((updateWithoutHint - updateWithHint), 2000, "Expected update with hint to be at least 2000 gas less. With hint: " +
//                     updateWithHint + " without hint: " + updateWithoutHint);
//         })

//         it("maker add 2 buy orders. get hint for next buy order and see correct", async() => {
//             let ethWeiDepositAmount = PRECISION.mul(new BN(4)).add(new BN(6000));
//             let kncTweiDepositAmount = PRECISION.mul(new BN(600));
//             await makerDeposit(maker1, ethWeiDepositAmount, 0, kncTweiDepositAmount);

//             let srcAmountWei = PRECISION.mul(new BN(2)).add(new BN(500)); // 2 ether
//             let orderDstTwei = token18Dec.mul(new BN(9));

//             let rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
//             let order1ID = rc.logs[0].args.orderId;

//             // insert order as last in list
//             orderDstTwei = orderDstTwei.add(new BN(2000));

//             rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
//             let order2ID = rc.logs[0].args.orderId;
//             orderDetails = await reserve.getEthToTokenOrder(rc.logs[0].args.orderId);
//             Helper.assertEqual(orderDetails[3], order1ID);
//             Helper.assertEqual(orderDetails[4], tailId); // next should be tail ID - since last

//             // get add hint if set as first
//             orderDstTwei = orderDstTwei.sub(new BN(3000));
//             let prevOrder = await reserve.getEthToTokenAddOrderHint(srcAmountWei, orderDstTwei);
//             Helper.assertEqual(prevOrder, headId);

//             // get add hint if set as 2nd
//             orderDstTwei = orderDstTwei.add(new BN(2000));
//             prevOrder = await reserve.getEthToTokenAddOrderHint(srcAmountWei, orderDstTwei);
//             Helper.assertEqual(prevOrder, order1ID);

//             // get add hint if set as 3rd = last
//             orderDstTwei = orderDstTwei.add(new BN(2000));
//             prevOrder = await reserve.getEthToTokenAddOrderHint(srcAmountWei, orderDstTwei);
//             Helper.assertEqual(prevOrder, order2ID);
//         });

//         it("maker add 2 sell orders. get hint for next sell order and see correct", async() => {
//             let tokenWeiDepositAmount = token18Dec.mul(new BN(500)); // 500 tokens
//             let kncTweiDepositAmount = PRECISION.mul(new BN(600));
//             await makerDeposit(maker1, 0, tokenWeiDepositAmount, kncTweiDepositAmount);

//             let orderDestWei = PRECISION.mul(new BN(2)).add(new BN(2000)); // 2 ether
//             let srcAmountTwei = token18Dec.mul(new BN(9));

//             let rc = await reserve.submitTokenToEthOrder(srcAmountTwei, orderDestWei, {from: maker1});
//             let order1ID = rc.logs[0].args.orderId;

//             orderDestWei = orderDestWei.add(new BN(2000));

//             rc = await reserve.submitTokenToEthOrder(srcAmountTwei, orderDestWei, {from: maker1});
//             let order2ID = rc.logs[0].args.orderId;
//             orderDetails = await reserve.getTokenToEthOrder(rc.logs[0].args.orderId);
//             Helper.assertEqual(orderDetails[3], order1ID);
//             Helper.assertEqual(orderDetails[4], tailId); // next should be tail ID - since last

//             // get add hint if set as first
//             orderDestWei = orderDestWei.sub(new BN(3000));
//             let prevOrder = await reserve.getTokenToEthAddOrderHint(srcAmountTwei, orderDestWei);
//             Helper.assertEqual(prevOrder, headId);

//             // get add hint if set as 2nd
//             orderDestWei = orderDestWei.add(new BN(2000));
//             prevOrder = await reserve.getTokenToEthAddOrderHint(srcAmountTwei, orderDestWei);
//             Helper.assertEqual(prevOrder, order1ID);

//             // get add hint if set as 3rd = last
//             orderDestWei = orderDestWei.add(new BN(2000));
//             prevOrder = await reserve.getTokenToEthAddOrderHint(srcAmountTwei, orderDestWei);
//             Helper.assertEqual(prevOrder, order2ID);
//         });

//         it("maker add 3 buy orders. test get hint for updating last order to different amounts", async() => {
//             let ethWeiDepositAmount = PRECISION.mul(new BN(6)).add(new BN(20000));
//             let kncTweiDepositAmount = PRECISION.mul(new BN(600));
//             await makerDeposit(maker1, ethWeiDepositAmount, 0, kncTweiDepositAmount);

//             let srcAmountWei = PRECISION.mul(new BN(2)).add(new BN(500)); // 2 ether
//             let orderDstTwei = token18Dec.mul(new BN(9));

//             let rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
//             let order1ID = rc.logs[0].args.orderId;

//             // insert order as 2nd in list
//             orderDstTwei = orderDstTwei.add(new BN(2000));

//             rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
//             let order2ID = rc.logs[0].args.orderId;
//             orderDetails = await reserve.getEthToTokenOrder(rc.logs[0].args.orderId);
//             Helper.assertEqual(orderDetails[3], order1ID);
//             Helper.assertEqual(orderDetails[4], tailId); // next should be tail ID - since last

//             // insert order as 3rd in list
//             orderDstTwei = orderDstTwei.add(new BN(2000));

//             rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
//             let order3ID = rc.logs[0].args.orderId;
//             orderDetails = await reserve.getEthToTokenOrder(rc.logs[0].args.orderId);
//             Helper.assertEqual(orderDetails[3], order2ID);
//             Helper.assertEqual(orderDetails[4], tailId); // next should be tail ID - since last

//             // get update hint with small amount change.
//             orderDstTwei = orderDstTwei.add(new BN(100));
//             let prevOrder = await reserve.getEthToTokenUpdateOrderHint(order3ID, srcAmountWei, orderDstTwei);
//             Helper.assertEqual(prevOrder, order2ID);

//             // get update hint
//             orderDstTwei = orderDstTwei.sub(new BN(2200));
//             prevOrder = await reserve.getEthToTokenUpdateOrderHint(order3ID, srcAmountWei, orderDstTwei);
//             Helper.assertEqual(prevOrder, order1ID);

//             // get update hint
//             orderDstTwei = orderDstTwei.sub(new BN(2000));
//             prevOrder = await reserve.getEthToTokenUpdateOrderHint(order3ID, srcAmountWei, orderDstTwei);
//             Helper.assertEqual(prevOrder, headId);
//         });

//         it("maker add 3 sell orders. test get hint for updating last order to different amounts", async() => {
//             let tokenWeiDepositAmount = token18Dec.mul(new BN(500)); // 500 tokens
//             let kncTweiDepositAmount = PRECISION.mul(new BN(600));
//             await makerDeposit(maker1, 0, tokenWeiDepositAmount, kncTweiDepositAmount);

//             let orderDestWei = PRECISION.mul(new BN(2)).add(new BN(800)); // 2 ether
//             let srcAmountTwei = token18Dec.mul(new BN(9));

//             let rc = await reserve.submitTokenToEthOrder(srcAmountTwei, orderDestWei, {from: maker1});
//             let order1ID = rc.logs[0].args.orderId;

//             // insert order as 2nd in list
//             orderDestWei = orderDestWei.add(new BN(2000));

//             rc = await reserve.submitTokenToEthOrder(srcAmountTwei, orderDestWei, {from: maker1});
//             let order2ID = rc.logs[0].args.orderId;
//             orderDetails = await reserve.getTokenToEthOrder(rc.logs[0].args.orderId);
//             Helper.assertEqual(orderDetails[3], order1ID);
//             Helper.assertEqual(orderDetails[4], tailId); // next should be tail ID - since last

//             // insert order as 3rd in list
//             orderDestWei = orderDestWei.add(new BN(2000));

//             rc = await reserve.submitTokenToEthOrder(srcAmountTwei, orderDestWei, {from: maker1});
//             let order3ID = rc.logs[0].args.orderId;
//             orderDetails = await reserve.getTokenToEthOrder(rc.logs[0].args.orderId);
//             Helper.assertEqual(orderDetails[3], order2ID);
//             Helper.assertEqual(orderDetails[4], tailId); // next should be tail ID - since last

//             // get update hint with small amount change.
//             orderDestWei = orderDestWei.add(new BN(100));
//             let prevOrder = await reserve.getTokenToEthUpdateOrderHint(order3ID, srcAmountTwei, orderDestWei);
//             Helper.assertEqual(prevOrder, order2ID);

//             // get update hint
//             orderDestWei = orderDestWei.sub(new BN(2200));
//             prevOrder = await reserve.getTokenToEthUpdateOrderHint(order3ID, srcAmountTwei, orderDestWei);
//             Helper.assertEqual(prevOrder, order1ID);

//             // get update hint
//             orderDestWei = orderDestWei.sub(new BN(2000));
//             prevOrder = await reserve.getTokenToEthUpdateOrderHint(order3ID, srcAmountTwei, orderDestWei);
//             Helper.assertEqual(prevOrder, headId);
//         });

//         it("maker add few buy orders. update order with wrong hint. see success and print gas", async() => {
//             let ethWeiDepositAmount = PRECISION.mul(new BN(8)).add(new BN(9000));
//             let kncTweiDepositAmount = PRECISION.mul(new BN(600));
//             await makerDeposit(maker1, ethWeiDepositAmount, 0, kncTweiDepositAmount);

//             let srcAmountWei = PRECISION.mul(new BN(2)).add(new BN(800)); // 2 ether
//             let orderDstTwei = new BN(String(1.4 * PRECISION));

//             // insert 1st order
//             let rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
//             let order1ID = rc.logs[0].args.orderId;

//             // insert order as 2nd
//             orderDstTwei = orderDstTwei.add(new BN(100));
//             rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
//             let order2ID = rc.logs[0].args.orderId;

//             // insert order as 3rd
//             orderDstTwei = orderDstTwei.add(new BN(100));
//             rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
//             let order3ID = rc.logs[0].args.orderId;

//             // insert order as 4th
//             orderDstTwei = orderDstTwei.add(new BN(100));
//             rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
//             let order4ID = rc.logs[0].args.orderId;

//             // get order list and see 2nd order is 2nd
//             let list = await reserve.getEthToTokenOrderList();
//             Helper.assertEqual(list[1], order2ID);

//             //get 2nd order data.
//             orderDetails = await reserve.getEthToTokenOrder(order2ID);
//             let order2DestTwei = new BN(orderDetails[2]);
//             order2DestTwei = order2DestTwei.add(new BN(120));

//             //update order to 3rd place. wrong hint
//             rc = await reserve.updateEthToTokenOrderWHint(order2ID, srcAmountWei, order2DestTwei, headId, {from: maker1});

//             // get order list and see order2 is 3rd now
//             list = await reserve.getEthToTokenOrderList();
//             Helper.assertEqual(list[2], order2ID);

//             //now update so position changes to 1st with wrong hint
//             order2DestTwei = order2DestTwei.sub(new BN(1000));

//             //update order
//             rc = await reserve.updateEthToTokenOrderWHint(order2ID, srcAmountWei, order2DestTwei, order3ID, {from: maker1});

//             // get order list and see order2 is 1st now
//             list = await reserve.getEthToTokenOrderList();
//             Helper.assertEqual(list[0], order2ID);
//         });

//         it("maker add buy order. update order with another maker. see reverted.", async() => {
//             let ethWeiDepositAmount = PRECISION.mul(new BN(2)).add(new BN(9000));
//             let kncTweiDepositAmount = PRECISION.mul(new BN(600));
//             await makerDeposit(maker1, ethWeiDepositAmount, 0, kncTweiDepositAmount);

//             let srcAmountWei = PRECISION.mul(new BN(2)).add(new BN(300)); // 2 ether
//             let orderDstTwei = token18Dec.mul(new BN(9));

//             // insert 1st order
//             let rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
//             let order1ID = rc.logs[0].args.orderId;

//             srcAmountWei = srcAmountWei.add(new BN(500));

//             try {
//                 await reserve.updateEthToTokenOrderWHint(order1ID, srcAmountWei, orderDstTwei, headId, {from: maker2});
//                 assert(false, "throw was expected in line above.")
//             } catch(e) {
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//             }

//             try {
//                 await reserve.updateEthToTokenOrder(order1ID, srcAmountWei, orderDstTwei, {from: maker2});
//                 assert(false, "throw was expected in line above.")
//             } catch(e) {
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//             }

//             rc = await reserve.updateEthToTokenOrderWHint(order1ID, srcAmountWei, orderDstTwei, headId, {from: maker1});
//         });

//         it("maker add few buy and sell orders and perform batch update - only amounts. compare gas no hint and good hint.", async() => {
//             let tokenWeiDepositAmount = token18Dec.mul(new BN(500)); // 500 tokens
//             let kncTweiDepositAmount = PRECISION.mul(new BN(600));
//             let ethWeiDepositAmount = PRECISION.mul(new BN(4)).add(new BN(3000));

//             await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

//             let srcAmountWei = PRECISION.mul(new BN(2)).add(new BN(250)); // 2 ether
//             let dstAmountTwei = token18Dec.mul(new BN(9));

//             // insert buy orders
//             let rc = await reserve.submitEthToTokenOrder(srcAmountWei, dstAmountTwei, {from: maker1});
//             let buyOrder1ID = rc.logs[0].args.orderId;
//             rc = await reserve.submitEthToTokenOrder(srcAmountWei, dstAmountTwei.add(new BN(400)), {from: maker1});
//             let buyOrder2ID = rc.logs[0].args.orderId;

//             // insert sell orders
//             let srcAmountTwei = token18Dec.mul(new BN(9));
//             let orderDestWei = PRECISION.mul(new BN(2));

//             rc = await reserve.submitTokenToEthOrder(srcAmountTwei, orderDestWei, {from: maker1});
//             let sellOrder1ID = rc.logs[0].args.orderId;
//             rc = await reserve.submitTokenToEthOrder(srcAmountTwei, orderDestWei.add(new BN(400)), {from: maker1});
//             let sellOrder2ID = rc.logs[0].args.orderId;

//             //test positions.
//             let list = await reserve.getEthToTokenOrderList();
//             Helper.assertEqual(list[0], buyOrder1ID);
//             Helper.assertEqual(list[1], buyOrder2ID);

//             list = await reserve.getTokenToEthOrderList();
//             Helper.assertEqual(list[0], sellOrder1ID);
//             Helper.assertEqual(list[1], sellOrder2ID);

//             //create batch update only amounts. no hints.
//             let orderTypeArray = [true, true, false, false];
//             let ordersArray = [buyOrder1ID, buyOrder2ID, sellOrder1ID, sellOrder2ID];
//             let orderNewSrcAmountsArr = [srcAmountWei.add(new BN(1)), srcAmountWei.add(new BN(1)),
//                                             srcAmountTwei.add(new BN(1)), srcAmountTwei.add(new BN(1))];
//             let orderNewDstAmountsArr = [dstAmountTwei.add(new BN(100)), dstAmountTwei.add(new BN(500)),
//                         orderDestWei.add(new BN(100)), orderDestWei.add(new BN(500))];
//             let orderHintArray = [0, 0, 0, 0];

//             rc = await reserve.updateOrderBatch(orderTypeArray, ordersArray, orderNewSrcAmountsArr, orderNewDstAmountsArr, orderHintArray, {from: maker1})
//             let updateBatchNoHintGas = rc.receipt.gasUsed;

//             //test positions.
//             list = await reserve.getEthToTokenOrderList();
//             Helper.assertEqual(list[0], buyOrder1ID);
//             Helper.assertEqual(list[1], buyOrder2ID);

//             list = await reserve.getTokenToEthOrderList();
//             Helper.assertEqual(list[0], sellOrder1ID);
//             Helper.assertEqual(list[1], sellOrder2ID);

//             //now update again with good hint array only amounts. print gas.
//             orderNewSrcAmountsArr = [srcAmountWei.add(new BN(2)), srcAmountWei.add(new BN(2)),
//                                          srcAmountTwei.add(new BN(2)), srcAmountTwei.add(new BN(2))];
//             orderNewDstAmountsArr = [dstAmountTwei.add(new BN(20)), dstAmountTwei.add(new BN(420)),
//                         orderDestWei.add(new BN(35)), orderDestWei.add(new BN(435))];
//             orderHintArray = [headId, buyOrder1ID, headId, sellOrder1ID];
//             rc = await reserve.updateOrderBatch(orderTypeArray, ordersArray, orderNewSrcAmountsArr, orderNewDstAmountsArr, orderHintArray, {from: maker1})
//             let updateBatchWithHintGas = rc.receipt.gasUsed;

//             //test positions.
//             list = await reserve.getEthToTokenOrderList();
//             Helper.assertEqual(list[0], buyOrder1ID);
//             Helper.assertEqual(list[1], buyOrder2ID);

//             list = await reserve.getTokenToEthOrderList();
//             Helper.assertEqual(list[0], sellOrder1ID);
//             Helper.assertEqual(list[1], sellOrder2ID);

//             let expectedGasDiff4BatchOrders = 100000;
            
//             Helper.assertLesser(updateBatchWithHintGas, (updateBatchNoHintGas - expectedGasDiff4BatchOrders), "batch with hint gas: " + updateBatchWithHintGas +
//                 " updateBatchNoHintGas " + updateBatchNoHintGas + " expected diff: " + expectedGasDiff4BatchOrders);
//         });

//         it("maker add few buy and sell orders and perform batch update + move position. compare gas no hint and good hint.", async() => {
//             let tokenWeiDepositAmount = token18Dec.mul(new BN(500)); // 500 tokens
//             let kncTweiDepositAmount = PRECISION.mul(new BN(700));
//             let ethWeiDepositAmount = PRECISION.mul(new BN(6)).add(new BN(3000));

//             await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

//             let srcAmountWei = PRECISION.mul(new BN(2)).add(new BN(200)); // 2 ether
//             let dstAmountTwei = token18Dec.mul(new BN(9));

//             // insert 2 buy orders
//             let rc = await reserve.submitEthToTokenOrder(srcAmountWei, dstAmountTwei, {from: maker1});
//             let buyOrder1ID = rc.logs[0].args.orderId;
//             rc = await reserve.submitEthToTokenOrder(srcAmountWei, dstAmountTwei.add(new BN(100)), {from: maker1});
//             let buyOrder2ID = rc.logs[0].args.orderId;
//             rc = await reserve.submitEthToTokenOrder(srcAmountWei, dstAmountTwei.add(new BN(200)), {from: maker1});
//             let buyOrder3ID = rc.logs[0].args.orderId;

//             // insert 2 sell orders
//             let srcAmountTwei = token18Dec.mul(new BN(9));
//             let orderDestWei = PRECISION.mul(new BN(2));

//             rc = await reserve.submitTokenToEthOrder(srcAmountTwei, orderDestWei, {from: maker1});
//             let sellOrder1ID = rc.logs[0].args.orderId;
//             rc = await reserve.submitTokenToEthOrder(srcAmountTwei, orderDestWei.add(new BN(100)), {from: maker1});
//             let sellOrder2ID = rc.logs[0].args.orderId;
//             rc = await reserve.submitTokenToEthOrder(srcAmountTwei, orderDestWei.add(new BN(200)), {from: maker1});
//             let sellOrder3ID = rc.logs[0].args.orderId;

//             //verify positions.
//             let list = await reserve.getEthToTokenOrderList();
//             Helper.assertEqual(list[0], buyOrder1ID);
//             Helper.assertEqual(list[1], buyOrder2ID);
//             Helper.assertEqual(list[2], buyOrder3ID);

//             list = await reserve.getTokenToEthOrderList();
//             Helper.assertEqual(list[0], sellOrder1ID);
//             Helper.assertEqual(list[1], sellOrder2ID);
//             Helper.assertEqual(list[2], sellOrder3ID);

//             //create batch update so both sell orders and buy orders swap places. no hints.
//             let orderTypeArray = [true, true, false, false];
//             let ordersArray = [buyOrder1ID, buyOrder2ID, sellOrder1ID, sellOrder2ID];
//             let orderNewSrcAmountsArr = [srcAmountWei.add(new BN(1)), srcAmountWei.add(new BN(1)),
//                         srcAmountTwei.add(new BN(1)), srcAmountTwei.add(new BN(1))];
//             let orderNewDstAmountsArr = [dstAmountTwei.add(new BN(300)), dstAmountTwei.add(new BN(400)),
//                         orderDestWei.add(new BN(300)), orderDestWei.add(new BN(400))];
//             let orderHintArray = [0, 0, 0, 0];

//     //updateOrderBatch(bool[] isBuyOrder, uint32[] orderId, uint128[] newSrcAmount, uint128[] newDstAmount, uint32[] hintPrevOrder)
//             rc = await reserve.updateOrderBatch(orderTypeArray, ordersArray, orderNewSrcAmountsArr, orderNewDstAmountsArr, orderHintArray, {from: maker1})
//             let updateBatchNoHintGas = rc.receipt.gasUsed;

//             //test positions.
//             list = await reserve.getEthToTokenOrderList();
//             Helper.assertEqual(list[0], buyOrder3ID);
//             Helper.assertEqual(list[1], buyOrder1ID);
//             Helper.assertEqual(list[2], buyOrder2ID);

//             list = await reserve.getTokenToEthOrderList();
//             Helper.assertEqual(list[0], sellOrder3ID);
//             Helper.assertEqual(list[1], sellOrder1ID);
//             Helper.assertEqual(list[2], sellOrder2ID);

//             //now update again with good hint array. print gas.
//             ordersArray = [buyOrder3ID, buyOrder1ID, sellOrder3ID, sellOrder1ID];
//             orderNewSrcAmountsArr = [srcAmountWei.add(new BN(2)), srcAmountWei.add(new BN(2)),
//                                 srcAmountTwei.add(new BN(2)), srcAmountTwei.add(new BN(2))];
//             orderNewDstAmountsArr = [dstAmountTwei.add(new BN(500)), dstAmountTwei.add(new BN(600)),
//                         orderDestWei.add(new BN(500)), orderDestWei.add(new BN(600))];
//             orderHintArray = [buyOrder2ID, buyOrder3ID, sellOrder2ID, sellOrder3ID];
//             rc = await reserve.updateOrderBatch(orderTypeArray, ordersArray, orderNewSrcAmountsArr, orderNewDstAmountsArr, orderHintArray, {from: maker1})
//             let updateBatchWithHintGas = rc.receipt.gasUsed;

//             //test positions.
//             list = await reserve.getEthToTokenOrderList();
//             Helper.assertEqual(list[0], buyOrder2ID);
//             Helper.assertEqual(list[1], buyOrder3ID);
//             Helper.assertEqual(list[2], buyOrder1ID);

//             list = await reserve.getTokenToEthOrderList();
//             Helper.assertEqual(list[0], sellOrder2ID);
//             Helper.assertEqual(list[1], sellOrder3ID);
//             Helper.assertEqual(list[2], sellOrder1ID);

//             Helper.assertLesser(updateBatchWithHintGas, (updateBatchNoHintGas - 1800), "expected update with hint to be better by at least 1800 gas");
//         });

//         it("maker add a few buy orders. see orders added in correct position. print gas price per order", async () => {
//             let tokenWeiDepositAmount = token18Dec.mul(new BN(0));
//             let kncTweiDepositAmount = PRECISION.mul(new BN(600));
//             let ethWeiDepositAmount = PRECISION.mul(new BN(10)).add(new BN(30000));
//             await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

//             let srcAmountWei = PRECISION.mul(new BN(2)).add(new BN(200)); // 2 ether
//             let orderDstTwei = token18Dec.mul(new BN(9));

//             let rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});

//             let order1ID = rc.logs[0].args.orderId;
//             let orderDetails = await reserve.getEthToTokenOrder(order1ID);

//             Helper.assertEqual(orderDetails[0], maker1);
//             Helper.assertEqual(orderDetails[1], srcAmountWei);
//             Helper.assertEqual(orderDetails[2], orderDstTwei);
//             Helper.assertEqual(orderDetails[3], headId); // prev should be buy head id - since first
//             Helper.assertEqual(orderDetails[4], tailId); // next should be tail ID - since last

//             // insert order as last in list
//             orderDstTwei = orderDstTwei.add(new BN(1000));

//             rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
//             let order2ID = rc.logs[0].args.orderId;

//             orderDetails = await reserve.getEthToTokenOrder(order2ID);

//             Helper.assertEqual(orderDetails[3], order1ID);
//             Helper.assertEqual(orderDetails[4], tailId); // next should be tail ID - since last

//             // insert order as last in list
//             orderDstTwei = orderDstTwei.add(new BN(1000));

//             rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});

//             let order3ID = rc.logs[0].args.orderId;
//             orderDetails = await reserve.getEthToTokenOrder(order3ID);

//             Helper.assertEqual(orderDetails[3], order2ID);
//             Helper.assertEqual(orderDetails[4], tailId); // next should be tail ID - since last

//             //get order list
//             let orderList = await reserve.getEthToTokenOrderList();
//             //get first order details
//             orderDetails = await reserve.getEthToTokenOrder(orderList[0]);

//             // insert order as first in list
//             let bestOrderSrcAmount = orderDetails[1].add(new BN(100));
//             let bestOrderDstAmount = orderDetails[2];

//             rc = await reserve.submitEthToTokenOrderWHint(bestOrderSrcAmount, bestOrderDstAmount, 0, {from: maker1});
//             let order4ID = rc.logs[0].args.orderId;

//             orderDetails = await reserve.getEthToTokenOrder(rc.logs[0].args.orderId);

//             Helper.assertEqual(orderDetails[3], headId); // prev should be buy head id - since first
//             Helper.assertEqual(orderDetails[4], order1ID); // next should be tail ID - since last

//             //now insert order as 2nd best.
//             let secondBestPayAmount = bestOrderSrcAmount.sub(new BN(30));
//             rc = await reserve.submitEthToTokenOrderWHint(secondBestPayAmount, bestOrderDstAmount, 0, {from: maker1});
//             let order5ID = rc.logs[0].args.orderId;

//             orderDetails = await reserve.getEthToTokenOrder(rc.logs[0].args.orderId);

//             Helper.assertEqual(orderDetails[3], order4ID); // prev should be buy head id - since first
//             Helper.assertEqual(orderDetails[4], order1ID); // next should be tail ID - since last
//         });

//         it("maker - check gas price for order reuse is better.", async () => {
//             let tokenWeiDepositAmount = token18Dec.mul(new BN(0));
//             let kncTweiDepositAmount = PRECISION.mul(new BN(600));
//             let ethWeiDepositAmount = PRECISION.mul(new BN(10)).add(new BN(30000));
//             await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

//             let srcAmountWei = PRECISION.mul(new BN(2)).add(new BN(2000)); // 2 ether
//             let orderDstTwei = token18Dec.mul(new BN(9));

//             let rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
//             let gasAmountFirstOrderUse = new BN(rc.receipt.gasUsed);

//             // insert order as last in list
//             orderDstTwei = orderDstTwei.add(new BN(2000));

//             rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
//             gasAmountFirstOrderUse = gasAmountFirstOrderUse.add(new BN(rc.receipt.gasUsed));

//             // insert order as last in list
//             orderDstTwei = orderDstTwei.add(new BN(2000));

//             rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
//             gasAmountFirstOrderUse = gasAmountFirstOrderUse.add(new BN(rc.receipt.gasUsed));

//             orderDstTwei = orderDstTwei.sub(new BN(6000));

//             rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
//             gasAmountFirstOrderUse = gasAmountFirstOrderUse.add(new BN(rc.receipt.gasUsed));

//             //now insert order as 2nd best.
//             orderDstTwei = orderDstTwei.add(new BN(300));
//             rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
//             gasAmountFirstOrderUse = gasAmountFirstOrderUse.add(new BN(rc.receipt.gasUsed));

//             let orderList = await reserve.getEthToTokenOrderList();
//             for (let i = 0; i < orderList.length; i++) {
//                 //start from 1 since first order is head
//                 await reserve.cancelEthToTokenOrder(orderList[i], {from: maker1});
//             }

//             srcAmountWei = PRECISION.mul(new BN(2)).add(new BN(2000)); // 2 ether
//             orderDstTwei = token18Dec.mul(new BN(9));
//             rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
//             let gasAmountOrderReuse = new BN(rc.receipt.gasUsed);

//             // insert order as last in list
//             orderDstTwei = orderDstTwei.add(new BN(2000));

//             rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
//             gasAmountOrderReuse = gasAmountOrderReuse.add(new BN(rc.receipt.gasUsed));

//             // insert order as last in list
//             orderDstTwei = orderDstTwei.add(new BN(2000));

//             rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
//             gasAmountOrderReuse = gasAmountOrderReuse.add(new BN(rc.receipt.gasUsed));

//             orderDstTwei = orderDstTwei.sub(new BN(6000));

//             rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
//             gasAmountOrderReuse = gasAmountOrderReuse.add(new BN(rc.receipt.gasUsed));

//             //now insert order as 2nd best.
//             orderDstTwei = orderDstTwei.add(new BN(300));
//             rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
//             gasAmountOrderReuse = gasAmountOrderReuse.add(new BN(rc.receipt.gasUsed));

//             orderList = await reserve.getEthToTokenOrderList();

//             for (let i = 0; i < orderList.length ; i++) {
//                 await reserve.cancelEthToTokenOrder(orderList[i], {from: maker1});
//             }

//             assert((gasAmountFirstOrderUse.sub(gasAmountOrderReuse)).div(new BN(5)) >= 30000, "Expecting order reuse gas to be 30k less the fist time use.");
//         });

//         it("use batch add order - 3 orders. print gas for using hint array.", async() => {
//             let tokenWeiDepositAmount = token18Dec.mul(new BN(0));
//             let kncTweiDepositAmount = PRECISION.mul(new BN(600));
//             let ethWeiDepositAmount = PRECISION.mul(new BN(6));
//             await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

//             orderSrc = PRECISION.mul(new BN(2));
//             orderDst = PRECISION.mul(new BN(6));

//             let makeOrdersSrcAmounts = [orderSrc, orderSrc, orderSrc];
//             let makeOrdersDstAmount = [orderDst, orderDst.add(new BN(200)), orderDst.add(new BN(500))];

//             let hintArray = [headId, firstFreeOrderIdPerReserveList, firstFreeOrderIdPerReserveList * 1 + 1*1];
//             let isAfterMyPrevOrder = [false, false, false];
//             let isBuyOrder = [true, true, true];

//             //batch order
//             rc = await reserve.addOrderBatch(isBuyOrder, makeOrdersSrcAmounts, makeOrdersDstAmount, hintArray,
//                                         isAfterMyPrevOrder, {from: maker1});

//         })

//         it("use batch add order. print gas for using special add array.", async() => {
//             let tokenWeiDepositAmount = token18Dec.mul(new BN(0));
//             let kncTweiDepositAmount = PRECISION.mul(new BN(600));
//             let ethWeiDepositAmount = PRECISION.mul(new BN(6));
//             await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

//             orderSrc = PRECISION.mul(new BN(2));
//             orderDst = PRECISION.mul(new BN(6));

//             let makeOrdersSrcAmounts = [orderSrc, orderSrc, orderSrc];
//             let makeOrdersDstAmount = [orderDst, orderDst.add(new BN(200)), orderDst.add(new BN(500))];
//             let hintArray = [headId, 0, 0];
//             let isAfterMyPrevOrder = [false, true, true];
//             let isBuyOrder = [true, true, true];

//             //legal batch order
//             rc = await reserve.addOrderBatch(isBuyOrder, makeOrdersSrcAmounts, makeOrdersDstAmount, hintArray,
//                                         isAfterMyPrevOrder, {from: maker1});
//         })

//         it("use batch add order. print gas when using no hints.", async() => {
//             let tokenWeiDepositAmount = token18Dec.mul(new BN(0));
//             let kncTweiDepositAmount = PRECISION.mul(new BN(600));
//             let ethWeiDepositAmount = PRECISION.mul(new BN(6));
//             await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

//             orderSrc = PRECISION.mul(new BN(2));
//             orderDst = PRECISION.mul(new BN(6));

//             let makeOrdersSrcAmounts = [orderSrc, orderSrc, orderSrc];
//             let makeOrdersDstAmount = [orderDst, orderDst.add(new BN(200)), orderDst.add(new BN(500))];
//             let hintArray = [0, 0, 0];
//             let isAfterMyPrevOrder = [false, false, false];
//             let isBuyOrder = [true, true, true];

//             //legal batch order
//             rc = await reserve.addOrderBatch(isBuyOrder, makeOrdersSrcAmounts, makeOrdersDstAmount, hintArray,
//                                         isAfterMyPrevOrder, {from: maker1});
//         })

//         it("maker - compare gas price for making 5 buy orders. one by one in order vs batch add.", async () => {
//             let tokenWeiDepositAmount = token18Dec.mul(new BN(0));
//             let kncTweiDepositAmount = PRECISION.mul(new BN(600));
//             let ethWeiDepositAmount = PRECISION.mul(new BN(10)).add(new BN(30000));
//             await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

//             orderSrc = PRECISION.mul(new BN(2));
//             orderDst = PRECISION.mul(new BN(6));

//             makeOrdersSrcAmounts = [orderSrc, orderSrc, orderSrc, orderSrc, orderSrc];
//             makeOrdersDstAmount = [orderDst, orderDst.add(new BN(200)), orderDst.add(new BN(500)), orderDst.add(new BN(900)), orderDst.add(new BN(1300))];

//             let totalGasMaker1 = new BN(0);
//             let totalPayValue = new BN(0);

//             for (let i = 0; i < makeOrdersSrcAmounts.length; i++) {
//                 let rc = await reserve.submitEthToTokenOrderWHint(makeOrdersSrcAmounts[i], makeOrdersDstAmount[i], 0, {from: maker1});
//                 totalGasMaker1 = totalGasMaker1.add(new BN(rc.receipt.gasUsed));
//                 totalPayValue = totalPayValue.add(makeOrdersDstAmount[i]);
//             }

//             await token.transfer(network, totalPayValue);
//             await token.approve(reserve.address, totalPayValue, {from: network});
//             let rate = await reserve.getConversionRate(tokenAdd, ethAddress, totalPayValue, 0);
//             let rc = await reserve.trade(tokenAdd, totalPayValue, ethAddress, user1, rate, false, {from:network});

//             //now run batch with maker2
//             let hintArray = [0, 0, 0, 0, 0];
//             let isAfterMyPrevOrder = [false, false, false, false, false];
//             let isBuyOrder = [true, true, true, true, true];

//             await makerDeposit(maker2, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

//             rc = await reserve.addOrderBatch(isBuyOrder, makeOrdersSrcAmounts, makeOrdersDstAmount, hintArray, isAfterMyPrevOrder, {from: maker2});

//             let gasCostBatchAdd = rc.receipt.gasUsed;

//             Helper.assertGreater((totalGasMaker1 - gasCostBatchAdd), 30000);
//         });

//         it("make order - compare gas price. add 5th order with / without hint.", async () => {
//             let tokenWeiDepositAmount = token18Dec.mul(new BN(0));
//             let kncTweiDepositAmount = PRECISION.mul(new BN(600));
//             let ethWeiDepositAmount = PRECISION.mul(new BN(10)).add(new BN(30000));
//             await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

//             orderSrc = PRECISION.mul(new BN(2));
//             orderDst = PRECISION.mul(new BN(6));

//             makeOrdersSrcAmounts = [orderSrc, orderSrc, orderSrc, orderSrc, orderSrc];
//             makeOrdersDstAmount = [orderDst, orderDst.add(new BN(200)), orderDst.add(new BN(500)), orderDst.add(new BN(900)), orderDst.add(new BN(1300))];

//             for (let i = 0; i < makeOrdersSrcAmounts.length - 1; i++) {
//                 let rc = await reserve.submitEthToTokenOrder(makeOrdersSrcAmounts[i], makeOrdersDstAmount[i], {from: maker1});
//             }

//             let lastOrder = makeOrdersSrcAmounts.length - 1;
//             let rc = await reserve.submitEthToTokenOrder(makeOrdersSrcAmounts[lastOrder], makeOrdersDstAmount[lastOrder], {from: maker1});
//             let gasWithoutHint = rc.receipt.gasUsed;

//             orderList = await reserve.getEthToTokenOrderList();
//             for (let i = 0; i < orderList.length ; i++) {
//                 await reserve.cancelEthToTokenOrder(orderList[i], {from: maker1});
//             }

//             //now run same data with maker 2. add last with hint
//             await makerDeposit(maker2, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

//             for (let i = 0; i < makeOrdersSrcAmounts.length - 1; i++) {
//                 rc = await reserve.submitEthToTokenOrderWHint(makeOrdersSrcAmounts[i], makeOrdersDstAmount[i], 0, {from: maker2});
//             }

//             lastOrder = makeOrdersSrcAmounts.length - 1;
//             let prevId = rc.logs[0].args.orderId;

//             rc = await reserve.submitEthToTokenOrderWHint(makeOrdersSrcAmounts[lastOrder], makeOrdersDstAmount[lastOrder],
//                 prevId, {from: maker2});

//             let gasWithHint = rc.receipt.gasUsed;

//             Helper.assertGreater((gasWithoutHint - gasWithHint), 1000, "add with with hint expected to be at least 1000 gas less");

//             orderList = await reserve.getEthToTokenOrderList();
//             for (let i = 0; i < orderList.length ; i++) {
//                 await reserve.cancelEthToTokenOrder(orderList[i], {from: maker2});
//             }
//         });

//         it("maker add a few sell orders. see orders added in correct position.", async () => {
//             let tokenWeiDepositAmount = token18Dec.mul(new BN(500));
//             let kncTweiDepositAmount = PRECISION.mul(new BN(600));
//             let ethWeiDepositAmount = PRECISION.mul(new BN(0)).add(new BN(30000));
//             await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

//             let orderSrcAmountTwei = token18Dec.mul(new BN(9));
//             let orderDstWei = PRECISION.mul(new BN(2)).add(new BN(2000));

//             let rc = await reserve.submitTokenToEthOrderWHint(orderSrcAmountTwei, orderDstWei, 0, {from: maker1});

//             let order1ID = rc.logs[0].args.orderId;

//             let orderDetails = await reserve.getTokenToEthOrder(rc.logs[0].args.orderId);

//             Helper.assertEqual(orderDetails[0], maker1);
//             Helper.assertEqual(orderDetails[1], orderSrcAmountTwei);
//             Helper.assertEqual(orderDetails[2], orderDstWei);
//             Helper.assertEqual(orderDetails[3], headId); // prev should be buy head id - since first
//             Helper.assertEqual(orderDetails[4], tailId); // next should be tail ID - since last

//             // insert order as last in list
//             orderDstWei = orderDstWei.add(new BN(2000));

//             rc = await reserve.submitTokenToEthOrderWHint(orderSrcAmountTwei, orderDstWei, 0, {from: maker1});

//             let order2ID = rc.logs[0].args.orderId;

//             orderDetails = await reserve.getTokenToEthOrder(rc.logs[0].args.orderId);

//             Helper.assertEqual(orderDetails[3], order1ID); // prev should be buy head id - since first
//             Helper.assertEqual(orderDetails[4], tailId); // next should be tail ID - since last

//             // insert another order as last in list
//             orderDstWei = orderDstWei.add(new BN(2000));

//             rc = await reserve.submitTokenToEthOrderWHint(orderSrcAmountTwei, orderDstWei, 0, {from: maker1});
//             let order3ID = rc.logs[0].args.orderId;

//             orderDetails = await reserve.getTokenToEthOrder(rc.logs[0].args.orderId);

//             Helper.assertEqual(orderDetails[3], order2ID);
//             Helper.assertEqual(orderDetails[4], tailId);

//             //get order list
//             let orderList = await reserve.getTokenToEthOrderList();

//             //get first order details
//             orderDetails = await reserve.getTokenToEthOrder(orderList[0]);

//             // insert order as first in list
//             let bestOrderSrcAmount = orderDetails[1];
//             let bestOrderDstAmount = orderDetails[2].sub(new BN(200));

//             rc = await reserve.submitTokenToEthOrderWHint(bestOrderSrcAmount, bestOrderDstAmount, 0, {from: maker1});
//             let order4ID = rc.logs[0].args.orderId;

//             orderDetails = await reserve.getTokenToEthOrder(order4ID);

//             Helper.assertEqual(orderDetails[3], headId);
//             Helper.assertEqual(orderDetails[4], order1ID);

//             //now insert order as 2nd best.
//             let secondBestDstAmount = bestOrderDstAmount.add(new BN(100));
//             rc = await reserve.submitTokenToEthOrderWHint(bestOrderSrcAmount, secondBestDstAmount, 0, {from: maker1});
//             let order5ID = rc.logs[0].args.orderId;

//             orderDetails = await reserve.getTokenToEthOrder(rc.logs[0].args.orderId);

//             Helper.assertEqual(orderDetails[3], order4ID);
//             Helper.assertEqual(orderDetails[4], order1ID);
//         });

//         it("add max number of orders per maker x sell and x buy. see next order reverted.", async () => {
//             const MAX_ORDERS_PER_MAKER = numOrderIdsPerMaker;

//             let tokenWeiDepositAmount = token18Dec.mul(new BN(3000));
//             let kncTweiDepositAmount = PRECISION.mul(new BN(300000));
//             let ethWeiDepositAmount = PRECISION.mul(new BN(0));
//             await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

//             let orderSrcAmountTwei = token18Dec.mul(new BN(3));
//             let orderDstWei = PRECISION.mul(new BN(2));

//             let rc = await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei, {from: maker1});;
//             for(let i = 1; i < MAX_ORDERS_PER_MAKER; i++) {
//                 orderDstWei = orderDstWei.add(new BN(500));
//                 let prevId = rc.logs[0].args.orderId;
//                 rc = await reserve.submitTokenToEthOrderWHint(orderSrcAmountTwei, orderDstWei, prevId, {from: maker1});
//             }

//             let lastOrderId = rc.logs[0].args.orderId;

//             orderList = await reserve.getTokenToEthOrderList();
//             Helper.assertEqual(orderList.length, numOrderIdsPerMaker);

//             try {
//                 rc = await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei.add(new BN(600)), {from: maker1});
//                 assert(false, "throw was expected in line above.")
//             } catch(e) {
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//             }

//             //take two orders and add again. (this time with hint)
//             let payValueWei = PRECISION.mul(new BN(4)).add(new BN(500));
//             rate = await reserve.getConversionRate(ethAddress, tokenAdd, payValueWei, 0);
//             rc = await reserve.trade(ethAddress, payValueWei, tokenAdd, user1, rate, false, {from:network, value: payValueWei});

//             orderList = await reserve.getTokenToEthOrderList();
//             Helper.assertEqual(orderList.length, (numOrderIdsPerMaker - 2));

//             //add without hint
//             orderDstWei = orderDstWei.add(new BN(500));
//             rc = await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei, {from: maker1});
//             let addGasOrderLastIdNoHint = rc.receipt.gasUsed;

//             orderDstWei = orderDstWei.add(new BN(500));
//             rc = await reserve.submitTokenToEthOrderWHint(orderSrcAmountTwei, orderDstWei, rc.logs[0].args.orderId,
//                             {from: maker1});
//             let addGasLastIdWithHint = rc.receipt.gasUsed;

//             //now max orders for maker2
//             await makerDeposit(maker2, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

//             for(let i = 0; i < MAX_ORDERS_PER_MAKER; i++) {
//                 let prevId = rc.logs[0].args.orderId;
//                 rc = await reserve.submitTokenToEthOrderWHint(orderSrcAmountTwei, orderDstWei, prevId, {from: maker2});
//             }

//             orderList = await reserve.getTokenToEthOrderList();
//             Helper.assertEqual(orderList.length, (2 * numOrderIdsPerMaker));
//         });

//         it("test can't 'revive' deleted (tok to eth) order by setting it as prev ID (in empty list)", async() => {
//             let tokenWeiDepositAmount = token18Dec.mul(new BN(500));
//             let kncTweiDepositAmount = PRECISION.mul(new BN(600));
//             let ethWeiDepositAmount = PRECISION.mul(new BN(0)).add(new BN(30000));
//             await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

//             let orderSrcAmountTwei = token18Dec.mul(new BN(9));
//             let orderDstWei = PRECISION.mul(new BN(2)).add(new BN(2000));

//             let rc = await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei, {from: maker1});
//             let order1ID = rc.logs[0].args.orderId;
//             rc = await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei, {from: maker1});
//             let order2ID = rc.logs[0].args.orderId;

//             await reserve.cancelTokenToEthOrder(order1ID, {from: maker1});
//             await reserve.cancelTokenToEthOrder(order2ID, {from: maker1});

//             await reserve.submitTokenToEthOrderWHint(orderSrcAmountTwei, orderDstWei, order2ID, {from: maker1});

//             let orderList = await reserve.getTokenToEthOrderList();

//             Helper.assertEqual(orderList.length, 1);
//         })

//         it("test can't 'revive' deleted (tok to eth) order by setting it as prev ID (in non empty list)", async() => {
//             let tokenWeiDepositAmount = token18Dec.mul(new BN(500));
//             let kncTweiDepositAmount = PRECISION.mul(new BN(600));
//             let ethWeiDepositAmount = PRECISION.mul(new BN(0)).add(new BN(30000));
//             await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

//             let orderSrcAmountTwei = token18Dec.mul(new BN(9));
//             let orderDstWei = PRECISION.mul(new BN(2));

//             await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei, {from: maker1});
//             let rc = await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei.add(new BN(100)), {from: maker1});
//             let id2ndOrder = rc.logs[0].args.orderId;
//             rc = await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei.add(new BN(200)), {from: maker1});
//             let id3rdOrder = rc.logs[0].args.orderId;
//             await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei.add(new BN(300)), {from: maker1});
//             await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei.add(new BN(400)), {from: maker1});

//             await reserve.cancelTokenToEthOrder(id2ndOrder, {from: maker1});
//             await reserve.cancelTokenToEthOrder(id3rdOrder, {from: maker1});

//             await reserve.submitTokenToEthOrderWHint(orderSrcAmountTwei, orderDstWei.add(new BN(150)), id3rdOrder, {from: maker1});

//             let orderList = await reserve.getTokenToEthOrderList();

//             Helper.assertEqual(orderList.length, 4);
//         })

//         it("test can't 'revive' canceled (tok to eth) order by updating it", async() => {
//             const tokenWeiDepositAmount = token18Dec.mul(new BN(500));
//             const kncTweiDepositAmount = PRECISION.mul(new BN(600));
//             const ethWeiDepositAmount = PRECISION.mul(new BN(0));
//             await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

//             let orderSrcAmountTwei = token18Dec.mul(new BN(9));
//             let orderDstWei = PRECISION.mul(new BN(2));

//             await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei, {from: maker1});
//             let rc = await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei.add(new BN(100)), {from: maker1});
//             let id2ndOrder = rc.logs[0].args.orderId;
//             rc = await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei.add(new BN(200)), {from: maker1});
//             await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei.add(new BN(300)), {from: maker1});

//             await reserve.cancelTokenToEthOrder(id2ndOrder, {from: maker1});

//             let list = await reserve.getTokenToEthOrderList();

//             try {
//                 await reserve.updateTokenToEthOrder(id2ndOrder, orderSrcAmountTwei, orderDstWei.add(new BN(155)), {from: maker1})
//                 assert(false, "throw was expected in line above.")
//             } catch(e) {
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//             }

//             let listAfter = await reserve.getTokenToEthOrderList();
//             Helper.assertEqual(list.length, listAfter.length);
//         })

//         it("test can't cancel canceled (tok to eth) order", async() => {
//             const tokenWeiDepositAmount = token18Dec.mul(new BN(500));
//             const kncTweiDepositAmount = PRECISION.mul(new BN(600));
//             const ethWeiDepositAmount = new BN(0);
//             await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

//             let orderSrcAmountTwei = token18Dec.mul(new BN(9));
//             let orderDstWei = PRECISION.mul(new BN(2));

//             await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei, {from: maker1});
//             let rc = await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei.add(new BN(100)), {from: maker1});
//             let id2ndOrder = rc.logs[0].args.orderId;
//             rc = await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei.add(new BN(200)), {from: maker1});

//             await reserve.cancelTokenToEthOrder(id2ndOrder, {from: maker1});

//             try {
//                 await reserve.cancelTokenToEthOrder(id2ndOrder, {from: maker1});
//                 assert(false, "throw was expected in line above.")
//             } catch(e) {
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//             }
//         })

//         it("test can't 'revive' deleted (eth to tok) order by setting it as prev ID (in empty list)", async() => {
//             let tokenWeiDepositAmount = token18Dec.mul(new BN(0));
//             let kncTweiDepositAmount = PRECISION.mul(new BN(600));
//             let ethWeiDepositAmount = PRECISION.mul(new BN(10)).add(new BN(30000));
//             await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

//             let orderTwei = token18Dec.mul(new BN(9));
//             let orderWei = PRECISION.mul(new BN(2)).add(new BN(2000));

//             let rc = await reserve.submitEthToTokenOrder(orderWei, orderTwei, {from: maker1});
//             let order1ID = rc.logs[0].args.orderId;
//             rc = await reserve.submitEthToTokenOrder(orderWei, orderTwei.add(new BN(150)), {from: maker1});
//             let order2ID = rc.logs[0].args.orderId;

//             await reserve.cancelEthToTokenOrder(order1ID, {from: maker1});
//             await reserve.cancelEthToTokenOrder(order2ID, {from: maker1});

//             await reserve.submitEthToTokenOrderWHint(orderWei, orderTwei, order2ID, {from: maker1});

//             let orderList = await reserve.getEthToTokenOrderList();

//             Helper.assertEqual(orderList.length, 1);
//         })

//         it("test can't 'revive' deleted (eth to tok) order by setting it as prev ID (in non empty list)", async() => {
//             let tokenWeiDepositAmount = token18Dec.mul(new BN(0));
//             let kncTweiDepositAmount = PRECISION.mul(new BN(600));
//             let ethWeiDepositAmount = PRECISION.mul(new BN(10)).add(new BN(30000));
//             await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

//             let orderTwei = token18Dec.mul(new BN(9));
//             let orderWei = PRECISION.mul(new BN(2));

//             await reserve.submitEthToTokenOrder(orderWei, orderTwei, {from: maker1});
//             let rc = await reserve.submitEthToTokenOrder(orderWei, orderTwei.add(new BN(100)), {from: maker1});
//             let id2ndOrder = rc.logs[0].args.orderId;
//             rc = await reserve.submitEthToTokenOrder(orderWei, orderTwei.add(new BN(200)), {from: maker1});
//             let id3rdOrder = rc.logs[0].args.orderId;
//             await reserve.submitEthToTokenOrder(orderWei, orderTwei.add(new BN(300)), {from: maker1});
//             await reserve.submitEthToTokenOrder(orderWei, orderTwei.add(new BN(400)), {from: maker1});

//             await reserve.cancelEthToTokenOrder(id2ndOrder, {from: maker1});
//             await reserve.cancelEthToTokenOrder(id3rdOrder, {from: maker1});

//             await reserve.submitEthToTokenOrderWHint(orderWei, orderTwei.add(new BN(150)), id3rdOrder, {from: maker1});

//             let orderList = await reserve.getEthToTokenOrderList();

//             Helper.assertEqual(orderList.length, 4);
//         })
//     });

//     describe("knc stakes and burn", function() {
//         it("maker add sell token order. see funds & knc stakes updated.", async () => {
//             let kncTweiDepositAmount = PRECISION.mul(new BN(600));
//             let tokenWeiDepositAmount = new BN(String(PRECISION * 11.1));
//             await makerDeposit(maker1, 0, tokenWeiDepositAmount, kncTweiDepositAmount);

//             let orderSrcAmountTwei = token18Dec.mul(new BN(9));
//             let orderDstWei = PRECISION.mul(new BN(2));

//             //check maker free token funds
//             let rxFreeTwei = await reserve.makerFunds(maker1, tokenAdd);
//             Helper.assertEqual(rxFreeTwei, tokenWeiDepositAmount );
//             let freeKnc = await reserve.makerUnlockedKnc(maker1);
//             Helper.assertEqual(freeKnc, kncTweiDepositAmount);
//             let stakedKnc =  await reserve.makerRequiredKncStake(maker1);
//             Helper.assertEqual(stakedKnc, 0);

//             //add order
//             let rc = await reserve.submitTokenToEthOrderWHint(orderSrcAmountTwei, orderDstWei, 0, {from: maker1});

//             let expectedFreeTwei = tokenWeiDepositAmount.sub(orderSrcAmountTwei);
//             rxFreeTwei = await reserve.makerFunds(maker1, tokenAdd);
//             Helper.assertEqual(rxFreeTwei, expectedFreeTwei);

//             expectedStakedKnc = await reserve.calcKncStake(orderDstWei);
//             stakedKnc =  await reserve.makerRequiredKncStake(maker1);
//             Helper.assertEqual(stakedKnc, expectedStakedKnc);
//             freeKnc = await reserve.makerUnlockedKnc(maker1);
//             Helper.assertEqual(freeKnc, kncTweiDepositAmount.sub(expectedStakedKnc));
//             rxFreeTwei = await reserve.makerFunds(maker1, tokenAdd);
//             Helper.assertEqual(rxFreeTwei, tokenWeiDepositAmount.sub(orderSrcAmountTwei) );
//         });

//         it("maker add buy token order. see funds & knc stakes updated.", async () => {
//             let kncTweiDepositAmount = PRECISION.mul(new BN(600));
//             let ethWeiDepositAmount = PRECISION.mul(new BN(2)).add(new BN(700));
//             await makerDeposit(maker1, ethWeiDepositAmount, 0, kncTweiDepositAmount);

//             let orderSrcAmountWei = PRECISION.mul(new BN(2));
//             let orderDstTwei = token18Dec.mul(new BN(5));

//             //check maker free token funds
//             let rxFreeWei = await reserve.makerFunds(maker1, ethAddress);
//             Helper.assertEqual(rxFreeWei, ethWeiDepositAmount );
//             let freeKnc = await reserve.makerUnlockedKnc(maker1);
//             Helper.assertEqual(freeKnc, kncTweiDepositAmount);
//             let stakedKnc =  await reserve.makerRequiredKncStake(maker1);
//             Helper.assertEqual(stakedKnc, 0);

//             //add order
//             let rc = await reserve.submitEthToTokenOrder(orderSrcAmountWei, orderDstTwei, {from: maker1});

//             let expectedFreeWei = new BN(700);
//             rxFreeWei = await reserve.makerFunds(maker1, ethAddress);
//             Helper.assertEqual(rxFreeWei, expectedFreeWei);

//             expectedStakedKnc = await reserve.calcKncStake(orderSrcAmountWei);
//             stakedKnc =  await reserve.makerRequiredKncStake(maker1);
//             Helper.assertEqual(stakedKnc, expectedStakedKnc);
//             freeKnc = await reserve.makerUnlockedKnc(maker1);
//             Helper.assertEqual(freeKnc, kncTweiDepositAmount.sub(expectedStakedKnc));
//         });

//         it("maker add buy token orders. take orders. see total orders wei and knc stakes updated.", async () => {
//             let kncTweiDepositAmount = PRECISION.mul(new BN(600));
//             let ethWeiDepositAmount = PRECISION.mul(new BN(6)).add(new BN(700));
//             await makerDeposit(maker1, ethWeiDepositAmount, 0, kncTweiDepositAmount);

//             let orderSrcAmountWei = PRECISION.mul(new BN(2));
//             let orderDstTwei = new BN(String(2 * 10 ** 14));

//             //add 3 orders
//             let rc = await reserve.submitEthToTokenOrder(orderSrcAmountWei.add(new BN(100)), orderDstTwei, {from: maker1});
//             await reserve.submitEthToTokenOrder(orderSrcAmountWei.add(new BN(200)), orderDstTwei, {from: maker1});
//             await reserve.submitEthToTokenOrder(orderSrcAmountWei.add(new BN(300)), orderDstTwei, {from: maker1});

//             let expectedTotalWeiInOrders = orderSrcAmountWei.mul(new BN(3)).add(new BN(600));
//             rxOrdersWei = await reserve.makerTotalOrdersWei(maker1);
//             Helper.assertEqual(rxOrdersWei, expectedTotalWeiInOrders);

//             let expectedStakedKnc = await reserve.calcKncStake(expectedTotalWeiInOrders);
//             rxKncStakes = await reserve.makerRequiredKncStake(maker1);
//             Helper.assertEqual(rxKncStakes, expectedStakedKnc);

//             expectedFreeKnc = kncTweiDepositAmount.sub(expectedStakedKnc);
//             rxFreeKnc = await reserve.makerUnlockedKnc(maker1);
//             Helper.assertEqual(expectedFreeKnc, rxFreeKnc);

//             //take one full order
//             await token.transfer(network, orderDstTwei);
//             await token.approve(reserve.address, orderDstTwei, {from: network})
//             let rate = await reserve.getConversionRate(tokenAdd, ethAddress, orderDstTwei, 0);
//             await reserve.trade(tokenAdd, orderDstTwei, ethAddress, user1, rate, false, {from:network});

//             expectedTotalWeiInOrders = expectedTotalWeiInOrders.sub(orderSrcAmountWei.add(new BN(300)));
//             rxOrdersWei = await reserve.makerTotalOrdersWei(maker1);
//             Helper.assertEqual(rxOrdersWei, expectedTotalWeiInOrders);

//             expectedStakedKnc = await reserve.calcKncStake(expectedTotalWeiInOrders);
//             rxKncStakes = await reserve.makerRequiredKncStake(maker1);
//             Helper.assertEqual(rxKncStakes, expectedStakedKnc);

//             let burnedAmount = await reserve.calcBurnAmount(orderSrcAmountWei.add(new BN(300)));
//             expectedFreeKnc = kncTweiDepositAmount.sub(expectedStakedKnc.add(burnedAmount));
//             rxFreeKnc = await reserve.makerUnlockedKnc(maker1);
//             Helper.assertEqual(expectedFreeKnc, rxFreeKnc);

//             //take half order
//             await token.transfer(network, orderDstTwei.div(new BN(2)));
//             await token.approve(reserve.address, orderDstTwei.div(new BN(2)), {from: network})
//             rate = await reserve.getConversionRate(tokenAdd, ethAddress, orderDstTwei.div(new BN(2)), 0);
//             await reserve.trade(tokenAdd, orderDstTwei.div(new BN(2)), ethAddress, user1, rate, false, {from:network});

//             expectedTotalWeiInOrders = expectedTotalWeiInOrders.sub(orderSrcAmountWei.div(new BN(2)).add(new BN(100)));
//             rxOrdersWei = await reserve.makerTotalOrdersWei(maker1);
//             Helper.assertEqual(rxOrdersWei, expectedTotalWeiInOrders);

//             expectedStakedKnc = await reserve.calcKncStake(expectedTotalWeiInOrders);
//             rxKncStakes = await reserve.makerRequiredKncStake(maker1);
//             Helper.assertEqual(rxKncStakes, expectedStakedKnc);

//             burnAmount = await reserve.calcBurnAmount(orderSrcAmountWei.div(new BN(2)).add(new BN(100)));
//             expectedFreeKnc = expectedFreeKnc.add(burnAmount.mul(burnToStakeFactor.sub(new BN(1))));
//             rxFreeKnc = await reserve.makerUnlockedKnc(maker1);
//             Helper.assertEqual(expectedFreeKnc, rxFreeKnc);
//         });

//         it("maker add sell token orders. take orders. see total orders wei and knc stakes updated.", async () => {
//             let kncTweiDepositAmount = PRECISION.mul(new BN(600));
//             let tokenTweiDepositAmount = PRECISION.mul(new BN(16)).add(new BN(700));
//             await makerDeposit(maker1, 0, tokenTweiDepositAmount, kncTweiDepositAmount);

//             let srcAmountTwei = token18Dec.mul(new BN(3));
//             let dstWei = PRECISION.mul(new BN(2));

//             //add 3 orders
//             await reserve.submitTokenToEthOrder(srcAmountTwei.add(new BN(100)), dstWei, {from: maker1});
//             await reserve.submitTokenToEthOrder(srcAmountTwei.add(new BN(200)), dstWei, {from: maker1});
//             await reserve.submitTokenToEthOrder(srcAmountTwei.add(new BN(300)), dstWei, {from: maker1});

//             let expectedTotalWeiInOrders = dstWei.mul(new BN(3));
//             rxOrdersWei = await reserve.makerTotalOrdersWei(maker1);
//             Helper.assertEqual(rxOrdersWei, expectedTotalWeiInOrders);

//             let expectedStakedKnc = await reserve.calcKncStake(expectedTotalWeiInOrders);
//             rxKncStakes = await reserve.makerRequiredKncStake(maker1);
//             Helper.assertEqual(rxKncStakes, expectedStakedKnc);

//             expectedFreeKnc = kncTweiDepositAmount.sub(expectedStakedKnc);
//             rxFreeKnc = await reserve.makerUnlockedKnc(maker1);
//             Helper.assertEqual(expectedFreeKnc, rxFreeKnc);

//             //take one full order
//             let rate = await reserve.getConversionRate(ethAddress, tokenAdd, dstWei, 0);
//             await reserve.trade(ethAddress, dstWei, tokenAdd, user1, rate, false, {from:network, value: dstWei});

//             expectedTotalWeiInOrders = expectedTotalWeiInOrders.sub(dstWei);
//             rxOrdersWei = await reserve.makerTotalOrdersWei(maker1);
//             Helper.assertEqual(rxOrdersWei, expectedTotalWeiInOrders);

//             expectedStakedKnc = await reserve.calcKncStake(expectedTotalWeiInOrders);
//             rxKncStakes = await reserve.makerRequiredKncStake(maker1);
//             Helper.assertEqual(rxKncStakes, expectedStakedKnc);

//             let burnAmount = await reserve.calcBurnAmount(dstWei);
//             expectedFreeKnc = kncTweiDepositAmount.sub(expectedStakedKnc.add(burnAmount));
//             rxFreeKnc = await reserve.makerUnlockedKnc(maker1);
//             Helper.assertEqual(expectedFreeKnc, rxFreeKnc);

//             //take half order
//             rate = await reserve.getConversionRate(ethAddress, tokenAdd, dstWei.div(new BN(2)), 0);
//             await reserve.trade(ethAddress, dstWei.div(new BN(2)), tokenAdd, user1, rate, false, {from:network, value: dstWei.div(new BN(2))});

//             expectedTotalWeiInOrders = expectedTotalWeiInOrders.sub(dstWei.div(new BN(2)));
//             rxOrdersWei = await reserve.makerTotalOrdersWei(maker1);
//             Helper.assertEqual(rxOrdersWei, expectedTotalWeiInOrders);

//             expectedStakedKnc = await reserve.calcKncStake(expectedTotalWeiInOrders);
//             rxKncStakes = await reserve.makerRequiredKncStake(maker1);
//             Helper.assertEqual(rxKncStakes, expectedStakedKnc);

//             burnAmount = await reserve.calcBurnAmount(dstWei.div(new BN(2)));
//             expectedFreeKnc = expectedFreeKnc.add(burnAmount.mul(burnToStakeFactor.sub(new BN(1))));
//             rxFreeKnc = await reserve.makerUnlockedKnc(maker1);
//             Helper.assertEqual(expectedFreeKnc, rxFreeKnc);
//         });

//         it("maker add sell token order. cancel order. verify order removed and funds & knc updated.", async () => {
//             let kncTweiDepositAmount = PRECISION.mul(new BN(600));
//             let tokenWeiDepositAmount = new BN(String(PRECISION * 11.1));
//             await makerDeposit(maker1, 0, tokenWeiDepositAmount, kncTweiDepositAmount);

//             let orderSrcAmountTwei = token18Dec.mul(new BN(9));
//             let orderDstWei = PRECISION.mul(new BN(2));

//             //add order
//             let rc = await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei, {from: maker1});

//             let orderList = await reserve.getTokenToEthOrderList();
//             Helper.assertEqual(orderList.length, 1);
//             //see funds and knc stakes
//             let expectedFreeTwei = tokenWeiDepositAmount.sub(orderSrcAmountTwei);
//             let rxFreeTwei = await reserve.makerFunds(maker1, tokenAdd);
//             Helper.assertEqual(rxFreeTwei, expectedFreeTwei );


//             rc = await reserve.cancelTokenToEthOrder(orderList[0], {from: maker1});

//             orderList = await reserve.getTokenToEthOrderList();
//             Helper.assertEqual(orderList.length, 0);
//             //see all values back to start state
//             rxFreeTwei = await reserve.makerFunds(maker1, tokenAdd);
//             Helper.assertEqual(rxFreeTwei, tokenWeiDepositAmount );
//             let freeKnc = await reserve.makerUnlockedKnc(maker1);
//             Helper.assertEqual(freeKnc, kncTweiDepositAmount);
//             let stakedKnc =  await reserve.makerRequiredKncStake(maker1);
//             Helper.assertEqual(stakedKnc, 0);
//         });

//         it("maker add sell order. update to smaller amount, see funds and knc stakes updated", async() => {
//             let kncTweiDepositAmount = PRECISION.mul(new BN(600));
//             let tokenWeiDepositAmount = new BN(String(PRECISION * 11.1));
//             await makerDeposit(maker1, 0, tokenWeiDepositAmount, kncTweiDepositAmount);

//             let orderSrcAmountTwei = token18Dec.mul(new BN(9));
//             let orderDstWei = PRECISION.mul(new BN(2));

//             let freeTwei = await reserve.makerFunds(maker1, tokenAdd);
//             Helper.assertEqual(freeTwei, tokenWeiDepositAmount);
//             //add order
//             let rc = await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei, {from: maker1});

//             let orderId = rc.logs[0].args.orderId;

//             freeTwei = await reserve.makerFunds(maker1, tokenAdd);
//             Helper.assertEqual(freeTwei, tokenWeiDepositAmount.sub(orderSrcAmountTwei));

//             // update source amount
//             let updatedSource = PRECISION.mul(new BN(7));
//             let updateDest = orderDstWei.add(new BN(7500));
//             rc = await reserve.updateTokenToEthOrder(orderId, updatedSource, updateDest, {from: maker1});
//             freeTwei = await reserve.makerFunds(maker1, tokenAdd);
//             Helper.assertEqual(freeTwei, tokenWeiDepositAmount.sub(updatedSource));

//             let expectedStake = await reserve.calcKncStake(updateDest);
//             let actualStake = await reserve.makerRequiredKncStake(maker1);
//             Helper.assertEqual(expectedStake, actualStake);
//             let freeKnc = await reserve.makerUnlockedKnc(maker1);
//             Helper.assertEqual(freeKnc, kncTweiDepositAmount.sub(expectedStake));

//             let orderList = await reserve.getTokenToEthOrderList();
//             Helper.assertEqual(orderList.length, 1);
//         });

//         it("maker add buy token order. update to smaller amount, see funds & knc updated.", async () => {
//             let ethWeiDepositAmount = PRECISION.mul(new BN(2)).add(new BN(700));
//             let kncTweiDepositAmount = PRECISION.mul(new BN(600));
//             await makerDeposit(maker1, ethWeiDepositAmount, 0, kncTweiDepositAmount);

//             let srcAmountWei = PRECISION.mul(new BN(2)).add(new BN(300));
//             let orderDstTwei = token18Dec.mul(new BN(9));

//             //check maker free token funds
//             let rxFreeWei = await reserve.makerFunds(maker1, ethAddress);
//             Helper.assertEqual(rxFreeWei, ethWeiDepositAmount );

//             //add order
//             let rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
//             let orderId = rc.logs[0].args.orderId;

//             let expectedFreeWei = ethWeiDepositAmount.sub(srcAmountWei);
//             rxFreeWei = await reserve.makerFunds(maker1, ethAddress);
//             Helper.assertEqual(rxFreeWei, expectedFreeWei );

//             // update source amount
//             let updatedSource = PRECISION.mul(new BN(2)).add(new BN(100));
//             rc = await reserve.updateEthToTokenOrder(orderId, updatedSource, orderDstTwei, {from: maker1});

//             rxFreeWei = await reserve.makerFunds(maker1, ethAddress);
//             Helper.assertEqual(rxFreeWei, ethWeiDepositAmount.sub(updatedSource));

//             let expectedStake = await reserve.calcKncStake(updatedSource);
//             let actualStake = await reserve.makerRequiredKncStake(maker1);
//             Helper.assertEqual(expectedStake, actualStake);
//             let freeKnc = await reserve.makerUnlockedKnc(maker1);
//             Helper.assertEqual(freeKnc, kncTweiDepositAmount.sub(expectedStake));
//         });

//         it("maker add sell order. update to bigger amount, see funds and knc stakes updated", async() => {
//             let kncTweiDepositAmount = PRECISION.mul(new BN(600));
//             let tokenWeiDepositAmount = new BN(String(PRECISION * 11.1));
//             await makerDeposit(maker1, 0, tokenWeiDepositAmount, kncTweiDepositAmount);

//             let orderSrcAmountTwei = token18Dec.mul(new BN(9));
//             let orderDstWei = PRECISION.mul(new BN(2));

//             let freeTwei = await reserve.makerFunds(maker1, tokenAdd);
//             Helper.assertEqual(freeTwei, tokenWeiDepositAmount);
//             //add order
//             let rc = await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei, {from: maker1});

//             let orderId = rc.logs[0].args.orderId;

//             freeTwei = await reserve.makerFunds(maker1, tokenAdd);
//             Helper.assertEqual(freeTwei, tokenWeiDepositAmount.sub(orderSrcAmountTwei));

//             // update source amount
//             let updatedSource = PRECISION.mul(new BN(10));
//             let updateDest = orderDstWei.add(new BN(7500));
//             rc = await reserve.updateTokenToEthOrder(orderId, updatedSource, updateDest, {from: maker1});
//             freeTwei = await reserve.makerFunds(maker1, tokenAdd);
//             Helper.assertEqual(freeTwei, tokenWeiDepositAmount.sub(updatedSource));

//             let expectedStake = await reserve.calcKncStake(updateDest);
//             let actualStake = await reserve.makerRequiredKncStake(maker1);
//             Helper.assertEqual(expectedStake, actualStake);
//             let freeKnc = await reserve.makerUnlockedKnc(maker1);
//             Helper.assertEqual(freeKnc, kncTweiDepositAmount.sub(expectedStake));

//             let orderList = await reserve.getTokenToEthOrderList();
//             Helper.assertEqual(orderList.length, 1);
//         });

//         it("maker add buy token order. update to bigger amount, see funds & knc updated.", async () => {
//             let ethWeiDepositAmount = PRECISION.mul(new BN(2)).add(new BN(700));
//             let kncTweiDepositAmount = PRECISION.mul(new BN(600));
//             await makerDeposit(maker1, ethWeiDepositAmount, 0, kncTweiDepositAmount);

//             let srcAmountWei = PRECISION.mul(new BN(2));
//             let orderDstTwei = token18Dec.mul(new BN(9));

//             //check maker free token funds
//             let rxFreeWei = await reserve.makerFunds(maker1, ethAddress);
//             Helper.assertEqual(rxFreeWei, ethWeiDepositAmount );

//             //add order
//             let rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
//             let orderId = rc.logs[0].args.orderId;

//             let expectedFreeWei = ethWeiDepositAmount.sub(srcAmountWei);
//             rxFreeWei = await reserve.makerFunds(maker1, ethAddress);
//             Helper.assertEqual(rxFreeWei, expectedFreeWei );

//             // update source amount
//             let updatedSource = PRECISION.mul(new BN(2)).add(new BN(300));
//             rc = await reserve.updateEthToTokenOrder(orderId, updatedSource, orderDstTwei, {from: maker1});

//             rxFreeWei = await reserve.makerFunds(maker1, ethAddress);
//             Helper.assertEqual(rxFreeWei, ethWeiDepositAmount.sub(updatedSource));

//             let expectedStake = await reserve.calcKncStake(updatedSource);
//             let actualStake = await reserve.makerRequiredKncStake(maker1);
//             Helper.assertEqual(expectedStake, actualStake);
//             let freeKnc = await reserve.makerUnlockedKnc(maker1);
//             Helper.assertEqual(freeKnc, kncTweiDepositAmount.sub(expectedStake));
//         });
//     })

//     describe("trade (add orders and take)", function() {
//         it("maker add sell order. take using trade. see amounts updated in contracts. see funds transferred.", async() => {
//             let tokenWeiDepositAmount = token18Dec.mul(new BN(10));
//             let kncTweiDepositAmount = PRECISION.mul(new BN(600));
//             let ethWeiDepositAmount = PRECISION.mul(new BN(0));
//             await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

//             let makerTokenBalance = await reserve.makerFunds(maker1, tokenAdd);
//             Helper.assertEqual(makerTokenBalance, tokenWeiDepositAmount);
//             let orderSrcAmountTwei = token18Dec.mul(new BN(9));
//             let orderDstWei = PRECISION.mul(new BN(2)).add(new BN(2000));

//             let rc = await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei, {from: maker1});

//             makerTokenBalance = await reserve.makerFunds(maker1, tokenAdd);
//             Helper.assertEqual(makerTokenBalance, tokenWeiDepositAmount.sub(orderSrcAmountTwei));

//             let list = await reserve.getTokenToEthOrderList();
//             Helper.assertEqual(list.length, 1);

//             let user1StartTokenBalance = await token.balanceOf(user1);
//             let rate = await reserve.getConversionRate(ethAddress, tokenAdd, orderDstWei, 0);
//             rc = await reserve.trade(ethAddress, orderDstWei, tokenAdd, user1, rate, false, {from:network, value: orderDstWei});
//             list = await reserve.getTokenToEthOrderList();
//             Helper.assertEqual(list.length, 0);
//             makerTokenBalance = await reserve.makerFunds(maker1, tokenAdd);
//             Helper.assertEqual(makerTokenBalance, tokenWeiDepositAmount.sub(orderSrcAmountTwei));

//             let makerEthBalance = await reserve.makerFunds(maker1, ethAddress);
//             Helper.assertEqual(makerEthBalance, orderDstWei);
//             let expectedBalance = user1StartTokenBalance.add(orderSrcAmountTwei);
//             let user1TokenBalanceAfter = await token.balanceOf(user1);
//             Helper.assertEqual(expectedBalance, user1TokenBalanceAfter);
//         })

//         it("maker - make 5 buy orders and take in one trade. see gas for take.", async () => {
//             const tokenWeiDepositAmount = token18Dec.mul(new BN(0));
//             const kncTweiDepositAmount = PRECISION.mul(new BN(600));
//             const ethWeiDepositAmount = PRECISION.mul(new BN(10)).add(new BN(30000));
//             await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

//             orderSrc = PRECISION.mul(new BN(2));
//             orderDst = PRECISION.mul(new BN(6));

//             makeOrdersSrcAmounts = [orderSrc, orderSrc, orderSrc, orderSrc, orderSrc];
//             makeOrdersDstAmount = [orderDst, orderDst.add(new BN(200)), orderDst.add(new BN(500)), orderDst.add(new BN(900)), orderDst.add(new BN(1300))];

//             let totalGasMaker1 = new BN(0);
//             let totalPayValue = new BN(0);

//             for (let i = 0; i < makeOrdersSrcAmounts.length; i++) {
//                 let rc = await reserve.submitEthToTokenOrder(makeOrdersSrcAmounts[i], makeOrdersDstAmount[i], {from: maker1});
//                 totalGasMaker1 = totalGasMaker1.add(new BN(rc.receipt.gasUsed));
//                 totalPayValue = totalPayValue.add(makeOrdersDstAmount[i]);
//             }

//             await token.transfer(network, totalPayValue);
//             await token.approve(reserve.address, totalPayValue, {from: network})
//             let rate = await reserve.getConversionRate(tokenAdd, ethAddress, totalPayValue, 0);
//             let rc = await reserve.trade(tokenAdd, totalPayValue, ethAddress, user1, rate, false, {from:network});

//             let maxExpectedGas = new BN(340000);
//             Helper.assertLesser(rc.receipt.gasUsed, maxExpectedGas, "take 5 orders trade = " + rc.receipt.gasUsed + " > " + maxExpectedGas);
//         });

//         it("calc expected stake and calc burn amount. validate match", async () => {
//             baseKncPerEthRatePrecision = await reserve.kncPerEthBaseRatePrecision();

//             let weiValue = PRECISION.mul(new BN(2));
//             let feeBps = await reserve.makerBurnFeeBps();

//             let expectedBurn = weiValue.mul(feeBps).mul(baseKncPerEthRatePrecision).div(PRECISION.mul(new BN(BPS)));

//             let calcBurn = await reserve.calcBurnAmount(weiValue);
//             Helper.assertEqual(expectedBurn, calcBurn);

//             let calcExpectedStake = expectedBurn.mul(burnToStakeFactor);
//             let calcStake = await reserve.calcKncStake(weiValue);
//             Helper.assertEqual(calcStake, calcExpectedStake);
//             Helper.assertLesser(calcBurn, calcStake);
//         });

//         it("maker add buy order. user takes order. see taken order removed as expected.", async () => {
//             let tokenWeiDepositAmount = token18Dec.mul(new BN(0));
//             let kncTweiDepositAmount = PRECISION.mul(new BN(600));
//             let ethWeiDepositAmount = PRECISION.mul(new BN(2)).add(new BN(30000));
//             await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

//             let srcAmountWei = PRECISION.mul(new BN(2));
//             let orderDstTwei = token18Dec.mul(new BN(9));

//             // add order
//             let rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});

//             let list = await reserve.getEthToTokenOrderList();
//             Helper.assertEqual(list.length, 1);

//             //take order
//     //  function trade(ERC20 srcToken, uint srcAmount, ERC20 destToken, address destAddress, uint conversionRate, bool validate)

//             await token.transfer(network, orderDstTwei);
//             await token.approve(reserve.address, orderDstTwei, {from: network})
//             let rate = await reserve.getConversionRate(tokenAdd, ethAddress, orderDstTwei, 0);
//             rc = await reserve.trade(tokenAdd, orderDstTwei, ethAddress, user1, rate, false, {from:network});

//             let maxExpectedGas = 140000;
//             Helper.assertLesser(rc.receipt.gasUsed, maxExpectedGas, "Gas for single trade should have been below: " + maxExpectedGas);

//             list = await reserve.getEthToTokenOrderList();
//             Helper.assertEqual(list.length, 0);

//             rate = await reserve.getConversionRate(token.address, ethAddress, PRECISION, 0);
//             Helper.assertEqual(rate, 0);
//         });

//         it("maker add a few buy orders. user takes full orders. see user gets traded wei. maker gets tokens.", async () => {
//             let tokenWeiDepositAmount = token18Dec.mul(new BN(0));
//             let kncTweiDepositAmount = PRECISION.mul(new BN(600));
//             let ethWeiDepositAmount = PRECISION.mul(new BN(6)).add(new BN(30000));
//             await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

//             let srcAmountWei = PRECISION.mul(new BN(2));
//             let orderDstTwei = token18Dec.mul(new BN(9));

//             // add order
//             let rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
//             rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei.add(new BN(1000)), {from: maker1});
//             rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei.add(new BN(2000)), {from: maker1});

//             //take all orders
//     //  function trade(ERC20 srcToken, uint srcAmount, ERC20 destToken, address destAddress, uint conversionRate, bool validate)

//             //maker eth balance before. (should be 3000 - deposited amount that wasn't used for above orders)
//             let balance = await reserve.makerFunds(maker1, ethAddress);
//             Helper.assertEqual(balance, new BN(30000));
//             balance = await reserve.makerFunds(maker1, tokenAdd);
//             Helper.assertEqual(balance, 0);

//             let userWeiBefore = new BN(await Helper.getBalancePromise(user1));

//             let EthOrderValue = srcAmountWei;
//             let totalPayValue = orderDstTwei.mul(new BN(3)).add(new BN(3000));

//             let userTokBalanceBefore = await token.balanceOf(user1);

//             await token.transfer(network, totalPayValue);
//             await token.approve(reserve.address, totalPayValue, {from: network})
//             let rate = await reserve.getConversionRate(tokenAdd, ethAddress, totalPayValue, 0);
//             rc = await reserve.trade(tokenAdd, totalPayValue, ethAddress, user1, rate, false, {from:network});

//             //check maker balance
//             balance = await reserve.makerFunds(maker1, tokenAdd);
//             Helper.assertEqual(balance, totalPayValue);

//             //user1 balance
//             let userBalanceAfter = await token.balanceOf(user1);
//             Helper.assertEqual(userBalanceAfter, userTokBalanceBefore);

//             rate = await reserve.getConversionRate(token.address, ethAddress, PRECISION, 0);
//             Helper.assertEqual(rate, 0);

//             list = await reserve.getEthToTokenOrderList();
//             Helper.assertEqual(list.length, 0);
//         });

//         it("buy orders print gas for taking 0.5 order 1.5 order 2.5 orders. remaining removed", async () => {
//             let tokenWeiDepositAmount = token18Dec.mul(new BN(0));
//             let kncTweiDepositAmount = PRECISION.mul(new BN(700));
//             let ethWeiDepositAmount = PRECISION.mul(new BN(12)).add(new BN(30000));
//             await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

//             let srcAmountWei = PRECISION.mul(new BN(2));
//             let orderDstTwei = token18Dec.mul(new BN(9));

//             // add order
//             let rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
//             rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
//             rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
//             rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
//             rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
//             rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});

//             //trade
//             let payValueTwei = orderDstTwei.div(new BN(2)).add(new BN(6000));
//             await token.transfer(network, payValueTwei);
//             await token.approve(reserve.address, payValueTwei, {from: network})
//             let rate = await reserve.getConversionRate(tokenAdd, ethAddress, payValueTwei, 0);
//             rc = await reserve.trade(tokenAdd, payValueTwei, ethAddress, user1, rate, false, {from:network});

//             //trade
//             payValueTwei = payValueTwei.add(orderDstTwei);
//             await token.transfer(network, payValueTwei);
//             await token.approve(reserve.address, payValueTwei, {from: network})
//             rate = await reserve.getConversionRate(tokenAdd, ethAddress, payValueTwei, 0);
//             rc = await reserve.trade(tokenAdd, payValueTwei, ethAddress, user1, rate, false, {from:network});

//             //trade
//             payValueTwei = payValueTwei.add(orderDstTwei);
//             await token.transfer(network, payValueTwei);
//             await token.approve(reserve.address, payValueTwei, {from: network})
//             rate = await reserve.getConversionRate(tokenAdd, ethAddress, payValueTwei, 0);
//             rc = await reserve.trade(tokenAdd, payValueTwei, ethAddress, user1, rate, false, {from:network});
//         });

//         it("buy orders print gas for taking 0.5 order 1.5 order 2.5 orders. remaining not removed", async () => {
//             let tokenWeiDepositAmount = token18Dec.mul(new BN(0));
//             let kncTweiDepositAmount = PRECISION.mul(new BN(700));
//             let ethWeiDepositAmount = PRECISION.mul(new BN(12)).add(new BN(30000));
//             await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

//             let srcAmountWei = PRECISION.mul(new BN(2));;
//             let orderDstTwei = token18Dec.mul(new BN(9));

//             // add order
//             let rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
//             rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
//             rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
//             rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
//             rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
//             rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});

//             //trade
//             let payValueTwei = orderDstTwei.div(new BN(2)).sub(new BN(6000));
//             await token.transfer(network, payValueTwei.add(orderDstTwei.div(new BN(2))));
//             await token.approve(reserve.address, payValueTwei.add(orderDstTwei.div(new BN(2))), {from: network})
//             let rate = await reserve.getConversionRate(tokenAdd, ethAddress, payValueTwei, 0);
//             rc = await reserve.trade(tokenAdd, payValueTwei, ethAddress, user1, rate, false, {from:network});
//             rate = await reserve.getConversionRate(tokenAdd, ethAddress, orderDstTwei.div(new BN(2)), 0);
//             await reserve.trade(tokenAdd, orderDstTwei.div(new BN(2)), ethAddress, user1, rate, false, {from:network});

//             //trade
//             payValueTwei = payValueTwei.add(orderDstTwei);
//             await token.transfer(network, payValueTwei.add(orderDstTwei.div(new BN(2))));
//             await token.approve(reserve.address, payValueTwei.add(orderDstTwei.div(new BN(2))), {from: network})
//             rate = await reserve.getConversionRate(tokenAdd, ethAddress, payValueTwei, 0);
//             rc = await reserve.trade(tokenAdd, payValueTwei, ethAddress, user1, rate, false, {from:network});
//             rate = await reserve.getConversionRate(tokenAdd, ethAddress, orderDstTwei.div(new BN(2)), 0);
//             await reserve.trade(tokenAdd, orderDstTwei.div(new BN(2)), ethAddress, user1, rate, false, {from:network});

//             //trade
//             payValueTwei = payValueTwei.add(orderDstTwei);
//             await token.transfer(network, payValueTwei.add(orderDstTwei.div(new BN(2))));
//             await token.approve(reserve.address, payValueTwei.add(orderDstTwei.div(new BN(2))), {from: network})
//             rc = await reserve.trade(tokenAdd, payValueTwei, ethAddress, user1, lowRate, false, {from:network});
//             await reserve.trade(tokenAdd, orderDstTwei.div(new BN(2)), ethAddress, user1, lowRate, false, {from:network});
//         });

//         it("test over flows for get rate on partial order. tests overflow in dest amount calculation", async () => {
//             let tokenWeiDepositAmount = token18Dec.mul(new BN(0));
//             let kncTweiDepositAmount = PRECISION.mul(new BN(700));
//             let ethWeiDepositAmount = PRECISION.mul(new BN(10));
//             await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

//             let srcAmountWei = PRECISION.mul(new BN(10));
//             let orderDstTwei = token18Dec.mul(new BN(1000));

//             // add order
//             let rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});

//             //check rate
//             //all amounts should return same rate
//             let tradeAmounts = [PRECISION.mul(new BN(40)), PRECISION.mul(new BN(110)), PRECISION.mul(new BN(530)), PRECISION.mul(new BN(900))];
//             let rate1 = await reserve.getConversionRate(tokenAdd, ethAddress, tradeAmounts[0], 0);
//             let rate2 = await reserve.getConversionRate(tokenAdd, ethAddress, tradeAmounts[1], 0);
//             let rate3 = await reserve.getConversionRate(tokenAdd, ethAddress, tradeAmounts[2], 0);
//             let rate4 = await reserve.getConversionRate(tokenAdd, ethAddress, tradeAmounts[3], 0);

//             Helper.assertEqual(rate1, rate2);
//             Helper.assertEqual(rate1, rate3);
//             Helper.assertEqual(rate1, rate4);
//         });

//         it("test over flows in trade partial order. use MAX_QTY i.e. overflow in dest amount calculation", async () => {
//             let tokenWeiDepositAmount = MAX_QTY.div(new BN(4));
//             let kncTweiDepositAmount = MAX_QTY.sub(new BN(1));
//             let ethWeiDepositAmount = new BN(0);

//             await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);
//             await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);
//             await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);
//             await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);
//             await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

//             let valueWei = MAX_QTY.sub(new BN(1));
//             let valueTwei = MAX_QTY.sub(new BN(1));

//             // add order
//             let rc = await reserve.submitTokenToEthOrder(valueTwei, valueWei, {from: maker1});

//             let tradeAmounts = [PRECISION.mul(new BN(2)), MAX_QTY.div(new BN(4)), MAX_QTY.div(new BN(2)), MAX_QTY.sub(new BN(1))];
//             let rate1 = await reserve.getConversionRate(ethAddress, tokenAdd, tradeAmounts[0], 0);
//             let rate2 = await reserve.getConversionRate(ethAddress, tokenAdd, tradeAmounts[1], 0);
//             let rate3 = await reserve.getConversionRate(ethAddress, tokenAdd, tradeAmounts[2], 0);
//             let rate4 = await reserve.getConversionRate(ethAddress, tokenAdd, tradeAmounts[3], 0);

//             Helper.assertEqual(rate1, rate2);
//             Helper.assertEqual(rate1, rate3);
//             Helper.assertEqual(rate1, rate4);
//         });

//         it("test over flows in trade partial order. use MAX_QTY i.e. overflow in dest amount calculation", async () => {
//             let tokenWeiDepositAmount = MAX_QTY.div(new BN(4));
//             let kncTweiDepositAmount = MAX_QTY.sub(new BN(1));
//             let ethWeiDepositAmount = new BN(0);

//             await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);
//             await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);
//             await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);
//             await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);
//             await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

//             let valueTwei = MAX_QTY.sub(new BN(1));

//             let orderDstWei = Helper.calcSrcQty(valueTwei, ethDecimals, tokenDecimals, MAX_RATE);

//             // add order
//             let rc = await reserve.submitTokenToEthOrder(valueTwei, orderDstWei, {from: maker1});

//             let tradeAmounts = [new BN(3), new BN(String(5 * 10 ** 17)), orderDstWei.div(new BN(2)), orderDstWei.sub(new BN(1))];
//             let rate1 = (await reserve.getConversionRate(ethAddress, tokenAdd, tradeAmounts[0], 0));
//             let rate2 = (await reserve.getConversionRate(ethAddress, tokenAdd, tradeAmounts[1], 0));
            
//             //rate1 has big rounding error since src amount is very small.
//             Helper.assertEqual(rate1.div(PRECISION), rate2.div(PRECISION));

//             let rate3 = (await reserve.getConversionRate(ethAddress, tokenAdd, tradeAmounts[2], 0));
//             Helper.assertEqual(rate2.div(new BN(10)), rate3.div(new BN(10)));

//             let rate4 = (await reserve.getConversionRate(ethAddress, tokenAdd, tradeAmounts[3], 0));
//             Helper.assertEqual(rate3, rate4);
//         });

//         it("test over flows for get rate on partial order use MAX_QTY.", async () => {
//             let tokenWeiDepositAmount = token18Dec.mul(new BN(0));
//             let kncTweiDepositAmount = PRECISION.mul(new BN(700));
//             let ethWeiDepositAmount = PRECISION.mul(new BN(10));
//             await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

//             let srcAmountWei = PRECISION.mul(new BN(10));
//             let orderDstTwei = token18Dec.mul(new BN(1000));

//             // add order
//             let rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});

//             // check rate
//             //all amounts should return same rate
//             let tradeAmounts = [PRECISION.mul(new BN(40)), PRECISION.mul(new BN(110)), PRECISION.mul(new BN(530)), PRECISION.mul(new BN(900))];
//             let rate1 = await reserve.getConversionRate(tokenAdd, ethAddress, tradeAmounts[0], 0);
//             let rate2 = await reserve.getConversionRate(tokenAdd, ethAddress, tradeAmounts[1], 0);
//             let rate3 = await reserve.getConversionRate(tokenAdd, ethAddress, tradeAmounts[2], 0);
//             let rate4 = await reserve.getConversionRate(tokenAdd, ethAddress, tradeAmounts[3], 0);

//             Helper.assertEqual(rate1, rate2);
//             Helper.assertEqual(rate1, rate3);
//             Helper.assertEqual(rate1, rate4);
//         });

//         it("test over flows in trade partial order. i.e. overflow in dest amount calculation", async () => {
//             let tokenWeiDepositAmount = token18Dec.mul(new BN(0));
//             let kncTweiDepositAmount = PRECISION.mul(new BN(700));
//             let ethWeiDepositAmount = PRECISION.mul(new BN(20));
//             await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

//             let srcAmountWei = PRECISION.mul(new BN(20));
//             let orderDstTwei = token18Dec.mul(new BN(2000));

//             // add order
//             let rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});

//             let tradeAmount = PRECISION.mul(new BN(400));
//             await token.transfer(network, tradeAmount);
//             await token.approve(reserve.address, tradeAmount, {from: network})
//             rc = await reserve.trade(tokenAdd, tradeAmount, ethAddress, user1, lowRate, false, {from:network});
//             Helper.assertEqual(rc.logs[1].args.srcAmount, tradeAmount);
//             Helper.assertEqual(rc.logs[1].args.dstAmount, tradeAmount.div(new BN(100)));

//             tradeAmount = PRECISION.mul(new BN(1300));
//             await token.transfer(network, tradeAmount);
//             await token.approve(reserve.address, tradeAmount, {from: network})
//             rc = await reserve.trade(tokenAdd, tradeAmount, ethAddress, user1, lowRate, false, {from:network});
//             Helper.assertEqual(rc.logs[1].args.srcAmount, tradeAmount);
//             Helper.assertEqual(rc.logs[1].args.dstAmount, tradeAmount.div(new BN(100)));
//         });

//         it("maker add buy order. user takes partial. remaining order stays in book.", async () => {
//             let tokenWeiDepositAmount = token18Dec.mul(new BN(0));
//             let kncTweiDepositAmount = PRECISION.mul(new BN(700));
//             let ethWeiDepositAmount = PRECISION.mul(new BN(2)).add(new BN(30000));
//             await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

//             let srcAmountWei = PRECISION.mul(new BN(2));
//             let orderDstTwei = token18Dec.mul(new BN(7));

//             // add order
//             let rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});

//             let list = await reserve.getEthToTokenOrderList();
//             Helper.assertEqual(list.length, 1);

//             //take order
//     //  function trade(ERC20 srcToken, uint srcAmount, ERC20 destToken, address destAddress, uint conversionRate, bool validate)
//             let takeAmount = orderDstTwei.div(new BN(2)).sub(new BN(2000));

//             await token.transfer(network, takeAmount);
//             await token.approve(reserve.address, takeAmount, {from: network})
//             rc = await reserve.trade(tokenAdd, takeAmount, ethAddress, user1, lowRate, false, {from:network});

//             list = await reserve.getEthToTokenOrderList();
//             Helper.assertEqual(list.length, 1);

//             let balance = await reserve.makerFunds(maker1, ethAddress);
//             Helper.assertEqual(balance, ethWeiDepositAmount.sub(srcAmountWei));

//             balance = await reserve.makerFunds(maker1, tokenAdd);
//             Helper.assertEqual(balance, takeAmount);
//         });

//         it("maker add buy order. user takes partial. remaining order removed.", async () => {
//             let tokenWeiDepositAmount = token18Dec.mul(new BN(0));
//             let kncTweiDepositAmount = PRECISION.mul(new BN(600));
//             let ethWeiDepositAmount = PRECISION.mul(new BN(2)).add(new BN(30000));
//             await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

//             let srcAmountWei = PRECISION.mul(new BN(2));
//             let orderDstTwei = token18Dec.mul(new BN(7));

//             // add order
//             let rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});

//             let list = await reserve.getEthToTokenOrderList();
//             Helper.assertEqual(list.length, 1);

//             //take order
//     //  function trade(ERC20 srcToken, uint srcAmount, ERC20 destToken, address destAddress, uint conversionRate, bool validate)
//             let tokenPayAmount = orderDstTwei.div(new BN(2)).add(new BN(10000));

//             await token.transfer(network, tokenPayAmount);
//             await token.approve(reserve.address, tokenPayAmount, {from: network})
//             rc = await reserve.trade(tokenAdd, tokenPayAmount, ethAddress, user1, lowRate, false, {from:network});

//             list = await reserve.getEthToTokenOrderList();
//             Helper.assertEqual(list.length, 0);

//             let balance = await reserve.makerFunds(maker1, ethAddress);
//             let expectedETHSentToUser = srcAmountWei.mul(tokenPayAmount).div(orderDstTwei);
//             //all eth not sended to taker should be released bach to maker funds.
//             Helper.assertEqual(balance, ethWeiDepositAmount.sub(expectedETHSentToUser));

//             balance = await reserve.makerFunds(maker1, tokenAdd);
//             Helper.assertEqual(balance, tokenPayAmount);
//         });

//         it("maker add a few sell orders. user takes orders. see taken orders are removed. user gets token. maker get eth.", async () => {
//             let tokenWeiDepositAmount = token18Dec.mul(new BN(70));
//             let kncTweiDepositAmount = PRECISION.mul(new BN(600));
//             let ethWeiDepositAmount = PRECISION.mul(new BN(0));
//             await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

//             let orderSrcAmountTwei = token18Dec.mul(new BN(6));
//             let orderDstWei = PRECISION.mul(new BN(2));

//             //add order
//             let rc = await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei, {from: maker1});
//                 rc = await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei.add(new BN(400)), {from: maker1});
//                 rc = await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei.add(new BN(200)), {from: maker1});

//             let totalPayValueWei = orderDstWei.mul(new BN(3)).add(new BN(600));
//             let userInitialTokBalance = await token.balanceOf(user1);

//             //trade
//             rc = await reserve.trade(ethAddress, totalPayValueWei, tokenAdd, user1, lowRate, false, {from:network, value: totalPayValueWei});

//             orderList = await reserve.getTokenToEthOrderList();
//             Helper.assertEqual(orderList.length, 0);

//             let userBalanceAfter = await token.balanceOf(user1);
//             let expectedBalance = userInitialTokBalance.add(orderSrcAmountTwei.mul(new BN(3)));
//             Helper.assertEqual(userBalanceAfter, expectedBalance);

//             let makerEthBalance = await reserve.makerFunds(maker1, ethAddress);
//             Helper.assertEqual(makerEthBalance, totalPayValueWei);
//         });

//         it("sell orders print gas for taking 0.5 order 1.5 order 2.5 orders. remaining removed", async () => {
//             let tokenWeiDepositAmount = token18Dec.mul(new BN(70));
//             let kncTweiDepositAmount = PRECISION.mul(new BN(700));
//             let ethWeiDepositAmount = PRECISION.mul(new BN(0));
//             await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

//             let orderSrcAmountTwei = token18Dec.mul(new BN(6));
//             let orderDstWei = PRECISION.mul(new BN(2));

//             //add order
//             let rc = await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei, {from: maker1});
//                 rc = await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei.add(new BN(200)), {from: maker1});
//                 rc = await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei.add(new BN(400)), {from: maker1});
//                 rc = await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei.add(new BN(600)), {from: maker1});
//                 rc = await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei.add(new BN(800)), {from: maker1});
//                 rc = await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei.add(new BN(1000)), {from: maker1});

//             //trade
//             let payValueWei = orderDstWei.div(new BN(2)).add(new BN(3000));
//             rc = await reserve.trade(ethAddress, payValueWei, tokenAdd, user1, lowRate, false, {from:network, value: payValueWei});

//             orderList = await reserve.getTokenToEthOrderList();
//             Helper.assertEqual(orderList.length, 5);

//             //trade
//             payValueWei = payValueWei.add(orderDstWei);
//             rc = await reserve.trade(ethAddress, payValueWei, tokenAdd, user1, lowRate, false, {from:network, value: payValueWei});

//             orderList = await reserve.getTokenToEthOrderList();
//             Helper.assertEqual(orderList.length, 3);

//             //trade
//             payValueWei = payValueWei.add(orderDstWei);
//             rc = await reserve.trade(ethAddress, payValueWei, tokenAdd, user1, lowRate, false, {from:network, value: payValueWei});

//             orderList = await reserve.getTokenToEthOrderList();
//             Helper.assertEqual(orderList.length, 0);
//         });

//         it("sell orders print gas for taking 0.5 order 1.5 order 2.5 orders. remaining not removed", async () => {
//             let tokenWeiDepositAmount = token18Dec.mul(new BN(70));
//             let kncTweiDepositAmount = PRECISION.mul(new BN(700));
//             let ethWeiDepositAmount = PRECISION.mul(new BN(0));
//             await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

//             let orderSrcAmountTwei = token18Dec.mul(new BN(6));
//             let orderDstWei = PRECISION.mul(new BN(2));

//             //add order
//             let rc = await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei, {from: maker1});
//                 rc = await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei.add(new BN(200)), {from: maker1});
//                 rc = await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei.add(new BN(400)), {from: maker1});
//                 rc = await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei.add(new BN(600)), {from: maker1});
//                 rc = await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei.add(new BN(800)), {from: maker1});
//                 rc = await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei.add(new BN(1000)), {from: maker1});

//             //trade
//             let payValueWei = orderDstWei.div(new BN(2)).sub(new BN(3000));
//             rc = await reserve.trade(ethAddress, payValueWei, tokenAdd, user1, lowRate, false, {from:network, value: payValueWei});
//             await reserve.trade(ethAddress, orderDstWei.div(new BN(2)), tokenAdd, user1, lowRate, false, {from:network, value: orderDstWei.div(new BN(2))});

//             //remove left part of order
//             orderList = await reserve.getTokenToEthOrderList();
//             Helper.assertEqual(orderList.length, 5);

//             //trade
//             payValueWei = payValueWei.add(orderDstWei);
//             rc = await reserve.trade(ethAddress, payValueWei, tokenAdd, user1, lowRate, false, {from:network, value: payValueWei});
//             await reserve.trade(ethAddress, orderDstWei.div(new BN(2)), tokenAdd, user1, lowRate, false, {from:network, value: orderDstWei.div(new BN(2))});

//             orderList = await reserve.getTokenToEthOrderList();
//             Helper.assertEqual(orderList.length, 3);

//             //trade
//             payValueWei = payValueWei.add(orderDstWei);
//             rc = await reserve.trade(ethAddress, payValueWei, tokenAdd, user1, lowRate, false, {from:network, value: payValueWei});
//             orderList = await reserve.getTokenToEthOrderList();
//             Helper.assertEqual(orderList.length, 1);

//             await reserve.trade(ethAddress, orderDstWei.div(new BN(2)), tokenAdd, user1, lowRate, false, {from:network, value: orderDstWei.div(new BN(2))});

//             orderList = await reserve.getTokenToEthOrderList();
//             Helper.assertEqual(orderList.length, 0);
//         })

//         it("add 9 buy orders 1 maker. user takes all orders. print gas", async () => {
//             let tokenWeiDepositAmount = token18Dec.mul(new BN(0));
//             let kncTweiDepositAmount = PRECISION.mul(new BN(1100));
//             let ethWeiDepositAmount = PRECISION.mul(new BN(20)).add(new BN(30000));
//             await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

//             let srcAmountWei = PRECISION.mul(new BN(2));
//             let orderDstTwei = token18Dec.mul(new BN(7));

//             // add orders
//             let totalPayAmountTwei = new BN(0);
//             for (let i = 0; i < 9; i++) {
//                 let rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei.add(new BN(String(i * 100))), {from: maker1});
//                 totalPayAmountTwei = totalPayAmountTwei.add(orderDstTwei.add(new BN(String(i * 100))));
//             }

//             let list = await reserve.getEthToTokenOrderList();
//             Helper.assertEqual(list.length, 9);

//             //take order
//         //  function trade(ERC20 srcToken, uint srcAmount, ERC20 destToken, address destAddress, uint conversionRate, bool validate)
//             await token.transfer(network, totalPayAmountTwei);
//             await token.approve(reserve.address, totalPayAmountTwei, {from: network})
//             rc = await reserve.trade(tokenAdd, totalPayAmountTwei, ethAddress, user1, lowRate, false, {from:network});

//             list = await reserve.getEthToTokenOrderList();
//             Helper.assertEqual(list.length, 0);

//             let balance = await reserve.makerFunds(maker1, ethAddress);
//             Helper.assertEqual(balance, ethWeiDepositAmount.sub(srcAmountWei.mul(new BN(9))));

//             balance = await reserve.makerFunds(maker1, tokenAdd);
//             Helper.assertEqual(balance, totalPayAmountTwei);
//         });

//         it("add 10 buy orders. user takes all and last partial. remaining order stays in book. print gas", async () => {
//             let tokenWeiDepositAmount = token18Dec.mul(new BN(0));
//             let kncTweiDepositAmount = PRECISION.mul(new BN(1400));
//             let ethWeiDepositAmount = PRECISION.mul(new BN(20)).add(new BN(30000));
//             await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

//             let srcAmountWei = PRECISION.mul(new BN(2));
//             let orderDstTwei = token18Dec.mul(new BN(7));

//             // add orders
//             let totalPayAmountTwei = new BN(0);
//             for (let i = 0; i < 10; i++) {
//                 let rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei.add(new BN(String(i * 100))), {from: maker1});
//                 totalPayAmountTwei = totalPayAmountTwei.add(orderDstTwei.add(new BN(String(i * 100))));
//             }

//             let list = await reserve.getEthToTokenOrderList();
//             Helper.assertEqual(list.length, 10);

//             //take orders
//             totalPayAmountTwei = totalPayAmountTwei.sub(orderDstTwei);
//             await token.transfer(network, totalPayAmountTwei);
//             await token.approve(reserve.address, totalPayAmountTwei, {from: network})
//             rc = await reserve.trade(tokenAdd, totalPayAmountTwei, ethAddress, user1, lowRate, false, {from:network});

//             list = await reserve.getEthToTokenOrderList();
//             Helper.assertEqual(list.length, 1);

//             let balance = await reserve.makerFunds(maker1, ethAddress);
//             Helper.assertEqual(balance, ethWeiDepositAmount.sub(srcAmountWei.mul(new BN(10))));

//             balance = await reserve.makerFunds(maker1, tokenAdd);
//             Helper.assertEqual(balance, totalPayAmountTwei);
//         });

//         it("add 10 buy orders. user takes all and last partial. remaining order removed.", async () => {
//             let tokenWeiDepositAmount = token18Dec.mul(new BN(0));
//             let kncTweiDepositAmount = PRECISION.mul(new BN(1500));
//             let ethWeiDepositAmount = PRECISION.mul(new BN(20)).add(new BN(30000));
//             await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

//             let srcAmountWei = PRECISION.mul(new BN(2));
//             let orderDstTwei = token18Dec.mul(new BN(7));

//             // add orders
//             let totalPayAmountTwei = new BN(0);
//             for (let i = 0; i < 10; i++) {
//                 let rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
//                 totalPayAmountTwei = totalPayAmountTwei.add(orderDstTwei);
//                 orderDstTwei = orderDstTwei.add(new BN(500));
//             }

//             let list = await reserve.getEthToTokenOrderList();
//             Helper.assertEqual(list.length, 10);

//             //take orders
//             totalPayAmountTwei = totalPayAmountTwei.sub(new BN(100000));
//             await token.transfer(network, totalPayAmountTwei);
//             await token.approve(reserve.address, totalPayAmountTwei, {from: network})
//             rc = await reserve.trade(tokenAdd, totalPayAmountTwei, ethAddress, user1, lowRate, false, {from:network});

//             list = await reserve.getEthToTokenOrderList();
//             Helper.assertEqual(list.length, 0);

//             let takenTweiLastOrder = orderDstTwei.sub(new BN(100000));
//             let takenEthLastOrder = srcAmountWei.mul(takenTweiLastOrder).div(orderDstTwei);
//             let releasedEthLastOrder = srcAmountWei.sub(takenEthLastOrder);
//             let totalTakenEth = srcAmountWei.mul(new BN(9)).add(takenEthLastOrder);
//             let balance = await reserve.makerFunds(maker1, ethAddress);
//             Helper.assertEqual(balance, ethWeiDepositAmount.sub(totalTakenEth));

//             balance = await reserve.makerFunds(maker1, tokenAdd);
//             Helper.assertEqual(balance, totalPayAmountTwei);
//         });

//         it("add 3 buy orders per 3 makers. take all orders in one trade. see each maker gets his part of tokens", async () => {
//             let tokenWeiDepositAmount = token18Dec.mul(new BN(0));
//             let kncTweiDepositAmount = PRECISION.mul(new BN(600));
//             let ethWeiDepositAmount = PRECISION.mul(new BN(6)).add(new BN(3000));
//             await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);
//             await makerDeposit(maker2, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);
//             await makerDeposit(maker3, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

//             let srcAmountWei = PRECISION.mul(new BN(2));
//             let orderDstTwei = token18Dec.mul(new BN(7));

//             // add orders
//             let totalPayAmountTwei = new BN(0);
//             let expectedBalanceMaker1 = new BN(0);
//             let expectedBalanceMaker2 = new BN(0);
//             let expectedBalanceMaker3 = new BN(0);

//             for (let i = 0; i < 3; i++) {
//                 let rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
//                 totalPayAmountTwei = totalPayAmountTwei.add(orderDstTwei);
//                 expectedBalanceMaker1 = expectedBalanceMaker1.add(orderDstTwei);
//                 orderDstTwei = orderDstTwei.add(new BN(200));
//             }

//             for (let i = 0; i < 3; i++) {
//                 let rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker2});
//                 totalPayAmountTwei = totalPayAmountTwei.add(orderDstTwei);
//                 expectedBalanceMaker2 = expectedBalanceMaker2.add(orderDstTwei);
//                 orderDstTwei = orderDstTwei.add(new BN(200));
//             }

//             for (let i = 0; i < 3; i++) {
//                 let rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker3});
//                 totalPayAmountTwei = totalPayAmountTwei.add(orderDstTwei);
//                 expectedBalanceMaker3 = expectedBalanceMaker3.add(orderDstTwei);
//                 orderDstTwei = orderDstTwei.add(new BN(200));
//             }

//             let list = await reserve.getEthToTokenOrderList();
//             Helper.assertEqual(list.length, 9);

//             //take order
//             await token.transfer(network, totalPayAmountTwei);
//             await token.approve(reserve.address, totalPayAmountTwei, {from: network})
//             rc = await reserve.trade(tokenAdd, totalPayAmountTwei, ethAddress, user1, 42, false, {from:network});

//             list = await reserve.getEthToTokenOrderList();
//             Helper.assertEqual(list.length, 0);

//             let balance = await reserve.makerFunds(maker1, ethAddress);
//             Helper.assertEqual(balance, new BN(3000));
//             balance = await reserve.makerFunds(maker2, ethAddress);
//             Helper.assertEqual(balance, new BN(3000));
//             balance = await reserve.makerFunds(maker3, ethAddress);
//             Helper.assertEqual(balance, new BN(3000));

//             balance = await reserve.makerFunds(maker1, tokenAdd);
//             Helper.assertEqual(balance, expectedBalanceMaker1);

//             balance = await reserve.makerFunds(maker2, tokenAdd);
//             Helper.assertEqual(balance, expectedBalanceMaker2);

//             balance = await reserve.makerFunds(maker3, tokenAdd);
//             Helper.assertEqual(balance, expectedBalanceMaker3);
//         });
//     });

//     it("maker add a few sell orders. check correct rate replies.", async () => {
//         //rebalance accounts
//         await Helper.sendEtherWithPromise(user1, maker1, PRECISION.mul(new BN(65)));
//         await Helper.sendEtherWithPromise(user1, user2, PRECISION.mul(new BN(19)));
//         await Helper.sendEtherWithPromise(user1, admin, PRECISION.mul(new BN(6)));
//         await Helper.sendEtherWithPromise(user1, maker2, PRECISION.mul(new BN(6)));

//         let tokenWeiDepositAmount = token18Dec.mul(new BN(70));
//         let kncTweiDepositAmount = PRECISION.mul(new BN(600));
//         let ethWeiDepositAmount = PRECISION.mul(new BN(0));
//         await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

//         // first getConversionRate should return 0
//         let rate = await reserve.getConversionRate(token.address, ethAddress, PRECISION, 0);
//         Helper.assertEqual(rate, 0);

//         let orderSrcAmountTwei = token18Dec.mul(new BN(6));
//         let orderDstWei = PRECISION.mul(new BN(2));

//         //add order
//         let rc = await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei, {from: maker1});
//             rc = await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei.add(new BN(200)), {from: maker1});
//             rc = await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei.add(new BN(400)), {from: maker1});

//         //verify rate that takes to  account only first order
//         let expectedRate = PRECISION.mul(orderSrcAmountTwei).div(orderDstWei);
//         let srcRateAmount = orderDstWei;
//         rate = await reserve.getConversionRate(ethAddress, token.address, srcRateAmount, 0);
//         Helper.assertEqual(rate, expectedRate);

//         srcRateAmount = orderDstWei.div(new BN(2));
//         rate = await reserve.getConversionRate(ethAddress, token.address, srcRateAmount, 0);
//         Helper.assertEqual(rate, expectedRate);

//         //verify rate that takes to  account 2 orders
//         srcRateAmount = orderDstWei.mul(new BN(2)).add(new BN(200));
//         expectedRate = PRECISION.mul(orderSrcAmountTwei.mul(new BN(2))).div(srcRateAmount);
//         rate = await reserve.getConversionRate(ethAddress, token.address, srcRateAmount, 0);
//         Helper.assertEqual(rate, expectedRate);

//         //verify rate that takes to account 3 orders
//         srcRateAmount = orderDstWei.mul(new BN(3)).add(new BN(600));
//         expectedRate = (PRECISION.mul(orderSrcAmountTwei.mul(new BN(3)))).div(srcRateAmount);
//         rate = await reserve.getConversionRate(ethAddress, token.address, srcRateAmount, 0);
//         Helper.assertEqual(rate, expectedRate);

//         //verify rate that takes to account 1.5 orders
//         srcRateAmount = new BN(String(orderDstWei * 1.5)).add(new BN(100));
//         expectedRate = PRECISION.mul(new BN(String(orderSrcAmountTwei * 1.5))).div(srcRateAmount);
//         rate = await reserve.getConversionRate(ethAddress, token.address, srcRateAmount, 0);
//         Helper.assertEqual(rate, expectedRate);
//     });

//     it("set different dollar ETH values. see min eth per order changes", async() => {
//         let dollarPerEthPrecision = PRECISION.mul(new BN(200));
//         await medianizer.setEthPrice(dollarPerEthPrecision);

//         //price before updating ETH rate
//         let rxLimits = await reserve.limits();
//         Helper.assertEqual(rxLimits[2], PRECISION.mul(new BN(2))); // min new order Eth
//         Helper.assertEqual(rxLimits[3], PRECISION.mul(new BN(1))); // min order Eth

//         await reserve.setMinOrderSizeEth();

//         rxLimits = await reserve.limits();
//         Helper.assertEqual(rxLimits[2], PRECISION.mul(new BN(5))); // min new order Eth
//         Helper.assertEqual(rxLimits[3], new BN(String(25 * 10 ** 17))); // min order Eth

//         dollarPerEthPrecision = PRECISION.mul(new BN(500));
//         await medianizer.setEthPrice(dollarPerEthPrecision);

//         rxLimits = await reserve.limits();
//         Helper.assertEqual(rxLimits[2], PRECISION.mul(new BN(5))); // min new order Eth
//         Helper.assertEqual(rxLimits[3], new BN(String(25 * 10 ** 17))); // min order Eth

//         await reserve.setMinOrderSizeEth();
//         rxLimits = await reserve.limits();
//         Helper.assertEqual(rxLimits[2], PRECISION.mul(new BN(2))); // min new order Eth
//         Helper.assertEqual(rxLimits[3], PRECISION.mul(new BN(1))); // min order Eth
//     })
// });

// contract('OrderbookReserve_feeBurner_network', async (accounts) => {

//     let expectedRate;

//     before('one time init. tokens, accounts', async() => {
//         admin = accounts[0];
//         user1 = accounts[1];
//         maker1 = accounts[3];
//         operator = accounts[4];
//         taker = accounts[5];
//         network = accounts[6];

//         token = await TestToken.new("the token", "tok", 18);
//         tokenAdd = token.address;
//         KNCToken = await TestToken.new("kyber crystals", "knc", 18);
//         kncAddress = KNCToken.address;

//         // prepare kyber network
//         mockNetwork = await MockKyberNetwork.new(admin);

//         feeBurner = await FeeBurner.new(
//             admin,
//             kncAddress,
//             mockNetwork.address,
//             initialEthToKncRatePrecision
//         );

//         ordersFactory = await OrderListFactory.new();

//         medianizer = await MockMedianizer.new();
//         await medianizer.setValid(true);
//         await medianizer.setEthPrice(dollarsPerEthPrecision);

//         reserve = await OrderbookReserve.new(kncAddress, tokenAdd, feeBurner.address, network, medianizer.address,
//             ordersFactory.address, minOrderSizeDollar, maxOrdersPerTrade, makerBurnFeeBps);
//         await reserve.init();

//         let rxLimits = await reserve.limits();
//         minNewOrderWei = rxLimits[2];
//         baseKncPerEthRatePrecision = await reserve.kncPerEthBaseRatePrecision();
//         burnToStakeFactor = await reserve.BURN_TO_STAKE_FACTOR();
//         let ordersAdd = await reserve.tokenToEthList();
//         let orders = await OrderList.at(ordersAdd);
//         headId = await orders.HEAD_ID();
//         tailId = await orders.TAIL_ID();
//         firstFreeOrderIdPerReserveList = (await orders.nextFreeId());
//     });

//     beforeEach('setup reserve contract for each test', async () => {
//         ethKncRate = new BN(initialEthKncRate);
//         let ethToKncRatePrecision = PRECISION.mul(ethKncRate);
//         let kncToEthRatePrecision = PRECISION.div(ethKncRate);

//         await mockNetwork.setPairRate(ethAddress, kncAddress, ethToKncRatePrecision);
//         await mockNetwork.setPairRate(kncAddress, ethAddress, kncToEthRatePrecision);

//         await feeBurner.setKNCRate();

//         reserve = await OrderbookReserve.new(kncAddress, tokenAdd, feeBurner.address, network, medianizer.address,
//                 ordersFactory.address, minOrderSizeDollar, maxOrdersPerTrade, makerBurnFeeBps);
//         await reserve.init();

//         await reserve.setKncPerEthBaseRate();

//         baseKncPerEthRatePrecision = await reserve.kncPerEthBaseRatePrecision();
//     });

//     it("add orders modify knc rate to lower knc value, see unlocked knc and staked knc don't change", async() => {
//         let tokenWeiDepositAmount = token18Dec.mul(new BN(70));
//         let kncTweiDepositAmount = PRECISION.mul(new BN(600));
//         let ethWeiDepositAmount = PRECISION.mul(new BN(0));
//         await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

//         let orderSrcAmountTwei = token18Dec.mul(new BN(6));
//         let orderDstWei = new BN(minNewOrderWei);

//         //add orders
//         let rc = await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei, {from: maker1});
//             rc = await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei.add(new BN(400)), {from: maker1});
//             rc = await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei.add(new BN(200)), {from: maker1});

//         let freeKnc1 = await reserve.makerUnlockedKnc(maker1);
//         let stakedKnc1 = await reserve.makerRequiredKncStake(maker1);

//         let rate = await mockNetwork.getExpectedRate(ethAddress, kncAddress, PRECISION);

//         ethKncRate = initialEthKncRate.mul(new BN(2));
//         let ethToKncRatePrecision = PRECISION.mul(ethKncRate);
//         let kncToEthRatePrecision = PRECISION.div(ethKncRate);

//         await mockNetwork.setPairRate(ethAddress, kncAddress, ethToKncRatePrecision);
//         await mockNetwork.setPairRate(kncAddress, ethAddress, kncToEthRatePrecision);

//         rate = await mockNetwork.getExpectedRate(ethAddress, kncAddress, PRECISION);
//         Helper.assertEqual(ethToKncRatePrecision, rate[0]);
//         rate = await mockNetwork.getExpectedRate(kncAddress, ethAddress, PRECISION);
//         Helper.assertEqual(kncToEthRatePrecision, rate[0]);

//         await feeBurner.setKNCRate();
//         let freeKnc2 = await reserve.makerUnlockedKnc(maker1);
//         let stakedKnc2 = await reserve.makerRequiredKncStake(maker1);
//         Helper.assertEqual(stakedKnc2, stakedKnc1);
//         Helper.assertEqual(freeKnc2, freeKnc1);

//         await reserve.setKncPerEthBaseRate();

//         freeKnc2 = await reserve.makerUnlockedKnc(maker1);
//         stakedKnc2 = await reserve.makerRequiredKncStake(maker1);

//         Helper.assertEqual(stakedKnc2, stakedKnc1);
//         Helper.assertEqual(freeKnc2, freeKnc1);
//     })

//     it("create knc rate change, so stakes per order aren't enough. see can still take order", async() => {
//         let tokenWeiDepositAmount = token18Dec.mul(new BN(70));
//         let kncTweiDepositAmount = PRECISION.mul(new BN(600));
//         let ethWeiDepositAmount = PRECISION.mul(new BN(0));
//         await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

//         let orderSrcAmountTwei = token18Dec.mul(new BN(6));
//         let orderDstWei = new BN(minNewOrderWei);

//         //add orders
//         let rc = await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei, {from: maker1});
//             rc = await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei.add(new BN(400)), {from: maker1});
//             rc = await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei.add(new BN(200)), {from: maker1});

//         let freeKnc1 = await reserve.makerUnlockedKnc(maker1);
//         let stakedKnc1 = await reserve.makerRequiredKncStake(maker1);
//         await reserve.withdrawKncFee(freeKnc1, {from: maker1});

//         let freeKnc2 = await reserve.makerUnlockedKnc(maker1);
//         Helper.assertEqual(freeKnc2, 0);
        
//         //see can't add orders
//         try {
//             await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei.add(new BN(200)), {from: maker1});
//             assert(false, "throw was expected in line above.")
//         } catch(e) {
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         ethKncRate = initialEthKncRate.mul(new BN(2));
//         let ethToKncRatePrecision = PRECISION.mul(ethKncRate);
//         let kncToEthRatePrecision = PRECISION.div(ethKncRate);

//         await mockNetwork.setPairRate(ethAddress, kncAddress, ethToKncRatePrecision);
//         await mockNetwork.setPairRate(kncAddress, ethAddress, kncToEthRatePrecision);

//         let rate = await mockNetwork.getExpectedRate(ethAddress, kncAddress, PRECISION);
//         Helper.assertEqual(ethToKncRatePrecision, rate[0]);
//         rate = await mockNetwork.getExpectedRate(kncAddress, ethAddress, PRECISION);
//         Helper.assertEqual(kncToEthRatePrecision, rate[0]);

//         await feeBurner.setKNCRate();
//         freeKnc2 = await reserve.makerUnlockedKnc(maker1);
//         let stakedKnc2 = await reserve.makerRequiredKncStake(maker1);

//         Helper.assertEqual(stakedKnc2, stakedKnc1);
//         Helper.assertEqual(freeKnc2, 0);

//         //see can't add orders
//         try {
//             await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei.add(new BN(200)), {from: maker1});
//             assert(false, "throw was expected in line above.")
//         } catch(e) {
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         //see can take orders
//         let totalPayValue = orderDstWei.mul(new BN(3)).add(new BN(600));
//         rc = await reserve.trade(ethAddress, totalPayValue, tokenAdd, user1, lowRate, false, {from:network, value: totalPayValue});
//     });

//     it("create knc rate that sets stake amount equal to expected burn amount, see can take order", async() => {
//         let tokenWeiDepositAmount = token18Dec.mul(new BN(70));
//         let kncTweiDepositAmount = PRECISION.mul(new BN(600));
//         let ethWeiDepositAmount = PRECISION.mul(new BN(0));
//         await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

//         let orderSrcAmountTwei = token18Dec.mul(new BN(6));
//         let orderDstWei = new BN(minNewOrderWei);

//         //add orders
//         let rc = await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei, {from: maker1});
//         let rate = await reserve.getConversionRate(ethAddress, tokenAdd, PRECISION, 100);
//         Helper.assertGreater(rate, 0);

//         let freeKnc1 = await reserve.makerUnlockedKnc(maker1);
//         let stakedKnc1 = await reserve.makerRequiredKncStake(maker1);
//         let expectedBurn1 = await reserve.calcBurnAmount(orderDstWei);
//         await reserve.withdrawKncFee(freeKnc1, {from: maker1});
//         let freeKnc2 = await reserve.makerUnlockedKnc(maker1);
//         Helper.assertEqual(freeKnc2, 0);

//         // set lower Eth to KNC rate (more knc per eth)
//         ethKncRate = initialEthKncRate.mul(new BN(burnToStakeFactor));
//         let ethToKncRatePrecision = PRECISION.mul(ethKncRate);
//         let kncToEthRatePrecision = PRECISION.div(ethKncRate);

//         await mockNetwork.setPairRate(ethAddress, kncAddress, ethToKncRatePrecision);
//         await mockNetwork.setPairRate(kncAddress, ethAddress, kncToEthRatePrecision);

//         await feeBurner.setKNCRate();

//         // now staked amount shouldn't change and should equal expected burn amount.
//         freeKnc2 = await reserve.makerUnlockedKnc(maker1);
//         Helper.assertEqual(freeKnc2, 0);

//         let stakedKnc2 = await reserve.makerRequiredKncStake(maker1);
//         Helper.assertEqual(stakedKnc2, stakedKnc1);
//         let expectedBurn2 = await reserve.calcBurnAmount(orderDstWei);
//         Helper.assertEqual(expectedBurn2, expectedBurn1);
//         let expectedBurnFeeBurner = await reserve.calcBurnAmountFromFeeBurner(orderDstWei);
//         Helper.assertEqual(expectedBurnFeeBurner, stakedKnc2);

//         //see can take order
//         let totalPayValue = orderDstWei;
//         rc = await reserve.trade(ethAddress, totalPayValue, tokenAdd, user1, lowRate, false, {from:network, value: totalPayValue});
//     });

//     it("see when calling getConversionRate with srcQty 0 it returns 0", async() => {
//         let tokenWeiDepositAmount = token18Dec.mul(new BN(70));
//         let kncTweiDepositAmount = PRECISION.mul(new BN(600));
//         let ethWeiDepositAmount = PRECISION.mul(new BN(0));
//         await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

//         let orderSrcAmountTwei = token18Dec.mul(new BN(6));
//         let orderDstWei = new BN(minNewOrderWei);

//         //add orders
//         let rc = await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei, {from: maker1});
//         let rate = await reserve.getConversionRate(ethAddress, tokenAdd, PRECISION, 522);
//         Helper.assertGreater(rate, 0);

//         rate = await reserve.getConversionRate(ethAddress, tokenAdd, 0, 522);
//         Helper.assertEqual(rate, 0);
//     });

//     it("change knc rate so stake amount < burn amount, see get rate blocked == returns 0", async() => {
//         let tokenWeiDepositAmount = token18Dec.mul(new BN(70));
//         let kncTweiDepositAmount = PRECISION.mul(new BN(600));
//         let ethWeiDepositAmount = PRECISION.mul(new BN(0));
//         await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

//         let orderSrcAmountTwei = token18Dec.mul(new BN(6));
//         let orderDstWei = new BN(minNewOrderWei);

//         //add orders
//         let rc = await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei, {from: maker1});
//         let rate = await reserve.getConversionRate(ethAddress, tokenAdd, PRECISION, 522);
//         Helper.assertGreater(rate, 0);

//         let freeKnc1 = await reserve.makerUnlockedKnc(maker1);
//         await reserve.withdrawKncFee(freeKnc1, {from: maker1});

//         // set lower Eth to KNC rate (more knc per eth)
//         ethKncRate = initialEthKncRate.mul(new BN(String(burnToStakeFactor * 1 + 1 * 1)));
//         let ethToKncRatePrecision = PRECISION.mul(ethKncRate);
//         let kncToEthRatePrecision = PRECISION.div(ethKncRate);

//         await mockNetwork.setPairRate(ethAddress, kncAddress, ethToKncRatePrecision);
//         await mockNetwork.setPairRate(kncAddress, ethAddress, kncToEthRatePrecision);

//         await feeBurner.setKNCRate();
//         await reserve.setKncPerEthBaseRate();

//         // now staked amount should be bigger then maker knc amount. get rate should be blocked
//         rate = await reserve.getConversionRate(ethAddress, tokenAdd, PRECISION, 522);
//         Helper.assertEqual(rate, 0);

//         let freeKnc2 = await reserve.makerUnlockedKnc(maker1);
//         Helper.assertEqual(freeKnc2, 0);

//         let makerKncAmount = await reserve.makerKnc(maker1);
//         let expectedBurn2 = await reserve.calcBurnAmountFromFeeBurner(orderDstWei);
//         Helper.assertGreater(expectedBurn2, makerKncAmount);

//         //see now conversion rate 0
//         rate = await reserve.getConversionRate(ethAddress, tokenAdd, PRECISION, 52);
//         Helper.assertEqual(rate, 0);
//     });

//     it("change knc rate so less stake required. see reflected in burn amount calculation", async() => {
//         let tokenWeiDepositAmount = token18Dec.mul(new BN(70));
//         let kncTweiDepositAmount = PRECISION.mul(new BN(600));
//         let ethWeiDepositAmount = PRECISION.mul(new BN(0));
//         await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

//         let orderSrcAmountTwei = token18Dec.mul(new BN(6));
//         let orderDstWei = new BN(minNewOrderWei);

//         //add orders
//         let rc = await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei, {from: maker1});
//         let rate = await reserve.getConversionRate(ethAddress, tokenAdd, PRECISION, 522);
//         Helper.assertGreater(rate, 0);

//         let freeKnc1 = await reserve.makerUnlockedKnc(maker1);
//         await reserve.withdrawKncFee(freeKnc1, {from: maker1});

//         freeKnc1 = await reserve.makerUnlockedKnc(maker1);
//         Helper.assertEqual(freeKnc1, 0);

//         let stakedKnc1 = await reserve.makerRequiredKncStake(maker1);

//         // set higher Eth to KNC rate (less knc per eth)
//         ethKncRate = initialEthKncRate.div(new BN(2));
//         let ethToKncRatePrecision = PRECISION.mul(ethKncRate);
//         let kncToEthRatePrecision = PRECISION.div(ethKncRate);

//         await mockNetwork.setPairRate(ethAddress, kncAddress, ethToKncRatePrecision);
//         await mockNetwork.setPairRate(kncAddress, ethAddress, kncToEthRatePrecision);

//         //burn amount should equal for fee burner and local rate
//         let expectedBurnLocal1 = await reserve.calcBurnAmount(orderDstWei);
//         let expectedBurnFeeBurnRate1 = await reserve.calcBurnAmountFromFeeBurner(orderDstWei);
//         Helper.assertEqual(expectedBurnLocal1, expectedBurnFeeBurnRate1);

//         await feeBurner.setKNCRate();

//         let expectedBurnLocal2 = await reserve.calcBurnAmount(orderDstWei);
//         let expectedBurnFeeBurnRate2 = await reserve.calcBurnAmountFromFeeBurner(orderDstWei);
//         Helper.assertEqual(expectedBurnLocal1, expectedBurnLocal2);
//         Helper.assertEqual(expectedBurnFeeBurnRate2.mul(new BN(2)), expectedBurnFeeBurnRate1);

//         await reserve.setKncPerEthBaseRate();

//         let expectedBurnLocal3 = await reserve.calcBurnAmount(orderDstWei);
//         let expectedBurnFeeBurnRate3 = await reserve.calcBurnAmountFromFeeBurner(orderDstWei);
//         Helper.assertEqual(expectedBurnFeeBurnRate3, expectedBurnLocal3);
//         Helper.assertEqual(expectedBurnFeeBurnRate3, expectedBurnFeeBurnRate2);
//     });

//     it("change knc rate so less stake required. see reflected", async() => {
//         let tokenWeiDepositAmount = token18Dec.mul(new BN(70));
//         let kncTweiDepositAmount = PRECISION.mul(new BN(600));
//         let ethWeiDepositAmount = PRECISION.mul(new BN(0));
//         await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

//         let orderSrcAmountTwei = token18Dec.mul(new BN(6));
//         let orderDstWei = new BN(minNewOrderWei);

//         //add orders
//         let rc = await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei, {from: maker1});
//         let rate = await reserve.getConversionRate(ethAddress, tokenAdd, PRECISION, 522);
//         Helper.assertGreater(rate, 0);

//         let freeKnc1 = await reserve.makerUnlockedKnc(maker1);
//         await reserve.withdrawKncFee(freeKnc1, {from: maker1});

//         freeKnc1 = await reserve.makerUnlockedKnc(maker1);
//         Helper.assertEqual(freeKnc1, 0);

//         let stakedKnc1 = await reserve.makerRequiredKncStake(maker1);

//         // set higher Eth to KNC rate (less knc per eth)
//         ethKncRate = initialEthKncRate.div(new BN(2));
//         let ethToKncRatePrecision = PRECISION.mul(ethKncRate);
//         let kncToEthRatePrecision = PRECISION.div(ethKncRate);

//         await mockNetwork.setPairRate(ethAddress, kncAddress, ethToKncRatePrecision);
//         await mockNetwork.setPairRate(kncAddress, ethAddress, kncToEthRatePrecision);

//         await feeBurner.setKNCRate();

//         let freeKnc2 = await reserve.makerUnlockedKnc(maker1);
//         Helper.assertEqual(freeKnc2, 0);
//         let stakedKnc2 = await reserve.makerRequiredKncStake(maker1);
//         Helper.assertEqual(stakedKnc1, stakedKnc2)

//         await reserve.setKncPerEthBaseRate();
//         stakedKnc2 = await reserve.makerRequiredKncStake(maker1);
//         Helper.assertEqual(stakedKnc1.div(new BN(2)), stakedKnc2)

//         freeKnc2 = await reserve.makerUnlockedKnc(maker1);
//         Helper.assertEqual(freeKnc2, stakedKnc1.div(new BN(2)));

//         rate = await reserve.getConversionRate(ethAddress, tokenAdd, PRECISION, 52);
//         Helper.assertGreater(rate, 0);
//     });

//     it("add order. reduce knc rate by factor. see can't take order if not enough burn amount", async() => {
//         let tokenWeiDepositAmount = token18Dec.mul(new BN(6));
//         let kncTweiDepositAmount = PRECISION.mul(new BN(600));

//         await makerDeposit(maker1, 0, tokenWeiDepositAmount, kncTweiDepositAmount);

//         let srcTwei = PRECISION.mul(new BN(3));
//         let dstWei = new BN(minNewOrderWei);

//         //add order
//         await reserve.submitTokenToEthOrder(srcTwei, dstWei, {from: maker1});

//         rxFreeKnc = await reserve.makerUnlockedKnc(maker1);
//         await reserve.withdrawKncFee(rxFreeKnc, {from: maker1});

//         let ethKncRate = initialEthKncRate.mul(new BN(String(burnToStakeFactor * 1 + 1 * 1)));
//         let ethToKncRatePrecision = PRECISION.mul(ethKncRate);
//         let kncToEthRatePrecision = PRECISION.div(ethKncRate);

//         await mockNetwork.setPairRate(ethAddress, kncAddress, ethToKncRatePrecision);
//         await mockNetwork.setPairRate(kncAddress, ethAddress, kncToEthRatePrecision);

//         await feeBurner.setKNCRate();

//         let totalPayValue = dstWei;

//         try {
//             await reserve.trade(ethAddress, totalPayValue, tokenAdd, user1, lowRate, false, {from:network, value: totalPayValue});
//             assert(false, "throw was expected in line above.")
//         } catch(e){
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         //partial order can still be taken
//         totalPayValue = totalPayValue.div(new BN(2));
//         await reserve.trade(ethAddress, totalPayValue, tokenAdd, user1, lowRate, false, {from:network, value: totalPayValue});
//     })
// });


// function log(str) {
//     console.log(str);
// }

// async function makerDeposit(maker, ethWei, tokenTwei, kncTwei) {
//     await token.approve(reserve.address, tokenTwei, {from: admin});
//     await reserve.depositToken(maker, tokenTwei, {from: admin});
//     await KNCToken.approve(reserve.address, kncTwei, {from: admin});
//     await reserve.depositKncForFee(maker, kncTwei, {from: admin});
//     await reserve.depositEther(maker, {from: maker, value: ethWei});
// }

// async function makerDepositFull(maker, otherReserve, someToken, ethWei, tokenTwei, kncTwei) {
//     await someToken.approve(otherReserve.address, tokenTwei);
//     await otherReserve.depositToken(maker, tokenTwei);
//     await KNCToken.approve(otherReserve.address, kncTwei);
//     await otherReserve.depositKncForFee(maker, kncTwei);
//     await otherReserve.depositEther(maker, {from: maker, value: ethWei});
// }
