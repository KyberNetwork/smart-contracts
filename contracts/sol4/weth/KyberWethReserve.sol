pragma solidity 0.4.18;

import "../ERC20Interface.sol";
import "../Utils2.sol";
import "../Withdrawable.sol";
import "../nimbleReserveInterface.sol";


contract WethInterface is ERC20 {
    function deposit() public payable;
    function withdraw(uint) public;
}


contract nimbleWethReserve is nimbleReserveInterface, Withdrawable, Utils2 {

    uint constant internal COMMON_DECIMALS = 18;
    address public sanityRatesContract = 0;
    address public nimbleNetwork;
    WethInterface public wethToken;
    bool public tradeEnabled;

    function nimbleWethReserve(address _nimbleNetwork, WethInterface _wethToken, address _admin) public {
        require(_admin != address(0));
        require(_nimbleNetwork != address(0));
        require(_wethToken != address(0));
        require(getDecimals(_wethToken) == COMMON_DECIMALS);

        nimbleNetwork = _nimbleNetwork;
        wethToken = _wethToken;
        tradeEnabled = true;
        admin = _admin;
    }

    function() public payable {
        require(msg.sender == address(wethToken));
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
        require(msg.sender == nimbleNetwork);

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

    event nimbleNetworkSet(address nimbleNetwork);

    function setnimbleNetwork(address _nimbleNetwork) public onlyAdmin {
        require(_nimbleNetwork != address(0));

        nimbleNetwork = _nimbleNetwork;
        nimbleNetworkSet(nimbleNetwork);
    }

    function getConversionRate(ERC20 src, ERC20 dest, uint srcQty, uint blockNumber) public view returns(uint) {

        srcQty;
        blockNumber;

        if (!tradeEnabled) return 0;
        if ((wethToken != src) && (wethToken != dest)) return 0;
        if ((ETH_TOKEN_ADDRESS != src) && (ETH_TOKEN_ADDRESS != dest)) return 0;

        return 1 * PRECISION;
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
        require((ETH_TOKEN_ADDRESS == srcToken) || (ETH_TOKEN_ADDRESS == destToken));
        require((wethToken == srcToken) || (wethToken == destToken));

        // can skip validation if done at nimble network level
        if (validate) {
            require(conversionRate > 0);
            if (srcToken == ETH_TOKEN_ADDRESS)
                require(msg.value == srcAmount);
            else
                require(msg.value == 0);
        }

        uint dstAmount = calcDstQty(srcAmount, COMMON_DECIMALS, COMMON_DECIMALS, conversionRate);
        require(dstAmount > 0); // sanity check

        if (srcToken == ETH_TOKEN_ADDRESS) {
            wethToken.deposit.value(srcAmount)();
            require(wethToken.transfer(destAddress, dstAmount));
        } else {
            require(srcToken.transferFrom(msg.sender, this, srcAmount));
            wethToken.withdraw(dstAmount);
            destAddress.transfer(dstAmount); 
        }

        TradeExecute(msg.sender, srcToken, srcAmount, destToken, dstAmount, destAddress);

        return true;
    }
}
