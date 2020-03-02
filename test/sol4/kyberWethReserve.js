const BN = web3.utils.BN;

const MockWeth = artifacts.require("./wethContracts/mockContracts/WETH9.sol");
const KyberWethReserve = artifacts.require("./wethContracts/KyberWethReserve");
const TestToken = artifacts.require("./mockContracts/TestToken.sol");

const Helper = require("../helper.js");

const ethAddress = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
const zeroAddress = '0x0000000000000000000000000000000000000000';
const zeroBN = new BN(0);
const precision = new BN(10).pow(new BN(18));
const eth1 = new BN(10).pow(new BN(18));

contract('KyberWethReserve', function (accounts) {

    const admin = accounts[0];
    const non_admin = accounts[1]
    const alerter = accounts[2];

    const amount3Eth = precision.mul(new BN(3)); // 3 eth
    const tweiSrcQty = eth1.div(new BN(5)); // 0.2 eth
    const expectedRate = precision;

    beforeEach('create contracts', async function () {
 
        wethToken = await MockWeth.new();
        anotherToken = await TestToken.new("my token", "tok", 18);

        // create reserve, use admin as network
        reserve = await KyberWethReserve.new(admin, wethToken.address, admin);

        // buy some weth to start with
        const initialBuyRate = await reserve.getConversionRate(ethAddress, wethToken.address, amount3Eth, 0);
        await reserve.trade(ethAddress, amount3Eth, wethToken.address, admin, initialBuyRate, true, {value: amount3Eth});

        // approve big quantity
        await wethToken.approve(reserve.address, amount3Eth.mul(new BN(1000)));
    });

    describe('as admin', function () {
        it("check expected eth->weth rate", async function (){
            const buyRate = await reserve.getConversionRate(ethAddress, wethToken.address, amount3Eth, 0);
            Helper.assertEqual(buyRate, expectedRate);
        });
        
        it("check wei lost after eth->weth trade", async function (){
            const buyRate = await reserve.getConversionRate(ethAddress, wethToken.address, amount3Eth, 0);
            const balanceBefore = await Helper.getBalancePromise(admin);

            const txInfo = await reserve.trade(ethAddress, amount3Eth, wethToken.address, admin, buyRate, true, {value: amount3Eth});
            const gasCost = await calcGasCost(txInfo);

            const balanceAfter = await Helper.getBalancePromise(admin);
            const weiLost = balanceBefore.sub(balanceAfter)

            Helper.assertEqual(weiLost, amount3Eth.add(gasCost), "wrong wei amount lost in the trade")
        });

        it("check wei lost after eth->weth trade", async function (){
            const buyRate = await reserve.getConversionRate(ethAddress, wethToken.address, amount3Eth, 0);
            const balanceBefore = await Helper.getBalancePromise(admin);

            const txInfo = await reserve.trade(ethAddress, amount3Eth, wethToken.address, admin, buyRate, true, {value: amount3Eth});
            const gasCost = await calcGasCost(txInfo);

            const balanceAfter = await Helper.getBalancePromise(admin);
            const weiLost = balanceBefore.sub(balanceAfter)

            Helper.assertEqual(weiLost, amount3Eth.add(gasCost), "wrong wei amount3Eth lost in the trade")
        });

        it("check twei gained after eth->weth trade", async function (){
            const buyRate = await reserve.getConversionRate(ethAddress, wethToken.address, amount3Eth, 0);
            const tweiBalanceBefore = await wethToken.balanceOf(admin);

            await reserve.trade(ethAddress, amount3Eth, wethToken.address, admin, buyRate, true, {value: amount3Eth});
            const tweiBalanceAfter = await wethToken.balanceOf(admin);
            const tWeiGained = tweiBalanceAfter.sub(tweiBalanceBefore)
            const expecetedTweiGained = (new BN(expectedRate)).mul(amount3Eth).div(precision)

            Helper.assertEqual(tWeiGained, expecetedTweiGained, "wrong expected token wei gained")
        });

        it("check reserve did not gain tokens after eth->weth trade", async function (){
            const buyRate = await reserve.getConversionRate(ethAddress, wethToken.address, amount3Eth, 0);

            const reserveTweiBalanceBefore = await wethToken.balanceOf(reserve.address);
            await reserve.trade(ethAddress, amount3Eth, wethToken.address, admin, buyRate, true, {value: amount3Eth});

            const reserveTweiBalanceAfter = await wethToken.balanceOf(reserve.address);
            const reserveTweiGained = reserveTweiBalanceAfter.sub(reserveTweiBalanceBefore)

            Helper.assertEqual(reserveTweiGained, zeroBN, "wrong token wei gained by reserve")
        });

        it("check reserve did not gain eth after eth->weth trade", async function (){
            const buyRate = await reserve.getConversionRate(ethAddress, wethToken.address, amount3Eth, 0);

            const reserveWeiBalanceBefore = await Helper.getBalancePromise(reserve.address);
            await reserve.trade(ethAddress, amount3Eth, wethToken.address, admin, buyRate, true, {value: amount3Eth});

            const reserveWeiBalanceAfter = await Helper.getBalancePromise(reserve.address);
            const reserveWeiGained = reserveWeiBalanceAfter.sub(reserveWeiBalanceBefore)

            Helper.assertEqual(reserveWeiGained, zeroBN, "wrong token wei gained by reserve")
        });

        it("check expected weth->eth rate", async function (){
            const sellRate = await reserve.getConversionRate(wethToken.address, ethAddress, tweiSrcQty, 0);
            Helper.assertEqual(sellRate, expectedRate);
        });

        it("check wei gained in weth->eth trade", async function (){
            const sellRate = await reserve.getConversionRate(wethToken.address, ethAddress, tweiSrcQty, 0);
            const balanceBefore = await Helper.getBalancePromise(admin);
            const txInfo = await reserve.trade(wethToken.address, tweiSrcQty, ethAddress, admin, sellRate, true);
            const gasCost = await calcGasCost(txInfo);

            const balanceAfter = await Helper.getBalancePromise(admin);
            const weiGained = balanceAfter.sub(balanceBefore)
            const expecetedWeiGained = tweiSrcQty.mul(expectedRate).div(precision)

            Helper.assertEqual(weiGained, expecetedWeiGained.sub(gasCost), "wrong expected wei gained");
        });

        it("check twei lost in weth->eth trade", async function (){
            const sellRate = await reserve.getConversionRate(wethToken.address, ethAddress, tweiSrcQty, 0);
            const tweiBalanceBefore = await wethToken.balanceOf(admin);

            await reserve.trade(wethToken.address, tweiSrcQty, ethAddress, admin, sellRate, true);
            const tweiBalanceAfter = await wethToken.balanceOf(admin);
            const tWeiLost = tweiBalanceBefore.sub(tweiBalanceAfter)

            Helper.assertEqual(tWeiLost, tweiSrcQty, "wrong expected token wei lost")
        });

        it("check reserve did not gain wei in a weth->eth trade", async function (){
            const sellRate = await reserve.getConversionRate(wethToken.address, ethAddress, tweiSrcQty, 0);

            const reserveBalanceBefore = await Helper.getBalancePromise(reserve.address);

            await reserve.trade(wethToken.address, tweiSrcQty, ethAddress, admin, sellRate, true);
            const reserveBalanceAfter = await Helper.getBalancePromise(reserve.address);
            const reserveWeiGained = reserveBalanceAfter.sub(reserveBalanceBefore)

            Helper.assertEqual(reserveWeiGained, 0, "wrong reserve wei gained in the trade");
        });

        it("check reserve did not gain tokens after eth->weth trade", async function (){
            const sellRate = await reserve.getConversionRate(wethToken.address, ethAddress, tweiSrcQty, 0);

            const reserveTweiBalanceBefore = await wethToken.balanceOf(reserve.address);
            await reserve.trade(wethToken.address, tweiSrcQty, ethAddress, admin, sellRate, true);

            const reserveTweiBalanceAfter = await wethToken.balanceOf(reserve.address);
            const reserveTweiGained = reserveTweiBalanceAfter.sub(reserveTweiBalanceBefore)

            Helper.assertEqual(reserveTweiGained, 0, "wrong token wei gained by reserve")
        });

        it("check eth->weth price for 0 quantity", async function (){
            const buyRate = await reserve.getConversionRate(ethAddress, wethToken.address, 0, 0);
            Helper.assertEqual(buyRate, expectedRate);
        });

        it("check weth->eth price for 0 quantity", async function (){
            const sellRate = await reserve.getConversionRate(wethToken.address, ethAddress, 0, 0);
            Helper.assertEqual(sellRate, expectedRate);
        });

        it("disable trades in the reserve and see that trade reverts", async function (){
            await reserve.addAlerter(alerter);
            await reserve.disableTrade({from: alerter});

            const buyRate = await reserve.getConversionRate(ethAddress, wethToken.address, amount3Eth, 0);
            await Helper.expectThrow(
                    reserve.trade(ethAddress, amount3Eth, wethToken.address, admin, buyRate, true, {value: amount3Eth})
            );

            await reserve.enableTrade();
        });

        it("change network to another address and see that trade fails since sender is not network", async function (){
            await reserve.setKyberNetwork(accounts[2]);
            const buyRate = await reserve.getConversionRate(ethAddress, wethToken.address, amount3Eth, 0);
            await Helper.expectThrow(
                    reserve.trade(ethAddress, amount3Eth, wethToken.address, admin, buyRate, true, {value: amount3Eth})
            );
        });

        it("see getconversionrate without weth fails", async function () {
            const buyRate = await reserve.getConversionRate(ethAddress, anotherToken.address, amount3Eth, 0);
            Helper.assertEqual(buyRate, zeroBN);
        });

        it("see getconversionrate without eth fails", async function (){
            const buyRate = await reserve.getConversionRate(anotherToken.address, wethToken.address, amount3Eth, 0);
            Helper.assertEqual(buyRate, zeroBN);
        });

        it("try to send eth to reserve and make sure default payable function throws", async function (){
            let weiSrcQty = eth1; // 1 eth

            // make sure can send to another account 
            Helper.sendEtherWithPromise(accounts[8], accounts[0], weiSrcQty)

            await Helper.expectThrow(Helper.sendEtherWithPromise(accounts[8], reserve.address, weiSrcQty));
        });
    });

    describe('as non admin', function () {
        const from = non_admin;
        it("check trade fails", async function (){
            const buyRate = await reserve.getConversionRate(ethAddress, wethToken.address, amount3Eth, 0);
            await Helper.expectThrow(
                reserve.trade(ethAddress, amount3Eth, wethToken.address, admin, buyRate, true, {value: amount3Eth, from})
            );
        });

        it("change network fails", async function (){
            await Helper.expectThrow(reserve.setKyberNetwork(accounts[2], {from}));
        });
    });

});

async function calcGasCost(txInfo) {
    let tx = await web3.eth.getTransaction(txInfo.tx);
    return (new BN(tx.gasPrice)).mul(new BN(txInfo.receipt.gasUsed));
}
