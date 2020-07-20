pragma solidity 0.6.6;

import "../IKyberReserve.sol";


interface IKyberRateHelper {
    function getRatesForToken(
        IERC20 token,
        uint256 optionalBuyAmountWei,
        uint256 optionalSellAmountTwei
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
        uint256 optionalBuyAmountWei,
        uint256 optionalSellAmountTwei
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
        uint256 optionalBuyAmountWei,
        uint256 optionalSellAmountTwei,
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

    function getReservesRates(IERC20 token, uint256 optionalAmountWei)
        external
        view
        returns (
            bytes32[] memory buyReserves,
            uint256[] memory buyRates,
            bytes32[] memory sellReserves,
            uint256[] memory sellRates
        );

    function getSpreadInfo(IERC20 token, uint256 optionalAmountWei)
        external
        view
        returns (bytes32[] memory reserves, int256[] memory spreads);

    function getSlippageRateInfo(
        IERC20 token,
        uint256 optionalAmountWei,
        uint256 optionalSlippageAmountWei
    )
        external
        view
        returns (
            bytes32[] memory buyReserves,
            int256[] memory buySlippageRateBps,
            bytes32[] memory sellReserves,
            int256[] memory sellSlippageRateBps
        );
}
