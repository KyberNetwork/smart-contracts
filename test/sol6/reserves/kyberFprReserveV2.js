const MockConversionRates = artifacts.require("MockConversionRates");
const TestToken = artifacts.require("TestToken");
const WethToken = artifacts.require("WethToken");
const Reserve = artifacts.require("KyberFprReserveV2");
const MockSanityRates = artifacts.require("MockSanityRates");
const NoPayableFallback = artifacts.require("NoPayableFallback");

const Helper = require("../../helper.js");
const reserveSetup = require("../../reserveSetup.js");
const BN = web3.utils.BN;

//global variables
//////////////////
const {precisionUnits, ethDecimals, ethAddress, zeroAddress, zeroBN, MAX_ALLOWANCE} = require("../../helper.js");
const {expectEvent, expectRevert} = require('@openzeppelin/test-helpers');

//balances
let expectedReserveBalanceWei = new BN(0);
let expectedReserveBalanceWeth = new BN(0);
let reserveTokenBalance = [];
let reserveTokenImbalance = [];
let minimalRecordResolution;

//permission groups
let admin;
let operator;
let alerter;
let network;
let withdrawAddress;

//contracts
let weth;
let convRatesInst;
let reserveInst;

//block data
let currentBlock;
let maxGasPrice = new BN(150).mul(new BN(10).pow(new BN(9))); // 150 * 10^9
let doRateValidation = true;

//tokens data
////////////
let numTokens = 5;
let tokens = [];
let tokenDecimals = [];
let tokenAdd = [];

//base buy and sell rates (prices)
let baseBuyRate = [];
let baseSellRate = [];

//imbalance buy and sell steps, check values in reserveSetup file
let imbalanceBuyStepX = [];
let imbalanceBuyStepY = [];
let imbalanceSellStepX = [];
let imbalanceSellStepY = [];

//compact datam  check values in reserveSetup file
let compactBuyArr = [];
let compactSellArr = [];

// v1 data
let qtyBuyStepX = [];
let qtyBuyStepY = [];
let qtySellStepX = [];
let qtySellStepY = [];

contract('KyberFprReserveV2', function(accounts) {
  before("Global setup", async function () {
    // set account addresses
    admin = accounts[0];
    operator = accounts[1];
    network = accounts[2];
    user1 = accounts[4];
    withdrawAddress = accounts[6];
    alerter = accounts[8];
    walletForToken = accounts[9];

    currentBlock = await Helper.getCurrentBlock();
    weth = await WethToken.new("WrapETH", "WETH", 18);

    // create tokens
    for (let i = 0; i < numTokens; ++i) {
      tokenDecimals[i] = new BN(18);
      token = await TestToken.new("test" + i, "tst" + i, tokenDecimals[i]);
      tokens[i] = token;
      tokenAdd[i] = token.address;
    }
  });

  const setupMockConversionRatesContract = async function(needToken) {
    convRatesInst = await MockConversionRates.new();
    if (needToken) {
      for(let i = 0; i < numTokens; i++) {
        let tokensPerEther = precisionUnits.mul(new BN((i + 1) * 3));
        let ethersPerToken = precisionUnits.div(new BN((i + 1) * 3));
        await convRatesInst.setBaseRates(tokenAdd[i], tokensPerEther, ethersPerToken);
      }
    }
  }

  const tradeAndVerifyData = async function(
    reserveInst, isBuy, tokenInd,
    srcAmount, recipient, srcTokenWallet, destTokenWallet, isUsingWeth, isValidate
  ) {

    let recipientDestTokenBal;
    if (isBuy) {
      recipientDestTokenBal = await tokens[tokenInd].balanceOf(recipient);
    } else {
      recipientDestTokenBal = await Helper.getBalancePromise(recipient);
    }

    let token = tokens[tokenInd];
    let srcAddress = isBuy ? ethAddress : tokenAdd[tokenInd];
    let destAddress = isBuy ? tokenAdd[tokenInd] : ethAddress;
    let conversionRate = await reserveInst.getConversionRate(srcAddress, destAddress, srcAmount, currentBlock);
    Helper.assertGreater(conversionRate, 0, "rate should be positive");
    Helper.assertEqual(
      await convRatesInst.getRate(tokenAdd[tokenInd], currentBlock, isBuy, srcAmount),
      conversionRate,
      "rate doesn't match conversion rate data"
    )

    //perform trade
    let tx = await reserveInst.trade(
      srcAddress, srcAmount, destAddress, recipient, conversionRate, isValidate,
      {
        from: network,
        value: isBuy ? srcAmount : 0
      }
    );
    let expectedDestAmount;
    if (isBuy) {
      expectedDestAmount = Helper.calcDstQty(srcAmount, ethDecimals, tokenDecimals[tokenInd], conversionRate);
    } else {
      expectedDestAmount = Helper.calcDstQty(srcAmount, tokenDecimals[tokenInd], ethDecimals, conversionRate);
    }
    // check trade event
    expectEvent(tx, "TradeExecute", {
      origin: network,
      src: srcAddress,
      srcAmount: srcAmount,
      destToken: destAddress,
      destAmount: expectedDestAmount,
      destAddress: recipient
    })

    // check reserve has received token
    if (isBuy) {
      // check reserve has received eth
      if (!isUsingWeth) {
        // eth is transferred to reserve
        expectedReserveBalanceWei = expectedReserveBalanceWei.add(srcAmount);
        let balance = await Helper.getBalancePromise(reserveInst.address);
        Helper.assertEqual(balance, expectedReserveBalanceWei, "bad reserve balance wei");
      } else {
        // weth is transferred to weth token wallet
        expectedReserveBalanceWeth = expectedReserveBalanceWeth.add(srcAmount);
        let wethBalance = await weth.balanceOf(srcTokenWallet);
        Helper.assertEqual(wethBalance, expectedReserveBalanceWeth, "bad reserve weth balance");
      }

      // check user has received token
      let tokenTweiBalance = await token.balanceOf(recipient);
      recipientDestTokenBal = recipientDestTokenBal.add(expectedDestAmount);
      Helper.assertEqual(tokenTweiBalance, recipientDestTokenBal, "bad recipient token balance");

      // check reserve's dest token balance
      reserveTokenBalance[tokenInd] = reserveTokenBalance[tokenInd].sub(expectedDestAmount);
      let destTokenBal = await token.balanceOf(destTokenWallet);
      Helper.assertEqual(destTokenBal, reserveTokenBalance[tokenInd], "bad reserve dest token");
    } else {
      // check reserve has received token
      reserveTokenBalance[tokenInd] = reserveTokenBalance[tokenInd].add(srcAmount);
      let srcTokenBal = await token.balanceOf(srcTokenWallet);
      Helper.assertEqual(srcTokenBal, reserveTokenBalance[tokenInd], "bad reserve src token");

      // check user has received eth
      let userEthBal = await Helper.getBalancePromise(recipient);
      recipientDestTokenBal = recipientDestTokenBal.add(expectedDestAmount);
      Helper.assertEqual(userEthBal, recipientDestTokenBal, "bad recipient eth balance");

      if (!isUsingWeth) {
        expectedReserveBalanceWei = expectedReserveBalanceWei.sub(expectedDestAmount);
        let balance = await Helper.getBalancePromise(reserveInst.address);
        Helper.assertEqual(balance, expectedReserveBalanceWei, "bad reserve balance wei");
      } else {
        // weth is transferred to weth token wallet
        expectedReserveBalanceWeth = expectedReserveBalanceWeth.sub(expectedDestAmount);
        let wethBalance = await weth.balanceOf(destTokenWallet);
        Helper.assertEqual(wethBalance, expectedReserveBalanceWeth, "bad reserve weth balance");
      }
    }
  };

  const collectFundsAfterTests = async function(tokenWallet) {
    // collect eth
    let balance = await Helper.getBalancePromise(reserveInst.address);
    if (balance.gt(zeroBN)) {
      await reserveInst.withdraw(ethAddress, balance, withdrawAddress, {from: operator});
    }
    // collect weth
    balance = await weth.balanceOf(tokenWallet);
    if (balance.gt(zeroBN)) {
      await reserveInst.withdraw(weth.address, balance, withdrawAddress, {from: operator});
    }
    for(let i = 0; i < numTokens; i++) {
      let balance = await tokens[i].balanceOf(tokenWallet);
      if (balance.gt(zeroBN)) {
        await reserveInst.withdraw(tokenAdd[i], balance, withdrawAddress, {from: operator});
      }
    }
  }

  // general setup reserve contract with fund in token wallet
  // need to set token wallet manually
  const generalSetupReserveContract = async function(isUsingTokenWallet, isUsingWeth) {
    let tokenWallet = isUsingTokenWallet ? walletForToken : zeroAddress;
    let setupData = await reserveSetup.setupFprReserveV2(
      convRatesInst, tokens, weth, network, maxGasPrice,
      accounts, admin, operator, alerter,
      withdrawAddress, tokenWallet, isUsingWeth, doRateValidation
    );
    reserveInst = setupData.reserveInst;
    expectedReserveBalanceWei = setupData.reserveBalanceWei;
    expectedReserveBalanceWeth = setupData.reserveBalanceWeth;
    reserveTokenBalance = setupData.tokenBalances;
    reserveTokenImbalance = setupData.tokenImbalances;
    currentBlock = await Helper.getCurrentBlock();
  }

  const transferTokenForT2ETest = async function(token, amount) {
    await token.transfer(network, amount);
    // reset allowance, prevent fail if allowance is still greater than 0
    await token.approve(reserveInst.address, 0, {from: network});
    // approve enough allowance
    await token.approve(reserveInst.address, amount, {from: network});
  }

  describe("#Test using eth + tokens in reserve", async() => {
    before("set up contracts", async() => {
      //init conversion rate
      await setupMockConversionRatesContract(true);
      await generalSetupReserveContract(false, false);
    });

    beforeEach("reset balance and allowance of network", async() => {
      for(let i = 0; i < numTokens; i++) {
        await tokens[i].approve(reserveInst.address, 0, {from: network});
        let tokenBal = await tokens[i].balanceOf(network);
        if (tokenBal.gt(zeroBN)) {
          await tokens[i].transfer(accounts[0], tokenBal, {from: network});
        }
      }
    });

    after("collect funds", async() => {
      await collectFundsAfterTests(reserveInst.address);
    });

    it("Test a few buys check: correct balances change, rate is expected rate.", async function () {
      let tokenInd = 3;
      let numberTxs = 15;

      for (let i = 0; i < numberTxs; i++) {
        let amountWei = new BN(Helper.getRandomInt(10, 400));
        await tradeAndVerifyData(
          reserveInst,
          true, // is buy
          tokenInd,
          amountWei,
          user1, // recipient
          reserveInst.address, // address to hold src token
          reserveInst.address, // address to hold dest token
          false, // not using weth
          true // validate
        );
      };
    });

    it("Test a few sells and check: correct balances change, rate is expected rate.", async function () {
      let tokenInd = 3;
      let token = tokens[tokenInd];
      let numberTxs = 15;

      for (let i = 0; i < numberTxs; i++) {
        let amountTwei = new BN(Helper.getRandomInt(1000, 10000));
        // transfer and approve token to network
        await transferTokenForT2ETest(token, amountTwei);

        await tradeAndVerifyData(
          reserveInst,
          false, // is buy
          tokenInd,
          amountTwei,
          user1, // recipient
          reserveInst.address, // address to hold src token
          reserveInst.address, // address to hold dest token
          false, // not using weth
          true // validate
        );
      };
    });

    it("Test verify trade success when validation disabled.", async function () {
      let tokenInd = 3;
      let amountWei = new BN(20);

      // eth -> token
      await tradeAndVerifyData(
        reserveInst,
        true, // is buy
        tokenInd,
        amountWei,
        user1, // recipient
        reserveInst.address, // wallet to hold src token
        reserveInst.address, // wallet to hold dest token
        false, // not using weth
        false // disable validate
      );

      // token -> eth
      let token = tokens[tokenInd];
      let amountTwei = new BN(25);

      // transfer and approve token to network
      await transferTokenForT2ETest(token, amountTwei);

      await tradeAndVerifyData(
        reserveInst,
        false, // sell trade
        tokenInd,
        amountTwei,
        user1, // recipient
        reserveInst.address, // wallet to hold src token
        reserveInst.address, // wallet to hold dest token
        false, // not using weth
        false // validate
      );
    });

    it("Test sell reverts recipient can not receive eth", async() => {
      let tokenInd = 3;
      let token = tokens[tokenInd];
      let amountTwei = new BN(25);

      // transfer and approve token to network
      await transferTokenForT2ETest(token, amountTwei);

      let conversionRate = await reserveInst.getConversionRate(tokenAdd[tokenInd], ethAddress, amountTwei, currentBlock);
      Helper.assertGreater(conversionRate, 0);

      let recipient = await NoPayableFallback.new();

      await expectRevert(
        reserveInst.trade(tokenAdd[tokenInd], amountTwei, ethAddress,
          recipient.address, conversionRate, true,
          {
            from: network
          }
        ),
        "transfer eth from reserve to destAddress failed",
      );
      await token.transfer(accounts[0], amountTwei, {from: network});
      await token.approve(reserveInst.address, 0, {from: network});
    });

    it("Test set token wallet to reserve, trade should be successful", async() => {
      let tokenInd = 2;
      await reserveInst.setTokenWallet(tokenAdd[tokenInd], reserveInst.address, {from: admin});

      // buy token
      await tradeAndVerifyData(
        reserveInst,
        true, // is buy
        tokenInd,
        new BN(20), // src amount
        user1, // recipient
        reserveInst.address, // wallet to hold src token
        reserveInst.address, // wallet to hold dest token
        false, // not using weth
        false // disable validate
      );
      // sell token
      let token = tokens[tokenInd];
      let amountTwei = new BN(100);

      // transfer and approve token to network
      await transferTokenForT2ETest(token, amountTwei);

      await tradeAndVerifyData(
        reserveInst,
        false, // sell trade
        tokenInd,
        amountTwei,
        user1, // recipient
        reserveInst.address, // wallet to hold src token
        reserveInst.address, // wallet to hold dest token
        false, // not using weth
        false // validate
      );
    });

    it("Test getConversionRate returns 0 when not enough balance", async() => {
       // test buy, not enough token
       let tokenInd = 2;
       let amountWei = new BN(20);

       let conversionRate = await reserveInst.getConversionRate(ethAddress, tokenAdd[tokenInd], amountWei, currentBlock);
       Helper.assertGreater(conversionRate, 0);

       let destQty = Helper.calcDstQty(amountWei, ethDecimals, tokenDecimals[tokenInd], conversionRate);
       let tokenBal = reserveTokenBalance[tokenInd];
       if (tokenBal.gt(destQty)) {
         // without some tokens
         let remainToken = destQty.sub(new BN(1));
         reserveTokenBalance[tokenInd] = remainToken;
         await reserveInst.withdraw(tokenAdd[tokenInd], tokenBal.sub(remainToken), withdrawAddress, {from: operator});
       }

       // check conversion rate
       conversionRate = await reserveInst.getConversionRate(ethAddress, tokenAdd[tokenInd], amountWei, currentBlock);
       Helper.assertEqual(0, conversionRate);

       // test sell, not enough eth
       let amountTwei = new BN(300);
       conversionRate = await reserveInst.getConversionRate(tokenAdd[tokenInd], ethAddress, amountTwei, currentBlock);
       Helper.assertGreater(conversionRate, 0);

       destQty = Helper.calcDstQty(amountTwei, tokenDecimals[tokenInd], ethDecimals, conversionRate);
       let ethBalance = expectedReserveBalanceWei;
       if (ethBalance.gt(destQty)) {
         // without some tokens
         let remainToken = destQty.sub(new BN(1));
         expectedReserveBalanceWei = remainToken;
         await reserveInst.withdraw(ethAddress, ethBalance.sub(remainToken), withdrawAddress, {from: operator});
       }

       // check conversion rate
       conversionRate = await reserveInst.getConversionRate(tokenAdd[tokenInd], ethAddress, amountTwei, currentBlock);
       Helper.assertEqual(0, conversionRate);
    });
  });

  describe("#Test eth in reserve, tokens in another wallet", async() => {
    before("setup contracts", async() => {
      await setupMockConversionRatesContract(true);
      await generalSetupReserveContract(true, false);

      // approve
      for(let i = 0; i < numTokens; i++) {
        await reserveInst.setTokenWallet(tokenAdd[i], walletForToken, {from: admin});
        await tokens[i].approve(reserveInst.address, MAX_ALLOWANCE, {from: walletForToken});
      }
    });

    beforeEach("reset balance and allowance of network", async() => {
      for(let i = 0; i < numTokens; i++) {
        await tokens[i].approve(reserveInst.address, 0, {from: network});
        let tokenBal = await tokens[i].balanceOf(network);
        if (tokenBal.gt(zeroBN)) {
          await tokens[i].transfer(accounts[0], tokenBal, {from: network});
        }
      }
    });

    after("collect funds", async() => {
      await collectFundsAfterTests(walletForToken);
    });

    it("Test a few buys and check: correct balances change, rate is expected rate", async function () {
      let tokenInd = 1;
      let numberTxs = 15;

      for (let i = 0; i < numberTxs; i++) {
        let amountWei = new BN(Helper.getRandomInt(100, 1500));
        await tradeAndVerifyData(
          reserveInst,
          true, // is buy
          tokenInd,
          amountWei,
          user1, // recipient
          reserveInst.address, // address to hold src token
          walletForToken, // address to hold dest token
          false, // not using weth
          true // validate
        );
      };
    });

    it("Test a few sells and check: correct balances change, rate is expected rate.", async function () {
      let tokenInd = 2;
      let token = tokens[tokenInd];
      let numberTxs = 15;

      for (let i = 0; i < numberTxs; i++) {
        let amountTwei = new BN(Helper.getRandomInt(500, 5000));
        // transfer and approve token to network
        await transferTokenForT2ETest(token, amountTwei);

        await tradeAndVerifyData(
          reserveInst,
          false, // sell trade
          tokenInd,
          amountTwei,
          user1, // recipient
          walletForToken, // address to hold src token
          reserveInst.address, // address to hold dest token
          false, // not using weth
          true // validate
        );
      };
    });

    it("Test verify trade success when validation disabled.", async function () {
      let tokenInd = 3;
      let amountWei = new BN(20);

      // eth -> token
      await tradeAndVerifyData(
        reserveInst,
        true, // is buy
        tokenInd,
        amountWei,
        user1, // recipient
        reserveInst.address, // wallet to hold src token
        walletForToken, // wallet to hold dest token
        false, // not using weth
        false // disable validate
      );

      // token -> eth
      let token = tokens[tokenInd];
      let amountTwei = new BN(25);

      // transfer and approve token to network
      await transferTokenForT2ETest(token, amountTwei);

      await tradeAndVerifyData(
        reserveInst,
        false, // is buy = false
        tokenInd,
        amountTwei,
        user1, // recipient
        walletForToken, // wallet to hold src token
        reserveInst.address, // wallet to hold dest token
        false, // not using weth
        false // validate
      );
    });

    it("Test buy is reverted when walletForToken does not give allowance to reserve", async() => {
      let tokenInd = 2;
      let amountWei = new BN(200);

      let conversionRate = await reserveInst.getConversionRate(ethAddress, tokenAdd[tokenInd], amountWei, currentBlock);
      Helper.assertGreater(conversionRate, 0, "conversion rate should be > 0");

      await tokens[tokenInd].approve(reserveInst.address, 0, {from: walletForToken});

      conversionRate = await reserveInst.getConversionRate(ethAddress, tokenAdd[tokenInd], amountWei, currentBlock);

      Helper.assertEqual(0, conversionRate, "conversion rate should be 0");

      // fake conversion rate to 1
      conversionRate = precisionUnits;
      await expectRevert.unspecified(
        reserveInst.trade(ethAddress, amountWei, tokenAdd[tokenInd],
          user1, conversionRate, true,
          {
            from: network,
            value: amountWei
          }
        )
      )

      await tokens[tokenInd].approve(reserveInst.address, MAX_ALLOWANCE, {from: walletForToken});

      conversionRate = await reserveInst.getConversionRate(ethAddress, tokenAdd[tokenInd], amountWei, currentBlock);
      Helper.assertGreater(conversionRate, 0, "conversion rate should be > 0");
      let destQty = Helper.calcDstQty(amountWei, ethDecimals, tokenDecimals[tokenInd], conversionRate);

      await tokens[tokenInd].approve(reserveInst.address, 0, {from: walletForToken});
      // approve less than destQty
      await tokens[tokenInd].approve(reserveInst.address, destQty.sub(new BN(1)), {from: walletForToken});

      await expectRevert.unspecified(
        reserveInst.trade(ethAddress, amountWei, tokenAdd[tokenInd],
          user1, conversionRate, true,
          {
            from: network,
            value: amountWei
          }
        )
      )

      await tokens[tokenInd].approve(reserveInst.address, MAX_ALLOWANCE, {from: walletForToken});
    });

    it("Test buy is reverted when walletForToken does not have enough balance", async() => {
      let tokenInd = 2;
      let amountWei = new BN(200);

      let conversionRate = await reserveInst.getConversionRate(ethAddress, tokenAdd[tokenInd], amountWei, currentBlock);
      Helper.assertGreater(conversionRate, 0, "conversion rate should be > 0");
      let destQty = Helper.calcDstQty(amountWei, ethDecimals, tokenDecimals[tokenInd], conversionRate);

      let tokenBal = reserveTokenBalance[tokenInd];

      if (tokenBal.gt(destQty)) {
        // transfer tokens from wallet
        // wallet should have (destQty - 1) tokens
        let remainToken = destQty.sub(new BN(1));
        reserveTokenBalance[tokenInd] = remainToken;
        await tokens[tokenInd].transfer(accounts[0], tokenBal.sub(remainToken), {from: walletForToken});
      }

      await expectRevert.unspecified(
        reserveInst.trade(ethAddress, amountWei, tokenAdd[tokenInd],
          user1, conversionRate, true,
          {
            from: network,
            value: amountWei
          }
        )
      )

      // transfer token to reserve, buy should still fail
      await tokens[tokenInd].transfer(reserveInst.address, destQty);
      await expectRevert.unspecified(
        reserveInst.trade(ethAddress, amountWei, tokenAdd[tokenInd],
          user1, conversionRate, true,
          {
            from: network,
            value: amountWei
          }
        )
      )

      // transfer back tokens
      await tokens[tokenInd].transfer(walletForToken, tokenBal);
      reserveTokenBalance[tokenInd] = reserveTokenBalance[tokenInd].add(tokenBal);
    });

    it("Test sell is successful when walletForToken does not give allowance to reserve", async() => {
      let tokenInd = 2;
      let token = tokens[tokenInd];
      let amountTwei = new BN(30);

      // transfer and approve token to network
      await transferTokenForT2ETest(token, amountTwei);

      await tradeAndVerifyData(
        reserveInst,
        false, // sell trade
        tokenInd,
        amountTwei,
        user1, // recipient
        walletForToken, // wallet to hold src token
        reserveInst.address, // wallet to hold dest token
        false, // not using weth
        true // validate
      );
    });

    it("Test sell is successful when walletForToken does not have tokens", async() => {
      let tokenInd = 2;
      let token = tokens[tokenInd];
      let amountTwei = new BN(30);

      // transfer and approve token to network
      await transferTokenForT2ETest(token, amountTwei);

      let tokenBal = reserveTokenBalance[tokenInd];

      if (tokenBal.gt(zeroBN)) {
        // transfer tokens from wallet
        await tokens[tokenInd].transfer(accounts[0], tokenBal, {from: walletForToken});
        reserveTokenBalance[tokenInd] = zeroBN;
      }

      await tradeAndVerifyData(
        reserveInst,
        false, // sell trade
        tokenInd,
        amountTwei,
        user1, // recipient
        walletForToken, // wallet to hold src token
        reserveInst.address, // wallet to hold dest token
        false, // not using weth
        true // validate
      );

      // transfer back token
      if (tokenBal.gt(zeroBN)) {
        // transfer tokens from wallet
        await tokens[tokenInd].transfer(walletForToken, tokenBal);
        reserveTokenBalance[tokenInd] = tokenBal;
      }
    });
  });

  describe("#Test using weth", async() => {
    before("setup contracts", async() => {
      await setupMockConversionRatesContract(true);
      // using wallet for token, wallet for weth
      await generalSetupReserveContract(true, true);

      // approve
      await reserveInst.setTokenWallet(weth.address, walletForToken, {from: admin});
      await weth.approve(reserveInst.address, MAX_ALLOWANCE, {from: walletForToken});
      for(let i = 0; i < numTokens; i++) {
        await reserveInst.setTokenWallet(tokenAdd[i], walletForToken, {from: admin});
        await tokens[i].approve(reserveInst.address, MAX_ALLOWANCE, {from: walletForToken});
      }
    });

    beforeEach("reset balance and allowance of network", async() => {
      for(let i = 0; i < numTokens; i++) {
        await tokens[i].approve(reserveInst.address, 0, {from: network});
        let tokenBal = await tokens[i].balanceOf(network);
        if (tokenBal.gt(zeroBN)) {
          await tokens[i].transfer(accounts[0], tokenBal, {from: network});
        }
      }
    });

    after("collect funds", async() => {
      await collectFundsAfterTests(walletForToken);
    });

    it("Test a few buys and check: correct balances change, rate is expected rate", async function () {
      let tokenInd = 1;
      let numberTxs = 15;

      for (let i = 0; i < numberTxs; i++) {
        let amountWei = new BN(Helper.getRandomInt(100, 1500));
        await tradeAndVerifyData(
          reserveInst,
          true, // is buy
          tokenInd,
          amountWei,
          user1, // recipient
          walletForToken, // address to hold src token
          walletForToken, // address to hold dest token
          true, // using weth
          true // validate
        );
      };
    });

    it("Test a few sells check: correct balances change, rate is expected rate.", async function () {
      let tokenInd = 2;
      let token = tokens[tokenInd];
      let numberTxs = 15;

      for (let i = 0; i < numberTxs; i++) {
        let amountTwei = new BN(Helper.getRandomInt(500, 5000));
        // transfer and approve token to network
        await transferTokenForT2ETest(token, amountTwei);

        await tradeAndVerifyData(
          reserveInst,
          false, // sell trade
          tokenInd,
          amountTwei,
          user1, // recipient
          walletForToken, // address to hold src token
          walletForToken, // address to hold dest token
          true, // using weth
          true // validate
        );
      };
    });

    it("Test verify trade success when validation disabled.", async function () {
      let tokenInd = 3;
      let amountWei = new BN(20);

      // eth -> token
      await tradeAndVerifyData(
        reserveInst,
        true, // is buy
        tokenInd,
        amountWei,
        user1, // recipient
        walletForToken, // wallet to hold src token
        walletForToken, // wallet to hold dest token
        true, // using weth
        false // disable validate
      );

      // token -> eth
      let token = tokens[tokenInd];
      let amountTwei = new BN(25);

      // transfer and approve token to network
      await transferTokenForT2ETest(token, amountTwei);

      await tradeAndVerifyData(
        reserveInst,
        false, // is buy = false
        tokenInd,
        amountTwei,
        user1, // recipient
        walletForToken, // wallet to hold src token
        walletForToken, // wallet to hold dest token
        true, // using weth
        false // validate
      );
    });

    it("Test buy is successful when no weth balance or allowance", async() => {
      let tokenInd = 3;
      let amountWei = new BN(20);

      // set allowance to 0
      await weth.approve(reserveInst.address, 0, {from: walletForToken});

      await tradeAndVerifyData(
        reserveInst,
        true, // is buy
        tokenInd,
        amountWei,
        user1, // recipient
        walletForToken, // wallet to hold src token
        walletForToken, // wallet to hold dest token
        true, // using weth
        false // disable validate
      );

      // set back allowance to max
      await weth.approve(reserveInst.address, MAX_ALLOWANCE, {from: walletForToken});
      // withdraw all weth
      let wethBalance = expectedReserveBalanceWeth;
      if (wethBalance.gt(zeroBN)) {
        await weth.transfer(accounts[0], wethBalance, {from: walletForToken});
        expectedReserveBalanceWeth = new BN(0);
      }

      await tradeAndVerifyData(
        reserveInst,
        true, // is buy
        tokenInd,
        amountWei,
        user1, // recipient
        walletForToken, // wallet to hold src token
        walletForToken, // wallet to hold dest token
        true, // using weth
        false // disable validate
      );

      // transfer back weth
      if (wethBalance.gt(zeroBN)) {
        await weth.transfer(walletForToken, wethBalance, {from: accounts[0]});
        expectedReserveBalanceWeth = expectedReserveBalanceWeth.add(wethBalance);
      }
    });

    it("Test sell is reverted not enough allowance for weth", async() => {
      let tokenInd = 2;
      let token = tokens[tokenInd];
      let amountTwei = new BN(30);

      // transfer and approve token to network
      await transferTokenForT2ETest(token, amountTwei);

      let conversionRate = await reserveInst.getConversionRate(tokenAdd[tokenInd], ethAddress, amountTwei, currentBlock);
      Helper.assertGreater(conversionRate, 0);
      let destQty = Helper.calcDstQty(amountTwei, tokenDecimals[tokenInd], ethDecimals, conversionRate);

      await weth.approve(reserveInst.address, 0, {from: walletForToken});
      await weth.approve(reserveInst.address, destQty.sub(new BN(1)), {from: walletForToken});

      await expectRevert.unspecified(
        reserveInst.trade(tokenAdd[tokenInd], amountTwei, ethAddress,
          user1, conversionRate, true,
          {
            from: network
          }
        )
      )

      await weth.approve(reserveInst.address, 0, {from: walletForToken});
      await weth.approve(reserveInst.address, destQty, {from: walletForToken});

      await tradeAndVerifyData(
        reserveInst,
        false, // is buy = false
        tokenInd,
        amountTwei,
        user1, // recipient
        walletForToken, // wallet to hold src token
        walletForToken, // wallet to hold dest token
        true, // using weth
        false // validate
      );

      await weth.approve(reserveInst.address, 0, {from: walletForToken});
      await weth.approve(reserveInst.address, MAX_ALLOWANCE, {from: walletForToken});
    });

    it("Test sell is reverted not enough weth balance", async() => {
      let tokenInd = 2;
      let token = tokens[tokenInd];
      let amountTwei = new BN(30);

      // transfer and approve token to network
      await transferTokenForT2ETest(token, amountTwei);

      let conversionRate = await reserveInst.getConversionRate(tokenAdd[tokenInd], ethAddress, amountTwei, currentBlock);
      Helper.assertGreater(conversionRate, 0);
      let destQty = Helper.calcDstQty(amountTwei, tokenDecimals[tokenInd], ethDecimals, conversionRate);

      let wethBalance = expectedReserveBalanceWeth;
      if (wethBalance.gt(destQty)) {
        let remainToken = destQty.sub(new BN(1));
        expectedReserveBalanceWeth = remainToken;
        await weth.transfer(accounts[0], wethBalance.sub(remainToken), {from: walletForToken});
      }

      await expectRevert.unspecified(
        reserveInst.trade(tokenAdd[tokenInd], amountTwei, ethAddress,
          user1, conversionRate, true,
          {
            from: network
          }
        )
      )

      let newWethBalance = expectedReserveBalanceWeth;
      if (destQty.gt(newWethBalance)) {
        let addedAmount = destQty.sub(newWethBalance);
        expectedReserveBalanceWeth = expectedReserveBalanceWeth.add(addedAmount);
        await weth.transfer(walletForToken, addedAmount);
      }

      await tradeAndVerifyData(
        reserveInst,
        false, // is buy = false
        tokenInd,
        amountTwei,
        user1, // recipient
        walletForToken, // wallet to hold src token
        walletForToken, // wallet to hold dest token
        true, // using weth
        false // validate
      );

      // transfer more weth to wallet
      await weth.deposit({value: wethBalance});
      await weth.transfer(walletForToken, wethBalance);
      expectedReserveBalanceWeth = expectedReserveBalanceWeth.add(wethBalance);
    });

    it("Test sell is reverted, reserve has eth but reserve uses weth and does not enough weth", async() => {
      let tokenInd = 2;
      let token = tokens[tokenInd];
      let amountTwei = new BN(30);

      // transfer and approve token to network
      await token.transfer(network, amountTwei);
      await token.approve(reserveInst.address, amountTwei, {from: network});

      let conversionRate = await reserveInst.getConversionRate(tokenAdd[tokenInd], ethAddress, amountTwei, currentBlock);
      Helper.assertGreater(conversionRate, 0);
      let destQty = Helper.calcDstQty(amountTwei, tokenDecimals[tokenInd], ethDecimals, conversionRate);

      // transfer enough eth to reserve
      await Helper.sendEtherWithPromise(withdrawAddress, reserveInst.address, destQty);
      expectedReserveBalanceWei = expectedReserveBalanceWei.add(destQty);

      // approve less, expect to revert
      await weth.approve(reserveInst.address, 0, {from: walletForToken});
      await weth.approve(reserveInst.address, destQty.sub(new BN(1)), {from: walletForToken});

      await expectRevert.unspecified(
        reserveInst.trade(tokenAdd[tokenInd], amountTwei, ethAddress,
          user1, conversionRate, true,
          {
            from: network
          }
        )
      )

      // approve max again
      await weth.approve(reserveInst.address, 0, {from: walletForToken});
      await weth.approve(reserveInst.address, MAX_ALLOWANCE, {from: walletForToken});

      // withdraw some weth
      let wethBalance = expectedReserveBalanceWeth;
      if (wethBalance.gt(destQty)) {
        let remainToken = destQty.sub(new BN(1));
        expectedReserveBalanceWeth = remainToken;
        await weth.transfer(accounts[0], wethBalance.sub(remainToken), {from: walletForToken});
      }

      await expectRevert.unspecified(
        reserveInst.trade(tokenAdd[tokenInd], amountTwei, ethAddress,
          user1, conversionRate, true,
          {
            from: network
          }
        )
      )

      // transfer back weth
      if (wethBalance.gt(expectedReserveBalanceWeth)) {
        let amountToTransfer = wethBalance.sub(expectedReserveBalanceWeth);
        await weth.transfer(walletForToken, amountToTransfer, {from: accounts[0]});
        expectedReserveBalanceWeth = expectedReserveBalanceWeth.add(amountToTransfer);
      }

      // withdraw all eth
      await reserveInst.approveWithdrawAddress(ethAddress, withdrawAddress, {from: admin});
      await reserveInst.withdraw(ethAddress, expectedReserveBalanceWei, withdrawAddress, {from: operator});
      expectedReserveBalanceWei = new BN(0);
    });

    it("Test set weth token wallet to reserve address, should trade with eth", async() => {
      // either zero address or reserve's address, reserve should trade with eth
      let tokenWallets = [zeroAddress, reserveInst.address];
      for(let i = 0; i < 2; i++) {
        await reserveInst.setTokenWallet(weth.address, tokenWallets[i], {from: admin});
        // Test buy, eth goes to reserve
        let tokenInd = 2;
        let amountWei = new BN(200);

        await tradeAndVerifyData(
          reserveInst,
          true, // is buy = true
          tokenInd,
          amountWei,
          user1, // recipient
          reserveInst.address, // wallet to hold src token
          walletForToken, // wallet to hold dest token
          false, // using weth
          false // validate
        );

        // withdraw all eth
        await reserveInst.withdraw(ethAddress, expectedReserveBalanceWei, withdrawAddress, {from: operator});
        expectedReserveBalanceWei = new BN(0);

        let amountTwei = new BN(100);
        let conversionRate = await reserveInst.getConversionRate(tokenAdd[tokenInd], ethAddress, amountTwei, currentBlock);
        // rate should be 0 as we haven't transferred eth to reserve yet
        Helper.assertEqual(conversionRate, 0);

        // transfer some eth to reserve
        await Helper.sendEtherWithPromise(withdrawAddress, reserveInst.address, precisionUnits);
        expectedReserveBalanceWei = expectedReserveBalanceWei.add(precisionUnits);
        conversionRate = await reserveInst.getConversionRate(tokenAdd[tokenInd], ethAddress, amountTwei, currentBlock);
        let destQty = Helper.calcDstQty(amountTwei, tokenDecimals[tokenInd], ethDecimals, conversionRate);
        // should have rate now
        Helper.assertGreater(conversionRate, 0);

        // transfer and approve token to network
        await transferTokenForT2ETest(tokens[tokenInd], amountTwei);

        await tradeAndVerifyData(
          reserveInst,
          false, // is buy = false
          tokenInd,
          amountTwei,
          user1, // recipient
          walletForToken, // wallet to hold src token
          reserveInst.address, // wallet to hold dest token
          false, // using weth
          false // validate
        );
      }
      // set back token wallet
      await reserveInst.setTokenWallet(weth.address, walletForToken, {from: admin});
    });

    it("Test set token wallet to reserve address, should trade as normal", async() => {
      // either zero address or reserve's address, reserve should trade with eth
      let tokenWallets = [zeroAddress, reserveInst.address];
      let tokenInd = 2;
      for(let i = 0; i < 2; i++) {
        await reserveInst.setTokenWallet(tokenAdd[tokenInd], tokenWallets[i], {from: admin});
        reserveTokenBalance[tokenInd] = await tokens[tokenInd].balanceOf(reserveInst.address);
        // test sell, should be successful without token in reserve
        let amountTwei = new BN(100);

        // transfer and approve token to network
        await transferTokenForT2ETest(tokens[tokenInd], amountTwei);

        await tradeAndVerifyData(
          reserveInst,
          false, // is buy = false
          tokenInd,
          amountTwei,
          user1, // recipient
          reserveInst.address, // wallet to hold src token
          walletForToken, // wallet to hold dest token
          true, // using weth
          false // validate
        );

        // withdraw all token
        await reserveInst.withdraw(tokenAdd[tokenInd], reserveTokenBalance[tokenInd], withdrawAddress, {from: operator});
        reserveTokenBalance[tokenInd] = new BN(0);
        // test buy
        let amountWei = new BN(200);

        // rate should be 0, as 0 token in reserve
        let conversionRate = await reserveInst.getConversionRate(ethAddress, tokenAdd[tokenInd], amountWei, currentBlock);
        Helper.assertEqual(conversionRate, 0);

        // transfer some token to reserve
        let amountToTransfer = new BN(tokenUnits(tokenDecimals[tokenInd])).mul(new BN(10000));
        reserveTokenBalance[tokenInd] = amountToTransfer;
        await tokens[tokenInd].transfer(reserveInst.address, amountToTransfer);

        await tradeAndVerifyData(
          reserveInst,
          true, // is buy = true
          tokenInd,
          amountWei,
          user1, // recipient
          walletForToken, // wallet to hold src token
          reserveInst.address, // wallet to hold dest token
          true, // using weth
          false // validate
        );
      }
      // set back token wallet
      await reserveInst.setTokenWallet(tokenAdd[tokenInd], walletForToken, {from: admin});
    });
  });

  describe("#Test getConversionRate", async() => {
    before("set up contracts", async() => {
      //init conversion rate
      await setupMockConversionRatesContract(true);
      //init reserve, not using weth, not using wallet token
      await generalSetupReserveContract(false, false);
    });

    const checkRateShouldBePositive = async() => {
      let amount = new BN(100);
      let conversionRate = await reserveInst.getConversionRate(ethAddress, tokenAdd[2], amount, currentBlock);
      Helper.assertGreater(conversionRate, 0, "rate should be > 0");
      conversionRate = await reserveInst.getConversionRate(tokenAdd[1], ethAddress, amount, currentBlock);
      Helper.assertGreater(conversionRate, 0, "rate should be > 0");
    }
    it("Test getConversionRate trade is disabled", async() => {
      // disable trade
      await reserveInst.disableTrade({from: alerter});
      let amountWei = new BN(100);
      let conversionRate = await reserveInst.getConversionRate(ethAddress, tokenAdd[1], amountWei, currentBlock);
      Helper.assertEqual(0, conversionRate, "rate should be 0");
      let amountTwei = new BN(1000);
      conversionRate = await reserveInst.getConversionRate(tokenAdd[1], ethAddress, amountTwei, currentBlock);
      Helper.assertEqual(0, conversionRate, "rate should be 0");
      // enable trade
      await reserveInst.enableTrade({from: admin});
      await checkRateShouldBePositive();
    });

    it("Test getConversionRate gas price is higher than max gas price", async() => {
      let amountWei = new BN(100);
      let conversionRate = await reserveInst.getConversionRate(
        ethAddress, tokenAdd[1], amountWei, currentBlock,
        {
          gasPrice: maxGasPrice.add(new BN(1))
        }
      );
      Helper.assertEqual(0, conversionRate, "rate should be 0");
      let amountTwei = new BN(1000);
      conversionRate = await reserveInst.getConversionRate(
        tokenAdd[1], ethAddress, amountTwei, currentBlock,
        {
          gasPrice: maxGasPrice.add(new BN(1))
        }
      );
      Helper.assertEqual(0, conversionRate, "rate should be 0");
      await checkRateShouldBePositive();
    });

    it("Test getConversionRate src qty is 0", async() => {
      let conversionRate = await reserveInst.getConversionRate(ethAddress, tokenAdd[1], zeroBN, currentBlock);
      Helper.assertEqual(0, conversionRate, "rate should be 0");
      conversionRate = await reserveInst.getConversionRate(tokenAdd[1], ethAddress, zeroBN, currentBlock);
      Helper.assertEqual(0, conversionRate, "rate should be 0");
      await checkRateShouldBePositive();
    });

    it("Test getConversionRate src and dest tokens are not eth", async() => {
      let amount = new BN(1000);
      let conversionRate = await reserveInst.getConversionRate(tokenAdd[1], tokenAdd[2], amount, currentBlock);
      Helper.assertEqual(0, conversionRate, "rate should be 0");
      conversionRate = await reserveInst.getConversionRate(tokenAdd[1], tokenAdd[1], amount, currentBlock);
      Helper.assertEqual(0, conversionRate, "rate should be 0");
      await checkRateShouldBePositive();
    });

    it("Test getConversionRate rate is 0", async() => {
      for(let i = 0; i < numTokens; i++) {
        await convRatesInst.setBaseRates(tokenAdd[i], 0, 0);
      }

      let amount = new BN(100);
      let conversionRate = await reserveInst.getConversionRate(ethAddress, tokenAdd[2], amount, currentBlock);
      Helper.assertEqual(0, conversionRate, "rate should be 0");
      conversionRate = await reserveInst.getConversionRate(tokenAdd[1], ethAddress, amount, currentBlock);
      Helper.assertEqual(0, conversionRate, "rate should be 0");

      for(let i = 0; i < numTokens; i++) {
        let tokensPerEther = precisionUnits.mul(new BN((i + 1) * 3));
        let ethersPerToken = precisionUnits.div(new BN((i + 1) * 3));
        await convRatesInst.setBaseRates(tokenAdd[i], tokensPerEther, ethersPerToken);
      }
      await checkRateShouldBePositive();
    });

    describe("#Test getBalance < destQty", async() => {
      after("reset wallet for token to reserve", async() => {
        await reserveInst.setTokenWallet(weth.address, zeroAddress, {from: admin});
        await Helper.sendEtherWithPromise(accounts[0], reserveInst.address, precisionUnits);
        for(let i = 0; i < numTokens; i++) {
          await reserveInst.setTokenWallet(tokenAdd[i], zeroAddress, {from: admin});
          // send some more token to reserve
          let amount = new BN(tokenUnits(tokenDecimals[i])).mul(new BN(10000));
          await tokens[i].transfer(reserveInst.address, amount);
        }
      });

      it("Test getConversionRate for sell token, using eth", async() => {
        // set weth wallet to 0x0 or reserve's address -> reserve is using eth
        let wallets = [zeroAddress, reserveInst.address];
        for(let i = 0; i < wallets.length; i++) {
          await reserveInst.setTokenWallet(weth.address, wallets[i], {from: admin});
          let amount = new BN(100);
          let tokenInd = 1;
          let rate = await convRatesInst.getRate(tokenAdd[tokenInd], currentBlock, false, amount);
          Helper.assertGreater(rate, 0, "conversion rate returns rate > 0");
          let destQty = Helper.calcDstQty(amount, tokenDecimals[tokenInd], ethDecimals, rate);

          // withdraw all eth
          let ethBalance = await Helper.getBalancePromise(reserveInst.address);
          await reserveInst.approveWithdrawAddress(ethAddress, withdrawAddress, true, {from: admin});
          if (ethBalance.gt(zeroBN)) {
            await reserveInst.withdraw(ethAddress, ethBalance, withdrawAddress, {from: operator});
          }

          // get rate should be = 0
          let conversionRate = await reserveInst.getConversionRate(tokenAdd[tokenInd], ethAddress, amount, currentBlock);
          Helper.assertEqual(0, conversionRate, "rate should be 0");

          // transfer eth but not enough
          await Helper.sendEtherWithPromise(withdrawAddress, reserveInst.address, destQty.sub(new BN(1)));
          // get rate should be = 0
          conversionRate = await reserveInst.getConversionRate(tokenAdd[tokenInd], ethAddress, amount, currentBlock);
          Helper.assertEqual(0, conversionRate, "rate should be 0");
          // transfer more eth, should have rate
          await Helper.sendEtherWithPromise(withdrawAddress, reserveInst.address, new BN(1));
          conversionRate = await reserveInst.getConversionRate(tokenAdd[tokenInd], ethAddress, amount, currentBlock);
          Helper.assertGreater(conversionRate, 0, "rate should be > 0");
        }
      });

      it("Test getConversionRate for sell token, using weth", async() => {
        await reserveInst.setTokenWallet(weth.address, walletForToken, {from: admin});
        let amount = new BN(100);
        let tokenInd = 1;
        let rate = await convRatesInst.getRate(tokenAdd[tokenInd], currentBlock, false, amount);
        Helper.assertGreater(rate, 0, "conversion rate returns rate > 0");
        let destQty = Helper.calcDstQty(amount, tokenDecimals[tokenInd], ethDecimals, rate);
        Helper.assertGreater(destQty, 0, "dest qty should be > 0");

        // transfer enough eth to reserve, but it should use weth
        await Helper.sendEtherWithPromise(accounts[0], reserveInst.address, destQty);

        // enough balance not not allowance
        await weth.approve(reserveInst.address, 0, {from: walletForToken});
        await weth.approve(reserveInst.address, destQty.sub(new BN(1)), {from: walletForToken});
        await weth.deposit({from: walletForToken, value: destQty});
        // get rate should be = 0
        let conversionRate = await reserveInst.getConversionRate(tokenAdd[tokenInd], ethAddress, amount, currentBlock);
        Helper.assertEqual(0, conversionRate, "rate should be 0");

        // enough allowance but not enough balance
        // withdraw all balance weth
        let wethBalance = await weth.balanceOf(walletForToken);
        await weth.withdraw(wethBalance, {from: walletForToken});
        await weth.approve(reserveInst.address, 0, {from: walletForToken});
        await weth.approve(reserveInst.address, destQty, {from: walletForToken});
        // get rate should be = 0
        conversionRate = await reserveInst.getConversionRate(tokenAdd[tokenInd], ethAddress, amount, currentBlock);
        Helper.assertEqual(0, conversionRate, "rate should be 0");
        // add more balance, but < destQty
        await weth.deposit({from: walletForToken, value: destQty.sub(new BN(1))});
        // get rate should be = 0
        conversionRate = await reserveInst.getConversionRate(tokenAdd[tokenInd], ethAddress, amount, currentBlock);
        Helper.assertEqual(0, conversionRate, "rate should be 0");
        // add more balance, should have rate now
        await weth.deposit({from: walletForToken, value: new BN(1)});
        conversionRate = await reserveInst.getConversionRate(tokenAdd[tokenInd], ethAddress, amount, currentBlock);
        Helper.assertGreater(conversionRate, 0, "rate should be > 0");
      });

      it("Test getConversionRate for buy token, token is in reserve", async() => {
        let tokenInd = 0;
        let token = tokens[tokenInd];
        // set token wallet to 0x0 or reserve's address -> token is in reserve
        let wallets = [zeroAddress, reserveInst.address];
        for(let i = 0; i < wallets.length; i++) {
          await reserveInst.setTokenWallet(tokenAdd[tokenInd], wallets[i], {from: admin});

          let amountWei = new BN(100);
          let rate = await convRatesInst.getRate(tokenAdd[tokenInd], currentBlock, true, amountWei);
          Helper.assertGreater(rate, 0, "conversion rate returns rate > 0");
          let destQty = Helper.calcDstQty(amountWei, ethDecimals, tokenDecimals[tokenInd], rate);
          Helper.assertGreater(destQty, 0, "dest qty should be > 0");

          // withdraw all token
          await reserveInst.approveWithdrawAddress(tokenAdd[tokenInd], withdrawAddress, true, {from: admin});
          let tokenBalance = await token.balanceOf(reserveInst.address);
          if (tokenBalance.gt(zeroBN)) {
            await reserveInst.withdraw(tokenAdd[tokenInd], tokenBalance, withdrawAddress, {from: operator});
          }
          // get conversion rate should be 0 now
          let conversionRate = await reserveInst.getConversionRate(ethAddress, tokenAdd[tokenInd], amountWei, currentBlock);
          Helper.assertEqual(0, conversionRate, "rate should be 0");
          // transfer token but < dest qty
          await token.transfer(reserveInst.address, destQty.sub(new BN(1)));

          // get conversion rate should be 0
          conversionRate = await reserveInst.getConversionRate(ethAddress, tokenAdd[tokenInd], amountWei, currentBlock);
          Helper.assertEqual(0, conversionRate, "rate should be 0");

          // transfer enough balance for get conversion rate
          await token.transfer(reserveInst.address, new BN(1));
          // get conversion rate should be > 0
          conversionRate = await reserveInst.getConversionRate(ethAddress, tokenAdd[tokenInd], amountWei, currentBlock);
          Helper.assertGreater(conversionRate, 0, "rate should be > 0");
        }
      });

      it("Test getConversionRate for buy token, using walletForToken", async() => {
        let amountWei = new BN(100);
        let tokenInd = 1;
        let token = tokens[tokenInd];
        await reserveInst.setTokenWallet(tokenAdd[tokenInd], walletForToken, {from: admin});
        let rate = await convRatesInst.getRate(tokenAdd[tokenInd], currentBlock, true, amountWei);
        Helper.assertGreater(rate, 0, "conversion rate returns rate > 0");
        let destQty = Helper.calcDstQty(amountWei, ethDecimals, tokenDecimals[tokenInd], rate);
        Helper.assertGreater(destQty, 0, "dest qty should be > 0");

        // transfer enough token to reserve, but it should use token from wallet
        await token.transfer(reserveInst.address, destQty);

        // enough balance not not allowance
        await token.approve(reserveInst.address, 0, {from: walletForToken});
        await token.approve(reserveInst.address, destQty.sub(new BN(1)), {from: walletForToken});
        await token.transfer(walletForToken, destQty);
        // get rate should be = 0
        let conversionRate = await reserveInst.getConversionRate(ethAddress, tokenAdd[tokenInd], amountWei, currentBlock);
        Helper.assertEqual(0, conversionRate, "rate should be 0");

        // enough allowance but not enough balance
        // withdraw all balance
        let tokenBalance = await token.balanceOf(walletForToken);
        await token.transfer(accounts[0], tokenBalance, {from: walletForToken});
        await token.approve(reserveInst.address, 0, {from: walletForToken});
        await token.approve(reserveInst.address, destQty, {from: walletForToken});
        // get rate should be = 0
        conversionRate = await reserveInst.getConversionRate(ethAddress, tokenAdd[tokenInd], amountWei, currentBlock);
        Helper.assertEqual(0, conversionRate, "rate should be 0");
        // add more balance, but < destQty
        await token.transfer(walletForToken, destQty.sub(new BN(1)));
        // get rate should be = 0
        conversionRate = await reserveInst.getConversionRate(ethAddress, tokenAdd[tokenInd], amountWei, currentBlock);
        Helper.assertEqual(0, conversionRate, "rate should be 0");
        // add more balance, should have rate now
        await token.transfer(walletForToken, 1);
        conversionRate = await reserveInst.getConversionRate(ethAddress, tokenAdd[tokenInd], amountWei, currentBlock);
        Helper.assertGreater(conversionRate, 0, "rate should be > 0");
      });
    });

    it("Test getConversionRate still returns rate when rate > 0 but destQty is 0", async() => {
      let amount = new BN(1);
      let rate = await convRatesInst.getRate(tokenAdd[0], currentBlock, false, amount);
      Helper.assertGreater(rate, 0, "conversion rate returns rate > 0");
      let destQty = Helper.calcDstQty(amount, tokenDecimals[0], ethDecimals, rate);
      Helper.assertEqual(0, destQty, "dest qty is 0");
      let conversionRate = await reserveInst.getConversionRate(tokenAdd[0], ethAddress, amount, currentBlock);
      Helper.assertGreater(conversionRate, 0, "rate should be > 0");
    });

    it("Test getConversionRate returns 0 when conversionRate reverts", async() => {
      // set conversion rate to a random contract
      let contract = await NoPayableFallback.new();
      await reserveInst.setConversionRate(contract.address, {from: admin});

      // test buy rate
      let amount = new BN(100);
      let rate = await reserveInst.getConversionRate(ethAddress, tokenAdd[1], amount, currentBlock);
      Helper.assertEqual(0, rate, "rate should be 0");

      // test sell
      rate = await reserveInst.getConversionRate(tokenAdd[1], ethAddress, amount, currentBlock);
      Helper.assertEqual(0, rate, "rate should be 0");

      // set back contracts
      await reserveInst.setConversionRate(convRatesInst.address, {from: admin});
    });

    it("Test getConversionRate reverts when conversionRate is a normal address", async() => {
      // set conversion rate to normal address
      await reserveInst.setConversionRate(accounts[0], {from: admin});

      // test buy rate
      let amount = new BN(100);
      await expectRevert.unspecified(
        reserveInst.getConversionRate(ethAddress, tokenAdd[1], amount, currentBlock)
      );

      // test sell
      await expectRevert.unspecified(
        reserveInst.getConversionRate(tokenAdd[1], ethAddress, amount, currentBlock)
      );

      // set back contracts
      await reserveInst.setConversionRate(convRatesInst.address, {from: admin});
    });

    it("Test getConversionRate reverts when sanity contract reverts", async() => {
      // set conversion rate to normal address
      await reserveInst.setSanityRate(accounts[0], {from: admin});

      // test buy rate
      let amount = new BN(100);
      await expectRevert.unspecified(
        reserveInst.getConversionRate(ethAddress, tokenAdd[1], amount, currentBlock)
      );

      // test sell
      await expectRevert.unspecified(
        reserveInst.getConversionRate(tokenAdd[1], ethAddress, amount, currentBlock)
      );

      // set back contracts
      await reserveInst.setSanityRate(zeroAddress, {from: admin});
    });

    it("Test getConversionRate returns 0 when higher than sanity rate", async() => {
      let sanityRate = await MockSanityRates.new();
      // set contracts
      await reserveInst.setSanityRate(sanityRate.address, {from: admin});
      // test buy
      let amount = new BN(100);
      let rate = await convRatesInst.getRate(tokenAdd[0], currentBlock, true, amount);
      Helper.assertGreater(rate, 0, "conversion rate returns rate > 0");

      await sanityRate.setSanityRateValue(rate.sub(new BN(1)));
      // get conversion rate should be 0
      let conversionRate = await reserveInst.getConversionRate(ethAddress, tokenAdd[0], amount, currentBlock);
      Helper.assertEqual(conversionRate, 0, "rate should be 0");

      await sanityRate.setSanityRateValue(rate);
      // get conversion rate should be > 0
      conversionRate = await reserveInst.getConversionRate(ethAddress, tokenAdd[0], amount, currentBlock);
      Helper.assertGreater(conversionRate, 0, "rate should be > 0");
      Helper.assertEqual(conversionRate, rate);

      // test sell
      rate = await convRatesInst.getRate(tokenAdd[0], currentBlock, false, amount);
      Helper.assertGreater(rate, 0, "conversion rate returns rate > 0");

      await sanityRate.setSanityRateValue(rate.sub(new BN(1)));
      // get conversion rate should be 0
      conversionRate = await reserveInst.getConversionRate(tokenAdd[0], ethAddress, amount, currentBlock);
      Helper.assertEqual(conversionRate, 0, "rate should be 0");

      await sanityRate.setSanityRateValue(rate);
      // get conversion rate should be > 0
      conversionRate = await reserveInst.getConversionRate(tokenAdd[0], ethAddress, amount, currentBlock);
      Helper.assertGreater(conversionRate, 0, "rate should be > 0");
      Helper.assertEqual(conversionRate, rate);

      // set back contracts
      await reserveInst.setSanityRate(zeroAddress, {from: admin});
    });
  });

  describe("#Test doTrade revert invalid params", async() => {
    before("set up contracts", async() => {
      //init conversion rate
      await setupMockConversionRatesContract(true);
      //init reserve
      await generalSetupReserveContract(false, false);
    });

    after("collect funds", async() => {
      await collectFundsAfterTests(reserveInst.address);
    });

    it("Test revert trade not enabled", async() => {
      // get rate before disabling
      let tokenInd = 3;
      let amountWei = new BN(100);
      let conversionRate = precisionUnits; // assume rate = 1:1

      // disable trade
      await reserveInst.disableTrade({from: alerter});
      await expectRevert(
        reserveInst.trade(ethAddress, amountWei, tokenAdd[tokenInd],
          user1, conversionRate, true,
          {
            from: network,
            value: amountWei
          }
        ),
        "trade not enable"
      )
      // re-enable trade
      await reserveInst.enableTrade({from: admin});
    });

    it("Test revert sender not network", async() => {
      let tokenInd = 3;
      let amountWei = new BN(100);
      let conversionRate = precisionUnits; // assume rate = 1:1

      await expectRevert(
        reserveInst.trade(ethAddress, amountWei, tokenAdd[tokenInd],
          user1, conversionRate, true,
          {
            from: admin,
            value: amountWei
          }
        ),
        "wrong sender"
      );
    });

    it("Test revert gas price > max gas price", async() => {
      let tokenInd = 3;
      let amountWei = new BN(100);
      let conversionRate = precisionUnits; // assume rate = 1:1

      let maxGasPrice = await reserveInst.maxGasPriceWei();

      await expectRevert(
        reserveInst.trade(ethAddress, amountWei, tokenAdd[tokenInd],
          user1, conversionRate, true,
          {
            from: network,
            value: amountWei,
            gasPrice: maxGasPrice.add(new BN(1))
          }
        ),
        "gas price too high"
      );

      // trade success with max gas price
      await reserveInst.trade(ethAddress, amountWei, tokenAdd[tokenInd],
        user1, conversionRate, true,
        {
          from: network,
          value: amountWei,
          gasPrice: maxGasPrice
        }
      )

      // set new lower max gas price
      let newMaxGasPrice = maxGasPrice.sub(new BN(1));
      await reserveInst.setMaxGasPrice(newMaxGasPrice, {from: operator});

      // trade revert with previous max gas price
      await expectRevert(
        reserveInst.trade(ethAddress, amountWei, tokenAdd[tokenInd],
          user1, conversionRate, true,
          {
            from: network,
            value: amountWei,
            gasPrice: maxGasPrice
          }
        ),
        "gas price too high"
      );
      await reserveInst.setMaxGasPrice(maxGasPrice, {from: operator});
    });

    it("Test revert conversion rate 0", async() => {
      let tokenInd = 3;
      let amountWei = new BN(100);

      await expectRevert(
        reserveInst.trade(ethAddress, amountWei, tokenAdd[tokenInd],
          user1, 0, true,
          {
            from: network,
            value: amountWei,
          }
        ),
        "rate is 0"
      );
    });

    it("Test revert wrong msg value for eth -> token trade", async() => {
      let tokenInd = 3;
      let amountWei = new BN(100);
      let conversionRate = precisionUnits; // assume rate = 1:1

      await expectRevert(
        reserveInst.trade(ethAddress, amountWei, tokenAdd[tokenInd],
          user1, conversionRate, true,
          {
            from: network,
            value: amountWei.add(new BN(1)),
          }
        ),
        "wrong msg value"
      );

      await expectRevert(
        reserveInst.trade(ethAddress, amountWei, tokenAdd[tokenInd],
          user1, conversionRate, true,
          {
            from: network,
            value: amountWei.sub(new BN(1)),
          }
        ),
        "wrong msg value"
      );
    });

    it("Test revert bad msg value for token -> eth trade", async() => {
      let tokenInd = 3;
      let amountTwei = new BN(1000);
      let conversionRate = precisionUnits; // assume rate = 1:1

      await expectRevert(
        reserveInst.trade(tokenAdd[tokenInd], amountTwei, ethAddress,
          user1, conversionRate, true,
          {
            from: network,
            value: new BN(1)
          }
        ),
        "bad msg value"
      );
    });

    it("Test revert not enough balance", async() => {
      let tokenInd = 3;
      let amountTwei = new BN(1000);
      let conversionRate = precisionUnits; // assume rate = 1:1

      let balance = await tokens[tokenInd].balanceOf(network);
      if (balance.gt(zeroBN)) {
        // collect tokens from network
        await tokens[tokenInd].transfer(accounts[0], balance, {from: network});
      }
      // make enough allowance
      await tokens[tokenInd].approve(reserveInst.address, amountTwei, {from: network});

      await expectRevert.unspecified(
        reserveInst.trade(tokenAdd[tokenInd], amountTwei, ethAddress,
          user1, conversionRate, true,
          {
            from: network,
            value: 0
          }
        )
      );
      await tokens[tokenInd].approve(reserveInst.address, 0, {from: network});

      // not enough eth, need to use try/catch here
      balance = await Helper.getBalancePromise(network);
      try {
        await reserveInst.trade(ethAddress, balance, tokenAdd[tokenInd],
          user1, conversionRate, true,
          {
            from: network,
            value: balance.add(new BN(1))
          }
        );
        assert(false, "expected revert in line above");
      } catch (e) { }
    });

    it("Test revert not enough allowance", async() => {
      let tokenInd = 3;
      let amountTwei = new BN(1000);
      let conversionRate = precisionUnits; // assume rate = 1:1

      // transfer enough src token
      await tokens[tokenInd].transfer(network, amountTwei);
      // make not enough allowance
      await tokens[tokenInd].approve(reserveInst.address, 0, {from: network});
      await tokens[tokenInd].approve(reserveInst.address, amountTwei.sub(new BN(1)), {from: network});

      await expectRevert.unspecified(
        reserveInst.trade(tokenAdd[tokenInd], amountTwei, ethAddress,
          user1, conversionRate, true,
          {
            from: network,
            value: 0
          }
        )
      );
      await tokens[tokenInd].approve(reserveInst.address, 0, {from: network});
    });

    it("Test revert dest amount is 0", async() => {
      let tokenInd = 3;
      let amountTwei = new BN(1);
      let conversionRate = new BN(100000);

      await expectRevert(
        reserveInst.trade(tokenAdd[tokenInd], amountTwei, ethAddress,
          user1, conversionRate, false,
          {
            from: network,
            value: 0
          }
        ),
        "dest amount is 0"
      );
    });

    it("Test revert conversion rate reverts in getRate", async() => {
      let tokenInd = 3;
      let amount = new BN(100);
      let e2tRate = await reserveInst.getConversionRate(ethAddress, tokenAdd[tokenInd], amount, currentBlock);
      Helper.assertGreater(e2tRate, 0);
      let t2eRate = await reserveInst.getConversionRate(tokenAdd[tokenInd], ethAddress, amount, currentBlock);
      Helper.assertGreater(t2eRate, 0);

      // set conversion rate to a normal address
      await reserveInst.setConversionRate(accounts[0], {from: admin});

      // test e2t trade
      await expectRevert.unspecified(
        reserveInst.trade(ethAddress, amount, tokenAdd[tokenInd],
          user1, e2tRate, false,
          {
            from: network,
            value: amount
          }
        )
      );

      // test t2e trade
      // transfer enough src token
      await transferTokenForT2ETest(tokens[tokenInd], amount);

      // set to random contract
      let contract = await NoPayableFallback.new();
      await reserveInst.setConversionRate(contract.address, {from: admin});

      await expectRevert.unspecified(
        reserveInst.trade(tokenAdd[tokenInd], amount, ethAddress,
          user1, t2eRate, false,
          {
            from: network,
            value: 0
          }
        )
      );

      await tokens[tokenInd].transfer(accounts[0], amount, {from: network});
      await tokens[tokenInd].approve(reserveInst.address, 0, {from: network});

      await reserveInst.setConversionRate(convRatesInst.address, {from: admin});
    });

    it("Test revert rate is higher than conversionRate's rate", async() => {
      let tokenInd = 3;
      let amount = new BN(100);
      let e2tRate = await reserveInst.getConversionRate(ethAddress, tokenAdd[tokenInd], amount, currentBlock);
      Helper.assertGreater(e2tRate, 0);
      let t2eRate = await reserveInst.getConversionRate(tokenAdd[tokenInd], ethAddress, amount, currentBlock);
      Helper.assertGreater(t2eRate, 0);

      // test e2t trade
      await expectRevert(
        reserveInst.trade(ethAddress, amount, tokenAdd[tokenInd],
          user1, e2tRate.add(new BN(1)), false,
          {
            from: network,
            value: amount
          }
        ),
        "reserve rate lower then network requested rate"
      );

      // test t2e trade
      await expectRevert.unspecified(
        reserveInst.trade(tokenAdd[tokenInd], amount, ethAddress,
          user1, t2eRate.add(new BN(1)), false,
          {
            from: network,
            value: 0
          }
        ),
        "reserve rate lower then network requested rate"
      );
    });

    it("Test revert when sanityRate reverts", async() => {
      let tokenInd = 3;
      let amount = new BN(100);
      let e2tRate = await reserveInst.getConversionRate(ethAddress, tokenAdd[tokenInd], amount, currentBlock);
      Helper.assertGreater(e2tRate, 0);

      let contract = await NoPayableFallback.new();
      await reserveInst.setSanityRate(contract.address, {from: admin});

      // test e2t trade reverted
      await expectRevert.unspecified(
        reserveInst.trade(ethAddress, amount, tokenAdd[tokenInd],
          user1, e2tRate, false,
          {
            from: network,
            value: amount
          }
        )
      );

      await reserveInst.setSanityRate(zeroAddress, {from: admin});
    });

    it("Test revert rate is higher than sanity rate", async() => {
      let tokenInd = 3;
      let amount = new BN(100);
      let e2tRate = await reserveInst.getConversionRate(ethAddress, tokenAdd[tokenInd], amount, currentBlock);
      Helper.assertGreater(e2tRate, 0);

      let sanityRate = await MockSanityRates.new();
      await reserveInst.setSanityRate(sanityRate.address, {from: admin});

      await sanityRate.setSanityRateValue(e2tRate.sub(new BN(1)));

      // test e2t trade reverted
      await expectRevert(
        reserveInst.trade(ethAddress, amount, tokenAdd[tokenInd],
          user1, e2tRate, false,
          {
            from: network,
            value: amount
          }
        ),
        "rate should not be greater than sanity rate"
      );

      // set lower sanity rate
      await sanityRate.setSanityRateValue(e2tRate);
      // verify trade is successful
      await reserveInst.trade(ethAddress, amount, tokenAdd[tokenInd],
        user1, e2tRate, false,
        {
          from: network,
          value: amount
        }
      )

      await reserveInst.setSanityRate(zeroAddress, {from: admin});
    });
  });

  describe("#Test constructor", async() => {
    before("setup conversion rate", async() => {
      await setupMockConversionRatesContract(false);
    });

    it("Test revert network 0", async() => {
      await expectRevert(
        Reserve.new(zeroAddress, convRatesInst.address, weth.address, 0, true, admin),
        "kyberNetwork 0"
      )
    });

    it("Test revert conversion rate 0", async() => {
      await expectRevert(
        Reserve.new(network, zeroAddress, weth.address, 0, true, admin),
        "ratesContract 0"
      )
    });

    it("Test revert weth 0", async() => {
      await expectRevert(
        Reserve.new(network, convRatesInst.address, zeroAddress, 0, true, admin),
        "weth 0"
      )
    });

    it("Test revert admin 0", async() => {
      await expectRevert(
        Reserve.new(network, convRatesInst.address, weth.address, 0, true, zeroAddress),
        "admin 0"
      )
    });

    it("Test correct data set", async() => {
      let reserve = await Reserve.new(
        network,
        convRatesInst.address,
        weth.address,
        maxGasPrice,
        true,
        admin
      );
      Helper.assertEqual(await reserve.kyberNetwork(), network);
      Helper.assertEqual(await reserve.conversionRatesContract(), convRatesInst.address);
      Helper.assertEqual(await reserve.sanityRatesContract(), zeroAddress);
      Helper.assertEqual(await reserve.weth(), weth.address);
      Helper.assertEqual(await reserve.maxGasPriceWei(), maxGasPrice);
      Helper.assertEqual(await reserve.tradeEnabled(), true);
      Helper.assertEqual(await reserve.doRateValidation(), true);
      Helper.assertEqual(await reserve.admin(), admin);
    });
  });

  describe("#Test enable/disable trade", async() => {
    let reserve;
    before("setup reserve", async() => {
      await setupMockConversionRatesContract(false);
      reserve = await Reserve.new(
        network,
        convRatesInst.address,
        weth.address,
        maxGasPrice,
        false,
        admin
      );
      await reserve.addAlerter(alerter, {from: admin});
    });

    it("Test revert: enable trade, not admin", async() => {
      await expectRevert(
        reserve.enableTrade({from: alerter}),
        "only admin"
      )
    });

    it("Test enable trade correct event and data", async() => {
      let result = await reserve.enableTrade({from: admin});
      await expectEvent(result, "TradeEnabled", {
        enable: true
      })
      Helper.assertEqual(await reserve.tradeEnabled(), true);
      // enable again
      result = await reserve.enableTrade({from: admin});
      await expectEvent(result, "TradeEnabled", {
        enable: true
      })
      Helper.assertEqual(await reserve.tradeEnabled(), true);
      // disable and reenable
      await reserve.disableTrade({from: alerter});
      Helper.assertEqual(await reserve.tradeEnabled(), false);
      result = await reserve.enableTrade({from: admin});
      await expectEvent(result, "TradeEnabled", {
        enable: true
      })
      Helper.assertEqual(await reserve.tradeEnabled(), true);
    });

    it("Test revert: disable trade, not alerter", async() => {
      await expectRevert(
        reserve.disableTrade({from: admin}),
        "only alerter"
      )
    });

    it("Test disable trade correct event and data", async() => {
      let result = await reserve.disableTrade({from: alerter});
      await expectEvent(result, "TradeEnabled", {
        enable: false
      })
      Helper.assertEqual(await reserve.tradeEnabled(), false);
      // enable again
      result = await reserve.disableTrade({from: alerter});
      await expectEvent(result, "TradeEnabled", {
        enable: false
      })
      Helper.assertEqual(await reserve.tradeEnabled(), false);
      // disable and reenable
      await reserve.enableTrade({from: admin});
      Helper.assertEqual(await reserve.tradeEnabled(), true);
      result = await reserve.disableTrade({from: alerter});
      await expectEvent(result, "TradeEnabled", {
        enable: false
      })
      Helper.assertEqual(await reserve.tradeEnabled(), false);
    });
  });

  describe("#Test max gas price", async() => {
    before("setup reserve", async() => {
      await setupMockConversionRatesContract(false);
      reserve = await Reserve.new(
        network,
        convRatesInst.address,
        weth.address,
        maxGasPrice,
        true,
        admin
      );
      await reserve.addAlerter(alerter, {from: admin});
      await reserve.addOperator(operator, {from: admin});
    });

    it("Test revert set max gas price sender not operator", async() => {
      let newMaxGasWei = new BN(10 * 1000000000);
      await expectRevert(
        reserve.setMaxGasPrice(newMaxGasWei, {from: alerter}),
        "only operator"
      )
      await expectRevert(
        reserve.setMaxGasPrice(newMaxGasWei, {from: admin}),
        "only operator"
      )
      await reserve.setMaxGasPrice(newMaxGasWei, {from: operator});
      await reserve.setMaxGasPrice(maxGasPrice, {from: operator});
    });

    it("Test set max gas price event", async() => {
      let newMaxGasWei = new BN(10 * 1000000000);
      let tx = await reserve.setMaxGasPrice(newMaxGasWei, {from: operator});
      expectEvent(tx, "MaxGasPriceUpdated", {
        newMaxGasPrice: newMaxGasWei
      })
      tx = await reserve.setMaxGasPrice(maxGasPrice, {from: operator});
      expectEvent(tx, "MaxGasPriceUpdated", {
        newMaxGasPrice: maxGasPrice
      });
      // set the same value, still got event
      tx = await reserve.setMaxGasPrice(maxGasPrice, {from: operator});
      expectEvent(tx, "MaxGasPriceUpdated", {
        newMaxGasPrice: maxGasPrice
      })
    });

    it("Test max gas price after updated successfully", async() => {
      let newMaxGasWei = new BN(10 * 1000000000);
      await reserve.setMaxGasPrice(newMaxGasWei, {from: operator});
      Helper.assertEqual(newMaxGasWei, await reserve.maxGasPriceWei());
      await reserve.setMaxGasPrice(maxGasPrice, {from: operator});
      Helper.assertEqual(maxGasPrice, await reserve.maxGasPriceWei());
    });
  });

  describe("#Test set doRateValidation", async() => {
    before("setup reserve", async() => {
      await setupMockConversionRatesContract(false);
      reserve = await Reserve.new(
        network,
        convRatesInst.address,
        weth.address,
        maxGasPrice,
        true,
        admin
      );
      await reserve.addAlerter(alerter, {from: admin});
      await reserve.addOperator(operator, {from: admin});
    });

    it("Test revert set doRateValidation sender not admin", async() => {
      await expectRevert(
        reserve.setDoRateValidation(false, {from: alerter}),
        "only admin"
      )
      await expectRevert(
        reserve.setDoRateValidation(false, {from: operator}),
        "only admin"
      )
      await reserve.setDoRateValidation(false, {from: admin});
      await reserve.setDoRateValidation(true, {from: admin});
    });

    it("Test set doRateValidation event", async() => {
      let tx = await reserve.setDoRateValidation(false, {from: admin});
      expectEvent(tx, "DoRateValidationUpdated", {
        doRateValidation: false
      })
      tx = await reserve.setDoRateValidation(true, {from: admin});
      expectEvent(tx, "DoRateValidationUpdated", {
        doRateValidation: true
      });
      // set the same value, still got event
      tx = await reserve.setDoRateValidation(true, {from: admin});
      expectEvent(tx, "DoRateValidationUpdated", {
        doRateValidation: true
      })
    });

    it("Test doRateValidation value after updated successfully", async() => {
      await reserve.setDoRateValidation(false, {from: admin});
      Helper.assertEqual(false, await reserve.doRateValidation());
      await reserve.setDoRateValidation(true, {from: admin});
      Helper.assertEqual(true, await reserve.doRateValidation());
    });
  });

  describe("#Test trades with doRateValidaiton is disabled", async() => {
    before("set up contracts", async() => {
      //init conversion rate
      await setupMockConversionRatesContract(true);
      //init reserve
      await generalSetupReserveContract(false, false);
      // disable do rate validation
      await reserveInst.setDoRateValidation(false, {from: admin});
    });

    after("collect funds", async() => {
      await collectFundsAfterTests(reserveInst.address);
    });

    it("Test trade is successful when conversionRate's getRate returns lower rate", async() => {
      let tokenInd = 3;
      let amount = new BN(100);
      let e2tRate = await reserveInst.getConversionRate(ethAddress, tokenAdd[tokenInd], amount, currentBlock);
      Helper.assertGreater(e2tRate, 0);
      let t2eRate = await reserveInst.getConversionRate(tokenAdd[tokenInd], ethAddress, amount, currentBlock);
      Helper.assertGreater(t2eRate, 0);

      // set conversion rate to a normal address
      await convRatesInst.setBaseRates(tokenAdd[tokenInd], 0, 0);

      await Helper.assertEqual(
        0,
        await reserveInst.getConversionRate(ethAddress, tokenAdd[tokenInd], amount, currentBlock),
        "rate should be 0 now"
      )

      // test e2t trade
      await reserveInst.trade(ethAddress, amount, tokenAdd[tokenInd],
        user1, e2tRate, false,
        {
          from: network,
          value: amount
        }
      )

      // test t2e trade
      await Helper.assertEqual(
        0,
        await reserveInst.getConversionRate(tokenAdd[tokenInd], ethAddress, amount, currentBlock),
        "rate should be 0 now"
      )
      await transferTokenForT2ETest(tokens[tokenInd], amount);

      await reserveInst.trade(tokenAdd[tokenInd], amount, ethAddress,
        user1, t2eRate, false,
        {
          from: network,
          value: 0
        }
      )

      await convRatesInst.setBaseRates(tokenAdd[tokenInd], e2tRate, t2eRate);
    });

    it("Test trade is successful when sanityRate reverts", async() => {
      let tokenInd = 3;
      let amount = new BN(100);
      let e2tRate = await reserveInst.getConversionRate(ethAddress, tokenAdd[tokenInd], amount, currentBlock);
      Helper.assertGreater(e2tRate, 0);

      let contract = await NoPayableFallback.new();
      await reserveInst.setSanityRate(contract.address, {from: admin});

      // getConversionRate should revert
      await expectRevert.unspecified(
        reserveInst.getConversionRate(ethAddress, tokenAdd[tokenInd], amount, currentBlock)
      )

      await reserveInst.trade(ethAddress, amount, tokenAdd[tokenInd],
        user1, e2tRate, false,
        {
          from: network,
          value: amount
        }
      )

      await reserveInst.setSanityRate(zeroAddress, {from: admin});
    });

    it("Test trade is successful when revert rate is higher than sanity rate", async() => {
      let tokenInd = 3;
      let amount = new BN(100);
      let e2tRate = await reserveInst.getConversionRate(ethAddress, tokenAdd[tokenInd], amount, currentBlock);
      Helper.assertGreater(e2tRate, 0);

      let sanityRate = await MockSanityRates.new();
      await reserveInst.setSanityRate(sanityRate.address, {from: admin});

      await sanityRate.setSanityRateValue(e2tRate.sub(new BN(1)));

      await Helper.assertEqual(
        0,
        await reserveInst.getConversionRate(ethAddress, tokenAdd[tokenInd], amount, currentBlock),
        "rate should be 0 now"
      )

      await reserveInst.trade(ethAddress, amount, tokenAdd[tokenInd],
        user1, e2tRate, false,
        {
          from: network,
          value: amount
        }
      )

      // set lower sanity rate
      await sanityRate.setSanityRateValue(e2tRate);
      // verify trade is successful
      await reserveInst.trade(ethAddress, amount, tokenAdd[tokenInd],
        user1, e2tRate, false,
        {
          from: network,
          value: amount
        }
      )

      await reserveInst.setSanityRate(zeroAddress, {from: admin});
    });
  });

  describe("#Test set token wallet", async() => {
    before("setup reserve", async() => {
      await setupMockConversionRatesContract(false);
      reserve = await Reserve.new(
        network,
        convRatesInst.address,
        weth.address,
        maxGasPrice,
        true,
        admin
      );
      await reserve.addAlerter(alerter, {from: admin});
      await reserve.addOperator(operator, {from: admin});
    });

    it("Test set token wallet reverts not admin", async() => {
      let tokenAddresses = [ethAddress, weth.address, tokenAdd[1], tokenAdd[2]];
      for(let i = 0; i < tokenAddresses.length; i++) {
        await expectRevert(
          reserve.setTokenWallet(tokenAddresses[i], withdrawAddress, {from: operator}),
          "only admin"
        );

      }
    });

    it("Test set token wallet successful, data changes, event emits", async() => {
      let tokenAddresses = [ethAddress, weth.address, tokenAdd[1], tokenAdd[2]];
      let wallets = [withdrawAddress, reserve.address, zeroAddress];
      for(let i = 0; i < tokenAddresses.length; i++) {
        for(let j = 0; j < wallets.length; j++) {
          let tx = await reserve.setTokenWallet(tokenAddresses[i], wallets[j], {from: admin});
          expectEvent(tx, "NewTokenWallet", {
            token: tokenAddresses[i],
            wallet: wallets[j]
          });
          Helper.assertEqual(
            wallets[j],
            await reserve.tokenWallet(tokenAddresses[i]),
            "wrong token wallet set"
          )
        }
      }
    });
  });

  describe("#Test set contracts", async() => {
    before("setup reserve", async() => {
      await setupMockConversionRatesContract(false);
      reserve = await Reserve.new(
        network,
        convRatesInst.address,
        weth.address,
        maxGasPrice,
        true,
        admin
      );
      await reserve.addAlerter(alerter, {from: admin});
      await reserve.addOperator(operator, {from: admin});
    });

    it("Test set contract functions revert not admin", async() => {
      await expectRevert(
        reserve.setKyberNetwork(network, {from: operator}),
        "only admin"
      )
      await expectRevert(
        reserve.setConversionRate(convRatesInst.address, {from: operator}),
        "only admin"
      )
      await expectRevert(
        reserve.setWeth(weth.address, {from: operator}),
        "only admin"
      )
      await expectRevert(
        reserve.setSanityRate(zeroAddress, {from: operator}),
        "only admin"
      )
    });

    it("Test set contract functions revert params are invalid", async() => {
      await expectRevert(
        reserve.setKyberNetwork(zeroAddress),
        "kyberNetwork 0"
      );
      await expectRevert(
        reserve.setConversionRate(zeroAddress, {from: admin}),
        "conversionRates 0"
      );
      await expectRevert(
        reserve.setWeth(zeroAddress, {from: admin}),
        "weth 0"
      );
      // can set with sanity rate zero
      await reserve.setSanityRate(zeroAddress, {from: admin});
    });

    it("Test set kyberNetwork successful, data changes, event emits", async() => {
      let tx = await reserve.setKyberNetwork(network, {from: admin});
      expectEvent(tx, "SetKyberNetworkAddress", {
        network: network,
      });
      Helper.assertEqual(network, await reserve.kyberNetwork());
      tx = await reserve.setKyberNetwork(accounts[0], {from: admin});
      expectEvent(tx, "SetKyberNetworkAddress", {
        network: accounts[0],
      });
      Helper.assertEqual(accounts[0], await reserve.kyberNetwork());
      await reserve.setKyberNetwork(network, {from: admin});
    });

    it("Test set conversion rate successful, data changes, event emits", async() => {
      let tx = await reserve.setConversionRate(convRatesInst.address, {from: admin});
      expectEvent(tx, "SetConversionRateAddress", {
        rate: convRatesInst.address,
      });
      Helper.assertEqual(convRatesInst.address, await reserve.conversionRatesContract());
      tx = await reserve.setConversionRate(accounts[0], {from: admin});
      expectEvent(tx, "SetConversionRateAddress", {
        rate: accounts[0],
      });
      Helper.assertEqual(accounts[0], await reserve.conversionRatesContract());
      await reserve.setConversionRate(convRatesInst.address, {from: admin});
    });

    it("Test set weth successful, data changes, event emits", async() => {
      let tx = await reserve.setWeth(weth.address, {from: admin});
      expectEvent(tx, "SetWethAddress", {
        weth: weth.address,
      });
      Helper.assertEqual(weth.address, await reserve.weth());
      tx = await reserve.setWeth(accounts[0], {from: admin});
      expectEvent(tx, "SetWethAddress", {
        weth: accounts[0],
      });
      Helper.assertEqual(accounts[0], await reserve.weth());
      await reserve.setWeth(weth.address, {from: admin});
    });

    it("Test set sanity rate successful, data changes, event emits", async() => {
      let tx = await reserve.setSanityRate(zeroAddress, {from: admin});
      expectEvent(tx, "SetSanityRateAddress", {
        sanity: zeroAddress,
      });
      Helper.assertEqual(zeroAddress, await reserve.sanityRatesContract());
      tx = await reserve.setSanityRate(accounts[0], {from: admin});
      expectEvent(tx, "SetSanityRateAddress", {
        sanity: accounts[0],
      });
      Helper.assertEqual(accounts[0], await reserve.sanityRatesContract());
      await reserve.setSanityRate(zeroAddress, {from: admin});
    });
  });

  describe("#Test getBalance & getDestQty", async() => {
    before("setup reserve", async() => {
      await setupMockConversionRatesContract(false);
      reserve = await Reserve.new(
        network,
        convRatesInst.address,
        weth.address,
        maxGasPrice,
        true,
        admin
      );
      await reserve.addAlerter(alerter, {from: admin});
      await reserve.addOperator(operator, {from: admin});
    });

    it("Test getBalance eth when using eth", async() => {
      let addresses = [zeroAddress, reserve.address];
      let reserveBalance = new BN(0);
      await reserve.approveWithdrawAddress(ethAddress, withdrawAddress, {from: admin});
      for(let i = 0; i < addresses.length; i++) {
        await reserve.setTokenWallet(weth.address, addresses[i], {from: admin});
        let amount = new BN(Helper.getRandomInt(10, 100));
        await Helper.sendEtherWithPromise(accounts[0], reserve.address, amount);
        reserveBalance = reserveBalance.add(amount);
        Helper.assertEqual(
          reserveBalance,
          await reserve.getBalance(ethAddress),
          "eth balance is wrong"
        );
        // withdraw and check balance
        amount = new BN(Helper.getRandomInt(1, 10));
        await reserve.withdraw(ethAddress, amount, withdrawAddress, {from: operator});
        reserveBalance = reserveBalance.sub(amount);
        Helper.assertEqual(
          reserveBalance,
          await reserve.getBalance(ethAddress),
          "eth balance is wrong"
        );
      }
    });

    it("Test getBalance eth when using weth", async() => {
      await reserve.setTokenWallet(weth.address, walletForToken, {from: admin});
      // send some eth to reserve, shouldn't affect result of getBalance
      await Helper.sendEtherWithPromise(accounts[0], reserve.address, new BN(1000));
      // reset allowance, check get balance is 0
      await weth.approve(reserve.address, 0, {from: walletForToken});
      await weth.deposit({from: walletForToken, value: new BN(10)});
      Helper.assertEqual(0, await reserve.getBalance(ethAddress));

      // approve less than balance
      await weth.approve(reserve.address, new BN(2), {from: walletForToken});
      Helper.assertEqual(new BN(2), await reserve.getBalance(ethAddress));

      // approve more than balance
      await weth.approve(reserve.address, 0, {from: walletForToken});
      await weth.approve(reserve.address, MAX_ALLOWANCE, {from: walletForToken});

      Helper.assertEqual(
        await weth.balanceOf(walletForToken),
        await reserve.getBalance(ethAddress)
      );
    });

    it("Test getBalance token when token is in reserve", async() => {
      let tokenInd = 1;
      let addresses = [zeroAddress, reserve.address];
      let reserveTokenBalance = new BN(0);
      await reserve.approveWithdrawAddress(tokenAdd[tokenInd], withdrawAddress, {from: admin});
      for(let i = 0; i < addresses.length; i++) {
        await reserve.setTokenWallet(tokenAdd[tokenInd], addresses[i], {from: admin});
        let amount = new BN(Helper.getRandomInt(10, 100));
        await tokens[tokenInd].transfer(reserve.address, amount);
        reserveTokenBalance = reserveTokenBalance.add(amount);
        Helper.assertEqual(
          reserveTokenBalance,
          await reserve.getBalance(tokenAdd[tokenInd]),
          "token balance is wrong"
        );
        // withdraw and check balance
        amount = new BN(Helper.getRandomInt(1, 10));
        await reserve.withdraw(tokenAdd[tokenInd], amount, withdrawAddress, {from: operator});
        reserveTokenBalance = reserveTokenBalance.sub(amount);
        Helper.assertEqual(
          reserveTokenBalance,
          await reserve.getBalance(tokenAdd[tokenInd]),
          "token balance is wrong"
        );
      }
    });

    it("Test getBalance when token is in walletForToken", async() => {
      let tokenInd = 1;
      let token = tokens[tokenInd];
      await reserve.setTokenWallet(tokenAdd[tokenInd], walletForToken, {from: admin});
      // transfer some token to reserve, shouldn't affect result
      await token.transfer(reserve.address, new BN(100));

      // reset allowance, check get balance is 0
      await token.approve(reserve.address, 0, {from: walletForToken});
      await token.transfer(walletForToken, new BN(10));
      Helper.assertEqual(0, await reserve.getBalance(tokenAdd[tokenInd]));

      // approve less than balance
      await token.approve(reserve.address, new BN(2), {from: walletForToken});
      Helper.assertEqual(new BN(2), await reserve.getBalance(tokenAdd[tokenInd]));

      // approve more than balance
      await token.approve(reserve.address, 0, {from: walletForToken});
      await token.approve(reserve.address, MAX_ALLOWANCE, {from: walletForToken});

      Helper.assertEqual(
        await token.balanceOf(walletForToken),
        await reserve.getBalance(tokenAdd[tokenInd])
      );

      // deposit more token to reserve, get balance shouldn't affect
      await token.transfer(reserve.address, new BN(100));
      Helper.assertEqual(
        await token.balanceOf(walletForToken),
        await reserve.getBalance(tokenAdd[tokenInd])
      );
    });
  });

  describe("#Test getTokenWallet", async() => {
    before("setup reserve", async() => {
      await setupMockConversionRatesContract(false);
      reserve = await Reserve.new(
        network,
        convRatesInst.address,
        weth.address,
        maxGasPrice,
        true,
        admin
      );
      await reserve.addAlerter(alerter, {from: admin});
      await reserve.addOperator(operator, {from: admin});
    });

    it("Test getTokenWallet default value", async() => {
      Helper.assertEqual(reserve.address, await reserve.getTokenWallet(ethAddress));
      Helper.assertEqual(reserve.address, await reserve.getTokenWallet(weth.address));
      Helper.assertEqual(reserve.address, await reserve.getTokenWallet(tokenAdd[2]));
    });

    it("Test getTokenWallet of eth", async() => {
      Helper.assertEqual(reserve.address, await reserve.getTokenWallet(ethAddress));
      // set eth token wallet, but this data shouldn't change
      await reserve.setTokenWallet(ethAddress, walletForToken, {from: admin});
      // token wallet for eth should use weth's token wallet data
      Helper.assertEqual(reserve.address, await reserve.getTokenWallet(ethAddress));
      await reserve.setTokenWallet(weth.address, walletForToken, {from: admin});
      Helper.assertEqual(walletForToken, await reserve.getTokenWallet(ethAddress));
      // set back to 0x0
      await reserve.setTokenWallet(weth.address, zeroAddress, {from: admin});
      Helper.assertEqual(reserve.address, await reserve.getTokenWallet(ethAddress));
    });

    it("Test getTokenWallet of token", async() => {
      Helper.assertEqual(reserve.address, await reserve.getTokenWallet(weth.address));
      await reserve.setTokenWallet(weth.address, walletForToken, {from: admin});
      Helper.assertEqual(walletForToken, await reserve.getTokenWallet(weth.address));
      Helper.assertEqual(reserve.address, await reserve.getTokenWallet(tokenAdd[1]));
      await reserve.setTokenWallet(tokenAdd[1], walletForToken, {from: admin});
      Helper.assertEqual(walletForToken, await reserve.getTokenWallet(tokenAdd[1]));
    });
  });

  describe("#Test withdrawal", async() => {
    before("setup reserve", async() => {
      await setupMockConversionRatesContract(false);
      reserve = await Reserve.new(
        network,
        convRatesInst.address,
        weth.address,
        maxGasPrice,
        true,
        admin
      );
      await reserve.addAlerter(alerter, {from: admin});
      await reserve.addOperator(operator, {from: admin});
    });

    it("Test revert approve withdrawl address sender not admin", async() => {
      let tokenAddresses = [ethAddress, weth.address, tokenAdd[1], tokenAdd[3]];
      for(let i = 0; i < tokenAddresses.length; i++) {
        await expectRevert(
          reserve.approveWithdrawAddress(tokenAddresses[i], withdrawAddress, false, {from: operator}),
          "only admin"
        )
        await expectRevert(
          reserve.approveWithdrawAddress(tokenAddresses[i], withdrawAddress, true, {from: operator}),
          "only admin"
        )
      }
    });

    it("Test approve withdrawal address event", async() => {
      let tokenAddresses = [ethAddress, weth.address, tokenAdd[1], tokenAdd[3]];
      for(let i = 0; i < tokenAddresses.length; i++) {
        let tx = await reserve.approveWithdrawAddress(tokenAddresses[i], withdrawAddress, false, {from: admin});
        expectEvent(tx, "WithdrawAddressApproved", {
          token: tokenAddresses[i],
          addr: withdrawAddress,
          approve: false
        })
        tx = await reserve.approveWithdrawAddress(tokenAddresses[i], withdrawAddress, true, {from: admin});
        expectEvent(tx, "WithdrawAddressApproved", {
          token: tokenAddresses[i],
          addr: withdrawAddress,
          approve: true
        })
      }
    });

    it("Test approve withdrawal address data changes as expected", async() => {
      let tokenAddresses = [ethAddress, weth.address, tokenAdd[1], tokenAdd[3]];
      let addresses = [accounts[0], withdrawAddress, accounts[3]];
      for(let i = 0; i < tokenAddresses.length; i++) {
        for(let j = 0; j < addresses.length; j++) {
          await reserve.approveWithdrawAddress(tokenAddresses[i], addresses[j], true, {from: admin});
          let approve = await reserve.isAddressApprovedForWithdrawal(tokenAddresses[i], addresses[j]);
          Helper.assertEqual(true, approve);
          // reset approval
          await reserve.approveWithdrawAddress(tokenAddresses[i], addresses[j], false, {from: admin});
          approve = await reserve.isAddressApprovedForWithdrawal(tokenAddresses[i], addresses[j]);
          Helper.assertEqual(false, approve);
        }
      }
    });

    it("Test revert withdraw sender not operator", async() => {
      await reserve.approveWithdrawAddress(ethAddress, withdrawAddress, true, {from: admin});
      await Helper.sendEtherWithPromise(accounts[0], reserve.address, precisionUnits);
      await expectRevert(
        reserve.withdraw(ethAddress, precisionUnits, withdrawAddress, {from: admin}),
        "only operator"
      );
      // can withdraw eth with operator
      await reserve.withdraw(ethAddress, precisionUnits, withdrawAddress, {from: operator});

      // check token
      let tokenInd = 1;
      await reserve.approveWithdrawAddress(tokenAdd[tokenInd], withdrawAddress, true, {from: admin});
      let tokenAmount = tokenUnits(tokenDecimals[tokenInd]);
      await tokens[tokenInd].transfer(reserve.address, tokenAmount);
      await expectRevert(
        reserve.withdraw(tokenAdd[tokenInd], tokenAmount, withdrawAddress, {from: admin}),
        "only operator"
      );
      // can withdraw token with operator
      await reserve.withdraw(tokenAdd[tokenInd], tokenAmount, withdrawAddress, {from: operator});
    });

    it("Test revert withdraw recipient is not approved", async() => {
      await reserve.approveWithdrawAddress(ethAddress, withdrawAddress, false, {from: admin});
      await Helper.sendEtherWithPromise(accounts[0], reserve.address, precisionUnits);
      await expectRevert(
        reserve.withdraw(ethAddress, precisionUnits, withdrawAddress, {from: operator}),
        "destination is not approved"
      );
      let tokenInd = 1;
      await reserve.approveWithdrawAddress(tokenAdd[tokenInd], withdrawAddress, false, {from: admin});
      let tokenAmount = tokenUnits(tokenDecimals[tokenInd]);
      await tokens[tokenInd].transfer(reserve.address, tokenAmount);
      await expectRevert(
        reserve.withdraw(tokenAdd[tokenInd], tokenAmount, withdrawAddress, {from: operator}),
        "destination is not approved"
      );
    });

    describe("Test withdraw eth", async() => {
      before("approve withdrawl address", async() => {
        await reserve.approveWithdrawAddress(ethAddress, withdrawAddress, true, {from: admin});
        await Helper.sendEtherWithPromise(accounts[0], reserve.address, precisionUnits);
      });

      it("Test withdraw eth success, balance changes", async() => {
        let withdrawlAddressBal = await Helper.getBalancePromise(withdrawAddress);
        let reserveEthBal = await Helper.getBalancePromise(reserve.address);

        // withdraw
        await reserve.withdraw(ethAddress, precisionUnits, withdrawAddress, {from: operator});

        withdrawlAddressBal = withdrawlAddressBal.add(precisionUnits);
        reserveEthBal = reserveEthBal.sub(precisionUnits);
        Helper.assertEqual(
          withdrawlAddressBal,
          await Helper.getBalancePromise(withdrawAddress),
          "wrong eth bal for withdrawl address"
        );
        Helper.assertEqual(
          reserveEthBal,
          await Helper.getBalancePromise(reserve.address),
          "wrong eth bal for reserve"
        );
      });

      it("Test withdraw eth event", async() => {
        await Helper.sendEtherWithPromise(withdrawAddress, reserve.address, precisionUnits);
        // withdraw
        let tx = await reserve.withdraw(ethAddress, precisionUnits, withdrawAddress, {from: operator});

        expectEvent(tx, "WithdrawFunds", {
          token: ethAddress,
          amount: precisionUnits,
          destination: withdrawAddress
        });
      });

      it("Test withdraw address can not receive eth", async() => {
        let contract = await NoPayableFallback.new();
        await reserve.approveWithdrawAddress(ethAddress, contract.address, true, {from: admin});
        // transfer some eth to reserve
        await Helper.sendEtherWithPromise(accounts[0], reserve.address, precisionUnits);
        // withdraw should fail, contract doesn't allow to receive eth
        await expectRevert(
          reserve.withdraw(ethAddress, precisionUnits, contract.address, {from: operator}),
          "withdraw eth failed"
        );
        let anotherReserve = await Reserve.new(
          network,
          convRatesInst.address,
          weth.address,
          maxGasPrice,
          true,
          admin
        );
        // approve, withdraw and verify balance
        let withdrawAmount = new BN(100);
        await reserve.approveWithdrawAddress(ethAddress, anotherReserve.address, true, {from: admin});
        await reserve.withdraw(ethAddress, withdrawAmount, anotherReserve.address, {from: operator});
        Helper.assertEqual(withdrawAmount, await Helper.getBalancePromise(anotherReserve.address));
        // send all eth back to accounts
        await reserve.approveWithdrawAddress(ethAddress, accounts[0], true, {from: admin});
        reserve.withdraw(ethAddress, precisionUnits.sub(withdrawAmount), accounts[0], {from: operator});
      });

      it("Test withdraw not enough eth", async() => {
        let reserveEthBal = await Helper.getBalancePromise(reserve.address);
        await expectRevert.unspecified(
          reserve.withdraw(ethAddress, reserveEthBal.add(new BN(1)), withdrawAddress, {from: operator})
        )
      });

      it("Test set token wallet for eth, should withdraw reserve's eth", async() => {
        await reserve.setTokenWallet(ethAddress, walletForToken, {from: admin});
        let withdrawlAddressBal = await Helper.getBalancePromise(withdrawAddress);
        let reserveEthBal = await Helper.getBalancePromise(reserve.address);
        // withdraw
        await reserve.withdraw(ethAddress, precisionUnits, withdrawAddress, {from: operator});

        withdrawlAddressBal = withdrawlAddressBal.add(precisionUnits);
        reserveEthBal = reserveEthBal.sub(precisionUnits);

        Helper.assertEqual(
          withdrawlAddressBal,
          await Helper.getBalancePromise(withdrawAddress),
          "wrong eth bal for withdrawl address"
        );
        Helper.assertEqual(
          reserveEthBal,
          await Helper.getBalancePromise(reserve.address),
          "wrong eth bal for reserve"
        );
      });
    });

    describe("Test withdraw weth or token", async() => {
      before("approve withdrawl address", async() => {
        await reserve.approveWithdrawAddress(weth.address, withdrawAddress, true, {from: admin});
        for(let i = 0; i < numTokens; i++) {
          await reserve.approveWithdrawAddress(tokenAdd[i], withdrawAddress, true, {from: admin});
        }
      });

      it("Test set token wallet to 0x0 or reserve, withdraw token success, balance changes, event emits", async() => {
        let tokenWallets = [zeroAddress, reserve.address];
        let tokenList = [weth, tokens[1], tokens[3]];

        for(let i = 0; i < tokenList.length; i++) {
          for(let j = 0; j < tokenWallets.length; j++) {
            await reserve.setTokenWallet(tokenList[i].address, tokenWallets[j], {from: admin});

            let amount = new BN(10).pow(new BN(await tokenList[i].decimals()));
            // transfer token to reserve
            if (tokenList[i] == weth) {
              // need to deposit to get weth first
              await weth.deposit({value: amount});
            }
            await tokenList[i].transfer(reserve.address, amount);

            let walletBal = await tokenList[i].balanceOf(withdrawAddress);
            let reserveBal = await tokenList[i].balanceOf(reserve.address);

            let tx = await reserve.withdraw(tokenList[i].address, amount, withdrawAddress, {from: operator});
            expectEvent(tx, "WithdrawFunds", {
              token: tokenList[i].address,
              amount: amount,
              destination: withdrawAddress
            });

            walletBal = walletBal.add(amount);
            reserveBal = reserveBal.sub(amount);

            Helper.assertEqual(
              walletBal,
              await tokenList[i].balanceOf(withdrawAddress),
              "wrong token bal for withdrawl address"
            );
            Helper.assertEqual(
              reserveBal,
              await tokenList[i].balanceOf(reserve.address),
              "wrong token bal for reserve"
            );
          }
        }
      });

      it("Test set token wallet to wallet address, withdraw token success, balance changes", async() => {
        let tokenList = [weth, tokens[1], tokens[3]];
        for(let i = 0; i < tokenList.length; i++) {
          await reserve.setTokenWallet(tokenList[i].address, walletForToken, {from: admin});
          let amount = new BN(10).pow(new BN(await tokenList[i].decimals()));
          // init 1 token to wallet
          if (tokenList[i] == weth) {
            await weth.deposit({from: walletForToken, value: amount});
          } else {
            await tokenList[i].transfer(walletForToken, amount);
          }
          // approve allowance
          await tokenList[i].approve(reserve.address, amount, {from: walletForToken});

          let walletBal = await tokenList[i].balanceOf(withdrawAddress);
          let reserveBal = await tokenList[i].balanceOf(walletForToken);

          await reserve.withdraw(tokenList[i].address, amount, withdrawAddress, {from: operator});

          walletBal = walletBal.add(amount);
          reserveBal = reserveBal.sub(amount);

          Helper.assertEqual(
            walletBal,
            await tokenList[i].balanceOf(withdrawAddress),
            "wrong token bal for withdrawl address"
          );
          Helper.assertEqual(
            reserveBal,
            await tokenList[i].balanceOf(walletForToken),
            "wrong token bal for walletForToken"
          );
        }
      });

      it("Test withdraw should revert, not enough balance or allowance", async() => {
        let tokenList = [weth, tokens[1], tokens[3]];
        for(let i = 0; i < tokenList.length; i++) {
          // amount of token to deposit to reserve
          // test 2 scenarios: no token in reserve, or have enough token in reserve
          let tokenAmount = tokenUnits(await tokenList[i].decimals());
          let depositedAmounts = [zeroBN, tokenAmount];
          let withdrawalAmount = tokenAmount;
          await reserve.setTokenWallet(tokenList[i].address, walletForToken, {from: admin});

          for(let i = 0; i < depositedAmounts.length; i++) {
            // transfer token to reserve if needed
            if (depositedAmounts[i].gt(zeroBN)) {
              if (tokenList[i] == weth) {
                // need to get some weth first
                await weth.deposit({value: depositedAmounts[i]});
              }
              // transfer token to reserve
              await tokenList[i].transfer(reserve.address, depositedAmounts[i]);
            }

            // make sure not enough allowance
            await tokenList[i].approve(reserve.address, 0, {from: walletForToken});
            await tokenList[i].approve(reserve.address, withdrawalAmount.sub(new BN(1)), {from: walletForToken});

            // deposit enough token to walletForToken
            if (tokenList[i] == weth) {
              await weth.deposit({value: withdrawalAmount, from: walletForToken});
            } else {
              await tokenList[i].transfer(walletForToken, withdrawalAmount);
            }

            // withdraw should revert, not enough allowance
            await expectRevert.unspecified(
              reserve.withdraw(tokenList[i].address, withdrawalAmount, withdrawAddress, {from: operator})
            );

            // make sure enough allowance
            await tokenList[i].approve(reserve.address, 0, {from: walletForToken});
            await tokenList[i].approve(reserve.address, withdrawalAmount, {from: walletForToken});

            // withdraw token to make sure not enough balance
            let tokenBalance = await tokenList[i].balanceOf(walletForToken);
            // leave only (withdrawalAmount - 1) token in wallet
            let remainTokenAmount = withdrawalAmount.sub(new BN(1));
            if (tokenBalance.gt(remainTokenAmount)) {
              if (tokenList[i] == weth) {
                // withdraw weth
                await weth.withdraw(tokenBalance.sub(remainTokenAmount), {from: walletForToken});
              } else {
                await tokenList[i].transfer(accounts[0], tokenBalance.sub(remainTokenAmount), {from: walletForToken});
              }
            }
            // withdraw should revert, enough allowance but not enough balance
            await expectRevert.unspecified(
              reserve.withdraw(tokenList[i].address, withdrawalAmount, withdrawAddress, {from: operator})
            );
          }
        }
      });
    });
  });

  describe("#Test gas consumption, enhanced conversion rate", async() => {
    const setupEnhancedConversionRatesContractWithSteps = async function() {
      let setupData = await reserveSetup.setupEnhancedConversionRate(tokens, admin, operator, alerter, true);
      convRatesInst = setupData.convRatesInst;
      baseBuyRate = setupData.baseBuyRate;
      compactBuyArr = setupData.compactBuyArr;
      baseSellRate = setupData.baseSellRate;
      compactSellArr = setupData.compactSellArr;
      imbalanceBuyStepX = setupData.imbalanceBuyStepX;
      imbalanceBuyStepY = setupData.imbalanceBuyStepY;
      imbalanceSellStepX = setupData.imbalanceSellStepX;
      imbalanceSellStepY = setupData.imbalanceSellStepY;
      minimalRecordResolution = setupData.minimalRecordResolution;
    }

    const tradeAndVerifyDataWithSteps = async function(
      reserveInst, isBuy, tokenInd,
      srcAmount, recipient, isValidate
    ) {
      let srcAddress = isBuy ? ethAddress : tokenAdd[tokenInd];
      let destAddress = isBuy ? tokenAdd[tokenInd] : ethAddress;
      let conversionRate = await reserveInst.getConversionRate(srcAddress, destAddress, srcAmount, currentBlock);
      let expectedRate;
      let numberSteps;
      if (isBuy) {
        expectedRate = baseBuyRate[tokenInd];
        let extraBps = compactBuyArr[tokenInd] * 10;
        expectedRate = Helper.addBps(expectedRate, extraBps);
        let destQty = Helper.calcDstQty(srcAmount, ethDecimals, tokenDecimals[tokenInd], expectedRate);
        let data = reserveSetup.getExtraBpsForImbalanceBuyV2(
          reserveTokenImbalance[tokenInd].toNumber(),
          destQty.toNumber(),
          imbalanceBuyStepX,
          imbalanceBuyStepY
        );
        extraBps = data.bps;
        numberSteps = data.steps;
        expectedRate = Helper.addBps(expectedRate, extraBps);
      } else {
        expectedRate = baseSellRate[tokenInd];
        let extraBps = compactSellArr[tokenInd] * 10;
        expectedRate = Helper.addBps(expectedRate, extraBps);
        let data = reserveSetup.getExtraBpsForImbalanceSellV2(
          reserveTokenImbalance[tokenInd].toNumber(),
          srcAmount.toNumber(),
          imbalanceSellStepX,
          imbalanceSellStepY
        );
        extraBps = data.bps;
        numberSteps = data.steps;
        expectedRate = Helper.addBps(expectedRate, extraBps);
      }

      // check correct rate calculated
      Helper.assertEqual(conversionRate, expectedRate, "unexpected rate.");

      //perform trade
      let tx = await reserveInst.trade(
        srcAddress, srcAmount, destAddress, recipient, conversionRate, isValidate,
        {
          from: network,
          value: isBuy ? srcAmount : 0
        }
      );
      let expectedDestAmount;
      if (isBuy) {
        expectedDestAmount = Helper.calcDstQty(srcAmount, ethDecimals, tokenDecimals[tokenInd], conversionRate);
      } else {
        expectedDestAmount = Helper.calcDstQty(srcAmount, tokenDecimals[tokenInd], ethDecimals, conversionRate);
      }
      // update balance and imbalance
      if (isBuy) {
        // update reserve eth or weth balance
        if (!isUsingWeth) {
          // eth is transferred to reserve
          expectedReserveBalanceWei = expectedReserveBalanceWei.add(srcAmount);
        } else {
          // weth is transferred to weth token wallet
          expectedReserveBalanceWeth = expectedReserveBalanceWeth.add(srcAmount);
        }
        // update token balance
        reserveTokenBalance[tokenInd] = reserveTokenBalance[tokenInd].sub(expectedDestAmount);
        // if amount is 11, resolution is 2, it will record 5, and later multiple back with 2
        let imbalance = expectedDestAmount.div(minimalRecordResolution).mul(minimalRecordResolution);
        reserveTokenImbalance[tokenInd] = reserveTokenImbalance[tokenInd].add(imbalance);
      } else {
        // reserve has received token
        reserveTokenBalance[tokenInd] = reserveTokenBalance[tokenInd].add(srcAmount);
        if (!isUsingWeth) {
          // reserve transfered back eth
          expectedReserveBalanceWei = expectedReserveBalanceWei.sub(expectedDestAmount);
        } else {
          // weth is transferred to weth token wallet
          expectedReserveBalanceWeth = expectedReserveBalanceWeth.sub(expectedDestAmount);
        }
        // if amount is 11, resolution is 2, it will record 5, and later multiple back with 2
        let imbalance = srcAmount.div(minimalRecordResolution).mul(minimalRecordResolution);
        reserveTokenImbalance[tokenInd] = reserveTokenImbalance[tokenInd].sub(imbalance);
      }
      return {
        expectedDestAmount: expectedDestAmount,
        gasUsed: tx.receipt.gasUsed,
        numberSteps: numberSteps
      }
    };

    const makeSimpleTrades = async function(tokenInd, isUsingTokenWallet, isUsingWeth) {
      let amountWei = new BN(100);
      await tradeAndVerifyDataWithSteps(
        reserveInst,
        true,
        tokenInd,
        amountWei,
        user1,
        false
      );

      let amountToSell = await convRatesInst.getInitImbalance(tokenAdd[tokenInd]);

      await tokens[tokenInd].transfer(network, amountToSell);
      await tokens[tokenInd].approve(reserveInst.address, 0, {from: network});
      await tokens[tokenInd].approve(reserveInst.address, amountToSell, {from: network});

      await tradeAndVerifyDataWithSteps(
        reserveInst,
        false,
        tokenInd,
        amountToSell,
        user1,
        false
      );
    }

    let testSuites = [
      "#Test eth and token in reserve",
      "#Test eth in reserve, token in wallet",
      "#Test using weth, token in wallet"
    ]
    let isUsingWeth = [false, false, true];
    let isUsingWallet = [false, true, true];
    let isDoRateValidation = [true, false];

    for(let r = 0; r <= 1; r++) {
      for(let t = 0; t < testSuites.length; t++) {
        describe(`${testSuites[t]}, rate validation: ${isDoRateValidation[r]}`, async() => {
          it("Test few buys with steps", async() => {
            //init conversion rate
            await setupEnhancedConversionRatesContractWithSteps();
            await generalSetupReserveContract(isUsingWallet[t], isUsingWeth[t]);
            await reserveInst.setDoRateValidation(isDoRateValidation[r], {from: admin});

            if (isUsingWeth[t]) {
              await reserveInst.setTokenWallet(weth.address, walletForToken, {from: admin});
              await weth.approve(reserveInst.address, MAX_ALLOWANCE, {from: walletForToken});
            }

            if (isUsingWallet[t]) {
              // approve
              for(let i = 0; i < numTokens; i++) {
                await reserveInst.setTokenWallet(tokenAdd[i], walletForToken, {from: admin});
                await reserveInst.approveWithdrawAddress(tokenAdd[i], withdrawAddress, true, {from: admin});
                await tokens[i].approve(reserveInst.address, MAX_ALLOWANCE, {from: walletForToken});
              }
            }

            let tokenInd = 2;
            // make a simple buy and sell to init some data first
            await makeSimpleTrades(tokenInd, isUsingWallet[t], isUsingWeth[t]);

            let gasUsedPerStep = [];
            let numberTxsPerStep = [];
            for(let i = 0; i <= 10; i++) {
              gasUsedPerStep.push(new BN(0));
              numberTxsPerStep.push(0);
            }
            for(let i = 0; i <= 5; i++) {
              let amountWei = new BN(1000);
              let tx = await tradeAndVerifyDataWithSteps(
                reserveInst,
                true,
                tokenInd,
                amountWei,
                user1,
                false
              );
              numberTxsPerStep[tx.numberSteps]++;
              gasUsedPerStep[tx.numberSteps].iadd(new BN(tx.gasUsed));
            }

            for(let i = 0; i <= 10; i++) {
              if (numberTxsPerStep[i] > 0) {
                console.log(`         Average gas used for buy with ${i} steps: ${Math.floor(1.0 * gasUsedPerStep[i]/numberTxsPerStep[i])}`)
              }
            }
          });

          it("Test few sells with steps", async() => {
            //init conversion rate
            await setupEnhancedConversionRatesContractWithSteps();
            await generalSetupReserveContract(isUsingWallet[t], isUsingWeth[t]);
            await reserveInst.setDoRateValidation(isDoRateValidation[r], {from: admin});

            if (isUsingWeth[t]) {
              await reserveInst.setTokenWallet(weth.address, walletForToken, {from: admin});
              await weth.approve(reserveInst.address, MAX_ALLOWANCE, {from: walletForToken});
            }

            if (isUsingWallet[t]) {
              // approve
              for(let i = 0; i < numTokens; i++) {
                await reserveInst.setTokenWallet(tokenAdd[i], walletForToken, {from: admin});
                await reserveInst.approveWithdrawAddress(tokenAdd[i], withdrawAddress, true, {from: admin});
                await tokens[i].approve(reserveInst.address, MAX_ALLOWANCE, {from: walletForToken});
              }
            }

            let tokenInd = 3;
            let token = tokens[tokenInd];
            // make a simple buy and sell to init some data first
            await makeSimpleTrades(tokenInd, isUsingWallet[t], isUsingWeth[t]);

            let gasUsedPerStep = [];
            let numberTxsPerStep = [];
            for(let i = 0; i <= 10; i++) {
              gasUsedPerStep.push(new BN(0));
              numberTxsPerStep.push(0);
            }
            for(let i = 0; i <= 5; i++) {
              let amountTwei = new BN(6000);
              await token.transfer(network, amountTwei);
              await token.approve(reserveInst.address, 0, {from: network});
              await token.approve(reserveInst.address, amountTwei, {from: network});
              let tx = await tradeAndVerifyDataWithSteps(
                reserveInst,
                false,
                tokenInd,
                amountTwei,
                user1,
                false
              );
              numberTxsPerStep[tx.numberSteps]++;
              gasUsedPerStep[tx.numberSteps].iadd(new BN(tx.gasUsed));
            }

            for(let i = 0; i <= 10; i++) {
              if (numberTxsPerStep[i] > 0) {
                console.log(`         Average gas used for sell with ${i} steps: ${Math.floor(1.0 * gasUsedPerStep[i]/numberTxsPerStep[i])}`)
              }
            }
          });
        });
      }
    }
  });

  describe("#Test gas consumption, conversion rate v1", async() => {
    const setupEnhancedConversionRatesContractWithStepsV1 = async function() {
      let setupData = await reserveSetup.setupConversionRateV1(tokens, admin, operator, alerter, true);
      convRatesInst = setupData.convRatesInst;
      baseBuyRate = setupData.baseBuyRate;
      compactBuyArr = setupData.compactBuyArr;
      baseSellRate = setupData.baseSellRate;
      compactSellArr = setupData.compactSellArr;
      imbalanceBuyStepX = setupData.imbalanceBuyStepX;
      imbalanceBuyStepY = setupData.imbalanceBuyStepY;
      imbalanceSellStepX = setupData.imbalanceSellStepX;
      imbalanceSellStepY = setupData.imbalanceSellStepY;
      qtyBuyStepX = setupData.qtyBuyStepX;
      qtyBuyStepY = setupData.qtyBuyStepY;
      qtySellStepX = setupData.qtySellStepX;
      qtySellStepY = setupData.qtySellStepY;
      minimalRecordResolution = setupData.minimalRecordResolution;
    }

    const tradeAndVerifyDataWithStepsV1 = async function(
      reserveInst, isBuy, tokenInd,
      srcAmount, recipient, isValidate
    ) {
      let srcAddress = isBuy ? ethAddress : tokenAdd[tokenInd];
      let destAddress = isBuy ? tokenAdd[tokenInd] : ethAddress;
      let conversionRate = await reserveInst.getConversionRate(srcAddress, destAddress, srcAmount, currentBlock);
      let expectedRate;
      let numberSteps = 0;
      if (isBuy) {
        expectedRate = baseBuyRate[tokenInd];
        let extraBps = compactBuyArr[tokenInd] * 10;
        expectedRate = Helper.addBps(expectedRate, extraBps);
        let destQty = Helper.calcDstQty(srcAmount, ethDecimals, tokenDecimals[tokenInd], expectedRate);
        let data = reserveSetup.getExtraBpsForBuyQuantityV1(destQty, qtyBuyStepX, qtyBuyStepY);
        extraBps = data.bps;
        numberSteps = data.steps;
        expectedRate = Helper.addBps(expectedRate, extraBps);
        data = reserveSetup.getExtraBpsForBuyQuantityV1(
          reserveTokenImbalance[tokenInd].add(destQty).toNumber(),
          imbalanceBuyStepX,
          imbalanceBuyStepY
        );
        extraBps = data.bps;
        numberSteps += data.steps;
        expectedRate = Helper.addBps(expectedRate, extraBps);
      } else {
        expectedRate = baseSellRate[tokenInd];
        let extraBps = compactSellArr[tokenInd] * 10;
        expectedRate = Helper.addBps(expectedRate, extraBps);
        let data = reserveSetup.getExtraBpsForSellQuantityV1(srcAmount, qtySellStepX, qtySellStepY);
        extraBps = data.bps;
        numberSteps = data.steps;
        expectedRate = Helper.addBps(expectedRate, extraBps);
        data = reserveSetup.getExtraBpsForImbalanceSellQuantityV1(
          reserveTokenImbalance[tokenInd].sub(srcAmount).toNumber(),
          imbalanceSellStepX,
          imbalanceSellStepY
        );
        extraBps = data.bps;
        numberSteps += data.steps;
        expectedRate = Helper.addBps(expectedRate, extraBps);
      }

      // check correct rate calculated
      Helper.assertEqual(conversionRate, expectedRate, "unexpected rate.");

      //perform trade
      let tx = await reserveInst.trade(
        srcAddress, srcAmount, destAddress, recipient, conversionRate, isValidate,
        {
          from: network,
          value: isBuy ? srcAmount : 0
        }
      );
      let expectedDestAmount;
      if (isBuy) {
        expectedDestAmount = Helper.calcDstQty(srcAmount, ethDecimals, tokenDecimals[tokenInd], conversionRate);
      } else {
        expectedDestAmount = Helper.calcDstQty(srcAmount, tokenDecimals[tokenInd], ethDecimals, conversionRate);
      }
      // update balance and imbalance
      if (isBuy) {
        // update reserve eth or weth balance
        if (!isUsingWeth) {
          // eth is transferred to reserve
          expectedReserveBalanceWei = expectedReserveBalanceWei.add(srcAmount);
        } else {
          // weth is transferred to weth token wallet
          expectedReserveBalanceWeth = expectedReserveBalanceWeth.add(srcAmount);
        }
        // update token balance
        let imbalance = expectedDestAmount.div(minimalRecordResolution).mul(minimalRecordResolution);
        reserveTokenImbalance[tokenInd] = reserveTokenImbalance[tokenInd].add(imbalance);
      } else {
        // reserve has received token
        reserveTokenBalance[tokenInd] = reserveTokenBalance[tokenInd].add(srcAmount);
        if (!isUsingWeth) {
          // reserve transfered back eth
          expectedReserveBalanceWei = expectedReserveBalanceWei.sub(expectedDestAmount);
        } else {
          // weth is transferred to weth token wallet
          expectedReserveBalanceWeth = expectedReserveBalanceWeth.sub(expectedDestAmount);
        }
        let imbalance = srcAmount.div(minimalRecordResolution).mul(minimalRecordResolution);
        reserveTokenImbalance[tokenInd] = reserveTokenImbalance[tokenInd].sub(imbalance);
      }
      return {
        expectedDestAmount: expectedDestAmount,
        gasUsed: tx.receipt.gasUsed,
        numberSteps: numberSteps
      }
    };

    const makeSimpleTradesV1 = async function(tokenInd, isUsingTokenWallet, isUsingWeth) {
      let amountWei = new BN(100);
      await tradeAndVerifyDataWithStepsV1(
        reserveInst,
        true,
        tokenInd,
        amountWei,
        user1,
        false
      );

      let amountToSell = await convRatesInst.getInitImbalance(tokenAdd[tokenInd]);

      await tokens[tokenInd].transfer(network, amountToSell);
      await tokens[tokenInd].approve(reserveInst.address, 0, {from: network});
      await tokens[tokenInd].approve(reserveInst.address, amountToSell, {from: network});

      await tradeAndVerifyDataWithStepsV1(
        reserveInst,
        false,
        tokenInd,
        amountToSell,
        user1,
        false
      );
    }

    let testSuites = [
      "#Test eth and token in reserve",
      "#Test eth in reserve, token in wallet",
      "#Test using weth, token in wallet"
    ]
    let isUsingWeth = [false, false, true];
    let isUsingWallet = [false, true, true];
    let isDoRateValidation = [true, false];

    for(let r = 0; r <= 1; r++) {
      for(let t = 0; t < testSuites.length; t++) {
        describe(`${testSuites[t]}, rate validation: ${isDoRateValidation[r]}`, async() => {
          it("Test few buys with steps", async() => {
            //init conversion rate
            await setupEnhancedConversionRatesContractWithStepsV1();
            await generalSetupReserveContract(isUsingWallet[t], isUsingWeth[t]);
            await reserveInst.setDoRateValidation(isDoRateValidation[r], {from: admin});

            if (isUsingWeth[t]) {
              await reserveInst.setTokenWallet(weth.address, walletForToken, {from: admin});
              await weth.approve(reserveInst.address, MAX_ALLOWANCE, {from: walletForToken});
            }

            if (isUsingWallet[t]) {
              // approve
              for(let i = 0; i < numTokens; i++) {
                await reserveInst.setTokenWallet(tokenAdd[i], walletForToken, {from: admin});
                await reserveInst.approveWithdrawAddress(tokenAdd[i], withdrawAddress, true, {from: admin});
                await tokens[i].approve(reserveInst.address, MAX_ALLOWANCE, {from: walletForToken});
              }
            }

            let tokenInd = 2;
            // make a simple buy and sell to init some data first
            await makeSimpleTradesV1(tokenInd, isUsingWallet[t], isUsingWeth[t]);

            let gasUsedPerStep = [];
            let numberTxsPerStep = [];
            for(let i = 0; i <= 10; i++) {
              gasUsedPerStep.push(new BN(0));
              numberTxsPerStep.push(0);
            }
            for(let i = 0; i <= 5; i++) {
              let amountWei = new BN(1000);
              let data = await tradeAndVerifyDataWithStepsV1(
                reserveInst,
                true,
                tokenInd,
                amountWei,
                user1,
                false
              );
              numberTxsPerStep[data.numberSteps]++;
              gasUsedPerStep[data.numberSteps].iadd(new BN(data.gasUsed));
            }

            for(let i = 0; i <= 10; i++) {
              if (numberTxsPerStep[i] > 0) {
                console.log(`         Average gas used for buy with ${i} steps: ${Math.floor(1.0 * gasUsedPerStep[i]/numberTxsPerStep[i])}`)
              }
            }
          });

          it("Test few sells with steps", async() => {
            //init conversion rate
            await setupEnhancedConversionRatesContractWithStepsV1();
            await generalSetupReserveContract(isUsingWallet[t], isUsingWeth[t]);
            await reserveInst.setDoRateValidation(isDoRateValidation[r], {from: admin});

            if (isUsingWeth[t]) {
              await reserveInst.setTokenWallet(weth.address, walletForToken, {from: admin});
              await weth.approve(reserveInst.address, MAX_ALLOWANCE, {from: walletForToken});
            }

            if (isUsingWallet[t]) {
              // approve
              for(let i = 0; i < numTokens; i++) {
                await reserveInst.setTokenWallet(tokenAdd[i], walletForToken, {from: admin});
                await reserveInst.approveWithdrawAddress(tokenAdd[i], withdrawAddress, true, {from: admin});
                await tokens[i].approve(reserveInst.address, MAX_ALLOWANCE, {from: walletForToken});
              }
            }

            let tokenInd = 3;
            let token = tokens[tokenInd];
            // make a simple buy and sell to init some data first
            await makeSimpleTradesV1(tokenInd, isUsingWallet[t], isUsingWeth[t]);

            let gasUsedPerStep = [];
            let numberTxsPerStep = [];
            for(let i = 0; i <= 10; i++) {
              gasUsedPerStep.push(new BN(0));
              numberTxsPerStep.push(0);
            }
            for(let i = 0; i <= 5; i++) {
              let amountTwei = new BN(6000);
              await token.transfer(network, amountTwei);
              await token.approve(reserveInst.address, 0, {from: network});
              await token.approve(reserveInst.address, amountTwei, {from: network});
              let tx = await tradeAndVerifyDataWithStepsV1(
                reserveInst,
                false,
                tokenInd,
                amountTwei,
                user1,
                false
              );
              numberTxsPerStep[tx.numberSteps]++;
              gasUsedPerStep[tx.numberSteps].iadd(new BN(tx.gasUsed));
            }

            for(let i = 0; i <= 10; i++) {
              if (numberTxsPerStep[i] > 0) {
                console.log(`         Average gas used for sell with ${i} steps: ${Math.floor(1.0 * gasUsedPerStep[i]/numberTxsPerStep[i])}`)
              }
            }
          });
        });
      }
    }
  });
});



// returns 1 token of decimals d
function tokenUnits(d) {
  return new BN(10).pow(new BN(d));
}
