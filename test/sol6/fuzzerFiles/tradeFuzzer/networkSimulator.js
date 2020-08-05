const Helper = require("../../../helper.js");
const nwHelper = require("../../networkHelper.js");

const BN = web3.utils.BN;

const { precisionUnits, zeroBN } = require("../../../helper.js");
const { expectRevert } = require('@openzeppelin/test-helpers');

const winston = require('winston');

const TradeParamGenerator = require("./tradeParamsGenerator.js");
const { TRADE, UPDATE_RESERVE_RATE, RevertType, allRevertMessages } = require("./tradeParamsGenerator.js");

let numberSuccessfulTrades = 0;
let numberGettingsZeroRates = 0;
let numberUpdateReserveRates = 0;
let numberRevertedTrades = {};
let listRevertedReasons = [];

const logger = winston.createLogger({
    format: winston.format.combine(winston.format.colorize(), winston.format.splat(), winston.format.simple()),
    transports: [
      new winston.transports.Console({ level: 'info' }),
      new winston.transports.File({ filename: 'fuzz_trade.log', level: 'debug' })
    ]
});

// number iterations to print the progress of the test
const progressIterations = 20;

// do fuzz trade tests with number of loops
// then log the results of the whoe loop
// random revert type, then create inputs
module.exports.doFuzzTradeTests = async function(
    network, networkProxy, storage, matchingEngine,
    reserveInstances, accounts, tokens, numberLoops
) {
    listRevertedReasons = [];
    logger.info(`Running semi-random fuzz trade tests with ${numberLoops} loops`);
    // prepare number of reverted trades for each revert message
    for(let i = 0; i < allRevertMessages.length; i++) {
        numberRevertedTrades[allRevertMessages[i]] = 0;
        listRevertedReasons.push(allRevertMessages[i]);
    }

    let consecutiveFails = 0;
    let hasUpdatedRates = true;
    for(let loop = 0; loop < numberLoops; loop++) {
        if (loop % progressIterations == 0) {
            process.stdout.write(".");
        }
        let nextOperation = TradeParamGenerator.getNextOperation();
        if (nextOperation == TRADE || hasUpdatedRates) {
            hasUpdatedRates = false;
            // Note: revert is random, then inputs are created based on revert type
            let isTradeSuccess = await doTradeAndCompare(
                tokens, network, networkProxy, storage,
                matchingEngine, reserveInstances, accounts, false, loop
            );
            if (isTradeSuccess) {
                consecutiveFails = 0;
            } else {
                consecutiveFails++;
                if (consecutiveFails == Math.max(1, numberLoops / 10000)) {
                    // too many consecutive times we can not get a valid trade inputs
                    logger.debug(`Update rates for reserves`);
                    await updateRatesForReserves(reserveInstances, tokens, accounts);
                    hasUpdatedRates = true;
                    consecutiveFails = 0;
                }
            }
        } else if (nextOperation == UPDATE_RESERVE_RATE) {
            logger.debug(`Loop ${loop}: Update rates for reserves`);
            await updateRatesForReserves(reserveInstances, tokens, accounts);
            hasUpdatedRates = true;
        }
    }
    process.stdout.write("\n");
    logTestResults(numberLoops);
}

// do fuzz trade tests with number of loops
// then log the results of the whoe loop
// random inputs, then guess the revert type
module.exports.doRandomFuzzTradeTests = async function(
    network, networkProxy, storage, matchingEngine,
    reserveInstances, accounts, tokens, numberLoops
) {
    listRevertedReasons = [];
    logger.info(`Running random fuzz trade tests with ${numberLoops} loops`);
    // prepare number of reverted trades for each revert message
    for(let i = 0; i < allRevertMessages.length; i++) {
        numberRevertedTrades[allRevertMessages[i]] = 0;
        listRevertedReasons.push(allRevertMessages[i]);
    }

    let consecutiveFails = 0;
    let hasUpdatedRates = true;
    for(let loop = 0; loop < numberLoops; loop++) {
        if (loop % progressIterations == 0) {
            process.stdout.write(".");
        }
        let nextOperation = TradeParamGenerator.getNextOperation();
        if (nextOperation == TRADE || hasUpdatedRates) {
            hasUpdatedRates = false;
            // Note: inputs are randomized, then guess the revert type
            let isTradeSuccess = await doTradeAndCompare(
                tokens, network, networkProxy, storage,
                matchingEngine, reserveInstances, accounts, true, loop
            );
            if (isTradeSuccess) {
                consecutiveFails = 0;
            } else {
                consecutiveFails++;
                if (consecutiveFails == Math.max(1, numberLoops / 10000)) {
                    // too many consecutive times we can not get a valid trade inputs
                    logger.debug(`Loop ${loop}: Update rates for reserves`);
                    await updateRatesForReserves(reserveInstances, tokens, accounts);
                    hasUpdatedRates = true;
                    consecutiveFails = 0;
                }
            }
        } else if (nextOperation == UPDATE_RESERVE_RATE) {
            logger.debug(`Loop ${loop}: Update rates for reserves`);
            await updateRatesForReserves(reserveInstances, tokens, accounts);
            hasUpdatedRates = true;
        }
    }
    process.stdout.write("\n");
    logTestResults(numberLoops);
}

// do trade and compare result if trade is successful
// if reverted type is not None -> trade should be reverted
// check if the trade is reverted with expected reason
// isRandomInput: true if we random inputs, then guess the revert type
// otherwise we random revert type, then create inputs
async function doTradeAndCompare(
    tokens, network, networkProxy, storage,
    matchingEngine, reserveInstances, accounts, isRandomInput, loop
) {
    let tradeData;
    if (isRandomInput) {
        tradeData = await TradeParamGenerator.generateRandomizedTradeParams(tokens, network, networkProxy, storage, matchingEngine, reserveInstances, accounts);
    } else {
        tradeData = await TradeParamGenerator.generateTradeParams(tokens, network, networkProxy, storage, matchingEngine, reserveInstances, accounts);
    }
    if (tradeData.srcQty.gt(zeroBN) || tradeData.revertType != RevertType.None) {
        if (tradeData.revertType == RevertType.None) {
            // calculate expected result
            let expectedResult = tradeData.expectedResult;
            let actualSrcQty = tradeData.actualSrcQty;
            logger.debug(`Loop ${loop}: Execute trade ${tradeData.message}, networkFeeBps=${tradeData.networkFeeBps.toString(10)},
                srcQty=${tradeData.srcQty.toString(10)}, srcDecimals=${tradeData.srcDecimals}, actualSrcQty=${actualSrcQty.toString(10)},
                dstQty=${expectedResult.actualDestAmount.toString(10)}, dstDecimals=${tradeData.destDecimals},
                platformFee=${expectedResult.platformFeeWei.toString(10)}, networkFee=${expectedResult.networkFeeWei.toString(10)}, accountedFeeBps=${expectedResult.feePayingReservesBps.toString(10)},
                minConversionRate=${tradeData.minConversionRate}, rateWithNetworkFee=${expectedResult.rateWithNetworkFee.toString(10)},
                rateWithAllFees=${expectedResult.rateWithAllFees.toString(10)}`);
            await testNormalTradeSuccessful(tradeData.srcAddress, tradeData.destAddress, tradeData, tradeData.taker, tradeData.callValue, tradeData.recipient, actualSrcQty,
                expectedResult, networkProxy
            )
        } else {
            if (numberRevertedTrades[tradeData.revertType] == null) {
                numberRevertedTrades[tradeData.revertType] = 1;
            } else {
                numberRevertedTrades[tradeData.revertType]++;
            }
            if (!listRevertedReasons.includes(tradeData.revertType)) {
                listRevertedReasons.push(tradeData.revertType);
            }
            logger.debug(`Loop ${loop}: Execute trade fail with reason: ${tradeData.revertType}`)
            await testTradeShouldRevert(tradeData.srcAddress, tradeData.destAddress, tradeData, tradeData.taker,
                tradeData.recipient, tradeData.callValue, networkProxy, tradeData.gasPrice, tradeData.message);

            // reset some data like: transfer back src token, reset allowance, enable network if needed, etc
            await TradeParamGenerator.resetDataAfterTradeReverted(tradeData, network, networkProxy, accounts);
        }
        return true;
    }

    logger.debug(`Loop ${loop}: Getting zero rates for trade`);
    numberGettingsZeroRates++;
    return false;
}

// test should revert, there are 4 cases:
// test is reverted with unspecified, e.g: sender not enough src token, not enough allowance
// test is reverted but with assertion
// test is reverted but can not check, e.g: callValue + fee > eth balance of sender
// test is reverted with the given reason in errorMessage
async function testTradeShouldRevert(srcAddress, destAddress, tradeData, taker, recipientAddress, callValue, networkProxy, gasPrice, errorMessage) {
    if (errorMessage == "unspecified") {
        // unspecified revert
        await expectRevert.unspecified(
            networkProxy.tradeWithHintAndFee(
                srcAddress,
                tradeData.srcQty,
                destAddress,
                recipientAddress,
                tradeData.maxDestAmount,
                tradeData.minConversionRate,
                taker, // platform wallet
                tradeData.platformFeeBps,
                tradeData.hint,
                {from: taker, value: callValue, gasPrice: gasPrice}
            )
        )
    } else if (errorMessage == "assertion") {
        await expectRevert.assertion(
            networkProxy.tradeWithHintAndFee(
                srcAddress,
                tradeData.srcQty,
                destAddress,
                recipientAddress,
                tradeData.maxDestAmount,
                tradeData.minConversionRate,
                taker, // platform wallet
                tradeData.platformFeeBps,
                tradeData.hint,
                {from: taker, value: callValue, gasPrice: gasPrice}
            )
        )
        logger.error("ASSERTION");
    } else if (errorMessage == "try/catch") {
        // need to do try catch
        try {
            await networkProxy.tradeWithHintAndFee(
                srcAddress,
                tradeData.srcQty,
                destAddress,
                recipientAddress,
                tradeData.maxDestAmount,
                tradeData.minConversionRate,
                taker, // platform wallet
                tradeData.platformFeeBps,
                tradeData.hint,
                {from: taker, value: callValue, gasPrice: gasPrice}
            );
            assert(false, "expected revert in line above");
        } catch (e) { }
    } else {
        await expectRevert(
            networkProxy.tradeWithHintAndFee(
                srcAddress,
                tradeData.srcQty,
                destAddress,
                recipientAddress,
                tradeData.maxDestAmount,
                tradeData.minConversionRate,
                taker, // platform wallet
                tradeData.platformFeeBps,
                tradeData.hint,
                {from: taker, value: callValue, gasPrice: gasPrice}
            ),
            errorMessage
        );
    }
}

// test normal trade is successful and data of balance changes as expected
async function testNormalTradeSuccessful(
    srcAddress, destAddress, tradeData, taker, callValue, recipient,
    actualSrcQty, expectedResult, networkProxy)
{
    // get balances before trade
    let initialReserveBalances = await nwHelper.getReserveBalances(tradeData.srcToken, tradeData.destToken, expectedResult);
    let initialTakerBalances = await nwHelper.getTakerBalances(tradeData.srcToken, tradeData.destToken, recipient, taker);
    await networkProxy.tradeWithHintAndFee(
        srcAddress,
        tradeData.srcQty,
        destAddress,
        recipient,
        tradeData.maxDestAmount,
        tradeData.minConversionRate,
        taker, // platform wallet
        tradeData.platformFeeBps,
        tradeData.hint,
        {from: taker, value: callValue, gasPrice: new BN(0)}
    );
    await nwHelper.compareBalancesAfterTrade(tradeData.srcToken, tradeData.destToken, actualSrcQty,
        initialReserveBalances, initialTakerBalances, expectedResult, recipient, taker);
    numberSuccessfulTrades++;
}

// randomly update rates for reserves
// normally when too many consecutive iterations can not get a successful trades
async function updateRatesForReserves(reserveInstances, tokens, accounts) {
    numberUpdateReserveRates++;
    let ethInit = new BN(100).mul(new BN(10).pow(new BN(18)));
    let ethSender = 0;
    for(const [key, value] of Object.entries(reserveInstances)) {
        let reserve = value.instance;
        // deposit more eth if needed
        await reserve.withdrawAllEth({from: accounts[ethSender]});
        await Helper.sendEtherWithPromise(accounts[ethSender], reserve.address, ethInit);
        let val = TradeParamGenerator.getRandomInt(1, (ethSender + 1) * 10);
        let tokensPerEther = precisionUnits.mul(new BN(val));
        let ethersPerToken = precisionUnits.div(new BN(val));
        for(let i = 0; i < tokens.length; i++) {
            let token = tokens[i];
            await reserve.withdrawAllToken(token.address);
            let initialTokenAmount = new BN(2000000).mul(new BN(10).pow(new BN(await token.decimals())));
            await token.transfer(reserve.address, initialTokenAmount);
            await reserve.setRate(token.address, tokensPerEther, ethersPerToken);
        }
        ethSender++;
    }
}

function logTestResults(numberLoops) {
    logger.info(`--- SUMMARY RESULTS AFTER ${numberLoops} LOOPS ---`)
    logger.info(`${numberSuccessfulTrades} succesful trades`);
    logger.info(`${numberUpdateReserveRates} times updating reserve rates`);
    logger.info(`${numberGettingsZeroRates} times getting zero for rates`);
    for(let i = 0; i < listRevertedReasons.length; i++) {
        logger.info(`${numberRevertedTrades[listRevertedReasons[i]]} reverted trades with reason: ${listRevertedReasons[i]}`);
    }
}
