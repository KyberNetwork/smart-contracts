const TestToken = artifacts.require("TestToken.sol");
const NetworkProxy = artifacts.require("KyberNetworkProxy.sol");
const KyberNetwork = artifacts.require("KyberNetwork.sol");
const FeeBurner = artifacts.require("FeeBurner.sol");
const ExpectedRate = artifacts.require("ExpectedRate.sol");
const OrderList = artifacts.require("OrderList.sol");
const OrderListFactory = artifacts.require("OrderListFactory.sol");
const OrderbookReserve = artifacts.require("OrderbookReserve.sol");
const MockOrderbookReserve = artifacts.require("MockOrderbookReserve.sol");
const TestTokenFailing = artifacts.require("TestTokenFailing.sol");
const TestTokenTransferFailing = artifacts.require("TestTokenTransferFailing.sol");
const MockMedianizer = artifacts.require("MockMedianizer.sol");
const MockKyberNetwork = artifacts.require("MockKyberNetwork.sol");
const PermissionlessOrderbookReserveLister = artifacts.require("PermissionlessOrderbookReserveLister.sol");
const MockUtils = artifacts.require("MockUtils.sol");

const Helper = require("../helper.js");
const BigNumber = require('bignumber.js');
const ReserveSim = require("../test/sol4/orderBookFuzzer/simulator_orderbookReserve.js");
const OrderGenerator = require("../test/sol4/orderBookFuzzer/tradeGenerator_orderbook.js");

const lowRate = 42;

//global variables
//////////////////
const precisionUnits = (new BigNumber(10).pow(18));
const ethAddress = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
const gasPrice = (new BigNumber(10).pow(9).mul(50));
const initialEthKncRate = 280;
const initialEthToKncRatePrecision = precisionUnits.mul(initialEthKncRate);
const BPS = 10000;
const ethDecimals = 18;

//
let MAX_RATE = precisionUnits.mul(10 ** 6); //internal parameter in Utils.sol.
let MAX_QTY = new BigNumber(10 ** 28);

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
const tokenDecimals = 18;

let headId;
let tailId;

let operator;

let firstFreeOrderIdPerReserveList;
let numOrderIdsPerMaker;
let currentBlock;
let burnToStakeFactor;

let makerBurnFeeBps = 25;
let maxOrdersPerTrade = 5;
let minOrderSizeDollar = 1000;
let minNewOrderWei;
let baseKncPerEthRatePrecision;
let dollarsPerEthPrecision = precisionUnits.mul(500);

contract('OrderbookReserve fuzzer', async (accounts) => {

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
            ordersFactory.address, minOrderSizeDollar, maxOrdersPerTrade, makerBurnFeeBps);
        await reserve.init();

        let rxLimits = await reserve.limits();
//        log (rxLimits)
        minNewOrderWei = rxLimits[2].valueOf();
        baseKncPerEthRatePrecision = await reserve.kncPerEthBaseRatePrecision();
        burnToStakeFactor = await reserve.BURN_TO_STAKE_FACTOR();
        let ordersAdd = await reserve.tokenToEthList();
        let orders = OrderList.at(ordersAdd.valueOf());
        headId = (await orders.HEAD_ID()).valueOf();
        tailId = (await orders.TAIL_ID()).valueOf();
        firstFreeOrderIdPerReserveList = (await orders.nextFreeId()).valueOf();
    });

    beforeEach('setup reserve contract', async () => {
        ethKncRate = initialEthKncRate;
        let ethToKncRatePrecision = precisionUnits.mul(ethKncRate);
        let kncToEthRatePrecision = precisionUnits.div(ethKncRate);

        await mockNetwork.setPairRate(ethAddress, kncAddress, ethToKncRatePrecision);
        await mockNetwork.setPairRate(kncAddress, ethAddress, kncToEthRatePrecision);

        await feeBurner.setKNCRate();

        reserve = await OrderbookReserve.new(kncAddress, tokenAdd, feeBurner.address, network, medianizer.address,
                ordersFactory.address, minOrderSizeDollar, maxOrdersPerTrade, makerBurnFeeBps);
        await reserve.init();

        await reserve.setKncPerEthBaseRate();

        baseKncPerEthRatePrecision = await reserve.kncPerEthBaseRatePrecision();
    });

    it("run order simulator in loop. verify simulator results and on chain results match", async() => {

        const makers = [accounts[0], accounts[1], accounts[2], accounts[3], accounts[4]];
        const takers = [accounts[5], accounts[6], accounts[7], accounts[8], accounts[9]];

//        const makers = [accounts[0]];
//        const takers = [accounts[5]];

        let tokenWeiDepositAmount = new BigNumber(70 * 10 ** 18);
        let kncTweiDepositAmount = new BigNumber(80 * 10 ** 18);

        for(let i = 0; i < makers.length; i++) {
            let ethAmount = ((await Helper.getBalancePromise(makers[i]))).div(7).floor();
            await makerDeposit(makers[i], ethAmount, tokenWeiDepositAmount.mul(i + 1).div(3).floor(), kncTweiDepositAmount.mul(3).floor());
        }

        for(let i = 0; i < takers.length; i++) {
            let ethAmount = (await Helper.getBalancePromise(takers[i])).sub(500000);
            await updateTakerFunds(takers[i], ethAmount, tokenWeiDepositAmount.mul(i * 1 + 1 * 1).div(3), kncTweiDepositAmount.mul(i * 3));
        }

        await token.transfer(network, tokenWeiDepositAmount.mul(10));
        await token.approve(reserve.address, tokenWeiDepositAmount.mul(10), {from: network})

        const numLoops = 13000;
        let submitData;
        let tradeData;
        let isSameResult = true;
        let numTradeFail = 0;
        let numTradeSuccess = 0;
        let numSubmitFail = 0;
        let numSubmitSuccess = 0;
        let numUpdateFail = 0;
        let numUpdateSuccess = 0;
        let numCancelFail = 0;
        let numCancelSuccess = 0;
        let numWithdrawFail = 0;
        let numWithdrawSuccess = 0;
        let loop = 0;
        let result;

        for(; loop < numLoops; loop++) {
            let operation = OrderGenerator.nextOperation();

            switch(operation) {
                case 'withdraw':
                    let withdraw = OrderGenerator.getNextWithdraw();
                    log("***  withdraw maker: " + withdraw['maker'] + " fund " + withdraw['fund'] + " amount: " + withdraw['amount']);;

                    try {
                        result = sim_withdraw(withdraw['maker'], withdraw['fund'], withdraw['amount']);
                    } catch(e) {
                        log(e);
                        isSameResult = false;
                    }

                    if(result == false) numWithdrawFail++;
                    else numWithdrawSuccess++;

                    break;

                case 'trade':
                    let trade = OrderGenerator.getNextTrade();
                    log("***  trade taker: " + trade['taker'] + " EthtoTok: " + trade['isEthToToken'] + " src: " + trade['src']);

                    let add1 = trade['isEthToToken'] ? ethAddress : tokenAdd;
                    let add2 = trade['isEthToToken'] ? tokenAdd : ethAddress;

                    //check rate first
                    let rate;
                    try {
                        rate = await reserveGetRate(add1, add2, trade['src']);
                    } catch(e) {
                        log(lastException);
                        log(e)
                        isSameResult = false;
                        break;
                    }

                    if(rate == 0) {
                        numTradeFail++;
                        continue;
                    }

                    let val = trade['isEthToToken'] ? trade['src'] : 0;
                    let from = trade['isEthToToken'] ? trade['taker'] : network;

                    try{
                        let result = await reserveTrade(add1, trade['src'], add2, trade['taker'], rate, false, {from: network, value: val});

                        if(result) numTradeSuccess++;
                        else numTradeFail++;

                    } catch(e) {
                        log(e);
                        log(lastException);
                        isSameResult = false;
                    }
                    break;

                case 'submit':
                    let submit = OrderGenerator.getNextSubmit();
                    if(submit['hint'] == -1) {
                        log("getting prev ID, got: " + submit['hint']);
                        submit['hint'] = ReserveSim.getPrevId(submit['isEthToToken'], submit['src'], submit['dst']);
                    }

                    log("***  submit EthtoTok: " + submit['isEthToToken'] + " maker: " + submit['maker'] + " src: " +
                                submit['src'] + " dst: " + submit['dst'] + " hint " + submit['hint']);

                    try{
                        if(submit['isEthToToken']) {
                            result = await doSubmitEthToToken(submit['src'], submit['dst'], submit['hint'], {from: submit['maker']});
                        } else {
                            result = await doSubmitTokenToEth(submit['src'], submit['dst'], submit['hint'], {from: submit['maker']});
                        }

                        if(result) numSubmitSuccess++;
                        else numSubmitFail++;

                    } catch(e) {
                        log(lastException);
                        log(e);
                        isSameResult = false;
                    }

                    await makerCompareFunds(submit['maker']);
                    break;

                case 'cancel':
                    let cancel = OrderGenerator.getNextCancel();
                    log("***  cancel EthtoTok: " + cancel['isEthToToken'] + " maker: " + cancel['maker'] + " orderId "
                        + cancel['orderId']);

                    try{
                        if(cancel['isEthToToken']) {
                            result = await doCancelEthToToken(cancel['orderId'], {from: cancel['maker']});
                        } else {
                            result = await doCancelTokenToEth(cancel['orderId'], {from: cancel['maker']});
                        }

                        if(result) numCancelSuccess++;
                        else numCancelFail++;

                    } catch(e) {
                        log(lastException);
                        log(e);
                        isSameResult = false;
                    }
                    break;

                case 'update':
                    let update = OrderGenerator.getNextUpdate();
                    if(update['hint'] == -1) {
                        log("getting prev ID, got: " + update['hint']);
                        update['hint'] = ReserveSim.getPrevId(update['isEthToToken'], update['src'], update['dst']);
                    }

                    log("********update EthtoTok: " + update['isEthToToken'] + " maker: " + update['maker'] + " orderId "
                        + update['orderId'] + " src: " + update['src'] + " dst: " + update['dst'] + " hint " + update['hint']);

                    try{
                        if(update['isEthToToken']) {
                            result = await doUpdateEthToToken(update['orderId'], update['src'], update['dst'], update['hint'], {from: update['maker']});
                        } else {
                            result = await doUpdateTokenToEth(update['orderId'], update['src'], update['dst'], update['hint'], {from: update['maker']});
                        }

                        if(result) numUpdateSuccess++;
                        else numUpdateFail++;

                    } catch(e) {
                        log(lastException);
                        log(e);
                        isSameResult = false;
                    }
                    break;

                default:
                    log("unexpected operation: " + operation);
                    break;
            }

            ReserveSim.showLists();

            try {
                await simulator_isSameOrderLists(true);
                await simulator_isSameOrderLists(false);
            } catch(e) {
                log("lists don't match")
                log(e);
                isSameResult = false;
            }

            let makerId;

            try {

                for(makerId = 0; makerId < makers.length; makerId++) {
                    await makerCompareFunds(makers[makerId]);
                }
            } catch(e) {
                log("funds don't match for maker: " + makers[makerId]);
                log(e);
                isSameResult = false;
            }

            if(!isSameResult) break;
        }

        log("")
        log("total of " + loop + " operations.");
        log("trade summary. fails: " + numTradeFail + " success: " + numTradeSuccess);
        log("submit summary. fails: " + numSubmitFail + " success: " + numSubmitSuccess);
        log("update summary. fails: " + numUpdateFail + " success: " + numUpdateSuccess);
        log("cancel summary. fails: " + numCancelFail + " success: " + numCancelSuccess);
        log("withdraw summary. fails: " + numWithdrawFail + " success: " + numWithdrawSuccess);

        if(!isSameResult) assert(false, lastException);
    })
});


function log(str) {
    console.log(str);
}

let needReserveReset = true;
let lastException;

async function makerDeposit(maker, ethWei, tokenTwei, kncTwei) {

    await token.approve(reserve.address, tokenTwei);
    await reserve.depositToken(maker, tokenTwei);
    await KNCToken.approve(reserve.address, kncTwei);
    await reserve.depositKncForFee(maker, kncTwei);
    await reserve.depositEther(maker, {from: maker, value: ethWei});

    if(needReserveReset) {
        log("reserve sim reset next. min: " + minNewOrderWei + " init " + initialEthToKncRatePrecision + " dec " + tokenDecimals)
        ReserveSim.reset(minNewOrderWei, initialEthToKncRatePrecision, tokenDecimals);
        needReserveReset = false;
    }
    ReserveSim.deposit(maker, ethWei, tokenTwei, kncTwei);
    OrderGenerator.updateMakerFunds(maker, ethWei, kncTwei, tokenTwei);
}

async function sim_withdraw(maker, fund, amount) {
    let expectedSimResult = true;

    try {
        switch (fund) {
            case 'token':
                await reserve.withdrawToken(amount, {from: maker});
                break;

            case 'ether':
                await reserve.withdrawEther(amount, {from: maker});
                break;

            case 'knc':
                await reserve.withdrawKncFee(amount, {from: maker});
                break;

            default:
                log("unkonwn fund type: " + fund);
                assert(false, "unkonwn fund type: " + fund);
                break;
        }
    } catch(e) {
        expectedSimResult = false;
        lastException = e;
    }

    let simResult = ReserveSim.withdraw(maker, fund, amount);

    assert.equal(simResult, expectedSimResult, "Sim result: " + simResult + " not as expected. for withdraw " + fund +
                    " amount: " + amount);
    log("withdraw " + fund + " amount " + amount + " as expected: " + expectedSimResult);
    return simResult
}

async function updateTakerFunds(taker, ethWei, tokenTwei) {
    OrderGenerator.updateTakerFunds(taker, ethWei, tokenTwei);
}

async function doSubmitTokenToEth(srcTwei, dstWei, hint, from) {
    let expectedSimResult = true;
    let simResult;
    let exception;
    let result;

    try {
        if (hint == 0) {
            result = await reserve.submitTokenToEthOrder(srcTwei, dstWei, from);
        } else {
            result = await reserve.submitTokenToEthOrderWHint(srcTwei, dstWei, hint, from);
        }
    } catch(e) {
        lastException = e;
        exception = e;
        expectedSimResult = false;
    }

    simResult = ReserveSim.submitTokenToEth(from.from, srcTwei, dstWei, hint);
    assert.equal(simResult, expectedSimResult, "sim result: " + simResult + " not as expected***********************");
    return expectedSimResult;
}

async function doSubmitEthToToken(srcWei, dstTwei, hint, from) {
    let expectedSimResult = true;
    let simResult;
    let exception;
    let result;

    try {
        if (hint == 0) {
            result = await reserve.submitEthToTokenOrder(srcWei, dstTwei, from);
        } else {
            result = await reserve.submitEthToTokenOrderWHint(srcWei, dstTwei, hint, from);
        }
    } catch(e) {
        lastException = e;
        exception = e;
        expectedSimResult = false;
    }

    simResult = ReserveSim.submitEthToToken(from.from, srcWei, dstTwei, hint);
    assert.equal(simResult, expectedSimResult, "simResult: " + simResult + " submit sim result not as expected**************************");
    log("simulator result doSubmitEthToToken as expected:                        " + simResult);
    return expectedSimResult;
}

async function reserveTrade(add1, payValue, add2, destAddress, expectedRate, validate, from) {
    let expectedSimResult = true;
    let simResult;
    let exception;
    let result;

    try {
        result = await reserve.trade(add1, payValue, add2, destAddress, expectedRate, validate, from);
        log("weeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee scusssssssssssssssssssssssses")
    } catch(e) {
        log("trade failed add1: " + add1 +  " add2 " + add2 + " pay " + payValue)
        lastException = e;
        exception = e;
        expectedSimResult = false;
    }

    let isEthToToken = (add1 == ethAddress) ? true : false;
    simResult = ReserveSim.trade(isEthToToken, payValue, expectedRate);
    assert.equal(simResult, expectedSimResult, "sim result: " + simResult + " not as expected**********!!!!!!!!!!!!!!!!!!!!!!!!!111****************");
    log("simulator trade result as expected: ############       " + simResult);
    return expectedSimResult;
}

async function doUpdateEthToToken(orderId, srcWei, dstTwei, hint, from){
    let expectedSimResult = true;
    let simResult;
    let exception;
    let result;

    try {
        if (hint == 0) {
            result = await reserve.updateEthToTokenOrder(orderId, srcWei, dstTwei, from);
        } else {
            result = await reserve.updateEthToTokenOrderWHint(orderId, srcWei, dstTwei, hint, from);
        }
    } catch(e) {
        lastException = e;
        exception = e;
        expectedSimResult = false;
    }

    simResult = ReserveSim.updateEthToToken(from.from, orderId, srcWei, dstTwei, hint);
    assert.equal(simResult, expectedSimResult, "simResult: " + simResult + " updateEthToTok sim result not as expected**************************");
    return expectedSimResult;
}

async function doUpdateTokenToEth(orderId, srcTwei, dstWei, hint, from){
    let expectedSimResult = true;
    let simResult;
    let exception;
    let result;

    try {
        if (hint == 0) {
            result = await reserve.updateTokenToEthOrder(orderId, srcTwei, dstWei, from);
        } else {
            result = await reserve.updateTokenToEthOrderWHint(orderId, srcTwei, dstWei, hint, from);
        }
    } catch(e) {
        lastException = e;
        exception = e;
        expectedSimResult = false;
    }

    simResult = ReserveSim.updateTokenToEth(from.from, orderId, srcTwei, dstWei, hint);
    assert.equal(simResult, expectedSimResult, "simResult: " + simResult + " update simTokToEth result not as expected**************************");
    return expectedSimResult;
}

async function doCancelEthToToken(orderId, from){
    let expectedSimResult = true;
    let simResult;
    let exception;
    let result;

    try {
        result = await reserve.cancelEthToTokenOrder(orderId, from);
    } catch(e) {
        lastException = e;
        exception = e;
        expectedSimResult = false;
    }

    simResult = ReserveSim.cancelEthToToken(from.from, orderId);
    assert.equal(simResult, expectedSimResult, "simResult: " + simResult + " cancelEthToTok sim result not as expected**************************");
    return expectedSimResult;
}


async function doCancelTokenToEth(orderId, from){
    let expectedSimResult = true;
    let simResult;
    let exception;
    let result;

    try {
        result = await reserve.cancelTokenToEthOrder(orderId, from);
    } catch(e) {
        lastException = e;
        exception = e;
        expectedSimResult = false;
    }

    simResult = ReserveSim.cancelTokenToEth(from.from, orderId);
    assert.equal(simResult, expectedSimResult, "simResult: " + simResult + " cancelTokToEth sim result not as expected**************************");
    return expectedSimResult;
}

async function reserveGetRate(add1, add2, amount, ignore) {
    let expectedSimResult;
    let simResult;
    let exception;
    let rate;

    try {
        rate = await reserve.getConversionRate(add1, add2, amount, 0);
        expectedSimResult = rate;
    } catch(e) {
        exception = e;
        expectedSimResult = new BigNumber(0);
    }

    let isEthToToken = (add1 == ethAddress) ? true : false;
    let simRate = ReserveSim.getConversionRate(isEthToToken, amount);
    assert.equal(simRate.div(100).floor().valueOf(), expectedSimResult.div(100).floor().valueOf(), "sim result: " +
        simRate.valueOf() + " not as expected");
    log("simulator rate result reserveGetRate as expected: ???????????" + simRate);

    return rate;
}

async function simulator_isSameOrderLists(isEthToToken) {
    let onchainList = isEthToToken ? (await reserve.getEthToTokenOrderList()) : (await reserve.getTokenToEthOrderList());
    let simList = ReserveSim.getList(isEthToToken);

    if(onchainList.length != simList.length) {
        log("")
        log("lists length different")
        log('onchainList');
        log(onchainList)
        log('simulatorList');
        log(simList)
    }
    assert.equal(onchainList.length, simList.length, "isEthToToken: " + isEthToToken + " sim list lentgh: " + simList.length +
        " while onchain list: " + onchainList.length);

    for (let i = 0; i < onchainList.length; i++) {
        if(onchainList[i].valueOf() != simList[i].valueOf()) {
            log("list cell: " + i + " is different")
            log('onchainList');
            log(onchainList)
            log('simulatorList');
            log(simList)

            assert.equal(onchainList[i].valueOf(), simList[i].valueOf(), "isEthToToken: " + isEthToToken + " list position: " + i +
                " in sim list is: " + simList[i].valueOf() + " while onchain list its: " + onchainList[i].valueOf());

        }
    }

    for (let i = 0; i < onchainList.length; i++) {
        let onChainOrder = isEthToToken ? await reserve.getEthToTokenOrder(onchainList[i]) : await reserve.getTokenToEthOrder(onchainList[i]);
        let simOrder = ReserveSim.getOrder(isEthToToken, onchainList[i]);

        try{
            assert.equal(onChainOrder[0].valueOf(), simOrder['maker']);
            assert.equal(onChainOrder[1].valueOf(), simOrder['srcQty'].valueOf());
            assert.equal(onChainOrder[2].valueOf(), simOrder['dstQty'].valueOf());
            assert.equal(onChainOrder[3].valueOf(), simOrder['prev']);
            assert.equal(onChainOrder[4].valueOf(), simOrder['next']);
        } catch (e) {
            log(simOrder);
            log(onChainOrder);
            throw(e);
        }
    }
}

async function makerCompareFunds(maker) {
    let simFunds = ReserveSim.getMakerFunds(maker);

    let makerEth = await reserve.makerFunds(maker, ethAddress);
    assert.equal(makerEth.valueOf(), simFunds['ether'].valueOf(), "ethers funds mismatch. simfund : " +
        simFunds['ether'].valueOf() + " onchain: " + makerEth.valueOf());

    let makerTokens = await reserve.makerFunds(maker, token.address);
    assert.equal(makerTokens.valueOf(), simFunds['token'].valueOf(), "Token funds mismatch. simfund : " +
        simFunds['token'].valueOf() + " onchain: " + makerTokens.valueOf());

    let makerKncAmount = await reserve.makerKnc(maker);
    assert.equal(makerKncAmount.valueOf(), simFunds['knc'].valueOf(), "KNC funds mismatch. simfund : " +
        simFunds['knc'].valueOf() + " onchain: " + makerKncAmount.valueOf());

    let makerUnlockedKnc = await reserve.makerUnlockedKnc(maker);
    assert.equal(makerUnlockedKnc.valueOf(), simFunds['unlockedKnc'].valueOf(), "unlockedKnc funds mismatch. sim : " +
        simFunds['unlockedKnc'].valueOf() + " onchain: " + makerUnlockedKnc.valueOf());

    let makerTotalWei = await reserve.makerTotalOrdersWei(maker);
    assert.equal(makerTotalWei.valueOf(), simFunds['totalWei'].valueOf(), "total orders wei mismatch. sim : " +
        simFunds['totalWei'].valueOf() + " onchain: " + makerTotalWei.valueOf());

    log("maker: " + maker + " eth: " + makerEth.valueOf() + " tokens: " + makerTokens.valueOf() + " knc: " +
        makerKncAmount.valueOf() + " unlockedKnc " + makerUnlockedKnc.valueOf() + " totalWei: " + makerTotalWei.valueOf());
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

function calcSrcQty(dstQty, srcDecimals, dstDecimals, rate) {
    //source quantity is rounded up. to avoid dest quantity being too low.
    let srcQty;
    let numerator;
    let denominator;

    if (srcDecimals >= dstDecimals) {
        numerator = precisionUnits.mul(dstQty).mul((new BigNumber(10)).pow(srcDecimals - dstDecimals));
        denominator = new BigNumber(rate);
    } else {
        numerator = precisionUnits.mul(dstQty);
        denominator = (new BigNumber(rate)).mul((new BigNumber(10)).pow(dstDecimals - srcDecimals));
    }
    srcQty = (numerator.add(denominator.sub(1))).div(denominator).floor(); //avoid rounding down errors
    return srcQty;
}

