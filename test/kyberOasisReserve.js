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
const mkrForEth1st = 3 //TODO - change to use fractions
const mkrForEth2nd = 4
const mkrForEth3rd = 5
const feePercent = 0.25;
const feeBps = feePercent * 100;
const alternativeFeePercent = 0.13;
const alternativeFeeBps = alternativeFeePercent * 100;
const otcOfferWeiValue =  BigNumber(3).mul(BigNumber(10).pow(18))
const minSrcAmount =  BigNumber(0.001).mul(BigNumber(10).pow(18))

let admin;
let myWethToken;
let myDaiToken;
let myMkrToken;
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
        myDaiToken = await TestToken.new("my dai token", "dai", 18);
        myMkrToken = await TestToken.new("my mkr token", "mkr", 18);

        // create mock otc.
        otc = await MockOtc.new(
                myWethToken.address,
                myDaiToken.address,
                myMkrToken.address,
                daisForEth,
                mkrForEth1st,
                mkrForEth2nd,
                mkrForEth3rd
        );

        // move eth to the otc
        oasisWeiInit = (new BigNumber(10)).pow(19); // 10 eth
        await Helper.sendEtherWithPromise(accounts[8], otc.address, oasisWeiInit);

        // move tokens to the otc
        supply = await myDaiToken.INITIAL_SUPPLY();
        await myDaiToken.transfer(otc.address, supply);

        supply = await myMkrToken.INITIAL_SUPPLY();
        await myMkrToken.transfer(otc.address, supply);

        // create reserve, use admin as network
        reserve = await KyberOasisReserve.new(
                admin,
                otc.address,
                myWethToken.address,
                admin,
                feeBps
        );

        await reserve.listToken(myDaiToken.address, minSrcAmount);
        await reserve.listToken(myMkrToken.address, minSrcAmount);

        // approve for reserve to claim tokens from admin
        supply = await myDaiToken.INITIAL_SUPPLY();
        myDaiToken.approve(reserve.address, supply);

        supply = await myMkrToken.INITIAL_SUPPLY();
        myMkrToken.approve(reserve.address, supply);

    });

    it("should do a eth->dai trade", async function (){

        // get conversion rate
        let weiSrcQty = new BigNumber(10).pow(18); // 1 eth
        let buyRate = await reserve.getConversionRate(ethAddress, myDaiToken.address, weiSrcQty, 0)
        let buyRateInTokenUnits = buyRate.div(precision)
        let expectedRate = valueAfterReducingFee(daisForEth, feePercent)
        assert.equal(buyRateInTokenUnits.valueOf(), expectedRate, "wrong rate")

        // buy
        let reserveTweiBalanceBefore = await myDaiToken.balanceOf(reserve.address);
        let balanceBefore = await Helper.getBalancePromise(admin);
        let tweiBalanceBefore = await myDaiToken.balanceOf(admin);

        let txInfo = await reserve.trade(ethAddress, weiSrcQty, myDaiToken.address, admin, buyRate, true, {value: weiSrcQty});
        let tx = await web3.eth.getTransaction(txInfo.tx);
        let gasCost = tx.gasPrice.mul(txInfo.receipt.gasUsed);

        let reserveTweiBalanceAfter = await myDaiToken.balanceOf(reserve.address);
        let balanceAfter = await Helper.getBalancePromise(admin);
        let tweiBalanceAfter = await myDaiToken.balanceOf(admin);

        let weiLost = balanceBefore.minus(balanceAfter)
        let tWeiGained = tweiBalanceAfter.minus(tweiBalanceBefore)
        let expecetedTweiGained = BigNumber(expectedRate).mul(weiSrcQty)
        let reserveTweiGained = reserveTweiBalanceAfter.minus(reserveTweiBalanceBefore)
        let expectedReserveTweiGained = weiSrcQty.mul(feePercent/100).mul(daisForEth)

        assert.equal(weiLost.valueOf(), weiSrcQty.plus(gasCost).valueOf(), "wrong wei amount lost in the trade")
        assert.equal(tWeiGained.valueOf(), expecetedTweiGained.valueOf(), "wrong expected token wei gained")
        assert.equal(reserveTweiGained.valueOf(), expectedReserveTweiGained.valueOf(), "wrong token wei gained by reserve")

    });

    it("should do a eth->mkr trade that takes 1st level", async function (){
        // get conversion rate
        let weiSrcQty = new BigNumber(10).pow(18); // 1 eth, should take 1st order (which buys 3 eth)
        let buyRate = await reserve.getConversionRate(ethAddress, myMkrToken.address, weiSrcQty, 0)
        let buyRateInTokenUnits = buyRate.div(precision)
        let expectedRate = valueAfterReducingFee(mkrForEth1st, feePercent)
        assert.equal(buyRateInTokenUnits.valueOf(), expectedRate, "wrong rate")

        // buy
        let reserveTweiBalanceBefore = await myMkrToken.balanceOf(reserve.address);
        let balanceBefore = await Helper.getBalancePromise(admin);
        let tweiBalanceBefore = await myMkrToken.balanceOf(admin);

        let txInfo = await reserve.trade(ethAddress, weiSrcQty, myMkrToken.address, admin, buyRate, true, {value: weiSrcQty});
        let tx = await web3.eth.getTransaction(txInfo.tx);
        let gasCost = tx.gasPrice.mul(txInfo.receipt.gasUsed);

        let reserveTweiBalanceAfter = await myMkrToken.balanceOf(reserve.address);
        let balanceAfter = await Helper.getBalancePromise(admin);
        let tweiBalanceAfter = await myMkrToken.balanceOf(admin);

        let weiLost = balanceBefore.minus(balanceAfter)
        let tWeiGained = tweiBalanceAfter.minus(tweiBalanceBefore)
        let expecetedTweiGained = BigNumber(expectedRate).mul(weiSrcQty)
        let reserveTweiGained = reserveTweiBalanceAfter.minus(reserveTweiBalanceBefore)
        let expectedReserveTweiGained = weiSrcQty.mul(feePercent/100).mul(mkrForEth1st)

        assert.equal(weiLost.valueOf(), weiSrcQty.plus(gasCost).valueOf(), "wrong wei amount lost in the trade")
        assert.equal(tWeiGained.valueOf(), expecetedTweiGained.valueOf(), "wrong expected token wei gained")
        assert.equal(reserveTweiGained.valueOf(), expectedReserveTweiGained.valueOf(), "wrong token wei gained by reserve")
    });

    it("should do a eth->mkr trade that takes 2nd level", async function (){
        // get conversion rate
        let weiSrcQty = ((new BigNumber(10)).pow(18)).mul(4); // 4 eth, should take 2nd order (which buys 6 eth)
        let buyRate = await reserve.getConversionRate(ethAddress, myMkrToken.address, weiSrcQty, 0)
        let buyRateInTokenUnits = buyRate.div(precision)
        let expectedRate = valueAfterReducingFee(mkrForEth2nd, feePercent)
        assert.equal(buyRateInTokenUnits.valueOf(), expectedRate, "wrong rate")

        // buy
        let reserveTweiBalanceBefore = await myMkrToken.balanceOf(reserve.address);
        let balanceBefore = await Helper.getBalancePromise(admin);
        let tweiBalanceBefore = await myMkrToken.balanceOf(admin);

        let txInfo = await reserve.trade(ethAddress, weiSrcQty, myMkrToken.address, admin, buyRate, true, {value: weiSrcQty});
        let tx = await web3.eth.getTransaction(txInfo.tx);
        let gasCost = tx.gasPrice.mul(txInfo.receipt.gasUsed);

        let reserveTweiBalanceAfter = await myMkrToken.balanceOf(reserve.address);
        let balanceAfter = await Helper.getBalancePromise(admin);
        let tweiBalanceAfter = await myMkrToken.balanceOf(admin);

        let weiLost = balanceBefore.minus(balanceAfter)
        let tWeiGained = tweiBalanceAfter.minus(tweiBalanceBefore)
        let expecetedTweiGained = BigNumber(expectedRate).mul(weiSrcQty)
        let reserveTweiGained = reserveTweiBalanceAfter.minus(reserveTweiBalanceBefore)
        let expectedReserveTweiGained = weiSrcQty.mul(feePercent/100).mul(mkrForEth2nd)

        assert.equal(weiLost.valueOf(), weiSrcQty.plus(gasCost).valueOf(), "wrong wei amount lost in the trade")
        assert.equal(tWeiGained.valueOf(), expecetedTweiGained.valueOf(), "wrong expected token wei gained")
        assert.equal(reserveTweiGained.valueOf(), expectedReserveTweiGained.valueOf(), "wrong token wei gained by reserve")
    });

    it("should do a eth->mkr trade that takes 3rd level", async function (){
        // get conversion rate
        let weiSrcQty = ((new BigNumber(10)).pow(18)).mul(7); // 7 eth, should take 3rd order (which buys 9 eth)
        let buyRate = await reserve.getConversionRate(ethAddress, myMkrToken.address, weiSrcQty, 0)
        let buyRateInTokenUnits = buyRate.div(precision)
        let expectedRate = valueAfterReducingFee(mkrForEth3rd, feePercent)
        assert.equal(buyRateInTokenUnits.valueOf(), expectedRate, "wrong rate")

        // buy
        let reserveTweiBalanceBefore = await myMkrToken.balanceOf(reserve.address);
        let balanceBefore = await Helper.getBalancePromise(admin);
        let tweiBalanceBefore = await myMkrToken.balanceOf(admin);

        let txInfo = await reserve.trade(ethAddress, weiSrcQty, myMkrToken.address, admin, buyRate, true, {value: weiSrcQty});
        let tx = await web3.eth.getTransaction(txInfo.tx);
        let gasCost = tx.gasPrice.mul(txInfo.receipt.gasUsed);

        let reserveTweiBalanceAfter = await myMkrToken.balanceOf(reserve.address);
        let balanceAfter = await Helper.getBalancePromise(admin);
        let tweiBalanceAfter = await myMkrToken.balanceOf(admin);

        let weiLost = balanceBefore.minus(balanceAfter)
        let tWeiGained = tweiBalanceAfter.minus(tweiBalanceBefore)
        let expecetedTweiGained = BigNumber(expectedRate).mul(weiSrcQty)
        let reserveTweiGained = reserveTweiBalanceAfter.minus(reserveTweiBalanceBefore)
        let expectedReserveTweiGained = weiSrcQty.mul(feePercent/100).mul(mkrForEth3rd)

        assert.equal(weiLost.valueOf(), weiSrcQty.plus(gasCost).valueOf(), "wrong wei amount lost in the trade")
        assert.equal(tWeiGained.valueOf(), expecetedTweiGained.valueOf(), "wrong expected token wei gained")
        assert.equal(reserveTweiGained.valueOf(), expectedReserveTweiGained.valueOf(), "wrong token wei gained by reserve")
    });

    it("should do a eth->mkr trade that takes more than 3rd level and verify we get 0 rate", async function (){
        let weiSrcQty = ((new BigNumber(10)).pow(18)).mul(9.01); // 9.01 eth, should not take last order (which buys 9 eth)
        let buyRate = await reserve.getConversionRate(ethAddress, myMkrToken.address, weiSrcQty, 0)
        assert.equal(buyRate.valueOf(), 0, "expected 0 rate")
    });

    it("should do a eth->mkr rate query with 0 src quantity and make sure we get non 0 rate", async function (){
        let weiSrcQty = new BigNumber(0);
        let buyRate = await reserve.getConversionRate(ethAddress, myMkrToken.address, weiSrcQty, 0)
        assert.notEqual(buyRate.valueOf(), 0, "expected 0 rate")
    });

    it("should do a eth->mkr rate query with very small src quantity and make sure we get non 0 rate", async function (){
        // get conversion rate
        let weiSrcQty = new BigNumber(0.1);
        let buyRate = await reserve.getConversionRate(ethAddress, myMkrToken.address, weiSrcQty, 0)
        assert.notEqual(buyRate.valueOf(), 0, "expected non 0 rate")
    });

    it("should do a dai->eth trade", async function (){

        let tweiSrcQty = await myDaiToken.balanceOf(admin); // sell all we have
        let sellRate = await reserve.getConversionRate(myDaiToken.address, ethAddress, tweiSrcQty, 0);

        let sellRateInTokenUnits = sellRate.div(precision)
        let expectedRate = valueAfterReducingFee(1 / daisForEth, feePercent)
        Helper.assertAbsDiff(sellRateInTokenUnits.valueOf(), expectedRate, allowedDiffInPercent, "wrong rate")

        // sell
        let reserveBalanceBefore = await Helper.getBalancePromise(reserve.address);
        let balanceBefore = await Helper.getBalancePromise(admin);
        let tweiBalanceBefore = await myDaiToken.balanceOf(admin);

        let txInfo = await reserve.trade(myDaiToken.address, tweiSrcQty, ethAddress, admin, sellRate, true);
        let tx = await web3.eth.getTransaction(txInfo.tx);
        let gasCost = tx.gasPrice.mul(txInfo.receipt.gasUsed);

        let reserveBalanceAfter = await Helper.getBalancePromise(reserve.address);
        let balanceAfter = await Helper.getBalancePromise(admin);
        let tweiBalanceAfter = await myDaiToken.balanceOf(admin);

        let weiGained = balanceAfter.minus(balanceBefore)
        let tWeiLost = tweiBalanceBefore.minus(tweiBalanceAfter)
        let expecetedWeiGained = BigNumber(tweiSrcQty).mul(expectedRate.toString())
        let reserveWeiGained = reserveBalanceAfter.minus(reserveBalanceBefore)
        let expectedReserveWeiGained = tweiSrcQty.mul(feePercent/100).div(daisForEth)

        Helper.assertAbsDiff(reserveWeiGained, expectedReserveWeiGained, allowedDiffInPercent, "wrong reserve wei gained in the trade")
        Helper.assertAbsDiff(weiGained, expecetedWeiGained.minus(gasCost), allowedDiffInPercent, "wrong expected wei gained");
        assert.deepEqual(tWeiLost, tweiSrcQty, "wrong expected token wei lost")
    });

    it("should do a mkr->eth trade that takes 1st level", async function (){

        let tweiSrcQty = ((new BigNumber(10)).pow(18)).mul(7); // 7 twei, should take 1st order (which buys 9 twei)
        let sellRate = await reserve.getConversionRate(myMkrToken.address, ethAddress, tweiSrcQty, 0);

        let sellRateInTokenUnits = sellRate.div(precision)
        let expectedRate = valueAfterReducingFee(1 / mkrForEth1st, feePercent)
        Helper.assertAbsDiff(sellRateInTokenUnits.valueOf(), expectedRate, allowedDiffInPercent, "wrong rate")

        // sell
        let reserveBalanceBefore = await Helper.getBalancePromise(reserve.address);
        let balanceBefore = await Helper.getBalancePromise(admin);
        let tweiBalanceBefore = await myMkrToken.balanceOf(admin);

        let txInfo = await reserve.trade(myMkrToken.address, tweiSrcQty, ethAddress, admin, sellRate, true);
        let tx = await web3.eth.getTransaction(txInfo.tx);
        let gasCost = tx.gasPrice.mul(txInfo.receipt.gasUsed);

        let reserveBalanceAfter = await Helper.getBalancePromise(reserve.address);
        let balanceAfter = await Helper.getBalancePromise(admin);
        let tweiBalanceAfter = await myMkrToken.balanceOf(admin);

        let weiGained = balanceAfter.minus(balanceBefore)
        let tWeiLost = tweiBalanceBefore.minus(tweiBalanceAfter)
        let expecetedWeiGained = BigNumber(tweiSrcQty).mul(expectedRate.toString())
        let reserveWeiGained = reserveBalanceAfter.minus(reserveBalanceBefore)
        let expectedReserveWeiGained = tweiSrcQty.mul(feePercent/100).div(mkrForEth1st)

        Helper.assertAbsDiff(reserveWeiGained, expectedReserveWeiGained, allowedDiffInPercent, "wrong reserve wei gained in the trade")
        Helper.assertAbsDiff(weiGained, expecetedWeiGained.minus(gasCost), allowedDiffInPercent, "wrong expected wei gained");
        assert.equal(tWeiLost.toString(), tweiSrcQty.toString(), "wrong expected token wei lost")
    });

    it("should do a mkr->eth trade that takes 2nd level", async function (){

        let tweiSrcQty = ((new BigNumber(10)).pow(18)).mul(10); // 10 twei, should take 2nd order (which buys 24 twei)
        let sellRate = await reserve.getConversionRate(myMkrToken.address, ethAddress, tweiSrcQty, 0);

        let sellRateInTokenUnits = sellRate.div(precision)
        let expectedRate = valueAfterReducingFee(1 / mkrForEth2nd, feePercent)
        Helper.assertAbsDiff(sellRateInTokenUnits.valueOf(), expectedRate, allowedDiffInPercent, "wrong rate")

        // sell
        let reserveBalanceBefore = await Helper.getBalancePromise(reserve.address);
        let balanceBefore = await Helper.getBalancePromise(admin);
        let tweiBalanceBefore = await myMkrToken.balanceOf(admin);

        let txInfo = await reserve.trade(myMkrToken.address, tweiSrcQty, ethAddress, admin, sellRate, true);
        let tx = await web3.eth.getTransaction(txInfo.tx);
        let gasCost = tx.gasPrice.mul(txInfo.receipt.gasUsed);

        let reserveBalanceAfter = await Helper.getBalancePromise(reserve.address);
        let balanceAfter = await Helper.getBalancePromise(admin);
        let tweiBalanceAfter = await myMkrToken.balanceOf(admin);

        let weiGained = balanceAfter.minus(balanceBefore)
        let tWeiLost = tweiBalanceBefore.minus(tweiBalanceAfter)
        let expecetedWeiGained = BigNumber(tweiSrcQty).mul(expectedRate.toString())
        let reserveWeiGained = reserveBalanceAfter.minus(reserveBalanceBefore)
        let expectedReserveWeiGained = tweiSrcQty.mul(feePercent/100).div(mkrForEth2nd)

        Helper.assertAbsDiff(reserveWeiGained, expectedReserveWeiGained, allowedDiffInPercent, "wrong reserve wei gained in the trade")
        Helper.assertAbsDiff(weiGained, expecetedWeiGained.minus(gasCost), allowedDiffInPercent, "wrong expected wei gained");
        assert.equal(tWeiLost.toString(), tweiSrcQty.toString(), "wrong expected token wei lost")
    });

    it("should do a mkr->eth trade that takes 3rd level", async function (){

        let tweiSrcQty = ((new BigNumber(10)).pow(18)).mul(35); // 35 twei, should take 3rd order (which buys 45 twei)
        let sellRate = await reserve.getConversionRate(myMkrToken.address, ethAddress, tweiSrcQty, 0);

        let sellRateInTokenUnits = sellRate.div(precision)
        let expectedRate = valueAfterReducingFee(1 / mkrForEth3rd, feePercent)
        Helper.assertAbsDiff(sellRateInTokenUnits.valueOf(), expectedRate, allowedDiffInPercent, "wrong rate")

        // sell
        let reserveBalanceBefore = await Helper.getBalancePromise(reserve.address);
        let balanceBefore = await Helper.getBalancePromise(admin);
        let tweiBalanceBefore = await myMkrToken.balanceOf(admin);

        let txInfo = await reserve.trade(myMkrToken.address, tweiSrcQty, ethAddress, admin, sellRate, true);
        let tx = await web3.eth.getTransaction(txInfo.tx);
        let gasCost = tx.gasPrice.mul(txInfo.receipt.gasUsed);

        let reserveBalanceAfter = await Helper.getBalancePromise(reserve.address);
        let balanceAfter = await Helper.getBalancePromise(admin);
        let tweiBalanceAfter = await myMkrToken.balanceOf(admin);

        let weiGained = balanceAfter.minus(balanceBefore)
        let tWeiLost = tweiBalanceBefore.minus(tweiBalanceAfter)
        let expecetedWeiGained = BigNumber(tweiSrcQty).mul(expectedRate.toString())
        let reserveWeiGained = reserveBalanceAfter.minus(reserveBalanceBefore)
        let expectedReserveWeiGained = tweiSrcQty.mul(feePercent/100).div(mkrForEth3rd)

        Helper.assertAbsDiff(reserveWeiGained, expectedReserveWeiGained, allowedDiffInPercent, "wrong reserve wei gained in the trade")
        Helper.assertAbsDiff(weiGained, expecetedWeiGained.minus(gasCost), allowedDiffInPercent, "wrong expected wei gained");
        assert.equal(tWeiLost.toString(), tweiSrcQty.toString(), "wrong expected token wei lost")
    });

    it("should do a mkr->eth trade that takes mored than 3rd level and make sure we get 0 rate", async function (){
        let tweiSrcQty = ((new BigNumber(10)).pow(18)).mul(45.2);
        let sellRate = await reserve.getConversionRate(myMkrToken.address, ethAddress, tweiSrcQty, 0);
        assert.equal(sellRate.toString(), 0, "expected 0 rate")
    });

    it("should do a mkr->eth trade with 0 src quantity and make sure we get non 0 rate", async function (){
        let tweiSrcQty = new BigNumber(0);
        let sellRate = await reserve.getConversionRate(myMkrToken.address, ethAddress, tweiSrcQty, 0);
        assert.notEqual(sellRate.toString(), 0, "expected 0 rate")
    });

    it("should do a mkr->eth trade with very small src quantity and make sure we get non 0 rate", async function (){
        let tweiSrcQty = new BigNumber(1);
        let sellRate = await reserve.getConversionRate(myMkrToken.address, ethAddress, tweiSrcQty, 0);
        assert.notEqual(sellRate.toString(), 0, "expected non 0 rate")
    });

    it("should disable trades in the reserve and see that getconversionrate reverts", async function (){

        let alerter = accounts[0]
        await reserve.addAlerter(alerter);
        await reserve.disableTrade();
        let weiSrcQty = new BigNumber(10).pow(18); // 1 eth
        let buyRate = await reserve.getConversionRate(ethAddress, myDaiToken.address, weiSrcQty, 0);

        try {
            let txInfo = await reserve.trade(ethAddress, weiSrcQty, myDaiToken.address, admin, buyRate, true, {value: weiSrcQty});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });
    it("should re-enable trades in the reserve and see that getconversionrate and trade does not revert", async function (){

        await reserve.enableTrade();
        let weiSrcQty = new BigNumber(10).pow(18); // 1 eth
        let buyRate = await reserve.getConversionRate(ethAddress, myDaiToken.address, weiSrcQty, 0);
        let txInfo = await reserve.trade(ethAddress, weiSrcQty, myDaiToken.address, admin, buyRate, true, {value: weiSrcQty});
    });
    it("should change network to another address and see that trade fails since sender is not network", async function (){

        await reserve.setKyberNetwork(accounts[2]);
        let weiSrcQty = new BigNumber(10).pow(18); // 1 eth
        let buyRate = await reserve.getConversionRate(ethAddress, myDaiToken.address, weiSrcQty, 0);
        try {
            let txInfo = await reserve.trade(ethAddress, weiSrcQty, myDaiToken.address, admin, buyRate, true, {value: weiSrcQty});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });
    it("should return network admin address and see that trade does not revert", async function (){

        await reserve.setKyberNetwork(admin);
        let weiSrcQty = new BigNumber(10).pow(18); // 1 eth
        let buyRate = await reserve.getConversionRate(ethAddress, myDaiToken.address, weiSrcQty, 0);
        let txInfo = await reserve.trade(ethAddress, weiSrcQty, myDaiToken.address, admin, buyRate, true, {value: weiSrcQty});
    });
    it("should set fee to another value and make sure getconversionrate and trade pass", async function (){

        await reserve.setFeeBps(alternativeFeeBps);
        // get conversion rate
        let weiSrcQty = new BigNumber(10).pow(18); // 1 eth
        let buyRate = await reserve.getConversionRate(ethAddress, myDaiToken.address, weiSrcQty, 0)
        let buyRateInTokenUnits = buyRate.div(precision)
        let expectedRate = valueAfterReducingFee(daisForEth, alternativeFeePercent)
        assert.equal(buyRateInTokenUnits.valueOf(), expectedRate, "wrong rate")

        // buy
        let reserveTweiBalanceBefore = await myDaiToken.balanceOf(reserve.address);
        let balanceBefore = await Helper.getBalancePromise(admin);
        let tweiBalanceBefore = await myDaiToken.balanceOf(admin);

        let txInfo = await reserve.trade(ethAddress, weiSrcQty, myDaiToken.address, admin, buyRate, true, {value: weiSrcQty});
        let tx = await web3.eth.getTransaction(txInfo.tx);
        let gasCost = tx.gasPrice.mul(txInfo.receipt.gasUsed);

        let reserveTweiBalanceAfter = await myDaiToken.balanceOf(reserve.address);
        let balanceAfter = await Helper.getBalancePromise(admin);
        let tweiBalanceAfter = await myDaiToken.balanceOf(admin);

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
        let zeroSellRate = await reserve.getConversionRate(myDaiToken.address, ethAddress, zeroTweiSrcQty, 0);

        let oneTweiSrcQty = BigNumber(10).pow(18); // 1 token.
        let oneSellRate = await reserve.getConversionRate(myDaiToken.address, ethAddress, oneTweiSrcQty, 0);

        assert.equal(zeroSellRate.valueOf(), oneSellRate.valueOf(), "sell rates for 0 and 1 token are not equal.");
    });
    it("should delist a token and see that we get 0 rate on it", async function (){
        await reserve.delistToken(myDaiToken.address, {from: admin});

        let weiSrcQty = new BigNumber(10).pow(18);
        let buyRate = await reserve.getConversionRate(ethAddress, myDaiToken.address, weiSrcQty, 0);
        assert.equal(buyRate, 0, "buy rate should be 0");

        // list back and see rate is not 0
        await reserve.listToken(myDaiToken.address, minSrcAmount, {from: admin});
        buyRate = await reserve.getConversionRate(ethAddress, myDaiToken.address, weiSrcQty, 0);
        assert.notEqual(buyRate, 0, "buy rate should not be 0");
    });
    it("should try getconversionrate for a token other than trade token and see it reverts", async function (){
        let otherToken = await TestToken.new("other token", "oth", 18);
        
        let weiSrcQty = new BigNumber(10).pow(18); // 1 eth
        let buyRate = await reserve.getConversionRate(ethAddress, otherToken.address, weiSrcQty, 0);
        try {
            let txInfo = await reserve.trade(ethAddress, weiSrcQty, myDaiToken.address, admin, buyRate, true, {value: weiSrcQty});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });
    it("should try getconversionrate for without eth as src or dest and see it reverts", async function (){

        let weiSrcQty = new BigNumber(10).pow(18); // 1 token
        let buyRate = await reserve.getConversionRate(myDaiToken.address, myDaiToken.address, weiSrcQty, 0);
        try {
            let txInfo = await reserve.trade(ethAddress, weiSrcQty, myDaiToken.address, admin, buyRate, true, {value: weiSrcQty});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });
    it("should try getconversionrate without eth as src or dest and see it reverts", async function (){

        let weiSrcQty = new BigNumber(10).pow(18); // 1 token
        let buyRate = await reserve.getConversionRate(myDaiToken.address, myDaiToken.address, weiSrcQty, 0);
        try {
            let txInfo = await reserve.trade(ethAddress, weiSrcQty, myDaiToken.address, admin, buyRate, true, {value: weiSrcQty});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });
    it("should try trade but send src amount than specified", async function (){

        let weiSrcQty = new BigNumber(10).pow(18); // 1 token
        let halfWeiSrcQty = BigNumber(0.5).mul(BigNumber(10).pow(18));
        let buyRate = await reserve.getConversionRate(ethAddress, myDaiToken.address, weiSrcQty, 0);

        try {
            let txInfo = await reserve.trade(ethAddress, weiSrcQty, myDaiToken.address, admin, buyRate, true, {value: halfWeiSrcQty});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        // make sure it does not revert when sending full amount
        let txInfo = await reserve.trade(ethAddress, weiSrcQty, myDaiToken.address, admin, buyRate, true, {value: weiSrcQty});
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
        let buyRate = await reserve.getConversionRate(ethAddress, myDaiToken.address, weiSrcQty, 0);

        try {
            let txInfo = await reserve.trade(ethAddress, weiSrcQty, myDaiToken.address, admin, buyRate, true, {value: weiSrcQty, from: accounts[3]});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        // make sure it does not revert when sending from network (admin)
        let txInfo = await reserve.trade(ethAddress, weiSrcQty, myDaiToken.address, admin, buyRate, true, {value: weiSrcQty, from: admin});
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
    it("should try to list a token without being admin", async function (){
        let otherToken = await TestToken.new("other token", "oth", 18);

        try {
            await reserve.listToken(otherToken.address, minSrcAmount, {from: accounts[2]});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        // make sure it does not revert when doing it as admin)
        await reserve.listToken(otherToken.address, minSrcAmount, {from: admin});
        await reserve.delistToken(otherToken.address, {from: admin});
    });
    it("should try to delist a token without being admin", async function (){
        let otherToken = await TestToken.new("other token", "oth", 18);
        await reserve.listToken(otherToken.address, minSrcAmount, {from: admin});

        try {
            await reserve.delistToken(otherToken.address, {from: accounts[2]});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        // make sure it does not revert when doing it as admin)
        await reserve.delistToken(otherToken.address, {from: admin});
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
    it("verify that cannot get buy rate when exceeding order book first level", async function (){

        let buyRate = await reserve.getConversionRate(ethAddress, myDaiToken.address, otcOfferWeiValue, 0);
        assert.notEqual(buyRate, 0, "buy rate should not be 0");

        let exceedingOtcOfferWeiValue =  otcOfferWeiValue.mul(1.1);
        buyRate = await reserve.getConversionRate(ethAddress, myDaiToken.address, exceedingOtcOfferWeiValue, 0);
        assert.equal(buyRate, 0, "buy rate should be 0");
    });
    it("verify that cannot get sell rate when exceeding order book first level", async function (){

        let otcOfferTweiValue = otcOfferWeiValue.mul(daisForEth)
        let sellRate = await reserve.getConversionRate(myDaiToken.address, ethAddress, otcOfferTweiValue, 0);
        assert.notEqual(sellRate, 0, "sell rate should not be 0");

        let exceedingOtcOfferTweiValue =  otcOfferTweiValue.mul(1.1);
        sellRate = await reserve.getConversionRate(myDaiToken.address, ethAddress, exceedingOtcOfferTweiValue, 0);
        assert.equal(sellRate, 0, "sell rate should be 0");
    });
});
