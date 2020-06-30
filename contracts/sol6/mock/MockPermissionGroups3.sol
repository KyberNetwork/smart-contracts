pragma solidity 0.6.6;

import "../utils/PermissionGroups3.sol";


contract MockPermissionGroups3 is PermissionGroups3 {
    uint256 public rate;
    bool public tradeActive = true;

    constructor() public PermissionGroups3(msg.sender) {}

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
