const TestToken = artifacts.require("Token.sol");
const TestTokenNotReturn = artifacts.require("TestTokenNotReturn.sol");
const MockDao = artifacts.require("MockDAO.sol");
const KyberNetwork = artifacts.require("KyberNetwork.sol");
const KyberNetworkProxy = artifacts.require("KyberNetworkProxy.sol");
const FeeHandler = artifacts.require("KyberFeeHandler.sol");
const MatchingEngine = artifacts.require("KyberMatchingEngine.sol");
const RateHelper = artifacts.require("KyberRateHelper.sol");
const GenerousNetwork = artifacts.require("GenerousKyberNetwork.sol");
const GenerousNetwork2 = artifacts.require("GenerousKyberNetwork2.sol");
const MaliciousNetwork = artifacts.require("MaliciousKyberNetwork.sol");
const Helper = require("../helper.js");
const nwHelper = require("./networkHelper.js");

const BN = web3.utils.BN;

const { expectEvent, expectRevert } = require('@openzeppelin/test-helpers');
const {BPS, precisionUnits, ethDecimals, ethAddress, zeroAddress, emptyHint} = require("../helper.js");
const {APR_ID, BRIDGE_ID, MOCK_ID, FPR_ID, type_apr, type_fpr, type_MOCK, MASK_IN_HINTTYPE, 
    MASK_OUT_HINTTYPE, SPLIT_HINTTYPE, EMPTY_HINTTYPE}  = require('./networkHelper.js');

//global variables
//////////////////
const gasPrice = (new BN(10).pow(new BN(9)).mul(new BN(50)));
const negligibleRateDiffBps = new BN(10); //0.01% 
const maxDestAmt = new BN(2).pow(new BN(255));

let networkFeeBps = new BN(20);

let admin;
let alerter;
let networkProxy;
let network;
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
let expiryBlockNumber;

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
        expiryBlockNumber = new BN(await web3.eth.getBlockNumber() + 150);
        DAO = await MockDao.new(rewardInBPS, rebateInBPS, epoch, expiryBlockNumber);
        await DAO.setNetworkFeeBps(networkFeeBps);

        //deploy network
        network = await KyberNetwork.new(admin);

        // init proxy
        networkProxy = await KyberNetworkProxy.new(admin);

        //init matchingEngine
        matchingEngine = await MatchingEngine.new(admin);
        await matchingEngine.setNetworkContract(network.address, {from: admin});
        await matchingEngine.setFeePayingPerReserveType(true, true, true, false, true, true, {from: admin});

        rateHelper = await RateHelper.new(admin);
        await rateHelper.setContracts(matchingEngine.address, DAO.address, {from: admin});

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
        feeHandler = await FeeHandler.new(DAO.address, networkProxy.address, network.address, KNC.address, burnBlockInterval);

        // init and setup reserves
        let result = await nwHelper.setupReserves(network, tokens, 0, 5, 0, 0, accounts, admin, operator);
        reserveInstances = result.reserveInstances;
        numReserves += result.numAddedReserves * 1;

        //setup network
        ///////////////
        await network.addKyberProxy(networkProxy.address, {from: admin});
        await network.addOperator(operator, {from: admin});
        await network.setContracts(feeHandler.address, matchingEngine.address, zeroAddress, {from: admin});
        await network.setDAOContract(DAO.address, {from: admin});

        //add and list pair for reserve
        await nwHelper.addReservesToNetwork(network, reserveInstances, tokens, operator);

        //set params, enable network
        await network.setParams(gasPrice, negligibleRateDiffBps, {from: admin});
        await network.setEnable(true, {from: admin});
    });

    describe("test get rates - compare proxy rate to netwrk returned rates", async() => {
        describe("getExpectedRate (backward compatible)", async() => {
            it("verify getExpectedRate (backward compatible) for t2e.", async() => {
                let tokenAdd = tokens[4].address; 
                let srcQty = (new BN(3)).mul((new BN(10)).pow(new BN(tokenDecimals[4])));
                let networkRate = await network.getExpectedRateWithHintAndFee(tokenAdd, ethAddress, srcQty, 0, emptyHint);
                let proxyRate = await networkProxy.getExpectedRate(tokenAdd, ethAddress, srcQty);
                Helper.assertEqual(proxyRate.worstRate, proxyRate.expectedRate.mul(new BN(97)).div(new BN(100)));
                Helper.assertEqual(networkRate.rateAfterNetworkFee, proxyRate.expectedRate, 
                    "expected rate network not equal rate proxy");
            });
            
            it("verify getExpectedRate (backward compatible) for e2t.", async() => {
                let tokenAdd = tokens[3].address; 
                let srcQty = (new BN(2)).mul((new BN(10)).pow(new BN(ethDecimals)));
                let networkRate = await network.getExpectedRateWithHintAndFee(ethAddress, tokenAdd, srcQty, 0, emptyHint)
                let proxyRate = await networkProxy.getExpectedRate(ethAddress, tokenAdd, srcQty);
                Helper.assertEqual(proxyRate.worstRate, proxyRate.expectedRate.mul(new BN(97)).div(new BN(100)));
                Helper.assertEqual(networkRate.rateAfterNetworkFee, proxyRate.expectedRate, 
                    "expected rate network not equal rate proxy");
            });
            
            it("verify getExpectedRate (backward compatible) for t2t.", async() => {
                let srcAdd = tokens[1].address;
                let destAdd = tokens[2].address;
                let srcQty = (new BN(10)).mul((new BN(10)).pow(new BN(tokenDecimals[1])));
                let networkRate = await network.getExpectedRateWithHintAndFee(srcAdd, destAdd, srcQty, 0, emptyHint);
                let proxyRate = await networkProxy.getExpectedRate(srcAdd, destAdd, srcQty);
                Helper.assertEqual(proxyRate.worstRate, proxyRate.expectedRate.mul(new BN(97)).div(new BN(100)));
                Helper.assertEqual(networkRate.rateAfterNetworkFee, proxyRate.expectedRate, 
                    "expected rate network not equal rate proxy");
            });
        });
        
        describe("test getExpectedRateAfterFee - different hints, fees.", async() => {
            it("check for e2t, different fees, no hint.", async() => {
                for (let fee = 0; fee <= 100; fee+= 50) {
                    let i = 0;
                    let tokenAdd = tokens[i].address; 
                    let srcQty = (new BN(3)).mul((new BN(10)).pow(new BN(tokenDecimals[i++])));
                    let networkRate = await network.getExpectedRateWithHintAndFee(ethAddress, tokenAdd, srcQty, fee, emptyHint)
                    let proxyRate = await networkProxy.getExpectedRateAfterFee(ethAddress, tokenAdd, srcQty, fee, emptyHint);
                    Helper.assertEqual(networkRate.rateAfterAllFees, proxyRate, 
                        "expected rate network not equal rate proxy, %d", i);                
                }
            });

            it("check for t2e, different fees, no hint.", async() => {
                let i = numTokens - 1;
                    
                for (let fee = 0; fee <= 100; fee+= 50) {
                    let tokenAdd = tokens[i].address; 
                    let srcQty = (new BN(3)).mul((new BN(10)).pow(new BN(ethDecimals)));
                    let networkRate = await network.getExpectedRateWithHintAndFee(tokenAdd, ethAddress, srcQty, fee, emptyHint)
                    let proxyRate = await networkProxy.getExpectedRateAfterFee(tokenAdd, ethAddress, srcQty, fee, emptyHint);
                    Helper.assertEqual(networkRate.rateAfterAllFees, proxyRate, 
                        "expected rate network not equal rate proxy, %d", i);                
                    i--;
                }
            });

            it("check for t2t, zero fee, no hint.", async() => {
                let i = 0;
                
                for (let fee = 0; fee <= 100; fee+= 50) {
                    let srcAdd = tokens[i].address;
                    let destAdd = tokens[(i + 1) % numTokens].address;
                    let srcQty = (new BN(3)).mul((new BN(10)).pow(new BN(tokenDecimals[i])));
                    let networkRate = await network.getExpectedRateWithHintAndFee(srcAdd, destAdd, srcQty, fee, emptyHint)
                    let proxyRate = await networkProxy.getExpectedRateAfterFee(srcAdd, destAdd, srcQty, fee, emptyHint);
                    Helper.assertEqual(networkRate.rateAfterAllFees, proxyRate, 
                        "expected rate network not equal rate proxy, %d", i);                
                    i++;
                }
            });

            it("check for t2e, different fees, mask in trade type.", async() => {
                // TODO: add trade type
                let i = numTokens - 1;
                    
                for (let fee = 0; fee <= 100; fee+= 50) {
                    let tokenAdd = tokens[i].address; 
                    let srcQty = (new BN(3)).mul((new BN(10)).pow(new BN(ethDecimals)));
                    let networkRate = await network.getExpectedRateWithHintAndFee(tokenAdd, ethAddress, srcQty, fee, emptyHint)
                    let proxyRate = await networkProxy.getExpectedRateAfterFee(tokenAdd, ethAddress, srcQty, fee, emptyHint);
                    Helper.assertEqual(networkRate.rateAfterAllFees, proxyRate, 
                        "expected rate network not equal rate proxy, %d", i);                
                    i--;
                }
            });

            it("check for e2t, different fees, mask in trade type.", async() => {
                // TODO: add trade type
                let i = numTokens - 1;
                    
                for (let fee = 0; fee <= 100; fee+= 50) {
                    let tokenAdd = tokens[i].address; 
                    let srcQty = (new BN(3)).mul((new BN(10)).pow(new BN(ethDecimals)));
                    let networkRate = await network.getExpectedRateWithHintAndFee(tokenAdd, ethAddress, srcQty, fee, emptyHint);
                    let proxyRate = await networkProxy.getExpectedRateAfterFee(tokenAdd, ethAddress, srcQty, fee, emptyHint);
                    Helper.assertEqual(networkRate.rateAfterAllFees, proxyRate, 
                        "expected rate network not equal rate proxy, %d", i);                
                    i--;
                }
            });

            it("check for t2t, zero fee, mask in type.", async() => {
                // TODO: add trade type
                let i = 0;
                
                for (let fee = 0; fee <= 100; fee+= 50) {
                    let srcAdd = tokens[i].address;
                    let destAdd = tokens[(i + 1) % numTokens].address;
                    let srcQty = (new BN(3)).mul((new BN(10)).pow(new BN(tokenDecimals[i])));
                    let networkRate = await network.getExpectedRateWithHintAndFee(srcAdd, destAdd, srcQty, fee, emptyHint)
                    let proxyRate = await networkProxy.getExpectedRateAfterFee(srcAdd, destAdd, srcQty, fee, emptyHint);
                    Helper.assertEqual(networkRate.rateAfterAllFees, proxyRate, 
                        "expected rate network not equal rate proxy, %d", i);                
                    i++;
                }
            });

            it("check for t2e, different fees, split trade type.", async() => {
                // TODO: add trade type
                let i = numTokens - 1;
                    
                for (let fee = 0; fee <= 100; fee+= 50) {
                    let tokenAdd = tokens[i].address; 
                    let srcQty = (new BN(3)).mul((new BN(10)).pow(new BN(ethDecimals)));
                    let networkRate = await network.getExpectedRateWithHintAndFee(tokenAdd, ethAddress, srcQty, fee, emptyHint)
                    let proxyRate = await networkProxy.getExpectedRateAfterFee(tokenAdd, ethAddress, srcQty, fee, emptyHint);
                    Helper.assertEqual(networkRate.rateAfterAllFees, proxyRate, 
                        "expected rate network not equal rate proxy, %d", i);                
                    i--;
                }
            });

            it("check for e2t, different fees, split trade type", async() => {
                // TODO: add trade type
                let i = numTokens - 1;
                    
                for (let fee = 0; fee <= 100; fee+= 50) {
                    let tokenAdd = tokens[i].address; 
                    let srcQty = (new BN(3)).mul((new BN(10)).pow(new BN(ethDecimals)));
                    let networkRate = await network.getExpectedRateWithHintAndFee(tokenAdd, ethAddress, srcQty, fee, emptyHint)
                    let proxyRate = await networkProxy.getExpectedRateAfterFee(tokenAdd, ethAddress, srcQty, fee, emptyHint);
                    Helper.assertEqual(networkRate.rateAfterAllFees, proxyRate, 
                        "expected rate network not equal rate proxy, %d", i);                
                    i--;
                }
            });

            it("check for t2t, zero fee, split trade type.", async() => {
                // TODO: add trade type
                let i = 0;
                
                for (let fee = 0; fee <= 100; fee+= 50) {
                    let srcAdd = tokens[i].address;
                    let destAdd = tokens[(i + 1) % numTokens].address;
                    let srcQty = (new BN(3)).mul((new BN(10)).pow(new BN(tokenDecimals[i])));
                    let networkRate = await network.getExpectedRateWithHintAndFee(srcAdd, destAdd, srcQty, fee, emptyHint)
                    let proxyRate = await networkProxy.getExpectedRateAfterFee(srcAdd, destAdd, srcQty, fee, emptyHint);
                    Helper.assertEqual(networkRate.rateAfterAllFees, proxyRate, 
                        "expected rate network not equal rate proxy, %d", i);                
                    i++;
                }
            });

            it("check for t2e, different fees, mask out.", async() => {
            // TODO: add trade type
                let i = numTokens - 1;
                    
                for (let fee = 0; fee <= 100; fee+= 50) {
                    let tokenAdd = tokens[i].address; 
                    let srcQty = (new BN(3)).mul((new BN(10)).pow(new BN(ethDecimals)));
                    let networkRate = await network.getExpectedRateWithHintAndFee(tokenAdd, ethAddress, srcQty, fee, emptyHint)
                    let proxyRate = await networkProxy.getExpectedRateAfterFee(tokenAdd, ethAddress, srcQty, fee, emptyHint);
                    Helper.assertEqual(networkRate.rateAfterAllFees, proxyRate, 
                        "expected rate network not equal rate proxy, %d", i);                
                    i--;
                }
            });

            it("check for e2t, different fees, mask out.", async() => {
                // TODO: add trade type
                let i = numTokens - 1;
                    
                for (let fee = 0; fee <= 100; fee+= 50) {
                    let tokenAdd = tokens[i].address; 
                    let srcQty = (new BN(3)).mul((new BN(10)).pow(new BN(ethDecimals)));
                    let networkRate = await network.getExpectedRateWithHintAndFee(tokenAdd, ethAddress, srcQty, fee, emptyHint)
                    let proxyRate = await networkProxy.getExpectedRateAfterFee(tokenAdd, ethAddress, srcQty, fee, emptyHint);
                    Helper.assertEqual(networkRate.rateAfterAllFees, proxyRate, 
                        "expected rate network not equal rate proxy, %d", i);                
                    i--;
                }
            });

            it("check for t2t, zero fee, mask out.", async() => {
                // TODO: add trade type
                let i = 0;
                
                for (let fee = 0; fee <= 100; fee+= 50) {
                    let srcAdd = tokens[i].address;
                    let destAdd = tokens[(i + 1) % numTokens].address;
                    let srcQty = (new BN(3)).mul((new BN(10)).pow(new BN(tokenDecimals[i])));
                    let networkRate = await network.getExpectedRateWithHintAndFee(srcAdd, destAdd, srcQty, fee, emptyHint)
                    let proxyRate = await networkProxy.getExpectedRateAfterFee(srcAdd, destAdd, srcQty, fee, emptyHint);
                    Helper.assertEqual(networkRate.rateAfterAllFees, proxyRate, 
                        "expected rate network not equal rate proxy, %d", i);                
                    i++;
                }
            });
        });

        describe("test getPriceData no fee - different hints.", async() => {
            it("check for e2t, with fees, no hint.", async() => {
                let fee = 10;
                let tokenAdd = tokens[3].address; 
                let srcQty = (new BN(3)).mul((new BN(10)).pow(new BN(ethDecimals)));
                let networkRate = await network.getExpectedRateWithHintAndFee(ethAddress, tokenAdd, srcQty, fee, emptyHint)
                let proxyRate = await networkProxy.getPriceDataNoFees(ethAddress, tokenAdd, srcQty, emptyHint);
                Helper.assertEqual(networkRate.rateNoFees, proxyRate, "expected rate network not equal rate proxy");
            });
            it("check for t2e, with fees, no hint.", async() => {
                let fee = 14;
                let tokenAdd = tokens[0].address; 
                let srcQty = (new BN(3)).mul((new BN(10)).pow(new BN(tokenDecimals[0])));
                let networkRate = await network.getExpectedRateWithHintAndFee(tokenAdd, ethAddress, srcQty, fee, emptyHint)
                let proxyRate = await networkProxy.getPriceDataNoFees(tokenAdd, ethAddress, srcQty, emptyHint);
                Helper.assertEqual(networkRate.rateNoFees, proxyRate, "expected rate network not equal rate proxy");     
            });
            //TODO: add trade type
        });
    });

    describe("test trades - report gas", async() => {
        before("    ", async() => {
            
        });
        
        
        let PlatformFeeValue = [0, 111];
        let tradeType = [MASK_IN_HINTTYPE, MASK_OUT_HINTTYPE, SPLIT_HINTTYPE, EMPTY_HINTTYPE];
        let typeStr = ['MASK_IN', 'MASK_OUT', 'SPLIT', 'NO HINT'];

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
                let rate = await networkProxy.getExpectedRateAfterFee(tokenAdd, ethAddress, srcQty, 0, hint);
                
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
                
                let rate = await networkProxy.getExpectedRateAfterFee(ethAddress, tokenAdd, srcQty, 0, hint);
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
                let rate = await networkProxy.getExpectedRateAfterFee(srcAdd, destAdd, srcQty, 0, hint);
                
                await srcToken.transfer(taker, srcQty);
                await srcToken.approve(networkProxy.address, srcQty, {from: taker});   
                let txResult = await networkProxy.tradeWithHintAndFee(srcAdd, srcQty, destAdd, taker, 
                    maxDestAmt, calcMinRate(rate), platformWallet, fee, hint, {from: taker});
                console.log(`t2t: ${txResult.receipt.gasUsed} gas used, type: ` + str + ' fee: ' + fee + " num reserves: " + numResForTest);
            });
        } // loop trade types
    });


    describe("test actual rate vs min rate in different scenarios. ", async() => {
        //todo: use minRate = network.getRateWithFee and see why its very different then actual calculated rate in proxy
    });

    describe("test trade with token does not return values for its functions", async() => {
        let mockNetwork;
        let mockProxy;
        let mockMatchingEngine;
        let mockRateHelper;
        let mockTokens = [];
        let mockTokenDecimals = [];
        let feeHandler;
        let mockReserveInstances;

        // loop trades
        let tradeType = [MASK_IN_HINTTYPE, MASK_OUT_HINTTYPE, SPLIT_HINTTYPE, EMPTY_HINTTYPE];
        let typeStr = ['MASK_IN', 'MASK_OUT', 'SPLIT', 'NO HINT'];

        let srcToken;
        let srcDecimals;
        let destToken;
        let destDecimals;

        before("Setup contracts with token not return any thing", async() => {
            //DAO related init.
            let expiryBlockNumber = new BN(await web3.eth.getBlockNumber() + 150);
            let mockDAO = await MockDao.new(rewardInBPS, rebateInBPS, epoch, expiryBlockNumber);
            await mockDAO.setNetworkFeeBps(networkFeeBps);

            //deploy network
            mockNetwork = await KyberNetwork.new(admin);

            // init proxy
            mockProxy = await KyberNetworkProxy.new(admin);

            //init matchingEngine
            mockMatchingEngine = await MatchingEngine.new(admin);
            await mockMatchingEngine.setNetworkContract(mockNetwork.address, {from: admin});
            await mockMatchingEngine.setFeePayingPerReserveType(true, true, true, false, true, true, {from: admin});

            mockRateHelper = await RateHelper.new(admin);
            await mockRateHelper.setContracts(mockMatchingEngine.address, mockDAO.address, {from: admin});

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
            feeHandler = await FeeHandler.new(mockDAO.address, mockProxy.address, mockNetwork.address, KNC.address, burnBlockInterval);

            // init and setup reserves
            let result = await nwHelper.setupReserves(mockNetwork, mockTokens, 5, 0, 0, 0, accounts, admin, operator);
            mockReserveInstances = result.reserveInstances;

            //setup network
            ///////////////
            await mockNetwork.addKyberProxy(mockProxy.address, {from: admin});
            await mockNetwork.addOperator(operator, {from: admin});

            await mockNetwork.setContracts(feeHandler.address, mockMatchingEngine.address, zeroAddress, {from: admin});
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
                let rate = await mockProxy.getExpectedRateAfterFee(srcToken.address, ethAddress, srcQty, 0, hint);

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

                let rate = await mockProxy.getExpectedRateAfterFee(ethAddress, destToken.address, srcQty, 0, hint);
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
                let rate = await mockProxy.getExpectedRateAfterFee(srcToken.address, destToken.address, srcQty, 0, hint);

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
            let newNetWork = await KyberNetwork.new(admin);
            let txResult = await networkProxy.setKyberNetwork(newNetWork.address, { from: admin });
            await expectEvent(txResult, "KyberNetworkSet", {
                newNetwork: newNetWork.address, oldNetwork: network.address,
            })
            await networkProxy.setKyberNetwork(network.address, { from: admin });
        });

        it("ExecuteTrade", async () => {
            let srcToken = tokens[1]
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
            await expectRevert(networkProxy.setHintHandler(zeroAddress, { from: admin }), "Hint handler 0");
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
            generousNetwork = await GenerousNetwork.new(admin);
            await nwHelper.setupNetwork(generousNetwork, networkProxy.address, KNC.address, DAO.address, tokens, accounts, admin, operator);
            let result = await nwHelper.setupReserves(generousNetwork, tokens, 1, 1, 0, 0, accounts, admin, operator);
            await nwHelper.addReservesToNetwork(generousNetwork, result.reserveInstances, tokens, operator);
            // set up maliciousNetwork
            maliciousNetwork = await MaliciousNetwork.new(admin);
            await nwHelper.setupNetwork(maliciousNetwork, networkProxy.address, KNC.address, DAO.address, tokens, accounts, admin, operator);
            result = await nwHelper.setupReserves(maliciousNetwork, tokens, 1, 1, 0, 0, accounts, admin, operator);
            await nwHelper.addReservesToNetwork(maliciousNetwork, result.reserveInstances, tokens, operator);
            // set up generousNetwork2
            generousNetwork2 =await GenerousNetwork2.new(admin);
            await nwHelper.setupNetwork(generousNetwork2, networkProxy.address, KNC.address, DAO.address, tokens, accounts, admin, operator);
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
                ), "Kyber network returned wrong amount"
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
                ), "Wrong amount in source address"
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
                ), "Wrong amount in destination address"
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
                ), "Destination amount bigger then max destination amount"
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
                ), "rate < minRate"
            );
        });

        after("clean up & set reference back to network", async () => {
            await networkProxy.setKyberNetwork(network.address, { from: admin });
        });
    });
    // test 
})

function getQtyTokensDecimals(srcTokId, destTokId, qtyDecimals, qtyToken) {
    let srcToken = tokens[srcTokId];
    let srcDecimals = tokenDecimals[srcTokId];
    let destToken = tokens[destTokId];
    let destDecimals = tokens[destTokId];
    let qty = new BN(qtyToken).mul(new BN(10).pow(new BN(qtyDecimals)));

    return [qty, srcToken, srcDecimals, destToken, destDecimals];
}

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
