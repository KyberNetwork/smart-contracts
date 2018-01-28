pragma solidity ^0.4.18;


import "../VolumeImbalanceRecorder.sol";


contract MockImbalanceRecorder is VolumeImbalanceRecorder {
    function MockImbalanceRecorder(address _admin) public VolumeImbalanceRecorder(_admin) {}

    function addTrade(ERC20 token, int buyAmount, uint rateUpdateBlock, uint currentBlock) public {
        addImbalance(token, buyAmount, rateUpdateBlock, currentBlock);
    }

    function getImbalanceSinceUpdate(ERC20 token, uint rateUpdateBlock, uint currentBlock)
        public view
        returns(int buyImbalance, int currentBlockImbalance)
    {
        return getImbalanceSinceRateUpdate(token, rateUpdateBlock, currentBlock);
    }

    function getMockImbalance(ERC20 token, uint rateUpdateBlock, uint currentBlock)
        public view
        returns(int totalImbalance, int currentBlockImbalance)
    {
        return getImbalance(token, rateUpdateBlock, currentBlock);
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

    function callEncodeTokenImbalanceData(
        int lastBlockBuyUnitsImbalance,
        uint lastBlock,
        int totalBuyUnitsImbalance,
        uint lastRateUpdateBlock
    )
        external pure returns(uint)
    {
        TokenImbalanceData memory data =
            TokenImbalanceData(lastBlockBuyUnitsImbalance, lastBlock, totalBuyUnitsImbalance, lastRateUpdateBlock);
        return(encodeTokenImbalanceData(data));
    }

    function callDecodeTokenImbalanceData(uint input) external pure returns(int, uint, int, uint) {
        TokenImbalanceData memory data = (decodeTokenImbalanceData(input));
        return (
            data.lastBlockBuyUnitsImbalance,
            data.lastBlock ,
            data.totalBuyUnitsImbalance,
            data.lastRateUpdateBlock
        );
    }
}
