pragma solidity 0.6.6;

import "./IERC20.sol";


interface IGasHelper {
    function freeGas(
        address platformWallet,
        IERC20 src,
        IERC20 dest,
        uint256 tradeWei,
        bytes32[] calldata t2eReserveIds,
        bytes32[] calldata e2tReserveIds
    ) external;
}
