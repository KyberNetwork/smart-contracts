let TestToken = artifacts.require("./mockContracts/TestToken.sol");
let MockOtc = artifacts.require("./mockContracts/MockOtc.sol");
let MockOasisDirectProxy = artifacts.require("./mockContracts/MockOasisDirectProxy.sol");
let KyberOasisReserve = artifacts.require("./KyberOasisReserve");

let Helper = require("./helper.js");
let BigNumber = require('bignumber.js');

const ethAddress = '0x00eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const precision = new BigNumber(10).pow(18);
const daisForEth = 481;

let admin;
let myWethToken;
let myToken;
let otc;
let oasisDirectProxy;
let oasisWeiInit;
let supply;
let reserve;

contract('KyberOasisReserve', function (accounts) {
    it("should init globals", async function (){

        // use admin address as network
        admin = accounts[0]
            
        // create test tokens. 
        myWethToken = await TestToken.new("my weth token", "weth", 18);
        myToken = await TestToken.new("my token", "tok", 18);

        // create mock contracts.
        otc = await MockOtc.new(myWethToken.address);
        oasisDirectProxy = await MockOasisDirectProxy.new()

        // move eth to the oasis direct proxy
        oasisWeiInit = (new BigNumber(10)).pow(19); // 10 eth
        await Helper.sendEtherWithPromise(accounts[8], oasisDirectProxy.address, oasisWeiInit);

        // move tokens to the oasis direct proxy
        supply = await myToken.INITIAL_SUPPLY();
        await myToken.transfer(oasisDirectProxy.address, supply);

        // create reserve, use admin as network
        reserve = await KyberOasisReserve.new(admin, oasisDirectProxy.address, otc.address, myWethToken.address, myToken.address, admin);

        // approve for reserveto claim tokens from admin
        supply = await myToken.INITIAL_SUPPLY();
        myToken.approve(reserve.address, supply);
    });

    it("should do a eth->token trade", async function (){

        // get conversion rate
        let weiSrcQty = new BigNumber(10).pow(18); // 1 eth
        let buyRate = await reserve.getConversionRate(ethAddress, myToken.address, weiSrcQty, 0)

        let buyRateInTokenUnits = buyRate.div(precision)
        assert.equal(buyRateInTokenUnits, daisForEth, "wrong eth->token rate")

        // buy
        let balanceBefore = await Helper.getBalancePromise(admin);
        let tweiBalanceBefore = await myToken.balanceOf(admin);

        let txInfo = await reserve.trade(ethAddress, weiSrcQty, myToken.address, admin, buyRate, true, {value: weiSrcQty});
        let tx = await web3.eth.getTransaction(txInfo.tx);
        let gasCost = tx.gasPrice.mul(txInfo.receipt.gasUsed);

        let balanceAfter = await Helper.getBalancePromise(admin);
        let tweiBalanceAfter = await myToken.balanceOf(admin);

        let weiLost = balanceBefore.minus(balanceAfter)
        let tWeiGained = tweiBalanceAfter.minus(tweiBalanceBefore)
        let expecetedTweiGained = BigNumber(daisForEth).mul(weiSrcQty)

        assert.equal(weiLost.valueOf(), weiSrcQty.plus(gasCost).valueOf(), "wrong wei amount lost in the trade")
        assert.equal(tWeiGained.valueOf(), expecetedTweiGained.valueOf(), "wrong expected token wei gained")

    });
    it("should do a token->eth trade", async function (){

        let tweiSrcQty = BigNumber(daisForEth).mul(BigNumber(10).pow(18)); // daisForEth amount of dai
        let sellRate = await reserve.getConversionRate(myToken.address, ethAddress, tweiSrcQty, 0);

        let sellRateInTokenUnits = sellRate.div(precision)
        assert.equal(sellRateInTokenUnits.valueOf(), 1 / daisForEth, "wrong token->eth rate")

        // sell
        let balanceBefore = await Helper.getBalancePromise(admin);
        let tweiBalanceBefore = await myToken.balanceOf(admin);

        let txInfo = await reserve.trade(myToken.address, tweiSrcQty, ethAddress, admin, sellRate, true);
        let tx = await web3.eth.getTransaction(txInfo.tx);
        let gasCost = tx.gasPrice.mul(txInfo.receipt.gasUsed);

        let balanceAfter = await Helper.getBalancePromise(admin);
        let tweiBalanceAfter = await myToken.balanceOf(admin);

        let weiGained = balanceAfter.minus(balanceBefore)
        let tWeiLost = tweiBalanceBefore.minus(tweiBalanceAfter)
        let expecetedWeiGained = BigNumber(tweiSrcQty).div(daisForEth)

        assert.equal(weiGained.valueOf(), expecetedWeiGained.minus(gasCost).valueOf(), "wrong wei amount gained in the trade")
        assert.equal(tWeiLost.valueOf(), tweiSrcQty.valueOf(), "wrong expected token wei lost")

    });
});
