pragma solidity 0.6.6;

import "../KyberStorage.sol";


contract MockStorage is KyberStorage {
    constructor(
        address _admin,
        IKyberHistory _networkHistory,
        IKyberHistory _feeHandlerHistory,
        IKyberHistory _kyberDAOHistory,
        IKyberHistory _matchingEngineHistory
    )
        public
        KyberStorage(
            _admin,
            _networkHistory,
            _feeHandlerHistory,
            _kyberDAOHistory,
            _matchingEngineHistory
        )
    {}

    function setReserveId(address reserve, bytes32 reserveId) public {
        reserveAddressToId[reserve] = reserveId;
    }
}
