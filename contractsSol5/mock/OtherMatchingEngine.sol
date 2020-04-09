pragma solidity 0.5.11;

import "../KyberMatchingEngine.sol";

// overide only some of original contract. mostly return value instead of revert
contract OtherMatchingEngine is KyberMatchingEngine {
    constructor(address _admin) public KyberMatchingEngine(_admin) {
        /* empty body */
    }

    // return false instead
    function addReserve(bytes32 reserveId, ReserveType resType) external returns (bool) {
        onlyNetwork();
        if ((resType == ReserveType.NONE) || (uint(resType) >= uint(ReserveType.LAST))) {
            return false;
        }
        if (feePayingPerType == 0xffffffff) {
            return false;
        }
        reserveType[reserveId] = uint(resType);
        return true;
    }

    function removeReserve(bytes32 reserveId) external returns (bool) {
        onlyNetwork();
        reserveType[reserveId] = uint(ReserveType.NONE);
        return false;
    }

    function setNegligbleRateDiffBps(uint _negligibleRateDiffBps) external returns (bool) {
        onlyNetwork();
        if (_negligibleRateDiffBps > BPS) return false; // return false instead of revert
        negligibleRateDiffBps = _negligibleRateDiffBps;
        return true;
    }
}
