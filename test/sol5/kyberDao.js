const TestToken = artifacts.require("Token.sol");
const DAOContract = artifacts.require("MockKyberDaoMoreGetters.sol");
const StakingContract = artifacts.require("KyberStaking.sol");
const MockFeeHandler = artifacts.require("MockFeeHandlerNoContructor.sol");
const MockMaliciousDAO = artifacts.require("MockMaliciousDAO.sol");
const MockFeeHandlerClaimRewardFailed = artifacts.require("MockFeeHandlerClaimRewardFailed.sol");
const Helper = require("../helper.js");

const BN = web3.utils.BN;

const { precisionUnits, zeroAddress } = require("../helper.js");
const { expectEvent, expectRevert } = require('@openzeppelin/test-helpers');

let campCreator;

let currentBlock;

let epochPeriod = 20;
let startBlock;
let kncToken;
let stakingContract;
let feeHandler;
let daoContract;
let victor;
let loi;
let mike;
let poolMaster;
let poolMaster2;
let maxCampOptions = 4;
let minCampPeriod = 10; // 10 blocks
let defaultNetworkFee = 25;
let defaultRewardBps = 3000; // 30%
let defaultRebateBps = 2000; // 20%
let defaultBrrData = getDataFromRebateAndReward(25, 25);
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

contract('KyberDAO', function(accounts) {
    before("one time init", async() => {
        campCreator = accounts[1];
        kncToken = await TestToken.new("Kyber Network Crystal", "KNC", 18);
        victor = accounts[2];
        loi = accounts[3];
        mike = accounts[4];
        campCreator = accounts[5];
        poolMaster = accounts[6];
        poolMaster2 = accounts[7];
        feeHandler = await MockFeeHandler.new();

        await kncToken.transfer(victor, mulPrecision(1000000));
        await kncToken.transfer(mike, mulPrecision(1000000));
        await kncToken.transfer(loi, mulPrecision(1000000));
        await kncToken.transfer(poolMaster, mulPrecision(1000000));
        await kncToken.transfer(poolMaster2, mulPrecision(1000000));
    });

    beforeEach("running before each test", async() => {
        currentBlock = await Helper.getCurrentBlock();
    });

    const deployContracts = async(_epochPeriod, _startBlock, _campPeriod) => {
        epochPeriod = _epochPeriod;
        startBlock = _startBlock;
        stakingContract = await StakingContract.new(kncToken.address, epochPeriod, startBlock, campCreator);

        minCampPeriod = _campPeriod;
        daoContract = await DAOContract.new(
            epochPeriod, startBlock,
            stakingContract.address,  feeHandler.address, kncToken.address,
            maxCampOptions, minCampPeriod,
            defaultNetworkFee, defaultRewardBps, defaultRebateBps,
            campCreator
        )
        await stakingContract.updateDAOAddressAndRemoveSetter(daoContract.address, {from: campCreator});
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

        currentBlock = await Helper.getCurrentBlock();
        await deployContracts(20, currentBlock + 20, 8);
        await setupSimpleStakingData();

        currentBlock = await Helper.getCurrentBlock();
        await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock);
    }

    describe("#Handle Withdrawal tests", () => {
        it("Test handle withdrawal update correct points and vote count - no delegation", async function() {
            await deployContracts(20, currentBlock + 20, 10);
            await setupSimpleStakingData();

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock - 1);

            currentBlock = await Helper.getCurrentBlock();
            let link = web3.utils.fromAscii("https://kyberswap.com");
            await daoContract.submitNewCampaign(
                0, currentBlock + 3, currentBlock + 3 + minCampPeriod,
                minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3, 4], link, {from: campCreator}
            );

            // withdraw when no votes
            let totalPoints = new BN(0);
            Helper.assertEqual(totalPoints, await daoContract.getTotalPoints(1), "points should be correct");
            await stakingContract.withdraw(mulPrecision(10), {from: victor});
            Helper.assertEqual(totalPoints, await daoContract.getTotalPoints(1), "points should be correct");

            await daoContract.vote(1, 1, {from: victor});

            totalPoints.iadd(initVictorStake).isub(mulPrecision(10));
            let voteCount1 = new BN(0);
            voteCount1.iadd(initVictorStake).isub(mulPrecision(10));

            Helper.assertEqual(totalPoints, await daoContract.getTotalPoints(1), "points should be correct");

            let voteData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(voteData.totalVoteCount, totalPoints, "total camp votes is incorrect");
            Helper.assertEqual(voteData.voteCounts[0], voteCount1, "option voted count is incorrect");
            Helper.assertEqual(voteData.voteCounts[1], 0, "option voted count is incorrect");

            await stakingContract.withdraw(mulPrecision(100), {from: victor});

            totalPoints.isub(mulPrecision(100));
            voteCount1.isub(mulPrecision(100));

            Helper.assertEqual(totalPoints, await daoContract.getTotalPoints(1), "points should be correct");

            voteData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(voteData.totalVoteCount, totalPoints, "total camp votes is incorrect");
            Helper.assertEqual(voteData.voteCounts[0], voteCount1, "option voted count is incorrect");
            Helper.assertEqual(voteData.voteCounts[1], 0, "option voted count is incorrect");

            await stakingContract.withdraw(mulPrecision(100), {from: mike});

            Helper.assertEqual(totalPoints, await daoContract.getTotalPoints(1), "points should be correct");

            voteData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(voteData.totalVoteCount, totalPoints, "total camp votes is incorrect");
            Helper.assertEqual(voteData.voteCounts[0], voteCount1, "option voted count is incorrect");
            Helper.assertEqual(voteData.voteCounts[1], 0, "option voted count is incorrect");

            await daoContract.vote(1, 2, {from: mike});
            totalPoints.iadd(initMikeStake).isub(mulPrecision(100));
            let voteCount2 = initMikeStake.sub(mulPrecision(100));

            Helper.assertEqual(totalPoints, await daoContract.getTotalPoints(1), "points should be correct");

            voteData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(voteData.totalVoteCount, totalPoints, "total camp votes is incorrect");
            Helper.assertEqual(voteData.voteCounts[0], voteCount1, "option voted count is incorrect");
            Helper.assertEqual(voteData.voteCounts[1], voteCount2, "option voted count is incorrect");
            Helper.assertEqual(voteData.voteCounts[2], 0, "option voted count is incorrect");

            await stakingContract.withdraw(mulPrecision(100), {from: mike});
            totalPoints.isub(mulPrecision(100));
            voteCount2.isub(mulPrecision(100));

            Helper.assertEqual(totalPoints, await daoContract.getTotalPoints(1), "points should be correct");

            voteData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(voteData.totalVoteCount, totalPoints, "total camp votes is incorrect");
            Helper.assertEqual(voteData.voteCounts[0], voteCount1, "option voted count is incorrect");
            Helper.assertEqual(voteData.voteCounts[1], voteCount2, "option voted count is incorrect");
            Helper.assertEqual(voteData.voteCounts[2], 0, "option voted count is incorrect");

            await stakingContract.deposit(mulPrecision(200), {from: victor});

            Helper.assertEqual(totalPoints, await daoContract.getTotalPoints(1), "points should be correct");

            voteData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(voteData.totalVoteCount, totalPoints, "total camp votes is incorrect");
            Helper.assertEqual(voteData.voteCounts[0], voteCount1, "option voted count is incorrect");
            Helper.assertEqual(voteData.voteCounts[1], voteCount2, "option voted count is incorrect");
            Helper.assertEqual(voteData.voteCounts[2], 0, "option voted count is incorrect");

            // less than new deposit (200)
            await stakingContract.withdraw(mulPrecision(100), {from: victor});

            Helper.assertEqual(totalPoints, await daoContract.getTotalPoints(1), "points should be correct");

            voteData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(voteData.totalVoteCount, totalPoints, "total camp votes is incorrect");
            Helper.assertEqual(voteData.voteCounts[0], voteCount1, "option voted count is incorrect");
            Helper.assertEqual(voteData.voteCounts[1], voteCount2, "option voted count is incorrect");
            Helper.assertEqual(voteData.voteCounts[2], 0, "option voted count is incorrect");

            // total withdraw is 400 more than new deposit (200)
            await stakingContract.withdraw(mulPrecision(300), {from: victor});

            totalPoints.isub(mulPrecision(200));
            voteCount1.isub(mulPrecision(200));
            Helper.assertEqual(totalPoints, await daoContract.getTotalPoints(1), "points should be correct");

            voteData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(voteData.totalVoteCount, totalPoints, "total camp votes is incorrect");
            Helper.assertEqual(voteData.voteCounts[0], voteCount1, "option voted count is incorrect");
            Helper.assertEqual(voteData.voteCounts[1], voteCount2, "option voted count is incorrect");
            Helper.assertEqual(voteData.voteCounts[2], 0, "option voted count is incorrect");

            // change vote of victor from 1 to 2, make sure vote counts change correctly after withdraw
            await daoContract.vote(1, 2, {from: victor});
            voteCount2.iadd(voteCount1);
            voteCount1 = new BN(0);

            Helper.assertEqual(totalPoints, await daoContract.getTotalPoints(1), "points should be correct");

            voteData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(voteData.totalVoteCount, totalPoints, "total camp votes is incorrect");
            Helper.assertEqual(voteData.voteCounts[0], voteCount1, "option voted count is incorrect");
            Helper.assertEqual(voteData.voteCounts[1], voteCount2, "option voted count is incorrect");
            Helper.assertEqual(voteData.voteCounts[2], 0, "option voted count is incorrect");

            await stakingContract.withdraw(mulPrecision(100), {from: victor});

            totalPoints.isub(mulPrecision(100));
            voteCount2.isub(mulPrecision(100));

            Helper.assertEqual(totalPoints, await daoContract.getTotalPoints(1), "points should be correct");

            voteData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(voteData.totalVoteCount, totalPoints, "total camp votes is incorrect");
            Helper.assertEqual(voteData.voteCounts[0], voteCount1, "option voted count is incorrect");
            Helper.assertEqual(voteData.voteCounts[1], voteCount2, "option voted count is incorrect");
            Helper.assertEqual(voteData.voteCounts[2], 0, "option voted count is incorrect");
        });

        it("Test handle withdrawal updates correct points with multiple voted campaigns - no delegation", async function() {
            await deployContracts(100, currentBlock + 20, 10);
            await setupSimpleStakingData();

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock - 1);

            currentBlock = await Helper.getCurrentBlock();
            let link = web3.utils.fromAscii("https://kyberswap.com");
            let txResult = await daoContract.submitNewCampaign(
                0, currentBlock + 3, currentBlock + 3 + minCampPeriod,
                minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3, 4], link, {from: campCreator}
            );
            expectEvent(txResult, 'NewCampaignCreated', {
                campType: new BN(0),
                campID: new BN(1),
                startBlock: new BN(currentBlock + 3),
                endBlock: new BN(currentBlock + 3 + minCampPeriod),
                minPercentageInPrecision: new BN(minPercentageInPrecision),
                cInPrecision: new BN(cInPrecision),
                tInPrecision: new BN(tInPrecision),
                link: link
            });

            // deplay to start of first camp
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 3);
            // vote for first campaign
            await daoContract.vote(1, 1, {from: victor});

            // check total points
            let totalEpochPoints = (new BN(0)).add(initVictorStake);
            let totalCampPoint1 = (new BN(0)).add(initVictorStake);
            let voteCount11 = (new BN(0)).add(initVictorStake);
            // check pts and vote counts
            Helper.assertEqual(totalEpochPoints, await daoContract.getTotalPoints(1), "points should be correct");
            let voteData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(voteData.totalVoteCount, totalCampPoint1, "total camp votes is incorrect");
            Helper.assertEqual(voteData.voteCounts[0], voteCount11, "option voted count is incorrect");

            currentBlock = await Helper.getCurrentBlock();
            txResult = await daoContract.submitNewCampaign(
                1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
                minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3, 4], link, {from: campCreator}
            );
            expectEvent(txResult, 'NewCampaignCreated', {
                campType: new BN(1),
                campID: new BN(2),
                startBlock: new BN(currentBlock + 2),
                endBlock: new BN(currentBlock + 2 + minCampPeriod),
                minPercentageInPrecision: minPercentageInPrecision,
                cInPrecision: cInPrecision,
                tInPrecision: tInPrecision,
                link: link
            });

            // vote for first campaign
            await daoContract.vote(2, 2, {from: victor});

            totalEpochPoints.iadd(initVictorStake);
            let totalCampPoint2 = (new BN(0)).add(initVictorStake);
            let voteCount22 = (new BN(0)).add(initVictorStake);

            // check pts and vote counts
            Helper.assertEqual(totalEpochPoints, await daoContract.getTotalPoints(1), "points should be correct");
            voteData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(voteData.totalVoteCount, totalCampPoint1, "total camp votes is incorrect");
            Helper.assertEqual(voteData.voteCounts[0], voteCount11, "option voted count is incorrect");
            voteData = await daoContract.getCampaignVoteCountData(2);
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
            Helper.assertEqual(totalEpochPoints, await daoContract.getTotalPoints(1), "points should be correct");
            voteData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(voteData.totalVoteCount, totalCampPoint1, "total camp votes is incorrect");
            Helper.assertEqual(voteData.voteCounts[0], voteCount11, "option voted count is incorrect");
            voteData = await daoContract.getCampaignVoteCountData(2);
            Helper.assertEqual(voteData.totalVoteCount, totalCampPoint2, "total camp votes is incorrect");
            Helper.assertEqual(voteData.voteCounts[1], voteCount22, "option voted count is incorrect");

            await daoContract.vote(1, 2, {from: victor});
            // check pts and vote counts
            Helper.assertEqual(totalEpochPoints, await daoContract.getTotalPoints(1), "points should be correct");
            voteData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(voteData.totalVoteCount, totalCampPoint1, "total camp votes is incorrect");
            Helper.assertEqual(voteData.voteCounts[1], voteCount11, "option voted count is incorrect");
            voteData = await daoContract.getCampaignVoteCountData(2);
            Helper.assertEqual(voteData.totalVoteCount, totalCampPoint2, "total camp votes is incorrect");
            Helper.assertEqual(voteData.voteCounts[1], voteCount22, "option voted count is incorrect");

            // delay to end of campaign 1
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 5);

            // withdraw should change epoch points, but only camp2 vote data
            await stakingContract.withdraw(mulPrecision(100), {from: victor});
            // update points and vote counts, only campaign 2 voted counts are updated
            totalEpochPoints.isub(mulPrecision(100 * 2));
            totalCampPoint2.isub(mulPrecision(100));
            voteCount22.isub(mulPrecision(100));
            // check pts and vote counts
            Helper.assertEqual(totalEpochPoints, await daoContract.getTotalPoints(1), "points should be correct");
            voteData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(voteData.totalVoteCount, totalCampPoint1, "total camp votes is incorrect");
            Helper.assertEqual(voteData.voteCounts[1], voteCount11, "option voted count is incorrect");
            voteData = await daoContract.getCampaignVoteCountData(2);
            Helper.assertEqual(voteData.totalVoteCount, totalCampPoint2, "total camp votes is incorrect");
            Helper.assertEqual(voteData.voteCounts[1], voteCount22, "option voted count is incorrect");

            currentBlock = await Helper.getCurrentBlock();
            // create new campaign far from current block
            txResult = await daoContract.submitNewCampaign(
                2, currentBlock + 20, currentBlock + 20 + minCampPeriod,
                minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3, 4], link, {from: campCreator}
            );
            expectEvent(txResult, 'NewCampaignCreated', {
                campType: new BN(2),
                campID: new BN(3),
                startBlock: new BN(currentBlock + 20),
                endBlock: new BN(currentBlock + 20 + minCampPeriod),
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
            Helper.assertEqual(totalEpochPoints, await daoContract.getTotalPoints(1), "points should be correct");
            voteData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(voteData.totalVoteCount, totalCampPoint1, "total camp votes is incorrect");
            Helper.assertEqual(voteData.voteCounts[1], voteCount11, "option voted count is incorrect");
            voteData = await daoContract.getCampaignVoteCountData(2);
            Helper.assertEqual(voteData.totalVoteCount, totalCampPoint2, "total camp votes is incorrect");
            Helper.assertEqual(voteData.voteCounts[1], voteCount22, "option voted count is incorrect");
            // data for camp 3 should be 0
            voteData = await daoContract.getCampaignVoteCountData(3);
            Helper.assertEqual(voteData.totalVoteCount, 0, "total camp votes is incorrect");
        });

        it("Test handle withdrawal updates correct data after withdraw - with delegation", async function() {
            await deployContracts(50, currentBlock + 20, 20);
            await setupSimpleStakingData();
            await stakingContract.delegate(mike, {from: victor});
            await stakingContract.delegate(victor, {from: loi});

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock);

            currentBlock = await Helper.getCurrentBlock();
            let link = web3.utils.fromAscii("https://kyberswap.com");
            await daoContract.submitNewCampaign(
                0, currentBlock + 3, currentBlock + 3 + minCampPeriod,
                minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3, 4], link, {from: campCreator}
            );

            // deplay to start of first camp
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 3);

            // vote for first campaign
            await daoContract.vote(1, 1, {from: mike});

            // check total points
            let totalEpochPoints = (new BN(0)).add(initVictorStake).add(initMikeStake);
            let totalCampPoint1 = (new BN(0)).add(initVictorStake).add(initMikeStake);
            let voteCount11 = (new BN(0)).add(initVictorStake).add(initMikeStake);

            // check pts and vote counts
            Helper.assertEqual(totalEpochPoints, await daoContract.getTotalPoints(1), "points should be correct");
            let voteData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(voteData.totalVoteCount, totalCampPoint1, "total camp votes is incorrect");
            Helper.assertEqual(voteData.voteCounts[0], voteCount11, "option voted count is incorrect");

            let victorWithdrewAmt = mulPrecision(100);
            await stakingContract.withdraw(victorWithdrewAmt, {from: victor});

            totalEpochPoints.isub(victorWithdrewAmt);
            totalCampPoint1.isub(victorWithdrewAmt);
            voteCount11.isub(victorWithdrewAmt);

            // check pts and vote counts
            Helper.assertEqual(totalEpochPoints, await daoContract.getTotalPoints(1), "points should be correct");
            voteData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(voteData.totalVoteCount, totalCampPoint1, "total camp votes is incorrect");
            Helper.assertEqual(voteData.voteCounts[0], voteCount11, "option voted count is incorrect");

            // withdraw from staker with no votes
            await stakingContract.withdraw(mulPrecision(10), {from: loi});
            // check pts and vote counts
            Helper.assertEqual(totalEpochPoints, await daoContract.getTotalPoints(1), "points should be correct");
            voteData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(voteData.totalVoteCount, totalCampPoint1, "total camp votes is incorrect");
            Helper.assertEqual(voteData.voteCounts[0], voteCount11, "option voted count is incorrect");

            await daoContract.vote(1, 2, {from: victor});
            // note: Loi already withdraw 10 knc
            totalEpochPoints.iadd(initLoiStake).isub(mulPrecision(10));
            totalCampPoint1.iadd(initLoiStake).isub(mulPrecision(10));
            let voteCount12 = (new BN(0)).add(initLoiStake).isub(mulPrecision(10));

            // check pts and vote counts
            Helper.assertEqual(totalEpochPoints, await daoContract.getTotalPoints(1), "points should be correct");
            voteData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(voteData.totalVoteCount, totalCampPoint1, "total camp votes is incorrect");
            Helper.assertEqual(voteData.voteCounts[0], voteCount11, "option voted count is incorrect");
            Helper.assertEqual(voteData.voteCounts[1], voteCount12, "option voted count is incorrect");

            await daoContract.vote(1, 3, {from: loi});
            // check pts and vote counts, nothing should be changed
            Helper.assertEqual(totalEpochPoints, await daoContract.getTotalPoints(1), "points should be correct");
            voteData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(voteData.totalVoteCount, totalCampPoint1, "total camp votes is incorrect");
            Helper.assertEqual(voteData.voteCounts[0], voteCount11, "option voted count is incorrect");
            Helper.assertEqual(voteData.voteCounts[1], voteCount12, "option voted count is incorrect");

            await stakingContract.delegate(loi, {from: victor});

            // check pts and vote counts, nothing should be changed
            Helper.assertEqual(totalEpochPoints, await daoContract.getTotalPoints(1), "points should be correct");
            voteData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(voteData.totalVoteCount, totalCampPoint1, "total camp votes is incorrect");
            Helper.assertEqual(voteData.voteCounts[0], voteCount11, "option voted count is incorrect");
            Helper.assertEqual(voteData.voteCounts[1], voteCount12, "option voted count is incorrect");

            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                0, currentBlock + 3, currentBlock + 3 + minCampPeriod,
                minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3, 4], link, {from: campCreator}
            );
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 2);

            await daoContract.vote(2, 1, {from: mike});
            totalEpochPoints.iadd(initMikeStake).iadd(initVictorStake).isub(victorWithdrewAmt);
            let totalCampPoint2 = (new BN(0)).add(initMikeStake).add(initVictorStake).sub(victorWithdrewAmt);
            let voteCount21 = (new BN(0)).add(initMikeStake).add(initVictorStake).sub(victorWithdrewAmt);

            // check pts and vote counts
            Helper.assertEqual(totalEpochPoints, await daoContract.getTotalPoints(1), "points should be correct");
            voteData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(voteData.totalVoteCount, totalCampPoint1, "total camp votes is incorrect");
            Helper.assertEqual(voteData.voteCounts[0], voteCount11, "option voted count is incorrect");
            Helper.assertEqual(voteData.voteCounts[1], voteCount12, "option voted count is incorrect");
            voteData = await daoContract.getCampaignVoteCountData(2);
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
            Helper.assertEqual(totalEpochPoints, await daoContract.getTotalPoints(1), "points should be correct");
            voteData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(voteData.totalVoteCount, totalCampPoint1, "total camp votes is incorrect");
            Helper.assertEqual(voteData.voteCounts[0], voteCount11, "option voted count is incorrect");
            Helper.assertEqual(voteData.voteCounts[1], voteCount12, "option voted count is incorrect");
            voteData = await daoContract.getCampaignVoteCountData(2);
            Helper.assertEqual(voteData.totalVoteCount, totalCampPoint2, "total camp votes is incorrect");
            Helper.assertEqual(voteData.voteCounts[0], voteCount21, "option voted count is incorrect");

            // delay until first camp is ended
            let data = await daoContract.getCampaignDetails(1);
            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], data[2] - currentBlock);

            await stakingContract.withdraw(mulPrecision(100), {from: victor});

            // campaign 1 is ended, so data for camp 1 shouldn't be changed
            totalEpochPoints.isub(mulPrecision(100 * 2));
            totalCampPoint2.isub(mulPrecision(100));
            voteCount21.isub(mulPrecision(100));

            Helper.assertEqual(totalEpochPoints, await daoContract.getTotalPoints(1), "points should be correct");
            voteData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(voteData.totalVoteCount, totalCampPoint1, "total camp votes is incorrect");
            Helper.assertEqual(voteData.voteCounts[0], voteCount11, "option voted count is incorrect");
            Helper.assertEqual(voteData.voteCounts[1], voteCount12, "option voted count is incorrect");
            voteData = await daoContract.getCampaignVoteCountData(2);
            Helper.assertEqual(voteData.totalVoteCount, totalCampPoint2, "total camp votes is incorrect");
            Helper.assertEqual(voteData.voteCounts[0], voteCount21, "option voted count is incorrect");
        });

        it("Test handle withdrawal should revert when sender is not staking", async function() {
            let stakingContract = await StakingContract.new(kncToken.address, 10, currentBlock + 10, campCreator);
            daoContract = await DAOContract.new(
                10, currentBlock + 10,
                stakingContract.address,  feeHandler.address, kncToken.address,
                maxCampOptions, minCampPeriod, defaultNetworkFee, defaultRewardBps, defaultRebateBps,
                campCreator
            )
            await daoContract.replaceStakingContract(mike);
            Helper.assertEqual(mike, await daoContract.staking(), "staking contract is setting wrongly");

            await expectRevert(
                daoContract.handleWithdrawal(victor, 0, {from: victor}),
                "only staking contract"
            );
            await expectRevert(
                daoContract.handleWithdrawal(victor, mulPrecision(10), {from: campCreator}),
                "only staking contract"
            );

            await daoContract.handleWithdrawal(victor, 0, {from: mike});
        });
    });

    describe("#Submit Campaign tests", () => {
        it("Test submit campaign returns correct data after created", async function() {
            await deployContracts(10, currentBlock + 30, 10);

            Helper.assertEqual(0, await daoContract.networkFeeCamp(0), "shouldn't have network fee camp");
            Helper.assertEqual(0, await daoContract.brrCampaign(0), "shouldn't have brr camp");

            let totalSupply = await kncToken.INITIAL_SUPPLY();

            let gasUsed = new BN(0);
            for(let id = 0; id <= 2; id++) {
                Helper.assertEqual(false, await daoContract.campExists(id + 1), "campaign shouldn't be existed");
                let link = web3.utils.fromAscii(id == 0 ? "" : "some_link");
                let tx = await daoContract.submitNewCampaign(
                    id, currentBlock + 2 * id + 5, currentBlock + 2 * id + 5 + minCampPeriod,
                    minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3, 4], link, {from: campCreator}
                );
                gasUsed.iadd(new BN(tx.receipt.cumulativeGasUsed));
                Helper.assertEqual(id + 1, await daoContract.numberCampaigns(), "number campaign is incorrect");
                Helper.assertEqual(true, await daoContract.campExists(id + 1), "campaign should be existed");

                let data = await daoContract.getCampaignDetails(id + 1);
                Helper.assertEqual(id, data.campType, "campType is incorrect");
                Helper.assertEqual(currentBlock + 2 * id + 5, data.startBlock, "start block is incorrect");
                Helper.assertEqual(currentBlock + 2 * id + 5 + minCampPeriod, data.endBlock, "end block is incorrect");
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

                let voteData = await daoContract.getCampaignVoteCountData(id + 1);
                Helper.assertEqual(4, voteData.voteCounts.length, "number options is incorrect");
                Helper.assertEqual(0, voteData.voteCounts[0], "option voted point is incorrect");
                Helper.assertEqual(0, voteData.voteCounts[1], "option voted point is incorrect");
                Helper.assertEqual(0, voteData.voteCounts[2], "option voted point is incorrect");
                Helper.assertEqual(0, voteData.voteCounts[3], "option voted point is incorrect");
                Helper.assertEqual(0, voteData.totalVoteCount, "total voted points is incorrect");

                let listCamps = await daoContract.getListCampIDs(0);
                Helper.assertEqual(id + 1, listCamps.length, "number camps is incorrect");

                // burn KNC to reduce total supply value
                await kncToken.burn(mulPrecision(1000000));
                totalSupply.isub(mulPrecision(1000000));
            }

            logInfo("Submit Campaign: Average gas used for submit new campaign: " + gasUsed.div(new BN(3)).toString(10));

            Helper.assertEqual(2, await daoContract.networkFeeCamp(0), "should have network fee camp");
            Helper.assertEqual(3, await daoContract.brrCampaign(0), "should have brr camp");

            let listCamps = await daoContract.getListCampIDs(0);
            Helper.assertEqual(3, listCamps.length, "number camps is incorrect");
            Helper.assertEqual(1, listCamps[0], "camp id is incorrect");
            Helper.assertEqual(2, listCamps[1], "camp id is incorrect");
            Helper.assertEqual(3, listCamps[2], "camp id is incorrect");
        });

        it("Test submit campaign recored correctly network fee camp for different epoch", async function() {
            await deployContracts(15, currentBlock + 20, 3);

            let link = web3.utils.fromAscii("https://kyberswap.com");

            await daoContract.submitNewCampaign(
                1, currentBlock + 9, currentBlock + 9 + minCampPeriod,
                minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3, 4], link, {from: campCreator}
            );

            Helper.assertEqual(1, await daoContract.networkFeeCamp(0), "should have network fee camp");
            Helper.assertEqual(0, await daoContract.networkFeeCamp(1), "shouldn't have network fee camp");

            await daoContract.submitNewCampaign(
                0, currentBlock + 9, currentBlock + 9 + minCampPeriod,
                minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3, 4], link, {from: campCreator}
            );

            await daoContract.submitNewCampaign(
                2, currentBlock + 9, currentBlock + 9 + minCampPeriod,
                minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3, 4], link, {from: campCreator}
            );

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock);

            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                0, currentBlock + 6, currentBlock + 6 + minCampPeriod,
                minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3, 4], link, {from: campCreator}
            );
            await daoContract.submitNewCampaign(
                1, currentBlock + 6, currentBlock + 6 + minCampPeriod,
                minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3, 4], link, {from: campCreator}
            );
            Helper.assertEqual(1, await daoContract.networkFeeCamp(0), "should have network fee camp");
            Helper.assertEqual(5, await daoContract.networkFeeCamp(1), "should have network fee camp");

            await daoContract.cancelCampaign(5, {from: campCreator});
            Helper.assertEqual(1, await daoContract.networkFeeCamp(0), "should have network fee camp");
            Helper.assertEqual(0, await daoContract.networkFeeCamp(1), "shouldn't have network fee camp");

            currentBlock = await Helper.getCurrentBlock();
            // deploy to epoch 3
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 2 * epochPeriod + startBlock - currentBlock);
            Helper.assertEqual(0, await daoContract.networkFeeCamp(3), "shouldn't have network fee camp");
            Helper.assertEqual(0, await daoContract.networkFeeCamp(2), "shouldn't have network fee camp");

            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                1, currentBlock + 6, currentBlock + 6 + minCampPeriod,
                minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3, 4], link, {from: campCreator}
            );
            Helper.assertEqual(0, await daoContract.networkFeeCamp(2), "shouldn't have network fee camp");
            Helper.assertEqual(6, await daoContract.networkFeeCamp(3), "should have network fee camp");
        });

        it("Test submit campaign network fee campaign changed correctly after cancel and created new one", async function() {
            await deployContracts(50, currentBlock + 3, 10);

            // delay to epoch 1
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 3);

            Helper.assertEqual(0, await daoContract.networkFeeCamp(1), "shouldn't have network fee camp");

            currentBlock = await Helper.getCurrentBlock();

            let link = web3.utils.fromAscii("https://kyberswap.com");

            let tx = await daoContract.submitNewCampaign(
                1, currentBlock + 10, currentBlock + 10 + minCampPeriod,
                minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3, 4], link, {from: campCreator}
            );
            logInfo("Submit Campaign: First time create network fee camp, gas used: " + tx.receipt.cumulativeGasUsed);
            Helper.assertEqual(1, await daoContract.networkFeeCamp(1), "should have network fee camp");

            let txResult = await daoContract.cancelCampaign(1, {from: campCreator});
            expectEvent(txResult, 'CancelledCampaign', {
                campID: new BN(1)
            });

            Helper.assertEqual(0, await daoContract.networkFeeCamp(1), "shouldn't have network fee camp");

            await daoContract.submitNewCampaign(
                0, currentBlock + 10, currentBlock + 10 + minCampPeriod,
                minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3, 4], link, {from: campCreator}
            );
            await daoContract.submitNewCampaign(
                2, currentBlock + 10, currentBlock + 10 + minCampPeriod,
                minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3, 4], link, {from: campCreator}
            );
            Helper.assertEqual(0, await daoContract.networkFeeCamp(1), "shouldn't have network fee camp");

            tx = await daoContract.submitNewCampaign(
                1, currentBlock + 10, currentBlock + 10 + minCampPeriod,
                minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3, 4], link, {from: campCreator}
            );
            logInfo("Submit Campaign: Recreate network fee camp, gas used: " + tx.receipt.cumulativeGasUsed);
            Helper.assertEqual(4, await daoContract.networkFeeCamp(1), "should have network fee camp");
        });

        it("Test submit campaign brr campaign changed correctly after cancel and created new one", async function() {
            await deployContracts(50, currentBlock + 3, 10);

            // delay to epoch 1
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 3);

            Helper.assertEqual(0, await daoContract.brrCampaign(1), "shouldn't have brr camp");

            currentBlock = await Helper.getCurrentBlock();

            let link = web3.utils.fromAscii("https://kyberswap.com");

            let tx = await daoContract.submitNewCampaign(
                2, currentBlock + 10, currentBlock + 10 + minCampPeriod,
                minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3, 4], link, {from: campCreator}
            );
            logInfo("Submit Campaign: First time create brr camp, gas used: " + tx.receipt.cumulativeGasUsed);
            Helper.assertEqual(1, await daoContract.brrCampaign(1), "should have brr camp");

            await daoContract.cancelCampaign(1, {from: campCreator});

            Helper.assertEqual(0, await daoContract.brrCampaign(1), "shouldn't have brr camp");

            await daoContract.submitNewCampaign(
                0, currentBlock + 10, currentBlock + 10 + minCampPeriod,
                minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3, 4], link, {from: campCreator}
            );
            await daoContract.submitNewCampaign(
                1, currentBlock + 10, currentBlock + 10 + minCampPeriod,
                minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3, 4], link, {from: campCreator}
            );
            Helper.assertEqual(0, await daoContract.brrCampaign(1), "shouldn't have brr camp");

            tx = await daoContract.submitNewCampaign(
                2, currentBlock + 10, currentBlock + 10 + minCampPeriod,
                minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3, 4], link, {from: campCreator}
            );
            logInfo("Submit Campaign: Recreate brr camp, gas used: " + tx.receipt.cumulativeGasUsed);
            Helper.assertEqual(4, await daoContract.brrCampaign(1), "shouldn't have brr camp");
        });

        it("Test submit campaign recored correctly brr camp for different epoch", async function() {
            await deployContracts(15, currentBlock + 20, 3);

            let link = web3.utils.fromAscii("https://kyberswap.com");

            await daoContract.submitNewCampaign(
                2, currentBlock + 9, currentBlock + 9 + minCampPeriod,
                minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3, 4], link, {from: campCreator}
            );

            Helper.assertEqual(1, await daoContract.brrCampaign(0), "should have brr camp");
            Helper.assertEqual(0, await daoContract.brrCampaign(1), "shouldn't have brr camp");

            await daoContract.submitNewCampaign(
                0, currentBlock + 9, currentBlock + 9 + minCampPeriod,
                minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3, 4], link, {from: campCreator}
            );

            await daoContract.submitNewCampaign(
                1, currentBlock + 9, currentBlock + 9 + minCampPeriod,
                minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3, 4], link, {from: campCreator}
            );

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock);

            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                0, currentBlock + 6, currentBlock + 6 + minCampPeriod,
                minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3, 4], link, {from: campCreator}
            );
            await daoContract.submitNewCampaign(
                2, currentBlock + 6, currentBlock + 6 + minCampPeriod,
                minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3, 4], link, {from: campCreator}
            );
            Helper.assertEqual(1, await daoContract.brrCampaign(0), "should have brr camp");
            Helper.assertEqual(5, await daoContract.brrCampaign(1), "should have brr camp");

            await daoContract.cancelCampaign(5, {from: campCreator});
            Helper.assertEqual(1, await daoContract.brrCampaign(0), "should have brr camp");
            Helper.assertEqual(0, await daoContract.brrCampaign(1), "shouldn't have brr camp");

            currentBlock = await Helper.getCurrentBlock();
            // deploy to epoch 3
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 2 * epochPeriod + startBlock - currentBlock);

            Helper.assertEqual(0, await daoContract.brrCampaign(2), "shouldn't have brr camp");
            Helper.assertEqual(0, await daoContract.brrCampaign(3), "shouldn't have brr camp");

            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                2, currentBlock + 6, currentBlock + 6 + minCampPeriod,
                minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3, 4], link, {from: campCreator}
            );
            Helper.assertEqual(0, await daoContract.brrCampaign(2), "should have brr camp");
            Helper.assertEqual(6, await daoContract.brrCampaign(3), "shouldn't have brr camp");
        });

        it("Test submit new campaign for next epoch, data changes as expected", async function() {
            await deployContracts(20, currentBlock + 10, 5);

            let link = web3.utils.fromAscii("https://kyberswap.com");
            await daoContract.submitNewCampaign(
                0, startBlock + 1, startBlock + 1 + minCampPeriod,
                minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3], link, {from: campCreator}
            );

            // test recorded correct data
            let data = await daoContract.getCampaignDetails(1);
            Helper.assertEqual(0, data.campType, "campType is incorrect");
            Helper.assertEqual(startBlock + 1, data.startBlock, "start block is incorrect");
            Helper.assertEqual(startBlock + 1 + minCampPeriod, data.endBlock, "end block is incorrect");
            Helper.assertEqual(await kncToken.totalSupply(), data.totalKNCSupply, "total supply is incorrect");
            Helper.assertEqual(minPercentageInPrecision, data.minPercentageInPrecision, "minPercentage is incorrect");
            Helper.assertEqual(cInPrecision, data.cInPrecision, "c is incorrect");
            Helper.assertEqual(tInPrecision, data.tInPrecision, "t is incorrect");
            Helper.assertEqual(link, data.link.toString(), "link is incorrect");
            Helper.assertEqual(3, data.options.length, "number options is incorrect");
            Helper.assertEqual(1, data.options[0], "option value is incorrect");
            Helper.assertEqual(2, data.options[1], "option value is incorrect");
            Helper.assertEqual(3, data.options[2], "option value is incorrect");

            let listCampIDs = await daoContract.getListCampIDs(1);
            Helper.assertEqual(1, listCampIDs.length, "should have added first camp");
            Helper.assertEqual(1, listCampIDs[0], "should have added first camp");

            listCampIDs = await daoContract.getListCampIDs(0);
            Helper.assertEqual(0, listCampIDs.length, "shouldn't have added any camps");

            await daoContract.submitNewCampaign(
                0, startBlock + 4, startBlock + 4 + minCampPeriod,
                minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3, 4], '0x', {from: campCreator}
            );

            listCampIDs = await daoContract.getListCampIDs(1);
            Helper.assertEqual(2, listCampIDs.length, "should have added 2 camps");
            Helper.assertEqual(1, listCampIDs[0], "should have added 2 camps");
            Helper.assertEqual(2, listCampIDs[1], "should have added 2 camps");

            // delay to epoch 1
            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0],  startBlock - currentBlock);

            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                0, startBlock + 4, startBlock + 4 + minCampPeriod,
                minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3, 4], '0x', {from: campCreator}
            );

            listCampIDs = await daoContract.getListCampIDs(1);
            Helper.assertEqual(3, listCampIDs.length, "should have added 3 camps");
            Helper.assertEqual(1, listCampIDs[0], "should have added 3 camps");
            Helper.assertEqual(2, listCampIDs[1], "should have added 3 camps");
            Helper.assertEqual(3, listCampIDs[2], "should have added 3 camps");
            listCampIDs = await daoContract.getListCampIDs(0);
            Helper.assertEqual(0, listCampIDs.length, "shouldn't have added any camps");
        });

        it("Test submit new campaign of network fee for next epoch", async function() {
            await deployContracts(20, currentBlock + 20, 4);
            // create network fee
            await daoContract.submitNewCampaign(
                1, startBlock + 1, startBlock + 1 + minCampPeriod,
                minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3, 4], '0x', {from: campCreator}
            );
            let networkFeeCamp = await daoContract.networkFeeCamp(1);
            Helper.assertEqual(1, networkFeeCamp, "network fee camp is invalid");

            // can not create new camp of network fee for next epoch
            await expectRevert(
                daoContract.submitNewCampaign(
                    1, startBlock + 2, startBlock + 2 + minCampPeriod,
                    minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3], '0x', {from: campCreator}
                ),
                "newCampaign: alr had network fee for this epoch"
            );

            // still able to create for current epoch
            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                1, currentBlock + 3, currentBlock + 3 + minCampPeriod,
                minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3, 4], '0x', {from: campCreator}
            );

            networkFeeCamp = await daoContract.networkFeeCamp(1);
            Helper.assertEqual(1, networkFeeCamp, "network fee camp is invalid");
            networkFeeCamp = await daoContract.networkFeeCamp(0);
            Helper.assertEqual(2, networkFeeCamp, "network fee camp is invalid");


            // delay to next epoch, try to create fee campaign again
            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], startBlock - currentBlock);
            currentBlock = await Helper.getCurrentBlock();

            // can not create new camp of network fee for current epoch as alr existed
            await expectRevert(
                daoContract.submitNewCampaign(
                    1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
                    minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3], '0x', {from: campCreator}
                ),
                "newCampaign: alr had network fee for this epoch"
            );
            // still able to create camp of other types
            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                0, currentBlock + 3, currentBlock + 3 + minCampPeriod,
                minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3, 4], '0x', {from: campCreator}
            );
            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                2, currentBlock + 3, currentBlock + 3 + minCampPeriod,
                minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3, 4], '0x', {from: campCreator}
            );
            networkFeeCamp = await daoContract.networkFeeCamp(1);
            Helper.assertEqual(1, networkFeeCamp, "network fee camp is invalid");
        });

        it("Test submit new campaign of brr for next epoch", async function() {
            await deployContracts(20, currentBlock + 20, 4);
            // create network fee
            await daoContract.submitNewCampaign(
                2, startBlock + 1, startBlock + 1 + minCampPeriod,
                minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3, 4], '0x', {from: campCreator}
            );
            let brrCamp = await daoContract.brrCampaign(1);
            Helper.assertEqual(1, brrCamp, "brr camp is invalid");

            // can not create new camp of network fee for next epoch
            await expectRevert(
                daoContract.submitNewCampaign(
                    2, startBlock + 2, startBlock + 2 + minCampPeriod,
                    minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3], '0x', {from: campCreator}
                ),
                "newCampaign: alr had brr for this epoch"
            );

            // still able to create for current epoch
            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                2, currentBlock + 3, currentBlock + 3 + minCampPeriod,
                minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3, 4], '0x', {from: campCreator}
            );

            brrCamp = await daoContract.brrCampaign(1);
            Helper.assertEqual(1, brrCamp, "brr camp is invalid");
            brrCamp = await daoContract.brrCampaign(0);
            Helper.assertEqual(2, brrCamp, "brr camp is invalid");

            // delay to next epoch, try to create fee campaign again
            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], startBlock - currentBlock);
            currentBlock = await Helper.getCurrentBlock();

            // can not create new camp of network fee for current epoch as alr existed
            await expectRevert(
                daoContract.submitNewCampaign(
                    2, currentBlock + 2, currentBlock + 2 + minCampPeriod,
                    minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3], '0x', {from: campCreator}
                ),
                "newCampaign: alr had brr for this epoch"
            );
            // still able to create camp of other types
            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                0, currentBlock + 3, currentBlock + 3 + minCampPeriod,
                minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3, 4], '0x', {from: campCreator}
            );
            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                1, currentBlock + 3, currentBlock + 3 + minCampPeriod,
                minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3, 4], '0x', {from: campCreator}
            );
            brrCamp = await daoContract.brrCampaign(1);
            Helper.assertEqual(1, brrCamp, "brr camp is invalid");
        });

        it("Test submit campaign should revert sender is not campCreator", async function() {
            await deployContracts(10, currentBlock + 30, 10);
            currentBlock = await Helper.getCurrentBlock();
            await expectRevert(
                daoContract.submitNewCampaign(
                    0, currentBlock + 6, currentBlock + 20, minPercentageInPrecision, cInPrecision, tInPrecision,
                    [1, 2, 3, 4], '0x', {from: mike}
                ),
                "only campaign creator"
            )
            await daoContract.submitNewCampaign(
                0, currentBlock + 6, currentBlock + 20, minPercentageInPrecision, cInPrecision, tInPrecision,
                [1, 2, 3, 4], '0x', {from: campCreator}
            );
        });

        it("Test submit campaign should revert start or end block is invalid", async function() {
            await deployContracts(30, currentBlock + 30, 10);
            currentBlock = await Helper.getCurrentBlock();
            // start in the past
            await expectRevert(
                daoContract.submitNewCampaign(
                    0, currentBlock - 1, currentBlock + 20, minPercentageInPrecision, cInPrecision, tInPrecision,
                    [1, 2, 3, 4], '0x', {from: campCreator}
                ),
                "validateParams: can't start in the past"
            );
            // start in the next 2 epochs
            await expectRevert(
                daoContract.submitNewCampaign(
                    0, startBlock + epochPeriod, startBlock + epochPeriod + 10, minPercentageInPrecision, cInPrecision, tInPrecision,
                    [1, 2, 3, 4], '0x', {from: campCreator}
                ),
                "validateParams: only for current or next epochs"
            )
            // start in the next 10 epochs
            await expectRevert(
                 daoContract.submitNewCampaign(
                    0, startBlock + 10 * epochPeriod, startBlock + 10 * epochPeriod + 10, minPercentageInPrecision, cInPrecision, tInPrecision,
                    [1, 2, 3, 4], '0x', {from: campCreator}
                ),
                "validateParams: only for current or next epochs"
            )
            // start at current epoch but end in the next epoch
            await expectRevert(
                daoContract.submitNewCampaign(
                    0, currentBlock + 6, currentBlock + 30, minPercentageInPrecision, cInPrecision, tInPrecision,
                    [1, 2, 3, 4], '0x', {from: campCreator}
                ),
                "validateParams: start & end not same epoch"        
            )
            // start less than end
            await expectRevert(
                daoContract.submitNewCampaign(
                    0, currentBlock + 6, currentBlock + 3, minPercentageInPrecision, cInPrecision, tInPrecision,
                    [1, 2, 3, 4], '0x', {from: campCreator}
                ),
                "validateParams: campaign duration is low"
            )
            // duration is smaller than min camp duration
            await expectRevert(
                daoContract.submitNewCampaign(
                    0, currentBlock + 10, currentBlock + 10 + minCampPeriod - 2, minPercentageInPrecision, cInPrecision, tInPrecision,
                    [1, 2, 3, 4], '0x', {from: campCreator}
                ),
                "validateParams: campaign duration is low"
            )
            await daoContract.submitNewCampaign(
                0, currentBlock + 10, currentBlock + 10 + minCampPeriod - 1, minPercentageInPrecision, cInPrecision, tInPrecision,
                [1, 2, 3, 4], '0x', {from: campCreator}
            );
            // start at next epoch, should be ok
            await daoContract.submitNewCampaign(
                0, startBlock + 1, startBlock + 10, minPercentageInPrecision, cInPrecision, tInPrecision,
                [1, 2, 3, 4], '0x', {from: campCreator}
            );
        });

        it("Test submit campaign should revert number options is invalid", async function() {
            await deployContracts(30, currentBlock + 30, 10);
            currentBlock = await Helper.getCurrentBlock();
            // no options
            await expectRevert(
                daoContract.submitNewCampaign(
                    0, currentBlock + 3, currentBlock + 3 + minCampPeriod, minPercentageInPrecision, cInPrecision, tInPrecision,
                    [], '0x', {from: campCreator}
                ),
                "validateParams: invalid number of options"
            )
            // one options
            await expectRevert(
                daoContract.submitNewCampaign(
                    0, currentBlock + 5, currentBlock + 5 + minCampPeriod, minPercentageInPrecision, cInPrecision, tInPrecision,
                    [1], '0x', {from: campCreator}
                ),
                "validateParams: invalid number of options"
            )
            // more than 4 options (max number options)
            await expectRevert(
                daoContract.submitNewCampaign(
                    0, currentBlock + 7, currentBlock + 7 + minCampPeriod, minPercentageInPrecision, cInPrecision, tInPrecision,
                    [1, 2, 3, 4, 5], '0x', {from: campCreator}
                ),
                "validateParams: invalid number of options"
            )
            // should work with 2, 3, 4 options
            await daoContract.submitNewCampaign(
                0, currentBlock + 9, currentBlock + 9 + minCampPeriod - 1, minPercentageInPrecision, cInPrecision, tInPrecision,
                [1, 2], '0x', {from: campCreator}
            );
            await daoContract.submitNewCampaign(
                0, currentBlock + 11, currentBlock + 11 + minCampPeriod - 1, minPercentageInPrecision, cInPrecision, tInPrecision,
                [1, 2, 3], '0x', {from: campCreator}
            );
            await daoContract.submitNewCampaign(
                0, currentBlock + 13, currentBlock + 13 + minCampPeriod - 1, minPercentageInPrecision, cInPrecision, tInPrecision,
                [1, 2, 3, 4], '0x', {from: campCreator}
            );
        });

        it("Test submit campaign should revert option value is invalid", async function() {
            await deployContracts(30, currentBlock + 50, 10);
            // general camp: option value is 0
            currentBlock = await Helper.getCurrentBlock();
            await expectRevert(
                daoContract.submitNewCampaign(
                    0, currentBlock + 3, currentBlock + 3 + minCampPeriod, minPercentageInPrecision, cInPrecision, tInPrecision,
                    [0, 1, 2], '0x', {from: campCreator}
                ),
                "validateParams: general campaign option is 0"
            )
            await expectRevert(
                daoContract.submitNewCampaign(
                    0, currentBlock + 5, currentBlock + 5 + minCampPeriod, minPercentageInPrecision, cInPrecision, tInPrecision,
                    [1, 2, 0], '0x', {from: campCreator}
                ),
                "validateParams: general campaign option is 0"
            )
            // valid option values
            await daoContract.submitNewCampaign(
                0, currentBlock + 7, currentBlock + 7 + minCampPeriod, minPercentageInPrecision, cInPrecision, tInPrecision,
                [1, 2, 3], '0x', {from: campCreator}
            );
            // network fee: option > 100% (BPS)
            await expectRevert(
                daoContract.submitNewCampaign(
                    1, currentBlock + 9, currentBlock + 9 + minCampPeriod, minPercentageInPrecision, cInPrecision, tInPrecision,
                    [1, 2, 3, 5000], '0x', {from: campCreator}
                ),
                "validateParams: Fee campaign option value is too high"
            )
            await expectRevert(
                daoContract.submitNewCampaign(
                    1, currentBlock + 11, currentBlock + 11 + minCampPeriod, minPercentageInPrecision, cInPrecision, tInPrecision,
                    [1, 10000, 2, 3], '0x', {from: campCreator}
                ),
                "validateParams: Fee campaign option value is too high"
            )
            await daoContract.submitNewCampaign(
                1, currentBlock + 13, currentBlock + 13 + minCampPeriod, minPercentageInPrecision, cInPrecision, tInPrecision,
                [1, 4999, 2, 3], '0x', {from: campCreator}
            );
            // brr campaign: reward + rebate > 100%
            await expectRevert(
                daoContract.submitNewCampaign(
                    2, currentBlock + 15, currentBlock + 15 + minCampPeriod, minPercentageInPrecision, cInPrecision, tInPrecision,
                    [1, getDataFromRebateAndReward(100, 10001 - 100), 2, 3], '0x', {from: campCreator}
                ),
                "validateParams: RR values are too high"
            )
            await expectRevert(
                daoContract.submitNewCampaign(
                    2, currentBlock + 17, currentBlock + 17 + minCampPeriod, minPercentageInPrecision, cInPrecision, tInPrecision,
                    [1, 2, getDataFromRebateAndReward(20, 10000)], '0x', {from: campCreator}
                ),
                "validateParams: RR values are too high"
            )
            await daoContract.submitNewCampaign(
                2, currentBlock + 19, currentBlock + 19 + minCampPeriod, minPercentageInPrecision, cInPrecision, tInPrecision,
                [1, getDataFromRebateAndReward(2500, 2500), 2, 3], '0x', {from: campCreator}
            );
        });

        it("Test submit campaign should revert invalid campaign type", async function() {
            await deployContracts(30, currentBlock + 50, 10);
            currentBlock = await Helper.getCurrentBlock();
            // note: it is reverted as invalid opcode for campaign type, no message here
            try {
                await daoContract.submitNewCampaign(
                    3, currentBlock + 3, currentBlock + 3 + minCampPeriod, minPercentageInPrecision, cInPrecision, tInPrecision,
                    [1, 2, 3], '0x', {from: campCreator}
                );
                assert(false, "throw was expected in line above");
            } catch (e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }
            try {
                await daoContract.submitNewCampaign(
                    5, currentBlock + 5, currentBlock + 5 + minCampPeriod, minPercentageInPrecision, cInPrecision, tInPrecision,
                    [1, 2, 3], '0x', {from: campCreator}
                );
                assert(false, "throw was expected in line above");
            } catch (e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }
            await daoContract.submitNewCampaign(
                0, currentBlock + 7, currentBlock + 7 + minCampPeriod, minPercentageInPrecision, cInPrecision, tInPrecision,
                [1, 2, 3], '0x', {from: campCreator}
            );
            await daoContract.submitNewCampaign(
                1, currentBlock + 9, currentBlock + 9 + minCampPeriod, minPercentageInPrecision, cInPrecision, tInPrecision,
                [1, 4999, 2, 3], '0x', {from: campCreator}
            );
            await daoContract.submitNewCampaign(
                2, currentBlock + 11, currentBlock + 11 + minCampPeriod, minPercentageInPrecision, cInPrecision, tInPrecision,
                [1, getDataFromRebateAndReward(2500, 2500), 2, 3], '0x', {from: campCreator}
            );
        });

        it("Test submit campaign should revert formula params are invalid", async function() {
            await deployContracts(30, currentBlock + 50, 10);
            currentBlock = await Helper.getCurrentBlock();
            // invalid min percentage (> 100%)
            await expectRevert(
                daoContract.submitNewCampaign(
                    0, currentBlock + 3, currentBlock + 3 + minCampPeriod,
                    precisionUnits.add(new BN(1)), cInPrecision, tInPrecision,
                    [1, 2, 3], '0x', {from: campCreator}
                ),
                "validateParams: min percentage is high"
            )
            // cInPrecision > 2^128
            await expectRevert(
                daoContract.submitNewCampaign(
                    0, currentBlock + 3, currentBlock + 3 + minCampPeriod,
                    precisionUnits, new BN(2).pow(new BN(128)).add(new BN(1)), tInPrecision,
                    [1, 2, 3], '0x', {from: campCreator}
                ),
                "validateParams: c is high"
            )
            // tInPrecision > 2^128
            await expectRevert(
                daoContract.submitNewCampaign(
                    0, currentBlock + 3, currentBlock + 3 + minCampPeriod,
                    precisionUnits, tInPrecision, new BN(2).pow(new BN(128)).add(new BN(1)),
                    [1, 2, 3], '0x', {from: campCreator}
                ),
                "validateParams: t is high"
            )
            await daoContract.submitNewCampaign(
                0, currentBlock + 5, currentBlock + 5 + minCampPeriod,
                precisionUnits.sub(new BN(100)), cInPrecision, tInPrecision,
                [1, 2, 3], '0x', {from: campCreator}
            );
            await daoContract.submitNewCampaign(
                0, currentBlock + 7, currentBlock + 7 + minCampPeriod,
                precisionUnits, cInPrecision, tInPrecision,
                [1, 2, 3], '0x', {from: campCreator}
            );
        });

        it("Test submit campaign should revert network fee camp's already existed", async function() {
            await deployContracts(30, currentBlock + 20, 4);
            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                1, currentBlock + 4, currentBlock + 4 + minCampPeriod, minPercentageInPrecision, cInPrecision, tInPrecision,
                [1, 2, 3], '0x', {from: campCreator}
            );
            await expectRevert(
                daoContract.submitNewCampaign(
                    1, currentBlock + 6, currentBlock + 6 + minCampPeriod, minPercentageInPrecision, cInPrecision, tInPrecision,
                    [1, 2, 3], '0x', {from: campCreator}
                ),
                "newCampaign: alr had network fee for this epoch"
            )
            await daoContract.submitNewCampaign(
                0, currentBlock + 8, currentBlock + 8 + minCampPeriod, minPercentageInPrecision, cInPrecision, tInPrecision,
                [1, 2, 3], '0x', {from: campCreator}
            );
            await daoContract.submitNewCampaign(
                2, currentBlock + 10, currentBlock + 10 + minCampPeriod, minPercentageInPrecision, cInPrecision, tInPrecision,
                [1, 2, 3], '0x', {from: campCreator}
            );
            currentBlock = await Helper.getCurrentBlock();
            // jump to epoch 1
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock + 1);
            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                1, currentBlock + 4, currentBlock + 4 + minCampPeriod, minPercentageInPrecision, cInPrecision, tInPrecision,
                [1, 2, 3], '0x', {from: campCreator}
            );
            await expectRevert(
                daoContract.submitNewCampaign(
                    1, currentBlock + 6, currentBlock + 6 + minCampPeriod, minPercentageInPrecision, cInPrecision, tInPrecision,
                    [1, 2, 3], '0x', {from: campCreator}
                ),
                "newCampaign: alr had network fee for this epoch"
            )
            await daoContract.submitNewCampaign(
                0, currentBlock + 8, currentBlock + 8 + minCampPeriod, minPercentageInPrecision, cInPrecision, tInPrecision,
                [1, 2, 3], '0x', {from: campCreator}
            );
        });

        it("Test submit campaign should revert brr camp's already existed", async function() {
            await deployContracts(30, currentBlock + 20, 4);
            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                2, currentBlock + 4, currentBlock + 4 + minCampPeriod, minPercentageInPrecision, cInPrecision, tInPrecision,
                [1, 2, 3], '0x', {from: campCreator}
            );
            await expectRevert(
                daoContract.submitNewCampaign(
                    2, currentBlock + 6, currentBlock + 6 + minCampPeriod, minPercentageInPrecision, cInPrecision, tInPrecision,
                    [1, 2, 3], '0x', {from: campCreator}
                ),
                "newCampaign: alr had brr for this epoch"
            )
            await daoContract.submitNewCampaign(
                0, currentBlock + 8, currentBlock + 8 + minCampPeriod, minPercentageInPrecision, cInPrecision, tInPrecision,
                [1, 2, 3], '0x', {from: campCreator}
            );
            await daoContract.submitNewCampaign(
                1, currentBlock + 10, currentBlock + 10 + minCampPeriod, minPercentageInPrecision, cInPrecision, tInPrecision,
                [1, 2, 3], '0x', {from: campCreator}
            );
            currentBlock = await Helper.getCurrentBlock();
            // jump to epoch 1
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock + 1);
            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                2, currentBlock + 4, currentBlock + 4 + minCampPeriod, minPercentageInPrecision, cInPrecision, tInPrecision,
                [1, 2, 3], '0x', {from: campCreator}
            );
            await expectRevert(
                daoContract.submitNewCampaign(
                    2, currentBlock + 6, currentBlock + 6 + minCampPeriod, minPercentageInPrecision, cInPrecision, tInPrecision,
                    [1, 2, 3], '0x', {from: campCreator}
                ),
                "newCampaign: alr had brr for this epoch"
            )
            await daoContract.submitNewCampaign(
                0, currentBlock + 8, currentBlock + 8 + minCampPeriod, minPercentageInPrecision, cInPrecision, tInPrecision,
                [1, 2, 3], '0x', {from: campCreator}
            );
        });

        it("Test submit campaign should revert exceed max campaigns for current or next epoch", async function() {
            await deployContracts(20, currentBlock + 50, 4);
            currentBlock = await Helper.getCurrentBlock();
            let maxCamps = await daoContract.MAX_EPOCH_CAMPS();

            for(let id = 0; id < maxCamps; id++) {
                await daoContract.submitNewCampaign(
                    id <= 2 ? id : 0, currentBlock + 40, currentBlock + 40 + minCampPeriod,
                    minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3], '0x', {from: campCreator}
                );
            }

            await expectRevert(
                daoContract.submitNewCampaign(
                    0, currentBlock + 40, currentBlock + 40 + minCampPeriod, minPercentageInPrecision, cInPrecision, tInPrecision,
                    [1, 2, 3], '0x', {from: campCreator}
                ),
                "newCampaign: too many campaigns"
            )

            await daoContract.cancelCampaign(1, {from: campCreator});

            await daoContract.submitNewCampaign(
                0, currentBlock + 40, currentBlock + 40 + minCampPeriod, minPercentageInPrecision, cInPrecision, tInPrecision,
                [1, 2, 3], '0x', {from: campCreator}
            );

            await expectRevert(
                daoContract.submitNewCampaign(
                    0, currentBlock + 40, currentBlock + 40 + minCampPeriod, minPercentageInPrecision, cInPrecision, tInPrecision,
                    [1, 2, 3], '0x', {from: campCreator}
                ),
                "newCampaign: too many campaigns"
            )

            for(let id = 0; id < maxCamps; id++) {
                await daoContract.submitNewCampaign(
                    id <= 2 ? id : 0, startBlock + 2, startBlock + 2 + minCampPeriod,
                    minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3], '0x', {from: campCreator}
                );
            }
            await expectRevert(
                daoContract.submitNewCampaign(
                    0, startBlock + 2, startBlock + 2 + minCampPeriod, minPercentageInPrecision, cInPrecision, tInPrecision,
                    [1, 2, 3], '0x', {from: campCreator}
                ),
                "newCampaign: too many campaigns"
            )
            await daoContract.cancelCampaign(await daoContract.numberCampaigns(), {from: campCreator});
            await daoContract.submitNewCampaign(
                0, startBlock + 2, startBlock + 2 + minCampPeriod, minPercentageInPrecision, cInPrecision, tInPrecision,
                [1, 2, 3], '0x', {from: campCreator}
            );
        });
    });

    describe("#Cancel Campaign tests", () => {
        it("Test cancel campaign should revert campaign is not existed", async function() {
            await deployContracts(10, currentBlock + 20, 2);
            await expectRevert(
                daoContract.cancelCampaign(1, {from: campCreator}),
                "cancelCampaign: campID doesn't exist"
            )
            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                0, currentBlock + 5, currentBlock + 5 + minCampPeriod, minPercentageInPrecision, cInPrecision, tInPrecision,
                [1, 2, 3], '0x', {from: campCreator}
            );
            await expectRevert(
                daoContract.cancelCampaign(2, {from: campCreator}),
                "cancelCampaign: campID doesn't exist"
            )
            await daoContract.cancelCampaign(1, {from: campCreator});
        });

        it("Test cancel campaign should revert sender is not campCreator", async function() {
            await deployContracts(10, currentBlock + 20, 2);
            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                0, currentBlock + 5, currentBlock + 5 + minCampPeriod, minPercentageInPrecision, cInPrecision, tInPrecision,
                [1, 2, 3], '0x', {from: campCreator}
            );
            await expectRevert(
                daoContract.cancelCampaign(1, {from: mike}),
                "only campaign creator"
            );
            await daoContract.cancelCampaign(1, {from: campCreator});
        })

        it("Test cancel campaign should revert camp already started or ended", async function() {
            await deployContracts(10, currentBlock + 20, 5);
            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                0, currentBlock + 2, currentBlock + 2 + minCampPeriod, minPercentageInPrecision, cInPrecision, tInPrecision,
                [1, 2, 3], '0x', {from: campCreator}
            );
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 2);
            // camp already running, can not cancel
            await expectRevert(
                daoContract.cancelCampaign(1, {from: campCreator}),
                "cancelCampaign: campaign alr started"
            )
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 10);
            // camp already ended, cancel cancel
            await expectRevert(
                daoContract.cancelCampaign(1, {from: campCreator}),
                "cancelCampaign: campaign alr started"
            )
        })

        it("Test cancel campaign should update correct data after cancelled", async function() {
            await deployContracts(20, currentBlock + 20, 3);

            let campCounts = 0;

            for(let id = 0; id < 2; id++) {
                currentBlock = await Helper.getCurrentBlock();
                await daoContract.submitNewCampaign(
                    0, currentBlock + 10, currentBlock + 10 + minCampPeriod, minPercentageInPrecision, cInPrecision, tInPrecision,
                    [1, 2, 3], '0x', {from: campCreator}
                );
                await daoContract.submitNewCampaign(
                    1, currentBlock + 10, currentBlock + 10 + minCampPeriod, minPercentageInPrecision, cInPrecision, tInPrecision,
                    [1, 2, 3], '0x', {from: campCreator}
                );
                await daoContract.submitNewCampaign(
                    2, currentBlock + 10, currentBlock + 10 + minCampPeriod, minPercentageInPrecision, cInPrecision, tInPrecision,
                    [1, 2, 3], '0x', {from: campCreator}
                );
                await daoContract.submitNewCampaign(
                    0, currentBlock + 10, currentBlock + 10 + minCampPeriod, minPercentageInPrecision, cInPrecision, tInPrecision,
                    [1, 2, 3], '0x', {from: campCreator}
                );

                campCounts += 4;

                Helper.assertEqual(await daoContract.numberCampaigns(), campCounts, "number campaigns have been created is incorrect");

                let listCamps = await daoContract.getListCampIDs(id);

                Helper.assertEqual(listCamps.length, 4, "number camps for this epoch is incorrect");
                Helper.assertEqual(listCamps[0], campCounts - 3, "camp id for this epoch is incorrect");
                Helper.assertEqual(listCamps[1], campCounts - 2, "camp id for this epoch is incorrect");
                Helper.assertEqual(listCamps[2], campCounts - 1, "camp id for this epoch is incorrect");
                Helper.assertEqual(listCamps[3], campCounts, "camp id for this epoch is incorrect");

                // cancel last created camp
                let tx = await daoContract.cancelCampaign(campCounts, {from: campCreator});
                logInfo("Cancel campaign: 4 camps, cancel last one, gas used: " + tx.receipt.cumulativeGasUsed);
                expectEvent(tx, 'CancelledCampaign', {
                    campID: new BN(campCounts)
                });

                listCamps = await daoContract.getListCampIDs(id);
                Helper.assertEqual(listCamps.length, 3, "number camps for this epoch is incorrect");
                Helper.assertEqual(listCamps[0], campCounts - 3, "camp id for this epoch is incorrect");
                Helper.assertEqual(listCamps[1], campCounts - 2, "camp id for this epoch is incorrect");
                Helper.assertEqual(listCamps[2], campCounts - 1, "camp id for this epoch is incorrect");

                Helper.assertEqual(false, await daoContract.campExists(campCounts), "camp shouldn't be existed after cancel");

                let campData = await daoContract.getCampaignDetails(campCounts);
                Helper.assertEqual(campData.campType, 0, "camp details should be deleted");
                Helper.assertEqual(campData.startBlock, 0, "camp details should be deleted");
                Helper.assertEqual(campData.endBlock, 0, "camp details should be deleted");
                Helper.assertEqual(campData.totalKNCSupply, 0, "camp details should be deleted");
                Helper.assertEqual(campData.minPercentageInPrecision, 0, "camp details should be deleted");
                Helper.assertEqual(campData.cInPrecision, 0, "camp details should be deleted");
                Helper.assertEqual(campData.tInPrecision, 0, "camp details should be deleted");

                let voteData = await daoContract.getCampaignVoteCountData(campCounts);
                Helper.assertEqual(voteData.voteCounts.length, 0, "camp vote data should be deleted");
                Helper.assertEqual(voteData.totalVoteCount, 0, "camp vote data be deleted");

                // numberCampaigns value shouldn't be changed
                Helper.assertEqual(await daoContract.numberCampaigns(), campCounts, "number campaigns have been created is incorrect");

                // cancel middle camp
                tx = await daoContract.cancelCampaign(campCounts - 3, {from: campCreator});
                logInfo("Cancel campaign: 3 camps, cancel first one, gas used: " + tx.receipt.cumulativeGasUsed);
                expectEvent(tx, 'CancelledCampaign', {
                    campID: new BN(campCounts - 3)
                });

                listCamps = await daoContract.getListCampIDs(id);
                Helper.assertEqual(listCamps.length, 2, "number camps for this epoch is incorrect");
                Helper.assertEqual(listCamps[0], campCounts - 1, "camp id for this epoch is incorrect");
                Helper.assertEqual(listCamps[1], campCounts - 2, "camp id for this epoch is incorrect");

                campData = await daoContract.getCampaignDetails(campCounts - 3);
                Helper.assertEqual(campData.campType, 0, "camp details should be deleted");
                Helper.assertEqual(campData.startBlock, 0, "camp details should be deleted");
                Helper.assertEqual(campData.endBlock, 0, "camp details should be deleted");
                Helper.assertEqual(campData.totalKNCSupply, 0, "camp details should be deleted");
                Helper.assertEqual(campData.minPercentageInPrecision, 0, "camp details should be deleted");
                Helper.assertEqual(campData.cInPrecision, 0, "camp details should be deleted");
                Helper.assertEqual(campData.tInPrecision, 0, "camp details should be deleted");

                voteData = await daoContract.getCampaignVoteCountData(campCounts - 3);
                Helper.assertEqual(voteData.voteCounts.length, 0, "camp vote data should be deleted");
                Helper.assertEqual(voteData.totalVoteCount, 0, "camp vote data be deleted");

                Helper.assertEqual(false, await daoContract.campExists(campCounts - 3), "camp shouldn't be existed after cancel");

                // numberCampaigns value shouldn't be changed
                Helper.assertEqual(await daoContract.numberCampaigns(), campCounts, "number campaigns have been created is incorrect");

                await daoContract.submitNewCampaign(
                    0, currentBlock + 10, currentBlock + 10 + minCampPeriod, minPercentageInPrecision, cInPrecision, tInPrecision,
                    [1, 2, 3], '0x', {from: campCreator}
                );

                campCounts++;

                Helper.assertEqual(await daoContract.numberCampaigns(), campCounts, "number campaigns have been created is incorrect");

                listCamps = await daoContract.getListCampIDs(id);

                Helper.assertEqual(listCamps.length, 3, "number camps for this epoch is incorrect");
                Helper.assertEqual(listCamps[0], campCounts - 2, "camp id for this epoch is incorrect");
                Helper.assertEqual(listCamps[1], campCounts - 3, "camp id for this epoch is incorrect");
                Helper.assertEqual(listCamps[2], campCounts, "camp id for this epoch is incorrect");

                // delay until new epoch
                currentBlock = await Helper.getCurrentBlock();
                await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], id * epochPeriod + startBlock - currentBlock);
            }
        });

        it("Test cancel campaign correctly for network fee camp", async function() {
            await deployContracts(20, currentBlock + 50, 5);

            Helper.assertEqual(0, await daoContract.networkFeeCamp(0), "network fee camp id should be correct");

            let link = web3.utils.fromAscii("https://kyberswap.com");
            await daoContract.submitNewCampaign(
                1, currentBlock + 15, currentBlock + 15 + minCampPeriod,
                minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3], link, {from: campCreator}
            );

            Helper.assertEqual(1, await daoContract.networkFeeCamp(0), "network fee camp id should be correct");

            let campData = await daoContract.getCampaignDetails(1);
            Helper.assertEqual(campData.campType, 1, "camp details should be correct");
            Helper.assertEqual(campData.startBlock, currentBlock + 15, "camp details should be correct");
            Helper.assertEqual(campData.endBlock, currentBlock + 15 + minCampPeriod, "camp details should be correct");
            Helper.assertEqual(campData.totalKNCSupply, await kncToken.totalSupply(), "camp details should be correct");
            Helper.assertEqual(campData.minPercentageInPrecision, minPercentageInPrecision, "camp details should be correct");
            Helper.assertEqual(campData.cInPrecision, cInPrecision, "camp details should be correct");
            Helper.assertEqual(campData.tInPrecision, tInPrecision, "camp details should be correct");
            Helper.assertEqual(campData.link, link, "camp details should be correct");
            Helper.assertEqual(campData.options.length, 3, "camp details should be correct");
            Helper.assertEqual(campData.options[0], 1, "camp details should be correct");
            Helper.assertEqual(campData.options[1], 2, "camp details should be correct");
            Helper.assertEqual(campData.options[2], 3, "camp details should be correct");

            let tx = await daoContract.cancelCampaign(1, {from: campCreator});
            logInfo("Cancel campaign: cancel network fee camp, gas used: " + tx.receipt.cumulativeGasUsed);

            campData = await daoContract.getCampaignDetails(1);
            Helper.assertEqual(campData.campType, 0, "camp details should be deleted");
            Helper.assertEqual(campData.startBlock, 0, "camp details should be deleted");
            Helper.assertEqual(campData.endBlock, 0, "camp details should be deleted");
            Helper.assertEqual(campData.totalKNCSupply, 0, "camp details should be deleted");
            Helper.assertEqual(campData.minPercentageInPrecision, 0, "camp details should be deleted");
            Helper.assertEqual(campData.cInPrecision, 0, "camp details should be deleted");
            Helper.assertEqual(campData.tInPrecision, 0, "camp details should be deleted");
            // campData[7] is null, can not use assert equal
            Helper.assertEqual(campData[8].length, 0, "camp details should be deleted");

            Helper.assertEqual(0, await daoContract.networkFeeCamp(0), "network fee camp id should be deleted");

            // create a general camp
            await daoContract.submitNewCampaign(
                0, currentBlock + 20, currentBlock + 20 + minCampPeriod,
                minPercentageInPrecision, cInPrecision, tInPrecision, [25, 50], link, {from: campCreator}
            );
            // create brr camp
            await daoContract.submitNewCampaign(
                2, currentBlock + 20, currentBlock + 20 + minCampPeriod,
                minPercentageInPrecision, cInPrecision, tInPrecision, [25, 50], link, {from: campCreator}
            );
            Helper.assertEqual(0, await daoContract.networkFeeCamp(0), "network fee camp id should be deleted");

            link = web3.utils.fromAscii("https://google.com");
            minPercentageInPrecision = precisionUnits.div(new BN(10));
            cInPrecision = precisionUnits.div(new BN(2));
            tInPrecision = precisionUnits.div(new BN(4));
            await kncToken.burn(mulPrecision(100));
            await daoContract.submitNewCampaign(
                1, currentBlock + 20, currentBlock + 20 + minCampPeriod,
                minPercentageInPrecision, cInPrecision, tInPrecision, [25, 50], link, {from: campCreator}
            );

            Helper.assertEqual(4, await daoContract.networkFeeCamp(0), "network fee camp id should be correct");

            campData = await daoContract.getCampaignDetails(4);
            Helper.assertEqual(campData.campType, 1, "camp details should be correct");
            Helper.assertEqual(campData.startBlock, currentBlock + 20, "camp details should be correct");
            Helper.assertEqual(campData.endBlock, currentBlock + 20 + minCampPeriod, "camp details should be correct");
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

            Helper.assertEqual(0, await daoContract.brrCampaign(0), "brr camp id should be correct");

            let link = web3.utils.fromAscii("https://kyberswap.com");
            await daoContract.submitNewCampaign(
                2, currentBlock + 15, currentBlock + 15 + minCampPeriod,
                minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3], link, {from: campCreator}
            );

            Helper.assertEqual(1, await daoContract.brrCampaign(0), "brr camp id should be correct");

            let campData = await daoContract.getCampaignDetails(1);
            Helper.assertEqual(campData.campType, 2, "camp details should be correct");
            Helper.assertEqual(campData.startBlock, currentBlock + 15, "camp details should be correct");
            Helper.assertEqual(campData.endBlock, currentBlock + 15 + minCampPeriod, "camp details should be correct");
            Helper.assertEqual(campData.totalKNCSupply, await kncToken.totalSupply(), "camp details should be correct");
            Helper.assertEqual(campData.minPercentageInPrecision, minPercentageInPrecision, "camp details should be correct");
            Helper.assertEqual(campData.cInPrecision, cInPrecision, "camp details should be correct");
            Helper.assertEqual(campData.tInPrecision, tInPrecision, "camp details should be correct");
            Helper.assertEqual(campData.link, link, "camp details should be correct");
            Helper.assertEqual(campData.options.length, 3, "camp details should be correct");
            Helper.assertEqual(campData.options[0], 1, "camp details should be correct");
            Helper.assertEqual(campData.options[1], 2, "camp details should be correct");
            Helper.assertEqual(campData.options[2], 3, "camp details should be correct");

            let tx = await daoContract.cancelCampaign(1, {from: campCreator});
            logInfo("Cancel campaign: cancel brr camp, gas used: " + tx.receipt.cumulativeGasUsed);

            campData = await daoContract.getCampaignDetails(1);
            Helper.assertEqual(campData.campType, 0, "camp details should be deleted");
            Helper.assertEqual(campData.startBlock, 0, "camp details should be deleted");
            Helper.assertEqual(campData.endBlock, 0, "camp details should be deleted");
            Helper.assertEqual(campData.totalKNCSupply, 0, "camp details should be deleted");
            Helper.assertEqual(campData.minPercentageInPrecision, 0, "camp details should be deleted");
            Helper.assertEqual(campData.cInPrecision, 0, "camp details should be deleted");
            Helper.assertEqual(campData.tInPrecision, 0, "camp details should be deleted");
            // campData[7] is null, can not use assert equal
            Helper.assertEqual(campData[8].length, 0, "camp details should be deleted");

            Helper.assertEqual(0, await daoContract.brrCampaign(0), "brr camp id should be deleted");

            // create a general camp
            await daoContract.submitNewCampaign(
                0, currentBlock + 20, currentBlock + 20 + minCampPeriod,
                minPercentageInPrecision, cInPrecision, tInPrecision, [25, 50], link, {from: campCreator}
            );
            // create network fee camp
            await daoContract.submitNewCampaign(
                1, currentBlock + 20, currentBlock + 20 + minCampPeriod,
                minPercentageInPrecision, cInPrecision, tInPrecision, [25, 50], link, {from: campCreator}
            );
            Helper.assertEqual(0, await daoContract.brrCampaign(0), "brr camp id should be deleted");

            link = web3.utils.fromAscii("https://google.com");

            minPercentageInPrecision = precisionUnits.div(new BN(10));
            cInPrecision = precisionUnits.div(new BN(2));
            tInPrecision = precisionUnits.div(new BN(4));
            await kncToken.burn(mulPrecision(100));
            await daoContract.submitNewCampaign(
                2, currentBlock + 20, currentBlock + 20 + minCampPeriod,
                minPercentageInPrecision, cInPrecision, tInPrecision, [25, 50], link, {from: campCreator}
            );

            Helper.assertEqual(4, await daoContract.brrCampaign(0), "brr camp id should be correct");

            campData = await daoContract.getCampaignDetails(4);
            Helper.assertEqual(campData.campType, 2, "camp details should be correct");
            Helper.assertEqual(campData.startBlock, currentBlock + 20, "camp details should be correct");
            Helper.assertEqual(campData.endBlock, currentBlock + 20 + minCampPeriod, "camp details should be correct");
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

            await daoContract.submitNewCampaign(
                0, currentBlock + 15, currentBlock + 15 + minCampPeriod,
                minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3], link, {from: campCreator}
            );
            await daoContract.submitNewCampaign(
                1, currentBlock + 15, currentBlock + 15 + minCampPeriod,
                minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3], link, {from: campCreator}
            );
            await daoContract.submitNewCampaign(
                2, currentBlock + 15, currentBlock + 15 + minCampPeriod,
                minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3], link, {from: campCreator}
            );

            let epoch1Block = startBlock + 1;

            await daoContract.submitNewCampaign(
                0, epoch1Block + 15, epoch1Block + 15 + minCampPeriod,
                minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3], link, {from: campCreator}
            );
            await daoContract.submitNewCampaign(
                1, epoch1Block + 15, epoch1Block + 15 + minCampPeriod,
                minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3], link, {from: campCreator}
            );
            await daoContract.submitNewCampaign(
                2, epoch1Block + 15, epoch1Block + 15 + minCampPeriod,
                minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3], link, {from: campCreator}
            );
            await daoContract.submitNewCampaign(
                0, epoch1Block + 15, epoch1Block + 15 + minCampPeriod,
                minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3], link, {from: campCreator}
            );

            let campIDs = await daoContract.getListCampIDs(0);
            Helper.assertEqual(3, campIDs.length, "number ids for first epoch is wrong");
            Helper.assertEqual(1, campIDs[0], "camp id for first epoch is wrong");
            Helper.assertEqual(2, campIDs[1], "camp id for first epoch is wrong");
            Helper.assertEqual(3, campIDs[2], "camp id for first epoch is wrong");

            campIDs = await daoContract.getListCampIDs(1);
            Helper.assertEqual(4, campIDs.length, "number ids for second epoch is wrong");
            Helper.assertEqual(4, campIDs[0], "camp id for second epoch is wrong");
            Helper.assertEqual(5, campIDs[1], "camp id for second epoch is wrong");
            Helper.assertEqual(6, campIDs[2], "camp id for second epoch is wrong");
            Helper.assertEqual(7, campIDs[3], "camp id for second epoch is wrong");

            // cancel next camp
            await daoContract.cancelCampaign(5, {from: campCreator});

            campIDs = await daoContract.getListCampIDs(1);
            Helper.assertEqual(3, campIDs.length, "number ids for second epoch is wrong");
            Helper.assertEqual(4, campIDs[0], "camp id for second epoch is wrong");
            Helper.assertEqual(7, campIDs[1], "camp id for second epoch is wrong");
            Helper.assertEqual(6, campIDs[2], "camp id for second epoch is wrong");

            // epoch 1 camps shouldn't be changed
            campIDs = await daoContract.getListCampIDs(0);
            Helper.assertEqual(3, campIDs.length, "number ids for first epoch is wrong");
            Helper.assertEqual(1, campIDs[0], "camp id for first epoch is wrong");
            Helper.assertEqual(2, campIDs[1], "camp id for first epoch is wrong");
            Helper.assertEqual(3, campIDs[2], "camp id for first epoch is wrong");

            await daoContract.cancelCampaign(2, {from: campCreator});

            campIDs = await daoContract.getListCampIDs(1);
            Helper.assertEqual(3, campIDs.length, "number ids for second epoch is wrong");
            Helper.assertEqual(4, campIDs[0], "camp id for second epoch is wrong");
            Helper.assertEqual(7, campIDs[1], "camp id for second epoch is wrong");
            Helper.assertEqual(6, campIDs[2], "camp id for second epoch is wrong");

            campIDs = await daoContract.getListCampIDs(0);
            Helper.assertEqual(2, campIDs.length, "number ids for first epoch is wrong");
            Helper.assertEqual(1, campIDs[0], "camp id for first epoch is wrong");
            Helper.assertEqual(3, campIDs[1], "camp id for first epoch is wrong");

            // delay to epoch 1
            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock);

            await daoContract.cancelCampaign(4, {from: campCreator});
            // check camp ids
            campIDs = await daoContract.getListCampIDs(1);
            Helper.assertEqual(2, campIDs.length, "number ids for second epoch is wrong");
            Helper.assertEqual(6, campIDs[0], "camp id for second epoch is wrong");
            Helper.assertEqual(7, campIDs[1], "camp id for second epoch is wrong");
        });

        it("Test cancel campaign for network fee camp of next epoch", async function() {
            await deployContracts(20, currentBlock + 20, 5);

            let link = web3.utils.fromAscii("https://kyberswap.com");

            await daoContract.submitNewCampaign(
                1, currentBlock + 5, currentBlock + 5 + minCampPeriod,
                minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3], link, {from: campCreator}
            );

            Helper.assertEqual(1, await daoContract.networkFeeCamp(0), "network fee camp is wrong");
            Helper.assertEqual(0, await daoContract.networkFeeCamp(1), "network fee camp is wrong");

            // create network fee for next epoch
            await daoContract.submitNewCampaign(
                1, startBlock + 5, startBlock + 5 + minCampPeriod,
                minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3], link, {from: campCreator}
            );

            Helper.assertEqual(1, await daoContract.networkFeeCamp(0), "network fee camp is wrong");
            Helper.assertEqual(2, await daoContract.networkFeeCamp(1), "network fee camp is wrong");

            await daoContract.cancelCampaign(2, {from: campCreator});

            Helper.assertEqual(1, await daoContract.networkFeeCamp(0), "network fee camp is wrong");
            Helper.assertEqual(0, await daoContract.networkFeeCamp(1), "network fee camp is wrong");

            // create network fee for next epoch again
            await daoContract.submitNewCampaign(
                1, startBlock + 5, startBlock + 5 + minCampPeriod,
                minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3], link, {from: campCreator}
            );

            Helper.assertEqual(1, await daoContract.networkFeeCamp(0), "network fee camp is wrong");
            Helper.assertEqual(3, await daoContract.networkFeeCamp(1), "network fee camp is wrong");

            // delay to next epoch
            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock);

            await daoContract.cancelCampaign(3, {from: campCreator});
            Helper.assertEqual(0, await daoContract.networkFeeCamp(1), "network fee camp is wrong");

            // create network fee for epoch 1 again
            await daoContract.submitNewCampaign(
                1, startBlock + 5, startBlock + 5 + minCampPeriod,
                minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3], link, {from: campCreator}
            );
            Helper.assertEqual(4, await daoContract.networkFeeCamp(1), "network fee camp is wrong");
        });

        it("Test cancel campaign for brr camp of next epoch", async function() {
            await deployContracts(20, currentBlock + 20, 5);

            let link = web3.utils.fromAscii("https://kyberswap.com");

            await daoContract.submitNewCampaign(
                2, currentBlock + 5, currentBlock + 5 + minCampPeriod,
                minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3], link, {from: campCreator}
            );

            Helper.assertEqual(1, await daoContract.brrCampaign(0), "brr camp is wrong");
            Helper.assertEqual(0, await daoContract.brrCampaign(1), "brr camp is wrong");

            // create brr for next epoch
            await daoContract.submitNewCampaign(
                2, startBlock + 5, startBlock + 5 + minCampPeriod,
                minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3], link, {from: campCreator}
            );

            Helper.assertEqual(1, await daoContract.brrCampaign(0), "brr camp is wrong");
            Helper.assertEqual(2, await daoContract.brrCampaign(1), "brr camp is wrong");

            await daoContract.cancelCampaign(2, {from: campCreator});

            Helper.assertEqual(1, await daoContract.brrCampaign(0), "brr camp is wrong");
            Helper.assertEqual(0, await daoContract.brrCampaign(1), "brr camp is wrong");

            // create brr for next epoch again
            await daoContract.submitNewCampaign(
                2, startBlock + 5, startBlock + 5 + minCampPeriod,
                minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3], link, {from: campCreator}
            );

            Helper.assertEqual(1, await daoContract.brrCampaign(0), "brr camp is wrong");
            Helper.assertEqual(3, await daoContract.brrCampaign(1), "brr camp is wrong");

            // delay to next epoch
            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock);

            await daoContract.cancelCampaign(3, {from: campCreator});
            Helper.assertEqual(0, await daoContract.brrCampaign(1), "brr camp is wrong");

            // create brr for epoch 1 again
            await daoContract.submitNewCampaign(
                2, startBlock + 5, startBlock + 5 + minCampPeriod,
                minPercentageInPrecision, cInPrecision, tInPrecision, [1, 2, 3], link, {from: campCreator}
            );
            Helper.assertEqual(4, await daoContract.brrCampaign(1), "brr camp is wrong");
        });
    });

    describe("#Vote tests", () => {
        it("Test vote should update data correctly - without delegation", async function() {
            await deployContracts(100, currentBlock + 20, 20);
            await setupSimpleStakingData();

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock);

            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                1, currentBlock + 3, currentBlock + 3 + minCampPeriod,
                0, 0, 0, [25, 50, 100], '0x', {from: campCreator}
            );
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 2);

            Helper.assertEqual(0, await daoContract.getTotalPoints(1), "total epoch points should be correct");
            let campPointsData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(0, campPointsData[1], "camp total points should be correct");
            Helper.assertEqual(0, campPointsData[0][0], "option voted count is incorrect");
            Helper.assertEqual(0, campPointsData[0][1], "option voted count is incorrect");
            Helper.assertEqual(0, campPointsData[0][2], "option voted count is incorrect");

            Helper.assertEqual(0, await daoContract.getNumberVotes(victor, 1), "number votes should be correct");
            Helper.assertEqual(0, await daoContract.getNumberVotes(mike, 1), "number votes should be correct");
            Helper.assertEqual(0, await daoContract.getNumberVotes(loi, 1), "number votes should be correct");

            let gasUsed = new BN(0);
            let tx = await daoContract.vote(1, 1, {from: victor});
            gasUsed.iadd(new BN(tx.receipt.cumulativeGasUsed));

            let epochPoints = new BN(0).add(initVictorStake);
            let campPoints = new BN(0).add(initVictorStake);
            let optionPoint1 = new BN(0).add(initVictorStake);

            Helper.assertEqual(epochPoints, await daoContract.getTotalPoints(1), "total epoch points should be correct");
            campPointsData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(campPoints, campPointsData[1], "camp total points should be correct");
            Helper.assertEqual(optionPoint1, campPointsData[0][0], "option voted count is incorrect");
            Helper.assertEqual(0, campPointsData[0][1], "option voted count is incorrect");
            Helper.assertEqual(0, campPointsData[0][2], "option voted count is incorrect");

            Helper.assertEqual(1, await daoContract.getNumberVotes(victor, 1), "number votes should be correct");
            Helper.assertEqual(0, await daoContract.getNumberVotes(mike, 1), "number votes should be correct");
            Helper.assertEqual(0, await daoContract.getNumberVotes(loi, 1), "number votes should be correct");

            tx = await daoContract.vote(1, 2, {from: mike});
            gasUsed.iadd(new BN(tx.receipt.cumulativeGasUsed));

            epochPoints.iadd(initMikeStake);
            campPoints.iadd(initMikeStake);
            let optionPoint2 = new BN(0).add(initMikeStake);

            Helper.assertEqual(epochPoints, await daoContract.getTotalPoints(1), "total epoch points should be correct");
            campPointsData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(campPoints, campPointsData[1], "camp total points should be correct");
            Helper.assertEqual(optionPoint1, campPointsData[0][0], "option voted count is incorrect");
            Helper.assertEqual(optionPoint2, campPointsData[0][1], "option voted count is incorrect");
            Helper.assertEqual(0, campPointsData[0][2], "option voted count is incorrect");

            Helper.assertEqual(1, await daoContract.getNumberVotes(victor, 1), "number votes should be correct");
            Helper.assertEqual(1, await daoContract.getNumberVotes(mike, 1), "number votes should be correct");
            Helper.assertEqual(0, await daoContract.getNumberVotes(loi, 1), "number votes should be correct");

            tx = await daoContract.vote(1, 1, {from: loi});
            gasUsed.iadd(new BN(tx.receipt.cumulativeGasUsed));

            logInfo("Vote: average gas used without delegation: " + gasUsed.div(new BN(3)).toString(10));

            epochPoints.iadd(initLoiStake);
            campPoints.iadd(initLoiStake);
            optionPoint1.iadd(initLoiStake);

            Helper.assertEqual(epochPoints, await daoContract.getTotalPoints(1), "total epoch points should be correct");
            campPointsData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(campPoints, campPointsData[1], "camp total points should be correct");
            Helper.assertEqual(optionPoint1, campPointsData[0][0], "option voted count is incorrect");
            Helper.assertEqual(optionPoint2, campPointsData[0][1], "option voted count is incorrect");
            Helper.assertEqual(0, campPointsData[0][2], "option voted count is incorrect");

            Helper.assertEqual(1, await daoContract.getNumberVotes(victor, 1), "number votes should be correct");
            Helper.assertEqual(1, await daoContract.getNumberVotes(mike, 1), "number votes should be correct");
            Helper.assertEqual(1, await daoContract.getNumberVotes(loi, 1), "number votes should be correct");

            await stakingContract.withdraw(mulPrecision(100), {from: loi});

            epochPoints.isub(mulPrecision(100));
            campPoints.isub(mulPrecision(100));
            optionPoint1.isub(mulPrecision(100));

            Helper.assertEqual(epochPoints, await daoContract.getTotalPoints(1), "total epoch points should be correct");
            campPointsData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(campPoints, campPointsData[1], "camp total points should be correct");
            Helper.assertEqual(optionPoint1, campPointsData[0][0], "option voted count is incorrect");
            Helper.assertEqual(optionPoint2, campPointsData[0][1], "option voted count is incorrect");
            Helper.assertEqual(0, campPointsData[0][2], "option voted count is incorrect");

            Helper.assertEqual(1, await daoContract.getNumberVotes(victor, 1), "number votes should be correct");
            Helper.assertEqual(1, await daoContract.getNumberVotes(mike, 1), "number votes should be correct");
            Helper.assertEqual(1, await daoContract.getNumberVotes(loi, 1), "number votes should be correct");

            await stakingContract.deposit(mulPrecision(100), {from: mike});
            await stakingContract.delegate(victor, {from: loi});

            // data shouldn't be changed
            Helper.assertEqual(epochPoints, await daoContract.getTotalPoints(1), "total epoch points should be correct");
            campPointsData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(campPoints, campPointsData[1], "camp total points should be correct");
            Helper.assertEqual(optionPoint1, campPointsData[0][0], "option voted count is incorrect");
            Helper.assertEqual(optionPoint2, campPointsData[0][1], "option voted count is incorrect");
            Helper.assertEqual(0, campPointsData[0][2], "option voted count is incorrect");

            Helper.assertEqual(1, await daoContract.getNumberVotes(victor, 1), "number votes should be correct");
            Helper.assertEqual(1, await daoContract.getNumberVotes(mike, 1), "number votes should be correct");
            Helper.assertEqual(1, await daoContract.getNumberVotes(loi, 1), "number votes should be correct");

            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                2, currentBlock + 3, currentBlock + 3 + minCampPeriod,
                minPercentageInPrecision, cInPrecision, tInPrecision, [25, 50], '0x', {from: campCreator}
            );
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 2);

            await daoContract.vote(2, 1, {from: victor});

            epochPoints.iadd(initVictorStake);
            let campPoints2 = new BN(0).add(initVictorStake);
            let optionPoint21 = new BN(0).add(initVictorStake);

            Helper.assertEqual(epochPoints, await daoContract.getTotalPoints(1), "total epoch points should be correct");
            campPointsData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(campPoints, campPointsData[1], "camp total points should be correct");
            Helper.assertEqual(optionPoint1, campPointsData[0][0], "option voted count is incorrect");
            Helper.assertEqual(optionPoint2, campPointsData[0][1], "option voted count is incorrect");
            Helper.assertEqual(0, campPointsData[0][2], "option voted count is incorrect");

            campPointsData = await daoContract.getCampaignVoteCountData(2);
            Helper.assertEqual(campPoints2, campPointsData[1], "camp total points should be correct");
            Helper.assertEqual(optionPoint21, campPointsData[0][0], "option voted count is incorrect");
            Helper.assertEqual(0, campPointsData[0][1], "option voted count is incorrect");

            Helper.assertEqual(2, await daoContract.getNumberVotes(victor, 1), "number votes should be correct");
            Helper.assertEqual(1, await daoContract.getNumberVotes(mike, 1), "number votes should be correct");
            Helper.assertEqual(1, await daoContract.getNumberVotes(loi, 1), "number votes should be correct");

            await stakingContract.withdraw(mulPrecision(200), {from: victor});

            epochPoints.isub(mulPrecision(200 * 2));
            campPoints.isub(mulPrecision(200));
            optionPoint1.isub(mulPrecision(200));
            campPoints2.isub(mulPrecision(200));
            optionPoint21.isub(mulPrecision(200));

            Helper.assertEqual(epochPoints, await daoContract.getTotalPoints(1), "total epoch points should be correct");
            campPointsData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(campPoints, campPointsData[1], "camp total points should be correct");
            Helper.assertEqual(optionPoint1, campPointsData[0][0], "option voted count is incorrect");
            Helper.assertEqual(optionPoint2, campPointsData[0][1], "option voted count is incorrect");
            Helper.assertEqual(0, campPointsData[0][2], "option voted count is incorrect");

            campPointsData = await daoContract.getCampaignVoteCountData(2);
            Helper.assertEqual(campPoints2, campPointsData[1], "camp total points should be correct");
            Helper.assertEqual(optionPoint21, campPointsData[0][0], "option voted count is incorrect");
            Helper.assertEqual(0, campPointsData[0][1], "option voted count is incorrect");
        });

        it("Test vote should update data correctly when revote - without delegation", async function() {
            await deployContracts(100, currentBlock + 20, 20);
            await setupSimpleStakingData();

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock);

            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                1, currentBlock + 3, currentBlock + 3 + minCampPeriod,
                0, 0, 0, [25, 50, 100], '0x', {from: campCreator}
            );
            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                2, currentBlock + 4, currentBlock + 4 + minCampPeriod,
                0, 0, 0, [25, 50], '0x', {from: campCreator}
            );
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 2);

            Helper.assertEqual(0, await daoContract.getTotalPoints(1), "total epoch points should be correct");
            let campPointsData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(0, campPointsData[1], "camp total points should be correct");
            Helper.assertEqual(0, campPointsData[0][0], "option voted count is incorrect");
            Helper.assertEqual(0, campPointsData[0][1], "option voted count is incorrect");
            Helper.assertEqual(0, campPointsData[0][2], "option voted count is incorrect");

            Helper.assertEqual(0, await daoContract.getNumberVotes(victor, 1), "number votes should be correct");
            Helper.assertEqual(0, await daoContract.getNumberVotes(mike, 1), "number votes should be correct");

            let tx = await daoContract.vote(1, 1, {from: victor});
            expectEvent(tx, 'Voted', {
                staker: victor,
                epoch: new BN(1),
                campID: new BN(1),
                option: new BN(1)
            });

            let epochPoints = new BN(0).add(initVictorStake);
            let campPoints = new BN(0).add(initVictorStake);
            let optionPoint1 = new BN(0).add(initVictorStake);

            Helper.assertEqual(epochPoints, await daoContract.getTotalPoints(1), "total epoch points should be correct");
            campPointsData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(campPoints, campPointsData[1], "camp total points should be correct");
            Helper.assertEqual(optionPoint1, campPointsData[0][0], "option voted count is incorrect");
            Helper.assertEqual(0, campPointsData[0][1], "option voted count is incorrect");
            Helper.assertEqual(0, campPointsData[0][2], "option voted count is incorrect");

            Helper.assertEqual(1, await daoContract.getNumberVotes(victor, 1), "number votes should be correct");
            Helper.assertEqual(0, await daoContract.getNumberVotes(mike, 1), "number votes should be correct");
            Helper.assertEqual(0, await daoContract.getNumberVotes(loi, 1), "number votes should be correct");

            tx = await daoContract.vote(1, 2, {from: mike});
            logInfo("Vote: revote different option, gas used: " + tx.receipt.cumulativeGasUsed);
            expectEvent(tx, 'Voted', {
                staker: mike,
                epoch: new BN(1),
                campID: new BN(1),
                option: new BN(2)
            });
            await daoContract.vote(1, 2, {from: loi});

            epochPoints.iadd(initMikeStake).iadd(initLoiStake);
            campPoints.iadd(initMikeStake).iadd(initLoiStake);
            let optionPoint2 = new BN(0).add(initMikeStake).add(initLoiStake);

            Helper.assertEqual(epochPoints, await daoContract.getTotalPoints(1), "total epoch points should be correct");
            campPointsData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(campPoints, campPointsData[1], "camp total points should be correct");
            Helper.assertEqual(optionPoint1, campPointsData[0][0], "option voted count is incorrect");
            Helper.assertEqual(optionPoint2, campPointsData[0][1], "option voted count is incorrect");
            Helper.assertEqual(0, campPointsData[0][2], "option voted count is incorrect");

            Helper.assertEqual(1, await daoContract.getNumberVotes(victor, 1), "number votes should be correct");
            Helper.assertEqual(1, await daoContract.getNumberVotes(mike, 1), "number votes should be correct");
            Helper.assertEqual(1, await daoContract.getNumberVotes(loi, 1), "number votes should be correct");

            // vote the same
            tx = await daoContract.vote(1, 2, {from: mike});
            logInfo("Vote: revote same option, gas used: " + tx.receipt.cumulativeGasUsed);

            Helper.assertEqual(epochPoints, await daoContract.getTotalPoints(1), "total epoch points should be correct");
            campPointsData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(campPoints, campPointsData[1], "camp total points should be correct");
            Helper.assertEqual(optionPoint1, campPointsData[0][0], "option voted count is incorrect");
            Helper.assertEqual(optionPoint2, campPointsData[0][1], "option voted count is incorrect");
            Helper.assertEqual(0, campPointsData[0][2], "option voted count is incorrect");

            Helper.assertEqual(1, await daoContract.getNumberVotes(victor, 1), "number votes should be correct");
            Helper.assertEqual(1, await daoContract.getNumberVotes(mike, 1), "number votes should be correct");
            Helper.assertEqual(1, await daoContract.getNumberVotes(loi, 1), "number votes should be correct");

            // revote for mike
            await daoContract.vote(1, 1, {from: mike});

            // total points + camp points shouldn't change
            // move mike's stake from op2 to op1
            optionPoint1.iadd(initMikeStake);
            optionPoint2.isub(initMikeStake);

            Helper.assertEqual(epochPoints, await daoContract.getTotalPoints(1), "total epoch points should be correct");
            campPointsData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(campPoints, campPointsData[1], "camp total points should be correct");
            Helper.assertEqual(optionPoint1, campPointsData[0][0], "option voted count is incorrect");
            Helper.assertEqual(optionPoint2, campPointsData[0][1], "option voted count is incorrect");
            Helper.assertEqual(0, campPointsData[0][2], "option voted count is incorrect");

            Helper.assertEqual(1, await daoContract.getNumberVotes(victor, 1), "number votes should be correct");
            Helper.assertEqual(1, await daoContract.getNumberVotes(mike, 1), "number votes should be correct");
            Helper.assertEqual(1, await daoContract.getNumberVotes(loi, 1), "number votes should be correct");

            await daoContract.vote(2, 1, {from: mike});
            epochPoints.iadd(initMikeStake);

            Helper.assertEqual(epochPoints, await daoContract.getTotalPoints(1), "total epoch points should be correct");
            campPointsData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(campPoints, campPointsData[1], "camp total points should be correct");
            Helper.assertEqual(optionPoint1, campPointsData[0][0], "option voted count is incorrect");
            Helper.assertEqual(optionPoint2, campPointsData[0][1], "option voted count is incorrect");
            Helper.assertEqual(0, campPointsData[0][2], "option voted count is incorrect");

            let campPoints2 = new BN(0).add(initMikeStake);
            let option1Camp2 = new BN(0).add(initMikeStake);

            campPointsData = await daoContract.getCampaignVoteCountData(2);
            Helper.assertEqual(campPoints2, campPointsData[1], "camp total points should be correct");
            Helper.assertEqual(option1Camp2, campPointsData[0][0], "option voted count is incorrect");
            Helper.assertEqual(0, campPointsData[0][1], "option voted count is incorrect");

            Helper.assertEqual(1, await daoContract.getNumberVotes(victor, 1), "number votes should be correct");
            Helper.assertEqual(2, await daoContract.getNumberVotes(mike, 1), "number votes should be correct");
            Helper.assertEqual(1, await daoContract.getNumberVotes(loi, 1), "number votes should be correct");

            await stakingContract.withdraw(mulPrecision(100), {from: mike});

            epochPoints.isub(mulPrecision(100 * 2));
            campPoints.isub(mulPrecision(100));
            optionPoint1.isub(mulPrecision(100)); // mike has change vote to option 1
            campPoints2.isub(mulPrecision(100));
            option1Camp2.isub(mulPrecision(100));

            Helper.assertEqual(epochPoints, await daoContract.getTotalPoints(1), "total epoch points should be correct");
            campPointsData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(campPoints, campPointsData[1], "camp total points should be correct");
            Helper.assertEqual(optionPoint1, campPointsData[0][0], "option voted count is incorrect");
            Helper.assertEqual(optionPoint2, campPointsData[0][1], "option voted count is incorrect");
            Helper.assertEqual(0, campPointsData[0][2], "option voted count is incorrect");

            campPointsData = await daoContract.getCampaignVoteCountData(2);
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
            Helper.assertEqual(epochPoints, await daoContract.getTotalPoints(1), "total epoch points should be correct");
            campPointsData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(campPoints, campPointsData[1], "camp total points should be correct");
            Helper.assertEqual(optionPoint1, campPointsData[0][0], "option voted count is incorrect");
            Helper.assertEqual(optionPoint2, campPointsData[0][1], "option voted count is incorrect");
            Helper.assertEqual(0, campPointsData[0][2], "option voted count is incorrect");

            campPointsData = await daoContract.getCampaignVoteCountData(2);
            Helper.assertEqual(campPoints2, campPointsData[1], "camp total points should be correct");
            Helper.assertEqual(option1Camp2, campPointsData[0][0], "option voted count is incorrect");
            Helper.assertEqual(0, campPointsData[0][1], "option voted count is incorrect");
        });

        it("Test vote should update data correctly - with delegation", async function() {
            await deployContracts(50, currentBlock + 20, 20);
            await setupSimpleStakingData();
            await stakingContract.delegate(mike, {from: victor});
            await stakingContract.delegate(poolMaster, {from: mike});

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock);

            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                1, currentBlock + 3, currentBlock + 3 + minCampPeriod,
                0, 0, 0, [25, 50, 100], '0x', {from: campCreator}
            );
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 2);

            // Check: initial data for epoch 1 and camp 1
            Helper.assertEqual(0, await daoContract.getTotalPoints(1), "total epoch points should be correct");
            let campPointsData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(0, campPointsData[1], "camp total points should be correct");
            Helper.assertEqual(0, campPointsData[0][0], "option voted count is incorrect");
            Helper.assertEqual(0, campPointsData[0][1], "option voted count is incorrect");
            Helper.assertEqual(0, campPointsData[0][2], "option voted count is incorrect");

            Helper.assertEqual(0, await daoContract.getNumberVotes(victor, 1), "number votes should be correct");
            Helper.assertEqual(0, await daoContract.getNumberVotes(mike, 1), "number votes should be correct");
            Helper.assertEqual(0, await daoContract.getNumberVotes(loi, 1), "number votes should be correct");

            // Check: victor has no delegated stake, has stake but already delegated to mike
            // => no data changes here
            let tx = await daoContract.vote(1, 1, {from: victor});
            let gasUsed = new BN(tx.receipt.cumulativeGasUsed);

            // Victor has delegated to mike, and no one delegated to him
            // So his vote wont increase points or vote counts
            let epochPoints = new BN(0);
            let campPoints = new BN(0);
            let optionPoint1 = new BN(0);

            Helper.assertEqual(epochPoints, await daoContract.getTotalPoints(1), "total epoch points should be correct");
            campPointsData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(campPoints, campPointsData[1], "camp total points should be correct");
            Helper.assertEqual(optionPoint1, campPointsData[0][0], "option voted count is incorrect");
            Helper.assertEqual(0, campPointsData[0][1], "option voted count is incorrect");
            Helper.assertEqual(0, campPointsData[0][2], "option voted count is incorrect");

            Helper.assertEqual(1, await daoContract.getNumberVotes(victor, 1), "number votes should be correct");
            Helper.assertEqual(0, await daoContract.getNumberVotes(mike, 1), "number votes should be correct");
            Helper.assertEqual(0, await daoContract.getNumberVotes(loi, 1), "number votes should be correct");

            // Check: mike delegated to poolMaster, victor delegated mike
            // data should change based on victor's stake here
            tx = await daoContract.vote(1, 1, {from: mike});
            gasUsed.iadd(new BN(tx.receipt.cumulativeGasUsed));

            logInfo("Vote: average gas used with delegation: " + gasUsed.div(new BN(2)).toString(10));

            // victor delegated to mike, mike delegated to poolmaster
            // mike's vote will increase points + vote counts by victor's stake
            epochPoints.iadd(initVictorStake);
            campPoints.iadd(initVictorStake);
            optionPoint1.iadd(initVictorStake);
            let optionPoint2 = new BN(0);

            Helper.assertEqual(epochPoints, await daoContract.getTotalPoints(1), "total epoch points should be correct");
            campPointsData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(campPoints, campPointsData[1], "camp total points should be correct");
            Helper.assertEqual(optionPoint1, campPointsData[0][0], "option voted count is incorrect");
            Helper.assertEqual(optionPoint2, campPointsData[0][1], "option voted count is incorrect");
            Helper.assertEqual(0, campPointsData[0][2], "option voted count is incorrect");

            Helper.assertEqual(1, await daoContract.getNumberVotes(victor, 1), "number votes should be correct");
            Helper.assertEqual(1, await daoContract.getNumberVotes(mike, 1), "number votes should be correct");
            Helper.assertEqual(0, await daoContract.getNumberVotes(loi, 1), "number votes should be correct");

            // Check: vote from someone has stake, no delegated stake, no delegated address
            await daoContract.vote(1, 1, {from: loi});

            epochPoints.iadd(initLoiStake);
            campPoints.iadd(initLoiStake);
            optionPoint1.iadd(initLoiStake);

            Helper.assertEqual(epochPoints, await daoContract.getTotalPoints(1), "total epoch points should be correct");
            campPointsData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(campPoints, campPointsData[1], "camp total points should be correct");
            Helper.assertEqual(optionPoint1, campPointsData[0][0], "option voted count is incorrect");
            Helper.assertEqual(optionPoint2, campPointsData[0][1], "option voted count is incorrect");
            Helper.assertEqual(0, campPointsData[0][2], "option voted count is incorrect");

            Helper.assertEqual(1, await daoContract.getNumberVotes(victor, 1), "number votes should be correct");
            Helper.assertEqual(1, await daoContract.getNumberVotes(mike, 1), "number votes should be correct");
            Helper.assertEqual(1, await daoContract.getNumberVotes(loi, 1), "number votes should be correct");

            // Check: withdraw from staker with no delegated address
            await stakingContract.withdraw(mulPrecision(100), {from: loi});

            epochPoints.isub(mulPrecision(100));
            campPoints.isub(mulPrecision(100));
            optionPoint1.isub(mulPrecision(100));

            Helper.assertEqual(epochPoints, await daoContract.getTotalPoints(1), "total epoch points should be correct");
            campPointsData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(campPoints, campPointsData[1], "camp total points should be correct");
            Helper.assertEqual(optionPoint1, campPointsData[0][0], "option voted count is incorrect");
            Helper.assertEqual(optionPoint2, campPointsData[0][1], "option voted count is incorrect");
            Helper.assertEqual(0, campPointsData[0][2], "option voted count is incorrect");

            Helper.assertEqual(1, await daoContract.getNumberVotes(victor, 1), "number votes should be correct");
            Helper.assertEqual(1, await daoContract.getNumberVotes(mike, 1), "number votes should be correct");
            Helper.assertEqual(1, await daoContract.getNumberVotes(loi, 1), "number votes should be correct");

            // Check: vote from someone with no stake, but has delegated stake
            await daoContract.vote(1, 2, {from: poolMaster});

            epochPoints.iadd(initMikeStake);
            campPoints.iadd(initMikeStake);
            optionPoint2.iadd(initMikeStake);

            Helper.assertEqual(epochPoints, await daoContract.getTotalPoints(1), "total epoch points should be correct");
            campPointsData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(campPoints, campPointsData[1], "camp total points should be correct");
            Helper.assertEqual(optionPoint1, campPointsData[0][0], "option voted count is incorrect");
            Helper.assertEqual(optionPoint2, campPointsData[0][1], "option voted count is incorrect");

            Helper.assertEqual(1, await daoContract.getNumberVotes(victor, 1), "number votes should be correct");
            Helper.assertEqual(1, await daoContract.getNumberVotes(mike, 1), "number votes should be correct");
            Helper.assertEqual(1, await daoContract.getNumberVotes(poolMaster, 1), "number votes should be correct");
            Helper.assertEqual(1, await daoContract.getNumberVotes(loi, 1), "number votes should be correct");

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
            Helper.assertEqual(epochPoints, await daoContract.getTotalPoints(1), "total epoch points should be correct");
            campPointsData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(campPoints, campPointsData[1], "camp total points should be correct");
            Helper.assertEqual(optionPoint1, campPointsData[0][0], "option voted count is incorrect");
            Helper.assertEqual(optionPoint2, campPointsData[0][1], "option voted count is incorrect");

            Helper.assertEqual(1, await daoContract.getNumberVotes(victor, 1), "number votes should be correct");
            Helper.assertEqual(1, await daoContract.getNumberVotes(mike, 1), "number votes should be correct");
            Helper.assertEqual(1, await daoContract.getNumberVotes(loi, 1), "number votes should be correct");

            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                2, currentBlock + 3, currentBlock + 3 + minCampPeriod,
                0, 0, 0, [25, 50], '0x', {from: campCreator}
            );
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 2);

            // Check: vote for second camp
            await daoContract.vote(2, 1, {from: mike});

            epochPoints.iadd(initVictorStake);
            let campPoints2 = new BN(0).add(initVictorStake);
            let optionPoint21 = new BN(0).add(initVictorStake);

            Helper.assertEqual(epochPoints, await daoContract.getTotalPoints(1), "total epoch points should be correct");
            campPointsData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(campPoints, campPointsData[1], "camp total points should be correct");
            Helper.assertEqual(optionPoint1, campPointsData[0][0], "option voted count is incorrect");
            Helper.assertEqual(optionPoint2, campPointsData[0][1], "option voted count is incorrect");

            campPointsData = await daoContract.getCampaignVoteCountData(2);
            Helper.assertEqual(campPoints2, campPointsData[1], "camp total points should be correct");
            Helper.assertEqual(optionPoint21, campPointsData[0][0], "option voted count is incorrect");

            Helper.assertEqual(2, await daoContract.getNumberVotes(mike, 1), "number votes should be correct");
            Helper.assertEqual(1, await daoContract.getNumberVotes(victor, 1), "number votes should be correct");
            Helper.assertEqual(1, await daoContract.getNumberVotes(poolMaster, 1), "number votes should be correct");
            Helper.assertEqual(1, await daoContract.getNumberVotes(loi, 1), "number votes should be correct");

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

            Helper.assertEqual(epochPoints, await daoContract.getTotalPoints(1), "total epoch points should be correct");
            campPointsData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(campPoints, campPointsData[1], "camp total points should be correct");
            Helper.assertEqual(optionPoint1, campPointsData[0][0], "option voted count is incorrect");
            Helper.assertEqual(optionPoint2, campPointsData[0][1], "option voted count is incorrect");

            campPointsData = await daoContract.getCampaignVoteCountData(2);
            Helper.assertEqual(campPoints2, campPointsData[1], "camp total points should be correct");
            Helper.assertEqual(optionPoint21, campPointsData[0][0], "option voted count is incorrect");

            // make stakes for each staker are the same as init
            await stakingContract.deposit(mulPrecision(100), {from: victor});
            await stakingContract.withdraw(mulPrecision(100), {from: mike});

            currentBlock = await Helper.getCurrentBlock();
            // delay to epoch 2
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], epochPeriod + startBlock - currentBlock);

            // Current data:
            // (mike + poolMaster) (has stake, no delegation)
            // loi + victor (delegated to poolMaster, has stake, no delegated stake)

            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                1, currentBlock + 3, currentBlock + 3 + minCampPeriod,
                0, 0, 0, [25, 50, 100], '0x', {from: campCreator}
            );
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 2);

            await daoContract.vote(3, 1, {from: poolMaster});
            await daoContract.vote(3, 2, {from: mike});

            epochPoints = new BN(0).add(initPoolMasterStake).add(initMikeStake).add(initVictorStake).add(initLoiStake);
            let campPoints3 = new BN(0).add(epochPoints);
            let optionPoints31 = new BN(0).add(initPoolMasterStake).add(initVictorStake).add(initLoiStake);
            let optionPoints32 = new BN(0).add(initMikeStake);

            Helper.assertEqual(epochPoints, await daoContract.getTotalPoints(2), "total epoch points should be correct");
            campPointsData = await daoContract.getCampaignVoteCountData(3);
            Helper.assertEqual(campPoints3, campPointsData[1], "camp total points should be correct");
            Helper.assertEqual(optionPoints31, campPointsData[0][0], "option voted count is incorrect");
            Helper.assertEqual(optionPoints32, campPointsData[0][1], "option voted count is incorrect");
            Helper.assertEqual(0, campPointsData[0][2], "option voted count is incorrect");

            Helper.assertEqual(1, await daoContract.getNumberVotes(mike, 2), "number votes should be correct");
            Helper.assertEqual(1, await daoContract.getNumberVotes(poolMaster, 2), "number votes should be correct");

            await stakingContract.withdraw(mulPrecision(100), {from: victor});
            await stakingContract.withdraw(mulPrecision(200), {from: loi});
            await stakingContract.withdraw(mulPrecision(50), {from: poolMaster});
            await stakingContract.withdraw(mulPrecision(150), {from: mike});

            epochPoints.isub(mulPrecision(500));
            campPoints3.isub(mulPrecision(500));
            optionPoints31.isub(mulPrecision(350));
            optionPoints32.isub(mulPrecision(150));

            Helper.assertEqual(epochPoints, await daoContract.getTotalPoints(2), "total epoch points should be correct");
            campPointsData = await daoContract.getCampaignVoteCountData(3);
            Helper.assertEqual(campPoints3, campPointsData[1], "camp total points should be correct");
            Helper.assertEqual(optionPoints31, campPointsData[0][0], "option voted count is incorrect");
            Helper.assertEqual(optionPoints32, campPointsData[0][1], "option voted count is incorrect");

            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                2, currentBlock + 3, currentBlock + 3 + minCampPeriod,
                0, 0, 0, [25, 50, 100], '0x', {from: campCreator}
            );
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 2);

            await daoContract.vote(4, 2, {from: poolMaster});

            let campPoints4 = new BN(0).add(initPoolMasterStake).add(initVictorStake).add(initLoiStake);
            campPoints4.isub(mulPrecision(350));
            let votePoints42 = new BN(0).add(campPoints4);
            epochPoints.iadd(campPoints4);

            Helper.assertEqual(epochPoints, await daoContract.getTotalPoints(2), "total epoch points should be correct");
            campPointsData = await daoContract.getCampaignVoteCountData(3);
            Helper.assertEqual(campPoints3, campPointsData[1], "camp total points should be correct");
            Helper.assertEqual(optionPoints31, campPointsData[0][0], "option voted count is incorrect");
            Helper.assertEqual(optionPoints32, campPointsData[0][1], "option voted count is incorrect");

            campPointsData = await daoContract.getCampaignVoteCountData(4);
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

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock);

            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                1, currentBlock + 3, currentBlock + 3 + minCampPeriod,
                0, 0, 0, [25, 50, 100], '0x', {from: campCreator}
            );
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 2);
            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                2, currentBlock + 3, currentBlock + 3 + minCampPeriod,
                0, 0, 0, [25, 50, 100], '0x', {from: campCreator}
            );
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 2);

            await daoContract.vote(1, 1, {from: victor});
            await daoContract.vote(1, 2, {from: loi});

            // Nothing changes as victor + loi have delegated to another
            let epochPoints = new BN(0);
            let campPoints1 = new BN(0);
            let optionPoint11 = new BN(0);
            let optionPoint12 = new BN(0);
            let campPoints2 = new BN(0);
            let optionPoint21 = new BN(0);
            let optionPoint22 = new BN(0);

            Helper.assertEqual(epochPoints, await daoContract.getTotalPoints(1), "total epoch points should be correct");
            let campPointsData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(campPoints1, campPointsData[1], "camp total points should be correct");
            Helper.assertEqual(optionPoint11, campPointsData[0][0], "option voted count is incorrect");
            Helper.assertEqual(optionPoint12, campPointsData[0][1], "option voted count is incorrect");

            campPointsData = await daoContract.getCampaignVoteCountData(2);
            Helper.assertEqual(campPoints2, campPointsData[1], "camp total points should be correct");
            Helper.assertEqual(optionPoint21, campPointsData[0][0], "option voted count is incorrect");
            Helper.assertEqual(optionPoint22, campPointsData[0][1], "option voted count is incorrect");

            Helper.assertEqual(1, await daoContract.getNumberVotes(victor, 1), "number votes should be correct");
            Helper.assertEqual(0, await daoContract.getNumberVotes(mike, 1), "number votes should be correct");
            Helper.assertEqual(1, await daoContract.getNumberVotes(loi, 1), "number votes should be correct");
            Helper.assertEqual(0, await daoContract.getNumberVotes(poolMaster2, 1), "number votes should be correct");

            let tx = await daoContract.vote(1, 1, {from: poolMaster});
            logInfo("Vote: init 1 epoch - with delegated stake, no stake, gas used: " + tx.receipt.cumulativeGasUsed);
            await daoContract.vote(2, 1, {from: poolMaster});

            epochPoints.iadd(initMikeStake).iadd(initMikeStake);
            campPoints1.iadd(initMikeStake);
            optionPoint11.iadd(initMikeStake);
            campPoints2.iadd(initMikeStake);
            optionPoint21.iadd(initMikeStake);

            tx = await daoContract.vote(1, 2, {from: poolMaster2});
            logInfo("Vote: init 1 epoch - with both delegated stake + stake, gas used: " + tx.receipt.cumulativeGasUsed);

            epochPoints.iadd(initPoolMaster2Stake).iadd(initLoiStake);
            campPoints1.iadd(initPoolMaster2Stake).iadd(initLoiStake);
            optionPoint12.iadd(initPoolMaster2Stake).iadd(initLoiStake);

            Helper.assertEqual(1, await daoContract.getNumberVotes(poolMaster2, 1), "number votes should be correct");
            Helper.assertEqual(epochPoints, await daoContract.getTotalPoints(1), "total epoch points should be correct");
            campPointsData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(campPoints1, campPointsData[1], "camp total points should be correct");
            Helper.assertEqual(optionPoint11, campPointsData[0][0], "option voted count is incorrect");
            Helper.assertEqual(optionPoint12, campPointsData[0][1], "option voted count is incorrect");

            campPointsData = await daoContract.getCampaignVoteCountData(2);
            Helper.assertEqual(campPoints2, campPointsData[1], "camp total points should be correct");
            Helper.assertEqual(optionPoint21, campPointsData[0][0], "option voted count is incorrect");
            Helper.assertEqual(optionPoint22, campPointsData[0][1], "option voted count is incorrect");

            // Revote
            await daoContract.vote(1, 1, {from: poolMaster2});

            optionPoint12.isub(initPoolMaster2Stake).isub(initLoiStake);
            optionPoint11.iadd(initPoolMaster2Stake).iadd(initLoiStake);

            Helper.assertEqual(epochPoints, await daoContract.getTotalPoints(1), "total epoch points should be correct");
            campPointsData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(campPoints1, campPointsData[1], "camp total points should be correct");
            Helper.assertEqual(optionPoint11, campPointsData[0][0], "option voted count is incorrect");
            Helper.assertEqual(optionPoint12, campPointsData[0][1], "option voted count is incorrect");

            // Revote
            await daoContract.vote(2, 2, {from: poolMaster});

            optionPoint21.isub(initMikeStake);
            optionPoint22.iadd(initMikeStake);

            Helper.assertEqual(epochPoints, await daoContract.getTotalPoints(1), "total epoch points should be correct");

            campPointsData = await daoContract.getCampaignVoteCountData(2);
            Helper.assertEqual(campPoints2, campPointsData[1], "camp total points should be correct");
            Helper.assertEqual(optionPoint21, campPointsData[0][0], "option voted count is incorrect");
            Helper.assertEqual(optionPoint22, campPointsData[0][1], "option voted count is incorrect");

            // Revote back to older option
            await daoContract.vote(1, 2, {from: poolMaster2});

            optionPoint11.isub(initPoolMaster2Stake).isub(initLoiStake);
            optionPoint12.iadd(initPoolMaster2Stake).iadd(initLoiStake);

            Helper.assertEqual(epochPoints, await daoContract.getTotalPoints(1), "total epoch points should be correct");
            campPointsData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(campPoints1, campPointsData[1], "camp total points should be correct");
            Helper.assertEqual(optionPoint11, campPointsData[0][0], "option voted count is incorrect");
            Helper.assertEqual(optionPoint12, campPointsData[0][1], "option voted count is incorrect");

            // Revote the same previous option
            await daoContract.vote(1, 2, {from: poolMaster2});
            await daoContract.vote(2, 2, {from: poolMaster});

            Helper.assertEqual(epochPoints, await daoContract.getTotalPoints(1), "total epoch points should be correct");
            campPointsData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(campPoints1, campPointsData[1], "camp total points should be correct");
            Helper.assertEqual(optionPoint11, campPointsData[0][0], "option voted count is incorrect");
            Helper.assertEqual(optionPoint12, campPointsData[0][1], "option voted count is incorrect");

            campPointsData = await daoContract.getCampaignVoteCountData(2);
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
            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 3 * epochPeriod + startBlock - currentBlock);

            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                1, currentBlock + 3, currentBlock + 3 + minCampPeriod,
                0, 0, 0, [25, 50, 100], '0x', {from: campCreator}
            );
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 2);
            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                2, currentBlock + 3, currentBlock + 3 + minCampPeriod,
                0, 0, 0, [25, 50, 100], '0x', {from: campCreator}
            );
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 2);

            let epochPoints = new BN(0);
            let campPoints1 = new BN(0);
            let optionPoint11 = new BN(0);
            let optionPoint12 = new BN(0);
            let campPoints2 = new BN(0);
            let optionPoint21 = new BN(0);
            let optionPoint22 = new BN(0);

            // nothing changes since victor+loi have delegated to another
            let tx = await daoContract.vote(1, 1, {from: victor});
            let gasUsed = new BN(tx.receipt.cumulativeGasUsed);
            tx = await daoContract.vote(1, 2, {from: loi});
            gasUsed.iadd(new BN(tx.receipt.cumulativeGasUsed));
            tx = await daoContract.vote(1, 1, {from: mike});
            gasUsed.iadd(new BN(tx.receipt.cumulativeGasUsed));
            logInfo("Vote: init data for 2 epoches, average gas used: " + gasUsed.div(new BN(3)).toString(10));

            epochPoints.iadd(initMikeStake);
            campPoints1.iadd(initMikeStake);
            optionPoint11.iadd(initMikeStake);
            await daoContract.vote(2, 2, {from: mike});
            epochPoints.iadd(initMikeStake);
            campPoints2.iadd(initMikeStake);
            optionPoint22.iadd(initMikeStake);
            await daoContract.vote(1, 2, {from: poolMaster});
            epochPoints.iadd(initVictorStake);
            campPoints1.iadd(initVictorStake);
            optionPoint12.iadd(initVictorStake);
            await daoContract.vote(2, 1, {from: poolMaster2});
            epochPoints.iadd(initLoiStake).iadd(initPoolMaster2Stake);
            campPoints2.iadd(initLoiStake).iadd(initPoolMaster2Stake);
            optionPoint21.iadd(initLoiStake).iadd(initPoolMaster2Stake);

            Helper.assertEqual(1, await daoContract.getNumberVotes(victor, 4), "number votes should be correct");
            Helper.assertEqual(2, await daoContract.getNumberVotes(mike, 4), "number votes should be correct");
            Helper.assertEqual(1, await daoContract.getNumberVotes(loi, 4), "number votes should be correct");
            Helper.assertEqual(1, await daoContract.getNumberVotes(poolMaster2, 4), "number votes should be correct");
            Helper.assertEqual(1, await daoContract.getNumberVotes(poolMaster, 4), "number votes should be correct");

            Helper.assertEqual(epochPoints, await daoContract.getTotalPoints(4), "total epoch points should be correct");
            let campPointsData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(campPoints1, campPointsData[1], "camp total points should be correct");
            Helper.assertEqual(optionPoint11, campPointsData[0][0], "option voted count is incorrect");
            Helper.assertEqual(optionPoint12, campPointsData[0][1], "option voted count is incorrect");

            campPointsData = await daoContract.getCampaignVoteCountData(2);
            Helper.assertEqual(campPoints2, campPointsData[1], "camp total points should be correct");
            Helper.assertEqual(optionPoint21, campPointsData[0][0], "option voted count is incorrect");
            Helper.assertEqual(optionPoint22, campPointsData[0][1], "option voted count is incorrect");
        });

        it("Test vote before start block", async function() {
            await deployContracts(10, currentBlock + 40, 10);
            await setupSimpleStakingData();
            await stakingContract.delegate(poolMaster, {from: victor});

            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
                0, 0, 0, [25, 50, 100], '0x', {from: campCreator}
            );

            await daoContract.vote(1, 1, {from: mike});
            await daoContract.vote(1, 2, {from: victor});
            await daoContract.vote(1, 3, {from: loi});
            await daoContract.vote(1, 2, {from: poolMaster});

            Helper.assertEqual(1, await daoContract.getNumberVotes(victor, 0), "number votes should be correct");
            Helper.assertEqual(1, await daoContract.getNumberVotes(mike, 0), "number votes should be correct");
            Helper.assertEqual(1, await daoContract.getNumberVotes(loi, 0), "number votes should be correct");
            Helper.assertEqual(0, await daoContract.getNumberVotes(poolMaster2, 0), "number votes should be correct");
            Helper.assertEqual(1, await daoContract.getNumberVotes(poolMaster, 0), "number votes should be correct");

            Helper.assertEqual(0, await daoContract.getTotalPoints(0), "total epoch points should be correct");
            let campPointsData = await daoContract.getCampaignVoteCountData(1);
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

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock);

            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                1, currentBlock + 3, currentBlock + 3 + minCampPeriod,
                0, 0, 0, [25, 50, 100], '0x', {from: campCreator}
            );
            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                2, currentBlock + 3, currentBlock + 3 + minCampPeriod,
                0, 0, 0, [25, 50, 100], '0x', {from: campCreator}
            );

            await stakingContract.withdraw(mulPrecision(100), {from: mike});

            let epochPoints = new BN(0);
            let campPoints1 = new BN(0);
            let optionPoint11 = new BN(0);
            let optionPoint12 = new BN(0);
            let campPoints2 = new BN(0);
            let optionPoint21 = new BN(0);
            let optionPoint23 = new BN(0);

            // partial withdraw
            await daoContract.vote(1, 1, {from: mike});
            epochPoints.iadd(initMikeStake).isub(mulPrecision(100));
            campPoints2.iadd(initMikeStake).isub(mulPrecision(100));
            optionPoint23.iadd(initMikeStake).isub(mulPrecision(100));

            await daoContract.vote(2, 3, {from: mike});
            epochPoints.iadd(initMikeStake).isub(mulPrecision(100));
            campPoints1.iadd(initMikeStake).isub(mulPrecision(100));
            optionPoint11.iadd(initMikeStake).isub(mulPrecision(100));

            await daoContract.vote(1, 2, {from: poolMaster});
            epochPoints.iadd(initVictorStake);
            campPoints1.iadd(initVictorStake);
            optionPoint12.iadd(initVictorStake);

            Helper.assertEqual(epochPoints, await daoContract.getTotalPoints(1), "total epoch points should be correct");
            let campPointsData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(campPoints1, campPointsData[1], "camp total points should be correct");
            Helper.assertEqual(optionPoint11, campPointsData[0][0], "option voted count is incorrect");
            Helper.assertEqual(optionPoint12, campPointsData[0][1], "option voted count is incorrect");

            campPointsData = await daoContract.getCampaignVoteCountData(2);
            Helper.assertEqual(campPoints2, campPointsData[1], "camp total points should be correct");
            Helper.assertEqual(optionPoint21, campPointsData[0][0], "option voted count is incorrect");
            Helper.assertEqual(optionPoint23, campPointsData[0][2], "option voted count is incorrect");

            // full withdraw
            await stakingContract.withdraw(initVictorStake, {from: victor});
            epochPoints.isub(initVictorStake);
            campPoints1.isub(initVictorStake);
            optionPoint12.isub(initVictorStake);

            Helper.assertEqual(epochPoints, await daoContract.getTotalPoints(1), "total epoch points should be correct");
            campPointsData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(campPoints1, campPointsData[1], "camp total points should be correct");
            Helper.assertEqual(optionPoint11, campPointsData[0][0], "option voted count is incorrect");
            Helper.assertEqual(optionPoint12, campPointsData[0][1], "option voted count is incorrect");

            await daoContract.vote(2, 1, {from: poolMaster});

            Helper.assertEqual(epochPoints, await daoContract.getTotalPoints(1), "total epoch points should be correct");
            campPointsData = await daoContract.getCampaignVoteCountData(2);
            Helper.assertEqual(campPoints2, campPointsData[1], "camp total points should be correct");
            Helper.assertEqual(optionPoint21, campPointsData[0][0], "option voted count is incorrect");
            Helper.assertEqual(optionPoint23, campPointsData[0][2], "option voted count is incorrect");

        });

        it("Test vote should revert camp is not existed", async function() {
            await deployContracts(4, currentBlock + 20, 3);

            await expectRevert(
                daoContract.vote(1, 1, {from: mike}),
                "vote: campaign doesn't exist"
            )

            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                0, currentBlock + 3, currentBlock + 3 + minCampPeriod,
                0, 0, 0, [25, 50], '0x', {from: campCreator}
            );

            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 3);
            await expectRevert(
                daoContract.vote(2, 1, {from: mike}),
                "vote: campaign doesn't exist"
            )

            await daoContract.vote(1, 1, {from: mike});
        })

        it("Test vote should revert camp has not started or already ended", async function() {
            await deployContracts(4, currentBlock + 20, 5);

            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                0, currentBlock + 5, currentBlock + 5 + minCampPeriod,
                0, 0, 0, [25, 50], '0x', {from: campCreator}
            );

            // camp not started yet
            await expectRevert(
                daoContract.vote(1, 1, {from: mike}),
                "vote: campaign not started"
            )

            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 3);

            // can note now
            await daoContract.vote(1, 1, {from: mike});

            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], minCampPeriod);

            // camp alread ended
            await expectRevert(
                daoContract.vote(1, 1, {from: mike}),
                "vote: campaign alr ended"
            );
        })

        it("Test vote should revert when voted option is invalid", async function() {
            await deployContracts(4, currentBlock + 20, 8);

            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                0, currentBlock + 5, currentBlock + 5 + minCampPeriod,
                0, 0, 0, [25, 50], '0x', {from: campCreator}
            );

            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 3);

            // can not vote for 0
            await expectRevert(
                daoContract.vote(1, 0, {from: mike}),
                "vote: option is 0"
            )

            // can not vote for option that is bigger than range
            await expectRevert(
                daoContract.vote(1, 3, {from: mike}),
                "vote: option is not in range"
            );

            // can note now
            await daoContract.vote(1, 1, {from: mike});
            await daoContract.vote(1, 2, {from: mike});
        })
    });

    describe("#Claim Reward tests", () => {
        it("Test claim reward percentage is correct, balance changes as expected - with delegation", async function() {
            await deployContracts(20, currentBlock + 15, 10);
            await setupSimpleStakingData();
            // no stake, but has delegated stake
            await stakingContract.delegate(poolMaster, {from: victor});
            // has both stake + delegated stake
            await stakingContract.delegate(poolMaster2, {from: loi});

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock);

            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                0, currentBlock + 2, currentBlock + 2 + minCampPeriod,
                0, 0, 0, [25, 50], '0x', {from: campCreator}
            );
            await daoContract.submitNewCampaign(
                0, currentBlock + 3, currentBlock + 3 + minCampPeriod,
                0, 0, 0, [25, 50], '0x', {from: campCreator}
            );

            let totalEpochPoints = new BN(0);
            let mikePoints = new BN(0);
            let poolMasterPoints = new BN(0);
            let poolMaster2Points = new BN(0);

            await daoContract.vote(1, 1, {from: mike});
            await daoContract.vote(1, 2, {from: mike});
            mikePoints.iadd(initMikeStake);
            totalEpochPoints.iadd(initMikeStake);
            await daoContract.vote(2, 1, {from: mike});
            await daoContract.vote(2, 1, {from: mike});
            mikePoints.iadd(initMikeStake);
            totalEpochPoints.iadd(initMikeStake);
            await daoContract.vote(1, 1, {from: poolMaster});
            totalEpochPoints.iadd(initVictorStake);
            poolMasterPoints.iadd(initVictorStake);
            await daoContract.vote(1, 1, {from: poolMaster2});
            totalEpochPoints.iadd(initLoiStake).iadd(initPoolMaster2Stake);
            poolMaster2Points.iadd(initLoiStake).iadd(initPoolMaster2Stake);

            await daoContract.vote(1, 1, {from: victor});
            await daoContract.vote(1, 1, {from: loi});

            let epochTotalReward = mulPrecision(1).div(new BN(2));
            await feeHandler.setEpochReward(1, {from: accounts[0], value: epochTotalReward});

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 1 * epochPeriod + startBlock - currentBlock);

            let mikePer = mikePoints.mul(precisionUnits).div(totalEpochPoints);
            let poolMasterPer = poolMasterPoints.mul(precisionUnits).div(totalEpochPoints);
            let poolMaster2Per = poolMaster2Points.mul(precisionUnits).div(totalEpochPoints);

            Helper.assertEqual(mikePer, await daoContract.getStakerRewardPercentageInPrecision(mike, 1), "reward per is incorrect");
            Helper.assertEqual(poolMasterPer, await daoContract.getStakerRewardPercentageInPrecision(poolMaster, 1), "reward per is incorrect");
            Helper.assertEqual(poolMaster2Per, await daoContract.getStakerRewardPercentageInPrecision(poolMaster2, 1), "reward per is incorrect");
            Helper.assertEqual(0, await daoContract.getStakerRewardPercentageInPrecision(victor, 1), "reward per is incorrect");
            Helper.assertEqual(0, await daoContract.getStakerRewardPercentageInPrecision(loi, 1), "reward per is incorrect");

            let expectedMikeBal = await Helper.getBalancePromise(mike);
            expectedMikeBal.iadd(mikePer.mul(epochTotalReward).div(precisionUnits));
            let expectedPM1Bal = await Helper.getBalancePromise(poolMaster);
            expectedPM1Bal.iadd(poolMasterPer.mul(epochTotalReward).div(precisionUnits));
            let expectedPM2Bal = await Helper.getBalancePromise(poolMaster2);
            expectedPM2Bal.iadd(poolMaster2Per.mul(epochTotalReward).div(precisionUnits));

            let gasUsed = new BN(0);
            let tx = await daoContract.claimReward(mike, 1);
            expectEvent(tx, 'RewardClaimed', {
                staker: mike,
                epoch: new BN(1),
                perInPrecision: await daoContract.getStakerRewardPercentageInPrecision(mike, 1)
            });
            gasUsed.iadd(new BN(tx.receipt.cumulativeGasUsed));
            tx = await daoContract.claimReward(poolMaster, 1);
            expectEvent(tx, 'RewardClaimed', {
                staker: poolMaster,
                epoch: new BN(1),
                perInPrecision: await daoContract.getStakerRewardPercentageInPrecision(poolMaster, 1)
            });
            gasUsed.iadd(new BN(tx.receipt.cumulativeGasUsed));
            tx = await daoContract.claimReward(poolMaster2, 1);
            expectEvent(tx, 'RewardClaimed', {
                staker: poolMaster2,
                epoch: new BN(1),
                perInPrecision: await daoContract.getStakerRewardPercentageInPrecision(poolMaster2, 1)
            });
            gasUsed.iadd(new BN(tx.receipt.cumulativeGasUsed));
            logInfo("Claim reward: Average gas used: " + gasUsed.div(new BN(3)).toString(10));

            Helper.assertEqual(expectedMikeBal, await Helper.getBalancePromise(mike), "reward claimed is not correct");
            Helper.assertEqual(expectedPM1Bal, await Helper.getBalancePromise(poolMaster), "reward claimed is not correct");
            Helper.assertEqual(expectedPM2Bal, await Helper.getBalancePromise(poolMaster2), "reward claimed is not correct");

            await feeHandler.withdrawAllETH({from: accounts[0]});
        });

        it("Test claim reward some epochs reward and balance changes as epected", async function() {
            await deployContracts(20, currentBlock + 15, 10);
            await setupSimpleStakingData();

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock);

            let mikeCurStake = new BN(0).add(initMikeStake);
            let victorCurStake = new BN(0).add(initVictorStake);
            let loiCurStake = new BN(0).add(initLoiStake);

            let campCount = 0;
            for(let id = 1; id < 5; id++) {
                currentBlock = await Helper.getCurrentBlock();
                await daoContract.submitNewCampaign(
                    0, currentBlock + 2, currentBlock + 2 + minCampPeriod,
                    0, 0, 0, [25, 50], '0x', {from: campCreator}
                );
                await daoContract.submitNewCampaign(
                    0, currentBlock + 3, currentBlock + 3 + minCampPeriod,
                    0, 0, 0, [25, 50], '0x', {from: campCreator}
                );
                campCount += 2;

                let totalEpochPoints = new BN(0);
                let mikePoints = new BN(0);
                let victorPoints = new BN(0);
                let loiPoints = new BN(0);

                await daoContract.vote(campCount - 1, 1, {from: mike});
                totalEpochPoints.iadd(mikeCurStake);
                mikePoints.iadd(mikeCurStake);
                await daoContract.vote(campCount, 2, {from: mike});
                totalEpochPoints.iadd(mikeCurStake);
                mikePoints.iadd(mikeCurStake);
                await daoContract.vote(campCount, 1, {from: victor});
                await daoContract.vote(campCount, 1, {from: victor});
                totalEpochPoints.iadd(victorCurStake);
                victorPoints.iadd(victorCurStake);
                await daoContract.vote(campCount - 1, 2, {from: loi});
                totalEpochPoints.iadd(loiCurStake);
                loiPoints.iadd(loiCurStake);
                await daoContract.vote(campCount - 1, 1, {from: loi});

                let epochTotalReward = mulPrecision(1).div(new BN(id));
                await feeHandler.setEpochReward(id, {from: accounts[0], value: epochTotalReward});

                await stakingContract.deposit(mulPrecision(10), {from: loi});
                loiCurStake.iadd(mulPrecision(10));

                currentBlock = await Helper.getCurrentBlock();
                await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], id * epochPeriod + startBlock - currentBlock);

                let mikePer = mikePoints.mul(precisionUnits).div(totalEpochPoints);
                let victorPer = victorPoints.mul(precisionUnits).div(totalEpochPoints);
                let loiPer = loiPoints.mul(precisionUnits).div(totalEpochPoints);

                Helper.assertEqual(mikePer, await daoContract.getStakerRewardPercentageInPrecision(mike, id), "reward per is incorrect");
                Helper.assertEqual(victorPer, await daoContract.getStakerRewardPercentageInPrecision(victor, id), "reward per is incorrect");
                Helper.assertEqual(loiPer, await daoContract.getStakerRewardPercentageInPrecision(loi, id), "reward per is incorrect");

                let expectedMikeBal = await Helper.getBalancePromise(mike);
                expectedMikeBal.iadd(mikePer.mul(epochTotalReward).div(precisionUnits));
                let expectedVictorBal = await Helper.getBalancePromise(victor);
                expectedVictorBal.iadd(victorPer.mul(epochTotalReward).div(precisionUnits));
                let expectedLoiBal = await Helper.getBalancePromise(loi);
                expectedLoiBal.iadd(loiPer.mul(epochTotalReward).div(precisionUnits));

                Helper.assertEqual(false, await daoContract.hasClaimedReward(mike, id), "should have claimed reward");
                Helper.assertEqual(false, await daoContract.hasClaimedReward(victor, id), "should have claimed reward");
                Helper.assertEqual(false, await daoContract.hasClaimedReward(loi, id), "should have claimed reward");

                await daoContract.claimReward(mike, id);
                await daoContract.claimReward(victor, id);
                await daoContract.claimReward(loi, id);

                Helper.assertEqual(expectedMikeBal, await Helper.getBalancePromise(mike), "reward claimed is not correct");
                Helper.assertEqual(expectedVictorBal, await Helper.getBalancePromise(victor), "reward claimed is not correct");
                Helper.assertEqual(expectedLoiBal, await Helper.getBalancePromise(loi), "reward claimed is not correct");

                Helper.assertEqual(true, await daoContract.hasClaimedReward(mike, id), "should have claimed reward");
                Helper.assertEqual(true, await daoContract.hasClaimedReward(victor, id), "should have claimed reward");
                Helper.assertEqual(true, await daoContract.hasClaimedReward(loi, id), "should have claimed reward");

                await stakingContract.withdraw(mulPrecision(10), {from: mike});
                mikeCurStake.isub(mulPrecision(10));
                await stakingContract.withdraw(mulPrecision(10), {from: victor});
                victorCurStake.isub(mulPrecision(10));
            }
            await feeHandler.withdrawAllETH({from: accounts[0]});
        });

        it("Test claim reward after few epochs", async function() {
            await deployContracts(10, currentBlock + 15, 5);
            await setupSimpleStakingData();
            await stakingContract.delegate(poolMaster, {from: loi});
            await stakingContract.delegate(poolMaster2, {from: victor});

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock);

            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                0, currentBlock + 2, currentBlock + 2 + minCampPeriod,
                0, 0, 0, [25, 50], '0x', {from: campCreator}
            );

            let totalEpochPoints = new BN(0);
            let mikePoints = new BN(0);
            let poolMasterPoints = new BN(0);
            let poolMaster2Points = new BN(0);

            await daoContract.vote(1, 1, {from: mike});
            totalEpochPoints.iadd(initMikeStake);
            mikePoints.iadd(initMikeStake);
            await daoContract.vote(1, 2, {from: poolMaster});
            totalEpochPoints.iadd(initLoiStake);
            poolMasterPoints.iadd(initLoiStake);
            await daoContract.vote(1, 1, {from: poolMaster2});
            totalEpochPoints.iadd(initVictorStake).iadd(initPoolMaster2Stake);
            poolMaster2Points.iadd(initVictorStake).iadd(initPoolMaster2Stake);

            await daoContract.vote(1, 1, {from: victor});
            await daoContract.vote(1, 2, {from: loi});

            let epochTotalReward = precisionUnits.div(new BN(10));
            await feeHandler.setEpochReward(1, {from: accounts[0], value: epochTotalReward});

            // delay few epochs not doing anything
            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 4 * epochPeriod + startBlock - currentBlock);

            let mikePer = mikePoints.mul(precisionUnits).div(totalEpochPoints);
            let poolMasterPer = poolMasterPoints.mul(precisionUnits).div(totalEpochPoints);
            let poolMaster2Per = poolMaster2Points.mul(precisionUnits).div(totalEpochPoints);

            Helper.assertEqual(mikePer, await daoContract.getStakerRewardPercentageInPrecision(mike, 1), "reward per is incorrect");
            Helper.assertEqual(poolMasterPer, await daoContract.getStakerRewardPercentageInPrecision(poolMaster, 1), "reward per is incorrect");
            Helper.assertEqual(poolMaster2Per, await daoContract.getStakerRewardPercentageInPrecision(poolMaster2, 1), "reward per is incorrect");
            Helper.assertEqual(0, await daoContract.getStakerRewardPercentageInPrecision(victor, 1), "reward per is incorrect");
            Helper.assertEqual(0, await daoContract.getStakerRewardPercentageInPrecision(loi, 1), "reward per is incorrect");

            let expectedMikeBal = await Helper.getBalancePromise(mike);
            expectedMikeBal.iadd(mikePer.mul(epochTotalReward).div(precisionUnits));
            let expectedPM1Bal = await Helper.getBalancePromise(poolMaster);
            expectedPM1Bal.iadd(poolMasterPer.mul(epochTotalReward).div(precisionUnits));
            let expectedPM2Bal = await Helper.getBalancePromise(poolMaster2);
            expectedPM2Bal.iadd(poolMaster2Per.mul(epochTotalReward).div(precisionUnits));

            await daoContract.claimReward(mike, 1);
            await daoContract.claimReward(poolMaster, 1);
            await daoContract.claimReward(poolMaster2, 1);

            Helper.assertEqual(expectedMikeBal, await Helper.getBalancePromise(mike), "reward claimed is not correct");
            Helper.assertEqual(expectedPM1Bal, await Helper.getBalancePromise(poolMaster), "reward claimed is not correct");
            Helper.assertEqual(expectedPM2Bal, await Helper.getBalancePromise(poolMaster2), "reward claimed is not correct");

            await feeHandler.withdrawAllETH({from: accounts[0]});
        });

        it("Test claim reward should revert epoch is not in the past", async function() {
            await deployContracts(15, currentBlock + 15, 5);
            await setupSimpleStakingData();

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock);

            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                0, currentBlock + 2, currentBlock + 2 + minCampPeriod,
                0, 0, 0, [25, 50], '0x', {from: campCreator}
            );

            await daoContract.vote(1, 1, {from: mike});
            await daoContract.vote(1, 2, {from: victor});

            await feeHandler.setEpochReward(1, {from: accounts[0], value: precisionUnits.div(new BN(10))});
            await feeHandler.setEpochReward(2, {from: accounts[0], value: precisionUnits.div(new BN(10))});

            // can not claim for current epoch
            await expectRevert(
                daoContract.claimReward(mike, 1),
                "claimReward: only for past epochs"
            )
            // can not claim for next epoch
            await expectRevert(
                daoContract.claimReward(mike, 2),
                "claimReward: only for past epochs"
            )
            // can not claim for far future epoch
            await expectRevert(
                daoContract.claimReward(mike, 100),
                "claimReward: only for past epochs"
            )

            // delay to epoch 2
            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], epochPeriod + startBlock - currentBlock);

            // now mike can claim reward for epoch 1
            await daoContract.claimReward(mike, 1);

            await feeHandler.withdrawAllETH({from: accounts[0]});
        });

        it("Test claim reward should revert already claimed", async function() {
            await deployContracts(15, currentBlock + 15, 5);
            await setupSimpleStakingData();

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock);

            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                0, currentBlock + 2, currentBlock + 2 + minCampPeriod,
                0, 0, 0, [25, 50], '0x', {from: campCreator}
            );

            await daoContract.vote(1, 1, {from: mike});

            await feeHandler.setEpochReward(1, {from: accounts[0], value: precisionUnits.div(new BN(10))});

            // delay to epoch 2
            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], epochPeriod + startBlock - currentBlock);

            await daoContract.claimReward(mike, 1);

            // can not claim again
            await expectRevert(
                daoContract.claimReward(mike, 1),
                "claimReward: alr claimed"
            )

            await feeHandler.withdrawAllETH({from: accounts[0]});
        });

        it("Test claim reward should revert no camp", async function() {
            await deployContracts(15, currentBlock + 15, 5);
            await setupSimpleStakingData();

            await feeHandler.setEpochReward(1, {from: accounts[0], value: precisionUnits.div(new BN(10))});

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], epochPeriod + startBlock - currentBlock);

            await expectRevert(
                daoContract.claimReward(mike, 1),
                "claimReward: No reward"
            )

            await feeHandler.withdrawAllETH({from: accounts[0]});
        })

        it("Test claim reward should revert staker has no stake", async function() {
            await deployContracts(15, currentBlock + 15, 5);
            await setupSimpleStakingData();
            await stakingContract.withdraw(initMikeStake, {from: mike});
            await stakingContract.delegate(mike, {from: victor});

            // delay to epoch 1
            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock);

            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                0, currentBlock + 2, currentBlock + 2 + minCampPeriod,
                0, 0, 0, [25, 50], '0x', {from: campCreator}
            );

            await daoContract.vote(1, 1, {from: poolMaster});
            await daoContract.vote(1, 2, {from: mike});
            await daoContract.vote(1, 1, {from: loi});
            await daoContract.vote(1, 2, {from: victor});

            await feeHandler.setEpochReward(1, {from: accounts[0], value: precisionUnits.div(new BN(10))});

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], epochPeriod + startBlock - currentBlock);

            // no stake
            await expectRevert(
                daoContract.claimReward(poolMaster, 1),
                "claimReward: No reward"
            )
            // already delegated
            await expectRevert(
                daoContract.claimReward(victor, 1),
                "claimReward: No reward"
            )

            // mike has no stake, but has delegated stake
            await daoContract.claimReward(mike, 1);
            await daoContract.claimReward(loi, 1);

            await feeHandler.withdrawAllETH({from: accounts[0]});
        })

        it("Test claim reward should revert staker didn't vote", async function() {
            await deployContracts(15, currentBlock + 15, 5);
            await setupSimpleStakingData();

            // delay to epoch 1
            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock);

            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                0, currentBlock + 2, currentBlock + 2 + minCampPeriod,
                0, 0, 0, [25, 50], '0x', {from: campCreator}
            );

            await daoContract.vote(1, 1, {from: mike});

            await feeHandler.setEpochReward(1, {from: accounts[0], value: precisionUnits.div(new BN(10))});

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], epochPeriod + startBlock - currentBlock);

            // victor didn't vote
            await expectRevert(
                daoContract.claimReward(victor, 1),
                "claimReward: No reward"
            )

            await daoContract.claimReward(mike, 1);

            await feeHandler.withdrawAllETH({from: accounts[0]});
        });

        it("Test claim reward should revert fee handler return false for claimReward", async function() {
            feeHandler = await MockFeeHandlerClaimRewardFailed.new();
            await deployContracts(15, currentBlock + 15, 5);
            await setupSimpleStakingData();

            // delay to epoch 1
            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock);

            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                0, currentBlock + 2, currentBlock + 2 + minCampPeriod,
                0, 0, 0, [25, 50], '0x', {from: campCreator}
            );

            await daoContract.vote(1, 1, {from: mike});

            await feeHandler.setEpochReward(1, {from: accounts[0], value: precisionUnits.div(new BN(10))});

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], epochPeriod + startBlock - currentBlock);

            await expectRevert(
                daoContract.claimReward(mike, 1),
                "claimReward: feeHandle failed to claim"
            )

            await feeHandler.withdrawAllETH({from: accounts[0]});
            feeHandler = await MockFeeHandler.new();
        });

        it("Test claim reward should revert when claim for epoch in the past that didn't do anything", async function() {
            await deployContracts(15, currentBlock + 15, 5);
            await setupSimpleStakingData();

            // delay to epoch 1
            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock);

            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                0, currentBlock + 2, currentBlock + 2 + minCampPeriod,
                0, 0, 0, [25, 50], '0x', {from: campCreator}
            );

            await daoContract.vote(1, 1, {from: mike});

            await feeHandler.setEpochReward(1, {from: accounts[0], value: precisionUnits.div(new BN(10))});

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 5 * epochPeriod + startBlock - currentBlock);

            await expectRevert(
                daoContract.claimReward(mike, 4),
                "claimReward: No reward"
            )

            await daoContract.claimReward(mike, 1);

            await feeHandler.withdrawAllETH({from: accounts[0]});
        });

        it("Test get reward percentage after new deposit", async function() {
            await deployContracts(10, currentBlock + 15, 5);
            await setupSimpleStakingData();
            await stakingContract.delegate(poolMaster, {from: loi});
            await stakingContract.delegate(poolMaster2, {from: victor});

            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                0, currentBlock + 2, currentBlock + 2 + minCampPeriod,
                0, 0, 0, [25, 50], '0x', {from: campCreator}
            );

            let totalEpochPoints = new BN(0);
            let mikePoints = new BN(0);
            let poolMasterPoints = new BN(0);
            let poolMaster2Points = new BN(0);

            await daoContract.vote(1, 1, {from: mike});
            totalEpochPoints.iadd(initMikeStake);
            mikePoints.iadd(initMikeStake);
            await daoContract.vote(1, 2, {from: poolMaster});
            totalEpochPoints.iadd(initLoiStake);
            poolMasterPoints.iadd(initLoiStake);
            await daoContract.vote(1, 1, {from: poolMaster2});
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
            Helper.assertEqual(mikePer, await daoContract.getStakerRewardPercentageInPrecision(mike, 1), "reward per is incorrect");
            Helper.assertEqual(poolMasterPer, await daoContract.getStakerRewardPercentageInPrecision(poolMaster, 1), "reward per is incorrect");
            Helper.assertEqual(poolMaster2Per, await daoContract.getStakerRewardPercentageInPrecision(poolMaster2, 1), "reward per is incorrect");
            Helper.assertEqual(0, await daoContract.getStakerRewardPercentageInPrecision(victor, 1), "reward per is incorrect");
            Helper.assertEqual(0, await daoContract.getStakerRewardPercentageInPrecision(loi, 1), "reward per is incorrect");
        });

        it("Test get reward percentage after new delegation", async function() {
            await deployContracts(10, currentBlock + 15, 5);
            await setupSimpleStakingData();
            await stakingContract.delegate(poolMaster, {from: loi});
            await stakingContract.delegate(poolMaster2, {from: victor});

            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                0, currentBlock + 2, currentBlock + 2 + minCampPeriod,
                0, 0, 0, [25, 50], '0x', {from: campCreator}
            );

            let totalEpochPoints = new BN(0);
            let mikePoints = new BN(0);
            let poolMasterPoints = new BN(0);
            let poolMaster2Points = new BN(0);

            await daoContract.vote(1, 1, {from: mike});
            totalEpochPoints.iadd(initMikeStake);
            mikePoints.iadd(initMikeStake);
            await daoContract.vote(1, 2, {from: poolMaster});
            totalEpochPoints.iadd(initLoiStake);
            poolMasterPoints.iadd(initLoiStake);
            await daoContract.vote(1, 1, {from: poolMaster2});
            totalEpochPoints.iadd(initVictorStake).iadd(initPoolMaster2Stake);
            poolMaster2Points.iadd(initVictorStake).iadd(initPoolMaster2Stake);

            await stakingContract.delegate(mike, {from: victor});
            await stakingContract.delegate(victor, {from: loi});
            await stakingContract.delegate(poolMaster, {from: poolMaster2});

            let mikePer = mikePoints.mul(precisionUnits).div(totalEpochPoints);
            let poolMasterPer = poolMasterPoints.mul(precisionUnits).div(totalEpochPoints);
            let poolMaster2Per = poolMaster2Points.mul(precisionUnits).div(totalEpochPoints);

            // percentage no change after new deposit
            Helper.assertEqual(mikePer, await daoContract.getStakerRewardPercentageInPrecision(mike, 1), "reward per is incorrect");
            Helper.assertEqual(poolMasterPer, await daoContract.getStakerRewardPercentageInPrecision(poolMaster, 1), "reward per is incorrect");
            Helper.assertEqual(poolMaster2Per, await daoContract.getStakerRewardPercentageInPrecision(poolMaster2, 1), "reward per is incorrect");
            Helper.assertEqual(0, await daoContract.getStakerRewardPercentageInPrecision(victor, 1), "reward per is incorrect");
            Helper.assertEqual(0, await daoContract.getStakerRewardPercentageInPrecision(loi, 1), "reward per is incorrect");
        });

        it("Test get reward percentage after revote", async function() {
            await deployContracts(10, currentBlock + 15, 5);
            await setupSimpleStakingData();
            await stakingContract.delegate(poolMaster, {from: loi});
            await stakingContract.delegate(poolMaster2, {from: victor});

            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                0, currentBlock + 2, currentBlock + 2 + minCampPeriod,
                0, 0, 0, [25, 50], '0x', {from: campCreator}
            );

            let totalEpochPoints = new BN(0);
            let mikePoints = new BN(0);
            let poolMasterPoints = new BN(0);
            let poolMaster2Points = new BN(0);

            await daoContract.vote(1, 1, {from: mike});
            totalEpochPoints.iadd(initMikeStake);
            mikePoints.iadd(initMikeStake);
            await daoContract.vote(1, 2, {from: poolMaster});
            totalEpochPoints.iadd(initLoiStake);
            poolMasterPoints.iadd(initLoiStake);
            await daoContract.vote(1, 1, {from: poolMaster2});
            totalEpochPoints.iadd(initVictorStake).iadd(initPoolMaster2Stake);
            poolMaster2Points.iadd(initVictorStake).iadd(initPoolMaster2Stake);

            let mikePer = mikePoints.mul(precisionUnits).div(totalEpochPoints);
            let poolMasterPer = poolMasterPoints.mul(precisionUnits).div(totalEpochPoints);
            let poolMaster2Per = poolMaster2Points.mul(precisionUnits).div(totalEpochPoints);

            // percentage no change after new deposit
            Helper.assertEqual(mikePer, await daoContract.getStakerRewardPercentageInPrecision(mike, 1), "reward per is incorrect");
            Helper.assertEqual(poolMasterPer, await daoContract.getStakerRewardPercentageInPrecision(poolMaster, 1), "reward per is incorrect");
            Helper.assertEqual(poolMaster2Per, await daoContract.getStakerRewardPercentageInPrecision(poolMaster2, 1), "reward per is incorrect");
            Helper.assertEqual(0, await daoContract.getStakerRewardPercentageInPrecision(victor, 1), "reward per is incorrect");
            Helper.assertEqual(0, await daoContract.getStakerRewardPercentageInPrecision(loi, 1), "reward per is incorrect");

            // revote different option
            await daoContract.vote(1, 2, {from: mike});
            // revote same option
            await daoContract.vote(1, 2, {from: poolMaster});

            // percentage no change after revoted
            Helper.assertEqual(mikePer, await daoContract.getStakerRewardPercentageInPrecision(mike, 1), "reward per is incorrect");
            Helper.assertEqual(poolMasterPer, await daoContract.getStakerRewardPercentageInPrecision(poolMaster, 1), "reward per is incorrect");
            Helper.assertEqual(poolMaster2Per, await daoContract.getStakerRewardPercentageInPrecision(poolMaster2, 1), "reward per is incorrect");
            Helper.assertEqual(0, await daoContract.getStakerRewardPercentageInPrecision(victor, 1), "reward per is incorrect");
            Helper.assertEqual(0, await daoContract.getStakerRewardPercentageInPrecision(loi, 1), "reward per is incorrect");
        });

        it("Test get reward percentage after new withdraw", async function() {
            await deployContracts(10, currentBlock + 15, 5);
            await setupSimpleStakingData();
            await stakingContract.delegate(poolMaster, {from: loi});
            await stakingContract.delegate(poolMaster2, {from: victor});

            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                0, currentBlock + 2, currentBlock + 2 + minCampPeriod,
                0, 0, 0, [25, 50], '0x', {from: campCreator}
            );

            let totalEpochPoints = new BN(0);
            let mikePoints = new BN(0);
            let poolMasterPoints = new BN(0);
            let poolMaster2Points = new BN(0);

            await daoContract.vote(1, 1, {from: mike});
            totalEpochPoints.iadd(initMikeStake);
            mikePoints.iadd(initMikeStake);
            await daoContract.vote(1, 2, {from: poolMaster});
            totalEpochPoints.iadd(initLoiStake);
            poolMasterPoints.iadd(initLoiStake);
            await daoContract.vote(1, 1, {from: poolMaster2});
            totalEpochPoints.iadd(initVictorStake).iadd(initPoolMaster2Stake);
            poolMaster2Points.iadd(initVictorStake).iadd(initPoolMaster2Stake);

            let mikePer = mikePoints.mul(precisionUnits).div(totalEpochPoints);
            let poolMasterPer = poolMasterPoints.mul(precisionUnits).div(totalEpochPoints);
            let poolMaster2Per = poolMaster2Points.mul(precisionUnits).div(totalEpochPoints);

            // percentage no change after new deposit
            Helper.assertEqual(mikePer, await daoContract.getStakerRewardPercentageInPrecision(mike, 1), "reward per is incorrect");
            Helper.assertEqual(poolMasterPer, await daoContract.getStakerRewardPercentageInPrecision(poolMaster, 1), "reward per is incorrect");
            Helper.assertEqual(poolMaster2Per, await daoContract.getStakerRewardPercentageInPrecision(poolMaster2, 1), "reward per is incorrect");
            Helper.assertEqual(0, await daoContract.getStakerRewardPercentageInPrecision(victor, 1), "reward per is incorrect");
            Helper.assertEqual(0, await daoContract.getStakerRewardPercentageInPrecision(loi, 1), "reward per is incorrect");

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

            Helper.assertEqual(mikePer, await daoContract.getStakerRewardPercentageInPrecision(mike, 1), "reward per is incorrect");
            Helper.assertEqual(poolMasterPer, await daoContract.getStakerRewardPercentageInPrecision(poolMaster, 1), "reward per is incorrect");
            Helper.assertEqual(poolMaster2Per, await daoContract.getStakerRewardPercentageInPrecision(poolMaster2, 1), "reward per is incorrect");
            Helper.assertEqual(0, await daoContract.getStakerRewardPercentageInPrecision(victor, 1), "reward per is incorrect");
            Helper.assertEqual(0, await daoContract.getStakerRewardPercentageInPrecision(loi, 1), "reward per is incorrect");
        });

        it("Test get reward percentage after deposit and withdraw", async function() {
            await deployContracts(10, currentBlock + 15, 5);
            await setupSimpleStakingData();
            await stakingContract.delegate(poolMaster, {from: loi});
            await stakingContract.delegate(poolMaster2, {from: victor});

            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                0, currentBlock + 2, currentBlock + 2 + minCampPeriod,
                0, 0, 0, [25, 50], '0x', {from: campCreator}
            );

            let totalEpochPoints = new BN(0);
            let mikePoints = new BN(0);
            let poolMasterPoints = new BN(0);
            let poolMaster2Points = new BN(0);

            await daoContract.vote(1, 1, {from: mike});
            totalEpochPoints.iadd(initMikeStake);
            mikePoints.iadd(initMikeStake);
            await daoContract.vote(1, 2, {from: poolMaster});
            totalEpochPoints.iadd(initLoiStake);
            poolMasterPoints.iadd(initLoiStake);
            await daoContract.vote(1, 1, {from: poolMaster2});
            totalEpochPoints.iadd(initVictorStake).iadd(initPoolMaster2Stake);
            poolMaster2Points.iadd(initVictorStake).iadd(initPoolMaster2Stake);

            let mikePer = mikePoints.mul(precisionUnits).div(totalEpochPoints);
            let poolMasterPer = poolMasterPoints.mul(precisionUnits).div(totalEpochPoints);
            let poolMaster2Per = poolMaster2Points.mul(precisionUnits).div(totalEpochPoints);

            Helper.assertEqual(mikePer, await daoContract.getStakerRewardPercentageInPrecision(mike, 1), "reward per is incorrect");
            Helper.assertEqual(poolMasterPer, await daoContract.getStakerRewardPercentageInPrecision(poolMaster, 1), "reward per is incorrect");
            Helper.assertEqual(poolMaster2Per, await daoContract.getStakerRewardPercentageInPrecision(poolMaster2, 1), "reward per is incorrect");
            Helper.assertEqual(0, await daoContract.getStakerRewardPercentageInPrecision(victor, 1), "reward per is incorrect");
            Helper.assertEqual(0, await daoContract.getStakerRewardPercentageInPrecision(loi, 1), "reward per is incorrect");

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

            Helper.assertEqual(mikePer, await daoContract.getStakerRewardPercentageInPrecision(mike, 1), "reward per is incorrect");
            Helper.assertEqual(poolMasterPer, await daoContract.getStakerRewardPercentageInPrecision(poolMaster, 1), "reward per is incorrect");
            Helper.assertEqual(poolMaster2Per, await daoContract.getStakerRewardPercentageInPrecision(poolMaster2, 1), "reward per is incorrect");
            Helper.assertEqual(0, await daoContract.getStakerRewardPercentageInPrecision(victor, 1), "reward per is incorrect");
            Helper.assertEqual(0, await daoContract.getStakerRewardPercentageInPrecision(loi, 1), "reward per is incorrect");
        });

        it("Test get reward percentage with multiple campaigns", async function() {
            await deployContracts(50, currentBlock + 15, 20);
            await setupSimpleStakingData();
            await stakingContract.delegate(poolMaster, {from: loi});
            await stakingContract.delegate(poolMaster2, {from: victor});

            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                0, currentBlock + 2, currentBlock + 2 + minCampPeriod,
                0, 0, 0, [25, 50], '0x', {from: campCreator}
            );
            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
                0, 0, 0, [25, 50], '0x', {from: campCreator}
            );
            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                2, currentBlock + 2, currentBlock + 2 + minCampPeriod,
                0, 0, 0, [25, 50], '0x', {from: campCreator}
            );

            let totalEpochPoints = new BN(0);
            let mikePoints = new BN(0);
            let poolMasterPoints = new BN(0);
            let poolMaster2Points = new BN(0);

            await daoContract.vote(1, 1, {from: mike});
            totalEpochPoints.iadd(initMikeStake);
            mikePoints.iadd(initMikeStake);
            await daoContract.vote(2, 1, {from: mike});
            totalEpochPoints.iadd(initMikeStake);
            mikePoints.iadd(initMikeStake);
            await daoContract.vote(1, 2, {from: poolMaster});
            totalEpochPoints.iadd(initLoiStake);
            poolMasterPoints.iadd(initLoiStake);
            await daoContract.vote(2, 1, {from: poolMaster});
            totalEpochPoints.iadd(initLoiStake);
            poolMasterPoints.iadd(initLoiStake);
            await daoContract.vote(3, 2, {from: poolMaster});
            totalEpochPoints.iadd(initLoiStake);
            poolMasterPoints.iadd(initLoiStake);
            await daoContract.vote(1, 1, {from: poolMaster2});
            totalEpochPoints.iadd(initVictorStake).iadd(initPoolMaster2Stake);
            poolMaster2Points.iadd(initVictorStake).iadd(initPoolMaster2Stake);

            let mikePer = mikePoints.mul(precisionUnits).div(totalEpochPoints);
            let poolMasterPer = poolMasterPoints.mul(precisionUnits).div(totalEpochPoints);
            let poolMaster2Per = poolMaster2Points.mul(precisionUnits).div(totalEpochPoints);

            Helper.assertEqual(mikePer, await daoContract.getStakerRewardPercentageInPrecision(mike, 1), "reward per is incorrect");
            Helper.assertEqual(poolMasterPer, await daoContract.getStakerRewardPercentageInPrecision(poolMaster, 1), "reward per is incorrect");
            Helper.assertEqual(poolMaster2Per, await daoContract.getStakerRewardPercentageInPrecision(poolMaster2, 1), "reward per is incorrect");
            Helper.assertEqual(0, await daoContract.getStakerRewardPercentageInPrecision(victor, 1), "reward per is incorrect");
            Helper.assertEqual(0, await daoContract.getStakerRewardPercentageInPrecision(loi, 1), "reward per is incorrect");

            // mike voted 2 camps
            await stakingContract.withdraw(mulPrecision(100), {from: mike});
            totalEpochPoints.isub(mulPrecision(100 * 2));
            mikePoints.isub(mulPrecision(100 * 2));

            // loi's delegated address voted 3 camp
            await stakingContract.withdraw(mulPrecision(150), {from: loi});
            totalEpochPoints.isub(mulPrecision(150 * 3));
            poolMasterPoints.isub(mulPrecision(150 * 3));

            // victor's delegated address voted 1 camp
            await stakingContract.withdraw(mulPrecision(100), {from: victor});
            await stakingContract.withdraw(mulPrecision(50), {from: poolMaster2});
            totalEpochPoints.isub(mulPrecision(100 + 50));
            poolMaster2Points.isub(mulPrecision(100 + 50));

            mikePer = mikePoints.mul(precisionUnits).div(totalEpochPoints);
            poolMasterPer = poolMasterPoints.mul(precisionUnits).div(totalEpochPoints);
            poolMaster2Per = poolMaster2Points.mul(precisionUnits).div(totalEpochPoints);

            Helper.assertEqual(mikePer, await daoContract.getStakerRewardPercentageInPrecision(mike, 1), "reward per is incorrect");
            Helper.assertEqual(poolMasterPer, await daoContract.getStakerRewardPercentageInPrecision(poolMaster, 1), "reward per is incorrect");
            Helper.assertEqual(poolMaster2Per, await daoContract.getStakerRewardPercentageInPrecision(poolMaster2, 1), "reward per is incorrect");
            Helper.assertEqual(0, await daoContract.getStakerRewardPercentageInPrecision(victor, 1), "reward per is incorrect");
            Helper.assertEqual(0, await daoContract.getStakerRewardPercentageInPrecision(loi, 1), "reward per is incorrect");
        });

        it("Test get reward percentage after camp has ended", async function() {
            await deployContracts(50, currentBlock + 15, 6);
            await setupSimpleStakingData();
            await stakingContract.delegate(poolMaster, {from: loi});
            await stakingContract.delegate(poolMaster2, {from: victor});

            let totalEpochPoints = new BN(0);
            let mikePoints = new BN(0);
            let poolMasterPoints = new BN(0);
            let poolMaster2Points = new BN(0);

            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                0, currentBlock + 2, currentBlock + 2 + minCampPeriod,
                0, 0, 0, [25, 50], '0x', {from: campCreator}
            );

            await daoContract.vote(1, 1, {from: mike});
            totalEpochPoints.iadd(initMikeStake);
            mikePoints.iadd(initMikeStake);

            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
                0, 0, 0, [25, 50], '0x', {from: campCreator}
            );
            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                2, currentBlock + 2, currentBlock + 2 + minCampPeriod,
                0, 0, 0, [25, 50], '0x', {from: campCreator}
            );

            await daoContract.vote(2, 1, {from: mike});
            totalEpochPoints.iadd(initMikeStake);
            mikePoints.iadd(initMikeStake);
            await daoContract.vote(1, 2, {from: poolMaster});
            totalEpochPoints.iadd(initLoiStake);
            poolMasterPoints.iadd(initLoiStake);
            await daoContract.vote(2, 1, {from: poolMaster});
            totalEpochPoints.iadd(initLoiStake);
            poolMasterPoints.iadd(initLoiStake);
            await daoContract.vote(3, 2, {from: poolMaster});
            totalEpochPoints.iadd(initLoiStake);
            poolMasterPoints.iadd(initLoiStake);
            await daoContract.vote(3, 1, {from: poolMaster2});
            totalEpochPoints.iadd(initVictorStake).iadd(initPoolMaster2Stake);
            poolMaster2Points.iadd(initVictorStake).iadd(initPoolMaster2Stake);

            // delay to make camp ended
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], minCampPeriod);

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

            Helper.assertEqual(mikePer, await daoContract.getStakerRewardPercentageInPrecision(mike, 1), "reward per is incorrect");
            Helper.assertEqual(poolMasterPer, await daoContract.getStakerRewardPercentageInPrecision(poolMaster, 1), "reward per is incorrect");
            Helper.assertEqual(poolMaster2Per, await daoContract.getStakerRewardPercentageInPrecision(poolMaster2, 1), "reward per is incorrect");
            Helper.assertEqual(0, await daoContract.getStakerRewardPercentageInPrecision(victor, 1), "reward per is incorrect");
            Helper.assertEqual(0, await daoContract.getStakerRewardPercentageInPrecision(loi, 1), "reward per is incorrect");
        });

        it("Test get reward percentage epoch 0", async function() {
            await deployContracts(10, currentBlock + 40, 10);
            await setupSimpleStakingData();
            await stakingContract.delegate(poolMaster, {from: victor});
            await stakingContract.delegate(poolMaster2, {from: loi});

            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
                0, 0, 0, [25, 50, 100], '0x', {from: campCreator}
            );

            await daoContract.vote(1, 1, {from: mike});
            await daoContract.vote(1, 2, {from: victor});
            await daoContract.vote(1, 3, {from: loi});
            await daoContract.vote(1, 2, {from: poolMaster});
            await daoContract.vote(1, 2, {from: poolMaster2});

            Helper.assertEqual(0, await daoContract.getStakerRewardPercentageInPrecision(mike, 0), "reward per is incorrect");
            Helper.assertEqual(0, await daoContract.getStakerRewardPercentageInPrecision(poolMaster, 0), "reward per is incorrect");
            Helper.assertEqual(0, await daoContract.getStakerRewardPercentageInPrecision(poolMaster2, 0), "reward per is incorrect");
            Helper.assertEqual(0, await daoContract.getStakerRewardPercentageInPrecision(victor, 0), "reward per is incorrect");
            Helper.assertEqual(0, await daoContract.getStakerRewardPercentageInPrecision(loi, 0), "reward per is incorrect");
        });

        it("Test get reward percentage and full withdrawals", async function() {
            await deployContracts(20, currentBlock + 15, 10);
            await setupSimpleStakingData();
            await stakingContract.delegate(poolMaster, {from: victor});
            await stakingContract.delegate(poolMaster, {from: loi});

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock);

            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                1, currentBlock + 3, currentBlock + 3 + minCampPeriod,
                0, 0, 0, [25, 50, 100], '0x', {from: campCreator}
            );
            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                2, currentBlock + 3, currentBlock + 3 + minCampPeriod,
                0, 0, 0, [25, 50, 100], '0x', {from: campCreator}
            );

            await stakingContract.withdraw(mulPrecision(100), {from: mike});

            let totalEpochPoints = new BN(0);
            let mikePoints = new BN(0);
            let poolMasterPoints = new BN(0);

            // partial withdraw
            await daoContract.vote(1, 1, {from: mike});
            totalEpochPoints.iadd(initMikeStake).isub(mulPrecision(100));
            mikePoints.iadd(initMikeStake).isub(mulPrecision(100));

            await daoContract.vote(2, 3, {from: mike});
            totalEpochPoints.iadd(initMikeStake).isub(mulPrecision(100));
            mikePoints.iadd(initMikeStake).isub(mulPrecision(100));

            await daoContract.vote(1, 2, {from: poolMaster});
            totalEpochPoints.iadd(initVictorStake).iadd(initLoiStake);
            poolMasterPoints.iadd(initVictorStake).iadd(initLoiStake);

            // full withdraw from victor
            await stakingContract.withdraw(initVictorStake, {from: victor});
            totalEpochPoints.isub(initVictorStake);
            poolMasterPoints.isub(initVictorStake);

            let mikePer = mikePoints.mul(precisionUnits).div(totalEpochPoints);
            let poolMasterPer = poolMasterPoints.mul(precisionUnits).div(totalEpochPoints);

            Helper.assertEqual(mikePer, await daoContract.getStakerRewardPercentageInPrecision(mike, 1), "reward per is incorrect");
            Helper.assertEqual(poolMasterPer, await daoContract.getStakerRewardPercentageInPrecision(poolMaster, 1), "reward per is incorrect");
            Helper.assertEqual(0, await daoContract.getStakerRewardPercentageInPrecision(poolMaster2, 1), "reward per is incorrect");
            Helper.assertEqual(0, await daoContract.getStakerRewardPercentageInPrecision(victor, 1), "reward per is incorrect");
            Helper.assertEqual(0, await daoContract.getStakerRewardPercentageInPrecision(loi, 1), "reward per is incorrect");
        });

        it("Test get reward percentage of pool master when he is in another pool", async function() {
            await deployContracts(20, currentBlock + 20, 10);
            await setupSimpleStakingData();
            await stakingContract.delegate(poolMaster2, {from: victor});
            await stakingContract.delegate(poolMaster2, {from: loi});
            await stakingContract.delegate(poolMaster, {from: poolMaster2});

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock);

            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
                0, 0, 0, [25, 50, 100], '0x', {from: campCreator}
            );

            let totalEpochPoints = new BN(0);
            let poolMasterPoints = new BN(0);
            let poolMaster2Points = new BN(0);

            await daoContract.vote(1, 1, {from: poolMaster2});
            totalEpochPoints.iadd(initVictorStake).iadd(initLoiStake);
            poolMaster2Points.iadd(initVictorStake).iadd(initLoiStake);

            await daoContract.vote(1, 3, {from: poolMaster});
            totalEpochPoints.iadd(initPoolMaster2Stake);
            poolMasterPoints.iadd(initPoolMaster2Stake);

            let poolMaster2Per = poolMaster2Points.mul(precisionUnits).div(totalEpochPoints);
            let poolMasterPer = poolMasterPoints.mul(precisionUnits).div(totalEpochPoints);

            Helper.assertEqual(0, await daoContract.getStakerRewardPercentageInPrecision(mike, 1), "reward per is incorrect");
            Helper.assertEqual(poolMasterPer, await daoContract.getStakerRewardPercentageInPrecision(poolMaster, 1), "reward per is incorrect");
            Helper.assertEqual(poolMaster2Per, await daoContract.getStakerRewardPercentageInPrecision(poolMaster2, 1), "reward per is incorrect");
            Helper.assertEqual(0, await daoContract.getStakerRewardPercentageInPrecision(victor, 1), "reward per is incorrect");
            Helper.assertEqual(0, await daoContract.getStakerRewardPercentageInPrecision(loi, 1), "reward per is incorrect");
        });

        it("Test get reward percentage of pool master when he is also in the pool", async function() {
            await deployContracts(20, currentBlock + 15, 10);
            await setupSimpleStakingData();
            await stakingContract.delegate(poolMaster2, {from: victor});
            await stakingContract.delegate(poolMaster2, {from: loi});

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock);

            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
                0, 0, 0, [25, 50, 100], '0x', {from: campCreator}
            );

            let totalEpochPoints = new BN(0);
            let mikePoints = new BN(0);
            let poolMaster2Points = new BN(0);

            await daoContract.vote(1, 1, {from: poolMaster2});
            totalEpochPoints.iadd(initPoolMaster2Stake).iadd(initVictorStake).iadd(initLoiStake);
            poolMaster2Points.iadd(initPoolMaster2Stake).iadd(initVictorStake).iadd(initLoiStake);

            await daoContract.vote(1, 3, {from: mike});
            totalEpochPoints.iadd(initMikeStake);
            mikePoints.iadd(initMikeStake);

            let poolMaster2Per = poolMaster2Points.mul(precisionUnits).div(totalEpochPoints);
            let mikePer = mikePoints.mul(precisionUnits).div(totalEpochPoints);

            Helper.assertEqual(mikePer, await daoContract.getStakerRewardPercentageInPrecision(mike, 1), "reward per is incorrect");
            Helper.assertEqual(0, await daoContract.getStakerRewardPercentageInPrecision(poolMaster, 1), "reward per is incorrect");
            Helper.assertEqual(poolMaster2Per, await daoContract.getStakerRewardPercentageInPrecision(poolMaster2, 1), "reward per is incorrect");
            Helper.assertEqual(0, await daoContract.getStakerRewardPercentageInPrecision(victor, 1), "reward per is incorrect");
            Helper.assertEqual(0, await daoContract.getStakerRewardPercentageInPrecision(loi, 1), "reward per is incorrect");
        });

        it("Test get reward percentage with vote before delegation takes effect", async function() {
            await deployContracts(20, currentBlock + 15, 10);
            await setupSimpleStakingData();
            await stakingContract.delegate(poolMaster2, {from: victor});

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock);

            await stakingContract.delegate(poolMaster2, {from: loi});

            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
                0, 0, 0, [25, 50, 100], '0x', {from: campCreator}
            );

            let totalEpochPoints = new BN(0);
            let mikePoints = new BN(0);
            let poolMaster2Points = new BN(0);
            let loiPoints = new BN(0);

            await daoContract.vote(1, 1, {from: poolMaster2});
            totalEpochPoints.iadd(initPoolMaster2Stake).iadd(initVictorStake);
            poolMaster2Points.iadd(initPoolMaster2Stake).iadd(initVictorStake);

            await daoContract.vote(1, 3, {from: mike});
            totalEpochPoints.iadd(initMikeStake);
            mikePoints.iadd(initMikeStake);

            await daoContract.vote(1, 3, {from: loi});
            totalEpochPoints.iadd(initLoiStake);
            loiPoints.iadd(initLoiStake);

            let poolMaster2Per = poolMaster2Points.mul(precisionUnits).div(totalEpochPoints);
            let mikePer = mikePoints.mul(precisionUnits).div(totalEpochPoints);
            let loiPer = loiPoints.mul(precisionUnits).div(totalEpochPoints);

            Helper.assertEqual(mikePer, await daoContract.getStakerRewardPercentageInPrecision(mike, 1), "reward per is incorrect");
            Helper.assertEqual(0, await daoContract.getStakerRewardPercentageInPrecision(poolMaster, 1), "reward per is incorrect");
            Helper.assertEqual(poolMaster2Per, await daoContract.getStakerRewardPercentageInPrecision(poolMaster2, 1), "reward per is incorrect");
            Helper.assertEqual(0, await daoContract.getStakerRewardPercentageInPrecision(victor, 1), "reward per is incorrect");
            Helper.assertEqual(loiPer, await daoContract.getStakerRewardPercentageInPrecision(loi, 1), "reward per is incorrect");
        });

        it("Test get reward percentage after many epochs", async function() {
            await deployContracts(20, currentBlock + 15, 10);
            await setupSimpleStakingData();
            await stakingContract.delegate(poolMaster2, {from: victor});

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock);

            await stakingContract.delegate(poolMaster2, {from: loi});

            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
                0, 0, 0, [25, 50, 100], '0x', {from: campCreator}
            );

            let totalEpochPoints = new BN(0);
            let mikePoints = new BN(0);
            let poolMaster2Points = new BN(0);
            let loiPoints = new BN(0);

            await daoContract.vote(1, 1, {from: poolMaster2});
            totalEpochPoints.iadd(initPoolMaster2Stake).iadd(initVictorStake);
            poolMaster2Points.iadd(initPoolMaster2Stake).iadd(initVictorStake);

            await daoContract.vote(1, 3, {from: mike});
            totalEpochPoints.iadd(initMikeStake);
            mikePoints.iadd(initMikeStake);

            await daoContract.vote(1, 3, {from: loi});
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

            currentBlock = await Helper.getCurrentBlock();
            // delay to epoch 5
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 4 * epochPeriod + startBlock - currentBlock);

            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
                0, 0, 0, [25, 50, 100], '0x', {from: campCreator}
            );

            await daoContract.vote(2, 1, {from: poolMaster2});
            await daoContract.vote(2, 3, {from: mike});
            await daoContract.vote(2, 3, {from: loi});

            Helper.assertEqual(mikePer, await daoContract.getStakerRewardPercentageInPrecision(mike, 1), "reward per is incorrect");
            Helper.assertEqual(0, await daoContract.getStakerRewardPercentageInPrecision(poolMaster, 1), "reward per is incorrect");
            Helper.assertEqual(poolMaster2Per, await daoContract.getStakerRewardPercentageInPrecision(poolMaster2, 1), "reward per is incorrect");
            Helper.assertEqual(0, await daoContract.getStakerRewardPercentageInPrecision(victor, 1), "reward per is incorrect");
            Helper.assertEqual(loiPer, await daoContract.getStakerRewardPercentageInPrecision(loi, 1), "reward per is incorrect");

            // get reward percentage for epoch that stakers did nothing, data is not inited in Staking
            Helper.assertEqual(0, await daoContract.getStakerRewardPercentageInPrecision(mike, 3), "reward per is incorrect");
            Helper.assertEqual(0, await daoContract.getStakerRewardPercentageInPrecision(poolMaster, 3), "reward per is incorrect");
            Helper.assertEqual(0, await daoContract.getStakerRewardPercentageInPrecision(poolMaster2, 3), "reward per is incorrect");
            Helper.assertEqual(0, await daoContract.getStakerRewardPercentageInPrecision(victor, 3), "reward per is incorrect");
            Helper.assertEqual(0, await daoContract.getStakerRewardPercentageInPrecision(loi, 3), "reward per is incorrect");
        });

        it("Test get staker reward percentage for future epoch", async function() {
            await deployContracts(20, currentBlock + 15, 10);
            await setupSimpleStakingData();
            await stakingContract.delegate(poolMaster2, {from: victor});

            Helper.assertEqual(0, await daoContract.getStakerRewardPercentageInPrecision(mike, 3), "reward percentage is wrong");
            Helper.assertEqual(0, await daoContract.getStakerRewardPercentageInPrecision(mike, 20), "reward percentage is wrong");
            Helper.assertEqual(0, await daoContract.getStakerRewardPercentageInPrecision(mike, 300), "reward percentage is wrong");
        });

        it("Test get staker reward percentage when no votes", async function() {
            await deployContracts(20, currentBlock + 15, 10);
            await setupSimpleStakingData();
            await stakingContract.deposit(mulPrecision(100), {from: mike});

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock);

            // has stake, but no vote yet
            Helper.assertEqual(0, await daoContract.getStakerRewardPercentageInPrecision(mike, 0), "reward percentage is wrong");
        });

        // test coverage for total epoch points = 0 or less than staker's point
        it("Test get reward percenage returns 0 with invalid total epoch points", async function() {
            epochPeriod = 20;
            startBlock = currentBlock + 30;
            stakingContract = await StakingContract.new(kncToken.address, epochPeriod, startBlock, campCreator);

            minCampPeriod = 10;
            daoContract = await MockMaliciousDAO.new(
                epochPeriod, startBlock,
                stakingContract.address,  feeHandler.address, kncToken.address,
                maxCampOptions, minCampPeriod,
                defaultNetworkFee, defaultRewardBps, defaultRebateBps,
                campCreator
            )
            await stakingContract.updateDAOAddressAndRemoveSetter(daoContract.address, {from: campCreator});

            await setupSimpleStakingData();

            await stakingContract.deposit(mulPrecision(100), {from: mike});

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock);

            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
                0, 0, 0, [25, 50, 100], '0x', {from: campCreator}
            );
            await daoContract.vote(1, 2, {from: mike});

            // set total epoch points is 0
            await daoContract.setTotalEpochPoints(1, 0);

            Helper.assertEqual(0, await daoContract.getStakerRewardPercentageInPrecision(mike, 1), "reward should be 0");

            // set total epoch points less than point of mike
            await daoContract.setTotalEpochPoints(1, mulPrecision(90));

            Helper.assertEqual(0, await daoContract.getStakerRewardPercentageInPrecision(mike, 1), "reward should be 0");
        });
    });

    describe("#Conclude Campaign tests", () => {

        it("Test get winning option for non-existed campaign", async function() {
            await deployContracts(10, currentBlock + 10, 5);

            let data = await daoContract.getCampaignWinningOptionAndValue(1);
            Helper.assertEqual(0, data[0], "option id should be 0");
            Helper.assertEqual(0, data[1], "option value should be 0");
        });

        it("Test get winning option for camp that hasn't ended", async function() {
            await deployContracts(10, currentBlock + 20, 5);
            await setupSimpleStakingData();

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock);

            currentBlock = await Helper.getCurrentBlock();
            // min percentage: 0%, c = 0, t = 0
            await daoContract.submitNewCampaign(
                1, currentBlock + 4, currentBlock + 4 + minCampPeriod,
                0, 0, 0, [25, 50, 100], '0x', {from: campCreator}
            );

            // not started yet
            let data = await daoContract.getCampaignWinningOptionAndValue(1);
            Helper.assertEqual(0, data[0], "option id should be 0");
            Helper.assertEqual(0, data[1], "option value should be 0");

            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 3);

            await daoContract.vote(1, 1, {from: mike});

            // currently running
            data = await daoContract.getCampaignWinningOptionAndValue(1);
            Helper.assertEqual(0, data[0], "option id should be 0");
            Helper.assertEqual(0, data[1], "option value should be 0");

            // delay until end of first camp
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 10);

            data = await daoContract.getCampaignWinningOptionAndValue(1);
            Helper.assertEqual(1, data[0], "winning option id is invalid");
            Helper.assertEqual(25, data[1], "winning option value is invalid");
        });

        it("Test get winning option total supply is 0", async function() {
            kncToken = await TestToken.new("test token", 'tst', 18, {from: accounts[0]});

            let totalSupply = await kncToken.totalSupply();

            await kncToken.burn(totalSupply, {from: accounts[0]});

            await deployContracts(10, currentBlock + 20, 5);

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock);

            currentBlock = await Helper.getCurrentBlock();
            // min percentage: 0%, c = 0, t = 0
            await daoContract.submitNewCampaign(
                1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
                0, 0, 0, [25, 50, 100], '0x', {from: campCreator}
            );

            // delay to end of this epocch
            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], epochPeriod + startBlock - currentBlock);

            let data = await daoContract.getCampaignWinningOptionAndValue(1);
            Helper.assertEqual(0, data[0], "winning option id is invalid");
            Helper.assertEqual(0, data[1], "winning option value is invalid");

            // conclude result, it is network fee so just call get network fee with cache
            await daoContract.getLatestNetworkFeeDataWithCache();
        });

        it("Test get winning option with no vote", async function() {
            kncToken = await TestToken.new("test token", 'tst', 18, {from: accounts[0]});

            let totalSupply = await kncToken.totalSupply();
            let burnAmount = totalSupply.sub(new BN(totalSupply));

            await kncToken.burn(burnAmount, {from: accounts[0]});

            await deployContracts(10, currentBlock + 20, 5);

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock);

            currentBlock = await Helper.getCurrentBlock();
            // min percentage: 0%, c = 0, t = 0
            await daoContract.submitNewCampaign(
                1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
                0, 0, 0, [25, 50, 100], '0x', {from: campCreator}
            );

            // delay to end of this epocch
            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], epochPeriod + startBlock - currentBlock);

            let data = await daoContract.getCampaignWinningOptionAndValue(1);
            Helper.assertEqual(0, data[0], "winning option id is invalid");
            Helper.assertEqual(0, data[1], "winning option value is invalid");

            // conclude result, it is network fee so just call get network fee with cache
            await daoContract.getLatestNetworkFeeDataWithCache();

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

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock);

            currentBlock = await Helper.getCurrentBlock();
            // min percentage: 0%, c = 0, t = 0
            await daoContract.submitNewCampaign(
                1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
                0, 0, 0, [25, 50, 100], '0x', {from: campCreator}
            );

            await daoContract.vote(1, 1, {from: mike});
            await daoContract.vote(1, 2, {from: victor});

            // delay to end of this epocch
            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], epochPeriod + startBlock - currentBlock);

            let data = await daoContract.getCampaignWinningOptionAndValue(1);
            Helper.assertEqual(0, data[0], "winning option id is invalid");
            Helper.assertEqual(0, data[1], "winning option value is invalid");

            // conclude result, it is network fee so just call get network fee with cache
            await daoContract.getLatestNetworkFeeDataWithCache();
        });

        it("Test get winning option return 0 vote count less than min percentage (20%)", async function() {
            await deployContracts(10, currentBlock + 20, 5);
            await setupSimpleStakingData();

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock);

            // 20% of total supply
            currentBlock = await Helper.getCurrentBlock();
            // min percentage: 0%, c = 0, t = 0
            await daoContract.submitNewCampaign(
                1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
                precisionUnits.div(new BN(5)), 0, 0, [25, 50, 100], '0x', {from: campCreator}
            );

            await daoContract.vote(1, 1, {from: mike});
            await daoContract.vote(1, 1, {from: victor});
            await daoContract.vote(1, 1, {from: loi});

            let totalSupply = await kncToken.totalSupply();

            Helper.assertLesser(
                initMikeStake.add(initLoiStake).add(initVictorStake),
                totalSupply.div(new BN(5)),
                "total voted stake should be less than 20%"
            );

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], epochPeriod + startBlock - currentBlock);

            let data = await daoContract.getCampaignWinningOptionAndValue(1);
            Helper.assertEqual(0, data[0], "winning option id is invalid");
            Helper.assertEqual(0, data[1], "winning option value is invalid")
        });

        it("Test get winning option return most voted option with all formula params are 0", async function() {
            await deployContracts(10, currentBlock + 20, 5);
            await setupSimpleStakingData();
            // make sure mike has more stake than both victor and loi
            await stakingContract.deposit(initVictorStake.add(initLoiStake), {from: mike});

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock);

            currentBlock = await Helper.getCurrentBlock();
            // min percentage: 0%, c = 0, t = 0
            await daoContract.submitNewCampaign(
                1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
                0, 0, 0, [25, 50, 100], '0x', {from: campCreator}
            );

            await daoContract.vote(1, 2, {from: mike});
            await daoContract.vote(1, 1, {from: victor});
            await daoContract.vote(1, 3, {from: loi});

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], epochPeriod + startBlock - currentBlock);

            let data = await daoContract.getCampaignWinningOptionAndValue(1);
            Helper.assertEqual(2, data[0], "winning option id is invalid");
            Helper.assertEqual(50, data[1], "winning option value is invalid")
        });

        it("Test get winning option total votes exact min percentage of total supply (20%)", async function() {
            let totalSupply = (new BN(0)).add(initMikeStake).add(initVictorStake).add(initLoiStake);
            totalSupply.imul(new BN(5));

            await setupTokenWithSupply(totalSupply);
            currentBlock = await Helper.getCurrentBlock();
            await deployContracts(20, currentBlock + 20, 5);
            await setupSimpleStakingData();

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock);

            currentBlock = await Helper.getCurrentBlock();
            // min percentage: 20%, c = 0, t = 0
            await daoContract.submitNewCampaign(
                1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
                precisionUnits.div(new BN(5)), 0, 0, [25, 50, 100], '0x', {from: campCreator}
            );

            await daoContract.vote(1, 3, {from: mike});
            await daoContract.vote(1, 2, {from: victor});
            await daoContract.vote(1, 3, {from: loi});

            // delay to end of this epocch
            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], epochPeriod + startBlock - currentBlock);

            let data = await daoContract.getCampaignWinningOptionAndValue(1);
            Helper.assertEqual(3, data[0], "winning option id is invalid");
            Helper.assertEqual(100, data[1], "winning option value is invalid");

            // conclude result, it is network fee so just call get network fee with cache
            await daoContract.getLatestNetworkFeeDataWithCache();

            // resetup data, increase total supply so total votes less than 20%
            totalSupply.iadd(new BN(1));

            await setupTokenWithSupply(totalSupply);
            currentBlock = await Helper.getCurrentBlock();
            await deployContracts(20, currentBlock + 20, 5);
            await setupSimpleStakingData();

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock);

            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
                precisionUnits.div(new BN(5)), 0, 0, [25, 50, 100], '0x', {from: campCreator}
            );

            await daoContract.vote(1, 3, {from: mike});
            await daoContract.vote(1, 2, {from: victor});
            await daoContract.vote(1, 3, {from: loi});

            // delay to end of this epocch
            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], epochPeriod + startBlock - currentBlock);

            data = await daoContract.getCampaignWinningOptionAndValue(1);
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

            currentBlock = await Helper.getCurrentBlock();
            // min percentage: 20%, c = 100%, t = 1
            minPercentageInPrecision = mulPrecision(20).div(new BN(100));
            cInPrecision = precisionUnits; // 100%
            tInPrecision = precisionUnits; // 1
            await daoContract.submitNewCampaign(
                1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
                minPercentageInPrecision, cInPrecision, tInPrecision, [32, 26, 44], '0x', {from: campCreator}
            );

            await daoContract.vote(1, 2, {from: mike});
            await daoContract.vote(1, 3, {from: victor});
            await daoContract.vote(1, 1, {from: loi});
            await daoContract.vote(1, 1, {from: mike});
            await daoContract.vote(1, 2, {from: loi});

            // delay to end of this epocch
            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], epochPeriod + startBlock - currentBlock);

            // no winning option
            let data = await daoContract.getCampaignWinningOptionAndValue(1);
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

            currentBlock = await Helper.getCurrentBlock();
            // min percentage: 20%, c = 100%, t = 1
            minPercentageInPrecision = mulPrecision(20).div(new BN(100));
            cInPrecision = precisionUnits; // 100%
            tInPrecision = precisionUnits; // 1
            await daoContract.submitNewCampaign(
                1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
                minPercentageInPrecision, cInPrecision, tInPrecision, [32, 26, 44], '0x', {from: campCreator}
            );

            await daoContract.vote(1, 2, {from: mike});
            await daoContract.vote(1, 3, {from: victor});
            await daoContract.vote(1, 1, {from: loi});

            // delay to end of this epocch
            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], epochPeriod + startBlock - currentBlock);

            // option 2 should win as it equals the threshold
            let data = await daoContract.getCampaignWinningOptionAndValue(1);
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

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock);

            currentBlock = await Helper.getCurrentBlock();
            // min percentage: 20%, c = 100%, t = 1
            minPercentageInPrecision = mulPrecision(40).div(new BN(100));
            cInPrecision = precisionUnits; // 100%
            tInPrecision = precisionUnits; // 1
            await daoContract.submitNewCampaign(
                1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
                minPercentageInPrecision, cInPrecision, tInPrecision, [32, 26, 44], '0x', {from: campCreator}
            );

            await daoContract.vote(1, 1, {from: mike});
            await daoContract.vote(1, 3, {from: victor});
            await daoContract.vote(1, 1, {from: loi});

            // delay to end of this epocch
            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], epochPeriod + startBlock - currentBlock);

            // option 1 should win as it equals the threshold
            let data = await daoContract.getCampaignWinningOptionAndValue(1);
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

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock);

            currentBlock = await Helper.getCurrentBlock();
            // min percentage: 20%, c = 10%, t = 1
            minPercentageInPrecision = mulPrecision(40).div(new BN(100));
            cInPrecision = precisionUnits.div(new BN(10)); // 10%
            tInPrecision = precisionUnits; // 1
            await daoContract.submitNewCampaign(
                1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
                minPercentageInPrecision, cInPrecision, tInPrecision, [32, 26, 44], '0x', {from: campCreator}
            );

            await daoContract.vote(1, 3, {from: mike});
            await daoContract.vote(1, 1, {from: victor});
            await daoContract.vote(1, 2, {from: loi});

            // delay to end of this epocch
            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], epochPeriod + startBlock - currentBlock);

            let data = await daoContract.getCampaignWinningOptionAndValue(1);
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

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock);

            currentBlock = await Helper.getCurrentBlock();
            // min percentage: 20%, c = 200%, t = 1
            minPercentageInPrecision = mulPrecision(40).div(new BN(100));
            cInPrecision = mulPrecision(2); // 10%
            tInPrecision = precisionUnits; // 1
            await daoContract.submitNewCampaign(
                1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
                minPercentageInPrecision, cInPrecision, tInPrecision, [32, 26, 44], '0x', {from: campCreator}
            );

            await daoContract.vote(1, 1, {from: mike});
            await daoContract.vote(1, 1, {from: victor});
            await daoContract.vote(1, 1, {from: loi});

            // delay to end of this epocch
            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], epochPeriod + startBlock - currentBlock);

            let data = await daoContract.getCampaignWinningOptionAndValue(1);
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

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock);

            currentBlock = await Helper.getCurrentBlock();
            // min percentage: 20%, c = 100%, t = 0
            minPercentageInPrecision = mulPrecision(40).div(new BN(100));
            cInPrecision = precisionUnits; // 100%
            tInPrecision = 0; // 1
            await daoContract.submitNewCampaign(
                1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
                minPercentageInPrecision, cInPrecision, tInPrecision, [32, 26, 44], '0x', {from: campCreator}
            );

            await daoContract.vote(1, 2, {from: mike});
            await daoContract.vote(1, 2, {from: victor});
            await daoContract.vote(1, 2, {from: loi});

            // delay to end of this epocch
            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], epochPeriod + startBlock - currentBlock);

            // all voted for option 1, however threshold is greater than 100%
            let data = await daoContract.getCampaignWinningOptionAndValue(1);
            Helper.assertEqual(2, data[0], "winning option id is invalid");
            Helper.assertEqual(26, data[1], "winning option value is invalid");

            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
                minPercentageInPrecision, cInPrecision, tInPrecision, [32, 26, 44], '0x', {from: campCreator}
            );

            // one person voted differently
            await daoContract.vote(2, 2, {from: mike});
            await daoContract.vote(2, 1, {from: victor});
            await daoContract.vote(2, 2, {from: loi});

            // delay to end of this epocch
            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 2 * epochPeriod + startBlock - currentBlock);

            data = await daoContract.getCampaignWinningOptionAndValue(2);
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
            let feeData = await daoContract.getLatestNetworkFeeData();
            Helper.assertEqual(defaultNetworkFee, feeData[0], "network fee default is wrong");
            Helper.assertEqual(startBlock - 1, feeData[1], "expiry block number is wrong");

            await daoContract.setLatestNetworkFee(36);
            feeData = await daoContract.getLatestNetworkFeeData();
            Helper.assertEqual(36, feeData[0], "network fee default is wrong");
            Helper.assertEqual(startBlock - 1, feeData[1], "expiry block number is wrong");

            let tx = await daoContract.getLatestNetworkFeeDataWithCache();
            logInfo("Get Network Fee: epoch 0, gas used: " + tx.receipt.cumulativeGasUsed);
        });

        it("Test get network fee returns correct latest data, no campaigns", async function() {
            defaultNetworkFee = 25;
            await deployContracts(10, currentBlock + 10, 5);

            // delay to epoch 1
            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock);
            // get fee data for epoch 1
            feeData = await daoContract.getLatestNetworkFeeData();
            Helper.assertEqual(defaultNetworkFee, feeData[0], "network fee default is wrong");
            Helper.assertEqual(epochPeriod + startBlock - 1, feeData[1], "expiry block number is wrong");

            await daoContract.setLatestNetworkFee(32);
            feeData = await daoContract.getLatestNetworkFeeData();
            Helper.assertEqual(32, feeData[0], "network fee default is wrong");
            Helper.assertEqual(epochPeriod + startBlock - 1, feeData[1], "expiry block number is wrong");

            // delay to epoch 4
            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 3 * epochPeriod + startBlock - currentBlock);
            // get fee data for epoch 4
            feeData = await daoContract.getLatestNetworkFeeData();
            Helper.assertEqual(32, feeData[0], "network fee default is wrong");
            Helper.assertEqual(4 * epochPeriod + startBlock - 1, feeData[1], "expiry block number is wrong");

            let tx = await daoContract.getLatestNetworkFeeDataWithCache();
            logInfo("Get Network Fee: epoch > 0, no fee camp, gas used: " + tx.receipt.cumulativeGasUsed);
        });

        it("Test get network fee returns correct latest data, has camp but no fee campaign", async function() {
            await deployContracts(15, currentBlock + 20, 10);
            await setupSimpleStakingData();

            // delay to epoch 1
            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock);

            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                0, currentBlock + 2, currentBlock + 2 + minCampPeriod,
                0, 0, 0, [32, 26, 44], '0x', {from: campCreator}
            );
            await daoContract.vote(1, 2, {from: mike});

            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                2, currentBlock + 2, currentBlock + 2 + minCampPeriod,
                0, 0, 0, [22, 23, 24], '0x', {from: campCreator}
            );
            await daoContract.vote(2, 3, {from: mike});

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], epochPeriod + startBlock - currentBlock);

            let data = await daoContract.getCampaignWinningOptionAndValue(1);

            Helper.assertEqual(2, data[0], "winning option is wrong");
            Helper.assertEqual(26, data[1], "winning option value is wrong");

            Helper.assertEqual(0, await daoContract.networkFeeCamp(1), "shouldn't have network fee camp for epoch 1");

            data = await daoContract.getLatestNetworkFeeData();

            Helper.assertEqual(defaultNetworkFee, data[0], "should fallback to default network fee value");
            // expiry block should be end of epoch 2
            Helper.assertEqual(2 * epochPeriod + startBlock - 1, data[1], "expiry block number is wrong for epoch 1");
        });

        it("Test get network fee returns correct latest data on-going network fee has a winning option", async function() {
            await simpleSetupToTestThreshold(410, 410, 180, 40);
            currentBlock = await Helper.getCurrentBlock();
            // min per: 40%, C = 100%, t = 1
            minPercentageInPrecision = precisionUnits.mul(new BN(40)).div(new BN(100));
            cInPrecision = precisionUnits;
            tInPrecision = precisionUnits;
            await daoContract.submitNewCampaign(
                1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
                minPercentageInPrecision, cInPrecision, tInPrecision, [32, 50, 44], '0x', {from: campCreator}
            );

            // option 2 should win
            await daoContract.vote(1, 2, {from: mike});
            await daoContract.vote(1, 2, {from: loi});
            await daoContract.vote(1, 2, {from: victor});

            // camp is not ended yet, so data shouldn't change
            let data = await daoContract.getLatestNetworkFeeData();
            Helper.assertEqual(defaultNetworkFee, data[0], "should fallback to default network fee value");
            Helper.assertEqual(epochPeriod + startBlock - 1, data[1], "expiry block number is wrong");

            // delay to epoch 2
            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], epochPeriod + startBlock - currentBlock);

            Helper.assertEqual(1, await daoContract.networkFeeCamp(1), "should have network fee camp");

            data = await daoContract.getLatestNetworkFeeData();

            Helper.assertEqual(50, data[0], "should fallback to previous data");
            Helper.assertEqual(2 * epochPeriod + startBlock - 1, data[1], "expiry block number is wrong");

            await resetSetupForKNCToken();
        });

        it("Test get network fee returns correct latest data, has network fee camp but no winning option", async function() {
            // mike: 410, victor: 410, loi: 280, total stakes = 40% * total supply
            await simpleSetupToTestThreshold(410, 410, 180, 40);

            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
                0, 0, 0, [32, 26, 44], '0x', {from: campCreator}
            );

            await daoContract.vote(1, 2, {from: mike});
            await daoContract.vote(1, 1, {from: victor});
            await daoContract.vote(1, 3, {from: loi});

            // delay to epoch 2
            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], epochPeriod + startBlock - currentBlock);

            // no winning as same vote count
            let data = await daoContract.getCampaignWinningOptionAndValue(1);
            Helper.assertEqual(0, data[0], "winning option is wrong");
            Helper.assertEqual(0, data[1], "winning option value is wrong");

            Helper.assertEqual(1, await daoContract.networkFeeCamp(1), "should have network fee camp for epoch 1");

            data = await daoContract.getLatestNetworkFeeData();

            Helper.assertEqual(defaultNetworkFee, data[0], "should fallback to default network fee value");
            Helper.assertEqual(2 * epochPeriod + startBlock - 1, data[1], "expiry block number is wrong for epoch 1");

            let tx = await daoContract.getLatestNetworkFeeDataWithCache();
            logInfo("Get Network Fee: epoch > 0, has fee camp, no win option, gas used: " + tx.receipt.cumulativeGasUsed);
            tx = await daoContract.getLatestNetworkFeeDataWithCache();
            logInfo("Get Network Fee: epoch > 0, has fee camp, alr concluded, gas used: " + tx.receipt.cumulativeGasUsed);

            currentBlock = await Helper.getCurrentBlock();
            // min per: 41%, C = 0, t = 0
            minPercentageInPrecision = precisionUnits.mul(new BN(41)).div(new BN(100));
            await daoContract.submitNewCampaign(
                1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
                minPercentageInPrecision, 0, 0, [32, 26, 44], '0x', {from: campCreator}
            );

            await daoContract.vote(2, 1, {from: mike});
            await daoContract.vote(2, 1, {from: victor});
            await daoContract.vote(2, 1, {from: loi});

            // delay to epoch 3
            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 2 * epochPeriod + startBlock - currentBlock);

            // no winning as min percentage > total votes / total supply
            data = await daoContract.getCampaignWinningOptionAndValue(2);
            Helper.assertEqual(0, data[0], "winning option is wrong");
            Helper.assertEqual(0, data[1], "winning option value is wrong");

            Helper.assertEqual(2, await daoContract.networkFeeCamp(2), "should have network fee camp");

            data = await daoContract.getLatestNetworkFeeData();

            Helper.assertEqual(defaultNetworkFee, data[0], "should fallback to default network fee value");
            Helper.assertEqual(3 * epochPeriod + startBlock - 1, data[1], "expiry block number is wrong");

            currentBlock = await Helper.getCurrentBlock();
            // min per: 40%, C = 100%, t = 1
            minPercentageInPrecision = precisionUnits.mul(new BN(40)).div(new BN(100));
            cInPrecision = precisionUnits;
            tInPrecision = precisionUnits;
            await daoContract.submitNewCampaign(
                1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
                minPercentageInPrecision, cInPrecision, tInPrecision, [32, 26, 44], '0x', {from: campCreator}
            );

            await daoContract.vote(3, 1, {from: mike});
            await daoContract.vote(3, 1, {from: loi});
            await daoContract.vote(3, 2, {from: victor});

            // delay to epoch 4
            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 3 * epochPeriod + startBlock - currentBlock);

            // no winning as most option voted percentage (59%) < threshold (60%)
            data = await daoContract.getCampaignWinningOptionAndValue(3);
            Helper.assertEqual(0, data[0], "winning option is wrong");
            Helper.assertEqual(0, data[1], "winning option value is wrong");

            Helper.assertEqual(3, await daoContract.networkFeeCamp(3), "should have network fee camp");

            data = await daoContract.getLatestNetworkFeeData();

            Helper.assertEqual(defaultNetworkFee, data[0], "should fallback to default network fee value");
            Helper.assertEqual(4 * epochPeriod + startBlock - 1, data[1], "expiry block number is wrong");

            currentBlock = await Helper.getCurrentBlock();
            // min per: 40%, C = 100%, t = 1
            minPercentageInPrecision = precisionUnits.mul(new BN(40)).div(new BN(100));
            cInPrecision = precisionUnits;
            tInPrecision = precisionUnits;
            await daoContract.submitNewCampaign(
                1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
                minPercentageInPrecision, cInPrecision, tInPrecision, [32, 26, 44], '0x', {from: campCreator}
            );

            await daoContract.vote(4, 1, {from: mike});
            await daoContract.vote(4, 1, {from: loi});
            await daoContract.vote(4, 1, {from: victor});

            // delay to epoch 5
            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 4 * epochPeriod + startBlock - currentBlock);

            data = await daoContract.getCampaignWinningOptionAndValue(4);
            Helper.assertEqual(1, data[0], "winning option is wrong");
            Helper.assertEqual(32, data[1], "winning option value is wrong");

            Helper.assertEqual(4, await daoContract.networkFeeCamp(4), "should have network fee camp");

            data = await daoContract.getLatestNetworkFeeData();

            Helper.assertEqual(32, data[0], "should get correct winning value as new network fee");
            Helper.assertEqual(5 * epochPeriod + startBlock - 1, data[1], "expiry block number is wrong");

            // conclude and save data
            Helper.assertEqual(defaultNetworkFee, await daoContract.latestNetworkFeeResult(), "latest network fee is wrong");
            await daoContract.getLatestNetworkFeeDataWithCache();
            Helper.assertEqual(32, await daoContract.latestNetworkFeeResult(), "latest network fee is wrong");

            currentBlock = await Helper.getCurrentBlock();
            // min per: 40%, C = 100%, t = 1
            minPercentageInPrecision = precisionUnits.mul(new BN(40)).div(new BN(100));
            cInPrecision = precisionUnits;
            tInPrecision = precisionUnits;
            await daoContract.submitNewCampaign(
                1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
                minPercentageInPrecision, cInPrecision, tInPrecision, [32, 26, 44], '0x', {from: campCreator}
            );

            await daoContract.vote(5, 1, {from: mike});
            await daoContract.vote(5, 2, {from: loi});
            await daoContract.vote(5, 2, {from: victor});

            // delay to epoch 6
            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 5 * epochPeriod + startBlock - currentBlock);

            // no winning as most option voted percentage (59%) < threshold (60%)
            data = await daoContract.getCampaignWinningOptionAndValue(5);
            Helper.assertEqual(0, data[0], "winning option is wrong");
            Helper.assertEqual(0, data[1], "winning option value is wrong");

            Helper.assertEqual(5, await daoContract.networkFeeCamp(5), "should have network fee camp");

            data = await daoContract.getLatestNetworkFeeData();

            Helper.assertEqual(32, data[0], "should fallback to previous data");
            Helper.assertEqual(6 * epochPeriod + startBlock - 1, data[1], "expiry block number is wrong");

            tx = await daoContract.getLatestNetworkFeeDataWithCache();
            logInfo("Get Network Fee: epoch > 0, has fee camp + win option, gas used: " + tx.receipt.cumulativeGasUsed);

            await resetSetupForKNCToken();
        });

        it("Test get network fee with cache returns & records correct data", async function() {
            // test get at epoch 0
            await deployContracts(2, currentBlock + 5, 2);
            await daoContract.checkLatestNetworkFeeData(defaultNetworkFee, startBlock - 1);

            // simple setup to create camp with a winning option
            // mike: 410, victor: 410, loi 180, total stakes = 40% total supply
            await simpleSetupToTestThreshold(410, 410, 180, 40);

            // get at epoch 1, no camps
            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock);
            await daoContract.checkLatestNetworkFeeData(defaultNetworkFee, epochPeriod + startBlock - 1);

            // create camp, but not fee camp
            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                0, currentBlock + 2, currentBlock + 2 + minCampPeriod,
                0, 0, 0, [32, 26, 44], '0x', {from: campCreator}
            );
            await daoContract.vote(1, 1, {from: mike});
            await daoContract.vote(1, 1, {from: loi});
            await daoContract.vote(1, 1, {from: victor});

            // delay to epoch 2
            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], epochPeriod + startBlock - currentBlock);
            // check data
            await daoContract.checkLatestNetworkFeeData(defaultNetworkFee, 2 * epochPeriod + startBlock - 1);

           // create fee camp, but no winning
            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
                0, 0, 0, [32, 26, 44], '0x', {from: campCreator}
            );
            await daoContract.vote(2, 1, {from: mike});
            await daoContract.vote(2, 2, {from: loi});
            await daoContract.vote(2, 3, {from: victor});

            // delay to epoch 3
            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 2 * epochPeriod + startBlock - currentBlock);
            // check data
            await daoContract.checkLatestNetworkFeeData(defaultNetworkFee, 3 * epochPeriod + startBlock - 1);

            // delay few epoch, to epoch 5
            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 4 * epochPeriod + startBlock - currentBlock);

            // create fee camp, has winning
            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
                0, 0, 0, [32, 26, 1], '0x', {from: campCreator}
            );
            await daoContract.vote(3, 3, {from: mike});
            await daoContract.vote(3, 3, {from: loi});
            await daoContract.vote(3, 3, {from: victor});
            // current epoch has network fee camp with a winning option
            // but getting network fee data for this epoch should still return previous epoch result
            await daoContract.checkLatestNetworkFeeData(defaultNetworkFee, 5 * epochPeriod + startBlock - 1);

            // delay to epoch 6
            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 5 * epochPeriod + startBlock - currentBlock);
            // check data
            await daoContract.checkLatestNetworkFeeData(1, 6 * epochPeriod + startBlock - 1);

            // delay to next epoch
            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 6 * epochPeriod + startBlock - currentBlock);
            // check data with no fee camp at previous epoch
            await daoContract.checkLatestNetworkFeeData(1, 7 * epochPeriod + startBlock - 1);

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

            Helper.assertEqual(defaultBrrData, await daoContract.latestBrrResult(), "brr default is wrong");
            let dataDecoded = await daoContract.latestBRRDataDecoded();
            Helper.assertEqual(10000 - rebate - reward, dataDecoded[0], "burn default is wrong");
            Helper.assertEqual(reward, dataDecoded[1], "reward default is wrong");
            Helper.assertEqual(rebate, dataDecoded[2], "rebate default is wrong");
            Helper.assertEqual(0, dataDecoded[3], "epoch is wrong");
            Helper.assertEqual(startBlock - 1, dataDecoded[4], "expiry block is wrong");

            // make sure data is correct
            // reward - rebate - burn - epoch - expiry block
            let tx = await daoContract.getLatestBRRData();
            logInfo("Get Brr: epoch = 0, gas used: " + tx.receipt.cumulativeGasUsed);

            await daoContract.checkLatestBrrData(
                reward, rebate, 10000 - rebate - reward, 0, startBlock - 1
            );

            rebate = 46;
            reward = 54;
            let newBrrData = getDataFromRebateAndReward(rebate, reward);
            await daoContract.setLatestBrrData(newBrrData);
            Helper.assertEqual(newBrrData, await daoContract.latestBrrResult(), "brr default is wrong");

            await daoContract.checkLatestBrrData(
                reward, rebate, 10000 - rebate - reward, 0, startBlock - 1
            );
            dataDecoded = await daoContract.latestBRRDataDecoded();
            Helper.assertEqual(10000 - rebate - reward, dataDecoded[0], "burn default is wrong");
            Helper.assertEqual(reward, dataDecoded[1], "reward default is wrong");
            Helper.assertEqual(rebate, dataDecoded[2], "rebate default is wrong");
            Helper.assertEqual(0, dataDecoded[3], "epoch is wrong");
            Helper.assertEqual(startBlock - 1, dataDecoded[4], "expiry block is wrong");
        });

        it("Test get brr data returns correct latest data, no campaigns", async function() {
            let rebate = 24;
            let reward = 26;
            defaultRewardBps = reward;
            defaultRebateBps = rebate;
            defaultBrrData = getDataFromRebateAndReward(rebate, reward);
            await deployContracts(10, currentBlock + 10, 5);

            // delay to epoch 1
            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock);
            await daoContract.checkLatestBrrData(
                reward, rebate, 10000 - rebate - reward, 1, epochPeriod + startBlock - 1
            );
            Helper.assertEqual(defaultBrrData, await daoContract.latestBrrResult(), "brr default is wrong");
            let dataDecoded = await daoContract.latestBRRDataDecoded();
            Helper.assertEqual(10000 - rebate - reward, dataDecoded[0], "burn default is wrong");
            Helper.assertEqual(reward, dataDecoded[1], "reward default is wrong");
            Helper.assertEqual(rebate, dataDecoded[2], "rebate default is wrong");
            Helper.assertEqual(1, dataDecoded[3], "epoch is wrong");
            Helper.assertEqual(epochPeriod + startBlock - 1, dataDecoded[4], "expiry block is wrong");

            rebate = 46;
            reward = 54;
            let newBrrData = getDataFromRebateAndReward(rebate, reward);
            await daoContract.setLatestBrrData(newBrrData);
            await daoContract.checkLatestBrrData(
                reward, rebate, 10000 - rebate - reward, 1, epochPeriod + startBlock - 1
            );
            Helper.assertEqual(newBrrData, await daoContract.latestBrrResult(), "brr default is wrong");

            // delay to epoch 4
            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 3 * epochPeriod + startBlock - currentBlock);
            // get brr data for epoch 4
            await daoContract.checkLatestBrrData(
                reward, rebate, 10000 - rebate - reward, 4, 4 * epochPeriod + startBlock - 1
            );
            Helper.assertEqual(newBrrData, await daoContract.latestBrrResult(), "brr default is wrong");

            dataDecoded = await daoContract.latestBRRDataDecoded();
            Helper.assertEqual(10000 - rebate - reward, dataDecoded[0], "burn is wrong");
            Helper.assertEqual(reward, dataDecoded[1], "reward is wrong");
            Helper.assertEqual(rebate, dataDecoded[2], "rebate is wrong");
            Helper.assertEqual(4, dataDecoded[3], "epoch is wrong");
            Helper.assertEqual(4 * epochPeriod + startBlock - 1, dataDecoded[4], "expiry block is wrong");
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
            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock);

            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                0, currentBlock + 2, currentBlock + 2 + minCampPeriod,
                0, 0, 0, [32, 26, 44], '0x', {from: campCreator}
            );
            await daoContract.vote(1, 2, {from: mike});

            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
                0, 0, 0, [22, 23, 24], '0x', {from: campCreator}
            );
            await daoContract.vote(2, 3, {from: mike});

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], epochPeriod + startBlock - currentBlock);

            let data = await daoContract.getCampaignWinningOptionAndValue(1);

            Helper.assertEqual(2, data[0], "winning option is wrong");
            Helper.assertEqual(26, data[1], "winning option value is wrong");

            Helper.assertEqual(0, await daoContract.brrCampaign(1), "shouldn't have brr camp for epoch 1");

            await daoContract.checkLatestBrrData(
                reward, rebate, 10000 - rebate - reward, 2, 2 * epochPeriod + startBlock - 1
            );
            let tx = await daoContract.getLatestBRRData();
            logInfo("Get Brr: epoch > 0, no brr camp, gas used: " + tx.receipt.cumulativeGasUsed);

            Helper.assertEqual(defaultBrrData, await daoContract.latestBrrResult(), "brr default is wrong");
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

            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                2, currentBlock + 2, currentBlock + 2 + minCampPeriod,
                minPercentageInPrecision, cInPrecision, tInPrecision, [32, brrData, 44], '0x', {from: campCreator}
            );

            // option 2 should win
            await daoContract.vote(1, 2, {from: mike});
            await daoContract.vote(1, 2, {from: loi});
            await daoContract.vote(1, 2, {from: victor});

            // camp is not ended yet, so data shouldn't change
            await daoContract.checkLatestBrrData(
                reward, rebate, 10000 - rebate - reward, 1, epochPeriod + startBlock - 1
            );
            Helper.assertEqual(1, await daoContract.brrCampaign(1), "should have brr camp");
            let dataDecoded = await daoContract.latestBRRDataDecoded();
            Helper.assertEqual(10000 - rebate - reward, dataDecoded[0], "burn is wrong");
            Helper.assertEqual(reward, dataDecoded[1], "reward is wrong");
            Helper.assertEqual(rebate, dataDecoded[2], "rebate is wrong");
            Helper.assertEqual(1, dataDecoded[3], "epoch is wrong");
            Helper.assertEqual(epochPeriod + startBlock - 1, dataDecoded[4], "expiry block is wrong");

            // delay to epoch 2, winning option should take effect
            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], epochPeriod + startBlock - currentBlock);

            dataDecoded = await daoContract.latestBRRDataDecoded();
            Helper.assertEqual(10000 - newRebate - newReward, dataDecoded[0], "burn is wrong");
            Helper.assertEqual(newReward, dataDecoded[1], "reward is wrong");
            Helper.assertEqual(newRebate, dataDecoded[2], "rebate is wrong");
            Helper.assertEqual(2, dataDecoded[3], "epoch is wrong");
            Helper.assertEqual(2 * epochPeriod + startBlock - 1, dataDecoded[4], "expiry block is wrong");

            await daoContract.checkLatestBrrData(
                newReward, newRebate, 10000 - newRebate - newReward, 2, 2 * epochPeriod + startBlock - 1
            );
            Helper.assertEqual(brrData, await daoContract.latestBrrResult(), "latest brr is wrong");

            // test winning option is encoded
            dataDecoded = await daoContract.latestBRRDataDecoded();
            Helper.assertEqual(10000 - newRebate - newReward, dataDecoded[0], "burn is wrong");
            Helper.assertEqual(newReward, dataDecoded[1], "reward is wrong");
            Helper.assertEqual(newRebate, dataDecoded[2], "rebate is wrong");
            Helper.assertEqual(2, dataDecoded[3], "epoch is wrong");
            Helper.assertEqual(2 * epochPeriod + startBlock - 1, dataDecoded[4], "expiry block is wrong");

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

            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                2, currentBlock + 2, currentBlock + 2 + minCampPeriod,
                0, 0, 0, [32, 26, 44], '0x', {from: campCreator}
            );

            await daoContract.vote(1, 2, {from: mike});
            await daoContract.vote(1, 1, {from: victor});
            await daoContract.vote(1, 3, {from: loi});

            // delay to epoch 2
            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], epochPeriod + startBlock - currentBlock);

            // no winning as same vote count
            let data = await daoContract.getCampaignWinningOptionAndValue(1);
            Helper.assertEqual(0, data[0], "winning option is wrong");
            Helper.assertEqual(0, data[1], "winning option value is wrong");

            Helper.assertEqual(1, await daoContract.brrCampaign(1), "should have brr camp for epoch 1");

            await daoContract.checkLatestBrrData(
                reward, rebate, 10000 - rebate - reward, 2, 2 * epochPeriod + startBlock - 1
            );
            let dataDecoded = await daoContract.latestBRRDataDecoded();
            Helper.assertEqual(10000 - rebate - reward, dataDecoded[0], "burn is wrong");
            Helper.assertEqual(reward, dataDecoded[1], "reward is wrong");
            Helper.assertEqual(rebate, dataDecoded[2], "rebate is wrong");
            Helper.assertEqual(2, dataDecoded[3], "epoch is wrong");
            Helper.assertEqual(2 * epochPeriod + startBlock - 1, dataDecoded[4], "expiry block is wrong");

            let tx = await daoContract.getLatestBRRData();
            logInfo("Get Brr: epoch > 0, has brr camp + no win option, gas used: " + tx.receipt.cumulativeGasUsed);
            tx = await daoContract.getLatestBRRData();
            logInfo("Get Brr: epoch > 0, has brr camp, alr concluded, gas used: " + tx.receipt.cumulativeGasUsed);

            Helper.assertEqual(defaultBrrData, await daoContract.latestBrrResult(), "brr default is wrong");

            currentBlock = await Helper.getCurrentBlock();
            // min per: 41%, C = 0, t = 0
            minPercentageInPrecision = precisionUnits.mul(new BN(41)).div(new BN(100));
            cInPrecision = precisionUnits;
            tInPrecision = precisionUnits;
            await daoContract.submitNewCampaign(
                2, currentBlock + 2, currentBlock + 2 + minCampPeriod,
                minPercentageInPrecision, cInPrecision, tInPrecision, [32, 26, 44], '0x', {from: campCreator}
            );

            await daoContract.vote(2, 1, {from: mike});
            await daoContract.vote(2, 1, {from: victor});
            await daoContract.vote(2, 1, {from: loi});

            // delay to epoch 3
            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 2 * epochPeriod + startBlock - currentBlock);

            // no winning as min percentage > total votes / total supply
            data = await daoContract.getCampaignWinningOptionAndValue(2);
            Helper.assertEqual(0, data[0], "winning option is wrong");
            Helper.assertEqual(0, data[1], "winning option value is wrong");

            Helper.assertEqual(2, await daoContract.brrCampaign(2), "should have brr camp");

            await daoContract.checkLatestBrrData(
                reward, rebate, 10000 - rebate - reward, 3, 3 * epochPeriod + startBlock - 1
            );

            Helper.assertEqual(defaultBrrData, await daoContract.latestBrrResult(), "brr default is wrong");

            currentBlock = await Helper.getCurrentBlock();
            // min per: 40%, C = 100%, t = 1
            minPercentageInPrecision = precisionUnits.mul(new BN(40)).div(new BN(100));
            cInPrecision = precisionUnits;
            tInPrecision = precisionUnits;
            await daoContract.submitNewCampaign(
                2, currentBlock + 2, currentBlock + 2 + minCampPeriod,
                minPercentageInPrecision, cInPrecision, tInPrecision , [32, 26, 44], '0x', {from: campCreator}
            );

            await daoContract.vote(3, 1, {from: mike});
            await daoContract.vote(3, 1, {from: loi});
            await daoContract.vote(3, 2, {from: victor});

            // delay to epoch 4
            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 3 * epochPeriod + startBlock - currentBlock);

            // no winning as most option voted percentage (59%) < threshold (60%)
            data = await daoContract.getCampaignWinningOptionAndValue(3);
            Helper.assertEqual(0, data[0], "winning option is wrong");
            Helper.assertEqual(0, data[1], "winning option value is wrong");

            Helper.assertEqual(3, await daoContract.brrCampaign(3), "should have brr camp");

            await daoContract.checkLatestBrrData(
                reward, rebate, 10000 - rebate - reward, 4, 4 * epochPeriod + startBlock - 1
            );

            Helper.assertEqual(defaultBrrData, await daoContract.latestBrrResult(), "brr default is wrong");

            currentBlock = await Helper.getCurrentBlock();
            // min per: 40%, C = 100%, t = 1
            minPercentageInPrecision = precisionUnits.mul(new BN(40)).div(new BN(100));
            cInPrecision = precisionUnits;
            tInPrecision = precisionUnits;
            await daoContract.submitNewCampaign(
                2, currentBlock + 2, currentBlock + 2 + minCampPeriod,
                minPercentageInPrecision, cInPrecision, tInPrecision, [32, 26, 44], '0x', {from: campCreator}
            );

            await daoContract.vote(4, 1, {from: mike});
            await daoContract.vote(4, 1, {from: loi});
            await daoContract.vote(4, 1, {from: victor});

            // delay to epoch 5
            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 4 * epochPeriod + startBlock - currentBlock);

            data = await daoContract.getCampaignWinningOptionAndValue(4);
            Helper.assertEqual(1, data[0], "winning option is wrong");
            Helper.assertEqual(32, data[1], "winning option value is wrong");

            Helper.assertEqual(4, await daoContract.brrCampaign(4), "should have brr camp");

            await daoContract.getLatestBRRData();

            Helper.assertEqual(32, await daoContract.latestBrrResult(), "brr default is wrong");

            currentBlock = await Helper.getCurrentBlock();
            // min per: 40%, C = 100%, t = 1
            minPercentageInPrecision = precisionUnits.mul(new BN(40)).div(new BN(100));
            cInPrecision = precisionUnits;
            tInPrecision = precisionUnits;
            await daoContract.submitNewCampaign(
                2, currentBlock + 2, currentBlock + 2 + minCampPeriod,
                minPercentageInPrecision, cInPrecision, tInPrecision, [32, 26, 44], '0x', {from: campCreator}
            );

            await daoContract.vote(5, 1, {from: mike});
            await daoContract.vote(5, 2, {from: loi});
            await daoContract.vote(5, 2, {from: victor});

            // delay to epoch 6
            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 5 * epochPeriod + startBlock - currentBlock);

            // no winning as most option voted percentage (59%) < threshold (60%)
            data = await daoContract.getCampaignWinningOptionAndValue(5);
            Helper.assertEqual(0, data[0], "winning option is wrong");
            Helper.assertEqual(0, data[1], "winning option value is wrong");

            Helper.assertEqual(5, await daoContract.brrCampaign(5), "should have brr camp");

            tx = await daoContract.getLatestBRRData();
            logInfo("Get Brr: epoch > 0, has brr camp + win option, gas used: " + tx.receipt.cumulativeGasUsed);
            tx = await daoContract.getLatestBRRData();
            logInfo("Get Brr: epoch > 0, has brr camp, alr concluded, gas used: " + tx.receipt.cumulativeGasUsed);

            Helper.assertEqual(32, await daoContract.latestBrrResult(), "brr default is wrong");

            await resetSetupForKNCToken();
        });
    });

    describe("#Should burn all reward", () => {
        it("Test should burn all reward returns false for current + future epoch", async function() {
            await deployContracts(10, currentBlock + 15, 5);
            await setupSimpleStakingData();

            Helper.assertEqual(false, await daoContract.shouldBurnRewardForEpoch(0), "should burn all reward result is wrong");
            Helper.assertEqual(false, await daoContract.shouldBurnRewardForEpoch(1), "should burn all reward result is wrong");
            Helper.assertEqual(false, await daoContract.shouldBurnRewardForEpoch(10), "should burn all reward result is wrong");

            // delay to epoch 2
            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], epochPeriod + startBlock - currentBlock);

            // create camp and vote
            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                2, currentBlock + 2, currentBlock + 2 + minCampPeriod,
                0, 0, 0, [32, 26, 44], '0x', {from: campCreator}
            );

            await daoContract.vote(1, 1, {from: mike});
            await daoContract.vote(1, 2, {from: loi});
            await daoContract.vote(1, 2, {from: victor});

            Helper.assertEqual(true, await daoContract.shouldBurnRewardForEpoch(0), "should burn all reward result is wrong");
            Helper.assertEqual(true, await daoContract.shouldBurnRewardForEpoch(1), "should burn all reward result is wrong");
            Helper.assertEqual(false, await daoContract.shouldBurnRewardForEpoch(2), "should burn all reward result is wrong");

            // delay to epoch 4
            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 3 * epochPeriod + startBlock - currentBlock);

            Helper.assertEqual(true, await daoContract.shouldBurnRewardForEpoch(1), "should burn all reward result is wrong");
            Helper.assertEqual(false, await daoContract.shouldBurnRewardForEpoch(2), "should burn all reward result is wrong");
            Helper.assertEqual(true, await daoContract.shouldBurnRewardForEpoch(3), "should burn all reward result is wrong");
            Helper.assertEqual(false, await daoContract.shouldBurnRewardForEpoch(4), "should burn all reward result is wrong");
        });

        it("Test should burn all reward returns correct data", async function() {
            await deployContracts(10, currentBlock + 15, 5);
            await setupSimpleStakingData();

            // delay to epoch 1
            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock);
            Helper.assertEqual(true, await daoContract.shouldBurnRewardForEpoch(0), "should burn all reward result is wrong");

            // create camp
            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                0, currentBlock + 2, currentBlock + 2 + minCampPeriod,
                0, 0, 0, [32, 26, 44], '0x', {from: campCreator}
            );

            // delay to epoch 2
            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], epochPeriod + startBlock - currentBlock);
            // has camp but no vote
            Helper.assertEqual(true, await daoContract.shouldBurnRewardForEpoch(1), "should burn all reward result is wrong");

            // create camp
            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                0, currentBlock + 2, currentBlock + 2 + minCampPeriod,
                0, 0, 0, [32, 26, 44], '0x', {from: campCreator}
            );
            await daoContract.vote(2, 1, {from: poolMaster});

            // delay to epoch 3
            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 2 * epochPeriod + startBlock - currentBlock);
            // has camp, has vote but staker has 0 stake
            Helper.assertEqual(true, await daoContract.shouldBurnRewardForEpoch(2), "should burn all reward result is wrong");

            // create camp
            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                0, currentBlock + 2, currentBlock + 2 + minCampPeriod,
                0, 0, 0, [32, 26, 44], '0x', {from: campCreator}
            );
            await daoContract.vote(3, 1, {from: mike});
            await stakingContract.withdraw(initMikeStake, {from: mike});

            await stakingContract.delegate(poolMaster, {from: loi});

            // delay to epoch 4
            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 3 * epochPeriod + startBlock - currentBlock);
            // has camp, voted with staker has stakes, but then withdraw all
            Helper.assertEqual(true, await daoContract.shouldBurnRewardForEpoch(3), "should burn all reward result is wrong");

            // create camp
            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                0, currentBlock + 2, currentBlock + 2 + minCampPeriod,
                0, 0, 0, [32, 26, 44], '0x', {from: campCreator}
            );
            await daoContract.vote(4, 1, {from: poolMaster});
            await stakingContract.withdraw(initLoiStake, {from: loi});

            // delay to epoch 5
            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 4 * epochPeriod + startBlock - currentBlock);
            // has camp, voted with staker has delegated stakes, but then withdraw all
            Helper.assertEqual(true, await daoContract.shouldBurnRewardForEpoch(4), "should burn all reward result is wrong");

            // create camp
            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                0, currentBlock + 2, currentBlock + 2 + minCampPeriod,
                0, 0, 0, [32, 26, 44], '0x', {from: campCreator}
            );
            await daoContract.vote(5, 1, {from: victor});

            // delay to epoch 6
            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 5 * epochPeriod + startBlock - currentBlock);
            // has camp, voted with stakes, burn should be false
            Helper.assertEqual(false, await daoContract.shouldBurnRewardForEpoch(5), "should burn all reward result is wrong");

            // delay to epoch 6
            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 6 * epochPeriod + startBlock - currentBlock);
            // no camp, no reward
            Helper.assertEqual(true, await daoContract.shouldBurnRewardForEpoch(6), "should burn all reward result is wrong");
        });
    });

    describe("#Constructor tests", () => {
        it("Test correct data is set after deployment", async function() {
            await deployContracts(10, currentBlock + 10, 10);

            Helper.assertEqual(await daoContract.EPOCH_PERIOD_BLOCKS(), 10, "Epoch period is wrong");
            Helper.assertEqual(await daoContract.FIRST_EPOCH_START_BLOCK(), currentBlock + 10, "Start block is wrong");
            Helper.assertEqual(await daoContract.kncToken(), kncToken.address, "KNC token is wrong");
            Helper.assertEqual(await daoContract.staking(), stakingContract.address, "Staking contract is wrong");
            Helper.assertEqual(await daoContract.feeHandler(), feeHandler.address, "Feehandler contract is wrong");
            Helper.assertEqual(await daoContract.MAX_CAMP_OPTIONS(), maxCampOptions, "max camp option is wrong");
            Helper.assertEqual(await daoContract.MIN_CAMP_DURATION_BLOCKS(), minCampPeriod, "min camp period is wrong");
            Helper.assertEqual(await daoContract.latestNetworkFeeResult(), defaultNetworkFee, "default network fee is wrong");
            Helper.assertEqual(await daoContract.latestBrrResult(), defaultBrrData, "default brr data is wrong");
            Helper.assertEqual(await daoContract.campaignCreator(), campCreator, "campaignCreator is wrong");
            Helper.assertEqual(await daoContract.numberCampaigns(), 0, "number campaign is wrong");
        });

        it("Test constructor should revert staking & dao have different epoch period or start block", async function() {
            // different epoch period
            let stakingContract = await StakingContract.new(kncToken.address, 10, currentBlock + 10, campCreator);
            await expectRevert(
                DAOContract.new(
                    9, currentBlock + 10,
                    stakingContract.address,  feeHandler.address, kncToken.address,
                    maxCampOptions, minCampPeriod, defaultNetworkFee, defaultRewardBps, defaultRebateBps,
                    campCreator
                ),
                "ctor: diff epoch period"
            )
            // different start block
            await expectRevert(
                DAOContract.new(
                    10, currentBlock + 11,
                    stakingContract.address,  feeHandler.address, kncToken.address,
                    maxCampOptions, minCampPeriod, defaultNetworkFee, defaultRewardBps, defaultRebateBps,
                    campCreator
                ),
                "ctor: diff start block"
            )
            await DAOContract.new(
                10, currentBlock + 10,
                stakingContract.address,  feeHandler.address, kncToken.address,
                maxCampOptions, minCampPeriod, defaultNetworkFee, defaultRewardBps, defaultRebateBps,
                campCreator
            )
        });

        it("Test constructor should revert invalid arguments", async function() {
            let stakingContract = await StakingContract.new(kncToken.address, 10, currentBlock + 50, campCreator);

            // epoch period is 0
            await expectRevert(
                DAOContract.new(
                    0, currentBlock + 50,
                    stakingContract.address,  feeHandler.address, kncToken.address,
                    maxCampOptions, minCampPeriod, defaultNetworkFee, defaultRewardBps, defaultRebateBps,
                    campCreator
                ),
                "ctor: epoch period is 0"
            )
            // start in the past
            await expectRevert(
                DAOContract.new(
                    20, currentBlock - 1,
                    stakingContract.address,  feeHandler.address, kncToken.address,
                    maxCampOptions, minCampPeriod, defaultNetworkFee, defaultRewardBps, defaultRebateBps,
                    campCreator
                ),
                "ctor: start in the past"
            )
            // staking missing
            await expectRevert(
                DAOContract.new(
                    10, currentBlock + 50,
                    zeroAddress,  feeHandler.address, kncToken.address,
                    maxCampOptions, minCampPeriod, defaultNetworkFee, defaultRewardBps, defaultRebateBps,
                    campCreator
                ),
                "ctor: staking is missing"
            )
            // feehandler missing
            await expectRevert(
                DAOContract.new(
                    10, currentBlock + 50,
                    stakingContract.address,  zeroAddress, kncToken.address,
                    maxCampOptions, minCampPeriod, defaultNetworkFee, defaultRewardBps, defaultRebateBps,
                    campCreator
                ),
                "ctor: feeHandler is missing"
            )
            // knc missing
            await expectRevert(
                DAOContract.new(
                    10, currentBlock + 50,
                    stakingContract.address,  feeHandler.address, zeroAddress,
                    maxCampOptions, minCampPeriod, defaultNetworkFee, defaultRewardBps, defaultRebateBps,
                    campCreator
                ),
                "ctor: knc token is missing"
            )
            // network fee is high (>= 50%)
            await expectRevert(
                DAOContract.new(
                    10, currentBlock + 50,
                    stakingContract.address,  feeHandler.address, kncToken.address,
                    maxCampOptions, minCampPeriod, 5000, defaultRewardBps, defaultRebateBps,
                    campCreator
                ),
                "ctor: network fee high"
            )
            // brr is high
            await expectRevert(
                DAOContract.new(
                    10, currentBlock + 50,
                    stakingContract.address,  feeHandler.address, kncToken.address,
                    maxCampOptions, minCampPeriod, defaultNetworkFee, defaultRewardBps, 10001 - defaultRewardBps,
                    campCreator
                ),
                "reward plus rebate high"
            )
            // brr is high
            await expectRevert(
                DAOContract.new(
                    10, currentBlock + 50,
                    stakingContract.address,  feeHandler.address, kncToken.address,
                    maxCampOptions, minCampPeriod, defaultNetworkFee, 10001 - defaultRebateBps, defaultRebateBps,
                    campCreator
                ),
                "reward plus rebate high"
            )
            // creator is zero
            await expectRevert(
                DAOContract.new(
                    10, currentBlock + 50,
                    stakingContract.address,  feeHandler.address, kncToken.address,
                    maxCampOptions, minCampPeriod, defaultNetworkFee, defaultRewardBps, defaultRebateBps,
                    zeroAddress
                ),
                "campCreator is 0"
            )
        });
    });

    describe("#Helper Function tests", () => {
        it("Test getRebateAndRewardFromData returns correct data", async function() {
            await deployContracts(10, currentBlock + 10, 10);
            let reward = 0;
            let rebate = 0;

            let data = getDataFromRebateAndReward(rebate, reward);
            let result = await daoContract.getRebateAndRewardFromData(data);

            Helper.assertEqual(rebate, result[0], "rebate data is wrong");
            Helper.assertEqual(reward, result[1], "reward data is wrong");

            reward = 10000;
            rebate = 0;
            data = getDataFromRebateAndReward(rebate, reward);
            result = await daoContract.getRebateAndRewardFromData(data);

            Helper.assertEqual(rebate, result[0], "rebate data is wrong");
            Helper.assertEqual(reward, result[1], "reward data is wrong");

            reward = 0;
            rebate = 10000;
            data = getDataFromRebateAndReward(rebate, reward);
            result = await daoContract.getRebateAndRewardFromData(data);

            Helper.assertEqual(rebate, result[0], "rebate data is wrong");
            Helper.assertEqual(reward, result[1], "reward data is wrong");

            reward = 5000;
            rebate = 5000;
            data = getDataFromRebateAndReward(rebate, reward);
            result = await daoContract.getRebateAndRewardFromData(data);

            Helper.assertEqual(rebate, result[0], "rebate data is wrong");
            Helper.assertEqual(reward, result[1], "reward data is wrong");

            reward = 2424;
            rebate = 3213;
            data = getDataFromRebateAndReward(rebate, reward);
            result = await daoContract.getRebateAndRewardFromData(data);

            Helper.assertEqual(rebate, result[0], "rebate data is wrong");
            Helper.assertEqual(reward, result[1], "reward data is wrong");
        });

        it("Test getDataFromRewardAndRebateWithValidation returns correct data", async function() {
            await deployContracts(10, currentBlock + 10, 10);
            let reward = 0;
            let rebate = 0;

            let data = getDataFromRebateAndReward(rebate, reward);
            let result = await daoContract.getDataFromRewardAndRebateWithValidation(reward, rebate);

            Helper.assertEqual(data, result, "encode function returns different value");

            reward = 10000;
            rebate = 0;
            data = getDataFromRebateAndReward(rebate, reward);
            result = await daoContract.getDataFromRewardAndRebateWithValidation(reward, rebate);

            Helper.assertEqual(data, result, "encode function returns different value");

            reward = 0;
            rebate = 10000;
            data = getDataFromRebateAndReward(rebate, reward);
            result = await daoContract.getDataFromRewardAndRebateWithValidation(reward, rebate);

            Helper.assertEqual(data, result, "encode function returns different value");

            reward = 5000;
            rebate = 5000;
            data = getDataFromRebateAndReward(rebate, reward);
            result = await daoContract.getDataFromRewardAndRebateWithValidation(reward, rebate);

            Helper.assertEqual(data, result, "encode function returns different value");

            reward = 2424;
            rebate = 3213;
            data = getDataFromRebateAndReward(rebate, reward);
            result = await daoContract.getDataFromRewardAndRebateWithValidation(reward, rebate);

            Helper.assertEqual(data, result, "encode function returns different value");
        });

        it("Test getDataFromRewardAndRebateWithValidation should revert total amount > bps (10000)", async function() {
            await deployContracts(10, currentBlock + 10, 10);
            let reward = 10001;
            let rebate = 0;
            try {
                await daoContract.getDataFromRewardAndRebateWithValidation(reward, rebate);
                assert(false, "throw was expected in line above");
            } catch (e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }

            reward = 0;
            rebate = 10001;
            await expectRevert(
                daoContract.getDataFromRewardAndRebateWithValidation(reward, rebate),
                "reward plus rebate high"
            )

            reward = 5001;
            rebate = 5000;
            await expectRevert(
                daoContract.getDataFromRewardAndRebateWithValidation(reward, rebate),
                "reward plus rebate high"
            )

            reward = 2424;
            rebate = 10010 - reward;
            await expectRevert(
                daoContract.getDataFromRewardAndRebateWithValidation(reward, rebate),
                "reward plus rebate high"
            )
        });
    });

    describe("#Change campaign creator", () => {
        it("Test transfer and claim camp creator role", async function() {
            await deployContracts(10, currentBlock + 20, 5);
            let newCampCreator = accounts[9];

            // can not transfer from non camp creator
            await expectRevert(
                daoContract.transferCampaignCreatorQuickly(newCampCreator, {from: mike}),
                "only campaign creator"
            )

            let txResult = await daoContract.transferCampaignCreatorQuickly(newCampCreator, {from: campCreator});
            expectEvent(txResult, 'TransferCampaignCreatorPending', {
                pendingCampCreator: newCampCreator
            });
            expectEvent(txResult, 'CampaignCreatorClaimed', {
                newCampaignCreator: newCampCreator,
                previousCampaignCreator: campCreator
            });

            Helper.assertEqual(newCampCreator, await daoContract.campaignCreator(), "campaign creator address is wrong");

            // can not transfer from non camp creator
            await expectRevert(
                daoContract.transferCampaignCreator(campCreator, {from: campCreator}),
                "only campaign creator"
            )

            txResult = await daoContract.transferCampaignCreator(campCreator, {from: newCampCreator});
            expectEvent(txResult, 'TransferCampaignCreatorPending', {
                pendingCampCreator: campCreator
            });
            Helper.assertEqual(campCreator, await daoContract.pendingCampCreator(), "pending campaign creator address is wrong");
            Helper.assertEqual(newCampCreator, await daoContract.campaignCreator(), "campaign creator address is wrong");

            // can not claim camp creator from non pending camp creator
            await expectRevert(
                daoContract.claimCampaignCreator({from: mike}),
                "only pending campaign creator"
            )
            txResult = await daoContract.claimCampaignCreator({from: campCreator});
            expectEvent(txResult, 'CampaignCreatorClaimed', {
                newCampaignCreator: campCreator,
                previousCampaignCreator: newCampCreator
            });
            Helper.assertEqual(campCreator, await daoContract.campaignCreator(), "campaign creator address is wrong");
            Helper.assertEqual(zeroAddress, await daoContract.pendingCampCreator(), "pending campaign creator address is wrong");

            // can not transfer to address 0
            await expectRevert(
                daoContract.transferCampaignCreator(zeroAddress, {from: campCreator}),
                "newCampCreator is 0"
            )
            // can not transfer quickly to address 0
            await expectRevert(
                daoContract.transferCampaignCreatorQuickly(zeroAddress, {from: campCreator}),
                "newCampCreator is 0"
            )
        });

        it("Test should submit new campaign after transfer admin role", async function() {
            await deployContracts(10, currentBlock + 50, 5);

            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                2, currentBlock + 10, currentBlock + 10 + minCampPeriod,
                0, 0, 0, [32, 26, 44], '0x', {from: campCreator}
            );

            let newCampCreator = accounts[9];

            // should not be able to submit campaign
            await expectRevert(
                daoContract.submitNewCampaign(
                    0, currentBlock + 10, currentBlock + 10 + minCampPeriod,
                    0, 0, 0, [32, 26, 44], '0x', {from: newCampCreator}
                ),
                "only campaign creator"
            )

            await daoContract.transferCampaignCreatorQuickly(newCampCreator, {from: campCreator});

            // should not be able to submit campaign with old camp creator
            await expectRevert(
                daoContract.submitNewCampaign(
                    0, currentBlock + 10, currentBlock + 10 + minCampPeriod,
                    0, 0, 0, [32, 26, 44], '0x', {from: campCreator}
                ),
                "only campaign creator"
            )

            await daoContract.submitNewCampaign(
                0, currentBlock + 10, currentBlock + 10 + minCampPeriod,
                0, 0, 0, [32, 26, 44], '0x', {from: newCampCreator}
            );
        })

        it("Test should cancel campaign after transfer admin role", async function() {
            await deployContracts(10, currentBlock + 50, 5);

            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                2, currentBlock + 10, currentBlock + 10 + minCampPeriod,
                0, 0, 0, [32, 26, 44], '0x', {from: campCreator}
            );

            let newCampCreator = accounts[9];

            // should not be able to cancel campaign
            await expectRevert(
                daoContract.cancelCampaign(1, {from: newCampCreator}),
                "only campaign creator"
            )

            await daoContract.transferCampaignCreatorQuickly(newCampCreator, {from: campCreator});

            // should not be able to cancel campaign with old camp creator
            await expectRevert(
                daoContract.cancelCampaign(1, {from: campCreator}),
                "only campaign creator"
            )

            await daoContract.cancelCampaign(1, {from: newCampCreator});
        })
    });
});

function logInfo(message) {
    console.log("           " + message);
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
