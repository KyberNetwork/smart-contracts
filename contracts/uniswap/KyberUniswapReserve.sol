pragma solidity 0.4.18;

import "../Withdrawable.sol";
import "../KyberReserveInterface.sol";
import "../Utils2.sol";


interface UniswapExchange {
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


interface UniswapFactory {
    function getExchange(address token) external view returns (address exchange);
}


contract KyberUniswapReserve is KyberReserveInterface, Withdrawable, Utils2 {
    // Parts per 10000
    uint public constant DEFAULT_FEE_BPS = 25;

    UniswapFactory public uniswapFactory;
    address public kyberNetwork;

    uint public feeBps = DEFAULT_FEE_BPS;

    // Uniswap exchange contract for every listed token
    // token -> exchange
    mapping (address => address) public tokenExchange;

    // Internal inventory balance limits
    // token -> limit
    mapping (address => uint) public internalInventoryMin;
    mapping (address => uint) public internalInventoryMax;

    // Minimum spread in BPS required for using internal inventory
    // token -> limit
    mapping (address => uint) public internalActivationMinSpreadBps;

    // Premium BPS added to internal price (making it better).
    // token -> limit
    mapping (address => uint) public internalPricePremiumBps;

    bool public tradeEnabled = true;

    /**
        Constructor
    */
    function KyberUniswapReserve(
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

        if (!isValidTokens(src, dest)) return 0;
        if (!tradeEnabled) return 0;

        ERC20 token;
        if (src == ETH_TOKEN_ADDRESS) {
            token = dest;
        } else if (dest == ETH_TOKEN_ADDRESS) {
            token = src;
        } else {
            // Should never arrive here - isValidTokens requires one side to be ETH
            revert();
        }

        uint convertedQuantity;
        uint rate;
        (convertedQuantity, rate) = convertAndDeductFee(src, dest, srcQty);

        uint quantityWithPremium = addPremium(token, convertedQuantity);
        bool usingInternalInventory = shouldUseInternalInventory(
            src, /* srcToken */
            srcQty, /* srcAmount */
            dest, /* destToken */
            quantityWithPremium /* destAmount */
        );

        if (usingInternalInventory) {
            // If using internal inventory add premium to converted quantity
            return calcRateFromQty(
                srcQty, /* srcAmount */
                quantityWithPremium, /* destAmount */
                getDecimals(src), /* srcDecimals */
                getDecimals(dest) /* dstDecimals */
            );
        } else {
            // Use rate calculated from uniswap quantities after fees
            return rate;
        }
    }

    event TradeExecute(
        address indexed sender,
        address src,
        uint srcAmount,
        address destToken,
        uint destAmount,
        address destAddress,
        bool useInternalInventory
    );

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
        require(tradeEnabled);
        require(msg.sender == kyberNetwork);
        require(isValidTokens(srcToken, destToken));

        if (validate) {
            require(conversionRate > 0);
            if (srcToken == ETH_TOKEN_ADDRESS)
                require(msg.value == srcAmount);
            else
                require(msg.value == 0);
        }

        uint expectedDestAmount = calcDestAmount(
            srcToken, /* src */
            destToken, /* dest */
            srcAmount, /* srcAmount */
            conversionRate /* rate */
        );

        bool useInternalInventory = shouldUseInternalInventory(
            srcToken,
            srcAmount,
            destToken,
            expectedDestAmount
        );

        uint destAmount;
        UniswapExchange exchange;
        if (srcToken == ETH_TOKEN_ADDRESS) {
            if (!useInternalInventory) {
                // Convert with Uniswap
                // Deduct fees (in ETH) before converting
                uint quantity = deductFee(srcAmount);
                exchange = UniswapExchange(tokenExchange[address(destToken)]);
                destAmount = exchange.ethToTokenSwapInput.value(quantity)(
                    1, /* min_tokens: uniswap requires it to be > 0 */
                    2 ** 255 /* deadline */
                );
                require(destAmount >= expectedDestAmount);
            }

            // Transfer user-expected dest amount
            require(destToken.transfer(destAddress, expectedDestAmount));
        } else {
            require(srcToken.transferFrom(msg.sender, address(this), srcAmount));

            if (!useInternalInventory) {
                // Convert with Uniswap
                exchange = UniswapExchange(tokenExchange[address(srcToken)]);
                destAmount = exchange.tokenToEthSwapInput(
                    srcAmount,
                    1, /* min_eth: uniswap requires it to be > 0 */
                    2 ** 255 /* deadline */
                );
                // Deduct fees (in ETH) after converting
                destAmount = deductFee(destAmount);
                require(destAmount >= expectedDestAmount);
            }

            // Transfer user-expected dest amount
            destAddress.transfer(expectedDestAmount);
        }

        TradeExecute(
            msg.sender, /* sender */
            srcToken, /* src */
            srcAmount, /* srcAmount */
            destToken, /* destToken */
            expectedDestAmount, /* destAmount */
            destAddress, /* destAddress */
            useInternalInventory /* useInternalInventory */
        );
        return true;
    }

    event FeeUpdated(
        uint bps
    );

    function setFee(
        uint bps
    )
        public
        onlyAdmin
    {
        require(bps <= 10000);

        feeBps = bps;

        FeeUpdated(bps);
    }

    event InternalActivationConfigUpdated(
        ERC20 token,
        uint minSpreadBps,
        uint premiumBps
    );

    function setInternalActivationConfig(
        ERC20 token,
        uint minSpreadBps,
        uint premiumBps
    )
        public
        onlyAdmin
    {
        require(tokenExchange[address(token)] != address(0));
        require(minSpreadBps <= 1000); // min spread <= 10%
        require(premiumBps <= 500); // premium <= 5%

        internalActivationMinSpreadBps[address(token)] = minSpreadBps;
        internalPricePremiumBps[address(token)] = premiumBps;

        InternalActivationConfigUpdated(token, minSpreadBps, premiumBps);
    }

    event InternalInventoryLimitsUpdated(
        ERC20 token,
        uint minBalance,
        uint maxBalance
    );

    function setInternalInventoryLimits(
        ERC20 token,
        uint minBalance,
        uint maxBalance
    )
        public
        onlyOperator
    {
        require(tokenExchange[address(token)] != address(0));

        internalInventoryMin[address(token)] = minBalance;
        internalInventoryMax[address(token)] = maxBalance;

        InternalInventoryLimitsUpdated(token, minBalance, maxBalance);
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
        tokenExchange[address(token)] = address(uniswapExchange);
        setDecimals(token);

        require(token.approve(uniswapExchange, 2 ** 255));

        // internal inventory disabled by default
        internalInventoryMin[address(token)] = 2 ** 255;
        internalInventoryMax[address(token)] = 0;
        internalActivationMinSpreadBps[address(token)] = 0;
        internalPricePremiumBps[address(token)] = 0;

        TokenListed(token, uniswapExchange);
    }

    event TokenDelisted(ERC20 token);

    function delistToken(ERC20 token)
        public
        onlyAdmin
    {
        require(tokenExchange[address(token)] != address(0));

        delete tokenExchange[address(token)];
        delete internalInventoryMin[address(token)];
        delete internalInventoryMax[address(token)];
        delete internalActivationMinSpreadBps[address(token)];
        delete internalPricePremiumBps[address(token)];

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
            (
                src == ETH_TOKEN_ADDRESS &&
                tokenExchange[address(dest)] != address(0)
            ) ||
            (
                tokenExchange[address(src)] != address(0) &&
                dest == ETH_TOKEN_ADDRESS
            )
        );
    }

    event TradeEnabled(
        bool enable
    );

    function enableTrade()
        public
        onlyAdmin
        returns(bool)
    {
        tradeEnabled = true;
        TradeEnabled(true);
        return true;
    }

    function disableTrade()
        public
        onlyAlerter
        returns(bool)
    {
        tradeEnabled = false;
        TradeEnabled(false);
        return true;
    }

    event KyberNetworkSet(
        address kyberNetwork
    );

    function setKyberNetwork(
        address _kyberNetwork
    )
        public
        onlyAdmin
    {
        require(_kyberNetwork != 0);
        kyberNetwork = _kyberNetwork;
        KyberNetworkSet(kyberNetwork);
    }

    function shouldUseInternalInventory(
        ERC20 srcToken,
        uint srcAmount,
        ERC20 destToken,
        uint destAmount
    )
        public
        view
        returns(bool)
    {
        require(srcAmount < MAX_QTY);
        require(destAmount < MAX_QTY);

        // Check for internal inventory balance limitations
        ERC20 token;
        uint tokenAmount;
        uint ethAmount;
        if (srcToken == ETH_TOKEN_ADDRESS) {
            //  ETH -> Token
            token = destToken;
            tokenAmount = destAmount;
            ethAmount = srcAmount;
            uint tokenBalance = token.balanceOf(this);
            if (
                tokenBalance < tokenAmount ||
                tokenBalance - tokenAmount < internalInventoryMin[token]
            ) {
                return false;
            }
        } else {
            //  Token -> ETH
            token = srcToken;
            tokenAmount = srcAmount;
            ethAmount = destAmount;
            if (this.balance < ethAmount) return false;
            if (token.balanceOf(this) + tokenAmount > internalInventoryMax[token]) {
                return false;
            }
        }

        uint rateEthToToken;
        (, rateEthToToken) = convertAndDeductFee(
            ETH_TOKEN_ADDRESS,
            token,
            ethAmount
        );
        uint rateTokenToEth;
        (, rateTokenToEth) = convertAndDeductFee(
            token,
            ETH_TOKEN_ADDRESS,
            tokenAmount
        );

        // Check for arbitrage
        if (rateTokenToEth < rateEthToToken) return false;

        uint activationSpread = internalActivationMinSpreadBps[token];
        return calculateSpreadBps(rateEthToToken, rateTokenToEth) > activationSpread;
    }

    // Spread calculation is (ask - bid) / ((ask + bid) / 2).
    // We multiply by 10000 to get result in BPS.
    function calculateSpreadBps(
        uint rate1,
        uint rate2
    )
        public
        pure
        returns(uint)
    {
        uint diff = rate1 > rate2 ? rate1 - rate2 : rate2 - rate1;
        return 10000 * 2 * diff / (rate1 + rate2);
    }

    function deductFee(
        uint amount
    )
        public
        view
        returns(uint)
    {
        return amount * (10000 - feeBps) / 10000;
    }

    function addPremium(
        ERC20 token,
        uint amount
    )
        public
        view
        returns(uint)
    {
        require(amount <= MAX_QTY);
        return amount * (10000 + internalPricePremiumBps[token]) / 10000;
    }

    function convertAndDeductFee(
        ERC20 src,
        ERC20 dest,
        uint srcQty
    )
        internal
        view
        returns(uint convertedQuantity, uint rate)
    {
        UniswapExchange exchange;
        if (src == ETH_TOKEN_ADDRESS) {
            // ETH -> Token
            exchange = UniswapExchange(tokenExchange[address(dest)]);
            convertedQuantity = exchange.getEthToTokenInputPrice(
                deductFee(srcQty)
            );
        } else {
            // Token -> ETH
            exchange = UniswapExchange(tokenExchange[address(src)]);
            convertedQuantity = deductFee(
                exchange.getTokenToEthInputPrice(srcQty)
            );
        }

        rate = calcRateFromQty(
            srcQty, /* srcAmount */
            convertedQuantity, /* destAmount */
            getDecimals(src), /* srcDecimals */
            getDecimals(dest) /* dstDecimals */
        );
    }
}
