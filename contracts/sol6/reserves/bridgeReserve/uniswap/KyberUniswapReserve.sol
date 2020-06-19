pragma solidity 0.6.6;

import "../../../IKyberReserve.sol";
import "../../../IERC20.sol";
import "../../../utils/WithdrawableNoModifiers.sol";
import "../../../utils/Utils5.sol";
import "../../../utils/zeppelin/SafeMath.sol";
import "../../../utils/zeppelin/SafeERC20.sol";

library UniswapV2Library {
    using SafeMath for uint256;

    // returns sorted token addresses, used to handle return values from pairs sorted in this order
    function sortTokens(address tokenA, address tokenB)
        internal
        pure
        returns (address token0, address token1)
    {
        require(tokenA != tokenB, "UniswapV2Library: IDENTICAL_ADDRESSES");
        (token0, token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        require(token0 != address(0), "UniswapV2Library: ZERO_ADDRESS");
    }

    // given an input amount of an asset and pair reserves, returns the maximum output amount of the other asset
    function getAmountOut(
        uint256 amountIn,
        uint256 reserveIn,
        uint256 reserveOut
    ) internal pure returns (uint256 amountOut) {
        require(amountIn > 0, "UniswapV2Library: INSUFFICIENT_INPUT_AMOUNT");
        require(reserveIn > 0 && reserveOut > 0, "UniswapV2Library: INSUFFICIENT_LIQUIDITY");
        uint256 amountInWithFee = amountIn.mul(997);
        uint256 numerator = amountInWithFee.mul(reserveOut);
        uint256 denominator = reserveIn.mul(1000).add(amountInWithFee);
        amountOut = numerator / denominator;
    }
}

interface UniswapFactory {
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

    function swap(
        uint256 amount0Out,
        uint256 amount1Out,
        address to,
        bytes calldata data
    ) external;
}

interface IWETH {
    function deposit() external payable;

    function transfer(address to, uint256 value) external returns (bool);

    function withdraw(uint256) external;
}

/*
 * A reserve that connects to Uniswap.
 *
 */
contract KyberUniswapv2Reserve is IKyberReserve, WithdrawableNoModifiers, Utils5 {
    using SafeERC20 for IERC20;

    uint256 public constant DEFAULT_FEE_BPS = 25;

    address public kyberNetwork;
    // fee deducted for each trade
    uint256 public feeBps = DEFAULT_FEE_BPS;

    bool public tradeEnabled = true;

    UniswapFactory public immutable uniswapFactory;
    address public immutable weth;
    // tokenPairs[token]: Uniswap pair contract for listed token and weth
    mapping(address => address) public tokenPairs;

    event TradeExecute(
        address indexed sender,
        IERC20 srcToken,
        uint256 srcAmount,
        IERC20 destToken,
        uint256 destAmount,
        address destAddress
    );

    event TokenListed(IERC20 token, address uniswapPair, bool add);

    event TradeEnabled(bool enable);

    event KyberNetworkSet(address kyberNetwork);

    event FeeUpdated(uint256 feeBps);

    event EtherReceival(address indexed sender, uint256 amount);

    constructor(
        UniswapFactory _uniswapFactory,
        address _weth,
        address _admin,
        address _kyberNetwork
    ) public WithdrawableNoModifiers(_admin) {
        require(address(_uniswapFactory) != address(0), "uniswapFactory 0");
        require(_weth != address(0), "weth 0");
        require(_kyberNetwork != address(0), "kyberNetwork 0");

        uniswapFactory = _uniswapFactory;
        weth = _weth;
        admin = _admin;
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

        return calcUniswapConversion(src, dest, srcQty);
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
        require(tradeEnabled);
        require(msg.sender == kyberNetwork);
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

        IUniswapV2Pair uniswapPair;
        uint256 destAmount;
        if (srcToken == ETH_TOKEN_ADDRESS) {
            // Deduct fees (in ETH) before converting
            uint256 quantity = deductFee(srcAmount);
            IWETH(weth).deposit{value: quantity}();

            uniswapPair = IUniswapV2Pair(tokenPairs[address(destToken)]);
            require(
                IWETH(weth).transfer(address(uniswapPair), quantity),
                "failed to transfer weth to pair"
            );

            destAmount = swap(uniswapPair, weth, address(destToken), quantity, destAddress);
            require(destAmount >= expectedDestAmount, "Returned trade amount too low");
        } else {
            uniswapPair = IUniswapV2Pair(tokenPairs[address(srcToken)]);
            srcToken.safeTransferFrom(msg.sender, address(uniswapPair), srcAmount);
            destAmount = swap(uniswapPair, address(srcToken), weth, srcAmount, address(this));
            IWETH(weth).withdraw(destAmount);
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
        require(_feeBps <= 10000);
        if (_feeBps != feeBps) {
            feeBps = _feeBps;
            emit FeeUpdated(_feeBps);
        }
    }

    function listToken(IERC20 token) external {
        onlyAdmin();
        require(address(token) != address(0), "token 0");

        address uniswapPair = uniswapFactory.getPair(address(token), weth);
        require(uniswapPair != address(0), "uniswapPair not found");
        tokenPairs[address(token)] = uniswapPair;
        setDecimals(token);

        emit TokenListed(token, uniswapPair, true);
    }

    function delistToken(IERC20 token) external {
        onlyAdmin();
        require(tokenPairs[address(token)] != address(0), "token is not listed");
        address uniswapPair = tokenPairs[address(token)];

        delete tokenPairs[address(token)];

        TokenListed(token, uniswapPair, false);
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
        return ((src == ETH_TOKEN_ADDRESS && tokenPairs[address(dest)] != address(0)) ||
            (tokenPairs[address(src)] != address(0) && dest == ETH_TOKEN_ADDRESS));
    }

    function calcUniswapConversion(
        IERC20 src,
        IERC20 dest,
        uint256 srcQty
    ) internal view returns (uint256 rate) {
        IUniswapV2Pair uniswapPair;
        uint256 destQty;
        uint256 reserveSrcToken;
        uint256 reserveDestToken;
        if (src == ETH_TOKEN_ADDRESS) {
            uniswapPair = IUniswapV2Pair(tokenPairs[address(dest)]);

            uint256 amountLessFee = deductFee(srcQty);
            if (amountLessFee == 0) return 0;

            (reserveSrcToken, reserveDestToken) = getReserves(uniswapPair, weth, address(dest));
            destQty = UniswapV2Library.getAmountOut(
                amountLessFee,
                reserveSrcToken,
                reserveDestToken
            );
        } else {
            uniswapPair = IUniswapV2Pair(tokenPairs[address(src)]);
            (reserveSrcToken, reserveDestToken) = getReserves(uniswapPair, address(src), weth);
            destQty = deductFee(
                UniswapV2Library.getAmountOut(srcQty, reserveSrcToken, reserveDestToken)
            );
        }

        rate = calcRateFromQty(srcQty, destQty, getDecimals(src), getDecimals(dest));
    }

    function getReserves(
        IUniswapV2Pair uniswapPair,
        address srcToken,
        address destToken
    ) internal view returns (uint256 reserveSrcToken, uint256 reserveDestToken) {
        (address token0, ) = UniswapV2Library.sortTokens(srcToken, destToken);
        (uint256 reserve0, uint256 reserve1, ) = uniswapPair.getReserves();
        (reserveSrcToken, reserveDestToken) = srcToken == token0
            ? (reserve0, reserve1)
            : (reserve1, reserve0);
    }

    function swap(
        IUniswapV2Pair uniswapPair,
        address srcToken,
        address destToken,
        uint256 srcQty,
        address to
    ) internal returns (uint256 amountOut) {
        (address token0, ) = UniswapV2Library.sortTokens(srcToken, destToken);
        (uint256 reserve0, uint256 reserve1, ) = uniswapPair.getReserves();
        (uint256 reserveSrcToken, uint256 reserveDestToken) = srcToken == token0
            ? (reserve0, reserve1)
            : (reserve1, reserve0);

        amountOut = UniswapV2Library.getAmountOut(srcQty, reserveSrcToken, reserveDestToken);
        (uint256 amount0Out, uint256 amount1Out) = srcToken == token0
            ? (uint256(0), amountOut)
            : (amountOut, uint256(0));

        uniswapPair.swap(amount0Out, amount1Out, to, new bytes(0));
    }
}
