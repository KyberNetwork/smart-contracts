pragma solidity ^0.4.18;

import "./PermissionGroups.sol";


contract KyberWhiteList is PermissionGroups {

    uint sgdToEthRate; //singapore dollar to wei rate
    mapping (address=>uint) userCategory; // each user has a category that defines cap on trade amount. 0 will be standard
    mapping (uint=>uint)    categoryCap;  // will define cap on trade amount per category in singapore Dollar.


    function KyberWhiteList( address _admin ) public {
        admin = _admin;
    }

    function setUserCategory( address user, uint category ) external {
        userCategory[user] = category;
    }

    event SetCategoryCap ( uint category, uint sgdCap );

    function setCategoryCap( uint category, uint sgdCap ) external {
        categoryCap[category] = sgdCap;
        SetCategoryCap (category, sgdCap);
    }

    event SetSgdToEthRate ( uint rate );

    function setSgdToEthRate( uint sgdToEtherRate ) external {
        sgdToEthRate = sgdToEtherRate;
        SetSgdToEthRate(sgdToEtherRate);
    }

    function getUserCapInWei( address user ) external view returns ( uint userCapWei ) {
        uint category = userCategory[user];
        return categoryCap[category];
    }
}