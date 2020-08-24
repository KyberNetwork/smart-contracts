pragma solidity ^0.4.18;

import "../reserves/fprConversionRate/ConversionRateEnhancedSteps.sol";


contract MockEnhancedStepFunctions is ConversionRateEnhancedSteps {

    function MockEnhancedStepFunctions(address admin) ConversionRateEnhancedSteps(admin) public {

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

    function mockGetMaxTotalImbalance(ERC20 token) public view returns(uint) {
        return getMaxTotalImbalance(token);
    }

    function getUpdateRateBlockFromCompact (ERC20 token) public view returns(uint updateRateBlock) {
        // get rate update block
        bytes32 compactData = tokenRatesCompactData[tokenData[token].compactDataArrayIndex];
        updateRateBlock = getLast4Bytes(compactData);
    }

    function mockExecuteStepFunction(ERC20 token, int from, int to) public view returns (int) {
        return executeStepFunction(tokenData[token].buyRateImbalanceStepFunction, from, to);
    }

    function mockGetImbalanceMax() public pure returns (int) {
        return MAX_IMBALANCE;
    }

    function mockEncodeStepData(int128 x, int128 y) public pure returns (int) {
        return encodeStepFunctionData(x, y);
    }

    function mockDecodeStepData(int val) public pure returns (int, int) {
        return decodeStepFunctionData(val);
    }

    function mockCheckValueMaxImbalance(uint maxVal) public pure returns(bool) {
        return int(maxVal) == MAX_IMBALANCE;
    }

    function mockAddBps(uint rate, int bps) public pure returns(uint) {
        return addBps(rate, bps);
    }

    function mockCheckMultiOverflow(int x, int y) public pure returns (bool) {
        return checkMultOverflow(x, y);
    }
}
