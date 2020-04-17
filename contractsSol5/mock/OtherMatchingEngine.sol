pragma solidity 0.5.11;

import "../KyberMatchingEngine.sol";


// overide only some of original contract. mostly return value instead of revert
contract OtherMatchingEngine is KyberMatchingEngine {
    constructor(address _admin) public KyberMatchingEngine(_admin) {
        /* empty body */
    }

    // return false instead
    // function addReserve(bytes32 reserveId, ReserveType resType) external returns (bool) {
    //     onlyNetwork();
    //     require((resType != ReserveType.NONE) && (uint(resType) < uint(ReserveType.LAST)), "bad reserve type");
    //     require(feeAccountedPerType != 0xffffffff, "fee accounting data not set");

    //     reserveType[reserveId] = uint(resType);
    //     return false;
    // }

    // function removeReserve(bytes32 reserveId) external returns (bool) {
    //     onlyNetwork();
    //     reserveType[reserveId] = uint(ReserveType.NONE);
    //     return false;
    // }

    function setNegligbleRateDiffBps(uint256 _negligibleRateDiffBps) external returns (bool) {
        onlyNetwork();
        if (_negligibleRateDiffBps > BPS) return false; // return false instead of revert
        negligibleRateDiffBps = _negligibleRateDiffBps;
        return true;
    }
}
