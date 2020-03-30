pragma  solidity 0.5.11;

import "./utils/Withdrawable2.sol";
import "./IKyberMatchingEngine.sol";
import "./IKyberNetwork.sol";
import "./KyberHintHandler.sol";


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
contract KyberMatchingEngine is KyberHintHandler, IKyberMatchingEngine, Withdrawable2 {
    uint            public negligibleRateDiffBps = 5; // 1 bps is 0.01%
    IKyberNetwork   public networkContract;

    // mapping reserve ID to address, keeps an array of all previous reserve addresses with this ID
    mapping(bytes8=>address[])          public reserveIdToAddresses;
    mapping(address=>bytes8)            internal reserveAddressToId;
    mapping(bytes8=>uint)               internal reserveType;           //type from enum ReserveType
    mapping(address=>bytes8[])   internal reservesPerTokenSrc;   // reserves supporting token to eth
    mapping(address=>bytes8[])   internal reservesPerTokenDest;  // reserves support eth to token

    uint internal feePayingPerType = 0xffffffff;

    constructor(address _admin) public
        Withdrawable2(_admin)
    { /* empty body */ }

    modifier onlyNetwork() {
        require(msg.sender == address(networkContract), "Only network");
        _;
    }

    function setNegligbleRateDiffBps(uint _negligibleRateDiffBps) external onlyNetwork returns (bool) {
        require(_negligibleRateDiffBps <= BPS, "rateDiffBps > BPS"); // at most 100%
        negligibleRateDiffBps = _negligibleRateDiffBps;
        return true;
    }

    event NetworkContractUpdate(IKyberNetwork newNetwork);
    function setNetworkContract(IKyberNetwork _networkContract) external onlyAdmin {
        require(_networkContract != IKyberNetwork(0), "network 0");
        emit NetworkContractUpdate(_networkContract);
        networkContract = _networkContract;
    }

    function addReserve(address reserve, bytes8 reserveId, ReserveType resType) external
        onlyNetwork returns (bool)
    {
        require((resType != ReserveType.NONE) && (uint(resType) < uint(ReserveType.LAST)), "bad type");
        require(feePayingPerType != 0xffffffff, "Fee paying not set");

        reserveType[reserveId] = uint(resType);
        return true;
    }

    function setFeePayingPerReserveType(bool fpr, bool apr, bool bridge, bool utility, bool custom, bool orderbook)
        external onlyAdmin
    {
        uint feePayingData;

        if (apr) feePayingData |= 1 << uint(ReserveType.APR);
        if (fpr) feePayingData |= 1 << uint(ReserveType.FPR);
        if (bridge) feePayingData |= 1 << uint(ReserveType.BRIDGE);
        if (utility) feePayingData |= 1 << uint(ReserveType.UTILITY);
        if (custom) feePayingData |= 1 << uint(ReserveType.CUSTOM);
        if (orderbook) feePayingData |= 1 << uint(ReserveType.ORDERBOOK);

        feePayingPerType = feePayingData;
    }

    function getReserveDetails(address reserve) external view
        returns(bytes8 reserveId, ReserveType resType, bool isFeePaying)
    {
        reserveId = reserveAddressToId[reserve];
        resType = ReserveType(reserveType[reserveId]);
        isFeePaying = (feePayingPerType & (1 << reserveType[reserveId])) > 0;
    }

    function getReservesPerTokenSrc(IERC20 token) external view returns(bytes8[] memory reserves) {
        reserves = reservesPerTokenSrc[address(token)];
    }

    function getReservesPerTokenDest(IERC20 token) external view returns(bytes8[] memory reserves) {
        reserves = reservesPerTokenDest[address(token)];
    }

    function listPairs(IKyberReserve reserve, IERC20 token, bool isTokenToEth, bool add) internal {
        uint i;
        bytes8 reserveId = convertAddressToReserveId(address(reserve));
        IKyberReserve[] storage reserveArr = reservesPerTokenDest[address(token)];

        if (isTokenToEth) {
            reserveArr = reservesPerTokenSrc[address(token)];
        }

        for (i = 0; i < reserveArr.length; i++) {
            if (reserveId == reserveArr[i]) {
                if (add) {
                    break; //already added
                } else {
                    //remove
                    reserveArr[i] = reserveArr[reserveArr.length - 1];
                    reserveArr.length--;
                    break;
                }
            }
        }

        if (add && i == reserveArr.length) {
            //if reserve wasn't found add it
            reserveArr.push(reserveId);
        }
    }

    function getReserveList(IERC20 src, IERC20 dest, bool isTokenToToken, bytes calldata hint)
        external
        view
        returns (
            bytes8[] memory reserveIds,
            uint[] memory splitValuesBps,
            bool[] memory isFeeAccounted,
            ExtraProcessing extraProcess
        )
    {
        HintErrors error;
        if (hint.length == 0 || hint.length == 4) {
            reserveIds = (dest == ETH_TOKEN_ADDRESS) ? reservesPerTokenSrc[address(src)] : reservesPerTokenDest[address(dest)];
            splitValuesBps = populateSplitValuesBps(reserveIds.length);
            isFeeAccounted = getIsFeeAccountingReserves(reserveIds);
            extraProcess = ExtraProcessing.NotRequired;
            return;
        }

        TradeType tradeType;
        bytes memory unpackedHint;

        unpackedHint = (isTokenToToken) ? unpackT2THint(hint) : hint;
        (
            tradeType,
            reserveIds,
            splitValuesBps,
            error
        ) = parseHint(unpackedHint);
        if (error != HintErrors.NoError) return ([], [], [], ExtraProcessing.NotRequired);

        // if mask out, apply masking out logic
        if (tradeType == TradeType.MaskOut) {
            bytes8[] memory allReserves = (dest == ETH_TOKEN_ADDRESS) ? reservesPerTokenSrc[address(src)] : reservesPerTokenDest[address(dest)];
            reserveIds = maskOutReserves(allReserves, reserveIds);
            splitValuesBps = populateSplitValuesBps(reserveIds.length);
        }

        isFeeAccounted = getIsFeeAccountingReserves(reserveIds);
        extraProcess = (tradeType == TradeType.Split) ? ExtraProcessing.NotRequired : ExtraProcessing.NonSplitProcessing;
    }

    /// @notice Logic for masking out reserves
    /// @param allReservesPerToken arrary of reserveIds that support the t2e or e2t side of the trade
    /// @param maskedOutReserves array of reserveIds to be excluded from allReservesPerToken
    /// @return Returns an array of reserveIds that can be used for the trade
    function maskOutReserves(bytes8[] memory allReservesPerToken, bytes8[] memory maskedOutReserves)
        internal pure returns (bytes8[] memory filteredReserves)
    {
        require(allReservesPerToken.length >= maskedOutReserves.length, "MASK_OUT_TOO_LONG");
        filteredReserves = new bytes8[](allReservesPerToken.length - maskedOutReserves.length);
        uint currentResultIndex = 0;

        for (uint i = 0; i < allReservesPerToken.length; i++) {
            bytes8 reserveId = allReservesPerToken[i];
            bool notMaskedOut = true;

            for (uint j = 0; j < maskedOutReserves.length; j++) {
                bytes8 maskedOutReserveId = maskedOutReserves[j];
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
    function doMatchTokenToEth(
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

        //use destAmounts for comparison, but return the best rate
        BestReserveInfo memory bestReserve;
        bestReserve.numRelevantReserves = 1; // assume always best reserve will be relevant

        //return zero rate for empty reserve array (unlisted token)?
        if (rates.length == 0) return ([0]);

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

        if (bestReserve.destAmount == 0) return (bestReserve.index);

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

        return ([bestReserve.index]);
    }

    /// @dev Returns the index of the best rate from the rates array for E2T side
    /// @param src source token (not needed)
    /// @param dest destination token not needed)
    /// @param srcAmounts array of srcAmounts (after fees) for each rate provided
    /// @param rates rates provided by reserves
    function doMatchEthToToken(
        IERC20 src,
        IERC20 dest,
        uint[] calldata srcAmounts,
        uint[] calldata rates
    ) external view
    returns (
        uint[] memory reserveIndexes
        )
    {
        src;
        dest;

        //use destAmounts for comparison, but return the best rate
        BestReserveInfo memory bestReserve;
        bestReserve.numRelevantReserves = 1; // assume always best reserve will be relevant

        //return zero rate for empty reserve array (unlisted token)?
        if (rates.length == 0) return ([0]);

        uint[] memory reserveCandidates = new uint[](rates.length);
        uint[] memory destAmounts = new uint[](rates.length);
        uint destAmount;

        for (uint i = 0; i < rates.length; i++) {
            destAmount = srcAmounts[i] * rates[i];
            if (destAmount > bestReserve.destAmount) {
                //best rate is highest rate
                bestReserve.destAmount = destAmount;
                bestReserve.index = i;
            }

            destAmounts[i] = destAmount;
        }

        if (bestReserve.destAmount == 0) return (bestReserve.index);

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

        return ([bestReserve.index]);
    }

    function populateSplitValuesBps(uint length) internal pure returns (uint[] splitValuesBps) {
        splitValuesBps = new uint[](length);
        for (let uint i = 0; i < length; i++) {
            splitValuesBps[i] = BPS;
        }
    };

    function getIsFeeAccountingReserves(bytes8[] memory reserveIds) internal view
        returns(bool[] memory feePayingArr)
    {
        feePayingArr = new bool[](reserveIds.length);

        uint feePayingData = feePayingPerType;

        for (uint i = 0; i < reserveIds.length; i++) {
            feePayingArr[i] = (feePayingData & 1 << reserveType[address(reserveIds[i])] > 0);
        }
    }

    function convertReserveIdToAddress(bytes8 reserveId)
        internal
        view
        returns (address)
    {
        return reserveIdToAddresses[reserveId][0];
    }

    function convertAddressToReserveId(address reserveAddress)
        internal
        view
        returns (bytes8)
    {
        return reserveAddressToId[reserveAddress];
    }
}
