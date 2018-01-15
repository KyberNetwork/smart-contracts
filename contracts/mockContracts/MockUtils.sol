pragma solidity 0.4.18;


import "../Utils.sol";

/// @title Kyber utils contract
contract MockUtils is Utils {

    function mockCalcDstQty(uint sourceQty, uint sourceDecimals, uint dstDecimals, uint rate) public pure returns(uint) {
        return calcDstQty(sourceQty, sourceDecimals, dstDecimals, rate);
    }

    function mockCalcSourceQty(uint dstQty, uint sourceDecimals, uint dstDecimals, uint rate) public pure returns(uint) {
        return calcSourceQty(dstQty, sourceDecimals, dstDecimals, rate);
    }
}
