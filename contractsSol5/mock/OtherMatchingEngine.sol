pragma solidity 0.5.11;

import "../KyberMatchingEngine.sol";

// overide only some of original contract. mostly return value instead of revert
contract OtherMatchingEngine is KyberMatchingEngine {
    constructor(address _admin) public KyberMatchingEngine(_admin) {
        /* empty body */
    }

    // return false instead
    function addReserve(bytes8 reserveId, ReserveType resType) external onlyNetwork returns (bool) {
        require((resType != ReserveType.NONE) && (uint(resType) < uint(ReserveType.LAST)), "bad type");
        require(feePayingPerType != 0xffffffff, "Fee paying not set");

        reserveType[reserveId] = uint(resType);
        return false;
    }

    function removeReserve(bytes8 reserveId) external onlyNetwork returns (bool) {
        reserveType[reserveId] = uint(ReserveType.NONE);
        return false;
    }

    function setNegligbleRateDiffBps(uint _negligibleRateDiffBps) external onlyNetwork returns (bool) {
        if (_negligibleRateDiffBps > BPS) return false; // return false instead of revert
        negligibleRateDiffBps = _negligibleRateDiffBps;
        return true;
    }
}
