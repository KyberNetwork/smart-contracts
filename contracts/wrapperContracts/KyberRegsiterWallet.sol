pragma solidity ^0.4.18;


interface FeeBurnerWrapperProxy {
    function registerWallet(address wallet) public;
}


contract KyberRegisterWallet {

    FeeBurnerWrapperProxy public feeBurnerWrapperProxyContract;

    function KyberRegisterWallet(FeeBurnerWrapperProxy feeBurnerWrapperProxy) public {
        require(feeBurnerWrapperProxy != address(0));

        feeBurnerWrapperProxyContract = feeBurnerWrapperProxy;
    }

    function registerWallet(address wallet) public {
        feeBurnerWrapperProxyContract.registerWallet(wallet);
    }
}
