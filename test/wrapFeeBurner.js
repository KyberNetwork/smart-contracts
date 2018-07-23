let FeeBurner = artifacts.require("./FeeBurner.sol");
let TestToken = artifacts.require("./mockContracts/TestToken.sol");
let WrapFeeBurner = artifacts.require("./wrapperContracts/WrapFeeBurner.sol");
let FeeBurnerWrapperProxy = artifacts.require("./wrapperContracts/FeeBurnerWrapperProxy.sol");
let KyberRegisterWallet = artifacts.require("./wrapperContracts/KyberRegisterWallet.sol");

let Helper = require("./helper.js");
let BigNumber = require('bignumber.js');

//global variables
let kncToEthMin = 250;
let kncToEthMax = 450;
let kncToEthRate = 300;

let admin;
let alerter;
let numTokens = 2;
let tokens = [];
let operator1;
let operator2;
let operator3;

let taxWallet;
let someExternalWallet;
let mockKNCWallet;
let mockReserve;
let reserveFeeBps = 25;
let mockKyberNetwork;
let mock3rdPartyWallet;
let permissionLessWallet1;
let permissionLessWallet2;
let permissionLessWallet3;
let permissionLessWallet4;

let mock3rdPartyWalletFeeBps = 200;
let taxFeeBps = 30;

let burnerInst;
let wrapBurnerInst;
let proxyWrapperInst;
let registerWalletInst;

let kncRateRangeNonce = 0;
let addReserveNonce = 0;
let otherWalletNonce = 0;
let taxDataNonce = 0;

let initialKNCWalletBalance = 1000000;

contract('WrapFeeBurner', function(accounts) {
    it("should init Fee burner Inst and set general parameters.", async function () {
        admin = accounts[0];
        operator1 = accounts[1];
        operator2 = accounts[2];
        operator3 = accounts[3];
        mock3rdPartyWallet = accounts[4];

        taxWallet = accounts[5];
        someExternalWallet = accounts[6];
        mockKNCWallet = accounts[7];
        mockReserve = accounts[8];
        mockKyberNetwork = accounts[9];

        permissionLessWallet1 = accounts[1];
        permissionLessWallet2 = accounts[2];
        permissionLessWallet3 = accounts[3];
        permissionLessWallet4 = accounts[9];

        //init fee burner
        //move funds to knc wallet
        kncToken = await TestToken.new("kyber", "KNC", 18);
        await kncToken.transfer(mockKNCWallet, initialKNCWalletBalance);
        let balance = await kncToken.balanceOf(mockKNCWallet);
        assert.equal(balance.valueOf(), initialKNCWalletBalance, "unexpected wallet balance.");
        burnerInst = await FeeBurner.new(admin, kncToken.address, mockKyberNetwork);
    });

    it("should init FeeBurner wrapper and set as fee burner admin.", async function () {
        wrapBurnerInst = await WrapFeeBurner.new(burnerInst.address, admin);
        await wrapBurnerInst.addOperator(operator1);
        await wrapBurnerInst.addOperator(operator2);
        await wrapBurnerInst.addOperator(operator3);

        //transfer admin to wrapper
        await burnerInst.transferAdmin(wrapBurnerInst.address);
        await wrapBurnerInst.claimWrappedContractAdmin({from: operator1});
    });

    it("should test setting knc rate range ", async function () {
        await wrapBurnerInst.setPendingKNCRateRange(kncToEthMin, kncToEthMax, {from: operator1});
        kncRateRangeNonce++;
        let rateRangeData = await wrapBurnerInst.getPendingKNCRateRange();
        assert.equal(rateRangeData[2].valueOf(), kncRateRangeNonce);

        await wrapBurnerInst.setPendingKNCRateRange(kncToEthMin, kncToEthMax, {from: operator1});
        kncRateRangeNonce++;
        rateRangeData = await wrapBurnerInst.getPendingKNCRateRange();
        assert.equal(rateRangeData[2].valueOf(), kncRateRangeNonce);
        assert.equal(rateRangeData[0].valueOf(), kncToEthMin);
        assert.equal(rateRangeData[1].valueOf(), kncToEthMax);

        //can't approve with wrong nonce
        try {
            await wrapBurnerInst.approveKNCRateRange((kncRateRangeNonce - 1), {from:operator1});
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        await wrapBurnerInst.approveKNCRateRange(kncRateRangeNonce, {from:operator1});
        await wrapBurnerInst.approveKNCRateRange(kncRateRangeNonce, {from:operator2});

        //check approving signatures
        let rxSignatures = await wrapBurnerInst.getKNCRateRangeSignatures();
        assert.equal(rxSignatures[0].valueOf(), operator1);
        assert.equal(rxSignatures[1].valueOf(), operator2);

        //make sure not updated yet
        let ratesRange = await wrapBurnerInst.getKNCRateRange();
        assert.equal(ratesRange[0].valueOf(), 0);
        assert.equal(ratesRange[1].valueOf(), 0);

        //last approval. now should be updated
        await wrapBurnerInst.approveKNCRateRange(kncRateRangeNonce, {from:operator3});

        ratesRange = await wrapBurnerInst.getKNCRateRange();
        assert.equal(ratesRange[0].valueOf(), kncToEthMin);
        assert.equal(ratesRange[1].valueOf(), kncToEthMax);
    });

    it("should test setting illegal knc rate boundaries = range ", async function () {
        let kncMax = 10;
        let kncMin = 15;

        //rate range
        try {
            await wrapBurnerInst.setPendingKNCRateRange(kncMin, kncMax, {from: operator1});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        kncMin = 0;

        try {
            await wrapBurnerInst.setPendingKNCRateRange(kncMin, kncMax, {from: operator1});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }


        kncMin = kncToEthMin;
        kncMax = kncToEthMax;

        await wrapBurnerInst.setPendingKNCRateRange(kncMin, kncMax, {from: operator1});
        kncRateRangeNonce++;
    });

    it("should test setting knc rate and verify it has to be between min and max", async function () {
        await wrapBurnerInst.setKNCPerEthRate(kncToEthRate, {from: operator1});

        let rxKncEthRate = await burnerInst.kncPerETHRate();
        assert.equal(rxKncEthRate.valueOf(), kncToEthRate);

        //rate range
        try {
            await wrapBurnerInst.setKNCPerEthRate(kncToEthMin - 1, {from: operator1});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await wrapBurnerInst.setKNCPerEthRate(kncToEthMax * 1 + 1, {from: operator1});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("should test adding reserve with its related knc wallet and fees", async function () {
        await wrapBurnerInst.setPendingReserveData(mockReserve, reserveFeeBps, mockKNCWallet, {from: operator1});
        addReserveNonce++;
        let pendingReserveData = await wrapBurnerInst.getPendingAddReserveData();
        assert.equal(pendingReserveData[3].valueOf(), addReserveNonce);

        await wrapBurnerInst.setPendingReserveData(mockReserve, reserveFeeBps, mockKNCWallet, {from: operator1});
        addReserveNonce++;
        pendingReserveData = await wrapBurnerInst.getPendingAddReserveData();
        assert.equal(pendingReserveData[3].valueOf(), addReserveNonce);

        assert.equal(pendingReserveData[0].valueOf(), mockReserve);
        assert.equal(pendingReserveData[1].valueOf(), reserveFeeBps);
        assert.equal(pendingReserveData[2].valueOf(), mockKNCWallet);

        //can't approve with wrong nonce
        try {
            await wrapBurnerInst.approveAddReserveData((addReserveNonce - 1), {from:operator1});
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        await wrapBurnerInst.approveAddReserveData(addReserveNonce, {from:operator1});
        await wrapBurnerInst.approveAddReserveData(addReserveNonce, {from:operator2});

        //check approving signatures
        let rxSignatures = await wrapBurnerInst.getAddReserveSignatures();
        assert.equal(rxSignatures[0].valueOf(), operator1);
        assert.equal(rxSignatures[1].valueOf(), operator2);

        let rxReserveWallet = await burnerInst.reserveKNCWallet(mockReserve);
        let rxReserveFee = await burnerInst.reserveFeeToBurn(mockReserve);

        assert.equal(rxReserveWallet.valueOf(), 0);
        assert.equal(rxReserveFee.valueOf(), 0);

        await wrapBurnerInst.approveAddReserveData(addReserveNonce, {from:operator3});

        rxReserveWallet = await burnerInst.reserveKNCWallet(mockReserve);
        rxReserveFee = await burnerInst.reserveFeesInBps(mockReserve);

        assert.equal(rxReserveWallet.valueOf(), mockKNCWallet);
        assert.equal(rxReserveFee.valueOf(), reserveFeeBps);
    });

    it("should test adding 3rd party wallet with fees", async function () {
        await wrapBurnerInst.setPendingWalletFee(mock3rdPartyWallet, mock3rdPartyWalletFeeBps, {from: operator1});
        otherWalletNonce++;
        let pending3rdPartyWalletData = await wrapBurnerInst.getPendingWalletFeeData();
        assert.equal(pending3rdPartyWalletData[2].valueOf(), otherWalletNonce);

        await wrapBurnerInst.setPendingWalletFee(mock3rdPartyWallet, mock3rdPartyWalletFeeBps, {from: operator1});
        otherWalletNonce++;
        pending3rdPartyWalletData = await wrapBurnerInst.getPendingWalletFeeData();
        assert.equal(pending3rdPartyWalletData[2].valueOf(), otherWalletNonce);

        assert.equal(pending3rdPartyWalletData[0].valueOf(), mock3rdPartyWallet);
        assert.equal(pending3rdPartyWalletData[1].valueOf(), mock3rdPartyWalletFeeBps);

        //can't approve with wrong nonce
        try {
            await wrapBurnerInst.approveWalletFeeData((otherWalletNonce - 1), {from:operator1});
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
        await wrapBurnerInst.approveWalletFeeData(otherWalletNonce, {from:operator1});
        await wrapBurnerInst.approveWalletFeeData(otherWalletNonce, {from:operator2});

        //check approving signatures
        let rxSignatures = await wrapBurnerInst.getWalletFeeSignatures();
        assert.equal(rxSignatures[0].valueOf(), operator1);
        assert.equal(rxSignatures[1].valueOf(), operator2);

        let rx3rdPartyFeeBps = await burnerInst.walletFeesInBps(mock3rdPartyWallet);
        assert.equal(rx3rdPartyFeeBps.valueOf(), 0);

        await wrapBurnerInst.approveWalletFeeData(otherWalletNonce, {from:operator3});

        rx3rdPartyFeeBps = await burnerInst.walletFeesInBps(mock3rdPartyWallet);
        assert.equal(rx3rdPartyFeeBps.valueOf(), mock3rdPartyWalletFeeBps);
    });

    it("should add permission less wallet and query values", async function () {
        //any address can register any wallet.
        await wrapBurnerInst.registerWalletForFeeSharing(permissionLessWallet1);

        let defaultFeeSharingBPS = await wrapBurnerInst.feeSharingBps();
        let feeForWalletBPS = await burnerInst.walletFeesInBps(permissionLessWallet1);
        assert.equal(defaultFeeSharingBPS.valueOf(), feeForWalletBPS.valueOf());
    });

    it("should add another permission less wallet and query wallet array values", async function () {
        //any address can register any wallet.
        await wrapBurnerInst.registerWalletForFeeSharing(permissionLessWallet2);

        let sharingWallets = await wrapBurnerInst.getFeeSharingWallets();

        assert.equal(sharingWallets.length, 2);
        assert.equal(sharingWallets[0], permissionLessWallet1);
        assert.equal(sharingWallets[1], permissionLessWallet2);

        let defaultFeeSharingBPS = await wrapBurnerInst.feeSharingBps();
        let feeForWalletBPS = await burnerInst.walletFeesInBps(permissionLessWallet2);
        assert.equal(defaultFeeSharingBPS.valueOf(), feeForWalletBPS.valueOf());
    });


    it("verify revert when adding permission less wallet that exists", async function () {
        //any address can register any wallet.

        try {
            await wrapBurnerInst.registerWalletForFeeSharing(mock3rdPartyWallet);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //see hasn't changed
        let feeForWalletBPS = await burnerInst.walletFeesInBps(mock3rdPartyWallet);
        assert.equal(feeForWalletBPS, mock3rdPartyWalletFeeBps);
    });

    it("verify revert when adding permission less wallet with same address as verified wallet.", async function () {
        //any address can register any wallet.

        try{
            await wrapBurnerInst.registerWalletForFeeSharing(permissionLessWallet1);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("should update fee sharing value and see updated.", async function () {
        let defaultFeeSharingBPS = await wrapBurnerInst.feeSharingBps();

        let newFeeShare = 5000;
        await wrapBurnerInst.setFeeSharingValue(newFeeShare, {from: admin});
        let feeSharingBPS = await wrapBurnerInst.feeSharingBps();
        assert.equal(newFeeShare, feeSharingBPS);

        await wrapBurnerInst.setFeeSharingValue(defaultFeeSharingBPS.valueOf());
        feeSharingBPS = await wrapBurnerInst.feeSharingBps();
        assert.equal(defaultFeeSharingBPS.valueOf(), feeSharingBPS.valueOf());
    });

    it("should verify only admin can update fee sharing value.", async function () {
        let defaultFeeSharingBPS = await wrapBurnerInst.feeSharingBps();

        try {
            await wrapBurnerInst.setFeeSharingValue(5500, {from :operator1});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //verify hasn't changed
        let feeSharingBPS = await wrapBurnerInst.feeSharingBps();
        assert.equal(defaultFeeSharingBPS.valueOf(), feeSharingBPS.valueOf());
    });

    it("should test setting tax wallet and tax fees", async function () {
        await wrapBurnerInst.setPendingTaxParameters(taxWallet, taxFeeBps, {from: operator1});
        taxDataNonce++;
        let pendingTaxData = await wrapBurnerInst.getPendingTaxData();
        assert.equal(pendingTaxData[2].valueOf(), taxDataNonce);

        //verify nonce changed
        await wrapBurnerInst.setPendingTaxParameters(taxWallet, taxFeeBps, {from: operator1});
        taxDataNonce++;
        pendingTaxData = await wrapBurnerInst.getPendingTaxData();
        assert.equal(pendingTaxData[2].valueOf(), taxDataNonce);

        assert.equal(pendingTaxData[0].valueOf(), taxWallet);
        assert.equal(pendingTaxData[1].valueOf(), taxFeeBps);

        await wrapBurnerInst.approveTaxData(taxDataNonce, {from:operator1});
        await wrapBurnerInst.approveTaxData(taxDataNonce, {from:operator2});

        //check approving signatures
        let rxSignatures = await wrapBurnerInst.getTaxDataSignatures();
        assert.equal(rxSignatures[0].valueOf(), operator1);
        assert.equal(rxSignatures[1].valueOf(), operator2);

        let rxTaxWallet = await burnerInst.taxWallet();
        let rxTaxFeeBps = await burnerInst.taxFeeBps();
        assert.equal(rxTaxWallet.valueOf(), 0);
        assert.equal(rxTaxFeeBps.valueOf(), 0);

        await wrapBurnerInst.approveTaxData(taxDataNonce, {from:operator3});

        rxTaxWallet = await burnerInst.taxWallet();
        rxTaxFeeBps = await burnerInst.taxFeeBps();
        assert.equal(rxTaxWallet.valueOf(), taxWallet);
        assert.equal(rxTaxFeeBps.valueOf(), taxFeeBps);
    });

    it("should test only operator can call set and approve function.", async function() {
        //rate range
        try {
            await wrapBurnerInst.setPendingKNCRateRange(kncToEthMin, kncToEthMax, {from: admin});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await wrapBurnerInst.approveKNCRateRange(kncRateRangeNonce, {from:admin});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //knc rate
        try {
            await wrapBurnerInst.setKNCPerEthRate(kncToEthRate, {from: admin});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //add reserve
        try {
            await wrapBurnerInst.setPendingReserveData(mockReserve, mockKNCWallet, reserveFeeBps, {from: admin});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await wrapBurnerInst.approveAddReserveData(addReserveNonce, {from:admin});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //3rd party wallet
        try {
            await wrapBurnerInst.setPendingWalletFee(mock3rdPartyWallet, mock3rdPartyWalletFeeBps, {from: admin});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await wrapBurnerInst.approveWalletFeeData(otherWalletNonce, {from:admin});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //tax data
        try {
            await wrapBurnerInst.setPendingTaxParameters(taxWallet, taxFeeBps, {from: admin});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await wrapBurnerInst.approveTaxData(taxDataNonce, {from:admin});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("should test each operator can approve only once per new data that was set.", async function() {
        //knc rate
        await wrapBurnerInst.setPendingKNCRateRange(kncToEthMin, kncToEthMax, {from: operator1});
        kncRateRangeNonce++;

        await wrapBurnerInst.approveKNCRateRange(kncRateRangeNonce, {from:operator1});
        try {
            await wrapBurnerInst.approveKNCRateRange(kncRateRangeNonce, {from:operator1});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //reserve data
        await wrapBurnerInst.setPendingReserveData(mockReserve, reserveFeeBps, mockKNCWallet, {from: operator1});
        addReserveNonce++;

        await wrapBurnerInst.approveAddReserveData(addReserveNonce, {from:operator1});
        try {
            await wrapBurnerInst.approveAddReserveData(addReserveNonce, {from:operator1});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

       //3rd party wallet
        await wrapBurnerInst.setPendingWalletFee(mock3rdPartyWallet, mock3rdPartyWalletFeeBps, {from: operator1});
        otherWalletNonce++;

        await wrapBurnerInst.approveWalletFeeData(otherWalletNonce, {from:operator1});
        try {
            await wrapBurnerInst.approveWalletFeeData(otherWalletNonce, {from:operator1});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        // tax data
        await wrapBurnerInst.setPendingTaxParameters(taxWallet, taxFeeBps, {from: operator1});
        taxDataNonce++;

        await wrapBurnerInst.approveTaxData(taxDataNonce, {from:operator1});
        try {
            await wrapBurnerInst.approveTaxData(taxDataNonce, {from:operator1});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("test init wrapper with illegal values reverted.", async function() {
        let wrapper;

        try {
            wrapper = await WrapFeeBurner.new(0, admin);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            wrapper = await WrapFeeBurner.new(burnerInst.address, 0);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        wrapper = await WrapFeeBurner.new(burnerInst.address, admin);
    });

    it("test set pending reserve data with illegal values is reverted.", async function() {
        try {
            await wrapBurnerInst.setPendingReserveData(0, reserveFeeBps, mockKNCWallet, {from: operator1});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await wrapBurnerInst.setPendingReserveData(mockReserve, 0, mockKNCWallet, {from: operator1});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await wrapBurnerInst.setPendingReserveData(mockReserve, reserveFeeBps, 0, {from: operator1});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        await wrapBurnerInst.setPendingReserveData(mockReserve, reserveFeeBps, mockKNCWallet, {from: operator1});
        addReserveNonce++;
    });

    it("test set pending wallet fee with illegal values is reverted.", async function() {
        try {
            await wrapBurnerInst.setPendingWalletFee(0, mock3rdPartyWalletFeeBps, {from: operator1});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await wrapBurnerInst.setPendingWalletFee(mock3rdPartyWallet, 0, {from: operator1});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        await wrapBurnerInst.setPendingWalletFee(mock3rdPartyWallet, mock3rdPartyWalletFeeBps, {from: operator1});
        otherWalletNonce++;
    });

    it("test setting permission less wallet with wrapper proxy and query values.", async function() {
        proxyWrapperInst = await FeeBurnerWrapperProxy.new(wrapBurnerInst.address);

         //any address can register any wallet.
        await proxyWrapperInst.registerWallet(permissionLessWallet3);

        let sharingWallets = await wrapBurnerInst.getFeeSharingWallets();

        assert.equal(sharingWallets.length, 3);
        assert.equal(sharingWallets[0], permissionLessWallet1);
        assert.equal(sharingWallets[1], permissionLessWallet2);
        assert.equal(sharingWallets[2], permissionLessWallet3);

        let defaultFeeSharingBPS = await wrapBurnerInst.feeSharingBps();
        let feeForWalletBPS = await burnerInst.walletFeesInBps(permissionLessWallet3);
        assert.equal(defaultFeeSharingBPS.valueOf(), feeForWalletBPS.valueOf());
    });

    it("test setting permission less wallet with register wallet contract and query values.", async function() {
        registerWalletInst = await KyberRegisterWallet.new(proxyWrapperInst.address);

         //any address can register any wallet.
        await registerWalletInst.registerWallet(permissionLessWallet4);

        let sharingWallets = await wrapBurnerInst.getFeeSharingWallets();

        assert.equal(sharingWallets.length, 4);
        assert.equal(sharingWallets[0], permissionLessWallet1);
        assert.equal(sharingWallets[1], permissionLessWallet2);
        assert.equal(sharingWallets[2], permissionLessWallet3);
        assert.equal(sharingWallets[3], permissionLessWallet4);

        let defaultFeeSharingBPS = await wrapBurnerInst.feeSharingBps();
        let feeForWalletBPS = await burnerInst.walletFeesInBps(permissionLessWallet4);
        assert.equal(defaultFeeSharingBPS.valueOf(), feeForWalletBPS.valueOf());
    });

    it("test set pending wallet tax data with illegal values is reverted.", async function() {
        try {
            await wrapBurnerInst.setPendingTaxParameters(0, taxFeeBps, {from: operator1});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await wrapBurnerInst.setPendingTaxParameters(taxWallet, 0, {from: operator1});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        await wrapBurnerInst.setPendingTaxParameters(taxWallet, taxFeeBps, {from: operator1});
        taxDataNonce++;
    });
});

function log(str) {
    console.log(str);
}