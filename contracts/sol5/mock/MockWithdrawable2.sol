pragma solidity 0.5.11;

import "../utils/Withdrawable2.sol";


contract MockWithdrawable2 is Withdrawable2 {
    constructor() public Withdrawable2(msg.sender) {}

    function() external payable {}
}
