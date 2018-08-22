pragma solidity 0.4.18;

import "../Orders.sol";

contract PublicOrders is Orders {

    function getOrderDetails_p(uint32 orderId)
        public
        view
        returns (
            address _maker,
            uint128 _srcAmount,
            uint128 _dstAmount,
            uint32 _prevId,
            uint32 _nextId,
            uint8 data
        )
    {
        return super.getOrderDetails(orderId);
    }

    function add_p(address maker, uint128 srcAmount, uint128 dstAmount)
        public
        returns(uint32)
    {
//        return super.add(maker, srcAmount, dstAmount);
    }

    function addAfterId_p(
        address maker,
        uint128 srcAmount,
        uint128 dstAmount,
        uint32 prevId,
        uint8 data
    )
        public
        returns(uint32)
    {
        return super.addAfterId(maker, nextId++, srcAmount, dstAmount, prevId, data);
    }

    function removeById_p(uint32 orderId) public {
        return super.removeById(orderId);
    }

    function update_p(uint32 orderId, uint128 srcAmount, uint128 dstAmount)
        public
        returns(uint32)
    {
        return super.update(orderId, srcAmount, dstAmount, SELL_HEAD_ID);
    }

    function updateWithPositionHint_p(
        uint32 orderId,
        uint128 srcAmount,
        uint128 dstAmount,
        uint32 prevId
    )
        public
        returns(uint32)
    {
        return super.updateWithPositionHint(
            orderId,
            srcAmount,
            dstAmount,
            prevId
        );
    }

    function allocateIds_p(uint32 howMany) public returns(uint32) {
        return allocateIds(howMany);
    }
}
