pragma solidity 0.5.11;

import "./IERC20.sol";


/// @title Kyber Network interface
interface IKyberNetworkProxy {
    // backward compatible
    function getExpectedRate(
        ERC20 src,
        ERC20 dest,
        uint256 srcQty
    ) external view returns (uint256 expectedRate, uint256 worsteRate);

    function tradeWithHint(
        ERC20 src,
        uint256 srcAmount,
        ERC20 dest,
        address destAddress,
        uint256 maxDestAmount,
        uint256 minConversionRate,
        address walletId,
        bytes calldata hint
    ) external payable returns (uint256);

    function trade(
        IERC20 src,
        uint256 srcAmount,
        IERC20 dest,
        address payable destAddress,
        uint256 maxDestAmount,
        uint256 minConversionRate,
        address payable platformWallet
    ) external payable returns (uint256);

    // new APIs
    function getExpectedRateAfterFee(
        IERC20 src,
        IERC20 dest,
        uint256 srcQty,
        uint256 customFeeBps,
        bytes calldata hint
    ) external view returns (uint256 expectedRate);

    function getPriceDataNoFees(
        IERC20 src,
        IERC20 dest,
        uint256 srcQty,
        bytes calldata hint
    ) external view returns (uint256 priceNoFee);

    function tradeWithHintAndFee(
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
}
