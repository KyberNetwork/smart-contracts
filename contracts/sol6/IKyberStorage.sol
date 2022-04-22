pragma solidity 0.6.6;

import "./InimbleNetworkProxy.sol";
import "./InimbleReserve.sol";


interface InimbleStorage {
    enum ReserveType {NONE, FPR, APR, BRIDGE, UTILITY, CUSTOM, ORDERBOOK, LAST}

    function addnimbleProxy(address nimbleProxy, uint256 maxApprovedProxies)
        external;

    function removenimbleProxy(address nimbleProxy) external;

    function setContracts(address _nimbleFeeHandler, address _nimbleMatchingEngine) external;

    function setnimbleDaoContract(address _nimbleDao) external;

    function getReserveId(address reserve) external view returns (bytes32 reserveId);

    function getReserveIdsFromAddresses(address[] calldata reserveAddresses)
        external
        view
        returns (bytes32[] memory reserveIds);

    function getReserveAddressesFromIds(bytes32[] calldata reserveIds)
        external
        view
        returns (address[] memory reserveAddresses);

    function getReserveIdsPerTokenSrc(IERC20 token)
        external
        view
        returns (bytes32[] memory reserveIds);

    function getReserveAddressesPerTokenSrc(IERC20 token, uint256 startIndex, uint256 endIndex)
        external
        view
        returns (address[] memory reserveAddresses);

    function getReserveIdsPerTokenDest(IERC20 token)
        external
        view
        returns (bytes32[] memory reserveIds);

    function getReserveAddressesByReserveId(bytes32 reserveId)
        external
        view
        returns (address[] memory reserveAddresses);

    function getRebateWalletsFromIds(bytes32[] calldata reserveIds)
        external
        view
        returns (address[] memory rebateWallets);

    function getnimbleProxies() external view returns (InimbleNetworkProxy[] memory);

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

    function getReservesData(bytes32[] calldata reserveIds, IERC20 src, IERC20 dest)
        external
        view
        returns (
            bool areAllReservesListed,
            bool[] memory feeAccountedArr,
            bool[] memory entitledRebateArr,
            InimbleReserve[] memory reserveAddresses);

    function isnimbleProxyAdded() external view returns (bool);
}
