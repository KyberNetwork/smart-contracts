var MockDepositAddress = artifacts.require("./MockDepositAddress.sol");
var TestToken = artifacts.require("./TestToken.sol");
var MockCenteralBank = artifacts.require("./MockCenteralBank.sol");


contract('MockDepositAddress', function (accounts) {
   it("should add owner and verify it can perform withdraw", async function (){
        let bank = await MockCenteralBank.deployed();
        let token = await TestToken.deployed();
        console.log("create new mockAddress with owner " + accounts[2])
        let mockAddress = await MockDepositAddress.new(token, bank.address, accounts[2]);

        await bank.addOwner(mockAddress.address)
        await bank.addOwner(accounts[2]) //should add since for now bamk is using tx.origin and not msg.sender.
//        console.log("added owner to bank " + accounts[2]);
//        await mockAddress.addOwner(accounts[2])
        console.log("added owner to mockAddress " + accounts[2]);
        await mockAddress.withdraw(100, accounts[2], {from:accounts[2]})

        let balance = await token.balanceOf(accounts[2]);
        console.log("balance: " + balance.valueOf());
        assert.equal(balance.valueOf(), 100);
        try {
            await mockAddress.withdraw(60, accounts[3], {from:accounts[3]})
        }
        catch(e){
            console.log("withdraw failed as expected. " + e);
        }
        let balance2 = await token.balanceOf(accounts[3]);
        console.log("balance: " + balance2.valueOf());
        assert.equal(balance2.valueOf(), 0); //withdraw should have failed.
   });

});

