pragma solidity 0.5.11;

import "./IERC20.sol";


/// @title Kyber Network interface
interface IKyberNetwork {

    function enabled() external view returns(bool);
    function maxGasPrice() external view returns(uint);

    // new APIs
    function getExpectedRateWithHintAndFee(IERC20 src, IERC20 dest, uint srcQty, uint platformFeeBps, bytes calldata hint)
        external view
        returns (uint expectedRateNoFees, uint expectedRateAfterNetworkFee, uint expectedRateAfterAllFees);

    // destAmount is amount after deducting all fees
    function tradeWithHintAndFee(address payable trader, IERC20 src, uint srcAmount, IERC20 dest, address payable destAddress,
        uint maxDestAmount, uint minConversionRate, address payable platformWallet, uint platformFeeBps, bytes calldata hint)
        external payable
        returns(uint destAmount);

    function getNetworkData() external view returns(
        uint negligibleDiffBps,
        uint networkFeeBps,
        uint expiryBlock);
}
