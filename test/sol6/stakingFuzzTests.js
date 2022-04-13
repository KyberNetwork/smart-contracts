const TestToken = artifacts.require("TestToken.sol");
// using mock contract here, as we need to read the hasInited value
const MockNimbleStaking = artifacts.require("MockNimbleStaking.sol");

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
let NimbleStaking;
let epochPeriod = new BN(1000);
let firstBlockTimestamp;

contract('NimbleStaking simulator', async (accounts) => {
    before('one time init: Stakers, NimbleStaking, KNC token', async() => {
        admin = accounts[1];
        daoOperator = accounts[2];
        stakers = accounts.slice(5,); // 5 stakers
        kncToken = await TestToken.new("Nimble Crystals", "KNC", tokenDecimals);

        // prepare Nimble staking
        firstBlockTimestamp = await Helper.getCurrentBlockTime();

        NimbleStaking = await MockNimbleStaking.new(
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
            await kncToken.approve(NimbleStaking.address, maxAllowance, {from: stakers[i]});
            expectedResult = await kncToken.allowance(stakers[i], NimbleStaking.address);
            Helper.assertEqual(expectedResult, maxAllowance, "staker did not give sufficient allowance");
        }
    });

    it(`fuzz tests NimbleStaking contract with ${NUM_RUNS} loops`, async() => {
        await StakeSimulator.doFuzzStakeTests(
            NimbleStaking, NUM_RUNS, kncToken, stakers, epochPeriod
        );
    });
});
