const TestToken = artifacts.require("TestToken.sol");
// using mock contract here, as we need to read the hasInited value
const MockKyberStaking = artifacts.require("MockKyberStaking.sol");

const Helper = require("../helper.js");
const BN = web3.utils.BN;
const StakeSimulator = require("./fuzzerFiles/stakingFuzzer/stakingSimulator.js");
const { precisionUnits } = require("../helper.js");

//global variables
//////////////////
const NUM_RUNS = 100;

// accounts
let admin;
let daoOperator;
let stakers;

// token
let kncToken;
const tokenDecimals = 18;

// staking and its params
let kyberStaking;
let epochPeriod = new BN(1000);
let firstBlockTimestamp;

contract('KyberStaking simulator', async (accounts) => {
    before('one time init: Stakers, KyberStaking, KNC token', async() => {
        admin = accounts[1];
        daoOperator = accounts[2];
        stakers = accounts.slice(5,); // 5 stakers
        kncToken = await TestToken.new("kyber Crystals", "KNC", tokenDecimals);

        // prepare kyber staking
        firstBlockTimestamp = await Helper.getCurrentBlockTime();

        kyberStaking = await MockKyberStaking.new(
            kncToken.address,
            epochPeriod,
            firstBlockTimestamp + 1000,
            daoOperator
          );
    });

    beforeEach("deposits some KNC tokens to each account, gives allowance to staking contract", async() => {
        // 1M KNC token
        let kncTweiDepositAmount = new BN(1000000).mul(precisionUnits);
        let maxAllowance = (new BN(2)).pow(new BN(255));
        // transfer tokens, approve staking contract
        for(let i = 0; i < stakers.length; i++) {
            await kncToken.transfer(stakers[i], kncTweiDepositAmount);
            let expectedResult = await kncToken.balanceOf(stakers[i]);
            Helper.assertEqual(expectedResult, kncTweiDepositAmount, "staker did not receive tokens");
            await kncToken.approve(kyberStaking.address, maxAllowance, {from: stakers[i]});
            expectedResult = await kncToken.allowance(stakers[i], kyberStaking.address);
            Helper.assertEqual(expectedResult, maxAllowance, "staker did not give sufficient allowance");
        }
    });

    it(`fuzz tests kyberStaking contract with ${NUM_RUNS} loops`, async() => {
        await StakeSimulator.doFuzzStakeTests(
            kyberStaking, NUM_RUNS, kncToken, stakers, epochPeriod
        );
    });
});
