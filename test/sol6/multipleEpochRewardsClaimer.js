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

const blockTime = 16; // each block is mined after 16s
const KNC_DECIMALS = 18;
const BURN_BLOCK_INTERVAL = 3;

let proxy;
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

        platformWallet = accounts[1];
        rebateWallets.push(accounts[1]);
        rebateBpsPerWallet = [BPS];

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

        // setup feeHandler
        feeHandler = await FeeHandler.new(daoSetter, proxy.address, kyberNetwork, knc.address, BURN_BLOCK_INTERVAL, daoOperator);
        await feeHandler.setDaoContract(mockKyberDao.address, {from: daoSetter})
        await feeHandler.setBurnConfigParams(sanityRate.address, ethWeiToBurn, {from: daoOperator});
        await feeHandler.getBRR();

        // setup rewardsClaimer
        rewardsClaimer = await MultipleEpochRewardsClaimer.new(mockKyberDao.address);
    });

    describe("test getUnclaimedEpochs function", async() => {
        let initialEpoch;
        let currentEpoch;
        let numEpochs = 3;
        // beforeEach("send feeHandler fees for numEpochs", async() => {
        //     initialEpoch = (await mockKyberDao.epoch()).toNumber();
        //     await sendFeesToAllFeeHandlers(mockKyberDao, [feeHandler], numEpochs);
        //     currentEpoch = (await mockKyberDao.epoch()).toNumber();
        // });

        it("should return empty array if initial epoch is 0", async() => {
            result = await rewardsClaimer.getUnclaimedEpochs(feeHandler.address, staker);
            Helper.assertEqual(result.length, zeroBN, "result not empty");
        });

        it("should return empty array if no fees were allocated to staker", async() => {
            await mockKyberDao.setStakerPercentageInPrecision(zeroBN);
            initialEpoch = (await mockKyberDao.epoch()).toNumber();
            await sendFeesToFeeHandler(mockKyberDao, feeHandler, numEpochs);
            currentEpoch = (await mockKyberDao.epoch()).toNumber();
    
            result = await rewardsClaimer.getUnclaimedEpochs(feeHandler.address, zeroAddress);
            Helper.assertEqual(result.length, zeroBN, "result not empty");
            await mockKyberDao.setStakerPercentageInPrecision(stakerPercentageInPrecision);
        });

        it("should return all unclaimed epochs for staker", async() => {
            initialEpoch = (await mockKyberDao.epoch()).toNumber();
            await sendFeesToFeeHandler(mockKyberDao, feeHandler, numEpochs);
            currentEpoch = (await mockKyberDao.epoch()).toNumber();
    
            result = await rewardsClaimer.getUnclaimedEpochs(feeHandler.address, zeroAddress);
            Helper.assertGreater(result.length, zeroBN, "result is empty");
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
