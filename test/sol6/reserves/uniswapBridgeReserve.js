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

let UniswapV2Factory
let UniswapV2Router02

let admin
let network
let uniswapFactory
let uniswapRouter
let weth
let testToken
let reserve
let destAddress

let deadline = new BN(2).pow(new BN(255))

contract('KyberUniswapv2Reserve', function (accounts) {
  before('init contract and accounts', async () => {
    UniswapV2Factory = truffleContract(UniswapV2FactoryOutput)
    UniswapV2Factory.setProvider(provider)
    UniswapV2Router02 = truffleContract(UniswapV2Router02Output)
    UniswapV2Router02.setProvider(provider)
    admin = accounts[1]
    network = accounts[2]
    destAddress = accounts[3]

    weth = await WETH9.new()
    testToken = await TestToken.new('test token', 'TST', new BN(15))

    uniswapFactory = await UniswapV2Factory.new(accounts[0], {from: accounts[0]})
    uniswapRouter = await UniswapV2Router02.new(uniswapFactory.address, weth.address, {
      from: accounts[0]
    })
  })

  describe('test trade function', async () => {
    before('set up ', async () => {
      let numTestToken = new BN(10).pow(new BN(18))
      await testToken.approve(uniswapRouter.address, numTestToken)

      await uniswapRouter.addLiquidityETH(
        testToken.address,
        numTestToken,
        new BN(0),
        new BN(0),
        accounts[0],
        deadline,
        {value: new BN(10).pow(new BN(19)).mul(new BN(5)), from: accounts[0]}
      )

      reserve = await KyberUniswapv2Reserve.new(
        uniswapFactory.address,
        weth.address,
        admin,
        network
      )
      await reserve.listToken(testToken.address, {from: admin})
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
  })
})
