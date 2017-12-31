pragma solidity ^0.4.18;


import "./Withdrawable.sol";


contract KyberWhiteList is Withdrawable {

    uint sgdToWeiRate; //singapore dollar to wei rate
    mapping (address=>uint) userCategory; // each user has a category that defines cap on trade amount. 0 will be standard
    mapping (uint=>uint)    categoryCap;  // will define cap on trade amount per category in singapore Dollar.

    function KyberWhiteList(address _admin) public {
        admin = _admin;
    }

    event SetUserCategory(address user, uint category);

    function setUserCategory(address user, uint category) public onlyOperator {
        userCategory[user] = category;
        SetUserCategory(user, category);
    }

    event SetCategoryCap (uint category, uint sgdCap);

    function setCategoryCap(uint category, uint sgdCap) public onlyOperator {
        categoryCap[category] = sgdCap;
        SetCategoryCap (category, sgdCap);
    }

    event SetSgdToWeiRate (uint rate);

    function setSgdToEthRate(uint _sgdToWeiRate) public onlyOperator {
        sgdToWeiRate = _sgdToWeiRate;
        SetSgdToWeiRate(sgdToWeiRate);
    }

    function getUserCapInWei(address user) external view returns (uint userCapWei) {
        uint category = userCategory[user];
        return (categoryCap[category] * sgdToWeiRate);
    }
}