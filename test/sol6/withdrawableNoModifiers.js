const MockWithdrawable = artifacts.require("./MockWithdrawableNoModifiers.sol");
const TestToken = artifacts.require("Token.sol");

const Helper = require("../helper.js");
const BN = web3.utils.BN;

let token;
let admin;
let user;
let withdrawableInst;
let initialTokenBalance = new BN(100);
let tokenWithdrawAmt = new BN(60);
let initialEtherBalance = new BN(10);
let etherWithdrawAmt = new BN(3);

const {zeroBN} = require("../helper.js");
const { expectRevert, expectEvent } = require('@openzeppelin/test-helpers');

contract('WithdrawableNoModifiers', function(accounts) {
    before("should init globals, deploy test token", async function () {
        user = accounts[0];
        admin = accounts[1];
        token = await TestToken.new("tst", "test", 18, {from: accounts[2]});
    });

    describe("test token transfer permissions", async() => {
        beforeEach("deploy a new withdrawable inst, with some initial tokens", async function () {
            withdrawableInst = await MockWithdrawable.new({from: admin});
            // transfer some tokens to withdrawable.
            await token.transfer(withdrawableInst.address, initialTokenBalance, {from: accounts[2]});
            let balance = await token.balanceOf(withdrawableInst.address);
            Helper.assertEqual(balance, initialTokenBalance, "unexpected balance in withdrawable contract.");
        });

        it("should test withdraw token success for admin.", async function () {
            let rxAdmin = await withdrawableInst.admin();
            Helper.assertEqual(admin, rxAdmin, "wrong admin " + rxAdmin.toString());

            // withdraw the tokens from withdrawableInst
            let txResult = await withdrawableInst.withdrawToken(token.address, tokenWithdrawAmt, user, {from: admin});
            expectEvent(txResult, "TokenWithdraw", {
                token: token.address, 
                amount: tokenWithdrawAmt, 
                sendTo: user,
            })

            balance = await token.balanceOf(withdrawableInst.address);
            Helper.assertEqual(balance, initialTokenBalance.sub(tokenWithdrawAmt), "unexpected balance in withdrawble contract.");

            balance = await token.balanceOf(user);
            Helper.assertEqual(balance, tokenWithdrawAmt, "unexpected balance in user.");
        });

        it("should test withdraw token reject for non admin.", async function () {
            await expectRevert(
                withdrawableInst.withdrawToken(token.address, tokenWithdrawAmt, user, {from: user}),
                "only admin"
            );
        });

        it("should test withdraw token reject when amount too high.", async function () {
            tokenWithdrawAmt = tokenWithdrawAmt.add(initialTokenBalance);
            await expectRevert.unspecified(
                withdrawableInst.withdrawToken(token.address, tokenWithdrawAmt, user, {from: admin})
            );

            let balance = await token.balanceOf(withdrawableInst.address);
            Helper.assertEqual(balance, initialTokenBalance, "unexpected balance in withdrawble contract.");
        });
    });


    describe("test ETH transfer permissions", async() => {
        beforeEach("deploy a new MockWithdrawable inst with some initial ETH", async function () {
            withdrawableInst = await MockWithdrawable.new({from: admin});
            // transfer some ETH
            await withdrawableInst.send(initialEtherBalance, {from: accounts[4]});
            let balance = await Helper.getBalancePromise(withdrawableInst.address);
            Helper.assertEqual(balance, initialEtherBalance, "unexpected balance in withdrawable contract.");
        });

        it("should test withdraw ether success for admin.", async function () {
            // withdraw the ether from withdrawableInst
            let txResult = await withdrawableInst.withdrawEther(etherWithdrawAmt, user, {from: admin});
            expectEvent(txResult, "EtherWithdraw", {
                amount: etherWithdrawAmt,
                sendTo: user,
            })
            let balance = await Helper.getBalancePromise(withdrawableInst.address);
            Helper.assertEqual(balance, initialEtherBalance.sub(etherWithdrawAmt), "unexpected balance in withdrawble contract.");
        });
        
        it("should test withdraw ether reject for non admin.", async function () {
            // try to withdraw the ether from withdrawableInst
            await expectRevert(
                withdrawableInst.withdrawEther(etherWithdrawAmt, user, {from: user}),
                "only admin"
            );
        });

        it("should test withdraw ether reject when amount too high.", async function () {
            etherWithdrawAmt = etherWithdrawAmt.add(initialEtherBalance);

            // try to withdraw the ether from withdrawableInst
            await expectRevert.unspecified(
                withdrawableInst.withdrawEther(etherWithdrawAmt, user, {from: admin}),
            );
        });
    });
});
