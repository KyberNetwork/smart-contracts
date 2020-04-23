pragma solidity 0.6.6;

import "./IKyberFeeHandler.sol";
import "./IKyberDAO.sol";
import "./IKyberNetworkProxy.sol";
import "./IKyberReserve.sol";


interface IKyberStorage {
    enum ReserveType {NONE, FPR, APR, BRIDGE, UTILITY, CUSTOM, ORDERBOOK, LAST}

    function addKyberProxy(address networkProxy, uint256 max_approved_proxies)
        external
        returns (bool);

    function removeKyberProxy(address networkProxy) external returns (bool);

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

    function getListReservesByIds(bytes32[] calldata reserveIds)
        external
        view
        returns (IKyberReserve[] memory reserveAddresses);

    function getRebateWallet(address reserveAddress)
        external
        view
        returns (address rebateWallet);

    function getKyberProxies() external view returns (IKyberNetworkProxy[] memory);

    function getReserveDetailsByAddress(address reserve)
        external
        view
        returns (
            bytes32 reserveId,
            ReserveType resType,
            bool isFeeAccountedFlag,
            bool isEntitledRebateFlag
        );

    function getReserveDetailsById(bytes32 reserveId)
        external
        view
        returns (
            address reserveAddress,
            ReserveType resType,
            bool isFeeAccountedFlag,
            bool isEntitledRebateFlag
        );

    function getFeeAccountedData(bytes32[] calldata reserveIds)
        external
        view
        returns (bool[] memory feeAccountedArr);

    function getEntitledRebateData(bytes32[] calldata reserveIds)
        external
        view
        returns (bool[] memory entitledRebateArr);

    function getFeeAccountedAndEntitledRebateData(bytes32[] calldata reserveIds)
        external
        view
        returns (bool[] memory feeAccountedArr, bool[] memory entitledRebateArr);

    function isKyberProxyAdded() external view returns (bool);
}
