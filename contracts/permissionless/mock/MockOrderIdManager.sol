pragma solidity 0.4.18;


import "../OrderIdManager.sol";


contract MockOrdersIdManager is OrdersIdManager {

    OrdersData ordersData;

    function allocateNewOrders(uint howMany, uint firstId) public {
        allocateOrders(ordersData, uint32(firstId), uint32(howMany));
    }

    event NewOrderId(uint orderId);

    function getNewOrder() public returns (uint orderId) {
        orderId = getNewOrderId(ordersData);
        NewOrderId(orderId);
        return orderId;
    }

    function releaseOrder(uint32 orderId) public {
        releaseOrderId(ordersData, orderId);
    }

    function getTakenOrdersBitMap() public view returns(uint256) {
        return ordersData.takenBitmap;
    }

    function getNumOrders() public view returns(uint32) {
        return ordersData.numOrders;
    }

    function getFirstOrderId() public view returns(uint32) {
        return ordersData.firstOrderId;
    }
}
