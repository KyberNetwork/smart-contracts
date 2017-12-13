
var Permissions = artifacts.require("./Permissions.sol");
var MockPermission = artifacts.require("./mockContracts/MockPermissions.sol");

var Helper = require("./helper.js");

var permissionsInst;
var mockPermissionsInst;

contract('Permissions', function(accounts) {
    it("should test request ownership transfer is rejected for non admin.", async function () {
        // global inits in first test
        permissionsInst = await Permissions.new();
        mockPermissionsInst = await MockPermission.new();

        try {
            await permissionsInst.requestOwnershipTransfer(accounts[1], {from:accounts[1]});
            assert(true, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("should test accept ownership is rejected for unrelevant address.", async function () {
        try {
            await permissionsInst.acceptOwnerShip();
            assert(true, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("should test successful ownership transfer.", async function () {
        await permissionsInst.requestOwnershipTransfer(accounts[1], {from:accounts[0]});
        await permissionsInst.acceptOwnerShip({from:accounts[1]});
        await permissionsInst.requestOwnershipTransfer(accounts[0], {from:accounts[1]});
        await permissionsInst.acceptOwnerShip({from:accounts[0]});
    });

    it("should test add alerter is rejected for non admin.", async function () {
        try {
            await permissionsInst.addAlerter(accounts[2], {from:accounts[2]});
            assert(true, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("should test add operator is rejected for non admin.", async function () {
        try {
            await permissionsInst.addOperator(accounts[2], {from:accounts[2]});
            assert(true, "throw was expected in line above.")
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

    it("should test set price is rejected for non operator.", async function () {
        mockPermissionsInst = await MockPermission.new();
        await mockPermissionsInst.addOperator(accounts[2]);
        await mockPermissionsInst.addOperator(accounts[3]);

        try {
            await mockPermissionsInst.setPrice(9, {from:accounts[6]});
            assert(true, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        let price = await mockPermissionsInst.price();
        assert.equal(price.valueOf, 0, "price should be as initialized.")
    });

    it("should test set price success for operator.", async function () {
        await mockPermissionsInst.setPrice(9, {from:accounts[2]});
        let price = await mockPermissionsInst.price();
        assert.equal(price.valueOf, 9, "price should be as initialized.")
    });

    it("should test stop trade is rejected for non alerter.", async function () {
        await mockPermissionsInst.addAlerter(accounts[8]);

        //activate trade - operator can do it.
        await mockPermissionsInst.activateTrade();
        let tradeActive = mockPermissionsInst.tradeActive();
        assert(!tradeActive, "trade should have been activated.")

        try {
            await mockPermissionsInst.stopTrade({from:accounts[6]});
            assert(true, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        tradeActive = mockPermissionsInst.tradeActive();
        assert(!tradeActive, "trade should have been activated.")
    });

    it("should test stop trade success for Alerter.", async function () {
        let tradeActive = mockPermissionsInst.tradeActive();
        assert(!tradeActive, "trade should have been activated.")

        await mockPermissionsInst.stopTrade({from:accounts[8]});

        tradeActive = mockPermissionsInst.tradeActive();
        assert(tradeActive, "trade should have been stopped.")
    });


    it("should test remove operator is rejected for non admin.", async function () {
        try {
            await permissionsInst.removeOperator(accounts[2], {from:accounts[2]});
            assert(true, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("should test remove operator for non existing operator is reverted.", async function () {
        try {
            await permissionsInst.removeOperator(accounts[4]);
            assert(true, "throw was expected in line above.")
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
            assert(true, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("should test remove alerter for non existing alerter is reverted.", async function () {
        try {
            await permissionsInst.removeAlerter(accounts[7]);
            assert(true, "throw was expected in line above.")
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