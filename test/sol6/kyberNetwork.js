const TestToken = artifacts.require("Token.sol");
const MockReserve = artifacts.require("MockReserve.sol");
const ReentrantReserve = artifacts.require("ReentrantReserve.sol");
const ReserveNoReturnVal = artifacts.require("ReserveNoReturnVal.sol");
const ReserveReturnFalse = artifacts.require("ReserveReturnFalse.sol");
const MockDao = artifacts.require("MockKyberDao.sol");
const MockGasHelper = artifacts.require("MockGasHelper.sol");
const KyberNetwork = artifacts.require("KyberNetwork.sol");
const KyberNetworkProxy = artifacts.require("KyberNetworkProxy.sol");
const MockNetwork = artifacts.require("MockNetwork.sol");
const FeeHandler = artifacts.require("KyberFeeHandler.sol");
const MatchingEngine = artifacts.require("KyberMatchingEngine.sol");
const MaliciousMatchingEngine = artifacts.require("MaliciousMatchingEngine.sol");
const KyberStorage = artifacts.require("KyberStorage.sol");
const MaliciousStorage = artifacts.require("MaliciousStorage.sol");
const RateHelper = artifacts.require("KyberRateHelper.sol");
const NotPayableContract = artifacts.require("MockNotPayableContract.sol");
const MaliciousReserve2 = artifacts.require("MaliciousReserve2.sol");
const DummyDGX = artifacts.require("DummyDGX.sol");
const DummyDGXStorage = artifacts.require("DummyDGXStorage.sol");

const Helper = require("../helper.js");
const nwHelper = require("./networkHelper.js");

const BN = web3.utils.BN;
const { expectEvent, expectRevert } = require('@openzeppelin/test-helpers');

const {BPS, precisionUnits, ethDecimals, ethAddress, zeroAddress, emptyHint, 
    zeroBN, MAX_QTY, MAX_RATE, MAX_ALLOWANCE} = require("../helper.js");
const {APR_ID, BRIDGE_ID, MOCK_ID, FPR_ID, type_apr, type_fpr, type_MOCK,
    MASK_IN_HINTTYPE, MASK_OUT_HINTTYPE, SPLIT_HINTTYPE, BEST_OF_ALL_HINTTYPE, ReserveType}  = require('./networkHelper.js');

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
let storage;
let network;
let kyberDao;
let networkProxy;
let feeHandler;
let matchingEngine;
let gasHelperAdd;
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
let reserveInstances = {};
let reserve;
let numReserves;
let info;
let hint;
const tradeTypesArray = [BEST_OF_ALL_HINTTYPE, MASK_IN_HINTTYPE, MASK_OUT_HINTTYPE, SPLIT_HINTTYPE];
const tradeStr = ["BEST OF ALL", "MASK IN", "MASK OUT", "SPLIT"];

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

        //KyberDao related init.
        expiryTimestamp = await Helper.getCurrentBlockTime() + 10;
        kyberDao = await MockDao.new(rewardInBPS, rebateInBPS, epoch, expiryTimestamp);
        await kyberDao.setNetworkFeeBps(networkFeeBps);

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
        let tempStorage;
        let tempMatchingEngine;

        let proxy1 = accounts[9];
        let proxy2 = accounts[8];
        let proxy3 = accounts[7];
        let dao1 = accounts[1];
        let dao2 = accounts[2];
        let dao3 = accounts[3];
        let handler1 = accounts[4];
        let handler2 = accounts[5];
        let handler3 = accounts[6];
        let tempMatchingEngine1;
        let tempMatchingEngine2;
        let tempMatchingEngine3;

        beforeEach("create new network", async() =>{
            tempStorage = await nwHelper.setupStorage(admin);
            tempNetwork = await KyberNetwork.new(admin, tempStorage.address);
            tempMatchingEngine = await MatchingEngine.new(admin);

            await tempStorage.setNetworkContract(tempNetwork.address, {from: admin});
            await tempMatchingEngine.setNetworkContract(tempNetwork.address, {from: admin});
            await tempMatchingEngine.setKyberStorage(tempStorage.address, {from: admin});
            await tempNetwork.setContracts(handler3, tempMatchingEngine.address, zeroAddress, {from: admin});
        })

        it("test can add max two proxies", async() => {
            await tempNetwork.addKyberProxy(proxy1, {from: admin});
            await tempNetwork.addKyberProxy(proxy2, {from: admin});

            await expectRevert(
                tempNetwork.addKyberProxy(proxy3, {from: admin}),
                "max kyberProxies limit reached"
            );
        });

        it("test only admin can add proxies", async() => {
            await expectRevert(
                tempNetwork.addKyberProxy(proxy1, {from: operator}),
                "only admin"
            );
        });

        it("test can't add same proxy twice", async() => {
            await tempNetwork.addKyberProxy(proxy1, {from: admin});

            await expectRevert.unspecified(
                tempNetwork.addKyberProxy(proxy1, {from: admin})
            );
        });

        it("test can't add proxy zero address", async() => {
            await expectRevert(
                tempNetwork.addKyberProxy(zeroAddress, {from: admin}),
                "kyberProxy 0"
            );
        });

        it("test added proxies returned in get proxies.", async() => {
            await tempNetwork.addKyberProxy(proxy1, {from: admin});

            let contracts = await tempNetwork.getContracts();
            let rxProxy = contracts.kyberProxyAddresses;
            Helper.assertEqual(rxProxy[0], proxy1);

            await tempNetwork.addKyberProxy(proxy2, {from: admin});
            contracts = await tempNetwork.getContracts();
            rxProxy = contracts.kyberProxyAddresses;
            Helper.assertEqual(rxProxy[0], proxy1);
            Helper.assertEqual(rxProxy[1], proxy2);
        });

        it("test remove proxy, getter updated.", async() => {
            await tempNetwork.addKyberProxy(proxy1, {from: admin});
            await tempNetwork.removeKyberProxy(proxy1, {from: admin});

            let contracts = await tempNetwork.getContracts();
            let rxProxy = contracts.kyberProxyAddresses;
            Helper.assertEqual(rxProxy.length, 0);

            await tempNetwork.addKyberProxy(proxy1, {from: admin});
            await tempNetwork.addKyberProxy(proxy2, {from: admin});

            await tempNetwork.removeKyberProxy(proxy1, {from: admin});

            contracts = await tempNetwork.getContracts();
            rxProxy = contracts.kyberProxyAddresses;
            Helper.assertEqual(rxProxy[0], proxy2);
        });

        it("test can add proxy after removing 2nd one.", async() => {
            await tempNetwork.addKyberProxy(proxy1, {from: admin});
            await tempNetwork.addKyberProxy(proxy2, {from: admin});

            await expectRevert(
                tempNetwork.addKyberProxy(proxy3, {from: admin}),
                "max kyberProxies limit reached"
            );

            await tempNetwork.removeKyberProxy(proxy1, {from: admin});

            await tempNetwork.addKyberProxy(proxy3, {from: admin});
        });

        it("test events for add remove proxy.", async() => {
            let txResult = await tempNetwork.addKyberProxy(proxy1, {from: admin});

            expectEvent(txResult, 'KyberProxyAdded', {
                kyberProxy: proxy1
            });

            txResult = await tempNetwork.removeKyberProxy(proxy1, {from: admin});

            expectEvent(txResult, 'KyberProxyRemoved', {
                kyberProxy: proxy1
            });
        });

        it("add a few dao contracts, see event + updated in getter.", async() => {
            let txResult = await tempNetwork.setKyberDaoContract(dao1, {from: admin});
            expectEvent(txResult, 'KyberDaoUpdated', {
                newKyberDao : dao1
            });
            let contracts = await tempNetwork.getContracts();
            Helper.assertEqual(contracts.kyberDaoAddress, dao1);

            txResult = await tempNetwork.setKyberDaoContract(dao2, {from: admin});
            expectEvent(txResult, 'KyberDaoUpdated', {
                newKyberDao : dao2
            });
            contracts = await tempNetwork.getContracts();
            Helper.assertEqual(contracts.kyberDaoAddress, dao2);

            txResult = await tempNetwork.setKyberDaoContract(dao3, {from: admin});
            expectEvent(txResult, 'KyberDaoUpdated', {
                newKyberDao : dao3
            });
            contracts = await tempNetwork.getContracts();
            Helper.assertEqual(contracts.kyberDaoAddress, dao3);
        });

        it("add a few matchingEngine + feeHandler contracts, see event + updated in getter.", async() => {
            tempMatchingEngine1 = await MatchingEngine.new(admin);
            await tempMatchingEngine1.setNetworkContract(tempNetwork.address, {from: admin});
            let txResult = await tempNetwork.setContracts(handler1, tempMatchingEngine1.address, zeroAddress, {from: admin});
            expectEvent(txResult, 'KyberMatchingEngineUpdated', {
                newKyberMatchingEngine : tempMatchingEngine1.address
            });
            expectEvent(txResult, 'KyberFeeHandlerUpdated', {
                newKyberFeeHandler : handler1
            });

            let contracts = await tempNetwork.getContracts();
            Helper.assertEqual(contracts.kyberFeeHandlerAddress, handler1);
            Helper.assertEqual(contracts.kyberMatchingEngineAddress, tempMatchingEngine1.address);

            tempMatchingEngine2 = await MatchingEngine.new(admin);
            await tempMatchingEngine2.setNetworkContract(tempNetwork.address, {from: admin});
            txResult = await tempNetwork.setContracts(handler1, tempMatchingEngine2.address, zeroAddress, {from: admin});
            expectEvent(txResult, 'KyberMatchingEngineUpdated', {
                newKyberMatchingEngine : tempMatchingEngine2.address
            });
            contracts = await tempNetwork.getContracts();
            Helper.assertEqual(contracts.kyberFeeHandlerAddress, handler1);
            Helper.assertEqual(contracts.kyberMatchingEngineAddress, tempMatchingEngine2.address);

            txResult = await tempNetwork.setContracts(handler2, tempMatchingEngine2.address, zeroAddress, {from: admin});
            expectEvent(txResult, 'KyberFeeHandlerUpdated', {
                newKyberFeeHandler : handler2
            });
            contracts = await tempNetwork.getContracts();
            Helper.assertEqual(contracts.kyberFeeHandlerAddress, handler2);
            Helper.assertEqual(contracts.kyberMatchingEngineAddress, tempMatchingEngine2.address);

            tempMatchingEngine3 = await MatchingEngine.new(admin);
            await tempMatchingEngine3.setNetworkContract(tempNetwork.address, {from: admin});
            await tempNetwork.setContracts(handler3, tempMatchingEngine3.address, zeroAddress, {from: admin});
            contracts = await tempNetwork.getContracts();
            Helper.assertEqual(contracts.kyberFeeHandlerAddress, handler3);
            Helper.assertEqual(contracts.kyberMatchingEngineAddress, tempMatchingEngine3.address);
        });
    });

    describe("test add contract nil address with KyberStorage", async function(){
        let tempMatchingEngine;
        let tempStorage;
        let gasHelperAdd;

        before("const setup", async() => {
            tempMatchingEngine = await MatchingEngine.new(admin);
            mockReserve = await MockReserve.new();
            gasHelperAdd = accounts[9];
            maliciousStorage = await MaliciousStorage.new();
            feeHandler = accounts[3];
        });

        beforeEach("global setup", async() => {
            tempStorage = await nwHelper.setupStorage(admin);
            tempNetwork = await KyberNetwork.new(admin, tempStorage.address);
            await tempStorage.setNetworkContract(tempNetwork.address, {from: admin});

            await tempNetwork.addOperator(operator, {from: admin});
            await tempNetwork.setKyberDaoContract(kyberDao.address, {from: admin});
        });

        it("set empty fee handler contract", async() => {
            await expectRevert(
                tempNetwork.setContracts(zeroAddress, tempMatchingEngine.address, gasHelperAdd, {from: admin}),
                "kyberFeeHandler 0"
            );
        });

        it("set empty matching engine contract", async() => {
            await expectRevert(
                tempNetwork.setContracts(feeHandler, zeroAddress, gasHelperAdd, {from: admin}),
                "kyberMatchingEngine 0"
            );
        });

        it("should enable setting an empty dao contract", async() => {
            await tempNetwork.setKyberDaoContract(zeroAddress, {from: admin});
            
            let rxContracts = await tempNetwork.getContracts();
            assert.equal(rxContracts.kyberDaoAddress, zeroAddress);
        });

        it("should do nothing if setting to same KyberDao address, check no event emitted", async() => {
            let txResult = await tempNetwork.setKyberDaoContract(kyberDao.address, {from: admin});
            Helper.assertEqual(txResult.logs.length, zeroBN, "event emitted");
        });
    });

    describe("test add contract nil address with malicious storage", async function(){
        let tempMatchingEngine;
        let maliciousStorage;
        let gasHelperAdd;

        before("const setup", async() => {
            tempMatchingEngine = await MatchingEngine.new(admin);
            mockReserve = await MockReserve.new();
            gasHelperAdd = accounts[9];
        })
        beforeEach("global setup", async() => {
            maliciousStorage = await MaliciousStorage.new();
            tempNetwork = await KyberNetwork.new(admin, maliciousStorage.address);
            await tempNetwork.addOperator(operator, {from: admin});
        });

        it("should revert for null fee handler", async() => {
            await expectRevert.unspecified(
                tempNetwork.setContracts(zeroAddress, tempMatchingEngine.address, gasHelperAdd, {from: admin})
            );
        });

        it("should revert for null matching engine", async() => {
            await expectRevert.unspecified(
                tempNetwork.setContracts(feeHandler, zeroAddress, gasHelperAdd, {from: admin})
            );
        });

        it("should revert for adding null kyber proxy", async() => {
            await expectRevert.unspecified(
                tempNetwork.addKyberProxy(zeroAddress, {from: admin})
            );
        });

        it("should revert for removing non-existing proxy", async() => {
            await expectRevert.unspecified(
                tempNetwork.removeKyberProxy(accounts[1], {from: admin})
            );
        });
    });

    describe("should test events declared in network contract", async() => {
        let tempNetwork;
        let tempStorage;
        let tempMatchingEngine;
        let mockReserve;
        let feeHandler;
        let rateHelper;

        before("setup contracts ", async() => {
            tempStorage = await nwHelper.setupStorage(admin);
            tempNetwork = await KyberNetwork.new(admin, tempStorage.address);
            await tempStorage.setNetworkContract(tempNetwork.address, {from: admin});
            await tempStorage.addOperator(operator, {from: admin});
            tempMatchingEngine = await MatchingEngine.new(admin);
            mockReserve = await MockReserve.new();

            await tempNetwork.addOperator(operator, {from: admin});
            await tempMatchingEngine.setNetworkContract(tempNetwork.address, {from: admin});
            await tempStorage.setFeeAccountedPerReserveType(true, true, true, false, true, true, {from: admin});
            await tempStorage.setEntitledRebatePerReserveType(true, false, true, false, true, true, {from: admin});

            //init feeHandler
            proxyForFeeHandler = tempNetwork;
            KNC = await TestToken.new("kyber network crystal", "KNC", 18);
            feeHandler = await FeeHandler.new(kyberDao.address, proxyForFeeHandler.address, tempNetwork.address, KNC.address, burnBlockInterval, kyberDao.address);
            rateHelper = await RateHelper.new(admin);
            await rateHelper.setContracts(kyberDao.address, tempStorage.address, {from: admin});
        });

        it("ETH receival", async() => {
            let ethSender = accounts[9];

            let txResult = await tempNetwork.send(ethSrcQty, {from: ethSender});
            expectEvent(txResult, 'EtherReceival', {
                sender: ethSender,
                amount: ethSrcQty
            });
        });

        it("Set contracts", async() => {
            gasHelperAdd = accounts[9];

            let txResult = await tempNetwork.setContracts(feeHandler.address, tempMatchingEngine.address, gasHelperAdd, {from: admin});
            expectEvent(txResult, 'KyberFeeHandlerUpdated', {
                newKyberFeeHandler: feeHandler.address
            });
            expectEvent(txResult, 'KyberMatchingEngineUpdated', {
                newKyberMatchingEngine: tempMatchingEngine.address
            });
            expectEvent(txResult, 'GasHelperUpdated', {
                newGasHelper: gasHelperAdd
            });
        });

        it("Add KyberDao contract", async() => {
            let fakeKyberDao = accounts[3];
            let txResult = await tempNetwork.setKyberDaoContract(fakeKyberDao, {from: admin});
            expectEvent(txResult, 'KyberDaoUpdated', {
                newKyberDao: fakeKyberDao
            });
        });

        it("Set params", async() => {
            let txResult = await tempNetwork.setParams(gasPrice, negligibleRateDiffBps, {from: admin});
            expectEvent(txResult, 'KyberNetworkParamsSet', {
                maxGasPrice: gasPrice,
                negligibleRateDiffBps: negligibleRateDiffBps
            });
            Helper.assertEqual(
                gasPrice,
                await tempNetwork.maxGasPrice(),
                "Max gas price is not as expected"
            )
        });

        it("Add proxy", async() => {
            let fakeProxy = accounts[3];
            let txResult = await tempNetwork.addKyberProxy(fakeProxy, {from: admin});
            expectEvent(txResult, 'KyberProxyAdded', {
                kyberProxy: fakeProxy
            });
        });

        it("Remove proxy", async() => {
            let fakeProxy = accounts[4];
            await tempNetwork.addKyberProxy(fakeProxy, {from: admin});
            let txResult = await tempNetwork.removeKyberProxy(fakeProxy, {from: admin});
            expectEvent(txResult, 'KyberProxyRemoved', {
                kyberProxy: fakeProxy
            });
        });

        it("Remove proxy not avaiable", async() => {
            await expectRevert(tempNetwork.removeKyberProxy(ethAddress, {from: admin}), "kyberProxy not found");
        });

        it("Set enable", async() => {
            let txResult = await tempNetwork.setEnable(true, {from: admin});
            expectEvent(txResult, 'KyberNetworkSetEnable', {
                isEnabled: true
            });
        });
    });

    describe("test list reserves", async function() {
        let tempNetwork;
        let tempStorage;
        let mockReserve;
        let token;
        let reserveInstances;

        before("global setup", async function(){
            tempStorage = accounts[1];
            tempNetwork = await KyberNetwork.new(admin, tempStorage);

            mockReserve = await MockReserve.new();

            await tempNetwork.addOperator(operator, {from: admin});

            //init feeHandler
            token = await TestToken.new("kyber network crystal", "KNC", 18);
        });

        it("test can not list token with unauthorized personnel", async function() {
            await expectRevert(
                tempNetwork.listTokenForReserve(
                    mockReserve.address,
                    token.address,
                    true,
                    {from: accounts[0]}
                ),
                "only kyberStorage"
            );
        });

        it("test can list token, allowance changes as expected", async function() {
            await tempNetwork.listTokenForReserve(
                mockReserve.address,
                token.address,
                true,
                {from: tempStorage}
            );
            Helper.assertEqual(
                MAX_ALLOWANCE,
                await token.allowance(tempNetwork.address, mockReserve.address)
            );
        });

        it("test can unlist token, allowance changes as expected", async function() {
            await tempNetwork.listTokenForReserve(
                mockReserve.address,
                token.address,
                false,
                {from: tempStorage}
            );
            Helper.assertEqual(
                zeroBN,
                await token.allowance(tempNetwork.address, mockReserve.address)
            );
        });

        it("test list reserves for token from unauthorized personnel", async() => {
            await expectRevert(
                tempNetwork.listReservesForToken(
                    token.address,
                    0,
                    0,
                    true, {from: accounts[0]}
                ),
                "only operator"
            )
        });

        describe("test list and unlist reserves for token", async function() {
            let tempStorage;
            let tempNetwork;
            let reserveAddresses;

            beforeEach("setup data", async() => {
                tempStorage = await nwHelper.setupStorage(admin);
                tempNetwork = await KyberNetwork.new(admin, tempStorage.address);
                await tempStorage.setNetworkContract(tempNetwork.address, {from: admin});
                await tempStorage.addOperator(operator, {from: admin});

                let result = await nwHelper.setupReserves(network, [token], 2,0,0,0, accounts, admin, operator);

                reserveInstances = result.reserveInstances;
                reserveAddresses = [];

                await tempNetwork.addOperator(operator, {from: admin});
                await tempStorage.setFeeAccountedPerReserveType(true, true, true, false, true, true, {from: admin});
                await tempStorage.setEntitledRebatePerReserveType(true, false, true, false, true, true, {from: admin});
                await nwHelper.addReservesToStorage(tempStorage, reserveInstances, [token], operator);

                tempNetwork = await KyberNetwork.new(admin, tempStorage.address);
                await tempNetwork.addOperator(operator, {from: admin});

                for (const [key, value] of Object.entries(reserveInstances)) {
                    reserve = value.instance;
                    reserveAddresses.push(reserve.address);
                }
            });

            it("test list reserves start index > end index", async() => {
                let tx = await tempNetwork.listReservesForToken(
                    token.address, 1, 0, true, {from: operator}
                );
                // no event should be emitted
                Helper.assertEqual(tx.receipt.logs.length, 0);
            });

            it("test list reserves token is not listed, list reserves is empty", async() => {
                let newToken = await TestToken.new("test token", "tst", 18);
                let tx = await tempNetwork.listReservesForToken(
                    newToken.address, 0, 0, true, {from: operator}
                );
                // no event should be emitted
                Helper.assertEqual(tx.receipt.logs.length, 0);
            });

            it("test list reserves empty as indices are higher than reserves length", async() => {
                let newToken = await TestToken.new("test token", "tst", 18);
                // start + end out of bound
                let tx = await tempNetwork.listReservesForToken(
                    newToken.address, 4, 5, true, {from: operator}
                )
                // no event should be emitted
                Helper.assertEqual(tx.receipt.logs.length, 0);
                tx = await tempNetwork.listReservesForToken(
                    newToken.address, 4, 4, true, {from: operator}
                )
                // no event should be emitted
                Helper.assertEqual(tx.receipt.logs.length, 0);
            });

            it("test list/unlist 1 reserve", async() => {
                // list 1 reserve
                let txResult = await tempNetwork.listReservesForToken(
                    token.address, 0, 0, true, {from: operator}
                )
                expectEvent(txResult, 'ListedReservesForToken', {
                    token: token.address,
                    add: true
                })
                let eventLogs;
                for (let i = 0; i < txResult.logs.length; i++) {
                    if (txResult.logs[i].event == 'ListedReservesForToken') {
                        eventLogs = txResult.logs[i];
                        break;
                    }
                }
                Helper.assertEqual(eventLogs.args.reserves.length, 1);
                Helper.assertEqual(reserveAddresses[0], eventLogs.args.reserves[0]);
                Helper.assertEqual(
                    MAX_ALLOWANCE,
                    await token.allowance(tempNetwork.address, reserveAddresses[0])
                );
                // unlist reserves
                txResult = await tempNetwork.listReservesForToken(
                    token.address, 0, 0, false, {from: operator}
                )
                expectEvent(txResult, 'ListedReservesForToken', {
                    token: token.address,
                    add: false
                })
                for (let i = 0; i < txResult.logs.length; i++) {
                    if (txResult.logs[i].event == 'ListedReservesForToken') {
                        eventLogs = txResult.logs[i];
                        break;
                    }
                }
                Helper.assertEqual(eventLogs.args.reserves.length, 1);
                Helper.assertEqual(reserveAddresses[0], eventLogs.args.reserves[0]);
                Helper.assertEqual(
                    0,
                    await token.allowance(tempNetwork.address, reserveAddresses[0])
                );
                // unlist reserve that already unlisted
                txResult = await tempNetwork.listReservesForToken(
                    token.address, 0, 0, false, {from: operator}
                )
            });

            it("test list/unlist with end index out of bound", async() => {
                // list 1 reserve
                let txResult = await tempNetwork.listReservesForToken(
                    token.address, 0, 2, true, {from: operator}
                )
                expectEvent(txResult, 'ListedReservesForToken', {
                    token: token.address,
                    add: true
                })
                let eventLogs;
                for (let i = 0; i < txResult.logs.length; i++) {
                    if (txResult.logs[i].event == 'ListedReservesForToken') {
                        eventLogs = txResult.logs[i];
                        break;
                    }
                }
                Helper.assertEqual(eventLogs.args.reserves.length, 2);
                for(let i = 0; i < 1; i++) {
                    Helper.assertEqual(reserveAddresses[i], eventLogs.args.reserves[i]);
                    Helper.assertEqual(
                        MAX_ALLOWANCE,
                        await token.allowance(tempNetwork.address, reserveAddresses[i])
                    );
                }
                // unlist reserves
                txResult = await tempNetwork.listReservesForToken(
                    token.address, 0, 2, false, {from: operator}
                )
                expectEvent(txResult, 'ListedReservesForToken', {
                    token: token.address,
                    add: false
                })
                for (let i = 0; i < txResult.logs.length; i++) {
                    if (txResult.logs[i].event == 'ListedReservesForToken') {
                        eventLogs = txResult.logs[i];
                        break;
                    }
                }
                Helper.assertEqual(eventLogs.args.reserves.length, 2);
                for(let i = 0; i < 1; i++) {
                    Helper.assertEqual(reserveAddresses[i], eventLogs.args.reserves[i]);
                    Helper.assertEqual(
                        0,
                        await token.allowance(tempNetwork.address, reserveAddresses[i])
                    );
                }
            });
        });
        // TODO: add trade tests after changing network
    });

    describe("test enable network", async function(){
        let tempNetwork;
        let tempMatchingEngine;
        let tempStorage;

        before("global setup", async function(){
            tempStorage = await nwHelper.setupStorage(admin);
            tempNetwork = await MockNetwork.new(admin, tempStorage.address);
            await tempStorage.setNetworkContract(tempNetwork.address, {from: admin});
            tempMatchingEngine = await MatchingEngine.new(admin);

            mockReserve = await MockReserve.new();
            gasHelperAdd = accounts[9];

            await tempNetwork.addOperator(operator, {from: admin});
            await tempMatchingEngine.setNetworkContract(tempNetwork.address, {from: admin});
            await tempMatchingEngine.setKyberStorage(tempStorage.address, {from: admin});
            await tempStorage.setFeeAccountedPerReserveType(true, true, true, false, true, true, {from: admin});
            await tempStorage.setEntitledRebatePerReserveType(true, false, true, false, true, true, {from: admin});

            //init feeHandler
            KNC = await TestToken.new("kyber network crystal", "KNC", 18);
            proxyForFeeHandler = tempNetwork;
            feeHandler = await FeeHandler.new(kyberDao.address, proxyForFeeHandler.address, tempNetwork.address, KNC.address, burnBlockInterval, kyberDao.address);
            rateHelper = await RateHelper.new(admin);
            await rateHelper.setContracts(kyberDao.address, tempStorage.address, {from: admin});
        });

        it("set enable without feeHandler", async function(){
            await tempNetwork.setContracts(zeroAddress, tempMatchingEngine.address, gasHelperAdd, {from: admin});
            await expectRevert.unspecified(tempNetwork.setEnable(true, {from: admin}));
        });

        it("set enable without matching engine", async function(){
            await tempNetwork.setContracts(feeHandler.address, zeroAddress, gasHelperAdd, {from: admin});
            await expectRevert.unspecified(tempNetwork.setEnable(true, {from: admin}));
        });

        it("set enable without proxy contract", async function(){
            await tempNetwork.setContracts(feeHandler.address, tempMatchingEngine.address, gasHelperAdd, {from: admin});
            await expectRevert.unspecified(tempNetwork.setEnable(true, {from: admin}));
        });
    });

    describe("test adding and removing reserves with fault matching engine", async() => {
        beforeEach("global setup ", async() => {
            tempStorage = await nwHelper.setupStorage(admin);
            tempNetwork = await KyberNetwork.new(admin, tempStorage.address);
            await tempStorage.setNetworkContract(tempNetwork.address, {from: admin});
            await tempStorage.addOperator(operator, {from: admin});
            tempMatchingEngine = await MatchingEngine.new(admin);
            mockReserve = await MockReserve.new();

            await tempNetwork.addOperator(operator, {from: admin});
            await tempMatchingEngine.setNetworkContract(tempNetwork.address, {from: admin});
            await tempMatchingEngine.setKyberStorage(tempStorage.address, {from: admin});
            await tempStorage.setFeeAccountedPerReserveType(true, true, true, false, true, true, {from: admin});
            await tempStorage.setEntitledRebatePerReserveType(true, false, true, false, true, true, {from: admin});

            //init feeHandler
            KNC = await TestToken.new("kyber network crystal", "KNC", 18);
            proxyForFeeHandler = tempNetwork;
            feeHandler = await FeeHandler.new(kyberDao.address, proxyForFeeHandler.address, tempNetwork.address, KNC.address, burnBlockInterval, kyberDao.address);
            rateHelper = await RateHelper.new(admin);
            await rateHelper.setContracts(kyberDao.address, tempStorage.address, {from: admin});
            await tempNetwork.setContracts(feeHandler.address, tempMatchingEngine.address, gasHelperAdd, {from: admin});
        });

        it("add reserve none type revert", async function(){
            let anyWallet = taker;
            let reserveID =  nwHelper.genReserveID(MOCK_ID, mockReserve.address);

            console.log("mock reserve", mockReserve.address);
            console.log("reserve ID", reserveID)
            console.log("any wallet", anyWallet)

            await expectRevert.unspecified(
                tempStorage.addReserve(mockReserve.address, reserveID , ReserveType.NONE, anyWallet, {from: operator}),
            );
        });

        it("remove reserve revert", async function(){
            await expectRevert(
                tempStorage.removeReserve(nwHelper.genReserveID(MOCK_ID, ethAddress), 0, {from: operator}),
                "reserveId not found"
            )
        });

        it("List pair For unlisted reserve eth to token", async function() {
            let anotherMockReserve = await MockReserve.new();
            let mockID = nwHelper.genReserveID(MOCK_ID, anotherMockReserve.address);
            await expectRevert.unspecified(
                tempStorage.listPairForReserve(mockID, KNC.address, true, true, true, {from: operator})
            );
        });

        it("set invalid neligible rate diff bps", async function(){
            let bps = BPS.add(new BN(1))
            await expectRevert.unspecified(
                tempNetwork.setParams(gasPrice, bps, {from: admin})
            );
        })

    });

    describe("test trades with MockKyberDao", async() => {
        before("initialise KyberDao, network and reserves", async() => {
            // KyberDao related init.
            expiryTimestamp = await Helper.getCurrentBlockTime() + 10;
            kyberDao = await MockDao.new(rewardInBPS, rebateInBPS, epoch, expiryTimestamp);
            await kyberDao.setNetworkFeeBps(networkFeeBps);

            // init storage and network
            storage = await nwHelper.setupStorage(admin);
            network = await KyberNetwork.new(admin, storage.address);
            await storage.setNetworkContract(network.address, {from: admin});
            await storage.addOperator(operator, {from: admin});

            // set proxy same as network
            proxyForFeeHandler = network;

            // init feeHandler
            KNC = await TestToken.new("kyber network crystal", "KNC", 18);
            feeHandler = await FeeHandler.new(kyberDao.address, proxyForFeeHandler.address, network.address, KNC.address, burnBlockInterval, kyberDao.address);

            // init matchingEngine
            matchingEngine = await MatchingEngine.new(admin);
            await matchingEngine.setNetworkContract(network.address, {from: admin});
            await matchingEngine.setKyberStorage(storage.address, {from: admin});
            await storage.setFeeAccountedPerReserveType(true, true, true, false, true, true, {from: admin});
            await storage.setEntitledRebatePerReserveType(true, false, true, false, true, true, {from: admin});

            // init rateHelper
            rateHelper = await RateHelper.new(admin);
            await rateHelper.setContracts(kyberDao.address, storage.address, {from: admin});

            // init gas helper
            // tests gasHelper when gasHelper != address(0), and when a trade is being done
            gasHelperAdd = await MockGasHelper.new(platformWallet);

            // setup network
            await network.setContracts(feeHandler.address, matchingEngine.address,
                gasHelperAdd.address, {from: admin});
            await network.addOperator(operator, {from: admin});
            await network.addKyberProxy(networkProxy, {from: admin});
            await network.setKyberDaoContract(kyberDao.address, {from: admin});
            //set params, enable network
            await network.setParams(gasPrice, negligibleRateDiffBps, {from: admin});
            await network.setEnable(true, {from: admin});
        });

        beforeEach("zero network balance", async() => {
            await Helper.zeroNetworkBalance(network, tokens, admin);
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
                numReserves = result.numAddedReserves * 1;

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
                Helper.assertEqual(actualResult.rateWithNetworkFee, zeroBN, "rate with network fee not 0");
                Helper.assertEqual(actualResult.rateWithAllFees, zeroBN, "rate with all fees not 0");

                actualResult = await network.getExpectedRateWithHintAndFee(ethAddress, unlistedDestToken.address, ethSrcQty, platformFeeBps, emptyHint);
                Helper.assertEqual(actualResult.rateWithNetworkFee, zeroBN, "rate with network fee not 0");
                Helper.assertEqual(actualResult.rateWithAllFees, zeroBN, "rate with all fees not 0");

                actualResult = await network.getExpectedRateWithHintAndFee(unlistedSrcToken.address, unlistedDestToken.address, ethSrcQty, platformFeeBps, emptyHint);
                Helper.assertEqual(actualResult.rateWithNetworkFee, zeroBN, "rate with network fee not 0");
                Helper.assertEqual(actualResult.rateWithAllFees, zeroBN, "rate with all fees not 0");
            });

            for (tradeType of tradeTypesArray) {
                let hintType = tradeType;
                it(`should return 0 rate (${tradeStr[hintType]}) if all reserves return zero rate`, async() => {
                    hint = await nwHelper.getHint(rateHelper, matchingEngine, reserveInstances, hintType, undefined, srcToken.address, ethAddress, srcQty);
                    actualResult = await network.getExpectedRateWithHintAndFee(srcToken.address, ethAddress, srcQty, platformFeeBps, hint);
                    Helper.assertEqual(actualResult.rateWithNetworkFee, zeroBN, "rate with network fee not 0");
                    Helper.assertEqual(actualResult.rateWithAllFees, zeroBN, "rate with all fees not 0");

                    hint = await nwHelper.getHint(rateHelper, matchingEngine, reserveInstances, hintType, undefined, ethAddress, destToken.address, ethSrcQty);
                    actualResult = await network.getExpectedRateWithHintAndFee(ethAddress, destToken.address, ethSrcQty, platformFeeBps, emptyHint);
                    Helper.assertEqual(actualResult.rateWithNetworkFee, zeroBN, "rate with network fee not 0");
                    Helper.assertEqual(actualResult.rateWithAllFees, zeroBN, "rate with all fees not 0");

                    hint = await nwHelper.getHint(rateHelper, matchingEngine, reserveInstances, hintType, undefined, srcToken.address, destToken.address, srcQty);
                    actualResult = await network.getExpectedRateWithHintAndFee(srcToken.address, destToken.address, srcQty, platformFeeBps, emptyHint);
                    Helper.assertEqual(actualResult.rateWithNetworkFee, zeroBN, "rate with network fee not 0");
                    Helper.assertEqual(actualResult.rateWithAllFees, zeroBN, "rate with all fees not 0");
                });

                it(`should return 0 rate (${tradeStr[hintType]}) with zero srcQty, and all reserves return zero rate`, async() => {
                    srcQty = zeroBN;
                    hint = await nwHelper.getHint(rateHelper, matchingEngine, reserveInstances, hintType, undefined, srcToken.address, ethAddress, srcQty);
                    actualResult = await network.getExpectedRateWithHintAndFee(srcToken.address, ethAddress, srcQty, platformFeeBps, hint);
                    Helper.assertEqual(actualResult.rateWithNetworkFee, zeroBN, "rate with network fee not 0");
                    Helper.assertEqual(actualResult.rateWithAllFees, zeroBN, "rate with all fees not 0");

                    hint = await nwHelper.getHint(rateHelper, matchingEngine, reserveInstances, hintType, undefined, ethAddress, destToken.address, ethSrcQty);
                    actualResult = await network.getExpectedRateWithHintAndFee(ethAddress, destToken.address, ethSrcQty, platformFeeBps, emptyHint);
                    Helper.assertEqual(actualResult.rateWithNetworkFee, zeroBN, "rate with network fee not 0");
                    Helper.assertEqual(actualResult.rateWithAllFees, zeroBN, "rate with all fees not 0");

                    hint = await nwHelper.getHint(rateHelper, matchingEngine, reserveInstances, MASK_IN_HINTTYPE, undefined, srcToken.address, destToken.address, srcQty);
                    actualResult = await network.getExpectedRateWithHintAndFee(srcToken.address, destToken.address, srcQty, platformFeeBps, emptyHint);
                    Helper.assertEqual(actualResult.rateWithNetworkFee, zeroBN, "rate with network fee not 0");
                    Helper.assertEqual(actualResult.rateWithAllFees, zeroBN, "rate with all fees not 0");
                });

                it("should revert for trade attempt", async() => {
                    hint = await nwHelper.getHint(rateHelper, matchingEngine, reserveInstances, hintType, undefined, srcToken.address, ethAddress, srcQty);
                    await srcToken.transfer(network.address, srcQty);
                    await expectRevert(
                        network.tradeWithHint(networkProxy, srcToken.address, srcQty, ethAddress, taker,
                            maxDestAmt, minConversionRate, platformWallet, hint),
                        "trade invalid, if hint involved, try parseHint API"
                    );
                });
            };

            describe("should return 0 rate when trying to trade a token with a reserve that is not listed with this token", async() => {
                let reserveIds = [];
                let splitValueBps = [];
                let delistedReserve;
                before("delist 1st reserve for token", async() => {
                    //set zero rates
                    for (const [key, value] of Object.entries(reserveInstances)) {
                        reserve = value.instance;
                        for (let j = 0; j < numTokens; j++) {
                            await reserve.setRate(tokens[j].address, precisionUnits, precisionUnits);
                        }
                        reserveIds.push(value.reserveId);
                        splitValueBps.push((BPS.div(new BN(2))).toString()); // 2 mock reserve, each have splitValue is BPS/2
                    }
                    reserveIds.sort();

                    srcToken = tokens[0];
                    destToken = tokens[1];

                    for (const [key, value] of Object.entries(reserveInstances)) {
                        delistedReserve = value;
                        break;
                    }

                    await storage.listPairForReserve(delistedReserve.reserveId, srcToken.address, false, true, false, {from: operator});
                    await storage.listPairForReserve(delistedReserve.reserveId, destToken.address, true, false, false, {from: operator});
                });

                after("undo changes", async() => {
                    for (const [key, value] of Object.entries(reserveInstances)) {
                        reserve = value.instance;
                        for (let j = 0; j < numTokens; j++) {
                            await reserve.setRate(tokens[j].address, zeroBN, zeroBN);
                        }
                    }
                    await storage.listPairForReserve(delistedReserve.reserveId, srcToken.address, false, true, true, {from: operator});
                    await storage.listPairForReserve(delistedReserve.reserveId, destToken.address, true, false, true, {from: operator});
                });

                // 2 types of trade that specify which reserve will be chosen
                for(tradeType of [MASK_IN_HINTTYPE, SPLIT_HINTTYPE]) {
                    let hintType = tradeType;
                    it(`should return 0 rate for t2e trade (${tradeStr[hintType]}) if reserveID is not listed`, async() => {
                        splits = (hintType == MASK_IN_HINTTYPE) ? [] : splitValueBps;
                        hint = Helper.buildHint(tradeStr[hintType])(hintType, reserveIds, splits);
                    
                        actualResult = await network.getExpectedRateWithHintAndFee(srcToken.address, ethAddress, srcQty, platformFeeBps, hint);
                        Helper.assertEqual(actualResult.rateWithNetworkFee, zeroBN, "rateWithNetworkFee is not zero");
                        Helper.assertEqual(actualResult.rateWithAllFees, zeroBN, "rateWithAllFees is not zero")
                    });

                    it(`should return 0 rate for e2t trade (${tradeStr[hintType]}) if reserveID is not listed`, async() => {
                        splits = (hintType == MASK_IN_HINTTYPE) ? [] : splitValueBps;
                        hint = Helper.buildHint(tradeStr[hintType])(hintType, reserveIds, splits);
                    
                        actualResult = await network.getExpectedRateWithHintAndFee(ethAddress, destToken.address, ethSrcQty, platformFeeBps, hint);
                        Helper.assertEqual(actualResult.rateWithNetworkFee, zeroBN, "rateWithNetworkFee is not zero");
                        Helper.assertEqual(actualResult.rateWithAllFees, zeroBN, "rateWithAllFees is not zero")
                    });

                    it(`should revert for t2e trade (${tradeStr[hintType]}) if reserveID is not listed`, async() => {
                        splits = (hintType == MASK_IN_HINTTYPE) ? [] : splitValueBps;
                        hint = Helper.buildHint(tradeStr[hintType])(hintType, reserveIds, splits);

                        srcToken.transfer(network.address, srcQty);
                        await expectRevert(
                            network.tradeWithHint(networkProxy, srcToken.address, srcQty, ethAddress, taker,
                                maxDestAmt, minConversionRate, platformWallet, hint),
                            "trade invalid, if hint involved, try parseHint API"
                        );
                    });

                    it(`should revert for e2t trade (${tradeStr[hintType]}) if reserveID is not listed`, async() => {
                        splits = (hintType == MASK_IN_HINTTYPE) ? [] : splitValueBps;
                        hint = Helper.buildHint(tradeStr[hintType])(hintType, reserveIds, splits);
                        
                        await expectRevert(
                            network.tradeWithHint(networkProxy, ethAddress, ethSrcQty, destToken.address, taker,
                                maxDestAmt, minConversionRate, platformWallet, hint, { value: ethSrcQty}),
                            "trade invalid, if hint involved, try parseHint API"
                        );
                    });
                }
            });
        });

        describe("test getExpectedRate functions with rate validating reserves, valid rates", async() => {
            before("setup, add and list reserves", async() => {
                //init reserves
                let result = await nwHelper.setupReserves(network, tokens.slice(0,3), 0, 0, 0, 9, accounts, admin, operator);

                reserveInstances = result.reserveInstances;
                numReserves = result.numAddedReserves * 1;

                //add and list pair for reserve
                let j = 0;
                for (const [key, value] of Object.entries(reserveInstances)) {
                    reserve = value;
                    console.log("add reserve type: " + reserve.type + " ID: " + reserve.reserveId);
                    let rebateWallet = (reserve.rebateWallet == zeroAddress || reserve.rebateWallet == undefined)
                        ? reserve.address : reserve.rebateWallet;
                    await storage.addReserve(reserve.address, reserve.reserveId, reserve.onChainType, rebateWallet, {from: operator});
                    await storage.listPairForReserve(reserve.reserveId, tokens[j%3].address, true, true, true, {from: operator});
                    j++;
                }
            });

            after("unlist and remove reserve", async() => {
                await nwHelper.removeReservesFromStorage(storage, reserveInstances, tokens, operator);
                reserveInstances = {};
            });

            describe("backward compatible getExpectedRate (no hint)", async() => {
                it("should get expected rate, no fees at all for T2E, E2T & T2T", async() => {
                    //setup mockKyberDao with zero network bps
                    expiryTimestamp = await Helper.getCurrentBlockTime() + 10;
                    let tempKyberDao = await MockDao.new(rewardInBPS, rebateInBPS, epoch, expiryTimestamp);
                    await tempKyberDao.setNetworkFeeBps(zeroBN);
                    await network.setKyberDaoContract(tempKyberDao.address, {from: admin});

                    expectedResult = await nwHelper.getAndCalcRates(matchingEngine, storage, reserveInstances,
                        srcToken.address, ethAddress, srcQty,
                        srcDecimals, ethDecimals,
                        zeroBN, zeroBN, emptyHint);

                    actualResult = await network.getExpectedRate(srcToken.address, ethAddress, srcQty);
                    Helper.assertEqual(expectedResult.rateWithNetworkFee, actualResult.expectedRate, "expected rate with network fee != actual rate for T2E");

                    expectedResult = await nwHelper.getAndCalcRates(matchingEngine, storage, reserveInstances,
                        ethAddress, destToken.address, ethSrcQty,
                        ethDecimals, destDecimals,
                        zeroBN, zeroBN, emptyHint);
                    actualResult = await network.getExpectedRate(ethAddress, destToken.address, ethSrcQty);
                    Helper.assertEqual(expectedResult.rateWithNetworkFee, actualResult.expectedRate, "expected rate with network fee != actual rate for E2T");

                    expectedResult = await nwHelper.getAndCalcRates(matchingEngine, storage, reserveInstances,
                        srcToken.address, destToken.address, srcQty,
                        srcDecimals, destDecimals,
                        zeroBN, zeroBN, emptyHint);
                    actualResult = await network.getExpectedRate(srcToken.address, destToken.address, srcQty);
                    Helper.assertEqual(expectedResult.rateWithNetworkFee, actualResult.expectedRate, "expected rate with network fee != actual rate for T2T");

                    await network.setKyberDaoContract(kyberDao.address, {from: admin});
                });

                it("should return rates for pseudo-zero srcQty", async() => {
                    let modifiedSrcQty = new BN(1); //network backwards compatible function sets to 1

                    expectedResult = await nwHelper.getAndCalcRates(matchingEngine, storage, reserveInstances,
                        srcToken.address, ethAddress, modifiedSrcQty,
                        srcDecimals, ethDecimals,
                        networkFeeBps, zeroBN, emptyHint);
                    actualResult = await network.getExpectedRate(srcToken.address, ethAddress, zeroBN);
                    Helper.assertEqual(expectedResult.rateWithNetworkFee, actualResult.expectedRate, "expected rate with network fee != actual rate for T2E");

                    expectedResult = await nwHelper.getAndCalcRates(matchingEngine, storage, reserveInstances,
                        ethAddress, destToken.address, modifiedSrcQty,
                        ethDecimals, destDecimals,
                        networkFeeBps, zeroBN, emptyHint);
                    actualResult = await network.getExpectedRate(ethAddress, destToken.address, zeroBN);
                    Helper.assertEqual(expectedResult.rateWithNetworkFee, actualResult.expectedRate, "expected rate with network fee != actual rate for E2T");

                    expectedResult = await nwHelper.getAndCalcRates(matchingEngine, storage, reserveInstances,
                        srcToken.address, destToken.address, modifiedSrcQty,
                        srcDecimals, destDecimals,
                        networkFeeBps, zeroBN, emptyHint);
                    actualResult = await network.getExpectedRate(srcToken.address, destToken.address, zeroBN);
                    Helper.assertEqual(expectedResult.rateWithNetworkFee, actualResult.expectedRate, "expected rate with network fee != actual rate for T2T");
                });

                it(`should return rates with networkFeeBps ${networkFeeBps.toString()} bps for T2E, E2T & T2T`, async() => {
                    expectedResult = await nwHelper.getAndCalcRates(matchingEngine, storage, reserveInstances,
                        srcToken.address, ethAddress, srcQty,
                        srcDecimals, ethDecimals,
                        networkFeeBps, zeroBN, emptyHint);
                    actualResult = await network.getExpectedRate(srcToken.address, ethAddress, srcQty);
                    Helper.assertEqual(expectedResult.rateWithNetworkFee, actualResult.expectedRate, "expected rate with network fee != actual rate for T2E");

                    expectedResult = await nwHelper.getAndCalcRates(matchingEngine, storage, reserveInstances,
                        ethAddress, destToken.address, ethSrcQty,
                        ethDecimals, destDecimals,
                        networkFeeBps, zeroBN, emptyHint);
                    actualResult = await network.getExpectedRate(ethAddress, destToken.address, ethSrcQty);
                    Helper.assertEqual(expectedResult.rateWithNetworkFee, actualResult.expectedRate, "expected rate with network fee != actual rate for E2T");
                    expectedResult = await nwHelper.getAndCalcRates(matchingEngine, storage, reserveInstances,
                        srcToken.address, destToken.address, srcQty,
                        srcDecimals, destDecimals,
                        networkFeeBps, zeroBN, emptyHint);
                    actualResult = await network.getExpectedRate(srcToken.address, destToken.address, srcQty);
                    Helper.assertEqual(expectedResult.rateWithNetworkFee, actualResult.expectedRate, "expected rate with network fee != actual rate for T2T");
                });
            });

            describe("getExpectedRateWithHintAndFee", async() => {
                it("should get expected rate, no fees at all for T2E, E2T & T2T", async() => {
                    //setup mockKyberDao with zero network bps
                    expiryTimestamp = await Helper.getCurrentBlockTime() + 10;
                    let tempKyberDao = await MockDao.new(rewardInBPS, rebateInBPS, epoch, expiryTimestamp);
                    await tempKyberDao.setNetworkFeeBps(zeroBN);
                    await network.setKyberDaoContract(tempKyberDao.address, {from: admin});

                    expectedResult = await nwHelper.getAndCalcRates(matchingEngine, storage, reserveInstances,
                        srcToken.address, ethAddress, srcQty,
                        srcDecimals, ethDecimals,
                        zeroBN, zeroBN, emptyHint);

                    actualResult = await network.getExpectedRateWithHintAndFee(srcToken.address, ethAddress, srcQty, zeroBN, emptyHint);
                    nwHelper.assertRatesEqual(expectedResult, actualResult);

                    expectedResult = await nwHelper.getAndCalcRates(matchingEngine, storage, reserveInstances,
                        ethAddress, destToken.address, ethSrcQty,
                        ethDecimals, destDecimals,
                        zeroBN, zeroBN, emptyHint);
                    actualResult = await network.getExpectedRateWithHintAndFee(ethAddress, destToken.address, ethSrcQty, zeroBN, emptyHint);
                    nwHelper.assertRatesEqual(expectedResult, actualResult);

                    expectedResult = await nwHelper.getAndCalcRates(matchingEngine, storage, reserveInstances,
                        srcToken.address, destToken.address, srcQty,
                        srcDecimals, destDecimals,
                        zeroBN, zeroBN, emptyHint);
                    actualResult = await network.getExpectedRateWithHintAndFee(srcToken.address, destToken.address, srcQty, zeroBN, emptyHint);
                    nwHelper.assertRatesEqual(expectedResult, actualResult);

                    await network.setKyberDaoContract(kyberDao.address, {from: admin});
                });

                it("should return rates for pseudo-zero srcQty", async() => {
                    let modifiedSrcQty = new BN(1); //function sets 0 to 1

                    expectedResult = await nwHelper.getAndCalcRates(matchingEngine, storage, reserveInstances,
                        srcToken.address, ethAddress, modifiedSrcQty,
                        srcDecimals, ethDecimals,
                        networkFeeBps, zeroBN, emptyHint);
                    actualResult = await network.getExpectedRateWithHintAndFee(srcToken.address, ethAddress, zeroBN, zeroBN, emptyHint);
                    nwHelper.assertRatesEqual(expectedResult, actualResult);

                    expectedResult = await nwHelper.getAndCalcRates(matchingEngine, storage, reserveInstances,
                        ethAddress, destToken.address, modifiedSrcQty,
                        ethDecimals, destDecimals,
                        networkFeeBps, zeroBN, emptyHint);
                    actualResult = await network.getExpectedRateWithHintAndFee(ethAddress, destToken.address, zeroBN, zeroBN, emptyHint);
                    nwHelper.assertRatesEqual(expectedResult, actualResult);

                    expectedResult = await nwHelper.getAndCalcRates(matchingEngine, storage, reserveInstances,
                        srcToken.address, destToken.address, modifiedSrcQty,
                        srcDecimals, destDecimals,
                        networkFeeBps, zeroBN, emptyHint);
                    actualResult = await network.getExpectedRateWithHintAndFee(srcToken.address, destToken.address, zeroBN, zeroBN, emptyHint);
                    nwHelper.assertRatesEqual(expectedResult, actualResult);
                });

                for (platformFeeBps of platformFeeArray) {
                    for (tradeType of tradeTypesArray) {
                        let platformFee = platformFeeBps;
                        let hintType = tradeType;

                        it(`should get expected rate (${tradeStr[hintType]} & platform fee ${platformFee.toString()} bps) for T2E, E2T & T2T`, async() => {
                            hint = await nwHelper.getHint(rateHelper, matchingEngine, reserveInstances, hintType, undefined, srcToken.address, ethAddress, srcQty);
                            expectedResult = await nwHelper.getAndCalcRates(matchingEngine, storage, reserveInstances,
                                srcToken.address, ethAddress, srcQty,
                                srcDecimals, ethDecimals,
                                networkFeeBps, platformFee, hint);
                            actualResult = await network.getExpectedRateWithHintAndFee(srcToken.address, ethAddress, srcQty, platformFee, hint);
                            nwHelper.assertRatesEqual(expectedResult, actualResult);

                            hint = await nwHelper.getHint(rateHelper, matchingEngine, reserveInstances, hintType, undefined, ethAddress, destToken.address, ethSrcQty);
                            expectedResult = await nwHelper.getAndCalcRates(matchingEngine, storage, reserveInstances,
                                ethAddress, destToken.address, ethSrcQty,
                                ethDecimals, destDecimals,
                                networkFeeBps, platformFee, hint);
                            actualResult = await network.getExpectedRateWithHintAndFee(ethAddress, destToken.address, ethSrcQty, platformFee, hint);
                            nwHelper.assertRatesEqual(expectedResult, actualResult);

                            hint = await nwHelper.getHint(rateHelper, matchingEngine, reserveInstances, hintType, undefined, srcToken.address, destToken.address, srcQty);
                            expectedResult = await nwHelper.getAndCalcRates(matchingEngine, storage, reserveInstances,
                                srcToken.address, destToken.address, srcQty,
                                srcDecimals, destDecimals,
                                networkFeeBps, platformFee, hint);
                            actualResult = await network.getExpectedRateWithHintAndFee(srcToken.address, destToken.address, srcQty, platformFee, hint);
                            nwHelper.assertRatesEqual(expectedResult, actualResult);
                        });
                    };
                };
            });

            describe("test getExpectedRate with malicious matching engine", async() => {
                let tempNetwork;
                let maliciousMatchingEngine;
                before("setup network with bad matching engine", async() => {
                    maliciousMatchingEngine = await MaliciousMatchingEngine.new();
                    await maliciousMatchingEngine.setKyberStorage(storage.address);
                    tempNetwork = await KyberNetwork.new(admin, storage.address);
                    await storage.setNetworkContract(tempNetwork.address, { from: admin });
                    await tempNetwork.setContracts(feeHandler.address, maliciousMatchingEngine.address, zeroAddress, { from: admin });
                });

                after("switch storage back to normal network", async() => {
                    await storage.setNetworkContract(network.address, { from: admin });
                });

                it("should revert for bad split array length", async() => {
                    await expectRevert(
                        tempNetwork.getExpectedRate(srcToken.address, destToken.address, srcQty),
                        "bad split array"
                    );
                });

                it("should revert for bad split bps values", async() => {
                    let correctArrLength = (await storage.getReserveIdsPerTokenSrc(srcToken.address)).length;
                    await maliciousMatchingEngine.setSplitLength(correctArrLength);
                    await maliciousMatchingEngine.setBadValues(true);
                    await expectRevert(
                        tempNetwork.getExpectedRate(srcToken.address, destToken.address, srcQty),
                        "invalid split bps"
                    );
                });

                it("should revert if doMatch returns too many selected indexes", async() => {
                    let correctArrLength = (await storage.getReserveIdsPerTokenSrc(srcToken.address)).length;
                    await maliciousMatchingEngine.setSplitLength(correctArrLength);
                    await maliciousMatchingEngine.setBadValues(false);
                    await expectRevert(
                        tempNetwork.getExpectedRate(srcToken.address, destToken.address, srcQty),
                        "doMatch: too many reserves"
                    );
                });
            });

            describe("test getExpectedRate with malicious storage", async() => {
                let tempNetwork;
                let maliciousStorage;
                before("setup network with bad storage", async() => {
                    maliciousStorage = await MaliciousStorage.new();
                    tempNetwork = await KyberNetwork.new(admin, maliciousStorage.address);
                    await tempNetwork.setContracts(feeHandler.address, matchingEngine.address, zeroAddress, { from: admin });
                });

                it("should revert for bad fee array length", async() => {
                    await expectRevert(
                        tempNetwork.getExpectedRate(srcToken.address, destToken.address, srcQty),
                        "bad fee array"
                    );
                });

                it("should revert for bad rebate array length", async() => {
                    let correctArrLength = (await storage.getReserveIdsPerTokenSrc(srcToken.address)).length;
                    await maliciousStorage.setArrayLengths(correctArrLength, zeroBN, zeroBN);
                    await expectRevert(
                        tempNetwork.getExpectedRate(srcToken.address, destToken.address, srcQty),
                        "bad rebate array"
                    );
                });

                it("should revert for bad addresses array length", async() => {
                    let correctArrLength = (await storage.getReserveIdsPerTokenSrc(srcToken.address)).length;
                    await maliciousStorage.setArrayLengths(correctArrLength, correctArrLength, zeroBN);
                    await expectRevert(
                        tempNetwork.getExpectedRate(srcToken.address, destToken.address, srcQty),
                        "bad addresses array"
                    );
                });
            });

            it("should emit KyberTrade event for a test T2T split trade", async() => {
                hint = await nwHelper.getHint(rateHelper, matchingEngine, reserveInstances, SPLIT_HINTTYPE, undefined, srcToken.address, destToken.address, srcQty);
                expectedResult = await nwHelper.getAndCalcRates(matchingEngine, storage, reserveInstances,
                    srcToken.address, destToken.address, srcQty,
                    srcDecimals, destDecimals,
                    networkFeeBps, platformFeeBps, hint);

                await srcToken.transfer(network.address, srcQty);
                let txResult = await network.tradeWithHintAndFee(networkProxy, srcToken.address, srcQty, destToken.address, taker,
                    maxDestAmt, minConversionRate, platformWallet, platformFeeBps, hint);

                //have to check ids separately, because expectEvent does not support arrays
                expectEvent(txResult, 'KyberTrade', {
                    src: srcToken.address,
                    dest: destToken.address,
                    ethWeiValue: expectedResult.tradeWei,
                    networkFeeWei: expectedResult.networkFeeWei,
                    customPlatformFeeWei: expectedResult.platformFeeWei,
                });

                let actualT2Eids = txResult.logs[3].args.t2eIds;
                let actualE2Tids = txResult.logs[3].args.e2tIds;
                Helper.assertEqual(expectedResult.t2eIds.length, actualT2Eids.length, "T2E id length not equal");
                Helper.assertEqual(expectedResult.e2tIds.length, actualE2Tids.length, "E2T id length not equal");
                Helper.assertEqualArray(expectedResult.t2eIds, actualT2Eids, "T2E ids not equal");
                Helper.assertEqualArray(expectedResult.e2tIds, actualE2Tids, "E2T ids not equal");

                let actualT2EsrcAmounts = txResult.logs[3].args.t2eSrcAmounts;
                let actualE2TsrcAmounts = txResult.logs[3].args.e2tSrcAmounts;
                Helper.assertEqual(expectedResult.t2eSrcAmounts.length, actualT2EsrcAmounts.length, "T2E srcAmounts length not equal");
                Helper.assertEqual(expectedResult.e2tSrcAmounts.length, actualE2TsrcAmounts.length, "E2T srcAmounts length not equal");
                for (let i = 0; i < expectedResult.t2eSrcAmounts.length; i++) {
                    Helper.assertEqual(expectedResult.t2eSrcAmounts[i], actualT2EsrcAmounts[i], "T2E srcAmounts not equal");
                }
                for (let i = 0; i < expectedResult.e2tSrcAmounts.length; i++) {
                    Helper.assertEqual(expectedResult.e2tSrcAmounts[i], actualE2TsrcAmounts[i], "E2T srcAmounts not equal");
                }

                let actualT2Erates = txResult.logs[3].args.t2eRates;
                let actualE2Trates = txResult.logs[3].args.e2tRates;
                Helper.assertEqual(expectedResult.t2eRates.length, actualT2Erates.length, "T2E rates length not equal");
                Helper.assertEqual(expectedResult.e2tRates.length, actualE2Trates.length, "E2T rates length not equal");
                for (let i = 0; i < expectedResult.t2eSrcAmounts.length; i++) {
                    Helper.assertEqual(expectedResult.t2eRates[i], actualT2Erates[i], "T2E rates not equal");
                }
                for (let i = 0; i < expectedResult.e2tSrcAmounts.length; i++) {
                    Helper.assertEqual(expectedResult.e2tRates[i], actualE2Trates[i], "E2T rates not equal");
                }
            });

            for (tradeType of tradeTypesArray) {
                let hintType = tradeType;
                it(`should perform a T2E trade (backwards compatible, ${tradeStr[hintType]}) and check balances change as expected`, async() => {
                    hint = await nwHelper.getHint(rateHelper, matchingEngine, reserveInstances, hintType, undefined, srcToken.address, ethAddress, srcQty);

                    expectedResult = await nwHelper.getAndCalcRates(matchingEngine, storage, reserveInstances,
                        srcToken.address, ethAddress, srcQty,
                        srcDecimals, ethDecimals,
                        networkFeeBps, zeroBN, hint);

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

                    expectedResult = await nwHelper.getAndCalcRates(matchingEngine, storage, reserveInstances,
                        ethAddress, destToken.address, ethSrcQty,
                        ethDecimals, destDecimals,
                        networkFeeBps, zeroBN, hint);

                    let initialReserveBalances = await nwHelper.getReserveBalances(ethAddress, destToken, expectedResult);
                    let initialTakerBalances = await nwHelper.getTakerBalances(ethAddress, destToken, taker, networkProxy);

                    let txResult = await network.tradeWithHint(networkProxy, ethAddress, ethSrcQty, destToken.address, taker,
                        maxDestAmt, minConversionRate, platformWallet, hint, {value: ethSrcQty, gasPrice: new BN(0)});
                    console.log(`ETH -> token (${tradeStr[hintType]}): ${txResult.receipt.gasUsed} gas used`);

                    await nwHelper.compareBalancesAfterTrade(ethAddress, destToken, ethSrcQty,
                        initialReserveBalances, initialTakerBalances, expectedResult, taker, networkProxy);
                });

                it(`should perform a T2T trade (backwards compatible,  ${tradeStr[hintType]}) and check balances change as expected`, async() => {
                    hint = await nwHelper.getHint(rateHelper, matchingEngine, reserveInstances, hintType, undefined, srcToken.address, destToken.address, srcQty);

                    expectedResult = await nwHelper.getAndCalcRates(matchingEngine, storage, reserveInstances,
                        srcToken.address, destToken.address, srcQty,
                        srcDecimals, destDecimals,
                        networkFeeBps, zeroBN, hint);

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
                        hint = await nwHelper.getHint(rateHelper, matchingEngine, reserveInstances, hintType, undefined, srcToken.address, ethAddress, srcQty);

                        expectedResult = await nwHelper.getAndCalcRates(matchingEngine, storage, reserveInstances,
                            srcToken.address, ethAddress, srcQty,
                            srcDecimals, ethDecimals,
                            networkFeeBps, platformFee, hint);

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

                        expectedResult = await nwHelper.getAndCalcRates(matchingEngine, storage, reserveInstances,
                            ethAddress, destToken.address, ethSrcQty,
                            ethDecimals, destDecimals,
                            networkFeeBps, platformFee, hint);

                        let initialReserveBalances = await nwHelper.getReserveBalances(ethAddress, destToken, expectedResult);
                        let initialTakerBalances = await nwHelper.getTakerBalances(ethAddress, destToken, taker, networkProxy);

                        let txResult = await network.tradeWithHintAndFee(networkProxy, ethAddress, ethSrcQty, destToken.address, taker,
                            maxDestAmt, minConversionRate, platformWallet, platformFee, hint, {value: ethSrcQty, gasPrice: new BN(0)});
                        console.log(`ETH -> token (${tradeStr[hintType]}): ${txResult.receipt.gasUsed} gas used`);

                        await nwHelper.compareBalancesAfterTrade(ethAddress, destToken, ethSrcQty,
                            initialReserveBalances, initialTakerBalances, expectedResult, taker, networkProxy);
                    });

                    it(`should perform a T2T trade (${tradeStr[hintType]} & platform fee ${platformFee.toString()} bps) and check balances change as expected`, async() => {
                        hint = await nwHelper.getHint(rateHelper, matchingEngine, reserveInstances, hintType, undefined, srcToken.address, destToken.address, srcQty);

                        expectedResult = await nwHelper.getAndCalcRates(matchingEngine, storage, reserveInstances,
                            srcToken.address, destToken.address, srcQty,
                            srcDecimals, destDecimals,
                            networkFeeBps, platformFee, hint);

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

                    hint = await nwHelper.getHint(rateHelper, matchingEngine, reserveInstances, hintType, undefined, srcToken.address, ethAddress, srcQty);

                    expectedResult = await nwHelper.getAndCalcRates(matchingEngine, storage, reserveInstances,
                        srcToken.address, ethAddress, srcQty,
                        srcDecimals, ethDecimals,
                        networkFeeBps, platformFeeBps, hint);

                    let initialWalletFee = await feeHandler.feePerPlatformWallet(platformWallet);
                    await srcToken.transfer(network.address, srcQty);
                    let txResult = await network.tradeWithHintAndFee(networkProxy, srcToken.address, srcQty, ethAddress, taker,
                        maxDestAmt, minConversionRate, platformWallet, platformFeeBps, hint);

                    let expectedWalletFee = initialWalletFee.add(expectedResult.platformFeeWei);
                    let actualWalletFee = await feeHandler.feePerPlatformWallet(platformWallet);
                    Helper.assertEqual(actualWalletFee, expectedWalletFee, "platform fee did not receive fees");
                });
            }
        });

        describe("Test maxDestAmount normal cases", async() => {
            before("setup, add and list reserves", async() => {
                //init reserves
                let result = await nwHelper.setupReserves(network, tokens.slice(0,3), 0, 0, 0, 9, accounts, admin, operator);

                reserveInstances = result.reserveInstances;
                numReserves += result.numAddedReserves * 1;

                //add and list pair for reserve
                let j = 0;
                for (const [key, value] of Object.entries(reserveInstances)) {
                    reserve = value;
                    let rebateWallet = (reserve.rebateWallet == zeroAddress || reserve.rebateWallet == undefined)
                        ? reserve.address : reserve.rebateWallet;
                    await storage.addReserve(reserve.address, reserve.reserveId, reserve.onChainType, rebateWallet, {from: operator});
                    await storage.listPairForReserve(reserve.reserveId, tokens[j%3].address, true, true, true, {from: operator});
                    j++;
                }
            });

            after("unlist and remove reserve", async() => {
                await nwHelper.removeReservesFromStorage(storage, reserveInstances, tokens, operator);
                reserveInstances = {};
            });

            let reducedAmounts = [0, 1, 3, 11];
            for (tradeType of tradeTypesArray) {
                for (reduceAmt of reducedAmounts) {
                    let hintType = tradeType;
                    it(`should perform a T2E trade (${tradeStr[hintType]}, with maxDestAmount = actualDestAmount - ${reduceAmt}) and check balances change as expected`, async() => {
                        let platformFeeBps = new BN(50);
                        let actualSrcQty = new BN(0);
                        hint = await nwHelper.getHint(rateHelper, matchingEngine, reserveInstances, hintType, undefined, srcToken.address, ethAddress, srcQty);

                        expectedResult = await nwHelper.getAndCalcRates(matchingEngine, storage, reserveInstances,
                            srcToken.address, ethAddress, srcQty,
                            srcDecimals, ethDecimals,
                            networkFeeBps, platformFeeBps, hint);

                        let maxDestAmt = expectedResult.actualDestAmount.sub(new BN(reduceAmt));

                        await srcToken.transfer(network.address, srcQty);
                        let initialReserveBalances = await nwHelper.getReserveBalances(srcToken, ethAddress, expectedResult);
                        let initialTakerBalances = await nwHelper.getTakerBalances(srcToken, ethAddress, taker, network.address);
                        info = [srcQty, networkFeeBps, platformFeeBps];
                        [expectedResult, actualSrcQty] = await nwHelper.calcParamsFromMaxDestAmt(srcToken, ethAddress, expectedResult, info, maxDestAmt);

                        let txResult = await network.tradeWithHintAndFee(network.address, srcToken.address, srcQty, ethAddress, taker,
                            maxDestAmt, minConversionRate, platformWallet, platformFeeBps, hint);
                        console.log(`token -> ETH (${tradeStr[hintType]}): ${txResult.receipt.gasUsed} gas used`);
                        await nwHelper.compareBalancesAfterTrade(srcToken, ethAddress, actualSrcQty,
                            initialReserveBalances, initialTakerBalances, expectedResult, taker, network.address);
                    });

                    it(`should perform a E2T trade (${tradeStr[hintType]}, with maxDestAmount = actualDestAmount - ${reduceAmt}) and check balances change as expected`, async() => {
                        let platformFeeBps = new BN(50);
                        let actualSrcQty = new BN(0);

                        hint = await nwHelper.getHint(rateHelper, matchingEngine, reserveInstances, hintType, undefined, ethAddress, destToken.address, ethSrcQty);
                        info = [ethSrcQty, networkFeeBps, platformFeeBps];

                        expectedResult = await nwHelper.getAndCalcRates(matchingEngine, storage, reserveInstances,
                            ethAddress, destToken.address, ethSrcQty,
                            ethDecimals, destDecimals,
                            networkFeeBps, platformFeeBps, hint);

                        let maxDestAmt = expectedResult.actualDestAmount.sub(new BN(reduceAmt));

                        let initialReserveBalances = await nwHelper.getReserveBalances(ethAddress, destToken, expectedResult);
                        let initialTakerBalances = await nwHelper.getTakerBalances(ethAddress, destToken, taker, networkProxy);
                        [expectedResult, actualSrcQty] = await nwHelper.calcParamsFromMaxDestAmt(ethAddress, destToken, expectedResult, info, maxDestAmt);

                        let txResult = await network.tradeWithHintAndFee(networkProxy, ethAddress, ethSrcQty, destToken.address, taker,
                            maxDestAmt, minConversionRate, platformWallet, platformFeeBps, hint, {value: ethSrcQty, gasPrice: new BN(0)});
                        console.log(`ETH -> token (${tradeStr[hintType]}): ${txResult.receipt.gasUsed} gas used`);

                        await nwHelper.compareBalancesAfterTrade(ethAddress, destToken, actualSrcQty,
                            initialReserveBalances, initialTakerBalances, expectedResult, taker, networkProxy);
                    });

                    it(`should perform a T2T trade (${tradeStr[hintType]}, with maxDestAmount = actualDestAmount - ${reduceAmt}) and check balances change as expected`, async() => {
                        let platformFeeBps = new BN(50);
                        let actualSrcQty = new BN(0);
                        hint = await nwHelper.getHint(rateHelper, matchingEngine, reserveInstances, hintType, undefined, srcToken.address, destToken.address, srcQty);

                        expectedResult = await nwHelper.getAndCalcRates(matchingEngine, storage, reserveInstances,
                            srcToken.address, destToken.address, srcQty,
                            srcDecimals, destDecimals,
                            networkFeeBps, platformFeeBps, hint);

                        let maxDestAmt = expectedResult.actualDestAmount.sub(new BN(reduceAmt));

                        await srcToken.transfer(network.address, srcQty);
                        let initialReserveBalances = await nwHelper.getReserveBalances(srcToken, destToken, expectedResult);
                        let initialTakerBalances = await nwHelper.getTakerBalances(srcToken, destToken, taker, network.address);
                        info = [srcQty, networkFeeBps, platformFeeBps];
                        [expectedResult, actualSrcQty] = await nwHelper.calcParamsFromMaxDestAmt(srcToken, destToken, expectedResult, info, maxDestAmt);

                        let txResult = await network.tradeWithHintAndFee(network.address, srcToken.address, srcQty, destToken.address, taker,
                            maxDestAmt, minConversionRate, platformWallet, platformFeeBps, hint);
                        console.log(`token -> token (${tradeStr[hintType]}): ${txResult.receipt.gasUsed} gas used`);

                        await nwHelper.compareBalancesAfterTrade(srcToken, destToken, actualSrcQty,
                            initialReserveBalances, initialTakerBalances, expectedResult, taker, network.address);
                    });
                };
            };

            let maxDestAmounts = [3, 10];
            for (tradeType of tradeTypesArray) {
                for (maxDestAmount of maxDestAmounts) {
                    let hintType = tradeType;
                    it(`should perform a T2E trade (${tradeStr[hintType]}, with small maxDestAmount) and check balances change as expected`, async() => {
                        let platformFeeBps = new BN(10);
                        let actualSrcQty = new BN(0);
                        let maxDestAmt = new BN(maxDestAmount);
                        hint = await nwHelper.getHint(rateHelper, matchingEngine, reserveInstances, hintType, undefined, srcToken.address, ethAddress, srcQty);

                        expectedResult = await nwHelper.getAndCalcRates(matchingEngine, storage, reserveInstances,
                            srcToken.address, ethAddress, srcQty,
                            srcDecimals, ethDecimals,
                            networkFeeBps, platformFeeBps, hint);

                        await srcToken.transfer(network.address, srcQty);
                        let initialReserveBalances = await nwHelper.getReserveBalances(srcToken, ethAddress, expectedResult);
                        let initialTakerBalances = await nwHelper.getTakerBalances(srcToken, ethAddress, taker, network.address);
                        info = [srcQty, networkFeeBps, platformFeeBps];
                        [expectedResult, actualSrcQty] = await nwHelper.calcParamsFromMaxDestAmt(srcToken, ethAddress, expectedResult, info, maxDestAmt);

                        let txResult = await network.tradeWithHintAndFee(network.address, srcToken.address, srcQty, ethAddress, taker,
                            maxDestAmt, minConversionRate, platformWallet, platformFeeBps, hint);
                        console.log(`token -> ETH (${tradeStr[hintType]}): ${txResult.receipt.gasUsed} gas used`);
                        await nwHelper.compareBalancesAfterTrade(srcToken, ethAddress, actualSrcQty,
                            initialReserveBalances, initialTakerBalances, expectedResult, taker, network.address);
                    });

                    it(`should perform a E2T trade (${tradeStr[hintType]}, with small maxDestAmount) and check balances change as expected`, async() => {
                        let platformFeeBps = new BN(50);
                        let actualSrcQty = new BN(0);
                        let maxDestAmt = new BN(maxDestAmount);

                        hint = await nwHelper.getHint(rateHelper, matchingEngine, reserveInstances, hintType, undefined, ethAddress, destToken.address, ethSrcQty);
                        info = [ethSrcQty, networkFeeBps, platformFeeBps];

                        expectedResult = await nwHelper.getAndCalcRates(matchingEngine, storage, reserveInstances,
                            ethAddress, destToken.address, ethSrcQty,
                            ethDecimals, destDecimals,
                            networkFeeBps, platformFeeBps, hint);

                        let initialReserveBalances = await nwHelper.getReserveBalances(ethAddress, destToken, expectedResult);
                        let initialTakerBalances = await nwHelper.getTakerBalances(ethAddress, destToken, taker, networkProxy);
                        [expectedResult, actualSrcQty] = await nwHelper.calcParamsFromMaxDestAmt(ethAddress, destToken, expectedResult, info, maxDestAmt);

                        let txResult = await network.tradeWithHintAndFee(networkProxy, ethAddress, ethSrcQty, destToken.address, taker,
                            maxDestAmt, minConversionRate, platformWallet, platformFeeBps, hint, {value: ethSrcQty, gasPrice: new BN(0)});
                        console.log(`ETH -> token (${tradeStr[hintType]}): ${txResult.receipt.gasUsed} gas used`);
                        await nwHelper.compareBalancesAfterTrade(ethAddress, destToken, actualSrcQty,
                            initialReserveBalances, initialTakerBalances, expectedResult, taker, networkProxy);
                    });

                    it(`should perform a T2T trade (${tradeStr[hintType]}, with small maxDestAmount) and check balances change as expected`, async() => {
                        let platformFeeBps = new BN(50);
                        let actualSrcQty = new BN(0);
                        let maxDestAmt = new BN(maxDestAmount);
                        hint = await nwHelper.getHint(rateHelper, matchingEngine, reserveInstances, hintType, undefined, srcToken.address, destToken.address, srcQty);

                        expectedResult = await nwHelper.getAndCalcRates(matchingEngine, storage, reserveInstances,
                            srcToken.address, destToken.address, srcQty,
                            srcDecimals, destDecimals,
                            networkFeeBps, platformFeeBps, hint);

                        await srcToken.transfer(network.address, srcQty);
                        let initialReserveBalances = await nwHelper.getReserveBalances(srcToken, destToken, expectedResult);
                        let initialTakerBalances = await nwHelper.getTakerBalances(srcToken, destToken, taker, network.address);
                        info = [srcQty, networkFeeBps, platformFeeBps];
                        [expectedResult, actualSrcQty] = await nwHelper.calcParamsFromMaxDestAmt(srcToken, destToken, expectedResult, info, maxDestAmt);

                        let txResult = await network.tradeWithHintAndFee(network.address, srcToken.address, srcQty, destToken.address, taker,
                            maxDestAmt, minConversionRate, platformWallet, platformFeeBps, hint);
                        console.log(`token -> token (${tradeStr[hintType]}): ${txResult.receipt.gasUsed} gas used`);

                        await nwHelper.compareBalancesAfterTrade(srcToken, destToken, actualSrcQty,
                            initialReserveBalances, initialTakerBalances, expectedResult, taker, network.address);
                    });

                    it(`Test maxDestAmount, new src amount is greater than current src amount`, async() => {
                        let platformFeeBps = new BN(10);
                        let actualSrcQty = new BN(0);
                        hint = await nwHelper.getHint(rateHelper, matchingEngine, reserveInstances, hintType, undefined, srcToken.address, ethAddress, srcQty);
        
                        expectedResult = await nwHelper.getAndCalcRates(matchingEngine, storage, reserveInstances,
                            srcToken.address, ethAddress, srcQty,
                            srcDecimals, ethDecimals,
                            networkFeeBps, platformFeeBps, hint);
        
                        let maxDestAmt = expectedResult.actualDestAmount.sub(new BN(2));
        
                        await srcToken.transfer(network.address, srcQty);
                        let initialReserveBalances = await nwHelper.getReserveBalances(srcToken, ethAddress, expectedResult);
                        let initialTakerBalances = await nwHelper.getTakerBalances(srcToken, ethAddress, taker, network.address);
                        info = [srcQty, networkFeeBps, platformFeeBps];
                        [expectedResult, actualSrcQty] = await nwHelper.calcParamsFromMaxDestAmt(srcToken, ethAddress, expectedResult, info, maxDestAmt);
        
                        let txResult = await network.tradeWithHintAndFee(network.address, srcToken.address, srcQty, ethAddress, taker,
                            maxDestAmt, minConversionRate, platformWallet, platformFeeBps, hint);
                        console.log(`token -> ETH (${tradeStr[hintType]}): ${txResult.receipt.gasUsed} gas used`);
                        await nwHelper.compareBalancesAfterTrade(srcToken, ethAddress, actualSrcQty,
                            initialReserveBalances, initialTakerBalances, expectedResult, taker, network.address);
                    });
                };
            };

            it(`Test maxDestAmount, new src amount is greater than current src amount`, async() => {
                let platformFeeBps = new BN(10);
                let actualSrcQty = new BN(0);
                let hintType = SPLIT_HINTTYPE;
                hint = await nwHelper.getHint(rateHelper, matchingEngine, reserveInstances, hintType, undefined, srcToken.address, ethAddress, srcQty);

                expectedResult = await nwHelper.getAndCalcRates(matchingEngine, storage, reserveInstances,
                    srcToken.address, ethAddress, srcQty,
                    srcDecimals, ethDecimals,
                    networkFeeBps, platformFeeBps, hint);

                let maxDestAmt = expectedResult.actualDestAmount.sub(new BN(2));

                await srcToken.transfer(network.address, srcQty);
                let initialReserveBalances = await nwHelper.getReserveBalances(srcToken, ethAddress, expectedResult);
                let initialTakerBalances = await nwHelper.getTakerBalances(srcToken, ethAddress, taker, network.address);
                info = [srcQty, networkFeeBps, platformFeeBps];
                [expectedResult, actualSrcQty] = await nwHelper.calcParamsFromMaxDestAmt(srcToken, ethAddress, expectedResult, info, maxDestAmt);

                let txResult = await network.tradeWithHintAndFee(network.address, srcToken.address, srcQty, ethAddress, taker,
                    maxDestAmt, minConversionRate, platformWallet, platformFeeBps, hint);
                console.log(`token -> ETH (${tradeStr[hintType]}): ${txResult.receipt.gasUsed} gas used`);
                await nwHelper.compareBalancesAfterTrade(srcToken, ethAddress, actualSrcQty,
                    initialReserveBalances, initialTakerBalances, expectedResult, taker, network.address);
            });

            it("should revert if destAddress does not accept ETH", async() => {
                await srcToken.transfer(network.address, srcQty);
                let badDestAddress = await NotPayableContract.new();

                await expectRevert(
                    network.tradeWithHintAndFee(networkProxy, srcToken.address, srcQty, ethAddress, badDestAddress.address,
                    maxDestAmt, minConversionRate, platformWallet, zeroBN, emptyHint),
                    "send dest qty failed"
                );
            });

            it("should revert with 0 rate if reserve IDs are duplicated for split trades", async() => {
                let hintType = SPLIT_HINTTYPE;
                hint = await nwHelper.getHint(rateHelper, matchingEngine, reserveInstances, hintType, undefined, srcToken.address, ethAddress, srcQty);
                let firstChar = hint.search('aa'); // APR hint, change if needed
                let firstResID = hint.substr(firstChar, 64); // 32 byte length
                hint = hint.substr(0, firstChar) + firstResID + firstResID + hint.substr(firstChar + 128);

                await srcToken.transfer(network.address, srcQty);
                await expectRevert(
                    network.tradeWithHintAndFee(network.address, srcToken.address, srcQty, ethAddress, taker,
                        maxDestAmt, minConversionRate, platformWallet, platformFeeBps, hint),
                    "trade invalid, if hint involved, try parseHint API"
                );
            });

            for (tradeType of tradeTypesArray) {
                it(`should revert with 0 rate due to wrong ${tradeStr[tradeType]}`, async() => {
                    let hintType = tradeType;
                    hint = await nwHelper.getWrongHint(rateHelper, reserveInstances, hintType, undefined, srcToken.address, ethAddress, srcQty);

                    await srcToken.transfer(network.address, srcQty);
                    await expectRevert(
                        network.tradeWithHintAndFee(network.address, srcToken.address, srcQty, ethAddress, taker,
                            maxDestAmt, minConversionRate, platformWallet, platformFeeBps, hint),
                        "trade invalid, if hint involved, try parseHint API"
                    );
                });
            }

            it("should revert if masked out reserves exceed available reserves", async() => {
                let allReserves = await storage.getReserveIdsPerTokenSrc(srcToken.address);
                let someReserveID = Object.keys(reserveInstances)[0];
                hint = await matchingEngine.buildTokenToEthHint(
                    srcToken.address,
                    MASK_OUT_HINTTYPE,
                    allReserves.concat(someReserveID),
                    []
                );

                await srcToken.transfer(network.address, srcQty);
                await expectRevert(
                    network.tradeWithHintAndFee(network.address, srcToken.address, srcQty, ethAddress, taker,
                        maxDestAmt, minConversionRate, platformWallet, platformFeeBps, hint),
                    "mask out exceeds available reserves"
                );
            });

            it("should revert with 0 rate if split values are invalid", async() => {
                let hintType = SPLIT_HINTTYPE;
                hint = await nwHelper.getHint(rateHelper, matchingEngine, reserveInstances, hintType, undefined, srcToken.address, ethAddress, srcQty);
                let firstChar = hint.search('d05'); // split amount in hex
                let newSplit = 'd06';
                hint = hint.substr(0, firstChar) + newSplit + hint.substr(firstChar + 3);

                await srcToken.transfer(network.address, srcQty);
                await expectRevert(
                    network.tradeWithHintAndFee(network.address, srcToken.address, srcQty, ethAddress, taker,
                        maxDestAmt, minConversionRate, platformWallet, platformFeeBps, hint),
                    "trade invalid, if hint involved, try parseHint API"
                );
            });

            it("should revert if reserve IDs are not in increasing order", async() => {
                let hintType = SPLIT_HINTTYPE;
                hint = await nwHelper.getHint(rateHelper, matchingEngine, reserveInstances, hintType, undefined, srcToken.address, ethAddress, srcQty);
                let firstChar = hint.search('aa'); // APR hint, change if needed
                let firstResID = hint.substr(firstChar, 64); // 32 byte length
                let secondResID = hint.substr(firstChar + 64, 64);
                hint = hint.substr(0, firstChar) + secondResID + firstResID + hint.substr(firstChar + 128);

                await srcToken.transfer(network.address, srcQty);
                await expectRevert(
                    network.tradeWithHintAndFee(network.address, srcToken.address, srcQty, ethAddress, taker,
                        maxDestAmt, minConversionRate, platformWallet, platformFeeBps, hint),
                    "trade invalid, if hint involved, try parseHint API"
                );
            });
        });

        describe("test with malicious reserves", async() => {
            let reserveInstances = {};
            let badReserve;
            beforeEach("reset reserveInstances", async() => {
                reserveInstances = {};
            });

            it("should revert if reserve tries recursive call = tries to call kyber trade function", async() => {
                // setup reserve and add to storage
                reserveInstances = await nwHelper.setupBadReserve(ReentrantReserve, accounts, tokens);
                await nwHelper.addReservesToStorage(storage, reserveInstances, tokens, operator);
                badReserve = (Object.values(reserveInstances))[0].instance;
                await badReserve.setDestToken(destToken.address);
                let scammer = accounts[8];
                await badReserve.setDestAddress(scammer);
                await badReserve.setNetwork(network.address);
                await badReserve.setNumRecursive(1);
                await expectRevert(
                    network.tradeWithHintAndFee(network.address, ethAddress, ethSrcQty, destToken.address, taker,
                        maxDestAmt, minConversionRate, platformWallet, platformFeeBps, emptyHint, {value: ethSrcQty}),
                    "ReentrancyGuard: reentrant call"
                );  
                await nwHelper.removeReservesFromStorage(storage, reserveInstances, tokens, operator);
            });

            it("should revert if reserve fails to return boolean for trade() call", async() => {
                // setup reserve and add to storage
                reserveInstances = await nwHelper.setupBadReserve(ReserveNoReturnVal, accounts, tokens);
                await nwHelper.addReservesToStorage(storage, reserveInstances, tokens, operator);
                badReserve = (Object.values(reserveInstances))[0].instance;
                await expectRevert(
                    network.tradeWithHintAndFee(network.address, ethAddress, ethSrcQty, destToken.address, taker,
                        maxDestAmt, minConversionRate, platformWallet, platformFeeBps, emptyHint, {value: ethSrcQty}),
                    "reserve trade failed"
                );  
                await nwHelper.removeReservesFromStorage(storage, reserveInstances, tokens, operator);
            });

            it("should revert if reserve returns false for trade() call", async() => {
                // setup reserve and add to storage
                reserveInstances = await nwHelper.setupBadReserve(ReserveReturnFalse, accounts, tokens);
                await nwHelper.addReservesToStorage(storage, reserveInstances, tokens, operator);
                badReserve = (Object.values(reserveInstances))[0].instance;
                await expectRevert(
                    network.tradeWithHintAndFee(network.address, ethAddress, ethSrcQty, destToken.address, taker,
                        maxDestAmt, minConversionRate, platformWallet, platformFeeBps, emptyHint, {value: ethSrcQty}),
                    "reserve trade failed"
                );  
                await nwHelper.removeReservesFromStorage(storage, reserveInstances, tokens, operator);
            });
        });

        describe("Test maxDestAmount reverse calculation edge cases", async() => {
            let mockStorage;
            let mockNetwork;
            let networkProxy;
            let mockMatchingEngine;
            let mockRateHelper;
            let srcToken;
            let destToken;
            let srcDecimals;
            let destDecimals;
            let mockReserveInstances;
            let reserveIDs;

            before("setup contracts", async() => {
                // KyberDao related init.
                let expiryTimestamp = await Helper.getCurrentBlockTime() + 10;
                let kyberDao = await MockDao.new(rewardInBPS, rebateInBPS, epoch, expiryTimestamp);
                await kyberDao.setNetworkFeeBps(networkFeeBps);
                networkProxy = accounts[2];
                srcToken = tokens[0];
                srcDecimals = tokenDecimals[0];
                destToken = tokens[1];
                destDecimals = tokenDecimals[1];

                // init storage and network
                mockStorage = await nwHelper.setupStorage(admin);
                mockNetwork = await KyberNetwork.new(admin, mockStorage.address);
                await mockStorage.setNetworkContract(mockNetwork.address, {from: admin});
                await mockStorage.addOperator(operator, {from: admin});

                // init feeHandler
                let KNC = await TestToken.new("kyber network crystal", "KNC", 18);
                let feeHandler = await FeeHandler.new(kyberDao.address, mockNetwork.address, mockNetwork.address, KNC.address, burnBlockInterval, kyberDao.address);

                // init matchingEngine
                mockMatchingEngine = await MatchingEngine.new(admin);
                await mockMatchingEngine.setNetworkContract(mockNetwork.address, {from: admin});
                await mockMatchingEngine.setKyberStorage(mockStorage.address, {from: admin});
                await mockStorage.setFeeAccountedPerReserveType(true, true, true, false, true, true, {from: admin});
                await mockStorage.setEntitledRebatePerReserveType(true, false, true, false, true, true, {from: admin});

                // init rateHelper
                mockRateHelper = await RateHelper.new(admin);
                await mockRateHelper.setContracts(kyberDao.address, mockStorage.address, {from: admin});

                // init gas helper
                // tests gasHelper when gasHelper != address(0), and when a trade is being done
                let gasHelperAdd = await MockGasHelper.new(platformWallet);

                // setup network
                await mockNetwork.setContracts(feeHandler.address, mockMatchingEngine.address,
                    gasHelperAdd.address, {from: admin});
                await mockNetwork.addOperator(operator, {from: admin});
                await mockNetwork.addKyberProxy(networkProxy, {from: admin});
                await mockNetwork.setKyberDaoContract(kyberDao.address, {from: admin});
                //set params, enable network
                await mockNetwork.setParams(gasPrice, negligibleRateDiffBps, {from: admin});
                await mockNetwork.setEnable(true, {from: admin});
            });

            const setupAndAddReservesWithFixedRates = async(rates, token) => {
                reserveIDs = [];
                let reserveInstances = {};
                // setup and make reserve ids increasing
                for (let i = 0; i < rates.length; i++) {
                    let reserve = await MockReserve.new();
                    let reserveId = (MOCK_ID + `${i}` + reserve.address.substring(2,20) + "0".repeat(37)).toLowerCase();

                    reserveInstances[reserveId] = {
                        'address': reserve.address,
                        'instance': reserve,
                        'reserveId': reserveId,
                        'onChainType': ReserveType.APR,
                        'rate': new BN(0),
                        'type': type_MOCK,
                        'pricing': "none",
                        'rebateWallet': accounts[0]
                    }
                    await Helper.sendEtherWithPromise(accounts[i], reserve.address, new BN(10).pow(new BN(19)));
                    let initialTokenAmount = new BN(2000000).mul(new BN(10).pow(new BN(await token.decimals())));
                    await token.transfer(reserve.address, initialTokenAmount);

                    await reserve.setRate(token.address, rates[i], rates[i]);
                    mockReserveInstances[reserveId] = reserveInstances[reserveId];
                    reserveIDs.push(reserveId);
                }
                //add and list pair for reserve
                await nwHelper.addReservesToStorage(mockStorage, reserveInstances, [token], operator);
            };

            it("test new trade wei is higher than current one", async function() {
                mockReserveInstances = {};
                await setupAndAddReservesWithFixedRates(
                    // BN can not be inited by a number more than 52 bits
                    // 28247334871812199
                    [(new BN(28247334)).mul(new BN(1000000000)).add(new BN(871812199))],
                    srcToken
                );
                await setupAndAddReservesWithFixedRates(
                    // BN can not be inited by a number more than 52 bits
                    // 164931666174724191876
                    [(new BN(164931666174)).mul(new BN(1000000000)).add(new BN(724191876))],
                    destToken
                );
                let platformFeeBps = new BN(50);
                let taker = accounts[1];
                // 50000000000000000 = 5 * 10^16
                let srcQty = (new BN(5)).mul(new BN(10).pow(new BN(16)));
                let actualSrcQty = new BN(0);

                let expectedResult = await nwHelper.getAndCalcRates(
                    mockMatchingEngine, mockStorage, mockReserveInstances,
                    srcToken.address, destToken.address, srcQty,
                    srcDecimals, destDecimals,
                    networkFeeBps, platformFeeBps, emptyHint
                );

                // expect dest amount = 2308475042677372405
                // 2308475042677372402
                let maxDestAmt = expectedResult.actualDestAmount.sub(new BN(3));

                await srcToken.transfer(mockNetwork.address, srcQty);
                let initialReserveBalances = await nwHelper.getReserveBalances(srcToken, destToken, expectedResult);
                let initialTakerBalances = await nwHelper.getTakerBalances(srcToken, destToken, taker, mockNetwork.address);
                let info = [srcQty, networkFeeBps, platformFeeBps];
                [expectedResult, actualSrcQty] = await nwHelper.calcParamsFromMaxDestAmt(srcToken, destToken, expectedResult, info, maxDestAmt);

                await mockNetwork.tradeWithHintAndFee(mockNetwork.address, srcToken.address, srcQty, destToken.address, taker,
                    maxDestAmt, minConversionRate, platformWallet, platformFeeBps, emptyHint, {from: networkProxy});

                await nwHelper.compareBalancesAfterTrade(srcToken, destToken, actualSrcQty,
                    initialReserveBalances, initialTakerBalances, expectedResult, taker, mockNetwork.address);
                // delist and remove reserves
                await nwHelper.removeReservesFromStorage(mockStorage, mockReserveInstances, [srcToken, destToken], operator);
            });

            it("test new total dest amount is smaller than max dest amount", async function() {
                mockReserveInstances = {};
                await setupAndAddReservesWithFixedRates(
                    // BN can not be inited by a number more than 52 bits
                    // 29200009311823143, 5649810535995056, 9405972798074902
                    [
                        (new BN(29200009)).mul(new BN(1000000000)).add(new BN(311823143)),
                        (new BN(5649810)).mul(new BN(1000000000)).add(new BN(535995056)),
                        (new BN(9405972)).mul(new BN(1000000000)).add(new BN(798074902)),
                    ],
                    srcToken
                );
                let t2eReserveIDs = reserveIDs;
                await setupAndAddReservesWithFixedRates(
                    // BN can not be inited by a number more than 52 bits
                    // 121463263618128016904, 169558058045704600812, 43477220717868778247
                    [
                        (new BN(121463263618)).mul(new BN(1000000000)).add(new BN(128016904)),
                        (new BN(169558058045)).mul(new BN(1000000000)).add(new BN(704600812)),
                        (new BN(43477220717)).mul(new BN(1000000000)).add(new BN(868778247))
                    ],
                    destToken
                );
                let e2tReserveIDs = reserveIDs;
                let platformFeeBps = new BN(50);
                let taker = accounts[1];
                // 50000000000000000 = 5 * 10^16
                let srcQty = (new BN(5)).mul(new BN(10).pow(new BN(16)));
                let actualSrcQty = new BN(0);

                // both are split
                hint = await mockMatchingEngine.buildTokenToTokenHint(
                    srcToken.address, SPLIT_HINTTYPE, t2eReserveIDs, [3333, 3333, 3334],
                    destToken.address, SPLIT_HINTTYPE, e2tReserveIDs, [3333, 3333, 3334]
                );

                let expectedResult = await nwHelper.getAndCalcRates(
                    mockMatchingEngine, mockStorage, mockReserveInstances,
                    srcToken.address, destToken.address, srcQty,
                    srcDecimals, destDecimals,
                    networkFeeBps, platformFeeBps, hint
                );

                // expect dest amount = 814935558819009438
                // max dest amount = 814935558819009435
                let maxDestAmt = expectedResult.actualDestAmount.sub(new BN(3));

                await srcToken.transfer(mockNetwork.address, srcQty);
                let initialReserveBalances = await nwHelper.getReserveBalances(srcToken, destToken, expectedResult);
                let initialTakerBalances = await nwHelper.getTakerBalances(srcToken, destToken, taker, mockNetwork.address);
                let info = [srcQty, networkFeeBps, platformFeeBps];
                [expectedResult, actualSrcQty] = await nwHelper.calcParamsFromMaxDestAmt(srcToken, destToken, expectedResult, info, maxDestAmt);

                await mockNetwork.tradeWithHintAndFee(mockNetwork.address, srcToken.address, srcQty, destToken.address, taker,
                    maxDestAmt, minConversionRate, platformWallet, platformFeeBps, hint, {from: networkProxy});

                await nwHelper.compareBalancesAfterTrade(srcToken, destToken, actualSrcQty,
                    initialReserveBalances, initialTakerBalances, expectedResult, taker, mockNetwork.address);
                // delist and remove reserves
                await nwHelper.removeReservesFromStorage(mockStorage, mockReserveInstances, [srcToken, destToken], operator);
            });
        });

        describe("test gas helper", async() => {
            before("setup, add and list reserves", async() => {
                //init reserves
                let result = await nwHelper.setupReserves(network, tokens, 3, 0, 0, 0, accounts, admin, operator);

                reserveInstances = result.reserveInstances;
                numReserves += result.numAddedReserves * 1;

                //add and list pair for reserve
                await nwHelper.addReservesToStorage(storage, reserveInstances, tokens, operator);
            });

            after("unlist and remove reserve", async() => {
                await nwHelper.removeReservesFromStorage(storage, reserveInstances, tokens, operator);
                reserveInstances = {};
            });

            it("test that gas helper can't revert trade even if it reverts", async() => {
                platformFeeBps = new BN(50);
                let hintType = BEST_OF_ALL_HINTTYPE;
                hint = await nwHelper.getHint(rateHelper, matchingEngine, reserveInstances, hintType, undefined, ethAddress, destToken.address, ethSrcQty);

                // If any other wallet is used other than platformWallet, gasHelper will revert;
                // Below will revert gasHelper internally because platformWallet is zeroAddress
                await network.tradeWithHintAndFee(network.address, ethAddress, ethSrcQty, destToken.address, taker,
                    maxDestAmt, minConversionRate, zeroAddress, platformFeeBps, hint, {value: ethSrcQty});
            });
        });

        describe("test trades with very small and very big numbers", async() => {
        });

        it("test contract addresses for kyberStorage, kyberFeeHandler and kyberDao", async() => {
            let contracts = await network.getContracts();
            Helper.assertEqual(contracts.kyberDaoAddress, kyberDao.address)
            Helper.assertEqual(contracts.kyberFeeHandlerAddress, feeHandler.address)
            Helper.assertEqual(contracts.kyberMatchingEngineAddress, matchingEngine.address);
            Helper.assertEqual(contracts.kyberStorageAddress, storage.address);
        });

        it("test encode decode network fee data with mock setter getter", async() => {
            let tempNetwork = await MockNetwork.new(admin, storage.address);
            await tempNetwork.setContracts(feeHandler.address, matchingEngine.address,
                zeroAddress, {from: admin});

            let networkData = await tempNetwork.getNetworkData();

            await tempNetwork.getAndUpdateNetworkFee();
            networkData = await tempNetwork.getNetworkData();
            Helper.assertEqual(networkData.networkFeeBps, defaultNetworkFeeBps);

            let newFee = new BN(35);
            let newExpiryTimestamp = await Helper.getCurrentBlockTime() + 10;
            await tempNetwork.setNetworkFeeData(newFee, newExpiryTimestamp);

            networkData = await tempNetwork.getNetworkData();
            Helper.assertEqual(networkData.networkFeeBps, newFee);

            let networkFeeData = await tempNetwork.getNetworkFeeData();
            Helper.assertEqual(networkFeeData[0], newFee);
            Helper.assertEqual(networkFeeData[1], newExpiryTimestamp);
        });

        it("test revert with high networkFee", async () => {
            let tempStorage = await nwHelper.setupStorage(admin);
            let tempNetwork = await MockNetwork.new(admin, tempStorage.address);
            await tempStorage.setNetworkContract(tempNetwork.address, {from: admin});
            await tempNetwork.setContracts(feeHandler.address, matchingEngine.address,
                zeroAddress, { from: admin });

            let kyberDao = await MockDao.new(rewardInBPS, rebateInBPS, epoch, expiryTimestamp);
            await kyberDao.setNetworkFeeBps(networkFeeBps);

            await tempNetwork.setKyberDaoContract(kyberDao.address, { from: admin });
            let highNetworkFee = new BN(5001);
            await kyberDao.setNetworkFeeBps(highNetworkFee, { from: admin });
            await expectRevert(tempNetwork.getAndUpdateNetworkFee(), "fees exceed BPS");
        });

        it("update fee in KyberDao and see updated in network on correct block", async() => {
            let tempStorage = await nwHelper.setupStorage(admin);
            let tempNetwork = await MockNetwork.new(admin, tempStorage.address);
            await tempStorage.setNetworkContract(tempNetwork.address, { from: admin });
            expiryTimestamp = new BN(Math.round((new Date()).getTime() / 1000) + 1000);
            let tempKyberDao = await MockDao.new(rewardInBPS, rebateInBPS, epoch, expiryTimestamp);
            let newNetworkFeeBps = new BN(50);
            await tempKyberDao.setNetworkFeeBps(newNetworkFeeBps);
            await tempNetwork.setKyberDaoContract(tempKyberDao.address, { from: admin });
            result = await tempNetwork.getNetworkFeeData();
            Helper.assertEqual(result[0], defaultNetworkFeeBps, "unexpected network fee");

            //advance time to expiry timestamp
            await Helper.mineNewBlockAt(Number(result[1]));

            result = await tempNetwork.mockGetNetworkFee();
            Helper.assertEqual(result, newNetworkFeeBps, "unexpected network fee");

            await tempNetwork.getAndUpdateNetworkFee();
            result = await tempNetwork.getNetworkFeeData();
            Helper.assertEqual(result[0], newNetworkFeeBps, "unexpected network fee");
        });

        describe("test with DGX token", async() => {
            let dgxToken;
            let dgxTransferfee = new BN(13);
            let dgxDecimal = new BN(9);
            let trader = accounts[8];
            let networkProxy;
            let tokens;
            before("setup, add and list mock reserves", async() => {
                let dgxStorage = await DummyDGXStorage.new({from: admin});
                dgxToken = await DummyDGX.new(dgxStorage.address, admin);
                await dgxStorage.setInteractive(dgxToken.address, { from: admin});
                // transfer token and add accounts[0] to whitelist so `token.transfer` still works
                await dgxToken.mintDgxFor(accounts[0], new BN(10).pow(new BN(18)), {from: admin});
                await dgxToken.updateUserFeesConfigs(accounts[0], true, true, {from: admin});
                // add balance to network
                await dgxToken.mintDgxFor(network.address, new BN(10).pow(new BN(18)), {from: admin});
                await dgxToken.updateUserFeesConfigs(network.address, true, true, {from: admin});
                // setup kyberProxy
                networkProxy  = await KyberNetworkProxy.new(admin);
                await networkProxy.setKyberNetwork(network.address, {from: admin});
                await network.addKyberProxy(networkProxy.address, {from: admin});
                await dgxToken.updateUserFeesConfigs(networkProxy.address, true, true, {from: admin});
                tokens = [dgxToken];
                //init reserves
                let result = await nwHelper.setupReserves(network, tokens, 1,0,0,0, accounts, admin, operator);
               
                reserveInstances = result.reserveInstances;
                numReserves += result.numAddedReserves * 1;

                //add and list pair for reserve
                await nwHelper.addReservesToStorage(storage, reserveInstances, tokens, operator);

                for (const [key, value] of Object.entries(reserveInstances)) {
                    reserve = value.instance;
                    //add reserves to white list
                    await dgxToken.updateUserFeesConfigs(reserve.address, true, true, {from: admin});
                }
            });

            after("clean up", async() => {
                await network.removeKyberProxy(networkProxy.address, {from: admin});
                await nwHelper.removeReservesFromStorage(storage, reserveInstances, tokens, operator);
                reserveInstances = {};
            });

            it("should success when e2t with dgx, network not pays fee", async() => {
                let ethSrcQty = new BN(10).pow(new BN(18));
                let hintType = BEST_OF_ALL_HINTTYPE;
                hint = await nwHelper.getHint(rateHelper, matchingEngine, reserveInstances, hintType, undefined, ethAddress, dgxToken.address, ethSrcQty);

                info = [ethSrcQty, networkFeeBps, platformFeeBps];

                expectedResult = await nwHelper.getAndCalcRates(matchingEngine, storage, reserveInstances,
                    ethAddress, dgxToken.address, ethSrcQty,
                    ethDecimals, dgxDecimal,
                    networkFeeBps, platformFeeBps, hint);

                let initialReserveBalances = await nwHelper.getReserveBalances(ethAddress, dgxToken, expectedResult);
                let initialTakerBalances = await nwHelper.getTakerBalances(ethAddress, dgxToken, taker);
                let initialNetworkDgxBalance = await dgxToken.balanceOf(network.address);
                [expectedResult, actualSrcQty] = await nwHelper.calcParamsFromMaxDestAmt(ethAddress, dgxToken, expectedResult, info, maxDestAmt);

                await networkProxy.tradeWithHintAndFee(ethAddress, ethSrcQty, dgxToken.address, taker,
                    maxDestAmt, minConversionRate, zeroAddress, platformFeeBps, hint, {value: ethSrcQty, from: taker, gasPrice: new BN(0)});

                await nwHelper.compareBalancesAfterTrade(ethAddress, dgxToken, actualSrcQty,
                    initialReserveBalances, initialTakerBalances, expectedResult, taker);
                
                //because network is in whitelist so fee is not change
                await Helper.assertSameTokenBalance(network.address, dgxToken, initialNetworkDgxBalance);
            });

            it("should success when t2e with dgx, network pays fee", async() => {
                let srcQty = new BN(10).pow(new BN(9));
                let hintType = BEST_OF_ALL_HINTTYPE;
                hint = await nwHelper.getHint(rateHelper, matchingEngine, reserveInstances, hintType, undefined, dgxToken.address, ethAddress, srcQty);

                info = [srcQty, networkFeeBps, platformFeeBps];

                expectedResult = await nwHelper.getAndCalcRates(matchingEngine, storage, reserveInstances,
                    dgxToken.address, ethAddress, srcQty,
                    dgxDecimal, ethDecimals,
                    networkFeeBps, platformFeeBps, hint);
                await dgxToken.mintDgxFor(trader, srcQty, {from: admin});

                let initialReserveBalances = await nwHelper.getReserveBalances(dgxToken, ethAddress, expectedResult);
                let initialTakerBalances = await nwHelper.getTakerBalances(dgxToken, ethAddress, taker, trader);
                let initialNetworkDgxBalance = await dgxToken.balanceOf(network.address);
                [expectedResult, actualSrcQty] = await nwHelper.calcParamsFromMaxDestAmt(dgxToken, ethAddress, expectedResult, info, maxDestAmt);
                //inside the tradeflow
                await dgxToken.approve(networkProxy.address, srcQty, {from: trader});
                await networkProxy.tradeWithHintAndFee(dgxToken.address, srcQty, ethAddress, taker,
                    maxDestAmt, minConversionRate, zeroAddress, platformFeeBps, hint, {from: trader});

                await nwHelper.compareBalancesAfterTrade(dgxToken, ethAddress, srcQty,
                    initialReserveBalances, initialTakerBalances, expectedResult, taker, trader);
                //because trader(kyberProxy) is not in whitelist so fee is 0.13%
                let dgxFee = actualSrcQty.mul(dgxTransferfee).div(new BN(10000));
                let expectedNewBalance = initialNetworkDgxBalance.sub(dgxFee)
                await Helper.assertSameTokenBalance(network.address, dgxToken, expectedNewBalance);
            });

            it("should success when t2e with dgx, network pays fee with maxDestAmount", async() => {
                let srcQty = new BN(10).pow(new BN(9));
                let hintType = BEST_OF_ALL_HINTTYPE;
                hint = await nwHelper.getHint(rateHelper, matchingEngine, reserveInstances, hintType, undefined, dgxToken.address, ethAddress, srcQty);

                info = [srcQty, networkFeeBps, platformFeeBps];

                expectedResult = await nwHelper.getAndCalcRates(matchingEngine, storage, reserveInstances,
                    dgxToken.address, ethAddress, srcQty,
                    dgxDecimal, ethDecimals,
                    networkFeeBps, platformFeeBps, hint);
                await dgxToken.mintDgxFor(trader, srcQty, {from: admin});

                let initialReserveBalances = await nwHelper.getReserveBalances(dgxToken, ethAddress, expectedResult);
                let initialTakerBalances = await nwHelper.getTakerBalances(dgxToken, ethAddress, taker, trader);
                let initialNetworkDgxBalance = await dgxToken.balanceOf(network.address);
                let maxDestAmt = expectedResult.actualDestAmount.div(new BN(2));
                [expectedResult, actualSrcQty] = await nwHelper.calcParamsFromMaxDestAmt(dgxToken, ethAddress, expectedResult, info, maxDestAmt);
                await dgxToken.approve(networkProxy.address, srcQty, {from: trader});
                await networkProxy.tradeWithHintAndFee(dgxToken.address, srcQty, ethAddress, taker,
                    maxDestAmt, minConversionRate, zeroAddress, platformFeeBps, hint, {from: trader});

                await nwHelper.compareBalancesAfterTrade(dgxToken, ethAddress, actualSrcQty,
                    initialReserveBalances, initialTakerBalances, expectedResult, taker, trader);
                //because trader(kyberProxy) is not in whitelist so fee is 0.13% of srcQty
                let dgxFee = srcQty.mul(dgxTransferfee).div(new BN(10000));
                let expectedNewBalance = initialNetworkDgxBalance.sub(dgxFee)
                await Helper.assertSameTokenBalance(network.address, dgxToken, expectedNewBalance);
            });

        });
    });

    describe("test fee handler integrations with 1 mock and 1 fpr", async() => {
        let platformFee = new BN(200);
        let reserveIdToWallet = [];
        let rebateWallets;
        let storage;
        let network;
        let feeHandler;
        let numReserves;

        let beforePlatformFee;
        let beforeRebate;
        let beforeTotalBalancePayout;

        before("setup, add and list reserves", async() => {
            // set up network, dao and feehandler
            kyberDao = await MockDao.new(rewardInBPS, rebateInBPS, epoch, expiryTimestamp);
            await kyberDao.setNetworkFeeBps(networkFeeBps);
            KNC = await TestToken.new("kyber network crystal", "KNC", 18);
            [network, storage] = await nwHelper.setupNetwork(KyberNetwork, networkProxy, KNC.address, kyberDao.address, admin, operator);

            contracts = await network.getContracts();
            feeHandler = await FeeHandler.at(contracts.kyberFeeHandlerAddress);
            matchingEngine = await MatchingEngine.at(contracts.kyberMatchingEngineAddress);

            // init rateHelper
            rateHelper = await RateHelper.new(admin);
            await rateHelper.setContracts(kyberDao.address, storage.address, {from: admin});
            
            //init reserves
            rebateWallets = [accounts[7], accounts[8]];
            // 1 mock, 1 fpr
            let result = await nwHelper.setupReserves(network, tokens, 1,1,0,0, accounts, admin, operator, rebateWallets);

            reserveInstances = result.reserveInstances;
            numReserves = result.numAddedReserves;
            reserveIdToWallet = result.reserveIdToRebateWallet;

            //add and list pair for reserve
            await nwHelper.addReservesToStorage(storage, reserveInstances, tokens, operator);
            // enable fee and rebate for all types
            await storage.setFeeAccountedPerReserveType(true, true, true, true, true, true, { from: admin });
            await storage.setEntitledRebatePerReserveType(true, true, true, true, true, true, {from: admin});
        });

        beforeEach("update state of fee handler", async() => {
            beforePlatformFee = await feeHandler.feePerPlatformWallet(platformWallet);
            beforeTotalBalancePayout = await feeHandler.totalPayoutBalance();
            beforeRebate = {};
            for (let i = 0; i < rebateWallets.length; i++) {
                beforeRebate[rebateWallets[i]] = await feeHandler.rebatePerWallet(rebateWallets[i]);
            }
        })

        after("unlist and remove reserve", async() => {
            await nwHelper.removeReservesFromStorage(storage, reserveInstances, tokens, operator);
            reserveInstances = {};
        });

        async function assertFeeHandlerUpdate(tradeWei, platfromFeeBps, feeAccountedBps, rebateEntitledBps, rebatePerWallet){
            platformFeeWei = tradeWei.mul(platfromFeeBps).div(BPS);
            Helper.assertEqual(await feeHandler.feePerPlatformWallet(platformWallet), beforePlatformFee.add(platformFeeWei), "unexpected rebate value");
            networkFeeWei = tradeWei.mul(networkFeeBps).div(BPS).mul(feeAccountedBps).div(BPS);
            rebateWei = zeroBN;
            for (const [rebateWallet, beforeBalance] of Object.entries(beforeRebate)) {
                if (rebateWallet in rebatePerWallet) {
                    rebateWei = rebateWei.add(rebatePerWallet[rebateWallet]);
                    Helper.assertApproximate(await feeHandler.rebatePerWallet(rebateWallet), beforeBalance.add(rebatePerWallet[rebateWallet]), "unexpected rebate value");
                }else {
                    Helper.assertApproximate(await feeHandler.rebatePerWallet(rebateWallet), beforeBalance, "unexpected rebate value");
                }
            }

            let rebateLeftOver = feeAccountedBps == zeroBN? zeroBN : networkFeeWei.mul(feeAccountedBps.sub(rebateEntitledBps)).div(feeAccountedBps).mul(rebateInBPS).div(BPS); 
            let rewardWei = (networkFeeWei.mul(rewardInBPS).div(BPS)).add(rebateLeftOver);
            totalPayout = platformFeeWei.add(rewardWei.add(rebateWei));
            Helper.assertApproximate(await feeHandler.totalPayoutBalance(), beforeTotalBalancePayout.add(totalPayout), "unexpected payout balance");
        }

        it("e2t trade. see fee updated in fee handler.", async() => {
            let rebateWalletBalance0 = {};
            for (let i = 0; i < rebateWallets.length; i++) {
                rebateWalletBalance0[rebateWallets[i]] = await feeHandler.rebatePerWallet(rebateWallets[i]);
            }
            let srcQty = oneEth;
            let txResult = await network.tradeWithHintAndFee(networkProxy, ethAddress, srcQty, destToken.address, taker,
                maxDestAmt, minConversionRate, platformWallet, platformFee, '0x', {from: networkProxy, value: srcQty});

            let tradeEventArgs = nwHelper.getTradeEventArgs(txResult);
            let tradedReserve = tradeEventArgs.e2tIds[0];
            let rebateWallet = reserveIdToWallet[tradedReserve];
            let expectedRebate = new BN(tradeEventArgs.ethWeiValue).mul(networkFeeBps).div(BPS).mul(rebateInBPS).div(BPS);
            let rebatePerWallet = {}
            rebatePerWallet[rebateWallet] = expectedRebate;
            await assertFeeHandlerUpdate(tradeEventArgs.ethWeiValue, platformFee, BPS, BPS, rebatePerWallet);
        });

        it("t2e trade. see fee in fee handler.", async() => {
            let rebateWalletBalance0 = {};
            for (let i = 0; i < rebateWallets.length; i++) {
                rebateWalletBalance0[rebateWallets[i]] = await feeHandler.rebatePerWallet(rebateWallets[i]);
            }
            let srcQty = oneEth;
            await srcToken.transfer(network.address, srcQty);
            let txResult = await network.tradeWithHintAndFee(networkProxy, srcToken.address, srcQty, ethAddress, taker,
                maxDestAmt, minConversionRate, platformWallet, platformFee, '0x', {from: networkProxy});

            let tradeEventArgs = nwHelper.getTradeEventArgs(txResult);
            let tradedReserve = tradeEventArgs.t2eIds[0];
            let rebateWallet = reserveIdToWallet[tradedReserve];
            let expectedRebate = new BN(tradeEventArgs.ethWeiValue).mul(networkFeeBps).div(BPS).mul(rebateInBPS).div(BPS);
            let rebatePerWallet = {}
            rebatePerWallet[rebateWallet] = expectedRebate;
            await assertFeeHandlerUpdate(tradeEventArgs.ethWeiValue, platformFee, BPS, BPS, rebatePerWallet);
        });

        it("check that reserve rebate amount is correct", async() => {
            await storage.setFeeAccountedPerReserveType(true, true, true, true, true, true, {from: admin});
            // set rebate entitled true for FPR
            await storage.setEntitledRebatePerReserveType(true, false, false, false, false, false, {from: admin});

            let rebateWalletBalance0 = {};
            for (let i = 0; i < rebateWallets.length; i++) {
                rebateWalletBalance0[rebateWallets[i]] = await feeHandler.rebatePerWallet(rebateWallets[i]);
            }

            let srcQty = oneEth;
            await srcToken.transfer(network.address, srcQty);
            hint = await nwHelper.getHint(rateHelper, matchingEngine, reserveInstances, SPLIT_HINTTYPE, numReserves, 
                srcToken.address, destToken.address, srcQty);

            txResult = await network.tradeWithHintAndFee(networkProxy, srcToken.address, srcQty, destToken.address, taker,
                maxDestAmt, minConversionRate, platformWallet, platformFee, hint, {from: networkProxy});
            
            // assert first rebateWallet is received enitled rebate value
            let tradeEventArgs = nwHelper.getTradeEventArgs(txResult);
            let rebatePerWallet = {};
            let feeAccountedBps = new BN(2).mul(BPS);
            let entitledRebateBps = BPS;
            let networkFeeWei = new BN(tradeEventArgs.ethWeiValue).mul(networkFeeBps).div(BPS).mul(new BN(2));
            let expectedRebateWei = networkFeeWei.mul(entitledRebateBps).div(feeAccountedBps).mul(rebateInBPS).div(BPS);

            rebatePerWallet[rebateWallets[0]] = expectedRebateWei;
            rebatePerWallet[rebateWallets[1]] = zeroBN;
            await assertFeeHandlerUpdate(tradeEventArgs.ethWeiValue, platformFee, feeAccountedBps, 
                entitledRebateBps, rebatePerWallet);
            // revert changes
            await storage.setEntitledRebatePerReserveType(true, true, true, true, true, true, {from: admin});
        });

        it("should not have any fees if fee accounted data set to false", async() => {
            // set fee accounted data to false
            await storage.setFeeAccountedPerReserveType(false, false, false, false, false, false, {from: admin});
            await storage.setEntitledRebatePerReserveType(false, false, false, false, false, false, {from: admin});
            
            let srcQty = oneEth;
            let txResult = await network.tradeWithHintAndFee(networkProxy, ethAddress, srcQty, srcToken.address, taker,
                maxDestAmt, minConversionRate, platformWallet, zeroBN, '0x', {from: networkProxy, value: srcQty});
            let tradeEventArgs = nwHelper.getTradeEventArgs(txResult);
            await assertFeeHandlerUpdate(tradeEventArgs.ethWeiValue, zeroBN, zeroBN, zeroBN, {});

            // revert changes
            await storage.setFeeAccountedPerReserveType(true, true, true, true, true, true, { from: admin });
            await storage.setEntitledRebatePerReserveType(true, true, true, true, true, true, {from: admin});
        });

        it("should have no rebate if entitled rebate data is set to false", async() => {
            await storage.setFeeAccountedPerReserveType(true, true, true, true, true, true, {from: admin});
            // set entitled rebate data to false
            await storage.setEntitledRebatePerReserveType(false, false, false, false, false, false, {from: admin});

            let srcQty = oneEth;

            let txResult = await network.tradeWithHintAndFee(networkProxy, ethAddress, srcQty, srcToken.address, taker,
                maxDestAmt, minConversionRate, platformWallet, zeroBN, '0x', {from: networkProxy, value: srcQty});

            let tradeEventArgs = nwHelper.getTradeEventArgs(txResult);
            await assertFeeHandlerUpdate(tradeEventArgs.ethWeiValue, zeroBN, BPS, zeroBN, {});

            // reset fees
            await storage.setFeeAccountedPerReserveType(true, true, true, true, true, true, { from: admin });
            await storage.setEntitledRebatePerReserveType(true, true, true, true, true, true, {from: admin});
        });

        it("should have fees only for platform wallet if fee accounted data set to false", async() => {
            // set fee accounted data to false
            await storage.setFeeAccountedPerReserveType(false, false, false, false, false, false, {from: admin});
            await storage.setEntitledRebatePerReserveType(false, false, false, false, false, false, {from: admin});
            
            let srcQty = oneEth;
            let txResult = await network.tradeWithHintAndFee(networkProxy, ethAddress, srcQty, srcToken.address, taker,
                maxDestAmt, minConversionRate, platformWallet, platformFee, '0x', {from: networkProxy, value: srcQty});
            let tradeEventArgs = nwHelper.getTradeEventArgs(txResult);
            await assertFeeHandlerUpdate(tradeEventArgs.ethWeiValue, platformFee, zeroBN, zeroBN, {});

            // reset fees
            await storage.setFeeAccountedPerReserveType(true, true, true, true, true, true, { from: admin });
            await storage.setEntitledRebatePerReserveType(true, true, true, true, true, true, {from: admin});
        });
    });

    describe("test trades with malicious reserves", async() => {
        let numberReserves;
        before("init contracts", async () => {
            // init network
            storage = await nwHelper.setupStorage(admin);
            network = await KyberNetwork.new(admin, storage.address);
            await storage.setNetworkContract(network.address, { from: admin });
            await storage.addOperator(operator, { from: admin });

            // init feeHandler
            KNC = await TestToken.new("kyber network crystal", "KNC", 18);
            proxyForFeeHandler = network;
            feeHandler = await FeeHandler.new(kyberDao.address, proxyForFeeHandler.address, network.address, KNC.address, burnBlockInterval, kyberDao.address);

            // init matchingEngine
            matchingEngine = await MatchingEngine.new(admin);
            await matchingEngine.setNetworkContract(network.address, { from: admin });
            await matchingEngine.setKyberStorage(storage.address, { from: admin });
            await storage.setFeeAccountedPerReserveType(true, true, true, false, true, true, { from: admin });
            await storage.setEntitledRebatePerReserveType(true, false, true, false, true, true, {from: admin });

            // init gas helper
            gasHelperAdd = await MockGasHelper.new(platformWallet);

            // setup network
            await network.addOperator(operator, { from: admin });
            await network.setContracts(feeHandler.address, matchingEngine.address, gasHelperAdd.address, { from: admin });
            await network.addKyberProxy(networkProxy, { from: admin });
            await network.setKyberDaoContract(kyberDao.address, { from: admin });

            //set params, enable network
            await network.setParams(gasPrice, negligibleRateDiffBps, { from: admin });
            await network.setEnable(true, { from: admin });

            rateHelper = await RateHelper.new(admin);
            await rateHelper.setContracts(kyberDao.address, storage.address, { from: admin });

            // setup + add reserves
            reserveInstances = {};
            numberReserves = 5;
            // setup malicious reserves
            for (i = 0; i < numberReserves; i++) {
                let reserve = await MaliciousReserve2.new();
                let reserveId = (nwHelper.genReserveID(MOCK_ID, reserve.address)).toLowerCase();
                reserveInstances[reserveId] = {
                    'address': reserve.address,
                    'instance': reserve,
                    'reserveId': reserveId,
                    'onChainType': ReserveType.FPR,
                    'rate': new BN(0),
                    'type': type_MOCK,
                    'pricing': "none",
                    'rebateWallet': accounts[i]
                }
                tokensPerEther = precisionUnits.mul(new BN((i + 1) * 10));
                ethersPerToken = precisionUnits.div(new BN((i + 1) * 10));
                //send ETH
                await Helper.sendEtherWithPromise(accounts[i], reserve.address, (new BN(10)).pow(new BN(19)).mul(new BN(15)));
                for (let j = 0; j < tokens.length; j++) {
                    token = tokens[j];
                    //set rates and send tokens
                    await reserve.setRate(token.address, tokensPerEther, ethersPerToken);
                    let initialTokenAmount = new BN(2000000).mul(new BN(10).pow(new BN(await token.decimals())));
                    await token.transfer(reserve.address, initialTokenAmount);
                }
            }
            await nwHelper.addReservesToStorage(storage, reserveInstances, tokens, operator);

            srcToken = tokens[0];
            srcDecimals = tokenDecimals[0];
            destToken = tokens[1];
            destDecimals = tokenDecimals[1];
            srcQty = new BN(10).mul(new BN(10).pow(new BN(srcDecimals)));
            ethSrcQty = oneEth;
        });

        let extraSrcAmts = [1, -1, 0, 0];
        let extraDestAmts = [0, 0, 1, -1];
        let testNames = ["extra src amount", "less src amount", "extra dst amount", "less dst amount"];
        // "": no revert
        let revertMsgs = ["reserve takes high amount", "", "", "reserve returns low amount"];
        let hint;
        let hintType;
        let status;

        for (tradeType of tradeTypesArray) {
            hintType = tradeType;
            for(let i = 0; i < testNames.length; i++) {
                status = revertMsgs[i] == "" ? "no revert" : ("revert: " + revertMsgs[i]);
                // for split trades, test with ether 1 or all malicious reserves
                let numMaliciousReserves = (hintType == SPLIT_HINTTYPE) ? [numberReserves, 1] : [numberReserves];

                for(let k = 0; k < numMaliciousReserves.length; k++) {
                    it(`should perform trades, (${status}}, ${tradeStr[hintType]})`, async() => {
                        let counter = 0;
                        for (const [key, value] of Object.entries(reserveInstances)) {
                            let mockReserve = value.instance;
                            // take extra src amount
                            await mockReserve.setExtraSrcAndDestAmounts(extraSrcAmts[i], extraDestAmts[i]);
                            counter++;
                            if (counter == numMaliciousReserves[k]) { break; }
                        }

                        // T2E trade
                        hint = await nwHelper.getHint(rateHelper, matchingEngine, reserveInstances, hintType, undefined, srcToken.address, ethAddress, srcQty);
                        await srcToken.transfer(network.address, srcQty.add(new BN(extraSrcAmts[i])));
                        if (revertMsgs[i] == "") {
                            // no revert
                            await network.tradeWithHint(networkProxy, srcToken.address, srcQty, ethAddress, taker,
                                maxDestAmt, minConversionRate, platformWallet, hint);
                        } else {
                            await expectRevert(
                                network.tradeWithHint(networkProxy, srcToken.address, srcQty, ethAddress, taker,
                                    maxDestAmt, minConversionRate, platformWallet, hint),
                                revertMsgs[i]
                            )
                        }

                        // T2T trade
                        hint = await nwHelper.getHint(rateHelper, matchingEngine, reserveInstances, hintType, undefined, srcToken.address, destToken.address, srcQty);

                        await srcToken.transfer(network.address, srcQty.add(new BN(extraSrcAmts[i])));

                        if (revertMsgs[i] == "") {
                            // no revert
                            await network.tradeWithHint(networkProxy, srcToken.address, srcQty, destToken.address, taker,
                                maxDestAmt, minConversionRate, platformWallet, hint);
                        } else {
                            await expectRevert(
                                network.tradeWithHint(networkProxy, srcToken.address, srcQty, destToken.address, taker,
                                    maxDestAmt, minConversionRate, platformWallet, hint),
                                revertMsgs[i]
                            )
                        }

                        // E2T trades
                        hint = await nwHelper.getHint(rateHelper, matchingEngine, reserveInstances, hintType, undefined, ethAddress, destToken.address, ethSrcQty);

                        if (extraDestAmts[i] >= 0) {
                            // no revert if dest amount is ok
                            await network.tradeWithHint(networkProxy, ethAddress, ethSrcQty, destToken.address, taker,
                                maxDestAmt, minConversionRate, platformWallet, hint, {value: ethSrcQty});
                        } else {
                            await expectRevert(
                                network.tradeWithHint(networkProxy, ethAddress, ethSrcQty, destToken.address, taker,
                                    maxDestAmt, minConversionRate, platformWallet, hint, {value: ethSrcQty}),
                                revertMsgs[i]
                            )
                        }
                    });
                }
            }
        }
    });

    describe("test verifying trade inputs", async () => {
        let platformFee = 79;

        before("initialise network", async () => {
            // init network
            storage = await nwHelper.setupStorage(admin);
            network = await KyberNetwork.new(admin, storage.address);
            await storage.setNetworkContract(network.address, {from: admin});
            await storage.addOperator(operator, {from: admin});

            // init feeHandler
            KNC = await TestToken.new("kyber network crystal", "KNC", 18);
            proxyForFeeHandler = network;
            feeHandler = await FeeHandler.new(kyberDao.address, proxyForFeeHandler.address, network.address, KNC.address, burnBlockInterval, kyberDao.address);

            // init matchingEngine
            matchingEngine = await MatchingEngine.new(admin);
            await matchingEngine.setNetworkContract(network.address, { from: admin });
            await matchingEngine.setKyberStorage(storage.address, { from: admin});
            await storage.setFeeAccountedPerReserveType(true, true, true, false, true, true, { from: admin });
            await storage.setEntitledRebatePerReserveType(true, false, true, false, true, true, {from: admin});

            // init gas helper
            gasHelperAdd = await MockGasHelper.new(platformWallet);

            // setup network
            await network.addOperator(operator, { from: admin });
            await network.setContracts(feeHandler.address, matchingEngine.address, gasHelperAdd.address, { from: admin });
            await network.addKyberProxy(networkProxy, { from: admin });
            await network.setKyberDaoContract(kyberDao.address, { from: admin });

            //set params, enable network
            await network.setParams(gasPrice, negligibleRateDiffBps, { from: admin });
            await network.setEnable(true, { from: admin });
        });

        it("test can not trade when network is disabled", async () => {
            let isEnabled = await network.enabled();
            assert.equal(isEnabled, true);

            await network.setEnable(false, { from: admin });
            await expectRevert(
                network.tradeWithHintAndFee(networkProxy, srcToken.address, srcQty, ethAddress, taker,
                    maxDestAmt, minConversionRate, platformWallet, platformFee, emptyHint),
                "network disabled"
            );
            await network.setEnable(true, { from: admin });
        });

        it("test can not trade when caller is not proxy", async () => {
            let notAProxy = accounts[9];
            let contracts = await network.getContracts();
            let proxies = contracts.kyberProxyAddresses;
            Helper.assertEqual(proxies.length, 1);
            assert.notEqual(proxies, notAProxy)

            // calling network from non proxy, expect revert
            await expectRevert(
                network.tradeWithHintAndFee(networkProxy, srcToken.address, srcQty, ethAddress, taker,
                    maxDestAmt, minConversionRate, platformWallet, platformFee, emptyHint, { from: notAProxy }),
                "bad sender"
            );
        });

        it("test can not trade when setting gas price too high", async () => {
            let maxGasPrice = new BN(100);
            // set network max gas price to 100 wei
            await network.setParams(maxGasPrice, negligibleRateDiffBps, { from: admin });

            let invalidGasPrice = maxGasPrice.add(new BN(1));
            await expectRevert(
                network.tradeWithHintAndFee(networkProxy, srcToken.address, srcQty, ethAddress, taker,
                    maxDestAmt, minConversionRate, platformWallet, platformFee, emptyHint, { gasPrice: invalidGasPrice }),
                "gas price"
            );

            // change network max gas price back to 50 gwei
            await network.setParams(gasPrice, negligibleRateDiffBps, { from: admin });
        });

        it("test can not trade when src amount too high", async () => {
            let invalidSrcQty = MAX_QTY.add(new BN(1));

            await expectRevert(
                network.tradeWithHintAndFee(networkProxy, srcToken.address, invalidSrcQty, ethAddress, taker,
                    maxDestAmt, minConversionRate, platformWallet, platformFee, emptyHint),
                "srcAmt > MAX_QTY"
            );
        });

        it("test can not trade when src amount is zero", async () => {
            let invalidSrcQty = new BN(0);

            await expectRevert(
                network.tradeWithHintAndFee(networkProxy, srcToken.address, invalidSrcQty, ethAddress, taker,
                    maxDestAmt, minConversionRate, platformWallet, platformFee, emptyHint),
                "0 srcAmt"
            );
        });

        it("test can not trade when dst addr is 0", async () => {
            let invalidTaker = zeroAddress;

            await expectRevert(
                network.tradeWithHintAndFee(networkProxy, srcToken.address, srcQty, ethAddress, invalidTaker,
                    maxDestAmt, minConversionRate, platformWallet, platformFee, emptyHint),
                "dest add 0"
            );
        });

        it("test can not trade when src === dst", async () => {
            await expectRevert(
                network.tradeWithHintAndFee(networkProxy, srcToken.address, srcQty, srcToken.address, taker,
                    maxDestAmt, minConversionRate, platformWallet, platformFee, emptyHint),
                "src = dest"
            );
        });

        it("test can not trade when platform fee is too high", async () => {
            let invalidPlatformFee = new BN(10001); // 10001 BPS = 100.01%
            await expectRevert(
                network.tradeWithHintAndFee(networkProxy, ethAddress, srcQty, srcToken.address, taker,
                    maxDestAmt, minConversionRate, platformWallet, invalidPlatformFee, emptyHint, {value : srcQty}),
                "platformFee high"
            );
        });

        it("test can not trade when fees is too high", async () => {
            let networkData = await network.getNetworkData();

            Helper.assertGreater(networkData.networkFeeBps, new BN(0));
            let invalidPlatformFee = BPS.sub(networkData.networkFeeBps);
            // expect invalidPlatformFee + networkFee*2 > BPS

            await expectRevert(
                network.tradeWithHintAndFee(networkProxy, ethAddress, srcQty, srcToken.address, taker,
                    maxDestAmt, minConversionRate, platformWallet, invalidPlatformFee, emptyHint, {value: srcQty}),
                "fees high"
            );
        });

        it("test can not trade E2T when missing ETH", async () => {
            await expectRevert.unspecified(
                network.tradeWithHintAndFee(networkProxy, ethAddress, srcQty, srcToken.address, taker,
                    maxDestAmt, minConversionRate, platformWallet, platformFee, emptyHint, { value: new BN(0) })
            );
        });

        it("test can not trade T2T or T2E when passing ETH", async () => {
            await expectRevert.unspecified(
                network.tradeWithHintAndFee(networkProxy, srcToken.address, srcQty, ethAddress, taker,
                    maxDestAmt, minConversionRate, platformWallet, platformFee, emptyHint, { value: new BN(1) })
            );
        });

        it("test can not trade T2T or T2E when src token is not transfered to network yet", async () => {
            const networkTokenBalance = await srcToken.balanceOf(network.address);
            Helper.assertEqual(networkTokenBalance, new BN(0));

            await expectRevert(
                network.tradeWithHintAndFee(networkProxy, srcToken.address, srcQty, ethAddress, taker,
                    maxDestAmt, minConversionRate, platformWallet, platformFee, emptyHint),
                "no tokens"
            );
        });
    });

    describe("test update Network fee", async function(){
        let tempNetwork;
        let tempStorage;
        let tempMatchingEngine;

        beforeEach("setup", async function(){
            tempStorage = await nwHelper.setupStorage(admin);
            tempNetwork = await MockNetwork.new(admin, tempStorage.address);
            await tempStorage.setNetworkContract(tempNetwork.address, {from: admin});
            tempMatchingEngine = await MatchingEngine.new(admin);

            await tempNetwork.setContracts(feeHandler.address, tempMatchingEngine.address,
                zeroAddress, { from: admin });
        });

        it("expiryTimestamp too large", async function(){
            expiryTimestamp = ((new BN(2)).pow(new BN(64))).add(new BN(1));
            feeBPS = new BN(100);
            await expectRevert(
                tempNetwork.setNetworkFeeData(feeBPS, expiryTimestamp),
                "expiry overflow"
            );
        });

        it("fee BPS too large", async function(){
            expiryTimestamp = new BN(5000000);
            feeBPS = (BPS.div(new BN(2))).add(new BN(1));
            await expectRevert(
                tempNetwork.setNetworkFeeData(feeBPS, expiryTimestamp),
                "fees exceed BPS"
            );
        });

        it("set expiry timestamp", async function(){
            currentTime = await Helper.getCurrentBlockTime();
            feeBPS = new BN(100);
            expiryTimestamp = currentTime + 10;
            await tempNetwork.setNetworkFeeData(feeBPS, expiryTimestamp);
            actualFeeBPS = await tempNetwork.getAndUpdateNetworkFee.call();
            Helper.assertEqual(actualFeeBPS, feeBPS, "fee bps not correct");
            Helper.assertEqual(await tempNetwork.mockGetNetworkFee(), feeBPS, "getNetworkfee not correct")
        });

        it("test get network fee from KyberDao", async function(){
            expiryTimestamp = await Helper.getCurrentBlockTime();
            feeBPS = new BN(99);
            kyberDao = await MockDao.new(rewardInBPS, rebateInBPS, epoch, expiryTimestamp);
            await kyberDao.setNetworkFeeBps(feeBPS);
            await tempNetwork.setKyberDaoContract(kyberDao.address, {from: admin});
            actualFeeBPS = await tempNetwork.getAndUpdateNetworkFee.call();
            Helper.assertEqual(actualFeeBPS, feeBPS, "fee bps not correct");
            await tempNetwork.getAndUpdateNetworkFee.call();
        });
    });

    describe("test trade", async function(){
        before("global setup", async function () {

            tempTokens = [];

            // init storage and network
            tempStorage = await nwHelper.setupStorage(admin);
            tempNetwork = await KyberNetwork.new(admin, tempStorage.address);
            await tempStorage.setNetworkContract(tempNetwork.address, {from: admin});
            await tempStorage.addOperator(operator, {from: admin});

            // init matchingEngine
            matchingEngine = await MatchingEngine.new(admin);
            await tempStorage.setFeeAccountedPerReserveType(true, true, true, false, true, true, { from: admin });
            await tempStorage.setEntitledRebatePerReserveType(true, false, true, false, true, true, {from: admin});
            await matchingEngine.setNetworkContract(tempNetwork.address, { from: admin });
            await matchingEngine.setKyberStorage(tempStorage.address, { from: admin });

            // init KyberDao
            kyberDao = await MockDao.new(rewardInBPS, rebateInBPS, epoch, expiryTimestamp);
            await tempNetwork.setKyberDaoContract(kyberDao.address, { from: admin });
            feeBPS = new BN(100);
            expiryTimestamp = await Helper.getCurrentBlockTime() + 10;

            // init feeHandler
            KNC = await TestToken.new("kyber network crystal", "KNC", 18);
            proxyForFeeHandler = tempNetwork;
            feeHandler = await FeeHandler.new(kyberDao.address, proxyForFeeHandler.address, tempNetwork.address, KNC.address, burnBlockInterval, kyberDao.address);

            // setup network
            await tempNetwork.setContracts(feeHandler.address, matchingEngine.address, zeroAddress, { from: admin });
            await tempNetwork.addOperator(operator, { from: admin });
            await tempNetwork.addKyberProxy(networkProxy, { from: admin });

            //set params, enable network
            await tempNetwork.setParams(gasPrice, negligibleRateDiffBps, { from: admin });
            await tempNetwork.setEnable(true, { from: admin });

            result = await nwHelper.setupReserves(network, tokens, 1, 0, 0, 0, accounts, admin, operator);
            reserveInstances = result.reserveInstances;

            //add and list pair for reserve
            await nwHelper.addReservesToStorage(tempStorage, reserveInstances, tokens, operator);

            // set fixed rates
            fixedTokensPerEther = precisionUnits.mul(new BN(20));
            fixedEthersPerToken = precisionUnits.div(new BN(20));

            for (const [key, value] of Object.entries(reserveInstances)) {
                mockReserve = value.instance;
                await mockReserve.setRate(tokens[0].address, MAX_RATE.div(new BN(2)), MAX_RATE.div(new BN(2)));
                await mockReserve.setRate(tokens[1].address, MAX_RATE.div(new BN(2)), MAX_RATE.div(new BN(2)));
            }

            rateHelper = await RateHelper.new(admin);
            await rateHelper.setContracts(kyberDao.address, tempStorage.address, {from: admin});
        });

        beforeEach("zero network balance", async() => {
            await Helper.zeroNetworkBalance(tempNetwork, tokens, admin);
        });

        it("trade zero source amount", async function(){
            srcQty = new BN(0);
            srcToken = tokens[0];
            destToken = tokens[1];
            await expectRevert(
                tempNetwork.tradeWithHintAndFee(networkProxy, srcToken.address, srcQty, destToken.address, taker,
                    maxDestAmt, minConversionRate, platformWallet, platformFeeBps, emptyHint),
                "0 srcAmt"
            );
        });

        it("trade rate > MAX_RATE", async function(){
            srcQty = new BN(10);
            srcToken = tokens[0];
            destToken = tokens[1];
            await srcToken.transfer(tempNetwork.address, srcQty);
            await expectRevert(
                tempNetwork.tradeWithHintAndFee(networkProxy, srcToken.address, srcQty, destToken.address, taker,
                    maxDestAmt, minConversionRate, platformWallet, platformFeeBps, emptyHint),
                "rate > MAX_RATE"
            );
        });

        it("trade rate < minConvRate", async function(){
            srcQty = new BN(10);
            srcToken = tokens[0];
            await srcToken.transfer(tempNetwork.address, srcQty);
            await expectRevert(
                tempNetwork.tradeWithHintAndFee(networkProxy, srcToken.address, srcQty, ethAddress, taker,
                    maxDestAmt, MAX_RATE, platformWallet, platformFeeBps, emptyHint),
                "rate < min rate"
            );
        });

        it("trade reverts when one reserve has zero qty -> expected rate returns 0", async function() {
            // add new reserve
            let result = await nwHelper.setupReserves(network, tokens, 1, 0, 0, 0, accounts, admin, operator);
            let newReserveInstances = result.reserveInstances;
            let allReserveInstances = {};
            for (const [key, value] of Object.entries(reserveInstances)) {
                allReserveInstances[key] = value;
            }
            for (const [key, value] of Object.entries(newReserveInstances)) {
                allReserveInstances[key] = value;
            }

            //add and list pair for reserve
            await nwHelper.addReservesToStorage(tempStorage, newReserveInstances, tokens, operator);
            // change new reserve rate to 0
            for (const [key, value] of Object.entries(newReserveInstances)) {
                mockReserve = value.instance;
                await mockReserve.setRate(tokens[0].address, 0, 0);
                await mockReserve.setRate(tokens[1].address, 0, 0);
            }

            srcQty = new BN(10);
            srcToken = tokens[0];
            await srcToken.transfer(tempNetwork.address, srcQty);
            // create hint for split trade, using both 2 reserves, but one has 0 rate
            let hint = await nwHelper.getHint(rateHelper, matchingEngine, allReserveInstances, SPLIT_HINTTYPE, 2, srcToken.address, ethAddress, srcQty);
            await expectRevert(
                tempNetwork.tradeWithHintAndFee(networkProxy, srcToken.address, srcQty, ethAddress, taker,
                    maxDestAmt, 0, platformWallet, platformFeeBps, hint),
                "trade invalid, if hint involved, try parseHint API"
            );
            await nwHelper.removeReservesFromStorage(tempStorage, newReserveInstances, tokens, operator);
        })
    });

    describe("test handle change edge case", async function(){
        before("setup", async function(){
            tempNetwork = await MockNetwork.new(admin, storage.address);
        });

        it("test srcAmount equal to require srcAmount", async function(){
            // src = ethAddress
            srcAmount = new BN(10);
            requiredSrcAmount = srcAmount;
            await tempNetwork.mockHandleChange.call(ethAddress, srcAmount, requiredSrcAmount, admin);
        });

        it("test handleChange while don't have fund", async function(){
            src = ethAddress;
            srcAmount = new BN(10);
            requiredSrcAmount = srcAmount.sub(new BN(1));
            await expectRevert(
                tempNetwork.mockHandleChange(src, srcAmount, requiredSrcAmount, admin),
                "Send change failed"
            );
        });

        it("test handleChange send to not payable contract", async function(){
            src = ethAddress;
            srcAmount = new BN(10);
            sendBackAmount = new BN(1);
            requiredSrcAmount = srcAmount.sub(sendBackAmount);
            blockContract = await NotPayableContract.new();
            Helper.sendEtherWithPromise(accounts[0], tempNetwork.address, sendBackAmount);
            await expectRevert(
                tempNetwork.mockHandleChange(src, srcAmount, requiredSrcAmount, blockContract.address),
                "Send change failed"
            );
            Helper.assertEqual(
                await Helper.getBalancePromise(tempNetwork.address),
                sendBackAmount
            );
            // send back to account 0
            await tempNetwork.mockHandleChange(src, srcAmount, requiredSrcAmount, accounts[0]);
            Helper.assertEqual(
                await Helper.getBalancePromise(tempNetwork.address),
                0
            );
        });
    });

    describe("misc - tests related to network logic", async() => {
         it("test value loss due to using BPS values on split", async() => {
            const srcAmounts = [
                new BN("123456789012345678"),
                new BN("1234567890123456789"),
                new BN("12345678901234567890"),
                new BN("123456789012345678901"),
            ];

            const splits = [
                new BN(1500),
                new BN(2500),
                new BN(3201),
                new BN(BPS - 3201 - 2500 - 1500)
            ]

            for (let i = 0; i < srcAmounts.length; i++) {
                let splitsAddup = new BN(0);
                for (let j = 0; j < splits.length; j++) {
                    splitsAddup = splitsAddup.add(srcAmounts[i].mul(splits[j]).div(BPS));
                }
                // console.log("srcAmount - splitAddup for src: " + srcAmounts[i] + " = " + srcAmounts[i].sub(splitsAddup));
            }
        })

        it("test value loss due to using BPS values on split", async() => {
            const srcAmounts = [
                new BN("523456789012345678"),
                new BN("5234567890123456789"),
                new BN("52345678901234567890"),
                new BN("423456789012345678901"),
            ];

            const splits = [
                new BN(1134),
                new BN(2785),
                new BN(3435),
                new BN(236),
                new BN(BPS - 1134 - 2785 - 3435 - 236)
            ]

            for (let i = 0; i < srcAmounts.length; i++) {
                let splitsAddup = new BN(0);
                for (let j = 0; j < splits.length; j++) {
                    splitsAddup = splitsAddup.add(srcAmounts[i].mul(splits[j]).div(BPS));
                }
                // console.log("srcAmount - splitAddup for src: " + srcAmounts[i] + " = " + srcAmounts[i].sub(splitsAddup));
            }
        })
    })

    describe("test maximum trade quantity", async() => {
        let srcToken;
        let destToken;
        let destToken2;
        let normalToken;
        let normalToken2;
        let kyberProxy = accounts[0];
        let reserves;
        let reserveInstances;
        let network;
        let matchingEngine;
        let rateHelper;

        const MAX_DST_QTY = Helper.calcDstQty(MAX_QTY, new BN(0), new BN(18), MAX_RATE);
        before("init token balance", async() => {
            srcToken = await TestToken.new("decimal 0", "0", new BN(0));
            normalToken = await TestToken.new("decimal 18", "18", new BN(18));
            normalToken2 = await TestToken.new("decimal 18", "18", new BN(18));
            destToken = await TestToken.new("decimal 36", "36", new BN(36));
            destToken2 = await TestToken.new("decimal 11", "11", new BN(11));
            let tokens = [srcToken, normalToken, normalToken2, destToken, destToken2];

            let KNC = await TestToken.new("kyber network crystal", "KNC", 18);
            //init network 
            const storage =  await nwHelper.setupStorage(admin);
            network = await KyberNetwork.new(admin, storage.address);
            await storage.setNetworkContract(network.address, {from: admin});
            await storage.addOperator(operator, { from: admin });
            await network.addOperator(operator, { from: admin });
            //init matchingEngine, feeHandler
            matchingEngine = await MatchingEngine.new(admin);
            await matchingEngine.setNetworkContract(network.address, { from: admin });
            await matchingEngine.setKyberStorage(storage.address, {from : admin});
            await storage.setFeeAccountedPerReserveType(true, true, true, false, true, true, { from: admin });
            await storage.setEntitledRebatePerReserveType(true, true, true, false, true, true, { from: admin });
            // setup KyberDao and feeHandler 
            let kyberDao = await MockDao.new(rewardInBPS, rebateInBPS, epoch, expiryTimestamp);
            await kyberDao.setNetworkFeeBps(new BN(0));
            let feeHandler = await FeeHandler.new(kyberDao.address, network.address, network.address, KNC.address, burnBlockInterval, kyberDao.address);
            await network.setContracts(feeHandler.address, matchingEngine.address, zeroAddress, { from: admin });
            // set KyberDao contract
            await network.setKyberDaoContract(kyberDao.address, { from: admin });
            // point proxy to network
            await network.addKyberProxy(kyberProxy, { from: admin });
            //set params, enable network
            await network.setParams(gasPrice, negligibleRateDiffBps, { from: admin });
            await network.setEnable(true, { from: admin });
            // setup reserve
            reserves = await nwHelper.setupReserves(network, tokens, 2, 0, 0, 0, accounts, admin, operator);
            reserveInstances = reserves.reserveInstances;
            await nwHelper.addReservesToStorage(storage, reserveInstances, tokens, operator);
            for (const [key, value] of Object.entries(reserveInstances)) {
                let reserve = value.instance;
                await reserve.setRate(srcToken.address, MAX_RATE, MAX_RATE);
                await reserve.setRate(destToken.address, MAX_RATE, MAX_RATE);
                await reserve.setRate(destToken2.address, MAX_RATE.sub(new BN(1)), MAX_RATE.sub(new BN(1)));
                tokensPerEther = precisionUnits.mul(new BN(10));
                ethersPerToken = precisionUnits.div(new BN(10));
                await reserve.setRate(normalToken.address, tokensPerEther, ethersPerToken);
                await reserve.setRate(normalToken2.address, tokensPerEther, ethersPerToken);
            }
            rateHelper = await RateHelper.new(admin);
            await rateHelper.setContracts(kyberDao.address, storage.address, {from: admin});
        });

        beforeEach("ensure each reserve have max eth-token value", async() => {
            for (const [key, value] of Object.entries(reserveInstances)) {
                let reserve = value.instance;
                let tokens = [srcToken, destToken, destToken2, normalToken, normalToken2]
                await tokens.forEach(async (token) =>  {
                    let currentBalance = await token.balanceOf(reserve.address);
                    if (MAX_DST_QTY.gt(currentBalance)) {
                        await token.transfer(reserve.address, MAX_DST_QTY.sub(currentBalance));
                    }
                });
                currentBalance = await Helper.getBalancePromise(reserve.address);
                if (MAX_QTY.gt(currentBalance)) {
                    await Helper.sendEtherWithPromise(accounts[3], reserve.address, MAX_QTY.sub(currentBalance));
                    await Helper.assertSameEtherBalance(reserve.address, MAX_QTY);
                }
            }
            await Helper.zeroNetworkBalance(network, tokens, admin);
        });

        it("test t2e success with max_qty, normal rate", async() => {
            let initBalance = await Helper.getBalancePromise(taker);
            await normalToken.transfer(network.address, MAX_QTY.add(new BN(1)));
            await expectRevert(
                network.tradeWithHintAndFee(kyberProxy, normalToken.address, MAX_QTY.add(new BN(1)), ethAddress, taker,
                    maxDestAmt, minConversionRate, platformWallet, new BN(0), emptyHint, 
                    { from: kyberProxy }
                ), "srcAmt > MAX_QTY"
            );

            await network.tradeWithHintAndFee(kyberProxy, normalToken.address, MAX_QTY, ethAddress, taker,
                maxDestAmt, minConversionRate, platformWallet, new BN(0), emptyHint, 
                { from: kyberProxy }
            );
            let afterBalance = await Helper.getBalancePromise(taker);
            Helper.assertEqual(MAX_QTY.div(new BN(10)), afterBalance.sub(initBalance), "expected balance is not match");
        });

        it("test e2t success with max_qty, normal rate", async() => {
            let initBalance = await normalToken.balanceOf(taker);
            await expectRevert(
                network.tradeWithHintAndFee(kyberProxy, ethAddress, MAX_QTY.div(new BN(10)).add(new BN(1)), normalToken.address, taker,
                    maxDestAmt, minConversionRate, platformWallet, new BN(0), emptyHint, 
                    { value: MAX_QTY.div(new BN(10)).add(new BN(1)), from: kyberProxy }
                ), "destAmount > MAX_QTY"
            );

            await network.tradeWithHintAndFee(kyberProxy, ethAddress, MAX_QTY.div(new BN(10)), normalToken.address, taker,
                maxDestAmt, minConversionRate, platformWallet, new BN(0), emptyHint, 
                { value: MAX_QTY.div(new BN(10)), from: kyberProxy }
            );
            let afterBalance = await normalToken.balanceOf(taker);
            Helper.assertEqual(MAX_QTY, afterBalance.sub(initBalance), "expected balance is not match");
        });

        it("test t2t success with max_qty, normal rate", async() => {
            let initBalance = await normalToken2.balanceOf(taker);
            await normalToken.transfer(network.address, MAX_QTY);
            await network.tradeWithHintAndFee(kyberProxy, normalToken.address, MAX_QTY, normalToken2.address, taker,
                maxDestAmt, minConversionRate, platformWallet, new BN(0), emptyHint, 
                { from: kyberProxy }
            );
            let afterBalance = await normalToken2.balanceOf(taker);
            Helper.assertEqual(MAX_QTY, afterBalance.sub(initBalance), "expected balance is not match");
        });

        it("test e2t revert with max_rate max_qty empty hint", async() => {
            // here we reach max DestAmount because dstAmount = calcDestQty(maxQty, 18, 36, MaxRate)
            // failed at calcRateFromQty for E2T
            await expectRevert(
                network.tradeWithHintAndFee(kyberProxy, ethAddress, MAX_QTY, destToken.address, taker,
                        maxDestAmt, minConversionRate, platformWallet, new BN(0), emptyHint, 
                        { value: MAX_QTY, from: kyberProxy }
                    ),
                "destAmount > MAX_QTY"
            );
        });

        it("test t2e revert with max_rate max_qty empty hint", async() => {
            srcToken.transfer(network.address, MAX_QTY);
            // here we reach max DestAmount because dstAmount = calcDestQty(maxQty, 0, 18, MaxRate)
            // failed at calDstQty for destAmountWithNetworkFee
            await expectRevert(
                network.tradeWithHintAndFee(kyberProxy, srcToken.address, MAX_QTY, ethAddress, taker,
                        maxDestAmt, minConversionRate, platformWallet, new BN(0), emptyHint, 
                        { from: kyberProxy }
                    ),
                "revert trade invalid, if hint involved, try parseHint API"
            );
        });

        it("test e2t revert with max_rate max_qty split trade", async() => {
            hint = await nwHelper.getHint(rateHelper, matchingEngine, reserveInstances, SPLIT_HINTTYPE, undefined, 
                ethAddress, destToken.address, MAX_QTY);
            // here we reach max DestAmount because dstAmount = calcDestQty(maxQty, 18, 36, MaxRate)
            // failed at calcRateFromQty for E2T
            await expectRevert(
                network.tradeWithHintAndFee(kyberProxy, ethAddress, MAX_QTY, destToken.address, taker,
                        maxDestAmt, minConversionRate, platformWallet, new BN(0), hint, 
                        { value: MAX_QTY, from: kyberProxy }
                    ),
                "destAmount > MAX_QTY"
            );
        });

        it("test t2e revert with max_rate max_qty split trade", async() => {
            hint = await nwHelper.getHint(rateHelper, matchingEngine, reserveInstances, SPLIT_HINTTYPE, undefined, 
                srcToken.address, ethAddress, MAX_QTY);
            // here we reach max DestAmount because dstAmount = calcDestQty(maxQty, 0, 18, MaxRate)
            // failed at calDstQty for destAmountWithNetworkFee
            await expectRevert(
                network.tradeWithHintAndFee(kyberProxy, srcToken.address, MAX_QTY, ethAddress, taker,
                        maxDestAmt, minConversionRate, platformWallet, new BN(0), hint, 
                        { from: kyberProxy }
                    ),
                "revert trade invalid, if hint involved, try parseHint API"
            );
        });

        it("test t2t revert with max_rate max_qty split trade", async() => {
            hint = await nwHelper.getHint(rateHelper, matchingEngine, reserveInstances, SPLIT_HINTTYPE, undefined, 
                srcToken.address, destToken.address, new BN(2));
            srcToken.transfer(network.address, new BN(2));

            // console.log(await network.getExpectedRate(srcToken.address, destToken.address, new BN(1)));
            await expectRevert(
                network.tradeWithHintAndFee(kyberProxy, srcToken.address, new BN(2), destToken.address, taker,
                        maxDestAmt, minConversionRate, platformWallet, new BN(0), hint, 
                        { from: kyberProxy }
                    ),
                "destAmount > MAX_QTY"
            );
        });

        it("test t2e revert when overflow at calcTradeSrcAmount", async() => {
            //here when trade from e2t with MAX_RATE MAX_QTY
            //destToken.decimals = 11 so the dstQty = MAX_QTY
            hint = await nwHelper.getHint(rateHelper, matchingEngine, reserveInstances, SPLIT_HINTTYPE, undefined, 
                ethAddress, destToken2.address, MAX_QTY);
            await destToken2.transfer(network.address, MAX_QTY);
            let rateResult = await network.getExpectedRateWithHintAndFee(ethAddress, destToken2.address, MAX_QTY, new BN(0), hint);
            let dstQty = Helper.calcDstQty(MAX_QTY, ethDecimals, await destToken2.decimals(), rateResult.rateWithAllFees);
            await expectRevert(network.tradeWithHintAndFee(kyberProxy, ethAddress, MAX_QTY, destToken2.address, taker,
                    dstQty.sub(new BN(1)), minConversionRate, platformWallet, new BN(0), hint, 
                    { value: MAX_QTY, from: kyberProxy }
                ), "multiplication overflow",
            );
        });
    });
});

//returns random integer between min (inclusive) and max (inclusive)
function getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function log(str) {
    console.log(str);
}

