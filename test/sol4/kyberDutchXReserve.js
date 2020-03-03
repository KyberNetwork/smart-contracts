const BN = web3.utils.BN;
const truffleAssert = require('truffle-assertions');

const helper = require("../helper.js");
const WETH9 = artifacts.require("WETH9");
const KyberDutchXReserve = artifacts.require("KyberDutchXReserve");
const MockDutchX = artifacts.require("MockDutchX");
const TestToken = artifacts.require("TestToken");

const ethAddress = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
const lowerCaseEthAdd = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const zeroAddress = '0x0000000000000000000000000000000000000000';

let DEFAULT_FEE_BPS = 25;

let DEBUG = false;

let reserve;
let wethContract;
let dutchX;

let token1;
let token2;

let admin;
let alerter;
let user;
let kyberNetwork;

//price data
let priceNumerator;
let priceDenominator;

contract("KyberDutchXReserve", async accounts => {
    const deployToken = async (decimals = 18) => {
        const token = await TestToken.new("Some Token", "KNC", decimals, {
            from: admin
        });
        dbg(
            `Deployed test token with ${decimals} decimals at ${token.address}`
        );
        return token;
    };

    before("setup", async () => {
        admin = accounts[0];
        alerter = accounts[1];
        user = accounts[2];
        kyberNetwork = accounts[3];

        token1 = await deployToken();
        token2 = await deployToken();
        priceNumerator = new BN(10).pow(new BN(21));

        await token1.transfer(kyberNetwork, new BN(10).pow(new BN(25)));

        wethContract = await WETH9.new()
        dbg(`deployed weth to ${wethContract.address}`)

        dutchX = await MockDutchX.new(wethContract.address);
        await token1.approve(dutchX.address, new BN(10).pow(new BN(22)), {from: admin});
        await token2.approve(dutchX.address, new BN(10).pow(new BN(22)), {from: admin});
        await wethContract.deposit({value: new BN(10).pow(new BN(20))});
        await wethContract.approve(dutchX.address, new BN(10).pow(new BN(20)));
        await dutchX.startNewAuctionIndex(wethContract.address, token1.address);
        await dutchX.startNewAuctionIndex(token1.address, wethContract.address);
        await dutchX.addSellFundsToAuction(token1.address, wethContract.address, new BN(10).pow(new BN(22)), priceNumerator, {from: admin})
        await dutchX.addSellFundsToAuction(wethContract.address, token1.address, new BN(10).pow(new BN(20)), priceNumerator, {from: admin})
    });

    beforeEach("setup contract for each test", async () => {

        // 0.5% fee
        await dutchX.setFee(5, 1000);

//        dbg( `deployed dutchX to ${dutchX.address}`);

        reserve = await KyberDutchXReserve.new(
            dutchX.address,
            admin,
            kyberNetwork,
            wethContract.address
        );

//        dbg(`KyberDutchXReserve deployed to address ${reserve.address}`);

        await reserve.setDutchXFee();

        priceNumerator = new BN(10).pow(new BN(21));
        priceDenominator = await dutchX.mutualDenominator();

        await reserve.listToken(token1.address, { from: admin });
//        await reserve.listToken(token2.address, { from: admin });
        await reserve.addAlerter(alerter, { from: admin });

        await token1.approve(reserve.address, new BN(10).pow(new BN(30)), {from: admin});
        await token2.approve(reserve.address, new BN(10).pow(new BN(30)), {from: admin});

        await dutchX.setNewAuctionNumerator(token1.address, wethContract.address, priceNumerator, {from: admin})
        await dutchX.setNewAuctionNumerator(wethContract.address, token1.address, priceNumerator, {from: admin})

        await reserve.enableTrade({from: admin});
    });

    afterEach('withdraw ETH from contracts', async () => {
        let balance = await wethContract.balanceOf(admin);
        await wethContract.withdraw(balance, {from: admin});
    });

    describe("misc", () => {
        it("should be able to send ETH to reserve", async () => {
            await helper.sendEtherWithPromise(
                admin /* sender */,
                reserve.address /* recv */,
                1 /* amount */
            );
        });

        it("verify dutchx auction data", async() => {
            let dest = token1.address;
            let src = wethContract.address;// ethAddress;

            let index = await dutchX.getAuctionIndex(dest, src);

//            dbg(`auction index: ${index}`)
            assert(index > 0);

            let auctionPrice = await dutchX.getCurrentAuctionPrice(dest, src, index);
            let num = auctionPrice[0];
            let den = auctionPrice[1];

            assert(num > 0);
            assert(den > 0);
//            dbg(`price num ${num} den ${den}`)

            let buyVolume = await dutchX.buyVolumes(dest, src);
            let sellVolume = await dutchX.sellVolumesCurrent(dest, src);

            assert(sellVolume > 0);
//            dbg(`buy buyVolume ${buyVolume}`);
//            dbg(`buy sellVolume ${sellVolume}`);

            let outstandingVolume = (sellVolume * num) / den - buyVolume;
            assert(outstandingVolume > 0);
//            dbg(`outstandingVolume ${outstandingVolume}`);
        })

        it("should allow admin to withdraw tokens", async () => {
            const amount = new BN(web3.utils.toWei("1"));
            const initialBalance = await token1.balanceOf(admin);

            await token1.transfer(reserve.address, amount, { from: admin });
            const res = await reserve.withdrawToken(
                token1.address,
                amount,
                admin,
                {
                    from: admin
                }
            );

            const balance = await token1.balanceOf(admin);
            balance.should.be.bignumber.eq(initialBalance);

            truffleAssert.eventEmitted(res, "TokenWithdraw", ev => {
                return (
                    ev.token === token1.address &&
                    ev.amount.eq(amount) &&
                    ev.sendTo === admin
                );
            });
        });

        it("reject withdrawing tokens by non-admin users", async () => {
            const amount = web3.utils.toWei("1");
            await token1.transfer(reserve.address, amount, { from: admin });

            await truffleAssert.reverts(
                reserve.withdrawToken(token1.address, amount, user, {
                    from: user
                })
            );
        });
    });

    describe("constructor params", () => {
        it("dutchx must not be 0", async () => {
            await truffleAssert.reverts(
                KyberDutchXReserve.new(
                    zeroAddress /* dutchx */,
                    admin,
                    kyberNetwork,
                    wethContract.address
                )
            );
        });

        it("admin must not be 0", async () => {
            await truffleAssert.reverts(
                KyberDutchXReserve.new(
                    dutchX.address,
                    zeroAddress,
                    kyberNetwork,
                    wethContract.address
                )
            );
        });

        it("kyberNetwork must not be 0", async () => {
            await truffleAssert.reverts(
                KyberDutchXReserve.new(
                    dutchX.address,
                    admin,
                    zeroAddress,
                    wethContract.address
                )
            );
        });

        it("weth contract must not be 0", async () => {
            await truffleAssert.reverts(
                KyberDutchXReserve.new(
                    dutchX.address,
                    admin,
                    kyberNetwork,
                    zeroAddress
                )
            );
        });

        it("dutchX is saved", async () => {
            const newReserve = await KyberDutchXReserve.new(
                dutchX.address,
                admin,
                kyberNetwork,
                wethContract.address
            );

            const dutchXAddress = await newReserve.dutchX();
            dutchXAddress.should.be.eq(dutchX.address);
        });

        it("admin is saved", async () => {
            const newReserve = await KyberDutchXReserve.new(
                dutchX.address,
                admin,
                kyberNetwork,
                wethContract.address
            );
            const savedAdmin = await newReserve.admin();
            savedAdmin.should.be.eq(admin);
        });

        it("kyberNetwork is saved", async () => {
            const newReserve = await KyberDutchXReserve.new(
                dutchX.address,
                admin,
                kyberNetwork,
                wethContract.address
            );

            const savedNetwork = await newReserve.kyberNetwork();
            savedNetwork.should.be.eq(kyberNetwork);
        });

        it("wethcontract is saved", async () => {
            const newReserve = await KyberDutchXReserve.new(
                dutchX.address,
                admin,
                kyberNetwork,
                wethContract.address
            );

            const savedWeth = await newReserve.weth();
            savedWeth.should.be.eq(wethContract.address);
        });
    });

    describe("#getConversionRate", () => {

        it("conversion rate 1:1", async () => {
            await reserve.setFee(0, { from: admin });
            await dutchX.setFee(0, 1);
            await reserve.setDutchXFee();

            const source = ethAddress;
            const src = wethContract.address;
            const dst = token1.address;

            // make rate 1:1
            await dutchX.setNewAuctionNumerator(dst, src, priceDenominator);

            let index = await dutchX.getAuctionIndex(dst, src);
            let price = await dutchX.getCurrentAuctionPrice(dst, src, index);

//            dbg(`price: ${price}`)
            const rate = await reserve.getConversionRate(
                ethAddress /* src */,
                token1.address /* dst */,
                1000 /* srcQty */,
                0 /* blockNumber */
            );

            rate.should.be.bignumber.eq(new BN(10).pow(new BN(18)));
        });

        it("conversion rate 1:1", async () => {
            await reserve.setFee(0, { from: admin });
            await dutchX.setFee(0, 1);
            await reserve.setDutchXFee();

            // make rate 1:1 - set numerator same as denominator
            await dutchX.setNewAuctionNumerator(token1.address, wethContract.address, priceDenominator);

            const rate = await reserve.getConversionRate(
                ethAddress /* src */,
                token1.address /* dst */,
                web3.utils.toWei("1") /* srcQty */,
                0 /* blockNumber */
            );

            rate.should.be.bignumber.eq(new BN(10).pow(new BN(18)));
        });

        it("rate 0 for small qty Eth - > token", async () => {
            let rate = await reserve.getConversionRate(
                ethAddress /* src */,
                token1.address /* dst */,
                1 /* srcQty */,
                0 /* blockNumber */
            )

            rate.should.be.bignumber.eq(new BN(0));
        });

        it("rate 0 for small qty token -> Eth", async () => {
            let rate = await reserve.getConversionRate(
                ethAddress /* src */,
                token1.address /* dst */,
                1 /* srcQty */,
                0 /* blockNumber */
            )

            rate.should.be.bignumber.eq(new BN(0));
        });

        it("rate 0 if both tokens are ETH", async () => {
            let rate = await reserve.getConversionRate(
                ethAddress /* src */,
                ethAddress /* dst */,
                web3.utils.toWei("1") /* srcQty */,
                0 /* blockNumber */
            )

            rate.should.be.bignumber.eq(new BN(0));
        });

        it("0 rate if both tokens are not ETH", async () => {
            let rate = await reserve.getConversionRate(
                token1.address /* src */,
                token2.address /* dst */,
                web3.utils.toWei("1") /* srcQty */,
                0 /* blockNumber */
            )

            rate.should.be.bignumber.eq(new BN(0));
        });

        it("0 rate for unsupported tokens", async () => {
            const newToken = await deployToken();

            let rate = await reserve.getConversionRate(
                ethAddress /* src */,
                newToken.address /* dst */,
                web3.utils.toWei("1") /* srcQty */,
                0 /* blockNumber */
            )

            rate.should.be.bignumber.eq(new BN(0));
        });

        it("returns 0 if trade is disabled", async () => {

            let rate = await reserve.getConversionRate(
                ethAddress /* src */,
                token1.address /* dst */,
                1000 /* srcQty */,
                0 /* blockNumber */
            )

            helper.assertGreater(rate.valueOf(), new BN(0), "rate not > 0");

            await reserve.disableTrade({ from: alerter });

            rate = await reserve.getConversionRate(
                ethAddress /* src */,
                token1.address /* dst */,
                1000 /* srcQty */,
                0 /* blockNumber */
            )

            rate.should.be.bignumber.eq(new BN(0));
        });

        it("returns 0 if insufficient funds", async () => {
            const dest = token1.address;
            const source = wethContract.address;

            const index = await dutchX.getAuctionIndex(dest, source);

            auctionData = await dutchX.getCurrentAuctionPrice(dest, source, index);

//            dbg(`auctionData: ${auctionData}`)
            const buyVolume = await dutchX.buyVolumes(dest, source);
            const sellVolume = await dutchX.sellVolumesCurrent(dest, source);

            let outstandingVolume = (new BN(sellVolume)).mul(auctionData[0].valueOf()).div(auctionData[1].valueOf()).sub(buyVolume);

//            dbg(`outstandingVolume: ${outstandingVolume}`)
            let rate = await reserve.getConversionRate(
                ethAddress /* src */,
                token1.address /* dst */,
                outstandingVolume /* srcQty */,
                0 /* blockNumber */
            )

            rate.should.be.bignumber.gt(new BN(0));

            rate = await reserve.getConversionRate(
                ethAddress /* src */,
                token1.address /* dst */,
                outstandingVolume.add(new BN(1)) /* srcQty */,
                0 /* blockNumber */
            )

            rate.should.be.bignumber.eq(new BN(0));
        });

        it("returns 0 if auction not running == price value 0", async () => {
            const dest = token1.address;
            const source = wethContract.address;

            let rate = await reserve.getConversionRate(
                ethAddress /* src */,
                token1.address /* dst */,
                1000 /* srcQty */,
                0 /* blockNumber */
            )

            rate.should.be.bignumber.gt(new BN(0));

            await dutchX.setNewAuctionNumerator(dest, source, 0);

            rate = await reserve.getConversionRate(
                ethAddress /* src */,
                token1.address /* dst */,
                1000 /* srcQty */,
                0 /* blockNumber */
            )

            rate.should.be.bignumber.eq(new BN(0));
        });

    });

    describe("#trade", () => {
        it("can be called from KyberNetwork", async () => {
            await reserve.setFee(0, { from: admin });

            const amount = 5000;
            const conversionRate = 1000;

            await reserve.trade(
                ethAddress /* srcToken */,
                amount /* srcAmount */,
                token1.address /* dstToken */,
                user /* destAddress */,
                conversionRate /* conversionRate */,
                true /* validate */,
                { from: kyberNetwork, value: amount }
            );
        });

        it("can not be called by user other than KyberNetwork", async () => {
            await reserve.setFee(0, { from: admin });

            const amount = (web3.utils.toWei("1"));
            const conversionRate = 100;

            await truffleAssert.reverts(
                reserve.trade(
                    ethAddress /* srcToken */,
                    amount /* srcAmount */,
                    token1.address /* dstToken */,
                    user /* destAddress */,
                    conversionRate /* conversionRate */,
                    true /* validate */,
                    { from: user, value: amount }
                )
            );
        });

        it("trade eth to token with conversion rate 1:1", async () => {
            await reserve.setFee(0, { from: admin });
            await dutchX.setFee(0, 1);
            await reserve.setDutchXFee();

            await dutchX.setNewAuctionNumerator(token1.address, wethContract.address, priceDenominator);

            const tradeAmount = web3.utils.toWei("1");

            const rate = await reserve.getConversionRate(
                            ethAddress /* src */,
                            token1.address /* dst */,
                            tradeAmount /* srcQty */,
                            0 /* blockNumber */
                        );

            let userBalanceBefore = await token1.balanceOf(user);

            await reserve.trade(
                ethAddress, //ERC20 srcToken,
                tradeAmount,  // uint srcAmount,
                token1.address,         //ERC20 destToken,
                user,                   //address destAddress,
                rate, //uint conversionRate,
                true, //                              bool validate
                {from: kyberNetwork, value: tradeAmount}
            );

            let userBalanceAfter = await token1.balanceOf(user);
            let expectedBalance = userBalanceBefore.add(new BN(tradeAmount));
            userBalanceAfter.should.be.bignumber.eq(expectedBalance);
        });

        it("trade token to Eth with conversion rate 1:1", async () => {
            await reserve.setFee(0, { from: admin });
            await dutchX.setFee(0, 1);
            await reserve.setDutchXFee();

            //make rate 1:1
            await dutchX.setNewAuctionNumerator(wethContract.address, token1.address, priceDenominator);

            const tradeAmount = web3.utils.toWei("1");

            const rate = await reserve.getConversionRate(
                            ethAddress /* src */,
                            token1.address /* dst */,
                            tradeAmount /* srcQty */,
                            0 /* blockNumber */
                        );

            let userBalanceBefore = new BN(await helper.getBalancePromise(user));

            await token1.transfer(kyberNetwork, tradeAmount, {from: admin});
            await token1.approve(reserve.address, tradeAmount, {from: kyberNetwork});

            await reserve.trade(
                token1.address, //ERC20 srcToken,
                tradeAmount,  // uint srcAmount,
                ethAddress,         //ERC20 destToken,
                user,                   //address destAddress,
                1, //uint conversionRate,
                true, //                              bool validate
                {from: kyberNetwork}
            );

            let userBalanceAfter = new BN(await helper.getBalancePromise(user));
            let expectedBalance = userBalanceBefore.add(new BN(tradeAmount));
            userBalanceAfter.should.be.bignumber.eq(expectedBalance);
        });

        it("fail if ETH in src and dest", async () => {
            const amount = 10000;
            const conversionRate = 1;

            await truffleAssert.reverts(
                reserve.trade(
                    ethAddress /* srcToken */,
                    amount /* srcAmount */,
                    ethAddress /* destToken */,
                    kyberNetwork /* destAddress */,
                    conversionRate /* conversionRate */,
                    true /* validate */,
                    { from: kyberNetwork, value: amount }
                )
            );
        });

        it("fail if token in both src and dest", async () => {
            const tradeAmount = web3.utils.toWei("1");
            const conversionRate = 1;

            await token1.transfer(kyberNetwork, tradeAmount, {from: admin});
            await token1.approve(reserve.address, tradeAmount, {from: kyberNetwork});

            await truffleAssert.reverts(
                reserve.trade(
                    token1.address /* srcToken */,
                    tradeAmount /* srcAmount */,
                    token1.address /* destToken */,
                    user /* destAddress */,
                    conversionRate /* conversionRate */,
                    true /* validate */,
                    { from: kyberNetwork }
                )
            );
        });

        it("trade eth -> token with 0.25% fee", async () => {
            await reserve.setFee(25, { from: admin });
            await dutchX.setFee(0, 1);
            await reserve.setDutchXFee();
            const conversionRate = (new BN(10).pow(new BN(18))).mul(new BN(9975)).div(new BN(10000));
            let amount = new BN(10).pow(new BN(18));
            let tokenBalanceBefore = new BN(await token1.balanceOf(kyberNetwork));

            // make rate 1:1
            await dutchX.setNewAuctionNumerator(wethContract.address, token1.address, priceDenominator);
            await dutchX.setNewAuctionNumerator(token1.address, wethContract.address, priceDenominator);

            const traded = await reserve.trade.call(
                ethAddress /* srcToken */,
                amount /* srcAmount */,
                token1.address /* destToken */,
                kyberNetwork /* destAddress */,
                conversionRate /* conversionRate */,
                true /* validate */,
                { from: kyberNetwork, value: amount }
            );

            await reserve.trade(
                ethAddress /* srcToken */,
                amount /* srcAmount */,
                token1.address /* destToken */,
                kyberNetwork /* destAddress */,
                conversionRate /* conversionRate */,
                true /* validate */,
                { from: kyberNetwork, value: amount }
            );

            let tokenBalanceAfter = new BN(await token1.balanceOf(kyberNetwork));
            let expectedBalance = tokenBalanceBefore.add(amount.mul(new BN(9975)).div(new BN(10000)));
            traded.should.be.true;
            tokenBalanceAfter.should.be.bignumber.eq(expectedBalance);
        });

        it("trade eth -> token with 0.25% fee kyber + 0.5% fee dutchx", async () => {
            await reserve.setFee(25, { from: admin });
            await dutchX.setFee(1, 200);
            await reserve.setDutchXFee();
            let amount = new BN(10).pow(new BN(18));
            const conversionRate = new BN(10).pow(new BN(18)).mul(new BN(9975)).div(new BN(10000)).mul(new BN(995)).div(new BN(1000));
            let tokenBalanceBefore = await token1.balanceOf(kyberNetwork);

            // make rate 1:1
            await dutchX.setNewAuctionNumerator(wethContract.address, token1.address, priceDenominator);
            await dutchX.setNewAuctionNumerator(token1.address, wethContract.address, priceDenominator);

            const traded = await reserve.trade.call(
                ethAddress /* srcToken */,
                amount /* srcAmount */,
                token1.address /* destToken */,
                kyberNetwork /* destAddress */,
                conversionRate /* conversionRate */,
                true /* validate */,
                { from: kyberNetwork, value: amount }
            );

            await reserve.trade(
                ethAddress /* srcToken */,
                amount /* srcAmount */,
                token1.address /* destToken */,
                kyberNetwork /* destAddress */,
                conversionRate /* conversionRate */,
                true /* validate */,
                { from: kyberNetwork, value: amount }
            );

            let tokenBalanceAfter = await token1.balanceOf(kyberNetwork);
            let expectedBalance = tokenBalanceBefore.add(amount.mul(new BN(9975)).div(new BN(10000)).mul(new BN(995)).div(new BN(1000)));

            traded.should.be.true;
            tokenBalanceAfter.should.be.bignumber.eq(expectedBalance);
        });

        it("trade token -> ETH with 0.25% fee", async () => {
            await reserve.setFee(25, { from: admin });
            await dutchX.setFee(0, 200);
            await reserve.setDutchXFee();

            // make rate 1:1
            await dutchX.setNewAuctionNumerator(wethContract.address, token1.address, priceDenominator);
            await dutchX.setNewAuctionNumerator(token1.address, wethContract.address, priceDenominator);

            let amount = new BN(10).pow(new BN(18));
            const conversionRate = new BN(10).pow(new BN(18)).mul(new BN(9975)).div(new BN(10000));
            await token1.approve(reserve.address, amount, {
                from: kyberNetwork
            });
            let ethBalanceBefore = new BN(await helper.getBalancePromise(user));

            const traded = await reserve.trade.call(
                token1.address /* srcToken */,
                amount /* srcAmount */,
                ethAddress /* destToken */,
                user /* destAddress */,
                conversionRate /* conversionRate */,
                true /* validate */,
                { from: kyberNetwork }
            );
            await reserve.trade(
                token1.address /* srcToken */,
                amount /* srcAmount */,
                ethAddress /* destToken */,
                user /* destAddress */,
                conversionRate /* conversionRate */,
                true /* validate */,
                { from: kyberNetwork }
            );

            let ethBalanceAfter = new BN(await helper.getBalancePromise(user));

            traded.should.be.true;
            ethBalanceAfter.should.be.bignumber.eq(
                ethBalanceBefore.add(amount.mul(new BN(9975)).div(new BN(10000)))
            );
        });

        it("trade token -> ETH with 0.25% fee kyber + 0.5% fee dutch", async () => {
            await reserve.setFee(25, { from: admin });
            await dutchX.setFee(1, 200);
            await reserve.setDutchXFee();

            // make rate 1:1
            await dutchX.setNewAuctionNumerator(wethContract.address, token1.address, priceDenominator);
            await dutchX.setNewAuctionNumerator(token1.address, wethContract.address, priceDenominator);

            let amount = new BN(10).pow(new BN(18));
            const conversionRate = (new BN(10).pow(new BN(18))).mul(new BN(9975)).div(new BN(10000)).mul(new BN(995)).div(new BN(1000));
            await token1.approve(reserve.address, amount, {
                from: kyberNetwork
            });
            let ethBalanceBefore = new BN(await helper.getBalancePromise(user));

            const traded = await reserve.trade.call(
                token1.address /* srcToken */,
                amount /* srcAmount */,
                ethAddress /* destToken */,
                user /* destAddress */,
                conversionRate /* conversionRate */,
                true /* validate */,
                { from: kyberNetwork }
            );
            await reserve.trade(
                token1.address /* srcToken */,
                amount /* srcAmount */,
                ethAddress /* destToken */,
                user /* destAddress */,
                conversionRate /* conversionRate */,
                true /* validate */,
                { from: kyberNetwork }
            );

            let ethBalanceAfter = new BN(await helper.getBalancePromise(user));

            traded.should.be.true;
            ethBalanceAfter.should.be.bignumber.eq(
                ethBalanceBefore.add(amount.mul(new BN(9975)).div(new BN(10000)).mul(new BN(995)).div(new BN(1000)))
            );
        });

        it("trade fail when actual conversion rate worse then requested", async () => {
            await reserve.setFee(0, { from: admin });
            await dutchX.setFee(0, 200);
            await reserve.setDutchXFee();

            const amount = web3.utils.toWei("1");
            const conversionRate = new BN(10).pow(new BN(18)).add(new BN(100));
            await token1.approve(reserve.address, amount, {
                from: kyberNetwork
            });
            const ethBalanceBefore = new BN(await helper.getBalancePromise(user));

            await truffleAssert.reverts( reserve.trade(
                    token1.address /* srcToken */,
                    amount /* srcAmount */,
                    ethAddress /* destToken */,
                    user /* destAddress */,
                    conversionRate /* conversionRate */,
                    true /* validate */,
                    { from: kyberNetwork }
                )
            );

            const ethBalanceAfter = new BN(await helper.getBalancePromise(user));
            ethBalanceAfter.should.be.bignumber.eq(ethBalanceBefore);
        });

        it("ETH -> token, fail if srcAmount != msg.value", async () => {
            await reserve.setFee(0, { from: admin });

            const amount = (web3.utils.toWei("1"));
            const conversionRate = 1000;

            await truffleAssert.reverts( reserve.trade(
                    ethAddress /* srcToken */,
                    amount /* srcAmount */,
                    token1.address /* dstToken */,
                    user /* destAddress */,
                    conversionRate /* conversionRate */,
                    true /* validate */,
                    { from: kyberNetwork, value: amount + 1 }
                )
            );
        });

        it("token -> ETH, fail if 0 != msg.value", async () => {
            await reserve.setFee(0, { from: admin });

            const amount = (web3.utils.toWei("1"));
            const conversionRate = 1000;
            await token1.approve(reserve.address, amount, {
                from: kyberNetwork
            });
            const ethBalanceBefore = new BN(await helper.getBalancePromise(user));

            await truffleAssert.reverts( reserve.trade(
                    token1.address /* srcToken */,
                    amount /* srcAmount */,
                    ethAddress /* destToken */,
                    user /* destAddress */,
                    conversionRate /* conversionRate */,
                    true /* validate */,
                    { from: kyberNetwork, value: 1 }
                )
            );

            const ethBalanceAfter = new BN(await helper.getBalancePromise(user));

            ethBalanceAfter.should.be.bignumber.eq(
                ethBalanceBefore
            );
        });

        it("fail if trade is disabled", async () => {
            await reserve.disableTrade({ from: alerter });

            await reserve.setFee(0, { from: admin });

            const amount = (web3.utils.toWei("1"));
            const conversionRate = 1000;

            await truffleAssert.reverts( reserve.trade(
                    ethAddress /* srcToken */,
                    amount /* srcAmount */,
                    token1.address /* dstToken */,
                    user /* destAddress */,
                    conversionRate /* conversionRate */,
                    true /* validate */,
                    { from: kyberNetwork, value: amount + 1 }
                )
            );
        });

        it("trade event emitted", async () => {
            const amount = (web3.utils.toWei("1"));
            const conversionRate = 1000;

            await reserve.setFee(0, { from: admin });
            await dutchX.setFee(0, 1);
            await reserve.setDutchXFee();

            // make rate 1:1
            await dutchX.setNewAuctionNumerator(wethContract.address, token1.address, priceDenominator);
            await dutchX.setNewAuctionNumerator(token1.address, wethContract.address, priceDenominator);

            const res = await reserve.trade(
                ethAddress /* srcToken */,
                amount /* srcAmount */,
                token1.address /* dstToken */,
                user /* destAddress */,
                conversionRate /* conversionRate */,
                true /* validate */,
                { from: kyberNetwork, value: amount }
            )

            const auctionIndex = new BN(await dutchX.getAuctionIndex(token1.address, wethContract.address));

            assert(res.logs[0].event ==  "TradeExecute");
            assert(res.logs[0].args.sender === kyberNetwork);
            assert(res.logs[0].args.destToken === token1.address);
            helper.assertEqual(res.logs[0].args.srcAmount.valueOf(), amount, "unexpected src amount");
            assert(res.logs[0].args.src === ethAddress);
            helper.assertEqual(res.logs[0].args.destAmount.valueOf(), amount, "unexpected dest amount");
            assert(res.logs[0].args.destAddress === user);
            helper.assertEqual(res.logs[0].args.auctionIndex.valueOf(),auctionIndex,"unexpected auction index");
        });
    });

    describe("#setFee", () => {
        it("default fee", async () => {
            const newReserve = await KyberDutchXReserve.new(
                dutchX.address,
                admin,
                kyberNetwork,
                wethContract.address
            );

            const feeValue = await newReserve.feeBps();

            feeValue.should.be.bignumber.eq(new BN(DEFAULT_FEE_BPS));
        });

        it ("dutchX fee", async () => {
            let newDutchX = await MockDutchX.new(wethContract.address);
            await newDutchX.setFee(10, 30);

            const newReserve = await KyberDutchXReserve.new(
                newDutchX.address,
                admin,
                kyberNetwork,
                wethContract.address
            );

            let feeNum = await newReserve.dutchXFeeNum();
            let feeDen = await newReserve.dutchXFeeDen();

            feeNum.should.be.bignumber.eq(new BN(10));
            feeDen.should.be.bignumber.eq(new BN(30));

            await newDutchX.setFee(1, 5);
            feeNum = await newReserve.dutchXFeeNum();
            feeDen = await newReserve.dutchXFeeDen();
            feeNum.should.be.bignumber.eq(new BN(10));
            feeDen.should.be.bignumber.eq(new BN(30));

            await newReserve.setDutchXFee();
            feeNum = await newReserve.dutchXFeeNum();
            feeDen = await newReserve.dutchXFeeDen();
            feeNum.should.be.bignumber.eq(new BN(1));
            feeDen.should.be.bignumber.eq(new BN(5));
        });

        it("fee value saved", async () => {
            await reserve.setFee(30, { from: admin });

            const feeValue = await reserve.feeBps();
            feeValue.should.be.bignumber.eq(new BN(30));
        });

        it("calling by admin allowed", async () => {
            await reserve.setFee(20, { from: admin });
        });

        it("calling by non-admin reverts", async () => {
            await truffleAssert.reverts(reserve.setFee(20, { from: user }));
        });

        it("fail for fee > 10000", async () => {
            await truffleAssert.reverts(reserve.setFee(10001, { from: admin }));
        });

        it("event sent on setFee", async () => {
            const res = await reserve.setFee(20, { from: admin });
            truffleAssert.eventEmitted(res, "FeeUpdated", ev => {
                return ev.bps.eq(new BN(20));
            });
        });

    });

    describe("#listToken", () => {
        it("calling by admin allowed", async () => {
            const newToken = await deployToken();

            await reserve.listToken(newToken.address, { from: admin });
        });

        it("calling by non-admin reverts", async () => {
            const newToken = await deployToken();

            await truffleAssert.reverts(
                reserve.listToken(newToken.address, { from: user })
            );
        });

        it("fails for token with address 0", async () => {
            await truffleAssert.reverts(reserve.listToken(zeroAddress, { from: user }));
        });

        it("event sent on token listed", async () => {
            const newToken = await deployToken();

            const res = await reserve.listToken(newToken.address, {
                from: admin
            });

            truffleAssert.eventEmitted(res, "TokenListed", ev => {
                return (
                    ev.token === newToken.address
                );
            });
        });

        it("listing token gives allowance to exchange", async () => {
            const newToken = await deployToken();
            await reserve.listToken(newToken.address, { from: admin });

            const amount = await newToken.allowance(
                reserve.address,
                dutchX.address
            );
            amount.should.be.bignumber.eq(new BN(2).pow(new BN(255)));
        });
    });

    describe("#delistToken", () => {
        it("calling by admin allowed", async () => {
            const newToken = await deployToken();
            await reserve.listToken(newToken.address, { from: admin });

            await reserve.delistToken(newToken.address, { from: admin });
        });

        it("calling by non-admin reverts", async () => {
            const newToken = await deployToken();
            await reserve.listToken(newToken.address, { from: admin });

            await truffleAssert.reverts(
                reserve.delistToken(newToken.address, { from: user })
            );
        });

        it("after calling token no longer supported", async () => {
            await reserve.setFee(0, { from: admin });
            await dutchX.setFee(0, 1);
            await reserve.setDutchXFee();

            // make rate 1:1
            await dutchX.setNewAuctionNumerator(token1.address, wethContract.address, priceDenominator);

            const amount = 5000;
            const rate = await reserve.getConversionRate(
                ethAddress /* src */,
                token1.address /* dst */,
                amount /* srcQty */,
                0 /* blockNumber */
            );

            rate.should.be.bignumber.eq(new BN(10).pow(new BN(18)));

            await reserve.delistToken(token1.address);

            const rate2 = await reserve.getConversionRate(
                ethAddress /* src */,
                token1.address /* dst */,
                amount /* srcQty */,
                0 /* blockNumber */
            );

            rate2.should.be.bignumber.eq(new BN(0));
        });

        it("cannot delist unlisted tokens", async () => {
            const newToken = await deployToken();
            await reserve.listToken(newToken.address, { from: admin });

            await reserve.delistToken(newToken.address);

            await truffleAssert.reverts(
                reserve.delistToken(newToken.address, { from: admin })
            );
        });

        it("event sent on token delisted", async () => {
            const newToken = await deployToken();
            await reserve.listToken(newToken.address, { from: admin });

            const res = await reserve.delistToken(newToken.address);

            truffleAssert.eventEmitted(res, "TokenDelisted", ev => {
                return ev.token === newToken.address;
            });
        });
    });

    describe("Responsible reserve", () => {
        it("enableTrade() allowed for admin", async () => {
            await reserve.disableTrade({ from: alerter });

            const enabled = await reserve.enableTrade.call({ from: admin });
            await reserve.enableTrade({ from: admin });

            const actuallyEnabled = await reserve.tradeEnabled();
            enabled.should.be.true;
            actuallyEnabled.should.be.true;
        });

        it("enableTrade() fails if not admin", async () => {
            await truffleAssert.reverts(reserve.enableTrade({ from: user }));
        });

        it("event emitted on enableTrade()", async () => {
            const res = await reserve.enableTrade({ from: admin });

            truffleAssert.eventEmitted(res, "TradeEnabled", ev => {
                return ev.enable === true;
            });
        });

        it("disableTrade() allowed for alerter", async () => {
            await reserve.enableTrade({ from: admin });

            const disabled = await reserve.disableTrade.call({ from: alerter });
            await reserve.disableTrade({ from: alerter });

            const tradeEnabled = await reserve.tradeEnabled();
            disabled.should.be.true;
            tradeEnabled.should.be.false;
        });

        it("disableTrade() fails if not alerter", async () => {
            await truffleAssert.reverts(reserve.disableTrade({ from: user }));
        });

        it("event emitted on disableTrade()", async () => {
            const res = await reserve.disableTrade({ from: alerter });

            truffleAssert.eventEmitted(res, "TradeEnabled", ev => {
                return ev.enable === false;
            });
        });
    });

    describe("#setKyberNetwork", () => {
        it("set new value by admin", async () => {
            await reserve.setKyberNetwork(user, { from: admin });

            const updatedKyberNetwork = await reserve.kyberNetwork();
            updatedKyberNetwork.should.be.eq(user);
        });

        it("should reject address 0", async () => {
            await truffleAssert.reverts(reserve.setKyberNetwork(zeroAddress));
        });

        it("only admin can set values", async () => {
            await truffleAssert.reverts(
                reserve.setKyberNetwork(user, { from: user })
            );
        });

        it("setting value emits an event", async () => {
            const res = await reserve.setKyberNetwork(user, { from: admin });

            await truffleAssert.eventEmitted(res, "KyberNetworkSet", ev => {
                return ev.kyberNetwork === user;
            });
        });
    });
});

async function dbg(...args) {
    if (DEBUG) console.log(...args);
}
