pragma solidity ^0.4.18;

import "../reserves/fprConversionRate/ConversionRates.sol";


contract MockConversionRate is ConversionRates {
    function MockConversionRate(address admin) ConversionRates(admin) public {

    }

    function mockGetImbalance(ERC20 token, uint rateUpdateBlock, uint currentBlock) public view
        returns(int totalImbalance, int currentBlockImbalance)
    {
        (totalImbalance, currentBlockImbalance) = getImbalance(token, rateUpdateBlock, currentBlock);
//        return(totalImbalance, currentBlockImbalance);
    }

    function mockGetMaxTotalImbalance(ERC20 token) public view returns(uint) {
        return getMaxTotalImbalance(token);
    }

    function getUpdateRateBlockFromCompact (ERC20 token) public view returns(uint updateRateBlock) {
        // get rate update block
        bytes32 compactData = tokenRatesCompactData[tokenData[token].compactDataArrayIndex];
        updateRateBlock = getLast4Bytes(compactData);
    }

    function mockAddBps(uint rate, int bps) public pure returns(uint) {
        return addBps(rate, bps);
    }

    function mockIsTokenTradeEnabled(address token) public view returns (bool) {
        return tokenData[token].enabled;
    }

    function getInitImbalance(ERC20 token) public view returns(int totalImbalance) {
        // check if trade is enabled
        if (!tokenData[token].enabled) return 0;
        if (tokenControlInfo[token].minimalRecordResolution == 0) return 0; // token control info not set

        // get rate update block
        bytes32 compactData = tokenRatesCompactData[tokenData[token].compactDataArrayIndex];

        uint updateRateBlock = getLast4Bytes(compactData);
        // check imbalance
        (totalImbalance, ) = getImbalance(token, updateRateBlock, block.number);
    }
}
