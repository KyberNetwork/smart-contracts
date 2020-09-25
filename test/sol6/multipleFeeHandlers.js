const Helper = require("../helper.js");
const nwHelper = require("./networkHelper");
const BN = web3.utils.BN;
const { expectRevert } = require('@openzeppelin/test-helpers');

const MockKyberDao = artifacts.require("MockKyberDao.sol");
const FeeHandler = artifacts.require("KyberFeeHandler.sol");
const BurnKncSanityRate = artifacts.require("MockChainLinkSanityRate.sol");
const FeeTokenHandler = artifacts.require("KyberTokenFeeHandler.sol");
const FeeWrapper = artifacts.require("KyberFeeHandlerWrapper.sol");
const Token = artifacts.require("Token.sol");
const Proxy = artifacts.require("SimpleKyberProxy.sol");
const {BPS, precisionUnits, ethDecimals, ethAddress, zeroAddress, zeroBN, MAX_RATE} = require("../helper.js");

const blockTime = 16; // each block is mined after 16s
const DAI_DECIMALS = 18;
const EURS_DECIMALS = 2;
const KNC_DECIMALS = 18;
const USDC_DECIMALS = 6;
const BURN_BLOCK_INTERVAL = 3;

let proxy;
let staker;
let daoSetter;
let daoOperator;
let mockKyberDao;
let dai;
let eurs;
let knc;
let usdc;
let ethFeeHandler;
let daiFeeHandler;
let usdcFeeHandler;
let feeHandlers = {};
let feeWrapper;

let rewardInBPS = new BN(5000);
let rebateInBPS = new BN(2500);
let epoch;
let expiryTimestamp;

let rebateWallets = [];
let rebateBpsPerWallet = [];
let platformWallet;
let tokens = [];
let tokenAddresses = [];
let oneKnc = new BN(10).pow(new BN(KNC_DECIMALS));
let oneEth = new BN(10).pow(new BN(ethDecimals));
let oneDai = new BN(10).pow(new BN(DAI_DECIMALS));
let oneEurs = new BN(10).pow(new BN(EURS_DECIMALS));
let oneUsdc = new BN(10).pow(new BN(USDC_DECIMALS));

let ethWeiToBurn = oneEth.mul(new BN(2)); // 2 eth
let daiWeiToBurn = oneDai.mul(new BN(500)); // 500 dai
let eursWeiToBurn = oneEurs.mul(new BN(400)); // 400 eurs
let usdcWeiToBurn = oneUsdc.mul(new BN(500)); // 500 usdc

let ethToKncPrecision = precisionUnits.div(new BN(200)); // 1 eth --> 200 knc
let kncToEthPrecision = precisionUnits.mul(new BN(200));

contract('KyberFeeHandlerWrapper', function(accounts) {
    before("Setting global variables", async() => {
        staker = accounts[8];
        daoSetter = accounts[1];
        daoOperator = accounts[2];
        platformWallet = accounts[1];

        rebateWallets.push(accounts[1]);
        rebateWallets.push(accounts[2]);
        rebateWallets.push(accounts[3]);

        rebateBpsPerWallet = [new BN(2000), new BN(3000), new BN(5000)];

        epoch = new BN(0);
        expiryTimestamp = new BN(5);
        mockKyberDao = await MockKyberDao.new(
            rewardInBPS,
            rebateInBPS,
            epoch,
            expiryTimestamp
        );

        let stakerPercentageInPrecision = precisionUnits.mul(rewardInBPS).div(BPS);
        await mockKyberDao.setStakerPercentageInPrecision(stakerPercentageInPrecision);

        proxy = await Proxy.new();
        kyberNetwork = accounts[7];

        // deploy tokens
        dai = await Token.new("DAI", "DAI", DAI_DECIMALS);
        eurs = await Token.new("STASIS EURS", "EURS", EURS_DECIMALS);
        knc = await Token.new("KyberNetworkCrystal", "KNC", KNC_DECIMALS);
        usdc = await Token.new("USD Coin", "USDC", USDC_DECIMALS);

        tokens = [{'address': ethAddress}, dai, eurs, usdc];
        tokenAddresses = [ethAddress, dai.address, eurs.address, usdc.address];

        await knc.transfer(proxy.address, oneKnc.mul(new BN(100000)));
        await Helper.sendEtherWithPromise(accounts[9], proxy.address, oneEth.mul(new BN(100)));

        // for burning KNC
        await proxy.setPairRate(ethAddress, knc.address, ethToKncPrecision);
        await proxy.setPairRate(knc.address, ethAddress, kncToEthPrecision);

        // setup sanity rate for ethFeeHandler
        sanityRate = await BurnKncSanityRate.new();
        await sanityRate.setLatestKncToEthRate(kncToEthPrecision);
    });

    beforeEach("setup feeHandlers and wrapper", async() => {
        // setup feeHandlers
        ethFeeHandler = await FeeHandler.new(daoSetter, proxy.address, kyberNetwork, knc.address, BURN_BLOCK_INTERVAL, daoOperator);
        await ethFeeHandler.setDaoContract(mockKyberDao.address, {from: daoSetter});
        daiFeeHandler = await FeeTokenHandler.new(mockKyberDao.address, proxy.address, kyberNetwork, dai.address, knc.address, BURN_BLOCK_INTERVAL, daoOperator);
        eursFeeHandler = await FeeTokenHandler.new(mockKyberDao.address, proxy.address, kyberNetwork, eurs.address, knc.address, BURN_BLOCK_INTERVAL, daoOperator);
        usdcFeeHandler = await FeeTokenHandler.new(mockKyberDao.address, proxy.address, kyberNetwork, usdc.address, knc.address, BURN_BLOCK_INTERVAL, daoOperator);
        bindTokenToFeeHandler(ethFeeHandler, {'address': ethAddress}, ethWeiToBurn, oneEth);
        bindTokenToFeeHandler(daiFeeHandler, dai, daiWeiToBurn, oneDai);
        bindTokenToFeeHandler(eursFeeHandler, eurs, eursWeiToBurn, oneEurs);
        bindTokenToFeeHandler(usdcFeeHandler, usdc, usdcWeiToBurn, oneUsdc);

        feeHandlers = [ethFeeHandler, daiFeeHandler, eursFeeHandler, usdcFeeHandler];

        // deploy wrapper
        feeWrapper = await FeeWrapper.new(mockKyberDao.address, daoOperator);

        // setup tokenFeeHandlers
        for (const feeHandler of feeHandlers) {
            let token = feeHandler.token;
            if (token.address == ethAddress) {
                await feeHandler.setBurnConfigParams(sanityRate.address, feeHandler.weiToBurn, {from: daoOperator});
            } else {
                // give token to kyberNetwork
                await token.transfer(kyberNetwork, feeHandler.oneToken.mul(new BN(100000)));
                await feeHandler.setBurnConfigParams(zeroAddress, feeHandler.weiToBurn, {from: daoOperator});
            }

            await feeWrapper.addFeeHandler(token.address, feeHandler.address, {from: daoOperator});
            let actualFeeHandlerArray = (await feeWrapper.getKyberFeeHandlersPerToken(token.address)).kyberFeeHandlers;
            Helper.assertEqualArray(actualFeeHandlerArray, [feeHandler.address], "feeHandler not added");
            await feeHandler.getBRR();
        }

        Helper.assertEqualArray(await feeWrapper.getSupportedTokens(), tokenAddresses, "supported tokens not equal");
    });

    describe("test handle fees and claiming rebate / reward / fee using wrapper", async() => {
        let initialEpoch;
        let currentEpoch;
        let numEpochs = 3;

        beforeEach("send feeHandlers fees for some epochs", async() => {
            initialEpoch = (await mockKyberDao.epoch()).toNumber();
            await sendFeesToAllFeeHandlers(mockKyberDao, feeHandlers, numEpochs);
            currentEpoch = (await mockKyberDao.epoch()).toNumber();
        });

        it("should not revert if startTokenIndex > endTokenIndex", async() => {
            let previousEpoch = currentEpoch - 1;
            let startTokenIndex = 1;
            let endTokenIndex = 0;
            let startFeeHandlerIndex = 0;
            let endFeeHandlerIndex = 1;
            let initialBalances;
            let endBalances;

            initialBalances = await getBalances(staker, tokens);
            await feeWrapper.claimStakerReward(staker, previousEpoch, startTokenIndex, endTokenIndex, startFeeHandlerIndex, endFeeHandlerIndex);
            endBalances = await getBalances(staker, tokens);
            assertSameBalances(initialBalances, endBalances, "unexpected staker balances");

            initialBalances = await getBalances(platformWallet, tokens);
            await feeWrapper.claimPlatformFee(platformWallet, startTokenIndex, endTokenIndex, startFeeHandlerIndex, endFeeHandlerIndex);
            endBalances = await getBalances(platformWallet, tokens);
            assertSameBalances(initialBalances, endBalances, "unexpected platformWallet balances");

            for (const rebateWallet of rebateWallets) {
                initialBalances = await getBalances(rebateWallet, tokens);
                await feeWrapper.claimReserveRebate(rebateWallet, startTokenIndex, endTokenIndex, startFeeHandlerIndex, endFeeHandlerIndex);
                endBalances = await getBalances(rebateWallet, tokens);
                assertSameBalances(initialBalances, endBalances, "unexpected rebateWallet balances");
            }
        });

        it("should not revert if startFeeHandlerIndex > endFeeHandlerIndex", async() => {
            let previousEpoch = currentEpoch - 1;
            let startTokenIndex = 0;
            let endTokenIndex = 1;
            let startFeeHandlerIndex = 1;
            let endFeeHandlerIndex = 0;
            let initialBalances;
            let endBalances;

            initialBalances = await getBalances(staker, tokens);
            await feeWrapper.claimStakerReward(staker, previousEpoch, startTokenIndex, endTokenIndex, startFeeHandlerIndex, endFeeHandlerIndex);
            endBalances = await getBalances(staker, tokens);
            assertSameBalances(initialBalances, endBalances, "unexpected staker balances");

            initialBalances = await getBalances(platformWallet, tokens);
            await feeWrapper.claimPlatformFee(platformWallet, startTokenIndex, endTokenIndex, startFeeHandlerIndex, endFeeHandlerIndex);
            endBalances = await getBalances(platformWallet, tokens);
            assertSameBalances(initialBalances, endBalances, "unexpected platformWallet balances");

            for (const rebateWallet of rebateWallets) {
                initialBalances = await getBalances(rebateWallet, tokens);
                await feeWrapper.claimReserveRebate(rebateWallet, startTokenIndex, endTokenIndex, startFeeHandlerIndex, endFeeHandlerIndex);
                endBalances = await getBalances(rebateWallet, tokens);
                assertSameBalances(initialBalances, endBalances, "unexpected rebateWallet balances");
            }
        });

        it("should successfully claim staker reward", async() => {
            // try claiming for previous epoch
            let previousEpoch = currentEpoch - 1;
            let startTokenIndex = 0;
            let endTokenIndex = 5;
            let startFeeHandlerIndex = 0;
            let endFeeHandlerIndex = 5;
            let initialBalances;
            let endBalances;

            initialBalances = await getBalances(staker, tokens);
            await feeWrapper.claimStakerReward(staker, previousEpoch, startTokenIndex, endTokenIndex, startFeeHandlerIndex, endFeeHandlerIndex);
            endBalances = await getBalances(staker, tokens);
            assertBalancesIncreased(initialBalances, endBalances, "unexpected staker balance increase");
        });

        it("test claiming platform fees", async() => {
            let startTokenIndex = 0;
            let endTokenIndex = 5;
            let startFeeHandlerIndex = 0;
            let endFeeHandlerIndex = 5;
            let initialBalances;
            let endBalances;

            initialBalances = await getBalances(platformWallet, tokens);
            await feeWrapper.claimPlatformFee(platformWallet, startTokenIndex, endTokenIndex, startFeeHandlerIndex, endFeeHandlerIndex);
            endBalances = await getBalances(platformWallet, tokens);
            assertBalancesIncreased(initialBalances, endBalances, "unexpected platformWallet balance increase");
        });

        it("test claiming rebates", async() => {
            let startTokenIndex = 0;
            let endTokenIndex = 5;
            let startFeeHandlerIndex = 0;
            let endFeeHandlerIndex = 5;
            let initialBalances;
            let endBalances;

            for (const rebateWallet of rebateWallets) {
                initialBalances = await getBalances(rebateWallet, tokens);
                await feeWrapper.claimReserveRebate(rebateWallet, startTokenIndex, endTokenIndex, startFeeHandlerIndex, endFeeHandlerIndex);
                endBalances = await getBalances(rebateWallet, tokens);
                assertBalancesIncreased(initialBalances, endBalances, "unexpected platformWallet balance increase");
            };
        });

        it("should not revert if staker manually claimed from at least 1 feeHandler", async() => {
            let feeHandlersZeroReward = [ethFeeHandler, eursFeeHandler];
            let feeHandlersZeroRewardTokens = [ethFeeHandler.token, eursFeeHandler.token];
            let feeHandlersWithRewardsTokens = [daiFeeHandler.token, usdcFeeHandler.token];

            let previousEpoch = currentEpoch - 1;

            // claim staker rewards from feeHandlersZeroReward
            for (const feeHandler of feeHandlersZeroReward) {
                await feeHandler.claimStakerReward(staker, previousEpoch);
            }

            let initialBalancesExpectNoChange = await getBalances(staker, feeHandlersZeroRewardTokens);
            let initialBalances = await getBalances(staker, feeHandlersWithRewardsTokens);

            await feeWrapper.claimStakerReward(staker, previousEpoch, 0, 5, 0, 5);
            let actualBalancesExpectNoChange = await getBalances(staker, feeHandlersZeroRewardTokens);
            let actualBalances = await getBalances(staker, feeHandlersWithRewardsTokens);

            assertSameBalances(initialBalancesExpectNoChange, actualBalancesExpectNoChange, "balances didn't remain the same");
            assertBalancesIncreased(initialBalances, actualBalances, "balances didn't increase");
        });

        it("should not revert if staker claims multiple times through the wrapper", async() => {
            let previousEpoch = currentEpoch - 1;
            let startTokenIndex = 0;
            let endTokenIndex = 2;
            let feeHandlersZeroRewardTokens = (await feeWrapper.getSupportedTokens()).slice(startTokenIndex, endTokenIndex);
            let feeHandlersWithRewardsTokens = (await feeWrapper.getSupportedTokens()).slice(endTokenIndex,);

            // claim staker rewards via wrapper for feeHandlersZeroRewardTokens
            await feeWrapper.claimStakerReward(staker, previousEpoch, startTokenIndex, endTokenIndex, 0, 5);

            let initialBalancesExpectNoChange = await getBalances(staker, feeHandlersZeroRewardTokens);
            let initialBalances = await getBalances(staker, feeHandlersWithRewardsTokens);

            await feeWrapper.claimStakerReward(staker, previousEpoch, 0, 5, 0, 5);
            let actualBalancesExpectNoChange = await getBalances(staker, feeHandlersZeroRewardTokens);
            let actualBalances = await getBalances(staker, feeHandlersWithRewardsTokens);

            assertSameBalances(initialBalancesExpectNoChange, actualBalancesExpectNoChange, "balances didn't remain the same");
            assertBalancesIncreased(initialBalances, actualBalances, "balances didn't increase");

            // should not revert, but doesn't do anything
            await feeWrapper.claimStakerReward(staker, previousEpoch, 0, 5, 0, 5);
        });

        it("should not revert if platformWallet manually claimed from at least 1 feeHandler", async() => {
            let feeHandlersZeroReward = [ethFeeHandler, eursFeeHandler];
            let feeHandlersZeroRewardTokens = [ethFeeHandler.token, eursFeeHandler.token];
            let feeHandlersWithRewardsTokens = [daiFeeHandler.token, usdcFeeHandler.token];

            // claim reserve rebates from feeHandlersZeroReward
            for (const feeHandler of feeHandlersZeroReward) {
                await feeHandler.claimPlatformFee(platformWallet);
            }

            let initialBalancesExpectNoChange = await getBalances(platformWallet, feeHandlersZeroRewardTokens);
            let initialBalances = await getBalances(platformWallet, feeHandlersWithRewardsTokens);
            
            await feeWrapper.claimPlatformFee(platformWallet, 0, 5, 0, 5);
            let actualBalancesExpectNoChange = await getBalances(platformWallet, feeHandlersZeroRewardTokens);
            let actualBalances = await getBalances(platformWallet, feeHandlersWithRewardsTokens);

            assertSameBalances(initialBalancesExpectNoChange, actualBalancesExpectNoChange, "balances didn't remain the same");
            assertBalancesIncreased(initialBalances, actualBalances, "balances didn't increase");
        });

        it("should not revert if platformWallet claims multiple times through the wrapper", async() => {
            let startTokenIndex = 0;
            let endTokenIndex = 2;
            let feeHandlersZeroRewardTokens = (await feeWrapper.getSupportedTokens()).slice(startTokenIndex, endTokenIndex);
            let feeHandlersWithRewardsTokens = (await feeWrapper.getSupportedTokens()).slice(endTokenIndex,);

            // claim reserve rebates from feeHandlersZeroReward
            await feeWrapper.claimPlatformFee(platformWallet, startTokenIndex, endTokenIndex, 0, 5);

            let initialBalancesExpectNoChange = await getBalances(platformWallet, feeHandlersZeroRewardTokens);
            let initialBalances = await getBalances(platformWallet, feeHandlersWithRewardsTokens);
            
            await feeWrapper.claimPlatformFee(platformWallet, 0, 5, 0, 5);
            let actualBalancesExpectNoChange = await getBalances(platformWallet, feeHandlersZeroRewardTokens);
            let actualBalances = await getBalances(platformWallet, feeHandlersWithRewardsTokens);

            assertSameBalances(initialBalancesExpectNoChange, actualBalancesExpectNoChange, "balances didn't remain the same");
            assertBalancesIncreased(initialBalances, actualBalances, "balances didn't increase");

            // should not revert, but doesn't do anything
            await feeWrapper.claimPlatformFee(platformWallet, 0, 5, 0, 5);
        });

        it("should not revert if platformWallet manually claimed from at least 1 feeHandler", async() => {
            let feeHandlersZeroReward = [ethFeeHandler, eursFeeHandler];
            let feeHandlersZeroRewardTokens = [ethFeeHandler.token, eursFeeHandler.token];
            let feeHandlersWithRewardsTokens = [daiFeeHandler.token, usdcFeeHandler.token];

            // claim reserve rebates from feeHandlersZeroReward
            for (const feeHandler of feeHandlersZeroReward) {
                await feeHandler.claimPlatformFee(platformWallet);
            }

            let initialBalancesExpectNoChange = await getBalances(platformWallet, feeHandlersZeroRewardTokens);
            let initialBalances = await getBalances(platformWallet, feeHandlersWithRewardsTokens);
            
            await feeWrapper.claimPlatformFee(platformWallet, 0, 5, 0, 5);
            let actualBalancesExpectNoChange = await getBalances(platformWallet, feeHandlersZeroRewardTokens);
            let actualBalances = await getBalances(platformWallet, feeHandlersWithRewardsTokens);

            assertSameBalances(initialBalancesExpectNoChange, actualBalancesExpectNoChange, "balances didn't remain the same");
            assertBalancesIncreased(initialBalances, actualBalances, "balances didn't increase");
        });

        it("should not revert if reserve claims multiple times through the wrapper", async() => {
            let startTokenIndex = 0;
            let endTokenIndex = 2;
            let feeHandlersZeroRewardTokens = (await feeWrapper.getSupportedTokens()).slice(startTokenIndex, endTokenIndex);
            let feeHandlersWithRewardsTokens = (await feeWrapper.getSupportedTokens()).slice(endTokenIndex,);

            // claim reserve rebates from feeHandlersZeroReward
            for (const rebateWallet of rebateWallets) {
                await feeWrapper.claimReserveRebate(rebateWallet, startTokenIndex, endTokenIndex, 0, 5);

                let initialBalancesExpectNoChange = await getBalances(rebateWallet, feeHandlersZeroRewardTokens);
                let initialBalances = await getBalances(rebateWallet, feeHandlersWithRewardsTokens);
            
                await feeWrapper.claimReserveRebate(rebateWallet, 0, 5, 0, 5);
                let actualBalancesExpectNoChange = await getBalances(rebateWallet, feeHandlersZeroRewardTokens);
                let actualBalances = await getBalances(rebateWallet, feeHandlersWithRewardsTokens);

                assertSameBalances(initialBalancesExpectNoChange, actualBalancesExpectNoChange, "balances didn't remain the same");
                assertBalancesIncreased(initialBalances, actualBalances, "balances didn't increase");

                // should not revert, but doesn't do anything
                await feeWrapper.claimReserveRebate(rebateWallet, 0, 5, 0, 5);
            }
        });
    });

    describe("test with multiple tokenFeeHandlers for a token", async() => {
        let tempUsdcFeeHandler1;
        let tempUsdcFeeHandler2;
        let tempFeeHandlers;
        let tempFeeHandlerAddresses;
        let tempUsdcFeeHandler1StartEpoch;
        let tempUsdcFeeHandler2StartEpoch
        let currentEpoch;
        let tokenIndex;
        let numEpochs = 5;

        before("setup tempFeeHandlers, get token index in feeWrapper", async() => {
            tokenIndex = (await feeWrapper.getSupportedTokens()).indexOf(usdc.address);
            tempUsdcFeeHandler1 = await FeeTokenHandler.new(mockKyberDao.address, proxy.address, kyberNetwork, usdc.address, knc.address, BURN_BLOCK_INTERVAL, daoOperator);
            bindTokenToFeeHandler(tempUsdcFeeHandler1, usdc, usdcWeiToBurn, oneUsdc);
            tempUsdcFeeHandler2 = await FeeTokenHandler.new(mockKyberDao.address, proxy.address, kyberNetwork, usdc.address, knc.address, BURN_BLOCK_INTERVAL, daoOperator);
            bindTokenToFeeHandler(tempUsdcFeeHandler2, usdc, usdcWeiToBurn, oneUsdc);
            for (const feeHandler of [tempUsdcFeeHandler1, tempUsdcFeeHandler2]) {
                let token = feeHandler.token;
                if (token.address == ethAddress) {
                    await feeHandler.setBurnConfigParams(sanityRate.address, feeHandler.weiToBurn, {from: daoOperator});
                } else {
                    // give token to kyberNetwork
                    await token.transfer(kyberNetwork, feeHandler.oneToken.mul(new BN(100000)));
                    await feeHandler.setBurnConfigParams(zeroAddress, feeHandler.weiToBurn, {from: daoOperator});
                }
                await feeHandler.getBRR();
            }
        });

        beforeEach("add tempFeeHandlers with gap of numEpochs", async() => {
            tempFeeHandlers = [usdcFeeHandler, tempUsdcFeeHandler1, tempUsdcFeeHandler2];
            tempFeeHandlerAddresses = [usdcFeeHandler.address, tempUsdcFeeHandler1.address, tempUsdcFeeHandler2.address];
            
            await sendFeesToAllFeeHandlers(mockKyberDao, feeHandlers, numEpochs);

            tempUsdcFeeHandler1StartEpoch = (await mockKyberDao.epoch()).toNumber();
            await feeWrapper.addFeeHandler(usdc.address, tempUsdcFeeHandler1.address, {from: daoOperator});
            await sendFeesToAllFeeHandlers(mockKyberDao, [tempUsdcFeeHandler1], numEpochs);

            tempUsdcFeeHandler2StartEpoch = (await mockKyberDao.epoch()).toNumber();
            await feeWrapper.addFeeHandler(usdc.address, tempUsdcFeeHandler2.address, {from: daoOperator});
            await sendFeesToAllFeeHandlers(mockKyberDao, [tempUsdcFeeHandler2], numEpochs);
            currentEpoch = (await mockKyberDao.epoch()).toNumber();

            let result = await feeWrapper.getKyberFeeHandlersPerToken(usdc.address);
            Helper.assertEqualArray(result.kyberFeeHandlers, tempFeeHandlerAddresses, "feeHandlers not the same");
            Helper.assertEqual(new BN(tempUsdcFeeHandler1StartEpoch), result.epochs[1]);
            Helper.assertEqual(new BN(tempUsdcFeeHandler2StartEpoch), result.epochs[2]);
        });

        it("should claim from only 1 feeHandler if epochs don't overlap", async() => {
            // should claim only from tempUsdcFeeHandler2
            let selectedEpoch = currentEpoch - 2;
            let initialBalance = await getBalances(staker, [usdc]);
            Helper.assertEqual(await tempUsdcFeeHandler2.hasClaimedReward(staker, selectedEpoch), false, "staker should not have claimed reward");
            Helper.assertEqual(await tempUsdcFeeHandler1.hasClaimedReward(staker, selectedEpoch), false, "staker should not have claimed reward");
            Helper.assertEqual(await usdcFeeHandler.hasClaimedReward(staker, selectedEpoch), false, "staker should not have claimed reward");
            await feeWrapper.claimStakerReward(staker, selectedEpoch, tokenIndex, tokenIndex + 1, 0, 5);
            Helper.assertEqual(await tempUsdcFeeHandler2.hasClaimedReward(staker, selectedEpoch), true, "staker should have claimed reward");
            Helper.assertEqual(await tempUsdcFeeHandler1.hasClaimedReward(staker, selectedEpoch), false, "staker should not have claimed reward");
            Helper.assertEqual(await usdcFeeHandler.hasClaimedReward(staker, selectedEpoch), false, "staker should not have claimed reward");
            let newBalance = await getBalances(staker, [usdc]);
            assertBalancesIncreased(initialBalance, newBalance, "staker's token balance did not increase"); 
            initialBalance = newBalance;

            // should claim only from tempUsdcFeeHandler1
            selectedEpoch = tempUsdcFeeHandler1StartEpoch + 2;
            Helper.assertEqual(await tempUsdcFeeHandler2.hasClaimedReward(staker, selectedEpoch), false, "staker should not have claimed reward");
            Helper.assertEqual(await tempUsdcFeeHandler1.hasClaimedReward(staker, selectedEpoch), false, "staker should not have claimed reward");
            Helper.assertEqual(await usdcFeeHandler.hasClaimedReward(staker, selectedEpoch), false, "staker should not have claimed reward");
            await feeWrapper.claimStakerReward(staker, selectedEpoch, tokenIndex, tokenIndex + 1, 0, 5);
            Helper.assertEqual(await tempUsdcFeeHandler2.hasClaimedReward(staker, selectedEpoch), false, "staker should not have claimed reward");
            Helper.assertEqual(await tempUsdcFeeHandler1.hasClaimedReward(staker, selectedEpoch), true, "staker should have claimed reward");
            Helper.assertEqual(await usdcFeeHandler.hasClaimedReward(staker, selectedEpoch), false, "staker should not have claimed reward");
            newBalance = await getBalances(staker, [usdc]);
            assertBalancesIncreased(initialBalance, newBalance, "staker's token balance did not increase"); 
            initialBalance = newBalance;

            // should claim only from usdcFeeHandler
            selectedEpoch = tempUsdcFeeHandler1StartEpoch - 1;
            Helper.assertEqual(await tempUsdcFeeHandler2.hasClaimedReward(staker, selectedEpoch), false, "staker should not have claimed reward");
            Helper.assertEqual(await tempUsdcFeeHandler1.hasClaimedReward(staker, selectedEpoch), false, "staker should not have claimed reward");
            Helper.assertEqual(await usdcFeeHandler.hasClaimedReward(staker, selectedEpoch), false, "staker should not have claimed reward");
            await feeWrapper.claimStakerReward(staker, selectedEpoch, tokenIndex, tokenIndex + 1, 0, 5);
            Helper.assertEqual(await tempUsdcFeeHandler2.hasClaimedReward(staker, selectedEpoch), false, "staker should not have claimed reward");
            Helper.assertEqual(await tempUsdcFeeHandler1.hasClaimedReward(staker, selectedEpoch), false, "staker should not have claimed reward");
            Helper.assertEqual(await usdcFeeHandler.hasClaimedReward(staker, selectedEpoch), true, "staker should have claimed reward");
            newBalance = await getBalances(staker, [usdc]);
            assertBalancesIncreased(initialBalance, newBalance, "staker's token balance did not increase"); 
            initialBalance = newBalance;
        });

        it("should claim from multiple feeHandlers if for overlapping epochs", async() => {
            // should claim from both tempUsdcFeeHandler2 and tempUsdcFeeHandler1
            let selectedEpoch = tempUsdcFeeHandler2StartEpoch;
            let initialBalance = await getBalances(staker, [usdc]);
            Helper.assertEqual(await tempUsdcFeeHandler2.hasClaimedReward(staker, selectedEpoch), false, "staker should not have claimed reward");
            Helper.assertEqual(await tempUsdcFeeHandler1.hasClaimedReward(staker, selectedEpoch), false, "staker should not have claimed reward");
            Helper.assertEqual(await usdcFeeHandler.hasClaimedReward(staker, selectedEpoch), false, "staker should not have claimed reward");
            await feeWrapper.claimStakerReward(staker, selectedEpoch, tokenIndex, tokenIndex + 1, 0, 5);
            Helper.assertEqual(await tempUsdcFeeHandler2.hasClaimedReward(staker, selectedEpoch), true, "staker should have claimed reward");
            Helper.assertEqual(await tempUsdcFeeHandler1.hasClaimedReward(staker, selectedEpoch), true, "staker should have claimed reward");
            Helper.assertEqual(await usdcFeeHandler.hasClaimedReward(staker, selectedEpoch), false, "staker should not have claimed reward");
            let newBalance = await getBalances(staker, [usdc]);
            assertBalancesIncreased(initialBalance, newBalance, "staker's token balance did not increase"); 
            initialBalance = newBalance;

            // should claim from both tempUsdcFeeHandler1 and usdcFeeHandler
            selectedEpoch = tempUsdcFeeHandler1StartEpoch;
            Helper.assertEqual(await tempUsdcFeeHandler2.hasClaimedReward(staker, selectedEpoch), false, "staker should not have claimed reward");
            Helper.assertEqual(await tempUsdcFeeHandler1.hasClaimedReward(staker, selectedEpoch), false, "staker should not have claimed reward");
            Helper.assertEqual(await usdcFeeHandler.hasClaimedReward(staker, selectedEpoch), false, "staker should not have claimed reward");
            await feeWrapper.claimStakerReward(staker, selectedEpoch, tokenIndex, tokenIndex + 1, 0, 5);
            Helper.assertEqual(await tempUsdcFeeHandler2.hasClaimedReward(staker, selectedEpoch), false, "staker should not have claimed reward");
            Helper.assertEqual(await tempUsdcFeeHandler1.hasClaimedReward(staker, selectedEpoch), true, "staker should have claimed reward");
            Helper.assertEqual(await usdcFeeHandler.hasClaimedReward(staker, selectedEpoch), true, "staker should have claimed reward");
            newBalance = await getBalances(staker, [usdc]);
            assertBalancesIncreased(initialBalance, newBalance, "staker's token balance did not increase"); 
            initialBalance = newBalance;
        });

        it("should claim reserve rebates from all feeHandlers", async() => {
            tempFeeHandlers = [ethFeeHandler, daiFeeHandler, eursFeeHandler, usdcFeeHandler, tempUsdcFeeHandler1, tempUsdcFeeHandler2];
            // check that there is reserve rebates to claim
            for (const rebateWallet of rebateWallets) {
                for (const feeHandler of tempFeeHandlers) {
                    Helper.assertGreater((await feeHandler.rebatePerWallet(rebateWallet)), new BN(1), "feeHandler has no reserve rebate");
                }
                let initialBalances = await getBalances(rebateWallet, tokens);

                // claim from all feeHandlers
                await feeWrapper.claimReserveRebate(rebateWallet, 0, 5, 0, 5);

                for (const feeHandler of tempFeeHandlers) {
                    Helper.assertEqual((await feeHandler.rebatePerWallet(rebateWallet)), new BN(1), "did not claim reserve rebate from feeHandler");
                }
                let newBalances = await getBalances(rebateWallet, tokens);
                assertBalancesIncreased(initialBalances, newBalances, "rebate wallet's balance(s) did not increase");
            }
        });

        it("should claim platform fees from all feeHandlers", async() => {
            tempFeeHandlers = [ethFeeHandler, daiFeeHandler, eursFeeHandler, usdcFeeHandler, tempUsdcFeeHandler1, tempUsdcFeeHandler2];
            // check that there is platform fees to claim
            for (const feeHandler of tempFeeHandlers) {
                Helper.assertGreater((await feeHandler.feePerPlatformWallet(platformWallet)), new BN(1), "feeHandler has no reserve rebate");
            }
            let initialBalances = await getBalances(platformWallet, tokens);

            // claim from all feeHandlers
            await feeWrapper.claimPlatformFee(platformWallet, 0, 5, 0, 5);

            for (const feeHandler of tempFeeHandlers) {
                Helper.assertEqual((await feeHandler.feePerPlatformWallet(platformWallet)), new BN(1), "did not claim reserve rebate from feeHandler");
            }
            let newBalances = await getBalances(platformWallet, tokens);
            assertBalancesIncreased(initialBalances, newBalances, "platformWallet's balance(s) did not increase");
        });

        it("should revert for bad array indices", async() => {
            // set startKyberFeeHandlerIndex > num of feeHandlers
            let selectedEpoch = currentEpoch - 2;
            let startKyberFeeHandlerIndex = 5;
            let endKyberFeeHandlerIndex = 10;
            await expectRevert(
                feeWrapper.claimStakerReward(
                    staker,
                    selectedEpoch,
                    tokenIndex,
                    tokenIndex + 1,
                    startKyberFeeHandlerIndex,
                    endKyberFeeHandlerIndex
                ),
                "bad array indices"
            );

            for (const rebateWallet of rebateWallets) {
                await expectRevert(
                    feeWrapper.claimReserveRebate(
                    rebateWallet,
                    tokenIndex,
                    tokenIndex + 1,
                    startKyberFeeHandlerIndex,
                    endKyberFeeHandlerIndex
                    ),
                "bad array indices"
                );
            };
            
            await expectRevert(
                feeWrapper.claimPlatformFee(
                    platformWallet,
                    tokenIndex,
                    tokenIndex + 1,
                    startKyberFeeHandlerIndex,
                    endKyberFeeHandlerIndex
                ),
                "bad array indices"
            );
        });
    });
});

function bindTokenToFeeHandler(feeHandler, token, weiToBurn, oneToken) {
    feeHandler.token = token;
    feeHandler.weiToBurn = weiToBurn;
    feeHandler.oneToken = oneToken;
    return feeHandler;
}

async function sendFeesToAllFeeHandlers(dao, feeHandlers, numEpochs) {
    for (let i = 0; i < numEpochs; i++) {
        for (const feeHandler of feeHandlers) {
            let token = feeHandler.token;
            let amount = (token.address == ethAddress) ? feeHandler.oneToken : feeHandler.oneToken.mul(new BN(1000));
            await sendFeesToFeeHandler(feeHandler, amount, amount);
        }
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

async function sendFeesToFeeHandler(feeHandler, platformFeeWei, networkFeeWei) {
    let token = feeHandler.token;
    if (token.address == ethAddress) {
        sendVal = platformFeeWei.add(networkFeeWei);
        await feeHandler.handleFees(ethAddress, rebateWallets, rebateBpsPerWallet, platformWallet, platformFeeWei, networkFeeWei, {from: kyberNetwork, value: sendVal});
    } else {
        sendVal = platformFeeWei.add(networkFeeWei);
        await token.approve(feeHandler.address, sendVal, {from: kyberNetwork});
        await feeHandler.handleFees(token.address, rebateWallets, rebateBpsPerWallet, platformWallet, platformFeeWei, networkFeeWei, {from: kyberNetwork});
    }
}

async function getBalances(staker, tokens) {
    let result = [];
    for (let token of tokens) {
        if (token.address == ethAddress || token == ethAddress) {
            result.push(await Helper.getBalancePromise(staker));
        } else if (token.address == undefined) {
            token = await Token.at(token);
            result.push(await token.balanceOf(staker));
        } else {
            result.push(await token.balanceOf(staker));
        }
    }
    return result;
}

function assertSameBalances(oldBal, newBal, errMsg) {
    for (let i = 0; i < oldBal.length; i++) {
        Helper.assertEqual(oldBal[i], newBal[i], errMsg);
    }
}

function assertBalancesIncreased(oldBal, newBal, errMsg) {
    for (let i = 0; i < newBal.length; i++) {
        Helper.assertGreater(newBal[i], oldBal[i], errMsg);
    }
}
