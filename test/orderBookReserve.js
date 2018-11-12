const TestToken = artifacts.require("./mockContracts/TestToken.sol");
const KyberNetwork = artifacts.require("./KyberNetwork.sol");
const FeeBurner = artifacts.require("./FeeBurner.sol");
const Orders = artifacts.require("./permissionless/Orders.sol");
const OrdersFactory = artifacts.require("./permissionless/OrdersFactory.sol");
const OrderBookReserve = artifacts.require("./permissionless/mock/MockOrderBookReserve.sol");
const FeeBurnerResolver = artifacts.require("./permissionless/mock/MockFeeBurnerResolver.sol");

const Helper = require("./helper.js");
const BigNumber = require('bignumber.js');

//global variables
//////////////////
const precisionUnits = (new BigNumber(10).pow(18));
const ethAddress = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

//permission groups
let admin;
let withDrawAddress;

//contracts
let reserve;
let feeBurner;
let feeBurnerResolver;
let network;
let ordersFactory;

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

let firstFreeOrderIdPerReserveList;

let numOrderIdsPerMaker;
const ethToKncRatePrecision = precisionUnits.mul(550);

let currentBlock;

contract('OrderBookReserve', async (accounts) => {

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
//        network = await KyberNetwork.new(admin);
        
        feeBurner = await FeeBurner.new(admin, kncAddress, network, ethToKncRatePrecision);

        feeBurnerResolver = await FeeBurnerResolver.new(feeBurner.address);

        ordersFactory = await OrdersFactory.new();

        currentBlock = await Helper.getCurrentBlock();

        let minMakeOrderWei = new BigNumber(2 * 10 ** 18);
        let minOrderWei = new BigNumber(10 ** 18);
        reserve = await OrderBookReserve.new(kncAddress, tokenAdd, feeBurnerResolver.address, ordersFactory.address,
            minMakeOrderWei, minOrderWei, 25);
//        log(reserve);
        await reserve.init();

        numOrderIdsPerMaker = await reserve.numOrdersToAllocate();

        let ordersAdd = await reserve.tokenToEthList();
        let orders = Orders.at(ordersAdd.valueOf());

        headId = (await orders.HEAD_ID()).valueOf();
        tailId = (await orders.TAIL_ID()).valueOf();
        firstFreeOrderIdPerReserveList = (await orders.nextFreeId()).valueOf();
    });

    beforeEach('setup contract for each test', async () => {

//        log(feeBurner.address + " " + kncAddress + " " + tokenAdd)
        let minMakeOrderWei = new BigNumber(2 * 10 ** 18);
        let minOrderWei = new BigNumber(10 ** 18);
        reserve = await OrderBookReserve.new(kncAddress, tokenAdd, feeBurnerResolver.address, ordersFactory.address,
            minMakeOrderWei, minOrderWei, 25);
//        log(reserve);
        await reserve.init();

        numOrderIdsPerMaker = await reserve.numOrdersToAllocate();
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
        let rxToken = await reserve.token();
        assert.equal(rxToken.valueOf(), tokenAdd);

        let rxKnc = await reserve.kncToken();
        assert.equal(rxKnc.valueOf(), kncAddress);
    });

    it("maker deposit tokens, ethers, knc, validate updated in contract", async () => {
        let tokenWeiDepositAmount = 50 * 10 ** 18;
        let kncTweiDepositAmount = 600 * 10 ** 18;
        let ethWeiDepositAmount = 2 * 10 ** 18;

        await makerDeposit(maker1, ethWeiDepositAmount, tokenWeiDepositAmount.valueOf(), kncTweiDepositAmount.valueOf());

        let rxNumTwei = await reserve.makerFunds(maker1, tokenAdd);
        assert.equal(rxNumTwei.valueOf(), tokenWeiDepositAmount);

        let rxKncTwei = await reserve.makerUnusedKNC(maker1);
        assert.equal(rxKncTwei.valueOf(), kncTweiDepositAmount);

        rxKncTwei = await reserve.makerStakedKNC(maker1);
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

        let rxKncTwei = await reserve.makerUnusedKNC(maker1);
        assert.equal(rxKncTwei.valueOf(), kncTweiDepositAmount);

        rxKncTwei = await reserve.makerStakedKNC(maker1);
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
        rxKncTwei = await reserve.makerUnusedKNC(maker1);
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

        let rxKncTwei = await reserve.makerUnusedKNC(maker1);
        assert.equal(rxKncTwei.valueOf(), (kncTweiDepositAmount * 3));

        let rxWei = await reserve.makerFunds(maker1, ethAddress);
        assert.equal(rxWei.valueOf(), (ethWeiDepositAmount * 3));

        //maker2 balances
        rxNumTwei = await reserve.makerFunds(maker2, tokenAdd);
        assert.equal(rxNumTwei.valueOf(), (tokenWeiDepositAmount * 2));

        rxKncTwei = await reserve.makerUnusedKNC(maker2);
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
        let kncTweiDepositAmount = (new BigNumber(2)).mul(10 ** 18);

        await makerDeposit(maker1, 0, 0, kncTweiDepositAmount.valueOf());

        let stakedKnc = await reserve.makerStakedKNC(maker1);
        assert.equal(stakedKnc.valueOf(), 0);

        let freeKnc = await reserve.makerUnusedKNC(maker1);
        assert.equal(freeKnc.valueOf(), kncTweiDepositAmount.valueOf());

        let stakeKncVal = 10 ** 17;
        await reserve.testBindStakes(maker1, stakeKncVal); //0.1 tokens

        stakedKnc = await reserve.makerStakedKNC(maker1);
        assert.equal(stakedKnc.valueOf(), stakeKncVal);

        freeKnc = await reserve.makerUnusedKNC(maker1);
        assert.equal(freeKnc.valueOf(), kncTweiDepositAmount.sub(stakeKncVal).valueOf());

        let stakeKnc2nd = 10 ** 16;
        await reserve.testBindStakes(maker1, stakeKnc2nd); //0.1 tokens
        let expectedStakes = (new BigNumber(stakeKncVal)).add(stakeKnc2nd);

        stakedKnc = await reserve.makerStakedKNC(maker1);
        assert.equal(stakedKnc.valueOf(), expectedStakes.valueOf());

        freeKnc = await reserve.makerUnusedKNC(maker1);
        assert.equal(freeKnc.valueOf(), kncTweiDepositAmount.sub(expectedStakes).valueOf());
    });

    it("maker deposit knc, bind knc. test release knc stakes", async () => {
        let kncTweiDepositAmount = (new BigNumber(2)).mul(10 ** 18);

        await makerDeposit(maker1, 0, 0, kncTweiDepositAmount.valueOf());
        let stakeKncVal = new BigNumber(10 ** 18);
        await reserve.testBindStakes(maker1, stakeKncVal.valueOf());

        stakedKnc = await reserve.makerStakedKNC(maker1);
        assert.equal(stakedKnc.valueOf(), stakeKncVal.valueOf());

        freeKnc = await reserve.makerUnusedKNC(maker1);
        assert.equal(freeKnc.valueOf(), kncTweiDepositAmount.sub(stakeKncVal).valueOf());

        // now release
        let releaseAmount = 10 ** 17;
        await reserve.testHandleStakes(maker1, releaseAmount, 0);

        stakedKnc = await reserve.makerStakedKNC(maker1);
        assert.equal(stakedKnc.valueOf(), stakeKncVal.sub(releaseAmount).valueOf());

        let expectedFreeKnc = freeKnc.add(releaseAmount);
        freeKnc = await reserve.makerUnusedKNC(maker1);
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

    it("maker add sell token order. see funds & knc stakes updated.", async () => {
        let kncTweiDepositAmount = new BigNumber(600 * 10 ** 18);
        let tokenWeiDepositAmount = new BigNumber(11.1 * 10 ** 18);
        await makerDeposit(maker1, 0, tokenWeiDepositAmount, kncTweiDepositAmount.valueOf());

        let orderSrcAmountTwei = 9 * 10 ** 18;
        let orderDstWei = (new BigNumber(2)).mul(10 ** 18);

        //check maker free token funds
        let rxFreeTwei = await reserve.makerFunds(maker1, tokenAdd);
        assert.equal(rxFreeTwei.valueOf(), tokenWeiDepositAmount.valueOf() );
        let freeKnc = await reserve.makerUnusedKNC(maker1);
        assert.equal(freeKnc.valueOf(), kncTweiDepositAmount.valueOf());
        let stakedKnc =  await reserve.makerStakedKNC(maker1);
        assert.equal(stakedKnc.valueOf(), 0);

        //add order
        let rc = await reserve.submitTokenToEthOrderWHint(orderSrcAmountTwei, orderDstWei, 0, {from: maker1});

        let expectedFreeTwei = tokenWeiDepositAmount.sub(orderSrcAmountTwei);
        rxFreeTwei = await reserve.makerFunds(maker1, tokenAdd);
        assert.equal(rxFreeTwei.valueOf(), expectedFreeTwei.valueOf());

        expectedStakedKnc = await reserve.calcKncStake(orderDstWei);
        stakedKnc =  await reserve.makerStakedKNC(maker1);
        assert.equal(stakedKnc.valueOf(), expectedStakedKnc.valueOf());
        freeKnc = await reserve.makerUnusedKNC(maker1);
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
        let freeKnc = await reserve.makerUnusedKNC(maker1);
        assert.equal(freeKnc.valueOf(), kncTweiDepositAmount.valueOf());
        let stakedKnc =  await reserve.makerStakedKNC(maker1);
        assert.equal(stakedKnc.valueOf(), 0);

        //add order
        let rc = await reserve.submitEthToTokenOrder(orderSrcAmountWei, orderDstTwei, {from: maker1});

        let expectedFreeWei = 700;
        rxFreeWei = await reserve.makerFunds(maker1, ethAddress);
        assert.equal(rxFreeWei.valueOf(), expectedFreeWei.valueOf());

        expectedStakedKnc = await reserve.calcKncStake(orderSrcAmountWei);
        stakedKnc =  await reserve.makerStakedKNC(maker1);
        assert.equal(stakedKnc.valueOf(), expectedStakedKnc.valueOf());
        freeKnc = await reserve.makerUnusedKNC(maker1);
        assert.equal(freeKnc.valueOf(), kncTweiDepositAmount.sub(expectedStakedKnc).valueOf());
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
        let freeKnc = await reserve.makerUnusedKNC(maker1);
        assert.equal(freeKnc.valueOf(), kncTweiDepositAmount.valueOf());
        let stakedKnc =  await reserve.makerStakedKNC(maker1);
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
        let actualStake = await reserve.makerStakedKNC(maker1);
        assert.equal(expectedStake.valueOf(), actualStake.valueOf());
        let freeKnc = await reserve.makerUnusedKNC(maker1);
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
        let actualStake = await reserve.makerStakedKNC(maker1);
        assert.equal(expectedStake.valueOf(), actualStake.valueOf());
        let freeKnc = await reserve.makerUnusedKNC(maker1);
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
        let actualStake = await reserve.makerStakedKNC(maker1);
        assert.equal(expectedStake.valueOf(), actualStake.valueOf());
        let freeKnc = await reserve.makerUnusedKNC(maker1);
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
        let actualStake = await reserve.makerStakedKNC(maker1);
        assert.equal(expectedStake.valueOf(), actualStake.valueOf());
        let freeKnc = await reserve.makerUnusedKNC(maker1);
        assert.equal(freeKnc.valueOf(), kncTweiDepositAmount.sub(expectedStake).valueOf());
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
        let actualStake = await reserve.makerStakedKNC(maker1);
        assert.equal(expectedStake.valueOf(), actualStake.valueOf());
        let freeKnc = await reserve.makerUnusedKNC(maker1);
        assert.equal(freeKnc.valueOf(), kncTweiDepositAmount.sub(expectedStake).valueOf());
        let updatedSource = (new BigNumber(2 * 10 ** 18)).sub(100);

        // update source amount
        try {
            rc = await reserve.updateEthToTokenOrder(orderId, updatedSource, orderDstTwei, {from: maker1});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        rxFreeWei = await reserve.makerFunds(maker1, ethAddress);
        assert.equal(rxFreeWei.valueOf(), expectedFreeWei.valueOf());

        expectedStake = await reserve.calcKncStake(srcAmountWei);
        actualStake = await reserve.makerStakedKNC(maker1);
        assert.equal(expectedStake.valueOf(), actualStake.valueOf());
        freeKnc = await reserve.makerUnusedKNC(maker1);
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
        let prevOrder = await reserve.getAddOrderHintEthToToken(srcAmountWei, orderDstTwei);
        assert.equal(prevOrder.valueOf(), headId);

        // get add hint if set as 2nd
        orderDstTwei = orderDstTwei.add(2000);
        prevOrder = await reserve.getAddOrderHintEthToToken(srcAmountWei, orderDstTwei);
        assert.equal(prevOrder.valueOf(), order1ID);

        // get add hint if set as 3rd = last
        orderDstTwei = orderDstTwei.add(2000);
        prevOrder = await reserve.getAddOrderHintEthToToken(srcAmountWei, orderDstTwei);
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
        let prevOrder = await reserve.getAddOrderHintTokenToEth(srcAmountTwei, orderDestWei);
        assert.equal(prevOrder.valueOf(), headId);

        // get add hint if set as 2nd
        orderDestWei = orderDestWei.add(2000);
        prevOrder = await reserve.getAddOrderHintTokenToEth(srcAmountTwei, orderDestWei);
        assert.equal(prevOrder.valueOf(), order1ID);

        // get add hint if set as 3rd = last
        orderDestWei = orderDestWei.add(2000);
        prevOrder = await reserve.getAddOrderHintTokenToEth(srcAmountTwei, orderDestWei);
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
        let prevOrder = await reserve.getUpdateOrderHintEthToToken(order3ID, srcAmountWei, orderDstTwei);
        assert.equal(prevOrder.valueOf(), order2ID);

        // get update hint
        orderDstTwei = orderDstTwei.sub(2200);
        prevOrder = await reserve.getUpdateOrderHintEthToToken(order3ID, srcAmountWei, orderDstTwei);
        assert.equal(prevOrder.valueOf(), order1ID);

        // get update hint
        orderDstTwei = orderDstTwei.sub(2000);
        prevOrder = await reserve.getUpdateOrderHintEthToToken(order3ID, srcAmountWei, orderDstTwei);
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
        let prevOrder = await reserve.getUpdateOrderHintTokenToEth(order3ID, srcAmountTwei, orderDestWei);
        assert.equal(prevOrder.valueOf(), order2ID);

        // get update hint
        orderDestWei = orderDestWei.sub(2200);
        prevOrder = await reserve.getUpdateOrderHintTokenToEth(order3ID, srcAmountTwei, orderDestWei);
        assert.equal(prevOrder.valueOf(), order1ID);

        // get update hint
        orderDestWei = orderDestWei.sub(2000);
        prevOrder = await reserve.getUpdateOrderHintTokenToEth(order3ID, srcAmountTwei, orderDestWei);
        assert.equal(prevOrder.valueOf(), headId);
    });

    it("maker add few buy orders. update order with wrong hint. see success and print gas", async() => {
        let ethWeiDepositAmount = (new BigNumber(8 * 10 ** 18)).add(9000);
        let kncTweiDepositAmount = new BigNumber(600 * 10 ** 18);
        await makerDeposit(maker1, ethWeiDepositAmount, 0, kncTweiDepositAmount);

        let srcAmountWei = (new BigNumber(2 * 10 ** 18)).add(800); // 2 ether
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
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await reserve.updateEthToTokenOrder(order1ID, srcAmountWei, orderDstTwei, {from: maker2});
            assert(false, "throw was expected in line above.")
        } catch(e){
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
        let tokenWeiDepositAmount = new BigNumber(500).mul(10 ** 18); // 500 tokens
        let kncTweiDepositAmount = 600 * 10 ** 18;
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
//        log("make buy order gas(order 3 in list): ID: " + rc.logs[0].args.orderId.valueOf() + " gas: "+ rc.receipt.gasUsed);
        gasAmountOrderReuse = gasAmountOrderReuse.add(rc.receipt.gasUsed);

        orderDstTwei = orderDstTwei.sub(6000);

        rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
//        log("make buy order gas(order 1 in list): ID: " + rc.logs[0].args.orderId.valueOf() + " gas: "+ rc.receipt.gasUsed);
        gasAmountOrderReuse = gasAmountOrderReuse.add(rc.receipt.gasUsed);

        //now insert order as 2nd best.
        orderDstTwei = orderDstTwei.add(300);
        rc = await reserve.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
//        log("make buy order gas(order 2 in list): ID: " + rc.logs[0].args.orderId.valueOf() + " gas: "+ rc.receipt.gasUsed);
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

        rc = await reserve.trade(ethAddress, orderDstWei, tokenAdd, user1, 300, false, {from:user1, value: orderDstWei});
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

        await token.transfer(user1, totalPayValue);
        await token.approve(reserve.address, totalPayValue, {from: user1})
        let rc = await reserve.trade(tokenAdd, totalPayValue, ethAddress, user1, 300, false, {from:user1});

        log("take 5 orders gas: " + rc.receipt.gasUsed);
        assert(rc.receipt.gasUsed < 330000);
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

        await token.transfer(user1, totalPayValue);
        await token.approve(reserve.address, totalPayValue, {from: user1})
        let rc = await reserve.trade(tokenAdd, totalPayValue, ethAddress, user1, 300, false, {from:user1});

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

    it("calc expected stake and calc burn amount. validate match", async () => {
        let kncToEthRatePrecision = new BigNumber(await feeBurner.kncPerEthRatePrecision());
        let kncToEthRate = kncToEthRatePrecision.div(precisionUnits);
//        log ("ethKncRatePrecision " + kncToEthRate.valueOf());

        let weiValue = new BigNumber(2 * 10 ** 18);
        let feeBps = await reserve.makerBurnFeeBps();

        let expectedBurn = weiValue.mul(kncToEthRate).mul(feeBps).div(1000);
//        log ("expected burn " + expectedBurn);

        let calcBurn = await reserve.calcBurnAmount(weiValue.valueOf());

        assert.equal(expectedBurn.valueOf(), calcBurn.valueOf());

        let kncStakePerWeiBps = await reserve.kncStakePerEtherBps();

        let calcExpectedStake = weiValue.mul(kncStakePerWeiBps).div(1000);
        let calcStake = await reserve.calcKncStake(weiValue);
//        log("stake val " + calcStake.valueOf());
        assert.equal(calcStake.valueOf(), calcExpectedStake.valueOf());

        assert(calcBurn < calcStake);
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

        await token.transfer(user1, orderDstTwei);
        await token.approve(reserve.address, orderDstTwei, {from: user1})
        rc = await reserve.trade(tokenAdd, orderDstTwei, ethAddress, user1, 300, false,
                                {from:user1});

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

        await token.transfer(user1, totalPayValue);
        await token.approve(reserve.address, totalPayValue, {from: user1})
        rc = await reserve.trade(tokenAdd, totalPayValue, ethAddress, user1, 300, false, {from:user1});
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

    it("maker add buy order. user takes partial. remaining order stays in book.", async () => {
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
        let takeAmount = orderDstTwei.div(2).sub(2000);

        await token.transfer(user1, takeAmount);
        await token.approve(reserve.address, takeAmount, {from: user1})
        rc = await reserve.trade(tokenAdd, takeAmount, ethAddress, user1, 300, false, {from: user1});

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

        await token.transfer(user1, tokenPayAmount);
        await token.approve(reserve.address, tokenPayAmount, {from: user1})
        rc = await reserve.trade(tokenAdd, tokenPayAmount, ethAddress, user1, 300, false, {from: user1});

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

    it("maker add a few sell orders. check correct rate replies.", async () => {
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
        rc = await reserve.trade(ethAddress, totalPayValueWei, tokenAdd, user1, 300, false, {from: user2, value: totalPayValueWei});
        log("take 3 sell orders gas: " + rc.receipt.gasUsed);

        orderList = await reserve.getTokenToEthOrderList();
        assert.equal(orderList.length, 0);

        let userBalanceAfter = await token.balanceOf(user1);
        let expectedBalance = userInitialTokBalance.add(orderSrcAmountTwei.mul(3));
        assert.equal(userBalanceAfter.valueOf(), expectedBalance.valueOf());

        let makerEthBalance = await reserve.makerFunds(maker1, ethAddress);
        assert.equal(makerEthBalance.valueOf(), totalPayValueWei);
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
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //take two orders and add again. (this time with hint)
        let payValueWei = new BigNumber(4 * 10 ** 18).add(500);
        rc = await reserve.trade(ethAddress, payValueWei, tokenAdd, user1, 300, false, {from: user2, value: payValueWei});

        orderList = await reserve.getTokenToEthOrderList();
        assert.equal(orderList.length, (numOrderIdsPerMaker - 2));

        //add without hint
        orderDstWei = orderDstWei.add(500);
        rc = await reserve.submitTokenToEthOrder(orderSrcAmountTwei, orderDstWei, {from: maker1});
        let addGasOrder255NoHint = rc.receipt.gasUsed;

        orderDstWei = orderDstWei.add(500);
        rc = await reserve.submitTokenToEthOrderWHint(orderSrcAmountTwei, orderDstWei, rc.logs[0].args.orderId.valueOf(),
                        {from: maker1});
        let addGasOrder256WithHint = rc.receipt.gasUsed;

        log("addGasOrder255NoHint " + addGasOrder255NoHint);
        log("addGasOrder256WithHint " + addGasOrder256WithHint);

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

    it("add 9 buy orders 1 maker. user takes all orders. print gas", async () => {
        let tokenWeiDepositAmount = new BigNumber(0).mul(10 ** 18);
        let kncTweiDepositAmount = 600 * 10 ** 18;
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
        await token.transfer(user1, totalPayAmountTwei);
        await token.approve(reserve.address, totalPayAmountTwei, {from: user1})
        rc = await reserve.trade(tokenAdd, totalPayAmountTwei, ethAddress, user1, 300, false, {from: user1});

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
        let kncTweiDepositAmount = 600 * 10 ** 18;
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
        await token.transfer(user1, totalPayAmountTwei);
        await token.approve(reserve.address, totalPayAmountTwei, {from: user1})
        rc = await reserve.trade(tokenAdd, totalPayAmountTwei, ethAddress, user1, 300, false, {from: user1});

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
        let kncTweiDepositAmount = 600 * 10 ** 18;
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
        await token.transfer(user1, totalPayAmountTwei);
        await token.approve(reserve.address, totalPayAmountTwei, {from: user1})
        rc = await reserve.trade(tokenAdd, totalPayAmountTwei, ethAddress, user1, 300, false, {from: user1});

        log("take 9 full orders one partial. remaining order removed from book: " + rc.receipt.gasUsed);

        list = await reserve.getEthToTokenOrderList();
        assert.equal(list.length, 0);

        let takenTweiLastOrder = orderDstTwei.sub(100000);
        let takenEthLastOrder = srcAmountWei.mul(takenTweiLastOrder).div(orderDstTwei).floor();
        let releasedEthLastOrder = srcAmountWei.sub(takenEthLastOrder);
        log("releasedEthLastOrder " + releasedEthLastOrder);
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
        await token.transfer(user1, totalPayAmountTwei);
        await token.approve(reserve.address, totalPayAmountTwei, {from: user1})
        rc = await reserve.trade(tokenAdd, totalPayAmountTwei, ethAddress, user1, 300, false, {from: user1});

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

    xit("take orders, see some knc released to burn amount and some knc set as free knc", async() => {
    });

    xit("create knc rate change, so stakes per order aren't enough. see can still take order", async() => {
    });

    xit("create rate change so burn amount is bigger then calculated stake amount, see burn amounts are modified to equal stake amount", async() => {
    });

    xit("make sure that when updating rate. the stake amount is enough for at least x2 rate change", async() => {
    })
});


contract('OrderBookReserve on network', async (accounts) => {

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

            feeBurner = await FeeBurner.new(admin, kncAddress, network, ethToKncRatePrecision);
            currentBlock = await Helper.getCurrentBlock();
            init = false;
        }

        reserve = await OrderBookReserve.new(feeBurner.address, kncAddress, tokenAdd, admin, 25);
    });
});

function log(str) {
    console.log(str);
}

async function makerDeposit(maker, ethWei, tokenTwei, kncTwei) {

    await token.approve(reserve.address, tokenTwei);
    await reserve.depositToken(maker, tokenTwei);
    await KNCToken.approve(reserve.address, kncTwei);
    await reserve.depositKncFee(maker, kncTwei);
    await reserve.depositEther(maker, {from: maker, value: ethWei});
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
