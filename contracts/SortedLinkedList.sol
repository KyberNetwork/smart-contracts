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

    uint64 nextId = 2;

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
    public
    returns(uint64)
    {
        uint64 prevId = findPrevOrderId(srcAmount, dstAmount);
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
    public
    view
    returns
    (
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

    // XXX: remove
    // event DEBUG(uint64 x);
}
