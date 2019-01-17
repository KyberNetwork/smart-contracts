pragma solidity 0.4.18;

import "../Withdrawable.sol";
import "../KyberReserveInterface.sol";
import "../Utils2.sol";


interface UniswapExchange {
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
}


interface UniswapFactory {
    function getExchange(address token) external view returns (address exchange);
}


contract UniswapReserve is KyberReserveInterface, Withdrawable, Utils2 {
    // Parts per 10000
    uint public constant DEFAULT_FEE_BPS = 25;

    UniswapFactory public uniswapFactory;
    address public kyberNetwork;

    uint public feeBps = DEFAULT_FEE_BPS;

    // token -> exchange
    mapping (address => address) public tokenExchange;

    /**
        Constructor
    */
    function UniswapReserve(
        UniswapFactory _uniswapFactory,
        address _admin,
        address _kyberNetwork
    )
        public
    {
        require(address(_uniswapFactory) != 0);
        require(_admin != 0);
        require(_kyberNetwork != 0);

        uniswapFactory = _uniswapFactory;
        admin = _admin;
        kyberNetwork = _kyberNetwork;
    }

    function() public payable {
        // anyone can deposit ether
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
            uint quantity = srcQty * (10000 - feeBps) / 10000;
            convertedQuantity = exchange.getEthToTokenInputPrice(quantity);
        } else {
            convertedQuantity = exchange.getTokenToEthInputPrice(srcQty);
            convertedQuantity = convertedQuantity * (10000 - feeBps) / 10000;
        }

        return calcRateFromQty(
            srcQty, /* srcAmount */
            convertedQuantity, /* destAmount */
            getDecimals(src), /* srcDecimals */
            getDecimals(dest) /* dstDecimals */
        );
    }

    /**
      conversionRate: expected conversion rate should be >= this value.
     */
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
        require(msg.sender == kyberNetwork);
        require(isValidTokens(srcToken, destToken));

        uint expectedConversionRate = getConversionRate(
            srcToken,
            destToken,
            srcAmount,
            0 /* blockNumber */
        );
        require (expectedConversionRate <= conversionRate);

        uint amount;
        UniswapExchange exchange;
        if (srcToken == ETH_TOKEN_ADDRESS) {
            require(srcAmount == msg.value);

            // Fees in ETH
            uint quantity = srcAmount * (10000 - feeBps) / 10000;
            exchange = UniswapExchange(tokenExchange[destToken]);
            amount = exchange.ethToTokenSwapInput.value(quantity)(
                0,
                2 ** 255 /* deadline */
            );
            require(destToken.transfer(destAddress, amount));
        } else {
            require(msg.value == 0);
            require(srcToken.transferFrom(msg.sender, address(this), srcAmount));

            exchange = UniswapExchange(tokenExchange[srcToken]);
            amount = exchange.tokenToEthSwapInput(
                srcAmount,
                0,
                2 ** 255 /* deadline */
            );
            // Fees in ETH
            amount = amount * (10000 - feeBps) / 10000;
            destAddress.transfer(amount);
        }

        return true;
    }

    function setFee(uint bps)
        public
        onlyAdmin
    {
        require(bps <= 10000);

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

        require(token.approve(uniswapExchange, 2**255));

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
