const Liquidity = artifacts.require("./LiquidityFormula.sol");

const Helper = require("./helper.js");
const BigNumber = require('bignumber.js');

const e = new BigNumber("2.7182818284590452353602874713527");
const expectedDiffInPct = new BigNumber(1/100);

let liquidityContract;

contract('FeeBurner', function(accounts) {
    it("deploy liquidity contract", async function () {
        liquidityContract = await Liquidity.new();
    });

    it("check checkMultOverflow", async function () {
        const big = new BigNumber(2).pow(128);
        const small = new BigNumber(2).pow(100);

        let overflow;

        overflow = await liquidityContract.checkMultOverflow(big,big);
        assert( overflow, "big * big should overflow");

        overflow = await liquidityContract.checkMultOverflow(small,big);
        assert( ! overflow, "big * small should not overflow");

        overflow = await liquidityContract.checkMultOverflow(0,big);
        assert( ! overflow, "0 * big should not overflow");

        overflow = await liquidityContract.checkMultOverflow(big,0);
        assert( ! overflow, "big * 0 should not overflow");
    });

    it("check exp with fixed input", async function () {
        const precisionBits = 20;
        const precision = new BigNumber(2).pow(precisionBits);
        const q = precision.mul(precision);
        const p = new BigNumber("121").mul(q.div(2**3));

        const expectedResult = Helper.exp(e,new BigNumber(p).div(q)).mul(precision);
        const result = await liquidityContract.exp(p,q,precision);

        assert(Helper.checkAbsDiff(expectedResult,result,expectedDiffInPct),
               "exp result diff is " + Helper.absDiff(expectedResult,result).toString(10));
    });

    it("check ln with fixed input", async function () {
        const precisionBits = 20;
        const precision = new BigNumber(2).pow(precisionBits);
        const q = precision.mul(precision);
        const p = new BigNumber("1245651").mul(q.div(2**3));

        const expectedResult = Helper.ln(new BigNumber(p).div(q)).mul(precision);
        const result = await liquidityContract.ln(p,q,precisionBits);

        assert(Helper.checkAbsDiff(expectedResult,result,expectedDiffInPct),
               "exp result diff is " + Helper.absDiff(expectedResult,result).toString(10));
    });



});
