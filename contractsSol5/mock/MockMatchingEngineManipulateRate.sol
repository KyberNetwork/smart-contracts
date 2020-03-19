pragma  solidity 0.5.11;

import "../KyberMatchingEngine.sol";

// Mock Malicious MatchingEngine that can manipulate the exchange rate
// As reserve and network trust matchingEngine, reserve will trade with whatever rate
// that matchingEngine has returned to network
// So matching engine can manipulate to let user trade with higher/lower rate
// or even trade with all reserve's balance
contract MockMatchingEngineManipulateRate is KyberMatchingEngine {

    // 10000: taken all reserve, otherwise apply change to rate from reserve
    int public changePriceInBps;

    constructor(address _admin) public
        KyberMatchingEngine(_admin)
    { /* empty body */ }

    function setChangePriceInBps(int newChange) public {
        changePriceInBps = newChange;
    }

    // Try to manipulate rate when get rate from reserve
    /// @notice Calculates the resulting destQty for split trades. For src -> ETH, it additionally returns
    /// the feePayingReservesBps and numFeePayingReserves. ETH -> dest does not need this information,
    /// as they would be calculated and accounted for before this function is called.
    /// @dev Should any reserve return a zero rate, then we nullify the trade by returning zero destQty
    function getDestQtyAndFeeDataFromSplits(
        TradingReserves memory tradingReserves,
        IERC20 token,
        uint tradeAmt,
        bool isTokenToEth
    )
        internal
        view
        returns (uint destQty, uint feePayingReservesBps, uint numFeePayingReserves)
    {
        IKyberReserve reserve;
        uint splitAmount;
        uint amountSoFar;
        uint destAmount;
        tradingReserves.isFeePaying = getIsFeePayingReserves(tradingReserves.addresses);

        for (uint i = 0; i < tradingReserves.addresses.length; i++) {
            reserve = tradingReserves.addresses[i];
            //calculate split and corresponding trade amounts
            splitAmount = (i == tradingReserves.splitValuesBps.length - 1) ?
                                (tradeAmt - amountSoFar) :
                                tradingReserves.splitValuesBps[i] * tradeAmt / BPS;
            amountSoFar += splitAmount;
            if (isTokenToEth) {
                (tradingReserves.rates[i], destAmount) = getRateFromReserve(reserve, token, ETH_TOKEN_ADDRESS, splitAmount);
                //if zero rate for any split reserve, return zero destQty
                if (tradingReserves.rates[i] == 0) {
                    return (0, 0, 0);
                }
                destQty += destAmount;
                if (tradingReserves.isFeePaying[i]) {
                    feePayingReservesBps += tradingReserves.splitValuesBps[i];
                    numFeePayingReserves++;
                }
            } else {
                (tradingReserves.rates[i], destAmount) = getRateFromReserve(reserve, ETH_TOKEN_ADDRESS, token, splitAmount);
                //if zero rate for any split reserve, return zero destQty
                if (tradingReserves.rates[i] == 0) {
                    return (0, 0, 0);
                }
                destQty += destAmount;
            }
        }
    }

    // Try to manipulate rate when get rate from reserve
    /// @dev When calling this function, either src or dest MUST be ETH. Cannot search for token -> token
    /// @dev If the iterated reserve is fee paying, then we have to farther deduct the network fee from srcAmount
    /// @param reserveArr reserve candidates to be iterated over
    /// @param src source token.
    /// @param dest destination token.
    /// @param srcAmount For src -> ETH, user srcAmount. For ETH -> dest, it's tradeWei minus deducted fees.
    ///     notice, t2e network fee not deducted yet, till we know if e2t reseve is fee paying.
    /// @param networkFee will be used differently for token -> ETH / ETH -> token
    ///     For src -> ETH, network fee = networkFeeBps
    ///     For ETH -> dest, network fee = tradeWei * networkFeeBps / BPS instead of networkFeeBps,
    ///     because the srcAmount passed is not tradeWei. Hence, networkFee has to be calculated beforehand
    function searchBestRate(IKyberReserve[] memory reserveArr, IERC20 src, IERC20 dest, uint srcAmount, uint networkFee)
        internal
        view
        returns(IKyberReserve reserve, uint, bool isFeePaying)
    {
        //use destAmounts for comparison, but return the best rate
        BestReserveInfo memory bestReserve;
        bestReserve.numRelevantReserves = 1; // assume always best reserve will be relevant

        //return 1:1 for ether to ether
        if (src == dest) return (IKyberReserve(0), PRECISION, false);
        //return zero rate for empty reserve array (unlisted token)
        if (reserveArr.length == 0) return (IKyberReserve(0), 0, false);

        uint[] memory rates = new uint[](reserveArr.length);
        uint[] memory reserveCandidates = new uint[](reserveArr.length);
        bool[] memory feePayingPerReserve = getIsFeePayingReserves(reserveArr);

        uint destAmount;
        uint srcAmountWithFee;

        for (uint i = 0; i < reserveArr.length; i++) {
            reserve = reserveArr[i];
            isFeePaying = feePayingPerReserve[i];
            //for ETH -> token paying reserve, networkFee is specified in amount
            if (src == ETH_TOKEN_ADDRESS && isFeePaying) {
                require(srcAmount > networkFee, "fee >= e2t tradeAmt");
                srcAmountWithFee = srcAmount - networkFee;
            } else {
                srcAmountWithFee = srcAmount;
            }
            (rates[i], destAmount) = getRateFromReserve(reserve, src, dest, srcAmountWithFee);

             //for token -> ETH paying reserve, networkFee is specified in bps
            destAmount = (dest == ETH_TOKEN_ADDRESS && isFeePaying) ?
                destAmount * (BPS - networkFee) / BPS :
                destAmount;

            if (destAmount > bestReserve.destAmount) {
                //best rate is highest rate
                bestReserve.destAmount = destAmount;
                bestReserve.index = i;
            }
        }

        if (bestReserve.destAmount == 0) return (reserveArr[bestReserve.index], 0, false);

        reserveCandidates[0] = bestReserve.index;

        // if this reserve pays fee its actual rate is less. so smallestRelevantRate is smaller.
        bestReserve.destAmount = bestReserve.destAmount * BPS / (BPS + negligibleRateDiffBps);

        for (uint i = 0; i < reserveArr.length; i++) {

            if (i == bestReserve.index) continue;

            isFeePaying = feePayingPerReserve[i];
            srcAmountWithFee = ((src == ETH_TOKEN_ADDRESS) && isFeePaying) ?
                srcAmount - networkFee :
                srcAmount;
            (, destAmount) = getRateFromReserve(reserve, src, dest, srcAmountWithFee);
            destAmount = (dest == ETH_TOKEN_ADDRESS && isFeePaying) ?
                destAmount * (BPS - networkFee) / BPS :
                destAmount;

            if (destAmount > bestReserve.destAmount) {
                reserveCandidates[bestReserve.numRelevantReserves++] = i;
            }
        }

        if (bestReserve.numRelevantReserves > 1) {
            //when encountering small rate diff from bestRate. draw from relevant reserves
            bestReserve.index = reserveCandidates[uint(blockhash(block.number-1)) % bestReserve.numRelevantReserves];
        } else {
            bestReserve.index = reserveCandidates[0];
        }

        return (reserveArr[bestReserve.index], rates[bestReserve.index], feePayingPerReserve[bestReserve.index]);
    }

    // Return different rate from reserve's rate
    function getRateFromReserve(IKyberReserve reserve, IERC20 src, IERC20 dest, uint srcAmount) internal view returns (uint rate, uint destAmount) {
        if (changePriceInBps == 10000) { // taken all reserve's balance
            destAmount = dest == ETH_TOKEN_ADDRESS ? address(reserve).balance : dest.balanceOf(address(reserve));
            rate = calcRateFromQty(srcAmount, destAmount, getDecimals(src), getDecimals(dest));
        } else {
            rate = reserve.getConversionRate(
                src,
                dest,
                srcAmount,
                block.number
            );
            rate = rate * uint(10000 + changePriceInBps) / 10000;
            destAmount = calcDestAmount(src, dest, srcAmount, rate);
        }
    }
}
