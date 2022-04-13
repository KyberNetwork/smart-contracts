pragma solidity 0.6.6;

import "./utils/WithdrawableNoModifiers.sol";
import "./INimbleMatchingEngine.sol";
import "./INimbleNetwork.sol";
import "./NimbleHintHandler.sol";
import "./INimbleStorage.sol";


/**
 *   @title NimbleMatchingEngine contract
 *   During getExpectedRate flow and trade flow this contract is called for:
 *       - parsing hint and returning reserve list (function getTradingReserves)
 *       - matching best reserves to trade with (function doMatch)
 */
contract NimbleMatchingEngine is NimbleHintHandler, INimbleMatchingEngine, WithdrawableNoModifiers {
    struct BestReserveInfo {
        uint256 index;
        uint256 destAmount;
        uint256 numRelevantReserves;
    }
    INimbleNetwork public NimbleNetwork;
    INimbleStorage public NimbleStorage;

    uint256 negligibleRateDiffBps = 5; // 1 bps is 0.01%

    event NimbleStorageUpdated(INimbleStorage newNimbleStorage);
    event NimbleNetworkUpdated(INimbleNetwork newNimbleNetwork);

    constructor(address _admin) public WithdrawableNoModifiers(_admin) {
        /* empty body */
    }

    function setNimbleStorage(INimbleStorage _NimbleStorage) external virtual override {
        onlyAdmin();
        emit NimbleStorageUpdated(_NimbleStorage);
        NimbleStorage = _NimbleStorage;
    }

    function setNegligibleRateDiffBps(uint256 _negligibleRateDiffBps)
        external
        virtual
        override
    {
        onlyNetwork();
        require(_negligibleRateDiffBps <= BPS, "rateDiffBps exceed BPS"); // at most 100%
        negligibleRateDiffBps = _negligibleRateDiffBps;
    }

    function setNetworkContract(INimbleNetwork _NimbleNetwork) external {
        onlyAdmin();
        require(_NimbleNetwork != INimbleNetwork(0), "NimbleNetwork 0");
        emit NimbleNetworkUpdated(_NimbleNetwork);
        NimbleNetwork = _NimbleNetwork;
    }

    /// @dev Returns trading reserves info for a trade
    /// @param src Source token
    /// @param dest Destination token
    /// @param isTokenToToken Whether the trade is token -> token
    /// @param hint Advanced instructions for running the trade
    /// @return reserveIds Array of reserve IDs for the trade, each being 32 bytes
    /// @return splitValuesBps Array of split values (in basis points) for the trade
    /// @return processWithRate Enum ProcessWithRate, whether extra processing is required or not
    function getTradingReserves(
        IERC20 src,
        IERC20 dest,
        bool isTokenToToken,
        bytes calldata hint
    )
        external
        view
        override
        returns (
            bytes32[] memory reserveIds,
            uint256[] memory splitValuesBps,
            ProcessWithRate processWithRate
        )
    {
        HintErrors error;
        if (hint.length == 0 || hint.length == 4) {
            reserveIds = (dest == ETH_TOKEN_ADDRESS)
                ? NimbleStorage.getReserveIdsPerTokenSrc(src)
                : NimbleStorage.getReserveIdsPerTokenDest(dest);

            splitValuesBps = populateSplitValuesBps(reserveIds.length);
            processWithRate = ProcessWithRate.Required;
            return (reserveIds, splitValuesBps, processWithRate);
        }

        TradeType tradeType;

        if (isTokenToToken) {
            bytes memory unpackedHint;
            if (src == ETH_TOKEN_ADDRESS) {
                (, unpackedHint) = unpackT2THint(hint);
                (tradeType, reserveIds, splitValuesBps, error) = parseHint(unpackedHint);
            }
            if (dest == ETH_TOKEN_ADDRESS) {
                (unpackedHint, ) = unpackT2THint(hint);
                (tradeType, reserveIds, splitValuesBps, error) = parseHint(unpackedHint);
            }
        } else {
            (tradeType, reserveIds, splitValuesBps, error) = parseHint(hint);
        }

        if (error != HintErrors.NoError)
            return (new bytes32[](0), new uint256[](0), ProcessWithRate.NotRequired);

        if (tradeType == TradeType.MaskIn) {
            splitValuesBps = populateSplitValuesBps(reserveIds.length);
        } else if (tradeType == TradeType.BestOfAll || tradeType == TradeType.MaskOut) {
            bytes32[] memory allReserves = (dest == ETH_TOKEN_ADDRESS)
                ? NimbleStorage.getReserveIdsPerTokenSrc(src)
                : NimbleStorage.getReserveIdsPerTokenDest(dest);

            // if bestOfAll, reserveIds = allReserves
            // if mask out, apply masking out logic
            reserveIds = (tradeType == TradeType.BestOfAll) ?
                allReserves :
                maskOutReserves(allReserves, reserveIds);
            splitValuesBps = populateSplitValuesBps(reserveIds.length);
        }

        // for split no need to search for best rate. User defines full trade details in advance.
        processWithRate = (tradeType == TradeType.Split)
            ? ProcessWithRate.NotRequired
            : ProcessWithRate.Required;
    }

    function getNegligibleRateDiffBps() external view override returns (uint256) {
        return negligibleRateDiffBps;
    }

    /// @dev Returns the indexes of the best rate from the rates array
    ///     for token -> eth or eth -> token side of trade
    /// @param src Source token (not needed in this NimbleMatchingEngine version)
    /// @param dest Destination token (not needed in this NimbleMatchingEngine version)
    /// @param srcAmounts Array of srcAmounts after deducting fees.
    /// @param feesAccountedDestBps Fees charged in BPS, to be deducted from calculated destAmount
    /// @param rates Rates queried from reserves
    /// @return reserveIndexes An array of the indexes most suited for the trade
    function doMatch(
        IERC20 src,
        IERC20 dest,
        uint256[] calldata srcAmounts,
        uint256[] calldata feesAccountedDestBps, // 0 for no fee, networkFeeBps when has fee
        uint256[] calldata rates
    ) external view override returns (uint256[] memory reserveIndexes) {
        src;
        dest;
        reserveIndexes = new uint256[](1);

        // use destAmounts for comparison, but return the best rate
        BestReserveInfo memory bestReserve;
        bestReserve.numRelevantReserves = 1; // assume always best reserve will be relevant

        // return empty array for unlisted tokens
        if (rates.length == 0) {
            reserveIndexes = new uint256[](0);
            return reserveIndexes;
        }

        uint256[] memory reserveCandidates = new uint256[](rates.length);
        uint256[] memory destAmounts = new uint256[](rates.length);
        uint256 destAmount;

        for (uint256 i = 0; i < rates.length; i++) {
            // if fee is accounted on dest amount of this reserve, should deduct it
            destAmount = (srcAmounts[i] * rates[i] * (BPS - feesAccountedDestBps[i])) / BPS;
            if (destAmount > bestReserve.destAmount) {
                // best rate is highest rate
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

        // update best reserve destAmount to be its destAmount after deducting negligible diff.
        // if any reserve has better or equal dest amount it can be considred to be chosen as best
        bestReserve.destAmount = (bestReserve.destAmount * BPS) / (BPS + negligibleRateDiffBps);

        for (uint256 i = 0; i < rates.length; i++) {
            if (i == bestReserve.index) continue;
            if (destAmounts[i] > bestReserve.destAmount) {
                reserveCandidates[bestReserve.numRelevantReserves++] = i;
            }
        }

        if (bestReserve.numRelevantReserves > 1) {
            // when encountering small rate diff from bestRate. draw from relevant reserves
            bestReserve.index = reserveCandidates[uint256(blockhash(block.number - 1)) %
                bestReserve.numRelevantReserves];
        } else {
            bestReserve.index = reserveCandidates[0];
        }

        reserveIndexes[0] = bestReserve.index;
    }

    function getReserveAddress(bytes32 reserveId) internal view override returns (address reserveAddress) {
        (reserveAddress, , , ,) = NimbleStorage.getReserveDetailsById(reserveId);
    }

    function areAllReservesListed(
        bytes32[] memory reserveIds,
        IERC20 src,
        IERC20 dest
    ) internal override view returns (bool allReservesListed) {
        (allReservesListed, , ,) = NimbleStorage.getReservesData(reserveIds, src, dest);
    }

    /// @notice Logic for masking out reserves
    /// @param allReservesPerToken Array of reserveIds that support
    ///     the token -> eth or eth -> token side of the trade
    /// @param maskedOutReserves Array of reserveIds to be excluded from allReservesPerToken
    /// @return filteredReserves An array of reserveIds that can be used for the trade
    function maskOutReserves(
        bytes32[] memory allReservesPerToken,
        bytes32[] memory maskedOutReserves
    ) internal pure returns (bytes32[] memory filteredReserves) {
        require(
            allReservesPerToken.length >= maskedOutReserves.length,
            "mask out exceeds available reserves"
        );
        filteredReserves = new bytes32[](allReservesPerToken.length - maskedOutReserves.length);
        uint256 currentResultIndex = 0;

        for (uint256 i = 0; i < allReservesPerToken.length; i++) {
            bytes32 reserveId = allReservesPerToken[i];
            bool notMaskedOut = true;

            for (uint256 j = 0; j < maskedOutReserves.length; j++) {
                bytes32 maskedOutReserveId = maskedOutReserves[j];
                if (reserveId == maskedOutReserveId) {
                    notMaskedOut = false;
                    break;
                }
            }

            if (notMaskedOut) filteredReserves[currentResultIndex++] = reserveId;
        }
    }

    function onlyNetwork() internal view {
        require(msg.sender == address(NimbleNetwork), "only NimbleNetwork");
    }

    function populateSplitValuesBps(uint256 length)
        internal
        pure
        returns (uint256[] memory splitValuesBps)
    {
        splitValuesBps = new uint256[](length);
        for (uint256 i = 0; i < length; i++) {
            splitValuesBps[i] = BPS;
        }
    }
}
