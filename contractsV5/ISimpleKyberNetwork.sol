pragma solidity 0.5.11;

import "./IERC20.sol";


/// @title simple interface for Kyber Network
interface ISimpleKyberNetwork {
    //todo: should we have hint here?
    function swapTokenToToken(IERC20 src, uint srcAmount, IERC20 dest, uint minConversionRate) public returns(uint);
    function swapEtherToToken(IERC20 token, uint minConversionRate) public payable returns(uint);
    function swapTokenToEther(IERC20 token, uint srcAmount, uint minConversionRate) public returns(uint);
}
