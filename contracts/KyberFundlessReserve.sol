pragma solidity 0.4.18;


import "./ERC20Interface.sol";
import "./Utils.sol";
import "./Withdrawable.sol";
import "./ConversionRatesInterface.sol";
import "./KyberReserveInterface.sol";

contract OtcInterface {
    function sellAllAmount(address, uint, address, uint) public returns (uint);
    function buyAllAmount(address, uint, address, uint) public returns (uint);
    function getPayAmount(address, address, uint) public constant returns (uint);
    // my addition:
    function getBuyAmount(address, address, uint) public constant returns (uint fill_amt);
}

contract OasisDirectProxyInterface {
    function sellAllAmountPayEth(OtcInterface otc, ERC20 wethToken, ERC20 buyToken, uint minBuyAmt) public payable returns (uint buyAmt);
    function sellAllAmountBuyEth(OtcInterface otc, ERC20 payToken, uint payAmt, ERC20 wethToken, uint minBuyAmt) public returns (uint wethAmt);
}

/// @title Kyber Reserve contract
contract KyberFundlessReserve is KyberReserveInterface, Withdrawable, Utils {

    address public kyberNetwork;
    OasisDirectProxyInterface public oasisDirectProxy;
    OtcInterface public otc;
    ERC20 public wethToken;
    ERC20 public tradeToken;
    bool public tradeEnabled;

    function KyberFundlessReserve(address _kyberNetwork,
                                  OasisDirectProxyInterface _oasisDirectProxy,
                                  OtcInterface _otc,
                                  ERC20 _wethToken,
                                  ERC20 _tradeToken,
                                  address _admin
    ) public {
        // TODO - should get token as well?
        require(_admin != address(0));
        require(_oasisDirectProxy != address(0));
        require(_kyberNetwork != address(0));
        require(_otc != address(0));
        require(_wethToken != address(0));
        require(_tradeToken != address(0));

        kyberNetwork = _kyberNetwork;
        oasisDirectProxy = _oasisDirectProxy;
        otc = _otc;
        wethToken = _wethToken;
        tradeToken = _tradeToken;
        admin = _admin;
        tradeEnabled = true;
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
        OasisDirectProxyInterface oasisDirectProxy,
        OtcInterface otc,
        ERC20 wethToken,
        ERC20 tradeToken
    );

    function setContracts(
        address _kyberNetwork,
        OasisDirectProxyInterface _oasisDirectProxy,
        OtcInterface _otc,
        ERC20 _wethToken,
        ERC20 _tradeToken
    )
        public
        onlyAdmin
    {
        require(_kyberNetwork != address(0));
        require(_oasisDirectProxy != address(0));
        require(_otc != address(0));
        require(_wethToken != address(0));
        require(_tradeToken != address(0));

        kyberNetwork = _kyberNetwork;
        oasisDirectProxy = _oasisDirectProxy;
        otc = _otc;
        wethToken = _wethToken;
        tradeToken = _tradeToken;

        setContracts(kyberNetwork, oasisDirectProxy, otc, wethToken, tradeToken);
    }

    function getDestQty(ERC20 src, ERC20 dest, uint srcQty, uint rate) public view returns(uint) {
        uint dstDecimals = getDecimals(dest);
        uint srcDecimals = getDecimals(src);

        return calcDstQty(srcQty, srcDecimals, dstDecimals, rate);
    }

    function getConversionRate(ERC20 src, ERC20 dest, uint srcQty, uint blockNumber) public view returns(uint) {
        uint  rate;
        uint  dstQty;

        blockNumber;

        if (!tradeEnabled) return 0;

        if ((ETH_TOKEN_ADDRESS != src) && (ETH_TOKEN_ADDRESS != dest)){
            return 0;
        }

        if ((tradeToken != src) && (tradeToken != dest)){
            return 0;
        }

        dstQty = otc.getBuyAmount(src, dest, srcQty);
        rate = dstQty * PRECISION / srcQty;

        return rate;
    }

    /// @dev do a trade
    /// @param srcToken Src token
    /// @param srcAmount Amount of src token
    /// @param destToken Destination token
    /// @param destAddress Destination address to send tokens to
    /// @param validate If true, additional validations are applicable
    /// @return true iff trade is successful
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

        if ((ETH_TOKEN_ADDRESS != srcToken) && (ETH_TOKEN_ADDRESS != destToken)){
            return false;
        }

        if ((tradeToken != srcToken) && (tradeToken != destToken)){
            return false;
        }

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
            destAmount = oasisDirectProxy.sellAllAmountPayEth.value(msg.value)(otc, wethToken, destToken, destAmount);
            require(destToken.transferFrom(this, destAddress, destAmount));
        }
        else {
            //TODO - should approve moving from srcToken here??? 
            destAmount = oasisDirectProxy.sellAllAmountBuyEth(otc, srcToken, srcAmount, wethToken, destAmount);
            destAddress.transfer(destAmount);
        }

        TradeExecute(msg.sender, srcToken, srcAmount, destToken, destAmount, destAddress);

        return true;
    }
}
