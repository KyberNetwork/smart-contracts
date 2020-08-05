const Helper = require("../../../helper.js");
const BN = web3.utils.BN;
const { DEPOSIT, DELEGATE, WITHDRAW, NO_ACTION } = require("./stakingActionsGenerator.js");
const { expectRevert } = require('@openzeppelin/test-helpers');
const StakeGenerator = require("./stakingActionsGenerator.js");

const winston = require("winston");
const logger = winston.createLogger({
    format: winston.format.combine(winston.format.colorize(), winston.format.splat(), winston.format.simple()),
    transports: [
      new winston.transports.Console({ level: 'info' }),
      new winston.transports.File({ filename: 'fuzz_staking.log', level: 'debug' })
    ]
});

//global variables
//////////////////
const { zeroBN, zeroAddress } = require("../../../helper.js");
const progressIterations = 20;

// for keeping score
let depositRuns = 0;
let delegateRuns = 0;
let withdrawRuns = 0;
let noActionRuns = 0;

// use this for Dao simulator
module.exports.genPerformStakingAction = async function(
    kyberStaking, NUM_RUNS, currentLoopNum, kncToken, stakers, epochPeriod
) {
    let operation = StakeGenerator.genNextOp(currentLoopNum, NUM_RUNS);
    switch(operation) {
        case DEPOSIT:
            result = await StakeGenerator.genDeposit(kncToken, stakers);
            result.dAddress = await kyberStaking.getLatestRepresentative(result.staker);
            logger.debug(result.msg);
            logger.debug(`Deposit: staker ${result.staker}, amount: ${result.amount}`);
            await executeDeposit(kyberStaking, result, epochPeriod);
            break;
        case DELEGATE:
            result = await StakeGenerator.genDelegate(stakers);
            logger.debug(result.msg);
            logger.debug(`Delegate: staker ${result.staker}, address: ${result.dAddress}`);
            await executeDelegate(kyberStaking, result, epochPeriod);
            break;
        case WITHDRAW:
            result = await StakeGenerator.genWithdraw(kyberStaking, stakers);
            result.dAddress = await kyberStaking.getLatestRepresentative(result.staker);
            logger.debug(result.msg);
            logger.debug(`Withdrawal: staker ${result.staker}, amount: ${result.amount}`);
            await executeWithdraw(kyberStaking, result, epochPeriod);
        case NO_ACTION:
            logger.debug("no action in epoch period...");
            await executeNoAction(epochPeriod);
            break;
        default:
            logger.debug("unexpected operation: " + operation);
            break;
    }
}

module.exports.doFuzzStakeTests = async function(
    kyberStaking, NUM_RUNS, kncToken, stakers, epochPeriod
) {
    let result;
    let validity;
    logger.info(`Running staking fuzz tests with ${NUM_RUNS} loops`);
    for(let loop = 0; loop < NUM_RUNS; loop++) {
        if (loop % progressIterations == 0) {
            process.stdout.write(`${(loop / NUM_RUNS * 100).toFixed(1)}% complete\n`);
        }

        let operation = StakeGenerator.genNextOp(loop, NUM_RUNS);
        switch(operation) {
            case DEPOSIT:
                result = await StakeGenerator.genDeposit(kncToken, stakers);
                result.dAddress = await kyberStaking.getLatestRepresentative(result.staker);
                logger.debug(result.msg);
                logger.debug(`Deposit: staker ${result.staker}, amount: ${result.amount}`);
                validity = await executeAndVerifyDepositInvariants(kyberStaking, result, epochPeriod);
                depositRuns = logResult(validity, depositRuns);
                break;

            case DELEGATE:
                result = await StakeGenerator.genDelegate(stakers);
                logger.debug(result.msg);
                logger.debug(`Delegate: staker ${result.staker}, address: ${result.dAddress}`);
                validity = await executeAndVerifyDelegateInvariants(kyberStaking, result, epochPeriod);
                delegateRuns = logResult(validity, delegateRuns);
                break;

            case WITHDRAW:
                result = await StakeGenerator.genWithdraw(kyberStaking, stakers);
                result.dAddress = await kyberStaking.getLatestRepresentative(result.staker);
                logger.debug(result.msg);
                logger.debug(`Withdrawal: staker ${result.staker}, amount: ${result.amount}`);
                validity = await executeAndVerifyWithdrawInvariants(kyberStaking, result, epochPeriod);
                withdrawRuns = logResult(validity, withdrawRuns);
                break;

            case NO_ACTION:
                result = await StakeGenerator.genNoAction(stakers);
                result.dAddress = await kyberStaking.getLatestRepresentative(result.staker);
                logger.debug("no action in epoch period...");
                validity = await executeAndVerifyNoActionInvariants(kyberStaking, result, epochPeriod);
                noActionRuns = logResult(validity, noActionRuns);
                break;
            default:
                logger.debug("unexpected operation: " + operation);
                validity = false;
                break;
        }

        if (!validity) break;
    }

    logger.info(`--- SUMMARY RESULTS AFTER ${NUM_RUNS} LOOPS ---`);
    logger.info(`Deposit runs: ${depositRuns}`);
    logger.info(`Delegate runs: ${delegateRuns}`);
    logger.info(`Withdraw runs: ${withdrawRuns}`);
    logger.info(`No action runs: ${noActionRuns}`);
}

async function executeAndVerifyDepositInvariants(kyberStaking, result, epochPeriod) {
    let initState = await getState(kyberStaking, result, null);
    
    // do deposit
    await executeDeposit(kyberStaking, result, epochPeriod);

    let newState = await getState(kyberStaking, result, initState.oldRepAddress);
    let isValid = await verifyDepositChanges(initState, newState, result);
    return {
        isValid: isValid,
        states: {'initState': initState, 'newState': newState}
    }
}

async function executeDeposit(kyberStaking, result, epochPeriod) {
    let currentBlockTime = await Helper.getCurrentBlockTime();
    await Helper.setNextBlockTimestamp(currentBlockTime + Helper.getRandomInt(5, epochPeriod.toNumber() / 5));
    if (result.isValid) {
        try {
            await kyberStaking.deposit(result.amount, {from: result.staker});
        } catch(e) {
            logger.debug('Valid deposit, but failed');
            logger.debug(e);
            return;
        }
    } else {
        if (result.revertMsg != '') {
            await expectRevert(
                kyberStaking.deposit(result.amount, {from: result.staker}),
                result.revertMsg
            );
        } else {
            await expectRevert.unspecified(
                kyberStaking.deposit(result.amount, {from: result.staker})
            );
        }
    }
}

async function executeAndVerifyDelegateInvariants(kyberStaking, result, epochPeriod) {
    let oldRepAddress = await kyberStaking.getLatestRepresentative(result.staker);
    let initState = await getState(kyberStaking, result, oldRepAddress);
    
    // execute delegate
    await executeDelegate(kyberStaking, result, epochPeriod);

    let newState = await getState(kyberStaking, result, oldRepAddress);
    let isValid = await verifyDelegateChanges(initState, newState, result);
    return {
        isValid: isValid,
        states: {'initState': initState, 'newState': newState}
    }
}

async function executeDelegate(kyberStaking, result, epochPeriod) {
    let currentBlockTime = await Helper.getCurrentBlockTime();
    await Helper.setNextBlockTimestamp(currentBlockTime + Helper.getRandomInt(5, epochPeriod.toNumber() / 5));

    // do delegate
    if (result.dAddress == zeroAddress) {
        await expectRevert(
            kyberStaking.delegate(result.dAddress, {from: result.staker}),
            "delegate: representative 0"
        );
    } else {
        await kyberStaking.delegate(result.dAddress, {from: result.staker});
    }
}

async function executeAndVerifyWithdrawInvariants(kyberStaking, result, epochPeriod) {
    let oldRepAddress = await kyberStaking.getRepresentative(result.staker, await kyberStaking.getCurrentEpochNumber());
    let initState = await getState(kyberStaking, result, oldRepAddress);

    await executeWithdraw(kyberStaking, result, epochPeriod);

    let newState = await getState(kyberStaking, result, initState.oldRepAddress);
    let isValid = await verifyWithdrawChanges(initState, newState, result);
    return {
        isValid: isValid,
        states: {'initState': initState, 'newState': newState}
    }
}

async function executeWithdraw(kyberStaking, result, epochPeriod) {
    let currentBlockTime = await Helper.getCurrentBlockTime();
    await Helper.setNextBlockTimestamp(currentBlockTime + Helper.getRandomInt(5, epochPeriod.toNumber() / 5));
    if (result.isValid) {
        try {
            await kyberStaking.withdraw(result.amount, {from: result.staker});
        } catch(e) {
            logger.debug('Valid withdrawal, but failed');
            logger.debug(e);
        }
    } else {
        await expectRevert(
            kyberStaking.withdraw(result.amount, {from: result.staker}),
            result.revertMsg
        );
    }
}

async function executeAndVerifyNoActionInvariants(kyberStaking, result, epochPeriod) {
    let initState = await getState(kyberStaking, result, null);

    await executeNoAction(epochPeriod);

    let newState = await getState(kyberStaking, result, initState.oldRepAddress);
    return {
        isValid: true,
        states: {'initState': initState, 'newState': newState}
    }
}

async function executeNoAction(epochPeriod) {
    // Advance time by a bit
    let currentBlockTime = await Helper.getCurrentBlockTime();
    await Helper.mineNewBlockAt(
        currentBlockTime + Helper.getRandomInt(10, epochPeriod.toNumber())
    );
}

async function getState(kyberStaking, result, oldRepAddress) {
    let res = {
        'staker': {},
        'oldRep': {},
        'newRep': {}
    };
    let currEpochNum = await kyberStaking.getCurrentEpochNumber();
    res.epochNum = currEpochNum;
    let nextEpochNum = currEpochNum.add(new BN(1));;
    
    res.staker.dataCurEpoch = await getStakerDataForEpoch(kyberStaking, result.staker, currEpochNum);
    res.oldRepAddress = (oldRepAddress == undefined) ?
        (await kyberStaking.getRepresentative(result.staker, currEpochNum)) :
        oldRepAddress;
    res.newRepAddress = result.dAddress;

    res.oldRep.dataCurEpoch = await getStakerDataForEpoch(kyberStaking, res.oldRepAddress, currEpochNum);
    res.newRep.dataCurEpoch = await getStakerDataForEpoch(kyberStaking, res.newRepAddress, currEpochNum);

    res.staker.dataNextEpoch = await getStakerDataForEpoch(kyberStaking, result.staker, nextEpochNum);
    res.oldRep.dataNextEpoch = await getStakerDataForEpoch(kyberStaking, res.oldRepAddress, nextEpochNum);
    res.newRep.dataNextEpoch = await getStakerDataForEpoch(kyberStaking, res.newRepAddress, nextEpochNum);

    res.staker.latestData = await getLatestStakeData(kyberStaking, result.staker);
    res.oldRep.latestData = await getLatestStakeData(kyberStaking, res.oldRepAddress);
    res.newRep.latestData = await getLatestStakeData(kyberStaking, res.newRepAddress);

    return res;
}

async function getStakerDataForEpoch(kyberStaking, staker, epochNum) {
    let res = await kyberStaking.getStakerData(staker, epochNum);
    res.dStake = res.delegatedStake;
    res.dAddress = res.representative;
    delete res.delegatedStake;
    delete res.representative;
    return res;
}

async function getLatestStakeData(kyberStaking, address) {
    let res = {
        'stake': zeroBN,
        'dStake': zeroBN,
        'dAddress': zeroAddress
    }
    res.stake = await kyberStaking.getLatestStakeBalance(address);
    res.dStake = await kyberStaking.getLatestDelegatedStake(address);
    res.dAddress = await kyberStaking.getLatestRepresentative(address);
    return res;
}

async function verifyDepositChanges(initState, newState, result) {
    // invalid result: need not verify states
    if (!result.isValid) return true;
    let isValid;
    isValid = (await verifyEpochInvariants(DEPOSIT, initState, newState));
    logValidity(isValid, `Deposit: epoch invariants did not hold`);
    if (!isValid) return;

    let depositAmt = zeroBN;

     // Delegate addresses should not change
     isValid = assertSameDelegateAddresses(initState, newState);
     logValidity(isValid, `Deposit: delgate addresses changed`);
     if (!isValid) return;

    // Compare latestData structures
    // staker's deposit should have increased
    depositAmt = newState.staker.latestData.stake.sub(initState.staker.latestData.stake);
    isValid = depositAmt.eq(result.amount);
    logValidity(isValid, `Deposit: staker's latestData stake != deposit amt`);
    if (!isValid) return;

    isValid = newState.staker.latestData.dStake.eq(initState.staker.latestData.dStake);
    logValidity(isValid, `Deposit: staker's latestData dStake changed`);
    if (!isValid) return;

    // Compare nextEpoch changes
    if (initState.epochNum.eq(newState.epochNum)) {
        // Deposit was done in the same epoch
        isValid = assertSameStakerData(newState.staker.latestData, newState.staker.dataNextEpoch);
        logValidity(isValid, `Deposit: staker's latestData != dataNextEpoch`);
        if (!isValid) return;

        // staker's stake should increase for next epoch, other info stays the same
        depositAmt = newState.staker.dataNextEpoch.stake.sub(initState.staker.dataNextEpoch.stake);
        isValid = depositAmt.eq(result.amount);
        logValidity(isValid, `Deposit: staker's dataNextEpoch stake != deposit amt`);
        if (!isValid) return;

        isValid = newState.staker.dataNextEpoch.dStake.eq(initState.staker.dataNextEpoch.dStake);
        logValidity(isValid, `Deposit: staker's dataNextEpoch dStake changed`);
        if (!isValid) return;

        // staker == newRep, should have same info
        if (newState.newRepAddress == result.staker) {
            isValid = assertSameDataStruct(newState.staker, newState.newRep);
            logValidity(isValid, `Deposit: staker != newRep`);
            if (!isValid) return;
        } else if (newState.newRepAddress != result.staker || newState.newRepAddress != zeroAddress) {
            // With delegation: newRep dStake should have increased
            depositAmt = newState.newRep.latestData.dStake.sub(initState.newRep.latestData.dStake);
            isValid = depositAmt.eq(result.amount);
            logValidity(isValid, `Deposit: newRep's latestData dStake increase != deposit amt`);
            if (!isValid) return;

            // stake and dAddress should remain unchanged
            isValid = newState.newRep.latestData.stake.eq(initState.newRep.latestData.stake);
            logValidity(isValid, `Deposit: newRep's latestData stake changed`);
            if (!isValid) return;

            isValid = assertSameStakerData(newState.newRep.latestData, newState.newRep.dataNextEpoch);
            logValidity(isValid, `Deposit: newRep's latestData != dataNextEpoch`);
            if (!isValid) return;
        }
        // delegate has changed
        if (newState.oldRepAddress != newState.newRepAddress) {
            // assert that oldRep stake will not increase for next epoch
            isValid = initState.oldRep.latestData.dStake.eq(newState.oldRep.latestData.dStake);
            logValidity(isValid, `Deposit: oldRep's latestData dStake changed`);
            if (!isValid) return;
            isValid = initState.oldRep.dataNextEpoch.dStake.eq(newState.oldRep.dataNextEpoch.dStake);
            logValidity(isValid, `Deposit: oldRep's dataNextEpoch dStake changed`);
            if (!isValid) return;
        }
    } else {
        // Deposit was done in the next epoch
        isValid = assertSameStakerData(newState.staker.latestData, newState.staker.dataNextEpoch);
        logValidity(isValid, `Deposit: staker's latestData != dataNextEpoch`);
        if (!isValid) return;

        isValid = assertSameStakerData(newState.staker.dataCurEpoch, initState.staker.dataNextEpoch);
        logValidity(isValid, `Deposit: staker's dataNextEpoch (prev epoch) != staker's dataCurEpoch`);
        if (!isValid) return;

        if (newState.newRepAddress == result.staker) {
            isValid = assertSameDataStruct(newState.staker, newState.newRep);
            logValidity(isValid, `Deposit: staker != newRep`);
            if (!isValid) return;
        } else if (newState.newRepAddress != result.staker) {
            // With delegation
            depositAmt = newState.newRep.latestData.dStake.sub(initState.newRep.latestData.dStake);
            isValid = depositAmt.eq(result.amount);
            logValidity(isValid, `Deposit: newRep's latestData dStake change != deposit amt`);
            if (!isValid) return;

            isValid = newState.newRep.latestData.stake.eq(initState.newRep.latestData.stake);
            logValidity(isValid, `Deposit: newRep's latestData stake changed`);
            if (!isValid) return;

            isValid = assertSameStakerData(newState.newRep.latestData, newState.newRep.dataNextEpoch);
            logValidity(isValid, `Deposit: newRep's latestData != dataNextEpoch`);
            if (!isValid) return;

            isValid = assertSameStakerData(initState.oldRep.dataNextEpoch, newState.oldRep.dataCurEpoch);
            logValidity(isValid, `Deposit: oldRep's dataNextEpoch (prev epoch) != dataCurEpoch`);
            if (!isValid) return;

            isValid = assertSameStakerData(initState.newRep.dataNextEpoch, newState.newRep.dataCurEpoch);
            logValidity(isValid, `Deposit: newRep's dataNextEpoch (prev epoch) != dataCurEpoch`);
            if (!isValid) return;
        }

        if (newState.oldRepAddress != newState.newRepAddress) {
            // assert that oldRep stake did not increase this epoch, and will not increase for next epoch
            isValid = initState.oldRep.latestData.dStake.eq(newState.oldRep.latestData.dStake);
            logValidity(isValid, `Deposit: oldRep's latestData dStake changed`);
            if (!isValid) return;

            isValid = initState.oldRep.dataNextEpoch.dStake.eq(newState.oldRep.dataCurEpoch.dStake);
            logValidity(isValid, `Deposit: oldRep's dataCurEpoch dStake changed`);
            if (!isValid) return;
        }
    }
    return isValid;
}

async function verifyDelegateChanges(initState, newState, result) {
    // invalid result: need not verify states
    if (!result.isValid) return true;
    let isValid;
    let stakeAmt;
    isValid = await verifyEpochInvariants(DELEGATE, initState, newState);
    logValidity(isValid, `Delegate: epoch invariants did not hold`);
    if (!isValid) return;

    // Case 1: New delegation
    if (result.dAddress != result.staker && initState.oldRepAddress == result.staker) {
        // oldRep == staker
        isValid = assertSameDataStruct(initState.staker, initState.oldRep);
        logValidity(isValid, `Delegate: initState.staker != initState.oldRep`);
        if (!isValid) return;

        // staker's latestData == dataNextEpoch
        isValid = assertSameStakerData(newState.staker.latestData, newState.staker.dataNextEpoch);
        logValidity(isValid, `Delegate: staker's latestData != dataNextEpoch`);
        if (!isValid) return;

        // newRep's latestData == dataNextEpoch
        isValid = assertSameStakerData(newState.newRep.latestData, newState.newRep.dataNextEpoch);
        logValidity(isValid, `Delegate: newRep's latestData != dataNextEpoch`);
        if (!isValid) return;

        // delegate address should have changed
        isValid = (newState.staker.latestData.dAddress == result.dAddress);
        logValidity(isValid, `Delegate: newRep's latestData dAddress != result.dAddress`);
        if (!isValid) return;

        // if delegate hasn't changed to new one yet (could be delegating to same person)
        if (initState.staker.latestData.dAddress != result.dAddress) {
            // check newRep's dStake increased by staker's stake
            stakeAmt = newState.newRep.latestData.dStake.sub(newState.staker.latestData.stake);
            isValid = stakeAmt.eq(initState.newRep.latestData.dStake);
            logValidity(isValid, `Delegate: newRep's latestData dStake didn't increase by staker's stake amt`);
            if (!isValid) return;
        } else {
            // otherwise, amount should remain the same
            isValid = newState.newRep.latestData.dStake.eq(initState.newRep.latestData.dStake);
            logValidity(isValid, `Delegate: newRep's latestData dStake changed`);
            if (!isValid) return;
        }
    } else if (result.dAddress != result.staker && initState.oldRepAddress != result.staker) {
        // Case 2: Delegating from one pool operator to another
        // oldRep should remain unchanged
        isValid = initState.oldRepAddress == newState.oldRepAddress;
        logValidity(isValid, `Delegate: oldRepAddress changed`);
        if (!isValid) return;

        // staker's, oldRep's and newRep's latestData == dataNextEpoch
        isValid = assertSameStakerData(newState.staker.latestData, newState.staker.dataNextEpoch);
        logValidity(isValid, `Delegate: staker latestData != dataNextEpoch`);
        if (!isValid) return;
        isValid = assertSameStakerData(newState.oldRep.latestData, newState.oldRep.dataNextEpoch);
        logValidity(isValid, `Delegate: oldRep latestData != dataNextEpoch`);
        if (!isValid) return;
        isValid = assertSameStakerData(newState.newRep.latestData, newState.newRep.dataNextEpoch);
        logValidity(isValid, `Delegate: newRep latestData != dataNextEpoch`);
        if (!isValid) return;

        // delegate address should have changed
        isValid = (newState.staker.latestData.dAddress == result.dAddress);
        logValidity(isValid, `Delegate: staker's latestData dAddress != result.dAddress`);
        if (!isValid) return;

        isValid = (newState.newRepAddress == result.dAddress);
        logValidity(isValid, `Delegate: newRepAddress != result.dAddress`);
        if (!isValid) return;

        // check that staker's stake and dStake remains unchanged
        isValid = newState.staker.latestData.stake.eq(initState.staker.latestData.stake);
        logValidity(isValid, `Delegate: staker's latestData stake changed`);
        if (!isValid) return;

        isValid = newState.staker.latestData.dStake.eq(initState.staker.latestData.dStake);
        logValidity(isValid, `Delegate: staker's latestData dStake changed`);
        if (!isValid) return;

        // if calling delegate with same address as oldRep 
        if (initState.oldRepAddress == result.dAddress) {
            // address did not change at all
            if (initState.staker.latestData.dAddress == initState.oldRepAddress) {
                // dStake should remain the same
                isValid = newState.oldRep.latestData.dStake.eq(initState.oldRep.latestData.dStake);
                logValidity(isValid, `Delegate: oldRep's latestData dStake changed`);
                if (!isValid) return;
            } else {
                // delegate to someone else, but delegating back to same pool master
                stakeAmt = newState.oldRep.latestData.dStake.sub(initState.oldRep.latestData.dStake);
                isValid = stakeAmt.eq(newState.staker.latestData.stake);
                logValidity(isValid, `Delegate: oldRep's latestData dStake did not increase by staker's stake amt`);
                if (!isValid) return;
            }
        } else {
            // check oldRep stake decreased for latestData
            stakeAmt = initState.oldRep.latestData.dStake.sub(newState.oldRep.latestData.dStake);
            isValid = stakeAmt.eq(newState.staker.latestData.stake);
            logValidity(isValid, `Delegate: oldRep's latestData dStake did not increase by staker's stake amt`);
            if (!isValid) return;

            // check newRep stake increased
            stakeAmt = newState.newRep.latestData.dStake.sub(initState.newRep.latestData.dStake);
            isValid = stakeAmt.eq(newState.staker.latestData.stake);
            logValidity(isValid, `Delegate: newRep's latestData dStake did not increase by staker's stake amt`);
            if (!isValid) return;

            // oldRep and newRep dStake should remain unchanged for current epoch
            if (initState.epochNum.eq(newState.epochNum)) {
                isValid = initState.oldRep.dataCurEpoch.dStake.eq(newState.oldRep.dataCurEpoch.dStake);
                logValidity(isValid, `Delegate: oldRep's dataCurEpoch dStake changed`);
                if (!isValid) return;

                isValid = initState.newRep.dataCurEpoch.dStake.eq(newState.newRep.dataCurEpoch.dStake);
                logValidity(isValid, `Delegate: newRep's dataCurEpoch dStake changed`);
                if (!isValid) return;
            } else {
                isValid = initState.oldRep.dataNextEpoch.dStake.eq(newState.oldRep.dataCurEpoch.dStake);
                logValidity(isValid, `Delegate: oldRep's dataCurEpoch dStake changed`);
                if (!isValid) return;

                isValid = initState.newRep.dataNextEpoch.dStake.eq(newState.newRep.dataCurEpoch.dStake);
                logValidity(isValid, `Delegate: newRep's dataCurEpoch dStake changed`);
                if (!isValid) return;
            }
        }
    } else if (result.dAddress == result.staker) {
        // Case 3: Un-delegation (Delegation back to self)
        // Same as case 2, except that newRep dStake should not increase, but remain unchanged
        // oldRep should remain unchanged
        isValid = (initState.oldRepAddress == newState.oldRepAddress);
        logValidity(isValid, `Delegate: oldRepAddress changed`);
        if (!isValid) return;

        // staker's and oldRep's latestData == dataNextEpoch
        isValid = assertSameStakerData(newState.staker.latestData, newState.staker.dataNextEpoch);
        logValidity(isValid, `Delegate: staker's latestData != dataNextEpoch`);
        if (!isValid) return;

        isValid = assertSameStakerData(newState.oldRep.latestData, newState.oldRep.dataNextEpoch);
        logValidity(isValid, `Delegate: oldRep's latestData != dataNextEpoch`);
        if (!isValid) return;

        // staker == newRep
        isValid = assertSameDataStruct(newState.newRep, newState.staker);
        logValidity(isValid, `Delegate: newRep != staker`);
        if (!isValid) return;

        // delegate address should have changed
        isValid = (newState.staker.latestData.dAddress == result.dAddress);
        logValidity(isValid, `Delegate: staker's latestData dAddress != result.dAddress`);
        if (!isValid) return;

        isValid = (newState.newRepAddress == result.dAddress);
        logValidity(isValid, `Delegate: newRepAddress != result.dAddress`);
        if (!isValid) return;

        // check that staker's stake and dStake remains unchanged
        isValid = newState.staker.latestData.stake.eq(initState.staker.latestData.stake);
        logValidity(isValid, `Delegate: staker's latestData stake changed`);
        if (!isValid) return;

        isValid = newState.staker.latestData.dStake.eq(initState.staker.latestData.dStake);
        logValidity(isValid, `Delegate: staker's latestData dStake changed`);
        if (!isValid) return;

        // if calling delegate with same address as oldRep 
        if (initState.oldRepAddress == result.dAddress) {
            // address did not change at all
            if (initState.staker.latestData.dAddress == initState.oldRepAddress) {
                // dStake should remain the same
                isValid = newState.oldRep.latestData.dStake.eq(initState.oldRep.latestData.dStake);
                logValidity(isValid, `Delegate: oldRep's latestData dStake changed`);
                if (!isValid) return;
            } else {
                // delegate to someone else, but delegating back to same pool master
                stakeAmt = newState.oldRep.latestData.dStake.sub(initState.oldRep.latestData.dStake);
                isValid = stakeAmt.eq(newState.staker.latestData.stake);
                logValidity(isValid, `Delegate: oldRep's latestData dStake did not increase`);
                if (!isValid) return;
            }
        } else {
            // check oldRep stake decreased for latestData
            stakeAmt = initState.oldRep.latestData.dStake.sub(newState.oldRep.latestData.dStake);
            isValid = stakeAmt.eq(newState.staker.latestData.stake);
            logValidity(isValid, `Delegate: oldRep's latestData dStake did not increase`);
            if (!isValid) return;

            // oldRep and newRep dStake should remain unchanged for current epoch
            if (initState.epochNum.eq(newState.epochNum)) {
                isValid = initState.oldRep.dataCurEpoch.dStake.eq(newState.oldRep.dataCurEpoch.dStake);
                logValidity(isValid, `Delegate: oldRep's dataCurEpoch dStake changed`);
                if (!isValid) return;

                isValid = initState.newRep.dataCurEpoch.dStake.eq(newState.newRep.dataCurEpoch.dStake);
                logValidity(isValid, `Delegate: newRep's dataCurEpoch dStake changed`);
                if (!isValid) return;
            } else {   
                isValid = initState.oldRep.dataNextEpoch.dStake.eq(newState.oldRep.dataCurEpoch.dStake); 
                logValidity(isValid, `Delegate: oldRep's dataCurEpoch dStake changed`);
                if (!isValid) return;

                isValid = initState.newRep.dataNextEpoch.dStake.eq(newState.newRep.dataCurEpoch.dStake);
                logValidity(isValid, `Delegate: oldRep's dataCurEpoch dStake changed`);
                if (!isValid) return;
            }
        }
    } else {
        logger.debug("Unrecognised case....");
        logStates({'initState': initState, 'newState': newState});
        return false;
    }
    return isValid;
}

async function verifyWithdrawChanges(initState, newState, result) {
    // invalid result: need not verify states
    if (!result.isValid) return true;
    let isValid = true;
    let depositsSoFar = zeroBN;
    let withdrawAmt;

    // Delegate addresses should not change
    isValid = assertSameDelegateAddresses(initState, newState);
    logValidity(isValid, `Withdraw: delgate addresses changed`);
    if (!isValid) return;

    // withdrawal in same epoch
    if (initState.epochNum.eq(newState.epochNum)) {
        depositsSoFar = initState.staker.latestData.stake.sub(initState.staker.dataCurEpoch.stake);
        // Case 1: withdrawal amt <= deposit amt in epoch
        if (result.amount.lte(depositsSoFar)) {
            // staker's latestData.stake should decrease
            withdrawAmt = initState.staker.latestData.stake.sub(newState.staker.latestData.stake);
            isValid = withdrawAmt.eq(result.amount);
            logValidity(isValid, `Withdraw: staker's latestData stake decrease != withdraw amt`);
            if (!isValid) return;

            // staker's next epoch stake should decrease
            withdrawAmt = initState.staker.dataNextEpoch.stake.sub(newState.staker.dataNextEpoch.stake);
            isValid = withdrawAmt.eq(result.amount);
            logValidity(isValid, `Withdraw: staker's dataNextEpoch stake decrease != withdraw amt`);
            if (!isValid) return;

            // staker's latestData stake and dataNextEpoch stake should be equal
            isValid = newState.staker.latestData.stake.eq(newState.staker.dataNextEpoch.stake);
            logValidity(isValid, `Withdraw: staker's latestData stake != dataNextEpoch stake`);
            if (!isValid) return;

            // staker's dStakes should remain unchanged
            isValid = newState.staker.latestData.dStake.eq(initState.staker.latestData.dStake);
            logValidity(isValid, `Withdraw: staker's latestData dStake not the same`);
            if (!isValid) return;

            isValid = newState.staker.dataCurEpoch.dStake.eq(initState.staker.dataCurEpoch.dStake);
            logValidity(isValid, `Withdraw: staker's dataCurEpoch dStake not the same`);
            if (!isValid) return;

            isValid = newState.staker.dataNextEpoch.dStake.eq(initState.staker.dataNextEpoch.dStake);
            logValidity(isValid, `Withdraw: staker's dataNextEpoch dStake not the same`);
            if (!isValid) return;

            // if there is delegation, representative's dStake should decrease
            if (result.staker != newState.newRepAddress) {
                withdrawAmt = initState.newRep.latestData.dStake.sub(newState.newRep.latestData.dStake);
                isValid = result.amount.eq(withdrawAmt);
                logValidity(isValid, `Withdraw: newRep's latestData dStake not the same`);
                if (!isValid) return;

                withdrawAmt = initState.newRep.dataNextEpoch.dStake.sub(newState.newRep.dataNextEpoch.dStake);
                isValid = withdrawAmt.eq(result.amount);
                logValidity(isValid, `Withdraw: newRep's dataNextEpoch dStake decrease != withdraw amt`);
                if (!isValid) return;

                // newRep's current epoch dStake should remain the same
                isValid = initState.newRep.dataCurEpoch.dStake.eq(newState.newRep.dataCurEpoch.dStake);
                logValidity(isValid, `Withdraw: newRep's dataCurEpoch dStake changed`);
                if (!isValid) return;
            }
        } else {
            // Case 2: withdrawal amt > deposit amt in epoch
            let curEpochWithdrawAmt = result.amount.sub(depositsSoFar);

            // Check staker's latestData stake decreased by full withdraw amt
            withdrawAmt = initState.staker.latestData.stake.sub(newState.staker.latestData.stake);
            isValid = withdrawAmt.eq(result.amount);
            logValidity(`Withdraw: staker's latestData stake decrease != withdraw amt`);
            if (!isValid) return;

            // Check staker's dataNextEpoch decreased by full withdraw amt
            withdrawAmt = initState.staker.dataNextEpoch.stake.sub(newState.staker.dataNextEpoch.stake);
            isValid = withdrawAmt.eq(result.amount);
            logValidity(`Withdraw: staker's dataNextEpoch stake decrease != withdraw amt`);
            if (!isValid) return;

            // Check staker's current epoch stake's decreased
            withdrawAmt = initState.staker.dataCurEpoch.stake.sub(newState.staker.dataCurEpoch.stake);
            isValid = curEpochWithdrawAmt.eq(withdrawAmt);
            logValidity(`Withdraw: staker's dataCurEpoch stake decrease != curEpochWithdrawAmt`);
            if (!isValid) return;

            // if there is delegation, representative's dStake should decrease
            if (result.staker != newState.newRepAddress) {
                // latestData.dStake should decrease
                withdrawAmt = initState.newRep.latestData.dStake.sub(newState.newRep.latestData.dStake);
                isValid = withdrawAmt.eq(result.amount);
                logValidity(isValid, `Withdraw: newRep's latestData dStake decrease != withdraw amt`);
                if (!isValid) return;

                // dataNextEpoch should decrease
                withdrawAmt = initState.newRep.dataNextEpoch.dStake.sub(newState.newRep.dataNextEpoch.dStake);
                isValid = withdrawAmt.eq(result.amount);
                logValidity(isValid, `Withdraw: newRep's dataNextEpoch dStake decrease != withdraw amt`);
                if (!isValid) return;
            }

            // current epoch rep's dStake should decrease
            if (result.staker != initState.oldRepAddress) {
                withdrawAmt = initState.oldRep.dataCurEpoch.dStake.sub(newState.oldRep.dataCurEpoch.dStake);
                isValid = curEpochWithdrawAmt.eq(withdrawAmt);
                logValidity(isValid, `Withdraw: oldRep's dataCurEpoch dStake decrase != curEpochWithdrawAmt`);
                if (!isValid) return;

                if (initState.oldRepAddress != initState.newRepAddress) {
                    // check that old rep's latestData dStake remain unchanged
                    isValid = initState.oldRep.latestData.dStake.eq(newState.oldRep.latestData.dStake);
                    logValidity(isValid, `Withdraw: oldRep's latestData dStake changed`);
                    if (!isValid) return;

                    isValid = initState.oldRep.dataNextEpoch.dStake.eq(newState.oldRep.dataNextEpoch.dStake);
                    logValidity(isValid, `Withdraw: oldRep's dataNextEpoch dStake changed`);
                    if (!isValid) return;
                }
            }
        }
    } else {
        // withdrawal done in next epoch: Only need to handle withdrawalAmt > depositsSoFar case
        // staker's latestData stake should decrease
        withdrawAmt = initState.staker.latestData.stake.sub(newState.staker.latestData.stake);
        isValid = withdrawAmt.eq(result.amount);
        logValidity(isValid, `Withdraw: staker's latestData stake decrease != withdraw amt`);
        if (!isValid) return;

        // staker's current epoch stake should decrease
        withdrawAmt = initState.staker.dataNextEpoch.stake.sub(newState.staker.dataCurEpoch.stake);
        isValid = withdrawAmt.eq(result.amount);
        logValidity(isValid, `Withdraw: staker's dataCurEpoch stake decrease != withdraw amt`);
        if (!isValid) return;

        // staker's latestData and dataNextEpoch should be the same
        isValid = assertSameStakerData(newState.staker.latestData, newState.staker.dataNextEpoch);
        logValidity(isValid, `Withdraw: staker's latestData != dataNextEpoch`);
        if (!isValid) return;

        // check that rep has decreased dStakes
        if (result.staker != newState.newRepAddress) {
            withdrawAmt = initState.newRep.latestData.dStake.sub(newState.newRep.latestData.dStake);
            isValid = withdrawAmt.eq(result.amount);
            logValidity(isValid, `Withdraw: newRep's latestData dStake decrease != withdraw amt`);
            if (!isValid) return;

            withdrawAmt = initState.newRep.dataNextEpoch.dStake.sub(newState.newRep.dataCurEpoch.dStake);
            isValid = withdrawAmt.eq(result.amount);
            logValidity(isValid, `Withdraw: newRep's dataCurEpoch dStake decrease != withdraw amt`);
            if (!isValid) return;
        }
    }
    return isValid;
}

async function verifyEpochInvariants(operation, initState, newState) {
    let isValid;
    switch(operation) {
        case WITHDRAW:
            break;
        default:
            let actionDoneInSameEpoch = initState.epochNum.eq(newState.epochNum);
            isValid = assertSameStakerDataInvariants(initState.staker, newState.staker, actionDoneInSameEpoch);
            isValid &= (assertSameStakerDataInvariants(initState.oldRep, newState.oldRep, actionDoneInSameEpoch));
            isValid &= (assertSameStakerDataInvariants(initState.newRep, newState.newRep, actionDoneInSameEpoch));
    }
    return isValid;
}

function assertSameStakerDataInvariants(initStakerData, newStakerData, actionDoneInSameEpoch) {
    let isValid = true;

    if (actionDoneInSameEpoch) {
        isValid &= assertSameStakerData(initStakerData.dataCurEpoch, newStakerData.dataCurEpoch);
        if (!isValid) {
            logger.debug(`dataCurEpochs don't match`);
        }
        isValid &= assertSameStakerData(newStakerData.dataNextEpoch, newStakerData.latestData);
        if (!isValid) {
            logger.debug(`newStaker latestData & dataNextEpoch don't match`);
        }
    } else {
        isValid &= assertSameStakerData(initStakerData.dataNextEpoch, newStakerData.dataCurEpoch);
        if (!isValid) {
            logger.debug(`Diff epochs: newStaker dataCurEpoch & initStakerData.dataNextEpoch don't match`);
        }
        isValid &= assertSameStakerData(newStakerData.dataNextEpoch, newStakerData.latestData);
        if (!isValid) {
            logger.debug(`Diff epochs: newStaker dataNextEpoch & latestData don't match`);
        }
    }
    return isValid;
}

function assertSameStakerData(stakerData1, stakerData2) {
    let isValid = true;
    isValid &= (stakerData1.stake.eq(stakerData2.stake));
    if (!isValid) {
        logger.debug(`stakes don't match`);
        logger.debug(`${stakerData1.stake.toString()} != ${stakerData2.stake.toString()}`);
    }
    isValid &= (stakerData1.dStake.eq(stakerData2.dStake));
    if (!isValid) {
        logger.debug(`delegated stakes don't match`);
        logger.debug(`${stakerData1.dStake.toString()} != ${stakerData2.dStake.toString()}`);
    }
    isValid &= (stakerData1.dAddress == stakerData2.dAddress);
    if (!isValid) {
        logger.debug(`delegated addresses don't match`);
        logger.debug(`${stakerData1.dAddress.toString()} != ${stakerData2.dAddress.toString()}`);
    }
    return isValid;
}

function assertSameDataStruct(initStaker, newStaker) {
    let isValid = true;
    isValid &= assertSameStakerData(initStaker.dataCurEpoch, newStaker.dataCurEpoch);
    isValid &= assertSameStakerData(initStaker.dataNextEpoch, newStaker.dataNextEpoch);
    isValid &= assertSameStakerData(initStaker.latestData, newStaker.latestData);
    return isValid;
}

function assertSameDelegateAddresses(initState, newState) {
    let isValid = true;
    let sameEpoch = initState.epochNum.eq(newState.epochNum);
    isValid &= assertSameDelegateAddress(initState.staker, newState.staker, sameEpoch);
    isValid &= assertSameDelegateAddress(initState.oldRep, newState.oldRep, sameEpoch);
    isValid &= assertSameDelegateAddress(initState.newRep, newState.newRep, sameEpoch);
    return isValid;
}

function assertSameDelegateAddress(initStaker, newStaker, sameEpoch) {
    let isValid = true;
    // latestData
    isValid &= (initStaker.latestData.dAddress == newStaker.latestData.dAddress);

    if (sameEpoch) {
        isValid &= (initStaker.dataCurEpoch.dAddress == newStaker.dataCurEpoch.dAddress);
        isValid &= (initStaker.dataNextEpoch.dAddress == newStaker.dataNextEpoch.dAddress);
        isValid &= (initStaker.dataNextEpoch.dAddress == newStaker.latestData.dAddress);
    } else {
        isValid &= (initStaker.dataNextEpoch.dAddress == newStaker.dataCurEpoch.dAddress);
    }

    isValid &= (newStaker.dataNextEpoch.dAddress == newStaker.latestData.dAddress);

    return isValid;
}

function logValidity(isValid, reason) {
    if (!isValid) {
        logger.debug(`${reason}`);
    }
}

function logResult(validity, score) {
    if (!validity.isValid) {
        logStates(validity.states);
    } else {
        score += 1;
    }
    return score;
}

function logStates(states) {
    logger.debug(`---INITIAL STATE---`);
    logState(states.initState);
    logger.debug(`---RESULTING STATE---`);
    logState(states.newState);
}

function logState(state) {
    logger.debug(`epochNum: ${state.epochNum}`);
    logger.debug(`oldDAddr: ${state.oldRepAddress}`);
    logger.debug(`newDAddr: ${state.newRepAddress}`);

    logger.debug(`staker's curEpochStake: ${state.staker.dataCurEpoch.stake.toString()}`);
    logger.debug(`staker's curEpochDStake: ${state.staker.dataCurEpoch.dStake.toString()}`);
    logger.debug(`staker's curEpochDAddr: ${state.staker.dataCurEpoch.dAddress.toString()}`);

    logger.debug(`oldDAddr's curEpochStake: ${state.oldRep.dataCurEpoch.stake.toString()}`);
    logger.debug(`oldDAddr's curEpochDStake: ${state.oldRep.dataCurEpoch.dStake.toString()}`);
    logger.debug(`oldDAddr's curEpochDAddr: ${state.oldRep.dataCurEpoch.dAddress.toString()}`);
    
    logger.debug(`newDAddr's curEpochStake: ${state.newRep.dataCurEpoch.stake.toString()}`);
    logger.debug(`newDAddr's curEpochDStake: ${state.newRep.dataCurEpoch.dStake.toString()}`);
    logger.debug(`newDAddr's curEpochDAddr: ${state.newRep.dataCurEpoch.dAddress.toString()}`);

    logger.debug(`staker's nextEpochStake: ${state.staker.dataNextEpoch.stake.toString()}`);
    logger.debug(`staker's nextEpochDStake: ${state.staker.dataNextEpoch.dStake.toString()}`);
    logger.debug(`staker's nextEpochDAddr: ${state.staker.dataNextEpoch.dAddress.toString()}`);

    logger.debug(`oldDAddr's nextEpochStake: ${state.oldRep.dataNextEpoch.stake.toString()}`);
    logger.debug(`oldDAddr's nextEpochDStake: ${state.oldRep.dataNextEpoch.dStake.toString()}`);
    logger.debug(`oldDAddr's nextEpochDAddr: ${state.oldRep.dataNextEpoch.dAddress.toString()}`);
    
    logger.debug(`newDAddr's nextEpochStake: ${state.newRep.dataNextEpoch.stake.toString()}`);
    logger.debug(`newDAddr's nextEpochDStake: ${state.newRep.dataNextEpoch.dStake.toString()}`);
    logger.debug(`newDAddr's nextEpochDAddr: ${state.newRep.dataNextEpoch.dAddress.toString()}`);

    logger.debug(`staker's latestDataStake: ${state.staker.latestData.stake.toString()}`);
    logger.debug(`staker's latestDataDStake: ${state.staker.latestData.dStake.toString()}`);
    logger.debug(`staker's latestDataDAddr: ${state.staker.latestData.dAddress.toString()}`);

    logger.debug(`oldDAddr's latestDataStake: ${state.oldRep.latestData.stake.toString()}`);
    logger.debug(`oldDAddr's latestDataDStake: ${state.oldRep.latestData.dStake.toString()}`);
    logger.debug(`oldDAddr's latestDataDAddr: ${state.oldRep.latestData.dAddress.toString()}`);
    
    logger.debug(`newDAddr's latestDataStake: ${state.newRep.latestData.stake.toString()}`);
    logger.debug(`newDAddr's latestDataDStake: ${state.newRep.latestData.dStake.toString()}`);
    logger.debug(`newDAddr's latestDataDAddr: ${state.newRep.latestData.dAddress.toString()}`);
}
