let TestToken = artifacts.require("./mockContracts/TestToken.sol");
//let PermissionLessReserve = artifacts.require("./PermissionLessReserve.sol");
let PermissionLessReserve = artifacts.require("./MockContracts/MockPermissionLess.sol");
let KyberNetwork = artifacts.require("./KyberNetwork.sol");
let KyberController = artifacts.require("./KyberController.sol");
let FeeBurner = artifacts.require("./FeeBurner.sol");

let Helper = require("./helper.js");
let BigNumber = require('bignumber.js');

//global variables
//////////////////
let precisionUnits = (new BigNumber(10).pow(18));
let ethAddress = '0x00eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
let precision = new BigNumber(10).pow(18);

//permission groups
let admin;
let withDrawAddress;

//contracts
let reserve;
let feeBurner;

//tokens data
////////////
let token;
let tokenAdd;
let KNCToken;
let kncAddress;

let buyHeadId;
let sellHeadId;
let tailId;

//addresses
let user1;
let user2;
let maker1;
let maker2;

let init = true;

let currentBlock;

contract('PermissionLessReserve', async (accounts) => {

    beforeEach('setup contract for each test', async () => {

        if(init) {
            //below should happen once
            admin = accounts[0];
            user1 = accounts[1];
            user2 = accounts[2];
            maker1 = accounts[3];
            maker2 = accounts[4];
            let network = accounts[5];
            withDrawAddress = accounts[6];

            token = await TestToken.new("the token", "TOK", 18);
            tokenAdd = token.address;

            KNCToken = await TestToken.new("Kyber Crystals", "KNC", 18);
            kncAddress = KNCToken.address;

            feeBurner = await FeeBurner.new(admin, kncAddress, network);
            currentBlock = await Helper.getCurrentBlock();
            init = false;
        }


        reserve = await PermissionLessReserve.new(feeBurner.address, kncAddress, tokenAdd, admin);
    });

    afterEach('withdraw ETH from contracts', async () => {
        let rxWei = await reserve.getMakerFreeWei(maker1);
        if (rxWei.valueOf() > 0) {
            await reserve.makerWithdrawEth(rxWei.valueOf(), {from: maker1})
        }

        rxWei = await reserve.getMakerFreeWei(maker2);
        if (rxWei.valueOf() > 0) {
            await reserve.makerWithdrawEth(rxWei.valueOf(), {from: maker2})
        }
    });

    it("test globals.", async function () {
        buyHeadId = (await reserve.BUY_HEAD_ID()).valueOf();
        sellHeadId = (await reserve.SELL_HEAD_ID()).valueOf();
        tailId = (await reserve.TAIL_ID()).valueOf();

        let rxToken = await reserve.reserveToken();
        assert.equal(rxToken.valueOf(), tokenAdd);

        let rxKnc = await reserve.kncToken();
        assert.equal(rxKnc.valueOf(), kncAddress);
    });

    it("test order allocation, take and release orders, see as expected", async function () {
        let nextID = await reserve.nextId();

        await reserve.testAllocateOrders(admin, 10);

        let bitMap = await reserve.getBitMap(admin);
//        log("bit map " + bitMap);

        let orderId = await reserve.testTakeOrderId.call(admin);
        assert.equal(orderId.valueOf(), nextID.valueOf());
        await reserve.testTakeOrderId(admin)

        bitMap = await reserve.getBitMap(admin);
//        log("bit map " + bitMap);

        orderId = await reserve.testTakeOrderId.call(admin);
        let nextValue = nextID.add(1).valueOf();
        assert.equal(orderId.valueOf(), nextValue);
        await reserve.testTakeOrderId(admin);

        //take two more
        await reserve.testTakeOrderId(admin);
        await reserve.testTakeOrderId(admin);

        orderId = await reserve.testTakeOrderId.call(admin);
        nextValue = nextID.add(4).valueOf();
        assert.equal(orderId.valueOf(), nextValue);

//        log("bit map before release: " + await reserve.getBitMap(admin))
        //release 2nd ID
        let releaseVal = nextID.add(1).valueOf();
//        log("release " + releaseVal)
        await reserve.testReleaseOrderId(admin, releaseVal);
//        log("bit map after release: " + await reserve.getBitMap(admin))

        // take add see get 2nd ID
        orderId = await reserve.testTakeOrderId.call(admin);
        assert.equal(orderId.valueOf(), releaseVal);
        await reserve.testTakeOrderId(admin);

        releaseVal = nextID.add(3).valueOf();
        await reserve.testReleaseOrderId(admin, releaseVal);

        // take add see get 2nd ID
        orderId = await reserve.testTakeOrderId.call(admin);
        assert.equal(orderId.valueOf(), releaseVal);
        await reserve.testTakeOrderId(admin);
    });

    it("maker deposit tokens, ethers, knc, validate updated in contract", async function () {
//        makerDepositTokens(address maker, ERC20 token, uint amountTwei) public {
        let amountTwei = 5 * 10 ** 19; //500 tokens
        let amountKnc = 600 * 10 ** 18;
        let amountEth = 2 * 10 ** 18;

        await makerDeposit(maker1, amountEth, amountTwei.valueOf(), amountKnc.valueOf());

        let rxNumTwei = await reserve.getMakerFreeTokenTwei(maker1);
        assert.equal(rxNumTwei.valueOf(), amountTwei);

        let rxKncTwei = await reserve.getMakerFreeKNC(maker1);
        assert.equal(rxKncTwei.valueOf(), amountKnc);

        rxKncTwei = await reserve.getMakerStakedKNC(maker1);
        assert.equal(rxKncTwei.valueOf(), 0);

        //makerDepositEther
        let rxWei = await reserve.getMakerFreeWei(maker1);
        assert.equal(rxWei.valueOf(), amountEth);

        await reserve.makerWithdrawEth(rxWei, {from: maker1})
        rxWei = await reserve.getMakerFreeWei(maker1);
        assert.equal(rxWei.valueOf(), 0);
    });

    it("maker deposit knc, test bind knc.", async function () {
        let initKnc = (new BigNumber(2)).mul(10 ** 18);

        await makerDeposit(maker1, 0, 0, initKnc.valueOf());

        let stakedKnc = await reserve.getMakerStakedKNC(maker1);
        assert.equal(stakedKnc.valueOf(), 0);

        let freeKnc = await reserve.getMakerFreeKNC(maker1);
        assert.equal(freeKnc.valueOf(), initKnc.valueOf());

        let stakeKncVal = 10 ** 17;
        await reserve.testBindStakes(maker1, stakeKncVal); //0.1 tokens

        stakedKnc = await reserve.getMakerStakedKNC(maker1);
        assert.equal(stakedKnc.valueOf(), stakeKncVal);

        freeKnc = await reserve.getMakerFreeKNC(maker1);
        assert.equal(freeKnc.valueOf(), initKnc.sub(stakeKncVal).valueOf());

        let stakeKnc2nd = 10 ** 16;
        await reserve.testBindStakes(maker1, stakeKnc2nd); //0.1 tokens
        let expectedStakes = (new BigNumber(stakeKncVal)).add(stakeKnc2nd);

        stakedKnc = await reserve.getMakerStakedKNC(maker1);
        assert.equal(stakedKnc.valueOf(), expectedStakes.valueOf());

        freeKnc = await reserve.getMakerFreeKNC(maker1);
        assert.equal(freeKnc.valueOf(), initKnc.sub(expectedStakes).valueOf());
    });

    it("maker deposit knc, bind knc. test release knc stakes", async function () {
        let initKnc = (new BigNumber(2)).mul(10 ** 18);

        await makerDeposit(maker1, 0, 0, initKnc.valueOf());
        let stakeKncVal = new BigNumber(10 ** 18);
        await reserve.testBindStakes(maker1, stakeKncVal.valueOf());

        stakedKnc = await reserve.getMakerStakedKNC(maker1);
        assert.equal(stakedKnc.valueOf(), stakeKncVal.valueOf());

        freeKnc = await reserve.getMakerFreeKNC(maker1);
        assert.equal(freeKnc.valueOf(), initKnc.sub(stakeKncVal).valueOf());

        // now release
        let releaseAmount = 10 ** 17;
        await reserve.testHandleStakes(maker1, releaseAmount, 0);

        stakedKnc = await reserve.getMakerStakedKNC(maker1);
        assert.equal(stakedKnc.valueOf(), stakeKncVal.sub(releaseAmount).valueOf());

        let expectedFreeKnc = freeKnc.add(releaseAmount);
        freeKnc = await reserve.getMakerFreeKNC(maker1);
        assert.equal(freeKnc.valueOf(), expectedFreeKnc.valueOf());
    });

    it("maker add buy token order. see rate updated. verify order details.", async function () {
        let amountTwei = 5 * 10 ** 19; //500 tokens
        let amountKnc = 600 * 10 ** 18;

        await makerDeposit(maker1, 0, amountTwei.valueOf(), amountKnc.valueOf());

        let orderPayAmountWei = 2 * 10 ** 18;
        let orderExchangeTwei = 9 * 10 ** 18;

        // first getConversionRate should return 0
//        getConversionRate(ERC20 src, ERC20 dest, uint srcQty, uint blockNumber) public view returns(uint)
        let rate = await reserve.getConversionRate(ethAddress, tokenAdd, 10 ** 18, 0);
        assert.equal(rate.valueOf(), 0);

        //now add order
        let rc = await reserve.addMakeOrder(maker1, true, orderPayAmountWei, orderExchangeTwei, 0, {from: maker1});

        let orderDetails = await reserve.getOrderDetails(rc.logs[0].args.orderId.valueOf());
//        log(orderDetails);

        assert.equal(orderDetails[0].valueOf(), maker1);
        assert.equal(orderDetails[1].valueOf(), orderPayAmountWei);
        assert.equal(orderDetails[2].valueOf(), orderExchangeTwei);
        assert.equal(orderDetails[3].valueOf(), buyHeadId); // prev should be buy head id - since first
        assert.equal(orderDetails[4].valueOf(), tailId); // next should be tail ID - since last

        rate = await reserve.getConversionRate(ethAddress, token.address, 10 ** 18, 0);
//        log("rate " + rate);
        let expectedRate = precisionUnits.mul(orderExchangeTwei).div(orderPayAmountWei).floor();
        assert.equal(rate.valueOf(), expectedRate.valueOf());
    });

    it("maker add buy token order. see funds updated.", async function () {
        let amountTwei = (new BigNumber(5)).mul(10 ** 19); //500 tokens
        let amountKnc = 600 * 10 ** 18;

        await makerDeposit(maker1, 0, amountTwei.valueOf(), amountKnc.valueOf());

        let orderPayAmountWei = 2 * 10 ** 18;
        let orderExchangeTwei = 9 * 10 ** 18;

        //check maker free token funds
        let rxFreeTwei = await reserve.getMakerFreeTokenTwei(maker1);
        assert.equal(rxFreeTwei.valueOf(), amountTwei.valueOf() );

        //now add order
        let rc = await reserve.addMakeOrder(maker1, true, orderPayAmountWei, orderExchangeTwei, 0, {from: maker1});

        let expectedFreeTwei = amountTwei.sub(orderExchangeTwei);

        rxFreeTwei = await reserve.getMakerFreeTokenTwei(maker1);
        assert.equal(rxFreeTwei.valueOf(), expectedFreeTwei.valueOf() );
    });

    it("maker add buy token order. cancel order and see canceled.", async function () {
        let amountTwei = (new BigNumber(5)).mul(10 ** 19); //500 tokens

        await makerDeposit(maker1, 0, amountTwei.valueOf(), (600 * 10 ** 18));

        let orderPayAmountWei = 2 * 10 ** 18;
        let orderExchangeTwei = 9 * 10 ** 18;

        //now add order
        let rc = await reserve.addMakeOrder(maker1, true, orderPayAmountWei, orderExchangeTwei, 0, {from: maker1});

        let orderList = await reserve.getBuyOrderList();
        assert.equal(orderList.length, 2); //including head order

        rc = await reserve.cancelOrder(orderList[1], {from: maker1});
//        log(rc.logs[0].args)

        orderList = await reserve.getBuyOrderList();
        assert.equal(orderList.length, 1); //including head order
    });

    it("maker add sell token order. see rate updated. verify order details.", async function () {
        let orderPayAmountTwei = 9 * 10 ** 18;
        let orderExchangeWei = 2 * 10 ** 18;

        let amountKnc = 600 * 10 ** 18;
        let amountEth = 2 * 10 ** 18;

        await makerDeposit(maker1, amountEth, 0, amountKnc.valueOf());

        // first getConversionRate should return 0
        let rate = await reserve.getConversionRate(token.address, ethAddress, 10 ** 18, 0);
        assert.equal(rate.valueOf(), 0);

        //now add order
        //////////////
//        addMakeOrder(address maker, bool isEthToToken, uint128 payAmount, uint128 exchangeAmount, uint32 hintPrevOrder)
        let rc = await reserve.addMakeOrder(maker1, false, orderPayAmountTwei, orderExchangeWei, 0, {from: maker1});
//        log(rc.logs[0].args)

        let orderDetails = await reserve.getOrderDetails(rc.logs[0].args.orderId.valueOf());
//        log(orderDetails);

        assert.equal(orderDetails[0].valueOf(), maker1);
        assert.equal(orderDetails[1].valueOf(), orderPayAmountTwei);
        assert.equal(orderDetails[2].valueOf(), orderExchangeWei);
        assert.equal(orderDetails[3].valueOf(), sellHeadId); // prev should be sell head id - since first
        assert.equal(orderDetails[4].valueOf(), tailId); // next should be tail ID - since last

        let orderList = await reserve.getSellOrderList();
        assert.equal(orderList.length, 2); //sell head only
//        log(orderList);

        rate = await reserve.getConversionRate(token.address, ethAddress, 10 ** 18, 0);
//        log("rate " + rate);
        let expectedRate = precisionUnits.mul(orderExchangeWei).div(orderPayAmountTwei).floor();
        assert.equal(rate.valueOf(), expectedRate.valueOf());
    });

    it("maker add sell token order. see funds updated.", async function () {
        let orderPayAmountTwei = 9 * 10 ** 18;
        let orderExchangeWei = (new BigNumber(2)).mul(10 ** 18);

        let amountKnc = 600 * 10 ** 18;
        let amountEth = (new BigNumber(2.1)).mul(10 ** 18);

        await makerDeposit(maker1, amountEth, 0, amountKnc.valueOf());

        //check maker free token funds
        let rxFreeWei = await reserve.getMakerFreeWei(maker1);
        assert.equal(rxFreeWei.valueOf(), amountEth.valueOf() );

        //now add order
        let rc = await reserve.addMakeOrder(maker1, false, orderPayAmountTwei, orderExchangeWei, 0, {from: maker1});

        let expectedFreeWei = amountEth.sub(orderExchangeWei);

        rxFreeWei = await reserve.getMakerFreeWei(maker1);
        assert.equal(rxFreeWei.valueOf(), expectedFreeWei.valueOf() );
    });

    it("maker add sell token order. cancel order and see canceled.", async function () {
        let orderPayAmountTwei = 9 * 10 ** 18;
        let orderExchangeWei = 2 * 10 ** 18;

        let amountKnc = 600 * 10 ** 18;
        let amountEth = 2 * 10 ** 18;

        await makerDeposit(maker1, amountEth, 0, amountKnc.valueOf());

        //now add order
        let rc = await reserve.addMakeOrder(maker1, false, orderPayAmountTwei, orderExchangeWei, 0, {from: maker1});

        let orderList = await reserve.getSellOrderList();
        assert.equal(orderList.length, 2); //including head order

        rc = await reserve.cancelOrder(orderList[1], {from: maker1});
//        log(rc.logs[0].args)

        orderList = await reserve.getSellOrderList();
        assert.equal(orderList.length, 1); //including head order
    });

    it("maker add a few buy orders. see orders added in correct position. print gas price per order", async function () {
        let fundDepositTwei = new BigNumber(500).mul(10 ** 18); // 500 tokens
        let amountKnc = 600 * 10 ** 18;

        await makerDeposit(maker1, 0, fundDepositTwei.valueOf(), amountKnc.valueOf());

        let orderPayAmountWei = ((new BigNumber(2)).mul((new BigNumber(10)).pow(18))).add(2000); // 2 ether
        let orderExchangeTwei = (new BigNumber(9)).mul((new BigNumber(10)).pow(18));

        let rc = await reserve.addMakeOrder(maker1, true, orderPayAmountWei, orderExchangeTwei, 0, {from: maker1});

        let order1ID = rc.logs[0].args.orderId.valueOf();

        let orderDetails = await reserve.getOrderDetails(rc.logs[0].args.orderId.valueOf());
    //        log(orderDetails);

        assert.equal(orderDetails[0].valueOf(), maker1);
        assert.equal(orderDetails[1].valueOf(), orderPayAmountWei);
        assert.equal(orderDetails[2].valueOf(), orderExchangeTwei);
        assert.equal(orderDetails[3].valueOf(), buyHeadId); // prev should be buy head id - since first
        assert.equal(orderDetails[4].valueOf(), tailId); // next should be tail ID - since last

        // insert order as last in list
        orderPayAmountWei = orderPayAmountWei.add(2000);

        rc = await reserve.addMakeOrder(maker1, true, orderPayAmountWei, orderExchangeTwei, 0, {from: maker1});
        let order2ID = rc.logs[0].args.orderId.valueOf();

        orderDetails = await reserve.getOrderDetails(rc.logs[0].args.orderId.valueOf());

        assert.equal(orderDetails[3].valueOf(), order1ID);
        assert.equal(orderDetails[4].valueOf(), tailId); // next should be tail ID - since last

        // insert order as last in list
        orderPayAmountWei = orderPayAmountWei.add(2000);

        rc = await reserve.addMakeOrder(maker1, true, orderPayAmountWei, orderExchangeTwei, 0, {from: maker1});

        let order3ID = rc.logs[0].args.orderId.valueOf();
        orderDetails = await reserve.getOrderDetails(rc.logs[0].args.orderId.valueOf());

        assert.equal(orderDetails[3].valueOf(), order2ID);
        assert.equal(orderDetails[4].valueOf(), tailId); // next should be tail ID - since last

        //get order list
        let orderList = await reserve.getBuyOrderList();
//        log ("list \n" + orderList);
        //get first order details
        orderDetails = await reserve.getOrderDetails(orderList[1].valueOf());

        // insert order as first in list
        let bestOrderPayAmount = orderDetails[1];
        let bestOrderDstAmount = orderDetails[2].add(200).valueOf();

        rc = await reserve.addMakeOrder(maker1, true, bestOrderPayAmount, bestOrderDstAmount, 0, {from: maker1});
        let order4ID = rc.logs[0].args.orderId.valueOf();

//        log("order4 " + order4ID)

        orderDetails = await reserve.getOrderDetails(rc.logs[0].args.orderId.valueOf());

        assert.equal(orderDetails[3].valueOf(), buyHeadId); // prev should be buy head id - since first
        assert.equal(orderDetails[4].valueOf(), order1ID); // next should be tail ID - since last

        //now insert order as 2nd best.
        let secondBestPayAmount = bestOrderPayAmount.add(30).valueOf();
        rc = await reserve.addMakeOrder(maker1, true, secondBestPayAmount, bestOrderDstAmount, 0, {from: maker1});
        let order5ID = rc.logs[0].args.orderId.valueOf();

        orderDetails = await reserve.getOrderDetails(rc.logs[0].args.orderId.valueOf());

        assert.equal(orderDetails[3].valueOf(), order4ID); // prev should be buy head id - since first
        assert.equal(orderDetails[4].valueOf(), order1ID); // next should be tail ID - since last
    });

    it("maker - check gas price for buy orders added on canceled orders.", async function () {
        let fundDepositTwei = new BigNumber(500).mul(10 ** 18); // 500 tokens
        let amountKnc = 600 * 10 ** 18;

        await makerDeposit(maker1, 0, fundDepositTwei.valueOf(), amountKnc.valueOf());

        let orderPayAmountWei = ((new BigNumber(2)).mul((10 **18))).add(2000); // 2 ether
        let orderExchangeTwei = (new BigNumber(9)).mul(10 ** 18);

        let rc = await reserve.addMakeOrder(maker1, true, orderPayAmountWei, orderExchangeTwei, 0, {from: maker1});
        log("make buy order gas(order 1 in list): ID: " + rc.logs[0].args.orderId.valueOf() + " gas: "+ rc.receipt.gasUsed);

        // insert order as last in list
        orderPayAmountWei = orderPayAmountWei.add(2000);

        rc = await reserve.addMakeOrder(maker1, true, orderPayAmountWei, orderExchangeTwei, 0, {from: maker1});
        log("make buy order gas(order 2 in list): ID: " + rc.logs[0].args.orderId.valueOf() + " gas: "+ rc.receipt.gasUsed);

        // insert order as last in list
        orderPayAmountWei = orderPayAmountWei.add(2000);

        rc = await reserve.addMakeOrder(maker1, true, orderPayAmountWei, orderExchangeTwei, 0, {from: maker1});
        log("make buy order gas(order 3 in list): ID: " + rc.logs[0].args.orderId.valueOf() + " gas: "+ rc.receipt.gasUsed);

        orderPayAmountWei = orderPayAmountWei.sub(6000);

        rc = await reserve.addMakeOrder(maker1, true, orderPayAmountWei, orderExchangeTwei, 0, {from: maker1});
        log("make buy order gas(order 1 in list): ID: " + rc.logs[0].args.orderId.valueOf() + " gas: "+ rc.receipt.gasUsed);

        //now insert order as 2nd best.
        orderPayAmountWei = orderPayAmountWei.add(30).valueOf();
        rc = await reserve.addMakeOrder(maker1, true, orderPayAmountWei, orderExchangeTwei, 0, {from: maker1});
        log("make buy order gas(order 2 in list): ID: " + rc.logs[0].args.orderId.valueOf() + " gas: "+ rc.receipt.gasUsed);

        let orderList = await reserve.getBuyOrderList();
        for (let i = 1; i < orderList.length; i++) {
            //start from 1 since first order is head
            await reserve.cancelOrder(orderList[i], {from: maker1});
        }

        log()
        log("cancel all orders and add again.")
        orderPayAmountWei = ((new BigNumber(2)).mul((new BigNumber(10)).pow(18))).add(2000); // 2 ether
        orderExchangeTwei = (new BigNumber(9)).mul((new BigNumber(10)).pow(18));
        rc = await reserve.addMakeOrder(maker1, true, orderPayAmountWei, orderExchangeTwei, 0, {from: maker1});
        log("make buy order gas(order 1 in list). ID: " + rc.logs[0].args.orderId.valueOf() + " gas: "+ rc.receipt.gasUsed);

        // insert order as last in list
        orderPayAmountWei = orderPayAmountWei.add(2000);

        rc = await reserve.addMakeOrder(maker1, true, orderPayAmountWei, orderExchangeTwei, 0, {from: maker1});
        log("make buy order gas(order 2 in list). ID: " + rc.logs[0].args.orderId.valueOf() + " gas: "+ rc.receipt.gasUsed);

        // insert order as last in list
        orderPayAmountWei = orderPayAmountWei.add(2000);

        rc = await reserve.addMakeOrder(maker1, true, orderPayAmountWei, orderExchangeTwei, 0, {from: maker1});
        log("make buy order gas(order 3 in list): ID: " + rc.logs[0].args.orderId.valueOf() + " gas: "+ rc.receipt.gasUsed);

        orderPayAmountWei = orderPayAmountWei.sub(6000);

        rc = await reserve.addMakeOrder(maker1, true, orderPayAmountWei, orderExchangeTwei, 0, {from: maker1});
        log("make buy order gas(order 1 in list): ID: " + rc.logs[0].args.orderId.valueOf() + " gas: "+ rc.receipt.gasUsed);

        //now insert order as 2nd best.
        orderPayAmountWei = orderPayAmountWei.add(30).valueOf();
        rc = await reserve.addMakeOrder(maker1, true, orderPayAmountWei, orderExchangeTwei, 0, {from: maker1});
        log("make buy order gas(order 2 in list): ID: " + rc.logs[0].args.orderId.valueOf() + " gas: "+ rc.receipt.gasUsed);

        orderList = await reserve.getSellOrderList();
        for (let i = 1; i < orderList.length; i++) {
            //start from 1 since first order is head
            await reserve.cancelOrder(orderList[i], {from: maker1});
        }
    });

    it("maker add a few sell orders. see orders added in correct position.", async function () {
        let amountKnc = 600 * 10 ** 18;
        let amountEth = 14 * 10 ** 18;

        await makerDeposit(maker1, amountEth, 0, amountKnc.valueOf());

        let orderPayAmountTwei = new BigNumber(9).mul(10 ** 18);
        let orderExchangeWei = new BigNumber(2).mul(10 ** 18);

        let rc = await reserve.addMakeOrder(maker1, false, orderPayAmountTwei, orderExchangeWei, 0, {from: maker1});

        let order1ID = rc.logs[0].args.orderId.valueOf();

        let orderDetails = await reserve.getOrderDetails(rc.logs[0].args.orderId.valueOf());
    //        log(orderDetails);

        assert.equal(orderDetails[0].valueOf(), maker1);
        assert.equal(orderDetails[1].valueOf(), orderPayAmountTwei);
        assert.equal(orderDetails[2].valueOf(), orderExchangeWei);
        assert.equal(orderDetails[3].valueOf(), sellHeadId); // prev should be buy head id - since first
        assert.equal(orderDetails[4].valueOf(), tailId); // next should be tail ID - since last

        // insert order as last in list
        orderPayAmountTwei = orderPayAmountTwei.add(2000);

        rc = await reserve.addMakeOrder(maker1, false, orderPayAmountTwei, orderExchangeWei, 0, {from: maker1});

        let order2ID = rc.logs[0].args.orderId.valueOf();

        orderDetails = await reserve.getOrderDetails(rc.logs[0].args.orderId.valueOf());
        //        log(orderDetails);

        assert.equal(orderDetails[3].valueOf(), order1ID); // prev should be buy head id - since first
        assert.equal(orderDetails[4].valueOf(), tailId); // next should be tail ID - since last

        // insert another order as last in list
        orderPayAmountTwei = orderPayAmountTwei.add(2000);

        rc = await reserve.addMakeOrder(maker1, false, orderPayAmountTwei, orderExchangeWei, 0, {from: maker1});
        let order3ID = rc.logs[0].args.orderId.valueOf();

        orderDetails = await reserve.getOrderDetails(rc.logs[0].args.orderId.valueOf());
        //        log(orderDetails);

        assert.equal(orderDetails[3].valueOf(), order2ID); // prev should be buy head id - since first
        assert.equal(orderDetails[4].valueOf(), tailId); // next should be tail ID - since last

        //get order list
        let orderList = await reserve.getSellOrderList();
//        log ("list \n" + orderList);
        //get first order details
        orderDetails = await reserve.getOrderDetails(orderList[1].valueOf());

        // insert order as first in list
        let bestOrderPayAmount = orderDetails[1];
        let bestOrderDstAmount = orderDetails[2].add(200).valueOf();

        rc = await reserve.addMakeOrder(maker1, false, bestOrderPayAmount, bestOrderDstAmount, 0, {from: maker1});
        let order4ID = rc.logs[0].args.orderId.valueOf();
//        log("order4 " + order4ID)

        orderDetails = await reserve.getOrderDetails(rc.logs[0].args.orderId.valueOf());

        assert.equal(orderDetails[3].valueOf(), sellHeadId); // prev should be buy head id - since first
        assert.equal(orderDetails[4].valueOf(), order1ID); // next should be tail ID - since last

        //now insert order as 2nd best.
        let secondBestPayAmount = bestOrderPayAmount.add(30).valueOf();
        rc = await reserve.addMakeOrder(maker1, false, secondBestPayAmount, bestOrderDstAmount, 0, {from: maker1});
        let order5ID = rc.logs[0].args.orderId.valueOf();
        //        log("order4 " + order4ID)

        orderDetails = await reserve.getOrderDetails(rc.logs[0].args.orderId.valueOf());

        assert.equal(orderDetails[3].valueOf(), order4ID); // prev should be buy head id - since first
        assert.equal(orderDetails[4].valueOf(), order1ID); // next should be tail ID - since last


        orderList = await reserve.getSellOrderList();
        for (let i = 1; i < orderList.length; i++) {
            //start from 1 since first order is head
            await reserve.cancelOrder(orderList[i], {from: maker1});
        }
    });

    it("calc expected stake and calc burn amount. validate match", async function () {
        let kncToEthRate = await feeBurner.kncPerETHRate();
//        log ("kncPerETHRate " + kncToEthRate.valueOf());

        let weiValue = new BigNumber(2 * 10 ** 18);
        let feeBps = await reserve.makersBurnFeeBps();

        let expectedBurn = weiValue.mul(kncToEthRate).mul(feeBps).div(1000);
//        log ("expected burn " + expectedBurn);

        let calcBurn = await reserve.calcBurnAmount(weiValue.valueOf());

        assert.equal(expectedBurn.valueOf(), calcBurn.valueOf());

        let kncStakePerWeiBps = await reserve.kncStakePerEtherBPS();

        let calcExpectedStake = weiValue.mul(kncStakePerWeiBps).div(1000);
        let calcStake = await reserve.calcKncStake(weiValue);
//        log("stake val " + calcStake.valueOf());
        assert.equal(calcStake.valueOf(), calcExpectedStake.valueOf());

        assert(calcBurn < calcStake);
    });

    it("add buy order. test take full order - without trade function.", async function () {
        let amountTwei = 5 * 10 ** 19; //500 tokens
        let amountKnc = 600 * 10 ** 18;

        await makerDeposit(maker1, 0, amountTwei.valueOf(), amountKnc.valueOf());

        let orderPayAmountWei = 2 * 10 ** 18;
        let orderExchangeTwei = 9 * 10 ** 18;

        // add order
        let rc = await reserve.addMakeOrder(maker1, true, orderPayAmountWei, orderExchangeTwei, 0, {from: maker1});

        let list = await reserve.getBuyOrderList();
        assert.equal(list.length, 2); //including head order.

        //take order
        await reserve.testTakeFullOrder(list[1]);

        rate = await reserve.getConversionRate(ethAddress, token.address, 10 ** 18, 0);
        assert.equal(rate.valueOf(), 0);

        list = await reserve.getBuyOrderList();
        assert.equal(list.length, 1); //including head order.
    });

    it("add buy order. test take partial order - without trade function.", async function () {
        let amountTwei = 5 * 10 ** 19; //500 tokens
        let amountKnc = 600 * 10 ** 18;

        await makerDeposit(maker1, 0, amountTwei.valueOf(), amountKnc.valueOf());

        let orderPayAmountWei = new BigNumber(2 * 10 ** 18);
        let orderExchangeTwei = 9 * 10 ** 18;

        // add order
        let rc = await reserve.addMakeOrder(maker1, true, orderPayAmountWei, orderExchangeTwei, 0, {from: maker1});

        let list = await reserve.getBuyOrderList();
        assert.equal(list.length, 2); //including head order.

        //take order
        await reserve.testTakePartialOrder(list[1], orderPayAmountWei.sub(5000));

        rate = await reserve.getConversionRate(ethAddress, token.address, 10 ** 18, 0);
        assert.equal(rate.valueOf(), 0);

        list = await reserve.getBuyOrderList();
        assert.equal(list.length, 1); //including head order.
    });

    it("maker add buy order. user takes order. see taken order removed as expected.", async function () {
        let amountTwei = 5 * 10 ** 19; //500 tokens
        let amountKnc = 600 * 10 ** 18;

        await makerDeposit(maker1, 0, amountTwei.valueOf(), amountKnc.valueOf());

        let orderPayAmountWei = 2 * 10 ** 18;
        let orderExchangeTwei = 9 * 10 ** 18;

        // add order
        let rc = await reserve.addMakeOrder(maker1, true, orderPayAmountWei, orderExchangeTwei, 0, {from: maker1});

        let list = await reserve.getBuyOrderList();
        assert.equal(list.length, 2); //including head order.

        //take order
//  function trade(ERC20 srcToken, uint srcAmount, ERC20 destToken, address destAddress, uint conversionRate, bool validate)

        rc = await reserve.trade(ethAddress, orderPayAmountWei, tokenAdd, user1, 300, false,
                        {value: orderPayAmountWei});
        log("take single order gas: " + rc.receipt.gasUsed);

        rate = await reserve.getConversionRate(ethAddress, token.address, 10 ** 18, 0);
        assert.equal(rate.valueOf(), 0);

        list = await reserve.getBuyOrderList();
        assert.equal(list.length, 1); //including head order.
    });

    it("maker add a few buy orders. user takes full orders. see user gets traded tokens. maker gets ether.", async function () {
        let amountTwei = 5 * 10 ** 19; //500 tokens
        let amountKnc = 2000 * 10 ** 18;

        await makerDeposit(maker1, 0, amountTwei.valueOf(), amountKnc.valueOf());

        let orderPayAmountWei = new BigNumber(2 * 10 ** 18);
        let orderExchangeTwei = new BigNumber(9 * 10 ** 18);

        // add order
        let rc = await reserve.addMakeOrder(maker1, true, orderPayAmountWei, orderExchangeTwei, 0, {from: maker1});
        rc = await reserve.addMakeOrder(maker1, true, orderPayAmountWei.add(1000), orderExchangeTwei, 0, {from: maker1});
        rc = await reserve.addMakeOrder(maker1, true, orderPayAmountWei.add(2000), orderExchangeTwei, 0, {from: maker1});

        //take all orders
//  function trade(ERC20 srcToken, uint srcAmount, ERC20 destToken, address destAddress, uint conversionRate, bool validate)

        //maker eth balance before. (should be 0)
        let balance = await reserve.getMakerFreeWei(maker1);
        assert.equal(balance.valueOf(), 0);

        let totalOrderValue = orderPayAmountWei.mul(3).add(3000);
        let totalDestValue = orderExchangeTwei.mul(3);

        let userBalanceBefore = await token.balanceOf(user1);

        rc = await reserve.trade(ethAddress, totalOrderValue, tokenAdd, user1, 300, false,
                        {value: totalOrderValue});
        log("take 3 orders gas: " + rc.receipt.gasUsed);

        let userBalanceAfter = await token.balanceOf(user1);
        assert.equal(userBalanceAfter.valueOf(), totalDestValue.add(userBalanceBefore).valueOf());

        balance = await reserve.getMakerFreeWei(maker1);
        assert.equal(balance.valueOf(), totalOrderValue.valueOf());

        rate = await reserve.getConversionRate(ethAddress, token.address, 10 ** 18, 0);
        assert.equal(rate.valueOf(), 0);

        list = await reserve.getBuyOrderList();
        assert.equal(list.length, 1); //including head order.
    });

    it("maker add buy order. user takes partial. remaining order stays in book.", async function () {
        let amountTwei = new BigNumber(9 * 10 ** 18); //500 tokens
        let amountKnc = 600 * 10 ** 18;

        await makerDeposit(maker1, 0, amountTwei.valueOf(), amountKnc.valueOf());

        let orderPayAmountWei = new BigNumber(2 * 10 ** 18);
        let orderExchangeTwei = amountTwei;

        // add order
        let rc = await reserve.addMakeOrder(maker1, true, orderPayAmountWei, orderExchangeTwei, 0, {from: maker1});

        let list = await reserve.getBuyOrderList();
        assert.equal(list.length, 2); //including head order.

        //take order
//  function trade(ERC20 srcToken, uint srcAmount, ERC20 destToken, address destAddress, uint conversionRate, bool validate)
        let takeAmount = orderPayAmountWei.div(2).sub(100);
        rc = await reserve.trade(ethAddress, takeAmount, tokenAdd, user1, 300, false,
                    {value: takeAmount});

        log("take partial order gas (rest not removed): " + rc.receipt.gasUsed);

        list = await reserve.getBuyOrderList();
        assert.equal(list.length, 2); //including head order.

        let balance = await reserve.getMakerFreeWei(maker1);
        assert.equal(balance.valueOf(), takeAmount.valueOf());

        balance = await reserve.getMakerFreeTokenTwei(maker1);
        assert.equal(balance.valueOf(), 0);
    });

    it("maker add buy order. user takes partial. remaining order removed.", async function () {
        let amountTwei = new BigNumber(9 * 10 ** 18); //500 tokens
        let amountKnc = 600 * 10 ** 18;

        await makerDeposit(maker1, 0, amountTwei.valueOf(), amountKnc.valueOf());

        let orderPayAmountWei = new BigNumber(2 * 10 ** 18);
        let orderExchangeTwei = amountTwei;

        // add order
        let rc = await reserve.addMakeOrder(maker1, true, orderPayAmountWei, orderExchangeTwei, 0, {from: maker1});

        let list = await reserve.getBuyOrderList();
        assert.equal(list.length, 2); //including head order.

        //take order
//  function trade(ERC20 srcToken, uint srcAmount, ERC20 destToken, address destAddress, uint conversionRate, bool validate)
        let takeAmount = orderPayAmountWei.div(2).add(300);
        rc = await reserve.trade(ethAddress, takeAmount, tokenAdd, user1, 300, false,
                        {value: takeAmount});

        log("take partial order gas (remaining removed): " + rc.receipt.gasUsed);

        list = await reserve.getBuyOrderList();
        assert.equal(list.length, 1); //including head order.

        let balance = await reserve.getMakerFreeWei(maker1);
        assert.equal(balance.valueOf(), takeAmount.valueOf());

        let expectedDestAmount = orderExchangeTwei.mul(takeAmount).div(orderPayAmountWei).floor();
        let expectedRemainingBalance = amountTwei.sub(expectedDestAmount);

        balance = await reserve.getMakerFreeTokenTwei(maker1);
        assert.equal(balance.valueOf(), expectedRemainingBalance.valueOf());
    });

    it("maker add a few sell orders. user takes orders. see taken orders are removed as expected.", async function () {
        let orderPayAmountTwei = new BigNumber(9 * 10 ** 18);
        let orderExchangeWei = new BigNumber(2 * 10 ** 18);

        let amountKnc = 600 * 10 ** 18;
        let amountEth = (new BigNumber(6 * 10 ** 18)).add(600);

        await makerDeposit(maker1, amountEth.valueOf(), 0, amountKnc.valueOf());

        // first getConversionRate should return 0
        let rate = await reserve.getConversionRate(token.address, ethAddress, 10 ** 18, 0);
        assert.equal(rate.valueOf(), 0);

        //now add order
        //////////////
//        addMakeOrder(address maker, bool isEthToToken, uint128 payAmount, uint128 exchangeAmount, uint32 hintPrevOrder)
        let rc = await reserve.addMakeOrder(maker1, false, orderPayAmountTwei, orderExchangeWei, 0, {from: maker1});
        rc = await reserve.addMakeOrder(maker1, false, orderPayAmountTwei, orderExchangeWei.add(400), 0, {from: maker1});
            rc = await reserve.addMakeOrder(maker1, false, orderPayAmountTwei, orderExchangeWei.add(200), 0, {from: maker1});
//        log(rc.logs[0].args)

        let orderList = await reserve.getSellOrderList();
        assert.equal(orderList.length, 4); //also sell head
//        log(orderList);
        let srcRateAmount = new BigNumber(10 ** 18);
        rate = await reserve.getConversionRate(token.address, ethAddress, srcRateAmount, 0);
//        log("rate " + rate);

        let dstRateAmount = srcRateAmount.mul(orderExchangeWei).div(orderPayAmountTwei).floor();
        let expectedRate = precisionUnits.mul(dstRateAmount).div(srcRateAmount).floor();
        assert.equal(rate.valueOf(), expectedRate.valueOf());

        //tokens to user
        let totalPayValue = orderPayAmountWei.mul(3);
        await token.transfer(totalPayValue, user1);
        await token.approve(reserve.address, totalPayValue);

        let userInitialBalance = await await Helper.getBalancePromise(user1);
        //trade
        rc = await reserve.trade(tokenAdd, totalPayValue, ethAddress, user1, 300, false);
        log("take 3 sell orders gas: " + rc.receipt.gasUsed);

        orderList = await reserve.getSellOrderList();
        assert.equal(orderList.length, 1); //also sell head

        let userBalanceAfter = await Helper.getBalancePromise(user1);
        let expectedBalance = userInitialBalance.add(amountEth);

        assert.equal(userBalanceAfter.valueOf(), expectedBalance.valueOf());
    });

    it("maker add a few sell orders. user takes orders. see user gets traded tokens. maker gets ether.", async function () {
    });

});


contract('PermissionLessReserve on network', async (accounts) => {

    beforeEach('setup contract for each test', async () => {

        if(init) {
            //below should happen once
            admin = accounts[0];
            user1 = accounts[1];
            user2 = accounts[2];
            maker1 = accounts[3];
            maker2 = accounts[4];
            let network = accounts[5];
            withDrawAddress = accounts[6];

            token = await TestToken.new("the token", "TOK", 18);
            tokenAdd = token.address;

            KNCToken = await TestToken.new("Kyber Crystals", "KNC", 18);
            kncAddress = KNCToken.address;

            feeBurner = await FeeBurner.new(admin, kncAddress, network);
            currentBlock = await Helper.getCurrentBlock();
            init = false;
        }


        reserve = await PermissionLessReserve.new(feeBurner.address, kncAddress, tokenAdd, admin);
    });

    afterEach('withdraw ETH from contracts', async () => {
        let rxWei = await reserve.getMakerFreeWei(maker1);
        if (rxWei.valueOf() > 0) {
            await reserve.makerWithdrawEth(rxWei.valueOf(), {from: maker1})
        }

        rxWei = await reserve.getMakerFreeWei(maker2);
        if (rxWei.valueOf() > 0) {
            await reserve.makerWithdrawEth(rxWei.valueOf(), {from: maker2})
        }
    });
});

function log(str) {
    console.log(str);
}

async function makerDeposit(maker, ethWei, tokenTwei, kncTwei) {

    await token.approve(reserve.address, tokenTwei);
    await reserve.makerDepositTokens(maker, tokenTwei);
    await KNCToken.approve(reserve.address, kncTwei);
    await reserve.makerDepositKnc(maker, kncTwei);
    await reserve.makerDepositEthers(maker, {from: maker, value: ethWei});
}

async function twoStringsSoliditySha(str1, str2) {
    let str1Cut = str1.slice(2);
    let str2Cut = str2.slice(2);
    let combinedSTR = str1Cut + str2Cut;

    // Convert a string to a byte array
    for (var bytes = [], c = 0; c < combinedSTR.length; c += 2)
        bytes.push(parseInt(combinedSTR.substr(c, 2), 16));

    let sha3Res = await web3.sha3(bytes, {encoding: "hex"});

    return sha3Res;
};

function addBps (price, bps) {
    return (price.mul(10000 + bps).div(10000));
};

function compareRates (receivedRate, expectedRate) {
    expectedRate = expectedRate - (expectedRate % 10);
    receivedRate = receivedRate - (receivedRate % 10);
    assert.equal(expectedRate, receivedRate, "different prices");
};


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

