const MockDepositAddressToken = artifacts.require("./mockContracts/MockDepositAddressToken.sol");
const MockDepositAddressEther = artifacts.require("./mockContracts/MockDepositAddressEther.sol");
const TestToken = artifacts.require("./mockContracts/TestToken.sol");
const MockCentralBank = artifacts.require("./mockContracts/MockCentralBank.sol");
const Helper = require("../helper.js");

const BN = web3.utils.BN;

let bank;
let token;

const zeroBN = new BN(0);

contract('MockDepositAddressEther', function (accounts) {
    it("should test withdraw successful with owner.", async function (){
        //init globals on first test
        bank = await MockCentralBank.new();
        token = await TestToken.new("a token", "tok", 18);
        await Helper.sendEtherWithPromise(accounts[7], bank.address, 3);

        let mockAddress = await MockDepositAddressEther.new(bank.address, accounts[2]);
        let payable = await MockDepositAddressEther.new(bank.address, accounts[2]);

        let balance = await Helper.getBalancePromise(payable.address);
        Helper.assertEqual(zeroBN, balance, "expected balance to be 0.")

        await bank.addOwner(mockAddress.address)
        await bank.depositEther({value:1000}); // deposit 10 wei
        await bank.addOwner(accounts[2]) //should add since for now bank is using tx.origin and not msg.sender

        let value = new BN(100)
        await mockAddress.withdraw(value, payable.address, {from:accounts[2]})

        balance = await Helper.getBalancePromise(payable.address);
        Helper.assertEqual(balance, value);
    });

    it("should test withdraw rejected with non owner.", async function (){
        bank = await MockCentralBank.new();
        token = await TestToken.new("a token", "tok", 18);
        let mockAddress = await MockDepositAddressEther.new(bank.address, accounts[2]);
        let payable = await MockDepositAddressEther.new(bank.address, accounts[2]);

        let balance = await Helper.getBalancePromise(payable.address);
        Helper.assertEqual(zeroBN, balance, "expected balance to be 0.")

        await bank.addOwner(mockAddress.address)
        await bank.depositEther({value:1000}); // deposit 10 wei
        await bank.addOwner(accounts[3]) //should add since for now bank is using tx.origin and not msg.sender

        try {
            await mockAddress.withdraw(60, payable.address, {from:accounts[3]})
            assert(false, "expected throw in line above..")
        } catch(e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got other error: " + e);
        }

        balance = await Helper.getBalancePromise(payable.address);
        Helper.assertEqual(balance, zeroBN);
    });

    it("should test MockDepositAddress get balance with ether.", async function (){
        let mockAddress = await MockDepositAddressEther.new(bank.address, accounts[0]);
        let balance = await mockAddress.getBalance();
        Helper.assertEqual(balance, zeroBN, "new mockadrress Ether balance not 0.");

        let amount = new BN(80);
        await Helper.sendEtherWithPromise(accounts[0], mockAddress.address, amount);
        balance = await mockAddress.getBalance();
        Helper.assertEqual(balance, amount, "Mockadrress Ether balance not 80.");
    });

    it("should test MockDepositAddress clear balance with Eth.", async function (){
        let mockAddress = await MockDepositAddressEther.new( bank.address, accounts[0]);

        let amount = new BN(20);
        await Helper.sendEtherWithPromise(accounts[0], mockAddress.address, amount);
        let balance = await mockAddress.getBalance();
        Helper.assertEqual(balance, amount, "mockadrress balance not as expected.");

        let amount30 = new BN(30)
        await mockAddress.clearBalance(amount30);

        balance = await mockAddress.getBalance();
        Helper.assertEqual(balance, amount, "mockadrress balance not as expected.");

        let amount15 = new BN(15);
        await mockAddress.clearBalance(amount15);


        balance = await mockAddress.getBalance();
        Helper.assertEqual(balance, amount.sub(amount15), "mockadrress balance not as expected.");
    });
});
