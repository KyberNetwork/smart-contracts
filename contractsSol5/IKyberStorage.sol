pragma solidity 0.5.11;

import "./IKyberFeeHandler.sol";
import "./IKyberDAO.sol";
import "./IKyberNetworkProxy.sol";


contract IKyberStorage {
    enum ReserveType {NONE, FPR, APR, BRIDGE, UTILITY, CUSTOM, ORDERBOOK, LAST}

    function addReserve(
        address reserve,
        bytes32 reserveId,
        ReserveType resType
    ) external returns (bool);

    function removeReserve(address reserve, uint256 startIndex)
        external
        returns (bytes32 reserveId);

    function addKyberProxy(address networkProxy, uint256 max_approved_proxies)
        external
        returns (bool);

    function removeKyberProxy(address networkProxy) external returns (bool);

    function listPairForReserve(
        address reserve,
        IERC20 token,
        bool ethToToken,
        bool tokenToEth,
        bool add
    ) external returns (bool);

    function setContracts(IKyberFeeHandler _feeHandler, address _matchingEngine)
        external
        returns (bool);

    function setDAOContract(IKyberDAO _kyberDAO) external returns (bool);

    function convertReserveAddresstoId(address reserve) external view returns (bytes32 reserveId);

    function convertReserveIdToAddress(bytes32 reserveId)
        external
        view
        returns (address reserveAddress);

    function convertReserveAddressestoIds(address[] calldata reserveAddresses)
        external
        view
        returns (bytes32[] memory reserveIds);

    function convertReserveIdsToAddresses(bytes32[] calldata reserveIds)
        external
        view
        returns (address[] memory reserveAddresses);

    function getReservesPerTokenSrc(address token)
        external
        view
        returns (bytes32[] memory reserveIds);

    function getReservesPerTokenDest(address token)
        external
        view
        returns (bytes32[] memory reserveIds);

    function getKyberProxies() external view returns (IKyberNetworkProxy[] memory);

    function getReserveDetailsByAddress(address reserve)
        external
        view
        returns (
            bytes32 reserveId,
            ReserveType resType,
            bool isFeeAccountedFlags
        );

    function getReserveDetailsById(bytes32 reserveId)
        external
        view
        returns (
            address reserveAddress,
            ReserveType resType,
            bool isFeeAccountedFlags
        );

    function getFeeAccountedData(bytes32[] calldata reserveIds)
        external
        view
        returns (bool[] memory feeAccountedArr);

    function isKyberProxyAdded() external view returns (bool);
}
