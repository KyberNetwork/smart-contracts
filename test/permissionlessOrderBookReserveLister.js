const TestToken = artifacts.require("./mockContracts/TestToken.sol");
const KyberNetwork = artifacts.require("./KyberNetwork.sol");
const KyberNetworkProxy = artifacts.require("./KyberNetworkProxy.sol");
const FeeBurner = artifacts.require("./FeeBurner.sol");
const WhiteList = artifacts.require("./WhiteList.sol");

const OrderBookReserve = artifacts.require("./permissionless/mock/MockOrderBookReserve.sol");
const PermissionlessOrderBookReserveLister = artifacts.require("./permissionless/PermissionlessOrderBookReserveLister.sol");
const OrdersFactory = artifacts.require("./permissionless/OrdersFactory.sol");
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
const ethAddress = '0x00eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

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


contract('PermissionlessOrderBookReserveLister', async (accounts) => {

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
        feeBurner = await FeeBurner.new(admin, kncAddress, network.address);

        feeBurnerResolver = await FeeBurnerResolver.new(feeBurner.address);
        ordersFactory = await OrdersFactory.new();

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
        reserveLister = await PermissionlessOrderBookReserveLister.new(
            network.address,
            feeBurnerResolver.address,
            ordersFactory.address,
            kncAddress
        );

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
        let rc = await reserveLister.addOrderBookContract(tokenAdd);
        log("add reserve gas: " + rc.receipt.gasUsed);

        rc = await reserveLister.initOrderBookContract(tokenAdd);
        log("init reserve gas: " + rc.receipt.gasUsed);

        rc = await reserveLister.listOrderBookContract(tokenAdd);
        log("list reserve gas: " + rc.receipt.gasUsed);
//
        let reserveAddress = await network.reservesPerTokenDest(tokenAdd, 0);
        let listReserveAddress = await reserveLister.reserves(tokenAdd);
        assert.equal(reserveAddress.valueOf(), listReserveAddress.valueOf());

        reserve = await OrderBookReserve.at(reserveAddress.valueOf());

        let rxToken = await reserve.token();
        assert.equal(rxToken.valueOf(), tokenAdd);
    })

    it("maker sure can't add same token twice.", async() => {
        // make sure its already added
        ready =  await reserveLister.getOrderBookContractState(tokenAdd);
        assert.equal(ready[1].valueOf(), LISTING_STATE_LISTED);

        try {
            let rc = await reserveLister.addOrderBookContract(tokenAdd);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            rc = await reserveLister.initOrderBookContract(tokenAdd);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            rc = await reserveLister.listOrderBookContract(tokenAdd);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    })

    it("test reserve - maker deposit tokens, ethers, knc, validate updated in contract", async function () {

        let amountTwei = new BigNumber(5 * 10 ** 19); //500 tokens
        let amountKnc = new BigNumber(600 * 10 ** 18);
        let amountEth = 2 * 10 ** 18;

        let res = await OrderBookReserve.at(await reserveLister.reserves(tokenAdd));

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

        let ready =  await reserveLister.getOrderBookContractState(newTokenAdd);
        assert.equal(ready[0].valueOf(), 0);
        assert.equal(ready[1].valueOf(), LISTING_NONE);

        let rc = await reserveLister.addOrderBookContract(newTokenAdd);
        let reserveAddress = await reserveLister.reserves(newTokenAdd);

        ready = await reserveLister.getOrderBookContractState(newTokenAdd);
        assert.equal(ready[0].valueOf(), reserveAddress.valueOf());
        assert.equal(ready[1].valueOf(), LISTING_STATE_ADDED);

        rc = await reserveLister.initOrderBookContract(newTokenAdd);

        ready =  await reserveLister.getOrderBookContractState(newTokenAdd);
        assert.equal(ready[0].valueOf(), reserveAddress.valueOf());
        assert.equal(ready[1].valueOf(), LISTING_STATE_INIT);

        rc = await reserveLister.listOrderBookContract(newTokenAdd);

        ready =  await reserveLister.getOrderBookContractState(newTokenAdd);
        assert.equal(ready[0].valueOf(), reserveAddress.valueOf());
        assert.equal(ready[1].valueOf(), LISTING_STATE_LISTED);
    })

    it("test reserve maker add a few sell orders. user takes orders. see taken orders are removed as expected.", async function () {
        let orderSrcAmountTwei = new BigNumber(9 * 10 ** 18);
        let orderDstWei = new BigNumber(2 * 10 ** 18);

        let amountKnc = 600 * 10 ** 18;
        let amountEth = (new BigNumber(6 * 10 ** 18)).add(600);

        let res = await OrderBookReserve.at(await reserveLister.reserves(tokenAdd));

        await makerDeposit(res, maker1, amountEth, 0, amountKnc.valueOf(), KNCToken);

        // first getConversionRate should return 0
        let rate = await res.getConversionRate(token.address, ethAddress, 10 ** 18, 0);
        assert.equal(rate.valueOf(), 0);

        //now add order
        //////////////
        let rc;
        rc = await res.submitSellTokenOrder(orderSrcAmountTwei, orderDstWei, {from: maker1});
        rc = await res.submitSellTokenOrder(orderSrcAmountTwei, orderDstWei.add(400), {from: maker1});
        rc = await res.submitSellTokenOrder(orderSrcAmountTwei, orderDstWei.add(200), {from: maker1});
//        log(rc.logs[0].args)

        let orderList = await res.getSellOrderList();
        assert.equal(orderList.length, 3);

        //tokens to user
        let totalPayValue = orderSrcAmountTwei.mul(3);
        await token.transfer(totalPayValue, user1);
        await token.approve(res.address, totalPayValue);

        let userInitialBalance = await await Helper.getBalancePromise(user1);
        //trade
        rc = await res.trade(tokenAdd, totalPayValue, ethAddress, user1, 300, false);
        log("take 3 sell orders gas: " + rc.receipt.gasUsed);

        orderList = await res.getSellOrderList();
        assert.equal(orderList.length, 0);

        let userBalanceAfter = await Helper.getBalancePromise(user1);
        let expectedBalance = userInitialBalance.add(amountEth);

        assert.equal(userBalanceAfter.valueOf(), expectedBalance.valueOf());
    });
});


contract('PermissionlessOrderBookReserveLister_feeBurner_tests', async (accounts) => {

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
            kyberNetwork.address
        );
        const feeBurnerResolver = await FeeBurnerResolver.new(
            feeBurner.address
        );
        const ordersFactory = await OrdersFactory.new();

        const lister = await PermissionlessOrderBookReserveLister.new(
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
        await lister.addOrderBookContract(someToken.address);
        await lister.initOrderBookContract(someToken.address);
        await lister.listOrderBookContract(someToken.address);

        // add orders
        const reserve = await OrderBookReserve.at(
            await lister.reserves(someToken.address)
        );
        let amountTokenInWei = new BigNumber(500 * 10 ** 18); //500 tokens
        let amountKncInWei = new BigNumber(600 * 10 ** 18);
        let amountEthInWei = new BigNumber(2 * 10 ** 18);
        await makerDeposit(
            reserve,
            maker,
            amountEthInWei /* ethWei */,
            amountTokenInWei /* tokenTwei */,
            amountKncInWei /* kncTwei */,
            kncToken
        );

        await reserve.submitBuyTokenOrder(
            2 * 10 ** 18 /* srcAmount */,
            100 * 10 ** 18 /* dstAmount */,
            {from: maker}
        );

        // swap ETH to someToken
        const ethWeiToSwap = 0.5 * 10 ** 18;
        await kyberProxy.swapEtherToToken(
            someToken.address /* token */,
            1 /* minConversionRate */,
            {from: taker, value: ethWeiToSwap}
        );

        // burn fees
        const result = await feeBurner.burnReserveFees(reserve.address);

        // Assert
        const burnAssignedFeesEvent = result.logs[0];
        burnAssignedFeesEvent.event.should.equal('BurnAssignedFees');
        burnAssignedFeesEvent.args.reserve.should.equal(reserve.address);

        // (ethWeiToSwap * (300: kncPerETHRate) * (25: BURN_FEE_BPS) / 10000) - 1
        const expectedFeesInKncWei = BigNumber("374999999999999999");
        burnAssignedFeesEvent.args.quantity.should.be.bignumber.equal(
            expectedFeesInKncWei
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
