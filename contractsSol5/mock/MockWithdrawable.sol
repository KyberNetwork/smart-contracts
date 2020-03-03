pragma solidity 0.5.11;

import "../Withdrawable2.sol";


contract MockWithdrawable is Withdrawable2 {
    constructor() public Withdrawable2(msg.sender) {}
    function () external payable {}
}
