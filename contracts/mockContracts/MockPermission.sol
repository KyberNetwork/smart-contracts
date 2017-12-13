pragma solidity ^0.4.18;

import "../Permissions.sol";


contract MockPermission is Permissions {
    uint public price;
    bool public tradeActive = true;

    function MockPermission()
        Permissions()
    {
    }

    function setPrice ( uint newPrice )
        onlyOperator
    {
        price = newPrice;
    }

    function stopTrade ()
        onlyAlerter
    {
        tradeActive = false;
    }

    function activateTrade ()
        onlyOperator
    {
        tradeActive = true;
    }
}
