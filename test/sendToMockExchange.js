var MockDepositAddress = artifacts.require("./MockDepositAddress.sol");
var TestToken = artifacts.require("./TestToken.sol");
var MockExchange = artifacts.require("./MockExchange")

contract('MockExchange', function (accounts) {
    it("should add owner to mock exchange ", async function () {
        try {
            let exchange = await MockExchange.deployed();

            await exchange.addOwner(accounts[6]);
            console.log("owner accounts[6] added");
            await exchange.addOwner(accounts[5], {from: accounts[6]});
            console.log("owner accounts[5] added from accounts[6]");
            try{
                await exchange.addOwner(accounts[7], {from: accounts[7]});
            }
            catch(e){
                console.log("add owner failed as expected " + e)
            }
            assert.equal(5, 5);
        }
        catch(e){
            console.log("oops 89" + e);
            throw e;
        }
    });

    it("should clear balances when amount is higher then balance", async function () {
        try {
            let [exchange, token, depositAddress] = await
                Promise.all([ MockExchange.deployed(), TestToken.deployed(), MockDepositAddress.deployed()]);

            // withdraw initial amount to deposit address.
            await exchange.withdraw(token.address ,15, depositAddress.address);
            console.log("withdraw to deposit address done.");
            let balance = await token.balanceOf(depositAddress.address);
            console.log("deposit address contract balance: " + balance.valueOf());

            // set high amount - clear balance shouldn't run
            let tokens = [token.address];
            let amounts = [20];
            console.log("set high amount " + amounts[0] + ". make sure clear balance doesn't clear")
            exchange.clearBalances(tokens, amounts);
            let balance2 = await token.balanceOf(depositAddress.address);
            assert.equal(balance.valueOf(), balance2.valueOf());

            // set low amount - clear balance should clear to balance - amount
            let amounts2 = [10];
            console.log("set low amount " + amounts2[0] + ". make sure clear balance clears amount.")
            exchange.clearBalances(tokens, amounts2);
            balance2 = await token.balanceOf(depositAddress.address);
            assert.equal(balance2.valueOf(), (balance.valueOf() - amounts2[0]));
        }
        catch(e){
            console.log("oops 711   " + e);
            throw e;
        }
    });

    it("should clear balance of mockDepositAddress using exchange call", async function () {
        try {
            let [exchange, token] = await Promise.all([ MockExchange.deployed(), TestToken.deployed()]);
            console.log("init done. calling exchange with token address: " + token.address);
            await exchange.withdraw(token.address ,35, accounts[5]);
            console.log("withdraw done.");
            let balance = await token.balanceOf(accounts[5]);
            console.log("balance: " + balance.valueOf());
            assert.equal(balance.valueOf(), 35);
        }
        catch(e){
            console.log("oops 99" + e);
            throw e;
        }
    });
});