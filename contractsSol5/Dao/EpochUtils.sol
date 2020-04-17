pragma solidity 0.5.11;

import "../utils/zeppelin/SafeMath.sol";


contract EpochUtils {
    using SafeMath for uint256;

    uint256 public epochPeriodInSeconds;
    uint256 public firstEpochStartTimestamp;

    function getCurrentEpochNumber() public view returns (uint256) {
        return getEpochNumber(now);
    }

    function getEpochNumber(uint256 timestamp) public view returns (uint256) {
        if (timestamp < firstEpochStartTimestamp || epochPeriodInSeconds == 0) {
            return 0;
        }
        // ((timestamp - firstEpochStartTimestamp) / epochPeriodInSeconds) + 1;
        return ((timestamp.sub(firstEpochStartTimestamp)).div(epochPeriodInSeconds)).add(1);
    }
}
