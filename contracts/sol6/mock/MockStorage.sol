pragma solidity 0.6.6;

import "../NimbleStorage.sol";


contract MockStorage is NimbleStorage {
    constructor(
        address _admin,
        INimbleHistory _networkHistory,
        INimbleHistory _feeHandlerHistory,
        INimbleHistory _NimbleDaoHistory,
        INimbleHistory _matchingEngineHistory
    )
        public
        NimbleStorage(
            _admin,
            _networkHistory,
            _feeHandlerHistory,
            _NimbleDaoHistory,
            _matchingEngineHistory
        )
    {}

    function setReserveId(address reserve, bytes32 reserveId) public {
        reserveAddressToId[reserve] = reserveId;
    }
}
