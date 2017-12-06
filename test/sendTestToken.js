var MockDepositAddress = artifacts.require("./MockDepositAddress.sol");
var TestToken = artifacts.require("./TestToken.sol");
var MockCenteralBank = artifacts.require("./MockCenteralBank.sol");


contract('MockDepositAddress', function (accounts) {
   it("should add owner and verify it can perform withdraw", async function (){
        let bank = await MockCenteralBank.deployed();
        let token = await TestToken.deployed();
        let mockAddress = await MockDepositAddress.deployed();

        await bank.addOwner(mockAddress.address)
        await bank.addOwner(accounts[2])
        console.log("added owner to bank " + accounts[2]);
        await mockAddress.addOwner(accounts[2])
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
        assert.equal(balance2.valueOf(), 0); //withdraw should have fail.
   });

  it("should withdraw 10 test tokens from MockDepositAddress (from bank) to 2nd account (accounts[1]) ", async function () {
    try {
        let bank = await MockCenteralBank.deployed();
        let token = await TestToken.deployed();
        let depositAdd = await MockDepositAddress.deployed();
        await depositAdd.withdraw(10, accounts[1]);
        console.log("withdraw done.");
        let balance = await token.balanceOf(accounts[1]);
        console.log("balance: " + balance.valueOf());
        assert.equal(balance.valueOf(), 10);
    }
    catch(e){
        console.log("oops 2 " + e);
        throw e;
    }
  });

});

