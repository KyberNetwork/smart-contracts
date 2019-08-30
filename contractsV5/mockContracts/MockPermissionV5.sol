pragma solidity 0.5.9;

import "../PermissionGroupsV5.sol";


contract MockPermissionV5 is PermissionGroupsV5 {
    uint public rate;
    bool public tradeActive = true;

    constructor() public PermissionGroupsV5(msg.sender) {}

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
