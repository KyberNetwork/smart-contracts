pragma solidity 0.4.18;

import "../UniswapReserve.sol";


contract TestingUniswapReserve is UniswapReserve {
    function TestingUniswapReserve(
        UniswapFactory _uniswapFactory,
        address _admin,
        address _kyberNetwork
    )
        UniswapReserve(_uniswapFactory, _admin, _kyberNetwork)
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
