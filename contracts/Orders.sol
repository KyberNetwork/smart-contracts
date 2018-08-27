pragma solidity 0.4.18;


import "./Utils2.sol";
import "./Withdrawable.sol";


contract Orders is Withdrawable, Utils2 {

    struct Order {
        address maker;
        uint32 prevId;
        uint32 nextId;
        uint128 srcAmount;
        uint128 dstAmount;
    }

    mapping (uint32 => Order) public orders;

    uint32 constant public TAIL_ID = 0;
    uint32 constant public HEAD_ID = 1;

    uint32 public nextId = 2;

    function Orders(address _admin) public {
        require(_admin != address(0));

        admin = _admin;
        orders[HEAD_ID].maker = 0;
        orders[HEAD_ID].prevId = HEAD_ID;
        orders[HEAD_ID].nextId = TAIL_ID;
        orders[HEAD_ID].srcAmount = 0;
        orders[HEAD_ID].dstAmount = 0;
    }

    function getOrderDetails(uint32 orderId)
        public
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

    function add(
        address maker,
        uint32 orderId,
        uint128 srcAmount,
        uint128 dstAmount
    )
        public
        onlyAdmin
        returns(uint32)
    {
        uint32 prevId = findPrevOrderId(srcAmount, dstAmount);
        return addAfterValidId(maker, orderId, srcAmount, dstAmount, prevId);
    }

    function addAfterId(
        address maker,
        uint32 orderId,
        uint128 srcAmount,
        uint128 dstAmount,
        uint32 prevId
    )
        public
        onlyAdmin
        returns(uint32)
    {
        validatePrevId(srcAmount, dstAmount, prevId);
        return addAfterValidId(maker, orderId, srcAmount, dstAmount, prevId);
    }

    function removeById(uint32 orderId) public onlyAdmin {
        verifyCanRemoveOrderById(orderId);

        // Disconnect order from list
        Order storage order = orders[orderId];
        orders[order.prevId].nextId = order.nextId;
        orders[order.nextId].prevId = order.prevId;
    }

    // The updated order id is returned following the update.
    function update(uint32 orderId, uint128 srcAmount, uint128 dstAmount)
        public
        onlyAdmin
        returns(uint32)
    {
        address maker = orders[orderId].maker;
        removeById(orderId);
        return add(maker, orderId, srcAmount, dstAmount);
    }

    // The updated order id is returned following the update.
    function updateWithPositionHint(
        uint32 orderId,
        uint128 srcAmount,
        uint128 dstAmount,
        uint32 prevId
    )
        public
        onlyAdmin
        returns(uint32)
    {
        address maker = orders[orderId].maker;
        removeById(orderId);
        return addAfterId(maker, orderId, srcAmount, dstAmount, prevId);
    }

    function allocateIds(uint32 howMany) public onlyAdmin returns(uint32) {
        uint32 firstId = nextId;
        nextId += howMany;
        return firstId;
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

    function addAfterValidId(
        address maker,
        uint32 orderId,
        uint128 srcAmount,
        uint128 dstAmount,
        uint32 prevId
    )
        private
        returns(uint32)
    {
        Order storage prevOrder = orders[prevId];

        // Add new order
        orders[orderId].maker = maker;
        orders[orderId].prevId = prevId;
        orders[orderId].nextId = prevOrder.nextId;
        orders[orderId].srcAmount = srcAmount;
        orders[orderId].dstAmount = dstAmount;

        // Update next order to point back to added order
        uint32 nextOrderId = prevOrder.nextId;
        if (nextOrderId != TAIL_ID) {
            orders[nextOrderId].prevId = orderId;
        }

        // Update previous order to point to added order
        prevOrder.nextId = orderId;

        return orderId;
    }

    function verifyCanRemoveOrderById(uint32 orderId) private view {
        require(orderId != HEAD_ID);

        Order storage order = orders[orderId];

        // Make sure such order exists in mapping.
        require(order.prevId != 0 || order.nextId != 0);
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

    // XXX Convenience functions for Ilan
    // ----------------------------------
    function subSrcAndDstAmounts (uint32 orderId, uint128 subFromSrc) public onlyAdmin returns (uint128){
        //if buy with x src. how much dest would it be
        uint128 subDst = subFromSrc * orders[orderId].dstAmount / orders[orderId].srcAmount;

        orders[orderId].srcAmount -= subFromSrc;
        orders[orderId].dstAmount -= subDst;
        return(subDst);
    }

    function getOrderData(uint32 orderId) public view
        returns (
            address maker,
            uint32 nextOrderId,
            bool isLastOrder,
            uint128 srcAmount,
            uint128 dstAmount
        )
    {
        Order storage order = orders[orderId];

        return (
            order.maker,
            order.nextId,
            order.nextId == TAIL_ID,
            order.srcAmount,
            order.dstAmount
        );
    }

    function getFirstOrder() public view returns(uint32 orderId, bool isEmpty) {
        return (
            orders[HEAD_ID].nextId,
            orders[HEAD_ID].nextId == TAIL_ID
        );
    }

    function getNextOrder(uint32 orderId)
        public
        view
        returns(uint32, bool isLast)
    {
        isLast = orders[orderId].nextId == TAIL_ID;
        return(orders[orderId].nextId, isLast);
    }
}
