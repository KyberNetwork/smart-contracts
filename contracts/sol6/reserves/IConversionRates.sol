pragma solidity 0.6.6;


import "../IERC20.sol";


interface IConversionRates {

    function recordImbalance(
        IERC20 token,
        int buyAmount,
        uint256 rateUpdateBlock,
        uint256 currentBlock
    ) external;

    function getRate(
        IERC20 token,
        uint256 currentBlockNumber,
        bool buy,
        uint256 qty
    ) external view returns(uint256);
}
