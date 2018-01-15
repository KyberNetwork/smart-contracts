pragma solidity 0.4.18;


import "./ERC20Interface.sol";


/// @title Kyber constants contract
contract Utils {

    ERC20 constant internal ETH_TOKEN_ADDRESS = ERC20(0x00eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee);
    uint  constant internal PRECISION = (10**18);
    uint  constant internal MAX_QTY   = (10**28); // 1B tokens
    uint  constant internal MAX_RATE  = (PRECISION * 10**6); // up to 1M tokens per ETH
    uint  constant internal MAX_DECIMALS = 18;

    function calcDstQty(uint sourceQty, uint sourceDecimals, uint dstDecimals, uint rate) internal pure returns(uint) {
        if (dstDecimals >= sourceDecimals) {
            require((dstDecimals - sourceDecimals) <= MAX_DECIMALS);
            return (sourceQty * rate * (10**(dstDecimals - sourceDecimals))) / PRECISION;
        } else {
            require((sourceDecimals - dstDecimals) <= MAX_DECIMALS);
            return (sourceQty * rate) / (PRECISION * (10**(sourceDecimals - dstDecimals)));
        }
    }

    function calcSourceQty(uint dstQty, uint sourceDecimals, uint dstDecimals, uint rate) internal pure returns(uint) {
        if (sourceDecimals >= dstDecimals) {
            require((sourceDecimals - dstDecimals) <= MAX_DECIMALS);
            return (PRECISION * dstQty * (10**(sourceDecimals - dstDecimals))) / rate;
        } else {
            require((dstDecimals - sourceDecimals) <= MAX_DECIMALS);
            return (PRECISION * dstQty) / (rate * (10**(dstDecimals - sourceDecimals)));
        }
    }
}
