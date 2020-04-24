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

    function getReserveID(address reserve) external view returns (bytes32 reserveId);

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

    function getReserveAddressesPerTokenSrc(address token)
        external
        view
        returns (address[] memory reserveAddresses);

    function getReservesPerTokenDest(address token)
        external
        view
        returns (bytes32[] memory reserveIds);

    function getReservesByReserveId(bytes32 reserveId)
        external
        view
        returns (address[] memory reserveAddresses);

    function getRebateWallets(bytes32[] calldata reserveIds)
        external
        view
        returns (address[] memory rebateWallets);

    function getKyberProxies() external view returns (IKyberNetworkProxy[] memory);

    function getReserveDetailsByAddress(address reserve)
        external
        view
        returns (
            bytes32 reserveId,
            address rebateWallet,
            ReserveType resType,
            bool isFeeAccountedFlag,
            bool isEntitledRebateFlag
        );

    function getReserveDetailsById(bytes32 reserveId)
        external
        view
        returns (
            address reserveAddress,
            address rebateWallet,
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

    function getReservesData(bytes32[] calldata reserveIds)
        external
        view
        returns (
            bool[] memory feeAccountedArr,
            bool[] memory entitledRebateArr,
            IKyberReserve[] memory reserveAddresses);

    function isKyberProxyAdded() external view returns (bool);
}
