pragma solidity 0.4.18;

import "../NimbleUniswapReserve.sol";


contract TestingNimbleUniswapReserve is NimbleUniswapReserve {
    function TestingNimbleUniswapReserve(
        UniswapFactory _uniswapFactory,
        address _admin,
        address _NimbleNetwork
    )
        public
        NimbleUniswapReserve(_uniswapFactory, _admin, _NimbleNetwork)
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
