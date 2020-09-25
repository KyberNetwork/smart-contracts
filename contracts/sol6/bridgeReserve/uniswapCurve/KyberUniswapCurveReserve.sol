pragma solidity 0.6.6;

import "../../IKyberReserve.sol";
import "../../IERC20.sol";
import "../../utils/Withdrawable3.sol";
import "../../utils/Utils5.sol";
import "../../utils/zeppelin/SafeERC20.sol";

interface IUniswapRouterV02 {

    function swapExactTokensForTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external returns (uint[] memory amounts);
    function swapExactETHForTokens(
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    )
        external
        payable
        returns (uint[] memory amounts);
    function swapExactTokensForETH(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    )
        external
        returns (uint[] memory amounts);

    function getAmountsOut(
        uint amountIn,
        address[] calldata path
    ) 
        external view
        returns (uint[] memory amounts);
}

interface ICurveDefi {
    function get_dy(int128 i, int128 j, uint dx) external view returns(uint dy);
    function coins(int128 i) external view returns(address);
    function exchange(int128 i, int128 j, uint dx, uint256 minDy) external returns(uint dy);
}

/// Support trade eth - token by using both Uniswap and Curve
/// Works with 2 Curve pools USDT-USDC-DAI-sUSD and WBTC-renBTC
contract KyberUniswapCurveReserve is IKyberReserve, Withdrawable3, Utils5 {
    using SafeERC20 for IERC20;

    uint256 public constant DEADLINE = 2**255;

    address public kyberNetwork;
    bool public tradeEnabled = true;

    IUniswapRouterV02 public immutable uniswapRouter;
    address public immutable weth;

    mapping(IERC20 => bool) public tokenListed;
    // trade eth - token via a bridge token
    // for example: usdc and dai are brige tokens of usdt
    // when trade eth - usdt, can trade eth - usdc - usdt or eth - dai - usdt
    mapping(IERC20 => IERC20[]) public bridgeTokens;
    // index of a token in Curve pool as Curve is working with index
    mapping(IERC20 => int128) public tokenIndex;
    mapping(IERC20 => ICurveDefi) public curveDefiAddress;

    event TradeExecute(
        address indexed sender,
        IERC20 indexed srcToken,
        uint256 srcAmount,
        IERC20 indexed destToken,
        uint256 destAmount,
        address destAddress
    );

    event TokenListed(
        IERC20 indexed token,
        ICurveDefi curve,
        int128 index,
        IERC20[] bridgeTokens
    );
    event TokenDelisted(IERC20 indexed token);

    event TradeEnabled(bool enable);

    event BridgeTokensSet(IERC20 indexed token, IERC20[] bridgeTokens);

    event ApprovedAllowances(address curve, IERC20[] tokens, bool isReset);

    event EtherReceival(address indexed sender, uint256 amount);

    event KyberNetworkSet(address kyberNetwork);

    constructor(
        IUniswapRouterV02 _uniswapRouter,
        address _weth,
        address _admin,
        address _kyberNetwork
    ) public Withdrawable3(_admin) {
        require(_uniswapRouter != IUniswapRouterV02(0), "uniswapRouter 0");
        require(_weth != address(0), "weth 0");
        require(_kyberNetwork != address(0), "kyberNetwork 0");

        uniswapRouter = _uniswapRouter;
        weth = _weth;
        kyberNetwork = _kyberNetwork;
    }

    receive() external payable {
        emit EtherReceival(msg.sender, msg.value);
    }

    /**
      conversionRate: expected conversion rate should be >= this value.
     */
    function trade(
        IERC20 srcToken,
        uint256 srcAmount,
        IERC20 destToken,
        address payable destAddress,
        uint256 conversionRate,
        bool /* validate */
    ) external override payable returns (bool) {
        require(tradeEnabled, "trade is disabled");
        require(msg.sender == kyberNetwork, "only kyberNetwork");
        require(isValidTokens(srcToken, destToken), "only use eth and listed token");

        require(conversionRate > 0, "conversionRate 0");

        if (srcToken == ETH_TOKEN_ADDRESS) {
            require(msg.value == srcAmount, "msg.value != srcAmount");
        } else {
            require(msg.value == 0, "msg.value is not 0");
        }

        uint256 expectedDestAmount = calcDestAmount(
            srcToken,
            destToken,
            srcAmount,
            conversionRate
        );
        (IERC20 bridgeToken, bool useCurve, uint256 destAmount) = 
            getTradeInformation(srcToken, destToken, srcAmount);

        require(expectedDestAmount <= destAmount, "expected amount > actual amount");

        if (srcToken == ETH_TOKEN_ADDRESS) {
            destAmount = doTradeEthToToken(destToken, bridgeToken, useCurve, srcAmount);
            require(destAmount >= expectedDestAmount, "actual amount is low");
            destToken.safeTransfer(destAddress, expectedDestAmount);
        } else {
            destAmount = doTradeTokenToEth(srcToken, bridgeToken, useCurve, srcAmount);
            require(destAmount >= expectedDestAmount, "actual amount is low");
            (bool success, ) = destAddress.call{value: expectedDestAmount}("");
            require(success, "transfer eth from reserve to destAddress failed");
        }

        emit TradeExecute(
            msg.sender,
            srcToken,
            srcAmount,
            destToken,
            expectedDestAmount,
            destAddress
        );
        return true;
    }

    function setKyberNetwork(address _kyberNetwork) external onlyAdmin {
        require(_kyberNetwork != address(0));
        if (kyberNetwork != _kyberNetwork) {
            kyberNetwork = _kyberNetwork;
            emit KyberNetworkSet(kyberNetwork);
        }
    }

    /// @dev list a token to reserve
    /// assume token will be in a Curve pool
    /// bridgeTokens are list of tokens that are in the same Curve pool
    /// may need to call approveAllowances for these bridgeTokens
    function listToken(
        IERC20 token,
        ICurveDefi _curve,
        int128 _index,
        IERC20[] calldata _bridgeTokens, // tokens in the same Curve pool
        int128[] calldata _bridgeTokenIndices // index in Curve pool
    )
        external onlyOperator
    {
        require(token != IERC20(0), "token 0");
        require(!tokenListed[token], "token is listed");
        tokenListed[token] = true;

        token.safeApprove(address(uniswapRouter), MAX_ALLOWANCE);
        if (_curve != ICurveDefi(0)) {
            require(_curve.coins(_index) == address(token), "token index is not matched");
            curveDefiAddress[token] = _curve;
            if (token.allowance(address(this), address(_curve)) == 0) {
                token.safeApprove(address(_curve), MAX_ALLOWANCE);
            }
            tokenIndex[token] = _index;
            require(_bridgeTokens.length == _bridgeTokenIndices.length, "lengths mismatch");
            for(uint256 i = 0; i < _bridgeTokens.length; i++) {
                curveDefiAddress[_bridgeTokens[i]] = _curve;
                require(
                    _curve.coins(_bridgeTokenIndices[i]) == address(_bridgeTokens[i]),
                    "bridge index is not matched"
                );
                tokenIndex[_bridgeTokens[i]] = _bridgeTokenIndices[i];
            }
            bridgeTokens[token] = _bridgeTokens;
        }

        setDecimals(token);

        emit TokenListed(token, _curve, _index, _bridgeTokens);
    }

    function delistToken(IERC20 token) external onlyOperator {
        require(tokenListed[token], "token is not listed");
        delete tokenListed[token];
        delete tokenIndex[token];
        delete bridgeTokens[token];

        token.safeApprove(address(uniswapRouter), 0);

        ICurveDefi curveAddress = curveDefiAddress[token];
        if (curveAddress != ICurveDefi(0)) {
            token.safeApprove(address(curveAddress), 0);
            delete curveDefiAddress[token];
        }

        emit TokenDelisted(token);
    }

    // in some cases we need to approve allowances for bridge tokens
    function approveAllowances(
        address spender,
        IERC20[] calldata tokens,
        bool isReset
    )
        external onlyAdmin
    {
        uint256 allowance = isReset ? 0 : MAX_ALLOWANCE;
        for(uint256 i = 0; i < tokens.length; i++) {
            tokens[i].safeApprove(spender, allowance);
        }
        emit ApprovedAllowances(spender, tokens, isReset);
    }

    function enableTrade() external onlyAdmin returns (bool) {
        tradeEnabled = true;
        emit TradeEnabled(true);
        return true;
    }

    function disableTrade() external onlyAlerter returns (bool) {
        tradeEnabled = false;
        emit TradeEnabled(false);
        return true;
    }

    /**
     *   @dev called by kybernetwork to get settlement rate
     */
    function getConversionRate(
        IERC20 src,
        IERC20 dest,
        uint256 srcQty,
        uint256 /* blockNumber */
    ) external override view returns (uint256) {
        if (!isValidTokens(src, dest)) return 0;
        if (!tradeEnabled) return 0;
        if (srcQty == 0) return 0;

        (, , uint256 destAmount) =
            getTradeInformation(src, dest, srcQty);
        if (destAmount == 0) return 0;
        return calcRateFromQty(
            srcQty,
            destAmount,
            getDecimals(src),
            getDecimals(dest)
        );
    }

    function getTradeInformation(IERC20 src, IERC20 dest, uint256 srcQty)
        public view
        returns(IERC20 bridgeToken, bool useCurve, uint256 destAmount)
    {
        if (src == ETH_TOKEN_ADDRESS) {
            // check eth -> token in Uniwap, token -> dest in Curve
            destAmount = getUniswapDestAmount(dest, srcQty, true);
            useCurve = false;
            IERC20[] memory tokens = bridgeTokens[dest];
            for(uint256 i = 0; i < tokens.length; i++) {
                // swap eth -> tokens[i] in Uniswap, tokens[i] -> dest in Curve
                uint256 destQty = getUniswapDestAmount(tokens[i], srcQty, true);
                if (destQty > 0) {
                    destQty = getCurveDestAmount(tokens[i], dest, destQty);
                    if (destQty > destAmount) {
                        destAmount = destQty;
                        bridgeToken = tokens[i];
                        useCurve = true;
                    }
                }
            }
        } else {
            // check src -> token in Curve, token -> eth in Uniswap
            // first try to not use Curve
            destAmount = getUniswapDestAmount(src, srcQty, false);
            useCurve = false;
            IERC20[] memory tokens = bridgeTokens[src];
            for(uint256 i = 0; i < tokens.length; i++) {
                // swap src -> tokens[i] in Curve, tokens[i] -> eth in Uniswap
                uint256 destQty = getCurveDestAmount(src, tokens[i], srcQty);
                if (destQty > 0) {
                    destQty = getUniswapDestAmount(tokens[i], destQty, false);
                    if (destQty > destAmount) {
                        destAmount = destQty;
                        bridgeToken = tokens[i];
                        useCurve = true;
                    }
                }
            }
        }
    }

    function doTradeEthToToken(
        IERC20 token,
        IERC20 bridgeToken,
        bool useCurve,
        uint256 srcAmount
    )
        internal returns(uint destAmount)
    {
        address[] memory path;
        uint256[] memory amounts;
        if (!useCurve) {
            // directly swap with Uniswap
            path = getUniswapPath(token, true);
            amounts = uniswapRouter.swapExactETHForTokens{value: srcAmount}(
                0, path, address(this), DEADLINE
            );
            destAmount = amounts[1];
        } else {
            // swap eth -> bridge token on Uniswap
            path = getUniswapPath(bridgeToken, true);
            amounts = uniswapRouter.swapExactETHForTokens{value: srcAmount}(
                0, path, address(this), DEADLINE
            );
            // swap bridge token -> dest on Curve
            destAmount = curveDefiAddress[bridgeToken].exchange(
                tokenIndex[bridgeToken],
                tokenIndex[token],
                amounts[1],
                0
            );
        }
    }

    function doTradeTokenToEth(
        IERC20 token,
        IERC20 bridgeToken,
        bool useCurve,
        uint256 srcAmount
    ) internal returns(uint destAmount) {
        address[] memory path;
        uint256[] memory amounts;
        if (!useCurve) {
            // directly swap with Uniswap
            path = getUniswapPath(token, false);
            amounts = uniswapRouter.swapExactTokensForETH(
                srcAmount, 0, path, address(this), DEADLINE
            );
            destAmount = amounts[1];
        } else {
            // swap from src -> bridge token on Curve
            uint256 destQty = curveDefiAddress[bridgeToken].exchange(
                tokenIndex[token],
                tokenIndex[bridgeToken],
                srcAmount,
                0
            );
            // swap from bridge token -> eth on Uniswap
            path = getUniswapPath(bridgeToken, false);
            amounts = uniswapRouter.swapExactTokensForETH(
                destQty, 0, path, address(this), DEADLINE
            );
            destAmount = amounts[1];
        }
    }

    function isValidTokens(IERC20 src, IERC20 dest) internal view returns (bool) {
        return ((src == ETH_TOKEN_ADDRESS && tokenListed[dest]) ||
            (tokenListed[src] && dest == ETH_TOKEN_ADDRESS));
    }

    function getUniswapDestAmount(
        IERC20 token,
        uint256 srcQty,
        bool ethToToken
    ) internal view returns (uint256 destAmount) {
        address[] memory path = getUniswapPath(token, ethToToken);
        uint256[] memory amounts = uniswapRouter.getAmountsOut(srcQty, path);
        destAmount = amounts[1];
    }

    function getCurveDestAmount(
        IERC20 src,
        IERC20 dest,
        uint256 srcQty
    ) internal view returns (uint256 destAmount) {
        ICurveDefi curve = curveDefiAddress[src];
        if (curve != curveDefiAddress[dest]) return 0;
        destAmount = curve.get_dy(tokenIndex[src], tokenIndex[dest], srcQty);
    }

    function getUniswapPath(IERC20 token, bool ethToToken)
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
