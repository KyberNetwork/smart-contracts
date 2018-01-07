pragma solidity ^0.4.18;


import "./Withdrawable.sol";


contract WhiteList is Withdrawable {

    uint public weiPerSgd; // amount of weis in 1 singapore dollar
    mapping (address=>uint) public userCategory; // each user has a category that defines cap on trade amount. 0 will be standard
    mapping (uint=>uint)    public categoryCap;  // will define cap on trade amount per category in singapore Dollar.

    function WhiteList(address _admin) public {
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
        weiPerSgd = _sgdToWeiRate;
        SetSgdToWeiRate(_sgdToWeiRate);
    }

    function getUserCapInWei(address user) external view returns (uint userCapWei) {
        uint category = userCategory[user];
        return (categoryCap[category] * weiPerSgd);
    }
}
