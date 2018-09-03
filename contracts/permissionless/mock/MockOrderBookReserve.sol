pragma solidity 0.4.18;


import "../OrderBookReserve.sol";


contract MockOrderBookReserve is OrderBookReserve {

    uint public bitmap;

    function MockOrderBookReserve(FeeBurnerSimpleIf burner, ERC20 knc, ERC20 token , FeeBurnerResolverInterface verifier)
        public
        OrderBookReserve(burner, knc, token, verifier)
    {

    }

    function testBindStakes(address maker, int amountTwei) public {
        bindOrderStakes(maker, amountTwei);
    }

    function testHandleStakes(address maker, uint stakeAmountTwei, uint burnAmountTwei) public {
        handleOrderStakes(maker, stakeAmountTwei, burnAmountTwei);
    }
}
