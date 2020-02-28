const TestToken = artifacts.require("Token.sol");
const TradeLogic = artifacts.require("KyberTradeLogic.sol");

const Helper = require("../v4/helper.js");
const nwHelper = require("./networkHelper.js");

const BN = web3.utils.BN;
const { expectEvent, expectRevert } = require('@openzeppelin/test-helpers');
const {BPS, precisionUnits, ethDecimals, ethAddress, zeroAddress, emptyHint, zeroBN} = require("../v4/helper.js");
const {NULL_ID, EMPTY_HINTTYPE, MASK_IN_HINTTYPE, MASK_OUT_HINTTYPE, SPLIT_HINTTYPE, ReserveType}  = require('./networkHelper.js');

//global variables
//////////////////
const negligibleRateDiffBps = new BN(5); //0.05% 
const minConversionRate = new BN(0);

let networkFeeArray = [new BN(0), new BN(250), new BN(400)];
let platformFeeArray = [new BN(0), new BN(250, new BN(400))];
let networkFeeBps;
let platformFeeBps;
let txResult;

let admin;
let operator;
let network;
let tradeLogic;
let user;

//reserve data
//////////////
let reserveInstances = {};
let reserve;
let numReserves;
let numMaskedReserves;
let reserveRates;
let reserveRatesE2T;
let reserveRatesT2E;

//tokens data
////////////
let srcToken;
let destToken;
let token;
let srcDecimals;
let destDecimals;
let tokenDecimals;

//quantities
////////////
let srcQty;
let ethSrcQty = precisionUnits;
let tokenQty;
let queryQty;

//expected result variables
///////////////////////////
let expectedReserveRate;
let expectedDestAmt;
let expectedRate;
let expectedTradeResult;
let expectedOutput;
let actualResult;

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

            await expectRevert(
                tradeLogic.setFeePayingPerReserveType(true, true, true, false, {from: operator}),
                "ONLY_ADMIN"
            );

            await expectRevert(
                tradeLogic.setFeePayingPerReserveType(true, true, true, false, {from: network}),
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
                tradeLogic.addReserve(reserve.address, reserve.reserveId, reserve.onChainType, {from: user}),
                "ONLY_NETWORK"
            );

            await expectRevert(
                tradeLogic.addReserve(reserve.address, reserve.reserveId, reserve.onChainType, {from: operator}),
                "ONLY_NETWORK"
            );

            await expectRevert(
                tradeLogic.addReserve(reserve.address, reserve.reserveId, reserve.onChainType, {from: admin}),
                "ONLY_NETWORK"
            );
        });

        it("should have network add reserve", async() => {
            await tradeLogic.setFeePayingPerReserveType(true, true, true, false, {from: admin});
            await tradeLogic.addReserve(reserve.address, reserve.reserveId, reserve.onChainType, {from: network});
            let reserveDetails = await tradeLogic.getReserveDetails(reserve.address);
            let reserveId = reserveDetails.reserveId;
            let reserveAddress = await tradeLogic.reserveIdToAddresses(reserve.reserveId, 0);
            Helper.assertEqual(reserve.reserveId, reserveId, "wrong address to ID");
            Helper.assertEqual(reserve.address, reserveAddress, "wrong ID to address");
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

    describe("test fee paying data per reserve", async() => {
        let token;
        let reserveInstances;

        before("setup tradeLogic instance and 4 reserves 4 types", async() => {
            tradeLogic = await TradeLogic.new(admin);
            await tradeLogic.setNetworkContract(network, {from: admin});
            await tradeLogic.setFeePayingPerReserveType(true, true, true, false, {from: admin});

            //init token
            token = await TestToken.new("Token", "TOK", 18);
            
            let result = await nwHelper.setupReserves(network, [token], 4,0,0,0, accounts, admin, operator);
            reserveInstances = result.reserveInstances;
            
            //add reserves as 4 different types.
            let type = 1;
            for (reserve of Object.values(reserveInstances)) {
                await tradeLogic.addReserve(reserve.address, reserve.reserveId, type, {from: network});
                type++;
                //iterate all 4 types
            }
        });

        it("get reserve details while modifying fee paying per type. see as expected", async() => {
            let pay = [true, true, false, false];
            await tradeLogic.setFeePayingPerReserveType(pay[0], pay[1], pay[2], pay[3], {from: admin});

            let index = 0;

            for (reserve of Object.values(reserveInstances)) {
                let details = await tradeLogic.getReserveDetails(reserve.address);
                Helper.assertEqual(reserve.reserveId, details.reserveId)
                Helper.assertEqual(index + 1, details.resType)
                Helper.assertEqual(pay[index], details.isFeePaying);
                ++index;
            }

            pay = [false, false, true, true];
            await tradeLogic.setFeePayingPerReserveType(pay[0], pay[1], pay[2], pay[3], {from: admin});

            index = 0;

            for (reserve of Object.values(reserveInstances)) {
                let details = await tradeLogic.getReserveDetails(reserve.address);
                Helper.assertEqual(pay[index], details.isFeePaying);
                ++index;
            }

            pay = [true, false, true, false];
            await tradeLogic.setFeePayingPerReserveType(pay[0], pay[1], pay[2], pay[3], {from: admin});

            index = 0;

            for (reserve of Object.values(reserveInstances)) {
                let details = await tradeLogic.getReserveDetails(reserve.address);
                Helper.assertEqual(pay[index], details.isFeePaying);
                ++index;
            }

            pay = [false, true, false, true];
            await tradeLogic.setFeePayingPerReserveType(pay[0], pay[1], pay[2], pay[3], {from: admin});

            index = 0;

            for (reserve of Object.values(reserveInstances)) {
                let details = await tradeLogic.getReserveDetails(reserve.address);
                Helper.assertEqual(pay[index], details.isFeePaying);
                ++index;
            }
        });
    });
 
    describe("test getRatesForToken", async() => {
        before("setup tradeLogic instance and 2 tokens", async() => {
            tradeLogic = await TradeLogic.new(admin);
            await tradeLogic.setNetworkContract(network, {from: admin});
            await tradeLogic.setFeePayingPerReserveType(true, true, true, false, {from: admin});

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

                tradeLogic.setFeePayingPerReserveType(true, true, true, true, {from: admin});

                //add reserves, list token pairs
                for (reserve of Object.values(reserveInstances)) {
                    await tradeLogic.addReserve(reserve.address, reserve.reserveId, reserve.onChainType, {from: network});
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

            beforeEach("use srcToken as token", async() => {
                token = srcToken;
                tokenDecimals = await token.decimals();
                // 1000 tokens
                tokenQty = new BN(1000).mul(new BN(10).pow(tokenDecimals));
            });
    
            it("should get rates for token (different network fee amounts)", async() => {
                for (networkFeeBps of networkFeeArray) {
                    actualResult = await tradeLogic.getRatesForToken(token.address, ethSrcQty, tokenQty, networkFeeBps);
                    for (let i=0; i < actualResult.buyReserves.length; i++) {
                        reserveAddress = actualResult.buyReserves[i];
                        reserve = reserveInstances[reserveAddress];
                        Helper.assertEqual(reserve.address, reserveAddress, "reserve not found");
        
                        queryQty = nwHelper.minusNetworkFees(ethSrcQty, reserve.onChainType, false, networkFeeBps);
                        expectedReserveRate = await reserve.instance.getConversionRate(ethAddress, token.address, queryQty, 0);
                        expectedDestAmt = Helper.calcDstQty(queryQty, ethDecimals, tokenDecimals, expectedReserveRate);
                        expectedRate = Helper.calcRateFromQty(ethSrcQty, expectedDestAmt, ethDecimals, tokenDecimals);
                        Helper.assertEqual(expectedRate, actualResult.buyRates[i], "rate not equal");
                    }
        
                    for (let i=0; i < actualResult.sellReserves.length; i++) {
                        reserveAddress = actualResult.sellReserves[i];
                        reserve = reserveInstances[reserveAddress];
                        Helper.assertEqual(reserve.address, reserveAddress, "reserve not found");
        
                        expectedReserveRate = await reserve.instance.getConversionRate(token.address, ethAddress, tokenQty, 0);
                        expectedDestAmt = Helper.calcDstQty(tokenQty, tokenDecimals, ethDecimals, expectedReserveRate);
                        expectedDestAmt = nwHelper.minusNetworkFees(expectedDestAmt, false, reserve.onChainType, networkFeeBps);
                        expectedRate = Helper.calcRateFromQty(tokenQty, expectedDestAmt, tokenDecimals, ethDecimals);
                        Helper.assertEqual(expectedRate, actualResult.sellRates[i], "rate not equal");
                    }  
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
                await tradeLogic.setFeePayingPerReserveType(false, false, false, false, {from: admin});

                //add reserves, list token pairs
                for (reserve of Object.values(reserveInstances)) {
                    await tradeLogic.addReserve(reserve.address, reserve.reserveId, reserve.onChainType, {from: network});
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

            beforeEach("use srcToken as token", async() => {
                token = srcToken;
                tokenDecimals = await token.decimals();
                // 1000 tokens
                tokenQty = new BN(1000).mul(new BN(10).pow(tokenDecimals));
            });
    
            it("should get rates for token (different network fee amounts)", async() => {
                for (networkFeeBps of networkFeeArray) {
                    actualResult = await tradeLogic.getRatesForToken(token.address, ethSrcQty, tokenQty, networkFeeBps);
                    for (let i=0; i < actualResult.buyReserves.length; i++) {
                        reserveAddress = actualResult.buyReserves[i];
                        reserve = reserveInstances[reserveAddress];
                        Helper.assertEqual(reserve.address, reserveAddress, "reserve not found");
        
                        queryQty = nwHelper.minusNetworkFees(ethSrcQty, false, false, networkFeeBps);
                        expectedReserveRate = await reserve.instance.getConversionRate(ethAddress, token.address, queryQty, 0);
                        expectedDestAmt = Helper.calcDstQty(queryQty, ethDecimals, tokenDecimals, expectedReserveRate);
                        expectedRate = Helper.calcRateFromQty(ethSrcQty, expectedDestAmt, ethDecimals, tokenDecimals);
                        Helper.assertEqual(expectedRate, actualResult.buyRates[i], "rate not equal");
                    }
        
                    for (let i=0; i < actualResult.sellReserves.length; i++) {
                        reserveAddress = actualResult.sellReserves[i];
                        reserve = reserveInstances[reserveAddress];
                        Helper.assertEqual(reserve.address, reserveAddress, "reserve not found");
        
                        expectedReserveRate = await reserve.instance.getConversionRate(token.address, ethAddress, tokenQty, 0);
                        expectedDestAmt = Helper.calcDstQty(tokenQty, tokenDecimals, ethDecimals, expectedReserveRate);
                        expectedDestAmt = nwHelper.minusNetworkFees(expectedDestAmt, false, false, networkFeeBps);
                        expectedRate = Helper.calcRateFromQty(tokenQty, expectedDestAmt, tokenDecimals, ethDecimals);
                        Helper.assertEqual(expectedRate, actualResult.sellRates[i], "rate not equal");
                    }
                }
            });
        });

        describe("3 mock reserves (all zero rates)", async() => {
            before("setup reserves", async() => {
                //init 3 mock reserves
                let result = await nwHelper.setupReserves(network, [srcToken, destToken], 3,0,0,0, accounts, admin, operator);
                reserveInstances = result.reserveInstances;
                numReserves = result.numAddedReserves * 1;

                await tradeLogic.setFeePayingPerReserveType(true, true, true, true, {from: admin});

                //set zero rates
                for ([key, reserve] of Object.entries(reserveInstances)) {
                    await reserve.instance.setRate(srcToken.address, zeroBN, zeroBN);
                    await reserve.instance.setRate(destToken.address, zeroBN, zeroBN);
                }

                //add reserves, list token pairs
                for (reserve of Object.values(reserveInstances)) {
                    await tradeLogic.addReserve(reserve.address, reserve.reserveId, reserve.onChainType, {from: network});
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

            beforeEach("use srcToken as token", async() => {
                token = srcToken;
                tokenDecimals = await token.decimals();
                // 1000 tokens
                tokenQty = new BN(1000).mul(new BN(10).pow(tokenDecimals));
            });
    
            it("should get rates for token (different network fee amounts)", async() => {
                for (networkFeeBps of networkFeeArray) {
                    actualResult = await tradeLogic.getRatesForToken(token.address, ethSrcQty, tokenQty, networkFeeBps);
                    for (let i=0; i < actualResult.buyReserves.length; i++) {
                        reserveAddress = actualResult.buyReserves[i];
                        reserve = reserveInstances[reserveAddress];
                        Helper.assertEqual(reserve.address, reserveAddress, "reserve not found");
                        Helper.assertEqual(zeroBN, actualResult.buyRates[i], "rate not zero");
                    }
        
                    for (let i=0; i < actualResult.sellReserves.length; i++) {
                        reserveAddress = actualResult.sellReserves[i];
                        reserve = reserveInstances[reserveAddress];
                        Helper.assertEqual(reserve.address, reserveAddress, "reserve not found");
                        Helper.assertEqual(zeroBN, actualResult.sellRates[i], "rate not zero");
                    }
                }
            });
        });
    });

    describe("test calcRatesAndAmounts", async() => {
        before("setup tradeLogic instance and 2 tokens", async() => {
            tradeLogic = await TradeLogic.new(admin);
            await tradeLogic.setNetworkContract(network, {from: admin});
            await tradeLogic.setFeePayingPerReserveType(true, true, true, false, {from: admin});

            //init 2 tokens
            srcDecimals = new BN(8);
            destDecimals = new BN(12);
            srcToken = await TestToken.new("srcToken", "SRC", srcDecimals);
            destToken = await TestToken.new("destToken", "DEST", destDecimals);

            //init variables
            let bestReserve;
            let bestSellReserve;
            let bestBuyReserve;
            let info;
        });

        describe("4 mock reserves, all feePaying", async() => {
            before("setup reserves", async() => {
                //init 4 mock reserves
                let result = await nwHelper.setupReserves(network, [srcToken, destToken], 4,0,0,0, accounts, admin, operator);
                reserveInstances = result.reserveInstances;
                numReserves = result.numAddedReserves * 1;

                tradeLogic.setFeePayingPerReserveType(true, true, true, true, {from: admin});

                //add reserves, list token pairs
                for (reserve of Object.values(reserveInstances)) {
                    await tradeLogic.addReserve(reserve.address, reserve.reserveId, reserve.onChainType, {from: network});
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

            beforeEach("reset srcQty and expected rate variables", async() => {
                // 1000 tokens
                srcQty = new BN(1000).mul(new BN(10).pow(srcDecimals));
                expectedReserves = [];
                expectedIds = [];
                expectedRates = [];
                expectedSplitValuesBps = [];
                expectedFeePaying = [];
                
            });

            it("T2E, no hint", async() => {
                for (networkFeeBps of networkFeeArray) {
                    for (platformFeeBps of platformFeeArray) {
                        info = [srcQty, networkFeeBps, platformFeeBps];
                        //search with no fees
                        reserveCandidates = await fetchReservesRatesFromTradeLogic(tradeLogic, reserveInstances, srcToken.address, srcQty, 0, true);
                        bestReserve = await nwHelper.getBestReserveAndRate(reserveCandidates, srcToken.address, ethAddress, srcQty, networkFeeBps);
                        expectedTradeResult = getTradeResult(
                            srcDecimals, [bestReserve], [bestReserve.rateNoFee], [],
                            ethDecimals, [], [], [],
                            srcQty, networkFeeBps, platformFeeBps, true);
                        
                        expectedOutput = getExpectedOutput(
                            [bestReserve], [BPS],
                            [], []
                        );
                        
                        actualResult = await tradeLogic.calcRatesAndAmounts(srcToken.address, ethAddress, srcDecimals, ethDecimals, info, emptyHint);
                        compareResults(expectedTradeResult, expectedOutput, actualResult);
                    }
                }
            });

            it("E2T, no hint", async() => {
                for (networkFeeBps of networkFeeArray) {
                    for (platformFeeBps of platformFeeArray) {
                        info = [ethSrcQty, networkFeeBps, platformFeeBps];
                        //search with no fees
                        reserveCandidates = await fetchReservesRatesFromTradeLogic(tradeLogic, reserveInstances, destToken.address, ethSrcQty, 0, false);
                        bestReserve = await nwHelper.getBestReserveAndRate(reserveCandidates, ethAddress, destToken.address, ethSrcQty, networkFeeBps);
                        expectedTradeResult = getTradeResult(
                            ethDecimals, [], [], [],
                            destDecimals, [bestReserve], [bestReserve.rateNoFee], [],
                            ethSrcQty, networkFeeBps, platformFeeBps);
                        
                        expectedOutput = getExpectedOutput(
                            [], [],
                            [bestReserve], [BPS]
                        );
                        
                        actualResult = await tradeLogic.calcRatesAndAmounts(ethAddress, destToken.address, ethDecimals, destDecimals, info, emptyHint);
                        compareResults(expectedTradeResult, expectedOutput, actualResult);
                    }   
                }
            });

            it("T2T, no hint", async() => {
                for (networkFeeBps of networkFeeArray) {
                    for (platformFeeBps of platformFeeArray) {
                        info = [srcQty, networkFeeBps, platformFeeBps];
                        //search with no fees
                        reserveCandidates = await fetchReservesRatesFromTradeLogic(tradeLogic, reserveInstances, srcToken.address, srcQty, 0, true);
                        bestSellReserve = await nwHelper.getBestReserveAndRate(reserveCandidates, srcToken.address, ethAddress, srcQty, networkFeeBps);
                        reserveCandidates = await fetchReservesRatesFromTradeLogic(tradeLogic, reserveInstances, destToken.address, ethSrcQty, 0, false);
                        bestBuyReserve = await nwHelper.getBestReserveAndRate(reserveCandidates, ethAddress, destToken.address, ethSrcQty, networkFeeBps);
                        
                        //get trade result
                        expectedTradeResult = getTradeResult(
                            srcDecimals, [bestSellReserve], [bestSellReserve.rateNoFee], [],
                            destDecimals, [bestBuyReserve], [bestBuyReserve.rateNoFee], [],
                            srcQty, networkFeeBps, platformFeeBps);
                        
                        expectedOutput = getExpectedOutput(
                            [bestSellReserve], [BPS],
                            [bestBuyReserve], [BPS]
                        );
                        
                        actualResult = await tradeLogic.calcRatesAndAmounts(srcToken.address, destToken.address, srcDecimals, destDecimals, info, emptyHint);
                        compareResults(expectedTradeResult, expectedOutput, actualResult);
                    }   
                }
            });

            it("T2E, mask in hint", async() => {
                numMaskedReserves = 2;
                for (networkFeeBps of networkFeeArray) {
                    for (platformFeeBps of platformFeeArray) {
                        info = [srcQty, networkFeeBps, platformFeeBps];
                        //search with no fees
                        hintedReserves = await getHintedReserves(
                            tradeLogic, reserveInstances,
                            MASK_IN_HINTTYPE, numMaskedReserves, [], srcQty,
                            undefined, 0, undefined, 0,
                            srcToken.address, ethAddress
                            );

                        bestReserve = await nwHelper.getBestReserveAndRate(hintedReserves.reservesT2E.reservesForFetchRate, srcToken.address, ethAddress, srcQty, networkFeeBps);
                        expectedTradeResult = getTradeResult(
                            srcDecimals, [bestReserve], [bestReserve.rateNoFee], [],
                            ethDecimals, [], [], [],
                            srcQty, networkFeeBps, platformFeeBps);
                        
                        expectedOutput = getExpectedOutput(
                            [bestReserve], [BPS],
                            [], [],
                        );
                        
                        actualResult = await tradeLogic.calcRatesAndAmounts(srcToken.address, ethAddress, srcDecimals, ethDecimals, info, hintedReserves.hint);
                        compareResults(expectedTradeResult, expectedOutput, actualResult);
                    }   
                }
            });

            it("E2T, mask in hint", async() => {
                numMaskedReserves = 2;
                for (networkFeeBps of networkFeeArray) {
                    for (platformFeeBps of platformFeeArray) {
                        info = [ethSrcQty, networkFeeBps, platformFeeBps];
                        //search with no fees
                        hintedReserves = await getHintedReserves(
                            tradeLogic, reserveInstances,
                            undefined, 0, undefined, 0,
                            MASK_IN_HINTTYPE, numMaskedReserves, [], ethSrcQty,
                            ethAddress, destToken.address
                            );

                        bestReserve = await nwHelper.getBestReserveAndRate(hintedReserves.reservesE2T.reservesForFetchRate, ethAddress, destToken.address, ethSrcQty, networkFeeBps);
                        expectedTradeResult = getTradeResult(
                            ethDecimals, [], [], [],
                            destDecimals, [bestReserve], [bestReserve.rateNoFee], [],
                            ethSrcQty, networkFeeBps, platformFeeBps);
                        
                        expectedOutput = getExpectedOutput(
                            [], [],
                            [bestReserve], [BPS]
                        );
                        
                        actualResult = await tradeLogic.calcRatesAndAmounts(ethAddress, destToken.address, ethDecimals, destDecimals, info, hintedReserves.hint);
                        compareResults(expectedTradeResult, expectedOutput, actualResult);
                    }   
                }
            });

            it("T2T, mask in hint (both ways)", async() => {
                numMaskedReserves = 2;
                for (networkFeeBps of networkFeeArray) {
                    for (platformFeeBps of platformFeeArray) {
                        info = [srcQty, networkFeeBps, platformFeeBps];
                        //search with no fees
                        hintedReserves = await getHintedReserves(
                            tradeLogic, reserveInstances,
                            MASK_IN_HINTTYPE, numMaskedReserves, [], srcQty,
                            MASK_IN_HINTTYPE, numMaskedReserves, [], ethSrcQty,
                            srcToken.address, destToken.address
                            );

                        bestSellReserve = await nwHelper.getBestReserveAndRate(hintedReserves.reservesT2E.reservesForFetchRate, srcToken.address, ethAddress, srcQty, networkFeeBps); 
                        bestBuyReserve = await nwHelper.getBestReserveAndRate(hintedReserves.reservesE2T.reservesForFetchRate, ethAddress, destToken.address, ethSrcQty, networkFeeBps);
                        expectedTradeResult = getTradeResult(
                            srcDecimals, [bestSellReserve], [bestSellReserve.rateNoFee], [],
                            destDecimals, [bestBuyReserve], [bestBuyReserve.rateNoFee], [],
                            srcQty, networkFeeBps, platformFeeBps);

                        expectedOutput = getExpectedOutput(
                            [bestSellReserve], [BPS],
                            [bestBuyReserve], [BPS]
                        );
                        
                        actualResult = await tradeLogic.calcRatesAndAmounts(srcToken.address, destToken.address, srcDecimals, destDecimals, info, hintedReserves.hint);
                        compareResults(expectedTradeResult, expectedOutput, actualResult);
                    }   
                }
            });

            it("T2E, mask out hint", async() => {
                numMaskedReserves = 2;
                for (networkFeeBps of networkFeeArray) {
                    for (platformFeeBps of platformFeeArray) {
                        info = [srcQty, networkFeeBps, platformFeeBps];
                        //search with no fees
                        hintedReserves = await getHintedReserves(
                            tradeLogic, reserveInstances,
                            MASK_OUT_HINTTYPE, numMaskedReserves, [], srcQty,
                            undefined, 0, undefined, 0,
                            srcToken.address, ethAddress
                            );

                        bestReserve = await nwHelper.getBestReserveAndRate(hintedReserves.reservesT2E.reservesForFetchRate, srcToken.address, ethAddress, srcQty, networkFeeBps);
                        expectedTradeResult = getTradeResult(
                            srcDecimals, [bestReserve], [bestReserve.rateNoFee], [],
                            ethDecimals, [], [], [],
                            srcQty, networkFeeBps, platformFeeBps);
                        
                        expectedOutput = getExpectedOutput(
                            [bestReserve], [BPS],
                            [], []
                        );
                        
                        actualResult = await tradeLogic.calcRatesAndAmounts(srcToken.address, ethAddress, srcDecimals, ethDecimals, info, hintedReserves.hint);
                        compareResults(expectedTradeResult, expectedOutput, actualResult);
                    }   
                }
            });

            it("E2T, mask out hint", async() => {
                numMaskedReserves = 2;
                for (networkFeeBps of networkFeeArray) {
                    for (platformFeeBps of platformFeeArray) {
                        info = [ethSrcQty, networkFeeBps, platformFeeBps];
                        //search with no fees
                        hintedReserves = await getHintedReserves(
                            tradeLogic, reserveInstances,
                            undefined, 0, undefined, 0,
                            MASK_OUT_HINTTYPE, numMaskedReserves, [], ethSrcQty,
                            ethAddress, destToken.address
                            );

                        bestReserve = await nwHelper.getBestReserveAndRate(hintedReserves.reservesE2T.reservesForFetchRate, ethAddress, destToken.address, ethSrcQty, networkFeeBps);
                        expectedTradeResult = getTradeResult(
                            ethDecimals, [], [], [],
                            destDecimals, [bestReserve], [bestReserve.rateNoFee], [],
                            ethSrcQty, networkFeeBps, platformFeeBps);

                        expectedOutput = getExpectedOutput(
                            [], [],
                            [bestReserve], [BPS]
                        );

                        actualResult = await tradeLogic.calcRatesAndAmounts(ethAddress, destToken.address, ethDecimals, destDecimals, info, hintedReserves.hint);
                        compareResults(expectedTradeResult, expectedOutput, actualResult);
                    }   
                }
            });

            it("T2T, mask out hint", async() => {
                numMaskedReserves = 2;
                for (networkFeeBps of networkFeeArray) {
                    for (platformFeeBps of platformFeeArray) {
                        info = [srcQty, networkFeeBps, platformFeeBps];
                        //search with no fees
                        hintedReserves = await getHintedReserves(
                            tradeLogic, reserveInstances,
                            MASK_OUT_HINTTYPE, numMaskedReserves, [], srcQty,
                            MASK_OUT_HINTTYPE, numMaskedReserves, [], ethSrcQty,
                            srcToken.address, destToken.address
                            );

                        bestSellReserve = await nwHelper.getBestReserveAndRate(hintedReserves.reservesT2E.reservesForFetchRate, srcToken.address, ethAddress, srcQty, networkFeeBps); 
                        bestBuyReserve = await nwHelper.getBestReserveAndRate(hintedReserves.reservesE2T.reservesForFetchRate, ethAddress, destToken.address, ethSrcQty, networkFeeBps);
                        expectedTradeResult = getTradeResult(
                            srcDecimals, [bestSellReserve], [bestSellReserve.rateNoFee], [],
                            destDecimals, [bestBuyReserve], [bestBuyReserve.rateNoFee], [],
                            srcQty, networkFeeBps, platformFeeBps);

                        expectedOutput = getExpectedOutput(
                            [bestSellReserve], [BPS],
                            [bestBuyReserve], [BPS]
                        );
                        
                        actualResult = await tradeLogic.calcRatesAndAmounts(srcToken.address, destToken.address, srcDecimals, destDecimals, info, hintedReserves.hint);
                        compareResults(expectedTradeResult, expectedOutput, actualResult);
                    }   
                }
            });

            it("T2E, split hint", async() => {
                for (networkFeeBps of networkFeeArray) {
                    for (platformFeeBps of platformFeeArray) {
                        info = [srcQty, networkFeeBps, platformFeeBps];
                        //search with no fees
                        hintedReserves = await getHintedReserves(
                            tradeLogic, reserveInstances,
                            SPLIT_HINTTYPE, undefined, undefined, srcQty,
                            undefined, 0, undefined, 0,
                            srcToken.address, ethAddress
                            );
                        
                        reserveRates = hintedReserves.reservesT2E.reservesForFetchRate.map(reserve => reserve.rate);
                        expectedTradeResult = getTradeResult(
                            srcDecimals, hintedReserves.reservesT2E.reservesForFetchRate, reserveRates, hintedReserves.reservesT2E.splits,
                            ethDecimals, [], [], [],
                            srcQty, networkFeeBps, platformFeeBps);
                        
                        expectedOutput = getExpectedOutput(
                            hintedReserves.reservesT2E.reservesForFetchRate, hintedReserves.reservesT2E.splits,
                            [], [],
                        );

                        actualResult = await tradeLogic.calcRatesAndAmounts(srcToken.address, ethAddress, srcDecimals, ethDecimals, info, hintedReserves.hint);
                        compareResults(expectedTradeResult, expectedOutput, actualResult);
                    }   
                }
            });

            it("E2T, split hint", async() => {
                for (networkFeeBps of networkFeeArray) {
                    for (platformFeeBps of platformFeeArray) {
                        info = [ethSrcQty, networkFeeBps, platformFeeBps];
                        //search with no fees
                        hintedReserves = await getHintedReserves(
                            tradeLogic, reserveInstances,
                            undefined, 0, undefined, 0,
                            SPLIT_HINTTYPE, undefined, undefined, ethSrcQty,
                            ethAddress, destToken.address
                            );

                        reserveRates = hintedReserves.reservesE2T.reservesForFetchRate.map(reserve => reserve.rate);
                        expectedTradeResult = getTradeResult(
                            ethDecimals, [], [], [],
                            destDecimals, hintedReserves.reservesE2T.reservesForFetchRate, reserveRates, hintedReserves.reservesE2T.splits,
                            ethSrcQty, networkFeeBps, platformFeeBps);
                        
                        expectedOutput = getExpectedOutput(
                            [], [],
                            hintedReserves.reservesE2T.reservesForFetchRate, hintedReserves.reservesE2T.splits,
                        );
                        
                        actualResult = await tradeLogic.calcRatesAndAmounts(ethAddress, destToken.address, ethDecimals, destDecimals, info, hintedReserves.hint);
                        compareResults(expectedTradeResult, expectedOutput, actualResult);
                    }   
                }
            });

            it("T2T, split hint", async() => {
                for (networkFeeBps of networkFeeArray) {
                    for (platformFeeBps of platformFeeArray) {
                        info = [srcQty, networkFeeBps, platformFeeBps];
                        //search with no fees
                        hintedReserves = await getHintedReserves(
                            tradeLogic, reserveInstances,
                            SPLIT_HINTTYPE, undefined, undefined, srcQty,
                            SPLIT_HINTTYPE, undefined, undefined, ethSrcQty,
                            srcToken.address, destToken.address
                            );

                        reserveRatesT2E = hintedReserves.reservesT2E.reservesForFetchRate.map(reserve => reserve.rate);
                        reserveRatesE2T = hintedReserves.reservesE2T.reservesForFetchRate.map(reserve => reserve.rate);

                        expectedTradeResult = getTradeResult(
                            srcDecimals, hintedReserves.reservesT2E.reservesForFetchRate, reserveRatesT2E, hintedReserves.reservesT2E.splits,
                            destDecimals, hintedReserves.reservesE2T.reservesForFetchRate, reserveRatesE2T, hintedReserves.reservesE2T.splits,
                            srcQty, networkFeeBps, platformFeeBps);
                        
                        expectedOutput = getExpectedOutput(
                            hintedReserves.reservesT2E.reservesForFetchRate, hintedReserves.reservesT2E.splits,
                            hintedReserves.reservesE2T.reservesForFetchRate, hintedReserves.reservesE2T.splits,
                        );
                        
                        actualResult = await tradeLogic.calcRatesAndAmounts(srcToken.address, destToken.address, srcDecimals, destDecimals, info, hintedReserves.hint);
                        compareResults(expectedTradeResult, expectedOutput, actualResult);
                    }   
                }
            });

            it("T2T, no hint | mask in hint", async() => {
                for (networkFeeBps of networkFeeArray) {
                    for (platformFeeBps of platformFeeArray) {
                        info = [srcQty, networkFeeBps, platformFeeBps];
                        //search with no fees
                        hintedReserves = await getHintedReserves(
                            tradeLogic, reserveInstances,
                            EMPTY_HINTTYPE, undefined, undefined, srcQty,
                            MASK_IN_HINTTYPE, undefined, undefined, ethSrcQty,
                            srcToken.address, destToken.address
                            );

                        bestSellReserve = await nwHelper.getBestReserveAndRate(hintedReserves.reservesT2E.reservesForFetchRate, srcToken.address, ethAddress, srcQty, networkFeeBps); 
                        bestBuyReserve = await nwHelper.getBestReserveAndRate(hintedReserves.reservesE2T.reservesForFetchRate, ethAddress, destToken.address, ethSrcQty, networkFeeBps);
                        expectedTradeResult = getTradeResult(
                            srcDecimals, [bestSellReserve], [bestSellReserve.rateNoFee], [],
                            destDecimals, [bestBuyReserve], [bestBuyReserve.rateNoFee], [],
                            srcQty, networkFeeBps, platformFeeBps);

                        expectedOutput = getExpectedOutput(
                            [bestSellReserve], [BPS],
                            [bestBuyReserve], [BPS]
                        );
                        
                        actualResult = await tradeLogic.calcRatesAndAmounts(srcToken.address, destToken.address, srcDecimals, destDecimals, info, hintedReserves.hint);
                        compareResults(expectedTradeResult, expectedOutput, actualResult);
                    }   
                }
            });

            it("T2T, no hint | mask out hint", async() => {
                for (networkFeeBps of networkFeeArray) {
                    for (platformFeeBps of platformFeeArray) {
                        info = [srcQty, networkFeeBps, platformFeeBps];
                        //search with no fees
                        hintedReserves = await getHintedReserves(
                            tradeLogic, reserveInstances,
                            EMPTY_HINTTYPE, undefined, undefined, srcQty,
                            MASK_OUT_HINTTYPE, undefined, undefined, ethSrcQty,
                            srcToken.address, destToken.address
                            );

                        bestSellReserve = await nwHelper.getBestReserveAndRate(hintedReserves.reservesT2E.reservesForFetchRate, srcToken.address, ethAddress, srcQty, networkFeeBps); 
                        bestBuyReserve = await nwHelper.getBestReserveAndRate(hintedReserves.reservesE2T.reservesForFetchRate, ethAddress, destToken.address, ethSrcQty, networkFeeBps);
                        expectedTradeResult = getTradeResult(
                            srcDecimals, [bestSellReserve], [bestSellReserve.rateNoFee], [],
                            destDecimals, [bestBuyReserve], [bestBuyReserve.rateNoFee], [],
                            srcQty, networkFeeBps, platformFeeBps);

                        expectedOutput = getExpectedOutput(
                            [bestSellReserve], [BPS],
                            [bestBuyReserve], [BPS]
                        );
                        
                        actualResult = await tradeLogic.calcRatesAndAmounts(srcToken.address, destToken.address, srcDecimals, destDecimals, info, hintedReserves.hint);
                        compareResults(expectedTradeResult, expectedOutput, actualResult);
                    }   
                }
            });

            it("T2T, no hint | split hint", async() => {
                for (networkFeeBps of networkFeeArray) {
                    for (platformFeeBps of platformFeeArray) {
                        info = [srcQty, networkFeeBps, platformFeeBps];
                        //search with no fees
                        hintedReserves = await getHintedReserves(
                            tradeLogic, reserveInstances,
                            EMPTY_HINTTYPE, undefined, undefined, srcQty,
                            SPLIT_HINTTYPE, undefined, undefined, ethSrcQty,
                            srcToken.address, destToken.address
                            );

                        bestSellReserve = await nwHelper.getBestReserveAndRate(hintedReserves.reservesT2E.reservesForFetchRate, srcToken.address, ethAddress, srcQty, networkFeeBps); 
                        reserveRatesE2T = hintedReserves.reservesE2T.reservesForFetchRate.map(reserve => reserve.rate);

                        expectedTradeResult = getTradeResult(
                            srcDecimals, [bestSellReserve], [bestSellReserve.rateNoFee], [],
                            destDecimals, hintedReserves.reservesE2T.reservesForFetchRate, reserveRatesE2T, hintedReserves.reservesE2T.splits,
                            srcQty, networkFeeBps, platformFeeBps);

                        expectedOutput = getExpectedOutput(
                            [bestSellReserve], [BPS],
                            hintedReserves.reservesE2T.reservesForFetchRate, hintedReserves.reservesE2T.splits,
                        );
                        
                        actualResult = await tradeLogic.calcRatesAndAmounts(srcToken.address, destToken.address, srcDecimals, destDecimals, info, hintedReserves.hint);
                        compareResults(expectedTradeResult, expectedOutput, actualResult);
                    }   
                }
            });

            it("T2T, mask in hint | no hint", async() => {
                for (networkFeeBps of networkFeeArray) {
                    for (platformFeeBps of platformFeeArray) {
                        info = [srcQty, networkFeeBps, platformFeeBps];
                        //search with no fees
                        hintedReserves = await getHintedReserves(
                            tradeLogic, reserveInstances,
                            MASK_IN_HINTTYPE, undefined, undefined, srcQty,
                            EMPTY_HINTTYPE, undefined, undefined, ethSrcQty,
                            srcToken.address, destToken.address
                            );

                        bestSellReserve = await nwHelper.getBestReserveAndRate(hintedReserves.reservesT2E.reservesForFetchRate, srcToken.address, ethAddress, srcQty, networkFeeBps); 
                        bestBuyReserve = await nwHelper.getBestReserveAndRate(hintedReserves.reservesE2T.reservesForFetchRate, ethAddress, destToken.address, ethSrcQty, networkFeeBps);
                        expectedTradeResult = getTradeResult(
                            srcDecimals, [bestSellReserve], [bestSellReserve.rateNoFee], [],
                            destDecimals, [bestBuyReserve], [bestBuyReserve.rateNoFee], [],
                            srcQty, networkFeeBps, platformFeeBps);

                        expectedOutput = getExpectedOutput(
                            [bestSellReserve], [BPS],
                            [bestBuyReserve], [BPS]
                        );
                        
                        actualResult = await tradeLogic.calcRatesAndAmounts(srcToken.address, destToken.address, srcDecimals, destDecimals, info, hintedReserves.hint);
                        compareResults(expectedTradeResult, expectedOutput, actualResult);
                    }   
                }
            });

            it("T2T, mask in hint | mask out hint", async() => {
                for (networkFeeBps of networkFeeArray) {
                    for (platformFeeBps of platformFeeArray) {
                        info = [srcQty, networkFeeBps, platformFeeBps];
                        //search with no fees
                        hintedReserves = await getHintedReserves(
                            tradeLogic, reserveInstances,
                            MASK_IN_HINTTYPE, undefined, undefined, srcQty,
                            MASK_OUT_HINTTYPE, undefined, undefined, ethSrcQty,
                            srcToken.address, destToken.address
                            );

                        bestSellReserve = await nwHelper.getBestReserveAndRate(hintedReserves.reservesT2E.reservesForFetchRate, srcToken.address, ethAddress, srcQty, networkFeeBps); 
                        bestBuyReserve = await nwHelper.getBestReserveAndRate(hintedReserves.reservesE2T.reservesForFetchRate, ethAddress, destToken.address, ethSrcQty, networkFeeBps);
                        expectedTradeResult = getTradeResult(
                            srcDecimals, [bestSellReserve], [bestSellReserve.rateNoFee], [],
                            destDecimals, [bestBuyReserve], [bestBuyReserve.rateNoFee], [],
                            srcQty, networkFeeBps, platformFeeBps);

                        expectedOutput = getExpectedOutput(
                            [bestSellReserve], [BPS],
                            [bestBuyReserve], [BPS]
                        );
                        
                        actualResult = await tradeLogic.calcRatesAndAmounts(srcToken.address, destToken.address, srcDecimals, destDecimals, info, hintedReserves.hint);
                        compareResults(expectedTradeResult, expectedOutput, actualResult);
                    }   
                }
            });

            it("T2T, mask in hint | split hint", async() => {
                for (networkFeeBps of networkFeeArray) {
                    for (platformFeeBps of platformFeeArray) {
                        info = [srcQty, networkFeeBps, platformFeeBps];
                        //search with no fees
                        hintedReserves = await getHintedReserves(
                            tradeLogic, reserveInstances,
                            MASK_IN_HINTTYPE, undefined, undefined, srcQty,
                            SPLIT_HINTTYPE, undefined, undefined, ethSrcQty,
                            srcToken.address, destToken.address
                            );

                        bestSellReserve = await nwHelper.getBestReserveAndRate(hintedReserves.reservesT2E.reservesForFetchRate, srcToken.address, ethAddress, srcQty, networkFeeBps); 
                        reserveRatesE2T = hintedReserves.reservesE2T.reservesForFetchRate.map(reserve => reserve.rate);

                        expectedTradeResult = getTradeResult(
                            srcDecimals, [bestSellReserve], [bestSellReserve.rateNoFee], [],
                            destDecimals, hintedReserves.reservesE2T.reservesForFetchRate, reserveRatesE2T, hintedReserves.reservesE2T.splits,
                            srcQty, networkFeeBps, platformFeeBps);

                        expectedOutput = getExpectedOutput(
                            [bestSellReserve], [BPS],
                            hintedReserves.reservesE2T.reservesForFetchRate, hintedReserves.reservesE2T.splits,
                        );
                        
                        actualResult = await tradeLogic.calcRatesAndAmounts(srcToken.address, destToken.address, srcDecimals, destDecimals, info, hintedReserves.hint);
                        compareResults(expectedTradeResult, expectedOutput, actualResult);
                    }   
                }
            });

            it("T2T, mask out hint | no hint", async() => {
                for (networkFeeBps of networkFeeArray) {
                    for (platformFeeBps of platformFeeArray) {
                        info = [srcQty, networkFeeBps, platformFeeBps];
                        //search with no fees
                        hintedReserves = await getHintedReserves(
                            tradeLogic, reserveInstances,
                            MASK_OUT_HINTTYPE, undefined, undefined, srcQty,
                            EMPTY_HINTTYPE, undefined, undefined, ethSrcQty,
                            srcToken.address, destToken.address
                            );

                        bestSellReserve = await nwHelper.getBestReserveAndRate(hintedReserves.reservesT2E.reservesForFetchRate, srcToken.address, ethAddress, srcQty, networkFeeBps); 
                        bestBuyReserve = await nwHelper.getBestReserveAndRate(hintedReserves.reservesE2T.reservesForFetchRate, ethAddress, destToken.address, ethSrcQty, networkFeeBps);
                        expectedTradeResult = getTradeResult(
                            srcDecimals, [bestSellReserve], [bestSellReserve.rateNoFee], [],
                            destDecimals, [bestBuyReserve], [bestBuyReserve.rateNoFee], [],
                            srcQty, networkFeeBps, platformFeeBps);

                        expectedOutput = getExpectedOutput(
                            [bestSellReserve], [BPS],
                            [bestBuyReserve], [BPS]
                        );
                        
                        actualResult = await tradeLogic.calcRatesAndAmounts(srcToken.address, destToken.address, srcDecimals, destDecimals, info, hintedReserves.hint);
                        compareResults(expectedTradeResult, expectedOutput, actualResult);
                    }   
                }
            });

            it("T2T, mask out hint | mask in hint", async() => {
                for (networkFeeBps of networkFeeArray) {
                    for (platformFeeBps of platformFeeArray) {
                        info = [srcQty, networkFeeBps, platformFeeBps];
                        //search with no fees
                        hintedReserves = await getHintedReserves(
                            tradeLogic, reserveInstances,
                            MASK_OUT_HINTTYPE, undefined, undefined, srcQty,
                            MASK_IN_HINTTYPE, undefined, undefined, ethSrcQty,
                            srcToken.address, destToken.address
                            );

                        bestSellReserve = await nwHelper.getBestReserveAndRate(hintedReserves.reservesT2E.reservesForFetchRate, srcToken.address, ethAddress, srcQty, networkFeeBps); 
                        bestBuyReserve = await nwHelper.getBestReserveAndRate(hintedReserves.reservesE2T.reservesForFetchRate, ethAddress, destToken.address, ethSrcQty, networkFeeBps);
                        expectedTradeResult = getTradeResult(
                            srcDecimals, [bestSellReserve], [bestSellReserve.rateNoFee], [],
                            destDecimals, [bestBuyReserve], [bestBuyReserve.rateNoFee], [],
                            srcQty, networkFeeBps, platformFeeBps);

                        expectedOutput = getExpectedOutput(
                            [bestSellReserve], [BPS],
                            [bestBuyReserve], [BPS]
                        );
                        
                        actualResult = await tradeLogic.calcRatesAndAmounts(srcToken.address, destToken.address, srcDecimals, destDecimals, info, hintedReserves.hint);
                        compareResults(expectedTradeResult, expectedOutput, actualResult);
                    }   
                }
            });

            it("T2T, mask out hint | split hint", async() => {
                for (networkFeeBps of networkFeeArray) {
                    for (platformFeeBps of platformFeeArray) {
                        info = [srcQty, networkFeeBps, platformFeeBps];
                        //search with no fees
                        hintedReserves = await getHintedReserves(
                            tradeLogic, reserveInstances,
                            MASK_OUT_HINTTYPE, undefined, undefined, srcQty,
                            SPLIT_HINTTYPE, undefined, undefined, ethSrcQty,
                            srcToken.address, destToken.address
                            );

                        bestSellReserve = await nwHelper.getBestReserveAndRate(hintedReserves.reservesT2E.reservesForFetchRate, srcToken.address, ethAddress, srcQty, networkFeeBps); 
                        reserveRatesE2T = hintedReserves.reservesE2T.reservesForFetchRate.map(reserve => reserve.rate);

                        expectedTradeResult = getTradeResult(
                            srcDecimals, [bestSellReserve], [bestSellReserve.rateNoFee], [],
                            destDecimals, hintedReserves.reservesE2T.reservesForFetchRate, reserveRatesE2T, hintedReserves.reservesE2T.splits,
                            srcQty, networkFeeBps, platformFeeBps);

                        expectedOutput = getExpectedOutput(
                            [bestSellReserve], [BPS],
                            hintedReserves.reservesE2T.reservesForFetchRate, hintedReserves.reservesE2T.splits,
                        );
                        
                        actualResult = await tradeLogic.calcRatesAndAmounts(srcToken.address, destToken.address, srcDecimals, destDecimals, info, hintedReserves.hint);
                        compareResults(expectedTradeResult, expectedOutput, actualResult);
                    }   
                }
            });

            it("T2T, split hint | no hint", async() => {
                for (networkFeeBps of networkFeeArray) {
                    for (platformFeeBps of platformFeeArray) {
                        info = [srcQty, networkFeeBps, platformFeeBps];
                        //search with no fees
                        hintedReserves = await getHintedReserves(
                            tradeLogic, reserveInstances,
                            SPLIT_HINTTYPE, undefined, undefined, srcQty,
                            EMPTY_HINTTYPE, undefined, undefined, ethSrcQty,
                            srcToken.address, destToken.address
                            );

                        reserveRatesT2E = hintedReserves.reservesT2E.reservesForFetchRate.map(reserve => reserve.rate);
                        bestBuyReserve = await nwHelper.getBestReserveAndRate(hintedReserves.reservesE2T.reservesForFetchRate, ethAddress, destToken.address, ethSrcQty, networkFeeBps);
                        expectedTradeResult = getTradeResult(
                            srcDecimals, hintedReserves.reservesT2E.reservesForFetchRate, reserveRatesT2E, hintedReserves.reservesT2E.splits,
                            destDecimals, [bestBuyReserve], [bestBuyReserve.rateNoFee], [],
                            srcQty, networkFeeBps, platformFeeBps);

                        expectedOutput = getExpectedOutput(
                            hintedReserves.reservesT2E.reservesForFetchRate, hintedReserves.reservesT2E.splits,
                            [bestBuyReserve], [BPS],
                        );
                        
                        actualResult = await tradeLogic.calcRatesAndAmounts(srcToken.address, destToken.address, srcDecimals, destDecimals, info, hintedReserves.hint);
                        compareResults(expectedTradeResult, expectedOutput, actualResult);
                    }   
                }
            });

            it("T2T, split hint | mask in hint", async() => {
                for (networkFeeBps of networkFeeArray) {
                    for (platformFeeBps of platformFeeArray) {
                        info = [srcQty, networkFeeBps, platformFeeBps];
                        //search with no fees
                        hintedReserves = await getHintedReserves(
                            tradeLogic, reserveInstances,
                            SPLIT_HINTTYPE, undefined, undefined, srcQty,
                            MASK_IN_HINTTYPE, undefined, undefined, ethSrcQty,
                            srcToken.address, destToken.address
                            );

                        reserveRatesT2E = hintedReserves.reservesT2E.reservesForFetchRate.map(reserve => reserve.rate);
                        bestBuyReserve = await nwHelper.getBestReserveAndRate(hintedReserves.reservesE2T.reservesForFetchRate, ethAddress, destToken.address, ethSrcQty, networkFeeBps);
                        expectedTradeResult = getTradeResult(
                            srcDecimals, hintedReserves.reservesT2E.reservesForFetchRate, reserveRatesT2E, hintedReserves.reservesT2E.splits,
                            destDecimals, [bestBuyReserve], [bestBuyReserve.rateNoFee], [],
                            srcQty, networkFeeBps, platformFeeBps);

                        expectedOutput = getExpectedOutput(
                            hintedReserves.reservesT2E.reservesForFetchRate, hintedReserves.reservesT2E.splits,
                            [bestBuyReserve], [BPS],
                        );
                        
                        actualResult = await tradeLogic.calcRatesAndAmounts(srcToken.address, destToken.address, srcDecimals, destDecimals, info, hintedReserves.hint);
                        compareResults(expectedTradeResult, expectedOutput, actualResult);
                    }   
                }
            });

            it("T2T, split hint | mask out hint", async() => {
                for (networkFeeBps of networkFeeArray) {
                    for (platformFeeBps of platformFeeArray) {
                        info = [srcQty, networkFeeBps, platformFeeBps];
                        //search with no fees
                        hintedReserves = await getHintedReserves(
                            tradeLogic, reserveInstances,
                            SPLIT_HINTTYPE, undefined, undefined, srcQty,
                            MASK_OUT_HINTTYPE, undefined, undefined, ethSrcQty,
                            srcToken.address, destToken.address
                            );

                        reserveRatesT2E = hintedReserves.reservesT2E.reservesForFetchRate.map(reserve => reserve.rate);
                        bestBuyReserve = await nwHelper.getBestReserveAndRate(hintedReserves.reservesE2T.reservesForFetchRate, ethAddress, destToken.address, ethSrcQty, networkFeeBps);
                        expectedTradeResult = getTradeResult(
                            srcDecimals, hintedReserves.reservesT2E.reservesForFetchRate, reserveRatesT2E, hintedReserves.reservesT2E.splits,
                            destDecimals, [bestBuyReserve], [bestBuyReserve.rateNoFee], [],
                            srcQty, networkFeeBps, platformFeeBps);

                        expectedOutput = getExpectedOutput(
                            hintedReserves.reservesT2E.reservesForFetchRate, hintedReserves.reservesT2E.splits,
                            [bestBuyReserve], [BPS],
                        );
                        
                        actualResult = await tradeLogic.calcRatesAndAmounts(srcToken.address, destToken.address, srcDecimals, destDecimals, info, hintedReserves.hint);
                        compareResults(expectedTradeResult, expectedOutput, actualResult);
                    }   
                }
            });
        })
    });

    describe("test calcRatesAndAmounts very small and very big numbers", async() => {
    });

    describe("test edge cases for fee. very big / small network fee and very / big small custom fee", async() => {
        //todo: check what happens if fee combination is above 100% or equal 100% or very near 100%

    });

});

async function fetchReservesRatesFromTradeLogic(tradeLogicInstance, reserveInstances, tokenAddress, qty, networkFeeBps, isTokenToEth) {
    let reservesArray = [];
    let result;
    let reserves;
    let reserve;
    let rates;

    //sell
    if (isTokenToEth) {
        result = await tradeLogicInstance.getRatesForToken(tokenAddress, 0, qty, networkFeeBps);
        reserves = result.sellReserves;
        rates = result.sellRates;
    //buy
    } else {
        result = await tradeLogicInstance.getRatesForToken(tokenAddress, qty, 0, networkFeeBps);
        reserves = result.buyReserves;
        rates = result.buyRates;
    }
    for (i=0; i<reserves.length; i++) {
        reserveAddress = reserves[i];
        reserve = Object.assign({}, reserveInstances[reserveAddress]);
        reserve.rate = rates[i];
        reservesArray.push(reserve);
    }
    return reservesArray;
}

async function getHintedReserves(
    tradeLogic, reserveInstances, 
    t2eHintType, t2eNumReserves, t2eSplits, t2eQty,
    e2tHintType, e2tNumReserves, e2tSplits, e2tQty,
    srcAdd, destAdd) 
{   
    let reserveCandidates;
    let res = {
        'reservesT2E': {},
        'reservesE2T': {},
        'hint': emptyHint
    };
    t2eHintType = (t2eHintType == EMPTY_HINTTYPE) ? emptyHint : t2eHintType;
    e2tHintType = (e2tHintType == EMPTY_HINTTYPE) ? emptyHint : e2tHintType;

    if(srcAdd != ethAddress) {
        reserveCandidates = await fetchReservesRatesFromTradeLogic(tradeLogic, reserveInstances, srcAdd, t2eQty, 0, true);        
        res.reservesT2E = nwHelper.applyHintToReserves(t2eHintType, reserveCandidates, t2eNumReserves, t2eSplits);
        if(destAdd == ethAddress) {
            res.hint = await tradeLogic.buildTokenToEthHint(
                res.reservesT2E.tradeType, res.reservesT2E.reservesForHint, res.reservesT2E.splits);
            return res;
        }
    }
    
    if(destAdd != ethAddress) {
        reserveCandidates = await fetchReservesRatesFromTradeLogic(tradeLogic, reserveInstances, destAdd, e2tQty, 0, false);
        res.reservesE2T = nwHelper.applyHintToReserves(e2tHintType, reserveCandidates, e2tNumReserves, e2tSplits);
        if(srcAdd == ethAddress) {
            res.hint = await tradeLogic.buildEthToTokenHint(
                res.reservesE2T.tradeType, res.reservesE2T.reservesForHint, res.reservesE2T.splits);
            return res;
        }
    }

    res.hint = await tradeLogic.buildTokenToTokenHint(
        res.reservesT2E.tradeType, res.reservesT2E.reservesForHint, res.reservesT2E.splits,
        res.reservesE2T.tradeType, res.reservesE2T.reservesForHint, res.reservesE2T.splits
    );
    
    return res;
}

function getTradeResult(
    srcDecimals, t2eReserves, t2eRates, t2eSplits,
    destDecimals, e2tReserves, e2tRates, e2tSplits,
    srcQty, networkFeeBps, platformFeeBps, isFeePaying
) {
    let result = {
        t2eNumReserves: (t2eSplits.length > 0) ? t2eReserves.length : new BN(1),
        tradeWei: zeroBN,
        networkFeeWei: zeroBN,
        platformFeeWei: zeroBN,
        numFeePayingReserves: zeroBN,
        feePayingReservesBps: zeroBN,
        destAmountNoFee: zeroBN,
        actualDestAmount: zeroBN,
        destAmountWithNetworkFee: zeroBN
    }

    let amountSoFar = zeroBN;
    let reserve;
    let splitAmount;
    let destAmt;
    let feePayingBps;
    let actualTradeWei;

    if (t2eSplits.length > 0) {
        for (let i=0; i<t2eReserves.length; i++) {
            reserve = t2eReserves[i];
            splitAmount = (i == t2eReserves.length - 1) ? (srcQty.sub(amountSoFar)) : t2eSplits[i].mul(srcQty).div(BPS);
            if (t2eRates[i].isZero()) {
                result.tradeWei = zeroBN;
                result.numFeePayingReserves = zeroBN;
                result.feePayingReservesBps = zeroBN;
                return result;
            }
            destAmt = Helper.calcDstQty(splitAmount, srcDecimals, ethDecimals, t2eRates[i]);
            result.tradeWei = result.tradeWei.add(destAmt);
            amountSoFar = amountSoFar.add(splitAmount);
            if (isFeePaying) {
                result.feePayingReservesBps = result.feePayingReservesBps.add(t2eSplits[i]);
                result.numFeePayingReserves = result.numFeePayingReserves.add(new BN(1));
            }
        }
    } else if (t2eReserves.length > 0) {
        reserve = t2eReserves[0];
        result.tradeWei = Helper.calcDstQty(srcQty, srcDecimals, ethDecimals, t2eRates[0]);
        if (reserve.onChainType) {
            result.feePayingReservesBps = result.feePayingReservesBps.add(BPS);
            result.numFeePayingReserves = result.numFeePayingReserves.add(new BN(1));
        }
    } else {
        result.tradeWei = srcQty;
    }

    //add e2t reserve splits (doesn't matter if split or not, cos we already know best reserve)
    for (let i=0; i<e2tReserves.length; i++) {
        reserve = e2tReserves[i];
        if (isFeePaying) {
            feePayingBps = (e2tSplits[i] == undefined) ? BPS : e2tSplits[i];
            result.feePayingReservesBps = result.feePayingReservesBps.add(feePayingBps);
            result.numFeePayingReserves = result.numFeePayingReserves.add(new BN(1));
        }
    }

    //calculate fees
    result.networkFeeWei = result.tradeWei.mul(networkFeeBps).div(BPS);
    result.networkFeeWei = result.networkFeeWei.mul(result.feePayingReservesBps).div(BPS);
    result.platformFeeWei = result.tradeWei.mul(platformFeeBps).div(BPS);
    actualTradeWei = result.tradeWei.sub(result.networkFeeWei).sub(result.platformFeeWei);

    //calculate dest amounts
    amountSoFar = zeroBN;
    if (e2tSplits.length > 0) {
        for (let i=0; i<e2tReserves.length; i++) {
            reserve = e2tReserves[i];
            splitAmount = (i == e2tReserves.length - 1) ? (actualTradeWei.sub(amountSoFar)) : e2tSplits[i].mul(actualTradeWei).div(BPS);
            if (e2tRates[i].isZero()) {
                result.actualDestAmount = zeroBN;
                return;
            }
            destAmt = Helper.calcDstQty(splitAmount, ethDecimals, destDecimals, e2tRates[i]);
            result.actualDestAmount = result.actualDestAmount.add(destAmt);
            amountSoFar = amountSoFar.add(splitAmount);
        }
        rate = Helper.calcRateFromQty(actualTradeWei, result.actualDestAmount, ethDecimals, destDecimals);
    } else if (e2tReserves.length > 0) {
        reserve = e2tReserves[0];
        rate = e2tRates[0];
        result.actualDestAmount = Helper.calcDstQty(actualTradeWei, ethDecimals, destDecimals, rate);
    } else {
        rate = precisionUnits;
        result.actualDestAmount = Helper.calcDstQty(actualTradeWei, ethDecimals, destDecimals, rate);
    }

    //calculate dest amount with fees
    result.destAmountNoFee = Helper.calcDstQty(result.tradeWei, ethDecimals, destDecimals, rate);
    result.destAmountWithNetworkFee = Helper.calcDstQty(result.tradeWei.sub(result.networkFeeWei), ethDecimals, destDecimals, rate);
    return result;
}

function getExpectedOutput(sellReserves, sellSplits, buyReserves, buySplits) {
    let result = {
        'addresses': [],
        'ids': [],
        'rates': [],
        'splitValuesBps': [],
        'isFeePaying': []
    }

    //tokenToEth
    if (buyReserves.length == 0) {
        result.addresses = sellReserves.map(reserve => reserve.address);
        result.addresses = result.addresses.concat(zeroAddress);
        result.ids = sellReserves.map(reserve => reserve.reserveId);
        result.ids = result.ids.concat(NULL_ID);
        result.rates = (sellSplits.length > 1) ? 
            result.rates.concat(sellReserves.map(reserve => reserve.rate)) :
            result.rates.concat(sellReserves.map(reserve => reserve.rateNoFee));
        result.rates = result.rates.concat(precisionUnits);
        result.splitValuesBps = sellSplits.concat(BPS);
        result.isFeePaying = sellReserves.map(reserve => reserve.onChainType);
        result.isFeePaying = result.isFeePaying.concat(false);
    //ethToToken
    } else if (sellReserves.length == 0) {
        result.addresses = [zeroAddress];
        result.addresses = result.addresses.concat(buyReserves.map(reserve => reserve.address)); 
        result.ids = [NULL_ID];
        result.ids = result.ids.concat(buyReserves.map(reserve => reserve.reserveId));
        result.rates = [precisionUnits];
        result.rates = (buySplits.length > 1) ?
            result.rates.concat(buyReserves.map(reserve => reserve.rate)) :
            result.rates.concat(buyReserves.map(reserve => reserve.rateNoFee));
        result.splitValuesBps = [BPS];
        result.splitValuesBps = result.splitValuesBps.concat(buySplits);
        result.isFeePaying = [false];
        result.isFeePaying = result.isFeePaying.concat(buyReserves.map(reserve => reserve.onChainType));
    //tokenToToken
    } else {
        result.addresses = sellReserves.map(reserve => reserve.address);
        result.addresses = result.addresses.concat(buyReserves.map(reserve => reserve.address));
        result.ids = sellReserves.map(reserve => reserve.reserveId);
        result.ids = result.ids.concat(buyReserves.map(reserve => reserve.reserveId));
        result.rates = (sellSplits.length > 1) ? 
            result.rates.concat(sellReserves.map(reserve => reserve.rate)) :
            result.rates.concat(sellReserves.map(reserve => reserve.rateNoFee));
        result.rates = (buySplits.length > 1) ?
            result.rates.concat(buyReserves.map(reserve => reserve.rate)) :
            result.rates.concat(buyReserves.map(reserve => reserve.rateNoFee));
        result.splitValuesBps = sellSplits;
        result.splitValuesBps = result.splitValuesBps.concat(buySplits);
        result.isFeePaying = sellReserves.map(reserve => reserve.onChainType);
        result.isFeePaying = result.isFeePaying.concat(buyReserves.map(reserve => reserve.onChainType));
    }
    return result;
}

function compareResults(expectedTradeResult, expectedOutput, actualResult) {
    //compare expectedTradeResult
    Helper.assertEqual(expectedTradeResult.t2eNumReserves, actualResult.results[0], "t2eNumReserves not equal");
    Helper.assertEqual(expectedTradeResult.tradeWei, actualResult.results[1], "tradeWei not equal");
    Helper.assertEqual(expectedTradeResult.numFeePayingReserves, actualResult.results[2], "numFeePayingReserves not equal");
    Helper.assertEqual(expectedTradeResult.feePayingReservesBps, actualResult.results[3], "feePayingReservesBps not equal");
    Helper.assertEqual(expectedTradeResult.destAmountNoFee, actualResult.results[4], "destAmountNoFee not equal");
    Helper.assertEqual(expectedTradeResult.destAmountWithNetworkFee, actualResult.results[5], "actualDestAmount not equal");
    Helper.assertEqual(expectedTradeResult.actualDestAmount, actualResult.results[6], "destAmountWithNetworkFee not equal");

    let expected;
    let actual;

    //compare expectedReserves
    for (let i=0; i<actualResult.reserveAddresses.length; i++) {
        expected = expectedOutput.addresses[i];
        actual = actualResult.reserveAddresses[i];
        Helper.assertEqual(expected, actual, "reserve address not the same");
    }

    //compare expectedIds
    for (let i=0; i<actualResult.ids.length; i++) {
        expected = expectedOutput.ids[i];
        actual = actualResult.ids[i];
        Helper.assertEqual(expected, actual, "reserve id not the same");
    }

    //compare expectedRates
    for (let i=0; i<actualResult.rates.length; i++) {
        expected = expectedOutput.rates[i];
        actual = actualResult.rates[i];
        Helper.assertEqual(expected, actual, "reserve rate not the same");
    }

    //compare expectedSplitValuesBps
    for (let i=0; i<actualResult.splitValuesBps.length; i++) {
        expected = expectedOutput.splitValuesBps[i];
        actual = actualResult.splitValuesBps[i];
        Helper.assertEqual(expected, actual, "reserve rate not the same");
    }

    //compare expectedFeePaying
    for (let i=0; i<actualResult.isFeePaying.length; i++) {
        expected = expectedOutput.isFeePaying[i];
        actual = actualResult.isFeePaying[i];
        Helper.assertEqual(expected, actual, "reserve rate not the same");
    }
}

function printCalcRatesAmtsResult(tradeResult) {
    console.log(`t2eNumReserves: ${tradeResult[0].toString()}`);
    console.log(`tradeWei: ${tradeResult[1].toString()} (${tradeResult[1].div(precisionUnits)} ETH)`);
    console.log(`numFeePayingReserves: ${tradeResult[2].toString()}`);
    console.log(`feePayingReservesBps: ${tradeResult[3].toString()}`);
    console.log(`destAmountNoFee: ${tradeResult[4].toString()} (${tradeResult[4].div(precisionUnits)} ETH)`);
    console.log(`actualDestAmount: ${tradeResult[5].toString()} (${tradeResult[5].div(precisionUnits)} ETH)`);
    console.log(`destAmountWithNetworkFee: ${tradeResult[6].toString()} (${tradeResult[6].div(precisionUnits)} ETH)`);
}

function log(string) {
    console.log(string);
}
