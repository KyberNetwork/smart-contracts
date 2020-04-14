pragma  solidity 0.5.11;

import "./utils/WithdrawableNoModifiers.sol";
import "./IKyberMatchingEngine.sol";
import "./IKyberNetwork.sol";
import "./KyberHintHandler.sol";
import "./IKyberStorage.sol";


/*
*   @title Kyber matching engine contract
*   The contract provides the following actions:
*       - return list of reserves for a trade (getTradingReserves)
*       - stores fee accounted data for reserve types
*       - return details about a reserve (address / id, type, isFeeAccounted)
*       - finding the best rate (doMatch)
*
*       getTradingReserves() will parse hint to find if user wants specific reserves
*
*       doMatch() will return the index of the best reserve, having accounted for fees
*
*/
contract KyberMatchingEngine is KyberHintHandler, IKyberMatchingEngine, WithdrawableNoModifiers {
    uint            public negligibleRateDiffBps = 5; // 1 bps is 0.01%
    IKyberNetwork   public kyberNetwork;
    IKyberStorage   public kyberStorage;

    mapping(bytes32=>uint) internal reserveType;           //type from enum ReserveType

    uint internal feeAccountedPerType = 0xffffffff;

    constructor(address _admin) public
        WithdrawableNoModifiers(_admin)
    { /* empty body */ }

    function onlyNetwork() internal view {
        require(msg.sender == address(kyberNetwork), "only network");
    }

    function setNegligbleRateDiffBps(uint _negligibleRateDiffBps) external returns (bool) {
        onlyNetwork();
        require(_negligibleRateDiffBps <= BPS, "rateDiffBps exceed BPS"); // at most 100%
        negligibleRateDiffBps = _negligibleRateDiffBps;
        return true;
    }

    event KyberNetworkUpdated(IKyberNetwork newNetwork);
    function setNetworkContract(IKyberNetwork _kyberNetwork) external {
        onlyAdmin();
        require(_kyberNetwork != IKyberNetwork(0), "network 0");
        emit KyberNetworkUpdated(_kyberNetwork);
        kyberNetwork = _kyberNetwork;
    }

    event KyberStorageUpdated(IKyberStorage newStorage);
    function setKyberStorage(IKyberStorage _kyberStorage) external returns (bool) {
        onlyAdmin();
        emit KyberStorageUpdated(_kyberStorage);
        kyberStorage = _kyberStorage;
        return true;
    }

    function addReserve(bytes32 reserveId, ReserveType resType) external returns (bool) {
        onlyNetwork();
        require((resType != ReserveType.NONE) && (uint(resType) < uint(ReserveType.LAST)), "bad reserve type");
        require(feeAccountedPerType != 0xffffffff, "fee accounted data not set");

        reserveType[reserveId] = uint(resType);
        return true;
    }

    function removeReserve(bytes32 reserveId) external returns (bool) {
        onlyNetwork();
        reserveType[reserveId] = uint(ReserveType.NONE);
        return true;
    }

    function setFeeAccountedPerReserveType(bool fpr, bool apr, bool bridge, bool utility, bool custom, bool orderbook)
        external
    {
        onlyAdmin();
        uint feeAccountedData;

        if (apr) feeAccountedData |= 1 << uint(ReserveType.APR);
        if (fpr) feeAccountedData |= 1 << uint(ReserveType.FPR);
        if (bridge) feeAccountedData |= 1 << uint(ReserveType.BRIDGE);
        if (utility) feeAccountedData |= 1 << uint(ReserveType.UTILITY);
        if (custom) feeAccountedData |= 1 << uint(ReserveType.CUSTOM);
        if (orderbook) feeAccountedData |= 1 << uint(ReserveType.ORDERBOOK);

        feeAccountedPerType = feeAccountedData;
    }

    function getReserveDetailsByAddress(address reserve) external view
        returns(bytes32 reserveId, ReserveType resType, bool isFeeAccounted)
    {
        reserveId = kyberStorage.convertReserveAddresstoId(reserve);
        resType = ReserveType(reserveType[reserveId]);
        isFeeAccounted = (feeAccountedPerType & (1 << reserveType[reserveId])) > 0;
    }

    function getReserveDetailsById(bytes32 reserveId) external view
        returns(address reserveAddress, ReserveType resType, bool isFeeAccounted)
    {
        reserveAddress = kyberStorage.convertReserveIdToAddress(reserveId);
        resType = ReserveType(reserveType[reserveId]);
        isFeeAccounted = (feeAccountedPerType & (1 << reserveType[reserveId])) > 0;
    }

    /// @dev Returns trading reserves info for a trade
    /// @param src source token
    /// @param dest destination token
    /// @param isTokenToToken whether the trade is T2T
    /// @param hint user-specified reserves for this trade
    /// @return returns ids, split values, feeAccounted info and whether more processing is necessary
    /// @return reserveIds Array of reserve IDs for the trade, each being 32 bytes. 1st byte is reserve type
    /// @return splitValuesBps Array of split values (in basis points) for the trade.
    /// @return isFeeAccounted Boolean array of isFeeAccounted for each corresponding reserve ID
    /// @return processWithRate Enum ProcessWithRate, whether extra processing is required or not
    function getTradingReserves(IERC20 src, IERC20 dest, bool isTokenToToken, bytes calldata hint)
        external
        view
        returns (
            bytes32[] memory reserveIds,
            uint[] memory splitValuesBps,
            bool[] memory isFeeAccounted,
            ProcessWithRate processWithRate
        )
    {
        HintErrors error;
        if (hint.length == 0 || hint.length == 4) {
            reserveIds = (dest == ETH_TOKEN_ADDRESS) ?
                kyberStorage.getReservesPerTokenSrc(address(src)) :
                kyberStorage.getReservesPerTokenDest(address(dest));

            splitValuesBps = populateSplitValuesBps(reserveIds.length);
            isFeeAccounted = getIsFeeAccountedReserves(reserveIds);
            processWithRate = ProcessWithRate.Required;
            return (reserveIds, splitValuesBps, isFeeAccounted, processWithRate);
        }

        TradeType tradeType;

        if (isTokenToToken) {
            bytes memory unpackedHint;
            if (src == ETH_TOKEN_ADDRESS) {
                (, unpackedHint) = unpackT2THint(hint);
                (
                    tradeType,
                    reserveIds,
                    splitValuesBps,
                    error
                ) = parseHint(unpackedHint);
            }
            if (dest == ETH_TOKEN_ADDRESS) {
                (unpackedHint, ) = unpackT2THint(hint);
                (
                    tradeType,
                    reserveIds,
                    splitValuesBps,
                    error
                ) = parseHint(unpackedHint);
            }
        } else {
            (
                tradeType,
                reserveIds,
                splitValuesBps,
                error
            ) = parseHint(hint);
        }

        if (error != HintErrors.NoError) return (new bytes32[](0), new uint[](0), new bool[](0), ProcessWithRate.NotRequired);

        if (tradeType == TradeType.MaskIn) {
            splitValuesBps = populateSplitValuesBps(reserveIds.length);
        } else if (tradeType == TradeType.MaskOut) {
            // if mask out, apply masking out logic
            bytes32[] memory allReserves = (dest == ETH_TOKEN_ADDRESS) ?
                kyberStorage.getReservesPerTokenSrc(address(src)) :
                kyberStorage.getReservesPerTokenDest(address(dest));

            reserveIds = maskOutReserves(allReserves, reserveIds);
            splitValuesBps = populateSplitValuesBps(reserveIds.length);
        }

        isFeeAccounted = getIsFeeAccountedReserves(reserveIds);
        processWithRate = (tradeType == TradeType.Split) ? ProcessWithRate.NotRequired : ProcessWithRate.Required;
    }

    function getNegligibleRateDiffBps() external view returns(uint) {
        return negligibleRateDiffBps;
    }

    /// @notice Logic for masking out reserves
    /// @param allReservesPerToken arrary of reserveIds that support the t2e or e2t side of the trade
    /// @param maskedOutReserves array of reserveIds to be excluded from allReservesPerToken
    /// @return Returns an array of reserveIds that can be used for the trade
    function maskOutReserves(bytes32[] memory allReservesPerToken, bytes32[] memory maskedOutReserves)
        internal pure returns (bytes32[] memory filteredReserves)
    {
        require(allReservesPerToken.length >= maskedOutReserves.length, "mask out exceeds available reserves");
        filteredReserves = new bytes32[](allReservesPerToken.length - maskedOutReserves.length);
        uint currentResultIndex = 0;

        for (uint i = 0; i < allReservesPerToken.length; i++) {
            bytes32 reserveId = allReservesPerToken[i];
            bool notMaskedOut = true;

            for (uint j = 0; j < maskedOutReserves.length; j++) {
                bytes32 maskedOutReserveId = maskedOutReserves[j];
                if (reserveId == maskedOutReserveId) {
                    notMaskedOut = false;
                    break;
                }
            }

            if (notMaskedOut) filteredReserves[currentResultIndex++] = reserveId;
        }
    }

    struct BestReserveInfo {
        uint index;
        uint destAmount;
        uint numRelevantReserves;
    }

    /// @dev Returns the indexes of the best rate from the rates array for the t2e or e2t side
    /// @param src source token (not needed)
    /// @param dest destination token (not needed)
    /// @param srcAmounts array of srcAmounts for each rate provided
    /// @param feeAccountedBpsDest Fees charged in BPS, to be deducted from calculated destAmount
    /// @param rates rates provided by reserves
    /// @return Return an array of the indexes most suited for the trade
    function doMatch(
        IERC20 src,
        IERC20 dest,
        uint[] calldata srcAmounts,
        uint[] calldata feeAccountedBpsDest, // 0 for no fee, networkFeeBps when has fee
        uint[] calldata rates
    ) external view
    returns (
        uint[] memory reserveIndexes
        )
    {
        src;
        dest;
        reserveIndexes = new uint[](1);

        //use destAmounts for comparison, but return the best rate
        BestReserveInfo memory bestReserve;
        bestReserve.numRelevantReserves = 1; // assume always best reserve will be relevant

        //return empty array for unlisted tokens
        if (rates.length == 0) {
            reserveIndexes = new uint[](0);
            return reserveIndexes;
        }

        uint[] memory reserveCandidates = new uint[](rates.length);
        uint[] memory destAmounts = new uint[](rates.length);
        uint destAmount;

        for (uint i = 0; i < rates.length; i++) {
            destAmount = srcAmounts[i] * rates[i] * (BPS - feeAccountedBpsDest[i]) / BPS;
            if (destAmount > bestReserve.destAmount) {
                //best rate is highest rate
                bestReserve.destAmount = destAmount;
                bestReserve.index = i;
            }

            destAmounts[i] = destAmount;
        }

        if (bestReserve.destAmount == 0) {
            reserveIndexes[0] = bestReserve.index;
            return reserveIndexes;
        }

        reserveCandidates[0] = bestReserve.index;

        // if this reserve pays fee its actual rate is less. so smallestRelevantRate is smaller.
        bestReserve.destAmount = bestReserve.destAmount * BPS / (BPS + negligibleRateDiffBps);

        for (uint i = 0; i < rates.length; i++) {
            if (i == bestReserve.index) continue;
            if (destAmounts[i] > bestReserve.destAmount) {
                reserveCandidates[bestReserve.numRelevantReserves++] = i;
            }
        }

        if (bestReserve.numRelevantReserves > 1) {
            //when encountering small rate diff from bestRate. draw from relevant reserves
            bestReserve.index = reserveCandidates[uint(blockhash(block.number-1)) % bestReserve.numRelevantReserves];
        } else {
            bestReserve.index = reserveCandidates[0];
        }

        reserveIndexes[0] = bestReserve.index;
    }

    function populateSplitValuesBps(uint length) internal pure returns (uint[] memory splitValuesBps) {
        splitValuesBps = new uint[](length);
        for (uint i = 0; i < length; i++) {
            splitValuesBps[i] = BPS;
        }
    }

    function getIsFeeAccountedReserves(bytes32[] memory reserveIds) internal view
        returns(bool[] memory feeAccountedArr)
    {
        feeAccountedArr = new bool[](reserveIds.length);

        uint feeAccountedData = feeAccountedPerType;

        for (uint i = 0; i < reserveIds.length; i++) {
            feeAccountedArr[i] = (feeAccountedData & 1 << reserveType[reserveIds[i]] > 0);
        }
    }

    function convertReserveIdToAddress(bytes32 reserveId) internal view returns (address) {
        return kyberStorage.convertReserveIdToAddress(reserveId);
    }

    function convertAddressToReserveId(address reserveAddress) internal view returns (bytes32) {
        return kyberStorage.convertReserveAddresstoId(reserveAddress);
    }
}
