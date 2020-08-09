const NetworkProxyV1 = artifacts.require("./KyberProxyV1.sol");
const MockDao = artifacts.require("MockKyberDao.sol");
const FeeHandler = artifacts.require("KyberFeeHandler.sol");
const MatchingEngine = artifacts.require("KyberMatchingEngine.sol");
const KyberStorage = artifacts.require("KyberStorage.sol");
const RateHelper = artifacts.require("KyberRateHelper.sol");
const TestToken = artifacts.require("TestToken.sol");
const MaliciousReserve = artifacts.require("MaliciousReserve2.sol");
const KyberNetwork = artifacts.require("./KyberNetwork.sol");
const NetworkNoMaxDest = artifacts.require("KyberNetworkNoMaxDest.sol");
const MaliciousNetwork = artifacts.require("MaliciousKyberNetwork.sol");
const MaliciousNetwork2 = artifacts.require("MaliciousKyberNetwork2.sol");
const GenerousNetwork = artifacts.require("GenerousKyberNetwork.sol");

const BN = web3.utils.BN;
const Helper = require("../helper.js");
const nwHelper = require("../sol6/networkHelper.js");
const { expectEvent, expectRevert } = require('@openzeppelin/test-helpers');

const {BPS, precisionUnits, ethDecimals, ethAddress, zeroAddress, emptyHint, zeroBN} = require("../helper.js");
const {APR_ID, BRIDGE_ID, MOCK_ID, FPR_ID, type_apr, type_fpr, type_MOCK,
    MASK_IN_HINTTYPE, MASK_OUT_HINTTYPE, SPLIT_HINTTYPE, EMPTY_HINTTYPE, ReserveType}  = require('../sol6/networkHelper.js');

const PERM_HINTTYPE = 4;

//global variables
//////////////////
const max_rate = (precisionUnits.mul(new BN(10 ** 6))); //internal parameter in Utils.sol
const gasPrice = (new BN(10).pow(new BN(9)).mul(new BN(50)));
const negligibleRateDiffBps = new BN(10); //0.01%
const maxDestAmt = new BN(2).pow(new BN(255));
const minConversionRate = new BN(0);
const oneEth = new BN(10).pow(ethDecimals);

//permission groups
let admin;
let operator;
let alerter;
let user1;
let walletId;
let taker;


let reserveInstances = {};
let reserve;
let numReserves;

let srcTokenId;
let destTokenId;
let srcToken;
let destToken;

let network;
let networkNoMaxDest;
let maliciousNetwork;
let maliciousNetwork2;
let generousNetwork;
let networkProxyV1;

let proxyForFeeHandler;
let kyberDao;
let feeHandler;
let matchingEngine;
let rateHelper;

//tokens data
////////////
let numTokens = 4;
let tokens = [];
let tokenDecimals = [];
let ethSrcQty = precisionUnits;

//KyberDao related data
let rewardInBPS = new BN(7000);
let rebateInBPS = new BN(2000);
let epoch = new BN(3);
let expiryTimestamp;
let networkFeeBps = new BN(20);
let platformFeeBps = zeroBN;

// fee handler related
let burnBlockInterval = new BN(30);
let KNC;

const tradeTypesArray = [MASK_IN_HINTTYPE, MASK_OUT_HINTTYPE, SPLIT_HINTTYPE, EMPTY_HINTTYPE, PERM_HINTTYPE];
const tradeStr = ["MASK IN", "MASK OUT", "SPLIT", "NO HINT", "PERM HINT"];


contract('KyberProxyV1', function(accounts) {
    before("one time global init", async function () {
        // set account addresses
        admin = accounts[0];
        operator = accounts[1];
        alerter = accounts[2];
        user1 = accounts[4];
        user2 = accounts[5];
        walletId = accounts[6];
        walletForToken = accounts[7];
        scammer = accounts[8];
        taker = accounts[9];

        currentBlock = priceUpdateBlock = await Helper.getCurrentBlock();
        // init tokens
        for (let i = 0; i < numTokens; i++) {
            tokenDecimals[i] = new BN(15).add(new BN(i));
            token = await TestToken.new("test" + i, "tst" + i, tokenDecimals[i]);
            tokens[i] = token;
        }

        KNC = await TestToken.new("Kyber krystal", "KNC", 18);
        kncAddress = KNC.address;

        Helper.assertEqual(tokens.length, numTokens, "bad number tokens");

        // kyberDao related init.
        expiryTimestamp = new BN(await Helper.getCurrentBlockTime() + 1000000);
        kyberDao = await MockDao.new(rewardInBPS, rebateInBPS, epoch, expiryTimestamp);
        await kyberDao.setNetworkFeeBps(networkFeeBps);

        // deploy storage and network
        storage = await nwHelper.setupStorage(admin);
        network = await KyberNetwork.new(admin, storage.address);
        await storage.setNetworkContract(network.address, {from: admin});
        await storage.setFeeAccountedPerReserveType(true, true, true, false, true, true, {from: admin});
        await storage.setEntitledRebatePerReserveType(true, false, true, false, true, true, {from: admin});
        await storage.addOperator(operator, {from: admin});

        // set proxy same as network
        proxyForFeeHandler = network;
        // transfer tokens to network instance
        await transferTokensToNetwork(network);

        // init matchingEngine
        matchingEngine = await MatchingEngine.new(admin);
        await matchingEngine.setNetworkContract(network.address, {from: admin});
        await matchingEngine.setKyberStorage(storage.address, {from: admin});

        // init rate helper
        rateHelper = await RateHelper.new(admin);
        await rateHelper.setContracts(kyberDao.address, storage.address, {from: admin});

        // deploy proxy
        networkProxyV1 = await NetworkProxyV1.new(admin);
        await networkProxyV1.setKyberNetworkContract(network.address, {from: admin});

        // setup network
        await network.addOperator(operator, {from: admin});
        await network.setKyberDaoContract(kyberDao.address, {from: admin});
        await network.addKyberProxy(networkProxyV1.address, {from: admin});

        //init feeHandler
        KNC = await TestToken.new("kyber network crystal", "KNC", 18);
        feeHandler = await FeeHandler.new(kyberDao.address, networkProxyV1.address, network.address, KNC.address, burnBlockInterval, kyberDao.address);
        // set params, enable network
        await network.setContracts(feeHandler.address, matchingEngine.address, zeroAddress, {from: admin});
        await network.setParams(gasPrice, negligibleRateDiffBps, {from: admin});
        await network.setEnable(true, {from: admin});
    });

    beforeEach("select tokens before each test, reset networkFeeBps", async() => {
        srcTokenId = 0;
        destTokenId = 1;

        srcToken = tokens[srcTokenId];
        destToken = tokens[destTokenId];
        srcDecimals = tokenDecimals[srcTokenId];
        destDecimals = tokenDecimals[destTokenId];

        srcQty = new BN(10).mul(new BN(10).pow(new BN(srcDecimals)));

        // fees
        networkFeeBps = new BN(20);
    });

    describe("KyberProxyV1", () => {
        it("should test enabling network and correct data returns from proxy", async() => {
            let isEnabled = await networkProxyV1.enabled();
            Helper.assertEqual(true, isEnabled, "incorrect enable status");

            await network.setEnable(false, {from: admin});

            isEnabled = await networkProxyV1.enabled();
            Helper.assertEqual(false, isEnabled, "incorrect enable status");

            await network.setEnable(true, {from: admin});
        });

        it("should test setting max gas price and correct data returns from proxy", async() => {
            let maxGasPrice = await networkProxyV1.maxGasPrice();
            Helper.assertEqual(gasPrice, maxGasPrice, "incorrect max gas price value");

            let newMaxGasPrice = gasPrice.mul(new BN(2));
            await network.setParams(newMaxGasPrice, negligibleRateDiffBps, {from: admin});

            maxGasPrice = await networkProxyV1.maxGasPrice();
            Helper.assertEqual(newMaxGasPrice, maxGasPrice, "incorrect max gas price value");

            newMaxGasPrice = new BN(0);
            await network.setParams(newMaxGasPrice, negligibleRateDiffBps, {from: admin});

            maxGasPrice = await networkProxyV1.maxGasPrice();
            Helper.assertEqual(newMaxGasPrice, maxGasPrice, "incorrect max gas price value");

            await network.setParams(gasPrice, negligibleRateDiffBps, {from: admin});
        });

        describe("test with 2 mock reserves, zero rate", async() => {
            before("setup, add and list mock reserves", async() => {
                //init reserves
                let result = await nwHelper.setupReserves(network, tokens, 2, 0, 0, 0, accounts, admin, operator);

                reserveInstances = result.reserveInstances;
                numReserves += result.numAddedReserves * 1;

                //add and list pair for reserve
                await nwHelper.addReservesToStorage(storage, reserveInstances, tokens, operator);

                //set zero rates
                for (const [key, value] of Object.entries(reserveInstances)) {
                    reserve = value.instance;
                    for (let j = 0; j < numTokens; j++) {
                        token = tokens[j];
                        await reserve.setRate(token.address, zeroBN, zeroBN);
                    }
                }
            });

            after("unlist and remove reserve", async() => {
                await nwHelper.removeReservesFromStorage(storage, reserveInstances, tokens, operator);
                reserveInstances = {};
            });

            it("should return 0 rate if src == dest token", async() => {
                actualResult = await networkProxyV1.getExpectedRate(srcToken.address, srcToken.address, srcQty);
                Helper.assertEqual(actualResult.expectedRate, zeroBN, "expected rate not 0");
                Helper.assertEqual(actualResult.slippageRate, zeroBN, "worst rate not 0");

                //query ETH -> ETH
                actualResult = await networkProxyV1.getExpectedRate(ethAddress, ethAddress, ethSrcQty);
                Helper.assertEqual(actualResult.expectedRate, zeroBN, "expected rate not 0");
                Helper.assertEqual(actualResult.slippageRate, zeroBN, "worst rate not 0");
            });

            it("should return 0 rate for unlisted token", async() => {
                let unlistedSrcToken = await TestToken.new("test", "tst", 18);
                let unlistedDestToken = await TestToken.new("test", "tst", 18);

                actualResult = await networkProxyV1.getExpectedRate(unlistedSrcToken.address, ethAddress, ethSrcQty);
                Helper.assertEqual(actualResult.expectedRate, zeroBN, "expected rate not 0");

                actualResult = await network.getExpectedRate(ethAddress, unlistedDestToken.address, ethSrcQty);
                Helper.assertEqual(actualResult.expectedRate, zeroBN, "expected rate not 0");

                actualResult = await network.getExpectedRate(unlistedSrcToken.address, unlistedDestToken.address, ethSrcQty);
                Helper.assertEqual(actualResult.expectedRate, zeroBN, "expected rate not 0");
            });

            it("should return 0 rate all reserves return 0 rate", async() => {
                actualResult = await network.getExpectedRate(srcToken.address, ethAddress, ethSrcQty);
                Helper.assertEqual(actualResult.expectedRate, zeroBN, "expected rate not 0");

                actualResult = await network.getExpectedRate(ethAddress, destToken.address, ethSrcQty);
                Helper.assertEqual(actualResult.expectedRate, zeroBN, "expected rate not 0");

                actualResult = await network.getExpectedRate(srcToken.address, destToken.address, ethSrcQty);
                Helper.assertEqual(actualResult.expectedRate, zeroBN, "expected rate not 0");
            });

            it("should return 0 rate all reserves return 0 rate only permissioned reserves", async() => {
                actualResult = await network.getExpectedRate(srcToken.address, ethAddress, ethSrcQty.add(new BN(2).pow(new BN(255))));
                Helper.assertEqual(actualResult.expectedRate, zeroBN, "expected rate not 0");

                actualResult = await network.getExpectedRate(ethAddress, destToken.address, ethSrcQty.add(new BN(2).pow(new BN(255))));
                Helper.assertEqual(actualResult.expectedRate, zeroBN, "expected rate not 0");

                actualResult = await network.getExpectedRate(srcToken.address, destToken.address, ethSrcQty.add(new BN(2).pow(new BN(255))));
                Helper.assertEqual(actualResult.expectedRate, zeroBN, "expected rate not 0");
            });

            it("test trade should revert rate is 0", async function() {
                for (hintType of tradeTypesArray) {
                    let hint;
                    if (hintType == PERM_HINTTYPE) {
                        hint = web3.utils.fromAscii("PERM");
                    } else {
                        hint = await nwHelper.getHint(rateHelper, matchingEngine, reserveInstances, hintType, undefined, srcToken.address, ethAddress, srcQty);
                    }
                    await expectRevert.unspecified(
                        networkProxyV1.tradeWithHint(
                            ethAddress,
                            ethSrcQty,
                            destToken.address,
                            user1, // dest address
                            new BN(2).pow(new BN(255)), // max dest
                            0, // min rate
                            zeroAddress,
                            hint,
                            {from: user1, value: ethSrcQty}
                        )
                    );
                }
            });
        });

        describe("test with 3 mock reserves", async() => {
            before("setup, add and list reserves", async() => {
                //init reserves
                let result = await nwHelper.setupReserves(network, tokens, 2, 1, 0, 0, accounts, admin, operator);

                reserveInstances = result.reserveInstances;
                numReserves += result.numAddedReserves * 1;

                //add and list pair for reserve
                await nwHelper.addReservesToStorage(storage, reserveInstances, tokens, operator);
            })

            after("unlist and remove reserve", async() => {
                await nwHelper.removeReservesFromStorage(storage, reserveInstances, tokens, operator);
                reserveInstances = {};
            });

            it("should get expected rate for T2E, E2T & T2T", async() => {
                expectedResult = await network.getExpectedRate(srcToken.address, ethAddress, srcQty);
                actualResult = await networkProxyV1.getExpectedRate(srcToken.address, ethAddress, srcQty);
                Helper.assertEqual(expectedResult.expectedRate, actualResult.expectedRate, "expected rate with network fee != actual rate for T2E");
                Helper.assertEqual(expectedResult.worstRate, actualResult.slippageRate, "slippage rate with network fee != actual rate for T2E");

                expectedResult = await network.getExpectedRate(ethAddress, destToken.address, ethSrcQty);
                actualResult = await networkProxyV1.getExpectedRate(ethAddress, destToken.address, ethSrcQty);
                Helper.assertEqual(expectedResult.expectedRate, actualResult.expectedRate, "expected rate with network fee != actual rate for E2T");
                Helper.assertEqual(expectedResult.worstRate, actualResult.slippageRate, "slippage rate with network fee != actual rate for E2T");

                expectedResult = await network.getExpectedRate(srcToken.address, destToken.address, srcQty);
                actualResult = await networkProxyV1.getExpectedRate(srcToken.address, destToken.address, srcQty);
                Helper.assertEqual(expectedResult.expectedRate, actualResult.expectedRate, "expected rate with network fee != actual rate for T2T");
                Helper.assertEqual(expectedResult.worstRate, actualResult.slippageRate, "slippage rate with network fee != actual rate for T2T");
            });

            for (tradeType of tradeTypesArray) {
                let hintType = tradeType;
                it(`should perform a T2E tradeWithHint (backwards compatible, (${tradeStr[hintType]}) and check balances change as expected`, async() => {
                    if (hintType == PERM_HINTTYPE) {
                        hint = web3.utils.fromAscii("PERM");
                    } else {
                        hint = await nwHelper.getHint(rateHelper, matchingEngine, reserveInstances, hintType, undefined, srcToken.address, ethAddress, srcQty);
                    }
                    
                    expectedResult = await nwHelper.getAndCalcRates(matchingEngine, storage, reserveInstances,
                        srcToken.address, ethAddress, srcQty,
                        srcDecimals, ethDecimals,
                        networkFeeBps, zeroBN, hint);
                    
                    await srcToken.transfer(taker, srcQty);
                    await srcToken.approve(networkProxyV1.address, srcQty, {from: taker});

                    let initialReserveBalances = await nwHelper.getReserveBalances(srcToken, ethAddress, expectedResult);
                    // get token balance of taker, eth balance of user1
                    let initialTakerBalances = await nwHelper.getTakerBalances(srcToken, ethAddress, user1, taker);

                    let txResult = await networkProxyV1.tradeWithHint(
                        srcToken.address,
                        srcQty,
                        ethAddress,
                        user1,
                        maxDestAmt,
                        minConversionRate,
                        zeroAddress,
                        hint,
                        {from: taker}
                    );
                    console.log(`token -> ETH (${tradeStr[hintType]}): ${txResult.receipt.gasUsed} gas used`);
                    await nwHelper.compareBalancesAfterTrade(srcToken, ethAddress, srcQty,
                        initialReserveBalances, initialTakerBalances, expectedResult, user1, taker);
                });

                it(`should perform a E2T tradeWithHint (backwards compatible, (${tradeStr[hintType]}) and check balances change as expected`, async() => {
                    if (hintType == PERM_HINTTYPE) {
                        hint = web3.utils.fromAscii("PERM");
                    } else {
                        hint = await nwHelper.getHint(rateHelper, matchingEngine, reserveInstances, hintType, undefined, ethAddress, destToken.address, ethSrcQty);
                    }

                    expectedResult = await nwHelper.getAndCalcRates(matchingEngine, storage, reserveInstances,
                        ethAddress, destToken.address, ethSrcQty,
                        ethDecimals, destDecimals,
                        networkFeeBps, zeroBN, hint);

                    let initialReserveBalances = await nwHelper.getReserveBalances(ethAddress, destToken, expectedResult);
                    let initialTakerBalances = await nwHelper.getTakerBalances(ethAddress, destToken, taker, undefined);

                    let txResult = await networkProxyV1.tradeWithHint(
                        ethAddress,
                        ethSrcQty,
                        destToken.address,
                        taker,
                        maxDestAmt,
                        minConversionRate,
                        zeroAddress,
                        hint,
                        {from: taker, value: ethSrcQty, gasPrice: new BN(0)}
                    );
                    console.log(`ETH -> token (${tradeStr[hintType]}): ${txResult.receipt.gasUsed} gas used`);

                    await nwHelper.compareBalancesAfterTrade(ethAddress, destToken, ethSrcQty,
                        initialReserveBalances, initialTakerBalances, expectedResult, taker, undefined);
                });

                it(`should perform a T2T tradeWithHint (backwards compatible, (${tradeStr[hintType]}) and check balances change as expected`, async() => {
                    if (hintType == PERM_HINTTYPE) {
                        hint = web3.utils.fromAscii("PERM");
                    } else {
                        hint = await nwHelper.getHint(rateHelper, matchingEngine, reserveInstances, hintType, undefined, srcToken.address, destToken.address, srcQty);
                    }

                    expectedResult = await nwHelper.getAndCalcRates(matchingEngine, storage, reserveInstances,
                        srcToken.address, destToken.address, srcQty,
                        srcDecimals, destDecimals,
                        networkFeeBps, zeroBN, hint);

                    await srcToken.transfer(taker, srcQty);
                    await srcToken.approve(networkProxyV1.address, srcQty, {from: taker});
                    
                    let initialReserveBalances = await nwHelper.getReserveBalances(srcToken, destToken, expectedResult);
                    let initialTakerBalances = await nwHelper.getTakerBalances(srcToken, destToken, taker, taker);

                    let txResult = await networkProxyV1.tradeWithHint(
                        srcToken.address,
                        srcQty,
                        destToken.address,
                        taker,
                        maxDestAmt,
                        minConversionRate,
                        zeroAddress,
                        hint,
                        {from: taker}
                    );
                    console.log(`token -> token (${tradeStr[hintType]}): ${txResult.receipt.gasUsed} gas used`);

                    await nwHelper.compareBalancesAfterTrade(srcToken, destToken, srcQty,
                        initialReserveBalances, initialTakerBalances, expectedResult, taker, taker);
                });
            }

            it("should verify buy with small max dest amount, balances changed as expected", async() => {
                hint = web3.utils.fromAscii("PERM");
                expectedResult = await nwHelper.getAndCalcRates(matchingEngine, storage, reserveInstances,
                    ethAddress, destToken.address, ethSrcQty,
                    ethDecimals, destDecimals,
                    networkFeeBps, zeroBN, hint);

                let takerEthBal = await Helper.getBalancePromise(taker);
                let takerTokenBal = await destToken.balanceOf(taker);

                let smallerDestAmount = expectedResult.actualDestAmount.sub(new BN(5000));

                expectedResult.actualDestAmount = smallerDestAmount;

                let txGasPrice = new BN(10).mul(new BN(10).pow(new BN(9)));
                let txResult = await networkProxyV1.tradeWithHint(
                    ethAddress,
                    ethSrcQty,
                    destToken.address,
                    taker,
                    smallerDestAmount,
                    minConversionRate,
                    zeroAddress,
                    hint,
                    {from: taker, value: ethSrcQty, gasPrice: txGasPrice}
                );

                let actualSrcAmount = new BN(txResult.logs[0].args.actualSrcAmount);
                let txFee = txGasPrice.mul(new BN(txResult.receipt.gasUsed));

                Helper.assertEqual(await Helper.getBalancePromise(taker), takerEthBal.sub(actualSrcAmount).sub(txFee), "eth bal is incorrect");
                Helper.assertEqual(await destToken.balanceOf(taker), takerTokenBal.add(smallerDestAmount), "token bal is incorrect");
            });

            it("should verify T2T with small max dest amount, balances changed as expected", async() => {
                hint = web3.utils.fromAscii("PERM");

                expectedResult = await nwHelper.getAndCalcRates(matchingEngine, storage, reserveInstances,
                    srcToken.address, destToken.address, srcQty,
                    srcDecimals, destDecimals,
                    networkFeeBps, zeroBN, hint);

                await srcToken.transfer(taker, srcQty);
                await srcToken.approve(networkProxyV1.address, srcQty, {from: taker});

                let takerSrcBal = await srcToken.balanceOf(taker);
                let takerDstBal = await destToken.balanceOf(taker);

                let smallerDestAmount = expectedResult.actualDestAmount.sub(new BN(5000));

                let txResult = await networkProxyV1.tradeWithHint(
                    srcToken.address,
                    srcQty,
                    destToken.address,
                    taker,
                    smallerDestAmount,
                    minConversionRate,
                    zeroAddress,
                    hint,
                    {from: taker}
                );

                let actualSrcAmount = new BN(txResult.logs[0].args.actualSrcAmount);

                Helper.assertEqual(takerSrcBal.sub(actualSrcAmount), await srcToken.balanceOf(taker), "invalid src token");
                Helper.assertEqual(takerDstBal.add(smallerDestAmount), await destToken.balanceOf(taker), "invalid dst token");
            });

            it("should revert tradeWithHint reverted when invalid hint (E2T, T2E, T2T)", async function() {
                hint = web3.utils.fromAscii("P");
                info = [ethSrcQty, networkFeeBps, zeroBN];

                // E2T trade
                await expectRevert.unspecified(
                    networkProxyV1.tradeWithHint(
                        ethAddress,
                        ethSrcQty,
                        destToken.address,
                        taker,
                        maxDestAmt,
                        minConversionRate,
                        zeroAddress,
                        hint,
                        {from: taker, value: ethSrcQty},
                    ),
                    "trade invalid, if hint involved, try parseHint API"
                );

                // T2E trade
                await expectRevert.unspecified(
                    networkProxyV1.tradeWithHint(
                        srcToken.address,
                        srcQty,
                        ethAddress,
                        user1,
                        maxDestAmt,
                        minConversionRate,
                        zeroAddress,
                        hint,
                        {from: taker}
                    ),
                    "trade invalid, if hint involved, try parseHint API"
                );

                // T2T trade
                await expectRevert.unspecified(
                    networkProxyV1.tradeWithHint(
                        srcToken.address,
                        srcQty,
                        destToken.address,
                        taker,
                        maxDestAmt,
                        minConversionRate,
                        zeroAddress,
                        hint,
                        {from: taker},
                    ),
                    "trade invalid, if hint involved, try parseHint API"
                );
                hint = web3.utils.fromAscii("PERM");
            });

            it("should verify sell reverted not enough balance or allowance", async function () {
                // not enough balance
                await srcToken.approve(networkProxyV1.address, srcQty, {from: taker});
                await srcToken.transfer(user1, await srcToken.balanceOf(taker), {from: taker});

                await expectRevert.unspecified(
                    networkProxyV1.tradeWithHint(
                        srcToken.address,
                        srcQty,
                        destToken.address,
                        taker,
                        maxDestAmt,
                        minConversionRate,
                        zeroAddress,
                        hint,
                        {from: taker}
                    )
                );

                // not enough allowance
                await srcToken.transfer(taker, srcQty);
                await srcToken.approve(networkProxyV1.address, 0, {from: taker});
                await srcToken.approve(networkProxyV1.address, srcQty.sub(new BN(1)), {from: taker});

                await expectRevert.unspecified(
                    networkProxyV1.tradeWithHint(
                        srcToken.address,
                        srcQty,
                        destToken.address,
                        taker,
                        maxDestAmt,
                        minConversionRate,
                        zeroAddress,
                        hint,
                        {from: taker}
                    )
                );
            });

            it("should verify buy reverted when bad eth is sent", async function() {
                // E2T, msg.value != srcAmount
                await expectRevert.unspecified(
                    networkProxyV1.tradeWithHint(
                        ethAddress,
                        ethSrcQty,
                        destToken.address,
                        taker,
                        maxDestAmt,
                        minConversionRate,
                        zeroAddress,
                        hint,
                        {from: taker, value: 0}
                    )
                );
                await expectRevert.unspecified(
                    networkProxyV1.tradeWithHint(
                        ethAddress,
                        ethSrcQty,
                        destToken.address,
                        taker,
                        maxDestAmt,
                        minConversionRate,
                        zeroAddress,
                        hint,
                        {from: taker, value: ethSrcQty.sub(new BN(1))}
                    )
                );
                await expectRevert.unspecified(
                    networkProxyV1.tradeWithHint(
                        ethAddress,
                        ethSrcQty,
                        destToken.address,
                        taker,
                        maxDestAmt,
                        minConversionRate,
                        zeroAddress,
                        hint,
                        {from: taker, value: ethSrcQty.add(new BN(1))}
                    )
                );
            });

            it("should verify sell reverted when sent with eth value", async function() {
                // T2E, msg.value > 0
                await srcToken.approve(networkProxyV1.address, srcQty, {from: taker});
                await srcToken.transfer(taker, srcQty);

                await expectRevert.unspecified(
                    networkProxyV1.tradeWithHint(
                        srcToken.address,
                        srcQty,
                        destToken.address,
                        taker,
                        maxDestAmt,
                        minConversionRate,
                        zeroAddress,
                        hint,
                        {from: taker, value: new BN(1)}
                    )
                );
            })

            it("should revert when network is disabled", async function() {
                await network.setEnable(false, {from: admin});
                await expectRevert.unspecified(
                    networkProxyV1.tradeWithHint(
                        ethAddress,
                        ethSrcQty,
                        destToken.address,
                        taker,
                        maxDestAmt,
                        minConversionRate,
                        zeroAddress,
                        hint,
                        {from: taker, value: ethSrcQty}
                    )
                );

                await network.setEnable(true, {from: admin});
                await networkProxyV1.tradeWithHint(
                    ethAddress,
                    ethSrcQty,
                    destToken.address,
                    taker,
                    maxDestAmt,
                    minConversionRate,
                    zeroAddress,
                    hint,
                    {from: taker, value: ethSrcQty}
                )
            });

            it("should verify trade reverted when gas price above max gas", async function() {
                await expectRevert.unspecified(
                    networkProxyV1.tradeWithHint(
                        ethAddress,
                        ethSrcQty,
                        destToken.address,
                        taker,
                        maxDestAmt,
                        minConversionRate,
                        zeroAddress,
                        hint,
                        {from: taker, value: ethSrcQty, gasPrice: gasPrice.add(new BN(1))}
                    )
                );
                await networkProxyV1.tradeWithHint(
                    ethAddress,
                    ethSrcQty,
                    destToken.address,
                    taker,
                    maxDestAmt,
                    minConversionRate,
                    zeroAddress,
                    hint,
                    {from: taker, value: ethSrcQty, gasPrice: gasPrice}
                )
            });

            it("should verify trade reverted when rate below min rate", async function() {
                let rateResult = await networkProxyV1.getExpectedRate(ethAddress, destToken.address, ethSrcQty);

                await expectRevert.unspecified(
                    networkProxyV1.tradeWithHint(
                        ethAddress,
                        ethSrcQty,
                        destToken.address,
                        taker,
                        maxDestAmt,
                        new BN(rateResult.expectedRate).mul(new BN(2)),
                        zeroAddress,
                        hint,
                        {from: taker, value: ethSrcQty}
                    )
                );
            });

            it("should verify trade reverted when max dest amount is too small", async function() {
                // max dest amount is 0
                await expectRevert.unspecified(
                    networkProxyV1.tradeWithHint(
                        ethAddress,
                        ethSrcQty,
                        zeroAddress,
                        taker,
                        new BN(0),
                        minConversionRate,
                        zeroAddress,
                        hint,
                        {from: taker, value: ethSrcQty}
                    )
                );

                // max dest amount is too small causes rate is 0
                await expectRevert.unspecified(
                    networkProxyV1.tradeWithHint(
                        ethAddress,
                        ethSrcQty,
                        zeroAddress,
                        taker,
                        new BN(100),
                        minConversionRate,
                        zeroAddress,
                        hint,
                        {from: taker, value: ethSrcQty}
                    )
                );
            });

            it("should verify trade reverted when dest address is 0", async function() {
                await expectRevert.unspecified(
                    networkProxyV1.tradeWithHint(
                        ethAddress,
                        ethSrcQty,
                        zeroAddress,
                        taker,
                        maxDestAmt,
                        minConversionRate,
                        zeroAddress,
                        hint,
                        {from: taker, value: ethSrcQty}
                    )
                );
                await srcToken.approve(networkProxyV1.address, srcQty, {from: taker});
                await srcToken.transfer(taker, srcQty);

                await expectRevert.unspecified(
                    networkProxyV1.tradeWithHint(
                        srcToken.address,
                        srcQty,
                        zeroAddress,
                        taker,
                        maxDestAmt,
                        minConversionRate,
                        zeroAddress,
                        hint,
                        {from: taker}
                    )
                );
            });

            it("should verify trade reverted same src and dest token", async function() {
                // E2E
                await expectRevert.unspecified(
                    networkProxyV1.tradeWithHint(
                        ethAddress,
                        ethSrcQty,
                        ethAddress,
                        taker,
                        maxDestAmt,
                        minConversionRate,
                        zeroAddress,
                        hint,
                        {from: taker, value: ethSrcQty}
                    )
                )
                // srcToken to srcToken
                await srcToken.approve(networkProxyV1.address, srcQty, {from: taker});
                await srcToken.transfer(taker, srcQty);

                await expectRevert.unspecified(
                    networkProxyV1.tradeWithHint(
                        srcToken.address,
                        srcQty,
                        srcToken.address,
                        taker,
                        maxDestAmt,
                        minConversionRate,
                        zeroAddress,
                        hint,
                        {from: taker}
                    )
                )
            });

            it("should disable fpr reserve, perform buy and sell: balances changed as expected", async function() {
                // disable 1 fpr reserve
                for (const [key, value] of Object.entries(reserveInstances)) {
                    reserve = value.instance;
                    if (value.type == type_fpr) {
                        // operator is alerter
                        await reserve.disableTrade({from: operator});
                        break;
                    }
                }

                hint = web3.utils.fromAscii("PERM");
                expectedResult = await nwHelper.getAndCalcRates(matchingEngine, storage, reserveInstances,
                    ethAddress, destToken.address, ethSrcQty,
                    ethDecimals, destDecimals,
                    networkFeeBps, zeroBN, hint);

                let initialReserveBalances = await nwHelper.getReserveBalances(ethAddress, destToken, expectedResult);
                let initialTakerBalances = await nwHelper.getTakerBalances(ethAddress, destToken, taker, undefined);

                await networkProxyV1.tradeWithHint(
                    ethAddress,
                    ethSrcQty,
                    destToken.address,
                    taker,
                    maxDestAmt,
                    minConversionRate,
                    zeroAddress,
                    hint,
                    {from: taker, value: ethSrcQty, gasPrice: new BN(0)}
                );

                await nwHelper.compareBalancesAfterTrade(ethAddress, destToken, ethSrcQty,
                    initialReserveBalances, initialTakerBalances, expectedResult, taker, undefined);

                expectedResult = await nwHelper.getAndCalcRates(matchingEngine, storage, reserveInstances,
                    srcToken.address, ethAddress, srcQty,
                    srcDecimals, ethDecimals,
                    networkFeeBps, zeroBN, hint);

                await srcToken.transfer(taker, srcQty);
                await srcToken.approve(networkProxyV1.address, srcQty, {from: taker});

                initialReserveBalances = await nwHelper.getReserveBalances(srcToken, ethAddress, expectedResult);
                // get token balance of taker, eth balance of user1
                initialTakerBalances = await nwHelper.getTakerBalances(srcToken, ethAddress, user1, taker);

                await networkProxyV1.tradeWithHint(
                    srcToken.address,
                    srcQty,
                    ethAddress,
                    user1,
                    maxDestAmt,
                    minConversionRate,
                    zeroAddress,
                    hint,
                    {from: taker}
                );

                // compare token balance of taker, eth balance of user1
                await nwHelper.compareBalancesAfterTrade(srcToken, ethAddress, srcQty,
                    initialReserveBalances, initialTakerBalances, expectedResult, user1, taker);

                // disable 1 fpr reserve
                for (const [key, value] of Object.entries(reserveInstances)) {
                    reserve = value.instance;
                    if (value.type == type_fpr) {
                        // operator is alerter
                        await reserve.enableTrade({from: admin});
                    }
                }
            });

            it("should test T2T one reserve, balances changed as expected", async function() {
                // remove all reserves
                await nwHelper.removeReservesFromStorage(storage, reserveInstances, tokens, operator);
                reserveInstances = {};
                numReserves = 0;

                // setup only 1 reserve
                let result = await nwHelper.setupReserves(network, tokens, 0, 1, 0, 0, accounts, admin, operator);

                reserveInstances = result.reserveInstances;
                numReserves += result.numAddedReserves * 1;

                //add and list pair for reserve
                await nwHelper.addReservesToStorage(storage, reserveInstances, tokens, operator);

                hint = web3.utils.fromAscii("PERM");
                expectedResult = await nwHelper.getAndCalcRates(matchingEngine, storage, reserveInstances,
                    srcToken.address, destToken.address, srcQty,
                    srcDecimals, destDecimals,
                    networkFeeBps, zeroBN, hint);

                await srcToken.transfer(taker, srcQty);
                await srcToken.approve(networkProxyV1.address, srcQty, {from: taker});

                let initialReserveBalances = await nwHelper.getReserveBalances(srcToken, destToken, expectedResult);
                let initialTakerBalances = await nwHelper.getTakerBalances(srcToken, destToken, taker, taker);

                let txResult = await networkProxyV1.tradeWithHint(
                    srcToken.address,
                    srcQty,
                    destToken.address,
                    taker,
                    maxDestAmt,
                    minConversionRate,
                    zeroAddress,
                    hint,
                    {from: taker}
                );
                console.log(`token -> token only 1 reserve (${tradeStr[hintType]}): ${txResult.receipt.gasUsed} gas used`);

                await nwHelper.compareBalancesAfterTrade(srcToken, destToken, srcQty,
                    initialReserveBalances, initialTakerBalances, expectedResult, taker, taker);

                // remove all reserves
                await nwHelper.removeReservesFromStorage(storage, reserveInstances, tokens, operator);
                reserveInstances = {};
                numReserves = 0;

                // setup only 3 reserves
                result = await nwHelper.setupReserves(network, tokens, 2, 1, 0, 0, accounts, admin, operator);

                reserveInstances = result.reserveInstances;
                numReserves += result.numAddedReserves * 1;

                //add and list pair for reserve
                await nwHelper.addReservesToStorage(storage, reserveInstances, tokens, operator);
            });

            it("should test T2T 2 different reserves, balances changed as expected", async function() {
                // remove all reserves
                await nwHelper.removeReservesFromStorage(storage, reserveInstances, tokens, operator);
                reserveInstances = {};
                numReserves = 0;

                // setup only 1 reserve
                let result = await nwHelper.setupReserves(network, tokens, 2, 0, 0, 0, accounts, admin, operator);

                reserveInstances = result.reserveInstances;
                numReserves += result.numAddedReserves * 1;

                //add and list pair for reserve
                await nwHelper.addReservesToStorage(storage, reserveInstances, tokens, operator);

                // one reserve has rate srcToken -> eth, the other has rate eth -> destToken
                tokensPerEther = precisionUnits.mul(new BN(30));
                ethersPerToken = precisionUnits.div(new BN(30));
                let isFirstReserve = true;
                for (const [key, value] of Object.entries(reserveInstances)) {
                    reserve = value.instance;
                    if (isFirstReserve) {
                        // has rate srcToken -> eth, no rate eth -> destToken
                        await reserve.setRate(srcToken.address, tokensPerEther, ethersPerToken);
                        await reserve.setRate(destToken.address, 0, 0);
                    } else {
                        await reserve.setRate(destToken.address, tokensPerEther, ethersPerToken);
                        await reserve.setRate(srcToken.address, 0, 0);
                    }
                    isFirstReserve = false;
                }

                hint = web3.utils.fromAscii("PERM");
                expectedResult = await nwHelper.getAndCalcRates(matchingEngine, storage, reserveInstances,
                    srcToken.address, destToken.address, srcQty,
                    srcDecimals, destDecimals,
                    networkFeeBps, zeroBN, hint);

                await srcToken.transfer(taker, srcQty);
                await srcToken.approve(networkProxyV1.address, srcQty, {from: taker});

                let initialReserveBalances = await nwHelper.getReserveBalances(srcToken, destToken, expectedResult);
                let initialTakerBalances = await nwHelper.getTakerBalances(srcToken, destToken, taker, taker);

                let txResult = await networkProxyV1.tradeWithHint(
                    srcToken.address,
                    srcQty,
                    destToken.address,
                    taker,
                    maxDestAmt,
                    minConversionRate,
                    zeroAddress,
                    hint,
                    {from: taker}
                );
                console.log(`token -> token 2 different reserve2 (${tradeStr[hintType]}): ${txResult.receipt.gasUsed} gas used`);

                await nwHelper.compareBalancesAfterTrade(srcToken, destToken, srcQty,
                    initialReserveBalances, initialTakerBalances, expectedResult, taker, taker);

                // remove all reserves
                await nwHelper.removeReservesFromStorage(storage, reserveInstances, tokens, operator);
                reserveInstances = {};
                numReserves = 0;

                // setup only 3 reserves
                result = await nwHelper.setupReserves(network, tokens, 2, 1, 0, 0, accounts, admin, operator);

                reserveInstances = result.reserveInstances;
                numReserves += result.numAddedReserves * 1;

                //add and list pair for reserve
                await nwHelper.addReservesToStorage(storage, reserveInstances, tokens, operator);
            });

            it("should test trade with simple swapTokenToEther API, balances changed as expected", async() => {
                hint = await nwHelper.getHint(rateHelper, matchingEngine, reserveInstances, EMPTY_HINTTYPE, undefined, srcToken.address, ethAddress, srcQty);
                expectedResult = await nwHelper.getAndCalcRates(matchingEngine, storage, reserveInstances,
                    srcToken.address, ethAddress, srcQty,
                    srcDecimals, ethDecimals,
                    networkFeeBps, zeroBN, hint);

                await srcToken.transfer(taker, srcQty);
                await srcToken.approve(networkProxyV1.address, srcQty, {from: taker});

                let initialReserveBalances = await nwHelper.getReserveBalances(srcToken, ethAddress, expectedResult);
                let initialTakerBalances = await nwHelper.getTakerBalances(srcToken, ethAddress, taker, taker);

                let txGasPrice = new BN(10).mul(new BN(10).pow(new BN(9)));
                let txResult = await networkProxyV1.swapTokenToEther(
                    srcToken.address,
                    srcQty,
                    minConversionRate,
                    {from: taker, gasPrice: txGasPrice}
                );

                let txFee = txGasPrice.mul(new BN(txResult.receipt.gasUsed));
                expectedResult.actualDestAmount.isub(txFee);

                await nwHelper.compareBalancesAfterTrade(srcToken, ethAddress, srcQty,
                    initialReserveBalances, initialTakerBalances, expectedResult, taker, taker);
            });

            it("should test trade with simple swapTokenToToken API, balances changed as expected", async() => {
                hint = await nwHelper.getHint(rateHelper, matchingEngine, reserveInstances, EMPTY_HINTTYPE, undefined, srcToken.address, destToken.address, srcQty);
                expectedResult = await nwHelper.getAndCalcRates(matchingEngine, storage, reserveInstances,
                    srcToken.address, destToken.address, srcQty,
                    srcDecimals, destDecimals,
                    networkFeeBps, zeroBN, hint);

                await srcToken.transfer(taker, srcQty);
                await srcToken.approve(networkProxyV1.address, srcQty, {from: taker});

                let initialReserveBalances = await nwHelper.getReserveBalances(srcToken, destToken, expectedResult);
                let initialTakerBalances = await nwHelper.getTakerBalances(srcToken, destToken, taker, taker);

                await networkProxyV1.swapTokenToToken(
                    srcToken.address,
                    srcQty,
                    destToken.address,
                    minConversionRate,
                    {from: taker}
                );

                await nwHelper.compareBalancesAfterTrade(srcToken, destToken, srcQty,
                    initialReserveBalances, initialTakerBalances, expectedResult, taker, taker);
            });

            it("should test trade with simple swapEthToToken API, balances changed as expected", async() => {
                hint = await nwHelper.getHint(rateHelper, matchingEngine, reserveInstances, EMPTY_HINTTYPE, undefined, ethAddress, destToken.address, srcQty);
                expectedResult = await nwHelper.getAndCalcRates(matchingEngine, storage, reserveInstances,
                    ethAddress, destToken.address, ethSrcQty,
                    ethDecimals, destDecimals,
                    networkFeeBps, zeroBN, hint);

                let initialReserveBalances = await nwHelper.getReserveBalances(ethAddress, destToken, expectedResult);
                let initialTakerBalances = await nwHelper.getTakerBalances(ethAddress, destToken, taker, taker);

                await networkProxyV1.swapEtherToToken(
                    destToken.address,
                    minConversionRate,
                    {from: taker, value: ethSrcQty, gasPrice: new BN(0)}
                );

                await nwHelper.compareBalancesAfterTrade(ethAddress, destToken, ethSrcQty,
                    initialReserveBalances, initialTakerBalances, expectedResult, taker, taker);
            });

            it("should test trade with trade API, balances changed as expected", async() => {
                hint = await nwHelper.getHint(rateHelper, matchingEngine, reserveInstances, EMPTY_HINTTYPE, undefined, srcToken.address, destToken.address, srcQty);
                expectedResult = await nwHelper.getAndCalcRates(matchingEngine, storage, reserveInstances,
                    srcToken.address, destToken.address, srcQty,
                    srcDecimals, destDecimals,
                    networkFeeBps, zeroBN, hint);

                await srcToken.transfer(taker, srcQty);
                await srcToken.approve(networkProxyV1.address, srcQty, {from: taker});

                let initialReserveBalances = await nwHelper.getReserveBalances(srcToken, destToken, expectedResult);
                let initialTakerBalances = await nwHelper.getTakerBalances(srcToken, destToken, taker, taker);

                await networkProxyV1.trade(
                    srcToken.address,
                    srcQty,
                    destToken.address,
                    taker,
                    maxDestAmt,
                    minConversionRate,
                    zeroAddress,
                    {from: taker}
                );
                await nwHelper.compareBalancesAfterTrade(srcToken, destToken, srcQty,
                    initialReserveBalances, initialTakerBalances, expectedResult, taker, taker);

                hint = await nwHelper.getHint(rateHelper, matchingEngine, reserveInstances, EMPTY_HINTTYPE, undefined, srcToken.address, ethAddress, srcQty);
                expectedResult = await nwHelper.getAndCalcRates(matchingEngine, storage, reserveInstances,
                    srcToken.address, ethAddress, srcQty,
                    srcDecimals, ethDecimals,
                    networkFeeBps, zeroBN, hint);

                await srcToken.transfer(taker, srcQty);
                await srcToken.approve(networkProxyV1.address, srcQty, {from: taker});

                initialReserveBalances = await nwHelper.getReserveBalances(srcToken, ethAddress, expectedResult);
                initialTakerBalances = await nwHelper.getTakerBalances(srcToken, ethAddress, user1, taker);

                await networkProxyV1.trade(
                    srcToken.address,
                    srcQty,
                    ethAddress,
                    user1,
                    maxDestAmt,
                    minConversionRate,
                    zeroAddress,
                    {from: taker}
                );
                await nwHelper.compareBalancesAfterTrade(srcToken, ethAddress, srcQty,
                    initialReserveBalances, initialTakerBalances, expectedResult, user1, taker);

                hint = await nwHelper.getHint(rateHelper, matchingEngine, reserveInstances, EMPTY_HINTTYPE, undefined, ethAddress, destToken.address, ethSrcQty);
                expectedResult = await nwHelper.getAndCalcRates(matchingEngine, storage, reserveInstances,
                    ethAddress, destToken.address, ethSrcQty,
                    ethDecimals, destDecimals,
                    networkFeeBps, zeroBN, hint);

                initialReserveBalances = await nwHelper.getReserveBalances(ethAddress, destToken, expectedResult);
                initialTakerBalances = await nwHelper.getTakerBalances(ethAddress, destToken, taker, undefined);

                await networkProxyV1.tradeWithHint(
                    ethAddress,
                    ethSrcQty,
                    destToken.address,
                    taker,
                    maxDestAmt,
                    minConversionRate,
                    zeroAddress,
                    hint,
                    {from: taker, value: ethSrcQty, gasPrice: new BN(0)}
                );

                await nwHelper.compareBalancesAfterTrade(ethAddress, destToken, ethSrcQty,
                    initialReserveBalances, initialTakerBalances, expectedResult, taker, undefined);
            });

            it("verify trade is reverted when malicious reserve tries recursive call = tries to call kyber trade function.", async function () {
                await nwHelper.removeReservesFromStorage(storage, reserveInstances, tokens, operator);
                reserveInstances = {};
                numReserves = 0;

                let malReserve = await MaliciousReserve.new();
                await malReserve.setDestAddress(scammer);
                await malReserve.setDestToken(destToken.address);
                await malReserve.setKyberProxy(networkProxyV1.address);
                await malReserve.setNumRecursive(0);

                // setup and add reserve
                let tokensPerEther = precisionUnits.mul(new BN(20));

                let ethInit = (new BN(10)).pow(new BN(19)).mul(new BN(8)); 
                //send ETH
                await Helper.sendEtherWithPromise(accounts[0], malReserve.address, ethInit);

                for (let j = 0; j < tokens.length; j++) {
                    token = tokens[j];
                    //set rates and send tokens
                    await malReserve.setRate(token.address, tokensPerEther);
                    let initialTokenAmount = new BN(200000).mul(new BN(10).pow(new BN(await token.decimals())));
                    await token.transfer(malReserve.address, initialTokenAmount);
                    await Helper.assertSameTokenBalance(malReserve.address, token, initialTokenAmount);
                }

                // add reserve to network
                let reserveId = (await nwHelper.genReserveID(MOCK_ID, malReserve.address)).toLowerCase();
                await storage.addReserve(malReserve.address, reserveId, ReserveType.FPR, malReserve.address, {from: operator});
                for (let j = 0; j < tokens.length; j++) {
                    await storage.listPairForReserve(reserveId, tokens[j].address, true, true, true, {from: operator});
                }

                let amountWei = 960;

                //first see we have rates
                let buyRate = await networkProxyV1.getExpectedRate(ethAddress, destToken.address, amountWei);
                Helper.assertGreater(buyRate[0], 0);
                Helper.assertGreater(buyRate[1], 0);

                //test trade from malicious
                let balanceBefore = await destToken.balanceOf(scammer);
                // here test the internal trade in malicious is valid
                await malReserve.doTrade();

                let balanceAfter = await destToken.balanceOf(scammer);
                Helper.assertGreater(balanceAfter, balanceBefore);

                //see trade success when numRecursive is 0
                await malReserve.setNumRecursive(0);
                await networkProxyV1.trade(
                    ethAddress,
                    amountWei,
                    destToken.address,
                    taker,
                    maxDestAmt,
                    buyRate[1],
                    zeroAddress,
                    {from: taker, value: amountWei}
                );

                //see trade ether to token reverts when num recursive > 0
                await malReserve.setNumRecursive(1);
                Helper.assertEqual(1, await malReserve.numRecursive());

                await expectRevert.unspecified(
                    networkProxyV1.trade(
                        ethAddress,
                        amountWei,
                        destToken.address,
                        taker,
                        maxDestAmt,
                        0,
                        zeroAddress,
                        {from: taker, value: amountWei}
                    )
                )

                for (let j = 0; j < tokens.length; j++) {
                    await storage.listPairForReserve(reserveId, tokens[j].address, true, true, false, {from: operator});
                }
                await storage.removeReserve(reserveId, 0, {from: operator});
            });

            it("should test can't init this contract with empty contracts (address 0) or with non admin.", async function () {
                let proxyTemp;

                await expectRevert.unspecified(
                    NetworkProxyV1.new(zeroAddress),
                )

                proxyTemp = await NetworkProxyV1.new(admin);

                let rxNetworkAddress = await proxyTemp.kyberNetworkContract();
                Helper.assertEqual(zeroAddress, rxNetworkAddress, "should be zero address");

                await proxyTemp.setKyberNetworkContract(network.address, {from: admin});

                rxNetworkAddress = await proxyTemp.kyberNetworkContract();
                Helper.assertEqual(network.address, rxNetworkAddress, "should be correct address");

                await expectRevert.unspecified(
                    proxyTemp.setKyberNetworkContract(zeroAddress, {from: user1})
                )

                rxNetworkAddress = await proxyTemp.kyberNetworkContract();
                Helper.assertEqual(network.address, rxNetworkAddress, "should be correct address");
            });

            it("should set kyberNetwork and test event.", async function () {
                let tempNetworkAdd = accounts[7];
                let result = await networkProxyV1.setKyberNetworkContract(tempNetworkAdd, {from: admin});

                expectEvent(result, 'KyberNetworkSet', {
                    newNetworkContract: tempNetworkAdd,
                    oldNetworkContract: network.address,
                });

                result = await networkProxyV1.setKyberNetworkContract(network.address, {from: admin});

                expectEvent(result, 'KyberNetworkSet', {
                    newNetworkContract: network.address,
                    oldNetworkContract: tempNetworkAdd,
                });
            });

            it("should getUserCapInWei revert - obsolete function, should revert but actually return random value", async function () {
                await expectRevert.unspecified(
                    networkProxyV1.getUserCapInWei(taker)
                )
            });

            it("should getUserCapInTokenWei revert - obsolete function, should revert but actually return random value", async function () {
                await expectRevert.unspecified(
                    networkProxyV1.getUserCapInTokenWei(taker, srcToken.address)
                )
            });

            it("should info() revert - obsolete function, should revert but actually return random value", async function () {
                await expectRevert.unspecified(
                    networkProxyV1.info(web3.utils.fromAscii("test"))
                )
            });

            it("should verify trade reverted src amount > max src amount (10**28).", async function () {
                let amountTWei = (new BN(10).pow(new BN(28))).add(new BN(1));

                // transfer funds to user and approve funds to network - for all trades in this 'it'
                await token.transfer(taker, amountTWei);
                await token.approve(networkProxyV1.address, amountTWei, {from: taker})

                await expectRevert.unspecified(
                    networkProxyV1.tradeWithHint(
                        srcToken.address,
                        amountTWei,
                        ethAddress,
                        user1,
                        maxDestAmt,
                        minConversionRate,
                        zeroAddress,
                        hint,
                        {from: taker}
                    )
                );
            });
        });
    });

    describe("MaliciousNetwork + KyberProxyV1", async () => {
        let tempStorage;
        before("init smart malicious network and set all contracts and params", async () => {
            networkProxyV1 = await NetworkProxyV1.new(admin);
            [maliciousNetwork, tempStorage] = await nwHelper.setupNetwork(MaliciousNetwork, networkProxyV1.address, KNC.address, kyberDao.address, admin, operator);
            await networkProxyV1.setKyberNetworkContract(maliciousNetwork.address);

            // add reserves and list tokens
            let result = await nwHelper.setupReserves(maliciousNetwork, tokens, 2, 1, 0, 0, accounts, admin, operator);
            reserveInstances = result.reserveInstances;

            //add and list pair for reserve
            await nwHelper.addReservesToStorage(tempStorage, reserveInstances, tokens, operator);
        });

        after("unlist and remove reserve", async() => {
            await nwHelper.removeReservesFromStorage(tempStorage, reserveInstances, tokens, operator);
            reserveInstances = {};
        });

        it("verify sell with malicious network reverts when using exact rate as min rate", async function () {
            let amountTwei = new BN(1123);

            // trade with stealing reverts
            //////////////////////////////

            //set steal amount to 1 wei
            let myFee = 1;
            await maliciousNetwork.setMyFeeWei(myFee);
            let rxFeeWei = await maliciousNetwork.myFeeWei();
            Helper.assertEqual(rxFeeWei, myFee, "incorrect fee recorded");

            //get rate
            let rate = await networkProxyV1.getExpectedRate(srcToken.address, ethAddress, amountTwei);

            await srcToken.transfer(taker, amountTwei);
            await srcToken.approve(networkProxyV1.address, amountTwei, {from: taker})

            //see trade reverts
            await expectRevert.unspecified(
                networkProxyV1.trade(srcToken.address, amountTwei, ethAddress, user1, 500000,
                    rate[0], walletId, {from: taker})
            )

            //set steal fee to 0 and see trade success
            await maliciousNetwork.setMyFeeWei(0);
            rxFeeWei = await maliciousNetwork.myFeeWei();
            Helper.assertEqual(0, rxFeeWei, "incorrect fee recorded");

            await networkProxyV1.trade(srcToken.address, amountTwei, ethAddress, user1, 500000,
                        rate[0], walletId, {from: taker});
        });

        it("verify buy with malicious network reverts when using exact rate as min rate", async function () {
            let amountWei = new BN(960);

            // trade with stealing reverts
            //////////////////////////////

            //set "myFee" (malicious) amount to 1 wei
            let myFee = 1;
            await maliciousNetwork.setMyFeeWei(myFee);
            let rxFeeWei = await maliciousNetwork.myFeeWei();
            Helper.assertEqual(rxFeeWei, myFee, "incorrect fee recorded");

            //get rate
            let rate = await networkProxyV1.getExpectedRate(ethAddress, destToken.address, amountWei);
            //see trade reverts
            await expectRevert.unspecified(
                networkProxyV1.trade(
                    ethAddress,
                    amountWei,
                    destToken.address,
                    user1,
                    maxDestAmt,
                    rate[0],
                    zeroAddress,
                    {from:taker, value: amountWei}
                )
            )

            //set steal fee to 0 and see trade success
            await maliciousNetwork.setMyFeeWei(0);

            await networkProxyV1.trade(
                ethAddress,
                amountWei,
                destToken.address,
                user1,
                maxDestAmt,
                rate[0],
                zeroAddress,
                {from:taker, value: amountWei}
            );
        });

        it("verify buy with malicious network reverts when using slippage rate as min rate - depending on taken amount", async function () {
            let amountWei = new BN(960);

            // trade with stealing reverts
            //////////////////////////////

            //get rate
            let rate = await networkProxyV1.getExpectedRate(ethAddress, destToken.address, amountWei);
            let expectedDestAmount = Helper.calcDstQty(amountWei, ethDecimals, destDecimals, rate[0]);
            let expectedDestAmount2 = Helper.calcDstQty(amountWei, ethDecimals, destDecimals, rate[1]);

            //use "small fee"
            let mySmallFee = 1;
            await maliciousNetwork.setMyFeeWei(mySmallFee);
            let rxFeeWei = await maliciousNetwork.myFeeWei();
            Helper.assertEqual(rxFeeWei, mySmallFee, "incorrect fee recorded");

            //with slippage as min rate doesn't revert
            await networkProxyV1.trade(
                ethAddress,
                amountWei,
                destToken.address,
                user1,
                maxDestAmt,
                rate[1],
                zeroAddress,
                {from: taker, value: amountWei}
            );

            //with higher fee should revert
            mySmallFee = expectedDestAmount.sub(expectedDestAmount2).add(new BN(1));
            await maliciousNetwork.setMyFeeWei(mySmallFee);
            rxFeeWei = await maliciousNetwork.myFeeWei();
            Helper.assertEqual(rxFeeWei, mySmallFee, "incorrect fee recorded");

            //see trade reverts
            await expectRevert.unspecified(
                networkProxyV1.trade(
                    ethAddress,
                    amountWei,
                    destToken.address,
                    user1,
                    maxDestAmt,
                    rate[1],
                    zeroAddress,
                    {from: taker, value: amountWei}
                )
            )
        });

        it("verify when user sets min rate to 0 all tokens can be stolen", async function () {
            let amountWei = new BN(125);

            let rate = await networkProxyV1.getExpectedRate(ethAddress, destToken.address, amountWei);

            //calc dest amount
            let expectedDest = Helper.calcDstQty(amountWei, ethDecimals, destDecimals, rate[0]);

            let networkBalance = await destToken.balanceOf(maliciousNetwork.address);
            let user1Balance = await destToken.balanceOf(user1);

            //expected dest has 1 wei error
            let mySmallFee = expectedDest.sub(new BN(1));
            await maliciousNetwork.setMyFeeWei(mySmallFee);
            let rxFeeWei = await maliciousNetwork.myFeeWei();
            Helper.assertEqual(rxFeeWei, mySmallFee);

            //with min rate 0
            await networkProxyV1.trade(
                ethAddress,
                amountWei,
                destToken.address,
                user1,
                maxDestAmt,
                0,
                zeroAddress,
                {from: taker, value: amountWei}
            );

            // all fee remains in the network contract
            let networkExpectedBalance = (new BN(networkBalance)).add(mySmallFee);
            let actualNetworkBalance = await destToken.balanceOf(maliciousNetwork.address);

            Helper.assertEqual(networkExpectedBalance, actualNetworkBalance);

            // only receive 1 token
            let user1ExpectedBalance = user1Balance.add(new BN(1));
            let actualUser1Balance = await destToken.balanceOf(user1);

            Helper.assertEqual(user1ExpectedBalance, actualUser1Balance);
        });
    });

    describe("MaliciousNetwork2 + Proxy1", async() => {
        before("init malicious network returning wrong actual dest, and set all contracts and params", async function () {
            networkProxyV1 = await NetworkProxyV1.new(admin);
            [maliciousNetwork2, tempStorage] = await nwHelper.setupNetwork(MaliciousNetwork2, networkProxyV1.address, KNC.address, kyberDao.address, admin, operator);
            await networkProxyV1.setKyberNetworkContract(maliciousNetwork2.address);

            // add reserves and list tokens
            let result = await nwHelper.setupReserves(maliciousNetwork2, tokens, 2, 1, 0, 0, accounts, admin, operator);
            reserveInstances = result.reserveInstances;

            //add and list pair for reserve
            await nwHelper.addReservesToStorage(tempStorage, reserveInstances, tokens, operator);
        });

        after("unlist and remove reserve", async() => {
            await nwHelper.removeReservesFromStorage(tempStorage, reserveInstances, tokens, operator);
            reserveInstances = {};
        });

        it("verify sell with malicious network2 reverts when using any min rate (0).", async function () {
            let amountTwei = 1123;

            //set steal amount to 1 wei
            let myFee = 1;
            await maliciousNetwork2.setMyFeeWei(myFee);
            let rxFeeWei = await maliciousNetwork2.myFeeWei();
            Helper.assertEqual(rxFeeWei, myFee);

            //get rate
            let rate = await networkProxyV1.getExpectedRate(srcToken.address, ethAddress, amountTwei);

            await srcToken.transfer(taker, amountTwei);
            await srcToken.approve(networkProxyV1.address, amountTwei, {from: taker})

            // see trade reverts
            // with this malicious network it reverts since wrong actual dest amount is returned.
            await expectRevert.unspecified(
                networkProxyV1.trade(
                    srcToken.address,
                    amountTwei,
                    ethAddress,
                    user1,
                    maxDestAmt,
                    0,
                    walletId,
                    {from: taker}
                )
            )

            //set steal fee to 0 and see trade success
            await maliciousNetwork2.setMyFeeWei(0);
            rxFeeWei = await maliciousNetwork2.myFeeWei();
            Helper.assertEqual(rxFeeWei, 0);

            await networkProxyV1.trade(
                srcToken.address,
                amountTwei,
                ethAddress,
                user1,
                maxDestAmt,
                0,
                zeroAddress,
                {from: taker}
            )
        });

        it("verify buy with malicious network reverts with any rate (even 0) as min rate", async function () {
            let amountWei = 960;

            //set "myFee" (malicious) amount to 1 wei
            let myFee = 2;
            await maliciousNetwork2.setMyFeeWei(myFee);
            let rxFeeWei = await maliciousNetwork2.myFeeWei();
            Helper.assertEqual(rxFeeWei, myFee);

            //see trade reverts
            await expectRevert.unspecified(
                networkProxyV1.trade(
                    ethAddress,
                    amountWei,
                    destToken.address,
                    user1,
                    maxDestAmt,
                    0,
                    walletId,
                    {from: taker, value: amountWei}
                )
            )

            //set steal fee to 0 and see trade success
            await maliciousNetwork2.setMyFeeWei(0);

            await networkProxyV1.trade(
                ethAddress,
                amountWei,
                destToken.address,
                user1,
                maxDestAmt,
                0,
                zeroAddress,
                {from: taker, value: amountWei}
            );
        });
    });

    // ======================== TO BE ADDED LATER ========================
    describe("GenerousNetwork + Proxy1", async() => {
        before("init 'generous' network with trade reverse direction, could result in overflow.", async function () {
            // in next tests - testing strange situasions that could cause overflow.
            // 1. if src token amount after trade is higher then src amount before trade.
            // 2. if dest amount for dest token after trade is lower then before trade
            networkProxyV1 = await NetworkProxyV1.new(admin);
            [generousNetwork, tempStorage] = await nwHelper.setupNetwork(GenerousNetwork, networkProxyV1.address, KNC.address, kyberDao.address, admin, operator);
            await networkProxyV1.setKyberNetworkContract(generousNetwork.address);

            // add reserves and list tokens
            let result = await nwHelper.setupReserves(generousNetwork, tokens, 2, 1, 0, 0, accounts, admin, operator);
            reserveInstances = result.reserveInstances;

            //add and list pair for reserve
            await nwHelper.addReservesToStorage(tempStorage, reserveInstances, tokens, operator);
        });

        it("verify trade with reverses trade = (src address before is lower then source address after), reverts.", async function () {
            let amountTwei = 1313;

            //get rate
            let rate = await networkProxyV1.getExpectedRate(srcToken.address, ethAddress, amountTwei);

            await srcToken.transfer(taker, amountTwei);
            await srcToken.approve(networkProxyV1.address, amountTwei, {from: taker})

            //see trade reverts
            await expectRevert.unspecified(
                networkProxyV1.trade(
                    srcToken.address,
                    amountTwei,
                    ethAddress,
                    user1,
                    maxDestAmt,
                    rate[1],
                    zeroAddress,
                    {from: taker}
                )
            )
        });

        it("verify trade with reversed trade (malicious token or network) ->dest address after is lower then dest address before, reverts.", async function () {
            let amountWei = 1515;

            // get rate
            let rate = await networkProxyV1.getExpectedRate(ethAddress, destToken.address, amountWei);

            // want user 1 to have some initial balance
            await token.transfer(user1, 2000);

            // see trade reverts
            await expectRevert.unspecified(
                networkProxyV1.trade(
                    ethAddress,
                    amountWei,
                    destToken.address,
                    user1,
                    maxDestAmt,
                    rate[1],
                    zeroAddress,
                    {from: taker, value: amountWei}
                )
            )
        });
    });

    describe("NetworkNoMaxDest + Proxy1", async() => {
        before("init network with no max dest check. set all contracts and params", async function () {
            networkProxyV1 = await NetworkProxyV1.new(admin);
            [networkNoMaxDest, tempStorage] = await nwHelper.setupNetwork(NetworkNoMaxDest, networkProxyV1.address, KNC.address, kyberDao.address, admin, operator);
            await networkProxyV1.setKyberNetworkContract(networkNoMaxDest.address);

            // add reserves and list tokens
            let result = await nwHelper.setupReserves(networkNoMaxDest, tokens, 2, 1, 0, 0, accounts, admin, operator);
            reserveInstances = result.reserveInstances;

            //add and list pair for reserve
            await nwHelper.addReservesToStorage(tempStorage, reserveInstances, tokens, operator);
        });

        it("verify buy with network without max dest reverts if dest amount is below actual dest amount", async function () {
            let amountWei = 960;

            //get rate
            let rate = await networkProxyV1.getExpectedRate(ethAddress, destToken.address, amountWei);
            //eth to token
            let expectedDestTokensTwei = await Helper.calcDstQty(amountWei, ethDecimals, destDecimals, rate[0]);
            let lowMaxDest = expectedDestTokensTwei.sub(new BN(16));

            //see trade reverts
            await expectRevert.unspecified(
                networkProxyV1.trade(
                    ethAddress,
                    amountWei,
                    destToken.address,
                    user1,
                    lowMaxDest,
                    rate[1],
                    walletId,
                    {from: taker, value: amountWei}
                )
            )

            // high max dest shouldn't revert here
            await networkProxyV1.trade(
                ethAddress,
                amountWei,
                destToken.address,
                user1,
                expectedDestTokensTwei.add(new BN(16)),
                rate[1],
                walletId,
                {from: taker, value: amountWei}
            )
        });
    });
});

async function transferTokensToNetwork(networkInstance) {
    for (let i = 0; i < numTokens; i++) {
        token = tokens[i];
        tokenAmountForTrades = new BN(10000).mul(new BN(10).pow(tokenDecimals[i]));
        //transfer tokens to network
        await token.transfer(networkInstance.address, tokenAmountForTrades);
    }
}
