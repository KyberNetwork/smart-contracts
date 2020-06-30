let MockPermission = artifacts.require('./MockPermissionGroups3.sol');
let Permission = artifacts.require('./PermissionGroups3.sol');
let Helper = require('../helper.js');

const BN = web3.utils.BN;
const {zeroAddress, zeroBN} = require('../helper.js');
const {expectEvent, expectRevert} = require('@openzeppelin/test-helpers');
const MAX_GROUP_SIZE = 50;

let permissionsInst;

let mainAdmin;
let secondAdmin;
let operator;
let alerter;
let user;

contract('PermissionGroups3', function (accounts) {
  before('init global accounts', async () => {
    // global inits in first test
    user = accounts[0];
    mainAdmin = accounts[1];
    secondAdmin = accounts[2];
    operator = accounts[3];
    alerter = accounts[4];
  });

  beforeEach('it should deploy a new permissions group inst', async () => {
    permissionsInst = await MockPermission.new({from: mainAdmin});
  });

  describe('test events', async () => {
    it('TransferAdminPending', async () => {
      let txResult = await permissionsInst.transferAdmin(user, {from: mainAdmin});
      console.log(txResult.logs[0].args.pendingAdmin);
      expectEvent(txResult, 'TransferAdminPending', {
        pendingAdmin: user
      });
    });

    it('AdminClaimed', async () => {
      await permissionsInst.transferAdmin(user, {from: mainAdmin});
      let txResult = await permissionsInst.claimAdmin({from: user});
      expectEvent(txResult, 'AdminClaimed', {
        newAdmin: user,
        previousAdmin: mainAdmin
      });
    });

    it('AlerterAdded', async () => {
      let txResult = await permissionsInst.addAlerter(user, {from: mainAdmin});
      expectEvent(txResult, 'AlerterAdded', {
        newAlerter: user,
        isAdd: true
      });
    });

    it('OperatorAdded', async () => {
      let txResult = await permissionsInst.addOperator(user, {from: mainAdmin});
      expectEvent(txResult, 'OperatorAdded', {
        newOperator: user,
        isAdd: true
      });
    });
  });

  describe('test admin', async () => {
    it('should revert request admin change for non-admin', async () => {
      await expectRevert(permissionsInst.transferAdmin(user, {from: user}), 'only admin');
    });

    it('should revert request admin change quickly for non-admin', async () => {
      await expectRevert(
        permissionsInst.transferAdminQuickly(secondAdmin, {from: secondAdmin}),
        'only admin'
      );
    });

    it('should revert claim admin if transferAdmin was not initialised', async () => {
      await expectRevert(permissionsInst.claimAdmin({from: secondAdmin}), 'not pending');
    });

    it('should test quick admin transfer successful run', async () => {
      await permissionsInst.transferAdminQuickly(secondAdmin, {from: mainAdmin});
      Helper.assertEqual(await permissionsInst.admin(), secondAdmin, 'failed to transfer admin');
      await expectRevert(
        permissionsInst.transferAdminQuickly(secondAdmin, {from: mainAdmin}),
        'only admin'
      );

      //and transfer back to mainAdmin
      await permissionsInst.transferAdminQuickly(mainAdmin, {from: secondAdmin});
      Helper.assertEqual(await permissionsInst.admin(), mainAdmin, 'failed to transfer admin');
      await expectRevert(
        permissionsInst.transferAdminQuickly(mainAdmin, {from: secondAdmin}),
        'only admin'
      );
    });

    it('should revert for transferring admin to zeroAddress', async () => {
      await expectRevert(
        permissionsInst.transferAdmin(zeroAddress, {from: mainAdmin}),
        'new admin 0'
      );
    });

    it('should revert for transferring admin quickly to zeroAddress', async () => {
      await expectRevert(
        permissionsInst.transferAdminQuickly(zeroAddress, {from: mainAdmin}),
        'admin 0'
      );
    });

    it('should test successful admin change', async () => {
      await permissionsInst.transferAdmin(user, {from: mainAdmin});
      await permissionsInst.claimAdmin({from: user});
      await permissionsInst.transferAdmin(secondAdmin, {from: user});
      await permissionsInst.claimAdmin({from: secondAdmin});
    });

    it("should test can't claim admin with two addresses", async () => {
      let pendingAdmin1 = accounts[3];
      let pendingAdmin2 = accounts[4];
      await permissionsInst.transferAdmin(pendingAdmin1, {from: mainAdmin});
      await permissionsInst.transferAdmin(pendingAdmin2, {from: mainAdmin});
      await permissionsInst.claimAdmin({from: pendingAdmin2});
      Helper.assertEqual(await permissionsInst.admin(), pendingAdmin2);
      await expectRevert(permissionsInst.claimAdmin({from: pendingAdmin1}), 'not pending');
    });

    it('should revert for zeroAddress in constructor', async () => {
      await expectRevert(Permission.new(zeroAddress, {from: mainAdmin}), 'admin 0');
    });
  });

  describe('test operator', async () => {
    it('should revert adding operator for non admin', async () => {
      await expectRevert(permissionsInst.addOperator(operator, {from: secondAdmin}), 'only admin');
    });

    it('should successfully add and getting operators', async () => {
      await permissionsInst.addOperator(secondAdmin, {from: mainAdmin});
      await permissionsInst.addOperator(operator, {from: mainAdmin});
      let operators = await permissionsInst.getOperators();
      isOperator = operators.findIndex(op => op == operator) != -1;
      assert.isTrue(isOperator, 'second admin not operator.');
      operators = await permissionsInst.getOperators();
      isOperator = operators.findIndex(op => op == operator) != -1;
      assert.isTrue(isOperator, 'operator not operator.');
    });

    it('should revert for adding existing operator', async () => {
      await permissionsInst.addOperator(operator, {from: mainAdmin});
      await expectRevert(
        permissionsInst.addOperator(operator, {from: mainAdmin}),
        'operator exists'
      );
    });

    it('should test set rate is rejected for non operator', async () => {
      let newRate = new BN(10);
      await permissionsInst.addOperator(operator, {from: mainAdmin});
      await expectRevert(permissionsInst.setRate(newRate, {from: accounts[6]}), 'only operator');

      let rate = await permissionsInst.rate();
      Helper.assertEqual(rate, zeroBN, 'rate should be as initialized');
    });

    it('should test set rate is rejected for non operator.', async () => {
      let newRate = new BN(10);
      await permissionsInst.addOperator(operator, {from: mainAdmin});
      await permissionsInst.setRate(newRate, {from: operator});
      let rate = await permissionsInst.rate();
      Helper.assertEqual(newRate, rate, 'rate should be as set');
    });

    it('should revert removing non-existent operator', async () => {
      await expectRevert(
        permissionsInst.removeOperator(operator, {from: mainAdmin}),
        'not operator'
      );
    });

    it('should revert removing operator by non-admin', async () => {
      await permissionsInst.addOperator(operator, {from: mainAdmin});
      await expectRevert(
        permissionsInst.removeOperator(operator, {from: secondAdmin}),
        'only admin'
      );
    });

    it('should remove operator by admin', async () => {
      await permissionsInst.addOperator(operator, {from: mainAdmin});
      await permissionsInst.removeOperator(operator, {from: mainAdmin});
      let operators = await permissionsInst.getOperators();
      isOperator = operators.findIndex(op => op == operator) != -1;
      assert.isFalse(isOperator, 'should have removed operator');
    });

    it('should add MAX_GROUP_SIZE operators, and should fail adding more', async () => {
      for (i = 0; i < MAX_GROUP_SIZE; i++) {
        let intLength = i.toString().length;
        let addressToAdd = zeroAddress.substring(0, zeroAddress.length - intLength) + i.toString();
        await permissionsInst.addOperator(addressToAdd, {from: mainAdmin});
        let operators = await permissionsInst.getOperators();
        isOperator = operators.findIndex(op => op == addressToAdd) != -1;
        assert.isTrue(isOperator, 'operator ' + i + " wasn't added successfully.");
      }
      await expectRevert(
        permissionsInst.addOperator(operator, {from: mainAdmin}),
        'max operators'
      );
    });

    it('should removing MAX_GROUP_SIZE operators.', async () => {
      for (i = 0; i < MAX_GROUP_SIZE; i++) {
        let intLength = i.toString().length;
        let addressToAdd = zeroAddress.substring(0, zeroAddress.length - intLength) + i.toString();
        await permissionsInst.addOperator(addressToAdd, {from: mainAdmin});
      }

      for (i = 0; i < MAX_GROUP_SIZE; i++) {
        intLength = i.toString().length;
        addressToAdd = zeroAddress.substring(0, zeroAddress.length - intLength) + i.toString();
        await permissionsInst.removeOperator(addressToAdd, {from: mainAdmin});
        let operators = await permissionsInst.getOperators();
        isOperator = operators.findIndex(op => op == addressToAdd) != -1;
        assert.isFalse(isOperator, 'operator ' + i + " wasn't removed successfully.");
      }
    });
  });

  describe('test alerter', async () => {
    it('should revert adding alerter for non admin', async () => {
      await expectRevert(permissionsInst.addAlerter(user, {from: secondAdmin}), 'only admin');
    });

    it('should successfully add and getting alerters', async () => {
      await permissionsInst.addAlerter(secondAdmin, {from: mainAdmin});
      await permissionsInst.addAlerter(alerter, {from: mainAdmin});
      let alerters = await permissionsInst.getAlerters();
      let isAlerter = alerters.findIndex(alert => alert == secondAdmin) != -1;
      assert.isTrue(isAlerter, 'second admin not alerter.');
      isAlerter = alerters.findIndex(alert => alert == alerter) != -1;
      assert.isTrue(isAlerter, 'alerter not alerter.');
    });

    it('should revert for adding existing alerter', async () => {
      await permissionsInst.addAlerter(alerter, {from: mainAdmin});
      await expectRevert(permissionsInst.addAlerter(alerter, {from: mainAdmin}), 'alerter exists');
    });

    it('should revert stopping trade for non alerter.', async () => {
      await permissionsInst.addOperator(operator, {from: mainAdmin});
      await permissionsInst.addAlerter(alerter, {from: mainAdmin});

      //activate trade - operator can do it.
      await permissionsInst.activateTrade({from: operator});
      let tradeActive = await permissionsInst.tradeActive();
      assert.isTrue(tradeActive, 'trade should have been activated.');

      await expectRevert(permissionsInst.stopTrade({from: user}), 'only alerter');
    });

    it('should stop trade success for alerter.', async () => {
      await permissionsInst.addOperator(operator, {from: mainAdmin});
      await permissionsInst.addAlerter(alerter, {from: mainAdmin});
      await permissionsInst.activateTrade({from: operator});

      await permissionsInst.stopTrade({from: alerter});
      let tradeActive = await permissionsInst.tradeActive();
      assert.isFalse(tradeActive, 'trade should have been stopped.');
    });

    it('should revert removing non-existent alerter', async () => {
      await expectRevert(permissionsInst.removeAlerter(alerter, {from: mainAdmin}), 'not alerter');
    });

    it('should revert removing alerter by non-admin', async () => {
      await permissionsInst.addAlerter(alerter, {from: mainAdmin});
      await expectRevert(
        permissionsInst.removeAlerter(alerter, {from: secondAdmin}),
        'only admin'
      );
    });

    it('should remove alerter by admin', async () => {
      await permissionsInst.addAlerter(alerter, {from: mainAdmin});
      await permissionsInst.removeAlerter(alerter, {from: mainAdmin});
      let alerters = await permissionsInst.getAlerters();
      let isAlerter = alerters.findIndex(alert => alert == alerter) != -1;
      assert.isFalse(isAlerter, 'should have removed alerter');
    });

    it('should add MAX_GROUP_SIZE alerters, and should fail adding more', async () => {
      for (i = 0; i < MAX_GROUP_SIZE; i++) {
        let intLength = i.toString().length;
        let addressToAdd = zeroAddress.substring(0, zeroAddress.length - intLength) + i.toString();
        await permissionsInst.addAlerter(addressToAdd, {from: mainAdmin});
        let alerters = await permissionsInst.getAlerters();
        let isAlerter = alerters.findIndex(alert => alert == addressToAdd) != -1;
        assert.isTrue(isAlerter, 'alerter ' + i + " wasn't added successfully.");
      }
      await expectRevert(permissionsInst.addAlerter(alerter, {from: mainAdmin}), 'max alerters');
    });

    it('should removing MAX_GROUP_SIZE alerters.', async () => {
      for (i = 0; i < MAX_GROUP_SIZE; i++) {
        let intLength = i.toString().length;
        let addressToAdd = zeroAddress.substring(0, zeroAddress.length - intLength) + i.toString();
        await permissionsInst.addAlerter(addressToAdd, {from: mainAdmin});
      }

      for (i = 0; i < MAX_GROUP_SIZE; i++) {
        intLength = i.toString().length;
        addressToAdd = zeroAddress.substring(0, zeroAddress.length - intLength) + i.toString();
        await permissionsInst.removeAlerter(addressToAdd, {from: mainAdmin});
        let alerters = await permissionsInst.getAlerters();
        let isAlerter = alerters.findIndex(alert => alert == addressToAdd) != -1;
        assert.isFalse(isAlerter, 'alerter ' + i + " wasn't removed successfully.");
      }
    });
  });
});
