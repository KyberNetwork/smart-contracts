pragma solidity 0.5.11;

import "./IERC20.sol";


/// @title Kyber Network interface
interface IKyberNetwork {
    function maxGasPrice() external view returns(uint);
    function enabled() external view returns(bool);
    function info(bytes32 id) external view returns(uint);
    function getExpectedRate(IERC20 src, IERC20 dest, uint srcQty) external view
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
    ///
    /// will return a suggested hint with max 2 reserves per trade leg (token->Eth / Eth->token)
    /// there is no guaranty the suggested reserve split is the best one possible, anyone can create his own algorithm for
    /// finding a reserve split that will create the best trade outcome.
    function getSplitHint(IERC20 src, IERC20 dest, uint srcQty, bool usePermissionLess) exterenal view
        returns(address[]ethToTokenReserves, uint[] ethToTokenSplits, address[] tokenToEthReserves,
                uint[]tokenToEthSplit, bytes hint);
    function parseHint(bytes hint) external view
        returns(address[]ethToTokenReserves, uint[] ethToTokenSplits, address[] tokenToEthReserves,
                uint[]tokenToEthSplit, bool usePermissionLess);
    function buildHint(address[]ethToTokenReserves, uint[] ethToTokenSplits, address[] tokenToEthReserves,
        uint[]tokenToEthSplit, bool usePermissionLess) external view returns(bytes hint);
}
