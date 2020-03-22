pragma  solidity 0.5.11;

import "./utils/Withdrawable2.sol";
import "./utils/Utils4.sol";
import "./utils/zeppelin/ReentrancyGuard.sol";
import "./utils/zeppelin/SafeERC20.sol";
import "./IKyberNetwork.sol";
import "./IKyberReserve.sol";
import "./IKyberFeeHandler.sol";
import "./IKyberDAO.sol";
import "./IKyberMatchingEngine.sol";
import "./IGasHelper.sol";

/*
*   @title Kyber Network main contract
*   Interacts with a few contracts:
*       KyberDao: to retrieve fee data
*       KyberFeeHandler: accumulate fees for the trade
*       KyberMatchingEngine: match reserves and calculate trade data: rates, fees, wei value
*
*   Kyber network will call matching engine for:
*       - add reserve
*       - list tokens
*       - get rate
*       - trade.
*
*    Matching engine will do all the work of finding which reserve to trade with. Expected rates and fees.
*/

contract KyberNetwork is Withdrawable2, Utils4, IKyberNetwork, ReentrancyGuard {

    using SafeERC20 for IERC20;

    uint  internal constant PERM_HINT_GET_RATE = 1 << 255;   // for backwards compatibility
    uint  internal constant DEFAULT_NETWORK_FEE_BPS = 25;    // till we read value from DAO
    uint  internal constant MAX_APPROVED_PROXIES = 2;        // limit number of proxies that can trade here.

    IKyberFeeHandler[]      internal feeHandler;
    IKyberDAO[]             internal kyberDAO;
    IKyberMatchingEngine[]  internal matchingEngine;
    IGasHelper              internal gasHelper;

    NetworkFeeData internal networkFeeData; // data is feeBps and expiry block
    uint internal maxGasPriceValue = 50 * 1000 * 1000 * 1000; // 50 gwei
    bool internal isEnabled = false; // is network enabled

    mapping(address=>bool) internal kyberProxyContracts;
    address[] internal kyberProxyArray;

    IKyberReserve[] internal reserves;
    mapping(address=>address) public reserveRebateWallet;

    struct NetworkFeeData {
        uint64 expiryBlock;
        uint16 feeBps;
    }

    constructor(address _admin) public Withdrawable2(_admin) {
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

    /// @notice backward compatible function
    /// @notice use token address ETH_TOKEN_ADDRESS for ether
    /// @dev trade from src to dest token and sends dest token to destAddress
    /// @param trader Address of the taker side of this trade
    /// @param src Source token
    /// @param srcAmount amount of src tokens in twei
    /// @param dest Destination token
    /// @param destAddress Address to send tokens to
    /// @param maxDestAmount Limit amount of dest tokens in twei. if limit is passed, srcAmount will be reduced.
    /// @param minConversionRate The minimal conversion rate. If actual rate is lower, trade reverted.
    /// @param walletId will not be used since no fees are set with this API
    /// @param hint defines which reserves should be used
    function tradeWithHint(address trader, ERC20 src, uint srcAmount, ERC20 dest, address destAddress,
        uint maxDestAmount, uint minConversionRate, address walletId, bytes calldata hint)
        external payable returns(uint destAmount)
    {
        TradeData memory tData = initTradeInput({
            trader: address(uint160(trader)),
            src: src,
            dest: dest,
            srcAmount: srcAmount,
            destAddress: address(uint160(destAddress)),
            maxDestAmount: maxDestAmount,
            minConversionRate: minConversionRate,
            platformWallet: address(uint160(walletId)),
            platformFeeBps: 0
            });

        return trade(tData, hint);
    }

    event AddReserveToNetwork (
        address indexed reserve,
        bytes8 indexed reserveId,
        IKyberMatchingEngine.ReserveType reserveType,
        address indexed rebateWallet,
        bool add);

    /// @notice can be called only by operator
    /// @dev adds a reserve to/from the network.
    /// @param reserve The reserve address.
    /// @param reserveId The reserve ID in 8 bytes. 1st byte is reserve type.
    /// @param reserveType Type of the reserve out of enum ReserveType
    /// @param rebateWallet Rebate wallet address for this reserve.
    function addReserve(address reserve, bytes8 reserveId, IKyberMatchingEngine.ReserveType reserveType,
        address payable rebateWallet)
        external onlyOperator returns(bool)
    {
        require(matchingEngine[0].addReserve(reserve, reserveId, reserveType));
        reserves.push(IKyberReserve(reserve));

        reserveRebateWallet[reserve] = rebateWallet;

        emit AddReserveToNetwork(reserve, reserveId, reserveType, rebateWallet, true);

        return true;
    }

    event RemoveReserveFromNetwork(address reserve, bytes8 indexed reserveId);

    /// @notice can be called only by operator
    /// @dev removes a reserve from Kyber network.
    /// @param reserve The reserve address.
    /// @param startIndex to search in reserve array.
    function removeReserve(address reserve, uint startIndex) public onlyOperator returns(bool) {
        bytes8 reserveId = matchingEngine[0].removeReserve(reserve);

        uint reserveIndex = 2 ** 255;

        for (uint i = startIndex; i < reserves.length; i++) {
            if (reserves[i] == IKyberReserve(reserve)) {
                reserveIndex = i;
                break;
            }
        }

        require(reserveIndex != 2 ** 255, "reserve ?");

        reserves[reserveIndex] = reserves[reserves.length - 1];
        reserves.length--;

        reserveRebateWallet[reserve] = address(0);

        emit RemoveReserveFromNetwork(reserve, reserveId);

        return true;
    }

    function rmReserve(address reserve) external onlyOperator returns(bool) {
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
        onlyOperator
        returns(bool)
    {
        require(matchingEngine[0].listPairForReserve(IKyberReserve(reserve), token, ethToToken, tokenToEth, add));

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

        return true;
    }

    event FeeHandlerUpdated(IKyberFeeHandler newHandler);
    event MatchingEngineUpdated(IKyberMatchingEngine matchingEngine);
    event GasHelperUpdated(IGasHelper gasHelper);

    function setContracts(IKyberFeeHandler _feeHandler,
        IKyberMatchingEngine _matchingEngine,
        IGasHelper _gasHelper
    )
        external onlyAdmin
    {
        require(_feeHandler != IKyberFeeHandler(0), "feeHandler 0");
        require(_matchingEngine != IKyberMatchingEngine(0), "matchingEngine 0");

        if ((feeHandler.length == 0) || (_feeHandler != feeHandler[0])) {

            if (feeHandler.length > 0) {
                feeHandler.push(feeHandler[0]);
                feeHandler[0] = _feeHandler;
            } else {
                feeHandler.push(_feeHandler);
            }

            emit FeeHandlerUpdated(_feeHandler);
        }

        if (matchingEngine.length == 0 || _matchingEngine != matchingEngine[0]) {
            if (matchingEngine.length > 0) {
                matchingEngine.push(matchingEngine[0]);
                matchingEngine[0] = _matchingEngine;
            } else {
                matchingEngine.push(_matchingEngine);
            }

            emit MatchingEngineUpdated(_matchingEngine);
        }

        if ((_gasHelper != IGasHelper(0)) && (_gasHelper != gasHelper)) {
            emit GasHelperUpdated(_gasHelper);
            gasHelper = _gasHelper;
        }
    }

    event KyberDAOUpdated(IKyberDAO newDAO);

    function setDAOContract(IKyberDAO _kyberDAO) external onlyAdmin {
        require(_kyberDAO != IKyberDAO(0), "kyberDAO 0");

        if (kyberDAO.length > 0) {
            kyberDAO.push(kyberDAO[0]);
            kyberDAO[0] = _kyberDAO;
        } else {
            kyberDAO.push(_kyberDAO);
        }

        emit KyberDAOUpdated(_kyberDAO);
    }

    event KyberNetworkParamsSet(uint maxGasPrice, uint negligibleRateDiffBps);

    function setParams(uint _maxGasPrice, uint _negligibleRateDiffBps) external onlyAdmin {
        maxGasPriceValue = _maxGasPrice;
        require(matchingEngine[0].setNegligbleRateDiffBps(_negligibleRateDiffBps));
        emit KyberNetworkParamsSet(maxGasPriceValue, _negligibleRateDiffBps);
    }

    event KyberNetworkSetEnable(bool isEnabled);

    function setEnable(bool _enable) external onlyAdmin {
        if (_enable) {
            require(feeHandler[0] != IKyberFeeHandler(0), "feeHandler 0");
            require(matchingEngine[0] != IKyberMatchingEngine(0), "matchingEngine 0");
            require(kyberProxyArray.length > 0, "proxy 0");
        }
        isEnabled = _enable;

        emit KyberNetworkSetEnable(isEnabled);
    }

    event KyberProxyAdded(address proxy);
    event KyberProxyRemoved(address proxy);

    /// @dev no. of KyberNetworkProxies are capped
    function addKyberProxy(address networkProxy) external onlyAdmin {
        require(networkProxy != address(0), "proxy 0");
        require(!kyberProxyContracts[networkProxy], "proxy exists");
        require(kyberProxyArray.length < MAX_APPROVED_PROXIES, "Max 2 proxy");

        kyberProxyArray.push(networkProxy);

        kyberProxyContracts[networkProxy] = true;
        emit KyberProxyAdded(networkProxy);
    }

    function removeKyberProxy(address networkProxy) external onlyAdmin {
        require(kyberProxyContracts[networkProxy], "proxy not found");

        uint proxyIndex = 2 ** 255;

        for (uint i = 0; i < kyberProxyArray.length; i++) {
            if (kyberProxyArray[i] == networkProxy) {
                proxyIndex = i;
                break;
            }
        }

        kyberProxyArray[proxyIndex] = kyberProxyArray[kyberProxyArray.length - 1];
        kyberProxyArray.length--;

        kyberProxyContracts[networkProxy] = false;
        emit KyberProxyRemoved(networkProxy);
    }

    /// @notice should be called off chain
    /// @dev get an array of all reserves
    /// @return An array of all reserves
    function getReserves() external view returns(IKyberReserve[] memory) {
        return reserves;
    }

    /// @notice should be called off chain
    /// @dev get an array of KyberNetworkProxies
    /// @return An array of both KyberNetworkProxies
    function getKyberProxies() external view returns(address[] memory proxies) {
        return kyberProxyArray;
    }

    //backward compatible
    /// @dev gets the expected and slippage rate for exchanging src -> dest token
    /// @dev slippage rate is hardcoded to be 3% lower of expected rate
    /// @param src Source token
    /// @param dest Destination token
    /// @param srcQty amount of src tokens in twei
    /// @return returns expected and slippage rates
    function getExpectedRate(ERC20 src, ERC20 dest, uint srcQty) external view
        returns (uint expectedRate, uint worstRate)
    {
        if (src == dest) return (0, 0);
        uint qty = srcQty & ~PERM_HINT_GET_RATE;

        TradeData memory tData = initTradeInput({
            trader: address(uint160(0)),
            src: src,
            dest: dest,
            srcAmount: (qty == 0) ? 1 : qty,
            destAddress: address(uint160(0)),
            maxDestAmount: 2 ** 255,
            minConversionRate: 0,
            platformWallet: address(uint160(0)),
            platformFeeBps: 0
        });

        tData.networkFeeBps = getNetworkFee();

        calcRatesAndAmounts(src, dest, tData.input.srcAmount, tData, "");

        expectedRate = tData.rateOnlyNetworkFee;
        worstRate = expectedRate * 97 / 100; // backward compatible formula
    }

    /// @dev gets the expected and slippage rate for exchanging src -> dest token, with platform fee taken into account
    /// @param src Source token
    /// @param dest Destination token
    /// @param srcQty amount of src tokens in twei
    /// @param platformFeeBps Percentage of trade to be allocated as platform fee. Ex: 10000 = 100%, 100 = 1%
    /// @param hint defines which reserves should be used for this trade
    /// @return returns 3 different rates
    /// @param rateNoFees rate excluding network and platform fees
    /// @param rateAfterNetworkFee rate excluding network fee, but includes platform fee
    /// @param rateAfterAllFees rate after accounting for both network and platform fees
    function getExpectedRateWithHintAndFee(IERC20 src, IERC20 dest, uint srcQty, uint platformFeeBps,
        bytes calldata hint)
        external view
        returns (uint rateNoFees, uint rateAfterNetworkFee, uint rateAfterAllFees)
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

        calcRatesAndAmounts(src, dest, tData.input.srcAmount, tData, hint);


        rateNoFees = calcRateFromQty(tData.input.srcAmount, tData.destAmountNoFee, tData.tokenToEth.decimals,
            tData.ethToToken.decimals);
        rateAfterNetworkFee = tData.rateOnlyNetworkFee;
        rateAfterAllFees = calcRateFromQty(tData.input.srcAmount, tData.actualDestAmount, tData.tokenToEth.decimals,
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

    /// @notice should be called off chain
    /// @dev returns list of DAO, feeHandler and matchingEngine contracts used
    /// @dev index 0 is currently used contract address, indexes > 0 are older versions
    function getContracts() external view
        returns(
            IKyberDAO[] memory daoAddresses,
            IKyberFeeHandler[] memory feeHandlerAddresses,
            IKyberMatchingEngine[] memory matchingEngineAddresses)
    {
        return(kyberDAO, feeHandler, matchingEngine);
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
        negligibleDiffBps = matchingEngine[0].negligibleRateDiffBps();
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
    /// @param numFeePayingReserves No. of reserves that charge network fees for trade
    ///     Some reserve types don't require users to pay the network fee
    /// @param feePayingReservesBps Proportion of this trade that is fee paying, in BPS. Up to 20000
    /// @param destAmountNoFee Twei amount of dest tokens, without network and platform fee
    /// @param destAmountWithNetworkFee Twei amount of dest tokens, subtracting network fee but not platform fee
    /// @param actualDestAmount Twei amount of dest tokens, after subtracting both network and platform fees
    /// @param rateOnlyNetworkFee src -> dest token rate, after accounting for only network fee
    struct TradeData {

        TradeInput input;

        TradingReserves tokenToEth;
        TradingReserves ethToToken;

        uint tradeWei;
        uint networkFeeWei;
        uint platformFeeWei;

        uint networkFeeBps;

        uint numFeePayingReserves;
        uint feePayingReservesBps; // what part of this trade is fee paying. for token to token - up to 200%

        uint destAmountNoFee;
        uint destAmountWithNetworkFee;
        uint actualDestAmount; // all fees

        uint rateOnlyNetworkFee;
    }

    /// @notice
    /// Calls matching engine that determines all the information necessary for the trade (to be stored in tradeData)
    /// such as what reserves were selected (their addresses and ids), what rates they offer, fee paying information
    /// tradeWei amount, network fee wei, platform fee, etc. WITHOUT accounting for maxDestAmount.
    /// This function should set all TradeData information so that it can be used after without any ambiguity
    /// @param src Source token
    /// @param dest Destination token
    /// @param srcAmount amount of src tokens
    /// @param tData main trade data object for trade info to be stored
    /// @param hint which reserves should be used for the trade
    function calcRatesAndAmounts(IERC20 src, IERC20 dest, uint srcAmount, TradeData memory tData, bytes memory hint)
        internal view
    {
        //init info structure
        uint[] memory info = new uint[](uint(IKyberMatchingEngine.InfoIndex.infoLength));
        info[uint(IKyberMatchingEngine.InfoIndex.networkFeeBps)] = tData.networkFeeBps;
        info[uint(IKyberMatchingEngine.InfoIndex.platformFeeBps)] = tData.input.platformFeeBps;
        info[uint(IKyberMatchingEngine.InfoIndex.srcAmount)] = srcAmount;

        uint[] memory results;
        IKyberReserve[] memory reserveAddresses;
        uint[] memory rates;
        uint[] memory splitValuesBps;
        bool[] memory isFeePaying;
        bytes8[] memory ids;

        (results, reserveAddresses, rates, splitValuesBps, isFeePaying, ids) = matchingEngine[0].calcRatesAndAmounts(
            src, dest, tData.tokenToEth.decimals, tData.ethToToken.decimals, info, hint);

        unpackResults(results, reserveAddresses, rates, splitValuesBps, isFeePaying, ids, tData);

        //cheaper to calculate than pack and unpack these values
        tData.networkFeeWei = tData.tradeWei * tData.networkFeeBps / BPS * tData.feePayingReservesBps / BPS;
        tData.platformFeeWei = tData.tradeWei * tData.input.platformFeeBps / BPS;
        tData.rateOnlyNetworkFee = calcRateFromQty(
            srcAmount, tData.destAmountWithNetworkFee, tData.tokenToEth.decimals, tData.ethToToken.decimals);
    }

    function unpackResults(
        uint[] memory results,
        IKyberReserve[] memory reserveAddresses,
        uint[] memory rates,
        uint[] memory splitValuesBps,
        bool[] memory isFeePaying,
        bytes8[] memory ids,
        TradeData memory tData
        ) internal pure
    {
        uint tokenToEthNumReserves = results[uint(IKyberMatchingEngine.ResultIndex.t2eNumReserves)];

        storeTradeData(tData.tokenToEth, reserveAddresses, rates, splitValuesBps, isFeePaying, ids, 0,
            tokenToEthNumReserves);
        storeTradeData(tData.ethToToken, reserveAddresses, rates, splitValuesBps, isFeePaying, ids,
            tokenToEthNumReserves, reserveAddresses.length - tokenToEthNumReserves);

        tData.tradeWei = results[uint(IKyberMatchingEngine.ResultIndex.tradeWei)];
        tData.numFeePayingReserves = results[uint(IKyberMatchingEngine.ResultIndex.numFeePayingReserves)];
        tData.feePayingReservesBps = results[uint(IKyberMatchingEngine.ResultIndex.feePayingReservesBps)];
        tData.destAmountNoFee = results[uint(IKyberMatchingEngine.ResultIndex.destAmountNoFee)];
        tData.destAmountWithNetworkFee = results[uint(IKyberMatchingEngine.ResultIndex.destAmountWithNetworkFee)];
        tData.actualDestAmount = results[uint(IKyberMatchingEngine.ResultIndex.actualDestAmount)];
    }

    /// @notice Stores information inside tradingReserves
    /// @param tradingReserves Either tData.tokenToEth or tData.ethToToken. Object to store the information in
    /// @param reserveAddresses array of T2E and E2T reserve addresses
    /// @param splitValuesBps, array of T2E and E2T proportional trade amounts in bps
    /// @param isFeePaying array if T2E and E2T reserves requiring users to pay network fee, or not
    /// @param ids List of proportions of trade amount allocated to the different reserves
    /// @param startIndex When accessing the arrays, need to know where to start for E2T, since the arrays store both
    /// @param numReserves No. of reserves to iterate over in the arrays
    function storeTradeData(TradingReserves memory tradingReserves, IKyberReserve[] memory reserveAddresses,
        uint[] memory rates, uint[] memory splitValuesBps, bool[] memory isFeePaying, bytes8[] memory ids,
        uint startIndex, uint numReserves)
        internal pure
    {
        //init arrays
        tradingReserves.addresses = new IKyberReserve[](numReserves);
        tradingReserves.rates = new uint[](numReserves);
        tradingReserves.splitValuesBps = new uint[](numReserves);
        tradingReserves.isFeePaying = new bool[](numReserves);
        tradingReserves.ids = new bytes8[](numReserves);

        //store info
        for (uint i = startIndex; i < startIndex + numReserves; i++) {
            tradingReserves.addresses[i - startIndex] = reserveAddresses[i];
            tradingReserves.rates[i - startIndex] = rates[i];
            tradingReserves.splitValuesBps[i - startIndex] = splitValuesBps[i];
            tradingReserves.isFeePaying[i - startIndex] = isFeePaying[i];
            tradingReserves.ids[i - startIndex] = ids[i];
        }
    }

    /// @notice calculates platform fee and reserve rebate percentages for the trade.
    ///             Transfers ETH and rebate wallet data to feeHandler
    function handleFees(TradeData memory tData) internal returns(bool) {
        //no need to handle fees if no fee paying reserves
        if ((tData.numFeePayingReserves == 0) && (tData.platformFeeWei == 0)) return true;

        // Updates reserve eligibility and rebate percentages
        (address[] memory rebateWallets, uint[] memory rebatePercentBps) = calcualteRebateSplitPerWallet(tData);

        uint sentFee = tData.networkFeeWei + tData.platformFeeWei;

        // Send total fee amount to fee handler with reserve data.
        require(
            feeHandler[0].handleFees.value(sentFee)(rebateWallets, rebatePercentBps,
            tData.input.platformWallet, tData.platformFeeWei),
            "handle fee fail"
        );
        return true;
    }

    function calcualteRebateSplitPerWallet(TradeData memory tData) internal view
        returns (address[] memory rebateWallets, uint[] memory rebatePercentBps)
    {
        rebateWallets = new address[](tData.numFeePayingReserves);
        rebatePercentBps = new uint[](tData.numFeePayingReserves);

        uint index;

        // ethToToken
        index = populateRebateWalletList(
            rebateWallets,
            rebatePercentBps,
            tData.ethToToken,
            index,
            tData.feePayingReservesBps
        );

        // tokenToEth
        index = populateRebateWalletList(
            rebateWallets,
            rebatePercentBps,
            tData.tokenToEth,
            index,
            tData.feePayingReservesBps
        );
    }

    function populateRebateWalletList(
        address[] memory rebateWallets,
        uint[] memory rebatePercentBps,
        TradingReserves memory resList,
        uint index,
        uint feePayingReservesBps
    ) internal view returns(uint) {
        uint _index = index;

        for(uint i = 0; i < resList.isFeePaying.length; i++) {
            if (resList.isFeePaying[i]) {
                rebateWallets[_index] = reserveRebateWallet[address(resList.addresses[i])];
                rebatePercentBps[_index] = resList.splitValuesBps[i] * BPS / feePayingReservesBps;
                _index++;
            }
        }
        return _index;
    }

    function calcTradeSrcAmount(uint srcDecimals, uint destDecimals, uint destAmount, uint[] memory rates,
                                uint[] memory splitValuesBps)
        internal pure returns (uint srcAmount)
    {
        uint destAmountSoFar;

        for (uint i = 0; i < rates.length; i++) {
            uint destAmountSplit = i == (splitValuesBps.length - 1) ?
                (destAmount - destAmountSoFar) : splitValuesBps[i] * destAmount / BPS;
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
                tData.ethToToken.rates, tData.ethToToken.splitValuesBps);
        } else {
            weiAfterFees = tData.input.maxDestAmount;
        }

        //reverse calculation, because we are working backwards
        tData.tradeWei = weiAfterFees * BPS * BPS /
            ((BPS * BPS) - tData.networkFeeBps * tData.feePayingReservesBps - tData.input.platformFeeBps * BPS);
        //recalculate network and platform fees based on tradeWei
        tData.networkFeeWei = tData.tradeWei * tData.networkFeeBps / BPS * tData.feePayingReservesBps / BPS;
        tData.platformFeeWei = tData.tradeWei * tData.input.platformFeeBps / BPS;

        if (tData.input.src != ETH_TOKEN_ADDRESS) {
            actualSrcAmount = calcTradeSrcAmount(tData.tokenToEth.decimals, ETH_DECIMALS, tData.tradeWei,
                tData.tokenToEth.rates, tData.tokenToEth.splitValuesBps);
        } else {
            actualSrcAmount = tData.tradeWei;
        }

        require(actualSrcAmount <= tData.input.srcAmount, "actualSrcAmt > given srcAmt");
    }

    event KyberTrade(address indexed trader, IERC20 src, IERC20 dest, uint srcAmount, uint dstAmount,
        address destAddress, uint ethWeiValue, uint networkFeeWei, uint customPlatformFeeWei,
        bytes8[] t2eIds, bytes8[] e2tIds, bytes hint);

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

        calcRatesAndAmounts(tData.input.src, tData.input.dest, tData.input.srcAmount, tData, hint);

        require(tData.rateOnlyNetworkFee > 0, "0 rate");
        require(tData.rateOnlyNetworkFee < MAX_RATE, "rate > MAX_RATE");
        require(tData.rateOnlyNetworkFee >= tData.input.minConversionRate, "rate < minConvRate");

        if (gasHelper != IGasHelper(0)) {
            (bool success, ) = address(gasHelper).call(
                abi.encodeWithSignature(
                    "freeGas(address,address,address,uint256,bytes8[],bytes8[])",
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

        if (tData.actualDestAmount > tData.input.maxDestAmount) {
            // notice tData passed by reference and updated
            tData.actualDestAmount = tData.input.maxDestAmount;
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
                tData.actualDestAmount));

        require(handleFees(tData));

        emit KyberTrade({
            trader: tData.input.trader,
            src: tData.input.src,
            dest: tData.input.dest,
            srcAmount: actualSrcAmount,
            dstAmount: tData.actualDestAmount,
            destAddress: tData.input.destAddress,
            ethWeiValue: tData.tradeWei,
            networkFeeWei: tData.networkFeeWei,
            customPlatformFeeWei: tData.platformFeeWei,
            t2eIds: tData.tokenToEth.ids,
            e2tIds: tData.ethToToken.ids,
            hint: hint
        });

        return (tData.actualDestAmount);
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

        TradingReserves memory reservesData = src == ETH_TOKEN_ADDRESS? tData.ethToToken : tData.tokenToEth;
        uint callValue;
        uint srcAmountSoFar;

        for(uint i = 0; i < reservesData.addresses.length; i++) {
            uint splitAmount = i == (reservesData.splitValuesBps.length - 1) ? (amount - srcAmountSoFar) :
                reservesData.splitValuesBps[i] * amount / BPS;
            srcAmountSoFar += splitAmount;
            callValue = (src == ETH_TOKEN_ADDRESS)? splitAmount : 0;

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
        require(isEnabled, "!network");
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
            require(msg.value == 0, "big Eth qty");
            //funds should have been moved to this contract already.
            require(input.src.balanceOf(address(this)) >= input.srcAmount, "srcTok low");
        }

        return true;
    }

    /// @notice Gets the network fee from the DAO (or use default). View function for getExpectedRate.
    function getNetworkFee() internal view returns(uint networkFeeBps) {
        uint expiryBlock;
        (networkFeeBps, expiryBlock) = readNetworkFeeData();

        if (expiryBlock < block.number && kyberDAO.length > 0) {
            (networkFeeBps, expiryBlock) = kyberDAO[0].getLatestNetworkFeeData();
        }
    }

    /// @notice Gets network fee from the DAO (or use default).
    /// For trade function, so that data can be updated and cached.
    /// @dev Note that this function can be triggered by anyone, so that
    /// the first trader of a new epoch can avoid incurring extra gas costs
    function getAndUpdateNetworkFee() public returns(uint networkFeeBps) {
        uint expiryBlock;

        (networkFeeBps, expiryBlock) = readNetworkFeeData();

        if (expiryBlock < block.number && kyberDAO.length > 0) {
            (networkFeeBps, expiryBlock) = kyberDAO[0].getLatestNetworkFeeDataWithCache();
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
        require(2 * feeBps < BPS, "fees exceed BPS");

        networkFeeData.expiryBlock = uint64(expiryBlock);
        networkFeeData.feeBps = uint16(feeBps);
    }
}
