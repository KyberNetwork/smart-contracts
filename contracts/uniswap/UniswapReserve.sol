pragma solidity 0.4.18;

import "../Withdrawable.sol";
import "../KyberReserveInterface.sol";
import "../Utils2.sol";


interface UniswapExchange {
    function getEthToTokenInputPrice(uint256 eth_sold) external view returns (uint256 tokens_bought);
    function getTokenToEthInputPrice(uint256 tokens_sold) external view returns (uint256 eth_bought);
}


interface UniswapFactory {
    function getExchange(address token) external view returns (address exchange);
}


contract UniswapReserve is KyberReserveInterface, Withdrawable, Utils2 {
    // Parts per 1000
    uint public constant DEFAULT_FEE_BPS = 25;

    UniswapFactory public uniswapFactory;

    uint public feeBps = DEFAULT_FEE_BPS;

    // token -> exchange
    mapping (address => address) public tokenExchange;

    /**
        Constructor
    */
    function UniswapReserve(
        UniswapFactory _uniswapFactory,
        address _admin
    )
        public
    {
        require(address(_uniswapFactory) != 0);
        require(_admin != 0);

        uniswapFactory = _uniswapFactory;
        admin = _admin;
    }

    /**
        Returns dest quantity / source quantity.
    */
    function getConversionRate(
        ERC20 src,
        ERC20 dest,
        uint srcQty,
        uint blockNumber
    )
        public
        view
        returns(uint)
    {
        // This makes the UNUSED warning go away.
        blockNumber;

        require(isValidTokens(src, dest));

        ERC20 token;
        if (src == ETH_TOKEN_ADDRESS) {
            token = dest;
        } else if (dest == ETH_TOKEN_ADDRESS) {
            token = src;
        } else {
            return 0;
        }

        UniswapExchange exchange = UniswapExchange(
            uniswapFactory.getExchange(token)
        );

        uint convertedQuantity;
        if (src == ETH_TOKEN_ADDRESS) {
            uint quantity = srcQty - srcQty * feeBps / 10000;
            convertedQuantity = exchange.getEthToTokenInputPrice(quantity);
        } else {
            convertedQuantity = exchange.getTokenToEthInputPrice(srcQty);
            convertedQuantity = convertedQuantity -
                convertedQuantity * feeBps / 10000;
        }

        return calcRateFromQty(
            srcQty, /* srcAmount */
            convertedQuantity, /* destAmount */
            getDecimals(src), /* srcDecimals */
            getDecimals(dest) /* dstDecimals */
        );
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
    }

    function setFee(uint bps)
        public
        onlyAdmin
    {
        feeBps = bps;
    }

    event TokenListed(
        ERC20 token,
        UniswapExchange exchange
    );

    function listToken(ERC20 token)
        public
        onlyAdmin
    {
        require(address(token) != 0);
        UniswapExchange uniswapExchange = UniswapExchange(
            uniswapFactory.getExchange(token)
        );
        tokenExchange[token] = uniswapExchange;
        setDecimals(token);

        TokenListed(token, uniswapExchange);
    }

    event TokenDelisted(ERC20 token);

    function delistToken(ERC20 token)
        public
        onlyAdmin
    {
        require(tokenExchange[token] != 0);
        tokenExchange[token] = 0;


        TokenDelisted(token);
    }

    function isValidTokens(
        ERC20 src,
        ERC20 dest
    )
        public
        view
        returns(bool)
    {
        return (
            (src == ETH_TOKEN_ADDRESS && tokenExchange[dest] != 0) ||
            (tokenExchange[src] != 0 && dest == ETH_TOKEN_ADDRESS)
        );
    }
}
