const Permissions = artifacts.require("./PermissionGroups.sol");
const Withdrawable = artifacts.require("./Withdrawable.sol");
const TestToken = artifacts.require("./mockContracts/TestToken.sol");
const MockWithdrawable = artifacts.require("./mockContracts/MockWithdrawable.sol");

const Helper = require("../helper.js");

let token;

contract('Withdrawable', function(accounts) {
    it("should test withdraw token success for admin.", async function () {
        //init globals
        const withdrawableInst = await Withdrawable.new();
        token = await TestToken.new("tst", "test", 18);

        // transfer some tokens to withdrawable.
        await token.transfer (withdrawableInst.address, 100);

        // withdraw the tokens from withdrawableInst
        await withdrawableInst.withdrawToken(token.address, 60, accounts[1]);

        let balance = await token.balanceOf(withdrawableInst.address);
        Helper.assertEqual(balance, 40, "unexpected balance in withdrawble contract.");

        balance = await token.balanceOf(accounts[1]);
        Helper.assertEqual(balance, 60, "unexpected balance in accounts[1].");
    });

    it("should test withdraw token reject for non admin.", async function () {
        // transfer some tokens to withdrawable.
        const withdrawableInst = await Withdrawable.new();
        await token.transfer (withdrawableInst.address, 100);

        try {
            // withdraw the tokens from withdrawableInst
            await withdrawableInst.withdrawToken(token.address, 60, accounts[2], {from: accounts[2]});
            assert(false, "expected to throw error in line above.")
        } catch(e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        let balance = await token.balanceOf(withdrawableInst.address);
        Helper.assertEqual(balance, 100, "unexpected balance in withdrawble contract.");

        balance = await token.balanceOf(accounts[2]);
        Helper.assertEqual(balance, 0, "unexpected balance in accounts[1].");
    });
    
    it("should test withdraw token reject when amount too high.", async function () {
        // transfer some tokens to withdrawable.
        const withdrawableInst = await Withdrawable.new();
        await token.transfer (withdrawableInst.address, 100);

        try {
            // withdraw the tokens from withdrawableInst
            await withdrawableInst.withdrawToken(token.address, 130, accounts[3]);
            assert(false, "expected to throw error in line above.")
        } catch(e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        let balance = await token.balanceOf(withdrawableInst.address);
        Helper.assertEqual(balance, 100, "unexpected balance in withdrawble contract.");
    });
    
    it("should test withdraw ether success for admin.", async function () {
        const mockWithdrawableInst = await MockWithdrawable.new();
        // send some ether to withdrawable.
        await Helper.sendEtherWithPromise(accounts[7], mockWithdrawableInst.address, 10);

        // withdraw the ether from withdrawableInst
        await mockWithdrawableInst.withdrawEther(7, accounts[7])

        let balance = await Helper.getBalancePromise(mockWithdrawableInst.address);
        Helper.assertEqual(balance, 3, "unexpected balance in withdrawble contract.");
    });
    
    it("should test withdraw ether reject for non admin.", async function () {
        const mockWithdrawableInst = await MockWithdrawable.new();
        // send some ether to withdrawable.
        await Helper.sendEtherWithPromise(accounts[7], mockWithdrawableInst.address, 10);

        // try to withdraw the ether from withdrawableInst
        try {
            // withdraw the tokens from withdrawableInst
            await mockWithdrawableInst.withdrawEther(7, accounts[7], {from: accounts[7]});
            assert(false, "expected to throw error in line above.")
        } catch(e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        let balance = await Helper.getBalancePromise(mockWithdrawableInst.address);
        Helper.assertEqual(balance, 10, "unexpected balance in withdrawble contract.");
    });
    
    it("should test withdraw ether reject when amount too high.", async function () {
        const mockWithdrawableInst = await MockWithdrawable.new();
        // send some ether to withdrawable.
        await Helper.sendEtherWithPromise(accounts[7], mockWithdrawableInst.address, 10);

        // try to withdraw the ether from withdrawableInst
        try {
            // withdraw the tokens from withdrawableInst
            await mockWithdrawableInst.withdrawEther(15, accounts[7]);
            assert(false, "expected to throw error in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        let balance = await Helper.getBalancePromise(mockWithdrawableInst.address);
        Helper.assertEqual(balance, 10, "unexpected balance in withdrawble contract.");
    });
});
