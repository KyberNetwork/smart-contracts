pragma solidity 0.5.11;

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
        uint tradeWei, 
        bytes8[] calldata t2eReserveIds,
        bytes8[] calldata e2tReserveIds
    ) external {
        require(platformWallet == _platformWallet);
        src;
        dest;
        tradeWei;
        t2eReserveIds;
        e2tReserveIds;
    }
}
