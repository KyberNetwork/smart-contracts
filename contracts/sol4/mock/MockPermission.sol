pragma solidity ^0.4.18;

import "../PermissionGroups.sol";


contract MockPermission is PermissionGroups {
    uint public rate;
    bool public tradeActive = true;

    function MockPermission () public
        PermissionGroups()
    {
    }

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
