pragma solidity 0.4.18;


import "../OrderbookReserve.sol";


contract MockOrderbookReserve is OrderbookReserve {

    function MockOrderbookReserve(
        ERC20 knc,
        ERC20 reserveToken,
        address burner,
        address network,
        MedianizerInterface medianizer,
        uint minNewOrderDollar,
        uint maxOrdersPerTrade,
        uint burnFeeBps
    )
        public
        OrderbookReserve(knc, reserveToken, burner, network, medianizer, minNewOrderDollar, maxOrdersPerTrade, burnFeeBps)
    {
    }

    function testBindStakes(address maker, int amountWei) public {
        bindOrderStakes(maker, amountWei);
    }

    function testHandleStakes(address maker, uint weiAmount, uint burnWeiAmount) public {
        handleOrderStakes(maker, weiAmount, burnWeiAmount);
    }
}
