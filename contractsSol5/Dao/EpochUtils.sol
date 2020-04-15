pragma solidity 0.5.11;

import "../utils/zeppelin/SafeMath.sol";


contract EpochUtils {
    using SafeMath for uint;

    uint public EPOCH_PERIOD_SECONDS;
    uint public FIRST_EPOCH_START_TIMESTAMP;

    function getCurrentEpochNumber() public view returns(uint) {
        return getEpochNumber(now);
    }

    function getEpochNumber(uint timestamp) public view returns(uint) {
        if (timestamp < FIRST_EPOCH_START_TIMESTAMP || EPOCH_PERIOD_SECONDS == 0) { return 0; }
        // ((timestamp - FIRST_EPOCH_START_TIMESTAMP) / EPOCH_PERIOD_SECONDS) + 1;
        return ((timestamp.sub(FIRST_EPOCH_START_TIMESTAMP)).div(EPOCH_PERIOD_SECONDS)).add(1);
    }
}
