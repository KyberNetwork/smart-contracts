pragma solidity ^0.4.18;


import "../ConversionRates2.sol";

contract MockConversionRate2 is ConversionRates2 {
    function MockConversionRate2(address admin) ConversionRates2(admin) public {

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

    // this for testing execute step func, only use imbalance step as qty can be negative 
    function mockExecuteStepFunction(ERC20 token, int qty) public view returns (int) {
        return executeStepFunction(tokenData[token].buyRateImbalanceStepFunction, qty);
    }

    function mockAddBps(uint rate, int bps) public pure returns(uint) {
        return addBps(rate, bps);
    }
}
