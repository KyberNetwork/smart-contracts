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

    function addReserve(address reserve, bytes8 reserveId)
        external
        returns (bool);

    function removeReserve(address reserve, uint256 startIndex)
        external
        returns (bytes8 reserveId);

    function listPairForReserve(address reserve, IERC20 token, bool ethToToken, bool tokenToEth, bool add)
        external
        returns (bool);

    function convertReserveAddresstoId(address reserve)
        external
        view
        returns (bytes8 reserveId);

    function convertReserveIdToAddress(bytes8 reserveId)
        external
        view
        returns (address reserveAddress);

    function convertReserveAddressestoIds(address[] calldata reserveAddresses)
        external
        view
        returns (bytes8[] memory reserveIds);

    function convertReserveIdsToAddresses(bytes8[] calldata reserveIds)
        external
        view
        returns (address[] memory reserveAddresses);

    function getReservesPerTokenSrc(address token)
        external
        view
        returns (bytes8[] memory reserveIds);

    function getReservesPerTokenDest(address token)
        external
        view
        returns (bytes8[] memory reserveIds);

    function addKyberProxy(address networkProxy, uint256 max_approved_proxies)
        external
        returns (bool);

    function removeKyberProxy(address networkProxy) external returns (bool);

    function isKyberProxyAdded() external view returns (bool);
}
