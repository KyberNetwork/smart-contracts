pragma solidity 0.4.18;

import "./Utils2.sol";

contract Orders is Utils2 {

    struct Order {
        address maker;
        uint128 srcAmount;
        uint128 dstAmount;
        uint32 prevId;
        uint32 nextId;
    }

    mapping (uint32 => Order) public orders;

    uint32 constant public TAIL_ID = 0;
    uint32 constant public HEAD_ID = 1;

    uint32 internal nextId = 2;

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

    function add(address maker, uint128 srcAmount, uint128 dstAmount)
        internal
        returns(uint32)
    {
        uint32 prevId = findPrevOrderId(srcAmount, dstAmount);
        return addAfterValidId(maker, srcAmount, dstAmount, prevId);
    }

    function addAfterId(
        address maker,
        uint128 srcAmount,
        uint128 dstAmount,
        uint32 prevId
    )
        internal
        returns(uint32)
    {
        validatePrevId(srcAmount, dstAmount, prevId);
        return addAfterValidId(maker, srcAmount, dstAmount, prevId);
    }

    function addAfterValidId(
        address maker,
        uint128 srcAmount,
        uint128 dstAmount,
        uint32 prevId
    )
        private
        returns(uint32)
    {
        Order storage prevOrder = orders[prevId];

        // Add new order
        uint32 orderId = nextId++;
        orders[orderId] = Order({
            maker: maker,
            srcAmount: srcAmount,
            dstAmount: dstAmount,
            prevId: prevId,
            nextId: prevOrder.nextId
        });

        // Update next order to point back to added order
        uint32 nextOrderId = prevOrder.nextId;
        if (nextOrderId != TAIL_ID) {
            Order storage nextOrder = orders[nextOrderId];
            nextOrder.prevId = orderId;
        }

        // Update previous order to point to added order
        prevOrder.nextId = orderId;

        return orderId;
    }

    function getOrderDetails(uint32 orderId)
        internal
        view
        returns (
            address _maker,
            uint128 _srcAmount,
            uint128 _dstAmount,
            uint32 _prevId,
            uint32 _nextId
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

    function removeById(uint32 orderId) internal {
        verifyCanRemoveOrderById(orderId);

        // Disconnect order from list
        Order storage order = orders[orderId];
        orders[order.prevId].nextId = order.nextId;
        orders[order.nextId].prevId = order.prevId;
    }

    // The updated order id is returned following the update.
    function update(uint32 orderId, uint128 srcAmount, uint128 dstAmount)
        internal
        returns(uint32)
    {
        address maker = orders[orderId].maker;
        removeById(orderId);
        return add(maker, srcAmount, dstAmount);
    }

    // The updated order id is returned following the update.
    function updateWithPositionHint(
        uint32 orderId,
        uint128 srcAmount,
        uint128 dstAmount,
        uint32 prevId
    )
        internal
        returns(uint32)
    {
        address maker = orders[orderId].maker;
        removeById(orderId);
        return addAfterId(maker, srcAmount, dstAmount, prevId);
    }

    function verifyCanRemoveOrderById(uint32 orderId) private view {
        require(orderId != HEAD_ID);

        Order storage order = orders[orderId];

        // Make sure such order exists in mapping.
        require(order.prevId != 0 || order.nextId != 0);
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
        returns(uint32)
    {
        uint newOrderKey = calculateOrderSortKey(srcAmount, dstAmount);

        // TODO: eliminate while loop.
        uint32 currId = HEAD_ID;
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
        uint32 prevId
    )
        private
        view
    {
        // Make sure prev is not the tail.
        require(prevId != TAIL_ID);

        Order storage prev = orders[prevId];

        // Make sure such order exists in mapping.
        require(prev.prevId != 0 || prev.nextId != 0);

        // Make sure that the new order should be after the provided prevId.
        uint prevKey = calculateOrderSortKey(prev.srcAmount, prev.dstAmount);
        uint key = calculateOrderSortKey(srcAmount, dstAmount);
        require(prevKey > key);

        // Make sure that the new order should be before provided prevId's next
        // order.
        Order storage next = orders[prev.nextId];
        uint nextKey = calculateOrderSortKey(next.srcAmount, next.dstAmount);
        require(key > nextKey);
    }
}
