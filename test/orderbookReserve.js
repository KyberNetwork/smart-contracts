const TestToken = artifacts.require("TestToken.sol");
const NetworkProxy = artifacts.require("./KyberNetworkProxy.sol");
const KyberNetwork = artifacts.require("KyberNetwork.sol");
const FeeBurner = artifacts.require("FeeBurner.sol");
const ExpectedRate = artifacts.require("./ExpectedRate.sol");
const OrderList = artifacts.require("OrderList.sol");
const OrderListFactory = artifacts.require("OrderListFactory.sol");
const OrderbookReserve = artifacts.require("MockOrderbookReserve.sol");
const TestTokenFailing = artifacts.require("TestTokenFailing.sol");
const MockMedianizer = artifacts.require("MockMedianizer.sol");
const MockKyberNetwork = artifacts.require("./MockKyberNetwork.sol");
const PermissionlessOrderbookReserveLister = artifacts.require("PermissionlessOrderbookReserveLister.sol");

const Helper = require("./helper.js");
const BigNumber = require('bignumber.js');

//global variables
//////////////////
const precisionUnits = (new BigNumber(10).pow(18));
const ethAddress = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
const max_rate = precisionUnits.mul(10 ** 6); //internal parameter in Utils.sol.
const gasPrice = (new BigNumber(10).pow(9).mul(50));
const negligibleRateDiff = 11;
const initialEthKncRate = 280;
const initialEthToKncRatePrecision = precisionUnits.mul(initialEthKncRate);
const MAX_QTY = new BigNumber(10 ** 28);
const BPS = 10000;

//permission groups
let admin;
let withDrawAddress;

//contracts
let reserve;
let feeBurner;
let network;
let ordersFactory;
let medianizer;

//tokens data
////////////
let token;
let tokenAdd;
let KNCToken;
let kncAddress;

let headId;
let tailId;

//addresses
let user1;
let user2;
let maker1;
let maker2;
let maker3;
let operator;
let taker;

let firstFreeOrderIdPerReserveList;

let numOrderIdsPerMaker;

let currentBlock;

let burnToStakeFactor;

let makerBurnFeeBps = 25;
let maxOrdersPerTrade = 10;
let minOrderSizeDollar = 1000;
let minNewOrderWei;
let minKncPerEthRatePrecision;
let dollarsPerEthPrecision = precisionUnits.mul(500);

contract('OrderbookReserve', async (accounts) => {

    before('one time init. tokens, accounts', async() => {
        admin = accounts[0];
        user1 = accounts[1];
        user2 = accounts[2];
        maker1 = accounts[3];
        maker2 = accounts[4];
        maker3 = accounts[5];
        network = accounts[6];
        
        token = await TestToken.new("the token", "TOK", 18);
        tokenAdd = token.address;

        KNCToken = await TestToken.new("Kyber Crystals", "KNC", 18);
        kncAddress = KNCToken.address;

        feeBurner = await FeeBurner.new(admin, kncAddress, network, initialEthToKncRatePrecision);

        ordersFactory = await OrderListFactory.new();
        medianizer = await MockMedianizer.new();
        await medianizer.setValid(true);
        await medianizer.setEthPrice(dollarsPerEthPrecision);

        currentBlock = await Helper.getCurrentBlock();

        reserve = await OrderbookReserve.new(kncAddress, tokenAdd, feeBurner.address, network, medianizer.address,
            minOrderSizeDollar, maxOrdersPerTrade, makerBurnFeeBps);
        await reserve.init(ordersFactory.address);
        numOrderIdsPerMaker = await reserve.NUM_ORDERS();
        burnToStakeFactor = await reserve.BURN_TO_STAKE_FACTOR();

        let ordersAdd = await reserve.tokenToEthList();
        let orders = OrderList.at(ordersAdd.valueOf());
        headId = (await orders.HEAD_ID()).valueOf();
        tailId = (await orders.TAIL_ID()).valueOf();

        let rxLimits = await reserve.limits();
        minNewOrderWei = rxLimits[2].valueOf();
        minKncPerEthRatePrecision = rxLimits[4].valueOf();
        firstFreeOrderIdPerReserveList = (await orders.nextFreeId()).valueOf();
    });

    beforeEach('setup contract for each test', async () => {

//        log(feeBurner.address + " " + kncAddress + " " + tokenAdd)
        reserve = await OrderbookReserve.new(kncAddress, tokenAdd, feeBurner.address, network, medianizer.address,
            minOrderSizeDollar, maxOrdersPerTrade, makerBurnFeeBps);
//        log(reserve);
        await reserve.init(ordersFactory.address);
    });

    afterEach('withdraw ETH from contracts', async () => {
        let orderList = await reserve.getEthToTokenOrderList();
        for (let i = 0; i < orderList.length; i++) {
            //start from 1 since first order is head
            try{await reserve.cancelEthToTokenOrder(orderList[i].valueOf(), {from: maker1});
            } catch(e) {};
        }

        let rxWei = await reserve.makerFunds(maker1, ethAddress);
        if (rxWei.valueOf() > 0) {
            await reserve.withdrawEther(rxWei.valueOf(), {from: maker1})
        }

        rxWei = await reserve.makerFunds(maker2, ethAddress);
        if (rxWei.valueOf() > 0) {
            await reserve.withdrawEther(rxWei.valueOf(), {from: maker2})
        }
    });

    it("test globals.", async () => {
        let rxContracts = await reserve.contracts();
        assert.equal(rxContracts[0].valueOf(), kncAddress);
        assert.equal(rxContracts[1].valueOf(), tokenAdd);
        assert.equal(rxContracts[2].valueOf(), feeBurner.address);
        assert.equal(rxContracts[3].valueOf(), network);
        assert.equal(rxContracts[4].valueOf(), medianizer.address);

        let rxLimits = await reserve.limits();
        assert.equal(rxLimits[0].valueOf(), minOrderSizeDollar);
        assert.equal(rxLimits[1].valueOf(), maxOrdersPerTrade);
        assert.equal(rxLimits[2].valueOf(), (2 * 10 ** 18));
        assert.equal(rxLimits[3].valueOf(), (1 * 10 ** 18));

        let burnFees = await reserve.makerBurnFeeBps();
        assert.equal(burnFees.valueOf(), makerBurnFeeBps);

        let localFeeBps = 70;
        let reserve2 = await OrderbookReserve.new(kncAddress, tokenAdd, feeBurner.address, network, medianizer.address, minOrderSizeDollar, maxOrdersPerTrade, localFeeBps);
        burnFees = await reserve2.makerBurnFeeBps();
        assert.equal(burnFees.valueOf(), localFeeBps);

        let headIdInReserve = await reserve.HEAD_ID();
        let tailIdInReserve = await reserve.TAIL_ID();
        assert.equal(headId.valueOf(), headIdInReserve.valueOf());
        assert.equal(tailId.valueOf(), tailIdInReserve.valueOf());

        let permHintForGetRate = await reserve.permHint
    });

    it("test trade event, take full order event, take partial order event", async()=> {
        let tokenWeiDepositAmount = 60 * 10 ** 18;
        let kncTweiDepositAmount = 600 * 10 ** 18;
        let ethWeiDepositAmount = 0 * 10 ** 18;
        await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount.valueOf(), kncTweiDepositAmount.valueOf());

        let valueWei = new BigNumber(2 * 10 ** 18);
        let valueTwei = new BigNumber(12 * 10 ** 18);

        //add orders
        await reserve.submitTokenToEthOrder(valueTwei, valueWei, {from: maker1});
        await reserve.submitTokenToEthOrder(valueTwei, valueWei.add(100), {from: maker1});

        // legal trade
        let payValueWei = valueWei.div(2);
        rc = await reserve.trade(ethAddress, payValueWei, tokenAdd, user1, 300, false, {from: network, value: payValueWei});
//        log(rc.logs[0])
        assert.equal(rc.logs[0].event, 'PartialOrderTaken');
        assert.equal(rc.logs[0].args.maker, maker1);
        assert.equal(rc.logs[0].args.orderId.valueOf(), firstFreeOrderIdPerReserveList.valueOf());
        assert.equal(rc.logs[0].args.isEthToToken, true);
        assert.equal(rc.logs[0].args.isRemoved, false);

        assert.equal(rc.logs[1].event, 'OrderbookReserveTrade');
        assert.equal(rc.logs[1].args.srcToken, ethAddress.toLowerCase());
        assert.equal(rc.logs[1].args.dstToken, tokenAdd.toLowerCase());
        assert.equal(rc.logs[1].args.srcAmount, payValueWei.valueOf());
        assert.equal(rc.logs[1].args.dstAmount, valueTwei.div(2).valueOf());

        payValueWei = valueWei.div(2).sub(500)
        rc = await reserve.trade(ethAddress, payValueWei, tokenAdd, user1, 300, false, {from: network, value: payValueWei});
        assert.equal(rc.logs[0].event, 'PartialOrderTaken');
        assert.equal(rc.logs[0].args.maker, maker1);
        assert.equal(rc.logs[0].args.orderId.valueOf(), firstFreeOrderIdPerReserveList.valueOf());
        assert.equal(rc.logs[0].args.isEthToToken, true);
        assert.equal(rc.logs[0].args.isRemoved, true);

        payValueWei = valueWei.add(100)
        rc = await reserve.trade(ethAddress, payValueWei, tokenAdd, user1, 300, false, {from: network, value: payValueWei});
        assert.equal(rc.logs[0].event, 'FullOrderTaken');
        assert.equal(rc.logs[0].args.maker, maker1);
        assert.equal(rc.logs[0].args.orderId.valueOf(), firstFreeOrderIdPerReserveList * 1 + 1 * 1);
        assert.equal(rc.logs[0].args.isEthToToken, true);
    });

    describe("test various revert scenarios", function() {
        it("verify ctor parameters for order book reserve. no zero values", async() => {
            let res;

            res = await OrderbookReserve.new(kncAddress, tokenAdd, feeBurner.address, network, medianizer.address, minOrderSizeDollar, maxOrdersPerTrade, makerBurnFeeBps);

            try {
                res = await OrderbookReserve.new(0, tokenAdd, feeBurner.address, network, medianizer.address, minOrderSizeDollar, maxOrdersPerTrade, makerBurnFeeBps);
                assert(false, "throw was expected in line above.")
            } catch(e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }

            try {
                res = await OrderbookReserve.new(kncAddress, 0, feeBurner.address, network, medianizer.address, minOrderSizeDollar, maxOrdersPerTrade, makerBurnFeeBps);
                assert(false, "throw was expected in line above.")
            } catch(e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }

            try {
                res = await OrderbookReserve.new(kncAddress, tokenAdd, 0, network, medianizer.address, minOrderSizeDollar, maxOrdersPerTrade, makerBurnFeeBps);
                assert(false, "throw was expected in line above.")
            } catch(e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }

            try {
                res = await OrderbookReserve.new(kncAddress, tokenAdd, feeBurner.address, 0, medianizer.address, minOrderSizeDollar, maxOrdersPerTrade, makerBurnFeeBps);
                assert(false, "throw was expected in line above.")
            } catch(e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }

            try {
                res = await OrderbookReserve.new(kncAddress, tokenAdd, feeBurner.address, network, 0, minOrderSizeDollar, maxOrdersPerTrade, makerBurnFeeBps);
                assert(false, "throw was expected in line above.")
            } catch(e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }

            try {
                res = await OrderbookReserve.new(kncAddress, tokenAdd, feeBurner.address, network, medianizer.address, 0, maxOrdersPerTrade, makerBurnFeeBps);
                assert(false, "throw was expected in line above.")
            } catch(e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }

            try {
                res = await OrderbookReserve.new(kncAddress, tokenAdd, feeBurner.address, network, medianizer.address, minOrderSizeDollar, 0, makerBurnFeeBps);
                assert(false, "throw was expected in line above.")
            } catch(e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }
            try {
                res = await OrderbookReserve.new(kncAddress, tokenAdd, feeBurner.address, network, medianizer.address, minOrderSizeDollar, maxOrdersPerTrade, 0);
                assert(false, "throw was expected in line above.")
            } catch(e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }

            let maxBurnFee = await reserve.MAX_BURN_FEE_BPS();

            try {
                res = await OrderbookReserve.new(kncAddress, tokenAdd, feeBurner.address, network, medianizer.address, minOrderSizeDollar, maxOrdersPerTrade, (maxBurnFee.add(1)));
                assert(false, "throw was expected in line above.")
            } catch(e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }
        });

        it("verify 2ne init for same reserve doesn't deploy new orderList", async() => {
            let listEthToToken = await reserve.ethToTokenList();
            let listTokenToEth = await reserve.tokenToEthList();

            await reserve.init(ordersFactory.address);

            assert.equal(listEthToToken, (await reserve.ethToTokenList()))
            assert.equal(listTokenToEth, (await reserve.tokenToEthList()))
        })

        it("verify can't deploy reserve if eth to dollar price is not valid", async() => {
            let res = await OrderbookReserve.new(kncAddress, tokenAdd, feeBurner.address, network, medianizer.address, minOrderSizeDollar, maxOrdersPerTrade, makerBurnFeeBps);

            await medianizer.setValid(false);

            try {
                res = await OrderbookReserve.new(kncAddress, tokenAdd, feeBurner.address, network, medianizer.address, minOrderSizeDollar, maxOrdersPerTrade, makerBurnFeeBps);
                assert(false, "throw was expected in line above.")
            } catch(e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }

            await medianizer.setValid(true);
        })

        it("verify get conversion rate reverts if qty > max_qty", async() => {
            let qty = MAX_QTY;
            let rate = await reserve.getConversionRate(tokenAdd, ethAddress, qty, 0);

            qty = qty.add(1);

            try {
                rate = await reserve.getConversionRate(tokenAdd, ethAddress, qty, 0);
                assert(false, "throw was expected in line above.")
            } catch(e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }

            await medianizer.setValid(true);
        })

        it("verify can't construct order book reserve if approve knc to burner fails.", async() => {
            let res;

            let failingKnc = await TestTokenFailing.new("kyber no approve", "KNC", 18);

            try {
                res = await OrderbookReserve.new(failingKnc.address, tokenAdd, feeBurner.address, network, medianizer.address, minOrderSizeDollar, maxOrdersPerTrade, makerBurnFeeBps);
                assert(false, "throw was expected in line above.")
            } catch(e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }

            res = await OrderbookReserve.new(kncAddress, tokenAdd, feeBurner.address, network, medianizer.address, minOrderSizeDollar, maxOrdersPerTrade, makerBurnFeeBps);
        });

        it("verify 2nd init call for same token works OK.", async() => {
            let res = await OrderbookReserve.new(kncAddress, tokenAdd, feeBurner.address, network, medianizer.address, minOrderSizeDollar, maxOrdersPerTrade, makerBurnFeeBps);

            await res.init(ordersFactory.address, {from: accounts[1]});

            //see 2nd init from correct sender has good results.
            await res.init(ordersFactory.address, {from: accounts[0]});
        });

        it("verify get rate works only for token->Eth or eth->token. other options revert", async() => {
            let rate = await reserve.getConversionRate(tokenAdd, ethAddress, 10 ** 18, 0);
            assert.equal(rate.valueOf(), 0);
            rate = await reserve.getConversionRate(ethAddress, tokenAdd, 10 ** 18, 0);
            assert.equal(rate.valueOf(), 0);

            let otherTok = await TestToken.new("other", "oth", 15);
            let address = otherTok.address;

            try {
                rate = await reserve.getConversionRate(ethAddress, ethAddress, 10 ** 18, 0);
                assert(false, "throw was expected in line above.")
            } catch(e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }

            try {
                rate = await reserve.getConversionRate(tokenAdd, tokenAdd, 10 ** 18, 0);
                assert(false, "throw was expected in line above.")
            } catch(e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }

            try {
                rate = await reserve.getConversionRate(address, tokenAdd, 10 ** 18, 0);
                assert(false, "throw was expected in line above.")
            } catch(e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }

            try {
                rate = await reserve.getConversionRate(tokenAdd, address, 10 ** 18, 0);
                assert(false, "throw was expected in line above.")
            } catch(e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }

            try {
                rate = await reserve.getConversionRate(address, ethAddress, 10 ** 18, 0);
                assert(false, "throw was expected in line above.")
            } catch(e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }


            try {
                rate = await reserve.getConversionRate(ethAddress, address, 10 ** 18, 0);
                assert(false, "throw was expected in line above.")
            } catch(e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }
        });

        it("verify trade with token source only works for token->Eth. other options revert", async() => {
            let tokenWeiDepositAmount = 0 * 10 ** 18;
            let kncTweiDepositAmount = 600 * 10 ** 18;
            let ethWeiDepositAmount = 10 * 10 ** 18;
            await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount.valueOf(), kncTweiDepositAmount.valueOf());

            let valueWei = 5 * 10 ** 18;
            let valueTwei = 15 * 10 ** 18;

            //add orders
            let rc = await reserve.submitEthToTokenOrder(valueWei, valueTwei, {from: maker1});
            log("gas add first order: " + rc.receipt.gasUsed)

            //validate we have rate values
            let rate = await reserve.getConversionRate(tokenAdd, ethAddress, 10 ** 18, 0);
            assert(rate.valueOf() != 0);

            let otherTok = await TestToken.new("other", "oth", 15);
            let otherTokAddress = otherTok.address;

            // legal trade
            let payValueTwei = 30000;
            await token.transfer(network, payValueTwei);
            await token.approve(reserve.address, payValueTwei, {from: network})
            rc = await reserve.trade(tokenAdd, payValueTwei, ethAddress, user1, 300, false, {from: network});

            // prepare trade
            await token.transfer(network, payValueTwei);
            await token.approve(reserve.address, payValueTwei, {from: network})

            try {
                await reserve.trade(tokenAdd, payValueTwei, tokenAdd, user1, 300, false, {from: network});
                assert(false, "throw was expected in line above.")
            } catch(e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }

            try {
                await reserve.trade(tokenAdd, payValueTwei, otherTokAddress, user1, 300, false, {from: network});
                assert(false, "throw was expected in line above.")
            } catch(e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }

            //verify trade is legal
            rc = await reserve.trade(tokenAdd, payValueTwei, ethAddress, user1, 300, false, {from: network});
        });

        it("verify trade with eth source only works for Eth->token. other options revert", async() => {
            let tokenWeiDepositAmount = 60 * 10 ** 18;
            let kncTweiDepositAmount = 600 * 10 ** 18;
            let ethWeiDepositAmount = 0 * 10 ** 18;
            await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount.valueOf(), kncTweiDepositAmount.valueOf());

            let valueWei = 5 * 10 ** 18;
            let valueTwei = 15 * 10 ** 18;

            //add orders
            let rc = await reserve.submitTokenToEthOrder(valueTwei, valueWei, {from: maker1});

            //validate we have rate values
            let rate = await reserve.getConversionRate(ethAddress, tokenAdd, 10 ** 18, 0);
            assert(rate.valueOf() != 0);

            let otherTok = await TestToken.new("other", "oth", 15);
            let otherTokAddress = otherTok.address;

            // legal trade
            let payValueWei = 3000;
            rc = await reserve.trade(ethAddress, payValueWei, tokenAdd, user1, 300, false, {from: network, value: payValueWei});

            try {
                await reserve.trade(ethAddress, payValueWei, ethAddress, user1, 300, false, {from: network, value: payValueWei});
                assert(false, "throw was expected in line above.")
            } catch(e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }

            try {
                await reserve.trade(ethAddress, payValueWei, otherTokAddress, user1, 300, false, {from: network, value: payValueWei});
                assert(false, "throw was expected in line above.")
            } catch(e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }

            //verify trade is legal
            await reserve.trade(ethAddress, payValueWei, tokenAdd, user1, 300, false, {from: network, value: payValueWei});
        });

        it("verify trade illegal message eth value revert", async() => {
            let tokenWeiDepositAmount = 90 * 10 ** 18;
            let kncTweiDepositAmount = 600 * 10 ** 18;
            let ethWeiDepositAmount = 5 * 10 ** 18;
            await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount.valueOf(), kncTweiDepositAmount.valueOf());

            let valueWei = 5 * 10 ** 18;
            let valueTwei = 15 * 10 ** 18;

            //add orders
            await reserve.submitTokenToEthOrder(valueTwei, valueWei, {from: maker1});
            await reserve.submitEthToTokenOrder(valueWei, valueTwei, {from: maker1});

            // legal trade
            let payValueWei = 3000;
            await reserve.trade(ethAddress, payValueWei, tokenAdd, user1, 300, false, {from: network, value: payValueWei});

            let badMessageValue = 3001;

            try {
                await reserve.trade(ethAddress, payValueWei, tokenAdd, user1, 300, false, {from: network, value: badMessageValue});
                assert(false, "throw was expected in line above.")
            } catch(e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }

            // legal trade
            let payValueTwei = 30000;
            await token.transfer(network, payValueTwei);
            await token.approve(reserve.address, payValueTwei, {from: network})
            await reserve.trade(tokenAdd, payValueTwei, ethAddress, user1, 300, false, {from: network});

            //now with wrong message value
            await token.transfer(network, payValueTwei);
            await token.approve(reserve.address, payValueTwei, {from: network})

            try {
                await reserve.trade(tokenAdd, payValueTwei, ethAddress, user1, 300, false, {from: network, value: 1});
                assert(false, "throw was expected in line above.")
            } catch(e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }
        });

        it("verify trade token to eth with not enough tokens approved to reserve, reverts", async() => {
            let tokenWeiDepositAmount = 0 * 10 ** 18;
            let kncTweiDepositAmount = 600 * 10 ** 18;
            let ethWeiDepositAmount = 5 * 10 ** 18;
            await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount.valueOf(), kncTweiDepositAmount.valueOf());

            let valueWei = 5 * 10 ** 18;
            let valueTwei = 15 * 10 ** 18;

            //add orders
            await reserve.submitEthToTokenOrde(valueWei, valueTwei, {from: maker1});

            // legal trade
            let payValueTwei = 11000;
            await token.transfer(network, payValueTwei);
            await token.approve(reserve.address, payValueTwei, {from: network})
            await reserve.trade(tokenAdd, payValueTwei, ethAddress, user1, 300, false, {from: network});

            // legal trade
            payValueTwei = 13000;
            let badTransferValue = 12999;
            await token.transfer(network, badTransferValue);
            await token.approve(reserve.address, badTransferValue, {from: network});

            try {
                await reserve.trade(tokenAdd, payValueTwei, ethAddress, user1, 300, false, {from: network});
                assert(false, "throw was expected in line above.")
            } catch(e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }
        });

        it("verify add order batch with bad array sizes reverts", async() => {
            let tokenWeiDepositAmount = new BigNumber(0).mul(10 ** 18);
            let kncTweiDepositAmount = 600 * 10 ** 18;
            let ethWeiDepositAmount = (new BigNumber(10 * 10 ** 18)).add(30000);
            await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

            orderSrc = new BigNumber(2 * 10 ** 18);
            orderDst = new BigNumber(6 * 10 ** 18);

            let makeOrdersSrcAmounts = [orderSrc, orderSrc, orderSrc];
            let badSrcAmounts = [orderSrc, orderSrc, orderSrc, orderSrc]
            let makeOrdersDstAmount = [orderDst, orderDst.add(200), orderDst.add(500)];
            let badDstAmounts  = [orderDst, orderDst.add(200), orderDst.add(500), orderDst];
            let hintArray = [0, 0, 0];
            let badHintArr = [0, 0, 0, 0]
            let isAfterMyPrevOrder = [false, false, false];
            let badIsAfter = [false, false]
            let isBuyOrder = [true, true, true];
            let badIsBuyOrder = [true, true];

            let totalPayValue = new BigNumber(0);
            for (let i = 0; i < makeOrdersSrcAmounts.length; i++) {
                totalPayValue = totalPayValue.add(makeOrdersDstAmount[i]);
            }

            //legal batch order
            rc = await reserve.addOrderBatch(isBuyOrder, makeOrdersSrcAmounts, makeOrdersDstAmount, hintArray,
                                        isAfterMyPrevOrder, {from: maker1});


            await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

            //failing batch orders
            try {
                await reserve.addOrderBatch(isBuyOrder, makeOrdersSrcAmounts, makeOrdersDstAmount, hintArray,
                                        isAfterMyPrevOrder, {from: maker1});
                assert(false, "throw was expected in line above.")
            } catch(e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }

            try {
                await reserve.addOrderBatch(badIsBuyOrder, makeOrdersSrcAmounts, makeOrdersDstAmount, hintArray,
                                        isAfterMyPrevOrder, {from: maker1});
                assert(false, "throw was expected in line above.")
            } catch(e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }
            try {
                await reserve.addOrderBatch(isBuyOrder, badSrcAmounts, makeOrdersDstAmount, hintArray,
                                        isAfterMyPrevOrder, {from: maker1});
                assert(false, "throw was expected in line above.")
            } catch(e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }

            try {
                await reserve.addOrderBatch(isBuyOrder, makeOrdersSrcAmounts, badDstAmounts, hintArray,
                                        isAfterMyPrevOrder, {from: maker1});
                assert(false, "throw was expected in line above.")
            } catch(e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }

            try {
                await reserve.addOrderBatch(isBuyOrder, makeOrdersSrcAmounts, makeOrdersDstAmount, badHintArr,
                                        isAfterMyPrevOrder, {from: maker1});
                assert(false, "throw was expected in line above.")
            } catch(e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }

            try {
                await reserve.addOrderBatch(isBuyOrder, makeOrdersSrcAmounts, makeOrdersDstAmount, hintArray,
                                        badIsAfter, {from: maker1});
                assert(false, "throw was expected in line above.")
            } catch(e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }
        })

        it("verify update order batch with bad array sizes reverts", async() => {
            let tokenWeiDepositAmount = new BigNumber(0).mul(10 ** 18);
            let kncTweiDepositAmount = 600 * 10 ** 18;
            let ethWeiDepositAmount = (new BigNumber(10 * 10 ** 18)).add(30000);
            await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

            orderSrc = new BigNumber(2 * 10 ** 18);
            orderDst = new BigNumber(6 * 10 ** 18);

            let makeOrdersSrcAmounts = [orderSrc, orderSrc, orderSrc];
            let badSrcAmounts = [orderSrc, orderSrc, orderSrc, orderSrc]
            let makeOrdersDstAmount = [orderDst, orderDst.add(200), orderDst.add(500)];
            let badDstAmounts  = [orderDst, orderDst.add(200), orderDst.add(500), orderDst];
            let hintArray = [0, 0, 0];
            let badHintArr = [0, 0, 0, 0]
            let isBuyOrder = [true, true, true];
            let badIsBuyOrder = [true, true];

            let totalPayValue = new BigNumber(0);
            for (let i = 0; i < makeOrdersSrcAmounts.length; i++) {
                totalPayValue = totalPayValue.add(makeOrdersDstAmount[i]);
            }

            //legal batch update order
            rc = await reserve.addOrderBatch(isBuyOrder, makeOrdersSrcAmounts, makeOrdersDstAmount, hintArray,
                                        isAfterMyPrevOrder, {from: maker1});

            let ordersArray = [firstFreeOrderIdPerReserveList,
                               firstFreeOrderIdPerReserveList*1 + 1*1,
                               firstFreeOrderIdPerReserveList*1 + 2*1];

            let badOrdersArray = [firstFreeOrderIdPerReserveList,
                                  firstFreeOrderIdPerReserveList*1 + 1*1];


            rc = await reserve.updateOrderBatch(isBuyOrder, ordersArray, makeOrdersSrcAmounts,
                            makeOrdersDstAmount, hintArray, {from: maker1})

            //failing update batch orders
            try {
                rc = await reserve.updateOrderBatch(badIsBuyOrder, ordersArray, makeOrdersSrcAmounts,
                            makeOrdersDstAmount, hintArray, {from: maker1})
                assert(false, "throw was expected in line above.")
            } catch(e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }

            try {
                rc = await reserve.updateOrderBatch(isBuyOrder, badOrdersArray, makeOrdersSrcAmounts,
                            makeOrdersDstAmount, hintArray, {from: maker1})
                assert(false, "throw was expected in line above.")
            } catch(e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }

            try {
                rc = await reserve.updateOrderBatch(isBuyOrder, ordersArray, badSrcAmounts,
                                makeOrdersDstAmount, hintArray, {from: maker1})
                assert(false, "throw was expected in line above.")
            } catch(e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }

            try {
                rc = await reserve.updateOrderBatch(isBuyOrder, ordersArray, makeOrdersSrcAmounts,
                                badDstAmounts, hintArray, {from: maker1})
                assert(false, "throw was expected in line above.")
            } catch(e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }

            try {
                rc = await reserve.updateOrderBatch(isBuyOrder, ordersArray, makeOrdersSrcAmounts,
                            makeOrdersDstAmount, badHintArr, {from: maker1})
                assert(false, "throw was expected in line above.")
            } catch(e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }
        })


        it("verify trade not from network reverts", async() => {
            let tokenWeiDepositAmount = 90 * 10 ** 18;
            let kncTweiDepositAmount = 600 * 10 ** 18;
            let ethWeiDepositAmount = 10 * 10 ** 18;
            await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount.valueOf(), kncTweiDepositAmount.valueOf());

            let valueWei = 5 * 10 ** 18;
            let valueTwei = 15 * 10 ** 18;

            //add order
            await reserve.submitTokenToEthOrder(valueTwei, valueWei, {from: maker1});

            // legal trade - from network
            let payValueWei = 3000;
            await reserve.trade(ethAddress, payValueWei, tokenAdd, user1, 300, false, {from: network, value: payValueWei});

            try {
                await reserve.trade(ethAddress, payValueWei, tokenAdd, user1, 300, false, {from: maker3, value: payValueWei});
                assert(false, "throw was expected in line above.")
            } catch(e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }
        });

        it("verify trade with src Amount >= max qty reverts.", async() => {
            let tokenWeiDepositAmount = 0 * 10 ** 18;
            let kncTweiDepositAmount = 600 * 10 ** 18;
            let ethWeiDepositAmount = 7 * 10 ** 18;
            await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount.valueOf(), kncTweiDepositAmount.valueOf());

            let valueWei = 2 * 10 ** 18;
            let valueTwei = MAX_QTY.sub(1);

            //add order
            await reserve.submitEthToTokenOrder(valueWei, valueTwei, {from: maker1});
            await reserve.submitEthToTokenOrder(valueWei, valueTwei, {from: maker1});
            await reserve.submitEthToTokenOrder(valueWei, valueTwei, {from: maker1});

            // legal trade - below max Qty
            let payValueTwei = MAX_QTY;
            await token.transfer(network, payValueTwei);
            await token.approve(reserve.address, payValueTwei, {from: network})
            await reserve.trade(tokenAdd, payValueTwei, ethAddress, user1, 300, false, {from: network});

            payValueTwei = payValueTwei.add(1);
            await token.transfer(network, payValueTwei);
            await token.approve(reserve.address, payValueTwei, {from: network})

            try {
                await reserve.trade(tokenAdd, payValueTwei, ethAddress, user1, 300, false, {from: network});
                assert(false, "throw was expected in line above.")
            } catch(e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }
        });
    });

    describe ("deposit funds, bind funds, withdraw funds", function() {
        it("maker deposit tokens, ethers, knc, validate updated in contract", async () => {
            let tokenWeiDepositAmount = 50 * 10 ** 18;
            let kncTweiDepositAmount = 600 * 10 ** 18;
            let ethWeiDepositAmount = 2 * 10 ** 18;

            await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount.valueOf(), kncTweiDepositAmount.valueOf());

            let rxNumTwei = await reserve.makerFunds(maker1, tokenAdd);
            assert.equal(rxNumTwei.valueOf(), tokenWeiDepositAmount);

            let rxKncTwei = await reserve.makerUnlockedKnc(maker1);
            assert.equal(rxKncTwei.valueOf(), kncTweiDepositAmount);

            rxKncTwei = await reserve.makerStakedKnc(maker1);
            assert.equal(rxKncTwei.valueOf(), 0);

            //makerDepositEther
            let rxWei = await reserve.makerFunds(maker1, ethAddress);
            assert.equal(rxWei.valueOf(), ethWeiDepositAmount);

            await reserve.withdrawEther( rxWei, {from: maker1})
            rxWei = await reserve.makerFunds(maker1, ethAddress);
            assert.equal(rxWei.valueOf(), 0);
        });

        it("maker deposit tokens, ethers, knc, withdraw and see sums updated", async () => {
            let tokenWeiDepositAmount = 50 * 10 ** 18;
            let kncTweiDepositAmount = 60 * 10 ** 18;
            let ethWeiDepositAmount = 2 * 10 ** 18;

            await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount.valueOf(), kncTweiDepositAmount.valueOf());

            let rxNumTwei = await reserve.makerFunds(maker1, tokenAdd);
            assert.equal(rxNumTwei.valueOf(), tokenWeiDepositAmount);

            let rxKncTwei = await reserve.makerUnlockedKnc(maker1);
            assert.equal(rxKncTwei.valueOf(), kncTweiDepositAmount);

            rxKncTwei = await reserve.makerStakedKnc(maker1);
            assert.equal(rxKncTwei.valueOf(), 0);

            let rxWei = await reserve.makerFunds(maker1, ethAddress);
            assert.equal(rxWei.valueOf(), ethWeiDepositAmount);

            //withdrawEth
            await reserve.withdrawEther( rxWei, {from: maker1})
            rxWei = await reserve.makerFunds(maker1, ethAddress);
            assert.equal(rxWei.valueOf(), 0);

            //withdraw token
            await reserve.withdrawToken(tokenWeiDepositAmount / 2, {from: maker1})
            rxTwei = await reserve.makerFunds(maker1, tokenAdd);
            assert.equal(rxTwei.valueOf(), (tokenWeiDepositAmount / 2));

            //withdraw knc
            await reserve.withdrawKncFee(kncTweiDepositAmount / 2, {from: maker1})
            rxKncTwei = await reserve.makerUnlockedKnc(maker1);
            assert.equal(rxKncTwei.valueOf(), (kncTweiDepositAmount / 2));
        });

        it("perform few knc deposits from same maker. later knc deposit from other maker. see sums correct.", async () => {
            let tokenWeiDepositAmount = 500;
            let kncTweiDepositAmount = 10 * 10 ** 18;
            let ethWeiDepositAmount = 300;
            await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);
            await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);
            await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);
            await makerDeposit(maker2, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);
            await makerDeposit(maker2, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

            //maker1 balances
            let rxNumTwei = await reserve.makerFunds(maker1, tokenAdd);
            assert.equal(rxNumTwei.valueOf(), (tokenWeiDepositAmount * 3));

            let rxKncTwei = await reserve.makerUnlockedKnc(maker1);
            assert.equal(rxKncTwei.valueOf(), (kncTweiDepositAmount * 3));

            let rxWei = await reserve.makerFunds(maker1, ethAddress);
            assert.equal(rxWei.valueOf(), (ethWeiDepositAmount * 3));

            //maker2 balances
            rxNumTwei = await reserve.makerFunds(maker2, tokenAdd);
            assert.equal(rxNumTwei.valueOf(), (tokenWeiDepositAmount * 2));

            rxKncTwei = await reserve.makerUnlockedKnc(maker2);
            assert.equal(rxKncTwei.valueOf(), (kncTweiDepositAmount * 2));

            rxWei = await reserve.makerFunds(maker2, ethAddress);
            assert.equal(rxWei.valueOf(), (ethWeiDepositAmount * 2));
        });

        it("perform few knc deposits from same maker. later knc deposit from other maker. see allocated order IDs correct.", async () => {
            let tokenWeiDepositAmount = 500;
            let kncTweiDepositAmount = 300 * 10 ** 18;
            let ethWeiDepositAmount = 10 ** 18;

            await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);
            await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);
            await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);
            await makerDeposit(maker2, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);
            await makerDeposit(maker2, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

            let srcAmountWei = 2 * 10 ** 18;
            let orderDstTwei = 9 * 10 ** 18;

            //add order from maker1
            let rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
            let orderId = rc.logs[0].args.orderId.valueOf();
            assert.equal(orderId, firstFreeOrderIdPerReserveList);

            //add order from maker2
            rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker2});
            orderId = rc.logs[0].args.orderId.valueOf();
            assert.equal(orderId, (firstFreeOrderIdPerReserveList  * 1 + 1 * numOrderIdsPerMaker));
        });

        it("maker deposit knc, test bind knc.", async () => {
            let kncTweiDepositAmount = new BigNumber(2 * 10 ** 18);

            await makerDeposit(maker1, 0, 0, kncTweiDepositAmount.valueOf());

            let stakedKnc = await reserve.makerStakedKnc(maker1);
            assert.equal(stakedKnc.valueOf(), 0);

            let freeKnc = await reserve.makerUnlockedKnc(maker1);
            assert.equal(freeKnc.valueOf(), kncTweiDepositAmount.valueOf());

            let weiValueForStakeCalc = new BigNumber(10 ** 16);
            let expectedStake = await reserve.calcKncStake(weiValueForStakeCalc);
            assert(expectedStake.valueOf() > kncTweiDepositAmount.valueOf(), "expected Stake: " + expectedStake.valueOf() +
                " !< " + kncTweiDepositAmount.valueOf());

            await reserve.testBindStakes(maker1, weiValueForStakeCalc);

            stakedKnc = await reserve.makerStakedKnc(maker1);
            assert.equal(stakedKnc.valueOf(), expectedStake.valueOf());

            freeKnc = await reserve.makerUnlockedKnc(maker1);
            assert.equal(freeKnc.valueOf(), kncTweiDepositAmount.sub(expectedStake).valueOf());

            let weiValueForStakeCalc2nd = 10 ** 15;
            await reserve.testBindStakes(maker1, weiValueForStakeCalc2nd);
            let expectedStake2nd = await reserve.calcKncStake(weiValueForStakeCalc2nd);
            expectedStake = expectedStake.add(expectedStake2nd);

            stakedKnc = await reserve.makerStakedKnc(maker1);
            assert.equal(stakedKnc.valueOf(), expectedStake.valueOf());

            freeKnc = await reserve.makerUnlockedKnc(maker1);
            assert.equal(freeKnc.valueOf(), kncTweiDepositAmount.sub(expectedStake).valueOf());
        });

        it("maker deposit knc, bind knc. test release knc stakes", async () => {
            let kncTweiDepositAmount = new BigNumber(6 * 10 ** 18);

            await makerDeposit(maker1, 0, 0, kncTweiDepositAmount.valueOf());
            let weiValueForStakeCalc = new BigNumber(10 ** 17);
            await reserve.testBindStakes(maker1, weiValueForStakeCalc.valueOf());

            let initialStakedKnc = await reserve.makerStakedKnc(maker1);
            let freeKnc = await reserve.makerUnlockedKnc(maker1);

            // now release
            let releaseAmountWei = 10 ** 17;
            await reserve.testHandleStakes(maker1, releaseAmountWei, 0);
            let expectedKncRelease = await reserve.calcKncStake(releaseAmountWei);

            let stakedKnc = await reserve.makerStakedKnc(maker1);
            assert.equal(stakedKnc.valueOf(), initialStakedKnc.sub(expectedKncRelease).valueOf());

            let expectedFreeKnc = freeKnc.add(expectedKncRelease);
            freeKnc = await reserve.makerUnlockedKnc(maker1);
            assert.equal(freeKnc.valueOf(), expectedFreeKnc.valueOf());
        });

        it("maker add buy token order. see funds updated.", async () => {
            let ethWeiDepositAmount = (new BigNumber(2 * 10 ** 18)).add(200);
            let kncTweiDepositAmount = 600 * 10 ** 18;

            await makerDeposit(maker1, ethWeiDepositAmount.valueOf(), 0, kncTweiDepositAmount.valueOf());

            let srcAmountWei = 2 * 10 ** 18;
            let orderDstTwei = 9 * 10 ** 18;

            //check maker free token funds
            let rxFreeWei = await reserve.makerFunds(maker1, ethAddress);
            assert.equal(rxFreeWei.valueOf(), ethWeiDepositAmount.valueOf() );

            //add order
            let rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
            let expectedFreeWei = ethWeiDepositAmount.sub(srcAmountWei);

            rxFreeWei = await reserve.makerFunds(maker1, ethAddress);
            assert.equal(rxFreeWei.valueOf(), expectedFreeWei.valueOf() );
        });
    });

    describe("add and remove orders", function() {
        it("test getMakerOrders", async() => {
            let ethWeiDepositAmount = 20 * 10 ** 18;
            let kncTweiDepositAmount = 600 * 10 ** 18;
            await makerDeposit(maker1, ethWeiDepositAmount, 0, kncTweiDepositAmount.valueOf());

            let srcAmountWei = 2 * 10 ** 18;
            let orderDstTwei = 9 * 10 ** 18;

            //add order
            let rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
            let order1Id = rc.logs[0].args.orderId.valueOf();

            let orderList = await reserve.getEthToTokenMakerOrderIds(maker1);
            assert.equal(orderList[0].valueOf(), order1Id);

            //add order
            rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
            let order2Id = rc.logs[0].args.orderId.valueOf();
            rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
            let order3Id = rc.logs[0].args.orderId.valueOf();
            rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
            let order4Id = rc.logs[0].args.orderId.valueOf();

            orderList = await reserve.getEthToTokenMakerOrderIds(maker1);
            assert.equal(orderList[0].valueOf(), order1Id);
            assert.equal(orderList[1].valueOf(), order2Id);
            assert.equal(orderList[2].valueOf(), order3Id);
            assert.equal(orderList[3].valueOf(), order4Id);

            await reserve.cancelEthToTokenOrder(orderList[2], {from: maker1});

            orderList = await reserve.getEthToTokenMakerOrderIds(maker1);
            assert.equal(orderList[0].valueOf(), order1Id);
            assert.equal(orderList[1].valueOf(), order2Id);
            assert.equal(orderList[2].valueOf(), order4Id);

            rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
            order3Id = rc.logs[0].args.orderId.valueOf();

            orderList = await reserve.getEthToTokenMakerOrderIds(maker1);
            assert.equal(orderList[0].valueOf(), order1Id);
            assert.equal(orderList[1].valueOf(), order2Id);
            assert.equal(orderList[2].valueOf(), order3Id);
            assert.equal(orderList[3].valueOf(), order4Id);
        });

        it("test getMakerOrders with two makers", async() => {
            let ethWeiDepositAmount = 20 * 10 ** 18;
            let kncTweiDepositAmount = 600 * 10 ** 18;
            await makerDeposit(maker1, ethWeiDepositAmount, 0, kncTweiDepositAmount.valueOf());
            await makerDeposit(maker2, ethWeiDepositAmount, 0, kncTweiDepositAmount.valueOf());

            let srcAmountWei = 2 * 10 ** 18;
            let orderDstTwei = 9 * 10 ** 18;

            //add orders maker1
            let rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
            let maker1order1Id = rc.logs[0].args.orderId.valueOf();
            rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
            let maker1order2Id = rc.logs[0].args.orderId.valueOf();
            rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
            let maker1order3Id = rc.logs[0].args.orderId.valueOf();
            rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
            let maker1order4Id = rc.logs[0].args.orderId.valueOf();

            //query orders maker1
            orderList = await reserve.getEthToTokenMakerOrderIds(maker1);
            assert.equal(orderList[0].valueOf(), maker1order1Id);
            assert.equal(orderList[1].valueOf(), maker1order2Id);
            assert.equal(orderList[2].valueOf(), maker1order3Id);
            assert.equal(orderList[3].valueOf(), maker1order4Id);

            //add orders maker2
            rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker2});
            let maker2order1Id = rc.logs[0].args.orderId.valueOf();
            rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker2});
            let maker2order2Id = rc.logs[0].args.orderId.valueOf();
            rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker2});
            let maker2order3Id = rc.logs[0].args.orderId.valueOf();

            //query maker2
            orderList = await reserve.getEthToTokenMakerOrderIds(maker2);
            assert.equal(orderList[0].valueOf(), maker2order1Id);
            assert.equal(orderList[1].valueOf(), maker2order2Id);
            assert.equal(orderList[2].valueOf(), maker2order3Id);

            // cancler orders maker 1
            await reserve.cancelEthToTokenOrder(maker1order3Id, {from: maker1});
            await reserve.cancelEthToTokenOrder(maker1order1Id, {from: maker1});

            //query maker1 again
            orderList = await reserve.getEthToTokenMakerOrderIds(maker1);
            assert.equal(orderList[0].valueOf(), maker1order2Id);
            assert.equal(orderList[1].valueOf(), maker1order4Id);

            // Cancel for maker2 and query
            await reserve.cancelEthToTokenOrder(maker2order2Id, {from: maker2});
            orderList = await reserve.getEthToTokenMakerOrderIds(maker2);
            assert.equal(orderList[0].valueOf(), maker2order1Id);
            assert.equal(orderList[1].valueOf(), maker2order3Id);

            //submer for maker1 and query
            rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
            maker1order1Id = rc.logs[0].args.orderId.valueOf();

            orderList = await reserve.getEthToTokenMakerOrderIds(maker1);
            assert.equal(orderList[0].valueOf(), maker1order1Id);
            assert.equal(orderList[1].valueOf(), maker1order2Id);
            assert.equal(orderList[2].valueOf(), maker1order4Id);
        });

        it("maker add buy token order. see rate updated. verify order details.", async () => {
            let ethWeiDepositAmount = 20 * 10 ** 18;
            let kncTweiDepositAmount = 600 * 10 ** 18;
            await makerDeposit(maker1, ethWeiDepositAmount, 0, kncTweiDepositAmount.valueOf());

            let srcAmountWei = 2 * 10 ** 18;
            let orderDstTwei = 9 * 10 ** 18;

            // first getConversionRate should return 0
    //        getConversionRate(ERC20 src, ERC20 dest, uint srcQty, uint blockNumber) public view returns(uint)
            let rate = await reserve.getConversionRate(tokenAdd, ethAddress, 10 ** 18, 0);
            assert.equal(rate.valueOf(), 0);

            //add order
            let rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
            let orderId = rc.logs[0].args.orderId.valueOf();

            let orderDetails = await reserve.getEthToTokenOrder(rc.logs[0].args.orderId.valueOf());
    //        log(orderDetails);

            assert.equal(orderDetails[0].valueOf(), maker1);
            assert.equal(orderDetails[1].valueOf(), srcAmountWei);
            assert.equal(orderDetails[2].valueOf(), orderDstTwei);
            assert.equal(orderDetails[3].valueOf(), headId); // prev should be buy head id - since first
            assert.equal(orderDetails[4].valueOf(), tailId); // next should be tail ID - since last

            rate = await reserve.getConversionRate(token.address, ethAddress, 10 ** 18, 0);
    //        log("rate " + rate);
            let expectedRate = precisionUnits.mul(srcAmountWei).div(orderDstTwei).floor();
            assert.equal(rate.valueOf(), expectedRate.valueOf());
        });

        it("maker add eth to token order. rate > MAX_RATE, see revert for add and update.", async () => {
            let ethWeiDepositAmount = 20 * 10 ** 18;
            let kncTweiDepositAmount = 600 * 10 ** 18;
            await makerDeposit(maker1, ethWeiDepositAmount, 0, kncTweiDepositAmount.valueOf());

            srcAmountWei = 2 * 10 ** 18;
            orderDstTwei = new BigNumber(2 * 10 ** 12);

            orderRate = calcRateFromQty(orderDstTwei, srcAmountWei, 18, 18);
            assert.equal(orderRate.valueOf(), max_rate.valueOf());

            let rate = await reserve.getConversionRate(tokenAdd, ethAddress, 10 ** 18, 0);
            assert.equal(rate.valueOf(), 0);

            //add order
            let rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
            log("add gas " + rc.receipt.gasUsed)
            let orderId = rc.logs[0].args.orderId.valueOf();

            rate = await reserve.getConversionRate(token.address, ethAddress, orderDstTwei, 0);
            let expectedRate = precisionUnits.mul(srcAmountWei).div(orderDstTwei).floor();
            assert.equal(rate.valueOf(), expectedRate.valueOf());

            let illegalOrderDstTwei = orderDstTwei.sub(1)
            orderRate = calcRateFromQty(illegalOrderDstTwei, srcAmountWei, 18, 18);
//            log("orderRate " + orderRate.valueOf())
            assert(orderRate.gt(max_rate));

            try {
                await reserve.submitEthToTokenOrder(srcAmountWei, illegalOrderDstTwei, {from: maker1});
                assert(false, "throw was expected in line above.")
            } catch(e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }

            //see also update fails
            try {
                await reserve.updateEthToTokenOrder(orderId, srcAmountWei, illegalOrderDstTwei, {from: maker1});
                assert(false, "throw was expected in line above.")
            } catch(e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }

            rate = await reserve.getConversionRate(token.address, ethAddress, orderDstTwei, 0);
            expectedRate = precisionUnits.mul(srcAmountWei).div(orderDstTwei).floor();
            assert.equal(rate.valueOf(), expectedRate.valueOf());
        });

        it("maker add token to eth order. rate > MAX_RATE, see revert for 'add' and 'update'.", async () => {
            let tokenTweiDepositAmount = 20 * 10 ** 25;
            let kncTweiDepositAmount = 600 * 10 ** 18;
            await makerDeposit(maker1, 0, tokenTweiDepositAmount, kncTweiDepositAmount.valueOf());

            srcAmountTwei = 2 * 10 ** 24;
            orderDstWei = new BigNumber(2 * 10 ** 18);

            orderRate = calcRateFromQty(orderDstWei, srcAmountTwei, 18, 18);
            assert.equal(orderRate.valueOf(), max_rate.valueOf());

            let rate = await reserve.getConversionRate(tokenAdd, ethAddress, 10 ** 18, 0);
            assert.equal(rate.valueOf(), 0);

            //add order
            let rc = await reserve.submitTokenToEthOrder(srcAmountTwei, orderDstWei, {from: maker1});
            log("add gas " + rc.receipt.gasUsed)
            let orderId = rc.logs[0].args.orderId.valueOf();

            rate = await reserve.getConversionRate(ethAddress, token.address, orderDstTwei, 0);
            let expectedRate = precisionUnits.mul(srcAmountTwei).div(orderDstWei).floor();
            assert.equal(rate.valueOf(), expectedRate.valueOf());

            let illegalOrderDstWei = orderDstWei.sub(1)
            orderRate = calcRateFromQty(illegalOrderDstWei, srcAmountTwei, 18, 18);
            assert(orderRate.gt(max_rate));

            try {
                await reserve.updateEthToTokenOrder(orderId, srcAmountWei, illegalOrderDstWei, {from: maker1});
                assert(false, "throw was expected in line above.")
            } catch(e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }

            //see also update fails
            try {
                await reserve.submitEthToTokenOrder(srcAmountWei, illegalOrderDstWei, {from: maker1});
                assert(false, "throw was expected in line above.")
            } catch(e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }

            rate = await reserve.getConversionRate(ethAddress, token.address, orderDstTwei, 0);
            expectedRate = precisionUnits.mul(srcAmountWei).div(orderDstTwei).floor();
            assert.equal(rate.valueOf(), expectedRate.valueOf());
        });

        it("maker add buy token order. cancel order and see canceled.", async () => {
            let ethWeiDepositAmount = new BigNumber(20  * 10 ** 18);
            await makerDeposit(maker1, ethWeiDepositAmount.valueOf(), 0, (600 * 10 ** 18));

            let srcAmountWei = 2 * 10 ** 18;
            let orderDstTwei = 9 * 10 ** 18;

            //add order
            let rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});

            let orderList = await reserve.getEthToTokenOrderList();
            assert.equal(orderList.length, 1);

            rc = await reserve.cancelEthToTokenOrder(orderList[0], {from: maker1});
    //        log(rc.logs[0].args)

            orderList = await reserve.getEthToTokenOrderList();
            assert.equal(orderList.length, 0);
        });

        it("maker add sell token order. see rate updated. verify order details.", async () => {
            let kncTweiDepositAmount = 600 * 10 ** 18;
            let tokenWeiDepositAmount = (new BigNumber(9 * 10 ** 18)).add(3000);
            await makerDeposit(maker1, 0, tokenWeiDepositAmount.valueOf(), kncTweiDepositAmount.valueOf());

            let orderSrcAmountTwei = 9 * 10 ** 18;
            let orderDstWei = 2 * 10 ** 18;

            // first getConversionRate should return 0
            let rate = await reserve.getConversionRate(ethAddress, tokenAdd, 10 ** 18, 0);
            assert.equal(rate.valueOf(), 0);

            //add order
            //////////////
            let rc = await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei, {from: maker1});

            let orderDetails = await reserve.getTokenToEthOrder(rc.logs[0].args.orderId.valueOf());

            assert.equal(orderDetails[0].valueOf(), maker1);
            assert.equal(orderDetails[1].valueOf(), orderSrcAmountTwei);
            assert.equal(orderDetails[2].valueOf(), orderDstWei);
            assert.equal(orderDetails[3].valueOf(), headId); // prev should be sell head id - since first
            assert.equal(orderDetails[4].valueOf(), tailId); // next should be tail ID - since last

            let orderList = await reserve.getTokenToEthOrderList();
            assert.equal(orderList.length, 1); //sell head only
    //        log(orderList);

            rate = await reserve.getConversionRate(ethAddress, token.address, 10 ** 18, 0);
    //        log("rate " + rate);
            let expectedRate = precisionUnits.mul(orderSrcAmountTwei).div(orderDstWei).floor();
            assert.equal(rate.valueOf(), expectedRate.valueOf());
        });

        it("maker add buy token order. update to smaller illegal amount, see reverted.", async () => {
            let ethWeiDepositAmount = (new BigNumber(2 * 10 ** 18)).add(700);
            let kncTweiDepositAmount = new BigNumber(600 * 10 ** 18);
            await makerDeposit(maker1, ethWeiDepositAmount, 0, kncTweiDepositAmount);

            let srcAmountWei = (new BigNumber(2 * 10 ** 18)).add(300);
            let orderDstTwei = 9 * 10 ** 18;

            //check maker free token funds
            let rxFreeWei = await reserve.makerFunds(maker1, ethAddress);
            assert.equal(rxFreeWei.valueOf(), ethWeiDepositAmount.valueOf() );

            //add order
            let rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
            let orderId = rc.logs[0].args.orderId.valueOf();

            let expectedFreeWei = ethWeiDepositAmount.sub(srcAmountWei);
            rxFreeWei = await reserve.makerFunds(maker1, ethAddress);
            assert.equal(rxFreeWei.valueOf(), expectedFreeWei.valueOf() );


            let expectedStake = await reserve.calcKncStake(srcAmountWei);
            let actualStake = await reserve.makerStakedKnc(maker1);
            assert.equal(expectedStake.valueOf(), actualStake.valueOf());
            let freeKnc = await reserve.makerUnlockedKnc(maker1);
            assert.equal(freeKnc.valueOf(), kncTweiDepositAmount.sub(expectedStake).valueOf());
            let updatedSource = (new BigNumber(2 * 10 ** 18)).sub(100);

            // update source amount
            try {
                rc = await reserve.updateEthToTokenOrder(orderId, updatedSource, orderDstTwei, {from: maker1});
                assert(false, "throw was expected in line above.")
            } catch(e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }

            rxFreeWei = await reserve.makerFunds(maker1, ethAddress);
            assert.equal(rxFreeWei.valueOf(), expectedFreeWei.valueOf());

            expectedStake = await reserve.calcKncStake(srcAmountWei);
            actualStake = await reserve.makerStakedKnc(maker1);
            assert.equal(expectedStake.valueOf(), actualStake.valueOf());
            freeKnc = await reserve.makerUnlockedKnc(maker1);
            assert.equal(freeKnc.valueOf(), kncTweiDepositAmount.sub(expectedStake).valueOf());
        });

        it("maker add few buy orders. update order with/out change position. see position correct", async() => {
            let ethWeiDepositAmount = (new BigNumber(8 * 10 ** 18)).add(6000);
            let kncTweiDepositAmount = new BigNumber(600 * 10 ** 18);
            await makerDeposit(maker1, ethWeiDepositAmount, 0, kncTweiDepositAmount);

            let srcAmountWei = (new BigNumber(2 * 10 ** 18)).add(300); // 2 ether
            let orderDstTwei = new BigNumber(9 * 10 ** 18);

            // insert 1st order
            let rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
            let order1ID = rc.logs[0].args.orderId.valueOf();

            // insert order as 2nd
            orderDstTwei = orderDstTwei.add(100);
            rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
            let order2ID = rc.logs[0].args.orderId.valueOf();

            // insert order as 3rd
            orderDstTwei = orderDstTwei.add(100);
            rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
            let order3ID = rc.logs[0].args.orderId.valueOf();

            // insert order as 4th
            orderDstTwei = orderDstTwei.add(100);
            rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
            let order4ID = rc.logs[0].args.orderId.valueOf();

            // get order list and see 2nd order is 2nd
            let list = await reserve.getEthToTokenOrderList();
            assert.equal(list[1].valueOf(), order2ID);

            //get 2nd order data.
            orderDetails = await reserve.getEthToTokenOrder(order2ID);
            let order2DestTwei = new BigNumber(orderDetails[2].valueOf());
            order2DestTwei = order2DestTwei.add(50);

            //update order
            await reserve.updateEthToTokenOrder(order2ID, srcAmountWei, order2DestTwei, {from: maker1});

            // get order list and see 2nd order is 2nd
            list = await reserve.getEthToTokenOrderList();
            assert.equal(list[1].valueOf(), order2ID);

            //now update so position changes to 3rd
            order2DestTwei = order2DestTwei.add(70);

            //update order
            await reserve.updateEthToTokenOrder(order2ID, srcAmountWei, order2DestTwei, {from: maker1});

            // get order list and see 2nd order is 3rd now
            list = await reserve.getEthToTokenOrderList();
            assert.equal(list[2].valueOf(), order2ID);

            //now update so position changes to 1st
            order2DestTwei = order2DestTwei.sub(500);

            //update order
            await reserve.updateEthToTokenOrder(order2ID, srcAmountWei, order2DestTwei, {from: maker1});

            // get order list and see 2nd order is 1st now
            list = await reserve.getEthToTokenOrderList();
            assert.equal(list[0].valueOf(), order2ID);
        });

        it("verify order sorting can handle minimum value differences.", async() => {
            let ethWeiDepositAmount = (new BigNumber(6 * 10 ** 18)).add(6000);
            let kncTweiDepositAmount = new BigNumber(600 * 10 ** 18);
            await makerDeposit(maker1, ethWeiDepositAmount, 0, kncTweiDepositAmount);

            let srcAmountWei = (new BigNumber(2 * 10 ** 18)).add(300); // 2 ether
            let orderDstTwei = new BigNumber(9 * 10 ** 18);

            // insert 1st order
            let rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
            let order1ID = rc.logs[0].args.orderId.valueOf();

            // insert order as 2nd
            rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei.add(1), {from: maker1});
            let order2ID = rc.logs[0].args.orderId.valueOf();

            // insert order as 1st
            rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei.sub(1), {from: maker1});
            let order3ID = rc.logs[0].args.orderId.valueOf();

            list = await reserve.getEthToTokenOrderList();
    //        log(list)
            assert.equal(list[0].valueOf(), order3ID);
            assert.equal(list[1].valueOf(), order1ID);
            assert.equal(list[2].valueOf(), order2ID);
        })

        it("maker add few buy orders. update order with correct hints. with / without move position. see success and print gas", async() => {
            let ethWeiDepositAmount = (new BigNumber(8 * 10 ** 18)).add(6000);
            let kncTweiDepositAmount = new BigNumber(600 * 10 ** 18);
            await makerDeposit(maker1, ethWeiDepositAmount, 0, kncTweiDepositAmount);

            let srcAmountWei = (new BigNumber(2 * 10 ** 18)).add(300); // 2 ether
            let orderDstTwei = new BigNumber(9 * 10 ** 18);

            // insert 1st order
            let rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
            let order1ID = rc.logs[0].args.orderId.valueOf();

            // insert order as 2nd
            orderDstTwei = orderDstTwei.add(100);
            rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
            let order2ID = rc.logs[0].args.orderId.valueOf();

            // insert order as 3rd
            orderDstTwei = orderDstTwei.add(100);
            rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
            let order3ID = rc.logs[0].args.orderId.valueOf();

            // insert order as 4th
            orderDstTwei = orderDstTwei.add(100);
            rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
            let order4ID = rc.logs[0].args.orderId.valueOf();

            // get order list and see as expected
            let list = await reserve.getEthToTokenOrderList();
            assert.equal(list[0].valueOf(), order1ID);
            assert.equal(list[1].valueOf(), order2ID);
            assert.equal(list[2].valueOf(), order3ID);
            assert.equal(list[3].valueOf(), order4ID);

            //get 2nd order data.
            orderDetails = await reserve.getEthToTokenOrder(order2ID);
            let order2DestTwei = new BigNumber(orderDetails[2].valueOf());
            order2DestTwei = order2DestTwei.add(50);

            //update order only amounts
            rc = await reserve.updateEthToTokenOrderWHint(order2ID, srcAmountWei, order2DestTwei, order1ID, {from: maker1});
            log("update amounts only: " + rc.receipt.gasUsed);

            // get order list and see 2nd order is 2nd
            list = await reserve.getEthToTokenOrderList();
    //        log("list " + list)
            assert.equal(list[1].valueOf(), order2ID);

            //now update so position changes to 3rd
            order2DestTwei = order2DestTwei.add(70);

            rc = await reserve.updateEthToTokenOrderWHint(order2ID, srcAmountWei, order2DestTwei, order3ID, {from: maker1});
            log("update position with hint to 3rd: " + rc.receipt.gasUsed);
            list = await reserve.getEthToTokenOrderList();
            assert.equal(list[2].valueOf(), order2ID);

            //now update so position changes to 1st
            order2DestTwei = order2DestTwei.sub(500);

            //update order only amounts
            rc = await reserve.updateEthToTokenOrderWHint(order2ID, srcAmountWei, order2DestTwei, headId, {from: maker1});
            log("update position with hint to first: " + rc.receipt.gasUsed);

            // get order list and see 2nd order is 1st now
            list = await reserve.getEthToTokenOrderList();
    //        log("list" + list)
            assert.equal(list[0].valueOf(), order2ID);
        });

        it("maker adds buy orders. compare gas for update with / without hint", async() => {
            let ethWeiDepositAmount = (new BigNumber(8 * 10 ** 18)).add(6000);
            let kncTweiDepositAmount = new BigNumber(600 * 10 ** 18);
            await makerDeposit(maker1, ethWeiDepositAmount, 0, kncTweiDepositAmount);

            let srcAmountWei = (new BigNumber(2 * 10 ** 18)).add(500); // 2 ether
            let orderDstTwei = new BigNumber(9 * 10 ** 18);

            // insert 1st order
            let rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
            let order1ID = rc.logs[0].args.orderId.valueOf();
            rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei.add(200), {from: maker1});
            let order2ID = rc.logs[0].args.orderId.valueOf();
            rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei.add(300), {from: maker1});
            let order3ID = rc.logs[0].args.orderId.valueOf();
            rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei.add(400), {from: maker1});
            let order4ID = rc.logs[0].args.orderId.valueOf();

            // update first to be last without hint
            rc = await reserve.updateEthToTokenOrder(order1ID, srcAmountWei, orderDstTwei.add(500), {from: maker1});
            let updateWithoutHint = rc.receipt.gasUsed;

            let list = await reserve.getEthToTokenOrderList();
            assert.equal(list[3].valueOf(), order1ID);

            // update first to be last with hint
            rc = await reserve.updateEthToTokenOrderWHint(order2ID, srcAmountWei, orderDstTwei.add(600), order1ID, {from: maker1});
            let updateWithHint = rc.receipt.gasUsed;
            list = await reserve.getEthToTokenOrderList();
            assert.equal(list[3].valueOf(), order2ID);

            assert(updateWithoutHint - updateWithHint > 2000, "Expected update with hint to be at least 2000 gas less. With hint: " +
                    updateWithHint + " without hint: " + updateWithoutHint);
        })

        it("maker add 2 buy orders. get hint for next buy order and see correct", async() => {
            let ethWeiDepositAmount = (new BigNumber(4 * 10 ** 18)).add(6000);
            let kncTweiDepositAmount = new BigNumber(600 * 10 ** 18);
            await makerDeposit(maker1, ethWeiDepositAmount, 0, kncTweiDepositAmount);

            let srcAmountWei = (new BigNumber(2 * 10 ** 18)).add(500); // 2 ether
            let orderDstTwei = new BigNumber(9 * 10 ** 18);

            let rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
            let order1ID = rc.logs[0].args.orderId.valueOf();

            // insert order as last in list
            orderDstTwei = orderDstTwei.add(2000);

            rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
            let order2ID = rc.logs[0].args.orderId.valueOf();
            orderDetails = await reserve.getEthToTokenOrder(rc.logs[0].args.orderId.valueOf());
            assert.equal(orderDetails[3].valueOf(), order1ID);
            assert.equal(orderDetails[4].valueOf(), tailId); // next should be tail ID - since last

            // get add hint if set as first
            orderDstTwei = orderDstTwei.sub(3000);
            let prevOrder = await reserve.getEthToTokenAddOrderHint(srcAmountWei, orderDstTwei);
            assert.equal(prevOrder.valueOf(), headId);

            // get add hint if set as 2nd
            orderDstTwei = orderDstTwei.add(2000);
            prevOrder = await reserve.getEthToTokenAddOrderHint(srcAmountWei, orderDstTwei);
            assert.equal(prevOrder.valueOf(), order1ID);

            // get add hint if set as 3rd = last
            orderDstTwei = orderDstTwei.add(2000);
            prevOrder = await reserve.getEthToTokenAddOrderHint(srcAmountWei, orderDstTwei);
            assert.equal(prevOrder.valueOf(), order2ID);
        });

        it("maker add 2 sell orders. get hint for next sell order and see correct", async() => {
            let tokenWeiDepositAmount = new BigNumber(500).mul(10 ** 18); // 500 tokens
            let kncTweiDepositAmount = 600 * 10 ** 18;
            await makerDeposit(maker1, 0, tokenWeiDepositAmount, kncTweiDepositAmount);

            let orderDestWei = (new BigNumber(2 * 10 ** 18)).add(2000); // 2 ether
            let srcAmountTwei = new BigNumber(9 * 10 ** 18);

            let rc = await reserve.submitTokenToEthOrder(srcAmountTwei, orderDestWei, {from: maker1});
            let order1ID = rc.logs[0].args.orderId.valueOf();

            orderDestWei = orderDestWei.add(2000);

            rc = await reserve.submitTokenToEthOrder(srcAmountTwei, orderDestWei, {from: maker1});
            let order2ID = rc.logs[0].args.orderId.valueOf();
            orderDetails = await reserve.getTokenToEthOrder(rc.logs[0].args.orderId.valueOf());
            assert.equal(orderDetails[3].valueOf(), order1ID);
            assert.equal(orderDetails[4].valueOf(), tailId); // next should be tail ID - since last

            // get add hint if set as first
            orderDestWei = orderDestWei.sub(3000);
            let prevOrder = await reserve.getTokenToEthAddOrderHint(srcAmountTwei, orderDestWei);
            assert.equal(prevOrder.valueOf(), headId);

            // get add hint if set as 2nd
            orderDestWei = orderDestWei.add(2000);
            prevOrder = await reserve.getTokenToEthAddOrderHint(srcAmountTwei, orderDestWei);
            assert.equal(prevOrder.valueOf(), order1ID);

            // get add hint if set as 3rd = last
            orderDestWei = orderDestWei.add(2000);
            prevOrder = await reserve.getTokenToEthAddOrderHint(srcAmountTwei, orderDestWei);
            assert.equal(prevOrder.valueOf(), order2ID);
        });

        it("maker add 3 buy orders. test get hint for updating last order to different amounts", async() => {
            let ethWeiDepositAmount = (new BigNumber(6 * 10 ** 18)).add(20000);
            let kncTweiDepositAmount = new BigNumber(600 * 10 ** 18);
            await makerDeposit(maker1, ethWeiDepositAmount, 0, kncTweiDepositAmount);

            let srcAmountWei = (new BigNumber(2 * 10 ** 18)).add(500); // 2 ether
            let orderDstTwei = new BigNumber(9 * 10 ** 18);

            let rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
            let order1ID = rc.logs[0].args.orderId.valueOf();

            // insert order as 2nd in list
            orderDstTwei = orderDstTwei.add(2000);

            rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
            let order2ID = rc.logs[0].args.orderId.valueOf();
            orderDetails = await reserve.getEthToTokenOrder(rc.logs[0].args.orderId.valueOf());
            assert.equal(orderDetails[3].valueOf(), order1ID);
            assert.equal(orderDetails[4].valueOf(), tailId); // next should be tail ID - since last

            // insert order as 3rd in list
            orderDstTwei = orderDstTwei.add(2000);

            rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
            let order3ID = rc.logs[0].args.orderId.valueOf();
            orderDetails = await reserve.getEthToTokenOrder(rc.logs[0].args.orderId.valueOf());
            assert.equal(orderDetails[3].valueOf(), order2ID);
            assert.equal(orderDetails[4].valueOf(), tailId); // next should be tail ID - since last

            // get update hint with small amount change.
            orderDstTwei = orderDstTwei.add(100);
            let prevOrder = await reserve.getEthToTokenUpdateOrderHint(order3ID, srcAmountWei, orderDstTwei);
            assert.equal(prevOrder.valueOf(), order2ID);

            // get update hint
            orderDstTwei = orderDstTwei.sub(2200);
            prevOrder = await reserve.getEthToTokenUpdateOrderHint(order3ID, srcAmountWei, orderDstTwei);
            assert.equal(prevOrder.valueOf(), order1ID);

            // get update hint
            orderDstTwei = orderDstTwei.sub(2000);
            prevOrder = await reserve.getEthToTokenUpdateOrderHint(order3ID, srcAmountWei, orderDstTwei);
            assert.equal(prevOrder.valueOf(), headId);
        });

        it("maker add 3 sell orders. test get hint for updating last order to different amounts", async() => {
            let tokenWeiDepositAmount = new BigNumber(500).mul(10 ** 18); // 500 tokens
            let kncTweiDepositAmount = 600 * 10 ** 18;
            await makerDeposit(maker1, 0, tokenWeiDepositAmount, kncTweiDepositAmount);

            let orderDestWei = (new BigNumber(2 * 10 ** 18)).add(800); // 2 ether
            let srcAmountTwei = new BigNumber(9 * 10 ** 18);

            let rc = await reserve.submitTokenToEthOrder(srcAmountTwei, orderDestWei, {from: maker1});
            let order1ID = rc.logs[0].args.orderId.valueOf();

            // insert order as 2nd in list
            orderDestWei = orderDestWei.add(2000);

            rc = await reserve.submitTokenToEthOrder(srcAmountTwei, orderDestWei, {from: maker1});
            let order2ID = rc.logs[0].args.orderId.valueOf();
            orderDetails = await reserve.getTokenToEthOrder(rc.logs[0].args.orderId.valueOf());
            assert.equal(orderDetails[3].valueOf(), order1ID);
            assert.equal(orderDetails[4].valueOf(), tailId); // next should be tail ID - since last

            // insert order as 3rd in list
            orderDestWei = orderDestWei.add(2000);

            rc = await reserve.submitTokenToEthOrder(srcAmountTwei, orderDestWei, {from: maker1});
            let order3ID = rc.logs[0].args.orderId.valueOf();
            orderDetails = await reserve.getTokenToEthOrder(rc.logs[0].args.orderId.valueOf());
            assert.equal(orderDetails[3].valueOf(), order2ID);
            assert.equal(orderDetails[4].valueOf(), tailId); // next should be tail ID - since last

            // get update hint with small amount change.
            orderDestWei = orderDestWei.add(100);
            let prevOrder = await reserve.getTokenToEthUpdateOrderHint(order3ID, srcAmountTwei, orderDestWei);
            assert.equal(prevOrder.valueOf(), order2ID);

            // get update hint
            orderDestWei = orderDestWei.sub(2200);
            prevOrder = await reserve.getTokenToEthUpdateOrderHint(order3ID, srcAmountTwei, orderDestWei);
            assert.equal(prevOrder.valueOf(), order1ID);

            // get update hint
            orderDestWei = orderDestWei.sub(2000);
            prevOrder = await reserve.getTokenToEthUpdateOrderHint(order3ID, srcAmountTwei, orderDestWei);
            assert.equal(prevOrder.valueOf(), headId);
        });

        it("maker add few buy orders. update order with wrong hint. see success and print gas", async() => {
            let ethWeiDepositAmount = (new BigNumber(8 * 10 ** 18)).add(9000);
            let kncTweiDepositAmount = new BigNumber(600 * 10 ** 18);
            await makerDeposit(maker1, ethWeiDepositAmount, 0, kncTweiDepositAmount);

            let srcAmountWei = (new BigNumber(2 * 10 ** 18)).add(800); // 2 ether
            let orderDstTwei = new BigNumber(1.4 * 10 ** 18);

            // insert 1st order
            let rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
            let order1ID = rc.logs[0].args.orderId.valueOf();

            // insert order as 2nd
            orderDstTwei = orderDstTwei.add(100);
            rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
            let order2ID = rc.logs[0].args.orderId.valueOf();

            // insert order as 3rd
            orderDstTwei = orderDstTwei.add(100);
            rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
            let order3ID = rc.logs[0].args.orderId.valueOf();

            // insert order as 4th
            orderDstTwei = orderDstTwei.add(100);
            rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
            let order4ID = rc.logs[0].args.orderId.valueOf();

            // get order list and see 2nd order is 2nd
            let list = await reserve.getEthToTokenOrderList();
    //        log("list " + list)
            assert.equal(list[1].valueOf(), order2ID);

            //get 2nd order data.
            orderDetails = await reserve.getEthToTokenOrder(order2ID);
            let order2DestTwei = new BigNumber(orderDetails[2].valueOf());
            order2DestTwei = order2DestTwei.add(120);

            //update order to 3rd place. wrong hint
            rc = await reserve.updateEthToTokenOrderWHint(order2ID, srcAmountWei, order2DestTwei, headId, {from: maker1});
            log("update position with wrong hint: " + rc.receipt.gasUsed);

            // get order list and see order2 is 3rd now
            list = await reserve.getEthToTokenOrderList();
            assert.equal(list[2].valueOf(), order2ID);

            //now update so position changes to 1st with wrong hint
            order2DestTwei = order2DestTwei.sub(1000);

            //update order
            rc = await reserve.updateEthToTokenOrderWHint(order2ID, srcAmountWei, order2DestTwei, order3ID, {from: maker1});
            log("update position again with wrong hint: " + rc.receipt.gasUsed);

            // get order list and see order2 is 1st now
            list = await reserve.getEthToTokenOrderList();
    //        log("list" + list)
            assert.equal(list[0].valueOf(), order2ID);
        });

        it("maker add buy order. update order with another maker. see reverted.", async() => {
            let ethWeiDepositAmount = (new BigNumber(2 * 10 ** 18)).add(9000);
            let kncTweiDepositAmount = new BigNumber(600 * 10 ** 18);
            await makerDeposit(maker1, ethWeiDepositAmount, 0, kncTweiDepositAmount);

            let srcAmountWei = (new BigNumber(2 * 10 ** 18)).add(300); // 2 ether
            let orderDstTwei = new BigNumber(9 * 10 ** 18);

            // insert 1st order
            let rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
            let order1ID = rc.logs[0].args.orderId.valueOf();

            srcAmountWei = srcAmountWei.add(500);

            try {
                await reserve.updateEthToTokenOrderWHint(order1ID, srcAmountWei, orderDstTwei, headId, {from: maker2});
                assert(false, "throw was expected in line above.")
            } catch(e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }

            try {
                await reserve.updateEthToTokenOrder(order1ID, srcAmountWei, orderDstTwei, {from: maker2});
                assert(false, "throw was expected in line above.")
            } catch(e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }

            rc = await reserve.updateEthToTokenOrderWHint(order1ID, srcAmountWei, orderDstTwei, headId, {from: maker1});
        });

        it("maker add few buy and sell orders and perform batch update - only amounts. compare gas no hint and good hint.", async() => {
            let tokenWeiDepositAmount = new BigNumber(500).mul(10 ** 18); // 500 tokens
            let kncTweiDepositAmount = 600 * 10 ** 18;
            let ethWeiDepositAmount = (new BigNumber(4 * 10 ** 18)).add(3000);

            await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

            let srcAmountWei = (new BigNumber(2 * 10 ** 18)).add(250); // 2 ether
            let destAmounTwei = new BigNumber(9 * 10 ** 18);

            // insert buy orders
            let rc = await reserve.submitEthToTokenOrder(srcAmountWei, destAmounTwei, {from: maker1});
            let buyOrder1ID = rc.logs[0].args.orderId.valueOf();
            rc = await reserve.submitEthToTokenOrder(srcAmountWei, destAmounTwei.add(400), {from: maker1});
            let buyOrder2ID = rc.logs[0].args.orderId.valueOf();

            // insert sell orders
            let srcAmountTwei = (new BigNumber(9 * 10 ** 18));
            let orderDestWei = new BigNumber(2 * 10 ** 18);

            rc = await reserve.submitTokenToEthOrder(srcAmountTwei, orderDestWei, {from: maker1});
            let sellOrder1ID = rc.logs[0].args.orderId.valueOf();
            rc = await reserve.submitTokenToEthOrder(srcAmountTwei, orderDestWei.add(400), {from: maker1});
            let sellOrder2ID = rc.logs[0].args.orderId.valueOf();

            //test positions.
            let list = await reserve.getEthToTokenOrderList();
            assert.equal(list[0].valueOf(), buyOrder1ID);
            assert.equal(list[1].valueOf(), buyOrder2ID);

            list = await reserve.getTokenToEthOrderList();
            assert.equal(list[0].valueOf(), sellOrder1ID);
            assert.equal(list[1].valueOf(), sellOrder2ID);

            //create batch update only amounts. no hints.
            let orderTypeArray = [true, true, false, false];
            let ordersArray = [buyOrder1ID, buyOrder2ID, sellOrder1ID, sellOrder2ID];
            let orderNewSrcAmountsArr = [srcAmountWei.add(1).valueOf(), srcAmountWei.add(1).valueOf(),
                                            srcAmountTwei.add(1).valueOf(), srcAmountTwei.add(1).valueOf()];
            let orderNewDstAmountsArr = [destAmounTwei.add(100).valueOf(), destAmounTwei.add(500).valueOf(),
                        orderDestWei.add(100).valueOf(), orderDestWei.add(500).valueOf()];
            let orderHintArray = [0, 0, 0, 0];

    //        log (orderTypeArray)
    //        log (ordersArray)
    //        log (orderNewSrcAmountsArr)
    //        log (orderNewDstAmountsArr)
    //        log (orderHintArray)
    //updateOrderBatch(bool[] isBuyOrder, uint32[] orderId, uint128[] newSrcAmount, uint128[] newDstAmount, uint32[] hintPrevOrder)
            rc = await reserve.updateOrderBatch(orderTypeArray, ordersArray, orderNewSrcAmountsArr, orderNewDstAmountsArr, orderHintArray, {from: maker1})
            let updateBatchNoHintGas = rc.receipt.gasUsed;
            log("update 4 orders batch - only amounts, no hint: " + updateBatchNoHintGas);

            //test positions.
            list = await reserve.getEthToTokenOrderList();
            assert.equal(list[0].valueOf(), buyOrder1ID);
            assert.equal(list[1].valueOf(), buyOrder2ID);

            list = await reserve.getTokenToEthOrderList();
            assert.equal(list[0].valueOf(), sellOrder1ID);
            assert.equal(list[1].valueOf(), sellOrder2ID);

            //now update again with good hint array only amounts. print gas.
            orderNewSrcAmountsArr = [srcAmountWei.add(2).valueOf(), srcAmountWei.add(2).valueOf(),
                                         srcAmountTwei.add(2).valueOf(), srcAmountTwei.add(2).valueOf()];
            orderNewDstAmountsArr = [destAmounTwei.add(20).valueOf(), destAmounTwei.add(420).valueOf(),
                        orderDestWei.add(35).valueOf(), orderDestWei.add(435).valueOf()];
            orderHintArray = [headId, buyOrder1ID, headId, sellOrder1ID];
            rc = await reserve.updateOrderBatch(orderTypeArray, ordersArray, orderNewSrcAmountsArr, orderNewDstAmountsArr, orderHintArray, {from: maker1})
            let updateBatchWithHintGas = rc.receipt.gasUsed;
            log("update 4 orders batch - only amounts, good hint: " + updateBatchWithHintGas);

            //test positions.
            list = await reserve.getEthToTokenOrderList();
    //        log(list)
            assert.equal(list[0].valueOf(), buyOrder1ID);
            assert.equal(list[1].valueOf(), buyOrder2ID);

            list = await reserve.getTokenToEthOrderList();
    //        log(list)
            assert.equal(list[0].valueOf(), sellOrder1ID);
            assert.equal(list[1].valueOf(), sellOrder2ID);

            let expectedGasDiff4BatchOrders = 100000;

            assert(updateBatchWithHintGas < (updateBatchNoHintGas - expectedGasDiff4BatchOrders), "batch with hint gas: " + updateBatchWithHintGas +
                " updateBatchNoHintGas " + updateBatchNoHintGas + " expected diff: " + expectedGasDiff4BatchOrders);
        });

        it("maker add few buy and sell orders and perform batch update + move position. compare gas no hint and good hint.", async() => {
            let tokenWeiDepositAmount = new BigNumber(500 * 10 ** 18); // 500 tokens
            let kncTweiDepositAmount = 700 * 10 ** 18;
            let ethWeiDepositAmount = (new BigNumber(6 * 10 ** 18)).add(3000);

            await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

            let srcAmountWei = (new BigNumber(2 * 10 ** 18)).add(200); // 2 ether
            let destAmountWei = new BigNumber(9 * 10 ** 18);

            // insert 2 buy orders
            let rc = await reserve.submitEthToTokenOrder(srcAmountWei, destAmountWei, {from: maker1});
            let buyOrder1ID = rc.logs[0].args.orderId.valueOf();
            rc = await reserve.submitEthToTokenOrder(srcAmountWei, destAmountWei.add(100), {from: maker1});
            let buyOrder2ID = rc.logs[0].args.orderId.valueOf();
            rc = await reserve.submitEthToTokenOrder(srcAmountWei, destAmountWei.add(200), {from: maker1});
            let buyOrder3ID = rc.logs[0].args.orderId.valueOf();

            // insert 2 sell orders
            let srcAmountTwei = (new BigNumber(9 * 10 ** 18));
            let orderDestWei = new BigNumber(2 * 10 ** 18);

            rc = await reserve.submitTokenToEthOrder(srcAmountTwei, orderDestWei, {from: maker1});
            let sellOrder1ID = rc.logs[0].args.orderId.valueOf();
            rc = await reserve.submitTokenToEthOrder(srcAmountTwei, orderDestWei.add(100), {from: maker1});
            let sellOrder2ID = rc.logs[0].args.orderId.valueOf();
            rc = await reserve.submitTokenToEthOrder(srcAmountTwei, orderDestWei.add(200), {from: maker1});
            let sellOrder3ID = rc.logs[0].args.orderId.valueOf();

            //verify positions.
            let list = await reserve.getEthToTokenOrderList();
            assert.equal(list[0].valueOf(), buyOrder1ID);
            assert.equal(list[1].valueOf(), buyOrder2ID);
            assert.equal(list[2].valueOf(), buyOrder3ID);

            list = await reserve.getTokenToEthOrderList();
            assert.equal(list[0].valueOf(), sellOrder1ID);
            assert.equal(list[1].valueOf(), sellOrder2ID);
            assert.equal(list[2].valueOf(), sellOrder3ID);

            //create batch update so both sell orders and buy orders swap places. no hints.
            let orderTypeArray = [true, true, false, false];
            let ordersArray = [buyOrder1ID, buyOrder2ID, sellOrder1ID, sellOrder2ID];
            let orderNewSrcAmountsArr = [srcAmountWei.add(1).valueOf(), srcAmountWei.add(1).valueOf(),
                        srcAmountTwei.add(1).valueOf(), srcAmountTwei.add(1).valueOf()];
            let orderNewDstAmountsArr = [destAmountWei.add(300).valueOf(), destAmountWei.add(400).valueOf(),
                        orderDestWei.add(300).valueOf(), orderDestWei.add(400).valueOf()];
            let orderHintArray = [0, 0, 0, 0];

    //        log (orderTypeArray)
    //        log (ordersArray)
    //        log (orderNewSrcAmountsArr)
    //        log (orderNewDstAmountsArr)
    //        log (orderHintArray)
    //updateOrderBatch(bool[] isBuyOrder, uint32[] orderId, uint128[] newSrcAmount, uint128[] newDstAmount, uint32[] hintPrevOrder)
            rc = await reserve.updateOrderBatch(orderTypeArray, ordersArray, orderNewSrcAmountsArr, orderNewDstAmountsArr, orderHintArray, {from: maker1})
            let updateBatchNoHintGas = rc.receipt.gasUsed;
            log("update 4 orders batch, no hint: " + updateBatchNoHintGas);

            //test positions.
            list = await reserve.getEthToTokenOrderList();
            assert.equal(list[0].valueOf(), buyOrder3ID);
            assert.equal(list[1].valueOf(), buyOrder1ID);
            assert.equal(list[2].valueOf(), buyOrder2ID);

            list = await reserve.getTokenToEthOrderList();
            assert.equal(list[0].valueOf(), sellOrder3ID);
            assert.equal(list[1].valueOf(), sellOrder1ID);
            assert.equal(list[2].valueOf(), sellOrder2ID);

            //now update again with good hint array. print gas.
            ordersArray = [buyOrder3ID, buyOrder1ID, sellOrder3ID, sellOrder1ID];
            orderNewSrcAmountsArr = [srcAmountWei.add(2).valueOf(), srcAmountWei.add(2).valueOf(),
                                srcAmountTwei.add(2).valueOf(), srcAmountTwei.add(2).valueOf()];
            orderNewDstAmountsArr = [destAmountWei.add(500).valueOf(), destAmountWei.add(600).valueOf(),
                        orderDestWei.add(500).valueOf(), orderDestWei.add(600).valueOf()];
            orderHintArray = [buyOrder2ID, buyOrder3ID, sellOrder2ID, sellOrder3ID];
            rc = await reserve.updateOrderBatch(orderTypeArray, ordersArray, orderNewSrcAmountsArr, orderNewDstAmountsArr, orderHintArray, {from: maker1})
            let updateBatchWithHintGas = rc.receipt.gasUsed;
            log("update 4 orders batch, good hint: " + updateBatchWithHintGas);

            //test positions.
            list = await reserve.getEthToTokenOrderList();
    //        log(list)
            assert.equal(list[0].valueOf(), buyOrder2ID);
            assert.equal(list[1].valueOf(), buyOrder3ID);
            assert.equal(list[2].valueOf(), buyOrder1ID);

            list = await reserve.getTokenToEthOrderList();
    //        log(list)
            assert.equal(list[0].valueOf(), sellOrder2ID);
            assert.equal(list[1].valueOf(), sellOrder3ID);
            assert.equal(list[2].valueOf(), sellOrder1ID);

    //        log("updateBatchWithHintGas " + updateBatchWithHintGas + " updateBatchNoHintGas " + updateBatchNoHintGas)
            assert(updateBatchWithHintGas < (updateBatchNoHintGas - 4000), "expected update with hint to be better by at least 3000 gas");
        });

        it("maker add a few buy orders. see orders added in correct position. print gas price per order", async () => {
            let tokenWeiDepositAmount = new BigNumber(0).mul(10 ** 18);
            let kncTweiDepositAmount = 600 * 10 ** 18;
            let ethWeiDepositAmount = (new BigNumber(10 * 10 ** 18)).add(30000);
            await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

            let srcAmountWei = (new BigNumber(2 * 10 ** 18)).add(200); // 2 ether
            let orderDstTwei = new BigNumber(9 * 10 ** 18);

            let rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});

            let order1ID = rc.logs[0].args.orderId.valueOf();
            let orderDetails = await reserve.getEthToTokenOrder(order1ID);

            assert.equal(orderDetails[0].valueOf(), maker1);
            assert.equal(orderDetails[1].valueOf(), srcAmountWei);
            assert.equal(orderDetails[2].valueOf(), orderDstTwei);
            assert.equal(orderDetails[3].valueOf(), headId); // prev should be buy head id - since first
            assert.equal(orderDetails[4].valueOf(), tailId); // next should be tail ID - since last

            // insert order as last in list
            orderDstTwei = orderDstTwei.add(1000);

            rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
            let order2ID = rc.logs[0].args.orderId.valueOf();

            orderDetails = await reserve.getEthToTokenOrder(order2ID);

            assert.equal(orderDetails[3].valueOf(), order1ID);
            assert.equal(orderDetails[4].valueOf(), tailId); // next should be tail ID - since last

            // insert order as last in list
            orderDstTwei = orderDstTwei.add(1000);

            rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});

            let order3ID = rc.logs[0].args.orderId.valueOf();
            orderDetails = await reserve.getEthToTokenOrder(order3ID);

            assert.equal(orderDetails[3].valueOf(), order2ID);
            assert.equal(orderDetails[4].valueOf(), tailId); // next should be tail ID - since last

            //get order list
            let orderList = await reserve.getEthToTokenOrderList();
    //        log ("list \n" + orderList);
            //get first order details
            orderDetails = await reserve.getEthToTokenOrder(orderList[0].valueOf());

            // insert order as first in list
            let bestOrderSrcAmount = orderDetails[1].add(100);
            let bestOrderDstAmount = orderDetails[2];

            rc = await reserve.submitEthToTokenOrderWHint(bestOrderSrcAmount, bestOrderDstAmount, 0, {from: maker1});
            let order4ID = rc.logs[0].args.orderId.valueOf();

    //        log("order4 " + order4ID)

            orderDetails = await reserve.getEthToTokenOrder(rc.logs[0].args.orderId.valueOf());

            assert.equal(orderDetails[3].valueOf(), headId); // prev should be buy head id - since first
            assert.equal(orderDetails[4].valueOf(), order1ID); // next should be tail ID - since last

            //now insert order as 2nd best.
            let secondBestPayAmount = bestOrderSrcAmount.sub(30).valueOf();
            rc = await reserve.submitEthToTokenOrderWHint(secondBestPayAmount, bestOrderDstAmount, 0, {from: maker1});
            let order5ID = rc.logs[0].args.orderId.valueOf();

            orderDetails = await reserve.getEthToTokenOrder(rc.logs[0].args.orderId.valueOf());

            assert.equal(orderDetails[3].valueOf(), order4ID); // prev should be buy head id - since first
            assert.equal(orderDetails[4].valueOf(), order1ID); // next should be tail ID - since last
        });

        it("maker - check gas price for order reuse is better.", async () => {
            let tokenWeiDepositAmount = new BigNumber(0).mul(10 ** 18);
            let kncTweiDepositAmount = 600 * 10 ** 18;
            let ethWeiDepositAmount = (new BigNumber(10 * 10 ** 18)).add(30000);
            await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

            let srcAmountWei = (new BigNumber(2 * 10 ** 18)).add(2000); // 2 ether
            let orderDstTwei = new BigNumber(9 * 10 ** 18);

            let rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
    //        log("make buy order gas(order 1 in list): ID: " + rc.logs[0].args.orderId.valueOf() + " gas: "+ rc.receipt.gasUsed);
            let gasAmountFirstOrderUse = new BigNumber(rc.receipt.gasUsed);

            // insert order as last in list
            orderDstTwei = orderDstTwei.add(2000);

            rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
    //        log("make buy order gas(order 2 in list): ID: " + rc.logs[0].args.orderId.valueOf() + " gas: "+ rc.receipt.gasUsed);
            gasAmountFirstOrderUse = gasAmountFirstOrderUse.add(rc.receipt.gasUsed);

            // insert order as last in list
            orderDstTwei = orderDstTwei.add(2000);

            rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
    //        log("make buy order gas(order 3 in list): ID: " + rc.logs[0].args.orderId.valueOf() + " gas: "+ rc.receipt.gasUsed);
            gasAmountFirstOrderUse = gasAmountFirstOrderUse.add(rc.receipt.gasUsed);

            orderDstTwei = orderDstTwei.sub(6000);

            rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
    //        log("make buy order gas(order 1 in list): ID: " + rc.logs[0].args.orderId.valueOf() + " gas: "+ rc.receipt.gasUsed);
            gasAmountFirstOrderUse = gasAmountFirstOrderUse.add(rc.receipt.gasUsed);

            //now insert order as 2nd best.
            orderDstTwei = orderDstTwei.add(300);
            rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
    //        log("make buy order gas(order 2 in list): ID: " + rc.logs[0].args.orderId.valueOf() + " gas: "+ rc.receipt.gasUsed);
            gasAmountFirstOrderUse = gasAmountFirstOrderUse.add(rc.receipt.gasUsed);

            let orderList = await reserve.getEthToTokenOrderList();
    //        log("orderList")
    //        log(orderList)
            for (let i = 0; i < orderList.length; i++) {
                //start from 1 since first order is head
                await reserve.cancelEthToTokenOrder(orderList[i].valueOf(), {from: maker1});
            }

            log("cancel all orders and add again.")
            srcAmountWei = (new BigNumber(2 * 10 ** 18)).add(2000); // 2 ether
            orderDstTwei = new BigNumber(9 * 10 ** 18);
            rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
    //        log("make buy order gas(order 1 in list). ID: " + rc.logs[0].args.orderId.valueOf() + " gas: "+ rc.receipt.gasUsed);
            let gasAmountOrderReuse = new BigNumber(rc.receipt.gasUsed);

            // insert order as last in list
            orderDstTwei = orderDstTwei.add(2000);

            rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
    //        log("make buy order gas(order 2 in list). ID: " + rc.logs[0].args.orderId.valueOf() + " gas: "+ rc.receipt.gasUsed);
            gasAmountOrderReuse = gasAmountOrderReuse.add(rc.receipt.gasUsed);

            // insert order as last in list
            orderDstTwei = orderDstTwei.add(2000);

            rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
            gasAmountOrderReuse = gasAmountOrderReuse.add(rc.receipt.gasUsed);

            orderDstTwei = orderDstTwei.sub(6000);

            rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
            gasAmountOrderReuse = gasAmountOrderReuse.add(rc.receipt.gasUsed);

            //now insert order as 2nd best.
            orderDstTwei = orderDstTwei.add(300);
            rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
            gasAmountOrderReuse = gasAmountOrderReuse.add(rc.receipt.gasUsed);

            orderList = await reserve.getEthToTokenOrderList();
    //        log("orderList")
    //        log(orderList)

            for (let i = 0; i < orderList.length ; i++) {
                await reserve.cancelEthToTokenOrder(orderList[i].valueOf(), {from: maker1});
            }

            assert((gasAmountFirstOrderUse.sub(gasAmountOrderReuse)).div(5) >= 30000, "Expecting order reuse gas to be 30k less the fist time use.");
            log("Order reuse gas consumption is " + (gasAmountFirstOrderUse.sub(gasAmountOrderReuse)).div(5) + " less");
        });

        it("maker - compare gas price for making 5 buy orders. one by one in order vs batch add.", async () => {
            let tokenWeiDepositAmount = new BigNumber(0).mul(10 ** 18);
            let kncTweiDepositAmount = 600 * 10 ** 18;
            let ethWeiDepositAmount = (new BigNumber(10 * 10 ** 18)).add(30000);
            await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

            orderSrc = new BigNumber(2 * 10 ** 18);
            orderDst = new BigNumber(6 * 10 ** 18);

            makeOrdersSrcAmounts = [orderSrc, orderSrc, orderSrc, orderSrc, orderSrc];
            makeOrdersDstAmount = [orderDst, orderDst.add(200), orderDst.add(500), orderDst.add(900), orderDst.add(1300)];

            let totalGasMaker1 = new BigNumber(0);
            let totalPayValue = new BigNumber(0);

            for (let i = 0; i < makeOrdersSrcAmounts.length; i++) {
                let rc = await reserve.submitEthToTokenOrderWHint(makeOrdersSrcAmounts[i], makeOrdersDstAmount[i], 0, {from: maker1});
                totalGasMaker1 = totalGasMaker1.add(rc.receipt.gasUsed);
                totalPayValue = totalPayValue.add(makeOrdersDstAmount[i]);
            }

            log ("total gas 5 maker orders. one by one: " + totalGasMaker1.valueOf());

            await token.transfer(network, totalPayValue);
            await token.approve(reserve.address, totalPayValue, {from: network})
            let rc = await reserve.trade(tokenAdd, totalPayValue, ethAddress, user1, 300, false, {from: network});

            //now run batch with maker2
            let hintArray = [0, 0, 0, 0, 0];
            let isAfterMyPrevOrder = [false, false, false, false, false];
            let isBuyOrder = [true, true, true, true, true];

            await makerDeposit(maker2, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

            rc = await reserve.addOrderBatch(isBuyOrder, makeOrdersSrcAmounts, makeOrdersDstAmount, hintArray, isAfterMyPrevOrder, {from: maker2});

            let gasCostBatchAdd = rc.receipt.gasUsed;
            log("add 5 orders batch. gas price: " + rc.receipt.gasUsed);

            assert((totalGasMaker1 - gasCostBatchAdd) > 30000);
            log ("adding 5 orders. batch add less gas: "  + (totalGasMaker1 - gasCostBatchAdd))
        });

        it("make order - compare gas price. add 5th order with / without hint.", async () => {
            let tokenWeiDepositAmount = new BigNumber(0).mul(10 ** 18);
            let kncTweiDepositAmount = 600 * 10 ** 18;
            let ethWeiDepositAmount = (new BigNumber(10 * 10 ** 18)).add(30000);
            await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

            orderSrc = new BigNumber(2 * 10 ** 18);
            orderDst = new BigNumber(6 * 10 ** 18);

            makeOrdersSrcAmounts = [orderSrc, orderSrc, orderSrc, orderSrc, orderSrc];
            makeOrdersDstAmount = [orderDst, orderDst.add(200), orderDst.add(500), orderDst.add(900), orderDst.add(1300)];

            for (let i = 0; i < makeOrdersSrcAmounts.length - 1; i++) {
                let rc = await reserve.submitEthToTokenOrder(makeOrdersSrcAmounts[i], makeOrdersDstAmount[i], {from: maker1});
            }

            let lastOrder = makeOrdersSrcAmounts.length - 1;
            let rc = await reserve.submitEthToTokenOrder(makeOrdersSrcAmounts[lastOrder], makeOrdersDstAmount[lastOrder], {from: maker1});
            let gasWithoutHint = rc.receipt.gasUsed;
            log("5th order without hint: " + rc.receipt.gasUsed);

            orderList = await reserve.getEthToTokenOrderList();
            for (let i = 0; i < orderList.length ; i++) {
                await reserve.cancelEthToTokenOrder(orderList[i].valueOf(), {from: maker1});
            }

            //now run same data with maker 2. add last with hint
            await makerDeposit(maker2, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

            for (let i = 0; i < makeOrdersSrcAmounts.length - 1; i++) {
                rc = await reserve.submitEthToTokenOrderWHint(makeOrdersSrcAmounts[i], makeOrdersDstAmount[i], 0, {from: maker2});
            }

            lastOrder = makeOrdersSrcAmounts.length - 1;
            let prevId = rc.logs[0].args.orderId.valueOf();

            rc = await reserve.submitEthToTokenOrderWHint(makeOrdersSrcAmounts[lastOrder], makeOrdersDstAmount[lastOrder],
                prevId, {from: maker2});

            log("5th order with hint: " + rc.receipt.gasUsed);
            let gasWithHint = rc.receipt.gasUsed;

            log("gas diff 5th order. with / without hint: " + (gasWithoutHint - gasWithHint));
            assert(gasWithoutHint - gasWithHint > 1000, "add with with hint expected to be at least 1000 gas less");

            orderList = await reserve.getEthToTokenOrderList();
            for (let i = 0; i < orderList.length ; i++) {
                await reserve.cancelEthToTokenOrder(orderList[i].valueOf(), {from: maker2});
            }
        });

        it("maker add a few sell orders. see orders added in correct position.", async () => {
            let tokenWeiDepositAmount = new BigNumber(500).mul(10 ** 18);
            let kncTweiDepositAmount = 600 * 10 ** 18;
            let ethWeiDepositAmount = (new BigNumber(0 * 10 ** 18)).add(30000);
            await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

            let orderSrcAmountTwei = new BigNumber(9).mul(10 ** 18);
            let orderDstWei = (new BigNumber(2).mul(10 ** 18)).add(2000);

            let rc = await reserve.submitTokenToEthOrderWHint(orderSrcAmountTwei, orderDstWei, 0, {from: maker1});

            let order1ID = rc.logs[0].args.orderId.valueOf();

            let orderDetails = await reserve.getTokenToEthOrder(rc.logs[0].args.orderId.valueOf());
        //        log(orderDetails);

            assert.equal(orderDetails[0].valueOf(), maker1);
            assert.equal(orderDetails[1].valueOf(), orderSrcAmountTwei);
            assert.equal(orderDetails[2].valueOf(), orderDstWei);
            assert.equal(orderDetails[3].valueOf(), headId); // prev should be buy head id - since first
            assert.equal(orderDetails[4].valueOf(), tailId); // next should be tail ID - since last

            // insert order as last in list
            orderDstWei = orderDstWei.add(2000);

            rc = await reserve.submitTokenToEthOrderWHint(orderSrcAmountTwei, orderDstWei, 0, {from: maker1});

            let order2ID = rc.logs[0].args.orderId.valueOf();

            orderDetails = await reserve.getTokenToEthOrder(rc.logs[0].args.orderId.valueOf());
            //        log(orderDetails);

            assert.equal(orderDetails[3].valueOf(), order1ID); // prev should be buy head id - since first
            assert.equal(orderDetails[4].valueOf(), tailId); // next should be tail ID - since last

            // insert another order as last in list
            orderDstWei = orderDstWei.add(2000);

            rc = await reserve.submitTokenToEthOrderWHint(orderSrcAmountTwei, orderDstWei, 0, {from: maker1});
            let order3ID = rc.logs[0].args.orderId.valueOf();

            orderDetails = await reserve.getTokenToEthOrder(rc.logs[0].args.orderId.valueOf());
            //        log(orderDetails);

            assert.equal(orderDetails[3].valueOf(), order2ID);
            assert.equal(orderDetails[4].valueOf(), tailId);

            //get order list
            let orderList = await reserve.getTokenToEthOrderList();
    //        log ("list \n" + orderList);
            //get first order details
            orderDetails = await reserve.getTokenToEthOrder(orderList[0].valueOf());

            // insert order as first in list
            let bestOrderSrcAmount = orderDetails[1];
            let bestOrderDstAmount = orderDetails[2].sub(200);

            rc = await reserve.submitTokenToEthOrderWHint(bestOrderSrcAmount, bestOrderDstAmount, 0, {from: maker1});
            let order4ID = rc.logs[0].args.orderId.valueOf();
    //        log("order4 " + order4ID)

            orderDetails = await reserve.getTokenToEthOrder(order4ID);

            assert.equal(orderDetails[3].valueOf(), headId);
            assert.equal(orderDetails[4].valueOf(), order1ID);

            //now insert order as 2nd best.
            let secondBestDstAmount = bestOrderDstAmount.add(100).valueOf();
            rc = await reserve.submitTokenToEthOrderWHint(bestOrderSrcAmount, secondBestDstAmount, 0, {from: maker1});
            let order5ID = rc.logs[0].args.orderId.valueOf();
            //        log("order4 " + order4ID)

            orderDetails = await reserve.getTokenToEthOrder(rc.logs[0].args.orderId.valueOf());

            assert.equal(orderDetails[3].valueOf(), order4ID);
            assert.equal(orderDetails[4].valueOf(), order1ID);
        });

        it("add max number of orders per maker 256 sell and 256 buy. see next order reverted.", async () => {
            let tokenWeiDepositAmount = new BigNumber(3000).mul(10 ** 18);
            let kncTweiDepositAmount = 300000 * 10 ** 18;
            let ethWeiDepositAmount = (new BigNumber(0 * 10 ** 18));
            await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

            let orderSrcAmountTwei = new BigNumber(3 * 10 ** 18);
            let orderDstWei = new BigNumber(2 * 10 ** 18);

            let rc = await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei, {from: maker1});;
            for(let i = 1; i < numOrderIdsPerMaker; i++) {
                orderDstWei = orderDstWei.add(500);
                let prevId = rc.logs[0].args.orderId.valueOf();
                rc = await reserve.submitTokenToEthOrderWHint(orderSrcAmountTwei, orderDstWei, prevId, {from: maker1});
    //            log(i + " add gas: " + rc.receipt.gasUsed);
            }

            let lastOrderId = rc.logs[0].args.orderId.valueOf();

            orderList = await reserve.getTokenToEthOrderList();
            assert.equal(orderList.length, numOrderIdsPerMaker);

            try {
                rc = await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei.add(600), {from: maker1});
                assert(false, "throw was expected in line above.")
            } catch(e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }

            //take two orders and add again. (this time with hint)
            let payValueWei = new BigNumber(4 * 10 ** 18).add(500);
            rc = await reserve.trade(ethAddress, payValueWei, tokenAdd, user1, 300, false, {from: network, value: payValueWei});

            orderList = await reserve.getTokenToEthOrderList();
            assert.equal(orderList.length, (numOrderIdsPerMaker - 2));

            //add without hint
            orderDstWei = orderDstWei.add(500);
            rc = await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei, {from: maker1});
            let addGasOrderLastIdNoHint = rc.receipt.gasUsed;

            orderDstWei = orderDstWei.add(500);
            rc = await reserve.submitTokenToEthOrderWHint(orderSrcAmountTwei, orderDstWei, rc.logs[0].args.orderId.valueOf(),
                            {from: maker1});
            let addGasLastIdWithHint = rc.receipt.gasUsed;

            log("addGasOrderLastIdNoHint (" + numOrderIdsPerMaker + ") " + addGasOrderLastIdNoHint);
            log("addGasLastIdWithHint " + addGasLastIdWithHint);

            //now max orders for maker2
            await makerDeposit(maker2, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

            for(let i = 0; i < numOrderIdsPerMaker; i++) {
                let prevId = rc.logs[0].args.orderId.valueOf();
                rc = await reserve.submitTokenToEthOrderWHint(orderSrcAmountTwei, orderDstWei, prevId, {from: maker2});
    //            log(i + " add gas: " + rc.receipt.gasUsed);
            }

            orderList = await reserve.getTokenToEthOrderList();
            assert.equal(orderList.length, (2 * numOrderIdsPerMaker));
        });
    });

    describe("knc stakes and burn", function() {
        it("maker add sell token order. see funds & knc stakes updated.", async () => {
            let kncTweiDepositAmount = new BigNumber(600 * 10 ** 18);
            let tokenWeiDepositAmount = new BigNumber(11.1 * 10 ** 18);
            await makerDeposit(maker1, 0, tokenWeiDepositAmount, kncTweiDepositAmount.valueOf());

            let orderSrcAmountTwei = 9 * 10 ** 18;
            let orderDstWei = (new BigNumber(2)).mul(10 ** 18);

            //check maker free token funds
            let rxFreeTwei = await reserve.makerFunds(maker1, tokenAdd);
            assert.equal(rxFreeTwei.valueOf(), tokenWeiDepositAmount.valueOf() );
            let freeKnc = await reserve.makerUnlockedKnc(maker1);
            assert.equal(freeKnc.valueOf(), kncTweiDepositAmount.valueOf());
            let stakedKnc =  await reserve.makerStakedKnc(maker1);
            assert.equal(stakedKnc.valueOf(), 0);

            //add order
            let rc = await reserve.submitTokenToEthOrderWHint(orderSrcAmountTwei, orderDstWei, 0, {from: maker1});

            let expectedFreeTwei = tokenWeiDepositAmount.sub(orderSrcAmountTwei);
            rxFreeTwei = await reserve.makerFunds(maker1, tokenAdd);
            assert.equal(rxFreeTwei.valueOf(), expectedFreeTwei.valueOf());

            expectedStakedKnc = await reserve.calcKncStake(orderDstWei);
            stakedKnc =  await reserve.makerStakedKnc(maker1);
            assert.equal(stakedKnc.valueOf(), expectedStakedKnc.valueOf());
            freeKnc = await reserve.makerUnlockedKnc(maker1);
            assert.equal(freeKnc.valueOf(), kncTweiDepositAmount.sub(expectedStakedKnc).valueOf());
            rxFreeTwei = await reserve.makerFunds(maker1, tokenAdd);
            assert.equal(rxFreeTwei.valueOf(), tokenWeiDepositAmount.sub(orderSrcAmountTwei).valueOf() );
        });

        it("maker add buy token order. see funds & knc stakes updated.", async () => {
            let kncTweiDepositAmount = new BigNumber(600 * 10 ** 18);
            let ethWeiDepositAmount = (new BigNumber(2 * 10 ** 18)).add(700);
            await makerDeposit(maker1, ethWeiDepositAmount, 0, kncTweiDepositAmount.valueOf());

            let orderSrcAmountWei = 2 * 10 ** 18;
            let orderDstTwei = new BigNumber(5 * 10 ** 18);

            //check maker free token funds
            let rxFreeWei = await reserve.makerFunds(maker1, ethAddress);
            assert.equal(rxFreeWei.valueOf(), ethWeiDepositAmount.valueOf() );
            let freeKnc = await reserve.makerUnlockedKnc(maker1);
            assert.equal(freeKnc.valueOf(), kncTweiDepositAmount.valueOf());
            let stakedKnc =  await reserve.makerStakedKnc(maker1);
            assert.equal(stakedKnc.valueOf(), 0);

            //add order
            let rc = await reserve.submitEthToTokenOrder(orderSrcAmountWei, orderDstTwei, {from: maker1});

            let expectedFreeWei = 700;
            rxFreeWei = await reserve.makerFunds(maker1, ethAddress);
            assert.equal(rxFreeWei.valueOf(), expectedFreeWei.valueOf());

            expectedStakedKnc = await reserve.calcKncStake(orderSrcAmountWei);
            stakedKnc =  await reserve.makerStakedKnc(maker1);
            assert.equal(stakedKnc.valueOf(), expectedStakedKnc.valueOf());
            freeKnc = await reserve.makerUnlockedKnc(maker1);
            assert.equal(freeKnc.valueOf(), kncTweiDepositAmount.sub(expectedStakedKnc).valueOf());
        });

        it("maker add buy token orders. take orders. see total orders wei and knc stakes updated.", async () => {
            let kncTweiDepositAmount = new BigNumber(600 * 10 ** 18);
            let ethWeiDepositAmount = (new BigNumber(6 * 10 ** 18)).add(700);
            await makerDeposit(maker1, ethWeiDepositAmount, 0, kncTweiDepositAmount.valueOf());

            let orderSrcAmountWei = new BigNumber(2 * 10 ** 18);
            let orderDstTwei = new BigNumber(2 * 10 ** 14);

            //add 3 orders
            let rc = await reserve.submitEthToTokenOrder(orderSrcAmountWei.add(100), orderDstTwei, {from: maker1});
            await reserve.submitEthToTokenOrder(orderSrcAmountWei.add(200), orderDstTwei, {from: maker1});
            await reserve.submitEthToTokenOrder(orderSrcAmountWei.add(300), orderDstTwei, {from: maker1});

            let expectedTotalWeiInOrders = orderSrcAmountWei.mul(3).add(600);
            rxOrdersWei = await reserve.makerTotalOrdersWei(maker1);
            assert.equal(rxOrdersWei.valueOf(), expectedTotalWeiInOrders.valueOf());

            let expectedStakedKnc = await reserve.calcKncStake(expectedTotalWeiInOrders);
            rxKncStakes = await reserve.makerStakedKnc(maker1);
            assert.equal(rxKncStakes.valueOf(), expectedStakedKnc.valueOf());

            expectedFreeKnc = kncTweiDepositAmount.sub(expectedStakedKnc);
            rxFreeKnc = await reserve.makerUnlockedKnc(maker1);
            assert.equal(expectedFreeKnc.valueOf(), rxFreeKnc.valueOf());

            //take one full order
            await token.transfer(network, orderDstTwei);
            await token.approve(reserve.address, orderDstTwei, {from: network})
            await reserve.trade(tokenAdd, orderDstTwei, ethAddress, user1, 300, false, {from: network});

            expectedTotalWeiInOrders = expectedTotalWeiInOrders.sub(orderSrcAmountWei.add(300));
            rxOrdersWei = await reserve.makerTotalOrdersWei(maker1);
            assert.equal(rxOrdersWei.valueOf(), expectedTotalWeiInOrders.valueOf());

            expectedStakedKnc = await reserve.calcKncStake(expectedTotalWeiInOrders);
            rxKncStakes = await reserve.makerStakedKnc(maker1);
            assert.equal(rxKncStakes.valueOf(), expectedStakedKnc.valueOf());

            let burnedAmount = await reserve.calcBurnAmountMinSetRate(orderSrcAmountWei.add(300));
            expectedFreeKnc = kncTweiDepositAmount.sub(expectedStakedKnc.add(burnedAmount));
            rxFreeKnc = await reserve.makerUnlockedKnc(maker1);
            assert.equal(expectedFreeKnc.valueOf(), rxFreeKnc.valueOf());

            //take half order
            await token.transfer(network, orderDstTwei.div(2));
            await token.approve(reserve.address, orderDstTwei.div(2), {from: network})
            await reserve.trade(tokenAdd, orderDstTwei.div(2), ethAddress, user1, 300, false, {from: network});

            expectedTotalWeiInOrders = expectedTotalWeiInOrders.sub(orderSrcAmountWei.div(2).add(100));
            rxOrdersWei = await reserve.makerTotalOrdersWei(maker1);
            assert.equal(rxOrdersWei.valueOf(), expectedTotalWeiInOrders.valueOf());

            expectedStakedKnc = await reserve.calcKncStake(expectedTotalWeiInOrders);
            rxKncStakes = await reserve.makerStakedKnc(maker1);
            assert.equal(rxKncStakes.valueOf(), expectedStakedKnc.valueOf());

            burnAmount = await reserve.calcBurnAmountMinSetRate(orderSrcAmountWei.div(2).add(100));
            expectedFreeKnc = expectedFreeKnc.add(burnAmount.mul(3));
            rxFreeKnc = await reserve.makerUnlockedKnc(maker1);
            assert.equal(expectedFreeKnc.valueOf(), rxFreeKnc.valueOf());
        });

        it("maker add sell token orders. take orders. see total orders wei and knc stakes updated.", async () => {
            let kncTweiDepositAmount = new BigNumber(600 * 10 ** 18);
            let tokenTweiDepositAmount = (new BigNumber(16 * 10 ** 18)).add(700);
            await makerDeposit(maker1, 0, tokenTweiDepositAmount, kncTweiDepositAmount.valueOf());

            let srcAmountTwei = new BigNumber(3 * 10 ** 18);
            let dstWei = new BigNumber(2 * 10 ** 18);

            //add 3 orders
            await reserve.submitTokenToEthOrder(srcAmountTwei.add(100), dstWei, {from: maker1});
            await reserve.submitTokenToEthOrder(srcAmountTwei.add(200), dstWei, {from: maker1});
            await reserve.submitTokenToEthOrder(srcAmountTwei.add(300), dstWei, {from: maker1});

            let expectedTotalWeiInOrders = dstWei.mul(3);
            rxOrdersWei = await reserve.makerTotalOrdersWei(maker1);
            assert.equal(rxOrdersWei.valueOf(), expectedTotalWeiInOrders.valueOf());

            let expectedStakedKnc = await reserve.calcKncStake(expectedTotalWeiInOrders);
            rxKncStakes = await reserve.makerStakedKnc(maker1);
            assert.equal(rxKncStakes.valueOf(), expectedStakedKnc.valueOf());

            expectedFreeKnc = kncTweiDepositAmount.sub(expectedStakedKnc);
            rxFreeKnc = await reserve.makerUnlockedKnc(maker1);
            assert.equal(expectedFreeKnc.valueOf(), rxFreeKnc.valueOf());

            //take one full order
            await reserve.trade(ethAddress, dstWei, tokenAdd, user1, 300, false, {from: network, value: dstWei});

            expectedTotalWeiInOrders = expectedTotalWeiInOrders.sub(dstWei);
            rxOrdersWei = await reserve.makerTotalOrdersWei(maker1);
            assert.equal(rxOrdersWei.valueOf(), expectedTotalWeiInOrders.valueOf());

            expectedStakedKnc = await reserve.calcKncStake(expectedTotalWeiInOrders);
            rxKncStakes = await reserve.makerStakedKnc(maker1);
            assert.equal(rxKncStakes.valueOf(), expectedStakedKnc.valueOf());

            let burnAmount = await reserve.calcBurnAmountMinSetRate(dstWei);
            expectedFreeKnc = kncTweiDepositAmount.sub(expectedStakedKnc.add(burnAmount));
            rxFreeKnc = await reserve.makerUnlockedKnc(maker1);
            assert.equal(expectedFreeKnc.valueOf(), rxFreeKnc.valueOf());

            //take half order
            await reserve.trade(ethAddress, dstWei.div(2), tokenAdd, user1, 300, false, {from: network, value: dstWei.div(2)});

            expectedTotalWeiInOrders = expectedTotalWeiInOrders.sub(dstWei.div(2));
            rxOrdersWei = await reserve.makerTotalOrdersWei(maker1);
            assert.equal(rxOrdersWei.valueOf(), expectedTotalWeiInOrders.valueOf());

            expectedStakedKnc = await reserve.calcKncStake(expectedTotalWeiInOrders);
            rxKncStakes = await reserve.makerStakedKnc(maker1);
            assert.equal(rxKncStakes.valueOf(), expectedStakedKnc.valueOf());

            burnAmount = await reserve.calcBurnAmountMinSetRate(dstWei.div(2));
            expectedFreeKnc = expectedFreeKnc.add(burnAmount.mul(3));
            rxFreeKnc = await reserve.makerUnlockedKnc(maker1);
            assert.equal(expectedFreeKnc.valueOf(), rxFreeKnc.valueOf());
        });

        it("maker add sell token order. cancel order. verify order removed and funds & knc updated.", async () => {
            let kncTweiDepositAmount = 600 * 10 ** 18;
            let tokenWeiDepositAmount = new BigNumber(11.1 * 10 ** 18);
            await makerDeposit(maker1, 0, tokenWeiDepositAmount, kncTweiDepositAmount.valueOf());

            let orderSrcAmountTwei = 9 * 10 ** 18;
            let orderDstWei = (new BigNumber(2)).mul(10 ** 18);

            //add order
            let rc = await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei, {from: maker1});

            let orderList = await reserve.getTokenToEthOrderList();
            assert.equal(orderList.length, 1);
            //see funds and knc stakes
            let expectedFreeTwei = tokenWeiDepositAmount.sub(orderSrcAmountTwei);
            let rxFreeTwei = await reserve.makerFunds(maker1, tokenAdd);
            assert.equal(rxFreeTwei.valueOf(), expectedFreeTwei.valueOf() );


            rc = await reserve.cancelTokenToEthOrder(orderList[0], {from: maker1});
    //        log(rc.logs[0].args)

            orderList = await reserve.getTokenToEthOrderList();
            assert.equal(orderList.length, 0);
            //see all values back to start state
            rxFreeTwei = await reserve.makerFunds(maker1, tokenAdd);
            assert.equal(rxFreeTwei.valueOf(), tokenWeiDepositAmount.valueOf() );
            let freeKnc = await reserve.makerUnlockedKnc(maker1);
            assert.equal(freeKnc.valueOf(), kncTweiDepositAmount.valueOf());
            let stakedKnc =  await reserve.makerStakedKnc(maker1);
            assert.equal(stakedKnc.valueOf(), 0);
        });

        it("maker add sell order. update to smaller amount, see funds and knc stakes updated", async() => {
            let kncTweiDepositAmount = new BigNumber(600 * 10 ** 18);
            let tokenWeiDepositAmount = new BigNumber(11.1 * 10 ** 18).floor();
            await makerDeposit(maker1, 0, tokenWeiDepositAmount, kncTweiDepositAmount);

            let orderSrcAmountTwei = 9 * 10 ** 18;
            let orderDstWei = (new BigNumber(2)).mul(10 ** 18);

            let freeTwei = await reserve.makerFunds(maker1, tokenAdd);
            assert.equal(freeTwei.valueOf(), tokenWeiDepositAmount.valueOf());
            //add order
            let rc = await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei, {from: maker1});

            let orderId = rc.logs[0].args.orderId.valueOf();

            freeTwei = await reserve.makerFunds(maker1, tokenAdd);
            assert.equal(freeTwei.valueOf(), tokenWeiDepositAmount.sub(orderSrcAmountTwei).valueOf());

            // update source amount
            let updatedSource = 7 * 10 ** 18;
            let updateDest = orderDstWei.add(7500);
            rc = await reserve.updateTokenToEthOrder(orderId, updatedSource, updateDest, {from: maker1});
            log("update single sell order (include update stakes) gas: " + rc.receipt.gasUsed);
            freeTwei = await reserve.makerFunds(maker1, tokenAdd);
            assert.equal(freeTwei.valueOf(), tokenWeiDepositAmount.sub(updatedSource).valueOf());

            let expectedStake = await reserve.calcKncStake(updateDest);
            let actualStake = await reserve.makerStakedKnc(maker1);
            assert.equal(expectedStake.valueOf(), actualStake.valueOf());
            let freeKnc = await reserve.makerUnlockedKnc(maker1);
            assert.equal(freeKnc.valueOf(), kncTweiDepositAmount.sub(expectedStake).valueOf());

            let orderList = await reserve.getTokenToEthOrderList();
            assert.equal(orderList.length, 1);
        });

        it("maker add buy token order. update to smaller amount, see funds & knc updated.", async () => {
            let ethWeiDepositAmount = (new BigNumber(2 * 10 ** 18)).add(700);
            let kncTweiDepositAmount = new BigNumber(600 * 10 ** 18);
            await makerDeposit(maker1, ethWeiDepositAmount, 0, kncTweiDepositAmount);

            let srcAmountWei = (new BigNumber(2 * 10 ** 18)).add(300);
            let orderDstTwei = 9 * 10 ** 18;

            //check maker free token funds
            let rxFreeWei = await reserve.makerFunds(maker1, ethAddress);
            assert.equal(rxFreeWei.valueOf(), ethWeiDepositAmount.valueOf() );

            //add order
            let rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
            let orderId = rc.logs[0].args.orderId.valueOf();

            let expectedFreeWei = ethWeiDepositAmount.sub(srcAmountWei);
            rxFreeWei = await reserve.makerFunds(maker1, ethAddress);
            assert.equal(rxFreeWei.valueOf(), expectedFreeWei.valueOf() );

            // update source amount
            let updatedSource = (new BigNumber(2 * 10 ** 18)).add(100);
            rc = await reserve.updateEthToTokenOrder(orderId, updatedSource, orderDstTwei, {from: maker1});
            log("update single buy order (including update stakes) gas: " + rc.receipt.gasUsed);

            rxFreeWei = await reserve.makerFunds(maker1, ethAddress);
            assert.equal(rxFreeWei.valueOf(), ethWeiDepositAmount.sub(updatedSource).valueOf());

            let expectedStake = await reserve.calcKncStake(updatedSource);
            let actualStake = await reserve.makerStakedKnc(maker1);
            assert.equal(expectedStake.valueOf(), actualStake.valueOf());
            let freeKnc = await reserve.makerUnlockedKnc(maker1);
            assert.equal(freeKnc.valueOf(), kncTweiDepositAmount.sub(expectedStake).valueOf());
        });

        it("maker add sell order. update to bigger amount, see funds and knc stakes updated", async() => {
            let kncTweiDepositAmount = new BigNumber(600 * 10 ** 18);
            let tokenWeiDepositAmount = new BigNumber(11.1 * 10 ** 18).floor();
            await makerDeposit(maker1, 0, tokenWeiDepositAmount, kncTweiDepositAmount);

            let orderSrcAmountTwei = 9 * 10 ** 18;
            let orderDstWei = (new BigNumber(2)).mul(10 ** 18);

            let freeTwei = await reserve.makerFunds(maker1, tokenAdd);
            assert.equal(freeTwei.valueOf(), tokenWeiDepositAmount.valueOf());
            //add order
            let rc = await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei, {from: maker1});

            let orderId = rc.logs[0].args.orderId.valueOf();

            freeTwei = await reserve.makerFunds(maker1, tokenAdd);
            assert.equal(freeTwei.valueOf(), tokenWeiDepositAmount.sub(orderSrcAmountTwei).valueOf());

            // update source amount
            let updatedSource = 10 * 10 ** 18;
            let updateDest = orderDstWei.add(7500);
            rc = await reserve.updateTokenToEthOrder(orderId, updatedSource, updateDest, {from: maker1});
            log("update single sell order (include update stakes) gas: " + rc.receipt.gasUsed);
            freeTwei = await reserve.makerFunds(maker1, tokenAdd);
            assert.equal(freeTwei.valueOf(), tokenWeiDepositAmount.sub(updatedSource).valueOf());

            let expectedStake = await reserve.calcKncStake(updateDest);
            let actualStake = await reserve.makerStakedKnc(maker1);
            assert.equal(expectedStake.valueOf(), actualStake.valueOf());
            let freeKnc = await reserve.makerUnlockedKnc(maker1);
            assert.equal(freeKnc.valueOf(), kncTweiDepositAmount.sub(expectedStake).valueOf());

            let orderList = await reserve.getTokenToEthOrderList();
            assert.equal(orderList.length, 1);
        });

        it("maker add buy token order. update to bigger amount, see funds & knc updated.", async () => {
            let ethWeiDepositAmount = (new BigNumber(2 * 10 ** 18)).add(700);
            let kncTweiDepositAmount = new BigNumber(600 * 10 ** 18);
            await makerDeposit(maker1, ethWeiDepositAmount, 0, kncTweiDepositAmount);

            let srcAmountWei = 2 * 10 ** 18;
            let orderDstTwei = 9 * 10 ** 18;

            //check maker free token funds
            let rxFreeWei = await reserve.makerFunds(maker1, ethAddress);
            assert.equal(rxFreeWei.valueOf(), ethWeiDepositAmount.valueOf() );

            //add order
            let rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
            let orderId = rc.logs[0].args.orderId.valueOf();

            let expectedFreeWei = ethWeiDepositAmount.sub(srcAmountWei);
            rxFreeWei = await reserve.makerFunds(maker1, ethAddress);
            assert.equal(rxFreeWei.valueOf(), expectedFreeWei.valueOf() );

            // update source amount
            let updatedSource = (new BigNumber(2 * 10 ** 18)).add(300);
            rc = await reserve.updateEthToTokenOrder(orderId, updatedSource, orderDstTwei, {from: maker1});
            log("update single buy order (including update stakes) gas: " + rc.receipt.gasUsed);

            rxFreeWei = await reserve.makerFunds(maker1, ethAddress);
            assert.equal(rxFreeWei.valueOf(), ethWeiDepositAmount.sub(updatedSource).valueOf());

            let expectedStake = await reserve.calcKncStake(updatedSource);
            let actualStake = await reserve.makerStakedKnc(maker1);
            assert.equal(expectedStake.valueOf(), actualStake.valueOf());
            let freeKnc = await reserve.makerUnlockedKnc(maker1);
            assert.equal(freeKnc.valueOf(), kncTweiDepositAmount.sub(expectedStake).valueOf());
        });

        it("add a few orders. update knc to eth rate in fee burner. see burn amount updated", async() => {
            network
        })


        it("create rate change so burn amount is bigger then calculated stake amount, see burn amounts are reduced upon taking, to equal stake amount", async() => {
        });
    })

    describe("trade (add orders and take)", function() {
        it("maker add sell order. take using trade. see amounts updated in contracts. see funds transferred.", async() => {
            let tokenWeiDepositAmount = new BigNumber(10).mul(10 ** 18);
            let kncTweiDepositAmount = 600 * 10 ** 18;
            let ethWeiDepositAmount = (new BigNumber(0 * 10 ** 18));
            await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

            let makerTokenBalance = await reserve.makerFunds(maker1, tokenAdd);
            assert.equal(makerTokenBalance.valueOf(), tokenWeiDepositAmount.valueOf());
            let orderSrcAmountTwei = new BigNumber(9).mul(10 ** 18);
            let orderDstWei = (new BigNumber(2).mul(10 ** 18)).add(2000);

            let rc = await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei, {from: maker1});

            makerTokenBalance = await reserve.makerFunds(maker1, tokenAdd);
            assert.equal(makerTokenBalance.valueOf(), tokenWeiDepositAmount.sub(orderSrcAmountTwei).valueOf());

            let list = await reserve.getTokenToEthOrderList();
            assert.equal(list.length, 1);

            let user1StartTokenBalance = await token.balanceOf(user1);
            rc = await reserve.trade(ethAddress, orderDstWei, tokenAdd, user1, 300, false, {from:network, value: orderDstWei});
            list = await reserve.getTokenToEthOrderList();
            assert.equal(list.length, 0);
            makerTokenBalance = await reserve.makerFunds(maker1, tokenAdd);
            assert.equal(makerTokenBalance.valueOf(), tokenWeiDepositAmount.sub(orderSrcAmountTwei).valueOf());

            let makerEthBalance = await reserve.makerFunds(maker1, ethAddress);
            assert.equal(makerEthBalance.valueOf(), orderDstWei.valueOf());
            let expectedBalance = user1StartTokenBalance.add(orderSrcAmountTwei);
            let user1TokenBalanceAfter = await token.balanceOf(user1);
            assert.equal(expectedBalance.valueOf(), user1TokenBalanceAfter.valueOf());
        })

        it("maker - make 5 buy orders and take in one trade. see gas for take.", async () => {
            let tokenWeiDepositAmount = new BigNumber(0).mul(10 ** 18);
            let kncTweiDepositAmount = 600 * 10 ** 18;
            let ethWeiDepositAmount = (new BigNumber(10 * 10 ** 18)).add(30000);
            await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

            orderSrc = new BigNumber(2 * 10 ** 18);
            orderDst = new BigNumber(6 * 10 ** 18);

            makeOrdersSrcAmounts = [orderSrc, orderSrc, orderSrc, orderSrc, orderSrc];
            makeOrdersDstAmount = [orderDst, orderDst.add(200), orderDst.add(500), orderDst.add(900), orderDst.add(1300)];

            let totalGasMaker1 = new BigNumber(0);
            let totalPayValue = new BigNumber(0);

            for (let i = 0; i < makeOrdersSrcAmounts.length; i++) {
                let rc = await reserve.submitEthToTokenOrder(makeOrdersSrcAmounts[i], makeOrdersDstAmount[i], {from: maker1});
                totalGasMaker1 = totalGasMaker1.add(rc.receipt.gasUsed);
                totalPayValue = totalPayValue.add(makeOrdersDstAmount[i]);
            }

            log ("total gas 5 maker orders. one by one: " + totalGasMaker1.valueOf());

            await token.transfer(network, totalPayValue);
            await token.approve(reserve.address, totalPayValue, {from: network})
            let rc = await reserve.trade(tokenAdd, totalPayValue, ethAddress, user1, 300, false, {from:network});

            log("take 5 orders gas: " + rc.receipt.gasUsed);
            assert(rc.receipt.gasUsed < 330000);
        });

        it("calc expected stake and calc burn amount. validate match", async () => {
            let rxLimits = await reserve.limits();
            minKncPerEthRatePrecision = rxLimits[4].valueOf();
            let kncToEthRatePrecision = new BigNumber(minKncPerEthRatePrecision);

            let weiValue = new BigNumber(2 * 10 ** 18);
            let feeBps = await reserve.makerBurnFeeBps();

            let expectedBurn = (weiValue.mul(feeBps).mul(kncToEthRatePrecision)).div(precisionUnits.add(BPS)).floor();
    //        log ("expected burn " + expectedBurn);

            let calcBurn = await reserve.calcBurnAmountMinSetRate(weiValue);
            assert.equal(expectedBurn.valueOf(), calcBurn.valueOf());

            let calcExpectedStake = expectedBurn.mul(burnToStakeFactor);
            let calcStake = await reserve.calcKncStake(weiValue);
    //        log("stake val " + calcStake.valueOf());
            assert.equal(calcStake.valueOf(), calcExpectedStake.valueOf());
            assert(calcBurn.valueOf() < calcStake.valueOf());
        });

        it("maker add buy order. user takes order. see taken order removed as expected.", async () => {
            let tokenWeiDepositAmount = new BigNumber(0).mul(10 ** 18);
            let kncTweiDepositAmount = 600 * 10 ** 18;
            let ethWeiDepositAmount = (new BigNumber(2 * 10 ** 18)).add(30000);
            await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

            let srcAmountWei = 2 * 10 ** 18;
            let orderDstTwei = 9 * 10 ** 18;

            // add order
            let rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});

            let list = await reserve.getEthToTokenOrderList();
            assert.equal(list.length, 1);

            //take order
    //  function trade(ERC20 srcToken, uint srcAmount, ERC20 destToken, address destAddress, uint conversionRate, bool validate)

            await token.transfer(network, orderDstTwei);
            await token.approve(reserve.address, orderDstTwei, {from: network})
            rc = await reserve.trade(tokenAdd, orderDstTwei, ethAddress, user1, 300, false, {from: network});

            log("take single order gas: " + rc.receipt.gasUsed);
            assert(rc.receipt.gasUsed < 130000);

            list = await reserve.getEthToTokenOrderList();
            assert.equal(list.length, 0);

            rate = await reserve.getConversionRate(token.address, ethAddress, 10 ** 18, 0);
            assert.equal(rate.valueOf(), 0);
        });

        it("maker add a few buy orders. user takes full orders. see user gets traded wei. maker gets tokens.", async () => {
            let tokenWeiDepositAmount = new BigNumber(0).mul(10 ** 18);
            let kncTweiDepositAmount = 600 * 10 ** 18;
            let ethWeiDepositAmount = (new BigNumber(6 * 10 ** 18)).add(30000);
            await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

            let srcAmountWei = new BigNumber(2 * 10 ** 18);
            let orderDstTwei = new BigNumber(9 * 10 ** 18);

            // add order
            let rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
            rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei.add(1000), {from: maker1});
            rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei.add(2000), {from: maker1});

            //take all orders
    //  function trade(ERC20 srcToken, uint srcAmount, ERC20 destToken, address destAddress, uint conversionRate, bool validate)

            //maker eth balance before. (should be 3000 - deposited amount that wasn't used for above orders)
            let balance = await reserve.makerFunds(maker1, ethAddress);
            assert.equal(balance.valueOf(), 30000);
            balance = await reserve.makerFunds(maker1, tokenAdd);
            assert.equal(balance.valueOf(), 0);

            let userWeiBefore = new BigNumber(await Helper.getBalancePromise(user1));

            let EthOrderValue = srcAmountWei;
            let totalPayValue = orderDstTwei.mul(3).add(3000);

            let userTokBalanceBefore = await token.balanceOf(user1);

            await token.transfer(network, totalPayValue);
            await token.approve(reserve.address, totalPayValue, {from: network})
            rc = await reserve.trade(tokenAdd, totalPayValue, ethAddress, user1, 300, false, {from: network});
            log("take 3 eth to token orders gas: " + rc.receipt.gasUsed);

            //check maker balance
            balance = await reserve.makerFunds(maker1, tokenAdd);
            assert.equal(balance.valueOf(), totalPayValue.valueOf());

            //user1 balance
            let userBalanceAfter = await token.balanceOf(user1);
            assert.equal(userBalanceAfter.valueOf(), userTokBalanceBefore.valueOf());

            rate = await reserve.getConversionRate(token.address, ethAddress, 10 ** 18, 0);
            assert.equal(rate.valueOf(), 0);

            list = await reserve.getEthToTokenOrderList();
            assert.equal(list.length, 0);
        });

        it("buy orders print gas for taking 0.5 order 1.5 order 2.5 orders. remaining removed", async () => {
            let tokenWeiDepositAmount = new BigNumber(0).mul(10 ** 18);
            let kncTweiDepositAmount = 700 * 10 ** 18;
            let ethWeiDepositAmount = (new BigNumber(12 * 10 ** 18)).add(30000);
            await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

            let srcAmountWei = new BigNumber(2 * 10 ** 18);
            let orderDstTwei = new BigNumber(9 * 10 ** 18);

            // add order
            let rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
            rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
            rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
            rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
            rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
            rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});

            //trade
            let payValueTwei = orderDstTwei.mul(0.5).add(6000);
            await token.transfer(network, payValueTwei);
            await token.approve(reserve.address, payValueTwei, {from: network})
            rc = await reserve.trade(tokenAdd, payValueTwei, ethAddress, user1, 300, false, {from: network});
            log("take 0.5 buy orders (remaining removed) gas: " + rc.receipt.gasUsed);

            //trade
            payValueTwei = payValueTwei.add(orderDstTwei);
            await token.transfer(network, payValueTwei);
            await token.approve(reserve.address, payValueTwei, {from: network})
            rc = await reserve.trade(tokenAdd, payValueTwei, ethAddress, user1, 300, false, {from: network});
            log("take 1.5 buy orders (remaining removed) gas: " + rc.receipt.gasUsed);

            //trade
            payValueTwei = payValueTwei.add(orderDstTwei);
            await token.transfer(network, payValueTwei);
            await token.approve(reserve.address, payValueTwei, {from: network})
            rc = await reserve.trade(tokenAdd, payValueTwei, ethAddress, user1, 300, false, {from: network});
            log("take 2.5 buy orders (remaining removed) gas: " + rc.receipt.gasUsed);
    //        assert(false)
        });

        it("buy orders print gas for taking 0.5 order 1.5 order 2.5 orders. remaining not removed", async () => {
            let tokenWeiDepositAmount = new BigNumber(0).mul(10 ** 18);
            let kncTweiDepositAmount = 700 * 10 ** 18;
            let ethWeiDepositAmount = (new BigNumber(12 * 10 ** 18)).add(30000);
            await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

            let srcAmountWei = new BigNumber(2 * 10 ** 18);
            let orderDstTwei = new BigNumber(9 * 10 ** 18);

            // add order
            let rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
            rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
            rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
            rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
            rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
            rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});

            //trade
            let payValueTwei = orderDstTwei.mul(0.5).sub(6000);
            await token.transfer(network, payValueTwei.add(orderDstTwei.div(2)));
            await token.approve(reserve.address, payValueTwei.add(orderDstTwei.div(2)), {from: network})
            rc = await reserve.trade(tokenAdd, payValueTwei, ethAddress, user1, 300, false, {from: network});
            log("take 0.5 buy orders (remaining not removed) gas: " + rc.receipt.gasUsed);
            await reserve.trade(tokenAdd, orderDstTwei.div(2), ethAddress, user1, 300, false, {from: network});

            //trade
            payValueTwei = payValueTwei.add(orderDstTwei);
            await token.transfer(network, payValueTwei.add(orderDstTwei.div(2)));
            await token.approve(reserve.address, payValueTwei.add(orderDstTwei.div(2)), {from: network})
            rc = await reserve.trade(tokenAdd, payValueTwei, ethAddress, user1, 300, false, {from: network});
            log("take 1.5 buy orders (remaining not removed) gas: " + rc.receipt.gasUsed);
            await reserve.trade(tokenAdd, orderDstTwei.div(2), ethAddress, user1, 300, false, {from: network});

            //trade
            payValueTwei = payValueTwei.add(orderDstTwei);
            await token.transfer(network, payValueTwei.add(orderDstTwei.div(2)));
            await token.approve(reserve.address, payValueTwei.add(orderDstTwei.div(2)), {from: network})
            rc = await reserve.trade(tokenAdd, payValueTwei, ethAddress, user1, 300, false, {from: network});
            log("take 2.5 buy orders (remaining not removed) gas: " + rc.receipt.gasUsed);
            await reserve.trade(tokenAdd, orderDstTwei.div(2), ethAddress, user1, 300, false, {from: network});
    //        assert(false)
        });

        it("maker add buy order. user takes partial. remaining order stays in book.", async () => {
            let tokenWeiDepositAmount = new BigNumber(0).mul(10 ** 18);
            let kncTweiDepositAmount = 700 * 10 ** 18;
            let ethWeiDepositAmount = (new BigNumber(2 * 10 ** 18)).add(30000);
            await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

            let srcAmountWei = new BigNumber(2 * 10 ** 18);
            let orderDstTwei = new BigNumber(7 * 10 ** 18);

            // add order
            let rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});

            let list = await reserve.getEthToTokenOrderList();
            assert.equal(list.length, 1);

            //take order
    //  function trade(ERC20 srcToken, uint srcAmount, ERC20 destToken, address destAddress, uint conversionRate, bool validate)
            let takeAmount = orderDstTwei.div(2).sub(2000);

            await token.transfer(network, takeAmount);
            await token.approve(reserve.address, takeAmount, {from: network})
            rc = await reserve.trade(tokenAdd, takeAmount, ethAddress, user1, 300, false, {from: network});

            log("take partial order gas (remaining not removed): " + rc.receipt.gasUsed);

            list = await reserve.getEthToTokenOrderList();
            assert.equal(list.length, 1);

            let balance = await reserve.makerFunds(maker1, ethAddress);
            assert.equal(balance.valueOf(), ethWeiDepositAmount.sub(srcAmountWei).valueOf());

            balance = await reserve.makerFunds(maker1, tokenAdd);
            assert.equal(balance.valueOf(), takeAmount.valueOf());
        });

        it("maker add buy order. user takes partial. remaining order removed.", async () => {
            let tokenWeiDepositAmount = new BigNumber(0).mul(10 ** 18);
            let kncTweiDepositAmount = 600 * 10 ** 18;
            let ethWeiDepositAmount = (new BigNumber(2 * 10 ** 18)).add(30000);
            await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

            let srcAmountWei = new BigNumber(2 * 10 ** 18);
            let orderDstTwei = new BigNumber(7 * 10 ** 18);

            // add order
            let rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});

            let list = await reserve.getEthToTokenOrderList();
            assert.equal(list.length, 1);

            //take order
    //  function trade(ERC20 srcToken, uint srcAmount, ERC20 destToken, address destAddress, uint conversionRate, bool validate)
            let tokenPayAmount = orderDstTwei.div(2).add(10000);

            await token.transfer(network, tokenPayAmount);
            await token.approve(reserve.address, tokenPayAmount, {from: network})
            rc = await reserve.trade(tokenAdd, tokenPayAmount, ethAddress, user1, 300, false, {from: network});

            log("take partial order gas (remaining removed): " + rc.receipt.gasUsed);

            list = await reserve.getEthToTokenOrderList();
            assert.equal(list.length, 0);

            let balance = await reserve.makerFunds(maker1, ethAddress);
            let expectedETHSentToUser = srcAmountWei.mul(tokenPayAmount).div(orderDstTwei).floor();
            //all eth not sended to taker should be released bach to maker funds.
            assert.equal(balance.valueOf(), ethWeiDepositAmount.sub(expectedETHSentToUser).valueOf());

            balance = await reserve.makerFunds(maker1, tokenAdd);
            assert.equal(balance.valueOf(), tokenPayAmount.valueOf());
        });

        it("maker add a few sell orders. user takes orders. see taken orders are removed. user gets token. maker get eth.", async () => {
            let tokenWeiDepositAmount = new BigNumber(70).mul(10 ** 18);
            let kncTweiDepositAmount = 600 * 10 ** 18;
            let ethWeiDepositAmount = (new BigNumber(0 * 10 ** 18));
            await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

            let orderSrcAmountTwei = new BigNumber(6 * 10 ** 18);
            let orderDstWei = new BigNumber(2 * 10 ** 18);

            //add order
            //////////////
            let rc = await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei, {from: maker1});
                rc = await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei.add(400), {from: maker1});
                rc = await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei.add(200), {from: maker1});

            let totalPayValueWei = orderDstWei.mul(3).add(600);
            let userInitialTokBalance = await token.balanceOf(user1);

            //trade
            rc = await reserve.trade(ethAddress, totalPayValueWei, tokenAdd, user1, 300, false, {from: network, value: totalPayValueWei});
            log("take 3 sell orders gas: " + rc.receipt.gasUsed);

            orderList = await reserve.getTokenToEthOrderList();
            assert.equal(orderList.length, 0);

            let userBalanceAfter = await token.balanceOf(user1);
            let expectedBalance = userInitialTokBalance.add(orderSrcAmountTwei.mul(3));
            assert.equal(userBalanceAfter.valueOf(), expectedBalance.valueOf());

            let makerEthBalance = await reserve.makerFunds(maker1, ethAddress);
            assert.equal(makerEthBalance.valueOf(), totalPayValueWei);
        });

        it("sell orders print gas for taking 0.5 order 1.5 order 2.5 orders. remaining removed", async () => {
            let tokenWeiDepositAmount = new BigNumber(70).mul(10 ** 18);
            let kncTweiDepositAmount = 700 * 10 ** 18;
            let ethWeiDepositAmount = (new BigNumber(0 * 10 ** 18));
            await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

            let orderSrcAmountTwei = new BigNumber(6 * 10 ** 18);
            let orderDstWei = new BigNumber(2 * 10 ** 18);

            //add order
            //////////////
            let rc = await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei, {from: maker1});
                rc = await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei.add(200), {from: maker1});
                rc = await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei.add(400), {from: maker1});
                rc = await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei.add(600), {from: maker1});
                rc = await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei.add(800), {from: maker1});
                rc = await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei.add(1000), {from: maker1});

            //trade
            let payValueWei = orderDstWei.mul(0.5).add(3000);
            rc = await reserve.trade(ethAddress, payValueWei, tokenAdd, user1, 300, false, {from: network, value: payValueWei});
            log("take 0.5 sell orders. (remaining removed) gas: " + rc.receipt.gasUsed);

            orderList = await reserve.getTokenToEthOrderList();
            assert.equal(orderList.length, 5);

            //trade
            payValueWei = payValueWei.add(orderDstWei);
            rc = await reserve.trade(ethAddress, payValueWei, tokenAdd, user1, 300, false, {from: network, value: payValueWei});
            log("take 1.5 sell orders. (remaining removed) gas: " + rc.receipt.gasUsed);

            orderList = await reserve.getTokenToEthOrderList();
            assert.equal(orderList.length, 3);

            //trade
            payValueWei = payValueWei.add(orderDstWei);
            rc = await reserve.trade(ethAddress, payValueWei, tokenAdd, user1, 300, false, {from: network, value: payValueWei});
            log("take 2.5 sell orders. (remaining removed) gas: " + rc.receipt.gasUsed);

            orderList = await reserve.getTokenToEthOrderList();
            assert.equal(orderList.length, 0);
        });

        it("sell orders print gas for taking 0.5 order 1.5 order 2.5 orders. remaining not removed", async () => {
            let tokenWeiDepositAmount = new BigNumber(70).mul(10 ** 18);
            let kncTweiDepositAmount = 700 * 10 ** 18;
            let ethWeiDepositAmount = (new BigNumber(0 * 10 ** 18));
            await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

            let orderSrcAmountTwei = new BigNumber(6 * 10 ** 18);
            let orderDstWei = new BigNumber(2 * 10 ** 18);

            //add order
            //////////////
            let rc = await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei, {from: maker1});
                rc = await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei.add(200), {from: maker1});
                rc = await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei.add(400), {from: maker1});
                rc = await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei.add(600), {from: maker1});
                rc = await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei.add(800), {from: maker1});
                rc = await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei.add(1000), {from: maker1});

            //trade
            let payValueWei = orderDstWei.mul(0.5).sub(3000);
            rc = await reserve.trade(ethAddress, payValueWei, tokenAdd, user1, 300, false, {from: network, value: payValueWei});
            log("take 0.5 sell orders. (remaining left) gas: " + rc.receipt.gasUsed);
            await reserve.trade(ethAddress, orderDstWei.div(2), tokenAdd, user1, 300, false, {from: network, value: orderDstWei.div(2)});

            //remove left part of order
            orderList = await reserve.getTokenToEthOrderList();
            assert.equal(orderList.length, 5);

            //trade
            payValueWei = payValueWei.add(orderDstWei);
            rc = await reserve.trade(ethAddress, payValueWei, tokenAdd, user1, 300, false, {from: network, value: payValueWei});
            log("take 1.5 sell orders. (remaining left) gas: " + rc.receipt.gasUsed);
            await reserve.trade(ethAddress, orderDstWei.div(2), tokenAdd, user1, 300, false, {from: network, value: orderDstWei.div(2)});

            orderList = await reserve.getTokenToEthOrderList();
            assert.equal(orderList.length, 3);

            //trade
            payValueWei = payValueWei.add(orderDstWei);
            rc = await reserve.trade(ethAddress, payValueWei, tokenAdd, user1, 300, false, {from: network, value: payValueWei});
            log("take 2.5 sell orders. (remaining left) gas: " + rc.receipt.gasUsed);
            orderList = await reserve.getTokenToEthOrderList();
            assert.equal(orderList.length, 1);

            await reserve.trade(ethAddress, orderDstWei.div(2), tokenAdd, user1, 300, false, {from: network, value: orderDstWei.div(2)});

            orderList = await reserve.getTokenToEthOrderList();
            assert.equal(orderList.length, 0);
        })

        it("add 9 buy orders 1 maker. user takes all orders. print gas", async () => {
            let tokenWeiDepositAmount = new BigNumber(0).mul(10 ** 18);
            let kncTweiDepositAmount = 1100 * 10 ** 18;
            let ethWeiDepositAmount = (new BigNumber(20 * 10 ** 18)).add(30000);
            await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

            let srcAmountWei = new BigNumber(2 * 10 ** 18);
            let orderDstTwei = new BigNumber(7 * 10 ** 18);

            // add orders
            let totalPayAmountTwei = new BigNumber(0);
            for (let i = 0; i < 9; i++) {
                let rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei.add(i * 100), {from: maker1});
                totalPayAmountTwei = totalPayAmountTwei.add(orderDstTwei.add(i * 100));
            }

            let list = await reserve.getEthToTokenOrderList();
            assert.equal(list.length, 9);

            //take order
        //  function trade(ERC20 srcToken, uint srcAmount, ERC20 destToken, address destAddress, uint conversionRate, bool validate)
            await token.transfer(network, totalPayAmountTwei);
            await token.approve(reserve.address, totalPayAmountTwei, {from: network})
            rc = await reserve.trade(tokenAdd, totalPayAmountTwei, ethAddress, user1, 300, false, {from: network});

            log("take gas 9 full orders from 1 maker: " + rc.receipt.gasUsed);

            list = await reserve.getEthToTokenOrderList();
            assert.equal(list.length, 0);

            let balance = await reserve.makerFunds(maker1, ethAddress);
            assert.equal(balance.valueOf(), ethWeiDepositAmount.sub(srcAmountWei.mul(9)).valueOf());

            balance = await reserve.makerFunds(maker1, tokenAdd);
            assert.equal(balance.valueOf(), totalPayAmountTwei.valueOf());
        });

        it("add 10 buy orders. user takes all and last partial. remaining order stays in book. print gas", async () => {
            let tokenWeiDepositAmount = new BigNumber(0).mul(10 ** 18);
            let kncTweiDepositAmount = 1400 * 10 ** 18;
            let ethWeiDepositAmount = (new BigNumber(20 * 10 ** 18)).add(30000);
            await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

            let srcAmountWei = new BigNumber(2 * 10 ** 18);
            let orderDstTwei = new BigNumber(7 * 10 ** 18);

            // add orders
            let totalPayAmountTwei = new BigNumber(0);
            for (let i = 0; i < 10; i++) {
                let rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei.add(i * 100), {from: maker1});
                totalPayAmountTwei = totalPayAmountTwei.add(orderDstTwei.add(i * 100));
            }

            let list = await reserve.getEthToTokenOrderList();
            assert.equal(list.length, 10);

            //take orders
            totalPayAmountTwei = totalPayAmountTwei.sub(orderDstTwei);
            await token.transfer(network, totalPayAmountTwei);
            await token.approve(reserve.address, totalPayAmountTwei, {from: network})
            rc = await reserve.trade(tokenAdd, totalPayAmountTwei, ethAddress, user1, 300, false, {from: network});

            log("take 9 full orders one partial. remaining order stays in book: " + rc.receipt.gasUsed);

            list = await reserve.getEthToTokenOrderList();
            assert.equal(list.length, 1);

            let balance = await reserve.makerFunds(maker1, ethAddress);
            assert.equal(balance.valueOf(), ethWeiDepositAmount.sub(srcAmountWei.mul(10)).valueOf());

            balance = await reserve.makerFunds(maker1, tokenAdd);
            assert.equal(balance.valueOf(), totalPayAmountTwei.valueOf());
        });

        it("add 10 buy orders. user takes all and last partial. remaining order removed.", async () => {
            let tokenWeiDepositAmount = new BigNumber(0).mul(10 ** 18);
            let kncTweiDepositAmount = 1500 * 10 ** 18;
            let ethWeiDepositAmount = (new BigNumber(20 * 10 ** 18)).add(30000);
            await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

            let srcAmountWei = new BigNumber(2 * 10 ** 18);
            let orderDstTwei = new BigNumber(7 * 10 ** 18);

            // add orders
            let totalPayAmountTwei = new BigNumber(0);
            for (let i = 0; i < 10; i++) {
                let rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
                totalPayAmountTwei = totalPayAmountTwei.add(orderDstTwei);
                orderDstTwei = orderDstTwei.add(500);
            }

            let list = await reserve.getEthToTokenOrderList();
            assert.equal(list.length, 10);

            //take orders
            totalPayAmountTwei = totalPayAmountTwei.sub(100000);
            await token.transfer(network, totalPayAmountTwei);
            await token.approve(reserve.address, totalPayAmountTwei, {from: network})
            rc = await reserve.trade(tokenAdd, totalPayAmountTwei, ethAddress, user1, 300, false, {from: network});

            log("take 9 full orders one partial. remaining order removed from book: " + rc.receipt.gasUsed);

            list = await reserve.getEthToTokenOrderList();
            assert.equal(list.length, 0);

            let takenTweiLastOrder = orderDstTwei.sub(100000);
            let takenEthLastOrder = srcAmountWei.mul(takenTweiLastOrder).div(orderDstTwei).floor();
            let releasedEthLastOrder = srcAmountWei.sub(takenEthLastOrder);
//            log("releasedEthLastOrder " + releasedEthLastOrder);
            let totalTakenEth = (srcAmountWei.mul(9)).add(takenEthLastOrder);
            let balance = await reserve.makerFunds(maker1, ethAddress);
            assert.equal(balance.valueOf(), ethWeiDepositAmount.sub(totalTakenEth).valueOf());

            balance = await reserve.makerFunds(maker1, tokenAdd);
            assert.equal(balance.valueOf(), totalPayAmountTwei.valueOf());
        });

        it("add 3 buy orders per 3 makers. take all orders in one trade. see each maker gets his part of tokens", async () => {
            let tokenWeiDepositAmount = new BigNumber(0).mul(10 ** 18);
            let kncTweiDepositAmount = 600 * 10 ** 18;
            let ethWeiDepositAmount = (new BigNumber(6 * 10 ** 18)).add(3000);
            await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);
            await makerDeposit(maker2, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);
            await makerDeposit(maker3, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

            let srcAmountWei = new BigNumber(2 * 10 ** 18);
            let orderDstTwei = new BigNumber(7 * 10 ** 18);

            // add orders
            let totalPayAmountTwei = new BigNumber(0);
            let expectedBalanceMaker1 = new BigNumber(0);
            let expectedBalanceMaker2 = new BigNumber(0);
            let expectedBalanceMaker3 = new BigNumber(0);

            for (let i = 0; i < 3; i++) {
                let rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
                totalPayAmountTwei = totalPayAmountTwei.add(orderDstTwei);
                expectedBalanceMaker1 = expectedBalanceMaker1.add(orderDstTwei);
                orderDstTwei = orderDstTwei.add(200);
            }

            for (let i = 0; i < 3; i++) {
                let rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker2});
                totalPayAmountTwei = totalPayAmountTwei.add(orderDstTwei);
                expectedBalanceMaker2 = expectedBalanceMaker2.add(orderDstTwei);
                orderDstTwei = orderDstTwei.add(200);
            }

            for (let i = 0; i < 3; i++) {
                let rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker3});
                totalPayAmountTwei = totalPayAmountTwei.add(orderDstTwei);
                expectedBalanceMaker3 = expectedBalanceMaker3.add(orderDstTwei);
                orderDstTwei = orderDstTwei.add(200);
            }

            let list = await reserve.getEthToTokenOrderList();
            assert.equal(list.length, 9);

            //take order
        //  function trade(ERC20 srcToken, uint srcAmount, ERC20 destToken, address destAddress, uint conversionRate, bool validate)
            await token.transfer(network, totalPayAmountTwei);
            await token.approve(reserve.address, totalPayAmountTwei, {from: network})
            rc = await reserve.trade(tokenAdd, totalPayAmountTwei, ethAddress, user1, 300, false, {from: network});

            log("take gas 9 full orders from 3 makers: " + rc.receipt.gasUsed);

            list = await reserve.getEthToTokenOrderList();
            assert.equal(list.length, 0);

            let balance = await reserve.makerFunds(maker1, ethAddress);
            assert.equal(balance.valueOf(), 3000);
            balance = await reserve.makerFunds(maker2, ethAddress);
            assert.equal(balance.valueOf(), 3000);
            balance = await reserve.makerFunds(maker3, ethAddress);
            assert.equal(balance.valueOf(), 3000);

            balance = await reserve.makerFunds(maker1, tokenAdd);
            assert.equal(balance.valueOf(), expectedBalanceMaker1.valueOf());

            balance = await reserve.makerFunds(maker2, tokenAdd);
            assert.equal(balance.valueOf(), expectedBalanceMaker2.valueOf());

            balance = await reserve.makerFunds(maker3, tokenAdd);
            assert.equal(balance.valueOf(), expectedBalanceMaker3.valueOf());
        });
    });

    it("maker add a few sell orders. check correct rate replies.", async () => {
        //rebalance accounts
        await Helper.sendEtherWithPromise(user1, maker1, (65 * 10 ** 18));
        await Helper.sendEtherWithPromise(user1, user2, (19 * 10 ** 18));
        await Helper.sendEtherWithPromise(user1, admin, (6 * 10 ** 18));
        await Helper.sendEtherWithPromise(user1, maker2, (6 * 10 ** 18));

        let tokenWeiDepositAmount = new BigNumber(70).mul(10 ** 18);
        let kncTweiDepositAmount = 600 * 10 ** 18;
        let ethWeiDepositAmount = (new BigNumber(0 * 10 ** 18));
        await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

        // first getConversionRate should return 0
        let rate = await reserve.getConversionRate(token.address, ethAddress, 10 ** 18, 0);
        assert.equal(rate.valueOf(), 0);

        let orderSrcAmountTwei = new BigNumber(6 * 10 ** 18);
        let orderDstWei = new BigNumber(2 * 10 ** 18);

        //add order
        //////////////
//
        let rc = await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei, {from: maker1});
            rc = await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei.add(200), {from: maker1});
            rc = await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei.add(400), {from: maker1});

        //verify rate that takes to  account only first order
        let expectedRate = precisionUnits.mul(orderSrcAmountTwei).div(orderDstWei).floor();
        let srcRateAmount = orderDstWei;
        rate = await reserve.getConversionRate(ethAddress, token.address, srcRateAmount, 0);
        assert.equal(rate.valueOf(), expectedRate.valueOf());

        srcRateAmount = orderDstWei.div(2);
        rate = await reserve.getConversionRate(ethAddress, token.address, srcRateAmount, 0);
        assert.equal(rate.valueOf(), expectedRate.valueOf());

        //verify rate that takes to  account 2 orders
        srcRateAmount = (orderDstWei.mul(2)).add(200);
        expectedRate = precisionUnits.mul(orderSrcAmountTwei.mul(2)).div(srcRateAmount).floor();
        rate = await reserve.getConversionRate(ethAddress, token.address, srcRateAmount, 0);
        assert.equal(rate.valueOf(), expectedRate.valueOf());

        //verify rate that takes to account 3 orders
        srcRateAmount = orderDstWei.mul(3).add(600);
        expectedRate = (precisionUnits.mul(orderSrcAmountTwei.mul(3))).div(srcRateAmount).floor();
        rate = await reserve.getConversionRate(ethAddress, token.address, srcRateAmount, 0);
        assert.equal(rate.valueOf(), expectedRate.valueOf());

        //verify rate that takes to account 1.5 orders
        srcRateAmount = orderDstWei.mul(1.5).add(100);
        expectedRate = precisionUnits.mul(orderSrcAmountTwei.mul(1.5)).div(srcRateAmount).floor();
        rate = await reserve.getConversionRate(ethAddress, token.address, srcRateAmount, 0);
        assert.equal(rate.valueOf(), expectedRate.valueOf());
    });

    it("set different dollar ETH values. see min eth per order changes", async() => {
        let dollarPerEthPrecision = precisionUnits.mul(200);
        await medianizer.setEthPrice(dollarPerEthPrecision);

        //price before updating ETH rate
        let rxLimits = await reserve.limits();
        assert.equal(rxLimits[2].valueOf(), (2 * 10 ** 18)); // min new order Eth
        assert.equal(rxLimits[3].valueOf(), (1 * 10 ** 18)); // min order Eth

        await reserve.setOrderLimits();

        rxLimits = await reserve.limits();
        assert.equal(rxLimits[2].valueOf(), (5 * 10 ** 18)); // min new order Eth
        assert.equal(rxLimits[3].valueOf(), (25 * 10 ** 17)); // min order Eth

        dollarPerEthPrecision = precisionUnits.mul(500);
        await medianizer.setEthPrice(dollarPerEthPrecision);

        rxLimits = await reserve.limits();
        assert.equal(rxLimits[2].valueOf(), (5 * 10 ** 18)); // min new order Eth
        assert.equal(rxLimits[3].valueOf(), (25 * 10 ** 17)); // min order Eth

        await reserve.setOrderLimits();
        rxLimits = await reserve.limits();
        assert.equal(rxLimits[2].valueOf(), (2 * 10 ** 18)); // min new order Eth
        assert.equal(rxLimits[3].valueOf(), (1 * 10 ** 18)); // min order Eth
    })
});

contract('OrderbookReserve_feeBurner_network', async (accounts) => {

    let expectedRate;

    before('one time init. tokens, accounts', async() => {
        admin = accounts[0];
        user1 = accounts[1];
        maker1 = accounts[3];
        operator = accounts[4];
        taker = accounts[5];
        network = accounts[6];

        token = await TestToken.new("the token", "tok", 18);
        tokenAdd = token.address;
        KNCToken = await TestToken.new("kyber crystals", "knc", 18);
        kncAddress = KNCToken.address;

        // prepare kyber network
        mockNetwork = await MockKyberNetwork.new(admin);

        feeBurner = await FeeBurner.new(
            admin,
            kncAddress,
            mockNetwork.address,
            initialEthToKncRatePrecision
        );

        ordersFactory = await OrderListFactory.new();

        medianizer = await MockMedianizer.new();
        await medianizer.setValid(true);
        await medianizer.setEthPrice(dollarsPerEthPrecision);

        reserve = await OrderbookReserve.new(kncAddress, tokenAdd, feeBurner.address, network, medianizer.address,
            minOrderSizeDollar, maxOrdersPerTrade, makerBurnFeeBps);
        await reserve.init(ordersFactory.address);

        let rxLimits = await reserve.limits();
//        log (rxLimits)
        minNewOrderWei = rxLimits[2].valueOf();
        minKncPerEthRatePrecision = rxLimits[4].valueOf();
        burnToStakeFactor = await reserve.BURN_TO_STAKE_FACTOR();
    });

    beforeEach('setup reserve contract for each test', async () => {
        reserve = await OrderbookReserve.new(kncAddress, tokenAdd, feeBurner.address, network, medianizer.address,
                minOrderSizeDollar, maxOrdersPerTrade, makerBurnFeeBps);
        await reserve.init(ordersFactory.address);

        let rxLimits = await reserve.limits();
        minKncPerEthRatePrecision = rxLimits[4].valueOf();

        ethKncRate = initialEthKncRate;
        let ethToKncRatePrecision = precisionUnits.mul(ethKncRate);
        let kncToEthRatePrecision = precisionUnits.div(ethKncRate);

        await mockNetwork.setPairRate(ethAddress, kncAddress, ethToKncRatePrecision);
        await mockNetwork.setPairRate(kncAddress, ethAddress, kncToEthRatePrecision);
    });

    it("add orders modify knc rate to lower knc value, see unlocked knc and staked knc don't change", async() => {
        let tokenWeiDepositAmount = new BigNumber(70 * 10 ** 18);
        let kncTweiDepositAmount = 600 * 10 ** 18;
        let ethWeiDepositAmount = (new BigNumber(0 * 10 ** 18));
        await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

        let orderSrcAmountTwei = new BigNumber(6 * 10 ** 18);
        let orderDstWei = new BigNumber(minNewOrderWei);

        //add orders
        //////////////
        let rc = await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei, {from: maker1});
        rc = await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei.add(400), {from: maker1});
        rc = await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei.add(200), {from: maker1});

        let freeKnc1 = await reserve.makerUnlockedKnc(maker1);
        let stakedKnc1 = await reserve.makerStakedKnc(maker1);

        let rate = await mockNetwork.getExpectedRate(ethAddress, kncAddress, (10 ** 18));
//        log(rate[0].valueOf())
        // set lower Eth to KNC rate (less knc per eth)
        ethKncRate = initialEthKncRate * 2;
        let ethToKncRatePrecision = precisionUnits.mul(ethKncRate);
        let kncToEthRatePrecision = precisionUnits.div(ethKncRate);

        await mockNetwork.setPairRate(ethAddress, kncAddress, ethToKncRatePrecision);
        await mockNetwork.setPairRate(kncAddress, ethAddress, kncToEthRatePrecision);

        rate = await mockNetwork.getExpectedRate(ethAddress, kncAddress, (10 ** 18));
//        log(rate[0].valueOf())
        assert.equal(ethToKncRatePrecision.valueOf(), rate[0].valueOf());
        rate = await mockNetwork.getExpectedRate(kncAddress, ethAddress, (10 ** 18));
        assert.equal(kncToEthRatePrecision.add(1).floor().valueOf(), rate[0].valueOf());

        await feeBurner.setKNCRate();
        let freeKnc2 = await reserve.makerUnlockedKnc(maker1);
        let stakedKnc2 = await reserve.makerStakedKnc(maker1);
        assert.equal(stakedKnc2.valueOf(), stakedKnc1.valueOf());
        assert.equal(freeKnc2.valueOf(), freeKnc1.valueOf());

        await reserve.setKncPerEthMinRate();

        freeKnc2 = await reserve.makerUnlockedKnc(maker1);
        stakedKnc2 = await reserve.makerStakedKnc(maker1);
//        log('stakedKnc1')
//        log(stakedKnc1.valueOf())
//        log('stakedKnc2')
//        log(stakedKnc2.valueOf())
//        log('freeKnc1')
//        log(freeKnc1.valueOf())
//        log('freeKnc2')
//        log(freeKnc2.valueOf())

        assert.equal(stakedKnc2.valueOf(), stakedKnc1.valueOf());
        assert.equal(freeKnc2.valueOf(), freeKnc1.valueOf());
    })

    it("create knc rate change, so stakes per order aren't enough. see can still take order", async() => {
        let tokenWeiDepositAmount = new BigNumber(70 * 10 ** 18);
        let kncTweiDepositAmount = 600 * 10 ** 18;
        let ethWeiDepositAmount = (new BigNumber(0 * 10 ** 18));
        await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

        let orderSrcAmountTwei = new BigNumber(6 * 10 ** 18);
        let orderDstWei = new BigNumber(minNewOrderWei);

        //add orders
        //////////////
        let rc = await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei, {from: maker1});
        rc = await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei.add(400), {from: maker1});
        rc = await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei.add(200), {from: maker1});

        let freeKnc1 = await reserve.makerUnlockedKnc(maker1);
        let stakedKnc1 = await reserve.makerStakedKnc(maker1);
        await reserve.withdrawKncFee(freeKnc1, {from: maker1});

        let freeKnc2 = await reserve.makerUnlockedKnc(maker1);
        assert.equal(freeKnc2.valueOf(), 0);
        
        //see can't add orders
        try {
            await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei.add(200), {from: maker1});
            assert(false, "throw was expected in line above.")
        } catch(e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        // set lower Eth to KNC rate (less knc per eth)
        ethKncRate = initialEthKncRate * 2;
        let ethToKncRatePrecision = precisionUnits.mul(ethKncRate);
        let kncToEthRatePrecision = precisionUnits.div(ethKncRate);

        await mockNetwork.setPairRate(ethAddress, kncAddress, ethToKncRatePrecision);
        await mockNetwork.setPairRate(kncAddress, ethAddress, kncToEthRatePrecision);

        let rate = await mockNetwork.getExpectedRate(ethAddress, kncAddress, (10 ** 18));
        assert.equal(ethToKncRatePrecision.valueOf(), rate[0].valueOf());
        rate = await mockNetwork.getExpectedRate(kncAddress, ethAddress, (10 ** 18));
        assert.equal(kncToEthRatePrecision.add(1).floor().valueOf(), rate[0].valueOf());

        await feeBurner.setKNCRate();
        freeKnc2 = await reserve.makerUnlockedKnc(maker1);
        let stakedKnc2 = await reserve.makerStakedKnc(maker1);

        assert.equal(stakedKnc2.valueOf(), stakedKnc1.valueOf());
        assert.equal(freeKnc2.valueOf(), 0);

        //see can't add orders
        try {
            await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei.add(200), {from: maker1});
            assert(false, "throw was expected in line above.")
        } catch(e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //see can take orders
        let totalPayValue = orderDstWei.mul(3).add(600);
        rc = await reserve.trade(ethAddress, totalPayValue, tokenAdd, user1, 300, false, {from: network, value: totalPayValue});
    });

    it.only("create knc rate that sets stake amount equal to burn amount, see can take order", async() => {
        let tokenWeiDepositAmount = new BigNumber(70 * 10 ** 18);
        let kncTweiDepositAmount = 600 * 10 ** 18;
        let ethWeiDepositAmount = (new BigNumber(0 * 10 ** 18));
        await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

        let orderSrcAmountTwei = new BigNumber(6 * 10 ** 18);
        let orderDstWei = new BigNumber(minNewOrderWei);

        //add orders
        //////////////
        let rc = await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei, {from: maker1});
        let rate = await reserve.getConversionRate(ethAddress, tokenAdd, 10 ** 8, 100);
        assert(rate.valueOf() > 0);

        let freeKnc1 = await reserve.makerUnlockedKnc(maker1);
        let stakedKnc1 = await reserve.makerStakedKnc(maker1);
        let expectedBurn1 = await reserve.calcBurnAmountMinSetRate(orderDstWei);
        assert.equal(expectedBurn1.mul(burnToStakeFactor).valueOf(), stakedKnc1.valueOf());
        await reserve.withdrawKncFee(freeKnc1, {from: maker1});

        // set lower Eth to KNC rate (more knc per eth)
        ethKncRate = initialEthKncRate * burnToStakeFactor;
        let ethToKncRatePrecision = precisionUnits.mul(ethKncRate);
        let kncToEthRatePrecision = precisionUnits.div(ethKncRate);

        await mockNetwork.setPairRate(ethAddress, kncAddress, ethToKncRatePrecision);
        await mockNetwork.setPairRate(kncAddress, ethAddress, kncToEthRatePrecision);

        await feeBurner.setKNCRate();
        await reserve.setKncPerEthMinRate();

        // now staked amount should be equal knc amount by maker. and equal burn amount for this order
        ////
        let freeKnc2 = await reserve.makerUnlockedKnc(maker1);
        assert.equal(freeKnc2.valueOf(), 0);

        let stakedKnc2 = await reserve.makerStakedKnc(maker1);
        let makerKncAmount = await reserve.makerKnc(maker1);
        assert.equal(stakedKnc2.valueOf(), makerKncAmount.valueOf());

        let expectedBurn2 = await reserve.calcBurnAmountMinSetRate(orderDstWei);
        assert.equal(expectedBurn2.valueOf(), stakedKnc1.valueOf());

        //see can take order
        let totalPayValue = orderDstWei;
        rc = await reserve.trade(ethAddress, totalPayValue, tokenAdd, user1, 300, false, {from: network, value: totalPayValue});
    });

    it.only("create knc rate that sets stake amount < burn amount, see get rate blocks and returns 0", async() => {
        let tokenWeiDepositAmount = new BigNumber(70 * 10 ** 18);
        let kncTweiDepositAmount = 600 * 10 ** 18;
        let ethWeiDepositAmount = (new BigNumber(0 * 10 ** 18));
        await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount);

        let orderSrcAmountTwei = new BigNumber(6 * 10 ** 18);
        let orderDstWei = new BigNumber(minNewOrderWei);

        //add orders
        //////////////
        let rc = await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei, {from: maker1});
        let rate = await reserve.getConversionRate(ethAddress, tokenAdd, 10 ** 8, 522);
        assert(rate.valueOf() > 0);

        let freeKnc1 = await reserve.makerUnlockedKnc(maker1);
        await reserve.withdrawKncFee(freeKnc1, {from: maker1});

        // set lower Eth to KNC rate (more knc per eth)
        ethKncRate = initialEthKncRate * (burnToStakeFactor * 1 + 1 * 1);
        let ethToKncRatePrecision = precisionUnits.mul(ethKncRate);
        let kncToEthRatePrecision = precisionUnits.div(ethKncRate);

        await mockNetwork.setPairRate(ethAddress, kncAddress, ethToKncRatePrecision);
        await mockNetwork.setPairRate(kncAddress, ethAddress, kncToEthRatePrecision);

        await feeBurner.setKNCRate();
        await reserve.setKncPerEthMinRate();

        // now staked amount should be smaller then maker knc amount. get rate should be blocked
        ////
        let freeKnc2 = await reserve.makerUnlockedKnc(maker1);
        assert.equal(freeKnc2.valueOf(), 0);

        let stakedKnc2 = await reserve.makerStakedKnc(maker1);
        let makerKncAmount = await reserve.makerKnc(maker1);
        assert(stakedKnc2.valueOf() > makerKncAmount.valueOf());

        let expectedBurn2 = await reserve.calcBurnAmountMinSetRate(orderDstWei);
        assert(expectedBurn2.valueOf() > makerKncAmount.valueOf());

        //see now conversion rate 0
        rate = await reserve.getConversionRate(ethAddress, tokenAdd, 10 ** 8, 52);
        assert.equal(rate.valueOf(), 0);
    });
});


function log(str) {
    console.log(str);
}

async function makerDeposit(maker, ethWei, tokenTwei, kncTwei) {

    await token.approve(reserve.address, tokenTwei);
    await reserve.depositToken(maker, tokenTwei);
    await KNCToken.approve(reserve.address, kncTwei);
    await reserve.depositKncForFee(maker, kncTwei);
    await reserve.depositEther(maker, {from: maker, value: ethWei});
}

function calcRateFromQty(srcAmount, dstAmount, srcDecimals, dstDecimals) {
    if (dstDecimals >= srcDecimals) {
        let decimals = new BigNumber(10 ** (dstDecimals - srcDecimals));
        return ((precisionUnits.mul(dstAmount)).div(decimals.mul(srcAmount))).floor();
    } else {
        let decimals = new BigNumber(10 ** (srcDecimals - dstDecimals));
        return ((precisionUnits.mul(dstAmount).mul(decimals)).div(srcAmount)).floor();
    }
}
