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

    function mockGetRateByteFromCompact(ERC20 token, bool isBuy) public view returns (int rateCompact) {
        bytes32 compactData = tokenRatesCompactData[tokenData[token].compactDataArrayIndex];
        int8 rateUpdate = getRateByteFromCompactData(compactData, token, isBuy);
        rateCompact = int(rateUpdate);
        return rateCompact;
    }

    function mockExecuteStepFunction(ERC20 token, int from, int to) public view returns (int) {
        return executeStepFunction(tokenData[token].buyRateImbalanceStepFunction, from, to);
    }

    function mockAddBps(uint rate, int bps) public pure returns(uint) {
        return addBps(rate, bps);
    }
}
