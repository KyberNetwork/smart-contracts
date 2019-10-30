const BigNumber = web3.BigNumber

require("chai")
    .use(require("chai-as-promised"))
    .use(require('chai-bignumber')(BigNumber))
    .should()

const MockWeth = artifacts.require("./wethContracts/mockContracts/WETH9.sol");
const KyberWethReserve = artifacts.require("./wethContracts/KyberWethReserve");
const TestToken = artifacts.require("./mockContracts/TestToken.sol");

const Helper = require("./helper.js");

const ethAddress = '0x00eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const precision = new BigNumber(10).pow(18);

contract('KyberWethReserve', function (accounts) {

    const admin = accounts[0];
    const non_admin = accounts[1]
    const alerter = accounts[2];

    const amount = new BigNumber(10).pow(18).mul(3); // 3 eth
    const tweiSrcQty = new BigNumber(10).pow(18).mul(0.2); // 0.2 eth
    const expectedRate = precision;

    beforeEach('create contracts', async function () {
 
        wethToken = await MockWeth.new();
        anotherToken = await TestToken.new("my token", "tok", 18);

        // create reserve, use admin as network
        reserve = await KyberWethReserve.new(admin, wethToken.address, admin);

        // buy some weth to start with
        const initialBuyRate = await reserve.getConversionRate(ethAddress, wethToken.address, amount, 0);
        await reserve.trade(ethAddress, amount, wethToken.address, admin, initialBuyRate, true, {value: amount});

        // approve big quantity
        await wethToken.approve(reserve.address, amount.mul(1000));
    });

    describe('as admin', function () {
        it("check expected eth->weth rate", async function (){
            const buyRate = await reserve.getConversionRate(ethAddress, wethToken.address, amount, 0);
            buyRate.valueOf().should.equal(expectedRate.valueOf());
        });
        
        it("check wei lost after eth->weth trade", async function (){
            const buyRate = await reserve.getConversionRate(ethAddress, wethToken.address, amount, 0);
            const balanceBefore = await Helper.getBalancePromise(admin);

            const txInfo = await reserve.trade(ethAddress, amount, wethToken.address, admin, buyRate, true, {value: amount});
            const tx = await web3.eth.getTransaction(txInfo.tx);
            const gasCost = tx.gasPrice.mul(txInfo.receipt.gasUsed);

            const balanceAfter = await Helper.getBalancePromise(admin);
            const weiLost = balanceBefore.minus(balanceAfter)

            assert.equal(weiLost.valueOf(), amount.plus(gasCost).valueOf(), "wrong wei amount lost in the trade")
        });

        it("check wei lost after eth->weth trade", async function (){
            const buyRate = await reserve.getConversionRate(ethAddress, wethToken.address, amount, 0);
            const balanceBefore = await Helper.getBalancePromise(admin);

            const txInfo = await reserve.trade(ethAddress, amount, wethToken.address, admin, buyRate, true, {value: amount});
            const tx = await web3.eth.getTransaction(txInfo.tx);
            const gasCost = tx.gasPrice.mul(txInfo.receipt.gasUsed);

            const balanceAfter = await Helper.getBalancePromise(admin);
            const weiLost = balanceBefore.minus(balanceAfter)

            assert.equal(weiLost.valueOf(), amount.plus(gasCost).valueOf(), "wrong wei amount lost in the trade")
        });

        it("check twei gained after eth->weth trade", async function (){
            const buyRate = await reserve.getConversionRate(ethAddress, wethToken.address, amount, 0);
            const tweiBalanceBefore = await wethToken.balanceOf(admin);

            await reserve.trade(ethAddress, amount, wethToken.address, admin, buyRate, true, {value: amount});
            const tweiBalanceAfter = await wethToken.balanceOf(admin);
            const tWeiGained = tweiBalanceAfter.minus(tweiBalanceBefore)
            const expecetedTweiGained = new BigNumber(expectedRate).mul(amount).div(precision)

            assert.equal(tWeiGained.valueOf(), expecetedTweiGained.valueOf(), "wrong expected token wei gained")
        });

        it("check reserve did not gain tokens after eth->weth trade", async function (){
            const buyRate = await reserve.getConversionRate(ethAddress, wethToken.address, amount, 0);

            const reserveTweiBalanceBefore = await wethToken.balanceOf(reserve.address);
            await reserve.trade(ethAddress, amount, wethToken.address, admin, buyRate, true, {value: amount});

            const reserveTweiBalanceAfter = await wethToken.balanceOf(reserve.address);
            const reserveTweiGained = reserveTweiBalanceAfter.minus(reserveTweiBalanceBefore)

            assert.equal(reserveTweiGained.valueOf(), 0, "wrong token wei gained by reserve")
        });

        it("check reserve did not gain eth after eth->weth trade", async function (){
            const buyRate = await reserve.getConversionRate(ethAddress, wethToken.address, amount, 0);

            const reserveWeiBalanceBefore = await Helper.getBalancePromise(reserve.address);
            await reserve.trade(ethAddress, amount, wethToken.address, admin, buyRate, true, {value: amount});

            const reserveWeiBalanceAfter = await Helper.getBalancePromise(reserve.address);
            const reserveWeiGained = reserveWeiBalanceAfter.minus(reserveWeiBalanceBefore)

            assert.equal(reserveWeiGained.valueOf(), 0, "wrong token wei gained by reserve")
        });

        it("check expected weth->eth rate", async function (){
            const sellRate = await reserve.getConversionRate(wethToken.address, ethAddress, tweiSrcQty, 0);
            sellRate.valueOf().should.equal(expectedRate.valueOf());
        });

        it("check wei gained in weth->eth trade", async function (){
            const sellRate = await reserve.getConversionRate(wethToken.address, ethAddress, tweiSrcQty, 0);
            const balanceBefore = await Helper.getBalancePromise(admin);

            const txInfo = await reserve.trade(wethToken.address, tweiSrcQty, ethAddress, admin, sellRate, true);
            const tx = await web3.eth.getTransaction(txInfo.tx);
            const gasCost = tx.gasPrice.mul(txInfo.receipt.gasUsed);

            const balanceAfter = await Helper.getBalancePromise(admin);
            const weiGained = balanceAfter.minus(balanceBefore)
            const expecetedWeiGained = new BigNumber(tweiSrcQty).mul(expectedRate).div(precision)

            assert.equal(weiGained.valueOf(), expecetedWeiGained.minus(gasCost).valueOf(), "wrong expected wei gained");
        });

        it("check twei lost in weth->eth trade", async function (){
            const sellRate = await reserve.getConversionRate(wethToken.address, ethAddress, tweiSrcQty, 0);
            const tweiBalanceBefore = await wethToken.balanceOf(admin);

            await reserve.trade(wethToken.address, tweiSrcQty, ethAddress, admin, sellRate, true);
            const tweiBalanceAfter = await wethToken.balanceOf(admin);
            const tWeiLost = tweiBalanceBefore.minus(tweiBalanceAfter)

            assert.equal(tWeiLost.valueOf(), tweiSrcQty.valueOf(), "wrong expected token wei lost")
        });

        it("check reserve did not gain wei in a weth->eth trade", async function (){
            const sellRate = await reserve.getConversionRate(wethToken.address, ethAddress, tweiSrcQty, 0);

            const reserveBalanceBefore = await Helper.getBalancePromise(reserve.address);

            await reserve.trade(wethToken.address, tweiSrcQty, ethAddress, admin, sellRate, true);
            const reserveBalanceAfter = await Helper.getBalancePromise(reserve.address);
            const reserveWeiGained = reserveBalanceAfter.minus(reserveBalanceBefore)

            assert.equal(reserveWeiGained.valueOf(), 0, "wrong reserve wei gained in the trade");
        });

        it("check reserve did not gain tokens after eth->weth trade", async function (){
            const sellRate = await reserve.getConversionRate(wethToken.address, ethAddress, tweiSrcQty, 0);

            const reserveTweiBalanceBefore = await wethToken.balanceOf(reserve.address);
            await reserve.trade(wethToken.address, tweiSrcQty, ethAddress, admin, sellRate, true);

            const reserveTweiBalanceAfter = await wethToken.balanceOf(reserve.address);
            const reserveTweiGained = reserveTweiBalanceAfter.minus(reserveTweiBalanceBefore)

            assert.equal(reserveTweiGained.valueOf(), 0, "wrong token wei gained by reserve")
        });

        it("check eth->weth price for 0 quantity", async function (){
            const buyRate = await reserve.getConversionRate(ethAddress, wethToken.address, 0, 0);
            buyRate.valueOf().should.equal(expectedRate.valueOf());
        });

        it("check weth->eth price for 0 quantity", async function (){
            const sellRate = await reserve.getConversionRate(wethToken.address, ethAddress, 0, 0);
            sellRate.valueOf().should.equal(expectedRate.valueOf());
        });

        it("disable trades in the reserve and see that trade reverts", async function (){
            await reserve.addAlerter(alerter);
            await reserve.disableTrade({from: alerter});

            const buyRate = await reserve.getConversionRate(ethAddress, wethToken.address, amount, 0);
            await Helper.expectThrow(
                    reserve.trade(ethAddress, amount, wethToken.address, admin, buyRate, true, {value: amount})
            );

            await reserve.enableTrade();
        });

        it("change network to another address and see that trade fails since sender is not network", async function (){
            await reserve.setKyberNetwork(accounts[2]);
            const buyRate = await reserve.getConversionRate(ethAddress, wethToken.address, amount, 0);
            await Helper.expectThrow(
                    reserve.trade(ethAddress, amount, wethToken.address, admin, buyRate, true, {value: amount})
            );
        });

        it("see getconversionrate without weth fails", async function () {
            const buyRate = await reserve.getConversionRate(ethAddress, anotherToken.address, amount, 0);
            assert.equal(buyRate, 0);
        });

        it("see getconversionrate without eth fails", async function (){
            const buyRate = await reserve.getConversionRate(anotherToken.address, wethToken.address, amount, 0);
            assert.equal(buyRate, 0);
        });

        it("try to send eth to reserve and make sure default payable function throws", async function (){
            let weiSrcQty = new BigNumber(10).pow(18); // 1 eth

            // make sure can send to another account 
            Helper.sendEtherWithPromise(accounts[8], accounts[0], weiSrcQty)

            await Helper.expectThrow(Helper.sendEtherWithPromise(accounts[8], reserve.address, weiSrcQty));
        });
    });

    describe('as non admin', function () {
        const from = non_admin;
        it("check trade fails", async function (){
            const buyRate = await reserve.getConversionRate(ethAddress, wethToken.address, amount, 0);
            await Helper.expectThrow(
                reserve.trade(ethAddress, amount, wethToken.address, admin, buyRate, true, {value: amount}, {from})
            );
        });

        it("change network fails", async function (){
            await Helper.expectThrow(reserve.setKyberNetwork(accounts[2], {from}));
        });
    });

});
