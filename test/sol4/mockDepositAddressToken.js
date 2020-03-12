const MockDepositAddressToken = artifacts.require("./mockContracts/MockDepositAddressToken.sol");
const MockDepositAddressEther = artifacts.require("./mockContracts/MockDepositAddressEther.sol");
const TestToken = artifacts.require("./mockContracts/TestToken.sol");
const MockCentralBank = artifacts.require("./mockContracts/MockCentralBank.sol");
const Helper = require("../helper.js");

const BN = web3.utils.BN;

let bank;
let token;

const zeroBN = new BN(0);

contract('MockDepositAddressToken', function (accounts) {
    it("should test withdraw successful with owner", async function (){
        //init globals in first test
        bank = await MockCentralBank.new();
        token = await TestToken.new("a token", "tok", 18);
        let supply = await token.INITIAL_SUPPLY();
        await token.transfer(bank.address, supply)
        let mockAddress = await MockDepositAddressToken.new(token.address, bank.address, accounts[2]);

        await bank.addOwner(mockAddress.address)
        await bank.addOwner(accounts[2]) //should add since for now bank is using tx.origin and not msg.sender.
        await mockAddress.withdraw(100, accounts[2], {from:accounts[2]})

        let balance = await token.balanceOf(accounts[2]);
        Helper.assertEqual(balance, 100);
    });

    it("should test withdraw rejected with non owner", async function (){
        let mockAddress = await MockDepositAddressToken.new(token.address, bank.address, accounts[2]);

        await bank.addOwner(mockAddress.address)
        await Promise.all([bank.addOwner(accounts[2]), bank.addOwner(accounts[3])]); //should add since for now bank is using tx.origin and not msg.sender.

        try {
            await mockAddress.withdraw(60, accounts[3], {from:accounts[3]});
            assert(false, "expected to throw error in line above.")
        } catch(e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
        let balance = await token.balanceOf(accounts[3]);
        Helper.assertEqual(balance, zeroBN); //withdraw should have failed.
   });

    it("should test MockDepositAddress get balance.", async function (){
        let mockAddress = await MockDepositAddressToken.new(token.address, bank.address, accounts[0]);
        let balance = await mockAddress.getBalance();
        Helper.assertEqual(balance, zeroBN, "new mockadrress balance not 0.");

        await bank.withdrawToken(token.address, 80);
        await token.transfer(mockAddress.address, 80);
        balance = await mockAddress.getBalance();
        Helper.assertEqual(balance, 80, "Mockadrress balance not 80.");
    });

    it("should test MockDepositAddress clear balance.", async function (){
        let mockAddress = await MockDepositAddressToken.new(token.address, bank.address, accounts[0]);

        await bank.withdrawToken(token.address, 20);
        await token.transfer(mockAddress.address, 20);

        let balance = await mockAddress.getBalance();
        Helper.assertEqual(balance, 20, "new mockadrress balance not 20.");

        await mockAddress.clearBalance(30);

        balance = await mockAddress.getBalance();
        Helper.assertEqual(balance, 20, "mockadrress balance not 20.");

        await mockAddress.clearBalance(15);

        balance = await mockAddress.getBalance();
        Helper.assertEqual(balance, 5, "mockadrress balance not 5.");
    });
});
