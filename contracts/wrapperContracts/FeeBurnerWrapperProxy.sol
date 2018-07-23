pragma solidity 0.4.18;


import "../Withdrawable.sol";


interface WrapFeeBurner {
    function registerWalletForFeeSharing(address walletAddress) public;
}


contract FeeBurnerWrapperProxy is Withdrawable {

    WrapFeeBurner public feeBurnerWrapperContract;

    function FeeBurnerWrapperProxy(WrapFeeBurner burnerWrapperAddress) public {
        require(burnerWrapperAddress != address(0));
        feeBurnerWrapperContract = burnerWrapperAddress;
    }

    function registerWallet(address wallet) public {
        feeBurnerWrapperContract.registerWalletForFeeSharing(wallet);
    }

    function setFeeBurnerWrapper(WrapFeeBurner burnerWrapperAddress) public onlyAdmin {
        require(burnerWrapperAddress != address(0));
        feeBurnerWrapperContract = burnerWrapperAddress;
    }
}
