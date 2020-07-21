const TestToken = artifacts.require("Token.sol");
const MockDao = artifacts.require("MockKyberDao.sol");
const KyberNetwork = artifacts.require("KyberNetwork.sol");
const KyberNetworkProxy = artifacts.require("KyberNetworkProxy.sol");
const NetworkProxyV1 = artifacts.require("KyberProxyV1.sol");
const FeeHandler = artifacts.require("KyberFeeHandler.sol");
const MatchingEngine = artifacts.require("KyberMatchingEngine.sol");
const KyberStorage = artifacts.require("KyberStorage.sol");
const RateHelper = artifacts.require("KyberRateHelper.sol");
const Helper = require("../helper.js");
const nwHelper = require("./networkHelper.js");

const BN = web3.utils.BN;

const { precisionUnits, ethAddress, zeroAddress, emptyHint } = require("../helper.js");
const { MASK_IN_HINTTYPE, MASK_OUT_HINTTYPE, SPLIT_HINTTYPE, BEST_OF_ALL_HINTTYPE }  = require('./networkHelper.js');

const PERM_HINTTYPE = 5;

//global variables
//////////////////
const gasPrice = (new BN(10).pow(new BN(9)).mul(new BN(50)));
const negligibleRateDiffBps = new BN(10); //0.01%
const maxDestAmt = new BN(2).pow(new BN(255));
const ethSrcQty = precisionUnits;

let networkFeeBps = new BN(20);

let admin;
let networkProxy;
let networkProxyV1;
let networkStorage;
let network;
let kyberDao;
let feeHandler;
let matchingEngine;
let operator;
let taker;
let platformWallet;

//KyberDao related data
let rewardInBPS = new BN(7000);
let rebateInBPS = new BN(2000);
let epoch = new BN(3);
let expiryTimestamp;

//fee hanlder related
let KNC;
let burnBlockInterval = new BN(30);

//reserve data
//////////////
let reserveInstances = [];
let numReserves;

//tokens data
////////////
let numTokens = 5;
let tokens = [];
let tokenDecimals = [];

const tradeType = [BEST_OF_ALL_HINTTYPE, MASK_IN_HINTTYPE, MASK_OUT_HINTTYPE, SPLIT_HINTTYPE, PERM_HINTTYPE];


contract('Parallel Proxy V1 + V2', function(accounts) {
    before("one time global init", async() => {
        //init accounts
        operator = accounts[1];
        alerter = accounts[2];
        taker = accounts[3];
        platformWallet = accounts[4];
        admin = accounts[5]; // we don't want admin as account 0.
        hintParser = accounts[6];
        daoSetter = accounts[7];

        //KyberDao related init.
        expiryTimestamp = new BN(await Helper.getCurrentBlockTime() + 1000000);
        kyberDao = await MockDao.new(rewardInBPS, rebateInBPS, epoch, expiryTimestamp);
        await kyberDao.setNetworkFeeBps(networkFeeBps);

        // init storage
        networkStorage = await nwHelper.setupStorage(admin);

        //deploy network
        network = await KyberNetwork.new(admin, networkStorage.address);
        await networkStorage.addOperator(operator, {from: admin});
        await networkStorage.setNetworkContract(network.address, {from:admin});


        // init proxy
        networkProxy = await KyberNetworkProxy.new(admin);

        // init proxy v1
        networkProxyV1 = await NetworkProxyV1.new(admin);

        //init matchingEngine
        matchingEngine = await MatchingEngine.new(admin);
        await matchingEngine.setNetworkContract(network.address, {from: admin});
        await matchingEngine.setKyberStorage(networkStorage.address, {from: admin});
        await networkStorage.setFeeAccountedPerReserveType(true, true, true, false, true, true, {from: admin});
        await networkStorage.setEntitledRebatePerReserveType(true, false, true, false, true, true, {from: admin});

        rateHelper = await RateHelper.new(admin);
        await rateHelper.setContracts(kyberDao.address, networkStorage.address, {from: admin});

        // setup proxy
        await networkProxy.setKyberNetwork(network.address, {from: admin});
        await networkProxy.setHintHandler(matchingEngine.address, {from: admin});

        // setup proxy v1
        await networkProxyV1.setKyberNetworkContract(network.address, {from: admin});

        //init tokens
        for (let i = 0; i < numTokens; i++) {
            tokenDecimals[i] = new BN(15).add(new BN(i));
            token = await TestToken.new("test" + i, "tst" + i, tokenDecimals[i]);
            tokens[i] = token;
        }

        //init feeHandler
        KNC = await TestToken.new("kyber network crystal", "KNC", 18);
        feeHandler = await FeeHandler.new(daoSetter, networkProxy.address, network.address, KNC.address, burnBlockInterval, daoSetter);

        // init and setup reserves
        let result = await nwHelper.setupReserves(network, tokens, 0, 5, 0, 0, accounts, admin, operator);
        reserveInstances = result.reserveInstances;
        numReserves += result.numAddedReserves * 1;

        //setup network
        ///////////////
        // add new proxy
        await network.addKyberProxy(networkProxy.address, {from: admin});
        // add proxy v1
        await network.addKyberProxy(networkProxyV1.address, {from: admin});
        await network.addOperator(operator, {from: admin});
        await network.setContracts(feeHandler.address, matchingEngine.address, zeroAddress, {from: admin});
        await network.setKyberDaoContract(kyberDao.address, {from: admin});

        //add and list pair for reserve
        await nwHelper.addReservesToStorage(networkStorage, reserveInstances, tokens, operator);

        //set params, enable network
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

        //fees
        networkFeeBps = new BN(20);
    });

    describe("test get rates - proxy 1 and new proxy", async() => {
        // check getExpectedRate backward compatible
        // rates from proxy1 and new proxy should be the same
        describe("getExpectedRate (backward compatible) - proxy 1 rates and new proxy rates should be the same", async() => {
            it("verify getExpectedRate (backward compatible) for t2e. same rates from both proxy without fee & hint", async() => {
                let proxyRate = await networkProxy.getExpectedRate(srcToken.address, ethAddress, srcQty);
                let proxyRate1 = await networkProxyV1.getExpectedRate(srcToken.address, ethAddress, srcQty);
                Helper.assertEqual(proxyRate1.expectedRate, proxyRate.expectedRate,
                    "expected rate proxy v1 not equal rate proxy");
                Helper.assertEqual(proxyRate1.slippageRate, proxyRate.worstRate,
                    "slippage rate proxy v1 not equal rate proxy");
            });

            it("verify getExpectedRate (backward compatible) for e2t. same rates from both proxy without fee & hint", async() => {
                let proxyRate = await networkProxy.getExpectedRate(ethAddress, destToken.address, ethSrcQty);
                let proxyRate1 = await networkProxyV1.getExpectedRate(ethAddress, destToken.address, ethSrcQty);
                Helper.assertEqual(proxyRate1.expectedRate, proxyRate.expectedRate,
                    "expected rate proxy v1 not equal rate proxy");
                Helper.assertEqual(proxyRate1.slippageRate, proxyRate.worstRate,
                    "slippage rate proxy v1 not equal rate proxy");
            });

            it("verify getExpectedRate (backward compatible) for t2t. same rates from both proxy without fee & hint", async() => {
                let proxyRate = await networkProxy.getExpectedRate(srcToken.address, destToken.address, srcQty);
                let proxyRate1 = await networkProxyV1.getExpectedRate(srcToken.address, destToken.address, srcQty);
                Helper.assertEqual(proxyRate1.expectedRate, proxyRate.expectedRate,
                    "expected rate proxy v1 not equal rate proxy");
                Helper.assertEqual(proxyRate1.slippageRate, proxyRate.worstRate,
                    "slippage rate proxy v1 not equal rate proxy");
            });
        });

        // without fee, rate should be the same from proxy 1 and new proxy
        // with fee, rate from new proxy should be lower than proxy 1
        describe("test getExpectedRateAfterFee of new proxy and getExpectedRate from proxy1", async() => {
            it("check for e2t, no hint, different fees.", async() => {
                for (let fee = 0; fee <= 100; fee += 50) {
                    let proxyRate = await networkProxy.getExpectedRateAfterFee(ethAddress, destToken.address, ethSrcQty, fee, emptyHint);
                    let proxyRate1 = await networkProxyV1.getExpectedRate(ethAddress, destToken.address, ethSrcQty);
                    if (fee == 0) {
                        // should same rates when fee is 0
                        Helper.assertEqual(proxyRate1.expectedRate, proxyRate,
                            "expected rate proxy v1 not equal rate proxy");
                   } else {
                        // rate from proxy1 should be greater than rate from new proxy with platformFee
                        Helper.assertGreater(proxyRate1.expectedRate, proxyRate,
                            "expected rate proxy v1 not greater than rate proxy with fee");
                    }
                }
            });

            it("check for t2e, no hint, different fees.", async() => {
                for (let fee = 0; fee <= 100; fee+= 50) {
                    let proxyRate = await networkProxy.getExpectedRateAfterFee(srcToken.address, ethAddress, srcQty, fee, emptyHint);
                    let proxyRate1 = await networkProxyV1.getExpectedRate(srcToken.address, ethAddress, srcQty);
                    if (fee == 0) {
                        // should same rates when fee is 0
                        Helper.assertEqual(proxyRate1.expectedRate, proxyRate,
                            "expected rate proxy v1 not equal rate proxy");
                    } else {
                        // rate from proxy1 should be greater than rate from new proxy with platformFee
                        Helper.assertGreater(proxyRate1.expectedRate, proxyRate,
                            "expected rate proxy v1 not greater than rate proxy with fee");
                    }
                }
            });

            it("check for t2t, no hint, different fees.", async() => {
                for (let fee = 0; fee <= 100; fee+= 50) {
                    let proxyRate = await networkProxy.getExpectedRateAfterFee(srcToken.address, destToken.address, srcQty, fee, emptyHint);
                    let proxyRate1 = await networkProxyV1.getExpectedRate(srcToken.address, destToken.address, srcQty);
                    if (fee == 0) {
                        // should same rates when fee is 0
                        Helper.assertApproximate(proxyRate1.expectedRate, proxyRate,
                            "expected rate proxy v1 not equal rate proxy");
                    } else {
                        // rate from proxy1 should be greater than rate from new proxy with platformFee
                        Helper.assertGreater(proxyRate1.expectedRate, proxyRate,
                            "expected rate proxy v1 not greater than rate proxy with fee");
                    }
                }
            });
        });
    });

    describe("test trades from old and new proxies should be both success", async() => {
        for(let i = 0; i < tradeType.length; i++) {
            let type = tradeType[i];
            let fee = 123;

            it("should perform a t2e trade, proxy1 with empty, new proxy with different hints", async() => {
                let hint;
                if (type == PERM_HINTTYPE) {
                    hint = web3.utils.fromAscii("PERM");
                } else {
                    const numResForTest = getNumReservesForType(type);
                    hint = await nwHelper.getHint(rateHelper, matchingEngine, reserveInstances, type, numResForTest, srcToken.address, ethAddress, srcQty);
                }

                // do trade new proxy with hint and fee
                await srcToken.transfer(taker, srcQty);
                await srcToken.approve(networkProxy.address, srcQty, {from: taker});

                let rate = await networkProxy.getExpectedRateAfterFee(srcToken.address, ethAddress, srcQty, fee, hint);

                await networkProxy.tradeWithHintAndFee(srcToken.address, srcQty, ethAddress, taker,
                    maxDestAmt, calcMinRate(rate), platformWallet, fee, hint, {from: taker});

                // do trade old proxy with empty hint
                await srcToken.transfer(taker, srcQty);
                await srcToken.approve(networkProxyV1.address, srcQty, {from: taker});

                rate = await networkProxyV1.getExpectedRate(srcToken.address, ethAddress, srcQty);
                await networkProxyV1.tradeWithHint(srcToken.address, srcQty, ethAddress, taker,
                    maxDestAmt, calcMinRate(rate.expectedRate), platformWallet, emptyHint, {from: taker});
            });

            it("should perform a e2t trade, proxy1 with empty, new proxy with different hints", async() => {
                let hint;
                if (type == PERM_HINTTYPE) {
                    hint = web3.utils.fromAscii("PERM");
                } else {
                    const numResForTest = getNumReservesForType(type);
                    hint = await nwHelper.getHint(rateHelper, matchingEngine, reserveInstances, type, numResForTest, ethAddress, destToken.address, ethSrcQty);
                }

                // do trade new proxy with hint and fee
                let rate = await networkProxy.getExpectedRateAfterFee(ethAddress, destToken.address, ethSrcQty, fee, hint);
                await networkProxy.tradeWithHintAndFee(ethAddress, ethSrcQty, destToken.address, taker,
                    maxDestAmt, calcMinRate(rate), platformWallet, fee, hint, {from: taker, value: ethSrcQty});

                // do trade old proxy with empty hint
                rate = await networkProxyV1.getExpectedRate(ethAddress, destToken.address, ethSrcQty);
                await networkProxyV1.tradeWithHint(ethAddress, ethSrcQty, destToken.address, taker,
                    maxDestAmt, calcMinRate(rate.expectedRate), platformWallet, emptyHint, {from: taker, value: ethSrcQty});
            });

            it("should perform a t2t trade, proxy1 with empty, new proxy with different hints", async() => {
                let hint;
                if (type == PERM_HINTTYPE) {
                    hint = web3.utils.fromAscii("PERM");
                } else {
                    const numResForTest = getNumReservesForType(type);
                    hint = await nwHelper.getHint(rateHelper, matchingEngine, reserveInstances, type, numResForTest, srcToken.address, destToken.address, srcQty);
                }

                // do trade new proxy with hint and fee
                await srcToken.transfer(taker, srcQty);
                await srcToken.approve(networkProxy.address, srcQty, {from: taker});

                let rate = await networkProxy.getExpectedRateAfterFee(srcToken.address, destToken.address, srcQty, fee, hint);
                await networkProxy.tradeWithHintAndFee(srcToken.address, srcQty, destToken.address, taker,
                    maxDestAmt, calcMinRate(rate), platformWallet, fee, hint, {from: taker});

                // do trade old proxy with empty hint
                await srcToken.transfer(taker, srcQty);
                await srcToken.approve(networkProxyV1.address, srcQty, {from: taker});

                rate = await networkProxyV1.getExpectedRate(srcToken.address, destToken.address, srcQty);
                await networkProxyV1.tradeWithHint(srcToken.address, srcQty, destToken.address, taker,
                    maxDestAmt, calcMinRate(rate.expectedRate), platformWallet, emptyHint, {from: taker});
            });
        } // loop trade types
    });
})

function calcMinRate(rate) {
    let minRate = rate.mul(new BN(999)).div(new BN(1000));
    return minRate;
}

// get number of reserves should be used to build hint for different types of trade
function getNumReservesForType(type) {
    if (type == MASK_OUT_HINTTYPE) return 2;
    if (type == MASK_IN_HINTTYPE) return 3;
    if (type == SPLIT_HINTTYPE) return 3;
    return 3;
}
