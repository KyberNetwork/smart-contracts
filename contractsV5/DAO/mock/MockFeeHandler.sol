pragma solidity 0.5.11;

contract MockFeeHandler {
    uint public value;

    constructor() public {}

    function claimReward(address, uint, uint) public returns(bool) {
        value++;
        return true;
    }
}
