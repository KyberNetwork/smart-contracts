pragma solidity 0.4.18;

import "../SortedLinkedList.sol";

contract PublicSortedLinkedList is SortedLinkedList {

    function getOrderDetails_p(uint32 orderId)
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
        return super.getOrderDetails(orderId);
    }

    function add_p(address maker, uint128 srcAmount, uint128 dstAmount)
        public
        returns(uint32)
    {
        return super.add(maker, srcAmount, dstAmount);
    }

    function addAfterId_p(
        address maker,
        uint128 srcAmount,
        uint128 dstAmount,
        uint32 prevId
    )
        public
        returns(uint32)
    {
        return super.addAfterId(maker, srcAmount, dstAmount, prevId);
    }

    function removeById_p(uint32 orderId) public {
        return super.removeById(orderId);
    }

    function update_p(uint32 orderId, uint128 srcAmount, uint128 dstAmount)
        public
        returns(uint32)
    {
        return super.update(orderId, srcAmount, dstAmount);
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
}
