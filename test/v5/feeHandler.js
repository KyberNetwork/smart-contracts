const Helper = require("../v4/helper.js");
const BN = web3.utils.BN;

const MockDAO = artifacts.require("MockDAO.sol");
const FeeHandler = artifacts.require("MockFeeHandler.sol");
const Token = artifacts.require("Token.sol");
const Proxy = artifacts.require("SimpleKyberProxy.sol");

const {BPS, precisionUnits, ethDecimals, ethAddress, zeroAddress, emptyHint} = require("../v4/helper.js");
const BITS_PER_PARAM = 64;
const KNC_DECIMALS = 18;
const BURN_BLOCK_INTERVAL = 5;

let kyberNetwork;
let proxy;
let user;
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

contract('FeeHandler', function(accounts) {
    before("Setting global variables", async() => {
        user = accounts[0];
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

    it("test encode decode total values ", async function() {
        totalRebates = new BN(150);
        totalRewards = new BN(250);

        let totalValues = await feeHandler.encodeTotalValues(totalRewards, totalRebates);
        // console.log("total values: (encoded) " + totalValues)

        let values = await feeHandler.decodeTotalValues(totalValues);

        Helper.assertEqual(values[0], totalRewards);
        Helper.assertEqual(values[1], totalRebates);
    })

    describe("test handle fees and claiming rebate / reward", async() => {
        let currentRewardBps;
        let currentRebateBps;
        let currentEpoch;
        let curentExpiryBlock;

        let rebatePercentBps = [new BN(2000), new BN(3000), new BN(5000)];
        
        // before("set network and fee handler", async() => {
        //     kyberNetwork = accounts[3];
        //     feeHandler = FeeHandler.new()
        // })
        beforeEach("new fee handler", async() => {
            feeHandler = await FeeHandler.new(daoSetter, proxy.address, kyberNetwork, knc.address, BURN_BLOCK_INTERVAL);
            await feeHandler.setDaoContract(mockDAO.address, {from: daoSetter});
            await feeHandler.getBRR();   
            const BRRData = await feeHandler.getSavedBRR();   
            
            // log(BRRData);

            currentRewardBps = BRRData.rewardBps;
            currentRebateBps = BRRData.rebateBps;
            currentEpoch = BRRData.epoch;
        })

        it("test total rebates total rewards updated correctly", async() => {
            let emptyArr = [];
            let sendVal = oneEth;

            await feeHandler.handleFees(emptyArr, emptyArr, {from: kyberNetwork, value: sendVal});

            let expectedTotalReward = sendVal.mul(currentRewardBps).div(BPS);
            let expectedTotalRebate = sendVal.mul(currentRebateBps).div(BPS);

            let totalAmounts = await feeHandler.getTotalAmounts();
            Helper.assertEqual(totalAmounts.totalRewardWei, expectedTotalReward);
            Helper.assertEqual(totalAmounts.totalRebateWei, expectedTotalRebate);

            sendVal = oneEth.div(new BN(33));
            await feeHandler.handleFees(emptyArr, emptyArr, {from: kyberNetwork, value: sendVal});

            expectedTotalReward = expectedTotalReward.add(sendVal.mul(currentRewardBps).div(BPS));
            expectedTotalRebate = expectedTotalRebate.add(sendVal.mul(currentRebateBps).div(BPS));

            totalAmounts = await feeHandler.getTotalAmounts();
            Helper.assertEqual(totalAmounts.totalRewardWei, expectedTotalReward);
            Helper.assertEqual(totalAmounts.totalRebateWei, expectedTotalRebate);
        });

        it("test rebate per wallet updated correctly", async() => {
            let sendVal = oneEth;
            
            expectedRebates = await callHandleFeeAndVerifyRebate(
                sendVal, currentRebateBps, rebateWallets, rebatePercentBps, []
                );
            
            sendVal = oneEth.div(new BN(333));            
            
            expectedRebates = await callHandleFeeAndVerifyRebate(
                sendVal, currentRebateBps, rebateWallets, rebatePercentBps, expectedRebates
                );
        })

        it("claim rebate see sent to wallet", async() => {
            let sendVal = new BN(0);
            let walletsEth = [];

            let expectedRebates = await callHandleFeeAndVerifyRebate(
                sendVal, currentRebateBps, rebateWallets, rebatePercentBps, []
                );
            for (let i = 0; i < rebateWallets.length; i++) {
                walletsEth[i] = new BN(await Helper.getBalancePromise(rebateWallets[i]));
            }
            sendVal = oneEth;
            expectedRebates = await callHandleFeeAndVerifyRebate(
                sendVal, currentRebateBps, rebateWallets, rebatePercentBps, expectedRebates
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
            
            expectedRebates = await callHandleFeeAndVerifyRebate(
                sendVal, currentRebateBps, rebateWallets, rebatePercentBps, expectedRebates
                );

         });

        it("claim rebate see total rebate updated", async() => {
            let sendVal = new BN(0);
            
            sendVal = oneEth;
            expectedRebates = await callHandleFeeAndVerifyRebate(
                sendVal, currentRebateBps, rebateWallets, rebatePercentBps, []
                );
            
            let totalAmounts = await feeHandler.getTotalAmounts();
            
            for (let i = 0; i < rebateWallets.length; i++) {
                await feeHandler.claimReserveRebate(rebateWallets[i]);
                let expectedTotal = totalAmounts.totalRebateWei.sub(expectedRebates[i]).add(new BN(1));
                totalAmounts = await feeHandler.getTotalAmounts();
                Helper.assertEqual(expectedTotal, totalAmounts.totalRebateWei);
            }

            log("here")
            
            totalAmounts = await feeHandler.getTotalAmounts();
            Helper.assertEqual(totalAmounts.totalRebateWei, rebateWallets.length, "each wallet exected to have 1 wei left");
        });

        it("test reward per eopch updated correctly", async() => {
            

        })
       
    });

    // Test handleFees
    // Test claimStakerReward
    // Test claimReserveRebate


})

async function callHandleFeeAndVerifyRebate(sendVal, rebateBps, rebateWalletArr, rebateBpsArr, currentRebatesArr) {
    await feeHandler.handleFees(rebateWalletArr, rebateBpsArr, {from: kyberNetwork, value: sendVal});
            
    let expectedRebates = [];
    for (let i = 0; i < rebateWalletArr.length; i++) {
        if (currentRebatesArr[i] == undefined) currentRebatesArr[i] = new BN(0);
        expectedRebates[i] = currentRebatesArr[i].add(sendVal.mul(rebateBps).div(BPS).mul(rebateBpsArr[i]).div(BPS));
        let actualRebate = await feeHandler.rebatePerWallet(rebateWalletArr[i]);
        Helper.assertEqual(actualRebate, expectedRebates[i]);
    }

    return expectedRebates;
}

function log(str) {
    console.log(str);
}
