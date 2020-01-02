pragma solidity 0.5.11;

import "./IERC20.sol";


/// @title Kyber Network interface
interface IKyberTakePlatformProxy {
    function getExpectedRateWNetworkAndCustomFee(IERC20 src, IERC20 dest, uint srcQty, bytes calldata hint) external view
        returns (uint expectedRate, uint slippageRate);
}
