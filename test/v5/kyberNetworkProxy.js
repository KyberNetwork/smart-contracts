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
    MASK_OUT_HINTTYPE, SPLIT_HINTTYPE}  = require('./networkHelper.js');

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
let reserveInstances = [];

//tokens data
////////////
let numTokens = 5;
let tokens = [];
let tokenDecimals = [];
let srcToken;
let ethSrcQty = precisionUnits;

//rates data
////////////
let buyRates = [];
let sellRates = [];

let tempNetwork;

contract('KyberNetworkProxy', function(accounts) {
    before("one time global init", async() => {
        //init accounts
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
        let result = await nwHelper.setupReserves(network, tokens, 1,4,0,0, accounts, admin, operator);
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

    describe("test get rates", async() => {
        
        it("check get expected rate (with network fee) for T2E - few tokens, different decimals", async() => {
            for (let i = 0; i < numTokens; i++) {
                let srcToken = tokens[i]; 
                let srcQty = (new BN(7)).mul((new BN(10)).pow(tokenDecimals[i]))
                reserveCandidates = await nwHelper.fetchReservesRatesFromNetwork(network, reserveInstances, srcToken.address, srcQty, true);
                bestReserve = await nwHelper.getBestReserveAndRate(reserveCandidates, srcToken.address, ethAddress, srcQty, takerFeeBps);
                
                actualResult = await networkProxy.getExpectedRateAfterFee(srcToken.address, ethAddress, srcQty, 0, emptyHint);
                Helper.assertEqual(bestReserve.rateWithNetworkFee, actualResult, 
                    "token %d expected rate with network fee != actual rate for token -> ETH", i);
            }
        });

        it("check get expected rate (with network fee) for E2T - few tokens, different decimals", async() => {
            for (let i = 0; i < numTokens; i++) {
                let destToken = tokens[i];
                let srcQty = (new BN(7)).mul((new BN(10)).pow(ethDecimals))
                reserveCandidates = await nwHelper.fetchReservesRatesFromNetwork(network, reserveInstances, destToken.address, srcQty, false);
                bestReserve = await nwHelper.getBestReserveAndRate(reserveCandidates, destToken.address, ethAddress, srcQty, takerFeeBps);
                 
                actualResult = await networkProxy.getExpectedRateAfterFee(ethAddress, destToken.address, ethSrcQty, 0, emptyHint);
                Helper.assertEqual(bestReserve.rateWithNetworkFee, actualResult, 
                    "token: %d expected rate with network fee != actual rate for ETH -> token", i);    
            }
        });

        it("check get expected rate (with network fee) for T2T - few decimals", async() => {
            for (let i = 0; i < numTokens; i++) {
                let srcToken = tokens[i]; 
                let srcDecimals = tokenDecimals[i];
                let destId = (i + 1) % numTokens;
                let destToken = tokens[destId];
                let destDecimals = tokenDecimals[destId];
                let srcQty = (new BN(7)).mul((new BN(10)).pow(tokenDecimals[i]))
                // const [srcQty, srcToken, srcDecimals, destToken, destDecimals] = 
                    // getQtyTokensDecimals(i, destId, tokenDecimals[i], (i + 1) * 17);
                reserveCandidates = await nwHelper.fetchReservesRatesFromNetwork(network, reserveInstances, srcToken.address, srcQty, true);
                bestReserve = await nwHelper.getBestReserveAndRate(reserveCandidates, srcToken.address, ethAddress, srcQty, takerFeeBps);
                bestSellRateNoFee = bestReserve.rateNoFee;
                bestSellReserveFeePaying = bestReserve.isFeePaying;
                reserveCandidates = await nwHelper.fetchReservesRatesFromNetwork(network, reserveInstances, destToken.address, ethSrcQty, false);
                bestReserve = await nwHelper.getBestReserveAndRate(reserveCandidates, ethAddress, destToken.address, ethSrcQty, takerFeeBps);
                bestBuyRateNoFee = bestReserve.rateNoFee;
                bestBuyReserveFeePaying = bestReserve.isFeePaying;
            
                actualResult = await networkProxy.getExpectedRateAfterFee(srcToken.address, destToken.address, srcQty, 0, emptyHint);
                expectedWeiAmt = Helper.calcDstQty(srcQty, srcDecimals, ethDecimals, bestSellRateNoFee);
                expectedWeiAmt = nwHelper.minusNetworkFees(expectedWeiAmt, bestSellReserveFeePaying, bestBuyReserveFeePaying, takerFeeBps);
                expectedDestAmt = Helper.calcDstQty(expectedWeiAmt, ethDecimals, destDecimals, bestBuyRateNoFee);
                let expectedRate = Helper.calcRateFromQty(srcQty, expectedDestAmt, srcDecimals, destDecimals);
                Helper.assertEqual(expectedRate, actualResult, "src token: " + i + " destToken: " + destId +" expected rate with network fee != actual rate for token -> token");
            }
        });
    });
    describe("test trades - report gas", async() => {
        before("set token and quantity", async() => {
            
        });
        
        it("should perform a token -> ETH trade and check balances change as expected, empty hint", async() => {
            let srcToken = tokens[4]; 
            let srcDecimals = tokenDecimals[4];
            let srcQty = (new BN(10)).mul((new BN(10)).pow(srcDecimals));           
            // (srcQty, srcToken, srcDecimals, destTokne, destDecimals) = getQtyTokensDecimals(1, 2, tokenDecimals[1], 9);
            expectedResult = await nwHelper.fetchReservesAndRatesFromNetwork(tradeLogic, srcToken.address, true, srcQty);
            bestReserve = getBestReserve(expectedResult.rates, expectedResult.reserves);

            //get initial balances
            initialTokenReserveBalance = await srcToken.balanceOf(bestReserve.address);
            initialTokenUserBalance = await srcToken.balanceOf(network.address); //assume user sends to network already
            initialEtherReserveBalance = await Helper.getBalancePromise(bestReserve.address);
            initialEtherUserBalance = await Helper.getBalancePromise(user);
    
            rate = await networkProxy.getExpectedRateAfterFee(srcToken.address, ethAddress, srcQty, 0, emptyHint);
            expectedDestAmt = Helper.calcDstQty(srcQty, srcDecimals, ethDecimals, rate);
    
            //perform trade, give ETH to user
            await srcToken.transfer(user, srcQty); 
            await srcToken.approve(networkProxy.address, srcQty, {from: user})
            txResult = await networkProxy.tradeWithHintAndFee(srcToken.address, srcQty, ethAddress, user, 
                maxDestAmt, minConversionRate, platformWallet, 0, emptyHint, {from: user});
            console.log(`token -> ETH: ${txResult.receipt.gasUsed} gas used`);
    
            //compare balances
            await assertSameEtherBalance(bestReserve.address, initialEtherReserveBalance.sub(expectedDestAmt));
            await assertSameEtherBalance(user, initialEtherUserBalance.add(expectedDestAmt));
            await assertSameTokenBalance(network.address, srcToken, initialTokenUserBalance.sub(srcQty));
            await assertSameTokenBalance(bestReserve.address, srcToken, initialTokenReserveBalance.add(srcQty));
        });
    
        it("should perform a ETH -> token trade and check balances change as expected, empty hint", async() => {
            let destToken = tokens[3];
            let ethSrcQty = (new BN(1)).mul((new BN(10)).pow(tokenDecimals[3]));
            let destDecimals = tokenDecimals[3]

            expectedResult = await fetchReservesAndRatesFromNetwork(tradeLogic, destToken.address, false, ethSrcQty);
            bestReserve = getBestReserve(expectedResult.rates, expectedResult.reserves);
    
            //get initial balances
            initialTokenReserveBalance = await destToken.balanceOf(bestReserve.address);
            initialTokenUserBalance = await destToken.balanceOf(user);
            initialEtherReserveBalance = await Helper.getBalancePromise(bestReserve.address);
     
            rate = await networkProxy.getExpectedRateAfterFee(ethAddress, destToken.address, ethSrcQty, platformFeeBps, emptyHint);
            expectedDestAmt = Helper.calcDstQty(ethSrcQty, ethDecimals, destDecimals, rate);
            //reserve gets ETH minus network fee (if applicable)
            expectedAddedEthForReserve = Helper.calcSrcQty(expectedDestAmt, ethDecimals, destDecimals, rate);
            
            //perform trade, give dest tokens to user
            txResult = await networkProxy.tradeWithHintAndFee(ethAddress, ethSrcQty, destToken.address, user, 
                maxDestAmt, minConversionRate, platformWallet, 0, emptyHint, {value: ethSrcQty});
                console.log(`ETH -> token: ${txResult.receipt.gasUsed} gas used`);
    
            //compare balances
            await assertSameEtherBalance(bestReserve.address, initialEtherReserveBalance.add(expectedAddedEthForReserve));
            await assertSameTokenBalance(bestReserve.address, destToken, initialTokenReserveBalance.sub(expectedDestAmt));
            await assertSameTokenBalance(user, destToken, initialTokenUserBalance.add(expectedDestAmt));
        });
    
        //srcToken: (user -> sell reserve) => user bal goes down, sell reserve bal goes up
        //ETH: (sell -> buy reserve) => sell reserve bal goes down, buy reserve bal goes up
        //destToken: (buy reserve -> user) => bal goes down, user bal goes up
        it("should perform a token -> token trade and check balances change as expected, empty hint", async() => {
            
            expectedResult = await fetchReservesAndRatesFromNetwork(tradeLogic, srcToken.address, true, srcQty);
            bestSellReserve = getBestReserve(expectedResult.rates, expectedResult.reserves);
            expectedResult = await fetchReservesAndRatesFromNetwork(tradeLogic, destToken.address, false, ethSrcQty);
            bestBuyReserve = getBestReserve(expectedResult.rates, expectedResult.reserves);
       
            //give tokens to user
            await srcToken.transfer(user, srcQty);

            //initial balances
            initialSrcTokenUserBalance = await srcToken.balanceOf(user); //assume user gave funds to proxy already
            initialDestTokenUserBalance = await destToken.balanceOf(user);
            initialEtherSellReserveBalance = await Helper.getBalancePromise(bestSellReserve.address);
            initialSrcTokenSellReserveBalance = await srcToken.balanceOf(bestSellReserve.address);
            initialEtherBuyReserveBalance = await Helper.getBalancePromise(bestBuyReserve.address);
            initialDestTokenBuyReserveBalance = await destToken.balanceOf(bestBuyReserve.address);
    
            overallRate = await networkProxy.getExpectedRateAfterFee(srcToken.address, destToken.address, srcQty, 0, emptyHint);
            expectedDestTokenDeltaAmount = Helper.calcDstQty(srcQty, srcDecimals, destDecimals, overallRate);
            expectedSrcTokenDeltaAmount = srcQty;
            // perform trade, src token from user. dest token to user
            
            await srcToken.approve(networkProxy.address, srcQty, {from: user})
            txResult = await networkProxy.tradeWithHintAndFee(srcToken.address, srcQty, destToken.address, user, 
                maxDestAmt, minConversionRate, platformWallet, 0, emptyHint, {from: user});
            console.log(`token -> token: ${txResult.receipt.gasUsed} gas used`);
            
            //compare balances
            await assertSameTokenBalance(user, srcToken, initialSrcTokenUserBalance.sub(expectedSrcTokenDeltaAmount));
            await assertSameTokenBalance(bestSellReserve.address, srcToken, initialSrcTokenSellReserveBalance.add(expectedSrcTokenDeltaAmount));
            await assertSameTokenBalance(bestBuyReserve.address, destToken, initialDestTokenBuyReserveBalance.sub(expectedDestTokenDeltaAmount));
            await assertSameTokenBalance(user, destToken, initialDestTokenUserBalance.add(expectedDestTokenDeltaAmount));
            
            //check sell reserve eth bal down
            //check buy reserve eth bal up
        });
    
        it("should perform a simple T2E trade with split hint", async() => {
            reserveCandidates = await nwHelper.fetchReservesRatesFromNetwork(network, reserveInstances, srcToken.address, srcQty, true);
            hintedReserves = nwHelper.applyHintToReserves(SPLIT_HINTTYPE, reserveCandidates);
            hint = await tradeLogic.buildTokenToEthHint(
                hintedReserves.tradeType, hintedReserves.reservesForHint, hintedReserves.splits
            );
            await srcToken.transfer(network.address, srcQty);
            txResult = await network.tradeWithHint(networkProxy, srcToken.address, srcQty, ethAddress, user, 
                maxDestAmt, minConversionRate, platformWallet, hint);
            console.log(`token -> ETH (split hint): ${txResult.receipt.gasUsed} gas used`);
        });

        it("should perform a simple E2T trade with split hint", async() => {
            reserveCandidates = await nwHelper.fetchReservesRatesFromNetwork(network, reserveInstances, destToken.address, ethSrcQty, false);
            hintedReserves = nwHelper.applyHintToReserves(SPLIT_HINTTYPE, reserveCandidates);
            hint = await tradeLogic.buildEthToTokenHint(
                hintedReserves.tradeType, hintedReserves.reservesForHint, hintedReserves.splits
            );
            txResult = await network.tradeWithHint(networkProxy, ethAddress, ethSrcQty, destToken.address, user, 
                maxDestAmt, minConversionRate, platformWallet, hint, {value: ethSrcQty});
            console.log(`ETH -> token (split hint): ${txResult.receipt.gasUsed} gas used`);
        });

        it("should perform a simple T2T trade with split hint", async() => {
            reserveCandidates = await nwHelper.fetchReservesRatesFromNetwork(network, reserveInstances, srcToken.address, srcQty, true);
            hintedReservesT2E = nwHelper.applyHintToReserves(SPLIT_HINTTYPE, reserveCandidates);
            // todo: find estimated quantity
            reserveCandidates = await nwHelper.fetchReservesRatesFromNetwork(network, reserveInstances, destToken.address, ethSrcQty, false);
            hintedReservesE2T = nwHelper.applyHintToReserves(SPLIT_HINTTYPE, reserveCandidates);
            hint = await tradeLogic.buildTokenToTokenHint(
                hintedReservesT2E.tradeType, hintedReservesT2E.reservesForHint, hintedReservesT2E.splits,
                hintedReservesE2T.tradeType, hintedReservesE2T.reservesForHint, hintedReservesE2T.splits
            );
            await srcToken.transfer(network.address, srcQty);
            txResult = await network.tradeWithHint(networkProxy, srcToken.address, srcQty, destToken.address, user, 
                maxDestAmt, minConversionRate, platformWallet, emptyHint);
            console.log(`token -> token (split hint): ${txResult.receipt.gasUsed} gas used`);
        });
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
