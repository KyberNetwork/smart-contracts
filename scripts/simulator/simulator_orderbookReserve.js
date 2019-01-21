
const BigNumber = require('bignumber.js');

// reserve constants
let minNewOrderWei;
let kncPerEthBaseRatePrecision;
let burnFeeBps = 25;
let burn_to_stake_factor = 5;
let tokenDecimals;

const NUM_ORDER_IDS = 32;
const PRECISION = new BigNumber(10 ** 18);
const BPS = 10000;
const MAX_ORDERS_IN_TRADE = 5;
const MAX_QTY = new BigNumber(10 ** 28);
const MAX_RATE = new BigNumber(10 ** 24);

// reserve
//////////
let nextFreeIdEthToTok = 3;
let nextFreeIdTokToEth = 3;

let makerFunds = [];
let makerEthToTokenOrderIds = [];
let makerTokenToEthOrderIds = [];
let makerTotalWeiInOrders = [];

let ethToTokenList = [];
let tokenToEthList = [];

module.exports.reset = function reserve_reset(minNewOrder, kncPerEth, tokenDec) {
    nextFreeIdTokToEth = 3;
    nextFreeIdEthToTok = 3;

    makerFunds = [];
    makerEthToTokenOrderIds = [];
    makerTokenToEthOrderIds = [];
    makerTotalWeiInOrders = [];

    ethToTokenList = [];
    tokenToEthList = [];

    list_init(ethToTokenList);
    list_init(tokenToEthList);

    minNewOrderWei = new BigNumber(minNewOrder);
    kncPerEthBaseRatePrecision = new BigNumber(kncPerEth);

    tokenDecimals = tokenDec;
}


module.exports.deposit = function reserve_deposit(maker, ethAmount, tokenAmount, kncAmount) {
    reserve_depositKnc(maker, kncAmount);
    reserve_depositEther(maker, ethAmount);
    reserve_depositToken(maker, tokenAmount);

//    log("maker " + maker + " eth " + ethAmount + " token " + tokenAmount +  " knc " + kncAmount);
}

module.exports.getConversionRate = function reserve_getConversionRate(isEthToToken, srcQty) {

    //user order ETH -> token is matched with maker order token -> ETH
    if(srcQty.gt(MAX_QTY)) {log("qty above max"); return (new BigNumber(0));}

    let list = isEthToToken ? tokenToEthList : ethToTokenList;

    let userRemainingSrcQty = srcQty;
    let totalUserDstAmount = new BigNumber(0);
    let maxOrders = MAX_ORDERS_IN_TRADE;

    for (let orderId = list_getFirstOrderId(list);
        ((userRemainingSrcQty > 0) && orderId != TAIL_ID && (maxOrders-- > 0));
        orderId = list_getNextOrderId(list, orderId)

    ) {
        // maker dst quantity is the requested quantity he wants to receive. user src quantity is what user gives.
        // so user src quantity is matched with maker dst quantity
        if (((list[orderId]['dstQty']).lt(userRemainingSrcQty))) {
//            log("get rate loop, full order, orderID  " + orderId)

            totalUserDstAmount = totalUserDstAmount.add(list[orderId]['srcQty']);
            userRemainingSrcQty = userRemainingSrcQty.sub(list[orderId]['dstQty']);
        } else {
//            log("get rate loop, partial order, orderID  " + orderId)

            let partialQty = userRemainingSrcQty.mul(list[orderId]['srcQty']).div(list[orderId]['dstQty']).floor()
            totalUserDstAmount = totalUserDstAmount.add(partialQty);
            userRemainingSrcQty = 0;
        }
    }

    if (userRemainingSrcQty != 0) {
        log("user remaining: "  + userRemainingSrcQty); return (new BigNumber(0));
    } //not enough tokens to exchange.

    let rate = calcRateFromQty(srcQty, totalUserDstAmount, isEthToToken? 18 : tokenDecimals, isEthToToken? tokenDecimals : 18);

    return (new BigNumber(rate));
}

module.exports.trade = function reserve_trade(isEthToToken, srcQty, expectedRate) {
    //user order ETH -> token is matched with maker order token -> ETH

    if(srcQty.gt(MAX_QTY)) {log("qty above max"); return 0;}
    let list = (isEthToToken) ? tokenToEthList : ethToTokenList;

    let userRemainingSrcQty = srcQty;
    let totalUserDstAmount = new BigNumber(0);
    let maxOrders = MAX_ORDERS_IN_TRADE;

    //first loop to see if enough tokens to perform. since no revert support on js...

    for (orderId = list_getFirstOrderId(list);
        ((userRemainingSrcQty > 0) && orderId != TAIL_ID && (maxOrders-- > 0));
        orderId = list_getNextOrderId(list, orderId)
    ) {
        // maker dst quantity is the requested quantity he wants to receive. user src quantity is what user gives.
        // so user src quantity is matched with maker dst quantity
        if (((list[orderId]['dstQty']).lt(userRemainingSrcQty))) {
            userRemainingSrcQty = userRemainingSrcQty.sub(list[orderId]['dstQty']);
        } else {
            let userPartialTakeQty = userRemainingSrcQty.mul(list[orderId]['srcQty']).div(list[orderId]['dstQty']).floor();
            userRemainingSrcQty = (new BigNumber(0));
        }
    }

    if (userRemainingSrcQty.gt(0)) {log("not enough remaining src: " + userRemainingSrcQty); return false;} //not enough tokens to exchange.

    userRemainingSrcQty = srcQty;
    maxOrders = MAX_ORDERS_IN_TRADE;

    for (orderId = list_getFirstOrderId(list);
        ((userRemainingSrcQty > 0) && orderId != TAIL_ID && (maxOrders-- > 0));
        orderId = list_getNextOrderId(list, orderId)
    ) {
        // maker dst quantity is the requested quantity he wants to receive. user src quantity is what user gives.
        // so user src quantity is matched with maker dst quantity
        if (((list[orderId]['dstQty']).lt(userRemainingSrcQty))) {
            log("take full order: " + orderId);
            totalUserDstAmount =  totalUserDstAmount.add(list[orderId]['srcQty']);
            userRemainingSrcQty = userRemainingSrcQty.sub(list[orderId]['dstQty']);
            reserve_takeFullOrder(isEthToToken, list, orderId, list[orderId]['dstQty']);
        } else {
            let userPartialTakeQty = userRemainingSrcQty.mul(list[orderId]['srcQty']).div(list[orderId]['dstQty']).floor()
            totalUserDstAmount = totalUserDstAmount.add(userPartialTakeQty);
            reserve_takePartialOrder(isEthToToken, list, orderId, userRemainingSrcQty, userPartialTakeQty);
            userRemainingSrcQty = 0;
            log("take partial order: " + orderId + " userPartialQty " + userPartialTakeQty);
        }
    }

    log("user total dest amount: " + totalUserDstAmount)
//    let rate = calcRateFromQty(srcQty, totalUserDstAmount, isEthToToken? 18 : tokenDecimals, isEthToToken? tokenDecimals : 18);

    return true;
}

module.exports.getPrevId = function reserve_getPrevId(isEthToToken, srcAmount, dstAmount) {
    let list = isEthToToken ? ethToTokenList : tokenToEthList;

    return list_findPrevOrderId(list, srcAmount, dstAmount);
}

module.exports.showLists = function reserve_showLists() {
    if (ethToTokenList.length > 1) {
        log('')
        log("eth to token list")
        log('-----------------')
        list_showList(ethToTokenList);
        log('')
    }

    if(tokenToEthList.length > 1) {
        log('')
        log("token to eth list")
        log('-----------------')
        list_showList(tokenToEthList);
        log('')
    }
}

module.exports.getList = function reserve_getList(isEthToToken) {
    if (isEthToToken) {
        return list_getList(ethToTokenList);
    } else {
        return list_getList(tokenToEthList);
    }
}

module.exports.getOrder = function reserve_getOrder(isEthToToken, orderId) {
    if (isEthToToken) return list_getOrder(ethToTokenList, orderId);
    return list_getOrder(tokenToEthList, orderId);
}

function reserve_takeFullOrder(isEthToToken, list, orderId, payAmount) {
    let maker = list[orderId]['maker'];

    //reverse here. since its eth to token from taker perspective
    let weiAmount = isEthToToken ? list[orderId]['dstQty'] : list[orderId]['srcQty'];

    let makerReceiveType = isEthToToken? 'ether' : 'token';

    //maker gets payed
    makerFunds[maker][makerReceiveType] = (makerFunds[maker][makerReceiveType]).add(payAmount);

    utils_removeStakeAndBurn(maker, weiAmount, weiAmount)

    reserve_removeOrder(isEthToToken, list, orderId);
}

function reserve_takePartialOrder(isEthToToken, list, orderId, takerPayAmount, takerTakeAmount) {
    log("")
    log("take partial order")
    log("taker pay: " + takerPayAmount + " taker take: " + takerTakeAmount);
    log("")

    let maker = list[orderId]['maker'];
    let makerReceiveType = isEthToToken? 'ether' : 'token';
    let makerSrcType = isEthToToken? 'token' : 'ether';

    //reverse here. since its eth to token from taker perspective
    let remainingOrderSrc = (list[orderId]['srcQty']).sub(takerTakeAmount);
    let remainingOrderDst = (list[orderId]['dstQty']).sub(takerPayAmount);

    let orderWeiAmount = isEthToToken ? list[orderId]['dstQty'] : list[orderId]['srcQty'];
    let remainingWeiAmount = isEthToToken ? remainingOrderDst : remainingOrderSrc;

    if(remainingWeiAmount.lt(minNewOrderWei.div(2))) {
        //remove order
        utils_removeStakeAndBurn(maker, orderWeiAmount, orderWeiAmount.sub(remainingWeiAmount));
        makerFunds[maker][makerSrcType] = (makerFunds[maker][makerSrcType]).add(remainingOrderSrc);

        reserve_removeOrder(isEthToToken, list, orderId);
    } else {
        list[orderId]['srcQty'] = remainingOrderSrc;
        list[orderId]['dstQty'] = remainingOrderDst;

        utils_removeStakeAndBurn(maker, orderWeiAmount.sub(remainingWeiAmount), orderWeiAmount.sub(remainingWeiAmount));
    }

    //maker gets payed
    makerFunds[maker][makerReceiveType] = (makerFunds[maker][makerReceiveType]).add(takerPayAmount);
}

function reserve_removeOrder(isEthToToken, list, orderId) {
    let maker = list[orderId]['maker'];

    list_removeOrder(list, orderId);

    reserve_returnOrderId(!isEthToToken, maker, orderId);
}

function reserve_depositKnc(maker, amountKnc) {
    if (makerFunds[maker] == undefined) {
        makerFunds[maker] = {};
    }

    let startKnc = new BigNumber(0);

    if(makerFunds[maker]['knc'] == undefined){
        makerFunds[maker]['knc'] = new BigNumber(0);
    }

    let newKnc = (makerFunds[maker]['knc']).add(amountKnc);

    makerFunds[maker]['knc'] = newKnc;

    if (makerEthToTokenOrderIds[maker] == undefined) {
        let idArr = [];
        for(let i = 0; i < NUM_ORDER_IDS; i++) {
            idArr[i] = nextFreeIdEthToTok * 1 + i * 1;
        }

        makerEthToTokenOrderIds[maker] = idArr;

        nextFreeIdEthToTok = nextFreeIdEthToTok * 1 + NUM_ORDER_IDS * 1;
    }

    if (makerTokenToEthOrderIds[maker] == undefined) {
        let idArr = [];
        for(let i = 0; i < NUM_ORDER_IDS; i++) {
            idArr[i] = nextFreeIdTokToEth * 1 + i * 1;
        }

        makerTokenToEthOrderIds[maker] = idArr;

        nextFreeIdTokToEth = nextFreeIdTokToEth * 1 + NUM_ORDER_IDS * 1;
    }
}

function reserve_depositToken(maker, amount) {
    if (makerFunds[maker] == undefined) {
        makerFunds[maker] = {};
    }

    let startAmount = new BigNumber(0);

    if(makerFunds[maker]['token'] != undefined){
        startAmount = makerFunds[maker]['token'];
    }

    let newAmount = startAmount.add(amount);
    makerFunds[maker]['token'] = newAmount;
}

function reserve_depositEther(maker, amount) {
    if (makerFunds[maker] == undefined) {
        makerFunds[maker] = {};
    }

    let startAmount = new BigNumber(0);

    if(makerFunds[maker]['ether'] != undefined){
        startAmount = makerFunds[maker]['ether'];
    }

    let newAmount = startAmount.add(amount);
    makerFunds[maker]['ether'] = newAmount;

    makerTotalWeiInOrders[maker] = new BigNumber(0);
}

function reserve_makerGetNewOrderId(isEthToToken, maker) {
    if(isEthToToken) orderIdArr = makerEthToTokenOrderIds;
    else orderIdArr = makerTokenToEthOrderIds;
    if(orderIdArr[maker] == undefined) {log("no IDs for maker"); return 0;}

    let idArr = orderIdArr[maker];
    let newId;

    if(idArr.length == 0) {log("empty id arr"); return 0;}
    newId = idArr[0];

    for(let i = 0; i < idArr.length - 1; i++) {
        idArr[i] = idArr[i * 1 + 1 * 1];
    }
    idArr.length -= 1;

    if(isEthToToken) makerEthToTokenOrderIds[maker] = idArr;
    else makerTokenToEthOrderIds[maker] = idArr;

    return newId;
}

function reserve_returnOrderId(isEthToToken, maker, orderId) {
    if(isEthToToken) orderIdArr = makerEthToTokenOrderIds;
    else orderIdArr = makerTokenToEthOrderIds;
    if(orderIdArr[maker] == undefined) {log("no IDs for maker"); return 0;}

    let makerIdsArr = orderIdArr[maker];
    let insertId = orderId;

    for(let i = 0; i < (makerIdsArr.length); i++) {
        if(insertId < makerIdsArr[i]) {
            let nextInsertId = makerIdsArr[i];
            makerIdsArr[i] = insertId;
            insertId = nextInsertId;
        }
    }
    makerIdsArr[makerIdsArr.length] = insertId;

    if(isEthToToken) makerEthToTokenOrderIds[maker] = makerIdsArr;
    else makerTokenToEthOrderIds[maker] = makerIdsArr;

}

module.exports.submitEthToToken = function reserve_submitEthToToken (maker, srcAmount, dstAmount, hint) {
    src = new BigNumber(srcAmount);
    dst = new BigNumber(dstAmount);

    if(src.lt(minNewOrderWei)) return false;

    //enough funds
    if(!utils_checkHasEnoughEther(maker, src)) {return false;}
    if(!utils_checkHasEnoughStake(maker, src)) {log("not enough knc stake"); return false;}

    // amount reversed. since rate is from take perspective
    if(!utils_isValidRate(true, dstAmount, srcAmount)) {log("above max rate"); return false;}
    if(!utils_isValidQtys(srcAmount, dstAmount)) {log("above max qty"); return false;}

    //get new order ID
    let orderId = reserve_makerGetNewOrderId(true, maker);
    if (orderId == 0) return false;

    let addedWithHint = false;

    if (hint != 0) {
        if (list_isCorrectHint(ethToTokenList, hint, srcAmount, dstAmount)) {
            list_insertOrder(ethToTokenList, orderId, hint, maker, srcAmount, dstAmount);
            addedWithHint == true;
        }
    }

    if (!addedWithHint) {
        list_addOrder(ethToTokenList, orderId, maker, srcAmount, dstAmount);
    }

    utils_addStake(maker, src);
    makerFunds[maker]['ether'] = (makerFunds[maker]['ether']).sub(srcAmount);

    return true;
}

module.exports.submitTokenToEth = function reserve_submitTokenToEth (maker, srcAmount, dstAmount, hint) {
    src = new BigNumber(srcAmount);
    dst = new BigNumber(dstAmount);
    if(dst.lt(minNewOrderWei)) return false;

    //enough funds
    if(!utils_checkHasEnoughTokens(maker, src)) {log("not enough tokens"); return false;}
    if(!utils_checkHasEnoughStake(maker, dst)) {log("not enough knc stake"); return false;}
    // amount reversed. since rate is from take perspective
    if(!utils_isValidRate(false, dstAmount, srcAmount)) {log("above max rate"); return false;}
    if(!utils_isValidQtys(srcAmount, dstAmount)) {log("above max qty"); return false;}

    // get new order ID
    let orderId = reserve_makerGetNewOrderId(false, maker);
    if (orderId == 0) {log("orderID: " + orderId); return false;}

    let addedWithHint = false;

    if (hint != 0) {
        if (list_isCorrectHint(tokenToEthList, hint, srcAmount, dstAmount)) {
            list_insertOrder(tokenToEthList, orderId, hint, maker, srcAmount, dstAmount);
            addedWithHint == true;
        }
    }

    if (!addedWithHint) {
        list_addOrder(tokenToEthList, orderId, maker, srcAmount, dstAmount);
    }

    utils_addStake(maker, dst);
    makerFunds[maker]['token'] = (makerFunds[maker]['token']).sub(srcAmount);

    return true;
}

module.exports.updateEthToToken = function reserve_updateEthToToken (maker, orderId, srcAmount, dstAmount, hint) {
    let newSrc = new BigNumber(srcAmount);
    let newDst = new BigNumber(dstAmount);

    if(newSrc.lt(minNewOrderWei)) return false;
    if(ethToTokenList[orderId] == undefined) return false;
    if(ethToTokenList[orderId]['maker'] != maker) return false;

    let currentSrc = ethToTokenList[orderId]['srcQty'];
    let currentDst = ethToTokenList[orderId]['dstQty'];

    if(newSrc.gt(currentSrc)) {
        //enough funds
        if(!utils_checkHasEnoughEther(maker, newSrc.sub(currentSrc))) {return false;}
        if(!utils_checkHasEnoughStake(maker, newSrc.sub(currentSrc))) {log("not enough knc stake"); return false;}
    }

    // amount reversed. since rate is from take perspective
    if(!utils_isValidRate(true, dstAmount, srcAmount)) {log("above max rate"); return false;}
    if(!utils_isValidQtys(srcAmount, dstAmount)) {log("above max qty"); return false;}

    list_removeOrder(ethToTokenList, orderId);

    let addedWithHint = false;

    if(hint == orderId) return false;

    if (hint != 0) {
        if (list_isCorrectHint(ethToTokenList, hint, srcAmount, dstAmount)) {
            list_insertOrder(ethToTokenList, orderId, hint, maker, srcAmount, dstAmount);
            addedWithHint == true;
        }
    }

    if (!addedWithHint) {
        list_addOrder(ethToTokenList, orderId, maker, srcAmount, dstAmount);
    }

    let srcDiff = newSrc.sub(currentSrc);
    utils_addStake(maker, srcDiff);
    makerFunds[maker]['ether'] = (makerFunds[maker]['ether']).add(currentSrc).sub(newSrc);

    return true;
}

module.exports.updateTokenToEth = function reserve_updateTokenToEth (maker, orderId, srcAmount, dstAmount, hint) {
    let newSrc = new BigNumber(srcAmount);
    let newDst = new BigNumber(dstAmount);

    if(newDst.lt(minNewOrderWei)) return false;
    if(tokenToEthList[orderId] == undefined) return false;
    if(tokenToEthList[orderId]['maker'] != maker) return false;

    let currentSrc = tokenToEthList[orderId]['srcQty'];
    let currentDst = tokenToEthList[orderId]['dstQty'];

    if(newSrc.gt(currentSrc)) {
        //enough funds
        if(!utils_checkHasEnoughTokens(maker, newSrc.sub(currentSrc))) {log("not enough tokens"); return false;}
    }

    if(newDst.gt(currentDst)) {
        if(!utils_checkHasEnoughStake(maker, newDst.sub(currentDst))) {log("not enough knc stake"); return false;}
    }

    // amount reversed. since rate is from take perspective
    if(!utils_isValidRate(false, dstAmount, srcAmount)) {log("above max rate"); return false;}
    if(!utils_isValidQtys(srcAmount, dstAmount)) {log("above max qty"); return false;}

    list_removeOrder(tokenToEthList, orderId);

    let addedWithHint = false;
    if(hint == orderId) return false;

    if (hint != 0) {
        if (list_isCorrectHint(tokenToEthList, hint, srcAmount, dstAmount)) {
            list_insertOrder(tokenToEthList, orderId, hint, maker, srcAmount, dstAmount);
            addedWithHint == true;
        }
    }

    if (!addedWithHint) {
        list_addOrder(tokenToEthList, orderId, maker, srcAmount, dstAmount);
    }

    utils_addStake(maker, newDst.sub(currentDst));
    makerFunds[maker]['token'] = (makerFunds[maker]['token']).add(currentSrc).sub(newSrc);

    return true;
}

function list_isCorrectHint(list, hintId, srcAmount, dstAmount) {
    if (hintId == HEAD_ID || hintId == TAIL_ID) return false;
    if (list[hintId] == undefined) return false;
    if (list[hintId]['prev'] == undefined || list[hintId]['next'] == undefined) return false;

    if (list_compareOrders(list, hintId, srcAmount, dstAmount) == 1) return false;
    if (list[hintId]['next'] == TAIL_ID ||
        list_compareOrders(list, list[hintId]['next'], srcAmount, dstAmount) > 0) {
            return false;
    }
}

module.exports.cancelEthToToken = function reserve_cancelEthToToken (maker, orderId) {
    if(ethToTokenList[orderId] == undefined) return false;
    if(ethToTokenList[orderId]['maker'] != maker) return false;

    let currentSrc = ethToTokenList[orderId]['srcQty'];
    let currentDst = ethToTokenList[orderId]['dstQty'];

    //eth to token value reveresed since from taker perspective
    if (false == reserve_removeOrder(false, ethToTokenList, orderId)) return false;

    let weiRemoved = (new BigNumber(0)).sub(currentSrc);
    utils_addStake(maker, weiRemoved);
    makerFunds[maker]['ether'] = (makerFunds[maker]['ether']).add(currentSrc);

    return true;
}

module.exports.cancelTokenToEth = function reserve_updateTokenToEth (maker, orderId, srcAmount, dstAmount) {
    if(tokenToEthList[orderId] == undefined) return false;
    if(tokenToEthList[orderId]['maker'] != maker) return false;

    let currentSrc = tokenToEthList[orderId]['srcQty'];
    let currentDst = tokenToEthList[orderId]['dstQty'];

    //eth to token value reveresed since from taker perspective
    if (false == reserve_removeOrder(true, tokenToEthList, orderId)) return false;

    let weiRemoved = (new BigNumber(0)).sub(currentDst);
    utils_addStake(maker, weiRemoved);
    makerFunds[maker]['token'] = (makerFunds[maker]['token']).add(currentSrc);

    return true;
}

module.exports.getMakerFunds = function reserve_makerFunds(maker) {
    let funds = makerFunds[maker];
    funds['totalWei'] = makerTotalWeiInOrders[maker];
    funds['unlockedKnc'] = utils_getUnlockedKnc(maker);
    return funds;
}

module.exports.withdraw = function reserve_withdraw(maker, fund, amount) {
    switch(fund) {
        case 'token':
        case 'ether':

            if(makerFunds[maker][fund].lt(amount)) return false;

            makerFunds[maker][fund] = makerFunds[maker][fund].sub(amount);

            break;

        case 'knc':

            let freeKnc = utils_getUnlockedKnc(maker);
            amount = new BigNumber(amount);

            if (amount.gt(freeKnc)) return false;

            makerFunds[maker]['knc'] = makerFunds[maker]['knc'].sub(amount);

            break;

        default:
            log("unknown fund type: " + fund)
            return false;
            break;
    }

    return true;
}

function utils_checkHasEnoughStake(maker, addedWeiAmount) {
    if(makerFunds[maker] == undefined || makerFunds[maker]['knc'] == undefined) return false;

    if(makerTotalWeiInOrders[maker] == undefined) makerTotalWeiInOrders[maker] = new BigNumber(0);
    expectedWei = (makerTotalWeiInOrders[maker]).add(addedWeiAmount);

    let stake = utils_calcKncStake(expectedWei);
    if ((makerFunds[maker]['knc']).lt(stake)) return false;

    return true;
}

function utils_getUnlockedKnc(maker) {
    let stake = utils_calcKncStake(makerTotalWeiInOrders[maker]);
    let freeKnc = ((makerFunds[maker]['knc']).sub(stake));
    return freeKnc;
}

function utils_checkHasEnoughTokens(maker, addedWeiAmount) {
    if(makerFunds[maker] == undefined || makerFunds[maker]['token'] == undefined) {
        log("token for maker not defined")
        return false;
    }
    if ((makerFunds[maker]['token']).lt(addedWeiAmount)) {
        log("maker token: " + (makerFunds[maker]['token']));
        log("submit src " + addedWeiAmount)
        return false;
    }
    return true;
}

function utils_checkHasEnoughEther(maker, addedWeiAmount) {
    if(makerFunds[maker] == undefined || makerFunds[maker]['ether'] == undefined) {
        log("ether for maker not defined")
        return false;
    }
    if ((makerFunds[maker]['ether']).lt(addedWeiAmount)) {
        log("maker ether: " + (makerFunds[maker]['ether']));
        log("submit src " + addedWeiAmount)
        return false;
    }

    return true;
}

function utils_addStake(maker, addedWeiAmount) {
    if(makerTotalWeiInOrders[maker] == undefined) makerTotalWeiInOrders = new BigNumber(addedWeiAmount);
    else makerTotalWeiInOrders[maker] = (makerTotalWeiInOrders[maker]).add(addedWeiAmount);
}

function utils_removeStakeAndBurn(maker, removedWeiAmount, takenWeiAmount) {
    makerTotalWeiInOrders[maker] = (makerTotalWeiInOrders[maker]).sub(removedWeiAmount)

    let burn = utils_calcBurnAmount(takenWeiAmount);

    makerFunds[maker]['knc'] = (makerFunds[maker]['knc']).sub(burn);
}

function utils_calcBurnAmount(weiAmount) {
    return (weiAmount.mul(burnFeeBps).mul(kncPerEthBaseRatePrecision).div(PRECISION.mul(BPS))).floor();
}

function utils_calcKncStake(weiAmount) {
    let burn = utils_calcBurnAmount(weiAmount);
    return burn.mul(burn_to_stake_factor);
}

function utils_isValidRate(isEthToToken, srcQty, dstQty) {
    let decimalsSrc = isEthToToken ? 18 : tokenDecimals;
    let decimalsDst = isEthToToken ? tokenDecimals : 18;
    let rate = calcRateFromQty(srcQty, dstQty, decimalsSrc, decimalsDst);

    if(MAX_RATE.gt(rate)) return true;
    return false;
}

function utils_isValidQtys(srcQty, dstQty) {
    if(MAX_QTY.gt(srcQty) && MAX_QTY.gt(dstQty)) return true;
    return false;
}

//function reserve_submitEthToTokenWHint (maker, srcAmount, dstAmount, hint) {
//
//}
//
//function reserve_submitTokenToEthWHint (maker, srcAmount, dstAmount, hint) {
//
//}


// orderList
////////////

const HEAD_ID = 2;
const TAIL_ID = 1;
let isListInit = false;

function list_init(list){
    list[HEAD_ID] = {};
    list[HEAD_ID]['prev'] = HEAD_ID;
    list[HEAD_ID]['next'] = TAIL_ID;
    list[HEAD_ID]['maker'] = '0x0';
    list[HEAD_ID]['srcQty'] = 10 ** 22;
    list[HEAD_ID]['dstQty'] = 1;

    isListInit = true;
}

function list_getFirstOrderId(list) {
    return list[HEAD_ID]['next'];
}

function list_getNextOrderId(list, orderId) {
    return list[orderId]['next'];
}

function list_getOrder(list, orderId) {
    return list[orderId];
}

function list_addOrder(list, newOrderId, maker, srcAmount, dstAmount) {

    if(newOrderId == TAIL_ID || newOrderId == HEAD_ID) {
        log("illegal order ID: " + newOrderId + " can't set as head ore tail: " + HEAD_ID + " " + TAIL_ID);
    }
    srcAmount = new BigNumber(srcAmount);
    dstAmount = new BigNumber(dstAmount);
    let prevId = list_findPrevOrderId(list, srcAmount, dstAmount);
//    log("new orderId: " + newOrderId);
//    log("prevId found: " + prevId + " next of prev: " + list[prevId]['next']);

    list_insertOrder(list, newOrderId, prevId, maker, srcAmount, dstAmount);
}

function list_insertOrder(list, newOrderId, prevId, maker, srcAmount, dstAmount) {

    list[newOrderId] = {};
    list[newOrderId]['maker'] = maker;
    list[newOrderId]['prev'] = prevId;
    list[newOrderId]['next'] = list[prevId]['next'];
    list[newOrderId]['srcQty'] = srcAmount;
    list[newOrderId]['dstQty'] = dstAmount;

    let nextId = list[prevId]['next'];
    list[prevId]['next'] = newOrderId;

    if (nextId != TAIL_ID) {
        list[nextId]['prev'] = newOrderId;
    }
}

function list_findPrevOrderId(list, srcAmount, dstAmount) {
    let thisOrderId = HEAD_ID;
    let checkOrderId;

    while(true) {
        checkOrderId = list[thisOrderId]['next'];
        if (checkOrderId == TAIL_ID) {
            return thisOrderId;
        }

        if (list_compareOrders(list, checkOrderId, srcAmount, dstAmount) == 1) {
            return thisOrderId;
        }

        thisOrderId = checkOrderId;
    }
}

function list_compareOrders(list, checkOrderId, srcAmount, dstAmount) {
    let checkSrc = list[checkOrderId]['srcQty'];
    let checkDst = list[checkOrderId]['dstQty'];
    let k1 = srcAmount.mul(checkDst);
    let k2 = checkSrc.mul(dstAmount);

    if(k1.gt(k2)) {
        return 1;
    }
    if(k1.lt(k2)) {
        return -1;
    }

    return 0; // equal
}

function list_updateOrder(list, orderId, maker, srcAmount, dstAmount) {
    if(list[orderId] == undefined) return false;
    if(list[orderId]['maker'] != maker) return false;
//    log("update order "+ orderId + " new src "+ srcAmount + " nex dst" + dstAmount)
    list_printOrder(list, orderId);

    list_removeOrder(list, orderId);

    list_addOrder(list, orderId, maker, srcAmount, dstAmount);
}

module.exports.testList = function testList() {
    let list = [];
    list_init(list);
    let maker1 = '0x123';
    let maker2 = '0x256';

    list_addOrder(list, 3, maker1, 200, 300);
    list_addOrder(list, 4, maker2, 300, 400);
    list_addOrder(list, 5, maker1, 400, 500);
    list_addOrder(list, 6, maker1, 900, 500);
    list_addOrder(list, 7, maker2, 4500, 500);

    list_showList(list);

    list_removeOrder(list, 5);
    list_removeOrder(list, 7);

    log("remove 5, 7")
    list_showList(list);

    list_addOrder(list, 7, maker2, 4500, 500);

    list_updateOrder(list, 6, maker1, 3900, 200)

    log("add 7 update 6")
    list_showList(list);
}

function list_removeOrder(list, orderId) {
    let prevId = list[orderId]['prev'];
    let nextId = list[orderId]['next'];

//    log("remove order. next " + nextId + " preve " + prevId);

    list[prevId]['next'] = nextId;

    list[orderId]['maker'] = '0x00000';
    if(nextId == TAIL_ID) return true;

    list[nextId]['prev'] = prevId;
    return true;
}

function list_getBestOrderId(list){
    let bestRate = 0;
    let bestOrderId = 0;
    for(let orderId in list) {

        if(list_isBetterRate(list, orderId, bestOrderId)) {
            bestOrderId = orderId;
        }
    }

    return bestOrderId;
}

function list_printOrder(list, orderId) {
    log("Order: " + orderId + " maker " + list[orderId]['maker'] + " next: " + list[orderId]['next'] +
        " prev: " + list[orderId]['prev'] + "rate: " +  list[orderId]['srcQty'].div(list[orderId]['dstQty']).mul(1000).floor() +
         " src: " + list[orderId]['srcQty'] + " dst: " + list[orderId]['dstQty']);
}

function list_showList(list) {
    let orderId = list_getFirstOrderId(list);

    let blockRecursiveList = 60;

    while((orderId != TAIL_ID > 0) && (blockRecursiveList-- > 0)) {
        list_printOrder(list, orderId)
        orderId = list_getNextOrderId(list, orderId);
    }
}

function list_getList(list) {
    let idList = [];
    let orderId = list_getFirstOrderId(list);

    while(orderId != TAIL_ID > 0) {
        idList.push(orderId);
        orderId = list_getNextOrderId(list, orderId);
    }

    return idList;
}

function calcRateFromQty(srcAmount, dstAmount, srcDecimals, dstDecimals) {
    if (dstDecimals >= srcDecimals) {
        let decimals = new BigNumber(10 ** (dstDecimals - srcDecimals));
//        return ((PRECISION.mul(dstAmount)).div(decimals.mul(srcAmount))).floor();
        return ((PRECISION.mul(dstAmount)).div((srcAmount))).floor();
    } else {
        let decimals = new BigNumber(10 ** (srcDecimals - dstDecimals));
        return ((PRECISION.mul(dstAmount).mul(decimals)).div(srcAmount)).floor();
    }
}

function log(str) {
    console.log(str);
}
