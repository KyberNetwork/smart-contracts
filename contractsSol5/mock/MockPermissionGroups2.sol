pragma solidity 0.5.11;

import "../utils/PermissionGroups2.sol";


contract MockPermission2 is PermissionGroups2 {
    uint public rate;
    bool public tradeActive = true;

    constructor() public PermissionGroups2(msg.sender) {}

    function setRate ( uint newRate ) public
        onlyOperator
    {
        rate = newRate;
    }

    function stopTrade () public
        onlyAlerter
    {
        tradeActive = false;
    }

    function activateTrade () public
        onlyOperator
    {
        tradeActive = true;
    }
}
