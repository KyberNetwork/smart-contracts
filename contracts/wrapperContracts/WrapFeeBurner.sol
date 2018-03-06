pragma solidity 0.4.18;


import "../ERC20Interface.sol";
//import "../Withdrawable.sol";
import "../FeeBurner.sol";
import "./WrapperBase.sol";


contract WrapFeeBurner is WrapperBase {

    FeeBurner feeBurnerContract;

    //knc rate range
    uint kncPerEthMinRate;
    uint kncPerEthMaxRate;
    uint kncPerEthPendingMinRate;
    uint kncPerEthPendingMaxRate;
    uint kncRateRangeIndex;

    //add reserve pending data
    address reserve;
    uint reserveFeeBps;
    address reserveKNCWallet;
    uint addReserveIndex;
    
    //wallet fee parametrs
    address walletAddress;
    uint walletFeeBps;
    uint walletFeeIndex;
    
    //tax pending parameters
    address taxWallet;
    uint taxFeeBps;
    uint taxDataIndex;

    //general functions
    function WrapFeeBurner(FeeBurner _feeBurner, address _admin) public
        WrapperBase(PermissionGroups(address(_feeBurner)), _admin)
    {
        require (_feeBurner != address(0));
        feeBurnerContract = _feeBurner;
        kncRateRangeIndex = addDataInstance();
        addReserveIndex = addDataInstance();
        walletFeeIndex = addDataInstance();
        taxDataIndex = addDataInstance();
    }

    // knc rate handling
    //////////////////////
    function setPendingKNCRateRange(uint minRate, uint maxRate) public onlyOperator {
        require(minRate < maxRate);
        require(minRate > 0);

        //update data tracking
        setNewData(kncRateRangeIndex);

        kncPerEthPendingMinRate = minRate;
        kncPerEthPendingMaxRate = maxRate;
    }

    function approveKNCRateRange(uint nonce) public onlyOperator {
        if(addSignature(kncRateRangeIndex, nonce, msg.sender)) {
            // can perform operation.
            kncPerEthMinRate = kncPerEthPendingMinRate;
            kncPerEthMaxRate = kncPerEthPendingMaxRate;
        }
    }

    function getPendingKNCRateRange() public view returns(uint minRate, uint maxRate) {
        minRate = kncPerEthPendingMinRate;
        maxRate = kncPerEthPendingMaxRate;
        return(minRate, maxRate);
    }

    function getKNCRateRange() public view returns(uint minRate, uint maxRate) {
        minRate = kncPerEthMinRate;
        maxRate = kncPerEthMaxRate;
        return(minRate, maxRate);
    }

    function setKNCPerEthRate(uint kncPerEth) public onlyOperator {
        require(kncPerEth >= kncPerEthMinRate);
        require(kncPerEth <= kncPerEthMaxRate);
        feeBurnerContract.setKNCRate(kncPerEth);
    }

    function getKNCRateRangeSignatures() public view returns (address[] signatures) {
        uint nonce;
        (signatures, nonce) = getDataTrackingParameters(kncRateRangeIndex);
        return(signatures);
    }

    function getKNCRateRangeNonce() public view returns (uint nonce) {
        address[] memory signatures;
        (signatures, nonce) = getDataTrackingParameters(kncRateRangeIndex);
        return(nonce);
    }

    //set reserve data
    //////////////////
    function setPendingReserveData(address _reserve, uint feeBps, address kncWallet) public onlyOperator {
        reserve = _reserve;
        reserveFeeBps = feeBps;
        reserveKNCWallet = kncWallet;
        setNewData(addReserveIndex);
    }
    
    function approveAddReserveData(uint nonce) public onlyOperator {
        if(addSignature(addReserveIndex, nonce, msg.sender)) {
            // can perform operation.
            feeBurnerContract.setReserveData(reserve, reserveFeeBps, reserveKNCWallet);
        }
    }

    function getPendingAddReserveData() public view returns(address _reserve, uint feeBps, address kncWallet) {
        return(reserve, reserveFeeBps, reserveKNCWallet);
    }

    function getAddReserveSignatures() public view returns (address[] signatures) {
        uint nonce;
        (signatures, nonce) = getDataTrackingParameters(addReserveIndex);
        return(signatures);
    }

    function getAddReserveNonce() public view returns (uint nonce) {
        address[] memory signatures;
        (signatures, nonce) = getDataTrackingParameters(addReserveIndex);
        return(nonce);
    }

    //wallet fee
    /////////////
    function setPendingWalletFee(address wallet, uint feeInBps) public onlyOperator {
        walletAddress = wallet;
        walletFeeBps = feeInBps;
        setNewData(walletFeeIndex);
    }

    function approveWalletFeeData(uint nonce) public onlyOperator {
        if(addSignature(walletFeeIndex, nonce, msg.sender)) {
            // can perform operation.
            feeBurnerContract.setWalletFees(walletAddress, walletFeeBps);
        }
    }

    function getPendingWalletFeeData() public view returns(address wallet, uint feeBps) {
        return(walletAddress, walletFeeBps);
    }

    function getWalletFeeSignatures() public view returns (address[] signatures) {
        uint nonce;
        (signatures, nonce) = getDataTrackingParameters(walletFeeIndex);
        return(signatures);
    }

    function getWalletFeeNonce() public view returns (uint nonce) {
        address[] memory signatures;
        (signatures, nonce) = getDataTrackingParameters(walletFeeIndex);
        return(nonce);
    }

    //tax parameters
    ////////////////
    function setPendingTaxParameters(address _taxWallet, uint _taxFeeBps) public onlyOperator {
        taxWallet = _taxWallet;
        taxFeeBps = _taxFeeBps;
        setNewData(taxDataIndex);
    }

    function approveTaxData(uint nonce) public onlyOperator {
        if(addSignature(taxDataIndex, nonce, msg.sender)) {
            // can perform operation.
            feeBurnerContract.setTaxInBps(taxFeeBps);
            feeBurnerContract.setTaxWallet(taxWallet);
        }
    }

    function getPendingTaxData() public view returns(address wallet, uint feeBps) {
        return(taxWallet, taxFeeBps);
    }

    function getTaxDataSignatures() public view returns (address[] signatures) {
        uint nonce;
        (signatures, nonce) = getDataTrackingParameters(taxDataIndex);
        return(signatures);
    }

    function getTaxDataNonce() public view returns (uint nonce) {
        address[] memory signatures;
        (signatures, nonce) = getDataTrackingParameters(taxDataIndex);
        return(nonce);
    }
}

