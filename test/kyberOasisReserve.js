let TestToken = artifacts.require("./mockContracts/TestToken.sol");
let WethToken = artifacts.require("./oasisContracts/mockContracts/WethToken.sol"); 
let MockOtc = artifacts.require("./oasisContracts/mockContracts/MockOtc.sol");
let KyberOasisReserve = artifacts.require("./oasisContracts/KyberOasisReserve");

let Helper = require("./helper.js");
let BigNumber = require('bignumber.js');

const allowedDiffInPercent = BigNumber(0.0000000001)
const ethAddress = '0x00eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const precision = new BigNumber(10).pow(18);
const daisForEth = 481;
const feePercent = 0.25;
const feeBps = feePercent * 100;
const alternativeFeePercent = 0.13;
const alternativeFeeBps = alternativeFeePercent * 100;

let admin;
let myWethToken;
let myToken;
let otc;
let oasisDirectProxy;
let oasisWeiInit;
let supply;
let reserve;


function valueAfterReducingFee(val, feePercent) { 
    return val * (100-feePercent)/100;
}


contract('KyberOasisReserve', function (accounts) {
    it("should init globals", async function (){

        // use admin address as network
        admin = accounts[0]

        // create test tokens. 
        myWethToken = await WethToken.new("my weth token", "weth", 18);
        myToken = await TestToken.new("my token", "tok", 18);

        // create mock otc.
        otc = await MockOtc.new(myWethToken.address, daisForEth);

        // move eth to the otc
        oasisWeiInit = (new BigNumber(10)).pow(19); // 10 eth
        await Helper.sendEtherWithPromise(accounts[8], otc.address, oasisWeiInit);

        // move tokens to the otc
        supply = await myToken.INITIAL_SUPPLY();
        await myToken.transfer(otc.address, supply);

        // create reserve, use admin as network
        reserve = await KyberOasisReserve.new(admin, otc.address, myWethToken.address, myToken.address, admin, feeBps);

        // approve for reserve to claim tokens from admin
        supply = await myToken.INITIAL_SUPPLY();
        myToken.approve(reserve.address, supply);
    });

    it("should do a eth->token trade", async function (){

        // get conversion rate
        let weiSrcQty = new BigNumber(10).pow(18); // 1 eth
        let buyRate = await reserve.getConversionRate(ethAddress, myToken.address, weiSrcQty, 0)
        let buyRateInTokenUnits = buyRate.div(precision)
        let expectedRate = valueAfterReducingFee(daisForEth, feePercent)
        assert.equal(buyRateInTokenUnits.valueOf(), expectedRate, "wrong rate")

        // buy
        let reserveTweiBalanceBefore = await myToken.balanceOf(reserve.address);
        let balanceBefore = await Helper.getBalancePromise(admin);
        let tweiBalanceBefore = await myToken.balanceOf(admin);

        let txInfo = await reserve.trade(ethAddress, weiSrcQty, myToken.address, admin, buyRate, true, {value: weiSrcQty});
        let tx = await web3.eth.getTransaction(txInfo.tx);
        let gasCost = tx.gasPrice.mul(txInfo.receipt.gasUsed);

        let reserveTweiBalanceAfter = await myToken.balanceOf(reserve.address);
        let balanceAfter = await Helper.getBalancePromise(admin);
        let tweiBalanceAfter = await myToken.balanceOf(admin);

        let weiLost = balanceBefore.minus(balanceAfter)
        let tWeiGained = tweiBalanceAfter.minus(tweiBalanceBefore)
        let expecetedTweiGained = BigNumber(expectedRate).mul(weiSrcQty)
        let reserveTweiGained = reserveTweiBalanceAfter.minus(reserveTweiBalanceBefore)
        let expectedReserveTweiGained = weiSrcQty.mul(feePercent/100).mul(daisForEth)

        assert.equal(weiLost.valueOf(), weiSrcQty.plus(gasCost).valueOf(), "wrong wei amount lost in the trade")
        assert.equal(tWeiGained.valueOf(), expecetedTweiGained.valueOf(), "wrong expected token wei gained")
        assert.equal(reserveTweiGained.valueOf(), expectedReserveTweiGained.valueOf(), "wrong token wei gained by reserve")

    });
    it("should do a token->eth trade", async function (){

        let tweiSrcQty = await myToken.balanceOf(admin); // sell all we have
        let sellRate = await reserve.getConversionRate(myToken.address, ethAddress, tweiSrcQty, 0);

        let sellRateInTokenUnits = sellRate.div(precision)
        let expectedRate = valueAfterReducingFee(1 / daisForEth, feePercent)
        Helper.assertAbsDiff(sellRateInTokenUnits.valueOf(), expectedRate, allowedDiffInPercent, "wrong rate")

        // sell
        let reserveBalanceBefore = await Helper.getBalancePromise(reserve.address);
        let balanceBefore = await Helper.getBalancePromise(admin);
        let tweiBalanceBefore = await myToken.balanceOf(admin);

        let txInfo = await reserve.trade(myToken.address, tweiSrcQty, ethAddress, admin, sellRate, true);
        let tx = await web3.eth.getTransaction(txInfo.tx);
        let gasCost = tx.gasPrice.mul(txInfo.receipt.gasUsed);

        let reserveBalanceAfter = await Helper.getBalancePromise(reserve.address);
        let balanceAfter = await Helper.getBalancePromise(admin);
        let tweiBalanceAfter = await myToken.balanceOf(admin);

        let weiGained = balanceAfter.minus(balanceBefore)
        let tWeiLost = tweiBalanceBefore.minus(tweiBalanceAfter)
        let expecetedWeiGained = BigNumber(tweiSrcQty).mul(expectedRate.toString())
        let reserveWeiGained = reserveBalanceAfter.minus(reserveBalanceBefore)
        let expectedReserveWeiGained = tweiSrcQty.mul(feePercent/100).div(daisForEth)

        Helper.assertAbsDiff(reserveWeiGained, expectedReserveWeiGained, allowedDiffInPercent, "wrong reserve wei gained in the trade")
        Helper.assertAbsDiff(weiGained, expecetedWeiGained.minus(gasCost), allowedDiffInPercent, "wrong expected wei gained");
        assert.deepEqual(tWeiLost, tweiSrcQty, "wrong expected token wei lost")
    });
    it("should disable trades in the reserve and see that getconversionrate reverts", async function (){

        let alerter = accounts[0]
        await reserve.addAlerter(alerter);
        await reserve.disableTrade();
        let weiSrcQty = new BigNumber(10).pow(18); // 1 eth
        let buyRate = await reserve.getConversionRate(ethAddress, myToken.address, weiSrcQty, 0);

        try {
            let txInfo = await reserve.trade(ethAddress, weiSrcQty, myToken.address, admin, buyRate, true, {value: weiSrcQty});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });
    it("should re-enable trades in the reserve and see that getconversionrate and trade does not revert", async function (){

        await reserve.enableTrade();
        let weiSrcQty = new BigNumber(10).pow(18); // 1 eth
        let buyRate = await reserve.getConversionRate(ethAddress, myToken.address, weiSrcQty, 0);
        let txInfo = await reserve.trade(ethAddress, weiSrcQty, myToken.address, admin, buyRate, true, {value: weiSrcQty});
    });
    it("should change network to another address and see that trade fails since sender is not network", async function (){

        await reserve.setKyberNetwork(accounts[2]);
        let weiSrcQty = new BigNumber(10).pow(18); // 1 eth
        let buyRate = await reserve.getConversionRate(ethAddress, myToken.address, weiSrcQty, 0);
        try {
            let txInfo = await reserve.trade(ethAddress, weiSrcQty, myToken.address, admin, buyRate, true, {value: weiSrcQty});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });
    it("should return network admin address and see that trade does not revert", async function (){

        await reserve.setKyberNetwork(admin);
        let weiSrcQty = new BigNumber(10).pow(18); // 1 eth
        let buyRate = await reserve.getConversionRate(ethAddress, myToken.address, weiSrcQty, 0);
        let txInfo = await reserve.trade(ethAddress, weiSrcQty, myToken.address, admin, buyRate, true, {value: weiSrcQty});
    });
    it("should set otc to a malicious address (reserve) and see that getconverisonrate reverts", async function (){

        await reserve.setOtc(reserve.address);
        let weiSrcQty = new BigNumber(10).pow(18); // 1 eth
        try {
            let buyRate = await reserve.getConversionRate(ethAddress, myToken.address, weiSrcQty, 0);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });
    it("should return otc correct address and see that getconverisonrate does not revert", async function (){

        await reserve.setOtc(otc.address);
        let weiSrcQty = new BigNumber(10).pow(18); // 1 eth
        let buyRate = await reserve.getConversionRate(ethAddress, myToken.address, weiSrcQty, 0);
    });
    it("should set fee to another value and make sure getconversionrate and trade pass", async function (){

        await reserve.setFeeBps(alternativeFeeBps);
        // get conversion rate
        let weiSrcQty = new BigNumber(10).pow(18); // 1 eth
        let buyRate = await reserve.getConversionRate(ethAddress, myToken.address, weiSrcQty, 0)
        let buyRateInTokenUnits = buyRate.div(precision)
        let expectedRate = valueAfterReducingFee(daisForEth, alternativeFeePercent)
        assert.equal(buyRateInTokenUnits.valueOf(), expectedRate, "wrong rate")

        // buy
        let reserveTweiBalanceBefore = await myToken.balanceOf(reserve.address);
        let balanceBefore = await Helper.getBalancePromise(admin);
        let tweiBalanceBefore = await myToken.balanceOf(admin);

        let txInfo = await reserve.trade(ethAddress, weiSrcQty, myToken.address, admin, buyRate, true, {value: weiSrcQty});
        let tx = await web3.eth.getTransaction(txInfo.tx);
        let gasCost = tx.gasPrice.mul(txInfo.receipt.gasUsed);

        let reserveTweiBalanceAfter = await myToken.balanceOf(reserve.address);
        let balanceAfter = await Helper.getBalancePromise(admin);
        let tweiBalanceAfter = await myToken.balanceOf(admin);

        let weiLost = balanceBefore.minus(balanceAfter)
        let tWeiGained = tweiBalanceAfter.minus(tweiBalanceBefore)
        let expecetedTweiGained = BigNumber(expectedRate).mul(weiSrcQty)
        let reserveTweiGained = reserveTweiBalanceAfter.minus(reserveTweiBalanceBefore)
        let expectedReserveTweiGained = weiSrcQty.mul(alternativeFeePercent/100).mul(daisForEth)

        assert.equal(weiLost.valueOf(), weiSrcQty.plus(gasCost).valueOf(), "wrong wei amount lost in the trade")
        assert.equal(tWeiGained.valueOf(), expecetedTweiGained.valueOf(), "wrong expected token wei gained")
        assert.equal(reserveTweiGained.valueOf(), expectedReserveTweiGained.valueOf(), "wrong token wei gained by reserve")

        // return fee to original value
        await reserve.setFeeBps(feeBps);
    });
    it("should query rate for 0 amount of tokens and see we get rate as for 1 dai ", async function (){
        let zeroTweiSrcQty = BigNumber(0);
        let zeroSellRate = await reserve.getConversionRate(myToken.address, ethAddress, zeroTweiSrcQty, 0);

        let oneTweiSrcQty = BigNumber(10).pow(18); // 1 token.
        let oneSellRate = await reserve.getConversionRate(myToken.address, ethAddress, oneTweiSrcQty, 0);

        assert.equal(zeroSellRate.valueOf(), oneSellRate.valueOf(), "sell rates for 0 and 1 token are not equal.");
    });
    it("should try getconversionrate for a token other than trade token and see it reverts", async function (){
        let otherToken = await TestToken.new("other token", "oth", 18);
        
        let weiSrcQty = new BigNumber(10).pow(18); // 1 eth
        let buyRate = await reserve.getConversionRate(ethAddress, otherToken.address, weiSrcQty, 0);
        try {
            let txInfo = await reserve.trade(ethAddress, weiSrcQty, myToken.address, admin, buyRate, true, {value: weiSrcQty});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });
    it("should try getconversionrate for without eth as src or dest and see it reverts", async function (){

        let weiSrcQty = new BigNumber(10).pow(18); // 1 token
        let buyRate = await reserve.getConversionRate(myToken.address, myToken.address, weiSrcQty, 0);
        try {
            let txInfo = await reserve.trade(ethAddress, weiSrcQty, myToken.address, admin, buyRate, true, {value: weiSrcQty});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });
    it("should try getconversionrate without eth as src or dest and see it reverts", async function (){

        let weiSrcQty = new BigNumber(10).pow(18); // 1 token
        let buyRate = await reserve.getConversionRate(myToken.address, myToken.address, weiSrcQty, 0);
        try {
            let txInfo = await reserve.trade(ethAddress, weiSrcQty, myToken.address, admin, buyRate, true, {value: weiSrcQty});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });
    it("should try trade but send src amount than specified", async function (){

        let weiSrcQty = new BigNumber(10).pow(18); // 1 token
        let halfWeiSrcQty = BigNumber(0.5).mul(BigNumber(10).pow(18));
        let buyRate = await reserve.getConversionRate(ethAddress, myToken.address, weiSrcQty, 0);

        try {
            let txInfo = await reserve.trade(ethAddress, weiSrcQty, myToken.address, admin, buyRate, true, {value: halfWeiSrcQty});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        // make sure it does not revert when sending full amount
        let txInfo = await reserve.trade(ethAddress, weiSrcQty, myToken.address, admin, buyRate, true, {value: weiSrcQty});
    });
    it("should try to send eth to reserve and make sure default payable function throws", async function (){

        let weiSrcQty = new BigNumber(10).pow(18); // 1 token
        try {
            await Helper.sendEtherWithPromise(accounts[8], reserve.address, weiSrcQty);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });
    it("should try to trade but send from address other than network", async function (){

        let weiSrcQty = new BigNumber(10).pow(18); // 1 token
        let buyRate = await reserve.getConversionRate(ethAddress, myToken.address, weiSrcQty, 0);

        try {
            let txInfo = await reserve.trade(ethAddress, weiSrcQty, myToken.address, admin, buyRate, true, {value: weiSrcQty, from: accounts[3]});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        // make sure it does not revert when sending from network (admin)
        let txInfo = await reserve.trade(ethAddress, weiSrcQty, myToken.address, admin, buyRate, true, {value: weiSrcQty, from: admin});
    });
    it("should try to change network without being admin", async function (){

        try {
            await reserve.setKyberNetwork(admin, {from: accounts[2]});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        // make sure it does not revert when doing it as admin)
        await reserve.setKyberNetwork(admin, {from: admin});
    });
    it("should try to set otc without being admin", async function (){

        try {
            await reserve.setOtc(otc.address, {from: accounts[2]});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        // make sure it does not revert when doing it as admin)
        await reserve.setOtc(otc.address, {from: admin});
    });
    it("should try to set fee without being admin", async function (){

        try {
            await reserve.setFeeBps(feeBps, {from: accounts[2]});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        // make sure it does not revert when doing it as admin)
        await reserve.setFeeBps(feeBps, {from: admin});
    });
});
