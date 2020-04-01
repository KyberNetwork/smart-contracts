pragma solidity 0.5.11;

import "./IKyberFeeHandler.sol";
import "./IKyberMatchingEngine.sol";
import "./IKyberDAO.sol";
import "./IKyberNetworkProxy.sol";


/// @title KyberStorage interface
contract IKyberStorage {
    function setContracts(
        IKyberFeeHandler _feeHandler,
        IKyberMatchingEngine _matchingEngine
    ) external returns (bool);

    function setDAOContract(IKyberDAO _kyberDAO) external returns (bool);

    function addReserve(address reserve, bytes32 reserveId)
        external
        returns (bool);

    function removeReserve(address reserve, uint256 startIndex)
        external
        returns (bool);

    function convertReserveIdToAddress(bytes32[] calldata reserveIds)
        external
        view
        returns (address[] memory reserveAddresses);

    function addKyberProxy(address networkProxy, uint256 max_approved_proxies)
        external
        returns (bool);

    function removeKyberProxy(address networkProxy) external returns (bool);

    function isKyberProxyAdded() external view returns (bool);
}
