const Liquidity = artifacts.require("./LiquidityFormula.sol");

const Helper = require("./helper.js");
const Math = require('mathjs');
const BigNumber = require('bignumber.js');

const e = new BigNumber("2.7182818284590452353602874713527");

let liquidityContract;

function absDiff(num1,num2) {
    const bigNum1 = new BigNumber(num1);
    const bigNum2 = new BigNumber(num2);

    if(bigNum1.gt(bigNum2)) {
        return bigNum1.minus(bigNum2);
    }
    else {
        return bigNum2.minus(bigNum1);
    }
}

function checkAbsDiff(num1, num2, maxDiffInPercentage) {
    const maxDiffBig = new BigNumber(maxDiffInPercentage);
    const diff = absDiff(num1,num2);
    return (diff.div(num1)).lte(maxDiffInPercentage.div(100));
}

function exp(num1,num2) {
    const num1Math = Math.bignumber(new BigNumber(num1).toString(10));
    const num2Math = Math.bignumber(new BigNumber(num2).toString(10));

    const result = Math.pow(num1Math,num2Math);

    return new BigNumber(result.toString());
}

function ln(num) {
    const numMath = Math.bignumber(new BigNumber(num).toString(10));

    const result = Math.log(numMath);

    return new BigNumber(result.toString());
}



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

        const expectedResult = exp(e,new BigNumber(p).div(q)).mul(precision);
        const result = await liquidityContract.exp(p,q,precision);

        assert(checkAbsDiff(expectedResult,result,precision.div(0.001)),
               "exp result diff is " + absDiff(expectedResult,result).toString(10));
    });


});
