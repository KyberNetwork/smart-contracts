pragma solidity 0.4.18;


interface OrdersInterface {
    function getOrderDetails(uint32 orderId) public view returns (address, uint128, uint128 _dstAmount, uint32 _prevId,
        uint32 _nextId);
    function add(address maker, uint32 orderId, uint128 srcAmount, uint128 dstAmount) public;
    function addAfterId(address maker, uint32 orderId, uint128 srcAmount, uint128 dstAmount, uint32 prevId) public
        returns (bool);
    function removeById(uint32 orderId) public;
    function update(uint32 orderId, uint128 srcAmount, uint128 dstAmount) public;
    function updateWithPositionHint(uint32 orderId, uint128 srcAmount, uint128 dstAmount, uint32 prevId) public
        returns(bool);
    function updateAmounts(uint32 orderId, uint128 srcAmount, uint128 dstAmount) public returns (bool);
    function getFirstOrder() public view returns(uint32 orderId, bool isEmpty);
    function allocateIds(uint32 howMany) public returns(uint32);
    function getNextOrder(uint32 orderId) public view returns(uint32, bool isLast);
    function subSrcAndDstAmounts(uint32 orderId, uint128 subFromSrc) public returns (uint128 _subDst);
}
