const TestToken = artifacts.require('TestToken.sol');
const StrictValidatingReserve = artifacts.require('StrictValidatingReserve.sol');
const LiquidityConversionRates = artifacts.require('LiquidityConversionRates.sol');
const TempBank = artifacts.require('TempBank.sol');

const BN = web3.utils.BN;
const {expectRevert} = require('@openzeppelin/test-helpers');

const {precisionUnits, ethAddress, ethDecimals, zeroAddress, emptyHint} = require('../helper.js');
const Helper = require('../helper.js');

const r = 0.0069315
const p0 = 0.0001 // 1m tokens = 100 eth
const e0 = 100.0 //69.315
const t0 = 1000000.0 //1m TOKENS
let feePercent = 0.25
const maxCapBuyInEth = 10
const maxCapSellInEth = 10
const pMinRatio = 0.5
const pMaxRatio = 2.0
const maxAllowance = new BN(2).pow(new BN(255));

//default value
const precision = new BN(10).pow(new BN(18))
const formulaPrecisionBits = 40
const formulaPrecision = new BN(2).pow(new BN(formulaPrecisionBits))
const tokenDecimals = 18
const tokenPrecision = new BN(10).pow(new BN(tokenDecimals))
const ethPrecission = new BN(10).pow(new BN(ethDecimals))

const baseNumber = 10 ** 9
const pMin = p0 * pMinRatio
const pMax = p0 * pMaxRatio

const feeInBps = feePercent * 100
const eInFp = new BN(e0 * baseNumber).mul(formulaPrecision).div(new BN(baseNumber))
const rInFp = new BN(r * baseNumber).mul(formulaPrecision).div(new BN(baseNumber))
const pMinInFp = new BN(pMin * baseNumber).mul(formulaPrecision).div(new BN(baseNumber))
const maxCapBuyInWei = new BN(maxCapBuyInEth).mul(precision)
const maxCapSellInWei = new BN(maxCapSellInEth).mul(precision)
const maxBuyRateInPrecision = new BN(1 / pMin).mul(precision)
const minBuyRateInPrecision = new BN(1 / pMax).mul(precision)
const maxSellRateInPrecision = new BN(pMax * baseNumber).mul(precision).div(new BN(baseNumber))
const minSellRateInPrecision = new BN(pMin * baseNumber).mul(precision).div(new BN(baseNumber))

let network
let admin
let reserve
let token
let liqConvRatesInst
let walletForToken

contract('StrictValidatingReserve', function (accounts) {
	before('one time init', async () => {
		admin = accounts[1];
		network = accounts[2];
		walletForToken = accounts[3];
		token = await TestToken.new('test', 'tst', new BN(tokenDecimals));
		liqConvRatesInst = await LiquidityConversionRates.new(admin, token.address);
		bank = await TempBank.new();
		reserve = await StrictValidatingReserve.new(network, liqConvRatesInst.address, admin);
		reserve.setBank(bank.address);
		await liqConvRatesInst.setLiquidityParams(
			rInFp,
			pMinInFp,
			formulaPrecisionBits,
			maxCapBuyInWei,
			maxCapSellInWei,
			feeInBps,
			maxSellRateInPrecision,
			minSellRateInPrecision,
			{from: admin}
		)
		await liqConvRatesInst.setReserveAddress(reserve.address, {from: admin})
		// await reserve.setTokenWallet(token.address, reserve.address, {from: admin});
		// assert balance for reserve and network
		await Helper.sendEtherWithPromise(accounts[0], reserve.address, new BN(10).pow(new BN(ethDecimals)).mul(new BN(100)))
		await Helper.assertSameEtherBalance(reserve.address, new BN(10).pow(new BN(ethDecimals)).mul(new BN(100)))
		await token.transfer(network, new BN(10).pow(new BN(tokenDecimals)).mul(new BN(200000)))
		await token.approve(reserve.address, maxAllowance, {from: network})

		await token.transfer(walletForToken, new BN(10).pow(new BN(tokenDecimals)).mul(new BN(200000)))
		await token.approve(reserve.address, maxAllowance, {from: walletForToken})
		await reserve.setTokenWallet(token.address, walletForToken, {from: admin});
	})

	describe('test trade', async () => {
		let currentblock;
		let srcSellQty = new BN(10).pow(new BN(tokenDecimals));
		let srcBuyQty = new BN(10).pow(new BN(14));
		before('init variable', async () => {
			currentblock = await Helper.getCurrentBlock();
		});

		it('test t2e trade execute successful with rate from getConversionRate', async () => {
			let sellrate = await liqConvRatesInst.getRate(token.address, currentblock, false, srcSellQty);
			await reserve.trade(token.address, srcSellQty, ethAddress, zeroAddress, sellrate, true, {from: network});
		})

		it('test e2t trade execute successful with rate from getConversionRate', async () => {
			let beforeBalance = await Helper.getBalancePromise(reserve.address);
			let buyRate = await liqConvRatesInst.getRate(token.address, currentblock, true, srcBuyQty);
			let reserveRate = await reserve.getConversionRate(ethAddress, token.address, srcBuyQty, currentblock);
			Helper.assertEqual(reserveRate, buyRate, "rate missmatch");
			await reserve.trade(ethAddress,  srcBuyQty, token.address, zeroAddress, reserveRate, true, {from: network, value: srcBuyQty});
			Helper.assertEqual(beforeBalance.add(srcBuyQty), await Helper.getBalancePromise(reserve.address));
		});

		it('test t2e trade revert with higher rate from getConversionRate', async () => {
			let sellrate = await liqConvRatesInst.getRate(token.address, currentblock, false, srcSellQty);
			await expectRevert.unspecified(
				reserve.trade(token.address, srcSellQty, ethAddress, zeroAddress, sellrate.add(new BN(1)), true, {from: network})
			);
		});

		it('test e2t trade revert with higher rate from getConversionRate', async () => {
			let buyRate = await reserve.getConversionRate(ethAddress, token.address, srcBuyQty, currentblock);
			await expectRevert.unspecified(
				reserve.trade(ethAddress,  srcBuyQty, token.address, zeroAddress, buyRate.add(new BN(1)), true, {from: network, value: srcBuyQty})
			);
		});
	});
});
