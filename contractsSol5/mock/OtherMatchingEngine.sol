pragma solidity 0.5.11;

import "../KyberMatchingEngine.sol";

contract OtherMatchingEngine is KyberMatchingEngine {
    constructor(address _admin) public KyberMatchingEngine(_admin) {
        /* empty body */
    }

    function addReserve(address reserve, bytes8 reserveId, ReserveType resType)
        external
        onlyNetwork
        returns (bool)
    {
        if (reserveAddressToId[reserve] != bytes8(0)) return false;
        if (reserveId == 0) return false;
        if (resType == ReserveType.NONE) return false;
        if (uint256(resType) > uint256(ReserveType.LAST)) return false;
        if (feePayingPerType == 0xffffffff) return false;

        if (reserveIdToAddresses[reserveId].length == 0) {
            reserveIdToAddresses[reserveId].push(reserve);
        } else {
            require(reserveIdToAddresses[reserveId][0] == address(0), "reserveId taken");
            reserveIdToAddresses[reserveId][0] = reserve;
        }

        reserveAddressToId[reserve] = reserveId;
        reserveType[reserve] = uint256(resType);
        return true;
    }

    function removeReserve(address reserve)
        external
        onlyNetwork
        returns (bytes8)
    {
        // return zero id instead of revert
        if (reserveAddressToId[reserve] == bytes8(0)) {
            return bytes8(0);
        }
        bytes8 reserveId = reserveAddressToId[reserve];

        reserveIdToAddresses[reserveId].push(
            reserveIdToAddresses[reserveId][0]
        );
        reserveIdToAddresses[reserveId][0] = address(0);
        reserveAddressToId[reserve] = bytes8(0);

        return reserveId;
    }
}
