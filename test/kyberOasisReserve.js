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

// hybrid params
const minDaiBalnace  = BigNumber(1000).mul(BigNumber(10).pow(18))
const maxDaiBalnace  = BigNumber(10000).mul(BigNumber(10).pow(18))
const initDaiBalance = BigNumber(5000).mul(BigNumber(10).pow(18))
const minSpreadInBps = 70;
const permiumBps     = 10;


let admin;
let myWethToken;
let myDaiToken;
let myMkrToken;
let otc;
let oasisDirectProxy;
let oasisWeiInit;
let supply;
let reserve;

let otcForHybrid;
let hybridReserve;
let operator;

function valueAfterReducingFee(val, feePercent) {
    return val * (100-feePercent)/100;
}

function valueAfterAddingPremium(val, premiumPercent) {
    return (val.mul(100+premiumPercent)).div(100);
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
        await myDaiToken.approve(reserve.address, supply);

        supply = await myMkrToken.INITIAL_SUPPLY();
        await myMkrToken.approve(reserve.address, supply);

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

    it("should init hybrid reserve", async function (){
        // use admin address as network
        admin = accounts[0];
        operator = accounts[1];

        // create test tokens.
        myWethToken = await WethToken.new("my weth token", "weth", 18);
        myDaiToken = await TestToken.new("my dai token", "dai", 18);
        myMkrToken = await TestToken.new("my mkr token", "mkr", 18);

        // create mock otc.
        otcForHybrid = await MockOtc.new(
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
        await Helper.sendEtherWithPromise(accounts[8], otcForHybrid.address, oasisWeiInit);

        // move tokens to the otc
        supply = await myDaiToken.INITIAL_SUPPLY();
        await myDaiToken.transfer(otcForHybrid.address, supply.div(2));

        supply = await myMkrToken.INITIAL_SUPPLY();
        await myMkrToken.transfer(otcForHybrid.address, supply);

        await otcForHybrid.setFirstLevelDaiPrices(500, 400);

        // create reserve, use admin as network
        hybridReserve = await KyberOasisReserve.new(
                admin,
                otcForHybrid.address,
                myWethToken.address,
                admin,
                feeBps
        );

        await hybridReserve.listToken(myDaiToken.address, minSrcAmount);
        await hybridReserve.listToken(myMkrToken.address, minSrcAmount);
        await hybridReserve.addOperator(operator, {from:admin})
        await hybridReserve.setInternalPriceAdminParams(myDaiToken.address,
                                                        minSpreadInBps,
                                                        permiumBps,
                                                        {from: admin});
        await hybridReserve.setInternalInventoryMinMax(myDaiToken.address,
                                                       minDaiBalnace,
                                                       maxDaiBalnace,
                                                       {from:operator})

        // approve for reserve to claim tokens from admin
        supply = await myDaiToken.INITIAL_SUPPLY();
        await myDaiToken.approve(hybridReserve.address, supply);

        supply = await myMkrToken.INITIAL_SUPPLY();
        await myMkrToken.approve(hybridReserve.address, supply);
        // move eth and dai to the reserve
        oasisWeiInit = (new BigNumber(10)).pow(19); // 10 eth
        await Helper.sendEtherWithPromise(accounts[7], hybridReserve.address, oasisWeiInit);
        await myDaiToken.transfer(hybridReserve.address, initDaiBalance)
    });

    it("check that can buy and sell from internal inventory", async function (){
        const canBuy = await hybridReserve.shouldUseInternalInventory(myDaiToken.address,
                                                                BigNumber(100),
                                                                BigNumber(100),
                                                                true);
        assert(canBuy, "cannot buy from hybrid");

        const canSell = await hybridReserve.shouldUseInternalInventory(myDaiToken.address,
                                                                 100,
                                                                 100,
                                                                 false);
        assert(canBuy, "cannot sell from hybrid");
    });

    it("check conversion rates from internal inventory", async function (){
        const wethToDai = await hybridReserve.getConversionRate(ethAddress,
                                                                myDaiToken.address,
                                                                BigNumber(10).pow(18),
                                                                0);

        assert.equal(wethToDai.valueOf(), valueAfterAddingPremium(BigNumber(400).mul(10**18),permiumBps/100).valueOf(),
                     "unexpected eth to dai rate")


        const daiToWeth = await hybridReserve.getConversionRate(myDaiToken.address,
                                                                ethAddress,
                                                                BigNumber(10).pow(18),
                                                                0);

        assert.equal(daiToWeth.valueOf(), valueAfterAddingPremium(BigNumber(1/500).mul(10**18),permiumBps/100).valueOf(),
                     "unexpected dai to eth rate")
    });

    it("do buy from internal inventory", async function (){
        const user = accounts[0];
        const daiUserBalanceBeforeBuy = await myDaiToken.balanceOf(user);
        const reserveDaiBalanceBeforeBuy = await myDaiToken.balanceOf(hybridReserve.address);
        const otcDaiBalanceBeforeBuy = await myDaiToken.balanceOf(otcForHybrid.address);
        const reserveEthBalanceBeforeBuy = await Helper.getBalancePromise(hybridReserve.address);
        const otcEthBalanceBeforeBuy = await myWethToken.balanceOf(otcForHybrid.address);

        await hybridReserve.trade(ethAddress,BigNumber(10).pow(18),myDaiToken.address,
                                  user, BigNumber(400).mul(10**18), true,
                                  {from:admin,value:BigNumber(10).pow(18)});

        const daiUserBalanceAfterBuy = await myDaiToken.balanceOf(user);
        const reserveDaiBalanceAfterBuy = await myDaiToken.balanceOf(hybridReserve.address);
        const otcDaiBalanceAfterBuy = await myDaiToken.balanceOf(otcForHybrid.address);
        const reserveEthBalanceAfterBuy = await Helper.getBalancePromise(hybridReserve.address);
        const otcEthBalanceAfterBuy = await myWethToken.balanceOf(otcForHybrid.address);

        const expectedDaiDelta = BigNumber(400).mul(10**18);
        const expectedEthDelta = BigNumber(10).pow(18);

        assert.equal(daiUserBalanceBeforeBuy.add(expectedDaiDelta).valueOf(),
                     daiUserBalanceAfterBuy.valueOf(),
                     "unexpected change in user dai balance");

        assert.equal(reserveDaiBalanceBeforeBuy.valueOf(),
                     reserveDaiBalanceAfterBuy.add(expectedDaiDelta).valueOf(),
                     "unexpected change in reserve dai balance");

        assert.equal(otcDaiBalanceBeforeBuy.valueOf(),
                     otcDaiBalanceAfterBuy.valueOf(),
                     "otc dai balance is not expected to change");

        assert.equal(reserveEthBalanceBeforeBuy.add(expectedEthDelta).valueOf(),
                     reserveEthBalanceAfterBuy.valueOf(),
                                  "unexpected change in reserve eth balance");

        assert.equal(otcEthBalanceBeforeBuy.valueOf(),
                     otcEthBalanceAfterBuy.valueOf(),
                     "otc eth balance is not expected to change");

    });

    it("do sell to internal inventory", async function (){
        const user = accounts[7];
        const ethUserBalanceBeforeSell = await Helper.getBalancePromise(user);
        const reserveDaiBalanceBeforeSell = await myDaiToken.balanceOf(hybridReserve.address);
        const otcDaiBalanceBeforeSell = await myDaiToken.balanceOf(otcForHybrid.address);
        const reserveEthBalanceBeforeSell = await Helper.getBalancePromise(hybridReserve.address);
        const otcEthBalanceBeforeSell = await myWethToken.balanceOf(otcForHybrid.address);

        await hybridReserve.trade(myDaiToken.address,BigNumber(10).pow(18),ethAddress,
                                  user, BigNumber(1/500).mul(10**18), true,
                                  {from:admin});

        const ethUserBalanceAfterSell = await Helper.getBalancePromise(user);
        const reserveDaiBalanceAfterSell = await myDaiToken.balanceOf(hybridReserve.address);
        const otcDaiBalanceAfterSell = await myDaiToken.balanceOf(otcForHybrid.address);
        const reserveEthBalanceAfterSell = await Helper.getBalancePromise(hybridReserve.address);
        const otcEthBalanceAfterSell = await myWethToken.balanceOf(otcForHybrid.address);

        const expectedDaiDelta = BigNumber(10).pow(18);
        const expectedEthDelta = BigNumber(1/500).mul(10**18);


        assert.equal(ethUserBalanceBeforeSell.add(expectedEthDelta).valueOf(),
                     ethUserBalanceAfterSell.valueOf(),
                     "unexpected change in user eth balance");

        assert.equal(reserveDaiBalanceBeforeSell.add(expectedDaiDelta).valueOf(),
                     reserveDaiBalanceAfterSell.valueOf(),
                     "unexpected change in reserve dai balance");

        assert.equal(otcDaiBalanceBeforeSell.valueOf(),
                     otcDaiBalanceAfterSell.valueOf(),
                     "otc dai balance is not expected to change");

        assert.equal(reserveEthBalanceBeforeSell.valueOf(),
                     reserveEthBalanceAfterSell.add(expectedEthDelta).valueOf(),
                     "unexpected change in reserve eth balance");

        assert.equal(otcEthBalanceBeforeSell.valueOf(),
                     otcEthBalanceAfterSell.valueOf(),
                     "otc eth balance is not expected to change");

    });

    it("check that cannot buy from internal inventory when amt exceed balance", async function (){
        const reserveTokenBalance = await myDaiToken.balanceOf(hybridReserve.address);
        const tooManyTokens = reserveTokenBalance.add(1);
        const canBuy = await hybridReserve.shouldUseInternalInventory(myDaiToken.address,
                                                                tooManyTokens,
                                                                BigNumber(100),
                                                                true);
        assert(!canBuy, "can buy from hybrid when there is not enough amount");
    });

    it("check that cannot buy from internal inventory when exceed min dai balance", async function (){
        const reserveTokenBalance = await myDaiToken.balanceOf(hybridReserve.address);
        const tooManyTokens = (reserveTokenBalance.minus(minDaiBalnace)).add(1);
        const canBuy = await hybridReserve.shouldUseInternalInventory(myDaiToken.address,
                                                                tooManyTokens,
                                                                BigNumber(100),
                                                                true);
        assert(!canBuy, "can buy from hybrid when there expecting to go under min amount");
    });

    it("check that cannot sell to internal inventory when amt exceed balance", async function (){
        const reserveEthBalance = await Helper.getBalancePromise(hybridReserve.address);
        const tooManyEth = reserveEthBalance.add(1);
        const canSell = await hybridReserve.shouldUseInternalInventory(myDaiToken.address,
                                                                BigNumber(100),
                                                                tooManyEth,
                                                                false);
        assert(!canSell, "can buy sell to hybrid when there is not enough eth");
    });

    it("check that cannot sell to internal inventory when exceed max dai balance", async function (){
        const reserveTokenBalance = await myDaiToken.balanceOf(hybridReserve.address);
        const tooManyTokens = maxDaiBalnace.minus(reserveTokenBalance).add(1);
        const canBuy = await hybridReserve.shouldUseInternalInventory(myDaiToken.address,
                                                                tooManyTokens,
                                                                BigNumber(100),
                                                                false);
        assert(!canBuy, "can sell to hybrid when there expecting to go over max amount");
    });

    it("check that cannot buy or sell with internal inventory when there is price arbitrage", async function (){
        await otcForHybrid.setFirstLevelDaiPrices(400, 500);

        const canBuy = await hybridReserve.shouldUseInternalInventory(myDaiToken.address,
                                                                BigNumber(100),
                                                                BigNumber(100),
                                                                true);
        assert(!canBuy, "can buy from hybrid when there is price arbitrage");

        const canSell = await hybridReserve.shouldUseInternalInventory(myDaiToken.address,
                                                                BigNumber(100),
                                                                BigNumber(100),
                                                                false);
        assert(!canBuy, "can sell from hybrid when there is price arbitrage");
    });

    it("check that cannot buy or sell with internal inventory when there is small spread", async function (){
        await otcForHybrid.setFirstLevelDaiPrices(2000, 1999);

        const canBuy = await hybridReserve.shouldUseInternalInventory(myDaiToken.address,
                                                                BigNumber(100),
                                                                BigNumber(100),
                                                                true);
        assert(!canBuy, "can buy from hybrid when there is small spread");

        const canSell = await hybridReserve.shouldUseInternalInventory(myDaiToken.address,
                                                                BigNumber(100),
                                                                BigNumber(100),
                                                                false);
        assert(!canBuy, "can sell from hybrid when there is small spread");
    });

    it("do buy from otc inventory", async function (){
        const expectedConversionRate = ((BigNumber(1999).mul(100 - feePercent)).div(100)).mul(10**18);
        const conversionRate = await hybridReserve.getConversionRate(ethAddress,
                                                                     myDaiToken.address,
                                                                     BigNumber(10).pow(18),
                                                                     0);
        assert.equal(expectedConversionRate.valueOf(), conversionRate.valueOf(),
                     "unexpected conversionRate")

        const user = accounts[0];
        const daiUserBalanceBeforeBuy = await myDaiToken.balanceOf(user);
        const reserveDaiBalanceBeforeBuy = await myDaiToken.balanceOf(hybridReserve.address);
        const otcDaiBalanceBeforeBuy = await myDaiToken.balanceOf(otcForHybrid.address);
        const reserveEthBalanceBeforeBuy = await Helper.getBalancePromise(hybridReserve.address);
        const otcEthBalanceBeforeBuy = await myWethToken.balanceOf(otcForHybrid.address);

        await hybridReserve.trade(ethAddress,BigNumber(10).pow(18),myDaiToken.address,
                                  user, expectedConversionRate, true,
                                  {from:admin,value:BigNumber(10).pow(18)});

        const daiUserBalanceAfterBuy = await myDaiToken.balanceOf(user);
        const reserveDaiBalanceAfterBuy = await myDaiToken.balanceOf(hybridReserve.address);
        const otcDaiBalanceAfterBuy = await myDaiToken.balanceOf(otcForHybrid.address);
        const reserveEthBalanceAfterBuy = await Helper.getBalancePromise(hybridReserve.address);
        const otcEthBalanceAfterBuy = await myWethToken.balanceOf(otcForHybrid.address);

        const expectedDaiDelta = expectedConversionRate;
        const expectedDaiDeltaInReserve = (BigNumber(1999).mul(10**18)).minus(expectedDaiDelta);
        const expectedEthDelta = BigNumber(10).pow(18);

        assert.equal(daiUserBalanceBeforeBuy.add(expectedDaiDelta).valueOf(),
                     daiUserBalanceAfterBuy.valueOf(),
                     "unexpected change in user dai balance");

        assert.equal(reserveDaiBalanceBeforeBuy.add(expectedDaiDeltaInReserve).valueOf(),
                     reserveDaiBalanceAfterBuy.valueOf(),
                     "unexpected change in reserve dai balance");

        assert.equal(otcDaiBalanceBeforeBuy.valueOf(),
                     otcDaiBalanceAfterBuy.add(BigNumber(1999).mul(10**18)).valueOf(),
                     "otc dai balance is not expected to change");

        assert.equal(reserveEthBalanceBeforeBuy.valueOf(),
                     reserveEthBalanceAfterBuy.valueOf(),
                                  "unexpected change in reserve eth balance");

        assert.equal(otcEthBalanceBeforeBuy.add(expectedEthDelta).valueOf(),
                     otcEthBalanceAfterBuy.valueOf(),
                     "otc eth balance is not expected to change");

    });

    it("do sell to internal inventory", async function (){
      const expectedConversionRate = ((BigNumber(1/2000).mul(100 - feePercent)).div(100)).mul(10**18);
      const conversionRate = await hybridReserve.getConversionRate(myDaiToken.address,
                                                                   ethAddress,
                                                                   BigNumber(10).pow(18),
                                                                   0);
      assert.equal(expectedConversionRate.valueOf(), conversionRate.valueOf(),
                   "unexpected conversionRate")


        const user = accounts[7];
        const ethUserBalanceBeforeSell = await Helper.getBalancePromise(user);
        const reserveDaiBalanceBeforeSell = await myDaiToken.balanceOf(hybridReserve.address);
        const otcDaiBalanceBeforeSell = await myDaiToken.balanceOf(otcForHybrid.address);
        const reserveEthBalanceBeforeSell = await Helper.getBalancePromise(hybridReserve.address);
        const otcEthBalanceBeforeSell = await myWethToken.balanceOf(otcForHybrid.address);

        await hybridReserve.trade(myDaiToken.address,BigNumber(10).pow(18),ethAddress,
                                  user, expectedConversionRate, true,
                                  {from:admin});

        const ethUserBalanceAfterSell = await Helper.getBalancePromise(user);
        const reserveDaiBalanceAfterSell = await myDaiToken.balanceOf(hybridReserve.address);
        const otcDaiBalanceAfterSell = await myDaiToken.balanceOf(otcForHybrid.address);
        const reserveEthBalanceAfterSell = await Helper.getBalancePromise(hybridReserve.address);
        const otcEthBalanceAfterSell = await myWethToken.balanceOf(otcForHybrid.address);

        const expectedDaiDelta = BigNumber(10).pow(18);
        const expectedEthDelta = expectedConversionRate;
        const expectedReserveEthDelta = (BigNumber(1/2000).mul(10**18)).minus(expectedEthDelta);


        assert.equal(ethUserBalanceBeforeSell.add(expectedEthDelta).valueOf(),
                     ethUserBalanceAfterSell.valueOf(),
                     "unexpected change in user eth balance");

        assert.equal(reserveDaiBalanceBeforeSell.valueOf(),
                     reserveDaiBalanceAfterSell.valueOf(),
                     "unexpected change in reserve dai balance");

        assert.equal(otcDaiBalanceBeforeSell.add(expectedDaiDelta).valueOf(),
                     otcDaiBalanceAfterSell.valueOf(),
                     "otc dai balance is not expected to change");

        assert.equal(reserveEthBalanceBeforeSell.add(expectedReserveEthDelta).valueOf(),
                     reserveEthBalanceAfterSell.valueOf(),
                     "unexpected change in reserve eth balance");

        assert.equal(otcEthBalanceBeforeSell.valueOf(),
                     otcEthBalanceAfterSell.add(BigNumber(1/2000).mul(10**18)).valueOf(),
                     "otc eth balance is not expected to change");
    });

    it("check setInternalPriceAdminParams from non admin", async function (){
        try {
            await hybridReserve.setInternalPriceAdminParams(myDaiToken.address,
                                                            0,
                                                            0,
                                                            {from:operator});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("check setInternalPriceAdminParams for non listed token", async function (){
        try {
            await hybridReserve.setInternalPriceAdminParams(admin,
                                                            0,
                                                            0,
                                                            {from:admin});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("check setInternalPriceAdminParams for too high premium", async function (){
        try {
            await hybridReserve.setInternalPriceAdminParams(myDaiToken.address,
                                                            0,
                                                            501,
                                                            {from:admin});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("check setInternalPriceAdminParams for too high min spread", async function (){
        try {
            await hybridReserve.setInternalPriceAdminParams(myDaiToken.address,
                                                            1001,
                                                            0,
                                                            {from:admin});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("check setInternalInventoryMinMax from non operator", async function (){
        try {
            await hybridReserve.setInternalInventoryMinMax(myDaiToken.address,
                                                           0,
                                                           0,
                                                           {from:admin});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("check setInternalInventoryMinMax for non listed token", async function (){
        try {
            await hybridReserve.setInternalInventoryMinMax(admin,
                                                           0,
                                                           0,
                                                           {from:operator});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });


});
