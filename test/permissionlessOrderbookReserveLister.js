const TestToken = artifacts.require("TestToken.sol");
const KyberNetwork = artifacts.require("KyberNetwork.sol");
const KyberNetworkProxy = artifacts.require("KyberNetworkProxy.sol");
const FeeBurner = artifacts.require("FeeBurner.sol");
const WhiteList = artifacts.require("WhiteList.sol");

const OrderbookReserve = artifacts.require("MockOrderbookReserve.sol");
const PermissionlessOrderbookReserveLister = artifacts.require("PermissionlessOrderbookReserveLister.sol");
const OrderListFactory = artifacts.require("OrderListFactory.sol");
const MockMedianizer = artifacts.require("MockMedianizer.sol");

const Helper = require("./helper.js");
const BigNumber = require('bignumber.js');

require("chai")
    .use(require("chai-as-promised"))
    .use(require('chai-bignumber')(BigNumber))
    .should()

//global variables
//////////////////
const precisionUnits = (new BigNumber(10).pow(18));
const gasPrice = (new BigNumber(10).pow(9).mul(50));
const ethAddress = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

let withDrawAddress;

//contracts
let reserve;
let network;
let feeBurner;
let whiteList;
let expectedRate;
let kyberProxy;
let reserveLister;
let orderFactory;
let medianizer;

//tokens data
////////////
let token;
let tokenAdd;
let KNCToken;
let kncAddress;

const negligibleRateDiff = 11;
const ethToKncRatePrecision = precisionUnits.mul(550);
const maxOrdersPerTrade = 5;
let dollarsPerEthPrecision = precisionUnits.mul(200);

//addresses
let admin;
let operator;
let maker1;
let user1;

let init = true;

let currentBlock;

const LISTING_NONE = 0;
const LISTING_STATE_ADDED = 1;
const LISTING_STATE_INIT = 2;
const LISTING_STATE_LISTED = 3;

let minNewOrderWei;



contract('PermissionlessOrderbookReserveLister', async (accounts) => {

    // TODO: consider changing to beforeEach with a separate deploy per test
    before('setup contract before all tests', async () => {

        admin = accounts[0];
        whiteList = accounts[1];
        expectedRate = accounts[2];
        kyberProxy = accounts[3];
        operator = accounts[4];
        maker1 = accounts[5];
        user1 = accounts[6];

        token = await TestToken.new("the token", "TOK", 18);
        tokenAdd = token.address;

        KNCToken = await TestToken.new("Kyber Crystals", "KNC", 18);
        kncAddress = KNCToken.address;

        network = await KyberNetwork.new(admin);
        feeBurner = await FeeBurner.new(admin, kncAddress, network.address, ethToKncRatePrecision);

        orderFactory = await OrderListFactory.new();

        medianizer = await MockMedianizer.new();
        await medianizer.setValid(true);
        await medianizer.setEthPrice(dollarsPerEthPrecision);

        currentBlock = await Helper.getCurrentBlock();
    });

    it("init network and reserveLister. see init success.", async function () {

        //set contracts
        await network.setKyberProxy(kyberProxy);
        await network.setWhiteList(whiteList);
        await network.setExpectedRate(expectedRate);
        await network.setFeeBurner(feeBurner.address);
        await network.setParams(gasPrice.valueOf(), negligibleRateDiff);
        await network.addOperator(operator);
        await network.setEnable(true);

//log(network.address + " " + feeBurnerResolver.address + " " + kncAddress)
        reserveLister = await PermissionlessOrderbookReserveLister.new(
            network.address,
            orderFactory.address,
            medianizer.address,
            kncAddress,
            maxOrdersPerTrade
        );

        // lister should be added as a feeburner operator.
        await feeBurner.addOperator(reserveLister.address, {from: admin});
        const feeBurnerOperators = await feeBurner.getOperators();
        feeBurnerOperators.should.include(reserveLister.address);

        let kyberAdd = await reserveLister.kyberNetworkContract();
        assert.equal(kyberAdd.valueOf(), network.address);

        add = await reserveLister.orderFactoryContract();
        assert.equal(add.valueOf(), orderFactory.address);

        let rxKnc = await reserveLister.kncToken();
        assert.equal(rxKnc.valueOf(), kncAddress);

        await network.addOperator(reserveLister.address);
    });

    it("verify lister global parameters", async() => {

        let address = await reserveLister.medianizerContract();
        assert.equal(address.valueOf(), medianizer.address);
//        log("address" + medianizer.address)
        address = await reserveLister.kyberNetworkContract();
        assert.equal(address.valueOf(), network.address)
        address = await reserveLister.orderFactoryContract();
        assert.equal(address.valueOf(), orderFactory.address)
        address = await reserveLister.kncToken();
        assert.equal(address.valueOf(), kncAddress)

        let value = await reserveLister.ORDER_BOOK_BURN_FEE_BPS();
        assert.equal(value.valueOf(), 25);
        value = await reserveLister.MIN_NEW_ORDER_VALUE_DOLLAR();
        assert.equal(value.valueOf(), 1000);
        value = await reserveLister.maxOrdersPerTrade();
        assert.equal(value.valueOf(), maxOrdersPerTrade);
    })

    it("test adding and listing order book reserve, get through network contract and through lister", async() => {
        let rc = await reserveLister.addOrderbookContract(tokenAdd);
        log("add reserve gas: " + rc.receipt.gasUsed);

        rc = await reserveLister.initOrderbookContract(tokenAdd);
        log("init reserve gas: " + rc.receipt.gasUsed);

        rc = await reserveLister.listOrderbookContract(tokenAdd);
        log("list reserve gas: " + rc.receipt.gasUsed);
//
        let reserveAddress = await network.reservesPerTokenDest(tokenAdd, 0);
        let listReserveAddress = await reserveLister.reserves(tokenAdd);
        assert.equal(reserveAddress.valueOf(), listReserveAddress.valueOf());

        reserve = await OrderbookReserve.at(reserveAddress.valueOf());
        let rxLimits = await reserve.limits();

        minNewOrderWei = rxLimits[2].valueOf();

        let rxContracts = await reserve.contracts();
        assert.equal(rxContracts[0].valueOf(), kncAddress);
        assert.equal(rxContracts[1].valueOf(), token.address);
        assert.equal(rxContracts[2].valueOf(), feeBurner.address);
        assert.equal(rxContracts[3].valueOf(), network.address);
        assert.equal(rxContracts[4].valueOf(), medianizer.address);
    })

    it("maker sure can't add same token twice.", async() => {
        // make sure its already added
        let ready =  await reserveLister.getOrderbookListingStage(tokenAdd);
        assert.equal(ready[1].valueOf(), LISTING_STATE_LISTED);

        try {
            let rc = await reserveLister.addOrderbookContract(tokenAdd);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            rc = await reserveLister.initOrderbookContract(tokenAdd);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            rc = await reserveLister.listOrderbookContract(tokenAdd);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    })

    it("maker sure in each listing stage can only perform the next stage listing.", async() => {
        // make sure its already added
        let newToken = await TestToken.new("token", "TOK", 18);
        newTokAdd = newToken.address;

        let listed =  await reserveLister.getOrderbookListingStage(newTokAdd);
        assert.equal(listed[1].valueOf(), LISTING_NONE);

        try {
            rc = await reserveLister.initOrderbookContract(newTokAdd);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            rc = await reserveLister.listOrderbookContract(newTokAdd);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        let rc = await reserveLister.addOrderbookContract(newTokAdd);

        listed =  await reserveLister.getOrderbookListingStage(newTokAdd);
        assert.equal(listed[1].valueOf(), LISTING_STATE_ADDED);

        try {
            let rc = await reserveLister.addOrderbookContract(newTokAdd);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            rc = await reserveLister.listOrderbookContract(newTokAdd);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        rc = await reserveLister.initOrderbookContract(newTokAdd);

        listed =  await reserveLister.getOrderbookListingStage(newTokAdd);
        assert.equal(listed[1].valueOf(), LISTING_STATE_INIT);

        try {
            rc = await reserveLister.initOrderbookContract(newTokAdd);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            let rc = await reserveLister.addOrderbookContract(newTokAdd);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        rc = await reserveLister.listOrderbookContract(newTokAdd);

        listed =  await reserveLister.getOrderbookListingStage(newTokAdd);
        assert.equal(listed[1].valueOf(), LISTING_STATE_LISTED);

        try {
            rc = await reserveLister.initOrderbookContract(newTokAdd);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            let rc = await reserveLister.addOrderbookContract(newTokAdd);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            rc = await reserveLister.listOrderbookContract(newTokAdd);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        listed =  await reserveLister.getOrderbookListingStage(newTokAdd);
        assert.equal(listed[1].valueOf(), LISTING_STATE_LISTED);
    })

    it("maker sure can't list KNC.", async() => {
        // make sure its already added
        let isListed =  await reserveLister.getOrderbookListingStage(kncAddress);
        assert.equal(isListed[1].valueOf(), LISTING_NONE);

        try {
            let rc = await reserveLister.addOrderbookContract(kncAddress);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    })

    it("test reserve - maker deposit tokens, ethers, knc, validate updated in contract", async function () {

        let amountTwei = new BigNumber(5 * 10 ** 19); //500 tokens
        let amountKnc = new BigNumber(600 * 10 ** 18);
        let amountEth = 2 * 10 ** 18;

        let res = await OrderbookReserve.at(await reserveLister.reserves(tokenAdd));

        await makerDeposit(res, maker1, amountEth, amountTwei.valueOf(), amountKnc.valueOf(), KNCToken);

        let rxNumTwei = await res.makerFunds(maker1, tokenAdd);
        assert.equal(rxNumTwei.valueOf(), amountTwei);

        let rxKncTwei = await res.makerUnlockedKnc(maker1);
        assert.equal(rxKncTwei.valueOf(), amountKnc);

        rxKncTwei = await res.makerStakedKNC(maker1);
        assert.equal(rxKncTwei.valueOf(), 0);

        //makerDepositEther
        let rxWei = await res.makerFunds(maker1, ethAddress);
        assert.equal(rxWei.valueOf(), amountEth);

        await res.withdrawEther(rxWei, {from: maker1})
        rxWei = await res.makerFunds(maker1, ethAddress);
        assert.equal(rxWei.valueOf(), 0);
    });

    it("add and list order book reserve, see getter has correct ready flag.", async() => {
        newToken = await TestToken.new("new token", "NEW", 18);
        newTokenAdd = newToken.address;

        let ready =  await reserveLister.getOrderbookListingStage(newTokenAdd);
        assert.equal(ready[0].valueOf(), 0);
        assert.equal(ready[1].valueOf(), LISTING_NONE);

        let rc = await reserveLister.addOrderbookContract(newTokenAdd);
        let reserveAddress = await reserveLister.reserves(newTokenAdd);

        ready = await reserveLister.getOrderbookListingStage(newTokenAdd);
        assert.equal(ready[0].valueOf(), reserveAddress.valueOf());
        assert.equal(ready[1].valueOf(), LISTING_STATE_ADDED);

        rc = await reserveLister.initOrderbookContract(newTokenAdd);

        ready =  await reserveLister.getOrderbookListingStage(newTokenAdd);
        assert.equal(ready[0].valueOf(), reserveAddress.valueOf());
        assert.equal(ready[1].valueOf(), LISTING_STATE_INIT);

        rc = await reserveLister.listOrderbookContract(newTokenAdd);

        ready =  await reserveLister.getOrderbookListingStage(newTokenAdd);
        assert.equal(ready[0].valueOf(), reserveAddress.valueOf());
        assert.equal(ready[1].valueOf(), LISTING_STATE_LISTED);
    })

    it("verify can't construct new lister with address 0.", async() => {

        let newLister;

        try {
            newLister = await PermissionlessOrderbookReserveLister.new(0, orderFactory.address, medianizer.address, kncAddress, maxOrdersPerTrade);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            newLister = await PermissionlessOrderbookReserveLister.new(network.address, 0, medianizer.address, kncAddress, maxOrdersPerTrade);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            newLister = await PermissionlessOrderbookReserveLister.new(network.address, orderFactory.address, 0, kncAddress, maxOrdersPerTrade);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            newLister = await PermissionlessOrderbookReserveLister.new(network.address, orderFactory.address, medianizer.address, 0, maxOrdersPerTrade);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            newLister = await PermissionlessOrderbookReserveLister.new(network.address, orderFactory.address, medianizer.address, kncAddress, 1);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //and now. at last.
        newLister = await PermissionlessOrderbookReserveLister.new(network.address, orderFactory.address, medianizer.address, kncAddress, maxOrdersPerTrade);

        assert (newLister.address != 0);
    })

    it("verify if order book reserve init fails. can't add list it on kyber.", async() => {

        let newLister;

        let dummyOrdersFactory = accounts[8];

        newLister = await PermissionlessOrderbookReserveLister.new(network.address, dummyOrdersFactory, medianizer.address, kncAddress, maxOrdersPerTrade);

        let rc = await newLister.addOrderbookContract(tokenAdd);

        // init should fail
        try {
            rc = await newLister.initOrderbookContract(tokenAdd);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        let listingStage = await newLister.getOrderbookListingStage(kncAddress);
        assert.equal(listingStage[1].valueOf(), LISTING_NONE);
    })

    it("verify if listing on kyber fails. reserve listing stage will stay in init stage.", async() => {

        newToken = await TestToken.new("new token", "NEW", 18);
        newTokenAdd = newToken.address;

        let rc = await reserveLister.addOrderbookContract(newTokenAdd);
        rc = await reserveLister.initOrderbookContract(newTokenAdd);

        let listingStage =  await reserveLister.getOrderbookListingStage(newTokenAdd);
        assert.equal(listingStage[1].valueOf(), LISTING_STATE_INIT);

        //remove permissions on kyber.
        await network.removeOperator(reserveLister.address)

        try {
            rc = await reserveLister.listOrderbookContract(newTokenAdd);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        listingStage =  await reserveLister.getOrderbookListingStage(newTokenAdd);
        assert.equal(listingStage[1].valueOf(), LISTING_STATE_INIT);

        //add permissions on kyber.
        await network.addOperator(reserveLister.address)

        rc = await reserveLister.listOrderbookContract(newTokenAdd);

        listingStage =  await reserveLister.getOrderbookListingStage(newTokenAdd);
        assert.equal(listingStage[1].valueOf(), LISTING_STATE_LISTED);
    })
});


contract('PermissionlessOrderbookReserveLister_feeBurner_tests', async (accounts) => {

    beforeEach('setup contract before all tests', async () => {
        admin = accounts[0];
        operator = accounts[1];
        expectedRate = accounts[2];
        maker = accounts[4];
        taker = accounts[5];
    });

    it("listing orderbook reserve so that it could burn fees", async () => {
        const someToken = await TestToken.new("the token", "tok", 18);
        const kncToken = await TestToken.new("kyber crystals", "knc", 18);

        // prepare kyber network
        const kyberNetwork = await KyberNetwork.new(admin);

        const kyberProxy = await KyberNetworkProxy.new(admin);
        await kyberProxy.setKyberNetworkContract(
            kyberNetwork.address,
            {from: admin}
        );

        const feeBurner = await FeeBurner.new(
            admin,
            kncToken.address,
            kyberNetwork.address,
            ethToKncRatePrecision
        );

        const orderFactory = await OrderListFactory.new();

        medianizer = await MockMedianizer.new();
        await medianizer.setValid(true);
        await medianizer.setEthPrice(dollarsPerEthPrecision);

        const lister = await PermissionlessOrderbookReserveLister.new(
            kyberNetwork.address,
            orderFactory.address,
            medianizer.address,
            kncToken.address,
            maxOrdersPerTrade
        );

        // configure feeburner
        await feeBurner.addOperator(lister.address, {from: admin});
        // await feeBurner.setKNCRate( q
        //     200 /* kncPerEtherRate */,
        //     {from: admin}
        // );

        // setup WhiteList
        const whiteList = await WhiteList.new(admin, kncToken.address);
        await whiteList.addOperator(operator, {from: admin});
        await whiteList.setCategoryCap(0, 1000, {from: operator});
        await whiteList.setSgdToEthRate(30000 * 10 ** 18, {from: operator});

        // configure kyber network
        await kyberNetwork.setKyberProxy(kyberProxy.address);
        await kyberNetwork.setWhiteList(whiteList.address);
        await kyberNetwork.setExpectedRate(expectedRate);
        await kyberNetwork.setFeeBurner(feeBurner.address);
        await kyberNetwork.setParams(gasPrice.valueOf(), negligibleRateDiff);
        await kyberNetwork.addOperator(operator);
        await kyberNetwork.setEnable(true);
        await kyberNetwork.addOperator(lister.address);

        // list an order book reserve
        await lister.addOrderbookContract(someToken.address);
        await lister.initOrderbookContract(someToken.address);
        await lister.listOrderbookContract(someToken.address);

        // add orders
        const reserve = await OrderbookReserve.at(
            await lister.reserves(someToken.address)
        );
        let amountTokenInWei = new BigNumber(0 * 10 ** 18);
        let amountKncInWei = new BigNumber(600 * 10 ** 18);
        let amountEthInWei = new BigNumber(minNewOrderWei);
        await makerDeposit(
            reserve,
            maker,
            amountEthInWei /* ethWei */,
            amountTokenInWei /* tokenTwei */,
            amountKncInWei /* kncTwei */,
            kncToken
        );

        const tokenTweiToSwap = new BigNumber(12 * 10 ** 18);
        const ethWeiSrcAmount = new BigNumber(minNewOrderWei);
        await reserve.submitEthToTokenOrder(
            ethWeiSrcAmount /* srcAmount */,
            tokenTweiToSwap /* dstAmount */,
            {from: maker}
        );

        // swap someToken to ETH
        await someToken.transfer(taker, tokenTweiToSwap);
        await someToken.approve(kyberProxy.address, tokenTweiToSwap, {from: taker});
        let tradeLog = await kyberProxy.swapTokenToEther(
            someToken.address /* token */,
            tokenTweiToSwap /* src amount*/,
            1 /* minConversionRate */,
            {from: taker}
        );

        let actualWeiValue = new BigNumber(tradeLog.logs[0].args.actualDestAmount);
        assert(actualWeiValue.valueOf() < ethWeiSrcAmount.valueOf())
        assert(actualWeiValue.valueOf() > ethWeiSrcAmount.sub(100).valueOf())

        // burn fees
        const result = await feeBurner.burnReserveFees(reserve.address);

        // Assert
        const burnAssignedFeesEvent = result.logs[0];
        burnAssignedFeesEvent.event.should.equal('BurnAssignedFees');
        burnAssignedFeesEvent.args.reserve.should.equal(reserve.address);

        const ethKncRatePrecision = await feeBurner.kncPerEthRatePrecision();
        const burnReserveFeeBps = await lister.ORDER_BOOK_BURN_FEE_BPS();

        // (ethWeiToSwap * (ethKncRatePrecision) * (25: BURN_FEE_BPS) / 10000) - 1
        const kncAmount = actualWeiValue.mul(ethKncRatePrecision).div(precisionUnits).floor();
        const expectedBurnFeesInKncWei = kncAmount.mul(burnReserveFeeBps).div(10000).floor().sub(1);

        burnAssignedFeesEvent.args.quantity.should.be.bignumber.equal(
            expectedBurnFeesInKncWei
        );
    });
});

function log(str) {
    console.log(str);
}

async function makerDeposit(res, maker, ethWei, tokenTwei, kncTwei, kncToken) {
    await token.approve(res.address, tokenTwei);
    await res.depositToken(maker, tokenTwei);
    await kncToken.approve(res.address, kncTwei);
    await res.depositKncForFee(maker, kncTwei);
    await res.depositEther(maker, {from: maker, value: ethWei});
}
