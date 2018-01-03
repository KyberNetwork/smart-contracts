var TestToken = artifacts.require("./mockContracts/TestToken.sol");
var MockExchange = artifacts.require("./mockContracts/MockExchange.sol")
var MockCentralBank = artifacts.require("./mockContracts/MockCentralBank.sol");
var MockDepositAddressEther = artifacts.require("./mockContracts/MockDepositAddressEther.sol");
var Helper = require("./helper.js")

var centralBank;

var myToken;

var myExchange;

var ethAddress = '0x00eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

contract('MockExchange', function (accounts) {
    it("should test withdraw successful with owner, for token", async function (){
        //global initialization in first test
        centralBank = await MockCentralBank.new();
        Helper.sendEtherWithPromise(accounts[7], centralBank.address, 1000);
        myToken = await TestToken.new("my token", "tok", 18);
        let supply = await myToken.INITIAL_SUPPLY();
        await myToken.transfer(centralBank.address, supply);

        await Promise.all([centralBank.addOwner(accounts[2]), centralBank.addOwner(accounts[3])]);
        myExchange = await MockExchange.new("first name", centralBank.address);

        //start test
        await myExchange.addOwner(accounts[2]);

        let payable = await TestToken.new("dont use", "ban", 12);
        
        await myExchange.addMockDepositAddress(myToken.address, {from:accounts[2]});

        //withdraw with owner
        await myExchange.withdraw(myToken.address, 100, payable.address, {from:accounts[2]})
        let balance = await myToken.balanceOf(payable.address);
        assert.equal(balance.valueOf(), 100);
    });

    it("should test withdraw rejected with non owner, for token", async function (){
        let payable = await TestToken.new("dont use", "ban", 12);
        await myExchange.addMockDepositAddress(myToken.address);

        try {
            await myExchange.withdraw(myToken.address, 60, payable.address, {from:accounts[3]})
            assert(false,  "shouldn't reach this line. expected line above to throw.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        let balance = await myToken.balanceOf(payable.address);
        assert.equal(balance.valueOf(), 0, "unexpected balance."); //withdraw should have failed. value stays 100
    });

    it("should test withdraw successful with owner, for Eth", async function (){
        //create a mockAddress as payable. just to test ether deposit
        let payable = await MockDepositAddressEther.new(centralBank.address, accounts[0]);

        await myExchange.addOwner(accounts[2]);
        await myExchange.addMockDepositAddress(ethAddress, {from:accounts[2]});
        await myExchange.withdraw(ethAddress, 2, payable.address, {from:accounts[2]});
        let balance = await Helper.getBalancePromise(payable.address);
        assert.equal(balance.valueOf(), 2, "didn't find expected balance.");
    });

    it("should test withdraw rejected with non owner, for Eth", async function (){
        //create a mock address which is payable. just to test ether deposit
        let payable = await MockDepositAddressEther.new(centralBank.address, accounts[0]);

        await myExchange.addMockDepositAddress(ethAddress, {from:accounts[2]});

        try {
            await myExchange.withdraw(ethAddress, 3, payable.address, {from:accounts[3]});
            assert(false, "should have received throw.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but received error: " + e);
        }

        balance = await Helper.getBalancePromise(payable.address);
        //withdraw should have failed.
        assert.equal(balance.valueOf(), 0, "didn't find expected balance");
    });

    it("should test MockDepositAddress get balance with token.", async function (){
        let token = await TestToken.new("other token", "oth", 18);
        await myExchange.addMockDepositAddress(token.address);
        let balance = await myExchange.getBalance(token.address);
        assert.equal(balance.valueOf(), 0, "new myExchange balance not 0.");

        //get mockDepositAddress address for this myToken
        let mockAddress = await myExchange.tokenDepositAddresses(token.address);
        await token.transfer(mockAddress, 80);
        balance = await myExchange.getBalance(token.address);
        assert.equal(balance.valueOf(), 80, "deposit address balance for this myExchange not 80.");
    });

    it("should test MockDepositAddress get balance with Ether.", async function (){
        //first see init with balance 0
        await myExchange.addMockDepositAddress(ethAddress);
        let balance = await myExchange.getBalance(ethAddress);
        assert.equal(balance.valueOf(), 0, "new myExchange balance not 0.");

        //get mockDepositAddress address for this myToken
        let mockAddress = await myExchange.tokenDepositAddresses(ethAddress);
        await Helper.sendEtherWithPromise(accounts[6], mockAddress, 80);
        balance = await myExchange.getBalance(ethAddress);
        assert.equal(balance.valueOf(), 80, "deposit address balance for this myExchange not 80.");
    });

    it("should test myExchange clear balance with token.", async function (){
        let myToken = await TestToken.new("another", "ant", 18);
        myExchange.addMockDepositAddress(myToken.address);

        //send myTokens to deposit address
        let mockAddress = await myExchange.tokenDepositAddresses(myToken.address);
        myToken.transfer(mockAddress, 20);

        // create clear balance array
        let myTokens = [myToken.address];
        let amounts = [30]
        await myExchange.clearBalances(myTokens, amounts);

        balance = await myExchange.getBalance(myToken.address);
        assert.equal(balance.valueOf(), 20, "myExchange balance not 20.");

        let amounts1 = [15];
        await myExchange.clearBalances(myTokens, amounts1);

        balance = await myExchange.getBalance(myToken.address);
        assert.equal(balance.valueOf(), 5, "Exchange balance after clear balance not 5.");
    });

    it("should test myExchange clear balance with Ether.", async function (){
        myExchange.addMockDepositAddress(ethAddress);

        //send ethers to deposit address
        let myEtherMockAddress = await myExchange.tokenDepositAddresses(ethAddress);
        await Helper.sendEtherWithPromise(accounts[3], myEtherMockAddress, 20);

        // create clear balance array
        let myTokens = [ethAddress];
        let amounts = [30]
        await myExchange.clearBalances(myTokens, amounts);

        balance = await myExchange.getBalance(ethAddress);
        assert.equal(balance.valueOf(), 20, "myExchange balance not 20.");

        let amounts1 = [15];
        await myExchange.clearBalances(myTokens, amounts1);

        balance = await myExchange.getBalance(ethAddress);
        assert.equal(balance.valueOf(), 5, "Exchange balance after clear balance not 5.");
    });

    it("should test myExchange clear balance with Ether and token on same array.", async function (){
        myExchange.addMockDepositAddress(ethAddress);
        let myToken = await TestToken.new("another", "ant", 18);
        myExchange.addMockDepositAddress(myToken.address);

        //send ethers to deposit address
        let myEtherMockAddress = await myExchange.tokenDepositAddresses(ethAddress);
        await Helper.sendEtherWithPromise(accounts[5], myEtherMockAddress, 20);

        //send myTokens to deposit address
        let mockAddress = await myExchange.tokenDepositAddresses(myToken.address);
        myToken.transfer(mockAddress, 20);

        // create clear balance array
        let myTokens = [ethAddress, myToken.address];
        let amounts = [30, 30]
        await myExchange.clearBalances(myTokens, amounts);

        balance = await myExchange.getBalance(ethAddress);
        assert.equal(balance.valueOf(), 20, "myExchange balance not 20.");

        balance = await myExchange.getBalance(myToken.address);
        assert.equal(balance.valueOf(), 20, "myExchange balance not 20.");

        let amounts1 = [15, 15];
        await myExchange.clearBalances(myTokens, amounts1);

        balance = await myExchange.getBalance(ethAddress);
        assert.equal(balance.valueOf(), 5, "Exchange balance after clear balance not 5.");
        balance = await myExchange.getBalance(myToken.address);
        assert.equal(balance.valueOf(), 5, "Exchange balance after clear balance not 5.");
    });
});