pragma solidity 0.4.18;

import "../reserves/KyberReserveHighRate.sol";

/// @title Kyber Reserve contract
/// reuses KyberReserve.sol contract while overriding a few functions / values.
/// Update MAX_RATE to higher value and should have maximum code reuse
contract MockKyberReserveHighRate is KyberReserveHighRate {

    function MockKyberReserveHighRate(address _kyberNetwork, ConversionRatesInterface _ratesContract,
        address _admin) public KyberReserveHighRate(_kyberNetwork, _ratesContract, _admin)
        { }

    function MockCalcDstQty(uint srcQty, uint srcDecimals, uint dstDecimals, uint rate)
        public pure returns(uint)
    {
        return calcDstQty(srcQty, srcDecimals, dstDecimals, rate);
    }

    function MockCalcSrcQty(uint dstQty, uint srcDecimals, uint dstDecimals, uint rate)
        public pure returns(uint) 
    {
        return calcSrcQty(dstQty, srcDecimals, dstDecimals, rate);
    }
}
