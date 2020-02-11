pragma solidity 0.5.11;


contract MockSimpleDAO {

    mapping(address => uint) public values;
    constructor() public { }

    function handleWithdrawal(address staker, uint amount) public {
        // to test if staking has called this func or not when withdrawing
        values[staker] += amount;
    }
}
