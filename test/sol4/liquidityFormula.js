const Liquidity = artifacts.require("./LiquidityFormula.sol");

const Helper = require("../helper.js");
const BN = web3.utils.BN;

const e = 2.7182818284590452353602874713527;
const expectedDiffInPct = 0.01;

let liquidityContract;

contract('FeeBurner', function(accounts) {
    it("deploy liquidity contract", async function () {
        liquidityContract = await Liquidity.new();
    });

    it("check checkMultOverflow", async function () {
        const big = new BN(2).pow(new BN(128));
        const small = new BN(2).pow(new BN(100));

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
        const precision = new BN(2).pow(new BN(precisionBits));
        const q = precision.mul(precision);
        const p = new BN(121).mul(q.div(new BN(2**3)));

        const expectedResult = new BN(Helper.exp(e,new BN(p).div(q)) * 10**9).mul(precision).div(new BN(10**9));
        const result = await liquidityContract.exp(p,q,precision);

        Helper.assertAbsDiff(expectedResult,result,expectedDiffInPct);
    });

    it("check ln with fixed input", async function () {
        const precisionBits = 20;
        const precision = new BN(2).pow(new BN(precisionBits));
        const q = precision.mul(precision);
        const p = new BN(1245651).mul(q.div(new BN(2**3)));

        const expectedResult = new BN(Helper.ln(new BN(p).div(q)) * 10**9).mul(precision).div(new BN(10**9));
        const result = await liquidityContract.ln(p,q,precisionBits);

        Helper.assertAbsDiff(expectedResult,result,expectedDiffInPct);
    });

    it("check P(E) with fixed input", async function () {
        const precisionBits = 30;
        const precision = new BN(2).pow(new BN(precisionBits));
        const E = 45.2352;
        const r = 0.02;
        const Pmin = 0.0123;

        // P(E) = Pmin * e^(rE)
        const expectedResult = new BN(Helper.exp(e, r * E) * 10**9).mul(new BN(Pmin * 10**4)).mul(precision).div(new BN(10**4)).div(new BN(10**9));
        const result = await liquidityContract.pE(new BN(r * 100).mul(precision).div(new BN(100)),
                                                  new BN(Pmin * 10**4).mul(precision).div(new BN(10**4)),
                                                  new BN(E * 10**4).mul(precision).div(new BN(10**4)),
                                                  precision);

        Helper.assertAbsDiff(expectedResult,result,expectedDiffInPct);
    });

    it("check deltaT with fixed input", async function () {
        const precisionBits = 30;
        const precision = new BN(2).pow(new BN(precisionBits));
        const E = 69.3147180559
        const deltaE = 10
        const r = 0.01
        const Pmin = 0.000025

        const pe = (new BN(Helper.exp(e, r * E) * Pmin * 10**9)).mul(precision).div(new BN(10**9));
        const pdelta = (new BN((Helper.exp(e, r * deltaE * -1) - 1) * 10**9)).mul(precision).div(new BN(10**9));
        const expectedResult = new BN(pdelta/(pe * r) * 10**9).mul(precision).div(new BN(10**9)).mul(new BN(-1));
        const result = await liquidityContract.deltaTFunc((new BN(r * 100)).mul(precision).div(new BN(100)),
                                                          new BN(Pmin * 10**6).mul(precision).div(new BN(10**6)),
                                                          new BN(E * 10**9).mul(precision).div(new BN(10**9)),
                                                          new BN(deltaE).mul(precision),
                                                          precision);

        Helper.assertAbsDiff(expectedResult,result,expectedDiffInPct);

        /* Helper.assertAbsDiff(expectedResult2,result2,expectedDiffInPct) */
    });

    it("check deltaE with fixed input", async function () {
        const precisionBits = 30;
        const precision = new BN(2).pow(new BN(precisionBits));
        const E = 69.3147180559;
        const deltaT = 10.123 * 10000;
        const r = 0.01;
        const Pmin = 0.000025;

        const pe = Helper.exp(e, r * E) * Pmin;
        const lnPart = Helper.ln(r * deltaT * pe + 1);
        const expectedResult = (new BN(lnPart / r * 10**9)).mul(precision).div(new BN(10**9));

        const result = await liquidityContract.deltaEFunc(new BN(r * 100).mul(precision).div(new BN(100)),
                                                          new BN(Pmin * 10**6).mul(precision).div(new BN(10**6)),
                                                          new BN(E * 10**9).mul(precision).div(new BN(10**9)),
                                                          new BN(deltaT).mul(precision),
                                                          precision,
                                                          precisionBits);

        Helper.assertAbsDiff(expectedResult,result,expectedDiffInPct);

        /* Helper.assertAbsDiff(expectedResult2,result2,expectedDiffInPct; */
    });


});
