pragma solidity 0.5.11;

import "./ERC20Interface.sol";
import "./KyberReserveInterface.sol";
import "./Utils.sol";
import "./Withdrawable.sol";

contract OtcInterface {
    function getOffer(uint id) external view returns (uint, ERC20, uint, ERC20);
    function getBestOffer(ERC20 sellGem, ERC20 buyGem) external view returns(uint);
    function getWorseOffer(uint id) external view returns(uint);
    function take(bytes32 id, uint128 maxTakeAmount) external;
}

contract WethInterface is ERC20 {
    function deposit() public payable;
    function withdraw(uint) public;
}

contract Eth2DaiReserve is KyberReserveInterface, Withdrawable {

    uint constant POW_2_32 = 2 ** 32;
    uint constant POW_2_96 = 2 ** 96;
    uint constant BASIC_FACTOR_STEP = 100000;

    // constants
    uint constant internal MAX_QTY = (10**28); // 10B tokens
    uint constant internal MAX_RATE = (PRECISION * 10**6); // up to 1M tokens per ETH
    uint constant internal PRECISION = 10**18;
    uint constant internal INVALID_ID = uint(-1);
    uint constant internal COMMON_DECIMALS = 18;
    ERC20 constant internal ETH_TOKEN_ADDRESS = ERC20(0x00eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee);

    // values
    address public kyberNetwork;
    bool public tradeEnabled;
    uint public feeBps;

    OtcInterface public otc = OtcInterface(0x39755357759cE0d7f32dC8dC45414CCa409AE24e);
    WethInterface public wethToken = WethInterface(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);
    ERC20 public DAIToken = ERC20(0x89d24A6b4CcB1B6fAA2625fE562bDD9a23260359);

    mapping(address => bool) public isTokenListed;
    // 96 bits: min token, 96 bits: max token, 32 bits: premiumBps, 32 bits: minSpreadBps;
    mapping(address => uint) internalInventoryData;
    // basicData contains compact data of min eth support, max traverse and max takes
    // min eth support (first 192 bits) + max traverse (32 bits) + max takes (32 bits) = 256 bits
    mapping(address => uint) tokenBasicData;
    // factorData contains compact data of factors to compute max traverse, max takes, and min take order size
    // 6 params, each 32 bits (6 * 32 = 192 bits)
    mapping(address => uint) tokenFactorData;

    struct BasicDataConfig {
        uint minETHSupport;
        uint maxTraverse;
        uint maxTakes;
    }

    struct FactorDataConfig {
        uint maxTraverseX;
        uint maxTraverseY;
        uint maxTakeX;
        uint maxTakeY;
        uint minOrderSizeX;
        uint minOrderSizeY;
    }

    struct InternalInventoryData {
        uint minTokenBal;
        uint maxTokenBal;
        uint premiumBps;
        uint minSpreadBps;
    }

    struct OfferData {
        uint payAmount;
        uint buyAmount;
        uint id;
    }

    constructor(address _kyberNetwork, uint _feeBps, address _admin) public {
        require(_kyberNetwork != address(0), "constructor: kyberNetwork's address is missing");
        require(_feeBps < 10000, "constructor: fee >= 10000");
        require(_admin != address(0), "constructor: admin is missing");
        require(getDecimals(wethToken) == COMMON_DECIMALS, "constructor: wethToken's decimals is not COMMON_DECIMALS");
        require(wethToken.approve(address(otc), 2**255), "constructor: failed to approve otc (wethToken)");
    
        kyberNetwork = _kyberNetwork;
        feeBps = _feeBps;
        admin = _admin;
        tradeEnabled = true;
    }

    function() external payable {
    }

    /**
        Returns conversion rate of given pair and srcQty, use 1 as srcQty if srcQty = 0
        Using eth amount to compute offer limit configurations
        => need to check spread is ok for token -> eth
        Last bit of the rate indicates whether to use internal inventory:
          0 - use eth2dai
          1 - use internal inventory
    */
    function getConversionRate(ERC20 src, ERC20 dest, uint srcQty, uint) public view returns(uint) {
        if (!tradeEnabled) { return 0; }
        // check if token's listed
        ERC20 token = src == ETH_TOKEN_ADDRESS ? dest : src;
        if (!isTokenListed[address(token)]) { return 0; }
        
        OfferData memory bid;
        OfferData memory ask;
        (bid, ask) = getFirstBidAndAskOrders(token);

        // if token is src, need to check for valid spread, 
        if (token == src && !checkValidSpread(bid, ask, false, 0)) { return 0; }

        uint destAmount;
        OfferData[] memory offers;

        // using 1 as default value if srcQty is 0
        uint srcAmount = srcQty == 0 ? 1 : srcQty;

        if (src == ETH_TOKEN_ADDRESS) {
            (destAmount, offers) = findBestOffers(dest, wethToken, srcAmount, bid, ask);
        } else {
            (destAmount, offers) = findBestOffers(wethToken, src, srcAmount, bid, ask);
        }

        if (offers.length == 0 || destAmount == 0) { return 0; } // no offer or destAmount == 0, return 0 for rate

        uint rate = calcRateFromQty(srcAmount, destAmount, COMMON_DECIMALS, COMMON_DECIMALS);

        bool useInternalInventory;
        uint premiumBps;

        if (src == ETH_TOKEN_ADDRESS) {
            (useInternalInventory, premiumBps) = shouldUseInternalInventory(dest,
                                                                            destAmount,
                                                                            srcAmount,
                                                                            true,
                                                                            bid,
                                                                            ask
                                                                            );
        } else {
            (useInternalInventory, premiumBps) = shouldUseInternalInventory(src,
                                                                            srcAmount,
                                                                            destAmount,
                                                                            false,
                                                                            bid,
                                                                            ask
                                                                            );
        }

        if (useInternalInventory) {
            rate = valueAfterAddingPremium(rate, premiumBps);
        } else {
            rate = valueAfterReducingFee(rate);
        }

        return applyInternalInventoryHintToRate(rate, useInternalInventory);
    }

    event TradeExecute(
        address indexed origin,
        address src,
        uint srcAmount,
        address destToken,
        uint destAmount,
        address payable destAddress
    );

    function trade(
        ERC20 srcToken,
        uint srcAmount,
        ERC20 destToken,
        address payable destAddress,
        uint conversionRate,
        bool validate
    )
        public
        payable
        returns(bool)
    {
        require(tradeEnabled, "trade: tradeEnabled is false");
        require(msg.sender == kyberNetwork, "trade: not call from kyberNetwork's contract");
        require(srcToken == ETH_TOKEN_ADDRESS || destToken == ETH_TOKEN_ADDRESS, "trade: srcToken or destToken must be ETH");

        ERC20 token = srcToken == ETH_TOKEN_ADDRESS ? destToken : srcToken;
        require(isTokenListed[address(token)], "trade: token is not listed");

        require(doTrade(srcToken, srcAmount, destToken, destAddress, conversionRate, validate), "trade: doTrade returns false");
        return true;
    }

    /// @dev do a trade
    /// @param srcToken Src token
    /// @param srcAmount Amount of src token
    /// @param destToken Destination token
    /// @param destAddress Destination address to send tokens to
    /// @return true iff trade is successful
    function doTrade(
        ERC20 srcToken,
        uint srcAmount,
        ERC20 destToken,
        address payable destAddress,
        uint conversionRate,
        bool validate
    )
        internal
        returns(bool)
    {
        // can skip validation if done at kyber network level
        if (validate) {
            require(conversionRate > 0, "doTrade: conversionRate is 0");
            if (srcToken == ETH_TOKEN_ADDRESS)
                require(msg.value == srcAmount, "doTrade: msg.value != srcAmount");
            else
                require(msg.value == 0, "doTrade: msg.value must be 0");
        }

        uint userExpectedDestAmount = calcDstQty(srcAmount, COMMON_DECIMALS, COMMON_DECIMALS, conversionRate);
        require(userExpectedDestAmount > 0, "doTrade: userExpectedDestAmount == 0"); // sanity check

        uint actualDestAmount;

        // using hint to check if we should use our internal inventory
        bool useInternalInventory = conversionRate % 2 == 1;

        if (useInternalInventory) {
            // taking from internal inventory and return
            if (srcToken == ETH_TOKEN_ADDRESS) {
                // transfer back only requested dest amount.
                require(destToken.transfer(destAddress, userExpectedDestAmount), "doTrade: (useInternalInventory) can not transfer back token");
            } else {
                // collect src token
                require(srcToken.transferFrom(msg.sender, address(this), srcAmount), "doTrade: (useInternalInventory) can not collect src token");
                // transfer back only requested dest amount.
                destAddress.transfer(userExpectedDestAmount);
            }

            emit TradeExecute(msg.sender, address(srcToken), srcAmount, address(destToken), userExpectedDestAmount, destAddress);
            return true;
        }

        OfferData memory bid;
        OfferData memory ask;
        (bid, ask) = getFirstBidAndAskOrders(srcToken == ETH_TOKEN_ADDRESS ? destToken : srcToken);

        // get offers to take
        OfferData [] memory offers;
        if (srcToken == ETH_TOKEN_ADDRESS) {
            (actualDestAmount, offers) = findBestOffers(destToken, wethToken, srcAmount, bid, ask);   
        } else {
            (actualDestAmount, offers) = findBestOffers(wethToken, srcToken, srcAmount, bid, ask);
        }

        require(actualDestAmount >= userExpectedDestAmount , "doTrade: actualDestAmount is less than userExpectedDestAmount");

        if (srcToken == ETH_TOKEN_ADDRESS) {
            wethToken.deposit.value(msg.value)();
            actualDestAmount = takeMatchingOrders(destToken, srcAmount, offers);
            require(actualDestAmount >= userExpectedDestAmount, "doTrade: actualDestAmount is less than userExpectedDestAmount, eth to token");
            // transfer back only requested dest amount
            require(destToken.transfer(destAddress, userExpectedDestAmount), "doTrade: can not transfer back requested token");
        } else {
            // collect src tokens
            require(srcToken.transferFrom(msg.sender, address(this), srcAmount), "doTrade: can not collect src token");
            actualDestAmount = takeMatchingOrders(wethToken, srcAmount, offers);
            require(actualDestAmount >= userExpectedDestAmount, "doTrade: actualDestAmount is less than userExpectedDestAmount, token to eth");
            wethToken.withdraw(actualDestAmount);
            // transfer back only requested dest amount.
            destAddress.transfer(userExpectedDestAmount);
        }

        emit TradeExecute(msg.sender, address(srcToken), srcAmount, address(destToken), userExpectedDestAmount, destAddress);
        return true;
    }

    function takeMatchingOrders(ERC20 destToken, uint srcAmount, OfferData[] memory offers) internal returns(uint actualDestAmount) {
        require(destToken != ETH_TOKEN_ADDRESS, "takeMatchingOrders: destToken is ETH");

        uint lastReserveBalance = destToken.balanceOf(address(this));
        uint remainingSrcAmount = srcAmount;

        for(uint i = 0; i < offers.length; i++) {
            if (offers[i].id == 0 || remainingSrcAmount == 0) { break; }

            uint payAmount = minOf(remainingSrcAmount, offers[i].payAmount);
            uint buyAmount = payAmount * offers[i].buyAmount / offers[i].payAmount;

            otc.take(bytes32(offers[i].id), uint128(buyAmount));
            remainingSrcAmount -= payAmount;
        }

        // must use all amount
        require(remainingSrcAmount == 0, "takeMatchingOrders: did not take all src amount");

        uint newReserveBalance = destToken.balanceOf(address(this));

        require(newReserveBalance > lastReserveBalance, "takeMatchingOrders: newReserveBalance <= lastReserveBalance");

        actualDestAmount = newReserveBalance - lastReserveBalance;
    }

    function shouldUseInternalInventory(ERC20 token,
                                        uint tokenVal,
                                        uint ethVal,
                                        bool ethToToken,
                                        OfferData memory bid,
                                        OfferData memory ask)
        internal
        view
        returns(bool shouldUse, uint premiumBps)
    {
        require(tokenVal <= MAX_QTY, "shouldUseInternalInventory: tokenVal > MAX_QTY");

        InternalInventoryData memory inventoryData = getInternalInventoryData(token);

        shouldUse = false;
        premiumBps = inventoryData.premiumBps;

        uint tokenBalance = token.balanceOf(address(this));

        if (ethToToken) {
            if (tokenBalance < tokenVal) { return (shouldUse, premiumBps); }
            if (tokenVal - tokenVal < inventoryData.minTokenBal) { return (shouldUse, premiumBps); }
        } else {
            if (address(this).balance < ethVal) { return (shouldUse, premiumBps); }
            if (tokenBalance + tokenVal > inventoryData.maxTokenBal) { return (shouldUse, premiumBps); }
        }

        if (!checkValidSpread(bid, ask, true, inventoryData.minSpreadBps)) {
            return (shouldUse, premiumBps);
        }

        shouldUse = true;
    }

    function applyInternalInventoryHintToRate(
        uint rate,
        bool useInternalInventory
    )
        internal
        pure
        returns(uint)
    {
        return rate % 2 == (useInternalInventory ? 1 : 0)
            ? rate
            : rate - 1;
    }

    function valueAfterReducingFee(uint val) public view returns(uint) {
        require(val <= MAX_QTY, "valueAfterReducingFee: val > MAX_QTY");
        return ((10000 - feeBps) * val) / 10000;
    }

    function valueAfterAddingPremium(uint val, uint premium) public pure returns(uint) {
        require(val <= MAX_QTY, "valueAfterAddingPremium: val > MAX_QTY");
        return val * (10000 + premium) / 10000;
    }

    event TokenConfigDataSet(
        ERC20 token, uint maxTraverse, uint traveseFactorX, uint traveseFactorY,
        uint maxTake, uint takeFactorX, uint takeFactorY,
        uint minSizeFactorX, uint minSizeFactorY, uint minETHSupport
    );

    function setTokenConfigData(
        ERC20 token, uint maxTraverse, uint traveseFactorX, uint traveseFactorY,
        uint maxTake, uint takeFactorX, uint takeFactorY,
        uint minSizeFactorX, uint minSizeFactorY, uint minETHSupport) public {
        address tokenAddr = address(token);
        require(isTokenListed[tokenAddr]);
        tokenBasicData[tokenAddr] = encodeTokenBasicData(minETHSupport, maxTraverse, maxTake);
        tokenFactorData[tokenAddr] = encodeFactorData(
            traveseFactorX,
            traveseFactorY,
            takeFactorX,
            takeFactorY,
            minSizeFactorX,
            minSizeFactorY
        );
        emit TokenConfigDataSet(
            token, maxTraverse, traveseFactorX, takeFactorY,
            maxTake, takeFactorX, takeFactorY,
            minSizeFactorX, minSizeFactorY, minETHSupport
        );
    }

    event TradeEnabled(bool enable);

    function enableTrade() public onlyAdmin returns(bool) {
        tradeEnabled = true;
        emit TradeEnabled(true);

        return true;
    }

    function disableTrade() public onlyAlerter returns(bool) {
        tradeEnabled = false;
        emit TradeEnabled(false);

        return true;
    }

    event KyberNetworkSet(address kyberNetwork);

    function setKyberNetwork(address _kyberNetwork) public onlyAdmin {
        require(_kyberNetwork != address(0), "setKyberNetwork: kyberNetwork's address is missing");

        kyberNetwork = _kyberNetwork;
        emit KyberNetworkSet(kyberNetwork);
    }

    event InternalInventoryDataSet(uint minToken, uint maxToken, uint pricePremiumBps, uint minSpreadBps);

    function setInternalInventoryData(ERC20 token, uint minToken, uint maxToken, uint pricePremiumBps, uint minSpreadBps) public onlyAdmin {
        require(isTokenListed[address(token)], "setInternalInventoryData: token is not listed");
        require(minToken < POW_2_96, "setInternalInventoryData: minToken > 2**96");
        require(maxToken < POW_2_96, "setInternalInventoryData: maxToken > 2**96");
        require(pricePremiumBps < POW_2_32, "setInternalInventoryData: pricePremiumBps > 2**32");
        require(minSpreadBps < POW_2_32, "setInternalInventoryData: minSpreadBps > 2**32");
        // blocking too small minSpreadBps
        require(2 * minSpreadBps >= (feeBps + pricePremiumBps), "setInternalInventoryData: minSpreadBps should be >= (feeBps + pricePremiumBps)/2");

        internalInventoryData[address(token)] = encodeInternalInventoryData(minToken, maxToken, pricePremiumBps, minSpreadBps);

        emit InternalInventoryDataSet(minToken, maxToken, pricePremiumBps, minSpreadBps);
    }

    event TokenListed(ERC20 token);

    function listToken(ERC20 token) public onlyAdmin {
        address tokenAddr = address(token);

        require(tokenAddr != address(0), "listToken: token's address is missing");
        require(!isTokenListed[tokenAddr], "listToken: token's alr listed");
        require(getDecimals(token) == COMMON_DECIMALS, "listToken: token's decimals is not COMMON_DECIMALS");
        require(token.approve(address(otc), 2**255), "listToken: approve token otc failed");

        isTokenListed[tokenAddr] = true;

        emit TokenListed(token);
    }

    event TokenDelisted(ERC20 token);

    function delistToken(ERC20 token) public onlyAdmin {
        address tokenAddr = address(token);

        require(isTokenListed[tokenAddr], "delistToken: token is not listed");
        require(token.approve(address(otc), 0), "delistToken: reset approve token failed");

        delete isTokenListed[tokenAddr];
        delete internalInventoryData[tokenAddr];
        delete tokenFactorData[tokenAddr];
        delete tokenBasicData[tokenAddr];

        emit TokenDelisted(token);
    }

    event FeeBpsSet(uint feeBps);

    function setFeeBps(uint _feeBps) public onlyAdmin {
        require(_feeBps < 10000, "setFeeBps: feeBps >= 10000");

        feeBps = _feeBps;
        emit FeeBpsSet(feeBps);
    }

    function showBestOffers(ERC20 token, bool isEthToToken, uint srcAmountToken) public view
        returns(uint destAmount, uint destAmountToken, uint [] memory offerIds) 
    {
        OfferData [] memory offers;
        ERC20 dstToken = isEthToToken ? token : wethToken;
        ERC20 srcToken = isEthToToken ? wethToken : token;

        OfferData memory bid;
        OfferData memory ask;
        (bid, ask) = getFirstBidAndAskOrders(token);

        (destAmount, offers) = findBestOffers(dstToken, srcToken, (srcAmountToken * 10 ** 18), bid, ask);
        
        destAmountToken = destAmount / 10 ** 18;
        
        uint i;
        for (i; i < offers.length; i++) {
            if (offers[i].id == 0) {
                break;
            }
        }
    
        offerIds = new uint[](i);
        for (i = 0; i < offerIds.length; i++) {
            offerIds[i] = offers[i].id;
        }
    }    
    
    function findBestOffers(ERC20 dstToken, ERC20 srcToken, uint srcAmount, OfferData memory bid, OfferData memory ask)
        internal view
        returns(uint totalDestAmount, OfferData [] memory offers)
    {
        uint remainingSrcAmount = srcAmount;
        uint maxOrdersToTake;
        uint maxTraversedOrders;
        uint minPayAmount;
        uint numTakenOffer = 0;
        totalDestAmount = 0;
        ERC20 token = srcToken == wethToken ? dstToken : srcToken;

        (maxOrdersToTake, maxTraversedOrders, minPayAmount) = calcOfferLimitsFromFactorData(
            token,
            (srcToken == wethToken),
            bid,
            ask,
            srcAmount
        );

        offers = new OfferData[](maxTraversedOrders);

        // return earlier, we don't want to take any orders
        if (maxTraversedOrders == 0 || maxOrdersToTake == 0) {
            return (totalDestAmount, offers);
        }

        // otc's terminology is of offer maker, so their sellGem is our (the taker's) dest token.
        // if we don't have first offer, try to get it
        if ((srcToken == wethToken && bid.id == 0) || (dstToken == wethToken && ask.id == 0)) {
            offers[0].id = otc.getBestOffer(dstToken, srcToken);
            // assuming pay amount is taker pay amount. (in otc it is used differently)
            (offers[0].buyAmount, , offers[0].payAmount, ) = otc.getOffer(offers[0].id);
        } else {
            offers[0] = srcToken == wethToken ? bid : ask;
        }

        // putting here so if src amount is 0, we won't revert and still consider the first order as rate
        if (remainingSrcAmount == 0) { return (totalDestAmount, offers); }

        uint thisOffer;

        OfferData memory biggestSkippedOffer = OfferData(0, 0, 0);

        for ( ;maxTraversedOrders > 0 ; --maxTraversedOrders) {
            thisOffer = numTakenOffer;

            // in case both biggestSkippedOffer & current offer have amount >= remainingSrcAmount
            // biggestSkippedOffer should have better rate than current offer
            if (biggestSkippedOffer.payAmount >= remainingSrcAmount) {
                offers[numTakenOffer].id = biggestSkippedOffer.id;
                offers[numTakenOffer].buyAmount = remainingSrcAmount * biggestSkippedOffer.buyAmount / biggestSkippedOffer.payAmount;
                offers[numTakenOffer].payAmount = remainingSrcAmount;
                totalDestAmount += offers[numTakenOffer].buyAmount;
                ++numTakenOffer;
                remainingSrcAmount = 0;
                break;
            } else if (offers[numTakenOffer].payAmount >= remainingSrcAmount) {
                offers[numTakenOffer].buyAmount = remainingSrcAmount * offers[numTakenOffer].buyAmount / offers[numTakenOffer].payAmount;
                offers[numTakenOffer].payAmount = remainingSrcAmount;
                totalDestAmount += offers[numTakenOffer].buyAmount;
                ++numTakenOffer;
                remainingSrcAmount = 0;
                break;
            } else if ((maxOrdersToTake - numTakenOffer) > 1
                        && offers[numTakenOffer].payAmount >= minPayAmount) {
                totalDestAmount += offers[numTakenOffer].buyAmount;
                remainingSrcAmount -= offers[numTakenOffer].payAmount;
                ++numTakenOffer;
            } else if (offers[numTakenOffer].payAmount > biggestSkippedOffer.payAmount) {
                biggestSkippedOffer.payAmount = offers[numTakenOffer].payAmount;
                biggestSkippedOffer.buyAmount = offers[numTakenOffer].buyAmount;
                biggestSkippedOffer.id = offers[numTakenOffer].id;
            }

            offers[numTakenOffer].id = otc.getWorseOffer(offers[thisOffer].id);
            (offers[numTakenOffer].buyAmount, , offers[numTakenOffer].payAmount, ) = otc.getOffer(offers[numTakenOffer].id);
        }

        if (remainingSrcAmount > 0) totalDestAmount = 0;
        if (totalDestAmount == 0) offers = new OfferData[](0);
    }

    // just use for testing, give src/dest amount to compute rate should be a sell offer data
    function calcOfferLimitsFromFactorDataPub(ERC20 token, bool isEthToToken, uint sellTokenSrcAmt, uint sellTokenDstAmt, uint srcAmount)
        public view
        returns(uint maxTakes, uint maxTraverse, uint minPayAmount)
    {
        (maxTakes, maxTraverse, minPayAmount) = calcOfferLimitsFromFactorData(
            token,
            isEthToToken,
            OfferData(0, sellTokenDstAmt, sellTokenSrcAmt),
            OfferData(0, sellTokenSrcAmt, sellTokenDstAmt),
            srcAmount
        );
    }

    // just use for testing, but with real data
    function calcOfferLimitsFromFactorDataPub2(ERC20 token, bool isEthToToken, uint srcAmount)
        public view
        returns(uint maxTakes, uint maxTraverse, uint minPayAmount)
    {
        OfferData memory bid;
        OfferData memory ask;
        (bid, ask) = getFirstBidAndAskOrders(token);
        (maxTakes, maxTraverse, minPayAmount) = calcOfferLimitsFromFactorData(
            token,
            isEthToToken,
            bid,
            ask,
            srcAmount
        );
    }

    // returns max takes, max traveser, min order size to take using config factor data
    function calcOfferLimitsFromFactorData(ERC20 token, bool isEthToToken, OfferData memory bid, OfferData memory ask, uint srcAmount)
        internal view
        returns(uint maxTakes, uint maxTraverse, uint minPayAmount)
    {
        if (!isEthToToken && (ask.id == 0 || bid.id == 0)) {
            // need to compute equivalent eth amount but no ask and bid offers are available
            maxTakes = 0;
            maxTraverse = 0;
            minPayAmount = 0;
            return (maxTakes, maxTraverse, minPayAmount);
        }

        uint order0Pay = 0;
        uint order0Buy = 0;

        if (!isEthToToken) {
            // only need to use median when token -> eth trade
            // rate eth/dai: order0Buy / order0Pay
            order0Pay = ask.payAmount;
            // sell eth rate        : ask.buyAmount / ask.payAmount
            // buy eth rate         : bid.payAmount / bid.buyAmount
            // median rate (eth/dai): (ask.buyAmount / ask.payAmount + bid.payAmount / bid.buyAmount) / 2;
            // take amt dai         : ask.payAmount
            // -> amt eth           : ask.payAmount * (ask.buyAmount / ask.payAmount + bid.payAmount / bid.buyAmount) / 2;
            order0Buy = (ask.buyAmount + ask.payAmount * bid.payAmount / bid.buyAmount) / 2;
        }

        uint ethOrderSize = isEthToToken ? srcAmount : srcAmount * order0Buy / order0Pay;

        BasicDataConfig memory basicData = getTokenBasicData(token);

        if (basicData.minETHSupport > ethOrderSize) {
            maxTakes = 0;
            maxTraverse = 0;
            minPayAmount = 0;
            return (maxTakes, maxTraverse, minPayAmount);
        }

        FactorDataConfig memory factorData = getFactorData(token);

        maxTraverse = (factorData.maxTraverseX * ethOrderSize / PRECISION + factorData.maxTraverseY) / BASIC_FACTOR_STEP;
        maxTraverse = minOf(maxTraverse, basicData.maxTraverse);

        maxTakes = (factorData.maxTakeX * ethOrderSize / PRECISION + factorData.maxTakeY) / BASIC_FACTOR_STEP;
        maxTakes = minOf(maxTakes, basicData.maxTakes);

        uint minETHAmount = (factorData.minOrderSizeX * ethOrderSize + factorData.minOrderSizeY * PRECISION) / BASIC_FACTOR_STEP;

        // translate min amount to pay token
        minPayAmount = isEthToToken ? minETHAmount : minETHAmount * order0Pay / order0Buy;
    }

    function getFirstOffer(ERC20 offerSellGem, ERC20 offerBuyGem)
        public view
        returns(uint offerId, uint offerPayAmount, uint offerBuyAmount)
    {
        offerId = otc.getBestOffer(offerSellGem, offerBuyGem);
        (offerBuyAmount, ,offerPayAmount, ) = otc.getOffer(offerId);
    }

    function getNextBestOffer(
        ERC20 offerSellGem,
        ERC20 offerBuyGem,
        uint payAmount,
        uint prevOfferId
    )
        public
        view
        returns(
            uint offerId,
            uint offerPayAmount,
            uint offerBuyAmount
        )
    {
        if (prevOfferId == INVALID_ID) {
            offerId = otc.getBestOffer(offerSellGem, offerBuyGem);
        } else {
            offerId = otc.getWorseOffer(prevOfferId);
        }

        (offerBuyAmount, ,offerPayAmount, ) = otc.getOffer(offerId);

        while (payAmount > offerPayAmount) {
            offerId = otc.getWorseOffer(offerId); // next best offer
            if (offerId == 0) {
                offerId = 0;
                offerPayAmount = 0;
                offerBuyAmount = 0;
                break;
            }
            (offerBuyAmount, ,offerPayAmount, ) = otc.getOffer(offerId);
        }
    }
    
    function getEthToDaiOrders(uint numOrders) public view
        returns(uint [] memory ethPayAmtTokens, uint [] memory daiBuyAmtTokens, uint [] memory rateDaiDivEthx10, uint [] memory Ids,
        uint totalBuyAmountDAIToken, uint totalPayAmountEthers, uint totalRateDaiDivEthx10) 
    {
        uint offerId = INVALID_ID;
        ethPayAmtTokens = new uint[](numOrders);
        daiBuyAmtTokens = new uint[](numOrders);    
        rateDaiDivEthx10 = new uint[](numOrders);
        Ids = new uint[](numOrders);
        
        uint offerBuyAmt;
        uint offerPayAmt;
        
        for (uint i = 0; i < numOrders; i++) {
            
            (offerId, offerPayAmt, offerBuyAmt) = getNextBestOffer(DAIToken, wethToken, 1, offerId);
            
            totalBuyAmountDAIToken += offerBuyAmt;
            totalPayAmountEthers += offerPayAmt;
            
            ethPayAmtTokens[i] = offerPayAmt / 10 ** 18;
            daiBuyAmtTokens[i] = offerBuyAmt / 10 ** 18;
            rateDaiDivEthx10[i] = (offerBuyAmt * 10) / offerPayAmt;
            Ids[i] = offerId;
            
            if(offerId == 0) break;
        }
        
        totalRateDaiDivEthx10 = totalBuyAmountDAIToken * 10 / totalPayAmountEthers;
        totalBuyAmountDAIToken /= 10 ** 18;
        totalPayAmountEthers /= 10 ** 18;
    }
    
    function getDaiToEthOrders(uint numOrders) public view
        returns(uint [] memory daiPayAmtTokens, uint [] memory ethBuyAmtTokens, uint [] memory rateDaiDivEthx10, uint [] memory Ids,
        uint totalPayAmountDAIToken, uint totalBuyAmountEthers, uint totalRateDaiDivEthx10)
    {
        uint offerId = INVALID_ID;
        daiPayAmtTokens = new uint[](numOrders);
        ethBuyAmtTokens = new uint[](numOrders);
        rateDaiDivEthx10 = new uint[](numOrders);
        Ids = new uint[](numOrders);
        
        uint offerBuyAmt;
        uint offerPayAmt;

        for (uint i = 0; i < numOrders; i++) {

            (offerId, offerPayAmt, offerBuyAmt) = getNextBestOffer(wethToken, DAIToken, 1, offerId);
            
            totalPayAmountDAIToken += offerPayAmt;
            totalBuyAmountEthers += offerBuyAmt;
            
            daiPayAmtTokens[i] = offerPayAmt / 10 ** 18;
            ethBuyAmtTokens[i] = offerBuyAmt / 10 ** 18;
            rateDaiDivEthx10[i] = (offerPayAmt * 10) / offerBuyAmt;
            Ids[i] = offerId;
            
            if (offerId == 0) break;
        }
        
        totalRateDaiDivEthx10 = totalPayAmountDAIToken * 10 / totalBuyAmountEthers;
        totalPayAmountDAIToken /= 10 ** 18;
        totalBuyAmountEthers /= 10 ** 18;
    }

    function getFirstBidAndAskOrdersPub(ERC20 token)
        public view
        returns(uint bidPayAmt, uint bidBuyAmt, uint askPayAmt, uint askBuyAmt)
    {
        OfferData memory bid;
        OfferData memory ask;
        (bid, ask) = getFirstBidAndAskOrders(token);
        bidPayAmt = bid.payAmount;
        bidBuyAmt = bid.buyAmount;
        askPayAmt = ask.payAmount;
        askBuyAmt = ask.buyAmount;
    }

    // bid: buy WETH, ask: sell WETH (their base token is DAI)
    function getFirstBidAndAskOrders(ERC20 token) internal view returns(OfferData memory bid, OfferData memory ask) {
        // getting first bid offer (buy WETH)
        (bid.id, bid.payAmount, bid.buyAmount) = getFirstOffer(token, wethToken);
        // getting first ask offer (sell WETH)
        (ask.id, ask.payAmount, ask.buyAmount) = getFirstOffer(wethToken, token);
    }

    // for testing only
    function checkValidSpreadPub(ERC20 token, uint minSpreadBps) public view returns(bool) {
        OfferData memory bid;
        OfferData memory ask;
        (bid, ask) = getFirstBidAndAskOrders(token);
        return checkValidSpread(bid, ask, true, minSpreadBps);
    }
    
    function checkValidSpread(OfferData memory bid, OfferData memory ask, bool isCheckingMinSpread, uint minSpreadBps)
        internal
        pure
        returns(bool)
    {
        // if no bid or ask order, consider as invalid spread?
        if (bid.id == 0 || ask.id == 0 || bid.buyAmount > MAX_QTY || bid.payAmount > MAX_QTY || ask.buyAmount > MAX_QTY || ask.payAmount > MAX_QTY) {
            return false;
        }

        // sell eth rate : ask.payAmount / ask.buyAmount
        // buy eth rate  : bid.buyAmount / bid.payAmount
        // sell > buy   -> ask.payAmount / ask.buyAmount > bid.buyAmount / bid.payAmount
        //              -> ask.payAmount * bid.payA mount > ask.buyAmount * bid.buyAmount;
        // slippage  : (sell - buy) / buy
        //          -> (ask.payAmount / ask.buyAmount - bid.buyAmount / bid.payAmount) / (bid.buyAmount / bid.payAmount);

        uint x1 = ask.payAmount * bid.payAmount;
        uint x2 = ask.buyAmount * bid.buyAmount;

        // must check sellRate > buyRate
        if (x1 <= x2) { return false; }

        // if no need to check for min spread, return true here
        if (!isCheckingMinSpread) { return true; }

        // spread should be bigger than minSpreadBps
        if (10000 * (x1 - x2) <= x2 * minSpreadBps) { return false; }

        return true;
    }

    function getTokenBasicDataPub(ERC20 token)
        public view
        returns (uint minETHSupport, uint maxTraverse, uint maxTakes)
    {
        (minETHSupport, maxTraverse, maxTakes) = decodeTokenBasicData(tokenBasicData[address(token)]);
    }

    function getTokenBasicData(ERC20 token) 
        internal view 
        returns(BasicDataConfig memory data)
    {
        (data.minETHSupport, data.maxTraverse, data.maxTakes) = decodeTokenBasicData(tokenBasicData[address(token)]);
    }

    function getFactorDataPub(ERC20 token)
        public view
        returns (uint maxTraverseX, uint maxTraverseY, uint maxTakeX, uint maxTakeY, uint minOrderSizeX, uint minOrderSizeY)
    {
        (maxTraverseX, maxTraverseY, maxTakeX, maxTakeY, minOrderSizeX, minOrderSizeY) = decodeFactorData(tokenFactorData[address(token)]);
    }

    function getFactorData(ERC20 token) 
        internal view 
        returns(FactorDataConfig memory data)
    {
        (data.maxTraverseX, data.maxTraverseY, data.maxTakeX, data.maxTakeY, data.minOrderSizeX, data.minOrderSizeY) = decodeFactorData(tokenFactorData[address(token)]);
    }

    function getInternalInventoryDataPub(ERC20 token)
        public view
        returns(uint minTokenBal, uint maxTokenBal, uint premiumBps, uint minSpreadBps)
    {
        (minTokenBal, maxTokenBal, premiumBps, minSpreadBps) = decodeInternalInventoryData(internalInventoryData[address(token)]);
    }

    function getInternalInventoryData(ERC20 token)
        internal view
        returns(InternalInventoryData memory data)
    {
        (uint minTokenBal, uint maxTokenBal, uint premiumBps, uint minSpreadBps) = decodeInternalInventoryData(internalInventoryData[address(token)]);
        data.minTokenBal = minTokenBal;
        data.maxTokenBal = maxTokenBal;
        data.premiumBps = premiumBps;
        data.minSpreadBps = minSpreadBps;
    }

    function encodeInternalInventoryData(uint minTokenBal, uint maxTokenBal, uint premiumBps, uint minSpreadBps)
        public
        pure
        returns(uint data)
    {
        data = minSpreadBps & (POW_2_32 - 1);
        data |= (premiumBps & (POW_2_32 - 1)) * POW_2_32;
        data |= (maxTokenBal & (POW_2_96 - 1)) * POW_2_32 * POW_2_32;
        data |= (minTokenBal & (POW_2_96 - 1)) * POW_2_96 * POW_2_32 * POW_2_32;
    }

    function decodeInternalInventoryData(uint data)
        public
        pure
        returns(uint minTokenBal, uint maxTokenBal, uint premiumBps, uint minSpreadBps)
    {
        minSpreadBps = data & (POW_2_32 - 1);
        premiumBps = (data / POW_2_32) & (POW_2_32 - 1);
        maxTokenBal = (data / (POW_2_32 * POW_2_32)) & (POW_2_96 - 1);
        minTokenBal = (data / (POW_2_96 * POW_2_32 * POW_2_32)) & (POW_2_96 - 1);
    }

    function encodeTokenBasicData(uint ethSize, uint maxTraverse, uint maxTakes) 
        public
        pure
        returns(uint data)
    {
        data = maxTakes & (POW_2_32 - 1);
        data |= (maxTraverse & (POW_2_32 - 1)) * POW_2_32;
        data |= (ethSize & (POW_2_96 * POW_2_96 - 1)) * POW_2_32 * POW_2_32;
    }

    function decodeTokenBasicData(uint data) 
        public
        pure
        returns(uint ethSize, uint maxTraverse, uint maxTakes)
    {
        maxTakes = data & (POW_2_32 - 1);
        maxTraverse = (data / POW_2_32) & (POW_2_32 - 1);
        ethSize = (data / (POW_2_32 * POW_2_32)) & (POW_2_96 * POW_2_96 - 1);
    }

    function encodeFactorData(uint traverseX, uint traverseY, uint takeX, uint takeY, uint minSizeX, uint minSizeY)
        public
        pure
        returns(uint data)
    {
        data = (minSizeY & (POW_2_32 - 1));
        data |= (minSizeX & (POW_2_32 - 1)) * POW_2_32;
        data |= (takeY & (POW_2_32 - 1)) * POW_2_32 * POW_2_32;
        data |= (takeX & (POW_2_32 - 1)) * POW_2_96;
        data |= (traverseY & (POW_2_32 - 1)) * POW_2_96 * POW_2_32;
        data |= (traverseX & (POW_2_32 - 1)) * POW_2_96 * POW_2_32 * POW_2_32;
    }

    function decodeFactorData(uint data)
        public
        pure
        returns(uint traverseX, uint traverseY, uint takeX, uint takeY, uint minSizeX, uint minSizeY)
    {
        minSizeY = data & (POW_2_32 - 1);
        minSizeX = (data / POW_2_32) & (POW_2_32 - 1);
        takeY = (data / (POW_2_32 * POW_2_32)) & (POW_2_32 - 1);
        takeX = (data / POW_2_96) & (POW_2_32 - 1);
        traverseY = (data / (POW_2_96 * POW_2_32)) & (POW_2_32 - 1);
        traverseX = (data / (POW_2_96 * POW_2_32 * POW_2_32)) & (POW_2_32 - 1);
    }

    function minOf(uint x, uint y) internal pure returns(uint) {
        return x > y ? y : x;
    }

    function calcRateFromQty(uint srcAmount, uint destAmount, uint srcDecimals, uint dstDecimals)
        internal pure returns(uint)
    {
        require(srcAmount <= MAX_QTY, "calcRateFromQty: srcAmount is bigger than MAX_QTY");
        require(destAmount <= MAX_QTY, "calcRateFromQty: destAmount is bigger than MAX_QTY");

        if (dstDecimals >= srcDecimals) {
            require((dstDecimals - srcDecimals) <= COMMON_DECIMALS, "calcRateFromQty: dstDecimals - srcDecimals > COMMON_DECIMALS");
            return (destAmount * PRECISION / ((10 ** (dstDecimals - srcDecimals)) * srcAmount));
        } else {
            require((srcDecimals - dstDecimals) <= COMMON_DECIMALS, "calcRateFromQty: srcDecimals - dstDecimals > COMMON_DECIMALS");
            return (destAmount * PRECISION * (10 ** (COMMON_DECIMALS - dstDecimals)) / srcAmount);
        }
    }

    function calcDstQty(uint srcQty, uint srcDecimals, uint dstDecimals, uint rate) internal pure returns(uint) {
        require(srcQty <= MAX_QTY, "calcDstQty: srcQty is bigger than MAX_QTY");
        require(rate <= MAX_RATE, "calcDstQty: rate is bigger than MAX_RATE");

        if (dstDecimals >= srcDecimals) {
            require((dstDecimals - srcDecimals) <= COMMON_DECIMALS, "calcDstQty: dstDecimals - srcDecimals > COMMON_DECIMALS");
            return (srcQty * rate * (10**(dstDecimals - srcDecimals))) / PRECISION;
        } else {
            require((srcDecimals - dstDecimals) <= COMMON_DECIMALS, "calcDstQty: srcDecimals - dstDecimals > COMMON_DECIMALS");
            return (srcQty * rate) / (PRECISION * (10**(srcDecimals - dstDecimals)));
        }
    }
    
    function getDecimals(ERC20 token) internal view returns(uint) {
        if (token == ETH_TOKEN_ADDRESS) { return COMMON_DECIMALS; }
        return token.decimals();
    }
}