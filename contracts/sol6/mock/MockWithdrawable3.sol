pragma solidity 0.6.6;

import "../utils/Withdrawable3.sol";


contract MockWithdrawable3 is Withdrawable3 {
    constructor() public Withdrawable3(msg.sender) {}

    receive() external payable {}
}
