pragma solidity 0.4.18;


import "../Utils2.sol";
import "../Withdrawable.sol";
import "./OrdersInterface.sol";


contract Orders is Withdrawable, Utils2, OrdersInterface {

    struct Order {
        address maker;
        uint32 prevId;
        uint32 nextId;
        uint128 srcAmount;
        uint128 dstAmount;
    }

    mapping (uint32 => Order) public orders;

    uint32 constant public TAIL_ID = 1;
    uint32 constant public HEAD_ID = 2;

    // Results of calling updateWithPositionHint.
    uint8 constant public UPDATE_ONLY_AMOUNTS = 0;
    uint8 constant public UPDATE_MOVE_ORDER = 1;
    uint8 constant public UPDATE_FAILED = 2;

    uint32 public nextFreeId = 3;

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
    {
        require(orderId != 0 && orderId != HEAD_ID && orderId != TAIL_ID);

        uint32 prevId = findPrevOrderId(srcAmount, dstAmount);
        addAfterValidId(maker, orderId, srcAmount, dstAmount, prevId);
    }

    // Returns false if provided with bad hint.
    function addAfterId(
        address maker,
        uint32 orderId,
        uint128 srcAmount,
        uint128 dstAmount,
        uint32 prevId
    )
        public
        onlyAdmin
        returns (bool)
    {
        uint32 nextId = orders[prevId].nextId;
        if (!isRightPosition(srcAmount, dstAmount, prevId, nextId)) {
            return false;
        }
        addAfterValidId(maker, orderId, srcAmount, dstAmount, prevId);
        return true;
    }

    function removeById(uint32 orderId) public onlyAdmin {
        verifyCanRemoveOrderById(orderId);

        // Disconnect order from list
        Order storage order = orders[orderId];
        orders[order.prevId].nextId = order.nextId;
        orders[order.nextId].prevId = order.prevId;
    }

    function update(uint32 orderId, uint128 srcAmount, uint128 dstAmount)
        public
        onlyAdmin
    {
        address maker = orders[orderId].maker;
        removeById(orderId);
        add(maker, orderId, srcAmount, dstAmount);
    }

    // Returns false if provided with a bad hint.
    function updateWithPositionHint(
        uint32 orderId,
        uint128 srcAmount,
        uint128 dstAmount,
        uint32 prevId
    )
        public
        onlyAdmin
        returns (bool, uint)
    {
        require(orderId != HEAD_ID && orderId != TAIL_ID);

        // Normal orders usually cannot serve as their own previous order.
        // For further discussion see Heinlein's '—All You Zombies—'.
        require(orderId != prevId);

        uint32 nextId;

        // If not changing place, only update amounts.
        if (orders[orderId].prevId == prevId) {
            nextId = orders[orderId].nextId;
            if (isRightPosition(srcAmount, dstAmount, prevId, nextId)) {
                orders[orderId].srcAmount = srcAmount;
                orders[orderId].dstAmount = dstAmount;
                return (true, UPDATE_ONLY_AMOUNTS);
            }
        } else {
            nextId = orders[prevId].nextId;
            if (isRightPosition(srcAmount, dstAmount, prevId, nextId)) {
                // Let's move the order to the hinted position.
                address maker = orders[orderId].maker;
                removeById(orderId);
                addAfterId(maker, orderId, srcAmount, dstAmount, prevId);
                return (true, UPDATE_MOVE_ORDER);
            }
        }

        // bad hint.
        return (false, UPDATE_FAILED);
    }

    function allocateIds(uint32 howMany) public onlyAdmin returns(uint32) {
        uint32 firstId = nextFreeId;
        nextFreeId += howMany;
        return firstId;
    }

    function getTailId() public view returns(uint32) {
        return TAIL_ID;
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
    }

    function verifyCanRemoveOrderById(uint32 orderId) private view {
        require(orderId != HEAD_ID);

        Order storage order = orders[orderId];

        // Make sure such order exists in mapping.
        require(order.prevId != 0 || order.nextId != 0);
    }

    function isRightPosition(
        uint128 srcAmount,
        uint128 dstAmount,
        uint32 prevId,
        uint32 nextId
    )
        private
        view
        returns (bool)
    {
        if (prevId == TAIL_ID || nextId == HEAD_ID) return false;

        // TODO: check gas cost with this or memory or orders[prevId].
        Order storage prev = orders[prevId];

        // Make sure prev order is initialised.
        if (prev.prevId == 0 || prev.nextId == 0) return false;

        uint newKey = calculateOrderSortKey(srcAmount, dstAmount);

        // Make sure that the new order should be after the provided prevId.
        if (prevId != HEAD_ID) {
            uint prevKey = calculateOrderSortKey(
                prev.srcAmount,
                prev.dstAmount
            );
            if (prevKey < newKey) return false;
        }

        // Make sure that the new order should be before provided prevId's next
        // order.
        if (nextId != TAIL_ID) {
            // TODO: check gas cost with this or memory or orders[prevId].
            Order storage next = orders[nextId];
            uint nextKey = calculateOrderSortKey(
                next.srcAmount,
                next.dstAmount);
            if (newKey < nextKey) return false;
        }

        return true;
    }

    // XXX Convenience functions for Ilan
    // ----------------------------------
    function subSrcAndDstAmounts(uint32 orderId, uint128 subFromSrc)
        public
        onlyAdmin
        returns (uint128 _subDst)
    {
        //if buy with x src. how much dest would it be
        uint128 subDst = subFromSrc * orders[orderId].dstAmount / orders[orderId].srcAmount;

        orders[orderId].srcAmount -= subFromSrc;
        orders[orderId].dstAmount -= subDst;
        return(subDst);
    }

    // TODO: move to PermissionLessReserve
    function getFirstOrder() public view returns(uint32 orderId, bool isEmpty) {
        return (
            orders[HEAD_ID].nextId,
            orders[HEAD_ID].nextId == TAIL_ID
        );
    }

    // TODO: move to PermissionLessReserve
    function getNextOrder(uint32 orderId)
        public
        view
        returns(uint32, bool isLast)
    {
        isLast = orders[orderId].nextId == TAIL_ID;
        return(orders[orderId].nextId, isLast);
    }
}
