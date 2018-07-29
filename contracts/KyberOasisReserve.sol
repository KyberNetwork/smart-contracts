pragma solidity 0.4.18;


import "./ERC20Interface.sol";
import "./Utils.sol";
import "./Withdrawable.sol";
import "./KyberReserveInterface.sol";


contract OtcInterface {
    function getBuyAmount(address, address, uint) public constant returns (uint);
}


contract OasisDirectInterface {
    function sellAllAmountPayEth(OtcInterface, ERC20, ERC20, uint)public payable returns (uint);
    function sellAllAmountBuyEth(OtcInterface, ERC20, uint, ERC20, uint) public returns (uint);
}


contract KyberOasisReserve is KyberReserveInterface, Withdrawable, Utils {

    address public kyberNetwork;
    OasisDirectInterface public oasisDirect;
    OtcInterface public otc;
    ERC20 public wethToken;
    ERC20 public tradeToken;
    bool public tradeEnabled;

    function KyberOasisReserve(
        address _kyberNetwork,
        OasisDirectInterface _oasisDirect,
        OtcInterface _otc,
        ERC20 _wethToken,
        ERC20 _tradeToken,
        address _admin
    ) public {
        require(_admin != address(0));
        require(_oasisDirect != address(0));
        require(_kyberNetwork != address(0));
        require(_otc != address(0));
        require(_wethToken != address(0));
        require(_tradeToken != address(0));

        kyberNetwork = _kyberNetwork;
        oasisDirect = _oasisDirect;
        otc = _otc;
        wethToken = _wethToken;
        tradeToken = _tradeToken;
        admin = _admin;
        tradeEnabled = true;
    }

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

    event SetContractAddresses(
        address kyberNetwork,
        OasisDirectInterface oasisDirect,
        OtcInterface otc,
        ERC20 wethToken,
        ERC20 tradeToken
    );

    function setContracts(
        address _kyberNetwork,
        OasisDirectInterface _oasisDirect,
        OtcInterface _otc,
        ERC20 _wethToken,
        ERC20 _tradeToken
    )
        public
        onlyAdmin
    {
        require(_kyberNetwork != address(0));
        require(_oasisDirect != address(0));
        require(_otc != address(0));
        require(_wethToken != address(0));
        require(_tradeToken != address(0));

        kyberNetwork = _kyberNetwork;
        oasisDirect = _oasisDirect;
        otc = _otc;
        wethToken = _wethToken;
        tradeToken = _tradeToken;

        setContracts(kyberNetwork, oasisDirect, otc, wethToken, tradeToken);
    }

    function getDestQty(ERC20 src, ERC20 dest, uint srcQty, uint rate) public view returns(uint) {
        uint dstDecimals = getDecimals(dest);
        uint srcDecimals = getDecimals(src);

        return calcDstQty(srcQty, srcDecimals, dstDecimals, rate);
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
        }
        else if (dest == ETH_TOKEN_ADDRESS) {
            wrappedSrc = src;
            wrappedDest = wethToken;
        }
        else {
            return 0;
        }

        destQty = otc.getBuyAmount(wrappedDest, wrappedSrc, srcQty);
        rate = destQty * PRECISION / srcQty;

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
            actualDestAmount = oasisDirect.sellAllAmountPayEth.value(msg.value)(otc, wethToken, destToken, destAmount);
            require(actualDestAmount >= destAmount); //TODO: should we require these (also in sell)?

            require(destToken.transfer(destAddress, actualDestAmount));
        } else {
            require(srcToken.transferFrom(msg.sender, this, srcAmount));

            if (srcToken.allowance(this, oasisDirect) < srcAmount) {
                srcToken.approve(oasisDirect, uint(-1)); //TODO - should we use -1 like in proxy??
            }

            actualDestAmount = oasisDirect.sellAllAmountBuyEth(otc, srcToken, srcAmount, wethToken, destAmount);
            require(actualDestAmount >= destAmount);

            destAddress.transfer(actualDestAmount);
        }

        TradeExecute(msg.sender, srcToken, srcAmount, destToken, actualDestAmount, destAddress);

        return true;
    }

    event DepositToken(ERC20 token, uint amount);
}
