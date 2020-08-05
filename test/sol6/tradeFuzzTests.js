const TestToken = artifacts.require("Token.sol");
const MockReserve = artifacts.require("MockReserve.sol");
const MockDao = artifacts.require("MockKyberDao.sol");
const MockGasHelper = artifacts.require("MockGasHelper.sol");
const KyberNetwork = artifacts.require("KyberNetwork.sol");
const KyberNetworkProxy = artifacts.require("KyberNetworkProxy.sol");
const FeeHandler = artifacts.require("KyberFeeHandler.sol");
const MatchingEngine = artifacts.require("KyberMatchingEngine.sol");
const RateHelper = artifacts.require("KyberRateHelper.sol");

const Helper = require("../helper.js");
const nwHelper = require("./networkHelper.js");

const BN = web3.utils.BN;

const { ReserveType }  = require('./networkHelper.js');

const networkSimulator = require("./fuzzerFiles/tradeFuzzer/networkSimulator.js");

//global variables
//////////////////
const gasPrice = (new BN(10).pow(new BN(9)).mul(new BN(50)));
const negligibleRateDiffBps = new BN(0);

let networkFeeBps = new BN(20);

let admin;
let storage;
let network;
let kyberDao;
let networkProxy;
let feeHandler;
let matchingEngine;
let gasHelperAdd;
let operator;
let platformWallet;

//kyberDao related data
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

//tokens data
////////////
let numTokens = 5;
let tokens = [];
let tokenDecimals = [];
// for more loops, consider 'export NODE_OPTIONS=--max_old_space_size=8192'
let numberLoops = 10;

// Running Trade Fuzz Tests to test trade with semi random inputs
contract('TradeFuzzTests', function(accounts) {
    before("one time global init", async() => {
        //init accounts
        operator = accounts[1];
        alerter = accounts[2];
        taker = accounts[3];
        platformWallet = accounts[4];
        admin = accounts[5]; // we don't want admin as account 0.
        hintParser = accounts[6];

        //kyberDao related init.
        expiryTimestamp = await Helper.getCurrentBlockTime() + 10;
        kyberDao = await MockDao.new(rewardInBPS, rebateInBPS, epoch, expiryTimestamp);
        await kyberDao.setNetworkFeeBps(networkFeeBps);

        //init tokens
        for (let i = 0; i < numTokens; i++) {
            tokenDecimals[i] = new BN(15).add(new BN(i));
            token = await TestToken.new("test" + i, "tst" + i, tokenDecimals[i]);
            tokens[i] = token;
        }
        networkFeeBps = new BN(20);
    });

    beforeEach("init for each test", async() => {
        // kyberDao related init.
        expiryTimestamp = await Helper.getCurrentBlockTime() + 10;
        kyberDao = await MockDao.new(rewardInBPS, rebateInBPS, epoch, expiryTimestamp);
        await kyberDao.setNetworkFeeBps(networkFeeBps);

        // init storage and network
        storage = await nwHelper.setupStorage(admin);
        network = await KyberNetwork.new(admin, storage.address);
        await storage.setNetworkContract(network.address, {from: admin});
        await storage.addOperator(operator, {from: admin});

        networkProxy = await KyberNetworkProxy.new(admin);
        await networkProxy.setKyberNetwork(network.address, {from: admin});

        // init feeHandler
        KNC = await TestToken.new("kyber network crystal", "KNC", 18);
        feeHandler = await FeeHandler.new(kyberDao.address, networkProxy.address, network.address, KNC.address, burnBlockInterval, kyberDao.address);

        // init matchingEngine
        matchingEngine = await MatchingEngine.new(admin);
        await matchingEngine.setNetworkContract(network.address, {from: admin});
        await matchingEngine.setKyberStorage(storage.address, {from: admin});
        await storage.setFeeAccountedPerReserveType(true, true, true, false, true, true, {from: admin});
        await storage.setEntitledRebatePerReserveType(true, false, true, false, true, true, {from: admin});

        await networkProxy.setHintHandler(matchingEngine.address, {from: admin});

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
        await network.addKyberProxy(networkProxy.address, {from: admin});
        await network.setKyberDaoContract(kyberDao.address, {from: admin});
        //set params, enable network
        await network.setParams(gasPrice, negligibleRateDiffBps, {from: admin});
        await network.setEnable(true, {from: admin});

        let result = await nwHelper.setupReserves(network, tokens, 10, 0, 0, 0, accounts, admin, operator);

        reserveInstances = result.reserveInstances;

        // update some reserves to type utility, so they are not fee accounted
        for(const [key, value] of Object.entries(reserveInstances)) {
            if (Math.random() <= 0.3) {
                value.onChainType = ReserveType.UTILITY;
            }
            reserveInstances[key] = value;
        }

        //add and list pair for reserve
        await nwHelper.addReservesToStorage(storage, reserveInstances, tokens, operator);
    });

    it(`Run semi-random trade simulator with ${numberLoops} loops`, async() => {
        await networkSimulator.doFuzzTradeTests(
            network, networkProxy, storage, matchingEngine,
            reserveInstances, accounts, tokens, numberLoops
        );
    });

    it(`Run random trade simulator with ${numberLoops} loops`, async() => {
        await networkSimulator.doRandomFuzzTradeTests(
            network, networkProxy, storage, matchingEngine,
            reserveInstances, accounts, tokens, numberLoops
        );
    });
});
