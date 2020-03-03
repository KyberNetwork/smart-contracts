pragma  solidity 0.5.11;

import "./Withdrawable2.sol";
import "./Utils4.sol";
import "./ReentrancyGuard.sol";
import "./IKyberNetwork.sol";
import "./IKyberReserve.sol";
import "./IKyberFeeHandler.sol";
import "./IKyberDAO.sol";
import "./IKyberTradeLogic.sol";
import "./IGasHelper.sol";


////////////////////////////////////////////////////////////////////////////////////////////////////////
/// @title Kyber Network main contract
contract KyberNetwork is Withdrawable2, Utils4, IKyberNetwork, ReentrancyGuard {

    uint  constant PERM_HINT_GET_RATE = 1 << 255; //for backwards compatibility
    uint  constant DEFAULT_NETWORK_FEE_BPS = 25; //for backwards compatibility

    IKyberFeeHandler       internal feeHandler;
    IKyberDAO         internal kyberDAO;
    IKyberTradeLogic  internal tradeLogic;
    IGasHelper        internal gasHelper;

    uint            networkFeeData; // data is feeBps and expiry block
    uint            maxGasPriceValue = 50 * 1000 * 1000 * 1000; // 50 gwei
    bool            isEnabled = false; // is network enabled

    mapping(address=>bool) internal kyberProxyContracts;
    address[] internal kyberProxyArray;
    
    IKyberReserve[] internal reserves;
    mapping(address=>address) public reserveRebateWallet;

    constructor(address _admin) public Withdrawable2(_admin) { 
        networkFeeData = encodeNetworkFee(block.number, DEFAULT_NETWORK_FEE_BPS);
    }

    event EtherReceival(address indexed sender, uint amount);

    function() external payable {
        emit EtherReceival(msg.sender, msg.value);
    }

    // the new trade with hint
    function tradeWithHintAndFee(address payable trader, IERC20 src, uint srcAmount, IERC20 dest, address payable destAddress,
        uint maxDestAmount, uint minConversionRate, address payable platformWallet, uint platformFeeBps, bytes calldata hint)
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

     // backward compatible
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
        ReserveType reserveType,
        address indexed rebateWallet,
        bool add);

    /// @notice can be called only by operator
    /// @dev adds a reserve to/from the network.
    /// @param reserve The reserve address.
    function addReserve(address reserve, bytes8 reserveId, ReserveType reserveType, address wallet) external onlyOperator returns(bool) {
        require(tradeLogic.addReserve(reserve, reserveId, reserveType));
        reserves.push(IKyberReserve(reserve));

        reserveRebateWallet[reserve] = wallet;

        emit AddReserveToNetwork(reserve, reserveId, reserveType, wallet, true);

        return true;
    }

    event RemoveReserveFromNetwork(address reserve, bytes8 indexed reserveId);

    /// @notice can be called only by operator
    /// @dev removes a reserve from Kyber network.
    /// @param reserve The reserve address.
    /// @param startIndex to search in reserve array.
    function removeReserve(address reserve, uint startIndex) public onlyOperator returns(bool) {
        //TODO: handle all db
        bytes8 reserveId = tradeLogic.removeReserve(reserve);

        uint reserveIndex = 2 ** 255;
        
        for (uint i = startIndex; i < reserves.length; i++) {
            if(reserves[i] == IKyberReserve(reserve)) {
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
        require(tradeLogic.listPairForReserve(IKyberReserve(reserve), token, ethToToken, tokenToEth, add));

        if (ethToToken) {
            emit ListReservePairs(reserve, ETH_TOKEN_ADDRESS, token, add);
        }

        if (tokenToEth) {
            if (add) {
                require(token.approve(reserve, 2**255), "approve max token amt failed"); // approve infinity
            } else {
                require(token.approve(reserve, 0), "approve 0 token amt failed");
            }
            emit ListReservePairs(reserve, token, ETH_TOKEN_ADDRESS, add);
        }

        return true;
    }

    event FeeHandlerUpdated(IKyberFeeHandler newHandler);
    event TradeLogicUpdated(IKyberTradeLogic tradeLogic);
    event GasHelperUpdated(IGasHelper gasHelper);
    
    function setContracts(IKyberFeeHandler _feeHandler, 
        IKyberTradeLogic _tradeLogic,
        IGasHelper _gasHelper) 
        external onlyAdmin 
    {
        require(_feeHandler != IKyberFeeHandler(0), "feeHandler 0");
        require(_tradeLogic != IKyberTradeLogic(0), "tradeLogic 0");

        if(_feeHandler != feeHandler) {
            emit FeeHandlerUpdated(_feeHandler);
            feeHandler = _feeHandler;
        }

        if(_tradeLogic != tradeLogic) {
            emit TradeLogicUpdated(_tradeLogic);
            tradeLogic = _tradeLogic;
        }

        if((_gasHelper != IGasHelper(0)) && (_gasHelper != gasHelper)) {
            emit GasHelperUpdated(_gasHelper);
            gasHelper = _gasHelper;
        }
    }

    event KyberDAOUpdated(IKyberDAO newDAO);
    
    function setDAOContract(IKyberDAO _kyberDAO) external onlyAdmin {
        require(_kyberDAO != IKyberDAO(0), "kyberDAO 0");
        emit KyberDAOUpdated(_kyberDAO);
        kyberDAO = _kyberDAO;
    }

    event KyberNetworkParamsSet(uint maxGasPrice, uint negligibleRateDiffBps);

    function setParams(uint _maxGasPrice, uint _negligibleRateDiffBps) external onlyAdmin {
        maxGasPriceValue = _maxGasPrice;
        require(tradeLogic.setNegligbleRateDiffBps(_negligibleRateDiffBps));
        emit KyberNetworkParamsSet(maxGasPriceValue, _negligibleRateDiffBps);
    }

    event KyberNetworkSetEnable(bool isEnabled);

    function setEnable(bool _enable) external onlyAdmin {
        if (_enable) {
            require(feeHandler != IKyberFeeHandler(0), "feeHandler 0");
            require(tradeLogic != IKyberTradeLogic(0), "tradeLogic 0");
            require(kyberProxyArray.length > 0, "proxy 0");
        }
        isEnabled = _enable;

        emit KyberNetworkSetEnable(isEnabled);
    }

    event KyberProxyAdded(address proxy, address sender);
    event KyberProxyRemoved(address proxy);
    
    function addKyberProxy(address networkProxy) external onlyAdmin {
        require(networkProxy != address(0), "proxy 0");
        require(!kyberProxyContracts[networkProxy], "proxy exist");
        
        kyberProxyArray.push(networkProxy);
        
        kyberProxyContracts[networkProxy] = true;
        emit KyberProxyAdded(networkProxy, msg.sender);
    }
    
    function removeKyberProxy(address networkProxy) external onlyAdmin {
        require(kyberProxyContracts[networkProxy], "proxy ?");
        
        uint proxyIndex = 2 ** 255;
        
        for (uint i = 0; i < kyberProxyArray.length; i++) {
            if(kyberProxyArray[i] == networkProxy) {
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
    
    //backward compatible
    function getExpectedRate(ERC20 src, ERC20 dest, uint srcQty) external view
        returns (uint expectedRate, uint worstRate)
    {
        if (src == dest) return (0, 0);
        uint qty = srcQty & ~PERM_HINT_GET_RATE;

        TradeData memory tData = initTradeInput({
            trader: address(uint160(0)),
            src: src,
            dest: dest,
            srcAmount: qty,
            destAddress: address(uint160(0)),
            maxDestAmount: 2 ** 255,
            minConversionRate: 0,
            platformWallet: address(uint160(0)),
            platformFeeBps: 0
        });
        
        tData.networkFeeBps = getNetworkFee();

        calcRatesAndAmounts(src, dest, qty, tData, "");
        
        expectedRate = tData.rateOnlyNetworkFee;
        worstRate = expectedRate * 97 / 100; // backward compatible formula
    }

    // new APIs
    function getExpectedRateWithHintAndFee(IERC20 src, IERC20 dest, uint srcQty, uint platformFeeBps, bytes calldata hint) 
        external view
        returns (uint rateNoFees, uint rateAfterNetworkFee, uint rateAfterAllFees)
    {
        if (src == dest) return (0, 0, 0);
        
        TradeData memory tData = initTradeInput({
            trader: address(uint160(0)),
            src: src,
            dest: dest,
            srcAmount: srcQty,
            destAddress: address(uint160(0)),
            maxDestAmount: 2 ** 255,
            minConversionRate: 0,
            platformWallet: address(uint160(0)),
            platformFeeBps: platformFeeBps
        });
        
        tData.networkFeeBps = getNetworkFee();
        
        calcRatesAndAmounts(src, dest, srcQty, tData, hint);
        
        rateNoFees = calcRateFromQty(srcQty, tData.destAmountNoFee, tData.tokenToEth.decimals, tData.ethToToken.decimals);
        rateAfterNetworkFee = tData.rateOnlyNetworkFee;
        rateAfterAllFees = calcRateFromQty(srcQty, tData.actualDestAmount, tData.tokenToEth.decimals, tData.ethToToken.decimals);
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

    function getContracts() external view 
        returns(address kyberDaoAddress, address feeHandlerAddress, address tradeLogicAddress) 
    {
        return(address(kyberDAO), address(feeHandler), address(tradeLogic));
    }

    function getNetworkData() external view returns(
        uint negligibleDiffBps,
        uint networkFeeBps,    
        uint expiryBlock)
    {
        (networkFeeBps, expiryBlock) = decodeNetworkFee(networkFeeData);
        negligibleDiffBps = tradeLogic.negligibleRateDiffBps();
        return(negligibleDiffBps, networkFeeBps, expiryBlock);
    }

    function maxGasPrice() external view returns(uint) {
        return maxGasPriceValue;
    }

    function enabled() external view returns(bool) {
        return isEnabled;
    }

    function getRatesForToken(IERC20 token, uint optionalBuyAmount, uint optionalSellAmount) external view
        returns(IKyberReserve[] memory buyReserves, uint[] memory buyRates,
            IKyberReserve[] memory sellReserves, uint[] memory sellRates)
    {
        return tradeLogic.getRatesForToken(token, optionalBuyAmount, optionalSellAmount, getNetworkFee());
    }

    function getPricesForToken(IERC20 token, uint optionalBuyAmount, uint optionalSellAmount) external view
        returns(IKyberReserve[] memory buyReserves, uint[] memory buyRates, IKyberReserve[] memory sellReserves, 
            uint[] memory sellRates)
    {
        return tradeLogic.getRatesForToken(token, optionalBuyAmount, optionalSellAmount, 0);
    }

    struct TradingReserves {
        IKyberReserve[] addresses;
        bytes8[] ids;
        uint[] rates; // rate per chosen reserve
        bool[] isFeePaying;
        uint[] splitValuesBps;
        uint decimals;
        // IKyberHint.HintType tradeType;
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
    
    // enable up to x reserves for token to Eth and x for eth to token
    // if not hinted reserves use 1 reserve for each trade side
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

    function calcRatesAndAmounts(IERC20 src, IERC20 dest, uint srcAmount, TradeData memory tData, bytes memory hint)
        internal view
    // function should set all TradeData so it can later be used without any ambiguity
    {
        //init info structure
        uint[] memory info = new uint[](uint(IKyberTradeLogic.InfoIndex.infoLength));
        info[uint(IKyberTradeLogic.InfoIndex.networkFeeBps)] = tData.networkFeeBps;
        info[uint(IKyberTradeLogic.InfoIndex.platformFeeBps)] = tData.input.platformFeeBps;
        info[uint(IKyberTradeLogic.InfoIndex.srcAmount)] = srcAmount;

        uint[] memory results;
        IKyberReserve[] memory reserveAddresses;
        uint[] memory rates;
        uint[] memory splitValuesBps;
        bool[] memory isFeePaying;
        bytes8[] memory ids;

        (results, reserveAddresses, rates, splitValuesBps, isFeePaying, ids) = 
            tradeLogic.calcRatesAndAmounts(src, dest, tData.tokenToEth.decimals, tData.ethToToken.decimals, info, hint);
        
        unpackResults(results, reserveAddresses, rates, splitValuesBps, isFeePaying, ids, tData);

        //cheaper to calculate than pack and unpack these values
        tData.networkFeeWei = tData.tradeWei * tData.networkFeeBps / BPS * tData.feePayingReservesBps / BPS;
        tData.platformFeeWei = tData.tradeWei * tData.input.platformFeeBps / BPS;
        tData.rateOnlyNetworkFee = calcRateFromQty(srcAmount, tData.destAmountWithNetworkFee, tData.tokenToEth.decimals, tData.ethToToken.decimals);
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
        //uint start = printGas("start unpack", 0);
        uint tokenToEthNumReserves = results[uint(IKyberTradeLogic.ResultIndex.t2eNumReserves)];
        
        storeTradeData(tData.tokenToEth, reserveAddresses, rates, splitValuesBps, isFeePaying, ids, 0, tokenToEthNumReserves);
        storeTradeData(tData.ethToToken, reserveAddresses, rates, splitValuesBps, isFeePaying, ids,
            tokenToEthNumReserves, reserveAddresses.length - tokenToEthNumReserves);
        
        tData.tradeWei = results[uint(IKyberTradeLogic.ResultIndex.tradeWei)];
        tData.numFeePayingReserves = results[uint(IKyberTradeLogic.ResultIndex.numFeePayingReserves)];
        tData.feePayingReservesBps = results[uint(IKyberTradeLogic.ResultIndex.feePayingReservesBps)];
        tData.destAmountNoFee = results[uint(IKyberTradeLogic.ResultIndex.destAmountNoFee)];
        tData.destAmountWithNetworkFee = results[uint(IKyberTradeLogic.ResultIndex.destAmountWithNetworkFee)];
        tData.actualDestAmount = results[uint(IKyberTradeLogic.ResultIndex.actualDestAmount)];
        
        //printGas("end unpack", start);
    }
    
    function storeTradeData(TradingReserves memory tradingReserves, IKyberReserve[] memory reserveAddresses,
        uint[] memory rates, uint[] memory splitValuesBps, bool[] memory isFeePaying, bytes8[] memory ids, uint startIndex, uint numReserves
    ) internal pure {
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

    function handleFees(TradeData memory tData) internal returns(bool) {
        //no need to handle fees if no fee paying reserves
        if ((tData.numFeePayingReserves == 0) && (tData.platformFeeWei == 0)) return true;

        // Updates reserve eligibility and rebate percentages
        (address[] memory rebateWallets, uint[] memory rebatePercentBps) = calcualteRebateSplitPerWallet(tData);

        uint sentFee = tData.networkFeeWei + tData.platformFeeWei;

        // Send total fee amount to fee handler with reserve data.
        require(
            feeHandler.handleFees.value(sentFee)(rebateWallets, rebatePercentBps,
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

        for(uint i = 0; i < resList.isFeePaying.length; i ++) {
            if(resList.isFeePaying[i]) {
                rebateWallets[_index] = reserveRebateWallet[address(resList.addresses[i])];
                rebatePercentBps[_index] = resList.splitValuesBps[i] * BPS / feePayingReservesBps;
                _index ++;
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

        // destAmount = printGas("start_tr", 0, Module.NETWORK);
        require(verifyTradeInputValid(tData.input, tData.networkFeeBps), "invalid");
        
        // amounts excluding fees
        // destAmount = printGas("start to calc", destAmount, Module.NETWORK);
        calcRatesAndAmounts(tData.input.src, tData.input.dest, tData.input.srcAmount, tData, hint);
        // destAmount = printGas("calcRatesAndAmounts", destAmount, Module.NETWORK);

        require(tData.rateOnlyNetworkFee > 0, "0 rate");
        require(tData.rateOnlyNetworkFee < MAX_RATE, "rate > MAX_RATE");
        require(tData.rateOnlyNetworkFee >= tData.input.minConversionRate, "rate < minConvRate");

        if (gasHelper != IGasHelper(0)) {
            gasHelper.freeGas(tData.input.platformWallet, tData.input.src, tData.input.dest, tData.tradeWei,
            tData.tokenToEth.ids, tData.ethToToken.ids);
        }

        uint actualSrcAmount;

        if (tData.actualDestAmount > tData.input.maxDestAmount) {
            // notice tData passed by reference. and updated
            tData.actualDestAmount = tData.input.maxDestAmount;
            actualSrcAmount = calcTradeSrcAmountFromDest(tData);

            require(handleChange(tData.input.src, tData.input.srcAmount, actualSrcAmount, tData.input.trader));
        } else {
            actualSrcAmount = tData.input.srcAmount;
        }

        // destAmount = printGas("calc to trade", destAmount, Module.NETWORK);
        require(doReserveTrades(     //src to ETH
                tData.input.src,
                actualSrcAmount,
                ETH_TOKEN_ADDRESS,
                address(this),
                tData,
                tData.tradeWei)); //tData.tradeWei (expectedDestAmount) not used if destAddress == address(this)

        require(doReserveTrades(     //Eth to dest
                ETH_TOKEN_ADDRESS,
                tData.tradeWei - tData.networkFeeWei - tData.platformFeeWei,
                tData.input.dest,
                tData.input.destAddress,
                tData,
                tData.actualDestAmount));
// destAmount = printGas("trade part", destAmount, Module.NETWORK);
        require(handleFees(tData));
// destAmount = printGas("handle fees part", destAmount, Module.NETWORK);
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

        // printGas("end_tr", 0);
        return (tData.actualDestAmount);
    }
    /* solhint-enable function-max-lines */

    /// @notice use token address ETH_TOKEN_ADDRESS for ether
    /// @dev do one trade with a reserve
    /// @param src Src token
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
            if (destAddress != (address(this)))
                destAddress.transfer(amount);
            return true;
        }

        TradingReserves memory reservesData = src == ETH_TOKEN_ADDRESS? tData.ethToToken : tData.tokenToEth;
        uint callValue;
        uint srcAmountSoFar;

        for(uint i = 0; i < reservesData.addresses.length; i++) {
            uint splitAmount = i == (reservesData.splitValuesBps.length - 1) ? (amount - srcAmountSoFar) : reservesData.splitValuesBps[i] * amount / BPS;
            srcAmountSoFar += splitAmount;
            callValue = (src == ETH_TOKEN_ADDRESS)? splitAmount : 0;

            // reserve sends tokens/eth to network. network sends it to destination
            // todo: if reserve supports returning destTokens call accordingly
            require(reservesData.addresses[i].trade.value(callValue)(src, splitAmount, dest, address(this), reservesData.rates[i], true));
        }

        if (destAddress != address(this)) {
            //for E2T, T2T, transfer tokens to destAddress
            require(dest.transfer(destAddress, expectedDestAmount));
        }

        return true;
    }

    /// when user sets max dest amount we have too many source tokens = change. send it back to user.
    function handleChange (IERC20 src, uint srcAmount, uint requiredSrcAmount, address payable trader) internal returns (bool) {

        if (requiredSrcAmount < srcAmount) {
            //if there is "change" send back to trader
            if (src == ETH_TOKEN_ADDRESS) {
                trader.transfer(srcAmount - requiredSrcAmount);
            } else {
                require(src.transfer(trader, (srcAmount - requiredSrcAmount)));
            }
        }

        return true;
    }

    /// @dev checks a trade input validity. including correct src amounts
    /// @param input Trade input structure
    /// @param networkFeeBps network fee in bps.
    /// @return true if tradeInput is valid
    function verifyTradeInputValid(TradeInput memory input, uint networkFeeBps) internal view returns(bool) {
        // IERC20 src, uint srcAmount, IERC20 dest, address destAddress)
        
        require(isEnabled, "!network");
        require(kyberProxyContracts[msg.sender], "bad sender");
        require(tx.gasprice <= maxGasPriceValue, "gas price");
        require(input.srcAmount <= MAX_QTY, "srcAmt > MAX_QTY");
        require(input.srcAmount != 0, "0 srcAmt");
        require(input.destAddress != address(0), "dest add 0");
        require(input.src != input.dest, "src = dest");
        require(input.platformFeeBps + networkFeeBps < BPS, "fees high");
        
        if (input.src == ETH_TOKEN_ADDRESS) {
            require(msg.value == input.srcAmount, "bad Eth qty");
        } else {
            require(msg.value == 0, "big Eth qty");
            //funds should have been moved to this contract already.
            require(input.src.balanceOf(address(this)) >= input.srcAmount, "srcTok low");
        }

        return true;
    }
    
    // get fee view function. for get expected rate
    function getNetworkFee() internal view returns(uint networkFeeBps) {
        uint expiryBlock;
        (networkFeeBps, expiryBlock) = decodeNetworkFee(networkFeeData);

        if (expiryBlock < block.number && kyberDAO != IKyberDAO(0)) {
            (networkFeeBps, expiryBlock) = kyberDAO.getLatestNetworkFeeData();
        }
        // todo: don't revert if DAO reverts. just return exsiting value.
    }
    
    // get fee function for trade. get fee and update data if expired.
    // can be triggered from outside. to avoid extra gas cost on one taker.
    function getAndUpdateNetworkFee() public returns(uint networkFeeBps) {
        uint expiryBlock;

        (networkFeeBps, expiryBlock) = decodeNetworkFee(networkFeeData);

        if (expiryBlock < block.number && kyberDAO != IKyberDAO(0)) {
            (networkFeeBps, expiryBlock) = kyberDAO.getLatestNetworkFeeDataWithCache();
            networkFeeData = encodeNetworkFee(expiryBlock, networkFeeBps);
        }
    }
    
    function decodeNetworkFee(uint feeData) internal pure returns(uint feeBps, uint expiryBlock) {
        feeBps = feeData & ((1 << 128) - 1);
        expiryBlock = (feeData / (1 << 128)) & ((1 << 128) - 1);
    }
    
    function encodeNetworkFee(uint expiryBlock, uint feeBps) internal pure returns(uint feeData) {
        return ((expiryBlock << 128) + feeBps);
    }
}
