const UniswapV2FactoryOutput = require('@uniswap/v2-core/build/UniswapV2Factory.json')
const UniswapV2Router02Output = require('@uniswap/v2-periphery/build/UniswapV2Router02.json')
const KyberUniswapv2Reserve = artifacts.require('KyberUniswapv2Reserve.sol')
const WETH9 = artifacts.require('WETH9.sol')
const TestToken = artifacts.require('Token.sol')

const truffleContract = require('@truffle/contract')
const provider = web3.currentProvider
const BN = web3.utils.BN
const {expectEvent, expectRevert} = require('@openzeppelin/test-helpers')

const {
  BPS,
  precisionUnits,
  ethDecimals,
  ethAddress,
  zeroAddress,
  emptyHint,
  zeroBN,
  MAX_QTY,
  MAX_RATE
} = require('../../helper.js')
const Helper = require('../../helper.js')
const {assert} = require('chai')

let UniswapV2Factory
let UniswapV2Router02

let admin
let alerter
let network
let uniswapFactory
let uniswapRouter
let weth
let testToken
let testToken2
let reserve
let destAddress

let defaultBps = new BN(25)
let maxUint256 = new BN(2).pow(new BN(256)).sub(new BN(1))

contract('KyberUniswapv2Reserve', function (accounts) {
  before('init contract and accounts', async () => {
    UniswapV2Factory = truffleContract(UniswapV2FactoryOutput)
    UniswapV2Factory.setProvider(provider)
    UniswapV2Router02 = truffleContract(UniswapV2Router02Output)
    UniswapV2Router02.setProvider(provider)
    admin = accounts[1]
    network = accounts[2]
    destAddress = accounts[3]
    alerter = accounts[4]

    weth = await WETH9.new()
    testToken = await TestToken.new('test token', 'TST', new BN(15))
    testToken2 = await TestToken.new('test token', 'TST', new BN(19))

    uniswapFactory = await UniswapV2Factory.new(accounts[0], {from: accounts[0]})
    uniswapRouter = await UniswapV2Router02.new(uniswapFactory.address, weth.address, {
      from: accounts[0]
    })
  })

  describe('constructor params', () => {
    it('test revert if uniswapFactory 0', async () => {
      await expectRevert(
        KyberUniswapv2Reserve.new(zeroAddress, weth.address, admin, network),
        'uniswapRouter 0'
      )
    })

    it('test revert if weth 0', async () => {
      await expectRevert(
        KyberUniswapv2Reserve.new(uniswapFactory.address, zeroAddress, admin, network),
        'weth 0'
      )
    })

    it('test revert if kyberNetwork 0', async () => {
      await expectRevert(
        KyberUniswapv2Reserve.new(uniswapFactory.address, weth.address, admin, zeroAddress),
        'kyberNetwork 0'
      )
    })

    it('test revert if admin 0', async () => {
      await expectRevert(
        KyberUniswapv2Reserve.new(uniswapFactory.address, weth.address, zeroAddress, network),
        'admin 0'
      )
    })

    it('test constructor success', async () => {
      reserve = await KyberUniswapv2Reserve.new(
        uniswapRouter.address,
        weth.address,
        admin,
        network
      )

      assert(uniswapRouter.address == (await reserve.uniswapRouter()), 'unexpected uniswapFactory')
      assert(weth.address == (await reserve.weth()), 'unexpected weth')
      assert(network == (await reserve.kyberNetwork()), 'unexpected kyberNetwork')
    })
  })

  describe('send and withdraw token', async () => {
    let sendAmount = new BN(10).pow(new BN(18))
    before('set up reserve', async () => {
      reserve = await KyberUniswapv2Reserve.new(
        uniswapRouter.address,
        weth.address,
        admin,
        network
      )
    })

    it('test reserve able to receive ether', async () => {
      await Helper.sendEtherWithPromise(accounts[0], reserve.address, sendAmount)
    })

    it('test revert if withdraw from non-admin', async () => {
      await expectRevert(reserve.withdrawEther(sendAmount, network, {from: network}), 'only admin')
    })

    it('test withdraw from admin', async () => {
      await reserve.withdrawEther(sendAmount, admin, {from: admin})
    })
  })

  describe('test permission operation', () => {
    let testToken
    before('set up reserve', async () => {
      reserve = await KyberUniswapv2Reserve.new(
        uniswapRouter.address,
        weth.address,
        admin,
        network
      )
      await reserve.addAlerter(alerter, {from: admin})
      testToken = await TestToken.new('test token', 'TST', new BN(15))
    })

    it('test setFee only admin', async () => {
      let txResult = await reserve.setFee(new BN(100), {from: admin})
      expectEvent(txResult, 'FeeUpdated', {
        feeBps: new BN(100)
      })
    })

    it('test revert setFee if not admin', async () => {
      await expectRevert(reserve.setFee(new BN(100), {from: destAddress}), 'only admin')
    })

    it('test revert setFee if fee is too high', async () => {
      await expectRevert(reserve.setFee(BPS, {from: admin}), 'fee >= BPS')
    })

    it('test disable trade revert if not alerter', async () => {
      await expectRevert(reserve.disableTrade({from: admin}), 'only alerter')
    })

    it('test disable trade success', async () => {
      let txResult = await reserve.disableTrade({from: alerter})
      expectEvent(txResult, 'TradeEnabled', {
        enable: false
      })
    })

    it('test enable trade revert if not admin', async () => {
      await expectRevert(reserve.enableTrade({from: alerter}), 'only admin')
    })

    it('test enable trade success', async () => {
      let txResult = await reserve.enableTrade({from: admin})
      expectEvent(txResult, 'TradeEnabled', {
        enable: true
      })
    })

    describe('test list - delist token', async () => {
      it('test list token revert from non-admin', async () => {
        await expectRevert(reserve.listToken(testToken.address, {from: alerter}), 'only admin')
      })

      it('test list token revert if token 0', async () => {
        await expectRevert(reserve.listToken(zeroAddress, {from: admin}), 'token 0')
      })

      it('test list token revert if token pair does not exist', async () => {
        await expectRevert(
          reserve.listToken(testToken.address, {from: admin}),
          'uniswapPair not found'
        )
      })

      it('test list token revert if token pair does not have liquidity', async () => {
        // create the pair but no liquidity
        await uniswapFactory.createPair(testToken.address, weth.address, {from: accounts[0]})
        await expectRevert(
          reserve.listToken(testToken.address, {from: admin}),
          'insufficient liquidity'
        )
      })
      it('test list token success', async () => {
        //add liquidity to the pair
        let numTestToken = new BN(10).pow(new BN(18))
        await testToken.approve(uniswapRouter.address, numTestToken)
        await uniswapRouter.addLiquidityETH(
          testToken.address,
          numTestToken,
          new BN(0),
          new BN(0),
          accounts[0],
          maxUint256,
          {value: new BN(10).pow(new BN(19)).mul(new BN(5)), from: accounts[0]}
        )
        let txResult = await reserve.listToken(testToken.address, {from: admin})
        expectEvent(txResult, 'TokenListed', {
          token: testToken.address,
          add: true
        })

        assert(await reserve.tokenListed(testToken.address), 'tokenListed is false')
      })

      it('test delist token revert if not admin', async () => {
        await expectRevert(reserve.delistToken(testToken.address, {from: alerter}), 'only admin')
      })

      it('test delist token revert if not listed token', async () => {
        await expectRevert(reserve.delistToken(network, {from: admin}), 'token is not listed')
      })

      it('test delist token success', async () => {
        let uniswapPair = await uniswapFactory.getPair(testToken.address, weth.address)
        let txResult = await reserve.delistToken(testToken.address, {from: admin})
        expectEvent(txResult, 'TokenListed', {
          token: testToken.address,
          add: false
        })

        assert(!(await reserve.tokenListed(testToken.address)), 'tokenListed should be removed')
      })
    })
  })

  describe('test getConventionRate function', () => {
    let srcAmount = new BN(10).pow(new BN(14))
    let testToken
    let testTokenDecimal = new BN(15)
    let feeBps = new BN(89)
    before('set up reserve', async () => {
      reserve = await KyberUniswapv2Reserve.new(
        uniswapRouter.address,
        weth.address,
        admin,
        network
      )
      await reserve.setFee(feeBps, {from: admin})

      testToken = await TestToken.new('test token', 'TST', testTokenDecimal)
      let numTestToken = new BN(10).pow(new BN(18))
      await testToken.approve(uniswapRouter.address, numTestToken)

      await uniswapRouter.addLiquidityETH(
        testToken.address,
        numTestToken,
        new BN(0),
        new BN(0),
        accounts[0],
        maxUint256,
        {value: new BN(10).pow(new BN(19)).mul(new BN(5)), from: accounts[0]}
      )
      await reserve.listToken(testToken.address, {from: admin})
    })

    it('test getConventionRate for e2t', async () => {
      let rate = await reserve.getConversionRate(
        ethAddress,
        testToken.address,
        srcAmount,
        new BN(0)
      )
      let uniswapDstQty = await uniswapRouter.getAmountsOut(
        srcAmount.mul(BPS.sub(feeBps)).div(BPS),
        [weth.address, testToken.address]
      )

      let expectedRate = Helper.calcRateFromQty(
        srcAmount,
        uniswapDstQty[1],
        ethDecimals,
        testTokenDecimal
      )
      Helper.assertEqual(rate, expectedRate, 'unexpected rate')
    })

    it('test getConventionRate for t2e', async () => {
      let rate = await reserve.getConversionRate(
        testToken.address,
        ethAddress,
        srcAmount,
        new BN(0)
      )

      let uniswapDstQty = await uniswapRouter.getAmountsOut(srcAmount, [
        testToken.address,
        weth.address
      ])

      let expectedRate = Helper.calcRateFromQty(
        srcAmount,
        uniswapDstQty[1].mul(BPS.sub(feeBps)).div(BPS),
        testTokenDecimal,
        ethDecimals
      )
      Helper.assertEqual(rate, expectedRate, 'unexpected rate')
    })
  })

  describe('test trade function', async () => {
    let unlistedToken = accounts[5]
    before('set up ', async () => {
      let numTestToken = new BN(10).pow(new BN(18)).mul(new BN(3))
      await testToken.approve(uniswapRouter.address, maxUint256)
      let numTestToken2 = new BN(10).pow(new BN(20)).mul(new BN(5))
      await testToken2.approve(uniswapRouter.address, maxUint256)
      // add pair weth-testToken
      await uniswapRouter.addLiquidityETH(
        testToken.address,
        numTestToken,
        new BN(0),
        new BN(0),
        accounts[0],
        maxUint256,
        {value: new BN(10).pow(new BN(19)).mul(new BN(5)), from: accounts[0]}
      )
      // add pair weth-testToken2
      await uniswapRouter.addLiquidityETH(
        testToken2.address,
        numTestToken2,
        new BN(0),
        new BN(0),
        accounts[0],
        maxUint256,
        {value: new BN(10).pow(new BN(19)).mul(new BN(5)), from: accounts[0]}
      )
      // add pair testToken2-testToken
      await uniswapRouter.addLiquidity(
        testToken.address,
        testToken2.address,
        numTestToken,
        numTestToken2,
        new BN(0),
        new BN(0),
        accounts[0],
        maxUint256,
        {from: accounts[0]}
      )

      reserve = await KyberUniswapv2Reserve.new(
        uniswapRouter.address,
        weth.address,
        admin,
        network
      )
      await reserve.listToken(testToken.address, {from: admin})
      await reserve.addAlerter(alerter, {from: admin})
    })

    it('test trade revert if token is not listed', async () => {
      let srcAmount = new BN(10).pow(new BN(16)).mul(new BN(3))
      await expectRevert(
        reserve.trade(ethAddress, srcAmount, unlistedToken, destAddress, new BN(1), true, {
          value: srcAmount,
          from: network
        }),
        'token is not listed'
      )
    })

    it('test trade revert if not from network', async () => {
      let srcAmount = new BN(10).pow(new BN(16)).mul(new BN(3))
      let rate = await reserve.getConversionRate(ethAddress, testToken.address, srcAmount, zeroBN)
      Helper.assertGreater(rate, zeroBN, 'rate 0')

      await expectRevert(
        reserve.trade(ethAddress, srcAmount, testToken.address, destAddress, rate, true, {
          value: srcAmount,
          from: admin
        }),
        'only kyberNetwork'
      )
    })

    it('test trade revert if trade is disabled', async () => {
      await reserve.disableTrade({from: alerter})
      let srcAmount = new BN(10).pow(new BN(16)).mul(new BN(3))

      await expectRevert(
        reserve.trade(ethAddress, srcAmount, testToken.address, destAddress, new BN(1), true, {
          value: srcAmount,
          from: admin
        }),
        'trade is disabled'
      )
      await reserve.enableTrade({from: admin})
    })

    it('test e2t', async () => {
      let srcAmount = new BN(10).pow(new BN(16)).mul(new BN(3))
      let rate = await reserve.getConversionRate(ethAddress, testToken.address, srcAmount, zeroBN)
      Helper.assertGreater(rate, zeroBN, 'rate 0')

      await reserve.trade(ethAddress, srcAmount, testToken.address, destAddress, rate, true, {
        value: srcAmount,
        from: network
      })
    })

    it('test t2e', async () => {
      let srcAmount = new BN(10).pow(new BN(14)).mul(new BN(2))
      let rate = await reserve.getConversionRate(testToken.address, ethAddress, srcAmount, zeroBN)
      Helper.assertGreater(rate, zeroBN, 'rate 0')

      await testToken.transfer(network, srcAmount)
      await testToken.approve(reserve.address, srcAmount, {from: network})

      await reserve.trade(testToken.address, srcAmount, ethAddress, destAddress, rate, true, {
        from: network
      })
    })

    describe('test trade with undirect path', async () => {
      before('remove direct path, add undirect path only', async () => {
        await reserve.removePath(testToken.address, true, 0, {from: admin})
        await reserve.removePath(testToken.address, false, 0, {from: admin})
        await reserve.addPath(
          testToken.address,
          [testToken.address, testToken2.address, weth.address],
          false,
          {from: admin}
        )
        await reserve.addPath(
          testToken.address,
          [weth.address, testToken2.address, testToken.address],
          true,
          {from: admin}
        )
      })

      it('test e2t', async () => {
        let srcAmount = new BN(10).pow(new BN(16)).mul(new BN(3))
        let rate = await reserve.getConversionRate(
          ethAddress,
          testToken.address,
          srcAmount,
          zeroBN
        )
        Helper.assertGreater(rate, zeroBN, 'rate 0')

        await reserve.trade(ethAddress, srcAmount, testToken.address, destAddress, rate, true, {
          value: srcAmount,
          from: network
        })
      })

      it('test t2e', async () => {
        let srcAmount = new BN(10).pow(new BN(14)).mul(new BN(2))
        let rate = await reserve.getConversionRate(
          testToken.address,
          ethAddress,
          srcAmount,
          zeroBN
        )
        Helper.assertGreater(rate, zeroBN, 'rate 0')

        await testToken.transfer(network, srcAmount)
        await testToken.approve(reserve.address, srcAmount, {from: network})

        await reserve.trade(testToken.address, srcAmount, ethAddress, destAddress, rate, true, {
          from: network
        })
      })
    })
  })
})
