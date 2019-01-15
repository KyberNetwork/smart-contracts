const web3 = require("web3");

const BigNumber = require("bignumber.js");

require("chai")
    .use(require("chai-as-promised"))
    .use(require("chai-bignumber")(BigNumber))
    .should();

const truffleAssert = require("truffle-assertions");

const MockUniswapFactory = artifacts.require("MockUniswapFactory");
const UniswapReserve = artifacts.require("TestingUniswapReserve");
const TestToken = artifacts.require("TestToken");

const ETH_TOKEN_ADDRESS = "0x00eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

let DEFAULT_FEE_BPS;

let DEBUG = true;

let uniswapFactoryMock;
let reserve;

let token;

let admin;
let user;

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

    before("setup", async () => {
        admin = accounts[0];
        user = accounts[1];

        uniswapFactoryMock = await MockUniswapFactory.new();
        dbg(
            `UniswapFactoryMock deployed to address ${
                uniswapFactoryMock.address
            }`
        );
        reserve = await UniswapReserve.new(uniswapFactoryMock.address, admin);
        dbg(`UniswapReserve deployed to address ${reserve.address}`);

        DEFAULT_FEE_BPS = await reserve.DEFAULT_FEE_BPS();

        token = await deployToken();
        await reserve.listToken(token.address);
    });

    beforeEach("setup contract for each test", async () => {
        await reserve.setFee(DEFAULT_FEE_BPS);
        await uniswapFactoryMock.setRateEthToToken(0, 0);
        await uniswapFactoryMock.setRateTokenToEth(0, 0);
    });

    describe("constructor params", () => {
        it("UniswapFactory must not be 0", async () => {
            await truffleAssert.reverts(
                UniswapReserve.new(0 /* _uniswapFactory */, admin)
            );
        });

        it("admin must not be 0", async () => {
            await truffleAssert.reverts(
                UniswapReserve.new(uniswapFactoryMock.address, 0 /* _admin */)
            );
        });

        it("UniswapFactory is saved", async () => {
            const uniswapFactoryAddress =
                "0x0000000000000000000000000000000000000001";
            const newReserve = await UniswapReserve.new(
                uniswapFactoryAddress,
                admin
            );

            const uniswapFactory = await newReserve.uniswapFactory();
            uniswapFactory.should.be.eq(uniswapFactoryAddress);
        });

        it("admin is saved", async () => {
            const admin = "0x0000000000000000000000000000000000000001";
            const newReserve = await UniswapReserve.new(
                uniswapFactoryMock.address,
                admin
            );

            const adminValue = await newReserve.admin();
            adminValue.should.be.eq(admin);
        });
    });

    describe("Withdrawable", () => {
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
    });

    describe("#trade", () => {
        it("initial", async () => {
            await reserve.trade(
                token.address /* srcToken */,
                1 /* srcAmount */,
                token.address /* dstToken */,
                0x00 /* destAddress */,
                0 /* conversionRate */,
                false /* validate */
            );
        });
    });

    describe("#setFee", () => {
        it("default fee", async () => {
            const newReserve = await UniswapReserve.new(
                1 /* uniswapFactory */,
                admin
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

        it("fail for fee > 10000");
        it("event sent on setFee");
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
});

async function dbg(...args) {
    if (DEBUG) console.log(...args);
}
