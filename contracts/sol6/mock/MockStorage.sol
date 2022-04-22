pragma solidity 0.6.6;

import "../nimbleStorage.sol";


contract MockStorage is nimbleStorage {
    constructor(
        address _admin,
        InimbleHistory _networkHistory,
        InimbleHistory _feeHandlerHistory,
        InimbleHistory _nimbleDaoHistory,
        InimbleHistory _matchingEngineHistory
    )
        public
        nimbleStorage(
            _admin,
            _networkHistory,
            _feeHandlerHistory,
            _nimbleDaoHistory,
            _matchingEngineHistory
        )
    {}

    function setReserveId(address reserve, bytes32 reserveId) public {
        reserveAddressToId[reserve] = reserveId;
    }
}
