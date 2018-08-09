pragma solidity 0.4.18;

contract SortedLinkedList {

    struct Order {
        address maker;
        uint128 srcAmount;
        uint128 dstAmount;
        uint64 prevOrderId;
        uint64 nextOrderId;
    }

    mapping (address => Order) public orders;

    uint64 constant public TAIL_ID = 0;
    uint64 constant public HEAD_ID = 1;

    uint64 nextOrderId = 2;

    Order internal HEAD;

    function SortedLinkedList() public {
        HEAD = Order({
            maker: 0,
            srcAmount: 0,
            dstAmount: 0,
            prevOrderId: HEAD_ID,
            nextOrderId: TAIL_ID
        });

        orders[HEAD_ID] = HEAD;
    }

    function add(uint128 srcAmount, uint128 dstAmount)
    public
    returns(uint64)
    {
        uint64 orderId = nextOrderId++;
        orders[orderId] = Order({
            maker: msg.sender,
            srcAmount: srcAmount,
            dstAmount: dstAmount,
            prevOrderId: 0,
            nextOrderId: 0
        });

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
        uint64 _prevOrderId,
        uint64 _nextOrderId
    )
    {
        return (
            0 /* maker */,
            0 /* srcAmount */,
            0 /* dstAmount */,
            0 /* prevOrderId */,
            0 /* nextOrderId */
        );
    }
}
