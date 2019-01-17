const web3 = require("web3");

const BigNumber = require("bignumber.js");

require("chai")
    .use(require("chai-as-promised"))
    .use(require("chai-bignumber")(BigNumber))
    .should();

const helper = require("./helper.js");

const truffleAssert = require("truffle-assertions");

const MockUniswapFactory = artifacts.require("MockUniswapFactory");
const UniswapReserve = artifacts.require("TestingUniswapReserve");
const TestToken = artifacts.require("TestToken");

const ETH_TOKEN_ADDRESS = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

let DEFAULT_FEE_BPS;

let DEBUG = true;

let uniswapFactoryMock;
let reserve;

let token;

let admin;
let alerter;
let user;
let kyberNetwork;

contract("UniswapReserve", async accounts => {
    const deployToken = async (decimals = 18) => {
        const token = await TestToken.new("Some Token", "KNC", decimals, {
            from: admin
        });
        dbg(
            `Deployed test token with ${decimals} decimals at ${token.address}`
        );
        return token;
    };

    const prepareUniswapFactory = async token => {
        const uniswapFactory = await MockUniswapFactory.new();
        dbg(`UniswapFactoryMock deployed to address ${uniswapFactory.address}`);

        const bigAmount = new BigNumber(10).pow(18).mul(100);
        await helper.sendEtherWithPromise(
            admin /* sender */,
            uniswapFactory.address /* recv */,
            bigAmount /* amount */
        );

        // TODO: maybe do this after listing the token
        token.transfer(uniswapFactory.address, bigAmount);

        return uniswapFactory;
    };

    before("setup", async () => {
        admin = accounts[0];
        alerter = accounts[1];
        user = accounts[2];
        kyberNetwork = accounts[3];

        token = await deployToken();

        // Fund KyberNetwork
        await token.transfer(kyberNetwork, new BigNumber(10).pow(18).mul(100), {
            from: admin
        });

        uniswapFactoryMock = await prepareUniswapFactory(token);
        reserve = await UniswapReserve.new(
            uniswapFactoryMock.address /* uniswap */,
            admin /* admin */,
            kyberNetwork /* kyberNetwork */
        );
        dbg(`UniswapReserve deployed to address ${reserve.address}`);

        DEFAULT_FEE_BPS = await reserve.DEFAULT_FEE_BPS();

        await reserve.listToken(token.address, { from: admin });

        await reserve.addAlerter(alerter, { from: admin });
    });

    beforeEach("setup contract for each test", async () => {
        await reserve.enableTrade({ from: admin });
        await reserve.setFee(DEFAULT_FEE_BPS);
        await uniswapFactoryMock.setRateEthToToken(0, 0);
        await uniswapFactoryMock.setRateTokenToEth(0, 0);
    });

    describe("constructor params", () => {
        it("UniswapFactory must not be 0", async () => {
            await truffleAssert.reverts(
                UniswapReserve.new(0 /* _uniswapFactory */, admin, kyberNetwork)
            );
        });

        it("admin must not be 0", async () => {
            await truffleAssert.reverts(
                UniswapReserve.new(
                    uniswapFactoryMock.address,
                    0 /* _admin */,
                    kyberNetwork
                )
            );
        });

        it("kyberNetwork must not be 0", async () => {
            await truffleAssert.reverts(
                UniswapReserve.new(
                    uniswapFactoryMock.address,
                    admin /* _admin */,
                    0 /* kyberNetwork */
                )
            );
        });

        it("UniswapFactory is saved", async () => {
            const uniswapFactoryAddress =
                "0x0000000000000000000000000000000000000001";
            const newReserve = await UniswapReserve.new(
                uniswapFactoryAddress,
                admin,
                kyberNetwork
            );

            const uniswapFactory = await newReserve.uniswapFactory();
            uniswapFactory.should.be.eq(uniswapFactoryAddress);
        });

        it("admin is saved", async () => {
            const admin = "0x0000000000000000000000000000000000000001";
            const newReserve = await UniswapReserve.new(
                uniswapFactoryMock.address,
                admin,
                kyberNetwork
            );

            const adminValue = await newReserve.admin();
            adminValue.should.be.eq(admin);
        });

        it("kyberNetwork is saved", async () => {
            const kyberNetwork = "0x0000000000000000000000000000000000000001";
            const newReserve = await UniswapReserve.new(
                uniswapFactoryMock.address,
                admin,
                kyberNetwork
            );

            const kyberNetworkAddress = await newReserve.kyberNetwork();
            kyberNetworkAddress.should.be.eq(kyberNetwork);
        });
    });

    describe("Misc", () => {
        it("should be able to send ETH to reserve", async () => {
            await helper.sendEtherWithPromise(
                admin /* sender */,
                reserve.address /* recv */,
                1 /* amount */
            );
        });

        it("should allow admin to withdraw tokens", async () => {
            const amount = web3.utils.toWei("1");
            const initialWethBalance = await token.balanceOf(admin);

            await token.transfer(reserve.address, amount, { from: admin });
            const res = await reserve.withdrawToken(
                token.address,
                amount,
                admin,
                {
                    from: admin
                }
            );

            const balance = await token.balanceOf(admin);
            balance.should.be.bignumber.eq(initialWethBalance);

            truffleAssert.eventEmitted(res, "TokenWithdraw", ev => {
                return (
                    ev.token === token.address &&
                    ev.amount.eq(amount) &&
                    ev.sendTo === admin
                );
            });
        });

        it("reject withdrawing tokens by non-admin users", async () => {
            const amount = web3.utils.toWei("1");
            await token.transfer(reserve.address, amount, { from: admin });

            await truffleAssert.reverts(
                reserve.withdrawToken(token.address, amount, user, {
                    from: user
                })
            );
        });
    });

    describe("#getConversionRate", () => {
        it("conversion rate 1:1", async () => {
            await reserve.setFee(0, { from: admin });
            await uniswapFactoryMock.setRateEthToToken(
                1 /* eth */,
                1 /* token */
            );

            const rate = await reserve.getConversionRate(
                ETH_TOKEN_ADDRESS /* src */,
                token.address /* dst */,
                web3.utils.toWei("1") /* srcQty */,
                0 /* blockNumber */
            );

            rate.should.be.bignumber.eq(new BigNumber(10).pow(18));
        });

        it("conversion rate eth -> token of 1:2", async () => {
            await reserve.setFee(0, { from: admin });
            await uniswapFactoryMock.setRateEthToToken(
                1 /* eth */,
                2 /* token */
            );

            const rate = await reserve.getConversionRate(
                ETH_TOKEN_ADDRESS /* src */,
                token.address /* dst */,
                web3.utils.toWei("1") /* srcQty */,
                0 /* blockNumber */
            );

            // kyber rates are destQty / srcQty
            rate.should.be.bignumber.eq(new BigNumber(10).pow(18).mul(2));
        });

        it("conversion rate eth -> token of 2:1", async () => {
            await reserve.setFee(0, { from: admin });
            await uniswapFactoryMock.setRateEthToToken(
                2 /* eth */,
                1 /* token */
            );

            const rate = await reserve.getConversionRate(
                ETH_TOKEN_ADDRESS /* src */,
                token.address /* dst */,
                web3.utils.toWei("1") /* srcQty */,
                0 /* blockNumber */
            );

            rate.should.be.bignumber.eq(new BigNumber(10).pow(18).mul(0.5));
        });

        it("conversion rate token -> eth of 2:1", async () => {
            await reserve.setFee(0, { from: admin });
            await uniswapFactoryMock.setRateTokenToEth(
                1 /* eth */,
                2 /* token */
            );

            const rate = await reserve.getConversionRate(
                token.address /* src */,
                ETH_TOKEN_ADDRESS /* dst */,
                web3.utils.toWei("1") /* srcQty */,
                0 /* blockNumber */
            );

            rate.should.be.bignumber.eq(new BigNumber(10).pow(18).mul(0.5));
        });

        it("conversion rate token -> eth of 1:2", async () => {
            await reserve.setFee(0, { from: admin });
            await uniswapFactoryMock.setRateTokenToEth(
                2 /* eth */,
                1 /* token */
            );

            const rate = await reserve.getConversionRate(
                token.address /* src */,
                ETH_TOKEN_ADDRESS /* dst */,
                web3.utils.toWei("1") /* srcQty */,
                0 /* blockNumber */
            );

            rate.should.be.bignumber.eq(new BigNumber(10).pow(18).mul(2));
        });

        it("conversion between a non-18 decimals token and ETH");
        it("conversion between ETH and a non-18 decimals token");

        it("fail if both tokens are ETH", async () => {
            await truffleAssert.reverts(
                reserve.getConversionRate(
                    ETH_TOKEN_ADDRESS /* src */,
                    ETH_TOKEN_ADDRESS /* dst */,
                    web3.utils.toWei("1") /* srcQty */,
                    0 /* blockNumber */
                )
            );
        });

        it("fail if both tokens are not ETH", async () => {
            await truffleAssert.reverts(
                reserve.getConversionRate(
                    token.address /* src */,
                    token.address /* dst */,
                    web3.utils.toWei("1") /* srcQty */,
                    0 /* blockNumber */
                )
            );
        });

        it("fail for unsupported tokens", async () => {
            const newToken = await deployToken();

            await truffleAssert.reverts(
                reserve.getConversionRate(
                    newToken.address /* src */,
                    ETH_TOKEN_ADDRESS /* dst */,
                    web3.utils.toWei("1") /* srcQty */,
                    0 /* blockNumber */
                )
            );
        });

        it("conversion rate eth -> token of 1:2, with 1% fees", async () => {
            await reserve.setFee(100, { from: admin });
            await uniswapFactoryMock.setRateEthToToken(
                1 /* eth */,
                2 /* token */
            );

            const rate = await reserve.getConversionRate(
                ETH_TOKEN_ADDRESS /* src */,
                token.address /* dst */,
                web3.utils.toWei("1") /* srcQty */,
                0 /* blockNumber */
            );

            // kyber rates are destQty / srcQty
            rate.should.be.bignumber.eq(
                new BigNumber(10)
                    .pow(18)
                    .mul(0.99)
                    .mul(2)
            );
        });

        it("conversion rate token -> eth of 2:1, with 5% fees", async () => {
            await reserve.setFee(500, { from: admin });
            await uniswapFactoryMock.setRateTokenToEth(
                1 /* eth */,
                2 /* token */
            );

            const rate = await reserve.getConversionRate(
                token.address /* src */,
                ETH_TOKEN_ADDRESS /* dst */,
                web3.utils.toWei("1") /* srcQty */,
                0 /* blockNumber */
            );

            rate.should.be.bignumber.eq(
                new BigNumber(10)
                    .pow(18)
                    .mul(0.95)
                    .div(2)
            );
        });

        it("returns 0 if trade is disabled", async () => {
            await reserve.setFee(500, { from: admin });
            await uniswapFactoryMock.setRateTokenToEth(
                1 /* eth */,
                2 /* token */
            );

            await reserve.disableTrade({ from: alerter });

            const rate = await reserve.getConversionRate(
                token.address /* src */,
                ETH_TOKEN_ADDRESS /* dst */,
                web3.utils.toWei("1") /* srcQty */,
                0 /* blockNumber */
            );

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
                    expectedConversionRate.sub(1) /* conversionRate */,
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
            const newReserve = await UniswapReserve.new(
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

        it("adding token", async () => {
            const newToken = await deployToken();

            await reserve.listToken(newToken.address, { from: admin });

            const exchange = await reserve.tokenExchange(newToken.address);
            exchange.should.not.be.bignumber.eq(0);
        });

        it("listing a token saves its decimals", async () => {
            const newToken = await deployToken(10);

            await reserve.listToken(newToken.address, { from: admin });

            const decimals = await reserve.getTokenDecimals(newToken.address);
            decimals.should.be.bignumber.eq(10);
        });

        it("fails for token with address 0", async () => {
            await truffleAssert.reverts(reserve.listToken(0, { from: user }));
        });

        it("event sent on token listed", async () => {
            const newToken = await deployToken();

            const res = await reserve.listToken(newToken.address, {
                from: admin
            });

            const tokenExchange = await uniswapFactoryMock.getExchange(
                newToken.address
            );
            truffleAssert.eventEmitted(res, "TokenListed", ev => {
                return (
                    ev.token === newToken.address &&
                    ev.exchange === tokenExchange
                );
            });
        });

        it("listing a token saves its uniswap exchange address", async () => {
            const newToken = await deployToken();
            const tokenExchange = await uniswapFactoryMock.createExchange.call(
                newToken.address
            );

            await reserve.listToken(newToken.address, { from: admin });

            const exchange = await reserve.tokenExchange(newToken.address);
            exchange.should.be.eq(tokenExchange);
        });

        it("listing token gives allowence to exchange", async () => {
            const newToken = await deployToken();
            const tokenExchange = await uniswapFactoryMock.createExchange.call(
                newToken.address
            );

            await reserve.listToken(newToken.address, { from: admin });

            const amount = await newToken.allowance(
                reserve.address,
                tokenExchange
            );
            amount.should.be.bignumber.eq(new BigNumber(2).pow(255));
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
            const newToken = await deployToken();
            await reserve.listToken(newToken.address, { from: admin });

            await reserve.delistToken(newToken.address);

            const exchange = await reserve.tokenExchange(newToken.address);
            exchange.should.be.bignumber.eq(0);
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
});

async function dbg(...args) {
    if (DEBUG) console.log(...args);
}
