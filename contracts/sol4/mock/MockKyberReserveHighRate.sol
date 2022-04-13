pragma solidity 0.4.18;

import "../reserves/NimbleReserveHighRate.sol";

/// @title Nimble Reserve contract
/// reuses NimbleReserve.sol contract while overriding a few functions / values.
/// Update MAX_RATE to higher value and should have maximum code reuse
contract MockNimbleReserveHighRate is NimbleReserveHighRate {

    function MockNimbleReserveHighRate(
        address _NimbleNetwork, 
        ConversionRatesInterface _ratesContract,
        address _admin
        ) 
        public NimbleReserveHighRate(_NimbleNetwork, _ratesContract, _admin)
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
