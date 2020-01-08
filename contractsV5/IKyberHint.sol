pragma solidity 0.5.11;

import "./IERC20.sol";


interface IKyberHint {

    function parseHint(bytes calldata hint) external view
        returns(address[] memory e2tReserves, uint[] memory e2tSplits, address[] memory t2eReserves,
                uint[] memory t2eSplit, uint failingIndex);

    function buildHint(address[] calldata e2tReserves, uint[] calldata e2tSplits,
        address[] calldata t2eReserves, uint[] calldata t2eSplit)
        external view returns(bytes memory hint);
}
