const TestToken = artifacts.require("TestToken.sol");
// using mock contract here, as we need to read the hasInited value
const MocknimbleStaking = artifacts.require("MocknimbleStaking.sol");

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
let NIMToken;
const tokenDecimals = 18;

// staking and its params
let nimbleStaking;
let epochPeriod = new BN(1000);
let firstBlockTimestamp;

contract('nimbleStaking simulator', async (accounts) => {
    before('one time init: Stakers, nimbleStaking, NIM token', async() => {
        admin = accounts[1];
        daoOperator = accounts[2];
        stakers = accounts.slice(5,); // 5 stakers
        NIMToken = await TestToken.new("nimble Crystals", "NIM", tokenDecimals);

        // prepare nimble staking
        firstBlockTimestamp = await Helper.getCurrentBlockTime();

        nimbleStaking = await MocknimbleStaking.new(
            NIMToken.address,
            epochPeriod,
            firstBlockTimestamp + 1000,
            daoOperator
          );
    });

    beforeEach("deposits some NIM tokens to each account, gives allowance to staking contract", async() => {
        // 1M NIM token
        let NIMTweiDepositAmount = new BN(1000000).mul(precisionUnits);
        let maxAllowance = (new BN(2)).pow(new BN(255));
        // transfer tokens, approve staking contract
        for(let i = 0; i < stakers.length; i++) {
            await NIMToken.transfer(stakers[i], NIMTweiDepositAmount);
            let expectedResult = await NIMToken.balanceOf(stakers[i]);
            Helper.assertEqual(expectedResult, NIMTweiDepositAmount, "staker did not receive tokens");
            await NIMToken.approve(nimbleStaking.address, maxAllowance, {from: stakers[i]});
            expectedResult = await NIMToken.allowance(stakers[i], nimbleStaking.address);
            Helper.assertEqual(expectedResult, maxAllowance, "staker did not give sufficient allowance");
        }
    });

    it(`fuzz tests nimbleStaking contract with ${NUM_RUNS} loops`, async() => {
        await StakeSimulator.doFuzzStakeTests(
            nimbleStaking, NUM_RUNS, NIMToken, stakers, epochPeriod
        );
    });
});
