var TestToken = artifacts.require("./mockContracts/TestToken.sol");
var mockDGXDEX = artifacts.require("./mockContracts/MockDGXDEX.sol")
var Helper = require("./helper.js")

var myToken;

var ethAddress = '0x00eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const BigNumber = require('bignumber.js');

contract('MockDGXDEX', function (accounts) {
    it("create DGX dex and store funds in it.", async function (){

        // create dgx token.
        dgxToken = await TestToken.new("dex dgx token", "dgx", 9);
        
        // create dex with the given token. 
        dgxDex = await mockDGXDEX.new(dgxToken.address, 0, accounts[0]);

        // transfer 100 tokens to dex.
        let tokenWei = (new BigNumber(10).pow(11)); // 10^9 is one
        await dgxToken.transfer(dgxDex.address, tokenWei);
 
        // store 10 eth in the dex.
        let etherWei = new BigNumber(10).pow(19); // 10^18 is one
        await Helper.sendEtherWithPromise(accounts[0], dgxDex.address, etherWei)
    })
    it("purchase 1 eth worth of tokens and sell them back.", async function (){

        await dgxDex.setSigCheck(false)
        await dgxDex.setBlockCheck(true)

        //purchase tokens
        let weiPerDgxMg = new BigNumber("91274710000000");
        let etherWeiPurchase = new BigNumber(10).pow(18);
        let result = await dgxDex.purchase(web3.eth.blockNumber,
                                           0,
                                           weiPerDgxMg,
                                           0,
                                           0,
                                           {value:etherWeiPurchase});
        let log = result.logs[0];
        assert.equal(log.event, "Purchase");
        assert.equal(log.args.success, true);

        // sell tokens and make sure we get back 1 eth.
        purchasedAmount = new BigNumber(log.args.purchasedAmount); //10955000000
        await dgxToken.approve(dgxDex.address, purchasedAmount, {from:accounts[0]})
        result = await dgxDex.sell(purchasedAmount,
                                   web3.eth.blockNumber,
                                   0,
                                   weiPerDgxMg,
                                   0,
                                   0);
        log = result.logs[0];
        assert.equal(log.event, "Sell");
        assert.equal(log.args.success, true);
        assert.equal(log.args.amountWei / etherWeiPurchase < 1.0001, true);
        assert.equal(log.args.amountWei / etherWeiPurchase > 0.9999, true);
    })
    it("make sure we can purchase with an almost expired block number.", async function (){

        // purchase 1 eth worth of tokens.
        weiPerDgxMg = new BigNumber("91274710000000");
        etherWeiPurchase = new BigNumber(10).pow(18);
        await dgxDex.purchase(web3.eth.blockNumber - 4,
                              0,
                              weiPerDgxMg,
                              0,
                              0,
                              {value:etherWeiPurchase});
    });
    it("make sure we can not purchase with an expired block number.", async function (){

        // try to purchase 1 eth worth of tokens.
        weiPerDgxMg = new BigNumber("91274710000000");
        etherWeiPurchase = new BigNumber(10).pow(18);
        try {
            await dgxDex.purchase(web3.eth.blockNumber - 5,
                                  0,
                                  weiPerDgxMg,
                                  0,
                                  0,
                                  {value:etherWeiPurchase});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });
    it("purchase with real signature check and price feed.", async function (){

        await dgxDex.setSigCheck(true)
        await dgxDex.setBlockCheck(false)

        let block_number = 5278367;
        let nonce = 134;
        let weiPerDgxMg = new BigNumber("91274710000000");
        let signer = "0xb2aa58ef57ffd6c0cb8aae0a706860bc08e360d8";
        let signature = "0xe11c7e420ad1042fb6233562a004427ab34ce1389a1fb76c4daeb50f49b2172d66fb50c255b7faaed4b017fb364d30f1566b030d099f17a94c9618afae7d2e6400";

        // try to purchase 1 eth worth of tokens.
        etherWeiPurchase = new BigNumber(10).pow(18);
        
        await dgxDex.purchase(block_number,
                              nonce,
                              weiPerDgxMg,
                              signer,
                              signature,
                              {value:etherWeiPurchase});
    });
    it("make sure we cannot purchase with altered price feed.", async function (){

        let block_number = 5278367;
        let nonce = 134;
        let weiPerDgxMg = new BigNumber("91274710000000");
        let signer = "0xb2aa58ef57ffd6c0cb8aae0a706860bc08e360d8";
        let signature = "0xe11c7e420ad1042fb6233562a004427ab34ce1389a1fb76c4daeb50f49b2172d66fb50c255b7faaed4b017fb364d30f1566b030d099f17a94c9618afae7d2e6400";
        signature = signature.replace("e11c7e", "e11c8e");
 
        // try to purchase 1 eth worth of tokens.
        etherWeiPurchase = new BigNumber(10).pow(18);

        try {
            await dgxDex.purchase(block_number,
                    nonce,
                    weiPerDgxMg,
                    signer,
                    signature,
                    {value:etherWeiPurchase});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });
});