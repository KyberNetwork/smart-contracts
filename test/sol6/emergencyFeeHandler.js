const EmergencyKyberFeeHandler = artifacts.require('EmergencyKyberFeeHandler.sol');
const MockEmergencyFeeHandler = artifacts.require('MockEmergencyFeeHandler.sol');
const KyberNetwork = artifacts.require('KyberNetwork.sol');
const KyberStorage = artifacts.require('KyberStorage.sol');
const MatchingEngine = artifacts.require('KyberMatchingEngine.sol');
const TestToken = artifacts.require('Token.sol');
const NoPayableFallback = artifacts.require('NoPayableFallback.sol');

const Helper = require('../helper.js');
const nwHelper = require('./networkHelper.js');
const BN = web3.utils.BN;
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
} = require('../helper.js');
const {expectEvent, expectRevert} = require('@openzeppelin/test-helpers');
const {assert} = require('chai');

let admin;
let feeHandler;
let network;
let rebateBpsPerWallet;
let rebateWallets;
let platformWallet;
let user;

let rewardBps = new BN(5000);
let rebateBps = new BN(2500);
let burnBps = new BN(2500);

contract('EmergencyKyberFeeHandler', function (accounts) {
  before('Setting global variables', async () => {
    admin = accounts[1];
    network = accounts[2];
    rebateBpsPerWallet = [new BN(4000), new BN(6000)];
    rebateWallets = [accounts[3], accounts[4]];
    platformWallet = accounts[5];
    user = accounts[6];
  });

  describe('valid constructor params', async () => {
    it('test total BRR value should be BPS', async () => {
      await expectRevert(
        EmergencyKyberFeeHandler.new(admin, network, rewardBps, rebateBps, burnBps.add(new BN(1))),
        'Bad BRR values'
      );
    });

    it('test total BRR value should not be overflow', async () => {
      await expectRevert.unspecified(
        EmergencyKyberFeeHandler.new(admin, network, new BN(BPS), new BN(1), new BN(2).pow(new BN(256)).sub(new BN(1)))
      );
    });
  });

  describe('test set network', async () => {
    let newNetwork = accounts[3];
    beforeEach('init emergencyFeeHandler', async () => {
      feeHandler = await EmergencyKyberFeeHandler.new(admin, network, rewardBps, rebateBps, burnBps);
    });

    it('should revert if not amin set network', async () => {
      await expectRevert(feeHandler.setNetworkContract(newNetwork, {from: user}), 'only admin');
    });

    it('should revert if new network is zero', async () => {
      await expectRevert(feeHandler.setNetworkContract(zeroAddress, {from: admin}), 'kyberNetwork 0');
    });

    it('should success and emit events', async () => {
      let txResult = await feeHandler.setNetworkContract(newNetwork, {from: admin});
      await expectEvent(txResult, 'KyberNetworkUpdated', {kyberNetwork: newNetwork});
      // not update event if network contract is unchanged
      txResult = await feeHandler.setNetworkContract(newNetwork, {from: admin});
      await expectEvent.notEmitted(txResult, 'KyberNetworkUpdated');
    });
  });

  describe('test handle fees with mock Network', async () => {
    before('init emergencyFeeHandler', async () => {
      feeHandler = await EmergencyKyberFeeHandler.new(admin, network, rewardBps, rebateBps, burnBps);
    });

    it('should handle Fee', async () => {
      let platformFee = new BN(10).pow(new BN(17));
      let fee = new BN(10).pow(new BN(18));
      let networkFee = fee.sub(platformFee);

      let initalState = await getFeeHanlerState(feeHandler, rebateWallets, platformWallet);
      let txResult = await feeHandler.handleFees(
        ethAddress,
        rebateWallets,
        rebateBpsPerWallet,
        platformWallet,
        platformFee,
        networkFee,
        {
          from: network,
          value: fee
        }
      );

      let brrFeeResult = calculateBrrFee(networkFee, rewardBps, rebateBps, rebateWallets, rebateBpsPerWallet);

      await expectEvent(txResult, 'HandleFee', {
        platformWallet,
        platformFeeWei: platformFee,
        rebateWallets,
        feeBRRWei: networkFee
      });

      await expectEvent(txResult, 'FeeDistribution', {
        platformWallet,
        platformFeeWei: platformFee,
        rewardWei: brrFeeResult.rewardWei,
        rebateWei: brrFeeResult.rebateWei,
        rebateWallets,
        burnAmountWei: brrFeeResult.burnWei
      });

      await assertStateAfterHandlerFees(feeHandler, initalState, platformWallet, platformFee, brrFeeResult);
    });

    it('should handle Fee with only platform Fee', async () => {
      let platformFee = new BN(10).pow(new BN(17));
      let initalState = await getFeeHanlerState(feeHandler, rebateWallets, platformWallet);
      let txResult = await feeHandler.handleFees(
        ethAddress,
        rebateWallets,
        rebateBpsPerWallet,
        platformWallet,
        platformFee,
        zeroBN,
        {
          from: network,
          value: platformFee
        }
      );

      await expectEvent(txResult, 'HandleFee', {
        platformWallet,
        platformFeeWei: platformFee,
        feeBRRWei: new BN(0)
      });

      await expectEvent(txResult, 'FeeDistribution', {
        platformWallet,
        platformFeeWei: platformFee,
        rewardWei: zeroBN,
        rebateWei: zeroBN,
        rebateWallets,
        burnAmountWei: zeroBN
      });

      let brrFeeResult = calculateBrrFee(zeroBN, rewardBps, rebateBps, rebateWallets, rebateBpsPerWallet);

      await assertStateAfterHandlerFees(feeHandler, initalState, platformWallet, platformFee, brrFeeResult);
    });

    it('should handle Fee with half rebate BPS', async () => {
      let platformFee = new BN(10).pow(new BN(17));
      let fee = new BN(10).pow(new BN(18));
      let networkFee = fee.sub(platformFee);

      let initalState = await getFeeHanlerState(feeHandler, rebateWallets, platformWallet);
      let rebateBpsPerWallet = [new BN(2000), new BN(3000)];
      let txResult = await feeHandler.handleFees(
        ethAddress,
        rebateWallets,
        rebateBpsPerWallet,
        platformWallet,
        platformFee,
        networkFee,
        {
          from: network,
          value: fee
        }
      );

      let brrFeeResult = calculateBrrFee(networkFee, rewardBps, rebateBps, rebateWallets, rebateBpsPerWallet);

      await expectEvent(txResult, 'HandleFee', {
        platformWallet,
        platformFeeWei: platformFee,
        rebateWallets,
        feeBRRWei: networkFee
      });

      await expectEvent(txResult, 'FeeDistribution', {
        platformWallet,
        platformFeeWei: platformFee,
        rewardWei: brrFeeResult.rewardWei,
        rebateWei: brrFeeResult.rebateWei,
        rebateWallets,
        burnAmountWei: brrFeeResult.burnWei
      });

      await assertStateAfterHandlerFees(feeHandler, initalState, platformWallet, platformFee, brrFeeResult);
    });

    it('test failtolerance when calculateAndRecordFeeData failed', async () => {
      feeHandler = await MockEmergencyFeeHandler.new(admin, network, rewardBps, rebateBps, burnBps);
      let platformFee = new BN(10).pow(new BN(17));
      let fee = new BN(10).pow(new BN(18));

      let initalFeePerPlatformWallet = await feeHandler.feePerPlatformWallet(platformWallet);
      let txResult = await feeHandler.handleFees(
        ethAddress,
        rebateWallets,
        rebateBpsPerWallet,
        platformWallet,
        platformFee,
        fee.sub(platformFee),
        {
          from: network,
          value: fee
        }
      );

      await expectEvent(txResult, 'HandleFeeFailed', {
        feeBRRWei: fee.sub(platformFee)
      });
      //platform fee should update as normal
      let afterFeePerPlatformWallet = await feeHandler.feePerPlatformWallet(platformWallet);
      Helper.assertEqual(
        initalFeePerPlatformWallet.add(platformFee),
        afterFeePerPlatformWallet,
        'unexpected feePerPlatformWallet'
      );
    });

    describe('test validate condition', async () => {
      let platformFee = new BN(10).pow(new BN(17));
      let networkFee = new BN(10).pow(new BN(18));
      let fee = platformFee.add(networkFee);
      it('test only network call handleFee', async () => {
        await expectRevert(
          feeHandler.handleFees(
            ethAddress,
            rebateWallets,
            rebateBpsPerWallet,
            platformWallet,
            platformFee,
            networkFee,
            {
              from: admin,
              value: fee
            }
          ),
          'only kyberNetwork'
        );
      });

      it('test calculateAndRecordFeeData only call by feehandler', async () => {
        try {
          await feeHandler.calculateAndRecordFeeData(
            platformWallet,
            platformFee,
            rebateWallets,
            rebateBpsPerWallet,
            networkFee,
            {from: admin}
          );
          assert(false, 'transaction should be revert');
        } catch (e) {
          assert(Helper.isRevertErrorMessage(e), 'expected throw but got: ' + e);
        }
      });

      it('test revert if token is not eth', async () => {
        testToken = await TestToken.new('test', 'KNC', 18);
        await expectRevert(
          feeHandler.handleFees(
            testToken.address,
            rebateWallets,
            rebateBpsPerWallet,
            platformWallet,
            platformFee,
            networkFee,
            {
              from: network,
              value: fee
            }
          ),
          'token not eth'
        );
      });

      it('test revert if msg.value is different from total platformFee and networkFee', async () => {
        await expectRevert(
          feeHandler.handleFees(
            ethAddress,
            rebateWallets,
            rebateBpsPerWallet,
            platformWallet,
            platformFee,
            networkFee,
            {
              from: network,
              value: zeroBN
            }
          ),
          'msg.value not equal to total fees'
        );
      });

      it('test should record handle fee failed if rebatewallet is zero', async () => {
        let txResult = await feeHandler.handleFees(
          ethAddress,
          [zeroAddress, zeroAddress],
          rebateBpsPerWallet,
          platformWallet,
          platformFee,
          networkFee,
          {
            from: network,
            value: fee
          }
        );
        await expectEvent(txResult, 'HandleFeeFailed');
      });

      it('test should record handle fee failed if total rebate bps > BPS', async () => {
        let txResult = await feeHandler.handleFees(
          ethAddress,
          rebateWallets,
          [new BN(5000), new BN(5001)],
          platformWallet,
          platformFee,
          networkFee,
          {
            from: network,
            value: fee
          }
        );
        await expectEvent(txResult, 'HandleFeeFailed');
      });
    });
  });

  describe('test withdraw and claimPlatformFee function', async () => {
    before('create new feehandler', async () => {
      feeHandler = await EmergencyKyberFeeHandler.new(admin, network, rewardBps, rebateBps, burnBps);
    });

    async function createHandleFee (platformWallet) {
      platformFee = new BN(10).pow(new BN(17));
      totalBalance = new BN(10).pow(new BN(18));
      await feeHandler.handleFees(
        ethAddress,
        rebateWallets,
        rebateBpsPerWallet,
        platformWallet,
        platformFee,
        totalBalance.sub(platformFee),
        {
          from: network,
          value: totalBalance
        }
      );
    }

    it('test withdraw revert if not admin', async () => {
      await createHandleFee(platformWallet);
      await expectRevert(feeHandler.withdraw(user, new BN(1), {from: network}), 'only admin');
    });

    it('test withdraw revert if withdraw more than availableBalance', async () => {
      await createHandleFee(platformWallet);
      totalPlatformFee = await feeHandler.totalPlatformFeeWei();
      totalBalance = await Helper.getBalancePromise(feeHandler.address);
      availableFee = totalBalance.sub(totalPlatformFee);
      await expectRevert(
        feeHandler.withdraw(user, availableFee.add(new BN(1)), {from: admin}),
        'amount > available funds'
      );
    });

    it('test withdraw success', async () => {
      await createHandleFee(platformWallet);
      totalPlatformFee = await feeHandler.totalPlatformFeeWei();
      totalBalance = await Helper.getBalancePromise(feeHandler.address);
      availableFee = totalBalance.sub(totalPlatformFee);
      let initialBalance = await Helper.getBalancePromise(user);
      let txResult = await feeHandler.withdraw(user, availableFee, {from: admin});
      expectEvent(txResult, 'EtherWithdraw', {
        amount: availableFee,
        sendTo: user
      });
      Helper.assertEqual(initialBalance.add(availableFee), await Helper.getBalancePromise(user));
    });

    it('test claimPlatformFee success', async () => {
      await createHandleFee(platformWallet);
      let initialBalance = await Helper.getBalancePromise(platformWallet);
      let initialTotalPlatformFee = await feeHandler.totalPlatformFeeWei();
      let platformFee = await feeHandler.feePerPlatformWallet(platformWallet);
      let txResult = await feeHandler.claimPlatformFee(platformWallet);
      expectEvent(txResult, 'PlatformFeePaid', {
        platformWallet: platformWallet,
        amount: platformFee.sub(new BN(1)),
        token: ethAddress
      });
      let afterBalance = await Helper.getBalancePromise(platformWallet);
      Helper.assertEqual(initialBalance.add(platformFee).sub(new BN(1)), afterBalance, 'unexpected balance');
      let afterTotalPlatformFee = await feeHandler.totalPlatformFeeWei();
      Helper.assertEqual(
        initialTotalPlatformFee.sub(platformFee.sub(new BN(1))),
        afterTotalPlatformFee,
        'total balance platform fee wei is not update as expected'
      );
      await expectRevert(feeHandler.claimPlatformFee(platformWallet), 'no fee to claim');
    });

    it('reverts if platform wallet is non-payable contract', async () => {
      let platformWallet = await NoPayableFallback.new();
      await createHandleFee(platformWallet.address);
      await expectRevert(feeHandler.claimPlatformFee(platformWallet.address), 'platform fee transfer failed');
    });

    it('reverts if withdraw to non-payable contract', async () => {
      let sendTo = await NoPayableFallback.new();
      await createHandleFee(platformWallet);
      await expectRevert(feeHandler.withdraw(sendTo.address, new BN(1), {from: admin}), 'withdraw transfer failed');
    });
  });

  it('should revert with not implemented method from IKyberFeeHandler', async () => {
    feeHandler = await EmergencyKyberFeeHandler.new(admin, network, rewardBps, rebateBps, burnBps);
    await expectRevert(feeHandler.claimReserveRebate(rebateWallets[0]), 'not implemented');
    await expectRevert(feeHandler.claimStakerReward(rebateWallets[0], new BN(0)), 'not implemented');
  });

  describe('test integration with real network', async () => {
    // network related variables
    let networkProxy;
    let operator;
    let alerter;
    let taker;
    let kyberNetwork;
    let storage;
    let reserveIdToWallet;

    const gasPrice = new BN(10).pow(new BN(9)).mul(new BN(50));
    const negligibleRateDiffBps = new BN(10); //0.01%
    const maxDestAmt = new BN(2).pow(new BN(255));
    const minConversionRate = new BN(0);

    let testToken;
    let platformFeeBps = new BN(20); // 0.2%
    let networkFeeBps = new BN(25); // default fee when daoAddress is zero

    before('init network, ...', async () => {
      networkProxy = accounts[6];
      operator = accounts[7];
      alerter = accounts[8];
      taker = accounts[9];

      // init storage and network
      storage = await nwHelper.setupStorage(admin);
      kyberNetwork = await KyberNetwork.new(admin, storage.address);
      await storage.setNetworkContract(kyberNetwork.address, {from: admin});
      await storage.addOperator(operator, {from: admin});

      feeHandler = await EmergencyKyberFeeHandler.new(admin, kyberNetwork.address, rewardBps, rebateBps, burnBps);
      // init matchingEngine
      matchingEngine = await MatchingEngine.new(admin);
      await matchingEngine.setNetworkContract(kyberNetwork.address, {from: admin});
      await matchingEngine.setKyberStorage(storage.address, {from: admin});
      await storage.setFeeAccountedPerReserveType(true, true, true, true, true, true, {
        from: admin
      });
      await storage.setEntitledRebatePerReserveType(true, true, true, true, true, true, {
        from: admin
      });

      // setup network
      await kyberNetwork.setContracts(feeHandler.address, matchingEngine.address, zeroAddress, {
        from: admin
      });
      await kyberNetwork.addOperator(operator, {from: admin});
      await kyberNetwork.addKyberProxy(networkProxy, {from: admin});
      // in the emergency case, dao address is set to zero
      await kyberNetwork.setKyberDaoContract(zeroAddress, {from: admin});
      //set params, enable network
      await kyberNetwork.setParams(gasPrice, negligibleRateDiffBps, {from: admin});
      await kyberNetwork.setEnable(true, {from: admin});

      testToken = await TestToken.new('test', 'tst', new BN(18));
      let tokens = [testToken];
      rebateWallets = [accounts[7], accounts[8]];
      let result = await nwHelper.setupReserves(network, tokens, 2, 0, 0, 0, accounts, admin, operator, rebateWallets);
      reserveIdToWallet = result.reserveIdToRebateWallet;
      await nwHelper.addReservesToStorage(storage, result.reserveInstances, tokens, operator);
    });

    it('network should trade, fee update as expected', async () => {
      let ethSrcQty = new BN(10).pow(new BN(18));
      let initalState = await getFeeHanlerState(feeHandler, rebateWallets, platformWallet);
      let txResult = await kyberNetwork.tradeWithHintAndFee(
        kyberNetwork.address,
        ethAddress,
        ethSrcQty,
        testToken.address,
        taker,
        maxDestAmt,
        minConversionRate,
        platformWallet,
        platformFeeBps,
        emptyHint,
        {value: ethSrcQty, from: networkProxy}
      );

      let tradeEventArgs = nwHelper.getTradeEventArgs(txResult);
      let tradedReserve = tradeEventArgs.e2tIds[0];
      let rebateWallet = reserveIdToWallet[tradedReserve];
      platformFeeWei = ethSrcQty.mul(platformFeeBps).div(BPS);
      fee = ethSrcQty
        .mul(networkFeeBps)
        .div(BPS)
        .add(platformFeeWei);
      let brrFeeResult = calculateBrrFee(fee.sub(platformFeeWei), rewardBps, rebateBps, [rebateWallet], [BPS]);
      await expectEvent.inTransaction(txResult.tx, feeHandler, 'HandleFee');
      await expectEvent.inTransaction(txResult.tx, feeHandler, 'FeeDistribution', {
        platformWallet,
        platformFeeWei,
        rewardWei: brrFeeResult.rewardWei,
        rebateWei: brrFeeResult.rebateWei,
        rebateWallets: [rebateWallet],
        burnAmountWei: brrFeeResult.burnWei
      });
      await assertStateAfterHandlerFees(feeHandler, initalState, platformWallet, platformFeeWei, brrFeeResult);
    });
  });
});

async function getFeeHanlerState (feeHandler, rebateWallets, platformWallet) {
  let rebatePerWallet = [];
  for (let i = 0; i < rebateWallets.length; i++) {
    let rebateWei = await feeHandler.rebatePerWallet(rebateWallets[i]);
    rebatePerWallet.push(rebateWei);
  }
  return {
    rewardWei: await feeHandler.totalRewardWei(),
    platformFeeWei: await feeHandler.feePerPlatformWallet(platformWallet),
    rebatePerWallet
  };
}

function calculateBrrFee (networkFee, rewardBps, rebateBps, rebateWallets, rebateBpsPerWallet) {
  let rewardWei = networkFee.mul(rewardBps).div(BPS);
  let rebateWei = networkFee.mul(rebateBps).div(BPS);
  let totalRebatePaidWei = new BN(0);
  rebatePerWallets = [];
  for (let i = 0; i < rebateWallets.length; i++) {
    let rebatePerWallet = rebateWei.mul(rebateBpsPerWallet[i]).div(BPS);
    totalRebatePaidWei = totalRebatePaidWei.add(rebatePerWallet);
    rebatePerWallets.push(rebatePerWallet);
  }
  rewardWei = rewardWei.add(rebateWei.sub(totalRebatePaidWei));
  let burnWei = networkFee.sub(rewardWei).sub(totalRebatePaidWei);
  return {
    rewardWei,
    burnWei,
    rebateWei: totalRebatePaidWei,
    rebateWallets,
    rebatePerWallets
  };
}

async function assertStateAfterHandlerFees (feeHandler, initalState, platformWallet, platformFeeWei, feeBrrResult) {
  let afterState = await getFeeHanlerState(feeHandler, feeBrrResult.rebateWallets, platformWallet);
  let expectedPlatformFeeWei = initalState.platformFeeWei.add(platformFeeWei);
  Helper.assertEqual(expectedPlatformFeeWei, afterState.platformFeeWei, 'unexpected platform Fee');

  Helper.assertEqual(afterState.rewardWei, initalState.rewardWei.add(feeBrrResult.rewardWei), 'unexpected rewardWei');

  if (rebateWallets.length == 0) {
    return;
  }

  for (let i = 0; i < feeBrrResult.rebateWallets.length; i++) {
    let rebatePerWallet = feeBrrResult.rebatePerWallets[i];
    Helper.assertEqual(
      rebatePerWallet.add(initalState.rebatePerWallet[i]),
      afterState.rebatePerWallet[i],
      'unpected rebatePerWallet'
    );
  }
}
