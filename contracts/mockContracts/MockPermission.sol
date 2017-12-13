pragma solidity ^0.4.18;

import "../PermissionLevels.sol";


contract MockPermission is PermissionLevels {
    uint public price;
    bool public tradeActive = true;

    function MockPermission () public
        PermissionLevels()
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
