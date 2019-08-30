pragma solidity 0.5.9;

import "../WithdrawableV5.sol";


contract MockWithdrawableV5 is WithdrawableV5 {
    constructor() public WithdrawableV5(msg.sender) {}
    function () external payable {}
}
