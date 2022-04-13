const EnhancedConversionRates = artifacts.require("MockEnhancedStepFunctions.sol");
const ConversionRates = artifacts.require("MockConversionRate.sol");
const NimbleFprReserveV2 = artifacts.require("NimbleFprReserveV2");

const Helper = require("./helper.js");
const BN = web3.utils.BN;

//global variables
//////////////////
const {precisionUnits, ethAddress, zeroAddress, zeroBN} = require("./helper.js");

//block data
let validRateDurationInBlocks = 1000;

// imbalance data
let minimalRecordResolution = new BN(2);
let maxPerBlockImbalance = 40000;
let maxTotalImbalance = maxPerBlockImbalance * 12;

module.exports.setupConversionRateV1 = async function(tokens, admin, operator, alerter, needListingToken) {
  let convRatesInst = await ConversionRates.new(admin);

    //set pricing general parameters
  await convRatesInst.setValidRateDurationInBlocks(validRateDurationInBlocks);

  let baseBuyRate = [];
  let baseSellRate = [];
  let compactBuyArr = [];
  let compactSellArr = [];

  let qtyBuyStepX = [0, 5000, 10000, 16000, 28000, 32000, 45000];
  let qtyBuyStepY = [ 0, 10, 20, 32, 44, 56, 101];
  let qtySellStepX = [0, 5000, 11000, 18000, 30000, 36000, 48000];
  let qtySellStepY = [ 0, 12, 22, 33, 45, 58, 110];
  let imbalanceBuyStepX = [0, 5000, 15000, 21000, 28000, 33000, 45000];
  let imbalanceBuyStepY = [0, -110, -160, -250, -440, -1000, -1600];
  let imbalanceSellStepX = [-48000, -39000, -25000, -19000, -14000, -10000, 0];
  let imbalanceSellStepY = [-1500, -1200, -440, -320, -200, -75, 0];

  if (needListingToken) {
    //create and add token addresses...
    for (let i = 0; i < tokens.length; ++i) {
      let token = tokens[i];
      await convRatesInst.addToken(token.address);
      await convRatesInst.setTokenControlInfo(token.address, minimalRecordResolution, maxPerBlockImbalance, maxTotalImbalance);
      await convRatesInst.enableTokenTrade(token.address);
    }

    await convRatesInst.addOperator(operator);
    await convRatesInst.addAlerter(alerter);

    // init rates
    // buy is ether to token rate. sale is token to ether rate. so sell == 1 / buy. assuming we have no spread.
    let tokensPerEther;
    let ethersPerToken;

    let tokenAdd = [];
    for (i = 0; i < tokens.length; ++i) {
      tokensPerEther = precisionUnits.mul(new BN((i + 1) * 3));
      ethersPerToken = precisionUnits.div(new BN((i + 1) * 3));
      baseBuyRate.push(tokensPerEther);
      baseSellRate.push(ethersPerToken);
      tokenAdd.push(tokens[i].address);
    }
    Helper.assertEqual(baseBuyRate.length, tokens.length);
    Helper.assertEqual(baseSellRate.length, tokens.length);

    let buys = [];
    let sells = [];
    let indices = [];

    let currentBlock = await Helper.getCurrentBlock();
    await convRatesInst.setBaseRate(tokenAdd, baseBuyRate, baseSellRate, buys, sells, currentBlock, indices, {from: operator});

    //set compact data
    compactBuyArr = [0, 0, 0, 0, 0, 06, 07, 08, 09, 1, 0, 11, 12, 13, 14];
    let compactBuyHex = Helper.bytesToHex(compactBuyArr);
    buys.push(compactBuyHex);

    compactSellArr = [0, 0, 0, 0, 0, 26, 27, 28, 29, 30, 31, 32, 33, 34];
    let compactSellHex = Helper.bytesToHex(compactSellArr);
    sells.push(compactSellHex);

    indices[0] = 0;

    Helper.assertEqual(indices.length, sells.length, "bad sells array size");
    Helper.assertEqual(indices.length, buys.length, "bad buys array size");

    await convRatesInst.setCompactData(buys, sells, currentBlock, indices, {from: operator});

    for (let i = 0; i < tokens.length; ++i) {
      await convRatesInst.setQtyStepFunction(tokens[i].address, qtyBuyStepX, qtyBuyStepY, qtySellStepX, qtySellStepY, {from:operator});
      await convRatesInst.setImbalanceStepFunction(tokens[i].address, imbalanceBuyStepX, imbalanceBuyStepY, imbalanceSellStepX, imbalanceSellStepY, {from:operator});
    }
  }

  return {
    convRatesInst: convRatesInst,
    baseBuyRate: baseBuyRate,
    compactBuyArr: compactBuyArr,
    baseSellRate: baseSellRate,
    compactSellArr: compactSellArr,
    imbalanceBuyStepX: imbalanceBuyStepX,
    imbalanceBuyStepY: imbalanceBuyStepY,
    imbalanceSellStepX: imbalanceSellStepX,
    imbalanceSellStepY: imbalanceSellStepY,
    qtyBuyStepX: qtyBuyStepX,
    qtyBuyStepY: qtyBuyStepY,
    qtySellStepX: qtySellStepX,
    qtySellStepY: qtySellStepY,
    minimalRecordResolution: minimalRecordResolution
  }
};

module.exports.setupEnhancedConversionRate = async function(tokens, admin, operator, alerter, needListingToken) {
  let convRatesInst = await EnhancedConversionRates.new(admin);

  //set pricing general parameters
  await convRatesInst.setValidRateDurationInBlocks(validRateDurationInBlocks);

  let baseBuyRate = [];
  let baseSellRate = [];
  let compactBuyArr = [];
  let compactSellArr = [];
  //imbalance buy steps
  let imbalanceBuyStepX = [0, 5000, 15000, 21000, 28000, 33000, 45000];
  let imbalanceBuyStepY = [0, -110, -160, -250, -440, -1000, -1600, -2000];

  //sell imbalance step
  let imbalanceSellStepX = [-48000, -39000, -25000, -19000, -14000, -10000, 0];
  let imbalanceSellStepY = [-2100, -1500, -1200, -440, -320, -200, -75, 0];

  if (needListingToken) {
    //create and add token addresses...
    for (let i = 0; i < tokens.length; ++i) {
      let token = tokens[i];
      await convRatesInst.addToken(token.address);
      await convRatesInst.setTokenControlInfo(token.address, minimalRecordResolution, maxPerBlockImbalance, maxTotalImbalance);
      await convRatesInst.enableTokenTrade(token.address);
    }

    await convRatesInst.addOperator(operator);
    await convRatesInst.addAlerter(alerter);

    // init rates
    // buy is ether to token rate. sale is token to ether rate. so sell == 1 / buy. assuming we have no spread.
    let tokensPerEther;
    let ethersPerToken;

    let tokenAdd = [];
    for (i = 0; i < tokens.length; ++i) {
      tokensPerEther = precisionUnits.mul(new BN((i + 1) * 3));
      ethersPerToken = precisionUnits.div(new BN((i + 1) * 3));
      baseBuyRate.push(tokensPerEther);
      baseSellRate.push(ethersPerToken);
      tokenAdd.push(tokens[i].address);
    }
    Helper.assertEqual(baseBuyRate.length, tokens.length);
    Helper.assertEqual(baseSellRate.length, tokens.length);

    let buys = [];
    let sells = [];
    let indices = [];

    let currentBlock = await Helper.getCurrentBlock();
    await convRatesInst.setBaseRate(tokenAdd, baseBuyRate, baseSellRate, buys, sells, currentBlock, indices, {from: operator});

    //set compact data
    compactBuyArr = [0, 0, 0, 0, 0, 06, 07, 08, 09, 1, 0, 11, 12, 13, 14];
    let compactBuyHex = Helper.bytesToHex(compactBuyArr);
    buys.push(compactBuyHex);

    compactSellArr = [0, 0, 0, 0, 0, 26, 27, 28, 29, 30, 31, 32, 33, 34];
    let compactSellHex = Helper.bytesToHex(compactSellArr);
    sells.push(compactSellHex);

    indices[0] = 0;

    Helper.assertEqual(indices.length, sells.length, "bad sells array size");
    Helper.assertEqual(indices.length, buys.length, "bad buys array size");

    await convRatesInst.setCompactData(buys, sells, currentBlock, indices, {from: operator});

    //all start with same step functions.
    for (let i = 0; i < tokens.length; ++i) {
      await convRatesInst.setImbalanceStepFunction(tokenAdd[i], imbalanceBuyStepX, imbalanceBuyStepY, imbalanceSellStepX, imbalanceSellStepY, {from: operator});
    }
  }

  return {
    convRatesInst: convRatesInst,
    baseBuyRate: baseBuyRate,
    compactBuyArr: compactBuyArr,
    baseSellRate: baseSellRate,
    compactSellArr: compactSellArr,
    imbalanceBuyStepX: imbalanceBuyStepX,
    imbalanceBuyStepY: imbalanceBuyStepY,
    imbalanceSellStepX: imbalanceSellStepX,
    imbalanceSellStepY: imbalanceSellStepY,
    minimalRecordResolution: minimalRecordResolution
  }
};

module.exports.setupFprReserveV2 = async function(
  convRatesInst, tokens, weth, network, maxGasPrice,
  accounts, admin, operator, alerter,
  withdrawAddress, tokenWallet, isUsingWeth, doRateValidation
) {
  // init reserves and balances
  let reserveInst = await NimbleFprReserveV2.new(network, convRatesInst.address, weth.address, maxGasPrice, doRateValidation, admin);

  await reserveInst.addOperator(operator);
  await reserveInst.addAlerter(alerter);
  await convRatesInst.setReserveAddress(reserveInst.address);

  await reserveInst.approveWithdrawAddress(ethAddress, withdrawAddress, true, {from: admin});
  for (let i = 0; i < tokens.length; ++i) {
    await reserveInst.approveWithdrawAddress(tokens[i].address, withdrawAddress, true, {from: admin});
  }

  //set reserve balance
  if (tokenWallet == zeroAddress) {
    tokenWallet = reserveInst.address;
  }
  let amountEth = new BN(10);
  let reserveEtherInit = precisionUnits.mul(amountEth);
  let reserveBalanceWei;
  let reserveBalanceWeth;
  if (isUsingWeth) {
    // empty token wallet
    let wethBalance = await weth.balanceOf(tokenWallet);
    if (wethBalance.gt(zeroBN)) {
      weth.transfer(accounts[0], wethBalance, {from: tokenWallet});
    }
    await weth.deposit({value: reserveEtherInit});
    await weth.transfer(tokenWallet, reserveEtherInit);

    await reserveInst.approveWithdrawAddress(weth.address, withdrawAddress, true, {from: admin});

    let balance = await weth.balanceOf(tokenWallet);
    reserveBalanceWei = new BN(0);
    reserveBalanceWeth = balance;

    Helper.assertEqual(balance, reserveEtherInit, "wrong weth balance");
  } else {
    await Helper.sendEtherWithPromise(withdrawAddress, reserveInst.address, reserveEtherInit);

    let balance = await Helper.getBalancePromise(reserveInst.address);
    reserveBalanceWei = balance;
    reserveBalanceWeth = new BN(0);

    Helper.assertEqual(balance, reserveEtherInit, "wrong ether balance");
  }

  //transfer tokens to wallet
  let tokenImbalances = [];
  let tokenBalances = [];
  for (let i = 0; i < tokens.length; ++i) {
    // empty token wallet
    token = tokens[i];
    let tokenBalance = await token.balanceOf(tokenWallet);
    if (tokenBalance.gt(zeroBN)) {
      await token.transfer(accounts[0], tokenBalance, {from: tokenWallet});
    }
    let oneToken = new BN(10).pow(new BN(await token.decimals()));
    let amount = (amountEth.mul(new BN((i + 1) * 3))).mul(oneToken);
    await token.transfer(tokenWallet, amount);
    let balance = await token.balanceOf(tokenWallet);
    Helper.assertEqual(amount, balance);

    tokenBalances.push(amount);
  };
  for (let i = 0; i < tokens.length; i++) {
    let imbalance = await convRatesInst.getInitImbalance(tokens[i].address);
    tokenImbalances.push(imbalance);
  }

  return {
    reserveInst: reserveInst,
    reserveBalanceWei: reserveBalanceWei,
    reserveBalanceWeth: reserveBalanceWeth,
    tokenBalances: tokenBalances,
    tokenImbalances: tokenImbalances
  }
}

module.exports.getExtraBpsForImbalanceBuyV2 = function(imbalance, qty, imbalanceBuyStepX, imbalanceBuyStepY) {
  return getExtraBpsForQuantityV2(imbalance, imbalance + qty, imbalanceBuyStepX, imbalanceBuyStepY);
};

module.exports.getExtraBpsForImbalanceSellV2 = function(imbalance, qty, imbalanceSellStepX, imbalanceSellStepY) {
  return getExtraBpsForQuantityV2(imbalance - qty, imbalance, imbalanceSellStepX, imbalanceSellStepY);
};

// Return extra bps and number of steps it accesses
function getExtraBpsForQuantityV2(from, to, stepX, stepY) {
  if (stepY.length == 0 || (from == to)) {
    return {
      bps: 0,
      steps: 0
    }
  }
  let len = stepX.length;

  let change = 0;
  let fromVal = from;
  let qty = to - from;

  for(let i = 0; i < len; i++) {
    if (stepX[i] <= fromVal) { continue; }
    if (stepY[i] == -10000) {
      return {
        bps: -10000,
        steps: i + 1
      }
    }
    if (stepX[i] >= to) {
      change += (to - fromVal) * stepY[i];
      return {
        bps: divSolidity(change, qty),
        steps: i + 1
      }
    } else {
      change += (stepX[i] - fromVal) * stepY[i];
      fromVal = stepX[i];
    }
  }
  if (fromVal < to) {
    if (stepY[len] == -10000) {
      return {
        bps: -10000,
        steps: len + 1
      }
    }
    change += (to - fromVal) * stepY[len];
  }
  return {
    bps: divSolidity(change, qty),
    steps: len + 1
  }
}

function divSolidity(a, b) {
  let c = a / b;
  if (c < 0) { return Math.ceil(c); }
  return Math.floor(c);
}

// old conversion rate
module.exports.getExtraBpsForBuyQuantityV1 = function(qty, qtyBuyStepX, qtyBuyStepY) {
  for (let i = 0; i < qtyBuyStepX.length; i++) {
    if (qty <= qtyBuyStepX[i]) {
      return {
        bps: qtyBuyStepY[i],
        steps: i + 1
      }
    }
  }
  return {
    bps: qtyBuyStepY[qtyBuyStepY.length - 1],
    steps: qtyBuyStepX.length
  }
};

module.exports.getExtraBpsForSellQuantityV1 = function(qty, qtySellStepX, qtySellStepY) {
  for (let i = 0; i < qtySellStepX.length; i++) {
    if (qty <= qtySellStepX[i]) {
      return {
        bps: qtySellStepY[i],
        steps: i + 1
      }
    }
  }
  return {
    bps: qtySellStepY[qtySellStepY.length - 1],
    steps: qtySellStepX
  }
};

module.exports.getExtraBpsForImbalanceBuyQuantityV1 = function(qty, imbalanceBuyStepX, imbalanceBuyStepY) {
  for (let i = 0; i < imbalanceBuyStepX.length; i++) {
    if (qty <= imbalanceBuyStepX[i]) {
      return {
        bps: imbalanceBuyStepY[i],
        steps: i + 1
      }
    }
  }
  return {
    bps: (imbalanceBuyStepY[imbalanceBuyStepY.length - 1]),
    steps: imbalanceBuyStepY.length
  }
};

module.exports.getExtraBpsForImbalanceSellQuantityV1 = function(qty, imbalanceSellStepX, imbalanceSellStepY) {
  for (let i = 0; i < imbalanceSellStepX.length; i++) {
    if (qty <= imbalanceSellStepX[i]) {
      return {
        bps: imbalanceSellStepY[i],
        steps: i + 1
      }
    }
  }
  return {
    bps: (imbalanceSellStepY[imbalanceSellStepY.length - 1]),
    steps: imbalanceSellStepY.length
  }
};
