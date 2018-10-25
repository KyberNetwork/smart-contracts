pragma solidity 0.4.18;

import "../ERC20Interface.sol";
import "../Utils2.sol";
import "../Withdrawable.sol";
import "../KyberReserveInterface.sol";


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
        require(msg.sender == address(wethToken));
    }

    function listToken(ERC20 token, uint minSrcAmount) public onlyAdmin {
        require(token != address(0));
        require(!isTokenListed[token]);
        require(getDecimals(token) == COMMON_DECIMALS);

        require(token.approve(otc, 2**255));
        isTokenListed[token] = true;
        tokenMinSrcAmount[token] = minSrcAmount;
    }

    function delistToken(ERC20 token) public onlyAdmin {
        require(isTokenListed[token]);

        require(token.approve(otc, 0));
        delete isTokenListed[token];
        delete tokenMinSrcAmount[token];
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

        rate = calcRateFromQty(offerBuyAmt, offerPayAmt, COMMON_DECIMALS, COMMON_DECIMALS);
        return valueAfterReducingFee(rate);
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
            wethToken.deposit.value(msg.value)();

            actualDestAmount = takeMatchingOffer(wethToken, destToken, srcAmount);
            require(actualDestAmount >= destAmountIncludingFees);

            // transfer back only requested dest amount.
            require(destToken.transfer(destAddress, userExpectedDestAmount));
        } else {
            require(srcToken.transferFrom(msg.sender, this, srcAmount));
 
            actualDestAmount = takeMatchingOffer(srcToken, wethToken, srcAmount);
            require(actualDestAmount >= destAmountIncludingFees);
            wethToken.withdraw(actualDestAmount);

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