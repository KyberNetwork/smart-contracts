pragma solidity 0.5.11;

import "./IERC20.sol";


interface IKyberHint {

    function parseHint(bytes calldata hint) external view
        returns(bool ise2tsplit, address[] memory e2tReserves, uint[] memory e2tSplits, 
                bool ist2esplit, address[] memory t2eReserves, uint[] memory t2eSplits, 
                uint failingIndex);

    function buildHint(
        bytes calldata e2tOpcode, address[] calldata e2tReserves, uint[] calldata e2tSplits,
        bytes calldata t2eOpcode, address[] calldata t2eReserves, uint[] calldata t2eSplits)
        external view returns(bytes memory hint);
}