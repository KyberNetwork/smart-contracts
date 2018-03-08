let FeeBurner = artifacts.require("./FeeBurner.sol");
let TestToken = artifacts.require("./mockContracts/TestToken.sol");
let WrapFeeBurner = artifacts.require("./wrapperContracts/WrapFeeBurner.sol");

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
let mock3rdPartyWalletFeeBps = 200;
let taxFeeBps = 30;

let burnerInst;
let wrapBurnerInst;

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

        //init fee burner
        //move funds to knc wallet
        kncToken = await TestToken.new("kyber", "KNC", 18);
        await kncToken.transfer(mockKNCWallet, initialKNCWalletBalance);
        let balance = await kncToken.balanceOf(mockKNCWallet);
        assert.equal(balance.valueOf(), initialKNCWalletBalance, "unexpected wallet balance.");
        burnerInst = await FeeBurner.new(admin, kncToken.address, mockKyberNetwork);
    });

    it("should init FeeBurner wrapper wrapper and set as fee burner admin.", async function () {
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

        await wrapBurnerInst.approveKNCRateRange(kncRateRangeNonce, {from:operator1});
        await wrapBurnerInst.approveKNCRateRange(kncRateRangeNonce, {from:operator2});

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

    it("should test setting knc rate and verify it has to be between min and max", async function () {
        await wrapBurnerInst.setKNCPerEthRate(kncToEthRate, {from: operator1});

        let rxKncEthRate = await burnerInst.kncPerETHRate();
        assert.equal(rxKncEthRate.valueOf(), kncToEthRate);

        //rate range
        try {
            await wrapBurnerInst.setKNCPerEthRate(kncToEthMin - 1, {from: operator1});
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await wrapBurnerInst.setKNCPerEthRate(kncToEthMax * 1 + 1, {from: operator1});
            assert(false, "throw was expected in line above.")
        }
        catch(e){
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

        await wrapBurnerInst.approveAddReserveData(addReserveNonce, {from:operator1});
        await wrapBurnerInst.approveAddReserveData(addReserveNonce, {from:operator2});

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

        await wrapBurnerInst.approveWalletFeeData(otherWalletNonce, {from:operator1});
        await wrapBurnerInst.approveWalletFeeData(otherWalletNonce, {from:operator2});

        let rx3rdPartyFeeBps = await burnerInst.walletFeesInBps(mock3rdPartyWallet);
        assert.equal(rx3rdPartyFeeBps.valueOf(), 0);

        await wrapBurnerInst.approveWalletFeeData(otherWalletNonce, {from:operator3});

        rx3rdPartyFeeBps = await burnerInst.walletFeesInBps(mock3rdPartyWallet);
        assert.equal(rx3rdPartyFeeBps.valueOf(), mock3rdPartyWalletFeeBps);
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
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await wrapBurnerInst.approveKNCRateRange(kncRateRangeNonce, {from:admin});
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //knc rate
        try {
            await wrapBurnerInst.setKNCPerEthRate(kncToEthRate, {from: admin});
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //add reserve
        try {
            await wrapBurnerInst.setPendingReserveData(mockReserve, mockKNCWallet, reserveFeeBps, {from: admin});
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await wrapBurnerInst.approveAddReserveData(addReserveNonce, {from:admin});
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //3rd party wallet
        try {
            await wrapBurnerInst.setPendingWalletFee(mock3rdPartyWallet, mock3rdPartyWalletFeeBps, {from: admin});
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await wrapBurnerInst.approveWalletFeeData(otherWalletNonce, {from:admin});
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //tax data
        try {
            await wrapBurnerInst.setPendingTaxParameters(taxWallet, taxFeeBps, {from: admin});
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await wrapBurnerInst.approveTaxData(taxDataNonce, {from:admin});
            assert(false, "throw was expected in line above.")
        }
        catch(e){
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
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //reserve data
        await wrapBurnerInst.setPendingReserveData(mockReserve, mockKNCWallet, reserveFeeBps, {from: operator1});
        addReserveNonce++;

        await wrapBurnerInst.approveAddReserveData(addReserveNonce, {from:operator1});
        try {
            await wrapBurnerInst.approveAddReserveData(addReserveNonce, {from:operator1});
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //3rd party wallet
        await wrapBurnerInst.setPendingWalletFee(mock3rdPartyWallet, mock3rdPartyWalletFeeBps, {from: operator1});
        otherWalletNonce++;

        await wrapBurnerInst.approveWalletFeeData(otherWalletNonce, {from:operator1});
        try {
            await wrapBurnerInst.approveWalletFeeData(otherWalletNonce, {from:operator1});
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        // tax data
        await wrapBurnerInst.setPendingTaxParameters(taxWallet, taxFeeBps, {from: operator1});
        taxDataNonce++;

        await wrapBurnerInst.approveTaxData(taxDataNonce, {from:operator1});
        try {
            await wrapBurnerInst.approveTaxData(taxDataNonce, {from:operator1});
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });
});