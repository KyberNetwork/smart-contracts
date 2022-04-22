pragma solidity 0.6.6;

import "./InimbleHistory.sol";
import "./InimbleStorage.sol";
import "./InimbleNetwork.sol";
import "./utils/PermissionGroupsNoModifiers.sol";
import "./utils/Utils5.sol";


/**
 *   @title nimbleStorage contract
 *   The contract provides the following functions for nimbleNetwork contract:
 *   - Stores reserve and token listing information by the nimbleNetwork
 *   - Stores feeAccounted data for reserve types
 *   - Record contract changes for reserves and nimbleProxies
 *   - Points to historical contracts that record contract changes for nimbleNetwork,
 *        nimbleFeeHandler, nimbleDao and nimbleMatchingEngine
 */
contract nimbleStorage is InimbleStorage, PermissionGroupsNoModifiers, Utils5 {
    // store current and previous contracts
    InimbleHistory public nimbleNetworkHistory;
    InimbleHistory public nimbleFeeHandlerHistory;
    InimbleHistory public nimbleDaoHistory;
    InimbleHistory public nimbleMatchingEngineHistory;

    InimbleReserve[] internal reserves;
    InimbleNetworkProxy[] internal nimbleProxyArray;

    mapping(bytes32 => address[]) internal reserveIdToAddresses;
    mapping(bytes32 => address) internal reserveRebateWallet;
    mapping(address => bytes32) internal reserveAddressToId;
    mapping(IERC20 => bytes32[]) internal reservesPerTokenSrc; // reserves supporting token to eth
    mapping(IERC20 => bytes32[]) internal reservesPerTokenDest; // reserves support eth to token
    mapping(bytes32 => IERC20[]) internal srcTokensPerReserve;
    mapping(bytes32 => IERC20[]) internal destTokensPerReserve;

    mapping(IERC20 => mapping(bytes32 => bool)) internal isListedReserveWithTokenSrc;
    mapping(IERC20 => mapping(bytes32 => bool)) internal isListedReserveWithTokenDest;

    uint256 internal feeAccountedPerType = 0xffffffff;
    uint256 internal entitledRebatePerType = 0xffffffff;
    mapping(bytes32 => uint256) internal reserveType; // type from enum ReserveType
    mapping(ReserveType => bytes32[]) internal reservesPerType;

    InimbleNetwork public nimbleNetwork;

    constructor(
        address _admin,
        InimbleHistory _nimbleNetworkHistory,
        InimbleHistory _nimbleFeeHandlerHistory,
        InimbleHistory _nimbleDaoHistory,
        InimbleHistory _nimbleMatchingEngineHistory
    ) public PermissionGroupsNoModifiers(_admin) {
        require(_nimbleNetworkHistory != InimbleHistory(0), "nimbleNetworkHistory 0");
        require(_nimbleFeeHandlerHistory != InimbleHistory(0), "nimbleFeeHandlerHistory 0");
        require(_nimbleDaoHistory != InimbleHistory(0), "nimbleDaoHistory 0");
        require(_nimbleMatchingEngineHistory != InimbleHistory(0), "nimbleMatchingEngineHistory 0");

        nimbleNetworkHistory = _nimbleNetworkHistory;
        nimbleFeeHandlerHistory = _nimbleFeeHandlerHistory;
        nimbleDaoHistory = _nimbleDaoHistory;
        nimbleMatchingEngineHistory = _nimbleMatchingEngineHistory;
    }

    event nimbleNetworkUpdated(InimbleNetwork newnimbleNetwork);
    event RemoveReserveFromStorage(address indexed reserve, bytes32 indexed reserveId);

    event AddReserveToStorage(
        address indexed reserve,
        bytes32 indexed reserveId,
        InimbleStorage.ReserveType reserveType,
        address indexed rebateWallet
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

    function setNetworkContract(InimbleNetwork _nimbleNetwork) external {
        onlyAdmin();
        require(_nimbleNetwork != InimbleNetwork(0), "nimbleNetwork 0");
        emit nimbleNetworkUpdated(_nimbleNetwork);
        nimbleNetworkHistory.saveContract(address(_nimbleNetwork));
        nimbleNetwork = _nimbleNetwork;
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

    function setContracts(address _nimbleFeeHandler, address _nimbleMatchingEngine)
        external
        override
    {
        onlyNetwork();
        require(_nimbleFeeHandler != address(0), "nimbleFeeHandler 0");
        require(_nimbleMatchingEngine != address(0), "nimbleMatchingEngine 0");

        nimbleFeeHandlerHistory.saveContract(_nimbleFeeHandler);
        nimbleMatchingEngineHistory.saveContract(_nimbleMatchingEngine);
    }

    function setnimbleDaoContract(address _nimbleDao) external override {
        onlyNetwork();

        nimbleDaoHistory.saveContract(_nimbleDao);
    }

    /// @notice Can be called only by operator
    /// @dev Adds a reserve to the storage
    /// @param reserve The reserve address
    /// @param reserveId The reserve ID in 32 bytes.
    /// @param resType Type of the reserve out of enum ReserveType
    /// @param rebateWallet Rebate wallet address for this reserve
    function addReserve(
        address reserve,
        bytes32 reserveId,
        ReserveType resType,
        address payable rebateWallet
    ) external {
        onlyOperator();
        require(reserveAddressToId[reserve] == bytes32(0), "reserve has id");
        require(reserveId != bytes32(0), "reserveId = 0");
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

        reserves.push(InimbleReserve(reserve));
        reservesPerType[resType].push(reserveId);
        reserveAddressToId[reserve] = reserveId;
        reserveType[reserveId] = uint256(resType);

        emit AddReserveToStorage(reserve, reserveId, resType, rebateWallet);
        emit ReserveRebateWalletSet(reserveId, rebateWallet);
    }

    /// @notice Can be called only by operator
    /// @dev Removes a reserve from the storage
    /// @param reserveId The reserve id
    /// @param startIndex Index to start searching from in reserve array
    function removeReserve(bytes32 reserveId, uint256 startIndex)
        external
    {
        onlyOperator();
        require(reserveIdToAddresses[reserveId].length > 0, "reserveId not found");
        address reserve = reserveIdToAddresses[reserveId][0];

        // delist all token pairs for reserve
        delistTokensOfReserve(reserveId);

        uint256 reserveIndex = 2**255;
        for (uint256 i = startIndex; i < reserves.length; i++) {
            if (reserves[i] == InimbleReserve(reserve)) {
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

        // remove reserveId from reservesPerType
        bytes32[] storage reservesOfType = reservesPerType[ReserveType(reserveType[reserveId])];
        for (uint256 i = 0; i < reservesOfType.length; i++) {
            if (reserveId == reservesOfType[i]) {
                reservesOfType[i] = reservesOfType[reservesOfType.length - 1];
                reservesOfType.pop();
                break;
            }
        }

        delete reserveAddressToId[reserve];
        delete reserveType[reserveId];
        delete reserveRebateWallet[reserveId];

        emit RemoveReserveFromStorage(reserve, reserveId);
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
    ) public {
        onlyOperator();

        require(reserveIdToAddresses[reserveId].length > 0, "reserveId not found");
        address reserve = reserveIdToAddresses[reserveId][0];
        require(reserve != address(0), "reserve = 0");

        if (ethToToken) {
            listPairs(reserveId, token, false, add);
            emit ListReservePairs(reserveId, reserve, ETH_TOKEN_ADDRESS, token, add);
        }

        if (tokenToEth) {
            nimbleNetwork.listTokenForReserve(reserve, token, add);
            listPairs(reserveId, token, true, add);
            emit ListReservePairs(reserveId, reserve, token, ETH_TOKEN_ADDRESS, add);
        }
    }

    /// @dev No. of nimbleProxies are capped
    function addnimbleProxy(address nimbleProxy, uint256 maxApprovedProxies)
        external
        override
    {
        onlyNetwork();
        require(nimbleProxy != address(0), "nimbleProxy 0");
        require(nimbleProxyArray.length < maxApprovedProxies, "max nimbleProxies limit reached");

        nimbleProxyArray.push(InimbleNetworkProxy(nimbleProxy));
    }

    function removenimbleProxy(address nimbleProxy) external override {
        onlyNetwork();
        uint256 proxyIndex = 2**255;

        for (uint256 i = 0; i < nimbleProxyArray.length; i++) {
            if (nimbleProxyArray[i] == InimbleNetworkProxy(nimbleProxy)) {
                proxyIndex = i;
                break;
            }
        }

        require(proxyIndex != 2**255, "nimbleProxy not found");
        nimbleProxyArray[proxyIndex] = nimbleProxyArray[nimbleProxyArray.length - 1];
        nimbleProxyArray.pop();
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
    function getReserves() external view returns (InimbleReserve[] memory) {
        return reserves;
    }

    function getReservesPerType(ReserveType resType) external view returns (bytes32[] memory) {
        return reservesPerType[resType];
    }

    function getReserveId(address reserve) external view override returns (bytes32) {
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
        for (uint256 i = 0; i < rebateWallets.length; i++) {
            rebateWallets[i] = reserveRebateWallet[reserveIds[i]];
        }
    }

    function getReserveIdsPerTokenSrc(IERC20 token)
        external
        view
        override
        returns (bytes32[] memory reserveIds)
    {
        reserveIds = reservesPerTokenSrc[token];
    }

    /// @dev nimbleNetwork is calling this function to approve (allowance) for list of reserves for a token
    ///      in case we have a long list of reserves, approving all of them could run out of gas
    ///      using startIndex and endIndex to prevent above scenario
    ///      also enable us to approve reserve one by one
    function getReserveAddressesPerTokenSrc(IERC20 token, uint256 startIndex, uint256 endIndex)
        external
        view
        override
        returns (address[] memory reserveAddresses)
    {
        bytes32[] memory reserveIds = reservesPerTokenSrc[token];
        if (reserveIds.length == 0) {
            return reserveAddresses;
        }
        uint256 endId = (endIndex >= reserveIds.length) ? (reserveIds.length - 1) : endIndex;
        if (endId < startIndex) {
            return reserveAddresses;
        }
        reserveAddresses = new address[](endId - startIndex + 1);
        for(uint256 i = startIndex; i <= endId; i++) {
            reserveAddresses[i - startIndex] = reserveIdToAddresses[reserveIds[i]][0];
        }
    }

    function getReserveIdsPerTokenDest(IERC20 token)
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
    /// @dev Returns list of nimbleDao, nimbleFeeHandler, nimbleMatchingEngine and nimbleNetwork contracts
    /// @dev Index 0 is currently used contract address, indexes > 0 are older versions
    function getContracts()
        external
        view
        returns (
            address[] memory nimbleDaoAddresses,
            address[] memory nimbleFeeHandlerAddresses,
            address[] memory nimbleMatchingEngineAddresses,
            address[] memory nimbleNetworkAddresses
        )
    {
        nimbleDaoAddresses = nimbleDaoHistory.getContracts();
        nimbleFeeHandlerAddresses = nimbleFeeHandlerHistory.getContracts();
        nimbleMatchingEngineAddresses = nimbleMatchingEngineHistory.getContracts();
        nimbleNetworkAddresses = nimbleNetworkHistory.getContracts();
    }

    /// @notice Should be called off chain
    /// @return An array of nimbleNetworkProxies
    function getnimbleProxies() external view override returns (InimbleNetworkProxy[] memory) {
        return nimbleProxyArray;
    }

    function isnimbleProxyAdded() external view override returns (bool) {
        return (nimbleProxyArray.length > 0);
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
        address[] memory reserveAddresses = reserveIdToAddresses[reserveId];

        if (reserveAddresses.length != 0) {
            reserveAddress = reserveIdToAddresses[reserveId][0];
            rebateWallet = reserveRebateWallet[reserveId];
            uint256 resTypeUint = reserveType[reserveId];
            resType = ReserveType(resTypeUint);
            isFeeAccountedFlag = (feeAccountedPerType & (1 << resTypeUint)) > 0;
            isEntitledRebateFlag = (entitledRebatePerType & (1 << resTypeUint)) > 0;
        }
    }

    /// @notice Returns information about a reserve given its reserve ID
    /// @return reserveId The reserve ID in 32 bytes.
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

    function getListedTokensByReserveId(bytes32 reserveId)
        external
        view
        returns (
            IERC20[] memory srcTokens,
            IERC20[] memory destTokens
        )
    {
        srcTokens = srcTokensPerReserve[reserveId];
        destTokens = destTokensPerReserve[reserveId];
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

    /// @dev Returns information about reserves given their reserve IDs
    ///      Also check if these reserve IDs are listed for token
    ///      Network calls this function to retrive information about fee, address and rebate information
    function getReservesData(bytes32[] calldata reserveIds, IERC20 src, IERC20 dest)
        external
        view
        override
        returns (
            bool areAllReservesListed,
            bool[] memory feeAccountedArr,
            bool[] memory entitledRebateArr,
            InimbleReserve[] memory reserveAddresses)
    {
        feeAccountedArr = new bool[](reserveIds.length);
        entitledRebateArr = new bool[](reserveIds.length);
        reserveAddresses = new InimbleReserve[](reserveIds.length);
        areAllReservesListed = true;

        uint256 entitledRebateData = entitledRebatePerType;
        uint256 feeAccountedData = feeAccountedPerType;

        mapping(bytes32 => bool) storage isListedReserveWithToken = (dest == ETH_TOKEN_ADDRESS) ?
            isListedReserveWithTokenSrc[src]:
            isListedReserveWithTokenDest[dest];

        for (uint256 i = 0; i < reserveIds.length; i++) {
            uint256 resType = reserveType[reserveIds[i]];
            entitledRebateArr[i] = (entitledRebateData & (1 << resType) > 0);
            feeAccountedArr[i] = (feeAccountedData & (1 << resType) > 0);
            reserveAddresses[i] = InimbleReserve(reserveIdToAddresses[reserveIds[i]][0]);

            if (!isListedReserveWithToken[reserveIds[i]]){
                areAllReservesListed = false;
                break;
            }
        }
    }

    function delistTokensOfReserve(bytes32 reserveId) internal {
        // token to ether
        // memory declaration instead of storage because we are modifying the storage array
        IERC20[] memory tokensArr = srcTokensPerReserve[reserveId];
        for (uint256 i = 0; i < tokensArr.length; i++) {
            listPairForReserve(reserveId, tokensArr[i], false, true, false);
        }

        // ether to token
        tokensArr = destTokensPerReserve[reserveId];
        for (uint256 i = 0; i < tokensArr.length; i++) {
            listPairForReserve(reserveId, tokensArr[i], true, false, false);
        }
    }

    function listPairs(
        bytes32 reserveId,
        IERC20 token,
        bool isTokenToEth,
        bool add
    ) internal {
        uint256 i;
        bytes32[] storage reserveArr = reservesPerTokenDest[token];
        IERC20[] storage tokensArr = destTokensPerReserve[reserveId];
        mapping(bytes32 => bool) storage isListedReserveWithToken = isListedReserveWithTokenDest[token];

        if (isTokenToEth) {
            reserveArr = reservesPerTokenSrc[token];
            tokensArr = srcTokensPerReserve[reserveId];
            isListedReserveWithToken = isListedReserveWithTokenSrc[token];
        }

        for (i = 0; i < reserveArr.length; i++) {
            if (reserveId == reserveArr[i]) {
                if (add) {
                    return; // reserve already added, no further action needed
                } else {
                    // remove reserve from reserveArr
                    reserveArr[i] = reserveArr[reserveArr.length - 1];
                    reserveArr.pop();

                    break;
                }
            }
        }

        if (add) {
            // add reserve and token to reserveArr and tokensArr respectively
            reserveArr.push(reserveId);
            tokensArr.push(token);
            isListedReserveWithToken[reserveId] = true;
        } else {
            // remove token from tokenArr
            for (i = 0; i < tokensArr.length; i++) {
                if (token == tokensArr[i]) {
                    tokensArr[i] = tokensArr[tokensArr.length - 1];
                    tokensArr.pop();
                    break;
                }
            }
            delete isListedReserveWithToken[reserveId];
        }
    }

    function onlyNetwork() internal view {
        require(msg.sender == address(nimbleNetwork), "only nimbleNetwork");
    }
}
