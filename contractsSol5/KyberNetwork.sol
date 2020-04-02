pragma  solidity 0.5.11;

import "./utils/Withdrawable3.sol";
import "./utils/Utils4.sol";
import "./utils/zeppelin/ReentrancyGuard.sol";
import "./utils/zeppelin/SafeERC20.sol";
import "./IKyberNetwork.sol";
import "./IKyberReserve.sol";
import "./IKyberFeeHandler.sol";
import "./IKyberDAO.sol";
import "./IKyberMatchingEngine.sol";
import "./IKyberStorage.sol";
import "./IGasHelper.sol";

/*
*   @title Kyber Network main contract
*   Interacts with contracts:
*       KyberDao: to retrieve fee data
*       KyberFeeHandler: accumulate fees for the trade
*       KyberMatchingEngine: parse user hint and match reserves.
*
*   Kyber network will call matching engine for:
*       - add / remove reserve
*       - list tokens
*       - get rate
*       - trade.
*/

contract KyberNetwork is Withdrawable3, Utils4, IKyberNetwork, ReentrancyGuard {

    using SafeERC20 for IERC20;

    uint  internal constant PERM_HINT_GET_RATE = 1 << 255;   // for backwards compatibility
    uint  internal constant DEFAULT_NETWORK_FEE_BPS = 25;    // till we read value from DAO
    uint  internal constant MAX_APPROVED_PROXIES = 2;        // limit number of proxies that can trade here.

    IKyberFeeHandler        public   feeHandler;
    IKyberDAO               public   kyberDAO;
    IKyberMatchingEngine    public   matchingEngine;
    IKyberStorage           public   kyberStorage;
    IGasHelper              internal gasHelper;

    NetworkFeeData internal networkFeeData; // data is feeBps and expiry block
    uint internal maxGasPriceValue = 50 * 1000 * 1000 * 1000; // 50 gwei
    bool internal isEnabled = false; // is network enabled

    mapping(address=>bool) internal kyberProxyContracts;

    // mapping reserve ID to address, keeps an array of all previous reserve addresses with this ID
    mapping(bytes32=>address) public reserveIdToAddress;
    mapping(address=>address) public reserveRebateWallet;

    struct NetworkFeeData {
        uint64 expiryBlock;
        uint16 feeBps;
    }

    constructor(address _admin) public Withdrawable3(_admin) {
        updateNetworkFee(block.number, DEFAULT_NETWORK_FEE_BPS);
    }

    event EtherReceival(address indexed sender, uint amount);

    function() external payable {
        emit EtherReceival(msg.sender, msg.value);
    }

    /// @notice use token address ETH_TOKEN_ADDRESS for ether
    /// @dev trade from src to dest token and sends dest token to destAddress
    /// @param trader Address of the taker side of this trade
    /// @param src Source token
    /// @param srcAmount amount of src tokens in twei
    /// @param dest Destination token
    /// @param destAddress Address to send tokens to
    /// @param maxDestAmount Limit amount of dest tokens in twei. if limit passed, srcAmount will be reduced.
    /// @param minConversionRate The minimal conversion rate. If actual rate is lower, trade reverted.
    /// @param platformWallet Platform wallet address to send platfrom fee.
    /// @param platformFeeBps Percentage of trade to be allocated as platform fee. Ex: 10000 = 100%, 100 = 1%
    /// @param hint defines which reserves should be used for this trade.
    /// @return amount of actual dest tokens in twei
    function tradeWithHintAndFee(
        address payable trader,
        IERC20 src,
        uint srcAmount,
        IERC20 dest,
        address payable destAddress,
        uint maxDestAmount,
        uint minConversionRate,
        address payable platformWallet,
        uint platformFeeBps,
        bytes calldata hint
        )
        external payable
        returns(uint destAmount)
    {
        TradeData memory tData = initTradeInput({
            trader: trader,
            src: src,
            dest: dest,
            srcAmount: srcAmount,
            destAddress: destAddress,
            maxDestAmount: maxDestAmount,
            minConversionRate: minConversionRate,
            platformWallet: platformWallet,
            platformFeeBps: platformFeeBps
            });

        return trade(tData, hint);
    }


    event AddReserveToNetwork (
        address indexed reserve,
        bytes32 indexed reserveId,
        IKyberMatchingEngine.ReserveType reserveType,
        address indexed rebateWallet,
        bool add);

    /// @notice can be called only by operator
    /// @dev adds a reserve to/from the network.
    /// @param reserve The reserve address.
    /// @param reserveId The reserve ID in 8 bytes. 1st byte is reserve type.
    /// @param reserveType Type of the reserve out of enum ReserveType
    /// @param rebateWallet Rebate wallet address for this reserve.
    function addReserve(address reserve, bytes32 reserveId, IKyberMatchingEngine.ReserveType reserveType,
        address payable rebateWallet)
        external returns(bool)
    {
        onlyOperator();
        require(kyberStorage.addReserve(reserve, reserveId));
        require(matchingEngine.addReserve(reserveId, reserveType));

        reserveIdToAddress[reserveId] = reserve;
        
        reserveRebateWallet[reserve] = rebateWallet;

        emit AddReserveToNetwork(reserve, reserveId, reserveType, rebateWallet, true);

        return true;
    }

    event RemoveReserveFromNetwork(address reserve, bytes32 indexed reserveId);

    /// @notice can be called only by operator
    /// @dev removes a reserve from Kyber network.
    /// @param reserve The reserve address.
    /// @param startIndex to search in reserve array.
    function removeReserve(address reserve, uint startIndex) public returns(bool) {
        onlyOperator();
        bytes32 reserveId = kyberStorage.removeReserve(reserve, startIndex);
        require(matchingEngine.removeReserve(reserveId));
        
        require(reserveIdToAddress[reserveId] == reserve, "reserve and id mismatch");

        reserveIdToAddress[reserveId] = address(0);

        reserveRebateWallet[reserve] = address(0);

        emit RemoveReserveFromNetwork(reserve, reserveId);

        return true;
    }

    function rmReserve(address reserve) external returns(bool) {
        onlyOperator();
        return removeReserve(reserve, 0);
    }

    event ListReservePairs(address indexed reserve, IERC20 src, IERC20 dest, bool add);

    /// @notice can be called only by operator
    /// @dev allow or prevent a specific reserve to trade a pair of tokens
    /// @param reserve The reserve address.
    /// @param token token address
    /// @param ethToToken will it support ether to token trade
    /// @param tokenToEth will it support token to ether trade
    /// @param add If true then list this pair, otherwise unlist it.
    function listPairForReserve(address reserve, IERC20 token, bool ethToToken, bool tokenToEth, bool add)
        external
        returns(bool)
    {
        onlyOperator();
        require(kyberStorage.listPairForReserve(reserve, token, ethToToken, tokenToEth, add));

        if (ethToToken) {
            emit ListReservePairs(reserve, ETH_TOKEN_ADDRESS, token, add);
        }

        if (tokenToEth) {
            if (add) {
                token.safeApprove(reserve, 2**255);
            } else {
                token.safeApprove(reserve, 0);
            }
            emit ListReservePairs(reserve, token, ETH_TOKEN_ADDRESS, add);
        }

        setDecimals(token);

        return true;
    }

    event FeeHandlerUpdated(IKyberFeeHandler newHandler);
    event MatchingEngineUpdated(IKyberMatchingEngine matchingEngine);
    event KyberStorageUpdated(IKyberStorage newStorage);
    event GasHelperUpdated(IGasHelper gasHelper);

    function setContracts(IKyberFeeHandler _feeHandler,
        IKyberMatchingEngine _matchingEngine,
        IKyberStorage _kyberStorage,
        IGasHelper _gasHelper
    )
        external
    {
        onlyAdmin();
        require(_feeHandler != IKyberFeeHandler(0), "feeHandler 0");
        require(_matchingEngine != IKyberMatchingEngine(0), "matchingEngine 0");
        require(_kyberStorage != IKyberStorage(0), "storage 0");

        if (kyberStorage != _kyberStorage) {
            kyberStorage = _kyberStorage;
            require(_matchingEngine.setKyberStorage(_kyberStorage));
            emit KyberStorageUpdated(_kyberStorage);
        }

        if (feeHandler != _feeHandler) {
            feeHandler = _feeHandler;
            emit FeeHandlerUpdated(_feeHandler);
        }

        if (matchingEngine != _matchingEngine) {
            matchingEngine = _matchingEngine;
            emit MatchingEngineUpdated(_matchingEngine);
        }

        if ((_gasHelper != IGasHelper(0)) && (_gasHelper != gasHelper)) {
            gasHelper = _gasHelper;
            emit GasHelperUpdated(_gasHelper);
        }

        require(kyberStorage.setContracts(_feeHandler, address(_matchingEngine)), "set contract fail");
    }

    event KyberDAOUpdated(IKyberDAO newDAO);

    function setDAOContract(IKyberDAO _kyberDAO) external {
        onlyAdmin();
        require(_kyberDAO != IKyberDAO(0), "kyberDAO 0");
        if (kyberDAO != _kyberDAO) {
            kyberDAO = _kyberDAO;
            require(kyberStorage.setDAOContract(_kyberDAO));
            emit KyberDAOUpdated(_kyberDAO);
        }
    }

    event KyberNetworkParamsSet(uint maxGasPrice, uint negligibleRateDiffBps);

    function setParams(uint _maxGasPrice, uint _negligibleRateDiffBps) external {
        onlyAdmin();
        maxGasPriceValue = _maxGasPrice;
        require(matchingEngine.setNegligbleRateDiffBps(_negligibleRateDiffBps));
        emit KyberNetworkParamsSet(maxGasPriceValue, _negligibleRateDiffBps);
    }

    event KyberNetworkSetEnable(bool isEnabled);

    function setEnable(bool _enable) external {
        onlyAdmin();
        if (_enable) {
            require(feeHandler != IKyberFeeHandler(0), "feeHandler 0");
            require(matchingEngine != IKyberMatchingEngine(0), "matchingEngine 0");
            require(kyberStorage.isKyberProxyAdded(), "proxy 0");
        }
        isEnabled = _enable;

        emit KyberNetworkSetEnable(isEnabled);
    }

    event KyberProxyAdded(address proxy);
    event KyberProxyRemoved(address proxy);

    /// @dev no. of KyberNetworkProxies are capped
    function addKyberProxy(address networkProxy) external {
        onlyAdmin();
        require(networkProxy != address(0), "proxy 0");
        require(!kyberProxyContracts[networkProxy], "proxy exists");
        require(kyberStorage.addKyberProxy(networkProxy, MAX_APPROVED_PROXIES));

        kyberProxyContracts[networkProxy] = true;

        emit KyberProxyAdded(networkProxy);
    }

    function removeKyberProxy(address networkProxy) external {
        onlyAdmin();
        require(kyberProxyContracts[networkProxy], "proxy not found");

        require(kyberStorage.removeKyberProxy(networkProxy));

        emit KyberProxyRemoved(networkProxy);
    }

    /// @dev gets the expected and slippage rate for exchanging src -> dest token, with platform fee taken into account
    /// @param src Source token
    /// @param dest Destination token
    /// @param srcQty amount of src tokens in twei
    /// @param platformFeeBps Percentage of trade to be allocated as platform fee. Ex: 10000 = 100%, 100 = 1%
    /// @param hint defines which reserves should be used for this trade
    /// @return returns 3 different rates
    /// @param rateWithoutFees rate excluding network and platform fees
    /// @param rateWithNetworkFee rate excluding network fee, but includes platform fee
    /// @param rateWithAllFees rate after accounting for both network and platform fees
    function getExpectedRateWithHintAndFee(IERC20 src, IERC20 dest, uint srcQty, uint platformFeeBps,
        bytes calldata hint)
        external view
        returns (uint rateWithoutFees, uint rateWithNetworkFee, uint rateWithAllFees)
    {
        if (src == dest) return (0, 0, 0);

        TradeData memory tData = initTradeInput({
            trader: address(uint160(0)),
            src: src,
            dest: dest,
            srcAmount: (srcQty == 0) ? 1 : srcQty,
            destAddress: address(uint160(0)),
            maxDestAmount: 2 ** 255,
            minConversionRate: 0,
            platformWallet: address(uint160(0)),
            platformFeeBps: platformFeeBps
        });

        tData.networkFeeBps = getNetworkFee();

        uint destAmount;
        (destAmount, rateWithNetworkFee) = calcRatesAndAmounts(tData, hint);

        rateWithoutFees = calcRateFromQty(tData.input.srcAmount, tData.destAmountWithoutFees, tData.tokenToEth.decimals,
            tData.ethToToken.decimals);

        rateWithAllFees = calcRateFromQty(tData.input.srcAmount, destAmount, tData.tokenToEth.decimals,
            tData.ethToToken.decimals);
    }

    function initTradeInput(
        address payable trader,
        IERC20 src,
        IERC20 dest,
        uint srcAmount,
        address payable destAddress,
        uint maxDestAmount,
        uint minConversionRate,
        address payable platformWallet,
        uint platformFeeBps
        )
    internal view returns (TradeData memory tData)
    {
        tData.input.trader = trader;
        tData.input.src = src;
        tData.input.srcAmount = srcAmount;
        tData.input.dest = dest;
        tData.input.destAddress = destAddress;
        tData.input.maxDestAmount = maxDestAmount;
        tData.input.minConversionRate = minConversionRate;
        tData.input.platformWallet = platformWallet;
        tData.input.platformFeeBps = platformFeeBps;

        tData.tokenToEth.decimals = getDecimals(src);
        tData.ethToToken.decimals = getDecimals(dest);
    }

    /// @notice returns some data about the network
    /// @param negligibleDiffBps Neligible rate difference (in basis pts) when searching best rate
    /// @param networkFeeBps Network fees to be charged (in basis pts)
    /// @param expiryBlock Block number for which networkFeeBps will expire,
    /// and needs to be updated by calling DAO contract / set to default
    function getNetworkData() external view returns(
        uint negligibleDiffBps,
        uint networkFeeBps,
        uint expiryBlock)
    {
        (networkFeeBps, expiryBlock) = readNetworkFeeData();
        negligibleDiffBps = matchingEngine.getNegligibleRateDiffBps();
        return(negligibleDiffBps, networkFeeBps, expiryBlock);
    }

    /// @notice returns the max gas price allowable for trades
    function maxGasPrice() external view returns(uint) {
        return maxGasPriceValue;
    }

    /// @notice returns status of the network. If disabled, trades cannot happen.
    function enabled() external view returns(bool) {
        return isEnabled;
    }

    /// @notice Stores work data for reserves (either for token -> ETH, or ETH -> token)
    /// @dev Variables are in-place, ie. reserve with addresses[i] has id of ids[i], offers rate of rates[i], etc.
    /// @param addresses List of reserve addresses selected for the trade
    /// @param ids List of reserve ids, to be used for KyberTrade event
    /// @param rates List of rates that were offered by the reserves
    /// @param isFeeAccounted List of reserves requiring users to pay network fee, or not
    /// @param splitsBps List of proportions of trade amount allocated to the reserves
    ///     If there is only 1 reserve, then it should have a value of 10000 bps
    /// @param decimals Token decimals. Src decimals when for src -> ETH, dest decimals when ETH -> dest
    struct TradingReserves {
        IKyberReserve[] addresses;
        bytes32[] ids;
        uint[] rates;
        bool[] isFeeAccounted;
        uint[] splitsBps;
        uint[] srcAmounts;
        uint decimals;
    }

    struct TradeInput {
        address payable trader;
        IERC20 src;
        uint srcAmount;
        IERC20 dest;
        address payable destAddress;
        uint maxDestAmount;
        uint minConversionRate;
        address platformWallet;
        uint platformFeeBps;
    }

    /// @notice Main trade data structure, is initialised and used for the entire trade flow
    /// @param input initialised when initialiseTradeInput is called. Stores basic trade info
    /// @param tokenToEth stores information about reserves that were selected for src -> ETH side of trade
    /// @param ethToToken stores information about reserves that were selected for ETH -> dest side of trade
    /// @param tradeWei Trade amount in ether wei, before deducting fees.
    /// @param networkFeeWei Network fee in ether wei. for t2t can go up to 200% of networkFeeBps
    /// @param platformFeeWei Platform fee in ether wei
    /// @param networkFeeBps Network fee bps determined by DAO, or default value
    /// @param numFeeAccountedReserves No. of reserves that are accounted for network fees
    ///     Some reserve types don't require users to pay the network fee
    /// @param feeAccountedBps Proportion of this trade that fee is accounted to, in BPS. Up to 2 * B
    /// @param destAmountWithoutFees Twei amount of dest tokens, without network and platform fee
    /// @param rateWithNetworkFee src -> dest token rate, after accounting for only network fee
    struct TradeData {

        TradeInput input;

        TradingReserves tokenToEth;
        TradingReserves ethToToken;

        uint tradeWei;
        uint networkFeeWei;
        uint platformFeeWei;

        uint networkFeeBps;

        uint numFeeAccountedReserves;
        uint feeAccountedBps; // what part of this trade is fee paying. for token to token - up to 200%

        uint destAmountWithoutFees;
        uint rateWithNetworkFee;
    }

    /// @notice
    /// Calls matching engine that determines all the information necessary for the trade (to be stored in tradeData)
    /// such as what reserves were selected (their addresses and ids), what rates they offer, fee paying information
    /// tradeWei amount, network fee wei, platform fee, etc. WITHOUT accounting for maxDestAmount.
    /// This function should set all TradeData information so that it can be used after without any ambiguity
    /// @param tData main trade data object for trade info to be stored
    /// @param hint which reserves should be used for the trade
    function calcRatesAndAmounts(TradeData memory tData, bytes memory hint)
        internal view returns(uint destAmount, uint rateWithNetworkFee)
    {
        // token to eth. find best reserve match and calculate wei amount
        (tData.tradeWei, tData.networkFeeWei) = calcDestQtyAndMatchReserves(tData.input.src, ETH_TOKEN_ADDRESS,
            tData.input.srcAmount, tData, tData.tokenToEth, hint);

        if (tData.tradeWei == 0) {
            return (0, 0);
        }

        // platform fee
        tData.platformFeeWei = tData.tradeWei * tData.input.platformFeeBps / BPS;

        require(tData.tradeWei >= (tData.networkFeeWei + tData.platformFeeWei), "fees exceed trade");

        // Eth to Token. find best reserve match and calculate trade dest amount
        uint actualSrcWei = tData.tradeWei - tData.networkFeeWei - tData.platformFeeWei;
        uint networkFeeE2tWei;
        (destAmount, networkFeeE2tWei) = calcDestQtyAndMatchReserves(ETH_TOKEN_ADDRESS, tData.input.dest, actualSrcWei,
            tData, tData.ethToToken, hint);
        tData.networkFeeWei += networkFeeE2tWei;

        // calculate different rates: rate with only network fee, dest amount without fees.
        uint e2tRate = calcRateFromQty(actualSrcWei, destAmount, ETH_DECIMALS, tData.ethToToken.decimals);

        uint destAmountWithNetworkFee = calcDstQty(tData.tradeWei - tData.networkFeeWei, ETH_DECIMALS,
            tData.ethToToken.decimals, e2tRate);

        tData.destAmountWithoutFees = calcDstQty(tData.tradeWei, ETH_DECIMALS, tData.ethToToken.decimals, e2tRate);

        rateWithNetworkFee = calcRateFromQty(tData.input.srcAmount, destAmountWithNetworkFee,
            tData.tokenToEth.decimals, tData.ethToToken.decimals);
    }

    /// @notice calculate trade data and store them into tData
    function calcDestQtyAndMatchReserves(
        IERC20 src,
        IERC20 dest,
        uint srcAmount,
        TradeData memory tData,
        TradingReserves memory tradingReserves,
        bytes memory hint
    )
        internal view returns (uint destAmout, uint networkFeeWei)
    {
        if (src == dest) {
            return (srcAmount, 0);
        }

        IKyberMatchingEngine.ProcessWithRate processWithRate;

        // get reserve list from matching engine.
        (tradingReserves.ids, tradingReserves.splitsBps, tradingReserves.isFeeAccounted, processWithRate) =
            matchingEngine.getReserveList(
                src,
                dest,
                (src != ETH_TOKEN_ADDRESS) && (dest != ETH_TOKEN_ADDRESS),
                hint
            );

        require(tradingReserves.ids.length == tradingReserves.splitsBps.length, "bad split array");
        require(tradingReserves.ids.length == tradingReserves.isFeeAccounted.length, "bad fee array");

        // calculate src trade amount per reserve and query rates
        // set data in tradingReserves struct
        uint[] memory feeAccountedBpsDest = calcSrcAmountsAndGetRates(
            tradingReserves,
            src,
            dest,
            srcAmount,
            tData.networkFeeBps,
            tData.tradeWei
        );

        // if matching engine requires processing with rate data. call do match and update reserve list
        if (processWithRate == IKyberMatchingEngine.ProcessWithRate.Required) {
            uint[] memory selectedIndexes = matchingEngine.doMatch(
                src, dest, tradingReserves.srcAmounts, feeAccountedBpsDest, tradingReserves.rates);

            updateReservesData(tradingReserves, selectedIndexes);
        }

        // calculate dest amount and fee paying data of this part (t2e or e2t)
        (destAmout, networkFeeWei) = validateTradeCalcDestQtyAndFeeData(src, dest, tradingReserves, tData);
    }

    /// @dev calculates source amounts per reserve. does get rate call.
    function calcSrcAmountsAndGetRates(
            TradingReserves memory tradingReserves,
            IERC20 src,
            IERC20 dest,
            uint srcAmount,
            uint networkFeeBps,
            uint tradeWei
        )
        internal view returns(
            uint[] memory feeAccountedBpsDest
        )
    {
        uint numReserves = tradingReserves.ids.length;

        tradingReserves.srcAmounts = new uint[](numReserves);
        tradingReserves.rates = new uint[](numReserves);
        tradingReserves.addresses = new IKyberReserve[](numReserves);
        feeAccountedBpsDest = new uint[](numReserves);

        // iterate reserve list. validate data. calculate srcAmount according to splits and fee data.
        for (uint i = 0; i < numReserves; i++) {
            require(tradingReserves.splitsBps[i] > 0 && tradingReserves.splitsBps[i] <= BPS, "invalid split bps");
            tradingReserves.addresses[i] = IKyberReserve(convertReserveIdToAddress(tradingReserves.ids[i]));

            tradingReserves.srcAmounts[i] = srcAmount * tradingReserves.splitsBps[i] / BPS;

            if(tradingReserves.isFeeAccounted[i]) {
                if (src == ETH_TOKEN_ADDRESS) {
                    // we have to calculate fee with full trade wei. so symmetric amount reduced for e2t
                    uint networkFeeWei = tradeWei * networkFeeBps / BPS * tradingReserves.splitsBps[i] / BPS;
                    tradingReserves.srcAmounts[i] -= networkFeeWei;
                } else {
                    feeAccountedBpsDest[i] = networkFeeBps;
                }
            }

            // get rate with calculated src amount
            tradingReserves.rates[i] = tradingReserves.addresses[i].getConversionRate(
                src,
                dest,
                tradingReserves.srcAmounts[i],
                block.number
            );
        }
    }

    //update reserve data with selected reserves from matching engine
    function updateReservesData(TradingReserves memory tradingReserves, uint[] memory selectedIndexes)
        internal pure
    {
        uint numReserves = selectedIndexes.length;

        require(numReserves <= tradingReserves.addresses.length, "too big reserve selection");

        IKyberReserve[] memory reserveAddresses = new IKyberReserve[](numReserves);
        bytes32[] memory reserveIds = new bytes32[](numReserves);
        uint[] memory splitsBps = new uint[](numReserves);
        bool[] memory isFeeAccounted = new bool[](numReserves);
        uint[] memory srcAmounts = new uint[](numReserves);
        uint[] memory rates = new uint[](numReserves);

        // update participating resevres and all data (rates, srcAmounts, feeAcounted etc.)
        for(uint i = 0; i < numReserves; i++) {
            reserveAddresses[i] = tradingReserves.addresses[selectedIndexes[i]];
            reserveIds[i] = tradingReserves.ids[selectedIndexes[i]];
            splitsBps[i] = tradingReserves.splitsBps[selectedIndexes[i]];
            isFeeAccounted[i] = tradingReserves.isFeeAccounted[selectedIndexes[i]];
            srcAmounts[i] = tradingReserves.srcAmounts[selectedIndexes[i]];
            rates[i] = tradingReserves.rates[selectedIndexes[i]];
        }

        //update values
        tradingReserves.addresses = reserveAddresses;
        tradingReserves.ids = reserveIds;
        tradingReserves.splitsBps = splitsBps;
        tradingReserves.isFeeAccounted = isFeeAccounted;
        tradingReserves.rates = rates;
        tradingReserves.srcAmounts = srcAmounts;
    }

    /// @notice verify split values bps and reserve ids
    ///         each split bps must be in range (0, BPS]
    ///         total split bps must be 100%
    ///         reserve ids must be increasing
    function validateTradeCalcDestQtyAndFeeData(IERC20 src, IERC20 dest, TradingReserves memory tradingReserves,
        TradeData memory tData)
        internal pure returns(uint destAmount, uint networkFeeWei)
    {
        uint totalBps;
        uint numFeeAccountedReserves;
        uint feeAccountedBps;

        for (uint i = 0; i < tradingReserves.addresses.length; i++) {
            if (i > 0 && (uint(tradingReserves.ids[i]) <= uint(tradingReserves.ids[i - 1]))) {
                return (0, 0); // ids are not in increasing order
            }
            totalBps += tradingReserves.splitsBps[i];

            destAmount += calcDstQty(
                tradingReserves.srcAmounts[i],
                (tData.input.src == ETH_TOKEN_ADDRESS) ? ETH_DECIMALS : tradingReserves.decimals,
                (tData.input.src == ETH_TOKEN_ADDRESS) ? tradingReserves.decimals : ETH_DECIMALS,
                tradingReserves.rates[i]
            );

            if (tradingReserves.isFeeAccounted[i]) {
                if (src == ETH_TOKEN_ADDRESS) {
                    networkFeeWei += tData.tradeWei * tData.networkFeeBps / BPS * tradingReserves.splitsBps[i] / BPS;
                } else {
                    feeAccountedBps += tradingReserves.splitsBps[i];
                }
                numFeeAccountedReserves++;
            }
        }

        if (totalBps != BPS) {
            return (0, 0);
        }

        tData.numFeeAccountedReserves += numFeeAccountedReserves;
        tData.feeAccountedBps += feeAccountedBps;

        if (dest == ETH_TOKEN_ADDRESS) {
            networkFeeWei = destAmount * tData.networkFeeBps / BPS * feeAccountedBps / BPS;
        }
    }

    /// @notice calculates platform fee and reserve rebate percentages for the trade.
    ///             Transfers ETH and rebate wallet data to feeHandler
    function handleFees(TradeData memory tData) internal returns(bool) {
        //no need to handle fees if no fee paying reserves
        if ((tData.numFeeAccountedReserves == 0) && (tData.platformFeeWei == 0)) return true;

        // Updates reserve eligibility and rebate percentages
        (address[] memory rebateWallets, uint[] memory rebatePercentBps) = calculateRebateSplitPerWallet(tData);

        uint sentFee = tData.networkFeeWei + tData.platformFeeWei;

        // Send total fee amount to fee handler with reserve data.
        require(
            feeHandler.handleFees.value(sentFee)(rebateWallets, rebatePercentBps,
            tData.input.platformWallet, tData.platformFeeWei),
            "handle fee fail"
        );
        return true;
    }

    function calculateRebateSplitPerWallet(TradeData memory tData) internal view
        returns (address[] memory rebateWallets, uint[] memory rebatePercentBps)
    {
        rebateWallets = new address[](tData.numFeeAccountedReserves);
        rebatePercentBps = new uint[](tData.numFeeAccountedReserves);
        if (tData.numFeeAccountedReserves == 0) {
            return(rebateWallets, rebatePercentBps);
        }

        uint index;

        // ethToToken
        index = populateRebateWalletList(
            rebateWallets,
            rebatePercentBps,
            tData.ethToToken,
            index,
            tData.feeAccountedBps
        );

        // tokenToEth
        index = populateRebateWalletList(
            rebateWallets,
            rebatePercentBps,
            tData.tokenToEth,
            index,
            tData.feeAccountedBps
        );
    }

    function populateRebateWalletList(
        address[] memory rebateWallets,
        uint[] memory rebatePercentBps,
        TradingReserves memory resList,
        uint index,
        uint feeAccountedBps
    ) internal view returns(uint) {
        uint _index = index;

        for(uint i = 0; i < resList.isFeeAccounted.length; i++) {
            if (resList.isFeeAccounted[i]) {
                rebateWallets[_index] = reserveRebateWallet[address(resList.addresses[i])];
                rebatePercentBps[_index] = resList.splitsBps[i] * BPS / feeAccountedBps;
                _index++;
            }
        }
        return _index;
    }

    function calcTradeSrcAmount(uint srcDecimals, uint destDecimals, uint destAmount, uint[] memory rates,
        uint[] memory splitsBps)
        internal pure returns (uint srcAmount)
    {
        uint destAmountSoFar;

        for (uint i = 0; i < rates.length; i++) {
            uint destAmountSplit = i == (splitsBps.length - 1) ?
                (destAmount - destAmountSoFar) : splitsBps[i] * destAmount / BPS;
            destAmountSoFar += destAmountSplit;

            srcAmount += calcSrcQty(destAmountSplit, srcDecimals, destDecimals, rates[i]);
        }
    }

    /// @notice Recalculates tradeWei, network and platform fees, and actual source amount needed for the trade
    /// in the event actualDestAmount > maxDestAmount
    function calcTradeSrcAmountFromDest (TradeData memory tData)
        internal pure returns(uint actualSrcAmount)
    {
        uint weiAfterFees;
        if (tData.input.dest != ETH_TOKEN_ADDRESS) {
            weiAfterFees = calcTradeSrcAmount(ETH_DECIMALS, tData.ethToToken.decimals, tData.input.maxDestAmount,
                tData.ethToToken.rates, tData.ethToToken.splitsBps);
        } else {
            weiAfterFees = tData.input.maxDestAmount;
        }

        //reverse calculation, because we are working backwards
        tData.tradeWei = weiAfterFees * BPS * BPS /
            ((BPS * BPS) - tData.networkFeeBps * tData.feeAccountedBps - tData.input.platformFeeBps * BPS);
        //recalculate network and platform fees based on tradeWei
        tData.networkFeeWei = tData.tradeWei * tData.networkFeeBps / BPS * tData.feeAccountedBps / BPS;
        tData.platformFeeWei = tData.tradeWei * tData.input.platformFeeBps / BPS;

        if (tData.input.src != ETH_TOKEN_ADDRESS) {
            actualSrcAmount = calcTradeSrcAmount(tData.tokenToEth.decimals, ETH_DECIMALS, tData.tradeWei,
                tData.tokenToEth.rates, tData.tokenToEth.splitsBps);
        } else {
            actualSrcAmount = tData.tradeWei;
        }

        require(actualSrcAmount <= tData.input.srcAmount, "actualSrcAmt > given srcAmt");
    }

    event KyberTrade(address indexed trader, IERC20 src, IERC20 dest, uint srcAmount, uint dstAmount,
        address destAddress, uint ethWeiValue, uint networkFeeWei, uint customPlatformFeeWei,
        bytes32[] t2eIds, bytes32[] e2tIds, bytes hint);

    /* solhint-disable function-max-lines */
    //  Most of the lines here are functions calls spread over multiple lines. We find this function readable enough
    /// @notice use token address ETH_TOKEN_ADDRESS for ether
    /// @dev trade api for kyber network.
    /// @param tData.input structure of trade inputs
    function trade(TradeData memory tData, bytes memory hint)
        internal
        nonReentrant
        returns(uint destAmount)
    {
        tData.networkFeeBps = getAndUpdateNetworkFee();

        require(verifyTradeInputValid(tData.input, tData.networkFeeBps), "invalid");

        uint rateWithNetworkFee;
        (destAmount, rateWithNetworkFee) = calcRatesAndAmounts(tData, hint);

        require(rateWithNetworkFee > 0, "0 rate");
        require(rateWithNetworkFee < MAX_RATE, "rate > MAX_RATE");
        require(rateWithNetworkFee >= tData.input.minConversionRate, "rate < min Rate");

        if (gasHelper != IGasHelper(0)) {
            (bool success, ) = address(gasHelper).call(
                abi.encodeWithSignature(
                    "freeGas(address,address,address,uint256,bytes32[],bytes32[])",
                    tData.input.platformWallet,
                    tData.input.src,
                    tData.input.dest,
                    tData.tradeWei,
                    tData.tokenToEth.ids,
                    tData.ethToToken.ids
                )
            );
            // remove compilation warning
            success;
        }

        uint actualSrcAmount;

        if (destAmount > tData.input.maxDestAmount) {
            // notice tData passed by reference and updated
            destAmount = tData.input.maxDestAmount;
            actualSrcAmount = calcTradeSrcAmountFromDest(tData);

            require(handleChange(tData.input.src, tData.input.srcAmount, actualSrcAmount, tData.input.trader));
        } else {
            actualSrcAmount = tData.input.srcAmount;
        }

        //src to ETH
        require(doReserveTrades(
                tData.input.src,
                actualSrcAmount,
                ETH_TOKEN_ADDRESS,
                address(this),
                tData,
                tData.tradeWei)); //tData.tradeWei (expectedDestAmount) not used if destAddress == address(this)

        //Eth to dest
        require(doReserveTrades(
                ETH_TOKEN_ADDRESS,
                tData.tradeWei - tData.networkFeeWei - tData.platformFeeWei,
                tData.input.dest,
                tData.input.destAddress,
                tData,
                destAmount));

        require(handleFees(tData));

        emit KyberTrade({
            trader: tData.input.trader,
            src: tData.input.src,
            dest: tData.input.dest,
            srcAmount: actualSrcAmount,
            dstAmount: destAmount,
            destAddress: tData.input.destAddress,
            ethWeiValue: tData.tradeWei,
            networkFeeWei: tData.networkFeeWei,
            customPlatformFeeWei: tData.platformFeeWei,
            t2eIds: tData.tokenToEth.ids,
            e2tIds: tData.ethToToken.ids,
            hint: hint
        });

        return (destAmount);
    }
    /* solhint-enable function-max-lines */

    /// @notice use token address ETH_TOKEN_ADDRESS for ether
    /// @dev do one trade with a reserve
    /// @param src Source token
    /// @param amount amount of src tokens
    /// @param dest   Destination token
    /// @param destAddress Address to send tokens to
    /// @return true if trade is successful
    function doReserveTrades(
        IERC20 src,
        uint amount,
        IERC20 dest,
        address payable destAddress,
        TradeData memory tData,
        uint expectedDestAmount
    )
        internal
        returns(bool)
    {
        if (src == dest) {
            //E2E, need not do anything except for T2E, transfer ETH to destAddress
            if (destAddress != (address(this))) {
                (bool success, ) = destAddress.call.value(amount)("");
                require(success, "send dest qty failed");
            }
            return true;
        }

        TradingReserves memory reservesData = (src == ETH_TOKEN_ADDRESS) ? tData.ethToToken : tData.tokenToEth;
        uint callValue;
        uint srcAmountSoFar;

        for(uint i = 0; i < reservesData.addresses.length; i++) {
            uint splitAmount = i == (reservesData.splitsBps.length - 1) ? (amount - srcAmountSoFar) :
                reservesData.splitsBps[i] * amount / BPS;
            srcAmountSoFar += splitAmount;
            callValue = (src == ETH_TOKEN_ADDRESS) ? splitAmount : 0;

            // reserve sends tokens/eth to network. network sends it to destination
            require(reservesData.addresses[i].trade.value(callValue)(src, splitAmount, dest, address(this),
                        reservesData.rates[i], true));
        }

        if (destAddress != address(this)) {
            //for E2T, T2T, transfer tokens to destAddress
            dest.safeTransfer(destAddress, expectedDestAmount);
        }

        return true;
    }

    /// @notice If user maxDestAmount < actual dest amount, actualSrcAmount will be < srcAmount.
    /// Calculate the change, and send it back to the user
    function handleChange (IERC20 src, uint srcAmount, uint requiredSrcAmount, address payable trader)
        internal returns (bool)
    {

        if (requiredSrcAmount < srcAmount) {
            //if there is "change" send back to trader
            if (src == ETH_TOKEN_ADDRESS) {
                (bool success, ) = trader.call.value(srcAmount - requiredSrcAmount)("");
                require(success, "Send change failed");
            } else {
                src.safeTransfer(trader, (srcAmount - requiredSrcAmount));
            }
        }

        return true;
    }

    /// @dev checks a trade input validity, including correct src amounts
    /// @param input Trade input structure
    /// @param networkFeeBps network fee in bps.
    /// @return true if tradeInput is valid
    function verifyTradeInputValid(TradeInput memory input, uint networkFeeBps) internal view returns(bool) {
        require(isEnabled, "network disabled");
        require(kyberProxyContracts[msg.sender], "bad sender");
        require(tx.gasprice <= maxGasPriceValue, "gas price");
        require(input.srcAmount <= MAX_QTY, "srcAmt > MAX_QTY");
        require(input.srcAmount != 0, "0 srcAmt");
        require(input.destAddress != address(0), "dest add 0");
        require(input.src != input.dest, "src = dest");
        require(input.platformFeeBps < BPS, "platformFee high");
        require(input.platformFeeBps + networkFeeBps + networkFeeBps < BPS, "fees high");

        if (input.src == ETH_TOKEN_ADDRESS) {
            require(msg.value == input.srcAmount, "bad Eth qty");
        } else {
            require(msg.value == 0, "Eth not 0");
            //funds should have been moved to this contract already.
            require(input.src.balanceOf(address(this)) >= input.srcAmount, "no tokens");
        }

        return true;
    }

    /// @notice Gets the network fee from the DAO (or use default). View function for getExpectedRate.
    function getNetworkFee() internal view returns(uint networkFeeBps) {
        uint expiryBlock;
        (networkFeeBps, expiryBlock) = readNetworkFeeData();

        if (expiryBlock < block.number && kyberDAO != IKyberDAO(0)) {
            (networkFeeBps, expiryBlock) = kyberDAO.getLatestNetworkFeeData();
        }
    }

    /// @notice Gets network fee from the DAO (or use default).
    /// For trade function, so that data can be updated and cached.
    /// @dev Note that this function can be triggered by anyone, so that
    /// the first trader of a new epoch can avoid incurring extra gas costs
    function getAndUpdateNetworkFee() public returns(uint networkFeeBps) {
        uint expiryBlock;

        (networkFeeBps, expiryBlock) = readNetworkFeeData();

        if (expiryBlock < block.number && kyberDAO != IKyberDAO(0)) {
            (networkFeeBps, expiryBlock) = kyberDAO.getLatestNetworkFeeDataWithCache();
            updateNetworkFee(expiryBlock, networkFeeBps);
        }
    }

    function readNetworkFeeData() internal view
        returns(uint feeBps, uint expiryBlock)
    {
        feeBps = uint(networkFeeData.feeBps);
        expiryBlock = uint(networkFeeData.expiryBlock);
    }

    function updateNetworkFee(uint expiryBlock, uint feeBps) internal {
        require(expiryBlock < 2 ** 64, "expiry overflow");
        require(feeBps < BPS / 2, "fees exceed BPS");

        networkFeeData.expiryBlock = uint64(expiryBlock);
        networkFeeData.feeBps = uint16(feeBps);
    }

    function convertReserveIdToAddress(bytes32 reserveId)
        internal
        view
        returns (IKyberReserve reserve)
    {
        reserve = IKyberReserve(reserveIdToAddress[reserveId]);
        require (reserve != IKyberReserve(0), "reserve not listed");
    }
}
