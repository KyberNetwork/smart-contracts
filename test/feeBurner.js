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
let taxWallet;
let kncPerEtherRate = 200;
let initialKNCWalletBalance = 10000000000;
let burnFeeInBPS = 70;  //basic price steps
let taxFeesInBPS = 30;
let totalBPS = 10000;   //total price steps.
let payedSoFar = 0; //track how much fees payed or burned so far.

contract('FeeBurner', function(accounts) {
    it("should init globals and init feeburner Inst.", async function () {
        //init globals
        mockKyberNetwork = accounts[9];
        mockReserve = accounts[8];
        mockKNCWallet = accounts[7];
        someExternalWallet = accounts[6];
        taxWallet = accounts[5];
        admin = accounts[0];
        //move funds to knc wallet
        kncToken = await TestToken.new("kyber", "KNC", 18);
        await kncToken.transfer(mockKNCWallet, initialKNCWalletBalance);
        let balance = await kncToken.balanceOf(mockKNCWallet);
        assert.equal(balance.valueOf(), initialKNCWalletBalance, "unexpected wallet balance.");

        //init fee burner
        feeBurnerInst = await FeeBurner.new(admin, kncToken.address, mockKyberNetwork);

        //set parameters in fee burner.
        await feeBurnerInst.setKNCRate(kncPerEtherRate);
        let result = await feeBurnerInst.setReserveData(mockReserve, burnFeeInBPS, mockKNCWallet);
//        console.log("result")
//        console.log(result.logs[0].args)
        assert.equal(result.logs[0].args.reserve, mockReserve);
        assert.equal(result.logs[0].args.feeInBps.valueOf(), burnFeeInBPS);
        assert.equal(result.logs[0].args.kncWallet, mockKNCWallet);

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
        let result = await feeBurnerInst.setWalletFees(someExternalWallet, totalBPS/2);
//        console.log("result")
//        console.log(result.logs[0].args)
        assert.equal(result.logs[0].args.wallet, someExternalWallet);
        assert.equal(result.logs[0].args.feesInBps.valueOf(), totalBPS/2);

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
            await feeBurnerInst.setReserveData(mockReserve, 70, mockKNCWallet, {from: mockReserve});
            assert(false, "expected throw in line above..")
        }
            catch(e){
                assert(Helper.isRevertErrorMessage(e), "expected throw but got other error: " + e);
        }

        try {
            await feeBurnerInst.setTaxInBps(taxFeesInBPS , {from: mockReserve});
            assert(false, "expected throw in line above..")
        }
            catch(e){
                assert(Helper.isRevertErrorMessage(e), "expected throw but got other error: " + e);
        }

        try {
            await feeBurnerInst.setTaxWallet(taxWallet , {from: mockReserve});
            assert(false, "expected throw in line above..")
        }
            catch(e){
                assert(Helper.isRevertErrorMessage(e), "expected throw but got other error: " + e);
        }
    });

    it("should test burn fee success. See waiting fees 'zeroed' (= 1).", async function () {
        let feesWaitingToBurn = await feeBurnerInst.reserveFeeToBurn(mockReserve);
        assert(feesWaitingToBurn.valueOf() > 1, "unexpected waiting to burn.");

        waitingFees = await feeBurnerInst.reserveFeeToBurn(mockReserve);
        payedSoFar += (1 * waitingFees.valueOf()) - 1;
        await feeBurnerInst.burnReserveFees(mockReserve);

        feesWaitingToBurn = await feeBurnerInst.reserveFeeToBurn(mockReserve);
        assert(feesWaitingToBurn.valueOf() == 1, "unexpected waiting to burn.");

        let waitingWalletFees = await feeBurnerInst.reserveFeeToWallet(mockReserve, someExternalWallet);
        assert(waitingWalletFees.valueOf() > 1, "unexpected waiting wallet fees.");

        payedSoFar += (1 * waitingWalletFees.valueOf()) - 1;
        await feeBurnerInst.sendFeeToWallet(someExternalWallet, mockReserve);

        waitingWalletFees = await feeBurnerInst.reserveFeeToWallet(mockReserve, someExternalWallet);
        assert(waitingWalletFees.valueOf() == 1, "unexpected waiting wallet fees.");
    });

    it("should set tax fee and and tax wallet and validate values.", async function () {
        await feeBurnerInst.setTaxWallet(taxWallet);

        rxTaxWallet = await feeBurnerInst.taxWallet();

        assert.equal(rxTaxWallet.valueOf(), taxWallet, "invalid tax wallet address");

        //see zero address blocked.
        try {
            await feeBurnerInst.setTaxWallet(0);
            assert(false, "expected throw in line above..")
        }
            catch(e){
                assert(Helper.isRevertErrorMessage(e), "expected throw but got other error: " + e);
        }

        assert.equal(rxTaxWallet.valueOf(), taxWallet, "invalid tax wallet address");

        //set tax in BPS
        await feeBurnerInst.setTaxInBps(taxFeesInBPS);

        rxTaxFees = await feeBurnerInst.taxFeeBps();

        assert.equal(rxTaxFees.valueOf(), taxFeesInBPS, "invalid tax fees BPS");
    });


    it("should test tax fees sent to wallet according to set fees.", async function () {
        let tradeSize = 1000;

        let taxWalletInitBalance =  await kncToken.balanceOf(taxWallet);

        //first see with zero tax nothing sent.
        await feeBurnerInst.setTaxWallet(taxWallet);
        await feeBurnerInst.setTaxInBps(0);
        await feeBurnerInst.handleFees(tradeSize, mockReserve, 0, {from: mockKyberNetwork});

        let waitingFees = await feeBurnerInst.reserveFeeToBurn(mockReserve);
        payedSoFar += (1 * waitingFees.valueOf()) - 1;

        assert(waitingFees.valueOf() > 0);

        await feeBurnerInst.burnReserveFees(mockReserve);

        let taxWalletBalance = await kncToken.balanceOf(taxWallet);
        assert.equal(taxWalletBalance.valueOf(), taxWalletInitBalance.valueOf());

        //now with tax
        await feeBurnerInst.setTaxInBps(taxFeesInBPS);
        await feeBurnerInst.handleFees(tradeSize, mockReserve, 0, {from: mockKyberNetwork});

        waitingFees = await feeBurnerInst.reserveFeeToBurn(mockReserve);
        payedSoFar += (1 * waitingFees.valueOf()) - 1;
        assert(waitingFees.valueOf() > 0);
        await feeBurnerInst.burnReserveFees(mockReserve);

        let taxWalletBalanceAfter = await kncToken.balanceOf(taxWallet);
        let expectedBalance = waitingFees * taxFeesInBPS / totalBPS;
        assert.equal(taxWalletBalanceAfter.valueOf(), Math.floor(expectedBalance));
    });


    it("should test tax fees behavior with smallest values.", async function () {
        //first create 2 wei burn fee. which will be reverted.
        const burnFeeInBPS = 50; //0.5%
        await feeBurnerInst.setReserveData(mockReserve, burnFeeInBPS, mockKNCWallet);
        let tradeSize = 1; // * eth to knc rate is the ref number.

        await feeBurnerInst.handleFees(tradeSize, mockReserve, 0, {from: mockKyberNetwork});
        let waitingFees = await feeBurnerInst.reserveFeeToBurn(mockReserve);
        assert.equal(waitingFees.valueOf(), 2);

        //see burn fails
        try {
            await feeBurnerInst.burnReserveFees(mockReserve);
            assert(false, "expected throw in line above..")
        }
            catch(e){
                assert(Helper.isRevertErrorMessage(e), "expected throw but got other error: " + e);
        }

        await feeBurnerInst.handleFees(tradeSize, mockReserve, 0, {from: mockKyberNetwork});
        waitingFees = await feeBurnerInst.reserveFeeToBurn(mockReserve);
        assert.equal(waitingFees.valueOf(), 3);

        //on value 3 want to see tax wallet gets 0 fees.
        let taxWalletInitBalance = await kncToken.balanceOf(taxWallet);
        await feeBurnerInst.burnReserveFees(mockReserve);
        payedSoFar += waitingFees - 1;
        let taxWalletBalance = await kncToken.balanceOf(taxWallet);
        assert.equal(taxWalletBalance.valueOf(), taxWalletInitBalance.valueOf());
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


    it("should test that when calling burn fees with no fees to burn call reverted.", async function () {
        //send more tokens to wallet and approve for reserve.
        //check current fee to burn see wallet has that amount.
        let feeToBurn = await feeBurnerInst.reserveFeeToBurn(mockReserve);
        let numKncWalletTokens = await kncToken.balanceOf(mockKNCWallet);

//        console.log("feeToBurn " + feeToBurn + " numKncWalletTokens " + numKncWalletTokens)

        if (feeToBurn > numKncWalletTokens) {
            console.log ("is smaller");
            await kncToken.transfer(mockKNCWallet, (feeToBurn - numKncWalletTokens * 1));
        }

        await kncToken.approve(feeBurnerInst.address, 0xfffffffff, {from: mockKNCWallet});

        //burn success
        await feeBurnerInst.burnReserveFees(mockReserve);
        payedSoFar += feeToBurn - 1;

        //now burn fail. since all was burned...
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
            feeBurnerTemp =  await FeeBurner.new(admin, 0, mockKyberNetwork);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            feeBurnerTemp =  await FeeBurner.new(0, kncToken.address, mockKyberNetwork);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }


        try {
            feeBurnerTemp =  await FeeBurner.new(admin, kncToken.address, 0);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        feeBurnerTemp =  await FeeBurner.new(admin, kncToken.address, mockKyberNetwork);
    });

    it("should test can't set bps fee > 1% (100 bps).", async function () {
        let highBpsfee = 101;

        try {
            await feeBurnerInst.setReserveData(mockReserve, highBpsfee, mockKNCWallet);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //see success
        await feeBurnerInst.setReserveData(mockReserve, 99, mockKNCWallet);
    });


    it("should test can't set empty (address 0) knc wallet.", async function () {
        try {
            await feeBurnerInst.setReserveData(mockReserve, 99, 0);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //see success
        await feeBurnerInst.setReserveData(mockReserve, 99, mockKNCWallet);
    });

    it("should test can't set wallet fees above 100% (10000 bps).", async function () {
        let highBpsfee = 10000;

        try {
            await feeBurnerInst.setWalletFees(someExternalWallet, highBpsfee);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //see success
        await feeBurnerInst.setWalletFees(someExternalWallet, 9999);
    });

    it("should test can't fee taxes above 100% (10000 bps).", async function () {
        let highBpsTax = 10000;
        let validBpsTax = 9999;

        try {
            await feeBurnerInst.setTaxInBps(highBpsTax);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //see success
        await feeBurnerInst.setTaxInBps(validBpsTax);
    });

    it("should test send fees to wallet reverted when balance is 'zeroed' == 1.", async function () {
        try {
            await feeBurnerInst.sendFeeToWallet(someExternalWallet, mockReserve);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });


    it("should test handle fees reverted when trade size > max trade size.", async function () {
        let legalTrade = new BigNumber(10).pow(28);
        let illegalTrade = legalTrade.add(1);

        await feeBurnerInst.handleFees(legalTrade, mockReserve, someExternalWallet, {from: mockKyberNetwork});

        try {
            await feeBurnerInst.handleFees(illegalTrade, mockReserve, 0, {from: mockKyberNetwork});
            assert(false, "expected throw in line above..")
        }
            catch(e){
                assert(Helper.isRevertErrorMessage(e), "expected throw but got other error: " + e);
        }
    });

    it("should test when calling send fees to wallet but knc wallet doesn't have enough tokens. call reverted.", async function () {
        let waitingWalletFees = await feeBurnerInst.reserveFeeToWallet(mockReserve, someExternalWallet);
        let numKncWalletTokens = await kncToken.balanceOf(mockKNCWallet);

        //now send fees fail. since all was burned...
        try {
            await feeBurnerInst.sendFeeToWallet(someExternalWallet, mockReserve);
            assert(false, "expected throw in line above..")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got other error: " + e);
        }
    });

    it("should test set KNC rate reverted when value above maxRate.", async function () {
        let legalKncRate = new BigNumber(10).pow(24);
        let illegalKncRate = legalKncRate.add(1);

        await feeBurnerInst.setKNCRate(legalKncRate);

        try {
            await feeBurnerInst.setKNCRate(illegalKncRate);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("should verify payed so far on this reserve.", async function () {
        let rxPayedSoFar = await feeBurnerInst.feePayedPerReserve(mockReserve);

        assert.equal(rxPayedSoFar.valueOf(), payedSoFar);
    });

});