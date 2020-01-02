pragma solidity 0.5.11;

import "./IERC20.sol";


/// @title Kyber Network interface
interface IKyberNetwork {
    function maxGasPrice() external view returns(uint);
    function enabled() external view returns(bool);
    function info(bytes32 id) external view returns(uint);
    function getExpectedRate(IERC20 src, IERC20 dest, uint srcQty) external view
        returns (uint expectedRate, uint slippageRate);
    function getExpectedRateNoFees(IERC20 src, IERC20 dest, uint srcQty, bytes calldata hint) external view
        returns (uint expectedRate, uint slippageRate);
    function getExpectedRateWNetworkFee(IERC20 src, IERC20 dest, uint srcQty, bytes calldata hint) external view
        returns (uint expectedRate, uint slippageRate);

    function tradeWithHint(
        address payable trader,
        IERC20 src,
        uint srcAmount,
        IERC20 dest,
        address payable destAddress,
        uint maxDestAmount,
        uint minConversionRate,
        address walletId,
        bytes calldata hint
    ) external payable returns(uint);

    // hint support
    ///////////////////////////
    /// function getSplitHint
    /// will return a suggested hint with max 2 reserves per trade leg (token->Eth / Eth->token)
    /// there is no guaranty the suggested reserve split is the best one possible, anyone can create his own algorithm for
    /// finding a reserve split that will create the best trade outcome.
    function getSplitHint(IERC20 src, IERC20 dest, uint srcQty, bool usePermissionLess) external view
        returns(address[] memory ethToTokenReserves, uint[] memory ethToTokenSplits, address[] memory tokenToEthReserves,
                uint[] memory tokenToEthSplit, bytes memory hint);
    function parseHint(bytes calldata hint) external view
        returns(address[] memory ethToTokenReserves, uint[] memory ethToTokenSplits, address[] memory tokenToEthReserves,
                uint[] memory tokenToEthSplit, bool usePermissionLess, uint failingIndex);
    function buildHint(address[] calldata ethToTokenReserves, uint[] calldata ethToTokenSplits,
        address[] calldata tokenToEthReserves, uint[] calldata tokenToEthSplit, bool usePermissionLess) 
        external view returns(bytes memory hint);
}
