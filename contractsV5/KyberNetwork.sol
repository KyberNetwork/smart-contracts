pragma  solidity 0.5.11;

import "./WithdrawableV5.sol";
import "./UtilsV5.sol";
import "./ReentrancyGuard.sol";
import "./IKyberNetwork.sol";
import "./IKyberReserve.sol";
import "./IFeeHandler.sol";


contract IWhiteList {
    function getUserCapInWei(address user) external view returns (uint userCapWei);
}


interface IExpectedRate {
    function getExpectedRate(IERC20 src, IERC20 dest, uint srcQty, bool usePermissionless) external view
    returns (uint expectedRate, uint worstRate);
}


////////////////////////////////////////////////////////////////////////////////////////////////////////
/// @title Kyber Network main contract
contract KyberNetwork is Withdrawable, Utils, IKyberNetwork, ReentrancyGuard {

    bytes public constant PERM_HINT = "PERM";
    uint  public constant PERM_HINT_GET_RATE = 1 << 255; // for get rate. bit mask hint.
    uint  public constant DEFAULT_MAX_DEST_AMOUNT = 2 ** 255;

    uint public negligibleRateDiff = 10; // basic rate steps will be in 0.01%
    IWhiteList public whiteListContract;
    IExpectedRate public expectedRateContract;
    IFeeHandler    public feeHandlerContract;

    uint                  public takerFeeBps;
    address               public kyberNetworkProxyContract;
    uint                  maxGasPriceValue = 50 * 1000 * 1000 * 1000; // 50 gwei
    bool                  isEnabled = false; // network is enabled
    mapping(bytes32=>uint) public infoFields; // this is only a UI field for external app.

    IKyberReserve[] public reserves;
    mapping(address=>ReserveType) public reserveType;
    mapping(address=>bool) public isFeeLessReserve;
    mapping(address=>address[]) public reservesPerTokenSrc; //reserves supporting token to eth
    mapping(address=>address[]) public reservesPerTokenDest;//reserves support eth to token

    enum ReserveType {NONE, PERMISSIONED, PERMISSIONLESS}
    bytes internal constant EMPTY_HINT = "";

    constructor(address _admin) public {
        require(_admin != address(0));
        admin = _admin;
    }

    event EtherReceival(address indexed sender, uint amount);

    /* solhint-disable no-complex-fallback */
    function() external payable {
        emit EtherReceival(msg.sender, msg.value);
    }
    /* solhint-enable no-complex-fallback */

    struct TradeInput {
        address payable trader;
        IERC20 src;
        uint srcAmount;
        IERC20 dest;
        address payable destAddress;
        uint maxDestAmount;
        uint minConversionRate;
        address walletId;
        bytes hint;
    }

    function tradeWithHint(
        address payable trader,
        IERC20 src,
        uint srcAmount,
        IERC20 dest,
        address payable destAddress,
        uint maxDestAmount,
        uint minConversionRate,
        address walletId,
        bytes memory hint
    )
        public
        nonReentrant
        payable
        returns(uint)
    {
        require(isEnabled);
        require(msg.sender == kyberNetworkProxyContract);
        require(tx.gasprice <= maxGasPriceValue);

        TradeInput memory tradeInput;

        tradeInput.trader = trader;
        tradeInput.src = src;
        tradeInput.srcAmount = srcAmount;
        tradeInput.dest = dest;
        tradeInput.destAddress = destAddress;
        tradeInput.maxDestAmount = maxDestAmount;
        tradeInput.minConversionRate = minConversionRate;
        tradeInput.walletId = walletId;
        tradeInput.hint = hint;

        return trade(tradeInput);
    }

    event AddReserveToNetwork(IKyberReserve indexed reserve, bool add, bool isPermissionless);

    /// @notice can be called only by operator
    /// @dev add or deletes a reserve to/from the network.
    /// @param reserve The reserve address.
    /// @param isPermissionless is the new reserve from permissionless type.
    function addReserve(IKyberReserve reserve, bool isPermissionless) public onlyOperator returns(bool) {
        require(reserveType[address(reserve)] == ReserveType.NONE);
        reserves.push(reserve);

        reserveType[address(reserve)] = isPermissionless ? ReserveType.PERMISSIONLESS : ReserveType.PERMISSIONED;

        emit AddReserveToNetwork(reserve, true, isPermissionless);

        return true;
    }

    event RemoveReserveFromNetwork(IKyberReserve reserve);

    /// @notice can be called only by operator
    /// @dev removes a reserve from Kyber network.
    /// @param reserve The reserve address.
    /// @param index in reserve array.
    function removeReserve(IKyberReserve reserve, uint index) public onlyOperator returns(bool) {

        require(reserveType[address(reserve)] != ReserveType.NONE);
        require(reserves[index] == reserve);

        reserveType[address(reserve)] = ReserveType.NONE;
        reserves[index] = reserves[reserves.length - 1];
        reserves.length--;

        emit RemoveReserveFromNetwork(reserve);

        return true;
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
        require(reserveType[reserve] != ReserveType.NONE);

        if (ethToToken) {
            listPairs(reserve, token, false, add);

            emit ListReservePairs(reserve, ETH_TOKEN_ADDRESS, token, add);
        }

        if (tokenToEth) {
            listPairs(reserve, token, true, add);

            if (add) {
                require(token.approve(reserve, 2**255)); // approve infinity
            } else {
                require(token.approve(reserve, 0));
            }

            emit ListReservePairs(reserve, token, ETH_TOKEN_ADDRESS, add);
        }

        setDecimals(token);

        return true;
    }

    event WhiteListContractSet(IWhiteList newContract, IWhiteList currentContract);

    ///@param whiteList can be empty
    function setWhiteList(IWhiteList whiteList) public onlyAdmin {
        emit WhiteListContractSet(whiteList, whiteListContract);
        whiteListContract = whiteList;
    }

    event ExpectedRateContractSet(IExpectedRate newContract, IExpectedRate currentContract);

    function setExpectedRate(IExpectedRate expectedRate) public onlyAdmin {
        require(expectedRate != IExpectedRate(0));

        emit ExpectedRateContractSet(expectedRate, expectedRateContract);
        expectedRateContract = expectedRate;
    }

    event FeeHandlerContractSet(IFeeHandler newContract, IFeeHandler currentContract);

    function setFeeHandler(IFeeHandler feeHandler) public onlyAdmin {
        require(feeHandler != IFeeHandler(0));

        emit FeeHandlerContractSet(feeHandler, feeHandlerContract);
        feeHandlerContract = feeHandler;
    }

    event KyberNetworkParamsSet(uint maxGasPrice, uint negligibleRateDiff);

    function setParams(
        uint                  _maxGasPrice,
        uint                  _negligibleRateDiff
    )
        public
        onlyAdmin
    {
        require(_negligibleRateDiff <= 100 * 100); // at most 100%

        maxGasPriceValue = _maxGasPrice;
        negligibleRateDiff = _negligibleRateDiff;
        emit KyberNetworkParamsSet(maxGasPriceValue, negligibleRateDiff);
    }

    event KyberNetworkSetEnable(bool isEnabled);

    function setEnable(bool _enable) public onlyAdmin {
        if (_enable) {
            require(feeHandlerContract != IFeeHandler(0));
            require(expectedRateContract != IExpectedRate(0));
            require(kyberNetworkProxyContract != address(0));
        }
        isEnabled = _enable;

        emit KyberNetworkSetEnable(isEnabled);
    }

    function setInfo(bytes32 field, uint value) public onlyOperator {
        infoFields[field] = value;
    }

    event KyberProxySet(address proxy, address sender);

    function setKyberProxy(address networkProxy) public onlyAdmin {
        require(networkProxy != address(0));
        kyberNetworkProxyContract = networkProxy;
        emit KyberProxySet(kyberNetworkProxyContract, msg.sender);
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

    function maxGasPrice() public view returns(uint) {
        return maxGasPriceValue;
    }

    function getExpectedRate(IERC20 src, IERC20 dest, uint srcQty)
        public view
        returns(uint expectedRate, uint worstRate)
    {
        require(expectedRateContract != IExpectedRate(0));
        if (src == dest) return (0,0);
        bool includePermissionless = true;

        if (srcQty & PERM_HINT_GET_RATE > 0) {
            includePermissionless = false;
            srcQty = srcQty & ~PERM_HINT_GET_RATE;
        }

        return expectedRateContract.getExpectedRate(src, dest, srcQty, includePermissionless);
    }

    function getExpectedRateOnlyPermission(IERC20 src, IERC20 dest, uint srcQty)
        public view
        returns(uint expectedRate, uint worstRate)
    {
        require(expectedRateContract != IExpectedRate(0));
        if (src == dest) return (0,0);
        return expectedRateContract.getExpectedRate(src, dest, srcQty, false);
    }

    function getUserCapInWei(address user) public view returns(uint) {
        if (whiteListContract == IWhiteList(0)) return (2 ** 255);
        return whiteListContract.getUserCapInWei(user);
    }

    function getUserCapInTokenWei(address user, IERC20 token) public view returns(uint) {
        //future feature
        user;
        token;
        require(false);
    }

    // function findBestRate(IERC20 src, IERC20 dest, uint srcAmount) public view returns(uint obsolete, uint rate) {
    //     BestRateResult memory result = findBestRateTokenToToken(src, dest, srcAmount, EMPTY_HINT);
    //     return(0, result.rate);
    // }

    // function findBestRateOnlyPermission(IERC20 src, IERC20 dest, uint srcAmount)
    //     public
    //     view
    //     returns(uint obsolete, uint rate)
    // {
    //     BestRateResult memory result = findBestRateTokenToToken(src, dest, srcAmount, PERM_HINT);
    //     return(0, result.rate);
    // }

    function enabled() public view returns(bool) {
        return isEnabled;
    }

    function info(bytes32 field) public view returns(uint) {
        return infoFields[field];
    }

    function getAllRatesForToken(IERC20 token, uint optionalAmount) public view
        returns(address[] memory buyReserves, uint[] memory buyRates, address[] memory sellReserves, uint[] memory sellRates)
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
   
    function listPairs(address reserve, IERC20 token, bool isTokenToEth, bool add) internal {
        uint i;
        address[] storage reserveArr = reservesPerTokenDest[address(token)];

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

    /* solhint-disable code-complexity */
    // Regarding complexity. Below code follows the required algorithm for choosing a reserve.
    //  It has been tested, reviewed and found to be clear enough.
    //@dev this function always src or dest are ether. can't do token to token
    function searchBestDestAmount(IERC20 src, IERC20 dest, uint srcAmount, bool usePermissionless)
        public
        view
        returns(address reserve, uint destAmount, bool isPayingFees)
    {
        //todo: read isPayingFees once.
        uint bestDestAmount = 0;
        uint bestReserve = 0;
        uint numRelevantReserves = 1; // assume alywas best reserve will be relevant

        //return 1 for ether to ether
        if (src == dest) return (address(reserves[bestReserve]), PRECISION, false);

        address[] memory reserveArr = src == ETH_TOKEN_ADDRESS ? 
            reservesPerTokenDest[address(dest)] : 
            reservesPerTokenSrc[address(src)];

        if (reserveArr.length == 0) return (address(reserves[bestReserve]), 0, false);

        uint[] memory destAmounts = new uint[](reserveArr.length);
        uint[] memory reserveCandidates = new uint[](reserveArr.length);
        uint i;
        uint rate;
        uint srcAmountWithFee;

        for (i = 0; i < reserveArr.length; i++) {
            //list all reserves that have this token.
            if (!usePermissionless && reserveType[reserveArr[i]] == ReserveType.PERMISSIONLESS) {
                continue;
            }
            
            srcAmountWithFee = (src == ETH_TOKEN_ADDRESS && isFeeLessReserve[reserveArr[i]])? srcAmount : 
                srcAmount * (BPS - takerFeeBps) / BPS;
            rate = (IKyberReserve(reserveArr[i])).getConversionRate(
                src, 
                dest, 
                srcAmountWithFee, 
                block.number);

            destAmounts[i] = srcAmountWithFee * rate / PRECISION;
            destAmounts[i] = (dest == ETH_TOKEN_ADDRESS && isFeeLessReserve[reserveArr[i]])? destAmounts[i] : 
                destAmounts[i] * (BPS - takerFeeBps) / BPS;
            
            if (destAmounts[i] > bestDestAmount) {
                //best rate is highest rate
                bestDestAmount = destAmounts[i];
                bestReserve = i;
            }
        }

        if(bestDestAmount == 0) return (address(reserves[bestReserve]), 0, false);
        
        reserveCandidates[0] = bestReserve;
        
        // if this reserve pays fee its acutal rate is less. so smallestRelevantRate is smaller.
        uint smallestRelevantDestAmount = bestDestAmount * BPS / (10000 + negligibleRateDiff);

        for (i = 0; i < reserveArr.length; i++) {
            
            if (i == bestReserve) continue;
            
            if (destAmounts[i] > smallestRelevantDestAmount) 
            {
                reserveCandidates[numRelevantReserves++] = i;
            }
        }

        if (numRelevantReserves > 1) {
            //when encountering small rate diff from bestRate. draw from relevant reserves
            bestReserve = reserveCandidates[uint(blockhash(block.number-1)) % numRelevantReserves];
        } else {
            bestReserve = reserveCandidates[0];
        }

        bestDestAmount = destAmounts[bestReserve];
    
        return (reserveArr[bestReserve], bestDestAmount, isFeeLessReserve[reserveArr[bestReserve]]);
    }
    /* solhint-enable code-complexity */

    function initTradeData (bytes memory hint)  internal view returns (TradeData memory ) {
        // parse hint and set reserves.
        // if no hint don't init arrays.
        //
    }

    struct TradingReserves {
        IKyberReserve[] addresses;
        uint[] rates; // rate per chosen reserve for token to eth
        bool[] isPayingFees;
        uint[] splitValuesPercent;
        uint decimals;
    }

    // enable up to x reserves for token to Eth and x for eth to token
    // if not hinted reserves use 1 reserve for each trade side
    struct TradeData {
        bool usePermissionless;

        TradingReserves tokenToEth;
        TradingReserves ethToToken;

        uint feePayingPercentage; // what part of this trade is fee paying. for token to token - up to 200%
        uint totalFeeWei;
        uint tradeWeiAmount;
        uint destAmount;
        uint rate; //the accumulated rate for full trade
    }

    // accumulate fee wei
    function findRatesAndAmounts(IERC20 src, IERC20 dst, uint srcAmount, TradeData memory tradeData) internal 
    // function should set following data for E2T and T2E:
    // reserve addresses array
    // reserve rate array
    // trade splits array
    // all above twice.
    // tradeWeiAmount
    // feeWeiAmount
    // tradeDestAmount
    // percent of trade that is fee paying.
    {
        uint accumulatedFeeWei; //save all fee in Wei

        // token to Eth
        ///////////////
        // if hinted reserves, find rates.
        // calculate accumulated amounts

        // else find best rate



        // Eth to token
        ///////////////
        // if hinted reserves, find rates and save.

        // else find best rate
        // calculate accumulated amounts


        // dest amount sbutract total fee wei

        // calc final rate
    }

    function handleFees(TradeData memory tradeData) internal returns(bool) {
        // create array of reserves receiving fees + fee percent per reserve
        // fees should add up to 100%.
        // send total fee amount to fee handler with reserve data.
    }

    function calcTradeSrcAmounts(uint srcDecimals, uint dstDecimals, uint destAmount, uint[] memory rates, 
                                uint[] memory splitValues)
        internal pure returns (uint srcAmount)
    {
        uint amountSoFar;

        for (uint i = 0; i < rates.length; i++) {
            uint destAmountSplit = i == splitValues.length ? (destAmount - amountSoFar) : splitValues[i] * destAmount /  100;
            amountSoFar += destAmountSplit;

            srcAmount += calcSrcQty(destAmountSplit, srcDecimals, dstDecimals, rates[i]);
        }
    }

    function calcTradeSrcAmountFromDest (IERC20 src, IERC20 dest, uint srcAmount, uint maxDestAmount, TradeData memory tradeData)
        internal view returns(uint actualSrcAmount)
    {
        if (dest != ETH_TOKEN_ADDRESS) {
            tradeData.tradeWeiAmount = calcTradeSrcAmounts(tradeData.ethToToken.decimals, ETH_DECIMALS, maxDestAmount, 
                tradeData.ethToToken.rates, tradeData.ethToToken.splitValuesPercent);
        } else {
            tradeData.tradeWeiAmount = maxDestAmount;
        }

        tradeData.totalFeeWei = tradeData.tradeWeiAmount * takerFeeBps * tradeData.feePayingPercentage / (BPS * 100) ;
        tradeData.tradeWeiAmount -= tradeData.totalFeeWei;

        if (src != ETH_TOKEN_ADDRESS) {
            actualSrcAmount = calcTradeSrcAmounts(ETH_DECIMALS, tradeData.tokenToEth.decimals, tradeData.tradeWeiAmount, tradeData.tokenToEth.rates, tradeData.tokenToEth.splitValuesPercent);
        } else {
            actualSrcAmount = tradeData.tradeWeiAmount;
        }
    
        require(actualSrcAmount <= srcAmount);
    }

    event KyberTrade(address indexed trader, IERC20 src, IERC20 dest, uint srcAmount, uint dstAmount,
        address destAddress, uint ethWeiValue, address reserve1, address reserve2, bytes hint);

    /* solhint-disable function-max-lines */
    //  Most of the lines here are functions calls spread over multiple lines. We find this function readable enough
    /// @notice use token address ETH_TOKEN_ADDRESS for ether
    /// @dev trade api for kyber network.
    /// @param tradeInput structure of trade inputs
    function trade(TradeInput memory tradeInput) internal returns(uint) {

        require(validateTradeInput(tradeInput.src, tradeInput.srcAmount, tradeInput.dest, tradeInput.destAddress));

        // parse hint, get reserves && splits
        TradeData memory tradeData = initTradeData(tradeInput.hint);

        // amounts excluding fees
        findRatesAndAmounts(tradeInput.src, tradeInput.dest, tradeInput.srcAmount, tradeData);

        require(tradeData.rate > 0);
        require(tradeData.rate < MAX_RATE);
        require(tradeData.rate >= tradeInput.minConversionRate);

        uint actualSrcAmount;

        if (tradeData.destAmount > tradeInput.maxDestAmount) {
            actualSrcAmount = calcTradeSrcAmountFromDest(
                tradeInput.src,
                tradeInput.dest,
                tradeInput.srcAmount,
                tradeInput.maxDestAmount,
                tradeData);

            require(handleChange(tradeInput.src, tradeInput.srcAmount, actualSrcAmount, tradeInput.trader));
        } else {
            actualSrcAmount = tradeInput.srcAmount;
        } 
        
        require(doReserveTrades(     //src to ETH
                tradeInput.src,
                actualSrcAmount,
                ETH_TOKEN_ADDRESS,
                address(this),
                tradeData,
                tradeData.tradeWeiAmount));

        require(doReserveTrades(     //Eth to dest
                ETH_TOKEN_ADDRESS,
                tradeData.tradeWeiAmount,
                tradeInput.dest,
                tradeInput.destAddress,
                tradeData,
                tradeData.destAmount));

        require(handleFees(tradeData));

        // KyberTrade({
        //     trader: tradeInput.trader,
        //     src: tradeInput.src,
        //     dest: tradeInput.dest,
        //     srcAmount: actualSrcAmount,
        //     dstAmount: actualDestAmount,
        //     destAddress: tradeInput.destAddress,
        //     ethWeiValue: weiAmount,
        //     reserve1: (tradeInput.src == ETH_TOKEN_ADDRESS) ? address(0) : rateResult.reserve1,
        //     reserve2:  (tradeInput.dest == ETH_TOKEN_ADDRESS) ? address(0) : rateResult.reserve2,
        //     hint: tradeInput.hint
        // });

        return tradeData.destAmount;
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
        uint amountSoFar;

        for(uint i = 0; i < reservesData.addresses.length; i++) {
            uint splitAmount = i == reservesData.splitValuesPercent.length ? (amount - amountSoFar) : reservesData.splitValuesPercent[i] * amount /  100;
            amountSoFar += splitAmount;
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
    function validateTradeInput(IERC20 src, uint srcAmount, IERC20 dest, address destAddress)
        internal
        view
        returns(bool)
    {
        require(srcAmount <= MAX_QTY);
        require(srcAmount != 0);
        require(destAddress != address(0));
        require(src != dest);

        if (src == ETH_TOKEN_ADDRESS) {
            require(msg.value == srcAmount);
        } else {
            require(msg.value == 0);
            //funds should have been moved to this contract already.
            require(src.balanceOf(address(this)) >= srcAmount);
        }

        return true;
    }
}
