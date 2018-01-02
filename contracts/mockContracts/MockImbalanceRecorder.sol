pragma solidity ^0.4.18;


import "../VolumeImbalanceRecorder.sol";


contract MockImbalanceRecorder is VolumeImbalanceRecorder {
    function MockImbalanceRecorder(address _admin) public VolumeImbalanceRecorder(_admin) {}

    function addTrade(ERC20 token, int buyAmount, uint priceUpdateBlock, uint currentBlock) public {
        addImbalance(token, buyAmount, priceUpdateBlock, currentBlock);
    }

    function getImbalanceSinceUpdate(ERC20 token, uint priceUpdateBlock, uint currentBlock)
        public view
        returns(int buyImbalance, int currentBlockImbalance)
    {
        return getImbalanceSincePriceUpdate(token, priceUpdateBlock, currentBlock);
    }

    function getMockImbalance(ERC20 token, uint priceUpdateBlock, uint currentBlock)
        public view
        returns(int totalImbalance, int currentBlockImbalance)
    {
       return getImbalance(token, priceUpdateBlock, currentBlock);
    }

    function getMockImbalanceInRange(ERC20 token, uint startBlock, uint endBlock) public view returns(int buyImbalance) {
        return getImbalanceInRange(token, startBlock, endBlock);
    }

    function getMaxBlockImbalance(ERC20 token) public view returns(uint) {
        return getMaxPerBlockImbalance(token);
    }

    function getMaxImbalance(ERC20 token) public view returns(uint) {
        return getMaxTotalImbalance(token);
    }
}
