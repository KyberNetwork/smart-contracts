pragma solidity 0.5.11;

import "../EpochUtils.sol";

contract MockKyberDAOTestHandleWithdrawal is EpochUtils {

    mapping(address => uint) public values;
    constructor(uint _epochPeriod, uint _startBlock) public {
        EPOCH_PERIOD_BLOCKS = _epochPeriod;
        FIRST_EPOCH_START_BLOCK = _startBlock;
    }

    function handleWithdrawal(address staker, uint amount) public returns(bool) {
        // to test if staking has called this func or not when withdrawing
        values[staker] += amount;
        return true;
    }
}
