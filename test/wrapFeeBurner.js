let FeeBurner = artifacts.require("./FeeBurner.sol");
let TestToken = artifacts.require("./mockContracts/TestToken.sol");
let WrapFeeBurner = artifacts.require("./wrapperContracts/WrapFeeBurner.sol");
let FeeBurnerWrapperProxy = artifacts.require("./wrapperContracts/FeeBurnerWrapperProxy.sol");
let KyberRegisterWallet = artifacts.require("./wrapperContracts/KyberRegisterWallet.sol");

let Helper = require("./helper.js");
let BigNumber = require('bignumber.js');

const precisionUnits = new BigNumber(10 ** 18);
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
let mockReserve2;
let mockReserve3;
let reserveFeeBps = 25;
let mockKyberNetwork;
let mockThirdPartyWallet;
let permissionLessWallet1;
let permissionLessWallet2;
let permissionLessWallet3;
let permissionLessWallet4;

let mockThirdPartyWalletFeeBps = 200;
let taxFeeBps = 30;

let burnerInst;
let wrapBurnerInst;
let proxyWrapperInst;
let registerWalletInst;

let addReserveNonce = 0;
let otherWalletNonce = 0;
let taxDataNonce = 0;

let initialKNCWalletBalance = 1000000;

const ethToKncRatePrecision = precisionUnits.mul(550);

contract('WrapFeeBurner', function(accounts) {
    it("should init Fee burner Inst and set general parameters.", async function () {
        admin = accounts[0];
        operator1 = accounts[1];
        operator2 = accounts[2];
        mockReserve2 = accounts[3];
        mockReserve3 = accounts[4];
        mockThirdPartyWallet = accounts[4];

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
        burnerInst = await FeeBurner.new(admin, kncToken.address, mockKyberNetwork, ethToKncRatePrecision);
    });

    it("should init FeeBurner wrapper and set as fee burner admin and operator.", async function () {
        wrapBurnerInst = await WrapFeeBurner.new(burnerInst.address, {from: admin});

        //for some operations, wrapper must be operator
        burnerInst.addOperator(wrapBurnerInst.address);

        //transfer admin to wrapper
        await burnerInst.transferAdmin(wrapBurnerInst.address);
        await wrapBurnerInst.claimWrappedContractAdmin({from: admin});
    });

    it("should test adding reserve with its related knc wallet and fees", async function () {
        let rxReserveWallet = await burnerInst.reserveKNCWallet(mockReserve);
        let rxReserveFee = await burnerInst.reserveFeeToBurn(mockReserve);

        assert.equal(rxReserveWallet.valueOf(), 0);
        assert.equal(rxReserveFee.valueOf(), 0);

        await wrapBurnerInst.setReserveData(mockReserve, reserveFeeBps, mockKNCWallet, {from: admin});

        rxReserveWallet = await burnerInst.reserveKNCWallet(mockReserve);
        rxReserveFee = await burnerInst.reserveFeesInBps(mockReserve);

        assert.equal(rxReserveWallet.valueOf(), mockKNCWallet);
        assert.equal(rxReserveFee.valueOf(), reserveFeeBps);
    });

    it("should test adding Third party wallet with fees", async function () {

        let rxThirdPartyFeeBps = await burnerInst.walletFeesInBps(mockThirdPartyWallet);
        assert.equal(rxThirdPartyFeeBps.valueOf(), 0);

        await wrapBurnerInst.setWalletFee(mockThirdPartyWallet, mockThirdPartyWalletFeeBps, {from: admin});

        rxThirdPartyFeeBps = await burnerInst.walletFeesInBps(mockThirdPartyWallet);
        assert.equal(rxThirdPartyFeeBps.valueOf(), mockThirdPartyWalletFeeBps);
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
            await wrapBurnerInst.registerWalletForFeeSharing(mockThirdPartyWallet);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //see hasn't changed
        let feeForWalletBPS = await burnerInst.walletFeesInBps(mockThirdPartyWallet);
        assert.equal(feeForWalletBPS, mockThirdPartyWalletFeeBps);
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

        let newFeeShare = 1 * defaultFeeSharingBPS + 1000 * 1;

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

        let rxTaxWallet = await burnerInst.taxWallet();
        let rxTaxFeeBps = await burnerInst.taxFeeBps();
        assert.equal(rxTaxWallet.valueOf(), 0);
        assert.equal(rxTaxFeeBps.valueOf(), 0);

        await wrapBurnerInst.setTaxParameters(taxWallet, taxFeeBps, {from: admin});

        rxTaxWallet = await burnerInst.taxWallet();
        rxTaxFeeBps = await burnerInst.taxFeeBps();
        assert.equal(rxTaxWallet.valueOf(), taxWallet);
        assert.equal(rxTaxFeeBps.valueOf(), taxFeeBps);
    });

    it("should test only admin can set reserve data.", async function() {

        //add reserve
        try {
            await wrapBurnerInst.setReserveData(mockReserve2, reserveFeeBps, mockKNCWallet, {from: operator1});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        await wrapBurnerInst.setReserveData(mockReserve2, reserveFeeBps,  mockKNCWallet, {from: admin});
    });

    it("should test only admin can set default wallet fee.", async function() {

        //Third party wallet
        try {
            await wrapBurnerInst.setWalletFee(mockThirdPartyWallet, mockThirdPartyWalletFeeBps, {from: operator1});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        await wrapBurnerInst.setWalletFee(mockThirdPartyWallet, mockThirdPartyWalletFeeBps, {from: admin});
    });


    it("should test only admin can set default wallet fee.", async function() {
        //tax data
        try {
            await wrapBurnerInst.setTaxParameters(taxWallet, taxFeeBps, {from: operator1});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        await wrapBurnerInst.setTaxParameters(taxWallet, taxFeeBps, {from: admin});
    });

    it("test init wrapper with illegal values reverted.", async function() {
        let wrapper;

        try {
            wrapper = await WrapFeeBurner.new(0);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        wrapper = await WrapFeeBurner.new(burnerInst.address);
    });

    it("test set  reserve data with illegal values is reverted.", async function() {
        try {
            await wrapBurnerInst.setReserveData(0, reserveFeeBps, mockKNCWallet, {from: admin});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await wrapBurnerInst.setReserveData(mockReserve, 0, mockKNCWallet, {from: admin});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await wrapBurnerInst.setReserveData(mockReserve, reserveFeeBps, 0, {from: admin});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        await wrapBurnerInst.setReserveData(mockReserve, reserveFeeBps, mockKNCWallet, {from: admin});
    });

    it("test set  wallet fee with illegal values is reverted.", async function() {
        try {
            await wrapBurnerInst.setWalletFee(0, mockThirdPartyWalletFeeBps, {from: admin});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await wrapBurnerInst.setWalletFee(mockThirdPartyWallet, 0, {from: admin});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        await wrapBurnerInst.setWalletFee(mockThirdPartyWallet, mockThirdPartyWalletFeeBps, {from: admin});
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

        let defaultFeeSharingBPS = await wrapBurnerInst.feeSharingBps();
        let feeForWalletBPS = await burnerInst.walletFeesInBps(permissionLessWallet4);
        assert.equal(defaultFeeSharingBPS.valueOf(), feeForWalletBPS.valueOf());
    });

    it("test set  wallet tax data with illegal values is reverted.", async function() {
        try {
            await wrapBurnerInst.setTaxParameters(0, taxFeeBps, {from: admin});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await wrapBurnerInst.setTaxParameters(taxWallet, 0, {from: admin});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        await wrapBurnerInst.setTaxParameters(taxWallet, taxFeeBps, {from: admin});
    });
});

function log(str) {
    console.log(str);
}