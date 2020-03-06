const TestToken = artifacts.require("Token.sol");
const MockReserve = artifacts.require("MockReserve.sol");
const MockDao = artifacts.require("MockDAO.sol");
const KyberNetwork = artifacts.require("KyberNetwork.sol");
const MockNetwork = artifacts.require("MockNetwork.sol");
const FeeHandler = artifacts.require("KyberFeeHandler.sol");
const TradeLogic = artifacts.require("KyberMatchingEngine.sol");
const RateHelper = artifacts.require("KyberRateHelper.sol");

const Helper = require("../helper.js");
const nwHelper = require("./networkHelper.js");

const BN = web3.utils.BN;
const { expectEvent, expectRevert } = require('@openzeppelin/test-helpers');

const {BPS, precisionUnits, ethDecimals, ethAddress, zeroAddress, emptyHint, zeroBN} = require("../helper.js");
const {APR_ID, BRIDGE_ID, MOCK_ID, FPR_ID, type_apr, type_fpr, type_MOCK, 
    MASK_IN_HINTTYPE, MASK_OUT_HINTTYPE, SPLIT_HINTTYPE, EMPTY_HINTTYPE, ReserveType}  = require('./networkHelper.js');

//global variables
//////////////////
const gasPrice = (new BN(10).pow(new BN(9)).mul(new BN(50)));
const negligibleRateDiffBps = new BN(10); //0.01% 
const maxDestAmt = new BN(2).pow(new BN(255));
const minConversionRate = new BN(0);
const oneEth = new BN(10).pow(ethDecimals);
const defaultNetworkFeeBps = new BN(25);

let networkFeeBps = new BN(20);
let platformFeeBps = zeroBN;
let platformFeeArray = [zeroBN, new BN(50), new BN(100)];

let admin;
let network;
let DAO;
let networkProxy;
let feeHandler;
let matchingEngine;
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
const tradeStr = ["MASK IN", "MASK OUT", "SPLIT", "NO HINT"];

//tokens data
////////////
let numTokens = 5;
let tokens = [];
let tokenDecimals = [];
let srcTokenId;
let destTokenId;
let srcToken;
let destToken;
let srcDecimals;
let destDecimals;
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
        await DAO.setNetworkFeeBps(networkFeeBps);
        
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

    beforeEach("select tokens before each test, reset networkFeeBps", async() => {
        srcTokenId = 0;
        destTokenId = 1;
        
        srcToken = tokens[srcTokenId];
        destToken = tokens[destTokenId];
        srcDecimals = tokenDecimals[srcTokenId];
        destDecimals = tokenDecimals[destTokenId];

        srcQty = new BN(50).mul(new BN(10).pow(srcDecimals));

        //fees
        networkFeeBps = new BN(20);
        platformFeeBps = new BN(0);
    });

    describe("should test adding contracts, and adding / removing proxy.", async() => { 
        let tempNetwork;
        let proxy1 = accounts[9];
        let proxy2 = accounts[8];
        let proxy3 = accounts[7];        
        let dao1 = accounts[1];
        let dao2 = accounts[2];
        let dao3 = accounts[3];
        let handler1 = accounts[4];
        let handler2 = accounts[5];
        let handler3 = accounts[6];
        let matchingEngine1 = accounts[7];
        let matchingEngine2 = accounts[8];
        let matchingEngine3 = accounts[9];

        beforeEach("create new network", async() =>{
            tempNetwork = await KyberNetwork.new(admin);
        })

        it("test can add max two proxies", async() => {
            await tempNetwork.addKyberProxy(proxy1, {from: admin});
            await tempNetwork.addKyberProxy(proxy2, {from: admin});
            
            await expectRevert(
                tempNetwork.addKyberProxy(proxy3, {from: admin}),
                "Max 2 proxy"
            );
        });

        it("test only admin can add proxies", async() => {
            await expectRevert(
                tempNetwork.addKyberProxy(proxy1, {from: operator}),
                "ONLY_ADMIN"
            );
        });

        it("test can't add same proxy twice", async() => {
            await tempNetwork.addKyberProxy(proxy1, {from: admin});

            await expectRevert(
                tempNetwork.addKyberProxy(proxy1, {from: admin}),
                "proxy exists"
            );
        });

        it("test can't add proxy zero address", async() => {            
            await expectRevert(
                tempNetwork.addKyberProxy(zeroAddress, {from: admin}),
                "proxy 0"
            );
        });

        it("test added proxies returned in get proxies.", async() => {
            await tempNetwork.addKyberProxy(proxy1, {from: admin});
            
            let rxProxy = await tempNetwork.getKyberProxies();
            Helper.assertEqual(rxProxy[0], proxy1);

            await tempNetwork.addKyberProxy(proxy2, {from: admin});
            rxProxy = await tempNetwork.getKyberProxies();
            Helper.assertEqual(rxProxy[0], proxy1);
            Helper.assertEqual(rxProxy[1], proxy2);
        });

        it("test remove proxy, getter updated.", async() => {
            await tempNetwork.addKyberProxy(proxy1, {from: admin});
            await tempNetwork.removeKyberProxy(proxy1, {from: admin});
            
            let rxProxy = await tempNetwork.getKyberProxies();
            Helper.assertEqual(rxProxy.length, 0);

            await tempNetwork.addKyberProxy(proxy1, {from: admin});
            await tempNetwork.addKyberProxy(proxy2, {from: admin});

            await tempNetwork.removeKyberProxy(proxy1, {from: admin});
            
            rxProxy = await tempNetwork.getKyberProxies();
            Helper.assertEqual(rxProxy[0], proxy2);
        });

        it("test can add proxy after removing 2nd one.", async() => {
            await tempNetwork.addKyberProxy(proxy1, {from: admin});
            await tempNetwork.addKyberProxy(proxy2, {from: admin});

            await expectRevert(
                tempNetwork.addKyberProxy(proxy3, {from: admin}),
                "Max 2 proxy"
            );

            await tempNetwork.removeKyberProxy(proxy1, {from: admin});

            await tempNetwork.addKyberProxy(proxy3, {from: admin});
        });

        it("test events for add remove proxy.", async() => {
            let txResult = await tempNetwork.addKyberProxy(proxy1, {from: admin});
            
            expectEvent(txResult, 'KyberProxyAdded', {
                proxy: proxy1
            });

            txResult = await tempNetwork.removeKyberProxy(proxy1, {from: admin});
            
            expectEvent(txResult, 'KyberProxyRemoved', {
                proxy: proxy1
            });
        });

        it("add a few dao contracts, see event + updated in getter.", async() => {
            let txResult = await tempNetwork.setDAOContract(dao1, {from: admin});
            expectEvent(txResult, 'KyberDAOUpdated', {
                newDAO : dao1
            });
            let contracts = await tempNetwork.getContracts();
            Helper.assertEqual(contracts.daoAddresses[0], dao1);

            txResult = await tempNetwork.setDAOContract(dao2, {from: admin});
            expectEvent(txResult, 'KyberDAOUpdated', {
                newDAO : dao2
            });
            contracts = await tempNetwork.getContracts();
            Helper.assertEqual(contracts.daoAddresses[0], dao2);
            Helper.assertEqual(contracts.daoAddresses[1], dao1);

            txResult = await tempNetwork.setDAOContract(dao3, {from: admin});
            expectEvent(txResult, 'KyberDAOUpdated', {
                newDAO : dao3
            });
            contracts = await tempNetwork.getContracts();
            Helper.assertEqual(contracts.daoAddresses[0], dao3);
            Helper.assertEqual(contracts.daoAddresses[1], dao1);
            Helper.assertEqual(contracts.daoAddresses[2], dao2);
        });

        it("add a few matchingEngine + feeHandler contracts, see event + updated in getter.", async() => {
            let txResult = await tempNetwork.setContracts(handler1, matchingEngine1, zeroAddress, {from: admin});
            expectEvent(txResult, 'MatchingEngineUpdated', {
                matchingEngine : matchingEngine1
            });
            expectEvent(txResult, 'FeeHandlerUpdated', {
                newHandler : handler1
            });
            let contracts = await tempNetwork.getContracts();
            Helper.assertEqual(contracts.feeHandlerAddresses[0], handler1);
            Helper.assertEqual(contracts.matchingEngineAddresses[0], matchingEngine1);

            txResult = await tempNetwork.setContracts(handler1, matchingEngine2, zeroAddress, {from: admin});
            expectEvent(txResult, 'MatchingEngineUpdated', {
                matchingEngine : matchingEngine2
            });
            contracts = await tempNetwork.getContracts();
            Helper.assertEqual(contracts.feeHandlerAddresses[0], handler1);
            Helper.assertEqual(contracts.matchingEngineAddresses[0], matchingEngine2);
            Helper.assertEqual(contracts.matchingEngineAddresses[1], matchingEngine1);

            txResult = await tempNetwork.setContracts(handler2, matchingEngine2, zeroAddress, {from: admin});
            expectEvent(txResult, 'FeeHandlerUpdated', {
                newHandler : handler2
            });
            contracts = await tempNetwork.getContracts();
            Helper.assertEqual(contracts.feeHandlerAddresses[0], handler2);
            Helper.assertEqual(contracts.feeHandlerAddresses[1], handler1);
            Helper.assertEqual(contracts.matchingEngineAddresses[0], matchingEngine2);
            Helper.assertEqual(contracts.matchingEngineAddresses[1], matchingEngine1);

            await tempNetwork.setContracts(handler3, matchingEngine3, zeroAddress, {from: admin});
            contracts = await tempNetwork.getContracts();
            Helper.assertEqual(contracts.feeHandlerAddresses[0], handler3);
            Helper.assertEqual(contracts.feeHandlerAddresses[1], handler1);
            Helper.assertEqual(contracts.feeHandlerAddresses[2], handler2);
            Helper.assertEqual(contracts.matchingEngineAddresses[0], matchingEngine3);
            Helper.assertEqual(contracts.matchingEngineAddresses[1], matchingEngine1);
            Helper.assertEqual(contracts.matchingEngineAddresses[2], matchingEngine2);
        });
    });

    describe("should test events declared in network contract", async() => { 
        let tempNetwork;
        let tempMatchingEngine;
        let mockReserve;
        let feeHandler;
        let rateHelper;
    
        before("global setup ", async() => {
            tempNetwork = await KyberNetwork.new(admin);
            tempMatchingEngine = await TradeLogic.new(admin);
            mockReserve = await MockReserve.new();
        
            await tempNetwork.addOperator(operator, {from: admin});
            await tempMatchingEngine.setNetworkContract(tempNetwork.address, {from: admin});
            await tempMatchingEngine.setFeePayingPerReserveType(true, true, true, false, true, {from: admin});
            //init feeHandler
            KNC = await TestToken.new("kyber network crystal", "KNC", 18);
            feeHandler = await FeeHandler.new(DAO.address, proxyForFeeHandler.address, network.address, KNC.address, burnBlockInterval);
            rateHelper = await RateHelper.new(admin);
            await rateHelper.setContracts(tempMatchingEngine.address, DAO.address, {from: admin});
        });

        it("ETH recieval", async() => {
            let ethSender = accounts[9];

            let txResult = await tempNetwork.send(ethSrcQty, {from: ethSender});
            expectEvent(txResult, 'EtherReceival', {
                sender: ethSender,
                amount: ethSrcQty
            });
        });

        it("Set contracts", async() => {
            let gasHelperAdd = accounts[9];

            let txResult = await tempNetwork.setContracts(feeHandler.address, tempMatchingEngine.address, gasHelperAdd, {from: admin});
            expectEvent(txResult, 'FeeHandlerUpdated', {
                newHandler: feeHandler.address
            });
            expectEvent(txResult, 'MatchingEngineUpdated', {
                matchingEngine: tempMatchingEngine.address
            });
            expectEvent(txResult, 'GasHelperUpdated', {
                gasHelper: gasHelperAdd
            });
        });

        it("Add reserve", async() => {
            let anyWallet = taker;
            let txResult = await tempNetwork.addReserve(mockReserve.address, nwHelper.genReserveID(MOCK_ID, mockReserve.address), ReserveType.FPR, anyWallet, {from: operator});
            //TODO: reserveId returned by txResult has additional zeroes appended
            txResult.logs[0].args[1] = txResult.logs[0].args['1'].substring(0,18);
            txResult.logs[0].args['reserveId'] = txResult.logs[0].args['reserveId'].substring(0,18);
            expectEvent(txResult, 'AddReserveToNetwork', {
                reserve: mockReserve.address,
                reserveId: nwHelper.genReserveID(MOCK_ID, mockReserve.address).toLowerCase(),
                reserveType: new BN(ReserveType.FPR),
                rebateWallet: taker,
                add: true
            });
        });
        
        it("Remove reserve", async() => {
            let txResult = await tempNetwork.removeReserve(mockReserve.address, 0, {from: operator});
            //TODO: reserveId returned by txResult has additional zeroes appended
            txResult.logs[0].args[1] = txResult.logs[0].args['1'].substring(0,18);
            txResult.logs[0].args['reserveId'] = txResult.logs[0].args['reserveId'].substring(0,18);
            expectEvent(txResult, 'RemoveReserveFromNetwork', {
                reserve: mockReserve.address,
                reserveId: nwHelper.genReserveID(MOCK_ID, mockReserve.address).toLowerCase()
            });
        });
        
        it("List pair For reserve", async() => {
            let anyWallet = taker;
            let anotherMockReserve = await MockReserve.new();
            await tempNetwork.addReserve(anotherMockReserve.address, nwHelper.genReserveID(MOCK_ID, anotherMockReserve.address), ReserveType.FPR, anyWallet, {from: operator});
            let txResult = await tempNetwork.listPairForReserve(anotherMockReserve.address, KNC.address, true, true, true, {from: operator});
            expectEvent(txResult, 'ListReservePairs', {
                reserve: anotherMockReserve.address,
                src: ethAddress,
                dest: KNC.address,
                add: true
            });

            expectEvent(txResult, 'ListReservePairs', {
                reserve: anotherMockReserve.address,
                src: KNC.address,
                dest: ethAddress,
                add: true
            });
        });
        
        it("Add DAO contract", async() => {
            let fakeDAO = accounts[3];
            let txResult = await tempNetwork.setDAOContract(fakeDAO, {from: admin});
            expectEvent(txResult, 'KyberDAOUpdated', {
                newDAO: fakeDAO
            });
        });

        it("Set params", async() => {
            let txResult = await tempNetwork.setParams(gasPrice, negligibleRateDiffBps, {from: admin});
            expectEvent(txResult, 'KyberNetworkParamsSet', {
                maxGasPrice: gasPrice,
                negligibleRateDiffBps: negligibleRateDiffBps
            });
        });

        it("Add proxy", async() => {
            let fakeProxy = accounts[3];
            let txResult = await tempNetwork.addKyberProxy(fakeProxy, {from: admin});
            expectEvent(txResult, 'KyberProxyAdded', {
                proxy: fakeProxy
            });
        });

        it("Remove proxy", async() => {
            let fakeProxy = accounts[4];
            await tempNetwork.addKyberProxy(fakeProxy, {from: admin});
            let txResult = await tempNetwork.removeKyberProxy(fakeProxy, {from: admin});
            expectEvent(txResult, 'KyberProxyRemoved', {
                proxy: fakeProxy
            });
        });

        it("Set enable", async() => {
            let txResult = await tempNetwork.setEnable(true, {from: admin});
            expectEvent(txResult, 'KyberNetworkSetEnable', {
                isEnabled: true
            });
        });
    });

    describe("test adding and removing reserves", async() => {})

    describe("test with MockDAO", async() => {
        before("initialise DAO, network and reserves", async() => {
            //DAO related init.
            expiryBlockNumber = new BN(await web3.eth.getBlockNumber() + 150);
            DAO = await MockDao.new(rewardInBPS, rebateInBPS, epoch, expiryBlockNumber);
            await DAO.setNetworkFeeBps(networkFeeBps);

            //init network
            network = await KyberNetwork.new(admin);
            // set proxy same as network
            proxyForFeeHandler = network;

            //init feeHandler
            KNC = await TestToken.new("kyber network crystal", "KNC", 18);
            feeHandler = await FeeHandler.new(DAO.address, proxyForFeeHandler.address, network.address, KNC.address, burnBlockInterval);

            //init matchingEngine
            matchingEngine = await TradeLogic.new(admin);
            await matchingEngine.setNetworkContract(network.address, {from: admin});
            await matchingEngine.setFeePayingPerReserveType(true, true, true, false, true, {from: admin});

            // init rateHelper
            rateHelper = await RateHelper.new(admin);
            await rateHelper.setContracts(matchingEngine.address, DAO.address, {from: admin});

            //setup network
            await network.addOperator(operator, {from: admin});
            await network.addKyberProxy(networkProxy, {from: admin});
            await network.setContracts(feeHandler.address, matchingEngine.address, zeroAddress, {from: admin});
            await network.setDAOContract(DAO.address, {from: admin});
            //set params, enable network
            await network.setParams(gasPrice, negligibleRateDiffBps, {from: admin});
            await network.setEnable(true, {from: admin});
        });
        
        it("should test enabling network", async() => {
            let isEnabled = await network.enabled();
            assert.equal(isEnabled, true);
    
            await network.setEnable(false, {from: admin});
    
            isEnabled = await network.enabled();
            assert.equal(isEnabled, false);
    
            await network.setEnable(true, {from: admin});
        });

        describe("test getExpectedRate functions with 2 mock reserves, zero rate", async() => {
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
                Helper.assertEqual(actualResult.rateAfterNetworkFee, zeroBN, "rate with network fee not 0");
                Helper.assertEqual(actualResult.rateAfterAllFees, zeroBN, "rate with all fees not 0");
    
                actualResult = await network.getExpectedRateWithHintAndFee(ethAddress, unlistedDestToken.address, ethSrcQty, platformFeeBps, emptyHint);
                Helper.assertEqual(actualResult.rateNoFees, zeroBN, "expected rate not 0");
                Helper.assertEqual(actualResult.rateAfterNetworkFee, zeroBN, "rate with network fee not 0");
                Helper.assertEqual(actualResult.rateAfterAllFees, zeroBN, "rate with all fees not 0");
    
                actualResult = await network.getExpectedRateWithHintAndFee(unlistedSrcToken.address, unlistedDestToken.address, ethSrcQty, platformFeeBps, emptyHint);
                Helper.assertEqual(actualResult.rateNoFees, zeroBN, "expected rate not 0");
                Helper.assertEqual(actualResult.rateAfterNetworkFee, zeroBN, "rate with network fee not 0");
                Helper.assertEqual(actualResult.rateAfterAllFees, zeroBN, "rate with all fees not 0");
            });

            for (hintType of tradeTypesArray) {
                it(`should return 0 rate (${tradeStr[hintType]}) if all reserves return zero rate`, async() => {
                    hint = await nwHelper.getHint(rateHelper, matchingEngine, reserveInstances, hintType, undefined, srcToken.address, ethAddress, srcQty);
                    actualResult = await network.getExpectedRateWithHintAndFee(srcToken.address, ethAddress, srcQty, platformFeeBps, hint);
                    Helper.assertEqual(actualResult.rateNoFees, zeroBN, "expected rate not 0");
                    Helper.assertEqual(actualResult.rateAfterNetworkFee, zeroBN, "rate with network fee not 0");
                    Helper.assertEqual(actualResult.rateAfterAllFees, zeroBN, "rate with all fees not 0");

                    hint = await nwHelper.getHint(rateHelper, matchingEngine, reserveInstances, hintType, undefined, ethAddress, destToken.address, ethSrcQty);
                    actualResult = await network.getExpectedRateWithHintAndFee(ethAddress, destToken.address, ethSrcQty, platformFeeBps, emptyHint);
                    Helper.assertEqual(actualResult.rateNoFees, zeroBN, "expected rate not 0");
                    Helper.assertEqual(actualResult.rateAfterNetworkFee, zeroBN, "rate with network fee not 0");
                    Helper.assertEqual(actualResult.rateAfterAllFees, zeroBN, "rate with all fees not 0");

                    hint = await nwHelper.getHint(rateHelper, matchingEngine, reserveInstances, hintType, undefined, srcToken.address, destToken.address, srcQty);
                    actualResult = await network.getExpectedRateWithHintAndFee(srcToken.address, destToken.address, srcQty, platformFeeBps, emptyHint);
                    Helper.assertEqual(actualResult.rateNoFees, zeroBN, "expected rate not 0");
                    Helper.assertEqual(actualResult.rateAfterNetworkFee, zeroBN, "rate with network fee not 0");
                    Helper.assertEqual(actualResult.rateAfterAllFees, zeroBN, "rate with all fees not 0");
                });

                it(`should return 0 rate (${tradeStr[hintType]} with zero srcQty, and all reserves return zero rate`, async() => {
                    srcQty = zeroBN;
                    hint = await nwHelper.getHint(rateHelper, matchingEngine, reserveInstances, hintType, undefined, srcToken.address, ethAddress, srcQty);
                    actualResult = await network.getExpectedRateWithHintAndFee(srcToken.address, ethAddress, srcQty, platformFeeBps, hint);
                    Helper.assertEqual(actualResult.rateNoFees, zeroBN, "expected rate not 0");
                    Helper.assertEqual(actualResult.rateAfterNetworkFee, zeroBN, "rate with network fee not 0");
                    Helper.assertEqual(actualResult.rateAfterAllFees, zeroBN, "rate with all fees not 0");

                    hint = await nwHelper.getHint(rateHelper, matchingEngine, reserveInstances, hintType, undefined, ethAddress, destToken.address, ethSrcQty);
                    actualResult = await network.getExpectedRateWithHintAndFee(ethAddress, destToken.address, ethSrcQty, platformFeeBps, emptyHint);
                    Helper.assertEqual(actualResult.rateNoFees, zeroBN, "expected rate not 0");
                    Helper.assertEqual(actualResult.rateAfterNetworkFee, zeroBN, "rate with network fee not 0");
                    Helper.assertEqual(actualResult.rateAfterAllFees, zeroBN, "rate with all fees not 0");

                    hint = await nwHelper.getHint(rateHelper, matchingEngine, reserveInstances, MASK_IN_HINTTYPE, undefined, srcToken.address, destToken.address, srcQty);
                    actualResult = await network.getExpectedRateWithHintAndFee(srcToken.address, destToken.address, srcQty, platformFeeBps, emptyHint);
                    Helper.assertEqual(actualResult.rateNoFees, zeroBN, "expected rate not 0");
                    Helper.assertEqual(actualResult.rateAfterNetworkFee, zeroBN, "rate with network fee not 0");
                    Helper.assertEqual(actualResult.rateAfterAllFees, zeroBN, "rate with all fees not 0");
                });
            };
        });

        describe("test getExpectedRate functions with 3 mock reserves, valid rates", async() => {
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
                //setup mockDAO with zero network bps
                expiryBlockNumber = new BN(await web3.eth.getBlockNumber() + 150);
                let tempDAO = await MockDao.new(rewardInBPS, rebateInBPS, epoch, expiryBlockNumber);
                await tempDAO.setNetworkFeeBps(zeroBN);
                await network.setDAOContract(tempDAO.address, {from: admin});

                info = [srcQty, zeroBN, zeroBN];
                expectedResult = await matchingEngine.calcRatesAndAmounts(srcToken.address, ethAddress, srcDecimals, ethDecimals, info, emptyHint);
                expectedResult = await nwHelper.unpackRatesAndAmounts(info, srcDecimals, ethDecimals, expectedResult);
                actualResult = await network.getExpectedRate(srcToken.address, ethAddress, srcQty);
                Helper.assertEqual(expectedResult.rateAfterNetworkFee, actualResult.expectedRate, "expected rate with network fee != actual rate for T2E");
        
                info = [ethSrcQty, zeroBN, zeroBN];
                expectedResult = await matchingEngine.calcRatesAndAmounts(ethAddress, destToken.address, ethDecimals, destDecimals, info, emptyHint);
                expectedResult = await nwHelper.unpackRatesAndAmounts(info, ethDecimals, destDecimals, expectedResult);
                actualResult = await network.getExpectedRate(ethAddress, destToken.address, ethSrcQty);
                Helper.assertEqual(expectedResult.rateAfterNetworkFee, actualResult.expectedRate, "expected rate with network fee != actual rate for E2T");
        
                info = [srcQty, zeroBN, zeroBN];
                expectedResult = await matchingEngine.calcRatesAndAmounts(srcToken.address, destToken.address, srcDecimals, destDecimals, info, emptyHint);
                expectedResult = await nwHelper.unpackRatesAndAmounts(info, srcDecimals, destDecimals, expectedResult);
                actualResult = await network.getExpectedRate(srcToken.address, destToken.address, srcQty);
                Helper.assertEqual(expectedResult.rateAfterNetworkFee, actualResult.expectedRate, "expected rate with network fee != actual rate for T2T");

                await network.setDAOContract(DAO.address, {from: admin});
            });

            it("should return rates for zero srcQty", async() => {
                let modifiedSrcQty = new BN(1);
                info = [modifiedSrcQty, networkFeeBps, platformFee];
                
                expectedResult = await matchingEngine.calcRatesAndAmounts(srcToken.address, ethAddress, srcDecimals, ethDecimals, info, emptyHint);
                expectedResult = await nwHelper.unpackRatesAndAmounts(info, srcDecimals, ethDecimals, expectedResult);
                actualResult = await network.getExpectedRate(srcToken.address, ethAddress, zeroBN);
                Helper.assertEqual(expectedResult.rateAfterNetworkFee, actualResult.expectedRate, "expected rate with network fee != actual rate for T2E");
        
                expectedResult = await matchingEngine.calcRatesAndAmounts(ethAddress, destToken.address, ethDecimals, destDecimals, info, emptyHint);
                expectedResult = await nwHelper.unpackRatesAndAmounts(info, ethDecimals, destDecimals, expectedResult);
                actualResult = await network.getExpectedRate(ethAddress, destToken.address, zeroBN);
                Helper.assertEqual(expectedResult.rateAfterNetworkFee, actualResult.expectedRate, "expected rate with network fee != actual rate for E2T");

                expectedResult = await matchingEngine.calcRatesAndAmounts(srcToken.address, destToken.address, srcDecimals, destDecimals, info, emptyHint);
                expectedResult = await nwHelper.unpackRatesAndAmounts(info, srcDecimals, destDecimals, expectedResult);
                actualResult = await network.getExpectedRate(srcToken.address, destToken.address, zeroBN);
                Helper.assertEqual(expectedResult.rateAfterNetworkFee, actualResult.expectedRate, "expected rate with network fee != actual rate for T2T");
            });

            for (platformFee of platformFeeArray) {
                it(`should get expected rate (no hint, backwards compatible, platformFee ${platformFee.toString()} bps) for T2E, E2T & T2T`, async() => {
                    info = [srcQty, networkFeeBps, platformFee];
                    expectedResult = await matchingEngine.calcRatesAndAmounts(srcToken.address, ethAddress, srcDecimals, ethDecimals, info, emptyHint);
                    expectedResult = await nwHelper.unpackRatesAndAmounts(info, srcDecimals, ethDecimals, expectedResult);
                    actualResult = await network.getExpectedRate(srcToken.address, ethAddress, srcQty);
                    Helper.assertEqual(expectedResult.rateAfterNetworkFee, actualResult.expectedRate, "expected rate with network fee != actual rate for T2E");
            
                    info = [ethSrcQty, networkFeeBps, platformFee];
                    expectedResult = await matchingEngine.calcRatesAndAmounts(ethAddress, destToken.address, ethDecimals, destDecimals, info, emptyHint);
                    expectedResult = await nwHelper.unpackRatesAndAmounts(info, ethDecimals, destDecimals, expectedResult);
                    actualResult = await network.getExpectedRate(ethAddress, destToken.address, ethSrcQty);
                    Helper.assertEqual(expectedResult.rateAfterNetworkFee, actualResult.expectedRate, "expected rate with network fee != actual rate for E2T");
            
                    info = [srcQty, networkFeeBps, platformFee];
                    expectedResult = await matchingEngine.calcRatesAndAmounts(srcToken.address, destToken.address, srcDecimals, destDecimals, info, emptyHint);
                    expectedResult = await nwHelper.unpackRatesAndAmounts(info, srcDecimals, destDecimals, expectedResult);
                    actualResult = await network.getExpectedRate(srcToken.address, destToken.address, srcQty);
                    Helper.assertEqual(expectedResult.rateAfterNetworkFee, actualResult.expectedRate, "expected rate with network fee != actual rate for T2T");
                });
            };
    
            for (platformFeeBps of platformFeeArray) {
                for (tradeType of tradeTypesArray) {
                    let platformFee = platformFeeBps;
                    let hintType = tradeType;
                    it(`should get expected rate (${tradeStr[hintType]} & platform fee ${platformFee.toString()} bps) for T2E, E2T & T2T`, async() => {
                        hint = await nwHelper.getHint(rateHelper, matchingEngine, reserveInstances, hintType, undefined, srcToken.address, ethAddress, srcQty);
                        info = [srcQty, networkFeeBps, platformFee];
                        expectedResult = await matchingEngine.calcRatesAndAmounts(srcToken.address, ethAddress, srcDecimals, ethDecimals, info, hint);
                        expectedResult = await nwHelper.unpackRatesAndAmounts(info, srcDecimals, ethDecimals, expectedResult);
                        actualResult = await network.getExpectedRateWithHintAndFee(srcToken.address, ethAddress, srcQty, platformFee, hint);
                        nwHelper.assertRatesEqual(expectedResult, actualResult);

                        hint = await nwHelper.getHint(rateHelper, matchingEngine, reserveInstances, hintType, undefined, ethAddress, destToken.address, ethSrcQty);
                        info = [ethSrcQty, networkFeeBps, platformFee];
                        expectedResult = await matchingEngine.calcRatesAndAmounts(ethAddress, destToken.address, ethDecimals, destDecimals, info, hint);
                        expectedResult = await nwHelper.unpackRatesAndAmounts(info, ethDecimals, destDecimals, expectedResult);
                        actualResult = await network.getExpectedRateWithHintAndFee(ethAddress, destToken.address, ethSrcQty, platformFee, hint);
                        nwHelper.assertRatesEqual(expectedResult, actualResult);

                        hint = await nwHelper.getHint(rateHelper, matchingEngine, reserveInstances, hintType, undefined, srcToken.address, destToken.address, srcQty);
                        info = [srcQty, networkFeeBps, platformFee];
                        expectedResult = await matchingEngine.calcRatesAndAmounts(srcToken.address, destToken.address, srcDecimals, destDecimals, info, hint);
                        expectedResult = await nwHelper.unpackRatesAndAmounts(info, srcDecimals, destDecimals, expectedResult);
                        actualResult = await network.getExpectedRateWithHintAndFee(srcToken.address, destToken.address, srcQty, platformFee, hint);
                        nwHelper.assertRatesEqual(expectedResult, actualResult);
                    });
                };
            };

            it("should emit KyberTrade event for a test T2T split trade", async() => {
                hint = await nwHelper.getHint(rateHelper, matchingEngine, reserveInstances, SPLIT_HINTTYPE, undefined, srcToken.address, destToken.address, srcQty);
                info = [srcQty, networkFeeBps, platformFeeBps];
                expectedResult = await matchingEngine.calcRatesAndAmounts(srcToken.address, destToken.address, srcDecimals, destDecimals, info, hint);
                expectedResult = await nwHelper.unpackRatesAndAmounts(info, srcDecimals, destDecimals, expectedResult);

                await srcToken.transfer(network.address, srcQty);
                let txResult = await network.tradeWithHintAndFee(networkProxy, srcToken.address, srcQty, destToken.address, taker, 
                    maxDestAmt, minConversionRate, platformWallet, platformFeeBps, hint);
                
                //have to check ids separately, because expectEvent does not support arrays
                expectEvent(txResult, 'KyberTrade', {
                    trader: networkProxy,
                    src: srcToken.address,
                    dest: destToken.address,
                    srcAmount: srcQty,
                    dstAmount: expectedResult.actualDestAmount,
                    destAddress: taker,
                    ethWeiValue: expectedResult.tradeWei,
                    networkFeeWei: expectedResult.networkFeeWei,
                    customPlatformFeeWei: expectedResult.platformFeeWei,
                    hint: hint
                });

                let actualT2Eids = txResult.logs[3].args.t2eIds;
                let actualE2Tids = txResult.logs[3].args.e2tIds;
                Helper.assertEqual(expectedResult.t2eIds.length, actualT2Eids.length, "T2E id length not equal");
                Helper.assertEqual(expectedResult.e2tIds.length, actualE2Tids.length, "E2T id length not equal");
                for (let i = 0; i < expectedResult.t2eIds.length; i++) {
                    Helper.assertEqual(expectedResult.t2eIds[i], actualT2Eids[i], "T2E id not equal");
                }
                for (let i = 0; i < expectedResult.e2tIds.length; i++) {
                    Helper.assertEqual(expectedResult.e2tIds[i], actualE2Tids[i], "T2E id not equal");
                }
            });

            for (tradeType of tradeTypesArray) {
                let hintType = tradeType;
                it(`should perform a T2E trade (backwards compatible, ${tradeStr[hintType]}) and check balances change as expected`, async() => {
                    info = [srcQty, networkFeeBps, zeroBN];
                    hint = await nwHelper.getHint(rateHelper, matchingEngine, reserveInstances, hintType, undefined, srcToken.address, ethAddress, srcQty);
                    expectedResult = await matchingEngine.calcRatesAndAmounts(srcToken.address, ethAddress, srcDecimals, ethDecimals, info, hint);
                    expectedResult = await nwHelper.unpackRatesAndAmounts(info, srcDecimals, ethDecimals, expectedResult);

                    await srcToken.transfer(network.address, srcQty);
                    let initialReserveBalances = await nwHelper.getReserveBalances(srcToken, ethAddress, expectedResult);
                    let initialTakerBalances = await nwHelper.getTakerBalances(srcToken, ethAddress, taker, network.address);

                    let txResult = await network.tradeWithHint(networkProxy, srcToken.address, srcQty, ethAddress, taker, 
                        maxDestAmt, minConversionRate, platformWallet, hint);
                    console.log(`token -> ETH (${tradeStr[hintType]}): ${txResult.receipt.gasUsed} gas used`);

                    await nwHelper.compareBalancesAfterTrade(srcToken, ethAddress, srcQty, 
                        initialReserveBalances, initialTakerBalances, expectedResult, taker, network.address);
                });

                it(`should perform a E2T trade (backwards compatible, ${tradeStr[hintType]}) and check balances change as expected`, async() => {
                    hint = await nwHelper.getHint(rateHelper, matchingEngine, reserveInstances, hintType, undefined, ethAddress, destToken.address, ethSrcQty);
                    info = [ethSrcQty, networkFeeBps, zeroBN];
                    expectedResult = await matchingEngine.calcRatesAndAmounts(ethAddress, destToken.address, ethDecimals, destDecimals, info, hint);
                    expectedResult = await nwHelper.unpackRatesAndAmounts(info, ethDecimals, destDecimals, expectedResult);

                    let initialReserveBalances = await nwHelper.getReserveBalances(ethAddress, destToken, expectedResult);
                    let initialTakerBalances = await nwHelper.getTakerBalances(ethAddress, destToken, taker, networkProxy);

                    let txResult = await network.tradeWithHint(networkProxy, ethAddress, ethSrcQty, destToken.address, taker, 
                        maxDestAmt, minConversionRate, platformWallet, hint, {value: ethSrcQty});
                    console.log(`ETH -> token (${tradeStr[hintType]}): ${txResult.receipt.gasUsed} gas used`);

                    await nwHelper.compareBalancesAfterTrade(ethAddress, destToken, ethSrcQty, 
                        initialReserveBalances, initialTakerBalances, expectedResult, taker, undefined);
                });

                it(`should perform a T2T trade (backwards compatible,  ${tradeStr[hintType]}) and check balances change as expected`, async() => {
                    hint = await nwHelper.getHint(rateHelper, matchingEngine, reserveInstances, hintType, undefined, srcToken.address, destToken.address, srcQty);
                    info = [srcQty, networkFeeBps, zeroBN];
                    expectedResult = await matchingEngine.calcRatesAndAmounts(srcToken.address, destToken.address, srcDecimals, destDecimals, info, hint);
                    expectedResult = await nwHelper.unpackRatesAndAmounts(info, srcDecimals, destDecimals, expectedResult);
                    
                    await srcToken.transfer(network.address, srcQty);
                    let initialReserveBalances = await nwHelper.getReserveBalances(srcToken, destToken, expectedResult);
                    let initialTakerBalances = await nwHelper.getTakerBalances(srcToken, destToken, taker, network.address);

                    let txResult = await network.tradeWithHint(networkProxy, srcToken.address, srcQty, destToken.address, taker, 
                        maxDestAmt, minConversionRate, platformWallet, hint);
                    console.log(`token -> token (${tradeStr[hintType]}): ${txResult.receipt.gasUsed} gas used`);

                    await nwHelper.compareBalancesAfterTrade(srcToken, destToken, srcQty, 
                        initialReserveBalances, initialTakerBalances, expectedResult, taker, network.address);
                });
            };

            for (platformFeeBps of platformFeeArray) {
                for (tradeType of tradeTypesArray) {
                    let platformFee = platformFeeBps;
                    let hintType = tradeType;
                    it(`should perform a T2E trade (${tradeStr[hintType]} & platform fee ${platformFee.toString()} bps) and check balances change as expected`, async() => {
                        info = [srcQty, networkFeeBps, platformFee];
                        hint = await nwHelper.getHint(rateHelper, matchingEngine, reserveInstances, hintType, undefined, srcToken.address, ethAddress, srcQty);
                        expectedResult = await matchingEngine.calcRatesAndAmounts(srcToken.address, ethAddress, srcDecimals, ethDecimals, info, hint);
                        expectedResult = await nwHelper.unpackRatesAndAmounts(info, srcDecimals, ethDecimals, expectedResult);
                        
                        await srcToken.transfer(network.address, srcQty);
                        let initialReserveBalances = await nwHelper.getReserveBalances(srcToken, ethAddress, expectedResult);
                        let initialTakerBalances = await nwHelper.getTakerBalances(srcToken, ethAddress, taker, network.address);

                        let txResult = await network.tradeWithHintAndFee(networkProxy, srcToken.address, srcQty, ethAddress, taker, 
                            maxDestAmt, minConversionRate, platformWallet, platformFee, hint);
                        console.log(`token -> ETH (${tradeStr[hintType]}): ${txResult.receipt.gasUsed} gas used`);

                        await nwHelper.compareBalancesAfterTrade(srcToken, ethAddress, srcQty, 
                            initialReserveBalances, initialTakerBalances, expectedResult, taker, network.address);
                    });
        
                    it(`should perform a E2T trade (${tradeStr[hintType]} & platform fee ${platformFee.toString()} bps) and check balances change as expected`, async() => {
                        hint = await nwHelper.getHint(rateHelper, matchingEngine, reserveInstances, hintType, undefined, ethAddress, destToken.address, ethSrcQty);
                        info = [ethSrcQty, networkFeeBps, platformFee];
                        expectedResult = await matchingEngine.calcRatesAndAmounts(ethAddress, destToken.address, ethDecimals, destDecimals, info, hint);
                        expectedResult = await nwHelper.unpackRatesAndAmounts(info, ethDecimals, destDecimals, expectedResult);

                        let initialReserveBalances = await nwHelper.getReserveBalances(ethAddress, destToken, expectedResult);
                        let initialTakerBalances = await nwHelper.getTakerBalances(ethAddress, destToken, taker, networkProxy);

                        let txResult = await network.tradeWithHintAndFee(networkProxy, ethAddress, ethSrcQty, destToken.address, taker, 
                            maxDestAmt, minConversionRate, platformWallet, platformFee, hint, {value: ethSrcQty});
                        console.log(`ETH -> token (${tradeStr[hintType]}): ${txResult.receipt.gasUsed} gas used`);

                        await nwHelper.compareBalancesAfterTrade(ethAddress, destToken, ethSrcQty, 
                            initialReserveBalances, initialTakerBalances, expectedResult, taker, undefined);
                    });

                    it(`should perform a T2T trade (${tradeStr[hintType]} & platform fee ${platformFee.toString()} bps) and check balances change as expected`, async() => {
                        hint = await nwHelper.getHint(rateHelper, matchingEngine, reserveInstances, hintType, undefined, srcToken.address, destToken.address, srcQty);
                        info = [srcQty, networkFeeBps, platformFee];
                        expectedResult = await matchingEngine.calcRatesAndAmounts(srcToken.address, destToken.address, srcDecimals, destDecimals, info, hint);
                        expectedResult = await nwHelper.unpackRatesAndAmounts(info, srcDecimals, destDecimals, expectedResult);
                        
                        await srcToken.transfer(network.address, srcQty);
                        let initialReserveBalances = await nwHelper.getReserveBalances(srcToken, destToken, expectedResult);
                        let initialTakerBalances = await nwHelper.getTakerBalances(srcToken, destToken, taker, network.address);

                        let txResult = await network.tradeWithHintAndFee(networkProxy, srcToken.address, srcQty, destToken.address, taker, 
                            maxDestAmt, minConversionRate, platformWallet, platformFee, hint);
                        console.log(`token -> token (${tradeStr[hintType]}): ${txResult.receipt.gasUsed} gas used`);

                        await nwHelper.compareBalancesAfterTrade(srcToken, destToken, srcQty, 
                            initialReserveBalances, initialTakerBalances, expectedResult, taker, network.address);
                    });
                };
            };

            for (tradeType of tradeTypesArray) {
                let hintType = tradeType;
                it(`should perform T2E trades (${tradeStr[hintType]}) with platform fee and check fee wallet receives platform fee`, async() => {   
                    let platformFeeBps = new BN(50); 
                    info = [srcQty, networkFeeBps, platformFeeBps];
                    hint = await nwHelper.getHint(rateHelper, matchingEngine, reserveInstances, hintType, undefined, srcToken.address, ethAddress, srcQty);
                    expectedResult = await matchingEngine.calcRatesAndAmounts(srcToken.address, ethAddress, srcDecimals, ethDecimals, info, hint);
                    expectedResult = await nwHelper.unpackRatesAndAmounts(info, srcDecimals, ethDecimals, expectedResult);

                    let initialWalletFee = await feeHandler.feePerPlatformWallet(platformWallet);
                    await srcToken.transfer(network.address, srcQty);
                    let txResult = await network.tradeWithHintAndFee(networkProxy, srcToken.address, srcQty, ethAddress, taker, 
                        maxDestAmt, minConversionRate, platformWallet, platformFeeBps, hint);

                    let expectedWalletFee = initialWalletFee.add(expectedResult.platformFeeWei);
                    let actualWalletFee = await feeHandler.feePerPlatformWallet(platformWallet);
                    Helper.assertEqual(actualWalletFee, expectedWalletFee, "platform fee did not receive fees");
                });
            }

            for (tradeType of tradeTypesArray) {
                let hintType = tradeType;
                it("should perform a T2E trade (different hint types, with maxDestAmount) and check balances change as expected", async() => {
                    let platformFeeBps = new BN(50);
                    let maxDestAmt = new BN(20).mul(new BN(10).pow(destDecimals));
                    info = [srcQty, networkFeeBps, platformFeeBps];
                    hint = await nwHelper.getHint(rateHelper, matchingEngine, reserveInstances, hintType, undefined, srcToken.address, ethAddress, srcQty);
                    expectedResult = await matchingEngine.calcRatesAndAmounts(srcToken.address, ethAddress, srcDecimals, ethDecimals, info, hint);
                    expectedResult = await nwHelper.unpackRatesAndAmounts(info, srcDecimals, ethDecimals, expectedResult);

                    await srcToken.transfer(network.address, srcQty);
                    let initialReserveBalances = await nwHelper.getReserveBalances(srcToken, ethAddress, expectedResult);
                    let initialTakerBalances = await nwHelper.getTakerBalances(srcToken, ethAddress, taker, network.address);
                    [expectedResult, actualSrcQty] = await nwHelper.calcParamsFromMaxDestAmt(srcToken, ethAddress, expectedResult, info, maxDestAmt);

                    let txResult = await network.tradeWithHintAndFee(network.address, srcToken.address, srcQty, ethAddress, taker, 
                        maxDestAmt, minConversionRate, platformWallet, platformFeeBps, hint);
                    console.log(`token -> ETH (${tradeStr[hintType]}): ${txResult.receipt.gasUsed} gas used`);
                    await nwHelper.compareBalancesAfterTrade(srcToken, ethAddress, actualSrcQty, 
                        initialReserveBalances, initialTakerBalances, expectedResult, taker, network.address);
                });

                it("should perform a E2T trade (different hint types, with maxDestAmount) and check balances change as expected", async() => {
                    let platformFeeBps = new BN(50);
                    let maxDestAmt = new BN(20).mul(new BN(10).pow(destDecimals));
                    hint = await nwHelper.getHint(rateHelper, matchingEngine, reserveInstances, hintType, undefined, ethAddress, destToken.address, ethSrcQty);
                    info = [ethSrcQty, networkFeeBps, platformFeeBps];
                    expectedResult = await matchingEngine.calcRatesAndAmounts(ethAddress, destToken.address, ethDecimals, destDecimals, info, hint);
                    expectedResult = await nwHelper.unpackRatesAndAmounts(info, ethDecimals, destDecimals, expectedResult);

                    let initialReserveBalances = await nwHelper.getReserveBalances(ethAddress, destToken, expectedResult);
                    let initialTakerBalances = await nwHelper.getTakerBalances(ethAddress, destToken, taker, networkProxy);
                    [expectedResult, actualSrcQty] = await nwHelper.calcParamsFromMaxDestAmt(ethAddress, destToken, expectedResult, info, maxDestAmt);

                    let txResult = await network.tradeWithHintAndFee(network.address, ethAddress, ethSrcQty, destToken.address, taker, 
                        maxDestAmt, minConversionRate, platformWallet, platformFeeBps, hint, {value: ethSrcQty});
                    console.log(`ETH -> token (${tradeStr[hintType]}): ${txResult.receipt.gasUsed} gas used`);

                    await nwHelper.compareBalancesAfterTrade(ethAddress, destToken, actualSrcQty, 
                        initialReserveBalances, initialTakerBalances, expectedResult, taker, undefined);
                });

                it("should perform a T2T trade (different hint types, with maxDestAmount) and check balances change as expected", async() => {
                    let platformFeeBps = new BN(50);
                    let maxDestAmt = new BN(20).mul(new BN(10).pow(destDecimals));
                    hint = await nwHelper.getHint(rateHelper, matchingEngine, reserveInstances, hintType, undefined, srcToken.address, destToken.address, srcQty);
                    info = [srcQty, networkFeeBps, platformFeeBps];
                    expectedResult = await matchingEngine.calcRatesAndAmounts(srcToken.address, destToken.address, srcDecimals, destDecimals, info, hint);
                    expectedResult = await nwHelper.unpackRatesAndAmounts(info, srcDecimals, destDecimals, expectedResult);
                    [expectedResult, actualSrcQty] = await nwHelper.calcParamsFromMaxDestAmt(srcToken, destToken, expectedResult, info, maxDestAmt);

                    await srcToken.transfer(network.address, srcQty);
                    let initialReserveBalances = await nwHelper.getReserveBalances(srcToken, destToken, expectedResult);
                    let initialTakerBalances = await nwHelper.getTakerBalances(srcToken, destToken, taker, network.address);

                    let txResult = await network.tradeWithHintAndFee(network.address, srcToken.address, srcQty, destToken.address, taker, 
                        maxDestAmt, minConversionRate, platformWallet, platformFeeBps, hint);
                    console.log(`token -> token (${tradeStr[hintType]}): ${txResult.receipt.gasUsed} gas used`);

                    await nwHelper.compareBalancesAfterTrade(srcToken, destToken, actualSrcQty, 
                        initialReserveBalances, initialTakerBalances, expectedResult, taker, network.address);
                });
            };
        });

        describe("test trades with very small and very big numbers", async() => {
        });

        it("test contract addresses for fee handler and DAO", async() => {
            let contracts = await network.getContracts();
            Helper.assertEqual(contracts.daoAddresses[0], DAO.address)
            Helper.assertEqual(contracts.feeHandlerAddresses[0], feeHandler.address)
            Helper.assertEqual(contracts.matchingEngineAddresses[0], matchingEngine.address);
        });
    
        it("test encode decode network fee data with mock setter getter", async() => {
            let tempNetwork = await MockNetwork.new(admin);
            await tempNetwork.setContracts(feeHandler.address, matchingEngine.address, 
                zeroAddress, {from: admin});
    
            let networkData = await tempNetwork.getNetworkData();
         
            await tempNetwork.getAndUpdateNetworkFee();
            networkData = await tempNetwork.getNetworkData();
            Helper.assertEqual(networkData.networkFeeBps, defaultNetworkFeeBps);
            
            let newFee = new BN(35);
            let newExpiryBlock = new BN(723);
            await tempNetwork.setNetworkFeeData(newFee, newExpiryBlock);
    
            networkData = await tempNetwork.getNetworkData();
            Helper.assertEqual(networkData.networkFeeBps, newFee);
            
            let networkFeeData = await tempNetwork.getNetworkFeeData();
            Helper.assertEqual(networkFeeData[0], newFee);
            Helper.assertEqual(networkFeeData[1], newExpiryBlock);
        });
        
        it("update fee in DAO and see updated in network on correct block", async() => {
            //TODO:
        });
    });

    describe("test fee handler integrations with 2 mock reserves", async() => {
        let platformFee = new BN(200);
        let networkFeeBps;
        let rebateBps;
        let rewardBps;
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
            await network.getAndUpdateNetworkFee();
            const data = await network.getNetworkData();
            networkFeeBps = data.networkFeeBps;
            const BRRData = await feeHandler.decodeBRRData();
            // log(BRRData)
            rebateBps = BRRData.rebateBPS;
            rewardBps = BRRData.rebateBPS;
        });

        it("et2 trade. see rebate per wallet updated in fee handler.", async() => {
            let payoutBalance0 = await feeHandler.totalPayoutBalance();
            let rebateWalletBalance0 = {};
            for (let i = 0; i < rebateWallets.length; i++) {
                rebateWalletBalance0[rebateWallets[i]] = await feeHandler.rebatePerWallet(rebateWallets[i]);
            } 
            let srcQty = oneEth;
            // log("network fee bps: " + networkFeeBps + " rebate bps: " + rebateBps);
            let expectedRebate = srcQty.mul(networkFeeBps).div(BPS).mul(rebateBps).div(BPS);
            let txResult = await network.tradeWithHintAndFee(networkProxy, ethAddress, srcQty, srcToken.address, taker, 
                maxDestAmt, minConversionRate, platformWallet, platformFee, '0x', {from: networkProxy, value: srcQty});

            let reserves = nwHelper.getEt2ReservesFromTradeTx(txResult);
            let tradedReserve = reserves['e2tIds'][0];
            let rebateWallet = reserveIdToWallet[tradedReserve];
            // log("tradedReserve " + tradedReserve)
            // log("rebate wallet " + rebateWallet)

            let expectedBalance = rebateWalletBalance0[rebateWallet].add(expectedRebate);
            let actualBalance = await feeHandler.rebatePerWallet(rebateWallet);
            // log("actual balance " + actualBalance);
            Helper.assertEqual(actualBalance, expectedBalance);
        });

        it("et2 trade. see total payout amount updated in fee handler.", async() => {
            let payoutBalance0 = await feeHandler.totalPayoutBalance();

            let srcQty = oneEth;
            await network.tradeWithHintAndFee(networkProxy, ethAddress, srcQty, srcToken.address, taker, 
                maxDestAmt, minConversionRate, platformWallet, 0, '0x', {from: networkProxy, value: srcQty});
            
            let expectedAddedRebate = srcQty.mul(networkFeeBps).div(BPS).mul(rebateBps).div(BPS);
            let expectedAddedReward = srcQty.mul(networkFeeBps).div(BPS).mul(rewardBps).div(BPS);

            let expectedAddedAmount = expectedAddedRebate.add(expectedAddedReward);
            let payoutBalance1 = await feeHandler.totalPayoutBalance();
            Helper.assertEqual(payoutBalance0.add(expectedAddedAmount), payoutBalance1);
        });
    });
})

//returns random integer between min (inclusive) and max (inclusive)
function getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function log(str) {
    console.log(str);
}
