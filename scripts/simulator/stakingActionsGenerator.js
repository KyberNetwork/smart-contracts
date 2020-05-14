const BN = web3.utils.BN;
const BASE = 100; // base for weighted operations
const { zeroBN, zeroAddress } = require("../../test/helper.js");
const { genRandomSeed, genRandomBN } = require("../randomNumberGenerator.js");

//next operation options.
const DEPOSIT = 'deposit';
const DELEGATE = 'delegate';
const WITHDRAW = 'withdraw';
const NO_ACTION = 'null';

module.exports = { DEPOSIT, DELEGATE, WITHDRAW, NO_ACTION }

module.exports.genNextOp = function genNextOp(loop, numRuns) {
    let rand = genRandomSeed(BASE);
    let depositWeight;
    let withdrawWeight;
    let delegateWeight;
    // weighted operations
    // at the start, should have more deposits, then taper off
    if (loop / numRuns < 0.003) {
        depositWeight = 70;
        withdrawWeight = 75;
        delegateWeight = 90;
    } else {
        depositWeight = 30;
        withdrawWeight = 60;
        delegateWeight = 90;
    }

    if (rand < depositWeight) return DEPOSIT;
    if (rand < withdrawWeight) return WITHDRAW;
    if (rand < delegateWeight) return DELEGATE;
    return NO_ACTION;
}

// Option 1: amount smaller than staker's KNC balance
// Option 2: zero deposit
// Option 3: amount larger than staker's KNC balance
module.exports.genDeposit = async function genDeposit(kncToken, stakers) {
    let result = {
        'staker': '',
        'amount': 0,
        'msg': '',
        'revertMsg': '',
        'isValid': false
    }

    let rand = genRandomSeed(stakers.length);
    result.staker = stakers[rand];
    let tokenBal = (await kncToken.balanceOf(result.staker));
    rand = genRandomSeed(BASE);
    if (rand <= 96) {
        result.amount = genRandomBN(new BN(1), tokenBal);
        result.msg = 'valid deposit';
        result.isValid = true;
    } else if (rand <= 98) {
        result.amount = zeroBN;
        result.msg = 'zero deposit';
        result.isValid = false;
        result.revertMsg = 'deposit: amount is 0'
    } else {
        result.amount = genRandomBN(tokenBal.add(new BN(1)), tokenBal.mul(new BN(2)));
        result.msg = 'invalid deposit';
        result.isValid = false;
        result.revertMsg = ''
    }
    return result;
}

// Option 1: Delegate to another address generated by buidler / ganache
// Option 2: Delegate to non-staker
// Option 3: Delegate back to self (un-delegate)
module.exports.genDelegate = async function genDelegate(stakers) {
    let result = {
        'staker': '',
        'dAddress': '',
        'msg': '',
    }

    let rand = genRandomSeed(stakers.length);
    result.staker = stakers[rand];
    // by default, set to self (un-delegate)
    result.dAddress = result.staker;
    result.msg = 'delegate to self (un-delegate)';
    rand = genRandomSeed(BASE);
    if (rand <= 60) {
        while (result.staker == result.dAddress) {
            let rand2 = genRandomSeed(stakers.length);
            result.dAddress = stakers[rand2];
        }
        result.msg = 'delegate to another staker';
    } else if (rand <= 65) {
        let randomPrivateKey = web3.utils.sha3("Katalyst gonna be dope" + rand);
        result.dAddress = (web3.eth.accounts.privateKeyToAccount(randomPrivateKey)).address;
        result.msg = 'delegate to non-staker';
    } else if (rand <= 66) {
        result.dAddress = zeroAddress;
        result.msg = 'delegate to nullAddress';
    }   
    return result;
}

// Option 1: Withdraw amount less than deposit amt made so far
// Option 2: Withdraw amount greater than deposit made so far
// Option 3: Withdraw full stake
// Option 4: Withdraw amount greater than full stake amount
module.exports.genWithdraw = async function genWithdraw(stakingContract, stakers) {
    let result = {
        'staker': '',
        'amount': 0,
        'msg': '',
        'revertMsg': '',
        isValid: false
    }

    let rand = genRandomSeed(stakers.length);
    result.staker = stakers[rand];
    rand = genRandomSeed(BASE);
    let latestStake = await stakingContract.getLatestStakeBalance(result.staker);
    let curEpochStake = await stakingContract.getStake(result.staker, await stakingContract.getCurrentEpochNumber());
    let depositMadeInCurEpoch = latestStake.sub(curEpochStake);
    if (rand <= 44) {
        result.amount = genRandomBN(zeroBN, depositMadeInCurEpoch);
        if (result.amount.eq(zeroBN)) {
            result.msg = 'zero withdraw';
            result.isValid = false;
            result.revertMsg = 'withdraw: amount is 0';
        } else {
            result.msg = 'withdrawal <= deposit amt in current epoch';
            result.isValid = true;
        }
    } else if (rand <= 88) {
        result.amount = genRandomBN(depositMadeInCurEpoch, latestStake);
        if (result.amount.eq(zeroBN)) {
            result.msg = 'zero withdraw';
            result.isValid = false;
            result.revertMsg = 'withdraw: amount is 0';
        } else {
            result.msg = 'withdrawal > deposit amt in current epoch';
            result.isValid = true;
        }
    } else if (rand <= 95) {
        result.amount = latestStake;
        if (result.amount.eq(zeroBN)) {
            result.msg = 'zero withdraw';
            result.isValid = false;
            result.revertMsg = 'withdraw: amount is 0';
        } else {
            result.msg = 'withdraw full stake';
            result.isValid = true;
        }
    } else {
        result.amount = genRandomBN(latestStake, latestStake.mul(new BN(2)));
        result.isValid = false;
        if (result.amount.eq(zeroBN)) {
            result.msg = 'zero withdraw';
            result.revertMsg = 'withdraw: amount is 0';
        } else {
            result.msg = 'withdrawal > stake';
            result.revertMsg = 'withdraw: latest amount staked < withdrawal amount';
        }
    }
    return result;
}

module.exports.genNoAction = async function genNoAction(stakers) {
    let result = {
        'staker': ''
    }

    let rand = genRandomSeed(stakers.length);
    result.staker = stakers[rand];
    return result;
}
