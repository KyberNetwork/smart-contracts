pragma solidity 0.5.11;

import "./IERC20.sol";


/// @title Kyber Network interface
interface IKyberNetworkProxy {

    // backward compatible
    function getExpectedRate(ERC20 src, ERC20 dest, uint srcQty) external view
        returns (uint expectedRate, uint worsteRate);

    function tradeWithHint(ERC20 src, uint srcAmount, ERC20 dest, address destAddress, uint maxDestAmount,
        uint minConversionRate, address walletId, bytes calldata hint) external payable returns(uint);

    function trade(IERC20 src, uint srcAmount, IERC20 dest, address payable destAddress, uint maxDestAmount,
        uint minConversionRate, address payable platformWallet) external payable returns(uint);

    // new APIs
    function getExpectedRateAfterFee(IERC20 src, IERC20 dest, uint srcQty, uint customFeeBps, bytes calldata hint)
        external view
        returns (uint expectedRate);

    function getPriceDataNoFees(IERC20 src, IERC20 dest, uint srcQty, bytes calldata hint)
        external view
        returns (uint priceNoFee);

    function tradeWithHintAndFee(IERC20 src, uint srcAmount, IERC20 dest, address payable destAddress, uint maxDestAmount,
        uint minConversionRate, address payable platformWallet, uint platformFeeBps, bytes calldata hint)
        external payable
        returns(uint destAmount);
}
