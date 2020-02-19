pragma solidity 0.5.11;

import "../EpochUtils.sol";

contract MockDAOWithdrawFailed is EpochUtils {

    uint public value;

    constructor(uint _epochPeriod, uint _startBlock) public {
        EPOCH_PERIOD = _epochPeriod;
        START_BLOCK = _startBlock;
    }

    function handleWithdrawal(address, uint) public returns(bool) {
        value++;
        return false;
    }
}
