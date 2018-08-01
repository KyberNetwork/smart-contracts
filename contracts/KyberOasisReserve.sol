pragma solidity 0.4.18;

import "./ERC20Interface.sol";
import "./Utils.sol";
import "./Withdrawable.sol";
import "./KyberReserveInterface.sol";


contract OtcInterface {
    function getBuyAmount(ERC20 buyGem, ERC20 payGem, uint payAmt) public constant returns (uint fillAmt);
    function sellAllAmount(ERC20 payGem, uint payAmt, ERC20 buyGem, uint minFillAmount) public returns (uint fillAmt);
}


contract TokenInterface is ERC20 {
    function deposit() public payable;
    function withdraw(uint) public;
}


contract KyberOasisReserve is KyberReserveInterface, Withdrawable, Utils {

    address public kyberNetwork;
    OtcInterface public otc;
    TokenInterface public wethToken;
    ERC20 public tradeToken;
    bool public tradeEnabled;
    uint public feeBps;

    function KyberOasisReserve(
        address _kyberNetwork,
        OtcInterface _otc,
        TokenInterface _wethToken,
        ERC20 _tradeToken,
        address _admin,
        uint _feeBps
    ) public {
        require(_admin != address(0));
        require(_kyberNetwork != address(0));
        require(_otc != address(0));
        require(_wethToken != address(0));
        require(_tradeToken != address(0));
        require(_feeBps < 10000);

        kyberNetwork = _kyberNetwork;
        otc = _otc;
        wethToken = _wethToken;
        tradeToken = _tradeToken;
        admin = _admin;
        feeBps = _feeBps;
        tradeEnabled = true;
    }

    event DepositToken(ERC20 token, uint amount);

    function() public payable {
        DepositToken(ETH_TOKEN_ADDRESS, msg.value);
    }

    event TradeExecute(
        address indexed origin,
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

    event ReserveParamsSet(
        address kyberNetwork,
        OtcInterface otc,
        TokenInterface wethToken,
        ERC20 tradeToken,
        uint feeBps
    );

    function setReserveParams(
        address _kyberNetwork,
        OtcInterface _otc,
        TokenInterface _wethToken,
        ERC20 _tradeToken,
        uint _feeBps
    )
        public
        onlyAdmin
    {
        require(_kyberNetwork != address(0));
        require(_otc != address(0));
        require(_wethToken != address(0));
        require(_tradeToken != address(0));
        require(_feeBps < 10000);

        kyberNetwork = _kyberNetwork;
        otc = _otc;
        wethToken = _wethToken;
        tradeToken = _tradeToken;
        feeBps = _feeBps;

        ReserveParamsSet(kyberNetwork, otc, wethToken, tradeToken, feeBps);
    }

    function getDestQty(ERC20 src, ERC20 dest, uint srcQty, uint rate) public view returns(uint) {
        uint dstDecimals = getDecimals(dest);
        uint srcDecimals = getDecimals(src);

        return calcDstQty(srcQty, srcDecimals, dstDecimals, rate);
    }

    function valueAfterReducingFee(uint val) public view returns(uint) {
        require(val <= MAX_QTY);
        return ((10000 - feeBps) * val) / 10000;
    }

    function getConversionRate(ERC20 src, ERC20 dest, uint srcQty, uint blockNumber) public view returns(uint) {
        uint  rate;
        uint  destQty;
        ERC20 wrappedSrc;
        ERC20 wrappedDest;

        blockNumber;

        if (!tradeEnabled) return 0;
        if ((tradeToken != src) && (tradeToken != dest)) return 0;

        if (src == ETH_TOKEN_ADDRESS) {
            wrappedSrc = wethToken;
            wrappedDest = dest;
        } else if (dest == ETH_TOKEN_ADDRESS) {
            wrappedSrc = src;
            wrappedDest = wethToken;
        } else {
            return 0;
        }

        destQty = otc.getBuyAmount(wrappedDest, wrappedSrc, srcQty);

        rate = valueAfterReducingFee(destQty) * PRECISION / srcQty;

        return rate;
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

        require((ETH_TOKEN_ADDRESS == srcToken) || (ETH_TOKEN_ADDRESS == destToken));
        require((tradeToken == srcToken) || (tradeToken == destToken));

        // can skip validation if done at kyber network level
        if (validate) {
            require(conversionRate > 0);
            if (srcToken == ETH_TOKEN_ADDRESS)
                require(msg.value == srcAmount);
            else
                require(msg.value == 0);
        }

        uint destAmount = getDestQty(srcToken, destToken, srcAmount, conversionRate);
        // sanity check
        require(destAmount > 0);

        if (srcToken == ETH_TOKEN_ADDRESS) {
            wethToken.deposit.value(msg.value)();

            //TODO - move to constructor...
            if (wethToken.allowance(this, otc) < msg.value) {
                wethToken.approve(otc, uint(-1));
            }

            actualDestAmount = otc.sellAllAmount(wethToken, msg.value, destToken, destAmount);
            require(actualDestAmount >= destAmount);

            // transfer back only requested dest amount.
            require(destToken.transfer(destAddress, destAmount));
        } else {
            require(srcToken.transferFrom(msg.sender, this, srcAmount));

            /* TODO - move to constructor  */
            if (srcToken.allowance(this, otc) < srcAmount) {
                srcToken.approve(otc, uint(-1));
            }
 
            actualDestAmount = otc.sellAllAmount(srcToken, srcAmount, wethToken, destAmount);
            require(actualDestAmount >= destAmount);
            wethToken.withdraw(actualDestAmount);

            // transfer back only requested dest amount.
            destAddress.transfer(destAmount); 
        }

        TradeExecute(msg.sender, srcToken, srcAmount, destToken, destAmount, destAddress);

        return true;

    }
}
