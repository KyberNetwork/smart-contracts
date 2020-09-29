const SanityRates = artifacts.require('SanityRatesGasPrice.sol');
const TestToken = artifacts.require('Token.sol');
const {expectEvent, expectRevert} = require('@openzeppelin/test-helpers');
const Helper = require('../helper.js');
const nwHelper = require("./networkHelper.js");
const {BPS, precisionUnits, ethAddress, zeroAddress} = require('../helper.js');
const {web3} = require('@openzeppelin/test-helpers/src/setup');
const BN = web3.utils.BN;
const MAX_RATE = new BN(10).pow(new BN(25)); // 10**25

let sanityRates;
let admin;
let operator;
let numTokens = 5;
let token;
let tokens = [];
let tokenAddresses = [];
let tokenDecimals = [];
let rates = [];
let buyRate = [];
let sellRate = [];
let reasonableDiffs = [];
let gasPrice = web3.utils.toWei('100', 'gwei');

contract('SanityRatesGasPrice', function (accounts) {
  before('init globals.', async function () {
    admin = accounts[0];
    operator = accounts[5];
    randomAccount = accounts[9];

    //init tokens
    for (let i = 0; i < numTokens; i++) {
      tokenDecimals[i] = new BN(15).add(new BN(i));
      token = await TestToken.new(`test${i}`, 'tst' + i, tokenDecimals[i]);
      tokens[i] = token;
      tokenAddresses[i] = token.address;
    }
  });

  describe('test sanity rates with maxGasPrice setting', function () {
    before('init sanity rates.', async function () {
      for (let i = 0; i < numTokens; i++) {
        rates[i] = new BN(i + 1).mul(precisionUnits.div(new BN(10)));
        reasonableDiffs[i] = new BN(i * 100);
      }

      sanityRates = await SanityRates.new(admin, gasPrice);
      await sanityRates.addOperator(operator);

      await sanityRates.setReasonableDiff(tokenAddresses, reasonableDiffs);
    });

    it('should test return rate 0 when rate has not been set yet.', async function () {
      const rate0 = await sanityRates.getSanityRate(tokenAddresses[0], ethAddress);
      Helper.assertEqual(rate0, 0, '0 rate expected');
    });

    it('should test setting sanity rates.', async function () {
      await sanityRates.setSanityRates(tokenAddresses, rates, {from: operator});
    });

    it('check rates for token 0 (where diff is 0) so only tests rates.', async function () {
      const tokenToEthRate = await sanityRates.getSanityRate(tokenAddresses[0], ethAddress);
      Helper.assertEqual(tokenToEthRate, rates[0], 'unexpected rate');

      const expectedEthToToken = precisionUnits.mul(precisionUnits).div(tokenToEthRate);
      const ethToTokenRate = await sanityRates.getSanityRate(ethAddress, tokenAddresses[0]);
      Helper.assertEqual(expectedEthToToken, ethToTokenRate, 'unexpected rate');
    });

    it('check rates with reasonable diff.', async function () {
      const tokenInd = 1;
      const expectedTokenToEthRate = rates[tokenInd]
        .mul(BPS.add(reasonableDiffs[tokenInd]))
        .div(BPS);

      const tokenToEthRate = await sanityRates.getSanityRate(tokenAddresses[tokenInd], ethAddress);
      Helper.assertEqual(tokenToEthRate, expectedTokenToEthRate, 'unexpected rate');

      const expectedEthToToken = precisionUnits
        .mul(precisionUnits)
        .div(rates[tokenInd])
        .mul(BPS.add(reasonableDiffs[tokenInd]))
        .div(BPS);
      const ethToTokenRate = await sanityRates.getSanityRate(ethAddress, tokenAddresses[tokenInd]);
      Helper.assertEqual(expectedEthToToken, ethToTokenRate, 'unexpected rate');
    });

    it("should test can't init this contract with empty contracts (address 0).", async function () {
      let sanityRatess;

      try {
        sanityRatess = await SanityRates.new(zeroAddress, gasPrice);
        assert(false, 'throw was expected in line above.');
      } catch (e) {
        assert(Helper.isRevertErrorMessage(e), 'expected throw but got: ' + e);
      }

      sanityRatess = await SanityRates.new(admin, gasPrice);
    });

    it("should test can't init diffs when array lengths aren't the same.", async function () {
      reasonableDiffs.push(8);

      await expectRevert(
        sanityRates.setReasonableDiff(tokenAddresses, reasonableDiffs),
        'srcs,diff length mismatch'
      );

      reasonableDiffs.length = tokenAddresses.length;
      await sanityRates.setReasonableDiff(tokenAddresses, reasonableDiffs);
    });

    it("should test can't init diffs when value > max diff (10000 = 100%).", async function () {
      reasonableDiffs[0] = new BN(10001);

      await expectRevert(
        sanityRates.setReasonableDiff(tokenAddresses, reasonableDiffs),
        'Diff must be <= 10000 BPS or == MAX_RATE'
      );

      reasonableDiffs[0] = new BN(10000);
      await sanityRates.setReasonableDiff(tokenAddresses, reasonableDiffs);
    });

    it("should test can't init rates when array lengths aren't the same.", async function () {
      rates.push(new BN(8));

      await expectRevert(
        sanityRates.setSanityRates(tokenAddresses, rates, {from: operator}),
        'srcs,rates length mismatch'
      );

      rates.length = tokenAddresses.length;
      await sanityRates.setSanityRates(tokenAddresses, rates, {from: operator});
    });

    it('should test reverts when setting sanity rate to < 0 and > MAX_RATE.', async function () {
      const legalRate = MAX_RATE;
      const illegalMaxRate = MAX_RATE.add(new BN(1));
      const illegalZeroRate = new BN(0);

      rates[0] = illegalMaxRate;

      await expectRevert(
        sanityRates.setSanityRates(tokenAddresses, rates, {from: operator}),
        'rate must be > 0 and <= MAX_RATE'
      );

      rates[0] = illegalZeroRate;

      await expectRevert(
        sanityRates.setSanityRates(tokenAddresses, rates, {from: operator}),
        'rate must be > 0 and <= MAX_RATE'
      );

      rates[0] = legalRate;
      await sanityRates.setSanityRates(tokenAddresses, rates, {from: operator});
    });

    it('should test return rate 0 when both are tokens (no ether).', async function () {
      let rate0 = await sanityRates.getSanityRate(tokenAddresses[1], tokenAddresses[2]);
      Helper.assertEqual(rate0, 0, '0 rate expected');

      rate0 = await sanityRates.getSanityRate(tokenAddresses[0], tokenAddresses[1]);
      Helper.assertEqual(rate0, 0, '0 rate expected');

      rate0 = await sanityRates.getSanityRate(tokenAddresses[2], tokenAddresses[3]);
      Helper.assertEqual(rate0, 0, '0 rate expected');
    });

    it('should test setting max gas price.', async function () {
      gasPrice = web3.utils.toWei('150', 'gwei');
      const txResult = await sanityRates.setMaxGasPriceWei(gasPrice, {from: operator});

      expectEvent(txResult, 'SanityMaxGasPriceSet', {
        maxGasPrice: gasPrice,
      });
    });

    it('should test reverts when non admin is adding an operator.', async function () {
      gasPrice = web3.utils.toWei('100', 'gwei');

      await expectRevert(
        sanityRates.addOperator(operator, {
          from: randomAccount,
        }),
        'only admin'
      );
    });

    it('should test reverts when non admin is setting reasonable diff.', async function () {
      await expectRevert(
        sanityRates.setReasonableDiff(tokenAddresses, reasonableDiffs, {
          from: randomAccount,
        }),
        'only admin'
      );
    });

    it('should test reverts when non operator is setting max gas price.', async function () {
      gasPrice = web3.utils.toWei('100', 'gwei');

      await expectRevert(
        sanityRates.setMaxGasPriceWei(gasPrice, {
          from: randomAccount,
        }),
        'only operator'
      );
    });

    it('should test reverts when non operator is setting sanity rates.', async function () {
      await expectRevert(
        sanityRates.setSanityRates(tokenAddresses, rates, {
          from: randomAccount,
        }),
        'only operator'
      );
    });

    it('should test reverts setting max gas price to 0.', async function () {
      gasPrice = web3.utils.toWei('0', 'gwei');

      await expectRevert(
        sanityRates.setMaxGasPriceWei(gasPrice, {from: operator}),
        'maxGasPriceWei must be > 0'
      );
    });

    it('should test sanity rate is 0 when tx gas price > maxGasPrice.', async function () {
      const tokenToEthRate = await sanityRates.getSanityRate(tokenAddresses[0], ethAddress, {
        gasPrice: web3.utils.toWei('151', 'gwei'),
      });
      Helper.assertEqual(tokenToEthRate, 0, 'unexpected rate');
    });

    it('should test getting MAX_RATE as sanity rate if reasonable diff is set to MAX_RATE.', async function () {
      let sanityRate;
      for (let i = 0; i < numTokens; i++) {
        reasonableDiffs[i] = MAX_RATE;
      }

      await sanityRates.setReasonableDiff(tokenAddresses, reasonableDiffs);

      for (let i = 0; i < numTokens; i++) {
        sanityRate = await sanityRates.getSanityRate(tokenAddresses[i], ethAddress);
        Helper.assertEqual(sanityRate, MAX_RATE, 'unexpected rate');

        sanityRate = await sanityRates.getSanityRate(ethAddress, tokenAddresses[i]);
        Helper.assertEqual(sanityRate, MAX_RATE, 'unexpected rate');
      }
    });
  });

  describe('test reserve that uses SanityRatesGasPrice', function () {
    before('setup mock reserve and init sanity rates.', async function () {
      // init and setup mock reserve
      const reserves = await nwHelper.setupReserves(0, tokens, 1, 0, 0, 0, accounts, admin, operator);
      mockReserve = reserves.reserveInstances[Object.keys(reserves.reserveInstances)[0]].instance;
      
      gasPrice = web3.utils.toWei('100', 'gwei');
      sanityRates = await SanityRates.new(admin, gasPrice);
      await sanityRates.addOperator(operator);
      await mockReserve.setContracts(sanityRates.address);

      for (let i = 0; i < numTokens; i++) {
        rates[i] = new BN(i + 1).mul(precisionUnits.div(new BN(10)));
        reasonableDiffs[i] = new BN(i * 100);

        buyRate[i] = precisionUnits.mul(precisionUnits).div(rates[i]);
        sellRate[i] = rates[i];
        await mockReserve.setRate(tokenAddresses[i], buyRate[i], sellRate[i]);
      }

      await sanityRates.setSanityRates(tokenAddresses, rates, {from: operator});
      await sanityRates.setReasonableDiff(tokenAddresses, reasonableDiffs);
    });

    it('should test getting conversion rate.', async function () {
      const amountWei = new BN(2);
      const currentBlock = await Helper.getCurrentBlock();

      let conversionRate;
      for (let i = 0; i < numTokens; i++) {
        conversionRate = await mockReserve.getConversionRate(
          ethAddress,
          tokenAddresses[i],
          amountWei,
          currentBlock
        );
        Helper.assertEqual(conversionRate, buyRate[i], 'unexpected rate');

        conversionRate = await mockReserve.getConversionRate(
          tokenAddresses[i],
          ethAddress,
          amountWei,
          currentBlock
        );
        Helper.assertEqual(conversionRate, sellRate[i], 'unexpected rate');
      }
    });

    it('should test getting 0 conversion rate when tx gas price > maxGasPrice.', async function () {
      const amountWei = new BN(2);
      const currentBlock = await Helper.getCurrentBlock();

      let conversionRate;
      for (let i = 0; i < numTokens; i++) {
        conversionRate = await mockReserve.getConversionRate(
          ethAddress,
          tokenAddresses[i],
          amountWei,
          currentBlock,
          {
            gasPrice: web3.utils.toWei('101', 'gwei'),
          }
        );
        Helper.assertEqual(conversionRate, 0, 'unexpected rate');

        conversionRate = await mockReserve.getConversionRate(
          tokenAddresses[i],
          ethAddress,
          amountWei,
          currentBlock,
          {
            gasPrice: web3.utils.toWei('101', 'gwei'),
          }
        );
        Helper.assertEqual(conversionRate, 0, 'unexpected rate');
      }
    });

    it('should test getting conversion rates if reasonable diff is set to MAX_RATE.', async function () {
      for (let i = 0; i < numTokens; i++) {
        reasonableDiffs[i] = MAX_RATE;
      }

      await sanityRates.setReasonableDiff(tokenAddresses, reasonableDiffs);

      const amountWei = new BN(2);
      const currentBlock = await Helper.getCurrentBlock();

      let conversionRate;
      for (let i = 0; i < numTokens; i++) {
        conversionRate = await mockReserve.getConversionRate(
          ethAddress,
          tokenAddresses[i],
          amountWei,
          currentBlock
        );

        Helper.assertEqual(
          conversionRate,
          precisionUnits.mul(precisionUnits).div(rates[i]),
          'unexpected rate'
        );

        conversionRate = await mockReserve.getConversionRate(
          tokenAddresses[i],
          ethAddress,
          amountWei,
          currentBlock
        );
        Helper.assertEqual(conversionRate, rates[i], 'unexpected rate');
      }
    });
  });
});
