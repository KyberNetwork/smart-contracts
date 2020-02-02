pragma solidity 0.5.11;

import "./IERC20.sol";


/// @title Kyber Network interface
interface IKyberNetworkProxy {

    enum TradeType {
        MaskIn,
        MaskOut,
        Split
    }

    // backward compatible - don't modify
    function getExpectedRate(ERC20 src, ERC20 dest, uint srcQty) external view
        returns (uint expectedRate, uint worsteRate);

    function tradeWithHint(ERC20 src, uint srcAmount, ERC20 dest, address destAddress, uint maxDestAmount,
        uint minConversionRate, address walletId, bytes calldata hint) external payable returns(uint);

    function trade(IERC20 src, uint srcAmount, IERC20 dest, address payable destAddress, uint maxDestAmount,
        uint minConversionRate, address payable platformWallet) external payable returns(uint);

    // new APIs
     function getExpectedRateWithHint(IERC20 src, IERC20 dest, uint srcQty, bytes calldata hint) external view
        returns (uint expectedRate);

    function getExpectedRateAfterCustomFee(IERC20 src, IERC20 dest, uint srcQty, uint customFeeBps, bytes calldata hint) 
        external view
        returns (uint expectedRate);
        
    function getPriceData(IERC20 src, IERC20 dest, uint srcQty) external view returns (uint priceNoFees);
    
    function tradeWithHintAndPlatformFee(IERC20 src, uint srcAmount, IERC20 dest, address payable destAddress, uint maxDestAmount,
        uint minConversionRate, address payable platformWallet, uint platformFeeBps, bytes calldata hint) 
        external payable 
        returns(uint destAmount);
}
