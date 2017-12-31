var Permissions = artifacts.require("./PermissionGroups.sol");
var Withdrawable = artifacts.require("./Withdrawable.sol");
var TestToken = artifacts.require("./mockContracts/TestToken.sol");
var MockWithdrawable = artifacts.require("./mockContracts/MockWithdrawable.sol");

var Helper = require("./helper.js");

var token;

contract('Withdrawable', function(accounts) {
    it("should test withdraw token success for admin.", async function () {
        //init globals
        var withdrawableInst = await Withdrawable.new();
        token = await TestToken.new("tst", "test", 18);

        // transfer some tokens to withdrawable.
        await token.transfer (withdrawableInst.address, 100);

        // withdraw the tokens from withdrawableInst
        await withdrawableInst.withdrawToken(token.address, 60, accounts[1]);

        var balance = await token.balanceOf(withdrawableInst.address);
        assert.equal(balance.valueOf(), 40, "unexpected balance in withdrawble contract.");

        balance = await token.balanceOf(accounts[1]);
        assert.equal(balance.valueOf(), 60, "unexpected balance in accounts[1].");
    });

    it("should test withdraw token reject for non admin.", async function () {
        // transfer some tokens to withdrawable.
        var withdrawableInst = await Withdrawable.new();
        await token.transfer (withdrawableInst.address, 100);

        try {
            // withdraw the tokens from withdrawableInst
            await withdrawableInst.withdrawToken(token.address, 60, accounts[2], {from: accounts[2]});
            assert(false, "expected to throw error in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        var balance = await token.balanceOf(withdrawableInst.address);
        assert.equal(balance.valueOf(), 100, "unexpected balance in withdrawble contract.");

        balance = await token.balanceOf(accounts[2]);
        assert.equal(balance.valueOf(), 0, "unexpected balance in accounts[1].");
    });
    it("should test withdraw token reject when amount too high.", async function () {
        // transfer some tokens to withdrawable.
        var withdrawableInst = await Withdrawable.new();
        await token.transfer (withdrawableInst.address, 100);

        try {
            // withdraw the tokens from withdrawableInst
            await withdrawableInst.withdrawToken(token.address, 130, accounts[3]);
            assert(false, "expected to throw error in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        var balance = await token.balanceOf(withdrawableInst.address);
        assert.equal(balance.valueOf(), 100, "unexpected balance in withdrawble contract.");
    });
    it("should test withdraw ether success for admin.", async function () {
        var mockWithdrawableInst = await MockWithdrawable.new();
        // send some ether to withdrawable.
        await Helper.sendEtherWithPromise(accounts[7], mockWithdrawableInst.address, 10);

        // withdraw the ether from withdrawableInst
        await mockWithdrawableInst.withdrawEther(7, accounts[7])

        var balance = await Helper.getBalancePromise(mockWithdrawableInst.address);
        assert.equal(balance.valueOf(), 3, "unexpected balance in withdrawble contract.");
    });
    it("should test withdraw ether reject for non admin.", async function () {
        var mockWithdrawableInst = await MockWithdrawable.new();
        // send some ether to withdrawable.
        await Helper.sendEtherWithPromise(accounts[7], mockWithdrawableInst.address, 10);

        // try to withdraw the ether from withdrawableInst
        try {
            // withdraw the tokens from withdrawableInst
            await mockWithdrawableInst.withdrawEther(7, accounts[7], {from: accounts[7]});
            assert(false, "expected to throw error in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        var balance = await Helper.getBalancePromise(mockWithdrawableInst.address);
        assert.equal(balance.valueOf(), 10, "unexpected balance in withdrawble contract.");
    });
    it("should test withdraw ether reject when amount too high.", async function () {
        var mockWithdrawableInst = await MockWithdrawable.new();
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

        var balance = await Helper.getBalancePromise(mockWithdrawableInst.address);
        assert.equal(balance.valueOf(), 10, "unexpected balance in withdrawble contract.");
    });
});