pragma solidity 0.4.18;

import "../KyberUniswapReserve.sol";


contract TestingKyberUniswapReserve is KyberUniswapReserve {
    function TestingKyberUniswapReserve(
        UniswapFactory _uniswapFactory,
        address _admin,
        address _kyberNetwork
    )
        public
        KyberUniswapReserve(_uniswapFactory, _admin, _kyberNetwork)
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
