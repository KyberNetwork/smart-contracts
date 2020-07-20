pragma solidity 0.4.18;

import "../reserves/fprConversionRate/ConversionRateEnhancedSteps.sol";


contract ConversionRateEnhancedOpen is ConversionRateEnhancedSteps {

    function ConversionRateEnhancedOpen(address _admin) public 
        ConversionRateEnhancedSteps(_admin)
        { } // solhint-disable-line no-empty-blocks

    function getRateOpenData(
        ERC20 token, 
        uint currentBlockNumber, 
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
        if (currentBlockNumber >= updateRateBlock + validRateDurationInBlocks) return (0, 0, 0); // rate is expired
        // check imbalance
        int totalImbalance;
        int blockImbalance;
        (totalImbalance, blockImbalance) = getImbalance(token, updateRateBlock, currentBlockNumber);

        return getRateDataFakeImbalance(token, buy, qty, totalImbalance);
    }

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
