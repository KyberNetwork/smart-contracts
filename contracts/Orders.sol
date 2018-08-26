pragma solidity 0.4.18;


import "./Utils2.sol";


contract Orders is Utils2 {

    struct Order {
        address maker;
        uint32 prevId;
        uint32 nextId;
        uint8 data;
        uint128 srcAmount;
        uint128 dstAmount;
    }

    mapping (uint32 => Order) public orders;

    uint8 constant public ETH_TO_TOKEN = 1;
    uint8 constant public TOKEN_TO_ETH = 2;

    uint32 constant public TAIL_ID = 1;
    uint32 constant public BUY_HEAD_ID = 2;
    uint32 constant public SELL_HEAD_ID = 3;

    uint32 public nextId = 4;

    Order internal BUY_HEAD;
    Order internal SELL_HEAD;

    function Orders() public {

        BUY_HEAD = Order({
            maker: 0,
            prevId: BUY_HEAD_ID,
            nextId: TAIL_ID,
            data: ETH_TO_TOKEN,
            srcAmount: 0,
            dstAmount: 0
        });

        SELL_HEAD = Order({
            maker: 0,
            prevId: SELL_HEAD_ID,
            nextId: TAIL_ID,
            data: TOKEN_TO_ETH,
            srcAmount: 0,
            dstAmount: 0
        });

        orders[BUY_HEAD_ID] = BUY_HEAD;
        orders[SELL_HEAD_ID] = SELL_HEAD;
    }

    function getOrderDetails(uint32 orderId)
        public
        view
        returns (
            address _maker,
            uint128 _srcAmount,
            uint128 _dstAmount,
            uint32 _prevId,
            uint32 _nextId,
            uint8 _data
        )
    {
        Order storage order = orders[orderId];
        return (
            order.maker,
            order.srcAmount,
            order.dstAmount,
            order.prevId,
            order.nextId,
            order.data
        );
    }

    function add(address maker, uint32 newId, uint128 srcAmount, uint128 dstAmount, uint32 headId, uint8 data)
        internal
        returns(uint32)
    {
        uint32 prevId = findPrevOrderId(srcAmount, dstAmount, headId);
        return addAfterValidId(maker, newId, srcAmount, dstAmount, prevId, data);
    }

    function addAfterId(
        address maker,
        uint32 newId,
        uint128 srcAmount,
        uint128 dstAmount,
        uint32 prevId,
        uint8 data
    )
        internal
        returns(uint32)
    {
        validatePrevId(srcAmount, dstAmount, prevId);
        return addAfterValidId(maker, newId, srcAmount, dstAmount, prevId, data);
    }

    function addAfterValidId(
        address maker,
        uint32 newId,
        uint128 srcAmount,
        uint128 dstAmount,
        uint32 prevId,
        uint8 orderData
    )
        private
        returns(uint32)
    {
        Order storage prevOrder = orders[prevId];

        // Add new order
        orders[newId].maker = maker;
        orders[newId].prevId = prevId;
        orders[newId].nextId = prevOrder.nextId;
        orders[newId].data = orderData;
        orders[newId].srcAmount = srcAmount;
        orders[newId].dstAmount = dstAmount;

        // Update next order to point back to added order
        uint32 nextOrderId = prevOrder.nextId;
        if (nextOrderId != TAIL_ID) {
            orders[nextOrderId].prevId = newId;
        }

        // Update previous order to point to added order
        prevOrder.nextId = newId;

        return newId;
    }

    function removeById(uint32 orderId) internal {
        verifyCanRemoveOrderById(orderId);

        // Disconnect order from list
        Order storage order = orders[orderId];
        orders[order.prevId].nextId = order.nextId;
        orders[order.nextId].prevId = order.prevId;
    }

    // The updated order id is returned following the update.
    function update(uint32 orderId, uint128 srcAmount, uint128 dstAmount, uint32 headId)
        internal
        returns(uint32)
    {
        address maker = orders[orderId].maker;
        uint8 data = orders[orderId].data;

        removeById(orderId);

        return add(maker, orderId, srcAmount, dstAmount, headId, data);
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
        uint8 data = orders[orderId].data;

        removeById(orderId);

        return addAfterId(maker, orderId, srcAmount, dstAmount, prevId, data);
    }

    function allocateIds(uint32 howMany) internal returns(uint32) {
        uint32 firstId = nextId;
        nextId += howMany;
        return firstId;
    }

    function verifyCanRemoveOrderById(uint32 orderId) private view {
        require(orderId != BUY_HEAD_ID);

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

    function findPrevOrderId(
        uint128 srcAmount,
        uint128 dstAmount,
        uint32 startId
    )
        public
        view
        returns(uint32)
    {
        uint newOrderKey = calculateOrderSortKey(srcAmount, dstAmount);

        // This is okay for the HEAD ids, as their prevId is their id.
        // TODO: rewrite in a simpler way - going to the prev of the provided
        //       first id is not that elegant.
        uint32 currId = orders[startId].prevId;
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

    function isNextOrderTail(uint32 orderId) internal view returns(bool) {
        return ((orders[orderId]).nextId == TAIL_ID);
    }

    function getNextOrderId(uint32 orderId) internal view returns(uint32) {
        return (orders[orderId].nextId);
    }
}
