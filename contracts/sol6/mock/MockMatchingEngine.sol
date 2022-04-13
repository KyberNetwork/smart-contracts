pragma solidity 0.6.6;

import "../NimbleMatchingEngine.sol";


/**
 *    @dev MockMatchEngine is a mock for testing overflow
 */

contract MockMatchEngine is NimbleMatchingEngine {
    constructor(address _admin) public NimbleMatchingEngine(_admin) {}

    function reserveIdToAddress(bytes32 reserveId) public view returns (address) {
        return getReserveAddress(reserveId);
    }
}
