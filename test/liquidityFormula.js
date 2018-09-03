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

        Helper.assertAbsDiff(expectedResult,result,expectedDiffInPct);
    });

    it("check ln with fixed input", async function () {
        const precisionBits = 20;
        const precision = new BigNumber(2).pow(precisionBits);
        const q = precision.mul(precision);
        const p = new BigNumber("1245651").mul(q.div(2**3));

        const expectedResult = Helper.ln(new BigNumber(p).div(q)).mul(precision);
        const result = await liquidityContract.ln(p,q,precisionBits);

        Helper.assertAbsDiff(expectedResult,result,expectedDiffInPct);
    });

    it("check P(E) with fixed input", async function () {
        const precisionBits = 30;
        const precision = new BigNumber(2).pow(precisionBits);
        const E = new BigNumber("45.2352");
        const r = new BigNumber("0.02");
        const Pmin = new BigNumber("0.0123");

        // P(E) = Pmin * e^(rE)
        const expectedResult = Helper.exp(e,r.mul(E)).mul(Pmin).mul(precision);
        const result = await liquidityContract.pE(r.mul(precision),
                                                  Pmin.mul(precision),
                                                  E.mul(precision),
                                                  precision);

        Helper.assertAbsDiff(expectedResult,result,expectedDiffInPct);
    });

    it("check deltaT with fixed input", async function () {
        const precisionBits = 30;
        const precision = new BigNumber(2).pow(precisionBits);
        const E = new BigNumber("69.3147180559");
        const deltaE = new BigNumber("10");
        const r = new BigNumber("0.01");
        const Pmin = new BigNumber("0.000025");


        const pe = Helper.exp(e,r.mul(E)).mul(Pmin).mul(precision);
        const pdelta = (Helper.exp(e,r.mul(deltaE).mul(-1)).sub(1)).mul(precision);


        const expectedResult = pdelta.div(pe.mul(r)).mul(precision).mul(-1);
        const result = await liquidityContract.deltaTFunc(r.mul(precision),
                                                          Pmin.mul(precision),
                                                          E.mul(precision),
                                                          deltaE.mul(precision),
                                                          precision);

        console.log(result.div(precision).toString(10));
        console.log(expectedResult.div(precision).toString(10));

        Helper.assertAbsDiff(expectedResult,result,expectedDiffInPct);

        /* Helper.assertAbsDiff(expectedResult2,result2,expectedDiffInPct) */
    });

    it("check deltaE with fixed input", async function () {
        const precisionBits = 30;
        const precision = new BigNumber(2).pow(precisionBits);
        const E = new BigNumber("69.3147180559");
        const deltaT = new BigNumber("10.123").mul(10000);
        const r = new BigNumber("0.01");
        const Pmin = new BigNumber("0.000025");


        const pe = Helper.exp(e,r.mul(E)).mul(Pmin);
        const lnPart = Helper.ln((r.mul(deltaT).mul(pe)).add(1));
        const expectedResult = (lnPart.div(r)).mul(precision);
        const result = await liquidityContract.deltaEFunc(r.mul(precision),
                                                          Pmin.mul(precision),
                                                          E.mul(precision),
                                                          deltaT.mul(precision),
                                                          precision,
                                                          precisionBits);

        console.log(result.div(precision).toString(10));
        console.log(expectedResult.div(precision).toString(10));

        Helper.assertAbsDiff(expectedResult,result,expectedDiffInPct);

        /* Helper.assertAbsDiff(expectedResult2,result2,expectedDiffInPct; */
    });


});
