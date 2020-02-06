pragma solidity 0.5.11;


contract MockKyberDAO {

    uint public value;
    constructor() public {
        value = 0;
    }

    function handleWithdrawal(address, uint) public {
        // to test if staking has called this func or not when withdrawing
        value++;
    }
}