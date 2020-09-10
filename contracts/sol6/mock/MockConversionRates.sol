pragma solidity 0.6.6;

import "../IERC20.sol";


contract MockConversionRates {

    mapping (address => uint256) public buyRates;
    mapping (address => uint256) public sellRates;
    mapping (address => uint256) public imbalances;
    address public reserve;

    function setBaseRates(IERC20 token, uint256 buyRate, uint256 sellRate) external {
        buyRates[address(token)] = buyRate;
        sellRates[address(token)] = sellRate;
    }

    function recordImbalance(
        IERC20 token,
        int buyAmount,
        uint256 rateUpdateBlock,
        uint256 currentBlock
    ) external {}

    function setReserveAddress(address _reserve) external {
        reserve = _reserve;
    }

    function getRate(
        IERC20 token,
        uint256 currentBlockNumber,
        bool buy,
        uint256 qty
    ) external view returns(uint256) {
        currentBlockNumber;
        qty;
        if (buy) {
            return buyRates[address(token)];
        }
        return sellRates[address(token)];
    }

    function getInitImbalance(IERC20 token) external view returns(uint256) {
        return imbalances[address(token)];
    }
}
