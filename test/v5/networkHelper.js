const BN = web3.utils.BN;
const Helper = require("../v4/helper.js");

const Reserve = artifacts.require("KyberReserve.sol");
const ConversionRates = artifacts.require("ConversionRates.sol");
const MockReserve = artifacts.require("MockReserve.sol");

require("chai")
    .use(require("chai-as-promised"))
    .use(require("chai-bn")(BN))
    .should();


const {BPS, precisionUnits, ethDecimals, ethAddress, zeroAddress, emptyHint, zeroBN,
    calcRateFromQty, assertEqual, getBalancePromise}  = require("../v4/helper.js")

//// reserve types
const NULL_ID = '0x0000000000000000';
const APR_ID = '0xaa000000';
const BRIDGE_ID  = '0xbb000000';
const MOCK_ID  = '0x22000000';
const FPR_ID = '0xff000000';

const type_apr = "TYPE_APR";
const type_MOCK = "TYPE_MOCK";
const type_fpr = "TYPE_FPR";

const MASK_IN_HINTTYPE = 0;
const MASK_OUT_HINTTYPE = 1;
const SPLIT_HINTTYPE = 2;
const EMPTY_HINTTYPE = 3;

module.exports = {NULL_ID, APR_ID, BRIDGE_ID, MOCK_ID, FPR_ID, type_apr, type_fpr, type_MOCK, 
    MASK_IN_HINTTYPE, MASK_OUT_HINTTYPE, SPLIT_HINTTYPE, EMPTY_HINTTYPE};
    
    
module.exports.setupReserves = async function 
    (network, tokens, numMock, numFpr, numEnhancedFpr, numApr, accounts, admin, operator, rebateWallets) {
    let result = {
        'numAddedReserves': numMock * 1 + numFpr * 1 + numEnhancedFpr * 1 + numApr * 1,
        'reserveInstances': {},
        'reserveIdToRebateWallet' : {} 
    }

    let i;
    let ethSenderIndex = 1;
    let ethInit = (new BN(10)).pow(new BN(19)).mul(new BN(8)); 
    
    // setup mock reserves
    //////////////////////
    for (i=0; i < numMock; i++) {
        reserve = await MockReserve.new();
        let reserveId = (genReserveID(MOCK_ID, reserve.address)).toLowerCase();
        let rebateWallet;
        if (rebateWallets == undefined || rebateWallets.length < i * 1 - 1 * 1) {
            rebateWallet = zeroAddress;
        } else {
            rebateWallet = rebateWallets[i];
        }

        result.reserveInstances[reserve.address] = {
            'address': reserve.address,
            'instance': reserve,
            'reserveId': reserveId,
            'isFeePaying': true,
            'rate': new BN(0),
            'type': type_MOCK,
            'pricing': "none",
            'rebateWallet': rebateWallet
        }
        result.reserveIdToRebateWallet[reserveId] = rebateWallet;
        
        // console.log("reserve ID: " + reserveId + " rebate wallet: " + rebateWallet);
        tokensPerEther = precisionUnits.mul(new BN((i + 1) * 10));
        ethersPerToken = precisionUnits.div(new BN((i + 1) * 10));

        //send ETH
        let ethSender = accounts[ethSenderIndex++];
        await Helper.sendEtherWithPromise(ethSender, reserve.address, ethInit);
        await Helper.assertSameEtherBalance(reserve.address, ethInit);

        for (let j = 0; j < tokens.length; j++) {
            token = tokens[j];
            //set rates and send tokens based on eth -> token rate
            await reserve.setRate(token.address, tokensPerEther, ethersPerToken);
            let initialTokenAmount = new BN(200000).mul(new BN(10).pow(new BN(await token.decimals())));
            await token.transfer(reserve.address, initialTokenAmount);
            await Helper.assertSameTokenBalance(reserve.address, token, initialTokenAmount);
        }
    }

    // setup fpr reserves
    ////////////////////
    for(i = 0; i < numFpr; i++) {
        
        tokensPerEther = precisionUnits.mul(new BN((i + 1) * 30));
        ethersPerToken = precisionUnits.div(new BN((i + 1) * 30));
    
        let pricing = await setupFprPricing(tokens, 3, 0, tokensPerEther, ethersPerToken, admin, operator)
        let reserve = await setupFprReserve(network, tokens, accounts[ethSenderIndex++], pricing.address, ethInit, admin, operator);
        await pricing.setReserveAddress(reserve.address, {from: admin});
        
        let reserveId = (genReserveID(FPR_ID, reserve.address)).toLowerCase();
        let rebateWallet;
        if (rebateWallets == undefined || rebateWallets.length < i * 1 - 1 * 1) {
            rebateWallet = zeroAddress;
        } else {
            rebateWallet = rebateWallets[i];
        }

        result.reserveInstances[reserve.address] = {
            'address': reserve.address,
            'instance': reserve,
            'reserveId': reserveId,
            'isFeePaying': true,
            'rate': new BN(0),
            'type': type_fpr,
            'pricing': pricing.address,
            'rebateWallet': rebateWallet
        }

        result.reserveIdToRebateWallet[reserveId] = rebateWallet;
    }
    //TODO: implement logic for other reserve types
    return result;
}

module.exports.setupFprReserve = setupFprReserve;
async function setupFprReserve(network, tokens, ethSender, pricingAdd, ethInit, admin, operator) {
    let reserve;

    //setup reserve
    reserve = await Reserve.new(network.address, pricingAdd, admin);
    await reserve.addOperator(operator, {from: admin});
    await reserve.addAlerter(operator, {from: admin});
        
    //set reserve balance. 10**18 wei ether + per token 10**18 wei ether value according to base rate.
    await Helper.sendEtherWithPromise(ethSender, reserve.address, ethInit);
    
    for (let j = 0; j < tokens.length; ++j) {
        let token = tokens[j];
        
        //reserve related setup
        await reserve.approveWithdrawAddress(token.address, ethSender, true, {from: admin});
            
        let initialTokenAmount = new BN(200000).mul(new BN(10).pow(new BN(await token.decimals())));
        await token.transfer(reserve.address, initialTokenAmount);
        await Helper.assertSameTokenBalance(reserve.address, token, initialTokenAmount);
    }

    return reserve;
}

//quantity buy steps. low values to simluate gas cost of steps.
const qtyBuyStepX = [0, 1, 2, 3, 4, 5];
const qtyBuyStepY = [0, -1, -2, -3, -4, -5];
const imbalanceBuyStepX = [0, -1, -2, -3, -4, -5];
const imbalanceBuyStepY = [0,  -1, -2, -3, -4, -5];
const qtySellStepX =[0, 1, 2, 3, 4, 5];
const qtySellStepY = [0, -1, -2, -3, -4, -5];
const imbalanceSellStepX = [0, -1, -2, -3, -4, -5];
const imbalanceSellStepY = [0, -1, -2, -3, -4, -5];


const validRateDurationInBlocks = (new BN(9)).pow(new BN(21)); // some big number
const minimalRecordResolution = 1000000; //low resolution so I don't lose too much data. then easier to compare calculated imbalance values.
const maxPerBlockImbalance = precisionUnits.mul(new BN(10000)); // some big number
const maxTotalImbalance = maxPerBlockImbalance.mul(new BN(3));

module.exports.setupFprPricing = setupFprPricing;
async function setupFprPricing (tokens, numImbalanceSteps, numQtySteps, tokensPerEther, ethersPerToken, admin, operator) {
    let block = await web3.eth.getBlockNumber();
    let pricing = await ConversionRates.new(admin);
    await pricing.addOperator(operator, {from: admin})
    await pricing.addAlerter(operator, {from: admin})

    await pricing.setValidRateDurationInBlocks(validRateDurationInBlocks, {from: admin});
    
    let buys = [];
    let sells = [];
    let indices = [];

    for (let j = 0; j < tokens.length; ++j) {
        let token = tokens[j];
        let tokenAddress = token.address;
                
        // pricing setup
        await pricing.addToken(token.address, {from: admin});
        await pricing.setTokenControlInfo(token.address, minimalRecordResolution, maxPerBlockImbalance, maxTotalImbalance, {from: admin});
        await pricing.enableTokenTrade(token.address, {from: admin});
        
        //update rates array
        let baseBuyRate = [];
        let baseSellRate = [];
        baseBuyRate.push(tokensPerEther);
        baseSellRate.push(ethersPerToken);

        buys.length = sells.length = indices.length = 0;

        tokenAdd = [tokenAddress];
        await pricing.setBaseRate(tokenAdd, baseBuyRate, baseSellRate, buys, sells, block, indices, {from: operator});      
        
        let buyX = qtyBuyStepX;
        let buyY = qtyBuyStepY;
        let sellX = qtySellStepX;
        let sellY = qtySellStepY;
        if (numQtySteps == 0) numQtySteps = 1;
        buyX.length = buyY.length = sellX.length = sellY.length = numQtySteps;
        await pricing.setQtyStepFunction(tokenAddress, buyX, buyY, sellX, sellY, {from:operator});
        
        buyX = imbalanceBuyStepX;
        buyY = imbalanceBuyStepY;
        sellX = imbalanceSellStepX;
        sellY = imbalanceSellStepY;
        if (numImbalanceSteps == 0) numImbalanceSteps = 1;
        buyX.length = buyY.length = sellX.length = sellY.length = numImbalanceSteps;
        
        await pricing.setImbalanceStepFunction(tokenAddress, buyX, buyY, sellX, sellY, {from:operator});
    }
            
    compactBuyArr = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    let compactBuyHex = Helper.bytesToHex(compactBuyArr);
    buys.push(compactBuyHex);

    compactSellArr =  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    let compactSellHex = Helper.bytesToHex(compactSellArr);
    sells.push(compactSellHex);

    indices[0] = 0;

    Helper.assertEqual(indices.length, sells.length, "bad sells array size");
    Helper.assertEqual(indices.length, buys.length, "bad buys array size");

    await pricing.setCompactData(buys, sells, block, indices, {from: operator});
    return pricing;
}

module.exports.addReservesToNetwork = async function (networkInstance, reserveInstances, tokens, operator) {
    for (const [key, value] of Object.entries(reserveInstances)) {
        reserve = value;
        console.log("add reserve type: " + reserve.type + " ID: " + reserve.reserveId);
        let rebateWallet = (reserve.rebateWallet == zeroAddress || reserve.rebateWallet == undefined) 
             ? reserve.address : reserve.rebateWallet;
        await networkInstance.addReserve(reserve.address, reserve.reserveId, reserve.isFeePaying, rebateWallet, {from: operator});
        for (let j = 0; j < tokens.length; j++) {
            await networkInstance.listPairForReserve(reserve.address, tokens[j].address, true, true, true, {from: operator});
        }
    }
}

module.exports.getEt2ReservesFromTradeTx = function(tradeTx) {
    let result = {}

    for (let event of tradeTx.logs) {
        console.log("event.event: " + event.event)
        if(event.event == 'KyberTrade') {
            result['t2eIds'] = event.args.t2eIds;
            result['e2tIds'] = event.args.e2tIds;
            return result;
        }
    }
}

module.exports.removeReservesFromNetwork = async function (networkInstance, reserveInstances, tokens, operator) {
    for (const [key, value] of Object.entries(reserveInstances)) {
        reserve = value;
        console.log("removing reserve type: " + reserve.type + " address: " + reserve.address + " pricing: " + reserve.pricing);
        for (let j = 0; j < tokens.length; j++) {
            await networkInstance.listPairForReserve(reserve.address, tokens[j].address, true, true, false, {from: operator});
        }
        await networkInstance.rmReserve(reserve.address, {from: operator});
    }
}

module.exports.genReserveID = genReserveID; 
function genReserveID(reserveID, reserveAddress) {
    return reserveID + reserveAddress.substring(2,10);
}


module.exports.fetchReservesRatesFromNetwork = fetchReservesRatesFromNetwork;
async function fetchReservesRatesFromNetwork(networkInstance, reserveInstances, tokenAddress, qty, isTokenToEth) {
    reservesArray = [];
    //sell
    if (isTokenToEth) {
        result = await networkInstance.getPricesForToken(tokenAddress, 0, qty);
        reserves = result.sellReserves;
        rates = result.sellRates;
    //buy
    } else {
        result = await networkInstance.getPricesForToken(tokenAddress, qty, 0);
        reserves = result.buyReserves;
        rates = result.buyRates;
    }
    for (i=0; i<reserves.length; i++) {
        reserveAddress = reserves[i];
        //deep copy the object to avoid assign buy and sell rate to the same object
        reserve = Object.assign({}, reserveInstances[reserveAddress]);
        reserve.rate = rates[i];
        reservesArray.push(reserve);
    }
    return reservesArray;
}

module.exports.getBestReserveAndRate = getBestReserveAndRate;
async function getBestReserveAndRate(reserves, src, dest, srcAmount, networkFeeBps) {
    bestReserveData = {
        address: zeroAddress,
        reserveId: '',
        rateNoFee: new BN(0),
        rateOnlyNetworkFee: new BN(0),
        isPaying: false
    }

    reserveArr = Object.values(reserves);
    if (src == dest || reserveArr.length == 0) {
        return bestReserveData;
    }
    for (let i=0; i < reserveArr.length; i++) {
        reserve = reserveArr[i];
        if (reserve.rate.gt(bestReserveData.rateOnlyNetworkFee)) {
            bestReserveData.address = reserve.address;
            bestReserveData.reserveId = reserve.reserveId;
            bestReserveData.rateNoFee = reserve.rate;
            bestReserveData.isFeePaying = reserve.isFeePaying;
            bestReserveData.rateOnlyNetworkFee = (reserve.isFeePaying) ? reserve.rate.mul(BPS.sub(networkFeeBps)).div(BPS) : reserve.rate;
        }
    }
    return bestReserveData;
}

//masking will select half if number not specified
//split will divide BPS equally if values not specified.
module.exports.applyHintToReserves = applyHintToReserves;
function applyHintToReserves(tradeType, reserves, numReserves, splitValues) {
    let result = {
        'tradeType': tradeType,
        'reservesForHint': [],
        'reservesForFetchRate': [],
        'splits': []
    }
    if (tradeType == EMPTY_HINTTYPE) {
        numReserves = reserves.length;
        for (let i=0; i < numReserves; i++) {
            reserve = reserves[i];
            result.reservesForHint.push(reserve.reserveId);
            result.reservesForFetchRate.push(reserve);
        }
    } else if (tradeType == MASK_IN_HINTTYPE) {
        if (numReserves == undefined) numReserves = Math.floor(reserves.length/2);
        for (let i=0; i < numReserves; i++) {
            reserve = reserves[i];
            result.reservesForHint.push(reserve.reserveId);
            result.reservesForFetchRate.push(reserve);
        }
    } else if (tradeType == MASK_OUT_HINTTYPE) {
        if (numReserves == undefined) numReserves = Math.floor(reserves.length/2);

        for (let i=0; i < numReserves; i++) {
            reserve = reserves[i];
            result.reservesForHint.push(reserve.reserveId);
        }

        for (let i = numReserves; i < reserves.length; i++) {
            reserve = reserves[i];
            result.reservesForFetchRate.push(reserve);
        }
    } else {
        if (splitValues == undefined) {
            if (numReserves == undefined) {numReserves = reserves.length};
            // else its user requested num reserves
        } else {
            numReserves = splitValues.length;
        }

        for (let i=0; i < numReserves; i++) {
            reserve = reserves[i];
            result.reservesForHint.push(reserve.reserveId);
            result.reservesForFetchRate.push(reserve);
        }

        //store splits
        bpsAmtSoFar = new BN(0);
        for (i=0; i < numReserves; i++) {
            if (splitValues == undefined) {
                splitValue = i == (numReserves - 1) ? BPS.sub(bpsAmtSoFar) : BPS.div(new BN(reserves.length));
            } else {
                splitValue = splitValues[i];
            }
            bpsAmtSoFar = bpsAmtSoFar.add(splitValue);
            result.splits.push(splitValue);
        }
    }

    return result;
}

module.exports.getHint = getHint;
async function getHint(network, tradeLogic, reserveInstances, hintType, numReserves, srcAdd, destAdd, qty) {
    if (hintType == EMPTY_HINTTYPE) return emptyHint;
    
    let reserveCandidates;
    let hintedReservese2t;
    let hintedReservest2e;
    let hint;

    if(srcAdd != ethAddress) {
        reserveCandidates = await fetchReservesRatesFromNetwork(network, reserveInstances, srcAdd, qty, true);
        hintedReservest2e = applyHintToReserves(hintType, reserveCandidates, numReserves);
        if(destAdd == ethAddress) {
            return (await tradeLogic.buildTokenToEthHint(
                hintedReservest2e.tradeType, hintedReservest2e.reservesForHint, hintedReservest2e.splits));
        }
    }
    
    if(destAdd != ethAddress) {
        reserveCandidates = await fetchReservesRatesFromNetwork(network, reserveInstances, destAdd, qty, false);
        hintedReservese2t = applyHintToReserves(hintType, reserveCandidates, numReserves);

        if(srcAdd == ethAddress) {
            return (await tradeLogic.buildEthToTokenHint(
                hintedReservese2t.tradeType, hintedReservese2t.reservesForHint, hintedReservese2t.splits));
        }
    }

    hint = await tradeLogic.buildTokenToTokenHint(
        hintedReservest2e.tradeType, hintedReservest2e.reservesForHint, hintedReservest2e.splits,
        hintedReservese2t.tradeType, hintedReservese2t.reservesForHint, hintedReservese2t.splits
    );
    
    return hint;
}

module.exports.minusNetworkFees = minusNetworkFees;
function minusNetworkFees(weiAmt, buyReserveFeePaying, sellReserveFeePaying, networkFeeBps) {
    result = weiAmt;
    networkFee = weiAmt.mul(networkFeeBps).div(BPS);
    if (buyReserveFeePaying) {
        result = result.sub(networkFee);
    }
    if (sellReserveFeePaying) {
        result = result.sub(networkFee);
    }
    return result;
}

module.exports.randomSelectReserves = randomSelectReserves;
function randomSelectReserves(tradeType, reserves, splits) {
    result = {
        'tradeType': tradeType,
        'reserves': [],
        'splits': []
    }

    //randomly include / exclude reserves
    for (i=0; i<reserves.length; i++) {
        if (Math.random() >= 0.5) {
            result.reserves.push(reserves[i]);
        }
    }

    if (tradeType == SPLIT_HINTTYPE) {
        //store splits
        bpsAmtSoFar = new BN(0);
        for (i=0; i<result.reserves.length; i++) {
            //generate some BPS value
            splitValue = i == (result.reserves.length - 1) ? BPS.sub(bpsAmtSoFar) : new BN(getRandomInt(1,BPS.div(new BN(result.reserves.length))));
            bpsAmtSoFar.add(splitValue);
            splits.push(splitValue);
        }
    }
    return result;
}

module.exports.unpackRatesAndAmounts = unpackRatesAndAmounts;
function unpackRatesAndAmounts(info, srcDecimals, destDecimals, calcRatesAndAmountsOutput) {
    let srcQty = info[0];
    let networkFeeBps = info[1];
    let platformFeeBps = info[2];

    let t2eNumReserves = calcRatesAndAmountsOutput.results[0];
    let tradeWei = calcRatesAndAmountsOutput.results[1];
    let feePayingReservesBps = calcRatesAndAmountsOutput.results[3];

    result = {
        'tradeWei': tradeWei,
        'numFeePayingReserves': calcRatesAndAmountsOutput.results[2],
        'feePayingReservesBps': calcRatesAndAmountsOutput.results[3],
        'destAmountNoFee': calcRatesAndAmountsOutput.results[4],
        'destAmountWithNetworkFee': calcRatesAndAmountsOutput.results[5],
        'actualDestAmount': calcRatesAndAmountsOutput.results[6],
        'rateNoFees': calcRateFromQty(srcQty, calcRatesAndAmountsOutput.results[4], srcDecimals, destDecimals),
        'rateAfterNetworkFees': calcRateFromQty(srcQty, calcRatesAndAmountsOutput.results[5], srcDecimals, destDecimals),
        'rateAfterAllFees': calcRateFromQty(srcQty, calcRatesAndAmountsOutput.results[6], srcDecimals, destDecimals),
        't2eAddresses': calcRatesAndAmountsOutput.reserveAddresses.slice(0,t2eNumReserves),
        't2eRates': calcRatesAndAmountsOutput.rates.slice(0,t2eNumReserves),
        't2eSplits': calcRatesAndAmountsOutput.splitValuesBps.slice(0,t2eNumReserves),
        't2eIsFeePaying': calcRatesAndAmountsOutput.isFeePaying.slice(0,t2eNumReserves),
        't2eIds': calcRatesAndAmountsOutput.ids.slice(0,t2eNumReserves),
        'e2tAddresses': calcRatesAndAmountsOutput.reserveAddresses.slice(t2eNumReserves),
        'e2tRates': calcRatesAndAmountsOutput.rates.slice(t2eNumReserves),
        'e2tSplits': calcRatesAndAmountsOutput.splitValuesBps.slice(t2eNumReserves),
        'e2tIsFeePaying': calcRatesAndAmountsOutput.isFeePaying.slice(t2eNumReserves),
        'e2tIds': calcRatesAndAmountsOutput.ids.slice(t2eNumReserves),
        'networkFeeWei': tradeWei.mul(networkFeeBps).mul(feePayingReservesBps).div(BPS).div(BPS),
        'platformFeeWei': tradeWei.mul(platformFeeBps).div(BPS)
    }
    return result;
}

module.exports.assertRatesEqual = assertRatesEqual;
function assertRatesEqual(expectedRates, actualRates) {
    assertEqual(expectedRates.rateNoFees, actualRates.rateNoFees, "rate no fees not equal");
    assertEqual(expectedRates.rateAfterNetworkFees, actualRates.rateAfterNetworkFees, "rate after network fees not equal");
    assertEqual(expectedRates.rateAfterAllFees, actualRates.rateAfterAllFees, "rate after all fees not equal");
}

module.exports.getReserveBalances = getReserveBalances;
async function getReserveBalances(srcToken, destToken, ratesAmts) {
    let reserveBalances = {
        't2eEth': [], //expect ETH balance to decrease
        't2eToken': [], //expect src token balance to increase
        'e2tEth': [], //expect ETH balance to increase
        'e2tToken': [] //expect dest token balance to decrease
    }
    for (let i=0; i< ratesAmts.t2eAddresses.length; i++) {
        let reserveAddress = ratesAmts.t2eAddresses[i];
        let reserveBalance = await getBalancePromise(reserveAddress);
        reserveBalances.t2eEth.push(reserveBalance);
        if (srcToken != ethAddress) {
            reserveBalance = await srcToken.balanceOf(reserveAddress);
            reserveBalances.t2eToken.push(reserveBalance);
        }
    }

    for (i=0; i< ratesAmts.e2tAddresses.length; i++) {
        let reserveAddress = ratesAmts.e2tAddresses[i];
        let reserveBalance = await getBalancePromise(reserveAddress);
        reserveBalances.e2tEth.push(reserveBalance);
        if (destToken != ethAddress) {
            reserveBalance = await destToken.balanceOf(reserveAddress);
            reserveBalances.e2tToken.push(reserveBalance);
        }
    }
    return reserveBalances;
}

module.exports.getTakerBalances = getTakerBalances;
async function getTakerBalances(srcToken, destToken, taker, proxy) {
    let takerBalances = {
        'src': zeroBN,
        'dest': zeroBN
    }
    if (proxy == undefined) proxy = taker;
    takerBalances.src = (srcToken == ethAddress) ? await getBalancePromise(proxy) : await srcToken.balanceOf(proxy);
    takerBalances.dest = (destToken == ethAddress) ? await getBalancePromise(taker) : await destToken.balanceOf(taker);
    return takerBalances;
}

module.exports.compareBalancesAfterTrade = compareBalancesAfterTrade;
async function compareBalancesAfterTrade(srcToken, destToken, srcQty, initialReserveBalances, initialTakerBalances, ratesAmts, taker, networkAdd) {
    let expectedTakerBalance;
    let expectedReserveBalance;
    let reserveAddress;
    let expectedDestChange;
    let splitAmount;
    let amountSoFar = zeroBN;
    let srcDecimals = (srcToken == ethAddress) ? ethDecimals : await srcToken.decimals();
    let destDecimals = (destToken == ethAddress) ? ethDecimals : await destToken.decimals();
    networkAdd = (networkAdd == undefined) ? taker : networkAdd;

    if (destToken == ethAddress) {
        //token -> ETH trade
        //user: minus srcQty (token), plus actualDestAmt (ETH)
        expectedTakerBalance = initialTakerBalances.src.sub(srcQty);
        await Helper.assertSameTokenBalance(networkAdd, srcToken, expectedTakerBalance);
        expectedTakerBalance = initialTakerBalances.dest.add(ratesAmts.actualDestAmount);
        actualBalance = await Helper.getBalancePromise(taker);
        await Helper.assertSameEtherBalance(taker, expectedTakerBalance);

        //Reserves: plus split dest amt (srcToken), minus split src amt based on rate (ETH)
        for (let i=0; i<ratesAmts.t2eAddresses.length; i++) {
            reserveAddress = ratesAmts.t2eAddresses[i];
            splitAmount = (i == ratesAmts.t2eAddresses.length - 1) ?
                (srcQty.sub(amountSoFar)) : ratesAmts.t2eSplits[i].mul(srcQty).div(BPS);
            amountSoFar = amountSoFar.add(splitAmount);
            //plus split amount (token)
            expectedReserveBalance = initialReserveBalances.t2eToken[i].add(splitAmount);
            await Helper.assertSameTokenBalance(reserveAddress, srcToken, expectedReserveBalance);
            //minus split dest amount (ETH)
            expectedDestChange = Helper.calcDstQty(splitAmount, srcDecimals, destDecimals, ratesAmts.t2eRates[i]);
            expectedReserveBalance = initialReserveBalances.t2eEth[i].sub(expectedDestChange);
            await Helper.assertSameEtherBalance(reserveAddress, expectedReserveBalance);
        }
    } else if (srcToken == ethAddress) {
        //ETH -> token trade
        //User: Minus srcQty (ETH), plus expectedDestAmtAfterAllFees (token)
        //Issue: Sender has to pay network fee, so ETH calculation is a lil difficult
        // expectedTakerBalance = initialTakerBalances.src.sub(srcQty);
        // await Helper.assertSameEtherBalance(taker, expectedTakerBalance);

        expectedTakerBalance = initialTakerBalances.dest.add(ratesAmts.actualDestAmount);
        let actualTokenBal = await destToken.balanceOf(taker);
        await Helper.assertSameTokenBalance(taker, destToken, expectedTakerBalance);

        //Reserves: Minus expectedDestAmtAfterAllFees (ETH), Plus destAmtAfterNetworkFees (token)
        for (let i=0; i<ratesAmts.e2tAddresses.length; i++) {
            reserveAddress = ratesAmts.e2tAddresses[i];
            splitAmount = (i == ratesAmts.e2tAddresses.length - 1) ?
                ratesAmts.tradeWei.sub(ratesAmts.networkFeeWei).sub(ratesAmts.platformFeeWei).sub(amountSoFar) :
                ratesAmts.e2tSplits[i].mul(ratesAmts.tradeWei.sub(ratesAmts.networkFeeWei).sub(ratesAmts.platformFeeWei)).div(BPS);
            amountSoFar = amountSoFar.add(splitAmount);
            //plus split amount (ETH)
            expectedReserveBalance = initialReserveBalances.e2tEth[i].add(splitAmount);
            await Helper.assertSameEtherBalance(reserveAddress, expectedReserveBalance);
            //minus split amount (token)
            expectedDestChange = Helper.calcDstQty(splitAmount, srcDecimals, destDecimals, ratesAmts.e2tRates[i]);
            expectedReserveBalance = initialReserveBalances.e2tToken[i].sub(expectedDestChange);
            await Helper.assertSameTokenBalance(reserveAddress, destToken, expectedReserveBalance);
        }
    } else {
        //user: minus srcQty (srcToken), plus actualDestAmount (destToken)
        expectedTakerBalance = initialTakerBalances.src.sub(srcQty);
        await Helper.assertSameTokenBalance(networkAdd, srcToken, expectedTakerBalance);
        expectedTakerBalance = initialTakerBalances.dest.add(ratesAmts.actualDestAmount);
        await Helper.assertSameTokenBalance(taker, destToken, expectedTakerBalance);

        //Reserves: plus split dest amt (srcToken), minus split src amt based on rate (ETH)
        for (let i=0; i<ratesAmts.t2eAddresses.length; i++) {
            reserveAddress = ratesAmts.t2eAddresses[i];
            splitAmount = (i == ratesAmts.t2eAddresses.length - 1) ?
                (srcQty.sub(amountSoFar)) : ratesAmts.t2eSplits[i].mul(srcQty).div(BPS);
            amountSoFar = amountSoFar.add(splitAmount);
            //plus split amount (token)
            expectedReserveBalance = initialReserveBalances.t2eToken[i].add(splitAmount);
            await Helper.assertSameTokenBalance(reserveAddress, srcToken, expectedReserveBalance);
            //minus split dest amount (ETH)
            expectedDestChange = Helper.calcDstQty(splitAmount, srcDecimals, ethDecimals, ratesAmts.t2eRates[i]);
            expectedReserveBalance = initialReserveBalances.t2eEth[i].sub(expectedDestChange);

            //if reserve is used later for E2T, actual ETH balance will be checked later
            let index = ratesAmts.e2tAddresses.findIndex((address) => (address == reserveAddress));
            if (index != -1) {
                initialReserveBalances.e2tEth[index] = expectedReserveBalance;
            } else {
                await Helper.assertSameEtherBalance(reserveAddress, expectedReserveBalance);
            }
        }

        //reset amountSoFar
        amountSoFar = zeroBN;

        //e2tReserves: minus split expectedDestAmtAfterAllFee (ETH), plus split dest amt (destToken)
        for (let i=0; i<ratesAmts.e2tAddresses.length; i++) {
            reserveAddress = ratesAmts.e2tAddresses[i];
            splitAmount = (i == ratesAmts.e2tAddresses.length - 1) ?
                ratesAmts.tradeWei.sub(ratesAmts.networkFeeWei).sub(ratesAmts.platformFeeWei).sub(amountSoFar) :
                ratesAmts.e2tSplits[i].mul(ratesAmts.tradeWei.sub(ratesAmts.networkFeeWei).sub(ratesAmts.platformFeeWei)).div(BPS);
            amountSoFar = amountSoFar.add(splitAmount);
            //plus split amount (ETH)
            expectedReserveBalance = initialReserveBalances.e2tEth[i].add(splitAmount);
            await Helper.assertSameEtherBalance(reserveAddress, expectedReserveBalance);
            //minus split amount (token)
            expectedDestChange = Helper.calcDstQty(splitAmount, ethDecimals, destDecimals, ratesAmts.e2tRates[i]);
            expectedReserveBalance = initialReserveBalances.e2tToken[i].sub(expectedDestChange);
            await Helper.assertSameTokenBalance(reserveAddress, destToken, expectedReserveBalance);
        }
    }
}