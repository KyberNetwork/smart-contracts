pragma solidity 0.6.6;

import "../KyberStorage.sol";


contract MockStorage is KyberStorage {
    constructor(address _admin) public KyberStorage(_admin) {}

    function setReserveId(address reserve, bytes32 reserveId) public {
        reserveAddressToId[reserve] = reserveId;
    }
}
