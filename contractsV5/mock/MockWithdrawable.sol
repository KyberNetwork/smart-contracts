pragma solidity 0.5.11;

import "../WithdrawableV5.sol";


contract MockWithdrawable is Withdrawable {
    constructor() public Withdrawable(msg.sender) {}
    function () external payable {}
}