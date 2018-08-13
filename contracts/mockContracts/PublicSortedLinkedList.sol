pragma solidity 0.4.18;

import "../SortedLinkedList.sol";

contract PublicSortedLinkedList is SortedLinkedList {

    function getOrderDetails_p(uint64 orderId)
        public
        view
        returns (
            address _maker,
            uint128 _srcAmount,
            uint128 _dstAmount,
            uint64 _prevId,
            uint64 _nextId
        )
    {
        return super.getOrderDetails(orderId);
    }

    function add_p(uint128 srcAmount, uint128 dstAmount)
        public
        returns(uint64)
    {
        return super.add(srcAmount, dstAmount);
    }

    function addAfterId_p(uint128 srcAmount, uint128 dstAmount, uint64 prevId)
        public
        returns(uint64)
    {
        return super.addAfterId(srcAmount, dstAmount, prevId);
    }

    function removeById_p(uint64 orderId) public {
        return super.removeById(orderId);
    }

    function update_p(uint64 orderId, uint128 srcAmount, uint128 dstAmount)
        public
        returns(uint64)
    {
        return super.update(orderId, srcAmount, dstAmount);
    }

    function updateWithPositionHint_p(
        uint64 orderId,
        uint128 srcAmount,
        uint128 dstAmount,
        uint64 prevId
    )
        public
        returns(uint64)
    {
        return super.updateWithPositionHint(
            orderId,
            srcAmount,
            dstAmount,
            prevId
        );
    }
}
