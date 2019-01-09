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
    struct Relation {
        uint eth;
        uint token;
    }

    Relation public ethToToken;
    Relation public tokenToEth;

    function getEthToTokenInputPrice(
        uint256 ethWei
    )
        external
        view
        returns (uint256 tokens_bought)
    {
        return ethToToken.token * ethWei / ethToToken.eth;
    }

    function getTokenToEthInputPrice(
        uint256 tokens_sold
    )
        external
        view
        returns (uint256 eth_bought)
    {
        return tokenToEth.eth * tokens_sold / tokenToEth.token;
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

    function setRateEthToToken(
        uint eth,
        uint token
    )
        public
    {
        ethToToken = Relation(eth, token);
    }

    function setRateTokenToEth(
        uint eth,
        uint token
    )
        public
    {
        tokenToEth = Relation(eth, token);
    }
}
