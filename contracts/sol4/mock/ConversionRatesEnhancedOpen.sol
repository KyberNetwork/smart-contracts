pragma solidity 0.4.18;

import "../reserves/fprConversionRate/ConversionRateEnhancedSteps.sol";

/**
 *   @title ConversionRateEnhancedOpen
 *   Inherits ConversionRateEnhancedSteps.
 *   Supports API to check new getRate logic by exposing internal data.
 *   Additional API enables 2 options: 
 *      - get rate queries that also show steps data (accumulated Y value).
 *      - query get rate with fake imbalance.
 */
contract ConversionRateEnhancedOpen is ConversionRateEnhancedSteps {

    function ConversionRateEnhancedOpen(address _admin) public 
        ConversionRateEnhancedSteps(_admin)
        { } // solhint-disable-line no-empty-blocks

    ///@dev enables calling get rate and watching extra BPS from step function.
    ///@dev doesn't check: token listed, valid rate duration.
    ///         this logic isn't required since only used to show getRate internal values. extra logic isn't
    ///@dev rateWithSteps value should be equal to rate value from getRate call
    function getRateOpenData(
        ERC20 token, 
        bool buy, 
        uint qty 
    ) public view returns(
        uint rateWithSteps,
        uint rateWithoutSteps,
        int extraBpsYdata
    ) {
        // get rate update block
        bytes32 compactData = tokenRatesCompactData[tokenData[token].compactDataArrayIndex];

        uint updateRateBlock = getLast4Bytes(compactData);

        // check imbalance
        int totalImbalance;
        int blockImbalance;
        (totalImbalance, blockImbalance) = getImbalance(token, updateRateBlock, block.number);

        return getRateDataFakeImbalance(token, buy, qty, totalImbalance);
    }

    ///@dev enables calling get rate and watching extra BPS from step function.
    ///@dev can supply fake imbalance and see steps values with this fake imbalance.
    function getRateDataFakeImbalance(
        ERC20 token,
        bool buy, 
        uint qty,
        int fakeImbalance
    ) public view returns (
        uint rateWithSteps,
        uint rateWithoutSteps,
        int extraBpsYdata) 
    {
        // get rate update block
        bytes32 compactData = tokenRatesCompactData[tokenData[token].compactDataArrayIndex];

        // calculate actual rate
        int imbalanceQty;
        int8 rateUpdate;

        if (buy) {
            // start with base rate
            rateWithoutSteps = tokenData[token].baseBuyRate;

            // add rate update
            rateUpdate = getRateByteFromCompactData(compactData, token, true);
            extraBpsYdata = int(rateUpdate) * 10;
            rateWithoutSteps = addBps(rateWithoutSteps, extraBpsYdata);

            // compute token qty
            qty = getTokenQty(token, qty, rateWithoutSteps);
            imbalanceQty = int(qty);

            // add imbalance overhead
            extraBpsYdata = executeStepFunction(
                tokenData[token].buyRateImbalanceStepFunction,
                fakeImbalance,
                fakeImbalance + imbalanceQty
            );
            rateWithSteps = addBps(rateWithoutSteps, extraBpsYdata);
        } else {
            // start with base rate
            rateWithoutSteps = tokenData[token].baseSellRate;

            // add rate update
            rateUpdate = getRateByteFromCompactData(compactData, token, false);
            extraBpsYdata = int(rateUpdate) * 10;
            rateWithoutSteps = addBps(rateWithoutSteps, extraBpsYdata);

            // compute token qty
            imbalanceQty = -1 * int(qty);

            // add imbalance overhead
            extraBpsYdata = executeStepFunction(
                tokenData[token].sellRateImbalanceStepFunction,
                fakeImbalance + imbalanceQty,
                fakeImbalance
            );
            rateWithSteps = addBps(rateWithoutSteps, extraBpsYdata);
        }
    }
}
