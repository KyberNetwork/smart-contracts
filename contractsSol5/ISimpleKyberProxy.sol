pragma solidity 0.5.11;

import "./IERC20.sol";


/// @title simple Kyber Network proxy interface
/// add convenient functions to help with kyber proxy API
interface ISimpleKyberProxy {
    function swapTokenToToken(IERC20 src, uint srcAmount, IERC20 dest, uint minConversionRate) external returns(uint destAmount);
    function swapEtherToToken(IERC20 token, uint minConversionRate) external payable returns(uint destAmount);
    function swapTokenToEther(IERC20 token, uint srcAmount, uint minConversionRate) external returns(uint destAmount);
}
