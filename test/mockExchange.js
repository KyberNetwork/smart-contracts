var TestToken = artifacts.require("./TestToken.sol");
var MockExchange = artifacts.require("./MockExchange.sol")
var MockCentralBank = artifacts.require("./MockCenteralBank.sol");
var MockDepositAddressEther = artifacts.require("./MockDepositAddressEther.sol");

var centralBank;

var myToken;

var myExchange;

contract('MockExchange', function (accounts) {
    it("should test withdraw successful with owner and withdraw rejected with non owner, for token", async function (){
        centralBank = await MockCentralBank.new();
        myToken = await TestToken.new("my token", "tok", 18);
        let supply = await myToken.INITIAL_SUPPLY();
        await myToken.transfer(centralBank.address, supply);
        await sendEtherWithPromise( accounts[5], centralBank.address, 10000);
        await Promise.all([centralBank.addOwner(accounts[2]), centralBank.addOwner(accounts[3])]);
        myExchange = await MockExchange.new("first name", centralBank.address);

        await myExchange.addOwner(accounts[2]);

        let someToken = await TestToken.new("dont use", "ban", 12);
        
        await myExchange.addMockDepositAddress(myToken.address, {from:accounts[2]});

        //withdraw with owner
        await myExchange.withdraw(myToken.address, 100, someToken.address, {from:accounts[2]})
        let balance = await myToken.balanceOf(someToken.address);
        assert.equal(balance.valueOf(), 100);

        try {
            await myExchange.withdraw(myToken.address, 60, someToken.address, {from:accounts[3]})
        }
        catch(e){
            console.log("withdraw failed as expected. " + e);
        }

        let balance2 = await myToken.balanceOf(someToken.address);
        assert.equal(balance2.valueOf(), 100); //withdraw should have failed. value stays 100
    });

    it("should test withdraw successful with owner and withdraw rejected with non owner, for Eth", async function (){
        let ethAddress = await myExchange.ETH_TOKEN_ADDRESS();
        //create a token. just to test ether deposit
        let payable = await MockDepositAddressEther.new(centralBank.address, accounts[0]);

        await myExchange.addMockDepositAddress(ethAddress, {from:accounts[2]});
        await myExchange.withdraw(ethAddress, 2, payable.address, {from:accounts[2]});
        let balance = await getBalancePromise(payable.address);
        assert.equal(balance.valueOf(), 2, "didn't find expected balance.");

        try {
            await myExchange.withdraw(ethAddress, 3, payable.address, {from:accounts[3]});
        }
        catch(e){
            console.log("withdraw failed as expected. " + e);
        }

        balance = await getBalancePromise(payable.address);
        //withdraw should have failed.
        assert.equal(balance.valueOf(), 2, "didn't find expected balance");
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
        let ethAddress = await myExchange.ETH_TOKEN_ADDRESS();

        //first see init with balance 0
        await myExchange.addMockDepositAddress(ethAddress);
        let balance = await myExchange.getBalance(ethAddress);
        assert.equal(balance.valueOf(), 0, "new myExchange balance not 0.");

        //get mockDepositAddress address for this myToken
        let mockAddress = await myExchange.tokenDepositAddresses(ethAddress);
        await sendEtherWithPromise(accounts[6], mockAddress, 80);
        balance = await myExchange.getBalance(ethAddress);
        assert.equal(balance.valueOf(), 80, "deposit address balance for this myExchange not 80.");
    });

    it("should test myExchange clear balance with myToken.", async function (){
        let myToken = await TestToken.new("another", "ant", 18);
        myExchange.addMockDepositAddress(myToken.address);

        //send myTokens to deposit address
        let mockAddress = await myExchange.tokenDepositAddresses(myToken.address);
        myToken.transfer(mockAddress, 20);
        let balance = await myExchange.getBalance(myToken.address);

        // create clear balance array
        let myTokens = [myToken.address];
        let amounts = [30]
        myExchange.clearBalances(myTokens, amounts);

        balance = await myExchange.getBalance(myToken.address);
        assert.equal(balance.valueOf(), 20, "myExchange balance not 20.");

        let amounts1 = [15];
        myExchange.clearBalances(myTokens, amounts1);

        balance = await myExchange.getBalance(myToken.address);
        assert.equal(balance.valueOf(), 5, "Exchange balance after clear balance not 5.");
    });

    it("should test myExchange clear balance with Ether.", async function (){
        let ethAddress = await myExchange.ETH_TOKEN_ADDRESS();
        myExchange.addMockDepositAddress(ethAddress);

        //send myTokens to deposit address
        let myTokenAddress = await myExchange.tokenDepositAddresses(ethAddress);
        await sendEtherWithPromise(accounts[3], myTokenAddress, 20);
        let balance = await myExchange.getBalance(ethAddress);

        // create clear balance array
        let myTokens = [ethAddress];
        let amounts = [30]
        myExchange.clearBalances(myTokens, amounts);

        balance = await myExchange.getBalance(ethAddress);
        assert.equal(balance.valueOf(), 20, "myExchange balance not 20.");

        let amounts1 = [15];
        myExchange.clearBalances(myTokens, amounts1);

        balance = await myExchange.getBalance(ethAddress);
        assert.equal(balance.valueOf(), 5, "Exchange balance after clear balance not 5.");
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

var getBalancePromise = function( account ) {
    return new Promise(function (fulfill, reject){
        web3.eth.getBalance(account,function(err,result){
            if( err ) reject(err);
            else fulfill(result);
        });
    });
};
