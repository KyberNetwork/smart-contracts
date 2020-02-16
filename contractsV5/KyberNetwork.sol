pragma  solidity 0.5.11;

import "./WithdrawableV5.sol";
import "./UtilsV5.sol";
import "./ReentrancyGuard.sol";
import "./IKyberNetwork.sol";
import "./IKyberReserve.sol";
import "./IFeeHandler.sol";
import "./IKyberDAO.sol";
import "./ITradeLogic.sol";


////////////////////////////////////////////////////////////////////////////////////////////////////////
/// @title Kyber Network main contract
contract KyberNetwork is Withdrawable, Utils, IKyberNetwork, ReentrancyGuard {

    IFeeHandler       internal feeHandler;
    IKyberDAO         internal kyberDAO;
    ITradeLogic  internal tradeLogic;

    uint            takerFeeData; // data is feeBps and expiry block
    uint            maxGasPriceValue = 50 * 1000 * 1000 * 1000; // 50 gwei
    bool            isEnabled = false; // network is enabled

    uint  constant PERM_HINT_GET_RATE = 1 << 255; //for backwards compatibility
    
    mapping(address=>bool) internal kyberProxyContracts;
    address[] internal kyberProxyArray;
    
    IKyberReserve[] internal reserves;
    mapping(address=>address) public reserveRebateWallet;

    constructor(address _admin) public 
        Withdrawable(_admin)
    { /* empty body */ }

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
        TradeData memory tradeData = initTradeData({
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

     // backward compatible
    function tradeWithHint(address trader, ERC20 src, uint srcAmount, ERC20 dest, address destAddress,
        uint maxDestAmount, uint minConversionRate, address walletId, bytes calldata hint)
        external payable returns(uint destAmount)
    {
        TradeData memory tradeData = initTradeData({
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

    event AddReserveToNetwork (
        address indexed reserve,
        bytes8 indexed reserveId,
        bool isFeePaying,
        address indexed rebateWallet,
        bool add);

    /// @notice can be called only by operator
    /// @dev add or deletes a reserve to/from the network.
    /// @param reserve The reserve address.
    function addReserve(address reserve, bytes8 reserveId, bool isFeePaying, address wallet) external onlyOperator returns(bool) {
        //TODO: call TradeLogic.addReserve
        require(tradeLogic.addReserve(reserve, reserveId, isFeePaying));
        reserves.push(IKyberReserve(reserve));

        reserveRebateWallet[reserve] = wallet;

        emit AddReserveToNetwork(reserve, reserveId, isFeePaying, wallet, true);

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
        
        reserves[reserveIndex] = reserves[reserves.length - 1];
        reserves.length--;
        
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

    event FeeHandlerUpdated(IFeeHandler newHandler);
    event KyberDAOUpdated(IKyberDAO newDAO);
    event TradeLogicUpdated(ITradeLogic tradeLogic);
    
    function setContracts(IFeeHandler _feeHandler, IKyberDAO _kyberDAO, ITradeLogic _tradeLogic) external onlyAdmin {
        require(_feeHandler != IFeeHandler(0), "feeHandler 0");
        require(_kyberDAO != IKyberDAO(0), "kyberDAO 0");
        require(_tradeLogic != ITradeLogic(0), "tradeLogic 0");

        if(_feeHandler != feeHandler) {
            emit FeeHandlerUpdated(_feeHandler);
            feeHandler = _feeHandler;
        }
        
        if(_kyberDAO != kyberDAO) {
            emit KyberDAOUpdated(_kyberDAO);
            kyberDAO = _kyberDAO;
        }

        if(_tradeLogic != tradeLogic) {
            emit TradeLogicUpdated(_tradeLogic);
            tradeLogic = _tradeLogic;
        }
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
            require(feeHandler != IFeeHandler(0), "no feeHandler set");
            require(tradeLogic != ITradeLogic(0), "no tradeLogic set");
            require(kyberProxyArray.length > 0, "no proxy set");
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
        require(kyberProxyContracts[networkProxy], "proxy not found");
        
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

        TradeData memory tradeData = initTradeData({
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
        
        tradeData.calcIn[uint(ITradeLogic.CalcIn.takerFeeBps)] = getTakerFee();

        calcRatesAndAmounts(src, dest, tradeData, "");
        
        expectedRate = tradeData.rateWithNetworkFee;
        worstRate = expectedRate * 97 / 100; // backward compatible formula
    }

    // new APIs
    function getExpectedRateWithHintAndFee(IERC20 src, IERC20 dest, uint srcQty, uint platformFeeBps, bytes calldata hint) 
        external view
        returns (uint rateNoFees, uint rateAfterNetworkFees, uint rateAfterAllFees)
    {
        if (src == dest) return (0, 0, 0);
        
        TradeData memory tradeData = initTradeData({
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
        
        tradeData.calcIn[uint(ITradeLogic.CalcIn.takerFeeBps)] = getTakerFee();
        
        calcRatesAndAmounts(src, dest, tradeData, hint);
        
        rateNoFees = calcRateFromQty(srcQty, tradeData.calcOut[uint(ITradeLogic.CalcOut.destAmountNoFee)], 
            tradeData.calcIn[uint(ITradeLogic.CalcIn.t2eDecimals)], tradeData.calcIn[uint(ITradeLogic.CalcIn.e2tDecimals)]);
        rateAfterNetworkFees = tradeData.rateWithNetworkFee;
        rateAfterAllFees = calcRateFromQty(srcQty, tradeData.calcOut[uint(ITradeLogic.CalcOut.actualDestAmount)], 
            tradeData.calcIn[uint(ITradeLogic.CalcIn.t2eDecimals)], tradeData.calcIn[uint(ITradeLogic.CalcIn.e2tDecimals)]);
    }

    function initTradeData(
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
    internal view returns (TradeData memory tradeData)
    {
        tradeData.input.trader = trader;
        tradeData.input.src = src;
        tradeData.input.dest = dest;
        tradeData.input.destAddress = destAddress;
        tradeData.input.maxDestAmount = maxDestAmount;
        tradeData.input.minConversionRate = minConversionRate;
        tradeData.input.platformWallet = platformWallet;

        tradeData.calcIn = new uint[](uint(ITradeLogic.CalcIn.size));
        tradeData.calcIn[uint(ITradeLogic.CalcIn.srcAmount)] = srcAmount;

        // tradeData.input.platformFeeBps = platformFeeBps;
        
        // init inputs common to get rate and trade.
        tradeData.calcIn[uint(ITradeLogic.CalcIn.t2eDecimals)] = getDecimals(src); 

        tradeData.calcIn[uint(ITradeLogic.CalcIn.e2tDecimals)] = getDecimals(dest); 
        tradeData.calcIn[uint(ITradeLogic.CalcIn.platformFeeBps)] = platformFeeBps;
    }

    function getContracts() external view 
        returns(address kyberDaoAddress, address feeHandlerAddress, address tradeLogicAddress) 
    {
        return(address(kyberDAO), address(feeHandler), address(tradeLogic));
    }

    function getNetworkData() external view returns(
        bool networkEnabled, 
        uint negligibleDiffBps, 
        uint maximumGasPrice,
        uint takerFeeBps,        
        uint expiryBlock) 
    {
        (takerFeeBps, expiryBlock) = decodeTakerFee(takerFeeData);
        negligibleDiffBps = tradeLogic.negligibleRateDiffBps();
        return(isEnabled, negligibleDiffBps, maxGasPriceValue, takerFeeBps, expiryBlock);
    }

    function getRatesForToken(IERC20 token, uint optionalBuyAmount, uint optionalSellAmount) external view
        returns(IKyberReserve[] memory buyReserves, uint[] memory buyRates,
            IKyberReserve[] memory sellReserves, uint[] memory sellRates)
    {
        return tradeLogic.getRatesForToken(token, optionalBuyAmount, optionalSellAmount, getTakerFee());
    }

    function getPricesForToken(IERC20 token, uint optionalBuyAmount, uint optionalSellAmount) external view
        returns(IKyberReserve[] memory buyReserves, uint[] memory buyRates, IKyberReserve[] memory sellReserves, 
            uint[] memory sellRates)
    {
        return tradeLogic.getRatesForToken(token, optionalBuyAmount, optionalSellAmount, 0);
    }

    // struct TradingReserves {
    //     IKyberReserve[] addresses;
    //     uint[] rates; // rate per chosen reserve for token to eth
    //     bool[] isFeePaying;
    //     uint[] splitValuesBps;
    //     uint decimals;
    //     // IKyberHint.HintType tradeType;
    // }

    struct TradeInput {
        address payable trader;
        IERC20 src;
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
        
        uint[] calcIn;
        uint[] calcOut;

        IKyberReserve[] resAddresses;
        uint[] rates;
        uint[] splitValuesBps;
        bool[] isFeePaying;
        bytes8[] t2eResIds;
        bytes8[] e2tResIds;

        // TradingReserves tokenToEth;
        // TradingReserves ethToToken;
        
        //uint tradeWei;
        //uint networkFeeWei;
        //uint platformFeeWei;

        //uint takerFeeBps;
        
        //uint numFeePayingReserves;
        //uint feePayingReservesBps; // what part of this trade is fee paying. for token to token - up to 200%
        
        //uint destAmountNoFee;
        //uint destAmountWithNetworkFee;
        //uint actualDestAmount; // all fees

        // TODO: do we need to save rate locally. seems dest amounts enough.
        // uint rateNoFee;
        uint rateWithNetworkFee;
        // uint rateWithAllFees;
    }

    function calcRatesAndAmounts(IERC20 src, IERC20 dest, TradeData memory tradeData, bytes memory hint)
        internal view
    // function should set all TradeData so it can later be used without any ambiguity
    {
        //init fees structure
        //uint[] memory fees = new uint[](uint8(IKyberTradeLogic.FeesIndex.feesLength));
        // fees[uint8(IKyberTradeLogic.FeesIndex.takerFeeBps)] = tradeData.takerFeeBps;
        // fees[uint8(IKyberTradeLogic.FeesIndex.platformFeeBps)] = tradeData.input.platformFeeBps;
        
        // uint[] memory results;
        // IKyberReserve[] memory resAddresses;
        // uint[] memory rates;
        // uint[] memory splitValuesBps;
        // bool[] memory isFeePaying;
        
        (tradeData.calcOut, tradeData.resAddresses, tradeData.rates, tradeData.splitValuesBps, 
            tradeData.isFeePaying//, tradeData.t2eResIds, tradeData.e2tResIds) = 
        ) =
            tradeLogic.calcRatesAndAmounts(src, dest, tradeData.calcIn, hint);
        
        // unpackResults(results, resAddresses, rates, splitValuesBps, isFeePaying, tradeData);
        tradeData.rateWithNetworkFee = 
            calcRateFromQty(tradeData.calcIn[uint(ITradeLogic.CalcIn.srcAmount)], tradeData.calcOut[uint(ITradeLogic.CalcOut.destAmountWithNetworkFee)], 
            tradeData.calcIn[uint(ITradeLogic.CalcIn.t2eDecimals)], tradeData.calcIn[uint(ITradeLogic.CalcIn.e2tDecimals)]);
    }
    
    // function unpackResults(
    //     uint[] memory results,
    //     IKyberReserve[] memory resAddresses,
    //     uint[] memory rates,
    //     uint[] memory splitValuesBps,
    //     bool[] memory isFeePaying,
    //     TradeData memory tradeData
    //     ) internal view 
    // {
    //     //uint start = printGas("start unpack", 0);
    //     uint tokenToEthNumReserves = results[uint8(IKyberTradeLogic.ResultIndex.t2eNumReserves)];
    //     uint ethToTokenNumReserves = results[uint8(IKyberTradeLogic.ResultIndex.e2tNumReserves)];
        
    //     storeTradeData(tradeData.tokenToEth, resAddresses, rates, splitValuesBps, isFeePaying, 0, tokenToEthNumReserves);
    //     storeTradeData(tradeData.ethToToken, resAddresses, rates, splitValuesBps, isFeePaying, tokenToEthNumReserves, ethToTokenNumReserves);
        
    //     tradeData.tradeWei = results[uint8(IKyberTradeLogic.ResultIndex.tradeWei)];
    //     tradeData.networkFeeWei = results[uint8(IKyberTradeLogic.ResultIndex.networkFeeWei)];
    //     tradeData.calcOut[uint(ITradeLogic.CalcOut.platformFeeWei)], = results[uint8(IKyberTradeLogic.ResultIndex.platformFeeWei)];
    //     tradeData.numFeePayingReserves = results[uint8(IKyberTradeLogic.ResultIndex.numFeePayingReserves)];
    //     tradeData.feePayingReservesBps = results[uint8(IKyberTradeLogic.ResultIndex.feePayingReservesBps)];
    //     tradeData.destAmountNoFee = results[uint8(IKyberTradeLogic.ResultIndex.destAmountNoFee)];
    //     tradeData.calcOut[uint(ITradeLogic.CalcOut.actualDestAmount)], = results[uint8(IKyberTradeLogic.ResultIndex.actualDestAmount)];
    //     tradeData.destAmountWithNetworkFee = results[uint8(IKyberTradeLogic.ResultIndex.destAmountWithNetworkFee)];
    //     //printGas("end unpack", start);
    // }
    
    // function storeTradeData(TradingReserves memory tradingReserves, IKyberReserve[] memory resAddresses, 
    //     uint[] memory rates, uint[] memory splitValuesBps, bool[] memory isFeePaying, uint startIndex, uint numReserves
    // ) internal pure {
    //     //init arrays
    //     tradingReserves.addresses = new IKyberReserve[](numReserves);
    //     tradingReserves.rates = new uint[](numReserves);
    //     tradingReserves.splitValuesBps = new uint[](numReserves);
    //     tradingReserves.isFeePaying = new bool[](numReserves);

    //     //store info
    //     for (uint i = startIndex; i < startIndex + numReserves; i++) {
    //         tradingReserves.addresses[i - startIndex] = resAddresses[i];
    //         tradingReserves.rates[i - startIndex] = rates[i];
    //         tradingReserves.splitValuesBps[i - startIndex] = splitValuesBps[i];
    //         tradingReserves.isFeePaying[i - startIndex] = isFeePaying[i];
    //     }
    // }

    event PlatformFeeSent(address recipient, uint fees);

    function handleFees(TradeData memory tradeData) internal returns(bool) {

        if (tradeData.calcOut[uint(ITradeLogic.CalcOut.platformFeeWei)] != 0) {
            // Sending platform fee to taker platform
            (bool success, ) =  tradeData.input.platformWallet.call.value(tradeData.calcOut[uint(ITradeLogic.CalcOut.platformFeeWei)])("");
            require(success, "PLAT_FEE_TX_FAIL");
            emit PlatformFeeSent(tradeData.input.platformWallet, tradeData.calcOut[uint(ITradeLogic.CalcOut.platformFeeWei)]);
        }

        //no need to handle fees if no fee paying reserves
        if (tradeData.calcOut[uint(ITradeLogic.CalcOut.numFeePayingReserves)] == 0) return true;

        // create array of rebate wallets + fee percent per reserve
        // fees should add up to 100%.
        address[] memory eligibleWallets = new address[](tradeData.calcOut[uint(ITradeLogic.CalcOut.numFeePayingReserves)]);
        uint[] memory rebatePercentages = new uint[](tradeData.calcOut[uint(ITradeLogic.CalcOut.numFeePayingReserves)]);

        // Updates reserve eligibility and rebate percentages
        updateEligibilityAndRebates(eligibleWallets, rebatePercentages, tradeData);

        // Send total fee amount to fee handler with reserve data.
        require(
            feeHandler.handleFees.value(tradeData.calcOut[uint(ITradeLogic.CalcOut.networkFeeWei)])
                (eligibleWallets, rebatePercentages), "FEE_TX_FAIL"
        );
        return true;
    }

    function updateEligibilityAndRebates(
        address[] memory eligibleWallets,
        uint[] memory rebatePercentages,
        TradeData memory tradeData
    ) internal view
    {
        uint index; 
        // Parse ethToToken list
        index = parseReserveList(
            eligibleWallets,
            rebatePercentages,
            tradeData,
            index,
            tradeData.calcOut[uint(ITradeLogic.CalcOut.feePayingReservesTotalBps)],
            0,
            tradeData.calcOut[uint(ITradeLogic.CalcOut.t2eNumReserves)]
        );

        // Parse tokenToEth list
        index = parseReserveList(
            eligibleWallets,
            rebatePercentages,
            tradeData,
            index,
            tradeData.calcOut[uint(ITradeLogic.CalcOut.feePayingReservesTotalBps)],
            tradeData.calcOut[uint(ITradeLogic.CalcOut.t2eNumReserves)],
            tradeData.resAddresses.length            
        );
    }

    function parseReserveList(
        address[] memory eligibleWallets,
        uint[] memory rebatePercentages,
        TradeData memory tradeData,
        uint rebateIndex,
        uint iStart,
        uint iEnd,
        uint feePayingReservesBps
    ) internal view returns(uint) {
        uint i;
        uint _rebateIndex = rebateIndex;

        for(i = iStart; i < iEnd; i ++) {
            if(tradeData.isFeePaying[i]) {
                eligibleWallets[_rebateIndex] = reserveRebateWallet[address(tradeData.resAddresses[i])];
                rebatePercentages[_rebateIndex] = getRebatePercentage(tradeData.splitValuesBps[i], feePayingReservesBps);
                _rebateIndex ++;
            }
        }
        return _rebateIndex;
    }

    function getRebatePercentage(uint splitValuesBps, uint feePayingReservesBps) internal pure returns(uint) {
        return splitValuesBps * 100 / feePayingReservesBps;
    }

    function calcTradeSrcAmount(uint srcDecimals, uint destDecimals, uint destAmount, uint[] memory rates, 
                                uint[] memory splitValuesBps, uint iStart, uint iEnd)
        internal pure returns (uint srcAmount)
    {
        uint destAmountSoFar;

        for (uint i = iStart; i < iEnd; i++) {
            uint destAmountSplit = i == (iEnd - 2) ? 
                (destAmount - destAmountSoFar) : splitValuesBps[i] * destAmount / BPS;
            destAmountSoFar += destAmountSplit;

            srcAmount += calcSrcQty(destAmountSplit, srcDecimals, destDecimals, rates[i]);
        }
    }

    function calcTradeSrcAmountFromDest (TradeData memory tradeData)
        internal pure returns(uint actualSrcAmount)
    {
        uint tradeWei;
        if (tradeData.input.dest != ETH_TOKEN_ADDRESS) {
            tradeWei = calcTradeSrcAmount(tradeData.calcIn[uint(ITradeLogic.CalcIn.e2tDecimals)], ETH_DECIMALS, 
                tradeData.input.maxDestAmount, tradeData.rates, tradeData.splitValuesBps, 
                tradeData.calcOut[uint(ITradeLogic.CalcOut.t2eNumReserves)], tradeData.rates.length);
        } else {
            tradeWei = tradeData.input.maxDestAmount;
        }

        tradeData.calcOut[uint(ITradeLogic.CalcOut.networkFeeWei)] = 
            tradeWei * tradeData.calcIn[uint(ITradeLogic.CalcIn.takerFeeBps)] * 
            tradeData.calcOut[uint(ITradeLogic.CalcOut.feePayingReservesTotalBps)] / (BPS * BPS);
        tradeData.calcOut[uint(ITradeLogic.CalcOut.platformFeeWei)] = tradeWei * tradeData.calcIn[uint(ITradeLogic.CalcIn.platformFeeBps)] / BPS;
        tradeData.calcOut[uint(ITradeLogic.CalcOut.tradeWei)] = tradeWei;

        if (tradeData.input.src != ETH_TOKEN_ADDRESS) {
            actualSrcAmount = calcTradeSrcAmount(ETH_DECIMALS, tradeData.calcIn[uint(ITradeLogic.CalcIn.t2eDecimals)], 
                tradeWei, tradeData.rates, tradeData.splitValuesBps, 0, 
                tradeData.calcOut[uint(ITradeLogic.CalcOut.t2eNumReserves)]);
        } else {
            actualSrcAmount = tradeWei;
        }
    
        require(actualSrcAmount <= tradeData.calcIn[uint(ITradeLogic.CalcIn.srcAmount)], "actualSrcAmt > given srcAmt");
    }

    event KyberTrade(address indexed trader, IERC20 src, IERC20 dest, uint srcAmount, uint dstAmount,
        address destAddress, uint ethWeiValue, uint networkFeeWei, uint customPlatformFeeWei, 
        bytes8[] e2tReserves, bytes8[] t2eReserves);

    /* solhint-disable function-max-lines */
    //  Most of the lines here are functions calls spread over multiple lines. We find this function readable enough
    /// @notice use token address ETH_TOKEN_ADDRESS for ether
    /// @dev trade api for kyber network.
    /// @param tradeData.input structure of trade inputs
    function trade(TradeData memory tradeData, bytes memory hint) 
        internal
        nonReentrant
        returns(uint destAmount) 
    {
        destAmount = printGas("start_tr", 0, Module.NETWORK);
        require(verifyTradeValid(tradeData.input.src, tradeData.calcIn[uint(ITradeLogic.CalcIn.srcAmount)], 
            tradeData.input.dest, tradeData.input.destAddress), "invalid");
        
        tradeData.calcIn[uint(ITradeLogic.CalcIn.takerFeeBps)] = getAndUpdateTakerFee();
        
        // amounts excluding fees
        destAmount = printGas("start to calc", destAmount, Module.NETWORK);
        calcRatesAndAmounts(tradeData.input.src, tradeData.input.dest, tradeData, hint);
        destAmount = printGas("calcRatesAndAmounts", destAmount, Module.NETWORK);

        require(tradeData.rateWithNetworkFee > 0, "0 rate");
        require(tradeData.rateWithNetworkFee < MAX_RATE, "rate > MAX_RATE");
        require(tradeData.rateWithNetworkFee >= tradeData.input.minConversionRate, 
            "rate < minConvRate");

        uint actualSrcAmount;

        if (tradeData.calcOut[uint(ITradeLogic.CalcOut.actualDestAmount)] > tradeData.input.maxDestAmount) {
            // notice tradeData passed by reference. and updated
            actualSrcAmount = calcTradeSrcAmountFromDest(tradeData);

            require(handleChange(tradeData.input.src, tradeData.calcIn[uint(ITradeLogic.CalcIn.srcAmount)], 
                actualSrcAmount, tradeData.input.trader));
        } else {
            actualSrcAmount = tradeData.calcIn[uint(ITradeLogic.CalcIn.srcAmount)];
        }

        subtractFeesFromTradeWei(tradeData);
        destAmount = printGas("calc to trade", destAmount, Module.NETWORK);
        require(doReserveTrades(     //src to ETH
                tradeData.input.src,
                actualSrcAmount,
                ETH_TOKEN_ADDRESS,
                address(this),
                tradeData,
                tradeData.calcOut[uint(ITradeLogic.CalcOut.tradeWei)],
                0,
                tradeData.calcOut[uint(ITradeLogic.CalcOut.t2eNumReserves)]));

        require(doReserveTrades(     //Eth to dest
                ETH_TOKEN_ADDRESS,
                tradeData.calcOut[uint(ITradeLogic.CalcOut.tradeWei)],
                tradeData.input.dest,
                tradeData.input.destAddress,
                tradeData,
                tradeData.calcOut[uint(ITradeLogic.CalcOut.actualDestAmount)],
                tradeData.calcOut[uint(ITradeLogic.CalcOut.t2eNumReserves)],
                tradeData.resAddresses.length));

destAmount = printGas("trade part", destAmount, Module.NETWORK);
        require(handleFees(tradeData));
destAmount = printGas("handle fees part", destAmount, Module.NETWORK);
        // todo: reserve ID in trade event?
        emit KyberTrade({
            trader: tradeData.input.trader,
            src: tradeData.input.src,
            dest: tradeData.input.dest,
            srcAmount: actualSrcAmount,
            dstAmount: tradeData.calcOut[uint(ITradeLogic.CalcOut.actualDestAmount)],
            destAddress: tradeData.input.destAddress,
            ethWeiValue: tradeData.calcOut[uint(ITradeLogic.CalcOut.tradeWei)],
            networkFeeWei: tradeData.calcOut[uint(ITradeLogic.CalcOut.networkFeeWei)],
            customPlatformFeeWei: tradeData.calcOut[uint(ITradeLogic.CalcOut.platformFeeWei)],
            e2tReserves: tradeData.t2eResIds,
            t2eReserves: tradeData.e2tResIds
        });

        return (tradeData.calcOut[uint(ITradeLogic.CalcOut.actualDestAmount)]);
    }
    /* solhint-enable function-max-lines */

    function subtractFeesFromTradeWei(TradeData memory tradeData) internal pure {
        tradeData.calcOut[uint(ITradeLogic.CalcOut.tradeWei)] -= 
            (tradeData.calcOut[uint(ITradeLogic.CalcOut.networkFeeWei)] + tradeData.calcOut[uint(ITradeLogic.CalcOut.platformFeeWei)]);
    }

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
        TradeData memory tradeData,
        uint expectedDestAmount,
        uint iStart,
        uint iEnd
    )
        internal
        returns(bool)
    {
        if (src == dest) {
            //this is for a "fake" trade when both src and dest are ethers.
            if (destAddress != (address(this)))
                destAddress.transfer(amount);                
            return true;
        }

        // TradingReserves memory reservesData = src == ETH_TOKEN_ADDRESS? tradeData.ethToToken : tradeData.tokenToEth;
        uint callValue;
        uint srcAmountSoFar;

        for(uint i = iStart; i < iEnd; ++i) {
            uint splitAmount = i == iEnd - 1 ? (amount - srcAmountSoFar) : tradeData.splitValuesBps[i] * amount / BPS;
            srcAmountSoFar += splitAmount;
            callValue = (src == ETH_TOKEN_ADDRESS)? splitAmount : 0;

            // reserve sends tokens/eth to network. network sends it to destination
            // todo: if reserve supports returning destTokens call accordingly
            require(tradeData.resAddresses[i].trade.value(callValue)(src, splitAmount, dest, address(this), tradeData.rates[i], true));
        }

        if (destAddress != address(this)) {
            //for token to token dest address is network. and Ether / token already here...
            if (dest == ETH_TOKEN_ADDRESS) {
                destAddress.transfer(expectedDestAmount);
            } else {
                require(dest.transfer(destAddress, expectedDestAmount));
            }
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

    /// @notice use token address ETH_TOKEN_ADDRESS for ether
    /// @dev checks that user sent ether/tokens to contract before trade
    /// @param src Src token
    /// @param srcAmount amount of src tokens
    /// @return true if tradeInput is valid
    function verifyTradeValid(IERC20 src, uint srcAmount, IERC20 dest, address destAddress)
        internal
        view
        returns(bool)
    {
        require(isEnabled, "network disabled");
        require(kyberProxyContracts[msg.sender], "bad sender");
        require(tx.gasprice <= maxGasPriceValue, "gas price");
        require(srcAmount <= MAX_QTY, "srcAmt > MAX_QTY");
        require(srcAmount != 0, "0 srcAmt");
        require(destAddress != address(0), "dest add 0");
        require(src != dest, "src = dest");

        if (src == ETH_TOKEN_ADDRESS) {
            require(msg.value == srcAmount, "ETH low");
        } else {
            require(msg.value == 0, "ETH sent");
            //funds should have been moved to this contract already.
            require(src.balanceOf(address(this)) >= srcAmount, "srcTok low");
        }

        return true;
    }
    
    // get fee view function. for get expected rate
    function getTakerFee() internal view returns(uint takerFeeBps) {
        uint expiryBlock;
        (takerFeeBps, expiryBlock) = decodeTakerFee(takerFeeData);

        if (expiryBlock <= block.number) {
            (takerFeeBps, expiryBlock) = kyberDAO.getLatestNetworkFeeData();
        }
        // todo: don't revert if DAO reverts. just return exsiting value.
    }
    
    // get fee function for trade. get fee and update data if expired.
    // can be triggered from outside. to avoid extra gas cost on one taker.
    function getAndUpdateTakerFee() public returns(uint takerFeeBps) {
        uint expiryBlock;

        (takerFeeBps, expiryBlock) = decodeTakerFee(takerFeeData);

        if (expiryBlock <= block.number) {
            (takerFeeBps, expiryBlock) = kyberDAO.getLatestNetworkFeeData();
            takerFeeData = encodeTakerFee(expiryBlock, takerFeeBps);
        }
    }
    
    function decodeTakerFee(uint feeData) internal pure returns(uint feeBps, uint expiryBlock) {
        feeBps = feeData & ((1 << 128) - 1);
        expiryBlock = (feeData / (1 << 128)) & ((1 << 128) - 1);
    }
    
    function encodeTakerFee(uint expiryBlock, uint feeBps) internal pure returns(uint feeData) {
        return ((expiryBlock << 128) + feeBps);
    }
}
