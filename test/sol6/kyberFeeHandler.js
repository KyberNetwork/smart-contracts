const Helper = require("../helper.js");
const nwHelper = require("./networkHelper");
const BN = web3.utils.BN;

const MockKyberDao = artifacts.require("MockKyberDao.sol");
const BadKyberDao = artifacts.require("MaliciousKyberDao.sol");
const FeeHandler = artifacts.require("KyberFeeHandler.sol");
const BurnKncSanityRate = artifacts.require("MockChainLinkSanityRate.sol");
const BadFeeHandler = artifacts.require("MaliciousFeeHandler.sol");
const MockContractCallBurnKnc = artifacts.require("MockContractCallBurnKnc.sol");
const Token = artifacts.require("Token.sol");
const BadToken = artifacts.require("TestTokenNotReturn.sol");
const Proxy = artifacts.require("SimpleKyberProxy.sol");
const KyberNetworkProxy = artifacts.require("KyberNetworkProxy.sol");
const KyberNetwork = artifacts.require("KyberNetwork.sol");
const NoPayableFallback = artifacts.require("NoPayableFallback.sol");
const MatchingEngine = artifacts.require("KyberMatchingEngine.sol");
const ReentrancyFeeClaimer = artifacts.require("ReentrancyFeeClaimer.sol");
const MockStakerClaimRewardReentrancy = artifacts.require("MockStakerClaimRewardReentrancy.sol");

const {BPS, precisionUnits, ethDecimals, ethAddress, zeroAddress, zeroBN, MAX_RATE} = require("../helper.js");
const { expectEvent, expectRevert } = require('@openzeppelin/test-helpers');

const KNC_DECIMALS = 18;
const BURN_BLOCK_INTERVAL = 3;
const SANITY_RATE_DIFF = 1000; // 10%

let kyberNetwork;
let proxy;
let user;
let user2;
let daoSetter;
let daoOperator;
let mockKyberDao;
let knc;
let feeHandler;
let rewardInBPS = new BN(3000);
let rebateInBPS = new BN(5000);
let epoch;
let expiryTimestamp;
let sanityRate;

let ethToKncPrecision = precisionUnits.div(new BN(200)); // 1 eth --> 200 knc
let kncToEthPrecision = precisionUnits.mul(new BN(200));
let rebateWallets = [];
let oneKnc = new BN(10).pow(new BN(KNC_DECIMALS));
let oneEth = new BN(10).pow(new BN(ethDecimals));
let weiToBurn = precisionUnits.mul(new BN(2)); // 2 eth

contract('KyberFeeHandler', function(accounts) {
    before("Setting global variables", async() => {
        user = accounts[9];
        user2 = accounts[8];
        daoSetter = accounts[1];
        daoOperator = accounts[2];

        rebateWallets.push(accounts[1]);
        rebateWallets.push(accounts[2]);
        rebateWallets.push(accounts[3]);

        epoch = new BN(0);
        expiryTimestamp = new BN(5);
        mockKyberDao = await MockKyberDao.new(
            rewardInBPS,
            rebateInBPS,
            epoch,
            expiryTimestamp
        );

        proxy = await Proxy.new();
        kyberNetwork = accounts[7];

        knc = await Token.new("KyberNetworkCrystal", "KNC", KNC_DECIMALS);
        await knc.transfer(proxy.address, oneKnc.mul(new BN(10000)));
        await Helper.sendEtherWithPromise(accounts[9], proxy.address, oneEth.mul(new BN(100)));

        await proxy.setPairRate(ethAddress, knc.address, ethToKncPrecision);
        await proxy.setPairRate(knc.address, ethAddress, kncToEthPrecision);
    });

    beforeEach("Deploy new feeHandler instance", async() => {
        // deploy new sanity rate instance
        sanityRate = await BurnKncSanityRate.new();
        await sanityRate.setLatestKncToEthRate(kncToEthPrecision);

        feeHandler = await FeeHandler.new(daoSetter, proxy.address, kyberNetwork, knc.address, BURN_BLOCK_INTERVAL, daoOperator);
        await feeHandler.setDaoContract(mockKyberDao.address, {from: daoSetter});
        await feeHandler.setBurnConfigParams(sanityRate.address, weiToBurn, {from: daoOperator});
        await feeHandler.getBRR();
        await mockKyberDao.setFeeHandler(feeHandler.address);
    });

    describe("should test events declared in feeHandler", async() => {
        it("EthRecieved", async() =>{
            let txResult = await feeHandler.send(oneEth, {from: accounts[9]});
            expectEvent(txResult, 'EthReceived', {
                amount: oneEth
            });
        });

        it("FeeDistributed (no BRR)", async() => {
            let platformWallet = accounts[1];
            let txResult = await feeHandler.handleFees(ethAddress, [], [], platformWallet, oneEth, zeroBN, {from: kyberNetwork, value: oneEth});
            expectEvent(txResult, 'FeeDistributed', {
                token: ethAddress,
                platformWallet: platformWallet,
                platformFeeWei: oneEth,
                rewardWei: zeroBN,
                rebateWei: zeroBN,
                burnAmtWei: zeroBN
            });

            Helper.assertEqual(txResult.logs[0].args.rebateWallets.length, zeroBN, "unexpected rebate wallets length");
            Helper.assertEqual(txResult.logs[0].args.rebatePercentBpsPerWallet.length, zeroBN, "unexpected rebate percent bps length");
        });

        it("FeeDistributed (with BRR)", async() => {
            let platformWallet = accounts[1];
            let platformFeeWei = oneEth;
            let feeBRRWei = oneEth;
            let rebateBpsPerWallet = [new BN(2000), new BN(3000), new BN(5000)];
            let sendVal = platformFeeWei.add(feeBRRWei);
            const BRRData = await feeHandler.readBRRData();
            let currentRewardBps = BRRData.rewardBps;
            let currentRebateBps = BRRData.rebateBps;

            let txResult = await feeHandler.handleFees(ethAddress, rebateWallets, rebateBpsPerWallet, platformWallet, platformFeeWei, feeBRRWei, {from: kyberNetwork, value: sendVal});

            let expectedRewardWei = oneEth.mul(currentRewardBps).div(BPS);
            let expectedRebateWei = oneEth.mul(currentRebateBps).div(BPS);

            expectEvent(txResult, 'FeeDistributed', {
                token: ethAddress,
                platformWallet: platformWallet,
                platformFeeWei: oneEth,
                rewardWei: expectedRewardWei,
                rebateWei: expectedRebateWei,
                burnAmtWei: oneEth.sub(expectedRewardWei).sub(expectedRebateWei)
            });

            for (let i = 0; i < txResult.logs[1].args.rebateWallets.length; i++) {
                Helper.assertEqual(txResult.logs[1].args.rebateWallets[i], rebateWallets[i], "unexpected rebate wallet");
                Helper.assertEqual(txResult.logs[1].args.rebatePercentBpsPerWallet[i], rebateBpsPerWallet[i], "unexpected rebate percent bps");
            };
        });

        it("RewardPaid", async() => {
            feeHandler = await FeeHandler.new(daoSetter, proxy.address, kyberNetwork, knc.address, BURN_BLOCK_INTERVAL, daoOperator);
            let sendVal = oneEth;
            let rebateBpsPerWallet = [new BN(2000), new BN(3000), new BN(5000)];

            const BRRData = await feeHandler.readBRRData();
            let currentRewardBps = BRRData.rewardBps;
            let currentRebateBps = BRRData.rebateBps;
            let currentEpoch = BRRData.epoch;

            await callHandleFeeAndVerifyValues(
                sendVal, zeroAddress, 0, currentRebateBps, currentRewardBps, currentEpoch,
                    rebateWallets, rebateBpsPerWallet
                );

            mockKyberDao = await MockKyberDao.new(
                rewardInBPS,
                rebateInBPS,
                currentEpoch.add(new BN(1)),
                expiryTimestamp
            );
            await feeHandler.setDaoContract(mockKyberDao.address, {from: daoSetter});
            let rewardAmount = await feeHandler.rewardsPerEpoch(currentEpoch);

            let claim = precisionUnits.div(new BN(3));
            await mockKyberDao.setStakerPercentageInPrecision(claim);

            let txResult = await feeHandler.claimStakerReward(accounts[1], currentEpoch);

            await expectEvent(txResult, "RewardPaid", {
                staker: accounts[1],
                epoch: currentEpoch,
                token: ethAddress,
                amount: rewardAmount.mul(claim).div(precisionUnits)
            });

            // no event as already claimed
            txResult = await feeHandler.claimStakerReward(accounts[1], currentEpoch);
            Helper.assertEqual(0, txResult.receipt.logs.length);

            // no event if reward percentage = 0
            await mockKyberDao.setStakerPercentageInPrecision(0);
            txResult = await feeHandler.claimStakerReward(accounts[2], currentEpoch);
            Helper.assertEqual(0, txResult.receipt.logs.length);
        });

        it("RebatePaid", async() => {
            let sendVal = oneEth;
            let rebateBpsPerWallet = [new BN(2000), new BN(3000), new BN(5000)];
            const BRRData = await feeHandler.readBRRData();
            let currentRewardBps = BRRData.rewardBps;
            let currentRebateBps = BRRData.rebateBps;
            let currentEpoch = BRRData.epoch;

            expectedRebates = await callHandleFeeAndVerifyValues(
                sendVal, zeroAddress, 0, currentRebateBps, currentRewardBps, currentEpoch,
                    rebateWallets, rebateBpsPerWallet
                );

            let txResult = await feeHandler.claimReserveRebate(rebateWallets[0]);
            expectEvent(txResult, "RebatePaid", {
                rebateWallet: rebateWallets[0],
                token: ethAddress,
                amount: expectedRebates[0].sub(new BN(1))
            });
        });

        it("PlatformFeePaid", async() => {
            let sendVal = oneEth;
            let platformWallet = accounts[5];
            let platformFeeWei = new BN(50000);
            let rebateWallets = [];
            let rebateBpsPerWallet = [];
            const BRRData = await feeHandler.readBRRData();
            let currentRewardBps = BRRData.rewardBps;
            let currentRebateBps = BRRData.rebateBps;
            let currentEpoch = BRRData.epoch;

            await callHandleFeeAndVerifyValues(
                sendVal, platformWallet, platformFeeWei, currentRebateBps, currentRewardBps, currentEpoch,
                    rebateWallets, rebateBpsPerWallet
                );

            let txResult = await feeHandler.claimPlatformFee(platformWallet);
            expectEvent(txResult, "PlatformFeePaid", {
                platformWallet: platformWallet,
                token: ethAddress,
                amount: platformFeeWei.sub(new BN(1))
            });
        });

        it("KyberDaoAddressSet", async() => {
            feeHandler = await FeeHandler.new(daoSetter, proxy.address, kyberNetwork, knc.address, BURN_BLOCK_INTERVAL, daoOperator);
            let txResult = await feeHandler.setDaoContract(mockKyberDao.address, {from: daoSetter});
            expectEvent(txResult, "KyberDaoAddressSet", {
                kyberDao: mockKyberDao.address
            });
        });

        it("KncBurned", async() => {
            let networkFeeBps = new BN(25);
            let sendVal = oneEth.mul(new BN(30));
            let burnPerCall = await feeHandler.weiToBurn();
            let rebateBpsPerWallet = [new BN(2000), new BN(3000), new BN(5000)];
            const BRRData = await feeHandler.readBRRData();
            let currentRewardBps = BRRData.rewardBps;
            let currentRebateBps = BRRData.rebateBps;
            let currentEpoch = BRRData.epoch;

            await callHandleFeeAndVerifyValues(
                sendVal, zeroAddress, 0, currentRebateBps, currentRewardBps, currentEpoch,
                    rebateWallets, rebateBpsPerWallet
                );

            let txResult = await feeHandler.burnKnc();
            let expectedEthtoKncRate = (await proxy.getExpectedRate(ethAddress, knc.address, burnPerCall)).expectedRate;

            expectEvent(txResult, "KncBurned", {
                kncTWei: (burnPerCall.sub(burnPerCall.mul(networkFeeBps).div(BPS))).mul(expectedEthtoKncRate).div(precisionUnits),
                token: ethAddress,
                amount: burnPerCall
            });
        });

        it("RewardsRemovedToBurn", async() => {
            let sendVal = oneEth.mul(new BN(30));
            let rebateBpsPerWallet = [new BN(2000), new BN(3000), new BN(5000)];
            const BRRData = await feeHandler.readBRRData();
            let currentRewardBps = BRRData.rewardBps;
            let currentRebateBps = BRRData.rebateBps;
            let currentEpoch = BRRData.epoch;

            await callHandleFeeAndVerifyValues(
                sendVal, zeroAddress, 0, currentRebateBps, currentRewardBps, currentEpoch,
                    rebateWallets, rebateBpsPerWallet
                );
            await mockKyberDao.setShouldBurnRewardTrue(currentEpoch);
            let expectedRewardAmount = await feeHandler.rewardsPerEpoch(currentEpoch);

            let txResult = await feeHandler.makeEpochRewardBurnable(currentEpoch);
            expectEvent(txResult, "RewardsRemovedToBurn", {
                epoch: currentEpoch,
                rewardsWei: expectedRewardAmount
            });
        });

        it("BurnConfigSet", async() => {
            let txResult = await feeHandler.setBurnConfigParams(sanityRate.address, weiToBurn, {from: daoOperator});
            expectEvent(txResult, "BurnConfigSet", {
                sanityRate: sanityRate.address,
                weiToBurn: weiToBurn
            });
            txResult = await feeHandler.setBurnConfigParams(sanityRate.address, new BN(10000), {from: daoOperator});
            expectEvent(txResult, "BurnConfigSet", {
                sanityRate: sanityRate.address,
                weiToBurn: new BN(10000)
            });
            await feeHandler.setBurnConfigParams(sanityRate.address, weiToBurn, {from: daoOperator});
        });
    });

    describe("should test null values in ctor arguments", async() => {
        it("daoSetter 0", async() => {
            await expectRevert(
                FeeHandler.new(zeroAddress, proxy.address, kyberNetwork, knc.address, BURN_BLOCK_INTERVAL, daoOperator),
                "daoSetter 0"
            );
        });

        it("proxy 0", async() => {
            await expectRevert(
                FeeHandler.new(daoSetter, zeroAddress, kyberNetwork, knc.address, BURN_BLOCK_INTERVAL, daoOperator),
                "kyberNetworkProxy 0"
            );
        });

        it("network 0", async() => {
            await expectRevert(
                FeeHandler.new(daoSetter, proxy.address, zeroAddress, knc.address, BURN_BLOCK_INTERVAL, daoOperator),
                "kyberNetwork 0"
            );
        });

        it("knc 0", async() => {
            await expectRevert(
                FeeHandler.new(daoSetter, proxy.address, kyberNetwork, zeroAddress, BURN_BLOCK_INTERVAL, daoOperator),
                "knc 0"
            );
        });

        it("burnBlockInterval 0", async() => {
            await expectRevert(
                FeeHandler.new(daoSetter, proxy.address, kyberNetwork, knc.address, zeroBN, daoOperator),
                "_burnBlockInterval 0"
            );
        });

        it("daoOperator 0", async() => {
            await expectRevert(
                FeeHandler.new(daoSetter, proxy.address, kyberNetwork, knc.address, BURN_BLOCK_INTERVAL, zeroAddress),
                "daoOperator is 0"
            );
        });
    });

    it("test read BRR function", async() => {
        let results = await feeHandler.readBRRData();
        // console.log(results);
        Helper.assertEqual(results.rewardBps, rewardInBPS, "Actual decoded rewardInBPS is not correct");
        Helper.assertEqual(results.rebateBps, rebateInBPS, "Actual decoded rebateInBPS is not correct");
        Helper.assertEqual(results.expiryTimestamp, expiryTimestamp, "Actual decoded expiryTimestamp is not correct");
        Helper.assertEqual(results.epoch, epoch, "Actual decoded epoch is not correct");
    });

    describe("test getBRR and updateBRRData functions", async() => {
        let defaultEpoch;
        let defaultExpiryTimestamp;

        before("init variables", async() => {
            defaultEpoch = zeroBN;
            defaultExpiryTimestamp = new BN(5);
            await mockKyberDao.setMockBRR(rewardInBPS, rebateInBPS);
            await mockKyberDao.setMockEpochAndExpiryTimestamp(defaultEpoch, defaultExpiryTimestamp);
        });

        afterEach("reset to default BRR values", async() => {
            await mockKyberDao.setMockBRR(rewardInBPS, rebateInBPS);
            await mockKyberDao.setMockEpochAndExpiryTimestamp(defaultEpoch, defaultExpiryTimestamp);
        });

        after("set default values", async() => {
            let results = await feeHandler.readBRRData();
            rewardBps = results.rewardBps;
            rebateBps = results.rebateBps;
            expiryTimestamp = results.expiryTimestamp;
            epoch = results.epoch;
        });

        it("should revert if burnBps causes overflow", async() => {
            let badKyberDao = await BadKyberDao.new(rewardInBPS, rebateInBPS, epoch, expiryTimestamp);
            feeHandler = await FeeHandler.new(daoSetter, proxy.address, kyberNetwork, knc.address, BURN_BLOCK_INTERVAL, daoOperator);
            await feeHandler.setDaoContract(badKyberDao.address, {from: daoSetter});
            await badKyberDao.setFeeHandler(feeHandler.address);
            await badKyberDao.setMockBRR(new BN(2).pow(new BN(256)).sub(new BN(1)), BPS, new BN(1));
            await expectRevert.unspecified(
                feeHandler.getBRR()
            );
        });

        it("should revert if rewardBps causes overflow", async() => {
            let badKyberDao = await BadKyberDao.new(rewardInBPS, rebateInBPS, epoch, expiryTimestamp);
            feeHandler = await FeeHandler.new(daoSetter, proxy.address, kyberNetwork, knc.address, BURN_BLOCK_INTERVAL, daoOperator);
            await feeHandler.setDaoContract(badKyberDao.address, {from: daoSetter});
            await badKyberDao.setFeeHandler(feeHandler.address);
            await badKyberDao.setMockBRR(BPS, new BN(2).pow(new BN(256)).sub(new BN(1)), new BN(1));
            await expectRevert.unspecified(
                feeHandler.getBRR()
            );
        });

        it("should revert if rebateBps overflows", async() => {
            let badKyberDao = await BadKyberDao.new(rewardInBPS, rebateInBPS, epoch, expiryTimestamp);
            feeHandler = await FeeHandler.new(daoSetter, proxy.address, kyberNetwork, knc.address, BURN_BLOCK_INTERVAL, daoOperator);
            await feeHandler.setDaoContract(badKyberDao.address, {from: daoSetter});
            await badKyberDao.setFeeHandler(feeHandler.address);
            await badKyberDao.setMockBRR(BPS, new BN(1), new BN(2).pow(new BN(256)).sub(new BN(1)));
            await expectRevert.unspecified(
                feeHandler.getBRR()
            );
        });

        it("should revert if bad BRR values are returned", async() => {
            let badKyberDao = await BadKyberDao.new(rewardInBPS, rebateInBPS, epoch, expiryTimestamp);
            feeHandler = await FeeHandler.new(daoSetter, proxy.address, kyberNetwork, knc.address, BURN_BLOCK_INTERVAL, daoOperator);
            await feeHandler.setDaoContract(badKyberDao.address, {from: daoSetter});
            await badKyberDao.setFeeHandler(feeHandler.address);
            await badKyberDao.setMockBRR(zeroBN, zeroBN, zeroBN);
            await expectRevert(
                feeHandler.getBRR(),
                "Bad BRR values"
            );
        });

        it("should revert if expiry timestamp >= 2 ** 64", async() => {
            let badExpiryTimestamp = new BN(2).pow(new BN(64));
            await mockKyberDao.setMockEpochAndExpiryTimestamp(defaultEpoch, badExpiryTimestamp);
            await expectRevert(
                feeHandler.getBRR(),
                "expiry timestamp overflow"
            );

            badExpiryTimestamp = badExpiryTimestamp.add(new BN(1));
            await mockKyberDao.setMockEpochAndExpiryTimestamp(defaultEpoch, badExpiryTimestamp);
            await expectRevert(
                feeHandler.getBRR(),
                "expiry timestamp overflow"
            );
        });

        it("should revert if epoch >= 2 ** 32", async() => {
            let badEpoch = new BN(2).pow(new BN(32));
            await mockKyberDao.setMockEpochAndExpiryTimestamp(badEpoch, defaultExpiryTimestamp);
            await expectRevert(
                feeHandler.getBRR(),
                "epoch overflow"
            );

            badEpoch = badEpoch.add(new BN(1));
            await mockKyberDao.setMockEpochAndExpiryTimestamp(badEpoch, defaultExpiryTimestamp);
            await expectRevert(
                feeHandler.getBRR(),
                "epoch overflow"
            );
        });

        it("should have updated BRR if epoch == 2 ** 32 - 1", async() => {
            let maxEpoch = (new BN(2).pow(new BN(32))).sub(new BN(1));
            await mockKyberDao.setMockEpochAndExpiryTimestamp(maxEpoch, defaultExpiryTimestamp);
            await feeHandler.getBRR();
            let result = await feeHandler.readBRRData();
            Helper.assertEqual(result.epoch, maxEpoch, "epoch was not updated");
        });

        it("should have updated BRR if expiryTimestamp == 2 ** 64 - 1", async() => {
            let maxExpiryTimestamp = new BN(2).pow(new BN(64)).sub(new BN(1));
            await mockKyberDao.setMockEpochAndExpiryTimestamp(defaultEpoch, maxExpiryTimestamp);
            let txResult = await feeHandler.getBRR();
            expectEvent(txResult, "BRRUpdated", {
                rewardBps: rewardInBPS,
                rebateBps: rebateInBPS,
                epoch: epoch,
                expiryTimestamp: maxExpiryTimestamp,
            })
            let result = await feeHandler.readBRRData();
            Helper.assertEqual(result.expiryTimestamp, maxExpiryTimestamp, "expiry timestamp was not updated");
        });
    });

    describe("test permissions: onlyKyberDao, onlyKyberNetwork, only dao setter", async() => {
        it("reverts handleFees if called by non-network", async() => {
            let platformWallet = accounts[1];
            await expectRevert(
                feeHandler.handleFees(ethAddress, [], [], platformWallet, oneEth, zeroBN, {from: user, value: oneEth}),
                "only kyberNetwork"
            );
        });

        it("reverts if non-KyberDao setter tries to set KyberDao contract", async() => {
            await expectRevert(
                feeHandler.setDaoContract(mockKyberDao.address, {from: user}),
                "only daoSetter"
            );
        });
    });

    describe("test handle fees and claiming rebate / reward / fee", async() => {
        let currentRewardBps;
        let currentRebateBps;
        let currentEpoch;
        let curentExpiryTimestamp;

        let rebateBpsPerWallet = [new BN(2000), new BN(3000), new BN(5000)];

        beforeEach("set BRR data", async() => {
            const BRRData = await feeHandler.readBRRData();
            currentRewardBps = BRRData.rewardBps;
            currentRebateBps = BRRData.rebateBps;
            currentEpoch = BRRData.epoch;
        });

        it("test total rebates total rewards updated correctly", async() => {
            const platformWallet = accounts[1];
            const platformFeeWei = zeroBN;
            const feeBRRWei = oneEth;
            let sendVal = platformFeeWei.add(feeBRRWei);

            await feeHandler.handleFees(ethAddress, rebateWallets, rebateBpsPerWallet , platformWallet, platformFeeWei, feeBRRWei,
                {from: kyberNetwork, value: sendVal});

            let expectedTotalReward = sendVal.mul(currentRewardBps).div(BPS);
            let expectedRebate = sendVal.mul(currentRebateBps).div(BPS);
            let expectedTotalRebate = new BN(0);
            for(let i = 0; i < rebateBpsPerWallet.length; i++) {
                expectedTotalRebate.iadd((new BN(rebateBpsPerWallet[i])).mul(expectedRebate).div(BPS));
            }

            let expectedTotalPayOut = expectedTotalReward.add(expectedTotalRebate);
            let totalPayOutBalance = await feeHandler.totalPayoutBalance();
            Helper.assertEqual(expectedTotalPayOut, totalPayOutBalance);

            sendVal = oneEth.div(new BN(33));
            await feeHandler.handleFees(ethAddress, rebateWallets, rebateBpsPerWallet , platformWallet, platformFeeWei, sendVal,
                {from: kyberNetwork, value: sendVal});

            expectedTotalReward = expectedTotalReward.add(sendVal.mul(currentRewardBps).div(BPS));
            expectedRebate = sendVal.mul(currentRebateBps).div(BPS);
            let totalPaidRebate = new BN(0);

            for(let i = 0; i < rebateBpsPerWallet.length; i++) {
                let paidRebate = (new BN(rebateBpsPerWallet[i])).mul(expectedRebate).div(BPS);
                expectedTotalRebate.iadd(paidRebate);
                totalPaidRebate = totalPaidRebate.add(paidRebate);
            }

            //whatever wasn't paid for rebates to wallets due to rounding errors, will be added to reward amount
            expectedTotalReward = expectedTotalReward.add(expectedRebate.sub(totalPaidRebate));
            expectedTotalPayOut = expectedTotalReward.add(expectedTotalRebate);
            totalPayOutBalance = await feeHandler.totalPayoutBalance();
            Helper.assertEqual(expectedTotalPayOut, totalPayOutBalance);
        });

        it("reverts if token is not ETH when calling handleFees", async() => {
            let platformWallet = accounts[9];
            let platformFeeWei = oneEth;
            let feeBRRWei = oneEth;
            let sendVal = platformFeeWei.add(feeBRRWei);
            await expectRevert(
                feeHandler.handleFees(knc.address, [], [] , platformWallet, platformFeeWei, feeBRRWei,
                    {from: kyberNetwork, value: sendVal}),
                "token not eth"
            );
        });

        it("reverts if sendVal != total fees when calling handleFees", async() => {
            let platformWallet = accounts[9];
            let platformFeeWei = oneEth;
            let feeBRRWei = oneEth.add(new BN(1));
            let sendVal = platformFeeWei;
            await expectRevert(
                feeHandler.handleFees(ethAddress, [], [] , platformWallet, platformFeeWei, feeBRRWei,
                    {from: kyberNetwork, value: sendVal}),
                "msg.value not equal to total fees"
            );

            sendVal = feeBRRWei;
            await expectRevert(
                feeHandler.handleFees(ethAddress, [], [] , platformWallet, platformFeeWei, feeBRRWei,
                    {from: kyberNetwork, value: sendVal}),
                "msg.value not equal to total fees"
            );

            // send excess ETH
            sendVal = feeBRRWei.mul(new BN(3));
            await expectRevert(
                feeHandler.handleFees(ethAddress, [], [] , platformWallet, platformFeeWei, feeBRRWei,
                    {from: kyberNetwork, value: sendVal}),
                "msg.value not equal to total fees"
            );
        });

        it("test rebate per wallet and rewards per epoch updated correctly", async() => {
            let sendVal = oneEth;

            await callHandleFeeAndVerifyValues(
                sendVal, zeroAddress, 0, currentRebateBps, currentRewardBps, currentEpoch,
                    rebateWallets, rebateBpsPerWallet
                );

            sendVal = oneEth.div(new BN(333));

            await callHandleFeeAndVerifyValues(
                sendVal, zeroAddress, 0, currentRebateBps, currentRewardBps, currentEpoch,
                    rebateWallets, rebateBpsPerWallet
                );
        });

        it("test rebate per wallet and rewards per epoch updated correctly when total rebateBpsPerWallet is not BPS", async() => {
            let rebateBpsPerWallet = [new BN(2000), new BN(3000), new BN(4000)];
            let sendVal = oneEth;

            await callHandleFeeAndVerifyValues(
                sendVal, zeroAddress, 0, currentRebateBps, currentRewardBps, currentEpoch,
                    rebateWallets, rebateBpsPerWallet
                );

            sendVal = oneEth.div(new BN(333));

            await callHandleFeeAndVerifyValues(
                sendVal, zeroAddress, 0, currentRebateBps, currentRewardBps, currentEpoch,
                    rebateWallets, rebateBpsPerWallet
                );
        });

        describe("reserve rebate", async() => {
            it("claim rebate see sent to wallet", async() => {
                let sendVal = new BN(0);
                let walletsEth = [];

                let expectedRebates = await callHandleFeeAndVerifyValues(
                    sendVal, zeroAddress, 0, currentRebateBps, currentRewardBps, currentEpoch,
                        rebateWallets, rebateBpsPerWallet
                    );


                for (let i = 0; i < rebateWallets.length; i++) {
                    walletsEth[i] = new BN(await Helper.getBalancePromise(rebateWallets[i]));
                }
                sendVal = oneEth;
                expectedRebates = await callHandleFeeAndVerifyValues(
                    sendVal, zeroAddress, 0, currentRebateBps, currentRewardBps, currentEpoch,
                        rebateWallets, rebateBpsPerWallet
                    );

                let expectedBalance = [];
                for (let i = 0; i < rebateWallets.length; i++) {
                    await feeHandler.claimReserveRebate(rebateWallets[i]);
                    expectedBalance[i] = walletsEth[i].add(expectedRebates[i]).sub(new BN(1));
                    walletsEth[i] = new BN(await Helper.getBalancePromise(rebateWallets[i]));
                    Helper.assertEqual(walletsEth[i], expectedBalance[i]);
                    expectedRebates[i] = new BN(1);
                }

                sendVal = oneEth.div(new BN(333));

                expectedRebates = await callHandleFeeAndVerifyValues(
                    sendVal, zeroAddress, 0, currentRebateBps, currentRewardBps, currentEpoch,
                        rebateWallets, rebateBpsPerWallet
                    );
            });

            it("claim rebate see total payout balance updated", async() => {
                let sendVal = new BN(0);

                sendVal = oneEth;
                expectedRebates = await callHandleFeeAndVerifyValues(
                    sendVal, zeroAddress, 0, currentRebateBps, currentRewardBps, currentEpoch,
                        rebateWallets, rebateBpsPerWallet
                    );


                let totalPayOutBalanceBefore = await feeHandler.totalPayoutBalance();

                for (let i = 0; i < rebateWallets.length; i++) {
                    await feeHandler.claimReserveRebate(rebateWallets[i]);
                    let expectedTotalPayOut = totalPayOutBalanceBefore.sub(expectedRebates[i]).add(new BN(1));
                    let totalPayOutBalance = await feeHandler.totalPayoutBalance();
                    Helper.assertEqual(expectedTotalPayOut, totalPayOutBalance);
                    totalPayOutBalanceBefore = expectedTotalPayOut;
                }
            });

            it("reverts if reserve has no rebate to claim", async() => {
                await expectRevert(
                    feeHandler.claimReserveRebate(user),
                    "no rebate to claim"
                );
            });

            it("reverts if rebate wallet is non-payable contract", async() => {
                let sendVal = oneEth;
                let rebateWallet = await NoPayableFallback.new();
                let rebateBpsPerWallet = [BPS];
                const BRRData = await feeHandler.readBRRData();
                let currentRewardBps = BRRData.rewardBps;
                let currentRebateBps = BRRData.rebateBps;
                let currentEpoch = BRRData.epoch;

                expectedRebates = await callHandleFeeAndVerifyValues(
                    sendVal, zeroAddress, 0, currentRebateBps, currentRewardBps, currentEpoch,
                    [rebateWallet.address], rebateBpsPerWallet
                    );

                await expectRevert(
                    feeHandler.claimReserveRebate(rebateWallet.address),
                    "rebate transfer failed"
                );
            });

            it("reverts if totalPayoutBalance < amount", async() => {
                const platformWallet = accounts[1];
                const platformFeeWei = zeroBN;
                let feeBRRWei = oneEth;
                let sendVal = platformFeeWei.add(feeBRRWei);
                feeHandler = await BadFeeHandler.new(daoSetter, proxy.address, kyberNetwork, knc.address, BURN_BLOCK_INTERVAL, daoOperator);

                await feeHandler.handleFees(ethAddress, rebateWallets, rebateBpsPerWallet , platformWallet, platformFeeWei, feeBRRWei,
                {from: kyberNetwork, value: sendVal});

                await feeHandler.setTotalPayoutBalance(zeroBN);
                await expectRevert.unspecified(
                    feeHandler.claimReserveRebate(rebateWallets[0])
                );
            });
        });

        describe("staking rewards", async() => {
            beforeEach("init contracts before each test", async() => {
                feeHandler = await FeeHandler.new(daoSetter, proxy.address, kyberNetwork, knc.address, BURN_BLOCK_INTERVAL, daoOperator);

                const BRRData = await feeHandler.readBRRData();
                currentEpoch = BRRData.epoch;

                expiryTimestamp = await Helper.getCurrentBlockTime();

                mockKyberDao = await MockKyberDao.new(
                    rewardInBPS,
                    rebateInBPS,
                    currentEpoch,
                    expiryTimestamp
                );
                await feeHandler.setDaoContract(mockKyberDao.address, {from: daoSetter});
            });

            it("test reward per epoch updated correctly", async() => {
                let sendVal = oneEth;

                sendVal = oneEth;
                await callHandleFeeAndVerifyValues(
                    sendVal, zeroAddress, 0, currentRebateBps, currentRewardBps, currentEpoch,
                        rebateWallets, rebateBpsPerWallet
                    );

                let expectedRewardPerEpoch = sendVal.mul(currentRewardBps).div(BPS);
                let rewardPerEpoch = await feeHandler.rewardsPerEpoch(currentEpoch);
                Helper.assertEqual(expectedRewardPerEpoch, rewardPerEpoch);

                sendVal = oneEth.div(new BN(333));
                expectedRebates = await callHandleFeeAndVerifyValues(
                    sendVal, zeroAddress, 0, currentRebateBps, currentRewardBps, currentEpoch,
                        rebateWallets, rebateBpsPerWallet
                    );

                //above function also validates reward per eopch.
            });

            it("test reward per eopch updated when epoch advances", async() => {
                let sendVal = oneEth;

                await callHandleFeeAndVerifyValues(
                    sendVal, zeroAddress, 0, currentRebateBps, currentRewardBps, currentEpoch,
                        rebateWallets, rebateBpsPerWallet
                    );

                await mockKyberDao.advanceEpoch();
                await feeHandler.getBRR();
                const BRRData = await feeHandler.readBRRData();

                currentRewardBps = BRRData.rewardBps;
                currentRebateBps = BRRData.rebateBps;
                Helper.assertGreater(BRRData.epoch, currentEpoch);
                currentEpoch = BRRData.epoch;

                let rewardPerEpoch = await feeHandler.rewardsPerEpoch(currentEpoch);
                Helper.assertEqual(0, rewardPerEpoch);

                sendVal = oneEth.div(new BN(333));
                expectedRebates = await callHandleFeeAndVerifyValues(sendVal, zeroAddress, 0, currentRebateBps, currentRewardBps, currentEpoch,rebateWallets, rebateBpsPerWallet);

                //above function also validates reward per eopch.
            });

            it("claim reward and see total payout balance updated.", async() => {
                let sendVal = oneEth;

                await callHandleFeeAndVerifyValues(
                    sendVal, zeroAddress, 0, currentRebateBps, currentRewardBps, currentEpoch,
                        rebateWallets, rebateBpsPerWallet
                    );

                await mockKyberDao.advanceEpoch();
                let totalPayOutBalanceBefore = await feeHandler.totalPayoutBalance();
                let rewardAmount = await feeHandler.rewardsPerEpoch(currentEpoch);

                let claim = precisionUnits.div(new BN(3));
                await mockKyberDao.setStakerPercentageInPrecision(claim);
                await feeHandler.claimStakerReward(user, currentEpoch);

                let paidReward = rewardAmount.mul(claim).div(precisionUnits);

                let expectedTotalPayoutAfter = totalPayOutBalanceBefore.sub(paidReward);
                const totalPayOutBalance = await feeHandler.totalPayoutBalance();
                Helper.assertEqual(expectedTotalPayoutAfter, totalPayOutBalance);
            });

            it("claim reward and see paid so far updated.", async() => {
                let sendVal = oneEth;

                await callHandleFeeAndVerifyValues(
                    sendVal, zeroAddress, 0, currentRebateBps, currentRewardBps, currentEpoch,
                        rebateWallets, rebateBpsPerWallet
                    );

                await mockKyberDao.advanceEpoch();
                let rewardBefore = await feeHandler.rewardsPerEpoch(currentEpoch);
                let userBal = await Helper.getBalancePromise(user);

                let claim = precisionUnits.div(new BN(3));
                await mockKyberDao.setStakerPercentageInPrecision(claim);
                await feeHandler.claimStakerReward(user, currentEpoch); // full reward

                let paidSoFar = await feeHandler.rewardsPaidPerEpoch(currentEpoch);
                let userBalAfter = await Helper.getBalancePromise(user);

                let expectedPaid = rewardBefore.mul(claim).div(precisionUnits);
                Helper.assertEqual(paidSoFar, expectedPaid);
                Helper.assertEqual(userBalAfter, userBal.add(expectedPaid));
            });

            it("claim reward and see has claimed reward updated.", async() => {
                let sendVal = oneEth;

                await callHandleFeeAndVerifyValues(
                    sendVal, zeroAddress, 0, currentRebateBps, currentRewardBps, currentEpoch,
                        rebateWallets, rebateBpsPerWallet
                    );

                await mockKyberDao.advanceEpoch();
                Helper.assertEqual(false, await feeHandler.hasClaimedReward(user, currentEpoch));

                let claim = precisionUnits.div(new BN(3));
                await mockKyberDao.setStakerPercentageInPrecision(claim);
                await feeHandler.claimStakerReward(user, currentEpoch); // full reward

                Helper.assertEqual(true, await feeHandler.hasClaimedReward(user, currentEpoch));
            });

            it("claim reward, has claim reward data is not changed if staker has no reward", async() => {
                let sendVal = oneEth;

                await callHandleFeeAndVerifyValues(
                    sendVal, zeroAddress, 0, currentRebateBps, currentRewardBps, currentEpoch,
                        rebateWallets, rebateBpsPerWallet
                    );

                await mockKyberDao.advanceEpoch();
                let totalPayOutBalanceBefore = await feeHandler.totalPayoutBalance();

                await Helper.assertEqual(false, await feeHandler.hasClaimedReward(user, currentEpoch), "wrong default data");
                // set staker percentage is 0
                await mockKyberDao.setStakerPercentageInPrecision(0);
                await feeHandler.claimStakerReward(user, currentEpoch);
                await Helper.assertEqual(false, await feeHandler.hasClaimedReward(user, currentEpoch), "wrong data");

                let paidReward = zeroBN;

                let expectedTotalPayoutAfter = totalPayOutBalanceBefore.sub(paidReward);
                const totalPayOutBalance = await feeHandler.totalPayoutBalance();
                Helper.assertEqual(expectedTotalPayoutAfter, totalPayOutBalance);
            });

            it("claim reward is successful if has no reward, balance is still the same", async() => {
                let sendVal = oneEth;

                await callHandleFeeAndVerifyValues(
                    sendVal, zeroAddress, 0, currentRebateBps, currentRewardBps, currentEpoch,
                        rebateWallets, rebateBpsPerWallet
                    );

                await mockKyberDao.advanceEpoch();
                let totalPayOutBalanceBefore = await feeHandler.totalPayoutBalance();

                // set staker percentage is 0
                await mockKyberDao.setStakerPercentageInPrecision(0);
                await feeHandler.claimStakerReward(user, currentEpoch);

                let paidReward = zeroBN;

                let expectedTotalPayoutAfter = totalPayOutBalanceBefore.sub(paidReward);
                const totalPayOutBalance = await feeHandler.totalPayoutBalance();
                Helper.assertEqual(expectedTotalPayoutAfter, totalPayOutBalance);
            });

            it("claim reward is successful even staker has already claimed, balance is still the same", async() => {
                let sendVal = oneEth;

                await callHandleFeeAndVerifyValues(
                    sendVal, zeroAddress, 0, currentRebateBps, currentRewardBps, currentEpoch,
                        rebateWallets, rebateBpsPerWallet
                    );

                await mockKyberDao.advanceEpoch();
                let totalPayOutBalanceBefore = await feeHandler.totalPayoutBalance();

                let percentage = precisionUnits.div(new BN(3));
                await mockKyberDao.setStakerPercentageInPrecision(percentage);
                await feeHandler.claimStakerReward(user, currentEpoch);

                let rewardAmount = await feeHandler.rewardsPerEpoch(currentEpoch);
                let paidReward = percentage.mul(rewardAmount).div(precisionUnits);

                let expectedTotalPayoutAfter = totalPayOutBalanceBefore.sub(paidReward);
                let totalPayOutBalance = await feeHandler.totalPayoutBalance();
                Helper.assertEqual(expectedTotalPayoutAfter, totalPayOutBalance);

                totalPayOutBalanceBefore = expectedTotalPayoutAfter;

                // claim again
                await feeHandler.claimStakerReward(user, currentEpoch);

                paidReward = zeroBN;

                expectedTotalPayoutAfter = totalPayOutBalanceBefore.sub(paidReward);
                totalPayOutBalance = await feeHandler.totalPayoutBalance();

                Helper.assertEqual(expectedTotalPayoutAfter, totalPayOutBalance);
            });

            it("claim reward is successful for current epoch, balance and hasClaimedReward unchange", async() => {
                let sendVal = oneEth;

                await callHandleFeeAndVerifyValues(
                    sendVal, zeroAddress, 0, currentRebateBps, currentRewardBps, currentEpoch,
                        rebateWallets, rebateBpsPerWallet
                    );

                let totalPayOutBalanceBefore = await feeHandler.totalPayoutBalance();

                let percentage = precisionUnits.div(new BN(3));
                await mockKyberDao.setStakerPercentageInPrecision(percentage);
                await feeHandler.claimStakerReward(user, currentEpoch);

                Helper.assertEqual(false, await feeHandler.hasClaimedReward(user, currentEpoch));

                let paidReward = zeroBN;

                let expectedTotalPayoutAfter = totalPayOutBalanceBefore.sub(paidReward);
                let totalPayOutBalance = await feeHandler.totalPayoutBalance();
                Helper.assertEqual(expectedTotalPayoutAfter, totalPayOutBalance);
            });

            it("claim reward is successful for future epoch, hasClaimedReward unchange", async() => {
                let sendVal = oneEth;
                await callHandleFeeAndVerifyValues(
                    sendVal, zeroAddress, 0, currentRebateBps, currentRewardBps, currentEpoch,
                        rebateWallets, rebateBpsPerWallet
                    );
                let percentage = precisionUnits.div(new BN(3));
                await mockKyberDao.setStakerPercentageInPrecision(percentage);

                for(let i = 1; i < 4; i++) {
                    let epoch = currentEpoch.add(new BN(i));

                    Helper.assertEqual(false, await feeHandler.hasClaimedReward(user, epoch));

                    await feeHandler.claimStakerReward(user, epoch);

                    Helper.assertEqual(false, await feeHandler.hasClaimedReward(user, epoch));
                }
            });

            it("reverts if staker percentage is more than 100%", async() => {
                let sendVal = oneEth;

                await callHandleFeeAndVerifyValues(
                    sendVal, zeroAddress, 0, currentRebateBps, currentRewardBps, currentEpoch,
                        rebateWallets, rebateBpsPerWallet
                    );

                await mockKyberDao.advanceEpoch();
                let claim = precisionUnits.add(new BN(1));
                await mockKyberDao.setStakerPercentageInPrecision(claim);

                await expectRevert(
                    feeHandler.claimStakerReward(user, currentEpoch), // full reward
                    "percentage too high"
                );
            });

            it("reverts if staker is non-payable contract", async() => {
                let sendVal = oneEth;
                let badUser = await NoPayableFallback.new();
                await callHandleFeeAndVerifyValues(
                    sendVal, zeroAddress, 0, currentRebateBps, currentRewardBps, currentEpoch,
                        rebateWallets, rebateBpsPerWallet
                    );

                await mockKyberDao.advanceEpoch();
                let claim = precisionUnits.div(new BN(3));
                await mockKyberDao.setStakerPercentageInPrecision(claim);
                await expectRevert(
                    feeHandler.claimStakerReward(badUser.address, currentEpoch),
                    "staker rewards transfer failed"
                );
            });

            it("reverts if staker makes reentrant call when received eth", async() => {
                let sendVal = oneEth;
                let badStaker = await MockStakerClaimRewardReentrancy.new(feeHandler.address);
                await callHandleFeeAndVerifyValues(
                    sendVal, zeroAddress, 0, currentRebateBps, currentRewardBps, currentEpoch,
                        rebateWallets, rebateBpsPerWallet
                    );

                await mockKyberDao.advanceEpoch();
                let claim = precisionUnits.div(new BN(3));
                await mockKyberDao.setStakerPercentageInPrecision(claim);
                await expectRevert(
                    feeHandler.claimStakerReward(badStaker.address, currentEpoch),
                    "staker rewards transfer failed"
                );

                // Test staker not reentrant, should successfully claim reward
                let rewardAmount = await feeHandler.rewardsPerEpoch(currentEpoch);
                let paidReward = claim.mul(rewardAmount).div(precisionUnits);
                let totalPayOutBalanceBefore = await feeHandler.totalPayoutBalance();

                await badStaker.setIsTestingReentrancy(false);
                // not reentrant when receiving eth
                // should claim reward successfully
                await feeHandler.claimStakerReward(badStaker.address, currentEpoch);

                let expectedTotalPayoutAfter = totalPayOutBalanceBefore.sub(paidReward);
                const totalPayOutBalance = await feeHandler.totalPayoutBalance();
                Helper.assertEqual(expectedTotalPayoutAfter, totalPayOutBalance);
            });

            it("reverts if total percentage of all stakers more than 100%", async() => {
                let sendVal = oneEth;
                await callHandleFeeAndVerifyValues(
                    sendVal, zeroAddress, 0, currentRebateBps, currentRewardBps, currentEpoch,
                        rebateWallets, rebateBpsPerWallet
                    );

                await mockKyberDao.advanceEpoch();
                let claim = precisionUnits.div(new BN(3));
                await mockKyberDao.setStakerPercentageInPrecision(claim);
                // claim for 3 stakers, should be ok
                for(let i = 0; i < 3; i++) {
                    await feeHandler.claimStakerReward(accounts[i], currentEpoch);
                }

                // can not claim one more, total percentage > 100%
                // total payout balance < this last staker percentage
                await expectRevert.unspecified(
                    feeHandler.claimStakerReward(accounts[4], currentEpoch)
                )
            });

            it("reverts if totalPayoutBalance < stakerAmt", async() => {
                const platformWallet = accounts[1];
                const platformFeeWei = zeroBN;
                const feeBRRWei = oneEth;
                let sendVal = platformFeeWei.add(feeBRRWei);

                let claim = precisionUnits;

                feeHandler = await BadFeeHandler.new(daoSetter, proxy.address, kyberNetwork, knc.address, BURN_BLOCK_INTERVAL, daoOperator);

                const BRRData = await feeHandler.readBRRData();
                currentEpoch = BRRData.epoch;

                await feeHandler.handleFees(ethAddress, rebateWallets, rebateBpsPerWallet , platformWallet, platformFeeWei, feeBRRWei,
                {from: kyberNetwork, value: sendVal});

                await feeHandler.setTotalPayoutBalance(zeroBN);
                await feeHandler.setDaoContract(user, {from: daoSetter});
                await mockKyberDao.setStakerPercentageInPrecision(claim);

                await mockKyberDao.advanceEpoch();
                await expectRevert.unspecified(
                    feeHandler.claimStakerReward(user, currentEpoch, {from: user})
                );
            });

            it("reverts if get staker percentage from dao reverts", async() => {
                feeHandler = await FeeHandler.new(daoSetter, proxy.address, kyberNetwork, knc.address, BURN_BLOCK_INTERVAL, daoOperator);
                let sendVal = oneEth;
                let rebateBpsPerWallet = [new BN(2000), new BN(3000), new BN(5000)];

                const BRRData = await feeHandler.readBRRData();
                let currentRewardBps = BRRData.rewardBps;
                let currentRebateBps = BRRData.rebateBps;
                let currentEpoch = BRRData.epoch;

                await callHandleFeeAndVerifyValues(
                    sendVal, zeroAddress, 0, currentRebateBps, currentRewardBps, currentEpoch,
                        rebateWallets, rebateBpsPerWallet
                    );

                await feeHandler.setDaoContract(accounts[5], {from: daoSetter});

                await mockKyberDao.advanceEpoch();
                await expectRevert.unspecified(
                    feeHandler.claimStakerReward(user, currentEpoch, {from: user})
                );
            });
        });

        describe("platform fee", async() => {
            it("send platform fee (no rebates), see values updated", async() => {
                let sendVal = oneEth;
                let platformWallet = accounts[5];
                let platformFeeWei = new BN(50000);
                rebateWallets = []
                rebateBpsPerWallet = []

                let walletFee0 = await feeHandler.feePerPlatformWallet(platformWallet);

                await callHandleFeeAndVerifyValues(
                    sendVal, platformWallet, platformFeeWei, currentRebateBps, currentRewardBps, currentEpoch,
                        rebateWallets, rebateBpsPerWallet
                    );

                let expectedFeeValue = walletFee0.add(platformFeeWei);
                let walletFee1 = await feeHandler.feePerPlatformWallet(platformWallet);

                Helper.assertEqual(expectedFeeValue, walletFee1);

                sendVal = oneEth.div(new BN(333));

                await callHandleFeeAndVerifyValues(
                    sendVal, platformWallet, platformFeeWei, currentRebateBps, currentRewardBps, currentEpoch,
                        rebateWallets, rebateBpsPerWallet
                    );


                expectedFeeValue = walletFee1.add(platformFeeWei);
                let walletFee2 = await feeHandler.feePerPlatformWallet(platformWallet);

                Helper.assertEqual(expectedFeeValue, walletFee2);
            });


            it("send platform fee (and rebates), see values updated", async() => {
                let sendVal = oneEth;
                let platformWallet = accounts[5];
                let platformFeeWei = new BN(50000);

                let walletFee0 = await feeHandler.feePerPlatformWallet(platformWallet);

                await callHandleFeeAndVerifyValues(
                    sendVal, platformWallet, platformFeeWei, currentRebateBps, currentRewardBps, currentEpoch,
                        rebateWallets, rebateBpsPerWallet
                    );

                let expectedFeeValue = walletFee0.add(platformFeeWei);
                let walletFee1 = await feeHandler.feePerPlatformWallet(platformWallet);

                Helper.assertEqual(expectedFeeValue, walletFee1);

                sendVal = oneEth.div(new BN(333));

                await callHandleFeeAndVerifyValues(
                    sendVal, platformWallet, platformFeeWei, currentRebateBps, currentRewardBps, currentEpoch,
                        rebateWallets, rebateBpsPerWallet
                    );

                expectedFeeValue = walletFee1.add(platformFeeWei);
                let walletFee2 = await feeHandler.feePerPlatformWallet(platformWallet);

                Helper.assertEqual(expectedFeeValue, walletFee2);
            });

            it("send platform fee, claim, see values updated", async() => {
                let sendVal = oneEth;
                let platformWallet = accounts[5];
                let platformFeeWei = new BN(50000);
                rebateWallets = []
                rebateBpsPerWallet = []

                await callHandleFeeAndVerifyValues(
                    sendVal, platformWallet, platformFeeWei, currentRebateBps, currentRewardBps, currentEpoch,
                        rebateWallets, rebateBpsPerWallet
                    );

                let walletBalance0 = await Helper.getBalancePromise(platformWallet);

                // claim
                await feeHandler.claimPlatformFee(platformWallet);
                let walletFeeAfter = await feeHandler.feePerPlatformWallet(platformWallet);
                Helper.assertEqual(walletFeeAfter, 1);

                let walletBalance1 = await Helper.getBalancePromise(platformWallet);
                let expectedBalance = walletBalance0.add(platformFeeWei.sub(new BN(1)));

                Helper.assertEqual(walletBalance1, expectedBalance);
            });

            it("reverts if platformWallet has no fee to claim", async() => {
                await expectRevert(
                    feeHandler.claimPlatformFee(user),
                    "no fee to claim"
                );
            });

            it("reverts if platformWallet is non-payable contract", async() => {
                let sendVal = oneEth;
                let platformWallet = await NoPayableFallback.new();
                let platformFeeWei = new BN(50000);
                rebateWallets = []
                rebateBpsPerWallet = []

                await callHandleFeeAndVerifyValues(
                    sendVal, platformWallet.address, platformFeeWei, currentRebateBps, currentRewardBps, currentEpoch,
                        rebateWallets, rebateBpsPerWallet
                    );

                await expectRevert(
                    feeHandler.claimPlatformFee(platformWallet.address),
                    "platform fee transfer failed"
                );
            });

            it("reverts if totalPayoutBalance < platformFeeWei", async() => {
                const platformWallet = accounts[1];
                const platformFeeWei = new BN(50000);
                const feeBRRWei = oneEth;
                let sendVal = platformFeeWei.add(feeBRRWei);

                feeHandler = await BadFeeHandler.new(daoSetter, proxy.address, kyberNetwork, knc.address, BURN_BLOCK_INTERVAL, daoOperator);

                await feeHandler.handleFees(ethAddress, rebateWallets, rebateBpsPerWallet , platformWallet, platformFeeWei, feeBRRWei,
                {from: kyberNetwork, value: sendVal});

                await feeHandler.setTotalPayoutBalance(zeroBN);
                await expectRevert.unspecified(
                    feeHandler.claimPlatformFee(platformWallet)
                );
            });
        });

        describe("burning", async() => {
            it("burn KNC test correct burn amount for full burn per call", async() => {
                let sendVal = oneEth.mul(new BN(30));
                let burnPerCall = await feeHandler.weiToBurn();

                await callHandleFeeAndVerifyValues(
                    sendVal, zeroAddress, 0, currentRebateBps, currentRewardBps, currentEpoch,
                        rebateWallets, rebateBpsPerWallet
                    );

                let feeHandlerBalance = await Helper.getBalancePromise(feeHandler.address);

                await feeHandler.burnKnc();
                let feeHandlerBalanceAfter = await Helper.getBalancePromise(feeHandler.address);
                let expectedBalanceAfter = feeHandlerBalance.sub(burnPerCall);

                Helper.assertEqual(feeHandlerBalanceAfter, expectedBalanceAfter);
            });

            it("burn KNC test correct burn amount partial burn", async() => {
                let sendVal = oneEth;

                await callHandleFeeAndVerifyValues(
                    sendVal, zeroAddress, 0, currentRebateBps, currentRewardBps, currentEpoch,
                        rebateWallets, rebateBpsPerWallet
                    );

                let totalPayout0 = await feeHandler.totalPayoutBalance();
                let feeHandlerBalance = await Helper.getBalancePromise(feeHandler.address);
                const expectedBurn = feeHandlerBalance.sub(totalPayout0);

                await feeHandler.burnKnc();
                let feeHandlerBalanceAfter = await Helper.getBalancePromise(feeHandler.address);
                let expectedBalanceAfter = feeHandlerBalance.sub(expectedBurn);

                Helper.assertEqual(feeHandlerBalanceAfter, expectedBalanceAfter);
            });

            it("burn KNC test correct burn amount of new weiToBurn (new weiToBurn <= totalFee)", async() => {
                let sendVal = oneEth;

                await callHandleFeeAndVerifyValues(
                    sendVal, zeroAddress, 0, currentRebateBps, currentRewardBps, currentEpoch,
                        rebateWallets, rebateBpsPerWallet
                );

                let totalPayout0 = await feeHandler.totalPayoutBalance();
                let feeHandlerBalance = await Helper.getBalancePromise(feeHandler.address);
                const maxBurn = feeHandlerBalance.sub(totalPayout0);

                let newWeiToBurn = maxBurn.sub(new BN(1));

                await feeHandler.setBurnConfigParams(sanityRate.address, newWeiToBurn, {from: daoOperator});
                await sanityRate.setLatestKncToEthRate(kncToEthPrecision);

                // expect to burn only weiToBurn
                const expectedBurn = newWeiToBurn;

                await feeHandler.burnKnc();

                let feeHandlerBalanceAfter = await Helper.getBalancePromise(feeHandler.address);
                let expectedBalanceAfter = feeHandlerBalance.sub(expectedBurn);
                Helper.assertEqual(feeHandlerBalanceAfter, expectedBalanceAfter);
            });

            it("burn KNC test correct burn amount of new weiToBurn (new weiToBurn > totalFee)", async() => {
                let sendVal = oneEth;

                await callHandleFeeAndVerifyValues(
                    sendVal, zeroAddress, 0, currentRebateBps, currentRewardBps, currentEpoch,
                        rebateWallets, rebateBpsPerWallet
                );

                let totalPayout0 = await feeHandler.totalPayoutBalance();
                let feeHandlerBalance = await Helper.getBalancePromise(feeHandler.address);
                const maxBurn = feeHandlerBalance.sub(totalPayout0);

                let newWeiToBurn = maxBurn.add(new BN(1));

                await feeHandler.setBurnConfigParams(sanityRate.address, newWeiToBurn, {from: daoOperator});
                await sanityRate.setLatestKncToEthRate(kncToEthPrecision);

                // expect to burn all
                const expectedBurn = maxBurn;

                await feeHandler.burnKnc();

                let feeHandlerBalanceAfter = await Helper.getBalancePromise(feeHandler.address);
                let expectedBalanceAfter = feeHandlerBalance.sub(expectedBurn);
                Helper.assertEqual(feeHandlerBalanceAfter, expectedBalanceAfter);
            });

            it("burn KNC test correct burn_wait_interval for next burn", async() => {
                let sendVal = oneEth.mul(new BN(30));
                let blockInterval = await feeHandler.burnBlockInterval();

                await callHandleFeeAndVerifyValues(
                    sendVal, zeroAddress, 0, currentRebateBps, currentRewardBps, currentEpoch,
                        rebateWallets, rebateBpsPerWallet
                    );

                await feeHandler.burnKnc();
                let lastBurnBlock = new BN(await web3.eth.getBlockNumber());
                let nextBurnBlock = lastBurnBlock.add(blockInterval);
                // console.log("next burn block " + nextBurnBlock);

                let currentBlock = await web3.eth.getBlockNumber();
                while (nextBurnBlock > currentBlock) {
                    await expectRevert(
                        feeHandler.burnKnc(),
                        "wait more blocks to burn"
                    );
                    currentBlock = await web3.eth.getBlockNumber();
                    // log("block:" + currentBlock)
                }
                await feeHandler.burnKnc();
            });

            it("reverts if contract has insufficient ETH for burning", async() => {
                feeHandler = await BadFeeHandler.new(daoSetter, proxy.address, kyberNetwork, knc.address, BURN_BLOCK_INTERVAL, daoOperator);
                let burnPerCall = await feeHandler.weiToBurn();
                let platformWallet = accounts[9];
                let platformFeeWei = zeroBN;
                let feeBRRWei = oneEth.mul(new BN(30));
                let sendVal = platformFeeWei.add(feeBRRWei);

                await feeHandler.handleFees(ethAddress, rebateWallets, rebateBpsPerWallet , platformWallet, platformFeeWei, feeBRRWei,
                    {from: kyberNetwork, value: sendVal});

                feeHandlerBalance = await Helper.getBalancePromise(feeHandler.address);
                await feeHandler.withdrawEther(feeHandlerBalance.sub(burnPerCall.add(new BN(1))), user);

                await expectRevert.unspecified(
                    feeHandler.burnKnc()
                );
            });

            it("reverts if ETH-KNC > MAX_RATE", async() => {
                let platformWallet = accounts[9];
                let platformFeeWei = zeroBN;
                let feeBRRWei = oneEth;
                let sendVal = platformFeeWei.add(feeBRRWei);

                await feeHandler.handleFees(ethAddress, rebateWallets, rebateBpsPerWallet , platformWallet, platformFeeWei, feeBRRWei,
                    {from: kyberNetwork, value: sendVal})

                //ETH-KNC RATE > MAX_RATE
                await proxy.setPairRate(ethAddress, knc.address, MAX_RATE.add(new BN(1)));
                await expectRevert(
                    feeHandler.burnKnc(),
                    "ethToKnc rate out of bounds"
                );
            });

            it("reverts if ETH-KNC = 0", async() => {
                let platformWallet = accounts[9];
                let platformFeeWei = zeroBN;
                let feeBRRWei = oneEth;
                let sendVal = platformFeeWei.add(feeBRRWei);

                await feeHandler.handleFees(ethAddress, rebateWallets, rebateBpsPerWallet , platformWallet, platformFeeWei, feeBRRWei,
                    {from: kyberNetwork, value: sendVal})

                //ETH-KNC RATE = 0
                await proxy.setPairRate(ethAddress, knc.address, 0);
                await expectRevert(
                    feeHandler.burnKnc(),
                    "ethToKnc rate is 0"
                );
            });

            it("reverts no sanity rate contract", async() => {
                feeHandler = await FeeHandler.new(daoSetter, proxy.address, kyberNetwork, knc.address, BURN_BLOCK_INTERVAL, daoOperator);
                await feeHandler.setDaoContract(mockKyberDao.address, {from: daoSetter});

                let platformWallet = accounts[9];
                let platformFeeWei = zeroBN;
                let feeBRRWei = oneEth;
                let sendVal = platformFeeWei.add(feeBRRWei);

                await proxy.setPairRate(ethAddress, knc.address, ethToKncPrecision);

                await feeHandler.handleFees(ethAddress, rebateWallets, rebateBpsPerWallet , platformWallet, platformFeeWei, feeBRRWei,
                    {from: kyberNetwork, value: sendVal})

                await expectRevert(
                    feeHandler.burnKnc(),
                    "no sanity rate contract"
                );
            });

            it("reverts sanity rate 0", async() => {
                feeHandler = await FeeHandler.new(daoSetter, proxy.address, kyberNetwork, knc.address, BURN_BLOCK_INTERVAL, daoOperator);
                await feeHandler.setDaoContract(mockKyberDao.address, {from: daoSetter});
                sanityRate = await BurnKncSanityRate.new();
                await sanityRate.setLatestKncToEthRate(0);
                await feeHandler.setBurnConfigParams(sanityRate.address, weiToBurn, {from: daoOperator});

                let platformWallet = accounts[9];
                let platformFeeWei = zeroBN;
                let feeBRRWei = oneEth;
                let sendVal = platformFeeWei.add(feeBRRWei);

                await proxy.setPairRate(ethAddress, knc.address, ethToKncPrecision);

                await feeHandler.handleFees(ethAddress, rebateWallets, rebateBpsPerWallet , platformWallet, platformFeeWei, feeBRRWei,
                    {from: kyberNetwork, value: sendVal})

                await expectRevert(
                    feeHandler.burnKnc(),
                    "sanity rate is 0"
                );
            });

            it("reverts sanity rate > MAX_RATE", async() => {
                feeHandler = await FeeHandler.new(daoSetter, proxy.address, kyberNetwork, knc.address, BURN_BLOCK_INTERVAL, daoOperator);
                await feeHandler.setDaoContract(mockKyberDao.address, {from: daoSetter});
                sanityRate = await BurnKncSanityRate.new();
                await sanityRate.setLatestKncToEthRate(MAX_RATE.add(new BN(1)));
                await feeHandler.setBurnConfigParams(sanityRate.address, weiToBurn, {from: daoOperator});

                let platformWallet = accounts[9];
                let platformFeeWei = zeroBN;
                let feeBRRWei = oneEth;
                let sendVal = platformFeeWei.add(feeBRRWei);

                await proxy.setPairRate(ethAddress, knc.address, ethToKncPrecision);

                await feeHandler.handleFees(ethAddress, rebateWallets, rebateBpsPerWallet , platformWallet, platformFeeWei, feeBRRWei,
                    {from: kyberNetwork, value: sendVal})

                await expectRevert(
                    feeHandler.burnKnc(),
                    "sanity rate out of bounds"
                );
            });

            it("reverts sanity rate and ethToKnc rate diff > MAX_DIFF of 10%", async() => {
                feeHandler = await FeeHandler.new(daoSetter, proxy.address, kyberNetwork, knc.address, BURN_BLOCK_INTERVAL, daoOperator);
                await feeHandler.setDaoContract(mockKyberDao.address, {from: daoSetter});
                sanityRate = await BurnKncSanityRate.new();
                await sanityRate.setLatestKncToEthRate(MAX_RATE.add(new BN(1)));
                await feeHandler.setBurnConfigParams(sanityRate.address, weiToBurn, {from: daoOperator});

                let platformWallet = accounts[9];
                let platformFeeWei = zeroBN;
                let feeBRRWei = oneEth;
                let sendVal = platformFeeWei.add(feeBRRWei);

                await feeHandler.handleFees(ethAddress, rebateWallets, rebateBpsPerWallet , platformWallet, platformFeeWei, feeBRRWei,
                    {from: kyberNetwork, value: sendVal})

                await proxy.setPairRate(ethAddress, knc.address, ethToKncPrecision);

                // make sanity rate more than 10% higher
                ethToKncRate = ethToKncPrecision;
                ethToKncRate = ethToKncRate.mul(BPS).div(BPS.sub(new BN(SANITY_RATE_DIFF)));
                ethToKncRate.iadd(new BN(1));
                await sanityRate.setLatestKncToEthRate(precisionUnits.mul(precisionUnits).div(ethToKncRate));

                await expectRevert(
                    feeHandler.burnKnc(),
                    "kyberNetwork eth to knc rate too low"
                );
            });

            it("reverts only none contract can call burn", async() => {
                feeHandler = await FeeHandler.new(daoSetter, proxy.address, kyberNetwork, knc.address, BURN_BLOCK_INTERVAL, daoOperator);
                await feeHandler.setDaoContract(mockKyberDao.address, {from: daoSetter});
                sanityRate = await BurnKncSanityRate.new();
                await sanityRate.setLatestKncToEthRate(MAX_RATE.add(new BN(1)));
                await feeHandler.setBurnConfigParams(sanityRate.address, weiToBurn, {from: daoOperator});

                let platformWallet = accounts[9];
                let platformFeeWei = zeroBN;
                let feeBRRWei = oneEth;
                let sendVal = platformFeeWei.add(feeBRRWei);

                await feeHandler.handleFees(ethAddress, rebateWallets, rebateBpsPerWallet , platformWallet, platformFeeWei, feeBRRWei,
                    {from: kyberNetwork, value: sendVal})

                await proxy.setPairRate(ethAddress, knc.address, ethToKncPrecision);

                let contract = await MockContractCallBurnKnc.new(feeHandler.address);
                await expectRevert(
                    contract.callBurnKnc(),
                    "only non-contract"
                )
            });

            it("reverts if sanity rate is 0", async() => {
                feeHandler = await FeeHandler.new(daoSetter, proxy.address, kyberNetwork, knc.address, BURN_BLOCK_INTERVAL, daoOperator);
                await feeHandler.setDaoContract(mockKyberDao.address, {from: daoSetter});
                await feeHandler.setBurnConfigParams(zeroAddress, weiToBurn, {from: daoOperator});

                let platformWallet = accounts[9];
                let platformFeeWei = zeroBN;
                let feeBRRWei = oneEth;
                let sendVal = platformFeeWei.add(feeBRRWei);

                await feeHandler.handleFees(ethAddress, rebateWallets, rebateBpsPerWallet , platformWallet, platformFeeWei, feeBRRWei,
                    {from: kyberNetwork, value: sendVal})

                await proxy.setPairRate(ethAddress, knc.address, ethToKncPrecision);

                await expectRevert(
                    feeHandler.burnKnc(),
                    "sanity rate is 0x0, burning is blocked"
                )
            });

            it("reverts if malicious KNC token is used, and burning fails", async() => {
                //setup bad KNC
                let badKNC = await BadToken.new("KyberNetworkCrystal", "KNC", KNC_DECIMALS);
                await badKNC.transfer(proxy.address, oneKnc.mul(new BN(10000)));
                await proxy.setPairRate(ethAddress, badKNC.address, ethToKncPrecision);
                await proxy.setPairRate(badKNC.address, ethAddress, kncToEthPrecision);

                feeHandler = await FeeHandler.new(daoSetter, proxy.address, kyberNetwork, badKNC.address, BURN_BLOCK_INTERVAL, daoOperator);
                await feeHandler.setDaoContract(mockKyberDao.address, {from: daoSetter});
                sanityRate = await BurnKncSanityRate.new();
                await sanityRate.setLatestKncToEthRate(kncToEthPrecision);
                await feeHandler.setBurnConfigParams(sanityRate.address, weiToBurn, {from: daoOperator});

                let platformWallet = accounts[9];
                let platformFeeWei = zeroBN;
                let feeBRRWei = oneEth;
                let sendVal = platformFeeWei.add(feeBRRWei);

                await feeHandler.handleFees(ethAddress, rebateWallets, rebateBpsPerWallet , platformWallet, platformFeeWei, feeBRRWei,
                    {from: kyberNetwork, value: sendVal})

                await expectRevert(
                    feeHandler.burnKnc(),
                    "knc burn failed"
                );
            });

            it("should burn epoch rewards if KyberDao allows it, see values have been updated", async() => {
                let sendVal = oneEth.mul(new BN(30));
                let rebateBpsPerWallet = [new BN(2000), new BN(3000), new BN(5000)];

                await callHandleFeeAndVerifyValues(
                    sendVal, zeroAddress, 0, currentRebateBps, currentRewardBps, currentEpoch,
                        rebateWallets, rebateBpsPerWallet
                    );

                await mockKyberDao.setShouldBurnRewardTrue(currentEpoch);
                await feeHandler.makeEpochRewardBurnable(currentEpoch);
                let rewardAmount = await feeHandler.rewardsPerEpoch(currentEpoch);
                Helper.assertEqual(rewardAmount, zeroBN, "rewards were not burnt");
            });

            it("reverts if kyberDao is not set", async() => {
                feeHandler = await FeeHandler.new(daoSetter, proxy.address, kyberNetwork, knc.address, BURN_BLOCK_INTERVAL, daoOperator);

                let platformWallet = accounts[1];
                let platformFeeWei = oneEth;
                let rebateBpsPerWallet = [new BN(2000), new BN(3000), new BN(5000)];
                let feeBRRWei = oneEth;
                let sendVal = platformFeeWei.add(feeBRRWei);

                await feeHandler.handleFees(ethAddress, rebateWallets, rebateBpsPerWallet , platformWallet, platformFeeWei, feeBRRWei, {from: kyberNetwork, value: sendVal});

                let currentEpoch = new BN(1);

                await expectRevert(
                    feeHandler.makeEpochRewardBurnable(currentEpoch),
                    "kyberDao not set"
                );
            });

            it("reverts if kyberDao prevents burning of reward", async() => {
                feeHandler = await FeeHandler.new(daoSetter, proxy.address, kyberNetwork, knc.address, BURN_BLOCK_INTERVAL, daoOperator);
                mockKyberDao = await MockKyberDao.new(
                    rewardInBPS,
                    rebateInBPS,
                    epoch,
                    expiryTimestamp
                );
                await mockKyberDao.setFeeHandler(feeHandler.address);
                await feeHandler.setDaoContract(mockKyberDao.address, {from: daoSetter});

                let rebateBpsPerWallet = [new BN(2000), new BN(3000), new BN(5000)];
                let platformWallet = accounts[9];
                let platformFeeWei = zeroBN;
                let feeBRRWei = oneEth.mul(new BN(30));
                let sendVal = platformFeeWei.add(feeBRRWei);

                await feeHandler.handleFees(ethAddress, rebateWallets, rebateBpsPerWallet, platformWallet, platformFeeWei, feeBRRWei,
                    {from: kyberNetwork, value: sendVal});

                await expectRevert(
                    feeHandler.makeEpochRewardBurnable(currentEpoch),
                    "should not burn reward"
                );
            });

            it("reverts if no reward to burn", async() => {
                await mockKyberDao.setShouldBurnRewardTrue(currentEpoch);
                await expectRevert(
                    feeHandler.makeEpochRewardBurnable(currentEpoch),
                    "reward is 0"
                );
            });

            it("reverts if totalPayoutBalance < rewardAmount", async() => {
                const platformWallet = accounts[1];
                const platformFeeWei = zeroBN;
                let feeBRRWei = oneEth;
                let sendVal = platformFeeWei.add(feeBRRWei);
                feeHandler = await BadFeeHandler.new(daoSetter, proxy.address, kyberNetwork, knc.address, BURN_BLOCK_INTERVAL, daoOperator);

                await feeHandler.handleFees(ethAddress, rebateWallets, rebateBpsPerWallet , platformWallet, platformFeeWei, feeBRRWei,
                {from: kyberNetwork, value: sendVal});

                await feeHandler.setTotalPayoutBalance(zeroBN);
                await feeHandler.setDaoContract(mockKyberDao.address, {from: daoSetter});
                await mockKyberDao.setFeeHandler(feeHandler.address);
                currentEpoch = (await feeHandler.readBRRData()).epoch;
                await mockKyberDao.setShouldBurnRewardTrue(currentEpoch);

                await expectRevert(
                    feeHandler.makeEpochRewardBurnable(currentEpoch),
                    "total reward less than epoch reward"
                );
            });
        });

        describe("burn config params test", async() => {
            it("test reverts burn config params invalid", async() => {
                // revert weiToBurn is zero
                await expectRevert(
                    feeHandler.setBurnConfigParams(sanityRate.address, 0, {from: daoOperator}),
                    "_weiToBurn is 0"
                )
                await feeHandler.setBurnConfigParams(sanityRate.address, weiToBurn, {from: daoOperator});
            });

            it("test reverts only daoOperator", async() => {
                // revert when sanity is zero
                await expectRevert(
                    feeHandler.setBurnConfigParams(sanityRate.address, weiToBurn, {from: user}),
                    "only daoOperator"
                )
                await feeHandler.setBurnConfigParams(sanityRate.address, weiToBurn, {from: daoOperator});
            });

            it("test records correct burn config params", async() => {
                // redeploy
                sanityRate = await BurnKncSanityRate.new();
                await sanityRate.setLatestKncToEthRate(kncToEthPrecision);

                feeHandler = await FeeHandler.new(daoSetter, proxy.address, kyberNetwork, knc.address, BURN_BLOCK_INTERVAL, daoOperator);
                await feeHandler.setDaoContract(mockKyberDao.address, {from: daoSetter});
                await feeHandler.getBRR();
                await mockKyberDao.setFeeHandler(feeHandler.address);

                let sanityRateContracts = await feeHandler.getSanityRateContracts();
                let recordedWeiToBurn = await feeHandler.weiToBurn();
                Helper.assertEqual(0, sanityRateContracts.length);
                Helper.assertEqual(weiToBurn, recordedWeiToBurn);

                // set first data
                await feeHandler.setBurnConfigParams(sanityRate.address, weiToBurn, {from: daoOperator});
                sanityRateContracts = await feeHandler.getSanityRateContracts();
                recordedWeiToBurn = await feeHandler.weiToBurn();
                Helper.assertEqual(1, sanityRateContracts.length);
                Helper.assertEqual(sanityRate.address, sanityRateContracts[0]);
                Helper.assertEqual(weiToBurn, recordedWeiToBurn);

                // weiToBurn unchanges if set the same value
                await feeHandler.setBurnConfigParams(sanityRate.address, weiToBurn, {from: daoOperator});
                recordedWeiToBurn = await feeHandler.weiToBurn();
                Helper.assertEqual(weiToBurn, recordedWeiToBurn);

                // set another wei to burn value
                await feeHandler.setBurnConfigParams(sanityRate.address, 1000, {from: daoOperator});
                recordedWeiToBurn = await feeHandler.weiToBurn();
                Helper.assertEqual(1000, recordedWeiToBurn);

                // reset back
                await feeHandler.setBurnConfigParams(sanityRate.address, weiToBurn, {from: daoOperator});
                recordedWeiToBurn = await feeHandler.weiToBurn();
                Helper.assertEqual(weiToBurn, recordedWeiToBurn);

                // check sanity rates unchanges
                sanityRateContracts = await feeHandler.getSanityRateContracts();
                Helper.assertEqual(1, sanityRateContracts.length);
                Helper.assertEqual(sanityRate.address, sanityRateContracts[0]);

                // set different sanity rate contract, see it is updated
                await feeHandler.setBurnConfigParams(user, weiToBurn, {from: daoOperator});
                sanityRateContracts = await feeHandler.getSanityRateContracts();
                Helper.assertEqual(2, sanityRateContracts.length);
                Helper.assertEqual(user, sanityRateContracts[0]);
                Helper.assertEqual(sanityRate.address, sanityRateContracts[1]);

                // set different sanity rate contract, see list is updated with correct order
                await feeHandler.setBurnConfigParams(user2, weiToBurn, {from: daoOperator});
                sanityRateContracts = await feeHandler.getSanityRateContracts();
                Helper.assertEqual(3, sanityRateContracts.length);
                Helper.assertEqual(user2, sanityRateContracts[0]);
                Helper.assertEqual(sanityRate.address, sanityRateContracts[1]);
                Helper.assertEqual(user, sanityRateContracts[2]);

                // set old one, see list still inreases
                await feeHandler.setBurnConfigParams(sanityRate.address, weiToBurn, {from: daoOperator});;
                sanityRateContracts = await feeHandler.getSanityRateContracts();
                Helper.assertEqual(4, sanityRateContracts.length);
                Helper.assertEqual(sanityRate.address, sanityRateContracts[0]);
                Helper.assertEqual(sanityRate.address, sanityRateContracts[1]);
                Helper.assertEqual(user, sanityRateContracts[2]);
                Helper.assertEqual(user2, sanityRateContracts[3]);

                // set same as current one, nothing changes
                await feeHandler.setBurnConfigParams(sanityRate.address, weiToBurn, {from: daoOperator});
                sanityRateContracts = await feeHandler.getSanityRateContracts();
                Helper.assertEqual(4, sanityRateContracts.length);
                Helper.assertEqual(sanityRate.address, sanityRateContracts[0]);
                Helper.assertEqual(sanityRate.address, sanityRateContracts[1]);
                Helper.assertEqual(user, sanityRateContracts[2]);
                Helper.assertEqual(user2, sanityRateContracts[3]);
            });

            it("test returns correct latest kncToEth rate from sanity rate", async function() {
                // redeploy
                sanityRate = await BurnKncSanityRate.new();
                await sanityRate.setLatestKncToEthRate(kncToEthPrecision);

                feeHandler = await FeeHandler.new(daoSetter, proxy.address, kyberNetwork, knc.address, BURN_BLOCK_INTERVAL, daoOperator);
                await feeHandler.setDaoContract(mockKyberDao.address, {from: daoSetter});
                await feeHandler.getBRR();
                await mockKyberDao.setFeeHandler(feeHandler.address);

                // default value is 0 when no sanity rateHelper.assertEqual(0, await feeHandler.getLatestSanityRate());
                Helper.assertEqual(0, await feeHandler.getLatestSanityRate());

                await feeHandler.setBurnConfigParams(sanityRate.address, weiToBurn, {from: daoOperator});

                await sanityRate.setLatestKncToEthRate(0);
                Helper.assertEqual(0, await feeHandler.getLatestSanityRate());
                await sanityRate.setLatestKncToEthRate(10);
                Helper.assertEqual(10, await feeHandler.getLatestSanityRate());
                await sanityRate.setLatestKncToEthRate(1000);
                Helper.assertEqual(1000, await feeHandler.getLatestSanityRate());
                await sanityRate.setLatestKncToEthRate(kncToEthPrecision);
                Helper.assertEqual(kncToEthPrecision, await feeHandler.getLatestSanityRate());

                // change new sanity rate
                let newSanity = await BurnKncSanityRate.new();
                await feeHandler.setBurnConfigParams(newSanity.address, weiToBurn, {from: daoOperator});

                Helper.assertEqual(0, await feeHandler.getLatestSanityRate());
                await newSanity.setLatestKncToEthRate(10000);
                Helper.assertEqual(10000, await feeHandler.getLatestSanityRate());

                // change old sanity rate, value shouldn't be affected
                await sanityRate.setLatestKncToEthRate(20000);
                Helper.assertEqual(10000, await feeHandler.getLatestSanityRate());
                // change new sanity rate, value should be updated
                await newSanity.setLatestKncToEthRate(kncToEthPrecision);
                Helper.assertEqual(kncToEthPrecision, await feeHandler.getLatestSanityRate());

                // set sanity rate to 0
                await feeHandler.setBurnConfigParams(zeroAddress, weiToBurn, {from: daoOperator});
                Helper.assertEqual(0, await feeHandler.getLatestSanityRate());
            });
        });

        describe("test re entrance for claim fee functions is blocked", async() =>{
            let claimer;
            let token;
            let taker = accounts[3];
            let maxDestAmt = new BN(2).pow(new BN(255));
            let srcQty = new BN(10).pow(new BN(18));
            let networkProxy;
            let feeHandler;
            let reserveInstances;
            before("set up network", async() => {
                admin = accounts[0];
                operator = accounts[1];
                //deploy storage and network
                storage = await nwHelper.setupStorage(admin);
                network = await KyberNetwork.new(admin, storage.address);
                await storage.setNetworkContract(network.address, {from: admin});
                await storage.addOperator(operator, {from: admin});

                // init proxy
                networkProxy = await KyberNetworkProxy.new(admin);

                //init matchingEngine
                matchingEngine = await MatchingEngine.new(admin);
                await matchingEngine.setNetworkContract(network.address, {from: admin});
                await matchingEngine.setKyberStorage(storage.address, {from: admin});
                await storage.setFeeAccountedPerReserveType(true, true, true, true, true, true, {from: admin});
                await storage.setEntitledRebatePerReserveType(true, true, true, true, true, true, {from: admin});

                await networkProxy.setKyberNetwork(network.address, {from: admin});

                //init tokens
                token = await Token.new("test", "tst", 18);
                tokens = [token];

                //init feeHandler
                await mockKyberDao.setNetworkFeeBps(new BN(10));
                feeHandler = await FeeHandler.new(mockKyberDao.address, networkProxy.address, network.address, knc.address, new BN(30), mockKyberDao.address);

                claimer = await ReentrancyFeeClaimer.new(networkProxy.address, feeHandler.address, token.address, srcQty);
                await token.transfer(claimer.address, srcQty);

                // init and setup reserves
                let result = await nwHelper.setupReserves(network, tokens, 1, 0, 0, 0, accounts, admin, operator);
                reserveInstances = result.reserveInstances;
                for (const [key, value] of Object.entries(reserveInstances)) {
                    value.rebateWallet = claimer.address;
                }

                //setup network
                ///////////////
                await network.setContracts(feeHandler.address, matchingEngine.address, zeroAddress, {from: admin});
                await network.addKyberProxy(networkProxy.address, {from: admin});
                await network.addOperator(operator, {from: admin});
                await network.setKyberDaoContract(mockKyberDao.address, {from: admin});

                //add and list pair for reserve
                await nwHelper.addReservesToStorage(storage, reserveInstances, tokens, operator);

                //set params, enable network
                let gasPrice = (new BN(10).pow(new BN(9)).mul(new BN(50)));
                await network.setParams(gasPrice, new BN(10), {from: admin});
                await network.setEnable(true, {from: admin});
            })

            it("revert if call trade during claim platform fee", async() => {
                //trade so claimer has platfrom fee
                await token.transfer(taker, srcQty);
                await token.approve(networkProxy.address, srcQty, { from: taker});
                await networkProxy.tradeWithHintAndFee(token.address, srcQty, ethAddress, taker,
                    maxDestAmt, 0, claimer.address, new BN(100), '0x', {from: taker});
                let platformFee = await feeHandler.feePerPlatformWallet(claimer.address);
                Helper.assertGreater(platformFee, new BN(1), "platform fee should be enough to withdraw");
                await expectRevert(
                    feeHandler.claimPlatformFee(claimer.address),
                    "platform fee transfer failed"
                );
                // when no re entrance, claim fee succeeds
                await claimer.setReentrancy(false);
                await feeHandler.claimPlatformFee(claimer.address);
                await claimer.setReentrancy(true);
            })

            it("revert if call trade during claim rebate", async() => {
                //trade so claimer has platfrom fee
                await token.transfer(taker, srcQty);
                await token.approve(networkProxy.address, srcQty, { from: taker});
                await networkProxy.tradeWithHintAndFee(token.address, srcQty, ethAddress, taker,
                    maxDestAmt, 0, zeroAddress, new BN(100), '0x', {from: taker});
                let rebateWei = await feeHandler.rebatePerWallet(claimer.address);
                Helper.assertGreater(rebateWei, new BN(1), "rebateWei should be enough to withdraw");
                await expectRevert(
                    feeHandler.claimReserveRebate(claimer.address),
                    "rebate transfer failed"
                );
                // when no re entrance, claim fee succeeds
                await claimer.setReentrancy(false);
                await feeHandler.claimReserveRebate(claimer.address);
                await claimer.setReentrancy(true);
            })
        });
    });

    it("test upgradeable - update network address", async() => {
        admin = accounts[9];
        storage = accounts[8];
        tempNetwork = await KyberNetwork.new(admin, storage);
        tempProxy = await KyberNetworkProxy.new(admin);
        tempFeeHandler = await FeeHandler.new(daoSetter, tempProxy.address, kyberNetwork, knc.address, BURN_BLOCK_INTERVAL, daoOperator);
        Helper.assertEqual(kyberNetwork, await tempFeeHandler.kyberNetwork(), "network does not match");
        await expectRevert(
            tempFeeHandler.setNetworkContract(accounts[0]), "only daoOperator"
        )
        await expectRevert(
            tempFeeHandler.setNetworkContract(zeroAddress, {from: daoOperator}), "kyberNetwork 0"
        )
        txResult = await tempFeeHandler.setNetworkContract(tempNetwork.address, {from: daoOperator});
        expectEvent(txResult, 'KyberNetworkUpdated', {
            kyberNetwork: tempNetwork.address,
        });
        Helper.assertEqual(tempNetwork.address, await tempFeeHandler.kyberNetwork(), "network does not match");
        // should not have any event if update the same current network contract
        txResult = await tempFeeHandler.setNetworkContract(tempNetwork.address, {from: daoOperator});
        for (let i = 0; i < txResult.logs.length; i++) {
            assert(txResult.logs[i].event != 'KyberNetworkUpdated', "shouldn't have network updated event");
        }
    });

    describe("Update Network Proxy", async() => {
        it("Test should revert new proxy is 0", async() => {
            await expectRevert(
                feeHandler.setKyberProxy(zeroAddress, {from: daoOperator}),
                "kyberNetworkProxy 0"
            )
        });

        it("Test should revert not daoOperator", async() => {
            await expectRevert(
                feeHandler.setKyberProxy(accounts[0], {from: accounts[0]}),
                "only daoOperator"
            )
        })

        it("Test update with event", async() => {
            let newProxy = await KyberNetworkProxy.new(accounts[0]);
            let txResult = await feeHandler.setKyberProxy(newProxy.address, {from: daoOperator});
            expectEvent(txResult, "KyberProxyUpdated", {
                kyberProxy: newProxy.address,
            });
            let anotherProxy = accounts[0];
            txResult = await feeHandler.setKyberProxy(anotherProxy, {from: daoOperator});
            expectEvent(txResult, "KyberProxyUpdated", {
                kyberProxy: anotherProxy
            });
            txResult = await feeHandler.setKyberProxy(anotherProxy, {from: daoOperator});
            for (let i = 0; i < txResult.logs.length; i++) {
                assert(txResult.logs[i].event != 'KyberProxyUpdated', "shouldn't have proxy updated event");
            }
        });

        it("Test burn KNC after updating proxy", async() => {
            let tempNetwork = accounts[0];

            let sanityRate = await BurnKncSanityRate.new();
            await sanityRate.setLatestKncToEthRate(kncToEthPrecision);

            let tempProxy = await Proxy.new();
            await knc.transfer(tempProxy.address, oneKnc.mul(new BN(10000)));
            await Helper.sendEtherWithPromise(accounts[9], tempProxy.address, oneEth);

            await tempProxy.setPairRate(ethAddress, knc.address, ethToKncPrecision);
            await tempProxy.setPairRate(knc.address, ethAddress, kncToEthPrecision);

            let tempFeeHandler = await FeeHandler.new(daoSetter, tempProxy.address, tempNetwork, knc.address, BURN_BLOCK_INTERVAL, daoOperator);
            await tempFeeHandler.setDaoContract(mockKyberDao.address, {from: daoSetter});
            await tempFeeHandler.setBurnConfigParams(sanityRate.address, weiToBurn, {from: daoOperator});
            await tempFeeHandler.getBRR();
            await tempFeeHandler.setKyberProxy(tempProxy.address, {from: daoOperator});

            await tempFeeHandler.handleFees(ethAddress, [], [], zeroAddress, 0, oneEth, {from: tempNetwork, value: oneEth});
            await tempFeeHandler.burnKnc();

            await Helper.increaseBlockNumber(BURN_BLOCK_INTERVAL);

            // new proxy
            tempProxy = await Proxy.new();
            await knc.transfer(tempProxy.address, oneKnc.mul(new BN(10000)));
            await Helper.sendEtherWithPromise(accounts[9], tempProxy.address, oneEth);
            await tempProxy.setPairRate(ethAddress, knc.address, ethToKncPrecision);
            await tempProxy.setPairRate(knc.address, ethAddress, kncToEthPrecision);

            await tempFeeHandler.handleFees(ethAddress, [], [], zeroAddress, 0, oneEth, {from: tempNetwork, value: oneEth});

            // set new proxy for fee handler
            await tempFeeHandler.setKyberProxy(tempProxy.address, {from: daoOperator});
            // burn knc
            await tempFeeHandler.burnKnc();
        });
    });
});

async function callHandleFeeAndVerifyValues(sendValWei, platformWallet, platFeeWei, rebateBps, rewardBps, epoch, rebateWalletArr, rebateBpsArr) {
    assert(sendValWei.gt(platFeeWei));

    let feeAmountBRR = sendValWei.sub(new BN(platFeeWei));

    let expectedRewardForEpoch = (await feeHandler.rewardsPerEpoch(epoch)).add(feeAmountBRR.mul(rewardBps).div(BPS));
    let currentRebatesArr = [];
    for (let i = 0; i < rebateWalletArr.length; i++) {
        currentRebatesArr[i] = await feeHandler.rebatePerWallet(rebateWalletArr[i]);
    }
    let expectedPlatWalletFee = (await feeHandler.feePerPlatformWallet(platformWallet)).add(new BN(platFeeWei));

    // handle fees
    await feeHandler.handleFees(ethAddress, rebateWalletArr, rebateBpsArr, platformWallet, platFeeWei, feeAmountBRR, {from: kyberNetwork, value: sendValWei});

    //validate values
    let expectedRebates = [];
    let totalRebateWei = feeAmountBRR.mul(rebateBps).div(BPS);
    let paidRebatesWei = new BN(0);
    for (let i = 0; i < rebateWalletArr.length; i++) {
        let walletRebateWei = totalRebateWei.mul(rebateBpsArr[i]).div(BPS)
        expectedRebates[i] = currentRebatesArr[i].add(walletRebateWei);
        paidRebatesWei = paidRebatesWei.add(walletRebateWei);
        let actualRebate = await feeHandler.rebatePerWallet(rebateWalletArr[i]);
        Helper.assertEqual(actualRebate, expectedRebates[i]);
    }

    const extraRewardFromUnpaidRebate = totalRebateWei.sub(paidRebatesWei);
    expectedRewardForEpoch = expectedRewardForEpoch.add(extraRewardFromUnpaidRebate);
    const actualFeeWallet = await feeHandler.feePerPlatformWallet(platformWallet);
    Helper.assertEqual(actualFeeWallet, expectedPlatWalletFee);

    const rewardForEpoch = await feeHandler.rewardsPerEpoch(epoch);
    Helper.assertEqual(rewardForEpoch, expectedRewardForEpoch);

    return expectedRebates;
}

function log(str) {
    console.log(str);
}
