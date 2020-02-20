pragma solidity 0.5.11;

import "./SafeMath.sol";


contract EpochUtils {
    using SafeMath for uint;

    uint public EPOCH_PERIOD;
    uint public START_BLOCK;

    function getCurrentEpochNumber() public view returns(uint) {
        return getEpochNumber(block.number);
    }

    function getEpochNumber(uint blockNumber) public view returns(uint) {
        if (blockNumber < START_BLOCK || EPOCH_PERIOD == 0) { return 0; }
        // ((blockNumber - START_BLOCK) / EPOCH_PERIOD) + 1;
        return ((blockNumber.sub(START_BLOCK)).div(EPOCH_PERIOD)).add(1);
    }
}
