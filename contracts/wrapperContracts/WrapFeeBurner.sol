pragma solidity 0.4.18;


import "../FeeBurner.sol";
import "./WrapperBase.sol";


contract WrapFeeBurner is WrapperBase {

    FeeBurner public feeBurnerContract;
    address[] internal feeSharingWallets;
    uint public feeSharingBps = 3000; // out of 10000 = 30%

    //add reserve pending data
    struct AddReserveData {
        address reserve;
        uint    feeBps;
        address kncWallet;
    }

    AddReserveData internal addReserve;

    //wallet fee pending parameters
    struct WalletFee {
        address walletAddress;
        uint    feeBps;
    }

    WalletFee internal walletFee;

    //tax pending parameters
    struct TaxData {
        address wallet;
        uint    feeBps;
    }

    TaxData internal taxData;
    
    //data indexes
    uint internal constant ADD_RESERVE_INDEX = 1;
    uint internal constant WALLET_FEE_INDEX = 2;
    uint internal constant TAX_DATA_INDEX = 3;
    uint internal constant LAST_DATA_INDEX = 4;

    //general functions
    function WrapFeeBurner(FeeBurner feeBurner, address _admin) public
        WrapperBase(PermissionGroups(address(feeBurner)), _admin, LAST_DATA_INDEX)
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

    //set reserve data
    //////////////////
    function setPendingReserveData(address reserve, uint feeBps, address kncWallet) public onlyOperator {
        require(reserve != address(0));
        require(kncWallet != address(0));
        require(feeBps > 0);
        require(feeBps < 10000);

        addReserve.reserve = reserve;
        addReserve.feeBps = feeBps;
        addReserve.kncWallet = kncWallet;
        setNewData(ADD_RESERVE_INDEX);
    }

    function getPendingAddReserveData() public view
        returns(address reserve, uint feeBps, address kncWallet, uint nonce)
    {
        address[] memory signatures;
        (signatures, nonce) = getDataTrackingParameters(ADD_RESERVE_INDEX);
        return(addReserve.reserve, addReserve.feeBps, addReserve.kncWallet, nonce);
    }

    function getAddReserveSignatures() public view returns (address[] signatures) {
        uint nonce;
        (signatures, nonce) = getDataTrackingParameters(ADD_RESERVE_INDEX);
        return(signatures);
    }

    function approveAddReserveData(uint nonce) public onlyOperator {
        if (addSignature(ADD_RESERVE_INDEX, nonce, msg.sender)) {
            // can perform operation.
            feeBurnerContract.setReserveData(addReserve.reserve, addReserve.feeBps, addReserve.kncWallet);
        }
    }

    //wallet fee
    /////////////
    function setPendingWalletFee(address wallet, uint feeBps) public onlyOperator {
        require(wallet != address(0));
        require(feeBps > 0);
        require(feeBps < 10000);

        walletFee.walletAddress = wallet;
        walletFee.feeBps = feeBps;
        setNewData(WALLET_FEE_INDEX);
    }

    function getPendingWalletFeeData() public view returns(address wallet, uint feeBps, uint nonce) {
        address[] memory signatures;
        (signatures, nonce) = getDataTrackingParameters(WALLET_FEE_INDEX);
        return(walletFee.walletAddress, walletFee.feeBps, nonce);
    }

    function getWalletFeeSignatures() public view returns (address[] signatures) {
        uint nonce;
        (signatures, nonce) = getDataTrackingParameters(WALLET_FEE_INDEX);
        return(signatures);
    }

    function approveWalletFeeData(uint nonce) public onlyOperator {
        if (addSignature(WALLET_FEE_INDEX, nonce, msg.sender)) {
            // can perform operation.
            feeBurnerContract.setWalletFees(walletFee.walletAddress, walletFee.feeBps);
        }
    }

    //tax parameters
    ////////////////
    function setPendingTaxParameters(address taxWallet, uint feeBps) public onlyOperator {
        require(taxWallet != address(0));
        require(feeBps > 0);
        require(feeBps < 10000);

        taxData.wallet = taxWallet;
        taxData.feeBps = feeBps;
        setNewData(TAX_DATA_INDEX);
    }

    function getPendingTaxData() public view returns(address wallet, uint feeBps, uint nonce) {
        address[] memory signatures;
        (signatures, nonce) = getDataTrackingParameters(TAX_DATA_INDEX);
        return(taxData.wallet, taxData.feeBps, nonce);
    }

    function getTaxDataSignatures() public view returns (address[] signatures) {
        uint nonce;
        (signatures, nonce) = getDataTrackingParameters(TAX_DATA_INDEX);
        return(signatures);
    }

    function approveTaxData(uint nonce) public onlyOperator {
        if (addSignature(TAX_DATA_INDEX, nonce, msg.sender)) {
            // can perform operation.
            feeBurnerContract.setTaxInBps(taxData.feeBps);
            feeBurnerContract.setTaxWallet(taxData.wallet);
        }
    }
}
