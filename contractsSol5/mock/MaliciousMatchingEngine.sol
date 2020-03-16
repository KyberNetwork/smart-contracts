pragma solidity 0.5.11;

import "../KyberMatchingEngine.sol";


contract MaliciousMatchingEngine is KyberMatchingEngine {
    constructor(address _admin) public
        KyberMatchingEngine(_admin)
    { /* empty body */ }

    //remove require check for EthToToken
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
                srcAmountWithFee = srcAmount - networkFee;
            } else {
                srcAmountWithFee = srcAmount;
            }
            rates[i] = reserve.getConversionRate(
                src,
                dest,
                srcAmountWithFee,
                block.number);

            destAmount = srcAmountWithFee * rates[i];
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
            destAmount = srcAmountWithFee * rates[i];
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
}