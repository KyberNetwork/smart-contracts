pragma  solidity 0.5.11;

import "./utils/Utils4.sol";
import "./IKyberNetworkRateHelper.sol";
import "./IKyberNetwork.sol";
import "./IKyberMatchingEngine.sol";


contract KyberNetworkRateHelper is IKyberNetworkRateHelper, Utils4 {
    IKyberMatchingEngine public matchingEngine;
    address public kyberNetwork;
    // mapping reserve ID to address, keeps an array of all previous reserve addresses with this ID
    mapping(bytes8=>address[]) public reserveIdToAddresses;

    constructor(address _kyberNetwork) public {
        require(_kyberNetwork != address(0), "network is 0");
        kyberNetwork = _kyberNetwork;
    }

    modifier onlyKyberNetwork() {
        require(msg.sender == kyberNetwork, "only kyber network");
        _;
    }

    event MatchingEngineUpdate(IKyberMatchingEngine newMatchingEngine);
    function setMatchingEngineContract(IKyberMatchingEngine _newMatchingEngine) external onlyKyberNetwork {
        require(_newMatchingEngine != IKyberMatchingEngine(0), "matching engine is 0");
        emit MatchingEngineUpdate(_newMatchingEngine);
        matchingEngine = _newMatchingEngine;
    }

    /// @notice Stores work data for reserves (either for token -> ETH, or ETH -> token)
    /// @dev Variables are in-place, ie. reserve with addresses[i] has id of ids[i], offers rate of rates[i], etc.
    /// @param addresses List of reserve addresses selected for the trade
    /// @param ids List of reserve ids, to be used for KyberTrade event
    /// @param rates List of rates that were offered by the reserves
    /// @param isFeePaying List of reserves requiring users to pay network fee, or not
    /// @param splitValuesBps List of proportions of trade amount allocated to the reserves
    ///     If there is only 1 reserve, then it should have a value of 10000 bps
    /// @param decimals Token decimals. Src decimals when for src -> ETH, dest decimals when ETH -> dest
    struct TradingReserves {
        IKyberReserve[] addresses;
        bytes8[] ids;
        uint[] rates;
        bool[] isFeePaying;
        uint[] splitValuesBps;
        uint decimals;
    }

    function addReserve(address reserve, bytes8 reserveId) external onlyKyberNetwork returns (bool) {
        if (reserveIdToAddresses[reserveId].length == 0) {
            reserveIdToAddresses[reserveId].push(reserve);
        } else {
            require(reserveIdToAddresses[reserveId][0] == address(0), "reserveId taken");
            reserveIdToAddresses[reserveId][0] = reserve;
        }
        return true;
    }

    function removeReserve(address reserve, bytes8 reserveId) external onlyKyberNetwork returns (bool) {
        require(reserveIdToAddresses[reserveId][0] == reserve, "reserve and id mismatch");

        reserveIdToAddresses[reserveId].push(reserveIdToAddresses[reserveId][0]);
        reserveIdToAddresses[reserveId][0] = address(0);

        return true;
    }

    /// @notice calculate trade data and store them into tData
    function calculateTradeData(
        IERC20 token,
        uint srcAmount,
        uint tokenDecimals,
        bool isTokenToEth,
        bool isTokenToToken,
        uint networkFeeValue,
        bytes memory hint
    )
        public view
        returns (
            IKyberReserve[] memory reserveAddresses,
            uint[] memory rates,
            uint[] memory splitValuesBps,
            bool[] memory isFeeCounted,
            bytes8[] memory ids
        )
    {
        require(token != ETH_TOKEN_ADDRESS, "should not call eth-eth");

        TradingReserves memory tradingReserves;
        tradingReserves.decimals = tokenDecimals;

        retrieveDataFromMatchingEngine(
            tradingReserves,
            token,
            srcAmount,
            isTokenToEth,
            isTokenToToken,
            networkFeeValue,
            hint
        );

        if (verifyReserveIDsAndSplitValues(tradingReserves)) {
            ids = tradingReserves.ids;
            reserveAddresses = tradingReserves.addresses;
            splitValuesBps = tradingReserves.splitValuesBps;
            isFeeCounted = tradingReserves.isFeePaying;
            rates = tradingReserves.rates;
        }
    }

    function retrieveDataFromMatchingEngine(
        TradingReserves memory tradingReserves,
        IERC20 token,
        uint srcAmount,
        bool isTokenToEth,
        bool isTokenToToken,
        uint networkFeeValue, // bps in case t2e, wei value in case e2t
        bytes memory hint
    )
        internal view
    {
        IKyberMatchingEngine.ExtraProcessing extraProcess;
        (tradingReserves.ids, tradingReserves.splitValuesBps, tradingReserves.isFeePaying, extraProcess) = matchingEngine.getReserveList(
            isTokenToEth ? token : ETH_TOKEN_ADDRESS,
            isTokenToEth ? ETH_TOKEN_ADDRESS : token,
            isTokenToToken,
            hint
        );

        require(tradingReserves.ids.length == tradingReserves.splitValuesBps.length, "ids and split length mismatch");
        require(tradingReserves.ids.length == tradingReserves.isFeePaying.length, "ids and feePaying mismatch");

        if (extraProcess != IKyberMatchingEngine.ExtraProcessing.NotRequired) {
            // require extra processing, get rates and do extra processing
            getTradeDataExtraProcessing(
                tradingReserves,
                token,
                srcAmount,
                isTokenToEth,
                networkFeeValue,
                tradingReserves.ids,
                tradingReserves.splitValuesBps,
                tradingReserves.isFeePaying
            );
        } else {
            getTradeDataForSplittingTrade(
                tradingReserves,
                token,
                srcAmount,
                isTokenToEth,
                networkFeeValue
            );
        }
    }

    function getTradeDataForSplittingTrade(
        TradingReserves memory tradingReserves,
        IERC20 token,
        uint srcAmount,
        bool isTokenToEth,
        uint networkFeeValue
    )
        internal view
    {
        // splitting trade, get rates
        tradingReserves.rates = new uint[](tradingReserves.ids.length);
        tradingReserves.addresses = new IKyberReserve[](tradingReserves.ids.length);

        uint actualSrcAmount = srcAmount;

        if (!isTokenToEth) {
            // need to deduce network fee for e2t
            for (uint i = 0; i < tradingReserves.splitValuesBps.length; i++) {
                if (tradingReserves.isFeePaying[i]) {
                    actualSrcAmount -= tradingReserves.splitValuesBps[i] * networkFeeValue;
                }
            }
        }
        require(actualSrcAmount > 0, "src amount is 0");

        for(uint i = 0; i < tradingReserves.ids.length; i++) {
            tradingReserves.addresses[i] = IKyberReserve(convertReserveIdToAddress(tradingReserves.ids[i]));
            require(tradingReserves.addresses[i] != IKyberReserve(0), "reserve unlisted");
            tradingReserves.rates[i] = tradingReserves.addresses[i].getConversionRate(
                isTokenToEth ? token : ETH_TOKEN_ADDRESS,
                isTokenToEth ? ETH_TOKEN_ADDRESS : token,
                actualSrcAmount * tradingReserves.splitValuesBps[i] / BPS,
                block.number 
            );
        }
    }

    /// @notice extra processing, currently for non-splitting trade type
    ///         calling reserves to get rates
    ///         calling matching engine to process data with rates
    ///         save list of chosen reserves for final check and process
    function getTradeDataExtraProcessing(
        TradingReserves memory tradingReserves,
        IERC20 token,
        uint srcAmount,
        bool isTokenToEth,
        uint networkFee, // bps in case t2e, wei value in case e2t
        bytes8[] memory reserveIDs,
        uint[] memory splitValuesBps,
        bool[] memory isFeeCounted
    )
        internal view
    {
        uint[] memory srcAmounts = new uint[](reserveIDs.length);
        uint[] memory rates = new uint[](reserveIDs.length);
        // this value is only used for t2e trade
        uint[] memory feeAccountedBps;
        if (isTokenToEth) {
            feeAccountedBps = new uint[](reserveIDs.length);
        }

        for(uint i = 0; i < reserveIDs.length; i++) {
            require(splitValuesBps[i] > 0 && splitValuesBps[i] <= BPS, "invalid split bps");
            IKyberReserve reserve = IKyberReserve(convertReserveIdToAddress(reserveIDs[i]));
            require(reserve != IKyberReserve(0), "reserve is not listed");

            if (isTokenToEth) {
                srcAmounts[i] = srcAmount * splitValuesBps[i] / BPS;
                feeAccountedBps[i] = isFeeCounted[i] ? networkFee : 0;
            } else {
                require(srcAmount >= networkFee, "srcAmount is less than networkFee");
                srcAmounts[i] = isFeeCounted[i] ? (srcAmount - networkFee) * splitValuesBps[i] / BPS :
                    srcAmount * splitValuesBps[i] / BPS;
            }

            rates[i] = reserve.getConversionRate(
                isTokenToEth ? token : ETH_TOKEN_ADDRESS,
                isTokenToEth ? ETH_TOKEN_ADDRESS : token,
                srcAmounts[i],
                block.number
            );
        }

        uint[] memory selectedIndexes;
        if (isTokenToEth) {
            selectedIndexes = matchingEngine.doMatchTokenToEth(token, ETH_TOKEN_ADDRESS, srcAmounts, feeAccountedBps, rates);
        } else {
            selectedIndexes = matchingEngine.doMatchEthToToken(ETH_TOKEN_ADDRESS, token, srcAmounts, rates);
        }

        tradingReserves.ids = new bytes8[](selectedIndexes.length);
        tradingReserves.addresses = new IKyberReserve[](selectedIndexes.length);
        tradingReserves.splitValuesBps = new uint[](selectedIndexes.length);
        tradingReserves.isFeePaying = new bool[](selectedIndexes.length);
        tradingReserves.rates = new uint[](selectedIndexes.length);

        for(uint i = 0; i < selectedIndexes.length; i++) {
            require(selectedIndexes[i] < reserveIDs.length, "index out of bound");
            tradingReserves.ids[i] = reserveIDs[selectedIndexes[i]];
            tradingReserves.addresses[i] = IKyberReserve(convertReserveIdToAddress(tradingReserves.ids[i]));
            tradingReserves.splitValuesBps[i] = splitValuesBps[selectedIndexes[i]];
            tradingReserves.isFeePaying[i] = isFeeCounted[selectedIndexes[i]];
            tradingReserves.rates[i] = rates[selectedIndexes[i]];
        }
    }

    /// @notice verify split values bps and reserve ids
    ///         each split bps must be in range (0, BPS]
    ///         total split bps must be 100%
    ///         reserve ids must be increasing
    function verifyReserveIDsAndSplitValues(TradingReserves memory tradingReserves)
        internal pure returns(bool)
    {
        uint totalSplitBps;

        for(uint i = 0; i < tradingReserves.ids.length; i++) {
            if (tradingReserves.splitValuesBps[i] == 0 || tradingReserves.splitValuesBps[i] > BPS) {
                return false; // invalid split
            }
            totalSplitBps += tradingReserves.splitValuesBps[i];
            if (i > 0 && (uint64(tradingReserves.ids[i]) <= uint64(tradingReserves.ids[i - 1]))) {
                return false; // ids are not in increasing order
            }
        }
        return totalSplitBps == BPS;
    }

    function convertReserveIdToAddress(bytes8 reserveId)
        internal
        view
        returns (address)
    {
        return reserveIdToAddresses[reserveId][0];
    }
}