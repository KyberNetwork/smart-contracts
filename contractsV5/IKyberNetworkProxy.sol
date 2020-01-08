pragma solidity 0.5.11;

import "./IERC20.sol";


/// @title Kyber Network interface
interface IKyberNetworkProxy {
    function trade(IERC20 src, uint srcAmount, IERC20 dest, address payable destAddress, uint maxDestAmount,
        uint minConversionRate, address payable platformWallet) external payable returns(uint);

    function tradeWithHint(IERC20 src, uint srcAmount, IERC20 dest, address payable destAddress, uint maxDestAmount,
        uint minConversionRate, address payable platformWallet, bytes calldata hint) external payable returns(uint);

    function tradeWithHintAndPlatformFee(IERC20 src, uint srcAmount, IERC20 dest, address payable destAddress, uint maxDestAmount,
        uint minConversionRate, address payable platformWallet, uint platformFeeBps, bytes calldata hint) external payable returns(uint);

    function getExpectedRate(IERC20 src, IERC20 dest, uint srcQty) external view
        returns (uint expectedRateNoFees, uint expectedRateNetworkFees, uint expectedRateAllFees, uint worstRateAllFees);

    function getExpectedRateWithPlatformFee(IERC20 src, IERC20 dest, uint srcQty, address platformWallet) external view
        returns (uint expectedRate, uint rateAfterNetworkFee, uint worstRateAfterNetworkFee, uint rateAfterFullFee);

    function getExpectedRateWithPlatformFeeAndHint(IERC20 src, IERC20 dest, uint srcQty, address platformWallet, 
        bytes calldata hint) external view returns (uint expectedRate, uint worstRate);

    function getExpectedRateWithCustomFeeAndHint(IERC20 src, IERC20 dest, uint srcQty, address customFeeBps, 
        bytes calldata hint) external view returns (uint expectedRate, uint worstRate);

    function setPlatformFeeBps(address platformWallet, uint platformFeeBps) external returns(bool);
    
    function getPlatformFeeBps(address platformWallet) external returns(uint platformFeeBps);
}
