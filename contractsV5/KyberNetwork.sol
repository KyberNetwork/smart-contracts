pragma  solidity 0.5.11;

import "./WithdrawableV5.sol";
import "./UtilsV5.sol";
import "./ReentrancyGuard.sol";
import "./IKyberNetwork.sol";
import "./IKyberReserve.sol";
import "./IFeeHandler.sol";
import "./IKyberDAO.sol";


////////////////////////////////////////////////////////////////////////////////////////////////////////
/// @title Kyber Network main contract
contract KyberNetwork is Withdrawable, Utils, IKyberNetwork, ReentrancyGuard {

    IFeeHandler     internal feeHandler;
    IKyberDAO       internal kyberDAO;

    uint  constant PERM_HINT_GET_RATE = 1 << 255; //for backwards compatibility
    uint            negligibleRateDiffBps = 10; // bps is 0.01%

    uint            public takerFeeData; // will include feeBps and expiry block
    uint            maxGasPriceValue = 50 * 1000 * 1000 * 1000; // 50 gwei
    bool            isEnabled = false; // network is enabled
    
    mapping(address=>bool) public kyberProxyContracts;
    address[] public kyberProxyArray;
    
    IKyberReserve[] public reserves;
    mapping(address=>uint) public reserveAddressToId;
    mapping(uint=>address[]) public reserveIdToAddresses;
    mapping(address=>bool) public isFeePayingReserve;
    mapping(address=>IKyberReserve[]) public reservesPerTokenSrc; //reserves supporting token to eth
    mapping(address=>IKyberReserve[]) public reservesPerTokenDest;//reserves support eth to token
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

        parseTradeDataHint(tradeData, hint);
        tradeData.takerFeeBps = getAndUpdateTakerFee();
        
        return trade(tradeData);
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

        parseTradeDataHint(tradeData, hint);
        tradeData.takerFeeBps = getAndUpdateTakerFee();
        
        return trade(tradeData);
    }

    event AddReserveToNetwork (
        address indexed reserve,
        uint indexed reserveId,
        bool isFeePaying,
        address indexed rebateWallet,
        bool add);

    /// @notice can be called only by operator
    /// @dev add or deletes a reserve to/from the network.
    /// @param reserve The reserve address.
    function addReserve(address reserve, uint reserveId, bool isFeePaying, address wallet) public onlyOperator returns(bool) {
        require(reserveAddressToId[reserve] == uint(0), "reserve has existing id");
        require(reserveId != 0, "reserveId = 0");

        if (reserveIdToAddresses[reserveId].length == 0) {
            reserveIdToAddresses[reserveId].push(reserve);
        } else {
            require(reserveIdToAddresses[reserveId][0] == address(0), "reserveId already taken");
            reserveIdToAddresses[reserveId][0] = reserve;
        }

        reserveAddressToId[reserve] = reserveId;
        isFeePayingReserve[reserve] = isFeePaying;

        reserves.push(IKyberReserve(reserve));

        reserveRebateWallet[reserve] = wallet;

        emit AddReserveToNetwork(reserve, reserveId, isFeePaying, wallet, true);

        return true;
    }

    event RemoveReserveFromNetwork(IKyberReserve reserve, uint indexed reserveId);

    /// @notice can be called only by operator
    /// @dev removes a reserve from Kyber network.
    /// @param reserve The reserve address.
    /// @param startIndex to search in reserve array.
    function removeReserveWithIndex(IKyberReserve reserve, uint startIndex) public onlyOperator returns(bool) {

        require(reserveAddressToId[address(reserve)] != uint(0), "reserve -> 0 reserveId");
        
        uint reserveIndex = 2 ** 255;
        uint reserveId = reserveAddressToId[address(reserve)];
        
        for (uint i = startIndex; i < reserves.length; i++) {
            if(reserves[i] == reserve) {
                reserveIndex = i;
                break;
            }
        }
        
        reserves[reserveIndex] = reserves[reserves.length - 1];
        reserves.length--;

        reserveIdToAddresses[reserveId].push(reserveIdToAddresses[reserveId][0]);
        reserveIdToAddresses[reserveId][0] = address(0);
        
        emit RemoveReserveFromNetwork(reserve, reserveId);

        return true;
    }

    function removeReserve(IKyberReserve reserve) public onlyOperator returns(bool) {
        return removeReserveWithIndex(reserve, 0);
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
        public
        onlyOperator
        returns(bool)
    {
        require(reserveAddressToId[reserve] != uint(0), "reserve -> 0 reserveId");

        if (ethToToken) {
            listPairs(IKyberReserve(reserve), token, false, add);

            emit ListReservePairs(reserve, ETH_TOKEN_ADDRESS, token, add);
        }

        if (tokenToEth) {
            listPairs(IKyberReserve(reserve), token, true, add);

            if (add) {
                require(token.approve(reserve, 2**255), "approve max token amt failed"); // approve infinity
            } else {
                require(token.approve(reserve, 0), "approve 0 token amt failed");
            }

            emit ListReservePairs(reserve, token, ETH_TOKEN_ADDRESS, add);
        }

        setDecimals(token);

        return true;
    }

    event FeeHandlerUpdated(IFeeHandler newHandler, IFeeHandler previous);
    event KyberDAOUpdated(IKyberDAO newDao, IKyberDAO previous);

    function setContracts(IFeeHandler _feeHandler, IKyberDAO _kyberDAO) public onlyAdmin {
        require(_feeHandler != IFeeHandler(0), "feeHandler 0");
        require(_kyberDAO != IKyberDAO(0), "kyberDAO 0");

        if(_feeHandler != feeHandler) {
            emit FeeHandlerUpdated(_feeHandler, feeHandler);
            feeHandler = _feeHandler;
        }
        
        if(_kyberDAO != kyberDAO) {
            emit KyberDAOUpdated(_kyberDAO, kyberDAO);
            kyberDAO = _kyberDAO;
        }
    }

    event KyberNetworkParamsSet(uint maxGasPrice, uint negligibleRateDiffBps);

    function setParams(
        uint                  _maxGasPrice,
        uint                  _negligibleRateDiffBps
    )
        public
        onlyAdmin
    {
        require(_negligibleRateDiffBps <= BPS, "rateDiffBps > BPS"); // at most 100%

        maxGasPriceValue = _maxGasPrice;
        negligibleRateDiffBps = _negligibleRateDiffBps;
        emit KyberNetworkParamsSet(maxGasPriceValue, negligibleRateDiffBps);
    }

    event KyberNetworkSetEnable(bool isEnabled);

    function setEnable(bool _enable) public onlyAdmin {
        if (_enable) {
            require(feeHandler != IFeeHandler(0), "no feeHandler set");
            require(kyberProxyArray.length > 0, "no proxy set");
        }
        isEnabled = _enable;

        emit KyberNetworkSetEnable(isEnabled);
    }

    event KyberProxyAdded(address proxy, address sender);
    event KyberProxyRemoved(address proxy);
    
    function addKyberProxy(address networkProxy) public onlyAdmin {
        require(networkProxy != address(0), "0 networkProxy address");
        require(!kyberProxyContracts[networkProxy], "networkProxy exists");
        
        kyberProxyArray.push(networkProxy);
        
        kyberProxyContracts[networkProxy] = true;
        emit KyberProxyAdded(networkProxy, msg.sender);
    }
    
    function removeKyberProxy(address networkProxy) public onlyAdmin {
        require(kyberProxyContracts[networkProxy], "networkProxy not found");
        
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
    
    /// @dev returns number of reserves
    /// @return number of reserves
    function getNumReserves() public view returns(uint) {
        return reserves.length;
    }

    /// @notice should be called off chain
    /// @dev get an array of all reserves
    /// @return An array of all reserves
    function getReserves() public view returns(IKyberReserve[] memory) {
        return reserves;
    }

    function updateTakerFee() public returns(uint takerFeeBps) {
        takerFeeBps = getAndUpdateTakerFee();
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
        
        bytes memory hint;

        parseTradeDataHint(tradeData, hint);
        tradeData.takerFeeBps = getTakerFee();

        calcRatesAndAmounts(src, dest, qty, tradeData);
        
        expectedRate = tradeData.rateWithNetworkFee;
        worstRate = expectedRate * 97 / 100; // backward compatible formula
    }

    // new APIs
    function getExpectedRateWithHintAndFee(IERC20 src, IERC20 dest, uint srcQty, uint platformFeeBps, bytes calldata hint) 
        external view
        returns (uint expectedRateNoFees, uint expectedRateAfterNetworkFees, uint expectedRateAfterAllFees)
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
        
        parseTradeDataHint(tradeData, hint);
        tradeData.takerFeeBps = getTakerFee();
        
        calcRatesAndAmounts(src, dest, srcQty, tradeData);
        
        expectedRateNoFees = calcRateFromQty(srcQty, tradeData.destAmountNoFee, tradeData.tokenToEth.decimals, tradeData.ethToToken.decimals);
        expectedRateAfterNetworkFees = tradeData.rateWithNetworkFee;
        expectedRateAfterAllFees = calcRateFromQty(srcQty, tradeData.actualDestAmount, tradeData.tokenToEth.decimals, tradeData.ethToToken.decimals);
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
    
    function enabled() public view returns(bool) {
        return isEnabled;
    }

    function getContracts() external view returns(address kyberDaoAddress, address feeHandlerAddress) {
        return(address(kyberDAO), address(feeHandler));
    }

    function getNetworkData() external view returns(
        bool networkEnabled, 
        uint negligibleDiffBps, 
        uint maximumGasPrice,
        uint takerFeeBps) 
    {
        return(isEnabled, negligibleRateDiffBps, maxGasPriceValue, getTakerFee());
    }

    function getAllRatesForToken(IERC20 token, uint optionalAmount) public view
        returns(IKyberReserve[] memory buyReserves, uint[] memory buyRates, IKyberReserve[] memory sellReserves, uint[] memory sellRates)
    {
        uint amount = optionalAmount > 0 ? optionalAmount : 1000;
        IERC20 ETH = ETH_TOKEN_ADDRESS;

        buyReserves = reservesPerTokenDest[address(token)];
        buyRates = new uint[](buyReserves.length);

        uint i;
        for (i = 0; i < buyReserves.length; i++) {
            buyRates[i] = (IKyberReserve(buyReserves[i])).getConversionRate(ETH, token, amount, block.number);
        }

        sellReserves = reservesPerTokenSrc[address(token)];
        sellRates = new uint[](sellReserves.length);

        for (i = 0; i < sellReserves.length; i++) {
            sellRates[i] = (IKyberReserve(sellReserves[i])).getConversionRate(token, ETH, amount, block.number);
        }
    }
   
    function listPairs(IKyberReserve reserve, IERC20 token, bool isTokenToEth, bool add) internal {
        uint i;
        IKyberReserve[] storage reserveArr = reservesPerTokenDest[address(token)];

        if (isTokenToEth) {
            reserveArr = reservesPerTokenSrc[address(token)];
        }

        for (i = 0; i < reserveArr.length; i++) {
            if (reserve == reserveArr[i]) {
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
            reserveArr.push(reserve);
        }
    }

    struct BestReserveInfo {
        uint index;
        uint destAmount;
    }

    /* solhint-disable code-complexity */
    // Regarding complexity. Below code follows the required algorithm for choosing a reserve.
    //  It has been tested, reviewed and found to be clear enough.
    //@dev this function always src or dest are ether. can't do token to token
    //TODO: document takerFee
    function searchBestRate(IKyberReserve[] memory reserveArr, IERC20 src, IERC20 dest, uint srcAmount, uint takerFee)
        public
        view
        returns(IKyberReserve reserve, uint, bool isFeePaying)
    {
        //use destAmounts for comparison, but return the best rate
        BestReserveInfo memory bestReserve;
        uint numRelevantReserves = 1; // assume always best reserve will be relevant

        //return 1 for ether to ether, or if empty reserve array is passed
        if (src == dest || reserveArr.length == 0) return (IKyberReserve(0), PRECISION, false);

        uint[] memory rates = new uint[](reserveArr.length);
        uint[] memory reserveCandidates = new uint[](reserveArr.length);
        uint destAmount;
        uint srcAmountWithFee;

        for (uint i = 0; i < reserveArr.length; i++) {
            reserve = reserveArr[i];
            //list all reserves that support this token.
            isFeePaying = isFeePayingReserve[address(reserve)];
            //for ETH -> token paying reserve, takerFee is specified in amount
            srcAmountWithFee = ((src == ETH_TOKEN_ADDRESS) && isFeePaying) ? srcAmount - takerFee : srcAmount;
            rates[i] = reserve.getConversionRate(
                src,
                dest,
                srcAmountWithFee,
                block.number);

            destAmount = srcAmountWithFee * rates[i] / PRECISION;
             //for token -> ETH paying reserve, takerFee is specified in bps
            destAmount = (dest == ETH_TOKEN_ADDRESS && isFeePaying) ? destAmount * (BPS - takerFee) / BPS : destAmount;

            if (destAmount > bestReserve.destAmount) {
                //best rate is highest rate
                bestReserve.destAmount = destAmount;
                bestReserve.index = i;
            }
        }

        if(bestReserve.destAmount == 0) return (reserves[bestReserve.index], 0, false);
        
        reserveCandidates[0] = bestReserve.index;
        
        // if this reserve pays fee its actual rate is less. so smallestRelevantRate is smaller.
        bestReserve.destAmount = bestReserve.destAmount * BPS / (BPS + negligibleRateDiffBps);

        for (uint i = 0; i < reserveArr.length; i++) {

            if (i == bestReserve.index) continue;

            isFeePaying = isFeePayingReserve[address(reserve)];
            srcAmountWithFee = ((src == ETH_TOKEN_ADDRESS) && isFeePaying) ? srcAmount - takerFee : srcAmount;
            destAmount = srcAmountWithFee * rates[i] / PRECISION;
            destAmount = (dest == ETH_TOKEN_ADDRESS && isFeePaying) ? destAmount * (BPS - takerFee) / BPS : destAmount;

            if (destAmount > bestReserve.destAmount) {
                reserveCandidates[numRelevantReserves++] = i;
            }
        }

        if (numRelevantReserves > 1) {
            //when encountering small rate diff from bestRate. draw from relevant reserves
            bestReserve.index = reserveCandidates[uint(blockhash(block.number-1)) % numRelevantReserves];
        } else {
            bestReserve.index = reserveCandidates[0];
        }
        isFeePaying = isFeePayingReserve[address(reserveArr[bestReserve.index])];
        return (reserveArr[bestReserve.index], rates[bestReserve.index], isFeePaying);
    }

    struct TradingReserves {
        IKyberReserve[] addresses;
        uint[] rates; // rate per chosen reserve for token to eth
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
    
    // enable up to x reserves for token to Eth and x for eth to token
    // if not hinted reserves use 1 reserve for each trade side
    struct TradeData {
        
        TradeInput input;
        
        TradingReserves tokenToEth;
        TradingReserves ethToToken;
        
        uint tradeWei;
        uint networkFeeWei;
        uint platformFeeWei;

        uint takerFeeBps;
        
        uint numFeePayingReserves;
        uint feePayingReservesBps; // what part of this trade is fee paying. for token to token - up to 200%
        
        uint destAmountNoFee;
        uint destAmountWithNetworkFee;
        uint actualDestAmount; // all fees

        // TODO: do we need to save rate locally. seems dest amounts enough.
        // uint rateNoFee;
        uint rateWithNetworkFee;
        // uint rateWithAllFees;
    }

    // accumulate fee wei
    function calcRatesAndAmounts(IERC20 src, IERC20 dest, uint srcAmount, TradeData memory tradeData) 
        internal view
    // function should set all TradeData so it can later be used without any ambiguity
    {
        // assume TradingReserves stores the reserves to be iterated over (meaning masking has been applied
        calcRatesAndAmountsTokenToEth(src, srcAmount, tradeData);

        //TODO: see if this need to be shifted below instead
        if (tradeData.tradeWei == 0) {
            tradeData.rateWithNetworkFee = 0;
            return;
        }

        //if split reserves, add bps for ETH -> token
        if (tradeData.tokenToEth.splitValuesBps.length > 1) {
            for (uint i = 0; i < tradeData.ethToToken.addresses.length; i++) {
                if (tradeData.ethToToken.isFeePaying[i]) {
                    tradeData.feePayingReservesBps += tradeData.ethToToken.splitValuesBps[i];
                    tradeData.numFeePayingReserves ++;
                }
            }
        }

        //fee deduction
        //no fee deduction occurs for masking of ETH -> token reserves, or if no ETH -> token reserve was specified
        tradeData.networkFeeWei = tradeData.tradeWei * tradeData.takerFeeBps * tradeData.feePayingReservesBps / (BPS * BPS);
        tradeData.platformFeeWei = tradeData.tradeWei * tradeData.input.platformFeeBps / BPS;

        //change to if condition instead
        require(tradeData.tradeWei >= (tradeData.networkFeeWei + tradeData.platformFeeWei), "fees exceed trade amount");
        calcRatesAndAmountsEthToToken(dest, tradeData.tradeWei - tradeData.networkFeeWei - tradeData.platformFeeWei, tradeData);

        // calc final rate
        tradeData.rateWithNetworkFee = calcRateFromQty(srcAmount, tradeData.destAmountWithNetworkFee, tradeData.tokenToEth.decimals, tradeData.ethToToken.decimals);
    }

    function calcRatesAndAmountsTokenToEth(IERC20 src, uint srcAmount, TradeData memory tradeData) internal view {
        IKyberReserve reserve;
        uint splitAmount;
        uint srcAmountSoFar;
        bool isFeePaying;

        // token to Eth
        ///////////////
        // if split reserves, find rates
        // can consider parsing enum hint type into tradeData for easy identification of splitHint. Or maybe just boolean flag
        if (tradeData.tokenToEth.splitValuesBps.length > 1) {
            for (uint i = 0; i < tradeData.tokenToEth.addresses.length; i++) {
                reserve = tradeData.tokenToEth.addresses[i];
                //calculate split and corresponding trade amounts
                splitAmount = (i == tradeData.tokenToEth.splitValuesBps.length - 1) ? (srcAmount - srcAmountSoFar) : tradeData.tokenToEth.splitValuesBps[i] * srcAmount / BPS;
                srcAmountSoFar += splitAmount;
                tradeData.tokenToEth.rates[i] = reserve.getConversionRate(src, ETH_TOKEN_ADDRESS, splitAmount, block.number);
                tradeData.tradeWei += calcDstQty(splitAmount, tradeData.tokenToEth.decimals, ETH_DECIMALS, tradeData.tokenToEth.rates[i]);

                //account for fees
                if (tradeData.tokenToEth.isFeePaying[i]) {
                    tradeData.feePayingReservesBps += tradeData.tokenToEth.splitValuesBps[i];
                    tradeData.numFeePayingReserves ++;
                }
            }
        } else {
            // else find best rate
            (reserve, tradeData.tokenToEth.rates[0], isFeePaying) = searchBestRate(tradeData.tokenToEth.addresses, src, ETH_TOKEN_ADDRESS, srcAmount, tradeData.takerFeeBps);
            //save into tradeData
            tradeData.tokenToEth.addresses = new IKyberReserve[](1);
            tradeData.tokenToEth.addresses[0] = reserve;
            tradeData.tradeWei = calcDstQty(srcAmount, tradeData.tokenToEth.decimals, ETH_DECIMALS, tradeData.tokenToEth.rates[0]);
            tradeData.tokenToEth.splitValuesBps[0] = BPS; //max percentage amount
            tradeData.tokenToEth.isFeePaying[0] = isFeePaying;

            //account for fees
            if (isFeePaying) {
                tradeData.feePayingReservesBps = BPS; //max percentage amount for token -> ETH
                tradeData.numFeePayingReserves ++;
            }
        }
    }

    function calcRatesAndAmountsEthToToken(
        IERC20 dest,
        uint actualTradeWei,
        TradeData memory tradeData
    )
        internal
        view
    {
        IKyberReserve reserve;
        uint rate;
        uint amountSoFar;
        uint splitAmount;
        bool isFeePaying;
        
        // Eth to token
        ///////////////
        // if hinted reserves, find rates and save.
        if (tradeData.ethToToken.splitValuesBps.length > 1) {
            for (uint i = 0; i < tradeData.ethToToken.addresses.length; i++) {
                reserve = tradeData.ethToToken.addresses[i];

                //calculate split amount with fees
                splitAmount = (i == tradeData.ethToToken.splitValuesBps.length - 1) ? (actualTradeWei - amountSoFar) : tradeData.ethToToken.splitValuesBps[i] * actualTradeWei / BPS;
                amountSoFar += splitAmount;
                //to save gas, we make just 1 conversion rate call with splitAmount
                rate = reserve.getConversionRate(ETH_TOKEN_ADDRESS, dest, splitAmount, block.number);
                //save rate data
                tradeData.ethToToken.rates[i] = rate;
                //add to actualDestAmount
                tradeData.actualDestAmount += calcDstQty(splitAmount, ETH_DECIMALS, tradeData.ethToToken.decimals, rate);
            }
            //calculate actual rate
            rate = calcRateFromQty(actualTradeWei, tradeData.actualDestAmount, ETH_DECIMALS, tradeData.ethToToken.decimals);
        } else {
            //network fee for ETH -> token is in ETH amount
            uint ethToTokenNetworkFeeWei = tradeData.tradeWei * tradeData.takerFeeBps / BPS;
            // search best reserve and its corresponding dest amount
            // Have to search with tradeWei minus fees, because that is the actual src amount for ETH -> token trade
            require(actualTradeWei >= (ethToTokenNetworkFeeWei), "actualTradeWei < E2T network fee");
            (reserve, rate, isFeePaying) = searchBestRate(
                tradeData.ethToToken.addresses,
                ETH_TOKEN_ADDRESS,
                dest,
                actualTradeWei,
                ethToTokenNetworkFeeWei
            );

            //save into tradeData
            tradeData.ethToToken.addresses = new IKyberReserve[](1);
            tradeData.ethToToken.addresses[0] = reserve;
            tradeData.ethToToken.rates[0] = rate;
            tradeData.ethToToken.isFeePaying[0] = isFeePaying;
            tradeData.ethToToken.splitValuesBps[0] = BPS;

            // add to feePayingReservesBps if reserve is fee paying
            if (isFeePaying) {
                actualTradeWei -= ethToTokenNetworkFeeWei;

                tradeData.networkFeeWei += ethToTokenNetworkFeeWei;
                tradeData.feePayingReservesBps += BPS; //max percentage amount for ETH -> token
                tradeData.numFeePayingReserves ++;
            }

            //actualTradeWei has all fees deducted (including possible ETH -> token network fee)
            tradeData.actualDestAmount = calcDstQty(actualTradeWei, ETH_DECIMALS, tradeData.ethToToken.decimals, rate);
        }

        //finally, in both cases, we calculate destAmountWithNetworkFee and destAmountNoFee
        tradeData.destAmountWithNetworkFee = calcDstQty(tradeData.tradeWei - tradeData.networkFeeWei, ETH_DECIMALS, tradeData.ethToToken.decimals, rate);
        tradeData.destAmountNoFee = calcDstQty(tradeData.tradeWei, ETH_DECIMALS, tradeData.ethToToken.decimals, rate);
    }

    event HandlePlatformFee(address recipient, uint fees);

    function handleFees(TradeData memory tradeData) internal returns(bool) {

        // Sending platform fee to taker platform
        (bool success, ) = tradeData.platformFeeWei != 0 ?
            tradeData.input.platformWallet.call.value(tradeData.platformFeeWei)("") :
            (true, bytes(""));
        require(success, "FEE_TX_FAIL_PLAT");
        emit HandlePlatformFee(tradeData.input.platformWallet, tradeData.platformFeeWei);

        //no need to handle fees if no fee paying reserves
        if (tradeData.numFeePayingReserves == 0) return true;

        // create array of rebate wallets + fee percent per reserve
        // fees should add up to 100%.
        address[] memory eligibleWallets = new address[](tradeData.numFeePayingReserves);
        uint[] memory rebatePercentages = new uint[](tradeData.numFeePayingReserves);

        // Updates reserve eligibility and rebate percentages
        updateEligibilityAndRebates(eligibleWallets, rebatePercentages, tradeData);

        // Send total fee amount to fee handler with reserve data.
        require(
            feeHandler.handleFees.value(tradeData.networkFeeWei)(eligibleWallets, rebatePercentages),
            "FEE_TX_FAIL"
        );
        return true;
    }

    function updateEligibilityAndRebates(
        address[] memory eligibleWallets,
        uint[] memory rebatePercentages,
        TradeData memory tradeData
    ) internal view
    {
        uint index; // Index for eligibleWallets and rebatePercentages;

        // Parse ethToToken list
        index = parseReserveList(
            eligibleWallets,
            rebatePercentages,
            tradeData.ethToToken,
            index,
            tradeData.feePayingReservesBps
        );

        // Parse tokenToEth list
        index = parseReserveList(
            eligibleWallets,
            rebatePercentages,
            tradeData.tokenToEth,
            index,
            tradeData.feePayingReservesBps
        );
    }

    function parseReserveList(
        address[] memory eligibleWallets,
        uint[] memory rebatePercentages,
        TradingReserves memory resList,
        uint index,
        uint feePayingReservesBps
    ) internal view returns(uint) {
        uint i;
        uint _index = index;

        for(i = 0; i < resList.isFeePaying.length; i ++) {
            if(resList.isFeePaying[i]) {
                eligibleWallets[_index] = reserveRebateWallet[address(resList.addresses[i])];
                rebatePercentages[_index] = getRebatePercentage(resList.splitValuesBps[i], feePayingReservesBps);
                _index ++;
            }
        }
        return _index;
    }

    function getRebatePercentage(uint splitValueBps, uint feePayingReservesBps) internal pure returns(uint) {
        return splitValueBps * 100 / feePayingReservesBps;
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

    function calcTradeSrcAmountFromDest (TradeData memory tradeData)
        internal pure returns(uint actualSrcAmount)
    {
        if (tradeData.input.dest != ETH_TOKEN_ADDRESS) {
            tradeData.tradeWei = calcTradeSrcAmount(tradeData.ethToToken.decimals, ETH_DECIMALS, tradeData.input.maxDestAmount, 
                tradeData.ethToToken.rates, tradeData.ethToToken.splitValuesBps);
        } else {
            tradeData.tradeWei = tradeData.input.maxDestAmount;
        }

        tradeData.networkFeeWei = tradeData.tradeWei * tradeData.takerFeeBps * tradeData.feePayingReservesBps / (BPS * BPS);
        tradeData.platformFeeWei = tradeData.tradeWei * tradeData.input.platformFeeBps / BPS;

        if (tradeData.input.src != ETH_TOKEN_ADDRESS) {
            actualSrcAmount = calcTradeSrcAmount(ETH_DECIMALS, tradeData.tokenToEth.decimals, tradeData.tradeWei, tradeData.tokenToEth.rates, tradeData.tokenToEth.splitValuesBps);
        } else {
            actualSrcAmount = tradeData.tradeWei;
        }
    
        require(actualSrcAmount <= tradeData.input.srcAmount, "actualSrcAmt > given srcAmt");
    }

    event KyberTrade(address indexed trader, IERC20 src, IERC20 dest, uint srcAmount, uint dstAmount,
        address destAddress, uint ethWeiValue, address reserve1, address reserve2, bytes hint);

    /* solhint-disable function-max-lines */
    //  Most of the lines here are functions calls spread over multiple lines. We find this function readable enough
    /// @notice use token address ETH_TOKEN_ADDRESS for ether
    /// @dev trade api for kyber network.
    /// @param tradeData.input structure of trade inputs
    function trade(TradeData memory tradeData) 
        internal
        nonReentrant
        returns(uint destAmount) 
    {
        require(verifyTradeValid(tradeData.input.src, tradeData.input.srcAmount, tradeData.input.dest, tradeData.input.destAddress));

        // amounts excluding fees
        calcRatesAndAmounts(tradeData.input.src, tradeData.input.dest, tradeData.input.srcAmount, tradeData);

        require(tradeData.rateWithNetworkFee > 0, "0 rate");
        require(tradeData.rateWithNetworkFee < MAX_RATE, "rate > MAX_RATE");
        require(tradeData.rateWithNetworkFee >= tradeData.input.minConversionRate, "rate < minConvRate");

        uint actualSrcAmount;

        if (tradeData.actualDestAmount > tradeData.input.maxDestAmount) {
            // notice tradeData passed by reference. and updated
            actualSrcAmount = calcTradeSrcAmountFromDest(tradeData);

            require(handleChange(tradeData.input.src, tradeData.input.srcAmount, actualSrcAmount, tradeData.input.trader));
        } else {
            actualSrcAmount = tradeData.input.srcAmount;
        }

        subtractFeesFromTradeWei(tradeData);

        require(doReserveTrades(     //src to ETH
                tradeData.input.src,
                actualSrcAmount,
                ETH_TOKEN_ADDRESS,
                address(this),
                tradeData,
                tradeData.tradeWei));

        require(doReserveTrades(     //Eth to dest
                ETH_TOKEN_ADDRESS,
                tradeData.tradeWei,
                tradeData.input.dest,
                tradeData.input.destAddress,
                tradeData,
                tradeData.actualDestAmount));

        require(handleFees(tradeData));

        //todo: update trade event
        // KyberTrade({
        //     trader: tradeData.input.trader,
        //     src: tradeData.input.src,
        //     dest: tradeData.input.dest,
        //     srcAmount: actualSrcAmount,
        //     dstAmount: actualDestAmount,
        //     destAddress: tradeData.input.destAddress,
        //     ethWeiValue: weiAmount,
        //     reserve1: (tradeData.input.src == ETH_TOKEN_ADDRESS) ? address(0) : rateResult.reserve1,
        //     reserve2:  (tradeData.input.dest == ETH_TOKEN_ADDRESS) ? address(0) : rateResult.reserve2,
        //     hint: tradeData.input.hint
        // });

        return (tradeData.actualDestAmount);
    }
    /* solhint-enable function-max-lines */

    function subtractFeesFromTradeWei(TradeData memory tradeData) internal pure {
        tradeData.tradeWei -= (tradeData.networkFeeWei + tradeData.platformFeeWei);
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
        uint expectedDestAmount
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

        TradingReserves memory reservesData = src == ETH_TOKEN_ADDRESS? tradeData.ethToToken : tradeData.tokenToEth;
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
            //for token to token dest address is network. and Ether / token already here...
            if (dest == ETH_TOKEN_ADDRESS) {
                destAddress.transfer(expectedDestAmount);
            } else {
                require(dest.transfer(destAddress, expectedDestAmount));
            }
        }

        return true;
    }

    /// when user sets max dest amount we could have too many source tokens == change. so we send it back to user.
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
        require(kyberProxyContracts[msg.sender], "msg.sender not proxy");
        require(tx.gasprice <= maxGasPriceValue, "max gas price exceeded");
        require(srcAmount <= MAX_QTY, "srcAmt > MAX_QTY");
        require(srcAmount != 0, "0 srcAmt");
        require(destAddress != address(0), "0 destAddress");
        require(src != dest, "src == dest");

        if (src == ETH_TOKEN_ADDRESS) {
            require(msg.value == srcAmount, "not enough ETH sent with trade");
        } else {
            require(msg.value == 0, "ETH sent for token trade");
            //funds should have been moved to this contract already.
            require(src.balanceOf(address(this)) >= srcAmount, "srcToken not sent here");
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
    
    function parseTradeDataHint(TradeData memory tradeData,  bytes memory hint) internal view {
        tradeData.tokenToEth.addresses = (tradeData.input.src == ETH_TOKEN_ADDRESS) ?
            new IKyberReserve[](1) : reservesPerTokenSrc[address(tradeData.input.src)];
        tradeData.ethToToken.addresses = (tradeData.input.dest == ETH_TOKEN_ADDRESS) ?
            new IKyberReserve[](1) :reservesPerTokenDest[address(tradeData.input.dest)];

        //PERM is treated as no hint, so we just return
        if (hint.length == 0 || hint.length == 4) {
            tradeData.tokenToEth.isFeePaying = new bool[](1);
            tradeData.tokenToEth.splitValuesBps = new uint[](1);
            tradeData.tokenToEth.rates = new uint[](1);
            tradeData.ethToToken.isFeePaying = new bool[](1);
            tradeData.ethToToken.splitValuesBps = new uint[](1);
            tradeData.ethToToken.rates = new uint[](1);
            return;
        }
    }
}
