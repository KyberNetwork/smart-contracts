pragma solidity 0.5.11;

import "../utils/PermissionGroups2.sol";


contract MockPermissionGroups2 is PermissionGroups2 {
    uint256 public rate;
    bool public tradeActive = true;

    constructor() public PermissionGroups2(msg.sender) {}

    function activateTrade() public onlyOperator {
        tradeActive = true;
    }

    function setRate(uint256 newRate) public onlyOperator {
        rate = newRate;
    }

    function stopTrade() public onlyAlerter {
        tradeActive = false;
    }
}
