pragma solidity 0.5.11;

import "./utils/WithdrawableNoModifiers.sol";
import "./IKyberMatchingEngine.sol";
import "./IKyberNetwork.sol";
import "./KyberHintHandler.sol";
import "./IKyberStorage.sol";


/**
 *   @title Kyber matching engine contract
 *   During getExpectedRate flow and trade flow this contract is called twice for:
 *       - parsing hint and returning reserve list (function getTradingReserves)
 *       - matching best reserves to trade with (function doMatch)
 */
contract KyberMatchingEngine is KyberHintHandler, IKyberMatchingEngine, WithdrawableNoModifiers {
    struct BestReserveInfo {
        uint256 index;
        uint256 destAmount;
        uint256 numRelevantReserves;
    }
    IKyberNetwork public kyberNetwork;
    IKyberStorage public kyberStorage;

    uint256 public negligibleRateDiffBps = 5; // 1 bps is 0.01%

    event KyberStorageUpdated(IKyberStorage newStorage);
    event KyberNetworkUpdated(IKyberNetwork newNetwork);

    constructor(address _admin) public WithdrawableNoModifiers(_admin) {
        /* empty body */
    }

    function setKyberStorage(IKyberStorage _kyberStorage) external returns (bool) {
        onlyAdmin();
        emit KyberStorageUpdated(_kyberStorage);
        kyberStorage = _kyberStorage;
        return true;
    }

    function setNegligbleRateDiffBps(uint256 _negligibleRateDiffBps) external returns (bool) {
        onlyNetwork();
        require(_negligibleRateDiffBps <= BPS, "rateDiffBps exceed BPS"); // at most 100%
        negligibleRateDiffBps = _negligibleRateDiffBps;
        return true;
    }

    function setNetworkContract(IKyberNetwork _kyberNetwork) external {
        onlyAdmin();
        require(_kyberNetwork != IKyberNetwork(0), "network 0");
        emit KyberNetworkUpdated(_kyberNetwork);
        kyberNetwork = _kyberNetwork;
    }

    /// @dev Returns trading reserves info for a trade
    /// @param src Source token
    /// @param dest Destination token
    /// @param isTokenToToken Whether the trade is T2T
    /// @param hint Defines which reserves should be used for the trade
    /// @return Returns ids, split values and whether more processing is necessary
    /// @return reserveIds Array of reserve IDs for the trade, each being 32 bytes. 1st byte is reserve type
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
        returns (
            bytes32[] memory reserveIds,
            uint256[] memory splitValuesBps,
            ProcessWithRate processWithRate
        )
    {
        HintErrors error;
        if (hint.length == 0 || hint.length == 4) {
            reserveIds = (dest == ETH_TOKEN_ADDRESS)
                ? kyberStorage.getReservesPerTokenSrc(address(src))
                : kyberStorage.getReservesPerTokenDest(address(dest));

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
        } else if (tradeType == TradeType.MaskOut) {
            // if mask out, apply masking out logic
            bytes32[] memory allReserves = (dest == ETH_TOKEN_ADDRESS)
                ? kyberStorage.getReservesPerTokenSrc(address(src))
                : kyberStorage.getReservesPerTokenDest(address(dest));

            reserveIds = maskOutReserves(allReserves, reserveIds);
            splitValuesBps = populateSplitValuesBps(reserveIds.length);
        }

        processWithRate = (tradeType == TradeType.Split)
            ? ProcessWithRate.NotRequired
            : ProcessWithRate.Required;
    }

    function getNegligibleRateDiffBps() external view returns (uint256) {
        return negligibleRateDiffBps;
    }

    /// @dev Returns the indexes of the best rate from the rates array for the t2e or e2t side
    /// @param src Source token (not needed in this matchingEngine version)
    /// @param dest Destination token (not needed in this matchingEngine version)
    /// @param srcAmounts Array of srcAmounts
    /// @param feesAccountedDestBps Fees charged in BPS, to be deducted from calculated destAmount
    /// @param rates Rates provided by reserves
    /// @return Return an array of the indexes most suited for the trade
    function doMatch(
        IERC20 src,
        IERC20 dest,
        uint256[] calldata srcAmounts,
        uint256[] calldata feesAccountedDestBps, // 0 for no fee, networkFeeBps when has fee
        uint256[] calldata rates
    ) external view returns (uint256[] memory reserveIndexes) {
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

        // if this reserve pays fee its actual rate is less. so smallestRelevantRate is smaller.
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

    function convertReserveIdToAddress(bytes32 reserveId) internal view returns (address) {
        return kyberStorage.convertReserveIdToAddress(reserveId);
    }

    function convertAddressToReserveId(address reserveAddress) internal view returns (bytes32) {
        return kyberStorage.convertReserveAddresstoId(reserveAddress);
    }

    /// @notice Logic for masking out reserves
    /// @param allReservesPerToken Array of reserveIds that support the t2e or e2t side of the trade
    /// @param maskedOutReserves Array of reserveIds to be excluded from allReservesPerToken
    /// @return Returns an array of reserveIds that can be used for the trade
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
        require(msg.sender == address(kyberNetwork), "only network");
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
