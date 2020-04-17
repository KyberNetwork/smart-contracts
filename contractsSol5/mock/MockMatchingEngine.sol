pragma solidity 0.5.11;

import "../KyberMatchingEngine.sol";


/**
 *    @dev MockMatchEngine is a mock for testing overflow
 */

contract MockMatchEngine is KyberMatchingEngine {
    constructor(address _admin) public KyberMatchingEngine(_admin) {}

    function reserveIdToAddress(bytes32 reserveId) public view returns (address) {
        return convertReserveIdToAddress(reserveId);
    }

    function addressToReserveId(address reserveAddress) public view returns (bytes32) {
        return convertAddressToReserveId(reserveAddress);
    }
}
