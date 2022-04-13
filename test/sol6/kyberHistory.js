const NimbleHistory = artifacts.require("NimbleHistory.sol");
const { expectEvent, expectRevert } = require('@openzeppelin/test-helpers');
const { zeroAddress } = require("../helper.js");
const Helper = require("../helper.js");

let user;
let admin;
let operator;
let storage;
let NimbleHistory;
let dao;

contract('NimbleHistory', function(accounts) {
    before("one time global init", async() => {
        //init accounts
        user = accounts[0];
        admin = accounts[1];
        operator = accounts[2];
        storage = accounts[3];
        dao = accounts[4];
    });

    describe("test onlyAdmin and onlyNetwork permissions", async() => {
        before("deploy NimbleHistory instance", async() => {
            NimbleHistory = await NimbleHistory.new(admin);
        });

        it("should not have unauthorized personnel set storage contract", async() => {
            await expectRevert(
                NimbleHistory.setStorageContract(storage, {from: user}),
                "only admin"
            );

            await expectRevert(
                NimbleHistory.setStorageContract(storage, {from: operator}),
                "only admin"
            );
        });

        it("should have admin set storage contract", async() => {
            await NimbleHistory.setStorageContract(storage, {from: admin});
        });

        it("should not have unauthorized personnel save contracts", async() => {
            await expectRevert(
                NimbleHistory.saveContract(dao, {from: user}),
                "only storage"
            );

            await expectRevert(
                NimbleHistory.saveContract(dao, {from: operator}),
                "only storage"
            );

            await expectRevert(
                NimbleHistory.saveContract(dao, {from: admin}),
                "only storage"
            );
        });

        it("should have storage contract save contract", async() => {
            await NimbleHistory.setStorageContract(storage, {from: admin});
            await NimbleHistory.saveContract(dao, {from: storage});
        });
    });

    describe("test contract event", async() => {
        it("NimbleStorageUpdated", async() => {
            NimbleHistory = await NimbleHistory.new(admin);
            let txResult = await NimbleHistory.setStorageContract(storage, {from: admin});
            expectEvent(txResult, 'NimbleStorageUpdated', {
                newStorage: storage
            });
        });
    });

    describe("test setting null storage address", async() => {
        before("setup NimbleHistory instance", async() => {
            NimbleHistory = await NimbleHistory.new(admin);
            await NimbleHistory.setStorageContract(storage, {from: admin});
        });

        it("should not set null storage contract", async() => {
            await expectRevert(
                NimbleHistory.setStorageContract(zeroAddress, {from: admin}),
                "storage 0"
            );
        });
    });

    describe("test saving and getting contracts", async() => {
        beforeEach("setup NimbleHistory instance", async() => {
            NimbleHistory = await NimbleHistory.new(admin);
            await NimbleHistory.setStorageContract(storage, {from: admin});
        });

        it("should save a contract", async() => {
            await NimbleHistory.saveContract(dao, {from: storage});
            let result = await NimbleHistory.getContracts();
            Helper.assertEqual([dao], result, "addresses not the same");
        });

        it("should do nothing if contract address didn't change", async() => {
            await NimbleHistory.saveContract(dao, {from: storage});

            let expectedResult = await NimbleHistory.getContracts();
            await NimbleHistory.saveContract(dao, {from: storage});
            let actualResult = await NimbleHistory.getContracts();
            Helper.assertEqualArray(expectedResult, actualResult, "addresses not the same");
        });

        it("should save and return multiple contracts in desired order", async() => {
            // save 3 contracts, then 1 more that is the same as the previous
            let dao2 = accounts[5];
            let dao3 = accounts[6];
            await NimbleHistory.saveContract(dao, {from: storage});
            await NimbleHistory.saveContract(dao2, {from: storage});
            await NimbleHistory.saveContract(dao3, {from: storage});
            await NimbleHistory.saveContract(dao3, {from: storage});
            let actualResult = await NimbleHistory.getContracts();
            Helper.assertEqualArray(
                [dao3, dao, dao2],
                actualResult,
                "addresses not the same"
            );
        });
    });
});
