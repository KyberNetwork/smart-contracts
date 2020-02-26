const Helper = require("../v4/helper.js");
const BN = web3.utils.BN;

const MockDAO = artifacts.require("MockDAO.sol");
const FeeHandler = artifacts.require("MockFeeHandler.sol");
const Token = artifacts.require("Token.sol");
const Proxy = artifacts.require("SimpleKyberProxy.sol");

const {BPS, precisionUnits, ethDecimals, ethAddress, zeroAddress, emptyHint} = require("../v4/helper.js");
const { expectEvent, expectRevert } = require('@openzeppelin/test-helpers');

const BITS_PER_PARAM = 64;
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
        feeHandler = await FeeHandler.new(daoSetter, proxy.address, kyberNetwork, knc.address, BURN_BLOCK_INTERVAL);
        await feeHandler.setDaoContract(mockDAO.address, {from: daoSetter});
        await feeHandler.getBRR();

        await knc.transfer(proxy.address, oneKnc.mul(new BN(10000)));
        await Helper.sendEtherWithPromise(accounts[9], proxy.address, oneEth.mul(new BN(100)));

        await proxy.setPairRate(ethAddress, knc.address, ethToKncPrecision);
        await proxy.setPairRate(knc.address, ethAddress, kncToEthPrecision);
    });
    
    beforeEach("Update epoch and expiry block before each test", async() => {
        // epoch and expiry block will probably update as test proceeds.
        // so before each could update it to current block + x
        // or something like this.
    });

    it("Test encode BRR function", async function() {
        let expectedEncodedData = rewardInBPS.shln(BITS_PER_PARAM).add(rebateInBPS).shln(BITS_PER_PARAM).add(epoch).shln(BITS_PER_PARAM).add(expiryBlockNumber);
        let actualEncodedData = await feeHandler.encodeBRRData(rewardInBPS, rebateInBPS, epoch, expiryBlockNumber);
        Helper.assertEqual(actualEncodedData, expectedEncodedData, "Actual encoded data is not correct");
    });

    it("Test decode BRR function", async function() {
        let results = await feeHandler.decodeBRRData();
        // console.log(results);
        Helper.assertEqual(results['0'], rewardInBPS, "Actual decoded rewardInBPS is not correct");
        Helper.assertEqual(results['1'], rebateInBPS, "Actual decoded rebateInBPS is not correct");
        Helper.assertEqual(results['2'], expiryBlockNumber, "Actual decoded expiryBlockNumber is not correct");
        Helper.assertEqual(results['3'], epoch, "Actual decoded epoch is not correct");
    });
   
    describe("test handle fees and claiming rebate / reward / fee", async() => {
        let currentRewardBps;
        let currentRebateBps;
        let currentEpoch;
        let curentExpiryBlock;

        let rebatePerWalletBps = [new BN(2000), new BN(3000), new BN(5000)];
        
        // before("set network and fee handler", async() => {
        //     kyberNetwork = accounts[3];
        //     feeHandler = FeeHandler.new()
        // })
        beforeEach("new fee handler", async() => {
            feeHandler = await FeeHandler.new(daoSetter, proxy.address, kyberNetwork, knc.address, BURN_BLOCK_INTERVAL);
            await feeHandler.setDaoContract(mockDAO.address, {from: daoSetter});
            await feeHandler.getBRR();   
            const BRRData = await feeHandler.getSavedBRR();   
            
            await mockDAO.setFeeHandler(feeHandler.address);

            // log(BRRData);

            currentRewardBps = BRRData.rewardBps;
            currentRebateBps = BRRData.rebateBps;
            currentEpoch = BRRData.epoch;
        })

        it("test total rebates total rewards updated correctly", async() => {
            const platformWallet = accounts[1];
            const platformFeeWei = 0;
            let bpsPerWallet = [10000];
            let sendVal = oneEth;

            await feeHandler.handleFees(rebateWallets, rebatePerWalletBps , platformWallet, platformFeeWei,
                {from: kyberNetwork, value: sendVal});

            let expectedTotalReward = sendVal.mul(currentRewardBps).div(BPS);
            let expectedTotalRebate = sendVal.mul(currentRebateBps).div(BPS);

            let expectedTotalPayOut = expectedTotalReward.add(expectedTotalRebate);
            let totalPayOutBalance = await feeHandler.totalPayoutBalance();
            Helper.assertEqual(expectedTotalPayOut, totalPayOutBalance);
            
            sendVal = oneEth.div(new BN(33));
            await feeHandler.handleFees(rebateWallets, rebatePerWalletBps , platformWallet, platformFeeWei,
                {from: kyberNetwork, value: sendVal});

            expectedTotalReward = expectedTotalReward.add(sendVal.mul(currentRewardBps).div(BPS));
            expectedTotalRebate = expectedTotalRebate.add(sendVal.mul(currentRebateBps).div(BPS));

            expectedTotalPayOut = expectedTotalReward.add(expectedTotalRebate);
            totalPayOutBalance = await feeHandler.totalPayoutBalance();
            Helper.assertEqual(expectedTotalPayOut, totalPayOutBalance);
        });

        it("test rebate per wallet and rewards per epoch updated correctly", async() => {
            let sendVal = oneEth;
            
            await callHandleFeeAndVerifyValues(
                sendVal, zeroAddress, 0, currentRebateBps, currentRewardBps, currentEpoch, 
                    rebateWallets, rebatePerWalletBps 
                );
            
            sendVal = oneEth.div(new BN(333));            
            
            await callHandleFeeAndVerifyValues(
                sendVal, zeroAddress, 0, currentRebateBps, currentRewardBps, currentEpoch, 
                    rebateWallets, rebatePerWalletBps  
                );
        });

        it("claim rebate see sent to wallet", async() => {
            let sendVal = new BN(0);
            let walletsEth = [];

            let expectedRebates = await callHandleFeeAndVerifyValues(
                sendVal, zeroAddress, 0, currentRebateBps, currentRewardBps, currentEpoch, 
                    rebateWallets, rebatePerWalletBps  
                );


            for (let i = 0; i < rebateWallets.length; i++) {
                walletsEth[i] = new BN(await Helper.getBalancePromise(rebateWallets[i]));
            }
            sendVal = oneEth;
            expectedRebates = await callHandleFeeAndVerifyValues(
                sendVal, zeroAddress, 0, currentRebateBps, currentRewardBps, currentEpoch, 
                    rebateWallets, rebatePerWalletBps  
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
                    rebateWallets, rebatePerWalletBps  
                );
        });

        it("claim rebate see total payout balance updated", async() => {
            let sendVal = new BN(0);
            
            sendVal = oneEth;
            expectedRebates = await callHandleFeeAndVerifyValues(
                sendVal, zeroAddress, 0, currentRebateBps, currentRewardBps, currentEpoch, 
                    rebateWallets, rebatePerWalletBps  
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

        it("claim reward and see total payout balance updated.", async() => {
            let sendVal = oneEth;
            
            await callHandleFeeAndVerifyValues(
                sendVal, zeroAddress, 0, currentRebateBps, currentRewardBps, currentEpoch, 
                    rebateWallets, rebatePerWalletBps  
                );
            
            let totalPayOutBalanceBefore = await feeHandler.totalPayoutBalance();
            let rewardAmount = await feeHandler.rewardsPerEpoch(currentEpoch);

            let claim = precisionUnits.div(new BN(3));
            await mockDAO.claimStakerReward(user, claim, currentEpoch);
            
            let payedReward = rewardAmount.mul(claim).div(precisionUnits);
    
            let expectedTotalPayoutAfter = totalPayOutBalanceBefore.sub(payedReward);
            const totalPayOutBalance = await feeHandler.totalPayoutBalance();
            Helper.assertEqual(expectedTotalPayoutAfter, totalPayOutBalance);
        });

        it("test reward per eopch updated correctly", async() => {
            let sendVal = oneEth;
            
            sendVal = oneEth;
            await callHandleFeeAndVerifyValues(
                sendVal, zeroAddress, 0, currentRebateBps, currentRewardBps, currentEpoch, 
                    rebateWallets, rebatePerWalletBps  
                );

            let expectedRewardPerEpoch = sendVal.mul(currentRewardBps).div(BPS);
            let rewardPerEpoch = await feeHandler.rewardsPerEpoch(currentEpoch);
            Helper.assertEqual(expectedRewardPerEpoch, rewardPerEpoch);

            sendVal = oneEth.div(new BN(333));
            expectedRebates = await await callHandleFeeAndVerifyValues(
                sendVal, zeroAddress, 0, currentRebateBps, currentRewardBps, currentEpoch, 
                    rebateWallets, rebatePerWalletBps  
                );

            expectedRewardPerEpoch = expectedRewardPerEpoch.add(sendVal.mul(currentRewardBps).div(BPS));
            rewardPerEpoch = await feeHandler.rewardsPerEpoch(currentEpoch);
            Helper.assertEqual(expectedRewardPerEpoch, rewardPerEpoch);
        });
        
        it("test reward per eopch updated when epoch advances", async() => {
            let sendVal = oneEth;
            
            sendVal = oneEth;
            let expectedRebates = await callHandleFeeAndVerifyValues(
                sendVal, zeroAddress, 0, currentRebateBps, currentRewardBps, currentEpoch, 
                    rebateWallets, rebatePerWalletBps  
                );
            
            await mockDAO.advanceEpoch();
            await feeHandler.getBRR();   
            const BRRData = await feeHandler.getSavedBRR();   
            
            currentRewardBps = BRRData.rewardBps;
            currentRebateBps = BRRData.rebateBps;
            Helper.assertGreater(BRRData.epoch, currentEpoch);
            currentEpoch = BRRData.epoch;
        
            let rewardPerEpoch = await feeHandler.rewardsPerEpoch(currentEpoch);
            Helper.assertEqual(0, rewardPerEpoch);

            sendVal = oneEth.div(new BN(333));
            expectedRebates = await callHandleFeeAndVerifyValues(
                sendVal, zeroAddress, 0, currentRebateBps, currentRewardBps, currentEpoch, 
                    rebateWallets, rebatePerWalletBps  
                );

            expectedRewardPerEpoch = sendVal.mul(currentRewardBps).div(BPS);
            rewardPerEpoch = await feeHandler.rewardsPerEpoch(currentEpoch);
            Helper.assertEqual(expectedRewardPerEpoch, rewardPerEpoch);
        })

        it("claim reward and see payed so far updated.", async() => {
            let sendVal = oneEth;
            
            sendVal = oneEth;
            let expectedRebates = await callHandleFeeAndVerifyValues(
                sendVal, zeroAddress, 0, currentRebateBps, currentRewardBps, currentEpoch, 
                    rebateWallets, rebatePerWalletBps  
                );
            
            let rewardBefore = await feeHandler.rewardsPerEpoch(currentEpoch);
            let userBal = await Helper.getBalancePromise(user);
            
            let claim = precisionUnits.div(new BN(3));
            await mockDAO.claimStakerReward(user, claim, currentEpoch); // full reward

            let payedSoFar = await feeHandler.rewardsPayedPerEpoch(currentEpoch);
            let userBalAfter = await Helper.getBalancePromise(user);
            
            let expectedPayed = rewardBefore.mul(claim).div(precisionUnits);
            Helper.assertEqual(payedSoFar, expectedPayed);
            Helper.assertEqual(userBalAfter, userBal.add(expectedPayed));
        })

        it("send platform fee (no rebates), see values updated", async() => {
            let sendVal = oneEth;
            let platformWallet = accounts[5];
            let platformFeeWei = new BN(50000);
            rebateWallets = []
            rebatePerWalletBps = []

            let walletFee0 = await feeHandler.feePerPlatformWallet(platformWallet);

            await callHandleFeeAndVerifyValues(
                sendVal, platformWallet, platformFeeWei, currentRebateBps, currentRewardBps, currentEpoch, 
                    rebateWallets, rebatePerWalletBps  
                );

            let expectedFeeValue = walletFee0.add(platformFeeWei);
            let walletFee1 = await feeHandler.feePerPlatformWallet(platformWallet);
            
            Helper.assertEqual(expectedFeeValue, walletFee1);
            
            sendVal = oneEth.div(new BN(333));            
            
            await callHandleFeeAndVerifyValues(
                sendVal, platformWallet, platformFeeWei, currentRebateBps, currentRewardBps, currentEpoch, 
                    rebateWallets, rebatePerWalletBps  
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
                    rebateWallets, rebatePerWalletBps  
                );

            let expectedFeeValue = walletFee0.add(platformFeeWei);
            let walletFee1 = await feeHandler.feePerPlatformWallet(platformWallet);
            
            Helper.assertEqual(expectedFeeValue, walletFee1);
            
            sendVal = oneEth.div(new BN(333));            
            
            await callHandleFeeAndVerifyValues(
                sendVal, platformWallet, platformFeeWei, currentRebateBps, currentRewardBps, currentEpoch, 
                    rebateWallets, rebatePerWalletBps  
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
            rebatePerWalletBps = []

            await callHandleFeeAndVerifyValues(
                sendVal, platformWallet, platformFeeWei, currentRebateBps, currentRewardBps, currentEpoch, 
                    rebateWallets, rebatePerWalletBps  
                );
            
            let walletBalance0 = await await Helper.getBalancePromise(platformWallet);
            
            // claim
            await feeHandler.claimPlatformFee(platformWallet);
            let walletFeeAfter = await feeHandler.feePerPlatformWallet(platformWallet);
            Helper.assertEqual(walletFeeAfter, 1);

            let walletBalance1 = await Helper.getBalancePromise(platformWallet);
            let expectedBalance = walletBalance0.add(platformFeeWei.sub(new BN(1)));
            
            Helper.assertEqual(walletBalance1, expectedBalance)          
        });

        it("claim more then full reward in 1 claim. see revert.", async() => {
            let sendVal = oneEth;
            
            sendVal = oneEth;
            let expectedRebates = await callHandleFeeAndVerifyValues(
                sendVal, zeroAddress, 0, currentRebateBps, currentRewardBps, currentEpoch, 
                    rebateWallets, rebatePerWalletBps  
                );
            
            let claim = precisionUnits.add(new BN(1));
            
            await expectRevert(
                mockDAO.claimStakerReward(user, claim, currentEpoch), // full reward
                "percentage high"
            );
        });

        it("claim more then total reward in 2 claims. see revert.", async() => {
            let sendVal = oneEth;
            
            sendVal = oneEth;
            await callHandleFeeAndVerifyValues(
                sendVal, zeroAddress, 0, currentRebateBps, currentRewardBps, currentEpoch, 
                    rebateWallets, rebatePerWalletBps  
                );
            
            let claim = precisionUnits.div(new BN(2));
            
            await mockDAO.claimStakerReward(user, claim, currentEpoch), // full reward
            claim = precisionUnits.div(new BN(2)).add(new BN(9));
            // claim = precisionUnits;

            await expectRevert(
                mockDAO.claimStakerReward(user, claim, currentEpoch), // full reward
                "payed per epoch high"
            );
        });

        it("claim more then full reward per epoch in 2 claims. see revert.", async() => {
            let sendVal = oneEth;
            
            sendVal = oneEth;
            await callHandleFeeAndVerifyValues(
                sendVal, zeroAddress, 0, currentRebateBps, currentRewardBps, currentEpoch, 
                    rebateWallets, rebatePerWalletBps  
                );
            
            await mockDAO.advanceEpoch();
            await feeHandler.getBRR();   
            
            sendVal = oneEth;
            await callHandleFeeAndVerifyValues(
                sendVal, zeroAddress, 0, currentRebateBps, currentRewardBps, currentEpoch.add(new BN(1)), 
                    rebateWallets, rebatePerWalletBps  
                );
            
            currentEpoch++;
            
            let claim = precisionUnits.div(new BN(2));
            
            await mockDAO.claimStakerReward(user, claim, currentEpoch), // full reward
            claim = precisionUnits.div(new BN(2)).add(new BN(9));

            await expectRevert(
                mockDAO.claimStakerReward(user, claim, currentEpoch), // full reward
                "payed per epoch high"
            );
        });

        it("burn KNC test correct burn amount for full burn per call", async() => {
            let sendVal = oneEth;
            let burnPerCall = await feeHandler.WEI_TO_BURN();

            sendVal = oneEth.mul(new BN(30));
            await callHandleFeeAndVerifyValues(
                sendVal, zeroAddress, 0, currentRebateBps, currentRewardBps, currentEpoch, 
                    rebateWallets, rebatePerWalletBps  
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
                    rebateWallets, rebatePerWalletBps  
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
            let sendVal = oneEth;
            let burnPerCall = await feeHandler.WEI_TO_BURN();
            let blockInterval = await feeHandler.burnBlockInterval();

            sendVal = oneEth.mul(new BN(30));
            await callHandleFeeAndVerifyValues(
                sendVal, zeroAddress, 0, currentRebateBps, currentRewardBps, currentEpoch, 
                    rebateWallets, rebatePerWalletBps  
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
