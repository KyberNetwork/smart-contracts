pragma solidity 0.4.18;


import "../OrderbookReserve.sol";


contract MockOrderbookReserve is OrderbookReserve {

    function MockOrderbookReserve(
        ERC20 knc,
        ERC20 reserveToken,
        address burner,
        uint minOrderMakeWei,
        uint minOrderWei,
        uint burnFeeBps
    )
        public
        OrderbookReserve(knc, reserveToken, burner, minOrderMakeWei, minOrderWei, burnFeeBps)
    {
    }

    function testBindStakes(address maker, int amountTwei) public {
        bindOrderStakes(maker, amountTwei);
    }

    function testHandleStakes(address maker, uint stakeAmountTwei, uint burnAmountTwei) public {
        handleOrderStakes(maker, stakeAmountTwei, burnAmountTwei);
    }
}
