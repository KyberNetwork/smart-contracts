const TestToken = artifacts.require("Token.sol");
const MockReserve = artifacts.require("MockReserve.sol");
const MockDao = artifacts.require("MockDAO.sol");
const TradeLogic = artifacts.require("KyberTradeLogic.sol");

const Helper = require("../v4/helper.js");
const nwHelper = require("./networkHelper.js");

const BN = web3.utils.BN;
const { expectEvent, expectRevert } = require('@openzeppelin/test-helpers');
const {BPS, precisionUnits, ethDecimals, ethAddress, zeroAddress, emptyHint} = require("../v4/helper.js");
const {APR_ID, BRIDGE_ID, MOCK_ID, FPR_ID, type_apr, type_fpr, type_MOCK, 
    MASK_IN_HINTTYPE, MASK_OUT_HINTTYPE, SPLIT_HINTTYPE}  = require('./networkHelper.js');

//global variables
//////////////////
const gasPrice = (new BN(10).pow(new BN(9)).mul(new BN(50)));
const negligibleRateDiffBps = new BN(5); //0.05% 
const maxDestAmt = new BN(2).pow(new BN(255));
const minConversionRate = new BN(0);

let takerFeeBps = new BN(20);
let platformFeeBps = new BN(0);
let takerFeeAmount;
let txResult;

let admin;
let operator;
let network;
let tradeLogic;
let user;
let platformWallet;

//reserve data
//////////////
let reserveInstances = {};
let reserve;
let numReserves;

let pricingFpr = [];
let reserveFpr = [];
let gNumFprReserves;

//tokens data
////////////
let srcToken;
let destToken;
let srcDecimals;
let destDecimals;
let srcQty;
let ethSrcQty = precisionUnits;
let zeroBN = new BN(0);

contract('KyberTradeLogic', function(accounts) {
    before("one time global init", async() => {
        //init accounts
        user = accounts[0];
        admin = accounts[1];
        operator = accounts[2];
        network = accounts[3];
    });

    describe("test onlyAdmin and onlyNetwork permissions", async() => {
        before("deploy tradeLogic instance, 1 mock reserve and 1 mock token", async() => {
            tradeLogic = await TradeLogic.new(admin);
            token = await TestToken.new("test", "tst", 18);

            //init 1 mock reserve
            let result = await nwHelper.setupReserves(network, [], 1,0,0,0, accounts, admin, operator);
            reserveInstances = result.reserveInstances;
            numReserves = result.numAddedReserves * 1;
            for (const value of Object.values(reserveInstances)) {
                reserve = value;
            }
        });

        it("should not have unauthorized personnel set network contract", async() => {
            await expectRevert(
                tradeLogic.setNetworkContract(network, {from: user}),
                "ONLY_ADMIN"
            );

            await expectRevert(
                tradeLogic.setNetworkContract(network, {from: operator}),
                "ONLY_ADMIN"
            );
        });

        it("should have admin set network contract", async() => {
            await tradeLogic.setNetworkContract(network, {from: admin});
            result = await tradeLogic.networkContract();
            Helper.assertEqual(network, result, "network not set by admin");
        });

        it("should not have unauthorized personnel set negligble rate diff bps", async() => {
            await expectRevert(
                tradeLogic.setNegligbleRateDiffBps(negligibleRateDiffBps, {from: user}),
                "ONLY_NETWORK"
            );

            await expectRevert(
                tradeLogic.setNegligbleRateDiffBps(negligibleRateDiffBps, {from: operator}),
                "ONLY_NETWORK"
            );

            await expectRevert(
                tradeLogic.setNegligbleRateDiffBps(negligibleRateDiffBps, {from: admin}),
                "ONLY_NETWORK"
            );
        });

        it("should have network set negligble rate diff bps", async() => {
            await tradeLogic.setNegligbleRateDiffBps(negligibleRateDiffBps, {from: network});
            result = await tradeLogic.negligibleRateDiffBps();
            Helper.assertEqual(negligibleRateDiffBps, result, "negligbleRateDiffInBps not set by network");
        });

        it("should not have unauthorized personnel add reserve", async() => {
            await expectRevert(
                tradeLogic.addReserve(reserve.address, reserve.reserveId, reserve.isFeePaying, {from: user}),
                "ONLY_NETWORK"
            );

            await expectRevert(
                tradeLogic.addReserve(reserve.address, reserve.reserveId, reserve.isFeePaying, {from: operator}),
                "ONLY_NETWORK"
            );

            await expectRevert(
                tradeLogic.addReserve(reserve.address, reserve.reserveId, reserve.isFeePaying, {from: admin}),
                "ONLY_NETWORK"
            );
        });

        it("should have network add reserve", async() => {
            await tradeLogic.addReserve(reserve.address, reserve.reserveId, reserve.isFeePaying, {from: network});
            reserveId = await tradeLogic.reserveAddressToId(reserve.address);
            reserveAddress = await tradeLogic.reserveIdToAddresses(reserve.reserveId, 0);
            Helper.assertEqual(reserve.reserveId, reserveId, "reserve not added by network");
            Helper.assertEqual(reserve.address, reserveAddress, "reserve not added by network");
        });

        it("should not have unauthorized personnel list token pair for reserve", async() => {
            //TODO
        });

        it("should have network list pair for reserve", async() => {
            //TODO
        });

        it("should not have unauthorized personnel remove reserve", async() => {
            //TODO
        });

        it("should have network remove reserve", async() => {
            //TODO
        });
    });

    describe("test contract event", async() => {
        before("deploy and setup tradeLogic instance", async() => {
            tradeLogic = await TradeLogic.new(admin);
        });

        it("shoud test set network event", async() => {
            txResult = await tradeLogic.setNetworkContract(network, {from: admin});
            expectEvent(txResult, "NetworkContractUpdate", {
                newNetwork: network
            });
        });
    });

    describe("test setting contracts and params", async() => {
        //TODO
    });

    describe("test adding, removing and listing pairs for reserves", async() => {
        //TODO
    });

    describe("test getRatesForToken", async() => {
        before("setup tradeLogic instance and 2 tokens", async() => {
            tradeLogic = await TradeLogic.new(admin);
            tradeLogic.setNetworkContract(network, {from: admin});

            //init 2 tokens
            srcDecimals = new BN(8);
            destDecimals = new BN(12);
            srcToken = await TestToken.new("srcToken", "SRC", srcDecimals);
            destToken = await TestToken.new("destToken", "DEST", destDecimals);
        });
        describe("3 mock reserves (all fee paying)", async() => {
            before("setup reserves", async() => {
                //init 3 mock reserves
                let result = await nwHelper.setupReserves(network, [srcToken, destToken], 3,0,0,0, accounts, admin, operator);
                reserveInstances = result.reserveInstances;
                numReserves = result.numAddedReserves * 1;

                //add reserves, list token pairs
                for (reserve of Object.values(reserveInstances)) {
                    await tradeLogic.addReserve(reserve.address, reserve.reserveId, reserve.isFeePaying, {from: network});
                    await tradeLogic.listPairForReserve(reserve.address, srcToken.address, true, true, true, {from: network});
                    await tradeLogic.listPairForReserve(reserve.address, destToken.address, true, true, true, {from: network});
                };
            });

            after("unlist and remove reserves", async() => {
                for (reserve of Object.values(reserveInstances)) {
                    await tradeLogic.listPairForReserve(reserve.address, srcToken.address, true, true, false, {from: network});
                    await tradeLogic.listPairForReserve(reserve.address, destToken.address, true, true, false, {from: network});
                    await tradeLogic.removeReserve(reserve.address, {from: network});
                };
            });

            beforeEach("reset taker fee bps to 20, select random token", async() => {
                takerFeeBps = new BN(20);
                token = (Math.random() > 0.5) ? srcToken : destToken;
                token = srcToken;
                tokenDecimals = await token.decimals();
                // 1000 tokens
                tokenQty = new BN(1000).mul(new BN(10).pow(tokenDecimals));
            });

            it("should get rates for token (no taker fee)", async() => {
                takerFeeBps = new BN(0);
                actualResult = await tradeLogic.getRatesForToken(token.address, ethSrcQty, tokenQty, takerFeeBps);
                for (var i=0; i < actualResult.buyReserves.length; i++) {
                    reserveAddress = actualResult.buyReserves[i];
                    reserve = reserveInstances[reserveAddress];
                    Helper.assertEqual(reserve.address, reserveAddress, "reserve not found");
                    expectedReserveRate = await reserve.instance.getConversionRate(ethAddress, token.address, ethSrcQty, 0);
                    Helper.assertEqual(expectedReserveRate, actualResult.buyRates[i], "rate not equal");
                }
    
                for (var i=0; i < actualResult.sellReserves.length; i++) {
                    reserveAddress = actualResult.sellReserves[i];
                    reserve = reserveInstances[reserveAddress];
                    Helper.assertEqual(reserve.address, reserveAddress, "reserve not found");
                    expectedReserveRate = await reserve.instance.getConversionRate(token.address, ethAddress, tokenQty, 0);
                    Helper.assertEqual(expectedReserveRate, actualResult.sellRates[i], "rate not equal");
                }
            });
    
            it("should get rates for token (with taker fee)", async() => {
                actualResult = await tradeLogic.getRatesForToken(token.address, ethSrcQty, tokenQty, takerFeeBps);
                for (var i=0; i < actualResult.buyReserves.length; i++) {
                    reserveAddress = actualResult.buyReserves[i];
                    reserve = reserveInstances[reserveAddress];
                    Helper.assertEqual(reserve.address, reserveAddress, "reserve not found");
    
                    queryQty = nwHelper.minusNetworkFees(ethSrcQty, reserve.isFeePaying, false, takerFeeBps);
                    expectedReserveRate = await reserve.instance.getConversionRate(ethAddress, token.address, queryQty, 0);
                    expectedDestAmt = Helper.calcDstQty(queryQty, ethDecimals, tokenDecimals, expectedReserveRate);
                    expectedRate = Helper.calcRateFromQty(ethSrcQty, expectedDestAmt, ethDecimals, tokenDecimals);
                    Helper.assertEqual(expectedRate, actualResult.buyRates[i], "rate not equal");
                }
    
                for (var i=0; i < actualResult.sellReserves.length; i++) {
                    reserveAddress = actualResult.sellReserves[i];
                    reserve = reserveInstances[reserveAddress];
                    Helper.assertEqual(reserve.address, reserveAddress, "reserve not found");
    
                    expectedReserveRate = await reserve.instance.getConversionRate(token.address, ethAddress, tokenQty, 0);
                    expectedDestAmt = Helper.calcDstQty(tokenQty, tokenDecimals, ethDecimals, expectedReserveRate);
                    expectedDestAmt = nwHelper.minusNetworkFees(expectedDestAmt, false, reserve.isFeePaying, takerFeeBps);
                    expectedRate = Helper.calcRateFromQty(tokenQty, expectedDestAmt, tokenDecimals, ethDecimals);
                    Helper.assertEqual(expectedRate, actualResult.sellRates[i], "rate not equal");
                }
            });
        });

        describe("3 mock reserves (all feeless)", async() => {
            before("setup reserves", async() => {
                //init 3 mock reserves
                let result = await nwHelper.setupReserves(network, [srcToken, destToken], 3,0,0,0, accounts, admin, operator);
                reserveInstances = result.reserveInstances;
                numReserves = result.numAddedReserves * 1;

                //set fee paying to false
                for ([key, reserve] of Object.entries(reserveInstances)) {
                    reserve.isFeePaying = false;
                }

                //add reserves, list token pairs
                for (reserve of Object.values(reserveInstances)) {
                    await tradeLogic.addReserve(reserve.address, reserve.reserveId, reserve.isFeePaying, {from: network});
                    await tradeLogic.listPairForReserve(reserve.address, srcToken.address, true, true, true, {from: network});
                    await tradeLogic.listPairForReserve(reserve.address, destToken.address, true, true, true, {from: network});
                };
            });

            after("unlist and remove reserves", async() => {
                for (reserve of Object.values(reserveInstances)) {
                    await tradeLogic.listPairForReserve(reserve.address, srcToken.address, true, true, false, {from: network});
                    await tradeLogic.listPairForReserve(reserve.address, destToken.address, true, true, false, {from: network});
                    await tradeLogic.removeReserve(reserve.address, {from: network});
                };
            });

            beforeEach("reset taker fee bps to 20, select random token", async() => {
                takerFeeBps = new BN(20);
                token = (Math.random() > 0.5) ? srcToken : destToken;
                token = srcToken;
                tokenDecimals = await token.decimals();
                // 1000 tokens
                tokenQty = new BN(1000).mul(new BN(10).pow(tokenDecimals));
            });

            it("should get rates for token (no taker fee)", async() => {
                takerFeeBps = new BN(0);
                actualResult = await tradeLogic.getRatesForToken(token.address, ethSrcQty, tokenQty, takerFeeBps);
                for (var i=0; i < actualResult.buyReserves.length; i++) {
                    reserveAddress = actualResult.buyReserves[i];
                    reserve = reserveInstances[reserveAddress];
                    Helper.assertEqual(reserve.address, reserveAddress, "reserve not found");
                    expectedReserveRate = await reserve.instance.getConversionRate(ethAddress, token.address, ethSrcQty, 0);
                    Helper.assertEqual(expectedReserveRate, actualResult.buyRates[i], "rate not equal");
                }
    
                for (var i=0; i < actualResult.sellReserves.length; i++) {
                    reserveAddress = actualResult.sellReserves[i];
                    reserve = reserveInstances[reserveAddress];
                    Helper.assertEqual(reserve.address, reserveAddress, "reserve not found");
                    expectedReserveRate = await reserve.instance.getConversionRate(token.address, ethAddress, tokenQty, 0);
                    Helper.assertEqual(expectedReserveRate, actualResult.sellRates[i], "rate not equal");
                }
            });
    
            it("should get rates for token (with taker fee)", async() => {
                actualResult = await tradeLogic.getRatesForToken(token.address, ethSrcQty, tokenQty, takerFeeBps);
                for (var i=0; i < actualResult.buyReserves.length; i++) {
                    reserveAddress = actualResult.buyReserves[i];
                    reserve = reserveInstances[reserveAddress];
                    Helper.assertEqual(reserve.address, reserveAddress, "reserve not found");
    
                    queryQty = nwHelper.minusNetworkFees(ethSrcQty, reserve.isFeePaying, false, takerFeeBps);
                    expectedReserveRate = await reserve.instance.getConversionRate(ethAddress, token.address, queryQty, 0);
                    expectedDestAmt = Helper.calcDstQty(queryQty, ethDecimals, tokenDecimals, expectedReserveRate);
                    expectedRate = Helper.calcRateFromQty(ethSrcQty, expectedDestAmt, ethDecimals, tokenDecimals);
                    Helper.assertEqual(expectedRate, actualResult.buyRates[i], "rate not equal");
                }
    
                for (var i=0; i < actualResult.sellReserves.length; i++) {
                    reserveAddress = actualResult.sellReserves[i];
                    reserve = reserveInstances[reserveAddress];
                    Helper.assertEqual(reserve.address, reserveAddress, "reserve not found");
    
                    expectedReserveRate = await reserve.instance.getConversionRate(token.address, ethAddress, tokenQty, 0);
                    expectedDestAmt = Helper.calcDstQty(tokenQty, tokenDecimals, ethDecimals, expectedReserveRate);
                    expectedDestAmt = nwHelper.minusNetworkFees(expectedDestAmt, false, reserve.isFeePaying, takerFeeBps);
                    expectedRate = Helper.calcRateFromQty(tokenQty, expectedDestAmt, tokenDecimals, ethDecimals);
                    Helper.assertEqual(expectedRate, actualResult.sellRates[i], "rate not equal");
                }
            });
        });

        describe("3 mock reserves (all zero rates)", async() => {
            before("setup reserves", async() => {
                //init 3 mock reserves
                let result = await nwHelper.setupReserves(network, [srcToken, destToken], 3,0,0,0, accounts, admin, operator);
                reserveInstances = result.reserveInstances;
                numReserves = result.numAddedReserves * 1;

                //set zero rates
                for ([key, reserve] of Object.entries(reserveInstances)) {
                    await reserve.instance.setRate(srcToken.address, zeroBN, zeroBN);
                    await reserve.instance.setRate(destToken.address, zeroBN, zeroBN);
                }

                //add reserves, list token pairs
                for (reserve of Object.values(reserveInstances)) {
                    await tradeLogic.addReserve(reserve.address, reserve.reserveId, reserve.isFeePaying, {from: network});
                    await tradeLogic.listPairForReserve(reserve.address, srcToken.address, true, true, true, {from: network});
                    await tradeLogic.listPairForReserve(reserve.address, destToken.address, true, true, true, {from: network});
                };
            });

            after("unlist and remove reserves", async() => {
                for (reserve of Object.values(reserveInstances)) {
                    await tradeLogic.listPairForReserve(reserve.address, srcToken.address, true, true, false, {from: network});
                    await tradeLogic.listPairForReserve(reserve.address, destToken.address, true, true, false, {from: network});
                    await tradeLogic.removeReserve(reserve.address, {from: network});
                };
            });

            beforeEach("reset taker fee bps to 20, select random token", async() => {
                takerFeeBps = new BN(20);
                token = (Math.random() > 0.5) ? srcToken : destToken;
                token = srcToken;
                tokenDecimals = await token.decimals();
                // 1000 tokens
                tokenQty = new BN(1000).mul(new BN(10).pow(tokenDecimals));
            });

            it("should get rates for token (no taker fee)", async() => {
                takerFeeBps = new BN(0);
                actualResult = await tradeLogic.getRatesForToken(token.address, ethSrcQty, tokenQty, takerFeeBps);
                for (var i=0; i < actualResult.buyReserves.length; i++) {
                    reserveAddress = actualResult.buyReserves[i];
                    reserve = reserveInstances[reserveAddress];
                    Helper.assertEqual(reserve.address, reserveAddress, "reserve not found");
                    Helper.assertEqual(zeroBN, actualResult.buyRates[i], "rate not zero");
                }
    
                for (var i=0; i < actualResult.sellReserves.length; i++) {
                    reserveAddress = actualResult.sellReserves[i];
                    reserve = reserveInstances[reserveAddress];
                    Helper.assertEqual(reserve.address, reserveAddress, "reserve not found");
                    Helper.assertEqual(zeroBN, actualResult.sellRates[i], "rate not zero");
                }
            });
    
            it("should get rates for token (with taker fee)", async() => {
                actualResult = await tradeLogic.getRatesForToken(token.address, ethSrcQty, tokenQty, takerFeeBps);
                for (var i=0; i < actualResult.buyReserves.length; i++) {
                    reserveAddress = actualResult.buyReserves[i];
                    reserve = reserveInstances[reserveAddress];
                    Helper.assertEqual(reserve.address, reserveAddress, "reserve not found");
                    Helper.assertEqual(zeroBN, actualResult.buyRates[i], "rate not zero");
                }
    
                for (var i=0; i < actualResult.sellReserves.length; i++) {
                    reserveAddress = actualResult.sellReserves[i];
                    reserve = reserveInstances[reserveAddress];
                    Helper.assertEqual(reserve.address, reserveAddress, "reserve not found");
                    Helper.assertEqual(zeroBN, actualResult.sellRates[i], "rate not zero");
                }
            });
        });
    });

    describe("test calcRatesAndAmounts", async() => {
        before("setup tradeLogic instance and 2 tokens", async() => {
            tradeLogic = await TradeLogic.new(admin);
            tradeLogic.setNetworkContract(network, {from: admin});

            //init 2 tokens
            srcDecimals = new BN(8);
            destDecimals = new BN(12);
            srcToken = await TestToken.new("srcToken", "SRC", srcDecimals);
            destToken = await TestToken.new("destToken", "DEST", destDecimals);
        });

        describe("3 mock reserves, all feePaying", async() => {
            before("setup reserves", async() => {
                //init 3 mock reserves
                let result = await nwHelper.setupReserves(network, [srcToken, destToken], 3,0,0,0, accounts, admin, operator);
                reserveInstances = result.reserveInstances;
                numReserves = result.numAddedReserves * 1;

                //add reserves, list token pairs
                for (reserve of Object.values(reserveInstances)) {
                    await tradeLogic.addReserve(reserve.address, reserve.reserveId, reserve.isFeePaying, {from: network});
                    await tradeLogic.listPairForReserve(reserve.address, srcToken.address, true, true, true, {from: network});
                    await tradeLogic.listPairForReserve(reserve.address, destToken.address, true, true, true, {from: network});
                };
            });

            after("unlist and remove reserves", async() => {
                for (reserve of Object.values(reserveInstances)) {
                    await tradeLogic.listPairForReserve(reserve.address, srcToken.address, true, true, false, {from: network});
                    await tradeLogic.listPairForReserve(reserve.address, destToken.address, true, true, false, {from: network});
                    await tradeLogic.removeReserve(reserve.address, {from: network});
                };
            });

            beforeEach("reset taker fee bps to 20, platform fee bps to 0", async() => {
                takerFeeBps = new BN(20);
                platformFeeBps = new BN(0);
                
                // 1000 tokens
                srcQty = new BN(1000).mul(new BN(10).pow(srcDecimals));
                fees = [takerFeeBps, platformFeeBps];
            });

            it("T2E, no hint", async() => {
                reserveCandidates = await fetchReservesRatesFromTradeLogic(tradeLogic, reserveInstances, srcToken.address, srcQty, takerFeeBps, true);
                bestReserve = await nwHelper.getBestReserveAndRate(reserveCandidates, srcToken.address, ethAddress, srcQty, takerFeeBps);
                result = await tradeLogic.calcRatesAndAmounts(srcToken.address, ethAddress, srcQty, fees, emptyHint);
            });

            it("E2T, no hint", async() => {

            });

            it("T2T, no hint", async() => {

            });

            it("T2E, mask in hint", async() => {

            });

            it("E2T, mask in hint", async() => {

            });

            it("T2T, mask in hint", async() => {

            });

            it("T2E, mask out hint", async() => {

            });

            it("E2T, mask out hint", async() => {

            });

            it("T2T, mask out hint", async() => {

            });

            it("T2E, split hint", async() => {

            });

            it("E2T, split hint", async() => {

            });

            it("T2T, split hint", async() => {

            });
        })
    })
});

async function fetchReservesRatesFromTradeLogic(tradeLogicInstance, reserveInstances, tokenAddress, qty, takerFeeBps, isTokenToEth) {
    reservesArray = [];
    //sell
    if (isTokenToEth) {
        result = await tradeLogicInstance.getRatesForToken(tokenAddress, 0, qty, takerFeeBps);
        reserves = result.sellReserves;
        rates = result.sellRates;
    //buy
    } else {
        result = await tradeLogicInstance.getRatesForToken(tokenAddress, qty, 0, takerFeeBps);
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
