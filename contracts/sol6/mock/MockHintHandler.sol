pragma solidity 0.6.6;

import "../KyberHintHandler.sol";


contract MockHintHandler is KyberHintHandler {
    mapping(bytes32 => address[]) public reserveIdToAddresses;

    function addReserve(address reserve, bytes32 reserveId) public {
        reserveIdToAddresses[reserveId].push(reserve);
    }

    function getReserveAddress(bytes32 reserveId) internal view override returns (address) {
        return reserveIdToAddresses[reserveId][0];
    }

    function getReserveAddresses(bytes32 reserveId) internal view override returns (address[] memory) {
        return reserveIdToAddresses[reserveId];
    }
}
