const TestToken = artifacts.require("./mockContracts/TestToken.sol");
const KyberNetwork = artifacts.require("./KyberNetwork.sol");
const FeeBurner = artifacts.require("./FeeBurner.sol");

//const OrderBookReserve = artifacts.require("./OrderBookReserve.sol");
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

let init = true;

let currentBlock;

contract('PermissionlessOrderBookReserveLister', async (accounts) => {

    before('setup contract for each test', async () => {

        //below should happen once
        admin = accounts[0];
        whiteList = accounts[1];
        expectedRate = accounts[2];
        kyberProxy = accounts[3];
        operator = accounts[4];

        token = await TestToken.new("the token", "TOK", 18);
        tokenAdd = token.address;

        KNCToken = await TestToken.new("Kyber Crystals", "KNC", 18);
        kncAddress = KNCToken.address;

        network = await KyberNetwork.new(admin)
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

        let reserveAddress = await network.reservesPerTokenDest(tokenAdd, 0);
        let listReserveAddress = await reserveLister.reserves(tokenAdd);
        assert.equal(reserveAddress.valueOf(), listReserveAddress.valueOf());

        reserve = await OrderBookReserve.at(reserveAddress.valueOf());

        let rxToken = await reserve.token();
        assert.equal(rxToken.valueOf(), tokenAdd);
    })

    it("maker sure can't add same token twice.", async() => {
        // make sure its already added
        ready =  await reserveLister.getOrderBookContract(tokenAdd);
        assert.equal(ready[1].valueOf(), true);     

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

    it("add and list order book reserve, see getter has correct ready flag.", async() => {
        newToken = await TestToken.new("new token", "NEW", 18);
        newTokenAdd = newToken.address;

        let ready =  await reserveLister.getOrderBookContract(newTokenAdd);
        assert.equal(ready[0].valueOf(), 0);
        assert.equal(ready[1].valueOf(), false);

        let rc = await reserveLister.addOrderBookContract(newTokenAdd);
        let reserveAddress = await reserveLister.reserves(newTokenAdd);

        ready = await reserveLister.getOrderBookContract(newTokenAdd);
        assert.equal(ready[0].valueOf(), reserveAddress.valueOf());
        assert.equal(ready[1].valueOf(), false);

        rc = await reserveLister.initOrderBookContract(newTokenAdd);

        ready =  await reserveLister.getOrderBookContract(newTokenAdd);
        assert.equal(ready[0].valueOf(), reserveAddress.valueOf());
        assert.equal(ready[1].valueOf(), false);

        rc = await reserveLister.listOrderBookContract(newTokenAdd);

        ready =  await reserveLister.getOrderBookContract(newTokenAdd);
        assert.equal(ready[0].valueOf(), reserveAddress.valueOf());
        assert.equal(ready[1].valueOf(), true);
    })


});


function log(str) {
    console.log(str);
}

async function makerDeposit(maker, ethWei, tokenTwei, kncTwei) {

    await token.approve(reserve.address, tokenTwei);
    await reserve.makerDepositToken(maker, tokenTwei);
    await KNCToken.approve(reserve.address, kncTwei);
    await reserve.makerDepositKnc(maker, kncTwei);
    await reserve.makerDepositWei(maker, {from: maker, value: ethWei});
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

