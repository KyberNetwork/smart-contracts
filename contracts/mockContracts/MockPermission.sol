pragma solidity ^0.4.18;

import "../PermissionGroups.sol";


contract MockPermission is PermissionGroups {
    uint public price;
    bool public tradeActive = true;

    function MockPermission () public
        PermissionGroups()
    {
    }

    function setPrice ( uint newPrice ) public
        onlyOperator
    {
        price = newPrice;
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
