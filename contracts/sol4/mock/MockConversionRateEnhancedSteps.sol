pragma solidity ^0.4.18;

import "../reserves/fprConversionRate/ConversionRateEnhancedSteps.sol";


contract MockConversionRateEnhancedSteps is ConversionRateEnhancedSteps {
    function MockConversionRateEnhancedSteps(address admin) public 
        ConversionRateEnhancedSteps(admin)
    {  /* empty block */ }

    function mockGetImbalance(ERC20 token, uint rateUpdateBlock, uint currentBlock) public view
        returns(int totalImbalance, int currentBlockImbalance)
    {
        (totalImbalance, currentBlockImbalance) = 
            getImbalance(token, rateUpdateBlock, currentBlock);
    }

    function mockGetMaxTotalImbalance(ERC20 token) public view returns(uint) {
        return getMaxTotalImbalance(token);
    }

    function getUpdateRateBlockFromCompact (ERC20 token) 
        public view returns(uint updateRateBlock) 
    {
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
}
