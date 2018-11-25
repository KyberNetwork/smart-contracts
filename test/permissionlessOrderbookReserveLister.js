const TestToken = artifacts.require("./mockContracts/TestToken.sol");
const KyberNetwork = artifacts.require("./KyberNetwork.sol");
const KyberNetworkProxy = artifacts.require("./KyberNetworkProxy.sol");
const FeeBurner = artifacts.require("./FeeBurner.sol");
const WhiteList = artifacts.require("./WhiteList.sol");

const OrderbookReserve = artifacts.require("./permissionless/mock/MockOrderbookReserve.sol");
const PermissionlessOrderbookReserveLister = artifacts.require("./permissionless/PermissionlessOrderbookReserveLister.sol");
const OrderListFactory = artifacts.require("./permissionless/OrderListFactory.sol");
const FeeBurnerResolver = artifacts.require("./permissionless/mock/MockFeeBurnerResolver.sol");

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
let feeBurnerResolver;
let ordersFactory;

//tokens data
////////////
let token;
let tokenAdd;
let KNCToken;
let kncAddress;
let kgtToken;

const negligibleRateDiff = 11;

const ethToKncRatePrecision = precisionUnits.mul(550);
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

        feeBurnerResolver = await FeeBurnerResolver.new(feeBurner.address);
        ordersFactory = await OrderListFactory.new();

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
            feeBurnerResolver.address,
            ordersFactory.address,
            kncAddress
        );

        minNewOrderWei = await reserveLister.MIN_NEW_ORDER_VALUE_WEI();

        // lister should be added as a feeburner operator.
        await feeBurner.addOperator(reserveLister.address, {from: admin});
        const feeBurnerOperators = await feeBurner.getOperators();
        feeBurnerOperators.should.include(reserveLister.address);

        let kyberAdd = await reserveLister.kyberNetworkContract();
        assert.equal(kyberAdd.valueOf(), network.address);

        let add = await reserveLister.feeBurnerResolverContract();
        assert.equal(add.valueOf(), feeBurnerResolver.address);

        add = await reserveLister.ordersFactory();
        assert.equal(add.valueOf(), ordersFactory.address);

        let rxKnc = await reserveLister.kncToken();
        assert.equal(rxKnc.valueOf(), kncAddress);

        await network.addOperator(reserveLister.address);
    });

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

        let rxToken = await reserve.token();
        assert.equal(rxToken.valueOf(), tokenAdd);
    })

    it("maker sure can't add same token twice.", async() => {
        // make sure its already added
        ready =  await reserveLister.getOrderbookContractState(tokenAdd);
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

    it("test reserve - maker deposit tokens, ethers, knc, validate updated in contract", async function () {

        let amountTwei = new BigNumber(5 * 10 ** 19); //500 tokens
        let amountKnc = new BigNumber(600 * 10 ** 18);
        let amountEth = 2 * 10 ** 18;

        let res = await OrderbookReserve.at(await reserveLister.reserves(tokenAdd));

        await makerDeposit(res, maker1, amountEth, amountTwei.valueOf(), amountKnc.valueOf(), KNCToken);

        let rxNumTwei = await res.makerFunds(maker1, tokenAdd);
        assert.equal(rxNumTwei.valueOf(), amountTwei);

        let rxKncTwei = await res.makerUnusedKNC(maker1);
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

        let ready =  await reserveLister.getOrderbookContractState(newTokenAdd);
        assert.equal(ready[0].valueOf(), 0);
        assert.equal(ready[1].valueOf(), LISTING_NONE);

        let rc = await reserveLister.addOrderbookContract(newTokenAdd);
        let reserveAddress = await reserveLister.reserves(newTokenAdd);

        ready = await reserveLister.getOrderbookContractState(newTokenAdd);
        assert.equal(ready[0].valueOf(), reserveAddress.valueOf());
        assert.equal(ready[1].valueOf(), LISTING_STATE_ADDED);

        rc = await reserveLister.initOrderbookContract(newTokenAdd);

        ready =  await reserveLister.getOrderbookContractState(newTokenAdd);
        assert.equal(ready[0].valueOf(), reserveAddress.valueOf());
        assert.equal(ready[1].valueOf(), LISTING_STATE_INIT);

        rc = await reserveLister.listOrderbookContract(newTokenAdd);

        ready =  await reserveLister.getOrderbookContractState(newTokenAdd);
        assert.equal(ready[0].valueOf(), reserveAddress.valueOf());
        assert.equal(ready[1].valueOf(), LISTING_STATE_LISTED);
    })

    it("test reserve maker add a few sell orders. user takes orders. see taken orders are removed as expected.", async function () {
        let tokenWeiDepositAmount = new BigNumber(0).mul(10 ** 18);
        let kncTweiDepositAmount = 600 * 10 ** 18;
        let numOrders = 3;
        let ethWeiDepositAmount = (new BigNumber(minNewOrderWei)).mul(numOrders).add(30000);
        let res = await OrderbookReserve.at(await reserveLister.reserves(tokenAdd));

        await makerDeposit(res, maker1, ethWeiDepositAmount, tokenWeiDepositAmount, kncTweiDepositAmount, KNCToken);

        let srcAmountWei = new BigNumber(minNewOrderWei);
        let orderDstTwei = new BigNumber(9 * 10 ** 18);

        // add order
        let rc = await res.submitEthToTokenOrder(srcAmountWei, orderDstTwei, {from: maker1});
        rc = await res.submitEthToTokenOrder(srcAmountWei, orderDstTwei.add(1000), {from: maker1});
        rc = await res.submitEthToTokenOrder(srcAmountWei, orderDstTwei.add(2000), {from: maker1});

                //take all orders
        //  function trade(ERC20 srcToken, uint srcAmount, ERC20 destToken, address destAddress, uint conversionRate, bool validate)

        let balance = await res.makerFunds(maker1, ethAddress);
        assert.equal(balance.valueOf(), 30000);
        let makerInitialTokenBalance = await res.makerFunds(maker1, tokenAdd);

        let userWeiBefore = new BigNumber(await Helper.getBalancePromise(user1));

        let EthOrderValue = srcAmountWei;
        let totalPayValue = orderDstTwei.mul(3).add(3000);

        let userTokBalanceBefore = await token.balanceOf(user1);

        await token.transfer(user1, totalPayValue);
        await token.approve(reserve.address, totalPayValue, {from: user1})
        rc = await reserve.trade(tokenAdd, totalPayValue, ethAddress, user1, 300, false, {from:user1});

        //check maker balance
        balance = await reserve.makerFunds(maker1, tokenAdd);
        assert.equal(balance.valueOf(), totalPayValue.add(makerInitialTokenBalance).valueOf());

        //user1 balance
        let userBalanceAfter = await token.balanceOf(user1);
        assert.equal(userBalanceAfter.valueOf(), userTokBalanceBefore.valueOf());

        rate = await reserve.getConversionRate(token.address, ethAddress, 10 ** 18, 0);
        assert.equal(rate.valueOf(), 0);

        list = await reserve.getEthToTokenOrderList();
        assert.equal(list.length, 0);
    });
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
        const feeBurnerResolver = await FeeBurnerResolver.new(
            feeBurner.address
        );
        const ordersFactory = await OrderListFactory.new();

        const lister = await PermissionlessOrderbookReserveLister.new(
            kyberNetwork.address,
            feeBurnerResolver.address,
            ordersFactory.address,
            kncToken.address
        );

        // configure feeburner
        await feeBurner.addOperator(lister.address, {from: admin});
        // await feeBurner.setKNCRate(
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
    await res.depositKncFee(maker, kncTwei);
    await res.depositEther(maker, {from: maker, value: ethWei});
}
