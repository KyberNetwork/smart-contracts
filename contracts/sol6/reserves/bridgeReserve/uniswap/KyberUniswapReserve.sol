pragma solidity 0.6.6;

import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router01.sol";

import "../../../IKyberReserve.sol";
import "../../../IERC20.sol";
import "../../../utils/WithdrawableNoModifiers.sol";
import "../../../utils/Utils5.sol";
import "../../../utils/zeppelin/SafeERC20.sol";

contract KyberUniswapv2Reserve is IKyberReserve, WithdrawableNoModifiers, Utils5 {
    using SafeERC20 for IERC20;

    uint256 public constant DEFAULT_FEE_BPS = 0;
    uint256 public constant DEADLINE = 2**255;

    address public immutable kyberNetwork;
    // fee deducted for each trade
    uint256 public feeBps = DEFAULT_FEE_BPS;

    bool public tradeEnabled = true;

    IUniswapV2Router01 public immutable uniswapRouter;
    IUniswapV2Factory public immutable uniswapFactory;
    address public immutable weth;

    mapping(IERC20 => bool) public tokenListed;
    mapping(IERC20 => address[][]) public e2tSwapPaths;
    mapping(IERC20 => address[][]) public t2eSwapPaths;

    event TradeExecute(
        address indexed sender,
        IERC20 indexed srcToken,
        uint256 srcAmount,
        IERC20 indexed destToken,
        uint256 destAmount,
        address destAddress
    );

    event TokenListed(IERC20 indexed token, bool add);

    event TokenPathAdded(IERC20 indexed token, address[] path, bool isEthToToken, bool add);

    event TradeEnabled(bool enable);

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
        uniswapFactory = IUniswapV2Factory(_uniswapRouter.factory());
        admin = _admin;
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
        require(isValidTokens(srcToken, destToken), "token is not listed");

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

        uint256 destAmount;
        (uint256 actualRate, address[] memory path) = calcUniswapConversion(
            srcToken,
            destToken,
            srcAmount
        );
        require(conversionRate <= actualRate, "expected conversionRate <= actualRate");

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

    function listToken(
        IERC20 token,
        bool addDefaultPaths,
        bool validate
    ) external {
        onlyOperator();
        require(address(token) != address(0), "token 0");

        require(!tokenListed[token], "token is listed");
        tokenListed[token] = true;
        // list the direct path
        if (addDefaultPaths) {
            address[] memory paths = new address[](2);
            paths[0] = weth;
            paths[1] = address(token);
            addPath(token, paths, true);
            paths[0] = address(token);
            paths[1] = weth;
            addPath(token, paths, false);
        }
        // check if any path is exists for this token
        if (validate && !addDefaultPaths) {
            require(e2tSwapPaths[token].length != 0, "no path is exists for e2t");
            require(t2eSwapPaths[token].length != 0, "no path is exists for t2e");
        }

        token.safeApprove(address(uniswapRouter), 2**255);

        setDecimals(token);

        emit TokenListed(token, true);
    }

    function delistToken(IERC20 token) external {
        onlyOperator();
        require(tokenListed[token], "token is not listed");
        delete tokenListed[token];
        // clear all paths data
        delete t2eSwapPaths[token];
        delete e2tSwapPaths[token];

        token.safeApprove(address(uniswapRouter), 0);
        emit TokenListed(token, false);
    }

    function removePath(
        IERC20 token,
        bool isEthTotoken,
        uint256 index
    ) external {
        onlyOperator();
        address[][] storage allPaths;
        if (isEthTotoken) {
            allPaths = e2tSwapPaths[token];
        } else {
            allPaths = t2eSwapPaths[token];
        }
        require(index < allPaths.length, "invalid index");
        address[] memory path = allPaths[index];
        allPaths[index] = allPaths[allPaths.length - 1];
        allPaths.pop();

        emit TokenPathAdded(token, path, isEthTotoken, false);
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

    function addPath(
        IERC20 token,
        address[] memory path,
        bool isEthToToken
    ) public {
        onlyOperator();
        address[][] storage allPaths;

        require(path.length >= 2, "path is too short");
        if (isEthToToken) {
            require(path[0] == weth, "start address of path is not weth");
            require(
                path[path.length - 1] == address(token),
                "end address of path is not token"
            );
            allPaths = e2tSwapPaths[token];
        } else {
            require(path[0] == address(token), "start address of path is not token");
            require(path[path.length - 1] == weth, "end address of path is not weth");
            allPaths = t2eSwapPaths[token];
        }
        // verify the pair is existed and the pair has liquidity
        for (uint256 i = 0; i < path.length - 1; i++) {
            address uniswapPair = uniswapFactory.getPair(path[i], path[i + 1]);
            require(uniswapPair != address(0), "uniswapPair not found");
            (uint256 reserve0, uint256 reserve1, ) = IUniswapV2Pair(uniswapPair).getReserves();
            require(reserve0 > 0 && reserve1 > 0, "insufficient liquidity");
        }
        allPaths.push(path);

        emit TokenPathAdded(token, path, isEthToToken, true);
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
