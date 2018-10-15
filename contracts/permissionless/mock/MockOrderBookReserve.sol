pragma solidity 0.4.18;


import "../OrderBookReserve.sol";


contract MockOrderBookReserve is OrderBookReserve {

    function MockOrderBookReserve(
        ERC20 knc,
        ERC20 reserveToken,
        FeeBurnerResolverInterface resolver,
        OrderFactoryInterface factory,
        uint minOrderMakeWei,
        uint minOrderWei,
        uint burnFeeBps
    )
        public
        OrderBookReserve(knc, reserveToken, resolver, factory, minOrderMakeWei, minOrderWei, burnFeeBps)
    {
    }

    function testBindStakes(address maker, int amountTwei) public {
        bindOrderStakes(maker, amountTwei);
    }

    function testHandleStakes(address maker, uint stakeAmountTwei, uint burnAmountTwei) public {
        handleOrderStakes(maker, stakeAmountTwei, burnAmountTwei);
    }
}
