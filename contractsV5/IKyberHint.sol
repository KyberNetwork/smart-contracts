pragma solidity 0.5.11;

import "./IERC20.sol";


interface IKyberNetwork {
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
