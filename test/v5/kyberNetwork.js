const TestToken = artifacts.require("Token.sol");
const MockReserve = artifacts.require("MockReserve.sol");
const MockDao = artifacts.require("MockDAO.sol");
const KyberNetwork = artifacts.require("KyberNetwork.sol");
const MockNetwork = artifacts.require("MockNetwork.sol");
const FeeHandler = artifacts.require("FeeHandler.sol");
const TradeLogic = artifacts.require("KyberTradeLogic.sol");

const Helper = require("../v4/helper.js");
const nwHelper = require("./networkHelper.js");

const BN = web3.utils.BN;
const { expectEvent, expectRevert } = require('@openzeppelin/test-helpers');

const {BPS, precisionUnits, ethDecimals, ethAddress, zeroAddress, emptyHint, zeroBN} = require("../v4/helper.js");
const {APR_ID, BRIDGE_ID, MOCK_ID, FPR_ID, type_apr, type_fpr, type_MOCK, 
    MASK_IN_HINTTYPE, MASK_OUT_HINTTYPE, SPLIT_HINTTYPE, EMPTY_HINTTYPE}  = require('./networkHelper.js');

//global variables
//////////////////
const gasPrice = (new BN(10).pow(new BN(9)).mul(new BN(50)));
const negligibleRateDiffBps = new BN(10); //0.01% 
const maxDestAmt = new BN(2).pow(new BN(255));
const minConversionRate = new BN(0);
const oneEth = new BN(10).pow(ethDecimals);
const defaultNetworkFeeBps = new BN(25);

let takerFeeBps = new BN(20);
let platformFeeBps = zeroBN;
let platformFeeArray = [zeroBN, new BN(50), new BN(100)];
let takerFeeAmount;
let txResult;

let admin;
let alerter;
let network;
let tempNetwork;
let DAO;
let networkProxy;
let feeHandler;
let tradeLogic;
let operator;
let taker;
let platformWallet;

//DAO related data
let rewardInBPS = new BN(7000);
let rebateInBPS = new BN(2000);
let epoch = new BN(3);
let expiryBlockNumber;

//fee hanlder related
let KNC;
let burnBlockInterval = new BN(30);

//reserve data
//////////////
let reserveInstances = {};
let reserve;
let numReserves;
let info;
let hint;
const tradeTypesArray = [EMPTY_HINTTYPE, MASK_IN_HINTTYPE, MASK_OUT_HINTTYPE, SPLIT_HINTTYPE];
const tradeStr = ["MASK IN", "MASK OUT", "SPLIT", "NONE"];

//tokens data
////////////
let numTokens = 5;
let tokens = [];
let tokenDecimals = [];
let srcTokenId;
let destTokenId;
let srcToken;
let destToken;
let srcQty;
let ethSrcQty = precisionUnits;

//expected result variables
///////////////////////////
let expectedResult;

contract('KyberNetwork', function(accounts) {
    before("one time global init", async() => {
        //init accounts
        networkProxy = accounts[0];  // when using account 0 can avoid string ({from: proxy}) in trade call;
        operator = accounts[1];
        alerter = accounts[2];
        taker = accounts[3];
        platformWallet = accounts[4];
        admin = accounts[5]; // we don't want admin as account 0.
        hintParser = accounts[6];

        //DAO related init.
        expiryBlockNumber = new BN(await web3.eth.getBlockNumber() + 150);
        DAO = await MockDao.new(rewardInBPS, rebateInBPS, epoch, expiryBlockNumber);
        await DAO.setTakerFeeBps(takerFeeBps);
        
        //init network
        network = await KyberNetwork.new(admin);
        // set proxy same as network
        proxyForFeeHandler = network;

        //init tokens
        for (let i = 0; i < numTokens; i++) {
            tokenDecimals[i] = new BN(15).add(new BN(i));
            token = await TestToken.new("test" + i, "tst" + i, tokenDecimals[i]);
            tokens[i] = token;
        }
    });

    beforeEach("randomly select tokens before each test, reset takerFeeBps", async() => {
        srcTokenId = 0;
        destTokenId = 1;
        // while (srcTokenId == destTokenId) {
        //     srcTokenId = getRandomInt(0,numTokens-1);
        //     destTokenId = getRandomInt(0,numTokens-1);
        // }
        
        srcToken = tokens[srcTokenId];
        destToken = tokens[destTokenId];
        srcDecimals = tokenDecimals[srcTokenId];
        destDecimals = tokenDecimals[destTokenId];

        srcQty = new BN(10).mul(new BN(10).pow(srcDecimals));

        //fees
        takerFeeBps = new BN(20);
        platformFeeBps = new BN(0);
    });

    describe("test with MockDAO", async() => {
        before("initialise DAO, network and reserves", async() => {
            //DAO related init.
            expiryBlockNumber = new BN(await web3.eth.getBlockNumber() + 150);
            DAO = await MockDao.new(rewardInBPS, rebateInBPS, epoch, expiryBlockNumber);
            await DAO.setTakerFeeBps(takerFeeBps);

            //init network
            network = await KyberNetwork.new(admin);
            // set proxy same as network
            proxyForFeeHandler = network;
            //transfer tokens to network instance
            await transferTokensToNetwork(network);

            //init feeHandler
            KNC = await TestToken.new("kyber network crystal", "KNC", 18);
            feeHandler = await FeeHandler.new(DAO.address, proxyForFeeHandler.address, network.address, KNC.address, burnBlockInterval);

            //init tradeLogic
            tradeLogic = await TradeLogic.new(admin);
            await tradeLogic.setNetworkContract(network.address, {from: admin});

            //setup network
            await network.addOperator(operator, {from: admin});
            await network.addKyberProxy(networkProxy, {from: admin});
            await network.setContracts(feeHandler.address, tradeLogic.address, zeroAddress, {from: admin});
            await network.setDAOContract(DAO.address, {from: admin});
            //set params, enable network
            await network.setParams(gasPrice, negligibleRateDiffBps, {from: admin});
            await network.setEnable(true, {from: admin});
        });

        it("should test events declared in network contract", async() => {
            let tempNetwork = await KyberNetwork.new(admin);
            let tempTradeLogic = await TradeLogic.new(admin);
            let mockReserve = await MockReserve.new();

            await tempNetwork.addOperator(operator, {from: admin});
            await tempTradeLogic.setNetworkContract(tempNetwork.address, {from: admin});
            let ethSender = accounts[9];

            txResult = await tempNetwork.send(ethSrcQty, {from: ethSender});
            expectEvent(txResult, 'EtherReceival', {
                sender: ethSender,
                amount: ethSrcQty
            });

            let gasHelperAdd = accounts[9];

            txResult = await tempNetwork.setContracts(feeHandler.address, tempTradeLogic.address, gasHelperAdd, {from: admin});
            expectEvent(txResult, 'FeeHandlerUpdated', {
                newHandler: feeHandler.address
            });
            expectEvent(txResult, 'TradeLogicUpdated', {
                tradeLogic: tempTradeLogic.address
            });
            expectEvent(txResult, 'GasHelperUpdated', {
                gasHelper: gasHelperAdd
            });

            txResult = await tempNetwork.addReserve(mockReserve.address, nwHelper.genReserveID(MOCK_ID, mockReserve.address), true, taker, {from: operator});
            //TODO: reserveId returned by txResult has additional zeroes appended
            txResult.logs[0].args[1] = txResult.logs[0].args['1'].substring(0,18);
            txResult.logs[0].args['reserveId'] = txResult.logs[0].args['reserveId'].substring(0,18);
            expectEvent(txResult, 'AddReserveToNetwork', {
                reserve: mockReserve.address,
                reserveId: nwHelper.genReserveID(MOCK_ID, mockReserve.address).toLowerCase(),
                isFeePaying: true,
                rebateWallet: taker,
                add: true
            });

            //TODO: RemoveReserveFromNetwork
            //TODO: ListReservePairs
            //TODO: DAOContractSet 
            //TODO: KyberNetworkParamsSet
            //TODO: KyberNetworkSetEnable
            //TODO: KyberProxyAdded
            //TODO: KyberProxyRemoved
            //TODO: HandlePlatformFee
            //TODO: KyberTrade
        });

        it("should test enabling network", async() => {
            let result = await network.getNetworkData();
            let isEnabled = result.networkEnabled;
            assert.equal(isEnabled, true);
    
            await network.setEnable(false, {from: admin});
    
            result = await network.getNetworkData();
            isEnabled = result.networkEnabled;
            assert.equal(isEnabled, false);
    
            await network.setEnable(true, {from: admin});
        });

        describe("test with 2 mock reserves, zero rate", async() => {
            before("setup, add and list mock reserves", async() => {
                //init reserves
                let result = await nwHelper.setupReserves(network, tokens, 2,0,0,0, accounts, admin, operator);
                
                reserveInstances = result.reserveInstances;
                numReserves += result.numAddedReserves * 1;

                //add and list pair for reserve
                await nwHelper.addReservesToNetwork(network, reserveInstances, tokens, operator);

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
                await nwHelper.removeReservesFromNetwork(network, reserveInstances, tokens, operator);
                reserveInstances = {};
            });

            it("should return 0 rate if src == dest token", async() => {
                actualResult = await network.getExpectedRate(srcToken.address, srcToken.address, srcQty);
                Helper.assertEqual(actualResult.expectedRate, zeroBN, "expected rate not 0");
                Helper.assertEqual(actualResult.worstRate, zeroBN, "worst rate not 0");
    
                actualResult = await network.getExpectedRateWithHintAndFee(srcToken.address, srcToken.address, srcQty, platformFeeBps, emptyHint);
                Helper.assertEqual(actualResult.expectedRate, zeroBN, "expected rate not 0");
                Helper.assertEqual(actualResult.worstRate, zeroBN, "worst rate not 0");
    
                //query ETH -> ETH
                actualResult = await network.getExpectedRate(ethAddress, ethAddress, ethSrcQty);
                Helper.assertEqual(actualResult.expectedRate, zeroBN, "expected rate not 0");
                Helper.assertEqual(actualResult.worstRate, zeroBN, "worst rate not 0");
    
                actualResult = await network.getExpectedRateWithHintAndFee(ethAddress, ethAddress, ethSrcQty, platformFeeBps, emptyHint);
                Helper.assertEqual(actualResult.expectedRate, zeroBN, "expected rate not 0");
                Helper.assertEqual(actualResult.worstRate, zeroBN, "worst rate not 0");
            });
    
            it("should return 0 rate for unlisted token", async() => {
                let unlistedSrcToken = await TestToken.new("test", "tst", 18);
                let unlistedDestToken = await TestToken.new("test", "tst", 18);
    
                actualResult = await network.getExpectedRateWithHintAndFee(unlistedSrcToken.address, ethAddress, ethSrcQty, platformFeeBps, emptyHint);
                Helper.assertEqual(actualResult.rateNoFees, zeroBN, "expected rate not 0");
                Helper.assertEqual(actualResult.rateAfterNetworkFees, zeroBN, "rate with network fee not 0");
                Helper.assertEqual(actualResult.rateAfterAllFees, zeroBN, "rate with all fees not 0");
    
                actualResult = await network.getExpectedRateWithHintAndFee(ethAddress, unlistedDestToken.address, ethSrcQty, platformFeeBps, emptyHint);
                Helper.assertEqual(actualResult.rateNoFees, zeroBN, "expected rate not 0");
                Helper.assertEqual(actualResult.rateAfterNetworkFees, zeroBN, "rate with network fee not 0");
                Helper.assertEqual(actualResult.rateAfterAllFees, zeroBN, "rate with all fees not 0");
    
                actualResult = await network.getExpectedRateWithHintAndFee(unlistedSrcToken.address, unlistedDestToken.address, ethSrcQty, platformFeeBps, emptyHint);
                Helper.assertEqual(actualResult.rateNoFees, zeroBN, "expected rate not 0");
                Helper.assertEqual(actualResult.rateAfterNetworkFees, zeroBN, "rate with network fee not 0");
                Helper.assertEqual(actualResult.rateAfterAllFees, zeroBN, "rate with all fees not 0");
            });

            it("expected rate (different hint types) should be zero if all reserves return zero rate", async() => {
                for (hintType of tradeTypesArray) {
                    hint = await nwHelper.getHint(network, tradeLogic, reserveInstances, hintType, undefined, srcToken.address, ethAddress, srcQty);
                    actualResult = await network.getExpectedRateWithHintAndFee(srcToken.address, ethAddress, srcQty, platformFeeBps, hint);
                    Helper.assertEqual(actualResult.rateNoFees, zeroBN, "expected rate not 0");
                    Helper.assertEqual(actualResult.rateAfterNetworkFees, zeroBN, "rate with network fee not 0");
                    Helper.assertEqual(actualResult.rateAfterAllFees, zeroBN, "rate with all fees not 0");

                    hint = await nwHelper.getHint(network, tradeLogic, reserveInstances, hintType, undefined, ethAddress, destToken.address, ethSrcQty);
                    actualResult = await network.getExpectedRateWithHintAndFee(ethAddress, destToken.address, ethSrcQty, platformFeeBps, emptyHint);
                    Helper.assertEqual(actualResult.rateNoFees, zeroBN, "expected rate not 0");
                    Helper.assertEqual(actualResult.rateAfterNetworkFees, zeroBN, "rate with network fee not 0");
                    Helper.assertEqual(actualResult.rateAfterAllFees, zeroBN, "rate with all fees not 0");

                    hint = await nwHelper.getHint(network, tradeLogic, reserveInstances, MASK_IN_HINTTYPE, undefined, srcToken.address, destToken.address, srcQty);
                    actualResult = await network.getExpectedRateWithHintAndFee(srcToken.address, destToken.address, srcQty, platformFeeBps, emptyHint);
                    Helper.assertEqual(actualResult.rateNoFees, zeroBN, "expected rate not 0");
                    Helper.assertEqual(actualResult.rateAfterNetworkFees, zeroBN, "rate with network fee not 0");
                    Helper.assertEqual(actualResult.rateAfterAllFees, zeroBN, "rate with all fees not 0");
                }
            });
        });

        describe("test with 3 mock reserves", async() => {
            before("setup, add and list reserves", async() => {
                //init reserves
                let result = await nwHelper.setupReserves(network, tokens, 3, 0, 0, 0, accounts, admin, operator);
                
                reserveInstances = result.reserveInstances;
                numReserves += result.numAddedReserves * 1;              
                
                //add and list pair for reserve
                await nwHelper.addReservesToNetwork(network, reserveInstances, tokens, operator);
            })

            after("unlist and remove reserve", async() => {
                await nwHelper.removeReservesFromNetwork(network, reserveInstances, tokens, operator);
                reserveInstances = {};
            });
            
            it("should get expected rate, no fees at all for T2E, E2T & T2T", async() => {
            });

            it("should get expected rate (no hint, backwards compatible) for T2E, E2T & T2T", async() => {
                for (platformFee of platformFeeArray) {
                    info = [srcQty, takerFeeBps, platformFee];
                    expectedResult = await tradeLogic.calcRatesAndAmounts(srcToken.address, ethAddress, srcDecimals, ethDecimals, info, emptyHint);
                    expectedResult = await nwHelper.unpackRatesAndAmounts(srcQty, srcDecimals, ethDecimals, expectedResult);
                    actualResult = await network.getExpectedRate(srcToken.address, ethAddress, srcQty);
                    Helper.assertEqual(expectedResult.rateAfterNetworkFees, actualResult.expectedRate, "expected rate with network fee != actual rate for T2E");
            
                    info = [ethSrcQty, takerFeeBps, platformFee];
                    expectedResult = await tradeLogic.calcRatesAndAmounts(ethAddress, destToken.address, ethDecimals, destDecimals, info, emptyHint);
                    expectedResult = await nwHelper.unpackRatesAndAmounts(ethSrcQty, ethDecimals, destDecimals, expectedResult);
                    actualResult = await network.getExpectedRate(ethAddress, destToken.address, ethSrcQty);
                    Helper.assertEqual(expectedResult.rateAfterNetworkFees, actualResult.expectedRate, "expected rate with network fee != actual rate for E2T");
            
                    info = [srcQty, takerFeeBps, platformFee];
                    expectedResult = await tradeLogic.calcRatesAndAmounts(srcToken.address, destToken.address, srcDecimals, destDecimals, info, emptyHint);
                    expectedResult = await nwHelper.unpackRatesAndAmounts(srcQty, srcDecimals, destDecimals, expectedResult);
                    actualResult = await network.getExpectedRate(srcToken.address, destToken.address, srcQty);
                    Helper.assertEqual(expectedResult.rateAfterNetworkFees, actualResult.expectedRate, "expected rate with network fee != actual rate for T2T");
                }
            });
    
            it("should get expected rate (different hint types & different platform fees) for T2E, E2T & T2T", async() => {
                for (platformFee of platformFeeArray) {
                    for (hintType of tradeTypesArray) {
                        // console.log(`Testing getting rates for hint type: ${tradeStr[hintType]} with platform fee :${platformFee.toString()} bps`);
                        hint = await nwHelper.getHint(network, tradeLogic, reserveInstances, hintType, undefined, srcToken.address, ethAddress, srcQty);
                        info = [srcQty, takerFeeBps, platformFee];
                        expectedResult = await tradeLogic.calcRatesAndAmounts(srcToken.address, ethAddress, srcDecimals, ethDecimals, info, hint);
                        expectedResult = await nwHelper.unpackRatesAndAmounts(srcQty, srcDecimals, ethDecimals, expectedResult);
                        actualResult = await network.getExpectedRateWithHintAndFee(srcToken.address, ethAddress, srcQty, platformFee, hint);
                        nwHelper.assertRatesEqual(expectedResult, actualResult);

                        hint = await nwHelper.getHint(network, tradeLogic, reserveInstances, hintType, undefined, ethAddress, destToken.address, ethSrcQty);
                        info = [ethSrcQty, takerFeeBps, platformFee];
                        expectedResult = await tradeLogic.calcRatesAndAmounts(ethAddress, destToken.address, ethDecimals, destDecimals, info, hint);
                        expectedResult = await nwHelper.unpackRatesAndAmounts(ethSrcQty, ethDecimals, destDecimals, expectedResult);
                        actualResult = await network.getExpectedRateWithHintAndFee(ethAddress, destToken.address, ethSrcQty, platformFee, hint);
                        nwHelper.assertRatesEqual(expectedResult, actualResult);

                        hint = await nwHelper.getHint(network, tradeLogic, reserveInstances, MASK_IN_HINTTYPE, undefined, srcToken.address, destToken.address, srcQty);
                        info = [srcQty, takerFeeBps, platformFee];
                        expectedResult = await tradeLogic.calcRatesAndAmounts(srcToken.address, destToken.address, srcDecimals, destDecimals, info, hint);
                        expectedResult = await nwHelper.unpackRatesAndAmounts(srcQty, srcDecimals, destDecimals, expectedResult);
                        actualResult = await network.getExpectedRateWithHintAndFee(srcToken.address, destToken.address, srcQty, platformFee, hint);
                        nwHelper.assertRatesEqual(expectedResult, actualResult);
                    }
                }
            });

            it("should get expected rate (different hints types & different platform fees) for T2E, E2T & T2T", async() => {
                for (platformFee of platformFeeArray) {
                    for (hintType of tradeTypesArray) {
                        // console.log(`Testing getting rates for hint type: ${tradeStr[hintType]}`);
                        hint = await nwHelper.getHint(network, tradeLogic, reserveInstances, hintType, undefined, srcToken.address, ethAddress, srcQty);
                        info = [srcQty, takerFeeBps, platformFee];
                        expectedResult = await tradeLogic.calcRatesAndAmounts(srcToken.address, ethAddress, srcDecimals, ethDecimals, info, hint);
                        expectedResult = await nwHelper.unpackRatesAndAmounts(srcQty, srcDecimals, ethDecimals, expectedResult);
                        actualResult = await network.getExpectedRateWithHintAndFee(srcToken.address, ethAddress, srcQty, platformFee, hint);
                        nwHelper.assertRatesEqual(expectedResult, actualResult);

                        hint = await nwHelper.getHint(network, tradeLogic, reserveInstances, hintType, undefined, ethAddress, destToken.address, ethSrcQty);
                        info = [ethSrcQty, takerFeeBps, platformFee];
                        expectedResult = await tradeLogic.calcRatesAndAmounts(ethAddress, destToken.address, ethDecimals, destDecimals, info, hint);
                        expectedResult = await nwHelper.unpackRatesAndAmounts(ethSrcQty, ethDecimals, destDecimals, expectedResult);
                        actualResult = await network.getExpectedRateWithHintAndFee(ethAddress, destToken.address, ethSrcQty, platformFee, hint);
                        nwHelper.assertRatesEqual(expectedResult, actualResult);

                        hint = await nwHelper.getHint(network, tradeLogic, reserveInstances, MASK_IN_HINTTYPE, undefined, srcToken.address, destToken.address, srcQty);
                        info = [srcQty, takerFeeBps, platformFee];
                        expectedResult = await tradeLogic.calcRatesAndAmounts(srcToken.address, destToken.address, srcDecimals, destDecimals, info, hint);
                        expectedResult = await nwHelper.unpackRatesAndAmounts(srcQty, srcDecimals, destDecimals, expectedResult);
                        actualResult = await network.getExpectedRateWithHintAndFee(srcToken.address, destToken.address, srcQty, platformFee, hint);
                        nwHelper.assertRatesEqual(expectedResult, actualResult);
                    }
                }
            });

            xit("should test get all rates for token without fee", async() => {
                // TODO: get rates from trade logic. verify with, without fees 

                let ratesForToken = await network.getPricesForToken(tokens[0].address, 0);

                console.log("rates for token: " + tokens[0].address);
                console.log('ratesForToken');

                console.log('ratesForToken.buyRates')

                console.log(ratesForToken.buyRates[0].valueOf().toString())
                console.log(ratesForToken.buyRates[1].valueOf().toString())
                console.log(ratesForToken.buyRates[2].valueOf().toString())
                console.log(ratesForToken.buyRates[3].valueOf().toString())
            });

            it("should perform a T2E trade (backwards compatible, different hint types) and check balances change as expected", async() => {
                for (hintType of tradeTypesArray) {
                    info = [srcQty, takerFeeBps, zeroBN];
                    hint = await nwHelper.getHint(network, tradeLogic, reserveInstances, hintType, undefined, srcToken.address, ethAddress, srcQty);
                    expectedResult = await tradeLogic.calcRatesAndAmounts(srcToken.address, ethAddress, srcDecimals, ethDecimals, info, hint);
                    expectedResult = await nwHelper.unpackRatesAndAmounts(srcQty, srcDecimals, ethDecimals, expectedResult);

                    await srcToken.transfer(network.address, srcQty);
                    let initialReserveBalances = await nwHelper.getReserveBalances(srcToken, ethAddress, expectedResult);
                    let initialTakerBalances = await nwHelper.getTakerBalances(srcToken, ethAddress, taker, network.address);

                    let txResult = await network.tradeWithHint(networkProxy, srcToken.address, srcQty, ethAddress, taker, 
                        maxDestAmt, minConversionRate, platformWallet, hint);
                    console.log(`token -> ETH (${tradeStr[hintType]}): ${txResult.receipt.gasUsed} gas used`);

                    await nwHelper.compareBalancesAfterTrade(srcToken, ethAddress, srcQty, 
                        initialReserveBalances, initialTakerBalances, expectedResult, taker, network.address);
                }
            });

            it("should perform a E2T trade (backwards compatible, different hint types) and check balances change as expected", async() => {
                for (hintType of tradeTypesArray) {
                    hint = await nwHelper.getHint(network, tradeLogic, reserveInstances, hintType, undefined, ethAddress, destToken.address, ethSrcQty);
                    info = [ethSrcQty, takerFeeBps, zeroBN];
                    expectedResult = await tradeLogic.calcRatesAndAmounts(ethAddress, destToken.address, ethDecimals, destDecimals, info, hint);
                    expectedResult = await nwHelper.unpackRatesAndAmounts(ethSrcQty, ethDecimals, destDecimals, expectedResult);

                    let initialReserveBalances = await nwHelper.getReserveBalances(ethAddress, destToken, expectedResult);
                    let initialTakerBalances = await nwHelper.getTakerBalances(ethAddress, destToken, taker, networkProxy);

                    let txResult = await network.tradeWithHint(networkProxy, ethAddress, ethSrcQty, destToken.address, taker, 
                        maxDestAmt, minConversionRate, platformWallet, hint, {value: ethSrcQty});
                    console.log(`ETH -> token (${tradeStr[hintType]}): ${txResult.receipt.gasUsed} gas used`);

                    await nwHelper.compareBalancesAfterTrade(ethAddress, destToken, ethSrcQty, 
                        initialReserveBalances, initialTakerBalances, expectedResult, taker, undefined);
                }
            });

            it("should perform a T2T trade (backwards compatible, different hint types) and check balances change as expected", async() => {
                for (hintType of tradeTypesArray) {
                    hint = await nwHelper.getHint(network, tradeLogic, reserveInstances, hintType, undefined, srcToken.address, destToken.address, srcQty);
                    info = [srcQty, takerFeeBps, zeroBN];
                    expectedResult = await tradeLogic.calcRatesAndAmounts(srcToken.address, destToken.address, srcDecimals, destDecimals, info, hint);
                    expectedResult = await nwHelper.unpackRatesAndAmounts(srcQty, srcDecimals, destDecimals, expectedResult);
                    
                    await srcToken.transfer(network.address, srcQty);
                    let initialReserveBalances = await nwHelper.getReserveBalances(srcToken, destToken, expectedResult);
                    let initialTakerBalances = await nwHelper.getTakerBalances(srcToken, destToken, taker, network.address);

                    let txResult = await network.tradeWithHint(networkProxy, srcToken.address, srcQty, destToken.address, taker, 
                        maxDestAmt, minConversionRate, platformWallet, hint);
                    console.log(`token -> token (${tradeStr[hintType]}): ${txResult.receipt.gasUsed} gas used`);

                    await nwHelper.compareBalancesAfterTrade(srcToken, destToken, srcQty, 
                        initialReserveBalances, initialTakerBalances, expectedResult, taker, network.address);
                }
            });

            it("should perform a T2E trade (different hint types & different platform fees) and check balances change as expected", async() => {
                for (platformFee of platformFeeArray) {
                    for (hintType of tradeTypesArray) {
                        info = [srcQty, takerFeeBps, platformFee];
                        hint = await nwHelper.getHint(network, tradeLogic, reserveInstances, hintType, undefined, srcToken.address, ethAddress, srcQty);
                        expectedResult = await tradeLogic.calcRatesAndAmounts(srcToken.address, ethAddress, srcDecimals, ethDecimals, info, hint);
                        expectedResult = await nwHelper.unpackRatesAndAmounts(srcQty, srcDecimals, ethDecimals, expectedResult);
                        
                        await srcToken.transfer(network.address, srcQty);
                        let initialReserveBalances = await nwHelper.getReserveBalances(srcToken, ethAddress, expectedResult);
                        let initialTakerBalances = await nwHelper.getTakerBalances(srcToken, ethAddress, taker, network.address);

                        let txResult = await network.tradeWithHintAndFee(networkProxy, srcToken.address, srcQty, ethAddress, taker, 
                            maxDestAmt, minConversionRate, platformWallet, platformFee, hint);
                        console.log(`token -> ETH (${tradeStr[hintType]}): ${txResult.receipt.gasUsed} gas used`);

                        await nwHelper.compareBalancesAfterTrade(srcToken, ethAddress, srcQty, 
                            initialReserveBalances, initialTakerBalances, expectedResult, taker, network.address);
                    }
                }
            });
        
            it("should perform a E2T trade (different hint types & different platform fees) and check balances change as expected", async() => {
                for (platformFee of platformFeeArray) {
                    for (hintType of tradeTypesArray) {
                        hint = await nwHelper.getHint(network, tradeLogic, reserveInstances, hintType, undefined, ethAddress, destToken.address, ethSrcQty);
                        info = [ethSrcQty, takerFeeBps, platformFee];
                        expectedResult = await tradeLogic.calcRatesAndAmounts(ethAddress, destToken.address, ethDecimals, destDecimals, info, hint);
                        expectedResult = await nwHelper.unpackRatesAndAmounts(ethSrcQty, ethDecimals, destDecimals, expectedResult);

                        let initialReserveBalances = await nwHelper.getReserveBalances(ethAddress, destToken, expectedResult);
                        let initialTakerBalances = await nwHelper.getTakerBalances(ethAddress, destToken, taker, networkProxy);

                        let txResult = await network.tradeWithHintAndFee(networkProxy, ethAddress, ethSrcQty, destToken.address, taker, 
                            maxDestAmt, minConversionRate, platformWallet, platformFee, hint, {value: ethSrcQty});
                        console.log(`ETH -> token (${tradeStr[hintType]}): ${txResult.receipt.gasUsed} gas used`);

                        await nwHelper.compareBalancesAfterTrade(ethAddress, destToken, ethSrcQty, 
                            initialReserveBalances, initialTakerBalances, expectedResult, taker, undefined);
                    }
                }
            });

            it("should perform a T2T trade (different hint types & different platform fees) and check balances change as expected", async() => {
                for (platformFee of platformFeeArray) {
                    for (hintType of tradeTypesArray) {
                        hint = await nwHelper.getHint(network, tradeLogic, reserveInstances, hintType, undefined, srcToken.address, destToken.address, srcQty);
                        info = [srcQty, takerFeeBps, platformFee];
                        expectedResult = await tradeLogic.calcRatesAndAmounts(srcToken.address, destToken.address, srcDecimals, destDecimals, info, hint);
                        expectedResult = await nwHelper.unpackRatesAndAmounts(srcQty, srcDecimals, destDecimals, expectedResult);
                        
                        await srcToken.transfer(network.address, srcQty);
                        let initialReserveBalances = await nwHelper.getReserveBalances(srcToken, destToken, expectedResult);
                        let initialTakerBalances = await nwHelper.getTakerBalances(srcToken, destToken, taker, network.address);

                        let txResult = await network.tradeWithHintAndFee(networkProxy, srcToken.address, srcQty, destToken.address, taker, 
                            maxDestAmt, minConversionRate, platformWallet, platformFee, hint);
                        console.log(`token -> token (${tradeStr[hintType]}): ${txResult.receipt.gasUsed} gas used`);

                        await nwHelper.compareBalancesAfterTrade(srcToken, destToken, srcQty, 
                            initialReserveBalances, initialTakerBalances, expectedResult, taker, network.address);
                    }
                }
            });

            it("should perform T2E trades (diff hint types) with platform fee and check fee wallet receives platform fee", async() => {
                let platformFeeBps = new BN(50);
                for (hintType of tradeTypesArray) {
                    info = [srcQty, takerFeeBps, platformFee];
                    hint = await nwHelper.getHint(network, tradeLogic, reserveInstances, hintType, undefined, srcToken.address, ethAddress, srcQty);
                    expectedResult = await tradeLogic.calcRatesAndAmounts(srcToken.address, ethAddress, srcDecimals, ethDecimals, info, hint);
                    expectedResult = await nwHelper.unpackRatesAndAmounts(srcQty, srcDecimals, ethDecimals, expectedResult);

                    let initialBalance = await Helper.getBalancePromise(platformWallet);
                    await srcToken.transfer(network.address, srcQty);
                    let txResult = await network.tradeWithHintAndFee(networkProxy, srcToken.address, srcQty, ethAddress, taker, 
                        maxDestAmt, minConversionRate, platformWallet, platformFee, hint);

                    let expectedBalance = initialBalance.add(expectedResult.platformFeeWei);
                    let actualBalance = await Helper.getBalancePromise(platformWallet);
                    await Helper.assertEqual(expectedBalance, actualBalance, "platform fee did not receive fees");
                }
            });
        });

        describe("test trades with very small and very big numbers", async() => {
        });

        it("test contract addresses for fee handler and DAO", async() => {
            let contracts = await network.getContracts();
            Helper.assertEqual(contracts[0], DAO.address)
            Helper.assertEqual(contracts[1], feeHandler.address)
            Helper.assertEqual(contracts[2], tradeLogic.address);
        });
    
        it("test encode decode taker fee data with mock setter getter", async() => {
            let tempNetwork = await MockNetwork.new(admin);
            await tempNetwork.setContracts(feeHandler.address, tradeLogic.address, 
                zeroAddress, {from: admin});
    
            let networkData = await tempNetwork.getNetworkData();
         
            await tempNetwork.getAndUpdateTakerFee();
            networkData = await tempNetwork.getNetworkData();
            Helper.assertEqual(networkData.takerFeeBps, defaultNetworkFeeBps);
            
            let newFee = new BN(35);
            let newExpiryBlock = new BN(723);
            await tempNetwork.setTakerFeeData(newFee, newExpiryBlock);
    
            networkData = await tempNetwork.getNetworkData();
            Helper.assertEqual(networkData[3], newFee);
            
            let takerFeeData = await tempNetwork.getTakerFeeData();
            Helper.assertEqual(takerFeeData[0], newFee);
            Helper.assertEqual(takerFeeData[1], newExpiryBlock);
        });
        
        it("update fee in DAO and see updated in network on correct block", async() => {
            //TODO:
        });
    });

    describe("test fee handler integrations with 2 mock reserves", async() => {
        let platformFee = new BN(200);
        let takerFeeBps;
        let rebateBps;
        let reserveIdToWallet = [];
        let rebateWallets;

        before("setup, add and list mock reserves", async() => {
            //init reserves
            rebateWallets = [accounts[7], accounts[8]];

            let result = await nwHelper.setupReserves(network, tokens, 2,0,0,0, accounts, admin, operator, rebateWallets);

            reserveInstances = result.reserveInstances;
            numReserves += result.numAddedReserves * 1;
            reserveIdToWallet = result.reserveIdToRebateWallet;

            //add and list pair for reserve
            await nwHelper.addReservesToNetwork(network, reserveInstances, tokens, operator);
        });

        after("unlist and remove reserve", async() => {
            await nwHelper.removeReservesFromNetwork(network, reserveInstances, tokens, operator);
            reserveInstances = {};
        });

        beforeEach("update fee values", async() => {
            await network.getAndUpdateTakerFee();
            const data = await network.getNetworkData();
            takerFeeBps = data.takerFeeBps;
            const BRRData = await feeHandler.decodeBRRData();
            // log(BRRData)
            rebateBps = BRRData.rebateBPS;
        });

        it("et2 trade. see rebate per wallet updated in fee handler.", async() => {

            let BRRAmounts0 = await feeHandler.getTotalAmounts();
            let rebateWalletBalance0 = {};
            for (let i = 0; i < rebateWallets.length; i++) {
                rebateWalletBalance0[rebateWallets[i]] = await feeHandler.rebatePerWallet(rebateWallets[i]);
            } 
            let srcQty = oneEth;
            log("taker fee bps: " + takerFeeBps + " rebate bps: " + rebateBps);
            let expectedRebate = srcQty.mul(takerFeeBps).div(BPS).mul(rebateBps).div(BPS);
            let txResult = await network.tradeWithHintAndFee(networkProxy, ethAddress, srcQty, srcToken.address, taker, 
                maxDestAmt, minConversionRate, platformWallet, platformFee, '0x', {from: networkProxy, value: srcQty});

            let tradedReserve = txResult.logs[1].args.e2tIds[0];
            let rebateWallet = reserveIdToWallet[tradedReserve];
            log("tradedReserve " + tradedReserve)
            log("rebate wallet " + rebateWallet)

            let expectedBalance = rebateWalletBalance0[rebateWallet].add(expectedRebate);
            let actualBalance = await feeHandler.rebatePerWallet(rebateWallet);
            log("actual balance " + actualBalance);
            Helper.assertEqual(actualBalance, expectedBalance);
            
        });

        it("et2 trade. see total rebate updated in fee handler.", async() => {

            let BRRAmounts0 = await feeHandler.getTotalAmounts();

            let srcQty = oneEth;
            let txResult = await network.tradeWithHintAndFee(networkProxy, ethAddress, srcQty, srcToken.address, taker, 
                maxDestAmt, minConversionRate, platformWallet, platformFee, '0x', {from: networkProxy, value: srcQty});
            let expectedAddedRebate = srcQty.mul(takerFeeBps).div(BPS).mul(rebateBps).div(BPS);
            let expectedRebateAmount = BRRAmounts0.totalRebateWei.add(expectedAddedRebate);
            let BRRAmounts1 = await feeHandler.getTotalAmounts();
            Helper.assertEqual(BRRAmounts1.totalRebateWei, expectedRebateAmount);
        });
    });
})

async function transferTokensToNetwork(networkInstance) {
    for (let i = 0; i < numTokens; i++) {
        token = tokens[i];
        tokenAmountForTrades = new BN(10000).mul(new BN(10).pow(tokenDecimals[i]));
        //transfer tokens to network
        await token.transfer(networkInstance.address, tokenAmountForTrades);
    }
}

//returns random integer between min (inclusive) and max (inclusive)
function getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function log(str) {
    console.log(str);
}
