pragma solidity ^0.4.18;

import "../Permissions.sol";


contract MockPermission is Permissions {
    uint public price;
    bool public tradeActive = true;

    function MockPermission () public
        Permissions()
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
