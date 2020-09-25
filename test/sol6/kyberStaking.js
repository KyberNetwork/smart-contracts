const TestToken = artifacts.require("Token.sol");
const MockKyberDao = artifacts.require("MockKyberDaoTestHandleWithdrawal.sol");
const MockKyberDaoWithdrawFailed = artifacts.require("MockKyberDaoWithdrawFailed.sol");
const StakingContract = artifacts.require("MockKyberStaking.sol");
const MaliciousStaking = artifacts.require("MockKyberStakingMalicious.sol");
const MaliciousDaoReentrancy = artifacts.require("MockMaliciousKyberDaoReentrancy.sol");
const Helper = require("../helper.js");

const BN = web3.utils.BN;

const { precisionUnits, zeroAddress } = require("../helper.js");
const { expectEvent, expectRevert } = require('@openzeppelin/test-helpers');

let kyberDao;

let currentBlock;

let epochPeriod = 20;
let startBlock;
let blockTime;
let currentChainTime;
let kncToken;
let stakingContract;
let victor;
let loi;
let mike;

contract('KyberStaking', function(accounts) {
  before("one time init", async() => {
    kyberDao = accounts[1];
    kncToken = await TestToken.new("Kyber Network Crystal", "KNC", 18);
    victor = accounts[2];
    loi = accounts[3];
    mike = accounts[4];
  });

  beforeEach("running before each test", async() => {
    currentBlock = await Helper.getCurrentBlock();
    currentChainTime = await Helper.getCurrentBlockTime();
    console.log(`chain start block: ${currentBlock}, start time: ${currentChainTime}`);
    blockTime = 16; // each block is mined after 16s
  });

  const blockToTimestamp = function(block) {
    return currentChainTime + (block - currentBlock) * blockTime;
  };

  const blocksToSeconds = function(blocks) {
    return blocks * blockTime;
  };

  const deployStakingContract = async(_epochPeriod, _startBlock) => {
    epochPeriod = _epochPeriod;
    startBlock = _startBlock;
    console.log(`deploy staking contract: period: ${blocksToSeconds(epochPeriod)}, start: ${blockToTimestamp(startBlock)}`);
    stakingContract = await StakingContract.new(
      kncToken.address,
      blocksToSeconds(epochPeriod),
      blockToTimestamp(startBlock),
      kyberDao
    );
  };

  const checkInitAndReturnStakerDataForCurrentEpoch = async(
	  staker, stake, delegatedStake, representative, sender) => {
	await stakingContract.initAndReturnStakerDataForCurrentEpoch(staker, {from: sender});
	let result = await stakingContract.initAndReturnStakerDataForCurrentEpoch.call(staker, {from: sender});
	Helper.assertEqual(stake, result.stake);
	Helper.assertEqual(delegatedStake, result.delegatedStake);
	Helper.assertEqual(representative, result.representative);
  };

  it("Test get epoch number returns correct data", async function() {
    await deployStakingContract(10, currentBlock + 10);

    let currentEpoch = 0;
    Helper.assertEqual(currentEpoch, await stakingContract.getCurrentEpochNumber(), "wrong epoch number");

    currentEpoch = 1;
    // delay until start timestamp of epoch 1
    await Helper.mineNewBlockAt(blockToTimestamp(startBlock));

    currentTime = await Helper.getCurrentBlockTime();
    Helper.assertEqual(currentEpoch, await stakingContract.getCurrentEpochNumber(), "wrong epoch number");
    Helper.assertEqual(currentEpoch, await stakingContract.getEpochNumber(currentTime), "wrong epoch number");

    // delay until end timestamp of epoch 1
    await Helper.mineNewBlockAt(blockToTimestamp(epochPeriod + startBlock) - 1);
    Helper.assertEqual(currentEpoch, await stakingContract.getCurrentEpochNumber(), "wrong epoch number");

    currentEpoch = 10;
    await Helper.mineNewBlockAt(blockToTimestamp(startBlock + 9 * epochPeriod));
    currentTime = await Helper.getCurrentBlockTime();
    Helper.assertEqual(currentEpoch, await stakingContract.getEpochNumber(currentTime), "wrong epoch number");
    Helper.assertEqual(currentEpoch, await stakingContract.getCurrentEpochNumber(), "wrong epoch number");
  });

  describe("#Deposit Tests", () => {
    it("Test deposit at beginning of epoch, stakes change as expected", async function() {
      await deployStakingContract(6, currentBlock + 6);

      await kncToken.transfer(victor, mulPrecision(100));
      await kncToken.approve(stakingContract.address, mulPrecision(100), {from: victor});

      Helper.assertEqual(0, await stakingContract.getStake(victor, 0), "stake at epoch 0 is wrong");
      Helper.assertEqual(0, await stakingContract.getLatestStakeBalance(victor), "latest stake balance is wrong");

      // delay to start of epoch 1
      await Helper.setNextBlockTimestamp(
        blockToTimestamp(startBlock)
      );
      await stakingContract.deposit(mulPrecision(20), {from: victor});

      Helper.assertEqual(0, await stakingContract.getStakesValue(victor, 1), "stake at epoch 1 is wrong");
      Helper.assertEqual(mulPrecision(20), await stakingContract.getStakesValue(victor, 2), "stake at epoch 2 is wrong");

      // delay to start of epoch 4
      await Helper.setNextBlockTimestamp(
        blockToTimestamp(3 * epochPeriod + startBlock)
      );
      await stakingContract.deposit(mulPrecision(30), {from: victor});

      assert.equal(false, await stakingContract.getHasInitedValue(victor, 3), "shouldn't init value at epoch 3");
      Helper.assertEqual(mulPrecision(20), await stakingContract.getStake(victor, 3), "stake at epoch 3 is wrong");

      Helper.assertEqual(mulPrecision(20), await stakingContract.getStakesValue(victor, 4), "stake at epoch 4 is wrong");
      Helper.assertEqual(mulPrecision(50), await stakingContract.getStakesValue(victor, 5), "stake at epoch 5 is wrong");
    });

    it("Test deposit at end of epoch, stakes change as expected", async function() {
      await deployStakingContract(6, currentBlock + 6);

      await kncToken.transfer(victor, mulPrecision(100));
      await kncToken.approve(stakingContract.address, mulPrecision(100), {from: victor});

      Helper.assertEqual(0, await stakingContract.getStake(victor, 0), "stake at epoch 0 is wrong");
      Helper.assertEqual(0, await stakingContract.getLatestStakeBalance(victor), "latest stake balance is wrong");

      await stakingContract.deposit(mulPrecision(10), {from: victor});

      Helper.assertEqual(0, await stakingContract.getStakesValue(victor, 0), "stake at epoch 0 is wrong");
      Helper.assertEqual(mulPrecision(10), await stakingContract.getStakesValue(victor, 1), "stake at epoch 1 is wrong");
      Helper.assertEqual(0, await stakingContract.getStakesValue(victor, 2), "shouldn't init value at epoch 2");
      Helper.assertEqual(mulPrecision(10), await stakingContract.getLatestStakeBalance(victor), "latest stake balance is wrong");

      await Helper.setNextBlockTimestamp(
        blockToTimestamp(startBlock) - 1
      );
      await stakingContract.deposit(mulPrecision(20), {from: victor});

      Helper.assertEqual(mulPrecision(30), await stakingContract.getStakesValue(victor, 1), "stake at epoch 1 is wrong");
      Helper.assertEqual(0, await stakingContract.getStakesValue(victor, 2), "shouldn't init value at epoch 2");
      assert.equal(false, await stakingContract.getHasInitedValue(victor, 2), "shouldn't init value at epoch 2");
      Helper.assertEqual(mulPrecision(30), await stakingContract.getLatestStakeBalance(victor), "latest stake balance is wrong");

      await Helper.setNextBlockTimestamp(
        blockToTimestamp(2 * epochPeriod + startBlock) - 1
      );
      await stakingContract.deposit(mulPrecision(20), {from: victor});

      assert.equal(true, await stakingContract.getHasInitedValue(victor, 2), "shouldn't init value at epoch 2");
      Helper.assertEqual(mulPrecision(30), await stakingContract.getStakesValue(victor, 2), "stake at epoch 2 is wrong");
      Helper.assertEqual(mulPrecision(50), await stakingContract.getStakesValue(victor, 3), "should have inited value at epoch 3");
      Helper.assertEqual(mulPrecision(50), await stakingContract.getLatestStakeBalance(victor), "latest stake balance is wrong");
    });

    it("Test deposit then withdraw at same + different epoch, stakes change as expected", async function() {
      await deployStakingContract(6, currentBlock + 6);

      await kncToken.transfer(victor, mulPrecision(200));
      await kncToken.approve(stakingContract.address, mulPrecision(200), {from: victor});

      // deposit at epoch 0
      await stakingContract.deposit(mulPrecision(50), {from: victor});
      // deposit at epoch 1
      await Helper.setNextBlockTimestamp(
        blockToTimestamp(startBlock)
      );
      await stakingContract.deposit(mulPrecision(60), {from: victor});

      Helper.assertEqual(mulPrecision(50), await stakingContract.getStakesValue(victor, 1), "stake at epoch 1 is wrong");
      Helper.assertEqual(mulPrecision(110), await stakingContract.getStakesValue(victor, 2), "stake at epoch 2 is wrong");
      Helper.assertEqual(mulPrecision(110), await stakingContract.getLatestStakeBalance(victor), "latest stake balance is wrong");

      await stakingContract.withdraw(mulPrecision(20), {from: victor});
      Helper.assertEqual(mulPrecision(50), await stakingContract.getStakesValue(victor, 1), "stake at epoch 1 is wrong");
      Helper.assertEqual(mulPrecision(90), await stakingContract.getStakesValue(victor, 2), "stake at epoch 2 is wrong");
      Helper.assertEqual(mulPrecision(90), await stakingContract.getLatestStakeBalance(victor), "latest stake balance is wrong");

      // delay few epochs
      await Helper.setNextBlockTimestamp(
        blockToTimestamp(epochPeriod * 6 + startBlock + 1)
      );
      await stakingContract.withdraw(mulPrecision(30), {from: victor});
      Helper.assertEqual(mulPrecision(90), await stakingContract.getStake(victor, 6), "stake at epoch 1 is wrong");
      Helper.assertEqual(mulPrecision(60), await stakingContract.getStakesValue(victor, 7), "stake at epoch 2 is wrong");
      Helper.assertEqual(mulPrecision(60), await stakingContract.getLatestStakeBalance(victor), "latest stake balance is wrong");
    });

    it("Test deposit then withdraw + deposit again at same epoch, stakes change as expected", async function() {
      await deployStakingContract(6, currentBlock + 6);

      await kncToken.transfer(victor, mulPrecision(200));
      await kncToken.approve(stakingContract.address, mulPrecision(200), {from: victor});

      // deposit at epoch 0
      await stakingContract.deposit(mulPrecision(50), {from: victor});
      await Helper.setNextBlockTimestamp(
        blockToTimestamp(startBlock + 2)
      );
      await stakingContract.withdraw(mulPrecision(20), {from: victor});
      Helper.assertEqual(mulPrecision(30), await stakingContract.getStakesValue(victor, 1), "stake at epoch 1 is wrong");
      Helper.assertEqual(mulPrecision(30), await stakingContract.getStakesValue(victor, 2), "stake at epoch 2 is wrong");
      Helper.assertEqual(mulPrecision(30), await stakingContract.getLatestStakeBalance(victor), "latest stake balance is wrong");

      await stakingContract.deposit(mulPrecision(50), {from: victor});
      Helper.assertEqual(mulPrecision(30), await stakingContract.getStake(victor, 1), "stake at epoch 1 is wrong");
      Helper.assertEqual(mulPrecision(80), await stakingContract.getStakesValue(victor, 2), "stake at epoch 2 is wrong");
      Helper.assertEqual(mulPrecision(80), await stakingContract.getLatestStakeBalance(victor), "latest stake balance is wrong");
    });

    it("Test deposit after full withdraw, stakes change as expected - no delegation", async function() {
      await deployStakingContract(6, currentBlock + 6);

      await kncToken.transfer(victor, mulPrecision(200));
      await kncToken.approve(stakingContract.address, mulPrecision(200), {from: victor});

      // deposit at epoch 0
      await stakingContract.deposit(mulPrecision(50), {from: victor});
      await Helper.setNextBlockTimestamp(
        blockToTimestamp(startBlock + 1)
      );

      Helper.assertEqual(mulPrecision(50), await stakingContract.getStakesValue(victor, 1), "stake at epoch 1 is wrong");
      Helper.assertEqual(mulPrecision(50), await stakingContract.getLatestStakeBalance(victor), "latest stake balance is wrong");

      // withdraw at epoch 1
      await stakingContract.withdraw(mulPrecision(50), {from: victor});
      chainTime = await Helper.getCurrentBlockTime();
      Helper.assertEqual(0, await stakingContract.getStakesValue(victor, 1), "stake at epoch 1 is wrong");
      Helper.assertEqual(0, await stakingContract.getLatestStakeBalance(victor), "latest stake balance is wrong");

      await Helper.setNextBlockTimestamp(
        blockToTimestamp(startBlock + 1) + 1
      );
      await stakingContract.deposit(mulPrecision(50), {from: victor});
      Helper.assertEqual(0, await stakingContract.getStake(victor, 1), "stake at epoch 1 is wrong");
      Helper.assertEqual(mulPrecision(50), await stakingContract.getStakesValue(victor, 2), "stake at epoch 2 is wrong");
      Helper.assertEqual(mulPrecision(50), await stakingContract.getLatestStakeBalance(victor), "latest stake balance is wrong");

      await Helper.increaseNextBlockTimestamp(
        blocksToSeconds(epochPeriod)
      );
      await stakingContract.deposit(mulPrecision(20), {from: victor});
      Helper.assertEqual(mulPrecision(50), await stakingContract.getStake(victor, 2), "stake at epoch 2 is wrong");
      Helper.assertEqual(mulPrecision(70), await stakingContract.getStakesValue(victor, 3), "stake at epoch 3 is wrong");
      Helper.assertEqual(mulPrecision(70), await stakingContract.getLatestStakeBalance(victor), "latest stake balance is wrong");
    });

    it("Test deposit after full withdraw, stakes change as expected - with delegation", async function() {
      await deployStakingContract(6, currentBlock + 6);

      await kncToken.transfer(victor, mulPrecision(200));
      await kncToken.approve(stakingContract.address, mulPrecision(200), {from: victor});

      // deposit at epoch 0
      await stakingContract.deposit(mulPrecision(50), {from: victor});
      await stakingContract.delegate(mike, {from: victor});

      Helper.assertEqual(mulPrecision(50), await stakingContract.getStakesValue(victor, 1), "stake at epoch 1 is wrong");
      Helper.assertEqual(mulPrecision(50), await stakingContract.getLatestStakeBalance(victor), "latest stake balance is wrong");
      Helper.assertEqual(mulPrecision(50), await stakingContract.getDelegatedStake(mike, 1), "delegated stake at epoch 1 is wrong");
      Helper.assertEqual(mulPrecision(50), await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake balance is wrong");

      await Helper.mineNewBlockAt(
        blockToTimestamp(startBlock + 1)
      );

      await stakingContract.withdraw(mulPrecision(50), {from: victor});
      Helper.assertEqual(0, await stakingContract.getStakesValue(victor, 1), "stake at epoch 1 is wrong");
      Helper.assertEqual(0, await stakingContract.getLatestStakeBalance(victor), "latest stake balance is wrong");
      Helper.assertEqual(0, await stakingContract.getDelegatedStake(mike, 1), "delegated stake at epoch 1 is wrong");
      Helper.assertEqual(0, await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake balance is wrong");

      await stakingContract.deposit(mulPrecision(40), {from: victor});
      Helper.assertEqual(0, await stakingContract.getStake(victor, 1), "stake at epoch 1 is wrong");
      Helper.assertEqual(mulPrecision(40), await stakingContract.getStakesValue(victor, 2), "stake at epoch 2 is wrong");
      Helper.assertEqual(mulPrecision(40), await stakingContract.getLatestStakeBalance(victor), "latest stake balance is wrong");
      Helper.assertEqual(mulPrecision(40), await stakingContract.getDelegatedStake(mike, 2), "delegated stake at epoch 2 is wrong");
      Helper.assertEqual(mulPrecision(40), await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake balance is wrong");

      await Helper.increaseNextBlockTimestamp(
        blocksToSeconds(epochPeriod)
      );
      await stakingContract.deposit(mulPrecision(20), {from: victor});
      Helper.assertEqual(mulPrecision(40), await stakingContract.getStake(victor, 2), "stake at epoch 2 is wrong");
      Helper.assertEqual(mulPrecision(60), await stakingContract.getStakesValue(victor, 3), "stake at epoch 3 is wrong");
      Helper.assertEqual(mulPrecision(60), await stakingContract.getLatestStakeBalance(victor), "latest stake balance is wrong");
      Helper.assertEqual(mulPrecision(40), await stakingContract.getDelegatedStake(mike, 2), "delegated stake at epoch 2 is wrong");
      Helper.assertEqual(mulPrecision(60), await stakingContract.getDelegatedStake(mike, 3), "delegated stake at epoch 3 is wrong");
      Helper.assertEqual(mulPrecision(60), await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake balance is wrong");
    });

    it("Test deposit few consecutive epochs + after few epochs, stakes change as expected", async function() {
      await deployStakingContract(6, currentBlock + 6);

      await kncToken.transfer(victor, mulPrecision(1000));
      await kncToken.approve(stakingContract.address, mulPrecision(1000), {from: victor});

      let currentEpoch = 0;
      let totalDeposited = 0;

      for(let id = 0; id < 10; id++) {
        let tx = await stakingContract.deposit(mulPrecision(id * 2 + 1), {from: victor});
        console.log("id: " + id);
        expectEvent(tx, "Deposited", {
          curEpoch: new BN(id),
          staker: victor,
          amount: mulPrecision(id * 2 + 1)
        });
        totalDeposited += id * 2 + 1;
        Helper.assertEqual(mulPrecision(totalDeposited - id * 2 - 1), await stakingContract.getStakesValue(victor, currentEpoch), "stake at cur epoch is wrong, loop: " + id);
        Helper.assertEqual(mulPrecision(totalDeposited), await stakingContract.getStakesValue(victor, currentEpoch + 1), "stake at next epoch is wrong, loop: " + id);
        Helper.assertEqual(mulPrecision(totalDeposited), await stakingContract.getLatestStakeBalance(victor), "latest stake balance is wrong, loop: " + id);
        currentEpoch++;
        await Helper.increaseNextBlockTimestamp(
          blocksToSeconds(epochPeriod)
        );
      }

      await Helper.mineNewBlockAfter(
        blocksToSeconds(4 * epochPeriod)
      );
      Helper.assertEqual(mulPrecision(totalDeposited), await stakingContract.getLatestStakeBalance(victor), "latest stake balance is wrong");
      Helper.assertEqual(mulPrecision(totalDeposited), await stakingContract.getStake(victor, currentEpoch + 3), "stake is wrong");
    });

    it("Test deposit then delegate, then deposit again, stakes changes as expected", async function() {
      await deployStakingContract(6, currentBlock + 10);

      await kncToken.transfer(victor, mulPrecision(1000));
      await kncToken.approve(stakingContract.address, mulPrecision(1000), {from: victor});

      await stakingContract.deposit(mulPrecision(100), {from: victor});
      await stakingContract.delegate(mike, {from: victor});

      Helper.assertEqual(0, await stakingContract.getDelegatedStakesValue(mike, 0), "delegated stake is wrong");
      Helper.assertEqual(mulPrecision(100), await stakingContract.getDelegatedStakesValue(mike, 1), "delegated stake is wrong");
      Helper.assertEqual(mike, await stakingContract.getRepresentativeValue(victor, 1), "delegated addres is wrong");
      Helper.assertEqual(mulPrecision(100), await stakingContract.getLatestDelegatedStake(mike), "delegated stake is wrong");

      await stakingContract.deposit(mulPrecision(20), {from: victor});
      Helper.assertEqual(0, await stakingContract.getDelegatedStakesValue(mike, 0), "delegated stake is wrong");
      Helper.assertEqual(mulPrecision(120), await stakingContract.getDelegatedStakesValue(mike, 1), "delegated stake is wrong");
      Helper.assertEqual(mulPrecision(120), await stakingContract.getLatestDelegatedStake(mike), "delegated stake is wrong");

      // delay to next epoch
      await Helper.setNextBlockTimestamp(
        blockToTimestamp(startBlock)
      );
      await stakingContract.deposit(mulPrecision(30), {from: victor});
      Helper.assertEqual(mulPrecision(120), await stakingContract.getDelegatedStakesValue(mike, 1), "delegated stake is wrong");
      Helper.assertEqual(mulPrecision(150), await stakingContract.getDelegatedStakesValue(mike, 2), "delegated stake is wrong");
      Helper.assertEqual(mulPrecision(150), await stakingContract.getLatestDelegatedStake(mike), "delegated stake is wrong");
      Helper.assertEqual(mike, await stakingContract.getRepresentativeValue(victor, 2), "delegated addres is wrong");

      // delay few epochs
      await Helper.increaseNextBlockTimestamp(
        blocksToSeconds(4 * epochPeriod)
      );
      await stakingContract.deposit(mulPrecision(50), {from: victor});
      Helper.assertEqual(mulPrecision(150), await stakingContract.getDelegatedStake(mike, 5), "delegated stake is wrong");
      Helper.assertEqual(mulPrecision(200), await stakingContract.getDelegatedStakesValue(mike, 6), "delegated stake is wrong");
      Helper.assertEqual(mulPrecision(200), await stakingContract.getLatestDelegatedStake(mike), "delegated stake is wrong");
      Helper.assertEqual(mike, await stakingContract.getRepresentativeValue(victor, 6), "delegated addres is wrong");
    });

    it("Test deposit then delegate, then delegate again at same + different epoch", async function() {
      await deployStakingContract(6, currentBlock + 10);

      await kncToken.transfer(victor, mulPrecision(1000));
      await kncToken.approve(stakingContract.address, mulPrecision(1000), {from: victor});

      await stakingContract.delegate(mike, {from: victor});
      await stakingContract.deposit(mulPrecision(100), {from: victor});

      Helper.assertEqual(0, await stakingContract.getDelegatedStakesValue(mike, 0), "delegated stake is wrong");
      Helper.assertEqual(mulPrecision(100), await stakingContract.getDelegatedStakesValue(mike, 1), "delegated stake is wrong");
      Helper.assertEqual(mike, await stakingContract.getRepresentativeValue(victor, 1), "delegated addres is wrong");
      Helper.assertEqual(mulPrecision(100), await stakingContract.getLatestDelegatedStake(mike), "delegated stake is wrong");

      await stakingContract.delegate(loi, {from: victor});

      Helper.assertEqual(0, await stakingContract.getDelegatedStakesValue(mike, 1), "delegated stake is wrong");
      Helper.assertEqual(0, await stakingContract.getDelegatedStakesValue(mike, 2), "delegated stake is wrong");

      Helper.assertEqual(loi, await stakingContract.getRepresentativeValue(victor, 1), "delegated addres is wrong");
      Helper.assertEqual(mulPrecision(100), await stakingContract.getDelegatedStakesValue(loi, 1), "delegated stake is wrong");
      Helper.assertEqual(mulPrecision(100), await stakingContract.getLatestDelegatedStake(loi), "delegated stake is wrong");

      await Helper.setNextBlockTimestamp(
        blockToTimestamp(startBlock)
      );
      await stakingContract.delegate(mike, {from: victor});

      Helper.assertEqual(0, await stakingContract.getDelegatedStakesValue(mike, 1), "delegated stake is wrong");
      Helper.assertEqual(mulPrecision(100), await stakingContract.getDelegatedStakesValue(mike, 2), "delegated stake is wrong");
      Helper.assertEqual(mike, await stakingContract.getRepresentativeValue(victor, 2), "delegated addres is wrong");

      Helper.assertEqual(loi, await stakingContract.getRepresentativeValue(victor, 1), "delegated addres is wrong");
      Helper.assertEqual(mulPrecision(100), await stakingContract.getDelegatedStakesValue(loi, 1), "delegated stake is wrong");
      Helper.assertEqual(0, await stakingContract.getDelegatedStakesValue(loi, 2), "delegated stake is wrong");
      Helper.assertEqual(0, await stakingContract.getLatestDelegatedStake(loi), "delegated stake is wrong");

      await Helper.increaseNextBlockTimestamp(
        blocksToSeconds(4 * epochPeriod)
      );
      await stakingContract.delegate(loi, {from: victor});

      Helper.assertEqual(mulPrecision(100), await stakingContract.getDelegatedStakesValue(mike, 5), "delegated stake is wrong");
      Helper.assertEqual(0, await stakingContract.getDelegatedStakesValue(mike, 6), "delegated stake is wrong");
      Helper.assertEqual(mike, await stakingContract.getRepresentativeValue(victor, 5), "delegated addres is wrong");
      Helper.assertEqual(0, await stakingContract.getLatestDelegatedStake(mike), "delegated stake is wrong");

      Helper.assertEqual(loi, await stakingContract.getRepresentativeValue(victor, 6), "delegated addres is wrong");
      Helper.assertEqual(0, await stakingContract.getDelegatedStakesValue(loi, 5), "delegated stake is wrong");
      Helper.assertEqual(mulPrecision(100), await stakingContract.getDelegatedStakesValue(loi, 6), "delegated stake is wrong");
      Helper.assertEqual(mulPrecision(100), await stakingContract.getLatestDelegatedStake(loi), "delegated stake is wrong");
    });

    it("Test deposit with many stakers", async function() {
      await deployStakingContract(6, currentBlock + 20);

      await kncToken.transfer(victor, mulPrecision(1000));
      await kncToken.approve(stakingContract.address, mulPrecision(1000), {from: victor});
      await kncToken.transfer(loi, mulPrecision(1000));
      await kncToken.approve(stakingContract.address, mulPrecision(1000), {from: loi});
      await kncToken.transfer(mike, mulPrecision(1000));
      await kncToken.approve(stakingContract.address, mulPrecision(1000), {from: mike});

      await stakingContract.deposit(mulPrecision(100), {from: mike});
      await stakingContract.deposit(mulPrecision(200), {from: victor});
      await stakingContract.deposit(mulPrecision(300), {from: loi});

      Helper.assertEqual(mulPrecision(100), await stakingContract.getStakesValue(mike, 1), "stake value is wrong");
      Helper.assertEqual(mulPrecision(200), await stakingContract.getStakesValue(victor, 1), "stake value is wrong");
      Helper.assertEqual(mulPrecision(300), await stakingContract.getStakesValue(loi, 1), "stake value is wrong");

      await Helper.setNextBlockTimestamp(
        blockToTimestamp(startBlock + epochPeriod)
      );

      await stakingContract.deposit(mulPrecision(200), {from: mike});
      await stakingContract.deposit(mulPrecision(300), {from: victor});
      await stakingContract.deposit(mulPrecision(400), {from: loi});

      Helper.assertEqual(mulPrecision(100), await stakingContract.getStakesValue(mike, 2), "stake value is wrong");
      Helper.assertEqual(mulPrecision(200), await stakingContract.getStakesValue(victor, 2), "stake value is wrong");
      Helper.assertEqual(mulPrecision(300), await stakingContract.getStakesValue(loi, 2), "stake value is wrong");

      Helper.assertEqual(mulPrecision(300), await stakingContract.getStakesValue(mike, 3), "stake value is wrong");
      Helper.assertEqual(mulPrecision(500), await stakingContract.getStakesValue(victor, 3), "stake value is wrong");
      Helper.assertEqual(mulPrecision(700), await stakingContract.getStakesValue(loi, 3), "stake value is wrong");

      await Helper.mineNewBlockAt(
        blockToTimestamp(startBlock + 4 * epochPeriod)
      );
      Helper.assertEqual(mulPrecision(300), await stakingContract.getStake(mike, 5), "stake value is wrong");
      Helper.assertEqual(mulPrecision(500), await stakingContract.getStake(victor, 5), "stake value is wrong");
      Helper.assertEqual(mulPrecision(700), await stakingContract.getStake(loi, 5), "stake value is wrong");

      Helper.assertEqual(mulPrecision(300), await stakingContract.getLatestStakeBalance(mike), "latest stake value is wrong");
      Helper.assertEqual(mulPrecision(500), await stakingContract.getLatestStakeBalance(victor), "latest stake value is wrong");
      Helper.assertEqual(mulPrecision(700), await stakingContract.getLatestStakeBalance(loi), "latest stake value is wrong");
    });

    it("Test deposit data is inited correctly", async function() {
      await deployStakingContract(10, currentBlock + 10);

      // has 100 tokens, approve enough but try to deposit more
      await kncToken.transfer(victor, mulPrecision(100));
      await kncToken.approve(stakingContract.address, mulPrecision(100), {from: victor});

      await Helper.setNextBlockTimestamp(
        blockToTimestamp(3 * epochPeriod + startBlock)
      );

      await stakingContract.deposit(mulPrecision(10), {from: victor});
      Helper.assertEqual(false, await stakingContract.getHasInitedValue(victor, 1), "shouldn't be inited data");
      Helper.assertEqual(false, await stakingContract.getHasInitedValue(victor, 2), "shouldn't be inited data");
      Helper.assertEqual(false, await stakingContract.getHasInitedValue(victor, 3), "shouldn't be inited data");
      Helper.assertEqual(true, await stakingContract.getHasInitedValue(victor, 4), "should be inited data");
      Helper.assertEqual(true, await stakingContract.getHasInitedValue(victor, 5), "should be inited data");

      await stakingContract.delegate(loi, {from: victor});

      await Helper.increaseNextBlockTimestamp(
        blocksToSeconds(4 * epochPeriod)
      );
      Helper.assertEqual(false, await stakingContract.getHasInitedValue(victor, 8), "shouldn't be inited data");
      Helper.assertEqual(false, await stakingContract.getHasInitedValue(victor, 9), "shouldn't be inited data");
      Helper.assertEqual(false, await stakingContract.getHasInitedValue(loi, 8), "shouldn't be inited data");
      Helper.assertEqual(false, await stakingContract.getHasInitedValue(loi, 9), "shouldn't be inited data");

      await stakingContract.deposit(mulPrecision(20), {from: victor});
      Helper.assertEqual(true, await stakingContract.getHasInitedValue(victor, 8), "should be inited data");
      Helper.assertEqual(true, await stakingContract.getHasInitedValue(victor, 9), "should be inited data");
      Helper.assertEqual(true, await stakingContract.getHasInitedValue(loi, 8), "should be inited data");
      Helper.assertEqual(true, await stakingContract.getHasInitedValue(loi, 9), "should be inited data");

      await stakingContract.delegate(mike, {from: victor});
      await Helper.increaseNextBlockTimestamp(
        blocksToSeconds(4 * epochPeriod)
      );
      Helper.assertEqual(false, await stakingContract.getHasInitedValue(mike, 12), "shouldn't be inited data");
      Helper.assertEqual(false, await stakingContract.getHasInitedValue(mike, 13), "shouldn't be inited data");
      Helper.assertEqual(false, await stakingContract.getHasInitedValue(loi, 12), "shouldn't be inited data");
      Helper.assertEqual(false, await stakingContract.getHasInitedValue(loi, 13), "shouldn't be inited data");
      Helper.assertEqual(false, await stakingContract.getHasInitedValue(victor, 12), "shouldn't be inited data");
      Helper.assertEqual(false, await stakingContract.getHasInitedValue(victor, 13), "shouldn't be inited data");

      await stakingContract.deposit(mulPrecision(50), {from: victor});
      Helper.assertEqual(true, await stakingContract.getHasInitedValue(mike, 12), "should be inited data");
      Helper.assertEqual(true, await stakingContract.getHasInitedValue(mike, 13), "should be inited data");
      Helper.assertEqual(false, await stakingContract.getHasInitedValue(loi, 12), "shouldn't be inited data");
      Helper.assertEqual(false, await stakingContract.getHasInitedValue(loi, 13), "shouldn't be inited data");
      Helper.assertEqual(true, await stakingContract.getHasInitedValue(victor, 12), "should be inited data");
      Helper.assertEqual(true, await stakingContract.getHasInitedValue(victor, 13), "should be inited data");
    });

    it("Test deposit balances change as expected", async function() {
      await deployStakingContract(4, currentBlock + 20);

      await kncToken.transfer(victor, mulPrecision(500));
      await kncToken.approve(stakingContract.address, mulPrecision(500), {from: victor});

      let expectedUserBal = await kncToken.balanceOf(victor);
      let expectedStakingBal = await kncToken.balanceOf(stakingContract.address);

      await stakingContract.deposit(mulPrecision(100), {from: victor});

      expectedUserBal.isub(mulPrecision(100));
      expectedStakingBal.iadd(mulPrecision(100));

      Helper.assertEqual(expectedUserBal, await kncToken.balanceOf(victor), "user balance is not changed as expected");
      Helper.assertEqual(expectedStakingBal, await kncToken.balanceOf(stakingContract.address), "staking balance is not changed as expected");

      await stakingContract.deposit(mulPrecision(200), {from: victor});
      expectedUserBal.isub(mulPrecision(200));
      expectedStakingBal.iadd(mulPrecision(200));

      Helper.assertEqual(expectedUserBal, await kncToken.balanceOf(victor), "user balance is not changed as expected");
      Helper.assertEqual(expectedStakingBal, await kncToken.balanceOf(stakingContract.address), "staking balance is not changed as expected");

      await Helper.increaseNextBlockTimestamp(
        blocksToSeconds(30)
      );

      await stakingContract.deposit(mulPrecision(100), {from: victor});

      expectedUserBal.isub(mulPrecision(100));
      expectedStakingBal.iadd(mulPrecision(100));

      Helper.assertEqual(expectedUserBal, await kncToken.balanceOf(victor), "user balance is not changed as expected");
      Helper.assertEqual(expectedStakingBal, await kncToken.balanceOf(stakingContract.address), "staking balance is not changed as expected");
    });

    it("Test deposit large amount of tokens, check for overflow", async function() {
      await deployStakingContract(4, currentBlock + 20);

      let totalAmount = precisionUnits.mul(new BN(10).pow(new BN(8))).mul(new BN(2)); // 200M tokens
      await kncToken.transfer(victor, totalAmount);
      await kncToken.approve(stakingContract.address, totalAmount, {from: victor});
      await stakingContract.deposit(totalAmount, {from: victor});

      Helper.assertEqual(totalAmount, await stakingContract.getLatestStakeBalance(victor), "latest stake balance is wrong");
      Helper.assertEqual(totalAmount, await stakingContract.getStake(victor, 1), "stake is wrong");

      await Helper.setNextBlockTimestamp(
        blockToTimestamp(startBlock)
      );

      let withdrawAmount = precisionUnits.mul(new BN(10).pow(new BN(8))); // 100M tokens
      await stakingContract.withdraw(withdrawAmount, {from: victor});
      totalAmount.isub(withdrawAmount);

      Helper.assertEqual(totalAmount, await stakingContract.getLatestStakeBalance(victor), "latest stake balance is wrong");
      Helper.assertEqual(totalAmount, await stakingContract.getStake(victor, 1), "stake is wrong");
      Helper.assertEqual(totalAmount, await stakingContract.getStake(victor, 2), "stake is wrong");

      await stakingContract.delegate(mike, {from: victor});
      Helper.assertEqual(totalAmount, await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake is wrong");
      Helper.assertEqual(totalAmount, await stakingContract.getDelegatedStake(mike, 2), "delegated stake is wrong");
    });

    it("Test deposit gas usages", async function() {
      await deployStakingContract(6, currentBlock + 10);

      await kncToken.transfer(victor, mulPrecision(1000));
      await kncToken.approve(stakingContract.address, mulPrecision(1000), {from: victor});

      let tx = await stakingContract.deposit(mulPrecision(100), {from: victor});
      logInfo("Deposit no delegation: init 2 epochs data, gas used: " + tx.receipt.gasUsed);

      await Helper.setNextBlockTimestamp(
        blockToTimestamp(startBlock)
      );
      tx = await stakingContract.deposit(mulPrecision(50), {from: victor});
      logInfo("Deposit no delegation: init 1 epoch data, gas used: " + tx.receipt.gasUsed);
      tx = await stakingContract.deposit(mulPrecision(50), {from: victor});
      logInfo("Deposit no delegation: no init epoch data, gas used: " + tx.receipt.gasUsed);

      await stakingContract.delegate(mike, {from: victor});
      await Helper.setNextBlockTimestamp(
        blockToTimestamp(4 * epochPeriod + startBlock)
      );
      tx = await stakingContract.deposit(mulPrecision(100), {from: victor});
      logInfo("Deposit has delegation: init 2 epochs data, gas used: " + tx.receipt.gasUsed);
      await Helper.increaseNextBlockTimestamp(
        blocksToSeconds(epochPeriod)
      );
      tx = await stakingContract.deposit(mulPrecision(50), {from: victor});
      logInfo("Deposit has delegation: init 1 epoch data, gas used: " + tx.receipt.gasUsed);
      tx = await stakingContract.deposit(mulPrecision(50), {from: victor});
      logInfo("Deposit has delegation: no init epoch data, gas used: " + tx.receipt.gasUsed);
    });
  });

  describe("#Withdrawal Tests", () => {
    it("Test withdraw (partial + full), stakes change as expected - no delegation", async function() {
      await deployStakingContract(10, currentBlock + 10);

      await kncToken.transfer(victor, mulPrecision(500));
      await kncToken.approve(stakingContract.address, mulPrecision(500), {from: victor});
      await stakingContract.deposit(mulPrecision(500), {from: victor});

      let tx = await stakingContract.withdraw(mulPrecision(50), {from: victor});
      expectEvent(tx, "Withdraw", {
        curEpoch: new BN(0),
        staker: victor,
        amount: mulPrecision(50)
      });

      Helper.assertEqual(mulPrecision(450), await stakingContract.getStakesValue(victor, 1), "stake at epoch 1 should be correct");
      Helper.assertEqual(mulPrecision(450), await stakingContract.getLatestStakeBalance(victor), "latest stake balance should be correct");

      // delay to epoch 1
      await Helper.setNextBlockTimestamp(
        blockToTimestamp(startBlock + 1)
      );

      tx = await stakingContract.withdraw(mulPrecision(100), {from: victor});
      expectEvent(tx, "Withdraw", {
        curEpoch: new BN(1),
        staker: victor,
        amount: mulPrecision(100)
      });

      Helper.assertEqual(mulPrecision(350), await stakingContract.getStakesValue(victor, 1), "stake at epoch 1 should be correct");
      Helper.assertEqual(mulPrecision(350), await stakingContract.getLatestStakeBalance(victor), "latest stake balance should be correct");

      // delay to epoch 5
      await Helper.increaseNextBlockTimestamp(
        blocksToSeconds(4 * epochPeriod)
      );

      tx = await stakingContract.withdraw(mulPrecision(40), {from: victor});
      expectEvent(tx, "Withdraw", {
        curEpoch: new BN(5),
        staker: victor,
        amount: mulPrecision(40)
      });

      Helper.assertEqual(mulPrecision(310), await stakingContract.getStakesValue(victor, 5), "stake at epoch 5 should be correct");
      Helper.assertEqual(mulPrecision(310), await stakingContract.getLatestStakeBalance(victor), "latest stake balance should be correct");

      await Helper.increaseNextBlockTimestamp(
        blocksToSeconds(5 * epochPeriod)
      );

      // withdraw full
      await stakingContract.withdraw(mulPrecision(310), {from: victor});

      Helper.assertEqual(0, await stakingContract.getStakesValue(victor, 9), "stake at epoch 9 should be correct");
      Helper.assertEqual(0, await stakingContract.getLatestStakeBalance(victor), "latest stake balance should be correct");

      await expectRevert(
        stakingContract.withdraw(mulPrecision(10), {from: victor}),
        "withdraw: latest amount staked < withdrawal amount"
      )
    });

    it("Test withdraw (partial + full), stakes change as expected - with delegation", async function() {
      await deployStakingContract(10, currentBlock + 10);

      await kncToken.transfer(victor, mulPrecision(500));
      await kncToken.approve(stakingContract.address, mulPrecision(500), {from: victor});
      await stakingContract.deposit(mulPrecision(500), {from: victor});
      await stakingContract.delegate(mike, {from: victor});

      await stakingContract.withdraw(mulPrecision(50), {from: victor});

      Helper.assertEqual(mulPrecision(450), await stakingContract.getDelegatedStakesValue(mike, 1), "delegated stake should be correct");
      Helper.assertEqual(mulPrecision(450), await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake balance should be correct");

      currentBlock = await Helper.getCurrentBlock();
      // delay to epoch 1
      await Helper.setNextBlockTimestamp(
        blockToTimestamp(startBlock + 1)
      );

      await stakingContract.withdraw(mulPrecision(100), {from: victor});

      Helper.assertEqual(mulPrecision(350), await stakingContract.getDelegatedStakesValue(mike, 1), "delegated stake should be correct");
      Helper.assertEqual(mulPrecision(350), await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake balance should be correct");

      // delay to epoch 1
      await Helper.increaseNextBlockTimestamp(
        blocksToSeconds(4 * epochPeriod)
      );

      await stakingContract.withdraw(mulPrecision(40), {from: victor});

      Helper.assertEqual(mulPrecision(310), await stakingContract.getDelegatedStakesValue(mike, 5), "delegated stake should be correct");
      Helper.assertEqual(mulPrecision(310), await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake balance should be correct");

      await Helper.increaseNextBlockTimestamp(
        blocksToSeconds(5 * epochPeriod)
      );

      // withdraw full
      await stakingContract.withdraw(mulPrecision(310), {from: victor});

      Helper.assertEqual(0, await stakingContract.getDelegatedStakesValue(mike, 9), "delegated stake should be correct");
      Helper.assertEqual(0, await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake balance should be correct");

      await expectRevert(
        stakingContract.withdraw(mulPrecision(10), {from: victor}),
        "withdraw: latest amount staked < withdrawal amount"
      );
    });


    it("Test withdraw more than current epoch stake, but less than total stake", async function() {
      await deployStakingContract(6, currentBlock + 10);

      await kncToken.transfer(victor, mulPrecision(500));
      await kncToken.approve(stakingContract.address, mulPrecision(500), {from: victor});
      await stakingContract.deposit(mulPrecision(300), {from: victor});

      // delay to epoch 1
      await Helper.setNextBlockTimestamp(
        blockToTimestamp(startBlock + 1)
      );

      await stakingContract.deposit(mulPrecision(100), {from: victor});

      // total victor has 400 knc, at current epoch (1) he has 300 knc
      await stakingContract.withdraw(mulPrecision(350), {from: victor});

      Helper.assertEqual(mulPrecision(50), await stakingContract.getStakesValue(victor, 1), "stake at epoch 1 should be correct");
      Helper.assertEqual(mulPrecision(50), await stakingContract.getStakesValue(victor, 2), "stake at epoch 2 should be correct");
      Helper.assertEqual(mulPrecision(50), await stakingContract.getLatestStakeBalance(victor), "latest stake balance should be correct");
    });

    it("Test withdraw before new deposit, stakes change as expected", async function() {
      await deployStakingContract(6, currentBlock + 10);

      await kncToken.transfer(victor, mulPrecision(500));
      await kncToken.approve(stakingContract.address, mulPrecision(500), {from: victor});
      await stakingContract.deposit(mulPrecision(400), {from: victor});
      await stakingContract.delegate(mike, {from: victor});

      // delay to epoch 1
      await Helper.setNextBlockTimestamp(
        blockToTimestamp(startBlock + 1)
      );

      await stakingContract.withdraw(mulPrecision(200), {from: victor});

      // check stake of victor
      Helper.assertEqual(mulPrecision(200), await stakingContract.getStakesValue(victor, 1), "stake at epoch 1 should be correct");
      Helper.assertEqual(mulPrecision(200), await stakingContract.getStakesValue(victor, 2), "stake at epoch 2 should be correct");
      Helper.assertEqual(mulPrecision(200), await stakingContract.getLatestStakeBalance(victor), "latest stake balance should be correct");
      // check delegated stake of mike
      Helper.assertEqual(mulPrecision(200), await stakingContract.getDelegatedStakesValue(mike, 1), "delegated stake at epoch 1 should be correct");
      Helper.assertEqual(mulPrecision(200), await stakingContract.getDelegatedStakesValue(mike, 2), "delegated stake at epoch 2 should be correct");
      Helper.assertEqual(mulPrecision(200), await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake should be correct");

      // deposit again
      await stakingContract.deposit(mulPrecision(100), {from: victor});
      // check stake of victor
      Helper.assertEqual(mulPrecision(200), await stakingContract.getStakesValue(victor, 1), "stake at epoch 1 should be correct");
      Helper.assertEqual(mulPrecision(300), await stakingContract.getStakesValue(victor, 2), "stake at epoch 2 should be correct");
      Helper.assertEqual(mulPrecision(300), await stakingContract.getLatestStakeBalance(victor), "latest stake balance should be correct");
      // check delegated stake of mike
      Helper.assertEqual(mulPrecision(200), await stakingContract.getDelegatedStakesValue(mike, 1), "delegated stake at epoch 1 should be correct");
      Helper.assertEqual(mulPrecision(300), await stakingContract.getDelegatedStakesValue(mike, 2), "delegated stake at epoch 2 should be correct");
      Helper.assertEqual(mulPrecision(300), await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake should be correct");
    });

    it("Test withdraw less than new deposit, stakes change as expected", async function() {
      await deployStakingContract(6, currentBlock + 10);

      await kncToken.transfer(victor, mulPrecision(500));
      await kncToken.approve(stakingContract.address, mulPrecision(500), {from: victor});
      await stakingContract.deposit(mulPrecision(400), {from: victor});
      await stakingContract.delegate(mike, {from: victor});

      // delay to epoch 1
      await Helper.setNextBlockTimestamp(
        blockToTimestamp(startBlock + 1)
      );

      await stakingContract.deposit(mulPrecision(100), {from: victor});
      await stakingContract.withdraw(mulPrecision(50), {from: victor});

      // check stake of victor
      Helper.assertEqual(mulPrecision(400), await stakingContract.getStakesValue(victor, 1), "stake at epoch 1 should be correct");
      Helper.assertEqual(mulPrecision(450), await stakingContract.getStakesValue(victor, 2), "stake at epoch 2 should be correct");
      Helper.assertEqual(mulPrecision(450), await stakingContract.getLatestStakeBalance(victor), "latest stake balance should be correct");
      // check delegated stake of mike
      Helper.assertEqual(mulPrecision(400), await stakingContract.getDelegatedStakesValue(mike, 1), "delegated stake at epoch 1 should be correct");
      Helper.assertEqual(mulPrecision(450), await stakingContract.getDelegatedStakesValue(mike, 2), "delegated stake at epoch 2 should be correct");
      Helper.assertEqual(mulPrecision(450), await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake should be correct");
    });

    it("Test withdraw total more than new deposit, stakes change as expected", async function() {
      await deployStakingContract(6, currentBlock + 10);

      await kncToken.transfer(victor, mulPrecision(500));
      await kncToken.approve(stakingContract.address, mulPrecision(500), {from: victor});
      await stakingContract.deposit(mulPrecision(400), {from: victor});
      await stakingContract.delegate(mike, {from: victor});

      // delay to epoch 1
      await Helper.setNextBlockTimestamp(
        blockToTimestamp(startBlock + 1)
      );

      await stakingContract.deposit(mulPrecision(100), {from: victor});
      await stakingContract.withdraw(mulPrecision(50), {from: victor});
      await stakingContract.withdraw(mulPrecision(150), {from: victor});

      // check stake of victor
      Helper.assertEqual(mulPrecision(300), await stakingContract.getStakesValue(victor, 1), "stake at epoch 1 should be correct");
      Helper.assertEqual(mulPrecision(300), await stakingContract.getStakesValue(victor, 2), "stake at epoch 2 should be correct");
      Helper.assertEqual(mulPrecision(300), await stakingContract.getLatestStakeBalance(victor), "latest stake balance should be correct");
      // check delegated stake of mike
      Helper.assertEqual(mulPrecision(300), await stakingContract.getDelegatedStakesValue(mike, 1), "delegated stake at epoch 1 should be correct");
      Helper.assertEqual(mulPrecision(300), await stakingContract.getDelegatedStakesValue(mike, 2), "delegated stake at epoch 2 should be correct");
      Helper.assertEqual(mulPrecision(300), await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake should be correct");
    });

    it("Test withdraw total more than new deposit, then deposit again stakes change as expected", async function() {
      await deployStakingContract(6, currentBlock + 10);

      await kncToken.transfer(victor, mulPrecision(1000));
      await kncToken.approve(stakingContract.address, mulPrecision(1000), {from: victor});
      await stakingContract.deposit(mulPrecision(400), {from: victor});
      await stakingContract.delegate(mike, {from: victor});

      // delay to epoch 1
      await Helper.setNextBlockTimestamp(
        blockToTimestamp(startBlock + 1)
      );

      await stakingContract.deposit(mulPrecision(100), {from: victor});
      await stakingContract.withdraw(mulPrecision(150), {from: victor});
      await stakingContract.deposit(mulPrecision(200), {from: victor});

      // check stake of victor
      Helper.assertEqual(mulPrecision(350), await stakingContract.getStakesValue(victor, 1), "stake at epoch 1 should be correct");
      Helper.assertEqual(mulPrecision(550), await stakingContract.getStakesValue(victor, 2), "stake at epoch 2 should be correct");
      Helper.assertEqual(mulPrecision(550), await stakingContract.getLatestStakeBalance(victor), "latest stake balance should be correct");
      // check delegated stake of mike
      Helper.assertEqual(mulPrecision(350), await stakingContract.getDelegatedStakesValue(mike, 1), "delegated stake at epoch 1 should be correct");
      Helper.assertEqual(mulPrecision(550), await stakingContract.getDelegatedStakesValue(mike, 2), "delegated stake at epoch 2 should be correct");
      Helper.assertEqual(mulPrecision(550), await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake should be correct");
    });

    it("Test withdraw at end and beginning of an epoch", async function() {
      await deployStakingContract(10, currentBlock + 20);

      await kncToken.transfer(victor, mulPrecision(100));
      await kncToken.approve(stakingContract.address, mulPrecision(100), {from: victor});
      await stakingContract.deposit(mulPrecision(100), {from: victor});

      await kncToken.transfer(mike, mulPrecision(100));
      await kncToken.approve(stakingContract.address, mulPrecision(100), {from: mike});
      await stakingContract.deposit(mulPrecision(100), {from: mike});

      await kncToken.transfer(loi, mulPrecision(800));
      await kncToken.approve(stakingContract.address, mulPrecision(800), {from: loi});
      await stakingContract.deposit(mulPrecision(800), {from: loi});

      Helper.assertEqual(0, await stakingContract.getStake(victor, 0), "stake at epoch 0 is wrong");
      Helper.assertEqual(mulPrecision(100), await stakingContract.getStake(victor, 1), "stake at epoch 1 is wrong");
      Helper.assertEqual(mulPrecision(800), await stakingContract.getStake(loi, 1), "stake at epoch 1 is wrong");

      await Helper.setNextBlockTimestamp(
        blockToTimestamp(startBlock + epochPeriod) - 1
      );
      // withdraw at end of epoch 1
      await stakingContract.withdraw(mulPrecision(600), {from: loi});

      Helper.assertEqual(mulPrecision(100), await stakingContract.getStake(victor, 1), "stake at epoch 1 is wrong");
      Helper.assertEqual(mulPrecision(200), await stakingContract.getStake(loi, 1), "stake at epoch 1 is wrong");

      // withdraw at beginning of epoch 2
      await stakingContract.withdraw(mulPrecision(50), {from: victor});

      Helper.assertEqual(mulPrecision(100), await stakingContract.getStake(victor, 1), "stake at epoch 1 is wrong");
      Helper.assertEqual(mulPrecision(50), await stakingContract.getStake(victor, 2), "stake at epoch 2 is wrong");
      Helper.assertEqual(mulPrecision(200), await stakingContract.getStake(loi, 2), "stake at epoch 2 is wrong");
      Helper.assertEqual(mulPrecision(100), await stakingContract.getStake(mike, 2), "stake at epoch 2 is wrong");

      Helper.assertEqual(
        mulPrecision(50), await stakingContract.getLatestStakeBalance(victor), "latest stake is incorrect"
      );
      Helper.assertEqual(
        mulPrecision(200), await stakingContract.getLatestStakeBalance(loi), "latest stake is incorrect"
      );
      Helper.assertEqual(
        mulPrecision(100), await stakingContract.getLatestStakeBalance(mike), "latest stake is incorrect"
      );
    });

    it("Test withdraw data is inited correctly", async function() {
      await deployStakingContract(10, currentBlock + 10);

      await kncToken.transfer(victor, mulPrecision(100));
      await kncToken.approve(stakingContract.address, mulPrecision(100), {from: victor});
      await stakingContract.deposit(mulPrecision(100), {from: victor});

      await Helper.setNextBlockTimestamp(
        blockToTimestamp(3 * epochPeriod + startBlock)
      );

      await stakingContract.withdraw(mulPrecision(10), {from: victor});
      Helper.assertEqual(false, await stakingContract.getHasInitedValue(victor, 3), "shouldn't be inited data");
      Helper.assertEqual(true, await stakingContract.getHasInitedValue(victor, 4), "should be inited data");
      Helper.assertEqual(true, await stakingContract.getHasInitedValue(victor, 5), "should be inited data");

      await stakingContract.delegate(mike, {from: victor});

      await Helper.increaseNextBlockTimestamp(
        blocksToSeconds(4 * epochPeriod)
      );
      Helper.assertEqual(false, await stakingContract.getHasInitedValue(victor, 8), "shouldn't be inited data");
      Helper.assertEqual(false, await stakingContract.getHasInitedValue(victor, 9), "shouldn't be inited data");
      Helper.assertEqual(false, await stakingContract.getHasInitedValue(mike, 8), "shouldn't be inited data");
      Helper.assertEqual(false, await stakingContract.getHasInitedValue(mike, 9), "shouldn't be inited data");

      await stakingContract.withdraw(mulPrecision(20), {from: victor});
      Helper.assertEqual(true, await stakingContract.getHasInitedValue(victor, 8), "should be inited data");
      Helper.assertEqual(true, await stakingContract.getHasInitedValue(victor, 9), "should be inited data");
      Helper.assertEqual(true, await stakingContract.getHasInitedValue(mike, 8), "should be inited data");
      Helper.assertEqual(true, await stakingContract.getHasInitedValue(mike, 9), "should be inited data");

      await stakingContract.delegate(loi, {from: victor});
      await Helper.increaseNextBlockTimestamp(
        blocksToSeconds(4 * epochPeriod)
      );
      Helper.assertEqual(false, await stakingContract.getHasInitedValue(victor, 12), "shouldn't be inited data");
      Helper.assertEqual(false, await stakingContract.getHasInitedValue(victor, 13), "shouldn't be inited data");
      Helper.assertEqual(false, await stakingContract.getHasInitedValue(mike, 12), "shouldn't be inited data");
      Helper.assertEqual(false, await stakingContract.getHasInitedValue(mike, 13), "shouldn't be inited data");
      Helper.assertEqual(false, await stakingContract.getHasInitedValue(loi, 12), "shouldn't be inited data");
      Helper.assertEqual(false, await stakingContract.getHasInitedValue(loi, 13), "shouldn't be inited data");

      await stakingContract.withdraw(mulPrecision(20), {from: victor});
      Helper.assertEqual(true, await stakingContract.getHasInitedValue(victor, 12), "should be inited data");
      Helper.assertEqual(true, await stakingContract.getHasInitedValue(victor, 13), "should be inited data");
      Helper.assertEqual(false, await stakingContract.getHasInitedValue(mike, 12), "shouldn't be inited data");
      Helper.assertEqual(false, await stakingContract.getHasInitedValue(mike, 13), "shouldn't be inited data");
      Helper.assertEqual(true, await stakingContract.getHasInitedValue(loi, 12), "should be inited data");
      Helper.assertEqual(true, await stakingContract.getHasInitedValue(loi, 13), "should be inited data");
    });

    it("Test withdraw balances change as expected", async function() {
      await deployStakingContract(4, currentBlock + 10);

      await kncToken.transfer(victor, mulPrecision(500));
      await kncToken.approve(stakingContract.address, mulPrecision(500), {from: victor});

      await stakingContract.deposit(mulPrecision(400), {from: victor});

      let expectedUserBal = await kncToken.balanceOf(victor);
      let expectedStakingBal = await kncToken.balanceOf(stakingContract.address);

      await stakingContract.withdraw(mulPrecision(50), {from: victor});
      expectedUserBal.iadd(mulPrecision(50));
      expectedStakingBal.isub(mulPrecision(50));

      Helper.assertEqual(expectedUserBal, await kncToken.balanceOf(victor), "user balance is not changed as expected");
      Helper.assertEqual(expectedStakingBal, await kncToken.balanceOf(stakingContract.address), "staking balance is not changed as expected");

      await stakingContract.withdraw(mulPrecision(100), {from: victor});
      expectedUserBal.iadd(mulPrecision(100));
      expectedStakingBal.isub(mulPrecision(100));

      Helper.assertEqual(expectedUserBal, await kncToken.balanceOf(victor), "user balance is not changed as expected");
      Helper.assertEqual(expectedStakingBal, await kncToken.balanceOf(stakingContract.address), "staking balance is not changed as expected");

      await Helper.increaseNextBlockTimestamp(
        blocksToSeconds(20)
      );
      await stakingContract.withdraw(mulPrecision(100), {from: victor});
      expectedUserBal.iadd(mulPrecision(100));
      expectedStakingBal.isub(mulPrecision(100));

      Helper.assertEqual(expectedUserBal, await kncToken.balanceOf(victor), "user balance is not changed as expected");
      Helper.assertEqual(expectedStakingBal, await kncToken.balanceOf(stakingContract.address), "staking balance is not changed as expected");

      await stakingContract.withdraw(mulPrecision(50), {from: victor});
      expectedUserBal.iadd(mulPrecision(50));
      expectedStakingBal.isub(mulPrecision(50));

      Helper.assertEqual(expectedUserBal, await kncToken.balanceOf(victor), "user balance is not changed as expected");
      Helper.assertEqual(expectedStakingBal, await kncToken.balanceOf(stakingContract.address), "staking balance is not changed as expected");
    });

    it("Test withdraw should call KyberDao handleWithdrawal as expected", async function() {
      let dao = await MockKyberDao.new(
        blocksToSeconds(10),
        blockToTimestamp(currentBlock + 10),
      );
      kyberDao = dao.address;
      await deployStakingContract(10, currentBlock + 10);

      await kncToken.transfer(victor, mulPrecision(500));
      await kncToken.approve(stakingContract.address, mulPrecision(500), {from: victor});

      await stakingContract.deposit(mulPrecision(400), {from: victor});
      await stakingContract.withdraw(mulPrecision(10), {from: victor});
      Helper.assertEqual(0, await dao.values(victor), "shouldn't call dao withdrawal func");

      await Helper.increaseNextBlockTimestamp(
        blocksToSeconds(epochPeriod)
      );
      await stakingContract.withdraw(mulPrecision(10), {from: victor});
      Helper.assertEqual(mulPrecision(10), await dao.values(victor), "should call dao withdrawal func");

      await Helper.setNextBlockTimestamp(
        blockToTimestamp(epochPeriod * 2 + startBlock)
      );

      await stakingContract.deposit(mulPrecision(20), {from: victor});
      await stakingContract.withdraw(mulPrecision(10), {from: victor});
      Helper.assertEqual(mulPrecision(10), await dao.values(victor), "shouldn't call dao withdrawal func");
      await stakingContract.withdraw(mulPrecision(10), {from: victor});
      Helper.assertEqual(mulPrecision(10), await dao.values(victor), "shouldn't call dao withdrawal func");
      await stakingContract.withdraw(mulPrecision(20), {from: victor});
      Helper.assertEqual(mulPrecision(30), await dao.values(victor), "should call dao withdrawal func");

      await stakingContract.delegate(mike, {from: victor});
      await Helper.setNextBlockTimestamp(
        blockToTimestamp(3 * epochPeriod + startBlock)
      );

      Helper.assertEqual(mulPrecision(30), await dao.values(victor), "dao values should be correct");
      Helper.assertEqual(0, await dao.values(mike), "dao values should be correct");

      await stakingContract.deposit(mulPrecision(10), {from: victor});
      await stakingContract.withdraw(mulPrecision(5), {from: victor});

      Helper.assertEqual(mulPrecision(30), await dao.values(victor), "dao values should be correct");
      Helper.assertEqual(0, await dao.values(mike), "dao values should be correct");

      await stakingContract.withdraw(mulPrecision(20), {from: victor});
      Helper.assertEqual(mulPrecision(30), await dao.values(victor), "dao values should be correct");
      Helper.assertEqual(mulPrecision(15), await dao.values(mike), "dao values should be correct");

      await stakingContract.delegate(loi, {from: victor});
      await stakingContract.withdraw(mulPrecision(10), {from: victor});
      Helper.assertEqual(mulPrecision(30), await dao.values(victor), "dao values should be correct");
      Helper.assertEqual(mulPrecision(25), await dao.values(mike), "dao values should be correct");
      Helper.assertEqual(0, await dao.values(loi), "dao values should be correct");

      // move to next epoch
      await Helper.increaseNextBlockTimestamp(
        blocksToSeconds(epochPeriod)
      );

      await stakingContract.withdraw(mulPrecision(10), {from: victor});
      Helper.assertEqual(mulPrecision(30), await dao.values(victor), "dao values should be correct");
      Helper.assertEqual(mulPrecision(25), await dao.values(mike), "dao values should be correct");
      Helper.assertEqual(mulPrecision(10), await dao.values(loi), "dao values should be correct");

      await stakingContract.delegate(victor, {from: victor});
      // move to next epoch
      await Helper.increaseNextBlockTimestamp(
        blocksToSeconds(epochPeriod)
      );
      await stakingContract.withdraw(mulPrecision(10), {from: victor});
      Helper.assertEqual(mulPrecision(40), await dao.values(victor), "dao values should be correct");
      Helper.assertEqual(mulPrecision(25), await dao.values(mike), "dao values should be correct");
      Helper.assertEqual(mulPrecision(10), await dao.values(loi), "dao values should be correct");

      kyberDao = accounts[1];
    });

    it("Test handleWithdrawal should revert sender is not staking", async() => {
      let dao = await MockKyberDao.new(
        blocksToSeconds(10),
        blockToTimestamp(currentBlock + 10),
      );
      kyberDao = dao.address;
      await deployStakingContract(10, currentBlock + 10);

      await kncToken.transfer(victor, mulPrecision(500));
      await kncToken.approve(stakingContract.address, mulPrecision(500), {from: victor});
      await stakingContract.deposit(mulPrecision(500), {from: victor});

      await expectRevert(
        stakingContract.handleWithdrawal(victor, mulPrecision(100), 0),
        "only staking contract"
      )
      await stakingContract.withdraw(mulPrecision(100), {from: victor});
      kyberDao = accounts[1];
    });

    it("Test withdraw gas usages", async function() {
      let dao = await MockKyberDao.new(
        blocksToSeconds(10),
        blockToTimestamp(currentBlock + 10),
      );
      kyberDao = dao.address;
      await deployStakingContract(10, currentBlock + 10);

      await kncToken.transfer(victor, mulPrecision(500));
      await kncToken.approve(stakingContract.address, mulPrecision(500), {from: victor});

      await stakingContract.deposit(mulPrecision(300), {from: victor});
      let tx = await stakingContract.withdraw(mulPrecision(10), {from: victor});
      logInfo("Withdraw no delegation: no init epoch data + no penalty amount, gas used: " + tx.receipt.gasUsed);

      await Helper.setNextBlockTimestamp(
        blockToTimestamp(startBlock)
      );
      tx = await stakingContract.withdraw(mulPrecision(10), {from: victor});
      logInfo("Withdraw no delegation: init 1 epoch data + has penalty amount, gas used: " + tx.receipt.gasUsed);

      await Helper.setNextBlockTimestamp(
        blockToTimestamp(4 * epochPeriod + startBlock)
      );
      tx = await stakingContract.withdraw(mulPrecision(10), {from: victor});
      logInfo("Withdraw no delegation: init 2 epoch data + has penalty amount, gas used: " + tx.receipt.gasUsed);

      await stakingContract.deposit(mulPrecision(20), {from: victor});
      tx = await stakingContract.withdraw(mulPrecision(30), {from: victor});
      logInfo("Withdraw no delegation: without init epoch data + has penalty amount, gas used: " + tx.receipt.gasUsed);

      await stakingContract.delegate(mike, {from: victor});
      await Helper.setNextBlockTimestamp(
        blockToTimestamp(6 * epochPeriod + startBlock)
      );
      tx = await stakingContract.withdraw(mulPrecision(10), {from: victor});
      logInfo("Withdraw has delegation: init 2 epoch data + has penalty amount, gas used: " + tx.receipt.gasUsed);

      await Helper.setNextBlockTimestamp(
        blockToTimestamp(7 * epochPeriod + startBlock)
      );
      tx = await stakingContract.withdraw(mulPrecision(10), {from: victor});
      logInfo("Withdraw has delegation: init 1 epoch data+ has penalty amount, gas used: " + tx.receipt.gasUsed);
      tx = await stakingContract.withdraw(mulPrecision(10), {from: victor});
      logInfo("Withdraw has delegation: without init epoch data, has penalty amount, gas used: " + tx.receipt.gasUsed);

      await stakingContract.deposit(mulPrecision(20), {from: victor});
      tx = await stakingContract.withdraw(mulPrecision(10), {from: victor});
      logInfo("Withdraw has delegation: without init epoch data + no penalty amount, gas used: " + tx.receipt.gasUsed);
    });
    kyberDao = accounts[1];
  });

  describe("#Delegate Tests", () => {
    it("Test delegate, representative and stake change as expected", async function() {
      await deployStakingContract(10, currentBlock + 10);

      await kncToken.transfer(victor, mulPrecision(100));
      await kncToken.approve(stakingContract.address, mulPrecision(100), {from: victor});

      let tx = await stakingContract.delegate(mike, {from: victor});
      expectEvent(tx, "Delegated", {
        staker: victor,
        representative: mike,
        epoch: new BN(0),
        isDelegated: true
      });

      await Helper.setNextBlockTimestamp(
        blockToTimestamp(4 * epochPeriod + startBlock)
      );

      await stakingContract.deposit(mulPrecision(50), {from: victor});

      Helper.assertEqual(mike, await stakingContract.getLatestRepresentative(victor), "latest representative is incorrect");
      Helper.assertEqual(mulPrecision(50), await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake is incorrect");
      Helper.assertEqual(0, await stakingContract.getDelegatedStakesValue(mike, 5), "delegated stake is incorrect");
      Helper.assertEqual(mulPrecision(50), await stakingContract.getDelegatedStakesValue(mike, 6), "delegated stake is incorrect");

      tx = await stakingContract.delegate(loi, {from: victor});
      expectEvent(tx, "Delegated", {
        staker: victor,
        representative: mike,
        epoch: new BN(5),
        isDelegated: false
      });
      expectEvent(tx, "Delegated", {
        staker: victor,
        representative: loi,
        epoch: new BN(5),
        isDelegated: true
      });

      Helper.assertEqual(loi, await stakingContract.getLatestRepresentative(victor), "latest representative is incorrect");
      Helper.assertEqual(0, await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake is incorrect");
      Helper.assertEqual(0, await stakingContract.getDelegatedStakesValue(mike, 6), "delegated stake is incorrect");

      Helper.assertEqual(mulPrecision(50), await stakingContract.getLatestDelegatedStake(loi), "latest delegated stake is incorrect");
      Helper.assertEqual(0, await stakingContract.getDelegatedStakesValue(loi, 5), "delegated stake is incorrect");
      Helper.assertEqual(mulPrecision(50), await stakingContract.getDelegatedStakesValue(loi, 6), "delegated stake is incorrect");

      await stakingContract.deposit(mulPrecision(50), {from: victor});

      Helper.assertEqual(0, await stakingContract.getDelegatedStakesValue(mike, 6), "delegated stake is incorrect");
      Helper.assertEqual(mulPrecision(100), await stakingContract.getLatestDelegatedStake(loi), "latest delegated stake is incorrect");
      Helper.assertEqual(0, await stakingContract.getDelegatedStakesValue(loi, 5), "delegated stake is incorrect");
      Helper.assertEqual(mulPrecision(100), await stakingContract.getDelegatedStakesValue(loi, 6), "delegated stake is incorrect");
      Helper.assertEqual(mulPrecision(100), await stakingContract.getLatestDelegatedStake(loi), "latest delegated stake is incorrect");

      await Helper.setNextBlockTimestamp(
        blockToTimestamp(startBlock + 8 * epochPeriod) - 1
      );

      await stakingContract.delegate(mike, {from: victor});

      Helper.assertEqual(mike, await stakingContract.getLatestRepresentative(victor), "latest representative is incorrect");
      Helper.assertEqual(mulPrecision(100), await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake is incorrect");
      Helper.assertEqual(mulPrecision(100), await stakingContract.getDelegatedStakesValue(mike, 9), "delegated stake is incorrect");
      Helper.assertEqual(0, await stakingContract.getDelegatedStake(loi, 9), "delegated stake is incorrect");

      // withdraw delegation, check events
      tx = await stakingContract.delegate(victor, {from: victor});
      for (let i = 0; i < tx.logs.length; i++) {
        if (tx.logs[i].event == 'Delegated') {
          // no event with isDelegated = true
          Helper.assertEqual(tx.logs[i].args.isDelegated, false);
        }
      }

      tx = await stakingContract.delegate(victor, {from: victor});
      // no event at all
      for (let i = 0; i < tx.logs.length; i++) {
        assert(tx.logs[i].event != 'Delegated', "shouldn't have any delegated event");
      }
    });

    it("Test delegate same address many times", async function() {
      await deployStakingContract(10, currentBlock + 10);

      await kncToken.transfer(victor, mulPrecision(100));
      await kncToken.approve(stakingContract.address, mulPrecision(100), {from: victor});

      await stakingContract.delegate(mike, {from: victor});

      await Helper.setNextBlockTimestamp(
        blockToTimestamp(4 * epochPeriod + startBlock)
      );

      await stakingContract.deposit(mulPrecision(50), {from: victor});

      Helper.assertEqual(mike, await stakingContract.getLatestRepresentative(victor), "latest representative is incorrect");
      Helper.assertEqual(0, await stakingContract.getDelegatedStakesValue(mike, 5), "delegated stake is incorrect");
      Helper.assertEqual(mulPrecision(50), await stakingContract.getDelegatedStakesValue(mike, 6), "delegated stake is incorrect");
      Helper.assertEqual(mulPrecision(50), await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake is incorrect");

      await stakingContract.delegate(mike, {from: victor});

      Helper.assertEqual(mike, await stakingContract.getLatestRepresentative(victor), "latest representative is incorrect");
      Helper.assertEqual(0, await stakingContract.getDelegatedStakesValue(mike, 5), "delegated stake is incorrect");
      Helper.assertEqual(mulPrecision(50), await stakingContract.getDelegatedStakesValue(mike, 6), "delegated stake is incorrect");
      Helper.assertEqual(mulPrecision(50), await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake is incorrect");

      await Helper.increaseNextBlockTimestamp(
        blocksToSeconds(4 * epochPeriod)
      );

      await stakingContract.delegate(mike, {from: victor});

      Helper.assertEqual(mike, await stakingContract.getLatestRepresentative(victor), "latest representative is incorrect");
      Helper.assertEqual(mulPrecision(50), await stakingContract.getDelegatedStake(mike, 10), "delegated stake is incorrect");
      Helper.assertEqual(mulPrecision(50), await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake is incorrect");
    });

    it("Test delegate, then delegate back to yourself", async function() {
      await deployStakingContract(10, currentBlock + 10);

      await kncToken.transfer(victor, mulPrecision(100));
      await kncToken.approve(stakingContract.address, mulPrecision(100), {from: victor});

      await stakingContract.delegate(mike, {from: victor});
      await stakingContract.deposit(mulPrecision(50), {from: victor});

      await Helper.mineNewBlockAt(
        blockToTimestamp(4 * epochPeriod + startBlock)
      );

      Helper.assertEqual(mike, await stakingContract.getLatestRepresentative(victor), "latest representative is incorrect");
      Helper.assertEqual(mulPrecision(50), await stakingContract.getDelegatedStake(mike, 4), "delegated stake is incorrect");
      Helper.assertEqual(mulPrecision(50), await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake is incorrect");

      await stakingContract.delegate(victor, {from: victor});

      Helper.assertEqual(victor, await stakingContract.getLatestRepresentative(victor), "latest representative is incorrect");
      // delegate back to yourself, shouldn't have any delegated stake
      Helper.assertEqual(0, await stakingContract.getLatestDelegatedStake(victor), "latest delegated stake is incorrect");

      Helper.assertEqual(mulPrecision(50), await stakingContract.getDelegatedStakesValue(mike, 5), "delegated stake is incorrect");
      Helper.assertEqual(0, await stakingContract.getDelegatedStakesValue(mike, 6), "delegated stake is incorrect");
      Helper.assertEqual(0, await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake is incorrect");
    });

    it("Test delegate after few epochs didn't do anything", async function() {
      await deployStakingContract(10, currentBlock + 10);

      await kncToken.transfer(victor, mulPrecision(100));
      await kncToken.approve(stakingContract.address, mulPrecision(100), {from: victor});
      await stakingContract.deposit(mulPrecision(100), {from: victor});

      await Helper.setNextBlockTimestamp(
        blockToTimestamp(4 * epochPeriod + startBlock)
      );

      await stakingContract.delegate(mike, {from: victor});

      Helper.assertEqual(mike, await stakingContract.getLatestRepresentative(victor), "latest representative is incorrect");
      Helper.assertEqual(mulPrecision(100), await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake is incorrect");
      Helper.assertEqual(0, await stakingContract.getDelegatedStakesValue(mike, 5), "delegated stake is incorrect");
      Helper.assertEqual(mulPrecision(100), await stakingContract.getDelegatedStakesValue(mike, 6), "delegated stake is incorrect");
    });

    it("Test delegate then deposit more at current + next + after few epochs", async function() {
      await deployStakingContract(10, currentBlock + 10);

      await kncToken.transfer(victor, mulPrecision(400));
      await kncToken.approve(stakingContract.address, mulPrecision(400), {from: victor});
      await stakingContract.deposit(mulPrecision(100), {from: victor});

      await Helper.setNextBlockTimestamp(
        blockToTimestamp(4 * epochPeriod + startBlock)
      );

      await stakingContract.delegate(mike, {from: victor});
      await stakingContract.deposit(mulPrecision(40), {from: victor});

      Helper.assertEqual(0, await stakingContract.getDelegatedStakesValue(mike, 5), "delegated stake is incorrect");
      Helper.assertEqual(mulPrecision(140), await stakingContract.getDelegatedStakesValue(mike, 6), "delegated stake is incorrect");

      await Helper.increaseNextBlockTimestamp(
        blocksToSeconds(epochPeriod)
      );
      await stakingContract.deposit(mulPrecision(60), {from: victor});

      Helper.assertEqual(mulPrecision(140), await stakingContract.getDelegatedStakesValue(mike, 6), "delegated stake is incorrect");
      Helper.assertEqual(mulPrecision(200), await stakingContract.getDelegatedStakesValue(mike, 7), "delegated stake is incorrect");

      await Helper.increaseNextBlockTimestamp(
        blocksToSeconds(epochPeriod * 4)
      );
      await stakingContract.deposit(mulPrecision(200), {from: victor});

      Helper.assertEqual(mulPrecision(200), await stakingContract.getDelegatedStakesValue(mike, 10), "delegated stake is incorrect");
      Helper.assertEqual(mulPrecision(400), await stakingContract.getDelegatedStakesValue(mike, 11), "delegated stake is incorrect");
    });

    it("Test delegate from many addresses, stakes change as expected", async function() {
      await deployStakingContract(10, currentBlock + 10);

      await kncToken.transfer(victor, mulPrecision(400));
      await kncToken.approve(stakingContract.address, mulPrecision(400), {from: victor});
      await stakingContract.deposit(mulPrecision(100), {from: victor});

      await kncToken.transfer(mike, mulPrecision(400));
      await kncToken.approve(stakingContract.address, mulPrecision(400), {from: mike});
      await stakingContract.deposit(mulPrecision(100), {from: mike});

      await stakingContract.delegate(loi, {from: victor});
      await stakingContract.delegate(loi, {from: mike});

      Helper.assertEqual(mulPrecision(200), await stakingContract.getDelegatedStakesValue(loi, 1), "delegated stake is wrong");
      Helper.assertEqual(mulPrecision(200), await stakingContract.getLatestDelegatedStake(loi), "latest delegated stake is wrong");
      Helper.assertEqual(loi, await stakingContract.getLatestRepresentative(mike), "representative is wrong");
      Helper.assertEqual(loi, await stakingContract.getLatestRepresentative(victor), "representative is wrong");

      await Helper.increaseNextBlockTimestamp(
        blocksToSeconds(4 * epochPeriod)
      );
      await stakingContract.withdraw(mulPrecision(10), {from: victor});

      Helper.assertEqual(mulPrecision(190), await stakingContract.getDelegatedStakesValue(loi, 4), "delegated stake is wrong");
      Helper.assertEqual(mulPrecision(190), await stakingContract.getLatestDelegatedStake(loi), "latest delegated stake is wrong");
      Helper.assertEqual(loi, await stakingContract.getLatestRepresentative(mike), "representative is wrong");
      Helper.assertEqual(loi, await stakingContract.getLatestRepresentative(victor), "representative is wrong");

      await stakingContract.delegate(victor, {from: victor});

      Helper.assertEqual(mulPrecision(100), await stakingContract.getDelegatedStakesValue(loi, 5), "delegated stake is wrong");
      Helper.assertEqual(mulPrecision(100), await stakingContract.getLatestDelegatedStake(loi), "latest delegated stake is wrong");
      Helper.assertEqual(loi, await stakingContract.getLatestRepresentative(mike), "representative is wrong");
      Helper.assertEqual(victor, await stakingContract.getLatestRepresentative(victor), "representative is wrong");
    });

    it("Test delegate then withdraw, stakes change as expected", async function() {
      await deployStakingContract(10, currentBlock + 10);

      await kncToken.transfer(victor, mulPrecision(400));
      await kncToken.approve(stakingContract.address, mulPrecision(400), {from: victor});
      await stakingContract.deposit(mulPrecision(400), {from: victor});

      await stakingContract.delegate(loi, {from: victor});
      await stakingContract.withdraw(mulPrecision(100), {from: victor});

      Helper.assertEqual(mulPrecision(300), await stakingContract.getDelegatedStakesValue(loi, 1), "delegated stake is not correct");
      Helper.assertEqual(mulPrecision(300), await stakingContract.getLatestDelegatedStake(loi), "delegated stake is not correct");

      await Helper.setNextBlockTimestamp(
        blockToTimestamp(startBlock)
      );
      await stakingContract.withdraw(mulPrecision(100), {from: victor});

      Helper.assertEqual(mulPrecision(200), await stakingContract.getDelegatedStakesValue(loi, 1), "delegated stake is not correct");
      Helper.assertEqual(mulPrecision(200), await stakingContract.getDelegatedStakesValue(loi, 2), "delegated stake is not correct");
      Helper.assertEqual(mulPrecision(200), await stakingContract.getLatestDelegatedStake(loi), "delegated stake is not correct");

      await Helper.mineNewBlockAfter(
        blocksToSeconds(4 * epochPeriod) - 2
      );

      Helper.assertEqual(mulPrecision(200), await stakingContract.getDelegatedStake(loi, 4), "delegated stake is not correct");
      Helper.assertEqual(mulPrecision(200), await stakingContract.getDelegatedStake(loi, 5), "delegated stake is not correct");

      await Helper.increaseNextBlockTimestamp(1);
      await stakingContract.withdraw(mulPrecision(10), {from: victor});

      Helper.assertEqual(mulPrecision(190), await stakingContract.getDelegatedStakesValue(loi, 4), "delegated stake is not correct");
      Helper.assertEqual(mulPrecision(190), await stakingContract.getDelegatedStakesValue(loi, 5), "delegated stake is not correct");
      Helper.assertEqual(mulPrecision(190), await stakingContract.getLatestDelegatedStake(loi), "delegated stake is not correct");
    });

    it("Test delegate then withdraw after new deposit, stakes change as expected", async function() {
      await deployStakingContract(10, currentBlock + 10);

      await kncToken.transfer(victor, mulPrecision(400));
      await kncToken.approve(stakingContract.address, mulPrecision(400), {from: victor});
      await stakingContract.deposit(mulPrecision(300), {from: victor});

      await stakingContract.delegate(loi, {from: victor});
      await stakingContract.withdraw(mulPrecision(100), {from: victor});

      Helper.assertEqual(mulPrecision(200), await stakingContract.getDelegatedStakesValue(loi, 1), "delegated stake is not correct");
      Helper.assertEqual(mulPrecision(200), await stakingContract.getLatestDelegatedStake(loi), "delegated stake is not correct");

      await Helper.setNextBlockTimestamp(
        blockToTimestamp(startBlock)
      );
      await stakingContract.withdraw(mulPrecision(100), {from: victor});

      Helper.assertEqual(mulPrecision(100), await stakingContract.getDelegatedStakesValue(loi, 1), "delegated stake is not correct");
      Helper.assertEqual(mulPrecision(100), await stakingContract.getDelegatedStakesValue(loi, 2), "delegated stake is not correct");
      Helper.assertEqual(mulPrecision(100), await stakingContract.getLatestDelegatedStake(loi), "delegated stake is not correct");

      await Helper.mineNewBlockAfter(
        blocksToSeconds(4 * epochPeriod) - 2
      );

      Helper.assertEqual(mulPrecision(100), await stakingContract.getDelegatedStake(loi, 4), "delegated stake is not correct");
      Helper.assertEqual(mulPrecision(100), await stakingContract.getDelegatedStake(loi, 5), "delegated stake is not correct");

      // deposit at the end of the epoch
      await Helper.increaseNextBlockTimestamp(1);
      await stakingContract.deposit(mulPrecision(50), {from: victor});
      Helper.assertEqual(mulPrecision(100), await stakingContract.getDelegatedStakesValue(loi, 4), "delegated stake is not correct");
      Helper.assertEqual(mulPrecision(150), await stakingContract.getDelegatedStakesValue(loi, 5), "delegated stake is not correct");

      await stakingContract.withdraw(mulPrecision(10), {from: victor});

      Helper.assertEqual(mulPrecision(100), await stakingContract.getDelegatedStakesValue(loi, 4), "delegated stake is not correct");
      Helper.assertEqual(mulPrecision(140), await stakingContract.getDelegatedStakesValue(loi, 5), "delegated stake is not correct");
      Helper.assertEqual(mulPrecision(140), await stakingContract.getLatestDelegatedStake(loi), "delegated stake is not correct");
    });

    it("Test delegate at end and beginning of an epoch", async function() {
      await deployStakingContract(10, currentBlock + 10);

      await kncToken.transfer(victor, mulPrecision(400));
      await kncToken.approve(stakingContract.address, mulPrecision(400), {from: victor});
      await stakingContract.deposit(mulPrecision(300), {from: victor});

      await Helper.setNextBlockTimestamp(
        blockToTimestamp(startBlock) - 1
      );
      // delegate at end of epoch
      await stakingContract.delegate(mike, {from: victor});

      Helper.assertEqual(mulPrecision(300), await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake is wrong");
      Helper.assertEqual(mulPrecision(300), await stakingContract.getDelegatedStakesValue(mike, 1), "delegated stake is wrong");
      Helper.assertEqual(0, await stakingContract.getDelegatedStakesValue(mike, 0), "delegated stake is wrong");
      Helper.assertEqual(mike, await stakingContract.getRepresentativeValue(victor, 1), "representative is wrong");
      Helper.assertEqual(victor, await stakingContract.getRepresentativeValue(victor, 0), "representative is wrong");

      await Helper.setNextBlockTimestamp(
        blockToTimestamp(epochPeriod + startBlock)
      );
      // delegate at begin of epoch 2
      await stakingContract.delegate(loi, {from: victor});

      Helper.assertEqual(0, await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake is wrong");
      Helper.assertEqual(mulPrecision(300), await stakingContract.getDelegatedStakesValue(mike, 1), "delegated stake is wrong");
      Helper.assertEqual(mulPrecision(300), await stakingContract.getDelegatedStakesValue(mike, 2), "delegated stake is wrong");

      Helper.assertEqual(mulPrecision(300), await stakingContract.getLatestDelegatedStake(loi), "latest delegated stake is wrong");
      Helper.assertEqual(0, await stakingContract.getDelegatedStakesValue(loi, 2), "delegated stake is wrong");
      Helper.assertEqual(mulPrecision(300), await stakingContract.getDelegatedStakesValue(loi, 3), "delegated stake is wrong");

      Helper.assertEqual(mike, await stakingContract.getRepresentativeValue(victor, 2), "representative is wrong");
      Helper.assertEqual(loi, await stakingContract.getRepresentativeValue(victor, 3), "representative is wrong");
    });

    it("Test delegate circulation, data changes as expect", async function() {
      await deployStakingContract(10, currentBlock + 20);

      await kncToken.transfer(victor, mulPrecision(400));
      await kncToken.approve(stakingContract.address, mulPrecision(400), {from: victor});
      await stakingContract.deposit(mulPrecision(100), {from: victor});

      await kncToken.transfer(mike, mulPrecision(400));
      await kncToken.approve(stakingContract.address, mulPrecision(400), {from: mike});
      await stakingContract.deposit(mulPrecision(200), {from: mike});

      await kncToken.transfer(loi, mulPrecision(400));
      await kncToken.approve(stakingContract.address, mulPrecision(400), {from: loi});
      await stakingContract.deposit(mulPrecision(300), {from: loi});

      await stakingContract.delegate(mike, {from: victor});
      await stakingContract.delegate(loi, {from: mike});
      await stakingContract.delegate(victor, {from: loi});

      Helper.assertEqual(mulPrecision(100), await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake is wrong");
      Helper.assertEqual(mulPrecision(100), await stakingContract.getDelegatedStakesValue(mike, 1), "delegated stake is wrong");
      Helper.assertEqual(loi, await stakingContract.getRepresentativeValue(mike, 1), "representative is wrong");
      Helper.assertEqual(loi, await stakingContract.getLatestRepresentative(mike), "latest representative is wrong");

      Helper.assertEqual(mulPrecision(200), await stakingContract.getLatestDelegatedStake(loi), "latest delegated stake is wrong");
      Helper.assertEqual(mulPrecision(200), await stakingContract.getDelegatedStakesValue(loi, 1), "delegated stake is wrong");
      Helper.assertEqual(victor, await stakingContract.getRepresentativeValue(loi, 1), "representative is wrong");
      Helper.assertEqual(victor, await stakingContract.getLatestRepresentative(loi), "latest representative is wrong");

      Helper.assertEqual(mulPrecision(300), await stakingContract.getLatestDelegatedStake(victor), "latest delegated stake is wrong");
      Helper.assertEqual(mulPrecision(300), await stakingContract.getDelegatedStakesValue(victor, 1), "delegated stake is wrong");
      Helper.assertEqual(mike, await stakingContract.getRepresentativeValue(victor, 1), "representative is wrong");
      Helper.assertEqual(mike, await stakingContract.getLatestRepresentative(victor), "latest representative is wrong");

      await Helper.setNextBlockTimestamp(
        blockToTimestamp(startBlock + 1)
      );

      await stakingContract.deposit(mulPrecision(50), {from: mike});
      Helper.assertEqual(mulPrecision(250), await stakingContract.getLatestDelegatedStake(loi), "latest delegated stake is wrong");
      Helper.assertEqual(mulPrecision(200), await stakingContract.getDelegatedStakesValue(loi, 1), "delegated stake is wrong");
      Helper.assertEqual(mulPrecision(250), await stakingContract.getDelegatedStakesValue(loi, 2), "delegated stake is wrong");
      Helper.assertEqual(mulPrecision(100), await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake is wrong");
      Helper.assertEqual(mulPrecision(300), await stakingContract.getLatestDelegatedStake(victor), "latest delegated stake is wrong");

      await stakingContract.withdraw(mulPrecision(50), {from: loi});
      Helper.assertEqual(mulPrecision(250), await stakingContract.getLatestDelegatedStake(victor), "latest delegated stake is wrong");
      Helper.assertEqual(mulPrecision(250), await stakingContract.getDelegatedStakesValue(victor, 1), "delegated stake is wrong");
      Helper.assertEqual(mulPrecision(250), await stakingContract.getDelegatedStakesValue(victor, 2), "delegated stake is wrong");
      Helper.assertEqual(mulPrecision(100), await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake is wrong");
      Helper.assertEqual(mulPrecision(250), await stakingContract.getLatestDelegatedStake(loi), "latest delegated stake is wrong");

      await Helper.mineNewBlockAfter(
        blocksToSeconds(epochPeriod * 4)
      );
      Helper.assertEqual(mulPrecision(250), await stakingContract.getDelegatedStake(victor, 4), "delegated stake is wrong");
      Helper.assertEqual(mulPrecision(100), await stakingContract.getDelegatedStake(mike, 4), "delegated stake is wrong");
      Helper.assertEqual(mulPrecision(250), await stakingContract.getDelegatedStake(loi, 4), "delegated stake is wrong");

      await stakingContract.delegate(mike, {from: loi});
      Helper.assertEqual(mulPrecision(250), await stakingContract.getDelegatedStakesValue(victor, 5), "delegated stake is wrong");
      Helper.assertEqual(mulPrecision(100), await stakingContract.getDelegatedStakesValue(mike, 5), "delegated stake is wrong");
      Helper.assertEqual(mulPrecision(250), await stakingContract.getDelegatedStakesValue(loi, 5), "delegated stake is wrong");

      Helper.assertEqual(0, await stakingContract.getDelegatedStakesValue(victor, 6), "delegated stake is wrong");
      Helper.assertEqual(mulPrecision(350), await stakingContract.getDelegatedStakesValue(mike, 6), "delegated stake is wrong");
      Helper.assertEqual(mulPrecision(250), await stakingContract.getDelegatedStakesValue(loi, 6), "delegated stake is wrong");
    });

    it("Test delegate, then delegate to another, deposit + withdraw stakes change as expected", async function() {
      await deployStakingContract(10, currentBlock + 20);

      await kncToken.transfer(victor, mulPrecision(400));
      await kncToken.approve(stakingContract.address, mulPrecision(400), {from: victor});
      await stakingContract.deposit(mulPrecision(100), {from: victor});

      await stakingContract.delegate(mike, {from: victor});

      await Helper.setNextBlockTimestamp(
        blockToTimestamp(startBlock)
      );

      await stakingContract.delegate(loi, {from: victor});
      Helper.assertEqual(mulPrecision(100), await stakingContract.getDelegatedStakesValue(mike, 1), "delegated stake is wrong");
      Helper.assertEqual(mike, await stakingContract.getRepresentativeValue(victor, 1), "representative is wrong");
      Helper.assertEqual(0, await stakingContract.getDelegatedStakesValue(mike, 2), "delegated stake is wrong");

      Helper.assertEqual(loi, await stakingContract.getRepresentativeValue(victor, 2), "representative is wrong");
      Helper.assertEqual(0, await stakingContract.getDelegatedStakesValue(loi, 1), "delegated stake is wrong");
      Helper.assertEqual(mulPrecision(100), await stakingContract.getDelegatedStakesValue(loi, 2), "delegated stake is wrong");

      await stakingContract.deposit(mulPrecision(100), {from: victor});
      Helper.assertEqual(mulPrecision(100), await stakingContract.getDelegatedStakesValue(mike, 1), "delegated stake is wrong");
      Helper.assertEqual(mike, await stakingContract.getRepresentativeValue(victor, 1), "representative is wrong");
      Helper.assertEqual(0, await stakingContract.getDelegatedStakesValue(mike, 2), "delegated stake is wrong");

      Helper.assertEqual(loi, await stakingContract.getRepresentativeValue(victor, 2), "representative is wrong");
      Helper.assertEqual(0, await stakingContract.getDelegatedStakesValue(loi, 1), "delegated stake is wrong");
      Helper.assertEqual(mulPrecision(200), await stakingContract.getDelegatedStakesValue(loi, 2), "delegated stake is wrong");

      await stakingContract.withdraw(mulPrecision(150), {from: victor});
      Helper.assertEqual(mulPrecision(50), await stakingContract.getDelegatedStakesValue(mike, 1), "delegated stake is wrong");
      Helper.assertEqual(mike, await stakingContract.getRepresentativeValue(victor, 1), "representative is wrong");
      Helper.assertEqual(0, await stakingContract.getDelegatedStakesValue(mike, 2), "delegated stake is wrong");

      Helper.assertEqual(loi, await stakingContract.getRepresentativeValue(victor, 2), "representative is wrong");
      Helper.assertEqual(0, await stakingContract.getDelegatedStakesValue(loi, 1), "delegated stake is wrong");
      Helper.assertEqual(mulPrecision(50), await stakingContract.getDelegatedStakesValue(loi, 2), "delegated stake is wrong");
    });

    it("Test delegate data is inited correctly", async function() {
      await deployStakingContract(10, currentBlock + 10);

      await kncToken.transfer(victor, mulPrecision(100));
      await kncToken.approve(stakingContract.address, mulPrecision(100), {from: victor});

      await Helper.setNextBlockTimestamp(
        blockToTimestamp(3 * epochPeriod + startBlock)
      );

      await stakingContract.delegate(mike, {from: victor});
      Helper.assertEqual(false, await stakingContract.getHasInitedValue(victor, 3), "shouldn't be inited data");
      Helper.assertEqual(true, await stakingContract.getHasInitedValue(victor, 4), "should be inited data");
      Helper.assertEqual(true, await stakingContract.getHasInitedValue(victor, 5), "should be inited data");

      await Helper.increaseNextBlockTimestamp(
        blocksToSeconds(4 * epochPeriod)
      );
      Helper.assertEqual(false, await stakingContract.getHasInitedValue(victor, 8), "should be inited data");
      Helper.assertEqual(false, await stakingContract.getHasInitedValue(victor, 9), "should be inited data");
      Helper.assertEqual(false, await stakingContract.getHasInitedValue(mike, 8), "should be inited data");
      Helper.assertEqual(false, await stakingContract.getHasInitedValue(mike, 9), "should be inited data");

      await stakingContract.delegate(mike, {from: victor});
      Helper.assertEqual(true, await stakingContract.getHasInitedValue(victor, 8), "should be inited data");
      Helper.assertEqual(true, await stakingContract.getHasInitedValue(victor, 9), "should be inited data");
      Helper.assertEqual(false, await stakingContract.getHasInitedValue(mike, 8), "shouldn't't be inited data");
      Helper.assertEqual(false, await stakingContract.getHasInitedValue(mike, 9), "shouldn't be inited data");

      await Helper.increaseNextBlockTimestamp(
        blocksToSeconds(4 * epochPeriod)
      );
      Helper.assertEqual(false, await stakingContract.getHasInitedValue(victor, 12), "shouldn't be inited data");
      Helper.assertEqual(false, await stakingContract.getHasInitedValue(victor, 13), "shouldn't be inited data");
      Helper.assertEqual(false, await stakingContract.getHasInitedValue(mike, 12), "shouldn't be inited data");
      Helper.assertEqual(false, await stakingContract.getHasInitedValue(mike, 13), "shouldn't be inited data");
      Helper.assertEqual(false, await stakingContract.getHasInitedValue(loi, 12), "shouldn't be inited data");
      Helper.assertEqual(false, await stakingContract.getHasInitedValue(loi, 13), "shouldn't be inited data");

      await stakingContract.delegate(loi, {from: victor});
      Helper.assertEqual(true, await stakingContract.getHasInitedValue(victor, 12), "should be inited data");
      Helper.assertEqual(true, await stakingContract.getHasInitedValue(victor, 13), "should be inited data");
      Helper.assertEqual(true, await stakingContract.getHasInitedValue(mike, 12), "shouldn't be inited data");
      Helper.assertEqual(true, await stakingContract.getHasInitedValue(mike, 13), "shouldn't be inited data");
      Helper.assertEqual(true, await stakingContract.getHasInitedValue(loi, 12), "should be inited data");
      Helper.assertEqual(true, await stakingContract.getHasInitedValue(loi, 13), "should be inited data");
    });

    it("Test delegate gas usages", async function() {
      await deployStakingContract(5, currentBlock + 5);

      let tx = await stakingContract.delegate(mike, {from: victor});
      logInfo("Delegate no stake: init 2 epochs data + from self to mike, gas used: " + tx.receipt.gasUsed);
      await stakingContract.delegate(victor, {from: victor});
      // jump to epoch 1
      await Helper.setNextBlockTimestamp(
        blockToTimestamp(startBlock)
      );
      tx = await stakingContract.delegate(mike, {from: victor});
      logInfo("Delegate no stake: init 1 epoch data + from self to mike, gas used: " + tx.receipt.gasUsed);
      await stakingContract.delegate(victor, {from: victor});
      await Helper.increaseNextBlockTimestamp(
        blocksToSeconds(epochPeriod)
      );
      // to make init 2 epochs data
      await stakingContract.delegate(victor, {from: victor});
      tx = await stakingContract.delegate(loi, {from: victor});
      logInfo("Delegate no stake: no init epoch data + from self to mike, gas used: " + tx.receipt.gasUsed);
      tx = await stakingContract.delegate(loi, {from: victor});
      logInfo("Delegate no stake: no init epoch data + same delegated, gas used: " + tx.receipt.gasUsed);
      tx = await stakingContract.delegate(loi, {from: victor});
      logInfo("Delegate no stake: no init epoch data + back to self, gas used: " + tx.receipt.gasUsed);

      await stakingContract.delegate(victor, {from: victor});

      // make deposit
      await kncToken.transfer(victor, mulPrecision(100));
      await kncToken.approve(stakingContract.address, mulPrecision(100), {from: victor});
      await stakingContract.deposit(mulPrecision(10), {from: victor});

      await Helper.setNextBlockTimestamp(
        blockToTimestamp(4 * epochPeriod + startBlock)
      );
      tx = await stakingContract.delegate(mike, {from: victor});
      logInfo("Delegate has stake: init 2 epochs data + from self to mike, gas used: " + tx.receipt.gasUsed);
      await stakingContract.delegate(victor, {from: victor});
      await Helper.setNextBlockTimestamp(
        blockToTimestamp(5 * epochPeriod + startBlock)
      );
      tx = await stakingContract.delegate(mike, {from: victor});
      logInfo("Delegate has stake: init 1 epoch data + from self to mike, gas used: " + tx.receipt.gasUsed);
      await Helper.setNextBlockTimestamp(
        blockToTimestamp(6 * epochPeriod + startBlock)
      );
      // to make init 2 epochs data
      await stakingContract.delegate(victor, {from: victor});
      tx = await stakingContract.delegate(loi, {from: victor});
      logInfo("Delegate has stake: no init epoch data + from self to mike, gas used: " + tx.receipt.gasUsed);

      await Helper.setNextBlockTimestamp(
        blockToTimestamp(8 * epochPeriod + startBlock)
      );
      tx = await stakingContract.delegate(mike, {from: victor});
      logInfo("Delegate has stake: init 2 epochs data + from mike to loi, gas used: " + tx.receipt.gasUsed);
      await stakingContract.delegate(victor, {from: victor});
      await Helper.setNextBlockTimestamp(
        blockToTimestamp(9 * epochPeriod + startBlock)
      );
      tx = await stakingContract.delegate(mike, {from: victor});
      logInfo("Delegate has stake: init 1 epoch data + from mike to loi, gas used: " + tx.receipt.gasUsed);
      await Helper.setNextBlockTimestamp(
        blockToTimestamp(10 * epochPeriod + startBlock)
      );
      // to make init 2 epochs data
      await stakingContract.delegate(victor, {from: victor});
      tx = await stakingContract.delegate(loi, {from: victor});
      logInfo("Delegate has stake: no init epoch data + from mike to loi, gas used: " + tx.receipt.gasUsed);

      tx = await stakingContract.delegate(loi, {from: victor});
      logInfo("Delegate has stake: same representative, gas used: " + tx.receipt.gasUsed);
      tx = await stakingContract.delegate(victor, {from: victor});
      logInfo("Delegate has stake: back to self, gas used: " + tx.receipt.gasUsed);
    });
  });

  describe("#GetFunctions Tests", () => {
    it("Test get functions return default value when calling epoch > current epoch + 1", async function() {
      await deployStakingContract(6, currentBlock + 10);

      await kncToken.transfer(victor, mulPrecision(100));
      await kncToken.approve(stakingContract.address, mulPrecision(100), {from: victor});
      await stakingContract.deposit(mulPrecision(50), {from: victor});

      Helper.assertEqual(0, await stakingContract.getStake(victor, 100), "get stakes should return 0");
      Helper.assertEqual(0, await stakingContract.getDelegatedStake(victor, 100), "get stakes should return 0");
      Helper.assertEqual(zeroAddress, await stakingContract.getRepresentative(victor, 100), "get stakes should return 0");
    });

    it("Test getStake returns correct data", async function() {
      await deployStakingContract(6, currentBlock + 10);

      await kncToken.transfer(victor, mulPrecision(200));
      await kncToken.approve(stakingContract.address, mulPrecision(200), {from: victor});
      await stakingContract.deposit(mulPrecision(50), {from: victor});

      Helper.assertEqual(0, await stakingContract.getStake(victor, 0), "get stakes should return 0");
      Helper.assertEqual(mulPrecision(50), await stakingContract.getStake(victor, 1), "get stakes should return correct data");

      await stakingContract.deposit(mulPrecision(20), {from: victor});

      await Helper.mineNewBlockAt(
        blockToTimestamp(3 * epochPeriod + startBlock)
      );

      // get data current + next epoch
      Helper.assertEqual(mulPrecision(70), await stakingContract.getStake(victor, 4), "get stakes should return correct data");
      Helper.assertEqual(mulPrecision(70), await stakingContract.getStake(victor, 5), "get stakes should return correct data");

      currentBlock = await Helper.getCurrentBlock();
      await Helper.mineNewBlockAfter(
        blocksToSeconds(6 * epochPeriod)
      );

      // get data for pass epoch
      Helper.assertEqual(mulPrecision(70), await stakingContract.getStake(victor, 7), "get stakes should return correct data");
      Helper.assertEqual(mulPrecision(70), await stakingContract.getStake(victor, 8), "get stakes should return correct data");

      await stakingContract.deposit(mulPrecision(30), {from: victor});

      // get data for past epoch
      Helper.assertEqual(mulPrecision(70), await stakingContract.getStake(victor, 7), "get stakes should return correct data");
      Helper.assertEqual(mulPrecision(70), await stakingContract.getStake(victor, 8), "get stakes should return correct data");

      // get data for current epoch
      Helper.assertEqual(mulPrecision(70), await stakingContract.getStake(victor, 10), "get stakes should return correct data");
      Helper.assertEqual(mulPrecision(100), await stakingContract.getStake(victor, 11), "get stakes should return correct data");

      Helper.assertEqual(0, await stakingContract.getStake(victor, 100), "get stake should return correct data");
    });

    it("Test getDelegatedStake returns correct data", async function() {
      await deployStakingContract(6, currentBlock + 10);

      await kncToken.transfer(victor, mulPrecision(200));
      await kncToken.approve(stakingContract.address, mulPrecision(200), {from: victor});
      await stakingContract.deposit(mulPrecision(50), {from: victor});
      await stakingContract.delegate(mike, {from: victor});

      Helper.assertEqual(0, await stakingContract.getDelegatedStake(victor, 0), "get delegated stakes should return 0");
      Helper.assertEqual(0, await stakingContract.getDelegatedStake(victor, 1), "get delegated stakes should return correct data");
      Helper.assertEqual(0, await stakingContract.getDelegatedStake(mike, 0), "get delegated stakes should return 0");
      Helper.assertEqual(mulPrecision(50), await stakingContract.getDelegatedStake(mike, 1), "get delegated stakes should return correct data");

      await stakingContract.deposit(mulPrecision(20), {from: victor});

      await Helper.mineNewBlockAt(
        blockToTimestamp(3 * epochPeriod + startBlock)
      );

      // get data current + next epoch
      Helper.assertEqual(mulPrecision(70), await stakingContract.getDelegatedStake(mike, 4), "get delegated stakes should return correct data");
      Helper.assertEqual(mulPrecision(70), await stakingContract.getDelegatedStake(mike, 5), "get delegated stakes should return correct data");

      await Helper.mineNewBlockAfter(
        blocksToSeconds(6 * epochPeriod) - 2
      );

      // get data for past epoch
      Helper.assertEqual(mulPrecision(70), await stakingContract.getDelegatedStake(mike, 8), "get delegated stakes should return correct data");

      // deposit at the end of the epoch
      await Helper.increaseNextBlockTimestamp(1);
      await stakingContract.deposit(mulPrecision(30), {from: victor});

      // get data for pass epoch
      Helper.assertEqual(mulPrecision(70), await stakingContract.getDelegatedStake(mike, 8), "get delegated stakes should return correct data");

      // get data for current + next epoch
      Helper.assertEqual(mulPrecision(70), await stakingContract.getDelegatedStake(mike, 9), "get delegated stakes should return correct data");
      Helper.assertEqual(mulPrecision(100), await stakingContract.getDelegatedStake(mike, 10), "get delegated stakes should return correct data");

      await stakingContract.delegate(loi, {from: victor});
      // get data for pass epoch
      Helper.assertEqual(0, await stakingContract.getDelegatedStake(loi, 8), "get delegated stakes should return correct data");
      Helper.assertEqual(mulPrecision(70), await stakingContract.getDelegatedStake(mike, 8), "get delegated stakes should return correct data");

      // get data for current epoch
      Helper.assertEqual(mulPrecision(100), await stakingContract.getDelegatedStake(mike, 10), "get delegatedstakes should return correct data");
      Helper.assertEqual(0, await stakingContract.getDelegatedStake(mike, 11), "get delegatedstakes should return correct data");
      Helper.assertEqual(0, await stakingContract.getDelegatedStake(loi, 10), "get delegated stakes should return correct data");
      Helper.assertEqual(mulPrecision(100), await stakingContract.getDelegatedStake(loi, 11), "get delegated stakes should return correct data");

      Helper.assertEqual(0, await stakingContract.getDelegatedStake(victor, 100), "get delegated stake should return correct data");
    });

    it("Test getRepresentative returns correct data", async function() {
      await deployStakingContract(6, currentBlock + 10);

      Helper.assertEqual(mike, await stakingContract.getRepresentative(mike, 0), "get representative should return correct data");
      Helper.assertEqual(mike, await stakingContract.getRepresentative(mike, 1), "get representative should return correct data");
      Helper.assertEqual(victor, await stakingContract.getRepresentative(victor, 0), "get representative should return correct data");
      Helper.assertEqual(victor, await stakingContract.getRepresentative(victor, 1), "get representative should return correct data");

      await kncToken.transfer(victor, mulPrecision(200));
      await kncToken.approve(stakingContract.address, mulPrecision(200), {from: victor});
      await stakingContract.delegate(mike, {from: victor});

      Helper.assertEqual(victor, await stakingContract.getRepresentative(victor, 0), "get representative should return correct data");
      Helper.assertEqual(mike, await stakingContract.getRepresentative(victor, 1), "get representative should return correct data");

      await Helper.mineNewBlockAt(
        blockToTimestamp(3 * epochPeriod + startBlock)
      );

      // get data current + next epoch
      Helper.assertEqual(mike, await stakingContract.getRepresentative(victor, 4), "get representative should return correct data");
      Helper.assertEqual(mike, await stakingContract.getRepresentative(victor, 5), "get representative should return correct data");

      currentBlock = await Helper.getCurrentBlock();
      await Helper.mineNewBlockAfter(
        blocksToSeconds(6 * epochPeriod)
      );

      // get data for past epoch
      Helper.assertEqual(mike, await stakingContract.getRepresentative(mike, 7), "get representative should return correct data");

      await stakingContract.delegate(loi, {from: victor});
      // get data for pass epoch
      Helper.assertEqual(mike, await stakingContract.getRepresentative(victor, 7), "get representative should return correct data");

      // get data for current epoch
      Helper.assertEqual(mike, await stakingContract.getRepresentative(victor, 10), "get representative should return correct data");
      Helper.assertEqual(loi, await stakingContract.getRepresentative(victor, 11), "get representative should return correct data");

      Helper.assertEqual(zeroAddress, await stakingContract.getRepresentative(victor, 100), "get representative should return correct data");
    });

    it("Test getStake returns correct data", async function() {
      await deployStakingContract(6, currentBlock + 10);

      await kncToken.transfer(victor, mulPrecision(200));
      await kncToken.approve(stakingContract.address, mulPrecision(200), {from: victor});
      await kncToken.transfer(mike, mulPrecision(200));
      await kncToken.approve(stakingContract.address, mulPrecision(200), {from: mike});

      let data = await stakingContract.getStakerRawData(victor, 0);
      Helper.assertEqual(0, data[0], "stake is wrong");
      Helper.assertEqual(0, data[1], "delegated stake is wrong");
      Helper.assertEqual(zeroAddress, data[2], "representative is wrong");

      await stakingContract.deposit(mulPrecision(50), {from: victor});

      data = await stakingContract.getStakerRawData(victor, 0);
      Helper.assertEqual(0, data[0], "stake is wrong");
      Helper.assertEqual(0, data[1], "delegated stake is wrong");
      Helper.assertEqual(victor, data[2], "representative is wrong");

      data = await stakingContract.getStakerRawData(victor, 1);
      Helper.assertEqual(mulPrecision(50), data[0], "stake is wrong");
      Helper.assertEqual(0, data[1], "delegated stake is wrong");
      Helper.assertEqual(victor, data[2], "representative is wrong");

      await Helper.setNextBlockTimestamp(
        blockToTimestamp(startBlock)
      );
      await stakingContract.deposit(mulPrecision(20), {from: victor});

      data = await stakingContract.getStakerRawData(victor, 1);
      Helper.assertEqual(mulPrecision(50), data[0], "stake is wrong");
      data = await stakingContract.getStakerRawData(victor, 2);
      Helper.assertEqual(mulPrecision(70), data[0], "stake is wrong");

      data = await stakingContract.getStakerRawData(victor, 3);
      // not inited yet
      Helper.assertEqual(0, data[0], "stake is wrong");
      Helper.assertEqual(0, data[1], "delegated stake is wrong");
      Helper.assertEqual(zeroAddress, data[2], "representative is wrong");

      await Helper.setNextBlockTimestamp(
        blockToTimestamp(6 * epochPeriod + startBlock)
      );

      data = await stakingContract.getStakerRawData(victor, 4);
      // not inited yet
      Helper.assertEqual(0, data[0], "stake is wrong");
      Helper.assertEqual(0, data[1], "delegated stake is wrong");
      Helper.assertEqual(zeroAddress, data[2], "representative is wrong");

      await stakingContract.delegate(mike, {from: victor});
      data = await stakingContract.getStakerRawData(mike, 7);
      Helper.assertEqual(0, data[0], "stake is wrong");
      Helper.assertEqual(0, data[1], "delegated stake is wrong");
      Helper.assertEqual(mike, data[2], "representative is wrong");
      data = await stakingContract.getStakerRawData(mike, 8);
      Helper.assertEqual(0, data[0], "stake is wrong");
      Helper.assertEqual(mulPrecision(70), data[1], "delegated stake is wrong");
      Helper.assertEqual(mike, data[2], "representative is wrong");

      await stakingContract.deposit(mulPrecision(100), {from: mike});
      data = await stakingContract.getStakerRawData(mike, 8);
      Helper.assertEqual(mulPrecision(100), data[0], "stake is wrong");
      Helper.assertEqual(mulPrecision(70), data[1], "delegated stake is wrong");
      Helper.assertEqual(mike, data[2], "representative is wrong");

      data = await stakingContract.getStakerRawData(victor, 8);
      Helper.assertEqual(mulPrecision(70), data[0], "stake is wrong");
      Helper.assertEqual(0, data[1], "delegated stake is wrong");
      Helper.assertEqual(mike, data[2], "representative is wrong");

      await Helper.setNextBlockTimestamp(
        blockToTimestamp(7 * epochPeriod + startBlock)
      );

      await stakingContract.delegate(loi, {from: victor});

      data = await stakingContract.getStakerRawData(mike, 8);
      Helper.assertEqual(mulPrecision(100), data[0], "stake is wrong");
      Helper.assertEqual(mulPrecision(70), data[1], "delegated stake is wrong");
      Helper.assertEqual(mike, data[2], "representative is wrong");

      data = await stakingContract.getStakerRawData(mike, 9);
      Helper.assertEqual(mulPrecision(100), data[0], "stake is wrong");
      Helper.assertEqual(0, data[1], "delegated stake is wrong");
      Helper.assertEqual(mike, data[2], "representative is wrong");

      data = await stakingContract.getStakerRawData(loi, 8);
      Helper.assertEqual(0, data[1], "delegated stake is wrong");

      data = await stakingContract.getStakerRawData(loi, 9);
      Helper.assertEqual(mulPrecision(70), data[1], "delegated stake is wrong");

      data = await stakingContract.getStakerRawData(victor, 8);
      Helper.assertEqual(0, data[1], "delegated stake is wrong");
      Helper.assertEqual(mike, data[2], "representative is wrong");

      data = await stakingContract.getStakerRawData(victor, 9);
      Helper.assertEqual(0, data[1], "delegated stake is wrong");
      Helper.assertEqual(loi, data[2], "representative is wrong");
    });

    it("Test get latest stake returns correct data", async function() {
      await deployStakingContract(6, currentBlock + 10);

      await kncToken.transfer(victor, mulPrecision(200));
      await kncToken.approve(stakingContract.address, mulPrecision(200), {from: victor});

      Helper.assertEqual(0, await stakingContract.getLatestStakeBalance(victor), "latest stake is wrong");

      await stakingContract.deposit(mulPrecision(10), {from: victor});
      Helper.assertEqual(mulPrecision(10), await stakingContract.getLatestStakeBalance(victor), "latest stake is wrong");

      await Helper.increaseNextBlockTimestamp(
        blocksToSeconds(20)
      );
      Helper.assertEqual(mulPrecision(10), await stakingContract.getLatestStakeBalance(victor), "latest stake is wrong");

      await stakingContract.deposit(mulPrecision(20), {from: victor});
      Helper.assertEqual(mulPrecision(30), await stakingContract.getLatestStakeBalance(victor), "latest stake is wrong");
      await stakingContract.withdraw(mulPrecision(5), {from: victor});
      Helper.assertEqual(mulPrecision(25), await stakingContract.getLatestStakeBalance(victor), "latest stake is wrong");
      await stakingContract.deposit(mulPrecision(15), {from: victor});
      Helper.assertEqual(mulPrecision(40), await stakingContract.getLatestStakeBalance(victor), "latest stake is wrong");
      await stakingContract.withdraw(mulPrecision(30), {from: victor});
      Helper.assertEqual(mulPrecision(10), await stakingContract.getLatestStakeBalance(victor), "latest stake is wrong");

      await Helper.increaseNextBlockTimestamp(
        blocksToSeconds(35)
      );
      await stakingContract.withdraw(mulPrecision(10), {from: victor});
      Helper.assertEqual(0, await stakingContract.getLatestStakeBalance(victor), "latest stake is wrong");
      await stakingContract.deposit(mulPrecision(20), {from: victor});
      Helper.assertEqual(mulPrecision(20), await stakingContract.getLatestStakeBalance(victor), "latest stake is wrong");

      await stakingContract.delegate(mike, {from: victor});
      Helper.assertEqual(mulPrecision(20), await stakingContract.getLatestStakeBalance(victor), "latest stake is wrong");
      Helper.assertEqual(0, await stakingContract.getLatestStakeBalance(mike), "latest stake is wrong");

      await stakingContract.deposit(mulPrecision(10), {from: victor});
      Helper.assertEqual(mulPrecision(30), await stakingContract.getLatestStakeBalance(victor), "latest stake is wrong");
      Helper.assertEqual(0, await stakingContract.getLatestStakeBalance(mike), "latest stake is wrong");

      await stakingContract.delegate(loi, {from: victor});
      Helper.assertEqual(mulPrecision(30), await stakingContract.getLatestStakeBalance(victor), "latest stake is wrong");
      Helper.assertEqual(0, await stakingContract.getLatestStakeBalance(loi), "latest stake is wrong");
      Helper.assertEqual(0, await stakingContract.getLatestStakeBalance(mike), "latest stake is wrong");
    });

    it("Test get latest delegated stake returns correct data", async function() {
      await deployStakingContract(6, currentBlock + 10);

      await kncToken.transfer(victor, mulPrecision(500));
      await kncToken.approve(stakingContract.address, mulPrecision(500), {from: victor});

      await kncToken.transfer(mike, mulPrecision(500));
      await kncToken.approve(stakingContract.address, mulPrecision(500), {from: mike});

      await kncToken.transfer(loi, mulPrecision(500));
      await kncToken.approve(stakingContract.address, mulPrecision(500), {from: loi});

      Helper.assertEqual(0, await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake is wrong");
      Helper.assertEqual(0, await stakingContract.getLatestDelegatedStake(loi), "latest delegated stake is wrong");
      Helper.assertEqual(0, await stakingContract.getLatestDelegatedStake(victor), "latest delegated stake is wrong");

      await stakingContract.deposit(mulPrecision(50), {from: victor});
      await stakingContract.deposit(mulPrecision(60), {from: loi});
      await stakingContract.deposit(mulPrecision(70), {from: mike});

      Helper.assertEqual(0, await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake is wrong");
      Helper.assertEqual(0, await stakingContract.getLatestDelegatedStake(loi), "latest delegated stake is wrong");
      Helper.assertEqual(0, await stakingContract.getLatestDelegatedStake(victor), "latest delegated stake is wrong");

      await stakingContract.delegate(mike, {from: victor});
      Helper.assertEqual(mulPrecision(50), await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake is wrong");
      Helper.assertEqual(0, await stakingContract.getLatestDelegatedStake(victor), "latest delegated stake is wrong");

      await Helper.increaseNextBlockTimestamp(
        blocksToSeconds(25)
      );
      await stakingContract.delegate(loi, {from: victor});
      Helper.assertEqual(0, await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake is wrong");
      Helper.assertEqual(mulPrecision(50), await stakingContract.getLatestDelegatedStake(loi), "latest delegated stake is wrong");
      Helper.assertEqual(0, await stakingContract.getLatestDelegatedStake(victor), "latest delegated stake is wrong");

      await stakingContract.deposit(mulPrecision(50), {from: victor});
      Helper.assertEqual(mulPrecision(100), await stakingContract.getLatestDelegatedStake(loi), "latest delegated stake is wrong");
      Helper.assertEqual(0, await stakingContract.getLatestDelegatedStake(victor), "latest delegated stake is wrong");

      await stakingContract.withdraw(mulPrecision(20), {from: victor});
      Helper.assertEqual(mulPrecision(80), await stakingContract.getLatestDelegatedStake(loi), "latest delegated stake is wrong");
      Helper.assertEqual(0, await stakingContract.getLatestDelegatedStake(victor), "latest delegated stake is wrong");

      await Helper.increaseNextBlockTimestamp(
        blocksToSeconds(25)
      );
      await stakingContract.delegate(mike, {from: loi});
      await stakingContract.delegate(victor, {from: mike});
      Helper.assertEqual(mulPrecision(80), await stakingContract.getLatestDelegatedStake(loi), "latest delegated stake is wrong");
      Helper.assertEqual(mulPrecision(70), await stakingContract.getLatestDelegatedStake(victor), "latest delegated stake is wrong");
      Helper.assertEqual(mulPrecision(60), await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake is wrong");

      await Helper.increaseNextBlockTimestamp(
        blocksToSeconds(25)
      );
      await stakingContract.deposit(mulPrecision(30), {from: mike});
      Helper.assertEqual(mulPrecision(80), await stakingContract.getLatestDelegatedStake(loi), "latest delegated stake is wrong");
      Helper.assertEqual(mulPrecision(100), await stakingContract.getLatestDelegatedStake(victor), "latest delegated stake is wrong");
      Helper.assertEqual(mulPrecision(60), await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake is wrong");

      await stakingContract.withdraw(mulPrecision(10), {from: loi});
      Helper.assertEqual(mulPrecision(80), await stakingContract.getLatestDelegatedStake(loi), "latest delegated stake is wrong");
      Helper.assertEqual(mulPrecision(100), await stakingContract.getLatestDelegatedStake(victor), "latest delegated stake is wrong");
      Helper.assertEqual(mulPrecision(50), await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake is wrong");

      await stakingContract.delegate(mike, {from: mike});
      Helper.assertEqual(mulPrecision(80), await stakingContract.getLatestDelegatedStake(loi), "latest delegated stake is wrong");
      Helper.assertEqual(0, await stakingContract.getLatestDelegatedStake(victor), "latest delegated stake is wrong");
      Helper.assertEqual(mulPrecision(50), await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake is wrong");
    });

    it("Test get representative returns correct data", async function() {
      await deployStakingContract(6, currentBlock + 10);

      Helper.assertEqual(mike, await stakingContract.getLatestRepresentative(mike), "latest representative is wrong");
      Helper.assertEqual(victor, await stakingContract.getLatestRepresentative(victor), "latest representative is wrong");
      Helper.assertEqual(loi, await stakingContract.getLatestRepresentative(loi), "latest representative is wrong");

      await Helper.increaseNextBlockTimestamp(
        blocksToSeconds(20)
      );
      await stakingContract.delegate(mike, {from: victor});

      Helper.assertEqual(mike, await stakingContract.getLatestRepresentative(mike), "latest representative is wrong");
      Helper.assertEqual(mike, await stakingContract.getLatestRepresentative(victor), "latest representative is wrong");
      Helper.assertEqual(loi, await stakingContract.getLatestRepresentative(loi), "latest representative is wrong");

      await stakingContract.delegate(victor, {from: loi});
      Helper.assertEqual(mike, await stakingContract.getLatestRepresentative(mike), "latest representative is wrong");
      Helper.assertEqual(mike, await stakingContract.getLatestRepresentative(victor), "latest representative is wrong");
      Helper.assertEqual(victor, await stakingContract.getLatestRepresentative(loi), "latest representative is wrong");

      await stakingContract.delegate(mike, {from: loi});
      Helper.assertEqual(mike, await stakingContract.getLatestRepresentative(mike), "latest representative is wrong");
      Helper.assertEqual(mike, await stakingContract.getLatestRepresentative(victor), "latest representative is wrong");
      Helper.assertEqual(mike, await stakingContract.getLatestRepresentative(loi), "latest representative is wrong");

      await stakingContract.delegate(loi, {from: mike});
      Helper.assertEqual(loi, await stakingContract.getLatestRepresentative(mike), "latest representative is wrong");
      Helper.assertEqual(mike, await stakingContract.getLatestRepresentative(victor), "latest representative is wrong");
      Helper.assertEqual(mike, await stakingContract.getLatestRepresentative(loi), "latest representative is wrong");

      await Helper.increaseNextBlockTimestamp(
        blocksToSeconds(25)
      );
      Helper.assertEqual(loi, await stakingContract.getLatestRepresentative(mike), "latest representative is wrong");
      Helper.assertEqual(mike, await stakingContract.getLatestRepresentative(victor), "latest representative is wrong");
      Helper.assertEqual(mike, await stakingContract.getLatestRepresentative(loi), "latest representative is wrong");

      await stakingContract.delegate(mike, {from: mike});
      Helper.assertEqual(mike, await stakingContract.getLatestRepresentative(mike), "latest representative is wrong");
      Helper.assertEqual(mike, await stakingContract.getLatestRepresentative(victor), "latest representative is wrong");
      Helper.assertEqual(mike, await stakingContract.getLatestRepresentative(loi), "latest representative is wrong");

      await stakingContract.delegate(victor, {from: mike});
      Helper.assertEqual(victor, await stakingContract.getLatestRepresentative(mike), "latest representative is wrong");
      Helper.assertEqual(mike, await stakingContract.getLatestRepresentative(victor), "latest representative is wrong");
      Helper.assertEqual(mike, await stakingContract.getLatestRepresentative(loi), "latest representative is wrong");
    });

    it("test get staker data returns correct data", async function() {
      await deployStakingContract(20, currentBlock + 20);

      // get staker data for epoch > current epoch + 1
      let stakerData;
      for(let i = 2; i <= 4; i++) {
        stakerData = await stakingContract.getStakerData(mike, i);
        verifyStakerData(stakerData, 0, 0, zeroAddress);
      }

      // get stake with no init yet
      stakerData = await stakingContract.getStakerData(mike, 1);
      verifyStakerData(stakerData, 0, 0, mike);
      // get stake for epoch 0
      stakerData = await stakingContract.getStakerData(mike, 0);
      verifyStakerData(stakerData, 0, 0, mike);

      await kncToken.transfer(victor, mulPrecision(200));
      await kncToken.approve(stakingContract.address, mulPrecision(200), {from: victor});

      await kncToken.transfer(mike, mulPrecision(300));
      await kncToken.approve(stakingContract.address, mulPrecision(300), {from: mike});

      await stakingContract.deposit(mulPrecision(200), {from: victor});
      await stakingContract.deposit(mulPrecision(300), {from: mike});

      // get stake for epoch 0
      stakerData = await stakingContract.getStakerData(mike, 0);
      verifyStakerData(stakerData, 0, 0, mike);
      // get stake for epoch 1
      stakerData = await stakingContract.getStakerData(mike, 1);
      verifyStakerData(stakerData, mulPrecision(300), 0, mike);
      await stakingContract.delegate(mike, {from: victor});
      // get stake for epoch 1
      stakerData = await stakingContract.getStakerData(mike, 1);
      verifyStakerData(stakerData, mulPrecision(300), mulPrecision(200), mike);
      // get stake for epoch 0
      stakerData = await stakingContract.getStakerData(victor, 0);
      verifyStakerData(stakerData, 0, 0, victor);
      // get stake for epoch 1
      stakerData = await stakingContract.getStakerData(victor, 1);
      verifyStakerData(stakerData, mulPrecision(200), 0, mike);

      // delay to epoch 1
      await Helper.mineNewBlockAfter(
        blocksToSeconds(25)
      );

      // get stake for epoch 2
      stakerData = await stakingContract.getStakerData(mike, 2);
      verifyStakerData(stakerData, mulPrecision(300), mulPrecision(200), mike);

      // get stake for epoch 2
      stakerData = await stakingContract.getStakerData(victor, 2);
      verifyStakerData(stakerData, mulPrecision(200), 0, mike);

      await stakingContract.withdraw(mulPrecision(100), {from: victor});

      // check staker data for epoch 1, 2, 3 for victor
      for(let i = 1; i <= 2; i++) {
        stakerData = await stakingContract.getStakerData(mike, i);
        verifyStakerData(stakerData, mulPrecision(300), mulPrecision(100), mike);

        stakerData = await stakingContract.getStakerData(victor, i);
        verifyStakerData(stakerData, mulPrecision(100), 0, mike);
      }

      await stakingContract.delegate(loi, {from: victor});

      // get stake for epoch 1
      stakerData = await stakingContract.getStakerData(mike, 1);
      verifyStakerData(stakerData, mulPrecision(300), mulPrecision(100), mike);
      // get stake for epoch 2
      stakerData = await stakingContract.getStakerData(mike, 2);
      verifyStakerData(stakerData, mulPrecision(300), 0, mike);
      // get stake for epoch 1
      stakerData = await stakingContract.getStakerData(victor, 1);
      verifyStakerData(stakerData, mulPrecision(100), 0, mike);
      // get stake for epoch 2
      stakerData = await stakingContract.getStakerData(victor, 2);
      verifyStakerData(stakerData, mulPrecision(100), 0, loi);
    });

    it("test get latest staker data returns correct data", async() => {
      await deployStakingContract(20, currentBlock + 20);

      // get default data
      let stakerData = await stakingContract.getLatestStakerData(mike);
      verifyStakerData(stakerData, 0, 0, mike);

      stakerData = await stakingContract.getLatestStakerData(victor);
      verifyStakerData(stakerData, 0, 0, victor);

      await kncToken.transfer(victor, mulPrecision(200));
      await kncToken.approve(stakingContract.address, mulPrecision(200), {from: victor});

      await kncToken.transfer(mike, mulPrecision(300));
      await kncToken.approve(stakingContract.address, mulPrecision(300), {from: mike});

      await kncToken.transfer(loi, mulPrecision(100));
      await kncToken.approve(stakingContract.address, mulPrecision(100), {from: loi});

      await stakingContract.deposit(mulPrecision(200), {from: victor});
      await stakingContract.deposit(mulPrecision(300), {from: mike});
      await stakingContract.deposit(mulPrecision(100), {from: loi});

      // get data after deposit, no delegation
      stakerData = await stakingContract.getLatestStakerData(mike);
      verifyStakerData(stakerData, mulPrecision(300), 0, mike);

      stakerData = await stakingContract.getLatestStakerData(victor);
      verifyStakerData(stakerData, mulPrecision(200), 0, victor);

      stakerData = await stakingContract.getLatestStakerData(loi);
      verifyStakerData(stakerData, mulPrecision(100), 0, loi);

      // get data after withdraw
      await stakingContract.withdraw(mulPrecision(50), {from: mike});
      stakerData = await stakingContract.getLatestStakerData(mike);
      verifyStakerData(stakerData, mulPrecision(250), 0, mike);

      // victor delegates to mike
      await stakingContract.delegate(mike, {from: victor});
      stakerData = await stakingContract.getLatestStakerData(mike);
      verifyStakerData(stakerData, mulPrecision(250), mulPrecision(200), mike);

      stakerData = await stakingContract.getLatestStakerData(victor);
      verifyStakerData(stakerData, mulPrecision(200), 0, mike);

      stakerData = await stakingContract.getLatestStakerData(loi);
      verifyStakerData(stakerData, mulPrecision(100), 0, loi);

      // loi delegates to mike
      await stakingContract.delegate(mike, {from: loi});
      stakerData = await stakingContract.getLatestStakerData(mike);
      verifyStakerData(stakerData, mulPrecision(250), mulPrecision(300), mike);

      stakerData = await stakingContract.getLatestStakerData(victor);
      verifyStakerData(stakerData, mulPrecision(200), 0, mike);

      stakerData = await stakingContract.getLatestStakerData(loi);
      verifyStakerData(stakerData, mulPrecision(100), 0, mike);

      // victor withdraws
      await stakingContract.withdraw(mulPrecision(100), {from: victor});
      stakerData = await stakingContract.getLatestStakerData(mike);
      verifyStakerData(stakerData, mulPrecision(250), mulPrecision(200), mike);

      stakerData = await stakingContract.getLatestStakerData(victor);
      verifyStakerData(stakerData, mulPrecision(100), 0, mike);

      stakerData = await stakingContract.getLatestStakerData(loi);
      verifyStakerData(stakerData, mulPrecision(100), 0, mike);

      // victor delegates to loi
      await stakingContract.delegate(loi, {from: victor});
      stakerData = await stakingContract.getLatestStakerData(mike);
      verifyStakerData(stakerData, mulPrecision(250), mulPrecision(100), mike);

      stakerData = await stakingContract.getLatestStakerData(victor);
      verifyStakerData(stakerData, mulPrecision(100), 0, loi);

      stakerData = await stakingContract.getLatestStakerData(loi);
      verifyStakerData(stakerData, mulPrecision(100), mulPrecision(100), mike);

      // victor withdraws delegation
      await stakingContract.delegate(victor, {from: victor});
      stakerData = await stakingContract.getLatestStakerData(mike);
      verifyStakerData(stakerData, mulPrecision(250), mulPrecision(100), mike);

      stakerData = await stakingContract.getLatestStakerData(victor);
      verifyStakerData(stakerData, mulPrecision(100), 0, victor);

      stakerData = await stakingContract.getLatestStakerData(loi);
      verifyStakerData(stakerData, mulPrecision(100), 0, mike);
    });

    it("Test get staker data for current epoch called by KyberDao", async function() {
      kyberDao = accounts[1];
      await deployStakingContract(15, currentBlock + 15);

      await kncToken.transfer(victor, mulPrecision(500));
      await kncToken.approve(stakingContract.address, mulPrecision(500), {from: victor});

      await kncToken.transfer(mike, mulPrecision(500));
      await kncToken.approve(stakingContract.address, mulPrecision(500), {from: mike});

      await kncToken.transfer(loi, mulPrecision(500));
      await kncToken.approve(stakingContract.address, mulPrecision(500), {from: loi});

      await checkInitAndReturnStakerDataForCurrentEpoch(victor, 0, 0, victor, kyberDao);

      await stakingContract.deposit(mulPrecision(100), {from: victor});
      await checkInitAndReturnStakerDataForCurrentEpoch(victor, 0, 0, victor, kyberDao);

      // delay to epoch 2
      await Helper.setNextBlockTimestamp(
        blockToTimestamp(epochPeriod + startBlock)
      );

      Helper.assertEqual(false, await stakingContract.getHasInitedValue(victor, 2), "shouldn't inited value for epoch 2");

      // victor: stake (100), delegated stake (0), representative (victor)
      await checkInitAndReturnStakerDataForCurrentEpoch(
        victor, mulPrecision(100), 0, victor, kyberDao
      );
      Helper.assertEqual(true, await stakingContract.getHasInitedValue(victor, 2), "should inited value for epoch 2");
      Helper.assertEqual(true, await stakingContract.getHasInitedValue(victor, 3), "should inited value for epoch 3");

      await stakingContract.delegate(mike, {from: victor});
      // victor: stake (100), delegated stake (0), representative (victor)
      await checkInitAndReturnStakerDataForCurrentEpoch(
        victor, mulPrecision(100), 0, victor, kyberDao
      );

      // mike: stake (0), delegated stake (0), representative (mike)
      await checkInitAndReturnStakerDataForCurrentEpoch(
        mike, 0, 0, mike, kyberDao
      );

      await stakingContract.deposit(mulPrecision(200), {from: mike});

      await Helper.setNextBlockTimestamp(
        blockToTimestamp(2 * epochPeriod + startBlock)
      );

      // victor: stake (100), delegated stake (0), representative (mike)
      await checkInitAndReturnStakerDataForCurrentEpoch(
        victor, mulPrecision(100), 0, mike, kyberDao
      );

      // mike: stake (200), delegated stake (100), representative (mike)
      await checkInitAndReturnStakerDataForCurrentEpoch(
        mike, mulPrecision(200), mulPrecision(100), mike, kyberDao
      );

      await stakingContract.delegate(loi, {from: victor});

      // mike: stake (200), delegated stake (100), representative (mike)
      await checkInitAndReturnStakerDataForCurrentEpoch(
        mike, mulPrecision(200), mulPrecision(100), mike, kyberDao
      );
      // loi: stake (0), delegated stake (0), representative (loi)
      await checkInitAndReturnStakerDataForCurrentEpoch(
        loi, 0, 0, loi, kyberDao
      );

      await stakingContract.deposit(mulPrecision(10), {from: victor});
      // loi: stake (0), delegated stake (0), representative (loi)
      await checkInitAndReturnStakerDataForCurrentEpoch(
        loi, 0, 0, loi, kyberDao
      );

      // mike: stake (200), delegated stake (100), representative (mike)
      await checkInitAndReturnStakerDataForCurrentEpoch(
        mike, mulPrecision(200), mulPrecision(100), mike, kyberDao
      );

      await Helper.setNextBlockTimestamp(
        blockToTimestamp(3 * epochPeriod + startBlock)
      );

      // mike: stake (200), delegated stake (0), representative (mike)
      await checkInitAndReturnStakerDataForCurrentEpoch(
        mike, mulPrecision(200), 0, mike, kyberDao
      );

      // loi: stake (0), delegated stake (90), representative (loi)
      await checkInitAndReturnStakerDataForCurrentEpoch(
        loi, 0, mulPrecision(110), loi, kyberDao
      );
    });
  });

  describe("#Revert Tests", () => {
    it("Test constructor should revert with invalid arguments", async function() {
      // knc is 0
      await expectRevert(
        StakingContract.new(
          zeroAddress,
          blocksToSeconds(20),
          blockToTimestamp(currentBlock + 10),
          kyberDao
        ),
        "ctor: kncToken 0"
      );
      // epoch period is 0
      await expectRevert(
        StakingContract.new(
          kncToken.address,
          blocksToSeconds(0),
          blockToTimestamp(currentBlock + 10),
          kyberDao
        ),
        "ctor: epoch period is 0"
      )
      // start timestamp is in the past
      await expectRevert(
        StakingContract.new(
          kncToken.address,
          blocksToSeconds(20),
          blockToTimestamp(currentBlock - 1),
          kyberDao
        ),
        "ctor: start in the past"
      )
      // dao setter is 0
      await expectRevert(
        StakingContract.new(
          kncToken.address,
          blocksToSeconds(20),
          blockToTimestamp(currentBlock + 10),
          zeroAddress
        ),
        "ctor: kyberDao 0"
      )
      stakingContract = await StakingContract.new(
        kncToken.address,
        blocksToSeconds(20),
        blockToTimestamp(currentBlock + 10),
        kyberDao
      )
    });

    it("Test deposit should revert when amount is 0", async function() {
      await deployStakingContract(6, currentBlock + 6);

      await kncToken.transfer(victor, mulPrecision(100));
      await kncToken.approve(stakingContract.address, mulPrecision(100), {from: victor});

      await expectRevert(
        stakingContract.deposit(0, {from: victor}),
        "deposit: amount is 0"
      )
      await stakingContract.deposit(mulPrecision(90), {from: victor});
    });

    it("Test deposit should revert when not enough balance or allowance", async function() {
      await deployStakingContract(10, currentBlock + 10);

      // has 100 tokens, approve enough but try to deposit more
      await kncToken.transfer(victor, mulPrecision(100));
      await kncToken.approve(stakingContract.address, mulPrecision(100), {from: victor});
      await expectRevert(
        stakingContract.deposit(mulPrecision(200), {from: victor}),
        "transfer more then allowed"
      )
      await stakingContract.deposit(mulPrecision(90), {from: victor});
      await stakingContract.deposit(mulPrecision(10), {from: victor});

      // has more tokens, approve small amounts and try to deposit more than allowances
      await kncToken.transfer(mike, mulPrecision(1000));
      // not approve yet, should revert
      await expectRevert(
        stakingContract.deposit(mulPrecision(100), {from: mike}),
        "transfer more then allowed"
      )

      // approve and deposit more than allowance
      await kncToken.approve(stakingContract.address, mulPrecision(100), {from: mike});
      await expectRevert(
        stakingContract.deposit(mulPrecision(200), {from: mike}),
        "transfer more then allowed"
      )

      // total deposit more than allowances
      await stakingContract.deposit(mulPrecision(50), {from: mike});
      await expectRevert(
        stakingContract.deposit(mulPrecision(51), {from: mike}),
        "transfer more then allowed"
      )

      await stakingContract.deposit(mulPrecision(50), {from: mike});
    });

    it("Test get staker data for current epoch should revert when sender is not dao", async function() {
      kyberDao = accounts[1];
      await deployStakingContract(10, currentBlock + 10);
      await expectRevert(
        stakingContract.initAndReturnStakerDataForCurrentEpoch(mike, {from: mike}),
        "initAndReturnData: only kyberDao"
      )
      await stakingContract.initAndReturnStakerDataForCurrentEpoch(mike, {from: kyberDao});
    });

    it("Test withdraw should revert amount is 0", async function() {
      await deployStakingContract(10, currentBlock + 20);

      await kncToken.transfer(victor, mulPrecision(100));
      await kncToken.approve(stakingContract.address, mulPrecision(100), {from: victor});
      await stakingContract.deposit(mulPrecision(100), {from: victor});

      await expectRevert(
        stakingContract.withdraw(0, {from: victor}),
        "withdraw: amount is 0"
      )
      await stakingContract.withdraw(mulPrecision(10), {from: victor});
    });

    it("Test withdraw should revert when amount more than current deposited amount", async function() {
      await deployStakingContract(10, currentBlock + 20);

      await kncToken.transfer(victor, mulPrecision(100));
      await kncToken.approve(stakingContract.address, mulPrecision(100), {from: victor});
      await stakingContract.deposit(mulPrecision(100), {from: victor});

      await kncToken.transfer(mike, mulPrecision(100));
      await kncToken.approve(stakingContract.address, mulPrecision(100), {from: mike});
      await stakingContract.deposit(mulPrecision(100), {from: mike});

      await kncToken.transfer(loi, mulPrecision(800));
      await kncToken.approve(stakingContract.address, mulPrecision(800), {from: loi});
      await stakingContract.deposit(mulPrecision(800), {from: loi});

      Helper.assertEqual(0, await stakingContract.getStake(victor, 0), "stake at epoch 0 is wrong");
      Helper.assertEqual(mulPrecision(100), await stakingContract.getStake(victor, 1), "stake at epoch 0 is wrong");
      Helper.assertEqual(mulPrecision(800), await stakingContract.getStake(loi, 1), "stake at epoch 1 is wrong");

      await expectRevert(
        stakingContract.withdraw(mulPrecision(900), {from: loi}),
        "withdraw: latest amount staked < withdrawal amount"
      )

      await stakingContract.withdraw(mulPrecision(100), {from: victor});

      Helper.assertEqual(0, await stakingContract.getStake(victor, 0), "stake at epoch 0 is wrong");
      Helper.assertEqual(0, await stakingContract.getStake(loi, 0), "stake at epoch 0 is wrong");
      Helper.assertEqual(0, await stakingContract.getStake(victor, 1), "stake at epoch 1 is wrong");

      Helper.assertEqual(mulPrecision(800), await stakingContract.getStake(loi, 1), "stake at epoch 1 is wrong");
      Helper.assertEqual(mulPrecision(100), await stakingContract.getStake(mike, 1), "stake at epoch 1 is wrong");

      Helper.assertEqual(
        0, await stakingContract.getLatestStakeBalance(victor), "latest stake is incorrect"
      );
      Helper.assertEqual(
        mulPrecision(800), await stakingContract.getLatestStakeBalance(loi), "latest stake is incorrect"
      );
      Helper.assertEqual(
        mulPrecision(100), await stakingContract.getLatestStakeBalance(mike), "latest stake is incorrect"
      );
    });

    it("Test withdraw should revert when no stakes but has delegated stake", async function() {
      await deployStakingContract(10, currentBlock + 10);

      await kncToken.transfer(victor, mulPrecision(500));
      await kncToken.approve(stakingContract.address, mulPrecision(500), {from: victor});
      await stakingContract.deposit(mulPrecision(100), {from: victor});

      await stakingContract.delegate(mike, {from: victor});
      await stakingContract.deposit(mulPrecision(200), {from: victor});

      // mike can not withdraw
      await expectRevert(
        stakingContract.withdraw(mulPrecision(100), {from: mike}),
        "withdraw: latest amount staked < withdrawal amount"
      )
      // victor can withdraw
      await stakingContract.withdraw(mulPrecision(100), {from: victor});
    });

    it("Test delegate should revert when delegate to address 0", async function() {
      await deployStakingContract(2, currentBlock + 2);
      await expectRevert(
        stakingContract.delegate(zeroAddress, {from: victor}),
        "delegate: representative 0"
      )
      await stakingContract.delegate(mike, {from: victor});
    });
  });

  // withdraw and check data, withdraw is success but handleWithdrawal could be reverted
  // isReverted is true means handleWithdrawal is reverted
  const withdrawAndCheckData = async(staker, withdrawAmount, isReverted) => {
    let epoch = (await stakingContract.getCurrentEpochNumber()) * 1;
    let latestStake = await stakingContract.getLatestStakeBalance(staker);
    let curStake = await stakingContract.getStake(staker, epoch);
    let hasInitCurStake = await stakingContract.getHasInitedValue(staker, epoch);
    let nextStake = await stakingContract.getStake(staker, epoch+1);
    // current representative
    let curDAddress = await stakingContract.getRepresentative(staker, epoch);
    // current representative's delegated stake
    let dStakeCurDAddress = await stakingContract.getDelegatedStake(curDAddress, epoch);
    // current representative's latest delegated stake
    let ldStakeCurDAddress = await stakingContract.getLatestDelegatedStake(curDAddress);
    let hasInitCurDAddress = await stakingContract.getHasInitedValue(curDAddress, epoch);
    // next representative
    let nextDAddress = await stakingContract.getRepresentative(staker, epoch+1);
    // next representative's latest delegated stake
    let ldStakeNextDAddress = await stakingContract.getLatestDelegatedStake(nextDAddress);
    // next representative's delegated stake
    let dStakeNextDAddress = await stakingContract.getDelegatedStake(nextDAddress, epoch+1);
    let hasInitNextDAddress = await stakingContract.getHasInitedValue(nextDAddress, epoch);

    let txResult = await stakingContract.withdraw(withdrawAmount, {from: staker});
    if (isReverted) {
      // check event
      expectEvent(txResult, 'WithdrawDataUpdateFailed', {
        curEpoch: new BN(epoch),
        staker: staker,
        amount: new BN(withdrawAmount)
      });
    }

    latestStake = latestStake.sub(withdrawAmount);
    Helper.assertEqual(latestStake, await stakingContract.getLatestStakeBalance(staker));

    // data will be updated if not reverted
    if (!isReverted) {
      if (!hasInitCurStake) {
        curStake = latestStake;
      }
      hasInitCurStake = true;
      let newStake = latestStake.gt(curStake) ? curStake : latestStake;
      let reducedAmount = curStake.sub(newStake);
      curStake = newStake;
      if (hasInitCurDAddress == false) {
        dStakeCurDAddress = ldStakeCurDAddress;
      }
      hasInitCurDAddress = true;
      dStakeCurDAddress = dStakeCurDAddress.sub(reducedAmount);

      nextStake = latestStake;
      if (hasInitNextDAddress == false) {
        dStakeNextDAddress = ldStakeNextDAddress;
      }
      if (nextDAddress != staker) {
        dStakeNextDAddress = dStakeNextDAddress.sub(withdrawAmount);
        ldStakeNextDAddress = ldStakeNextDAddress.sub(withdrawAmount);
      }
      hasInitNextDAddress = true;
    }

    Helper.assertEqual(curStake, await stakingContract.getStake(staker, epoch));
    Helper.assertEqual(nextStake, await stakingContract.getStake(staker, epoch+1));
    Helper.assertEqual(dStakeCurDAddress, await stakingContract.getDelegatedStake(curDAddress, epoch));
    Helper.assertEqual(dStakeNextDAddress, await stakingContract.getDelegatedStake(nextDAddress, epoch+1));
    Helper.assertEqual(ldStakeNextDAddress, await stakingContract.getLatestDelegatedStake(nextDAddress));
    // check has inited data
    Helper.assertEqual(hasInitCurStake, await stakingContract.getHasInitedValue(staker, epoch));
    Helper.assertEqual(hasInitCurDAddress, await stakingContract.getHasInitedValue(curDAddress, epoch));
    Helper.assertEqual(hasInitNextDAddress, await stakingContract.getHasInitedValue(nextDAddress, epoch));
  };

  describe("Test Withdrawal shouldn't revert", () => {
    it("Test withdraw shouldn't revert when handleWithdrawal in KyberDao reverted", async function() {
      let dao = await MockKyberDaoWithdrawFailed.new(
        blocksToSeconds(10),
        blockToTimestamp(currentBlock + 10)
      );
      kyberDao = dao.address;
      await deployStakingContract(10, currentBlock + 10);

      await kncToken.transfer(victor, mulPrecision(500));
      await kncToken.approve(stakingContract.address, mulPrecision(500), {from: victor});

      await stakingContract.deposit(mulPrecision(500), {from: victor});

      // shouldn't call withdraw from dao
      await stakingContract.withdraw(mulPrecision(100), {from: victor});

      await Helper.increaseNextBlockTimestamp(
        blocksToSeconds(epochPeriod)
      );
      // shoule call KyberDao, but shouldn't revert, all data is updated
      await withdrawAndCheckData(victor, mulPrecision(100), false);
      kyberDao = accounts[1];
    });

    it("Test withdraw shouldn't revert when handleWithdrawal in KyberDao reverted - delegation", async function() {
      let dao = await MockKyberDaoWithdrawFailed.new(
        blocksToSeconds(10),
        blockToTimestamp(currentBlock + 10)
      );
      kyberDao = dao.address;
      await deployStakingContract(10, currentBlock + 10);

      await kncToken.transfer(victor, mulPrecision(500));
      await kncToken.approve(stakingContract.address, mulPrecision(500), {from: victor});

      await Helper.mineNewBlockAt(blockToTimestamp(startBlock));

      await stakingContract.deposit(mulPrecision(500), {from: victor});
      await stakingContract.delegate(mike, {from: victor});

      await Helper.increaseNextBlockTimestamp(
        blocksToSeconds(epochPeriod)
      );
      await stakingContract.delegate(loi, {from: victor});

      // shoule call KyberDao, but shouldn't revert, all data is updated
      await withdrawAndCheckData(victor, mulPrecision(100), false);
      // delegate back to self and check
      await stakingContract.delegate(victor, {from: victor});
      await withdrawAndCheckData(victor, mulPrecision(100), false);
      await stakingContract.delegate(mike, {from: victor});
      await withdrawAndCheckData(victor, mulPrecision(100), false);
      kyberDao = accounts[1];
    });

    it("Test withdraw shouldn't revert when KyberDao does not have handleWithdrawl func", async function() {
      kyberDao = accounts[1];
      await deployStakingContract(10, currentBlock + 10);

      await kncToken.transfer(victor, mulPrecision(500));
      await kncToken.approve(stakingContract.address, mulPrecision(500), {from: victor});

      await stakingContract.deposit(mulPrecision(500), {from: victor});

      // shouldn't call withdraw from dao
      await stakingContract.withdraw(mulPrecision(100), {from: victor});
      await Helper.increaseNextBlockTimestamp(
        blocksToSeconds(epochPeriod)
      );

      // revert when calling dao, but withdraw function should pass
      await withdrawAndCheckData(victor, mulPrecision(100), false);
    });

    it("Test withdraw shouldn't revert with re-entrancy from KyberDao", async() => {
      await deployStakingContract(10, currentBlock + 10);
      let maliciousDao = await MaliciousDaoReentrancy.new(
        blocksToSeconds(10),
        blockToTimestamp(currentBlock + 10),
        stakingContract.address,
        kncToken.address
      );

      await kncToken.transfer(maliciousDao.address, mulPrecision(100));

      await maliciousDao.deposit(mulPrecision(80));

      // delay to epoch 1, so withdraw will call KyberDao to handle withdrawal
      await Helper.setNextBlockTimestamp(
        blockToTimestamp(startBlock)
      );

      // partial withdraw, dao will try to re-enter withdraw
      await maliciousDao.withdraw(mulPrecision(10));
      // all data should be updated
      await Helper.assertEqual(mulPrecision(70), await stakingContract.getLatestStakeBalance(maliciousDao.address));
      await Helper.assertEqual(mulPrecision(70), await stakingContract.getStake(maliciousDao.address, 1));
      await Helper.assertEqual(mulPrecision(70), await stakingContract.getStake(maliciousDao.address, 2));

      // full withdraw, no reentrant
      await maliciousDao.withdraw(mulPrecision(70));
      // stake and latest stake should be updated
      await Helper.assertEqual(0, await stakingContract.getLatestStakeBalance(maliciousDao.address));
      await Helper.assertEqual(0, await stakingContract.getStake(maliciousDao.address, 1));
      await Helper.assertEqual(0, await stakingContract.getStake(maliciousDao.address, 2));
    });

    it("Test withdraw shouldn't revert, stake at next epoch less than amount", async function() {
      epochPeriod = 10;
      startBlock = currentBlock + 20;
      stakingContract = await MaliciousStaking.new(
        kncToken.address,
        blocksToSeconds(epochPeriod),
        blockToTimestamp(startBlock),
        kyberDao
      );

      await kncToken.transfer(victor, mulPrecision(500));
      await kncToken.approve(stakingContract.address, mulPrecision(500), {from: victor});
      await stakingContract.deposit(mulPrecision(500), {from: victor});

      // reduce next epoch stake, so withdraw will check and revert
      await stakingContract.setEpochStake(victor, 1, mulPrecision(100));

      // latest stake is still update correctly
      // stake of next epoch is not updated
      await withdrawAndCheckData(victor, mulPrecision(200), true);
    });

    it("Test withdraw shouldn't revert, delegated stake less than withdrawal amount", async function() {
      epochPeriod = 10;
      startBlock = currentBlock + 20;
      stakingContract = await MaliciousStaking.new(
        kncToken.address,
        blocksToSeconds(epochPeriod),
        blockToTimestamp(startBlock),
        kyberDao
      );

      await kncToken.transfer(victor, mulPrecision(500));
      await kncToken.approve(stakingContract.address, mulPrecision(500), {from: victor});
      await stakingContract.deposit(mulPrecision(500), {from: victor});
      await stakingContract.delegate(mike, {from: victor});

      await stakingContract.setLatestDelegatedStake(mike, mulPrecision(200));

      // latest stake is still update correctly
      // latest delegated stake + delegated stake are not updated
      await withdrawAndCheckData(victor, mulPrecision(300), true);

      await stakingContract.setEpochDelegatedStake(mike, 1, mulPrecision(100));

      // latest stake is still update correctly
      // latest delegated stake + delegated stake are not updated
      await withdrawAndCheckData(victor, mulPrecision(150), true);
    });
  })

  describe("#Malicious Staking", () => {
    it("Test withdraw should revert, pass checking but not enough knc to withdraw", async function() {
      epochPeriod = 10;
      startBlock = currentBlock + 20;
      stakingContract = await MaliciousStaking.new(
        kncToken.address,
        blocksToSeconds(epochPeriod),
        blockToTimestamp(startBlock),
        kyberDao
      );

      await kncToken.transfer(victor, mulPrecision(500));
      await kncToken.approve(stakingContract.address, mulPrecision(500), {from: victor});
      await stakingContract.deposit(mulPrecision(500), {from: victor});

      // reduce next epoch stake, so withdraw will check and revert
      await stakingContract.setEpochStake(victor, 1, mulPrecision(1000));
      await stakingContract.setLatestStake(victor, mulPrecision(1000));

      await expectRevert(
        stakingContract.withdraw(mulPrecision(800), {from: victor}),
        "sub underflow"
      )
    });

    it("Test delegate should revert, delegated stake is small", async function() {
      epochPeriod = 10;
      startBlock = currentBlock + 20;
      stakingContract = await MaliciousStaking.new(
        kncToken.address,
        blocksToSeconds(epochPeriod),
        blockToTimestamp(startBlock),
        kyberDao
      );

      await kncToken.transfer(victor, mulPrecision(500));
      await kncToken.approve(stakingContract.address, mulPrecision(500), {from: victor});
      await stakingContract.deposit(mulPrecision(500), {from: victor});
      await stakingContract.delegate(mike, {from: victor});

      await stakingContract.setLatestDelegatedStake(mike, mulPrecision(200));

      await expectRevert.unspecified(
        stakingContract.delegate(loi, {from: victor})
      )

      await stakingContract.setEpochDelegatedStake(mike, 1, mulPrecision(200));

      await expectRevert.unspecified(
        stakingContract.delegate(loi, {from: victor})
      )
    });
  });
});

function verifyStakerData(stakerData, stake, delegatedStake, representative) {
  Helper.assertEqual(stake, stakerData.stake, "stake is wrong");
  Helper.assertEqual(delegatedStake, stakerData.delegatedStake, "delegated stake is wrong");
  Helper.assertEqual(representative, stakerData.representative, "representative is wrong");
}

function logInfo(message) {
  console.log("       " + message);
}

function mulPrecision(value) {
  return precisionUnits.mul(new BN(value));
}
