pragma solidity 0.6.6;

import "../../../IKyberReserve.sol";
import "../../../IERC20.sol";
import "../../../utils/WithdrawableNoModifiers.sol";
import "../../../utils/Utils5.sol";
import "../../../utils/zeppelin/SafeERC20.sol";

interface IUniswapV2Router01 {
    function factory() external pure returns (address);

    function swapExactETHForTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable returns (uint256[] memory amounts);

    function swapExactTokensForETH(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);

    function getAmountsOut(uint256 amountIn, address[] calldata path)
        external
        view
        returns (uint256[] memory amounts);

    function getAmountsIn(uint256 amountOut, address[] calldata path)
        external
        view
        returns (uint256[] memory amounts);
}

interface IUniswapFactory {
    function getPair(address tokenA, address tokenB) external view returns (address pair);
}

interface IUniswapV2Pair {
    function getReserves()
        external
        view
        returns (
            uint112 reserve0,
            uint112 reserve1,
            uint32 blockTimestampLast
        );
}

contract KyberUniswapv2Reserve is IKyberReserve, WithdrawableNoModifiers, Utils5 {
    using SafeERC20 for IERC20;

    uint256 public constant DEFAULT_FEE_BPS = 25;
    uint256 public constant DEADLINE = 2**255;

    address public kyberNetwork;
    // fee deducted for each trade
    uint256 public feeBps = DEFAULT_FEE_BPS;

    bool public tradeEnabled = true;

    IUniswapV2Router01 public immutable uniswapRouter;
    IUniswapFactory public immutable uniswapFactory;
    address public immutable weth;

    mapping(IERC20 => bool) public tokenListed;
    mapping(IERC20 => address[][]) public e2tSwapPaths;
    mapping(IERC20 => address[][]) public t2eSwapPaths;

    event TradeExecute(
        address indexed sender,
        IERC20 srcToken,
        uint256 srcAmount,
        IERC20 destToken,
        uint256 destAmount,
        address destAddress
    );

    event TokenListed(IERC20 indexed token, bool add);

    event TradeEnabled(bool enable);

    event KyberNetworkSet(address kyberNetwork);

    event FeeUpdated(uint256 feeBps);

    event EtherReceival(address indexed sender, uint256 amount);

    constructor(
        IUniswapV2Router01 _uniswapRouter,
        address _weth,
        address _admin,
        address _kyberNetwork
    ) public WithdrawableNoModifiers(_admin) {
        require(address(_uniswapRouter) != address(0), "uniswapRouter 0");
        require(_weth != address(0), "weth 0");
        require(_kyberNetwork != address(0), "kyberNetwork 0");

        uniswapRouter = _uniswapRouter;
        uniswapFactory = IUniswapFactory(_uniswapRouter.factory());
        admin = _admin;
        weth = _weth;
        kyberNetwork = _kyberNetwork;
    }

    receive() external payable {
        emit EtherReceival(msg.sender, msg.value);
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

        (uint256 rate, ) = calcUniswapConversion(src, dest, srcQty);
        return rate;
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
        bool validate
    ) external override payable returns (bool) {
        require(tradeEnabled, "trade is disabled");
        require(msg.sender == kyberNetwork, "only kyberNetwork");
        require(isValidTokens(srcToken, destToken), "token is not listed");

        if (validate) {
            require(conversionRate > 0, "conversionRate 0");
            if (srcToken == ETH_TOKEN_ADDRESS)
                require(msg.value == srcAmount, "msg.value != srcAmount");
            else require(msg.value == 0, "msg.value is not 0");
        }

        uint256 expectedDestAmount = calcDestAmount(
            srcToken,
            destToken,
            srcAmount,
            conversionRate
        );

        uint256 destAmount;
        (uint256 actualRate, address[] memory path) = calcUniswapConversion(
            srcToken,
            destToken,
            srcAmount
        );
        require(conversionRate <= actualRate, "conversionRate > actualRate");

        if (srcToken == ETH_TOKEN_ADDRESS) {
            // Deduct fees (in ETH) before converting
            uint256 quantity = deductFee(srcAmount);

            uint256[] memory amounts = uniswapRouter.swapExactETHForTokens{value: quantity}(
                expectedDestAmount,
                path,
                destAddress,
                DEADLINE
            );
            destAmount = amounts[amounts.length - 1];
            require(destAmount >= expectedDestAmount, "Returned trade amount too low");
        } else {
            srcToken.safeTransferFrom(msg.sender, address(this), srcAmount);
            uint256[] memory amounts = uniswapRouter.swapExactTokensForETH(
                srcAmount,
                expectedDestAmount,
                path,
                address(this),
                DEADLINE
            );

            destAmount = amounts[amounts.length - 1];
            // Deduct fees (in ETH) after converting
            destAmount = deductFee(destAmount);
            require(destAmount >= expectedDestAmount, "Returned trade amount too low");
            // Transfer user-expected dest amount
            destAddress.transfer(expectedDestAmount);
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

    function setFee(uint256 _feeBps) external {
        onlyAdmin();
        require(_feeBps < BPS, "fee >= BPS");
        if (_feeBps != feeBps) {
            feeBps = _feeBps;
            emit FeeUpdated(_feeBps);
        }
    }

    function listToken(IERC20 token) external {
        onlyAdmin();
        require(address(token) != address(0), "token 0");

        require(!tokenListed[token], "token is listed");
        tokenListed[token] = true;
        // list the direct path
        address[] memory paths = new address[](2);
        paths[0] = weth;
        paths[1] = address(token);
        addPath(token, paths, true);
        paths[0] = address(token);
        paths[1] = weth;
        addPath(token, paths, false);

        token.safeApprove(address(uniswapRouter), 2**255);

        setDecimals(token);

        emit TokenListed(token, true);
    }

    function delistToken(IERC20 token) external {
        onlyAdmin();
        require(tokenListed[token], "token is not listed");
        delete tokenListed[token];
        // clear all paths data
        delete t2eSwapPaths[token];
        delete e2tSwapPaths[token];

        token.safeApprove(address(uniswapRouter), 0);
        emit TokenListed(token, false);
    }

    function addPath(
        IERC20 token,
        address[] memory paths,
        bool isEthToToken
    ) public {
        onlyAdmin();
        address[][] storage allPaths;

        require(paths.length >= 2, "paths is too short");
        if (isEthToToken) {
            require(paths[0] == weth, "start address of paths is not weth");
            require(
                paths[paths.length - 1] == address(token),
                "end address of paths is not token"
            );
            allPaths = e2tSwapPaths[token];
        } else {
            require(paths[0] == address(token), "start address of paths is not token");
            require(paths[paths.length - 1] == weth, "end address of paths is not weth");
            allPaths = t2eSwapPaths[token];
        }
        // verify the pair is existed and the pair has liquidity
        for (uint256 i = 0; i < paths.length - 1; i++) {
            address uniswapPair = uniswapFactory.getPair(paths[i], paths[i + 1]);
            require(uniswapPair != address(0), "uniswapPair not found");
            (uint256 reserve0, uint256 reserve1, ) = IUniswapV2Pair(uniswapPair).getReserves();
            require(reserve0 > 0 && reserve1 > 0, "insufficient liquidity");
        }
        allPaths.push(paths);
    }

    function removePath(
        IERC20 token,
        bool isEthTotoken,
        uint256 index
    ) external {
        onlyAdmin();
        address[][] storage allPaths;
        if (isEthTotoken) {
            allPaths = e2tSwapPaths[token];
        } else {
            allPaths = t2eSwapPaths[token];
        }
        require(index < allPaths.length, "invalid index");
        allPaths[index] = allPaths[allPaths.length - 1];
        allPaths.pop();
    }

    function enableTrade() external returns (bool) {
        onlyAdmin();
        tradeEnabled = true;
        emit TradeEnabled(true);
        return true;
    }

    function disableTrade() external returns (bool) {
        onlyAlerter();
        tradeEnabled = false;
        emit TradeEnabled(false);
        return true;
    }

    function setKyberNetwork(address _kyberNetwork) external {
        onlyAdmin();
        require(_kyberNetwork != address(0));
        if (kyberNetwork != _kyberNetwork) {
            kyberNetwork = _kyberNetwork;
            emit KyberNetworkSet(kyberNetwork);
        }
    }

    function deductFee(uint256 amount) internal view returns (uint256) {
        return (amount * (BPS - feeBps)) / BPS;
    }

    function isValidTokens(IERC20 src, IERC20 dest) internal view returns (bool) {
        return ((src == ETH_TOKEN_ADDRESS && tokenListed[dest]) ||
            (tokenListed[src] && dest == ETH_TOKEN_ADDRESS));
    }

    function calcUniswapConversion(
        IERC20 src,
        IERC20 dest,
        uint256 srcQty
    ) internal view returns (uint256 rate, address[] memory path) {
        uint256 destQty = 0;
        address[][] storage allPaths;
        if (src == ETH_TOKEN_ADDRESS) {
            uint256 amountLessFee = deductFee(srcQty);
            if (amountLessFee == 0) {
                return (rate, path);
            }

            allPaths = e2tSwapPaths[dest];
            for (uint256 i = 0; i < allPaths.length; i++) {
                address[] memory currentPath = allPaths[i];
                uint256[] memory amounts = uniswapRouter.getAmountsOut(amountLessFee, currentPath);
                if (amounts[amounts.length - 1] > destQty) {
                    destQty = amounts[amounts.length - 1];
                    path = currentPath;
                }
            }
        } else {
            allPaths = t2eSwapPaths[src];
            for (uint256 i = 0; i < allPaths.length; i++) {
                address[] memory currentPath = allPaths[i];
                uint256[] memory amounts = uniswapRouter.getAmountsOut(srcQty, currentPath);
                if (amounts[amounts.length - 1] > destQty) {
                    destQty = amounts[amounts.length - 1];
                    path = currentPath;
                }
            }
            destQty = deductFee(destQty);
        }
        if (destQty == 0) return (rate, path);
        rate = calcRateFromQty(srcQty, destQty, getDecimals(src), getDecimals(dest));
    }
}
