pragma solidity 0.4.18;


import "./Withdrawable.sol";


contract MakerOrders is Withdrawable {
    struct FreeOrders {
        uint32 firstOrderId;
        uint32 numOrders; //max is 256
        uint8 maxOrdersReached;
        uint256 takenBitmap;
    }

    //each maker will have orders that will be reused.
    mapping(address => FreeOrders) public makerOrdersSell;
    mapping(address => FreeOrders) public makerOrdersBuy;

    function takeOrderId(FreeOrders storage freeOrders)
        internal
        onlyAdmin
        returns(uint32)
    {
        uint numOrders = freeOrders.numOrders;
        uint orderBitmap = freeOrders.takenBitmap;
        uint bitPointer = 1;

        for(uint i = 0; i < numOrders; ++i) {
            if ((orderBitmap & bitPointer) == 0) {
                freeOrders.takenBitmap = orderBitmap | bitPointer;
                return(uint32(uint(freeOrders.firstOrderId) + i));
            }

            bitPointer *= 2;
        }

        freeOrders.maxOrdersReached = 1;

        require(false);
    }

    /// @dev mark order as free to use.
    function releaseOrderId(FreeOrders storage freeOrders, uint32 orderId)
        internal
        onlyAdmin
        returns(bool)
    {
        require(orderId >= freeOrders.firstOrderId);
        require(orderId < (freeOrders.firstOrderId + freeOrders.numOrders));

        uint orderBitNum = uint(orderId) - uint(freeOrders.firstOrderId);
        uint256 bitPointer = 1 * (2 ** orderBitNum);
        // TODO: enable!
        //        require(bitPointer & freeOrders.takenBitmap == 1);

        uint256 bitNegation = bitPointer ^ 0xffffffffffffffff;

        freeOrders.takenBitmap &= bitNegation;
    }

    function allocateOrders(
        FreeOrders storage freeOrders,
        uint32 firstAllocatedId,
        uint32 howMany
    )
        internal
        onlyAdmin
    {
        require(howMany <= 256);

        // make sure no orders in use at the moment
        require(freeOrders.takenBitmap == 0);

        freeOrders.firstOrderId = firstAllocatedId;
        freeOrders.numOrders = uint32(howMany);
        freeOrders.maxOrdersReached = 0;
        freeOrders.takenBitmap = 0;
    }
}
