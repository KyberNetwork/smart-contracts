pragma solidity 0.4.18;

import "../../../../ERC20Interface.sol";


interface MockUniswapExchange {
    function ethToTokenSwapInput(
        uint256 min_tokens,
        uint256 deadline
    )
        external
        payable
        returns (uint256  tokens_bought);

    function tokenToEthSwapInput(
        uint256 tokens_sold,
        uint256 min_eth,
        uint256 deadline
    )
        external
        returns (uint256  eth_bought);

    function getEthToTokenInputPrice(
        uint256 eth_sold
    )
        public
        view
        returns (uint256 tokens_bought);

    function getTokenToEthInputPrice(
        uint256 tokens_sold
    )
        public
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

    ERC20 public token;

    function() public payable {
        // anyone can deposit ether
    }

    function getEthToTokenInputPrice(
        uint256 ethWei
    )
        public
        view
        returns (uint256 tokens_bought)
    {
        // current uniswap implementation reverts when query with 0.
        // even it later it doesn't we have no reason to query with 0 amount
        require(ethWei > 0);
        return ethWei * ethToToken.token / ethToToken.eth;
    }

    function getTokenToEthInputPrice(
        uint256 tokens_sold
    )
        public
        view
        returns (uint256 eth_bought)
    {
        // current uniswap implementation reverts when query with 0.
        // even it later it doesn't we have no reason to query with 0 amount
        require(tokens_sold > 0);
        return tokens_sold * tokenToEth.eth / tokenToEth.token;
    }

    function getExchange(
        address _token
    )
        external
        view
        returns (address exchange)
    {
        _token;  // eliminating unused variable warning

        return address(this);
    }

    function createExchange(
        address _token
    )
        external
        view
        returns(address exchange)
    {
        _token;  // eliminating unused variable warning

        return address(this);
    }

    function ethToTokenSwapInput(
        uint256 min_tokens,
        uint256 deadline
    )
        external
        payable
        returns (uint256  tokens_bought)
    {
        require(msg.value > 0);
        min_tokens;  // eliminating unused variable warning

        require(deadline > block.timestamp);

        uint amount = getEthToTokenInputPrice(msg.value);
        require(token.transfer(msg.sender, amount));
        return amount;
    }

    function tokenToEthSwapInput(
        uint256 tokens_sold,
        uint256 min_eth,
        uint256 deadline
    )
        external
        returns (uint256  eth_bought)
    {
        require(tokens_sold > 0);

        min_eth;  // eliminating unused variable warning

        require(deadline > block.timestamp);

        require(token.transferFrom(msg.sender, address(this), tokens_sold));
        uint amount = getTokenToEthInputPrice(tokens_sold);
        msg.sender.transfer(amount);
        return amount;
    }

    function setRateEthToToken(
        uint eth,
        uint _token
    )
        public
    {
        ethToToken = Factors(eth, _token);
    }

    function setRateTokenToEth(
        uint eth,
        uint _token
    )
        public
    {
        tokenToEth = Factors(eth, _token);
    }

    function setToken(ERC20 _token)
        public
    {
        token = _token;
    }
}
