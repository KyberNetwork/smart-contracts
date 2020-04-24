const TestToken = artifacts.require("Token.sol");
const MockReserve = artifacts.require("MockReserve.sol");
const KyberStorage = artifacts.require("KyberStorage.sol");
const KyberNetwork = artifacts.require("KyberNetwork.sol");
const MockStorage = artifacts.require("MockStorage.sol");
const Helper = require("../helper.js");
const nwHelper = require("./networkHelper.js");

const BN = web3.utils.BN;
const { expectEvent, expectRevert } = require('@openzeppelin/test-helpers');
const {zeroAddress, zeroBN, ethAddress} = require("../helper.js");
const { ReserveType, MOCK_ID } = require('./networkHelper.js');

//global variables
//////////////////
const maxProxies = new BN(2);

let txResult;

let admin;
let operator;
let network;
let kyberStorage;
let user;
let feeHandlerAddr;
let matchingEngineAddr;

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
        DAOAddr = accounts[4];
        feeHandlerAddr = accounts[6];
        matchingEngineAddr = accounts[7];
    });

    describe("test onlyAdmin and onlyOperator permissions", async() => {
        before("deploy KyberStorage instance, 1 mock reserve and 1 mock token", async() => {
            kyberStorage = await KyberStorage.new(admin);
            network = await KyberNetwork.new(admin, kyberStorage.address);
            await kyberStorage.addOperator(operator, {from: admin});
            await kyberStorage.setNetworkContract(network.address, { from: admin});
            await kyberStorage.setFeeAccountedPerReserveType(true, true, true, false, true, true, {from: admin});
            await kyberStorage.setEntitledRebatePerReserveType(true, false, true, false, true, true, {from: admin});
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
                kyberStorage.setNetworkContract(network.address, {from: user}),
                "only admin"
            );

            await expectRevert(
                kyberStorage.setNetworkContract(network.address, {from: operator}),
                "only admin"
            );
        });

        it("should have admin set network contract", async() => {
            await kyberStorage.setNetworkContract(network.address, {from: admin});
            let result = await kyberStorage.kyberNetwork();
            Helper.assertEqual(network.address, result, "network not set by admin");
        });

        it("should not have unauthorized personnel add reserve", async() => {
            await expectRevert(
                kyberStorage.addReserve(reserve.address, reserve.reserveId, reserve.onChainType, reserve.rebateWallet, {from: user}),
                "only operator"
            );

            await expectRevert(
                kyberStorage.addReserve(reserve.address, reserve.reserveId, reserve.onChainType, reserve.rebateWallet, {from: admin}),
                "only operator"
            );
        });

        it("should have operator add reserve", async() => {
            await kyberStorage.addReserve(reserve.address, reserve.reserveId, reserve.onChainType, reserve.rebateWallet, {from: operator});
            let reserveId = await kyberStorage.getReserveID(reserve.address);

            let reserveAddress = await kyberStorage.reserveIdToAddresses(reserve.reserveId, 0);
            Helper.assertEqual(reserve.reserveId, reserveId, "wrong address to ID");
            Helper.assertEqual(reserve.address, reserveAddress, "wrong ID to address");
        });

        it("should not have unauthorized personnel list token pair for reserve", async() => {
            await expectRevert(
                kyberStorage.listPairForReserve(reserve.address, token.address, true, true, true, {from: user}),
                "only operator"
            );

            await expectRevert(
                kyberStorage.listPairForReserve(reserve.address, token.address, true, true, true, {from: admin}),
                "only operator"
            );
        });

        it("should have operator list pair for reserve", async() => {
            await kyberStorage.listPairForReserve(reserve.address, token.address, true, true, true, {from: operator});
            let result = await kyberStorage.getReservesPerTokenSrc(token.address);
            Helper.assertEqual(result[0], reserve.reserveId, "reserve should have supported token");
            result = await kyberStorage.getReservesPerTokenDest(token.address);
            Helper.assertEqual(result[0], reserve.reserveId, "reserve should have supported token");
        });

        it("should not have unauthorized personnel remove reserve", async() => {
            await expectRevert(
                kyberStorage.removeReserve(reserve.address, zeroBN, {from: user}),
                "only operator"
            );

            await expectRevert(
                kyberStorage.removeReserve(reserve.address, zeroBN, {from: admin}),
                "only operator"
            );
        });

        it("should have operator removes reserve", async() => {
            await kyberStorage.removeReserve(reserve.address, zeroBN, {from: operator});
        });

        it("should not have unauthorized personnel set contracts", async() => {
            await expectRevert(
                kyberStorage.setDAOContract(DAOAddr, { from: operator}), "only network"
            );

            await expectRevert(
                kyberStorage.setDAOContract(DAOAddr, { from: admin}), "only network"
            );

            await expectRevert(
                kyberStorage.setContracts(feeHandlerAddr, matchingEngineAddr, { from: operator}), "only network"
            );

            await expectRevert(
                kyberStorage.setContracts(feeHandlerAddr, matchingEngineAddr, { from: admin}), "only network"
            );
        });

        it("should have network set contracts", async() => {
            network = accounts[3];
            await kyberStorage.setNetworkContract(network, { from: admin});
            await kyberStorage.setDAOContract(DAOAddr, { from: network});
            await kyberStorage.setContracts(feeHandlerAddr, matchingEngineAddr, { from: network });
            let result= await kyberStorage.getContracts();
            Helper.assertEqualArray(result.daoAddresses, [DAOAddr], "unexpected dao history");
            Helper.assertEqualArray(result.matchingEngineAddresses, [matchingEngineAddr], "unexpected match engine history");
            Helper.assertEqualArray(result.feeHandlerAddresses, [feeHandlerAddr], "unexpected fee handler history");
        });
    });

    describe("test contract event", async() => {
        before("deploy and setup kyberStorage instance", async() => {
            kyberStorage = await KyberStorage.new(admin);
            network = await KyberNetwork.new(admin, kyberStorage.address);
            await kyberStorage.addOperator(operator, {from: admin});
            await kyberStorage.setFeeAccountedPerReserveType(true, true, true, false, true, true, {from: admin});
            await kyberStorage.setEntitledRebatePerReserveType(true, false, true, false, true, true, {from: admin});
        });

        it("shoud test set network event", async() => {
            txResult = await kyberStorage.setNetworkContract(network.address, {from: admin});
            expectEvent(txResult, "KyberNetworkUpdated", {
                newNetwork: network.address
            });
        });

        it("List pair For reserve eth to token", async() => {
            let anyWallet = accounts[0];
            let anotherMockReserve = await MockReserve.new();
            await kyberStorage.addReserve(anotherMockReserve.address, nwHelper.genReserveID(MOCK_ID, anotherMockReserve.address), ReserveType.FPR, anyWallet, {from: operator});
            let txResult = await kyberStorage.listPairForReserve(anotherMockReserve.address, token.address, true, false, true, {from: operator});
            expectEvent(txResult, 'ListReservePairs', {
                reserve: anotherMockReserve.address,
                src: ethAddress,
                dest: token.address,
                add: true
            });
        });

        it("List pair For reserve token to eth", async() => {
            let anyWallet = accounts[0];
            let anotherMockReserve = await MockReserve.new();
            await kyberStorage.addReserve(anotherMockReserve.address, nwHelper.genReserveID(MOCK_ID, anotherMockReserve.address), ReserveType.FPR, anyWallet, {from: operator});
            let txResult = await kyberStorage.listPairForReserve(anotherMockReserve.address, token.address, false, true, true, {from: operator});
            expectEvent(txResult, 'ListReservePairs', {
                reserve: anotherMockReserve.address,
                src: token.address,
                dest: ethAddress,
                add: true
            });
        });
    });

    describe("test setting contracts and params", async() => {
        before("deploy and setup kyberStorage instance", async() => {
            kyberStorage = await KyberStorage.new(admin);
            network = accounts[3];
            await kyberStorage.setNetworkContract(network, {from: admin});
            await kyberStorage.addOperator(operator, {from: admin});
        });

        it("should revert setting zero address for network", async() => {
            await expectRevert(
                kyberStorage.setNetworkContract(zeroAddress, {from: admin}),
                "network 0");
        });

        it("set empty fee handler contract", async function(){
            await expectRevert(
                kyberStorage.setContracts(zeroAddress, matchingEngineAddr, {from: network}),
                "feeHandler 0"
            );
        });

        it("set empty matching engine contract", async function(){
            await expectRevert(
                kyberStorage.setContracts(feeHandlerAddr, zeroAddress, {from: network}),
                "matchingEngine 0"
            );
        });

        it("set empty dao contract", async function(){
            await expectRevert(
                kyberStorage.setDAOContract(zeroAddress, {from: network}),
                "kyberDAO 0"
            );
        });

        it("set and get contracts history", async() =>{
            await kyberStorage.setDAOContract(DAOAddr, { from: network});
            await kyberStorage.setContracts(feeHandlerAddr, matchingEngineAddr, { from: network });
            // get and set second dao, matchingEngine, feeHandler contracts

            let DAOAddr2 = accounts[8];
            let feeHandlerAddr2 = accounts[9];
            let matchingEngineAddr2 = accounts[10];
            await kyberStorage.setDAOContract(DAOAddr2, { from: network});
            await kyberStorage.setContracts(feeHandlerAddr2, matchingEngineAddr2, { from: network });


            let result= await kyberStorage.getContracts();
            Helper.assertEqualArray(result.daoAddresses, [DAOAddr2, DAOAddr], "unexpected dao history");
            Helper.assertEqualArray(result.matchingEngineAddresses, [matchingEngineAddr2, matchingEngineAddr], "unexpected match engine history");
            Helper.assertEqualArray(result.feeHandlerAddresses, [feeHandlerAddr2, feeHandlerAddr], "unexpected fee handler history");
        });
    });

    describe("test adding / removing proxy.", async() => {
        let proxy1 = accounts[9];
        let proxy2 = accounts[8];
        let proxy3 = accounts[7];
        let network = accounts[3];
        let tempStorage;

        beforeEach("create storage", async() => {
            kyberStorage= await KyberStorage.new(admin);
            await kyberStorage.setNetworkContract(network, {from: admin});
        });

        it("test can add max two proxies", async() => {
            await kyberStorage.addKyberProxy(proxy1, maxProxies, {from: network});
            await kyberStorage.addKyberProxy(proxy2, maxProxies, {from: network});

            assert(await kyberStorage.isKyberProxyAdded(), "proxy is not added");

            await expectRevert(
                kyberStorage.addKyberProxy(proxy3, maxProxies, {from: network}),
                "max proxies limit reached"
            );

            proxies = await kyberStorage.getKyberProxies();
            Helper.assertEqualArray(proxies, [proxy1, proxy2], "unexpected proxies");
        });

        it("test remove proxy revert if not added", async() => {
            await kyberStorage.addKyberProxy(proxy2, maxProxies, {from: network});
            await expectRevert(
                kyberStorage.removeKyberProxy(proxy1, {from: network}),
                "proxy not found"
            );
            await kyberStorage.addKyberProxy(proxy1, maxProxies, {from: network});
            await kyberStorage.removeKyberProxy(proxy1, {from: network});
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
            network = await KyberNetwork.new(admin, kyberStorage.address);
            await kyberStorage.addOperator(operator, {from: admin});
            await kyberStorage.setNetworkContract(network.address, {from: admin});
            await kyberStorage.setFeeAccountedPerReserveType(true, true, true, false, true, true, {from: admin});
            await kyberStorage.setEntitledRebatePerReserveType(true, false, true, false, true, true, {from: admin});
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
                    kyberStorage.addReserve(reserve.address, nwHelper.ZERO_RESERVE_ID, reserve.onChainType, reserve.rebateWallet, {from: operator}),
                    "reserveId = 0"
                );
            });
        });

        describe("test cases for an already added reserve", async() => {
            before("add reserve", async() => {
                await kyberStorage.addReserve(reserve.address, reserve.reserveId, reserve.onChainType, reserve.rebateWallet, {from: operator});
            });

            it("should revert for adding an existing reserve", async() => {
                await expectRevert(
                    kyberStorage.addReserve(reserve.address, reserve.reserveId, reserve.onChainType, reserve.rebateWallet, {from: operator}),
                    "reserve has id"
                );
            });

            it("should revert for a new reserve with an already taken reserve id", async() => {
                let newReserve = await MockReserve.new();
                await expectRevert(
                    kyberStorage.addReserve(newReserve.address, reserve.reserveId, reserve.onChainType, reserve.rebateWallet, {from: operator}),
                    "reserveId taken"
                );
            });

            it("should be able to re-add a reserve after its removal", async() => {
                await kyberStorage.removeReserve(reserve.address, zeroBN, {from: operator});
                await kyberStorage.addReserve(reserve.address, reserve.reserveId, reserve.onChainType, reserve.rebateWallet, {from: operator});
            });

            it("should be able to add a new reserve address for an existing id after removing an old one", async() => {
                let newReserve = await MockReserve.new();
                await kyberStorage.removeReserve(reserve.address, zeroBN, {from: operator});
                await kyberStorage.addReserve(newReserve.address, reserve.reserveId, reserve.onChainType, reserve.rebateWallet, {from: operator});
                let actualNewReserveAddress = await kyberStorage.reserveIdToAddresses(reserve.reserveId, 0);
                let actualOldReserveAddress = await kyberStorage.reserveIdToAddresses(reserve.reserveId, 1);
                assert(await kyberStorage.convertReserveIdToAddress(reserve.reserveId) == newReserve.address, "new reserve address not equal to expected");

                Helper.assertEqual(newReserve.address, actualNewReserveAddress, "new reserve address not equal to expected");
                Helper.assertEqual(reserve.address, actualOldReserveAddress, "old reserve address not equal to expected");
            })
        });

        
        it("test get reserve method", async() => {
            // setup storage and reserve
            let kyberStorage = await KyberStorage.new(admin);
            let network = await KyberNetwork.new(admin, kyberStorage.address);
            await kyberStorage.addOperator(operator, {from: admin});
            await kyberStorage.setNetworkContract(network.address, {from: admin});
            // set up 1 mock reserve and 1 fpr reserve, 1 with fee and 1 not
            await kyberStorage.setFeeAccountedPerReserveType(true, true, true, false, true, true, {from: admin});
            await kyberStorage.setEntitledRebatePerReserveType(true, true, true, false, true, true, {from: admin});
            let result = await nwHelper.setupReserves(network, [token], 1,1,0,0, accounts, admin, operator);
            let reserveInstances = result.reserveInstances;
            let reserveAddresses= [];
            let reserveIds = [];
            let reserveFeeData = [];
            let reserveRebateData = [];
            let reserveRebateWalletData = [];

            // add all reserve to network
            for (const value of Object.values(reserveInstances)) {
                let reserve = value;
                if (reserve.type = "TYPE_MOCK") {
                    reserve.onChainType = ReserveType.UTILITY;
                }
                await kyberStorage.addReserve(reserve.address, reserve.reserveId, reserve.onChainType, reserve.rebateWallet, {from: operator});
                reserveAddresses.push(reserve.address);
                reserveIds.push(reserve.reserveId);
                reserveFeeData.push(reserve.type != "TYPE_MOCK");
                reserveRebateWalletData.push(reserve.rebateWallet);
                reserveRebateData.push(reserve.type != "TYPE_MOCK");

                assert(await kyberStorage.convertReserveAddresstoId(reserve.address) == reserve.reserveId, "unexpected reserveId");
                assert(await kyberStorage.convertReserveIdToAddress(reserve.reserveId) == reserve.address, "unexpected reserveId");
                let reserveData = await kyberStorage.getReserveDetailsById(reserve.reserveId);
                assert(reserveData.reserveAddress == reserve.address, "unexpected reserve address");
                assert(reserveData.resType == reserve.onChainType, "unexpected reserve on chain type");
                assert(reserveData.isFeeAccountedFlag == (reserve.type != "TYPE_MOCK"), "unexpected fee accounted flag");
                assert(reserveData.isEntitledRebateFlag == (reserve.type != "TYPE_MOCK"), "unexpected entitled rebate flag");
            }
            Helper.assertEqualArray(await kyberStorage.getReserves(), reserveAddresses, "unexpected reserve addresses");
            Helper.assertEqualArray(await kyberStorage.convertReserveAddressestoIds(reserveAddresses), reserveIds);
            Helper.assertEqualArray(await kyberStorage.convertReserveIdsToAddresses(reserveIds), reserveAddresses);
            Helper.assertEqualArray(await kyberStorage.getFeeAccountedData(reserveIds), reserveFeeData);
            Helper.assertEqualArray(await kyberStorage.getEntitledRebateData(reserveIds), reserveRebateData);
            let feeAccountedAndRebateResult = await kyberStorage.getReservesData(reserveIds);
            Helper.assertEqualArray(feeAccountedAndRebateResult.feeAccountedArr, reserveFeeData);
            Helper.assertEqualArray(feeAccountedAndRebateResult.entitledRebateArr, reserveRebateData);
        });
    });

    describe("test listing token pair and removing reserve", async() => {
        before("deploy and setup kyberStorage instance & add 1 mock reserve, & 1 mock token", async() => {
            kyberStorage = await KyberStorage.new(admin);
            network = await KyberNetwork.new(admin, kyberStorage.address);
            await kyberStorage.addOperator(operator, {from: admin});
            await kyberStorage.setNetworkContract(network.address, {from: admin});
            await kyberStorage.setFeeAccountedPerReserveType(true, true, true, false, true, true, {from: admin});
            await kyberStorage.setEntitledRebatePerReserveType(true, false, true, false, true, true, {from: admin});
            //init 2 mock reserve
            let result = await nwHelper.setupReserves(network, [], 2,0,0,0, accounts, admin, operator);
            reserveInstances = result.reserveInstances;
            numReserves = result.numAddedReserves * 1;
            for (const value of Object.values(reserveInstances)) {
                reserve = value;
                await kyberStorage.addReserve(reserve.address, reserve.reserveId, reserve.onChainType, reserve.rebateWallet, {from: operator});
            }

            //create token
            token = await TestToken.new("test", "tst", 18);
        });

        beforeEach("delist token pair on both sides", async() => {
            await kyberStorage.listPairForReserve(reserve.address, token.address, true, true, false, {from: operator});
        });

        it("should revert when listing token for non-reserve", async() => {
            await expectRevert(
                kyberStorage.listPairForReserve(user, token.address, true, true, true, {from: operator}),
                "reserveId = 0"
           );
        });

        it("should revert when removing non-reserve", async() => {
            await expectRevert(
                kyberStorage.removeReserve(user, zeroBN, {from : operator}),
                "reserve not found"
           );
        });

        it("should revert if reserveId is 0 when removing reserve", async() => {
            let mockStorage = await MockStorage.new(admin);
            let mockNetwork = await KyberNetwork.new(admin, mockStorage.address);
            await mockStorage.addOperator(operator, {from: admin});
            await mockStorage.setNetworkContract(mockNetwork.address, {from: admin});
            await mockStorage.setFeeAccountedPerReserveType(true, true, true, false, true, true, {from: admin});
            await mockStorage.setEntitledRebatePerReserveType(true, false, true, false, true, true, {from: admin});
            for (const value of Object.values(reserveInstances)) {
                reserve = value;
            }
            await mockStorage.addReserve(reserve.address, reserve.reserveId, reserve.onChainType, reserve.rebateWallet, {from: operator});
            await mockStorage.setReserveId(reserve.address, nwHelper.ZERO_RESERVE_ID);
            await expectRevert(
                mockStorage.removeReserve(reserve.address,zeroBN, {from: operator}),
                "reserve's existing reserveId is 0"
            );
        });

        it("should have reserveId reset to zero after removal", async() => {
            await kyberStorage.removeReserve(reserve.address, zeroBN, {from: operator});
            let reserveId = await kyberStorage.getReserveID(reserve.address);
            Helper.assertEqual(reserveId, nwHelper.ZERO_RESERVE_ID, "reserve id was not reset to zero");

            //reset
            await kyberStorage.addReserve(reserve.address, reserve.reserveId, reserve.onChainType, reserve.rebateWallet, {from: operator});
        });

        it("should list T2E side with 2 reserve", async() => {
            let reserveIds = [];
            for (let reserve of Object.values(reserveInstances)) {
                await kyberStorage.listPairForReserve(reserve.address, token.address, true, false, true, {from: operator});
                reserveIds.push(reserve.reserveId);
            }
            let result = await kyberStorage.getReservesPerTokenSrc(token.address);
            Helper.assertEqual(result.length, zeroBN, "E2T should not be listed");
            result = await kyberStorage.getReserveAddressesPerTokenSrc(token.address);
            Helper.assertEqual(result.length, zeroBN, "E2T should not be listed");

            result = await kyberStorage.getReservesPerTokenDest(token.address);
            Helper.assertEqualArray(result, reserveIds, "T2E should be listed");
            // delist for both side
            for (let reserve of Object.values(reserveInstances)) {
                await kyberStorage.listPairForReserve(reserve.address, token.address, true, true, false, {from: operator});
            }
        });

        it("should list T2E side only", async() => {
            await kyberStorage.listPairForReserve(reserve.address, token.address, true, false, true, {from: operator});
            let result = await kyberStorage.getReservesPerTokenSrc(token.address);
            Helper.assertEqual(result.length, zeroBN, "E2T should not be listed");
            result = await kyberStorage.getReserveAddressesPerTokenSrc(token.address);
            Helper.assertEqual(result.length, zeroBN, "E2T should not be listed");

            result = await kyberStorage.getReservesPerTokenDest(token.address);
            Helper.assertEqual(result[0], reserve.reserveId, "T2E should be listed");
        });

        it("should list E2T side only", async() => {
            await kyberStorage.listPairForReserve(reserve.address, token.address, false, true, true, {from: operator});
            let result = await kyberStorage.getReservesPerTokenSrc(token.address);
            Helper.assertEqual(result[0], reserve.reserveId, "E2T should be listed");
            result = await kyberStorage.getReserveAddressesPerTokenSrc(token.address);
            Helper.assertEqual(result[0], reserve.address, "E2T should be listed");

            result = await kyberStorage.getReservesPerTokenDest(token.address);
            Helper.assertEqual(result.length, zeroBN, "T2E should not be listed");
        });

        it("should list both T2E and E2T", async() => {
            await kyberStorage.listPairForReserve(reserve.address, token.address, true, true, true, {from: operator});
            let result = await kyberStorage.getReservesPerTokenSrc(token.address);
            Helper.assertEqual(result[0], reserve.reserveId, "E2T should be listed");
            result = await kyberStorage.getReserveAddressesPerTokenSrc(token.address);
            Helper.assertEqual(result[0], reserve.address, "E2T should be listed");

            result = await kyberStorage.getReservesPerTokenDest(token.address);
            Helper.assertEqual(result[0], reserve.reserveId, "T2E should be listed");
        });

        it("should delist T2E side only", async() => {
            await kyberStorage.listPairForReserve(reserve.address, token.address, true, true, true, {from: operator});
            await kyberStorage.listPairForReserve(reserve.address, token.address, false, true, false, {from: operator});
            let result = await kyberStorage.getReservesPerTokenSrc(token.address);
            Helper.assertEqual(result.length, zeroBN, "E2T should not be listed");
            result = await kyberStorage.getReserveAddressesPerTokenSrc(token.address);
            Helper.assertEqual(result.length, zeroBN, "E2T should not be listed");

            result = await kyberStorage.getReservesPerTokenDest(token.address);
            Helper.assertEqual(result[0], reserve.reserveId, "T2E should be listed");
        });

        it("should delist E2T side only", async() => {
            await kyberStorage.listPairForReserve(reserve.address, token.address, true, true, true, {from: operator});
            await kyberStorage.listPairForReserve(reserve.address, token.address, true, false, false, {from: operator});
            let result = await kyberStorage.getReservesPerTokenSrc(token.address);
            Helper.assertEqual(result[0], reserve.reserveId, "E2T should be listed");
            result = await kyberStorage.getReserveAddressesPerTokenSrc(token.address);
            Helper.assertEqual(result[0], reserve.address, "E2T should be listed");

            result = await kyberStorage.getReservesPerTokenDest(token.address);
            Helper.assertEqual(result.length, zeroBN, "T2E should not be listed");
        });

        it("should delist both T2E and E2T", async() => {
            await kyberStorage.listPairForReserve(reserve.address, token.address, true, true, true, {from: operator});
            await kyberStorage.listPairForReserve(reserve.address, token.address, true, true, false, {from: operator});
            let result = await kyberStorage.getReservesPerTokenSrc(token.address);
            Helper.assertEqual(result.length, zeroBN, "E2T should not be listed");
            result = await kyberStorage.getReserveAddressesPerTokenSrc(token.address);
            Helper.assertEqual(result[0], zeroBN, "E2T should not be listed");

            result = await kyberStorage.getReservesPerTokenDest(token.address);
            Helper.assertEqual(result.length, zeroBN, "T2E should not be listed");
        });

        it("should revert for listing twice (approving)", async() => {
            await kyberStorage.listPairForReserve(reserve.address, token.address, true, true, true, {from: operator});
            await expectRevert.unspecified(
                kyberStorage.listPairForReserve(reserve.address, token.address, true, true, true, {from: operator})
            )
            let result = await kyberStorage.getReservesPerTokenSrc(token.address);
            Helper.assertEqual(result[0], reserve.reserveId, "E2T should be listed");
            result = await kyberStorage.getReserveAddressesPerTokenSrc(token.address);
            Helper.assertEqual(result[0], reserve.address, "E2T should be listed");

            result = await kyberStorage.getReservesPerTokenDest(token.address);
            Helper.assertEqual(result[0], reserve.reserveId, "T2E should be listed");
        });
    });


    describe("test onlyAdmin and onlyOperator permissions", async() => {
        before("deploy storage instance, 1 mock reserve and 1 mock token", async() => {
            storage = await KyberStorage.new(admin);
            network = await KyberNetwork.new(admin, storage.address);
            await storage.addOperator(operator, {from: admin});
            await storage.setNetworkContract(network.address, {from:admin});
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
                storage.setFeeAccountedPerReserveType(true, true, true, false, true, true, {from: user}),
                "only admin"
            );
        });

        it("should have admin set fee accounted data", async() => {
            await storage.setFeeAccountedPerReserveType(true, true, true, false, true, true, {from: admin});
        });

        it("should not have unauthorized personnel set entitled rebate data", async() => {
            await expectRevert(
                storage.setEntitledRebatePerReserveType(true, false, true, false, true, true, {from: operator}),
                "only admin"
            );

            await expectRevert(
                storage.setEntitledRebatePerReserveType(true, false, true, false, true, true, {from: user}),
                "only admin"
            );
        });

        it("should have admin set entitled rebate data", async() => {
            await storage.setEntitledRebatePerReserveType(true, false, true, false, true, true, {from: admin});
        });

        it("should not have unauthorized personnel add reserve", async() => {
            await expectRevert(
                storage.addReserve(reserve.address, reserve.reserveId, reserve.onChainType, reserve.rebateWallet, {from: user}),
                "only operator"
            );

            await expectRevert(
                storage.addReserve(reserve.address, reserve.reserveId, reserve.onChainType, reserve.rebateWallet, {from: admin}),
                "only operator"
            );
        });

        it("should have operator adds reserve", async() => {
            await storage.setFeeAccountedPerReserveType(true, true, true, false, true, true, {from: admin});
            await storage.setEntitledRebatePerReserveType(true, false, true, false, true, true, {from: admin});
            await storage.addReserve(reserve.address, reserve.reserveId, reserve.onChainType, reserve.rebateWallet, {from: operator});
        });

        it("should not have unauthorized personnel remove reserve", async() => {
            await expectRevert(
                storage.removeReserve(reserve.address, 0, {from: user}),
                "only operator"
            );

            await expectRevert(
                storage.removeReserve(reserve.address, 0, {from: admin}),
                "only operator"
            );
        });

        it("should have operator removes reserve", async() => {
            await storage.removeReserve(reserve.address, 0, {from: operator});
        });
    });

    describe("test adding reserves", async() => {
        let tempNetwork;
        before("deploy and setup matchingEngine instance & 1 mock reserve", async() => {
            tempStorage = await KyberStorage.new(admin);
            tempNetwork = await KyberNetwork.new(admin, tempStorage.address);
            await tempStorage.addOperator(operator, {from: admin});
            await tempStorage.setNetworkContract(tempNetwork.address, {from: admin});

            //init 1 mock reserve
            let result = await nwHelper.setupReserves(tempNetwork, [], 1,0,0,0, accounts, admin, operator);
            reserveInstances = result.reserveInstances;
            numReserves = result.numAddedReserves * 1;
            for (const value of Object.values(reserveInstances)) {
                reserve = value;
            }
        });

        describe("test cases where reserve has never been added", async() => {
            it("should revert for NONE reserve type", async() => {
                await expectRevert(
                    tempStorage.addReserve(reserve.address, reserve.reserveId, 0, reserve.rebateWallet, {from: operator}),
                    "bad reserve type"
                );
            });

            it("should revert for LAST reserve type", async() => {
                await expectRevert(
                    tempStorage.addReserve(reserve.address, reserve.reserveId, 7, reserve.rebateWallet, {from: operator}),
                    "bad reserve type"
                );
            });

            it("should revert for valid reserve because fee accounted data not set", async() => {
                await expectRevert(
                    tempStorage.addReserve(reserve.address, reserve.reserveId, reserve.onChainType, reserve.rebateWallet, {from: operator}),
                    "fee accounted data not set"
                );
            });

            it("should revert when rebate is 0", async() => {
                let newReserve = await MockReserve.new();
                await expectRevert(
                    kyberStorage.addReserve(newReserve.address, reserve.reserveId, reserve.onChainType, zeroAddress, {from: operator}),
                    "rebate wallet is 0"
                );
            });

            it("should revert for valid reserve because entitled rebate data not set", async() => {
                await tempStorage.setFeeAccountedPerReserveType(true, true, true, false, true, true, {from: admin});
                await expectRevert(
                    tempStorage.addReserve(reserve.address, reserve.reserveId, reserve.onChainType, reserve.rebateWallet, {from: operator}),
                    "entitled rebate data not set"
                );
            });
        });

        describe("test cases for an already added reserve", async() => {
            before("add fee accounted and entitled rebate data and add reserve", async() => {
                await tempStorage.setFeeAccountedPerReserveType(true, true, true, false, true, true, {from: admin});
                await tempStorage.setEntitledRebatePerReserveType(true, false, true, false, true, true, {from: admin});
                await tempStorage.addReserve(reserve.address, reserve.reserveId, reserve.onChainType, reserve.rebateWallet, {from: operator});
            });

            it("should be able to re-add a reserve after its removal", async() => {
                await tempStorage.removeReserve(reserve.address, 0, {from: operator});
                await tempStorage.addReserve(reserve.address, reserve.reserveId, reserve.onChainType, reserve.rebateWallet, {from: operator});
            });
        });
    });

    describe("test fee accounted data per reserve", async() => {
        let token;
        let reserveInstances;
        let result;
        let totalReserveTypes = 6;
        let allReserveIDs = [];

        before("setup matchingEngine instance reserve per each reserve type", async() => {
            storage = await KyberStorage.new(admin);
            network = await KyberNetwork.new(admin, storage.address);
            await storage.addOperator(operator, {from: admin});
            await storage.setNetworkContract(network.address, {from: admin});
            await storage.setFeeAccountedPerReserveType(true, true, true, false, true, true, {from: admin});
            await storage.setEntitledRebatePerReserveType(true, true, true, false, true, true, {from: admin});

            //init token
            token = await TestToken.new("Token", "TOK", 18);

            result = await nwHelper.setupReserves(network, [token], totalReserveTypes, 0, 0, 0, accounts, admin, operator);
            reserveInstances = result.reserveInstances;

            //add reserves for all types, store reserve IDs in array
            let type = 1;
            for (reserve of Object.values(reserveInstances)) {
                await storage.addReserve(reserve.address, reserve.reserveId, type, reserve.rebateWallet, {from: operator});
                allReserveIDs.push(reserve.reserveId);
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
                    let actualResult = await storage.getReserveDetailsByAddress(reserve.address);
                    Helper.assertEqual(reserve.reserveId, actualResult.reserveId);
                    Helper.assertEqual(index + 1, actualResult.resType);
                    Helper.assertEqual(pay[index], actualResult.isFeeAccountedFlag);

                    actualResult = await storage.getReserveDetailsById(reserve.reserveId);
                    Helper.assertEqual(reserve.address, actualResult.reserveAddress);
                    Helper.assertEqual(index + 1, actualResult.resType);
                    Helper.assertEqual(pay[index], actualResult.isFeeAccountedFlag);
                    ++index;
                }

                actualResult = await storage.getFeeAccountedData(allReserveIDs);
                for (let index = 0; index < pay.length; index++) {
                    Helper.assertEqual(pay[index], actualResult[index]);
                }
                
                actualResult = await storage.getReservesData(allReserveIDs);
                for (let index = 0; index < pay.length; index++) {
                    Helper.assertEqual(pay[index], actualResult.feeAccountedArr[index]);
                }
            }
        });
    });

    describe("test entitled rebate data per reserve", async() => {
        let token;
        let reserveInstances;
        let result;
        let totalReserveTypes = 6;
        let allReserveIDs = [];

        before("setup matchingEngine instance", async() => {
            storage = await KyberStorage.new(admin);
            network = await KyberNetwork.new(admin, storage.address);
            await storage.setNetworkContract(network.address, {from: admin});
            await storage.addOperator(operator, {from: admin});
        });

        it("should revert when trying to set entitled rebate data if fee paying data not set yet", async() => {
            await expectRevert(
                storage.setEntitledRebatePerReserveType(true, true, true, true, true, true, {from: admin}),
                "fee accounted data not set"
            );
        });

        it("should revert if fpr is not fee accounted, but setting rebate entitlement to be true", async() => {
            await storage.setFeeAccountedPerReserveType(false, true, true, true, true, true, {from: admin});
            await expectRevert(
                storage.setEntitledRebatePerReserveType(true, true, true, true, true, true, {from: admin}),
                "fpr not fee accounted"
            );
        });

        it("should revert if apr is not fee accounted, but setting rebate entitlement to be true", async() => {
            await storage.setFeeAccountedPerReserveType(true, false, true, true, true, true, {from: admin});
            await expectRevert(
                storage.setEntitledRebatePerReserveType(true, true, true, true, true, true, {from: admin}),
                "apr not fee accounted"
            );
        });
        
        it("should revert if bridge is not fee accounted, but setting rebate entitlement to be true", async() => {
            await storage.setFeeAccountedPerReserveType(true, true, false, true, true, true, {from: admin});
            await expectRevert(
                storage.setEntitledRebatePerReserveType(true, true, true, true, true, true, {from: admin}),
                "bridge not fee accounted"
            );
        });

        it("should revert if utility is not fee accounted, but setting rebate entitlement to be true", async() => {
            await storage.setFeeAccountedPerReserveType(true, true, true, false, true, true, {from: admin});
            await expectRevert(
                storage.setEntitledRebatePerReserveType(true, true, true, true, true, true, {from: admin}),
                "utility not fee accounted"
            );
        });

        it("should revert if custom is not fee accounted, but setting rebate entitlement to be true", async() => {
            await storage.setFeeAccountedPerReserveType(true, true, true, true, false, true, {from: admin});
            await expectRevert(
                storage.setEntitledRebatePerReserveType(true, true, true, true, true, true, {from: admin}),
                "custom not fee accounted"
            );
        });
        
        it("should revert if orderbook is not fee accounted, but setting rebate entitlement to be true", async() => {
            await storage.setFeeAccountedPerReserveType(true, true, true, true, true, false, {from: admin});
            await expectRevert(
                storage.setEntitledRebatePerReserveType(true, true, true, true, true, true, {from: admin}),
                "orderbook not fee accounted"
            );
        });

        it("get reserve details while modifying entitled rebate per type. see as expected", async() => {
            await storage.setFeeAccountedPerReserveType(true, true, true, true, true, true, {from: admin});
            await storage.setEntitledRebatePerReserveType(true, true, true, true, true, true, {from: admin});

            //init token
            token = await TestToken.new("Token", "TOK", 18);

            result = await nwHelper.setupReserves(network, [token], totalReserveTypes, 0, 0, 0, accounts, admin, operator);
            reserveInstances = result.reserveInstances;

            //add reserves for all types, store reserve IDs in array
            let type = 1;
            for (reserve of Object.values(reserveInstances)) {
                await storage.addReserve(reserve.address, reserve.reserveId, type, reserve.rebateWallet, {from: operator});
                allReserveIDs.push(reserve.reserveId);
                type++;
            }

            let rebate = [];
            let numCombinations = totalReserveTypes ** 2;
            //generate different rebate combinations
            for (let i = 0; i < numCombinations; i++) {
                rebate = [];
                let j = i;
                for (let n = 1; j > 0; j = j >> 1, n = n * 2) {
                    rebate.push(j % 2 == 1);
                }
                let originalResLength = result.length;
                //append the rest of array with false values
                for (let k = 0; k < totalReserveTypes - originalResLength; k++) {
                    rebate = rebate.concat([false]);
                }

                await storage.setEntitledRebatePerReserveType(
                    rebate[0],
                    rebate[1],
                    rebate[2],
                    rebate[3],
                    rebate[4],
                    rebate[5],
                    {from: admin}
                );

                let index = 0;
                for (reserve of Object.values(reserveInstances)) {
                    let actualResult = await storage.getReserveDetailsByAddress(reserve.address);
                    Helper.assertEqual(reserve.reserveId, actualResult.reserveId);
                    Helper.assertEqual(index + 1, actualResult.resType);
                    Helper.assertEqual(true, actualResult.isFeeAccountedFlag);
                    Helper.assertEqual(rebate[index], actualResult.isEntitledRebateFlag);

                    actualResult = await storage.getReserveDetailsById(reserve.reserveId);
                    Helper.assertEqual(reserve.address, actualResult.reserveAddress);
                    Helper.assertEqual(index + 1, actualResult.resType);
                    Helper.assertEqual(true, actualResult.isFeeAccountedFlag);
                    Helper.assertEqual(rebate[index], actualResult.isEntitledRebateFlag);
                    ++index;
                }

                actualResult = await storage.getEntitledRebateData(allReserveIDs);
                for (let index = 0; index < rebate.length; index++) {
                    Helper.assertEqual(rebate[index], actualResult[index]);
                }
                
                actualResult = await storage.getReservesData(allReserveIDs);
                for (let index = 0; index < rebate.length; index++) {
                    Helper.assertEqual(rebate[index], actualResult.entitledRebateArr[index]);
                }
            }
        });
    });
});
