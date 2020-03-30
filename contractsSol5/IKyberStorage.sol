pragma solidity 0.5.11;

import "./IKyberFeeHandler.sol";
import "./IKyberMatchingEngine.sol";
import "./IKyberDAO.sol";


/// @title KyberStorage interface
contract IKyberStorage {
    function setContracts(
        IKyberFeeHandler _feeHandler,
        IKyberMatchingEngine _matchingEngine
    ) external returns (bool);

    function setDAOContract(IKyberDAO _kyberDAO) external returns (bool);

    function addReserve(address reserve, bytes8 reserveId)
        external
        returns (bool);

    function removeReserve(address reserve, uint256 startIndex)
        external
        returns (bool);

    function convertReserveIdToAddress(bytes8[] reserveIds)
        external
        view
        returns (address[] reserveAddresses);
}
