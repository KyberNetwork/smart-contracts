const ConversionRates = artifacts.require("MockEnhancedStepFunctions.sol");
const KyberFprReserveV2 = artifacts.require("KyberFprReserveV2");

const Helper = require("./helper.js");
const BN = web3.utils.BN;

//global variables
//////////////////
const {precisionUnits, ethAddress, zeroAddress, 
    zeroBN} = require("./helper.js");

//block data
let validRateDurationInBlocks = 1000;
let maxGasPrice = new BN(150).mul(new BN(10).pow(new BN(9))); // 150 * 10^9

// imbalance data
let minimalRecordResolution = new BN(2);
let maxPerBlockImbalance = 40000;
let maxTotalImbalance = maxPerBlockImbalance * 12;


//imbalance buy steps
let imbalanceBuyStepX = [-85000, -28000, -15000, 0, 15000, 28000, 45000];
let imbalanceBuyStepY = [ 1300, 130, 43, 0, 0, -110, -160, -1600];


//sell imbalance step
let imbalanceSellStepX = [-85000, -28000, -10000, 0, 10000, 28000, 45000];
let imbalanceSellStepY = [-1500, -320, -75, 0, 0, 110, 350, 650];


module.exports.setupConversionRate = async function(tokens, admin, operator, alerter, needListingToken) {
    let convRatesInst = await ConversionRates.new(admin);

    //set pricing general parameters
    await convRatesInst.setValidRateDurationInBlocks(validRateDurationInBlocks);

    let baseBuyRate = [];
    let baseSellRate = [];
    let compactBuyArr = [];
    let compactSellArr = [];

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
    }
};

module.exports.setupFprReserveV2 = async function(
    convRatesInst, tokens, weth, network, maxGasPrice,
    accounts, admin, operator, alerter,
    withdrawAddress, tokenWallet, isUsingWeth
) {
    // init reserves and balances
    let reserveInst = await KyberFprReserveV2.new(network, convRatesInst.address, weth.address, maxGasPrice, admin);
    await reserveInst.setContracts(network, convRatesInst.address, weth.address, zeroAddress);

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
