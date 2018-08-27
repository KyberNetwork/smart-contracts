pragma solidity 0.4.18;


import "../PermissionLessReserve.sol";


contract MockPermissionLess is PermissionLessReserve {

    uint public bitmap;

    function MockPermissionLess(FeeBurner burner, ERC20 knc, ERC20 token, address _admin) public
        PermissionLessReserve(burner, knc, token, _admin)
    {

    }

    function testAllocateOrders(address maker, uint32 howMany) public {
        sellList.allocateOrders(maker, howMany);
    }
//
//    function testTakeOrderId(address maker) public returns(uint32) {
//        return takeOrderId(maker);
//    }
//
//    /// @dev mark order as free to use.
//    function testReleaseOrderId(address maker, uint32 orderId) public returns(bool) {
//        return releaseOrderId(maker, orderId);
//    }
//
//    function getBitMap(address maker) public view returns(uint) {
//        return (uint(makerOrders[maker].takenBitmap));
//    }

    function testBindStakes(address maker, uint amountTwei) public {
        bindOrderStakes(maker, amountTwei);
    }

    function testHandleStakes(address maker, uint stakeAmountTwei, uint burnAmountTwei) public {
        handleOrderStakes(maker, stakeAmountTwei, burnAmountTwei);
    }

    function testTakeFullOrder(uint32 orderId, bool isEthToToken) public returns(bool result) {

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
            destToken = reserveToken;
        } else {
            srcToken = reserveToken;
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

    function testTakePartialOrder(uint32 orderId, uint128 srcAmount, bool isEthToToken) public returns(bool result) {

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
            destToken = reserveToken;
        } else {
            srcToken = reserveToken;
            destToken = ETH_TOKEN_ADDRESS;
        }

        OrderData memory data;
        (data.maker, data.nextId, data.isLastOrder, data.srcAmount, data.dstAmount) =
            list.getOrderData(orderId);

        //        uint32 orderId, ERC20 src, ERC20 dest, uint128 srcAmount, uint128 dstAmount
        require(srcAmount < data.srcAmount);

        uint128 dstAmount = data.dstAmount * srcAmount / data.srcAmount;
        result = takePartialOrder(orderId, srcToken, destToken, srcAmount, dstAmount, data.srcAmount, data.dstAmount);

        if (srcToken == ETH_TOKEN_ADDRESS) {
            makerFunds[data.maker][ETH_TOKEN_ADDRESS] = 0;
        }
    }
}
