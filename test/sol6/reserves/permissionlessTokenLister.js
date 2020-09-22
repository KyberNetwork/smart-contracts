const TestToken = artifacts.require('Token');
const MockBridgeReserve = artifacts.require('MockBridgeReserve');
const MockSimpleStorage = artifacts.require('MockSimpleStorage');
const PermissionlessTokenLister = artifacts.require('PermissionlessTokenLister');

const truffleContract = require('@truffle/contract');
const provider = web3.currentProvider;
const BN = web3.utils.BN;
const {expectEvent, expectRevert} = require('@openzeppelin/test-helpers');

const {BRIDGE_ID} = require('../networkHelper.js');
const {zeroAddress} = require('../../helper.js');
const Helper = require('../../helper.js');
const nwHelper = require('../networkHelper.js');

let admin;
let operator;
let storage;
let bridgeReserve;
let bridgeReserveId;

contract('PermissionlessTokenLister', function (accounts) {
  before('init contract and accounts', async () => {
    admin = accounts[1];
    operator = accounts[2];

    storage = await MockSimpleStorage.new(admin);
    await storage.addOperator(operator, {from: admin});
    bridgeReserve = await MockBridgeReserve.new(admin);
    await bridgeReserve.addOperator(operator, {from: admin});
    bridgeReserveId = nwHelper.genReserveID(BRIDGE_ID, bridgeReserve.address);
    // add reserve to storage
    await storage.addReserve(bridgeReserveId, bridgeReserve.address);
  });

  describe('#Test constructor', async () => {
    it('Test constructor, correct data recorded', async () => {
      let lister = await PermissionlessTokenLister.new(admin, storage.address, bridgeReserveId);
      Helper.assertEqual(admin, await lister.admin());
      Helper.assertEqual(storage.address, await lister.kyberStorage());
      Helper.assertEqual(bridgeReserveId, await lister.bridgeReserveId());
    });

    it('Test constructor, revert invalid param', async () => {
      await expectRevert(PermissionlessTokenLister.new(zeroAddress, storage.address, bridgeReserveId), 'admin 0');
      await expectRevert(PermissionlessTokenLister.new(admin, zeroAddress, bridgeReserveId), 'storage is 0');
      await expectRevert(
        PermissionlessTokenLister.new(admin, storage.address, nwHelper.ZERO_RESERVE_ID),
        'bridge reserveId is 0'
      );
    });
  });

  describe('#Test update kyber storage', async () => {
    let lister;
    before('deploy lister', async () => {
      lister = await PermissionlessTokenLister.new(admin, storage.address, bridgeReserveId);
    });

    it('Test reverts not admin', async () => {
      let newStorage = accounts[5];
      await expectRevert(lister.updateKyberStorage(newStorage, {from: operator}), 'only admin');
    });

    it('Test reverts storage is 0', async () => {
      await expectRevert(lister.updateKyberStorage(zeroAddress, {from: admin}), 'storage is 0');
    });

    it('Test record new data and event', async () => {
      await lister.updateKyberStorage(accounts[4], {from: admin});
      Helper.assertEqual(accounts[4], await lister.kyberStorage());
      let tx = await lister.updateKyberStorage(accounts[5], {from: admin});
      expectEvent(tx, 'UpdateKyberStorage', {
        kyberStorage: accounts[5],
      });
      Helper.assertEqual(accounts[5], await lister.kyberStorage());
      tx = await lister.updateKyberStorage(accounts[5], {from: admin});
      Helper.assertEqual(0, tx.receipt.logs.length);
      Helper.assertEqual(accounts[5], await lister.kyberStorage());
    });
  });

  describe('#Test update excluded tokens', async () => {
    let lister;
    before('deploy lister', async () => {
      lister = await PermissionlessTokenLister.new(admin, storage.address, bridgeReserveId);
      await lister.addOperator(operator, {from: admin});
    });

    it('Test reverst not operator', async () => {
      let token = await TestToken.new('test token', 'TST', 18);
      await expectRevert(lister.updateExcludedTokens([token.address], true, {from: admin}), 'only operator');
      await expectRevert(lister.updateExcludedTokens([token.address], false, {from: admin}), 'only operator');
    });

    it('Test reverst token is 0', async () => {
      await expectRevert(lister.updateExcludedTokens([zeroAddress], true, {from: operator}), 'token is 0');
      await expectRevert(lister.updateExcludedTokens([zeroAddress], false, {from: operator}), 'token is 0');
      let token = await TestToken.new('test token', 'TST', 18);
      await expectRevert(
        lister.updateExcludedTokens([token.address, zeroAddress], true, {from: operator}),
        'token is 0'
      );
      await expectRevert(
        lister.updateExcludedTokens([token.address, zeroAddress], false, {from: operator}),
        'token is 0'
      );
    });

    it('Test update excluded tokens correctly', async () => {
      let token = await TestToken.new('test token', 'TST', 18);
      let tx = await lister.updateExcludedTokens([token.address], true, {from: operator});
      Helper.assertEqual(true, await lister.excludedTokens(token.address));
      expectEvent(tx, 'UpdateExcludedTokens', {
        isAdd: true,
      });
      tx = await lister.updateExcludedTokens([token.address], false, {from: operator});
      Helper.assertEqual(false, await lister.excludedTokens(token.address));
      expectEvent(tx, 'UpdateExcludedTokens', {
        isAdd: false,
      });
      let eventLogs;
      for (let i = 0; i < tx.logs.length; i++) {
        if (tx.logs[i].event == 'UpdateExcludedTokens') {
          eventLogs = tx.logs[i];
          break;
        }
      }
      Helper.assertEqual(1, eventLogs.args.tokens.length);
      Helper.assertEqual(token.address, eventLogs.args.tokens[0]);

      let tokenAddresses = [];
      for (let i = 0; i < 10; i++) {
        token = await TestToken.new(`test token ${i}`, `TST${i}`, i + 4);
        tokenAddresses.push(token.address);
      }
      await lister.updateExcludedTokens(tokenAddresses, true, {from: operator});
      for (let i = 0; i < 10; i++) {
        Helper.assertEqual(true, await lister.excludedTokens(tokenAddresses[i]));
      }
      await lister.updateExcludedTokens(tokenAddresses, false, {from: operator});
      for (let i = 0; i < 10; i++) {
        Helper.assertEqual(false, await lister.excludedTokens(tokenAddresses[i]));
      }
      // delist again
      await lister.updateExcludedTokens(tokenAddresses, false, {from: operator});
      for (let i = 0; i < 10; i++) {
        Helper.assertEqual(false, await lister.excludedTokens(tokenAddresses[i]));
      }
    });
  });

  describe('#Test list token', async () => {
    let lister;
    let tokens = [];
    before('deploy lister', async () => {
      lister = await PermissionlessTokenLister.new(admin, storage.address, bridgeReserveId);
      await lister.addOperator(operator, {from: admin});
      for (let i = 0; i < 10; i++) {
        let token = await TestToken.new(`test token ${i}`, `TST${i}`, i + 4);
        tokens.push(token.address);
      }
      await storage.addOperator(lister.address, {from: admin});
      await bridgeReserve.addOperator(lister.address, {from: admin});
    });

    it('Test reverts reserve is not listed in storage', async () => {
      // get random reserve id
      let id = nwHelper.genReserveID(BRIDGE_ID, accounts[3]);
      let tempLister = await PermissionlessTokenLister.new(admin, storage.address, id);
      await expectRevert(tempLister.listTokens(tokens), 'reserveId not found');
    });

    it('Test reverts token is 0', async () => {
      await expectRevert(lister.listTokens([zeroAddress]), 'token is 0');
    });

    it('Test reverts token is excluded', async () => {
      let token = await TestToken.new('test token', 'TST', 18);
      await lister.updateExcludedTokens([token.address], true, {from: operator});
      await expectRevert(lister.listTokens([token.address]), 'token is excluded');
      await lister.updateExcludedTokens([token.address], false, {from: operator});
    });

    it('Test revert lister is not operator of storage', async () => {
      let tempLister = await PermissionlessTokenLister.new(admin, storage.address, bridgeReserveId);
      await expectRevert(tempLister.listTokens(tokens), 'only operator');
    });

    it('Test revert lister is not operator of bridge reserve', async () => {
      let tempLister = await PermissionlessTokenLister.new(admin, storage.address, bridgeReserveId);
      await storage.addOperator(tempLister.address, {from: admin});
      await expectRevert(tempLister.listTokens(tokens), 'only operator');
    });

    it('Test list token that has been listed in bridge', async () => {
      let token = await TestToken.new('test token', 'TST', 18);
      await bridgeReserve.listToken(token.address, true, true, {from: operator});
      Helper.assertEqual(true, await bridgeReserve.tokenListed(token.address));
      await lister.listTokens([token.address]);
      Helper.assertEqual(true, await bridgeReserve.tokenListed(token.address));
    });

    it('Test list token', async () => {
      let tx = await lister.listTokens(tokens);
      for (let i = 0; i < tokens.length; i++) {
        Helper.assertEqual(true, await bridgeReserve.tokenListed(tokens[i]));
      }
      expectEvent(tx, 'TokensListed', {});
      let eventLogs;
      for (let i = 0; i < tx.logs.length; i++) {
        if (tx.logs[i].event == 'TokensListed') {
          eventLogs = tx.logs[i];
          break;
        }
      }
      Helper.assertEqual(tokens.length, eventLogs.args.tokens.length);
      for (let i = 0; i < tokens.length; i++) {
        Helper.assertEqual(tokens[i], eventLogs.args.tokens[i]);
      }
    });
  });

  describe('#Test delist token', async () => {
    let lister;
    let tokens = [];
    before('deploy lister', async () => {
      lister = await PermissionlessTokenLister.new(admin, storage.address, bridgeReserveId);
      await lister.addOperator(operator, {from: admin});
      for (let i = 0; i < 10; i++) {
        let token = await TestToken.new(`test token ${i}`, `TST${i}`, i + 4);
        tokens.push(token.address);
      }
      await storage.addOperator(lister.address, {from: admin});
      await bridgeReserve.addOperator(lister.address, {from: admin});
    });

    it('Test reverts not operator', async () => {
      // get random reserve id
      await expectRevert(lister.delistTokens(tokens, {from: admin}), 'only operator');
    });

    it('Test reverts reserve is not listed in storage', async () => {
      // get random reserve id
      let id = nwHelper.genReserveID(BRIDGE_ID, accounts[3]);
      let tempLister = await PermissionlessTokenLister.new(admin, storage.address, id);
      await tempLister.addOperator(operator, {from: admin});
      await expectRevert(tempLister.delistTokens(tokens, {from: operator}), 'reserveId not found');
    });

    it('Test reverts token is 0', async () => {
      await expectRevert(lister.delistTokens([zeroAddress], {from: operator}), 'token is 0');
    });

    it('Test revert lister is not operator of storage', async () => {
      let tempLister = await PermissionlessTokenLister.new(admin, storage.address, bridgeReserveId);
      await tempLister.addOperator(operator, {from: admin});
      await expectRevert(tempLister.delistTokens(tokens, {from: operator}), 'only operator');
    });

    it('Test revert lister is not operator of bridge reserve', async () => {
      let tempLister = await PermissionlessTokenLister.new(admin, storage.address, bridgeReserveId);
      await storage.addOperator(tempLister.address, {from: admin});
      let token = await TestToken.new('test token', 'TST', 18);
      await bridgeReserve.listToken(token.address, true, true, {from: operator});
      await expectRevert(tempLister.delistTokens(tokens, {from: operator}), 'only operator');
      await bridgeReserve.delistToken(token.address, {from: operator});
    });

    it('Test delist token that has been delisted or not listed in bridge', async () => {
      let token = await TestToken.new('test token', 'TST', 18);
      Helper.assertEqual(false, await bridgeReserve.tokenListed(token.address));
      await lister.delistTokens([token.address], {from: operator});
      Helper.assertEqual(false, await bridgeReserve.tokenListed(token.address));
      await bridgeReserve.listToken(token.address, true, true, {from: operator});
      await bridgeReserve.delistToken(token.address, {from: operator});
      await lister.delistTokens([token.address], {from: operator});
      Helper.assertEqual(false, await bridgeReserve.tokenListed(token.address));
    });

    it('Test delist token', async () => {
      let tx = await lister.delistTokens(tokens, {from: operator});
      for (let i = 0; i < tokens.length; i++) {
        Helper.assertEqual(false, await bridgeReserve.tokenListed(tokens[i]));
      }
      expectEvent(tx, 'TokensDelisted', {});
      let eventLogs;
      for (let i = 0; i < tx.logs.length; i++) {
        if (tx.logs[i].event == 'TokensDelisted') {
          eventLogs = tx.logs[i];
          break;
        }
      }
      Helper.assertEqual(tokens.length, eventLogs.args.tokens.length);
      for (let i = 0; i < tokens.length; i++) {
        Helper.assertEqual(tokens[i], eventLogs.args.tokens[i]);
      }

      // list tokens
      await lister.listTokens(tokens);
      // delist token
      await lister.delistTokens(tokens, {from: operator});
      for (let i = 0; i < tokens.length; i++) {
        Helper.assertEqual(false, await bridgeReserve.tokenListed(tokens[i]));
      }
    });
  });
});
