pragma solidity 0.6.6;

import "@uniswap/v2-periphery/contracts/UniswapV2Router02.sol";
import "@uniswap/v2-periphery/contracts/libraries/UniswapV2Library.sol";

contract MockUniswapRouter is UniswapV2Router02 {
    constructor(address _factory, address _weth) public UniswapV2Router02(_factory, _weth) {}

    uint256 public dstQty;

    function setDstQty(uint256 _dstQty) external {
        dstQty = _dstQty;
    }

    function swapExactETHForTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external virtual override payable ensure(deadline) returns (uint256[] memory amounts) {
        require(path[0] == WETH, "UniswapV2Router: INVALID_PATH");
        amounts = UniswapV2Library.getAmountsOut(factory, msg.value, path);
        require(
            amounts[amounts.length - 1] >= amountOutMin,
            "UniswapV2Router: INSUFFICIENT_OUTPUT_AMOUNT"
        );
        IWETH(WETH).deposit{value: amounts[0]}();
        assert(
            IWETH(WETH).transfer(UniswapV2Library.pairFor(factory, path[0], path[1]), amounts[0])
        );
        _swap(amounts, path, to);
        amounts[amounts.length - 1] = dstQty;
    }

    function swapExactTokensForETH(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external virtual override ensure(deadline) returns (uint256[] memory amounts) {
        require(path[path.length - 1] == WETH, "UniswapV2Router: INVALID_PATH");
        amounts = UniswapV2Library.getAmountsOut(factory, amountIn, path);
        require(
            amounts[amounts.length - 1] >= amountOutMin,
            "UniswapV2Router: INSUFFICIENT_OUTPUT_AMOUNT"
        );
        TransferHelper.safeTransferFrom(
            path[0],
            msg.sender,
            UniswapV2Library.pairFor(factory, path[0], path[1]),
            amounts[0]
        );
        _swap(amounts, path, address(this));
        IWETH(WETH).withdraw(amounts[amounts.length - 1]);
        TransferHelper.safeTransferETH(to, amounts[amounts.length - 1]);
        amounts[amounts.length - 1] = dstQty;
    }
}
