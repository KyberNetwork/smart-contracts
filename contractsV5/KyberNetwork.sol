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
    function getExpectedRate(IERC20 src, IERC20 dest, uint srcQty) external view
        returns (uint expectedRateNoFees, uint expectedRateNetworkFees, uint expectedRateAllFees, uint worstRateAllFees);
}


////////////////////////////////////////////////////////////////////////////////////////////////////////
/// @title Kyber Network main contract
contract KyberNetwork is Withdrawable, Utils, IKyberNetwork, ReentrancyGuard {

    bytes public constant PERM_HINT = "PERM";
    uint  public constant PERM_HINT_GET_RATE = 1 << 255; // for get rate. bit mask hint.
   
    uint            public negligibleRateDiff = 10; // basic rate steps will be in 0.01%
    IWhiteList      public whiteListContract;
    IExpectedRate   public expectedRateContract;
    IFeeHandler     public feeHandlerContract;

    uint            public takerFeeData; // will include feeBps and expiry block
    address         public kyberNetworkProxyContract;
    uint            maxGasPriceValue = 50 * 1000 * 1000 * 1000; // 50 gwei
    bool            isEnabled = false; // network is enabled
    
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
        address platformWallet;
        uint platformFeeBps;
    }

    function tradeWithHint(
        address payable trader,
        IERC20 src,
        uint srcAmount,
        IERC20 dest,
        address payable destAddress,
        uint maxDestAmount,
        uint minConversionRate,
        address platformWallet,
        uint platformFeeBps,
        bytes memory hint
    )
        public
        nonReentrant
        payable
        returns(uint finalDestAmount, uint destAmountBeforeFee)
    {
        require(isEnabled);
        require(msg.sender == kyberNetworkProxyContract);
        require(tx.gasprice <= maxGasPriceValue);

        TradeInput memory tradeInput;
        TradeData memory tradeData;

        tradeInput.trader = trader;
        tradeInput.src = src;
        tradeInput.srcAmount = srcAmount;
        tradeInput.dest = dest;
        tradeInput.destAddress = destAddress;
        tradeInput.maxDestAmount = maxDestAmount;
        tradeInput.minConversionRate = minConversionRate;
        tradeInput.platformWallet = platformWallet;
        tradeInput.platformFeeBps = platformFeeBps;

        parseTradeDataHint(src, dest, tradeData, hint);
        
        return trade(tradeInput, tradeData);
    }


    function tradeWithParsedHint(
        address payable trader,
        IERC20 src,
        uint srcAmount,
        IERC20 dest,
        address payable destAddress,
        uint maxDestAmount,
        uint minConversionRate,
        address platformWallet,
        uint platformFeeBps,
        HintType E2THintType,
        uint[] memory E2TReserveIds,
        uint[] memory E2TSplitsBps,
        HintType T2EHintType,
        uint[] memory T2EReserveIds,
        uint[] memory T2ESplitsBps
    )
        public
        nonReentrant
        payable
        returns(uint finalDestAmount, uint destAmountBeforeFee)
    {
        require(isEnabled);
        require(msg.sender == kyberNetworkProxyContract);
        require(tx.gasprice <= maxGasPriceValue);

        TradeInput memory tradeInput;
        TradeData memory tradeData;
        
        tradeInput.trader = trader;
        tradeInput.src = src;
        tradeInput.srcAmount = srcAmount;
        tradeInput.dest = dest;
        tradeInput.destAddress = destAddress;
        tradeInput.maxDestAmount = maxDestAmount;
        tradeInput.minConversionRate = minConversionRate;
        tradeInput.platformWallet = platformWallet;
        tradeInput.platformFeeBps = platformFeeBps;

        setTradeDataHint(src, dest, tradeData, E2THintType, E2TReserveIds, E2TSplitsBps, T2EHintType, T2EReserveIds, T2ESplitsBps);
        
        return trade(tradeInput, tradeData);
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
        returns (uint expectedRateNoFees, uint expectedRateNetworkFees, uint expectedRateAllFees, uint worstRateAllFees)
    {
        require(expectedRateContract != IExpectedRate(0));
        if (src == dest) return (0, 0, 0, 0);

        srcQty = srcQty & ~PERM_HINT_GET_RATE;

        return expectedRateContract.getExpectedRate(src, dest, srcQty);
    }

   function getExpectedRateWithHint(IERC20 src, IERC20 dest, uint srcQty, uint platformFeeBps, bytes calldata hint) 
        external view
        returns (uint expectedRateNoFees, uint expectedRateNetworkFees, uint expectedRateAllFees, uint worstRateAllFees)
    {
        require(expectedRateContract != IExpectedRate(0));
        
        if (src == dest) return (0, 0, 0, 0);

        uint qty = srcQty & ~PERM_HINT_GET_RATE;

        return expectedRateContract.getExpectedRate(src, dest, qty);
    }

    function getExpectedRateWithParsedHint(IERC20 src, IERC20 dest, uint srcQty, uint platformFeeBps, HintType E2THintType,
        uint[] calldata E2TReserveIds, uint[] calldata E2TSplitsBps, HintType T2EHintType, uint[] calldata T2EReserveIds,
        uint[] calldata T2ESplitsBps) 
        external view
        returns (uint expectedRateNoFees, uint expectedRateNetworkFees, uint expectedRateAllFees, uint worstRateAllFees)
    {
        require(expectedRateContract != IExpectedRate(0));
        
        if (src == dest) return (0, 0, 0, 0);

        uint qty = srcQty & ~PERM_HINT_GET_RATE;

        return expectedRateContract.getExpectedRate(src, dest, qty);
    }

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
    function searchBestDestAmount(address[] memory reserveArr, IERC20 src, IERC20 dest, uint srcAmount, bool usePermissionless, 
        uint takerFeeBps)
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

    function initTradeData (uint takerPlatformFeeBps, bytes memory hint)  internal returns (TradeData memory ) {
        // parse hint and set reserves.
        // if no hint don't init arrays.
        
        uint takerFeeBps = getAndUpdateTakerFee();
        //
    }

    struct TradingReserves {
        IKyberReserve[] addresses;
        uint[] rates; // rate per chosen reserve for token to eth
        bool[] isPayingFees;
        uint[] splitValuesBps;
        uint decimals;
    }

    // enable up to x reserves for token to Eth and x for eth to token
    // if not hinted reserves use 1 reserve for each trade side
    struct TradeData {
        TradingReserves tokenToEth;
        TradingReserves ethToToken;
        
        uint tradeWei;
        uint networkFeeWei;
        uint platformFeeWei;

        uint takerFeeBps;
        uint platformFeeBps;
        
        uint numFeePayingReserves;
        uint feePayingReservesBps; // what part of this trade is fee paying. for token to token - up to 200%
        
        uint destAmountNoFee;
        uint destAmountWithNetworkFee;
        uint actualDestAmount; // all fees

        uint rateWithNetworkFee;
    }

    // accumulate fee wei
    function findRatesAndAmounts(IERC20 src, IERC20 dest, uint srcAmount, TradeData memory tradeData) internal 
    // function should set all TradeData so it can later be used without any ambiguity
    {
        // 1) assumes TradingReserves stores the reserves to be iterated over (meaning masking has been applied)
        IKyberReserve reserve;
        uint rate;
        uint amountSoFarNoFee;
        uint amountSoFarWithNetworkFee;
        uint amountSoFarWithNetworkAndCustomFee;
        uint splitAmount;
        bool isPayingFees;

        // token to Eth
        ///////////////
        // if split reserves, find rates
        // 2) can consider parsing enum hint type into tradeData for easy identification of splitHint. Or maybe just boolean flag
        if (tradeData.tokenToEth.splitValuesBps.length > 1) {
            for (uint i = 0; i < tradeData.tokenToEth.addresses.length; i++) {
                reserve = tradeData.tokenToEth.addresses[i];
                //calculate split and corresponding trade amounts
                splitAmount = (i == tradeData.tokenToEth.splitValuesBps.length - 1) ? (srcAmount - amountSoFarNoFee) : tradeData.tokenToEth.splitValuesBps[i] * srcAmount /  BPS;
                amountSoFarNoFee += splitAmount;
                tradeData.tokenToEth.rates[i] = reserve.getConversionRate(src, dest, splitAmount, block.number);
                tradeData.tradeWei += calcDestAmountWithDecimals(tradeData.tokenToEth.decimals, ETH_DECIMALS, splitAmount, rate);

                //account for fees
                if (tradeData.tokenToEth.isPayingFees[i]) {
                    tradeData.feePayingReservesBps += tradeData.tokenToEth.splitValuesBps[i];
                    tradeData.numFeePayingReserves ++;
                }
            }
        } else {
            // else find best dest amount
            // 3) I see current searchBestDestAmount returns dest amount minus takerFeeBps. Can return full amount instead?
            (reserve, tradeData.tradeWei, isPayingFees) = searchBestDestAmount(tradeData.tokenToEth.addresses, src, ETH_TOKEN_ADDRESS, srcAmount, tradeData.usePermissionless, tradeData.takerFeeBps);
            // save into tradeData
            tradeData.tokenToEth.addresses[0] = reserve;
            tradeData.tokenToEth.rates[0] = calcRateFromQty(srcAmount, tradeData.tradeWei, tradeData.tokenToEth.decimals, ETH_DECIMALS);
            tradeData.tokenToEth.splitValuesBps[0] = BPS; //max percentage amount

            //account for fees
            if (isPayingFees) {
                tradeData.feePayingReservesBps = BPS; //max percentage amount for token -> ETH
                tradeData.numFeePayingReserves ++;
            }
        }

        //handle tradeWei being zero
        if (tradeData.tradeWei == 0) {
            tradeData.rateWithNetworkFee = 0;
            return;
        }

        //if split reserves, add bps for ETH -> token 
        if (tradeData.tokenToEth.splitValuesBps.length > 1) {
            for (uint i = 0; i < tradeData.ethToToken.addresses.length; i++) {
                if (tradeData.ethToToken.isPayingFees[i]) {
                    tradeData.feePayingReservesBps += tradeData.ethToToken.splitValuesBps[i];
                    tradeData.numFeePayingReserves ++;
                }
            }
        }

        //fee deduction
        //no fee deduction occurs for masking of ETH -> token reserves, or if no ETH -> token reserve was specified
        //4) Duplicate calculation in calcTradeSrcAmountFromDest?
        tradeData.networkFeeWei = tradeData.tradeWei * tradeData.takerFeeBps * tradeData.feePayingReservesBps / (BPS * BPS);
        tradeData.platformFeeWei = tradeData.tradeWei * tradeData.platformFeeBps / BPS;

        // Eth to token
        ///////////////
        // if hinted reserves, find rates and save.
        if (tradeData.ethToToken.splitValuesBps.length > 1) {
            //reset amountSoFarNoFee
            amountSoFarNoFee = 0;

            for (uint i = 0; i < tradeData.ethToToken.addresses.length; i++) {
                IKyberReserve reserve = tradeData.ethToToken.addresses[i];

                //calculate split amount without any fee
                splitAmount = (i == tradeData.ethToToken.splitValuesBps.length - 1) ? (tradeData.tradeWei - amountSoFarNoFee) : tradeData.ethToToken.splitValuesBps[i] * tradeData.tradeWei / BPS;
                amountSoFarNoFee += splitAmount;
                //to save gas, we make just 1 conversion rate call with splitAmountNoFee
                rate = reserve.getConversionRate(src, dest, splitAmountNoFee, block.number);
                //save rate data
                tradeData.ethToToken.rates[i] = rate;
                tradeData.destAmountNoFee += calcDestAmountWithDecimals(ETH_DECIMALS, tradeData.ethToToken.decimals, splitAmount, rate);

                //calculate split amount with just network fee
                splitAmount = (i == tradeData.ethToToken.splitValuesBps.length - 1) ? (tradeData.tradeWei - tradeData.networkFeeWei - amountSoFarWithNetworkFee) : tradeData.ethToToken.splitValuesBps[i] * (tradeData.tradeWei - tradeData.networkFeeWei) /  BPS;
                amountSoFarWithNetworkFee += splitAmount;
                tradeData.destAmountWithNetworkFee += calcDestAmountWithDecimals(ETH_DECIMALS, tradeData.ethToToken.decimals, splitAmount, rate);
                
                //calculate split amount with both network and custom platform fee
                splitAmount = (i == tradeData.ethToToken.splitValuesBps.length - 1) ? 
                (tradeData.tradeWei - tradeData.networkFeeWei - tradeData.platformFeeWei - amountSoFarWithNetworkAndCustomFee) 
                : tradeData.ethToToken.splitValuesBps[i] * (tradeData.tradeWei - tradeData.networkFeeWei - tradeData.platformFeeWei) / BPS;
                amountSoFarWithNetworkAndCustomFee += splitAmount;
                tradeData.actualDestAmount = calcDestAmountWithDecimals(ETH_DECIMALS, tradeData.ethToToken.decimals, splitAmount, rate);
            }
        } else {
            // else, search best reserve and its corresponding dest amount
            // I search with full trade amount
            // 5) search ETH -> token reserves with full tradeWei amount right?
            (tradeData.ethToToken.addresses[0], tradeData.destAmountNoFee, isPayingFees) = searchBestDestAmount(ETH_TOKEN_ADDRESS, dest, tradeData.tradeWei, tradeData.usePermissionless);
            //store chosen reserve into tradeData
            tradeData.ethToToken.splitValuesBps[0] = BPS;
            tradeData.ethToToken.rates[0] = calcRateFromQty(tradeData.tradeWei, tradeData.destAmountNoFee, ETH_TOKEN_ADDRESS, tradeData.ethToToken.decimals);

            // add to feePayingReservesBps if reserve is fee paying
            if (isPayingFees) {
                tradeData.networkFeeWei += tradeData.tradeWei * tradeData.takerFeeBps / BPS;
                tradeData.feePayingReservesBps += BPS; //max percentage amount for ETH -> token
                tradeData.numFeePayingReserves ++;
            }

            //calculate destAmountWithNetworkFee and actualDestAmount
            tradeData.destAmountWithNetworkFee = calcDestAmountWithDecimals(ETH_DECIMALS, tradeData.ethToToken.decimals, tradeData.tradeWei - tradeData.networkFeeWei, tradeData.ethToToken.rates[0]);
            tradeData.actualDestAmount = calcDestAmountWithDecimals(ETH_DECIMALS, tradeData.ethToToken.decimals, tradeData.tradeWei - tradeData.networkFeeWei - tradeData.platformFeeWei, tradeData.ethToToken.rates[0]);
        }
        // calc final rate
        tradeData.rateWithNetworkFee = calcRateFromQty(srcAmount, tradeData.destAmountWithNetworkFee, tradeData.tokenToEth.decimals, tradeData.ethToToken.decimals);
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
        internal pure returns(uint actualSrcAmount)
    {
        if (dest != ETH_TOKEN_ADDRESS) {
            tradeData.tradeWei = calcTradeSrcAmounts(tradeData.ethToToken.decimals, ETH_DECIMALS, maxDestAmount, 
                tradeData.ethToToken.rates, tradeData.ethToToken.splitValuesBps);
        } else {
            tradeData.tradeWei = maxDestAmount;
        }

        tradeData.networkFeeWei = tradeData.tradeWei * tradeData.takerFeeBps * tradeData.feePayingReservesBps / (BPS ** 2);
        tradeData.tradeWei -= tradeData.networkFeeWei;

        if (src != ETH_TOKEN_ADDRESS) {
            actualSrcAmount = calcTradeSrcAmounts(ETH_DECIMALS, tradeData.tokenToEth.decimals, tradeData.tradeWei, tradeData.tokenToEth.rates, tradeData.tokenToEth.splitValuesBps);
        } else {
            actualSrcAmount = tradeData.tradeWei;
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
    function trade(TradeInput memory tradeInput, TradeData memory tradeData) internal 
        returns(uint actualDestAmount, uint destAmountBeforePlatformFee) 
    {
        require(validateTradeInput(tradeInput.src, tradeInput.srcAmount, tradeInput.dest, tradeInput.destAddress));

        // amounts excluding fees
        findRatesAndAmounts(tradeInput.src, tradeInput.dest, tradeInput.srcAmount, tradeInput.platformFeeBps, tradeData);

        require(tradeData.rateWithNetworkFee > 0);
        require(tradeData.rateWithNetworkFee < MAX_RATE);
        require(tradeData.rateWithNetworkFee >= tradeInput.minConversionRate);

        uint actualSrcAmount;

        if (tradeData.actualDestAmount > tradeInput.maxDestAmount) {
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
                tradeData.tradeWei));

        require(doReserveTrades(     //Eth to dest
                ETH_TOKEN_ADDRESS,
                tradeData.tradeWei,
                tradeInput.dest,
                tradeInput.destAddress,
                tradeData,
                tradeData.actualDestAmount));

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

        return (tradeData.actualDestAmount, tradeData.destAmountWithNetworkFee);
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
            uint splitAmount = i == reservesData.splitValuesBps.length ? (amount - amountSoFar) : reservesData.splitValuesBps[i] * amount /  BPS;
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
    
    // get fee view function. for get expected rate
    function getTakerFee() internal view returns(uint takerFeeBps) {
        return 25;

        // todo: read data. decode. read from DAO if expired;
        // todo: don't revert if DAO reverts. just return exsiting value.
    }
    
    // get fee function for trade. get fee and update data if expired.
    function getAndUpdateTakerFee() internal returns(uint takerFeeBps) {
        return 25;

        // todo: read data. decode. 
        // todo: if expired read from DAO and encode
        // todo: don't revert if DAO reverts. just return exsiting value.
    }
    
    function decodeTakerFee(uint feeData) internal pure returns(uint expiryBlock, uint takerFeeData) {
        
    }
    
    function encodeTakerFee(uint expiryBlock, uint feeBps) internal pure returns(uint feeData) {
        
    }
    
    function setTradeDataHint(IERC20 src, IERCO20 dest, TradeData memory tradeData,  HintType E2THintType, uint[] memory E2TReserveIds, uint[] memory E2TSplitsBps,
        HintType T2EHintType, uint[] memory T2EReserveIds, uint[] memory T2ESplitsBps) internal
    {
        tradeData.tokenToEth.decimals = getDecimals(src);
        tradeData.ethToToken.decimals = getDecimals(dest);
        //for masking in and out, will need the src and dest token address to filter out the reserves
    }
    
    function parseTradeDataHint(IERC20 src, IERCO20 dest, TradeData memory tradeData,  bytes memory hint) internal
    {
        tradeData.tokenToEth.decimals = getDecimals(src);
        tradeData.ethToToken.decimals = getDecimals(dest);
        //for masking in and out, will need the src and dest token address to filter out the reserves
    }
}