
const BigNumber = require('bignumber.js');
const web3 = require("web3");

//next operation options.
const DEPOSIT = 'deposit';
const TRADE = 'trade';
const SUBMIT_ORDER = 'submit';
const UPDATE_ORDER = 'update';
const CANCEL_ORDER = 'cancel';
const WITHDRAW_ORDER = 'withdraw';

const ETHER = 'ether';
const KNC = 'token';
const TOKEN = 'knc';

let makerFunds = [];
let makerOrders = [];
let takerFunds = [];
let numMakers = 0;
let numTakers = 0;
let maxOrderId;
let NUM_ORDERS = 32;
let nextFreeOrder = 3;

module.exports.nextOperation = function gen_getNextOperation() {
    let rand = (web3.utils.randomHex(3)) % 71;

    if (rand < 3) return WITHDRAW_ORDER;
    if (rand < 36) return SUBMIT_ORDER;
    if (rand < 53) return UPDATE_ORDER;
    if (rand < 63) return CANCEL_ORDER;
    return TRADE;
}

module.exports.updateTakerFunds = function gen_updateTakerFunds(taker, ethAmount, tokenAmount) {
    if(takerFunds[taker] == undefined) {
        takerFunds[taker] = {};
        numTakers++;
    }

    takerFunds[taker][TOKEN] = tokenAmount;
    takerFunds[taker][ETHER] = ethAmount;
}

module.exports.updateMakerFunds = function gen_updateMakerFunds(maker, ethAmount, kncAmount, tokenAmount) {
    if(makerFunds[maker] == undefined) {
        makerFunds[maker] = {};
        makerOrders[maker] = {};
        numMakers++;
    }

    makerFunds[maker][TOKEN] = tokenAmount;
    makerFunds[maker][KNC] = kncAmount;
    makerFunds[maker][ETHER] = ethAmount;

    let orders = [];
    for(let i = 0; i < NUM_ORDERS; i++) {
        orders.push(nextFreeOrder++)
    }
    let rand = web3.utils.randomHex(5);
    orders.push(rand % nextFreeOrder);
    orders.push(rand % 5);
    orders.push(rand * 17 % nextFreeOrder / 2);
    orders.push(rand * 17 % nextFreeOrder * 2);

    makerOrders[maker] = orders;
}

module.exports.getNextSubmit = function gen_getNextSubmit() {
    let submit = {};

    let rand = web3.utils.randomHex(3);

    let makerId = (rand % numMakers);
    let theMaker;

    for(let maker in makerFunds) {
        if(makerId-- == 0) {theMaker = maker; break;}
    }

    submit['maker'] = theMaker;

    let isEthToToken = (((rand * 7) % 11) > 6) ? false : true;
    submit['isEthToToken'] = isEthToToken;

    let baseValSrc;
    let baseValDst;

    if(isEthToToken) {
        baseValSrc = makerFunds[theMaker][ETHER].mul(2).div(21).floor();
        baseValDst = makerFunds[theMaker][TOKEN].mul(2).div(23).floor();
    } else {
        baseValSrc = makerFunds[theMaker][TOKEN].mul(2).div(33).floor();
        baseValDst = makerFunds[theMaker][ETHER].mul(2).div(23).floor();
    }

    rand = web3.utils.randomHex(13);
    submit['src'] = new BigNumber((rand % baseValSrc).toString());
    submit['dst'] = new BigNumber((rand % baseValDst).toString());

    if(rand % 12 < 2) {
        submit['hint'] = -1;
    } else if(rand % 12 < 6) {
        submit['hint'] = 0;
    } else {
        submit['hint'] = rand % nextFreeOrder;
    }

    return submit;
}

module.exports.getNextTrade = function gen_getNextTrade() {
    let trade = {};

    let rand = web3.utils.randomHex(3);
    let takerId = (rand % numTakers);
    let theTaker;

    for(let taker in takerFunds) {
        if(takerId-- == 0) {theTaker = taker; break;}
    }

    trade['taker'] = theTaker;

    let isEthToToken = ((rand % 11) > 5) ? false : true;
    trade['isEthToToken'] = isEthToToken;

    let baseValSrc;

    if(isEthToToken) {
        baseValSrc = takerFunds[theTaker][ETHER].div(45).floor();
    } else {
        baseValSrc = takerFunds[theTaker][TOKEN].div(37).floor();
    }

    rand = web3.utils.randomHex(12)
    trade['src'] = (new BigNumber((rand % baseValSrc).toString())).floor();

    return trade;
}


module.exports.getNextUpdate = function gen_getNextUpdate() {
    let update = {};

    let rand = web3.utils.randomHex(7);

    let makerId = (rand % numMakers);
    let theMaker;

    for(let maker in makerFunds) {
        if(makerId-- == 0) {theMaker = maker; break;}
    }

    update['maker'] = theMaker;

    let isEthToToken = (((rand * 7) % 11) > 5) ? false : true;
    update['isEthToToken'] = isEthToToken;

    let orderInList = rand % 36;
    update['orderId'] = makerOrders[theMaker][orderInList];

    let baseValSrc;
    let baseValDst;

    if(isEthToToken) {
        baseValSrc = makerFunds[theMaker][ETHER].mul(3).div(18).floor();
        baseValDst = makerFunds[theMaker][TOKEN].mul(3).div(27).floor();
    } else {
        baseValSrc = makerFunds[theMaker][TOKEN].mul(3).div(17).floor();
        baseValDst = makerFunds[theMaker][ETHER].mul(3).div(24).floor();
    }

    rand = web3.utils.randomHex(13);
    update['src'] = new BigNumber((rand % baseValSrc).toString());
    update['dst'] = new BigNumber((rand % baseValDst).toString());

    if(rand % 12 < 2) {
        update['hint'] = -1;
    } else if(rand % 12 < 6) {
        update['hint'] = 0;
    } else {
        update['hint'] = rand % nextFreeOrder;
    }
    return update;
}

module.exports.getNextCancel = function gen_getNextCancel() {
    let cancel = {};

    let rand = web3.utils.randomHex(7);

    let makerId = (rand % numMakers);
    let theMaker;

    for(let maker in makerFunds) {
        if(makerId-- == 0) {theMaker = maker; break;}
    }

    cancel['maker'] = theMaker;

    let isEthToToken = (((rand * 7) % 11) > 5) ? false : true;
    cancel['isEthToToken'] = isEthToToken;

    let orderInList = rand % 36;
    cancel['orderId'] = makerOrders[theMaker][orderInList];

    return cancel;
}

module.exports.getNextWithdraw = function get_getNextWithdraw() {
    let withdraw = {};

    let rand = web3.utils.randomHex(21);

    let makerId = (rand % numMakers);
    let theMaker;

    for(let maker in makerFunds) {
        if(makerId-- == 0) {theMaker = maker; break;}
    }

    withdraw['maker'] = theMaker;

    let withdrawOperation = rand % 12;
    if(withdrawOperation < 4) {
        withdraw['fund'] = 'token';
    } else if(withdrawOperation < 8) {
        withdraw['fund'] = 'knc';
    } else {
        withdraw['fund'] = 'ether';
    }

    let totalFunds = makerFunds[theMaker][withdraw['fund']];

    totalFunds = totalFunds.div(8).floor();
    totalFunds = totalFunds.div(10 ** 5).mul(10 ** 5);

//    withdraw['amount'] = rand % totalFunds;
    withdraw['amount'] = (new BigNumber((rand % totalFunds).toString())).floor();

    return withdraw;
}


function log(str) {
    console.log(str);
}

