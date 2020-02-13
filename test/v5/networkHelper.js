const BN = web3.utils.BN;
const Helper = require("../v4/helper.js");

const Reserve = artifacts.require("KyberReserve.sol");
const ConversionRates = artifacts.require("ConversionRates.sol");
const MockReserve = artifacts.require("MockReserve.sol");

require("chai")
    .use(require("chai-as-promised"))
    .use(require("chai-bn")(BN))
    .should();


const {BPS, precisionUnits, ethAddress, zeroAddress, emptyHint}  = require("../v4/helper.js")

//// reserve types
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

module.exports = {APR_ID, BRIDGE_ID, MOCK_ID, FPR_ID, type_apr, type_fpr, type_MOCK, 
    MASK_IN_HINTTYPE, MASK_OUT_HINTTYPE, SPLIT_HINTTYPE, EMPTY_HINTTYPE};
    
    
module.exports.setupReserves = async function 
    (network, tokens, numMock, numFpr, numEnhancedFpr, numApr, accounts, admin, operator) {
    let result = {
        'numAddedReserves': numMock * 1 + numFpr * 1 + numEnhancedFpr * 1 + numApr * 1,
        'reserveInstances': {} 
    }

    let i;
    let ethSenderIndex = 1;
    let ethInit = (new BN(10)).pow(new BN(19)).mul(new BN(8)); 
    
    // setup mock reserves
    //////////////////////
    for (i=0; i < numMock; i++) {
        reserve = await MockReserve.new();
        result.reserveInstances[reserve.address] = {
            'address': reserve.address,
            'instance': reserve,
            'reserveId': genReserveID(MOCK_ID, reserve.address),
            'isFeePaying': true,
            'rate': new BN(0),
            'type': type_MOCK,
            'pricing': "none"
        }

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
        
        result.reserveInstances[reserve.address] = {
            'address': reserve.address,
            'instance': reserve,
            'reserveId': genReserveID(FPR_ID, reserve.address),
            'isFeePaying': true,
            'rate': new BN(0),
            'type': type_fpr,
            'pricing': pricing.address
        }
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
        networkInstance.addReserve(reserve.address, reserve.reserveId, reserve.isFeePaying, reserve.address, {from: operator});
        for (let j = 0; j < tokens.length; j++) {
            networkInstance.listPairForReserve(reserve.address, tokens[j].address, true, true, true, {from: operator});
        }
    }
}

module.exports.removeReservesFromNetwork = async function (networkInstance, reserveInstances, tokens, operator) {
    for (const [key, value] of Object.entries(reserveInstances)) {
        reserve = value;
        console.log("removing reserve type: " + reserve.type + " address: " + reserve.address + " pricing: " + reserve.pricing);
        for (let j = 0; j < tokens.length; j++) {
            networkInstance.listPairForReserve(reserve.address, tokens[j].address, true, true, false, {from: operator});
        }
        networkInstance.rmReserve(reserve.address, {from: operator});
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

module.exports.getBestReserveAndRate = async function (reserves, src, dest, srcAmount, takerFeeBps) {
    bestReserveData = {
        address: zeroAddress,
        rateNoFee: new BN(0),
        rateWithNetworkFee: new BN(0),
        isPaying: false
    }

    reserveArr = Object.values(reserves);
    if (src == dest || reserveArr.length == 0) {
        return bestReserveData;
    }
    for (let i=0; i < reserveArr.length; i++) {
        reserve = reserveArr[i];
        if (reserve.rate.gt(bestReserveData.rateWithNetworkFee)) {
            bestReserveData.address = reserve.address;
            bestReserveData.rateNoFee = reserve.rate;
            bestReserveData.isFeePaying = reserve.isFeePaying;
            bestReserveData.rateWithNetworkFee = (reserve.isFeePaying) ? reserve.rate.mul(BPS.sub(takerFeeBps)).div(BPS) : reserve.rate;
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

    if (tradeType == MASK_IN_HINTTYPE) {
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

module.exports.getHint = getHint;

module.exports.minusNetworkFees = function (weiAmt, buyReserveFeePaying, sellReserveFeePaying, takerFeeBps) {
    result = weiAmt;
    networkFee = weiAmt.mul(takerFeeBps).div(BPS);
    if (buyReserveFeePaying) {
        result = result.sub(networkFee);
    }
    if (sellReserveFeePaying) {
        result = result.sub(networkFee);
    }
    return result;
}

module.exports.randomSelectReserves = function (tradeType, reserves, splits) {
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
