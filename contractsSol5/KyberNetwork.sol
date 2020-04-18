pragma solidity 0.5.11;

import "./utils/WithdrawableNoModifiers.sol";
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


/**
 *   @title Kyber Network main contract
 *   Interacts with contracts:
 *       KyberDao: to retrieve fee data
 *       KyberFeeHandler: accumulate network fees per trade
 *       KyberMatchingEngine: parse user hint and run reserve matching algorithm
 *       KyberStorage: store / access reserves, token listings and contract addresses
 *       Kyber Reserves: query rate and trade.
 */
contract KyberNetwork is WithdrawableNoModifiers, Utils4, IKyberNetwork, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct NetworkFeeData {
        uint64 expiryTimestamp;
        uint16 feeBps;
    }

    /// @notice Stores work data for reserves (either for token -> ETH, or ETH -> token)
    /// @dev Variables are in-place, ie. reserve with addresses[i] has id of ids[i], offers rate of rates[i], etc.
    /// @param addresses List of reserve addresses selected for the trade
    /// @param ids List of reserve ids, to be used for KyberTrade event
    /// @param rates List of rates that were offered by the reserves
    /// @param isFeeAccountedFlags List of reserves requiring users to pay network fee, or not
    /// @param splitsBps List of proportions of trade amount allocated to the reserves.
    ///     If there is only 1 reserve, then it should have a value of 10000 bps
    /// @param decimals Token decimals. Src decimals when for src -> ETH, dest decimals when ETH -> dest
    struct ReservesData {
        IKyberReserve[] addresses;
        bytes32[] ids;
        uint256[] rates;
        bool[] isFeeAccountedFlags;
        uint256[] splitsBps;
        uint256[] srcAmounts;
        uint256 decimals;
    }

    /// @notice Main trade data structure, is initialised and used for the entire trade flow
    /// @param input Initialised when initialiseTradeInput is called. Stores basic trade info
    /// @param tokenToEth Stores information about reserves that were selected for src -> ETH side of trade
    /// @param ethToToken Stores information about reserves that were selected for ETH -> dest side of trade
    /// @param tradeWei Trade amount in ether wei, before deducting fees.
    /// @param networkFeeWei Network fee in ether wei. For t2t trades, it can go up to 200% of networkFeeBps
    /// @param platformFeeWei Platform fee in ether wei
    /// @param networkFeeBps Network fee bps determined by DAO, or default value
    /// @param numFeeAccountedReserves No. of reserves that are accounted for network fees
    ///     Some reserve types don't require users to pay the network fee
    /// @param feeAccountedBps Proportion of this trade that fee is accounted to, in BPS. Up to 2 * BPS
    /// @param rateWithNetworkFee src -> dest token rate, after accounting for only network fee
    struct TradeData {
        TradeInput input;
        ReservesData tokenToEth;
        ReservesData ethToToken;
        uint256 tradeWei;
        uint256 networkFeeWei;
        uint256 platformFeeWei;
        uint256 networkFeeBps;
        uint256 numFeeAccountedReserves;
        uint256 feeAccountedBps; // what part of this trade is fee paying. for token to token - up to 200%
        uint256 rateWithNetworkFee;
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
    uint256 internal constant DEFAULT_NETWORK_FEE_BPS = 25; // till we read value from DAO
    uint256 internal constant MAX_APPROVED_PROXIES = 2; // limit number of proxies that can trade here.

    IKyberFeeHandler internal feeHandler;
    IKyberDAO internal kyberDAO;
    IKyberMatchingEngine internal matchingEngine;
    IKyberStorage internal kyberStorage;
    IGasHelper internal gasHelper;

    NetworkFeeData internal networkFeeData; // data is feeBps and expiry timestamp
    uint256 internal maxGasPriceValue = 50 * 1000 * 1000 * 1000; // 50 gwei
    bool internal isEnabled = false; // is network enabled

    mapping(address => bool) internal kyberProxyContracts;

    // mapping reserve ID to address, keeps an array of all previous reserve addresses with this ID
    mapping(bytes32 => address) internal reserveIdToAddress;
    mapping(address => address) public reserveRebateWallet;

    event EtherReceival(address indexed sender, uint256 amount);
    event RemoveReserveFromNetwork(address indexed reserve, bytes32 indexed reserveId);
    event FeeHandlerUpdated(IKyberFeeHandler newHandler);
    event MatchingEngineUpdated(IKyberMatchingEngine matchingEngine);
    event GasHelperUpdated(IGasHelper gasHelper);
    event KyberDAOUpdated(IKyberDAO newDAO);
    event KyberNetworkParamsSet(uint256 maxGasPrice, uint256 negligibleRateDiffBps);
    event KyberNetworkSetEnable(bool isEnabled);
    event KyberProxyAdded(address proxy);
    event KyberProxyRemoved(address proxy);
    event AddReserveToNetwork(
        address indexed reserve,
        bytes32 indexed reserveId,
        IKyberStorage.ReserveType reserveType,
        address indexed rebateWallet,
        bool add
    );
    event ListReservePairs(
        address indexed reserve,
        IERC20 indexed src,
        IERC20 indexed dest,
        bool add
    );

    constructor(address _admin, IKyberStorage _kyberStorage)
        public
        WithdrawableNoModifiers(_admin)
    {
        updateNetworkFee(now, DEFAULT_NETWORK_FEE_BPS);
        kyberStorage = _kyberStorage;
    }

    function() external payable {
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
    /// @param walletId Wallet address to receive a portion of the fees collected
    /// @param hint Defines which reserves should be used for the trade
    /// @return Amount of actual dest tokens in twei
    function tradeWithHint(
        address trader,
        ERC20 src,
        uint256 srcAmount,
        ERC20 dest,
        address destAddress,
        uint256 maxDestAmount,
        uint256 minConversionRate,
        address walletId,
        bytes calldata hint
    ) external payable returns (uint256 destAmount) {
        TradeData memory tradeData = initTradeInput({
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
    /// @param platformWallet Wallet address to receive a portion of the fees collected
    /// @param platformFeeBps Part of the trade that is allocated as fee to platform wallet. Ex: 10000 = 100%, 100 = 1%
    /// @param hint Defines which reserves should be used for the trade
    /// @return Amount of actual dest tokens in twei
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
    ) external payable returns (uint256 destAmount) {
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

    /// @notice Can be called only by operator
    /// @dev Adds a reserve to the network
    /// @param reserve The reserve address
    /// @param reserveId The reserve ID in 32 bytes. 1st byte is reserve type
    /// @param reserveType Type of the reserve out of enum ReserveType
    /// @param rebateWallet Rebate wallet address for this reserve
    function addReserve(
        address reserve,
        bytes32 reserveId,
        IKyberStorage.ReserveType reserveType,
        address payable rebateWallet
    ) external returns (bool) {
        onlyOperator();
        require(kyberStorage.addReserve(reserve, reserveId, reserveType));
        require(rebateWallet != address(0));

        reserveIdToAddress[reserveId] = reserve;

        reserveRebateWallet[reserve] = rebateWallet;

        emit AddReserveToNetwork(reserve, reserveId, reserveType, rebateWallet, true);

        return true;
    }

    function rmReserve(address reserve) external returns (bool) {
        onlyOperator();
        return removeReserve(reserve, 0);
    }

    /// @notice Can be called only by operator
    /// @dev Allow or prevent a specific reserve to trade a pair of tokens
    /// @param reserve The reserve address
    /// @param token Token address
    /// @param ethToToken Will it support ether to token trade
    /// @param tokenToEth Will it support token to ether trade
    /// @param add If true then list this pair, otherwise unlist it
    function listPairForReserve(
        address reserve,
        IERC20 token,
        bool ethToToken,
        bool tokenToEth,
        bool add
    ) external returns (bool) {
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

    function setContracts(
        IKyberFeeHandler _feeHandler,
        IKyberMatchingEngine _matchingEngine,
        IGasHelper _gasHelper
    ) external {
        onlyAdmin();

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

        require(kyberStorage.setContracts(_feeHandler, address(_matchingEngine)));
        require(_feeHandler != IKyberFeeHandler(0));
        require(_matchingEngine != IKyberMatchingEngine(0));
    }

    function setDAOContract(IKyberDAO _kyberDAO) external {
        onlyAdmin();
        if (kyberDAO != _kyberDAO) {
            kyberDAO = _kyberDAO;
            require(kyberStorage.setDAOContract(_kyberDAO));
            emit KyberDAOUpdated(_kyberDAO);
        }
        require(_kyberDAO != IKyberDAO(0));
    }

    function setParams(uint256 _maxGasPrice, uint256 _negligibleRateDiffBps) external {
        onlyAdmin();
        maxGasPriceValue = _maxGasPrice;
        require(matchingEngine.setNegligbleRateDiffBps(_negligibleRateDiffBps));
        emit KyberNetworkParamsSet(maxGasPriceValue, _negligibleRateDiffBps);
    }

    function setEnable(bool enable) external {
        onlyAdmin();

        if (enable) {
            require(feeHandler != IKyberFeeHandler(0));
            require(matchingEngine != IKyberMatchingEngine(0));
            require(kyberStorage.isKyberProxyAdded());
        }

        isEnabled = enable;

        emit KyberNetworkSetEnable(isEnabled);
    }

    /// @dev No. of KyberNetworkProxies are capped
    function addKyberProxy(address networkProxy) external {
        onlyAdmin();
        require(kyberStorage.addKyberProxy(networkProxy, MAX_APPROVED_PROXIES));
        require(networkProxy != address(0));
        require(!kyberProxyContracts[networkProxy]);

        kyberProxyContracts[networkProxy] = true;

        emit KyberProxyAdded(networkProxy);
    }

    function removeKyberProxy(address networkProxy) external {
        onlyAdmin();

        require(kyberStorage.removeKyberProxy(networkProxy));

        require(kyberProxyContracts[networkProxy]);

        kyberProxyContracts[networkProxy] = false;

        emit KyberProxyRemoved(networkProxy);
    }

    /// @dev gets the expected and slippage rate for exchanging src -> dest token, with platform fee taken into account
    /// @param src Source token
    /// @param dest Destination token
    /// @param srcQty Amount of src tokens in twei
    /// @param platformFeeBps Part of the trade that is allocated as fee to platform wallet. Ex: 10000 = 100%, 100 = 1%
    /// @param hint Defines which reserves should be used for the trade
    /// @return Returns 3 different rates
    /// @return rateWithoutFees Rate excluding network and platform fees
    /// @return rateWithNetworkFee Rate excluding network fee, but includes platform fee
    /// @return rateWithAllFees Rate after accounting for both network and platform fees
    function getExpectedRateWithHintAndFee(
        IERC20 src,
        IERC20 dest,
        uint256 srcQty,
        uint256 platformFeeBps,
        bytes calldata hint
    )
        external
        view
        returns (
            uint256 rateWithoutFees,
            uint256 rateWithNetworkFee,
            uint256 rateWithAllFees
        )
    {
        if (src == dest) return (0, 0, 0);

        TradeData memory tradeData = initTradeInput({
            trader: address(uint160(0)),
            src: src,
            dest: dest,
            srcAmount: (srcQty == 0) ? 1 : srcQty,
            destAddress: address(uint160(0)),
            maxDestAmount: 2**255,
            minConversionRate: 0,
            platformWallet: address(uint160(0)),
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

        rateWithoutFees =
            (rateWithNetworkFee * BPS) /
            (BPS - (tradeData.networkFeeBps * tradeData.feeAccountedBps) / BPS);
    }

    /// @notice Backward compatible API
    /// @dev Gets the expected and slippage rate for exchanging src -> dest token
    /// @dev worstRate is hardcoded to be 3% lower of expectedRate
    /// @param src Source token
    /// @param dest Destination token
    /// @param srcQty Amount of src tokens in twei
    /// @return expectedRate for a trade after deducting network fee. Rate = destQty (twei) / srcQty (twei) * 10 ** 18
    /// @return worstRate for a trade. Calculated to be expectedRate * 97 / 100
    function getExpectedRate(
        ERC20 src,
        ERC20 dest,
        uint256 srcQty
    ) external view returns (uint256 expectedRate, uint256 worstRate) {
        if (src == dest) return (0, 0);
        uint256 qty = srcQty & ~PERM_HINT_GET_RATE;

        TradeData memory tradeData = initTradeInput({
            trader: address(uint160(0)),
            src: src,
            dest: dest,
            srcAmount: (qty == 0) ? 1 : qty,
            destAddress: address(uint160(0)),
            maxDestAmount: 2**255,
            minConversionRate: 0,
            platformWallet: address(uint160(0)),
            platformFeeBps: 0
        });

        tradeData.networkFeeBps = getNetworkFee();

        (, expectedRate) = calcRatesAndAmounts(tradeData, "");

        worstRate = (expectedRate * 97) / 100; // backward compatible formula
    }

    /// @notice Returns some data about the network
    /// @param negligibleDiffBps Neligible rate difference (in basis pts) when searching best rate
    /// @param networkFeeBps Network fees to be charged (in basis pts)
    /// @param expiryTimestamp Timestamp for which networkFeeBps will expire,
    ///     and needs to be updated by calling DAO contract / set to default
    function getNetworkData()
        external
        view
        returns (
            uint256 negligibleDiffBps,
            uint256 networkFeeBps,
            uint256 expiryTimestamp
        )
    {
        (networkFeeBps, expiryTimestamp) = readNetworkFeeData();
        negligibleDiffBps = matchingEngine.getNegligibleRateDiffBps();
        return (negligibleDiffBps, networkFeeBps, expiryTimestamp);
    }

    function getContracts()
        external
        view
        returns (
            IKyberFeeHandler feeHandlerAddress,
            IKyberDAO daoAddress,
            IKyberMatchingEngine matchingEngineAddress,
            IKyberStorage storageAddress,
            IGasHelper gasHelperAddress,
            IKyberNetworkProxy[] memory proxyAddresses
        )
    {
        return (
            feeHandler,
            kyberDAO,
            matchingEngine,
            kyberStorage,
            gasHelper,
            kyberStorage.getKyberProxies()
        );
    }

    /// @notice returns the max gas price allowable for trades
    function maxGasPrice() external view returns (uint256) {
        return maxGasPriceValue;
    }

    /// @notice returns status of the network. If disabled, trades cannot happen.
    function enabled() external view returns (bool) {
        return isEnabled;
    }

    /// @notice Can be called only by operator
    /// @dev Removes a reserve from the network
    /// @param reserve The reserve address
    /// @param startIndex Index to start searching from in reserve array
    function removeReserve(address reserve, uint256 startIndex) public returns (bool) {
        onlyOperator();
        bytes32 reserveId = kyberStorage.removeReserve(reserve, startIndex);

        require(reserveIdToAddress[reserveId] == reserve);

        reserveIdToAddress[reserveId] = address(0);

        reserveRebateWallet[reserve] = address(0);

        emit RemoveReserveFromNetwork(reserve, reserveId);

        return true;
    }

    /// @notice Gets network fee from the DAO (or use default).
    ///     For trade function, so that data can be updated and cached.
    /// @dev Note that this function can be triggered by anyone, so that
    ///     the first trader of a new epoch can avoid incurring extra gas costs
    function getAndUpdateNetworkFee() public returns (uint256 networkFeeBps) {
        uint256 expiryTimestamp;

        (networkFeeBps, expiryTimestamp) = readNetworkFeeData();

        if (expiryTimestamp < now && kyberDAO != IKyberDAO(0)) {
            (networkFeeBps, expiryTimestamp) = kyberDAO.getLatestNetworkFeeDataWithCache();
            updateNetworkFee(expiryTimestamp, networkFeeBps);
        }
    }

    /// @notice Calculates platform fee and reserve rebate percentages for the trade.
    ///     Transfers ETH and rebate wallet data to feeHandler
    function handleFees(TradeData memory tradeData) internal returns (bool) {
        //no need to handle fees if no fee paying reserves
        if ((tradeData.numFeeAccountedReserves == 0) && (tradeData.platformFeeWei == 0))
            return true;

        // update reserve eligibility and rebate percentages
        (
            address[] memory rebateWallets,
            uint256[] memory rebatePercentBps
        ) = calculateRebateSplitPerWallet(tradeData);

        uint256 sentFee = tradeData.networkFeeWei + tradeData.platformFeeWei;

        // send total fee amount to fee handler with reserve data
        require(
            feeHandler.handleFees.value(sentFee)(
                rebateWallets,
                rebatePercentBps,
                tradeData.input.platformWallet,
                tradeData.platformFeeWei
            ),
            "handle fee fail"
        );
        return true;
    }

    function updateNetworkFee(uint256 expiryTimestamp, uint256 feeBps) internal {
        require(expiryTimestamp < 2**64, "expiry overflow");
        require(feeBps < BPS / 2, "fees exceed BPS");

        networkFeeData.expiryTimestamp = uint64(expiryTimestamp);
        networkFeeData.feeBps = uint16(feeBps);
    }

    /// @notice Use token address ETH_TOKEN_ADDRESS for ether
    /// @dev Do one trade with a reserve
    /// @param src Source token
    /// @param amount Amount of src tokens in twei
    /// @param dest Destination token
    /// @param destAddress Address to send tokens to
    /// @return True if trade is successful
    function doReserveTrades(
        IERC20 src,
        uint256 amount,
        IERC20 dest,
        address payable destAddress,
        TradeData memory tradeData,
        uint256 expectedDestAmount
    ) internal returns (bool) {
        amount;
        if (src == dest) {
            // ether to ether, need not do anything except for token to ether: transfer ETH to destAddress
            if (destAddress != (address(this))) {
                (bool success, ) = destAddress.call.value(expectedDestAmount)("");
                require(success, "send dest qty failed");
            }
            return true;
        }

        ReservesData memory reservesData = (src == ETH_TOKEN_ADDRESS)
            ? tradeData.ethToToken
            : tradeData.tokenToEth;
        uint256 callValue;

        for (uint256 i = 0; i < reservesData.addresses.length; i++) {
            callValue = (src == ETH_TOKEN_ADDRESS) ? reservesData.srcAmounts[i] : 0;

            // reserve sends tokens/eth to network. network sends it to destination
            require(
                reservesData.addresses[i].trade.value(callValue)(
                    src,
                    reservesData.srcAmounts[i],
                    dest,
                    address(this),
                    reservesData.rates[i],
                    true
                ),
                "trade failed"
            );
        }

        if (destAddress != address(this)) {
            // for ether to token / token to token, transfer tokens to destAddress
            dest.safeTransfer(destAddress, expectedDestAmount);
        }

        return true;
    }

    /* solhint-disable function-max-lines */
    //  Most of the lines here are functions calls spread over multiple lines. We find this function readable enough
    /// @notice Use token address ETH_TOKEN_ADDRESS for ether
    /// @dev Trade API for kyber network
    /// @param tradeData Main trade data object for trade info to be stored
    function trade(TradeData memory tradeData, bytes memory hint)
        internal
        nonReentrant
        returns (uint256 destAmount)
    {
        tradeData.networkFeeBps = getAndUpdateNetworkFee();

        require(verifyTradeInputValid(tradeData.input, tradeData.networkFeeBps), "invalid");

        uint256 rateWithNetworkFee;
        (destAmount, rateWithNetworkFee) = calcRatesAndAmounts(tradeData, hint);

        require(rateWithNetworkFee > 0, "0 rate");
        require(rateWithNetworkFee < MAX_RATE, "rate > MAX_RATE");
        require(rateWithNetworkFee >= tradeData.input.minConversionRate, "rate < min rate");

        uint256 actualSrcAmount;

        if (destAmount > tradeData.input.maxDestAmount) {
            // notice tradeData passed by reference and updated
            destAmount = tradeData.input.maxDestAmount;
            actualSrcAmount = calcTradeSrcAmountFromDest(tradeData);

            require(
                handleChange(
                    tradeData.input.src,
                    tradeData.input.srcAmount,
                    actualSrcAmount,
                    tradeData.input.trader
                )
            );
        } else {
            actualSrcAmount = tradeData.input.srcAmount;
        }

        // token to ether
        require(
            doReserveTrades(
                tradeData.input.src,
                actualSrcAmount,
                ETH_TOKEN_ADDRESS,
                address(this),
                tradeData,
                tradeData.tradeWei
            )
        ); // tradeData.tradeWei (expectedDestAmount) not used if destAddress == address(this)

        // ether to token
        require(
            doReserveTrades(
                ETH_TOKEN_ADDRESS,
                tradeData.tradeWei - tradeData.networkFeeWei - tradeData.platformFeeWei,
                tradeData.input.dest,
                tradeData.input.destAddress,
                tradeData,
                destAmount
            )
        );

        require(handleFees(tradeData));

        emit KyberTrade({
            trader: tradeData.input.trader,
            src: tradeData.input.src,
            dest: tradeData.input.dest,
            srcAmount: actualSrcAmount,
            destAmount: destAmount,
            destAddress: tradeData.input.destAddress,
            ethWeiValue: tradeData.tradeWei,
            networkFeeWei: tradeData.networkFeeWei,
            customPlatformFeeWei: tradeData.platformFeeWei,
            t2eIds: tradeData.tokenToEth.ids,
            e2tIds: tradeData.ethToToken.ids,
            hint: hint
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
    ) internal returns (bool) {
        if (requiredSrcAmount < srcAmount) {
            // if there is "change" send back to trader
            if (src == ETH_TOKEN_ADDRESS) {
                (bool success, ) = trader.call.value(srcAmount - requiredSrcAmount)("");
                require(success, "Send change failed");
            } else {
                src.safeTransfer(trader, (srcAmount - requiredSrcAmount));
            }
        }

        return true;
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

    /// @notice Calls matching engine that determines all the information necessary for the trade
    ///     (to be stored in tradeData) such as what reserves were selected (their addresses and ids),
    ///     what rates they offer, fee paying information, tradeWei amount,
    ///     network fee, platform fee, etc. WITHOUT accounting for maxDestAmount.
    ///     This function should set all TradeData information so that it can be used after without any ambiguity
    /// @param tradeData Main trade data object for trade info to be stored
    /// @param hint Defines which reserves should be used for the trade
    function calcRatesAndAmounts(TradeData memory tradeData, bytes memory hint)
        internal
        view
        returns (uint256 destAmount, uint256 rateWithNetworkFee)
    {
        // token to ether: find best reserve match and calculate wei amount
        /////////////////////////////////////////////////////////////////
        tradeData.tradeWei = calcDestQtyAndMatchReserves(
            tradeData.input.src,
            ETH_TOKEN_ADDRESS,
            tradeData.input.srcAmount,
            tradeData,
            tradeData.tokenToEth,
            hint
        );

        if (tradeData.tradeWei == 0) {
            return (0, 0);
        }

        // platform fee
        tradeData.platformFeeWei = (tradeData.tradeWei * tradeData.input.platformFeeBps) / BPS;
        tradeData.networkFeeWei =
            (((tradeData.tradeWei * tradeData.networkFeeBps) / BPS) * tradeData.feeAccountedBps) /
            BPS;
        // set networkFeeWei in stack. since we set it again after full flow done.
        require(
            tradeData.tradeWei >= (tradeData.networkFeeWei + tradeData.platformFeeWei),
            "fees exceed trade"
        );

        // ether to token: find best reserve match and calculate trade dest amount
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
        actualSrcWei = tradeData.tradeWei - tradeData.networkFeeWei - tradeData.platformFeeWei;

        // calculate different rates: rate with only network fee, dest amount without fees.
        uint256 e2tRate = calcRateFromQty(
            actualSrcWei,
            destAmount,
            ETH_DECIMALS,
            tradeData.ethToToken.decimals
        );

        uint256 destAmountWithNetworkFee = calcDstQty(
            tradeData.tradeWei - tradeData.networkFeeWei,
            ETH_DECIMALS,
            tradeData.ethToToken.decimals,
            e2tRate
        );

        rateWithNetworkFee = calcRateFromQty(
            tradeData.input.srcAmount,
            destAmountWithNetworkFee,
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

        IKyberMatchingEngine.ProcessWithRate processWithRate;

        // get reserve list from matching engine.
        (reservesData.ids, reservesData.splitsBps, processWithRate) = matchingEngine
            .getTradingReserves(
            src,
            dest,
            (tradeData.input.src != ETH_TOKEN_ADDRESS) &&
                (tradeData.input.dest != ETH_TOKEN_ADDRESS),
            hint
        );
        reservesData.isFeeAccountedFlags = kyberStorage.getFeeAccountedData(reservesData.ids);

        require(reservesData.ids.length == reservesData.splitsBps.length, "bad split array");
        require(reservesData.ids.length == reservesData.isFeeAccountedFlags.length, "bad fee array");

        // calculate src trade amount per reserve and query rates
        // set data in reservesData struct
        uint256[] memory feesAccountedDestBps = calcSrcAmountsAndGetRates(
            reservesData,
            src,
            dest,
            srcAmount,
            tradeData.networkFeeBps,
            (tradeData.tradeWei * tradeData.networkFeeBps) / BPS
        );

        // if matching engine requires processing with rate data. call do match and update reserve list
        if (processWithRate == IKyberMatchingEngine.ProcessWithRate.Required) {
            uint256[] memory selectedIndexes = matchingEngine.doMatch(
                src,
                dest,
                reservesData.srcAmounts,
                feesAccountedDestBps,
                reservesData.rates
            );

            updateReservesData(reservesData, selectedIndexes);
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
        uint256 networkFeeBps,
        uint256 networkFeeValue
    ) internal view returns (uint256[] memory feesAccountedDestBps) {
        uint256 numReserves = reservesData.ids.length;

        reservesData.srcAmounts = new uint256[](numReserves);
        reservesData.rates = new uint256[](numReserves);
        reservesData.addresses = new IKyberReserve[](numReserves);
        feesAccountedDestBps = new uint256[](numReserves);

        // iterate reserve list. validate data. calculate srcAmount according to splits and fee data.
        for (uint256 i = 0; i < numReserves; i++) {
            require(
                reservesData.splitsBps[i] > 0 && reservesData.splitsBps[i] <= BPS,
                "invalid split bps"
            );
            reservesData.addresses[i] = IKyberReserve(
                convertReserveIdToAddress(reservesData.ids[i])
            );

            if (reservesData.isFeeAccountedFlags[i]) {
                if (src == ETH_TOKEN_ADDRESS) {
                    // reduce fee from srcAmount if fee paying.
                    reservesData.srcAmounts[i] =
                        ((srcAmount - networkFeeValue) * reservesData.splitsBps[i]) /
                        BPS;
                } else {
                    reservesData.srcAmounts[i] = (srcAmount * reservesData.splitsBps[i]) / BPS;
                    feesAccountedDestBps[i] = networkFeeBps;
                }
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

    function calculateRebateSplitPerWallet(TradeData memory tradeData)
        internal
        view
        returns (address[] memory rebateWallets, uint256[] memory rebatePercentBps)
    {
        rebateWallets = new address[](tradeData.numFeeAccountedReserves);
        rebatePercentBps = new uint256[](tradeData.numFeeAccountedReserves);
        if (tradeData.numFeeAccountedReserves == 0) {
            return (rebateWallets, rebatePercentBps);
        }

        uint256 index;

        // token to ether
        index = populateRebateWalletList(
            rebateWallets,
            rebatePercentBps,
            tradeData.tokenToEth,
            index,
            tradeData.feeAccountedBps
        );

        // ether to token
        populateRebateWalletList(
            rebateWallets,
            rebatePercentBps,
            tradeData.ethToToken,
            index,
            tradeData.feeAccountedBps
        );
    }

    function populateRebateWalletList(
        address[] memory rebateWallets,
        uint256[] memory rebatePercentBps,
        ReservesData memory reservesData,
        uint256 index,
        uint256 feeAccountedBps
    ) internal view returns (uint256) {
        uint256 _index = index;

        for (uint256 i = 0; i < reservesData.isFeeAccountedFlags.length; i++) {
            if (reservesData.isFeeAccountedFlags[i]) {
                rebateWallets[_index] = reserveRebateWallet[address(reservesData.addresses[i])];
                rebatePercentBps[_index] = (reservesData.splitsBps[i] * BPS) / feeAccountedBps;
                _index++;
            }
        }
        return _index;
    }

    /// @dev Checks a trade input validity, including correct src amounts
    /// @param input Trade input structure
    /// @param networkFeeBps Network fee in bps.
    /// @return True if tradeInput is valid
    function verifyTradeInputValid(TradeInput memory input, uint256 networkFeeBps)
        internal
        view
        returns (bool)
    {
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
            require(msg.value == input.srcAmount, "bad eth qty");
        } else {
            require(msg.value == 0, "eth not 0");
            // funds should have been moved to this contract already.
            require(input.src.balanceOf(address(this)) >= input.srcAmount, "no tokens");
        }

        return true;
    }

    /// @notice Gets the network fee from the DAO (or use default). View function for getExpectedRate
    function getNetworkFee() internal view returns (uint256 networkFeeBps) {
        uint256 expiryTimestamp;
        (networkFeeBps, expiryTimestamp) = readNetworkFeeData();

        if (expiryTimestamp < now && kyberDAO != IKyberDAO(0)) {
            (networkFeeBps, expiryTimestamp) = kyberDAO.getLatestNetworkFeeData();
        }
    }

    function readNetworkFeeData() internal view returns (uint256 feeBps, uint256 expiryTimestamp) {
        feeBps = uint256(networkFeeData.feeBps);
        expiryTimestamp = uint256(networkFeeData.expiryTimestamp);
    }

    function convertReserveIdToAddress(bytes32 reserveId)
        internal
        view
        returns (IKyberReserve reserve)
    {
        reserve = IKyberReserve(reserveIdToAddress[reserveId]);
        require(reserve != IKyberReserve(0), "reserve not listed");
    }

    /// @notice Update reserve data with selected reserves from matching engine
    function updateReservesData(ReservesData memory reservesData, uint256[] memory selectedIndexes)
        internal
        pure
    {
        uint256 numReserves = selectedIndexes.length;

        require(numReserves <= reservesData.addresses.length, "doMatch: too many reserves");

        IKyberReserve[] memory reserveAddresses = new IKyberReserve[](numReserves);
        bytes32[] memory reserveIds = new bytes32[](numReserves);
        uint256[] memory splitsBps = new uint256[](numReserves);
        bool[] memory isFeeAccountedFlags = new bool[](numReserves);
        uint256[] memory srcAmounts = new uint256[](numReserves);
        uint256[] memory rates = new uint256[](numReserves);

        // update participating resevres and all data (rates, srcAmounts, feeAcounted etc.)
        for (uint256 i = 0; i < numReserves; i++) {
            reserveAddresses[i] = reservesData.addresses[selectedIndexes[i]];
            reserveIds[i] = reservesData.ids[selectedIndexes[i]];
            splitsBps[i] = reservesData.splitsBps[selectedIndexes[i]];
            isFeeAccountedFlags[i] = reservesData.isFeeAccountedFlags[selectedIndexes[i]];
            srcAmounts[i] = reservesData.srcAmounts[selectedIndexes[i]];
            rates[i] = reservesData.rates[selectedIndexes[i]];
        }

        //update values
        reservesData.addresses = reserveAddresses;
        reservesData.ids = reserveIds;
        reservesData.splitsBps = splitsBps;
        reservesData.isFeeAccountedFlags = isFeeAccountedFlags;
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
    ) internal pure returns (uint256 destAmount) {
        uint256 totalBps;
        uint256 srcDecimals = (src == ETH_TOKEN_ADDRESS) ? ETH_DECIMALS : reservesData.decimals;
        uint256 destDecimals = (src == ETH_TOKEN_ADDRESS) ? reservesData.decimals : ETH_DECIMALS;

        for (uint256 i = 0; i < reservesData.addresses.length; i++) {
            if (i > 0 && (uint256(reservesData.ids[i]) <= uint256(reservesData.ids[i - 1]))) {
                return 0; // ids are not in increasing order
            }
            totalBps += reservesData.splitsBps[i];

            destAmount += calcDstQty(
                reservesData.srcAmounts[i],
                srcDecimals,
                destDecimals,
                reservesData.rates[i]
            );

            if (reservesData.isFeeAccountedFlags[i]) {
                tradeData.feeAccountedBps += reservesData.splitsBps[i];
                tradeData.numFeeAccountedReserves++;
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
        returns (uint256 actualSrcAmount)
    {
        uint256 weiAfterFees;
        if (tradeData.input.dest != ETH_TOKEN_ADDRESS) {
            weiAfterFees = calcTradeSrcAmount(
                ETH_DECIMALS,
                tradeData.ethToToken.decimals,
                tradeData.input.maxDestAmount,
                tradeData.ethToToken
            );
        } else {
            weiAfterFees = tradeData.input.maxDestAmount;
        }

        // reverse calculation, because we are working backwards
        tradeData.tradeWei =
            (weiAfterFees * BPS * BPS) /
            ((BPS * BPS) -
                tradeData.networkFeeBps *
                tradeData.feeAccountedBps -
                tradeData.input.platformFeeBps *
                BPS);
        // recalculate network and platform fees based on tradeWei
        tradeData.networkFeeWei =
            (((tradeData.tradeWei * tradeData.networkFeeBps) / BPS) * tradeData.feeAccountedBps) /
            BPS;
        tradeData.platformFeeWei = (tradeData.tradeWei * tradeData.input.platformFeeBps) / BPS;

        if (tradeData.input.src != ETH_TOKEN_ADDRESS) {
            actualSrcAmount = calcTradeSrcAmount(
                tradeData.tokenToEth.decimals,
                ETH_DECIMALS,
                tradeData.tradeWei,
                tradeData.tokenToEth
            );
        } else {
            actualSrcAmount = tradeData.tradeWei;
        }

        require(actualSrcAmount <= tradeData.input.srcAmount, "actualSrcAmt > given srcAmt");
    }

    /// @notice Recalculates srcAmounts and stores into tradingReserves, given the new destAmount.
    ///     Uses the original proportion of srcAmounts and rates to determine new split destAmounts,
    ///     then calculate the respective srcAmounts
    /// @dev Due to small rounding errors, we take the minimum of the original and new srcAmounts
    function calcTradeSrcAmount(
        uint256 srcDecimals,
        uint256 destDecimals,
        uint256 destAmount,
        ReservesData memory reservesData
    ) internal pure returns (uint256 srcAmount) {
        uint256 totalWeightedDestAmount;
        for (uint256 i = 0; i < reservesData.srcAmounts.length; i++) {
            totalWeightedDestAmount += reservesData.srcAmounts[i] * reservesData.rates[i];
        }

        uint256 destAmountSoFar;
        for (uint256 i = 0; i < reservesData.srcAmounts.length; i++) {
            uint256 currentSrcAmount = reservesData.srcAmounts[i];
            uint256 destAmountSplit = i == (reservesData.srcAmounts.length - 1)
                ? (destAmount - destAmountSoFar)
                : (destAmount * currentSrcAmount * reservesData.rates[i]) /
                    totalWeightedDestAmount;
            destAmountSoFar += destAmountSplit;

            uint256 newSrcAmount = calcSrcQty(
                destAmountSplit,
                srcDecimals,
                destDecimals,
                reservesData.rates[i]
            );
            newSrcAmount = minOf(newSrcAmount, currentSrcAmount);

            reservesData.srcAmounts[i] = newSrcAmount;
            srcAmount += newSrcAmount;
        }
    }
}
