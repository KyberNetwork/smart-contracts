pragma solidity 0.6.6;

import "../utils/Utils5.sol";


/// @title Nimble utils contract
contract MockUtils5 is Utils5 {
    function mockCheckGetUpdateDecimals(IERC20 token) public returns (uint256) {
        return getUpdateDecimals(token);
    }

    function mockSetDecimals(IERC20 token) public {
        return setDecimals(token);
    }

    function mockCalcDestAmount(
        IERC20 src,
        IERC20 dest,
        uint256 srcAmount,
        uint256 rate
    ) public view returns (uint256) {
        return calcDestAmount(src, dest, srcAmount, rate);
    }

    function mockCalcSrcAmount(
        IERC20 src,
        IERC20 dest,
        uint256 destAmount,
        uint256 rate
    ) public view returns (uint256) {
        return calcSrcAmount(src, dest, destAmount, rate);
    }

    function mockGetBalance(IERC20 token, address user) public view returns (uint256) {
        return getBalance(token, user);
    }

    function mockGetDecimals(IERC20 token) public view returns (uint256) {
        return getDecimals(token);
    }

    function mockGetDecimalsMap(IERC20 token) public view returns (uint256) {
        return decimals[token];
    }

    function mockCalcDstQty(
        uint256 srcQty,
        uint256 srcDecimals,
        uint256 dstDecimals,
        uint256 rate
    ) public pure returns (uint256) {
        return calcDstQty(srcQty, srcDecimals, dstDecimals, rate);
    }

    function mockCalcSrcQty(
        uint256 dstQty,
        uint256 srcDecimals,
        uint256 dstDecimals,
        uint256 rate
    ) public pure returns (uint256) {
        return calcSrcQty(dstQty, srcDecimals, dstDecimals, rate);
    }

    function mockCalcRateFromQty(
        uint256 srcAmount,
        uint256 destAmount,
        uint256 srcDecimals,
        uint256 dstDecimals
    ) public pure returns (uint256) {
        return calcRateFromQty(srcAmount, destAmount, srcDecimals, dstDecimals);
    }

    function mockGetEthTokenAddress() public pure returns (IERC20) {
        return ETH_TOKEN_ADDRESS;
    }

    function mockGetPrecision() public pure returns (uint256) {
        return PRECISION;
    }

    function mockGetMaxRate() public pure returns (uint256) {
        return MAX_RATE;
    }

    function mockGetMaxQty() public pure returns (uint256) {
        return MAX_QTY;
    }

    function mockGetMaxDecimals() public pure returns (uint256) {
        return MAX_DECIMALS;
    }

    function mockGetEthDecimals() public pure returns (uint256) {
        return ETH_DECIMALS;
    }

    function mockGetBPS() public pure returns (uint256) {
        return BPS;
    }

    function mockMinOf(uint256 x, uint256 y) public pure returns (uint256) {
        return minOf(x, y);
    }
}
