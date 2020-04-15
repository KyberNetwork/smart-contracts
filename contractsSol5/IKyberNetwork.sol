pragma solidity 0.5.11;

import "./IERC20.sol";

/// @title Kyber Network interface
interface IKyberNetwork {
    function enabled() external view returns (bool);

    function maxGasPrice() external view returns (uint256);

    // new APIs
    function getExpectedRateWithHintAndFee(
        IERC20 src,
        IERC20 dest,
        uint256 srcQty,
        uint256 platformFeeBps,
        bytes calldata hint
    )
        external
        view
        returns (
            uint256 expectedRateNoFees,
            uint256 expectedRateAfterNetworkFee,
            uint256 expectedRateAfterAllFees
        );

    // destAmount is amount after deducting all fees
    function tradeWithHintAndFee(
        address payable trader,
        IERC20 src,
        uint256 srcAmount,
        IERC20 dest,
        address payable destAddress,
        uint256 maxDestAmount,
        uint256 minConversionRate,
        address payable platformWallet,
        uint256 platformFeeBps,
        bytes calldata hint
    ) external payable returns (uint256 destAmount);

    function getNetworkData()
        external
        view
        returns (
            uint256 negligibleDiffBps,
            uint256 networkFeeBps,
            uint256 expiryBlock
        );
}
