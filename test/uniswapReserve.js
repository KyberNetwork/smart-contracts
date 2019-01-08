const web3 = require("web3");

const BigNumber = require("bignumber.js");

require("chai")
    .use(require("chai-as-promised"))
    .use(require("chai-bignumber")(BigNumber))
    .should();

const truffleAssert = require("truffle-assertions");

const MockUniswapFactory = artifacts.require("MockUniswapFactory");
const UniswapReserve = artifacts.require("UniswapReserve");
const TestToken = artifacts.require("TestToken");

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
        reserve = await UniswapReserve.new(uniswapFactoryMock.address);
        dbg(`UniswapReserve deployed to address ${reserve.address}`);

        token = await deployToken();
    });

    // beforeEach("setup contract for each test", async () => {});

    describe("constructor params", () => {
        it("UniswapFactory must not be 0", async () => {
            await truffleAssert.reverts(
                UniswapReserve.new(0 /* _uniswapFactory */)
            );
        });

        it("UniswapFactory is saved", async () => {
            const uniswapFactoryAddress =
                "0x0000000000000000000000000000000000000001";
            const reserve = await UniswapReserve.new(uniswapFactoryAddress);

            const uniswapFactory = await reserve.uniswapFactory();
            uniswapFactory.should.be.eq(uniswapFactoryAddress);
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
        it("initial", async () => {
            await reserve.getConversionRate(
                token.address /* src */,
                token.address /* dst */,
                1 /* srcQty */,
                0 /* blockNumber */
            );
        });

        it("simple conversion rate", async () => {
            // setup uniswap rate
            // getConversionRate
            // assert
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
});

async function dbg(...args) {
    if (DEBUG) console.log(...args);
}
