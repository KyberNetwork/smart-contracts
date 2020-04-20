pragma solidity 0.6.6;

import "../IERC20.sol";
import "../IGasHelper.sol";


contract MockGasHelper is IGasHelper {
    address internal _platformWallet;

    constructor(address wallet) public {
        _platformWallet = wallet;
    }

    function freeGas(
        address platformWallet,
        IERC20 src,
        IERC20 dest,
        uint256 tradeWei,
        bytes32[] calldata t2eReserveIds,
        bytes32[] calldata e2tReserveIds
    ) external override {
        require(platformWallet == _platformWallet);
        src;
        dest;
        tradeWei;
        t2eReserveIds;
        e2tReserveIds;
    }
}
