const web3 = require("web3");
const BigNumber = require("bignumber.js");

require("chai")
    .use(require("chai-as-promised"))
    .use(require("chai-bignumber")(BigNumber))
    .should();


const truffleAssert = require("truffle-assertions");

const helper = require("./helper.js");
const WETH9 = artifacts.require("WETH9");
const KyberDutchXReserve = artifacts.require("KyberDutchXReserve");
const MockDutchX = artifacts.require("MockDutchX");
const TestToken = artifacts.require("TestToken");

const ETH_TOKEN_ADDRESS = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

let DEFAULT_FEE_BPS;

let DEBUG = true;

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

        wethContract = await WETH9.new()
        dbg(`deployed weth to ${wethContract.address}`)
    });

    beforeEach("setup contract for each test", async () => {

        dutchX = await MockDutchX.new(wethContract.address);
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
        DEFAULT_FEE_BPS = await reserve.DEFAULT_KYBER_FEE_BPS();

        await dutchX.startNewAuctionIndex(wethContract.address, token1.address);
        let auctionIndex = await dutchX.tokenAuctionIndex(wethContract.address, token1.address);
//        dbg(`created new auction, number: ${auctionIndex}`);

        await dutchX.startNewAuctionIndex(token1.address, wethContract.address);
        auctionIndex = await dutchX.tokenAuctionIndex(token1.address, wethContract.address);
//        dbg(`created new auction, number: ${auctionIndex}`);

        priceNumerator = 10 ** 21;
        priceDenominator = await dutchX.mutualDenominator();

        await token1.approve(dutchX.address, 10 ** 22, {From: admin});
        await token2.approve(dutchX.address, 10 ** 22, {From: admin});
        await wethContract.deposit({value: 10 ** 20});
        await wethContract.approve(dutchX.address, 10 ** 20);

//        dbg(`approved funds two tokens`);

        await dutchX.addSellFundsToAuction(token1.address, wethContract.address, 10 ** 22, priceNumerator, {from: admin})
        await dutchX.addSellFundsToAuction(wethContract.address, token1.address, 10 ** 20, priceNumerator, {from: admin})

//        dbg(`created new auction, added funds`);

        await reserve.listToken(token1.address, { from: admin });
//        await reserve.listToken(token2.address, { from: admin });
        await reserve.addAlerter(alerter, { from: admin });

        await token1.approve(reserve.address, 10 ** 30, {From: admin});
        await token2.approve(reserve.address, 10 ** 30, {From: admin});

        await reserve.setFee(DEFAULT_FEE_BPS);
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

        it("should allow admin to withdraw tokens", async () => {
            const amount = web3.utils.toWei("1");
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
                    0 /* dutchx */,
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
                    0,
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
                    0,
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
                    0
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
        it("verify dutchx auction data", async() => {
            let dest = token1.address;
            let src = wethContract.address;// ETH_TOKEN_ADDRESS;

//            let dest = ETH_TOKEN_ADDRESS;
//            let src = token1.address;

            let index = await dutchX.getAuctionIndex(dest, src);

            dbg(`auction index: ${index}`)

            let auctionPrice = await dutchX.getCurrentAuctionPrice(dest, src, index);
            let num = auctionPrice[0];
            let den = auctionPrice[1];

            dbg(`price num ${num} den ${den}`)
//            dbg(auctionPrice)

            let buyVolume = await dutchX.buyVolumes(dest, src);
            let sellVolume = await dutchX.sellVolumesCurrent(dest, src);

            dbg(`buy buyVolume ${buyVolume}`);
            dbg(`buy sellVolume ${sellVolume}`);

            let outstandingVolume = (sellVolume * num) / den - buyVolume;
            dbg(`outstandingVolume ${outstandingVolume}`);
        })

        it("conversion rate 1:1", async () => {
            await reserve.setFee(0, { from: admin });
            await dutchX.setFee(0, 1);
            await reserve.setDutchXFee();

            // maker rate 1:1
            await dutchX.setNewAuctionNumerator(token1.address, wethContract.address, priceDenominator);

            const rate = await reserve.getConversionRate(
                ETH_TOKEN_ADDRESS /* src */,
                token1.address /* dst */,
//                10 ** 13 /* srcQty */,
                web3.utils.toWei("1") /* srcQty */,
                0 /* blockNumber */
            );

            rate.should.be.bignumber.eq(new BigNumber(10).pow(18));
        });

        it("trade eth to token with conversion rate 1:1", async () => {
            await reserve.setFee(0, { from: admin });
            await dutchX.setFee(0, 1);
            await reserve.setDutchXFee();

            await dutchX.setNewAuctionNumerator(token1.address, wethContract.address, priceDenominator);

            const tradeAmount = web3.utils.toWei("1");

            const rate = await reserve.getConversionRate(
                            ETH_TOKEN_ADDRESS /* src */,
                            token1.address /* dst */,
                            tradeAmount /* srcQty */,
                            0 /* blockNumber */
                        );

            dbg(`rate ${rate}`);

            let userBalanceBefore = await token1.balanceOf(user);

            await reserve.trade(
                ETH_TOKEN_ADDRESS, //ERC20 srcToken,
                tradeAmount,  // uint srcAmount,
                token1.address,         //ERC20 destToken,
                user,                   //address destAddress,
                1, //uint conversionRate,
                true, //                              bool validate
                {from: kyberNetwork, value: tradeAmount}
            );

            let userBalanceAfter = await token1.balanceOf(user);
            let expectedBalance = userBalanceBefore.add(tradeAmount);
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
                            ETH_TOKEN_ADDRESS /* src */,
                            token1.address /* dst */,
                            tradeAmount /* srcQty */,
                            0 /* blockNumber */
                        );

            dbg(`rate ${rate}`);

            let userBalanceBefore = await helper.getBalancePromise(user);

            await token1.transfer(kyberNetwork, tradeAmount, {from: admin});
            await token1.approve(reserve.address, tradeAmount, {from: kyberNetwork});

            await reserve.trade(
                token1.address, //ERC20 srcToken,
                tradeAmount,  // uint srcAmount,
                ETH_TOKEN_ADDRESS,         //ERC20 destToken,
                user,                   //address destAddress,
                1, //uint conversionRate,
                true, //                              bool validate
                {from: kyberNetwork}
            );

            let userBalanceAfter = await helper.getBalancePromise(user);
            let expectedBalance = userBalanceBefore.add(tradeAmount);
            userBalanceAfter.should.be.bignumber.eq(expectedBalance);
        });

        it("rate 0 if both tokens are ETH", async () => {
            let rate = await reserve.getConversionRate(
                ETH_TOKEN_ADDRESS /* src */,
                ETH_TOKEN_ADDRESS /* dst */,
                web3.utils.toWei("1") /* srcQty */,
                0 /* blockNumber */
            )

            rate.should.be.bignumber.eq(0);
        });

        it("0 rate if both tokens are not ETH", async () => {
            let rate = await reserve.getConversionRate(
                token1.address /* src */,
                token2.address /* dst */,
                web3.utils.toWei("1") /* srcQty */,
                0 /* blockNumber */
            )

            rate.should.be.bignumber.eq(0);
        });

        it("0 rate for unsupported tokens", async () => {
            const newToken = await deployToken();

            let rate = await reserve.getConversionRate(
                ETH_TOKEN_ADDRESS /* src */,
                newToken.address /* dst */,
                web3.utils.toWei("1") /* srcQty */,
                0 /* blockNumber */
            )

            rate.should.be.bignumber.eq(0);
        });

        it("returns 0 if trade is disabled", async () => {

            let rate = await reserve.getConversionRate(
                ETH_TOKEN_ADDRESS /* src */,
                token1.address /* dst */,
                web3.utils.toWei("1") /* srcQty */,
                0 /* blockNumber */
            )

            assert(rate.valueOf() > 0);

            await reserve.disableTrade({ from: alerter });

            rate = await reserve.getConversionRate(
                ETH_TOKEN_ADDRESS /* src */,
                token1.address /* dst */,
                web3.utils.toWei("1") /* srcQty */,
                0 /* blockNumber */
            )

            rate.should.be.bignumber.eq(0);
        });

    });

    describe("#trade", () => {
        it("can be called from KyberNetwork", async () => {
            await reserve.setFee(0, { from: admin });
            await uniswapFactoryMock.setToken(token.address);
            await uniswapFactoryMock.setRateEthToToken(
                1 /* eth */,
                1 /* token */
            );
            const exchangeAddress = await reserve.tokenExchange(token.address);
            const amount = web3.utils.toWei("1");
            const conversionRate = new BigNumber(10).pow(18);

            await reserve.trade(
                ETH_TOKEN_ADDRESS /* srcToken */,
                amount /* srcAmount */,
                token.address /* dstToken */,
                user /* destAddress */,
                conversionRate /* conversionRate */,
                true /* validate */,
                { from: kyberNetwork, value: amount }
            );
        });

        it("can not be called by user other than KyberNetwork", async () => {
            await reserve.setFee(0, { from: admin });
            await uniswapFactoryMock.setToken(token.address);
            await uniswapFactoryMock.setRateEthToToken(
                1 /* eth */,
                1 /* token */
            );
            const exchangeAddress = await reserve.tokenExchange(token.address);
            const amount = web3.utils.toWei("1");
            const conversionRate = new BigNumber(10).pow(18);

            await truffleAssert.reverts(
                reserve.trade(
                    ETH_TOKEN_ADDRESS /* srcToken */,
                    amount /* srcAmount */,
                    token.address /* dstToken */,
                    user /* destAddress */,
                    conversionRate /* conversionRate */,
                    true /* validate */,
                    { from: user, value: amount }
                )
            );
        });

        it("fail if ETH in src and dest", async () => {
            await reserve.setFee(0, { from: admin });
            await uniswapFactoryMock.setRateEthToToken(
                1 /* eth */,
                1 /* token */
            );
            await uniswapFactoryMock.setToken(token.address);
            const amount = web3.utils.toWei("1");
            const conversionRate = new BigNumber(10).pow(18);
            const tokenBalanceBefore = await token.balanceOf(kyberNetwork);

            await truffleAssert.reverts(
                reserve.trade(
                    ETH_TOKEN_ADDRESS /* srcToken */,
                    amount /* srcAmount */,
                    ETH_TOKEN_ADDRESS /* destToken */,
                    kyberNetwork /* destAddress */,
                    conversionRate /* conversionRate */,
                    true /* validate */,
                    { from: kyberNetwork, value: amount }
                )
            );
        });

        it("fail if token in both src and dest", async () => {
            await reserve.setFee(0, { from: admin });
            await uniswapFactoryMock.setRateTokenToEth(
                1 /* eth */,
                1 /* token */
            );
            await uniswapFactoryMock.setToken(token.address);
            const amount = web3.utils.toWei("1");
            const conversionRate = new BigNumber(10).pow(18);
            await token.approve(reserve.address, amount, {
                from: kyberNetwork
            });
            const ethBalanceBefore = await helper.getBalancePromise(user);

            await truffleAssert.reverts(
                reserve.trade(
                    token.address /* srcToken */,
                    amount /* srcAmount */,
                    token.address /* destToken */,
                    user /* destAddress */,
                    conversionRate /* conversionRate */,
                    true /* validate */,
                    { from: kyberNetwork }
                )
            );
        });

        it("simple trade eth -> token", async () => {
            await reserve.setFee(0, { from: admin });
            await uniswapFactoryMock.setRateEthToToken(
                1 /* eth */,
                1 /* token */
            );
            await uniswapFactoryMock.setToken(token.address);
            const amount = web3.utils.toWei("1");
            const conversionRate = new BigNumber(10).pow(18);
            const tokenBalanceBefore = await token.balanceOf(kyberNetwork);

            const traded = await reserve.trade.call(
                ETH_TOKEN_ADDRESS /* srcToken */,
                amount /* srcAmount */,
                token.address /* destToken */,
                kyberNetwork /* destAddress */,
                conversionRate /* conversionRate */,
                true /* validate */,
                { from: kyberNetwork, value: amount }
            );
            await reserve.trade(
                ETH_TOKEN_ADDRESS /* srcToken */,
                amount /* srcAmount */,
                token.address /* destToken */,
                kyberNetwork /* destAddress */,
                conversionRate /* conversionRate */,
                true /* validate */,
                { from: kyberNetwork, value: amount }
            );

            const tokenBalanceAfter = await token.balanceOf(kyberNetwork);

            traded.should.be.true;
            tokenBalanceAfter.should.be.bignumber.eq(
                tokenBalanceBefore.add(amount)
            );
        });

        it("simple trade token -> ETH", async () => {
            await reserve.setFee(0, { from: admin });
            await uniswapFactoryMock.setRateTokenToEth(
                1 /* eth */,
                1 /* token */
            );
            await uniswapFactoryMock.setToken(token.address);
            const amount = web3.utils.toWei("1");
            const conversionRate = new BigNumber(10).pow(18);
            await token.approve(reserve.address, amount, {
                from: kyberNetwork
            });
            const ethBalanceBefore = await helper.getBalancePromise(user);

            const traded = await reserve.trade.call(
                token.address /* srcToken */,
                amount /* srcAmount */,
                ETH_TOKEN_ADDRESS /* destToken */,
                user /* destAddress */,
                conversionRate /* conversionRate */,
                true /* validate */,
                { from: kyberNetwork }
            );
            await reserve.trade(
                token.address /* srcToken */,
                amount /* srcAmount */,
                ETH_TOKEN_ADDRESS /* destToken */,
                user /* destAddress */,
                conversionRate /* conversionRate */,
                true /* validate */,
                { from: kyberNetwork }
            );

            const ethBalanceAfter = await helper.getBalancePromise(user);

            traded.should.be.true;
            ethBalanceAfter.should.be.bignumber.eq(
                ethBalanceBefore.add(amount)
            );
        });

        it("trade eth -> token with 0.25% fee", async () => {
            await reserve.setFee(25, { from: admin });
            await uniswapFactoryMock.setRateEthToToken(
                1 /* eth */,
                1 /* token */
            );
            await uniswapFactoryMock.setToken(token.address);
            const amount = web3.utils.toWei("1");
            const conversionRate = new BigNumber(10).pow(18).mul(0.9975);
            const tokenBalanceBefore = await token.balanceOf(kyberNetwork);

            const traded = await reserve.trade.call(
                ETH_TOKEN_ADDRESS /* srcToken */,
                amount /* srcAmount */,
                token.address /* destToken */,
                kyberNetwork /* destAddress */,
                conversionRate /* conversionRate */,
                true /* validate */,
                { from: kyberNetwork, value: amount }
            );
            await reserve.trade(
                ETH_TOKEN_ADDRESS /* srcToken */,
                amount /* srcAmount */,
                token.address /* destToken */,
                kyberNetwork /* destAddress */,
                conversionRate /* conversionRate */,
                true /* validate */,
                { from: kyberNetwork, value: amount }
            );

            const tokenBalanceAfter = await token.balanceOf(kyberNetwork);
            const expectedBalance = tokenBalanceBefore.add(amount * 0.9975);

            traded.should.be.true;
            tokenBalanceAfter.should.be.bignumber.eq(expectedBalance);
        });

        it("trade token -> ETH with 0.25% fee", async () => {
            await reserve.setFee(25, { from: admin });
            await uniswapFactoryMock.setRateTokenToEth(
                1 /* eth */,
                1 /* token */
            );
            await uniswapFactoryMock.setToken(token.address);
            const amount = web3.utils.toWei("1");
            const conversionRate = new BigNumber(10).pow(18).mul(0.9975);
            await token.approve(reserve.address, amount, {
                from: kyberNetwork
            });
            const ethBalanceBefore = await helper.getBalancePromise(user);

            const traded = await reserve.trade.call(
                token.address /* srcToken */,
                amount /* srcAmount */,
                ETH_TOKEN_ADDRESS /* destToken */,
                user /* destAddress */,
                conversionRate /* conversionRate */,
                true /* validate */,
                { from: kyberNetwork }
            );
            await reserve.trade(
                token.address /* srcToken */,
                amount /* srcAmount */,
                ETH_TOKEN_ADDRESS /* destToken */,
                user /* destAddress */,
                conversionRate /* conversionRate */,
                true /* validate */,
                { from: kyberNetwork }
            );

            const ethBalanceAfter = await helper.getBalancePromise(user);

            traded.should.be.true;
            ethBalanceAfter.should.be.bignumber.eq(
                ethBalanceBefore.add(amount * 0.9975)
            );
        });

        it("trade eth -> token with rate 1:2 and 0.25% fee", async () => {
            await reserve.setFee(25, { from: admin });
            await uniswapFactoryMock.setRateEthToToken(
                1 /* eth */,
                2 /* token */
            );
            await uniswapFactoryMock.setToken(token.address);
            const amount = web3.utils.toWei("1");
            const conversionRate = new BigNumber(10)
                .pow(18)
                .mul(2)
                .mul(0.9975);
            const tokenBalanceBefore = await token.balanceOf(kyberNetwork);

            const traded = await reserve.trade.call(
                ETH_TOKEN_ADDRESS /* srcToken */,
                amount /* srcAmount */,
                token.address /* destToken */,
                kyberNetwork /* destAddress */,
                conversionRate /* conversionRate */,
                true /* validate */,
                { from: kyberNetwork, value: amount }
            );
            await reserve.trade(
                ETH_TOKEN_ADDRESS /* srcToken */,
                amount /* srcAmount */,
                token.address /* destToken */,
                kyberNetwork /* destAddress */,
                conversionRate /* conversionRate */,
                true /* validate */,
                { from: kyberNetwork, value: amount }
            );

            const tokenBalanceAfter = await token.balanceOf(kyberNetwork);
            const expectedBalance = tokenBalanceBefore.add(amount * 2 * 0.9975);

            traded.should.be.true;
            tokenBalanceAfter.should.be.bignumber.eq(expectedBalance);
        });

        it("trade token -> ETH with rate 1:2 and 0.25% fee", async () => {
            await reserve.setFee(25, { from: admin });
            await uniswapFactoryMock.setRateTokenToEth(
                2 /* eth */,
                1 /* token */
            );
            await uniswapFactoryMock.setToken(token.address);
            const amount = web3.utils.toWei("1");
            const conversionRate = new BigNumber(10)
                .pow(18)
                .mul(2)
                .mul(0.9975);
            await token.approve(reserve.address, amount, {
                from: kyberNetwork
            });
            const ethBalanceBefore = await helper.getBalancePromise(user);

            const traded = await reserve.trade.call(
                token.address /* srcToken */,
                amount /* srcAmount */,
                ETH_TOKEN_ADDRESS /* destToken */,
                user /* destAddress */,
                conversionRate /* conversionRate */,
                true /* validate */,
                { from: kyberNetwork }
            );
            await reserve.trade(
                token.address /* srcToken */,
                amount /* srcAmount */,
                ETH_TOKEN_ADDRESS /* destToken */,
                user /* destAddress */,
                conversionRate /* conversionRate */,
                true /* validate */,
                { from: kyberNetwork }
            );

            const ethBalanceAfter = await helper.getBalancePromise(user);

            traded.should.be.true;
            ethBalanceAfter.should.be.bignumber.eq(
                ethBalanceBefore.add(amount * 2 * 0.9975)
            );
        });

        it("fail if actual trade rate < conversionRate param", async () => {
            await reserve.setFee(25, { from: admin });
            await uniswapFactoryMock.setRateTokenToEth(
                2 /* eth */,
                1 /* token */
            );
            await uniswapFactoryMock.setToken(token.address);
            const amount = web3.utils.toWei("1");
            await token.approve(reserve.address, amount, {
                from: kyberNetwork
            });
            const ethBalanceBefore = await helper.getBalancePromise(user);

            const expectedConversionRate = await reserve.getConversionRate(
                token.address /* src */,
                ETH_TOKEN_ADDRESS /* dest */,
                amount /* srcQty */,
                0 /* blockNumber */
            );

            await truffleAssert.reverts(
                reserve.trade(
                    token.address /* srcToken */,
                    amount /* srcAmount */,
                    ETH_TOKEN_ADDRESS /* destToken */,
                    user /* destAddress */,
                    expectedConversionRate.plus(1) /* conversionRate */,
                    true /* validate */,
                    { from: kyberNetwork }
                )
            );
        });

        it("ETH -> token, fail if srcAmount != msg.value", async () => {
            await reserve.setFee(25, { from: admin });
            await uniswapFactoryMock.setRateEthToToken(
                1 /* eth */,
                2 /* token */
            );
            await uniswapFactoryMock.setToken(token.address);
            const amount = new BigNumber(10).pow(18);
            const conversionRate = new BigNumber(10)
                .pow(18)
                .mul(2)
                .mul(0.9975);
            const tokenBalanceBefore = await token.balanceOf(kyberNetwork);

            await truffleAssert.reverts(
                reserve.trade(
                    ETH_TOKEN_ADDRESS /* srcToken */,
                    amount /* srcAmount */,
                    token.address /* destToken */,
                    kyberNetwork /* destAddress */,
                    conversionRate /* conversionRate */,
                    true /* validate */,
                    { from: kyberNetwork, value: amount.sub(1) }
                )
            );
        });

        it("fail if trade is disabled", async () => {
            await reserve.setFee(25, { from: admin });
            await uniswapFactoryMock.setRateEthToToken(
                1 /* eth */,
                2 /* token */
            );
            await uniswapFactoryMock.setToken(token.address);
            const amount = web3.utils.toWei("1");
            const conversionRate = new BigNumber(10)
                .pow(18)
                .mul(2)
                .mul(0.9975);
            await reserve.disableTrade({ from: alerter });

            await truffleAssert.reverts(
                reserve.trade(
                    ETH_TOKEN_ADDRESS /* srcToken */,
                    amount /* srcAmount */,
                    token.address /* destToken */,
                    kyberNetwork /* destAddress */,
                    conversionRate /* conversionRate */,
                    true /* validate */,
                    { from: kyberNetwork, value: amount }
                )
            );
        });

        it("trade event emitted", async () => {
            await reserve.setFee(25, { from: admin });
            await uniswapFactoryMock.setRateTokenToEth(
                2 /* eth */,
                1 /* token */
            );
            await uniswapFactoryMock.setToken(token.address);
            const amount = web3.utils.toWei("1");
            const conversionRate = new BigNumber(10)
                .pow(18)
                .mul(2)
                .mul(0.9975);
            await token.approve(reserve.address, amount, {
                from: kyberNetwork
            });

            const res = await reserve.trade(
                token.address /* srcToken */,
                amount /* srcAmount */,
                ETH_TOKEN_ADDRESS /* destToken */,
                user /* destAddress */,
                conversionRate /* conversionRate */,
                true /* validate */,
                { from: kyberNetwork }
            );

            truffleAssert.eventEmitted(res, "TradeExecute", ev => {
                return (
                    ev.sender === kyberNetwork &&
                    ev.src === token.address &&
                    ev.srcAmount.eq(new BigNumber(amount)) &&
                    ev.destToken === ETH_TOKEN_ADDRESS &&
                    ev.destAmount.eq(
                        new BigNumber(10)
                            .pow(18)
                            .mul(2)
                            .mul(0.9975)
                    ) &&
                    ev.destAddress === user
                );
            });
        });
    });

    describe("#setFee", () => {
        it("default fee", async () => {
            const newReserve = await KyberUniswapReserve.new(
                1 /* uniswapFactory */,
                admin,
                kyberNetwork
            );

            const feeValue = await newReserve.feeBps();

            feeValue.should.be.bignumber.eq(DEFAULT_FEE_BPS);
        });

        it("fee value saved", async () => {
            await reserve.setFee(30, { from: admin });

            const feeValue = await reserve.feeBps();
            feeValue.should.be.bignumber.eq(30);
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
                return ev.bps.eq(20);
            });
        });
    });


});

async function dbg(...args) {
    if (DEBUG) console.log(...args);
}
