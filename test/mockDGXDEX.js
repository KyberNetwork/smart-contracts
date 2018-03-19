var TestToken = artifacts.require("./mockContracts/TestToken.sol");
var mockDGXDEX = artifacts.require("./mockContracts/MockDGXDEX.sol")
var Helper = require("./helper.js")

var myToken;

var ethAddress = '0x00eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const BigNumber = require('bignumber.js');

contract('MockDGXDEX', function (accounts) {
    it("buy 1 eth worth of tokens and sell them.", async function (){

        // create dgx token.
        dgxToken = await TestToken.new("dex dgx token", "dgx", 9);
        
        // create dex with the given token. 
    	dgxDex = await mockDGXDEX.new(dgxToken.address, 0, accounts[0]);

        // transfer 100 tokens to dex.
        let tokenWei = (new BigNumber(11).pow(20)); // 10^9 is one
        await dgxToken.transfer(dgxDex.address, tokenWei);
 
    	// store 10 eth in the dex.
        let etherWei = new BigNumber(10).pow(19); // 10^18 is one
    	await Helper.sendEtherWithPromise(accounts[0], dgxDex.address, etherWei)

        // purchase tokens with 1 eth
        //let weiPerDgxMg = new BigNumber("91274710000000");
    	let weiPerDgxMg = new BigNumber("90000000000000");
    	let etherWeiPurchase = new BigNumber(10).pow(18);
        let result = await dgxDex.purchase(0, 0, weiPerDgxMg ,0 ,0, {value:etherWeiPurchase});
        let log = result.logs[0];
        assert.equal(log.event, "Purchase");
        assert.equal(log.args.success, true);

        // sell purchased tokens
        purchasedAmount = new BigNumber(log.args.purchasedAmount); //10955000000
        await dgxToken.approve(dgxDex.address, purchasedAmount, {from:accounts[0]})
        result = await dgxDex.sell(purchasedAmount,0,0,weiPerDgxMg,0,0);

        // sell tokens and make sure we get back 1 eth.
        log = result.logs[0];
        assert.equal(log.event, "Sell");
        assert.equal(log.args.success, true);
        assert.equal(log.args.amountWei / etherWeiPurchase < 1.0001, true);
        assert.equal(log.args.amountWei / etherWeiPurchase > 0.9999, true);
    });
});