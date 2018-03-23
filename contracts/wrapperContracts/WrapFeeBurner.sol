pragma solidity 0.4.18;


import "../ERC20Interface.sol";
//import "../Withdrawable.sol";
import "../FeeBurner.sol";
import "./WrapperBase.sol";


contract WrapFeeBurner is WrapperBase {

    FeeBurner private feeBurnerContract;

    //knc rate range
    struct KncPerEth {
        uint minRate;
        uint maxRate;
        uint pendingMinRate;
        uint pendingMaxRate;
    }

    KncPerEth private kncPerEth;

    //add reserve pending data
    struct AddReserveData {
        address reserve;
        uint    feeBps;
        address kncWallet;
    }

    AddReserveData private addReserve;

    //wallet fee parameters
    struct WalletFee {
        address walletAddress;
        uint feeBps;
    }

    WalletFee private walletFee;

    //tax pending parameters
    struct TaxData {
        address wallet;
        uint    feeBps;
    }

    TaxData private taxData;
    
    //data indexes
    uint private constant KNC_RATE_RANGE_INDEX = 0;
    uint private constant ADD_RESERVE_INDEX = 1;
    uint private constant WALLET_FEE_INDEX = 2;
    uint private constant TAX_DATA_INDEX = 3;
    uint private constant LAST_DATA_INDEX = 4;

    //general functions
    function WrapFeeBurner(FeeBurner _feeBurner, address _admin) public
        WrapperBase(PermissionGroups(address(_feeBurner)), _admin, LAST_DATA_INDEX)
    {
        require(_feeBurner != address(0));
        feeBurnerContract = _feeBurner;
    }

    // knc rate handling
    //////////////////////
    function setPendingKNCRateRange(uint minRate, uint maxRate) public onlyOperator {
        require(minRate < maxRate);
        require(minRate > 0);

        //update data tracking
        setNewData(KNC_RATE_RANGE_INDEX);

        kncPerEth.pendingMinRate = minRate;
        kncPerEth.pendingMaxRate = maxRate;
    }

    function approveKNCRateRange(uint nonce) public onlyOperator {
        if (addSignature(KNC_RATE_RANGE_INDEX, nonce, msg.sender)) {
            // can perform operation.
            kncPerEth.minRate = kncPerEth.pendingMinRate;
            kncPerEth.maxRate = kncPerEth.pendingMaxRate;
        }
    }

    function getPendingKNCRateRange() public view returns(uint minRate, uint maxRate, uint nonce) {
        address[] memory signatures;
        minRate = kncPerEth.pendingMinRate;
        maxRate = kncPerEth.pendingMaxRate;
        (signatures, nonce) = getDataTrackingParameters(KNC_RATE_RANGE_INDEX);

        return(minRate, maxRate, nonce);
    }

    function getKNCRateRange() public view returns(uint minRate, uint maxRate) {
        minRate = kncPerEth.minRate;
        maxRate = kncPerEth.maxRate;
        return(minRate, maxRate);
    }

    function setKNCPerEthRate(uint kncPerEther) public onlyOperator {
        require(kncPerEther >= kncPerEth.minRate);
        require(kncPerEther <= kncPerEth.maxRate);
        feeBurnerContract.setKNCRate(kncPerEther);
    }

    function getKNCRateRangeSignatures() public view returns (address[] signatures) {
        uint nonce;
        (signatures, nonce) = getDataTrackingParameters(KNC_RATE_RANGE_INDEX);
        return(signatures);
    }

    //set reserve data
    //////////////////
    function setPendingReserveData(address _reserve, uint feeBps, address kncWallet) public onlyOperator {
        require(_reserve != address(0));
        require(kncWallet != address(0));
        require(feeBps > 0);

        addReserve.reserve = _reserve;
        addReserve.feeBps = feeBps;
        addReserve.kncWallet = kncWallet;
        setNewData(ADD_RESERVE_INDEX);
    }
    
    function approveAddReserveData(uint nonce) public onlyOperator {
        if (addSignature(ADD_RESERVE_INDEX, nonce, msg.sender)) {
            // can perform operation.
            feeBurnerContract.setReserveData(addReserve.reserve, addReserve.feeBps, addReserve.kncWallet);
        }
    }

    function getPendingAddReserveData() public view
        returns(address _reserve, uint feeBps, address kncWallet, uint nonce)
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

    //wallet fee
    /////////////
    function setPendingWalletFee(address wallet, uint feeInBps) public onlyOperator {
        require(wallet != address(0));
        require(feeInBps > 0);
        walletFee.wAddress = wallet;
        walletFee.feeBps = feeInBps;
        setNewData(WALLET_FEE_INDEX);
    }

    function approveWalletFeeData(uint nonce) public onlyOperator {
        if (addSignature(WALLET_FEE_INDEX, nonce, msg.sender)) {
            // can perform operation.
            feeBurnerContract.setWalletFees(walletFee.wAddress, walletFee.feeBps);
        }
    }

    function getPendingWalletFeeData() public view returns(address wallet, uint feeBps, uint nonce) {
        address[] memory signatures;
        (signatures, nonce) = getDataTrackingParameters(WALLET_FEE_INDEX);
        return(walletFee.wAddress, walletFee.feeBps, nonce);
    }

    function getWalletFeeSignatures() public view returns (address[] signatures) {
        uint nonce;
        (signatures, nonce) = getDataTrackingParameters(WALLET_FEE_INDEX);
        return(signatures);
    }

    //tax parameters
    ////////////////
    function setPendingTaxParameters(address _taxWallet, uint _taxFeeBps) public onlyOperator {
        require(_taxWallet != address(0));
        require(_taxFeeBps > 0);

        taxData.wallet = _taxWallet;
        taxData.feeBps = _taxFeeBps;
        setNewData(TAX_DATA_INDEX);
    }

    function approveTaxData(uint nonce) public onlyOperator {
        if (addSignature(TAX_DATA_INDEX, nonce, msg.sender)) {
            // can perform operation.
            feeBurnerContract.setTaxInBps(taxData.feeBps);
            feeBurnerContract.setTaxWallet(taxData.wallet);
        }
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
}

