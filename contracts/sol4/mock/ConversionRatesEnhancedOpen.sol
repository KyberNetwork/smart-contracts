pragma solidity 0.4.18;

import "../reserves/fprConversionRate/ConversionRateEnhancedSteps.sol";


contract ConversionRatesEnhancedOpen is ConversionRateEnhancedSteps {

    function ConversionRatesEnhancedOpen(address _admin) public ConversionRateEnhancedSteps(_admin)
        { } // solhint-disable-line no-empty-blocks

    function getFullRateData(ERC20 token, bool buy, int fakeImb, uint qty) public view 
        returns(
            int imbalance,
            uint accumulatedYBps,
            uint rateWithSteps,
            uint rateWithOutSteps,
            uint rateFormula
        )
    {

        uint updateRateBlock = getLast4Bytes(compactData);

        // check imbalance
        (imbalance, ) = getImbalance(token, updateRateBlock, currentBlockNumber);

        return getFullRateDataFakeImb(token, buy, imbalance, qty);
    }

    function getFullRateDataFakeImb(ERC20 token, bool buy, int fakeImb, uint qty) public view 
        returns(
            uint extraBpss,
            uint rateWithSteps,
            uint rateWithOutSteps,
            uint rateFormula
        )
    {

        rateWithOutSteps = getRateWithoutSteps(token, buy);

        uint updateRateBlock = getLast4Bytes(compactData);
        uint imbalanceQty;

        if(buy) {
            // compute token qty
            qty = getTokenQty(token, qty, rateWithOutSteps);
            imbalanceQty = int(qty);
        } else {
            imbalanceQty = -1 * int(qty);
        }

        extraBps = 
            executeStepFunction(
                buy == true ? 
                    tokenData[token].buyRateImbalanceStepFunction : 
                    tokenData[token].sellRateImbalanceStepFunction, 
                fakeImbalance, 
                fakeImbalance + imbalanceQty
            );
        
        rateWithSteps = addBps(rateWithOutSteps, extraBps);

        // spyros Formula: 10000*((rate_with - rate_without)/rate_without
        rateFormula = (BPS * (rateWithSteps - rateWithoutSteps)) / rateWithOutSteps;
    }

    public getRateWithoutSteps(ERC20 token, bool buy) public view returns(uint rate) {
        // calculate actual rate
        int extraBps;
        int8 rateUpdate;

        if (buy) {
            // start with base rate
            rate = tokenData[token].baseBuyRate;

            // add rate update
            rateUpdate = getRateByteFromCompactData(compactData, token, true);
            extraBps = int(rateUpdate) * 10;
            rate = addBps(rate, extraBps);
        } else {
            // start with base rate
            rate = tokenData[token].baseSellRate;

            // add rate update
            rateUpdate = getRateByteFromCompactData(compactData, token, false);
            extraBps = int(rateUpdate) * 10;
            rate = addBps(rate, extraBps);
        }

        return rate;
    }

    function getAccumulatedYBps(ERC20 toekn, uint amount) {

    }
}
