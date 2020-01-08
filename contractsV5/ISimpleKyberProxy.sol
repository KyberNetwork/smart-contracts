pragma solidity 0.5.11;

import "./IERC20.sol";


/// @title simple Kyber Network proxy interface
/// add convinient functions to help with kyber proxy API
interface ISimpleKyberProxy {
    function swapTokenToToken(IERC20 src, uint srcAmount, IERC20 dest, uint minConversionRate) external returns(uint destAmount);
    function swapEtherToToken(IERC20 token, uint minConversionRate) external payable returns(uint destAmount);
    function swapTokenToEther(IERC20 token, uint srcAmount, uint minConversionRate) external returns(uint destAmount);

    function swapTokenToTokenWithMaskOutHint(IERC20 src, uint srcAmount, IERC20 dest, uint[] calldata E2TReserveIds,
        uint[] calldata T2EReserveIds) external returns(uint destAmount);
        
    function swapTokenToTokenWithMaskInHint(IERC20 src, uint srcAmount, IERC20 dest, uint[] calldata E2TReserveIds,
        uint[] calldata T2EReserveIds) external returns(uint destAmount);
        
    function swapTokenToTokenWithSplitHint(IERC20 src, uint srcAmount, IERC20 dest, uint[] calldata E2TReserveIds, 
        uint[]  calldata E2TSplitsBps, uint[] calldata T2EReserveIds, uint T2ESplitsBps) external returns(uint destAmount);

    function getExpectedRateWithMaskOutHint(IERC20 src, IERC20 dest, uint srcQty, address platformWallet, uint[] calldata E2TReserveIds,
        uint[] calldata T2EReserveIds) external view
        returns (uint expectedRate, uint rateAfterNetworkFee, uint worstRateAfterNetworkFee);

    function getExpectedRateWithMaskInHint(IERC20 src, IERC20 dest, uint srcQty, address platformWallet, uint[] calldata E2TReserveIds,
        uint[] calldata T2EReserveIds) external view
        returns (uint expectedRate, uint rateAfterNetworkFee, uint worstRateAfterNetworkFee);

    function getExpectedRateWithSplitHint(IERC20 src, IERC20 dest, uint srcQty, address platformWallet, uint[] calldata E2TReserveIds, 
        uint[] calldata E2TSplitsBps, uint[] calldata T2EReserveIds, uint T2ESplitsBps) external view
        returns (uint expectedRate, uint rateAfterNetworkFee, uint worstRateAfterNetworkFee);
}
