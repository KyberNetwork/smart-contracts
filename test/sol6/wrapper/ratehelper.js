const MockDao = artifacts.require('MockKyberDao.sol');
const KyberRateHelper = artifacts.require('KyberRateHelper.sol');
const TestToken = artifacts.require('Token.sol');
const MockReserve = artifacts.require('MockReserve.sol');
const KyberNetwork = artifacts.require('KyberNetwork.sol');

const BN = web3.utils.BN;
const Helper = require('../../helper.js');
const nwHelper = require('../networkHelper.js');
const {expectEvent, expectRevert} = require('@openzeppelin/test-helpers');

const {BPS, precisionUnits, ethDecimals, ethAddress, zeroAddress, emptyHint, zeroBN} = require('../../helper.js');
const {
  APR_ID,
  BRIDGE_ID,
  MOCK_ID,
  FPR_ID,
  type_apr,
  type_fpr,
  type_MOCK,
  MASK_IN_HINTTYPE,
  MASK_OUT_HINTTYPE,
  SPLIT_HINTTYPE,
  EMPTY_HINTTYPE,
  ReserveType
} = require('../networkHelper.js');
const {flatMap} = require('mathjs/lib');
const {assert} = require('chai');

//KyberDao related data
let rewardInBPS = new BN(7000);
let rebateInBPS = new BN(2000);
let epoch = new BN(3);
let expiryTimestamp;
let networkFeeBps = new BN(20);

let storage;
let dao;
let admin;
let operator;
let rateHelper;
let token;

const defaultBaseAmount = new BN(10).pow(new BN(16)); // 0.01 ether
const defaultSlippageAmount = new BN(10).pow(new BN(19)); // 10 ether

contract('KyberRateHelper', accounts => {
  before('global init ', async () => {
    admin = accounts[1];
    operator = accounts[2];

    token = await TestToken.new('test', 'tst', 16);
  });

  it('test const', async () => {
    rateHelper = await KyberRateHelper.new(admin);
    Helper.assertEqual(defaultBaseAmount, await rateHelper.DEFAULT_SLIPPAGE_QUERY_BASE_AMOUNT_WEI());
    Helper.assertEqual(defaultSlippageAmount, await rateHelper.DEFAULT_SLIPPAGE_QUERY_AMOUNT_WEI());
  });

  describe('test get spread function', async () => {
    let reserves;
    let reserveIds;
    let numReserve = 3;
    beforeEach('init storage and dao', async () => {
      storage = await nwHelper.setupStorage(admin);
      network = await KyberNetwork.new(admin, kyberStorage.address);
      await kyberStorage.setNetworkContract(network.address, {from: admin});
      await storage.addOperator(operator, {from: admin});
      //KyberDao related init.
      expiryTimestamp = (await Helper.getCurrentBlockTime()) + 10;
      dao = await MockDao.new(rewardInBPS, rebateInBPS, epoch, expiryTimestamp);
      await dao.setNetworkFeeBps(networkFeeBps);

      // bridge and utility has no fee
      await storage.setFeeAccountedPerReserveType(true, true, false, false, true, true, {
        from: admin
      });
      await storage.setEntitledRebatePerReserveType(true, false, false, false, true, true, {
        from: admin
      });
      reserves = [];
      reserveIds = [];
      for (let i = 0; i < numReserve; i++) {
        let reserve = await MockReserve.new();
        let reserveId = nwHelper.genReserveID(BRIDGE_ID, reserve.address).toLowerCase();
        reserves.push(reserve);
        reserveIds.push(reserveId);
        await storage.addReserve(reserve.address, reserveId, ReserveType.BRIDGE, reserve.address, {
          from: operator
        });
        await token.transfer(reserve.address, (new BN(1000000)).mul(new BN(10).pow(new BN(await token.decimals()))));
        await Helper.sendEtherWithPromise(accounts[0], reserve.address, (new BN(100)).mul(new BN(10).pow(new BN(ethDecimals))));
      }
      // 1 reserve is listed in 1 side, other reserves are not listed in the same order
      await storage.listPairForReserve(reserveIds[0], token.address, false, true, true, {
        from: operator
      });
      await storage.listPairForReserve(reserveIds[1], token.address, false, true, true, {
        from: operator
      });
      await storage.listPairForReserve(reserveIds[2], token.address, true, true, true, {
        from: operator
      });
      await storage.listPairForReserve(reserveIds[1], token.address, true, false, true, {
        from: operator
      });

      Helper.assertEqualArray(
        await storage.getReserveIdsPerTokenSrc(token.address),
        [reserveIds[0], reserveIds[1], reserveIds[2]],
        'unexpected listed reserveIds'
      );
      Helper.assertEqualArray(
        await storage.getReserveIdsPerTokenDest(token.address),
        [reserveIds[2], reserveIds[1]],
        'unexpected listed reserveIds'
      );

      rateHelper = await KyberRateHelper.new(admin);
      rateHelper.setContracts(dao.address, storage.address, {from: admin});
    });

    describe('test spread', async () => {
      it('if 0 rate return 20000', async () => {
        await reserves[0].setRate(token.address, precisionUnits, precisionUnits);
        await reserves[1].setRate(token.address, zeroBN, zeroBN);
        await reserves[2].setRate(token.address, precisionUnits, precisionUnits); // 0 spread
        let result = await rateHelper.getSpreadInfo(token.address, zeroBN);
        Helper.assertEqualArray(result.reserves, [reserveIds[2], reserveIds[1]], 'unexpected valid reserve');
        Helper.assertEqual(result.spreads, [zeroBN, BPS.mul(new BN(2))]);
      });

      it('if reservedSellRate < buyRate then return negative', async () => {
        await reserves[0].setRate(token.address, zeroBN, zeroBN);
        await reserves[1].setRate(token.address, zeroBN, zeroBN);

        let buyRate = precisionUnits.mul(new BN(100));
        let sellRate = precisionUnits.div(new BN(99));
        await reserves[2].setRate(token.address, buyRate, sellRate);
        let result = await rateHelper.getSpreadInfo(token.address, zeroBN);
        Helper.assertEqualArray(result.reserves, [reserveIds[2], reserveIds[1]], 'unexpected valid reserve');
        Helper.assertEqual(result.spreads, [getSpread(buyRate, sellRate), BPS.mul(new BN(2))], 'unexpected spread');
      });
    });

    it('test get spread with config reserve', async () => {
      // delist token on storage contract
      await storage.listPairForReserve(reserveIds[2], token.address, true, true, false, {
        from: operator
      });

      await rateHelper.addReserve(reserveIds[2], {from: admin});
      let buyRate = precisionUnits.mul(new BN(100));
      let sellRate = precisionUnits.div(new BN(101));
      await reserves[2].setRate(token.address, buyRate, sellRate);

      let result = await rateHelper.getSpreadInfoWithConfigReserves(token.address, zeroBN);
      Helper.assertEqualArray(result.reserves, [reserveIds[2]], 'unexpected valid reserve');
      Helper.assertEqual(result.spreads, [getSpread(buyRate, sellRate)], 'unexpected spread');

      // revert change
      await storage.listPairForReserve(reserveIds[2], token.address, true, true, true, {
        from: operator
      });
    });
  });

  describe('test slippage', async () => {
    let reserve;
    let reserveId;
    before('set up apr reserve', async () => {
      storage = await nwHelper.setupStorage(admin);
      network = await KyberNetwork.new(admin, kyberStorage.address);
      await kyberStorage.setNetworkContract(network.address, {from: admin});
      await storage.addOperator(operator, {from: admin});
      //KyberDao related init.
      expiryTimestamp = (await Helper.getCurrentBlockTime()) + 10;
      dao = await MockDao.new(rewardInBPS, rebateInBPS, epoch, expiryTimestamp);
      await dao.setNetworkFeeBps(networkFeeBps);

      // apr and bridge and utility has no fee
      await storage.setFeeAccountedPerReserveType(true, false, false, false, true, true, {
        from: admin
      });
      await storage.setEntitledRebatePerReserveType(true, false, false, false, true, true, {
        from: admin
      });
      // add an APR for test slipppage rate
      p0 = 1 / 5;
      let ethInit = new BN(10).pow(new BN(19)).mul(new BN(20));
      let pricing = await nwHelper.setupAprPricing(token, p0, admin, operator);
      reserve = await nwHelper.setupAprReserve(network, token, accounts[0], pricing.address, ethInit, admin, operator);
      await pricing.setReserveAddress(reserve.address, {from: admin});
      reserveId = nwHelper.genReserveID(APR_ID, reserve.address).toLowerCase();
      await storage.addReserve(reserve.address, reserveId, ReserveType.APR, reserve.address, {
        from: operator
      });
      await storage.listPairForReserve(reserveId, token.address, true, true, true, {
        from: operator
      });
      rateHelper = await KyberRateHelper.new(admin);
      rateHelper.setContracts(dao.address, storage.address, {from: admin});
    });

    it('test getSlippageRateInfo', async () => {
      let baseRates = await rateHelper.getReservesRates(token.address, defaultBaseAmount);
      let slippageRates = await rateHelper.getReservesRates(token.address, defaultSlippageAmount);
      let result = await rateHelper.getSlippageRateInfo(token.address, zeroBN, zeroBN);
      let expectedSlippageBps = getSlippageBps(baseRates.sellRates[0], slippageRates.sellRates[0], false);
      Helper.assertEqualArray(result.sellReserves, [reserveId], 'unexpected reserveId');
      Helper.assertEqual(result.sellSlippageRateBps[0], expectedSlippageBps, 'unexpected slippage BPS');

      expectedSlippageBps = getSlippageBps(baseRates.buyRates[0], slippageRates.buyRates[0], true);
      Helper.assertEqualArray(result.buyReserves, [reserveId], 'unexpected reserveId');
      Helper.assertEqual(result.buySlippageRateBps[0], expectedSlippageBps, 'unexpected slippage BPS');
    });

    it('test getSlippageRateInfoWithConfigReserves', async () => {
      let result = await rateHelper.getSlippageRateInfoWithConfigReserves(token.address, zeroBN, zeroBN);
      assert(result.reserves.length == 0, 'reserves should be empty');
      assert(result.buySlippageRateBps.length == 0, 'buySlippageRateBps should be empty');
      assert(result.sellSlippageRateBps.length == 0, 'sellSlippageRateBps should be empty');

      rateHelper.addReserve(reserveId, {from: admin});

      let baseRates = await rateHelper.getReservesRates(token.address, defaultBaseAmount);
      let slippageRates = await rateHelper.getReservesRates(token.address, defaultSlippageAmount);
      let expectedSlippageBps = getSlippageBps(baseRates.sellRates[0], slippageRates.sellRates[0], false);

      result = await rateHelper.getSlippageRateInfoWithConfigReserves(token.address, zeroBN, zeroBN);
      Helper.assertEqualArray(result.reserves, [reserveId], 'unexpected reserveId');
      Helper.assertEqual(result.sellSlippageRateBps[0], expectedSlippageBps, 'unexpected slippage BPS');

      expectedSlippageBps = getSlippageBps(baseRates.buyRates[0], slippageRates.buyRates[0], true);
      Helper.assertEqual(result.buySlippageRateBps[0], expectedSlippageBps, 'unexpected slippage BPS');
    });
  });
});

// assume buyRate and sellRate is not zero
function getSpread (buyRate, sellRate) {
  let reversedBuyRate = precisionUnits.pow(new BN(2)).div(buyRate);
  return new BN(2)
    .mul(BPS)
    .mul(reversedBuyRate.sub(sellRate))
    .div(reversedBuyRate.add(sellRate));
}

// assume baseRate and slippageRate !=0
function getSlippageBps (baseRate, slippageRate, isBuy) {
  if (slippageRate > baseRate) return zeroBN;
  if (!isBuy) {
    return BPS.mul(baseRate.sub(slippageRate)).div(baseRate);
  }
  let reversedBaseRate = precisionUnits.pow(new BN(2)).div(baseRate);
  let reversedSlippageRate = precisionUnits.pow(new BN(2)).div(slippageRate);
  return BPS.mul(reversedSlippageRate.sub(reversedBaseRate)).div(reversedBaseRate);
}
