var MockDepositAddressToken = artifacts.require("./MockDepositAddressToken.sol");
var MockDepositAddressEther = artifacts.require("./MockDepositAddressEther.sol");
var TestToken = artifacts.require("./TestToken.sol");
var MockCentralBank = artifacts.require("./MockCenteralBank.sol");


contract('MockDepositAddressToken', function (accounts) {
    it("should test withdraw successful with owner and withdraw rejected with non owner, for token", async function (){
        let bank = await MockCentralBank.deployed();
        let token = await TestToken.deployed();
        console.log("create new mockAddress with owner " + accounts[2])
        let mockAddress = await MockDepositAddressToken.new(token.address, bank.address, accounts[2]);

        await bank.addOwner(mockAddress.address)
        await bank.addOwner(accounts[2]) //should add since for now bank is using tx.origin and not msg.sender.
        await mockAddress.withdraw(100, accounts[2], {from:accounts[2]})

        let balance = await token.balanceOf(accounts[2]);
        assert.equal(balance.valueOf(), 100);
        try {
            await mockAddress.withdraw(60, accounts[3], {from:accounts[3]})
        }
        catch(e){
            console.log("withdraw failed as expected. " + e);
        }
        let balance2 = await token.balanceOf(accounts[3]);
        assert.equal(balance2.valueOf(), 0); //withdraw should have failed.
    });

    it("should test withdraw successful with owner and withdraw rejected with non owner, for Eth", async function (){
        let bank = await MockCentralBank.deployed();
        let token = await TestToken.deployed();
        let mockAddress = await MockDepositAddressEther.new(bank.address, accounts[2]);

        await bank.addOwner(mockAddress.address)
        await bank.depositEther({value:1000}); // deposit 10 wei
        await bank.addOwner(accounts[2]) //should add since for now bank is using tx.origin and not msg.sender
        await mockAddress.withdraw(100, accounts[2], {from:accounts[2]})

        let balance = await token.balanceOf(accounts[2]);
        assert.equal(balance.valueOf(), 100);
        try {
            await mockAddress.withdraw(60, accounts[3], {from:accounts[3]})
        }
        catch(e){
            console.log("withdraw failed as expected. " + e);
        }
        let balance2 = await token.balanceOf(accounts[3]);
        assert.equal(balance2.valueOf(), 0); //withdraw should have failed.
    });

    it("should test MockDepositAddress get balance with token.", async function (){
        let bank = await MockCentralBank.deployed();
        let token = await TestToken.deployed();
        let mockAddress = await MockDepositAddressToken.new(token.address, bank.address, accounts[0]);
        let balance = await mockAddress.getBalance();
        assert.equal(balance.valueOf(), 0, "new mockadrress balance not 0.");

        await bank.withdrawToken(token.address, 80);
        await token.transfer(mockAddress.address, 80);
        balance = await mockAddress.getBalance();
        console.log("balance " + balance);
        assert.equal(balance.valueOf(), 80, "Mockadrress balance not 80.");
    });

    it("should test MockDepositAddress get balance with ether.", async function (){
        let bank = await MockCentralBank.deployed();
        let token = await TestToken.deployed();
        let mockAddress = await MockDepositAddressEther.new(bank.address, accounts[0]);
        let balance = await mockAddress.getBalance();
        assert.equal(balance.valueOf(), 0, "new mockadrress Ether balance not 0.");

        await sendEtherWithPromise(accounts[0], mockAddress.address, 80);
        balance = await mockAddress.getBalance();
        assert.equal(balance.valueOf(), 80, "Mockadrress Ether balance not 80.");
    });

    it("should test MockDepositAddress clear balance with token.", async function (){
        let bank = await MockCentralBank.deployed();
        let token = await TestToken.deployed();
        let mockAddress = await MockDepositAddressToken.new(token.address, bank.address, accounts[0]);

        await bank.withdrawToken(token.address, 20);
        await token.transfer(mockAddress.address, 20);

        let balance = await mockAddress.getBalance();
        assert.equal(balance.valueOf(), 20, "new mockadrress balance not 20.");

        mockAddress.clearBalance(30);

        balance = await mockAddress.getBalance();
        assert.equal(balance.valueOf(), 20, "new mockadrress balance not 20.");

        mockAddress.clearBalance(15);

        balance = await mockAddress.getBalance();
        assert.equal(balance.valueOf(), 5, "new mockadrress balance not 5.");
    });

    it("should test MockDepositAddress clear balance with Eth.", async function (){
        let bank = await MockCentralBank.deployed();
        let token = await TestToken.deployed();
        let mockAddress = await MockDepositAddressEther.new( bank.address, accounts[0]);

        await sendEtherWithPromise(accounts[0], mockAddress.address, 20);
        let balance = await mockAddress.getBalance();
        assert.equal(balance.valueOf(), 20, "new mockadrress balance not 20.");

        mockAddress.clearBalance(30);

        balance = await mockAddress.getBalance();
        assert.equal(balance.valueOf(), 20, "new mockadrress balance not 20.");

        mockAddress.clearBalance(15);

        balance = await mockAddress.getBalance();
        assert.equal(balance.valueOf(), 5, "new mockadrress balance not 5.");
    });
});


var sendEtherWithPromise = function( sender, recv, amount ) {
    return new Promise(function(fulfill, reject){
            web3.eth.sendTransaction({to: recv, from: sender, value: amount}, function(error, result){
            if( error ) {
                return reject(error);
            }
            else {
                return fulfill(true);
            }
        });
    });
};