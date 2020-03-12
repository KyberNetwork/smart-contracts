
let Permissions = artifacts.require("./PermissionGroups.sol");
let MockPermission = artifacts.require("./mockContracts/MockPermission.sol");

let Helper = require("../helper.js");

let permissionsInst;
let mockPermissionsInst;

let mainAdmin;
let secondAdmin;
let user;

const zeroAddress = '0x0000000000000000000000000000000000000000';
const thousandAddress = '0x0000000000000000000000000000000000001000';

contract('PermissionGroups', function(accounts) {
    it("should test request admin change is rejected for non admin.", async function () {
        // global inits in first test
        user = accounts[9];
        mainAdmin = accounts[0];
        secondAdmin = accounts[1];

        permissionsInst = await Permissions.new();
        mockPermissionsInst = await MockPermission.new();

        try {
            await permissionsInst.transferAdmin(accounts[1], {from:accounts[1]});
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("should test claim admin is rejected for unrelevant address.", async function () {
        try {
            await permissionsInst.claimAdmin();
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("should test quick admin transfer rejected for non admin address.", async function () {
        try {
            await permissionsInst.transferAdminQuickly(secondAdmin, {from: user});
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("should test quick admin transfer successful run.", async function () {
        await permissionsInst.transferAdminQuickly(secondAdmin, {from: mainAdmin});
        assert.strictEqual(await permissionsInst.admin.call(), secondAdmin)
        try {
            await permissionsInst.transferAdminQuickly(user, {from:mainAdmin})
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //and back
        await permissionsInst.transferAdminQuickly(mainAdmin, {from: secondAdmin});
        assert.strictEqual(await permissionsInst.admin.call(), mainAdmin)

        try {
            await permissionsInst.transferAdminQuickly(user, {from:secondAdmin})
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("should test quick admin transfer rejected for address 0.", async function () {
        try {
            await permissionsInst.transferAdminQuickly(zeroAddress, {from: mainAdmin});
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("should test successful admin change.", async function () {
        await permissionsInst.transferAdmin(accounts[1], {from:accounts[0]});
        await permissionsInst.claimAdmin({from:accounts[1]});
        await permissionsInst.transferAdmin(accounts[0], {from:accounts[1]});
        await permissionsInst.claimAdmin({from:accounts[0]});
    });

    it("should test can't claim admin with two addresses.", async function () {
        let currentAdmin = accounts[0];
        let pendingAdmin1 = accounts[1];
        let pendingAdmin2 = accounts[2];
        await permissionsInst.transferAdmin(pendingAdmin1, {from:currentAdmin});
        await permissionsInst.transferAdmin(pendingAdmin2, {from:currentAdmin});
        await permissionsInst.claimAdmin({from:pendingAdmin2});
        assert.strictEqual(await permissionsInst.admin.call(), pendingAdmin2)
        await permissionsInst.claimAdmin({from:pendingAdmin1}).catch(() => {});
        assert.strictEqual(await permissionsInst.admin.call(), pendingAdmin2)

        //give back admin
        await permissionsInst.transferAdmin(currentAdmin, {from:pendingAdmin2});
        await permissionsInst.claimAdmin({from:currentAdmin});
    });

    it("should test add alerter is rejected for non admin.", async function () {
        try {
            await permissionsInst.addAlerter(accounts[2], {from:accounts[2]});
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("should test add operator is rejected for non admin.", async function () {
        try {
            await permissionsInst.addOperator(accounts[2], {from:accounts[2]});
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("should test add operator success.", async function () {
        await permissionsInst.addOperator(accounts[1], {from:accounts[0]});
        await permissionsInst.addOperator(accounts[2], {from:accounts[0]});
    });

    it("should test get operators success.", async function () {
        let operators = await permissionsInst.getOperators();
        assert.equal(operators.length, 2, "bad number of operators.")
        assert.equal(accounts[1], operators[0]);
        assert.equal(accounts[2], operators[1]);
    });

    it("should test set rate is rejected for non operator.", async function () {
        mockPermissionsInst = await MockPermission.new();
        await mockPermissionsInst.addOperator(accounts[2]);
        await mockPermissionsInst.addOperator(accounts[3]);
        let operators = await permissionsInst.getOperators();

        try {
            await mockPermissionsInst.setRate(9, {from:accounts[6]});
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        let rate = await mockPermissionsInst.rate();
        assert.equal(rate, 0, "rate should be as initialized.")
    });

    it("should test set rate success for operator.", async function () {
        await mockPermissionsInst.setRate(9, {from:accounts[2]});
        let rate = await mockPermissionsInst.rate();
        assert.equal(rate, 9, "rate should be as initialized.")
    });

    it("should test stop trade is rejected for non alerter.", async function () {
        await mockPermissionsInst.addAlerter(accounts[8]);

        //activate trade - operator can do it.
        await mockPermissionsInst.activateTrade({from:accounts[2]});
        let tradeActive = await mockPermissionsInst.tradeActive();
        assert(tradeActive, "trade should have been activated.")

        try {
            await mockPermissionsInst.stopTrade({from:accounts[6]});
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        tradeActive = await mockPermissionsInst.tradeActive();
        assert(tradeActive, "trade should have been active.")
    });

    it("should test stop trade success for Alerter.", async function () {
        let tradeActive = await mockPermissionsInst.tradeActive();
        assert(tradeActive, "trade should have been active.")

        await mockPermissionsInst.stopTrade({from:accounts[8]});

        tradeActive = await mockPermissionsInst.tradeActive();
        assert(!tradeActive, "trade should have been stopped.")
    });

    it("should test remove operator is rejected for non admin.", async function () {
        try {
            await permissionsInst.removeOperator(accounts[2], {from:accounts[2]});
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("should test remove operator for non existing operator is reverted.", async function () {
        try {
            await permissionsInst.removeOperator(accounts[4]);
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("should test remove operator success.", async function () {
        await permissionsInst.removeOperator(accounts[2]);
        let operators = await permissionsInst.getOperators();
        assert.equal(operators.length, 1, "bad number of operators.")
        assert.equal(accounts[1], operators[0]);
    });

    it("should test add alerter success.", async function () {
        await permissionsInst.addAlerter(accounts[3], {from:accounts[0]});
        await permissionsInst.addAlerter(accounts[4], {from:accounts[0]});
    });

    it("should test get alerters success.", async function () {
        let alerters = await permissionsInst.getAlerters();
        assert.equal(alerters.length, 2, "bad number of operators.")
        assert.equal(accounts[3], alerters[0]);
        assert.equal(accounts[4], alerters[1]);
    });

    it("should test remove alerter is rejected for non admin.", async function () {
        try {
            await permissionsInst.removeAlerter(accounts[3], {from:accounts[2]});
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("should test remove alerter for non existing alerter is reverted.", async function () {
        try {
            await permissionsInst.removeAlerter(accounts[7]);
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("should test remove alerter success.", async function () {
        await permissionsInst.removeAlerter(accounts[3]);
        let alerters = await permissionsInst.getAlerters();
        assert.equal(alerters.length, 1, "bad number of alerters.")
        assert.equal(accounts[4], alerters[0]);
    });

    it("should test new admin address 0 is reverted.", async function () {
        let someAdmin = accounts[9];

        try {
            await permissionsInst.transferAdmin(zeroAddress);
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        await permissionsInst.transferAdmin(someAdmin);
    });

    it("should test can't add same alerter twice.", async function () {
        let alerter2 = accounts[9];

        await permissionsInst.addAlerter(alerter2);

        try {
            await permissionsInst.addAlerter(alerter2);
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("should test can't add same operator twice.", async function () {
        let operator2 = accounts[9];

        await permissionsInst.addOperator(operator2);

        try {
            await permissionsInst.addOperator(operator2);
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("should test removing 2nd alerter.", async function () {
        let alerter2 = accounts[2];
        let alerter3 = accounts[3];

        await permissionsInst.addAlerter(alerter2);
        await permissionsInst.addAlerter(alerter3);

        await permissionsInst.removeAlerter(alerter2);
    });

    it("should test can't add more then MAX_GROUP_SIZE (50) operators.", async function () {
        let operators = await permissionsInst.getOperators();

        for (let i = (operators.length); i < 50; i++) {
            intLength = i.toString().length;
            addressToAdd = zeroAddress.substring(0,zeroAddress.length - intLength) + i.toString();
            await permissionsInst.addOperator(addressToAdd);
        }

        try {
            await permissionsInst.addOperator(thousandAddress);
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("should test can't add more then MAX_GROUP_SIZE (50) alerters.", async function () {
        let alerters = await permissionsInst.getAlerters();

        for (let i = (alerters.length); i < 50; i++) {
            intLength = i.toString().length;
            addressToAdd = zeroAddress.substring(0,zeroAddress.length - intLength) + i.toString();
            await permissionsInst.addAlerter(addressToAdd);
        }

        try {
            await permissionsInst.addAlerter(thousandAddress);
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });
});