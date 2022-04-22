pragma solidity 0.4.18;

import "../reserves/nimbleReserveHighRate.sol";

/// @title nimble Reserve contract
/// reuses nimbleReserve.sol contract while overriding a few functions / values.
/// Update MAX_RATE to higher value and should have maximum code reuse
contract MocknimbleReserveHighRate is nimbleReserveHighRate {

    function MocknimbleReserveHighRate(
        address _nimbleNetwork, 
        ConversionRatesInterface _ratesContract,
        address _admin
        ) 
        public nimbleReserveHighRate(_nimbleNetwork, _ratesContract, _admin)
        { /* empty block */ }

    function mockCalcDstQty(uint srcQty, uint srcDecimals, uint dstDecimals, uint rate)
        public pure returns(uint)
    {
        return calcDstQty(srcQty, srcDecimals, dstDecimals, rate);
    }

    function mockCalcSrcQty(uint dstQty, uint srcDecimals, uint dstDecimals, uint rate)
        public pure returns(uint) 
    {
        return calcSrcQty(dstQty, srcDecimals, dstDecimals, rate);
    }
}
