pragma solidity ^0.4.18;


import "../Withdrawable.sol";


interface WrapFeeBurner{
    function registerWalletForFeeSharing(address walletAddress) public;
}

contract WrapFeeBurnerWrapper is Withdrawable {

    WrapFeeBurner feeBurnerWrapperContract;

    function WrapFeeBurnerWrapper(WrapFeeBurner burnerWrapperAddress) public {
        require(burnerWrapperAddress != address(0));
        feeBurnerWrapperContract = burnerWrapperAddress;
    }

    function registerWallet(address wallet) public {
        feeBurnerWrapperContract.registerWalletForFeeSharing(wallet);
    }

    function setFeeBurnerWrapperAddress(WrapFeeBurner wrapper) public onlyAdmin {
        require(wrapper != address(0));
        feeBurnerWrapperContract = wrapper;
    }
}
