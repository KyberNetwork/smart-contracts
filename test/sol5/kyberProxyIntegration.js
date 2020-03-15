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

    const tradeAndCheckDataChangesAsExpected = async(epoch, expectedNetworkFee, expectedReward, expectedRebate) => {
        // make a simple swap, make sure data is updated for epoch 4 with concluding campaign
        let txResult = await networkProxy.swapEtherToToken(destToken.address, 1, {from: taker, value: ethSrcQty});
        console.log("eth - token, first trade, gas used: " + txResult.receipt.gasUsed);

        // ============ check data should be updated from DAO ============
        // check expected network data from network and dao
        networkData = await network.getNetworkData();
        Helper.assertEqual(epoch * epochPeriod + startBlock - 1, networkData.expiryBlock);
        Helper.assertEqual(expectedNetworkFee, networkData.networkFeeBps);
        Helper.assertEqual(expectedNetworkFee, await daoContract.latestNetworkFeeResult());

        // check expected brr data from fee handler
        let brrData = await feeHandler.decodeBRRData();
        Helper.assertEqual(epoch * epochPeriod + startBlock - 1, brrData.expiryBlock);
        Helper.assertEqual(epoch, brrData.epoch);
        Helper.assertEqual(expectedReward, brrData.rewardBPS);
        Helper.assertEqual(expectedRebate, brrData.rebateBPS);
        // check expected brr data from dao
        let daoBrrData = await daoContract.latestBRRDataDecoded();
        Helper.assertEqual(brrData.expiryBlock, daoBrrData.expiryBlockNumber);
        Helper.assertEqual(brrData.epoch, daoBrrData.epoch);
        Helper.assertEqual(brrData.rewardBPS, daoBrrData.rewardInBps);
        Helper.assertEqual(brrData.rebateBPS, daoBrrData.rebateInBps);

        // ========= another swap, data unchanges =========
        txResult = await networkProxy.swapEtherToToken(destToken.address, 1, {from: taker, value: ethSrcQty});
        console.log("eth - token, second trade, gas used: " + txResult.receipt.gasUsed);

        let curNetworkData = await network.getNetworkData();
        Helper.assertEqual(networkData.expiryBlock, curNetworkData.expiryBlock);
        Helper.assertEqual(networkData.networkFeeBps, curNetworkData.networkFeeBps);

        let curBrrData = await feeHandler.decodeBRRData();
        Helper.assertEqual(brrData.expiryBlock, curBrrData.expiryBlock);
        Helper.assertEqual(brrData.epoch, curBrrData.epoch);
        Helper.assertEqual(brrData.rewardBPS, curBrrData.rewardBPS);
        Helper.assertEqual(brrData.rebateBPS, curBrrData.rebateBPS);

        // ========= another swap, data unchanges =========
        await srcToken.transfer(taker, srcQty);
        await srcToken.approve(networkProxy.address, srcQty, {from: taker});
        txResult = await networkProxy.swapTokenToEther(srcToken.address, srcQty, 1, {from: taker});
        console.log("token - eth, third trade, gas used: " + txResult.receipt.gasUsed);

        curNetworkData = await network.getNetworkData();
        Helper.assertEqual(networkData.expiryBlock, curNetworkData.expiryBlock);
        Helper.assertEqual(networkData.networkFeeBps, curNetworkData.networkFeeBps);

        curBrrData = await feeHandler.decodeBRRData();
        Helper.assertEqual(brrData.expiryBlock, curBrrData.expiryBlock);
        Helper.assertEqual(brrData.epoch, curBrrData.epoch);
        Helper.assertEqual(brrData.rewardBPS, curBrrData.rewardBPS);
        Helper.assertEqual(brrData.rebateBPS, curBrrData.rebateBPS);

        // ========= another swap, data unchanges =========
        await srcToken.transfer(taker, srcQty);
        await srcToken.approve(networkProxy.address, srcQty, {from: taker});
        txResult = await networkProxy.swapTokenToToken(srcToken.address, srcQty, destToken.address, 1, {from: taker});
        console.log("token - token, fourth trade, gas used: " + txResult.receipt.gasUsed);

        curNetworkData = await network.getNetworkData();
        Helper.assertEqual(networkData.expiryBlock, curNetworkData.expiryBlock);
        Helper.assertEqual(networkData.networkFeeBps, curNetworkData.networkFeeBps);

        curBrrData = await feeHandler.decodeBRRData();
        Helper.assertEqual(brrData.expiryBlock, curBrrData.expiryBlock);
        Helper.assertEqual(brrData.epoch, curBrrData.epoch);
        Helper.assertEqual(brrData.rewardBPS, curBrrData.rewardBPS);
        Helper.assertEqual(brrData.rebateBPS, curBrrData.rebateBPS);
    }

    it("test first trade of epoch 0 records correct default network fee and brr data", async() => {
        let networkData = await network.getNetworkData();
        // default network data, expiry block should be block when network is deployed
        Helper.assertLesser(networkData.expiryBlock, startBlock - 1);

        let brrData = await feeHandler.decodeBRRData();
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
            daoBrrData.rebateInBps // new rebate
        );
    });

    it("test first trade at epoch 1 records correct default data with different expiry block number", async function() {
        // delay to epoch 1
        await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock);
        Helper.assertEqual(1, await daoContract.getCurrentEpochNumber());

        let networkData = await network.getNetworkData();
        Helper.assertEqual(networkData.expiryBlock, startBlock - 1);

        let brrData = await feeHandler.decodeBRRData();
        Helper.assertEqual(brrData.expiryBlock, startBlock - 1);
        Helper.assertEqual(brrData.epoch, 0);

        // no campaign yet, so still default data from DAO

        let daoBrrData = await daoContract.latestBRRDataDecoded();
        let daoNetworkFee = await daoContract.latestNetworkFeeResult()

        await tradeAndCheckDataChangesAsExpected(
            1, // epoch
            daoNetworkFee, // new network fee
            daoBrrData.rewardInBps, // new reward
            daoBrrData.rebateInBps // new rebate
        );
    });

    it("test has network fee camp without winning option, no brr camp, data changes as expected", async() => {
        let curNetworkFee = await daoContract.latestNetworkFeeResult();
        let curBrrData = await feeHandler.decodeBRRData();

        currentBlock = await Helper.getCurrentBlock();
        let link = web3.utils.fromAscii("https://kyberswap.com");
        await daoContract.submitNewCampaign(
            1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
            0, [0, defaultNetworkFee - 1, defaultNetworkFee + 1], link, {from: campCreator}
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
            curBrrData.rewardBPS, // new reward
            curBrrData.rebateBPS // new rebate
        );

        // camp should be concluded with no winning option
        let winningOptionData = await daoContract.getWinningOptionData(1);
        Helper.assertEqual(true, winningOptionData.hasConcluded);
        Helper.assertEqual(0, winningOptionData.winningOptionID);
    });

    it("test has network fee camp without winning option, has brr camp without winning option, data changes as expected", async() => {
        let curNetworkFee = await daoContract.latestNetworkFeeResult();
        let curBrrData = await feeHandler.decodeBRRData();

        let link = web3.utils.fromAscii("https://kyberswap.com");

        // create network fee campaign
        currentBlock = await Helper.getCurrentBlock();
        let newFee1 = curNetworkFee.add(new BN(1));
        let newFee2 = curNetworkFee.add(new BN(2));
        let newFee3 = curNetworkFee.add(new BN(3));
        await daoContract.submitNewCampaign(
            1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
            0, [newFee1, newFee2, newFee3], link, {from: campCreator}
        );

        // create brr camp
        currentBlock = await Helper.getCurrentBlock();
        let newBrrData1 = getDataFromRebateAndReward(curBrrData.rebateBPS.add(new BN(1)), curBrrData.rewardBPS.add(new BN(1)));
        let newBrrData2 = getDataFromRebateAndReward(curBrrData.rebateBPS.add(new BN(2)), curBrrData.rewardBPS.add(new BN(2)));
        let newBrrData3 = getDataFromRebateAndReward(curBrrData.rebateBPS.add(new BN(3)), curBrrData.rewardBPS.add(new BN(3)));
        await daoContract.submitNewCampaign(
            2, currentBlock + 2, currentBlock + 2 + minCampPeriod,
            0, [newBrrData1, newBrrData2, newBrrData3], link, {from: campCreator}
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
            curBrrData.rewardBPS, // new reward
            curBrrData.rebateBPS // new rebate
        );

        // network fee camp should be concluded without winning option
        let winningOptionData = await daoContract.getWinningOptionData(2);
        Helper.assertEqual(true, winningOptionData.hasConcluded);
        Helper.assertEqual(0, winningOptionData.winningOptionID);
        // brr camp should be concluded with no winning option
        winningOptionData = await daoContract.getWinningOptionData(3);
        Helper.assertEqual(true, winningOptionData.hasConcluded);
        Helper.assertEqual(0, winningOptionData.winningOptionID);
    });

    it("test has network fee camp without winning option, has brr camp with winning option, data changes as expected", async() => {
        let curNetworkFee = await daoContract.latestNetworkFeeResult();
        let curBrrData = await feeHandler.decodeBRRData();

        let link = web3.utils.fromAscii("https://kyberswap.com");

        // create network fee campaign
        currentBlock = await Helper.getCurrentBlock();
        let newFee1 = curNetworkFee.add(new BN(1));
        let newFee2 = curNetworkFee.add(new BN(2));
        let newFee3 = curNetworkFee.add(new BN(3));
        await daoContract.submitNewCampaign(
            1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
            0, [newFee1, newFee2, newFee3], link, {from: campCreator}
        );

        // create brr camp
        currentBlock = await Helper.getCurrentBlock();
        let newBrrData1 = getDataFromRebateAndReward(curBrrData.rebateBPS.add(new BN(1)), curBrrData.rewardBPS.add(new BN(1)));
        let newBrrData2 = getDataFromRebateAndReward(curBrrData.rebateBPS.add(new BN(2)), curBrrData.rewardBPS.add(new BN(2)));
        let newBrrData3 = getDataFromRebateAndReward(curBrrData.rebateBPS.add(new BN(3)), curBrrData.rewardBPS.add(new BN(3)));
        await daoContract.submitNewCampaign(
            2, currentBlock + 2, currentBlock + 2 + minCampPeriod,
            0, [newBrrData1, newBrrData2, newBrrData3], link, {from: campCreator}
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
            curBrrData.rewardBPS.add(new BN(1)), // new reward
            curBrrData.rebateBPS.add(new BN(1)) // new rebate
        );

        // network fee camp should be concluded without winning option
        let winningOptionData = await daoContract.getWinningOptionData(4);
        Helper.assertEqual(true, winningOptionData.hasConcluded);
        Helper.assertEqual(0, winningOptionData.winningOptionID);
        // brr camp should be concluded with option 1 is the winning option
        winningOptionData = await daoContract.getWinningOptionData(5);
        Helper.assertEqual(true, winningOptionData.hasConcluded);
        Helper.assertEqual(1, winningOptionData.winningOptionID);
    });

    it("test has network fee camp with winning option, no brr camp, data changes as expected", async() => {
        let curNetworkFee = await daoContract.latestNetworkFeeResult();
        let curBrrData = await feeHandler.decodeBRRData();

        let link = web3.utils.fromAscii("https://kyberswap.com");

        // create network fee campaign
        currentBlock = await Helper.getCurrentBlock();
        let newFee1 = curNetworkFee.add(new BN(1));
        let newFee2 = curNetworkFee.add(new BN(2));
        let newFee3 = curNetworkFee.add(new BN(3));
        await daoContract.submitNewCampaign(
            1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
            0, [newFee1, newFee2, newFee3], link, {from: campCreator}
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
            curBrrData.rewardBPS, // new reward
            curBrrData.rebateBPS // new rebate
        );

        // check camp is concluded
        let winningOptionData = await daoContract.getWinningOptionData(6);
        Helper.assertEqual(true, winningOptionData.hasConcluded);
        Helper.assertEqual(1, winningOptionData.winningOptionID);
    });

    it("test has network fee camp with winning option, has brr camp without winning option, data changes as expected", async() => {
        let curNetworkFee = await daoContract.latestNetworkFeeResult();
        let curBrrData = await feeHandler.decodeBRRData();

        let link = web3.utils.fromAscii("https://kyberswap.com");

        // create network fee campaign
        currentBlock = await Helper.getCurrentBlock();
        let newFee1 = curNetworkFee.add(new BN(1));
        let newFee2 = curNetworkFee.add(new BN(2));
        let newFee3 = curNetworkFee.add(new BN(3));
        await daoContract.submitNewCampaign(
            1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
            0, [newFee1, newFee2, newFee3], link, {from: campCreator}
        );

        // create brr camp
        currentBlock = await Helper.getCurrentBlock();
        let newBrrData1 = getDataFromRebateAndReward(curBrrData.rebateBPS.add(new BN(1)), curBrrData.rewardBPS.add(new BN(1)));
        let newBrrData2 = getDataFromRebateAndReward(curBrrData.rebateBPS.add(new BN(2)), curBrrData.rewardBPS.add(new BN(2)));
        let newBrrData3 = getDataFromRebateAndReward(curBrrData.rebateBPS.add(new BN(3)), curBrrData.rewardBPS.add(new BN(3)));
        await daoContract.submitNewCampaign(
            2, currentBlock + 2, currentBlock + 2 + minCampPeriod,
            0, [newBrrData1, newBrrData2, newBrrData3], link, {from: campCreator}
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
            curBrrData.rewardBPS, // new reward
            curBrrData.rebateBPS // new rebate
        );

        // check camps are concluded
        let winningOptionData = await daoContract.getWinningOptionData(7);
        Helper.assertEqual(true, winningOptionData.hasConcluded);
        Helper.assertEqual(1, winningOptionData.winningOptionID);
        winningOptionData = await daoContract.getWinningOptionData(8);
        Helper.assertEqual(true, winningOptionData.hasConcluded);
        Helper.assertEqual(0, winningOptionData.winningOptionID);
    });

    it("test has network fee camp with winning option, has brr camp with winning option, data changes as expected", async() => {
        let curNetworkFee = await daoContract.latestNetworkFeeResult();
        let curBrrData = await feeHandler.decodeBRRData();

        let link = web3.utils.fromAscii("https://kyberswap.com");

        // create network fee campaign
        currentBlock = await Helper.getCurrentBlock();
        let newFee1 = curNetworkFee.add(new BN(1));
        let newFee2 = curNetworkFee.add(new BN(2));
        let newFee3 = curNetworkFee.add(new BN(3));
        await daoContract.submitNewCampaign(
            1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
            0, [newFee1, newFee2, newFee3], link, {from: campCreator}
        );

        // create brr camp
        currentBlock = await Helper.getCurrentBlock();
        let newBrrData1 = getDataFromRebateAndReward(curBrrData.rebateBPS.add(new BN(1)), curBrrData.rewardBPS.add(new BN(1)));
        let newBrrData2 = getDataFromRebateAndReward(curBrrData.rebateBPS.add(new BN(2)), curBrrData.rewardBPS.add(new BN(2)));
        let newBrrData3 = getDataFromRebateAndReward(curBrrData.rebateBPS.add(new BN(3)), curBrrData.rewardBPS.add(new BN(3)));
        await daoContract.submitNewCampaign(
            2, currentBlock + 2, currentBlock + 2 + minCampPeriod,
            0, [newBrrData1, newBrrData2, newBrrData3], link, {from: campCreator}
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
            curBrrData.rewardBPS.add(new BN(1)), // new reward
            curBrrData.rebateBPS.add(new BN(1)) // new rebate
        );

        // network fee camp should be concluded with option 1 is the winning option
        let winningOptionData = await daoContract.getWinningOptionData(9);
        Helper.assertEqual(true, winningOptionData.hasConcluded);
        Helper.assertEqual(1, winningOptionData.winningOptionID);
        // brr camp should be concluded with option 1 is the winning option
        winningOptionData = await daoContract.getWinningOptionData(10);
        Helper.assertEqual(true, winningOptionData.hasConcluded);
        Helper.assertEqual(1, winningOptionData.winningOptionID);
    });

    it("test no network fee and brr camps, data changes only expiry block as expected", async() => {
        let curNetworkFee = await daoContract.latestNetworkFeeResult();
        let curBrrData = await feeHandler.decodeBRRData();

        // delay until epoch 10
        currentBlock = await Helper.getCurrentBlock();
        await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 9 * epochPeriod + startBlock - currentBlock);
        Helper.assertEqual(10, await daoContract.getCurrentEpochNumber());

        // make a first trade and check data changes as expected
        await tradeAndCheckDataChangesAsExpected(
            10, // epoch
            curNetworkFee, // new network fee
            curBrrData.rewardBPS, // new reward
            curBrrData.rebateBPS // new rebate
        );
    });

    it("test can not record new data for DAO as no trade for more than 1 epoch", async() => {
        let curNetworkFee = await daoContract.latestNetworkFeeResult();
        let curBrrData = await feeHandler.decodeBRRData();

        let link = web3.utils.fromAscii("https://kyberswap.com");

        // create network fee campaign
        currentBlock = await Helper.getCurrentBlock();
        let newFee1 = curNetworkFee.add(new BN(1));
        let newFee2 = curNetworkFee.add(new BN(2));
        let newFee3 = curNetworkFee.add(new BN(3));
        await daoContract.submitNewCampaign(
            1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
            0, [newFee1, newFee2, newFee3], link, {from: campCreator}
        );

        // create brr camp
        currentBlock = await Helper.getCurrentBlock();
        let newBrrData1 = getDataFromRebateAndReward(curBrrData.rebateBPS.add(new BN(1)), curBrrData.rewardBPS.add(new BN(1)));
        let newBrrData2 = getDataFromRebateAndReward(curBrrData.rebateBPS.add(new BN(2)), curBrrData.rewardBPS.add(new BN(2)));
        let newBrrData3 = getDataFromRebateAndReward(curBrrData.rebateBPS.add(new BN(3)), curBrrData.rewardBPS.add(new BN(3)));
        await daoContract.submitNewCampaign(
            2, currentBlock + 2, currentBlock + 2 + minCampPeriod,
            0, [newBrrData1, newBrrData2, newBrrData3], link, {from: campCreator}
        );

        // vote for network fee camp, id: 11
        // mike & victor voted for option 1, so it is the winning option
        await daoContract.vote(11, 1, {from: mike});
        await daoContract.vote(11, 1, {from: victor});

        // vote for brr camp, id: 12
        // mike & victor voted for option 1, so it is the winning option
        await daoContract.vote(12, 1, {from: mike});
        await daoContract.vote(12, 1, {from: victor});

        await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], minCampPeriod);

        // delay until epoch 12
        currentBlock = await Helper.getCurrentBlock();
        await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 11 * epochPeriod + startBlock - currentBlock);
        Helper.assertEqual(12, await daoContract.getCurrentEpochNumber());

        // make a first trade and check data changes as expected
        // no trade at epoch 11, so can not update new data for DAO from previous network fee + brr camps
        await tradeAndCheckDataChangesAsExpected(
            12, // epoch
            curNetworkFee, // new network fee
            curBrrData.rewardBPS, // new reward
            curBrrData.rebateBPS // new rebate
        );

        // camps shouldn't be concluded
        let winningOptionData = await daoContract.getWinningOptionData(11);
        Helper.assertEqual(false, winningOptionData.hasConcluded);
        Helper.assertEqual(0, winningOptionData.winningOptionID);
        winningOptionData = await daoContract.getWinningOptionData(12);
        Helper.assertEqual(false, winningOptionData.hasConcluded);
        Helper.assertEqual(0, winningOptionData.winningOptionID);
    });
})

function mulPrecision(value) {
    return precisionUnits.mul(new BN(value));
}

function getDataFromRebateAndReward(rebate, reward) {
    let power128 = new BN(2).pow(new BN(128));
    return (new BN(rebate).mul(power128)).add(new BN(reward));
}
