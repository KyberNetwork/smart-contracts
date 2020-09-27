pragma solidity 0.4.18;

import "../../KyberReserveInterface.sol";
import "../../ERC20Interface.sol";
import "../../Withdrawable.sol";
import "../../Utils3.sol";

interface UniswapV2Factory {
    function getPair(address tokenA, address tokenB) external view returns (address pair);
}

interface UniswapRouterV01 {

    function swapExactETHForTokens(
        uint amountOutMin,
        address[] memory path,
        address to,
        uint deadline
    )
        public
        payable
        returns (uint[] memory amounts);
    function swapExactTokensForETH(
        uint amountIn,
        uint amountOutMin,
        address[] memory path,
        address to,
        uint deadline
    )
        public
        returns (uint[] memory amounts);

    function factory() external pure returns (address);
    function WETH() external pure returns (address);
    function getAmountOut(uint amountIn, uint reserveIn, uint reserveOut)
        external pure returns (uint amountOut);
}

interface CurveDefiInterface {
    function get_dy(int128 i, int128 j, uint dx) external view returns(uint dy);
    function coins(int128 i) public view returns(address);
    function exchange(int128 i, int128 j, uint dx, uint256 minDy) public returns(uint dy);
}

/// Support trade eth - token by using both Uniswap and Curve
/// Works with 2 Curve pools USDT-USDC-DAI-sUSD and WBTC-renBTC
contract KyberUniswapCurveReserve is KyberReserveInterface, Withdrawable, Utils3 {

    uint256 public constant DEADLINE = 2**255;
    uint256 internal constant MAX_ALLOWANCE = uint256(-1);

    address public kyberNetwork;
    bool public tradeEnabled = true;

    UniswapRouterV01 public uniswapRouter;
    UniswapV2Factory public uniswapFactory;
    address public weth;

    mapping(address => bool) public tokenListed;
    // trade eth - token via a bridge token
    // for example: usdc and dai are brige tokens of usdt
    // when trade eth - usdt, can trade eth - usdc - usdt or eth - dai - usdt
    mapping(address => address[]) public bridgeTokens;
    // index of a token in Curve pool as Curve is working with index
    mapping(address => int128) public tokenIndex;
    mapping(address => address) public curveDefiAddress;
    mapping(address => address) public uniswapPair;

    event TradeExecute(
        address indexed sender,
        ERC20 indexed srcToken,
        uint256 srcAmount,
        ERC20 indexed destToken,
        uint256 destAmount,
        address destAddress
    );

    event TokenListed(
        ERC20 indexed token,
        CurveDefiInterface curve,
        int128 index,
        ERC20[] bridgeTokens
    );
    event TokenDelisted(ERC20 indexed token);

    event TradeEnabled(bool enable);

    event BridgeTokensSet(ERC20 indexed token, ERC20[] bridgeTokens);

    event ApprovedAllowances(address curve, ERC20[] tokens, bool isReset);

    event EtherReceival(address indexed sender, uint256 amount);

    event KyberNetworkSet(address kyberNetwork);

    function KyberUniswapCurveReserve(
        UniswapRouterV01 _uniswapRouter,
        address _kyberNetwork
    ) public Withdrawable() {
        require(_uniswapRouter != UniswapRouterV01(0));
        require(_kyberNetwork != address(0));

        uniswapRouter = _uniswapRouter;
        weth = _uniswapRouter.WETH();
        uniswapFactory = UniswapV2Factory(_uniswapRouter.factory());
        kyberNetwork = _kyberNetwork;
    }

    function() public payable {
        EtherReceival(msg.sender, msg.value);
    }

    /**
      conversionRate: expected conversion rate should be >= this value.
     */
    function trade(
        ERC20 srcToken,
        uint256 srcAmount,
        ERC20 destToken,
        address destAddress,
        uint256 conversionRate,
        bool /* validate */
    ) public payable returns (bool) {
        require(tradeEnabled);
        require(msg.sender == kyberNetwork);
        require(isValidTokens(srcToken, destToken));

        require(conversionRate > 0);

        if (srcToken == ETH_TOKEN_ADDRESS) {
            require(msg.value == srcAmount);
        } else {
            require(msg.value == 0);
        }

        uint256 expectedDestAmount = calcDestAmount(
            srcToken,
            destToken,
            srcAmount,
            conversionRate
        );

        ERC20 bridgeToken;
        bool useCurve; // whether using Curve is better
        uint256 destAmount;
        uint256 uniswapDestAmount;
        (bridgeToken, useCurve, destAmount, uniswapDestAmount) = 
            getTradeInformation(srcToken, destToken, srcAmount);

        require(expectedDestAmount <= destAmount);

        if (srcToken == ETH_TOKEN_ADDRESS) {
            destAmount = doTradeEthToToken(
                destToken,
                bridgeToken,
                useCurve,
                srcAmount,
                uniswapDestAmount
            );
            require(destAmount >= expectedDestAmount);
            destToken.transfer(destAddress, expectedDestAmount);
        } else {
            // collect src amount
            srcToken.transferFrom(msg.sender, address(this), srcAmount);
            destAmount = doTradeTokenToEth(
                srcToken,
                bridgeToken,
                useCurve,
                srcAmount,
                uniswapDestAmount
            );
            require(destAmount >= expectedDestAmount);
            destAddress.transfer(expectedDestAmount);
        }

        TradeExecute(
            msg.sender,
            srcToken,
            srcAmount,
            destToken,
            expectedDestAmount,
            destAddress
        );
        return true;
    }

    function setKyberNetwork(address _kyberNetwork) public onlyAdmin {
        require(_kyberNetwork != address(0));
        if (kyberNetwork != _kyberNetwork) {
            kyberNetwork = _kyberNetwork;
            KyberNetworkSet(kyberNetwork);
        }
    }

    /// @dev list a token to reserve
    /// assume token will be in a Curve pool
    /// bridgeTokens are list of tokens that are in the same Curve pool
    /// may need to call approveAllowances for these bridgeTokens
    function listToken(
        ERC20 token,
        CurveDefiInterface _curve,
        int128 _index,
        ERC20[] memory _bridgeTokens, // tokens in the same Curve pool
        int128[] memory _bridgeTokenIndices // index in Curve pool
    )
        public onlyOperator
    {
        require(token != ERC20(0));
        require(!tokenListed[token]);
        tokenListed[token] = true;

        token.approve(uniswapRouter, MAX_ALLOWANCE);
        uniswapPair[token] = uniswapFactory.getPair(weth, address(token));

        if (_curve != CurveDefiInterface(0)) {
            require(_curve.coins(_index) == address(token));
            curveDefiAddress[token] = _curve;
            if (token.allowance(address(this), _curve) == 0) {
                token.approve(_curve, MAX_ALLOWANCE);
            }
            tokenIndex[token] = _index;
            require(_bridgeTokens.length == _bridgeTokenIndices.length);
            for(uint256 i = 0; i < _bridgeTokens.length; i++) {
                curveDefiAddress[_bridgeTokens[i]] = _curve;
                require(_curve.coins(_bridgeTokenIndices[i]) == address(_bridgeTokens[i]));
                tokenIndex[_bridgeTokens[i]] = _bridgeTokenIndices[i];
            }
            bridgeTokens[token] = _bridgeTokens;
        }

        setDecimals(token);

        TokenListed(token, _curve, _index, _bridgeTokens);
    }

    function delistToken(ERC20 token) public onlyOperator {
        require(tokenListed[token]);
        delete tokenListed[token];
        delete tokenIndex[token];
        delete bridgeTokens[token];

        token.approve(uniswapRouter, 0);
        delete uniswapPair[token];

        address curveAddress = curveDefiAddress[token];
        if (curveAddress != address(0)) {
            token.approve(curveAddress, 0);
            delete curveDefiAddress[token];
        }

        TokenDelisted(token);
    }

    // in some cases we need to approve allowances for bridge tokens
    function approveAllowances(
        address spender,
        ERC20[] memory tokens,
        bool isReset
    )
        public onlyAdmin
    {
        uint256 allowance = isReset ? 0 : MAX_ALLOWANCE;
        for(uint256 i = 0; i < tokens.length; i++) {
            tokens[i].approve(spender, allowance);
        }
        ApprovedAllowances(spender, tokens, isReset);
    }

    function enableTrade() public onlyAdmin returns (bool) {
        tradeEnabled = true;
        TradeEnabled(true);
        return true;
    }

    function disableTrade() public onlyAlerter returns (bool) {
        tradeEnabled = false;
        TradeEnabled(false);
        return true;
    }

    /**
     *   @dev called by kybernetwork to get settlement rate
     */
    function getConversionRate(
        ERC20 src,
        ERC20 dest,
        uint256 srcQty,
        uint256 /* blockNumber */
    ) public view returns (uint256) {
        if (!isValidTokens(src, dest)) return 0;
        if (!tradeEnabled) return 0;
        if (srcQty == 0) return 0;

        uint256 destAmount;
        (, , destAmount, ) =
            getTradeInformation(src, dest, srcQty);
        if (destAmount == 0) return 0;
        return calcRateFromQty(
            srcQty,
            destAmount,
            getDecimals(src),
            getDecimals(dest)
        );
    }

    function getTradeInformation(ERC20 src, ERC20 dest, uint256 srcQty)
        public view
        returns(
            ERC20 bridgeToken,
            bool useCurve,
            uint256 destAmount,
            uint256 uniswapDestAmount
        )
    {
        address[] memory tokens;
        ERC20 token;
        uint256 i;
        uint256 destQty;
        uint256 destUniswapQty;

        if (src == ETH_TOKEN_ADDRESS) {
            // check eth -> token in Uniwap, token -> dest in Curve
            // first, not use Curve, get amount eth-> dest in Uniswap
            uniswapDestAmount = getUniswapDestAmount(dest, srcQty, true);
            destAmount = uniswapDestAmount;
            useCurve = false;
            tokens = bridgeTokens[dest];
            for(i = 0; i < tokens.length; i++) {
                token = ERC20(tokens[i]);
                // swap eth -> token in Uniswap, token -> dest in Curve
                destUniswapQty = getUniswapDestAmount(token, srcQty, true);
                if (destUniswapQty > 0) {
                    destQty = getCurveDestAmount(token, dest, destUniswapQty);
                    if (destQty > destAmount) {
                        destAmount = destQty;
                        uniswapDestAmount = destUniswapQty;
                        bridgeToken = token;
                        useCurve = true;
                    }
                }
            }
        } else {
            // check src -> token in Curve, token -> eth in Uniswap
            // first try to not use Curve
            uniswapDestAmount = getUniswapDestAmount(src, srcQty, false);
            destAmount = uniswapDestAmount;
            useCurve = false;
            tokens = bridgeTokens[src];
            for(i = 0; i < tokens.length; i++) {
                token = ERC20(tokens[i]);
                // swap src -> token in Curve, token -> eth in Uniswap
                destQty = getCurveDestAmount(src, token, srcQty);
                if (destQty > 0) {
                    destUniswapQty = getUniswapDestAmount(token, destQty, false);
                    if (destUniswapQty > destAmount) {
                        destAmount = destUniswapQty;
                        uniswapDestAmount = destUniswapQty;
                        bridgeToken = token;
                        useCurve = true;
                    }
                }
            }
        }
    }

    function getUniswapDestAmount(
        ERC20 token,
        uint256 srcQty,
        bool ethToToken
    ) public view returns (uint256 destAmount) {
        address pair = uniswapPair[token];
        if (pair == address(0)) { return 0; }
        uint256 wethBalance = ERC20(weth).balanceOf(pair);
        uint256 tokenBalance = token.balanceOf(pair);
        if (ethToToken) {
            destAmount = uniswapRouter.getAmountOut(srcQty, wethBalance, tokenBalance);
        } else {
            destAmount = uniswapRouter.getAmountOut(srcQty, tokenBalance, wethBalance);
        }
    }

    function getCurveDestAmount(
        ERC20 src,
        ERC20 dest,
        uint256 srcQty
    ) public view returns (uint256 destAmount) {
        CurveDefiInterface curve = CurveDefiInterface(curveDefiAddress[src]);
        if (curve != curveDefiAddress[dest]) return 0;
        destAmount = curve.get_dy(tokenIndex[src], tokenIndex[dest], srcQty);
    }

    function doTradeEthToToken(
        ERC20 token,
        ERC20 bridgeToken,
        bool useCurve,
        uint256 srcAmount,
        uint256 uniswapDestAmount
    )
        internal returns(uint destAmount)
    {
        address[] memory path = new address[](2);
        if (!useCurve) {
            // directly swap with Uniswap
            path = getUniswapPath(token, true);
            uniswapRouter.swapExactETHForTokens.value(srcAmount)(
                0, path, address(this), DEADLINE
            );
            destAmount = uniswapDestAmount;
        } else {
            // swap eth -> bridge token on Uniswap
            path = getUniswapPath(bridgeToken, true);
            uniswapRouter.swapExactETHForTokens.value(srcAmount)(
                0, path, address(this), DEADLINE
            );
            // swap bridge token -> dest on Curve
            destAmount = CurveDefiInterface(curveDefiAddress[bridgeToken]).exchange(
                tokenIndex[bridgeToken],
                tokenIndex[token],
                uniswapDestAmount,
                0
            );
        }
    }

    function doTradeTokenToEth(
        ERC20 token,
        ERC20 bridgeToken,
        bool useCurve,
        uint256 srcAmount,
        uint256 uniswapDestAmount
    ) internal returns(uint destAmount) {
        address[] memory path = new address[](2);
        if (!useCurve) {
            // directly swap with Uniswap
            path = getUniswapPath(token, false);
            uniswapRouter.swapExactTokensForETH(
                srcAmount, 0, path, address(this), DEADLINE
            );
        } else {
            // swap from src -> bridge token on Curve
            uint256 destQty = CurveDefiInterface(curveDefiAddress[bridgeToken]).exchange(
                tokenIndex[token],
                tokenIndex[bridgeToken],
                srcAmount,
                0
            );
            // swap from bridge token -> eth on Uniswap
            path = getUniswapPath(bridgeToken, false);
            uniswapRouter.swapExactTokensForETH(
                destQty, 0, path, address(this), DEADLINE
            );
        }
        destAmount = uniswapDestAmount;
    }

    function isValidTokens(ERC20 src, ERC20 dest) internal view returns (bool) {
        return ((src == ETH_TOKEN_ADDRESS && tokenListed[dest]) ||
            (tokenListed[src] && dest == ETH_TOKEN_ADDRESS));
    }

    function getUniswapPath(ERC20 token, bool ethToToken)
        internal
        view
        returns(address[] memory path)
    {
        path = new address[](2);
        if (ethToToken) {
            path[0] = weth;
            path[1] = address(token);
        } else {
            path[0] = address(token);
            path[1] = weth;
        }
    }
}
