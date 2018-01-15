let FeeBurner = artifacts.require("./FeeBurner.sol");
let TestToken = artifacts.require("./TestToken.sol");

let Helper = require("./helper.js");
let BigNumber = require('bignumber.js');

//global variables
let kncToken;
let feeBurnerInst;
let mockKyberNetwork;
let mockReserve;
let mockKNCWallet;
let someExternalWallet;
let kncPerEtherRate = 200;
let initialKNCWalletBalance = 10000000000;
let burnFeeInBPS = 70;  //basic price steps
let totalBPS = 10000;   //total price steps.


contract('FeeBurner', function(accounts) {
    it("should init globals and init feeburner Inst.", async function () {
        //init globals
        mockKyberNetwork = accounts[9];
        mockReserve = accounts[8];
        mockKNCWallet = accounts[7];
        someExternalWallet = accounts[6];
        admin = accounts[0];
        //move funds to knc wallet
        kncToken = await TestToken.new("kyber", "KNC", 18);
        await kncToken.transfer(mockKNCWallet, initialKNCWalletBalance);
        let balance = await kncToken.balanceOf(mockKNCWallet);
        assert.equal(balance.valueOf(), initialKNCWalletBalance, "unexpected wallet balance.");

        //init fee burner
        feeBurnerInst = await FeeBurner.new(admin, kncToken.address);

        //set parameters in fee burner.
        await feeBurnerInst.setKNCRate(kncPerEtherRate);
        await feeBurnerInst.setKyberNetwork(mockKyberNetwork);
        await feeBurnerInst.setReserveData(mockReserve, 70, mockKNCWallet);

        //allowance to fee burner to enable burning
        await kncToken.approve(feeBurnerInst.address, initialKNCWalletBalance / 10, {from: mockKNCWallet});
        let allowance = await kncToken.allowance(mockKNCWallet, feeBurnerInst.address);
        assert.equal(allowance.valueOf(), initialKNCWalletBalance / 10, "unexpected allowance");
    });

    it("should test handle fees success without other wallet fees.", async function () {
        let tradeSizeWei = 500000;
        let feesWaitingToBurn = await feeBurnerInst.reserveFeeToBurn(mockReserve);

        let feeSize = tradeSizeWei * kncPerEtherRate * burnFeeInBPS / totalBPS;

        await feeBurnerInst.handleFees(tradeSizeWei, mockReserve, 0, {from: mockKyberNetwork});

        let expectedWaitingFees = (feesWaitingToBurn.valueOf() * 1) + feeSize * 1;
        feesWaitingToBurn = await feeBurnerInst.reserveFeeToBurn(mockReserve);

        assert.equal(feesWaitingToBurn.valueOf(), expectedWaitingFees.valueOf(), "unexpected waiting to burn.");
    });

    it("should test handle fees success with other wallet ID fees.", async function () {
        let tradeSizeWei = 800000;
        let feesWaitingToBurn = await feeBurnerInst.reserveFeeToBurn(mockReserve);

        let feeSize = tradeSizeWei * kncPerEtherRate * burnFeeInBPS / totalBPS;

        //set other wallet fee
        await feeBurnerInst.setWalletFees(someExternalWallet, totalBPS/2);

        await feeBurnerInst.handleFees(tradeSizeWei, mockReserve, someExternalWallet, {from: mockKyberNetwork});

        let expectedWaitingFees = (feesWaitingToBurn.valueOf() * 1) + feeSize / 2;
        feesWaitingToBurn = await feeBurnerInst.reserveFeeToBurn(mockReserve);
        assert.equal(feesWaitingToBurn.valueOf(), expectedWaitingFees.valueOf(), "unexpected waiting to burn.");

        let expectedOtherWalletWaitingFees = feeSize / 2;

        let waitingWalletFees = await feeBurnerInst.reserveFeeToWallet(mockReserve, someExternalWallet);
        assert.equal(expectedOtherWalletWaitingFees.valueOf(), waitingWalletFees.valueOf(), "unexpected wallet balance.");
    });

    it("should test handle fees rejected with wrong caller.", async function () {
        let tradeSizeWei = 500000;
        let initialWalletbalance = await kncToken.balanceOf(mockKNCWallet);

        let feeSize = tradeSizeWei * kncPerEtherRate * burnFeeInBPS / totalBPS;

        try {
            await feeBurnerInst.handleFees(tradeSizeWei, mockReserve, 0, {from: mockReserve});
            assert(false, "expected throw in line above..")
        }
            catch(e){
                assert(Helper.isRevertErrorMessage(e), "expected throw but got other error: " + e);
        }
    });

    it("should test all set set functions rejected for non admin.", async function () {
        try {
            await feeBurnerInst.setKNCRate(500, {from: mockReserve});
            assert(false, "expected throw in line above..")
        }
            catch(e){
                assert(Helper.isRevertErrorMessage(e), "expected throw but got other error: " + e);
        }

        try {
            await feeBurnerInst.setKyberNetwork(mockKyberNetwork, {from: mockReserve});
            assert(false, "expected throw in line above..")
        }
            catch(e){
                assert(Helper.isRevertErrorMessage(e), "expected throw but got other error: " + e);
        }

        try {
            await feeBurnerInst.setReserveData(mockReserve, 70, mockKNCWallet, {from: mockReserve});
            assert(false, "expected throw in line above..")
        }
            catch(e){
                assert(Helper.isRevertErrorMessage(e), "expected throw but got other error: " + e);
        }
    });

    it("should test burn fee and handle fee calls success. see see waiting fees zeroed.", async function () {
        let feesWaitingToBurn = await feeBurnerInst.reserveFeeToBurn(mockReserve);
        assert(feesWaitingToBurn.valueOf() > 0, "unexpected waiting to burn.");

        await feeBurnerInst.burnReserveFees(mockReserve);

        feesWaitingToBurn = await feeBurnerInst.reserveFeeToBurn(mockReserve);
        assert(feesWaitingToBurn.valueOf() == 1, "unexpected waiting to burn.");

        let waitingWalletFees = await feeBurnerInst.reserveFeeToWallet(mockReserve, someExternalWallet);
        assert(waitingWalletFees.valueOf() > 0, "unexpected waiting wallet fees.");

        await feeBurnerInst.sendFeeToWallet(someExternalWallet, mockReserve);

        waitingWalletFees = await feeBurnerInst.reserveFeeToWallet(mockReserve, someExternalWallet);
        assert(waitingWalletFees.valueOf() == 1, "unexpected waiting wallet fees.");
    });

    it("should test that when knc wallet (we burn from) is empty burn fee is reverted.", async function () {
        let initialWalletbalance = await kncToken.balanceOf(mockKNCWallet);

        //create trade size that will cause fee be bigger then wallet balance.
        let tradeSizeWei = 1 + (initialWalletbalance / (kncPerEtherRate * burnFeeInBPS / totalBPS));
        let feeSize = tradeSizeWei * kncPerEtherRate * burnFeeInBPS / totalBPS;

        assert(feeSize > tradeSizeWei, "required fee size bigger then wallet balance.");
        await feeBurnerInst.handleFees(tradeSizeWei, mockReserve, 0, {from: mockKyberNetwork});

        //now burn
        try {
            await feeBurnerInst.burnReserveFees(mockReserve);
            assert(false, "expected throw in line above..")
        }
            catch(e){
                assert(Helper.isRevertErrorMessage(e), "expected throw but got other error: " + e);
        }
   });

   it("should test can't init this contract with empty contracts (address 0).", async function () {
       let feeBurnerTemp;

       try {
           feeBurnerTemp =  await FeeBurner.new(admin, 0);
           assert(false, "throw was expected in line above.")
       } catch(e){
           assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
       }

       try {
           feeBurnerTemp =  await FeeBurner.new(0, kncToken.address);
           assert(false, "throw was expected in line above.")
       } catch(e){
           assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
       }

       feeBurnerTemp =  await FeeBurner.new(admin, kncToken.address);
   });
});