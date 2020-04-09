pragma  solidity 0.5.11;

import "./utils/WithdrawableNoModifiers.sol";
import "./IKyberMatchingEngine.sol";
import "./IKyberNetwork.sol";
import "./KyberHintHandler.sol";
import "./IKyberStorage.sol";


/*
*   @title Kyber matching engine contract
*   Receives call from KyberNetwork for:
*       - adding reserves
*       - listing tokens
*       - get rate
*
*       For get Rate calls matching engine will:
*           - parse hint to find if user wants specific reserves
*           - search best reserve rate if required
*           - calclutate trade amounts
*           - return all data to kyber Network 
*/
contract KyberMatchingEngine is KyberHintHandler, IKyberMatchingEngine, WithdrawableNoModifiers {
    uint            public negligibleRateDiffBps = 5; // 1 bps is 0.01%
    IKyberNetwork   public kyberNetwork;
    IKyberStorage   public kyberStorage;

    mapping(bytes32=>uint) internal reserveType;           //type from enum ReserveType

    uint internal feePayingPerType = 0xffffffff;

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
        onlyNetwork();
        emit KyberStorageUpdated(_kyberStorage);
        kyberStorage = _kyberStorage;
        return true;
    }

    function addReserve(bytes32 reserveId, ReserveType resType) external returns (bool) {
        onlyNetwork();
        require((resType != ReserveType.NONE) && (uint(resType) < uint(ReserveType.LAST)), "bad reserve type");
        require(feePayingPerType != 0xffffffff, "fee paying data not set");

        reserveType[reserveId] = uint(resType);
        return true;
    }

    function removeReserve(bytes32 reserveId) external returns (bool) {
        onlyNetwork();
        reserveType[reserveId] = uint(ReserveType.NONE);
        return true;
    }

    function setFeePayingPerReserveType(bool fpr, bool apr, bool bridge, bool utility, bool custom, bool orderbook)
        external
    {
        onlyAdmin();
        uint feePayingData;

        if (apr) feePayingData |= 1 << uint(ReserveType.APR);
        if (fpr) feePayingData |= 1 << uint(ReserveType.FPR);
        if (bridge) feePayingData |= 1 << uint(ReserveType.BRIDGE);
        if (utility) feePayingData |= 1 << uint(ReserveType.UTILITY);
        if (custom) feePayingData |= 1 << uint(ReserveType.CUSTOM);
        if (orderbook) feePayingData |= 1 << uint(ReserveType.ORDERBOOK);

        feePayingPerType = feePayingData;
    }

    function getReserveDetailsByAddress(address reserve) external view
        returns(bytes32 reserveId, ReserveType resType, bool isFeePaying)
    {
        reserveId = kyberStorage.convertReserveAddresstoId(reserve);
        resType = ReserveType(reserveType[reserveId]);
        isFeePaying = (feePayingPerType & (1 << reserveType[reserveId])) > 0;
    }

    function getReserveDetailsById(bytes32 reserveId) external view
        returns(address reserveAddress, ReserveType resType, bool isFeePaying)
    {
        reserveAddress = kyberStorage.convertReserveIdToAddress(reserveId);
        resType = ReserveType(reserveType[reserveId]);
        isFeePaying = (feePayingPerType & (1 << reserveType[reserveId])) > 0;
    }

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
            isFeeAccounted = getIsFeeAccountingReserves(reserveIds);
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

        isFeeAccounted = getIsFeeAccountingReserves(reserveIds);
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

    /// @dev Returns the index of the best rate from the rates array for T2E side
    /// @param src source token (not needed)
    /// @param dest destination token not needed)
    /// @param srcAmounts array of srcAmounts for each rate provided
    /// @param feeAccountedBps Fees charged in BPS, to be deducted from calculated destAmount
    /// @param rates rates provided by reserves
    function doMatch(
        IERC20 src,
        IERC20 dest,
        uint[] calldata srcAmounts,
        uint[] calldata feeAccountedBps, // 0 for no fee. networkFeeBps when has fee
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
            destAmount = srcAmounts[i] * rates[i] * (BPS - feeAccountedBps[i]) / BPS;
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

    function getIsFeeAccountingReserves(bytes32[] memory reserveIds) internal view
        returns(bool[] memory feePayingArr)
    {
        feePayingArr = new bool[](reserveIds.length);

        uint feePayingData = feePayingPerType;

        for (uint i = 0; i < reserveIds.length; i++) {
            feePayingArr[i] = (feePayingData & 1 << reserveType[reserveIds[i]] > 0);
        }
    }

    function convertReserveIdToAddress(bytes32 reserveId) internal view returns (address) {
        return kyberStorage.convertReserveIdToAddress(reserveId);
    }

    function convertAddressToReserveId(address reserveAddress) internal view returns (bytes32) {
        return kyberStorage.convertReserveAddresstoId(reserveAddress);
    }
}
