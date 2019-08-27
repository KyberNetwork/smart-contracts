pragma solidity 0.4.18;


import "../Utils.sol";

/// @title Kyber utils contract
contract MockUtils is Utils {

    function getMaxRate() public pure returns(uint) {
        return MAX_RATE;
    }

    function getMaxQty() public pure returns(uint) {
        return MAX_QTY;
    }

    function mockCalcDstQty(uint srcQty, uint srcDecimals, uint dstDecimals, uint rate) public pure returns(uint) {
        return calcDstQty(srcQty, srcDecimals, dstDecimals, rate);
    }

    function mockCalcSrcQty(uint dstQty, uint srcDecimals, uint dstDecimals, uint rate) public pure returns(uint) {
        return calcSrcQty(dstQty, srcDecimals, dstDecimals, rate);
    }
}
