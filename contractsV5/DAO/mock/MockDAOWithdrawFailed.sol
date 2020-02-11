pragma solidity 0.5.11;


contract MockDAOWithdrawFailed {

    uint public value;

    constructor() public { }

    function handleWithdrawal(address, uint) public {
        value++;
        revert();
    }
}
