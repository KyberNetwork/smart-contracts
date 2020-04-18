pragma solidity 0.5.11;

import "./IKyberStorage.sol";
import "./IKyberFeeHandler.sol";
import "./IKyberMatchingEngine.sol";
import "./IKyberNetwork.sol";
import "./utils/PermissionGroupsNoModifiers.sol";


/**
 *   @title KyberStorage contract
 *   The contract provides the following functions for KyberNetwork contract:
 *   - Stores reserve and token listing information by the network
 *   - Stores feeAccounted data for reserve types
 *   - Record contract changes for network, matchingEngine, feeHandler, reserves, network proxies and kyberDAO
 */
contract KyberStorage is IKyberStorage, PermissionGroupsNoModifiers {
    // store current and previous contracts.
    IKyberNetwork[] internal previousNetworks;
    IKyberFeeHandler[] internal feeHandler;
    IKyberDAO[] internal kyberDAO;
    IKyberMatchingEngine[] internal matchingEngine;
    IKyberReserve[] internal reserves;
    IKyberNetworkProxy[] internal kyberProxyArray;

    mapping(bytes32 => address[]) public reserveIdToAddresses;
    mapping(address => bytes32) internal reserveAddressToId;
    mapping(address => bytes32[]) internal reservesPerTokenSrc; // reserves supporting token to eth
    mapping(address => bytes32[]) internal reservesPerTokenDest; // reserves support eth to token

    uint256 internal feeAccountedPerType = 0xffffffff;
    mapping(bytes32 => uint256) internal reserveType; // type from enum ReserveType

    IKyberNetwork public kyberNetwork;

    constructor(address _admin) public PermissionGroupsNoModifiers(_admin) {}

    event KyberNetworkUpdated(IKyberNetwork newNetwork);

    function setNetworkContract(IKyberNetwork _kyberNetwork) external {
        onlyAdmin();
        require(_kyberNetwork != IKyberNetwork(0), "network 0");
        emit KyberNetworkUpdated(_kyberNetwork);
        previousNetworks.push(kyberNetwork);
        kyberNetwork = _kyberNetwork;
    }

    function setContracts(IKyberFeeHandler _feeHandler, address _matchingEngine)
        external
        returns (bool)
    {
        onlyNetwork();
        require(_feeHandler != IKyberFeeHandler(0), "feeHandler 0");
        require(_matchingEngine != address(0), "matchingEngine 0");
        IKyberMatchingEngine newMatchingEngine = IKyberMatchingEngine(_matchingEngine);

        if (feeHandler.length > 0) {
            feeHandler.push(feeHandler[0]);
            feeHandler[0] = _feeHandler;
        } else {
            feeHandler.push(_feeHandler);
        }

        if (matchingEngine.length > 0) {
            matchingEngine.push(matchingEngine[0]);
            matchingEngine[0] = newMatchingEngine;
        } else {
            matchingEngine.push(newMatchingEngine);
        }
        return true;
    }

    function setDAOContract(IKyberDAO _kyberDAO) external returns (bool) {
        onlyNetwork();
        require(_kyberDAO != IKyberDAO(0), "kyberDAO 0");
        if (kyberDAO.length > 0) {
            kyberDAO.push(kyberDAO[0]);
            kyberDAO[0] = _kyberDAO;
        } else {
            kyberDAO.push(_kyberDAO);
        }
        return true;
    }

    function addReserve(
        address reserve,
        bytes32 reserveId,
        ReserveType resType
    ) external returns (bool) {
        onlyNetwork();
        require(reserveAddressToId[reserve] == bytes32(0), "reserve has id");
        require(reserveId != 0, "reserveId = 0");
        require(
            (resType != ReserveType.NONE) && (uint256(resType) < uint256(ReserveType.LAST)),
            "bad reserve type"
        );
        require(feeAccountedPerType != 0xffffffff, "fee accounted data not set");

        if (reserveIdToAddresses[reserveId].length == 0) {
            reserveIdToAddresses[reserveId].push(reserve);
        } else {
            require(reserveIdToAddresses[reserveId][0] == address(0), "reserveId taken");
            reserveIdToAddresses[reserveId][0] = reserve;
        }

        reserves.push(IKyberReserve(reserve));
        reserveAddressToId[reserve] = reserveId;
        reserveType[reserveId] = uint256(resType);

        return true;
    }

    function removeReserve(address reserve, uint256 startIndex)
        external
        returns (bytes32 reserveId)
    {
        onlyNetwork();
        uint256 reserveIndex = 2**255;
        for (uint256 i = startIndex; i < reserves.length; i++) {
            if (reserves[i] == IKyberReserve(reserve)) {
                reserveIndex = i;
                break;
            }
        }
        require(reserveIndex != 2**255, "reserve not found");
        reserves[reserveIndex] = reserves[reserves.length - 1];
        reserves.pop();
        // remove reserve from mapping to address
        require(reserveAddressToId[reserve] != bytes32(0), "reserve's existing reserveId is 0");
        reserveId = reserveAddressToId[reserve];

        // update reserve mappings
        reserveIdToAddresses[reserveId].push(reserveIdToAddresses[reserveId][0]);
        reserveIdToAddresses[reserveId][0] = address(0);
        reserveAddressToId[reserve] = bytes32(0);

        reserveType[reserveId] = uint256(ReserveType.NONE);

        return reserveId;
    }

    function listPairForReserve(
        address reserve,
        IERC20 token,
        bool ethToToken,
        bool tokenToEth,
        bool add
    ) external returns (bool) {
        onlyNetwork();
        bytes32 reserveId = reserveAddressToId[reserve];
        require(reserveId != bytes32(0), "reserveId = 0");

        if (ethToToken) {
            listPairs(reserveId, token, false, add);
        }

        if (tokenToEth) {
            listPairs(reserveId, token, true, add);
        }

        return true;
    }

    /// @dev No. of KyberNetworkProxies are capped
    function addKyberProxy(address networkProxy, uint256 max_approved_proxies)
        external
        returns (bool)
    {
        onlyNetwork();
        require(networkProxy != address(0), "proxy 0");
        require(kyberProxyArray.length < max_approved_proxies, "max proxies limit reached");

        kyberProxyArray.push(IKyberNetworkProxy(networkProxy));

        return true;
    }

    function removeKyberProxy(address networkProxy) external returns (bool) {
        onlyNetwork();
        uint256 proxyIndex = 2**255;

        for (uint256 i = 0; i < kyberProxyArray.length; i++) {
            if (kyberProxyArray[i] == IKyberNetworkProxy(networkProxy)) {
                proxyIndex = i;
                break;
            }
        }

        require(proxyIndex != 2**255, "proxy not found");
        kyberProxyArray[proxyIndex] = kyberProxyArray[kyberProxyArray.length - 1];
        kyberProxyArray.pop();

        return true;
    }

    function setFeeAccountedPerReserveType(
        bool fpr,
        bool apr,
        bool bridge,
        bool utility,
        bool custom,
        bool orderbook
    ) external {
        onlyAdmin();
        uint256 feeAccountedData;

        if (apr) feeAccountedData |= 1 << uint256(ReserveType.APR);
        if (fpr) feeAccountedData |= 1 << uint256(ReserveType.FPR);
        if (bridge) feeAccountedData |= 1 << uint256(ReserveType.BRIDGE);
        if (utility) feeAccountedData |= 1 << uint256(ReserveType.UTILITY);
        if (custom) feeAccountedData |= 1 << uint256(ReserveType.CUSTOM);
        if (orderbook) feeAccountedData |= 1 << uint256(ReserveType.ORDERBOOK);

        feeAccountedPerType = feeAccountedData;
    }

    /// @notice Should be called off chain
    /// @return An array of all reserves
    function getReserves() external view returns (IKyberReserve[] memory) {
        return reserves;
    }

    function getReserveID(address reserve) external view returns (bytes32) {
        return reserveAddressToId[reserve];
    }

    function convertReserveAddresstoId(address reserve) external view returns (bytes32 reserveId) {
        return reserveAddressToId[reserve];
    }

    function convertReserveIdToAddress(bytes32 reserveId) external view returns (address reserve) {
        return reserveIdToAddresses[reserveId][0];
    }

    function convertReserveAddressestoIds(address[] calldata reserveAddresses)
        external
        view
        returns (bytes32[] memory reserveIds)
    {
        reserveIds = new bytes32[](reserveAddresses.length);
        for (uint256 i = 0; i < reserveAddresses.length; i++) {
            reserveIds[i] = reserveAddressToId[reserveAddresses[i]];
        }
    }

    function convertReserveIdsToAddresses(bytes32[] calldata reserveIds)
        external
        view
        returns (address[] memory reserveAddresses)
    {
        reserveAddresses = new address[](reserveIds.length);
        for (uint256 i = 0; i < reserveIds.length; i++) {
            reserveAddresses[i] = reserveIdToAddresses[reserveIds[i]][0];
        }
    }

    function getReservesPerTokenSrc(address token)
        external
        view
        returns (bytes32[] memory reserveIds)
    {
        return reservesPerTokenSrc[token];
    }

    function getReservesPerTokenDest(address token)
        external
        view
        returns (bytes32[] memory reserveIds)
    {
        return reservesPerTokenDest[token];
    }

    /// @notice Should be called off chain
    /// @dev Returns list of DAO, feeHandler, matchingEngine and previous network contracts
    /// @dev Index 0 is currently used contract address, indexes > 0 are older versions
    function getContracts()
        external
        view
        returns (
            IKyberDAO[] memory daoAddresses,
            IKyberFeeHandler[] memory feeHandlerAddresses,
            IKyberMatchingEngine[] memory matchingEngineAddresses,
            IKyberNetwork[] memory previousNetworkContracts
        )
    {
        return (kyberDAO, feeHandler, matchingEngine, previousNetworks);
    }

    /// @notice Should be called off chain
    /// @return An array of KyberNetworkProxies
    function getKyberProxies() external view returns (IKyberNetworkProxy[] memory) {
        return kyberProxyArray;
    }

    function isKyberProxyAdded() external view returns (bool) {
        return (kyberProxyArray.length > 0);
    }

    /// @notice Returns information about a reserve given its reserve ID
    /// @return reserveAddress Address of the reserve
    /// @return resType Reserve type from enum ReserveType
    /// @return isFeeAccountedFlags Whether fees are to be charged for the trade for this reserve
    function getReserveDetailsById(bytes32 reserveId)
        external
        view
        returns (
            address reserveAddress,
            ReserveType resType,
            bool isFeeAccountedFlags
        )
    {
        reserveAddress = reserveIdToAddresses[reserveId][0];
        resType = ReserveType(reserveType[reserveId]);
        isFeeAccountedFlags = (feeAccountedPerType & (1 << reserveType[reserveId])) > 0;
    }

    /// @notice Returns information about a reserve given its reserve ID
    /// @return reserveId The reserve ID in 32 bytes. 1st byte is reserve type
    /// @return resType Reserve type from enum ReserveType
    /// @return isFeeAccountedFlags Whether fees are to be charged for the trade for this reserve
    function getReserveDetailsByAddress(address reserve)
        external
        view
        returns (
            bytes32 reserveId,
            ReserveType resType,
            bool isFeeAccountedFlags
        )
    {
        reserveId = reserveAddressToId[reserve];
        resType = ReserveType(reserveType[reserveId]);
        isFeeAccountedFlags = (feeAccountedPerType & (1 << reserveType[reserveId])) > 0;
    }

    function getFeeAccountedData(bytes32[] calldata reserveIds)
        external
        view
        returns (bool[] memory feeAccountedArr)
    {
        feeAccountedArr = new bool[](reserveIds.length);

        uint256 feeAccountedData = feeAccountedPerType;

        for (uint256 i = 0; i < reserveIds.length; i++) {
            feeAccountedArr[i] = (feeAccountedData & (1 << reserveType[reserveIds[i]]) > 0);
        }
    }

    function listPairs(
        bytes32 reserveId,
        IERC20 token,
        bool isTokenToEth,
        bool add
    ) internal {
        uint256 i;
        bytes32[] storage reserveArr = reservesPerTokenDest[address(token)];

        if (isTokenToEth) {
            reserveArr = reservesPerTokenSrc[address(token)];
        }

        for (i = 0; i < reserveArr.length; i++) {
            if (reserveId == reserveArr[i]) {
                if (add) {
                    break; // already added
                } else {
                    // remove
                    reserveArr[i] = reserveArr[reserveArr.length - 1];
                    reserveArr.pop();
                    break;
                }
            }
        }

        if (add && i == reserveArr.length) {
            // if reserve wasn't found add it
            reserveArr.push(reserveId);
        }
    }

    function onlyNetwork() internal view {
        require(msg.sender == address(kyberNetwork), "only network");
    }
}
