const Helper = require("../helper.js");
const nwHelper = require("./networkHelper");
const BN = web3.utils.BN;
const { expectRevert } = require('@openzeppelin/test-helpers');

const MockKyberDao = artifacts.require("MockKyberDao.sol");
const FeeHandler = artifacts.require("KyberFeeHandler.sol");
const BurnKncSanityRate = artifacts.require("MockChainLinkSanityRate.sol");
const MultipleEpochRewardsClaimer = artifacts.require("MultipleEpochRewardsClaimer.sol");
const Token = artifacts.require("Token.sol");
const Proxy = artifacts.require("SimpleKyberProxy.sol");
const {BPS, precisionUnits, ethDecimals, ethAddress, zeroAddress, zeroBN} = require("../helper.js");
const { assert } = require("chai");

const blockTime = 16; // each block is mined after 16s
const KNC_DECIMALS = 18;
const BURN_BLOCK_INTERVAL = 3;

let proxy;
let admin;
let staker;
let daoSetter;
let daoOperator;
let mockKyberDao;
let knc;
let feeHandler;
let rewardsClaimer;

let rewardInBPS = new BN(8000);
let rebateInBPS = new BN(1000);
let stakerPercentageInPrecision;
let epoch;
let expiryTimestamp;

let rebateWallets = [];
let rebateBpsPerWallet = [];
let platformWallet;
let oneEth = new BN(10).pow(new BN(ethDecimals));
let oneKnc = new BN(10).pow(new BN(KNC_DECIMALS));

let ethWeiToBurn = oneEth.mul(new BN(2)); // 2 eth

let ethToKncPrecision = precisionUnits.div(new BN(200)); // 1 eth --> 200 knc
let kncToEthPrecision = precisionUnits.mul(new BN(200));

let result;

contract('KyberFeeHandlerWrapper', function(accounts) {
    before("Setting global variables", async() => {
        staker = accounts[8];
        daoSetter = accounts[1];
        daoOperator = accounts[2];
        admin = accounts[3];

        platformWallet = accounts[1];
        rebateWallets.push(accounts[1]);
        rebateBpsPerWallet = [BPS];

        proxy = await Proxy.new();
        kyberNetwork = accounts[7];

        // deploy token
        knc = await Token.new("KyberNetworkCrystal", "KNC", KNC_DECIMALS);

        await knc.transfer(proxy.address, oneKnc.mul(new BN(100000)));
        await Helper.sendEtherWithPromise(accounts[9], proxy.address, oneEth.mul(new BN(100)));

        // for burning KNC
        await proxy.setPairRate(ethAddress, knc.address, ethToKncPrecision);
        await proxy.setPairRate(knc.address, ethAddress, kncToEthPrecision);

        // setup sanity rate for ethFeeHandler
        sanityRate = await BurnKncSanityRate.new();
        await sanityRate.setLatestKncToEthRate(kncToEthPrecision);
    });

    describe("test getUnclaimedEpochs function", async() => {
        let initialEpoch;
        let currentEpoch;
        let numEpochs = 3;

        beforeEach("setup dao, feehandler and rewardsClaimer", async() => {
            // setup mockKyberDao
            epoch = new BN(0);
            expiryTimestamp = new BN(5);
            mockKyberDao = await MockKyberDao.new(
                rewardInBPS,
                rebateInBPS,
                epoch,
                expiryTimestamp
            );
    
            stakerPercentageInPrecision = precisionUnits.mul(rewardInBPS).div(BPS);
            await mockKyberDao.setStakerPercentageInPrecision(stakerPercentageInPrecision);
    
            // setup feeHandler
            feeHandler = await FeeHandler.new(daoSetter, proxy.address, kyberNetwork, knc.address, BURN_BLOCK_INTERVAL, daoOperator);
            await feeHandler.setDaoContract(mockKyberDao.address, {from: daoSetter})
            await feeHandler.setBurnConfigParams(sanityRate.address, ethWeiToBurn, {from: daoOperator});
            await feeHandler.getBRR();
    
            // setup rewardsClaimer
            rewardsClaimer = await MultipleEpochRewardsClaimer.new(mockKyberDao.address, admin);
        });

        it("should return empty array if initial epoch is 0", async() => {
            result = await rewardsClaimer.getUnclaimedEpochs(feeHandler.address, staker);
            Helper.assertEqual(result.length, zeroBN, "result not empty");
        });

        it("should return empty array if no fees were allocated to staker", async() => {
            await mockKyberDao.setStakerPercentageInPrecision(zeroBN);
            initialEpoch = (await mockKyberDao.epoch()).toNumber();
            await sendFeesToFeeHandler(mockKyberDao, feeHandler, numEpochs);
            currentEpoch = (await mockKyberDao.epoch()).toNumber();
    
            result = await rewardsClaimer.getUnclaimedEpochs(feeHandler.address, staker);
            Helper.assertEqual(result.length, zeroBN, "result not empty");
            await mockKyberDao.setStakerPercentageInPrecision(stakerPercentageInPrecision);
        });

        it("should return all unclaimed epochs for staker", async() => {
            let numEpochs = 15;
            initialEpoch = (await mockKyberDao.epoch()).toNumber();
            await sendFeesToFeeHandler(mockKyberDao, feeHandler, numEpochs);
            currentEpoch = (await mockKyberDao.epoch()).toNumber();
    
            result = await rewardsClaimer.getUnclaimedEpochs(feeHandler.address, zeroAddress);
            Helper.assertEqual(result.length, numEpochs, "result.length != numEpochs");
        });

        it("should return unclaimed epochs if staker claimed for some epochs", async() => {
            let numEpochs = 5;
            initialEpoch = (await mockKyberDao.epoch()).toNumber();
            await sendFeesToFeeHandler(mockKyberDao, feeHandler, numEpochs);
            currentEpoch = (await mockKyberDao.epoch()).toNumber();

            // claim epochs 2 and 3
            await feeHandler.claimStakerReward(staker, 2);
            await feeHandler.claimStakerReward(staker, 3);
            result = await rewardsClaimer.getUnclaimedEpochs(feeHandler.address, staker);
            Helper.assertEqualArray(result, [0,1,4], "result != expected unclaimed epochs");
        });
    });

    describe("test claimMultipleRewards", async() => {
        let initialEpoch;
        let currentEpoch;
        let numEpochs = 3;

        before("setup dao, feehandler and rewardsClaimer", async() => {
            // setup mockKyberDao
            epoch = new BN(0);
            expiryTimestamp = new BN(5);
            mockKyberDao = await MockKyberDao.new(
                rewardInBPS,
                rebateInBPS,
                epoch,
                expiryTimestamp
            );
    
            stakerPercentageInPrecision = precisionUnits.mul(rewardInBPS).div(BPS);
            await mockKyberDao.setStakerPercentageInPrecision(stakerPercentageInPrecision);
    
            // setup feeHandler
            feeHandler = await FeeHandler.new(daoSetter, proxy.address, kyberNetwork, knc.address, BURN_BLOCK_INTERVAL, daoOperator);
            await feeHandler.setDaoContract(mockKyberDao.address, {from: daoSetter})
            await feeHandler.setBurnConfigParams(sanityRate.address, ethWeiToBurn, {from: daoOperator});
            await feeHandler.getBRR();
    
            // setup rewardsClaimer
            rewardsClaimer = await MultipleEpochRewardsClaimer.new(mockKyberDao.address, admin);
        });

        beforeEach("send fees for numEpochs", async() => {
            initialEpoch = (await mockKyberDao.epoch()).toNumber();
            await sendFeesToFeeHandler(mockKyberDao, feeHandler, numEpochs);
            currentEpoch = (await mockKyberDao.epoch()).toNumber();
        });

        it("should not do anything if empty array is passed", async() => {
            let stakerBalance = await Helper.getBalancePromise(staker);
            await rewardsClaimer.claimMultipleRewards(feeHandler.address, [], {from: staker});
            Helper.assertLesser(await Helper.getBalancePromise(staker), stakerBalance, "staker balance changed");
        });

        it("should claim for 1 epoch", async() => {
            let stakerBalance = await Helper.getBalancePromise(staker);
            await rewardsClaimer.claimMultipleRewards(feeHandler.address, [initialEpoch], {from: staker});
            Helper.assertGreater(await Helper.getBalancePromise(staker), stakerBalance, "staker balance did not increase");
            assert.isTrue(await feeHandler.hasClaimedReward(staker, initialEpoch));
        });

        it("should claim for multiple epochs", async() => {
            let stakerBalance = await Helper.getBalancePromise(staker);
            await rewardsClaimer.claimMultipleRewards(feeHandler.address, [initialEpoch, currentEpoch - 2, currentEpoch - 1], {from: staker});
            Helper.assertGreater(await Helper.getBalancePromise(staker), stakerBalance, "staker balance did not increase");
            assert.isTrue(await feeHandler.hasClaimedReward(staker, initialEpoch));
            assert.isTrue(await feeHandler.hasClaimedReward(staker, currentEpoch - 2));
            assert.isTrue(await feeHandler.hasClaimedReward(staker, currentEpoch - 1));
        });

        it("should be able to claim for 12 epochs", async() => {
            let stakerBalance = await Helper.getBalancePromise(staker);
            let numEpochs = 12;
            initialEpoch = (await mockKyberDao.epoch()).toNumber();
            await sendFeesToFeeHandler(mockKyberDao, feeHandler, numEpochs);
            let claimArray = [];
            for (let i = initialEpoch; i < initialEpoch + 12; i++) {
                claimArray.push(i);
            }
            await rewardsClaimer.claimMultipleRewards(feeHandler.address, claimArray, {from: staker});
            Helper.assertGreater(await Helper.getBalancePromise(staker), stakerBalance, "staker balance did not increase");
            for (let i = initialEpoch; i < initialEpoch + 12; i++) {
                assert.isTrue(await feeHandler.hasClaimedReward(staker, i));
            }
            Helper.assertGreater(await Helper.getBalancePromise(staker), stakerBalance, "staker balance did not increase");
        });

        it("should revert for invalid feeHandler address", async() => {
            await expectRevert.unspecified(
                rewardsClaimer.claimMultipleRewards(staker, [initialEpoch], {from: staker})
            );
        });
    });
});

async function sendFeesToFeeHandler(dao, feeHandler, numEpochs) {
    for (let i = 0; i < numEpochs; i++) {
        sendVal = oneEth.add(oneEth);
        await feeHandler.handleFees(ethAddress, rebateWallets, rebateBpsPerWallet, platformWallet, oneEth, oneEth, {from: kyberNetwork, value: sendVal});
        // advance by 1 epoch
        await advanceEpoch(dao, 1);
    }
}

async function advanceEpoch(dao, numEpochs) {
    for (let i = 0; i < numEpochs; i++) {
        await dao.advanceEpoch();
        await Helper.mineNewBlockAfter(blocksToSeconds((await dao.epochPeriod()).toNumber()));
    }
}

const blocksToSeconds = function(blocks) {
    return blocks * blockTime;
};
