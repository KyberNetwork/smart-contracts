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
    
    //add reserve pending data
    address reserve;
    uint reserveFeeBps;
    address reserveKNCWallet;
    
    //wallet fee parametrs
    address walletAddress;
    uint walletFeeBps;

    //tax pending parameters
    address taxWallet;
    uint taxFeeBps;

    //data indexes
    uint constant kncRateRangeIndex = 0;
    uint constant addReserveIndex = 1;
    uint constant walletFeeIndex = 2;
    uint constant taxDataIndex = 3;
    uint constant lastDataIndex = 4;

    //general functions
    function WrapFeeBurner(FeeBurner _feeBurner, address _admin) public
        WrapperBase(PermissionGroups(address(_feeBurner)), _admin, lastDataIndex)
    {
        require (_feeBurner != address(0));
        feeBurnerContract = _feeBurner;
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

    function getPendingKNCRateRange() public view returns(uint minRate, uint maxRate, uint nonce) {
        minRate = kncPerEthPendingMinRate;
        maxRate = kncPerEthPendingMaxRate;
        (, nonce) = getDataTrackingParameters(kncRateRangeIndex);

        return(minRate, maxRate, nonce);
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
        (signatures,) = getDataTrackingParameters(kncRateRangeIndex);
        return(signatures);
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

    function getPendingAddReserveData() public view returns(address _reserve, uint feeBps, address kncWallet, uint nonce) {
        (, nonce) = getDataTrackingParameters(addReserveIndex);
        return(reserve, reserveFeeBps, reserveKNCWallet, nonce);
    }

    function getAddReserveSignatures() public view returns (address[] signatures) {
        (signatures, ) = getDataTrackingParameters(addReserveIndex);
        return(signatures);
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

    function getPendingWalletFeeData() public view returns(address wallet, uint feeBps, uint nonce) {
        (, nonce) = getDataTrackingParameters(walletFeeIndex);
        return(walletAddress, walletFeeBps, nonce);
    }

    function getWalletFeeSignatures() public view returns (address[] signatures) {
        (signatures, ) = getDataTrackingParameters(walletFeeIndex);
        return(signatures);
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

    function getPendingTaxData() public view returns(address wallet, uint feeBps, uint nonce) {
        (, nonce) = getDataTrackingParameters(taxDataIndex);
        return(taxWallet, taxFeeBps, nonce);
    }

    function getTaxDataSignatures() public view returns (address[] signatures) {
        uint nonce;
        (signatures, nonce) = getDataTrackingParameters(taxDataIndex);
        return(signatures);
    }
}

