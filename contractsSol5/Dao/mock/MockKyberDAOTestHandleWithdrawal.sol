pragma solidity 0.5.11;

import "../EpochUtils.sol";

contract MockKyberDAOTestHandleWithdrawal is EpochUtils {

    mapping(address => uint) public values;
    constructor(uint _epochPeriod, uint _startTimestamp) public {
        epochPeriodInSeconds = _epochPeriod;
        firstEpochStartTimestamp = _startTimestamp;
    }

    function handleWithdrawal(address staker, uint amount) public {
        // to test if staking has called this func or not when withdrawing
        values[staker] += amount;
    }
}
