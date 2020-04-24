pragma solidity 0.6.6;

import "../KyberHintHandler.sol";


contract MockHintHandler is KyberHintHandler {
    mapping(address => bytes32) public reserveAddressToId;
    mapping(bytes32 => address[]) public reserveIdToAddresses;

    function addReserve(address reserve, bytes32 reserveId) public {
        reserveIdToAddresses[reserveId].push(reserve);
        reserveAddressToId[reserve] = reserveId;
    }

    function convertReserveIdToAddress(bytes32 reserveId) internal view override returns (address) {
        return reserveIdToAddresses[reserveId][0];
    }

    function convertAddressToReserveId(address reserveAddress) internal view override returns (bytes32) {
        return reserveAddressToId[reserveAddress];
    }
}
