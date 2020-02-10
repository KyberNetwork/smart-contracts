const Web3 = require('web3');
const TestToken = artifacts.require("Token.sol");
const MockReserve = artifacts.require("MockReserve.sol");
const MockDao = artifacts.require("MockDAO.sol");
const KyberNetwork = artifacts.require("KyberNetwork.sol");
const MockNetwork = artifacts.require("MockNetwork.sol");
const FeeHandler = artifacts.require("FeeHandler.sol");
const TradeLogic = artifacts.require("KyberTradeLogic.sol");
const Reserve = artifacts.require("KyberReserve.sol");
const ConversionRates = artifacts.require("ConversionRates.sol");

const Helper = require("../v4/helper.js");

const BN = web3.utils.BN;
const { constants, expectEvent, expectRevert } = require('@openzeppelin/test-helpers');

//global variables
//////////////////
const precisionUnits = (new BN(10).pow(new BN(18)));
const ethDecimals = new BN(18);
const ethAddress = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
const zeroAddress = constants.ZERO_ADDRESS;
const gasPrice = (new BN(10).pow(new BN(9)).mul(new BN(50)));
const negligibleRateDiffBps = new BN(10); //0.01% 
const BPS = new BN(10000);
const maxDestAmt = new BN(2).pow(new BN(255));
const minConversionRate = new BN(0);
const emptyHint = '0x';

let takerFeeBps = new BN(20);
let platformFeeBps = new BN(0);
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
let user;
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
let reserveEtherInit = new BN(10).pow(new BN(18)).mul(new BN(2));
//// reserve types
let APR_ID = '0xaa000000';
let BRIDGE_ID  = '0xbb000000';
let MOCK_ID  = '0x22000000';
let FPR_ID = '0xff000000';

const type_apr = "TYPE_APR";
const type_MOCK = "TYPE_MOCK";
const type_fpr = "TYPE_FPR";

let pricingFpr = [];
let reserveFpr = [];
let gNumFprReserves;

let validRateDurationInBlocks = (new BN(9)).pow(new BN(21)); // some big number
let minimalRecordResolution = 1000000; //low resolution so I don't lose too much data. then easier to compare calculated imbalance values.
let maxPerBlockImbalance = precisionUnits.mul(new BN(10000)); // some big number
let maxTotalImbalance = maxPerBlockImbalance.mul(new BN(3));


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
let zeroBN = new BN(0);

//hint data
const MASK_IN_HINTTYPE = 0;
const MASK_OUT_HINTTYPE = 1;
const SPLIT_HINTTYPE = 2;

contract('KyberNetwork', function(accounts) {
    before("one time global init", async() => {
        //init accounts
        networkProxy = accounts[0];  // when using account 0 can avoid string ({from: proxy}) in trade call;
        operator = accounts[1];
        alerter = accounts[2];
        user = accounts[3];
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

    beforeEach("randomly select tokens before each test, reset takerFeeBps and platformFeeBps", async() => {
        srcTokenId = 0;
        destTokenId = 0;
        while (srcTokenId == destTokenId) {
            srcTokenId = getRandomInt(0,numTokens-1);
            destTokenId = getRandomInt(0,numTokens-1);
        }
        
        srcToken = tokens[srcTokenId];
        destToken = tokens[destTokenId];
        srcDecimals = tokenDecimals[srcTokenId];
        destDecimals = tokenDecimals[destTokenId];

        srcQty = new BN(100).mul(new BN(10).pow(srcDecimals));

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
            await network.setContracts(feeHandler.address, DAO.address, tradeLogic.address, {from: admin});

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

            txResult = await tempNetwork.setContracts(feeHandler.address, DAO.address, tempTradeLogic.address, {from: admin});
            expectEvent(txResult, 'FeeHandlerUpdated', {
                newHandler: feeHandler.address
            });
            //TODO: set new DAO. and see event.
            expectEvent(txResult, 'KyberDAOUpdated', {
                newDAO: DAO.address
            });
            expectEvent(txResult, 'TradeLogicUpdated', {
                tradeLogic: tempTradeLogic.address
            });

            txResult = await tempNetwork.addReserve(mockReserve.address, genReserveID(MOCK_ID, mockReserve.address), true, user, {from: operator});
            //TODO: reserveId returned by txResult has additional zeroes appended
            txResult.logs[0].args[1] = txResult.logs[0].args['1'].substring(0,18);
            txResult.logs[0].args['reserveId'] = txResult.logs[0].args['reserveId'].substring(0,18);
            expectEvent(txResult, 'AddReserveToNetwork', {
                reserve: mockReserve.address,
                reserveId: genReserveID(MOCK_ID, mockReserve.address).toLowerCase(),
                isFeePaying: true,
                rebateWallet: user,
                add: true
            });

            //TODO: RemoveReserveFromNetwork
            //TODO: ListReservePairs
            //TODO: FeeHandlerContractSet
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
                numReserves = await setupReserves(2,0,0,0, accounts);
                
                //add and list pair for reserve
                addReservesToNetwork(network, reserveInstances);

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
                removeReservesFromNetwork(network, reserveInstances);
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
                Helper.assertEqual(actualResult.expectedRateNoFees, zeroBN, "expected rate not 0");
                Helper.assertEqual(actualResult.expectedRateAfterNetworkFees, zeroBN, "rate with network fee not 0");
                Helper.assertEqual(actualResult.expectedRateAfterAllFees, zeroBN, "rate with all fees not 0");
    
                actualResult = await network.getExpectedRateWithHintAndFee(ethAddress, unlistedDestToken.address, ethSrcQty, platformFeeBps, emptyHint);
                Helper.assertEqual(actualResult.expectedRateNoFees, zeroBN, "expected rate not 0");
                Helper.assertEqual(actualResult.expectedRateAfterNetworkFees, zeroBN, "rate with network fee not 0");
                Helper.assertEqual(actualResult.expectedRateAfterAllFees, zeroBN, "rate with all fees not 0");
    
                actualResult = await network.getExpectedRateWithHintAndFee(unlistedSrcToken.address, unlistedDestToken.address, ethSrcQty, platformFeeBps, emptyHint);
                Helper.assertEqual(actualResult.expectedRateNoFees, zeroBN, "expected rate not 0");
                Helper.assertEqual(actualResult.expectedRateAfterNetworkFees, zeroBN, "rate with network fee not 0");
                Helper.assertEqual(actualResult.expectedRateAfterAllFees, zeroBN, "rate with all fees not 0");
            });

            it("expected rate (no hint) should be zero if all reserves return zero rate", async() => {
                actualResult = await network.getExpectedRateWithHintAndFee(srcToken.address, ethAddress, srcQty, platformFeeBps, emptyHint);
                Helper.assertEqual(actualResult.expectedRateNoFees, zeroBN, "expected rate not 0");
                Helper.assertEqual(actualResult.expectedRateAfterNetworkFees, zeroBN, "rate with network fee not 0");
                Helper.assertEqual(actualResult.expectedRateAfterAllFees, zeroBN, "rate with all fees not 0");

                actualResult = await network.getExpectedRateWithHintAndFee(ethAddress, destToken.address, ethSrcQty, platformFeeBps, emptyHint);
                Helper.assertEqual(actualResult.expectedRateNoFees, zeroBN, "expected rate not 0");
                Helper.assertEqual(actualResult.expectedRateAfterNetworkFees, zeroBN, "rate with network fee not 0");
                Helper.assertEqual(actualResult.expectedRateAfterAllFees, zeroBN, "rate with all fees not 0");

                actualResult = await network.getExpectedRateWithHintAndFee(srcToken.address, destToken.address, srcQty, platformFeeBps, emptyHint);
                Helper.assertEqual(actualResult.expectedRateNoFees, zeroBN, "expected rate not 0");
                Helper.assertEqual(actualResult.expectedRateAfterNetworkFees, zeroBN, "rate with network fee not 0");
                Helper.assertEqual(actualResult.expectedRateAfterAllFees, zeroBN, "rate with all fees not 0");
            });

            it("expected rate (mask in hint) should be zero if all reserves return zero rate", async() => {

            });

            it("expected rate (mask out hint) should be zero if all reserves return zero rate", async() => {

            });

            it("expected rate (split hint) should be zero if all reserves return zero rate", async() => {

            });
        });

        describe("test with 2 mock reserves and 2 fpr reserves", async() => {
            before("setup, add and list 1 mock reserve", async() => {
                //init reserves
                numReserves = await setupReserves(2,2,0,0, accounts);
                
                //add and list pair for reserve
                addReservesToNetwork(network, reserveInstances);
            })

            after("unlist and remove reserve", async() => {
                removeReservesFromNetwork(network, reserveInstances);
                reserveInstances = {};
            });

            xit("init fpr reserve and test trade and rates", async() => {
                let token = await TestToken.new("test", "tst", 18);
                let toks = [token];
                let tokensPerEther = precisionUnits.mul(new BN(2));
                let ethersPerToken = precisionUnits.div(new BN(2));
                let ethInit = new BN(10).mul(new BN(10).pow(new BN(18)));
                let pricing = await setupFprPricing(toks, 1, 1, tokensPerEther, ethersPerToken)
                let reserve = await setupFprReserve(toks, accounts[4], pricing.address, tokensPerEther, ethInit);
                await reserve.approveWithdrawAddress(token.address, accounts[4], true, {from: admin});
                await pricing.setReserveAddress(reserve.address, {from:admin});
                let ethBalance = await Helper.getBalancePromise(reserve.address);
                let tokenBalance = await token.balanceOf(reserve.address);
                console.log("reserve wei " + ethBalance + " eth " + ethBalance.div(precisionUnits));
                console.log("reserve twei " + tokenBalance + " tokens " + tokenBalance.div(precisionUnits));
                let qty = precisionUnits.mul(new BN(1));
                let block = await web3.eth.getBlockNumber();
                let rateE2t = await reserve.getConversionRate(ethAddress, token.address, qty, block);
                console.log('e2t rate: ' + rateE2t);
                let ratet2e = await reserve.getConversionRate(token.address, ethAddress, qty, block);
                console.log('t2e rate: ' + ratet2e);

                // test token wallet
                let wallet = await reserve.tokenWallet(token.address);
                console.log("token wallet: " + wallet);
                console.log("reserve address " + reserve.address);
                // test trade
                let networkME = accounts[7]
                
                let expectedQty = Helper.calcDstQty(qty, 18, 18, rateE2t)
                console.log("expect qty " + expectedQty);
                let allowance = await token.allowance(reserve.address, reserve.address);
                console.log("allowance " + allowance);
                await reserve.setContracts(networkME, pricing.address, zeroAddress, {from: admin});
                await reserve.trade(ethAddress, qty, token.address, networkME, rateE2t, true, {from: networkME, value: qty});

                let networkTokBalance = await token.balanceOf(networkME);
                console.log("network balance " + networkTokBalance);
                // Helper.assertEqual(networkTokBalance, expectedQty)

                await token.approve(reserve.address, networkTokBalance, {from: networkME});
                await reserve.trade(token.address, networkTokBalance, ethAddress, networkME, ratet2e, true, {from: networkME});

                networkTokBalance = await token.balanceOf(networkME);
                console.log("network balance " + networkTokBalance);
                Helper.assertEqual(networkTokBalance, 0);   
            });

            it("should get expected rate (no hint, with network fee) for T2E, E2T & T2T", async() => {
                reserveCandidates = await fetchReservesRatesFromNetwork(network, srcToken.address, srcQty, true);
                bestReserve = await getBestReserveAndRate(reserveCandidates, srcToken.address, ethAddress, srcQty, takerFeeBps);
                bestSellRateNoFee = bestReserve.rateNoFee;
                bestSellReserveFeePaying = bestReserve.isFeePaying;
                actualResult = await network.getExpectedRate(srcToken.address, ethAddress, srcQty);
                Helper.assertEqual(bestReserve.rateWithNetworkFee, actualResult.expectedRate, "expected rate with network fee != actual rate for T2E");
        
                reserveCandidates = await fetchReservesRatesFromNetwork(network, destToken.address, ethSrcQty, false);
                bestReserve = await getBestReserveAndRate(reserveCandidates, ethAddress, destToken.address, ethSrcQty, takerFeeBps);
                bestBuyRateNoFee = bestReserve.rateNoFee;
                bestBuyReserveFeePaying = bestReserve.isFeePaying;
                actualResult = await network.getExpectedRate(ethAddress, destToken.address, ethSrcQty);
                Helper.assertEqual(bestReserve.rateWithNetworkFee, actualResult.expectedRate, "expected rate with network fee != actual rate for E2T");
        
                //WRONG
                //100 srcTokens
                //1 srcToken = 0.000998 ETH (rate with network fee)
                //tradeWei: 0.0998 ETH
                //1 ETH = 2994 destTokens (rate with network fee)
                //receive 298.8012 destTokens 

                //RIGHT
                //100 srcTokens
                //1 srcToken = 0.001 ETH (rate with no fee)
                //tradeWei: 0.1 ETH - 0.0004 ETH = 0.0996 ETH
                //1 ETH = 3000 destTokens (rate with no fee)
                //receive 298.80 destTokens
                actualResult = await network.getExpectedRate(srcToken.address, destToken.address, srcQty);
                expectedWeiAmt = Helper.calcDstQty(srcQty, srcDecimals, ethDecimals, bestSellRateNoFee);
                expectedWeiAmt = minusNetworkFees(expectedWeiAmt, bestSellReserveFeePaying, bestBuyReserveFeePaying, takerFeeBps);
                expectedDestAmt = Helper.calcDstQty(expectedWeiAmt, ethDecimals, destDecimals, bestBuyRateNoFee);
                expectedRate = Helper.calcRateFromQty(srcQty, expectedDestAmt, srcDecimals, destDecimals);
                Helper.assertEqual(expectedRate, actualResult.expectedRate, "expected rate with network fee != actual rate for T2T");
            });
    
            it("should get expected rate (with mask in hint & 0 platform fees) for T2E, E2T & T2T", async() => {
                //T2E
                reserveCandidates = await fetchReservesRatesFromNetwork(network, srcToken.address, srcQty, true);
                hintedReservesT2E = applyHintToReserves(MASK_IN_HINTTYPE, reserveCandidates);
                bestReserve = await getBestReserveAndRate(hintedReservesT2E.reservesForFetchRate, srcToken.address, ethAddress, srcQty, takerFeeBps);
                bestSellRateNoFee = bestReserve.rateNoFee;
                bestSellReserveFeePaying = bestReserve.isFeePaying;

                hint = await tradeLogic.buildTokenToEthHint(hintedReservesT2E.tradeType, hintedReservesT2E.reservesForHint, hintedReservesT2E.splits);
                actualResult = await network.getExpectedRateWithHintAndFee(srcToken.address, ethAddress, srcQty, platformFeeBps, hint);
                Helper.assertEqual(actualResult.expectedRateNoFees, bestReserve.rateNoFee, "expected rate no fee != actual rate for T2E");
                Helper.assertEqual(actualResult.expectedRateAfterNetworkFees, bestReserve.rateWithNetworkFee, "expected rate with network fee != actual rate for T2E")
                Helper.assertEqual(actualResult.expectedRateAfterNetworkFees, actualResult.expectedRateAfterAllFees, "platform fee should be 0 bps");

                //E2T
                reserveCandidates = await fetchReservesRatesFromNetwork(network, destToken.address, ethSrcQty, false);
                hintedReservesE2T = applyHintToReserves(MASK_IN_HINTTYPE, reserveCandidates);
                bestReserve = await getBestReserveAndRate(hintedReservesE2T.reservesForFetchRate, ethAddress, destToken.address, ethSrcQty, takerFeeBps);
                bestBuyRateNoFee = bestReserve.rateNoFee;
                bestBuyReserveFeePaying = bestReserve.isFeePaying;

                hint = await tradeLogic.buildEthToTokenHint(hintedReservesE2T.tradeType, hintedReservesE2T.reservesForHint, hintedReservesE2T.splits);
                actualResult = await network.getExpectedRateWithHintAndFee(ethAddress, destToken.address, ethSrcQty, platformFeeBps, hint);
                Helper.assertEqual(actualResult.expectedRateNoFees, bestReserve.rateNoFee, "expected rate no fee != actual rate for E2T");
                Helper.assertEqual(actualResult.expectedRateAfterNetworkFees, bestReserve.rateWithNetworkFee, "expected rate with network fee != actual rate for E2T")
                Helper.assertEqual(actualResult.expectedRateAfterNetworkFees, actualResult.expectedRateAfterAllFees, "platform fee should be 0 bps");
                
                //T2T
                hint = await tradeLogic.buildTokenToTokenHint(
                    hintedReservesT2E.tradeType, hintedReservesT2E.reservesForHint, hintedReservesT2E.splits,
                    hintedReservesE2T.tradeType, hintedReservesE2T.reservesForHint, hintedReservesE2T.splits
                );
                actualResult = await network.getExpectedRateWithHintAndFee(srcToken.address, destToken.address, srcQty, platformFeeBps, hint);

                //No Fee
                expectedWeiAmt = Helper.calcDstQty(srcQty, srcDecimals, ethDecimals, bestSellRateNoFee);
                platformFeeWei = expectedWeiAmt.mul(platformFeeBps).div(BPS);
                expectedDestAmt = Helper.calcDstQty(expectedWeiAmt, ethDecimals, destDecimals, bestBuyRateNoFee);
                expectedRateNoFees = Helper.calcRateFromQty(srcQty, expectedDestAmt, srcDecimals, destDecimals);

                //With network fee
                expectedWeiAmt = minusNetworkFees(expectedWeiAmt, bestSellReserveFeePaying, bestBuyReserveFeePaying, takerFeeBps);
                expectedDestAmt = Helper.calcDstQty(expectedWeiAmt, ethDecimals, destDecimals, bestBuyRateNoFee);
                expectedRateAfterNetworkFees = Helper.calcRateFromQty(srcQty, expectedDestAmt, srcDecimals, destDecimals);

                //With network and platform fee
                expectedWeiAmt = expectedWeiAmt.sub(platformFeeWei);
                expectedDestAmt = Helper.calcDstQty(expectedWeiAmt, ethDecimals, destDecimals, bestBuyRateNoFee);
                expectedRateAfterAllFees = Helper.calcRateFromQty(srcQty, expectedDestAmt, srcDecimals, destDecimals);
                
                //compare expected rates
                Helper.assertEqual(actualResult.expectedRateNoFees, expectedRateNoFees, "expected rate no fee != actual rate for T2T");
                Helper.assertEqual(actualResult.expectedRateAfterNetworkFees, expectedRateAfterNetworkFees, "expected rate with network fee != actual rate for T2T")
                Helper.assertEqual(actualResult.expectedRateAfterAllFees, expectedRateAfterAllFees, "expected rate with all fees != actual rate for T2T");
            });

            it("should get expected rate (with mask in hint, network & platform fees) for T2E, E2T & T2T", async() => {
                platformFeeBps = new BN(100); //BPS should be 1%

                //T2E
                reserveCandidates = await fetchReservesRatesFromNetwork(network, srcToken.address, srcQty, true);
                hintedReservesT2E = applyHintToReserves(MASK_IN_HINTTYPE, reserveCandidates);
                bestReserve = await getBestReserveAndRate(hintedReservesT2E.reservesForFetchRate, srcToken.address, ethAddress, srcQty, takerFeeBps);
                bestSellRateNoFee = bestReserve.rateNoFee;
                bestSellReserveFeePaying = bestReserve.isFeePaying;

                hint = await tradeLogic.buildTokenToEthHint(hintedReservesT2E.tradeType, hintedReservesT2E.reservesForHint, hintedReservesT2E.splits);
                actualResult = await network.getExpectedRateWithHintAndFee(srcToken.address, ethAddress, srcQty, platformFeeBps, hint);
                Helper.assertEqual(actualResult.expectedRateNoFees, bestReserve.rateNoFee, "expected rate no fee != actual rate for T2E");
                Helper.assertEqual(actualResult.expectedRateAfterNetworkFees, bestReserve.rateWithNetworkFee, "expected rate with network fee != actual rate for T2E")
                //TODO: Fix this Helper.assertEqual(actualResult.expectedRateAfterNetworkFees, actualResult.expectedRateAfterAllFees, "platform fee should be 0 bps");

                //E2T
                reserveCandidates = await fetchReservesRatesFromNetwork(network, destToken.address, ethSrcQty, false);
                hintedReservesE2T = applyHintToReserves(MASK_IN_HINTTYPE, reserveCandidates);
                bestReserve = await getBestReserveAndRate(hintedReservesE2T.reservesForFetchRate, ethAddress, destToken.address, ethSrcQty, takerFeeBps);
                bestBuyRateNoFee = bestReserve.rateNoFee;
                bestBuyReserveFeePaying = bestReserve.isFeePaying;

                hint = await tradeLogic.buildEthToTokenHint(hintedReservesE2T.tradeType, hintedReservesE2T.reservesForHint, hintedReservesE2T.splits);
                actualResult = await network.getExpectedRateWithHintAndFee(ethAddress, destToken.address, ethSrcQty, platformFeeBps, hint);
                Helper.assertEqual(actualResult.expectedRateNoFees, bestReserve.rateNoFee, "expected rate no fee != actual rate for E2T");
                Helper.assertEqual(actualResult.expectedRateAfterNetworkFees, bestReserve.rateWithNetworkFee, "expected rate with network fee != actual rate for E2T")
                // TODO: fix this Helper.assertEqual(actualResult.expectedRateAfterNetworkFees, actualResult.expectedRateAfterAllFees, "platform fee should be 0 bps");
                
                //T2T
                hint = await tradeLogic.buildTokenToTokenHint(
                    hintedReservesT2E.tradeType, hintedReservesT2E.reservesForHint, hintedReservesT2E.splits,
                    hintedReservesE2T.tradeType, hintedReservesE2T.reservesForHint, hintedReservesE2T.splits
                );
                actualResult = await network.getExpectedRateWithHintAndFee(srcToken.address, destToken.address, srcQty, platformFeeBps, hint);

                //No Fee
                expectedWeiAmt = Helper.calcDstQty(srcQty, srcDecimals, ethDecimals, bestSellRateNoFee);
                platformFeeWei = expectedWeiAmt.mul(platformFeeBps).div(BPS);
                expectedDestAmt = Helper.calcDstQty(expectedWeiAmt, ethDecimals, destDecimals, bestBuyRateNoFee);
                expectedRateNoFees = Helper.calcRateFromQty(srcQty, expectedDestAmt, srcDecimals, destDecimals);

                //With network fee
                expectedWeiAmt = minusNetworkFees(expectedWeiAmt, bestSellReserveFeePaying, bestBuyReserveFeePaying, takerFeeBps);
                expectedDestAmt = Helper.calcDstQty(expectedWeiAmt, ethDecimals, destDecimals, bestBuyRateNoFee);
                expectedRateAfterNetworkFees = Helper.calcRateFromQty(srcQty, expectedDestAmt, srcDecimals, destDecimals);

                //With network and platform fee
                expectedWeiAmt = expectedWeiAmt.sub(platformFeeWei);
                expectedDestAmt = Helper.calcDstQty(expectedWeiAmt, ethDecimals, destDecimals, bestBuyRateNoFee);
                expectedRateAfterAllFees = Helper.calcRateFromQty(srcQty, expectedDestAmt, srcDecimals, destDecimals);
                
                //compare expected rates
                Helper.assertEqual(actualResult.expectedRateNoFees, expectedRateNoFees, "expected rate no fee != actual rate for T2T");
                Helper.assertEqual(actualResult.expectedRateAfterNetworkFees, expectedRateAfterNetworkFees, "expected rate with network fee != actual rate for T2T")
                Helper.assertEqual(actualResult.expectedRateAfterAllFees, expectedRateAfterAllFees, "expected rate with all fees != actual rate for T2T");
            });

            it("should get expected rate (with mask out hint & 0 platform fees) for T2E, E2T & T2T", async() => {
                //T2E
                reserveCandidates = await fetchReservesRatesFromNetwork(network, srcToken.address, srcQty, true);
                hintedReservesT2E = applyHintToReserves(MASK_OUT_HINTTYPE, reserveCandidates);
                bestReserve = await getBestReserveAndRate(hintedReservesT2E.reservesForFetchRate, srcToken.address, ethAddress, srcQty, takerFeeBps);
                bestSellRateNoFee = bestReserve.rateNoFee;
                bestSellReserveFeePaying = bestReserve.isFeePaying;

                hint = await tradeLogic.buildTokenToEthHint(hintedReservesT2E.tradeType, hintedReservesT2E.reservesForHint, hintedReservesT2E.splits);
                actualResult = await network.getExpectedRateWithHintAndFee(srcToken.address, ethAddress, srcQty, platformFeeBps, hint);
                Helper.assertEqual(actualResult.expectedRateNoFees, bestReserve.rateNoFee, "expected rate no fee != actual rate for T2E");
                Helper.assertEqual(actualResult.expectedRateAfterNetworkFees, bestReserve.rateWithNetworkFee, "expected rate with network fee != actual rate for T2E")
                Helper.assertEqual(actualResult.expectedRateAfterNetworkFees, actualResult.expectedRateAfterAllFees, "platform fee should be 0 bps");

                //E2T
                reserveCandidates = await fetchReservesRatesFromNetwork(network, destToken.address, ethSrcQty, false);
                hintedReservesE2T = applyHintToReserves(MASK_OUT_HINTTYPE, reserveCandidates);
                bestReserve = await getBestReserveAndRate(hintedReservesE2T.reservesForFetchRate, ethAddress, destToken.address, ethSrcQty, takerFeeBps);
                bestBuyRateNoFee = bestReserve.rateNoFee;
                bestBuyReserveFeePaying = bestReserve.isFeePaying;

                hint = await tradeLogic.buildEthToTokenHint(hintedReservesE2T.tradeType, hintedReservesE2T.reservesForHint, hintedReservesE2T.splits);
                actualResult = await network.getExpectedRateWithHintAndFee(ethAddress, destToken.address, ethSrcQty, platformFeeBps, hint);
                Helper.assertEqual(actualResult.expectedRateNoFees, bestReserve.rateNoFee, "expected rate no fee != actual rate for E2T");
                Helper.assertEqual(actualResult.expectedRateAfterNetworkFees, bestReserve.rateWithNetworkFee, "expected rate with network fee != actual rate for E2T")
                Helper.assertEqual(actualResult.expectedRateAfterNetworkFees, actualResult.expectedRateAfterAllFees, "platform fee should be 0 bps");
                
                //T2T
                hint = await tradeLogic.buildTokenToTokenHint(
                    hintedReservesT2E.tradeType, hintedReservesT2E.reservesForHint, hintedReservesT2E.splits,
                    hintedReservesE2T.tradeType, hintedReservesE2T.reservesForHint, hintedReservesE2T.splits
                );
                actualResult = await network.getExpectedRateWithHintAndFee(srcToken.address, destToken.address, srcQty, platformFeeBps, hint);

                //No Fee
                expectedWeiAmt = Helper.calcDstQty(srcQty, srcDecimals, ethDecimals, bestSellRateNoFee);
                platformFeeWei = expectedWeiAmt.mul(platformFeeBps).div(BPS);
                expectedDestAmt = Helper.calcDstQty(expectedWeiAmt, ethDecimals, destDecimals, bestBuyRateNoFee);
                expectedRateNoFees = Helper.calcRateFromQty(srcQty, expectedDestAmt, srcDecimals, destDecimals);

                //With network fee
                expectedWeiAmt = minusNetworkFees(expectedWeiAmt, bestSellReserveFeePaying, bestBuyReserveFeePaying, takerFeeBps);
                expectedDestAmt = Helper.calcDstQty(expectedWeiAmt, ethDecimals, destDecimals, bestBuyRateNoFee);
                expectedRateAfterNetworkFees = Helper.calcRateFromQty(srcQty, expectedDestAmt, srcDecimals, destDecimals);

                //With network and platform fee
                expectedWeiAmt = expectedWeiAmt.sub(platformFeeWei);
                expectedDestAmt = Helper.calcDstQty(expectedWeiAmt, ethDecimals, destDecimals, bestBuyRateNoFee);
                expectedRateAfterAllFees = Helper.calcRateFromQty(srcQty, expectedDestAmt, srcDecimals, destDecimals);
                
                //compare expected rates
                Helper.assertEqual(actualResult.expectedRateNoFees, expectedRateNoFees, "expected rate no fee != actual rate for T2T");
                Helper.assertEqual(actualResult.expectedRateAfterNetworkFees, expectedRateAfterNetworkFees, "expected rate with network fee != actual rate for T2T")
                Helper.assertEqual(actualResult.expectedRateAfterAllFees, expectedRateAfterAllFees, "expected rate with all fees != actual rate for T2T");
            });

            it("should get expected rate (with mask out hint, network & platform fees) for T2E, E2T & T2T", async() => {
                platformFeeBps = new BN(100); //BPS should be 1%

                //T2E
                reserveCandidates = await fetchReservesRatesFromNetwork(network, srcToken.address, srcQty, true);
                hintedReservesT2E = applyHintToReserves(MASK_OUT_HINTTYPE, reserveCandidates);
                bestReserve = await getBestReserveAndRate(hintedReservesT2E.reservesForFetchRate, srcToken.address, ethAddress, srcQty, takerFeeBps);
                bestSellRateNoFee = bestReserve.rateNoFee;
                bestSellReserveFeePaying = bestReserve.isFeePaying;

                hint = await tradeLogic.buildTokenToEthHint(hintedReservesT2E.tradeType, hintedReservesT2E.reservesForHint, hintedReservesT2E.splits);
                actualResult = await network.getExpectedRateWithHintAndFee(srcToken.address, ethAddress, srcQty, platformFeeBps, hint);
                Helper.assertEqual(actualResult.expectedRateNoFees, bestReserve.rateNoFee, "expected rate no fee != actual rate for T2E");
                Helper.assertEqual(actualResult.expectedRateAfterNetworkFees, bestReserve.rateWithNetworkFee, "expected rate with network fee != actual rate for T2E")
                //TODO: Fix this Helper.assertEqual(actualResult.expectedRateAfterNetworkFees, actualResult.expectedRateAfterAllFees, "platform fee should be 0 bps");

                //E2T
                reserveCandidates = await fetchReservesRatesFromNetwork(network, destToken.address, ethSrcQty, false);
                hintedReservesE2T = applyHintToReserves(MASK_OUT_HINTTYPE, reserveCandidates);
                bestReserve = await getBestReserveAndRate(hintedReservesE2T.reservesForFetchRate, ethAddress, destToken.address, ethSrcQty, takerFeeBps);
                bestBuyRateNoFee = bestReserve.rateNoFee;
                bestBuyReserveFeePaying = bestReserve.isFeePaying;

                hint = await tradeLogic.buildEthToTokenHint(hintedReservesE2T.tradeType, hintedReservesE2T.reservesForHint, hintedReservesE2T.splits);
                actualResult = await network.getExpectedRateWithHintAndFee(ethAddress, destToken.address, ethSrcQty, platformFeeBps, hint);
                Helper.assertEqual(actualResult.expectedRateNoFees, bestReserve.rateNoFee, "expected rate no fee != actual rate for E2T");
                Helper.assertEqual(actualResult.expectedRateAfterNetworkFees, bestReserve.rateWithNetworkFee, "expected rate with network fee != actual rate for E2T")
                // TODO: fix this Helper.assertEqual(actualResult.expectedRateAfterNetworkFees, actualResult.expectedRateAfterAllFees, "platform fee should be 0 bps");
                
                //T2T
                hint = await tradeLogic.buildTokenToTokenHint(
                    hintedReservesT2E.tradeType, hintedReservesT2E.reservesForHint, hintedReservesT2E.splits,
                    hintedReservesE2T.tradeType, hintedReservesE2T.reservesForHint, hintedReservesE2T.splits
                );
                actualResult = await network.getExpectedRateWithHintAndFee(srcToken.address, destToken.address, srcQty, platformFeeBps, hint);

                //No Fee
                expectedWeiAmt = Helper.calcDstQty(srcQty, srcDecimals, ethDecimals, bestSellRateNoFee);
                platformFeeWei = expectedWeiAmt.mul(platformFeeBps).div(BPS);
                expectedDestAmt = Helper.calcDstQty(expectedWeiAmt, ethDecimals, destDecimals, bestBuyRateNoFee);
                expectedRateNoFees = Helper.calcRateFromQty(srcQty, expectedDestAmt, srcDecimals, destDecimals);

                //With network fee
                expectedWeiAmt = minusNetworkFees(expectedWeiAmt, bestSellReserveFeePaying, bestBuyReserveFeePaying, takerFeeBps);
                expectedDestAmt = Helper.calcDstQty(expectedWeiAmt, ethDecimals, destDecimals, bestBuyRateNoFee);
                expectedRateAfterNetworkFees = Helper.calcRateFromQty(srcQty, expectedDestAmt, srcDecimals, destDecimals);

                //With network and platform fee
                expectedWeiAmt = expectedWeiAmt.sub(platformFeeWei);
                expectedDestAmt = Helper.calcDstQty(expectedWeiAmt, ethDecimals, destDecimals, bestBuyRateNoFee);
                expectedRateAfterAllFees = Helper.calcRateFromQty(srcQty, expectedDestAmt, srcDecimals, destDecimals);
                
                //compare expected rates
                Helper.assertEqual(actualResult.expectedRateNoFees, expectedRateNoFees, "expected rate no fee != actual rate for T2T");
                Helper.assertEqual(actualResult.expectedRateAfterNetworkFees, expectedRateAfterNetworkFees, "expected rate with network fee != actual rate for T2T")
                Helper.assertEqual(actualResult.expectedRateAfterAllFees, expectedRateAfterAllFees, "expected rate with all fees != actual rate for T2T");
            });

            it("should get expected rate (with split hint, network & 0 platform fees) for T2E, E2T & T2T", async() => {
                //TODO: write function for getting aggregated rates
            });

            it("should get expected rate (with split hint, network & platform fees) for T2E, E2T & T2T", async() => {
                //TODO: write function for getting aggregated rates
            });

            it("should test get all rates for token without fee", async() => {
                let ratesForToken = await network.getPricesForToken(tokens[0].address, 0);

                // console.log("rates for token: " + tokens[0].address);
                // console.log(ratesForToken);

                console.log('ratesForToken.buyRates')

                console.log(ratesForToken.buyRates[0].valueOf().toString())
                console.log(ratesForToken.buyRates[1].valueOf().toString())
                // console.log(ratesForToken.buyRates[2].valueOf().toString())
                // console.log(ratesForToken.buyRates[3].valueOf().toString())
                // TODO: get rates directly from reserves and compare with these returned rates.
            });


            it("should perform a token -> ETH trade (no hint) and check balances change as expected", async() => {
                reserveCandidates = await fetchReservesRatesFromNetwork(network, srcToken.address, srcQty, true);
                bestReserve = await getBestReserveAndRate(reserveCandidates, srcToken.address, ethAddress, srcQty, takerFeeBps);
                bestSellRateNoFee = bestReserve.rateNoFee;
                bestSellReserveFeePaying = bestReserve.isFeePaying;

                //get initial balances
                initialTokenReserveBalance = await srcToken.balanceOf(bestReserve.address);
                initialTokenUserBalance = await srcToken.balanceOf(network.address); //assume user sends to network already
                initialEtherReserveBalance = await Helper.getBalancePromise(bestReserve.address);
                initialEtherUserBalance = await Helper.getBalancePromise(user);

                rate = await network.getExpectedRateWithHintAndFee(srcToken.address, ethAddress, srcQty, platformFeeBps, emptyHint);
                expectedDestAmtNoFee = Helper.calcDstQty(srcQty, srcDecimals, ethDecimals, rate.expectedRateNoFees);
                expectedDestAmtAfterAllFees = Helper.calcDstQty(srcQty, srcDecimals, ethDecimals, rate.expectedRateAfterAllFees);

                //perform trade, give ETH to user
                txResult = await network.tradeWithHint(networkProxy, srcToken.address, srcQty, ethAddress, user, 
                    maxDestAmt, minConversionRate, platformWallet, emptyHint);
                console.log(`token -> ETH: ${txResult.receipt.gasUsed} gas used`);

                //compare balances
                //User: minus srcQty, plus expectedDestAmtAfterAllFees
                await assertSameTokenBalance(network.address, srcToken, initialTokenUserBalance.sub(srcQty));
                // await assertSameEtherBalance(user, initialEtherUserBalance.add(expectedDestAmtAfterAllFees));

                //Reserve: plus srcQty, minus expectedDestAmtNoFee
                await assertSameTokenBalance(bestReserve.address, srcToken, initialTokenReserveBalance.add(srcQty));
                await assertSameEtherBalance(bestReserve.address, initialEtherReserveBalance.sub(expectedDestAmtNoFee));
                //Platform wallet: plus platformFeeWei
                //Fee Burner: plus network fee wei
            });
        
            it("should perform a ETH -> token trade (no hint) and check balances change as expected", async() => {
                reserveCandidates = await fetchReservesRatesFromNetwork(network, destToken.address, ethSrcQty, false);
                bestReserve = await getBestReserveAndRate(reserveCandidates, ethAddress, destToken.address, ethSrcQty, takerFeeBps);
        
                //get initial balances
                initialTokenReserveBalance = await destToken.balanceOf(bestReserve.address);
                initialTokenUserBalance = await destToken.balanceOf(user);
                initialEtherReserveBalance = await Helper.getBalancePromise(bestReserve.address);
        
                rate = await network.getExpectedRateWithHintAndFee(ethAddress, destToken.address, ethSrcQty, platformFeeBps, emptyHint);
                expectedDestAmtAfterNetworkFees = Helper.calcDstQty(ethSrcQty, ethDecimals, destDecimals, rate.expectedRateAfterNetworkFees);
                expectedDestAmtAfterAllFees = Helper.calcDstQty(ethSrcQty, ethDecimals, destDecimals, rate.expectedRateAfterAllFees);
                expectedAddedEthForReserve = bestReserve.isFeePaying ? ethSrcQty.mul(BPS.sub(takerFeeBps)).div(BPS): ethSrcQty;

                //perform trade, give dest tokens to user
                txResult = await network.tradeWithHint(networkProxy, ethAddress, ethSrcQty, destToken.address, user, 
                    maxDestAmt, minConversionRate, platformWallet, emptyHint, {value: ethSrcQty});
                    console.log(`ETH -> token: ${txResult.receipt.gasUsed} gas used`);
        
                //compare balances
                //User: Minus ethSrcQty, plus expectedDestAmtAfterAllFees
                await assertSameTokenBalance(user, destToken, initialTokenUserBalance.add(expectedDestAmtAfterAllFees));
                //Reserve: Minus expectedDestAmtAfterNetworkFee, plus ethAfterNetworkFee (if fees apply)
                await assertSameEtherBalance(bestReserve.address, initialEtherReserveBalance.add(expectedAddedEthForReserve));
                await assertSameTokenBalance(bestReserve.address, destToken, initialTokenReserveBalance.sub(expectedDestAmtAfterNetworkFees));
            });
        
            //srcToken: (user -> sell reserve) => user bal goes down, sell reserve bal goes up
            //ETH: (sell -> buy reserve) => sell reserve bal goes down, buy reserve bal goes up
            //destToken: (buy reserve -> user) => bal goes down, user bal goes up
            it("should perform a token -> token trade (no hint) and check balances change as expected", async() => {
                reserveCandidates = await fetchReservesRatesFromNetwork(network, srcToken.address, srcQty, true);
                bestSellReserve = await getBestReserveAndRate(reserveCandidates, srcToken.address, ethAddress, srcQty, takerFeeBps);
                reserveCandidates = await fetchReservesRatesFromNetwork(network, destToken.address, ethSrcQty, false);
                bestBuyReserve = await getBestReserveAndRate(reserveCandidates, ethAddress, destToken.address, ethSrcQty, takerFeeBps);

                //initial balances
                initialSrcTokenUserBalance = await srcToken.balanceOf(network.address); //assume user gave funds to proxy already
                initialDestTokenUserBalance = await destToken.balanceOf(user);
                initialEtherSellReserveBalance = await Helper.getBalancePromise(bestSellReserve.address);
                initialSrcTokenSellReserveBalance = await srcToken.balanceOf(bestSellReserve.address);
                initialEtherBuyReserveBalance = await Helper.getBalancePromise(bestBuyReserve.address);
                initialDestTokenBuyReserveBalance = await destToken.balanceOf(bestBuyReserve.address);
        
                expectedWeiAmountNoFees = Helper.calcDstQty(srcQty, srcDecimals, ethDecimals, bestSellReserve.rateNoFee);
                platformFeeWei = expectedWeiAmt.mul(platformFeeBps).div(BPS);
                expectedWeiAmtAfterAllFees = minusNetworkFees(expectedWeiAmountNoFees.sub(platformFeeWei), bestSellReserve.isFeePaying, bestBuyReserve.isFeePaying, takerFeeBps);

                overallRate = await network.getExpectedRateWithHintAndFee(srcToken.address, destToken.address, srcQty, platformFeeBps, emptyHint);
                expectedDestAmountAfterAllFees = Helper.calcDstQty(srcQty, srcDecimals, destDecimals, overallRate.expectedRateAfterAllFees);

                //perform trade, give dest tokens to user
                txResult = await network.tradeWithHint(networkProxy, srcToken.address, srcQty, destToken.address, user, 
                    maxDestAmt, minConversionRate, platformWallet, emptyHint);
                console.log(`token -> token: ${txResult.receipt.gasUsed} gas used`);
                
                //compare balances
                //User: Minus srcQty, plus expectedDestAmtAfterAllFees
                await assertSameTokenBalance(network.address, srcToken, initialSrcTokenUserBalance.sub(srcQty));
                await assertSameTokenBalance(user, destToken, initialDestTokenUserBalance.add(expectedDestAmountAfterAllFees));
                
                //Sell reserve: Plus srcQty, minus expectedWeiAmountNoFee
                await assertSameEtherBalance(bestSellReserve.address, initialEtherSellReserveBalance.sub(expectedWeiAmountNoFees));
                await assertSameTokenBalance(bestSellReserve.address, srcToken, initialSrcTokenSellReserveBalance.add(srcQty));

                //Buy reserve: Plus expectedWeiAmtAfterAllFees, minus expectedDestAmtAfterAllFees (both sides taken into account)
                await assertSameEtherBalance(bestBuyReserve.address, initialEtherBuyReserveBalance.add(expectedWeiAmtAfterAllFees));
                await assertSameTokenBalance(bestBuyReserve.address, destToken, initialDestTokenBuyReserveBalance.sub(expectedDestAmountAfterAllFees));
            });

            it("should perform a simple T2E trade with mask in hint", async() => {

            });

            it("should perform a simple T2E trade with split hint", async() => {
                reserveCandidates = await fetchReservesRatesFromNetwork(network, srcToken.address, srcQty, true);
                hintedReserves = applyHintToReserves(SPLIT_HINTTYPE, reserveCandidates);
                hint = await tradeLogic.buildTokenToEthHint(
                    hintedReserves.tradeType, hintedReserves.reservesForHint, hintedReserves.splits
                );
                await srcToken.transfer(network.address, srcQty);
                txResult = await network.tradeWithHint(networkProxy, srcToken.address, srcQty, ethAddress, user, 
                    maxDestAmt, minConversionRate, platformWallet, hint);
                console.log(`token -> ETH (split hint): ${txResult.receipt.gasUsed} gas used`);
            });

            it("should perform a simple E2T trade with split hint", async() => {
                reserveCandidates = await fetchReservesRatesFromNetwork(network, destToken.address, ethSrcQty, false);
                hintedReserves = applyHintToReserves(SPLIT_HINTTYPE, reserveCandidates);
                hint = await tradeLogic.buildEthToTokenHint(
                    hintedReserves.tradeType, hintedReserves.reservesForHint, hintedReserves.splits
                );
                txResult = await network.tradeWithHint(networkProxy, ethAddress, ethSrcQty, destToken.address, user, 
                    maxDestAmt, minConversionRate, platformWallet, hint, {value: ethSrcQty});
                console.log(`ETH -> token (split hint): ${txResult.receipt.gasUsed} gas used`);
            });

            it("should perform a simple T2T trade with split hint", async() => {
                reserveCandidates = await fetchReservesRatesFromNetwork(network, srcToken.address, srcQty, true);
                hintedReservesT2E = applyHintToReserves(SPLIT_HINTTYPE, reserveCandidates);
                // todo: find estimated quantity
                reserveCandidates = await fetchReservesRatesFromNetwork(network, destToken.address, ethSrcQty, false);
                hintedReservesE2T = applyHintToReserves(SPLIT_HINTTYPE, reserveCandidates);
                hint = await tradeLogic.buildTokenToTokenHint(
                    hintedReservesT2E.tradeType, hintedReservesT2E.reservesForHint, hintedReservesT2E.splits,
                    hintedReservesE2T.tradeType, hintedReservesE2T.reservesForHint, hintedReservesE2T.splits
                );
                await srcToken.transfer(network.address, srcQty);
                txResult = await network.tradeWithHint(networkProxy, srcToken.address, srcQty, destToken.address, user, 
                    maxDestAmt, minConversionRate, platformWallet, emptyHint);
                console.log(`token -> token (split hint): ${txResult.receipt.gasUsed} gas used`);
            });
        })
    
        it("test contract addresses for fee handler and DAO", async() => {
            let contracts = await network.getContracts();
            Helper.assertEqual(contracts[0], DAO.address)
            Helper.assertEqual(contracts[1], feeHandler.address)
            Helper.assertEqual(contracts[2], tradeLogic.address);
        });
    
        it("test encode decode taker fee data with mock setter getter", async() => {
            let tempNetwork = await MockNetwork.new(admin);
            await tempNetwork.setContracts(feeHandler.address, DAO.address, tradeLogic.address, {from: admin});
    
            let networkData = await tempNetwork.getNetworkData();
         
            await tempNetwork.getAndUpdateTakerFee();
            networkData = await tempNetwork.getNetworkData();
            Helper.assertEqual(networkData[3], takerFeeBps);
            
            let newFee = new BN(35);
            let newExpiryBlock = new BN(723);
            await tempNetwork.setTakerFeeData(newFee, newExpiryBlock);
    
            networkData = await tempNetwork.getNetworkData();
            Helper.assertEqual(networkData[3], newFee);
            
            let takerFeeData = await tempNetwork.getTakerFeeData();
            Helper.assertEqual(takerFeeData[0], newFee);
            Helper.assertEqual(takerFeeData[1], newExpiryBlock);
        });
        
        it("update fee in DAO and see updated in netwrok on correct block", async() => {
            //TODO:
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

async function setupReserves(numMock, numFpr, enhancedFprReserves, aprReserves, accounts) {
    let totalReserves = numMock * 1 + numFpr * 1 + enhancedFprReserves * 1 + aprReserves * 1;
    let i;
    let ethSenderIndex = 1;
    let ethInit = (new BN(10)).pow(new BN(19)).mul(new BN(8)); 
    
    // setup mock reserves
    //////////////////////
    for (i=0; i < numMock; i++) {
        reserve = await MockReserve.new();
        reserveInstances[reserve.address] = {
            'address': reserve.address,
            'instance': reserve,
            'reserveId': genReserveID(MOCK_ID, reserve.address),
            'isFeePaying': true,
            'rate': new BN(0),
            'type': type_MOCK,
            'pricing': "none"
        }

        tokensPerEther = precisionUnits.mul(new BN((i + 1) * 10));
        ethersPerToken = precisionUnits.div(new BN((i + 1) * 10));

        //send ETH
        let ethSender = accounts[ethSenderIndex++];
        await Helper.sendEtherWithPromise(ethSender, reserve.address, ethInit);
        await assertSameEtherBalance(reserve.address, ethInit);

        for (let j = 0; j < numTokens; j++) {
            token = tokens[j];
            //set rates and send tokens based on eth -> token rate
            await reserve.setRate(token.address, tokensPerEther, ethersPerToken);
            let initialTokenAmount = new BN(200000).mul(new BN(10).pow(new BN(await token.decimals())));
            await token.transfer(reserve.address, initialTokenAmount);
            await assertSameTokenBalance(reserve.address, token, initialTokenAmount);
        }
    }

    // setup fpr reserves
    ////////////////////
    for(i = 0; i < numFpr; i++) {
        
        tokensPerEther = precisionUnits.mul(new BN((i + 1) * 30));
        ethersPerToken = precisionUnits.div(new BN((i + 1) * 30));
    
        let pricing = await setupFprPricing(tokens, 4, 0, tokensPerEther, ethersPerToken)
        let reserve = await setupFprReserve(tokens, accounts[ethSenderIndex++], pricing.address, tokensPerEther, ethInit);
        await pricing.setReserveAddress(reserve.address, {from: admin});
        
        reserveInstances[reserve.address] = {
            'address': reserve.address,
            'instance': reserve,
            'reserveId': genReserveID(FPR_ID, reserve.address),
            'isFeePaying': true,
            'rate': new BN(0),
            'type': type_fpr,
            'pricing': pricing.address
        }

        pricingFpr[i] = pricing;
        reserveFpr[i] = reserve;
        gNumFprReserves++;
    }
    //TODO: implement logic for other reserve types

    return totalReserves;
}

async function setupFprReserve (whichTokens, ethSender, pricingAdd, tokensPerEther, ethInit) {
    let reserve;

    //setup reserve
    reserve = await Reserve.new(network.address, pricingAdd, admin);
    await reserve.addOperator(operator, {from: admin});
    await reserve.addAlerter(alerter, {from: admin});
        
    //set reserve balance. 10**18 wei ether + per token 10**18 wei ether value according to base rate.
    await Helper.sendEtherWithPromise(ethSender, reserve.address, ethInit);
    
    for (let j = 0; j < whichTokens.length; ++j) {
        let token = whichTokens[j];
        
        //reserve related setup
        await reserve.approveWithdrawAddress(token.address, ethSender, true, {from: admin});
          
        let initialTokenAmount = new BN(200000).mul(new BN(10).pow(new BN(await token.decimals())));
        await token.transfer(reserve.address, initialTokenAmount);
        await assertSameTokenBalance(reserve.address, token, initialTokenAmount);
    }

    return reserve;
}

//quantity buy steps. low values to simluate gas cost of steps.
const qtyBuyStepX = [0, 1, 2, 3, 4, 5];
const qtyBuyStepY = [0, -1, -2, -3, -4, -5];
const imbalanceBuyStepX = [0, -1, -2, -3, -4, -5];
const imbalanceBuyStepY = [0,  -1, -2, -3, -4, -5];
const qtySellStepX =[0, 1, 2, 3, 4, 5];
const qtySellStepY = [0, -1, -2, -3, -4, -5];
const imbalanceSellStepX = [0, -1, -2, -3, -4, -5];
const imbalanceSellStepY = [0, -1, -2, -3, -4, -5];

async function setupFprPricing(whichTokens, numImbalanceSteps, numQtySteps, tokensPerEther, ethersPerToken) {
    let block = await web3.eth.getBlockNumber();
    let pricing = await ConversionRates.new(admin);
    await pricing.addOperator(operator, {from: admin})
    await pricing.addAlerter(alerter, {from: admin})

    await pricing.setValidRateDurationInBlocks(validRateDurationInBlocks, {from: admin});
    
    let buys = [];
    let sells = [];
    let indices = [];

    for (let j = 0; j < whichTokens.length; ++j) {
        let token = whichTokens[j];
        let tokenAddress = token.address;
                
        // pricing setup
        await pricing.addToken(token.address, {from: admin});
        await pricing.setTokenControlInfo(token.address, minimalRecordResolution, maxPerBlockImbalance, maxTotalImbalance, {from: admin});
        await pricing.enableTokenTrade(token.address, {from: admin});
        
        //update rates array
        let baseBuyRate = [];
        let baseSellRate = [];
        baseBuyRate.push(tokensPerEther);
        baseSellRate.push(ethersPerToken);

        buys.length = sells.length = indices.length = 0;

        tokenAdd = [tokenAddress];
        await pricing.setBaseRate(tokenAdd, baseBuyRate, baseSellRate, buys, sells, block, indices, {from: operator});      
        
        let buyX = qtyBuyStepX;
        let buyY = qtyBuyStepY;
        let sellX = qtySellStepX;
        let sellY = qtySellStepY;
        if (numQtySteps == 0) numQtySteps = 1;
        buyX.length = buyY.length = sellX.length = sellY.length = numQtySteps;
        await pricing.setQtyStepFunction(tokenAddress, buyX, buyY, sellX, sellY, {from:operator});
        
        buyX = imbalanceBuyStepX;
        buyY = imbalanceBuyStepY;
        sellX = imbalanceSellStepX;
        sellY = imbalanceSellStepY;
        if (numImbalanceSteps == 0) numImbalanceSteps = 1;
        buyX.length = buyY.length = sellX.length = sellY.length = numImbalanceSteps;
        
        await pricing.setImbalanceStepFunction(tokenAddress, buyX, buyY, sellX, sellY, {from:operator});
    }
         
    compactBuyArr = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    let compactBuyHex = Helper.bytesToHex(compactBuyArr);
    buys.push(compactBuyHex);

    compactSellArr =  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    let compactSellHex = Helper.bytesToHex(compactSellArr);
    sells.push(compactSellHex);

    indices[0] = 0;

    Helper.assertEqual(indices.length, sells.length, "bad sells array size");
    Helper.assertEqual(indices.length, buys.length, "bad buys array size");

    await pricing.setCompactData(buys, sells, block, indices, {from: operator});
    return pricing;
}

async function addReservesToNetwork(networkInstance, reserveInstances) {
    for (const [key, value] of Object.entries(reserveInstances)) {
        reserve = value;
        console.log("adding reserve type: " + reserve.type + " address: " + reserve.address + " pricing: " + reserve.pricing);
        networkInstance.addReserve(reserve.address, reserve.reserveId, reserve.isFeePaying, reserve.address, {from: operator});
        for (let j = 0; j < numTokens; j++) {
            networkInstance.listPairForReserve(reserve.address, tokens[j].address, true, true, true, {from: operator});
        }
    }
}

async function removeReservesFromNetwork(networkInstance, reserveInstances) {
    for (const [key, value] of Object.entries(reserveInstances)) {
        reserve = value;
        console.log("removing reserve type: " + reserve.type + " address: " + reserve.address + " pricing: " + reserve.pricing);
        for (let j = 0; j < numTokens; j++) {
            networkInstance.listPairForReserve(reserve.address, tokens[j].address, true, true, false, {from: operator});
        }
        networkInstance.rmReserve(reserve.address, {from: operator});
    }
}

function genReserveID(reserveID, reserveAddress) {
    return reserveID + reserveAddress.substring(2,10);
}

async function fetchReservesRatesFromNetwork(networkInstance, tokenAddress, qty, isTokenToEth) {
    reservesArray = [];
    result = await networkInstance.getPricesForToken(tokenAddress, qty);
    if (isTokenToEth) {
        reserves = result.sellReserves;
        rates = result.sellRates;
    } else {
        reserves = result.buyReserves;
        rates = result.buyRates;
    }
    for (i=0; i<reserves.length; i++) {
        reserveAddress = reserves[i];
        reserve = reserveInstances[reserveAddress];
        reserve.rate = rates[i];
        reservesArray.push(reserve);
    }
    return reservesArray;
}

async function assertSameEtherBalance(accountAddress, expectedBalance) {
    let balance = await Helper.getBalancePromise(accountAddress);
    Helper.assertEqual(balance, expectedBalance, "wrong ether balance");
}

async function assertSameTokenBalance(accountAddress, token, expectedBalance) {
    let balance = await token.balanceOf(accountAddress);
    Helper.assertEqual(balance, expectedBalance, "wrong token balance");
}

//returns random integer between min (inclusive) and max (inclusive)
function getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function getBestReserveAndRate(reserves, src, dest, srcAmount, takerFeeBps) {
    bestReserveData = {
        address: zeroAddress,
        rateNoFee: new BN(0),
        rateWithNetworkFee: new BN(0),
        isPaying: false
    }

    reserveArr = Object.values(reserves);
    if (src == dest || reserveArr.length == 0) {
        return bestReserveData;
    }
    for (let i=0; i < reserveArr.length; i++) {
        reserve = reserveArr[i];
        if (reserve.rate.gt(bestReserveData.rateWithNetworkFee)) {
            bestReserveData.address = reserve.address;
            bestReserveData.rateNoFee = reserve.rate;
            bestReserveData.isFeePaying = reserve.isFeePaying;
            bestReserveData.rateWithNetworkFee = (reserve.isFeePaying) ? reserve.rate.mul(BPS.sub(takerFeeBps)).div(BPS) : reserve.rate;
        }
    }
    return bestReserveData;
}

//masking will select half
//split will divide BPS equally
function applyHintToReserves(tradeType, reserves) {
    result = {
        'tradeType': tradeType,
        'reservesForHint': [],
        'reservesForFetchRate': [],
        'splits': []
    }

    if (tradeType == MASK_IN_HINTTYPE) {
        for (var i=0; i<Math.floor(reserves.length/2); i++) {
            reserve = reserves[i];
            result.reservesForHint.push(reserve.reserveId);
            result.reservesForFetchRate.push(reserve);
        }
    } else if (tradeType == MASK_OUT_HINTTYPE) {
        for (var i=0; i<Math.floor(reserves.length/2); i++) {
            reserve = reserves[i];
            result.reservesForHint.push(reserve.reserveId);
        }

        for (var i=Math.floor(reserves.length/2); i < reserves.length; i++) {
            reserve = reserves[i];
            result.reservesForFetchRate.push(reserve);
        }
    } else {
        for (var i=0; i<reserves.length; i++) {
            reserve = reserves[i];
            result.reservesForHint.push(reserve.reserveId);
            result.reservesForFetchRate.push(reserve);
        }
        //store splits
        bpsAmtSoFar = new BN(0);
        for (i=0; i<reserves.length; i++) {
            splitValue = i == (reserves.length - 1) ? BPS.sub(bpsAmtSoFar) : BPS.div(new BN(reserves.length));
            bpsAmtSoFar = bpsAmtSoFar.add(splitValue);
            result.splits.push(splitValue);
        }
    }
    return result;
}

function minusNetworkFees(weiAmt, buyReserveFeePaying, sellReserveFeePaying, takerFeeBps) {
    result = weiAmt;
    networkFee = weiAmt.mul(takerFeeBps).div(BPS);
    if (buyReserveFeePaying) {
        result = result.sub(networkFee);
    }
    if (sellReserveFeePaying) {
        result = result.sub(networkFee);
    }
    return result;
}
function randomSelectReserves(tradeType, reserves, splits) {
    result = {
        'tradeType': tradeType,
        'reserves': [],
        'splits': []
    }

    //randomly include / exclude reserves
    for (i=0; i<reserves.length; i++) {
        if (Math.random() >= 0.5) {
            result.reserves.push(reserves[i]);
        }
    }

    if (tradeType == SPLIT_HINTTYPE) {
        //store splits
        bpsAmtSoFar = new BN(0);
        for (i=0; i<result.reserves.length; i++) {
            //generate some BPS value
            splitValue = i == (result.reserves.length - 1) ? BPS.sub(bpsAmtSoFar) : new BN(getRandomInt(1,BPS.div(new BN(result.reserves.length))));
            bpsAmtSoFar.add(splitValue);
            splits.push(splitValue);
        }
    }
    return result;
}

function log(str) {
    console.log(str);
}
