const TestToken = artifacts.require("Token.sol");
const KyberMatchingEngine = artifacts.require("KyberMatchingEngine.sol");
const MockMatchEngine = artifacts.require("MockMatchEngine.sol");
const KyberStorage = artifacts.require("KyberStorage.sol");
const RateHelper = artifacts.require("KyberRateHelper.sol");
const KyberNetwork = artifacts.require("KyberNetwork.sol");

const Helper = require("../helper.js");
const nwHelper = require("./networkHelper.js");

const BN = web3.utils.BN;
const { expectEvent, expectRevert } = require('@openzeppelin/test-helpers');
const {BPS, precisionUnits, ethDecimals, ethAddress, zeroAddress, emptyHint, zeroBN, MAX_QTY, MAX_RATE} = require("../helper.js");
const {NULL_ID, EMPTY_HINTTYPE, MASK_IN_HINTTYPE, MASK_OUT_HINTTYPE, SPLIT_HINTTYPE, ReserveType}  = require('./networkHelper.js');

//global variables
//////////////////
const negligibleRateDiffBps = new BN(5); //0.05%
const minConversionRate = new BN(0);

let networkFeeArray = [new BN(0), new BN(250), new BN(400)];
let platformFeeArray = [new BN(0), new BN(250, new BN(400))];
let txResult;

let admin;
let operator;
let network;
let matchingEngine;
let storage;
let rateHelper;
let user;

//reserve data
//////////////
let reserveInstances = {};
let reserve;
let numReserves;
let numMaskedReserves;
let reserveRates;
let reserveRatesE2T;
let reserveRatesT2E;

//tokens data
////////////
let srcToken;
let destToken;
let token;
let srcDecimals;
let destDecimals;
let tokenDecimals;

//quantities
////////////
let srcQty;
let ethSrcQty = precisionUnits;
let tokenQty;
let queryQty;

//expected result variables
///////////////////////////
let expectedReserveRate;
let expectedDestAmt;
let expectedRate;
let expectedTradeResult;
let expectedOutput;
let actualResult;

contract('KyberMatchingEngine', function(accounts) {
    before("one time global init", async() => {
        //init accounts
        user = accounts[0];
        admin = accounts[1];
        operator = accounts[2];
        network = accounts[3];
    });

    describe("test onlyAdmin and onlyNetwork permissions", async() => {
        before("deploy matchingEngine and storage instance, 1 mock reserve and 1 mock token", async() => {
            matchingEngine = await KyberMatchingEngine.new(admin);
            storage = await nwHelper.setupStorage(admin);
            await storage.setNetworkContract(network, {from:admin});
            token = await TestToken.new("test", "tst", 18);

            rateHelper = await RateHelper.new(admin);
            await rateHelper.setContracts(accounts[9], storage.address, {from: admin});

            //init 1 mock reserve
            let result = await nwHelper.setupReserves(network, [], 1,0,0,0, accounts, admin, operator);
            reserveInstances = result.reserveInstances;
            numReserves = result.numAddedReserves * 1;
            for (const value of Object.values(reserveInstances)) {
                reserve = value;
            }
        });

        it("should not have unauthorized personnel set network contract", async() => {
            await expectRevert(
                matchingEngine.setNetworkContract(network, {from: user}),
                "only admin"
            );

            await expectRevert(
                matchingEngine.setNetworkContract(network, {from: operator}),
                "only admin"
            );
        });

        it("should have admin set network contract", async() => {
            await matchingEngine.setNetworkContract(network, {from: admin});
            let result = await matchingEngine.kyberNetwork();
            Helper.assertEqual(network, result, "network not set by admin");
        });

        it("should not have unauthorized personnel set negligble rate diff bps", async() => {
            await expectRevert(
                matchingEngine.setNegligibleRateDiffBps(negligibleRateDiffBps, {from: user}),
                "only kyberNetwork"
            );

            await expectRevert(
                matchingEngine.setNegligibleRateDiffBps(negligibleRateDiffBps, {from: operator}),
                "only kyberNetwork"
            );

            await expectRevert(
                matchingEngine.setNegligibleRateDiffBps(negligibleRateDiffBps, {from: admin}),
                "only kyberNetwork"
            );
        });

        it("should have network set negligble rate diff bps", async() => {
            await matchingEngine.setNegligibleRateDiffBps(negligibleRateDiffBps, {from: network});
            let result = await matchingEngine.getNegligibleRateDiffBps();
            Helper.assertEqual(negligibleRateDiffBps, result, "negligbleRateDiffInBps not set by network");
        });

        it("should get negligble rate diff bps", async() => {
            let result = await matchingEngine.getNegligibleRateDiffBps();
            Helper.assertEqual(negligibleRateDiffBps, result, "negligbleRateDiffInBps not equal");
        });

        it("should not have unauthorized personnel set storage", async() => {
            await expectRevert(
                matchingEngine.setKyberStorage(storage.address, {from: user}),
                "only admin"
            );

            await expectRevert(
                matchingEngine.setKyberStorage(storage.address, {from: operator}),
                "only admin"
            );

            await expectRevert(
                matchingEngine.setKyberStorage(storage.address, {from: network}),
                "only admin"
            );
        });

        it("should have network set storage contract", async() => {
            await matchingEngine.setKyberStorage(storage.address, {from: admin});
            let result = await matchingEngine.kyberStorage();
            Helper.assertEqual(storage.address, result, "storage not set by admin");
        });

    });

    describe("test contract event", async() => {
        before("deploy and setup matchingEngine instance", async() => {
            matchingEngine = await KyberMatchingEngine.new(admin);
        });

        it("shoud test set network event", async() => {
            txResult = await matchingEngine.setNetworkContract(network, {from: admin});
            expectEvent(txResult, "KyberNetworkUpdated", {
                newKyberNetwork: network
            });
        });

        it("should test set storage event", async() => {
            await matchingEngine.setNetworkContract(network, {from: admin});
            txResult = await matchingEngine.setKyberStorage(storage.address, {from: admin});
            expectEvent(txResult, "KyberStorageUpdated", {
                newKyberStorage: storage.address
            });
        });
    });

    describe("test setting contracts and params", async() => {
        before("deploy and setup matchingEngine instance", async() => {
            matchingEngine = await KyberMatchingEngine.new(admin);
        });

        it("should revert if negligbleRateDiffBps > BPS", async() => {
            await matchingEngine.setNetworkContract(network, {from: admin});
            await expectRevert(
                matchingEngine.setNegligibleRateDiffBps(BPS.add(new BN(1)), {from: network}),
                "rateDiffBps exceed BPS"
            );
        });

        it("should revert setting zero address for network", async() => {
            await expectRevert(
                matchingEngine.setNetworkContract(zeroAddress, {from: admin}),
                "kyberNetwork 0"
            );
        });
    });

    describe("test RateHelper getRatesForToken", async() => {
        before("setup matchingEngine instance and 2 tokens", async() => {
            matchingEngine = await KyberMatchingEngine.new(admin);
            storage = await nwHelper.setupStorage(admin);
            network = await KyberNetwork.new(admin, storage.address);
            await matchingEngine.setNetworkContract(network.address, {from: admin});
            await matchingEngine.setKyberStorage(storage.address, {from: admin});
            await storage.addOperator(operator, {from: admin});
            await storage.setFeeAccountedPerReserveType(true, true, true, false, true, true, {from: admin});
            await storage.setEntitledRebatePerReserveType(true, false, true, false, true, true, {from: admin});
            await storage.setNetworkContract(network.address, {from: admin});
            rateHelper = await RateHelper.new(admin);
            await rateHelper.setContracts(accounts[9], storage.address, {from: admin});

            //init 2 tokens
            srcDecimals = new BN(8);
            destDecimals = new BN(12);
            srcToken = await TestToken.new("srcToken", "SRC", srcDecimals);
            destToken = await TestToken.new("destToken", "DEST", destDecimals);
        });

        describe("3 mock reserves (all fee accounted)", async() => {
            before("setup reserves", async() => {
                //init 3 mock reserves
                let result = await nwHelper.setupReserves(network, [srcToken, destToken], 3,0,0,0, accounts, admin, operator);
                reserveInstances = result.reserveInstances;
                numReserves = result.numAddedReserves * 1;

                await storage.setFeeAccountedPerReserveType(true, true, true, true, true, true, {from: admin});
                await storage.setEntitledRebatePerReserveType(true, false, true, false, true, true, {from: admin});

                //add reserves, list token pairs
                for (reserve of Object.values(reserveInstances)) {
                    await storage.addReserve(reserve.address, reserve.reserveId, reserve.onChainType, reserve.rebateWallet, {from: operator});
                    await storage.listPairForReserve(reserve.reserveId, srcToken.address, true, true, true, {from: operator});
                    await storage.listPairForReserve(reserve.reserveId, destToken.address, true, true, true, {from: operator});
                };
            });

            after("unlist and remove reserves", async() => {
                for (reserve of Object.values(reserveInstances)) {
                    await storage.listPairForReserve(reserve.reserveId, srcToken.address, true, true, false, {from: operator});
                    await storage.listPairForReserve(reserve.reserveId, destToken.address, true, true, false, {from: operator});
                    await storage.removeReserve(reserve.reserveId, new BN(0), {from: operator});
                };
            });

            beforeEach("use srcToken as token", async() => {
                token = srcToken;
                tokenDecimals = await token.decimals();
                // 1000 tokens
                tokenQty = new BN(1000).mul(new BN(10).pow(tokenDecimals));
            });

            it("should get rates for token (different network fee amounts)", async() => {
                for (networkFeeBps of networkFeeArray) {
                    actualResult = await rateHelper.getRatesForTokenWithCustomFee(token.address, ethSrcQty, tokenQty, networkFeeBps);
                    for (let i=0; i < actualResult.buyReserves.length; i++) {
                        reserveId = actualResult.buyReserves[i];
                        reserve = reserveInstances[reserveId];
                        Helper.assertEqual(reserve.reserveId, reserveId, "reserve not found");

                        queryQty = nwHelper.minusNetworkFees(ethSrcQty, reserve.onChainType, false, networkFeeBps);
                        expectedReserveRate = await reserve.instance.getConversionRate(ethAddress, token.address, queryQty, 0);
                        expectedDestAmt = Helper.calcDstQty(queryQty, ethDecimals, tokenDecimals, expectedReserveRate);
                        expectedRate = Helper.calcRateFromQty(ethSrcQty, expectedDestAmt, ethDecimals, tokenDecimals);
                        Helper.assertEqual(expectedRate, actualResult.buyRates[i], "rate not equal");
                    }

                    for (let i=0; i < actualResult.sellReserves.length; i++) {
                        reserveId = actualResult.sellReserves[i];
                        reserve = reserveInstances[reserveId];
                        Helper.assertEqual(reserve.reserveId, reserveId, "reserve not found");

                        expectedReserveRate = await reserve.instance.getConversionRate(token.address, ethAddress, tokenQty, 0);
                        expectedDestAmt = Helper.calcDstQty(tokenQty, tokenDecimals, ethDecimals, expectedReserveRate);
                        expectedDestAmt = nwHelper.minusNetworkFees(expectedDestAmt, false, reserve.onChainType, networkFeeBps);
                        expectedRate = Helper.calcRateFromQty(tokenQty, expectedDestAmt, tokenDecimals, ethDecimals);
                        Helper.assertEqual(expectedRate, actualResult.sellRates[i], "rate not equal");
                    }
                }
            });
        });

        describe("3 mock reserves (all feeless and not entitled rebates)", async() => {
            before("setup reserves", async() => {
                //init 3 mock reserves
                let result = await nwHelper.setupReserves(network, [srcToken, destToken], 3,0,0,0, accounts, admin, operator);
                reserveInstances = result.reserveInstances;
                numReserves = result.numAddedReserves * 1;

                //set fee accounted to false
                await storage.setFeeAccountedPerReserveType(false, false, false, false, false, false, {from: admin});
                await storage.setEntitledRebatePerReserveType(false, false, false, false, false, false, {from: admin});

                //add reserves, list token pairs
                for (reserve of Object.values(reserveInstances)) {
                    await storage.addReserve(reserve.address, reserve.reserveId, reserve.onChainType, reserve.rebateWallet, {from: operator});
                    await storage.listPairForReserve(reserve.reserveId, srcToken.address, true, true, true, {from: operator});
                    await storage.listPairForReserve(reserve.reserveId, destToken.address, true, true, true, {from: operator});
                };
            });

            after("unlist and remove reserves", async() => {
                for (reserve of Object.values(reserveInstances)) {
                    await storage.listPairForReserve(reserve.reserveId, srcToken.address, true, true, false, {from: operator});
                    await storage.listPairForReserve(reserve.reserveId, destToken.address, true, true, false, {from: operator});
                    await storage.removeReserve(reserve.reserveId, new BN(0), {from: operator});
                };
            });

            beforeEach("use srcToken as token", async() => {
                token = srcToken;
                tokenDecimals = await token.decimals();
                // 1000 tokens
                tokenQty = new BN(1000).mul(new BN(10).pow(tokenDecimals));
            });

            it("should get rates for token (different network fee amounts)", async() => {
                for (networkFeeBps of networkFeeArray) {
                    actualResult = await rateHelper.getRatesForTokenWithCustomFee(token.address, ethSrcQty, tokenQty, networkFeeBps);
                    for (let i=0; i < actualResult.buyReserves.length; i++) {
                        reserveId = actualResult.buyReserves[i];
                        reserve = reserveInstances[reserveId];
                        Helper.assertEqual(reserve.reserveId, reserveId, "reserve not found");

                        queryQty = nwHelper.minusNetworkFees(ethSrcQty, false, false, networkFeeBps);
                        expectedReserveRate = await reserve.instance.getConversionRate(ethAddress, token.address, queryQty, 0);
                        expectedDestAmt = Helper.calcDstQty(queryQty, ethDecimals, tokenDecimals, expectedReserveRate);
                        expectedRate = Helper.calcRateFromQty(ethSrcQty, expectedDestAmt, ethDecimals, tokenDecimals);
                        Helper.assertEqual(expectedRate, actualResult.buyRates[i], "rate not equal");
                    }

                    for (let i=0; i < actualResult.sellReserves.length; i++) {
                        reserveId = actualResult.sellReserves[i];
                        reserve = reserveInstances[reserveId];
                        Helper.assertEqual(reserve.reserveId, reserveId, "reserve not found");

                        expectedReserveRate = await reserve.instance.getConversionRate(token.address, ethAddress, tokenQty, 0);
                        expectedDestAmt = Helper.calcDstQty(tokenQty, tokenDecimals, ethDecimals, expectedReserveRate);
                        expectedDestAmt = nwHelper.minusNetworkFees(expectedDestAmt, false, false, networkFeeBps);
                        expectedRate = Helper.calcRateFromQty(tokenQty, expectedDestAmt, tokenDecimals, ethDecimals);
                        Helper.assertEqual(expectedRate, actualResult.sellRates[i], "rate not equal");
                    }
                }
            });
        });

        describe("3 mock reserves (all zero rates)", async() => {
            before("setup reserves", async() => {
                //init 3 mock reserves
                let result = await nwHelper.setupReserves(network, [srcToken, destToken], 3,0,0,0, accounts, admin, operator);
                reserveInstances = result.reserveInstances;
                numReserves = result.numAddedReserves * 1;

                await storage.setFeeAccountedPerReserveType(true, true, true, true, true, true, {from: admin});
                await storage.setEntitledRebatePerReserveType(true, true, true, true, true, true, {from: admin});

                //set zero rates
                for ([key, reserve] of Object.entries(reserveInstances)) {
                    await reserve.instance.setRate(srcToken.address, zeroBN, zeroBN);
                    await reserve.instance.setRate(destToken.address, zeroBN, zeroBN);
                }

                //add reserves, list token pairs
                for (reserve of Object.values(reserveInstances)) {
                    await storage.addReserve(reserve.address, reserve.reserveId, reserve.onChainType, reserve.rebateWallet, {from: operator});
                    await storage.listPairForReserve(reserve.reserveId, srcToken.address, true, true, true, {from: operator});
                    await storage.listPairForReserve(reserve.reserveId, destToken.address, true, true, true, {from: operator});
                };
            });

            after("unlist and remove reserves", async() => {
                for (reserve of Object.values(reserveInstances)) {
                    await storage.listPairForReserve(reserve.reserveId, srcToken.address, true, true, false, {from: operator});
                    await storage.listPairForReserve(reserve.reserveId, destToken.address, true, true, false, {from: operator});
                    await storage.removeReserve(reserve.reserveId, new BN(0), {from: operator});
                };
            });

            beforeEach("use srcToken as token", async() => {
                token = srcToken;
                tokenDecimals = await token.decimals();
                // 1000 tokens
                tokenQty = new BN(1000).mul(new BN(10).pow(tokenDecimals));
            });

            it("should get rates for token (different network fee amounts)", async() => {
                for (networkFeeBps of networkFeeArray) {
                    actualResult = await rateHelper.getRatesForTokenWithCustomFee(token.address, ethSrcQty, tokenQty, networkFeeBps);
                    for (let i=0; i < actualResult.buyReserves.length; i++) {
                        reserveId = actualResult.buyReserves[i];
                        reserve = reserveInstances[reserveId];
                        Helper.assertEqual(reserve.reserveId, reserveId, "reserve not found");
                        Helper.assertEqual(zeroBN, actualResult.buyRates[i], "rate not zero");
                    }

                    for (let i=0; i < actualResult.sellReserves.length; i++) {
                        reserveId = actualResult.sellReserves[i];
                        reserve = reserveInstances[reserveId];
                        Helper.assertEqual(reserve.reserveId, reserveId, "reserve not found");
                        Helper.assertEqual(zeroBN, actualResult.sellRates[i], "rate not zero");
                    }
                }
            });
        });
    });

    describe("test reserve matching", async() => {
        before("setup matchingEngine instance", async() => {
            matchingEngine = await MockMatchEngine.new(admin);
            storage = await nwHelper.setupStorage(admin);
            network = await KyberNetwork.new(admin, storage.address);
            await matchingEngine.setNetworkContract(network.address, {from: admin});
            await matchingEngine.setKyberStorage(storage.address, {from: admin});
            await storage.addOperator(operator, {from: admin});
            await storage.setFeeAccountedPerReserveType(true, true, true, false, true, true, {from: admin});
            await storage.setEntitledRebatePerReserveType(true, false, true, false, true, true, {from: admin});
            await storage.setNetworkContract(network.address, {from: admin});

            //init 2 tokens
            srcDecimals = new BN(8);
            destDecimals = new BN(12);
            srcToken = await TestToken.new("srcToken", "SRC", srcDecimals);
            destToken = await TestToken.new("destToken", "DEST", destDecimals);
        });

        describe("4 mock reserves, all feeAccounting and entitledRebate by default", async() => {
            before("setup reserves", async() => {
                //init 3 mock reserves
                let result = await nwHelper.setupReserves(network, [srcToken, destToken], 3,0,0,0, accounts, admin, operator);
                reserveInstances = result.reserveInstances;
                numReserves = result.numAddedReserves * 1;

                await storage.setFeeAccountedPerReserveType(true, true, true, true, true, true, {from: admin});
                await storage.setEntitledRebatePerReserveType(true, true, true, true, true, true, {from: admin});

                //add reserves, list token pairs
                for (reserve of Object.values(reserveInstances)) {
                    await storage.addReserve(reserve.address, reserve.reserveId, reserve.onChainType, reserve.rebateWallet, {from: operator});
                };
            });

            beforeEach("reset data variables", async() => {
                let data = {
                    t2eIds: [],
                    t2eAddresses: [],
                    t2eRates: [],
                    e2tIds: [],
                    e2tAddresses: [],
                    e2tRates: [],
                };
            });

            after("remove reserves", async() => {
                for (reserve of Object.values(reserveInstances)) {
                    await storage.removeReserve(reserve.reserveId, new BN(0), {from: operator});
                };
            });

            it("should get the reserve indexes for T2E", async() => {
            });
        });
    });

    describe("test convertReserveIdToAddress, convertAddressToReserveId, get reserve details", async() => {
        before("setup matchingEngine instance", async() => {
            matchingEngine = await MockMatchEngine.new(admin);
            storage = await nwHelper.setupStorage(admin);
            network = await KyberNetwork.new(admin, storage.address);
            await matchingEngine.setNetworkContract(network.address, {from: admin});
            await matchingEngine.setKyberStorage(storage.address, {from: admin});
            await storage.addOperator(operator, {from: admin});
            await storage.setNetworkContract(network.address, {from: admin});
            await storage.setFeeAccountedPerReserveType(true, true, true, false, true, true, {from: admin});
            await storage.setEntitledRebatePerReserveType(true, false, true, false, true, true, {from: admin});

            //init 2 tokens
            srcDecimals = new BN(8);
            destDecimals = new BN(12);
            srcToken = await TestToken.new("srcToken", "SRC", srcDecimals);
            destToken = await TestToken.new("destToken", "DEST", destDecimals);
        });

        describe("3 mock reserves (all fee accounted and entitled rebates)", async() => {
            before("setup reserves", async() => {
                //init 3 mock reserves
                let result = await nwHelper.setupReserves(network, [srcToken, destToken], 3,0,0,0, accounts, admin, operator);
                reserveInstances = result.reserveInstances;
                numReserves = result.numAddedReserves * 1;

                await storage.setFeeAccountedPerReserveType(true, true, true, true, true, true, {from: admin});
                await storage.setEntitledRebatePerReserveType(true, true, true, true, true, true, {from: admin});

                //add reserves, list token pairs
                for (reserve of Object.values(reserveInstances)) {
                    await storage.addReserve(reserve.address, reserve.reserveId, reserve.onChainType, reserve.rebateWallet, {from: operator});
                };
            });

            it("should get address from reserveId", async() => {
                for (reserve of Object.values(reserveInstances)) {
                    reserveAddress = await matchingEngine.reserveIdToAddress(reserve.reserveId);
                    Helper.assertEqual(reserve.address, reserveAddress, "reserve not found");
                }
            });

            it("should get reserve details by address", async() => {
                for (reserve of Object.values(reserveInstances)) {
                    res = await storage.getReserveDetailsByAddress(reserve.address);
                    Helper.assertEqual(reserve.reserveId, res.reserveId);
                    Helper.assertEqual(reserve.onChainType, res.resType);
                    Helper.assertEqual(true, res.isFeeAccountedFlag);
                    Helper.assertEqual(true, res.isEntitledRebateFlag);
                }
            });

            after("remove reserves", async() => {
                for (reserve of Object.values(reserveInstances)) {
                    await storage.removeReserve(reserve.reserveId, new BN(0), {from: operator});
                };
            });
        });
    });
});

async function fetchReservesRatesFromRateHelper(matchingEngineInstance, rateHelperInstance, reserveInstances, tokenAddress, qty, networkFeeBps, isTokenToEth) {
    let reservesArray = [];
    let result;
    let reserves;
    let reserve;
    let rates;

    //sell
    if (isTokenToEth) {
        result = await rateHelperInstance.getRatesForTokenWithCustomFee(tokenAddress, 0, qty, networkFeeBps);
        reserves = result.sellReserves;
        rates = result.sellRates;
    //buy
    } else {
        result = await rateHelperInstance.getRatesForTokenWithCustomFee(tokenAddress, qty, 0, networkFeeBps);
        reserves = result.buyReserves;
        rates = result.buyRates;
    }
    for (i=0; i<reserves.length; i++) {
        reserveAddress = reserves[i];
        reserve = Object.assign({}, reserveInstances[reserveAddress]);
        reserve.rate = rates[i];
        reserve.isFeeAccountedFlags = (await matchingEngineInstance.getReserveDetails(reserveAddress)).isFeeAccountedFlags;
        reservesArray.push(reserve);
    }
    return reservesArray;
}

async function getHintedReserves(
    matchingEngine, reserveInstances,
    t2eHintType, t2eNumReserves, t2eSplits, t2eQty,
    e2tHintType, e2tNumReserves, e2tSplits, e2tQty,
    srcAdd, destAdd)
{
    let reserveCandidates;
    let res = {
        'reservesT2E': {},
        'reservesE2T': {},
        'hint': emptyHint
    };
    t2eHintType = (t2eHintType == EMPTY_HINTTYPE) ? emptyHint : t2eHintType;
    e2tHintType = (e2tHintType == EMPTY_HINTTYPE) ? emptyHint : e2tHintType;

    if(srcAdd != ethAddress) {
        reserveCandidates = await fetchReservesRatesFromRateHelper(matchingEngine, rateHelper, reserveInstances, srcAdd, t2eQty, 0, true);
        res.reservesT2E = nwHelper.applyHintToReserves(t2eHintType, reserveCandidates, t2eNumReserves, t2eSplits);
        if(destAdd == ethAddress) {
            res.hint = await matchingEngine.buildTokenToEthHint(
                srcAdd,
                res.reservesT2E.tradeType,
                res.reservesT2E.reservesForHint,
                res.reservesT2E.splits
            );
            return res;
        }
    }

    if(destAdd != ethAddress) {
        reserveCandidates = await fetchReservesRatesFromRateHelper(matchingEngine, rateHelper, reserveInstances, destAdd, e2tQty, 0, false);
        res.reservesE2T = nwHelper.applyHintToReserves(e2tHintType, reserveCandidates, e2tNumReserves, e2tSplits);
        if(srcAdd == ethAddress) {
            res.hint = await matchingEngine.buildEthToTokenHint(
                destAdd,
                res.reservesE2T.tradeType,
                res.reservesE2T.reservesForHint,
                res.reservesE2T.splits
            );
            return res;
        }
    }

    res.hint = await matchingEngine.buildTokenToTokenHint(
        srcAdd, res.reservesT2E.tradeType, res.reservesT2E.reservesForHint, res.reservesT2E.splits,
        destAdd, res.reservesE2T.tradeType, res.reservesE2T.reservesForHint, res.reservesE2T.splits
    );

    return res;
}

function getTradeResult(
    srcDecimals, t2eReserves, t2eRates, t2eSplits,
    destDecimals, e2tReserves, e2tRates, e2tSplits,
    srcQty, networkFeeBps, platformFeeBps
) {
    let result = {
        t2eNumReserves: (t2eSplits.length > 0) ? t2eReserves.length : new BN(1),
        tradeWei: zeroBN,
        numFeeAccountedReserves: zeroBN,
        feeAccountedReservesBps: zeroBN,
        destAmountNoFee: zeroBN,
        actualDestAmount: zeroBN,
        destAmountWithNetworkFee: zeroBN
    }

    let amountSoFar = zeroBN;
    let reserve;
    let splitAmount;
    let destAmt;
    let feeAccountedBps;
    let actualTradeWei;

    if (t2eSplits.length > 0) {
        for (let i=0; i<t2eReserves.length; i++) {
            reserve = t2eReserves[i];
            splitAmount = (i == t2eReserves.length - 1) ? (srcQty.sub(amountSoFar)) : t2eSplits[i].mul(srcQty).div(BPS);
            if (t2eRates[i].isZero()) {
                result.tradeWei = zeroBN;
                result.numFeeAccountedReserves = zeroBN;
                result.feeAccountedReservesBps = zeroBN;
                return result;
            }
            destAmt = Helper.calcDstQty(splitAmount, srcDecimals, ethDecimals, t2eRates[i]);
            result.tradeWei = result.tradeWei.add(destAmt);
            amountSoFar = amountSoFar.add(splitAmount);
            if (reserve.isFeeAccountedFlags) {
                result.feeAccountedReservesBps = result.feeAccountedReservesBps.add(t2eSplits[i]);
                result.numFeeAccountedReserves = result.numFeeAccountedReserves.add(new BN(1));
            }
        }
    } else if (t2eReserves.length > 0) {
        reserve = t2eReserves[0];
        result.tradeWei = Helper.calcDstQty(srcQty, srcDecimals, ethDecimals, t2eRates[0]);
        if (reserve.isFeeAccountedFlags) {
            result.feeAccountedReservesBps = result.feeAccountedReservesBps.add(BPS);
            result.numFeeAccountedReserves = result.numFeeAccountedReserves.add(new BN(1));
        }
    } else {
        result.tradeWei = srcQty;
    }

    //add e2t reserve splits (doesn't matter if split or not, cos we already know best reserve)
    for (let i=0; i<e2tReserves.length; i++) {
        reserve = e2tReserves[i];
        if (reserve.isFeeAccountedFlags) {
            feeAccountedBps = (e2tSplits[i] == undefined) ? BPS : e2tSplits[i];
            result.feeAccountedReservesBps = result.feeAccountedReservesBps.add(feeAccountedBps);
            result.numFeeAccountedReserves = result.numFeeAccountedReserves.add(new BN(1));
        }
    }

    //calculate fees
    let networkFeeWei = result.tradeWei.mul(networkFeeBps).div(BPS).mul(result.feeAccountedReservesBps).div(BPS);
    let platformFeeWei = result.tradeWei.mul(platformFeeBps).div(BPS);
    actualTradeWei = result.tradeWei.sub(networkFeeWei).sub(platformFeeWei);

    //calculate dest amounts
    amountSoFar = zeroBN;
    if (e2tSplits.length > 0) {
        for (let i=0; i<e2tReserves.length; i++) {
            reserve = e2tReserves[i];
            splitAmount = (i == e2tReserves.length - 1) ? (actualTradeWei.sub(amountSoFar)) : e2tSplits[i].mul(actualTradeWei).div(BPS);
            if (e2tRates[i].isZero()) {
                result.actualDestAmount = zeroBN;
                return;
            }
            destAmt = Helper.calcDstQty(splitAmount, ethDecimals, destDecimals, e2tRates[i]);
            result.actualDestAmount = result.actualDestAmount.add(destAmt);
            amountSoFar = amountSoFar.add(splitAmount);
        }
        rate = actualTradeWei.eq(zeroBN) ? zeroBN : Helper.calcRateFromQty(actualTradeWei, result.actualDestAmount, ethDecimals, destDecimals);
    } else if (e2tReserves.length > 0) {
        reserve = e2tReserves[0];
        rate = e2tRates[0];
        result.actualDestAmount = Helper.calcDstQty(actualTradeWei, ethDecimals, destDecimals, rate);
    } else {
        rate = precisionUnits;
        result.actualDestAmount = Helper.calcDstQty(actualTradeWei, ethDecimals, destDecimals, rate);
    }

    //calculate dest amount with fees
    result.destAmountNoFee = Helper.calcDstQty(result.tradeWei, ethDecimals, destDecimals, rate);
    result.destAmountWithNetworkFee = Helper.calcDstQty(result.tradeWei.sub(networkFeeWei), ethDecimals, destDecimals, rate);
    return result;
}

function getExpectedOutput(sellReserves, sellSplits, buyReserves, buySplits) {
    let result = {
        'addresses': [],
        'ids': [],
        'rates': [],
        'splitValuesBps': [],
        'isFeeAccountedFlags': []
    }

    //tokenToEth
    if (buyReserves.length == 0) {
        result.addresses = sellReserves.map(reserve => reserve.address);
        result.addresses = result.addresses.concat(zeroAddress);
        result.ids = sellReserves.map(reserve => reserve.reserveId);
        result.ids = result.ids.concat(NULL_ID);
        result.rates = (sellSplits.length > 1) ?
            result.rates.concat(sellReserves.map(reserve => reserve.rate)) :
            result.rates.concat(sellReserves.map(reserve => reserve.rateNoFee));
        result.rates = result.rates.concat(precisionUnits);
        result.splitValuesBps = sellSplits.concat(BPS);
        result.isFeeAccountedFlags = sellReserves.map(reserve => reserve.isFeeAccountedFlags);
        result.isFeeAccountedFlags = result.isFeeAccountedFlags.concat(false);
    //ethToToken
    } else if (sellReserves.length == 0) {
        result.addresses = [zeroAddress];
        result.addresses = result.addresses.concat(buyReserves.map(reserve => reserve.address));
        result.ids = [NULL_ID];
        result.ids = result.ids.concat(buyReserves.map(reserve => reserve.reserveId));
        result.rates = [precisionUnits];
        result.rates = (buySplits.length > 1) ?
            result.rates.concat(buyReserves.map(reserve => reserve.rate)) :
            result.rates.concat(buyReserves.map(reserve => reserve.rateNoFee));
        result.splitValuesBps = [BPS];
        result.splitValuesBps = result.splitValuesBps.concat(buySplits);
        result.isFeeAccountedFlags = [false];
        result.isFeeAccountedFlags = result.isFeeAccountedFlags.concat(buyReserves.map(reserve => reserve.isFeeAccountedFlags));
    //tokenToToken
    } else {
        result.addresses = sellReserves.map(reserve => reserve.address);
        result.addresses = result.addresses.concat(buyReserves.map(reserve => reserve.address));
        result.ids = sellReserves.map(reserve => reserve.reserveId);
        result.ids = result.ids.concat(buyReserves.map(reserve => reserve.reserveId));
        result.rates = (sellSplits.length > 1) ?
            result.rates.concat(sellReserves.map(reserve => reserve.rate)) :
            result.rates.concat(sellReserves.map(reserve => reserve.rateNoFee));
        result.rates = (buySplits.length > 1) ?
            result.rates.concat(buyReserves.map(reserve => reserve.rate)) :
            result.rates.concat(buyReserves.map(reserve => reserve.rateNoFee));
        result.splitValuesBps = sellSplits;
        result.splitValuesBps = result.splitValuesBps.concat(buySplits);
        result.isFeeAccountedFlags = sellReserves.map(reserve => reserve.isFeeAccountedFlags);
        result.isFeeAccountedFlags = result.isFeeAccountedFlags.concat(buyReserves.map(reserve => reserve.isFeeAccountedFlags));
    }
    return result;
}

function compareResults(expectedTradeResult, expectedOutput, actualResult) {
    //compare expectedTradeResult
    Helper.assertEqual(expectedTradeResult.t2eNumReserves, actualResult.results[0], "t2eNumReserves not equal");
    Helper.assertEqual(expectedTradeResult.tradeWei, actualResult.results[1], "tradeWei not equal");
    Helper.assertEqual(expectedTradeResult.numFeeAccountedReserves, actualResult.results[2], "numFeeAccountedReserves not equal");
    Helper.assertEqual(expectedTradeResult.feeAccountedReservesBps, actualResult.results[3], "feeAccountedReservesBps not equal");
    Helper.assertEqual(expectedTradeResult.destAmountNoFee, actualResult.results[4], "destAmountNoFee not equal");
    Helper.assertEqual(expectedTradeResult.destAmountWithNetworkFee, actualResult.results[5], "actualDestAmount not equal");
    Helper.assertEqual(expectedTradeResult.actualDestAmount, actualResult.results[6], "destAmountWithNetworkFee not equal");

    let expected;
    let actual;

    //compare expectedReserves
    for (let i=0; i<actualResult.reserveAddresses.length; i++) {
        expected = expectedOutput.addresses[i];
        actual = actualResult.reserveAddresses[i];
        Helper.assertEqual(expected, actual, "reserve address not the same");
    }

    //compare expectedIds
    for (let i=0; i<actualResult.ids.length; i++) {
        expected = expectedOutput.ids[i];
        actual = actualResult.ids[i];
        Helper.assertEqual(expected, actual, "reserve id not the same");
    }

    //compare expectedRates
    for (let i=0; i<actualResult.rates.length; i++) {
        expected = expectedOutput.rates[i];
        actual = actualResult.rates[i];
        Helper.assertEqual(expected, actual, "reserve rate not the same");
    }

    //compare expectedSplitValuesBps
    for (let i=0; i<actualResult.splitValuesBps.length; i++) {
        expected = expectedOutput.splitValuesBps[i];
        actual = actualResult.splitValuesBps[i];
        Helper.assertEqual(expected, actual, "reserve splitValuesBps not the same");
    }

    //compare expectedFeeAccounted
    for (let i=0; i<actualResult.isFeeAccountedFlags.length; i++) {
        expected = expectedOutput.isFeeAccountedFlags[i];
        actual = actualResult.isFeeAccountedFlags[i];
        Helper.assertEqual(expected, actual, "reserve fee accounted not the same");
    }
}

async function setReserveRates(rateSetting) {
    if (rateSetting == 'low') {
        let rate = new BN(1);
        for (reserve of Object.values(reserveInstances)) {
            await reserve.instance.setRate(srcToken.address, rate, rate);
            await reserve.instance.setRate(destToken.address, rate, rate);
        };
    } else if (rateSetting == 'max') {
        for (reserve of Object.values(reserveInstances)) {
            await reserve.instance.setRate(srcToken.address, MAX_RATE, MAX_RATE);
            await reserve.instance.setRate(destToken.address, MAX_RATE, MAX_RATE);
        };
    } else if (rateSetting == 'lowT2EhighE2T') {
        for (reserve of Object.values(reserveInstances)) {
            await reserve.instance.setRate(srcToken.address, MAX_RATE, new BN(1));
            await reserve.instance.setRate(destToken.address, MAX_RATE, new BN(1));
        };
    } else if (rateSetting == 'highT2ElowE2T') {
        for (reserve of Object.values(reserveInstances)) {
            await reserve.instance.setRate(srcToken.address, new BN(1), MAX_RATE);
            await reserve.instance.setRate(destToken.address, new BN(1), MAX_RATE);
        };
    }
}

function assertZeroAmts(tradeResult) {
    Helper.assertEqual(tradeResult.results[4], zeroBN, "destAmountNoFee not zero");
    Helper.assertEqual(tradeResult.results[5], zeroBN, "destAmountWithNetworkFee not zero");
    Helper.assertEqual(tradeResult.results[6], zeroBN, "actualDestAmount not zero");
}

function printCalcRatesAmtsResult(tradeResult) {
    console.log(`t2eNumReserves: ${tradeResult[0].toString()}`);
    console.log(`tradeWei: ${tradeResult[1].toString()} (${tradeResult[1].div(precisionUnits)} ETH)`);
    console.log(`numFeeAccountedReserves: ${tradeResult[2].toString()}`);
    console.log(`feeAccountedReservesBps: ${tradeResult[3].toString()}`);
    console.log(`destAmountNoFee: ${tradeResult[4].toString()} (${tradeResult[4].div(precisionUnits)} ETH)`);
    console.log(`destAmountWithNetworkFee: ${tradeResult[5].toString()} (${tradeResult[5].div(precisionUnits)} ETH)`);
    console.log(`actualDestAmount: ${tradeResult[6].toString()} (${tradeResult[6].div(precisionUnits)} ETH)`);
}

function log(string) {
    console.log(string);
}

function encodeHint(tradeType, ids, splits) {
    return web3.eth.abi.encodeParameters(['uint', 'bytes8[]', 'uint[]'], [tradeType, ids, splits]);
}

function encodeT2THint(tradeType, ids, splits) {
    return web3.eth.abi.encodeParameters(
        ['uint', 'bytes8[]', 'uint[]', 'uint', 'bytes8[]', 'uint[]'],
        [tradeType, ids, splits, tradeType, ids, splits]
    );
}
