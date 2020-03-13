pragma solidity 0.5.11;

import "../EpochUtils.sol";

contract MockKyberDaoWithdrawFailed is EpochUtils {

    uint public value;

    constructor(uint _epochPeriod, uint _startBlock) public {
        EPOCH_PERIOD_BLOCKS = _epochPeriod;
        FIRST_EPOCH_START_BLOCK = _startBlock;
    }

    function handleWithdrawal(address, uint) public returns(bool) {
        value++;
        return false;
    }
}
