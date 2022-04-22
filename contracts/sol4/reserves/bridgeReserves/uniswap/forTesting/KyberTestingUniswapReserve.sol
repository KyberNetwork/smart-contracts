pragma solidity 0.4.18;

import "../nimbleUniswapReserve.sol";


contract TestingnimbleUniswapReserve is nimbleUniswapReserve {
    function TestingnimbleUniswapReserve(
        UniswapFactory _uniswapFactory,
        address _admin,
        address _nimbleNetwork
    )
        public
        nimbleUniswapReserve(_uniswapFactory, _admin, _nimbleNetwork)
    {
    }

    function getTokenDecimals(ERC20 token)
        public
        view
        returns(uint)
    {
        return decimals[token];
    }
}
