
var Permissions = artifacts.require("./PermissionGroups.sol");
var MockPermission = artifacts.require("./mockContracts/MockPermission.sol");

var Helper = require("./helper.js");

var permissionsInst;
var mockPermissionsInst;

contract('PermissionGroups', function(accounts) {
    it("should test request admin change is rejected for non admin.", async function () {
        // global inits in first test
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

    it("should test successful admin change.", async function () {
        await permissionsInst.transferAdmin(accounts[1], {from:accounts[0]});
        await permissionsInst.claimAdmin({from:accounts[1]});
        await permissionsInst.transferAdmin(accounts[0], {from:accounts[1]});
        await permissionsInst.claimAdmin({from:accounts[0]});
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
        var operators = await permissionsInst.getOperators();
        assert.equal(operators.length, 2, "bad number of operators.")
        assert.equal(accounts[1], operators[0]);
        assert.equal(accounts[2], operators[1]);
    });

    it("should test set rate is rejected for non operator.", async function () {
        mockPermissionsInst = await MockPermission.new();
        await mockPermissionsInst.addOperator(accounts[2]);
        await mockPermissionsInst.addOperator(accounts[3]);
        var operators = await permissionsInst.getOperators();

        try {
            await mockPermissionsInst.setRate(9, {from:accounts[6]});
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        let rate = await mockPermissionsInst.rate();
        assert.equal(rate.valueOf(), 0, "rate should be as initialized.")
    });

    it("should test set rate success for operator.", async function () {
        await mockPermissionsInst.setRate(9, {from:accounts[2]});
        let rate = await mockPermissionsInst.rate();
        assert.equal(rate.valueOf(), 9, "rate should be as initialized.")
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
        var operators = await permissionsInst.getOperators();
        assert.equal(operators.length, 1, "bad number of operators.")
        assert.equal(accounts[1], operators[0]);
    });

    it("should test add alerter success.", async function () {
        await permissionsInst.addAlerter(accounts[3], {from:accounts[0]});
        await permissionsInst.addAlerter(accounts[4], {from:accounts[0]});
    });

    it("should test get alerters success.", async function () {
        var alerters = await permissionsInst.getAlerters();
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
        var alerters = await permissionsInst.getAlerters();
        assert.equal(alerters.length, 1, "bad number of alerters.")
        assert.equal(accounts[4], alerters[0]);
    });
})