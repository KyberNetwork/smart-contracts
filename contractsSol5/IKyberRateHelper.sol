pragma  solidity 0.5.11;

import "./IKyberReserve.sol";


interface IKyberRateHelper {
    function getRatesForToken(IERC20 token, uint optionalBuyAmount, uint optionalSellAmount) external view
        returns(bytes32[] memory buyReserves, uint[] memory buyRates,
            bytes32[] memory sellReserves, uint[] memory sellRates);

    function getPricesForToken(IERC20 token, uint optionalBuyAmount, uint optionalSellAmount) external view
        returns(bytes32[] memory buyReserves, uint[] memory buyRates,
            bytes32[] memory sellReserves, uint[] memory sellRates);

    function getRatesForTokenWithCustomFee(IERC20 token, uint optionalBuyAmount, uint optionalSellAmount, uint networkFeeBps) external view
        returns(bytes32[] memory buyReserves, uint[] memory buyRates,
            bytes32[] memory sellReserves, uint[] memory sellRates);
}
