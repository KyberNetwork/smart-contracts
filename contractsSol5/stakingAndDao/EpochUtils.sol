pragma solidity 0.5.11;

import "../zeppelin/SafeMath.sol";


contract EpochUtils {
    using SafeMath for uint;

    uint public EPOCH_PERIOD_BLOCKS;
    uint public FIRST_EPCOH_START_BLOCK;

    function getCurrentEpochNumber() public view returns(uint) {
        return getEpochNumber(block.number);
    }

    function getEpochNumber(uint blockNumber) public view returns(uint) {
        if (blockNumber < FIRST_EPCOH_START_BLOCK || EPOCH_PERIOD_BLOCKS == 0) { return 0; }
        // ((blockNumber - FIRST_EPCOH_START_BLOCK) / EPOCH_PERIOD_BLOCKS) + 1;
        return ((blockNumber.sub(FIRST_EPCOH_START_BLOCK)).div(EPOCH_PERIOD_BLOCKS)).add(1);
    }
}
