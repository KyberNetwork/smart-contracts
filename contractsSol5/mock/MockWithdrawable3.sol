pragma solidity 0.5.11;

import "../utils/Withdrawable3.sol";


contract MockWithdrawable3 is Withdrawable3 {
    constructor() public Withdrawable3(msg.sender) {}
    function () external payable {}
}
