pragma solidity 0.4.18;


import "../FeeBurner.sol";
import "./WrapperBase.sol";


contract WrapFeeBurner is WrapperBase {

    FeeBurner public feeBurnerContract;
    address[] internal feeSharingWallets;
    uint public feeSharingBps = 3000; // out of 10000 = 30%

    function WrapFeeBurner(FeeBurner feeBurner) public
        WrapperBase(PermissionGroups(address(feeBurner)))
    {
        require(feeBurner != address(0));
        feeBurnerContract = feeBurner;
    }

    //register wallets for fee sharing
    /////////////////////////////////
    function setFeeSharingValue(uint feeBps) public onlyAdmin {
        require(feeBps < 10000);
        feeSharingBps = feeBps;
    }

    function getFeeSharingWallets() public view returns(address[]) {
        return feeSharingWallets;
    }

    event WalletRegisteredForFeeSharing(address sender, address walletAddress);
    function registerWalletForFeeSharing(address walletAddress) public {
        require(feeBurnerContract.walletFeesInBps(walletAddress) == 0);

        // if fee sharing value is 0. means the wallet wasn't added.
        feeBurnerContract.setWalletFees(walletAddress, feeSharingBps);
        feeSharingWallets.push(walletAddress);
        WalletRegisteredForFeeSharing(msg.sender, walletAddress);
    }

    function setReserveData(address reserve, uint feeBps, address kncWallet) public onlyAdmin {
        require(reserve != address(0));
        require(kncWallet != address(0));
        require(feeBps > 0);
        require(feeBps < 10000);

        feeBurnerContract.setReserveData(reserve, feeBps, kncWallet);
    }

    function setWalletFee(address wallet, uint feeBps) public onlyAdmin {
        require(wallet != address(0));
        require(feeBps > 0);
        require(feeBps < 10000);

        feeBurnerContract.setWalletFees(wallet, feeBps);
    }

    function setTaxParameters(address taxWallet, uint feeBps) public onlyAdmin {
        require(taxWallet != address(0));
        require(feeBps > 0);
        require(feeBps < 10000);

        feeBurnerContract.setTaxInBps(feeBps);
        feeBurnerContract.setTaxWallet(taxWallet);
    }
}
