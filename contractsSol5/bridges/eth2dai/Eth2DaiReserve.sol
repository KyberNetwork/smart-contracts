pragma solidity 0.5.11;

import "../../IERC20.sol";
import "../../IKyberReserve.sol";
import "../../utils/Withdrawable2.sol";
import "../../utils/Utils4.sol";
import "./mock/IOtc.sol";

contract IWeth is IERC20 {
    function deposit() public payable;
    function withdraw(uint) public;
}

contract Eth2DaiReserve is IKyberReserve, Withdrawable2, Utils4 {

    // constants
    uint constant internal INVALID_ID = uint(-1);
    uint constant internal POW_2_32 = 2 ** 32;
    uint constant internal POW_2_96 = 2 ** 96;
    uint constant internal BPS = 10000; // 10^4

    // values
    address public kyberNetwork;
    bool public tradeEnabled;
    uint public feeBps;

    IOtc public otc;
    IWeth public wethToken;// = IWeth(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);

    mapping(address => bool) public isTokenListed;
    // 1 bit: isInternalInventoryEnabled, 95 bits: min token, 96 bits: max token, 32 bits: premiumBps, 32 bits: minSpreadBps;
    mapping(address => uint) internal internalInventoryData;
    // basicData contains compact data of min eth support, max traverse and max takes
    // min eth support (first 192 bits) + max traverse (32 bits) + max takes (32 bits) = 256 bits
    mapping(address => uint) internal tokenBasicData;
    // factorData contains compact data of factors to compute max traverse, max takes, and min take order size
    // 6 params, each 32 bits (6 * 32 = 192 bits)
    mapping(address => uint) internal tokenFactorData;

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
        bool isEnabled;
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

    constructor(address _kyberNetwork, uint _feeBps, address _otc, address _weth, address _admin) 
        public Withdrawable2(_admin)
    {
        require(_kyberNetwork != address(0), "constructor: kyberNetwork's address is missing");
        require(_otc != address(0), "constructor: otc's address is missing");
        require(_weth != address(0), "constructor: weth's address is missing");
        require(_feeBps < BPS, "constructor: fee >= bps");
        
        wethToken = IWeth(_weth);
        require(getDecimals(wethToken) == MAX_DECIMALS, "constructor: wethToken's decimals is not MAX_DECIMALS");
        require(wethToken.approve(_otc, 2**255), "constructor: failed to approve otc (wethToken)");

        kyberNetwork = _kyberNetwork;
        otc = IOtc(_otc);
        feeBps = _feeBps;
        admin = _admin;
        tradeEnabled = true;
    }

    function() external payable {} // solhint-disable-line no-empty-blocks

    /**
        Returns conversion rate of given pair and srcQty, use 1 as srcQty if srcQty = 0
        Using eth amount to compute offer limit configurations
        => need to check spread is ok for token -> eth
        Last bit of the rate indicates whether to use internal inventory:
          0 - use eth2dai
          1 - use internal inventory
    */
    function getConversionRate(IERC20 src, IERC20 dest, uint srcQty, uint) public view returns(uint) {
        if (!tradeEnabled) { return 0; }
        if (srcQty == 0) { return 0; }
        // check if token's listed
        IERC20 token = src == ETH_TOKEN_ADDRESS ? dest : src;
        if (!isTokenListed[address(token)]) { return 0; }

        OfferData memory bid;
        OfferData memory ask;
        (bid, ask) = getFirstBidAndAskOrders(token);

        // if token is src, need to check for valid spread
        if (token == src && !checkValidSpread(bid, ask, false, 0)) { return 0; }

        uint destQty;
        OfferData[] memory offers;

        if (src == ETH_TOKEN_ADDRESS) {
            (destQty, offers) = findBestOffers(dest, wethToken, srcQty, bid, ask);
        } else {
            (destQty, offers) = findBestOffers(wethToken, src, srcQty, bid, ask);
        }

        if (offers.length == 0 || destQty == 0) { return 0; } // no offer or destQty == 0, return 0 for rate

        uint rate = calcRateFromQty(srcQty, destQty, MAX_DECIMALS, MAX_DECIMALS);

        bool useInternalInventory;
        uint premiumBps;

        if (src == ETH_TOKEN_ADDRESS) {
            (useInternalInventory, premiumBps) = shouldUseInternalInventory(dest,
                                                                            destQty,
                                                                            srcQty,
                                                                            true,
                                                                            bid,
                                                                            ask
                                                                            );
        } else {
            (useInternalInventory, premiumBps) = shouldUseInternalInventory(src,
                                                                            srcQty,
                                                                            destQty,
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
        IERC20 srcToken,
        uint srcAmount,
        IERC20 destToken,
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

        IERC20 token = srcToken == ETH_TOKEN_ADDRESS ? destToken : srcToken;
        require(isTokenListed[address(token)], "trade: token is not listed");

        require(doTrade(srcToken, srcAmount, destToken, destAddress, conversionRate, validate), "trade: doTrade returns false");
        return true;
    }

    event TokenConfigDataSet(
        IERC20 token, uint maxTraverse, uint traveseFactorX, uint traveseFactorY,
        uint maxTake, uint takeFactorX, uint takeFactorY,
        uint minSizeFactorX, uint minSizeFactorY, uint minETHSupport
    );

    function setTokenConfigData(
        IERC20 token, uint maxTraverse, uint traveseFactorX, uint traveseFactorY,
        uint maxTake, uint takeFactorX, uint takeFactorY,
        uint minSizeFactorX, uint minSizeFactorY, uint minETHSupport
    )
        public onlyAdmin
    {
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

    event ContractsSet(address kyberNetwork, address otc);

    function setContracts(address _kyberNetwork, address _otc) public onlyAdmin {
        require(_kyberNetwork != address(0), "setContracts: kyberNetwork's address is missing");
        require(_otc != address(0), "setContracts: otc's address is missing");

        kyberNetwork = _kyberNetwork;

        if (_otc != address(otc)) {
            // new otc address
            require(wethToken.approve(address(otc), 0), "setContracts: failed to reset allowance for old otc (wethToken)");
            otc = IOtc(_otc);
            require(wethToken.approve(_otc, 2**255), "setContracts: failed to approve otc (wethToken)");
        }

        emit ContractsSet(_kyberNetwork, _otc);
    }

    event InternalInventoryDataSet(uint minToken, uint maxToken, uint pricePremiumBps, uint minSpreadBps);

    function setInternalInventoryData(
        IERC20 token,
        bool isEnabled,
        uint minToken,
        uint maxToken,
        uint pricePremiumBps,
        uint minSpreadBps
    )
        public onlyAdmin
    {
        require(isTokenListed[address(token)], "setInternalInventoryData: token is not listed");
        require(minToken < POW_2_96/2, "setInternalInventoryData: minToken > 2**95");
        require(maxToken < POW_2_96, "setInternalInventoryData: maxToken > 2**96");
        require(pricePremiumBps < POW_2_32, "setInternalInventoryData: pricePremiumBps > 2**32");
        require(minSpreadBps < POW_2_32, "setInternalInventoryData: minSpreadBps > 2**32");

        internalInventoryData[address(token)] = encodeInternalInventoryData(isEnabled, minToken, maxToken, pricePremiumBps, minSpreadBps);

        emit InternalInventoryDataSet(minToken, maxToken, pricePremiumBps, minSpreadBps);
    }

    event TokenListed(IERC20 token);

    function listToken(IERC20 token) public onlyAdmin {
        address tokenAddr = address(token);

        require(tokenAddr != address(0), "listToken: token's address is missing");
        require(!isTokenListed[tokenAddr], "listToken: token's alr listed");
        require(getDecimals(token) == MAX_DECIMALS, "listToken: token's decimals is not MAX_DECIMALS");
        require(token.approve(address(otc), 2**255), "listToken: approve token otc failed");

        isTokenListed[tokenAddr] = true;

        emit TokenListed(token);
    }

    event TokenDelisted(IERC20 token);

    function delistToken(IERC20 token) public onlyAdmin {
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
        require(_feeBps < BPS, "setFeeBps: feeBps >= bps");

        feeBps = _feeBps;
        emit FeeBpsSet(feeBps);
    }

    function showBestOffers(IERC20 token, bool isEthToToken, uint srcAmountToken)
        public view
        returns(uint destAmount, uint destAmountToken, uint[] memory offerIds) 
    {
        if (srcAmountToken == 0) {
            // return 0
            destAmount = 0;
            destAmountToken = 0;
            offerIds = new uint[](0);
            return (destAmount, destAmountToken, offerIds);
        }

        OfferData[] memory offers;
        IERC20 dstToken = isEthToToken ? token : wethToken;
        IERC20 srcToken = isEthToToken ? wethToken : token;

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

    function getTokenBasicDataPub(IERC20 token)
        public view
        returns (uint minETHSupport, uint maxTraverse, uint maxTakes)
    {
        (minETHSupport, maxTraverse, maxTakes) = decodeTokenBasicData(tokenBasicData[address(token)]);
    }

    function getFactorDataPub(IERC20 token)
        public view
        returns (uint maxTraverseX, uint maxTraverseY, uint maxTakeX, uint maxTakeY, uint minOrderSizeX, uint minOrderSizeY)
    {
        (maxTraverseX, maxTraverseY, maxTakeX, maxTakeY, minOrderSizeX, minOrderSizeY) = decodeFactorData(tokenFactorData[address(token)]);
    }

    function getInternalInventoryDataPub(IERC20 token)
        public view
        returns(bool isEnabled, uint minTokenBal, uint maxTokenBal, uint premiumBps, uint minSpreadBps)
    {
        (isEnabled, minTokenBal, maxTokenBal, premiumBps, minSpreadBps) = decodeInternalInventoryData(internalInventoryData[address(token)]);
    }

    /// @dev do a trade
    /// @param srcToken Src token
    /// @param srcAmount Amount of src token
    /// @param destToken Destination token
    /// @param destAddress Destination address to send tokens to
    /// @return true iff trade is successful
    function doTrade(
        IERC20 srcToken,
        uint srcAmount,
        IERC20 destToken,
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

        uint userExpectedDestAmount = calcDstQty(srcAmount, MAX_DECIMALS, MAX_DECIMALS, conversionRate);
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
        OfferData[] memory offers;
        if (srcToken == ETH_TOKEN_ADDRESS) {
            (actualDestAmount, offers) = findBestOffers(destToken, wethToken, srcAmount, bid, ask);
        } else {
            (actualDestAmount, offers) = findBestOffers(wethToken, srcToken, srcAmount, bid, ask);
        }

        require(actualDestAmount >= userExpectedDestAmount, "doTrade: actualDestAmount is less than userExpectedDestAmount");

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

    function takeMatchingOrders(IERC20 destToken, uint srcAmount, OfferData[] memory offers)
        internal
        returns(uint actualDestAmount)
    {
        require(destToken != ETH_TOKEN_ADDRESS, "takeMatchingOrders: destToken is ETH");

        uint lastReserveBalance = destToken.balanceOf(address(this));
        uint remainingSrcAmount = srcAmount;

        for (uint i = 0; i < offers.length; i++) {
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

    function shouldUseInternalInventory(
        IERC20 token,
        uint tokenVal,
        uint ethVal,
        bool ethToToken,
        OfferData memory bid,
        OfferData memory ask
    )
        internal view
        returns(bool shouldUse, uint premiumBps)
    {
        shouldUse = false;
        premiumBps = 0;

        if (tokenVal > MAX_QTY) { return (shouldUse, premiumBps); }

        InternalInventoryData memory inventoryData = getInternalInventoryData(token);
        if (!inventoryData.isEnabled) { return (shouldUse, premiumBps); }

        premiumBps = inventoryData.premiumBps;

        uint tokenBalance = token.balanceOf(address(this));

        if (ethToToken) {
            if (tokenBalance < tokenVal) { return (shouldUse, premiumBps); }
            if (tokenBalance - tokenVal < inventoryData.minTokenBal) { return (shouldUse, premiumBps); }
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
        internal pure
        returns(uint)
    {
        return rate % 2 == (useInternalInventory ? 1 : 0)
            ? rate
            : rate - 1;
    }

    function valueAfterReducingFee(uint val) internal view returns(uint) {
        require(val <= MAX_QTY, "valueAfterReducingFee: val > MAX_QTY");
        return ((BPS - feeBps) * val) / BPS;
    }

    function valueAfterAddingPremium(uint val, uint premium) internal pure returns(uint) {
        require(val <= MAX_QTY, "valueAfterAddingPremium: val > MAX_QTY");
        return val * (BPS + premium) / BPS;
    }

    function findBestOffers(
        IERC20 dstToken,
        IERC20 srcToken,
        uint srcAmount,
        OfferData memory bid,
        OfferData memory ask
    )
        internal view
        returns(uint totalDestAmount, OfferData[] memory offers)
    {
        uint remainingSrcAmount = srcAmount;
        uint maxOrdersToTake;
        uint maxTraversedOrders;
        uint minPayAmount;
        uint numTakenOffer = 0;
        totalDestAmount = 0;
        IERC20 token = srcToken == wethToken ? dstToken : srcToken;

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
        // if we don't have best offers, get them.
        if ((srcToken == wethToken && bid.id == 0) || (dstToken == wethToken && ask.id == 0)) {
            offers[0].id = otc.getBestOffer(dstToken, srcToken);
            // assuming pay amount is taker pay amount. (in otc it is used differently)
            (offers[0].buyAmount, , offers[0].payAmount, ) = otc.getOffer(offers[0].id);
        } else {
            offers[0] = srcToken == wethToken ? bid : ask;
        }

        uint thisOffer;

        OfferData memory biggestSkippedOffer = OfferData(0, 0, 0);

        for (; maxTraversedOrders > 0; --maxTraversedOrders) {
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

    // returns max takes, max traverse, min order size to take using config factor data
    function calcOfferLimitsFromFactorData(
        IERC20 token,
        bool isEthToToken,
        OfferData memory bid,
        OfferData memory ask, uint srcAmount
    )
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
            order0Pay = ask.payAmount;
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

        uint tokenFactorBPS = 100000; // 10^5

        maxTraverse = (factorData.maxTraverseX * ethOrderSize / PRECISION + factorData.maxTraverseY) / tokenFactorBPS;
        maxTraverse = minOf(maxTraverse, basicData.maxTraverse);

        maxTakes = (factorData.maxTakeX * ethOrderSize / PRECISION + factorData.maxTakeY) / tokenFactorBPS;
        maxTakes = minOf(maxTakes, basicData.maxTakes);

        uint minETHAmount = (factorData.minOrderSizeX * ethOrderSize + factorData.minOrderSizeY * PRECISION) / tokenFactorBPS;

        // translate min amount to pay token
        minPayAmount = isEthToToken ? minETHAmount : minETHAmount * order0Pay / order0Buy;
    }

    // bid: buy WETH, ask: sell WETH (their base token is DAI)
    function getFirstBidAndAskOrders(IERC20 token)
        internal view
        returns(OfferData memory bid, OfferData memory ask)
    {
        // getting first bid offer (buy WETH)
        (bid.id, bid.payAmount, bid.buyAmount) = getFirstOffer(token, wethToken);
        // getting first ask offer (sell WETH)
        (ask.id, ask.payAmount, ask.buyAmount) = getFirstOffer(wethToken, token);
    }

    function getFirstOffer(IERC20 offerSellGem, IERC20 offerBuyGem)
        internal view
        returns(uint offerId, uint offerPayAmount, uint offerBuyAmount)
    {
        offerId = otc.getBestOffer(offerSellGem, offerBuyGem);
        (offerBuyAmount, , offerPayAmount, ) = otc.getOffer(offerId);
    }

    function checkValidSpread(OfferData memory bid, OfferData memory ask, bool isCheckingMinSpread, uint minSpreadBps)
        internal pure
        returns(bool)
    {
        // if no bid or ask order, consider as invalid spread?
        if (bid.id == 0 || ask.id == 0 || bid.buyAmount > MAX_QTY || bid.payAmount > MAX_QTY || ask.buyAmount > MAX_QTY || ask.payAmount > MAX_QTY) {
            return false;
        }

        uint x1 = ask.payAmount * bid.payAmount;
        uint x2 = ask.buyAmount * bid.buyAmount;

        // must check sellRate > buyRate
        if (x1 <= x2) { return false; }

        // if no need to check for min spread, return true here
        if (!isCheckingMinSpread) { return true; }

        // spread should be bigger than minSpreadBps
        if (BPS * (x1 - x2) <= x2 * minSpreadBps) { return false; }

        return true;
    }

    function getTokenBasicData(IERC20 token)
        internal view
        returns(BasicDataConfig memory data)
    {
        (data.minETHSupport, data.maxTraverse, data.maxTakes) = decodeTokenBasicData(tokenBasicData[address(token)]);
    }

    function getFactorData(IERC20 token)
        internal view
        returns(FactorDataConfig memory data)
    {
        (data.maxTraverseX, data.maxTraverseY, data.maxTakeX, data.maxTakeY, data.minOrderSizeX, data.minOrderSizeY) = decodeFactorData(tokenFactorData[address(token)]);
    }

    function getInternalInventoryData(IERC20 token)
        internal view
        returns(InternalInventoryData memory data)
    {
        (bool isEnabled, uint minTokenBal, uint maxTokenBal, uint premiumBps, uint minSpreadBps) = decodeInternalInventoryData(internalInventoryData[address(token)]);
        data.isEnabled = isEnabled;
        data.minTokenBal = minTokenBal;
        data.maxTokenBal = maxTokenBal;
        data.premiumBps = premiumBps;
        data.minSpreadBps = minSpreadBps;
    }

    function encodeInternalInventoryData(bool isEnabled, uint minTokenBal, uint maxTokenBal, uint premiumBps, uint minSpreadBps)
        internal pure
        returns(uint data)
    {
        require(minSpreadBps < POW_2_32, "encodeInternalInventoryData: minSpreadBps is too big");
        require(premiumBps < POW_2_32, "encodeInternalInventoryData: premiumBps is too big");
        require(maxTokenBal < POW_2_96, "encodeInternalInventoryData: maxTokenBal is too big");
        require(minTokenBal < POW_2_96, "encodeInternalInventoryData: minTokenBal is too big");
        data = minSpreadBps & (POW_2_32 - 1);
        data |= (premiumBps & (POW_2_32 - 1)) * POW_2_32;
        data |= (maxTokenBal & (POW_2_96 - 1)) * POW_2_32 * POW_2_32;
        data |= (minTokenBal & (POW_2_96 / 2 - 1)) * POW_2_96 * POW_2_32 * POW_2_32;
        data |= (isEnabled ? 1 : 0) * (POW_2_96 / 2) * POW_2_96 * POW_2_32 * POW_2_32;
    }

    function decodeInternalInventoryData(uint data)
        internal pure
        returns(bool isEnabled, uint minTokenBal, uint maxTokenBal, uint premiumBps, uint minSpreadBps)
    {
        minSpreadBps = data & (POW_2_32 - 1);
        premiumBps = (data / POW_2_32) & (POW_2_32 - 1);
        maxTokenBal = (data / (POW_2_32 * POW_2_32)) & (POW_2_96 - 1);
        minTokenBal = (data / (POW_2_96 * POW_2_32 * POW_2_32)) & (POW_2_96 / 2 - 1);
        isEnabled = (data / ((POW_2_96 / 2) * POW_2_96 * POW_2_32 * POW_2_32)) % 2 == 0 ? false : true;
    }

    function encodeTokenBasicData(uint ethSize, uint maxTraverse, uint maxTakes)
        internal pure
        returns(uint data)
    {
        require(maxTakes < POW_2_32, "encodeTokenBasicData: maxTakes is too big");
        require(maxTraverse < POW_2_32, "encodeTokenBasicData: maxTraverse is too big");
        require(ethSize < POW_2_96, "encodeTokenBasicData: ethSize is too big");
        data = maxTakes & (POW_2_32 - 1);
        data |= (maxTraverse & (POW_2_32 - 1)) * POW_2_32;
        data |= (ethSize & (POW_2_96 * POW_2_96 - 1)) * POW_2_32 * POW_2_32;
    }

    function decodeTokenBasicData(uint data)
        internal pure
        returns(uint ethSize, uint maxTraverse, uint maxTakes)
    {
        maxTakes = data & (POW_2_32 - 1);
        maxTraverse = (data / POW_2_32) & (POW_2_32 - 1);
        ethSize = (data / (POW_2_32 * POW_2_32)) & (POW_2_96 * POW_2_96 - 1);
    }

    function encodeFactorData(uint traverseX, uint traverseY, uint takeX, uint takeY, uint minSizeX, uint minSizeY)
        internal pure
        returns(uint data)
    {
        require(minSizeY < POW_2_32, "encodeFactorData: minSizeY is too big");
        require(minSizeX < POW_2_32, "encodeFactorData: minSizeX is too big");
        require(takeY < POW_2_32, "encodeFactorData: takeY is too big");
        require(takeX < POW_2_32, "encodeFactorData: takeX is too big");
        require(traverseY < POW_2_32, "encodeFactorData: traverseY is too big");
        require(traverseX < POW_2_32, "encodeFactorData: traverseX is too big");
        data = (minSizeY & (POW_2_32 - 1));
        data |= (minSizeX & (POW_2_32 - 1)) * POW_2_32;
        data |= (takeY & (POW_2_32 - 1)) * POW_2_32 * POW_2_32;
        data |= (takeX & (POW_2_32 - 1)) * POW_2_96;
        data |= (traverseY & (POW_2_32 - 1)) * POW_2_96 * POW_2_32;
        data |= (traverseX & (POW_2_32 - 1)) * POW_2_96 * POW_2_32 * POW_2_32;
    }

    function decodeFactorData(uint data)
        internal pure
        returns(uint traverseX, uint traverseY, uint takeX, uint takeY, uint minSizeX, uint minSizeY)
    {
        minSizeY = data & (POW_2_32 - 1);
        minSizeX = (data / POW_2_32) & (POW_2_32 - 1);
        takeY = (data / (POW_2_32 * POW_2_32)) & (POW_2_32 - 1);
        takeX = (data / POW_2_96) & (POW_2_32 - 1);
        traverseY = (data / (POW_2_96 * POW_2_32)) & (POW_2_32 - 1);
        traverseX = (data / (POW_2_96 * POW_2_32 * POW_2_32)) & (POW_2_32 - 1);
    }
}
