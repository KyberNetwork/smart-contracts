pragma solidity 0.5.11;

import "../utils/WithdrawableNoModifiers.sol";


contract MockWithdrawableNoModifiers is WithdrawableNoModifiers {
    constructor() public WithdrawableNoModifiers(msg.sender) {}

    function() external payable {}
}
