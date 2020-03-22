const TestToken = artifacts.require("Token.sol");
const MockDao = artifacts.require("MockKyberDaoMoreGetters.sol");
const StakingContract = artifacts.require("KyberStaking.sol");
const KyberNetwork = artifacts.require("KyberNetwork.sol");
const KyberNetworkProxy = artifacts.require("KyberNetworkProxy.sol");
const FeeHandler = artifacts.require("KyberFeeHandler.sol");
const MatchingEngine = artifacts.require("KyberMatchingEngine.sol");
const RateHelper = artifacts.require("KyberRateHelper.sol");
const Helper = require("../helper.js");
const nwHelper = require("./networkHelper.js");

const BN = web3.utils.BN;

const { precisionUnits, zeroAddress } = require("../helper.js");

//global variables
//////////////////
const gasPrice = (new BN(10).pow(new BN(9)).mul(new BN(50)));
const negligibleRateDiffBps = new BN(10); //0.01%

let admin;
let networkProxy;
let network;
let feeHandler;
let matchingEngine;
let operator;
let taker;

//DAO related data
let campCreator;
let daoContract;
let victor;
let mike;
let maxCampOptions = 4;
let minCampPeriod = 10; // 10 blocks
let defaultNetworkFee = 25;
let defaultRewardBps = 3000; // 30%
let defaultRebateBps = 2000; // 20%

let initVictorStake = mulPrecision(2000);
let initMikeStake = mulPrecision(2000);

// Staking data
let daoSetter;
let currentBlock;
let epochPeriod = 20;
let startBlock;
let stakingContract;

//fee hanlder related
let KNC;
let burnBlockInterval = new BN(30);

//reserve data
//////////////
let reserveInstances = [];

//tokens data
////////////
let numTokens = 5;
let tokens = [];
let tokenDecimals = [];
let srcToken;
let destToken;
let srcDecimals;
let ethSrcQty;
let srcQty;

contract('Proxy + Network + MatchingEngine + FeeHandler + Staking + DAO integrations', function(accounts) {
    before("one time global init", async() => {
        //init accounts
        operator = accounts[1];
        alerter = accounts[2];
        taker = accounts[3];
        admin = accounts[5]; // we don't want admin as account 0.
        campCreator = accounts[6];
        daoSetter = accounts[7];
        mike = accounts[8];
        victor = accounts[9];

        //init KNC
        KNC = await TestToken.new("kyber network crystal", "KNC", 18);

        //deploy network
        network = await KyberNetwork.new(admin);

        // init proxy
        networkProxy = await KyberNetworkProxy.new(admin);

        // FeeHandler init
        feeHandler = await FeeHandler.new(daoSetter, networkProxy.address, network.address, KNC.address, burnBlockInterval);
        // Staking & DAO init
        currentBlock = await Helper.getCurrentBlock();
        await deployContracts(40, currentBlock + 350, 10);
        await setupSimpleStakingData();

        // set DAO for feeHandler
        await feeHandler.setDaoContract(daoContract.address, {from: daoSetter});

        //init matchingEngine
        matchingEngine = await MatchingEngine.new(admin);
        await matchingEngine.setNetworkContract(network.address, {from: admin});
        await matchingEngine.setFeePayingPerReserveType(true, true, true, false, true, true, {from: admin});

        rateHelper = await RateHelper.new(admin);
        await rateHelper.setContracts(matchingEngine.address, daoContract.address, {from: admin});

        // setup proxy
        await networkProxy.setKyberNetwork(network.address, {from: admin});
        await networkProxy.setHintHandler(matchingEngine.address, {from: admin});

        //init tokens
        for (let i = 0; i < numTokens; i++) {
            tokenDecimals[i] = new BN(15).add(new BN(i));
            token = await TestToken.new("test" + i, "tst" + i, tokenDecimals[i]);
            tokens[i] = token;
        }

        srcToken = tokens[0];
        srcDecimals = tokenDecimals[0];
        srcQty = new BN(10).mul((new BN(10)).pow(new BN(srcDecimals)));
        destToken = tokens[1];
        ethSrcQty = precisionUnits;

        // init and setup reserves
        let result = await nwHelper.setupReserves(network, tokens, 2, 3, 0, 0, accounts, admin, operator);
        reserveInstances = result.reserveInstances;

        //setup network
        ///////////////
        await network.addKyberProxy(networkProxy.address, {from: admin});
        await network.addOperator(operator, {from: admin});
        await network.setContracts(feeHandler.address, matchingEngine.address, zeroAddress, {from: admin});
        await network.setDAOContract(daoContract.address, {from: admin});

        //add and list pair for reserve
        await nwHelper.addReservesToNetwork(network, reserveInstances, tokens, operator);

        //set params, enable network
        await network.setParams(gasPrice, negligibleRateDiffBps, {from: admin});
        await network.setEnable(true, {from: admin});

        currentBlock = await Helper.getCurrentBlock();
    });

    const deployContracts = async(_epochPeriod, _startBlock, _campPeriod) => {
        epochPeriod = _epochPeriod;
        startBlock = _startBlock;
        stakingContract = await StakingContract.new(KNC.address, epochPeriod, startBlock, daoSetter);

        minCampPeriod = _campPeriod;
        daoContract = await MockDao.new(
            epochPeriod, startBlock,
            stakingContract.address,  feeHandler.address, KNC.address,
            maxCampOptions, minCampPeriod,
            defaultNetworkFee, defaultRewardBps, defaultRebateBps,
            campCreator
        )
        await stakingContract.updateDAOAddressAndRemoveSetter(daoContract.address, {from: daoSetter});
    };

    const setupSimpleStakingData = async() => {
        // approve tokens
        await KNC.approve(stakingContract.address, mulPrecision(1000000), {from: victor});
        await KNC.approve(stakingContract.address, mulPrecision(1000000), {from: mike});

        await KNC.transfer(mike, initMikeStake);
        await KNC.transfer(victor, initVictorStake);

        await stakingContract.deposit(initVictorStake, {from: victor});
        await stakingContract.deposit(initMikeStake, {from: mike});
    };

    beforeEach("running before each test", async() => {
        currentBlock = await Helper.getCurrentBlock();
    });

    const tradeAndCheckDataChangesAsExpected = async(epoch, expectedNetworkFee, expectedReward, expectedRebate, logGasMsg) => {
        // make a simple swap, make sure data is updated for epoch 4 with concluding campaign
        let txResult1 = await networkProxy.swapEtherToToken(destToken.address, 1, {from: taker, value: ethSrcQty});
        console.log("eth - token, first trade, gas used: " + txResult1.receipt.gasUsed);

        // ============ check data should be updated from DAO ============
        // check expected network data from network and dao
        networkData = await network.getNetworkData();
        Helper.assertEqual(epoch * epochPeriod + startBlock - 1, networkData.expiryBlock);
        Helper.assertEqual(expectedNetworkFee, networkData.networkFeeBps);
        Helper.assertEqual(expectedNetworkFee, await daoContract.latestNetworkFeeResult());

        // check expected brr data from fee handler
        let brrData = await feeHandler.readBRRData();
        Helper.assertEqual(epoch * epochPeriod + startBlock - 1, brrData.expiryBlock);
        Helper.assertEqual(epoch, brrData.epoch);
        Helper.assertEqual(expectedReward, brrData.rewardBps);
        Helper.assertEqual(expectedRebate, brrData.rebateBps);
        // check expected brr data from dao
        let daoBrrData = await daoContract.latestBRRDataDecoded();
        Helper.assertEqual(brrData.expiryBlock, daoBrrData.expiryBlockNumber);
        Helper.assertEqual(brrData.epoch, daoBrrData.epoch);
        Helper.assertEqual(brrData.rewardBps, daoBrrData.rewardInBps);
        Helper.assertEqual(brrData.rebateBps, daoBrrData.rebateInBps);

        // ========= another swap, data unchanges =========
        let txResult2 = await networkProxy.swapEtherToToken(destToken.address, 1, {from: taker, value: ethSrcQty});
        console.log("eth - token, second trade, gas used: " + txResult2.receipt.gasUsed);
        // different gas cost between second and first trade for each scenario
        console.log("    " + logGasMsg + (txResult1.receipt.gasUsed - txResult2.receipt.gasUsed));

        let curNetworkData = await network.getNetworkData();
        Helper.assertEqual(networkData.expiryBlock, curNetworkData.expiryBlock);
        Helper.assertEqual(networkData.networkFeeBps, curNetworkData.networkFeeBps);

        let curBrrData = await feeHandler.readBRRData();
        Helper.assertEqual(brrData.expiryBlock, curBrrData.expiryBlock);
        Helper.assertEqual(brrData.epoch, curBrrData.epoch);
        Helper.assertEqual(brrData.rewardBps, curBrrData.rewardBps);
        Helper.assertEqual(brrData.rebateBps, curBrrData.rebateBps);

        // ========= another swap, data unchanges =========
        await srcToken.transfer(taker, srcQty);
        await srcToken.approve(networkProxy.address, srcQty, {from: taker});
        txResult = await networkProxy.swapTokenToEther(srcToken.address, srcQty, 1, {from: taker});
        console.log("token - eth, third trade, gas used: " + txResult.receipt.gasUsed);

        curNetworkData = await network.getNetworkData();
        Helper.assertEqual(networkData.expiryBlock, curNetworkData.expiryBlock);
        Helper.assertEqual(networkData.networkFeeBps, curNetworkData.networkFeeBps);

        curBrrData = await feeHandler.readBRRData();
        Helper.assertEqual(brrData.expiryBlock, curBrrData.expiryBlock);
        Helper.assertEqual(brrData.epoch, curBrrData.epoch);
        Helper.assertEqual(brrData.rewardBps, curBrrData.rewardBps);
        Helper.assertEqual(brrData.rebateBps, curBrrData.rebateBps);

        // ========= another swap, data unchanges =========
        await srcToken.transfer(taker, srcQty);
        await srcToken.approve(networkProxy.address, srcQty, {from: taker});
        txResult = await networkProxy.swapTokenToToken(srcToken.address, srcQty, destToken.address, 1, {from: taker});
        console.log("token - token, fourth trade, gas used: " + txResult.receipt.gasUsed);

        curNetworkData = await network.getNetworkData();
        Helper.assertEqual(networkData.expiryBlock, curNetworkData.expiryBlock);
        Helper.assertEqual(networkData.networkFeeBps, curNetworkData.networkFeeBps);

        curBrrData = await feeHandler.readBRRData();
        Helper.assertEqual(brrData.expiryBlock, curBrrData.expiryBlock);
        Helper.assertEqual(brrData.epoch, curBrrData.epoch);
        Helper.assertEqual(brrData.rewardBps, curBrrData.rewardBps);
        Helper.assertEqual(brrData.rebateBps, curBrrData.rebateBps);
    }

    it("test first trade of epoch 0 records correct default network fee and brr data", async() => {
        let networkData = await network.getNetworkData();
        // default network data, expiry block should be block when network is deployed
        Helper.assertLesser(networkData.expiryBlock, startBlock - 1);

        let brrData = await feeHandler.readBRRData();
        // default brr data, expiry block should be block when feeHandler is deployed
        Helper.assertLesser(brrData.expiryBlock, startBlock - 1);
        Helper.assertEqual(brrData.epoch, 0);

        let daoBrrData = await daoContract.latestBRRDataDecoded();
        let daoNetworkFee = await daoContract.latestNetworkFeeResult()

        // make a first trade and check data changes as expected
        await tradeAndCheckDataChangesAsExpected(
            0, // epoch
            daoNetworkFee, // new network fee
            daoBrrData.rewardInBps, // new reward
            daoBrrData.rebateInBps, // new rebate
            "gas cost for getting default values at epoch 0: " // log message
        );
    });

    it("test first trade at epoch 1 records correct default data with different expiry block number", async function() {
        // delay to epoch 1
        await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock);
        Helper.assertEqual(1, await daoContract.getCurrentEpochNumber());

        let networkData = await network.getNetworkData();
        Helper.assertEqual(networkData.expiryBlock, startBlock - 1);

        let brrData = await feeHandler.readBRRData();
        Helper.assertEqual(brrData.expiryBlock, startBlock - 1);
        Helper.assertEqual(brrData.epoch, 0);

        // no campaign yet, so still default data from DAO

        let daoBrrData = await daoContract.latestBRRDataDecoded();
        let daoNetworkFee = await daoContract.latestNetworkFeeResult()

        await tradeAndCheckDataChangesAsExpected(
            1, // epoch
            daoNetworkFee, // new network fee
            daoBrrData.rewardInBps, // new reward
            daoBrrData.rebateInBps, // new rebate
            "gas cost for getting default values, no camps: " // log message
        );
    });

    it("test has network fee camp without winning option, no brr camp, data changes as expected", async() => {
        let curNetworkFee = await daoContract.latestNetworkFeeResult();
        let curBrrData = await feeHandler.readBRRData();

        currentBlock = await Helper.getCurrentBlock();
        let link = web3.utils.fromAscii("https://kyberswap.com");
        await daoContract.submitNewCampaign(
            1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
            0, 0, 0, [0, defaultNetworkFee - 1, defaultNetworkFee + 1], link, {from: campCreator}
        );

        // mike & victor have same vote power
        await daoContract.vote(1, 1, {from: mike});
        await daoContract.vote(1, 2, {from: victor});

        // delay until end of campaign
        await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], minCampPeriod + 1);

        let winningData = await daoContract.getCampaignWinningOptionAndValue(1);
        Helper.assertEqual(0, winningData.optionID);
        Helper.assertEqual(0, winningData.value);

        // delay until epoch 2
        currentBlock = await Helper.getCurrentBlock();
        await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], epochPeriod + startBlock - currentBlock);
        Helper.assertEqual(2, await daoContract.getCurrentEpochNumber());

        // make a first trade and check data changes as expected
        await tradeAndCheckDataChangesAsExpected(
            2, // epoch
            curNetworkFee, // new network fee
            curBrrData.rewardBps, // new reward
            curBrrData.rebateBps, // new rebate
            "gas cost for concluding camps (fee camp - no winning optin + no brr camp): " // log message
        );

        // network fee camp should be updated without winning option
        Helper.assertEqual(await daoContract.latestNetworkFeeResult(), curNetworkFee);
        // brr camp should be updated without winning option
        let daoBrrData = await daoContract.latestBRRDataDecoded();
        Helper.assertEqual(2 * epochPeriod + startBlock - 1, daoBrrData.expiryBlockNumber);
        Helper.assertEqual(2, daoBrrData.epoch);
        Helper.assertEqual(curBrrData.rewardBps, daoBrrData.rewardInBps);
        Helper.assertEqual(curBrrData.rebateBps, daoBrrData.rebateInBps);
    });

    it("test has network fee camp without winning option, has brr camp without winning option, data changes as expected", async() => {
        let curNetworkFee = await daoContract.latestNetworkFeeResult();
        let curBrrData = await feeHandler.readBRRData();

        let link = web3.utils.fromAscii("https://kyberswap.com");

        // create network fee campaign
        currentBlock = await Helper.getCurrentBlock();
        let newFee1 = curNetworkFee.add(new BN(1));
        let newFee2 = curNetworkFee.add(new BN(2));
        let newFee3 = curNetworkFee.add(new BN(3));
        await daoContract.submitNewCampaign(
            1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
            0, 0, 0, [newFee1, newFee2, newFee3], link, {from: campCreator}
        );

        // create brr camp
        currentBlock = await Helper.getCurrentBlock();
        let newBrrData1 = getDataFromRebateAndReward(curBrrData.rebateBps.add(new BN(1)), curBrrData.rewardBps.add(new BN(1)));
        let newBrrData2 = getDataFromRebateAndReward(curBrrData.rebateBps.add(new BN(2)), curBrrData.rewardBps.add(new BN(2)));
        let newBrrData3 = getDataFromRebateAndReward(curBrrData.rebateBps.add(new BN(3)), curBrrData.rewardBps.add(new BN(3)));
        await daoContract.submitNewCampaign(
            2, currentBlock + 2, currentBlock + 2 + minCampPeriod,
            0, 0, 0, [newBrrData1, newBrrData2, newBrrData3], link, {from: campCreator}
        );

        // vote for network fee camp, id: 2
        // mike & victor have same vote power, so no winning
        await daoContract.vote(2, 1, {from: mike});
        await daoContract.vote(2, 2, {from: victor});

        // vote for brr camp, id: 3
        // mike & victor have same vote power, so no winning
        await daoContract.vote(3, 1, {from: mike});
        await daoContract.vote(3, 2, {from: victor});

        await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], minCampPeriod);

        // delay until epoch 3
        currentBlock = await Helper.getCurrentBlock();
        await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 2 * epochPeriod + startBlock - currentBlock);
        Helper.assertEqual(3, await daoContract.getCurrentEpochNumber());

        // make a first trade and check data changes as expected
        await tradeAndCheckDataChangesAsExpected(
            3, // epoch
            curNetworkFee, // new network fee
            curBrrData.rewardBps, // new reward
            curBrrData.rebateBps, // new rebate
            "gas cost for concluding camps (fee + brr camp - no winning option): " // log message
        );

        // network fee camp should be updated without winning option
        Helper.assertEqual(await daoContract.latestNetworkFeeResult(), curNetworkFee);
        // brr camp should be updated with no winning option
        let daoBrrData = await daoContract.latestBRRDataDecoded();
        Helper.assertEqual(3 * epochPeriod + startBlock - 1, daoBrrData.expiryBlockNumber);
        Helper.assertEqual(3, daoBrrData.epoch);
        Helper.assertEqual(curBrrData.rewardBps, daoBrrData.rewardInBps);
        Helper.assertEqual(curBrrData.rebateBps, daoBrrData.rebateInBps);
    });

    it("test has network fee camp without winning option, has brr camp with winning option, data changes as expected", async() => {
        let curNetworkFee = await daoContract.latestNetworkFeeResult();
        let curBrrData = await feeHandler.readBRRData();

        let link = web3.utils.fromAscii("https://kyberswap.com");

        // create network fee campaign
        currentBlock = await Helper.getCurrentBlock();
        let newFee1 = curNetworkFee.add(new BN(1));
        let newFee2 = curNetworkFee.add(new BN(2));
        let newFee3 = curNetworkFee.add(new BN(3));
        await daoContract.submitNewCampaign(
            1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
            0, 0, 0, [newFee1, newFee2, newFee3], link, {from: campCreator}
        );

        // create brr camp
        currentBlock = await Helper.getCurrentBlock();
        let newBrrData1 = getDataFromRebateAndReward(curBrrData.rebateBps.add(new BN(1)), curBrrData.rewardBps.add(new BN(1)));
        let newBrrData2 = getDataFromRebateAndReward(curBrrData.rebateBps.add(new BN(2)), curBrrData.rewardBps.add(new BN(2)));
        let newBrrData3 = getDataFromRebateAndReward(curBrrData.rebateBps.add(new BN(3)), curBrrData.rewardBps.add(new BN(3)));
        await daoContract.submitNewCampaign(
            2, currentBlock + 2, currentBlock + 2 + minCampPeriod,
            0, 0, 0, [newBrrData1, newBrrData2, newBrrData3], link, {from: campCreator}
        );

        // vote for network fee camp, id: 4
        // mike & victor have same vote power, so no winning
        await daoContract.vote(4, 1, {from: mike});
        await daoContract.vote(4, 2, {from: victor});

        // vote for brr camp, id: 5
        // mike & victor voted for option 1, so it is the winning option
        await daoContract.vote(5, 1, {from: mike});
        await daoContract.vote(5, 1, {from: victor});

        await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], minCampPeriod);

        // delay until epoch 4
        currentBlock = await Helper.getCurrentBlock();
        await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 3 * epochPeriod + startBlock - currentBlock);
        Helper.assertEqual(4, await daoContract.getCurrentEpochNumber());

        // make a first trade and check data changes as expected
        await tradeAndCheckDataChangesAsExpected(
            4, // epoch
            curNetworkFee, // new network fee
            curBrrData.rewardBps.add(new BN(1)), // new reward
            curBrrData.rebateBps.add(new BN(1)), // new rebate
            "gas cost for concluding camps (fee camp - no winning option + brr camp - has winning option): " // log message
        );

        // network fee camp should be updated without winning option
        Helper.assertEqual(await daoContract.latestNetworkFeeResult(), curNetworkFee);
        // brr camp should be updated with option 1 winning
        let daoBrrData = await daoContract.latestBRRDataDecoded();
        Helper.assertEqual(4 * epochPeriod + startBlock - 1, daoBrrData.expiryBlockNumber);
        Helper.assertEqual(4, daoBrrData.epoch);
        Helper.assertEqual(curBrrData.rewardBps.add(new BN(1)), daoBrrData.rewardInBps);
        Helper.assertEqual(curBrrData.rebateBps.add(new BN(1)), daoBrrData.rebateInBps);
    });

    it("test has network fee camp with winning option, no brr camp, data changes as expected", async() => {
        let curNetworkFee = await daoContract.latestNetworkFeeResult();
        let curBrrData = await feeHandler.readBRRData();

        let link = web3.utils.fromAscii("https://kyberswap.com");

        // create network fee campaign
        currentBlock = await Helper.getCurrentBlock();
        let newFee1 = curNetworkFee.add(new BN(1));
        let newFee2 = curNetworkFee.add(new BN(2));
        let newFee3 = curNetworkFee.add(new BN(3));
        await daoContract.submitNewCampaign(
            1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
            0, 0, 0, [newFee1, newFee2, newFee3], link, {from: campCreator}
        );

        // vote for network fee camp, id: 6
        // winning option is 1
        await daoContract.vote(6, 1, {from: mike});
        await daoContract.vote(6, 1, {from: victor});

        await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], minCampPeriod);

        // delay until epoch 5
        currentBlock = await Helper.getCurrentBlock();
        await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 4 * epochPeriod + startBlock - currentBlock);
        Helper.assertEqual(5, await daoContract.getCurrentEpochNumber());

        // make a first trade and check data changes as expected
        await tradeAndCheckDataChangesAsExpected(
            5, // epoch
            newFee1, // new fee
            curBrrData.rewardBps, // new reward
            curBrrData.rebateBps, // new rebate
            "gas cost for concluding camps (fee camp - has winning option + no brr camp): " // log message
        );

        // network fee camp should be updated with winning option
        Helper.assertEqual(await daoContract.latestNetworkFeeResult(), newFee1);
    });

    it("test has network fee camp with winning option, has brr camp without winning option, data changes as expected", async() => {
        let curNetworkFee = await daoContract.latestNetworkFeeResult();
        let curBrrData = await feeHandler.readBRRData();

        let link = web3.utils.fromAscii("https://kyberswap.com");

        // create network fee campaign
        currentBlock = await Helper.getCurrentBlock();
        let newFee1 = curNetworkFee.add(new BN(1));
        let newFee2 = curNetworkFee.add(new BN(2));
        let newFee3 = curNetworkFee.add(new BN(3));
        await daoContract.submitNewCampaign(
            1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
            0, 0, 0, [newFee1, newFee2, newFee3], link, {from: campCreator}
        );

        // create brr camp
        currentBlock = await Helper.getCurrentBlock();
        let newBrrData1 = getDataFromRebateAndReward(curBrrData.rebateBps.add(new BN(1)), curBrrData.rewardBps.add(new BN(1)));
        let newBrrData2 = getDataFromRebateAndReward(curBrrData.rebateBps.add(new BN(2)), curBrrData.rewardBps.add(new BN(2)));
        let newBrrData3 = getDataFromRebateAndReward(curBrrData.rebateBps.add(new BN(3)), curBrrData.rewardBps.add(new BN(3)));
        await daoContract.submitNewCampaign(
            2, currentBlock + 2, currentBlock + 2 + minCampPeriod,
            0, 0, 0, [newBrrData1, newBrrData2, newBrrData3], link, {from: campCreator}
        );

        // vote for network fee camp, id: 7
        // mike & victor have same vote power, so no winning
        await daoContract.vote(7, 1, {from: mike});
        await daoContract.vote(7, 1, {from: victor});

        // vote for brr camp, id: 8
        // mike & victor have same vote power, so no winning
        await daoContract.vote(8, 1, {from: mike});
        await daoContract.vote(8, 2, {from: victor});

        await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], minCampPeriod);

        // delay until epoch 6
        currentBlock = await Helper.getCurrentBlock();
        await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 5 * epochPeriod + startBlock - currentBlock);
        Helper.assertEqual(6, await daoContract.getCurrentEpochNumber());

        // make a first trade and check data changes as expected
        await tradeAndCheckDataChangesAsExpected(
            6, // epoch
            newFee1, // new fee
            curBrrData.rewardBps, // new reward
            curBrrData.rebateBps, // new rebate
            "gas cost for concluding camps (fee camp - has winning option + brr camp - no winning option): " // log message
        );

        // network fee camp should be updated with winning option
        Helper.assertEqual(await daoContract.latestNetworkFeeResult(), newFee1);
        // brr camp should be updated without winning option
        let daoBrrData = await daoContract.latestBRRDataDecoded();
        Helper.assertEqual(6 * epochPeriod + startBlock - 1, daoBrrData.expiryBlockNumber);
        Helper.assertEqual(6, daoBrrData.epoch);
        Helper.assertEqual(curBrrData.rewardBps, daoBrrData.rewardInBps);
        Helper.assertEqual(curBrrData.rebateBps, daoBrrData.rebateInBps);
    });

    it("test has network fee camp with winning option, has brr camp with winning option, data changes as expected", async() => {
        let curNetworkFee = await daoContract.latestNetworkFeeResult();
        let curBrrData = await feeHandler.readBRRData();

        let link = web3.utils.fromAscii("https://kyberswap.com");

        // create network fee campaign
        currentBlock = await Helper.getCurrentBlock();
        let newFee1 = curNetworkFee.add(new BN(1));
        let newFee2 = curNetworkFee.add(new BN(2));
        let newFee3 = curNetworkFee.add(new BN(3));
        await daoContract.submitNewCampaign(
            1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
            0, 0, 0, [newFee1, newFee2, newFee3], link, {from: campCreator}
        );

        // create brr camp
        currentBlock = await Helper.getCurrentBlock();
        let newBrrData1 = getDataFromRebateAndReward(curBrrData.rebateBps.add(new BN(1)), curBrrData.rewardBps.add(new BN(1)));
        let newBrrData2 = getDataFromRebateAndReward(curBrrData.rebateBps.add(new BN(2)), curBrrData.rewardBps.add(new BN(2)));
        let newBrrData3 = getDataFromRebateAndReward(curBrrData.rebateBps.add(new BN(3)), curBrrData.rewardBps.add(new BN(3)));
        await daoContract.submitNewCampaign(
            2, currentBlock + 2, currentBlock + 2 + minCampPeriod,
            0, 0, 0, [newBrrData1, newBrrData2, newBrrData3], link, {from: campCreator}
        );

        // vote for network fee camp, id: 9
        // mike & victor voted for option 1, so it is the winning option
        await daoContract.vote(9, 1, {from: mike});
        await daoContract.vote(9, 1, {from: victor});

        // vote for brr camp, id: 10
        // mike & victor voted for option 1, so it is the winning option
        await daoContract.vote(10, 1, {from: mike});
        await daoContract.vote(10, 1, {from: victor});

        await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], minCampPeriod);

        // delay until epoch 7
        currentBlock = await Helper.getCurrentBlock();
        await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 6 * epochPeriod + startBlock - currentBlock);
        Helper.assertEqual(7, await daoContract.getCurrentEpochNumber());

        // make a first trade and check data changes as expected
        await tradeAndCheckDataChangesAsExpected(
            7, // epoch
            newFee1, // new network fee
            curBrrData.rewardBps.add(new BN(1)), // new reward
            curBrrData.rebateBps.add(new BN(1)), // new rebate
            "gas cost for concluding camps (network fee + brr camp - has winning option): " // log message
        );

        // network fee camp should be updated with winning option
        Helper.assertEqual(await daoContract.latestNetworkFeeResult(), newFee1);
        // brr camp should be updated with winning option
        let daoBrrData = await daoContract.latestBRRDataDecoded();
        Helper.assertEqual(7 * epochPeriod + startBlock - 1, daoBrrData.expiryBlockNumber);
        Helper.assertEqual(7, daoBrrData.epoch);
        Helper.assertEqual(curBrrData.rewardBps.add(new BN(1)), daoBrrData.rewardInBps);
        Helper.assertEqual(curBrrData.rebateBps.add(new BN(1)), daoBrrData.rebateInBps);
    });

    it("test no network fee and brr camps, data changes only expiry block as expected", async() => {
        let curNetworkFee = await daoContract.latestNetworkFeeResult();
        let curBrrData = await feeHandler.readBRRData();

        // delay until epoch 10
        currentBlock = await Helper.getCurrentBlock();
        await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 9 * epochPeriod + startBlock - currentBlock);
        Helper.assertEqual(10, await daoContract.getCurrentEpochNumber());

        // make a first trade and check data changes as expected
        await tradeAndCheckDataChangesAsExpected(
            10, // epoch
            curNetworkFee, // new network fee
            curBrrData.rewardBps, // new reward
            curBrrData.rebateBps, // new rebate
            "gas cost no network fee + brr camp, fallback previous values: " // log message
        );
    });

    it("test update network fee from DAO with fee 0, network updates network fee, feeHandler doesn't update brr data", async() => {
        let curNetworkFee = await daoContract.latestNetworkFeeResult();
        let curBrrData = await feeHandler.readBRRData();

        let link = web3.utils.fromAscii("https://kyberswap.com");

        // create network fee campaign
        currentBlock = await Helper.getCurrentBlock();
        let newFee1 = 0;
        let newFee2 = curNetworkFee.add(new BN(2));
        let newFee3 = curNetworkFee.add(new BN(3));
        await daoContract.submitNewCampaign(
            1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
            0, 0, 0, [newFee1, newFee2, newFee3], link, {from: campCreator}
        );

        // vote for network fee to be 0
        await daoContract.vote(11, 1, {from: mike});
        await daoContract.vote(11, 1, {from: victor});

        // delay until epoch 11
        currentBlock = await Helper.getCurrentBlock();
        await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 10 * epochPeriod + startBlock - currentBlock);
        Helper.assertEqual(11, await daoContract.getCurrentEpochNumber());

        // make a simple swap, make sure data is updated for epoch 4 with concluding campaign
        await networkProxy.swapEtherToToken(destToken.address, 1, {from: taker, value: ethSrcQty});

        // ============ check data should be updated from DAO ============
        // check expected network data from network and dao
        networkData = await network.getNetworkData();
        Helper.assertEqual(11 * epochPeriod + startBlock - 1, networkData.expiryBlock);
        Helper.assertEqual(0, networkData.networkFeeBps);
        Helper.assertEqual(0, await daoContract.latestNetworkFeeResult());

        // brr is not updated as there is no fee
        let brrData = await feeHandler.readBRRData();
        Helper.assertEqual(10 * epochPeriod + startBlock - 1, brrData.expiryBlock);
        Helper.assertEqual(10, brrData.epoch);
        Helper.assertEqual(curBrrData.rewardBps, brrData.rewardBps);
        Helper.assertEqual(curBrrData.rebateBps, brrData.rebateBps);
        // check expected brr data from dao
        let daoBrrData = await daoContract.latestBRRDataDecoded();
        Helper.assertEqual(11 * epochPeriod + startBlock - 1, daoBrrData.expiryBlockNumber);
        Helper.assertEqual(11, daoBrrData.epoch);
        Helper.assertEqual(brrData.rewardBps, daoBrrData.rewardInBps);
        Helper.assertEqual(brrData.rebateBps, daoBrrData.rebateInBps);
    });

    it("test update network fee from DAO with fee 49.99% - max fee", async() => {
        let curNetworkFee = await daoContract.latestNetworkFeeResult();
        let curBrrData = await feeHandler.readBRRData();

        let link = web3.utils.fromAscii("https://kyberswap.com");

        // create network fee campaign
        currentBlock = await Helper.getCurrentBlock();
        let newFee1 = 4999;
        let newFee2 = curNetworkFee.add(new BN(2));
        let newFee3 = curNetworkFee.add(new BN(3));
        await daoContract.submitNewCampaign(
            1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
            0, 0, 0, [newFee1, newFee2, newFee3], link, {from: campCreator}
        );

        // vote for network fee to be max
        await daoContract.vote(12, 1, {from: mike});
        await daoContract.vote(12, 1, {from: victor});

        // delay until epoch 12
        currentBlock = await Helper.getCurrentBlock();
        await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 11 * epochPeriod + startBlock - currentBlock);
        Helper.assertEqual(12, await daoContract.getCurrentEpochNumber());

        // make a first trade and check data changes as expected
        await tradeAndCheckDataChangesAsExpected(
            12, // epoch
            4999, // new network fee
            curBrrData.rewardBps, // new reward
            curBrrData.rebateBps, // new rebate
            "gas cost change network fee to max (49.99%): " // log message
        );

        // create network fee campaign
        currentBlock = await Helper.getCurrentBlock();
        newFee1 = defaultNetworkFee;
        newFee2 = defaultNetworkFee;
        newFee3 = defaultNetworkFee;
        await daoContract.submitNewCampaign(
            1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
            0, 0, 0, [newFee1, newFee2, newFee3], link, {from: campCreator}
        );

        // vote for network fee to be option 1
        await daoContract.vote(13, 1, {from: mike});
        await daoContract.vote(13, 1, {from: victor});

        // delay until epoch 13
        currentBlock = await Helper.getCurrentBlock();
        await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 12 * epochPeriod + startBlock - currentBlock);
        Helper.assertEqual(13, await daoContract.getCurrentEpochNumber());

        await networkProxy.swapEtherToToken(destToken.address, 1, {from: taker, value: ethSrcQty});
    });

    it("test update reward to 100%", async() => {
        let curNetworkFee = await daoContract.latestNetworkFeeResult();
        let curBrrData = await feeHandler.readBRRData();

        let link = web3.utils.fromAscii("https://kyberswap.com");

        // create brr camp
        currentBlock = await Helper.getCurrentBlock();
        let newBrrData1 = getDataFromRebateAndReward(0, 10000);
        let newBrrData2 = getDataFromRebateAndReward(curBrrData.rebateBps.add(new BN(2)), curBrrData.rewardBps.add(new BN(2)));
        let newBrrData3 = getDataFromRebateAndReward(curBrrData.rebateBps.add(new BN(3)), curBrrData.rewardBps.add(new BN(3)));
        await daoContract.submitNewCampaign(
            2, currentBlock + 2, currentBlock + 2 + minCampPeriod,
            0, 0, 0, [newBrrData1, newBrrData2, newBrrData3], link, {from: campCreator}
        );

        await daoContract.vote(14, 1, {from: mike});
        await daoContract.vote(14, 1, {from: victor});

        // delay until epoch 14
        currentBlock = await Helper.getCurrentBlock();
        await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 13 * epochPeriod + startBlock - currentBlock);
        Helper.assertEqual(14, await daoContract.getCurrentEpochNumber());

        // make a first trade and check data changes as expected
        await tradeAndCheckDataChangesAsExpected(
            14, // epoch
            curNetworkFee, // new network fee
            10000, // new reward
            0, // new rebate
            "gas cost change reward to 100%: " // log message
        );
    });

    it("test update rebate to 100%", async() => {
        let curNetworkFee = await daoContract.latestNetworkFeeResult();

        let link = web3.utils.fromAscii("https://kyberswap.com");

        // create brr camp
        currentBlock = await Helper.getCurrentBlock();
        let newBrrData1 = getDataFromRebateAndReward(10000, 0);
        let newBrrData2 = getDataFromRebateAndReward(5000, 4900);
        let newBrrData3 = getDataFromRebateAndReward(6000, 3000);
        await daoContract.submitNewCampaign(
            2, currentBlock + 2, currentBlock + 2 + minCampPeriod,
            0, 0, 0, [newBrrData1, newBrrData2, newBrrData3], link, {from: campCreator}
        );

        await daoContract.vote(15, 1, {from: mike});
        await daoContract.vote(15, 1, {from: victor});

        // delay until epoch 15
        currentBlock = await Helper.getCurrentBlock();
        await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 14 * epochPeriod + startBlock - currentBlock);
        Helper.assertEqual(15, await daoContract.getCurrentEpochNumber());

        // make a first trade and check data changes as expected
        await tradeAndCheckDataChangesAsExpected(
            15, // epoch
            curNetworkFee, // new network fee
            0, // new reward
            10000, // new rebate
            "gas cost change reward to 100%: " // log message
        );
    });

    it("test update reward and rebate to 0", async() => {
        let curNetworkFee = await daoContract.latestNetworkFeeResult();

        let link = web3.utils.fromAscii("https://kyberswap.com");

        // create brr camp
        currentBlock = await Helper.getCurrentBlock();
        let newBrrData1 = getDataFromRebateAndReward(0, 0);
        let newBrrData2 = getDataFromRebateAndReward(5000, 4900);
        let newBrrData3 = getDataFromRebateAndReward(6000, 3000);
        await daoContract.submitNewCampaign(
            2, currentBlock + 2, currentBlock + 2 + minCampPeriod,
            0, 0, 0, [newBrrData1, newBrrData2, newBrrData3], link, {from: campCreator}
        );

        await daoContract.vote(16, 1, {from: mike});
        await daoContract.vote(16, 1, {from: victor});

        // delay until epoch 16
        currentBlock = await Helper.getCurrentBlock();
        await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 15 * epochPeriod + startBlock - currentBlock);
        Helper.assertEqual(16, await daoContract.getCurrentEpochNumber());

        // make a first trade and check data changes as expected
        await tradeAndCheckDataChangesAsExpected(
            16, // epoch
            curNetworkFee, // new network fee
            0, // new reward
            0, // new rebate
            "gas cost change reward and rebate to 0: " // log message
        );
    });

    it("test can not record new data for DAO as no trade for more than 1 epoch", async() => {
        let curNetworkFee = await daoContract.latestNetworkFeeResult();
        let curBrrData = await feeHandler.readBRRData();

        let link = web3.utils.fromAscii("https://kyberswap.com");

        // create network fee campaign
        currentBlock = await Helper.getCurrentBlock();
        let newFee1 = curNetworkFee.add(new BN(1));
        let newFee2 = curNetworkFee.add(new BN(2));
        let newFee3 = curNetworkFee.add(new BN(3));
        await daoContract.submitNewCampaign(
            1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
            0, 0, 0, [newFee1, newFee2, newFee3], link, {from: campCreator}
        );

        // create brr camp
        currentBlock = await Helper.getCurrentBlock();
        let newBrrData1 = getDataFromRebateAndReward(5000, 5000);
        let newBrrData2 = getDataFromRebateAndReward(5000, 4900);
        let newBrrData3 = getDataFromRebateAndReward(6000, 3000);
        await daoContract.submitNewCampaign(
            2, currentBlock + 2, currentBlock + 2 + minCampPeriod,
            0, 0, 0, [newBrrData1, newBrrData2, newBrrData3], link, {from: campCreator}
        );

        // vote for network fee camp, id: 17
        // mike & victor voted for option 1, so it is the winning option
        await daoContract.vote(17, 1, {from: mike});
        await daoContract.vote(17, 1, {from: victor});

        // vote for brr camp, id: 18
        // mike & victor voted for option 1, so it is the winning option
        await daoContract.vote(18, 1, {from: mike});
        await daoContract.vote(18, 1, {from: victor});

        await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], minCampPeriod);

        // delay until epoch 18
        currentBlock = await Helper.getCurrentBlock();
        await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 17 * epochPeriod + startBlock - currentBlock);
        Helper.assertEqual(18, await daoContract.getCurrentEpochNumber());

        // make a first trade and check data changes as expected
        // no trade at epoch 17, so can not update new data for DAO from previous network fee + brr camps
        await tradeAndCheckDataChangesAsExpected(
            18, // epoch
            curNetworkFee, // new network fee
            curBrrData.rewardBps, // new reward
            curBrrData.rebateBps, // new rebate
            "gas cost no network fee + brr camp, fallback previous values: " // log message
        );

        // network fee camp should be updated without winning option
        Helper.assertEqual(await daoContract.latestNetworkFeeResult(), curNetworkFee);
        // brr camp should be updated without winning option
        let daoBrrData = await daoContract.latestBRRDataDecoded();
        Helper.assertEqual(18 * epochPeriod + startBlock - 1, daoBrrData.expiryBlockNumber);
        Helper.assertEqual(18, daoBrrData.epoch);
        Helper.assertEqual(curBrrData.rewardBps, daoBrrData.rewardInBps);
        Helper.assertEqual(curBrrData.rebateBps, daoBrrData.rebateInBps);
    });
})

function mulPrecision(value) {
    return precisionUnits.mul(new BN(value));
}

function getDataFromRebateAndReward(rebate, reward) {
    let power128 = new BN(2).pow(new BN(128));
    return (new BN(rebate).mul(power128)).add(new BN(reward));
}
