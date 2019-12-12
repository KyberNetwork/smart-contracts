var MockDepositAddressToken = artifacts.require("./mockContracts/MockDepositAddressToken.sol");
var MockDepositAddressEther = artifacts.require("./mockContracts/MockDepositAddressEther.sol");
var TestToken = artifacts.require("./mockContracts/TestToken.sol");
var MockCentralBank = artifacts.require("./mockContracts/MockCentralBank.sol");
var Helper = require("./helper.js");

var bank;
var token;

contract('MockDepositAddressEther', function (accounts) {
    it("should test withdraw successful with owner.", async function (){
        //init globals on first test
        bank = await MockCentralBank.new();
        token = await TestToken.new("a token", "tok", 18);
        await Helper.sendEtherWithPromise(accounts[7], bank.address, 3);

        let mockAddress = await MockDepositAddressEther.new(bank.address, accounts[2]);
        let payable = await MockDepositAddressEther.new(bank.address, accounts[2]);

        let balance = await Helper.getBalancePromise(payable.address);
        assert.equal(0, balance.valueOf(), "expected balance to be 0.")

        await bank.addOwner(mockAddress.address)
        await bank.depositEther({value:1000}); // deposit 10 wei
        await bank.addOwner(accounts[2]) //should add since for now bank is using tx.origin and not msg.sender
        await mockAddress.withdraw(100, payable.address, {from:accounts[2]})

        balance = await Helper.getBalancePromise(payable.address);
        assert.equal(balance.valueOf(), 100);
    });

    it("should test withdraw rejected with non owner.", async function (){
        bank = await MockCentralBank.new();
        token = await TestToken.new("a token", "tok", 18);
        let mockAddress = await MockDepositAddressEther.new(bank.address, accounts[2]);
        let payable = await MockDepositAddressEther.new(bank.address, accounts[2]);

        let balance = await Helper.getBalancePromise(payable.address);
        assert.equal(0, balance.valueOf(), "expected balance to be 0.")

        await bank.addOwner(mockAddress.address)
        await bank.depositEther({value:1000}); // deposit 10 wei
        await bank.addOwner(accounts[3]) //should add since for now bank is using tx.origin and not msg.sender

        try {
            await mockAddress.withdraw(60, payable.address, {from:accounts[3]})
            assert(false, "expected throw in line above..")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got other error: " + e);
        }

        balance = await Helper.getBalancePromise(payable.address);
        assert.equal(balance.valueOf(), 0);
    });

    it("should test MockDepositAddress get balance with ether.", async function (){
        let mockAddress = await MockDepositAddressEther.new(bank.address, accounts[0]);
        let balance = await mockAddress.getBalance();
        assert.equal(balance.valueOf(), 0, "new mockadrress Ether balance not 0.");

        await Helper.sendEtherWithPromise(accounts[0], mockAddress.address, 80);
        balance = await mockAddress.getBalance();
        assert.equal(balance.valueOf(), 80, "Mockadrress Ether balance not 80.");
    });

    it("should test MockDepositAddress clear balance with Eth.", async function (){
        let mockAddress = await MockDepositAddressEther.new( bank.address, accounts[0]);

        await Helper.sendEtherWithPromise(accounts[0], mockAddress.address, 20);
        let balance = await mockAddress.getBalance();
        assert.equal(balance.valueOf(), 20, "mockadrress balance not as expected.");

        await mockAddress.clearBalance(30);

        balance = await mockAddress.getBalance();
        assert.equal(balance.valueOf(), 20, "mockadrress balance not as expected.");

        await mockAddress.clearBalance(15);

        balance = await mockAddress.getBalance();
        assert.equal(balance.valueOf(), 5, "mockadrress balance not as expected.");
    });
});
