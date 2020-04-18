const TestToken = artifacts.require("Token.sol");
const MockReserve = artifacts.require("MockReserve.sol");
const KyberStorage = artifacts.require("KyberStorage.sol");
const MockStorage = artifacts.require("MockStorage.sol");
const Helper = require("../helper.js");
const nwHelper = require("./networkHelper.js");

const BN = web3.utils.BN;
const { expectEvent, expectRevert } = require('@openzeppelin/test-helpers');
const {zeroAddress, zeroBN} = require("../helper.js");

//global variables
//////////////////
const maxProxies = new BN(2);

let txResult;

let admin;
let operator;
let network;
let kyberStorage;
let user;
let feeHandler;
let kyberMatchingEngine;

//reserve data
//////////////
let reserveInstances = {};
let reserve;
let numReserves;

//tokens data
////////////
let token;

contract('KyberStorage', function(accounts) {

    before("one time global init", async() => {
        //init accounts
        user = accounts[0];
        admin = accounts[1];
        operator = accounts[2];
        network = accounts[3];
        DAOAddr = accounts[4];
    });

    describe("test onlyAdmin and onlyNetwork permissions", async() => {
        before("deploy KyberStorage instance, 1 mock reserve and 1 mock token", async() => {
            kyberStorage = await KyberStorage.new(admin);
            await kyberStorage.setNetworkContract(network, { from: admin});
            await kyberStorage.setFeeAccountedPerReserveType(true, true, true, false, true, true, {from: admin});
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
                kyberStorage.setNetworkContract(network, {from: user}),
                "only admin"
            );

            await expectRevert(
                kyberStorage.setNetworkContract(network, {from: operator}),
                "only admin"
            );
        });

        it("should have admin set network contract", async() => {
            await kyberStorage.setNetworkContract(network, {from: admin});
            let result = await kyberStorage.kyberNetwork();
            Helper.assertEqual(network, result, "network not set by admin");
        });

        it("should not have unauthorized personnel add reserve", async() => {
            await expectRevert(
                kyberStorage.addReserve(reserve.address, reserve.reserveId, reserve.onChainType, {from: user}),
                "only network"
            );

            await expectRevert(
                kyberStorage.addReserve(reserve.address, reserve.reserveId, reserve.onChainType, {from: operator}),
                "only network"
            );

            await expectRevert(
                kyberStorage.addReserve(reserve.address, reserve.reserveId, reserve.onChainType, {from: admin}),
                "only network"
            );
        });

        it("should have network add reserve", async() => {
            await kyberStorage.addReserve(reserve.address, reserve.reserveId, reserve.onChainType, {from: network});
            let reserveId = await kyberStorage.getReserveID(reserve.address);

            let reserveAddress = await kyberStorage.reserveIdToAddresses(reserve.reserveId, 0);
            Helper.assertEqual(reserve.reserveId, reserveId, "wrong address to ID");
            Helper.assertEqual(reserve.address, reserveAddress, "wrong ID to address");
        });

        it("should not have unauthorized personnel list token pair for reserve", async() => {
            await expectRevert(
                kyberStorage.listPairForReserve(reserve.address, token.address, true, true, true, {from: user}),
                "only network"
            );

            await expectRevert(
                kyberStorage.listPairForReserve(reserve.address, token.address, true, true, true, {from: operator}),
                "only network"
            );

            await expectRevert(
                kyberStorage.listPairForReserve(reserve.address, token.address, true, true, true, {from: admin}),
                "only network"
            );
        });

        it("should have network list pair for reserve", async() => {
            await kyberStorage.listPairForReserve(reserve.address, token.address, true, true, true, {from: network});
            let result = await kyberStorage.getReservesPerTokenSrc(token.address);
            Helper.assertEqual(result[0], reserve.reserveId, "reserve should have supported token");
            result = await kyberStorage.getReservesPerTokenDest(token.address);
            Helper.assertEqual(result[0], reserve.reserveId, "reserve should have supported token");
        });

        it("should not have unauthorized personnel remove reserve", async() => {
            await expectRevert(
                kyberStorage.removeReserve(reserve.address, zeroBN, {from: user}),
                "only network"
            );

            await expectRevert(
                kyberStorage.removeReserve(reserve.address, zeroBN, {from: operator}),
                "only network"
            );

            await expectRevert(
                kyberStorage.removeReserve(reserve.address, zeroBN, {from: admin}),
                "only network"
            );
        });

        it("should have network remove reserve", async() => {
            await kyberStorage.removeReserve(reserve.address, zeroBN, {from: network});
        });
    });

    describe("test contract event", async() => {
        before("deploy and setup kyberStorage instance", async() => {
            kyberStorage = await KyberStorage.new(admin);
        });

        it("shoud test set network event", async() => {
            txResult = await kyberStorage.setNetworkContract(network, {from: admin});
            expectEvent(txResult, "KyberNetworkUpdated", {
                newNetwork: network
            });
        });
    });

    describe("test setting contracts and params", async() => {
        before("deploy and setup kyberStorage instance", async() => {
            kyberStorage = await KyberStorage.new(admin);
            await kyberStorage.setNetworkContract(network, {from: admin});
            feeHandler = accounts[5];
            kyberMatchingEngine = accounts[6];
        });

        it("should revert setting zero address for network", async() => {
            await expectRevert(
                kyberStorage.setNetworkContract(zeroAddress, {from: admin}),
                "network 0");
        });

        it("set empty fee handler contract", async function(){
            await expectRevert(
                kyberStorage.setContracts(zeroAddress, kyberMatchingEngine, {from: network}),
                "feeHandler 0"
            );
        });

        it("set empty matching engine contract", async function(){
            await expectRevert(
                kyberStorage.setContracts(feeHandler, zeroAddress, {from: network}),
                "matchingEngine 0"
            );
        });

        it("set empty dao contract", async function(){
            await expectRevert(
                kyberStorage.setDAOContract(zeroAddress, {from: network}),
                "kyberDAO 0"
            );
        });
    });

    describe("test adding / removing proxy.", async() => {
        let proxy1 = accounts[9];
        let proxy2 = accounts[8];
        let proxy3 = accounts[7];
        let tempStorage;

        beforeEach("create storage", async() => {
            kyberStorage= await KyberStorage.new(admin);
            await kyberStorage.setNetworkContract(network, {from: admin});
        });

        it("test can add max two proxies", async() => {
            await kyberStorage.addKyberProxy(proxy1, maxProxies, {from: network});
            await kyberStorage.addKyberProxy(proxy2, maxProxies, {from: network});

            await expectRevert(
                kyberStorage.addKyberProxy(proxy3, maxProxies, {from: network}),
                "max proxies limit reached"
            );
        });

        if("test removeKyberProxy revert if not added", async() => {
            await expectRevert(
                kyberStorage.removeKyberProxy(proxy1, maxProxies, {from: network}),
                "proxy not found"
            );
            await kyberStorage.addKyberProxy(proxy1, maxProxies, {from: network});
            await kyberStorage.removeKyberProxy(proxy1, maxProxies, {from: network});
        });

        it("test only admin can add proxies", async() => {
            await expectRevert(
                kyberStorage.addKyberProxy(proxy1, new BN(100), {from: accounts[0]}),
                "only network"
            );
        });

        it("test can't add proxy zero address", async() => {
            await expectRevert(
                kyberStorage.addKyberProxy(zeroAddress, maxProxies, {from: network}),
                "proxy 0"
            );
        });
    });

    describe("test adding reserves", async() => {
        before("deploy and setup kyberStorage instance & 1 mock reserve", async() => {
            kyberStorage = await KyberStorage.new(admin);
            await kyberStorage.setNetworkContract(network, {from: admin});
            await kyberStorage.setFeeAccountedPerReserveType(true, true, true, false, true, true, {from: admin});
            let result = await nwHelper.setupReserves(network, [], 1,0,0,0, accounts, admin, operator);
            reserveInstances = result.reserveInstances;
            numReserves = result.numAddedReserves * 1;
            for (const value of Object.values(reserveInstances)) {
                reserve = value;
            }
        });

        describe("test cases where reserve has never been added", async() => {
            it("should revert for zero reserve id", async() => {
                await expectRevert(
                    kyberStorage.addReserve(reserve.address, nwHelper.ZERO_RESERVE_ID, reserve.onChainType, {from: network}),
                    "reserveId = 0"
                );
            });
        });

        describe("test cases for an already added reserve", async() => {
            before("add reserve", async() => {
                await kyberStorage.addReserve(reserve.address, reserve.reserveId, reserve.onChainType, {from: network});
            });

            it("should revert for adding an existing reserve", async() => {
                await expectRevert(
                    kyberStorage.addReserve(reserve.address, reserve.reserveId, reserve.onChainType, {from: network}),
                    "reserve has id"
                );
            });

            it("should revert for a new reserve with an already taken reserve id", async() => {
                let newReserve = await MockReserve.new();
                await expectRevert(
                    kyberStorage.addReserve(newReserve.address, reserve.reserveId, reserve.onChainType, {from: network}),
                    "reserveId taken"
                );
            });

            it("should be able to re-add a reserve after its removal", async() => {
                await kyberStorage.removeReserve(reserve.address, zeroBN, {from: network});
                await kyberStorage.addReserve(reserve.address, reserve.reserveId, reserve.onChainType, {from: network});
            });

            it("should be able to add a new reserve address for an existing id after removing an old one", async() => {
                let newReserve = await MockReserve.new();
                await kyberStorage.removeReserve(reserve.address, zeroBN, {from: network});
                await kyberStorage.addReserve(newReserve.address, reserve.reserveId, reserve.onChainType, {from: network});
                let actualNewReserveAddress = await kyberStorage.reserveIdToAddresses(reserve.reserveId, 0);
                let actualOldReserveAddress = await kyberStorage.reserveIdToAddresses(reserve.reserveId, 1);

                Helper.assertEqual(newReserve.address, actualNewReserveAddress, "new reserve address not equal to expected");
                Helper.assertEqual(reserve.address, actualOldReserveAddress, "old reserve address not equal to expected");
            })
        });
    });

    describe("test listing token pair and removing reserve", async() => {
        before("deploy and setup kyberStorage instance & add 1 mock reserve, & 1 mock token", async() => {
            kyberStorage = await KyberStorage.new(admin);
            await kyberStorage.setNetworkContract(network, {from: admin});
            await kyberStorage.setFeeAccountedPerReserveType(true, true, true, false, true, true, {from: admin});
            //init 1 mock reserve
            let result = await nwHelper.setupReserves(network, [], 1,0,0,0, accounts, admin, operator);
            reserveInstances = result.reserveInstances;
            numReserves = result.numAddedReserves * 1;
            for (const value of Object.values(reserveInstances)) {
                reserve = value;
            }
            await kyberStorage.addReserve(reserve.address, reserve.reserveId, reserve.onChainType, {from: network});

            //create token
            token = await TestToken.new("test", "tst", 18);
        });

        beforeEach("delist token pair on both sides", async() => {
            await kyberStorage.listPairForReserve(reserve.address, token.address, true, true, false, {from: network});
        });

        it("should revert when listing token for non-reserve", async() => {
            await expectRevert(
                kyberStorage.listPairForReserve(user, token.address, true, true, true, {from: network}),
                "reserveId = 0"
           );
        });

        it("should revert when removing non-reserve", async() => {
            await expectRevert(
                kyberStorage.removeReserve(user, zeroBN, {from : network}),
                "reserve not found"
           );
        });

        it("should revert if reserveId is 0 when removing reserve", async() => {
            let mockStorage = await MockStorage.new(admin);
            await mockStorage.setNetworkContract(network, {from: admin});
            await mockStorage.setFeeAccountedPerReserveType(true, true, true, false, true, true, {from: admin});
            for (const value of Object.values(reserveInstances)) {
                reserve = value;
            }
            await mockStorage.addReserve(reserve.address, reserve.reserveId, reserve.onChainType, {from: network});
            await mockStorage.setReserveId(reserve.address, nwHelper.ZERO_RESERVE_ID);
            await expectRevert(
                mockStorage.removeReserve(reserve.address,zeroBN, {from: network}),
                "reserve's existing reserveId is 0"
            );
        });

        it("should have reserveId reset to zero after removal", async() => {
            await kyberStorage.removeReserve(reserve.address, zeroBN, {from: network});
            let reserveId = await kyberStorage.getReserveID(reserve.address);
            Helper.assertEqual(reserveId, nwHelper.ZERO_RESERVE_ID, "reserve id was not reset to zero");

            //reset
            await kyberStorage.addReserve(reserve.address, reserve.reserveId, reserve.onChainType, {from: network});
        });

        it("should list T2E side only", async() => {
            await kyberStorage.listPairForReserve(reserve.address, token.address, true, false, true, {from: network});
            let result = await kyberStorage.getReservesPerTokenSrc(token.address);
            Helper.assertEqual(result.length, zeroBN, "E2T should not be listed");

            result = await kyberStorage.getReservesPerTokenDest(token.address);
            Helper.assertEqual(result[0], reserve.reserveId, "T2E should be listed");
        });

        it("should list E2T side only", async() => {
            await kyberStorage.listPairForReserve(reserve.address, token.address, false, true, true, {from: network});
            let result = await kyberStorage.getReservesPerTokenSrc(token.address);
            Helper.assertEqual(result[0], reserve.reserveId, "E2T should be listed");

            result = await kyberStorage.getReservesPerTokenDest(token.address);
            Helper.assertEqual(result.length, zeroBN, "T2E should not be listed");
        });

        it("should list both T2E and E2T", async() => {
            await kyberStorage.listPairForReserve(reserve.address, token.address, true, true, true, {from: network});
            let result = await kyberStorage.getReservesPerTokenSrc(token.address);
            Helper.assertEqual(result[0], reserve.reserveId, "T2E should be listed");

            result = await kyberStorage.getReservesPerTokenDest(token.address);
            Helper.assertEqual(result[0], reserve.reserveId, "E2T should be listed");
        });

        it("should delist T2E side only", async() => {
            await kyberStorage.listPairForReserve(reserve.address, token.address, true, true, true, {from: network});
            await kyberStorage.listPairForReserve(reserve.address, token.address, false, true, false, {from: network});
            let result = await kyberStorage.getReservesPerTokenSrc(token.address);
            Helper.assertEqual(result.length, zeroBN, "E2T should not be listed");

            result = await kyberStorage.getReservesPerTokenDest(token.address);
            Helper.assertEqual(result[0], reserve.reserveId, "T2E should be listed");
        });

        it("should delist E2T side only", async() => {
            await kyberStorage.listPairForReserve(reserve.address, token.address, true, true, true, {from: network});
            await kyberStorage.listPairForReserve(reserve.address, token.address, true, false, false, {from: network});
            let result = await kyberStorage.getReservesPerTokenSrc(token.address);
            Helper.assertEqual(result[0], reserve.reserveId, "E2T should be listed");

            result = await kyberStorage.getReservesPerTokenDest(token.address);
            Helper.assertEqual(result.length, zeroBN, "T2E should not be listed");
        });

        it("should delist both T2E and E2T", async() => {
            await kyberStorage.listPairForReserve(reserve.address, token.address, true, true, true, {from: network});
            await kyberStorage.listPairForReserve(reserve.address, token.address, true, true, false, {from: network});
            let result = await kyberStorage.getReservesPerTokenSrc(token.address);
            Helper.assertEqual(result.length, zeroBN, "E2T should not be listed");

            result = await kyberStorage.getReservesPerTokenDest(token.address);
            Helper.assertEqual(result.length, zeroBN, "T2E should not be listed");
        });

        it("should do nothing for listing twice", async() => {
            await kyberStorage.listPairForReserve(reserve.address, token.address, true, true, true, {from: network});
            await kyberStorage.listPairForReserve(reserve.address, token.address, true, true, true, {from: network});
            let result = await kyberStorage.getReservesPerTokenSrc(token.address);
            Helper.assertEqual(result[0], reserve.reserveId, "E2T should be listed");

            result = await kyberStorage.getReservesPerTokenDest(token.address);
            Helper.assertEqual(result[0], reserve.reserveId, "T2E should be listed");
        });
    });


    describe("test onlyAdmin and onlyNetwork permissions", async() => {
        before("deploy storage instance, 1 mock reserve and 1 mock token", async() => {
            storage = await KyberStorage.new(admin);
            await storage.setNetworkContract(network, {from:admin});
            token = await TestToken.new("test", "tst", 18);

            //init 1 mock reserve
            let result = await nwHelper.setupReserves(network, [], 1,0,0,0, accounts, admin, operator);
            reserveInstances = result.reserveInstances;
            numReserves = result.numAddedReserves * 1;
            for (const value of Object.values(reserveInstances)) {
                reserve = value;
            }
        });

        it("should not have unauthorized personnel set fee accounted data", async() => {
            await expectRevert(
                storage.setFeeAccountedPerReserveType(true, true, true, false, true, true, {from: operator}),
                "only admin"
            );

            await expectRevert(
                storage.setFeeAccountedPerReserveType(true, true, true, false, true, true, {from: network}),
                "only admin"
            );
        });

        it("should have admin set fee accounted data", async() => {
            await storage.setFeeAccountedPerReserveType(true, true, true, false, true, true, {from: admin});
        });

        it("should not have unauthorized personnel add reserve", async() => {
            await expectRevert(
                storage.addReserve(reserve.address, reserve.reserveId, reserve.onChainType, {from: user}),
                "only network"
            );

            await expectRevert(
                storage.addReserve(reserve.address, reserve.reserveId, reserve.onChainType, {from: operator}),
                "only network"
            );

            await expectRevert(
                storage.addReserve(reserve.address, reserve.reserveId, reserve.onChainType, {from: admin}),
                "only network"
            );
        });

        it("should have network add reserve", async() => {
            await storage.setFeeAccountedPerReserveType(true, true, true, false, true, true, {from: admin});
            await storage.addReserve(reserve.address, reserve.reserveId, reserve.onChainType, {from: network});
        });

        it("should not have unauthorized personnel remove reserve", async() => {
            await expectRevert(
                storage.removeReserve(reserve.address, 0, {from: user}),
                "only network"
            );

            await expectRevert(
                storage.removeReserve(reserve.address, 0, {from: operator}),
                "only network"
            );

            await expectRevert(
                storage.removeReserve(reserve.address, 0, {from: admin}),
                "only network"
            );
        });

        it("should have network remove reserve", async() => {
            await storage.removeReserve(reserve.address, 0, {from: network});
        });
    });

    describe("test adding reserves", async() => {
        before("deploy and setup matchingEngine instance & 1 mock reserve", async() => {
            tmpStorage = await KyberStorage.new(admin);
            await tmpStorage.setNetworkContract(network, {from: admin});

            //init 1 mock reserve
            let result = await nwHelper.setupReserves(network, [], 1,0,0,0, accounts, admin, operator);
            reserveInstances = result.reserveInstances;
            numReserves = result.numAddedReserves * 1;
            for (const value of Object.values(reserveInstances)) {
                reserve = value;
            }
        });

        describe("test cases where reserve has never been added", async() => {
            it("should revert for NONE reserve type", async() => {
                await expectRevert(
                    tmpStorage.addReserve(reserve.address, reserve.reserveId, 0, {from: network}),
                    "bad reserve type"
                );
            });

            it("should revert for LAST reserve type", async() => {
                await expectRevert(
                    tmpStorage.addReserve(reserve.address, reserve.reserveId, 7, {from: network}),
                    "bad reserve type"
                );
            });

            it("should revert for valid reserve because fee accounted data not set", async() => {
                await expectRevert(
                    tmpStorage.addReserve(reserve.address, reserve.reserveId, reserve.onChainType, {from: network}),
                    "fee accounted data not set"
                );
            });
        });

        describe("test cases for an already added reserve", async() => {
            before("add fee accounted type and add reserve", async() => {
                await tmpStorage.setFeeAccountedPerReserveType(true, true, true, false, true, true, {from: admin});
                await tmpStorage.addReserve(reserve.address, reserve.reserveId, reserve.onChainType, {from: network});
            });

            it("should be able to re-add a reserve after its removal", async() => {
                await tmpStorage.removeReserve(reserve.address, 0, {from: network});
                await tmpStorage.addReserve(reserve.address, reserve.reserveId, reserve.onChainType, {from: network});
            });
        });
    });

    describe("test fee accounted data per reserve", async() => {
        let token;
        let reserveInstances;
        let result;
        let totalReserveTypes = 6;

        before("setup matchingEngine instance reserve per each reserve type", async() => {
            storage = await KyberStorage.new(admin);
            await storage.setNetworkContract(network, {from: admin});
            await storage.setFeeAccountedPerReserveType(true, true, true, false, true, true, {from: admin});

            //init token
            token = await TestToken.new("Token", "TOK", 18);

            result = await nwHelper.setupReserves(network, [token], totalReserveTypes, 0, 0, 0, accounts, admin, operator);
            reserveInstances = result.reserveInstances;

            //add reserves for all types.
            let type = 1;
            for (reserve of Object.values(reserveInstances)) {
                await storage.addReserve(reserve.address, reserve.reserveId, type, {from: network});
                type++;
            }
        });

        it("get reserve details while modifying fee accounted per type. see as expected", async() => {
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

                await storage.setFeeAccountedPerReserveType(pay[0], pay[1], pay[2], pay[3], pay[4], pay[5], {from: admin});
                let index = 0;
                for (reserve of Object.values(reserveInstances)) {
                    let details = await storage.getReserveDetailsByAddress(reserve.address);
                    Helper.assertEqual(reserve.reserveId, details.reserveId)
                    Helper.assertEqual(index + 1, details.resType)
                    Helper.assertEqual(pay[index], details.isFeeAccountedFlags);
                    ++index;
                }
            }
        });
    });
});
