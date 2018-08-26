let TestToken = artifacts.require("./mockContracts/TestToken.sol");
let PermissionLessReserve = artifacts.require("./PermissionLessReserve.sol");

let Helper = require("./helper.js");
let BigNumber = require('bignumber.js');

//global variables
//////////////////
let precisionUnits = (new BigNumber(10).pow(18));
let ethAddress = '0x00eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
let precision = new BigNumber(10).pow(18);

//balances
let expectedReserveBalanceWei = 0;
let reserveTokenBalance = [];

//permission groups
let admin;
let networkAddress;
let withDrawAddress;

//contracts
let reserveInst;

//tokens data
////////////
let numTokens = 5;
let tokens = [];
let tokenAdd = [];
let KNCToken;
let kncAddress;

//addresses
let user1;
let user2;
let maker1;
let maker2;

let currentBlock;

contract('PermissionLessReserve', function(accounts) {
    it("should init globals. init tokens and add to reserve.", async function () {
        // set account addresses
        admin = accounts[0];
        networkAddress = accounts[1];
        maker1 = accounts[2];
        maker2 = accounts[3];
        user1 = accounts[4];
        user2 = accounts[5];
        withDrawAddress = accounts[6];

        currentBlock = await Helper.getCurrentBlock();

        //create and add token addresses...
        for (let i = 0; i < numTokens; ++i) {
            token = await TestToken.new("test" + i, "tst" + i, 18);
            tokens[i] = token;
            tokenAdd[i] = token.address;
        }

        KNCToken = await TestToken.new("Kyber Crystals", "KNC", 18);
        kncAddress = KNCToken.address;

        reserveInst = await PermissionLessReserve.new(networkAddress, admin, kncAddress);

        assert.equal(tokens.length, numTokens, "bad number tokens");
    });

    it("maker add tokens, ethers, validate was added", async function () {
//        makerDepositTokens(address maker, ERC20 token, uint amountTwei) public {
        let token = tokens[0];
        let amountTwei = 5 * 10 ** 19; //500 tokens
        let amountKnc = 600 * 10 ** 18;
        let amountEth = 2 * 10 ** 18;

        await token.transfer(maker1, amountTwei); //500 tokens
        await token.approve(reserveInst.address, amountTwei, {from: maker1});
        await reserveInst.makerDepositTokens(maker1, token.address, amountTwei, {from: maker1});

//        let makerFundsKey = await twoStringsSoliditySha(maker1, token.address);
        log(maker1)
        log(token.address)
//        let rxNumTwei = await reserveInst.remainingFundsPerToken(makerFundsKey);
        let rxNumTwei = await reserveInst.getMakerFreeFunds(maker1, token.address);
        assert.equal(rxNumTwei.valueOf(), amountTwei);

//        makerDepositKnc(address maker, uint128 amountTwei) public payable {
        await KNCToken.transfer(maker1, amountKnc);
        await KNCToken.approve(reserveInst.address, amountKnc, {from: maker1});
        await reserveInst.makerDepositKnc(maker1, amountKnc, {from: maker1});

        let rxKncTwei = await reserveInst.getMakerFreeKNC(maker1);
        assert.equal(rxKncTwei.valueOf(), amountKnc);

        rxKncTwei = await reserveInst.getMakerStakedKNC(maker1);
        assert.equal(rxKncTwei.valueOf(), 0);

        //makerDepositEther
        await reserveInst.makerDepositEthers(maker1, {from: maker1, value: amountEth});
        let rxWei = await reserveInst.getMakerFreeFunds(maker1, ethAddress);
        assert.equal(rxWei.valueOf(), amountEth);
    });

    it("maker add buy token order. see funds updated. verify order details.", async function () {
        let orderPayAmountWei = 2 * 10 ** 18;
        let orderExchangeTwei = 9 * 10 ** 18;
        let token = tokens[0];

        // first getConversionRate should return 0
//        getConversionRate(ERC20 src, ERC20 dest, uint srcQty, uint blockNumber) public view returns(uint)
        let rate = await reserveInst.getConversionRate(ethAddress, token.address, 10 ** 18, 0);
        assert.equal(rate.valueOf(), 0);

        //now add order

//        makeOrder(address maker, bool isEthToToken, ERC20 token, uint128 payAmount, uint128 exchangeAmount,
//                uint32 hintPrevOrder)
        let rc = await reserveInst.makeOrder(maker1, true, token.address, orderPayAmountWei, orderExchangeTwei, 0, {from: maker1});
//        log(rc.logs[0].args)

        let orderDetails = await reserveInst.getOrderDetails(rc.logs[0].args.orderID.valueOf());
//        log(orderDetails);

        assert.equal(orderDetails[0].valueOf(), maker1);
        assert.equal(orderDetails[2].valueOf(), 0); // next should be 0 - since last
        assert.equal(orderDetails[3].valueOf(), 1); //state in use
        assert.equal(orderDetails[4].valueOf(), orderPayAmountWei);
        assert.equal(orderDetails[5].valueOf(), orderExchangeTwei);

        rate = await reserveInst.getConversionRate(ethAddress, token.address, 10 ** 18, 0);
        log("rate " + rate);
        let expectedRate = precisionUnits.mul(orderExchangeTwei).div(orderPayAmountWei).floor();
        assert.equal(rate.valueOf(), expectedRate.valueOf());

        let orderList = await reserveInst.getBuyTokenOrderList(token.address);
        log(orderList);
    });


    it("maker add sell token order. see funds updated. verify order details.", async function () {
        let orderPayAmountTwei = 9 * 10 ** 18;
        let orderExchangeWei = 2 * 10 ** 18;
        let token = tokens[0];

        // first getConversionRate should return 0
//        getConversionRate(ERC20 src, ERC20 dest, uint srcQty, uint blockNumber) public view returns(uint)
        let rate = await reserveInst.getConversionRate(token.address, ethAddress, 10 ** 18, 0);
        assert.equal(rate.valueOf(), 0);

        //now add order
        //////////////
//        makeOrder(address maker, bool isEthToToken, ERC20 token, uint128 payAmount, uint128 exchangeAmount,
//                uint32 hintPrevOrder)
        let rc = await reserveInst.makeOrder(maker1, false, token.address, orderPayAmountTwei, orderExchangeWei, 0, {from: maker1});
//        log(rc.logs[0].args)

        let orderDetails = await reserveInst.getOrderDetails(rc.logs[0].args.orderID.valueOf());
//        log(orderDetails);

        assert.equal(orderDetails[0].valueOf(), maker1);
        assert.equal(orderDetails[2].valueOf(), 0); // next should be 0 - because this one is last
        assert.equal(orderDetails[3].valueOf(), 1); //state in use
        assert.equal(orderDetails[4].valueOf(), orderPayAmountTwei);
        assert.equal(orderDetails[5].valueOf(), orderExchangeWei);

//        let orderList = await reserveInst.getSellTokenOrderList(token.address);
//        log(orderList);

        rate = await reserveInst.getConversionRate(token.address, ethAddress, 10 ** 18, 0);
        log("rate " + rate);
        let expectedRate = precisionUnits.mul(orderExchangeWei).div(orderPayAmountTwei).floor();
        assert.equal(rate.valueOf(), expectedRate.valueOf());
    });

    it("maker add a few buy orders. see funds updated. see orders added in correct position. get orders list", async function () {
        //first order should be inserted as last. worst rate then existing.
        let fundDepositTwei = 500 * (10 ** 18); // 500 tokens
        let orderPayAmountWei = ((new BigNumber(2)).mul((new BigNumber(10)).pow(18))).add(2000); // 2 ether
        let orderExchangeTwei = (new BigNumber(9)).mul((new BigNumber(10)).pow(18));
        let token = tokens[1];

        //Add funds
        await token.approve(reserveInst.address, fundDepositTwei);
        await reserveInst.makerDepositTokens(maker1, token.address, fundDepositTwei);

    //        makeOrder(address maker, bool isEthToToken, ERC20 token, uint128 payAmount, uint128 exchangeAmount,
    //                uint32 hintPrevOrder)
        let freeKNC = await reserveInst.getMakerFreeKNC(maker1);
        log("free KNC to stake " + freeKNC.valueOf());
        log("free KNC to stake " + freeKNC.div(10 ** 18).valueOf());
        let rc = await reserveInst.makeOrder(maker1, true, token.address, orderPayAmountWei, orderExchangeTwei, 0, {from: maker1});
            log(rc.logs[0].args)

        let headID = await reserveInst.buyOrdersHead(token.address);
        let order1ID = rc.logs[0].args.orderID.valueOf();
        log("order1 " + order1ID)
        log("headID " + headID)

        let orderDetails = await reserveInst.getOrderDetails(rc.logs[0].args.orderID.valueOf());
    //        log(orderDetails);

        assert.equal(orderDetails[0].valueOf(), maker1);
        assert.equal(orderDetails[1].valueOf(), headID.valueOf());
        assert.equal(orderDetails[2].valueOf(), 0); // next should be 0 - since last
        assert.equal(orderDetails[3].valueOf(), 1); //state in use
        assert.equal(orderDetails[4].valueOf(), orderPayAmountWei.valueOf());
        assert.equal(orderDetails[5].valueOf(), orderExchangeTwei.valueOf());

        // insert order as last in list
        orderPayAmountWei = orderPayAmountWei.add(2000);

        rc = await reserveInst.makeOrder(maker1, true, token.address, orderPayAmountWei, orderExchangeTwei, 0, {from: maker1});
        let order2ID = rc.logs[0].args.orderID.valueOf();
        log("order2 " + order2ID)
        orderDetails = await reserveInst.getOrderDetails(rc.logs[0].args.orderID.valueOf());

        assert.equal(orderDetails[0].valueOf(), maker1);
        assert.equal(orderDetails[1].valueOf(), order1ID.valueOf());
        assert.equal(orderDetails[2].valueOf(), 0); // next should be 0 - since last
        assert.equal(orderDetails[3].valueOf(), 1); //state in use
        assert.equal(orderDetails[4].valueOf(), orderPayAmountWei.valueOf());
        assert.equal(orderDetails[5].valueOf(), orderExchangeTwei.valueOf());

        // insert order as first in list
        orderPayAmountWei = orderPayAmountWei.sub(4000);

        rc = await reserveInst.makeOrder(maker1, true, token.address, orderPayAmountWei, orderExchangeTwei, 0, {from: maker1});
        let order3ID = rc.logs[0].args.orderID.valueOf();
        log("order3 " + order3ID)

        orderDetails = await reserveInst.getOrderDetails(rc.logs[0].args.orderID.valueOf());


        assert.equal(orderDetails[0].valueOf(), maker1);
        assert.equal(orderDetails[1].valueOf(), headID.valueOf());
        assert.equal(orderDetails[2].valueOf(), order1ID.valueOf()); // next should be 0 - since last
        assert.equal(orderDetails[3].valueOf(), 1); //state in use
        assert.equal(orderDetails[4].valueOf(), orderPayAmountWei.valueOf());
        assert.equal(orderDetails[5].valueOf(), orderExchangeTwei.valueOf());
    });

});


function log(str) {
    console.log(str);
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

