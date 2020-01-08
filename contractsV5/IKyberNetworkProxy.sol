pragma solidity 0.5.11;

import "./IERC20.sol";


/// @title Kyber Network interface
interface IKyberNetworkProxy {
    // backward compatible - don't modify
    function getExpectedRate(ERC20 src, ERC20 dest, uint srcQty) external view
        returns (uint expectedRate, uint worsteRate);

    function tradeWithHint(ERC20 src, uint srcAmount, ERC20 dest, address destAddress, uint maxDestAmount,
        uint minConversionRate, address walletId, bytes calldata hint) external payable returns(uint);

    // new APIs
    function trade(IERC20 src, uint srcAmount, IERC20 dest, address payable destAddress, uint maxDestAmount,
        uint minConversionRate, address payable platformWallet) external payable returns(uint);

    function tradeWithBytesHint(IERC20 src, uint srcAmount, IERC20 dest, address payable destAddress, uint maxDestAmount,
        uint minConversionRate, address payable platformWallet, bytes calldata hint) external payable returns(uint);

    function tradeWithHintAndPlatformFee(IERC20 src, uint srcAmount, IERC20 dest, address payable destAddress, uint maxDestAmount,
        uint minConversionRate, address payable platformWallet, uint platformFeeBps, bytes calldata hint) external payable returns(uint);

    function getExpectedRateBasic(IERC20 src, IERC20 dest, uint srcQty) external view
        returns (uint expectedRateNoFees, uint expectedRateNetworkFees, uint expectedRateAllFees, uint worstRateAllFees);

    function getExpectedRateWithPlatformFee(IERC20 src, IERC20 dest, uint srcQty, address platformWallet) external view
        returns (uint expectedRate, uint rateAfterNetworkFee, uint worstRateAfterNetworkFee, uint rateAfterFullFee);

    // user will pass platformWallet and we lookup fee in local DB
    function getExpectedRateWithPlatformFeeAndHint(IERC20 src, IERC20 dest, uint srcQty, address platformWallet, 
        bytes calldata hint) external view returns (uint expectedRate, uint worstRate);

    // user should pass platform fee BPS
    function getExpectedRateWithCustomFeeAndHint(IERC20 src, IERC20 dest, uint srcQty, uint customFeeBps, 
        bytes calldata hint) external view returns (uint expectedRate, uint worstRate);

    function setPlatformFeeBps(address platformWallet, uint platformFeeBps) external returns(bool);
    
    function getPlatformFeeBps(address platformWallet) external returns(uint platformFeeBps);
}
