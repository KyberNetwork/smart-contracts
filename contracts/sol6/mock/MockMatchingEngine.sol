pragma solidity 0.6.6;

import "../nimbleMatchingEngine.sol";


/**
 *    @dev MockMatchEngine is a mock for testing overflow
 */

contract MockMatchEngine is nimbleMatchingEngine {
    constructor(address _admin) public nimbleMatchingEngine(_admin) {}

    function reserveIdToAddress(bytes32 reserveId) public view returns (address) {
        return getReserveAddress(reserveId);
    }
}
