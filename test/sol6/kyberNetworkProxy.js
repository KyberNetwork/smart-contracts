const TestToken = artifacts.require("Token.sol");
const TestTokenNotReturn = artifacts.require("TestTokenNotReturn.sol");
const MockDao = artifacts.require("MockDAO.sol");
const KyberNetwork = artifacts.require("KyberNetwork.sol");
const KyberNetworkProxy = artifacts.require("KyberNetworkProxy.sol");
const FeeHandler = artifacts.require("KyberFeeHandler.sol");
const MatchingEngine = artifacts.require("KyberMatchingEngine.sol");
const KyberStorage = artifacts.require("KyberStorage.sol");
const RateHelper = artifacts.require("KyberRateHelper.sol");
const GenerousNetwork = artifacts.require("GenerousKyberNetwork.sol");
const GenerousNetwork2 = artifacts.require("GenerousKyberNetwork2.sol");
const MaliciousNetwork = artifacts.require("MaliciousKyberNetwork.sol");
const MockTrader = artifacts.require("MockTrader.sol");
const Helper = require("../helper.js");
const nwHelper = require("./networkHelper.js");

const BN = web3.utils.BN;

const { expectEvent, expectRevert } = require('@openzeppelin/test-helpers');
const {BPS, precisionUnits, ethDecimals, ethAddress, zeroAddress, emptyHint, zeroBN} = require("../helper.js");
const {APR_ID, BRIDGE_ID, MOCK_ID, FPR_ID, type_apr, type_fpr, type_MOCK, MASK_IN_HINTTYPE,
    MASK_OUT_HINTTYPE, SPLIT_HINTTYPE, EMPTY_HINTTYPE}  = require('./networkHelper.js');

//global variables
//////////////////
const gasPrice = (new BN(10).pow(new BN(9)).mul(new BN(50)));
const negligibleRateDiffBps = new BN(10); //0.01%
const maxDestAmt = new BN(2).pow(new BN(255));

let networkFeeBps = new BN(20);
let platformFeeArray = [zeroBN, new BN(50), new BN(100)];

let admin;
let alerter;
let networkProxy;
let network;
let storage;
let rateHelper;
let DAO;
let feeHandler;
let matchingEngine;
let operator;
let taker;
let destAddress;
let platformWallet;

//DAO related data
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
let hint;
const tradeTypesArray = [MASK_IN_HINTTYPE, MASK_OUT_HINTTYPE, SPLIT_HINTTYPE, EMPTY_HINTTYPE];
const tradeStr = ["MASK IN", "MASK OUT", "SPLIT", "NO HINT"];

//tokens data
////////////
let numTokens = 5;
let tokens = [];
let tokenDecimals = [];

//rates data
////////////

contract('KyberNetworkProxy', function(accounts) {
    before("one time global init", async() => {
        //init accounts
        operator = accounts[1];
        alerter = accounts[2];
        taker = accounts[3];
        platformWallet = accounts[4];
        admin = accounts[5]; // we don't want admin as account 0.
        hintParser = accounts[6];
        destAddress = accounts[7];

        //DAO related init.
        expiryTimestamp = await Helper.getCurrentBlockTime() + 10;
        DAO = await MockDao.new(rewardInBPS, rebateInBPS, epoch, expiryTimestamp);
        await DAO.setNetworkFeeBps(networkFeeBps);

        //deploy storage and network
        storage = await KyberStorage.new(admin);
        network = await KyberNetwork.new(admin, storage.address);
        await storage.setNetworkContract(network.address, {from: admin});

        // init proxy
        networkProxy = await KyberNetworkProxy.new(admin);

        //init matchingEngine
        matchingEngine = await MatchingEngine.new(admin);
        await matchingEngine.setNetworkContract(network.address, {from: admin});
        await matchingEngine.setKyberStorage(storage.address, {from: admin});
        await storage.setFeeAccountedPerReserveType(true, true, true, false, true, true, {from: admin});
        await storage.setEntitledRebatePerReserveType(true, false, true, false, true, true, {from: admin});

        rateHelper = await RateHelper.new(admin);
        await rateHelper.setContracts(matchingEngine.address, DAO.address, storage.address, {from: admin});

        // setup proxy
        await networkProxy.setKyberNetwork(network.address, {from: admin});
        await networkProxy.setHintHandler(matchingEngine.address, {from: admin});

        //init tokens
        for (let i = 0; i < numTokens; i++) {
            tokenDecimals[i] = new BN(15).add(new BN(i));
            token = await TestToken.new("test" + i, "tst" + i, tokenDecimals[i]);
            tokens[i] = token;
        }

        //init feeHandler
        KNC = await TestToken.new("kyber network crystal", "KNC", 18);
        feeHandler = await FeeHandler.new(DAO.address, networkProxy.address, network.address, KNC.address, burnBlockInterval, DAO.address);

        // init and setup reserves
        let result = await nwHelper.setupReserves(network, tokens, 0, 5, 0, 0, accounts, admin, operator);
        reserveInstances = result.reserveInstances;
        numReserves += result.numAddedReserves * 1;

        //setup network
        ///////////////
        await network.setContracts(feeHandler.address, matchingEngine.address, zeroAddress, {from: admin});
        await network.addKyberProxy(networkProxy.address, {from: admin});
        await network.addOperator(operator, {from: admin});
        await network.setDAOContract(DAO.address, {from: admin});

        //add and list pair for reserve
        await nwHelper.addReservesToNetwork(network, reserveInstances, tokens, operator);

        //set params, enable network
        await network.setParams(gasPrice, negligibleRateDiffBps, {from: admin});
        await network.setEnable(true, {from: admin});
    });

    describe("test get rates - compare proxy rate to network returned rates", async() => {
        describe("getExpectedRate (backward compatible)", async() => {
            it("verify getExpectedRate (backward compatible) for t2e.", async() => {
                let tokenAdd = tokens[4].address;
                let srcQty = (new BN(3)).mul((new BN(10)).pow(new BN(tokenDecimals[4])));
                let networkRate = await network.getExpectedRateWithHintAndFee(tokenAdd, ethAddress, srcQty, 0, emptyHint);
                let proxyRate = await networkProxy.getExpectedRate(tokenAdd, ethAddress, srcQty);
                Helper.assertEqual(proxyRate.worstRate, proxyRate.expectedRate.mul(new BN(97)).div(new BN(100)));
                Helper.assertEqual(networkRate.rateWithNetworkFee, proxyRate.expectedRate,
                    "expected rate network not equal rate proxy");
            });

            it("verify getExpectedRate (backward compatible) for e2t.", async() => {
                let tokenAdd = tokens[3].address;
                let srcQty = (new BN(2)).mul((new BN(10)).pow(new BN(ethDecimals)));
                let networkRate = await network.getExpectedRateWithHintAndFee(ethAddress, tokenAdd, srcQty, 0, emptyHint)
                let proxyRate = await networkProxy.getExpectedRate(ethAddress, tokenAdd, srcQty);
                Helper.assertEqual(proxyRate.worstRate, proxyRate.expectedRate.mul(new BN(97)).div(new BN(100)));
                Helper.assertEqual(networkRate.rateWithNetworkFee, proxyRate.expectedRate,
                    "expected rate network not equal rate proxy");
            });

            it("verify getExpectedRate (backward compatible) for t2t.", async() => {
                let srcAdd = tokens[1].address;
                let destAdd = tokens[2].address;
                let srcQty = (new BN(10)).mul((new BN(10)).pow(new BN(tokenDecimals[1])));
                let networkRate = await network.getExpectedRateWithHintAndFee(srcAdd, destAdd, srcQty, 0, emptyHint);
                let proxyRate = await networkProxy.getExpectedRate(srcAdd, destAdd, srcQty);
                Helper.assertEqual(proxyRate.worstRate, proxyRate.expectedRate.mul(new BN(97)).div(new BN(100)));
                Helper.assertEqual(networkRate.rateWithNetworkFee, proxyRate.expectedRate,
                    "expected rate network not equal rate proxy");
            });
        });

        describe("test getExpectedRateAfterFee - different hints, fees.", async() => {
            for (platformFeeBps of platformFeeArray) {
                for (tradeType of tradeTypesArray) {
                    let platformFee = platformFeeBps;
                    let hintType = tradeType;
                    let t2eIterator = numTokens - 1;
                    let e2tIterator = 0;
                    let t2tIterator = 0;

                    it(`check for t2e (${tradeStr[hintType]}), platform fee ${platformFee.toString()} bps)`, async() => {
                        let tokenAdd = tokens[t2eIterator].address;
                        let srcQty = (new BN(3)).mul((new BN(10)).pow(new BN(ethDecimals)));
                        hint = await nwHelper.getHint(rateHelper, matchingEngine, reserveInstances, hintType, undefined, tokenAdd, ethAddress, srcQty);
                        let networkRate = await network.getExpectedRateWithHintAndFee(tokenAdd, ethAddress, srcQty, platformFee, emptyHint)
                        let proxyRate = await networkProxy.getExpectedRateAfterFee(tokenAdd, ethAddress, srcQty, platformFee, emptyHint);
                        Helper.assertEqual(networkRate.rateWithAllFees, proxyRate,
                            "expected rate network not equal rate proxy, %d", t2eIterator);
                        t2eIterator--;
                    });

                    it(`check for e2t (${tradeStr[hintType]}), platform fee ${platformFee.toString()} bps)`, async() => {  
                        let tokenAdd = tokens[e2tIterator].address;
                        let srcQty = (new BN(3)).mul((new BN(10)).pow(new BN(tokenDecimals[e2tIterator])));
                        hint = await nwHelper.getHint(rateHelper, matchingEngine, reserveInstances, hintType, undefined, ethAddress, tokenAdd, srcQty);
                        let networkRate = await network.getExpectedRateWithHintAndFee(ethAddress, tokenAdd, srcQty, platformFee, hint)
                        let proxyRate = await networkProxy.getExpectedRateAfterFee(ethAddress, tokenAdd, srcQty, platformFee, hint);
                        Helper.assertEqual(networkRate.rateWithAllFees, proxyRate,
                            "expected rate network not equal rate proxy, %d", e2tIterator);
                        e2tIterator++;
                    });

                    it(`check for t2t (${tradeStr[hintType]}), platform fee ${platformFee.toString()} bps)`, async() => {
                        let srcAdd = tokens[t2tIterator].address;
                        let destAdd = tokens[(t2tIterator + 1) % numTokens].address;
                        let srcQty = (new BN(3)).mul((new BN(10)).pow(new BN(tokenDecimals[t2tIterator])));
                        hint = await nwHelper.getHint(rateHelper, matchingEngine, reserveInstances, hintType, undefined, srcAdd, destAdd, srcQty);
                        let networkRate = await network.getExpectedRateWithHintAndFee(srcAdd, destAdd, srcQty, platformFee, hint)
                        let proxyRate = await networkProxy.getExpectedRateAfterFee(srcAdd, destAdd, srcQty, platformFee, hint);
                        Helper.assertEqual(networkRate.rateWithAllFees, proxyRate,
                            "expected rate network not equal rate proxy, %d", t2tIterator);
                        t2tIterator++;
                    });
                }
            }
        });

        describe("test getPriceData no fee - different hints.", async() => {
            let tradeType = [MASK_IN_HINTTYPE, MASK_OUT_HINTTYPE, SPLIT_HINTTYPE, EMPTY_HINTTYPE];
            let typeStr = ['MASK_IN', 'MASK_OUT', 'SPLIT', 'NO HINT'];

            for(let i = 0; i < tradeType.length; i++) {
                let type = tradeType[i];
                const numResForTest = getNumReservesForType(type);

                it(`check for t2e, ${typeStr[i]} hint.`, async() => {
                    let tokenId = i;
                    let tokenAdd = tokens[tokenId].address;
                    let srcQty = (new BN(3)).mul((new BN(10)).pow(new BN(tokenDecimals[tokenId])));

                    let hint = await nwHelper.getHint(rateHelper, matchingEngine, reserveInstances, type, numResForTest, tokenAdd, ethAddress, srcQty);
                    let networkRate = await network.getExpectedRateWithHintAndFee(tokenAdd, ethAddress, srcQty, 0, hint);
                    let proxyRate = await networkProxy.getPriceDataNoFees(tokenAdd, ethAddress, srcQty, hint);
                    Helper.assertEqual(networkRate.rateWithoutFees, proxyRate, "expected rate network not equal rate proxy");
                });

                it(`check for e2t, ${typeStr[i]} hint.`, async() => {
                    let tokenId = i;
                    let tokenAdd = tokens[tokenId].address;
                    let srcQty = (new BN(3)).mul((new BN(10)).pow(ethDecimals));

                    let hint = await nwHelper.getHint(rateHelper, matchingEngine, reserveInstances, type, numResForTest, tokenAdd, ethAddress, srcQty);
                    let networkRate = await network.getExpectedRateWithHintAndFee(ethAddress, tokenAdd, srcQty, 0, hint)
                    let proxyRate = await networkProxy.getPriceDataNoFees(ethAddress, tokenAdd, srcQty, hint);
                    Helper.assertEqual(networkRate.rateWithoutFees, proxyRate, "expected rate network not equal rate proxy");
                });

                it(`check for t2t, ${typeStr[i]} hint.`, async() => {
                    let tokenId = i;
                    let srcAdd = tokens[tokenId].address;
                    let destAdd = tokens[(tokenId + 1) % numTokens].address;
                    let srcQty = (new BN(3)).mul((new BN(10)).pow(new BN(tokenDecimals[tokenId])));

                    let hint = await nwHelper.getHint(rateHelper, matchingEngine, reserveInstances, type, numResForTest, srcAdd, destAdd, srcQty);
                    let networkRate = await network.getExpectedRateWithHintAndFee(srcAdd, destAdd, srcQty, 0, hint)
                    let proxyRate = await networkProxy.getPriceDataNoFees(srcAdd, destAdd, srcQty, hint);
                    Helper.assertEqual(networkRate.rateWithoutFees, proxyRate, "expected rate network not equal rate proxy");
                });
            }
        });
    });

    // making some trades to init data for contracts so the gas report will be more accurate
    // e.g Network/FeeHandler will get and store networkFee/Brr data from DAO
    describe("test loop trades before gas report", async() => {
        for (let i = 0; i < numTokens; i++) {
            let fee = 10;
            let srcQty = (new BN((i + 1) * 500)).mul(new BN(10).pow(new BN(tokenDecimals[i])));
            let destTokenId = (i + 1) % numTokens;
            it("should perform trades", async() => {
                await tokens[i].transfer(taker, srcQty);
                await tokens[i].approve(networkProxy.address, srcQty, {from: taker});
                await networkProxy.tradeWithHintAndFee(tokens[i].address, srcQty, tokens[destTokenId].address, taker,
                    maxDestAmt, 0, platformWallet, fee, '0x', {from: taker});
            });
        }
    });

    describe("test trades - report gas", async() => {
        let tradeType = [SPLIT_HINTTYPE, EMPTY_HINTTYPE, MASK_IN_HINTTYPE, MASK_OUT_HINTTYPE];
        let typeStr = ['SPLIT', 'NO HINT', 'MASK_IN', 'MASK_OUT'];

        for(let i = 0; i < tradeType.length; i++) {
            let type = tradeType[i];
            let str = typeStr[i];
            let fee = 123;

            it("should perform a t2e trade with hint", async() => {
                let tokenId = i;
                let tokenAdd = tokens[tokenId].address;
                let token = tokens[tokenId];
                let srcQty = (new BN(3)).mul((new BN(10)).pow(new BN(tokenDecimals[tokenId])));
                const numResForTest = getNumReservesForType(type);

                //log("testing - numRes: " + numResForTest + " type: " + str + " fee: " + fee);
                let hint = await nwHelper.getHint(rateHelper, matchingEngine, reserveInstances, type, numResForTest, tokenAdd, ethAddress, srcQty);

                await token.transfer(taker, srcQty);
                await token.approve(networkProxy.address, srcQty, {from: taker});
                let rate = await networkProxy.getExpectedRateAfterFee(tokenAdd, ethAddress, srcQty, fee, hint);

                let txResult = await networkProxy.tradeWithHintAndFee(tokenAdd, srcQty, ethAddress, taker,
                    maxDestAmt, calcMinRate(rate), platformWallet, fee, hint, {from: taker});
                console.log(`t2e: ${txResult.receipt.gasUsed} gas used, type: ` + str + ' fee: ' + fee + ` num reserves: ` + numResForTest);
            });

            it("should perform a e2t trade with hint", async() => {
                let tokenId = i;
                let tokenAdd = tokens[tokenId].address;
                let srcQty = (new BN(3)).mul((new BN(10)).pow(new BN(tokenDecimals[tokenId])));
                const numResForTest = getNumReservesForType(type);

                let hint = await nwHelper.getHint(rateHelper, matchingEngine, reserveInstances, type, numResForTest, ethAddress, tokenAdd, srcQty);

                let rate = await networkProxy.getExpectedRateAfterFee(ethAddress, tokenAdd, srcQty, fee, hint);
                let txResult = await networkProxy.tradeWithHintAndFee(ethAddress, srcQty, tokenAdd, taker,
                    maxDestAmt, calcMinRate(rate), platformWallet, fee, hint, {from: taker, value: srcQty});
                console.log(`e2t: ${txResult.receipt.gasUsed} gas used, type: ` + str + ' fee: ' + fee + " num reserves: " + numResForTest);
            });

            it("should perform a t2t trade with hint", async() => {
                let tokenId = i;
                let srcAdd = tokens[tokenId].address;
                let destAdd = tokens[(tokenId + 1) % numTokens].address;
                let srcToken = tokens[tokenId];
                let srcQty = (new BN(3)).mul((new BN(10)).pow(new BN(tokenDecimals[tokenId])));
                const numResForTest = getNumReservesForType(type);

                let hint = await nwHelper.getHint(rateHelper, matchingEngine, reserveInstances, type, numResForTest, srcAdd, destAdd, srcQty);
                let rate = await networkProxy.getExpectedRateAfterFee(srcAdd, destAdd, srcQty, fee, hint);

                await srcToken.transfer(taker, srcQty);
                await srcToken.approve(networkProxy.address, srcQty, {from: taker});
                let txResult = await networkProxy.tradeWithHintAndFee(srcAdd, srcQty, destAdd, taker,
                    maxDestAmt, calcMinRate(rate), platformWallet, fee, hint, {from: taker});
                console.log(`t2t: ${txResult.receipt.gasUsed} gas used, type: ` + str + ' fee: ' + fee + " num reserves: " + numResForTest);
            });
        }
    });

    describe("test trades with maxDestAmount - report gas", async() => {
        let tradeType = [SPLIT_HINTTYPE, EMPTY_HINTTYPE];
        let typeStr = ['SPLIT', 'NO HINT'];

        for(let i = 0; i < tradeType.length; i++) {
            let type = tradeType[i];
            let str = typeStr[i];
            let fee = 123;

            it("should perform a t2e trade with hint", async() => {
                let tokenId = i;
                let tokenAdd = tokens[tokenId].address;
                let token = tokens[tokenId];
                let srcQty = (new BN(3)).mul((new BN(10)).pow(new BN(tokenDecimals[tokenId])));
                let maxDestAmt = precisionUnits.div(new BN(30));
                const numResForTest = getNumReservesForType(type);

                //log("testing - numRes: " + numResForTest + " type: " + str + " fee: " + fee);
                let hint = await nwHelper.getHint(rateHelper, matchingEngine, reserveInstances, type, numResForTest, tokenAdd, ethAddress, srcQty);

                await token.transfer(taker, srcQty);
                await token.approve(networkProxy.address, srcQty, {from: taker});
                let rate = await networkProxy.getExpectedRateAfterFee(tokenAdd, ethAddress, srcQty, fee, hint);

                let txResult = await networkProxy.tradeWithHintAndFee(tokenAdd, srcQty, ethAddress, taker,
                    maxDestAmt, calcMinRate(rate), platformWallet, fee, hint, {from: taker});
                console.log(`t2e: ${txResult.receipt.gasUsed} gas used, type: ` + str + ' fee: ' + fee + ` num reserves: ` + numResForTest);
            });

            it("should perform a e2t trade with hint", async() => {
                let tokenId = i;
                let tokenAdd = tokens[tokenId].address;
                let srcQty = (new BN(3)).mul((new BN(10)).pow(new BN(tokenDecimals[tokenId])));
                let maxDestAmt = (new BN(10).pow(new BN(tokenDecimals[tokenId]))).div(new BN(30));
                const numResForTest = getNumReservesForType(type);

                let hint = await nwHelper.getHint(rateHelper, matchingEngine, reserveInstances, type, numResForTest, ethAddress, tokenAdd, srcQty);

                let rate = await networkProxy.getExpectedRateAfterFee(ethAddress, tokenAdd, srcQty, fee, hint);

                let txResult = await networkProxy.tradeWithHintAndFee(ethAddress, srcQty, tokenAdd, taker,
                    maxDestAmt, calcMinRate(rate), platformWallet, fee, hint, {from: taker, value: srcQty});
                console.log(`e2t: ${txResult.receipt.gasUsed} gas used, type: ` + str + ' fee: ' + fee + " num reserves: " + numResForTest);
            });

            it("should perform a t2t trade with hint", async() => {
                let tokenId = i;
                let srcAdd = tokens[tokenId].address;
                let destId = (tokenId + 1) % numTokens;
                let destAdd = tokens[destId].address;
                let srcToken = tokens[tokenId];
                let srcQty = (new BN(3)).mul((new BN(10)).pow(new BN(tokenDecimals[tokenId])));
                let maxDestAmt = new BN(10).pow(new BN(tokenDecimals[destId])).div(new BN(30));

                const numResForTest = getNumReservesForType(type);

                let hint = await nwHelper.getHint(rateHelper, matchingEngine, reserveInstances, type, numResForTest, srcAdd, destAdd, srcQty);
                let rate = await networkProxy.getExpectedRateAfterFee(srcAdd, destAdd, srcQty, fee, hint);

                await srcToken.transfer(taker, srcQty);
                await srcToken.approve(networkProxy.address, srcQty, {from: taker});
                let txResult = await networkProxy.tradeWithHintAndFee(srcAdd, srcQty, destAdd, taker,
                    maxDestAmt, calcMinRate(rate), platformWallet, fee, hint, {from: taker});
                console.log(`t2t: ${txResult.receipt.gasUsed} gas used, type: ` + str + ' fee: ' + fee + " num reserves: " + numResForTest);
            });
        }
    });


    describe("test actual rate vs min rate in different scenarios. ", async() => {
        before("deploy mockTrader instance", async() => {
            mockTrader = await MockTrader.new(networkProxy.address);
        });

        for (tradeType of tradeTypesArray) {
            let hintType = tradeType;
            let fee = new BN(123);
            let tokenId = 0;

            it(`should perform a t2e trade (${tradeStr[hintType]}), with minRate = getExpectedRateAfterFee`, async() => {
                let tokenAdd = tokens[tokenId].address;
                let token = tokens[tokenId];
                let srcQty = (new BN(3)).mul((new BN(10)).pow(new BN(tokenDecimals[tokenId])));
                const numResForTest = getNumReservesForType(hintType);

                //log("testing - numRes: " + numResForTest + " type: " + str + " fee: " + fee);
                hint = await nwHelper.getHint(rateHelper, matchingEngine, reserveInstances, hintType, numResForTest, tokenAdd, ethAddress, srcQty);
                let rate = await networkProxy.getExpectedRateAfterFee(tokenAdd, ethAddress, srcQty, fee, hint);

                await token.transfer(taker, srcQty);
                await token.approve(networkProxy.address, srcQty, {from: taker});
                await networkProxy.tradeWithHintAndFee(tokenAdd, srcQty, ethAddress, taker,
                    maxDestAmt, rate, platformWallet, fee, hint, {from: taker});
                    
                await token.transfer(taker, srcQty);
                await token.approve(mockTrader.address, srcQty, {from: taker});
                await mockTrader.tradeWithHintAndFee(tokenAdd, srcQty, ethAddress, taker,
                    platformWallet, fee, hint, {from: taker});
            });

            it(`should perform a e2t trade (${tradeStr[hintType]}), with minRate = getExpectedRateAfterFee`, async() => {
                let tokenAdd = tokens[tokenId].address;
                let srcQty = (new BN(3)).mul((new BN(10)).pow(new BN(tokenDecimals[tokenId])));
                const numResForTest = getNumReservesForType(hintType);

                hint = await nwHelper.getHint(rateHelper, matchingEngine, reserveInstances, hintType, numResForTest, ethAddress, tokenAdd, srcQty);
                let rate = await networkProxy.getExpectedRateAfterFee(ethAddress, tokenAdd, srcQty, fee, hint);
                await networkProxy.tradeWithHintAndFee(ethAddress, srcQty, tokenAdd, taker,
                    maxDestAmt, rate, platformWallet, fee, hint, {from: taker, value: srcQty});
                
                await mockTrader.tradeWithHintAndFee(ethAddress, srcQty, tokenAdd, taker,
                    platformWallet, fee, hint, {from: taker, value: srcQty});
            });

            it(`should perform a t2t trade (${tradeStr[hintType]}), with minRate = getExpectedRateAfterFee`, async() => {
                let srcAdd = tokens[tokenId].address;
                let destAdd = tokens[(tokenId + 1) % numTokens].address;
                let srcToken = tokens[tokenId];
                let srcQty = (new BN(3)).mul((new BN(10)).pow(new BN(tokenDecimals[tokenId])));
                const numResForTest = getNumReservesForType(hintType);

                hint = await nwHelper.getHint(rateHelper, matchingEngine, reserveInstances, hintType, numResForTest, srcAdd, destAdd, srcQty);
                let rate = await networkProxy.getExpectedRateAfterFee(srcAdd, destAdd, srcQty, fee, hint);

                await srcToken.transfer(taker, srcQty);
                await srcToken.approve(networkProxy.address, srcQty, {from: taker});
                await networkProxy.tradeWithHintAndFee(srcAdd, srcQty, destAdd, taker,
                    maxDestAmt, rate, platformWallet, fee, hint, {from: taker});
                
                await srcToken.transfer(taker, srcQty);
                await srcToken.approve(mockTrader.address, srcQty, {from: taker});
                await mockTrader.tradeWithHintAndFee(srcAdd, srcQty, destAdd, taker,
                    platformWallet, fee, hint, {from: taker});
            });

            tokenId++;
        }
    });

    describe("test trade with tokens that don't return values for its functions", async() => {
        let mockNetwork;
        let mockProxy;
        let mockMatchingEngine;
        let mockRateHelper;
        let mockTokens = [];
        let mockTokenDecimals = [];
        let tempFeeHandler;
        let tempStorage;
        let mockReserveInstances;

        // loop trades
        let tradeType = [MASK_IN_HINTTYPE, MASK_OUT_HINTTYPE, SPLIT_HINTTYPE, EMPTY_HINTTYPE];
        let typeStr = ['MASK_IN', 'MASK_OUT', 'SPLIT', 'NO HINT'];

        let srcToken;
        let srcDecimals;
        let destToken;
        let destDecimals;

        before("Setup contracts with tokens with no return values", async() => {
            //DAO related init.
            let expiryTimestamp = await Helper.getCurrentBlockTime() + 10;
            let mockDAO = await MockDao.new(rewardInBPS, rebateInBPS, epoch, expiryTimestamp);
            await mockDAO.setNetworkFeeBps(networkFeeBps);

            //deploy storage and network
            tempStorage = await KyberStorage.new(admin);
            mockNetwork = await KyberNetwork.new(admin, tempStorage.address);
            await tempStorage.setNetworkContract(mockNetwork.address, {from: admin});

            // init proxy
            mockProxy = await KyberNetworkProxy.new(admin);

            //init matchingEngine
            mockMatchingEngine = await MatchingEngine.new(admin);
            await mockMatchingEngine.setNetworkContract(mockNetwork.address, {from: admin});
            await mockMatchingEngine.setKyberStorage(tempStorage.address, {from: admin});
            await tempStorage.setFeeAccountedPerReserveType(true, true, true, false, true, true, {from: admin});
            await tempStorage.setEntitledRebatePerReserveType(true, false, true, false, true, true, {from: admin});

            mockRateHelper = await RateHelper.new(admin);
            await mockRateHelper.setContracts(mockMatchingEngine.address, mockDAO.address, tempStorage.address, {from: admin});

            // setup proxy
            await mockProxy.setKyberNetwork(mockNetwork.address, {from: admin});
            await mockProxy.setHintHandler(mockMatchingEngine.address, {from: admin});

            //init tokens
            for (let i = 0; i < 5; i++) {
                mockTokenDecimals[i] = new BN(15).add(new BN(i));
                token = await TestTokenNotReturn.new("test" + i, "tst" + i, mockTokenDecimals[i]);
                mockTokens[i] = token;
            }

            //init feeHandler
            tempFeeHandler = await FeeHandler.new(mockDAO.address, mockProxy.address, mockNetwork.address, KNC.address, burnBlockInterval, mockDAO.address);

            // init and setup reserves
            let result = await nwHelper.setupReserves(mockNetwork, mockTokens, 5, 0, 0, 0, accounts, admin, operator);
            mockReserveInstances = result.reserveInstances;

            //setup network
            ///////////////
            await mockNetwork.setContracts(tempFeeHandler.address, mockMatchingEngine.address, zeroAddress, {from: admin});

            await mockNetwork.addKyberProxy(mockProxy.address, {from: admin});
            await mockNetwork.addOperator(operator, {from: admin});

            await mockNetwork.setDAOContract(mockDAO.address, {from: admin});

            //add and list pair for reserve
            await nwHelper.addReservesToNetwork(mockNetwork, mockReserveInstances, mockTokens, operator);

            //set params, enable network
            await mockNetwork.setParams(gasPrice, negligibleRateDiffBps, {from: admin});
            await mockNetwork.setEnable(true, {from: admin});

            srcToken = mockTokens[0];
            srcDecimals = mockTokenDecimals[0];
            destToken = mockTokens[1];
            destDecimals = mockTokenDecimals[1];
        });

        for(let i = 0; i < tradeType.length; i++) {
            let type = tradeType[i];
            let str = typeStr[i];
            let fee = 123;

            it("should perform a t2e trade with hint", async() => {
                let srcQty = (new BN(3)).mul((new BN(10)).pow(new BN(srcDecimals)));
                const numResForTest = getNumReservesForType(type);

                //log("testing - numRes: " + numResForTest + " type: " + str + " fee: " + fee);
                let hint = await nwHelper.getHint(mockRateHelper, mockMatchingEngine, mockReserveInstances, type, numResForTest, srcToken.address, ethAddress, srcQty);

                await srcToken.transfer(taker, srcQty);
                await srcToken.approve(mockProxy.address, srcQty, {from: taker});
                let rate = await mockProxy.getExpectedRateAfterFee(srcToken.address, ethAddress, srcQty, fee, hint);

                let txResult = await mockProxy.tradeWithHintAndFee(
                    srcToken.address,
                    srcQty, ethAddress,
                    taker,
                    maxDestAmt,
                    calcMinRate(rate),
                    platformWallet,
                    fee,
                    hint,
                    {from: taker}
                );
                console.log(`t2e: ${txResult.receipt.gasUsed} gas used, type: ` + str + ' fee: ' + fee + ` num reserves: ` + numResForTest);
            });

            it("should perform a e2t trade with hint", async() => {
                let srcQty = (new BN(10)).pow(new BN(ethDecimals));
                const numResForTest = getNumReservesForType(type);

                let hint = await nwHelper.getHint(
                    mockRateHelper,
                    mockMatchingEngine,
                    mockReserveInstances,
                    type,
                    numResForTest,
                    ethAddress,
                    destToken.address,
                    srcQty
                );

                let rate = await mockProxy.getExpectedRateAfterFee(ethAddress, destToken.address, srcQty, fee, hint);
                let txResult = await mockProxy.tradeWithHintAndFee(
                    ethAddress,
                    srcQty,
                    destToken.address,
                    taker,
                    maxDestAmt,
                    calcMinRate(rate),
                    platformWallet,
                    fee,
                    hint,
                    {from: taker, value: srcQty}
                );
                console.log(`e2t: ${txResult.receipt.gasUsed} gas used, type: ` + str + ' fee: ' + fee + " num reserves: " + numResForTest);
            });

            it("should perform a t2t trade with hint", async() => {
                let srcQty = (new BN(3)).mul((new BN(10)).pow(new BN(srcDecimals)));
                const numResForTest = getNumReservesForType(type);

                let hint = await nwHelper.getHint(mockRateHelper, mockMatchingEngine, mockReserveInstances, type, numResForTest, srcToken.address, destToken.address, srcQty);
                let rate = await mockProxy.getExpectedRateAfterFee(srcToken.address, destToken.address, srcQty, fee, hint);

                await srcToken.transfer(taker, srcQty);
                await srcToken.approve(mockProxy.address, srcQty, {from: taker});

                let txResult = await mockProxy.tradeWithHintAndFee(
                    srcToken.address,
                    srcQty,
                    destToken.address,
                    taker,
                    maxDestAmt,
                    calcMinRate(rate),
                    platformWallet,
                    fee,
                    hint,
                    {from: taker}
                );
                console.log(`t2t: ${txResult.receipt.gasUsed} gas used, type: ` + str + ' fee: ' + fee + " num reserves: " + numResForTest);
            });
        }
    });

    describe("test reading simple values", async () => {
        it("test set enable with admin", async () => {
            await network.setEnable(false, { from: admin });
            let enable = await networkProxy.enabled();
            assert(!enable);
            await network.setEnable(true, { from: admin });
            enable = await networkProxy.enabled();
            assert(enable);
        });

        it("test maxGasPrice", async () => {
            let expectedMaxGasPrice = await network.maxGasPrice();
            let actualMaxGasPrice = await networkProxy.maxGasPrice();
            Helper.assertEqual(expectedMaxGasPrice, actualMaxGasPrice);
        });

        it("test reading public values", async () => {
            let networkAddr = await networkProxy.kyberNetwork();
            assert(networkAddr == network.address, "missmatch network address");
            let hintHandlerAddr = await networkProxy.hintHandler();
            assert(hintHandlerAddr == matchingEngine.address, "missmatch network address");
        });
    });

    describe("test events", async () => {
        it("HintHandlerSet", async () => {
            let newHintHandler = await MatchingEngine.new(admin);
            let txResult = await networkProxy.setHintHandler(newHintHandler.address, { from: admin });
            await expectEvent(txResult, "HintHandlerSet", {
                hintHandler: newHintHandler.address
            });
            await networkProxy.setHintHandler(matchingEngine.address, { from: admin });
        });

        it("KyberNetworkSet", async () => {
            let tempStorage = await KyberStorage.new(admin);
            let newNetWork = await KyberNetwork.new(admin, tempStorage.address);
            let txResult = await networkProxy.setKyberNetwork(newNetWork.address, { from: admin });
            await expectEvent(txResult, "KyberNetworkSet", {
                newNetwork: newNetWork.address, oldNetwork: network.address,
            })
            await networkProxy.setKyberNetwork(network.address, { from: admin });
        });

        it("ExecuteTrade", async () => {
            let srcToken = tokens[1];
            let srcAmount = new BN(2).mul(new BN(10).pow(new BN(tokenDecimals[1])));
            let destAddress = accounts[7];
            let initialBalance = await Helper.getBalancePromise(destAddress);
            let hint = web3.utils.fromAscii("PERM");
            let fee = 5;

            await srcToken.transfer(taker, srcAmount);
            await srcToken.approve(networkProxy.address, srcAmount, { from: taker });
            let rate = await networkProxy.getExpectedRateAfterFee(srcToken.address, ethAddress, srcAmount, fee, hint);
            let txResult = await networkProxy.tradeWithHintAndFee(srcToken.address, srcAmount,
                ethAddress, destAddress, maxDestAmt, calcMinRate(rate), platformWallet,
                fee, hint, { from: taker }
            );
            let destBalanceAfter = await Helper.getBalancePromise(destAddress);
            let destQty = new BN(destBalanceAfter).sub(new BN(initialBalance));
            await expectEvent(txResult, "ExecuteTrade", {
                trader: taker,
                src: srcToken.address,
                dest: ethAddress,
                actualSrcAmount: srcAmount,
                actualDestAmount: destQty,
                platformWallet: platformWallet,
                platformFeeBps: new BN(fee),
            });
        });
    });

    describe("test reverting when using contract zero address", async () => {
        it("test set network to zero address", async () => {
            await expectRevert(networkProxy.setKyberNetwork(zeroAddress, { from: admin }), "KyberNetwork 0");
        });

        it("test set hint handler to zero address", async () => {
            await expectRevert(networkProxy.setHintHandler(zeroAddress, { from: admin }), "hintHandler 0");
        });
    });

    describe("test simple swap API", async () => {
        it("swapEtherToToken", async () => {
            let destToken = tokens[1];
            let initialTakerBalance = await destToken.balanceOf(taker);
            let tokenAdd = destToken.address;
            let srcQty = (new BN(2)).mul((new BN(10)).pow(ethDecimals));
            let proxyRate = await networkProxy.getExpectedRate(ethAddress, tokenAdd, srcQty);
            await destToken.approve(networkProxy.address, srcQty, { from: taker });
            await networkProxy.swapEtherToToken(tokenAdd, proxyRate.expectedRate, { from: taker, value: srcQty });
            let dstQty = Helper.calcDstQty(srcQty, ethDecimals, tokenDecimals[1], proxyRate.expectedRate);
            let expectedBalance = new BN(initialTakerBalance).add(dstQty);
            await Helper.assertSameTokenBalance(taker, destToken, expectedBalance);
        });

        it("swapTokenToEther", async () => {
            let srcToken = tokens[1]
            let tokenAdd = tokens[1].address;
            let srcQty = (new BN(5)).mul((new BN(10)).pow(tokenDecimals[1]));
            let txGasPrice = new BN(2).mul(new BN(5).pow(new BN(10)));
            await srcToken.transfer(taker, srcQty);
            await srcToken.approve(networkProxy.address, srcQty, { from: taker });
            let initialTakerBalance = await Helper.getBalancePromise(taker);
            let proxyRate = await networkProxy.getExpectedRate(tokenAdd, ethAddress, srcQty);
            let txResult = await networkProxy.swapTokenToEther(tokenAdd, srcQty, proxyRate.expectedRate, { from: taker, gasPrice: txGasPrice });
            let dstQty = Helper.calcDstQty(srcQty, tokenDecimals[1], ethDecimals, proxyRate.expectedRate);
            let actualBalance = await Helper.getBalancePromise(taker);
            let actualDstQty = new BN(actualBalance).add(new BN(txGasPrice).mul(new BN(txResult.receipt.gasUsed))).sub(initialTakerBalance);
            await Helper.assertApproximate(dstQty, actualDstQty, "wrong balance");
        });

        it("swapTokenToToken", async () => {
            let srcToken = tokens[2];
            let dstToken = tokens[4];
            let srcQty = (new BN(7)).mul((new BN(10)).pow(tokenDecimals[2]));
            let initialTakerBalance = await dstToken.balanceOf(taker);
            await srcToken.transfer(taker, srcQty);
            await srcToken.approve(networkProxy.address, srcQty, { from: taker });
            let proxyRate = await networkProxy.getExpectedRate(srcToken.address, dstToken.address, srcQty);
            await networkProxy.swapTokenToToken(srcToken.address, srcQty, dstToken.address, proxyRate.expectedRate, { from: taker });
            let dstQty = Helper.calcDstQty(srcQty, tokenDecimals[2], tokenDecimals[4], proxyRate.expectedRate);
            let actualBalance = await dstToken.balanceOf(taker);;
            let actualDstQty = actualBalance.sub(initialTakerBalance)
            await Helper.assertApproximate(dstQty, actualDstQty, "wrong balance");
        })

        it("tradeWithHint", async () => {
            let srcToken = tokens[2];
            let dstToken = tokens[4];
            let srcQty = (new BN(7)).mul((new BN(10)).pow(tokenDecimals[2]));
            let initialTakerBalance = await dstToken.balanceOf(destAddress);
            await srcToken.transfer(taker, srcQty);
            await srcToken.approve(networkProxy.address, srcQty, { from: taker });
            let proxyRate = await networkProxy.getExpectedRate(srcToken.address, dstToken.address, srcQty);
            await networkProxy.tradeWithHint(
                srcToken.address,
                srcQty,
                dstToken.address,
                destAddress,
                maxDestAmt,
                proxyRate.expectedRate,
                platformWallet,
                emptyHint, { from: taker });
            let dstQty = Helper.calcDstQty(srcQty, tokenDecimals[2], tokenDecimals[4], proxyRate.expectedRate);
            let actualBalance = await dstToken.balanceOf(destAddress);
            let actualDstQty = actualBalance.sub(initialTakerBalance);
            await Helper.assertApproximate(dstQty, actualDstQty, "wrong balance");

        });
    });

    describe("test doTrade verify condition", async () => {
        let generousNetwork;
        let generousNetwork2;
        let maliciousNetwork;
        before("init 'generous' network and 'malicious' network", async () => {
            // set up generousNetwork
            generousNetwork = await nwHelper.setupNetwork(GenerousNetwork, networkProxy.address, KNC.address, DAO.address, admin, operator);
            let result = await nwHelper.setupReserves(generousNetwork, tokens, 1, 1, 0, 0, accounts, admin, operator);
            await nwHelper.addReservesToNetwork(generousNetwork, result.reserveInstances, tokens, operator);
            // set up maliciousNetwork
            maliciousNetwork = await nwHelper.setupNetwork(MaliciousNetwork, networkProxy.address, KNC.address, DAO.address, admin, operator);
            result = await nwHelper.setupReserves(maliciousNetwork, tokens, 1, 1, 0, 0, accounts, admin, operator);
            await nwHelper.addReservesToNetwork(maliciousNetwork, result.reserveInstances, tokens, operator);
            // set up generousNetwork2
            generousNetwork2 = await nwHelper.setupNetwork(GenerousNetwork2, networkProxy.address, KNC.address, DAO.address, admin, operator);
            result = await nwHelper.setupReserves(generousNetwork2, tokens, 1, 1, 0, 0, accounts, admin, operator);
            await nwHelper.addReservesToNetwork(generousNetwork2, result.reserveInstances, tokens, operator);
        });

        it("trade revert if src address is not eth and msg value is not zero", async () => {
            let srcToken = tokens[1];
            let srcQty = new BN(3).mul(new BN(10).pow(new BN(tokenDecimals[1])));

            //get rate
            let rate = await networkProxy.getExpectedRate(srcToken.address, tokens[2].address, srcQty);
            dstQty = Helper.calcDstQty(srcQty, tokenDecimals[1], tokenDecimals[2], rate.expectedRate);
            await srcToken.transfer(taker, srcQty);
            await srcToken.approve(networkProxy.address, srcQty, { from: taker });

            //see trade reverts
            await expectRevert(networkProxy.trade(
                srcToken.address,
                srcQty,
                tokens[2].address,
                taker,
                maxDestAmt,
                rate.expectedRate,
                zeroAddress,
                { from: taker, value: new BN(2) }
            ), "msg.value should be 0");
            // see trade is ok if msg.value == 0
            await networkProxy.trade.call(
                srcToken.address,
                srcQty,
                tokens[2].address,
                taker,
                maxDestAmt,
                rate.expectedRate,
                zeroAddress,
                { from: taker }
            );
        });

        it("trade revert if actual dest amount is different from reported", async () => {
            await networkProxy.setKyberNetwork(generousNetwork.address, { from: admin });
            let srcToken = tokens[1];
            let dstToken = tokens[2]
            let amountTwei = 1515;

            tokenAmountForTrades = new BN(10000).mul(new BN(10).pow(tokenDecimals[1]));
            await srcToken.transfer(taker, amountTwei);
            await dstToken.transfer(generousNetwork.address, tokenAmountForTrades);
            //get rate
            let rate = await networkProxy.getExpectedRate(srcToken.address, dstToken.address, amountTwei);
            await srcToken.approve(networkProxy.address, amountTwei, { from: taker });

            //see trade reverts
            await expectRevert(
                networkProxy.trade(
                    srcToken.address,
                    amountTwei,
                    dstToken.address,
                    taker,
                    maxDestAmt,
                    rate.expectedRate,
                    zeroAddress,
                    { from: taker }
                ), "network returned wrong amount"
            );
            // change the amount and see trade success
            await networkProxy.trade(
                srcToken.address,
                1514,
                tokens[2].address,
                taker,
                maxDestAmt,
                rate.worstRate,
                zeroAddress,
                { from: taker }
            );
        });

        it("trade revert if src balance after is greater or equal to balance before", async () => {
            await networkProxy.setKyberNetwork(generousNetwork.address, { from: admin });
            let srcToken = tokens[1];
            let dstToken = tokens[2];
            let amountTwei = 1313;

            tokenAmountForTrades = new BN(10000).mul(new BN(10).pow(tokenDecimals[1]));
            await srcToken.transfer(taker, amountTwei);
            await srcToken.transfer(generousNetwork.address, tokenAmountForTrades);
            //get rate
            let rate = await networkProxy.getExpectedRate(srcToken.address, dstToken.address, amountTwei);
            await srcToken.approve(networkProxy.address, amountTwei, { from: taker });

            //see trade reverts
            await expectRevert(
                networkProxy.trade(
                    srcToken.address,
                    amountTwei,
                    dstToken.address,
                    taker,
                    maxDestAmt,
                    rate.expectedRate,
                    zeroAddress,
                    { from: taker }
                ), "wrong amount in source address"
            );
            // change the amount and see trade success
            await networkProxy.trade(
                srcToken.address,
                1312,
                dstToken.address,
                taker,
                maxDestAmt,
                rate.worstRate,
                zeroAddress,
                { from: taker }
            );
        });


        it("trade revert if dest balance after is smaller than dest balance before", async() =>{
            await networkProxy.setKyberNetwork(maliciousNetwork.address, { from: admin });
            let srcToken = tokens[1];
            let dstToken = tokens[2];
            let amountTwei = 1000;
            //get rate
            let rate = await networkProxy.getExpectedRate(srcToken.address, dstToken.address, amountTwei);
            dstQty = Helper.calcDstQty(amountTwei, tokenDecimals[1], tokenDecimals[2], rate.expectedRate);
            dstQty = dstQty.add(new BN(1));
            await srcToken.transfer(taker, amountTwei);
            await srcToken.approve(networkProxy.address, amountTwei, { from: taker });
            await dstToken.transfer(destAddress, new BN(2200));
            await dstToken.approve(maliciousNetwork.address, maxDestAmt, { from: destAddress});
            await dstToken.approve(networkProxy.address, maxDestAmt, { from: destAddress});
            //set my fee wei is greater than dstQty so maliciousNetwork will not send dest Token
            await maliciousNetwork.setMyFeeWei(new BN(dstQty));
            //see trade reverts due to maliciousNetwork reduce dest Amount
            await expectRevert(
                networkProxy.trade(
                    srcToken.address,
                    amountTwei,
                    dstToken.address,
                    taker,
                    maxDestAmt,
                    rate.expectedRate,
                    destAddress,
                    { from: taker }
                ), "wrong amount in destination address"
            );
        });

        it("trade revert if amount return is greater than max dest amount", async () => {
            await networkProxy.setKyberNetwork(generousNetwork2.address, { from: admin });
            let srcToken = tokens[1];
            let dstToken = tokens[2];
            let amountTwei = 1717;

            tokenAmountForTrades = new BN(10000).mul(new BN(10).pow(tokenDecimals[2]));
            await srcToken.transfer(taker, amountTwei);
            await dstToken.transfer(generousNetwork2.address, tokenAmountForTrades);
            //get rate
            let rate = await networkProxy.getExpectedRate(srcToken.address, dstToken.address, amountTwei);
            await srcToken.approve(networkProxy.address, amountTwei, { from: taker });

            //see trade reverts
            await expectRevert(
                networkProxy.trade(
                    srcToken.address,
                    amountTwei,
                    dstToken.address,
                    taker,
                    new BN(4),
                    rate.expectedRate,
                    zeroAddress,
                    { from: taker }
                ), "actual dest amount exceeds maxDestAmount"
            );
            // change the amount and see trade success
            await networkProxy.trade(
                srcToken.address,
                1716,
                tokens[2].address,
                taker,
                maxDestAmt,
                rate.worstRate,
                zeroAddress,
                { from: taker }
            );
        });

        it("trade revert if actual rate < minRate", async () => {
            await networkProxy.setKyberNetwork(maliciousNetwork.address, { from: admin });
            await maliciousNetwork.setMyFeeWei(new BN(10));
            let srcToken = tokens[1]
            let amountTwei = 1000;
            //get rate
            let rate = await networkProxy.getExpectedRate(srcToken.address, tokens[2].address, amountTwei);
            await srcToken.transfer(taker, amountTwei);
            await srcToken.approve(networkProxy.address, amountTwei, { from: taker });
            //see trade reverts due to maliciousNetwork reduce dest Amount
            await expectRevert(
                networkProxy.trade(
                    srcToken.address,
                    amountTwei,
                    tokens[2].address,
                    taker,
                    maxDestAmt,
                    rate.expectedRate,
                    zeroAddress,
                    { from: taker }
                ), "rate below minConversionRate"
            );
        });

        after("clean up & set reference back to network", async () => {
            await networkProxy.setKyberNetwork(network.address, { from: admin });
        });
    });
    // test
})

function calcMinRate(rate) {
    let minRate = rate.mul(new BN(999)).div(new BN(1000));
    return minRate;
}

function getNumReservesForType(type) {
    if (type == MASK_OUT_HINTTYPE) return 2;
    if (type == MASK_IN_HINTTYPE) return 3;
    if (type == SPLIT_HINTTYPE) return 3;
    return 3;
}

function log(str) {
    console.log(str);
}
