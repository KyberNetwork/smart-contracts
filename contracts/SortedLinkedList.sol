pragma solidity 0.4.18;

import "./Utils2.sol";

contract SortedLinkedList is Utils2 {

    struct Order {
        address maker;
        uint128 srcAmount;
        uint128 dstAmount;
        uint64 prevId;
        uint64 nextId;
    }

    mapping (uint64 => Order) public orders;

    uint64 constant public TAIL_ID = 0;
    uint64 constant public HEAD_ID = 1;

    uint64 internal nextId = 2;

    Order internal HEAD;

    function SortedLinkedList() public {
        HEAD = Order({
            maker: 0,
            srcAmount: 0,
            dstAmount: 0,
            prevId: HEAD_ID,
            nextId: TAIL_ID
        });

        orders[HEAD_ID] = HEAD;
    }

    function add(uint128 srcAmount, uint128 dstAmount)
        internal
        returns(uint64)
    {
        uint64 prevId = findPrevOrderId(srcAmount, dstAmount);
        return addAfterValidId(srcAmount, dstAmount, prevId);
    }

    function addAfterId(uint128 srcAmount, uint128 dstAmount, uint64 prevId)
        internal
        returns(uint64)
    {
        validatePrevId(srcAmount, dstAmount, prevId);
        return addAfterValidId(srcAmount, dstAmount, prevId);
    }

    function addAfterValidId(
        uint128 srcAmount,
        uint128 dstAmount,
        uint64 prevId
    )
        private
        returns(uint64)
    {
        Order storage prevOrder = orders[prevId];

        // Add new order
        uint64 orderId = nextId++;
        orders[orderId] = Order({
            maker: msg.sender,
            srcAmount: srcAmount,
            dstAmount: dstAmount,
            prevId: prevId,
            nextId: prevOrder.nextId
        });

        // Update next order to point back to added order
        uint64 nextOrderId = prevOrder.nextId;
        if (nextOrderId != TAIL_ID) {
            Order storage nextOrder = orders[nextOrderId];
            nextOrder.prevId = orderId;
        }

        // Update previous order to point to added order
        prevOrder.nextId = orderId;

        return orderId;
    }

    function getOrderDetails(uint64 orderId)
        internal
        view
        returns (
            address _maker,
            uint128 _srcAmount,
            uint128 _dstAmount,
            uint64 _prevId,
            uint64 _nextId
        )
    {
        Order storage order = orders[orderId];
        return (
            order.maker,
            order.srcAmount,
            order.dstAmount,
            order.prevId,
            order.nextId
        );
    }

    function removeById(uint64 orderId) internal {
        verifyCanRemoveOrderById(orderId);

        // Remove link from list
        Order storage order = orders[orderId];
        orders[order.prevId].nextId = order.nextId;
        orders[order.nextId].prevId = order.prevId;

        // Remove from mapping
        delete orders[orderId];
    }

    // function updateById(uint64 orderId, uint128 srcAmount, uint128 dstAmount)
    //     internal
    //     {
    //
    // }

    function verifyCanRemoveOrderById(uint64 orderId) private view {
        require(orderId != HEAD_ID);

        Order storage order = orders[orderId];

        // Make sure such order exists in mapping.
        require(order.prevId != 0 || order.nextId != 0);

        // Make sure order maker is current user.
        require(order.maker == msg.sender);
    }

    function calculateOrderSortKey(uint128 srcAmount, uint128 dstAmount)
        public
        pure
        returns(uint)
    {
        return dstAmount * PRECISION / srcAmount;
    }

    function findPrevOrderId(uint128 srcAmount, uint128 dstAmount)
        public
        view
        returns(uint64)
    {
        uint newOrderKey = calculateOrderSortKey(srcAmount, dstAmount);

        // TODO: eliminate while loop.
        uint64 currId = HEAD_ID;
        Order storage curr = orders[currId];
        while (curr.nextId != TAIL_ID) {
            currId = curr.nextId;
            curr = orders[currId];
            uint key = calculateOrderSortKey(curr.srcAmount, curr.dstAmount);
            if (newOrderKey > key) {
                return curr.prevId;
            }
        }
        return currId;
    }

    function validatePrevId(
        uint128 srcAmount,
        uint128 dstAmount,
        uint64 prevId
    )
        private
        view
    {
        // Make sure prev is not the tail.
        require(prevId != TAIL_ID);

        Order storage prev = orders[prevId];

        // Make sure such order exists in mapping.
        require(prev.prevId != 0 || prev.nextId != 0);

        // Make sure that the new order should be after the provided prev id.
        uint prevKey = calculateOrderSortKey(prev.srcAmount, prev.dstAmount);
        uint key = calculateOrderSortKey(srcAmount, dstAmount);
        require(prevKey > key);
    }
}
