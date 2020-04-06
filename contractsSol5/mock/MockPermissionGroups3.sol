pragma solidity 0.5.11;

import "../utils/PermissionGroups3.sol";


contract MockPermission3 is PermissionGroups3 {
    uint256 public rate;
    bool public tradeActive = true;

    constructor() public PermissionGroups3(msg.sender) {}

    function setRate(uint256 newRate) public {
        onlyOperator();
        rate = newRate;
    }

    function stopTrade() public {
        onlyAlerter();
        tradeActive = false;
    }

    function activateTrade() public {
        onlyOperator();
        tradeActive = true;
    }
}
