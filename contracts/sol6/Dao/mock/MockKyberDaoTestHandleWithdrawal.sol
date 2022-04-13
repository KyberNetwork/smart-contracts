pragma solidity 0.6.6;

import "../EpochUtils.sol";


contract MockNimbleDaoTestHandleWithdrawal is EpochUtils {
    mapping(address => uint256) public values;

    constructor(uint256 _epochPeriod, uint256 _startTimestamp) public {
        epochPeriodInSeconds = _epochPeriod;
        firstEpochStartTimestamp = _startTimestamp;
    }

    function handleWithdrawal(address staker, uint256 amount) public {
        // to test if staking has called this func or not when withdrawing
        values[staker] += amount;
    }
}
