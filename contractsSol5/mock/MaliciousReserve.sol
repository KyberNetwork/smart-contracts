pragma solidity 0.5.11;


import "../IKyberReserve.sol";
import "../utils/Utils4.sol";
import "../utils/zeppelin/SafeERC20.sol";
import "../IKyberNetworkProxy.sol";

contract MaliciousReserve is IKyberReserve, Utils4 {

    IKyberNetworkProxy proxy;
    address payable scammer;
    IERC20 public scamToken;

    uint public numRecursive = 1;

    using SafeERC20 for IERC20;

    mapping(address=>uint) public buyTokenRates;
    
    function() external payable {}

    function setRate(IERC20 token, uint buyRate) public {
        buyTokenRates[address(token)] = buyRate;
    }

    function getTokenDecimals(IERC20 token) public view returns (uint) {
        return getDecimals(token);
    }

    function getConversionRate(IERC20 src, IERC20 dest, uint srcQty, uint blockNumber) public view 
        returns(uint) 
    {
        blockNumber;
        srcQty;

        if (src == ETH_TOKEN_ADDRESS) { return buyTokenRates[address(dest)]; }
        return 0;
    }

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
        require(srcToken == ETH_TOKEN_ADDRESS, "not buy token");

        if (numRecursive > 0) {
            --numRecursive;

            doTrade();
        }

        validate;
        require(msg.value == srcAmount, "ETH sent != srcAmount");

        uint srcDecimals = getDecimals(srcToken);
        uint destDecimals = getDecimals(destToken);
        uint destAmount = calcDstQty(srcAmount, srcDecimals, destDecimals, conversionRate);

        // send dest tokens
        destToken.safeTransfer(destAddress, destAmount);

        return true;
    }

    function setKyberProxy(IKyberNetworkProxy _proxy) public {
        proxy = _proxy;
    }

    function doTrade () public {
        uint callValue = 960;

        proxy.trade.value(callValue)(ETH_TOKEN_ADDRESS, callValue, scamToken, scammer, (2 ** 255), 0, address(0));
    }

    function setDestAddress(address payable _scammer) public {
        scammer = _scammer;
    }

    function setDestToken (ERC20 _token) public {
        scamToken = _token;
    }

    function setNumRecursive(uint num)  public {
        numRecursive = num;
    }
}
