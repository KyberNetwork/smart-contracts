const Web3 = require('web3');
const TestToken = artifacts.require("Token.sol");
const MockReserve = artifacts.require("MockReserve.sol");
const MockDao = artifacts.require("MockDAO.sol");
const KyberNetwork = artifacts.require("KyberNetwork.sol");
const MockNetwork = artifacts.require("MockNetwork.sol");
const FeeHandler = artifacts.require("FeeHandler.sol");
const TradeLogic = artifacts.require("KyberTradeLogic.sol");
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

let takerFeesBps = new BN(20);
let platformFeeBps = new BN(0);
let takerFeeAmount;
let txResult;

let admin;
let alerter;
let network;
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
let reserveInstances = [];
let reserveIds = [];
let reserveAddresses = [];
let reserve;
let isFeePaying = [];
let reserveEtherInit = new BN(10).pow(new BN(18)).mul(new BN(2));
//// reserve types
let APR_ID = '0xaa000000';
let MOCK_ID  = '0xbb000000';
let FPR_ID = '0xff000000';


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

//rates data
////////////
let buyRates = [];
let sellRates = [];

contract('KyberNetwork', function(accounts) {
    before("one time global init", async() => {
        //init accounts
        networkProxy = accounts[0];  // when using account 0 can avoid string ({from: proxy}) in trade call;
        operator = accounts[1];
        alerter = accounts[2];
        user = accounts[3];
        platformWallet = accounts[4];
        admin = accounts[5]; // we don't want admin as account 0.

        //init tokens
        for (let i = 0; i < numTokens; i++) {
            tokenDecimals[i] = new BN(15).add(new BN(i));
            token = await TestToken.new("test" + i, "tst" + i, tokenDecimals[i]);
            tokens[i] = token;
        }
    });

    beforeEach("randomly select tokens before each test", async() => {
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
    })

    describe("test with MockDAO and Mock reserves", async() => {
        before("initialise DAO, network and reserves", async() => {
            //DAO related init.
            expiryBlockNumber = new BN(await web3.eth.getBlockNumber() + 150);
            DAO = await MockDao.new(rewardInBPS, rebateInBPS, epoch, expiryBlockNumber);
            await DAO.setTakerFeeBps(takerFeesBps);

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

            //init 3 mock reserves
            await setupReserves(3,0,0,0, accounts[9]);
        });

        it("should test events declared in network contract", async() => {
            let tempNetwork = await KyberNetwork.new(admin);
            let tempTradeLogic = await TradeLogic.new(admin);
            await tempNetwork.addOperator(operator, {from: admin});
            await tempTradeLogic.setNetworkContract(tempNetwork.address, {from: admin});
            let ethSender = accounts[9];

            txResult = await tempNetwork.send(ethSrcQty, {from: ethSender});
            expectEvent(txResult, 'EtherReceival', {
                sender: ethSender,
                amount: ethSrcQty
            });

            txResult = await tempNetwork.setContracts(feeHandler.address, DAO.address, tempTradeLogic.address, {from: admin});
            expectEvent(txResult, 'ContractsUpdate', {
                newHandler: feeHandler.address,
                newDAO: DAO.address,
                newTradeLogic: tempTradeLogic.address
            });

            txResult = await tempNetwork.addReserve(reserve.address, genReserveID(MOCK_ID, reserve.address), true, user, {from: operator});
            //TODO: reserveId returned by txResult has additional zeroes appended
            txResult.logs[0].args[1] = txResult.logs[0].args['1'].substring(0,18);
            txResult.logs[0].args['reserveId'] = txResult.logs[0].args['reserveId'].substring(0,18);
            expectEvent(txResult, 'AddReserveToNetwork', {
                reserve: reserve.address,
                reserveId: genReserveID(MOCK_ID, reserve.address).toLowerCase(),
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

        it("should setup network and its params", async() => {
            //setup network
            await network.addOperator(operator, {from: admin});
            await network.addKyberProxy(networkProxy, {from: admin});
            await network.setContracts(feeHandler.address, DAO.address, tradeLogic.address, {from: admin});

            //add and list pair for reserve
            for (let i = 0; i < numReserves; i++) {
                reserve = reserveInstances[i];
                network.addReserve(reserve.address, reserveIds[i], isFeePaying[i], reserve.address, {from: operator});
                for (let j = 0; j < numTokens; j++) {
                    network.listPairForReserve(reserve.address, tokens[j].address, true, true, true, {from: operator});
                }
            }

            //set params, enable network
            await network.setParams(gasPrice, negligibleRateDiffBps, {from: admin});
            await network.setEnable(true, {from: admin});
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
    
        it("should get expected rate (with network fee) for T2E, E2T & T2T", async() => {
            expectedResult = await fetchReservesAndRatesFromNetwork(tradeLogic, srcToken.address, true, srcQty);
            bestReserveRate = getBestReserve(expectedResult.rates, []);
            bestSellRate = bestReserveRate.rateWithNetworkFee;
            actualResult = await network.getExpectedRate(srcToken.address, ethAddress, srcQty);
            Helper.assertEqual(bestSellRate, actualResult.expectedRate, "expected rate with network fee != actual rate for token -> ETH");
    
            expectedResult = await fetchReservesAndRatesFromNetwork(tradeLogic, destToken.address, false, ethSrcQty);
            bestReserveRate = getBestReserve(expectedResult.rates, []);
            bestBuyRate = bestReserveRate.rateWithNetworkFee;
            actualResult = await network.getExpectedRate(ethAddress, destToken.address, ethSrcQty);
            Helper.assertEqual(bestBuyRate, actualResult.expectedRate, "expected rate with network fee != actual rate for ETH -> token");
    
            actualResult = await network.getExpectedRate(srcToken.address, destToken.address, srcQty);
            expectedWeiAmt = Helper.calcDstQty(srcQty, srcDecimals, ethDecimals, bestSellRate);
            expectedDestAmt = Helper.calcDstQty(expectedWeiAmt, ethDecimals, destDecimals, bestBuyRate);
            expectedRate = Helper.calcRateFromQty(srcQty, expectedDestAmt, srcDecimals, destDecimals);
            Helper.assertEqual(expectedRate, actualResult.expectedRate, "expected rate with network fee != actual rate for token -> token");
        });
    
        it("should perform a token -> ETH trade and check balances change as expected", async() => {
            expectedResult = await fetchReservesAndRatesFromNetwork(tradeLogic, srcToken.address, true, srcQty);
            bestReserve = getBestReserve(expectedResult.rates, expectedResult.reserves);

            //get initial balances
            initialTokenReserveBalance = await srcToken.balanceOf(bestReserve.address);
            initialTokenUserBalance = await srcToken.balanceOf(network.address); //assume user sends to network already
            initialEtherReserveBalance = await Helper.getBalancePromise(bestReserve.address);
            initialEtherUserBalance = await Helper.getBalancePromise(user);
    
            rate = await network.getExpectedRate(srcToken.address, ethAddress, srcQty);
            expectedDestAmt = Helper.calcDstQty(srcQty, srcDecimals, ethDecimals, rate[0]);
    
            //perform trade, give ETH to user
            txResult = await network.tradeWithHint(networkProxy, srcToken.address, srcQty, ethAddress, user, 
                maxDestAmt, minConversionRate, platformWallet, emptyHint);
            console.log(`token -> ETH: ${txResult.receipt.gasUsed} gas used`);
    
            //compare balances
            await assertSameEtherBalance(bestReserve.address, initialEtherReserveBalance.sub(expectedDestAmt));
            await assertSameEtherBalance(user, initialEtherUserBalance.add(expectedDestAmt));
            await assertSameTokenBalance(network.address, srcToken, initialTokenUserBalance.sub(srcQty));
            await assertSameTokenBalance(bestReserve.address, srcToken, initialTokenReserveBalance.add(srcQty));
        });
    
        it("should perform a ETH -> token trade and check balances change as expected", async() => {
            expectedResult = await fetchReservesAndRatesFromNetwork(tradeLogic, destToken.address, false, ethSrcQty);
            bestReserve = getBestReserve(expectedResult.rates, expectedResult.reserves);
    
            //get initial balances
            initialTokenReserveBalance = await destToken.balanceOf(bestReserve.address);
            initialTokenUserBalance = await destToken.balanceOf(user);
            initialEtherReserveBalance = await Helper.getBalancePromise(bestReserve.address);
     
            rate = await network.getExpectedRateWithHintAndFee(ethAddress, destToken.address, ethSrcQty, platformFeeBps, emptyHint);
            expectedDestAmt = Helper.calcDstQty(ethSrcQty, ethDecimals, destDecimals, rate.expectedRateAfterNetworkFees);
            //reserve gets ETH minus network fee (if applicable)
            expectedAddedEthForReserve = Helper.calcSrcQty(expectedDestAmt, ethDecimals, destDecimals, rate.expectedRateNoFees);
            
            //perform trade, give dest tokens to user
            txResult = await network.tradeWithHint(networkProxy, ethAddress, ethSrcQty, destToken.address, user, 
                maxDestAmt, minConversionRate, platformWallet, emptyHint, {value: ethSrcQty});
                console.log(`ETH -> token: ${txResult.receipt.gasUsed} gas used`);
    
            //compare balances
            await assertSameEtherBalance(bestReserve.address, initialEtherReserveBalance.add(expectedAddedEthForReserve));
            await assertSameTokenBalance(bestReserve.address, destToken, initialTokenReserveBalance.sub(expectedDestAmt));
            await assertSameTokenBalance(user, destToken, initialTokenUserBalance.add(expectedDestAmt));
        });
    
        //srcToken: (user -> sell reserve) => user bal goes down, sell reserve bal goes up
        //ETH: (sell -> buy reserve) => sell reserve bal goes down, buy reserve bal goes up
        //destToken: (buy reserve -> user) => bal goes down, user bal goes up
        it("should perform a token -> token trade and check balances change as expected", async() => {
            expectedResult = await fetchReservesAndRatesFromNetwork(tradeLogic, srcToken.address, true, srcQty);
            bestSellReserve = getBestReserve(expectedResult.rates, expectedResult.reserves);
            expectedResult = await fetchReservesAndRatesFromNetwork(tradeLogic, destToken.address, false, ethSrcQty);
            bestBuyReserve = getBestReserve(expectedResult.rates, expectedResult.reserves);
    
            //initial balances
            initialSrcTokenUserBalance = await srcToken.balanceOf(network.address); //assume user gave funds to proxy already
            initialDestTokenUserBalance = await destToken.balanceOf(user);
            initialEtherSellReserveBalance = await Helper.getBalancePromise(bestSellReserve.address);
            initialSrcTokenSellReserveBalance = await srcToken.balanceOf(bestSellReserve.address);
            initialEtherBuyReserveBalance = await Helper.getBalancePromise(bestBuyReserve.address);
            initialDestTokenBuyReserveBalance = await destToken.balanceOf(bestBuyReserve.address);
    
            overallRate = await network.getExpectedRateWithHintAndFee(srcToken.address, destToken.address, srcQty, platformFeeBps, emptyHint);
            expectedDestTokenDeltaAmount = Helper.calcDstQty(srcQty, srcDecimals, destDecimals, overallRate.expectedRateAfterNetworkFees);
            expectedSrcTokenDeltaAmount = srcQty;
            // //perform trade, give dest tokens to user
            txResult = await network.tradeWithHint(networkProxy, srcToken.address, srcQty, destToken.address, user, 
                maxDestAmt, minConversionRate, platformWallet, emptyHint);
            console.log(`token -> token: ${txResult.receipt.gasUsed} gas used`);
            
            //compare balances
            await assertSameTokenBalance(network.address, srcToken, initialSrcTokenUserBalance.sub(expectedSrcTokenDeltaAmount));
            await assertSameTokenBalance(bestSellReserve.address, srcToken, initialSrcTokenSellReserveBalance.add(expectedSrcTokenDeltaAmount));
            await assertSameTokenBalance(bestBuyReserve.address, destToken, initialDestTokenBuyReserveBalance.sub(expectedDestTokenDeltaAmount));
            await assertSameTokenBalance(user, destToken, initialDestTokenUserBalance.add(expectedDestTokenDeltaAmount));
            
            //check sell reserve eth bal down
            //check buy reserve eth bal up
        });
    
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
            Helper.assertEqual(networkData[3], takerFeesBps);
            
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

async function setupReserves(mockReserves, fprReserves, enhancedFprReserves, aprReserves, ethSender) {
    numReserves = mockReserves + fprReserves + enhancedFprReserves + aprReserves;
    for (i=0; i < mockReserves; i++) {
        reserve = await MockReserve.new();
        reserveInstances[i] = reserve;
        reserveIds[i] = genReserveID(MOCK_ID, reserve.address);
        reserveAddresses[i] = reserve.address;

        tokensPerEther = precisionUnits.mul(new BN((i + 1) * 1000));
        ethersPerToken = precisionUnits.div(new BN((i + 1) * 1000));

        //send ETH
        await Helper.sendEtherWithPromise(ethSender, reserve.address, reserveEtherInit);
        await assertSameEtherBalance(reserve.address, reserveEtherInit);

        for (let j = 0; j < numTokens; j++) {
            token = tokens[j];
            //set rates and send tokens based on eth -> token rate
            await reserve.setRate(token.address, tokensPerEther, ethersPerToken);
            let initialTokenAmount = Helper.calcDstQty(reserveEtherInit, ethDecimals, tokenDecimals[j], tokensPerEther);
            await token.transfer(reserve.address, initialTokenAmount);
            await assertSameTokenBalance(reserve.address, token, initialTokenAmount);
        }
    }

    //TODO: implement logic for other reserves
    for (i=0; i < numReserves; i++) {
        isFeePaying[i] = (i >= (numReserves / 2));
    }
}

function genReserveID(reserveID, reserveAddress) {
    return reserveID + reserveAddress.substring(2,10);
}

async function fetchReservesAndRatesFromNetwork(tradeLogicInstance, tokenAddress, isTokenToEth, srcQty) {
    reservesForToken = [];
    rates = [];
    reservesArray = [];

    if (isTokenToEth) {
        i = 0;
        while (true) {
            try {
                reserve = await tradeLogicInstance.reservesPerTokenSrc(tokenAddress,i);
                reservesArray.push(reserve);
                i ++;
            } catch(e) {
                break;
            }
        }
        srcAddress = tokenAddress;
        destAddress = ethAddress;
    } else {
        i = 0;
        while (true) {
            try {
                reserve = await tradeLogicInstance.reservesPerTokenDest(tokenAddress,i);
                reservesArray.push(reserve);
                i ++;
            } catch(e) {
                break;
            }
        }
        srcAddress = ethAddress;
        destAddress = tokenAddress;
    }

    for (i=0; i<reservesArray.length; i++) {
        reserveAddress = reservesArray[i];
        reserve = reserveInstances.find(reserve => {return reserve.address === reserveAddress});
        rate = await reserve.getConversionRate(srcAddress, destAddress, srcQty, 0);
        reservesForToken[i] = reserve;
        rates[i] = rate;
    }
    return {'reserves': reservesForToken, 'rates': rates};
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

function getBestReserve(rateArr, reserveArr) {
    bestReserve = {
        address: '',
        rateNoFee: new BN(0), 
        rateWithNetworkFee: new BN(0)
    }

    for (let i=0; i < rateArr.length; i++) {
        let rate = rateArr[i];
        let rateForComparison = rate;
        if (isFeePaying[i]) {
            rateForComparison = rate.mul(BPS.sub(takerFeesBps)).div(BPS);
        }

        if (rateForComparison.gt(bestReserve.rateNoFee)) {
            bestReserve.rateNoFee = rate;
            bestReserve.rateWithNetworkFee = rateForComparison;
            if (reserveArr.length) {
                bestReserve.address = reserveArr[i].address;
            }
        }
    }
    return bestReserve;
}

function log(str) {
    console.log(str);
}
