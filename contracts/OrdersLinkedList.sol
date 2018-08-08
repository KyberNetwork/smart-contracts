pragma solidity 0.4.18;


import "./Utils2.sol";


contract OrdersLinkedList is Utils2 {

    ///@dev using uint32 for order ID should be enough. 4,294,967,296 orders
    struct Order {
        address maker;
        uint32 prevOrderID;
        uint32 nextOrderID;
        uint8 orderState;
        uint128 payAmount;
        uint128 exchangeAmount;
    }

    uint8 constant FREE = 0;
    uint8 constant ACTIVE = 1;
    uint8 constant HEAD = 2;

    mapping(uint32=>Order) public orders;      //store all orders here

    function isOrderBetterRate(uint32 orderID, uint32 checkedOrderID) public view returns(bool) {

        Order storage order = orders[orderID];
        Order storage checkedOrder = orders[checkedOrderID];

        uint orderRate = order.exchangeAmount * PRECISION / order.payAmount;
        uint checkedRate = checkedOrder.exchangeAmount * PRECISION / checkedOrder.payAmount;

        // for CTO ;)
        checkedRate > orderRate ? true : false;
    }

    function insertMakeOrder (uint32 newOrderID, uint32 hintPrevOrder, uint32 head) internal {

        if (hintPrevOrder != 0) {
            require(verifyOrderPosition(hintPrevOrder, newOrderID));
            insertOrder(newOrderID, hintPrevOrder);
        }

        uint32 currentOrder = head;

        while (orders[currentOrder].nextOrderID != head) {

            if (isOrderBetterRate(currentOrder, newOrderID)) break;

            currentOrder = orders[currentOrder].nextOrderID;
        }

        insertOrder(currentOrder, newOrderID);
    }

    function removeMakeOrder(uint32 orderID) internal {
        orders[orders[orderID].nextOrderID].prevOrderID = orders[orderID].prevOrderID;
        orders[orders[orderID].prevOrderID].nextOrderID = orders[orderID].nextOrderID;
    }

    function insertOrder (uint32 prevOrder, uint32 newOrder) internal {

        // handle new order
        Order memory thisOrder = orders[newOrder];
//        orders[newOrder].nextOrderID = orders[prevOrder].nextOrderID;
//        orders[newOrder].prevOrderID = prevOrder;
        thisOrder.nextOrderID = orders[prevOrder].nextOrderID;
        thisOrder.prevOrderID = prevOrder;
        orders[newOrder] = thisOrder;

        //handle prev order
        orders[prevOrder].nextOrderID = newOrder;

        //handle my next order
        orders[thisOrder.nextOrderID].prevOrderID = newOrder;
    }

    function verifyOrderPosition(uint32 prevOrder, uint32 thisOrder) public view returns (bool) {

        uint32 nextOrder = orders[prevOrder].nextOrderID;

        if (isOrderBetterRate(prevOrder, thisOrder)) return false;
        if (isOrderBetterRate(thisOrder, nextOrder)) return false;

        return true;
    }

    function isEmptyList(uint32 headOrder) public view returns(bool) {

        if (orders[headOrder].nextOrderID == headOrder) return true;

        return false;
    }

    function getNextOrderID (uint32 orderID) public view returns(uint32) {
        return (orders[orderID].nextOrderID);
    }

    function isHeadOrder(uint32 orderID) public view returns(bool) {
        return (orders[orderID].orderState == HEAD);
    }

    function isLastOrder(uint32 orderID) public view returns(bool) {
        return (orders[orderID].nextOrderID == 0);
    }

}