const Helper = require("../helper.js");
const BN = web3.utils.BN;

const MockDAO = artifacts.require("MockDAO.sol");
const BadDAO = artifacts.require("MaliciousDAO.sol");
const FeeHandler = artifacts.require("KyberFeeHandler.sol");
const BadFeeHandler = artifacts.require("MaliciousFeeHandler.sol");
const Token = artifacts.require("Token.sol");
const BadToken = artifacts.require("TestTokenNotReturn.sol");
const Proxy = artifacts.require("SimpleKyberProxy.sol");
const NoPayableFallback = artifacts.require("NoPayableFallback.sol");
const {BPS, precisionUnits, ethDecimals, ethAddress, zeroAddress, zeroBN, MAX_RATE} = require("../helper.js");
const { expectEvent, expectRevert } = require('@openzeppelin/test-helpers');

const KNC_DECIMALS = 18;
const BURN_BLOCK_INTERVAL = 3;

let kyberNetwork;
let proxy;
let user;
let user2;
let daoSetter;
let mockDAO;
let knc;
let feeHandler;
let rewardInBPS = new BN(3000);
let rebateInBPS = new BN(5000);
let epoch;
let expiryBlockNumber;

let ethToKncPrecision = precisionUnits.div(new BN(200)); // 1 eth --> 200 knc
let kncToEthPrecision = precisionUnits.mul(new BN(200));
let rebateWallets = [];
let oneKnc = new BN(10).pow(new BN(KNC_DECIMALS));
let oneEth = new BN(10).pow(new BN(ethDecimals));

contract('KyberFeeHandler', function(accounts) {
    before("Setting global variables", async() => {
        user = accounts[9];
        user2 = accounts[8];
        daoSetter = accounts[1];

        rebateWallets.push(accounts[1]);
        rebateWallets.push(accounts[2]);
        rebateWallets.push(accounts[3]);
        
        epoch = new BN(0);
        expiryBlockNumber = new BN(5);
        mockDAO = await MockDAO.new(
            rewardInBPS,
            rebateInBPS,
            epoch,
            expiryBlockNumber
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
        feeHandler = await FeeHandler.new(daoSetter, proxy.address, kyberNetwork, knc.address, BURN_BLOCK_INTERVAL);
        await feeHandler.setDaoContract(mockDAO.address, {from: daoSetter});
        await feeHandler.getBRR();
        await mockDAO.setFeeHandler(feeHandler.address);
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
            let txResult = await feeHandler.handleFees([], [], platformWallet, oneEth, {from: kyberNetwork, value: oneEth});
            expectEvent(txResult, 'FeeDistributed', {
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
            let rebateBpsPerWallet = [new BN(2000), new BN(3000), new BN(5000)];
            let sendVal = oneEth.add(oneEth);
            const BRRData = await feeHandler.readBRRData();   
            let currentRewardBps = BRRData.rewardBps;
            let currentRebateBps = BRRData.rebateBps;

            let txResult = await feeHandler.handleFees(rebateWallets, rebateBpsPerWallet , platformWallet, platformFeeWei, {from: kyberNetwork, value: sendVal});
            
            let expectedRewardWei = oneEth.mul(currentRewardBps).div(BPS);
            let expectedRebateWei = oneEth.mul(currentRebateBps).div(BPS);

            expectEvent(txResult, 'FeeDistributed', {
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
            feeHandler = await FeeHandler.new(daoSetter, proxy.address, kyberNetwork, knc.address, BURN_BLOCK_INTERVAL);
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
            
            await feeHandler.setDaoContract(user, {from: daoSetter});
            let rewardAmount = await feeHandler.rewardsPerEpoch(currentEpoch);

            let claim = precisionUnits.div(new BN(3));
            let txResult = await feeHandler.claimStakerReward(user, claim, currentEpoch, {from: user});
            
            await expectEvent(txResult, "RewardPaid", {
                staker: user,
                amountWei: rewardAmount.mul(claim).div(precisionUnits)
            });
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
                amountWei: expectedRebates[0].sub(new BN(1))
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
                amountWei: platformFeeWei.sub(new BN(1))
            });   
        });

        it("KyberDaoAddressSet", async() => {
            feeHandler = await FeeHandler.new(daoSetter, proxy.address, kyberNetwork, knc.address, BURN_BLOCK_INTERVAL);
            let txResult = await feeHandler.setDaoContract(mockDAO.address, {from: daoSetter});
            expectEvent(txResult, "KyberDaoAddressSet", {
                kyberDAO: mockDAO.address
            });
        });
        
        it("KNCBurned", async() => {
            let networkFeeBps = new BN(25);
            let sendVal = oneEth.mul(new BN(30));
            let burnPerCall = await feeHandler.WEI_TO_BURN();
            let rebateBpsPerWallet = [new BN(2000), new BN(3000), new BN(5000)];
            const BRRData = await feeHandler.readBRRData();
            let currentRewardBps = BRRData.rewardBps;
            let currentRebateBps = BRRData.rebateBps;
            let currentEpoch = BRRData.epoch;

            await callHandleFeeAndVerifyValues(
                sendVal, zeroAddress, 0, currentRebateBps, currentRewardBps, currentEpoch, 
                    rebateWallets, rebateBpsPerWallet  
                );
            
            let txResult = await feeHandler.burnKNC();
            let expectedEthtoKncRate = (await proxy.getExpectedRate(ethAddress, knc.address, burnPerCall)).expectedRate;

            expectEvent(txResult, "KNCBurned", {
                KNCTWei: (burnPerCall.sub(burnPerCall.mul(networkFeeBps).div(BPS))).mul(expectedEthtoKncRate).div(precisionUnits),
                amountWei: burnPerCall
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
            await mockDAO.setShouldBurnRewardTrue(currentEpoch);
            let expectedRewardAmount = await feeHandler.rewardsPerEpoch(currentEpoch);

            let txResult = await feeHandler.shouldBurnEpochReward(currentEpoch);
            expectEvent(txResult, "RewardsRemovedToBurn", {
                epoch: currentEpoch,
                rewardsWei: expectedRewardAmount
            });
        });
    });

    describe("should test null values in ctor arguments", async() => {
        it("daoSetter 0", async() => {
            await expectRevert(
                FeeHandler.new(zeroAddress, proxy.address, kyberNetwork, knc.address, BURN_BLOCK_INTERVAL),
                "FeeHandler: daoSetter 0"
            );
        });

        it("proxy 0", async() => {
            await expectRevert(
                FeeHandler.new(daoSetter, zeroAddress, kyberNetwork, knc.address, BURN_BLOCK_INTERVAL),
                "FeeHandler: KyberNetworkProxy 0"
            );
        });

        it("network 0", async() => {
            await expectRevert(
                FeeHandler.new(daoSetter, proxy.address, zeroAddress, knc.address, BURN_BLOCK_INTERVAL),
                "FeeHandler: KyberNetwork 0"
            );
        });

        it("KNC 0", async() => {
            await expectRevert(
                FeeHandler.new(daoSetter, proxy.address, kyberNetwork, zeroAddress, BURN_BLOCK_INTERVAL),
                "FeeHandler: KNC 0"
            );
        });

        it("burnBlockInterval 0", async() => {
            await expectRevert(
                FeeHandler.new(daoSetter, proxy.address, kyberNetwork, knc.address, zeroBN),
                "FeeHandler: _burnBlockInterval 0"
            );
        });
    });

    it("test read BRR function", async() => {    
        let results = await feeHandler.readBRRData();
        // console.log(results);
        Helper.assertEqual(results.rewardBps, rewardInBPS, "Actual decoded rewardInBPS is not correct");
        Helper.assertEqual(results.rebateBps, rebateInBPS, "Actual decoded rebateInBPS is not correct");
        Helper.assertEqual(results.expiryBlock, expiryBlockNumber, "Actual decoded expiryBlockNumber is not correct");
        Helper.assertEqual(results.epoch, epoch, "Actual decoded epoch is not correct");
    });
   
    describe("test getBRR and updateBRRData functions", async() => {
        let defaultEpoch;
        let defaultExpiryBlock;

        before("init variables", async() => {
            defaultEpoch = zeroBN;
            defaultExpiryBlock = new BN(5);
            await mockDAO.setMockBRR(rewardInBPS, rebateInBPS);
            await mockDAO.setMockEpochAndExpiryBlock(defaultEpoch, defaultExpiryBlock);
        });

        afterEach("reset to default BRR values", async() => {
            await mockDAO.setMockBRR(rewardInBPS, rebateInBPS);
            await mockDAO.setMockEpochAndExpiryBlock(defaultEpoch, defaultExpiryBlock);
        });

        after("set default values", async() => {
            let results = await feeHandler.readBRRData();
            rewardBps = results.rewardBps;
            rebateBps = results.rebateBps;
            expiryBlock = results.expiryBlock;
            epoch = results.epoch;
        });

        it("should revert if burnBps causes overflow", async() => {
            let badDAO = await BadDAO.new(rewardInBPS, rebateInBPS, epoch, expiryBlockNumber);
            feeHandler = await FeeHandler.new(daoSetter, proxy.address, kyberNetwork, knc.address, BURN_BLOCK_INTERVAL);
            await feeHandler.setDaoContract(badDAO.address, {from: daoSetter});
            await badDAO.setFeeHandler(feeHandler.address);
            await badDAO.setMockBRR(new BN(2).pow(new BN(256)).sub(new BN(1)), BPS, new BN(1));
            await expectRevert(
                feeHandler.getBRR(),
                "burnBps overflow"
            );
        });

        it("should revert if rewardBps causes overflow", async() => {
            let badDAO = await BadDAO.new(rewardInBPS, rebateInBPS, epoch, expiryBlockNumber);
            feeHandler = await FeeHandler.new(daoSetter, proxy.address, kyberNetwork, knc.address, BURN_BLOCK_INTERVAL);
            await feeHandler.setDaoContract(badDAO.address, {from: daoSetter});
            await badDAO.setFeeHandler(feeHandler.address);
            await badDAO.setMockBRR(BPS, new BN(2).pow(new BN(256)).sub(new BN(1)), new BN(1));
            await expectRevert(
                feeHandler.getBRR(),
                "rewardBps overflow"
            );
        });

        it("should revert if rebateBps overflows", async() => {
            let badDAO = await BadDAO.new(rewardInBPS, rebateInBPS, epoch, expiryBlockNumber);
            feeHandler = await FeeHandler.new(daoSetter, proxy.address, kyberNetwork, knc.address, BURN_BLOCK_INTERVAL);
            await feeHandler.setDaoContract(badDAO.address, {from: daoSetter});
            await badDAO.setFeeHandler(feeHandler.address);
            await badDAO.setMockBRR(BPS, new BN(1), new BN(2).pow(new BN(256)).sub(new BN(1)));
            await expectRevert(
                feeHandler.getBRR(),
                "rebateBps overflow"
            );
        });

        it("should revert if bad BRR values are returned", async() => {
            let badDAO = await BadDAO.new(rewardInBPS, rebateInBPS, epoch, expiryBlockNumber);
            feeHandler = await FeeHandler.new(daoSetter, proxy.address, kyberNetwork, knc.address, BURN_BLOCK_INTERVAL);
            await feeHandler.setDaoContract(badDAO.address, {from: daoSetter});
            await badDAO.setFeeHandler(feeHandler.address);
            await badDAO.setMockBRR(zeroBN, zeroBN, zeroBN);
            await expectRevert(
                feeHandler.getBRR(),
                "Bad BRR values"
            );
        });

        it("should revert if expiry block >= 2 ** 64", async() => {
            let badExpiryBlock = new BN(2).pow(new BN(64));
            await mockDAO.setMockEpochAndExpiryBlock(defaultEpoch, badExpiryBlock);
            await expectRevert(
                feeHandler.getBRR(),
                "expiry block overflow"
            );

            badExpiryBlock = badExpiryBlock.add(new BN(1));
            await mockDAO.setMockEpochAndExpiryBlock(defaultEpoch, badExpiryBlock);
            await expectRevert(
                feeHandler.getBRR(),
                "expiry block overflow"
            );
        });

        it("should revert if epoch >= 2 ** 32", async() => {
            let badEpoch = new BN(2).pow(new BN(32));
            await mockDAO.setMockEpochAndExpiryBlock(badEpoch, defaultExpiryBlock);
            await expectRevert(
                feeHandler.getBRR(),
                "epoch overflow"
            );

            badEpoch = badEpoch.add(new BN(1));
            await mockDAO.setMockEpochAndExpiryBlock(badEpoch, defaultExpiryBlock);
            await expectRevert(
                feeHandler.getBRR(),
                "epoch overflow"
            );
        });

        it("should have updated BRR if epoch == 2 ** 32 - 1", async() => {
            let maxEpoch = (new BN(2).pow(new BN(32))).sub(new BN(1));
            await mockDAO.setMockEpochAndExpiryBlock(maxEpoch, defaultExpiryBlock);
            await feeHandler.getBRR();
            let result = await feeHandler.readBRRData();
            Helper.assertEqual(result.epoch, maxEpoch, "epoch was not updated");
        });

        it("should have updated BRR if expiryBlock == 2 ** 64 - 1", async() => {
            let maxEpiryBlock = new BN(2).pow(new BN(64)).sub(new BN(1));
            await mockDAO.setMockEpochAndExpiryBlock(defaultEpoch, maxEpiryBlock);
            await feeHandler.getBRR();
            let result = await feeHandler.readBRRData();
            Helper.assertEqual(result.expiryBlock, maxEpiryBlock, "expiry block was not updated");
        });
    });

    describe("test permissions: onlyDAO, onlyKyberNetwork, only dao setter", async() => {
        it("reverts handleFees if called by non-network", async() => {
            let platformWallet = accounts[1];
            await expectRevert(
                feeHandler.handleFees([], [], platformWallet, oneEth, {from: user, value: oneEth}),
                "Only Kyber"
            );
        });

        it("reverts claimStakerReward if called by non-DAO", async() => {
            const BRRData = await feeHandler.readBRRData();   
            let currentEpoch = BRRData.epoch;

            await expectRevert(
                feeHandler.claimStakerReward(user, oneEth, currentEpoch, {from: user}),
                "Only DAO"
            );
        });

        it("reverts if non-DAO setter tries to set DAO contract", async() => {
            feeHandler = await FeeHandler.new(daoSetter, proxy.address, kyberNetwork, knc.address, BURN_BLOCK_INTERVAL);
            await expectRevert.unspecified(
                feeHandler.setDaoContract(mockDAO.address, {from: user})
            );
            // await expectRevert(
            //     feeHandler.setDaoContract(mockDAO.address, {from: user}),
            //     "only DAO setter"
            // );
        });
    });

    describe("test handle fees and claiming rebate / reward / fee", async() => {
        let currentRewardBps;
        let currentRebateBps;
        let currentEpoch;
        let curentExpiryBlock;

        let rebateBpsPerWallet = [new BN(2000), new BN(3000), new BN(5000)];
        
        beforeEach("set BRR data", async() => {
            const BRRData = await feeHandler.readBRRData();   
            currentRewardBps = BRRData.rewardBps;
            currentRebateBps = BRRData.rebateBps;
            currentEpoch = BRRData.epoch;
        });

        it("test total rebates total rewards updated correctly", async() => {
            const platformWallet = accounts[1];
            const platformFeeWei = 0;
            let sendVal = oneEth;

            await feeHandler.handleFees(rebateWallets, rebateBpsPerWallet , platformWallet, platformFeeWei,
                {from: kyberNetwork, value: sendVal});

            let expectedTotalReward = sendVal.mul(currentRewardBps).div(BPS);
            let expectedTotalRebate = sendVal.mul(currentRebateBps).div(BPS);

            let expectedTotalPayOut = expectedTotalReward.add(expectedTotalRebate);
            let totalPayOutBalance = await feeHandler.totalPayoutBalance();
            Helper.assertEqual(expectedTotalPayOut, totalPayOutBalance);
            
            sendVal = oneEth.div(new BN(33));
            await feeHandler.handleFees(rebateWallets, rebateBpsPerWallet , platformWallet, platformFeeWei,
                {from: kyberNetwork, value: sendVal});

            expectedTotalReward = expectedTotalReward.add(sendVal.mul(currentRewardBps).div(BPS));
            expectedTotalRebate = expectedTotalRebate.add(sendVal.mul(currentRebateBps).div(BPS));

            expectedTotalPayOut = expectedTotalReward.add(expectedTotalRebate);
            totalPayOutBalance = await feeHandler.totalPayoutBalance();
            Helper.assertEqual(expectedTotalPayOut, totalPayOutBalance);
        });

        it("reverts if platformFee > sendVal when calling handleFees", async() => {
            let platformWallet = accounts[9];
            let platformFeeWei = oneEth.add(new BN(1));
            await expectRevert(
                feeHandler.handleFees([], [] , platformWallet, platformFeeWei,
                    {from: kyberNetwork, value: oneEth}),
                "msg.value low"
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
                    "Transfer rebates failed."
                );
            });

            it("reverts if totalPayoutBalance < amount", async() => {
                let sendVal = oneEth;
                const platformWallet = accounts[1];
                const platformFeeWei = 0;
                feeHandler = await BadFeeHandler.new(daoSetter, proxy.address, kyberNetwork, knc.address, BURN_BLOCK_INTERVAL);

                await feeHandler.handleFees(rebateWallets, rebateBpsPerWallet , platformWallet, platformFeeWei,
                {from: kyberNetwork, value: sendVal});
                
                await feeHandler.setTotalPayoutBalance(zeroBN);
                await expectRevert(
                    feeHandler.claimReserveRebate(rebateWallets[0]),
                    "amount too high"
                );
            });
        });

        describe("staking rewards", async() => {
            it("claim reward and see total payout balance updated.", async() => {
                let sendVal = oneEth;
                
                await callHandleFeeAndVerifyValues(
                    sendVal, zeroAddress, 0, currentRebateBps, currentRewardBps, currentEpoch, 
                        rebateWallets, rebateBpsPerWallet  
                    );
                
                let totalPayOutBalanceBefore = await feeHandler.totalPayoutBalance();
                let rewardAmount = await feeHandler.rewardsPerEpoch(currentEpoch);

                let claim = precisionUnits.div(new BN(3));
                await mockDAO.claimStakerReward(user, claim, currentEpoch);
                
                let paidReward = rewardAmount.mul(claim).div(precisionUnits);
        
                let expectedTotalPayoutAfter = totalPayOutBalanceBefore.sub(paidReward);
                const totalPayOutBalance = await feeHandler.totalPayoutBalance();
                Helper.assertEqual(expectedTotalPayoutAfter, totalPayOutBalance);
            });

            it("test reward per eopch updated correctly", async() => {
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

                expectedRewardPerEpoch = expectedRewardPerEpoch.add(sendVal.mul(currentRewardBps).div(BPS));
                rewardPerEpoch = await feeHandler.rewardsPerEpoch(currentEpoch);
                Helper.assertEqual(expectedRewardPerEpoch, rewardPerEpoch);
            });
            
            it("test reward per eopch updated when epoch advances", async() => {
                let sendVal = oneEth;
                
                await callHandleFeeAndVerifyValues(
                    sendVal, zeroAddress, 0, currentRebateBps, currentRewardBps, currentEpoch, 
                        rebateWallets, rebateBpsPerWallet  
                    );
                
                await mockDAO.advanceEpoch();
                await feeHandler.getBRR();   
                const BRRData = await feeHandler.readBRRData();   
                
                currentRewardBps = BRRData.rewardBps;
                currentRebateBps = BRRData.rebateBps;
                Helper.assertGreater(BRRData.epoch, currentEpoch);
                currentEpoch = BRRData.epoch;
            
                let rewardPerEpoch = await feeHandler.rewardsPerEpoch(currentEpoch);
                Helper.assertEqual(0, rewardPerEpoch);

                sendVal = oneEth.div(new BN(333));
                expectedRebates = await callHandleFeeAndVerifyValues(
                    sendVal, zeroAddress, 0, currentRebateBps, currentRewardBps, currentEpoch, 
                        rebateWallets, rebateBpsPerWallet  
                    );

                expectedRewardPerEpoch = sendVal.mul(currentRewardBps).div(BPS);
                rewardPerEpoch = await feeHandler.rewardsPerEpoch(currentEpoch);
                Helper.assertEqual(expectedRewardPerEpoch, rewardPerEpoch);
            });

            it("claim reward and see paid so far updated.", async() => {
                let sendVal = oneEth;
                
                await callHandleFeeAndVerifyValues(
                    sendVal, zeroAddress, 0, currentRebateBps, currentRewardBps, currentEpoch, 
                        rebateWallets, rebateBpsPerWallet  
                    );
                
                let rewardBefore = await feeHandler.rewardsPerEpoch(currentEpoch);
                let userBal = await Helper.getBalancePromise(user);
                
                let claim = precisionUnits.div(new BN(3));
                await mockDAO.claimStakerReward(user, claim, currentEpoch); // full reward

                let paidSoFar = await feeHandler.rewardsPaidPerEpoch(currentEpoch);
                let userBalAfter = await Helper.getBalancePromise(user);
                
                let expectedPaid = rewardBefore.mul(claim).div(precisionUnits);
                Helper.assertEqual(paidSoFar, expectedPaid);
                Helper.assertEqual(userBalAfter, userBal.add(expectedPaid));
            });

            // it("reverts if staker claims more his entitled reward", async() => {
            //     let claim = precisionUnits;
            //     await expectRevert(
            //         mockDAO.claimStakerReward(user, claim, currentEpoch),
            //         "Amount underflow"
            //     );
            // });

            it("reverts if staker claims more than total reward in 2 claims", async() => {
                let sendVal = oneEth;

                await callHandleFeeAndVerifyValues(
                    sendVal, zeroAddress, 0, currentRebateBps, currentRewardBps, currentEpoch, 
                        rebateWallets, rebateBpsPerWallet  
                    );
                
                let claim = precisionUnits.div(new BN(2));
                
                await mockDAO.claimStakerReward(user, claim, currentEpoch), // full reward
                claim = precisionUnits.div(new BN(2)).add(new BN(9));
                // claim = precisionUnits;

                await expectRevert(
                    mockDAO.claimStakerReward(user, claim, currentEpoch), // full reward
                    "paid per epoch high"
                );
            });

            it("reverts if staker claims more than full reward per epoch in 2 claims", async() => {
                let sendVal = oneEth;
                
                await callHandleFeeAndVerifyValues(
                    sendVal, zeroAddress, 0, currentRebateBps, currentRewardBps, currentEpoch, 
                        rebateWallets, rebateBpsPerWallet  
                    );
                
                await mockDAO.advanceEpoch();
                await feeHandler.getBRR();   
                
                sendVal = oneEth;
                await callHandleFeeAndVerifyValues(
                    sendVal, zeroAddress, 0, currentRebateBps, currentRewardBps, currentEpoch.add(new BN(1)), 
                        rebateWallets, rebateBpsPerWallet  
                    );
                
                currentEpoch++;
                
                let claim = precisionUnits.div(new BN(2));
                
                await mockDAO.claimStakerReward(user, claim, currentEpoch), // full reward
                claim = precisionUnits.div(new BN(2)).add(new BN(9));

                await expectRevert(
                    mockDAO.claimStakerReward(user, claim, currentEpoch), // full reward
                    "paid per epoch high"
                );
            });

            it("reverts if staker claims more than full reward in 1 claim", async() => {
                let sendVal = oneEth;
    
                await callHandleFeeAndVerifyValues(
                    sendVal, zeroAddress, 0, currentRebateBps, currentRewardBps, currentEpoch, 
                        rebateWallets, rebateBpsPerWallet  
                    );
                
                let claim = precisionUnits.add(new BN(1));
                
                await expectRevert(
                    mockDAO.claimStakerReward(user, claim, currentEpoch), // full reward
                    "percentage high"
                );
            });

            it("reverts if staker is non-payable contract", async() => {
                let sendVal = oneEth;
                let badUser = await NoPayableFallback.new();
                await callHandleFeeAndVerifyValues(
                    sendVal, zeroAddress, 0, currentRebateBps, currentRewardBps, currentEpoch, 
                        rebateWallets, rebateBpsPerWallet  
                    );

                let claim = precisionUnits.div(new BN(3));
                await expectRevert(
                    mockDAO.claimStakerReward(badUser.address, claim, currentEpoch),
                    "Transfer staker rewards failed."
                );
            });

            it("reverts if totalPayoutBalance < stakerAmt", async() => {
                let sendVal = oneEth;
                const platformWallet = accounts[1];
                const platformFeeWei = 0;

                let claim = precisionUnits;

                feeHandler = await BadFeeHandler.new(daoSetter, proxy.address, kyberNetwork, knc.address, BURN_BLOCK_INTERVAL);

                const BRRData = await feeHandler.readBRRData();   
                currentEpoch = BRRData.epoch;

                await feeHandler.handleFees(rebateWallets, rebateBpsPerWallet , platformWallet, platformFeeWei,
                {from: kyberNetwork, value: sendVal});
                
                await feeHandler.setTotalPayoutBalance(zeroBN);
                await feeHandler.setDaoContract(user, {from: daoSetter});
                await expectRevert(
                    feeHandler.claimStakerReward(user, claim, currentEpoch, {from: user}),
                    "Amount underflow"
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
                    "Transfer fee failed."
                ); 
            });

            it("reverts if totalPayoutBalance < platformFeeWei", async() => {
                let sendVal = oneEth;
                const platformWallet = accounts[1];
                const platformFeeWei = new BN(50000);

                feeHandler = await BadFeeHandler.new(daoSetter, proxy.address, kyberNetwork, knc.address, BURN_BLOCK_INTERVAL);

                await feeHandler.handleFees(rebateWallets, rebateBpsPerWallet , platformWallet, platformFeeWei,
                {from: kyberNetwork, value: sendVal});
                
                await feeHandler.setTotalPayoutBalance(zeroBN);
                await expectRevert(
                    feeHandler.claimPlatformFee(platformWallet),
                    "amount too high"
                );
            });
        });

        describe("burning", async() => {
            it("burn KNC test correct burn amount for full burn per call", async() => {
                let sendVal = oneEth.mul(new BN(30));
                let burnPerCall = await feeHandler.WEI_TO_BURN();
    
                await callHandleFeeAndVerifyValues(
                    sendVal, zeroAddress, 0, currentRebateBps, currentRewardBps, currentEpoch, 
                        rebateWallets, rebateBpsPerWallet  
                    );
    
                let feeHandlerBalance = await Helper.getBalancePromise(feeHandler.address);
                
                await feeHandler.burnKNC();
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
    
                await feeHandler.burnKNC();
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
    
                await feeHandler.burnKNC();
                let lastBurnBlock = new BN(await web3.eth.getBlockNumber());
                let nextBurnBlock = lastBurnBlock.add(blockInterval);
                // console.log("next burn block " + nextBurnBlock); 
                
                let currentBlock = await web3.eth.getBlockNumber();
                while (nextBurnBlock > currentBlock) {
                    await expectRevert(
                        feeHandler.burnKNC(),
                        "Wait more block to burn"
                    );
                    currentBlock = await web3.eth.getBlockNumber();
                    // log("block:" + currentBlock)
                }
                await feeHandler.burnKNC();
            });

            it("reverts if contract has insufficient ETH for burning", async() => {
                feeHandler = await BadFeeHandler.new(daoSetter, proxy.address, kyberNetwork, knc.address, BURN_BLOCK_INTERVAL);
                let sendVal = oneEth.mul(new BN(30));
                let burnPerCall = await feeHandler.WEI_TO_BURN();
                let platformWallet = accounts[9];
                let platformFeeWei = zeroBN;

                await feeHandler.handleFees(rebateWallets, rebateBpsPerWallet , platformWallet, platformFeeWei,
                    {from: kyberNetwork, value: sendVal});

                feeHandlerBalance = await Helper.getBalancePromise(feeHandler.address);
                await feeHandler.withdrawEther(feeHandlerBalance.sub(burnPerCall.add(new BN(1))), user);
                
                await expectRevert(
                    feeHandler.burnKNC(),
                    "contract balance too low"
                );
            });

            it("reverts if ETH-KNC > MAX_RATE", async() => {
                let sendVal = oneEth;
                let platformWallet = accounts[9];
                let platformFeeWei = zeroBN;

                await feeHandler.handleFees(rebateWallets, rebateBpsPerWallet , platformWallet, platformFeeWei,
                    {from: kyberNetwork, value: sendVal})

                //ETH-KNC RATE > MAX_RATE
                await proxy.setPairRate(ethAddress, knc.address, MAX_RATE.add(new BN(1)));
                await expectRevert(
                    feeHandler.burnKNC(),
                    "KNC rate out of bounds"
                );
            });

            it("reverts if KNC-ETH > MAX_RATE", async() => {
                let sendVal = oneEth;
                let platformWallet = accounts[9];
                let platformFeeWei = zeroBN;

                await feeHandler.handleFees(rebateWallets, rebateBpsPerWallet , platformWallet, platformFeeWei,
                    {from: kyberNetwork, value: sendVal})

                //KNC-ETH RATE > MAX_RATE
                await proxy.setPairRate(knc.address, ethAddress, MAX_RATE.add(new BN(1)));
                await expectRevert(
                    feeHandler.burnKNC(),
                    "KNC rate out of bounds"
                );

                //reset rates
                await proxy.setPairRate(ethAddress, knc.address, ethToKncPrecision);
                await proxy.setPairRate(knc.address, ethAddress, kncToEthPrecision);
            });

            it("reverts if both ETH-KNC & KNC-ETH > MAX_RATE", async() => {
                let sendVal = oneEth;
                let platformWallet = accounts[9];
                let platformFeeWei = zeroBN;

                await feeHandler.handleFees(rebateWallets, rebateBpsPerWallet , platformWallet, platformFeeWei,
                    {from: kyberNetwork, value: sendVal})

                //both rates > MAX_RATE
                await proxy.setPairRate(ethAddress, knc.address, MAX_RATE.add(new BN(1)));
                await proxy.setPairRate(knc.address, ethAddress, MAX_RATE.add(new BN(1)));
                await expectRevert(
                    feeHandler.burnKNC(),
                    "KNC rate out of bounds"
                );

                //reset rates
                await proxy.setPairRate(ethAddress, knc.address, ethToKncPrecision);
                await proxy.setPairRate(knc.address, ethAddress, kncToEthPrecision);
            });

            it("reverts if there's arbitrage in ETH <> KNC rates", async() => {
                let sendVal = oneEth;
                let platformWallet = accounts[9];
                let platformFeeWei = zeroBN;

                await feeHandler.handleFees(rebateWallets, rebateBpsPerWallet , platformWallet, platformFeeWei,
                    {from: kyberNetwork, value: sendVal})

                //set arbitrage rate
                await proxy.setPairRate(knc.address, ethAddress, kncToEthPrecision.add(new BN(10)));
                await expectRevert(
                    feeHandler.burnKNC(),
                    "internal KNC arb"
                );

                //reset rates
                await proxy.setPairRate(ethAddress, knc.address, ethToKncPrecision);
                await proxy.setPairRate(knc.address, ethAddress, kncToEthPrecision);
            });

            it("reverts if ETH <> KNC spread too large", async() => {
                let sendVal = oneEth;
                let platformWallet = accounts[9];
                let platformFeeWei = zeroBN;

                await feeHandler.handleFees(rebateWallets, rebateBpsPerWallet , platformWallet, platformFeeWei,
                    {from: kyberNetwork, value: sendVal})

                //set large spread in rates
                let kncPerEthRatePrecision = new BN(200);
                let kncPerEthRatePrecisionWSpread = kncPerEthRatePrecision.mul(new BN(100)).div(new BN(201));
                let ethToKncRatePrecision = precisionUnits.mul(new BN(kncPerEthRatePrecisionWSpread));
                let kncToEthRatePrecision = precisionUnits.div(new BN(kncPerEthRatePrecision));

                await proxy.setPairRate(ethAddress, knc.address, ethToKncRatePrecision);
                await proxy.setPairRate(knc.address, ethAddress, kncToEthRatePrecision);
                await expectRevert(
                    feeHandler.burnKNC(),
                    "high KNC spread"
                );

                //reset rates
                await proxy.setPairRate(ethAddress, knc.address, ethToKncPrecision);
                await proxy.setPairRate(knc.address, ethAddress, kncToEthPrecision);
            });

            it("reverts if malicious KNC token is used, and burning fails", async() => {
                //setup bad KNC
                let badKNC = await BadToken.new("KyberNetworkCrystal", "KNC", KNC_DECIMALS);
                await badKNC.transfer(proxy.address, oneKnc.mul(new BN(10000)));
                await proxy.setPairRate(ethAddress, badKNC.address, ethToKncPrecision);
                await proxy.setPairRate(badKNC.address, ethAddress, kncToEthPrecision);

                feeHandler = await FeeHandler.new(daoSetter, proxy.address, kyberNetwork, badKNC.address, BURN_BLOCK_INTERVAL);
                await feeHandler.setDaoContract(mockDAO.address, {from: daoSetter});

                let sendVal = oneEth;
                let platformWallet = accounts[9];
                let platformFeeWei = zeroBN;

                await feeHandler.handleFees(rebateWallets, rebateBpsPerWallet , platformWallet, platformFeeWei,
                    {from: kyberNetwork, value: sendVal})
                
                await expectRevert(
                    feeHandler.burnKNC(),
                    "KNC burn failed"
                );
            });

            it("should burn epoch rewards if DAO allows it, see values have been updated", async() => {
                let sendVal = oneEth.mul(new BN(30));
                let rebateBpsPerWallet = [new BN(2000), new BN(3000), new BN(5000)];

                await callHandleFeeAndVerifyValues(
                    sendVal, zeroAddress, 0, currentRebateBps, currentRewardBps, currentEpoch, 
                        rebateWallets, rebateBpsPerWallet  
                    );

                await mockDAO.setShouldBurnRewardTrue(currentEpoch);
                await feeHandler.shouldBurnEpochReward(currentEpoch);
                let rewardAmount = await feeHandler.rewardsPerEpoch(currentEpoch);
                Helper.assertEqual(rewardAmount, zeroBN, "rewards were not burnt");
            });

            it("reverts if kyberDAO is not set", async() => {
                feeHandler = await FeeHandler.new(daoSetter, proxy.address, kyberNetwork, knc.address, BURN_BLOCK_INTERVAL);

                let platformWallet = accounts[1];
                let platformFeeWei = oneEth;
                let rebateBpsPerWallet = [new BN(2000), new BN(3000), new BN(5000)];
                let sendVal = oneEth.add(oneEth);

                await feeHandler.handleFees(rebateWallets, rebateBpsPerWallet , platformWallet, platformFeeWei, {from: kyberNetwork, value: sendVal});

                let currentEpoch = new BN(1);
                
                await expectRevert(
                    feeHandler.shouldBurnEpochReward(currentEpoch),
                    "kyberDAO addr missing"
                );
            });

            it("reverts if kyberDAO prevents burning of reward", async() => {
                feeHandler = await FeeHandler.new(daoSetter, proxy.address, kyberNetwork, knc.address, BURN_BLOCK_INTERVAL);
                mockDAO = await MockDAO.new(
                    rewardInBPS,
                    rebateInBPS,
                    epoch,
                    expiryBlockNumber
                );
                await mockDAO.setFeeHandler(feeHandler.address);
                await feeHandler.setDaoContract(mockDAO.address, {from: daoSetter});

                let sendVal = oneEth.mul(new BN(30));
                let rebateBpsPerWallet = [new BN(2000), new BN(3000), new BN(5000)];
                let platformWallet = accounts[9];
                let platformFeeWei = zeroBN;

                await feeHandler.handleFees(rebateWallets, rebateBpsPerWallet, platformWallet, platformFeeWei, {from: kyberNetwork, value: sendVal});

                await expectRevert(
                    feeHandler.shouldBurnEpochReward(currentEpoch),
                    "should not burn reward"
                );
            });

            it("reverts if no reward to burn", async() => {
                await mockDAO.setShouldBurnRewardTrue(currentEpoch);
                await expectRevert(
                    feeHandler.shouldBurnEpochReward(currentEpoch),
                    "reward is 0"
                );
            });

            it("reverts if totalPayoutBalance < rewardAmount", async() => {
                let sendVal = oneEth;
                const platformWallet = accounts[1];
                const platformFeeWei = 0;
                feeHandler = await BadFeeHandler.new(daoSetter, proxy.address, kyberNetwork, knc.address, BURN_BLOCK_INTERVAL);

                await feeHandler.handleFees(rebateWallets, rebateBpsPerWallet , platformWallet, platformFeeWei,
                {from: kyberNetwork, value: sendVal});
                
                await feeHandler.setTotalPayoutBalance(zeroBN);
                await feeHandler.setDaoContract(mockDAO.address, {from: daoSetter});
                await mockDAO.setFeeHandler(feeHandler.address);
                currentEpoch = (await feeHandler.readBRRData()).epoch;
                await mockDAO.setShouldBurnRewardTrue(currentEpoch);

                await expectRevert(
                    feeHandler.shouldBurnEpochReward(currentEpoch),
                    "total reward less than epoch reward"
                );
            });
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
    await feeHandler.handleFees(rebateWalletArr, rebateBpsArr, platformWallet, platFeeWei, {from: kyberNetwork, value: sendValWei});
    
    //validate values
    let expectedRebates = [];
    for (let i = 0; i < rebateWalletArr.length; i++) {
        expectedRebates[i] = currentRebatesArr[i].add(feeAmountBRR.mul(rebateBps).div(BPS).mul(rebateBpsArr[i]).div(BPS));
        let actualRebate = await feeHandler.rebatePerWallet(rebateWalletArr[i]);
        Helper.assertEqual(actualRebate, expectedRebates[i]);
    }

    const actualFeeWallet = await feeHandler.feePerPlatformWallet(platformWallet);
    Helper.assertEqual(actualFeeWallet, expectedPlatWalletFee);
    
    const rewardForEpoch = await feeHandler.rewardsPerEpoch(epoch);
    Helper.assertEqual(rewardForEpoch, expectedRewardForEpoch);
    
    return expectedRebates;
}

function log(str) {
    console.log(str);
}
