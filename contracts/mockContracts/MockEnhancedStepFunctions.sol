pragma solidity ^0.4.18;


import "../EnhancedStepFunctions.sol";

contract MockEnhancedStepFunctions is EnhancedStepFunctions {

    function MockEnhancedStepFunctions(address admin) EnhancedStepFunctions(admin) public {

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

    function mockEncodeStepData(int120 x, int120 y) public pure returns (int) {
        return encodeStepFunctionData(x, y);
    }

    function mockDecodeStepData(int val) public pure returns (int, int) {
        return decodeStepFunctionData(val);
    }

    function mockAddBps(uint rate, int bps) public pure returns(uint) {
        return addBps(rate, bps);
    }

    function mockCheckMultiOverflow(int x, int y) public pure returns (bool) {
        return checkMultOverflow(x, y);
    }
}
