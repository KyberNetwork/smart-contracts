pragma solidity 0.5.11;

import "../EpochUtils.sol";


contract MockKyberDaoWithdrawFailed is EpochUtils {
    uint256 public value;

    constructor(uint256 _epochPeriod, uint256 _startTimestamp) public {
        epochPeriodInSeconds = _epochPeriod;
        firstEpochStartTimestamp = _startTimestamp;
    }

    function handleWithdrawal(address, uint256) public {
        value++;
        revert();
    }
}
