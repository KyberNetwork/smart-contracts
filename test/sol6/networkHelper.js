const BN = web3.utils.BN;
const Helper = require("../helper.js");

const Reserve = artifacts.require("KyberReserve.sol");
const ConversionRates = artifacts.require("ConversionRates.sol");
const MatchingEngine = artifacts.require("KyberMatchingEngine.sol");
const KyberHistory = artifacts.require("KyberHistory.sol");
const KyberStorage = artifacts.require("KyberStorage.sol");
const FeeHandler = artifacts.require("KyberFeeHandler.sol");
const MockReserve = artifacts.require("MockReserve.sol");
const LiquidityConversionRates = artifacts.require("LiquidityConversionRates.sol");
const StrictValidatingReserve = artifacts.require("StrictValidatingReserve.sol");
const TempBank = artifacts.require("TempBank.sol");

require("chai")
    .use(require("chai-as-promised"))
    .use(require("chai-bn")(BN))
    .should();


const {BPS, precisionUnits, ethDecimals, ethAddress, zeroAddress, emptyHint, zeroBN,
    calcRateFromQty, assertEqual, getBalancePromise}  = require("../helper.js")

//// reserve types
const NULL_ID = '0x0000000000000000';
const APR_ID = '0xaa000000';
const BRIDGE_ID  = '0xbb000000';
const MOCK_ID  = '0x22000000';
const FPR_ID = '0xff000000';
const ZERO_RESERVE_ID = "0x" + "0".repeat(64);

const type_apr = "TYPE_APR";
const type_MOCK = "TYPE_MOCK";
const type_fpr = "TYPE_FPR";

const BEST_OF_ALL_HINTTYPE = 0;
const MASK_IN_HINTTYPE = 1;
const MASK_OUT_HINTTYPE = 2;
const SPLIT_HINTTYPE = 3;

const ReserveType = {NONE: 0, FPR: 1, APR: 2, BRIDGE: 3, UTILITY: 4, CUSTOM: 5, ORDERBOOK: 6};

//global variables
//////////////////
const gasPrice = (new BN(10).pow(new BN(9)).mul(new BN(50)));
const negligibleRateDiffBps = new BN(10); //0.01%;
const burnBlockInterval = new BN(30);

module.exports = {NULL_ID, APR_ID, BRIDGE_ID, MOCK_ID, FPR_ID, ZERO_RESERVE_ID, type_apr, type_fpr, type_MOCK,
    MASK_IN_HINTTYPE, MASK_OUT_HINTTYPE, SPLIT_HINTTYPE, BEST_OF_ALL_HINTTYPE, ReserveType};

module.exports.setupStorage = setupStorage;
async function setupStorage(admin) {
    let networkHistory = await KyberHistory.new(admin);
    let feeHandlerHistory = await KyberHistory.new(admin);
    let kyberDaoHistory = await KyberHistory.new(admin);
    let matchingEngineHistory = await KyberHistory.new(admin);
    kyberStorage = await KyberStorage.new(
        admin,
        networkHistory.address,
        feeHandlerHistory.address,
        kyberDaoHistory.address,
        matchingEngineHistory.address
        );
    await networkHistory.setStorageContract(kyberStorage.address, {from: admin});
    await feeHandlerHistory.setStorageContract(kyberStorage.address, {from: admin});
    await kyberDaoHistory.setStorageContract(kyberStorage.address, {from: admin});
    await matchingEngineHistory.setStorageContract(kyberStorage.address, {from: admin});
    return kyberStorage;
}

module.exports.setupReserves = setupReserves;
async function setupReserves
    (network, tokens, numMock, numFpr, numEnhancedFpr, numApr, accounts, admin, operator, rebateWallets) {
    let result = {
        'numAddedReserves': numMock * 1 + numFpr * 1 + numEnhancedFpr * 1 + numApr * 1,
        'reserveInstances': {},
        'reserveIdToRebateWallet' : {}
    }

    let i;
    let ethSenderIndex = 1;
    let ethInit = (new BN(10)).pow(new BN(19)).mul(new BN(20));

    // setup mock reserves
    //////////////////////
    for (i=0; i < numMock; i++) {
        reserve = await MockReserve.new();
        let reserveId = (genReserveID(MOCK_ID, reserve.address)).toLowerCase();
        let rebateWallet;
        if (rebateWallets == undefined || rebateWallets.length < i * 1 - 1 * 1) {
            rebateWallet = reserve.address;
        } else {
            rebateWallet = rebateWallets[i];
        }

        result.reserveInstances[reserveId] = {
            'address': reserve.address,
            'instance': reserve,
            'reserveId': reserveId,
            'onChainType': ReserveType.CUSTOM,
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
            //set rates and send tokens
            await reserve.setRate(token.address, tokensPerEther, ethersPerToken);
            let initialTokenAmount = new BN(2000000).mul(new BN(10).pow(new BN(await token.decimals())));
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
            rebateWallet = reserve.address;
        } else {
            rebateWallet = rebateWallets[i];
        }

        result.reserveInstances[reserveId] = {
            'address': reserve.address,
            'instance': reserve,
            'reserveId': reserveId,
            'onChainType': ReserveType.FPR,
            'rate': new BN(0),
            'type': type_fpr,
            'pricing': pricing.address,
            'rebateWallet': rebateWallet
        }

        result.reserveIdToRebateWallet[reserveId] = rebateWallet;
    }

    for (i = 0; i < numApr; i++) {
        p0 = 1 / ((i + 1) * 10);
        let token = tokens[i % tokens.length];
        let pricing = await setupAprPricing(token, p0, admin, operator);
        let reserve = await setupAprReserve(network, token, accounts[ethSenderIndex++], pricing.address, ethInit, admin, operator);
        await pricing.setReserveAddress(reserve.address, {from: admin});
        let reserveId = (genReserveID(APR_ID, reserve.address)).toLowerCase();
        let rebateWallet;
        if (rebateWallets == undefined || rebateWallets.length < i * 1 - 1 * 1) {
            rebateWallet = reserve.address;
        } else {
            rebateWallet = rebateWallets[i];
        }

        result.reserveInstances[reserveId] = {
            'address': reserve.address,
            'instance': reserve,
            'reserveId': reserveId,
            'onChainType': ReserveType.APR,
            'rate': new BN(0),
            'type': type_apr,
            'pricing': pricing.address,
            'rebateWallet': rebateWallet
        }
        result.reserveIdToRebateWallet[reserveId] = rebateWallet;
    }

    return result;
}

module.exports.setNetworkForReserve = setNetworkForReserve;
async function setNetworkForReserve(reserveInstances, networkAddress, admin) {
    for (const [key, reserve] of Object.entries(reserveInstances)) {
        if ((reserve.type == type_fpr) || (reserve.type == type_apr)) {
            await reserve.instance.setContracts(networkAddress, reserve.pricing, zeroAddress, {from: admin});
        }
    }
}

module.exports.listTokenForRedeployNetwork = listTokenForRedeployNetwork;
async function listTokenForRedeployNetwork(storageInstance, reserveInstances, tokens, operator) {
    for (const [key, reserve] of Object.entries(reserveInstances)) {
        for (let j = 0; j < tokens.length; j++) {
            await storageInstance.listPairForReserve(reserve.reserveId, tokens[j].address, true, true, true, {from: operator});
        }
    }
}

module.exports.setupNetwork = setupNetwork;
async function setupNetwork
    (NetworkArtifact, networkProxyAddress, KNCAddress, kyberDaoAddress, admin, operator) {
    const storage =  await setupStorage(admin);
    const network = await NetworkArtifact.new(admin, storage.address);
    await storage.setNetworkContract(network.address, {from: admin});
    await storage.addOperator(operator, {from: admin});
    await network.addOperator(operator, { from: admin });
    //init matchingEngine, feeHandler
    const matchingEngine = await MatchingEngine.new(admin);
    await matchingEngine.setNetworkContract(network.address, { from: admin });
    await matchingEngine.setKyberStorage(storage.address, {from : admin});
    await storage.setFeeAccountedPerReserveType(true, true, true, false, true, true, { from: admin });
    await storage.setEntitledRebatePerReserveType(true, false, true, false, true, true, {from: admin});

    let feeHandler = await FeeHandler.new(admin, network.address, network.address, KNCAddress, burnBlockInterval, admin);
    feeHandler.setDaoContract(kyberDaoAddress, {from: admin});
    await network.setContracts(feeHandler.address, matchingEngine.address, zeroAddress, { from: admin });
    // set KyberDao contract
    await network.setKyberDaoContract(kyberDaoAddress, { from: admin });
    // point proxy to network
    await network.addKyberProxy(networkProxyAddress, { from: admin });
    //set params, enable network
    await network.setParams(gasPrice, negligibleRateDiffBps, { from: admin });
    await network.setEnable(true, { from: admin });
    return [network, storage];
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

module.exports.setupAprReserve = setupAprReserve;
async function setupAprReserve (network, token, ethSender, pricingAdd, ethInit, admin, operator) {
    //setup reserve
    let bank = await TempBank.new();
    let reserve = await StrictValidatingReserve.new(network.address, pricingAdd, admin);
    await reserve.setBank(bank.address);
    await reserve.addOperator(operator, {from: admin});
    await reserve.addAlerter(operator, {from: admin});

    //set reserve balance. 10**18 wei ether + per token 10**18 wei ether value according to base rate.
    await Helper.sendEtherWithPromise(ethSender, reserve.address, ethInit);
    await Helper.assertSameEtherBalance(reserve.address, ethInit);
    //reserve related setup
    await reserve.approveWithdrawAddress(token.address, ethSender, true, {from: admin});

    let initialTokenAmount = new BN(200000).mul(new BN(10).pow(new BN(await token.decimals())));
    await token.transfer(reserve.address, initialTokenAmount);
    await Helper.assertSameTokenBalance(reserve.address, token, initialTokenAmount);

    return reserve;
}

const r = 0.0069315;
let feePercent = 0.25;
const maxCapBuyInEth = 100;
const maxCapSellInEth = 100;
const pMinRatio = 0.1;
const pMaxRatio = 10.0;
const maxAllowance = new BN(2).pow(new BN(255));

//default value
const precision = new BN(10).pow(new BN(18));
const formulaPrecisionBits = 40;
const formulaPrecision = new BN(2).pow(new BN(formulaPrecisionBits));
const ethPrecission = new BN(10).pow(new BN(ethDecimals));

module.exports.setupAprPricing = setupAprPricing;
async function setupAprPricing(token, p0, admin, operator) {
    let pricing = await LiquidityConversionRates.new(admin, token.address);
    await pricing.addOperator(operator, {from: admin});
    await pricing.addAlerter(operator, {from: admin});

    let tokenDecimals = await token.decimals();
    const tokenPrecision = new BN(10).pow(new BN(tokenDecimals));

    const baseNumber = 10 ** 9
    const pMin = p0 * pMinRatio
    const pMax = p0 * pMaxRatio

    const feeInBps = feePercent * 100;
    const rInFp = new BN(r * baseNumber).mul(formulaPrecision).div(new BN(baseNumber));
    const pMinInFp = new BN(pMin * baseNumber).mul(formulaPrecision).div(new BN(baseNumber));
    let maxCapBuyInWei = new BN(maxCapBuyInEth).mul(precision);
    let maxCapSellInWei = new BN(maxCapSellInEth).mul(precision);
    const maxSellRateInPrecision = new BN(pMax * baseNumber).mul(precision).div(new BN(baseNumber));
    const minSellRateInPrecision = new BN(pMin * baseNumber).mul(precision).div(new BN(baseNumber));

    await pricing.setLiquidityParams(
        rInFp,
        pMinInFp,
        formulaPrecisionBits,
        maxCapBuyInWei,
        maxCapSellInWei,
        feeInBps,
        maxSellRateInPrecision,
        minSellRateInPrecision,
        {from: admin}
    );
    return pricing;
}

module.exports.setupBadReserve = setupBadReserve;
async function setupBadReserve(BadReserveArtifact, accounts, tokens) {
    let result = {}
    badReserve = await BadReserveArtifact.new();
    badReserveId = genReserveID(MOCK_ID, badReserve.address);
    result[badReserveId] = {
        'address': badReserve.address,
        'instance': badReserve,
        'reserveId': badReserveId,
        'onChainType': ReserveType.CUSTOM,
        'rate': zeroBN,
        'type': type_MOCK,
        'pricing': "none",
        'rebateWallet': badReserve.address
    }

    // send ETH and tokens
    let ethSender = accounts[4];
    let ethInit = (new BN(10)).pow(new BN(19)).mul(new BN(20));
    await Helper.sendEtherWithPromise(ethSender, badReserve.address, ethInit);
    await Helper.assertSameEtherBalance(badReserve.address, ethInit);

    for (let j = 0; j < tokens.length; ++j) {
        let token = tokens[j];
        let initialTokenAmount = new BN(200000).mul(new BN(10).pow(new BN(await token.decimals())));
        await token.transfer(badReserve.address, initialTokenAmount);
        await Helper.assertSameTokenBalance(badReserve.address, token, initialTokenAmount);
        await badReserve.setRate(token.address, precisionUnits.mul(new BN(10)));
    }
    return result;
}

module.exports.addReservesToStorage = addReservesToStorage;
async function addReservesToStorage(storageInstance, reserveInstances, tokens, operator) {
    for (const [key, value] of Object.entries(reserveInstances)) {
        reserve = value;
        console.log("add reserve type: " + reserve.type + " ID: " + reserve.reserveId);
        let rebateWallet = (reserve.rebateWallet == zeroAddress || reserve.rebateWallet == undefined)
             ? reserve.address : reserve.rebateWallet;
        await storageInstance.addReserve(reserve.address, reserve.reserveId, reserve.onChainType, rebateWallet, {from: operator});
        for (let j = 0; j < tokens.length; j++) {
            await storageInstance.listPairForReserve(reserve.reserveId, tokens[j].address, true, true, true, {from: operator});
        }
    }
}

module.exports.getTradeEventArgs = function(tradeTx) {
    let result = {}

    for (let event of tradeTx.logs) {
        if(event.event == 'KyberTrade') {
            result['t2eIds'] = event.args.t2eIds;
            result['e2tIds'] = event.args.e2tIds;
            result['ethWeiValue'] = event.args.ethWeiValue;
            return result;
        }
    }
}

module.exports.removeReservesFromStorage = async function (storageInstance, reserveInstances, tokens, operator) {
    for (const [key, value] of Object.entries(reserveInstances)) {
        reserve = value;
        console.log("removing reserve type: " + reserve.type + " address: " + reserve.address + " pricing: " + reserve.pricing);
        for (let j = 0; j < tokens.length; j++) {
            await storageInstance.listPairForReserve(reserve.reserveId, tokens[j].address, true, true, false, {from: operator});
        }
        await storageInstance.removeReserve(reserve.reserveId, 0, {from: operator});
    }
}

module.exports.genReserveID = genReserveID;
function genReserveID(reserveID, reserveAddress) {
    return reserveID + reserveAddress.substring(2,20) + "0".repeat(38);
}


module.exports.fetchReservesRatesFromNetwork = fetchReservesRatesFromNetwork;
async function fetchReservesRatesFromNetwork(rateHelper, reserveInstances, tokenAddress, qty, isTokenToEth) {
    reservesArray = [];
    //sell
    if (isTokenToEth) {
        result = await rateHelper.getPricesForToken(tokenAddress, 0, qty);
        reserves = result.sellReserves;
        rates = result.sellRates;
    //buy
    } else {
        result = await rateHelper.getPricesForToken(tokenAddress, qty, 0);
        reserves = result.buyReserves;
        rates = result.buyRates;
    }

    for (i=0; i<reserves.length; i++) {
        reserveID = reserves[i];
        //deep copy the object to avoid assign buy and sell rate to the same object
        reserve = Object.assign({}, reserveInstances[reserveID]);
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
        let rateForComparison = (reserve.isFeePaying) ? reserve.rate.mul(BPS.sub(networkFeeBps)).div(BPS) : reserve.rate;
        if (rateForComparison.gt(bestReserveData.rateOnlyNetworkFee)) {
            bestReserveData.address = reserve.address;
            bestReserveData.reserveId = reserve.reserveId;
            bestReserveData.rateNoFee = reserve.rate;
            bestReserveData.isFeePaying = reserve.isFeePaying;
            bestReserveData.rateOnlyNetworkFee = rateForComparison;
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

    if (tradeType == BEST_OF_ALL_HINTTYPE) {
        numReserves = reserves.length;
        for (let i=0; i < numReserves; i++) {
            reserve = reserves[i];
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
async function getHint(rateHelper, matchingEngine, reserveInstances, hintType, numReserves, srcAdd, destAdd, qty) {

    let reserveCandidates;
    let hintedReservese2t;
    let hintedReservest2e;
    let hint;

    if(srcAdd != ethAddress) {
        reserveCandidates = await fetchReservesRatesFromNetwork(rateHelper, reserveInstances, srcAdd, qty, true);
        hintedReservest2e = applyHintToReserves(hintType, reserveCandidates, numReserves);
        if(destAdd == ethAddress) {
            return (
                await matchingEngine.buildTokenToEthHint(
                    srcAdd,
                    hintedReservest2e.tradeType,
                    hintedReservest2e.reservesForHint,
                    hintedReservest2e.splits
                )
            );
        }
    }

    if(destAdd != ethAddress) {
        reserveCandidates = await fetchReservesRatesFromNetwork(rateHelper, reserveInstances, destAdd, qty, false);
        hintedReservese2t = applyHintToReserves(hintType, reserveCandidates, numReserves);

        if(srcAdd == ethAddress) {
            return (
                await matchingEngine.buildEthToTokenHint(
                    destAdd,
                    hintedReservese2t.tradeType,
                    hintedReservese2t.reservesForHint,
                    hintedReservese2t.splits
                )
            );
        }
    }

    hint = await matchingEngine.buildTokenToTokenHint(
        srcAdd,
        hintedReservest2e.tradeType,
        hintedReservest2e.reservesForHint,
        hintedReservest2e.splits,
        destAdd,
        hintedReservese2t.tradeType,
        hintedReservese2t.reservesForHint,
        hintedReservese2t.splits
    );

    return hint;
}

module.exports.getWrongHint = getWrongHint;
async function getWrongHint(rateHelper, reserveInstances, hintType, numReserves, srcAdd, destAdd, qty) {
    function buildHint(tradeType, reserveIds, splits) {
        return web3.eth.abi.encodeParameters(
            ['uint8', 'bytes32[]', 'uint256[]'],
            [tradeType, reserveIds, splits]
        );
    }

    let reserveCandidates;
    let hintedReservese2t;
    let hintedReservest2e;
    let t2eHint;
    let e2tHint;

    if(srcAdd != ethAddress) {
        reserveCandidates = await fetchReservesRatesFromNetwork(rateHelper, reserveInstances, srcAdd, qty, true);
        hintedReservest2e = applyHintToReserves(hintType, reserveCandidates, numReserves);

        // Remove all splits of SPLIT
        // Adds splits for other cases
        if (hintType == SPLIT_HINTTYPE) {
            hintedReservest2e.splits = [];
        } else {
            hintedReservest2e.splits.push(5000);
        }

        t2eHint = buildHint(hintedReservest2e.tradeType, hintedReservest2e.reservesForHint, hintedReservest2e.splits);
        if(destAdd == ethAddress) {
            return t2eHint;
        }
    }

    if(destAdd != ethAddress) {
        reserveCandidates = await fetchReservesRatesFromNetwork(rateHelper, reserveInstances, destAdd, qty, false);
        hintedReservese2t = applyHintToReserves(hintType, reserveCandidates, numReserves);

        // Remove all splits of SPLIT
        // Adds splits for other cases
        if (hintType == SPLIT_HINTTYPE) {
            hintedReservese2t.splits = [];
        } else {
            hintedReservese2t.splits.push(5000);
        }

        e2tHint = buildHint(hintedReservese2t.tradeType, hintedReservese2t.reservesForHint, hintedReservese2t.splits);
        if(srcAdd == ethAddress) {
            return e2tHint;
        }
    }

    return web3.eth.abi.encodeParameters(
        ['bytes', 'bytes'],
        [t2eHint, e2tHint]
    );
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

module.exports.getAndCalcRates = getAndCalcRates;
async function getAndCalcRates(matchingEngine, storage, reserveInstances, srcToken, destToken, srcQty,
    srcDecimals, destDecimals,
    networkFeeBps, platformFeeBps, hint)
{

    let result = {
        t2eIds: [],
        t2eAddresses: [],
        t2eRates: [],
        e2tIds: [],
        e2tAddresses: [],
        e2tRates: [],
        t2eSrcAmounts: [],
        e2tSrcAmounts: [],
        t2eDestAmounts: [],
        e2tDestAmounts: [],
        tradeWei: zeroBN,
        networkFeeWei: zeroBN,
        platformFeeWei: zeroBN,
        actualDestAmount: zeroBN,
        rateWithNetworkFee: zeroBN,
        rateWithAllFees: zeroBN,
        feePayingReservesBps: zeroBN,
    };

    let reserves;
    let reserveInstance;
    let blockNum = new BN(await web3.eth.getBlockNumber());
    let feeAccountedBps = [];
    let indexes = [];
    let tmpAmts = [];
    let tmpRates = [];
    let dstQty;
    let actualDestAmount = zeroBN;
    let totalFeePayingReservesBps = zeroBN;

    if (srcToken != ethAddress) {
        reserves = await matchingEngine.getTradingReserves(
            srcToken,
            ethAddress,
            (srcToken != ethAddress) && (destToken != ethAddress),
            hint
            );
        isFeeAccountedFlags = await storage.getFeeAccountedData(reserves.reserveIds);

        for (let i = 0; i < reserves.reserveIds.length; i++) {
            result.t2eSrcAmounts[i] = srcQty.mul(reserves.splitValuesBps[i]).div(BPS);
            reserveInstance = reserveInstances[reserves.reserveIds[i]].instance;
            result.t2eRates[i] = await reserveInstance.getConversionRate(srcToken, ethAddress, result.t2eSrcAmounts[i], blockNum);
            if (isFeeAccountedFlags[i]) {
                feeAccountedBps.push(networkFeeBps);
            } else {
                feeAccountedBps.push(zeroBN);
            }
        }

        if (reserves.processWithRate.eq(zeroBN)) {
            for (let i = 0; i < reserves.reserveIds.length; i++) {
                indexes.push(i);
            }
        } else {
            indexes = await matchingEngine.doMatch(
                srcToken,
                ethAddress,
                result.t2eSrcAmounts,
                feeAccountedBps,
                result.t2eRates
            );
        }

        for (let i = 0; i < indexes.length; i++) {
            result.t2eIds.push(reserves.reserveIds[indexes[i]]);
            tmpAmts.push(result.t2eSrcAmounts[indexes[i]]);
            tmpRates.push(result.t2eRates[indexes[i]]);
            dstQty = Helper.calcDstQty(result.t2eSrcAmounts[indexes[i]], srcDecimals, ethDecimals,
                result.t2eRates[indexes[i]]);
            result.t2eDestAmounts.push(dstQty);
            result.tradeWei = result.tradeWei.add(dstQty);
            if(isFeeAccountedFlags[indexes[i]]) {
                result.feePayingReservesBps = result.feePayingReservesBps.add(reserves.splitValuesBps[indexes[i]]);
            }
        };
        result.t2eSrcAmounts = tmpAmts;
        result.t2eRates = tmpRates;
        result.t2eAddresses = await storage.getReserveAddressesFromIds(result.t2eIds);
    } else {
        result.tradeWei = srcQty;
    }

    if (result.tradeWei.eq(zeroBN)) return result;
    result.networkFeeWei = result.tradeWei.mul(networkFeeBps).div(BPS).mul(result.feePayingReservesBps).div(BPS);
    result.platformFeeWei = result.tradeWei.mul(platformFeeBps).div(BPS);
    let actualSrcWei = result.tradeWei.sub(result.networkFeeWei).sub(result.platformFeeWei);

    if (destToken != ethAddress) {
        tmpAmts = [];
        tmpRates = [];
        feeAccountedBps = [];
        indexes = [];

        reserves = await matchingEngine.getTradingReserves(
            ethAddress,
            destToken,
            (srcToken != ethAddress) && (destToken != ethAddress),
            hint
            );
        isFeeAccountedFlags = await storage.getFeeAccountedData(reserves.reserveIds);

        for (let i = 0; i < reserves.reserveIds.length; i++) {
            if (isFeeAccountedFlags[i]) {
                result.e2tSrcAmounts[i] = actualSrcWei.sub((result.tradeWei.mul(networkFeeBps).div(BPS)));
            } else {
                result.e2tSrcAmounts[i] = actualSrcWei;
            }

            result.e2tSrcAmounts[i] = result.e2tSrcAmounts[i].mul(reserves.splitValuesBps[i]).div(BPS);
            reserveInstance = reserveInstances[reserves.reserveIds[i]].instance;
            result.e2tRates[i] = await reserveInstance.getConversionRate(ethAddress, destToken, result.e2tSrcAmounts[i], blockNum);
            feeAccountedBps.push(zeroBN);
        }

        if (reserves.processWithRate.eq(zeroBN)) {
            for (let i = 0; i < reserves.reserveIds.length; i++) {
                indexes.push(i);
            }
        } else {
            indexes = await matchingEngine.doMatch(
                ethAddress,
                destToken,
                result.e2tSrcAmounts,
                feeAccountedBps,
                result.e2tRates
            );
        }

        for (let i = 0; i < indexes.length; i++) {
            result.e2tIds.push(reserves.reserveIds[indexes[i]]);
            tmpAmts.push(result.e2tSrcAmounts[indexes[i]]);
            tmpRates.push(result.e2tRates[indexes[i]]);
            dstQty = Helper.calcDstQty(result.e2tSrcAmounts[indexes[i]], ethDecimals, destDecimals, result.e2tRates[indexes[i]]);
            result.e2tDestAmounts.push(dstQty);
            result.actualDestAmount = result.actualDestAmount.add(dstQty);
            if(isFeeAccountedFlags[indexes[i]]) {
                result.feePayingReservesBps = result.feePayingReservesBps.add(reserves.splitValuesBps[indexes[i]]);
            }
        }

        result.e2tAddresses = await storage.getReserveAddressesFromIds(result.e2tIds);
        result.e2tRates = tmpRates;
        result.e2tSrcAmounts = tmpAmts;
    } else {
        result.actualDestAmount = actualSrcWei;
    }

    if (result.actualDestAmount.eq(zeroBN)) return result;
    result.networkFeeWei = result.tradeWei.mul(networkFeeBps).div(BPS).mul(result.feePayingReservesBps).div(BPS);
    result.platformFeeWei = result.tradeWei.mul(platformFeeBps).div(BPS);
    actualSrcWei = result.tradeWei.sub(result.networkFeeWei).sub(result.platformFeeWei);

    let e2tRate = Helper.calcRateFromQty(actualSrcWei, result.actualDestAmount, ethDecimals, destDecimals);
    destAmountWithNetworkFee = Helper.calcDstQty(result.tradeWei.sub(result.networkFeeWei), ethDecimals, destDecimals, e2tRate);
    destAmountWithoutFees = Helper.calcDstQty(result.tradeWei, ethDecimals, destDecimals, e2tRate);

    result.rateWithNetworkFee = Helper.calcRateFromQty(
        srcQty.mul(BPS.sub(platformFeeBps)).div(BPS),
        result.actualDestAmount,
        srcDecimals,
        destDecimals
        );
    result.rateWithAllFees = Helper.calcRateFromQty(srcQty, result.actualDestAmount, srcDecimals, destDecimals);
    return result;
}

module.exports.assertRatesEqual = assertRatesEqual;
function assertRatesEqual(expectedRates, actualRates) {
    assertEqual(expectedRates.rateWithNetworkFee, actualRates.rateWithNetworkFee, "rate after network fees not equal");
    assertEqual(expectedRates.rateWithAllFees, actualRates.rateWithAllFees, "rate after all fees not equal");
}

module.exports.getReserveBalances = getReserveBalances;
async function getReserveBalances(srcToken, destToken, ratesAmts) {
    let reserveBalances = {
        't2eEth': [], //expect ETH balance to decrease
        't2eToken': [], //expect src token balance to increase
        'e2tEth': [], //expect ETH balance to increase
        'e2tToken': [] //expect dest token balance to decrease
    }

    for (let i = 0; i < ratesAmts.t2eAddresses.length; i++) {
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
    let expectedSrcQty = zeroBN;
    let srcDecimals = (srcToken == ethAddress) ? ethDecimals : await srcToken.decimals();
    let destDecimals = (destToken == ethAddress) ? ethDecimals : await destToken.decimals();
    networkAdd = (networkAdd == undefined) ? taker : networkAdd;

    if (destToken == ethAddress) {
        //token -> ETH trade
        //Reserves: plus split dest amt (srcToken), minus split src amt based on rate (ETH)
        for (let i=0; i<ratesAmts.t2eAddresses.length; i++) {
            reserveAddress = ratesAmts.t2eAddresses[i];
            splitAmount = ratesAmts.t2eSrcAmounts[i];
            expectedSrcQty = expectedSrcQty.add(splitAmount);
            //plus split amount (token)
            expectedReserveBalance = initialReserveBalances.t2eToken[i].add(splitAmount);
            await Helper.assertSameTokenBalance(reserveAddress, srcToken, expectedReserveBalance);
            //minus split dest amount (ETH)
            expectedDestChange = Helper.calcDstQty(splitAmount, srcDecimals, destDecimals, ratesAmts.t2eRates[i]);
            expectedReserveBalance = initialReserveBalances.t2eEth[i].sub(expectedDestChange);
            await Helper.assertSameEtherBalance(reserveAddress, expectedReserveBalance);
        }

        //user: minus srcQty (token), plus actualDestAmt (ETH)
        expectedTakerBalance = initialTakerBalances.src.sub(srcQty);
        await Helper.assertSameTokenBalance(networkAdd, srcToken, expectedTakerBalance);
        expectedTakerBalance = initialTakerBalances.dest.add(ratesAmts.actualDestAmount);
        actualBalance = await Helper.getBalancePromise(taker);
        await Helper.assertSameEtherBalance(taker, expectedTakerBalance);

    } else if (srcToken == ethAddress) {
        //ETH -> token trade
        //User: Minus srcQty (ETH), plus expectedDestAmtAfterAllFees (token)
        expectedTakerBalance = initialTakerBalances.dest.add(ratesAmts.actualDestAmount);
        let actualTokenBal = await destToken.balanceOf(taker);
        await Helper.assertSameTokenBalance(taker, destToken, expectedTakerBalance);
        //Reserves: Minus expectedDestAmtAfterAllFees (ETH), Plus destAmtAfterNetworkFees (token)
        for (let i=0; i<ratesAmts.e2tAddresses.length; i++) {
            reserveAddress = ratesAmts.e2tAddresses[i];
            splitAmount = ratesAmts.e2tSrcAmounts[i];
            //plus split amount (ETH)
            expectedReserveBalance = initialReserveBalances.e2tEth[i].add(splitAmount);
            await Helper.assertSameEtherBalance(reserveAddress, expectedReserveBalance);
            //minus split amount (token)
            expectedDestChange = Helper.calcDstQty(splitAmount, srcDecimals, destDecimals, ratesAmts.e2tRates[i]);
            expectedReserveBalance = initialReserveBalances.e2tToken[i].sub(expectedDestChange);
            await Helper.assertSameTokenBalance(reserveAddress, destToken, expectedReserveBalance);
        }
        //Issue: Sender has to pay network fee, so ETH calculation is a lil difficult, just get from actualSrcAmount
        expectedTakerBalance = initialTakerBalances.src.sub(srcQty);
        await Helper.assertSameEtherBalance(networkAdd, expectedTakerBalance);
    } else {
        //Reserves: plus split dest amt (srcToken), minus split src amt based on rate (ETH)
        for (let i=0; i<ratesAmts.t2eAddresses.length; i++) {
            reserveAddress = ratesAmts.t2eAddresses[i];
            splitAmount = ratesAmts.t2eSrcAmounts[i];
            expectedSrcQty = expectedSrcQty.add(splitAmount);
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
        //user: minus srcQty (srcToken), plus actualDestAmount (destToken)
        expectedTakerBalance = initialTakerBalances.src.sub(srcQty);
        await Helper.assertSameTokenBalance(networkAdd, srcToken, expectedTakerBalance);
        expectedTakerBalance = initialTakerBalances.dest.add(ratesAmts.actualDestAmount);
        await Helper.assertSameTokenBalance(taker, destToken, expectedTakerBalance);

        //e2tReserves: minus split expectedDestAmtAfterAllFee (ETH), plus split dest amt (destToken)
        for (let i=0; i<ratesAmts.e2tAddresses.length; i++) {
            reserveAddress = ratesAmts.e2tAddresses[i];
            splitAmount = ratesAmts.e2tSrcAmounts[i];
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

module.exports.calcParamsFromMaxDestAmt = calcParamsFromMaxDestAmt;
async function calcParamsFromMaxDestAmt(srcToken, destToken, unpackedOutput, info, maxDestAmt) {
    let actualSrcAmt = info[0];
    let networkFeeBps = info[1];
    let platformFeeBps = info[2];
    let tradeWeiAfterFees;

    if (unpackedOutput.actualDestAmount.gt(maxDestAmt)) {
        unpackedOutput.actualDestAmount = maxDestAmt;
        // E2T side
        if (destToken != ethAddress) {
            [tradeWeiAfterFees, unpackedOutput.e2tSrcAmounts] = calcTradeSrcAmount(ethDecimals, await destToken.decimals(), maxDestAmt,
                unpackedOutput.e2tRates, unpackedOutput.e2tSrcAmounts);
        } else {
            tradeWeiAfterFees = maxDestAmt;
        }

        let newTradeWei = tradeWeiAfterFees.mul(BPS).mul(BPS).div(
            (BPS.mul(BPS)).sub(networkFeeBps.mul(unpackedOutput.feePayingReservesBps)).sub(platformFeeBps.mul(BPS))
        );
        if (unpackedOutput.tradeWei.gt(newTradeWei)) {
            unpackedOutput.tradeWei = newTradeWei;
        } else if (newTradeWei.gt(unpackedOutput.tradeWei)) {
            console.log("New trade wei is greater than current trade wei by: " + newTradeWei.sub(unpackedOutput.tradeWei).toString(10) + " wei");
        }
        unpackedOutput.networkFeeWei = unpackedOutput.tradeWei.mul(networkFeeBps).div(BPS).mul(unpackedOutput.feePayingReservesBps).div(BPS);
        unpackedOutput.platformFeeWei = unpackedOutput.tradeWei.mul(platformFeeBps).div(BPS);

        // T2E side
        if (srcToken != ethAddress) {
            [actualSrcAmt, unpackedOutput.t2eSrcAmounts] = calcTradeSrcAmount(await srcToken.decimals(), ethDecimals, unpackedOutput.tradeWei,
                unpackedOutput.t2eRates, unpackedOutput.t2eSrcAmounts);
        } else {
            actualSrcAmt = unpackedOutput.tradeWei;
        }
    }

    return [unpackedOutput, actualSrcAmt];
}

function calcTradeSrcAmount(srcDecimals, destDecimals, destAmt, rates, srcAmounts) {
    let weightedDestAmount = new BN(0);
    for(let i = 0; i < rates.length; i++) {
        weightedDestAmount = weightedDestAmount.add(srcAmounts[i].mul(rates[i]));
    }
    let srcAmount = new BN(0);
    let destAmountSoFar = new BN(0);
    let newSrcAmounts = [];
    let shouldFallback = false;
    let totalDestAmount = new BN(0);

    for(let i = 0; i < srcAmounts.length; i++) {
        let destAmountSplit = (i == srcAmounts.length - 1) ? (new BN(destAmt).sub(destAmountSoFar)) :
            new BN(destAmt).mul(srcAmounts[i]).mul(rates[i]).div(weightedDestAmount);
        destAmountSoFar = destAmountSoFar.add(destAmountSplit);
        let srcAmt = new BN(Helper.calcSrcQty(destAmountSplit, srcDecimals, destDecimals, rates[i]));
        if (srcAmt.gt(srcAmounts[i])) {
            shouldFallback = true;
            srcAmt = srcAmounts[i];
        }
        newSrcAmounts.push(srcAmt);
        srcAmount = srcAmount.add(srcAmt);
        totalDestAmount = totalDestAmount.add(Helper.calcDstQty(srcAmt, srcDecimals, destDecimals, rates[i]));
    }
    // for logging purpose only
    if (destAmt.gt(totalDestAmount)) {
        console.log("MaxDestAmount: new total dest amount is smaller than max dest amount by: " + destAmt.sub(totalDestAmount))
    }
    if (shouldFallback) {
        srcAmount = new BN(0);
        console.log("new src amount is higher than current src amount, fallback");
        for(let i = 0; i < srcAmounts.length; i++) {
            srcAmount = srcAmount.add(srcAmounts[i]);
        }
        return [srcAmount, srcAmounts];
    }

    return [srcAmount, newSrcAmounts];
}
