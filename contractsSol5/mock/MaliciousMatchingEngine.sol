pragma solidity 0.5.11;

import "../KyberMatchingEngine.sol";


contract MaliciousMatchingEngine is KyberMatchingEngine {
    constructor(address _admin) public KyberMatchingEngine(_admin) {
        /* empty body */
    }

    // function getFeeAccountedData(bytes8[] memory reserveIds) internal view
    //     returns(bool[] memory feeAccountedArr)
    // {
    //     feeAccountedArr = new bool[](reserveIds.length);

    //     for (uint i = 0; i < reserveIds.length; i++) {
    //         feeAccountedArr[i] = (feeAccountedPerType & (1 << reserveType[reserveIds[i]])) > 0;
    //     }
    // }
}
