pragma solidity ^0.4.18;


import "../VolumeImbalanceRecorder.sol";

contract MockImbalanceRecorder is VolumeImbalanceRecorder {

    function addTrade( ERC20 token, int buyAmount, uint priceUpdateBlock, uint currentBlock) public {

        addImbalance(token, buyAmount, priceUpdateBlock, currentBlock);
    }
}
