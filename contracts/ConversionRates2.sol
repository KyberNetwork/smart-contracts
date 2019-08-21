pragma solidity 0.4.18;

import "./ERC20Interface.sol";
import "./ConversionRates.sol";

/// @title ConversionRates2 contract - new ConversionRates contract with step function enhancement
/// Also fixed issue: https://github.com/KyberNetwork/smart-contracts/issues/291

contract ConversionRates2 is ConversionRates {

    function ConversionRates2(address _admin) public ConversionRates(_admin)
        { } // solhint-disable-line no-empty-blocks

    function setQtyStepFunction(
        ERC20 token,
        int[] xBuy,
        int[] yBuy,
        int[] xSell,
        int[] ySell
    )
        public
        onlyOperator
    {
        require(xBuy.length + 1 == yBuy.length);
        require(xSell.length + 1 == ySell.length);
        require(xBuy.length <= MAX_STEPS_IN_FUNCTION);
        require(xSell.length <= MAX_STEPS_IN_FUNCTION);
        require(tokenData[token].listed);

        if (xBuy.length > 0) {
            // verify qty are non-negative & increasing
            require(xBuy[0] >= 0);

            for(uint i = 0; i < xBuy.length - 1; i++) {
                require(xBuy[i] < xBuy[i + 1]);
            }
        }

        if (xSell.length > 0) {
            // verify qty are non-negative & increasing
            require(xSell[0] >= 0);
            for(i = 0; i < xSell.length - 1; i++) {
                require(xSell[i] < xSell[i + 1]);
            }
        }

        tokenData[token].buyRateQtyStepFunction = StepFunction(xBuy, yBuy);
        tokenData[token].sellRateQtyStepFunction = StepFunction(xSell, ySell);
    }

    function setImbalanceStepFunction(
        ERC20 token,
        int[] xBuy,
        int[] yBuy,
        int[] xSell,
        int[] ySell
    )
        public
        onlyOperator
    {
        require(xBuy.length + 1 == yBuy.length);
        require(xSell.length + 1 == ySell.length);
        require(xBuy.length <= MAX_STEPS_IN_FUNCTION);
        require(xSell.length <= MAX_STEPS_IN_FUNCTION);
        require(tokenData[token].listed);

        if (xBuy.length > 1) {
            // verify qty are increasing
            for(uint i = 0; i < xBuy.length - 1; i++) {
                require(xBuy[i] < xBuy[i + 1]);
            }
        }

        if (xSell.length > 1) {
            // verify qty are increasing
            for(i = 0; i < xSell.length - 1; i++) {
                require(xSell[i] < xSell[i + 1]);
            }
        }

        tokenData[token].buyRateImbalanceStepFunction = StepFunction(xBuy, yBuy);
        tokenData[token].sellRateImbalanceStepFunction = StepFunction(xSell, ySell);
    }

    /* solhint-disable function-max-lines */
    function getRate(ERC20 token, uint currentBlockNumber, bool buy, uint qty) public view returns(uint) {
        // check if trade is enabled
        if (!tokenData[token].enabled) return 0;
        if (tokenControlInfo[token].minimalRecordResolution == 0) return 0; // token control info not set

        // get rate update block
        bytes32 compactData = tokenRatesCompactData[tokenData[token].compactDataArrayIndex];

        uint updateRateBlock = getLast4Bytes(compactData);
        if (currentBlockNumber >= updateRateBlock + validRateDurationInBlocks) return 0; // rate is expired
        // check imbalance
        int totalImbalance;
        int blockImbalance;
        (totalImbalance, blockImbalance) = getImbalance(token, updateRateBlock, currentBlockNumber);

        // calculate actual rate
        int imbalanceQty;
        int extraBps;
        int8 rateUpdate;
        uint rate;

        if (buy) {
            // start with base rate
            rate = tokenData[token].baseBuyRate;

            // add rate update
            rateUpdate = getRateByteFromCompactData(compactData, token, true);
            extraBps = int(rateUpdate) * 10;
            rate = addBps(rate, extraBps);

            // compute token qty
            qty = getTokenQty(token, qty, rate);
            imbalanceQty = int(qty);

            // add qty overhead
            extraBps = executeStepFunction(tokenData[token].buyRateQtyStepFunction, 0, int(qty));
            rate = addBps(rate, extraBps);

            // add imbalance overhead
            extraBps = executeStepFunction(tokenData[token].buyRateImbalanceStepFunction, totalImbalance, totalImbalance + imbalanceQty);
            rate = addBps(rate, extraBps);
            totalImbalance += imbalanceQty;
        } else {
            // start with base rate
            rate = tokenData[token].baseSellRate;

            // add rate update
            rateUpdate = getRateByteFromCompactData(compactData, token, false);
            extraBps = int(rateUpdate) * 10;
            rate = addBps(rate, extraBps);

            // compute token qty
            imbalanceQty = -1 * int(qty);

            // add qty overhead
            extraBps = executeStepFunction(tokenData[token].sellRateQtyStepFunction, 0, int(qty));
            rate = addBps(rate, extraBps);

            // add imbalance overhead
            extraBps = executeStepFunction(tokenData[token].sellRateImbalanceStepFunction, totalImbalance + imbalanceQty, totalImbalance);
            rate = addBps(rate, extraBps);
            totalImbalance += imbalanceQty;
        }

        if (abs(totalImbalance) >= getMaxTotalImbalance(token)) return 0;
        if (abs(blockImbalance + imbalanceQty) >= getMaxPerBlockImbalance(token)) return 0;

        return rate;
    }

    function executeStepFunction(StepFunction f, int from, int to) internal pure returns(int) {
        if (f.y.length == 0) { return 0; }

        uint len = f.x.length;
        uint ind;

        if (from >= to) {
            // fallback to old logics, should only happen when trade amount = 0, from == to
            for(ind = 0; ind < len; ind++) {
                if (from <= f.x[ind]) { return f.y[ind]; }
            }
            return f.y[len];
        }

        int lastStepAmount = from; // amount from last step to compute amount to be applied bps for next step
        int change = 0; // amount change from initial amount when applying bps for each step
        int fx;

        for(ind = 0; ind < len; ind++) {
            fx = f.x[ind];
            if (fx <= lastStepAmount) { continue; }
            // lastStepAmount < fx
            if (fx >= to) {
                change += (to - lastStepAmount) * f.y[ind];
                lastStepAmount = to;
                break;
            } else {
                change += (fx - lastStepAmount) * f.y[ind];
                lastStepAmount = fx;
            }
        }

        if (lastStepAmount < to) {
            change += (to - lastStepAmount) * f.y[len];
        }

        return change / (to - from);
    }
}
