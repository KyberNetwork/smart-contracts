pragma solidity 0.4.18;


contract OrderIdManager {
    struct OrderIdData {
        uint32 firstOrderId;
        uint takenBitmap;
    }

    uint constant public NUM_ORDERS = 32;

    function fetchNewOrderId(OrderIdData storage freeOrders)
        internal
        returns(uint32)
    {
        uint orderBitmap = freeOrders.takenBitmap;
        uint bitPointer = 1;

        for (uint i = 0; i < NUM_ORDERS; ++i) {

            if ((orderBitmap & bitPointer) == 0) {
                freeOrders.takenBitmap = orderBitmap | bitPointer;
                return(uint32(uint(freeOrders.firstOrderId) + i));
            }

            bitPointer *= 2;
        }

        revert();
    }

    /// @dev mark order as free to use.
    function releaseOrderId(OrderIdData storage freeOrders, uint32 orderId)
        internal
        returns(bool)
    {
        require(orderId >= freeOrders.firstOrderId);
        require(orderId < (freeOrders.firstOrderId + NUM_ORDERS));

        uint orderBitNum = uint(orderId) - uint(freeOrders.firstOrderId);
        uint bitPointer = uint(1) << orderBitNum;

        require(bitPointer & freeOrders.takenBitmap > 0);

        freeOrders.takenBitmap &= ~bitPointer;
        return true;
    }

    function allocateOrderIds(
        OrderIdData storage makerOrders,
        uint32 firstAllocatedId
    )
        internal
        returns(bool)
    {
        if (makerOrders.firstOrderId > 0) {
            return false;
        }

        makerOrders.firstOrderId = firstAllocatedId;
        makerOrders.takenBitmap = 0;

        return true;
    }

    function orderAllocationRequired(OrderIdData storage freeOrders) internal view returns (bool) {

        if (freeOrders.firstOrderId == 0) return true;
        return false;
    }

    function getNumActiveOrderIds(OrderIdData storage makerOrders) internal view returns (uint numActiveOrders) {
        for (uint i = 0; i < NUM_ORDERS; ++i) {
            if ((makerOrders.takenBitmap & (uint(1) << i)) > 0) numActiveOrders++;
        }
    }
}
