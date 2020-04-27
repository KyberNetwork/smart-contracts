pragma solidity 0.6.6;

import "./IKyberStorage.sol";
import "./IKyberFeeHandler.sol";
import "./IKyberMatchingEngine.sol";
import "./IKyberNetwork.sol";
import "./utils/PermissionGroupsNoModifiers.sol";
import "./utils/Utils5.sol";


/**
 *   @title KyberStorage contract
 *   The contract provides the following functions for KyberNetwork contract:
 *   - Stores reserve and token listing information by the network
 *   - Stores feeAccounted data for reserve types
 *   - Record contract changes for network, matchingEngine, feeHandler, reserves, network proxies and kyberDAO
 */
contract KyberStorage is IKyberStorage, PermissionGroupsNoModifiers, Utils5 {
    // store current and previous contracts.
    IKyberNetwork[] internal previousNetworks;
    IKyberFeeHandler[] internal feeHandler;
    IKyberDAO[] internal kyberDAO;
    IKyberMatchingEngine[] internal matchingEngine;
    IKyberReserve[] internal reserves;
    IKyberNetworkProxy[] internal kyberProxyArray;

    mapping(bytes32 => address[]) internal reserveIdToAddresses;
    mapping(bytes32 => address) internal reserveRebateWallet;
    mapping(address => bytes32) internal reserveAddressToId;
    mapping(address => bytes32[]) internal reservesPerTokenSrc; // reserves supporting token to eth
    mapping(address => bytes32[]) internal reservesPerTokenDest; // reserves support eth to token

    uint256 internal feeAccountedPerType = 0xffffffff;
    uint256 internal entitledRebatePerType = 0xffffffff;
    mapping(bytes32 => uint256) internal reserveType; // type from enum ReserveType

    IKyberNetwork public kyberNetwork;

    constructor(address _admin) public PermissionGroupsNoModifiers(_admin) {}

    event KyberNetworkUpdated(IKyberNetwork newNetwork);
    event RemoveReserveFromStorage(address indexed reserve, bytes32 indexed reserveId);

    event AddReserveToStorage(
        address indexed reserve,
        bytes32 indexed reserveId,
        IKyberStorage.ReserveType reserveType,
        address indexed rebateWallet,
        bool add
    );

    event ReserveRebateWalletSet(
        bytes32 indexed reserveId,
        address indexed rebateWallet
    );

    event ListReservePairs(
        bytes32 indexed reserveId,
        address reserve,
        IERC20 indexed src,
        IERC20 indexed dest,
        bool add
    );

    function setNetworkContract(IKyberNetwork _kyberNetwork) external {
        onlyAdmin();
        require(_kyberNetwork != IKyberNetwork(0), "network 0");
        emit KyberNetworkUpdated(_kyberNetwork);
        previousNetworks.push(kyberNetwork);
        kyberNetwork = _kyberNetwork;
    }

    function setRebateWallet(bytes32 reserveId, address rebateWallet) external {
        onlyOperator();
        require(rebateWallet != address(0), "rebate wallet is 0");
        require(reserveId != bytes32(0), "reserveId = 0");
        require(reserveIdToAddresses[reserveId].length > 0, "reserveId not found");
        require(reserveIdToAddresses[reserveId][0] != address(0), "no reserve associated");

        reserveRebateWallet[reserveId] = rebateWallet;
        emit ReserveRebateWalletSet(reserveId, rebateWallet);
    }

    function setContracts(IKyberFeeHandler _feeHandler, address _matchingEngine)
        external
        override
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

    function setDAOContract(IKyberDAO _kyberDAO) external override returns (bool) {
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

    /// @notice Can be called only by operator
    /// @dev Adds a reserve to the storage
    /// @param reserve The reserve address
    /// @param reserveId The reserve ID in 32 bytes. 1st byte is reserve type
    /// @param resType Type of the reserve out of enum ReserveType
    /// @param rebateWallet Rebate wallet address for this reserve
    function addReserve(
        address reserve,
        bytes32 reserveId,
        ReserveType resType,
        address payable rebateWallet
    ) external returns (bool) {
        onlyOperator();
        require(reserveAddressToId[reserve] == bytes32(0), "reserve has id");
        require(reserveId != 0, "reserveId = 0");
        require(
            (resType != ReserveType.NONE) && (uint256(resType) < uint256(ReserveType.LAST)),
            "bad reserve type"
        );
        require(feeAccountedPerType != 0xffffffff, "fee accounted data not set");
        require(entitledRebatePerType != 0xffffffff, "entitled rebate data not set");
        require(rebateWallet != address(0), "rebate wallet is 0");

        reserveRebateWallet[reserveId] = rebateWallet;

        if (reserveIdToAddresses[reserveId].length == 0) {
            reserveIdToAddresses[reserveId].push(reserve);
        } else {
            require(reserveIdToAddresses[reserveId][0] == address(0), "reserveId taken");
            reserveIdToAddresses[reserveId][0] = reserve;
        }

        reserves.push(IKyberReserve(reserve));
        reserveAddressToId[reserve] = reserveId;
        reserveType[reserveId] = uint256(resType);

        emit AddReserveToStorage(reserve, reserveId, resType, rebateWallet, true);
        emit ReserveRebateWalletSet(reserveId, rebateWallet);
        return true;
    }

    /// @notice Can be called only by operator
    /// @dev Removes a reserve from the storage
    /// @param reserveId The reserve id
    /// @param startIndex Index to start searching from in reserve array
    function removeReserve(bytes32 reserveId, uint256 startIndex)
        external
        returns (bool)
    {
        onlyOperator();
        require(reserveIdToAddresses[reserveId].length > 0, "reserveId not found");
        address reserve = reserveIdToAddresses[reserveId][0];

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

        reserveRebateWallet[reserveId] = address(0);

        emit RemoveReserveFromStorage(reserve, reserveId);
        return true;
    }

    /// @notice Can be called only by operator
    /// @dev Allow or prevent a specific reserve to trade a pair of tokens
    /// @param reserveId The reserve id
    /// @param token Token address
    /// @param ethToToken Will it support ether to token trade
    /// @param tokenToEth Will it support token to ether trade
    /// @param add If true then list this pair, otherwise unlist it
    function listPairForReserve(
        bytes32 reserveId,
        IERC20 token,
        bool ethToToken,
        bool tokenToEth,
        bool add
    ) external returns (bool) {
        onlyOperator();

        require(reserveIdToAddresses[reserveId].length > 0, "reserveId not found");
        address reserve = reserveIdToAddresses[reserveId][0];
        require(reserve != address(0), "reserve = 0");

        if (ethToToken) {
            listPairs(reserveId, token, false, add);
            emit ListReservePairs(reserveId, reserve, ETH_TOKEN_ADDRESS, token, add);
        }

        if (tokenToEth) {
            require(
                kyberNetwork.listTokenForReserve(reserve, token, add),
                "network failed to list token"
            );
            listPairs(reserveId, token, true, add);
            emit ListReservePairs(reserveId, reserve, token, ETH_TOKEN_ADDRESS, add);
        }

        return true;
    }

    /// @dev No. of KyberNetworkProxies are capped
    function addKyberProxy(address networkProxy, uint256 max_approved_proxies)
        external
        override
        returns (bool)
    {
        onlyNetwork();
        require(networkProxy != address(0), "proxy 0");
        require(kyberProxyArray.length < max_approved_proxies, "max proxies limit reached");

        kyberProxyArray.push(IKyberNetworkProxy(networkProxy));

        return true;
    }

    function removeKyberProxy(address networkProxy) external override returns (bool) {
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

        if (fpr) feeAccountedData |= 1 << uint256(ReserveType.FPR);
        if (apr) feeAccountedData |= 1 << uint256(ReserveType.APR);
        if (bridge) feeAccountedData |= 1 << uint256(ReserveType.BRIDGE);
        if (utility) feeAccountedData |= 1 << uint256(ReserveType.UTILITY);
        if (custom) feeAccountedData |= 1 << uint256(ReserveType.CUSTOM);
        if (orderbook) feeAccountedData |= 1 << uint256(ReserveType.ORDERBOOK);

        feeAccountedPerType = feeAccountedData;
    }

    function setEntitledRebatePerReserveType(
        bool fpr,
        bool apr,
        bool bridge,
        bool utility,
        bool custom,
        bool orderbook
    ) external {
        onlyAdmin();
        require(feeAccountedPerType != 0xffffffff, "fee accounted data not set");
        uint256 entitledRebateData;

        if (fpr) {
            require(feeAccountedPerType & (1 << uint256(ReserveType.FPR)) > 0, "fpr not fee accounted");
            entitledRebateData |= 1 << uint256(ReserveType.FPR);
        }

        if (apr) {
            require(feeAccountedPerType & (1 << uint256(ReserveType.APR)) > 0, "apr not fee accounted");
            entitledRebateData |= 1 << uint256(ReserveType.APR);
        }

        if (bridge) {
            require(feeAccountedPerType & (1 << uint256(ReserveType.BRIDGE)) > 0, "bridge not fee accounted");
            entitledRebateData |= 1 << uint256(ReserveType.BRIDGE);
        }

        if (utility) {
            require(feeAccountedPerType & (1 << uint256(ReserveType.UTILITY)) > 0, "utility not fee accounted");
            entitledRebateData |= 1 << uint256(ReserveType.UTILITY);
        }

        if (custom) {
            require(feeAccountedPerType & (1 << uint256(ReserveType.CUSTOM)) > 0, "custom not fee accounted");
            entitledRebateData |= 1 << uint256(ReserveType.CUSTOM);
        }

        if (orderbook) {
            require(feeAccountedPerType & (1 << uint256(ReserveType.ORDERBOOK)) > 0, "orderbook not fee accounted");
            entitledRebateData |= 1 << uint256(ReserveType.ORDERBOOK);
        }

        entitledRebatePerType = entitledRebateData;
    }

    /// @notice Should be called off chain
    /// @return An array of all reserves
    function getReserves() external view returns (IKyberReserve[] memory) {
        return reserves;
    }

    function getReserveID(address reserve) external view override returns (bytes32) {
        return reserveAddressToId[reserve];
    }

    function getReserveIdsFromAddresses(address[] calldata reserveAddresses)
        external
        override
        view
        returns (bytes32[] memory reserveIds)
    {
        reserveIds = new bytes32[](reserveAddresses.length);
        for (uint256 i = 0; i < reserveAddresses.length; i++) {
            reserveIds[i] = reserveAddressToId[reserveAddresses[i]];
        }
    }

    function getReserveAddressesFromIds(bytes32[] calldata reserveIds)
        external
        view
        override
        returns (address[] memory reserveAddresses)
    {
        reserveAddresses = new address[](reserveIds.length);
        for (uint256 i = 0; i < reserveIds.length; i++) {
            reserveAddresses[i] = reserveIdToAddresses[reserveIds[i]][0];
        }
    }

    function getRebateWalletsFromIds(bytes32[] calldata reserveIds)
        external
        view
        override
        returns (address[] memory rebateWallets)
    {
        rebateWallets = new address[](reserveIds.length);
        for(uint i = 0; i < rebateWallets.length; i++) {
            rebateWallets[i] = reserveRebateWallet[reserveIds[i]];
        }
    }

    function getReserveIdsPerTokenSrc(address token)
        external
        view
        override
        returns (bytes32[] memory reserveIds)
    {
        reserveIds = reservesPerTokenSrc[token];
    }

    /// @dev Network is calling this function to approve (allowance) for list of reserves for a token
    ///      in case we have a long list of reserves, approving all of them could run out of gas
    ///      using startIndex and endIndex to prevent above scenario
    ///      also enable us to approve reserve one by one
    function getReserveAddressesPerTokenSrc(address token, uint256 startIndex, uint256 endIndex)
        external
        view
        override
        returns (address[] memory reserveAddresses)
    {
        bytes32[] memory reserveIds = reservesPerTokenSrc[token];
        if (reserveIds.length == 0) {
            return reserveAddresses ;
        }
        uint256 endId = (endIndex >= reserveIds.length) ? (reserveIds.length - 1) : endIndex;
        if (endId < startIndex) {
            return reserveAddresses;
        }
        reserveAddresses = new address[](endId - startIndex + 1);
        for(uint i = startIndex; i <= endId; i++) {
            reserveAddresses[i - startIndex] = reserveIdToAddresses[reserveIds[i]][0];
        }
    }

    function getReserveIdsPerTokenDest(address token)
        external
        view
        override
        returns (bytes32[] memory reserveIds)
    {
        reserveIds = reservesPerTokenDest[token];
    }

    function getReserveAddressesByReserveId(bytes32 reserveId)
        external
        view
        override
        returns (address[] memory reserveAddresses)
    {
        reserveAddresses = reserveIdToAddresses[reserveId];
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
    function getKyberProxies() external view override returns (IKyberNetworkProxy[] memory) {
        return kyberProxyArray;
    }

    function isKyberProxyAdded() external view override returns (bool) {
        return (kyberProxyArray.length > 0);
    }

    /// @notice Returns information about a reserve given its reserve ID
    /// @return reserveAddress Address of the reserve
    /// @return rebateWallet address of rebate wallet of this reserve
    /// @return resType Reserve type from enum ReserveType
    /// @return isFeeAccountedFlag Whether fees are to be charged for the trade for this reserve
    /// @return isEntitledRebateFlag Whether reserve is entitled rebate from the trade fees
    function getReserveDetailsById(bytes32 reserveId)
        external
        view
        override
        returns (
            address reserveAddress,
            address rebateWallet,
            ReserveType resType,
            bool isFeeAccountedFlag,
            bool isEntitledRebateFlag
        )
    {
        reserveAddress = reserveIdToAddresses[reserveId][0];
        rebateWallet = reserveRebateWallet[reserveId];
        uint256 resTypeUint = reserveType[reserveId];
        resType = ReserveType(resTypeUint);
        isFeeAccountedFlag = (feeAccountedPerType & (1 << resTypeUint)) > 0;
        isEntitledRebateFlag = (entitledRebatePerType & (1 << resTypeUint)) > 0;
    }

    /// @notice Returns information about a reserve given its reserve ID
    /// @return reserveId The reserve ID in 32 bytes. 1st byte is reserve type
    /// @return rebateWallet address of rebate wallet of this reserve
    /// @return resType Reserve type from enum ReserveType
    /// @return isFeeAccountedFlag Whether fees are to be charged for the trade for this reserve
    /// @return isEntitledRebateFlag Whether reserve is entitled rebate from the trade fees
    function getReserveDetailsByAddress(address reserve)
        external
        view
        override
        returns (
            bytes32 reserveId,
            address rebateWallet,
            ReserveType resType,
            bool isFeeAccountedFlag,
            bool isEntitledRebateFlag
        )
    {
        reserveId = reserveAddressToId[reserve];
        rebateWallet = reserveRebateWallet[reserveId];
        uint256 resTypeUint = reserveType[reserveId];
        resType = ReserveType(resTypeUint);
        isFeeAccountedFlag = (feeAccountedPerType & (1 << resTypeUint)) > 0;
        isEntitledRebateFlag = (entitledRebatePerType & (1 << resTypeUint)) > 0;
    }

    function getFeeAccountedData(bytes32[] calldata reserveIds)
        external
        view
        override
        returns (bool[] memory feeAccountedArr)
    {
        feeAccountedArr = new bool[](reserveIds.length);

        uint256 feeAccountedData = feeAccountedPerType;

        for (uint256 i = 0; i < reserveIds.length; i++) {
            feeAccountedArr[i] = (feeAccountedData & (1 << reserveType[reserveIds[i]]) > 0);
        }
    }

    function getEntitledRebateData(bytes32[] calldata reserveIds)
        external
        view
        override
        returns (bool[] memory entitledRebateArr)
    {
        entitledRebateArr = new bool[](reserveIds.length);

        uint256 entitledRebateData = entitledRebatePerType;

        for (uint256 i = 0; i < reserveIds.length; i++) {
            entitledRebateArr[i] = (entitledRebateData & (1 << reserveType[reserveIds[i]]) > 0);
        }
    }

    function getReservesData(bytes32[] calldata reserveIds)
        external
        view
        override
        returns (
            bool[] memory feeAccountedArr,
            bool[] memory entitledRebateArr,
            IKyberReserve[] memory reserveAddresses)
    {
        feeAccountedArr = new bool[](reserveIds.length);
        entitledRebateArr = new bool[](reserveIds.length);
        reserveAddresses = new IKyberReserve[](reserveIds.length);

        uint256 entitledRebateData = entitledRebatePerType;
        uint256 feeAccountedData = feeAccountedPerType;

        for (uint256 i = 0; i < reserveIds.length; i++) {
            uint256 resTypeUint = reserveType[reserveIds[i]];
            entitledRebateArr[i] = (entitledRebateData & (1 << resTypeUint) > 0);
            feeAccountedArr[i] = (feeAccountedData & (1 << resTypeUint) > 0);
            reserveAddresses[i] = IKyberReserve(reserveIdToAddresses[reserveIds[i]][0]);
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
