const TestToken = artifacts.require("Token.sol");
const KyberDaoContract = artifacts.require("MockKyberDaoMoreGetters.sol");
const StakingContract = artifacts.require("KyberStaking.sol");
const MockMaliciousKyberDao = artifacts.require("MockMaliciousKyberDao.sol");
const Helper = require("../helper.js");

const BN = web3.utils.BN;

const { precisionUnits, zeroAddress } = require("../helper.js");
const { expectEvent, expectRevert } = require('@openzeppelin/test-helpers');

let daoOperator;

let currentTimestamp;
let currentBlock;
let daoStartTime;

let epochPeriod = 20;
let startBlock;
let blockTime;
let kncToken;
let stakingContract;
let kyberDao;
let victor;
let loi;
let mike;
let poolMaster;
let poolMaster2;
let minCampPeriod = 10 * 16; // 160s - equivalent to 10 blocks
let defaultNetworkFee = 25;
let defaultRewardBps = 3000; // 30%
let defaultRebateBps = 2000; // 20%
let defaultBrrData = getDataFromRebateAndReward(defaultRebateBps, defaultRewardBps);
let minPercentageInPrecision = new BN(precisionUnits).div(new BN(5)); // 20%
// Y = C - t * X
// Example: X = 20%, C = 100%, t = 1
// Y = 100% - 1 * 20% = 80%
let cInPrecision = new BN(precisionUnits); // 100%
let tInPrecision = new BN(precisionUnits); // 1

let initVictorStake = mulPrecision(1500);
let initMikeStake = mulPrecision(2000);
let initLoiStake = mulPrecision(3000);
let initPoolMaster2Stake = mulPrecision(1000);

contract('KyberDao', function(accounts) {
  before("one time init", async() => {
    daoOperator = accounts[1];
    kncToken = await TestToken.new("Kyber Network Crystal", "KNC", 18);
    victor = accounts[2];
    loi = accounts[3];
    mike = accounts[4];
    daoOperator = accounts[5];
    poolMaster = accounts[6];
    poolMaster2 = accounts[7];

    await kncToken.transfer(victor, mulPrecision(1000000));
    await kncToken.transfer(mike, mulPrecision(1000000));
    await kncToken.transfer(loi, mulPrecision(1000000));
    await kncToken.transfer(poolMaster, mulPrecision(1000000));
    await kncToken.transfer(poolMaster2, mulPrecision(1000000));
  });

  const updateCurrentBlockAndTimestamp = async() => {
    currentBlock = await Helper.getCurrentBlock();
    currentTimestamp = await Helper.getCurrentBlockTime();
  }

  beforeEach("running before each test", async() => {
    await updateCurrentBlockAndTimestamp();
    console.log(`chain start block: ${currentBlock}, start time: ${currentTimestamp}`);
    blockTime = 16; // each block is mined after 16s
  });

  const blockToTimestamp = function(block) {
    return currentTimestamp + (block - currentBlock) * blockTime;
  };

  const blocksToSeconds = function(blocks) {
    return blocks * blockTime;
  };

  const submitNewCampaign = async(
    kyberDao,
    campaignType,
    startBlock,
    endBlock,
    minPercentageInPrecision,
    cInPrecision,
    tInPrecision,
    options,
    link,
    opt
  ) => {
    console.log(`new campaign: start: ${blockToTimestamp(startBlock)}, end: ${blockToTimestamp(endBlock)}`);
    return await kyberDao.submitNewCampaign(
      campaignType,
      blockToTimestamp(startBlock),
      blockToTimestamp(endBlock),
      minPercentageInPrecision,
      cInPrecision,
      tInPrecision,
      options,
      link,
      opt
    );
  };

  const submitNewCampaignAndDelayToStart = async(
    kyberDao,
    campaignType,
    startBlock,
    endBlock,
    minPercentageInPrecision,
    cInPrecision,
    tInPrecision,
    options,
    link,
    opt
  ) => {
    console.log(`new campaign: start: ${blockToTimestamp(startBlock)}, end: ${blockToTimestamp(endBlock)}`);
    await kyberDao.submitNewCampaign(
      campaignType,
      blockToTimestamp(startBlock),
      blockToTimestamp(endBlock),
      minPercentageInPrecision,
      cInPrecision,
      tInPrecision,
      options,
      link,
      opt
    );
    await Helper.mineNewBlockAt(blockToTimestamp(startBlock));
  };

  const deployContracts = async(_epochPeriod, _startBlock, _campPeriod) => {
    epochPeriod = _epochPeriod;
    startBlock = _startBlock;
    daoStartTime = blockToTimestamp(startBlock);
    console.log(`new dao contract: period: ${blocksToSeconds(epochPeriod)}, start: ${daoStartTime}`);
    minCampPeriod = _campPeriod;
    kyberDao = await KyberDaoContract.new(
      blocksToSeconds(epochPeriod),
      daoStartTime,
      kncToken.address,
      blocksToSeconds(minCampPeriod),
      defaultNetworkFee,
      defaultRewardBps,
      defaultRebateBps,
      daoOperator
    )
    stakingContract = await StakingContract.at(await kyberDao.staking());
  };

  const setupSimpleStakingData = async() => {
    // approve tokens
    await kncToken.approve(stakingContract.address, mulPrecision(1000000), {from: victor});
    await kncToken.approve(stakingContract.address, mulPrecision(1000000), {from: mike});
    await kncToken.approve(stakingContract.address, mulPrecision(1000000), {from: loi});
    await kncToken.approve(stakingContract.address, mulPrecision(1000000), {from: poolMaster});
    await kncToken.approve(stakingContract.address, mulPrecision(1000000), {from: poolMaster2});

    await stakingContract.deposit(initVictorStake, {from: victor});
    await stakingContract.deposit(initMikeStake, {from: mike});
    await stakingContract.deposit(initLoiStake, {from: loi});
    if (initPoolMaster2Stake > 0) {
      await stakingContract.deposit(initPoolMaster2Stake, {from: poolMaster2});
    }
  };

  const setupTokenWithSupply = async(supply) => {
    kncToken = await TestToken.new("test token", 'tst', 18, {from: accounts[0]});

    let totalSupply = await kncToken.totalSupply();
    let burnAmount = totalSupply.sub(new BN(supply));

    await kncToken.burn(burnAmount, {from: accounts[0]});

    Helper.assertEqual(supply, await kncToken.totalSupply(), "total supply is invalid");

    await kncToken.transfer(victor, supply.div(new BN(5)));
    await kncToken.transfer(mike, supply.div(new BN(5)));
    await kncToken.transfer(loi, supply.div(new BN(5)));
    await kncToken.transfer(poolMaster, supply.div(new BN(5)));
    await kncToken.transfer(poolMaster2, supply.div(new BN(5)));
  }

  const resetSetupForKNCToken = async() => {
    kncToken = await TestToken.new("test token", 'tst', 18, {from: accounts[0]});
    await kncToken.transfer(victor, mulPrecision(1000000));
    await kncToken.transfer(mike, mulPrecision(1000000));
    await kncToken.transfer(loi, mulPrecision(1000000));
    await kncToken.transfer(poolMaster, mulPrecision(1000000));
    await kncToken.transfer(poolMaster2, mulPrecision(1000000));
  }

  const simpleSetupToTestThreshold = async(mikeStake, victorStake, loiStake, percentage) => {
    initMikeStake = mulPrecision(mikeStake);
    initVictorStake = mulPrecision(victorStake);
    initLoiStake = mulPrecision(loiStake);
    initPoolMaster2Stake = new BN(0);

    let totalSupply = (new BN(0)).add(initMikeStake).add(initVictorStake).add(initLoiStake);
    totalSupply = totalSupply.mul(new BN(100)).div(new BN(percentage)); // total stake = percentage% total supply
    kncToken = await TestToken.new("test token", 'tst', 18, {from: accounts[0]});

    let burnAmount = (await kncToken.totalSupply()).sub(new BN(totalSupply));
    await kncToken.burn(burnAmount, {from: accounts[0]});

    await kncToken.transfer(mike, initMikeStake);
    await kncToken.transfer(victor, initVictorStake);
    await kncToken.transfer(loi, initLoiStake);

    await updateCurrentBlockAndTimestamp();
    await deployContracts(20, currentBlock + 20, 8);
    await setupSimpleStakingData();

    await Helper.mineNewBlockAt(daoStartTime);
  }

  const checkLatestBrrData = async(reward, rebate, burn, epoch, expiryTime) => {
	let latestBrrData = await kyberDao.getLatestBRRDataWithCache.call();
	Helper.assertEqual(reward, latestBrrData.rewardInBps);
	Helper.assertEqual(rebate, latestBrrData.rebateInBps);
	Helper.assertEqual(burn, latestBrrData.burnInBps);
	Helper.assertEqual(epoch, latestBrrData.epoch);
	Helper.assertEqual(expiryTime, latestBrrData.expiryTimestamp);
	await kyberDao.getLatestBRRDataWithCache();
  }

  const checkLatestNetworkFeeData = async(networkFee, expiryTime) => {
	let result = await kyberDao.getLatestNetworkFeeDataWithCache.call();
	Helper.assertEqual(networkFee, result.feeInBps);
	Helper.assertEqual(expiryTime, result.expiryTimestamp);
	await kyberDao.getLatestNetworkFeeDataWithCache()
  }

  describe("#Handle Withdrawal tests", () => {
    it("Test handle withdrawal update correct points and vote count - no delegation", async function() {
      await deployContracts(20, currentBlock + 20, 10);
      await setupSimpleStakingData();

      await Helper.mineNewBlockAt(daoStartTime);

      let link = web3.utils.fromAscii("https://kyberswap.com");
      await updateCurrentBlockAndTimestamp();
      await submitNewCampaign(kyberDao,
        0,
        currentBlock + 3,
        currentBlock + 3 + minCampPeriod,
        minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3, 4], link, {from: daoOperator}
      );
      await Helper.mineNewBlockAt(
        blockToTimestamp(currentBlock + 3)
      );

      // withdraw when no votes
      let totalPoints = new BN(0);
      Helper.assertEqual(totalPoints, await kyberDao.getTotalEpochPoints(1), "points should be correct");
      await stakingContract.withdraw(mulPrecision(10), {from: victor});
      Helper.assertEqual(totalPoints, await kyberDao.getTotalEpochPoints(1), "points should be correct");

      await kyberDao.vote(1, 1, {from: victor});

      totalPoints.iadd(initVictorStake).isub(mulPrecision(10));
      let voteCount1 = new BN(0);
      voteCount1.iadd(initVictorStake).isub(mulPrecision(10));

      Helper.assertEqual(totalPoints, await kyberDao.getTotalEpochPoints(1), "points should be correct");

      let voteData = await kyberDao.getCampaignVoteCountData(1);
      Helper.assertEqual(voteData.totalVoteCount, totalPoints, "total camp votes is incorrect");
      Helper.assertEqual(voteData.voteCounts[0], voteCount1, "option voted count is incorrect");
      Helper.assertEqual(voteData.voteCounts[1], 0, "option voted count is incorrect");

      await stakingContract.withdraw(mulPrecision(100), {from: victor});

      totalPoints.isub(mulPrecision(100));
      voteCount1.isub(mulPrecision(100));

      Helper.assertEqual(totalPoints, await kyberDao.getTotalEpochPoints(1), "points should be correct");

      voteData = await kyberDao.getCampaignVoteCountData(1);
      Helper.assertEqual(voteData.totalVoteCount, totalPoints, "total camp votes is incorrect");
      Helper.assertEqual(voteData.voteCounts[0], voteCount1, "option voted count is incorrect");
      Helper.assertEqual(voteData.voteCounts[1], 0, "option voted count is incorrect");

      await stakingContract.withdraw(mulPrecision(100), {from: mike});

      Helper.assertEqual(totalPoints, await kyberDao.getTotalEpochPoints(1), "points should be correct");

      voteData = await kyberDao.getCampaignVoteCountData(1);
      Helper.assertEqual(voteData.totalVoteCount, totalPoints, "total camp votes is incorrect");
      Helper.assertEqual(voteData.voteCounts[0], voteCount1, "option voted count is incorrect");
      Helper.assertEqual(voteData.voteCounts[1], 0, "option voted count is incorrect");

      await kyberDao.vote(1, 2, {from: mike});
      totalPoints.iadd(initMikeStake).isub(mulPrecision(100));
      let voteCount2 = initMikeStake.sub(mulPrecision(100));

      Helper.assertEqual(totalPoints, await kyberDao.getTotalEpochPoints(1), "points should be correct");

      voteData = await kyberDao.getCampaignVoteCountData(1);
      Helper.assertEqual(voteData.totalVoteCount, totalPoints, "total camp votes is incorrect");
      Helper.assertEqual(voteData.voteCounts[0], voteCount1, "option voted count is incorrect");
      Helper.assertEqual(voteData.voteCounts[1], voteCount2, "option voted count is incorrect");
      Helper.assertEqual(voteData.voteCounts[2], 0, "option voted count is incorrect");

      await stakingContract.withdraw(mulPrecision(100), {from: mike});
      totalPoints.isub(mulPrecision(100));
      voteCount2.isub(mulPrecision(100));

      Helper.assertEqual(totalPoints, await kyberDao.getTotalEpochPoints(1), "points should be correct");

      voteData = await kyberDao.getCampaignVoteCountData(1);
      Helper.assertEqual(voteData.totalVoteCount, totalPoints, "total camp votes is incorrect");
      Helper.assertEqual(voteData.voteCounts[0], voteCount1, "option voted count is incorrect");
      Helper.assertEqual(voteData.voteCounts[1], voteCount2, "option voted count is incorrect");
      Helper.assertEqual(voteData.voteCounts[2], 0, "option voted count is incorrect");

      await stakingContract.deposit(mulPrecision(200), {from: victor});

      Helper.assertEqual(totalPoints, await kyberDao.getTotalEpochPoints(1), "points should be correct");

      voteData = await kyberDao.getCampaignVoteCountData(1);
      Helper.assertEqual(voteData.totalVoteCount, totalPoints, "total camp votes is incorrect");
      Helper.assertEqual(voteData.voteCounts[0], voteCount1, "option voted count is incorrect");
      Helper.assertEqual(voteData.voteCounts[1], voteCount2, "option voted count is incorrect");
      Helper.assertEqual(voteData.voteCounts[2], 0, "option voted count is incorrect");

      // less than new deposit (200)
      await stakingContract.withdraw(mulPrecision(100), {from: victor});

      Helper.assertEqual(totalPoints, await kyberDao.getTotalEpochPoints(1), "points should be correct");

      voteData = await kyberDao.getCampaignVoteCountData(1);
      Helper.assertEqual(voteData.totalVoteCount, totalPoints, "total camp votes is incorrect");
      Helper.assertEqual(voteData.voteCounts[0], voteCount1, "option voted count is incorrect");
      Helper.assertEqual(voteData.voteCounts[1], voteCount2, "option voted count is incorrect");
      Helper.assertEqual(voteData.voteCounts[2], 0, "option voted count is incorrect");

      // total withdraw is 400 more than new deposit (200)
      await stakingContract.withdraw(mulPrecision(300), {from: victor});

      totalPoints.isub(mulPrecision(200));
      voteCount1.isub(mulPrecision(200));
      Helper.assertEqual(totalPoints, await kyberDao.getTotalEpochPoints(1), "points should be correct");

      voteData = await kyberDao.getCampaignVoteCountData(1);
      Helper.assertEqual(voteData.totalVoteCount, totalPoints, "total camp votes is incorrect");
      Helper.assertEqual(voteData.voteCounts[0], voteCount1, "option voted count is incorrect");
      Helper.assertEqual(voteData.voteCounts[1], voteCount2, "option voted count is incorrect");
      Helper.assertEqual(voteData.voteCounts[2], 0, "option voted count is incorrect");

      // change vote of victor from 1 to 2, make sure vote counts change correctly after withdraw
      await kyberDao.vote(1, 2, {from: victor});
      voteCount2.iadd(voteCount1);
      voteCount1 = new BN(0);

      Helper.assertEqual(totalPoints, await kyberDao.getTotalEpochPoints(1), "points should be correct");

      voteData = await kyberDao.getCampaignVoteCountData(1);
      Helper.assertEqual(voteData.totalVoteCount, totalPoints, "total camp votes is incorrect");
      Helper.assertEqual(voteData.voteCounts[0], voteCount1, "option voted count is incorrect");
      Helper.assertEqual(voteData.voteCounts[1], voteCount2, "option voted count is incorrect");
      Helper.assertEqual(voteData.voteCounts[2], 0, "option voted count is incorrect");

      await stakingContract.withdraw(mulPrecision(100), {from: victor});

      totalPoints.isub(mulPrecision(100));
      voteCount2.isub(mulPrecision(100));

      Helper.assertEqual(totalPoints, await kyberDao.getTotalEpochPoints(1), "points should be correct");

      voteData = await kyberDao.getCampaignVoteCountData(1);
      Helper.assertEqual(voteData.totalVoteCount, totalPoints, "total camp votes is incorrect");
      Helper.assertEqual(voteData.voteCounts[0], voteCount1, "option voted count is incorrect");
      Helper.assertEqual(voteData.voteCounts[1], voteCount2, "option voted count is incorrect");
      Helper.assertEqual(voteData.voteCounts[2], 0, "option voted count is incorrect");
    });

    it("Test handle withdrawal updates correct points with multiple voted campaigns - no delegation", async function() {
      await deployContracts(100, currentBlock + 20, 10);
      await setupSimpleStakingData();

      await Helper.mineNewBlockAt(daoStartTime);

      let link = web3.utils.fromAscii("https://kyberswap.com");
      await updateCurrentBlockAndTimestamp();
      let options = [1,2,3,4]
      let txResult = await submitNewCampaign(kyberDao,
        0, currentBlock + 2, currentBlock + 2 + minCampPeriod,
        minPercentageInPrecision, cInPrecision, tInPrecision, options, link, {from: daoOperator}
      );
      expectEvent(txResult, 'NewCampaignCreated', {
        campaignType: new BN(0),
        campaignID: new BN(1),
        startTimestamp: new BN(blockToTimestamp(currentBlock + 2)),
        endTimestamp: new BN(blockToTimestamp(currentBlock + 2 + minCampPeriod)),
        minPercentageInPrecision: new BN(minPercentageInPrecision),
        cInPrecision: new BN(cInPrecision),
        tInPrecision: new BN(tInPrecision),
        link: link
      });
      let eventLogs;
      for (let i = 0; i < txResult.logs.length; i++) {
          if (txResult.logs[i].event == 'NewCampaignCreated') {
              eventLogs = txResult.logs[i];
              break;
          }
      }
      Helper.assertEqualArray(eventLogs.args.options, options);

      await Helper.setNextBlockTimestamp(blockToTimestamp(currentBlock + 2));
      // vote for first campaign
      await kyberDao.vote(1, 1, {from: victor});

      // check total points
      let totalEpochPoints = (new BN(0)).add(initVictorStake);
      let totalCampPoint1 = (new BN(0)).add(initVictorStake);
      let voteCount11 = (new BN(0)).add(initVictorStake);
      // check pts and vote counts
      Helper.assertEqual(totalEpochPoints, await kyberDao.getTotalEpochPoints(1), "points should be correct");
      let voteData = await kyberDao.getCampaignVoteCountData(1);
      Helper.assertEqual(voteData.totalVoteCount, totalCampPoint1, "total camp votes is incorrect");
      Helper.assertEqual(voteData.voteCounts[0], voteCount11, "option voted count is incorrect");

      await updateCurrentBlockAndTimestamp();
      txResult = await submitNewCampaign(kyberDao,
        1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
        minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3, 4], link, {from: daoOperator}
      );
      expectEvent(txResult, 'NewCampaignCreated', {
        campaignType: new BN(1),
        campaignID: new BN(2),
        startTimestamp: new BN(blockToTimestamp(currentBlock + 2)),
        endTimestamp: new BN(blockToTimestamp(currentBlock + 2 + minCampPeriod)),
        minPercentageInPrecision: minPercentageInPrecision,
        cInPrecision: cInPrecision,
        tInPrecision: tInPrecision,
        link: link
      });

      // delay to start time of camp
      await Helper.setNextBlockTimestamp(blockToTimestamp(currentBlock + 2));
      // vote for second campaign
      await kyberDao.vote(2, 2, {from: victor});

      totalEpochPoints.iadd(initVictorStake);
      let totalCampPoint2 = (new BN(0)).add(initVictorStake);
      let voteCount22 = (new BN(0)).add(initVictorStake);

      // check pts and vote counts
      Helper.assertEqual(totalEpochPoints, await kyberDao.getTotalEpochPoints(1), "points should be correct");
      voteData = await kyberDao.getCampaignVoteCountData(1);
      Helper.assertEqual(voteData.totalVoteCount, totalCampPoint1, "total camp votes is incorrect");
      Helper.assertEqual(voteData.voteCounts[0], voteCount11, "option voted count is incorrect");
      voteData = await kyberDao.getCampaignVoteCountData(2);
      Helper.assertEqual(voteData.totalVoteCount, totalCampPoint2, "total camp votes is incorrect");
      Helper.assertEqual(voteData.voteCounts[1], voteCount22, "option voted count is incorrect");

      await stakingContract.withdraw(mulPrecision(100), {from: victor});
      // update points and vote counts
      totalEpochPoints.isub(mulPrecision(100 * 2));
      totalCampPoint1.isub(mulPrecision(100));
      voteCount11.isub(mulPrecision(100));
      totalCampPoint2.isub(mulPrecision(100));
      voteCount22.isub(mulPrecision(100));

      // check pts and vote counts
      Helper.assertEqual(totalEpochPoints, await kyberDao.getTotalEpochPoints(1), "points should be correct");
      voteData = await kyberDao.getCampaignVoteCountData(1);
      Helper.assertEqual(voteData.totalVoteCount, totalCampPoint1, "total camp votes is incorrect");
      Helper.assertEqual(voteData.voteCounts[0], voteCount11, "option voted count is incorrect");
      voteData = await kyberDao.getCampaignVoteCountData(2);
      Helper.assertEqual(voteData.totalVoteCount, totalCampPoint2, "total camp votes is incorrect");
      Helper.assertEqual(voteData.voteCounts[1], voteCount22, "option voted count is incorrect");

      await kyberDao.vote(1, 2, {from: victor});
      // check pts and vote counts
      Helper.assertEqual(totalEpochPoints, await kyberDao.getTotalEpochPoints(1), "points should be correct");
      voteData = await kyberDao.getCampaignVoteCountData(1);
      Helper.assertEqual(voteData.totalVoteCount, totalCampPoint1, "total camp votes is incorrect");
      Helper.assertEqual(voteData.voteCounts[1], voteCount11, "option voted count is incorrect");
      voteData = await kyberDao.getCampaignVoteCountData(2);
      Helper.assertEqual(voteData.totalVoteCount, totalCampPoint2, "total camp votes is incorrect");
      Helper.assertEqual(voteData.voteCounts[1], voteCount22, "option voted count is incorrect");

      // delay to end of campaign 1
      let data = await kyberDao.getCampaignDetails(1);
      await Helper.mineNewBlockAt(data.endTimestamp * 1);

      // withdraw should change epoch points, but only camp2 vote data
      await stakingContract.withdraw(mulPrecision(100), {from: victor});
      // update points and vote counts, only campaign 2 voted counts are updated
      totalEpochPoints.isub(mulPrecision(100 * 2));
      totalCampPoint2.isub(mulPrecision(100));
      voteCount22.isub(mulPrecision(100));
      // check pts and vote counts
      Helper.assertEqual(totalEpochPoints, await kyberDao.getTotalEpochPoints(1), "points should be correct");
      voteData = await kyberDao.getCampaignVoteCountData(1);
      Helper.assertEqual(voteData.totalVoteCount, totalCampPoint1, "total camp votes is incorrect");
      Helper.assertEqual(voteData.voteCounts[1], voteCount11, "option voted count is incorrect");
      voteData = await kyberDao.getCampaignVoteCountData(2);
      Helper.assertEqual(voteData.totalVoteCount, totalCampPoint2, "total camp votes is incorrect");
      Helper.assertEqual(voteData.voteCounts[1], voteCount22, "option voted count is incorrect");

      await updateCurrentBlockAndTimestamp();
      // create new campaign far from current block
      txResult = await submitNewCampaign(kyberDao,
        2, currentBlock + 20, currentBlock + 20 + minCampPeriod,
        minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3, 4], link, {from: daoOperator}
      );
      expectEvent(txResult, 'NewCampaignCreated', {
        campaignType: new BN(2),
        campaignID: new BN(3),
        startTimestamp: new BN(blockToTimestamp(currentBlock + 20)),
        endTimestamp: new BN(blockToTimestamp(currentBlock + 20 + minCampPeriod)),
        minPercentageInPrecision: minPercentageInPrecision,
        cInPrecision: cInPrecision,
        tInPrecision: tInPrecision,
        link: link
      });

      // withdraw should change epoch points, but only camp2 vote data
      await stakingContract.withdraw(mulPrecision(100), {from: victor});
      // update points and vote counts, only campaign 2 voted counts are updated
      totalEpochPoints.isub(mulPrecision(100 * 2));
      totalCampPoint2.isub(mulPrecision(100));
      voteCount22.isub(mulPrecision(100));
      // check pts and vote counts
      Helper.assertEqual(totalEpochPoints, await kyberDao.getTotalEpochPoints(1), "points should be correct");
      voteData = await kyberDao.getCampaignVoteCountData(1);
      Helper.assertEqual(voteData.totalVoteCount, totalCampPoint1, "total camp votes is incorrect");
      Helper.assertEqual(voteData.voteCounts[1], voteCount11, "option voted count is incorrect");
      voteData = await kyberDao.getCampaignVoteCountData(2);
      Helper.assertEqual(voteData.totalVoteCount, totalCampPoint2, "total camp votes is incorrect");
      Helper.assertEqual(voteData.voteCounts[1], voteCount22, "option voted count is incorrect");
      // data for camp 3 should be 0
      voteData = await kyberDao.getCampaignVoteCountData(3);
      Helper.assertEqual(voteData.totalVoteCount, 0, "total camp votes is incorrect");
    });

    it("Test handle withdrawal updates correct data after withdraw - with delegation", async function() {
      await deployContracts(50, currentBlock + 20, 20);
      await setupSimpleStakingData();
      await stakingContract.delegate(mike, {from: victor});
      await stakingContract.delegate(victor, {from: loi});

      await Helper.mineNewBlockAt(daoStartTime);

      let link = web3.utils.fromAscii("https://kyberswap.com");
      await updateCurrentBlockAndTimestamp();
      await submitNewCampaignAndDelayToStart(kyberDao,
        0, currentBlock + 2, currentBlock + 2 + minCampPeriod,
        minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3, 4], link, {from: daoOperator}
      );
      // vote for first campaign
      await kyberDao.vote(1, 1, {from: mike});

      // check total points
      let totalEpochPoints = (new BN(0)).add(initVictorStake).add(initMikeStake);
      let totalCampPoint1 = (new BN(0)).add(initVictorStake).add(initMikeStake);
      let voteCount11 = (new BN(0)).add(initVictorStake).add(initMikeStake);

      // check pts and vote counts
      Helper.assertEqual(totalEpochPoints, await kyberDao.getTotalEpochPoints(1), "points should be correct");
      let voteData = await kyberDao.getCampaignVoteCountData(1);
      Helper.assertEqual(voteData.totalVoteCount, totalCampPoint1, "total camp votes is incorrect");
      Helper.assertEqual(voteData.voteCounts[0], voteCount11, "option voted count is incorrect");

      let victorWithdrewAmt = mulPrecision(100);
      await stakingContract.withdraw(victorWithdrewAmt, {from: victor});

      totalEpochPoints.isub(victorWithdrewAmt);
      totalCampPoint1.isub(victorWithdrewAmt);
      voteCount11.isub(victorWithdrewAmt);

      // check pts and vote counts
      Helper.assertEqual(totalEpochPoints, await kyberDao.getTotalEpochPoints(1), "points should be correct");
      voteData = await kyberDao.getCampaignVoteCountData(1);
      Helper.assertEqual(voteData.totalVoteCount, totalCampPoint1, "total camp votes is incorrect");
      Helper.assertEqual(voteData.voteCounts[0], voteCount11, "option voted count is incorrect");

      // withdraw from staker with no votes
      await stakingContract.withdraw(mulPrecision(10), {from: loi});
      // check pts and vote counts
      Helper.assertEqual(totalEpochPoints, await kyberDao.getTotalEpochPoints(1), "points should be correct");
      voteData = await kyberDao.getCampaignVoteCountData(1);
      Helper.assertEqual(voteData.totalVoteCount, totalCampPoint1, "total camp votes is incorrect");
      Helper.assertEqual(voteData.voteCounts[0], voteCount11, "option voted count is incorrect");

      await kyberDao.vote(1, 2, {from: victor});
      // note: Loi already withdraw 10 knc
      totalEpochPoints.iadd(initLoiStake).isub(mulPrecision(10));
      totalCampPoint1.iadd(initLoiStake).isub(mulPrecision(10));
      let voteCount12 = (new BN(0)).add(initLoiStake).isub(mulPrecision(10));

      // check pts and vote counts
      Helper.assertEqual(totalEpochPoints, await kyberDao.getTotalEpochPoints(1), "points should be correct");
      voteData = await kyberDao.getCampaignVoteCountData(1);
      Helper.assertEqual(voteData.totalVoteCount, totalCampPoint1, "total camp votes is incorrect");
      Helper.assertEqual(voteData.voteCounts[0], voteCount11, "option voted count is incorrect");
      Helper.assertEqual(voteData.voteCounts[1], voteCount12, "option voted count is incorrect");

      await kyberDao.vote(1, 3, {from: loi});
      // check pts and vote counts, nothing should be changed
      Helper.assertEqual(totalEpochPoints, await kyberDao.getTotalEpochPoints(1), "points should be correct");
      voteData = await kyberDao.getCampaignVoteCountData(1);
      Helper.assertEqual(voteData.totalVoteCount, totalCampPoint1, "total camp votes is incorrect");
      Helper.assertEqual(voteData.voteCounts[0], voteCount11, "option voted count is incorrect");
      Helper.assertEqual(voteData.voteCounts[1], voteCount12, "option voted count is incorrect");

      await stakingContract.delegate(loi, {from: victor});

      // check pts and vote counts, nothing should be changed
      Helper.assertEqual(totalEpochPoints, await kyberDao.getTotalEpochPoints(1), "points should be correct");
      voteData = await kyberDao.getCampaignVoteCountData(1);
      Helper.assertEqual(voteData.totalVoteCount, totalCampPoint1, "total camp votes is incorrect");
      Helper.assertEqual(voteData.voteCounts[0], voteCount11, "option voted count is incorrect");
      Helper.assertEqual(voteData.voteCounts[1], voteCount12, "option voted count is incorrect");

      await updateCurrentBlockAndTimestamp();
      await submitNewCampaignAndDelayToStart(kyberDao,
        0, currentBlock + 2, currentBlock + 2 + minCampPeriod,
        minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3, 4], link, {from: daoOperator}
      );

      await kyberDao.vote(2, 1, {from: mike});
      totalEpochPoints.iadd(initMikeStake).iadd(initVictorStake).isub(victorWithdrewAmt);
      let totalCampPoint2 = (new BN(0)).add(initMikeStake).add(initVictorStake).sub(victorWithdrewAmt);
      let voteCount21 = (new BN(0)).add(initMikeStake).add(initVictorStake).sub(victorWithdrewAmt);

      // check pts and vote counts
      Helper.assertEqual(totalEpochPoints, await kyberDao.getTotalEpochPoints(1), "points should be correct");
      voteData = await kyberDao.getCampaignVoteCountData(1);
      Helper.assertEqual(voteData.totalVoteCount, totalCampPoint1, "total camp votes is incorrect");
      Helper.assertEqual(voteData.voteCounts[0], voteCount11, "option voted count is incorrect");
      Helper.assertEqual(voteData.voteCounts[1], voteCount12, "option voted count is incorrect");
      voteData = await kyberDao.getCampaignVoteCountData(2);
      Helper.assertEqual(voteData.totalVoteCount, totalCampPoint2, "total camp votes is incorrect");
      Helper.assertEqual(voteData.voteCounts[0], voteCount21, "option voted count is incorrect");

      await stakingContract.withdraw(mulPrecision(200), {from: victor});
      victorWithdrewAmt.iadd(mulPrecision(200));

      // change data for vote of mike, not for vote of victor as delegated to mike already
      totalEpochPoints.isub(mulPrecision(200 * 2));
      totalCampPoint1.isub(mulPrecision(200));
      voteCount11.isub(mulPrecision(200));
      totalCampPoint2.isub(mulPrecision(200));
      voteCount21.isub(mulPrecision(200));

      // check pts and vote counts
      Helper.assertEqual(totalEpochPoints, await kyberDao.getTotalEpochPoints(1), "points should be correct");
      voteData = await kyberDao.getCampaignVoteCountData(1);
      Helper.assertEqual(voteData.totalVoteCount, totalCampPoint1, "total camp votes is incorrect");
      Helper.assertEqual(voteData.voteCounts[0], voteCount11, "option voted count is incorrect");
      Helper.assertEqual(voteData.voteCounts[1], voteCount12, "option voted count is incorrect");
      voteData = await kyberDao.getCampaignVoteCountData(2);
      Helper.assertEqual(voteData.totalVoteCount, totalCampPoint2, "total camp votes is incorrect");
      Helper.assertEqual(voteData.voteCounts[0], voteCount21, "option voted count is incorrect");

      // delay to end of campaign 1
      let data = await kyberDao.getCampaignDetails(1);
      await Helper.mineNewBlockAt(data.endTimestamp * 1);

      await stakingContract.withdraw(mulPrecision(100), {from: victor});

      // campaign 1 is ended, so data for camp 1 shouldn't be changed
      totalEpochPoints.isub(mulPrecision(100 * 2));
      totalCampPoint2.isub(mulPrecision(100));
      voteCount21.isub(mulPrecision(100));

      Helper.assertEqual(totalEpochPoints, await kyberDao.getTotalEpochPoints(1), "points should be correct");
      voteData = await kyberDao.getCampaignVoteCountData(1);
      Helper.assertEqual(voteData.totalVoteCount, totalCampPoint1, "total camp votes is incorrect");
      Helper.assertEqual(voteData.voteCounts[0], voteCount11, "option voted count is incorrect");
      Helper.assertEqual(voteData.voteCounts[1], voteCount12, "option voted count is incorrect");
      voteData = await kyberDao.getCampaignVoteCountData(2);
      Helper.assertEqual(voteData.totalVoteCount, totalCampPoint2, "total camp votes is incorrect");
      Helper.assertEqual(voteData.voteCounts[0], voteCount21, "option voted count is incorrect");
    });

    it("Test handle withdrawal should revert when sender is not staking", async function() {
      kyberDao = await KyberDaoContract.new(
        10, blockToTimestamp(currentBlock + 10),
        kncToken.address, minCampPeriod,
        defaultNetworkFee, defaultRewardBps, defaultRebateBps,
        daoOperator
      );

      await expectRevert(
        kyberDao.handleWithdrawal(victor, 0, {from: victor}),
        "only staking contract"
      );
      await expectRevert(
        kyberDao.handleWithdrawal(victor, mulPrecision(10), {from: daoOperator}),
        "only staking contract"
      );
    });
  });

  describe("#Submit Campaign tests", () => {
    it("Test submit campaign returns correct data after created", async function() {
      await deployContracts(10, currentBlock + 30, 10);

      Helper.assertEqual(0, await kyberDao.networkFeeCampaigns(0), "shouldn't have network fee camp");
      Helper.assertEqual(0, await kyberDao.brrCampaigns(0), "shouldn't have brr camp");

      let totalSupply = await kncToken.INITIAL_SUPPLY();

      let gasUsed = new BN(0);
      for(let id = 0; id <= 2; id++) {
        Helper.assertEqual(false, await kyberDao.campaignExists(id + 1), "campaign shouldn't be existed");
        let link = web3.utils.fromAscii(id == 0 ? "" : "some_link");
        let tx = await submitNewCampaign(kyberDao,
          id, currentBlock + 2 * id + 5, currentBlock + 2 * id + 5 + minCampPeriod,
          minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3, 4], link, {from: daoOperator}
        );
        gasUsed.iadd(new BN(tx.receipt.gasUsed));
        Helper.assertEqual(id + 1, await kyberDao.numberCampaigns(), "number campaign is incorrect");
        Helper.assertEqual(true, await kyberDao.campaignExists(id + 1), "campaign should be existed");

        let data = await kyberDao.getCampaignDetails(id + 1);
        Helper.assertEqual(id, data.campaignType, "campaignType is incorrect");
        Helper.assertEqual(blockToTimestamp(currentBlock + 2 * id + 5), data.startTimestamp, "start time is incorrect");
        Helper.assertEqual(blockToTimestamp(currentBlock + 2 * id + 5 + minCampPeriod), data.endTimestamp, "end time is incorrect");
        Helper.assertEqual(totalSupply, data.totalKNCSupply, "total supply is incorrect");
        Helper.assertEqual(minPercentageInPrecision, data.minPercentageInPrecision, "formulaParamsData is incorrect");
        Helper.assertEqual(cInPrecision, data.cInPrecision, "formulaParamsData is incorrect");
        Helper.assertEqual(tInPrecision, data.tInPrecision, "formulaParamsData is incorrect");
        Helper.assertEqual(link, data.link.toString(), "link is incorrect");
        Helper.assertEqual(4, data.options.length, "number options is incorrect");
        Helper.assertEqual(1, data.options[0], "option value is incorrect");
        Helper.assertEqual(2, data.options[1], "option value is incorrect");
        Helper.assertEqual(3, data.options[2], "option value is incorrect");
        Helper.assertEqual(4, data.options[3], "option value is incorrect");

        let voteData = await kyberDao.getCampaignVoteCountData(id + 1);
        Helper.assertEqual(4, voteData.voteCounts.length, "number options is incorrect");
        Helper.assertEqual(0, voteData.voteCounts[0], "option voted point is incorrect");
        Helper.assertEqual(0, voteData.voteCounts[1], "option voted point is incorrect");
        Helper.assertEqual(0, voteData.voteCounts[2], "option voted point is incorrect");
        Helper.assertEqual(0, voteData.voteCounts[3], "option voted point is incorrect");
        Helper.assertEqual(0, voteData.totalVoteCount, "total voted points is incorrect");

        let listCamps = await kyberDao.getListCampaignIDs(0);
        Helper.assertEqual(id + 1, listCamps.length, "number camps is incorrect");

        // burn KNC to reduce total supply value
        await kncToken.burn(mulPrecision(1000000));
        totalSupply.isub(mulPrecision(1000000));
      }

      logInfo("Submit Campaign: Average gas used for submit new campaign: " + gasUsed.div(new BN(3)).toString(10));

      Helper.assertEqual(2, await kyberDao.networkFeeCampaigns(0), "should have network fee camp");
      Helper.assertEqual(3, await kyberDao.brrCampaigns(0), "should have brr camp");

      let listCamps = await kyberDao.getListCampaignIDs(0);
      Helper.assertEqual(3, listCamps.length, "number camps is incorrect");
      Helper.assertEqual(1, listCamps[0], "camp id is incorrect");
      Helper.assertEqual(2, listCamps[1], "camp id is incorrect");
      Helper.assertEqual(3, listCamps[2], "camp id is incorrect");
    });

    it("Test submit campaign recored correctly network fee camp for different epoch", async function() {
      await deployContracts(15, currentBlock + 20, 3);

      let link = web3.utils.fromAscii("https://kyberswap.com");

      await updateCurrentBlockAndTimestamp();
      await submitNewCampaign(kyberDao,
        1, currentBlock + 9, currentBlock + 9 + minCampPeriod,
        minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3, 4], link, {from: daoOperator}
      );

      Helper.assertEqual(1, await kyberDao.networkFeeCampaigns(0), "should have network fee camp");
      Helper.assertEqual(0, await kyberDao.networkFeeCampaigns(1), "shouldn't have network fee camp");

      await submitNewCampaign(kyberDao,
        0, currentBlock + 9, currentBlock + 9 + minCampPeriod,
        minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3, 4], link, {from: daoOperator}
      );

      await submitNewCampaign(kyberDao,
        2, currentBlock + 9, currentBlock + 9 + minCampPeriod,
        minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3, 4], link, {from: daoOperator}
      );

      await Helper.mineNewBlockAt(daoStartTime);

      await updateCurrentBlockAndTimestamp();
      await submitNewCampaign(kyberDao,
        0, currentBlock + 6, currentBlock + 6 + minCampPeriod,
        minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3, 4], link, {from: daoOperator}
      );
      await submitNewCampaign(kyberDao,
        1, currentBlock + 6, currentBlock + 6 + minCampPeriod,
        minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3, 4], link, {from: daoOperator}
      );
      Helper.assertEqual(1, await kyberDao.networkFeeCampaigns(0), "should have network fee camp");
      Helper.assertEqual(5, await kyberDao.networkFeeCampaigns(1), "should have network fee camp");

      await kyberDao.cancelCampaign(5, {from: daoOperator});
      Helper.assertEqual(1, await kyberDao.networkFeeCampaigns(0), "should have network fee camp");
      Helper.assertEqual(0, await kyberDao.networkFeeCampaigns(1), "shouldn't have network fee camp");

      // delay to epoch 3
      await Helper.mineNewBlockAt(daoStartTime + blocksToSeconds(2 * epochPeriod));

      Helper.assertEqual(0, await kyberDao.networkFeeCampaigns(3), "shouldn't have network fee camp");
      Helper.assertEqual(0, await kyberDao.networkFeeCampaigns(2), "shouldn't have network fee camp");

      await updateCurrentBlockAndTimestamp();
      await submitNewCampaign(kyberDao,
        1, currentBlock + 6, currentBlock + 6 + minCampPeriod,
        minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3, 4], link, {from: daoOperator}
      );
      Helper.assertEqual(0, await kyberDao.networkFeeCampaigns(2), "shouldn't have network fee camp");
      Helper.assertEqual(6, await kyberDao.networkFeeCampaigns(3), "should have network fee camp");
    });

    it("Test submit campaign network fee campaign changed correctly after cancel and created new one", async function() {
      await deployContracts(50, currentBlock + 3, 10);

      // delay to epoch 1
      await Helper.mineNewBlockAfter(blocksToSeconds(3));

      Helper.assertEqual(0, await kyberDao.networkFeeCampaigns(1), "shouldn't have network fee camp");

      await updateCurrentBlockAndTimestamp();

      let link = web3.utils.fromAscii("https://kyberswap.com");

      let tx = await submitNewCampaign(kyberDao,
        1, currentBlock + 10, currentBlock + 10 + minCampPeriod,
        minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3, 4], link, {from: daoOperator}
      );
      logInfo("Submit Campaign: First time create network fee camp, gas used: " + tx.receipt.gasUsed);
      Helper.assertEqual(1, await kyberDao.networkFeeCampaigns(1), "should have network fee camp");

      let txResult = await kyberDao.cancelCampaign(1, {from: daoOperator});
      expectEvent(txResult, 'CancelledCampaign', {
        campaignID: new BN(1)
      });

      Helper.assertEqual(0, await kyberDao.networkFeeCampaigns(1), "shouldn't have network fee camp");

      await submitNewCampaign(kyberDao,
        0, currentBlock + 10, currentBlock + 10 + minCampPeriod,
        minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3, 4], link, {from: daoOperator}
      );
      await submitNewCampaign(kyberDao,
        2, currentBlock + 10, currentBlock + 10 + minCampPeriod,
        minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3, 4], link, {from: daoOperator}
      );
      Helper.assertEqual(0, await kyberDao.networkFeeCampaigns(1), "shouldn't have network fee camp");

      tx = await submitNewCampaign(kyberDao,
        1, currentBlock + 10, currentBlock + 10 + minCampPeriod,
        minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3, 4], link, {from: daoOperator}
      );
      logInfo("Submit Campaign: Recreate network fee camp, gas used: " + tx.receipt.gasUsed);
      Helper.assertEqual(4, await kyberDao.networkFeeCampaigns(1), "should have network fee camp");
    });

    it("Test submit campaign brr campaign changed correctly after cancel and created new one", async function() {
      await deployContracts(50, currentBlock + 3, 10);

      // delay to epoch 1
      await Helper.mineNewBlockAfter(blocksToSeconds(3));

      Helper.assertEqual(0, await kyberDao.brrCampaigns(1), "shouldn't have brr camp");

      await updateCurrentBlockAndTimestamp();

      let link = web3.utils.fromAscii("https://kyberswap.com");

      let tx = await submitNewCampaign(kyberDao,
        2, currentBlock + 10, currentBlock + 10 + minCampPeriod,
        minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3, 4], link, {from: daoOperator}
      );
      logInfo("Submit Campaign: First time create brr camp, gas used: " + tx.receipt.gasUsed);
      Helper.assertEqual(1, await kyberDao.brrCampaigns(1), "should have brr camp");

      await kyberDao.cancelCampaign(1, {from: daoOperator});

      Helper.assertEqual(0, await kyberDao.brrCampaigns(1), "shouldn't have brr camp");

      await submitNewCampaign(kyberDao,
        0, currentBlock + 10, currentBlock + 10 + minCampPeriod,
        minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3, 4], link, {from: daoOperator}
      );
      await submitNewCampaign(kyberDao,
        1, currentBlock + 10, currentBlock + 10 + minCampPeriod,
        minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3, 4], link, {from: daoOperator}
      );
      Helper.assertEqual(0, await kyberDao.brrCampaigns(1), "shouldn't have brr camp");

      tx = await submitNewCampaign(kyberDao,
        2, currentBlock + 10, currentBlock + 10 + minCampPeriod,
        minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3, 4], link, {from: daoOperator}
      );
      logInfo("Submit Campaign: Recreate brr camp, gas used: " + tx.receipt.gasUsed);
      Helper.assertEqual(4, await kyberDao.brrCampaigns(1), "shouldn't have brr camp");
    });

    it("Test submit campaign recored correctly brr camp for different epoch", async function() {
      await deployContracts(15, currentBlock + 20, 3);

      let link = web3.utils.fromAscii("https://kyberswap.com");

      await updateCurrentBlockAndTimestamp();
      await submitNewCampaign(kyberDao,
        2, currentBlock + 9, currentBlock + 9 + minCampPeriod,
        minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3, 4], link, {from: daoOperator}
      );

      Helper.assertEqual(1, await kyberDao.brrCampaigns(0), "should have brr camp");
      Helper.assertEqual(0, await kyberDao.brrCampaigns(1), "shouldn't have brr camp");

      await submitNewCampaign(kyberDao,
        0, currentBlock + 9, currentBlock + 9 + minCampPeriod,
        minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3, 4], link, {from: daoOperator}
      );

      await submitNewCampaign(kyberDao,
        1, currentBlock + 9, currentBlock + 9 + minCampPeriod,
        minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3, 4], link, {from: daoOperator}
      );

      await Helper.mineNewBlockAt(daoStartTime);

      await updateCurrentBlockAndTimestamp();
      await submitNewCampaign(kyberDao,
        0, currentBlock + 6, currentBlock + 6 + minCampPeriod,
        minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3, 4], link, {from: daoOperator}
      );
      await submitNewCampaign(kyberDao,
        2, currentBlock + 6, currentBlock + 6 + minCampPeriod,
        minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3, 4], link, {from: daoOperator}
      );
      Helper.assertEqual(1, await kyberDao.brrCampaigns(0), "should have brr camp");
      Helper.assertEqual(5, await kyberDao.brrCampaigns(1), "should have brr camp");

      await kyberDao.cancelCampaign(5, {from: daoOperator});
      Helper.assertEqual(1, await kyberDao.brrCampaigns(0), "should have brr camp");
      Helper.assertEqual(0, await kyberDao.brrCampaigns(1), "shouldn't have brr camp");

      // deploy to epoch 3
      await Helper.mineNewBlockAt(blocksToSeconds(2 * epochPeriod) + daoStartTime);

      Helper.assertEqual(0, await kyberDao.brrCampaigns(2), "shouldn't have brr camp");
      Helper.assertEqual(0, await kyberDao.brrCampaigns(3), "shouldn't have brr camp");

      await updateCurrentBlockAndTimestamp();
      await submitNewCampaign(kyberDao,
        2, currentBlock + 6, currentBlock + 6 + minCampPeriod,
        minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3, 4], link, {from: daoOperator}
      );
      Helper.assertEqual(0, await kyberDao.brrCampaigns(2), "should have brr camp");
      Helper.assertEqual(6, await kyberDao.brrCampaigns(3), "shouldn't have brr camp");
    });

    it("Test submit new campaign for next epoch, data changes as expected", async function() {
      await deployContracts(20, currentBlock + 10, 5);

      let link = web3.utils.fromAscii("https://kyberswap.com");
      await submitNewCampaign(kyberDao,
        0, startBlock + 1, startBlock + 1 + minCampPeriod,
        minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3], link, {from: daoOperator}
      );

      // test recorded correct data
      let data = await kyberDao.getCampaignDetails(1);
      Helper.assertEqual(0, data.campaignType, "campaignType is incorrect");
      Helper.assertEqual(blockToTimestamp(startBlock + 1), data.startTimestamp, "start timestamp is incorrect");
      Helper.assertEqual(blockToTimestamp(startBlock + 1 + minCampPeriod), data.endTimestamp, "end timestamp is incorrect");
      Helper.assertEqual(await kncToken.totalSupply(), data.totalKNCSupply, "total supply is incorrect");
      Helper.assertEqual(minPercentageInPrecision, data.minPercentageInPrecision, "minPercentage is incorrect");
      Helper.assertEqual(cInPrecision, data.cInPrecision, "c is incorrect");
      Helper.assertEqual(tInPrecision, data.tInPrecision, "t is incorrect");
      Helper.assertEqual(link, data.link.toString(), "link is incorrect");
      Helper.assertEqual(3, data.options.length, "number options is incorrect");
      Helper.assertEqual(1, data.options[0], "option value is incorrect");
      Helper.assertEqual(2, data.options[1], "option value is incorrect");
      Helper.assertEqual(3, data.options[2], "option value is incorrect");

      let listCampIDs = await kyberDao.getListCampaignIDs(1);
      Helper.assertEqual(1, listCampIDs.length, "should have added first camp");
      Helper.assertEqual(1, listCampIDs[0], "should have added first camp");

      listCampIDs = await kyberDao.getListCampaignIDs(0);
      Helper.assertEqual(0, listCampIDs.length, "shouldn't have added any camps");

      await submitNewCampaign(kyberDao,
        0, startBlock + 4, startBlock + 4 + minCampPeriod,
        minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3, 4], '0x', {from: daoOperator}
      );

      listCampIDs = await kyberDao.getListCampaignIDs(1);
      Helper.assertEqual(2, listCampIDs.length, "should have added 2 camps");
      Helper.assertEqual(1, listCampIDs[0], "should have added 2 camps");
      Helper.assertEqual(2, listCampIDs[1], "should have added 2 camps");

      // delay to epoch 1
      await Helper.mineNewBlockAt(daoStartTime);

      await updateCurrentBlockAndTimestamp();
      await submitNewCampaign(kyberDao,
        0, startBlock + 4, startBlock + 4 + minCampPeriod,
        minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3, 4], '0x', {from: daoOperator}
      );

      listCampIDs = await kyberDao.getListCampaignIDs(1);
      Helper.assertEqual(3, listCampIDs.length, "should have added 3 camps");
      Helper.assertEqual(1, listCampIDs[0], "should have added 3 camps");
      Helper.assertEqual(2, listCampIDs[1], "should have added 3 camps");
      Helper.assertEqual(3, listCampIDs[2], "should have added 3 camps");
      listCampIDs = await kyberDao.getListCampaignIDs(0);
      Helper.assertEqual(0, listCampIDs.length, "shouldn't have added any camps");
    });

    it("Test submit new campaign of network fee for next epoch", async function() {
      await deployContracts(20, currentBlock + 20, 4);
      // create network fee
      await submitNewCampaign(kyberDao,
        1, startBlock + 1, startBlock + 1 + minCampPeriod,
        minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3, 4], '0x', {from: daoOperator}
      );
      let networkFeeCampaigns = await kyberDao.networkFeeCampaigns(1);
      Helper.assertEqual(1, networkFeeCampaigns, "network fee camp is invalid");

      // can not create new campaign of network fee for next epoch
      await expectRevert(
        submitNewCampaign(kyberDao,
          1, startBlock + 2, startBlock + 2 + minCampPeriod,
          minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3], '0x', {from: daoOperator}
        ),
        "validateParams: already had network fee campaign for this epoch"
      );

      // still able to create for current epoch
      await updateCurrentBlockAndTimestamp();
      await submitNewCampaign(kyberDao,
        1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
        minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3, 4], '0x', {from: daoOperator}
      );

      networkFeeCampaigns = await kyberDao.networkFeeCampaigns(1);
      Helper.assertEqual(1, networkFeeCampaigns, "network fee camp is invalid");
      networkFeeCampaigns = await kyberDao.networkFeeCampaigns(0);
      Helper.assertEqual(2, networkFeeCampaigns, "network fee camp is invalid");

      // delay to next epoch, try to create fee campaign again
      await Helper.mineNewBlockAt(daoStartTime);
      await updateCurrentBlockAndTimestamp();
      // can not create new camp of network fee for current epoch as already existed
      await expectRevert(
        submitNewCampaign(kyberDao,
          1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
          minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3], '0x', {from: daoOperator}
        ),
        "validateParams: already had network fee campaign for this epoch"
      );
      // still able to create camp of other types
      await updateCurrentBlockAndTimestamp();
      await submitNewCampaign(kyberDao,
        0, currentBlock + 3, currentBlock + 3 + minCampPeriod,
        minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3, 4], '0x', {from: daoOperator}
      );
      await updateCurrentBlockAndTimestamp();
      await submitNewCampaign(kyberDao,
        2, currentBlock + 3, currentBlock + 3 + minCampPeriod,
        minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3, 4], '0x', {from: daoOperator}
      );
      networkFeeCampaigns = await kyberDao.networkFeeCampaigns(1);
      Helper.assertEqual(1, networkFeeCampaigns, "network fee camp is invalid");
    });

    it("Test submit new campaign of brr for next epoch", async function() {
      await deployContracts(20, currentBlock + 20, 4);
      // create network fee
      await submitNewCampaign(kyberDao,
        2, startBlock + 1, startBlock + 1 + minCampPeriod,
        minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3, 4], '0x', {from: daoOperator}
      );
      let brrCamp = await kyberDao.brrCampaigns(1);
      Helper.assertEqual(1, brrCamp, "brr camp is invalid");

      // can not create new camp of network fee for next epoch
      await expectRevert(
        submitNewCampaign(kyberDao,
          2, startBlock + 2, startBlock + 2 + minCampPeriod,
          minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3], '0x', {from: daoOperator}
        ),
        "validateParams: already had brr campaign for this epoch"
      );

      // still able to create for current epoch
      await updateCurrentBlockAndTimestamp();
      await submitNewCampaign(kyberDao,
        2, currentBlock + 3, currentBlock + 3 + minCampPeriod,
        minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3, 4], '0x', {from: daoOperator}
      );

      brrCamp = await kyberDao.brrCampaigns(1);
      Helper.assertEqual(1, brrCamp, "brr camp is invalid");
      brrCamp = await kyberDao.brrCampaigns(0);
      Helper.assertEqual(2, brrCamp, "brr camp is invalid");

      // delay to next epoch, try to create fee campaign again
      await Helper.mineNewBlockAt(daoStartTime);
      await updateCurrentBlockAndTimestamp();

      // can not create new camp of network fee for current epoch as already existed
      await expectRevert(
        submitNewCampaign(kyberDao,
          2, currentBlock + 2, currentBlock + 2 + minCampPeriod,
          minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3], '0x', {from: daoOperator}
        ),
        "validateParams: already had brr campaign for this epoch"
      );
      // still able to create camp of other types
      await updateCurrentBlockAndTimestamp();
      await submitNewCampaign(kyberDao,
        0, currentBlock + 3, currentBlock + 3 + minCampPeriod,
        minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3, 4], '0x', {from: daoOperator}
      );
      await updateCurrentBlockAndTimestamp();
      await submitNewCampaign(kyberDao,
        1, currentBlock + 3, currentBlock + 3 + minCampPeriod,
        minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3, 4], '0x', {from: daoOperator}
      );
      brrCamp = await kyberDao.brrCampaigns(1);
      Helper.assertEqual(1, brrCamp, "brr camp is invalid");
    });

    it("Test submit campaign should revert sender is not daoOperator", async function() {
      await deployContracts(10, currentBlock + 30, 10);
      await updateCurrentBlockAndTimestamp();
      await expectRevert(
        submitNewCampaign(kyberDao,
          0, currentBlock + 6, currentBlock + 20, minPercentageInPrecision, cInPrecision, tInPrecision,
          [1, 2, 3, 4], '0x', {from: mike}
        ),
        "only daoOperator"
      )
      await submitNewCampaign(kyberDao,
        0, currentBlock + 6, currentBlock + 20, minPercentageInPrecision, cInPrecision, tInPrecision,
        [1, 2, 3, 4], '0x', {from: daoOperator}
      );
    });

    it("Test submit campaign should revert start or end timestamp is invalid", async function() {
      await deployContracts(30, currentBlock + 30, 10);
      await updateCurrentBlockAndTimestamp();
      // start in the past, use time to make it more accurate
      await expectRevert(
        kyberDao.submitNewCampaign(
          0, currentTimestamp - 1, currentTimestamp + minCampPeriod * blockTime, minPercentageInPrecision, cInPrecision, tInPrecision,
          [1, 2, 3, 4], '0x', {from: daoOperator}
        ),
        "validateParams: start in the past"
      );
      // start in the next 2 epochs, use time to make it more accurate
      await expectRevert(
        kyberDao.submitNewCampaign(
          0, daoStartTime + epochPeriod * blockTime, daoStartTime + (epochPeriod + minCampPeriod) * blockTime,
          minPercentageInPrecision, cInPrecision, tInPrecision,
          [1, 2, 3, 4], '0x', {from: daoOperator}
        ),
        "validateParams: only for current or next epochs"
      )
      // start in the next 10 epochs
      await expectRevert(
        kyberDao.submitNewCampaign(
          0, daoStartTime + 10 * epochPeriod * blockTime, daoStartTime + (10 * epochPeriod + minCampPeriod) * blockTime,
          minPercentageInPrecision, cInPrecision, tInPrecision,
          [1, 2, 3, 4], '0x', {from: daoOperator}
        ),
        "validateParams: only for current or next epochs"
      )
      // start at current epoch but end in the next epoch
      await expectRevert(
        kyberDao.submitNewCampaign(
          0, daoStartTime - 1, daoStartTime + minCampPeriod * blockTime, minPercentageInPrecision, cInPrecision, tInPrecision,
          [1, 2, 3, 4], '0x', {from: daoOperator}
        ),
        "validateParams: start & end not same epoch"    
      )
      // start less than end
      await expectRevert(
        kyberDao.submitNewCampaign(
          0, daoStartTime + 10, daoStartTime, minPercentageInPrecision, cInPrecision, tInPrecision,
          [1, 2, 3, 4], '0x', {from: daoOperator}
        ),
        "validateParams: campaign duration is low"
      )
      // duration is smaller than min camp duration
      await expectRevert(
        kyberDao.submitNewCampaign(
          0, daoStartTime, daoStartTime + minCampPeriod * blockTime - 2, minPercentageInPrecision, cInPrecision, tInPrecision,
          [1, 2, 3, 4], '0x', {from: daoOperator}
        ),
        "validateParams: campaign duration is low"
      )
      await kyberDao.submitNewCampaign(
        0, daoStartTime - minCampPeriod * blockTime, daoStartTime - 1, minPercentageInPrecision, cInPrecision, tInPrecision,
        [1, 2, 3, 4], '0x', {from: daoOperator}
      );
      // start at next epoch, should be ok
      await kyberDao.submitNewCampaign(
        0, daoStartTime, daoStartTime + minCampPeriod * blockTime, minPercentageInPrecision, cInPrecision, tInPrecision,
        [1, 2, 3, 4], '0x', {from: daoOperator}
      );
      // set next block timestamp and start at that time
      await Helper.setNextBlockTimestamp(daoStartTime);
      await kyberDao.submitNewCampaign(
        0, daoStartTime, daoStartTime + minCampPeriod * blockTime, minPercentageInPrecision, cInPrecision, tInPrecision,
        [1, 2, 3, 4], '0x', {from: daoOperator}
      );
    });

    it("Test submit campaign with startTimestamp is beginning of an epoch", async() => {
      await deployContracts(30, currentBlock + 30, 10);
      // start at beginning of epoch 1
      await kyberDao.submitNewCampaign(
        0, daoStartTime, daoStartTime + minCampPeriod * blockTime, minPercentageInPrecision, cInPrecision, tInPrecision,
        [1, 2, 3, 4], '0x', {from: daoOperator}
      );
      // should revert: start at end of epoch 0, end at epoch 1
      await expectRevert(
        kyberDao.submitNewCampaign(
          0, daoStartTime - 1, daoStartTime + minCampPeriod * blockTime, minPercentageInPrecision, cInPrecision, tInPrecision,
          [1, 2, 3, 4], '0x', {from: daoOperator}
        ),
        "validateParams: start & end not same epoch"
      )
      // delay to epoch 1
      await Helper.mineNewBlockAt(daoStartTime);
      // start at beginning of epoch 2
      let startEpoch2Timestamp = daoStartTime + blocksToSeconds(epochPeriod);
      await kyberDao.submitNewCampaign(
        0, startEpoch2Timestamp, startEpoch2Timestamp + minCampPeriod * blockTime, minPercentageInPrecision, cInPrecision, tInPrecision,
        [1, 2, 3, 4], '0x', {from: daoOperator}
      );
      // should revert: start at end of epoch 1, end at epoch 2
      await expectRevert(
        kyberDao.submitNewCampaign(
          0, startEpoch2Timestamp - 1, startEpoch2Timestamp + minCampPeriod * blockTime, minPercentageInPrecision, cInPrecision, tInPrecision,
          [1, 2, 3, 4], '0x', {from: daoOperator}
        ),
        "validateParams: start & end not same epoch"
      )
      // start at beginning, end at end timestamp of an epoch
      await kyberDao.submitNewCampaign(
        0, startEpoch2Timestamp, startEpoch2Timestamp + blocksToSeconds(epochPeriod) - 1, minPercentageInPrecision, cInPrecision, tInPrecision,
        [1, 2, 3, 4], '0x', {from: daoOperator}
      );
    });

    it("Test submit campaign with endTimestamp is end timestamp of an epoch", async() => {
      await deployContracts(30, currentBlock + 30, 10);
      // end at end of epoch 0
      await kyberDao.submitNewCampaign(
        0, daoStartTime - minCampPeriod * blockTime, daoStartTime - 1, minPercentageInPrecision, cInPrecision, tInPrecision,
        [1, 2, 3, 4], '0x', {from: daoOperator}
      );
      // should revert: start at epoch 0, end at beginning of epoch 1
      await expectRevert(
        kyberDao.submitNewCampaign(
          0, daoStartTime - minCampPeriod * blockTime, daoStartTime, minPercentageInPrecision, cInPrecision, tInPrecision,
          [1, 2, 3, 4], '0x', {from: daoOperator}
        ),
        "validateParams: start & end not same epoch"
      )
      // end of end of epoch 1
      let endEpoch1Timestamp = daoStartTime + blocksToSeconds(epochPeriod) - 1;
      await kyberDao.submitNewCampaign(
        0, endEpoch1Timestamp - minCampPeriod * blockTime, endEpoch1Timestamp, minPercentageInPrecision, cInPrecision, tInPrecision,
        [1, 2, 3, 4], '0x', {from: daoOperator}
      );
      // should revert: start at epoch 1, end at beginning of epoch 2
      await expectRevert(
        kyberDao.submitNewCampaign(
          0, endEpoch1Timestamp - minCampPeriod * blockTime, endEpoch1Timestamp + 1, minPercentageInPrecision, cInPrecision, tInPrecision,
          [1, 2, 3, 4], '0x', {from: daoOperator}
        ),
        "validateParams: start & end not same epoch"
      )
      // delay to epoch 1
      await Helper.mineNewBlockAt(daoStartTime);
      // start at beginning, end at end timestamp of an epoch
      await kyberDao.submitNewCampaign(
        0, endEpoch1Timestamp - minCampPeriod * blockTime - 10, endEpoch1Timestamp, minPercentageInPrecision, cInPrecision, tInPrecision,
        [1, 2, 3, 4], '0x', {from: daoOperator}
      );
    });

    it("Test submit campaign should revert number options is invalid", async function() {
      await deployContracts(30, currentBlock + 30, 10);
      await updateCurrentBlockAndTimestamp();
      // no options
      await expectRevert(
        submitNewCampaign(kyberDao,
          0, currentBlock + 3, currentBlock + 3 + minCampPeriod, minPercentageInPrecision, cInPrecision, tInPrecision,
          [], '0x', {from: daoOperator}
        ),
        "validateParams: invalid number of options"
      )
      // one options
      await expectRevert(
        submitNewCampaign(kyberDao,
          0, currentBlock + 5, currentBlock + 5 + minCampPeriod, minPercentageInPrecision, cInPrecision, tInPrecision,
          [1], '0x', {from: daoOperator}
        ),
        "validateParams: invalid number of options"
      )
      // more than 8 options (max number options)
      await expectRevert(
        submitNewCampaign(kyberDao,
          0, currentBlock + 7, currentBlock + 7 + minCampPeriod, minPercentageInPrecision, cInPrecision, tInPrecision,
          [1, 2, 3, 4, 5, 6, 7, 8, 9], '0x', {from: daoOperator}
        ),
        "validateParams: invalid number of options"
      )
      // should work with 2, 3, 4 options
      await submitNewCampaign(kyberDao,
        0, currentBlock + 9, currentBlock + 9 + minCampPeriod, minPercentageInPrecision, cInPrecision, tInPrecision,
        [1, 2], '0x', {from: daoOperator}
      );
      await submitNewCampaign(kyberDao,
        0, currentBlock + 11, currentBlock + 11 + minCampPeriod, minPercentageInPrecision, cInPrecision, tInPrecision,
        [1, 2, 3], '0x', {from: daoOperator}
      );
      await submitNewCampaign(kyberDao,
        0, currentBlock + 13, currentBlock + 13 + minCampPeriod, minPercentageInPrecision, cInPrecision, tInPrecision,
        [1, 2, 3, 4], '0x', {from: daoOperator}
      );
    });

    it("Test submit campaign should revert option value is invalid", async function() {
      await deployContracts(30, currentBlock + 50, 10);
      // general camp: option value is 0
      await updateCurrentBlockAndTimestamp();
      await expectRevert(
        submitNewCampaign(kyberDao,
          0, currentBlock + 3, currentBlock + 3 + minCampPeriod, minPercentageInPrecision, cInPrecision, tInPrecision,
          [0, 1, 2], '0x', {from: daoOperator}
        ),
        "validateParams: general campaign option is 0"
      )
      await expectRevert(
        submitNewCampaign(kyberDao,
          0, currentBlock + 5, currentBlock + 5 + minCampPeriod, minPercentageInPrecision, cInPrecision, tInPrecision,
          [1, 2, 0], '0x', {from: daoOperator}
        ),
        "validateParams: general campaign option is 0"
      )
      // valid option values
      await submitNewCampaign(kyberDao,
        0, currentBlock + 7, currentBlock + 7 + minCampPeriod, minPercentageInPrecision, cInPrecision, tInPrecision,
        [1, 2, 3], '0x', {from: daoOperator}
      );
      // network fee: option > 100% (BPS)
      await expectRevert(
        submitNewCampaign(kyberDao,
          1, currentBlock + 9, currentBlock + 9 + minCampPeriod, minPercentageInPrecision, cInPrecision, tInPrecision,
          [1, 2, 3, 5000], '0x', {from: daoOperator}
        ),
        "validateParams: network fee must be smaller then BPS / 2"
      )
      await expectRevert(
        submitNewCampaign(kyberDao,
          1, currentBlock + 11, currentBlock + 11 + minCampPeriod, minPercentageInPrecision, cInPrecision, tInPrecision,
          [1, 10000, 2, 3], '0x', {from: daoOperator}
        ),
        "validateParams: network fee must be smaller then BPS / 2"
      )
      await submitNewCampaign(kyberDao,
        1, currentBlock + 13, currentBlock + 13 + minCampPeriod, minPercentageInPrecision, cInPrecision, tInPrecision,
        [1, 4999, 2, 3], '0x', {from: daoOperator}
      );
      // brr campaign: reward + rebate > 100%
      await expectRevert(
        submitNewCampaign(kyberDao,
          2, currentBlock + 15, currentBlock + 15 + minCampPeriod, minPercentageInPrecision, cInPrecision, tInPrecision,
          [1, getDataFromRebateAndReward(100, 10001 - 100), 2, 3], '0x', {from: daoOperator}
        ),
        "validateParams: rebate + reward can't be bigger than BPS"
      )
      await expectRevert(
        submitNewCampaign(kyberDao,
          2, currentBlock + 17, currentBlock + 17 + minCampPeriod, minPercentageInPrecision, cInPrecision, tInPrecision,
          [1, 2, getDataFromRebateAndReward(20, 10000)], '0x', {from: daoOperator}
        ),
        "validateParams: rebate + reward can't be bigger than BPS"
      )
      await submitNewCampaign(kyberDao,
        2, currentBlock + 19, currentBlock + 19 + minCampPeriod, minPercentageInPrecision, cInPrecision, tInPrecision,
        [1, getDataFromRebateAndReward(2500, 2500), 2, 3], '0x', {from: daoOperator}
      );
    });

    it("Test submit campaign should revert invalid campaign type", async function() {
      await deployContracts(30, currentBlock + 50, 10);
      await updateCurrentBlockAndTimestamp();
      // note: it is reverted as invalid opcode for campaign type, no message here
      // running normal test and coverage are returning different type of exception
      try {
        await submitNewCampaign(kyberDao,
          3, currentBlock + 3, currentBlock + 3 + minCampPeriod, minPercentageInPrecision, cInPrecision, tInPrecision,
          [1, 2, 3], '0x', {from: daoOperator}
        );
        assert(false, "throw was expected in line above");
      } catch (e) {
        assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
      }
      try {
        await submitNewCampaign(kyberDao,
          5, currentBlock + 5, currentBlock + 5 + minCampPeriod, minPercentageInPrecision, cInPrecision, tInPrecision,
          [1, 2, 3], '0x', {from: daoOperator}
        );
        assert(false, "throw was expected in line above");
      } catch (e) {
        assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
      }
      await submitNewCampaign(kyberDao,
        0, currentBlock + 7, currentBlock + 7 + minCampPeriod, minPercentageInPrecision, cInPrecision, tInPrecision,
        [1, 2, 3], '0x', {from: daoOperator}
      );
      await submitNewCampaign(kyberDao,
        1, currentBlock + 9, currentBlock + 9 + minCampPeriod, minPercentageInPrecision, cInPrecision, tInPrecision,
        [1, 4999, 2, 3], '0x', {from: daoOperator}
      );
      await submitNewCampaign(kyberDao,
        2, currentBlock + 11, currentBlock + 11 + minCampPeriod, minPercentageInPrecision, cInPrecision, tInPrecision,
        [1, getDataFromRebateAndReward(2500, 2500), 2, 3], '0x', {from: daoOperator}
      );
    });

    it("Test submit campaign should revert formula params are invalid", async function() {
      await deployContracts(30, currentBlock + 50, 10);
      await updateCurrentBlockAndTimestamp();
      // invalid min percentage (> 100%)
      await expectRevert(
        submitNewCampaign(kyberDao,
          0, currentBlock + 3, currentBlock + 3 + minCampPeriod,
          precisionUnits.add(new BN(1)), cInPrecision, tInPrecision,
          [1, 2, 3], '0x', {from: daoOperator}
        ),
        "validateParams: min percentage is high"
      )
      // cInPrecision >= 2^128
      await expectRevert(
        submitNewCampaign(kyberDao,
          0, currentBlock + 3, currentBlock + 3 + minCampPeriod,
          precisionUnits, new BN(2).pow(new BN(128)), tInPrecision,
          [1, 2, 3], '0x', {from: daoOperator}
        ),
        "validateParams: c is high"
      )
      // tInPrecision >= 2^128
      await expectRevert(
        submitNewCampaign(kyberDao,
          0, currentBlock + 3, currentBlock + 3 + minCampPeriod,
          precisionUnits, tInPrecision, new BN(2).pow(new BN(128)),
          [1, 2, 3], '0x', {from: daoOperator}
        ),
        "validateParams: t is high"
      )
      await submitNewCampaign(kyberDao,
        0, currentBlock + 5, currentBlock + 5 + minCampPeriod,
        precisionUnits.sub(new BN(100)), new BN(2).pow(new BN(128)).sub(new BN(1)), tInPrecision,
        [1, 2, 3], '0x', {from: daoOperator}
      );
      await submitNewCampaign(kyberDao,
        0, currentBlock + 5, currentBlock + 5 + minCampPeriod,
        precisionUnits.sub(new BN(100)), cInPrecision, new BN(2).pow(new BN(128)).sub(new BN(1)),
        [1, 2, 3], '0x', {from: daoOperator}
      );
      await submitNewCampaign(kyberDao,
        0, currentBlock + 7, currentBlock + 7 + minCampPeriod,
        precisionUnits, cInPrecision, tInPrecision,
        [1, 2, 3], '0x', {from: daoOperator}
      );
    });

    it("Test submit campaign should revert network fee camp's already existed", async function() {
      await deployContracts(30, currentBlock + 20, 4);
      await updateCurrentBlockAndTimestamp();
      await submitNewCampaign(kyberDao,
        1, currentBlock + 4, currentBlock + 4 + minCampPeriod, minPercentageInPrecision, cInPrecision, tInPrecision,
        [1, 2, 3], '0x', {from: daoOperator}
      );
      await expectRevert(
        submitNewCampaign(kyberDao,
          1, currentBlock + 6, currentBlock + 6 + minCampPeriod, minPercentageInPrecision, cInPrecision, tInPrecision,
          [1, 2, 3], '0x', {from: daoOperator}
        ),
        "validateParams: already had network fee campaign for this epoch"
      )
      await submitNewCampaign(kyberDao,
        0, currentBlock + 8, currentBlock + 8 + minCampPeriod, minPercentageInPrecision, cInPrecision, tInPrecision,
        [1, 2, 3], '0x', {from: daoOperator}
      );
      await submitNewCampaign(kyberDao,
        2, currentBlock + 10, currentBlock + 10 + minCampPeriod, minPercentageInPrecision, cInPrecision, tInPrecision,
        [1, 2, 3], '0x', {from: daoOperator}
      );
      // jump to epoch 1
      await Helper.mineNewBlockAt(blockToTimestamp(startBlock + 1));
      await updateCurrentBlockAndTimestamp();
      await submitNewCampaign(kyberDao,
        1, currentBlock + 4, currentBlock + 4 + minCampPeriod, minPercentageInPrecision, cInPrecision, tInPrecision,
        [1, 2, 3], '0x', {from: daoOperator}
      );
      await expectRevert(
        submitNewCampaign(kyberDao,
          1, currentBlock + 6, currentBlock + 6 + minCampPeriod, minPercentageInPrecision, cInPrecision, tInPrecision,
          [1, 2, 3], '0x', {from: daoOperator}
        ),
        "validateParams: already had network fee campaign for this epoch"
      )
      await submitNewCampaign(kyberDao,
        0, currentBlock + 8, currentBlock + 8 + minCampPeriod, minPercentageInPrecision, cInPrecision, tInPrecision,
        [1, 2, 3], '0x', {from: daoOperator}
      );
    });

    it("Test submit campaign should revert brr camp's already existed", async function() {
      await deployContracts(30, currentBlock + 20, 4);
      await updateCurrentBlockAndTimestamp();
      await submitNewCampaign(kyberDao,
        2, currentBlock + 4, currentBlock + 4 + minCampPeriod, minPercentageInPrecision, cInPrecision, tInPrecision,
        [1, 2, 3], '0x', {from: daoOperator}
      );
      await expectRevert(
        submitNewCampaign(kyberDao,
          2, currentBlock + 6, currentBlock + 6 + minCampPeriod, minPercentageInPrecision, cInPrecision, tInPrecision,
          [1, 2, 3], '0x', {from: daoOperator}
        ),
        "validateParams: already had brr campaign for this epoch"
      )
      await submitNewCampaign(kyberDao,
        0, currentBlock + 8, currentBlock + 8 + minCampPeriod, minPercentageInPrecision, cInPrecision, tInPrecision,
        [1, 2, 3], '0x', {from: daoOperator}
      );
      await submitNewCampaign(kyberDao,
        1, currentBlock + 10, currentBlock + 10 + minCampPeriod, minPercentageInPrecision, cInPrecision, tInPrecision,
        [1, 2, 3], '0x', {from: daoOperator}
      );
      // jump to epoch 1
      await Helper.mineNewBlockAt(blockToTimestamp(startBlock + 1));
      await updateCurrentBlockAndTimestamp();
      await submitNewCampaign(kyberDao,
        2, currentBlock + 4, currentBlock + 4 + minCampPeriod, minPercentageInPrecision, cInPrecision, tInPrecision,
        [1, 2, 3], '0x', {from: daoOperator}
      );
      await expectRevert(
        submitNewCampaign(kyberDao,
          2, currentBlock + 6, currentBlock + 6 + minCampPeriod, minPercentageInPrecision, cInPrecision, tInPrecision,
          [1, 2, 3], '0x', {from: daoOperator}
        ),
        "validateParams: already had brr campaign for this epoch"
      )
      await submitNewCampaign(kyberDao,
        0, currentBlock + 8, currentBlock + 8 + minCampPeriod, minPercentageInPrecision, cInPrecision, tInPrecision,
        [1, 2, 3], '0x', {from: daoOperator}
      );
    });

    it("Test submit campaign should revert exceed max campaigns for current or next epoch", async function() {
      await deployContracts(20, currentBlock + 50, 4);
      await updateCurrentBlockAndTimestamp();
      let maxCamps = await kyberDao.MAX_EPOCH_CAMPAIGNS();

      for(let id = 0; id < maxCamps; id++) {
        await kyberDao.submitNewCampaign(
          id <= 2 ? id : 0, daoStartTime - minCampPeriod * blockTime, daoStartTime - 1,
          minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3], '0x', {from: daoOperator}
        );
      }

      await expectRevert(
        kyberDao.submitNewCampaign(
          0, daoStartTime - minCampPeriod * blockTime, daoStartTime - 1, minPercentageInPrecision, cInPrecision, tInPrecision,
          [1, 2, 3], '0x', {from: daoOperator}
        ),
        "validateParams: too many campaigns"
      )

      await kyberDao.cancelCampaign(1, {from: daoOperator});

      await kyberDao.submitNewCampaign(
        0, daoStartTime - minCampPeriod * blockTime, daoStartTime - 1, minPercentageInPrecision, cInPrecision, tInPrecision,
        [1, 2, 3], '0x', {from: daoOperator}
      );

      await expectRevert(
        kyberDao.submitNewCampaign(
          0, daoStartTime - minCampPeriod * blockTime, daoStartTime - 1, minPercentageInPrecision, cInPrecision, tInPrecision,
          [1, 2, 3], '0x', {from: daoOperator}
        ),
        "validateParams: too many campaigns"
      )

      for(let id = 0; id < maxCamps; id++) {
        await kyberDao.submitNewCampaign(
          id <= 2 ? id : 0, daoStartTime, daoStartTime + minCampPeriod * blockTime,
          minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3], '0x', {from: daoOperator}
        );
      }
      await expectRevert(
        kyberDao.submitNewCampaign(
          0, daoStartTime, daoStartTime + minCampPeriod * blockTime, minPercentageInPrecision, cInPrecision, tInPrecision,
          [1, 2, 3], '0x', {from: daoOperator}
        ),
        "validateParams: too many campaigns"
      )
      await kyberDao.cancelCampaign(await kyberDao.numberCampaigns(), {from: daoOperator});
      await kyberDao.submitNewCampaign(
        0, daoStartTime, daoStartTime + minCampPeriod * blockTime, minPercentageInPrecision, cInPrecision, tInPrecision,
        [1, 2, 3], '0x', {from: daoOperator}
      );
    });
  });

  describe("#Cancel Campaign tests", () => {
    it("Test cancel campaign should revert campaign is not existed", async function() {
      await deployContracts(10, currentBlock + 20, 2);
      await expectRevert(
        kyberDao.cancelCampaign(1, {from: daoOperator}),
        "cancelCampaign: campaignID doesn't exist"
      )
      await updateCurrentBlockAndTimestamp();
      await submitNewCampaign(kyberDao,
        0, currentBlock + 5, currentBlock + 5 + minCampPeriod, minPercentageInPrecision, cInPrecision, tInPrecision,
        [1, 2, 3], '0x', {from: daoOperator}
      );
      await expectRevert(
        kyberDao.cancelCampaign(2, {from: daoOperator}),
        "cancelCampaign: campaignID doesn't exist"
      )
      await kyberDao.cancelCampaign(1, {from: daoOperator});
    });

    it("Test cancel campaign should revert sender is not daoOperator", async function() {
      await deployContracts(10, currentBlock + 20, 2);
      await updateCurrentBlockAndTimestamp();
      await submitNewCampaign(kyberDao,
        0, currentBlock + 5, currentBlock + 5 + minCampPeriod, minPercentageInPrecision, cInPrecision, tInPrecision,
        [1, 2, 3], '0x', {from: daoOperator}
      );
      await expectRevert(
        kyberDao.cancelCampaign(1, {from: mike}),
        "only daoOperator"
      );
      await kyberDao.cancelCampaign(1, {from: daoOperator});
    })

    it("Test cancel campaign should revert camp already started or ended", async function() {
      await deployContracts(10, currentBlock + 20, 5);
      await updateCurrentBlockAndTimestamp();
      await submitNewCampaignAndDelayToStart(kyberDao,
        0, currentBlock + 2, currentBlock + 2 + minCampPeriod, minPercentageInPrecision, cInPrecision, tInPrecision,
        [1, 2, 3], '0x', {from: daoOperator}
      );
      // camp already running, can not cancel
      await expectRevert(
        kyberDao.cancelCampaign(1, {from: daoOperator}),
        "cancelCampaign: campaign already started"
      )
      await Helper.mineNewBlockAt(blocksToSeconds(minCampPeriod));
      // camp already ended, cancel cancel
      await expectRevert(
        kyberDao.cancelCampaign(1, {from: daoOperator}),
        "cancelCampaign: campaign already started"
      )
    })

    it("Test cancel campaign should update correct data after cancelled", async function() {
      await deployContracts(20, currentBlock + 20, 3);

      let campCounts = 0;

      for(let id = 0; id < 2; id++) {
        await updateCurrentBlockAndTimestamp();
        await submitNewCampaign(kyberDao,
          0, currentBlock + 10, currentBlock + 10 + minCampPeriod, minPercentageInPrecision, cInPrecision, tInPrecision,
          [1, 2, 3], '0x', {from: daoOperator}
        );
        await submitNewCampaign(kyberDao,
          1, currentBlock + 10, currentBlock + 10 + minCampPeriod, minPercentageInPrecision, cInPrecision, tInPrecision,
          [1, 2, 3], '0x', {from: daoOperator}
        );
        await submitNewCampaign(kyberDao,
          2, currentBlock + 10, currentBlock + 10 + minCampPeriod, minPercentageInPrecision, cInPrecision, tInPrecision,
          [1, 2, 3], '0x', {from: daoOperator}
        );
        await submitNewCampaign(kyberDao,
          0, currentBlock + 10, currentBlock + 10 + minCampPeriod, minPercentageInPrecision, cInPrecision, tInPrecision,
          [1, 2, 3], '0x', {from: daoOperator}
        );

        campCounts += 4;

        Helper.assertEqual(await kyberDao.numberCampaigns(), campCounts, "number campaigns have been created is incorrect");

        let listCamps = await kyberDao.getListCampaignIDs(id);

        Helper.assertEqual(listCamps.length, 4, "number camps for this epoch is incorrect");
        Helper.assertEqual(listCamps[0], campCounts - 3, "camp id for this epoch is incorrect");
        Helper.assertEqual(listCamps[1], campCounts - 2, "camp id for this epoch is incorrect");
        Helper.assertEqual(listCamps[2], campCounts - 1, "camp id for this epoch is incorrect");
        Helper.assertEqual(listCamps[3], campCounts, "camp id for this epoch is incorrect");

        // cancel last created camp
        let tx = await kyberDao.cancelCampaign(campCounts, {from: daoOperator});
        logInfo("Cancel campaign: 4 camps, cancel last one, gas used: " + tx.receipt.gasUsed);
        expectEvent(tx, 'CancelledCampaign', {
          campaignID: new BN(campCounts)
        });

        listCamps = await kyberDao.getListCampaignIDs(id);
        Helper.assertEqual(listCamps.length, 3, "number camps for this epoch is incorrect");
        Helper.assertEqual(listCamps[0], campCounts - 3, "camp id for this epoch is incorrect");
        Helper.assertEqual(listCamps[1], campCounts - 2, "camp id for this epoch is incorrect");
        Helper.assertEqual(listCamps[2], campCounts - 1, "camp id for this epoch is incorrect");

        Helper.assertEqual(false, await kyberDao.campaignExists(campCounts), "camp shouldn't be existed after cancel");

        let campData = await kyberDao.getCampaignDetails(campCounts);
        Helper.assertEqual(campData.campaignType, 0, "camp details should be deleted");
        Helper.assertEqual(campData.startTimestamp, 0, "camp details should be deleted");
        Helper.assertEqual(campData.endTimestamp, 0, "camp details should be deleted");
        Helper.assertEqual(campData.totalKNCSupply, 0, "camp details should be deleted");
        Helper.assertEqual(campData.minPercentageInPrecision, 0, "camp details should be deleted");
        Helper.assertEqual(campData.cInPrecision, 0, "camp details should be deleted");
        Helper.assertEqual(campData.tInPrecision, 0, "camp details should be deleted");

        let voteData = await kyberDao.getCampaignVoteCountData(campCounts);
        Helper.assertEqual(voteData.voteCounts.length, 0, "camp vote data should be deleted");
        Helper.assertEqual(voteData.totalVoteCount, 0, "camp vote data be deleted");

        // numberCampaigns value shouldn't be changed
        Helper.assertEqual(await kyberDao.numberCampaigns(), campCounts, "number campaigns have been created is incorrect");

        // cancel middle camp
        tx = await kyberDao.cancelCampaign(campCounts - 3, {from: daoOperator});
        logInfo("Cancel campaign: 3 camps, cancel first one, gas used: " + tx.receipt.gasUsed);
        expectEvent(tx, 'CancelledCampaign', {
          campaignID: new BN(campCounts - 3)
        });

        listCamps = await kyberDao.getListCampaignIDs(id);
        Helper.assertEqual(listCamps.length, 2, "number camps for this epoch is incorrect");
        Helper.assertEqual(listCamps[0], campCounts - 1, "camp id for this epoch is incorrect");
        Helper.assertEqual(listCamps[1], campCounts - 2, "camp id for this epoch is incorrect");

        campData = await kyberDao.getCampaignDetails(campCounts - 3);
        Helper.assertEqual(campData.campaignType, 0, "camp details should be deleted");
        Helper.assertEqual(campData.startTimestamp, 0, "camp details should be deleted");
        Helper.assertEqual(campData.endTimestamp, 0, "camp details should be deleted");
        Helper.assertEqual(campData.totalKNCSupply, 0, "camp details should be deleted");
        Helper.assertEqual(campData.minPercentageInPrecision, 0, "camp details should be deleted");
        Helper.assertEqual(campData.cInPrecision, 0, "camp details should be deleted");
        Helper.assertEqual(campData.tInPrecision, 0, "camp details should be deleted");

        voteData = await kyberDao.getCampaignVoteCountData(campCounts - 3);
        Helper.assertEqual(voteData.voteCounts.length, 0, "camp vote data should be deleted");
        Helper.assertEqual(voteData.totalVoteCount, 0, "camp vote data be deleted");

        Helper.assertEqual(false, await kyberDao.campaignExists(campCounts - 3), "camp shouldn't be existed after cancel");

        // numberCampaigns value shouldn't be changed
        Helper.assertEqual(await kyberDao.numberCampaigns(), campCounts, "number campaigns have been created is incorrect");

        await submitNewCampaign(kyberDao,
          0, currentBlock + 10, currentBlock + 10 + minCampPeriod, minPercentageInPrecision, cInPrecision, tInPrecision,
          [1, 2, 3], '0x', {from: daoOperator}
        );

        campCounts++;

        Helper.assertEqual(await kyberDao.numberCampaigns(), campCounts, "number campaigns have been created is incorrect");

        listCamps = await kyberDao.getListCampaignIDs(id);

        Helper.assertEqual(listCamps.length, 3, "number camps for this epoch is incorrect");
        Helper.assertEqual(listCamps[0], campCounts - 2, "camp id for this epoch is incorrect");
        Helper.assertEqual(listCamps[1], campCounts - 3, "camp id for this epoch is incorrect");
        Helper.assertEqual(listCamps[2], campCounts, "camp id for this epoch is incorrect");

        // delay until new epoch
        await Helper.mineNewBlockAt(blockToTimestamp(id * epochPeriod + startBlock));
      }
    });

    it("Test cancel campaign correctly for network fee camp", async function() {
      await deployContracts(20, currentBlock + 50, 5);

      Helper.assertEqual(0, await kyberDao.networkFeeCampaigns(0), "network fee camp id should be correct");

      let link = web3.utils.fromAscii("https://kyberswap.com");
      await submitNewCampaign(kyberDao,
        1, currentBlock + 15, currentBlock + 15 + minCampPeriod,
        minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3], link, {from: daoOperator}
      );

      Helper.assertEqual(1, await kyberDao.networkFeeCampaigns(0), "network fee camp id should be correct");

      let campData = await kyberDao.getCampaignDetails(1);
      Helper.assertEqual(campData.campaignType, 1, "camp details should be correct");
      Helper.assertEqual(campData.startTimestamp, blockToTimestamp(currentBlock + 15), "camp details should be correct");
      Helper.assertEqual(campData.endTimestamp, blockToTimestamp(currentBlock + 15 + minCampPeriod), "camp details should be correct");
      Helper.assertEqual(campData.totalKNCSupply, await kncToken.totalSupply(), "camp details should be correct");
      Helper.assertEqual(campData.minPercentageInPrecision, minPercentageInPrecision, "camp details should be correct");
      Helper.assertEqual(campData.cInPrecision, cInPrecision, "camp details should be correct");
      Helper.assertEqual(campData.tInPrecision, tInPrecision, "camp details should be correct");
      Helper.assertEqual(campData.link, link, "camp details should be correct");
      Helper.assertEqual(campData.options.length, 3, "camp details should be correct");
      Helper.assertEqual(campData.options[0], 1, "camp details should be correct");
      Helper.assertEqual(campData.options[1], 2, "camp details should be correct");
      Helper.assertEqual(campData.options[2], 3, "camp details should be correct");

      let tx = await kyberDao.cancelCampaign(1, {from: daoOperator});
      logInfo("Cancel campaign: cancel network fee camp, gas used: " + tx.receipt.gasUsed);

      campData = await kyberDao.getCampaignDetails(1);
      Helper.assertEqual(campData.campaignType, 0, "camp details should be deleted");
      Helper.assertEqual(campData.startTimestamp, 0, "camp details should be deleted");
      Helper.assertEqual(campData.endTimestamp, 0, "camp details should be deleted");
      Helper.assertEqual(campData.totalKNCSupply, 0, "camp details should be deleted");
      Helper.assertEqual(campData.minPercentageInPrecision, 0, "camp details should be deleted");
      Helper.assertEqual(campData.cInPrecision, 0, "camp details should be deleted");
      Helper.assertEqual(campData.tInPrecision, 0, "camp details should be deleted");
      // campData[7] is null, can not use assert equal
      Helper.assertEqual(campData[8].length, 0, "camp details should be deleted");

      Helper.assertEqual(0, await kyberDao.networkFeeCampaigns(0), "network fee camp id should be deleted");

      // create a general camp
      await submitNewCampaign(kyberDao,
        0, currentBlock + 20, currentBlock + 20 + minCampPeriod,
        minPercentageInPrecision, cInPrecision, tInPrecision, [25, 50], link, {from: daoOperator}
      );
      // create brr camp
      await submitNewCampaign(kyberDao,
        2, currentBlock + 20, currentBlock + 20 + minCampPeriod,
        minPercentageInPrecision, cInPrecision, tInPrecision, [25, 50], link, {from: daoOperator}
      );
      Helper.assertEqual(0, await kyberDao.networkFeeCampaigns(0), "network fee camp id should be deleted");

      link = web3.utils.fromAscii("https://google.com");
      minPercentageInPrecision = precisionUnits.div(new BN(10));
      cInPrecision = precisionUnits.div(new BN(2));
      tInPrecision = precisionUnits.div(new BN(4));
      await kncToken.burn(mulPrecision(100));
      await submitNewCampaign(kyberDao,
        1, currentBlock + 20, currentBlock + 20 + minCampPeriod,
        minPercentageInPrecision, cInPrecision, tInPrecision, [25, 50], link, {from: daoOperator}
      );

      Helper.assertEqual(4, await kyberDao.networkFeeCampaigns(0), "network fee camp id should be correct");

      campData = await kyberDao.getCampaignDetails(4);
      Helper.assertEqual(campData.campaignType, 1, "camp details should be correct");
      Helper.assertEqual(campData.startTimestamp, blockToTimestamp(currentBlock + 20), "camp details should be correct");
      Helper.assertEqual(campData.endTimestamp, blockToTimestamp(currentBlock + 20 + minCampPeriod), "camp details should be correct");
      Helper.assertEqual(campData.totalKNCSupply, await kncToken.totalSupply(), "camp details should be correct");
      Helper.assertEqual(campData.minPercentageInPrecision, minPercentageInPrecision, "camp details should be correct");
      Helper.assertEqual(campData.cInPrecision, cInPrecision, "camp details should be correct");
      Helper.assertEqual(campData.tInPrecision, tInPrecision, "camp details should be correct");
      Helper.assertEqual(campData.link, link, "camp details should be correct");
      Helper.assertEqual(campData.options.length, 2, "camp details should be correct");
      Helper.assertEqual(campData.options[0], 25, "camp details should be correct");
      Helper.assertEqual(campData.options[1], 50, "camp details should be correct");
    });

    it("Test cancel campaign correctly for brr camp", async function() {
      await deployContracts(20, currentBlock + 50, 5);

      Helper.assertEqual(0, await kyberDao.brrCampaigns(0), "brr camp id should be correct");

      let link = web3.utils.fromAscii("https://kyberswap.com");
      await submitNewCampaign(kyberDao,
        2, currentBlock + 15, currentBlock + 15 + minCampPeriod,
        minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3], link, {from: daoOperator}
      );

      Helper.assertEqual(1, await kyberDao.brrCampaigns(0), "brr camp id should be correct");

      let campData = await kyberDao.getCampaignDetails(1);
      Helper.assertEqual(campData.campaignType, 2, "camp details should be correct");
      Helper.assertEqual(campData.startTimestamp, blockToTimestamp(currentBlock + 15), "camp details should be correct");
      Helper.assertEqual(campData.endTimestamp, blockToTimestamp(currentBlock + 15 + minCampPeriod), "camp details should be correct");
      Helper.assertEqual(campData.totalKNCSupply, await kncToken.totalSupply(), "camp details should be correct");
      Helper.assertEqual(campData.minPercentageInPrecision, minPercentageInPrecision, "camp details should be correct");
      Helper.assertEqual(campData.cInPrecision, cInPrecision, "camp details should be correct");
      Helper.assertEqual(campData.tInPrecision, tInPrecision, "camp details should be correct");
      Helper.assertEqual(campData.link, link, "camp details should be correct");
      Helper.assertEqual(campData.options.length, 3, "camp details should be correct");
      Helper.assertEqual(campData.options[0], 1, "camp details should be correct");
      Helper.assertEqual(campData.options[1], 2, "camp details should be correct");
      Helper.assertEqual(campData.options[2], 3, "camp details should be correct");

      let tx = await kyberDao.cancelCampaign(1, {from: daoOperator});
      logInfo("Cancel campaign: cancel brr camp, gas used: " + tx.receipt.gasUsed);

      campData = await kyberDao.getCampaignDetails(1);
      Helper.assertEqual(campData.campaignType, 0, "camp details should be deleted");
      Helper.assertEqual(campData.startTimestamp, 0, "camp details should be deleted");
      Helper.assertEqual(campData.endTimestamp, 0, "camp details should be deleted");
      Helper.assertEqual(campData.totalKNCSupply, 0, "camp details should be deleted");
      Helper.assertEqual(campData.minPercentageInPrecision, 0, "camp details should be deleted");
      Helper.assertEqual(campData.cInPrecision, 0, "camp details should be deleted");
      Helper.assertEqual(campData.tInPrecision, 0, "camp details should be deleted");
      // campData[7] is null, can not use assert equal
      Helper.assertEqual(campData[8].length, 0, "camp details should be deleted");

      Helper.assertEqual(0, await kyberDao.brrCampaigns(0), "brr camp id should be deleted");

      // create a general camp
      await submitNewCampaign(kyberDao,
        0, currentBlock + 20, currentBlock + 20 + minCampPeriod,
        minPercentageInPrecision, cInPrecision, tInPrecision, [25, 50], link, {from: daoOperator}
      );
      // create network fee camp
      await submitNewCampaign(kyberDao,
        1, currentBlock + 20, currentBlock + 20 + minCampPeriod,
        minPercentageInPrecision, cInPrecision, tInPrecision, [25, 50], link, {from: daoOperator}
      );
      Helper.assertEqual(0, await kyberDao.brrCampaigns(0), "brr camp id should be deleted");

      link = web3.utils.fromAscii("https://google.com");

      minPercentageInPrecision = precisionUnits.div(new BN(10));
      cInPrecision = precisionUnits.div(new BN(2));
      tInPrecision = precisionUnits.div(new BN(4));
      await kncToken.burn(mulPrecision(100));
      await submitNewCampaign(kyberDao,
        2, currentBlock + 20, currentBlock + 20 + minCampPeriod,
        minPercentageInPrecision, cInPrecision, tInPrecision, [25, 50], link, {from: daoOperator}
      );

      Helper.assertEqual(4, await kyberDao.brrCampaigns(0), "brr camp id should be correct");

      campData = await kyberDao.getCampaignDetails(4);
      Helper.assertEqual(campData.campaignType, 2, "camp details should be correct");
      Helper.assertEqual(campData.startTimestamp, blockToTimestamp(currentBlock + 20), "camp details should be correct");
      Helper.assertEqual(campData.endTimestamp, blockToTimestamp(currentBlock + 20 + minCampPeriod), "camp details should be correct");
      Helper.assertEqual(campData.totalKNCSupply, await kncToken.totalSupply(), "camp details should be correct");
      Helper.assertEqual(campData.minPercentageInPrecision, minPercentageInPrecision, "camp details should be correct");
      Helper.assertEqual(campData.cInPrecision, cInPrecision, "camp details should be correct");
      Helper.assertEqual(campData.tInPrecision, tInPrecision, "camp details should be correct");
      Helper.assertEqual(campData.link, link, "camp details should be correct");
      Helper.assertEqual(campData.options.length, 2, "camp details should be correct");
      Helper.assertEqual(campData.options[0], 25, "camp details should be correct");
      Helper.assertEqual(campData.options[1], 50, "camp details should be correct");
    });

    it("Test cancel campaign of next epoch campaign, data changes as expected", async function() {
      await deployContracts(50, currentBlock + 50, 5);

      let link = web3.utils.fromAscii("https://kyberswap.com");

      await submitNewCampaign(kyberDao,
        0, currentBlock + 15, currentBlock + 15 + minCampPeriod,
        minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3], link, {from: daoOperator}
      );
      await submitNewCampaign(kyberDao,
        1, currentBlock + 15, currentBlock + 15 + minCampPeriod,
        minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3], link, {from: daoOperator}
      );
      await submitNewCampaign(kyberDao,
        2, currentBlock + 15, currentBlock + 15 + minCampPeriod,
        minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3], link, {from: daoOperator}
      );

      let epoch1Block = startBlock + 1;

      await submitNewCampaign(kyberDao,
        0, epoch1Block + 15, epoch1Block + 15 + minCampPeriod,
        minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3], link, {from: daoOperator}
      );
      await submitNewCampaign(kyberDao,
        1, epoch1Block + 15, epoch1Block + 15 + minCampPeriod,
        minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3], link, {from: daoOperator}
      );
      await submitNewCampaign(kyberDao,
        2, epoch1Block + 15, epoch1Block + 15 + minCampPeriod,
        minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3], link, {from: daoOperator}
      );
      await submitNewCampaign(kyberDao,
        0, epoch1Block + 15, epoch1Block + 15 + minCampPeriod,
        minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3], link, {from: daoOperator}
      );

      let campaignIDs = await kyberDao.getListCampaignIDs(0);
      Helper.assertEqual(3, campaignIDs.length, "number ids for first epoch is wrong");
      Helper.assertEqual(1, campaignIDs[0], "camp id for first epoch is wrong");
      Helper.assertEqual(2, campaignIDs[1], "camp id for first epoch is wrong");
      Helper.assertEqual(3, campaignIDs[2], "camp id for first epoch is wrong");

      campaignIDs = await kyberDao.getListCampaignIDs(1);
      Helper.assertEqual(4, campaignIDs.length, "number ids for second epoch is wrong");
      Helper.assertEqual(4, campaignIDs[0], "camp id for second epoch is wrong");
      Helper.assertEqual(5, campaignIDs[1], "camp id for second epoch is wrong");
      Helper.assertEqual(6, campaignIDs[2], "camp id for second epoch is wrong");
      Helper.assertEqual(7, campaignIDs[3], "camp id for second epoch is wrong");

      // cancel next camp
      await kyberDao.cancelCampaign(5, {from: daoOperator});

      campaignIDs = await kyberDao.getListCampaignIDs(1);
      Helper.assertEqual(3, campaignIDs.length, "number ids for second epoch is wrong");
      Helper.assertEqual(4, campaignIDs[0], "camp id for second epoch is wrong");
      Helper.assertEqual(7, campaignIDs[1], "camp id for second epoch is wrong");
      Helper.assertEqual(6, campaignIDs[2], "camp id for second epoch is wrong");

      // epoch 1 camps shouldn't be changed
      campaignIDs = await kyberDao.getListCampaignIDs(0);
      Helper.assertEqual(3, campaignIDs.length, "number ids for first epoch is wrong");
      Helper.assertEqual(1, campaignIDs[0], "camp id for first epoch is wrong");
      Helper.assertEqual(2, campaignIDs[1], "camp id for first epoch is wrong");
      Helper.assertEqual(3, campaignIDs[2], "camp id for first epoch is wrong");

      await kyberDao.cancelCampaign(2, {from: daoOperator});

      campaignIDs = await kyberDao.getListCampaignIDs(1);
      Helper.assertEqual(3, campaignIDs.length, "number ids for second epoch is wrong");
      Helper.assertEqual(4, campaignIDs[0], "camp id for second epoch is wrong");
      Helper.assertEqual(7, campaignIDs[1], "camp id for second epoch is wrong");
      Helper.assertEqual(6, campaignIDs[2], "camp id for second epoch is wrong");

      campaignIDs = await kyberDao.getListCampaignIDs(0);
      Helper.assertEqual(2, campaignIDs.length, "number ids for first epoch is wrong");
      Helper.assertEqual(1, campaignIDs[0], "camp id for first epoch is wrong");
      Helper.assertEqual(3, campaignIDs[1], "camp id for first epoch is wrong");

      // delay to epoch 1
      await Helper.mineNewBlockAt(daoStartTime);

      await kyberDao.cancelCampaign(4, {from: daoOperator});
      // check camp ids
      campaignIDs = await kyberDao.getListCampaignIDs(1);
      Helper.assertEqual(2, campaignIDs.length, "number ids for second epoch is wrong");
      Helper.assertEqual(6, campaignIDs[0], "camp id for second epoch is wrong");
      Helper.assertEqual(7, campaignIDs[1], "camp id for second epoch is wrong");
    });

    it("Test cancel campaign for network fee camp of next epoch", async function() {
      await deployContracts(20, currentBlock + 20, 5);

      let link = web3.utils.fromAscii("https://kyberswap.com");

      await submitNewCampaign(kyberDao,
        1, currentBlock + 5, currentBlock + 5 + minCampPeriod,
        minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3], link, {from: daoOperator}
      );

      Helper.assertEqual(1, await kyberDao.networkFeeCampaigns(0), "network fee camp is wrong");
      Helper.assertEqual(0, await kyberDao.networkFeeCampaigns(1), "network fee camp is wrong");

      // create network fee for next epoch
      await submitNewCampaign(kyberDao,
        1, startBlock + 5, startBlock + 5 + minCampPeriod,
        minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3], link, {from: daoOperator}
      );

      Helper.assertEqual(1, await kyberDao.networkFeeCampaigns(0), "network fee camp is wrong");
      Helper.assertEqual(2, await kyberDao.networkFeeCampaigns(1), "network fee camp is wrong");

      await kyberDao.cancelCampaign(2, {from: daoOperator});

      Helper.assertEqual(1, await kyberDao.networkFeeCampaigns(0), "network fee camp is wrong");
      Helper.assertEqual(0, await kyberDao.networkFeeCampaigns(1), "network fee camp is wrong");

      // create network fee for next epoch again
      await submitNewCampaign(kyberDao,
        1, startBlock + 5, startBlock + 5 + minCampPeriod,
        minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3], link, {from: daoOperator}
      );

      Helper.assertEqual(1, await kyberDao.networkFeeCampaigns(0), "network fee camp is wrong");
      Helper.assertEqual(3, await kyberDao.networkFeeCampaigns(1), "network fee camp is wrong");

      // delay to next epoch
      await Helper.mineNewBlockAt(daoStartTime);

      await kyberDao.cancelCampaign(3, {from: daoOperator});
      Helper.assertEqual(0, await kyberDao.networkFeeCampaigns(1), "network fee camp is wrong");

      // create network fee for epoch 1 again
      await submitNewCampaign(kyberDao,
        1, startBlock + 5, startBlock + 5 + minCampPeriod,
        minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3], link, {from: daoOperator}
      );
      Helper.assertEqual(4, await kyberDao.networkFeeCampaigns(1), "network fee camp is wrong");
    });

    it("Test cancel campaign for brr camp of next epoch", async function() {
      await deployContracts(20, currentBlock + 20, 5);

      let link = web3.utils.fromAscii("https://kyberswap.com");

      await submitNewCampaign(kyberDao,
        2, currentBlock + 5, currentBlock + 5 + minCampPeriod,
        minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3], link, {from: daoOperator}
      );

      Helper.assertEqual(1, await kyberDao.brrCampaigns(0), "brr camp is wrong");
      Helper.assertEqual(0, await kyberDao.brrCampaigns(1), "brr camp is wrong");

      // create brr for next epoch
      await submitNewCampaign(kyberDao,
        2, startBlock + 5, startBlock + 5 + minCampPeriod,
        minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3], link, {from: daoOperator}
      );

      Helper.assertEqual(1, await kyberDao.brrCampaigns(0), "brr camp is wrong");
      Helper.assertEqual(2, await kyberDao.brrCampaigns(1), "brr camp is wrong");

      await kyberDao.cancelCampaign(2, {from: daoOperator});

      Helper.assertEqual(1, await kyberDao.brrCampaigns(0), "brr camp is wrong");
      Helper.assertEqual(0, await kyberDao.brrCampaigns(1), "brr camp is wrong");

      // create brr for next epoch again
      await submitNewCampaign(kyberDao,
        2, startBlock + 5, startBlock + 5 + minCampPeriod,
        minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3], link, {from: daoOperator}
      );

      Helper.assertEqual(1, await kyberDao.brrCampaigns(0), "brr camp is wrong");
      Helper.assertEqual(3, await kyberDao.brrCampaigns(1), "brr camp is wrong");

      // delay to next epoch
      await Helper.mineNewBlockAt(daoStartTime);

      await kyberDao.cancelCampaign(3, {from: daoOperator});
      Helper.assertEqual(0, await kyberDao.brrCampaigns(1), "brr camp is wrong");

      // create brr for epoch 1 again
      await submitNewCampaign(kyberDao,
        2, startBlock + 5, startBlock + 5 + minCampPeriod,
        minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3], link, {from: daoOperator}
      );
      Helper.assertEqual(4, await kyberDao.brrCampaigns(1), "brr camp is wrong");
    });
  });

  describe("#Vote tests", () => {
    it("Test vote should update data correctly - without delegation", async function() {
      await deployContracts(100, currentBlock + 20, 20);
      await setupSimpleStakingData();

      await Helper.mineNewBlockAt(daoStartTime);

      await updateCurrentBlockAndTimestamp();
      await submitNewCampaignAndDelayToStart(kyberDao,
        1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
        0, 0, 0, [25, 50, 100], '0x', {from: daoOperator}
      );

      Helper.assertEqual(0, await kyberDao.getTotalEpochPoints(1), "total epoch points should be correct");
      let campPointsData = await kyberDao.getCampaignVoteCountData(1);
      Helper.assertEqual(0, campPointsData[1], "camp total points should be correct");
      Helper.assertEqual(0, campPointsData[0][0], "option voted count is incorrect");
      Helper.assertEqual(0, campPointsData[0][1], "option voted count is incorrect");
      Helper.assertEqual(0, campPointsData[0][2], "option voted count is incorrect");

      Helper.assertEqual(0, await kyberDao.getNumberVotes(victor, 1), "number votes should be correct");
      Helper.assertEqual(0, await kyberDao.getNumberVotes(mike, 1), "number votes should be correct");
      Helper.assertEqual(0, await kyberDao.getNumberVotes(loi, 1), "number votes should be correct");

      let gasUsed = new BN(0);
      let tx = await kyberDao.vote(1, 1, {from: victor});
      gasUsed.iadd(new BN(tx.receipt.gasUsed));

      let epochPoints = new BN(0).add(initVictorStake);
      let campPoints = new BN(0).add(initVictorStake);
      let optionPoint1 = new BN(0).add(initVictorStake);

      Helper.assertEqual(epochPoints, await kyberDao.getTotalEpochPoints(1), "total epoch points should be correct");
      campPointsData = await kyberDao.getCampaignVoteCountData(1);
      Helper.assertEqual(campPoints, campPointsData[1], "camp total points should be correct");
      Helper.assertEqual(optionPoint1, campPointsData[0][0], "option voted count is incorrect");
      Helper.assertEqual(0, campPointsData[0][1], "option voted count is incorrect");
      Helper.assertEqual(0, campPointsData[0][2], "option voted count is incorrect");

      Helper.assertEqual(1, await kyberDao.getNumberVotes(victor, 1), "number votes should be correct");
      // checked voted option for campaign 1
      Helper.assertEqual(1, await kyberDao.stakerVotedOption(victor, 1), "voted option should be correct");
      Helper.assertEqual(0, await kyberDao.getNumberVotes(mike, 1), "number votes should be correct");
      Helper.assertEqual(0, await kyberDao.getNumberVotes(loi, 1), "number votes should be correct");

      tx = await kyberDao.vote(1, 2, {from: mike});
      gasUsed.iadd(new BN(tx.receipt.gasUsed));

      epochPoints.iadd(initMikeStake);
      campPoints.iadd(initMikeStake);
      let optionPoint2 = new BN(0).add(initMikeStake);

      Helper.assertEqual(epochPoints, await kyberDao.getTotalEpochPoints(1), "total epoch points should be correct");
      campPointsData = await kyberDao.getCampaignVoteCountData(1);
      Helper.assertEqual(campPoints, campPointsData[1], "camp total points should be correct");
      Helper.assertEqual(optionPoint1, campPointsData[0][0], "option voted count is incorrect");
      Helper.assertEqual(optionPoint2, campPointsData[0][1], "option voted count is incorrect");
      Helper.assertEqual(0, campPointsData[0][2], "option voted count is incorrect");

      Helper.assertEqual(1, await kyberDao.getNumberVotes(victor, 1), "number votes should be correct");
      Helper.assertEqual(1, await kyberDao.getNumberVotes(mike, 1), "number votes should be correct");
      // checked voted option for campaign 1
      Helper.assertEqual(2, await kyberDao.stakerVotedOption(mike, 1), "voted option should be correct");
      Helper.assertEqual(0, await kyberDao.getNumberVotes(loi, 1), "number votes should be correct");

      tx = await kyberDao.vote(1, 1, {from: loi});
      gasUsed.iadd(new BN(tx.receipt.gasUsed));

      logInfo("Vote: average gas used without delegation: " + gasUsed.div(new BN(3)).toString(10));

      epochPoints.iadd(initLoiStake);
      campPoints.iadd(initLoiStake);
      optionPoint1.iadd(initLoiStake);

      Helper.assertEqual(epochPoints, await kyberDao.getTotalEpochPoints(1), "total epoch points should be correct");
      campPointsData = await kyberDao.getCampaignVoteCountData(1);
      Helper.assertEqual(campPoints, campPointsData[1], "camp total points should be correct");
      Helper.assertEqual(optionPoint1, campPointsData[0][0], "option voted count is incorrect");
      Helper.assertEqual(optionPoint2, campPointsData[0][1], "option voted count is incorrect");
      Helper.assertEqual(0, campPointsData[0][2], "option voted count is incorrect");

      Helper.assertEqual(1, await kyberDao.getNumberVotes(victor, 1), "number votes should be correct");
      Helper.assertEqual(1, await kyberDao.getNumberVotes(mike, 1), "number votes should be correct");
      Helper.assertEqual(1, await kyberDao.getNumberVotes(loi, 1), "number votes should be correct");

      await stakingContract.withdraw(mulPrecision(100), {from: loi});

      epochPoints.isub(mulPrecision(100));
      campPoints.isub(mulPrecision(100));
      optionPoint1.isub(mulPrecision(100));

      Helper.assertEqual(epochPoints, await kyberDao.getTotalEpochPoints(1), "total epoch points should be correct");
      campPointsData = await kyberDao.getCampaignVoteCountData(1);
      Helper.assertEqual(campPoints, campPointsData[1], "camp total points should be correct");
      Helper.assertEqual(optionPoint1, campPointsData[0][0], "option voted count is incorrect");
      Helper.assertEqual(optionPoint2, campPointsData[0][1], "option voted count is incorrect");
      Helper.assertEqual(0, campPointsData[0][2], "option voted count is incorrect");

      Helper.assertEqual(1, await kyberDao.getNumberVotes(victor, 1), "number votes should be correct");
      Helper.assertEqual(1, await kyberDao.getNumberVotes(mike, 1), "number votes should be correct");
      Helper.assertEqual(1, await kyberDao.getNumberVotes(loi, 1), "number votes should be correct");

      await stakingContract.deposit(mulPrecision(100), {from: mike});
      await stakingContract.delegate(victor, {from: loi});

      // data shouldn't be changed
      Helper.assertEqual(epochPoints, await kyberDao.getTotalEpochPoints(1), "total epoch points should be correct");
      campPointsData = await kyberDao.getCampaignVoteCountData(1);
      Helper.assertEqual(campPoints, campPointsData[1], "camp total points should be correct");
      Helper.assertEqual(optionPoint1, campPointsData[0][0], "option voted count is incorrect");
      Helper.assertEqual(optionPoint2, campPointsData[0][1], "option voted count is incorrect");
      Helper.assertEqual(0, campPointsData[0][2], "option voted count is incorrect");

      Helper.assertEqual(1, await kyberDao.getNumberVotes(victor, 1), "number votes should be correct");
      Helper.assertEqual(1, await kyberDao.getNumberVotes(mike, 1), "number votes should be correct");
      Helper.assertEqual(1, await kyberDao.getNumberVotes(loi, 1), "number votes should be correct");

      await updateCurrentBlockAndTimestamp();
      await submitNewCampaignAndDelayToStart(kyberDao,
        2, currentBlock + 2, currentBlock + 2 + minCampPeriod,
        minPercentageInPrecision, cInPrecision, tInPrecision, [25, 50], '0x', {from: daoOperator}
      );
      await kyberDao.vote(2, 1, {from: victor});

      epochPoints.iadd(initVictorStake);
      let campPoints2 = new BN(0).add(initVictorStake);
      let optionPoint21 = new BN(0).add(initVictorStake);

      Helper.assertEqual(epochPoints, await kyberDao.getTotalEpochPoints(1), "total epoch points should be correct");
      campPointsData = await kyberDao.getCampaignVoteCountData(1);
      Helper.assertEqual(campPoints, campPointsData[1], "camp total points should be correct");
      Helper.assertEqual(optionPoint1, campPointsData[0][0], "option voted count is incorrect");
      Helper.assertEqual(optionPoint2, campPointsData[0][1], "option voted count is incorrect");
      Helper.assertEqual(0, campPointsData[0][2], "option voted count is incorrect");

      campPointsData = await kyberDao.getCampaignVoteCountData(2);
      Helper.assertEqual(campPoints2, campPointsData[1], "camp total points should be correct");
      Helper.assertEqual(optionPoint21, campPointsData[0][0], "option voted count is incorrect");
      Helper.assertEqual(0, campPointsData[0][1], "option voted count is incorrect");

      Helper.assertEqual(2, await kyberDao.getNumberVotes(victor, 1), "number votes should be correct");
      // checked voted option for campaign 1
      Helper.assertEqual(1, await kyberDao.stakerVotedOption(victor, 2), "voted option should be correct");
      Helper.assertEqual(1, await kyberDao.getNumberVotes(mike, 1), "number votes should be correct");
      Helper.assertEqual(1, await kyberDao.getNumberVotes(loi, 1), "number votes should be correct");

      await stakingContract.withdraw(mulPrecision(200), {from: victor});

      epochPoints.isub(mulPrecision(200 * 2));
      campPoints.isub(mulPrecision(200));
      optionPoint1.isub(mulPrecision(200));
      campPoints2.isub(mulPrecision(200));
      optionPoint21.isub(mulPrecision(200));

      Helper.assertEqual(epochPoints, await kyberDao.getTotalEpochPoints(1), "total epoch points should be correct");
      campPointsData = await kyberDao.getCampaignVoteCountData(1);
      Helper.assertEqual(campPoints, campPointsData[1], "camp total points should be correct");
      Helper.assertEqual(optionPoint1, campPointsData[0][0], "option voted count is incorrect");
      Helper.assertEqual(optionPoint2, campPointsData[0][1], "option voted count is incorrect");
      Helper.assertEqual(0, campPointsData[0][2], "option voted count is incorrect");

      campPointsData = await kyberDao.getCampaignVoteCountData(2);
      Helper.assertEqual(campPoints2, campPointsData[1], "camp total points should be correct");
      Helper.assertEqual(optionPoint21, campPointsData[0][0], "option voted count is incorrect");
      Helper.assertEqual(0, campPointsData[0][1], "option voted count is incorrect");
    });

    it("Test vote should update data correctly when revote - without delegation", async function() {
      await deployContracts(100, currentBlock + 20, 20);
      await setupSimpleStakingData();

      await Helper.mineNewBlockAt(daoStartTime);

      await updateCurrentBlockAndTimestamp();
      await submitNewCampaign(kyberDao,
        1, currentBlock + 3, currentBlock + 3 + minCampPeriod,
        0, 0, 0, [25, 50, 100], '0x', {from: daoOperator}
      );
      await updateCurrentBlockAndTimestamp();
      await submitNewCampaignAndDelayToStart(kyberDao,
        2, currentBlock + 4, currentBlock + 4 + minCampPeriod,
        0, 0, 0, [25, 50], '0x', {from: daoOperator}
      );

      Helper.assertEqual(0, await kyberDao.getTotalEpochPoints(1), "total epoch points should be correct");
      let campPointsData = await kyberDao.getCampaignVoteCountData(1);
      Helper.assertEqual(0, campPointsData[1], "camp total points should be correct");
      Helper.assertEqual(0, campPointsData[0][0], "option voted count is incorrect");
      Helper.assertEqual(0, campPointsData[0][1], "option voted count is incorrect");
      Helper.assertEqual(0, campPointsData[0][2], "option voted count is incorrect");

      Helper.assertEqual(0, await kyberDao.getNumberVotes(victor, 1), "number votes should be correct");
      Helper.assertEqual(0, await kyberDao.getNumberVotes(mike, 1), "number votes should be correct");

      let tx = await kyberDao.vote(1, 1, {from: victor});
      expectEvent(tx, 'Voted', {
        staker: victor,
        epoch: new BN(1),
        campaignID: new BN(1),
        option: new BN(1)
      });

      let epochPoints = new BN(0).add(initVictorStake);
      let campPoints = new BN(0).add(initVictorStake);
      let optionPoint1 = new BN(0).add(initVictorStake);

      Helper.assertEqual(epochPoints, await kyberDao.getTotalEpochPoints(1), "total epoch points should be correct");
      campPointsData = await kyberDao.getCampaignVoteCountData(1);
      Helper.assertEqual(campPoints, campPointsData[1], "camp total points should be correct");
      Helper.assertEqual(optionPoint1, campPointsData[0][0], "option voted count is incorrect");
      Helper.assertEqual(0, campPointsData[0][1], "option voted count is incorrect");
      Helper.assertEqual(0, campPointsData[0][2], "option voted count is incorrect");

      Helper.assertEqual(1, await kyberDao.getNumberVotes(victor, 1), "number votes should be correct");
      Helper.assertEqual(0, await kyberDao.getNumberVotes(mike, 1), "number votes should be correct");
      Helper.assertEqual(0, await kyberDao.getNumberVotes(loi, 1), "number votes should be correct");

      tx = await kyberDao.vote(1, 2, {from: mike});
      logInfo("Vote: revote different option, gas used: " + tx.receipt.gasUsed);
      expectEvent(tx, 'Voted', {
        staker: mike,
        epoch: new BN(1),
        campaignID: new BN(1),
        option: new BN(2)
      });
      await kyberDao.vote(1, 2, {from: loi});

      epochPoints.iadd(initMikeStake).iadd(initLoiStake);
      campPoints.iadd(initMikeStake).iadd(initLoiStake);
      let optionPoint2 = new BN(0).add(initMikeStake).add(initLoiStake);

      Helper.assertEqual(epochPoints, await kyberDao.getTotalEpochPoints(1), "total epoch points should be correct");
      campPointsData = await kyberDao.getCampaignVoteCountData(1);
      Helper.assertEqual(campPoints, campPointsData[1], "camp total points should be correct");
      Helper.assertEqual(optionPoint1, campPointsData[0][0], "option voted count is incorrect");
      Helper.assertEqual(optionPoint2, campPointsData[0][1], "option voted count is incorrect");
      Helper.assertEqual(0, campPointsData[0][2], "option voted count is incorrect");

      Helper.assertEqual(1, await kyberDao.getNumberVotes(victor, 1), "number votes should be correct");
      Helper.assertEqual(1, await kyberDao.getNumberVotes(mike, 1), "number votes should be correct");
      // checked voted option for campaign 1
      Helper.assertEqual(2, await kyberDao.stakerVotedOption(mike, 1), "voted option should be correct");
      Helper.assertEqual(1, await kyberDao.getNumberVotes(loi, 1), "number votes should be correct");

      // vote the same
      tx = await kyberDao.vote(1, 2, {from: mike});
      logInfo("Vote: revote same option, gas used: " + tx.receipt.gasUsed);

      Helper.assertEqual(epochPoints, await kyberDao.getTotalEpochPoints(1), "total epoch points should be correct");
      campPointsData = await kyberDao.getCampaignVoteCountData(1);
      Helper.assertEqual(campPoints, campPointsData[1], "camp total points should be correct");
      Helper.assertEqual(optionPoint1, campPointsData[0][0], "option voted count is incorrect");
      Helper.assertEqual(optionPoint2, campPointsData[0][1], "option voted count is incorrect");
      Helper.assertEqual(0, campPointsData[0][2], "option voted count is incorrect");

      Helper.assertEqual(1, await kyberDao.getNumberVotes(victor, 1), "number votes should be correct");
      Helper.assertEqual(1, await kyberDao.getNumberVotes(mike, 1), "number votes should be correct");
      // checked voted option for campaign 1
      Helper.assertEqual(2, await kyberDao.stakerVotedOption(mike, 1), "voted option should be correct");
      Helper.assertEqual(1, await kyberDao.getNumberVotes(loi, 1), "number votes should be correct");

      // revote for mike
      await kyberDao.vote(1, 1, {from: mike});

      // total points + camp points shouldn't change
      // move mike's stake from op2 to op1
      optionPoint1.iadd(initMikeStake);
      optionPoint2.isub(initMikeStake);

      Helper.assertEqual(epochPoints, await kyberDao.getTotalEpochPoints(1), "total epoch points should be correct");
      campPointsData = await kyberDao.getCampaignVoteCountData(1);
      Helper.assertEqual(campPoints, campPointsData[1], "camp total points should be correct");
      Helper.assertEqual(optionPoint1, campPointsData[0][0], "option voted count is incorrect");
      Helper.assertEqual(optionPoint2, campPointsData[0][1], "option voted count is incorrect");
      Helper.assertEqual(0, campPointsData[0][2], "option voted count is incorrect");

      Helper.assertEqual(1, await kyberDao.getNumberVotes(victor, 1), "number votes should be correct");
      Helper.assertEqual(1, await kyberDao.getNumberVotes(mike, 1), "number votes should be correct");
      // checked voted option for campaign 1
      Helper.assertEqual(1, await kyberDao.stakerVotedOption(mike, 1), "voted option should be correct");
      Helper.assertEqual(1, await kyberDao.getNumberVotes(loi, 1), "number votes should be correct");

      await kyberDao.vote(2, 1, {from: mike});
      epochPoints.iadd(initMikeStake);

      Helper.assertEqual(epochPoints, await kyberDao.getTotalEpochPoints(1), "total epoch points should be correct");
      campPointsData = await kyberDao.getCampaignVoteCountData(1);
      Helper.assertEqual(campPoints, campPointsData[1], "camp total points should be correct");
      Helper.assertEqual(optionPoint1, campPointsData[0][0], "option voted count is incorrect");
      Helper.assertEqual(optionPoint2, campPointsData[0][1], "option voted count is incorrect");
      Helper.assertEqual(0, campPointsData[0][2], "option voted count is incorrect");

      let campPoints2 = new BN(0).add(initMikeStake);
      let option1Camp2 = new BN(0).add(initMikeStake);

      campPointsData = await kyberDao.getCampaignVoteCountData(2);
      Helper.assertEqual(campPoints2, campPointsData[1], "camp total points should be correct");
      Helper.assertEqual(option1Camp2, campPointsData[0][0], "option voted count is incorrect");
      Helper.assertEqual(0, campPointsData[0][1], "option voted count is incorrect");

      Helper.assertEqual(1, await kyberDao.getNumberVotes(victor, 1), "number votes should be correct");
      Helper.assertEqual(2, await kyberDao.getNumberVotes(mike, 1), "number votes should be correct");
      Helper.assertEqual(1, await kyberDao.getNumberVotes(loi, 1), "number votes should be correct");

      await stakingContract.withdraw(mulPrecision(100), {from: mike});

      epochPoints.isub(mulPrecision(100 * 2));
      campPoints.isub(mulPrecision(100));
      optionPoint1.isub(mulPrecision(100)); // mike has change vote to option 1
      campPoints2.isub(mulPrecision(100));
      option1Camp2.isub(mulPrecision(100));

      Helper.assertEqual(epochPoints, await kyberDao.getTotalEpochPoints(1), "total epoch points should be correct");
      campPointsData = await kyberDao.getCampaignVoteCountData(1);
      Helper.assertEqual(campPoints, campPointsData[1], "camp total points should be correct");
      Helper.assertEqual(optionPoint1, campPointsData[0][0], "option voted count is incorrect");
      Helper.assertEqual(optionPoint2, campPointsData[0][1], "option voted count is incorrect");
      Helper.assertEqual(0, campPointsData[0][2], "option voted count is incorrect");

      campPointsData = await kyberDao.getCampaignVoteCountData(2);
      Helper.assertEqual(campPoints2, campPointsData[1], "camp total points should be correct");
      Helper.assertEqual(option1Camp2, campPointsData[0][0], "option voted count is incorrect");
      Helper.assertEqual(0, campPointsData[0][1], "option voted count is incorrect");

      // delegate + deposit, nothing change
      await stakingContract.deposit(mulPrecision(200), {from: mike});
      await stakingContract.deposit(mulPrecision(300), {from: victor});
      await stakingContract.deposit(mulPrecision(400), {from: loi});

      await stakingContract.delegate(mike, {from: loi});
      await stakingContract.delegate(mike, {from: victor});

      // nothing should be changed here
      Helper.assertEqual(epochPoints, await kyberDao.getTotalEpochPoints(1), "total epoch points should be correct");
      campPointsData = await kyberDao.getCampaignVoteCountData(1);
      Helper.assertEqual(campPoints, campPointsData[1], "camp total points should be correct");
      Helper.assertEqual(optionPoint1, campPointsData[0][0], "option voted count is incorrect");
      Helper.assertEqual(optionPoint2, campPointsData[0][1], "option voted count is incorrect");
      Helper.assertEqual(0, campPointsData[0][2], "option voted count is incorrect");

      campPointsData = await kyberDao.getCampaignVoteCountData(2);
      Helper.assertEqual(campPoints2, campPointsData[1], "camp total points should be correct");
      Helper.assertEqual(option1Camp2, campPointsData[0][0], "option voted count is incorrect");
      Helper.assertEqual(0, campPointsData[0][1], "option voted count is incorrect");
    });

    it("Test vote should update data correctly - with delegation", async function() {
      await deployContracts(50, currentBlock + 20, 20);
      await setupSimpleStakingData();
      await stakingContract.delegate(mike, {from: victor});
      await stakingContract.delegate(poolMaster, {from: mike});

      // delay to start time of KyberDao
      await Helper.mineNewBlockAt(daoStartTime);

      await updateCurrentBlockAndTimestamp();
      await submitNewCampaignAndDelayToStart(kyberDao,
        1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
        0, 0, 0, [25, 50, 100], '0x', {from: daoOperator}
      );

      // Check: initial data for epoch 1 and camp 1
      Helper.assertEqual(0, await kyberDao.getTotalEpochPoints(1), "total epoch points should be correct");
      let campPointsData = await kyberDao.getCampaignVoteCountData(1);
      Helper.assertEqual(0, campPointsData[1], "camp total points should be correct");
      Helper.assertEqual(0, campPointsData[0][0], "option voted count is incorrect");
      Helper.assertEqual(0, campPointsData[0][1], "option voted count is incorrect");
      Helper.assertEqual(0, campPointsData[0][2], "option voted count is incorrect");

      Helper.assertEqual(0, await kyberDao.getNumberVotes(victor, 1), "number votes should be correct");
      Helper.assertEqual(0, await kyberDao.getNumberVotes(mike, 1), "number votes should be correct");
      Helper.assertEqual(0, await kyberDao.getNumberVotes(loi, 1), "number votes should be correct");

      // Check: victor has no delegated stake, has stake but already delegated to mike
      // => no data changes here
      let tx = await kyberDao.vote(1, 1, {from: victor});
      let gasUsed = new BN(tx.receipt.gasUsed);

      // Victor has delegated to mike, and no one delegated to him
      // So his vote wont increase points or vote counts
      let epochPoints = new BN(0);
      let campPoints = new BN(0);
      let optionPoint1 = new BN(0);

      Helper.assertEqual(epochPoints, await kyberDao.getTotalEpochPoints(1), "total epoch points should be correct");
      campPointsData = await kyberDao.getCampaignVoteCountData(1);
      Helper.assertEqual(campPoints, campPointsData[1], "camp total points should be correct");
      Helper.assertEqual(optionPoint1, campPointsData[0][0], "option voted count is incorrect");
      Helper.assertEqual(0, campPointsData[0][1], "option voted count is incorrect");
      Helper.assertEqual(0, campPointsData[0][2], "option voted count is incorrect");

      Helper.assertEqual(1, await kyberDao.getNumberVotes(victor, 1), "number votes should be correct");
      Helper.assertEqual(0, await kyberDao.getNumberVotes(mike, 1), "number votes should be correct");
      Helper.assertEqual(0, await kyberDao.getNumberVotes(loi, 1), "number votes should be correct");

      // Check: mike delegated to poolMaster, victor delegated mike
      // data should change based on victor's stake here
      tx = await kyberDao.vote(1, 1, {from: mike});
      gasUsed.iadd(new BN(tx.receipt.gasUsed));

      logInfo("Vote: average gas used with delegation: " + gasUsed.div(new BN(2)).toString(10));

      // victor delegated to mike, mike delegated to poolmaster
      // mike's vote will increase points + vote counts by victor's stake
      epochPoints.iadd(initVictorStake);
      campPoints.iadd(initVictorStake);
      optionPoint1.iadd(initVictorStake);
      let optionPoint2 = new BN(0);

      Helper.assertEqual(epochPoints, await kyberDao.getTotalEpochPoints(1), "total epoch points should be correct");
      campPointsData = await kyberDao.getCampaignVoteCountData(1);
      Helper.assertEqual(campPoints, campPointsData[1], "camp total points should be correct");
      Helper.assertEqual(optionPoint1, campPointsData[0][0], "option voted count is incorrect");
      Helper.assertEqual(optionPoint2, campPointsData[0][1], "option voted count is incorrect");
      Helper.assertEqual(0, campPointsData[0][2], "option voted count is incorrect");

      Helper.assertEqual(1, await kyberDao.getNumberVotes(victor, 1), "number votes should be correct");
      Helper.assertEqual(1, await kyberDao.getNumberVotes(mike, 1), "number votes should be correct");
      Helper.assertEqual(0, await kyberDao.getNumberVotes(loi, 1), "number votes should be correct");

      // Check: vote from someone has stake, no delegated stake, no representative
      await kyberDao.vote(1, 1, {from: loi});

      epochPoints.iadd(initLoiStake);
      campPoints.iadd(initLoiStake);
      optionPoint1.iadd(initLoiStake);

      Helper.assertEqual(epochPoints, await kyberDao.getTotalEpochPoints(1), "total epoch points should be correct");
      campPointsData = await kyberDao.getCampaignVoteCountData(1);
      Helper.assertEqual(campPoints, campPointsData[1], "camp total points should be correct");
      Helper.assertEqual(optionPoint1, campPointsData[0][0], "option voted count is incorrect");
      Helper.assertEqual(optionPoint2, campPointsData[0][1], "option voted count is incorrect");
      Helper.assertEqual(0, campPointsData[0][2], "option voted count is incorrect");

      Helper.assertEqual(1, await kyberDao.getNumberVotes(victor, 1), "number votes should be correct");
      Helper.assertEqual(1, await kyberDao.getNumberVotes(mike, 1), "number votes should be correct");
      Helper.assertEqual(1, await kyberDao.getNumberVotes(loi, 1), "number votes should be correct");

      // Check: withdraw from staker with no representative
      await stakingContract.withdraw(mulPrecision(100), {from: loi});

      epochPoints.isub(mulPrecision(100));
      campPoints.isub(mulPrecision(100));
      optionPoint1.isub(mulPrecision(100));

      Helper.assertEqual(epochPoints, await kyberDao.getTotalEpochPoints(1), "total epoch points should be correct");
      campPointsData = await kyberDao.getCampaignVoteCountData(1);
      Helper.assertEqual(campPoints, campPointsData[1], "camp total points should be correct");
      Helper.assertEqual(optionPoint1, campPointsData[0][0], "option voted count is incorrect");
      Helper.assertEqual(optionPoint2, campPointsData[0][1], "option voted count is incorrect");
      Helper.assertEqual(0, campPointsData[0][2], "option voted count is incorrect");

      Helper.assertEqual(1, await kyberDao.getNumberVotes(victor, 1), "number votes should be correct");
      Helper.assertEqual(1, await kyberDao.getNumberVotes(mike, 1), "number votes should be correct");
      Helper.assertEqual(1, await kyberDao.getNumberVotes(loi, 1), "number votes should be correct");

      // Check: vote from someone with no stake, but has delegated stake
      await kyberDao.vote(1, 2, {from: poolMaster});

      epochPoints.iadd(initMikeStake);
      campPoints.iadd(initMikeStake);
      optionPoint2.iadd(initMikeStake);

      Helper.assertEqual(epochPoints, await kyberDao.getTotalEpochPoints(1), "total epoch points should be correct");
      campPointsData = await kyberDao.getCampaignVoteCountData(1);
      Helper.assertEqual(campPoints, campPointsData[1], "camp total points should be correct");
      Helper.assertEqual(optionPoint1, campPointsData[0][0], "option voted count is incorrect");
      Helper.assertEqual(optionPoint2, campPointsData[0][1], "option voted count is incorrect");

      Helper.assertEqual(1, await kyberDao.getNumberVotes(victor, 1), "number votes should be correct");
      Helper.assertEqual(1, await kyberDao.getNumberVotes(mike, 1), "number votes should be correct");
      Helper.assertEqual(1, await kyberDao.getNumberVotes(poolMaster, 1), "number votes should be correct");
      Helper.assertEqual(1, await kyberDao.getNumberVotes(loi, 1), "number votes should be correct");

      // Check: new delegate + deposit won't affect current data
      await stakingContract.deposit(mulPrecision(100), {from: mike});
      await stakingContract.deposit(mulPrecision(100), {from: victor});
      await stakingContract.deposit(mulPrecision(100), {from: loi});
      await stakingContract.delegate(poolMaster, {from: loi});
      await stakingContract.delegate(poolMaster, {from: victor});
      await stakingContract.delegate(mike, {from: mike});

      let initPoolMasterStake = mulPrecision(100);
      await stakingContract.deposit(initPoolMasterStake, {from: poolMaster});

      // data shouldn't be changed
      Helper.assertEqual(epochPoints, await kyberDao.getTotalEpochPoints(1), "total epoch points should be correct");
      campPointsData = await kyberDao.getCampaignVoteCountData(1);
      Helper.assertEqual(campPoints, campPointsData[1], "camp total points should be correct");
      Helper.assertEqual(optionPoint1, campPointsData[0][0], "option voted count is incorrect");
      Helper.assertEqual(optionPoint2, campPointsData[0][1], "option voted count is incorrect");

      Helper.assertEqual(1, await kyberDao.getNumberVotes(victor, 1), "number votes should be correct");
      Helper.assertEqual(1, await kyberDao.getNumberVotes(mike, 1), "number votes should be correct");
      Helper.assertEqual(1, await kyberDao.getNumberVotes(loi, 1), "number votes should be correct");

      await updateCurrentBlockAndTimestamp();
      await submitNewCampaignAndDelayToStart(kyberDao,
        2, currentBlock + 2, currentBlock + 2 + minCampPeriod,
        0, 0, 0, [25, 50], '0x', {from: daoOperator}
      );

      // Check: vote for second camp
      await kyberDao.vote(2, 1, {from: mike});

      epochPoints.iadd(initVictorStake);
      let campPoints2 = new BN(0).add(initVictorStake);
      let optionPoint21 = new BN(0).add(initVictorStake);

      Helper.assertEqual(epochPoints, await kyberDao.getTotalEpochPoints(1), "total epoch points should be correct");
      campPointsData = await kyberDao.getCampaignVoteCountData(1);
      Helper.assertEqual(campPoints, campPointsData[1], "camp total points should be correct");
      Helper.assertEqual(optionPoint1, campPointsData[0][0], "option voted count is incorrect");
      Helper.assertEqual(optionPoint2, campPointsData[0][1], "option voted count is incorrect");

      campPointsData = await kyberDao.getCampaignVoteCountData(2);
      Helper.assertEqual(campPoints2, campPointsData[1], "camp total points should be correct");
      Helper.assertEqual(optionPoint21, campPointsData[0][0], "option voted count is incorrect");

      Helper.assertEqual(2, await kyberDao.getNumberVotes(mike, 1), "number votes should be correct");
      Helper.assertEqual(1, await kyberDao.getNumberVotes(victor, 1), "number votes should be correct");
      Helper.assertEqual(1, await kyberDao.getNumberVotes(poolMaster, 1), "number votes should be correct");
      Helper.assertEqual(1, await kyberDao.getNumberVotes(loi, 1), "number votes should be correct");

      // Check: withdraw from someone who has delegated
      // victor delegated to mike, so his withdrawal will affect mike's data
      await stakingContract.withdraw(mulPrecision(200), {from: victor});

      // mike voted 2 camps, so points should be changed as expected
      // above victor has deposit 100, so here withdraw 200 the penalty amount only 100
      epochPoints.isub(mulPrecision(100 * 2));
      campPoints.isub(mulPrecision(100));
      optionPoint1.isub(mulPrecision(100));
      campPoints2.isub(mulPrecision(100));
      optionPoint21.isub(mulPrecision(100));

      Helper.assertEqual(epochPoints, await kyberDao.getTotalEpochPoints(1), "total epoch points should be correct");
      campPointsData = await kyberDao.getCampaignVoteCountData(1);
      Helper.assertEqual(campPoints, campPointsData[1], "camp total points should be correct");
      Helper.assertEqual(optionPoint1, campPointsData[0][0], "option voted count is incorrect");
      Helper.assertEqual(optionPoint2, campPointsData[0][1], "option voted count is incorrect");

      campPointsData = await kyberDao.getCampaignVoteCountData(2);
      Helper.assertEqual(campPoints2, campPointsData[1], "camp total points should be correct");
      Helper.assertEqual(optionPoint21, campPointsData[0][0], "option voted count is incorrect");

      // make stakes for each staker are the same as init
      await stakingContract.deposit(mulPrecision(100), {from: victor});
      await stakingContract.withdraw(mulPrecision(100), {from: mike});

      // delay to epoch 2
      await Helper.mineNewBlockAt(daoStartTime + epochPeriod * blockTime);

      // Current data:
      // (mike + poolMaster) (has stake, no delegation)
      // loi + victor (delegated to poolMaster, has stake, no delegated stake)

      await updateCurrentBlockAndTimestamp();
      await submitNewCampaignAndDelayToStart(kyberDao,
        1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
        0, 0, 0, [25, 50, 100], '0x', {from: daoOperator}
      );

      await kyberDao.vote(3, 1, {from: poolMaster});
      await kyberDao.vote(3, 2, {from: mike});

      epochPoints = new BN(0).add(initPoolMasterStake).add(initMikeStake).add(initVictorStake).add(initLoiStake);
      let campPoints3 = new BN(0).add(epochPoints);
      let optionPoints31 = new BN(0).add(initPoolMasterStake).add(initVictorStake).add(initLoiStake);
      let optionPoints32 = new BN(0).add(initMikeStake);

      Helper.assertEqual(epochPoints, await kyberDao.getTotalEpochPoints(2), "total epoch points should be correct");
      campPointsData = await kyberDao.getCampaignVoteCountData(3);
      Helper.assertEqual(campPoints3, campPointsData[1], "camp total points should be correct");
      Helper.assertEqual(optionPoints31, campPointsData[0][0], "option voted count is incorrect");
      Helper.assertEqual(optionPoints32, campPointsData[0][1], "option voted count is incorrect");
      Helper.assertEqual(0, campPointsData[0][2], "option voted count is incorrect");

      Helper.assertEqual(1, await kyberDao.getNumberVotes(mike, 2), "number votes should be correct");
      Helper.assertEqual(1, await kyberDao.getNumberVotes(poolMaster, 2), "number votes should be correct");

      await stakingContract.withdraw(mulPrecision(100), {from: victor});
      await stakingContract.withdraw(mulPrecision(200), {from: loi});
      await stakingContract.withdraw(mulPrecision(50), {from: poolMaster});
      await stakingContract.withdraw(mulPrecision(150), {from: mike});

      epochPoints.isub(mulPrecision(500));
      campPoints3.isub(mulPrecision(500));
      optionPoints31.isub(mulPrecision(350));
      optionPoints32.isub(mulPrecision(150));

      Helper.assertEqual(epochPoints, await kyberDao.getTotalEpochPoints(2), "total epoch points should be correct");
      campPointsData = await kyberDao.getCampaignVoteCountData(3);
      Helper.assertEqual(campPoints3, campPointsData[1], "camp total points should be correct");
      Helper.assertEqual(optionPoints31, campPointsData[0][0], "option voted count is incorrect");
      Helper.assertEqual(optionPoints32, campPointsData[0][1], "option voted count is incorrect");

      await updateCurrentBlockAndTimestamp();
      await submitNewCampaignAndDelayToStart(kyberDao,
        2, currentBlock + 2, currentBlock + 2 + minCampPeriod,
        0, 0, 0, [25, 50, 100], '0x', {from: daoOperator}
      );

      await kyberDao.vote(4, 2, {from: poolMaster});

      let campPoints4 = new BN(0).add(initPoolMasterStake).add(initVictorStake).add(initLoiStake);
      campPoints4.isub(mulPrecision(350));
      let votePoints42 = new BN(0).add(campPoints4);
      epochPoints.iadd(campPoints4);

      Helper.assertEqual(epochPoints, await kyberDao.getTotalEpochPoints(2), "total epoch points should be correct");
      campPointsData = await kyberDao.getCampaignVoteCountData(3);
      Helper.assertEqual(campPoints3, campPointsData[1], "camp total points should be correct");
      Helper.assertEqual(optionPoints31, campPointsData[0][0], "option voted count is incorrect");
      Helper.assertEqual(optionPoints32, campPointsData[0][1], "option voted count is incorrect");

      campPointsData = await kyberDao.getCampaignVoteCountData(4);
      Helper.assertEqual(campPoints4, campPointsData[1], "camp total points should be correct");
      Helper.assertEqual(0, campPointsData[0][0], "option voted count is incorrect");
      Helper.assertEqual(votePoints42, campPointsData[0][1], "option voted count is incorrect");
    });

    it("Test vote should update data correctly when revote - with delegation", async function() {
      await deployContracts(50, currentBlock + 20, 20);
      await setupSimpleStakingData();
      await stakingContract.delegate(mike, {from: victor});
      await stakingContract.delegate(poolMaster, {from: mike});
      await stakingContract.delegate(poolMaster2, {from: loi});

      await Helper.mineNewBlockAt(daoStartTime);

      await updateCurrentBlockAndTimestamp();
      await submitNewCampaign(kyberDao,
        1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
        0, 0, 0, [25, 50, 100], '0x', {from: daoOperator}
      );
      await submitNewCampaignAndDelayToStart(kyberDao,
        2, currentBlock + 3, currentBlock + 3 + minCampPeriod,
        0, 0, 0, [25, 50, 100], '0x', {from: daoOperator}
      );

      await kyberDao.vote(1, 1, {from: victor});
      await kyberDao.vote(1, 2, {from: loi});

      // Nothing changes as victor + loi have delegated to another
      let epochPoints = new BN(0);
      let campPoints1 = new BN(0);
      let optionPoint11 = new BN(0);
      let optionPoint12 = new BN(0);
      let campPoints2 = new BN(0);
      let optionPoint21 = new BN(0);
      let optionPoint22 = new BN(0);

      Helper.assertEqual(epochPoints, await kyberDao.getTotalEpochPoints(1), "total epoch points should be correct");
      let campPointsData = await kyberDao.getCampaignVoteCountData(1);
      Helper.assertEqual(campPoints1, campPointsData[1], "camp total points should be correct");
      Helper.assertEqual(optionPoint11, campPointsData[0][0], "option voted count is incorrect");
      Helper.assertEqual(optionPoint12, campPointsData[0][1], "option voted count is incorrect");

      campPointsData = await kyberDao.getCampaignVoteCountData(2);
      Helper.assertEqual(campPoints2, campPointsData[1], "camp total points should be correct");
      Helper.assertEqual(optionPoint21, campPointsData[0][0], "option voted count is incorrect");
      Helper.assertEqual(optionPoint22, campPointsData[0][1], "option voted count is incorrect");

      Helper.assertEqual(1, await kyberDao.getNumberVotes(victor, 1), "number votes should be correct");
      Helper.assertEqual(0, await kyberDao.getNumberVotes(mike, 1), "number votes should be correct");
      Helper.assertEqual(1, await kyberDao.getNumberVotes(loi, 1), "number votes should be correct");
      Helper.assertEqual(0, await kyberDao.getNumberVotes(poolMaster2, 1), "number votes should be correct");

      let tx = await kyberDao.vote(1, 1, {from: poolMaster});
      logInfo("Vote: init 1 epoch - with delegated stake, no stake, gas used: " + tx.receipt.gasUsed);
      await kyberDao.vote(2, 1, {from: poolMaster});

      epochPoints.iadd(initMikeStake).iadd(initMikeStake);
      campPoints1.iadd(initMikeStake);
      optionPoint11.iadd(initMikeStake);
      campPoints2.iadd(initMikeStake);
      optionPoint21.iadd(initMikeStake);

      tx = await kyberDao.vote(1, 2, {from: poolMaster2});
      logInfo("Vote: init 1 epoch - with both delegated stake + stake, gas used: " + tx.receipt.gasUsed);

      epochPoints.iadd(initPoolMaster2Stake).iadd(initLoiStake);
      campPoints1.iadd(initPoolMaster2Stake).iadd(initLoiStake);
      optionPoint12.iadd(initPoolMaster2Stake).iadd(initLoiStake);

      Helper.assertEqual(1, await kyberDao.getNumberVotes(poolMaster2, 1), "number votes should be correct");
      Helper.assertEqual(epochPoints, await kyberDao.getTotalEpochPoints(1), "total epoch points should be correct");
      campPointsData = await kyberDao.getCampaignVoteCountData(1);
      Helper.assertEqual(campPoints1, campPointsData[1], "camp total points should be correct");
      Helper.assertEqual(optionPoint11, campPointsData[0][0], "option voted count is incorrect");
      Helper.assertEqual(optionPoint12, campPointsData[0][1], "option voted count is incorrect");

      campPointsData = await kyberDao.getCampaignVoteCountData(2);
      Helper.assertEqual(campPoints2, campPointsData[1], "camp total points should be correct");
      Helper.assertEqual(optionPoint21, campPointsData[0][0], "option voted count is incorrect");
      Helper.assertEqual(optionPoint22, campPointsData[0][1], "option voted count is incorrect");

      // Revote
      await kyberDao.vote(1, 1, {from: poolMaster2});

      optionPoint12.isub(initPoolMaster2Stake).isub(initLoiStake);
      optionPoint11.iadd(initPoolMaster2Stake).iadd(initLoiStake);

      Helper.assertEqual(epochPoints, await kyberDao.getTotalEpochPoints(1), "total epoch points should be correct");
      campPointsData = await kyberDao.getCampaignVoteCountData(1);
      Helper.assertEqual(campPoints1, campPointsData[1], "camp total points should be correct");
      Helper.assertEqual(optionPoint11, campPointsData[0][0], "option voted count is incorrect");
      Helper.assertEqual(optionPoint12, campPointsData[0][1], "option voted count is incorrect");

      // Revote
      await kyberDao.vote(2, 2, {from: poolMaster});

      optionPoint21.isub(initMikeStake);
      optionPoint22.iadd(initMikeStake);

      Helper.assertEqual(epochPoints, await kyberDao.getTotalEpochPoints(1), "total epoch points should be correct");

      campPointsData = await kyberDao.getCampaignVoteCountData(2);
      Helper.assertEqual(campPoints2, campPointsData[1], "camp total points should be correct");
      Helper.assertEqual(optionPoint21, campPointsData[0][0], "option voted count is incorrect");
      Helper.assertEqual(optionPoint22, campPointsData[0][1], "option voted count is incorrect");

      // Revote back to older option
      await kyberDao.vote(1, 2, {from: poolMaster2});

      optionPoint11.isub(initPoolMaster2Stake).isub(initLoiStake);
      optionPoint12.iadd(initPoolMaster2Stake).iadd(initLoiStake);

      Helper.assertEqual(epochPoints, await kyberDao.getTotalEpochPoints(1), "total epoch points should be correct");
      campPointsData = await kyberDao.getCampaignVoteCountData(1);
      Helper.assertEqual(campPoints1, campPointsData[1], "camp total points should be correct");
      Helper.assertEqual(optionPoint11, campPointsData[0][0], "option voted count is incorrect");
      Helper.assertEqual(optionPoint12, campPointsData[0][1], "option voted count is incorrect");

      // Revote the same previous option
      await kyberDao.vote(1, 2, {from: poolMaster2});
      await kyberDao.vote(2, 2, {from: poolMaster});

      Helper.assertEqual(epochPoints, await kyberDao.getTotalEpochPoints(1), "total epoch points should be correct");
      campPointsData = await kyberDao.getCampaignVoteCountData(1);
      Helper.assertEqual(campPoints1, campPointsData[1], "camp total points should be correct");
      Helper.assertEqual(optionPoint11, campPointsData[0][0], "option voted count is incorrect");
      Helper.assertEqual(optionPoint12, campPointsData[0][1], "option voted count is incorrect");

      campPointsData = await kyberDao.getCampaignVoteCountData(2);
      Helper.assertEqual(campPoints2, campPointsData[1], "camp total points should be correct");
      Helper.assertEqual(optionPoint21, campPointsData[0][0], "option voted count is incorrect");
      Helper.assertEqual(optionPoint22, campPointsData[0][1], "option voted count is incorrect");
    });

    it("Test vote after few epochs not doing anything", async function() {
      await deployContracts(50, currentBlock + 20, 20);
      await setupSimpleStakingData();
      await stakingContract.delegate(poolMaster, {from: victor});
      await stakingContract.delegate(poolMaster2, {from: loi});

      // delay to epoch 4
      await Helper.mineNewBlockAt(daoStartTime + blocksToSeconds(3 * epochPeriod));

      await updateCurrentBlockAndTimestamp();
      await submitNewCampaign(kyberDao,
        1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
        0, 0, 0, [25, 50, 100], '0x', {from: daoOperator}
      );
      await submitNewCampaignAndDelayToStart(kyberDao,
        2, currentBlock + 3, currentBlock + 3 + minCampPeriod,
        0, 0, 0, [25, 50, 100], '0x', {from: daoOperator}
      );

      let epochPoints = new BN(0);
      let campPoints1 = new BN(0);
      let optionPoint11 = new BN(0);
      let optionPoint12 = new BN(0);
      let campPoints2 = new BN(0);
      let optionPoint21 = new BN(0);
      let optionPoint22 = new BN(0);

      // nothing changes since victor+loi have delegated to another
      let tx = await kyberDao.vote(1, 1, {from: victor});
      let gasUsed = new BN(tx.receipt.gasUsed);
      tx = await kyberDao.vote(1, 2, {from: loi});
      gasUsed.iadd(new BN(tx.receipt.gasUsed));
      tx = await kyberDao.vote(1, 1, {from: mike});
      gasUsed.iadd(new BN(tx.receipt.gasUsed));
      logInfo("Vote: init data for 2 epoches, average gas used: " + gasUsed.div(new BN(3)).toString(10));

      epochPoints.iadd(initMikeStake);
      campPoints1.iadd(initMikeStake);
      optionPoint11.iadd(initMikeStake);
      await kyberDao.vote(2, 2, {from: mike});
      epochPoints.iadd(initMikeStake);
      campPoints2.iadd(initMikeStake);
      optionPoint22.iadd(initMikeStake);
      await kyberDao.vote(1, 2, {from: poolMaster});
      epochPoints.iadd(initVictorStake);
      campPoints1.iadd(initVictorStake);
      optionPoint12.iadd(initVictorStake);
      await kyberDao.vote(2, 1, {from: poolMaster2});
      epochPoints.iadd(initLoiStake).iadd(initPoolMaster2Stake);
      campPoints2.iadd(initLoiStake).iadd(initPoolMaster2Stake);
      optionPoint21.iadd(initLoiStake).iadd(initPoolMaster2Stake);

      Helper.assertEqual(1, await kyberDao.getNumberVotes(victor, 4), "number votes should be correct");
      Helper.assertEqual(2, await kyberDao.getNumberVotes(mike, 4), "number votes should be correct");
      Helper.assertEqual(1, await kyberDao.getNumberVotes(loi, 4), "number votes should be correct");
      Helper.assertEqual(1, await kyberDao.getNumberVotes(poolMaster2, 4), "number votes should be correct");
      Helper.assertEqual(1, await kyberDao.getNumberVotes(poolMaster, 4), "number votes should be correct");

      Helper.assertEqual(epochPoints, await kyberDao.getTotalEpochPoints(4), "total epoch points should be correct");
      let campPointsData = await kyberDao.getCampaignVoteCountData(1);
      Helper.assertEqual(campPoints1, campPointsData[1], "camp total points should be correct");
      Helper.assertEqual(optionPoint11, campPointsData[0][0], "option voted count is incorrect");
      Helper.assertEqual(optionPoint12, campPointsData[0][1], "option voted count is incorrect");

      campPointsData = await kyberDao.getCampaignVoteCountData(2);
      Helper.assertEqual(campPoints2, campPointsData[1], "camp total points should be correct");
      Helper.assertEqual(optionPoint21, campPointsData[0][0], "option voted count is incorrect");
      Helper.assertEqual(optionPoint22, campPointsData[0][1], "option voted count is incorrect");
    });

    it("Test vote before start timestamp", async function() {
      await deployContracts(10, currentBlock + 40, 10);
      await setupSimpleStakingData();
      await stakingContract.delegate(poolMaster, {from: victor});

      await updateCurrentBlockAndTimestamp();
      await submitNewCampaignAndDelayToStart(kyberDao,
        1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
        0, 0, 0, [25, 50, 100], '0x', {from: daoOperator}
      );

      await kyberDao.vote(1, 1, {from: mike});
      await kyberDao.vote(1, 2, {from: victor});
      await kyberDao.vote(1, 3, {from: loi});
      await kyberDao.vote(1, 2, {from: poolMaster});

      Helper.assertEqual(1, await kyberDao.getNumberVotes(victor, 0), "number votes should be correct");
      Helper.assertEqual(1, await kyberDao.getNumberVotes(mike, 0), "number votes should be correct");
      Helper.assertEqual(1, await kyberDao.getNumberVotes(loi, 0), "number votes should be correct");
      Helper.assertEqual(0, await kyberDao.getNumberVotes(poolMaster2, 0), "number votes should be correct");
      Helper.assertEqual(1, await kyberDao.getNumberVotes(poolMaster, 0), "number votes should be correct");

      Helper.assertEqual(0, await kyberDao.getTotalEpochPoints(0), "total epoch points should be correct");
      let campPointsData = await kyberDao.getCampaignVoteCountData(1);
      Helper.assertEqual(0, campPointsData[1], "camp total points should be correct");
      Helper.assertEqual(0, campPointsData[0][0], "option voted count is incorrect");
      Helper.assertEqual(0, campPointsData[0][1], "option voted count is incorrect");
      Helper.assertEqual(0, campPointsData[0][2], "option voted count is incorrect");
    });

    it("Test vote after partial and full withdrawals", async function() {
      await deployContracts(20, currentBlock + 15, 10);
      await setupSimpleStakingData();
      await stakingContract.delegate(poolMaster, {from: victor});
      await stakingContract.delegate(poolMaster2, {from: loi});

      await Helper.mineNewBlockAt(daoStartTime);

      await updateCurrentBlockAndTimestamp();
      await submitNewCampaign(kyberDao,
        1, currentBlock + 3, currentBlock + 3 + minCampPeriod,
        0, 0, 0, [25, 50, 100], '0x', {from: daoOperator}
      );
      await updateCurrentBlockAndTimestamp();
      await submitNewCampaign(kyberDao,
        2, currentBlock + 3, currentBlock + 3 + minCampPeriod,
        0, 0, 0, [25, 50, 100], '0x', {from: daoOperator}
      );

      // partial withdraw
      await stakingContract.withdraw(mulPrecision(100), {from: mike});

      let epochPoints = new BN(0);
      let campPoints1 = new BN(0);
      let optionPoint11 = new BN(0);
      let optionPoint12 = new BN(0);
      let campPoints2 = new BN(0);
      let optionPoint21 = new BN(0);
      let optionPoint23 = new BN(0);

      // delay to start time of campaign
      await Helper.mineNewBlockAt(blockToTimestamp(currentBlock + 3));
      await kyberDao.vote(1, 1, {from: mike});
      epochPoints.iadd(initMikeStake).isub(mulPrecision(100));
      campPoints2.iadd(initMikeStake).isub(mulPrecision(100));
      optionPoint23.iadd(initMikeStake).isub(mulPrecision(100));

      await kyberDao.vote(2, 3, {from: mike});
      epochPoints.iadd(initMikeStake).isub(mulPrecision(100));
      campPoints1.iadd(initMikeStake).isub(mulPrecision(100));
      optionPoint11.iadd(initMikeStake).isub(mulPrecision(100));

      await kyberDao.vote(1, 2, {from: poolMaster});
      epochPoints.iadd(initVictorStake);
      campPoints1.iadd(initVictorStake);
      optionPoint12.iadd(initVictorStake);

      Helper.assertEqual(epochPoints, await kyberDao.getTotalEpochPoints(1), "total epoch points should be correct");
      let campPointsData = await kyberDao.getCampaignVoteCountData(1);
      Helper.assertEqual(campPoints1, campPointsData[1], "camp total points should be correct");
      Helper.assertEqual(optionPoint11, campPointsData[0][0], "option voted count is incorrect");
      Helper.assertEqual(optionPoint12, campPointsData[0][1], "option voted count is incorrect");

      campPointsData = await kyberDao.getCampaignVoteCountData(2);
      Helper.assertEqual(campPoints2, campPointsData[1], "camp total points should be correct");
      Helper.assertEqual(optionPoint21, campPointsData[0][0], "option voted count is incorrect");
      Helper.assertEqual(optionPoint23, campPointsData[0][2], "option voted count is incorrect");

      // full withdraw
      await stakingContract.withdraw(initVictorStake, {from: victor});
      epochPoints.isub(initVictorStake);
      campPoints1.isub(initVictorStake);
      optionPoint12.isub(initVictorStake);

      Helper.assertEqual(epochPoints, await kyberDao.getTotalEpochPoints(1), "total epoch points should be correct");
      campPointsData = await kyberDao.getCampaignVoteCountData(1);
      Helper.assertEqual(campPoints1, campPointsData[1], "camp total points should be correct");
      Helper.assertEqual(optionPoint11, campPointsData[0][0], "option voted count is incorrect");
      Helper.assertEqual(optionPoint12, campPointsData[0][1], "option voted count is incorrect");

      await kyberDao.vote(2, 1, {from: poolMaster});

      Helper.assertEqual(epochPoints, await kyberDao.getTotalEpochPoints(1), "total epoch points should be correct");
      campPointsData = await kyberDao.getCampaignVoteCountData(2);
      Helper.assertEqual(campPoints2, campPointsData[1], "camp total points should be correct");
      Helper.assertEqual(optionPoint21, campPointsData[0][0], "option voted count is incorrect");
      Helper.assertEqual(optionPoint23, campPointsData[0][2], "option voted count is incorrect");

    });

    it("Test vote should revert camp is not existed", async function() {
      await deployContracts(4, currentBlock + 20, 3);

      await expectRevert(
        kyberDao.vote(1, 1, {from: mike}),
        "vote: campaign doesn't exist"
      )

      await updateCurrentBlockAndTimestamp();
      await submitNewCampaignAndDelayToStart(kyberDao,
        0, currentBlock + 2, currentBlock + 2 + minCampPeriod,
        0, 0, 0, [25, 50], '0x', {from: daoOperator}
      );

      await expectRevert(
        kyberDao.vote(2, 1, {from: mike}),
        "vote: campaign doesn't exist"
      )

      await kyberDao.vote(1, 1, {from: mike});
    })

    it("Test vote should revert camp has not started or already ended", async function() {
      await deployContracts(4, currentBlock + 20, 5);

      await updateCurrentBlockAndTimestamp();
      await submitNewCampaign(kyberDao,
        0, currentBlock + 5, currentBlock + 5 + minCampPeriod,
        0, 0, 0, [25, 50], '0x', {from: daoOperator}
      );

      // camp not started yet
      await expectRevert(
        kyberDao.vote(1, 1, {from: mike}),
        "vote: campaign not started"
      )

      // delay to start time of campaign
      await Helper.mineNewBlockAt(blockToTimestamp(currentBlock + 5));

      // can note now
      await kyberDao.vote(1, 1, {from: mike});

      await Helper.mineNewBlockAfter(blocksToSeconds(minCampPeriod));

      // camp alread ended
      await expectRevert(
        kyberDao.vote(1, 1, {from: mike}),
        "vote: campaign already ended"
      );
    })

    it("Test vote should revert when voted option is invalid", async function() {
      await deployContracts(4, currentBlock + 20, 8);

      await updateCurrentBlockAndTimestamp();
      await submitNewCampaignAndDelayToStart(kyberDao,
        0, currentBlock + 2, currentBlock + 2 + minCampPeriod,
        0, 0, 0, [25, 50], '0x', {from: daoOperator}
      );

      // can not vote for 0
      await expectRevert(
        kyberDao.vote(1, 0, {from: mike}),
        "vote: option is 0"
      )

      // can not vote for option that is bigger than range
      await expectRevert(
        kyberDao.vote(1, 3, {from: mike}),
        "vote: option is not in range"
      );

      // can note now
      await kyberDao.vote(1, 1, {from: mike});
      await kyberDao.vote(1, 2, {from: mike});
    })
  });

  describe("#Get staker percentage tests", () => {
    const verifyCurrentEpochStakerRewardPercentages = async function(stakers, expectedPercentages) {
      for(let i = 0; i < stakers.length; i++) {
        let onChainRewardPercentage = await kyberDao.getCurrentEpochRewardPercentageInPrecision(stakers[i]);
        Helper.assertEqual(expectedPercentages[i], onChainRewardPercentage, "reward percentage is wrong");
      }
    }

    const verifyPastEpochtStakerRewardPercentages = async function(stakers, expectedPercentages, epoch) {
      for(let i = 0; i < stakers.length; i++) {
        let onChainRewardPercentage = await kyberDao.getPastEpochRewardPercentageInPrecision(stakers[i], epoch);
        Helper.assertEqual(expectedPercentages[i], onChainRewardPercentage, "reward percentage is wrong");
      }
    }

    it("Test get staker reward percentage - without delegation", async function() {
      await deployContracts(20, currentBlock + 15, 10);
      await setupSimpleStakingData();

      await Helper.mineNewBlockAt(daoStartTime);

      await updateCurrentBlockAndTimestamp();
      await submitNewCampaign(kyberDao,
        0, currentBlock + 2, currentBlock + 2 + minCampPeriod,
        0, 0, 0, [25, 50], '0x', {from: daoOperator}
      );
      await submitNewCampaignAndDelayToStart(kyberDao,
        0, currentBlock + 3, currentBlock + 3 + minCampPeriod,
        0, 0, 0, [25, 50], '0x', {from: daoOperator}
      );

      let totalEpochPoints = new BN(0);
      let mikePoints = new BN(0);
      let victorPoints = new BN(0);
      let loiPoints = new BN(0);

      await kyberDao.vote(1, 1, {from: mike});
      await kyberDao.vote(1, 2, {from: mike});
      mikePoints.iadd(initMikeStake);
      totalEpochPoints.iadd(initMikeStake);
      await kyberDao.vote(2, 1, {from: mike});
      await kyberDao.vote(2, 1, {from: mike});
      mikePoints.iadd(initMikeStake);
      totalEpochPoints.iadd(initMikeStake);
      await kyberDao.vote(1, 1, {from: victor});
      totalEpochPoints.iadd(initVictorStake);
      victorPoints.iadd(initVictorStake);
      await kyberDao.vote(1, 1, {from: loi});
      totalEpochPoints.iadd(initLoiStake);
      loiPoints.iadd(initLoiStake);

      await kyberDao.vote(1, 1, {from: victor});
      await kyberDao.vote(1, 1, {from: loi});

      let mikePer = mikePoints.mul(precisionUnits).div(totalEpochPoints);
      let loiPer = loiPoints.mul(precisionUnits).div(totalEpochPoints);
      let victorPer = victorPoints.mul(precisionUnits).div(totalEpochPoints);

      await verifyCurrentEpochStakerRewardPercentages(
        [mike, loi, victor, poolMaster],
        [mikePer, loiPer, victorPer, 0]
      );

      // should return all 0
      await verifyPastEpochtStakerRewardPercentages(
        [mike, loi, victor, poolMaster], // stakers
        [0, 0, 0, 0], // expected reward percentages
        1 // epoch
      )

      await Helper.mineNewBlockAt(blocksToSeconds(epochPeriod) + daoStartTime);

      await verifyPastEpochtStakerRewardPercentages(
        [mike, loi, victor, poolMaster],
        [mikePer, loiPer, victorPer, 0],
        1
      )
    });

    it("Test get staker reward percentage - with delegation", async function() {
      await deployContracts(20, currentBlock + 15, 10);
      await setupSimpleStakingData();
      // no stake, but has delegated stake
      await stakingContract.delegate(poolMaster, {from: victor});
      // has both stake + delegated stake
      await stakingContract.delegate(poolMaster2, {from: loi});

      await Helper.mineNewBlockAt(daoStartTime);

      await updateCurrentBlockAndTimestamp();
      await submitNewCampaign(kyberDao,
        0, currentBlock + 2, currentBlock + 2 + minCampPeriod,
        0, 0, 0, [25, 50], '0x', {from: daoOperator}
      );
      await submitNewCampaignAndDelayToStart(kyberDao,
        0, currentBlock + 3, currentBlock + 3 + minCampPeriod,
        0, 0, 0, [25, 50], '0x', {from: daoOperator}
      );

      let totalEpochPoints = new BN(0);
      let mikePoints = new BN(0);
      let poolMasterPoints = new BN(0);
      let poolMaster2Points = new BN(0);

      await kyberDao.vote(1, 1, {from: mike});
      await kyberDao.vote(1, 2, {from: mike});
      mikePoints.iadd(initMikeStake);
      totalEpochPoints.iadd(initMikeStake);
      await kyberDao.vote(2, 1, {from: mike});
      await kyberDao.vote(2, 1, {from: mike});
      mikePoints.iadd(initMikeStake);
      totalEpochPoints.iadd(initMikeStake);
      await kyberDao.vote(1, 1, {from: poolMaster});
      totalEpochPoints.iadd(initVictorStake);
      poolMasterPoints.iadd(initVictorStake);
      await kyberDao.vote(1, 1, {from: poolMaster2});
      totalEpochPoints.iadd(initLoiStake).iadd(initPoolMaster2Stake);
      poolMaster2Points.iadd(initLoiStake).iadd(initPoolMaster2Stake);

      await kyberDao.vote(1, 1, {from: victor});
      await kyberDao.vote(1, 1, {from: loi});

      let mikePer = mikePoints.mul(precisionUnits).div(totalEpochPoints);
      let poolMasterPer = poolMasterPoints.mul(precisionUnits).div(totalEpochPoints);
      let poolMaster2Per = poolMaster2Points.mul(precisionUnits).div(totalEpochPoints);

      await verifyCurrentEpochStakerRewardPercentages(
        [mike, poolMaster, poolMaster2, victor, loi],
        [mikePer, poolMasterPer, poolMaster2Per, 0, 0]
      )

      // should return all 0
      await verifyPastEpochtStakerRewardPercentages(
        [mike, poolMaster, poolMaster2, victor, loi],
        [0, 0, 0, 0, 0],
        1
      )

      // advance one block and test past epoch data
      await Helper.mineNewBlockAt(blocksToSeconds(epochPeriod) + daoStartTime);

      await verifyPastEpochtStakerRewardPercentages(
        [mike, poolMaster, poolMaster2, victor, loi],
        [mikePer, poolMasterPer, poolMaster2Per, 0, 0],
        1
      )
    });

    it("Test get staker percentage after few epochs", async function() {
      await deployContracts(10, currentBlock + 15, 5);
      await setupSimpleStakingData();
      await stakingContract.delegate(poolMaster, {from: loi});
      await stakingContract.delegate(poolMaster2, {from: victor});

      await Helper.mineNewBlockAt(daoStartTime);

      await updateCurrentBlockAndTimestamp();
      await submitNewCampaignAndDelayToStart(kyberDao,
        0, currentBlock + 2, currentBlock + 2 + minCampPeriod,
        0, 0, 0, [25, 50], '0x', {from: daoOperator}
      );

      let totalEpochPoints = new BN(0);
      let mikePoints = new BN(0);
      let poolMasterPoints = new BN(0);
      let poolMaster2Points = new BN(0);

      await kyberDao.vote(1, 1, {from: mike});
      totalEpochPoints.iadd(initMikeStake);
      mikePoints.iadd(initMikeStake);
      await kyberDao.vote(1, 2, {from: poolMaster});
      totalEpochPoints.iadd(initLoiStake);
      poolMasterPoints.iadd(initLoiStake);
      await kyberDao.vote(1, 1, {from: poolMaster2});
      totalEpochPoints.iadd(initVictorStake).iadd(initPoolMaster2Stake);
      poolMaster2Points.iadd(initVictorStake).iadd(initPoolMaster2Stake);

      await kyberDao.vote(1, 1, {from: victor});
      await kyberDao.vote(1, 2, {from: loi});

      // delay few epochs not doing anything
      await Helper.mineNewBlockAt(blocksToSeconds(4 * epochPeriod) + daoStartTime);

      let mikePer = mikePoints.mul(precisionUnits).div(totalEpochPoints);
      let poolMasterPer = poolMasterPoints.mul(precisionUnits).div(totalEpochPoints);
      let poolMaster2Per = poolMaster2Points.mul(precisionUnits).div(totalEpochPoints);

      await verifyPastEpochtStakerRewardPercentages(
        [mike, poolMaster, poolMaster2, victor, loi],
        [mikePer, poolMasterPer, poolMaster2Per, 0, 0],
        1
      )

      // current epoch reward percentages should be all 0, not done anything yet
      await verifyCurrentEpochStakerRewardPercentages(
        [mike, poolMaster, poolMaster2, victor, loi],
        [0, 0, 0, 0, 0]
      )
    });

    it("Test get staker percentage for current and future epochs", async function() {
      await deployContracts(15, currentBlock + 15, 5);
      await setupSimpleStakingData();

      await Helper.mineNewBlockAt(daoStartTime);

      await updateCurrentBlockAndTimestamp();
      await submitNewCampaignAndDelayToStart(kyberDao,
        0, currentBlock + 2, currentBlock + 2 + minCampPeriod,
        0, 0, 0, [25, 50], '0x', {from: daoOperator}
      );

      await kyberDao.vote(1, 1, {from: mike});
      await kyberDao.vote(1, 2, {from: victor});

      // get staker percentage for next and far in the future epochs, return 0
      await verifyPastEpochtStakerRewardPercentages(
        [mike, victor], [0, 0], 2
      )
      await verifyPastEpochtStakerRewardPercentages(
        [mike, victor], [0, 0], 100
      )

      // get staker percentage for current epoch, return 0
      await verifyPastEpochtStakerRewardPercentages(
        [mike, victor],
        [0, 0],
        1
      )
      let mikePercentage = precisionUnits.mul(initMikeStake).div(initMikeStake.add(initVictorStake));
      let victorPercentage = precisionUnits.mul(initVictorStake).div(initMikeStake.add(initVictorStake));
      await verifyCurrentEpochStakerRewardPercentages(
        [mike, victor],
        [mikePercentage, victorPercentage]
      )

      // delay to epoch 2
      await Helper.mineNewBlockAt(blocksToSeconds(epochPeriod) + daoStartTime);
      // verify past epoch data
      await verifyPastEpochtStakerRewardPercentages(
        [mike, victor],
        [mikePercentage, victorPercentage],
        1
      )

      // create campaign and vote in epoch 2
      await updateCurrentBlockAndTimestamp();
      await submitNewCampaignAndDelayToStart(kyberDao,
        0, currentBlock + 2, currentBlock + 2 + minCampPeriod,
        0, 0, 0, [25, 50], '0x', {from: daoOperator}
      );
      await Helper.mineNewBlockAfter(blocksToSeconds(2));
      await kyberDao.vote(2, 1, {from: mike});

      // mike should be 100% reward for current epoch
      await verifyCurrentEpochStakerRewardPercentages(
        [mike, victor],
        [precisionUnits, 0]
      )

      // check staker percentage for past epoch, should be unchanged
      await verifyPastEpochtStakerRewardPercentages(
        [mike, victor],
        [mikePercentage, victorPercentage],
        1
      )
    });

    it("Test get reward percentage after new deposit", async function() {
      await deployContracts(10, currentBlock + 15, 5);
      await setupSimpleStakingData();
      await stakingContract.delegate(poolMaster, {from: loi});
      await stakingContract.delegate(poolMaster2, {from: victor});

      // delay to epoch 1
      await Helper.mineNewBlockAt(daoStartTime);

      await updateCurrentBlockAndTimestamp();
      await submitNewCampaignAndDelayToStart(kyberDao,
        0, currentBlock + 2, currentBlock + 2 + minCampPeriod,
        0, 0, 0, [25, 50], '0x', {from: daoOperator}
      );

      let totalEpochPoints = new BN(0);
      let mikePoints = new BN(0);
      let poolMasterPoints = new BN(0);
      let poolMaster2Points = new BN(0);

      await kyberDao.vote(1, 1, {from: mike});
      totalEpochPoints.iadd(initMikeStake);
      mikePoints.iadd(initMikeStake);
      await kyberDao.vote(1, 2, {from: poolMaster});
      totalEpochPoints.iadd(initLoiStake);
      poolMasterPoints.iadd(initLoiStake);
      await kyberDao.vote(1, 1, {from: poolMaster2});
      totalEpochPoints.iadd(initVictorStake).iadd(initPoolMaster2Stake);
      poolMaster2Points.iadd(initVictorStake).iadd(initPoolMaster2Stake);

      await stakingContract.deposit(mulPrecision(10), {from: mike});
      await stakingContract.deposit(mulPrecision(20), {from: victor});
      await stakingContract.deposit(mulPrecision(30), {from: loi});
      await stakingContract.deposit(mulPrecision(40), {from: poolMaster});
      await stakingContract.deposit(mulPrecision(50), {from: poolMaster2});

      let mikePer = mikePoints.mul(precisionUnits).div(totalEpochPoints);
      let poolMasterPer = poolMasterPoints.mul(precisionUnits).div(totalEpochPoints);
      let poolMaster2Per = poolMaster2Points.mul(precisionUnits).div(totalEpochPoints);

      // percentage no change after new deposit
      await verifyCurrentEpochStakerRewardPercentages(
        [mike, poolMaster, poolMaster2, victor, loi],
        [mikePer, poolMasterPer, poolMaster2Per, 0, 0]
      )
      // delay one epoch and verify past epoch data
      let currentEpoch = await kyberDao.getCurrentEpochNumber();
      await Helper.mineNewBlockAfter(blocksToSeconds(epochPeriod));
      await verifyPastEpochtStakerRewardPercentages(
        [mike, poolMaster, poolMaster2, victor, loi],
        [mikePer, poolMasterPer, poolMaster2Per, 0, 0],
        currentEpoch
      )
    });

    it("Test get reward percentage after new delegation", async function() {
      await deployContracts(10, currentBlock + 15, 5);
      await setupSimpleStakingData();
      await stakingContract.delegate(poolMaster, {from: loi});
      await stakingContract.delegate(poolMaster2, {from: victor});

      // delay to epoch 1
      await Helper.mineNewBlockAt(daoStartTime);

      await updateCurrentBlockAndTimestamp();
      await submitNewCampaignAndDelayToStart(kyberDao,
        0, currentBlock + 2, currentBlock + 2 + minCampPeriod,
        0, 0, 0, [25, 50], '0x', {from: daoOperator}
      );

      let totalEpochPoints = new BN(0);
      let mikePoints = new BN(0);
      let poolMasterPoints = new BN(0);
      let poolMaster2Points = new BN(0);

      await kyberDao.vote(1, 1, {from: mike});
      totalEpochPoints.iadd(initMikeStake);
      mikePoints.iadd(initMikeStake);
      await kyberDao.vote(1, 2, {from: poolMaster});
      totalEpochPoints.iadd(initLoiStake);
      poolMasterPoints.iadd(initLoiStake);
      await kyberDao.vote(1, 1, {from: poolMaster2});
      totalEpochPoints.iadd(initVictorStake).iadd(initPoolMaster2Stake);
      poolMaster2Points.iadd(initVictorStake).iadd(initPoolMaster2Stake);

      await stakingContract.delegate(mike, {from: victor});
      await stakingContract.delegate(victor, {from: loi});
      await stakingContract.delegate(poolMaster, {from: poolMaster2});

      let mikePer = mikePoints.mul(precisionUnits).div(totalEpochPoints);
      let poolMasterPer = poolMasterPoints.mul(precisionUnits).div(totalEpochPoints);
      let poolMaster2Per = poolMaster2Points.mul(precisionUnits).div(totalEpochPoints);

      // percentage no change after new deposit
      await verifyCurrentEpochStakerRewardPercentages(
        [mike, poolMaster, poolMaster2, victor, loi],
        [mikePer, poolMasterPer, poolMaster2Per, 0, 0]
      )
      // delay one epoch and verify past epoch data
      let currentEpoch = await kyberDao.getCurrentEpochNumber();
      await Helper.mineNewBlockAfter(blocksToSeconds(epochPeriod));
      await verifyPastEpochtStakerRewardPercentages(
        [mike, poolMaster, poolMaster2, victor, loi],
        [mikePer, poolMasterPer, poolMaster2Per, 0, 0],
        currentEpoch
      )
    });

    it("Test get reward percentage after revote", async function() {
      await deployContracts(10, currentBlock + 15, 5);
      await setupSimpleStakingData();
      await stakingContract.delegate(poolMaster, {from: loi});
      await stakingContract.delegate(poolMaster2, {from: victor});

      // delay to epoch 1
      await Helper.mineNewBlockAt(daoStartTime);

      await updateCurrentBlockAndTimestamp();
      await submitNewCampaignAndDelayToStart(kyberDao,
        0, currentBlock + 2, currentBlock + 2 + minCampPeriod,
        0, 0, 0, [25, 50], '0x', {from: daoOperator}
      );

      let totalEpochPoints = new BN(0);
      let mikePoints = new BN(0);
      let poolMasterPoints = new BN(0);
      let poolMaster2Points = new BN(0);

      await kyberDao.vote(1, 1, {from: mike});
      totalEpochPoints.iadd(initMikeStake);
      mikePoints.iadd(initMikeStake);
      await kyberDao.vote(1, 2, {from: poolMaster});
      totalEpochPoints.iadd(initLoiStake);
      poolMasterPoints.iadd(initLoiStake);
      await kyberDao.vote(1, 1, {from: poolMaster2});
      totalEpochPoints.iadd(initVictorStake).iadd(initPoolMaster2Stake);
      poolMaster2Points.iadd(initVictorStake).iadd(initPoolMaster2Stake);

      let mikePer = mikePoints.mul(precisionUnits).div(totalEpochPoints);
      let poolMasterPer = poolMasterPoints.mul(precisionUnits).div(totalEpochPoints);
      let poolMaster2Per = poolMaster2Points.mul(precisionUnits).div(totalEpochPoints);

      // percentage no change after new deposit
      await verifyCurrentEpochStakerRewardPercentages(
        [mike, poolMaster, poolMaster2, victor, loi],
        [mikePer, poolMasterPer, poolMaster2Per, 0, 0]
      )

      // revote different option
      await kyberDao.vote(1, 2, {from: mike});
      // revote same option
      await kyberDao.vote(1, 2, {from: poolMaster});

      // percentage no change after revoted
      await verifyCurrentEpochStakerRewardPercentages(
        [mike, poolMaster, poolMaster2, victor, loi],
        [mikePer, poolMasterPer, poolMaster2Per, 0, 0]
      )
      // delay one epoch and verify past epoch data
      let currentEpoch = await kyberDao.getCurrentEpochNumber();
      await Helper.mineNewBlockAfter(blocksToSeconds(epochPeriod));
      await verifyPastEpochtStakerRewardPercentages(
        [mike, poolMaster, poolMaster2, victor, loi],
        [mikePer, poolMasterPer, poolMaster2Per, 0, 0],
        currentEpoch
      )
    });

    it("Test get reward percentage after new withdraw", async function() {
      await deployContracts(10, currentBlock + 15, 5);
      await setupSimpleStakingData();
      await stakingContract.delegate(poolMaster, {from: loi});
      await stakingContract.delegate(poolMaster2, {from: victor});

      // delay to epoch 1
      await Helper.mineNewBlockAt(daoStartTime);

      await updateCurrentBlockAndTimestamp();
      await submitNewCampaignAndDelayToStart(kyberDao,
        0, currentBlock + 2, currentBlock + 2 + minCampPeriod,
        0, 0, 0, [25, 50], '0x', {from: daoOperator}
      );

      let totalEpochPoints = new BN(0);
      let mikePoints = new BN(0);
      let poolMasterPoints = new BN(0);
      let poolMaster2Points = new BN(0);

      await kyberDao.vote(1, 1, {from: mike});
      totalEpochPoints.iadd(initMikeStake);
      mikePoints.iadd(initMikeStake);
      await kyberDao.vote(1, 2, {from: poolMaster});
      totalEpochPoints.iadd(initLoiStake);
      poolMasterPoints.iadd(initLoiStake);
      await kyberDao.vote(1, 1, {from: poolMaster2});
      totalEpochPoints.iadd(initVictorStake).iadd(initPoolMaster2Stake);
      poolMaster2Points.iadd(initVictorStake).iadd(initPoolMaster2Stake);

      let mikePer = mikePoints.mul(precisionUnits).div(totalEpochPoints);
      let poolMasterPer = poolMasterPoints.mul(precisionUnits).div(totalEpochPoints);
      let poolMaster2Per = poolMaster2Points.mul(precisionUnits).div(totalEpochPoints);

      // percentage no change after new deposit
      await verifyCurrentEpochStakerRewardPercentages(
        [mike, poolMaster, poolMaster2, victor, loi],
        [mikePer, poolMasterPer, poolMaster2Per, 0, 0]
      )

      await stakingContract.withdraw(mulPrecision(100), {from: mike});
      await stakingContract.withdraw(mulPrecision(110), {from: victor});
      await stakingContract.withdraw(mulPrecision(120), {from: loi});
      await stakingContract.withdraw(mulPrecision(50), {from: poolMaster2});

      totalEpochPoints.isub(mulPrecision(100 + 110 + 120 + 50));
      mikePoints.isub(mulPrecision(100)); // mike's withdraw
      poolMasterPoints.isub(mulPrecision(120)); // loi's withdraw
      poolMaster2Points.isub(mulPrecision(110 + 50)); // victor + poolmaster2 withdraw

      mikePer = mikePoints.mul(precisionUnits).div(totalEpochPoints);
      poolMasterPer = poolMasterPoints.mul(precisionUnits).div(totalEpochPoints);
      poolMaster2Per = poolMaster2Points.mul(precisionUnits).div(totalEpochPoints);

      await verifyCurrentEpochStakerRewardPercentages(
        [mike, poolMaster, poolMaster2, victor, loi],
        [mikePer, poolMasterPer, poolMaster2Per, 0, 0]
      )
      // delay one epoch and verify past epoch data
      let currentEpoch = await kyberDao.getCurrentEpochNumber();
      await Helper.mineNewBlockAfter(blocksToSeconds(epochPeriod));
      await verifyPastEpochtStakerRewardPercentages(
        [mike, poolMaster, poolMaster2, victor, loi],
        [mikePer, poolMasterPer, poolMaster2Per, 0, 0],
        currentEpoch
      )
    });

    it("Test get reward percentage after deposit and withdraw", async function() {
      await deployContracts(10, currentBlock + 15, 5);
      await setupSimpleStakingData();
      await stakingContract.delegate(poolMaster, {from: loi});
      await stakingContract.delegate(poolMaster2, {from: victor});

      // delay to epoch 1
      await Helper.mineNewBlockAt(daoStartTime);

      await updateCurrentBlockAndTimestamp();
      await submitNewCampaignAndDelayToStart(kyberDao,
        0, currentBlock + 2, currentBlock + 2 + minCampPeriod,
        0, 0, 0, [25, 50], '0x', {from: daoOperator}
      );

      let totalEpochPoints = new BN(0);
      let mikePoints = new BN(0);
      let poolMasterPoints = new BN(0);
      let poolMaster2Points = new BN(0);

      await kyberDao.vote(1, 1, {from: mike});
      totalEpochPoints.iadd(initMikeStake);
      mikePoints.iadd(initMikeStake);
      await kyberDao.vote(1, 2, {from: poolMaster});
      totalEpochPoints.iadd(initLoiStake);
      poolMasterPoints.iadd(initLoiStake);
      await kyberDao.vote(1, 1, {from: poolMaster2});
      totalEpochPoints.iadd(initVictorStake).iadd(initPoolMaster2Stake);
      poolMaster2Points.iadd(initVictorStake).iadd(initPoolMaster2Stake);

      let mikePer = mikePoints.mul(precisionUnits).div(totalEpochPoints);
      let poolMasterPer = poolMasterPoints.mul(precisionUnits).div(totalEpochPoints);
      let poolMaster2Per = poolMaster2Points.mul(precisionUnits).div(totalEpochPoints);

      await verifyCurrentEpochStakerRewardPercentages(
        [mike, poolMaster, poolMaster2, victor, loi],
        [mikePer, poolMasterPer, poolMaster2Per, 0, 0]
      )

      await stakingContract.deposit(mulPrecision(100), {from: mike});
      await stakingContract.deposit(mulPrecision(200), {from: victor});
      await stakingContract.deposit(mulPrecision(300), {from: loi});

      await stakingContract.withdraw(mulPrecision(50), {from: mike});
      await stakingContract.withdraw(mulPrecision(250), {from: victor});
      await stakingContract.withdraw(mulPrecision(250), {from: loi});

      totalEpochPoints.isub(mulPrecision(50));
      poolMaster2Points.isub(mulPrecision(50));

      mikePer = mikePoints.mul(precisionUnits).div(totalEpochPoints);
      poolMasterPer = poolMasterPoints.mul(precisionUnits).div(totalEpochPoints);
      poolMaster2Per = poolMaster2Points.mul(precisionUnits).div(totalEpochPoints);

      await verifyCurrentEpochStakerRewardPercentages(
        [mike, poolMaster, poolMaster2, victor, loi],
        [mikePer, poolMasterPer, poolMaster2Per, 0, 0]
      )
      // delay one epoch and verify past epoch data
      let currentEpoch = await kyberDao.getCurrentEpochNumber();
      await Helper.mineNewBlockAfter(blocksToSeconds(epochPeriod));
      await verifyPastEpochtStakerRewardPercentages(
        [mike, poolMaster, poolMaster2, victor, loi],
        [mikePer, poolMasterPer, poolMaster2Per, 0, 0],
        currentEpoch
      )
    });

    it("Test get reward percentage with multiple campaigns", async function() {
      await deployContracts(50, currentBlock + 15, 20);
      await setupSimpleStakingData();
      await stakingContract.delegate(poolMaster, {from: loi});
      await stakingContract.delegate(poolMaster2, {from: victor});

      // delay to epoch 1
      await Helper.mineNewBlockAt(daoStartTime);

      await updateCurrentBlockAndTimestamp();
      await submitNewCampaign(kyberDao,
        0, currentBlock + 2, currentBlock + 2 + minCampPeriod,
        0, 0, 0, [25, 50], '0x', {from: daoOperator}
      );
      await submitNewCampaign(kyberDao,
        1, currentBlock + 3, currentBlock + 3 + minCampPeriod,
        0, 0, 0, [25, 50], '0x', {from: daoOperator}
      );
      await submitNewCampaignAndDelayToStart(kyberDao,
        2, currentBlock + 4, currentBlock + 4 + minCampPeriod,
        0, 0, 0, [25, 50], '0x', {from: daoOperator}
      );

      let totalEpochPoints = new BN(0);
      let mikePoints = new BN(0);
      let poolMasterPoints = new BN(0);
      let poolMaster2Points = new BN(0);

      await kyberDao.vote(1, 1, {from: mike});
      totalEpochPoints.iadd(initMikeStake);
      mikePoints.iadd(initMikeStake);
      await kyberDao.vote(2, 1, {from: mike});
      totalEpochPoints.iadd(initMikeStake);
      mikePoints.iadd(initMikeStake);
      await kyberDao.vote(1, 2, {from: poolMaster});
      totalEpochPoints.iadd(initLoiStake);
      poolMasterPoints.iadd(initLoiStake);
      await kyberDao.vote(2, 1, {from: poolMaster});
      totalEpochPoints.iadd(initLoiStake);
      poolMasterPoints.iadd(initLoiStake);
      await kyberDao.vote(3, 2, {from: poolMaster});
      totalEpochPoints.iadd(initLoiStake);
      poolMasterPoints.iadd(initLoiStake);
      await kyberDao.vote(1, 1, {from: poolMaster2});
      totalEpochPoints.iadd(initVictorStake).iadd(initPoolMaster2Stake);
      poolMaster2Points.iadd(initVictorStake).iadd(initPoolMaster2Stake);

      let mikePer = mikePoints.mul(precisionUnits).div(totalEpochPoints);
      let poolMasterPer = poolMasterPoints.mul(precisionUnits).div(totalEpochPoints);
      let poolMaster2Per = poolMaster2Points.mul(precisionUnits).div(totalEpochPoints);

      await verifyCurrentEpochStakerRewardPercentages(
        [mike, poolMaster, poolMaster2, victor, loi],
        [mikePer, poolMasterPer, poolMaster2Per, 0, 0]
      )

      // mike voted 2 camps
      await stakingContract.withdraw(mulPrecision(100), {from: mike});
      totalEpochPoints.isub(mulPrecision(100 * 2));
      mikePoints.isub(mulPrecision(100 * 2));

      // loi's representative voted 3 camp
      await stakingContract.withdraw(mulPrecision(150), {from: loi});
      totalEpochPoints.isub(mulPrecision(150 * 3));
      poolMasterPoints.isub(mulPrecision(150 * 3));

      // victor's representative voted 1 camp
      await stakingContract.withdraw(mulPrecision(100), {from: victor});
      await stakingContract.withdraw(mulPrecision(50), {from: poolMaster2});
      totalEpochPoints.isub(mulPrecision(100 + 50));
      poolMaster2Points.isub(mulPrecision(100 + 50));

      mikePer = mikePoints.mul(precisionUnits).div(totalEpochPoints);
      poolMasterPer = poolMasterPoints.mul(precisionUnits).div(totalEpochPoints);
      poolMaster2Per = poolMaster2Points.mul(precisionUnits).div(totalEpochPoints);

      await verifyCurrentEpochStakerRewardPercentages(
        [mike, poolMaster, poolMaster2, victor, loi],
        [mikePer, poolMasterPer, poolMaster2Per, 0, 0]
      )
      // delay one epoch and verify past epoch data
      let currentEpoch = await kyberDao.getCurrentEpochNumber();
      await Helper.mineNewBlockAfter(blocksToSeconds(epochPeriod));
      await verifyPastEpochtStakerRewardPercentages(
        [mike, poolMaster, poolMaster2, victor, loi],
        [mikePer, poolMasterPer, poolMaster2Per, 0, 0],
        currentEpoch
      )
    });

    it("Test get reward percentage after camp has ended", async function() {
      await deployContracts(50, currentBlock + 15, 6);
      await setupSimpleStakingData();
      await stakingContract.delegate(poolMaster, {from: loi});
      await stakingContract.delegate(poolMaster2, {from: victor});

      // delay to epoch 1
      await Helper.mineNewBlockAt(daoStartTime);

      let totalEpochPoints = new BN(0);
      let mikePoints = new BN(0);
      let poolMasterPoints = new BN(0);
      let poolMaster2Points = new BN(0);

      await updateCurrentBlockAndTimestamp();
      await submitNewCampaignAndDelayToStart(kyberDao,
        0, currentBlock + 2, currentBlock + 2 + minCampPeriod,
        0, 0, 0, [25, 50], '0x', {from: daoOperator}
      );

      await kyberDao.vote(1, 1, {from: mike});
      totalEpochPoints.iadd(initMikeStake);
      mikePoints.iadd(initMikeStake);

      await updateCurrentBlockAndTimestamp();
      await submitNewCampaign(kyberDao,
        1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
        0, 0, 0, [25, 50], '0x', {from: daoOperator}
      );
      await submitNewCampaignAndDelayToStart(kyberDao,
        2, currentBlock + 3, currentBlock + 3 + minCampPeriod,
        0, 0, 0, [25, 50], '0x', {from: daoOperator}
      );

      await kyberDao.vote(2, 1, {from: mike});
      totalEpochPoints.iadd(initMikeStake);
      mikePoints.iadd(initMikeStake);
      await kyberDao.vote(1, 2, {from: poolMaster});
      totalEpochPoints.iadd(initLoiStake);
      poolMasterPoints.iadd(initLoiStake);
      await kyberDao.vote(2, 1, {from: poolMaster});
      totalEpochPoints.iadd(initLoiStake);
      poolMasterPoints.iadd(initLoiStake);
      await kyberDao.vote(3, 2, {from: poolMaster});
      totalEpochPoints.iadd(initLoiStake);
      poolMasterPoints.iadd(initLoiStake);
      await kyberDao.vote(3, 1, {from: poolMaster2});
      totalEpochPoints.iadd(initVictorStake).iadd(initPoolMaster2Stake);
      poolMaster2Points.iadd(initVictorStake).iadd(initPoolMaster2Stake);

      // delay to make camp ended
      await Helper.mineNewBlockAfter(blocksToSeconds(minCampPeriod));

      // camp has ended, but if user withdrew, reward will be still deducted
      await stakingContract.withdraw(mulPrecision(100), {from: mike});
      totalEpochPoints.isub(mulPrecision(100 * 2));
      mikePoints.isub(mulPrecision(100 * 2));
      await stakingContract.withdraw(mulPrecision(50), {from: loi});
      totalEpochPoints.isub(mulPrecision(50 * 3));
      poolMasterPoints.isub(mulPrecision(50 * 3));

      let mikePer = mikePoints.mul(precisionUnits).div(totalEpochPoints);
      let poolMasterPer = poolMasterPoints.mul(precisionUnits).div(totalEpochPoints);
      let poolMaster2Per = poolMaster2Points.mul(precisionUnits).div(totalEpochPoints);

      await verifyCurrentEpochStakerRewardPercentages(
        [mike, poolMaster, poolMaster2, victor, loi],
        [mikePer, poolMasterPer, poolMaster2Per, 0, 0]
      )
      // delay one epoch and verify past epoch data
      let currentEpoch = await kyberDao.getCurrentEpochNumber();
      await Helper.mineNewBlockAfter(blocksToSeconds(epochPeriod));
      await verifyPastEpochtStakerRewardPercentages(
        [mike, poolMaster, poolMaster2, victor, loi],
        [mikePer, poolMasterPer, poolMaster2Per, 0, 0],
        currentEpoch
      )
    });

    it("Test get reward percentage epoch 0", async function() {
      await deployContracts(10, currentBlock + 40, 10);
      await setupSimpleStakingData();
      await stakingContract.delegate(poolMaster, {from: victor});
      await stakingContract.delegate(poolMaster2, {from: loi});

      await updateCurrentBlockAndTimestamp();
      await submitNewCampaignAndDelayToStart(kyberDao,
        1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
        0, 0, 0, [25, 50, 100], '0x', {from: daoOperator}
      );

      await kyberDao.vote(1, 1, {from: mike});
      await kyberDao.vote(1, 2, {from: victor});
      await kyberDao.vote(1, 3, {from: loi});
      await kyberDao.vote(1, 2, {from: poolMaster});
      await kyberDao.vote(1, 2, {from: poolMaster2});

      await verifyCurrentEpochStakerRewardPercentages(
        [mike, poolMaster, poolMaster2, victor, loi],
        [0, 0, 0, 0, 0]
      )
    });

    it("Test get reward percentage and full withdrawals", async function() {
      await deployContracts(20, currentBlock + 15, 10);
      await setupSimpleStakingData();
      await stakingContract.delegate(poolMaster, {from: victor});
      await stakingContract.delegate(poolMaster, {from: loi});

      await Helper.mineNewBlockAt(daoStartTime);

      await updateCurrentBlockAndTimestamp();
      await submitNewCampaign(kyberDao,
        1, currentBlock + 3, currentBlock + 3 + minCampPeriod,
        0, 0, 0, [25, 50, 100], '0x', {from: daoOperator}
      );
      await submitNewCampaignAndDelayToStart(kyberDao,
        2, currentBlock + 3, currentBlock + 3 + minCampPeriod,
        0, 0, 0, [25, 50, 100], '0x', {from: daoOperator}
      );

      await stakingContract.withdraw(mulPrecision(100), {from: mike});

      let totalEpochPoints = new BN(0);
      let mikePoints = new BN(0);
      let poolMasterPoints = new BN(0);

      // partial withdraw
      await kyberDao.vote(1, 1, {from: mike});
      totalEpochPoints.iadd(initMikeStake).isub(mulPrecision(100));
      mikePoints.iadd(initMikeStake).isub(mulPrecision(100));

      await kyberDao.vote(2, 3, {from: mike});
      totalEpochPoints.iadd(initMikeStake).isub(mulPrecision(100));
      mikePoints.iadd(initMikeStake).isub(mulPrecision(100));

      await kyberDao.vote(1, 2, {from: poolMaster});
      totalEpochPoints.iadd(initVictorStake).iadd(initLoiStake);
      poolMasterPoints.iadd(initVictorStake).iadd(initLoiStake);

      // full withdraw from victor
      await stakingContract.withdraw(initVictorStake, {from: victor});
      totalEpochPoints.isub(initVictorStake);
      poolMasterPoints.isub(initVictorStake);

      let mikePer = mikePoints.mul(precisionUnits).div(totalEpochPoints);
      let poolMasterPer = poolMasterPoints.mul(precisionUnits).div(totalEpochPoints);

      await verifyCurrentEpochStakerRewardPercentages(
        [mike, poolMaster, poolMaster2, victor, loi],
        [mikePer, poolMasterPer, 0, 0, 0]
      )
      // delay one epoch and verify past epoch data
      let currentEpoch = await kyberDao.getCurrentEpochNumber();
      await Helper.mineNewBlockAfter(blocksToSeconds(epochPeriod));
      await verifyPastEpochtStakerRewardPercentages(
        [mike, poolMaster, poolMaster2, victor, loi],
        [mikePer, poolMasterPer, 0, 0, 0],
        currentEpoch
      )
    });

    it("Test get reward percentage of pool master when he is in another pool", async function() {
      await deployContracts(20, currentBlock + 20, 10);
      await setupSimpleStakingData();
      await stakingContract.delegate(poolMaster2, {from: victor});
      await stakingContract.delegate(poolMaster2, {from: loi});
      await stakingContract.delegate(poolMaster, {from: poolMaster2});

      await Helper.mineNewBlockAt(daoStartTime);

      await updateCurrentBlockAndTimestamp();
      await submitNewCampaignAndDelayToStart(kyberDao,
        1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
        0, 0, 0, [25, 50, 100], '0x', {from: daoOperator}
      );

      let totalEpochPoints = new BN(0);
      let poolMasterPoints = new BN(0);
      let poolMaster2Points = new BN(0);

      await kyberDao.vote(1, 1, {from: poolMaster2});
      totalEpochPoints.iadd(initVictorStake).iadd(initLoiStake);
      poolMaster2Points.iadd(initVictorStake).iadd(initLoiStake);

      await kyberDao.vote(1, 3, {from: poolMaster});
      totalEpochPoints.iadd(initPoolMaster2Stake);
      poolMasterPoints.iadd(initPoolMaster2Stake);

      let poolMaster2Per = poolMaster2Points.mul(precisionUnits).div(totalEpochPoints);
      let poolMasterPer = poolMasterPoints.mul(precisionUnits).div(totalEpochPoints);

      await verifyCurrentEpochStakerRewardPercentages(
        [mike, poolMaster, poolMaster2, victor, loi],
        [0, poolMasterPer, poolMaster2Per, 0, 0]
      )
      // delay one epoch and verify past epoch data
      let currentEpoch = await kyberDao.getCurrentEpochNumber();
      await Helper.mineNewBlockAfter(blocksToSeconds(epochPeriod));
      await verifyPastEpochtStakerRewardPercentages(
        [mike, poolMaster, poolMaster2, victor, loi],
        [0, poolMasterPer, poolMaster2Per, 0, 0],
        currentEpoch
      )
    });

    it("Test get reward percentage of pool master when he is also in the pool", async function() {
      await deployContracts(20, currentBlock + 15, 10);
      await setupSimpleStakingData();
      await stakingContract.delegate(poolMaster2, {from: victor});
      await stakingContract.delegate(poolMaster2, {from: loi});

      await Helper.mineNewBlockAt(daoStartTime);

      await updateCurrentBlockAndTimestamp();
      await submitNewCampaignAndDelayToStart(kyberDao,
        1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
        0, 0, 0, [25, 50, 100], '0x', {from: daoOperator}
      );

      let totalEpochPoints = new BN(0);
      let mikePoints = new BN(0);
      let poolMaster2Points = new BN(0);

      await kyberDao.vote(1, 1, {from: poolMaster2});
      totalEpochPoints.iadd(initPoolMaster2Stake).iadd(initVictorStake).iadd(initLoiStake);
      poolMaster2Points.iadd(initPoolMaster2Stake).iadd(initVictorStake).iadd(initLoiStake);

      await kyberDao.vote(1, 3, {from: mike});
      totalEpochPoints.iadd(initMikeStake);
      mikePoints.iadd(initMikeStake);

      let poolMaster2Per = poolMaster2Points.mul(precisionUnits).div(totalEpochPoints);
      let mikePer = mikePoints.mul(precisionUnits).div(totalEpochPoints);

      await verifyCurrentEpochStakerRewardPercentages(
        [mike, poolMaster, poolMaster2, victor, loi],
        [mikePer, 0, poolMaster2Per, 0, 0]
      )
      // delay one epoch and verify past epoch data
      let currentEpoch = await kyberDao.getCurrentEpochNumber();
      await Helper.mineNewBlockAfter(blocksToSeconds(epochPeriod));
      await verifyPastEpochtStakerRewardPercentages(
        [mike, poolMaster, poolMaster2, victor, loi],
        [mikePer, 0, poolMaster2Per, 0, 0],
        currentEpoch
      )
    });

    it("Test get reward percentage with vote before delegation takes effect", async function() {
      await deployContracts(20, currentBlock + 15, 10);
      await setupSimpleStakingData();
      await stakingContract.delegate(poolMaster2, {from: victor});

      await Helper.mineNewBlockAt(daoStartTime);

      await stakingContract.delegate(poolMaster2, {from: loi});

      await updateCurrentBlockAndTimestamp();
      await submitNewCampaignAndDelayToStart(kyberDao,
        1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
        0, 0, 0, [25, 50, 100], '0x', {from: daoOperator}
      );

      let totalEpochPoints = new BN(0);
      let mikePoints = new BN(0);
      let poolMaster2Points = new BN(0);
      let loiPoints = new BN(0);

      await kyberDao.vote(1, 1, {from: poolMaster2});
      totalEpochPoints.iadd(initPoolMaster2Stake).iadd(initVictorStake);
      poolMaster2Points.iadd(initPoolMaster2Stake).iadd(initVictorStake);

      await kyberDao.vote(1, 3, {from: mike});
      totalEpochPoints.iadd(initMikeStake);
      mikePoints.iadd(initMikeStake);

      await kyberDao.vote(1, 3, {from: loi});
      totalEpochPoints.iadd(initLoiStake);
      loiPoints.iadd(initLoiStake);

      let poolMaster2Per = poolMaster2Points.mul(precisionUnits).div(totalEpochPoints);
      let mikePer = mikePoints.mul(precisionUnits).div(totalEpochPoints);
      let loiPer = loiPoints.mul(precisionUnits).div(totalEpochPoints);

      await verifyCurrentEpochStakerRewardPercentages(
        [mike, poolMaster, poolMaster2, victor, loi],
        [mikePer, 0, poolMaster2Per, 0, loiPer]
      )
      // delay one epoch and verify past epoch data
      let currentEpoch = await kyberDao.getCurrentEpochNumber();
      await Helper.mineNewBlockAfter(blocksToSeconds(epochPeriod));
      await verifyPastEpochtStakerRewardPercentages(
        [mike, poolMaster, poolMaster2, victor, loi],
        [mikePer, 0, poolMaster2Per, 0, loiPer],
        currentEpoch
      )
    });

    it("Test get staker percentage some epochs", async function() {
      await deployContracts(20, currentBlock + 15, 10);
      await setupSimpleStakingData();

      await Helper.mineNewBlockAt(daoStartTime);

      let mikeCurStake = new BN(0).add(initMikeStake);
      let victorCurStake = new BN(0).add(initVictorStake);
      let loiCurStake = new BN(0).add(initLoiStake);

      let campCount = 0;
      for(let id = 1; id < 5; id++) {
        await updateCurrentBlockAndTimestamp();
        await submitNewCampaign(kyberDao,
          0, currentBlock + 2, currentBlock + 2 + minCampPeriod,
          0, 0, 0, [25, 50], '0x', {from: daoOperator}
        );
        await submitNewCampaignAndDelayToStart(kyberDao,
          0, currentBlock + 3, currentBlock + 3 + minCampPeriod,
          0, 0, 0, [25, 50], '0x', {from: daoOperator}
        );
        campCount += 2;

        let totalEpochPoints = new BN(0);
        let mikePoints = new BN(0);
        let victorPoints = new BN(0);
        let loiPoints = new BN(0);

        await kyberDao.vote(campCount - 1, 1, {from: mike});
        totalEpochPoints.iadd(mikeCurStake);
        mikePoints.iadd(mikeCurStake);
        await kyberDao.vote(campCount, 2, {from: mike});
        totalEpochPoints.iadd(mikeCurStake);
        mikePoints.iadd(mikeCurStake);
        await kyberDao.vote(campCount, 1, {from: victor});
        await kyberDao.vote(campCount, 1, {from: victor});
        totalEpochPoints.iadd(victorCurStake);
        victorPoints.iadd(victorCurStake);
        await kyberDao.vote(campCount - 1, 2, {from: loi});
        totalEpochPoints.iadd(loiCurStake);
        loiPoints.iadd(loiCurStake);
        await kyberDao.vote(campCount - 1, 1, {from: loi});

        await stakingContract.deposit(mulPrecision(10), {from: loi});
        loiCurStake.iadd(mulPrecision(10));

        let mikePer = mikePoints.mul(precisionUnits).div(totalEpochPoints);
        let victorPer = victorPoints.mul(precisionUnits).div(totalEpochPoints);
        let loiPer = loiPoints.mul(precisionUnits).div(totalEpochPoints);

        // current epoch data
        await verifyCurrentEpochStakerRewardPercentages(
          [mike, poolMaster, poolMaster2, victor, loi],
          [mikePer, 0, 0, victorPer, loiPer]
        )
        // passing current epoch should return 0
        await verifyPastEpochtStakerRewardPercentages(
          [mike, poolMaster, poolMaster2, victor, loi],
          [0, 0, 0, 0, 0],
          id
        )

        await Helper.mineNewBlockAt(blocksToSeconds(id * epochPeriod) + daoStartTime);

        await verifyPastEpochtStakerRewardPercentages(
          [mike, poolMaster, poolMaster2, victor, loi],
          [mikePer, 0, 0, victorPer, loiPer],
          id
        )
      }
    });

    it("Test get reward percentage after many epochs", async function() {
      await deployContracts(20, currentBlock + 15, 10);
      await setupSimpleStakingData();
      await stakingContract.delegate(poolMaster2, {from: victor});

      await Helper.mineNewBlockAt(daoStartTime);

      await stakingContract.delegate(poolMaster2, {from: loi});

      await updateCurrentBlockAndTimestamp();
      await submitNewCampaignAndDelayToStart(kyberDao,
        1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
        0, 0, 0, [25, 50, 100], '0x', {from: daoOperator}
      );

      let totalEpochPoints = new BN(0);
      let mikePoints = new BN(0);
      let poolMaster2Points = new BN(0);
      let loiPoints = new BN(0);

      await kyberDao.vote(1, 1, {from: poolMaster2});
      totalEpochPoints.iadd(initPoolMaster2Stake).iadd(initVictorStake);
      poolMaster2Points.iadd(initPoolMaster2Stake).iadd(initVictorStake);

      await kyberDao.vote(1, 3, {from: mike});
      totalEpochPoints.iadd(initMikeStake);
      mikePoints.iadd(initMikeStake);

      await kyberDao.vote(1, 3, {from: loi});
      totalEpochPoints.iadd(initLoiStake);
      loiPoints.iadd(initLoiStake);

      let poolMaster2Per = poolMaster2Points.mul(precisionUnits).div(totalEpochPoints);
      let mikePer = mikePoints.mul(precisionUnits).div(totalEpochPoints);
      let loiPer = loiPoints.mul(precisionUnits).div(totalEpochPoints);

      await stakingContract.deposit(mulPrecision(200), {from: mike});
      await stakingContract.deposit(mulPrecision(210), {from: victor});
      await stakingContract.deposit(mulPrecision(220), {from: loi});
      await stakingContract.deposit(mulPrecision(230), {from: poolMaster2});

      await stakingContract.delegate(mike, {from: victor});
      await stakingContract.delegate(victor, {from: victor});
      await stakingContract.delegate(loi, {from: poolMaster2});
      await stakingContract.delegate(loi, {from: poolMaster});

      // delay to epoch 5
      await Helper.mineNewBlockAt(blocksToSeconds(4 * epochPeriod) + daoStartTime);

      await updateCurrentBlockAndTimestamp();
      await submitNewCampaignAndDelayToStart(kyberDao,
        1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
        0, 0, 0, [25, 50, 100], '0x', {from: daoOperator}
      );

      await kyberDao.vote(2, 1, {from: poolMaster2});
      await kyberDao.vote(2, 3, {from: mike});
      await kyberDao.vote(2, 3, {from: loi});

      await verifyPastEpochtStakerRewardPercentages(
        [mike, poolMaster, poolMaster2, victor, loi],
        [mikePer, 0, poolMaster2Per, 0, loiPer],
        1
      )

      // get reward percentage for epoch that stakers did nothing, data is not inited in Staking
      await verifyPastEpochtStakerRewardPercentages(
        [mike, poolMaster, poolMaster2, victor, loi],
        [0, 0, 0, 0, 0],
        3
      )

    });

    it("Test get staker reward percentage when no votes", async function() {
      await deployContracts(20, currentBlock + 15, 10);
      await setupSimpleStakingData();
      await stakingContract.deposit(mulPrecision(100), {from: mike});

      await Helper.mineNewBlockAt(daoStartTime);

      // has stake, but no vote yet
      Helper.assertEqual(0, await kyberDao.getPastEpochRewardPercentageInPrecision(mike, 0), "reward percentage is wrong");
    });

    // test coverage for total epoch points = 0 or less than staker's point
    it("Test get reward percenage returns 0 with invalid total epoch points", async function() {
      epochPeriod = 20;
      startBlock = currentBlock + 30;

      minCampPeriod = 10;
      daoStartTime = blockToTimestamp(startBlock);
      kyberDao = await MockMaliciousKyberDao.new(
        blocksToSeconds(epochPeriod), daoStartTime,
        kncToken.address, minCampPeriod,
        defaultNetworkFee, defaultRewardBps, defaultRebateBps,
        daoOperator
      )
      stakingContract = await StakingContract.at(await kyberDao.staking());

      await setupSimpleStakingData();

      await stakingContract.deposit(mulPrecision(100), {from: mike});

      await Helper.mineNewBlockAt(daoStartTime);

      await updateCurrentBlockAndTimestamp();
      await submitNewCampaignAndDelayToStart(kyberDao,
        1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
        0, 0, 0, [25, 50, 100], '0x', {from: daoOperator}
      );
      await kyberDao.vote(1, 2, {from: mike});

      // set total epoch points is 0
      await kyberDao.setTotalEpochPoints(1, 0);

      Helper.assertEqual(0, await kyberDao.getPastEpochRewardPercentageInPrecision(mike, 1), "reward should be 0");

      // set total epoch points less than point of mike
      await kyberDao.setTotalEpochPoints(1, mulPrecision(90));

      Helper.assertEqual(0, await kyberDao.getPastEpochRewardPercentageInPrecision(mike, 1), "reward should be 0");
    });
  });

  describe("#Conclude Campaign tests", () => {

    it("Test get winning option for non-existed campaign", async function() {
      await deployContracts(10, currentBlock + 10, 5);

      let data = await kyberDao.getCampaignWinningOptionAndValue(1);
      Helper.assertEqual(0, data[0], "option id should be 0");
      Helper.assertEqual(0, data[1], "option value should be 0");
    });

    it("Test get winning option for camp that hasn't ended", async function() {
      await deployContracts(10, currentBlock + 20, 5);
      await setupSimpleStakingData();

      await Helper.mineNewBlockAt(daoStartTime);

      await updateCurrentBlockAndTimestamp();
      // min percentage: 0%, c = 0, t = 0
      await submitNewCampaign(kyberDao,
        1, currentBlock + 4, currentBlock + 4 + minCampPeriod,
        0, 0, 0, [25, 50, 100], '0x', {from: daoOperator}
      );

      // not started yet
      let data = await kyberDao.getCampaignWinningOptionAndValue(1);
      Helper.assertEqual(0, data[0], "option id should be 0");
      Helper.assertEqual(0, data[1], "option value should be 0");

      await Helper.mineNewBlockAt(blockToTimestamp(currentBlock + 4));

      // delay to start time of campaign
      await Helper.mineNewBlockAt(blockToTimestamp(currentBlock + 4));
      await kyberDao.vote(1, 1, {from: mike});

      // currently running
      data = await kyberDao.getCampaignWinningOptionAndValue(1);
      Helper.assertEqual(0, data[0], "option id should be 0");
      Helper.assertEqual(0, data[1], "option value should be 0");

      // delay until end of first camp
      await Helper.mineNewBlockAfter(blocksToSeconds(minCampPeriod));

      data = await kyberDao.getCampaignWinningOptionAndValue(1);
      Helper.assertEqual(1, data[0], "winning option id is invalid");
      Helper.assertEqual(25, data[1], "winning option value is invalid");
    });

    it("Test get winning option total supply is 0", async function() {
      kncToken = await TestToken.new("test token", 'tst', 18, {from: accounts[0]});

      let totalSupply = await kncToken.totalSupply();

      await kncToken.burn(totalSupply, {from: accounts[0]});

      await deployContracts(10, currentBlock + 20, 5);

      await Helper.mineNewBlockAt(daoStartTime);

      await updateCurrentBlockAndTimestamp();
      // min percentage: 0%, c = 0, t = 0
      await submitNewCampaign(kyberDao,
        1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
        0, 0, 0, [25, 50, 100], '0x', {from: daoOperator}
      );

      // delay to end of this epocch
      await Helper.mineNewBlockAt(blocksToSeconds(epochPeriod) + daoStartTime);

      let data = await kyberDao.getCampaignWinningOptionAndValue(1);
      Helper.assertEqual(0, data[0], "winning option id is invalid");
      Helper.assertEqual(0, data[1], "winning option value is invalid");

      // conclude result, it is network fee so just call get network fee with cache
      await kyberDao.getLatestNetworkFeeDataWithCache();
    });

    it("Test get winning option with no vote", async function() {
      kncToken = await TestToken.new("test token", 'tst', 18, {from: accounts[0]});

      let totalSupply = await kncToken.totalSupply();
      let burnAmount = totalSupply.sub(new BN(totalSupply));

      await kncToken.burn(burnAmount, {from: accounts[0]});

      await deployContracts(10, currentBlock + 20, 5);

      await Helper.mineNewBlockAt(daoStartTime);

      await updateCurrentBlockAndTimestamp();
      // min percentage: 0%, c = 0, t = 0
      await submitNewCampaign(kyberDao,
        1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
        0, 0, 0, [25, 50, 100], '0x', {from: daoOperator}
      );

      // delay to end of this epocch
      await Helper.mineNewBlockAt(blocksToSeconds(epochPeriod) + daoStartTime);

      let data = await kyberDao.getCampaignWinningOptionAndValue(1);
      Helper.assertEqual(0, data[0], "winning option id is invalid");
      Helper.assertEqual(0, data[1], "winning option value is invalid");

      // conclude result, it is network fee so just call get network fee with cache
      await kyberDao.getLatestNetworkFeeDataWithCache();

      await resetSetupForKNCToken();
    });

    it("Test get winning option with 2 options have the same most votes", async function() {
      await deployContracts(10, currentBlock + 20, 5);
      await setupSimpleStakingData();
      // make the same stake
      if (initMikeStake < initVictorStake) {
        await stakingContract.deposit(initVictorStake.sub(initMikeStake), {from: mike});
      } else {
        await stakingContract.deposit(initMikeStake.sub(initVictorStake), {from: victor});
      }

      await Helper.mineNewBlockAt(daoStartTime);

      await updateCurrentBlockAndTimestamp();
      // min percentage: 0%, c = 0, t = 0
      await submitNewCampaignAndDelayToStart(kyberDao,
        1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
        0, 0, 0, [25, 50, 100], '0x', {from: daoOperator}
      );

      await kyberDao.vote(1, 1, {from: mike});
      await kyberDao.vote(1, 2, {from: victor});

      // delay to end of this epocch
      await Helper.mineNewBlockAt(blocksToSeconds(epochPeriod) + daoStartTime);

      let data = await kyberDao.getCampaignWinningOptionAndValue(1);
      Helper.assertEqual(0, data[0], "winning option id is invalid");
      Helper.assertEqual(0, data[1], "winning option value is invalid");

      // conclude result, it is network fee so just call get network fee with cache
      await kyberDao.getLatestNetworkFeeDataWithCache();
    });

    it("Test get winning option return 0 vote count less than min percentage (20%)", async function() {
      await deployContracts(10, currentBlock + 20, 5);
      await setupSimpleStakingData();

      await Helper.mineNewBlockAt(daoStartTime);

      // 20% of total supply
      await updateCurrentBlockAndTimestamp();
      // min percentage: 0%, c = 0, t = 0
      await submitNewCampaignAndDelayToStart(kyberDao,
        1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
        precisionUnits.div(new BN(5)), 0, 0, [25, 50, 100], '0x', {from: daoOperator}
      );

      await kyberDao.vote(1, 1, {from: mike});
      await kyberDao.vote(1, 1, {from: victor});
      await kyberDao.vote(1, 1, {from: loi});

      let totalSupply = await kncToken.totalSupply();

      Helper.assertLesser(
        initMikeStake.add(initLoiStake).add(initVictorStake),
        totalSupply.div(new BN(5)),
        "total voted stake should be less than 20%"
      );

      await Helper.mineNewBlockAt(blocksToSeconds(epochPeriod) + daoStartTime);

      let data = await kyberDao.getCampaignWinningOptionAndValue(1);
      Helper.assertEqual(0, data[0], "winning option id is invalid");
      Helper.assertEqual(0, data[1], "winning option value is invalid")
    });

    it("Test get winning option return most voted option with all formula params are 0", async function() {
      await deployContracts(10, currentBlock + 20, 5);
      await setupSimpleStakingData();
      // make sure mike has more stake than both victor and loi
      await stakingContract.deposit(initVictorStake.add(initLoiStake), {from: mike});

      await Helper.mineNewBlockAt(daoStartTime);

      await updateCurrentBlockAndTimestamp();
      // min percentage: 0%, c = 0, t = 0
      await submitNewCampaignAndDelayToStart(kyberDao,
        1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
        0, 0, 0, [25, 50, 100], '0x', {from: daoOperator}
      );

      await kyberDao.vote(1, 2, {from: mike});
      await kyberDao.vote(1, 1, {from: victor});
      await kyberDao.vote(1, 3, {from: loi});

      await Helper.mineNewBlockAt(blocksToSeconds(epochPeriod) + daoStartTime);

      let data = await kyberDao.getCampaignWinningOptionAndValue(1);
      Helper.assertEqual(2, data[0], "winning option id is invalid");
      Helper.assertEqual(50, data[1], "winning option value is invalid")
    });

    it("Test get winning option total votes exact min percentage of total supply (20%)", async function() {
      let totalSupply = (new BN(0)).add(initMikeStake).add(initVictorStake).add(initLoiStake);
      totalSupply.imul(new BN(5));

      await setupTokenWithSupply(totalSupply);
      await updateCurrentBlockAndTimestamp();
      await deployContracts(20, currentBlock + 20, 5);
      await setupSimpleStakingData();

      await Helper.mineNewBlockAt(daoStartTime);

      await updateCurrentBlockAndTimestamp();
      // min percentage: 20%, c = 0, t = 0
      await submitNewCampaignAndDelayToStart(kyberDao,
        1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
        precisionUnits.div(new BN(5)), 0, 0, [25, 50, 100], '0x', {from: daoOperator}
      );

      await kyberDao.vote(1, 3, {from: mike});
      await kyberDao.vote(1, 2, {from: victor});
      await kyberDao.vote(1, 3, {from: loi});

      // delay to end of this epocch
      await updateCurrentBlockAndTimestamp();
      await Helper.mineNewBlockAt(blocksToSeconds(epochPeriod) + daoStartTime);

      let data = await kyberDao.getCampaignWinningOptionAndValue(1);
      Helper.assertEqual(3, data[0], "winning option id is invalid");
      Helper.assertEqual(100, data[1], "winning option value is invalid");

      // conclude result, it is network fee so just call get network fee with cache
      await kyberDao.getLatestNetworkFeeDataWithCache();

      // resetup data, increase total supply so total votes less than 20%
      totalSupply.iadd(new BN(1));

      await setupTokenWithSupply(totalSupply);
      await updateCurrentBlockAndTimestamp();
      await deployContracts(20, currentBlock + 20, 5);
      await setupSimpleStakingData();

      await Helper.mineNewBlockAt(daoStartTime);

      await updateCurrentBlockAndTimestamp();
      await submitNewCampaignAndDelayToStart(kyberDao,
        1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
        precisionUnits.div(new BN(5)), 0, 0, [25, 50, 100], '0x', {from: daoOperator}
      );

      await kyberDao.vote(1, 3, {from: mike});
      await kyberDao.vote(1, 2, {from: victor});
      await kyberDao.vote(1, 3, {from: loi});

      // delay to end of this epocch
      await Helper.mineNewBlockAt(blocksToSeconds(epochPeriod) + daoStartTime);

      data = await kyberDao.getCampaignWinningOptionAndValue(1);
      Helper.assertEqual(0, data[0], "winning option id is invalid");
      Helper.assertEqual(0, data[1], "winning option value is invalid");

      await resetSetupForKNCToken();
    });

    it("Test get winning option returns 0 option voted percentage less than threshold", async function() {
      // Min percentage: 20%
      // C = 100%, t = 1
      // Y = C - t * X
      // Make X = 40% -> Y = 60%, make sure the most voted option < 60% of total voted stakes

      await simpleSetupToTestThreshold(5900, 4000, 100, 40);

      await updateCurrentBlockAndTimestamp();
      // min percentage: 20%, c = 100%, t = 1
      minPercentageInPrecision = mulPrecision(20).div(new BN(100));
      cInPrecision = precisionUnits; // 100%
      tInPrecision = precisionUnits; // 1
      await submitNewCampaignAndDelayToStart(kyberDao,
        1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
        minPercentageInPrecision, cInPrecision, tInPrecision, [32, 26, 44], '0x', {from: daoOperator}
      );

      await kyberDao.vote(1, 2, {from: mike});
      await kyberDao.vote(1, 3, {from: victor});
      await kyberDao.vote(1, 1, {from: loi});
      await kyberDao.vote(1, 1, {from: mike});
      await kyberDao.vote(1, 2, {from: loi});

      // delay to end of this epocch
      await Helper.mineNewBlockAt(blocksToSeconds(epochPeriod) + daoStartTime);

      // no winning option
      let data = await kyberDao.getCampaignWinningOptionAndValue(1);
      Helper.assertEqual(0, data[0], "winning option id is invalid");
      Helper.assertEqual(0, data[1], "winning option value is invalid");

      await resetSetupForKNCToken();
    });

    it("Test get winning option with option voted percentage is equal threshold", async function() {
      // Min percentage: 20%
      // C = 100%, t = 1
      // Y = C - t * X
      // Make X = 40% -> Y = 60%, make sure the most voted option = 60% of total voted stakes

      await simpleSetupToTestThreshold(6000, 3500, 500, 40);

      await updateCurrentBlockAndTimestamp();
      // min percentage: 20%, c = 100%, t = 1
      minPercentageInPrecision = mulPrecision(20).div(new BN(100));
      cInPrecision = precisionUnits; // 100%
      tInPrecision = precisionUnits; // 1
      await submitNewCampaignAndDelayToStart(kyberDao,
        1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
        minPercentageInPrecision, cInPrecision, tInPrecision, [32, 26, 44], '0x', {from: daoOperator}
      );

      await kyberDao.vote(1, 2, {from: mike});
      await kyberDao.vote(1, 3, {from: victor});
      await kyberDao.vote(1, 1, {from: loi});

      // delay to end of this epocch
      await Helper.mineNewBlockAt(blocksToSeconds(epochPeriod) + daoStartTime);

      // option 2 should win as it equals the threshold
      let data = await kyberDao.getCampaignWinningOptionAndValue(1);
      Helper.assertEqual(2, data[0], "winning option id is invalid");
      Helper.assertEqual(26, data[1], "winning option value is invalid");

      await resetSetupForKNCToken();
    });

    it("Test get winning option with option voted percentage is higher than threshold", async function() {
      // Min percentage: 20%
      // C = 100%, t = 1
      // Y = C - t * X
      // Make X = 40% -> Y = 60%, make sure the most voted option > 60% of total voted stakes

      await simpleSetupToTestThreshold(6000, 3500, 500, 40);

      await Helper.mineNewBlockAt(daoStartTime);

      await updateCurrentBlockAndTimestamp();
      // min percentage: 20%, c = 100%, t = 1
      minPercentageInPrecision = mulPrecision(40).div(new BN(100));
      cInPrecision = precisionUnits; // 100%
      tInPrecision = precisionUnits; // 1
      await submitNewCampaignAndDelayToStart(kyberDao,
        1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
        minPercentageInPrecision, cInPrecision, tInPrecision, [32, 26, 44], '0x', {from: daoOperator}
      );

      await kyberDao.vote(1, 1, {from: mike});
      await kyberDao.vote(1, 3, {from: victor});
      await kyberDao.vote(1, 1, {from: loi});

      // delay to end of this epocch
      await Helper.mineNewBlockAt(blocksToSeconds(epochPeriod) + daoStartTime);

      // option 1 should win as it equals the threshold
      let data = await kyberDao.getCampaignWinningOptionAndValue(1);
      Helper.assertEqual(1, data[0], "winning option id is invalid");
      Helper.assertEqual(32, data[1], "winning option value is invalid");

      await resetSetupForKNCToken();
    });

    it("Test get winning option with threshold is negative from formula", async function() {
      // Min percentage: 20%
      // C = 10%, t = 1
      // Y = C - t * X
      // Make X = 40% -> Y < 0, have winning option if % total stakes >= min percentage

      await simpleSetupToTestThreshold(6000, 3500, 500, 40);

      await Helper.mineNewBlockAt(daoStartTime);

      await updateCurrentBlockAndTimestamp();
      // min percentage: 20%, c = 10%, t = 1
      minPercentageInPrecision = mulPrecision(40).div(new BN(100));
      cInPrecision = precisionUnits.div(new BN(10)); // 10%
      tInPrecision = precisionUnits; // 1
      await submitNewCampaignAndDelayToStart(kyberDao,
        1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
        minPercentageInPrecision, cInPrecision, tInPrecision, [32, 26, 44], '0x', {from: daoOperator}
      );

      await kyberDao.vote(1, 3, {from: mike});
      await kyberDao.vote(1, 1, {from: victor});
      await kyberDao.vote(1, 2, {from: loi});

      // delay to end of this epocch
      await Helper.mineNewBlockAt(blocksToSeconds(epochPeriod) + daoStartTime);

      let data = await kyberDao.getCampaignWinningOptionAndValue(1);
      Helper.assertEqual(3, data[0], "winning option id is invalid");
      Helper.assertEqual(44, data[1], "winning option value is invalid");

      await resetSetupForKNCToken();
    });

    it("Test get winning option with threshold is greater than 100% from formula", async function() {
      // Min percentage: 20%
      // C = 200%, t = 1
      // Y = C - t * X
      // Make X = 40% -> Y > 100%, have winning option if % total stakes >= min percentage

      await simpleSetupToTestThreshold(6000, 3500, 500, 40);

      await Helper.mineNewBlockAt(daoStartTime);

      await updateCurrentBlockAndTimestamp();
      // min percentage: 20%, c = 200%, t = 1
      minPercentageInPrecision = mulPrecision(40).div(new BN(100));
      cInPrecision = mulPrecision(2); // 10%
      tInPrecision = precisionUnits; // 1
      await submitNewCampaignAndDelayToStart(kyberDao,
        1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
        minPercentageInPrecision, cInPrecision, tInPrecision, [32, 26, 44], '0x', {from: daoOperator}
      );

      await kyberDao.vote(1, 1, {from: mike});
      await kyberDao.vote(1, 1, {from: victor});
      await kyberDao.vote(1, 1, {from: loi});

      // delay to end of this epocch
      await Helper.mineNewBlockAt(blocksToSeconds(epochPeriod) + daoStartTime);

      let data = await kyberDao.getCampaignWinningOptionAndValue(1);
      Helper.assertEqual(0, data[0], "winning option id is invalid");
      Helper.assertEqual(0, data[1], "winning option value is invalid");

      await resetSetupForKNCToken();
    });

    it("Test get winning option with threshold is 100% from formula", async function() {
      // Min percentage: 20%
      // C = 100%, t = 0
      // Y = C - t * X
      // Make X = 40% -> Y > 100%, have winning option if % total stakes >= min percentage

      await simpleSetupToTestThreshold(6000, 3500, 500, 40);

      await Helper.mineNewBlockAt(daoStartTime);

      await updateCurrentBlockAndTimestamp();
      // min percentage: 20%, c = 100%, t = 0
      minPercentageInPrecision = mulPrecision(40).div(new BN(100));
      cInPrecision = precisionUnits; // 100%
      tInPrecision = 0; // 1
      await submitNewCampaignAndDelayToStart(kyberDao,
        1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
        minPercentageInPrecision, cInPrecision, tInPrecision, [32, 26, 44], '0x', {from: daoOperator}
      );

      await kyberDao.vote(1, 2, {from: mike});
      await kyberDao.vote(1, 2, {from: victor});
      await kyberDao.vote(1, 2, {from: loi});

      // delay to end of this epocch
      await Helper.mineNewBlockAt(blocksToSeconds(epochPeriod) + daoStartTime);

      // all voted for option 1, however threshold is greater than 100%
      let data = await kyberDao.getCampaignWinningOptionAndValue(1);
      Helper.assertEqual(2, data[0], "winning option id is invalid");
      Helper.assertEqual(26, data[1], "winning option value is invalid");

      await updateCurrentBlockAndTimestamp();
      await submitNewCampaignAndDelayToStart(kyberDao,
        1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
        minPercentageInPrecision, cInPrecision, tInPrecision, [32, 26, 44], '0x', {from: daoOperator}
      );

      // one person voted differently
      await kyberDao.vote(2, 2, {from: mike});
      await kyberDao.vote(2, 1, {from: victor});
      await kyberDao.vote(2, 2, {from: loi});

      // delay to end of this epocch
      await updateCurrentBlockAndTimestamp();
      await Helper.mineNewBlockAt(blocksToSeconds(2 * epochPeriod) + daoStartTime);

      data = await kyberDao.getCampaignWinningOptionAndValue(2);
      Helper.assertEqual(0, data[0], "winning option id is invalid");
      Helper.assertEqual(0, data[1], "winning option value is invalid");

      await resetSetupForKNCToken();
    });
  });

  describe("#Get Network Fee Data tests", () => {
    it("Test get network fee returns correct default data for epoch 0", async function() {
      defaultNetworkFee = 32;
      await deployContracts(10, currentBlock + 10, 5);

      // get fee data for epoch 0
      let feeData = await kyberDao.getLatestNetworkFeeData();
      Helper.assertEqual(defaultNetworkFee, feeData.feeInBps, "network fee default is wrong");
      Helper.assertEqual(daoStartTime - 1, feeData.expiryTimestamp, "expiry timestamp is wrong");

      await kyberDao.setLatestNetworkFee(36);
      feeData = await kyberDao.getLatestNetworkFeeData();
      Helper.assertEqual(36, feeData.feeInBps, "network fee default is wrong");
      Helper.assertEqual(daoStartTime - 1, feeData.expiryTimestamp, "expiry timestamp is wrong");

      let tx = await kyberDao.getLatestNetworkFeeDataWithCache();
      logInfo("Get Network Fee: epoch 0, gas used: " + tx.receipt.gasUsed);
    });

    it("Test get network fee returns correct latest data, no campaigns", async function() {
      defaultNetworkFee = 25;
      await deployContracts(10, currentBlock + 10, 5);

      // delay to epoch 1
      await Helper.mineNewBlockAt(daoStartTime);
      // get fee data for epoch 1
      feeData = await kyberDao.getLatestNetworkFeeData();
      Helper.assertEqual(defaultNetworkFee, feeData.feeInBps, "network fee default is wrong");
      Helper.assertEqual(blocksToSeconds(epochPeriod) + daoStartTime - 1, feeData.expiryTimestamp, "expiry timestamp is wrong");

      await kyberDao.setLatestNetworkFee(32);
      feeData = await kyberDao.getLatestNetworkFeeData();
      Helper.assertEqual(32, feeData.feeInBps, "network fee default is wrong");
      Helper.assertEqual(blocksToSeconds(epochPeriod) + daoStartTime - 1, feeData.expiryTimestamp, "expiry timestamp is wrong");

      // delay to epoch 4
      await Helper.mineNewBlockAt(blocksToSeconds(3 * epochPeriod) + daoStartTime);
      // get fee data for epoch 4
      feeData = await kyberDao.getLatestNetworkFeeData();
      Helper.assertEqual(32, feeData.feeInBps, "network fee default is wrong");
      Helper.assertEqual(blocksToSeconds(4*epochPeriod) + daoStartTime - 1, feeData.expiryTimestamp, "expiry timestamp is wrong");

      let tx = await kyberDao.getLatestNetworkFeeDataWithCache();
      logInfo("Get Network Fee: epoch > 0, no fee camp, gas used: " + tx.receipt.gasUsed);
    });

    it("Test get network fee returns correct latest data, has camp but no fee campaign", async function() {
      await deployContracts(15, currentBlock + 20, 10);
      await setupSimpleStakingData();

      // delay to epoch 1
      await Helper.mineNewBlockAt(daoStartTime);

      await updateCurrentBlockAndTimestamp();
      await submitNewCampaignAndDelayToStart(kyberDao,
        0, currentBlock + 2, currentBlock + 2 + minCampPeriod,
        0, 0, 0, [32, 26, 44], '0x', {from: daoOperator}
      );
      await kyberDao.vote(1, 2, {from: mike});

      await updateCurrentBlockAndTimestamp();
      await submitNewCampaignAndDelayToStart(kyberDao,
        2, currentBlock + 2, currentBlock + 2 + minCampPeriod,
        0, 0, 0, [22, 23, 24], '0x', {from: daoOperator}
      );
      await kyberDao.vote(2, 3, {from: mike});

      await Helper.mineNewBlockAt(blocksToSeconds(epochPeriod) + daoStartTime);

      let data = await kyberDao.getCampaignWinningOptionAndValue(1);

      Helper.assertEqual(2, data[0], "winning option is wrong");
      Helper.assertEqual(26, data[1], "winning option value is wrong");

      Helper.assertEqual(0, await kyberDao.networkFeeCampaigns(1), "shouldn't have network fee camp for epoch 1");

      data = await kyberDao.getLatestNetworkFeeData();

      Helper.assertEqual(defaultNetworkFee, data[0], "should fallback to default network fee value");
      // expiry timestamp should be end of epoch 2
      Helper.assertEqual(blocksToSeconds(epochPeriod * 2) + daoStartTime - 1, data[1], "expiry timestamp is wrong for epoch 1");
    });

    it("Test get network fee returns correct latest data on-going network fee has a winning option", async function() {
      await simpleSetupToTestThreshold(410, 410, 180, 40);
      await updateCurrentBlockAndTimestamp();
      // min per: 40%, C = 100%, t = 1
      minPercentageInPrecision = precisionUnits.mul(new BN(40)).div(new BN(100));
      cInPrecision = precisionUnits;
      tInPrecision = precisionUnits;
      await submitNewCampaignAndDelayToStart(kyberDao,
        1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
        minPercentageInPrecision, cInPrecision, tInPrecision, [32, 50, 44], '0x', {from: daoOperator}
      );

      // option 2 should win
      await kyberDao.vote(1, 2, {from: mike});
      await kyberDao.vote(1, 2, {from: loi});
      await kyberDao.vote(1, 2, {from: victor});

      // camp is not ended yet, so data shouldn't change
      let data = await kyberDao.getLatestNetworkFeeData();
      Helper.assertEqual(defaultNetworkFee, data[0], "should fallback to default network fee value");
      Helper.assertEqual(blocksToSeconds(epochPeriod) + daoStartTime - 1, data[1], "expiry timestamp is wrong");

      // delay to epoch 2
      await Helper.mineNewBlockAt(blocksToSeconds(epochPeriod) + daoStartTime);

      Helper.assertEqual(1, await kyberDao.networkFeeCampaigns(1), "should have network fee camp");

      data = await kyberDao.getLatestNetworkFeeData();

      Helper.assertEqual(50, data[0], "should fallback to previous data");
      Helper.assertEqual(blocksToSeconds(epochPeriod * 2) + daoStartTime - 1, data[1], "expiry timestamp is wrong");

      await resetSetupForKNCToken();
    });

    it("Test get network fee returns correct latest data, has network fee camp but no winning option", async function() {
      // mike: 410, victor: 410, loi: 280, total stakes = 40% * total supply
      await simpleSetupToTestThreshold(410, 410, 180, 40);

      await updateCurrentBlockAndTimestamp();
      await submitNewCampaignAndDelayToStart(kyberDao,
        1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
        0, 0, 0, [32, 26, 44], '0x', {from: daoOperator}
      );

      await kyberDao.vote(1, 2, {from: mike});
      await kyberDao.vote(1, 1, {from: victor});
      await kyberDao.vote(1, 3, {from: loi});

      // delay to epoch 2
      await Helper.mineNewBlockAt(blocksToSeconds(epochPeriod) + daoStartTime);

      // no winning as same vote count
      let data = await kyberDao.getCampaignWinningOptionAndValue(1);
      Helper.assertEqual(0, data[0], "winning option is wrong");
      Helper.assertEqual(0, data[1], "winning option value is wrong");

      Helper.assertEqual(1, await kyberDao.networkFeeCampaigns(1), "should have network fee camp for epoch 1");

      data = await kyberDao.getLatestNetworkFeeData();

      Helper.assertEqual(defaultNetworkFee, data[0], "should fallback to default network fee value");
      Helper.assertEqual(blocksToSeconds(epochPeriod * 2) + daoStartTime - 1, data[1], "expiry timestamp is wrong for epoch 1");

      let tx = await kyberDao.getLatestNetworkFeeDataWithCache();
      logInfo("Get Network Fee: epoch > 0, has fee camp, no win option, gas used: " + tx.receipt.gasUsed);
      tx = await kyberDao.getLatestNetworkFeeDataWithCache();
      logInfo("Get Network Fee: epoch > 0, has fee camp, already concluded, gas used: " + tx.receipt.gasUsed);

      await updateCurrentBlockAndTimestamp();
      // min per: 41%, C = 0, t = 0
      minPercentageInPrecision = precisionUnits.mul(new BN(41)).div(new BN(100));
      await submitNewCampaignAndDelayToStart(kyberDao,
        1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
        minPercentageInPrecision, 0, 0, [32, 26, 44], '0x', {from: daoOperator}
      );

      await kyberDao.vote(2, 1, {from: mike});
      await kyberDao.vote(2, 1, {from: victor});
      await kyberDao.vote(2, 1, {from: loi});

      // delay to epoch 3
      await Helper.mineNewBlockAt(blocksToSeconds(2 * epochPeriod) + daoStartTime);

      // no winning as min percentage > total votes / total supply
      data = await kyberDao.getCampaignWinningOptionAndValue(2);
      Helper.assertEqual(0, data[0], "winning option is wrong");
      Helper.assertEqual(0, data[1], "winning option value is wrong");

      Helper.assertEqual(2, await kyberDao.networkFeeCampaigns(2), "should have network fee camp");

      data = await kyberDao.getLatestNetworkFeeData();

      Helper.assertEqual(defaultNetworkFee, data[0], "should fallback to default network fee value");
      Helper.assertEqual(blocksToSeconds(epochPeriod * 3) + daoStartTime - 1, data[1], "expiry timestamp is wrong");

      await updateCurrentBlockAndTimestamp();
      // min per: 40%, C = 100%, t = 1
      minPercentageInPrecision = precisionUnits.mul(new BN(40)).div(new BN(100));
      cInPrecision = precisionUnits;
      tInPrecision = precisionUnits;
      await submitNewCampaignAndDelayToStart(kyberDao,
        1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
        minPercentageInPrecision, cInPrecision, tInPrecision, [32, 26, 44], '0x', {from: daoOperator}
      );

      await kyberDao.vote(3, 1, {from: mike});
      await kyberDao.vote(3, 1, {from: loi});
      await kyberDao.vote(3, 2, {from: victor});

      // delay to epoch 4
      await Helper.mineNewBlockAt(blocksToSeconds(3 * epochPeriod) + daoStartTime);

      // no winning as most option voted percentage (59%) < threshold (60%)
      data = await kyberDao.getCampaignWinningOptionAndValue(3);
      Helper.assertEqual(0, data[0], "winning option is wrong");
      Helper.assertEqual(0, data[1], "winning option value is wrong");

      Helper.assertEqual(3, await kyberDao.networkFeeCampaigns(3), "should have network fee camp");

      data = await kyberDao.getLatestNetworkFeeData();

      Helper.assertEqual(defaultNetworkFee, data[0], "should fallback to default network fee value");
      Helper.assertEqual(blocksToSeconds(4 * epochPeriod) + daoStartTime - 1, data[1], "expiry timestamp is wrong");

      await updateCurrentBlockAndTimestamp();
      // min per: 40%, C = 100%, t = 1
      minPercentageInPrecision = precisionUnits.mul(new BN(40)).div(new BN(100));
      cInPrecision = precisionUnits;
      tInPrecision = precisionUnits;
      await submitNewCampaignAndDelayToStart(kyberDao,
        1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
        minPercentageInPrecision, cInPrecision, tInPrecision, [32, 26, 44], '0x', {from: daoOperator}
      );

      await kyberDao.vote(4, 1, {from: mike});
      await kyberDao.vote(4, 1, {from: loi});
      await kyberDao.vote(4, 1, {from: victor});

      // delay to epoch 5
      await Helper.mineNewBlockAt(blocksToSeconds(4 * epochPeriod) + daoStartTime);

      data = await kyberDao.getCampaignWinningOptionAndValue(4);
      Helper.assertEqual(1, data[0], "winning option is wrong");
      Helper.assertEqual(32, data[1], "winning option value is wrong");

      Helper.assertEqual(4, await kyberDao.networkFeeCampaigns(4), "should have network fee camp");

      data = await kyberDao.getLatestNetworkFeeData();

      Helper.assertEqual(32, data[0], "should get correct winning value as new network fee");
      Helper.assertEqual(blocksToSeconds(5 * epochPeriod) + daoStartTime - 1, data[1], "expiry timestamp is wrong");

      // conclude and save data
      Helper.assertEqual(32, (await kyberDao.getLatestNetworkFeeData()).feeInBps, "latest network fee is wrong");
      await kyberDao.getLatestNetworkFeeDataWithCache();
      Helper.assertEqual(32, (await kyberDao.getLatestNetworkFeeData()).feeInBps, "latest network fee is wrong");

      await updateCurrentBlockAndTimestamp();
      // min per: 40%, C = 100%, t = 1
      minPercentageInPrecision = precisionUnits.mul(new BN(40)).div(new BN(100));
      cInPrecision = precisionUnits;
      tInPrecision = precisionUnits;
      await submitNewCampaignAndDelayToStart(kyberDao,
        1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
        minPercentageInPrecision, cInPrecision, tInPrecision, [32, 26, 44], '0x', {from: daoOperator}
      );

      await kyberDao.vote(5, 1, {from: mike});
      await kyberDao.vote(5, 2, {from: loi});
      await kyberDao.vote(5, 2, {from: victor});

      // delay to epoch 6
      await Helper.mineNewBlockAt(blocksToSeconds(5 * epochPeriod) + daoStartTime);

      // no winning as most option voted percentage (59%) < threshold (60%)
      data = await kyberDao.getCampaignWinningOptionAndValue(5);
      Helper.assertEqual(0, data[0], "winning option is wrong");
      Helper.assertEqual(0, data[1], "winning option value is wrong");

      Helper.assertEqual(5, await kyberDao.networkFeeCampaigns(5), "should have network fee camp");

      data = await kyberDao.getLatestNetworkFeeData();

      Helper.assertEqual(32, data[0], "should fallback to previous data");
      Helper.assertEqual(blocksToSeconds(6 * epochPeriod) + daoStartTime - 1, data[1], "expiry timestamp is wrong");

      tx = await kyberDao.getLatestNetworkFeeDataWithCache();
      logInfo("Get Network Fee: epoch > 0, has fee camp + win option, gas used: " + tx.receipt.gasUsed);

      await resetSetupForKNCToken();
    });

    it("Test get network fee with cache returns & records correct data", async function() {
      // test get at epoch 0
      await deployContracts(2, currentBlock + 5, 2);
      await checkLatestNetworkFeeData(defaultNetworkFee, daoStartTime - 1);

      // simple setup to create camp with a winning option
      // mike: 410, victor: 410, loi 180, total stakes = 40% total supply
      await simpleSetupToTestThreshold(410, 410, 180, 40);

      // get at epoch 1, no camps
      await Helper.mineNewBlockAt(daoStartTime);
      await checkLatestNetworkFeeData(defaultNetworkFee, blocksToSeconds(epochPeriod) + daoStartTime - 1);

      // create camp, but not fee camp
      await updateCurrentBlockAndTimestamp();
      await submitNewCampaignAndDelayToStart(kyberDao,
        0, currentBlock + 2, currentBlock + 2 + minCampPeriod,
        0, 0, 0, [32, 26, 44], '0x', {from: daoOperator}
      );
      await kyberDao.vote(1, 1, {from: mike});
      await kyberDao.vote(1, 1, {from: loi});
      await kyberDao.vote(1, 1, {from: victor});

      // delay to epoch 2
      await Helper.mineNewBlockAt(blocksToSeconds(epochPeriod) + daoStartTime);
      // check data
      await checkLatestNetworkFeeData(defaultNetworkFee, blocksToSeconds(epochPeriod * 2) + daoStartTime - 1);

       // create fee camp, but no winning
      await updateCurrentBlockAndTimestamp();
      await submitNewCampaignAndDelayToStart(kyberDao,
        1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
        0, 0, 0, [32, 26, 44], '0x', {from: daoOperator}
      );
      await kyberDao.vote(2, 1, {from: mike});
      await kyberDao.vote(2, 2, {from: loi});
      await kyberDao.vote(2, 3, {from: victor});

      // delay to epoch 3
      await Helper.mineNewBlockAt(blocksToSeconds(2 * epochPeriod) + daoStartTime);
      // check data
      await checkLatestNetworkFeeData(defaultNetworkFee, blocksToSeconds(epochPeriod * 3) + daoStartTime - 1);

      // delay few epoch, to epoch 5
      await Helper.mineNewBlockAt(blocksToSeconds(4 * epochPeriod) + daoStartTime);

      // create fee camp, has winning
      await updateCurrentBlockAndTimestamp();
      await submitNewCampaignAndDelayToStart(kyberDao,
        1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
        0, 0, 0, [32, 26, 1], '0x', {from: daoOperator}
      );
      await kyberDao.vote(3, 3, {from: mike});
      await kyberDao.vote(3, 3, {from: loi});
      await kyberDao.vote(3, 3, {from: victor});
      // current epoch has network fee camp with a winning option
      // but getting network fee data for this epoch should still return previous epoch result
      await checkLatestNetworkFeeData(defaultNetworkFee, blocksToSeconds(epochPeriod * 5) + daoStartTime - 1);

      // delay to epoch 6
      await Helper.mineNewBlockAt(blocksToSeconds(5 * epochPeriod) + daoStartTime);
      // check data
      await checkLatestNetworkFeeData(1, blocksToSeconds(epochPeriod * 6) + daoStartTime - 1);

      // delay to next epoch
      await Helper.mineNewBlockAt(blocksToSeconds(6 * epochPeriod) + daoStartTime);
      // check data with no fee camp at previous epoch
      await checkLatestNetworkFeeData(1, blocksToSeconds(epochPeriod * 7) + daoStartTime - 1);

      await resetSetupForKNCToken();
    });
  });

  describe("#Get BRR Data tests", () => {
    it("Test get brr data returns correct default data for epoch 0", async function() {
      let rebate = 24;
      let reward = 26;
      defaultRewardBps = reward;
      defaultRebateBps = rebate;
      defaultBrrData = getDataFromRebateAndReward(rebate, reward);
      await deployContracts(10, currentBlock + 10, 5);

      Helper.assertEqual(defaultBrrData, await kyberDao.latestBrrResult(), "brr default is wrong");
      let dataDecoded = await kyberDao.getLatestBRRData();
      Helper.assertEqual(10000 - rebate - reward, dataDecoded.burnInBps, "burn default is wrong");
      Helper.assertEqual(reward, dataDecoded.rewardInBps, "reward default is wrong");
      Helper.assertEqual(rebate, dataDecoded.rebateInBps, "rebate default is wrong");
      Helper.assertEqual(0, dataDecoded.epoch, "epoch is wrong");
      Helper.assertEqual(daoStartTime - 1, dataDecoded.expiryTimestamp, "expiry timestamp is wrong");

      // make sure data is correct
      // reward - rebate - burn - epoch - expiry block
      let tx = await kyberDao.getLatestBRRDataWithCache();
      logInfo("Get Brr: epoch = 0, gas used: " + tx.receipt.gasUsed);

      await checkLatestBrrData(
        reward, rebate, 10000 - rebate - reward, 0, daoStartTime - 1
      );

      rebate = 46;
      reward = 54;
      let newBrrData = getDataFromRebateAndReward(rebate, reward);
      await kyberDao.setLatestBrrData(reward, rebate);
      Helper.assertEqual(newBrrData, await kyberDao.latestBrrResult(), "brr default is wrong");

      await checkLatestBrrData(
        reward, rebate, 10000 - rebate - reward, 0, daoStartTime - 1
      );
      dataDecoded = await kyberDao.getLatestBRRData();
      Helper.assertEqual(10000 - rebate - reward, dataDecoded.burnInBps, "burn default is wrong");
      Helper.assertEqual(reward, dataDecoded.rewardInBps, "reward default is wrong");
      Helper.assertEqual(rebate, dataDecoded.rebateInBps, "rebate default is wrong");
      Helper.assertEqual(0, dataDecoded.epoch, "epoch is wrong");
      Helper.assertEqual(daoStartTime - 1, dataDecoded.expiryTimestamp, "expiry timestamp is wrong");
    });

    it("Test get brr data returns correct latest data, no campaigns", async function() {
      let rebate = 24;
      let reward = 26;
      defaultRewardBps = reward;
      defaultRebateBps = rebate;
      defaultBrrData = getDataFromRebateAndReward(rebate, reward);
      await deployContracts(10, currentBlock + 10, 5);

      // delay to epoch 1
      await Helper.mineNewBlockAt(daoStartTime);
      await checkLatestBrrData(
        reward, rebate, 10000 - rebate - reward, 1, blocksToSeconds(epochPeriod) + daoStartTime - 1
      );
      let dataDecoded = await kyberDao.getLatestBRRData();
      Helper.assertEqual(10000 - rebate - reward, dataDecoded.burnInBps, "burn default is wrong");
      Helper.assertEqual(reward, dataDecoded.rewardInBps, "reward default is wrong");
      Helper.assertEqual(rebate, dataDecoded.rebateInBps, "rebate default is wrong");
      Helper.assertEqual(1, dataDecoded.epoch, "epoch is wrong");
      Helper.assertEqual(blocksToSeconds(epochPeriod) + daoStartTime - 1, dataDecoded.expiryTimestamp, "expiry timestamp is wrong");

      rebate = 46;
      reward = 54;
      let newBrrData = getDataFromRebateAndReward(rebate, reward);
      await kyberDao.setLatestBrrData(reward, rebate);
      await checkLatestBrrData(
        reward, rebate, 10000 - rebate - reward, 1, blocksToSeconds(epochPeriod) + daoStartTime - 1
      );

      // delay to epoch 4
      await Helper.mineNewBlockAt(blocksToSeconds(3 * epochPeriod) + daoStartTime);
      // get brr data for epoch 4
      await checkLatestBrrData(
        reward, rebate, 10000 - rebate - reward, 4, blocksToSeconds(epochPeriod * 4) + daoStartTime - 1
      );

      dataDecoded = await kyberDao.getLatestBRRData();
      Helper.assertEqual(10000 - rebate - reward, dataDecoded.burnInBps, "burn is wrong");
      Helper.assertEqual(reward, dataDecoded.rewardInBps, "reward is wrong");
      Helper.assertEqual(rebate, dataDecoded.rebateInBps, "rebate is wrong");
      Helper.assertEqual(4, dataDecoded.epoch, "epoch is wrong");
      Helper.assertEqual(blocksToSeconds(epochPeriod * 4) + daoStartTime - 1, dataDecoded.expiryTimestamp, "expiry timestamp is wrong");
    });

    it("Test get brr returns correct latest data, has camp but no brr campaign", async function() {
      let rebate = 24;
      let reward = 26;
      defaultRewardBps = reward;
      defaultRebateBps = rebate;
      defaultBrrData = getDataFromRebateAndReward(rebate, reward);
      await deployContracts(15, currentBlock + 20, 10);
      await setupSimpleStakingData();

      // delay to epoch 1
      await Helper.mineNewBlockAt(daoStartTime);

      await updateCurrentBlockAndTimestamp();
      await submitNewCampaignAndDelayToStart(kyberDao,
        0, currentBlock + 2, currentBlock + 2 + minCampPeriod,
        0, 0, 0, [32, 26, 44], '0x', {from: daoOperator}
      );
      await kyberDao.vote(1, 2, {from: mike});

      await updateCurrentBlockAndTimestamp();
      await submitNewCampaignAndDelayToStart(kyberDao,
        1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
        0, 0, 0, [22, 23, 24], '0x', {from: daoOperator}
      );
      await kyberDao.vote(2, 3, {from: mike});

      await Helper.mineNewBlockAt(blocksToSeconds(epochPeriod) + daoStartTime);

      let data = await kyberDao.getCampaignWinningOptionAndValue(1);

      Helper.assertEqual(2, data[0], "winning option is wrong");
      Helper.assertEqual(26, data[1], "winning option value is wrong");

      Helper.assertEqual(0, await kyberDao.brrCampaigns(1), "shouldn't have brr camp for epoch 1");

      await checkLatestBrrData(
        reward, rebate, 10000 - rebate - reward, 2, blocksToSeconds(epochPeriod * 2) + daoStartTime - 1
      );
      let tx = await kyberDao.getLatestBRRDataWithCache();
      logInfo("Get Brr: epoch > 0, no brr camp, gas used: " + tx.receipt.gasUsed);

      Helper.assertEqual(defaultBrrData, await kyberDao.latestBrrResult(), "brr default is wrong");
    });

    it("Test get brr data returns correct latest data on-going brr camp has a winning option", async function() {
      let reward = 30;
      let rebate = 20;
      defaultRewardBps = reward;
      defaultRebateBps = rebate;
      defaultBrrData = getDataFromRebateAndReward(rebate, reward);
      await simpleSetupToTestThreshold(410, 410, 180, 40);
      // min per: 40%, C = 100%, t = 1
      minPercentageInPrecision = precisionUnits.mul(new BN(40)).div(new BN(100));
      cInPrecision = precisionUnits;
      tInPrecision = precisionUnits;

      let newReward = 36;
      let newRebate = 44;
      let brrData = getDataFromRebateAndReward(newRebate, newReward);

      await updateCurrentBlockAndTimestamp();
      await submitNewCampaignAndDelayToStart(kyberDao,
        2, currentBlock + 2, currentBlock + 2 + minCampPeriod,
        minPercentageInPrecision, cInPrecision, tInPrecision, [32, brrData, 44], '0x', {from: daoOperator}
      );
      // option 2 should win
      await kyberDao.vote(1, 2, {from: mike});
      await kyberDao.vote(1, 2, {from: loi});
      await kyberDao.vote(1, 2, {from: victor});

      // camp is not ended yet, so data shouldn't change
      await checkLatestBrrData(
        reward, rebate, 10000 - rebate - reward, 1, blocksToSeconds(epochPeriod) + daoStartTime - 1
      );
      Helper.assertEqual(1, await kyberDao.brrCampaigns(1), "should have brr camp");
      let dataDecoded = await kyberDao.getLatestBRRData();
      Helper.assertEqual(10000 - rebate - reward, dataDecoded.burnInBps, "burn is wrong");
      Helper.assertEqual(reward, dataDecoded.rewardInBps, "reward is wrong");
      Helper.assertEqual(rebate, dataDecoded.rebateInBps, "rebate is wrong");
      Helper.assertEqual(1, dataDecoded.epoch, "epoch is wrong");
      Helper.assertEqual(blocksToSeconds(epochPeriod) + daoStartTime - 1, dataDecoded.expiryTimestamp, "expiry timestamp is wrong");

      // delay to epoch 2, winning option should take effect
      await Helper.mineNewBlockAt(blocksToSeconds(epochPeriod) + daoStartTime);

      dataDecoded = await kyberDao.getLatestBRRData();
      Helper.assertEqual(10000 - newRebate - newReward, dataDecoded.burnInBps, "burn is wrong");
      Helper.assertEqual(newReward, dataDecoded.rewardInBps, "reward is wrong");
      Helper.assertEqual(newRebate, dataDecoded.rebateInBps, "rebate is wrong");
      Helper.assertEqual(2, dataDecoded.epoch, "epoch is wrong");
      Helper.assertEqual(blocksToSeconds(epochPeriod * 2) + daoStartTime - 1, dataDecoded.expiryTimestamp, "expiry timestamp is wrong");

      await checkLatestBrrData(
        newReward, newRebate, 10000 - newRebate - newReward, 2, blocksToSeconds(epochPeriod * 2) + daoStartTime - 1
      );
      Helper.assertEqual(brrData, await kyberDao.latestBrrResult(), "latest brr is wrong");

      // test winning option is encoded
      dataDecoded = await kyberDao.getLatestBRRData();
      Helper.assertEqual(10000 - newRebate - newReward, dataDecoded.burnInBps, "burn is wrong");
      Helper.assertEqual(newReward, dataDecoded.rewardInBps, "reward is wrong");
      Helper.assertEqual(newRebate, dataDecoded.rebateInBps, "rebate is wrong");
      Helper.assertEqual(2, dataDecoded.epoch, "epoch is wrong");
      Helper.assertEqual(blocksToSeconds(epochPeriod * 2) + daoStartTime - 1, dataDecoded.expiryTimestamp, "expiry timestamp is wrong");

      await resetSetupForKNCToken();
    });

    it("Test get brr returns correct latest data, has brr camp but no winning option", async function() {
      let rebate = 24;
      let reward = 26;
      defaultRewardBps = reward;
      defaultRebateBps = rebate;
      defaultBrrData = getDataFromRebateAndReward(rebate, reward);
      // mike: 410, victor: 410, loi: 280, total stakes = 40% * total supply
      await simpleSetupToTestThreshold(410, 410, 180, 40);

      await updateCurrentBlockAndTimestamp();
      await submitNewCampaignAndDelayToStart(kyberDao,
        2, currentBlock + 2, currentBlock + 2 + minCampPeriod,
        0, 0, 0, [32, 26, 44], '0x', {from: daoOperator}
      );

      await kyberDao.vote(1, 2, {from: mike});
      await kyberDao.vote(1, 1, {from: victor});
      await kyberDao.vote(1, 3, {from: loi});

      // delay to epoch 2
      await Helper.mineNewBlockAt(blocksToSeconds(epochPeriod) + daoStartTime);

      // no winning as same vote count
      let data = await kyberDao.getCampaignWinningOptionAndValue(1);
      Helper.assertEqual(0, data[0], "winning option is wrong");
      Helper.assertEqual(0, data[1], "winning option value is wrong");

      Helper.assertEqual(1, await kyberDao.brrCampaigns(1), "should have brr camp for epoch 1");

      await checkLatestBrrData(
        reward, rebate, 10000 - rebate - reward, 2, blocksToSeconds(epochPeriod * 2) + daoStartTime - 1
      );
      let dataDecoded = await kyberDao.getLatestBRRData();
      Helper.assertEqual(10000 - rebate - reward, dataDecoded.burnInBps, "burn is wrong");
      Helper.assertEqual(reward, dataDecoded.rewardInBps, "reward is wrong");
      Helper.assertEqual(rebate, dataDecoded.rebateInBps, "rebate is wrong");
      Helper.assertEqual(2, dataDecoded.epoch, "epoch is wrong");
      Helper.assertEqual(blocksToSeconds(epochPeriod * 2) + daoStartTime - 1, dataDecoded.expiryTimestamp, "expiry timestamp is wrong");

      let tx = await kyberDao.getLatestBRRDataWithCache();
      logInfo("Get Brr: epoch > 0, has brr camp + no win option, gas used: " + tx.receipt.gasUsed);
      tx = await kyberDao.getLatestBRRDataWithCache();
      logInfo("Get Brr: epoch > 0, has brr camp, already concluded, gas used: " + tx.receipt.gasUsed);

      Helper.assertEqual(defaultBrrData, await kyberDao.latestBrrResult(), "brr default is wrong");

      await updateCurrentBlockAndTimestamp();
      // min per: 41%, C = 0, t = 0
      minPercentageInPrecision = precisionUnits.mul(new BN(41)).div(new BN(100));
      cInPrecision = precisionUnits;
      tInPrecision = precisionUnits;
      await submitNewCampaignAndDelayToStart(kyberDao,
        2, currentBlock + 2, currentBlock + 2 + minCampPeriod,
        minPercentageInPrecision, cInPrecision, tInPrecision, [32, 26, 44], '0x', {from: daoOperator}
      );

      await kyberDao.vote(2, 1, {from: mike});
      await kyberDao.vote(2, 1, {from: victor});
      await kyberDao.vote(2, 1, {from: loi});

      // delay to epoch 3
      await Helper.mineNewBlockAt(blocksToSeconds(2 * epochPeriod) + daoStartTime);

      // no winning as min percentage > total votes / total supply
      data = await kyberDao.getCampaignWinningOptionAndValue(2);
      Helper.assertEqual(0, data[0], "winning option is wrong");
      Helper.assertEqual(0, data[1], "winning option value is wrong");

      Helper.assertEqual(2, await kyberDao.brrCampaigns(2), "should have brr camp");

      await checkLatestBrrData(
        reward, rebate, 10000 - rebate - reward, 3, blocksToSeconds(epochPeriod * 3) + daoStartTime - 1
      );

      Helper.assertEqual(defaultBrrData, await kyberDao.latestBrrResult(), "brr default is wrong");

      await updateCurrentBlockAndTimestamp();
      // min per: 40%, C = 100%, t = 1
      minPercentageInPrecision = precisionUnits.mul(new BN(40)).div(new BN(100));
      cInPrecision = precisionUnits;
      tInPrecision = precisionUnits;
      await submitNewCampaignAndDelayToStart(kyberDao,
        2, currentBlock + 2, currentBlock + 2 + minCampPeriod,
        minPercentageInPrecision, cInPrecision, tInPrecision , [32, 26, 44], '0x', {from: daoOperator}
      );

      await kyberDao.vote(3, 1, {from: mike});
      await kyberDao.vote(3, 1, {from: loi});
      await kyberDao.vote(3, 2, {from: victor});

      // delay to epoch 4
      await Helper.mineNewBlockAt(blocksToSeconds(3 * epochPeriod) + daoStartTime);

      // no winning as most option voted percentage (59%) < threshold (60%)
      data = await kyberDao.getCampaignWinningOptionAndValue(3);
      Helper.assertEqual(0, data[0], "winning option is wrong");
      Helper.assertEqual(0, data[1], "winning option value is wrong");

      Helper.assertEqual(3, await kyberDao.brrCampaigns(3), "should have brr camp");

      await checkLatestBrrData(
        reward, rebate, 10000 - rebate - reward, 4, blocksToSeconds(epochPeriod * 4) + daoStartTime - 1
      );

      Helper.assertEqual(defaultBrrData, await kyberDao.latestBrrResult(), "brr default is wrong");

      await updateCurrentBlockAndTimestamp();
      // min per: 40%, C = 100%, t = 1
      minPercentageInPrecision = precisionUnits.mul(new BN(40)).div(new BN(100));
      cInPrecision = precisionUnits;
      tInPrecision = precisionUnits;
      await submitNewCampaignAndDelayToStart(kyberDao,
        2, currentBlock + 2, currentBlock + 2 + minCampPeriod,
        minPercentageInPrecision, cInPrecision, tInPrecision, [32, 26, 44], '0x', {from: daoOperator}
      );

      await kyberDao.vote(4, 1, {from: mike});
      await kyberDao.vote(4, 1, {from: loi});
      await kyberDao.vote(4, 1, {from: victor});

      // delay to epoch 5
      await Helper.mineNewBlockAt(blocksToSeconds(4 * epochPeriod) + daoStartTime);

      data = await kyberDao.getCampaignWinningOptionAndValue(4);
      Helper.assertEqual(1, data[0], "winning option is wrong");
      Helper.assertEqual(32, data[1], "winning option value is wrong");

      Helper.assertEqual(4, await kyberDao.brrCampaigns(4), "should have brr camp");

      await kyberDao.getLatestBRRDataWithCache();

      Helper.assertEqual(32, await kyberDao.latestBrrResult(), "brr default is wrong");

      await updateCurrentBlockAndTimestamp();
      // min per: 40%, C = 100%, t = 1
      minPercentageInPrecision = precisionUnits.mul(new BN(40)).div(new BN(100));
      cInPrecision = precisionUnits;
      tInPrecision = precisionUnits;
      await submitNewCampaignAndDelayToStart(kyberDao,
        2, currentBlock + 2, currentBlock + 2 + minCampPeriod,
        minPercentageInPrecision, cInPrecision, tInPrecision, [32, 26, 44], '0x', {from: daoOperator}
      );

      await kyberDao.vote(5, 1, {from: mike});
      await kyberDao.vote(5, 2, {from: loi});
      await kyberDao.vote(5, 2, {from: victor});

      // delay to epoch 6
      await Helper.mineNewBlockAt(blocksToSeconds(5 * epochPeriod) + daoStartTime);

      // no winning as most option voted percentage (59%) < threshold (60%)
      data = await kyberDao.getCampaignWinningOptionAndValue(5);
      Helper.assertEqual(0, data[0], "winning option is wrong");
      Helper.assertEqual(0, data[1], "winning option value is wrong");

      Helper.assertEqual(5, await kyberDao.brrCampaigns(5), "should have brr camp");

      tx = await kyberDao.getLatestBRRDataWithCache();
      logInfo("Get Brr: epoch > 0, has brr camp + win option, gas used: " + tx.receipt.gasUsed);
      tx = await kyberDao.getLatestBRRDataWithCache();
      logInfo("Get Brr: epoch > 0, has brr camp, already concluded, gas used: " + tx.receipt.gasUsed);

      Helper.assertEqual(32, await kyberDao.latestBrrResult(), "brr default is wrong");

      await resetSetupForKNCToken();
    });
  });

  describe("#Should burn all reward", () => {
    it("Test should burn all reward returns false for current + future epoch", async function() {
      await deployContracts(10, currentBlock + 15, 5);
      await setupSimpleStakingData();

      Helper.assertEqual(false, await kyberDao.shouldBurnRewardForEpoch(0), "should burn all reward result is wrong");
      Helper.assertEqual(false, await kyberDao.shouldBurnRewardForEpoch(1), "should burn all reward result is wrong");
      Helper.assertEqual(false, await kyberDao.shouldBurnRewardForEpoch(10), "should burn all reward result is wrong");

      // delay to epoch 2
      await Helper.mineNewBlockAt(blocksToSeconds(epochPeriod) + daoStartTime);

      // create camp and vote
      await updateCurrentBlockAndTimestamp();
      await submitNewCampaignAndDelayToStart(kyberDao,
        2, currentBlock + 2, currentBlock + 2 + minCampPeriod,
        0, 0, 0, [32, 26, 44], '0x', {from: daoOperator}
      );

      await kyberDao.vote(1, 1, {from: mike});
      await kyberDao.vote(1, 2, {from: loi});
      await kyberDao.vote(1, 2, {from: victor});

      Helper.assertEqual(true, await kyberDao.shouldBurnRewardForEpoch(0), "should burn all reward result is wrong");
      Helper.assertEqual(true, await kyberDao.shouldBurnRewardForEpoch(1), "should burn all reward result is wrong");
      Helper.assertEqual(false, await kyberDao.shouldBurnRewardForEpoch(2), "should burn all reward result is wrong");

      // delay to epoch 4
      await Helper.mineNewBlockAt(blocksToSeconds(3 * epochPeriod) + daoStartTime);

      Helper.assertEqual(true, await kyberDao.shouldBurnRewardForEpoch(1), "should burn all reward result is wrong");
      Helper.assertEqual(false, await kyberDao.shouldBurnRewardForEpoch(2), "should burn all reward result is wrong");
      Helper.assertEqual(true, await kyberDao.shouldBurnRewardForEpoch(3), "should burn all reward result is wrong");
      Helper.assertEqual(false, await kyberDao.shouldBurnRewardForEpoch(4), "should burn all reward result is wrong");
    });

    it("Test should burn all reward returns correct data", async function() {
      await deployContracts(10, currentBlock + 15, 5);
      await setupSimpleStakingData();

      // delay to epoch 1
      await Helper.mineNewBlockAt(daoStartTime);
      Helper.assertEqual(true, await kyberDao.shouldBurnRewardForEpoch(0), "should burn all reward result is wrong");

      // create camp
      await updateCurrentBlockAndTimestamp();
      await submitNewCampaignAndDelayToStart(kyberDao,
        0, currentBlock + 2, currentBlock + 2 + minCampPeriod,
        0, 0, 0, [32, 26, 44], '0x', {from: daoOperator}
      );

      // delay to epoch 2
      await Helper.mineNewBlockAt(blocksToSeconds(epochPeriod) + daoStartTime);
      // has camp but no vote
      Helper.assertEqual(true, await kyberDao.shouldBurnRewardForEpoch(1), "should burn all reward result is wrong");

      // create camp
      await updateCurrentBlockAndTimestamp();
      await submitNewCampaignAndDelayToStart(kyberDao,
        0, currentBlock + 2, currentBlock + 2 + minCampPeriod,
        0, 0, 0, [32, 26, 44], '0x', {from: daoOperator}
      );
      await kyberDao.vote(2, 1, {from: poolMaster});

      // delay to epoch 3
      await Helper.mineNewBlockAt(blocksToSeconds(2 * epochPeriod) + daoStartTime);
      // has camp, has vote but staker has 0 stake
      Helper.assertEqual(true, await kyberDao.shouldBurnRewardForEpoch(2), "should burn all reward result is wrong");

      // create camp
      await updateCurrentBlockAndTimestamp();
      await submitNewCampaignAndDelayToStart(kyberDao,
        0, currentBlock + 2, currentBlock + 2 + minCampPeriod,
        0, 0, 0, [32, 26, 44], '0x', {from: daoOperator}
      );
      await kyberDao.vote(3, 1, {from: mike});
      await stakingContract.withdraw(initMikeStake, {from: mike});

      await stakingContract.delegate(poolMaster, {from: loi});

      // delay to epoch 4
      await Helper.mineNewBlockAt(blocksToSeconds(3 * epochPeriod) + daoStartTime);
      // has camp, voted with staker has stakes, but then withdraw all
      Helper.assertEqual(true, await kyberDao.shouldBurnRewardForEpoch(3), "should burn all reward result is wrong");

      // create camp
      await updateCurrentBlockAndTimestamp();
      await submitNewCampaignAndDelayToStart(kyberDao,
        0, currentBlock + 2, currentBlock + 2 + minCampPeriod,
        0, 0, 0, [32, 26, 44], '0x', {from: daoOperator}
      );
      await kyberDao.vote(4, 1, {from: poolMaster});
      await stakingContract.withdraw(initLoiStake, {from: loi});

      // delay to epoch 5
      await Helper.mineNewBlockAt(blocksToSeconds(4 * epochPeriod) + daoStartTime);
      // has camp, voted with staker has delegated stakes, but then withdraw all
      Helper.assertEqual(true, await kyberDao.shouldBurnRewardForEpoch(4), "should burn all reward result is wrong");

      // create camp
      await updateCurrentBlockAndTimestamp();
      await submitNewCampaignAndDelayToStart(kyberDao,
        0, currentBlock + 2, currentBlock + 2 + minCampPeriod,
        0, 0, 0, [32, 26, 44], '0x', {from: daoOperator}
      );
      await kyberDao.vote(5, 1, {from: victor});

      // delay to epoch 6
      await Helper.mineNewBlockAt(blocksToSeconds(5 * epochPeriod) + daoStartTime);
      // has camp, voted with stakes, burn should be false
      Helper.assertEqual(false, await kyberDao.shouldBurnRewardForEpoch(5), "should burn all reward result is wrong");

      // delay to epoch 6
      await updateCurrentBlockAndTimestamp();
      await Helper.mineNewBlockAt(blocksToSeconds(6 * epochPeriod) + daoStartTime);
      // no camp, no reward
      Helper.assertEqual(true, await kyberDao.shouldBurnRewardForEpoch(6), "should burn all reward result is wrong");
    });
  });

  describe("#Constructor tests", () => {
    it("Test correct data is set after deployment", async function() {
      await deployContracts(10, currentBlock + 10, 10);

      Helper.assertEqual(await kyberDao.epochPeriodInSeconds(), blocksToSeconds(10), "Epoch period is wrong");
      Helper.assertEqual(await kyberDao.firstEpochStartTimestamp(), daoStartTime, "Start timestamp is wrong");
      Helper.assertEqual(await kyberDao.kncToken(), kncToken.address, "KNC token is wrong");
      Helper.assertEqual(await kyberDao.staking(), stakingContract.address, "Staking contract is wrong");
      Helper.assertEqual(await kyberDao.MAX_CAMPAIGN_OPTIONS(), 8, "max camp option is wrong");
      Helper.assertEqual(await kyberDao.minCampaignDurationInSeconds(), blocksToSeconds(minCampPeriod), "min camp period is wrong");
      Helper.assertEqual((await kyberDao.getLatestNetworkFeeData()).feeInBps, defaultNetworkFee, "default network fee is wrong");
      Helper.assertEqual(await kyberDao.latestBrrResult(), defaultBrrData, "default brr data is wrong");
      Helper.assertEqual(await kyberDao.daoOperator(), daoOperator, "daoOperator is wrong");
      Helper.assertEqual(await kyberDao.numberCampaigns(), 0, "number campaign is wrong");
      Helper.assertEqual(await kyberDao.kncToken(), await stakingContract.kncToken(), "knc token is wrong");
      Helper.assertEqual(await kyberDao.epochPeriodInSeconds(), await stakingContract.epochPeriodInSeconds(), "epochPeriodInSeconds is wrong");
      Helper.assertEqual(await kyberDao.firstEpochStartTimestamp(), await stakingContract.firstEpochStartTimestamp(), "firstEpochStartTimestamp is wrong");
      Helper.assertEqual(await kyberDao.address, await stakingContract.kyberDao(), "kyberDao is wrong");
    });

    it("Test constructor should revert invalid arguments", async function() {
      // epoch period is 0
      await expectRevert(
        KyberDaoContract.new(
          0, blockToTimestamp(currentBlock + 50),
          kncToken.address, minCampPeriod,
          defaultNetworkFee, defaultRewardBps, defaultRebateBps,
          daoOperator
        ),
        "ctor: epoch period is 0"
      )
      // start in the past
      await expectRevert(
        KyberDaoContract.new(
          blocksToSeconds(20), blockToTimestamp(currentBlock - 1),
          kncToken.address, minCampPeriod,
          defaultNetworkFee, defaultRewardBps, defaultRebateBps,
          daoOperator
        ),
        "ctor: start in the past"
      )
      // knc missing
      await expectRevert(
        KyberDaoContract.new(
          blocksToSeconds(10), blockToTimestamp(currentBlock + 50),
          zeroAddress, minCampPeriod,
          defaultNetworkFee, defaultRewardBps, defaultRebateBps,
          daoOperator
        ),
        "ctor: knc token 0"
      )
      // network fee is high (>= 50%)
      await expectRevert(
        KyberDaoContract.new(
          blocksToSeconds(10), blockToTimestamp(currentBlock + 50),
          kncToken.address, minCampPeriod,
          5000, defaultRewardBps, defaultRebateBps,
          daoOperator
        ),
        "ctor: network fee high"
      )
      // brr is high
      await expectRevert(
        KyberDaoContract.new(
          blocksToSeconds(10), blockToTimestamp(currentBlock + 50),
          kncToken.address, minCampPeriod,
          defaultNetworkFee, defaultRewardBps, 10001 - defaultRewardBps,
          daoOperator
        ),
        "reward plus rebate high"
      )
      // brr is high
      await expectRevert(
        KyberDaoContract.new(
          blocksToSeconds(10), blockToTimestamp(currentBlock + 50),
          kncToken.address, minCampPeriod,
          defaultNetworkFee, 10001 - defaultRebateBps, defaultRebateBps,
          daoOperator
        ),
        "reward plus rebate high"
      )
      // creator is zero
      await expectRevert(
        KyberDaoContract.new(
          blocksToSeconds(10), blockToTimestamp(currentBlock + 50),
          kncToken.address, minCampPeriod,
          defaultNetworkFee, defaultRewardBps, defaultRebateBps,
          zeroAddress
        ),
        "daoOperator is 0"
      )
    });
  });

  describe("#Helper Function tests", () => {
    it("Test getRebateAndRewardFromData returns correct data", async function() {
      await deployContracts(10, currentBlock + 10, 10);
      let reward = 0;
      let rebate = 0;

      let data = getDataFromRebateAndReward(rebate, reward);
      let result = await kyberDao.getRebateAndRewardFromData(data);

      Helper.assertEqual(rebate, result[0], "rebate data is wrong");
      Helper.assertEqual(reward, result[1], "reward data is wrong");

      reward = 10000;
      rebate = 0;
      data = getDataFromRebateAndReward(rebate, reward);
      result = await kyberDao.getRebateAndRewardFromData(data);

      Helper.assertEqual(rebate, result[0], "rebate data is wrong");
      Helper.assertEqual(reward, result[1], "reward data is wrong");

      reward = 0;
      rebate = 10000;
      data = getDataFromRebateAndReward(rebate, reward);
      result = await kyberDao.getRebateAndRewardFromData(data);

      Helper.assertEqual(rebate, result[0], "rebate data is wrong");
      Helper.assertEqual(reward, result[1], "reward data is wrong");

      reward = 5000;
      rebate = 5000;
      data = getDataFromRebateAndReward(rebate, reward);
      result = await kyberDao.getRebateAndRewardFromData(data);

      Helper.assertEqual(rebate, result[0], "rebate data is wrong");
      Helper.assertEqual(reward, result[1], "reward data is wrong");

      reward = 2424;
      rebate = 3213;
      data = getDataFromRebateAndReward(rebate, reward);
      result = await kyberDao.getRebateAndRewardFromData(data);

      Helper.assertEqual(rebate, result[0], "rebate data is wrong");
      Helper.assertEqual(reward, result[1], "reward data is wrong");
    });

    it("Test getDataFromRewardAndRebateWithValidation returns correct data", async function() {
      await deployContracts(10, currentBlock + 10, 10);
      let reward = 0;
      let rebate = 0;

      let data = getDataFromRebateAndReward(rebate, reward);
      let result = await kyberDao.getDataFromRewardAndRebateWithValidation(reward, rebate);

      Helper.assertEqual(data, result, "encode function returns different value");

      reward = 10000;
      rebate = 0;
      data = getDataFromRebateAndReward(rebate, reward);
      result = await kyberDao.getDataFromRewardAndRebateWithValidation(reward, rebate);

      Helper.assertEqual(data, result, "encode function returns different value");

      reward = 0;
      rebate = 10000;
      data = getDataFromRebateAndReward(rebate, reward);
      result = await kyberDao.getDataFromRewardAndRebateWithValidation(reward, rebate);

      Helper.assertEqual(data, result, "encode function returns different value");

      reward = 5000;
      rebate = 5000;
      data = getDataFromRebateAndReward(rebate, reward);
      result = await kyberDao.getDataFromRewardAndRebateWithValidation(reward, rebate);

      Helper.assertEqual(data, result, "encode function returns different value");

      reward = 2424;
      rebate = 3213;
      data = getDataFromRebateAndReward(rebate, reward);
      result = await kyberDao.getDataFromRewardAndRebateWithValidation(reward, rebate);

      Helper.assertEqual(data, result, "encode function returns different value");
    });

    it("Test getDataFromRewardAndRebateWithValidation should revert total amount > bps (10000)", async function() {
      await deployContracts(10, currentBlock + 10, 10);
      let reward = 10001;
      let rebate = 0;
      await expectRevert(
        kyberDao.getDataFromRewardAndRebateWithValidation(reward, rebate),
        "reward plus rebate high"
      )

      reward = 0;
      rebate = 10001;
      await expectRevert(
        kyberDao.getDataFromRewardAndRebateWithValidation(reward, rebate),
        "reward plus rebate high"
      )

      reward = 5001;
      rebate = 5000;
      await expectRevert(
        kyberDao.getDataFromRewardAndRebateWithValidation(reward, rebate),
        "reward plus rebate high"
      )

      reward = 2424;
      rebate = 10010 - reward;
      await expectRevert(
        kyberDao.getDataFromRewardAndRebateWithValidation(reward, rebate),
        "reward plus rebate high"
      )
    });
  });
});

function logInfo(message) {
  console.log("       " + message);
}

function logNumber(num) {
  console.log((new BN(num)).toString(10));
}

function mulPrecision(value) {
  return precisionUnits.mul(new BN(value));
}

function getDataFromRebateAndReward(rebate, reward) {
  let power128 = new BN(2).pow(new BN(128));
  return (new BN(rebate).mul(power128)).add(new BN(reward));
}
