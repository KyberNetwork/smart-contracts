const BN = web3.utils.BN;
const Helper = require("../../../helper.js");
const nwHelper = require("../../networkHelper.js");

require("chai")
    .use(require("chai-as-promised"))
    .use(require("chai-bn")(BN))
    .should();


const {BPS, ethDecimals, ethAddress, emptyHint, zeroBN, zeroAddress }  = require("../../../helper.js");
const { MASK_IN_HINTTYPE, MASK_OUT_HINTTYPE, SPLIT_HINTTYPE, BEST_OF_ALL_HINTTYPE }  = require('../../networkHelper.js');

// Operations
const TRADE = 'trade';
const UPDATE_RESERVE_RATE = 'update_reserve_rate';

// trade with high max dest value
const MAX_DEST_HIGH = 'max_dest_high';
const MAX_DEST_LOW = "max_dest_low";

const T2E = "t2e";
const E2T = "e2t";
const T2T = "t2t";

const hintTypeStr = ["Mask In", "Mask Out", "Split"];

// Revert type, using to determine which type of revert that the trade should catch
// Prefix with "hint error": For all hint error cases, we only have one reverted reason from Network with exchange rate is 0
const RevertType = {
    None: "",
    MIN_RATE_HIGH: "rate < min rate",
    WRONG_MSG_VALUE: "sent eth not 0",
    BAD_ETH_QTY: "sent eth not equal to srcAmount",
    // Hint errors
    HINT_ERROR_NON_EMPTY_DATA_HINT: "hint error: reserveIds and splits must be empty",
    HINT_ERROR_DUP_RESERVE_ID: "hint error: duplicated reserve ids",
    HINT_ERROR_RESERVES_EMPTY: "hint error: reserve ids empty",
    HINT_ERROR_RESERVE_IDS_SPLITS: "hint error: reserve ids length != splits length",
    HINT_ERROR_NOT_INCREASING: "hint error: reserve ids not increasing",
    HINT_ERROR_RESERVE_ID_NOT_FOUND: "hint error: reserve id not found",
    HINT_ERROR_SPLIT_NOT_EMPTY: "hint error: splits not empty",
    HINT_ERROR_TOKEN_NOT_LISTED: "hint error: reserve not listed token",
    HINT_ERROR_TOTAL_BPS: "hint error: total bpts is not 100%",

    PLATFORM_FEE_HIGH: "platformFee high", // platform fee >= 10000
    TOTAL_FEES_HIGH: "fees high", // platform + 2 * network fee >= 10000
    NETWORK_DISABLED: "network disabled",
    GAS_PRICE_HIGH: "gas price", // gas price is higher than max gas price
    ZERO_SRC_AMOUNT: "0 srcAmt", // src amount is 0
    DEST_ADDRESS_ZERO: "dest add 0", // dest address is 0x0
    SAME_SRC_DEST: "src = dest", // same src and dest token
    SRC_AMOUNT_HIGH: "srcAmt > MAX_QTY", // src amount > max_qty (10^28)

    NOT_ENOUGH_SRC_TOKEN: "not enough src token", // taker doesn't have enough funds
    NOT_ENOUGH_ALLOWANCE: "not enough allowance", // taker doesn't approve enough to proxy

    ZERO_RATE: "zero rate", // in case rate is 0, there are many reasons for that

    // Not tested
    // Revert from proxy
    NETWORK_RETURNED_WRONG_DEST: "nimbleNetwork returned wrong amount",
    ACTUAL_DEST_MORE_THAN_MAX_DEST: "actual dest amount exceeds maxDestAmount",
    RATE_BELOW_MIN_RATE: "rate below minConversionRate",
    WRONG_DEST_AMOUNT: "wrong amount in destination address",
    WRONG_SOURCE_AMONT: "wrong amount in source address",
    // Revert from network
    SENDER_NOT_PROXY: "bad sender", // sender is not network proxy
    RATE_GREATER_MAX_RATE: "rate > MAX_RATE",
    HANDLE_CHANGE_FAILED: "Send change failed",
    INVALID_TRADE_WEI: "Trade wei > MAX_QTY",
    BAD_SPLIT_ARRAY: "bad split array",
    BAD_FEE_ARRAY: "bad split array",
    BAD_REBATE_ARRAY: "bad rebate array",
    BAD_ADDRESS_ARRAY: "bad addresses array",
    INVALID_SPLIT_BPS: "invalid split bps",
    TOO_MANY_RESERVES: "doMatch: too many reserves",
    SEND_DEST_QTY_FAILED: "send dest qty failed",
    RESERVE_TRADE_FAILED: "reserve trade failed",
    RESERVE_TAKES_HIGH_SRC_AMOUNT: "reserve takes high amount",
    RESERVE_RETURNS_LOW_DEST_AMOUNT: "reserve returns low amount"
}

const allRevertMessages = [
    RevertType.MIN_RATE_HIGH,
    RevertType.WRONG_MSG_VALUE,
    RevertType.BAD_ETH_QTY,
    RevertType.HINT_ERROR_NON_EMPTY_DATA_HINT,
    RevertType.HINT_ERROR_DUP_RESERVE_ID,
    RevertType.HINT_ERROR_RESERVES_EMPTY,
    RevertType.HINT_ERROR_RESERVE_IDS_SPLITS,
    RevertType.HINT_ERROR_NOT_INCREASING,
    RevertType.HINT_ERROR_RESERVE_ID_NOT_FOUND,
    RevertType.HINT_ERROR_SPLIT_NOT_EMPTY,
    RevertType.HINT_ERROR_TOTAL_BPS,
    RevertType.PLATFORM_FEE_HIGH,
    RevertType.TOTAL_FEES_HIGH,
    RevertType.NETWORK_DISABLED,
    RevertType.GAS_PRICE_HIGH,
    RevertType.ZERO_SRC_AMOUNT,
    RevertType.DEST_ADDRESS_ZERO,
    RevertType.SAME_SRC_DEST,
    RevertType.SRC_AMOUNT_HIGH,
    RevertType.NOT_ENOUGH_ALLOWANCE,
    RevertType.NOT_ENOUGH_SRC_TOKEN,
    // Not tested yet
    // RevertType.SENDER_NOT_PROXY,
    // RevertType.HINT_ERROR_TOKEN_NOT_LISTED,
    // RevertType.NETWORK_RETURNED_WRONG_DEST,
    // RevertType.ACTUAL_DEST_MORE_THAN_MAX_DEST,
    // RevertType.RATE_BELOW_MIN_RATE,
    // RevertType.WRONG_DEST_AMOUNT,
    // RevertType.WRONG_SOURCE_AMONT,
    // RevertType.RATE_GREATER_MAX_RATE,
    // RevertType.HANDLE_CHANGE_FAILED,
    // RevertType.INVALID_TRADE_WEI,
    // RevertType.BAD_SPLIT_ARRAY,
    // RevertType.BAD_FEE_ARRAY,
    // RevertType.BAD_REBATE_ARRAY,
    // RevertTypeBAD_ADDRESS_ARRAY,
    // RevertType.INVALID_SPLIT_BPS,
    // RevertType.TOO_MANY_RESERVES,
    // RevertType.SEND_DEST_QTY_FAILED,
    // RevertType.RESERVE_TRADE_FAILED,
    // RevertType.RESERVE_TAKES_HIGH_SRC_AMOUNT,
    // RevertType.RESERVE_RETURNS_LOW_DEST_AMOUNT,
]

module.exports = { TRADE, UPDATE_RESERVE_RATE, RevertType, allRevertMessages };

// next operation:
// 1. trade
// 2. update reserve rate
module.exports.getNextOperation = function gen_nextOperation() {
    let rand = getRandomInt(0, 100);
    if (rand < 90) { return TRADE; }
    return UPDATE_RESERVE_RATE;
}

// get trade params with random:
// Calculate trade inputs, prepare data for trade (src token, allowance, etc)
// return all params needed to make a trade
// If trade is successful, `message` is data to print out
// If trade is revert, `message` is reverted reason.
//    If `message` is unspecified -> use expectedRevert with unspecified
//    If `message` is assertion -> use expectedRevert with assertion
//    If `message` is try/catch -> use normal try/catch
//    Otherwise use `message` as reverted reason

// How to randomise to decide expect error
// 1. Random if we should revert with that error, depend on how frequent it should catch
//      Some errors are grouped together, like hint errors, or wrong inputs (in validate input)
//      It depends on how we compute input param, for example:
//          We need to get token pair first before get hint or compute src qty
// 2. If they are grouped, consider each type of error has equal chance to happen
// 3. Make random inputs for each revert type, target to the value that will catch the error
//      Example: gas price high -> get max gas price from network, randomly add some extra gas price
//               platform fee high -> platformFee >= BPS -> set platformFee = BPS + extra_bps (random)
//               destAddress is 0 -> make recipient = 0x0
//      If trade is reverted, some inputs will be not random and assumed to be valid inputs
//          Example: maxDestAmount is big, minConversionRate is 0 if the trade is not tested these 2 values
module.exports.generateTradeParams = async function generateTradeParams(tokens, network, networkProxy, storage, matchingEngine, reserveInstances, accounts) {

    // clear network balancce
    let admin = await network.admin();
    await Helper.zeroNetworkBalance(network, tokens, admin);

    // retrieve network fee data
    await network.getAndUpdateNetworkFee();
    let networkFeeData = await network.getNetworkData();
    let networkFeeBps = networkFeeData.networkFeeBps;

    // generate token pair
    let pairData = await getTokenPairs(tokens);
    let srcToken = pairData.srcToken;
    let destToken = pairData.destToken;
    let srcDecimals = pairData.srcDecimals;
    let destDecimals = pairData.destDecimals;
    // random platform fee
    let platformFeeBps = new BN(getRandomInt(0, 2000));

    let gasPrice = new BN(0);

    let revertType = RevertType.None;
    let hint = emptyHint;
    let srcQty = zeroBN;
    let minConversionRate = new BN(0);
    let maxDestAmount = new BN(2).pow(new BN(200));
    let message = "";
    let taker = accounts[getRandomInt(1, accounts.length - 1)];
    // most of the time it is a swap, i.e (recipient == taker)
    let recipient = getRandomInt(0, 100) > 95 ? taker : accounts[getRandomInt(1, accounts.length - 1)];

    // assume there is a small probability to get reverted with wrong inputs
    // e.g: gas price too high, src=dest, fee too high, etc
    // it shouldn't be high probability because most of cases will return 0 for expected rate
    if (getRandomInt(0, 100) >= 90 && revertType == RevertType.None) {
        // making wrong trade inputs: function validateTradeInput and validateFeeInput in Network
        // like gas price too high, network is disabled, etc
        // same probability to happen for each case
        let number = getRandomInt(1, 8);
        switch (number) {
            case 1: // disable network
                await network.setEnable(false, {from: admin});
                revertType = RevertType.NETWORK_DISABLED;
                break
            case 2:
                // gas price high
                gasPrice = (await network.maxGasPrice()).add(new BN(getRandomInt(1, 100)));
                revertType = RevertType.GAS_PRICE_HIGH;
                break
            case 3:
                // zero src amount
                srcQty = zeroBN;
                revertType = RevertType.ZERO_SRC_AMOUNT;
                break
            case 4:
                // dest address is 0x0
                recipient = zeroAddress;
                revertType = RevertType.DEST_ADDRESS_ZERO;
                break
            case 5:
                // src = dest token
                destToken = srcToken;
                destDecimals = srcDecimals;
                revertType = RevertType.SAME_SRC_DEST;
                break
            case 6:
                // platform fee high >= BPS
                platformFeeBps = BPS.add(new BN(getRandomInt(0, 10000)));
                revertType = RevertType.PLATFORM_FEE_HIGH;
                break
            case 7:
                // total fee's high: platformFee + 2 * networkFeeBps >= BPS
                platformFeeBps = BPS.sub(networkFeeBps).sub(networkFeeBps);
                revertType = RevertType.TOTAL_FEES_HIGH;
                break
            case 8:
                // src amount is higher than max qty of 10^28
                // need to use token as src token
                if (srcToken == ethAddress) {
                    [srcToken, destToken] = [destToken, srcToken];
                    [srcDecimals, destDecimals] = [destDecimals, srcDecimals];
                }
                srcQty = (new BN(10).pow(new BN(28))).add(new BN(getRandomInt(1, 1000000)));
                revertType = RevertType.SRC_AMOUNT_HIGH;
                break
            default: break
        }
    }

    // get hint if the trade is not reverted, otherwise use empty as hint
    if (revertType == RevertType.None) {
        let shouldTestHintError = getRandomInt(0, 100) >= 90;
        let hintData = await getTradeHint(srcToken, destToken, storage, shouldTestHintError);
        revertType = hintData.revertType;
        hint = hintData.hint;
        if (revertType == RevertType.None) {
            message = `${pairData.tradeSide}, ${hintData.type}, platformFee=${platformFeeBps}`
        }
    }

    // get random srcQty if trade is not reverted with low or high src amount
    if (revertType != RevertType.ZERO_SRC_AMOUNT && revertType != RevertType.SRC_AMOUNT_HIGH) {
        srcQty = await getTradeSrcQty(network, srcToken, destToken, platformFeeBps, hint, revertType);
    }

    let isTestingMaxDestAmount = false;

    // if srcQty = 0 or trade should be reverted, can leave max dest and min rate value
    if (srcQty.gt(zeroBN) && revertType == RevertType.None) {
        let expectedRates = await network.getExpectedRateWithHintAndFee(getAddress(srcToken), getAddress(destToken), srcQty, platformFeeBps, hint);
        let dstQty = Helper.calcDstQty(srcQty, srcDecimals, destDecimals, expectedRates.rateWithAllFees);
        if (dstQty.gt(zeroBN)) {
            let maxDestType = getMaxDestType();
            if (maxDestType == MAX_DEST_LOW) {
                // max dest is lower than actual dest
                maxDestAmount = dstQty.sub(new BN(getRandomInt(1, Math.min(1000, dstQty * 1))));
                message += ", LOWER_MAX_DEST"
                isTestingMaxDestAmount = true;
            }
        }
        // if maxDestAmount is low, and minConversionRate is near expected rate, trade could fail
        // with error "rate below minConversionRate"
        // so when testing low max dest, we just use 0 for minConversionRate to prevent reverted
        if (!isTestingMaxDestAmount) {
            let isTestingMinConversionRate = false;
            [minConversionRate, isTestingMinConversionRate] = getMinConversionRateData(expectedRates.rateWithNetworkFee);
            if (isTestingMinConversionRate) {
                revertType = RevertType.MIN_RATE_HIGH;
            } else {
                // no revert on min conversion rate
                minConversionRate = expectedRates.rateWithNetworkFee;
            }
        }
    }

    // calculate call value
    let callValue = srcToken == ethAddress ? srcQty : zeroBN;
    if (revertType == RevertType.None) {
        // small % of trades that msg value is wrong
        if (getRandomInt(0, 100) > 95) {
            revertType = srcToken == ethAddress ? RevertType.BAD_ETH_QTY : RevertType.WRONG_MSG_VALUE;
        }
        // update to wrong call value if revert type is Wrong Msg Value or Bad eth qty
        if (revertType == RevertType.BAD_ETH_QTY || revertType == RevertType.WRONG_MSG_VALUE) {
            callValue = new BN(getRandomInt(0, 1000));
        }
    }

    // setup src amount for taker before trade
    if (srcQty.gt(zeroBN)) {
        // random to make revert, either not enough funds or not enough allowance
        // should not happen frequently
        if (getRandomInt(0, 100) >= 95 && revertType == RevertType.None) {
            // should revert either not enough balance or allowance for taker
            revertType = (srcToken == ethAddress || getRandomInt(0, 100) > 50)
                ? RevertType.NOT_ENOUGH_SRC_TOKEN : RevertType.NOT_ENOUGH_ALLOWANCE;
            // if src == eth, only can revert with not enough src token
        }
        if (srcToken != ethAddress) {
            // transfer src token to taker
            if (revertType == RevertType.NOT_ENOUGH_SRC_TOKEN) {
                // take all balance if needed first
                let balance = await srcToken.balanceOf(taker);
                if (balance.gt(zeroBN)) {
                    await srcToken.transfer(accounts[0], balance, {from: taker});
                }
                await srcToken.transfer(taker, srcQty.sub(new BN(getRandomInt(1, 100))));
            } else {
                await srcToken.transfer(taker, srcQty);
            }
            if (revertType == RevertType.NOT_ENOUGH_ALLOWANCE) {
                await srcToken.approve(networkProxy.address, srcQty.sub(new BN(getRandomInt(1, 100))), {from: taker});
            } else {
                await srcToken.approve(networkProxy.address, srcQty, {from: taker});
            }
        } else if (revertType == RevertType.NOT_ENOUGH_SRC_TOKEN) {
            let takerEthBal = await Helper.getBalancePromise(taker);
            callValue = takerEthBal.add(new BN(getRandomInt(1, 100)));
        }
    }

    if (revertType != RevertType.None) {
        message = revertType;
        if (message.startsWith("hint error")) {
            // all hint errors will have this revert
            if (revertType == RevertType.HINT_ERROR_RESERVE_ID_NOT_FOUND) {
                // one issue with current implementation
                // if reserve id is not found, it will be reverted
                // because of accessing first element of empty array
                message = "unspecified"
            } else {
                message = "trade invalid, if hint involved, try parseHint API";
            }
        } else if (revertType == RevertType.NOT_ENOUGH_SRC_TOKEN && srcToken == ethAddress) {
            // if not enough src token + src == eth, we have to use normal try/catch
            message = "try/catch"
        } else if (revertType == RevertType.NOT_ENOUGH_ALLOWANCE || revertType == RevertType.NOT_ENOUGH_SRC_TOKEN) {
            // revert with unspecified reason
            message = "unspecified"
        }
    }

    // generate expected result and actual src qty
    let expectedResult;
    let actualSrcQty;
    if (revertType == RevertType.None) {
        expectedResult = await nwHelper.getAndCalcRates(matchingEngine, storage, reserveInstances,
            getAddress(srcToken), getAddress(destToken), srcQty,
            srcDecimals, destDecimals,
            networkFeeBps, platformFeeBps, hint
        );
        actualSrcQty = srcQty;
        if (isTestingMaxDestAmount) {
            let info = [srcQty, networkFeeBps, platformFeeBps];
            [expectedResult, actualSrcQty] = await nwHelper.calcParamsFromMaxDestAmt(srcToken, destToken, expectedResult, info, maxDestAmount);
        }
    }

    return {
        taker: taker,
        recipient: recipient,
        srcToken: srcToken,
        srcAddress: getAddress(srcToken),
        destToken: destToken,
        destAddress: getAddress(destToken),
        srcQty: srcQty,
        callValue: callValue,
        maxDestAmount: maxDestAmount,
        isTestingMaxDestAmount: isTestingMaxDestAmount,
        minConversionRate: minConversionRate,
        networkFeeBps: networkFeeBps,
        platformFeeBps: platformFeeBps,
        hint: hint,
        srcDecimals: srcDecimals,
        destDecimals: destDecimals,
        gasPrice: gasPrice,
        message: message,
        revertType: revertType,
        expectedResult: expectedResult,
        actualSrcQty: actualSrcQty
    }
}

// Fully randomized all inputs
module.exports.generateRandomizedTradeParams = async function generateRandomizedTradeParams(tokens, network, networkProxy, storage, matchingEngine, reserveInstances, accounts) {
    // clear network balancce
    let admin = await network.admin();
    await Helper.zeroNetworkBalance(network, tokens, admin);

    // retrieve network fee data
    await network.getAndUpdateNetworkFee();
    let networkFeeData = await network.getNetworkData();
    let networkFeeBps = networkFeeData.networkFeeBps;

    // generate token pair
    let tokensWithEth = [];
    tokensWithEth.push(ethAddress);
    for(let i = 0 ; i < tokens.length; i++) {
        tokensWithEth.push(tokens[i]);
    }
    let srcToken = tokensWithEth[getRandomInt(0, tokensWithEth.length - 1)];
    let destToken = tokensWithEth[getRandomInt(0, tokensWithEth.length - 1)];
    let srcDecimals = srcToken == ethAddress ? ethDecimals : await srcToken.decimals();
    let destDecimals = destToken == ethAddress ? ethDecimals : await destToken.decimals();
    // random platform fee
    let platformFeeBps = new BN(getRandomInt(0, 11000));

    let maxGasPrice = await network.maxGasPrice();
    let gasPrice = new BN(getRandomInt(0, Math.floor(maxGasPrice * 105 / 100)));

    let hint = emptyHint;
    let srcQty = zeroBN;
    let callValue = zeroBN;
    let revertType = RevertType.None;
    let minConversionRate = new BN(0);
    let maxDestAmount = new BN(2).pow(new BN(200));
    let taker = accounts[getRandomInt(1, accounts.length - 1)];
    let accountsWithZeroAddress = [];
    for(let i = 0; i < accounts.length; i++) {
        accountsWithZeroAddress.push(accounts[i]);
    }
    accountsWithZeroAddress.push(zeroAddress);
    let recipient = accountsWithZeroAddress[getRandomInt(1, accountsWithZeroAddress.length - 1)];

    // 80% hints are valid
    let shouldTestHintError = getRandomInt(0, 100) >= 90;
    let hintData = {
        hint: emptyHint,
        revertType: RevertType.None
    }
    if (srcToken != ethAddress || destToken != ethAddress) {
        hintData = await getTradeHint(srcToken, destToken, storage, shouldTestHintError);
    }
    let hintRevertType = hintData.revertType;
    hint = hintData.hint;

    // 80% src qty should be valid
    let isValidSrcQty = getRandomInt(0, 100) <= 90;
    let maxQty = (new BN(10).pow(new BN(28)));
    if (isValidSrcQty) {
        if (!BPS.gt(platformFeeBps) || !BPS.gt(platformFeeBps.add(networkFeeBps).add(networkFeeBps)) || hintRevertType != RevertType.None) {
            // if fees are invalid, get expected rate will revert
            srcQty = (new BN(getRandomInt(1, 100))).mul((new BN(10)).pow(new BN(srcDecimals)));
        } else {
            srcQty = await getTradeSrcQty(network, srcToken, destToken, platformFeeBps, hint, revertType);
        }
        callValue = srcToken == ethAddress ? srcQty : zeroBN;
    } else {
        let random = getRandomInt(1, 3);
        switch (random) {
        case 1:
            srcQty = zeroBN;
            break;
        case 2:
            srcQty = maxQty.add(new BN(getRandomInt(1, 1000000)));
            callValue = srcToken == ethAddress ? srcQty : zeroBN;
            break
        default:
            srcQty = (new BN(getRandomInt(1, 100))).mul((new BN(10)).pow(new BN(srcDecimals)));
            if (getRandomInt(0, 100) >= 80) {
                // correct call value
                callValue = srcToken == ethAddress ? srcQty : zeroBN;
            } else {
                callValue = new BN(getRandomInt(0, 1000));
            }
        }
    }
    if (srcToken != ethAddress && srcQty.gt(zeroBN)) {
        let srcQtyToTransfer = srcQty.add(new BN(getRandomInt(1, 20))).sub(new BN(getRandomInt(1, 5)));
        let srcQtyToApprove = srcQtyToTransfer.add(new BN(getRandomInt(1, 20))).sub(new BN(getRandomInt(1, 5)));
        await srcToken.transfer(taker, srcQtyToTransfer);
        await srcToken.approve(networkProxy.address, srcQtyToApprove, {from: taker});
    }

    let expectedRates;
    if (hintRevertType == RevertType.None && BPS.gt(platformFeeBps) && BPS.gt(platformFeeBps.add(networkFeeBps).add(networkFeeBps)) && srcQty.gt(zeroBN) && maxQty.gt(srcQty)) {
        // get expected will revert if fees are invalid
        expectedRates = await network.getExpectedRateWithHintAndFee(getAddress(srcToken), getAddress(destToken), srcQty, platformFeeBps, hint);
        if (expectedRates.rateWithNetworkFee.gt(zeroBN)) {
            if (getRandomInt(0, 100) <= 75) {
                minConversionRate = expectedRates.rateWithNetworkFee.sub(new BN(getRandomInt(0, 100)));
            } else {
                minConversionRate = expectedRates.rateWithNetworkFee.add(new BN(getRandomInt(1, 75)));
            }
        }
    } else {
        expectedRates = {
            rateWithAllFees: zeroBN,
            rateWithNetworkFee: zeroBN
        }
    }

    // disable network with 5% chance
    let isNetworkEnabled = getRandomInt(1, 100) >= 5;
    await network.setEnable(isNetworkEnabled, {from: admin});

    // get correct revert
    let message = "";
    let takerEthBalance = await Helper.getBalancePromise(taker);
    let takerSrcBalance = srcToken == ethAddress ? takerEthBalance : await srcToken.balanceOf(taker);
    // check enough balance for call value
    if (callValue.gt(takerEthBalance)) {
        revertType = RevertType.BAD_ETH_QTY;
        message = "try/catch";
    }
    // check correct src amount
    if (revertType == RevertType.None) {
        if (srcToken == ethAddress && !srcQty.eq(callValue)) {
            revertType = RevertType.BAD_ETH_QTY;
            message = revertType;
        } else if (srcToken != ethAddress && callValue.gt(zeroBN)) {
            revertType = RevertType.WRONG_MSG_VALUE;
            message = revertType;
        }
    }

    // check enough src token balance or allowance
    if (revertType == RevertType.None && srcToken != ethAddress) {
        if (srcQty.gt(takerSrcBalance)) {
            revertType = RevertType.NOT_ENOUGH_SRC_TOKEN;
            message = "unspecified";
        } else {
            let allowance = await srcToken.allowance(taker, networkProxy.address);
            if (srcQty.gt(allowance)) {
                revertType = RevertType.NOT_ENOUGH_ALLOWANCE;
                message = "unspecified";
            }
        }
    }

    // check validate trade input
    if (revertType == RevertType.None && !isNetworkEnabled) {
        revertType = RevertType.NETWORK_DISABLED;
        message = revertType;
    }

    // check gas price
    if (revertType == RevertType.None && gasPrice.gt(maxGasPrice)) {
        revertType = RevertType.GAS_PRICE_HIGH;
        message = revertType;
    }

    // check src qty < max qty
    if (revertType == RevertType.None && srcQty.gt(maxQty)) {
        revertType = RevertType.SRC_AMOUNT_HIGH;
        message = revertType;
    }

    // src is 0
    if (revertType == RevertType.None && srcQty.eq(zeroBN)) {
        revertType = RevertType.ZERO_SRC_AMOUNT;
        message = revertType;
    }

    // recipient is 0x0
    if (revertType == RevertType.None && recipient == zeroAddress) {
        revertType = RevertType.DEST_ADDRESS_ZERO;
        message = revertType;
    }

    // src == dest
    if (revertType == RevertType.None && srcToken == destToken) {
        revertType = RevertType.SAME_SRC_DEST;
        message = revertType;
    }

    // validate fee params
    // platform fee >= BPS
    if (revertType == RevertType.None && !BPS.gt(platformFeeBps)) {
        revertType = RevertType.PLATFORM_FEE_HIGH;
        message = revertType;
    }

    // total fee high
    if (revertType == RevertType.None && !BPS.gt(platformFeeBps.add(networkFeeBps).add(networkFeeBps))) {
        revertType = RevertType.TOTAL_FEES_HIGH;
        message = revertType;
    }

    if (revertType == RevertType.None && expectedRates.rateWithNetworkFee.eq(zeroBN)) {
        revertType = RevertType.ZERO_RATE;
        if (hintRevertType != RevertType.None) {
            // hint error will give zero rates
            revertType = hintRevertType;
        }
        if (revertType == RevertType.HINT_ERROR_RESERVE_ID_NOT_FOUND) {
            // one issue with current implementation
            // if reserve id is not found, it will be reverted
            // because of accessing first element of empty array
            message = "unspecified";
        } else {
            message = "trade invalid, if hint involved, try parseHint API";
        }
    }

    if (revertType == RevertType.None && minConversionRate.gt(expectedRates.rateWithNetworkFee)) {
        revertType = RevertType.MIN_RATE_HIGH;
        message = revertType;
    }

    // generate expected result and actual src qty
    let expectedResult;
    let actualSrcQty;
    if (revertType == RevertType.None && srcQty.gt(zeroBN)) {
        expectedResult = await nwHelper.getAndCalcRates(matchingEngine, storage, reserveInstances,
            getAddress(srcToken), getAddress(destToken), srcQty,
            srcDecimals, destDecimals,
            networkFeeBps, platformFeeBps, hint
        );
        actualSrcQty = srcQty;
    }

    if (revertType == RevertType.ZERO_SRC_AMOUNT) {
        // sometimes zero amount due to no rates
        if (getRandomInt(0, 100) >= 50) {
            revertType = RevertType.None;
            message = "no rate";
        }
    }

    return {
        taker: taker,
        recipient: recipient,
        srcToken: srcToken,
        srcAddress: getAddress(srcToken),
        destToken: destToken,
        destAddress: getAddress(destToken),
        srcQty: srcQty,
        callValue: callValue,
        maxDestAmount: maxDestAmount,
        isTestingMaxDestAmount: false,
        minConversionRate: minConversionRate,
        networkFeeBps: networkFeeBps,
        platformFeeBps: platformFeeBps,
        hint: hint,
        srcDecimals: srcDecimals,
        destDecimals: destDecimals,
        gasPrice: gasPrice,
        message: message,
        revertType: revertType,
        expectedResult: expectedResult,
        actualSrcQty: actualSrcQty
    }
}

// reset all data after trade in case it is reverted
// for example: transfer back src token from taker to accounts[0], reset allowance of taker
// re-enable network if the trade was testing network disable case
module.exports.resetDataAfterTradeReverted = async function resetDataAfterTradeReverted(tradeData, network, proxy, accounts) {
    if (tradeData.revertType == RevertType.None) { return; }
    // transfer back token
    if (tradeData.srcToken != ethAddress) {
        let balance = await tradeData.srcToken.balanceOf(tradeData.taker);
        if (balance.gt(zeroBN)) {
            await tradeData.srcToken.transfer(accounts[0], balance, {from: tradeData.taker});
        }
        await tradeData.srcToken.approve(proxy.address, 0, {from: tradeData.taker});
    }
    // reenable network trade if needed
    if ((await network.enabled()) == false) {
        let admin = await network.admin();
        await network.setEnable(true, {from: admin});
    }
}

// generate trade src qties
// randomize some numbers with expected rate > 0 and put them into an array
// then randomly select one for src qty
async function getTradeSrcQty(network, srcToken, destToken, platformFeeBps, hint, revertType) {
    let srcDecimals = srcToken == ethAddress ? ethDecimals : (await srcToken.decimals());
    if (revertType != RevertType.None) {
        // if error, get expected rate will return 0 for all src qties
        // just return 1 token
        return new BN(10).pow(new BN(srcDecimals));
    }

    let eligibleSrcQtys = []; // list src qty with rate > 0

    let srcAddress = getAddress(srcToken);
    let destAddress = getAddress(destToken);
    let oneToken = new BN(10).pow(new BN(srcDecimals));
    let numberLoops = getRandomInt(5, 20);
    // max 10 eth, 1000 token per trade
    let maxToken = srcAddress == ethAddress ? 1000 : 10000;
    for(let i = 0; i < numberLoops; i++) {
        let srcAmt = (new BN(getRandomInt(1, maxToken)).mul(oneToken)).div(new BN(100));
        let expectedRates = await network.getExpectedRateWithHintAndFee(
            srcAddress,
            destAddress,
            srcAmt,
            platformFeeBps,
            hint
        );
        if (expectedRates.rateWithAllFees.gt(zeroBN)) {
            eligibleSrcQtys.push(srcAmt);
        }
    }
    if (eligibleSrcQtys.length > 0) {
        return eligibleSrcQtys[getRandomInt(0, eligibleSrcQtys.length - 1)];
    }
    return new BN(0);
}

// return hint data for the trade, including revert type of hint
// if hint is correct, return revertType as None
async function getTradeHint(srcToken, destToken, storage, shouldTestRevert) {
    if (shouldTestRevert == false && Math.random() <= 0.2) {
        // 20% empty hint, may be more
        return {
            hint: emptyHint,
            type: "Empty Hint",
            revertType: RevertType.None
        };
    }
    let revertType = shouldTestRevert ? getRevertTypeHintError() : RevertType.None;

    if (srcToken == ethAddress) {
        return await generateE2THint(destToken, storage, revertType);
    } else if (destToken == ethAddress) {
        return await generateT2EHint(srcToken, storage, revertType);
    } else {
        let t2eHintData = await generateT2EHint(srcToken, storage, revertType);
        let e2tHintData = await generateE2THint(destToken, storage, RevertType.None);
        let message = `${t2eHintData.type} - ${e2tHintData.type}`
        return {
            hint: await web3.eth.abi.encodeParameters(['bytes','bytes'], [t2eHintData.hint, e2tHintData.hint]),
            type: message,
            revertType: revertType
        }
    }
}

// Generate pair of tokens to trade
// Randomly selected trade side (e2t, t2e, t2t), can check our stats to have better % of each side
async function getTokenPairs(tokens) {
    // generate src token and dest token
    let tradeSide = getTradeSide();
    let srcToken;
    let srcDecimals;
    let destToken;
    let destDecimals;
    if (tradeSide == T2E) {
        srcToken = tokens[getRandomInt(0, tokens.length - 1)];
        srcDecimals = await srcToken.decimals();
        destToken = ethAddress;
        destDecimals = ethDecimals;
    } else if (tradeSide == E2T) {
        srcToken = ethAddress;
        srcDecimals = ethDecimals;
        destToken = tokens[getRandomInt(0, tokens.length - 1)];
        destDecimals = await destToken.decimals();
    } else { // T2T
        let srcIndex = getRandomInt(0, tokens.length - 1);
        let destIndex = srcIndex;
        while (destIndex == srcIndex) {
            destIndex = getRandomInt(0, tokens.length - 1);
        }
        srcToken = tokens[srcIndex];
        srcDecimals = await srcToken.decimals();
        destToken = tokens[destIndex];
        destDecimals = await destToken.decimals();
    }
    return {
        srcToken: srcToken,
        srcDecimals: srcDecimals,
        destToken: destToken,
        destDecimals: destDecimals,
        tradeSide: tradeSide
    };
}

// generate token to eth trade hint data
async function generateT2EHint(token, storage, revertType) {
    let reserves = await storage.getReserveIdsPerTokenSrc(token.address);
    return generateTradeHintData(reserves, revertType);
}

// generate eth to token trade hint data
async function generateE2THint(token, storage, revertType) {
    let reserves = await storage.getReserveIdsPerTokenDest(token.address);
    return generateTradeHintData(reserves, revertType);
}

// generate trade hint data from reserves and revert type
async function generateTradeHintData(reserves, revertType) {
    let selectedReserves = [];
    let hintType = getHintType(revertType);

    if (revertType != RevertType.None) {
        let splitBpsValues = [];
        [selectedReserves, splitBpsValues] = generateReserveDataWithHintError(hintType, revertType, reserves);
        let hint = await web3.eth.abi.encodeParameters(['uint256','bytes32[]', 'uint256[]'], [hintType, selectedReserves, splitBpsValues]);
        return {
            hint: hint,
            type: hintTypeStr[hintType],
            revertType: revertType
        }
    }

    for(let i = 0; i < reserves.length; i++) {
        if (Math.random() > 0.5) {
            selectedReserves.push(reserves[i]);
        }
    }

    if (selectedReserves.length == 0) {// && (hintType == SPLIT_HINTTYPE || hintType == MASK_IN_HINTTYPE)) {
        // for split or mask in, need at least one reserve
        selectedReserves.push(reserves[getRandomInt(0, reserves.length - 1)]);
    } else if (selectedReserves.length == reserves.length && hintType == MASK_OUT_HINTTYPE) {
        // for mask out, should not mask out all reserves
        selectedReserves.pop();
    }

    let splitBpsValues = [];
    let remainingBps = 10000;
    if (hintType == SPLIT_HINTTYPE) {
        for(let i = 0; i < selectedReserves.length; i++) {
            // put 0.01% for each reserve
            splitBpsValues.push(1);
            remainingBps--;
        }
        // add random extra bps to each reserve
        for(let i = 0; i < selectedReserves.length; i++) {
            if (remainingBps == 0) { break; }
            if (selectedReserves.length - 1 == i) {
                splitBpsValues[i] += remainingBps;
            } else {
                let splitBps = getRandomInt(0, remainingBps);
                splitBpsValues[i] += splitBps;
                remainingBps -= splitBps;
            }
        }
    }

    let hint = await web3.eth.abi.encodeParameters(['uint256','bytes32[]', 'uint256[]'], [hintType, selectedReserves, splitBpsValues]);
    return {
        hint: hint,
        type: hintTypeStr[hintType],
        revertType: RevertType.None
    }
}

// return hint type
// each type has similar percentage to be used
function getHintType(errorType) {
    if (errorType == RevertType.HINT_ERROR_NON_EMPTY_DATA_HINT) {
        // only best of all has this error
        return BEST_OF_ALL_HINTTYPE;
    }
    // only split trade can catch this revert
    if (errorType == RevertType.HINT_ERROR_TOTAL_BPS
        || errorType == RevertType.HINT_ERROR_RESERVE_IDS_SPLITS
        || errorType == RevertType.HINT_ERROR_NOT_INCREASING
        || errorType == RevertType.HINT_ERROR_DUP_RESERVE_ID) {
        return SPLIT_HINTTYPE;
    }
    if (errorType == RevertType.HINT_ERROR_RESERVES_EMPTY) {
        // only split or mask in
        return getRandomInt(0, 100) <= 50 ? SPLIT_HINTTYPE : MASK_IN_HINTTYPE;
    }
    if (errorType == RevertType.HINT_ERROR_SPLIT_NOT_EMPTY) {
        // only mask in or mask out
        return getRandomInt(0, 100) <= 50 ? MASK_IN_HINTTYPE : MASK_OUT_HINTTYPE;
    }
    if (errorType == RevertType.HINT_ERROR_RESERVE_ID_NOT_FOUND) {
        // should exclude mask out
        let rand = getRandomInt(0, 100);
        if (rand < 30) return MASK_IN_HINTTYPE;
        if (rand < 60) return SPLIT_HINTTYPE;
        return BEST_OF_ALL_HINTTYPE;
    }

    let rand = getRandomInt(0, 100);
    if (rand < 30) return MASK_IN_HINTTYPE;
    if (rand < 60) return MASK_OUT_HINTTYPE;
    if (rand < 80) return BEST_OF_ALL_HINTTYPE;
    return SPLIT_HINTTYPE;
}

// generate selected reserve and splits data for hint, given hint type, error type and list of reserves for token
// reserves will be randomly selected
// and split + selected reserve array will be modified to catch the error
function generateReserveDataWithHintError(hintType, errorType, reserves) {
    let selectedReserves = [];
    let splits = [];

    if (errorType == RevertType.HINT_ERROR_RESERVES_EMPTY) {
        return [selectedReserves, splits];
    }

    // make order of reserves randomly
    for(let i = 0; i < reserves.length; i++) {
        let firstId = getRandomInt(0, reserves.length - 1);
        let secondId = getRandomInt(0, reserves.length - 1);
        [reserves[firstId], reserves[secondId]] = [reserves[secondId], reserves[firstId]];
    }

    let numReserves = getRandomInt(2, reserves.length);
    for(let i = 0; i < numReserves; i++) {
        selectedReserves.push(reserves[i]);
    }

    let totalBps = 0;
    let numberSplits = 0;

    if (errorType == RevertType.HINT_ERROR_NON_EMPTY_DATA_HINT) {
        if (getRandomInt(0, 100) >= 50) {
            // empty reserve ids, should have splits
            selectedReserves = [];
            totalBps = getRandomInt(10000, 20000);
            numberSplits = getRandomInt(1, 10);
        } else {
            // non empty reserve ids, can have empty or non-empty splits
            numberSplits = getRandomInt(0, 5);
            if (numberSplits > 0) { totalBps = getRandomInt(10000, 20000); }
        }
    }

    if (errorType == RevertType.HINT_ERROR_DUP_RESERVE_ID) {
        let reserveId = getRandomInt(0, selectedReserves.length - 1);
        selectedReserves.push(selectedReserves[reserveId]);
        if (hintType == SPLIT_HINTTYPE) {
            totalBps = 10000;
            numberSplits = selectedReserves.length;
        }
    }
    if (errorType == RevertType.HINT_ERROR_RESERVE_IDS_SPLITS) {
        numberSplits = getRandomInt(1, selectedReserves.length - 1);
        totalSplits = 10000;
    }
    if (errorType == RevertType.HINT_ERROR_NOT_INCREASING) {
        for(let i = 0; i < selectedReserves.length - 1; i++) {
            if (selectedReserves[i] < selectedReserves[i + 1]) {
                [selectedReserves[i], selectedReserves[i + 1]] = [selectedReserves[i + 1], selectedReserves[i]];
                break;
            }
        }
        totalBps = 10000;
        numberSplits = selectedReserves.length;
    }
    if (errorType == RevertType.HINT_ERROR_RESERVE_ID_NOT_FOUND) {
        let reserveID = '0x22000000' + zeroAddress.substring(2,20) + "0".repeat(38);
        selectedReserves.push(reserveID);
        if (hintType == SPLIT_HINTTYPE) {
            totalBps = 10000;
            numberSplits = selectedReserves.length;
        }
    }
    if (errorType == RevertType.HINT_ERROR_SPLIT_NOT_EMPTY) {
        totalBps = 10000;
        numberSplits = getRandomInt(1, selectedReserves.length);
    }
    if (errorType == RevertType.HINT_ERROR_TOKEN_NOT_LISTED) {
        // TODO:
    }
    if (errorType == RevertType.HINT_ERROR_TOTAL_BPS) {
        if (getRandomInt(0, 100) > 50) {
            totalBps = getRandomInt(0, 9999);
        } else {
            totalBps = 10000 + getRandomInt(1, 10000);
        }
        numberSplits = selectedReserves.length;
    }

    let splitSoFar = 0;
    for(let i = 0; i < numberSplits; i++) {
        if (i == numberSplits - 1) {
            splits.push(totalBps - splitSoFar);
        } else {
            let splitBps = Math.floor(totalBps / numberSplits);
            splitBps = getRandomInt(1, splitBps);
            splits.push(splitBps);
            splitSoFar += splitBps;
        }
    }

    return [selectedReserves, splits];
}

// Get max dest type, either high max dest or low max dest (maxDestAmount < expectedDestAmount)
// most of trades should be high max dest
function getMaxDestType() {
    let rand = getRandomInt(0, 100);
    if (rand < 95) { return MAX_DEST_HIGH; }
    return MAX_DEST_LOW;
}

// return minConversionRate and is testing min conversion rate given expectedRate
// if is testing min conversion rate, return minConversionRate which is lower than expectedRate
// if not testing min conversion rate, make minConversionRate >= expectedRate
function getMinConversionRateData(expectedRate) {
    let isTestingMinConversionRate;
    let minConversionRate;
    let rand = getRandomInt(0, 100);
    // many trades have actual rate < min conversion rate
    if (rand < 80) {
        // min rate is lower than actual rate
        isTestingMinConversionRate = false;
        minConversionRate = expectedRate.mul(BPS.sub(new BN(getRandomInt(1, 10000)))).div(BPS);
    } else {
        minConversionRate = expectedRate.add(new BN(1));
        isTestingMinConversionRate = true;
    }
    // min rate is higher than acutal rate
    return [minConversionRate, isTestingMinConversionRate];
}

// get type of revert for hint error
// Consider as a small probility to get error hint when trading
// as with error hint get expected rate should have returned 0
// Make each revert hint error has equal chance to happen
function getRevertTypeHintError() {
    // should revert
    let number = getRandomInt(0, 8);
    switch (number) {
        case 0:
            return RevertType.HINT_ERROR_NON_EMPTY_DATA_HINT;
        case 1:
            return RevertType.HINT_ERROR_DUP_RESERVE_ID;
        case 2:
            return RevertType.HINT_ERROR_RESERVES_EMPTY;
        case 3:
            return RevertType.HINT_ERROR_RESERVE_IDS_SPLITS;
        case 4:
            return RevertType.HINT_ERROR_NOT_INCREASING;
        case 5:
            return RevertType.HINT_ERROR_RESERVE_ID_NOT_FOUND;
        case 6:
            return RevertType.HINT_ERROR_SPLIT_NOT_EMPTY;
        case 7:
            // TODO: Make token not listed
            return RevertType.None;//RevertType.HINT_ERROR_TOKEN_NOT_LISTED;
        case 8:
            return RevertType.HINT_ERROR_TOTAL_BPS;
        default:
            return RevertType.None;
    }
}

// get trade side: t2e, e2t or t2t
// change percentage depends on our data
function getTradeSide() {
    let rand = getRandomInt(0, 100);
    if (rand < 60) { return T2T; }
    if (rand < 80) { return T2E; }
    return E2T;
}

module.exports.getRandomInt = getRandomInt;
function getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Return address for a token
module.exports.getAddress = getAddress;
function getAddress(token) {
    return token == ethAddress ? ethAddress : token.address;
}
