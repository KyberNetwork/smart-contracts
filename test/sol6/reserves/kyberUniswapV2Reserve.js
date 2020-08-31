const UniswapV2FactoryOutput = require('@uniswap/v2-core/build/UniswapV2Factory.json');
const UniswapV2Router02Output = require('@uniswap/v2-periphery/build/UniswapV2Router02.json');
const MockUniswapRounter = artifacts.require('MockUniswapRouter.sol');
const KyberUniswapV2Reserve = artifacts.require('KyberUniswapV2Reserve.sol');
const WETH9 = artifacts.require('WETH9.sol');
const TestToken = artifacts.require('Token.sol');

const truffleContract = require('@truffle/contract');
const provider = web3.currentProvider;
const BN = web3.utils.BN;
const {expectEvent, expectRevert} = require('@openzeppelin/test-helpers');

const {
  BPS,
  ethDecimals,
  ethAddress,
  zeroAddress,
  zeroBN,
  MAX_ALLOWANCE
} = require('../../helper.js');
const Helper = require('../../helper.js');
const {assert} = require('chai');

let UniswapV2Factory;
let UniswapV2Router02;

let admin;
let operator;
let alerter;
let network;
let uniswapFactory;
let uniswapRouter;
let weth;
let testToken;
let testToken2;
let reserve;
let destAddress;

let defaultBps = new BN(25);
let maxUint256 = new BN(2).pow(new BN(256)).sub(new BN(1));

contract('KyberUniswapv2Reserve', function (accounts) {
  before('init contract and accounts', async () => {
    UniswapV2Factory = truffleContract(UniswapV2FactoryOutput);
    UniswapV2Factory.setProvider(provider);
    UniswapV2Router02 = truffleContract(UniswapV2Router02Output);
    UniswapV2Router02.setProvider(provider);
    admin = accounts[1];
    operator = accounts[2];
    alerter = accounts[3];
    network = accounts[4];
    destAddress = accounts[5];

    weth = await WETH9.new();
    testToken = await TestToken.new('test token', 'TST', new BN(15));
    testToken2 = await TestToken.new('test token', 'TST', new BN(19));

    uniswapFactory = await UniswapV2Factory.new(accounts[0], {from: accounts[0]});
    uniswapRouter = await UniswapV2Router02.new(uniswapFactory.address, weth.address, {
      from: accounts[0]
    });
  });

  describe('constructor params', () => {
    it('test revert if uniswapFactory 0', async () => {
      await expectRevert(
        KyberUniswapV2Reserve.new(zeroAddress, weth.address, admin, network),
        'uniswapRouter 0'
      );
    });

    it('test revert if weth 0', async () => {
      await expectRevert(
        KyberUniswapV2Reserve.new(uniswapFactory.address, zeroAddress, admin, network),
        'weth 0'
      );
    });

    it('test revert if kyberNetwork 0', async () => {
      await expectRevert(
        KyberUniswapV2Reserve.new(uniswapFactory.address, weth.address, admin, zeroAddress),
        'kyberNetwork 0'
      );
    });

    it('test revert if admin 0', async () => {
      await expectRevert(
        KyberUniswapV2Reserve.new(uniswapFactory.address, weth.address, zeroAddress, network),
        'admin 0'
      );
    });

    it('test constructor success', async () => {
      reserve = await KyberUniswapV2Reserve.new(
        uniswapRouter.address,
        weth.address,
        admin,
        network
      );

      assert(
        uniswapRouter.address == (await reserve.uniswapRouter()),
        'unexpected uniswapFactory'
      );
      assert(weth.address == (await reserve.weth()), 'unexpected weth');
      assert(network == (await reserve.kyberNetwork()), 'unexpected kyberNetwork');
    });
  });

  describe('send and withdraw token', async () => {
    let sendAmount = new BN(10).pow(new BN(18));
    before('set up reserve', async () => {
      reserve = await KyberUniswapV2Reserve.new(
        uniswapRouter.address,
        weth.address,
        admin,
        network
      );
    });

    it('test reserve able to receive ether', async () => {
      await Helper.sendEtherWithPromise(accounts[0], reserve.address, sendAmount);
    });

    it('test revert if withdraw from non-admin', async () => {
      await expectRevert(
        reserve.withdrawEther(sendAmount, network, {from: network}),
        'only admin'
      );
    });

    it('test withdraw from admin', async () => {
      await reserve.withdrawEther(sendAmount, admin, {from: admin});
    });
  });

  describe('test permission operation', () => {
    let testToken;
    before('set up reserve', async () => {
      reserve = await KyberUniswapV2Reserve.new(
        uniswapRouter.address,
        weth.address,
        admin,
        network
      );
      await reserve.addAlerter(alerter, {from: admin});
      await reserve.addOperator(operator, {from: admin});
      testToken = await TestToken.new('test token', 'TST', new BN(15));
    });

    it('test setFee only admin', async () => {
      let txResult = await reserve.setFee(new BN(100), {from: admin});
      expectEvent(txResult, 'FeeUpdated', {
        feeBps: new BN(100)
      });

      txResult = await reserve.setFee(new BN(100), {from: admin});
      expectEvent.notEmitted(txResult, 'FeeUpdated');
    });

    it('test revert setFee if not admin', async () => {
      await expectRevert(reserve.setFee(new BN(100), {from: destAddress}), 'only admin');
    });

    it('test revert setFee if fee is too high', async () => {
      await expectRevert(reserve.setFee(BPS, {from: admin}), 'fee >= BPS');
    });

    it('test disable trade revert if not alerter', async () => {
      await expectRevert(reserve.disableTrade({from: admin}), 'only alerter');
    });

    it('test disable trade success', async () => {
      let txResult = await reserve.disableTrade({from: alerter});
      expectEvent(txResult, 'TradeEnabled', {
        enable: false
      });
    });

    it('test enable trade revert if not admin', async () => {
      await expectRevert(reserve.enableTrade({from: alerter}), 'only admin');
    });

    it('test enable trade success', async () => {
      let txResult = await reserve.enableTrade({from: admin});
      expectEvent(txResult, 'TradeEnabled', {
        enable: true
      });
    });

    it('test setKyberNetwork revert if not admin', async () => {
      let newNetwork = accounts[6];
      await expectRevert(reserve.setKyberNetwork(newNetwork, {from: operator}), 'only admin');
    });

    it('test setKyberNetwork success', async () => {
      let newNetwork = accounts[6];
      let txResult = await reserve.setKyberNetwork(newNetwork, {from: admin});
      expectEvent(txResult, 'KyberNetworkSet', {
        kyberNetwork: newNetwork
      });
      assert(newNetwork == await reserve.kyberNetwork(), "network contract missmatch")
      //reset network value
      reserve.setKyberNetwork(network, {from: admin})
    });


    describe('test list - delist token', async () => {
      it('test list token revert from non-operator', async () => {
        await expectRevert(
          reserve.listToken(testToken.address, true, true, {from: alerter}),
          'only operator'
        );
      });

      it('test list token revert if token 0', async () => {
        await expectRevert(
          reserve.listToken(zeroAddress, true, true, {from: operator}),
          'token 0'
        );
      });

      it('test list token succes without default path', async () => {
        await reserve.listToken(testToken.address, false, false, {from: operator});
        //revert change
        await reserve.delistToken(testToken.address, {from: operator});
      });

      it('test list token revert if token pair does not exist', async () => {
        await expectRevert(
          reserve.listToken(testToken.address, true, true, {from: operator}),
          'uniswapPair not found'
        );
      });

      it('test list token revert if token pair does not have liquidity', async () => {
        // create the pair but no liquidity
        await uniswapFactory.createPair(testToken.address, weth.address, {from: accounts[0]});
        await expectRevert(
          reserve.listToken(testToken.address, true, true, {from: operator}),
          'insufficient liquidity'
        );
      });
      it('test list token success with default path added', async () => {
        //add liquidity to the pair
        let numTestToken = new BN(10).pow(new BN(18));
        await testToken.approve(uniswapRouter.address, numTestToken);
        await uniswapRouter.addLiquidityETH(
          testToken.address,
          numTestToken,
          new BN(0),
          new BN(0),
          accounts[0],
          maxUint256,
          {value: new BN(10).pow(new BN(19)).mul(new BN(5)), from: accounts[0]}
        );
        let txResult = await reserve.listToken(testToken.address, true, true, {from: operator});
        expectEvent(txResult, 'TokenListed', {
          token: testToken.address,
          add: true
        });
        // allowance should be max
        let allowance = await testToken.allowance(reserve.address, uniswapRouter.address);
        Helper.assertEqual(MAX_ALLOWANCE, allowance, 'allowance should be max');

        assert(await reserve.tokenListed(testToken.address), 'tokenListed is false');

        await expectRevert(
          reserve.listToken(testToken.address, true, true, {from: operator}),
          'token is listed'
        );
      });

      it('test list token with verifying paths exists', async () => {
        let testToken = await TestToken.new('test token', 'TST', new BN(15));
        let numTestToken = new BN(10).pow(new BN(18));
        await testToken.approve(uniswapRouter.address, numTestToken);
        await uniswapRouter.addLiquidityETH(
          testToken.address,
          numTestToken,
          new BN(0),
          new BN(0),
          accounts[0],
          maxUint256,
          {value: new BN(10).pow(new BN(19)).mul(new BN(5)), from: accounts[0]}
        );
        await expectRevert(
          reserve.listToken(testToken.address, false, true, {from: operator}),
          'no path exists for e2t'
        );

        await reserve.addPath(testToken.address, [weth.address, testToken.address], true, {
          from: operator
        });
        await expectRevert(
          reserve.listToken(testToken.address, false, true, {from: operator}),
          'no path exists for t2e'
        );

        await reserve.addPath(testToken.address, [testToken.address, weth.address], false, {
          from: operator
        });
        await reserve.listToken(testToken.address, false, true, {from: operator});
      });

      it('test delist token revert if not operator', async () => {
        await expectRevert(
          reserve.delistToken(testToken.address, {from: alerter}),
          'only operator'
        );
      });

      it('test delist token revert if not listed token', async () => {
        await expectRevert(reserve.delistToken(network, {from: operator}), 'token is not listed');
      });

      it('test delist token success', async () => {
        let uniswapPair = await uniswapFactory.getPair(testToken.address, weth.address);
        let txResult = await reserve.delistToken(testToken.address, {from: operator});
        expectEvent(txResult, 'TokenListed', {
          token: testToken.address,
          add: false
        });

        assert(!(await reserve.tokenListed(testToken.address)), 'tokenListed should be removed');
        // allowance should be 0
        let allowance = await testToken.allowance(reserve.address, uniswapRouter.address);
        Helper.assertEqual(zeroBN, allowance, 'allowance should be 0');
      });
    });

    describe('test add - remove path', async () => {
      before('set up', async () => {
        reserve = await KyberUniswapV2Reserve.new(
          uniswapRouter.address,
          weth.address,
          admin,
          network
        );
        await reserve.addAlerter(alerter, {from: admin});
        await reserve.addOperator(operator, {from: admin});
        testToken = await TestToken.new('test token', 'TST', new BN(15));
        testToken2 = await TestToken.new('test token2', 'TST2', new BN(19));
      });

      it('test add path revert if invalid path', async () => {
        await expectRevert(
          reserve.addPath(testToken.address, [weth.address], true, {from: operator}),
          'path is too short'
        );
        await expectRevert(
          reserve.addPath(testToken.address, [weth.address, testToken2.address], true, {
            from: operator
          }),
          'end address of path is not token'
        );
        await expectRevert(
          reserve.addPath(testToken.address, [testToken2.address, testToken.address], true, {
            from: operator
          }),
          'start address of path is not weth'
        );

        await expectRevert(
          reserve.addPath(testToken.address, [testToken2.address, weth.address], false, {
            from: operator
          }),
          'start address of path is not token'
        );
        await expectRevert(
          reserve.addPath(testToken.address, [testToken.address, testToken2.address], false, {
            from: operator
          }),
          'end address of path is not weth'
        );
      });

      it('test add path revert from non-operator', async () => {
        await expectRevert(
          reserve.addPath(testToken.address, [weth.address, testToken.address], true, {
            from: admin
          }),
          'only operator'
        );
      });

      it('test add path success', async () => {
        //add liquidity to the pair
        let numTestToken = new BN(10).pow(new BN(18));
        await testToken.approve(uniswapRouter.address, numTestToken);
        await uniswapRouter.addLiquidityETH(
          testToken.address,
          numTestToken,
          new BN(0),
          new BN(0),
          accounts[0],
          maxUint256,
          {value: new BN(10).pow(new BN(19)).mul(new BN(5)), from: accounts[0]}
        );
        let txResult = await reserve.addPath(
          testToken.address,
          [testToken.address, weth.address],
          false,
          {
            from: operator
          }
        );
        expectEvent(txResult, 'TokenPathAdded', {
          token: testToken.address,
          path: [testToken.address, weth.address],
          isEthToToken: false,
          add: true
        });
      });

      it('test remove path revert from non-operator', async () => {
        await expectRevert(
          reserve.removePath(testToken.address, false, new BN(1), {from: admin}),
          'only operator'
        );
      });

      it('test remove path revert with invalid index', async () => {
        await expectRevert(
          reserve.removePath(testToken.address, false, new BN(1), {from: operator}),
          'invalid index'
        );
      });

      it('test remove path success', async () => {
        let txResult = await reserve.removePath(testToken.address, false, new BN(0), {
          from: operator
        });
        expectEvent(txResult, 'TokenPathAdded', {
          token: testToken.address,
          path: [testToken.address, weth.address],
          isEthToToken: false,
          add: false
        });
      });
    });
  });

  describe('test getConversionRate function', () => {
    let srcAmount = new BN(10).pow(new BN(14));
    let testToken;
    let testTokenDecimal = new BN(15);
    let feeBps = new BN(89);
    before('set up reserve', async () => {
      reserve = await KyberUniswapV2Reserve.new(
        uniswapRouter.address,
        weth.address,
        admin,
        network
      );
      await reserve.setFee(feeBps, {from: admin});

      testToken = await TestToken.new('test token', 'TST', testTokenDecimal);
      let numTestToken = new BN(10).pow(new BN(18));
      await testToken.approve(uniswapRouter.address, numTestToken);

      await uniswapRouter.addLiquidityETH(
        testToken.address,
        numTestToken,
        new BN(0),
        new BN(0),
        accounts[0],
        maxUint256,
        {value: new BN(10).pow(new BN(19)).mul(new BN(5)), from: accounts[0]}
      );

      await reserve.addOperator(operator, {from: admin});
      await reserve.addAlerter(alerter, {from: admin});
      await reserve.listToken(testToken.address, true, true, {from: operator});
    });

    it('test getConversionRate if token is not listed', async () => {
      let rate = await reserve.getConversionRate(ethAddress, accounts[7], zeroBN, new BN(0));
      Helper.assertEqual(zeroBN, rate, 'rate should be 0');
    });

    it('test getConversionRate if trade is not enable', async () => {
      await reserve.disableTrade({from: alerter});
      let rate = await reserve.getConversionRate(
        ethAddress,
        testToken.address,
        srcAmount,
        new BN(0)
      );
      Helper.assertEqual(zeroBN, rate, 'rate should be 0');
      await reserve.enableTrade({from: admin});
    });

    it('test getConversionRate if srcQty = 0', async () => {
      let rate = await reserve.getConversionRate(ethAddress, testToken.address, zeroBN, new BN(0));
      Helper.assertEqual(zeroBN, rate, 'rate should be 0');
    });

    it('test getConversionRate for e2t', async () => {
      let rate = await reserve.getConversionRate(
        ethAddress,
        testToken.address,
        srcAmount,
        new BN(0)
      );
      let uniswapDstQty = await uniswapRouter.getAmountsOut(
        srcAmount.mul(BPS.sub(feeBps)).div(BPS),
        [weth.address, testToken.address]
      );

      let expectedRate = Helper.calcRateFromQty(
        srcAmount,
        uniswapDstQty[1],
        ethDecimals,
        testTokenDecimal
      );
      Helper.assertEqual(rate, expectedRate, 'unexpected rate');
    });

    it('test getConversionRate for t2e', async () => {
      let rate = await reserve.getConversionRate(
        testToken.address,
        ethAddress,
        srcAmount,
        new BN(0)
      );

      let uniswapDstQty = await uniswapRouter.getAmountsOut(srcAmount, [
        testToken.address,
        weth.address
      ]);

      let expectedRate = Helper.calcRateFromQty(
        srcAmount,
        uniswapDstQty[1].mul(BPS.sub(feeBps)).div(BPS),
        testTokenDecimal,
        ethDecimals
      );
      Helper.assertEqual(rate, expectedRate, 'unexpected rate');
    });
  });

  describe('test trade function', async () => {
    let unlistedToken = accounts[5];
    before('set up ', async () => {
      let numTestToken = new BN(10).pow(new BN(18)).mul(new BN(3));
      await testToken.approve(uniswapRouter.address, maxUint256);
      let numTestToken2 = new BN(10).pow(new BN(20)).mul(new BN(5));
      await testToken2.approve(uniswapRouter.address, maxUint256);
      // add pair weth-testToken
      await uniswapRouter.addLiquidityETH(
        testToken.address,
        numTestToken,
        new BN(0),
        new BN(0),
        accounts[0],
        maxUint256,
        {value: new BN(10).pow(new BN(19)).mul(new BN(5)), from: accounts[0]}
      );
      // add pair weth-testToken2
      await uniswapRouter.addLiquidityETH(
        testToken2.address,
        numTestToken2,
        new BN(0),
        new BN(0),
        accounts[0],
        maxUint256,
        {value: new BN(10).pow(new BN(19)).mul(new BN(5)), from: accounts[0]}
      );
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
      );

      reserve = await KyberUniswapV2Reserve.new(
        uniswapRouter.address,
        weth.address,
        admin,
        network
      );
      await reserve.addOperator(operator, {from: admin});
      await reserve.addAlerter(alerter, {from: admin});
      await reserve.listToken(testToken.address, true, true, {from: operator});
    });

    it('test trade revert if token is not listed', async () => {
      let srcAmount = new BN(10).pow(new BN(16)).mul(new BN(3));
      await expectRevert(
        reserve.trade(ethAddress, srcAmount, unlistedToken, destAddress, new BN(1), true, {
          value: srcAmount,
          from: network
        }),
        'only use eth and listed token'
      );
    });

    it('test trade revert if not from network', async () => {
      let srcAmount = new BN(10).pow(new BN(16)).mul(new BN(3));
      let rate = await reserve.getConversionRate(ethAddress, testToken.address, srcAmount, zeroBN);
      Helper.assertGreater(rate, zeroBN, 'rate 0');

      await expectRevert(
        reserve.trade(ethAddress, srcAmount, testToken.address, destAddress, rate, true, {
          value: srcAmount,
          from: admin
        }),
        'only kyberNetwork'
      );
    });

    it('test trade revert if trade is disabled', async () => {
      await reserve.disableTrade({from: alerter});
      let srcAmount = new BN(10).pow(new BN(16)).mul(new BN(3));

      await expectRevert(
        reserve.trade(ethAddress, srcAmount, testToken.address, destAddress, new BN(1), true, {
          value: srcAmount,
          from: admin
        }),
        'trade is disabled'
      );
      await reserve.enableTrade({from: admin});
    });

    it('test trade revert if conversionRate is 0', async () => {
      let srcAmount = new BN(10).pow(new BN(16)).mul(new BN(3));
      await expectRevert(
        reserve.trade(ethAddress, srcAmount, testToken.address, destAddress, new BN(0), true, {
          value: srcAmount,
          from: network
        }),
        'conversionRate 0'
      );
    });

    it('test revert if trade t2e but msg.value is not zero', async () => {
      let srcAmount = new BN(10).pow(new BN(16)).mul(new BN(3));
      await expectRevert(
        reserve.trade(testToken.address, srcAmount, ethAddress, destAddress, new BN(1), true, {
          value: srcAmount,
          from: network
        }),
        'msg.value is not 0'
      );
    });

    it('test revert revert if trade e2t but msg.value is srcAmount', async () => {
      let srcAmount = new BN(10).pow(new BN(16)).mul(new BN(3));
      await expectRevert(
        reserve.trade(ethAddress, srcAmount, testToken.address, destAddress, new BN(1), true, {
          value: srcAmount.add(new BN(1)),
          from: network
        }),
        'msg.value != srcAmount'
      );
    });

    it('test revert if conversionRate is too high', async () => {
      let srcAmount = new BN(10).pow(new BN(16)).mul(new BN(3));
      let rate = await reserve.getConversionRate(ethAddress, testToken.address, srcAmount, zeroBN);
      await expectRevert(
        reserve.trade(
          ethAddress,
          srcAmount,
          testToken.address,
          destAddress,
          rate.add(new BN(1)),
          true,
          {
            value: srcAmount,
            from: network
          }
        ),
        'expected conversionRate <= actualRate'
      );
    });

    it('test e2t', async () => {
      let srcAmount = new BN(10).pow(new BN(16)).mul(new BN(3));
      let rate = await reserve.getConversionRate(ethAddress, testToken.address, srcAmount, zeroBN);
      Helper.assertGreater(rate, zeroBN, 'rate 0');

      let srcBalanceBefore = await Helper.getBalancePromise(network);
      let dstBalanceBefore = await testToken.balanceOf(destAddress);

      await reserve.trade(ethAddress, srcAmount, testToken.address, destAddress, rate, true, {
        value: srcAmount,
        from: network,
        gasPrice: zeroBN
      });

      let destQty = Helper.calcDstQty(srcAmount, ethDecimals, await testToken.decimals(), rate);
      await Helper.assertSameEtherBalance(network, srcBalanceBefore.sub(srcAmount));
      let dstBalanceAfter = await testToken.balanceOf(destAddress);
      // only approximate due to rounding down
      Helper.assertApproximate(
        dstBalanceAfter.sub(dstBalanceBefore),
        destQty,
        'unexpected destQty'
      );
    });

    it('test t2e', async () => {
      let srcAmount = new BN(10).pow(new BN(14)).mul(new BN(2));
      let rate = await reserve.getConversionRate(testToken.address, ethAddress, srcAmount, zeroBN);
      Helper.assertGreater(rate, zeroBN, 'rate 0');

      await testToken.transfer(network, srcAmount);
      await testToken.approve(reserve.address, srcAmount, {from: network});

      let dstBalanceBefore = await Helper.getBalancePromise(destAddress);
      let srcBalanceBefore = await testToken.balanceOf(network);

      await reserve.trade(testToken.address, srcAmount, ethAddress, destAddress, rate, true, {
        from: network
      });

      let destQty = Helper.calcDstQty(srcAmount, await testToken.decimals(), ethDecimals, rate);
      await Helper.assertSameTokenBalance(network, testToken, srcBalanceBefore.sub(srcAmount));
      await Helper.assertSameEtherBalance(destAddress, dstBalanceBefore.add(destQty));
    });

    describe('test valid uniswap amout out', async () => {
      let mockRounter;
      let reserve;
      before('set up malicious rounter', async () => {
        mockRounter = await MockUniswapRounter.new(uniswapFactory.address, weth.address);
        reserve = await KyberUniswapV2Reserve.new(
          mockRounter.address,
          weth.address,
          admin,
          network
        );
        await reserve.addOperator(operator, {from: admin});
        await reserve.listToken(testToken.address, true, true, {from: operator});
      });

      it('test e2t revert if swap amount out < expectedDestAmount', async () => {
        let srcAmount = new BN(10).pow(new BN(16)).mul(new BN(3));
        let rate = await reserve.getConversionRate(
          ethAddress,
          testToken.address,
          srcAmount,
          zeroBN
        );

        dstQty = Helper.calcDstQty(srcAmount, ethDecimals, await testToken.decimals(), rate);
        await mockRounter.setDstQty(dstQty.sub(new BN(1)));
        Helper.assertGreater(rate, zeroBN, 'rate 0');
        await expectRevert(
          reserve.trade(ethAddress, srcAmount, testToken.address, destAddress, rate, true, {
            value: srcAmount,
            from: network
          }),
          'Returned trade amount too low'
        );
      });

      it('test t2e revert if swap amount out < expectedDestAmount', async () => {
        let srcAmount = new BN(10).pow(new BN(16)).mul(new BN(3));
        let rate = await reserve.getConversionRate(
          testToken.address,
          ethAddress,
          srcAmount,
          zeroBN
        );

        dstQty = Helper.calcDstQty(srcAmount, await testToken.decimals(), ethDecimals, rate);
        await mockRounter.setDstQty(dstQty.sub(new BN(1)));
        Helper.assertGreater(rate, zeroBN, 'rate 0');
        await testToken.transfer(network, srcAmount);
        await testToken.approve(reserve.address, srcAmount, {from: network});
        await expectRevert(
          reserve.trade(testToken.address, srcAmount, ethAddress, destAddress, rate, true, {
            from: network
          }),
          'Returned trade amount too low'
        );
      });
    });

    describe('test trade with undirect path', async () => {
      before('remove direct path, add undirect path only', async () => {
        await reserve.removePath(testToken.address, true, 0, {from: operator});
        await reserve.removePath(testToken.address, false, 0, {from: operator});
        await reserve.addPath(
          testToken.address,
          [testToken.address, testToken2.address, weth.address],
          false,
          {from: operator}
        );
        await reserve.addPath(
          testToken.address,
          [weth.address, testToken2.address, testToken.address],
          true,
          {from: operator}
        );
      });

      it('test e2t', async () => {
        let srcAmount = new BN(10).pow(new BN(16)).mul(new BN(3));
        let rate = await reserve.getConversionRate(
          ethAddress,
          testToken.address,
          srcAmount,
          zeroBN
        );
        Helper.assertGreater(rate, zeroBN, 'rate 0');

        let srcBalanceBefore = await Helper.getBalancePromise(network);
        let dstBalanceBefore = await testToken.balanceOf(destAddress);

        await reserve.trade(ethAddress, srcAmount, testToken.address, destAddress, rate, true, {
          value: srcAmount,
          from: network,
          gasPrice: zeroBN
        });

        let destQty = Helper.calcDstQty(srcAmount, ethDecimals, await testToken.decimals(), rate);
        await Helper.assertSameEtherBalance(network, srcBalanceBefore.sub(srcAmount));
        let dstBalanceAfter = await testToken.balanceOf(destAddress);
        // only approximate due to rounding down
        Helper.assertApproximate(
          dstBalanceAfter.sub(dstBalanceBefore),
          destQty,
          'unexpected destQty'
        );
      });

      it('test t2e', async () => {
        let srcAmount = new BN(10).pow(new BN(14)).mul(new BN(2));
        let rate = await reserve.getConversionRate(
          testToken.address,
          ethAddress,
          srcAmount,
          zeroBN
        );
        Helper.assertGreater(rate, zeroBN, 'rate 0');

        await testToken.transfer(network, srcAmount);
        await testToken.approve(reserve.address, srcAmount, {from: network});

        let dstBalanceBefore = await Helper.getBalancePromise(destAddress);
        let srcBalanceBefore = await testToken.balanceOf(network);

        await reserve.trade(testToken.address, srcAmount, ethAddress, destAddress, rate, true, {
          from: network
        });

        let destQty = Helper.calcDstQty(srcAmount, await testToken.decimals(), ethDecimals, rate);
        await Helper.assertSameTokenBalance(network, testToken, srcBalanceBefore.sub(srcAmount));
        await Helper.assertSameEtherBalance(destAddress, dstBalanceBefore.add(destQty));
      });
    });
  });
});
