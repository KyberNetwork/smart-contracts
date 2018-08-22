pragma solidity 0.4.18;


import "../PermissionLessReserve.sol";


contract MockPermissionLess is PermissionLessReserve {

    uint public bitmap;

    function MockPermissionLess(FeeBurner burner, ERC20 knc, ERC20 token, address _admin) public
        PermissionLessReserve(_kyberNetwork, burner, knc, token, _admin)
    {

    }

    function testAllocateOrders(address maker, uint32 howMany) public {
        allocateOrders(maker, howMany);
    }

    function testTakeOrderId(address maker) public returns(uint32) {
        return takeOrderId(maker);
    }

    /// @dev mark order as free to use.
    function testReleaseOrderId(address maker, uint32 orderId) public returns(bool) {
        return releaseOrderId(maker, orderId);
    }

    function getBitMap(address maker) public view returns(uint) {
        return (uint(makerOrders[maker].takenBitmap));
    }

    function testBindStakes(address maker, uint amountTwei) public {
        bindOrderStakes(maker, amountTwei);
    }

    function testHandleStakes(address maker, uint stakeAmountTwei, uint burnAmountTwei) public {
        handleOrderStakes(maker, stakeAmountTwei, burnAmountTwei);
    }

    function testTakeFullOrder(uint32 orderId) public returns(bool result) {
        Order memory order = orders[orderId];

        ERC20 srcToken;
        ERC20 destToken;

        if (order.data == ETH_TO_TOKEN) {
            srcToken = ETH_TOKEN_ADDRESS;
            destToken = reserveToken;
        } else {
            srcToken = reserveToken;
            destToken = ETH_TOKEN_ADDRESS;
        }

        result = takeFullOrder(orderId, srcToken, destToken, order);

        if (srcToken == ETH_TOKEN_ADDRESS) {
            makerFunds[order.maker][ETH_TOKEN_ADDRESS] = 0;
        }
    }

    function testTakePartialOrder(uint32 orderId, uint128 srcAmount) public returns(bool result) {
        Order memory order = orders[orderId];

        ERC20 srcToken;
        ERC20 destToken;

        if (order.data == ETH_TO_TOKEN) {
            srcToken = ETH_TOKEN_ADDRESS;
            destToken = reserveToken;
        } else {
            srcToken = reserveToken;
            destToken = ETH_TOKEN_ADDRESS;
        }

//        uint32 orderId, ERC20 src, ERC20 dest, uint128 srcAmount, uint128 dstAmount
        require(srcAmount < order.srcAmount);
        uint128 dstAmount = order.dstAmount * srcAmount / order.srcAmount;
        result = takePartialOrder(orderId, srcToken, destToken, srcAmount, dstAmount);

        if (srcToken == ETH_TOKEN_ADDRESS) {
            makerFunds[order.maker][ETH_TOKEN_ADDRESS] = 0;
        }
    }
}
