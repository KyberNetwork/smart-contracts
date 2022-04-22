pragma solidity 0.4.18;

import "./nimbleReserve.sol";

/// @title nimble Reserve contract
/// reuses nimbleReserve.sol contract while overriding a few functions / values.
/// Update MAX_RATE to higher value and should have maximum code reuse
contract nimbleReserveHighRate is nimbleReserve {

    uint  constant internal MAX_RATE  = (PRECISION * 10 ** 7); // 10M tokens per ETH

    function nimbleReserveHighRate(address _nimbleNetwork, ConversionRatesInterface _ratesContract,
        address _admin) public nimbleReserve(_nimbleNetwork, _ratesContract, _admin)
        { }

    function calcDstQty(uint srcQty, uint srcDecimals, uint dstDecimals, uint rate)
        internal pure returns(uint)
    {
        require(srcQty <= MAX_QTY);
        require(rate <= MAX_RATE);

        if (dstDecimals >= srcDecimals) {
            require((dstDecimals - srcDecimals) <= MAX_DECIMALS);
            return (srcQty * rate * (10**(dstDecimals - srcDecimals))) / PRECISION;
        } else {
            require((srcDecimals - dstDecimals) <= MAX_DECIMALS);
            return (srcQty * rate) / (PRECISION * (10**(srcDecimals - dstDecimals)));
        }
    }

    function calcSrcQty(uint dstQty, uint srcDecimals, uint dstDecimals, uint rate)
        internal pure returns(uint) 
    {
        require(dstQty <= MAX_QTY);
        require(rate <= MAX_RATE);

        //source quantity is rounded up. to avoid dest quantity being too low.
        uint numerator;
        uint denominator;
        if (srcDecimals >= dstDecimals) {
            require((srcDecimals - dstDecimals) <= MAX_DECIMALS);
            numerator = (PRECISION * dstQty * (10**(srcDecimals - dstDecimals)));
            denominator = rate;
        } else {
            require((dstDecimals - srcDecimals) <= MAX_DECIMALS);
            numerator = (PRECISION * dstQty);
            denominator = (rate * (10**(dstDecimals - srcDecimals)));
        }
        return (numerator + denominator - 1) / denominator; //avoid rounding down
    }
}
