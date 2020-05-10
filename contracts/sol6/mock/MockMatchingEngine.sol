pragma solidity 0.6.6;

import "../KyberMatchingEngine.sol";


/**
 *    @dev MockMatchEngine is a mock for testing overflow
 */

contract MockMatchEngine is KyberMatchingEngine {
    constructor(address _admin) public KyberMatchingEngine(_admin) {}

    function reserveIdToAddress(bytes32 reserveId) public view returns (address) {
        return getReserveAddress(reserveId);
    }
}
