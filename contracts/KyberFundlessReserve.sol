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
    function withdrawAndSend(ERC20 wethToken, uint wethAmt) internal;
    function sellAllAmount(OtcInterface otc, ERC20 payToken, uint payAmt, ERC20 buyToken, uint minBuyAmt) public returns (uint buyAmt);
    function sellAllAmountPayEth(OtcInterface otc, ERC20 wethToken, ERC20 buyToken, uint minBuyAmt) public payable returns (uint buyAmt);
    function sellAllAmountBuyEth(OtcInterface otc, ERC20 payToken, uint payAmt, ERC20 wethToken, uint minBuyAmt) public returns (uint wethAmt);
    function buyAllAmount(OtcInterface otc, ERC20 buyToken, uint buyAmt, ERC20 payToken, uint maxPayAmt) public returns (uint payAmt);
    function buyAllAmountPayEth(OtcInterface otc, ERC20 buyToken, uint buyAmt, ERC20 wethToken) public payable returns (uint wethAmt);
    function buyAllAmountBuyEth(OtcInterface otc, ERC20 wethToken, uint wethAmt, ERC20 payToken, uint maxPayAmt) public returns (uint payAmt);
}

/// @title Kyber Reserve contract
contract KyberFundlessReserve is KyberReserveInterface, Withdrawable, Utils {

    address public kyberNetwork;
    OasisDirectProxyInterface public oasisDirectProxy;
    OtcInterface public otc;
    ERC20 public wethToken; 
    bool public tradeEnabled;
    //mapping(bytes32=>bool) public approvedWithdrawAddresses; // sha3(token,address)=>bool
    //mapping(address=>address) public tokenWallet;

    function KyberFundlessReserve(address _kyberNetwork,
                                  OasisDirectProxyInterface _oasisDirectProxy,
                                  OtcInterface _otc,
                                  ERC20 _wethToken,
                                  address _admin
    ) public {
        // TODO - should get token as well?
        require(_admin != address(0));
        require(_oasisDirectProxy != address(0));
        require(_kyberNetwork != address(0));
        require(_otc != address(0));
        kyberNetwork = _kyberNetwork;
        oasisDirectProxy = _oasisDirectProxy;
        otc = _otc;
        wethToken = _wethToken;
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

//TODO - implement setContracts

/*
    event SetContractAddresses(address network, address rate);

    function setContracts(
        address _kyberNetwork,
        ConversionRatesInterface _conversionRates,
    )
        public
        onlyAdmin
    {
        require(_kyberNetwork != address(0));
        require(_conversionRates != address(0));

        kyberNetwork = _kyberNetwork;
        conversionRatesContract = _conversionRates;

        SetContractAddresses(kyberNetwork, conversionRatesContract);
    }
*/

/*
    function getDestQty(ERC20 src, ERC20 dest, uint srcQty, uint rate) public view returns(uint) {
        uint dstDecimals = getDecimals(dest);
        uint srcDecimals = getDecimals(src);

        return calcDstQty(srcQty, srcDecimals, dstDecimals, rate);
    }

    function getSrcQty(ERC20 src, ERC20 dest, uint dstQty, uint rate) public view returns(uint) {
        uint dstDecimals = getDecimals(dest);
        uint srcDecimals = getDecimals(src);

        return calcSrcQty(dstQty, srcDecimals, dstDecimals, rate);
    }
*/

    function getConversionRate(ERC20 src, ERC20 dest, uint srcQty, uint blockNumber) public view returns(uint) {
        uint  rate;
        uint  dstQty;

        blockNumber;

        if (!tradeEnabled) return 0;

        if ((ETH_TOKEN_ADDRESS != src) && (ETH_TOKEN_ADDRESS != dest)){
            return 0; // pair is not listed
        }

        dstQty = otc.getBuyAmount(src, dest, srcQty);
        rate = srcQty * PRECISION / dstQty;

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
        //TODO - what to do with conversionRate???
        uint destAmount;
        //TODO minBuyAmt = ???
        uint minBuyAmt = 0;

        // can skip validation if done at kyber network level
        if (validate) {
            require(conversionRate > 0);
            if (srcToken == ETH_TOKEN_ADDRESS)
                require(msg.value == srcAmount);
            else
                require(msg.value == 0);
        }

        // TODO: need the getDestQty here?
        /*
        uint destAmount = getDestQty(srcToken, destToken, srcAmount, conversionRate);
        // sanity check
        require(destAmount > 0);
        */

        //TODO: need recordImbalance?


        if (srcToken == ETH_TOKEN_ADDRESS) {
            destAmount = oasisDirectProxy.sellAllAmountPayEth.value(msg.value)(otc, wethToken, destToken, minBuyAmt);
            require(destToken.transferFrom(this, destAddress, destAmount));
        }
        else {
            //TODO - should approve moving from srcToken here??? 
            destAmount = oasisDirectProxy.sellAllAmountBuyEth(otc, srcToken, srcAmount, wethToken, minBuyAmt);
            destAddress.transfer(destAmount);
        }

        TradeExecute(msg.sender, srcToken, srcAmount, destToken, destAmount, destAddress);

        return true;
    }
}
