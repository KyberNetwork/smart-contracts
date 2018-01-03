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

    function callEncodeTokenImbalanceData(
        int64 lastBlockBuyUnitsImbalance,
        uint64 lastBlock,
        int64 totalBuyUnitsImbalance,
        uint64 lastPriceUpdateBlock
    )
        external pure returns(uint)
    {
        TokenImbalanceData memory data =
            TokenImbalanceData(lastBlockBuyUnitsImbalance, lastBlock, totalBuyUnitsImbalance, lastPriceUpdateBlock);
        return(encodeTokenImbalanceData(data));
    }

    function callDecodeTokenImbalanceData(uint input) external pure returns(int64, uint64, int64, uint64) {
        TokenImbalanceData memory data = (decodeTokenImbalanceData(input));
        return (
            data.lastBlockBuyUnitsImbalance,
            data.lastBlock ,
            data.totalBuyUnitsImbalance,
            data.lastPriceUpdateBlock
        );
    }
}
