pragma solidity 0.4.18;

import "../../../ERC20Interface.sol";
import "../../../Utils2.sol";
import "../../../Withdrawable.sol";
import "../../../KyberReserveInterface.sol";


contract OtcInterface {
    function getOffer(uint id) public constant returns (uint, ERC20, uint, ERC20);
    function getBestOffer(ERC20 sellGem, ERC20 buyGem) public constant returns(uint);
    function getWorseOffer(uint id) public constant returns(uint);
    function take(bytes32 id, uint128 maxTakeAmount) public;
}


contract WethInterface is ERC20 {
    function deposit() public payable;
    function withdraw(uint) public;
}


contract KyberOasisReserve is KyberReserveInterface, Withdrawable, Utils2 {

    uint constant internal COMMON_DECIMALS = 18;
    address public sanityRatesContract = 0;
    address public kyberNetwork;
    OtcInterface public otc;
    WethInterface public wethToken;
    mapping(address=>bool) public isTokenListed;
    mapping(address=>uint) public tokenMinSrcAmount;
    mapping(address=>uint) public minTokenBalance;
    mapping(address=>uint) public maxTokenBalance;
    mapping(address=>uint) public internalPricePremiumBps;
    mapping(address=>uint) public minOasisSpreadForinternalPricingBps;
    bool public tradeEnabled;
    uint public feeBps;

    function KyberOasisReserve(
        address _kyberNetwork,
        OtcInterface _otc,
        WethInterface _wethToken,
        address _admin,
        uint _feeBps
    )
        public
    {
        require(_admin != address(0));
        require(_kyberNetwork != address(0));
        require(_otc != address(0));
        require(_wethToken != address(0));
        require(_feeBps < 10000);
        require(getDecimals(_wethToken) == COMMON_DECIMALS);

        kyberNetwork = _kyberNetwork;
        otc = _otc;
        wethToken = _wethToken;
        admin = _admin;
        feeBps = _feeBps;
        tradeEnabled = true;

        require(wethToken.approve(otc, 2**255));
    }

    function() public payable {
        // anyone can deposit ether
    }

    function listToken(ERC20 token, uint minSrcAmount) public onlyAdmin {
        require(token != address(0));
        require(!isTokenListed[token]);
        require(getDecimals(token) == COMMON_DECIMALS);

        require(token.approve(otc, 2**255));
        isTokenListed[token] = true;
        tokenMinSrcAmount[token] = minSrcAmount;
        minTokenBalance[token] = 2 ** 255; // disable by default
        maxTokenBalance[token] = 0; // disable by default;
        internalPricePremiumBps[token] = 0; // NA by default
        minOasisSpreadForinternalPricingBps[token] = 0; // NA by default
    }

    function delistToken(ERC20 token) public onlyAdmin {
        require(isTokenListed[token]);

        require(token.approve(otc, 0));
        delete isTokenListed[token];
        delete tokenMinSrcAmount[token];
        delete minTokenBalance[token];
        delete maxTokenBalance[token];
        delete internalPricePremiumBps[token];
        delete minOasisSpreadForinternalPricingBps[token];
    }

    function setInternalPriceAdminParams(ERC20 token,
                                         uint minSpreadBps,
                                         uint premiumBps) public onlyAdmin {
        require(isTokenListed[token]);
        require(premiumBps <= 500); // premium <= 5%
        require(minSpreadBps <= 1000); // min spread <= 10%

        internalPricePremiumBps[token] = premiumBps;
        minOasisSpreadForinternalPricingBps[token] = minSpreadBps;
    }

    function setInternalInventoryMinMax(ERC20 token,
                                        uint  minBalance,
                                        uint  maxBalance) public onlyOperator {
        require(isTokenListed[token]);

        // don't require anything on min and max balance as it might be used for disable
        minTokenBalance[token] = minBalance;
        maxTokenBalance[token] = maxBalance;
    }

    event TradeExecute(
        address indexed sender,
        address src,
        uint srcAmount,
        address destToken,
        uint destAmount,
        address destAddress
    );

    function trade(
        ERC20 srcToken,
        uint srcAmount,
        ERC20 destToken,
        address destAddress,
        uint conversionRate,
        bool validate
    )
        public
        payable
        returns(bool)
    {

        require(tradeEnabled);
        require(msg.sender == kyberNetwork);

        require(doTrade(srcToken, srcAmount, destToken, destAddress, conversionRate, validate));

        return true;
    }

    event TradeEnabled(bool enable);

    function enableTrade() public onlyAdmin returns(bool) {
        tradeEnabled = true;
        TradeEnabled(true);

        return true;
    }

    function disableTrade() public onlyAlerter returns(bool) {
        tradeEnabled = false;
        TradeEnabled(false);

        return true;
    }

    event KyberNetworkSet(address kyberNetwork);

    function setKyberNetwork(address _kyberNetwork) public onlyAdmin {
        require(_kyberNetwork != address(0));

        kyberNetwork = _kyberNetwork;
        KyberNetworkSet(kyberNetwork);
    }

    event FeeBpsSet(uint feeBps);

    function setFeeBps(uint _feeBps) public onlyAdmin {
        require(_feeBps < 10000);

        feeBps = _feeBps;
        FeeBpsSet(feeBps);
    }

    function valueAfterReducingFee(uint val) public view returns(uint) {
        require(val <= MAX_QTY);
        return ((10000 - feeBps) * val) / 10000;
    }

    function valueBeforeFeesWereReduced(uint val) public view returns(uint) {
        require(val <= MAX_QTY);
        return val * 10000 / (10000 - feeBps);
    }

    function valueAfterAddingPremium(ERC20 token, uint val) public view returns(uint) {
        require(val <= MAX_QTY);
        uint premium = internalPricePremiumBps[token];

        return val * (10000 + premium) / 10000;
    }
    function shouldUseInternalInventory(ERC20 token,
                                        uint tokenVal,
                                        uint ethVal,
                                        bool ethToToken) public view returns(bool) {
        require(tokenVal <= MAX_QTY);

        uint tokenBalance = token.balanceOf(this);
        if (ethToToken) {
            if (tokenBalance < tokenVal) return false;
            if (tokenBalance - tokenVal < minTokenBalance[token]) return false;
        }
        else {
            if (this.balance < ethVal) return false;
            if (tokenBalance + tokenVal > maxTokenBalance[token]) return false;
        }

        // check that spread in first level makes sense
        uint x1; uint y1; uint x2; uint y2;
        (,x1,y1) = getMatchingOffer(token, wethToken, 0);
        (,y2,x2) = getMatchingOffer(wethToken, token, 0);

        require(x1 <= MAX_QTY && x2 <= MAX_QTY && y1 <= MAX_QTY && y2 <= MAX_QTY);

        // check if there is an arbitrage
        if (x1*y2 > x2*y1) return false;

        // spread is (x1/y1 - x2/y2) / (x1/y1)
        if (10000 * (x2*y1 - x1*y2) < x1*y2*minOasisSpreadForinternalPricingBps[token]) return false;


        return true;
    }

    function getConversionRate(ERC20 src, ERC20 dest, uint srcQty, uint blockNumber) public view returns(uint) {
        uint  rate;
        uint  actualSrcQty;
        ERC20 actualSrc;
        ERC20 actualDest;
        uint offerPayAmt;
        uint offerBuyAmt;

        blockNumber;

        if (!tradeEnabled) return 0;
        if (!validTokens(src, dest)) return 0;

        if (src == ETH_TOKEN_ADDRESS) {
            actualSrc = wethToken;
            actualDest = dest;
            actualSrcQty = srcQty;
        } else if (dest == ETH_TOKEN_ADDRESS) {
            actualSrc = src;
            actualDest = wethToken;

            if (srcQty < tokenMinSrcAmount[src]) {
                /* remove rounding errors and present rate for 0 src amount. */
                actualSrcQty = tokenMinSrcAmount[src];
            } else {
                actualSrcQty = srcQty;
            }
        } else {
            return 0;
        }

        // otc's terminology is of offer maker, so their sellGem is the taker's dest token.
        (, offerPayAmt, offerBuyAmt) = getMatchingOffer(actualDest, actualSrc, actualSrcQty);

        // make sure to take only one level of order book to avoid gas inflation.
        if (actualSrcQty > offerBuyAmt) return 0;

        bool tradeFromInventory = false;
        uint valueWithPremium = valueAfterAddingPremium(token, offerPayAmt);
        ERC20 token;
        if (src == ETH_TOKEN_ADDRESS) {
            token = dest;
            tradeFromInventory = shouldUseInternalInventory(token,
                                                            valueWithPremium,
                                                            offerBuyAmt,
                                                            true);
        }
        else {
            token = src;
            tradeFromInventory = shouldUseInternalInventory(token,
                                                            offerBuyAmt,
                                                            valueWithPremium,
                                                            false);
        }

        rate = calcRateFromQty(offerBuyAmt, offerPayAmt, COMMON_DECIMALS, COMMON_DECIMALS);

        if (tradeFromInventory) return valueAfterAddingPremium(token,rate);
        else return valueAfterReducingFee(rate);
    }

    function doTrade(
        ERC20 srcToken,
        uint srcAmount,
        ERC20 destToken,
        address destAddress,
        uint conversionRate,
        bool validate
    )
        internal
        returns(bool)
    {
        uint actualDestAmount;

        require(validTokens(srcToken, destToken));

        // can skip validation if done at kyber network level
        if (validate) {
            require(conversionRate > 0);
            if (srcToken == ETH_TOKEN_ADDRESS)
                require(msg.value == srcAmount);
            else
                require(msg.value == 0);
        }

        uint userExpectedDestAmount = calcDstQty(srcAmount, COMMON_DECIMALS, COMMON_DECIMALS, conversionRate);
        require(userExpectedDestAmount > 0); // sanity check

        uint destAmountIncludingFees = valueBeforeFeesWereReduced(userExpectedDestAmount);

        if (srcToken == ETH_TOKEN_ADDRESS) {
            if(!shouldUseInternalInventory(destToken,
                                           userExpectedDestAmount,
                                           0,
                                           true)) {
                wethToken.deposit.value(msg.value)();

                actualDestAmount = takeMatchingOffer(wethToken, destToken, srcAmount);
                require(actualDestAmount >= destAmountIncludingFees);
            }

            // transfer back only requested dest amount.
            require(destToken.transfer(destAddress, userExpectedDestAmount));
        } else {
            require(srcToken.transferFrom(msg.sender, this, srcAmount));

            if(!shouldUseInternalInventory(srcToken,
                                           0,
                                           userExpectedDestAmount,
                                           false)) {
                actualDestAmount = takeMatchingOffer(srcToken, wethToken, srcAmount);
                require(actualDestAmount >= destAmountIncludingFees);
                wethToken.withdraw(actualDestAmount);
            }

            // transfer back only requested dest amount.
            destAddress.transfer(userExpectedDestAmount);
        }

        TradeExecute(msg.sender, srcToken, srcAmount, destToken, userExpectedDestAmount, destAddress);

        return true;
    }

    function takeMatchingOffer(
        ERC20 srcToken,
        ERC20 destToken,
        uint srcAmount
    )
        internal
        returns(uint actualDestAmount)
    {
        uint offerId;
        uint offerPayAmt;
        uint offerBuyAmt;

        // otc's terminology is of offer maker, so their sellGem is our (the taker's) dest token.
        (offerId, offerPayAmt, offerBuyAmt) = getMatchingOffer(destToken, srcToken, srcAmount);

        require(srcAmount <= MAX_QTY);
        require(offerPayAmt <= MAX_QTY);
        actualDestAmount = srcAmount * offerPayAmt / offerBuyAmt;

        require(uint128(actualDestAmount) == actualDestAmount);
        otc.take(bytes32(offerId), uint128(actualDestAmount));  // Take the portion of the offer that we need
        return;
    }

    function getMatchingOffer(
        ERC20 offerSellGem,
        ERC20 offerBuyGem,
        uint payAmount
    )
        internal
        view
        returns(
            uint offerId,
            uint offerPayAmount,
            uint offerBuyAmount
        )
    {
        offerId = otc.getBestOffer(offerSellGem, offerBuyGem);
        (offerPayAmount, , offerBuyAmount, ) = otc.getOffer(offerId);
        uint depth = 1;

        while (payAmount > offerBuyAmount) {
            offerId = otc.getWorseOffer(offerId); // We look for the next best offer
            if (offerId == 0 || ++depth > 7) {
                offerId = 0;
                offerPayAmount = 0;
                offerBuyAmount = 0;
                break;
            }
            (offerPayAmount, , offerBuyAmount, ) = otc.getOffer(offerId);
        }

        return;
    }

    function validTokens(ERC20 src, ERC20 dest) internal view returns (bool valid) {
        return ((isTokenListed[src] && ETH_TOKEN_ADDRESS == dest) ||
                (isTokenListed[dest] && ETH_TOKEN_ADDRESS == src));
    }
}
