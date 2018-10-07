pragma solidity 0.4.18;


import "../OrderBookReserve.sol";


contract MockOrderBookReserve is OrderBookReserve {

    uint public bitmap;

    function MockOrderBookReserve(ERC20 knc, ERC20 _token, FeeBurnerResolverInterface resolver,
        OrdersFactoryInterface factory)
        public
        OrderBookReserve(knc, _token, resolver, factory, 25)
    {

    }

    function testBindStakes(address maker, int amountTwei) public {
        bindOrderStakes(maker, amountTwei);
    }

    function testHandleStakes(address maker, uint stakeAmountTwei, uint burnAmountTwei) public {
        handleOrderStakes(maker, stakeAmountTwei, burnAmountTwei);
    }
}
