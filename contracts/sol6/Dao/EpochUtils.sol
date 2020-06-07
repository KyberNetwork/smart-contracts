pragma solidity 0.6.6;

import "../utils/zeppelin/SafeMath.sol";
import "./IEpochUtils.sol";

contract EpochUtils is IEpochUtils {
    using SafeMath for uint256;

    uint256 public override epochPeriodInSeconds;
    uint256 public override firstEpochStartTimestamp;

    function getCurrentEpochNumber() public view override returns (uint256) {
        return getEpochNumber(now);
    }

    function getEpochNumber(uint256 timestamp) public view override returns (uint256) {
        if (timestamp < firstEpochStartTimestamp || epochPeriodInSeconds == 0) {
            return 0;
        }
        // ((timestamp - firstEpochStartTimestamp) / epochPeriodInSeconds) + 1;
        return ((timestamp.sub(firstEpochStartTimestamp)).div(epochPeriodInSeconds)).add(1);
    }
}
