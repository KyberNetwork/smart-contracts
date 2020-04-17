pragma solidity 0.5.11;

import "../EpochUtils.sol";

contract MockKyberDaoWithdrawFailed is EpochUtils {

    uint public value;

    constructor(uint _epochPeriod, uint _startTimestamp) public {
        epochPeriodInSeconds = _epochPeriod;
        firstEpochStartTimestamp = _startTimestamp;
    }

    function handleWithdrawal(address, uint) public {
        value++;
        revert();
    }
}
