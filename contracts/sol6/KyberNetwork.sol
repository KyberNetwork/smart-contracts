pragma solidity 0.6.6;

import "./utils/WithdrawableNoModifiers.sol";
import "./utils/Utils5.sol";
import "./utils/zeppelin/ReentrancyGuard.sol";
import "./utils/zeppelin/SafeERC20.sol";
import "./INimbleNetwork.sol";
import "./INimbleReserve.sol";
import "./INimbleFeeHandler.sol";
import "./INimbleDao.sol";
import "./INimbleMatchingEngine.sol";
import "./INimbleStorage.sol";
import "./IGasHelper.sol";


/**
 *   @title NimbleNetwork main contract
 *   Interacts with contracts:
 *       NimbleDao: to retrieve fee data
 *       NimbleFeeHandler: accumulates and distributes trade fees
 *       NimbleMatchingEngine: parse user hint and run reserve matching algorithm
 *       NimbleStorage: store / access reserves, token listings and contract addresses
 *       NimbleReserve(s): query rate and trade
 */
contract NimbleNetwork is WithdrawableNoModifiers, Utils5, INimbleNetwork, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct NetworkFeeData {
        uint64 expiryTimestamp;
        uint16 feeBps;
    }

    /// @notice Stores work data for reserves (either for token -> eth, or eth -> token)
    /// @dev Variables are in-place, ie. reserve with addresses[i] has id of ids[i], offers rate of rates[i], etc.
    /// @param addresses List of reserve addresses selected for the trade
    /// @param ids List of reserve ids, to be used for NimbleTrade event
    /// @param rates List of rates that were offered by the reserves
    /// @param isFeeAccountedFlags List of reserves requiring users to pay network fee
    /// @param isEntitledRebateFlags List of reserves eligible for rebates
    /// @param splitsBps List of proportions of trade amount allocated to the reserves.
    ///     If there is only 1 reserve, then it should have a value of 10000 bps
    /// @param srcAmounts Source amount per reserve.
    /// @param decimals Token decimals. Src decimals when for src -> eth, dest decimals when eth -> dest
    struct ReservesData {
        INimbleReserve[] addresses;
        bytes32[] ids;
        uint256[] rates;
        bool[] isFeeAccountedFlags;
        bool[] isEntitledRebateFlags;
        uint256[] splitsBps;
        uint256[] srcAmounts;
        uint256 decimals;
    }

    /// @notice Main trade data structure, is initialised and used for the entire trade flow
    /// @param input Initialised when initTradeInput is called. Stores basic trade info
    /// @param tokenToEth Stores information about reserves that were selected for src -> eth side of trade
    /// @param ethToToken Stores information about reserves that were selected for eth -> dest side of trade
    /// @param tradeWei Trade amount in ether wei, before deducting fees.
    /// @param networkFeeWei Network fee in ether wei. For t2t trades, it can go up to 200% of networkFeeBps
    /// @param platformFeeWei Platform fee in ether wei
    /// @param networkFeeBps Network fee bps determined by NimbleDao, or default value
    /// @param numEntitledRebateReserves No. of reserves that are eligible for rebates
    /// @param feeAccountedBps Proportion of this trade that fee is accounted to, in BPS. Up to 2 * BPS
    struct TradeData {
        TradeInput input;
        ReservesData tokenToEth;
        ReservesData ethToToken;
        uint256 tradeWei;
        uint256 networkFeeWei;
        uint256 platformFeeWei;
        uint256 networkFeeBps;
        uint256 numEntitledRebateReserves;
        uint256 feeAccountedBps; // what part of this trade is fee paying. for token -> token - up to 200%
    }

    struct TradeInput {
        address payable trader;
        IERC20 src;
        uint256 srcAmount;
        IERC20 dest;
        address payable destAddress;
        uint256 maxDestAmount;
        uint256 minConversionRate;
        address platformWallet;
        uint256 platformFeeBps;
    }

    uint256 internal constant PERM_HINT_GET_RATE = 1 << 255; // for backwards compatibility
    uint256 internal constant DEFAULT_NETWORK_FEE_BPS = 25; // till we read value from NimbleDao
    uint256 internal constant MAX_APPROVED_PROXIES = 2; // limit number of proxies that can trade here

    INimbleFeeHandler internal NimbleFeeHandler;
    INimbleDao internal NimbleDao;
    INimbleMatchingEngine internal NimbleMatchingEngine;
    INimbleStorage internal NimbleStorage;
    IGasHelper internal gasHelper;

    NetworkFeeData internal networkFeeData; // data is feeBps and expiry timestamp
    uint256 internal maxGasPriceValue = 50 * 1000 * 1000 * 1000; // 50 gwei
    bool internal isEnabled = false; // is network enabled

    mapping(address => bool) internal NimbleProxyContracts;

    event EtherReceival(address indexed sender, uint256 amount);
    event NimbleFeeHandlerUpdated(INimbleFeeHandler newNimbleFeeHandler);
    event NimbleMatchingEngineUpdated(INimbleMatchingEngine newNimbleMatchingEngine);
    event GasHelperUpdated(IGasHelper newGasHelper);
    event NimbleDaoUpdated(INimbleDao newNimbleDao);
    event NimbleNetworkParamsSet(uint256 maxGasPrice, uint256 negligibleRateDiffBps);
    event NimbleNetworkSetEnable(bool isEnabled);
    event NimbleProxyAdded(address NimbleProxy);
    event NimbleProxyRemoved(address NimbleProxy);

    event ListedReservesForToken(
        IERC20 indexed token,
        address[] reserves,
        bool add
    );

    constructor(address _admin, INimbleStorage _NimbleStorage)
        public
        WithdrawableNoModifiers(_admin)
    {
        updateNetworkFee(now, DEFAULT_NETWORK_FEE_BPS);
        NimbleStorage = _NimbleStorage;
    }

    receive() external payable {
        emit EtherReceival(msg.sender, msg.value);
    }

    /// @notice Backward compatible function
    /// @notice Use token address ETH_TOKEN_ADDRESS for ether
    /// @dev Trade from src to dest token and sends dest token to destAddress
    /// @param trader Address of the taker side of this trade
    /// @param src Source token
    /// @param srcAmount Amount of src tokens in twei
    /// @param dest Destination token
    /// @param destAddress Address to send tokens to
    /// @param maxDestAmount A limit on the amount of dest tokens in twei
    /// @param minConversionRate The minimal conversion rate. If actual rate is lower, trade reverts
    /// @param walletId Platform wallet address for receiving fees
    /// @param hint Advanced instructions for running the trade 
    /// @return destAmount Amount of actual dest tokens in twei
    function tradeWithHint(
        address payable trader,
        ERC20 src,
        uint256 srcAmount,
        ERC20 dest,
        address payable destAddress,
        uint256 maxDestAmount,
        uint256 minConversionRate,
        address payable walletId,
        bytes calldata hint
    ) external payable returns (uint256 destAmount) {
        TradeData memory tradeData = initTradeInput({
            trader: trader,
            src: src,
            dest: dest,
            srcAmount: srcAmount,
            destAddress: destAddress,
            maxDestAmount: maxDestAmount,
            minConversionRate: minConversionRate,
            platformWallet: walletId,
            platformFeeBps: 0
        });

        return trade(tradeData, hint);
    }

    /// @notice Use token address ETH_TOKEN_ADDRESS for ether
    /// @dev Trade from src to dest token and sends dest token to destAddress
    /// @param trader Address of the taker side of this trade
    /// @param src Source token
    /// @param srcAmount Amount of src tokens in twei
    /// @param dest Destination token
    /// @param destAddress Address to send tokens to
    /// @param maxDestAmount A limit on the amount of dest tokens in twei
    /// @param minConversionRate The minimal conversion rate. If actual rate is lower, trade reverts
    /// @param platformWallet Platform wallet address for receiving fees
    /// @param platformFeeBps Part of the trade that is allocated as fee to platform wallet. Ex: 1000 = 10%
    /// @param hint Advanced instructions for running the trade 
    /// @return destAmount Amount of actual dest tokens in twei
    function tradeWithHintAndFee(
        address payable trader,
        IERC20 src,
        uint256 srcAmount,
        IERC20 dest,
        address payable destAddress,
        uint256 maxDestAmount,
        uint256 minConversionRate,
        address payable platformWallet,
        uint256 platformFeeBps,
        bytes calldata hint
    ) external payable override returns (uint256 destAmount) {
        TradeData memory tradeData = initTradeInput({
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

        return trade(tradeData, hint);
    }

    /// @notice Can be called only by NimbleStorage
    /// @dev Allow or prevent to trade token -> eth for a reserve
    /// @param reserve The reserve address
    /// @param token Token address
    /// @param add If true, then give reserve token allowance, otherwise set zero allowance
    function listTokenForReserve(
        address reserve,
        IERC20 token,
        bool add
    ) external override {
        require(msg.sender == address(NimbleStorage), "only NimbleStorage");

        if (add) {
            token.safeApprove(reserve, MAX_ALLOWANCE);
            setDecimals(token);
        } else {
            token.safeApprove(reserve, 0);
        }
    }

    /// @notice Can be called only by operator
    /// @dev Allow or prevent to trade token -> eth for list of reserves
    ///      Useful for migration to new network contract
    ///      Call storage to get list of reserves supporting token -> eth
    /// @param token Token address
    /// @param startIndex start index in reserves list
    /// @param endIndex end index in reserves list (can be larger)
    /// @param add If true, then give reserve token allowance, otherwise set zero allowance
    function listReservesForToken(
        IERC20 token,
        uint256 startIndex,
        uint256 endIndex,
        bool add
    ) external {
        onlyOperator();

        if (startIndex > endIndex) {
            // no need to do anything
            return;
        }

        address[] memory reserves = NimbleStorage.getReserveAddressesPerTokenSrc(
            token, startIndex, endIndex
        );

        if (reserves.length == 0) {
            // no need to do anything
            return;
        }

        for(uint i = 0; i < reserves.length; i++) {
            if (add) {
                token.safeApprove(reserves[i], MAX_ALLOWANCE);
                setDecimals(token);
            } else {
                token.safeApprove(reserves[i], 0);
            }
        }

        emit ListedReservesForToken(token, reserves, add);
    }

    function setContracts(
        INimbleFeeHandler _NimbleFeeHandler,
        INimbleMatchingEngine _NimbleMatchingEngine,
        IGasHelper _gasHelper
    ) external virtual {
        onlyAdmin();

        if (NimbleFeeHandler != _NimbleFeeHandler) {
            NimbleFeeHandler = _NimbleFeeHandler;
            emit NimbleFeeHandlerUpdated(_NimbleFeeHandler);
        }

        if (NimbleMatchingEngine != _NimbleMatchingEngine) {
            NimbleMatchingEngine = _NimbleMatchingEngine;
            emit NimbleMatchingEngineUpdated(_NimbleMatchingEngine);
        }

        if ((_gasHelper != IGasHelper(0)) && (_gasHelper != gasHelper)) {
            gasHelper = _gasHelper;
            emit GasHelperUpdated(_gasHelper);
        }

        NimbleStorage.setContracts(address(_NimbleFeeHandler), address(_NimbleMatchingEngine));
        require(_NimbleFeeHandler != INimbleFeeHandler(0));
        require(_NimbleMatchingEngine != INimbleMatchingEngine(0));
    }

    function setNimbleDaoContract(INimbleDao _NimbleDao) external {
        // enable setting null NimbleDao address
        onlyAdmin();
        if (NimbleDao != _NimbleDao) {
            NimbleDao = _NimbleDao;
            NimbleStorage.setNimbleDaoContract(address(_NimbleDao));
            emit NimbleDaoUpdated(_NimbleDao);
        }
    }

    function setParams(uint256 _maxGasPrice, uint256 _negligibleRateDiffBps) external {
        onlyAdmin();
        maxGasPriceValue = _maxGasPrice;
        NimbleMatchingEngine.setNegligibleRateDiffBps(_negligibleRateDiffBps);
        emit NimbleNetworkParamsSet(maxGasPriceValue, _negligibleRateDiffBps);
    }

    function setEnable(bool enable) external {
        onlyAdmin();

        if (enable) {
            require(NimbleFeeHandler != INimbleFeeHandler(0));
            require(NimbleMatchingEngine != INimbleMatchingEngine(0));
            require(NimbleStorage.isNimbleProxyAdded());
        }

        isEnabled = enable;

        emit NimbleNetworkSetEnable(isEnabled);
    }

    /// @dev No. of NimbleProxies is capped
    function addNimbleProxy(address NimbleProxy) external virtual {
        onlyAdmin();
        NimbleStorage.addNimbleProxy(NimbleProxy, MAX_APPROVED_PROXIES);
        require(NimbleProxy != address(0));
        require(!NimbleProxyContracts[NimbleProxy]);

        NimbleProxyContracts[NimbleProxy] = true;

        emit NimbleProxyAdded(NimbleProxy);
    }

    function removeNimbleProxy(address NimbleProxy) external virtual {
        onlyAdmin();

        NimbleStorage.removeNimbleProxy(NimbleProxy);

        require(NimbleProxyContracts[NimbleProxy]);

        NimbleProxyContracts[NimbleProxy] = false;

        emit NimbleProxyRemoved(NimbleProxy);
    }

    /// @dev gets the expected rates when trading src -> dest token, with / without fees
    /// @param src Source token
    /// @param dest Destination token
    /// @param srcQty Amount of src tokens in twei
    /// @param platformFeeBps Part of the trade that is allocated as fee to platform wallet. Ex: 1000 = 10%
    /// @param hint Advanced instructions for running the trade 
    /// @return rateWithNetworkFee Rate after deducting network fee but excluding platform fee
    /// @return rateWithAllFees = actual rate. Rate after accounting for both network and platform fees
    function getExpectedRateWithHintAndFee(
        IERC20 src,
        IERC20 dest,
        uint256 srcQty,
        uint256 platformFeeBps,
        bytes calldata hint
    )
        external
        view
        override
        returns (
            uint256 rateWithNetworkFee,
            uint256 rateWithAllFees
        )
    {
        if (src == dest) return (0, 0);

        TradeData memory tradeData = initTradeInput({
            trader: payable(address(0)),
            src: src,
            dest: dest,
            srcAmount: (srcQty == 0) ? 1 : srcQty,
            destAddress: payable(address(0)),
            maxDestAmount: 2**255,
            minConversionRate: 0,
            platformWallet: payable(address(0)),
            platformFeeBps: platformFeeBps
        });

        tradeData.networkFeeBps = getNetworkFee();

        uint256 destAmount;
        (destAmount, rateWithNetworkFee) = calcRatesAndAmounts(tradeData, hint);

        rateWithAllFees = calcRateFromQty(
            tradeData.input.srcAmount,
            destAmount,
            tradeData.tokenToEth.decimals,
            tradeData.ethToToken.decimals
        );
    }

    /// @notice Backward compatible API
    /// @dev Gets the expected and slippage rate for exchanging src -> dest token
    /// @dev worstRate is hardcoded to be 3% lower of expectedRate
    /// @param src Source token
    /// @param dest Destination token
    /// @param srcQty Amount of src tokens in twei
    /// @return expectedRate for a trade after deducting network fee. 
    /// @return worstRate for a trade. Calculated to be expectedRate * 97 / 100
    function getExpectedRate(
        ERC20 src,
        ERC20 dest,
        uint256 srcQty
    ) external view returns (uint256 expectedRate, uint256 worstRate) {
        if (src == dest) return (0, 0);
        uint256 qty = srcQty & ~PERM_HINT_GET_RATE;

        TradeData memory tradeData = initTradeInput({
            trader: payable(address(0)),
            src: src,
            dest: dest,
            srcAmount: (qty == 0) ? 1 : qty,
            destAddress: payable(address(0)),
            maxDestAmount: 2**255,
            minConversionRate: 0,
            platformWallet: payable(address(0)),
            platformFeeBps: 0
        });

        tradeData.networkFeeBps = getNetworkFee();

        (, expectedRate) = calcRatesAndAmounts(tradeData, "");

        worstRate = (expectedRate * 97) / 100; // backward compatible formula
    }

    /// @notice Returns some data about the network
    /// @param negligibleDiffBps Negligible rate difference (in basis pts) when searching best rate
    /// @param networkFeeBps Network fees to be charged (in basis pts)
    /// @param expiryTimestamp Timestamp for which networkFeeBps will expire,
    ///     and needs to be updated by calling NimbleDao contract / set to default
    function getNetworkData()
        external
        view
        override
        returns (
            uint256 negligibleDiffBps,
            uint256 networkFeeBps,
            uint256 expiryTimestamp
        )
    {
        (networkFeeBps, expiryTimestamp) = readNetworkFeeData();
        negligibleDiffBps = NimbleMatchingEngine.getNegligibleRateDiffBps();
        return (negligibleDiffBps, networkFeeBps, expiryTimestamp);
    }

    function getContracts()
        external
        view
        returns (
            INimbleFeeHandler NimbleFeeHandlerAddress,
            INimbleDao NimbleDaoAddress,
            INimbleMatchingEngine NimbleMatchingEngineAddress,
            INimbleStorage NimbleStorageAddress,
            IGasHelper gasHelperAddress,
            INimbleNetworkProxy[] memory NimbleProxyAddresses
        )
    {
        return (
            NimbleFeeHandler,
            NimbleDao,
            NimbleMatchingEngine,
            NimbleStorage,
            gasHelper,
            NimbleStorage.getNimbleProxies()
        );
    }

    /// @notice returns the max gas price allowable for trades
    function maxGasPrice() external view override returns (uint256) {
        return maxGasPriceValue;
    }

    /// @notice returns status of the network. If disabled, trades cannot happen.
    function enabled() external view override returns (bool) {
        return isEnabled;
    }

    /// @notice Gets network fee from the NimbleDao (or use default).
    ///     For trade function, so that data can be updated and cached.
    /// @dev Note that this function can be triggered by anyone, so that
    ///     the first trader of a new epoch can avoid incurring extra gas costs
    function getAndUpdateNetworkFee() public returns (uint256 networkFeeBps) {
        uint256 expiryTimestamp;

        (networkFeeBps, expiryTimestamp) = readNetworkFeeData();

        if (expiryTimestamp < now && NimbleDao != INimbleDao(0)) {
            (networkFeeBps, expiryTimestamp) = NimbleDao.getLatestNetworkFeeDataWithCache();
            updateNetworkFee(expiryTimestamp, networkFeeBps);
        }
    }

    /// @notice Calculates platform fee and reserve rebate percentages for the trade.
    ///     Transfers eth and rebate wallet data to NimbleFeeHandler
    function handleFees(TradeData memory tradeData) internal {
        uint256 sentFee = tradeData.networkFeeWei + tradeData.platformFeeWei;
        //no need to handle fees if total fee is zero
        if (sentFee == 0)
            return;

        // update reserve eligibility and rebate percentages
        (
            address[] memory rebateWallets,
            uint256[] memory rebatePercentBps
        ) = calculateRebates(tradeData);

        // send total fee amount to fee handler with reserve data
        NimbleFeeHandler.handleFees{value: sentFee}(
            ETH_TOKEN_ADDRESS,
            rebateWallets,
            rebatePercentBps,
            tradeData.input.platformWallet,
            tradeData.platformFeeWei,
            tradeData.networkFeeWei
        );
    }

    function updateNetworkFee(uint256 expiryTimestamp, uint256 feeBps) internal {
        require(expiryTimestamp < 2**64, "expiry overflow");
        require(feeBps < BPS / 2, "fees exceed BPS");

        networkFeeData.expiryTimestamp = uint64(expiryTimestamp);
        networkFeeData.feeBps = uint16(feeBps);
    }

    /// @notice Use token address ETH_TOKEN_ADDRESS for ether
    /// @dev Do one trade with each reserve in reservesData, verifying network balance 
    ///    as expected to ensure reserves take correct src amount
    /// @param src Source token
    /// @param dest Destination token
    /// @param destAddress Address to send tokens to
    /// @param reservesData reservesData to trade
    /// @param expectedDestAmount Amount to be transferred to destAddress
    /// @param srcDecimals Decimals of source token
    /// @param destDecimals Decimals of destination token
    function doReserveTrades(
        IERC20 src,
        IERC20 dest,
        address payable destAddress,
        ReservesData memory reservesData,
        uint256 expectedDestAmount,
        uint256 srcDecimals,
        uint256 destDecimals
    ) internal virtual {

        if (src == dest) {
            // eth -> eth, need not do anything except for token -> eth: transfer eth to destAddress
            if (destAddress != (address(this))) {
                (bool success, ) = destAddress.call{value: expectedDestAmount}("");
                require(success, "send dest qty failed");
            }
            return;
        }

        tradeAndVerifyNetworkBalance(
            reservesData,
            src,
            dest,
            srcDecimals,
            destDecimals
        );

        if (destAddress != address(this)) {
            // for eth -> token / token -> token, transfer tokens to destAddress
            dest.safeTransfer(destAddress, expectedDestAmount);
        }
    }

    /// @dev call trade from reserves and verify balances
    /// @param reservesData reservesData to trade
    /// @param src Source token of trade
    /// @param dest Destination token of trade
    /// @param srcDecimals Decimals of source token
    /// @param destDecimals Decimals of destination token
    function tradeAndVerifyNetworkBalance(
        ReservesData memory reservesData,
        IERC20 src,
        IERC20 dest,
        uint256 srcDecimals,
        uint256 destDecimals
    ) internal
    {
        // only need to verify src balance if src is not eth
        uint256 srcBalanceBefore = (src == ETH_TOKEN_ADDRESS) ? 0 : getBalance(src, address(this));
        uint256 destBalanceBefore = getBalance(dest, address(this));

        for(uint256 i = 0; i < reservesData.addresses.length; i++) {
            uint256 callValue = (src == ETH_TOKEN_ADDRESS) ? reservesData.srcAmounts[i] : 0;
            require(
                reservesData.addresses[i].trade{value: callValue}(
                    src,
                    reservesData.srcAmounts[i],
                    dest,
                    address(this),
                    reservesData.rates[i],
                    true
                ),
                "reserve trade failed"
            );

            uint256 balanceAfter;
            if (src != ETH_TOKEN_ADDRESS) {
                // verify src balance only if it is not eth
                balanceAfter = getBalance(src, address(this));
                // verify correct src amount is taken
                if (srcBalanceBefore >= balanceAfter && srcBalanceBefore - balanceAfter > reservesData.srcAmounts[i]) {
                    revert("reserve takes high amount");
                }
                srcBalanceBefore = balanceAfter;
            }

            // verify correct dest amount is received
            uint256 expectedDestAmount = calcDstQty(
                reservesData.srcAmounts[i],
                srcDecimals,
                destDecimals,
                reservesData.rates[i]
            );
            balanceAfter = getBalance(dest, address(this));
            if (balanceAfter < destBalanceBefore || balanceAfter - destBalanceBefore < expectedDestAmount) {
                revert("reserve returns low amount");
            }
            destBalanceBefore = balanceAfter;
        }
    }

    /// @notice Use token address ETH_TOKEN_ADDRESS for ether
    /// @dev Trade API for NimbleNetwork
    /// @param tradeData Main trade data object for trade info to be stored
    function trade(TradeData memory tradeData, bytes memory hint)
        internal
        virtual
        nonReentrant
        returns (uint256 destAmount)
    {
        tradeData.networkFeeBps = getAndUpdateNetworkFee();

        validateTradeInput(tradeData.input);

        uint256 rateWithNetworkFee;
        (destAmount, rateWithNetworkFee) = calcRatesAndAmounts(tradeData, hint);

        require(rateWithNetworkFee > 0, "trade invalid, if hint involved, try parseHint API");
        require(rateWithNetworkFee < MAX_RATE, "rate > MAX_RATE");
        require(rateWithNetworkFee >= tradeData.input.minConversionRate, "rate < min rate");

        uint256 actualSrcAmount;

        if (destAmount > tradeData.input.maxDestAmount) {
            // notice tradeData passed by reference and updated
            destAmount = tradeData.input.maxDestAmount;
            actualSrcAmount = calcTradeSrcAmountFromDest(tradeData);
        } else {
            actualSrcAmount = tradeData.input.srcAmount;
        }

        // token -> eth
        doReserveTrades(
            tradeData.input.src,
            ETH_TOKEN_ADDRESS,
            address(this),
            tradeData.tokenToEth,
            tradeData.tradeWei,
            tradeData.tokenToEth.decimals,
            ETH_DECIMALS
        );

        // eth -> token
        doReserveTrades(
            ETH_TOKEN_ADDRESS,
            tradeData.input.dest,
            tradeData.input.destAddress,
            tradeData.ethToToken,
            destAmount,
            ETH_DECIMALS,
            tradeData.ethToToken.decimals
        );

        handleChange(
            tradeData.input.src,
            tradeData.input.srcAmount,
            actualSrcAmount,
            tradeData.input.trader
        );

        handleFees(tradeData);

        emit NimbleTrade({
            src: tradeData.input.src,
            dest: tradeData.input.dest,
            ethWeiValue: tradeData.tradeWei,
            networkFeeWei: tradeData.networkFeeWei,
            customPlatformFeeWei: tradeData.platformFeeWei,
            t2eIds: tradeData.tokenToEth.ids,
            e2tIds: tradeData.ethToToken.ids,
            t2eSrcAmounts: tradeData.tokenToEth.srcAmounts,
            e2tSrcAmounts: tradeData.ethToToken.srcAmounts,
            t2eRates: tradeData.tokenToEth.rates,
            e2tRates: tradeData.ethToToken.rates
        });

        if (gasHelper != IGasHelper(0)) {
            (bool success, ) = address(gasHelper).call(
                abi.encodeWithSignature(
                    "freeGas(address,address,address,uint256,bytes32[],bytes32[])",
                    tradeData.input.platformWallet,
                    tradeData.input.src,
                    tradeData.input.dest,
                    tradeData.tradeWei,
                    tradeData.tokenToEth.ids,
                    tradeData.ethToToken.ids
                )
            );
            // remove compilation warning
            success;
        }

        return (destAmount);
    }

    /// @notice If user maxDestAmount < actual dest amount, actualSrcAmount will be < srcAmount
    /// Calculate the change, and send it back to the user
    function handleChange(
        IERC20 src,
        uint256 srcAmount,
        uint256 requiredSrcAmount,
        address payable trader
    ) internal {
        if (requiredSrcAmount < srcAmount) {
            // if there is "change" send back to trader
            if (src == ETH_TOKEN_ADDRESS) {
                (bool success, ) = trader.call{value: (srcAmount - requiredSrcAmount)}("");
                require(success, "Send change failed");
            } else {
                src.safeTransfer(trader, (srcAmount - requiredSrcAmount));
            }
        }
    }

    function initTradeInput(
        address payable trader,
        IERC20 src,
        IERC20 dest,
        uint256 srcAmount,
        address payable destAddress,
        uint256 maxDestAmount,
        uint256 minConversionRate,
        address payable platformWallet,
        uint256 platformFeeBps
    ) internal view returns (TradeData memory tradeData) {
        tradeData.input.trader = trader;
        tradeData.input.src = src;
        tradeData.input.srcAmount = srcAmount;
        tradeData.input.dest = dest;
        tradeData.input.destAddress = destAddress;
        tradeData.input.maxDestAmount = maxDestAmount;
        tradeData.input.minConversionRate = minConversionRate;
        tradeData.input.platformWallet = platformWallet;
        tradeData.input.platformFeeBps = platformFeeBps;

        tradeData.tokenToEth.decimals = getDecimals(src);
        tradeData.ethToToken.decimals = getDecimals(dest);
    }

    /// @notice This function does all calculations to find trade dest amount without accounting 
    ///        for maxDestAmount. Part of this process includes:
    ///        - Call NimbleMatchingEngine to parse hint and get an optional reserve list to trade.
    ///        - Query reserve rates and call NimbleMatchingEngine to use best reserve.
    ///        - Calculate trade values and fee values.
    ///     This function should set all TradeData information so that it can be later used without 
    ///         any ambiguity
    /// @param tradeData Main trade data object for trade info to be stored
    /// @param hint Advanced user instructions for the trade 
    function calcRatesAndAmounts(TradeData memory tradeData, bytes memory hint)
        internal
        view
        returns (uint256 destAmount, uint256 rateWithNetworkFee)
    {
        validateFeeInput(tradeData.input, tradeData.networkFeeBps);

        // token -> eth: find best reserves match and calculate wei amount
        tradeData.tradeWei = calcDestQtyAndMatchReserves(
            tradeData.input.src,
            ETH_TOKEN_ADDRESS,
            tradeData.input.srcAmount,
            tradeData,
            tradeData.tokenToEth,
            hint
        );

        require(tradeData.tradeWei <= MAX_QTY, "Trade wei > MAX_QTY");
        if (tradeData.tradeWei == 0) {
            return (0, 0);
        }

        // calculate fees
        tradeData.platformFeeWei = (tradeData.tradeWei * tradeData.input.platformFeeBps) / BPS;
        tradeData.networkFeeWei =
            (((tradeData.tradeWei * tradeData.networkFeeBps) / BPS) * tradeData.feeAccountedBps) /
            BPS;

        assert(tradeData.tradeWei >= (tradeData.networkFeeWei + tradeData.platformFeeWei));

        // eth -> token: find best reserves match and calculate trade dest amount
        uint256 actualSrcWei = tradeData.tradeWei -
            tradeData.networkFeeWei -
            tradeData.platformFeeWei;

        destAmount = calcDestQtyAndMatchReserves(
            ETH_TOKEN_ADDRESS,
            tradeData.input.dest,
            actualSrcWei,
            tradeData,
            tradeData.ethToToken,
            hint
        );

        tradeData.networkFeeWei =
            (((tradeData.tradeWei * tradeData.networkFeeBps) / BPS) * tradeData.feeAccountedBps) /
            BPS;

        rateWithNetworkFee = calcRateFromQty(
            tradeData.input.srcAmount * (BPS - tradeData.input.platformFeeBps) / BPS,
            destAmount,
            tradeData.tokenToEth.decimals,
            tradeData.ethToToken.decimals
        );
    }

    /// @notice Get trading reserves, source amounts, and calculate dest qty
    /// Store information into tradeData
    function calcDestQtyAndMatchReserves(
        IERC20 src,
        IERC20 dest,
        uint256 srcAmount,
        TradeData memory tradeData,
        ReservesData memory reservesData,
        bytes memory hint
    ) internal view returns (uint256 destAmount) {
        if (src == dest) {
            return srcAmount;
        }

        INimbleMatchingEngine.ProcessWithRate processWithRate;

        // get reserve list from NimbleMatchingEngine
        (reservesData.ids, reservesData.splitsBps, processWithRate) =
            NimbleMatchingEngine.getTradingReserves(
            src,
            dest,
            (tradeData.input.src != ETH_TOKEN_ADDRESS) && (tradeData.input.dest != ETH_TOKEN_ADDRESS),
            hint
        );
        bool areAllReservesListed;
        (areAllReservesListed, reservesData.isFeeAccountedFlags, reservesData.isEntitledRebateFlags, reservesData.addresses)
            = NimbleStorage.getReservesData(reservesData.ids, src, dest);

        if(!areAllReservesListed) {
            return 0;
        }

        require(reservesData.ids.length == reservesData.splitsBps.length, "bad split array");
        require(reservesData.ids.length == reservesData.isFeeAccountedFlags.length, "bad fee array");
        require(reservesData.ids.length == reservesData.isEntitledRebateFlags.length, "bad rebate array");
        require(reservesData.ids.length == reservesData.addresses.length, "bad addresses array");

        // calculate src trade amount per reserve and query rates
        // set data in reservesData struct
        uint256[] memory feesAccountedDestBps = calcSrcAmountsAndGetRates(
            reservesData,
            src,
            dest,
            srcAmount,
            tradeData
        );

        // if matching engine requires processing with rate data. call doMatch and update reserve list
        if (processWithRate == INimbleMatchingEngine.ProcessWithRate.Required) {
            uint256[] memory selectedIndexes = NimbleMatchingEngine.doMatch(
                src,
                dest,
                reservesData.srcAmounts,
                feesAccountedDestBps,
                reservesData.rates
            );

            updateReservesList(reservesData, selectedIndexes);
        }

        // calculate dest amount and fee paying data of this part (t2e or e2t)
        destAmount = validateTradeCalcDestQtyAndFeeData(src, reservesData, tradeData);
    }

    /// @notice Calculates source amounts per reserve. Does get rate call
    function calcSrcAmountsAndGetRates(
        ReservesData memory reservesData,
        IERC20 src,
        IERC20 dest,
        uint256 srcAmount,
        TradeData memory tradeData
    ) internal view returns (uint256[] memory feesAccountedDestBps) {
        uint256 numReserves = reservesData.ids.length;
        uint256 srcAmountAfterFee;
        uint256 destAmountFeeBps;

        if (src == ETH_TOKEN_ADDRESS) {
            // @notice srcAmount is after deducting fees from tradeWei
            // @notice using tradeWei to calculate fee so eth -> token symmetric to token -> eth
            srcAmountAfterFee = srcAmount - 
                (tradeData.tradeWei * tradeData.networkFeeBps / BPS);
        } else { 
            srcAmountAfterFee = srcAmount;
            destAmountFeeBps = tradeData.networkFeeBps;
        }

        reservesData.srcAmounts = new uint256[](numReserves);
        reservesData.rates = new uint256[](numReserves);
        feesAccountedDestBps = new uint256[](numReserves);

        // iterate reserve list. validate data. calculate srcAmount according to splits and fee data.
        for (uint256 i = 0; i < numReserves; i++) {
            require(
                reservesData.splitsBps[i] > 0 && reservesData.splitsBps[i] <= BPS,
                "invalid split bps"
            );

            if (reservesData.isFeeAccountedFlags[i]) {
                reservesData.srcAmounts[i] = srcAmountAfterFee * reservesData.splitsBps[i] / BPS;
                feesAccountedDestBps[i] = destAmountFeeBps;
            } else {
                reservesData.srcAmounts[i] = (srcAmount * reservesData.splitsBps[i]) / BPS;
            }

            // get rate with calculated src amount
            reservesData.rates[i] = reservesData.addresses[i].getConversionRate(
                src,
                dest,
                reservesData.srcAmounts[i],
                block.number
            );
        }
    }

    function calculateRebates(TradeData memory tradeData)
        internal
        view
        returns (address[] memory rebateWallets, uint256[] memory rebatePercentBps)
    {
        rebateWallets = new address[](tradeData.numEntitledRebateReserves);
        rebatePercentBps = new uint256[](tradeData.numEntitledRebateReserves);
        if (tradeData.numEntitledRebateReserves == 0) {
            return (rebateWallets, rebatePercentBps);
        }

        uint256 index;
        bytes32[] memory rebateReserveIds = new bytes32[](tradeData.numEntitledRebateReserves);

        // token -> eth
        index = createRebateEntitledList(
            rebateReserveIds,
            rebatePercentBps,
            tradeData.tokenToEth,
            index,
            tradeData.feeAccountedBps
        );

        // eth -> token
        createRebateEntitledList(
            rebateReserveIds,
            rebatePercentBps,
            tradeData.ethToToken,
            index,
            tradeData.feeAccountedBps
        );

        rebateWallets = NimbleStorage.getRebateWalletsFromIds(rebateReserveIds);
    }

    function createRebateEntitledList(
        bytes32[] memory rebateReserveIds,
        uint256[] memory rebatePercentBps,
        ReservesData memory reservesData,
        uint256 index,
        uint256 feeAccountedBps
    ) internal pure returns (uint256) {
        uint256 _index = index;

        for (uint256 i = 0; i < reservesData.isEntitledRebateFlags.length; i++) {
            if (reservesData.isEntitledRebateFlags[i]) {
                rebateReserveIds[_index] = reservesData.ids[i];
                rebatePercentBps[_index] = (reservesData.splitsBps[i] * BPS) / feeAccountedBps;
                _index++;
            }
        }
        return _index;
    }

    /// @dev Checks a trade input validity, including correct src amounts
    /// @param input Trade input structure
    function validateTradeInput(TradeInput memory input) internal view
    {
        require(isEnabled, "network disabled");
        require(NimbleProxyContracts[msg.sender], "bad sender");
        require(tx.gasprice <= maxGasPriceValue, "gas price");
        require(input.srcAmount <= MAX_QTY, "srcAmt > MAX_QTY");
        require(input.srcAmount != 0, "0 srcAmt");
        require(input.destAddress != address(0), "dest add 0");
        require(input.src != input.dest, "src = dest");

        if (input.src == ETH_TOKEN_ADDRESS) {
            require(msg.value == input.srcAmount); // NimbleProxy issues message here
        } else {
            require(msg.value == 0); // NimbleProxy issues message here
            // funds should have been moved to this contract already.
            require(input.src.balanceOf(address(this)) >= input.srcAmount, "no tokens");
        }
    }

    /// @notice Gets the network fee from NimbleDao (or use default). View function for getExpectedRate
    function getNetworkFee() internal view returns (uint256 networkFeeBps) {
        uint256 expiryTimestamp;
        (networkFeeBps, expiryTimestamp) = readNetworkFeeData();

        if (expiryTimestamp < now && NimbleDao != INimbleDao(0)) {
            (networkFeeBps, expiryTimestamp) = NimbleDao.getLatestNetworkFeeData();
        }
    }

    function readNetworkFeeData() internal view returns (uint256 feeBps, uint256 expiryTimestamp) {
        feeBps = uint256(networkFeeData.feeBps);
        expiryTimestamp = uint256(networkFeeData.expiryTimestamp);
    }

    /// @dev Checks fee input validity, including correct src amounts
    /// @param input Trade input structure
    /// @param networkFeeBps Network fee in bps.
    function validateFeeInput(TradeInput memory input, uint256 networkFeeBps) internal pure {
        require(input.platformFeeBps < BPS, "platformFee high");
        require(input.platformFeeBps + networkFeeBps + networkFeeBps < BPS, "fees high");
    }

    /// @notice Update reserve data with selected reserves from NimbleMatchingEngine
    function updateReservesList(ReservesData memory reservesData, uint256[] memory selectedIndexes)
        internal
        pure
    {
        uint256 numReserves = selectedIndexes.length;

        require(numReserves <= reservesData.addresses.length, "doMatch: too many reserves");

        INimbleReserve[] memory reserveAddresses = new INimbleReserve[](numReserves);
        bytes32[] memory reserveIds = new bytes32[](numReserves);
        uint256[] memory splitsBps = new uint256[](numReserves);
        bool[] memory isFeeAccountedFlags = new bool[](numReserves);
        bool[] memory isEntitledRebateFlags = new bool[](numReserves);
        uint256[] memory srcAmounts = new uint256[](numReserves);
        uint256[] memory rates = new uint256[](numReserves);

        // update participating resevres and all data (rates, srcAmounts, feeAcounted etc.)
        for (uint256 i = 0; i < numReserves; i++) {
            reserveAddresses[i] = reservesData.addresses[selectedIndexes[i]];
            reserveIds[i] = reservesData.ids[selectedIndexes[i]];
            splitsBps[i] = reservesData.splitsBps[selectedIndexes[i]];
            isFeeAccountedFlags[i] = reservesData.isFeeAccountedFlags[selectedIndexes[i]];
            isEntitledRebateFlags[i] = reservesData.isEntitledRebateFlags[selectedIndexes[i]];
            srcAmounts[i] = reservesData.srcAmounts[selectedIndexes[i]];
            rates[i] = reservesData.rates[selectedIndexes[i]];
        }

        // update values
        reservesData.addresses = reserveAddresses;
        reservesData.ids = reserveIds;
        reservesData.splitsBps = splitsBps;
        reservesData.isFeeAccountedFlags = isFeeAccountedFlags;
        reservesData.isEntitledRebateFlags = isEntitledRebateFlags;
        reservesData.rates = rates;
        reservesData.srcAmounts = srcAmounts;
    }

    /// @notice Verify split values bps and reserve ids,
    ///     then calculate the destQty from srcAmounts and rates
    /// @dev Each split bps must be in range (0, BPS]
    /// @dev Total split bps must be 100%
    /// @dev Reserve ids must be increasing
    function validateTradeCalcDestQtyAndFeeData(
        IERC20 src,
        ReservesData memory reservesData,
        TradeData memory tradeData
    ) internal pure returns (uint256 totalDestAmount) {
        uint256 totalBps;
        uint256 srcDecimals = (src == ETH_TOKEN_ADDRESS) ? ETH_DECIMALS : reservesData.decimals;
        uint256 destDecimals = (src == ETH_TOKEN_ADDRESS) ? reservesData.decimals : ETH_DECIMALS;
        
        for (uint256 i = 0; i < reservesData.addresses.length; i++) {
            if (i > 0 && (uint256(reservesData.ids[i]) <= uint256(reservesData.ids[i - 1]))) {
                return 0; // ids are not in increasing order
            }
            totalBps += reservesData.splitsBps[i];

            uint256 destAmount = calcDstQty(
                reservesData.srcAmounts[i],
                srcDecimals,
                destDecimals,
                reservesData.rates[i]
            );
            if (destAmount == 0) {
                return 0;
            }
            totalDestAmount += destAmount;

            if (reservesData.isFeeAccountedFlags[i]) {
                tradeData.feeAccountedBps += reservesData.splitsBps[i];

                if (reservesData.isEntitledRebateFlags[i]) {
                    tradeData.numEntitledRebateReserves++;
                }
            }
        }

        if (totalBps != BPS) {
            return 0;
        }
    }

    /// @notice Recalculates tradeWei, network and platform fees, and actual source amount needed for the trade
    /// in the event actualDestAmount > maxDestAmount
    function calcTradeSrcAmountFromDest(TradeData memory tradeData)
        internal
        pure
        virtual
        returns (uint256 actualSrcAmount)
    {
        uint256 weiAfterDeductingFees;
        if (tradeData.input.dest != ETH_TOKEN_ADDRESS) {
            weiAfterDeductingFees = calcTradeSrcAmount(
                tradeData.tradeWei - tradeData.platformFeeWei - tradeData.networkFeeWei,
                ETH_DECIMALS,
                tradeData.ethToToken.decimals,
                tradeData.input.maxDestAmount,
                tradeData.ethToToken
            );
        } else {
            weiAfterDeductingFees = tradeData.input.maxDestAmount;
        }

        // reverse calculation, because we are working backwards
        uint256 newTradeWei =
            (weiAfterDeductingFees * BPS * BPS) /
            ((BPS * BPS) -
                (tradeData.networkFeeBps *
                tradeData.feeAccountedBps +
                tradeData.input.platformFeeBps *
                BPS));
        tradeData.tradeWei = minOf(newTradeWei, tradeData.tradeWei);
        // recalculate network and platform fees based on tradeWei
        tradeData.networkFeeWei =
            (((tradeData.tradeWei * tradeData.networkFeeBps) / BPS) * tradeData.feeAccountedBps) /
            BPS;
        tradeData.platformFeeWei = (tradeData.tradeWei * tradeData.input.platformFeeBps) / BPS;

        if (tradeData.input.src != ETH_TOKEN_ADDRESS) {
            actualSrcAmount = calcTradeSrcAmount(
                tradeData.input.srcAmount,
                tradeData.tokenToEth.decimals,
                ETH_DECIMALS,
                tradeData.tradeWei,
                tradeData.tokenToEth
            );
        } else {
            actualSrcAmount = tradeData.tradeWei;
        }

        assert(actualSrcAmount <= tradeData.input.srcAmount);
    }

    /// @notice Recalculates srcAmounts and stores into tradingReserves, given the new destAmount.
    ///     Uses the original proportion of srcAmounts and rates to determine new split destAmounts,
    ///     then calculate the respective srcAmounts
    /// @dev Due to small rounding errors, will fallback to current src amounts if new src amount is greater
    function calcTradeSrcAmount(
        uint256 srcAmount,
        uint256 srcDecimals,
        uint256 destDecimals,
        uint256 destAmount,
        ReservesData memory reservesData
    ) internal pure returns (uint256 newSrcAmount) {
        uint256 totalWeightedDestAmount;
        for (uint256 i = 0; i < reservesData.srcAmounts.length; i++) {
            totalWeightedDestAmount += reservesData.srcAmounts[i] * reservesData.rates[i];
        }

        uint256[] memory newSrcAmounts = new uint256[](reservesData.srcAmounts.length);
        uint256 destAmountSoFar;
        uint256 currentSrcAmount;
        uint256 destAmountSplit;

        for (uint256 i = 0; i < reservesData.srcAmounts.length; i++) {
            currentSrcAmount = reservesData.srcAmounts[i];
            require(destAmount * currentSrcAmount * reservesData.rates[i] / destAmount == 
                    currentSrcAmount * reservesData.rates[i], 
                "multiplication overflow");
            destAmountSplit = i == (reservesData.srcAmounts.length - 1)
                ? (destAmount - destAmountSoFar)
                : (destAmount * currentSrcAmount * reservesData.rates[i]) /
                    totalWeightedDestAmount;
            destAmountSoFar += destAmountSplit;

            newSrcAmounts[i] = calcSrcQty(
                destAmountSplit,
                srcDecimals,
                destDecimals,
                reservesData.rates[i]
            );
            if (newSrcAmounts[i] > currentSrcAmount) {
                // revert back to use current src amounts
                return srcAmount;
            }

            newSrcAmount += newSrcAmounts[i];
        }
        // new src amounts are used only when all of them aren't greater then current srcAmounts
        reservesData.srcAmounts = newSrcAmounts;
    }
}
