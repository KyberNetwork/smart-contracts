pragma solidity 0.6.6;

import "../IKyberReserve.sol";


interface IKyberRateHelper {
    function getRatesForToken(
        IERC20 token,
        uint256 optionalBuyAmount,
        uint256 optionalSellAmount
    )
        external
        view
        returns (
            bytes32[] memory buyReserves,
            uint256[] memory buyRates,
            bytes32[] memory sellReserves,
            uint256[] memory sellRates
        );

    function getPricesForToken(
        IERC20 token,
        uint256 optionalBuyAmount,
        uint256 optionalSellAmount
    )
        external
        view
        returns (
            bytes32[] memory buyReserves,
            uint256[] memory buyRates,
            bytes32[] memory sellReserves,
            uint256[] memory sellRates
        );

    function getRatesForTokenWithCustomFee(
        IERC20 token,
        uint256 optionalBuyAmount,
        uint256 optionalSellAmount,
        uint256 networkFeeBps
    )
        external
        view
        returns (
            bytes32[] memory buyReserves,
            uint256[] memory buyRates,
            bytes32[] memory sellReserves,
            uint256[] memory sellRates
        );
}
