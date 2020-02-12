const TestToken = artifacts.require("Token.sol");
const MockReserve = artifacts.require("MockReserve.sol");
const MockDao = artifacts.require("MockDAO.sol");
const KyberNetwork = artifacts.require("KyberNetwork.sol");
const KyberNetworkProxy = artifacts.require("KyberNetworkProxy.sol");
const FeeHandler = artifacts.require("FeeHandler.sol");
const TradeLogic = artifacts.require("KyberTradeLogic.sol");
const Helper = require("../v4/helper.js");
const nwHelper = require("./networkHelper.js");

const BN = web3.utils.BN;

const { expectEvent, expectRevert } = require('@openzeppelin/test-helpers');
const {BPS, precisionUnits, ethDecimals, ethAddress, zeroAddress, emptyHint} = require("../v4/helper.js");
const {APR_ID, BRIDGE_ID, MOCK_ID, FPR_ID, type_apr, type_fpr, type_MOCK, MASK_IN_HINTTYPE, 
    MASK_OUT_HINTTYPE, SPLIT_HINTTYPE, EMPTY_HINTTYPE}  = require('./networkHelper.js');

//global variables
//////////////////
const gasPrice = (new BN(10).pow(new BN(9)).mul(new BN(50)));
const negligibleRateDiffBps = new BN(10); //0.01% 
const maxDestAmt = new BN(2).pow(new BN(255));
const minConversionRate = new BN(0);

let takerFeeBps = new BN(20);
let platformFeeBps = new BN(0);
let takerFeeAmount;
let txResult;

let admin;
let alerter;
let networkProxy;
let network;
let DAO;
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
let reserveInstances = [];
let numReserves;

//tokens data
////////////
let numTokens = 5;
let tokens = [];
let tokenDecimals = [];
let srcToken;
let ethSrcQty = precisionUnits;

//rates data
////////////

let tempNetwork;

contract('KyberNetworkProxy', function(accounts) {
    before("one time global init", async() => {
        //init accounts
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
        
        //deploy network
        network = await KyberNetwork.new(admin);
        
        // init proxy
        networkProxy = await KyberNetworkProxy.new(admin);

        //init tradeLogic
        tradeLogic = await TradeLogic.new(admin);
        await tradeLogic.setNetworkContract(network.address, {from: admin});

        // setup proxy
        await networkProxy.setKyberNetwork(network.address, {from: admin});
        await networkProxy.setHintHandler(tradeLogic.address, {from: admin});

        //init tokens
        for (let i = 0; i < numTokens; i++) {
            tokenDecimals[i] = new BN(15).add(new BN(i));
            token = await TestToken.new("test" + i, "tst" + i, tokenDecimals[i]);
            tokens[i] = token;
        }

        //init feeHandler
        KNC = await TestToken.new("kyber network crystal", "KNC", 18);
        feeHandler = await FeeHandler.new(DAO.address, networkProxy.address, network.address, KNC.address, burnBlockInterval);

        //init tradeLogic
        tradeLogic = await TradeLogic.new(admin);
        await tradeLogic.setNetworkContract(network.address, {from: admin});

        // init and setup reserves
        let result = await nwHelper.setupReserves(network, tokens, 1, 3, 0, 0, accounts, admin, operator);
        reserveInstances = result.reserveInstances;
        numReserves += result.numAddedReserves * 1;

        //setup network
        ///////////////
        await network.addKyberProxy(networkProxy.address, {from: admin});
        await network.addOperator(operator, {from: admin});
        await network.setContracts(feeHandler.address, DAO.address, tradeLogic.address, {from: admin});

        //add and list pair for reserve
        nwHelper.addReservesToNetwork(network, reserveInstances, tokens, operator);
        
        //set params, enable network
        await network.setParams(gasPrice, negligibleRateDiffBps, {from: admin});
        await network.setEnable(true, {from: admin});
    });

    describe("test get rates - compare proxy rate to netwrk returned rates", async() => {
        describe("getExpectedRate (backward compatible)", async() => {
            it("verify getExpectedRate (backward compatible) for t2e.", async() => {
                let tokenAdd = tokens[4].address; 
                let srcQty = (new BN(3)).mul((new BN(10)).pow(new BN(tokenDecimals[4])));
                let networkRate = await network.getExpectedRateWithHintAndFee(tokenAdd, ethAddress, srcQty, 0, emptyHint)
                let proxyRate = await networkProxy.getExpectedRate(tokenAdd, ethAddress, srcQty);
                Helper.assertEqual(networkRate.rateAfterNetworkFees, proxyRate.expectedRate, 
                    "expected rate network not equal rate proxy");
            });
            
            it("verify getExpectedRate (backward compatible) for e2t.", async() => {
                let tokenAdd = tokens[3].address; 
                let srcQty = (new BN(2)).mul((new BN(10)).pow(new BN(tokenDecimals[ethDecimals])));
                let networkRate = await network.getExpectedRateWithHintAndFee(ethAddress, tokenAdd, srcQty, 0, emptyHint)
                let proxyRate = await networkProxy.getExpectedRate(ethAddress, tokenAdd, srcQty);
                Helper.assertEqual(networkRate.rateAfterNetworkFees, proxyRate.expectedRate, 
                    "expected rate network not equal rate proxy");
            });
            
            it("verify getExpectedRate (backward compatible) for t2t.", async() => {
                let srcAdd = tokens[1].address;
                let destAdd = tokens[2].address;
                let srcQty = (new BN(10)).mul((new BN(10)).pow(new BN(tokenDecimals[1])));
                let networkRate = await network.getExpectedRateWithHintAndFee(srcAdd, destAdd, srcQty, 0, emptyHint);
                let proxyRate = await networkProxy.getExpectedRate(srcAdd, destAdd, srcQty);
                Helper.assertEqual(networkRate.rateAfterNetworkFees, proxyRate.expectedRate, 
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
                    let networkRate = await network.getExpectedRateWithHintAndFee(tokenAdd, ethAddress, srcQty, fee, emptyHint)
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
        });
    });

    describe("test trades - report gas", async() => {
        before("    ", async() => {
            
        });
        
        it("t2e trade (no hint), 0 fee", async() => {
            let tokenId = 1;
            let tokenAdd = tokens[tokenId].address;
            let token = tokens[tokenId];
            let fee = 0;
            let srcQty = (new BN(3)).mul((new BN(10)).pow(new BN(tokenDecimals[tokenId])));
            let rate = await networkProxy.getExpectedRateAfterFee(tokenAdd, ethAddress, srcQty, fee, emptyHint);
           
            await token.transfer(taker, srcQty);
            await token.approve(networkProxy.address, srcQty, {from: taker});

            //todo: fix min rate
            let txResult = await networkProxy.tradeWithHintAndFee(tokenAdd, srcQty, ethAddress, taker, 
                maxDestAmt, rate, platformWallet, fee, emptyHint, {from: taker});
            console.log(`t2e: ${txResult.receipt.gasUsed} gas used`);
        });

        it("t2e trade (no hint), 0 fee", async() => {
            let tokenId = 1;
            let tokenAdd = tokens[tokenId].address;
            let token = tokens[tokenId];
            let fee = 0;
            let srcQty = (new BN(3)).mul((new BN(10)).pow(new BN(tokenDecimals[tokenId])));
            let rate = await networkProxy.getExpectedRateAfterFee(tokenAdd, ethAddress, srcQty, fee, emptyHint);
           
            await token.transfer(taker, srcQty);
            await token.approve(networkProxy.address, srcQty, {from: taker});

            //todo: fix min rate
            let txResult = await networkProxy.tradeWithHintAndFee(tokenAdd, srcQty, ethAddress, taker, 
                maxDestAmt, rate, platformWallet, fee, emptyHint, {from: taker});
            console.log(`t2e: ${txResult.receipt.gasUsed} gas used`);
        });

        it("t2e trade (no hint), with fee", async() => {
            let tokenId = 3;
            let tokenAdd = tokens[tokenId].address;
            let token = tokens[tokenId];
            let fee = 113;
            let srcQty = (new BN(3)).mul((new BN(10)).pow(new BN(tokenDecimals[tokenId])));
            let rate = await networkProxy.getExpectedRateAfterFee(tokenAdd, ethAddress, srcQty, fee, emptyHint);
            
            await token.transfer(taker, srcQty);
            await token.approve(networkProxy.address, srcQty, {from: taker});

            let txResult = await networkProxy.tradeWithHintAndFee(tokenAdd, srcQty, ethAddress, taker, 
                maxDestAmt, rate, platformWallet, fee, emptyHint, {from: taker});
            console.log(`t2e: ${txResult.receipt.gasUsed} gas used`);
        });

        it("e2t trade (no hint), 0 fee", async() => {
            let tokenId = 4;
            let tokenAdd = tokens[tokenId].address;
            let fee = 0;
            let srcQty = (new BN(3)).mul((new BN(10)).pow(new BN(ethDecimals)));
            let rate = await networkProxy.getExpectedRateAfterFee(ethAddress, tokenAdd, srcQty, fee, emptyHint);
           
            let txResult = await networkProxy.tradeWithHintAndFee(ethAddress, srcQty, tokenAdd, taker, 
                maxDestAmt, rate, platformWallet, fee, emptyHint, {from: taker, value: srcQty});
            console.log(`e2t: ${txResult.receipt.gasUsed} gas used`);
        });

        it("e2t trade (no hint), with fee", async() => {
            let tokenId = 2;
            let tokenAdd = tokens[tokenId].address;
            let fee = 210;
            let srcQty = (new BN(3)).mul((new BN(10)).pow(new BN(ethDecimals)));
            let rate = await networkProxy.getExpectedRateAfterFee(ethAddress, tokenAdd, srcQty, fee, emptyHint);
           
            let txResult = await networkProxy.tradeWithHintAndFee(ethAddress, srcQty, tokenAdd, taker, 
                maxDestAmt, rate, platformWallet, fee, emptyHint, {from: taker, value: srcQty});
            console.log(`e2t: ${txResult.receipt.gasUsed} gas used`);
        });
    
        it("t2t trade (no hint), 0 fee", async() => {
            let srcId = 1;
            let srcAdd = tokens[srcId].address;
            let srcToken = tokens[srcId];
            let destId = 3;
            let destAdd = tokens[destId].address;
            let fee = 0;
            let srcQty = (new BN(3)).mul((new BN(10)).pow(new BN(tokenDecimals[srcId])));
            let rate = await networkProxy.getExpectedRateAfterFee(srcAdd, destAdd, srcQty, fee, emptyHint);
           
            await srcToken.transfer(taker, srcQty);
            await srcToken.approve(networkProxy.address, srcQty, {from: taker});

            let txResult = await networkProxy.tradeWithHintAndFee(srcAdd, srcQty, destAdd, taker, 
                maxDestAmt, rate, platformWallet, fee, emptyHint, {from: taker});
            console.log(`t2t no hint 0 fee: ${txResult.receipt.gasUsed} gas used`);
        });

        it("t2t trade (no hint), with fee", async() => {
            let srcId = 1;
            let srcAdd = tokens[srcId].address;
            let srcToken = tokens[srcId];
            let destId = 3;
            let destAdd = tokens[destId].address;
            let fee = 231;
            let srcQty = (new BN(3)).mul((new BN(10)).pow(new BN(tokenDecimals[srcId])));
            let rate = await networkProxy.getExpectedRateAfterFee(srcAdd, destAdd, srcQty, fee, emptyHint);
           
            await srcToken.transfer(taker, srcQty);
            await srcToken.approve(networkProxy.address, srcQty, {from: taker});

            let txResult = await networkProxy.tradeWithHintAndFee(srcAdd, srcQty, destAdd, taker, 
                maxDestAmt, rate, platformWallet, fee, emptyHint, {from: taker});
            console.log(`t2t no hint 0 fee: ${txResult.receipt.gasUsed} gas used`);
        });

        let tradeType = [MASK_IN_HINTTYPE, MASK_OUT_HINTTYPE, SPLIT_HINTTYPE];
        let typeStr = ['MASK_in', 'MASK_OUT', 'SPLIT'];

        for(let i = 0; i < tradeType.length; i++) {
            let type = tradeType[i];
            let str = typeStr[i];

            it("should perform a T2E trade with hint", async() => {
                let tokenId = 3;
                let tokenAdd = tokens[tokenId].address;
                let token = tokens[tokenId];
                let fee = 113;
                let srcQty = (new BN(3)).mul((new BN(10)).pow(new BN(tokenDecimals[tokenId])));
                
                let hint = await nwHelper.getHint(network, tradeLogic, reserveInstances, type, 3, tokenAdd, ethAddress, srcQty);
                
                await token.transfer(taker, srcQty);
                await token.approve(networkProxy.address, srcQty, {from: taker});   
                let rate = await networkProxy.getExpectedRateAfterFee(tokenAdd, ethAddress, srcQty, fee, hint);
                let txResult = await networkProxy.tradeWithHintAndFee(tokenAdd, srcQty, ethAddress, taker, 
                    maxDestAmt, rate, platformWallet, fee, hint, {from: taker});
                console.log(`t2e: ${txResult.receipt.gasUsed} gas used, type is: ` + str);
            });

            it("should perform a e2t trade with hint", async() => {
                let tokenId = i;
                let tokenAdd = tokens[tokenId].address;
                let token = tokens[tokenId];
                let fee = 113;
                let srcQty = (new BN(3)).mul((new BN(10)).pow(new BN(tokenDecimals[tokenId])));
                
                let hint = await nwHelper.getHint(network, tradeLogic, reserveInstances, type, 3, ethAddress, tokenAdd, srcQty);
                
                let rate = await networkProxy.getExpectedRateAfterFee(ethAddress, tokenAdd, srcQty, fee, hint);
                let txResult = await networkProxy.tradeWithHintAndFee(ethAddress, srcQty, tokenAdd, taker, 
                    maxDestAmt, rate, platformWallet, fee, hint, {from: taker, value: srcQty});
                console.log(`e2t: ${txResult.receipt.gasUsed} gas used, type is: ` + str);
            });

            it("should perform a t2t trade with hint", async() => {
                let tokenId = i;
                let srcAdd = tokens[tokenId].address;
                let destAdd = tokens[(tokenId + 1) % numTokens].address;
                let srcToken = tokens[tokenId];
                let fee = 113;
                let srcQty = (new BN(3)).mul((new BN(10)).pow(new BN(tokenDecimals[tokenId])));
                
                let hint = await nwHelper.getHint(network, tradeLogic, reserveInstances, type, 3, srcAdd, destAdd, srcQty);
                
                let rate = await networkProxy.getExpectedRateAfterFee(srcAdd, destAdd, srcQty, fee, hint);
                
                await srcToken.transfer(taker, srcQty);
                await srcToken.approve(networkProxy.address, srcQty, {from: taker});   
                let txResult = await networkProxy.tradeWithHintAndFee(srcAdd, srcQty, destAdd, taker, 
                    maxDestAmt, rate, platformWallet, fee, hint, {from: taker});
                console.log(`t2t: ${txResult.receipt.gasUsed} gas used, type is: ` + str);
            });
        }
    });

    describe("test actual rate vs min rate in different scenarios. ", async() => {
        //todo: use minRate = network.getRateWithFee and see why its very different then actual calculated rate in proxy
    });
})

function getQtyTokensDecimals(srcTokId, destTokId, qtyDecimals, qtyToken) {
    let srcToken = tokens[srcTokId];
    let srcDecimals = tokenDecimals[srcTokId];
    let destToken = tokens[destTokId];
    let destDecimals = tokens[destTokId];
    let qty = new BN(qtyToken).mul(new BN(10).pow(new BN(qtyDecimals)));

    return [qty, srcToken, srcDecimals, destToken, destDecimals];
}

function log(str) {
    console.log(str);
}
