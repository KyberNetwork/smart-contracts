pragma solidity 0.6.6;


import "../IERC20.sol";

interface ISanityRates {
    function getSanityRate(IERC20 src, IERC20 dest) external view returns(uint);
}
