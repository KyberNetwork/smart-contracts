pragma solidity 0.4.18;

import "../Withdrawable.sol";
import "../KyberReserveInterface.sol";


interface UniswapFactory {

}

// contract UniswapReserve is KyberReserveInterface, Withdrawable {
contract UniswapReserve is Withdrawable {
    UniswapFactory public uniswapFactory;

    function UniswapReserve(UniswapFactory _uniswapFactory) public {
        require(address(_uniswapFactory) != 0);
        uniswapFactory = _uniswapFactory;
    }

    function getConversionRate(
        ERC20 src,
        ERC20 dest,
        uint srcQty,
        uint blockNumber
    )
        public
        view
        returns(uint)
    {
    }

    function trade(
        ERC20 srcToken,
        uint srcAmount,
        ERC20 destToken,
        address destAddress,
        uint conversionRate,
        bool validate
    )
        public
        payable
        returns(bool)
    {
    }
}
