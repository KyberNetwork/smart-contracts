const TestToken = artifacts.require("Token.sol");
const MockReserve = artifacts.require("MockReserve.sol");
const KyberMatchingEngine = artifacts.require("KyberMatchingEngine.sol");
const MaliciousKyberEngine = artifacts.require("MaliciousMatchingEngine.sol");
const RateHelper = artifacts.require("KyberRateHelper.sol");

const Helper = require("../helper.js");
const nwHelper = require("./networkHelper.js");

const BN = web3.utils.BN;
const { expectEvent, expectRevert } = require('@openzeppelin/test-helpers');
const {BPS, precisionUnits, ethDecimals, ethAddress, zeroAddress, emptyHint, zeroBN, MAX_QTY, MAX_RATE} = require("../helper.js");
const {NULL_ID, EMPTY_HINTTYPE, MASK_IN_HINTTYPE, MASK_OUT_HINTTYPE, SPLIT_HINTTYPE, ReserveType}  = require('./networkHelper.js');

//global variables
//////////////////
const negligibleRateDiffBps = new BN(5); //0.05% 
const minConversionRate = new BN(0);

let networkFeeArray = [new BN(0), new BN(250), new BN(400)];
let platformFeeArray = [new BN(0), new BN(250, new BN(400))];
let txResult;

let admin;
let operator;
let network;
let matchingEngine;
let rateHelper;
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

contract('KyberMatchingEngine', function(accounts) {
    before("one time global init", async() => {
        //init accounts
        user = accounts[0];
        admin = accounts[1];
        operator = accounts[2];
        network = accounts[3];
    });

    describe("test onlyAdmin and onlyNetwork permissions", async() => {
        before("deploy matchingEngine instance, 1 mock reserve and 1 mock token", async() => {
            matchingEngine = await KyberMatchingEngine.new(admin);
            token = await TestToken.new("test", "tst", 18);

            rateHelper = await RateHelper.new(admin);
            await rateHelper.setContracts(matchingEngine.address, accounts[9], {from: admin});

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
                matchingEngine.setNetworkContract(network, {from: user}),
                "ONLY_ADMIN"
            );

            await expectRevert(
                matchingEngine.setNetworkContract(network, {from: operator}),
                "ONLY_ADMIN"
            );

            await expectRevert(
                matchingEngine.setFeePayingPerReserveType(true, true, true, false, true, {from: operator}),
                "ONLY_ADMIN"
            );

            await expectRevert(
                matchingEngine.setFeePayingPerReserveType(true, true, true, false, true, {from: network}),
                "ONLY_ADMIN"
            );
        });

        it("should have admin set network contract", async() => {
            await matchingEngine.setNetworkContract(network, {from: admin});
            let result = await matchingEngine.networkContract();
            Helper.assertEqual(network, result, "network not set by admin");
        });

        it("should not have unauthorized personnel set negligble rate diff bps", async() => {
            await expectRevert(
                matchingEngine.setNegligbleRateDiffBps(negligibleRateDiffBps, {from: user}),
                "ONLY_NETWORK"
            );

            await expectRevert(
                matchingEngine.setNegligbleRateDiffBps(negligibleRateDiffBps, {from: operator}),
                "ONLY_NETWORK"
            );

            await expectRevert(
                matchingEngine.setNegligbleRateDiffBps(negligibleRateDiffBps, {from: admin}),
                "ONLY_NETWORK"
            );
        });

        it("should have network set negligble rate diff bps", async() => {
            await matchingEngine.setNegligbleRateDiffBps(negligibleRateDiffBps, {from: network});
            let result = await matchingEngine.negligibleRateDiffBps();
            Helper.assertEqual(negligibleRateDiffBps, result, "negligbleRateDiffInBps not set by network");
        });

        it("should not have unauthorized personnel add reserve", async() => {
            await expectRevert(
                matchingEngine.addReserve(reserve.address, reserve.reserveId, reserve.onChainType, {from: user}),
                "ONLY_NETWORK"
            );

            await expectRevert(
                matchingEngine.addReserve(reserve.address, reserve.reserveId, reserve.onChainType, {from: operator}),
                "ONLY_NETWORK"
            );

            await expectRevert(
                matchingEngine.addReserve(reserve.address, reserve.reserveId, reserve.onChainType, {from: admin}),
                "ONLY_NETWORK"
            );
        });

        it("should have network add reserve", async() => {
            await matchingEngine.setFeePayingPerReserveType(true, true, true, false, true, true, {from: admin});
            await matchingEngine.addReserve(reserve.address, reserve.reserveId, reserve.onChainType, {from: network});
            let reserveDetails = await matchingEngine.getReserveDetails(reserve.address);
            let reserveId = reserveDetails.reserveId;
            let reserveAddress = await matchingEngine.reserveIdToAddresses(reserve.reserveId, 0);
            Helper.assertEqual(reserve.reserveId, reserveId, "wrong address to ID");
            Helper.assertEqual(reserve.address, reserveAddress, "wrong ID to address");
        });

        it("should not have unauthorized personnel list token pair for reserve", async() => {
            await expectRevert(
                matchingEngine.listPairForReserve(reserve.address, token.address, true, true, true, {from: user}),
                "ONLY_NETWORK"
            );

            await expectRevert(
                matchingEngine.listPairForReserve(reserve.address, token.address, true, true, true, {from: operator}),
                "ONLY_NETWORK"
            );

            await expectRevert(
                matchingEngine.listPairForReserve(reserve.address, token.address, true, true, true, {from: admin}),
                "ONLY_NETWORK"
            );
        });

        it("should have network list pair for reserve", async() => {
            await matchingEngine.listPairForReserve(reserve.address, token.address, true, true, true, {from: network});
            let result = await matchingEngine.getReservesPerTokenSrc(token.address);
            Helper.assertEqual(result[0], reserve.address, "reserve should have supported token");
            result = await matchingEngine.getReservesPerTokenDest(token.address);
            Helper.assertEqual(result[0], reserve.address, "reserve should have supported token");
        });

        it("should not have unauthorized personnel remove reserve", async() => {
            await expectRevert(
                matchingEngine.removeReserve(reserve.address, {from: user}),
                "ONLY_NETWORK"
            );

            await expectRevert(
                matchingEngine.removeReserve(reserve.address, {from: operator}),
                "ONLY_NETWORK"
            );

            await expectRevert(
                matchingEngine.removeReserve(reserve.address, {from: admin}),
                "ONLY_NETWORK"
            );
        });

        it("should have network remove reserve", async() => {
            await matchingEngine.removeReserve(reserve.address, {from: network});
        });
    });

    describe("test contract event", async() => {
        before("deploy and setup matchingEngine instance", async() => {
            matchingEngine = await KyberMatchingEngine.new(admin);
            rateHelper = await RateHelper.new(admin);
            await rateHelper.setContracts(matchingEngine.address, accounts[9], {from: admin});
        });

        it("shoud test set network event", async() => {
            txResult = await matchingEngine.setNetworkContract(network, {from: admin});
            expectEvent(txResult, "NetworkContractUpdate", {
                newNetwork: network
            });
        });
    });

    describe("test setting contracts and params", async() => {
        before("deploy and setup matchingEngine instance", async() => {
            matchingEngine = await KyberMatchingEngine.new(admin);
        });

        it("should revert if negligbleRateDiffBps > BPS", async() => {
            await matchingEngine.setNetworkContract(network, {from: admin});
            await expectRevert(
                matchingEngine.setNegligbleRateDiffBps(BPS.add(new BN(1)), {from: network}),
                "rateDiffBps > BPS"
            );
        });

        it("should revert setting zero address for network", async() => {
            await expectRevert(
                matchingEngine.setNetworkContract(zeroAddress, {from: admin}),
                "network 0"
            );
        });
    });

    describe("test adding reserves", async() => {
        before("deploy and setup matchingEngine instance & 1 mock reserve", async() => {
            matchingEngine = await KyberMatchingEngine.new(admin);
            await matchingEngine.setNetworkContract(network, {from: admin});

            //init 1 mock reserve
            let result = await nwHelper.setupReserves(network, [], 1,0,0,0, accounts, admin, operator);
            reserveInstances = result.reserveInstances;
            numReserves = result.numAddedReserves * 1;
            for (const value of Object.values(reserveInstances)) {
                reserve = value;
            }
        });

        describe("test cases where reserve has never been added", async() => {
            it("should revert for zero reserve id", async() => {
                let zeroReserveId = "0x0";
                await expectRevert(
                    matchingEngine.addReserve(reserve.address, zeroReserveId, reserve.onChainType, {from: network}),
                    "reserveId = 0"
                );
            });
    
            it("should revert for NONE reserve type", async() => {
                await expectRevert(
                    matchingEngine.addReserve(reserve.address, reserve.reserveId, 0, {from: network}),
                    "bad type"
                );
            });
    
            it("should revert for LAST reserve type", async() => {
                await expectRevert(
                    matchingEngine.addReserve(reserve.address, reserve.reserveId, 0, {from: network}),
                    "bad type"
                );
            });
    
            it("should revert for valid reserve because fee paying data not set", async() => {
                await expectRevert(
                    matchingEngine.addReserve(reserve.address, reserve.reserveId, reserve.onChainType, {from: network}),
                    "Fee paying not set"
                );
            });    
        });

        describe("test cases for an already added reserve", async() => {
            before("add fee paying type and add reserve", async() => {
                await matchingEngine.setFeePayingPerReserveType(true, true, true, false, true, true, {from: admin});
                await matchingEngine.addReserve(reserve.address, reserve.reserveId, reserve.onChainType, {from: network});
            });

            it("should revert for adding an existing reserve", async() => {
                await expectRevert(
                    matchingEngine.addReserve(reserve.address, reserve.reserveId, reserve.onChainType, {from: network}),
                    "reserve has id"
                );
            });

            it("should revert for a new reserve with an already taken reserve id", async() => {
                let newReserve = await MockReserve.new();
                await expectRevert(
                    matchingEngine.addReserve(newReserve.address, reserve.reserveId, reserve.onChainType, {from: network}),
                    "reserveId taken"
                );
            });

            it("should be able to re-add a reserve after its removal", async() => {
                await matchingEngine.removeReserve(reserve.address, {from: network});
                await matchingEngine.addReserve(reserve.address, reserve.reserveId, reserve.onChainType, {from: network});
            });

            it("should be able to add a new reserve address for an existing id after removing an old one", async() => {
                let newReserve = await MockReserve.new();
                await matchingEngine.removeReserve(reserve.address, {from: network});
                await matchingEngine.addReserve(newReserve.address, reserve.reserveId, reserve.onChainType, {from: network});
                let actualNewReserveAddress = await matchingEngine.reserveIdToAddresses(reserve.reserveId, 0);
                let actualOldReserveAddress = await matchingEngine.reserveIdToAddresses(reserve.reserveId, 1);

                Helper.assertEqual(newReserve.address, actualNewReserveAddress, "new reserve address not equal to expected");
                Helper.assertEqual(reserve.address, actualOldReserveAddress, "old reserve address not equal to expected");
            })
        });
    });

    describe("test listing token pair and removing reserve", async() => {
        before("deploy and setup matchingEngine instance & add 1 mock reserve, & 1 mock token", async() => {
            matchingEngine = await KyberMatchingEngine.new(admin);
            await matchingEngine.setNetworkContract(network, {from: admin});

            //init 1 mock reserve
            let result = await nwHelper.setupReserves(network, [], 1,0,0,0, accounts, admin, operator);
            reserveInstances = result.reserveInstances;
            numReserves = result.numAddedReserves * 1;
            for (const value of Object.values(reserveInstances)) {
                reserve = value;
            }
            await matchingEngine.setFeePayingPerReserveType(true, true, true, false, true, true, {from: admin});
            await matchingEngine.addReserve(reserve.address, reserve.reserveId, reserve.onChainType, {from: network});

            //create token
            token = await TestToken.new("test", "tst", 18);
        });

        beforeEach("delist token pair on both sides", async() => {
            await matchingEngine.listPairForReserve(reserve.address, token.address, true, true, false, {from: network});
        });

        it("should revert when listing token for non-reserve", async() => {
            await expectRevert(
                matchingEngine.listPairForReserve(user, token.address, true, true, true, {from: network}),
                "reserve -> 0 reserveId"
           );
        });

        it("should revert when removing non-reserve", async() => {
            await expectRevert(
                matchingEngine.removeReserve(user, {from : network}),
                "reserve -> 0 reserveId"
           );
        });

        it("should have reserveId reset to zero after removal", async() => {
            await matchingEngine.removeReserve(reserve.address, {from: network});
            let result = await matchingEngine.getReserveDetails(reserve.address);
            Helper.assertEqual(result.reserveId, "0x0000000000000000", "reserve id was not reset to zero");

            //reset
            await matchingEngine.addReserve(reserve.address, reserve.reserveId, reserve.onChainType, {from: network});
        });

        it("should list T2E side only", async() => {
            await matchingEngine.listPairForReserve(reserve.address, token.address, true, false, true, {from: network});
            let result = await matchingEngine.getReservesPerTokenSrc(token.address);
            Helper.assertEqual(result.length, zeroBN, "E2T should not be listed");

            result = await matchingEngine.getReservesPerTokenDest(token.address);
            Helper.assertEqual(result[0], reserve.address, "T2E should be listed");
        });

        it("should list E2T side only", async() => {
            await matchingEngine.listPairForReserve(reserve.address, token.address, false, true, true, {from: network});
            let result = await matchingEngine.getReservesPerTokenSrc(token.address);
            Helper.assertEqual(result[0], reserve.address, "E2T should be listed");

            result = await matchingEngine.getReservesPerTokenDest(token.address);
            Helper.assertEqual(result.length, zeroBN, "T2E should not be listed");
        });

        it("should list both T2E and E2T", async() => {
            await matchingEngine.listPairForReserve(reserve.address, token.address, true, true, true, {from: network});
            let result = await matchingEngine.getReservesPerTokenSrc(token.address);
            Helper.assertEqual(result[0], reserve.address, "T2E should be listed");

            result = await matchingEngine.getReservesPerTokenDest(token.address);
            Helper.assertEqual(result[0], reserve.address, "E2T should be listed");
        });

        it("should delist T2E side only", async() => {
            await matchingEngine.listPairForReserve(reserve.address, token.address, true, true, true, {from: network});
            await matchingEngine.listPairForReserve(reserve.address, token.address, false, true, false, {from: network});
            let result = await matchingEngine.getReservesPerTokenSrc(token.address);
            Helper.assertEqual(result.length, zeroBN, "E2T should not be listed");

            result = await matchingEngine.getReservesPerTokenDest(token.address);
            Helper.assertEqual(result[0], reserve.address, "T2E should be listed");
        });

        it("should delist E2T side only", async() => {
            await matchingEngine.listPairForReserve(reserve.address, token.address, true, true, true, {from: network});
            await matchingEngine.listPairForReserve(reserve.address, token.address, true, false, false, {from: network});
            let result = await matchingEngine.getReservesPerTokenSrc(token.address);
            Helper.assertEqual(result[0], reserve.address, "E2T should be listed");

            result = await matchingEngine.getReservesPerTokenDest(token.address);
            Helper.assertEqual(result.length, zeroBN, "T2E should not be listed");
        });

        it("should delist both T2E and E2T", async() => {
            await matchingEngine.listPairForReserve(reserve.address, token.address, true, true, true, {from: network});
            await matchingEngine.listPairForReserve(reserve.address, token.address, true, true, false, {from: network});
            let result = await matchingEngine.getReservesPerTokenSrc(token.address);
            Helper.assertEqual(result.length, zeroBN, "E2T should not be listed");

            result = await matchingEngine.getReservesPerTokenDest(token.address);
            Helper.assertEqual(result.length, zeroBN, "T2E should not be listed");
        });

        it("should do nothing for listing twice", async() => {
            await matchingEngine.listPairForReserve(reserve.address, token.address, true, true, true, {from: network});
            await matchingEngine.listPairForReserve(reserve.address, token.address, true, true, true, {from: network});
            let result = await matchingEngine.getReservesPerTokenSrc(token.address);
            Helper.assertEqual(result[0], reserve.address, "E2T should be listed");

            result = await matchingEngine.getReservesPerTokenDest(token.address);
            Helper.assertEqual(result[0], reserve.address, "T2E should be listed");
        });
    });

    describe("test fee paying data per reserve", async() => {
        let token;
        let reserveInstances;
        let result;
        let totalReserveTypes = 6;

        before("setup matchingEngine instance reserve per each reserve type", async() => {
            matchingEngine = await KyberMatchingEngine.new(admin);
            await matchingEngine.setNetworkContract(network, {from: admin});
            await matchingEngine.setFeePayingPerReserveType(true, true, true, false, true, true, {from: admin});
            rateHelper = await RateHelper.new(admin);
            await rateHelper.setContracts(matchingEngine.address, accounts[9], {from: admin});

            //init token
            token = await TestToken.new("Token", "TOK", 18);
            
            result = await nwHelper.setupReserves(network, [token], totalReserveTypes, 0, 0, 0, accounts, admin, operator);
            reserveInstances = result.reserveInstances;
            
            //add reserves for all types.
            let type = 1;
            for (reserve of Object.values(reserveInstances)) {
                await matchingEngine.addReserve(reserve.address, reserve.reserveId, type, {from: network});
                type++;
            }
        });     
         
        it("get reserve details while modifying fee paying per type. see as expected", async() => {
            let pay = [];
            let numCombinations = totalReserveTypes ** 2;
            //generate different pay combinations
            for (let i = 0; i < numCombinations; i++) {
                pay = [];
                let j = i;
                for (let n = 1; j > 0; j = j >> 1, n = n * 2) {
                    pay.push(j % 2 == 1);
                }
                let originalResLength = result.length;
                //append the rest of pay array with false values
                for (let k = 0; k < totalReserveTypes - originalResLength; k++) {
                    pay = pay.concat([false]);
                }
                
                await matchingEngine.setFeePayingPerReserveType(pay[0], pay[1], pay[2], pay[3], pay[4], pay[5], {from: admin});
                let index = 0;
                for (reserve of Object.values(reserveInstances)) {
                    let details = await matchingEngine.getReserveDetails(reserve.address);
                    Helper.assertEqual(reserve.reserveId, details.reserveId)
                    Helper.assertEqual(index + 1, details.resType)
                    Helper.assertEqual(pay[index], details.isFeePaying);
                    ++index;
                }
            }
        });
    });
 
    describe("test RateHelper getRatesForToken", async() => {
        before("setup matchingEngine instance and 2 tokens", async() => {
            matchingEngine = await KyberMatchingEngine.new(admin);
            await matchingEngine.setNetworkContract(network, {from: admin});
            await matchingEngine.setFeePayingPerReserveType(true, true, true, false, true, true, {from: admin});
            rateHelper = await RateHelper.new(admin);
            await rateHelper.setContracts(matchingEngine.address, accounts[9], {from: admin});

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

                await matchingEngine.setFeePayingPerReserveType(true, true, true, true, true, true, {from: admin});

                //add reserves, list token pairs
                for (reserve of Object.values(reserveInstances)) {
                    await matchingEngine.addReserve(reserve.address, reserve.reserveId, reserve.onChainType, {from: network});
                    await matchingEngine.listPairForReserve(reserve.address, srcToken.address, true, true, true, {from: network});
                    await matchingEngine.listPairForReserve(reserve.address, destToken.address, true, true, true, {from: network});
                };
            });

            after("unlist and remove reserves", async() => {
                for (reserve of Object.values(reserveInstances)) {
                    await matchingEngine.listPairForReserve(reserve.address, srcToken.address, true, true, false, {from: network});
                    await matchingEngine.listPairForReserve(reserve.address, destToken.address, true, true, false, {from: network});
                    await matchingEngine.removeReserve(reserve.address, {from: network});
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
                    actualResult = await rateHelper.getRatesForTokenWithCustomFee(token.address, ethSrcQty, tokenQty, networkFeeBps);
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
                await matchingEngine.setFeePayingPerReserveType(false, false, false, false, false, false, {from: admin});

                //add reserves, list token pairs
                for (reserve of Object.values(reserveInstances)) {
                    await matchingEngine.addReserve(reserve.address, reserve.reserveId, reserve.onChainType, {from: network});
                    await matchingEngine.listPairForReserve(reserve.address, srcToken.address, true, true, true, {from: network});
                    await matchingEngine.listPairForReserve(reserve.address, destToken.address, true, true, true, {from: network});
                };
            });

            after("unlist and remove reserves", async() => {
                for (reserve of Object.values(reserveInstances)) {
                    await matchingEngine.listPairForReserve(reserve.address, srcToken.address, true, true, false, {from: network});
                    await matchingEngine.listPairForReserve(reserve.address, destToken.address, true, true, false, {from: network});
                    await matchingEngine.removeReserve(reserve.address, {from: network});
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
                    actualResult = await rateHelper.getRatesForTokenWithCustomFee(token.address, ethSrcQty, tokenQty, networkFeeBps);
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

                await matchingEngine.setFeePayingPerReserveType(true, true, true, true, true, true, {from: admin});

                //set zero rates
                for ([key, reserve] of Object.entries(reserveInstances)) {
                    await reserve.instance.setRate(srcToken.address, zeroBN, zeroBN);
                    await reserve.instance.setRate(destToken.address, zeroBN, zeroBN);
                }

                //add reserves, list token pairs
                for (reserve of Object.values(reserveInstances)) {
                    await matchingEngine.addReserve(reserve.address, reserve.reserveId, reserve.onChainType, {from: network});
                    await matchingEngine.listPairForReserve(reserve.address, srcToken.address, true, true, true, {from: network});
                    await matchingEngine.listPairForReserve(reserve.address, destToken.address, true, true, true, {from: network});
                };
            });

            after("unlist and remove reserves", async() => {
                for (reserve of Object.values(reserveInstances)) {
                    await matchingEngine.listPairForReserve(reserve.address, srcToken.address, true, true, false, {from: network});
                    await matchingEngine.listPairForReserve(reserve.address, destToken.address, true, true, false, {from: network});
                    await matchingEngine.removeReserve(reserve.address, {from: network});
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
                    actualResult = await rateHelper.getRatesForTokenWithCustomFee(token.address, ethSrcQty, tokenQty, networkFeeBps);
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
        before("setup matchingEngine instance and 2 tokens", async() => {
            matchingEngine = await KyberMatchingEngine.new(admin);
            await matchingEngine.setNetworkContract(network, {from: admin});
            await matchingEngine.setFeePayingPerReserveType(true, true, true, false, true, true, {from: admin});
            rateHelper = await RateHelper.new(admin);
            await rateHelper.setContracts(matchingEngine.address, accounts[9], {from: admin});

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

        describe("4 mock reserves, all feePaying by default", async() => {
            before("setup reserves", async() => {
                //init 4 mock reserves
                let result = await nwHelper.setupReserves(network, [srcToken, destToken], 4,0,0,0, accounts, admin, operator);
                reserveInstances = result.reserveInstances;
                numReserves = result.numAddedReserves * 1;

                await matchingEngine.setFeePayingPerReserveType(true, true, true, true, true, true, {from: admin});

                //add reserves, list token pairs
                for (reserve of Object.values(reserveInstances)) {
                    await matchingEngine.addReserve(reserve.address, reserve.reserveId, reserve.onChainType, {from: network});
                    await matchingEngine.listPairForReserve(reserve.address, srcToken.address, true, true, true, {from: network});
                    await matchingEngine.listPairForReserve(reserve.address, destToken.address, true, true, true, {from: network});
                };
            });

            after("unlist and remove reserves", async() => {
                for (reserve of Object.values(reserveInstances)) {
                    await matchingEngine.listPairForReserve(reserve.address, srcToken.address, true, true, false, {from: network});
                    await matchingEngine.listPairForReserve(reserve.address, destToken.address, true, true, false, {from: network});
                    await matchingEngine.removeReserve(reserve.address, {from: network});
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

            for (networkFee of networkFeeArray) {
                for (platformFee of platformFeeArray) {
                    let networkFeeBps = networkFee;
                    let platformFeeBps = platformFee;
                    it(`T2E, no hint, network fee ${networkFeeBps} bps, platform fee ${platformFeeBps} bps`, async() => {
                        info = [srcQty, networkFeeBps, platformFeeBps];
                        
                        reserveCandidates = await fetchReservesRatesFromRateHelper(matchingEngine, rateHelper, reserveInstances, srcToken.address, srcQty, 0, true);
                        bestReserve = await nwHelper.getBestReserveAndRate(reserveCandidates, srcToken.address, ethAddress, srcQty, networkFeeBps);
                        expectedTradeResult = getTradeResult(
                            srcDecimals, [bestReserve], [bestReserve.rateNoFee], [],
                            ethDecimals, [], [], [],
                            srcQty, networkFeeBps, platformFeeBps);
                        
                        expectedOutput = getExpectedOutput(
                            [bestReserve], [BPS],
                            [], []
                        );
                        
                        actualResult = await matchingEngine.calcRatesAndAmounts(srcToken.address, ethAddress, srcDecimals, ethDecimals, info, emptyHint);
                        compareResults(expectedTradeResult, expectedOutput, actualResult);
                    });

                    it(`E2T, no hint, network fee ${networkFeeBps} bps, platform fee ${platformFeeBps} bps`, async() => {
                        info = [ethSrcQty, networkFeeBps, platformFeeBps];
                        
                        reserveCandidates = await fetchReservesRatesFromRateHelper(matchingEngine, rateHelper, reserveInstances, destToken.address, ethSrcQty, 0, false);
                        bestReserve = await nwHelper.getBestReserveAndRate(reserveCandidates, ethAddress, destToken.address, ethSrcQty, networkFeeBps);
                        expectedTradeResult = getTradeResult(
                            ethDecimals, [], [], [],
                            destDecimals, [bestReserve], [bestReserve.rateNoFee], [],
                            ethSrcQty, networkFeeBps, platformFeeBps);
                        
                        expectedOutput = getExpectedOutput(
                            [], [],
                            [bestReserve], [BPS]
                        );
                        
                        actualResult = await matchingEngine.calcRatesAndAmounts(ethAddress, destToken.address, ethDecimals, destDecimals, info, emptyHint);
                        compareResults(expectedTradeResult, expectedOutput, actualResult);
                    });   

                    it(`T2T, no hint, network fee ${networkFeeBps} bps, platform fee ${platformFeeBps} bps`, async() => {
                        info = [srcQty, networkFeeBps, platformFeeBps];
                        
                        reserveCandidates = await fetchReservesRatesFromRateHelper(matchingEngine, rateHelper, reserveInstances, srcToken.address, srcQty, 0, true);
                        bestSellReserve = await nwHelper.getBestReserveAndRate(reserveCandidates, srcToken.address, ethAddress, srcQty, networkFeeBps);
                        reserveCandidates = await fetchReservesRatesFromRateHelper(matchingEngine, rateHelper, reserveInstances, destToken.address, ethSrcQty, 0, false);
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
                        
                        actualResult = await matchingEngine.calcRatesAndAmounts(srcToken.address, destToken.address, srcDecimals, destDecimals, info, emptyHint);
                        compareResults(expectedTradeResult, expectedOutput, actualResult);
                    });

                    it(`T2E, mask in hint, network fee ${networkFeeBps} bps, platform fee ${platformFeeBps} bps`, async() => {
                        numMaskedReserves = 2;
                        info = [srcQty, networkFeeBps, platformFeeBps];
                        
                        hintedReserves = await getHintedReserves(
                            matchingEngine, reserveInstances,
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
                        
                        actualResult = await matchingEngine.calcRatesAndAmounts(srcToken.address, ethAddress, srcDecimals, ethDecimals, info, hintedReserves.hint);
                        compareResults(expectedTradeResult, expectedOutput, actualResult);
                    });

                    it(`E2T, mask in hint, network fee ${networkFeeBps} bps, platform fee ${platformFeeBps} bps`, async() => {
                        numMaskedReserves = 2;
                        info = [ethSrcQty, networkFeeBps, platformFeeBps];
                        
                        hintedReserves = await getHintedReserves(
                            matchingEngine, reserveInstances,
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
                        
                        actualResult = await matchingEngine.calcRatesAndAmounts(ethAddress, destToken.address, ethDecimals, destDecimals, info, hintedReserves.hint);
                        compareResults(expectedTradeResult, expectedOutput, actualResult);
                    });

                    it(`T2T, mask in hint, network fee ${networkFeeBps} bps, platform fee ${platformFeeBps} bps`, async() => {
                        numMaskedReserves = 2;
                        info = [srcQty, networkFeeBps, platformFeeBps];
                        
                        hintedReserves = await getHintedReserves(
                            matchingEngine, reserveInstances,
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
                        
                        actualResult = await matchingEngine.calcRatesAndAmounts(srcToken.address, destToken.address, srcDecimals, destDecimals, info, hintedReserves.hint);
                        compareResults(expectedTradeResult, expectedOutput, actualResult);
                    });

                    it(`T2E, mask out hint, network fee ${networkFeeBps} bps, platform fee ${platformFeeBps} bps`, async() => {
                        numMaskedReserves = 2;
                        info = [srcQty, networkFeeBps, platformFeeBps];
                        
                        hintedReserves = await getHintedReserves(
                            matchingEngine, reserveInstances,
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
                        
                        actualResult = await matchingEngine.calcRatesAndAmounts(srcToken.address, ethAddress, srcDecimals, ethDecimals, info, hintedReserves.hint);
                        compareResults(expectedTradeResult, expectedOutput, actualResult);
                    });

                    it(`E2T, mask out hint, network fee ${networkFeeBps} bps, platform fee ${platformFeeBps} bps`, async() => {
                        numMaskedReserves = 2;
                        info = [ethSrcQty, networkFeeBps, platformFeeBps];
                        
                        hintedReserves = await getHintedReserves(
                            matchingEngine, reserveInstances,
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

                        actualResult = await matchingEngine.calcRatesAndAmounts(ethAddress, destToken.address, ethDecimals, destDecimals, info, hintedReserves.hint);
                        compareResults(expectedTradeResult, expectedOutput, actualResult);
                    });

                    it(`T2T, mask out hint, network fee ${networkFeeBps} bps, platform fee ${platformFeeBps} bps`, async() => {
                        numMaskedReserves = 2;
                        info = [srcQty, networkFeeBps, platformFeeBps];
                        
                        hintedReserves = await getHintedReserves(
                            matchingEngine, reserveInstances,
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
                        
                        actualResult = await matchingEngine.calcRatesAndAmounts(srcToken.address, destToken.address, srcDecimals, destDecimals, info, hintedReserves.hint);
                        compareResults(expectedTradeResult, expectedOutput, actualResult);
                    });

                    it(`T2E, split hint, network fee ${networkFeeBps} bps, platform fee ${platformFeeBps} bps`, async() => {
                        info = [srcQty, networkFeeBps, platformFeeBps];
                        
                        hintedReserves = await getHintedReserves(
                            matchingEngine, reserveInstances,
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

                        actualResult = await matchingEngine.calcRatesAndAmounts(srcToken.address, ethAddress, srcDecimals, ethDecimals, info, hintedReserves.hint);
                        compareResults(expectedTradeResult, expectedOutput, actualResult);
                    });

                    it(`E2T, split hint, network fee ${networkFeeBps} bps, platform fee ${platformFeeBps} bps`, async() => {
                        info = [ethSrcQty, networkFeeBps, platformFeeBps];
                        
                        hintedReserves = await getHintedReserves(
                            matchingEngine, reserveInstances,
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
                        
                        actualResult = await matchingEngine.calcRatesAndAmounts(ethAddress, destToken.address, ethDecimals, destDecimals, info, hintedReserves.hint);
                        compareResults(expectedTradeResult, expectedOutput, actualResult);
                    });

                    it(`T2T, split hint, network fee ${networkFeeBps} bps, platform fee ${platformFeeBps} bps`, async() => {
                        info = [srcQty, networkFeeBps, platformFeeBps];
                        
                        hintedReserves = await getHintedReserves(
                            matchingEngine, reserveInstances,
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
                        
                        actualResult = await matchingEngine.calcRatesAndAmounts(srcToken.address, destToken.address, srcDecimals, destDecimals, info, hintedReserves.hint);
                        compareResults(expectedTradeResult, expectedOutput, actualResult);
                    });

                    it(`T2T, no hint | mask in hint, network fee ${networkFeeBps} bps, platform fee ${platformFeeBps} bps`, async() => {
                        info = [srcQty, networkFeeBps, platformFeeBps];
                        
                        hintedReserves = await getHintedReserves(
                            matchingEngine, reserveInstances,
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
                        
                        actualResult = await matchingEngine.calcRatesAndAmounts(srcToken.address, destToken.address, srcDecimals, destDecimals, info, hintedReserves.hint);
                        compareResults(expectedTradeResult, expectedOutput, actualResult);
                    });

                    it(`T2T, no hint | mask out hint, network fee ${networkFeeBps} bps, platform fee ${platformFeeBps} bps`, async() => {
                        info = [srcQty, networkFeeBps, platformFeeBps];
                        
                        hintedReserves = await getHintedReserves(
                            matchingEngine, reserveInstances,
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
                        
                        actualResult = await matchingEngine.calcRatesAndAmounts(srcToken.address, destToken.address, srcDecimals, destDecimals, info, hintedReserves.hint);
                        compareResults(expectedTradeResult, expectedOutput, actualResult);
                    });

                    it(`T2T, no hint | split hint, network fee ${networkFeeBps} bps, platform fee ${platformFeeBps} bps`, async() => {
                        info = [srcQty, networkFeeBps, platformFeeBps];
                        
                        hintedReserves = await getHintedReserves(
                            matchingEngine, reserveInstances,
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
                        
                        actualResult = await matchingEngine.calcRatesAndAmounts(srcToken.address, destToken.address, srcDecimals, destDecimals, info, hintedReserves.hint);
                        compareResults(expectedTradeResult, expectedOutput, actualResult);
                    });

                    it(`T2T, mask in hint | no hint, network fee ${networkFeeBps} bps, platform fee ${platformFeeBps} bps`, async() => {
                        info = [srcQty, networkFeeBps, platformFeeBps];
                        
                        hintedReserves = await getHintedReserves(
                            matchingEngine, reserveInstances,
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
                        
                        actualResult = await matchingEngine.calcRatesAndAmounts(srcToken.address, destToken.address, srcDecimals, destDecimals, info, hintedReserves.hint);
                        compareResults(expectedTradeResult, expectedOutput, actualResult);
                    });

                    it(`T2T, mask in hint | mask out hint, network fee ${networkFeeBps} bps, platform fee ${platformFeeBps} bps`, async() => {
                        info = [srcQty, networkFeeBps, platformFeeBps];
                        
                        hintedReserves = await getHintedReserves(
                            matchingEngine, reserveInstances,
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
                        
                        actualResult = await matchingEngine.calcRatesAndAmounts(srcToken.address, destToken.address, srcDecimals, destDecimals, info, hintedReserves.hint);
                        compareResults(expectedTradeResult, expectedOutput, actualResult);
                    });

                    it(`T2T, mask in hint | split hint, network fee ${networkFeeBps} bps, platform fee ${platformFeeBps} bps`, async() => {
                        info = [srcQty, networkFeeBps, platformFeeBps];
                        
                        hintedReserves = await getHintedReserves(
                            matchingEngine, reserveInstances,
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
                        
                        actualResult = await matchingEngine.calcRatesAndAmounts(srcToken.address, destToken.address, srcDecimals, destDecimals, info, hintedReserves.hint);
                        compareResults(expectedTradeResult, expectedOutput, actualResult);
                    });

                    it(`T2T, mask out hint | no hint, network fee ${networkFeeBps} bps, platform fee ${platformFeeBps} bps`, async() => {
                        info = [srcQty, networkFeeBps, platformFeeBps];
                        
                        hintedReserves = await getHintedReserves(
                            matchingEngine, reserveInstances,
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
                        
                        actualResult = await matchingEngine.calcRatesAndAmounts(srcToken.address, destToken.address, srcDecimals, destDecimals, info, hintedReserves.hint);
                        compareResults(expectedTradeResult, expectedOutput, actualResult);
                    });

                    it(`T2T, mask out hint | mask in hint, network fee ${networkFeeBps} bps, platform fee ${platformFeeBps} bps`, async() => {
                        info = [srcQty, networkFeeBps, platformFeeBps];
                        
                        hintedReserves = await getHintedReserves(
                            matchingEngine, reserveInstances,
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
                        
                        actualResult = await matchingEngine.calcRatesAndAmounts(srcToken.address, destToken.address, srcDecimals, destDecimals, info, hintedReserves.hint);
                        compareResults(expectedTradeResult, expectedOutput, actualResult);
                    });

                    it(`T2T, mask out hint | split hint, network fee ${networkFeeBps} bps, platform fee ${platformFeeBps} bps`, async() => {
                        info = [srcQty, networkFeeBps, platformFeeBps];
                        
                        hintedReserves = await getHintedReserves(
                            matchingEngine, reserveInstances,
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
                        
                        actualResult = await matchingEngine.calcRatesAndAmounts(srcToken.address, destToken.address, srcDecimals, destDecimals, info, hintedReserves.hint);
                        compareResults(expectedTradeResult, expectedOutput, actualResult);
                    });

                    it(`T2T, split hint | no hint, network fee ${networkFeeBps} bps, platform fee ${platformFeeBps} bps`, async() => {
                        info = [srcQty, networkFeeBps, platformFeeBps];
                        
                        hintedReserves = await getHintedReserves(
                            matchingEngine, reserveInstances,
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
                        
                        actualResult = await matchingEngine.calcRatesAndAmounts(srcToken.address, destToken.address, srcDecimals, destDecimals, info, hintedReserves.hint);
                        compareResults(expectedTradeResult, expectedOutput, actualResult);
                    });

                    it(`T2T, split hint | mask in hint, network fee ${networkFeeBps} bps, platform fee ${platformFeeBps} bps`, async() => {
                        info = [srcQty, networkFeeBps, platformFeeBps];
                        
                        hintedReserves = await getHintedReserves(
                            matchingEngine, reserveInstances,
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
                        
                        actualResult = await matchingEngine.calcRatesAndAmounts(srcToken.address, destToken.address, srcDecimals, destDecimals, info, hintedReserves.hint);
                        compareResults(expectedTradeResult, expectedOutput, actualResult);
                    });

                    it(`T2T, split hint | mask out hint, network fee ${networkFeeBps} bps, platform fee ${platformFeeBps} bps`, async() => {
                        info = [srcQty, networkFeeBps, platformFeeBps];
                        
                        hintedReserves = await getHintedReserves(
                            matchingEngine, reserveInstances,
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
                        
                        actualResult = await matchingEngine.calcRatesAndAmounts(srcToken.address, destToken.address, srcDecimals, destDecimals, info, hintedReserves.hint);
                        compareResults(expectedTradeResult, expectedOutput, actualResult);
                    });
                }
            };

            describe(`test some trades with no fee paying reserve`, async() => {
                before("set reserves to non-fee paying", async() => {
                    await matchingEngine.setFeePayingPerReserveType(false, false, false, false, false, false, {from: admin});
                });

                after("reset to feePaying", async() => {
                    await matchingEngine.setFeePayingPerReserveType(true, true, true, true, true, true, {from: admin});
                });

                let networkFeeBps = zeroBN;
                for (platformFee of platformFeeArray) {
                    let platformFeeBps = platformFee;
                    it(`T2E, mask in hint, platform fee ${platformFeeBps} bps`, async() => {
                        numMaskedReserves = 2;
                        info = [srcQty, networkFeeBps, platformFeeBps];
                        
                        hintedReserves = await getHintedReserves(
                            matchingEngine, reserveInstances,
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
                        
                        actualResult = await matchingEngine.calcRatesAndAmounts(srcToken.address, ethAddress, srcDecimals, ethDecimals, info, hintedReserves.hint);
                        compareResults(expectedTradeResult, expectedOutput, actualResult);
                    });

                    it(`E2T, mask in hint, platform fee ${platformFeeBps} bps`, async() => {
                        numMaskedReserves = 2;
                        info = [ethSrcQty, networkFeeBps, platformFeeBps];
                        
                        hintedReserves = await getHintedReserves(
                            matchingEngine, reserveInstances,
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
                        
                        actualResult = await matchingEngine.calcRatesAndAmounts(ethAddress, destToken.address, ethDecimals, destDecimals, info, hintedReserves.hint);
                        compareResults(expectedTradeResult, expectedOutput, actualResult);
                    });

                    it(`T2T, mask in hint, platform fee ${platformFeeBps} bps`, async() => {
                        numMaskedReserves = 2;
                        info = [srcQty, networkFeeBps, platformFeeBps];
                        
                        hintedReserves = await getHintedReserves(
                            matchingEngine, reserveInstances,
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
                        
                        actualResult = await matchingEngine.calcRatesAndAmounts(srcToken.address, destToken.address, srcDecimals, destDecimals, info, hintedReserves.hint);
                        compareResults(expectedTradeResult, expectedOutput, actualResult);
                    });

                    it(`T2E, split hint, platform fee ${platformFeeBps} bps`, async() => {
                        info = [srcQty, networkFeeBps, platformFeeBps];
                        
                        hintedReserves = await getHintedReserves(
                            matchingEngine, reserveInstances,
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

                        actualResult = await matchingEngine.calcRatesAndAmounts(srcToken.address, ethAddress, srcDecimals, ethDecimals, info, hintedReserves.hint);
                        compareResults(expectedTradeResult, expectedOutput, actualResult);
                    });

                    it(`E2T, split hint, platform fee ${platformFeeBps} bps`, async() => {
                        info = [ethSrcQty, networkFeeBps, platformFeeBps];
                        
                        hintedReserves = await getHintedReserves(
                            matchingEngine, reserveInstances,
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
                        
                        actualResult = await matchingEngine.calcRatesAndAmounts(ethAddress, destToken.address, ethDecimals, destDecimals, info, hintedReserves.hint);
                        compareResults(expectedTradeResult, expectedOutput, actualResult);
                    });

                    it(`T2T, split hint, platform fee ${platformFeeBps} bps`, async() => {
                        info = [srcQty, networkFeeBps, platformFeeBps];
                        
                        hintedReserves = await getHintedReserves(
                            matchingEngine, reserveInstances,
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
                        
                        actualResult = await matchingEngine.calcRatesAndAmounts(srcToken.address, destToken.address, srcDecimals, destDecimals, info, hintedReserves.hint);
                        compareResults(expectedTradeResult, expectedOutput, actualResult);
                    });
                }
            });

            describe(`test revert if num mask out reserves > all reserves available`, async() => {
                it("T2E", async() => {
                    numMaskedReserves = 4;
                    info = [srcQty, zeroBN, zeroBN];

                    hintedReserves = await getHintedReserves(
                        matchingEngine, reserveInstances,
                        MASK_OUT_HINTTYPE, numMaskedReserves, [], srcQty,
                        undefined, 0, undefined, 0,
                        srcToken.address, ethAddress,
                        );
                    
                    //modify hint to have additional reserve for mask out
                    let tempHint = hintedReserves.hint;
                    hintedReserves.hint = 
                        tempHint.substring(0,4) //'0x' + opcode
                        + '05' //numReserves
                        + tempHint.substring(6,22) //first reserve ID
                        + tempHint.substring(6); //everything else

                    await expectRevert(
                        matchingEngine.calcRatesAndAmounts(srcToken.address, ethAddress, srcDecimals, ethDecimals, info, hintedReserves.hint),
                        "MASK_OUT_TOO_LONG"
                    );
                });

                it("E2T", async() => {
                    numMaskedReserves = 4;
                    info = [srcQty, zeroBN, zeroBN];

                    hintedReserves = await getHintedReserves(
                        matchingEngine, reserveInstances,
                        undefined, 0, undefined, 0,
                        MASK_OUT_HINTTYPE, numMaskedReserves, [], ethSrcQty,
                        ethAddress, destToken.address
                        );
                    
                    //modify hint to have additional reserve for mask out
                    let tempHint = hintedReserves.hint;
                    hintedReserves.hint = 
                        tempHint.substring(0,6) //'0x' + separator opcode + mask out opcode
                        + '05' //numReserves
                        + tempHint.substring(8,24) //first reserve ID
                        + tempHint.substring(8); //everything else

                    await expectRevert(
                        matchingEngine.calcRatesAndAmounts(ethAddress, destToken.address, ethDecimals, destDecimals, info, hintedReserves.hint),
                        "MASK_OUT_TOO_LONG"
                    );
                });

                it("T2T", async() => {
                    numMaskedReserves = 4;
                    info = [srcQty, zeroBN, zeroBN];

                    hintedReserves = await getHintedReserves(
                        matchingEngine, reserveInstances,
                        MASK_OUT_HINTTYPE, numMaskedReserves, [], srcQty,
                        MASK_OUT_HINTTYPE, numMaskedReserves, [], ethSrcQty,
                        srcToken.address, destToken.address
                        );
                    
                    //modify hint to have additional reserve for mask out
                    let tempHint = hintedReserves.hint;
                    hintedReserves.hint = 
                        tempHint.substring(0,4) //'0x' + opcode
                        + '05' //numReserves
                        + tempHint.substring(6,22) //first reserve ID
                        + tempHint.substring(6); //everything else
                    
                    await expectRevert(
                        matchingEngine.calcRatesAndAmounts(srcToken.address, destToken.address, srcDecimals, destDecimals, info, hintedReserves.hint),
                        "MASK_OUT_TOO_LONG"
                    );
                });
            });

            describe(`return zero rate and destAmounts if mask out all supporting reserves`, async() => {
                it("T2E", async() => {
                    numMaskedReserves = 4;
                    info = [srcQty, zeroBN, zeroBN];

                    hintedReserves = await getHintedReserves(
                        matchingEngine, reserveInstances,
                        MASK_OUT_HINTTYPE, numMaskedReserves, [], srcQty,
                        undefined, 0, undefined, 0,
                        srcToken.address, ethAddress,
                        );
                    
                    actualResult = await matchingEngine.calcRatesAndAmounts(srcToken.address, ethAddress, srcDecimals, ethDecimals, info, hintedReserves.hint);
                    assertZeroAmts(actualResult);
                });

                it("E2T", async() => {
                    numMaskedReserves = 4;
                    info = [srcQty, zeroBN, zeroBN];

                    hintedReserves = await getHintedReserves(
                        matchingEngine, reserveInstances,
                        undefined, 0, undefined, 0,
                        MASK_OUT_HINTTYPE, numMaskedReserves, [], ethSrcQty,
                        ethAddress, destToken.address
                        );
                    
                    actualResult = await matchingEngine.calcRatesAndAmounts(ethAddress, destToken.address, ethDecimals, destDecimals, info, hintedReserves.hint);
                    assertZeroAmts(actualResult);
                });
                
                it("T2T", async() => {
                    numMaskedReserves = 4;
                    info = [srcQty, zeroBN, zeroBN];

                    hintedReserves = await getHintedReserves(
                        matchingEngine, reserveInstances,
                        MASK_OUT_HINTTYPE, numMaskedReserves, [], srcQty,
                        MASK_OUT_HINTTYPE, numMaskedReserves, [], ethSrcQty,
                        srcToken.address, destToken.address
                        );
                    
                    actualResult = await matchingEngine.calcRatesAndAmounts(srcToken.address, destToken.address, srcDecimals, destDecimals, info, hintedReserves.hint);
                    assertZeroAmts(actualResult);
                });
            });

            it(`should return zero rate if hint is invalid`, async() => {
                info = [srcQty, zeroBN, zeroBN];
                let invalidHint = '0x78';
                actualResult = await matchingEngine.calcRatesAndAmounts(srcToken.address, destToken.address, srcDecimals, destDecimals, info, invalidHint);
                
                for (let i = 0; i < actualResult.results; i++) {
                    Helper.assertEqual(actualResult.results[i], zeroBN, "unexpected value");
                }
            });

            describe(`should return zero destAmounts if T2E reserves all return zero rate`, async() => {
                before("set all T2E reserves to zero", async() => {
                    let i = 0;
                    for (reserve of Object.values(reserveInstances)) {
                        let tokensPerEther = precisionUnits.mul(new BN((i + 1) * 10));
                        await reserve.instance.setRate(srcToken.address, tokensPerEther, zeroBN);
                        i++;
                    };
                });

                after("reset rates", async() => {
                    let i = 0;
                    for (reserve of Object.values(reserveInstances)) {
                        let tokensPerEther = precisionUnits.mul(new BN((i + 1) * 10));
                        let ethersPerToken = precisionUnits.div(new BN((i + 1) * 10));
                        await reserve.instance.setRate(srcToken.address, tokensPerEther, ethersPerToken);
                        i++;
                    }
                });  

                it("T2E, mask out hint", async() => {
                    numMaskedReserves = 2;
                    info = [srcQty, zeroBN, zeroBN];

                    hintedReserves = await getHintedReserves(
                        matchingEngine, reserveInstances,
                        MASK_OUT_HINTTYPE, numMaskedReserves, [], srcQty,
                        undefined, 0, undefined, 0,
                        srcToken.address, ethAddress,
                        );
                    
                    actualResult = await matchingEngine.calcRatesAndAmounts(srcToken.address, ethAddress, srcDecimals, ethDecimals, info, hintedReserves.hint);
                    assertZeroAmts(actualResult);
                });
                
                it("T2T, mask out hint", async() => {
                    numMaskedReserves = 2;
                    info = [srcQty, zeroBN, zeroBN];
                    hintedReserves = await getHintedReserves(
                        matchingEngine, reserveInstances,
                        MASK_OUT_HINTTYPE, numMaskedReserves, [], srcQty,
                        MASK_OUT_HINTTYPE, numMaskedReserves, [], ethSrcQty,
                        srcToken.address, destToken.address
                        );
                    
                    actualResult = await matchingEngine.calcRatesAndAmounts(srcToken.address, destToken.address, srcDecimals, destDecimals, info, hintedReserves.hint);
                    assertZeroAmts(actualResult);
                });

                it(`T2E, split hint`, async() => {
                    info = [srcQty, zeroBN, zeroBN];

                    hintedReserves = await getHintedReserves(
                        matchingEngine, reserveInstances,
                        SPLIT_HINTTYPE, undefined, undefined, srcQty,
                        undefined, 0, undefined, 0,
                        srcToken.address, ethAddress
                        );

                    actualResult = await matchingEngine.calcRatesAndAmounts(srcToken.address, ethAddress, srcDecimals, ethDecimals, info, hintedReserves.hint);
                    assertZeroAmts(actualResult);
                });

                it(`T2T, split hint`, async() => {
                    info = [srcQty, zeroBN, zeroBN];
                    
                    hintedReserves = await getHintedReserves(
                        matchingEngine, reserveInstances,
                        SPLIT_HINTTYPE, undefined, undefined, srcQty,
                        SPLIT_HINTTYPE, undefined, undefined, ethSrcQty,
                        srcToken.address, destToken.address
                        );
                    
                    actualResult = await matchingEngine.calcRatesAndAmounts(srcToken.address, destToken.address, srcDecimals, destDecimals, info, hintedReserves.hint);
                    assertZeroAmts(actualResult);
                });          
            });

            describe(`should return zero destAmounts if E2T reserves all return zero rate`, async() => {
                before("set all E2T reserves to zero", async() => {
                    let i = 0;
                    for (reserve of Object.values(reserveInstances)) {
                        let ethersPerToken = precisionUnits.div(new BN((i + 1) * 10));
                        await reserve.instance.setRate(destToken.address, zeroBN, ethersPerToken);
                        i++;
                    };
                });

                it("E2T, mask out hint", async() => {
                    numMaskedReserves = 2;
                    info = [srcQty, zeroBN, zeroBN];

                    hintedReserves = await getHintedReserves(
                        matchingEngine, reserveInstances,
                        undefined, 0, undefined, 0,
                        MASK_OUT_HINTTYPE, numMaskedReserves, [], ethSrcQty,
                        ethAddress, destToken.address
                        );
                    
                    actualResult = await matchingEngine.calcRatesAndAmounts(ethAddress, destToken.address, ethDecimals, destDecimals, info, hintedReserves.hint);
                    assertZeroAmts(actualResult);
                });
                
                it("T2T, mask out hint", async() => {
                    numMaskedReserves = 2;
                    info = [srcQty, zeroBN, zeroBN];
                    hintedReserves = await getHintedReserves(
                        matchingEngine, reserveInstances,
                        MASK_OUT_HINTTYPE, numMaskedReserves, [], srcQty,
                        MASK_OUT_HINTTYPE, numMaskedReserves, [], ethSrcQty,
                        srcToken.address, destToken.address
                        );
                    
                    actualResult = await matchingEngine.calcRatesAndAmounts(srcToken.address, destToken.address, srcDecimals, destDecimals, info, hintedReserves.hint);
                    assertZeroAmts(actualResult);
                });

                it(`E2T, split hint`, async() => {
                    info = [ethSrcQty, zeroBN, zeroBN];

                    hintedReserves = await getHintedReserves(
                        matchingEngine, reserveInstances,
                        undefined, 0, undefined, 0,
                        SPLIT_HINTTYPE, undefined, undefined, ethSrcQty,
                        ethAddress, destToken.address
                        );
                    
                    actualResult = await matchingEngine.calcRatesAndAmounts(ethAddress, destToken.address, ethDecimals, destDecimals, info, hintedReserves.hint);
                    assertZeroAmts(actualResult);
                });
                
                it(`T2T, split hint`, async() => {
                    info = [srcQty, zeroBN, zeroBN];
                    
                    hintedReserves = await getHintedReserves(
                        matchingEngine, reserveInstances,
                        SPLIT_HINTTYPE, undefined, undefined, srcQty,
                        SPLIT_HINTTYPE, undefined, undefined, ethSrcQty,
                        srcToken.address, destToken.address
                        );
                    
                    actualResult = await matchingEngine.calcRatesAndAmounts(srcToken.address, destToken.address, srcDecimals, destDecimals, info, hintedReserves.hint);
                    assertZeroAmts(actualResult);
                }); 

                after("reset rates", async() => {
                    let i = 0;
                    for (reserve of Object.values(reserveInstances)) {
                        let tokensPerEther = precisionUnits.mul(new BN((i + 1) * 10));
                        let ethersPerToken = precisionUnits.div(new BN((i + 1) * 10));
                        await reserve.instance.setRate(srcToken.address, tokensPerEther, ethersPerToken);
                        i++;
                    }
                }); 
            });

            describe(`should return zero destAmounts if one T2E reserve returns zero rate for split trade`, async() => {
                before("set one T2E reserve rate to zero", async() => {
                    let reserve = (Object.values(reserveInstances))[0];
                    let tokensPerEther = precisionUnits.mul(new BN(10));
                    await reserve.instance.setRate(srcToken.address, tokensPerEther, zeroBN);
                });

                after("reset reserve rate", async() => {
                    let reserve = (Object.values(reserveInstances))[0];
                    let tokensPerEther = precisionUnits.mul(new BN(10));
                    let ethersPerToken = precisionUnits.div(new BN(10));
                    await reserve.instance.setRate(srcToken.address, tokensPerEther, ethersPerToken);
                });

                it(`T2E, split hint`, async() => {
                    info = [srcQty, zeroBN, zeroBN];

                    hintedReserves = await getHintedReserves(
                        matchingEngine, reserveInstances,
                        SPLIT_HINTTYPE, undefined, undefined, srcQty,
                        undefined, 0, undefined, 0,
                        srcToken.address, ethAddress
                        );

                    actualResult = await matchingEngine.calcRatesAndAmounts(srcToken.address, ethAddress, srcDecimals, ethDecimals, info, hintedReserves.hint);
                    assertZeroAmts(actualResult);
                });

                it(`T2T, split hint`, async() => {
                    info = [srcQty, zeroBN, zeroBN];
                    
                    hintedReserves = await getHintedReserves(
                        matchingEngine, reserveInstances,
                        SPLIT_HINTTYPE, undefined, undefined, srcQty,
                        SPLIT_HINTTYPE, undefined, undefined, ethSrcQty,
                        srcToken.address, destToken.address
                        );
                    
                    actualResult = await matchingEngine.calcRatesAndAmounts(srcToken.address, destToken.address, srcDecimals, destDecimals, info, hintedReserves.hint);
                    assertZeroAmts(actualResult);
                });
            });

            describe(`should return zero destAmounts if one E2T reserve returns zero rate for split trade`, async() => {
                before("set one E2T reserve rate to zero", async() => {
                    let reserve = (Object.values(reserveInstances))[0];
                    let ethersPerToken = precisionUnits.div(new BN(10));
                    await reserve.instance.setRate(destToken.address, zeroBN, ethersPerToken);
                });

                it(`E2T, split hint`, async() => {
                    info = [ethSrcQty, zeroBN, zeroBN];

                    hintedReserves = await getHintedReserves(
                        matchingEngine, reserveInstances,
                        undefined, 0, undefined, 0,
                        SPLIT_HINTTYPE, undefined, undefined, ethSrcQty,
                        ethAddress, destToken.address
                        );
                    
                    actualResult = await matchingEngine.calcRatesAndAmounts(ethAddress, destToken.address, ethDecimals, destDecimals, info, hintedReserves.hint);
                    assertZeroAmts(actualResult);
                });

                it(`T2T, split hint`, async() => {
                    info = [srcQty, zeroBN, zeroBN];
                    
                    hintedReserves = await getHintedReserves(
                        matchingEngine, reserveInstances,
                        SPLIT_HINTTYPE, undefined, undefined, srcQty,
                        SPLIT_HINTTYPE, undefined, undefined, ethSrcQty,
                        srcToken.address, destToken.address
                        );
                    
                    actualResult = await matchingEngine.calcRatesAndAmounts(srcToken.address, destToken.address, srcDecimals, destDecimals, info, hintedReserves.hint);
                    assertZeroAmts(actualResult);
                });

                after("reset reserve rate", async() => {
                    let reserve = (Object.values(reserveInstances))[0];
                    let tokensPerEther = precisionUnits.mul(new BN(10));
                    let ethersPerToken = precisionUnits.div(new BN(10));
                    await reserve.instance.setRate(srcToken.address, tokensPerEther, ethersPerToken);
                });
            });

            describe(`should pseudo-randomly select reserve if reserve rates are close together in searchBestRate`, async() => {
                before("set high negligbleRateDiffInBps, all reserve rates to be within range", async() => {
                    //set to 3%
                    await matchingEngine.setNegligbleRateDiffBps(new BN(300), {from: network});
                    let i = 0;
                    
                    for (reserve of Object.values(reserveInstances)) {
                        let tokensPerEther = precisionUnits.add(new BN(i * 10000));
                        let ethersPerToken = precisionUnits.sub(new BN((100 - i) * 10000));
                        await reserve.instance.setRate(srcToken.address, tokensPerEther, ethersPerToken);
                        await reserve.instance.setRate(destToken.address, tokensPerEther, ethersPerToken);
                        i++;
                    };
                });

                it("T2E, no hint", async() => {
                    let info = [srcQty, zeroBN, zeroBN];
                    let allReserves = [];
                    // run 20 times
                    for (let i = 0; i < 20; i++) {
                        actualResult = await matchingEngine.calcRatesAndAmounts(srcToken.address, ethAddress, srcDecimals, ethDecimals, info, emptyHint);
                        for (let j = 0; j < actualResult.ids.length; j++) {
                            if ((!(actualResult.ids[j] in allReserves)) && (actualResult.ids[j] != '0x0000000000000000')) {
                                allReserves = allReserves.concat(actualResult.ids[j]);
                            }
                        }
                        await Helper.increaseBlockNumberBySendingEther(accounts[9], accounts[9], 3);
                    }
                    Helper.assertGreater(allReserves.length, new BN(1), "searchBestRate only selected 1 reserve");
                });

                it("E2T, no hint", async() => {
                    let info = [ethSrcQty, zeroBN, zeroBN];
                    let allReserves = [];
                    // run 20 times
                    for (let i = 0; i < 20; i++) {
                        actualResult = await matchingEngine.calcRatesAndAmounts(ethAddress, destToken.address, ethDecimals, destDecimals, info, emptyHint);
                        for (let j = 0; j < actualResult.ids.length; j++) {
                            if ((!(actualResult.ids[j] in allReserves)) && (actualResult.ids[j] != '0x0000000000000000')) {
                                allReserves = allReserves.concat(actualResult.ids[j]);
                            }
                        }
                        await Helper.increaseBlockNumberBySendingEther(accounts[9], accounts[9], 3);
                    }
                    Helper.assertGreater(allReserves.length, new BN(1), "searchBestRate only selected 1 reserve");
                });

                after("reset rates and negligbleRateDiffBps", async() => {
                    await matchingEngine.setNegligbleRateDiffBps(negligibleRateDiffBps, {from: network});
                    let i = 0;
                    for (reserve of Object.values(reserveInstances)) {
                        let tokensPerEther = precisionUnits.mul(new BN((i + 1) * 10));
                        let ethersPerToken = precisionUnits.div(new BN((i + 1) * 10));
                        await reserve.instance.setRate(srcToken.address, tokensPerEther, ethersPerToken);
                        await reserve.instance.setRate(destToken.address, tokensPerEther, ethersPerToken);
                        i++;
                    }
                });
            });

            describe("test fees close to zero / BPS", async() => {
                describe("T2E and E2T", async() => {
                    //(networkFeeBps, platformFeeBps)
                    let feeConfigurations = [
                        [BPS.div(new BN(2)).sub(new BN(1)), zeroBN], // 9999, 0
                        [zeroBN, BPS.sub(new BN(1))], // 0, 9999
                        [new BN(2500), new BN(4999)], // 2500, 4999
                        [new BN(4999), new BN(1)], // 4999, 1
                        [new BN(1), new BN(1)] // 1, 1
                    ];

                    for (const feeConfiguration of feeConfigurations) {
                        let networkFeeBps = feeConfiguration[0];
                        let platformFeeBps = feeConfiguration[1];

                        it(`T2E, mask out hint, network fee ${networkFeeBps} bps, platform fee ${platformFeeBps} bps`, async() => {
                            numMaskedReserves = 2;
                            info = [srcQty, networkFeeBps, platformFeeBps];
                            
                            hintedReserves = await getHintedReserves(
                                matchingEngine, reserveInstances,
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
                            
                            actualResult = await matchingEngine.calcRatesAndAmounts(srcToken.address, ethAddress, srcDecimals, ethDecimals, info, hintedReserves.hint);
                            compareResults(expectedTradeResult, expectedOutput, actualResult);
                        });
    
                        it(`E2T, mask out hint, network fee ${networkFeeBps} bps, platform fee ${platformFeeBps} bps`, async() => {
                            numMaskedReserves = 2;
                            info = [ethSrcQty, networkFeeBps, platformFeeBps];
                            
                            hintedReserves = await getHintedReserves(
                                matchingEngine, reserveInstances,
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
    
                            actualResult = await matchingEngine.calcRatesAndAmounts(ethAddress, destToken.address, ethDecimals, destDecimals, info, hintedReserves.hint);
                            compareResults(expectedTradeResult, expectedOutput, actualResult);
                        });

                        it(`T2E, split hint, network fee ${networkFeeBps} bps, platform fee ${platformFeeBps} bps`, async() => {
                            info = [srcQty, networkFeeBps, platformFeeBps];
                            
                            hintedReserves = await getHintedReserves(
                                matchingEngine, reserveInstances,
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
    
                            actualResult = await matchingEngine.calcRatesAndAmounts(srcToken.address, ethAddress, srcDecimals, ethDecimals, info, hintedReserves.hint);
                            compareResults(expectedTradeResult, expectedOutput, actualResult);
                        });
    
                        it(`E2T, split hint, network fee ${networkFeeBps} bps, platform fee ${platformFeeBps} bps`, async() => {
                            info = [ethSrcQty, networkFeeBps, platformFeeBps];
                            
                            hintedReserves = await getHintedReserves(
                                matchingEngine, reserveInstances,
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
                            
                            actualResult = await matchingEngine.calcRatesAndAmounts(ethAddress, destToken.address, ethDecimals, destDecimals, info, hintedReserves.hint);
                            compareResults(expectedTradeResult, expectedOutput, actualResult);
                        });
                    }
                });

                describe("T2T", async() => {
                    //(networkFeeBps, platformFeeBps)
                    let feeConfigurations = [
                        [new BN(4999), new BN(1)], // 2 * 4999, 1
                        [zeroBN, BPS.sub(new BN(1))], // 0, 9999
                        [new BN(2500), new BN(4999)], // 2 * 2500, 4999
                        [new BN(1), new BN(1)] // 1, 1
                    ];

                    for (const feeConfiguration of feeConfigurations) {
                        let networkFeeBps = feeConfiguration[0];
                        let platformFeeBps = feeConfiguration[1];

                        it(`T2T, mask out hint, network fee ${networkFeeBps} bps, platform fee ${platformFeeBps} bps`, async() => {
                            numMaskedReserves = 2;
                            info = [srcQty, networkFeeBps, platformFeeBps];
                            
                            hintedReserves = await getHintedReserves(
                                matchingEngine, reserveInstances,
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
                            
                            actualResult = await matchingEngine.calcRatesAndAmounts(srcToken.address, destToken.address, srcDecimals, destDecimals, info, hintedReserves.hint);
                            compareResults(expectedTradeResult, expectedOutput, actualResult);
                        });

                        it(`T2T, split hint, network fee ${networkFeeBps} bps, platform fee ${platformFeeBps} bps`, async() => {
                            info = [srcQty, networkFeeBps, platformFeeBps];
                            
                            hintedReserves = await getHintedReserves(
                                matchingEngine, reserveInstances,
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
                            
                            actualResult = await matchingEngine.calcRatesAndAmounts(srcToken.address, destToken.address, srcDecimals, destDecimals, info, hintedReserves.hint);
                            compareResults(expectedTradeResult, expectedOutput, actualResult);
                        });
                    }
                });
            });

            describe("test fees > BPS", async() => {
                let maxNum = (new BN(2).pow(new BN(256))).sub(new BN(1));
                describe("T2E and E2T", async() => {
                    //(networkFeeBps, platformFeeBps)
                    //Note: if networkFee = BPS, destAmount is zero, so it is "valid"
                    let feeConfigurations = [
                        [BPS.sub(new BN(1)), BPS.sub(new BN(1)), "networkFee high"], // 9999, 9999
                        [BPS.div(new BN(2)).sub(new BN(1)), new BN(2), "fees high"], // 4999, 2
                        [BPS.div(new BN(2)).add(new BN(1)), zeroBN, "networkFee high"], // 5001, 0
                        [zeroBN, BPS.add(new BN(1)), "platformFee high"], // 0, 10001
                        [new BN(2), BPS.sub(new BN(1)), "fees high"], // 2, 9999
                        [new BN(4999), new BN(5001), "fees high"], // 4999, 5001
                        [new BN(5001), new BN(5000), "networkFee high"], // 5001, 5000
                        [maxNum, new BN(2), "networkFee high"], // overflow
                        [new BN(2), maxNum, "platformFee high"], // overflow
                        [maxNum.div(new BN(2)), maxNum.div(new BN(2)).add(new BN(3)), "platformFee high"] // overflow
                    ];

                    before("setup badMatchingEngine to cover unreachable line", async() => {
                        badMatchingEngine = await MaliciousKyberEngine.new(admin);
                        await badMatchingEngine.setNetworkContract(network, {from: admin});
                        await badMatchingEngine.setFeePayingPerReserveType(true, true, true, false, true, true, {from: admin});

                        //add reserves, list token pairs
                        for (reserve of Object.values(reserveInstances)) {
                            await badMatchingEngine.addReserve(reserve.address, reserve.reserveId, reserve.onChainType, {from: network});
                            await badMatchingEngine.listPairForReserve(reserve.address, srcToken.address, true, true, true, {from: network});
                            await badMatchingEngine.listPairForReserve(reserve.address, destToken.address, true, true, true, {from: network});
                        };
                    });

                    for (const feeConfiguration of feeConfigurations) {
                        let networkFeeBps = feeConfiguration[0];
                        let platformFeeBps = feeConfiguration[1];
                        let revertMsg = feeConfiguration[2];
    
                        it(`T2E, mask in hint, network fee ${networkFeeBps} bps, platform fee ${platformFeeBps} bps`, async() => {
                            numMaskedReserves = 2;
                            info = [srcQty, networkFeeBps, platformFeeBps];
                            
                            hintedReserves = await getHintedReserves(
                                matchingEngine, reserveInstances,
                                MASK_IN_HINTTYPE, numMaskedReserves, [], srcQty,
                                undefined, 0, undefined, 0,
                                srcToken.address, ethAddress
                                );
                            
                            await expectRevert(
                                matchingEngine.calcRatesAndAmounts(srcToken.address, ethAddress, srcDecimals, ethDecimals, info, hintedReserves.hint),
                                revertMsg
                            );
                        });

                        it(`E2T, mask in hint, network fee ${networkFeeBps} bps, platform fee ${platformFeeBps} bps`, async() => {
                            numMaskedReserves = 2;
                            info = [ethSrcQty, networkFeeBps, platformFeeBps];
                        
                            hintedReserves = await getHintedReserves(
                                matchingEngine, reserveInstances,
                                undefined, 0, undefined, 0,
                                MASK_IN_HINTTYPE, numMaskedReserves, [], ethSrcQty,
                                ethAddress, destToken.address
                                );
                            
                            await expectRevert(
                                matchingEngine.calcRatesAndAmounts(ethAddress, destToken.address, ethDecimals, destDecimals, info, hintedReserves.hint),
                                revertMsg
                            );

                            await expectRevert(
                                badMatchingEngine.calcRatesAndAmounts(ethAddress, destToken.address, ethDecimals, destDecimals, info, hintedReserves.hint),
                                revertMsg
                            );
                        });

                        it(`T2E, split hint, network fee ${networkFeeBps} bps, platform fee ${platformFeeBps} bps`, async() => {
                            info = [srcQty, networkFeeBps, platformFeeBps];
                    
                            hintedReserves = await getHintedReserves(
                                matchingEngine, reserveInstances,
                                SPLIT_HINTTYPE, undefined, undefined, srcQty,
                                undefined, 0, undefined, 0,
                                srcToken.address, ethAddress
                                );

                            await expectRevert(
                                matchingEngine.calcRatesAndAmounts(srcToken.address, ethAddress, srcDecimals, ethDecimals, info, hintedReserves.hint),
                                revertMsg
                            );
                        });

                        it(`E2T, split hint, network fee ${networkFeeBps} bps, platform fee ${platformFeeBps} bps`, async() => {
                            info = [ethSrcQty, networkFeeBps, platformFeeBps];
                            
                            hintedReserves = await getHintedReserves(
                                matchingEngine, reserveInstances,
                                undefined, 0, undefined, 0,
                                SPLIT_HINTTYPE, undefined, undefined, ethSrcQty,
                                ethAddress, destToken.address
                                );
                            
                            await expectRevert(
                                matchingEngine.calcRatesAndAmounts(ethAddress, destToken.address, ethDecimals, destDecimals, info, hintedReserves.hint),
                                revertMsg
                            );
                        });
                    }
                });

                describe("T2T", async() => {
                    //(networkFeeBps, platformFeeBps)
                    let halfMaxNum = maxNum.div(new BN(2));
                    let feeConfigurations = [
                        [BPS.sub(new BN(1)), BPS.sub(new BN(1)), "networkFee high"], // 9999, 9999
                        [BPS.sub(new BN(1)), new BN(2), "networkFee high"], // 9999, 2
                        [new BN(1), BPS.sub(new BN(1)), "fees high"], // 2 * 1, 9999
                        [BPS.add(new BN(1)), zeroBN, "networkFee high"], // 10001, 0
                        [zeroBN, BPS.add(new BN(1)), "platformFee high"], // 0, 10001
                        [new BN(5000), new BN(1), "networkFee high"], // 2 * 5000 + 1
                        [new BN(2500), new BN(5001), "fees high"], // 2 * 2500 + 5001
                        [maxNum, maxNum, "platformFee high"], // overflow
                        [halfMaxNum, maxNum, "platformFee high"], // overflow
                        [halfMaxNum, new BN(2), "networkFee high"], // overflow
                        [new BN(1), maxNum, "platformFee high"] // overflow
                    ];

                    for (const feeConfiguration of feeConfigurations) {
                        let networkFeeBps = feeConfiguration[0];
                        let platformFeeBps = feeConfiguration[1];
                        let revertMsg = feeConfiguration[2];

                        it(`T2T, mask in hint, network fee ${networkFeeBps} bps, platform fee ${platformFeeBps} bps`, async() => {
                            numMaskedReserves = 2;
                            info = [srcQty, networkFeeBps, platformFeeBps];
                            
                            hintedReserves = await getHintedReserves(
                                matchingEngine, reserveInstances,
                                MASK_IN_HINTTYPE, numMaskedReserves, [], srcQty,
                                MASK_IN_HINTTYPE, numMaskedReserves, [], ethSrcQty,
                                srcToken.address, destToken.address
                                );
                            
                            await expectRevert(
                                matchingEngine.calcRatesAndAmounts(srcToken.address, destToken.address, srcDecimals, destDecimals, info, hintedReserves.hint),
                                revertMsg
                            );
                        });

                        it(`T2T, split hint, network fee ${networkFeeBps}, platform fee ${platformFeeBps} bps`, async() => {
                            info = [srcQty, networkFeeBps, platformFeeBps];
                            
                            hintedReserves = await getHintedReserves(
                                matchingEngine, reserveInstances,
                                SPLIT_HINTTYPE, undefined, undefined, srcQty,
                                SPLIT_HINTTYPE, undefined, undefined, ethSrcQty,
                                srcToken.address, destToken.address
                                );
                            
                            await expectRevert(
                                matchingEngine.calcRatesAndAmounts(srcToken.address, destToken.address, srcDecimals, destDecimals, info, hintedReserves.hint),
                                revertMsg
                            );
                        });
                    }
                });
            });

        });
    });

    describe("test calcRatesAndAmounts very small and very big numbers", async() => {
        before("setup matchingEngine instance, 2 tokens, 2 mock reserves", async() => {
            matchingEngine = await KyberMatchingEngine.new(admin);
            await matchingEngine.setNetworkContract(network, {from: admin});
            await matchingEngine.setFeePayingPerReserveType(true, true, true, false, true, true, {from: admin});
            rateHelper = await RateHelper.new(admin);
            await rateHelper.setContracts(matchingEngine.address, accounts[9], {from: admin});

            //init 2 tokens, max diff decimals against ETH
            srcDecimals = new BN(0);
            destDecimals = new BN(18);
            srcToken = await TestToken.new("srcToken", "SRC", srcDecimals);
            destToken = await TestToken.new("destToken", "DEST", destDecimals);
            
            //setup 2 mock reserves
            let result = await nwHelper.setupReserves(network, [srcToken, destToken], 2,0,0,0, accounts, admin, operator);
            reserveInstances = result.reserveInstances;
            numReserves = result.numAddedReserves * 1;

            await matchingEngine.setFeePayingPerReserveType(true, true, true, true, true, true, {from: admin});

            //add reserves, list token pairs
            for (reserve of Object.values(reserveInstances)) {
                await matchingEngine.addReserve(reserve.address, reserve.reserveId, reserve.onChainType, {from: network});
                await matchingEngine.listPairForReserve(reserve.address, srcToken.address, true, true, true, {from: network});
                await matchingEngine.listPairForReserve(reserve.address, destToken.address, true, true, true, {from: network});
            };
        });

        describe("test with exceeding srcQty", async() => {
            before("set srcQty > MAX_QTY", async() => {
                srcQty = MAX_QTY.add(new BN(1));
                info = [srcQty, zeroBN, zeroBN];
            });

            beforeEach("reset expected rate variables", async() => {
                expectedReserves = [];
                expectedIds = [];
                expectedRates = [];
                expectedSplitValuesBps = [];
                expectedFeePaying = [];
            });

            it(`should revert for T2E, mask out hint`, async() => {
                numMaskedReserves = 1;
                hintedReserves = await getHintedReserves(
                    matchingEngine, reserveInstances,
                    MASK_OUT_HINTTYPE, numMaskedReserves, [], srcQty,
                    undefined, 0, undefined, 0,
                    srcToken.address, ethAddress
                );
                await expectRevert(
                    matchingEngine.calcRatesAndAmounts(srcToken.address, ethAddress, srcDecimals, ethDecimals, info, hintedReserves.hint),
                    "srcQty > MAX_QTY"
                );
            });

            it(`should revert for E2T, mask out hint`, async() => {
                numMaskedReserves = 1;
                hintedReserves = await getHintedReserves(
                    matchingEngine, reserveInstances,
                    undefined, 0, undefined, 0,
                    MASK_OUT_HINTTYPE, numMaskedReserves, [], ethSrcQty,
                    ethAddress, destToken.address
                    );
                await expectRevert(
                    matchingEngine.calcRatesAndAmounts(ethAddress, destToken.address, ethDecimals, destDecimals, info, hintedReserves.hint),
                    "srcQty > MAX_QTY"
                );
            });

            it(`should revert for T2T, mask out hint`, async() => {
                numMaskedReserves = 1;
                hintedReserves = await getHintedReserves(
                    matchingEngine, reserveInstances,
                    MASK_OUT_HINTTYPE, numMaskedReserves, [], srcQty,
                    MASK_OUT_HINTTYPE, numMaskedReserves, [], ethSrcQty,
                    srcToken.address, destToken.address
                    );
                await expectRevert(
                    matchingEngine.calcRatesAndAmounts(srcToken.address, destToken.address, srcDecimals, destDecimals, info, hintedReserves.hint),
                    "srcQty > MAX_QTY"
                );
            });

            it(`should revert for T2E, split hint`, async() => {
                numMaskedReserves = 1;
                hintedReserves = await getHintedReserves(
                    matchingEngine, reserveInstances,
                    SPLIT_HINTTYPE, undefined, undefined, srcQty,
                    undefined, 0, undefined, 0,
                    srcToken.address, ethAddress
                    );
                await expectRevert(
                    matchingEngine.calcRatesAndAmounts(srcToken.address, ethAddress, srcDecimals, ethDecimals, info, hintedReserves.hint),
                    "srcQty > MAX_QTY"
                );
            });

            it(`should revert for E2T, split hint`, async() => {
                numMaskedReserves = 1;
                hintedReserves = await getHintedReserves(
                    matchingEngine, reserveInstances,
                    undefined, 0, undefined, 0,
                    SPLIT_HINTTYPE, undefined, undefined, ethSrcQty,
                    ethAddress, destToken.address
                    );
                await expectRevert(
                    matchingEngine.calcRatesAndAmounts(ethAddress, destToken.address, ethDecimals, destDecimals, info, hintedReserves.hint),
                    "srcQty > MAX_QTY"
                );
            });

            it(`should revert for T2T, split hint`, async() => {
                numMaskedReserves = 1;
                hintedReserves = await getHintedReserves(
                    matchingEngine, reserveInstances,
                    SPLIT_HINTTYPE, undefined, undefined, srcQty,
                    SPLIT_HINTTYPE, undefined, undefined, ethSrcQty,
                    srcToken.address, destToken.address
                    );
                await expectRevert(
                    matchingEngine.calcRatesAndAmounts(srcToken.address, destToken.address, srcDecimals, destDecimals, info, hintedReserves.hint),
                    "srcQty > MAX_QTY"
                );
            });
        });

        describe("test with max allowable qty, different reserve rates", async() => {
            before("set srcQty = MAX_QTY.div(MAX_RATE), zero network fee and platform fee", async() => {
                srcQty = MAX_QTY.div(MAX_RATE);
                ethSrcQty = MAX_QTY.div(MAX_RATE);
                networkFeeBps = zeroBN;
                platformFeeBps = zeroBN;
                info = [srcQty, networkFeeBps, platformFeeBps];
            });

            beforeEach("reset expected rate variables", async() => {
                expectedReserves = [];
                expectedIds = [];
                expectedRates = [];
                expectedSplitValuesBps = [];
                expectedFeePaying = [];
            });

            let ratesSettingsArray = ['default', 'low', 'max', 'highT2ElowE2T', 'lowT2EhighE2T'];
            for (rateSettings of ratesSettingsArray) {
                let rateSetting = rateSettings;

                it(`should calcRatesAmts for T2E, mask out hint, ${rateSetting} reserve rates`, async() => {
                    await setReserveRates(rateSetting);
                    numMaskedReserves = 1;
                    hintedReserves = await getHintedReserves(
                        matchingEngine, reserveInstances,
                        MASK_OUT_HINTTYPE, numMaskedReserves, [], srcQty,
                        undefined, 0, undefined, 0,
                        srcToken.address, ethAddress
                    );
                    
                    bestReserve = await nwHelper.getBestReserveAndRate(hintedReserves.reservesT2E.reservesForFetchRate, srcToken.address, ethAddress, srcQty, zeroBN);
                    expectedTradeResult = getTradeResult(
                        srcDecimals, [bestReserve], [bestReserve.rateNoFee], [],
                        ethDecimals, [], [], [],
                        srcQty, networkFeeBps, platformFeeBps);
                    
                    expectedOutput = getExpectedOutput(
                        [bestReserve], [BPS],
                        [], []
                    );
                    
                    actualResult = await matchingEngine.calcRatesAndAmounts(srcToken.address, ethAddress, srcDecimals, ethDecimals, info, hintedReserves.hint);
                    compareResults(expectedTradeResult, expectedOutput, actualResult);
                });
    
                it(`should calcRatesAmts for E2T, mask out hint, ${rateSetting} reserve rates`, async() => {
                    await setReserveRates(rateSetting);
                    numMaskedReserves = 1;
                    hintedReserves = await getHintedReserves(
                        matchingEngine, reserveInstances,
                        undefined, 0, undefined, 0,
                        MASK_OUT_HINTTYPE, numMaskedReserves, [], srcQty,
                        ethAddress, destToken.address
                        );
                    
                    bestReserve = await nwHelper.getBestReserveAndRate(hintedReserves.reservesE2T.reservesForFetchRate, ethAddress, destToken.address, srcQty, networkFeeBps);
                    expectedTradeResult = getTradeResult(
                        ethDecimals, [], [], [],
                        destDecimals, [bestReserve], [bestReserve.rateNoFee], [],
                        srcQty, networkFeeBps, platformFeeBps);
    
                    expectedOutput = getExpectedOutput(
                        [], [],
                        [bestReserve], [BPS]
                    );
    
                    actualResult = await matchingEngine.calcRatesAndAmounts(ethAddress, destToken.address, ethDecimals, destDecimals, info, hintedReserves.hint);
                    compareResults(expectedTradeResult, expectedOutput, actualResult);
                });
    
                it(`should calcRatesAmts for T2T, mask out hint, ${rateSetting} reserve rates`, async() => {
                    await setReserveRates(rateSetting);
                    numMaskedReserves = 1;
                    hintedReserves = await getHintedReserves(
                        matchingEngine, reserveInstances,
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
                    
                    actualResult = await matchingEngine.calcRatesAndAmounts(srcToken.address, destToken.address, srcDecimals, destDecimals, info, hintedReserves.hint);
                    compareResults(expectedTradeResult, expectedOutput, actualResult);
                });
    
                it(`should calcRatesAmts for T2E, split hint, ${rateSetting} reserve rates`, async() => {
                    await setReserveRates(rateSetting);
                    hintedReserves = await getHintedReserves(
                        matchingEngine, reserveInstances,
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
    
                    actualResult = await matchingEngine.calcRatesAndAmounts(srcToken.address, ethAddress, srcDecimals, ethDecimals, info, hintedReserves.hint);
                    compareResults(expectedTradeResult, expectedOutput, actualResult);
                });
    
                it(`should calcRatesAmts for E2T, split hint, ${rateSetting} reserve rates`, async() => {
                    await setReserveRates(rateSetting);
                    hintedReserves = await getHintedReserves(
                        matchingEngine, reserveInstances,
                        undefined, 0, undefined, 0,
                        SPLIT_HINTTYPE, undefined, undefined, srcQty,
                        ethAddress, destToken.address
                        );
                    
                    reserveRates = hintedReserves.reservesE2T.reservesForFetchRate.map(reserve => reserve.rate);
                    expectedTradeResult = getTradeResult(
                        ethDecimals, [], [], [],
                        destDecimals, hintedReserves.reservesE2T.reservesForFetchRate, reserveRates, hintedReserves.reservesE2T.splits,
                        srcQty, networkFeeBps, platformFeeBps);
                    
                    expectedOutput = getExpectedOutput(
                        [], [],
                        hintedReserves.reservesE2T.reservesForFetchRate, hintedReserves.reservesE2T.splits,
                    );
                    
                    actualResult = await matchingEngine.calcRatesAndAmounts(ethAddress, destToken.address, ethDecimals, destDecimals, info, hintedReserves.hint);
                    compareResults(expectedTradeResult, expectedOutput, actualResult);
                });
    
                if (rateSetting == 'max') {
                    //expect revert!
                    it(`should revert for T2T, split hint, max reserve rates (destAmt > MAX_QTY) in calcRateFromQty`, async() => {
                        await setReserveRates(rateSetting);
                        hintedReserves = await getHintedReserves(
                            matchingEngine, reserveInstances,
                            SPLIT_HINTTYPE, undefined, undefined, srcQty,
                            SPLIT_HINTTYPE, undefined, undefined, srcQty,
                            srcToken.address, destToken.address
                            );
                        
                        await expectRevert(
                            matchingEngine.calcRatesAndAmounts(srcToken.address, destToken.address, srcDecimals, destDecimals, info, hintedReserves.hint),
                            "destAmount > MAX_QTY"
                        );
                    });
                } else {
                    it(`should calcRatesAmts for T2T, split hint, ${rateSetting} reserve rates`, async() => {
                        await setReserveRates(rateSetting);
                        hintedReserves = await getHintedReserves(
                            matchingEngine, reserveInstances,
                            SPLIT_HINTTYPE, undefined, undefined, srcQty,
                            SPLIT_HINTTYPE, undefined, undefined, srcQty,
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
                        
                        actualResult = await matchingEngine.calcRatesAndAmounts(srcToken.address, destToken.address, srcDecimals, destDecimals, info, hintedReserves.hint);
                        compareResults(expectedTradeResult, expectedOutput, actualResult);
                    });
                }
            }
        });

        describe("test with small srcQty, different reserve rates", async() => {
            before("set srcQty = 1, zero network fee and platform fee", async() => {
                srcQty = new BN(1);
                networkFeeBps = zeroBN;
                platformFeeBps = zeroBN;
                info = [srcQty, networkFeeBps, platformFeeBps];
            });

            beforeEach("reset expected rate variables", async() => {
                expectedReserves = [];
                expectedIds = [];
                expectedRates = [];
                expectedSplitValuesBps = [];
                expectedFeePaying = [];
            });

            let ratesSettingsArray = ['default', 'low', 'max', 'highT2ElowE2T', 'lowT2EhighE2T'];
            for (rateSettings of ratesSettingsArray) {
                let rateSetting = rateSettings;

                it(`should calcRatesAmts for T2E, mask out hint, ${rateSetting} reserve rates`, async() => {
                    await setReserveRates(rateSetting);
                    numMaskedReserves = 1;
                    hintedReserves = await getHintedReserves(
                        matchingEngine, reserveInstances,
                        MASK_OUT_HINTTYPE, numMaskedReserves, [], srcQty,
                        undefined, 0, undefined, 0,
                        srcToken.address, ethAddress
                    );
                    
                    bestReserve = await nwHelper.getBestReserveAndRate(hintedReserves.reservesT2E.reservesForFetchRate, srcToken.address, ethAddress, srcQty, zeroBN);
                    expectedTradeResult = getTradeResult(
                        srcDecimals, [bestReserve], [bestReserve.rateNoFee], [],
                        ethDecimals, [], [], [],
                        srcQty, networkFeeBps, platformFeeBps);
                    
                    expectedOutput = getExpectedOutput(
                        [bestReserve], [BPS],
                        [], []
                    );
                    
                    actualResult = await matchingEngine.calcRatesAndAmounts(srcToken.address, ethAddress, srcDecimals, ethDecimals, info, hintedReserves.hint);
                    compareResults(expectedTradeResult, expectedOutput, actualResult);
                });
    
                it(`should calcRatesAmts for E2T, mask out hint, ${rateSetting} reserve rates`, async() => {
                    await setReserveRates(rateSetting);
                    numMaskedReserves = 1;
                    hintedReserves = await getHintedReserves(
                        matchingEngine, reserveInstances,
                        undefined, 0, undefined, 0,
                        MASK_OUT_HINTTYPE, numMaskedReserves, [], srcQty,
                        ethAddress, destToken.address
                        );
                    
                    bestReserve = await nwHelper.getBestReserveAndRate(hintedReserves.reservesE2T.reservesForFetchRate, ethAddress, destToken.address, srcQty, networkFeeBps);
                    expectedTradeResult = getTradeResult(
                        ethDecimals, [], [], [],
                        destDecimals, [bestReserve], [bestReserve.rateNoFee], [],
                        srcQty, networkFeeBps, platformFeeBps);
    
                    expectedOutput = getExpectedOutput(
                        [], [],
                        [bestReserve], [BPS]
                    );
    
                    actualResult = await matchingEngine.calcRatesAndAmounts(ethAddress, destToken.address, ethDecimals, destDecimals, info, hintedReserves.hint);
                    compareResults(expectedTradeResult, expectedOutput, actualResult);
                });
    
                it(`should calcRatesAmts for T2T, mask out hint, ${rateSetting} reserve rates`, async() => {
                    await setReserveRates(rateSetting);
                    numMaskedReserves = 1;
                    hintedReserves = await getHintedReserves(
                        matchingEngine, reserveInstances,
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
                    
                    actualResult = await matchingEngine.calcRatesAndAmounts(srcToken.address, destToken.address, srcDecimals, destDecimals, info, hintedReserves.hint);
                    compareResults(expectedTradeResult, expectedOutput, actualResult);
                });
    
                it(`should calcRatesAmts for T2E, split hint, ${rateSetting} reserve rates`, async() => {
                    await setReserveRates(rateSetting);
                    hintedReserves = await getHintedReserves(
                        matchingEngine, reserveInstances,
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
    
                    actualResult = await matchingEngine.calcRatesAndAmounts(srcToken.address, ethAddress, srcDecimals, ethDecimals, info, hintedReserves.hint);
                    compareResults(expectedTradeResult, expectedOutput, actualResult);
                });
    
                it(`should calcRatesAmts for E2T, split hint, ${rateSetting} reserve rates`, async() => {
                    await setReserveRates(rateSetting);
                    hintedReserves = await getHintedReserves(
                        matchingEngine, reserveInstances,
                        undefined, 0, undefined, 0,
                        SPLIT_HINTTYPE, undefined, undefined, srcQty,
                        ethAddress, destToken.address
                        );
                    
                    reserveRates = hintedReserves.reservesE2T.reservesForFetchRate.map(reserve => reserve.rate);
                    expectedTradeResult = getTradeResult(
                        ethDecimals, [], [], [],
                        destDecimals, hintedReserves.reservesE2T.reservesForFetchRate, reserveRates, hintedReserves.reservesE2T.splits,
                        srcQty, networkFeeBps, platformFeeBps);
                    
                    expectedOutput = getExpectedOutput(
                        [], [],
                        hintedReserves.reservesE2T.reservesForFetchRate, hintedReserves.reservesE2T.splits,
                    );
                    
                    actualResult = await matchingEngine.calcRatesAndAmounts(ethAddress, destToken.address, ethDecimals, destDecimals, info, hintedReserves.hint);
                    compareResults(expectedTradeResult, expectedOutput, actualResult);
                });
    
                if (rateSetting == 'max') {
                    //expect revert!
                    it(`should revert for T2T, split hint, max reserve rates (destAmt > MAX_QTY) in calcRateFromQty`, async() => {
                        await setReserveRates(rateSetting);
                        hintedReserves = await getHintedReserves(
                            matchingEngine, reserveInstances,
                            SPLIT_HINTTYPE, undefined, undefined, srcQty,
                            SPLIT_HINTTYPE, undefined, undefined, srcQty,
                            srcToken.address, destToken.address
                            );
                        
                        await expectRevert(
                            matchingEngine.calcRatesAndAmounts(srcToken.address, destToken.address, srcDecimals, destDecimals, info, hintedReserves.hint),
                            "destAmount > MAX_QTY"
                        );
                    });
                } else {
                    it(`should calcRatesAmts for T2T, split hint, ${rateSetting} reserve rates`, async() => {
                        await setReserveRates(rateSetting);
                        hintedReserves = await getHintedReserves(
                            matchingEngine, reserveInstances,
                            SPLIT_HINTTYPE, undefined, undefined, srcQty,
                            SPLIT_HINTTYPE, undefined, undefined, srcQty,
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
                        
                        actualResult = await matchingEngine.calcRatesAndAmounts(srcToken.address, destToken.address, srcDecimals, destDecimals, info, hintedReserves.hint);
                        compareResults(expectedTradeResult, expectedOutput, actualResult);
                    });
                }
            }
        });

        describe("test with MAX_QTY, different reserve rates", async() => {
            before("set srcQty = MAX_QTY, zero network fee and platform fee", async() => {
                srcQty = MAX_QTY;
                networkFeeBps = zeroBN;
                platformFeeBps = zeroBN;
                info = [srcQty, networkFeeBps, platformFeeBps];
            });

            beforeEach("reset expected rate variables", async() => {
                expectedReserves = [];
                expectedIds = [];
                expectedRates = [];
                expectedSplitValuesBps = [];
                expectedFeePaying = [];
            });

            describe("default reserve rates", async() => {
                it(`should calcRatesAmts for T2E, mask out hint`, async() => {
                    numMaskedReserves = 1;
                    hintedReserves = await getHintedReserves(
                        matchingEngine, reserveInstances,
                        MASK_OUT_HINTTYPE, numMaskedReserves, [], srcQty,
                        undefined, 0, undefined, 0,
                        srcToken.address, ethAddress
                    );
                    
                    bestReserve = await nwHelper.getBestReserveAndRate(hintedReserves.reservesT2E.reservesForFetchRate, srcToken.address, ethAddress, srcQty, zeroBN);
                    expectedTradeResult = getTradeResult(
                        srcDecimals, [bestReserve], [bestReserve.rateNoFee], [],
                        ethDecimals, [], [], [],
                        srcQty, networkFeeBps, platformFeeBps);
                    
                    expectedOutput = getExpectedOutput(
                        [bestReserve], [BPS],
                        [], []
                    );
                    
                    actualResult = await matchingEngine.calcRatesAndAmounts(srcToken.address, ethAddress, srcDecimals, ethDecimals, info, hintedReserves.hint);
                    compareResults(expectedTradeResult, expectedOutput, actualResult);
                });

                it(`should calcRatesAmts for E2T, mask out hint`, async() => {
                    numMaskedReserves = 1;
                    hintedReserves = await getHintedReserves(
                        matchingEngine, reserveInstances,
                        undefined, 0, undefined, 0,
                        MASK_OUT_HINTTYPE, numMaskedReserves, [], srcQty,
                        ethAddress, destToken.address
                        );
                    
                    bestReserve = await nwHelper.getBestReserveAndRate(hintedReserves.reservesE2T.reservesForFetchRate, ethAddress, destToken.address, srcQty, networkFeeBps);
                    expectedTradeResult = getTradeResult(
                        ethDecimals, [], [], [],
                        destDecimals, [bestReserve], [bestReserve.rateNoFee], [],
                        srcQty, networkFeeBps, platformFeeBps);
    
                    expectedOutput = getExpectedOutput(
                        [], [],
                        [bestReserve], [BPS]
                    );
    
                    actualResult = await matchingEngine.calcRatesAndAmounts(ethAddress, destToken.address, ethDecimals, destDecimals, info, hintedReserves.hint);
                    compareResults(expectedTradeResult, expectedOutput, actualResult);
                });
    
                it(`should calcRatesAmts for T2T, mask out hint`, async() => {
                    numMaskedReserves = 1;
                    hintedReserves = await getHintedReserves(
                        matchingEngine, reserveInstances,
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
                    
                    actualResult = await matchingEngine.calcRatesAndAmounts(srcToken.address, destToken.address, srcDecimals, destDecimals, info, hintedReserves.hint);
                    compareResults(expectedTradeResult, expectedOutput, actualResult);
                });
    
                it(`should calcRatesAmts for T2E, split hint`, async() => {
                    hintedReserves = await getHintedReserves(
                        matchingEngine, reserveInstances,
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
    
                    actualResult = await matchingEngine.calcRatesAndAmounts(srcToken.address, ethAddress, srcDecimals, ethDecimals, info, hintedReserves.hint);
                    compareResults(expectedTradeResult, expectedOutput, actualResult);
                });
                
                it("should revert for E2T, split hint, (destAmt > MAX_QTY) in calcRateFromQty", async() => {
                    hintedReserves = await getHintedReserves(
                        matchingEngine, reserveInstances,
                        undefined, 0, undefined, 0,
                        SPLIT_HINTTYPE, undefined, undefined, srcQty,
                        ethAddress, destToken.address
                        );
                    
                    await expectRevert(
                        matchingEngine.calcRatesAndAmounts(ethAddress, destToken.address, ethDecimals, destDecimals, info, hintedReserves.hint),
                        "destAmount > MAX_QTY"
                    );
                });

                it("should revert for T2T, split hint, (destAmt > MAX_QTY) in calcRateFromQty", async() => {
                    hintedReserves = await getHintedReserves(
                        matchingEngine, reserveInstances,
                        SPLIT_HINTTYPE, undefined, undefined, srcQty,
                        SPLIT_HINTTYPE, undefined, undefined, srcQty,
                        srcToken.address, destToken.address
                        );

                    await expectRevert(
                        matchingEngine.calcRatesAndAmounts(srcToken.address, destToken.address, srcDecimals, destDecimals, info, hintedReserves.hint),
                        "destAmount > MAX_QTY"
                    );
                });
            });

            describe("low reserve rates", async() => {
                before("set low reserve rates", async() => {
                    await setReserveRates('low');
                });

                it(`should calcRatesAmts for T2E, mask out hint`, async() => {
                    numMaskedReserves = 1;
                    hintedReserves = await getHintedReserves(
                        matchingEngine, reserveInstances,
                        MASK_OUT_HINTTYPE, numMaskedReserves, [], srcQty,
                        undefined, 0, undefined, 0,
                        srcToken.address, ethAddress
                    );
                    
                    bestReserve = await nwHelper.getBestReserveAndRate(hintedReserves.reservesT2E.reservesForFetchRate, srcToken.address, ethAddress, srcQty, zeroBN);
                    expectedTradeResult = getTradeResult(
                        srcDecimals, [bestReserve], [bestReserve.rateNoFee], [],
                        ethDecimals, [], [], [],
                        srcQty, networkFeeBps, platformFeeBps);
                    
                    expectedOutput = getExpectedOutput(
                        [bestReserve], [BPS],
                        [], []
                    );
                    
                    actualResult = await matchingEngine.calcRatesAndAmounts(srcToken.address, ethAddress, srcDecimals, ethDecimals, info, hintedReserves.hint);
                    compareResults(expectedTradeResult, expectedOutput, actualResult);
                });
    
                it(`should calcRatesAmts for E2T, mask out hint`, async() => {
                    numMaskedReserves = 1;
                    hintedReserves = await getHintedReserves(
                        matchingEngine, reserveInstances,
                        undefined, 0, undefined, 0,
                        MASK_OUT_HINTTYPE, numMaskedReserves, [], srcQty,
                        ethAddress, destToken.address
                        );
                    
                    bestReserve = await nwHelper.getBestReserveAndRate(hintedReserves.reservesE2T.reservesForFetchRate, ethAddress, destToken.address, srcQty, networkFeeBps);
                    expectedTradeResult = getTradeResult(
                        ethDecimals, [], [], [],
                        destDecimals, [bestReserve], [bestReserve.rateNoFee], [],
                        srcQty, networkFeeBps, platformFeeBps);
    
                    expectedOutput = getExpectedOutput(
                        [], [],
                        [bestReserve], [BPS]
                    );
    
                    actualResult = await matchingEngine.calcRatesAndAmounts(ethAddress, destToken.address, ethDecimals, destDecimals, info, hintedReserves.hint);
                    compareResults(expectedTradeResult, expectedOutput, actualResult);
                });
    
                it(`should calcRatesAmts for T2T, mask out hint`, async() => {
                    numMaskedReserves = 1;
                    hintedReserves = await getHintedReserves(
                        matchingEngine, reserveInstances,
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
                    
                    actualResult = await matchingEngine.calcRatesAndAmounts(srcToken.address, destToken.address, srcDecimals, destDecimals, info, hintedReserves.hint);
                    compareResults(expectedTradeResult, expectedOutput, actualResult);
                });
    
                it(`should calcRatesAmts for T2E, split hint`, async() => {
                    hintedReserves = await getHintedReserves(
                        matchingEngine, reserveInstances,
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
    
                    actualResult = await matchingEngine.calcRatesAndAmounts(srcToken.address, ethAddress, srcDecimals, ethDecimals, info, hintedReserves.hint);
                    compareResults(expectedTradeResult, expectedOutput, actualResult);
                });
    
                it(`should calcRatesAmts for E2T, split hint`, async() => {
                    hintedReserves = await getHintedReserves(
                        matchingEngine, reserveInstances,
                        undefined, 0, undefined, 0,
                        SPLIT_HINTTYPE, undefined, undefined, srcQty,
                        ethAddress, destToken.address
                        );
                    
                    reserveRates = hintedReserves.reservesE2T.reservesForFetchRate.map(reserve => reserve.rate);
                    expectedTradeResult = getTradeResult(
                        ethDecimals, [], [], [],
                        destDecimals, hintedReserves.reservesE2T.reservesForFetchRate, reserveRates, hintedReserves.reservesE2T.splits,
                        srcQty, networkFeeBps, platformFeeBps);
                    
                    expectedOutput = getExpectedOutput(
                        [], [],
                        hintedReserves.reservesE2T.reservesForFetchRate, hintedReserves.reservesE2T.splits,
                    );
                    
                    actualResult = await matchingEngine.calcRatesAndAmounts(ethAddress, destToken.address, ethDecimals, destDecimals, info, hintedReserves.hint);
                    compareResults(expectedTradeResult, expectedOutput, actualResult);
                });
    
                it(`should calcRatesAmts for T2T, split hint`, async() => {
                    hintedReserves = await getHintedReserves(
                        matchingEngine, reserveInstances,
                        SPLIT_HINTTYPE, undefined, undefined, srcQty,
                        SPLIT_HINTTYPE, undefined, undefined, srcQty,
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
                    
                    actualResult = await matchingEngine.calcRatesAndAmounts(srcToken.address, destToken.address, srcDecimals, destDecimals, info, hintedReserves.hint);
                    compareResults(expectedTradeResult, expectedOutput, actualResult);
                });
            });

            describe("max reserve rates", async() => {
                before("set max reserve rates", async() => {
                    await setReserveRates('max');
                });

                it(`should revert for T2E, mask out hint (srcQty > MAX_QTY in calcDstQty for calcRatesE2T)`, async() => {
                    numMaskedReserves = 1;
                    hintedReserves = await getHintedReserves(
                        matchingEngine, reserveInstances,
                        MASK_OUT_HINTTYPE, numMaskedReserves, [], srcQty,
                        undefined, 0, undefined, 0,
                        srcToken.address, ethAddress
                    );
                    
                    await expectRevert(
                        matchingEngine.calcRatesAndAmounts(srcToken.address, ethAddress, srcDecimals, ethDecimals, info, hintedReserves.hint),
                        "srcQty > MAX_QTY"
                    );
                });
    
                it(`should calcRatesAmts for E2T, mask out hint, (will revert only in network side, when calcRateFromQty is called)`, async() => {
                    numMaskedReserves = 1;
                    hintedReserves = await getHintedReserves(
                        matchingEngine, reserveInstances,
                        undefined, 0, undefined, 0,
                        MASK_OUT_HINTTYPE, numMaskedReserves, [], srcQty,
                        ethAddress, destToken.address
                        );
                    
                    bestReserve = await nwHelper.getBestReserveAndRate(hintedReserves.reservesE2T.reservesForFetchRate, ethAddress, destToken.address, srcQty, networkFeeBps);
                    expectedTradeResult = getTradeResult(
                        ethDecimals, [], [], [],
                        destDecimals, [bestReserve], [bestReserve.rateNoFee], [],
                        srcQty, networkFeeBps, platformFeeBps);
    
                    expectedOutput = getExpectedOutput(
                        [], [],
                        [bestReserve], [BPS]
                    );
    
                    actualResult = await matchingEngine.calcRatesAndAmounts(ethAddress, destToken.address, ethDecimals, destDecimals, info, hintedReserves.hint);
                    compareResults(expectedTradeResult, expectedOutput, actualResult);
                });
    
                it(`should revert for T2T, mask out hint (srcQty > MAX_QTY in calcDstQty for calcRatesE2T)`, async() => {
                    numMaskedReserves = 1;
                    hintedReserves = await getHintedReserves(
                        matchingEngine, reserveInstances,
                        MASK_OUT_HINTTYPE, numMaskedReserves, [], srcQty,
                        MASK_OUT_HINTTYPE, numMaskedReserves, [], ethSrcQty,
                        srcToken.address, destToken.address
                        );
                    
                    await expectRevert(
                        matchingEngine.calcRatesAndAmounts(srcToken.address, destToken.address, srcDecimals, destDecimals, info, hintedReserves.hint),
                        "srcQty > MAX_QTY"
                    );
                });
    
                it(`should revert for T2E, split hint (srcQty > MAX_QTY in calcDstQty for calcRatesE2T)`, async() => {
                    hintedReserves = await getHintedReserves(
                        matchingEngine, reserveInstances,
                        SPLIT_HINTTYPE, undefined, undefined, srcQty,
                        undefined, 0, undefined, 0,
                        srcToken.address, ethAddress
                        );
    
                    await expectRevert(
                        matchingEngine.calcRatesAndAmounts(srcToken.address, ethAddress, srcDecimals, ethDecimals, info, hintedReserves.hint),
                        "srcQty > MAX_QTY"
                    );
                });
    
                it(`should revert for E2T, split hint (since calcRateFromQty is called for split hint)`, async() => {
                    hintedReserves = await getHintedReserves(
                        matchingEngine, reserveInstances,
                        undefined, 0, undefined, 0,
                        SPLIT_HINTTYPE, undefined, undefined, srcQty,
                        ethAddress, destToken.address
                        );
                    
                    await expectRevert(
                        matchingEngine.calcRatesAndAmounts(ethAddress, destToken.address, ethDecimals, destDecimals, info, hintedReserves.hint),
                        "destAmount > MAX_QTY"
                    );
                });
    
                it(`should revert for T2T, split hint (srcQty > MAX_QTY in calcDstQty for calcRatesE2T)`, async() => {
                    hintedReserves = await getHintedReserves(
                        matchingEngine, reserveInstances,
                        SPLIT_HINTTYPE, undefined, undefined, srcQty,
                        SPLIT_HINTTYPE, undefined, undefined, srcQty,
                        srcToken.address, destToken.address
                        );
                    
                    await expectRevert(
                        matchingEngine.calcRatesAndAmounts(srcToken.address, destToken.address, srcDecimals, destDecimals, info, hintedReserves.hint),
                        "srcQty > MAX_QTY"
                    );
                });
            });
        });
    });
});

async function fetchReservesRatesFromRateHelper(matchingEngineInstance, rateHelperInstance, reserveInstances, tokenAddress, qty, networkFeeBps, isTokenToEth) {
    let reservesArray = [];
    let result;
    let reserves;
    let reserve;
    let rates;

    //sell
    if (isTokenToEth) {
        result = await rateHelperInstance.getRatesForTokenWithCustomFee(tokenAddress, 0, qty, networkFeeBps);
        reserves = result.sellReserves;
        rates = result.sellRates;
    //buy
    } else {
        result = await rateHelperInstance.getRatesForTokenWithCustomFee(tokenAddress, qty, 0, networkFeeBps);
        reserves = result.buyReserves;
        rates = result.buyRates;
    }
    for (i=0; i<reserves.length; i++) {
        reserveAddress = reserves[i];
        reserve = Object.assign({}, reserveInstances[reserveAddress]);
        reserve.rate = rates[i];
        reserve.isFeePaying = (await matchingEngineInstance.getReserveDetails(reserveAddress)).isFeePaying;
        reservesArray.push(reserve);
    }
    return reservesArray;
}

async function getHintedReserves(
    matchingEngine, reserveInstances, 
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
        reserveCandidates = await fetchReservesRatesFromRateHelper(matchingEngine, rateHelper, reserveInstances, srcAdd, t2eQty, 0, true);
        res.reservesT2E = nwHelper.applyHintToReserves(t2eHintType, reserveCandidates, t2eNumReserves, t2eSplits);
        if(destAdd == ethAddress) {
            res.hint = await matchingEngine.buildTokenToEthHint(
                res.reservesT2E.tradeType, res.reservesT2E.reservesForHint, res.reservesT2E.splits);
            return res;
        }
    }

    if(destAdd != ethAddress) {
        reserveCandidates = await fetchReservesRatesFromRateHelper(matchingEngine, rateHelper, reserveInstances, destAdd, e2tQty, 0, false);
        res.reservesE2T = nwHelper.applyHintToReserves(e2tHintType, reserveCandidates, e2tNumReserves, e2tSplits);
        if(srcAdd == ethAddress) {
            res.hint = await matchingEngine.buildEthToTokenHint(
                res.reservesE2T.tradeType, res.reservesE2T.reservesForHint, res.reservesE2T.splits);
            return res;
        }
    }

    res.hint = await matchingEngine.buildTokenToTokenHint(
        res.reservesT2E.tradeType, res.reservesT2E.reservesForHint, res.reservesT2E.splits,
        res.reservesE2T.tradeType, res.reservesE2T.reservesForHint, res.reservesE2T.splits
    );
    
    return res;
}

function getTradeResult(
    srcDecimals, t2eReserves, t2eRates, t2eSplits,
    destDecimals, e2tReserves, e2tRates, e2tSplits,
    srcQty, networkFeeBps, platformFeeBps
) {
    let result = {
        t2eNumReserves: (t2eSplits.length > 0) ? t2eReserves.length : new BN(1),
        tradeWei: zeroBN,
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
            if (reserve.isFeePaying) {
                result.feePayingReservesBps = result.feePayingReservesBps.add(t2eSplits[i]);
                result.numFeePayingReserves = result.numFeePayingReserves.add(new BN(1));
            }
        }
    } else if (t2eReserves.length > 0) {
        reserve = t2eReserves[0];
        result.tradeWei = Helper.calcDstQty(srcQty, srcDecimals, ethDecimals, t2eRates[0]);
        if (reserve.isFeePaying) {
            result.feePayingReservesBps = result.feePayingReservesBps.add(BPS);
            result.numFeePayingReserves = result.numFeePayingReserves.add(new BN(1));
        }
    } else {
        result.tradeWei = srcQty;
    }

    //add e2t reserve splits (doesn't matter if split or not, cos we already know best reserve)
    for (let i=0; i<e2tReserves.length; i++) {
        reserve = e2tReserves[i];
        if (reserve.isFeePaying) {
            feePayingBps = (e2tSplits[i] == undefined) ? BPS : e2tSplits[i];
            result.feePayingReservesBps = result.feePayingReservesBps.add(feePayingBps);
            result.numFeePayingReserves = result.numFeePayingReserves.add(new BN(1));
        }
    }

    //calculate fees
    let networkFeeWei = result.tradeWei.mul(networkFeeBps).div(BPS).mul(result.feePayingReservesBps).div(BPS);
    let platformFeeWei = result.tradeWei.mul(platformFeeBps).div(BPS);
    actualTradeWei = result.tradeWei.sub(networkFeeWei).sub(platformFeeWei);

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
        rate = actualTradeWei.eq(zeroBN) ? zeroBN : Helper.calcRateFromQty(actualTradeWei, result.actualDestAmount, ethDecimals, destDecimals);
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
    result.destAmountWithNetworkFee = Helper.calcDstQty(result.tradeWei.sub(networkFeeWei), ethDecimals, destDecimals, rate);
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
        result.isFeePaying = sellReserves.map(reserve => reserve.isFeePaying);
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
        result.isFeePaying = result.isFeePaying.concat(buyReserves.map(reserve => reserve.isFeePaying));
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
        result.isFeePaying = sellReserves.map(reserve => reserve.isFeePaying);
        result.isFeePaying = result.isFeePaying.concat(buyReserves.map(reserve => reserve.isFeePaying));
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
        Helper.assertEqual(expected, actual, "reserve splitValuesBps not the same");
    }

    //compare expectedFeePaying
    for (let i=0; i<actualResult.isFeePaying.length; i++) {
        expected = expectedOutput.isFeePaying[i];
        actual = actualResult.isFeePaying[i];
        Helper.assertEqual(expected, actual, "reserve fee paying not the same");
    }
}

async function setReserveRates(rateSetting) {
    if (rateSetting == 'low') {
        let rate = new BN(1);
        for (reserve of Object.values(reserveInstances)) {
            await reserve.instance.setRate(srcToken.address, rate, rate);
            await reserve.instance.setRate(destToken.address, rate, rate);
        };
    } else if (rateSetting == 'max') {
        for (reserve of Object.values(reserveInstances)) {
            await reserve.instance.setRate(srcToken.address, MAX_RATE, MAX_RATE);
            await reserve.instance.setRate(destToken.address, MAX_RATE, MAX_RATE);
        };
    } else if (rateSetting == 'lowT2EhighE2T') {
        for (reserve of Object.values(reserveInstances)) {
            await reserve.instance.setRate(srcToken.address, MAX_RATE, new BN(1));
            await reserve.instance.setRate(destToken.address, MAX_RATE, new BN(1));
        };
    } else if (rateSetting == 'highT2ElowE2T') {
        for (reserve of Object.values(reserveInstances)) {
            await reserve.instance.setRate(srcToken.address, new BN(1), MAX_RATE);
            await reserve.instance.setRate(destToken.address, new BN(1), MAX_RATE);
        };
    }
}

function assertZeroAmts(tradeResult) {
    Helper.assertEqual(tradeResult.results[4], zeroBN, "destAmountNoFee not zero");
    Helper.assertEqual(tradeResult.results[5], zeroBN, "destAmountWithNetworkFee not zero");
    Helper.assertEqual(tradeResult.results[6], zeroBN, "actualDestAmount not zero");
}

function printCalcRatesAmtsResult(tradeResult) {
    console.log(`t2eNumReserves: ${tradeResult[0].toString()}`);
    console.log(`tradeWei: ${tradeResult[1].toString()} (${tradeResult[1].div(precisionUnits)} ETH)`);
    console.log(`numFeePayingReserves: ${tradeResult[2].toString()}`);
    console.log(`feePayingReservesBps: ${tradeResult[3].toString()}`);
    console.log(`destAmountNoFee: ${tradeResult[4].toString()} (${tradeResult[4].div(precisionUnits)} ETH)`);
    console.log(`destAmountWithNetworkFee: ${tradeResult[5].toString()} (${tradeResult[5].div(precisionUnits)} ETH)`);
    console.log(`actualDestAmount: ${tradeResult[6].toString()} (${tradeResult[6].div(precisionUnits)} ETH)`);
}

function log(string) {
    console.log(string);
}
