pragma solidity 0.4.18;


import "../OrderBookReserve.sol";


contract MockOrderBookReserve is OrderBookReserve {

    uint public bitmap;

    function MockOrderBookReserve(FeeBurner burner, ERC20 knc, ERC20 token) public
        OrderBookReserve(burner, knc, token)
    {

    }

    function testBindStakes(address maker, uint amountTwei) public {
        bindOrderStakes(maker, amountTwei);
    }

    function testHandleStakes(address maker, uint stakeAmountTwei, uint burnAmountTwei) public {
        handleOrderStakes(maker, stakeAmountTwei, burnAmountTwei);
    }

    function testTakeFullOrder(bool isEthToToken, uint32 orderId) public returns(bool result) {

        Orders list;

        if (isEthToToken) {
            list = buyList;
        } else {
            list = sellList;
        }

        ERC20 srcToken;
        ERC20 destToken;

        if (isEthToToken) {
            srcToken = ETH_TOKEN_ADDRESS;
            destToken = token;
        } else {
            srcToken = token;
            destToken = ETH_TOKEN_ADDRESS;
        }

        OrderData memory data;
        (data.maker, data.nextId, data.isLastOrder, data.srcAmount, data.dstAmount) =
            list.getOrderData(orderId);

        result = takeFullOrder(orderId, srcToken, destToken, data.maker, data.srcAmount, data.dstAmount);

        if (srcToken == ETH_TOKEN_ADDRESS) {
            makerFunds[data.maker][ETH_TOKEN_ADDRESS] = 0;
        }
    }

    function testTakePartialOrder(bool isEthToToken, uint32 orderId, uint128 srcAmount) public returns(bool result) {

        Orders list;

        if (isEthToToken) {
            list = buyList;
        } else {
            list = sellList;
        }

        ERC20 srcToken;
        ERC20 destToken;

        if (isEthToToken) {
            srcToken = ETH_TOKEN_ADDRESS;
            destToken = token;
        } else {
            srcToken = token;
            destToken = ETH_TOKEN_ADDRESS;
        }

        OrderData memory data;
        (data.maker, data.nextId, data.isLastOrder, data.srcAmount, data.dstAmount) =
            list.getOrderData(orderId);

        //        uint32 orderId, ERC20 src, ERC20 dest, uint128 srcAmount, uint128 dstAmount
        require(srcAmount < data.srcAmount);

        uint128 dstAmount = data.dstAmount * srcAmount / data.srcAmount;
        result = takePartialOrder(orderId, data.maker, srcToken, destToken, srcAmount, dstAmount, data.srcAmount,
            data.dstAmount);

        if (srcToken == ETH_TOKEN_ADDRESS) {
            makerFunds[data.maker][ETH_TOKEN_ADDRESS] = 0;
        }
    }
}
