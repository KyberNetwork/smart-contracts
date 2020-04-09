const TestToken = artifacts.require("Token.sol");
const MockReserve = artifacts.require("MockReserve.sol");
const KyberMatchingEngine = artifacts.require("KyberMatchingEngine.sol");
const MockMatchEngine = artifacts.require("MockMatchEngine.sol");
const MaliciousKyberEngine = artifacts.require("MaliciousMatchingEngine.sol");
const KyberStorage = artifacts.require("KyberStorage.sol");
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
const maxProxies = new BN(2);

let networkFeeArray = [new BN(0), new BN(250), new BN(400)];
let platformFeeArray = [new BN(0), new BN(250, new BN(400))];
let txResult;

let admin;
let operator;
let network;
let kyberStorage;
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

contract('KyberStorage', function(accounts) {

    before("one time global init", async() => {
        //init accounts
        user = accounts[0];
        admin = accounts[1];
        operator = accounts[2];
        network = accounts[3];
    });

    describe("test onlyAdmin and onlyNetwork permissions", async() => {
        before("deploy KyberStorage instance, 1 mock reserve and 1 mock token", async() => {
            kyberStorage = await KyberStorage.new(admin);
            await kyberStorage.setNetworkContract(network, { from: admin});
            token = await TestToken.new("test", "tst", 18);

            rateHelper = await RateHelper.new(admin);
            await rateHelper.setContracts(kyberStorage.address, accounts[9], {from: admin});

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
                "Only admin"
            );

            await expectRevert(
                kyberStorage.setNetworkContract(network, {from: operator}),
                "Only admin"
            );
        });

        it("should have admin set network contract", async() => {
            await kyberStorage.setNetworkContract(network, {from: admin});
            let result = await kyberStorage.kyberNetwork();
            Helper.assertEqual(network, result, "network not set by admin");
        });

        it("should not have unauthorized personnel add reserve", async() => {
            await expectRevert(
                kyberStorage.addReserve(reserve.address, reserve.reserveId, {from: user}),
                "only network"
            );

            await expectRevert(
                kyberStorage.addReserve(reserve.address, reserve.reserveId, {from: operator}),
                "only network"
            );

            await expectRevert(
                kyberStorage.addReserve(reserve.address, reserve.reserveId, {from: admin}),
                "only network"
            );
        });

        it("should have network add reserve", async() => {
            await kyberStorage.addReserve(reserve.address, reserve.reserveId, {from: network});
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
                kyberStorage.removeReserve(reserve.address, new BN(0), {from: user}),
                "only network"
            );

            await expectRevert(
                kyberStorage.removeReserve(reserve.address, new BN(0), {from: operator}),
                "only network"
            );

            await expectRevert(
                kyberStorage.removeReserve(reserve.address, new BN(0), {from: admin}),
                "only network"
            );
        });

        it("should have network remove reserve", async() => {
            await kyberStorage.removeReserve(reserve.address, new BN(0), {from: network});
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
        });

        it("should revert setting zero address for network", async() => {
            await expectRevert(
                kyberStorage.setNetworkContract(zeroAddress, {from: admin}),
                "network 0");    
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

        it("test only admin can add proxies", async() => {
            await expectRevert(
                kyberStorage.addKyberProxy(proxy1, new BN(100), {from: accounts[0]}),
                "only network"
            );
        });
    });

    describe("test adding reserves", async() => {
        before("deploy and setup kyberStorage instance & 1 mock reserve", async() => {
            kyberStorage = await KyberStorage.new(admin);
            await kyberStorage.setNetworkContract(network, {from: admin});
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
                    kyberStorage.addReserve(reserve.address, zeroReserveId, {from: network}),
                    "reserveId = 0"
                );
            });
        });

        describe("test cases for an already added reserve", async() => {
            before("add reserve", async() => {
                await kyberStorage.addReserve(reserve.address, reserve.reserveId, {from: network});
            });

            it("should revert for adding an existing reserve", async() => {
                await expectRevert(
                    kyberStorage.addReserve(reserve.address, reserve.reserveId, {from: network}),
                    "reserve has id"
                );
            });

            it("should revert for a new reserve with an already taken reserve id", async() => {
                let newReserve = await MockReserve.new();
                await expectRevert(
                    kyberStorage.addReserve(newReserve.address, reserve.reserveId, {from: network}),
                    "reserveId taken"
                );
            });

            it("should be able to re-add a reserve after its removal", async() => {
                await kyberStorage.removeReserve(reserve.address, new BN(0), {from: network});
                await kyberStorage.addReserve(reserve.address, reserve.reserveId, {from: network});
            });

            it("should be able to add a new reserve address for an existing id after removing an old one", async() => {
                let newReserve = await MockReserve.new();
                await kyberStorage.removeReserve(reserve.address, new BN(0), {from: network});
                await kyberStorage.addReserve(newReserve.address, reserve.reserveId, {from: network});
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

            //init 1 mock reserve
            let result = await nwHelper.setupReserves(network, [], 1,0,0,0, accounts, admin, operator);
            reserveInstances = result.reserveInstances;
            numReserves = result.numAddedReserves * 1;
            for (const value of Object.values(reserveInstances)) {
                reserve = value;
            }
            await kyberStorage.addReserve(reserve.address, reserve.reserveId, {from: network});

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
                kyberStorage.removeReserve(user, new BN(0), {from : network}),
                "reserve not found"
           );
        });

        //TODO: add a test to revert reserve -> 0 reserveId when removing reserve

        it("should have reserveId reset to zero after removal", async() => {
            await kyberStorage.removeReserve(reserve.address, new BN(0), {from: network});
            let reserveId = await kyberStorage.getReserveID(reserve.address);
            Helper.assertEqual(reserveId, nwHelper.ZERO_RESERVE_ID, "reserve id was not reset to zero");

            //reset
            await kyberStorage.addReserve(reserve.address, reserve.reserveId, {from: network});
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
});
