pragma solidity 0.4.18;


import "../OrderIdManager.sol";


contract MockOrderIdManager is OrderIdManager {

    OrderIdData orderIdData;

    function allocatOrderIds(uint firstId) public {
        require(allocateOrderIds(orderIdData, uint32(firstId)));
    }

    event NewOrderId(uint orderId);

    function fetchNewOrderId() public returns (uint orderId) {
        orderId = fetchNewOrderId(orderIdData);
        NewOrderId(orderId);
        return orderId;
    }

    function releaseOrderId(uint32 orderId) public {
        releaseOrderId(orderIdData, orderId);
    }

    function getTakenOrdersBitMap() public view returns(uint256) {
        return orderIdData.takenBitmap;
    }

    function getFirstOrderId() public view returns(uint32) {
        return orderIdData.firstOrderId;
    }

    function isOrderAllocationRequired() public view returns(bool) {
        return orderAllocationRequired(orderIdData);
    }
}
