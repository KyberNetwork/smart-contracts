pragma solidity 0.4.18;


interface MockUniswapExchange {
    function getEthToTokenInputPrice(
        uint256 eth_sold
    )
        external
        view
        returns (uint256 tokens_bought);

    function getTokenToEthInputPrice(
        uint256 tokens_sold
    )
        external
        view
        returns (uint256 eth_bought);
}


contract MockUniswapFactory is MockUniswapExchange {
    struct Factors {
        uint eth;
        uint token;
    }

    Factors public ethToToken;
    Factors public tokenToEth;

    function getEthToTokenInputPrice(
        uint256 ethWei
    )
        external
        view
        returns (uint256 tokens_bought)
    {
        return ethWei * ethToToken.token / ethToToken.eth;
    }

    function getTokenToEthInputPrice(
        uint256 tokens_sold
    )
        external
        view
        returns (uint256 eth_bought)
    {
        return tokens_sold * tokenToEth.eth / tokenToEth.token;
    }

    function getExchange(
        address token
    )
        external
        view
        returns (address exchange)
    {
        return address(this);
    }

    function createExchange(
        address token
    )
        external
        returns(address exchange)
    {
        return address(this);
    }

    function setRateEthToToken(
        uint eth,
        uint token
    )
        public
    {
        ethToToken = Factors(eth, token);
    }

    function setRateTokenToEth(
        uint eth,
        uint token
    )
        public
    {
        tokenToEth = Factors(eth, token);
    }
}
