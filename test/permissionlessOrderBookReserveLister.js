const TestToken = artifacts.require("./mockContracts/TestToken.sol");
const KyberNetwork = artifacts.require("./KyberNetwork.sol");
const FeeBurner = artifacts.require("./FeeBurner.sol");

const OrderBookReserve = artifacts.require("./permissionless/mock/MockOrderBookReserve.sol");
const PermissionlessOrderBookReserveLister = artifacts.require("./permissionless/PermissionlessOrderBookReserveLister.sol");
const OrdersFactory = artifacts.require("./permissionless/OrdersFactory.sol");
const FeeBurnerResolver = artifacts.require("./permissionless/mock/MockFeeBurnerResolver.sol");

const Helper = require("./helper.js");
const BigNumber = require('bignumber.js');

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

let negligibleRateDiff = 11;

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

    before('setup contract for each test', async () => {

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
        reserveLister = await PermissionlessOrderBookReserveLister.new(network.address, feeBurnerResolver.address,
            ordersFactory.address, kncAddress);

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

        await makerDeposit(res, maker1, amountEth, amountTwei.valueOf(), amountKnc.valueOf());

        let rxNumTwei = await res.makerFunds(maker1, tokenAdd);
        assert.equal(rxNumTwei.valueOf(), amountTwei);

        let rxKncTwei = await res.makerUnusedKNC(maker1);
        assert.equal(rxKncTwei.valueOf(), amountKnc);

        rxKncTwei = await res.makerStakedKNC(maker1);
        assert.equal(rxKncTwei.valueOf(), 0);

        //makerDepositEther
        let rxWei = await res.makerFunds(maker1, ethAddress);
        assert.equal(rxWei.valueOf(), amountEth);

        await res.makerWithdrawFunds(ethAddress, rxWei, {from: maker1})
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

        await makerDeposit(res, maker1, amountEth, 0, amountKnc.valueOf());

        // first getConversionRate should return 0
        let rate = await res.getConversionRate(token.address, ethAddress, 10 ** 18, 0);
        assert.equal(rate.valueOf(), 0);

        //now add order
        //////////////
//        makeOrder(address maker, bool isEthToToken, uint128 payAmount, uint128 exchangeAmount, uint32 hintPrevOrder)
        let rc = await res.makeOrder(maker1, false, orderSrcAmountTwei, orderDstWei, 0, {from: maker1});
        rc = await res.makeOrder(maker1, false, orderSrcAmountTwei, orderDstWei.add(400), 0, {from: maker1});
            rc = await res.makeOrder(maker1, false, orderSrcAmountTwei, orderDstWei.add(200), 0, {from: maker1});
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


function log(str) {
    console.log(str);
}

async function makerDeposit(res, maker, ethWei, tokenTwei, kncTwei) {

    await token.approve(res.address, tokenTwei);
    await res.makerDepositToken(maker, tokenTwei);
    await KNCToken.approve(res.address, kncTwei);
    await res.makerDepositKnc(maker, kncTwei);
    await res.makerDepositWei(maker, {from: maker, value: ethWei});
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

