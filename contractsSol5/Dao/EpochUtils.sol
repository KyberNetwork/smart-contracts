pragma solidity 0.5.11;

import "../utils/zeppelin/SafeMath.sol";


contract EpochUtils {
    using SafeMath for uint;

    uint public epochPeriodInSeconds;
    uint public firstEpochStartTimestamp;

    function getCurrentEpochNumber() public view returns(uint) {
        return getEpochNumber(now);
    }

    function getEpochNumber(uint timestamp) public view returns(uint) {
        if (timestamp < firstEpochStartTimestamp || epochPeriodInSeconds == 0) { return 0; }
        // ((timestamp - firstEpochStartTimestamp) / epochPeriodInSeconds) + 1;
        return ((timestamp.sub(firstEpochStartTimestamp)).div(epochPeriodInSeconds)).add(1);
    }
}
