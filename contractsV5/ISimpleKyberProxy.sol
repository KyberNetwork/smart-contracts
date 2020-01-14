pragma solidity 0.5.11;

import "./IERC20.sol";


/// @title simple Kyber Network proxy interface
/// add convinient functions to help with kyber proxy API
interface ISimpleKyberProxy {
    function swapTokenToToken(IERC20 src, uint srcAmount, IERC20 dest, uint minConversionRate) external returns(uint destAmount);
    function swapEtherToToken(IERC20 token, uint minConversionRate) external payable returns(uint destAmount);
    function swapTokenToEther(IERC20 token, uint srcAmount, uint minConversionRate) external returns(uint destAmount);

    // function swapTokenToTokenWithMaskOutHint(IERC20 src, uint srcAmount, IERC20 dest, uint[] calldata e2tReserveIds,
    //     uint[] calldata t2eReserveIds) external returns(uint destAmount);
        
    // function swapTokenToTokenWithMaskInHint(IERC20 src, uint srcAmount, IERC20 dest, uint[] calldata e2tReserveIds,
    //     uint[] calldata t2eReserveIds) external returns(uint destAmount);
        
    // function swapTokenToTokenWithSplitHint(IERC20 src, uint srcAmount, IERC20 dest, uint[] calldata e2tReserveIds,
    //     uint[]  calldata e2tSplitsBps, uint[] calldata t2eReserveIds, uint t2eSplitsBps) external returns(uint destAmount);

    // function getExpectedRateWithMaskOutHint(IERC20 src, IERC20 dest, uint srcQty, address platformWallet, uint[] calldata e2tReserveIds,
    //     uint[] calldata t2eReserveIds) external view
    //     returns (uint expectedRate, uint rateAfterNetworkFee, uint worstRateAfterNetworkFee);

    // function getExpectedRateWithMaskInHint(IERC20 src, IERC20 dest, uint srcQty, address platformWallet, uint[] calldata e2tReserveIds,
    //     uint[] calldata t2eReserveIds) external view
    //     returns (uint expectedRate, uint rateAfterNetworkFee, uint worstRateAfterNetworkFee);

    // function getExpectedRateWithSplitHint(IERC20 src, IERC20 dest, uint srcQty, address platformWallet, uint[] calldata e2tReserveIds,
    //     uint[] calldata e2tSplitsBps, uint[] calldata t2eReserveIds, uint t2eSplitsBps) external view
    //     returns (uint expectedRate, uint rateAfterNetworkFee, uint worstRateAfterNetworkFee);
}
