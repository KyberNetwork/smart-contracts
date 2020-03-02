pragma  solidity 0.5.11;

import "./PermissionGroupsV5.sol";
import "./IKyberTradeLogic.sol";
import "./KyberHintHandler.sol";


contract KyberTradeLogic is KyberHintHandler, IKyberTradeLogic, PermissionGroups {
    uint            public negligibleRateDiffBps = 5; // 1 bps is 0.01%
    IKyberNetwork   public networkContract;

    mapping(bytes8=>address[]) public reserveIdToAddresses;
    mapping(address=>bytes8) internal reserveAddressToId;
    mapping(address=>uint) internal reserveType; //type from enum IKyberNetwork.ReserveType
    mapping(address=>IKyberReserve[]) public reservesPerTokenSrc; // reserves supporting token to eth
    mapping(address=>IKyberReserve[]) public reservesPerTokenDest;// reserves support eth to token

    uint internal feePayingPerType = 0xffffffff;
    
    constructor(address _admin) public
        PermissionGroups(_admin)
    { /* empty body */ }

    modifier onlyNetwork() {
        require(msg.sender == address(networkContract), "ONLY_NETWORK");
        _;
    }

    function setNegligbleRateDiffBps(uint _negligibleRateDiffBps) external onlyNetwork returns (bool) {
        require(_negligibleRateDiffBps <= BPS, "rateDiffBps > BPS"); // at most 100%
        negligibleRateDiffBps = _negligibleRateDiffBps;
        return true;
    }

    event NetworkContractUpdate(IKyberNetwork newNetwork);
    function setNetworkContract(IKyberNetwork _networkContract) external onlyAdmin {
        require(_networkContract != IKyberNetwork(0), "network 0");
        emit NetworkContractUpdate(_networkContract);
        networkContract = _networkContract;
    }

    function addReserve(address reserve, bytes8 reserveId, IKyberNetwork.ReserveType resType) external 
        onlyNetwork returns (bool) 
    {
        require(reserveAddressToId[reserve] == bytes8(0), "reserve has id");
        require(reserveId != 0, "reserveId = 0");
        require(resType != IKyberNetwork.ReserveType.NONE, "bad res type");
        require(feePayingPerType !=  0xffffffff, "Fee paying not set");

        if (reserveIdToAddresses[reserveId].length == 0) {
            reserveIdToAddresses[reserveId].push(reserve);
        } else {
            require(reserveIdToAddresses[reserveId][0] == address(0), "reserveId taken");
            reserveIdToAddresses[reserveId][0] = reserve;
        }

        reserveAddressToId[reserve] = reserveId;
        reserveType[reserve] = uint(resType);
        return true;
    }

    function removeReserve(address reserve) external onlyNetwork returns (bytes8) {
        require(reserveAddressToId[reserve] != bytes8(0), "reserve -> 0 reserveId");
        bytes8 reserveId = reserveAddressToId[reserve];

        reserveIdToAddresses[reserveId].push(reserveIdToAddresses[reserveId][0]);
        reserveIdToAddresses[reserveId][0] = address(0);

        return reserveId;
    }

    function setFeePayingPerReserveType(bool fpr, bool apr, bool bridge, bool utility) external onlyAdmin {
        uint feePayingData;

        if (apr) feePayingData |= 1 << uint(IKyberNetwork.ReserveType.APR);
        if (fpr) feePayingData |= 1 << uint(IKyberNetwork.ReserveType.FPR);
        if (bridge) feePayingData |= 1 << uint(IKyberNetwork.ReserveType.BRIDGE);
        if (utility) feePayingData |= 1 << uint(IKyberNetwork.ReserveType.UTILITY);

        feePayingPerType = feePayingData;        
    }

    function getReserveDetails(address reserve) public view
        returns(bytes8 reserveId, IKyberNetwork.ReserveType resType, bool isFeePaying)
    {
        reserveId = reserveAddressToId[reserve];
        resType = IKyberNetwork.ReserveType(reserveType[reserve]);
        isFeePaying = (feePayingPerType & (1 << reserveType[reserve])) > 0;
    }
    struct Amounts {
        uint srcAmount;
        uint ethSrcAmount;
        uint destAmount;
    }

    function getRatesForToken(IERC20 token, uint optionalBuyAmount, uint optionalSellAmount, uint networkFeeBps) external view
        returns(IKyberReserve[] memory buyReserves, uint[] memory buyRates, IKyberReserve[] memory sellReserves, uint[] memory sellRates)
    {
        Amounts memory A;

        A.srcAmount = optionalBuyAmount > 0 ? optionalBuyAmount : 1000;
        buyReserves = reservesPerTokenDest[address(token)];
        buyRates = new uint[](buyReserves.length);
        bool[] memory isFeePaying = getIsFeePayingReserves(buyReserves);

        uint i;
        for (i = 0; i < buyReserves.length; i++) {
            if (networkFeeBps == 0 || !isFeePaying[i]) {
                buyRates[i] = buyReserves[i].getConversionRate(ETH_TOKEN_ADDRESS, token, A.srcAmount, block.number);
                continue;
            }

            A.ethSrcAmount = A.srcAmount - (A.srcAmount * networkFeeBps / BPS);
            buyRates[i] = buyReserves[i].getConversionRate(ETH_TOKEN_ADDRESS, token, A.ethSrcAmount, block.number);
            A.destAmount = calcDstQty(A.ethSrcAmount, ETH_DECIMALS, getDecimals(token), buyRates[i]);
            //use amount instead of ethSrcAmount to account for network fee
            buyRates[i] = calcRateFromQty(A.srcAmount, A.destAmount, ETH_DECIMALS, getDecimals(token));
        }

        A.srcAmount = optionalSellAmount > 0 ? optionalSellAmount : 1000;
        sellReserves = reservesPerTokenSrc[address(token)];
        sellRates = new uint[](sellReserves.length);
        isFeePaying = getIsFeePayingReserves(sellReserves);

        for (i = 0; i < sellReserves.length; i++) {
            sellRates[i] = sellReserves[i].getConversionRate(token, ETH_TOKEN_ADDRESS, A.srcAmount, block.number);
            if (networkFeeBps == 0 || !isFeePaying[i]) {
                continue;
            }
            A.destAmount = calcDstQty(A.srcAmount, getDecimals(token), ETH_DECIMALS, sellRates[i]);
            A.destAmount -= networkFeeBps * A.destAmount / BPS;
            sellRates[i] = calcRateFromQty(A.srcAmount, A.destAmount, getDecimals(token), ETH_DECIMALS);
        }
    }

    function listPairForReserve(IKyberReserve reserve, IERC20 token, bool ethToToken, bool tokenToEth, bool add) onlyNetwork external returns (bool) {
        require(reserveAddressToId[address(reserve)] != bytes8(0), "reserve -> 0 reserveId");
        if (ethToToken) {
            listPairs(IKyberReserve(reserve), token, false, add);
        }

        if (tokenToEth) {
            listPairs(IKyberReserve(reserve), token, true, add);
        }

        setDecimals(token);
        return true;
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

    struct TradingReserves {
        TradeType tradeType;
        IKyberReserve[] addresses;
        uint[] rates;
        uint[] splitValuesBps;
        bool[] isFeePaying;
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

        uint networkFeeBps;
        
        uint numFeePayingReserves;
        uint feePayingReservesBps; // what part of this trade is fee paying. for token to token - up to 200%
        
        uint destAmountNoFee;
        uint destAmountWithNetworkFee;
        uint actualDestAmount; // all fees
    }

    function calcRatesAndAmounts(IERC20 src, IERC20 dest, uint srcDecimals, uint destDecimals, uint[] calldata info, bytes calldata hint)
        external view returns (
            uint[] memory results,
            IKyberReserve[] memory reserveAddresses,
            uint[] memory rates,
            uint[] memory splitValuesBps,
            bool[] memory isFeePaying,
            bytes8[] memory ids)
    {
        //initialisation
        TradeData memory tData;
        tData.tokenToEth.decimals = srcDecimals;
        tData.ethToToken.decimals = destDecimals;
        tData.networkFeeBps = info[uint(IKyberTradeLogic.InfoIndex.networkFeeBps)];

        parseTradeDataHint(src, dest, tData, hint);

        calcRatesAndAmountsTokenToEth(src, info[uint(IKyberTradeLogic.InfoIndex.srcAmount)], tData);

        if (tData.tradeWei == 0) {
            //initialise ethToToken and store as zero
            storeTradeReserveData(tData.ethToToken, IKyberReserve(0), 0, false);
            return packResults(tData);
        }

        //if split reserves, add bps for ETH -> token
        if (tData.ethToToken.splitValuesBps.length > 1) {
            for (uint i = 0; i < tData.ethToToken.addresses.length; i++) {
                //check if ETH->token split reserves are fee paying
                tData.ethToToken.isFeePaying = getIsFeePayingReserves(tData.ethToToken.addresses);
                if (tData.ethToToken.isFeePaying[i]) {
                    tData.feePayingReservesBps += tData.ethToToken.splitValuesBps[i];
                    tData.numFeePayingReserves ++;
                }
            }
        }

        //fee deduction
        //no fee deduction occurs for masking of ETH -> token reserves, or if no ETH -> token reserve was specified
        tData.networkFeeWei = tData.tradeWei * tData.networkFeeBps * tData.feePayingReservesBps / (BPS * BPS);
        tData.platformFeeWei = tData.tradeWei * info[uint(IKyberTradeLogic.InfoIndex.platformFeeBps)] / BPS;

        require(tData.tradeWei >= (tData.networkFeeWei + tData.platformFeeWei), "fees exceed trade amt");
        calcRatesAndAmountsEthToToken(dest, tData.tradeWei - tData.networkFeeWei - tData.platformFeeWei, tData);

        return packResults(tData);
    }

    function parseTradeDataHint(IERC20 src, IERC20 dest, TradeData memory tData, bytes memory hint) internal view {
        uint failedIndex;

        tData.tokenToEth.addresses = (src == ETH_TOKEN_ADDRESS) ?
            new IKyberReserve[](1) : reservesPerTokenSrc[address(src)];
        tData.ethToToken.addresses = (dest == ETH_TOKEN_ADDRESS) ?
            new IKyberReserve[](1) :reservesPerTokenDest[address(dest)];

        // PERM is treated as no hint, so we just return
        // relevant arrays will be initialised when storing data
        if (hint.length == 0 || hint.length == 4) return;

        // uint start = printGas("", 0, Module.LOGIC);
        if (src == ETH_TOKEN_ADDRESS) {
            (
                tData.ethToToken.tradeType,
                tData.ethToToken.addresses,
                tData.ethToToken.splitValuesBps,
                failedIndex
            ) = parseHintE2T(hint);
        } else if (dest == ETH_TOKEN_ADDRESS) {
            (
                tData.tokenToEth.tradeType,
                tData.tokenToEth.addresses,
                tData.tokenToEth.splitValuesBps,
                failedIndex
            ) = parseHintT2E(hint);
        } else {
            (
                tData.tokenToEth.tradeType,
                tData.tokenToEth.addresses,
                tData.tokenToEth.splitValuesBps,
                tData.ethToToken.tradeType,
                tData.ethToToken.addresses,
                tData.ethToToken.splitValuesBps,
                failedIndex
            ) = parseHintT2T(hint);
        }

        require(failedIndex > 0, "Hint error");
        // start = printGas("parse hint", start, Module.LOGIC);

        // T2E: apply masking out logic if mask out
        if (tData.tokenToEth.tradeType == TradeType.MaskOut) {
            tData.tokenToEth.addresses = maskOutReserves(reservesPerTokenSrc[address(src)], tData.tokenToEth.addresses);
        // initialise relevant arrays if split
        } else if (tData.tokenToEth.tradeType == TradeType.Split) {
            tData.tokenToEth.rates = new uint[](tData.tokenToEth.addresses.length);
            tData.tokenToEth.isFeePaying = new bool[](tData.tokenToEth.addresses.length);
        }

        //E2T: apply masking out logic if mask out
        if (tData.ethToToken.tradeType == TradeType.MaskOut) {
            tData.ethToToken.addresses = maskOutReserves(reservesPerTokenDest[address(dest)], tData.ethToToken.addresses);
        // initialise relevant arrays if split
        } else if (tData.ethToToken.tradeType == TradeType.Split) {
            tData.ethToToken.rates = new uint[](tData.ethToToken.addresses.length);
            tData.ethToToken.isFeePaying = new bool[](tData.ethToToken.addresses.length);
        }
    }

    function maskOutReserves(IKyberReserve[] memory allReservesPerToken, IKyberReserve[] memory maskedOutReserves)
        internal pure returns (IKyberReserve[] memory filteredReserves)
    {
        // uint start = printGas("", 0, Module.LOGIC);
        require(allReservesPerToken.length >= maskedOutReserves.length, "MASK_OUT_TOO_LONG");
        filteredReserves = new IKyberReserve[](allReservesPerToken.length - maskedOutReserves.length);
        uint currentResultIndex = 0;

        //TODO: optimize mask out algo
        for (uint i = 0; i < allReservesPerToken.length; i++) {
            IKyberReserve reserve = allReservesPerToken[i];
            bool notMaskedOut = true;

            for (uint j = 0; j < maskedOutReserves.length; j++) {
                IKyberReserve maskedOutReserve = maskedOutReserves[j];
                if (reserve == maskedOutReserve) {
                    notMaskedOut = false;
                    break;
                }
            }

            if (notMaskedOut) filteredReserves[currentResultIndex++] = reserve;
        }
        // printGas("mask out algo", start, Module.LOGIC);
    }

    function calcRatesAndAmountsTokenToEth(IERC20 src, uint srcAmount, TradeData memory tData) internal view {
        IKyberReserve reserve;
        bool isFeePaying;
        uint rate;

        // token to Eth
        ///////////////
        // if split reserves, find rates
        if (tData.tokenToEth.splitValuesBps.length > 1) {
            (tData.tradeWei, tData.feePayingReservesBps, tData.numFeePayingReserves) = getDestQtyAndFeeDataFromSplits(tData.tokenToEth, src, srcAmount, true);
        } else {
            // else find best rate
            (reserve, rate, isFeePaying) = searchBestRate(
                tData.tokenToEth.addresses,
                src,
                ETH_TOKEN_ADDRESS,
                srcAmount,
                tData.networkFeeBps
            );
            //save into tradeData
            storeTradeReserveData(tData.tokenToEth, reserve, rate, isFeePaying);
            tData.tradeWei = calcDstQty(srcAmount, tData.tokenToEth.decimals, ETH_DECIMALS, rate);

            //account for fees
            if (isFeePaying) {
                tData.feePayingReservesBps = BPS; //max percentage amount for token -> ETH
                tData.numFeePayingReserves ++;
            }
        }
    }

    function getDestQtyAndFeeDataFromSplits(
        TradingReserves memory tradingReserves,
        IERC20 token,
        uint tradeAmt,
        bool isTokenToEth
    )
        internal
        view
        returns (uint destQty, uint feePayingReservesBps, uint numFeePayingReserves)
    {
        IKyberReserve reserve;
        uint splitAmount;
        uint amountSoFar;
        tradingReserves.isFeePaying = getIsFeePayingReserves(tradingReserves.addresses);

        for (uint i = 0; i < tradingReserves.addresses.length; i++) {
            reserve = tradingReserves.addresses[i];
            //calculate split and corresponding trade amounts
            splitAmount = (i == tradingReserves.splitValuesBps.length - 1) ? (tradeAmt - amountSoFar) : tradingReserves.splitValuesBps[i] * tradeAmt / BPS;
            amountSoFar += splitAmount;
            if (isTokenToEth) {
                tradingReserves.rates[i] = reserve.getConversionRate(token, ETH_TOKEN_ADDRESS, splitAmount, block.number);
                //if zero rate for any split reserve, return zero destQty
                if (tradingReserves.rates[i] == 0) {
                    return (0, 0, 0);
                }
                destQty += calcDstQty(splitAmount, tradingReserves.decimals, ETH_DECIMALS, tradingReserves.rates[i]);
                if (tradingReserves.isFeePaying[i]) {
                    feePayingReservesBps += tradingReserves.splitValuesBps[i];
                    numFeePayingReserves++;
                }
            } else {
                tradingReserves.rates[i] = reserve.getConversionRate(ETH_TOKEN_ADDRESS, token, splitAmount, block.number);
                //if zero rate for any split reserve, return zero destQty
                if (tradingReserves.rates[i] == 0) {
                    return (0, 0, 0);
                }
                destQty += calcDstQty(splitAmount, ETH_DECIMALS, tradingReserves.decimals, tradingReserves.rates[i]);
            }
        }
    }

    function storeTradeReserveData(TradingReserves memory tradingReserves, IKyberReserve reserve, uint rate, bool isFeePaying) internal pure {
        //init arrays
        tradingReserves.addresses = new IKyberReserve[](1);
        tradingReserves.rates = new uint[](1);
        tradingReserves.splitValuesBps = new uint[](1);
        tradingReserves.isFeePaying = new bool[](1);

        //save information
        tradingReserves.addresses[0] = reserve;
        tradingReserves.rates[0] = rate;
        tradingReserves.splitValuesBps[0] = BPS; //max percentage amount
        tradingReserves.isFeePaying[0] = isFeePaying;
    }

    function packResults(TradeData memory tData) internal view returns (
        uint[] memory results,
        IKyberReserve[] memory reserveAddresses,
        uint[] memory rates,
        uint[] memory splitValuesBps,
        bool[] memory isFeePaying,
        bytes8[] memory ids
        )
    {
        // uint start = printGas("pack result Start", 0, Module.LOGIC);
        uint tokenToEthNumReserves = tData.tokenToEth.addresses.length;
        uint totalNumReserves = tokenToEthNumReserves + tData.ethToToken.addresses.length;
        reserveAddresses = new IKyberReserve[](totalNumReserves);
        rates = new uint[](totalNumReserves);
        splitValuesBps = new uint[](totalNumReserves);
        isFeePaying = new bool[](totalNumReserves);
        ids = new bytes8[](totalNumReserves);

        results = new uint[](uint(ResultIndex.resultLength));
        results[uint(ResultIndex.t2eNumReserves)] = tokenToEthNumReserves;
        results[uint(ResultIndex.tradeWei)] = tData.tradeWei;
        results[uint(ResultIndex.numFeePayingReserves)] = tData.numFeePayingReserves;
        results[uint(ResultIndex.feePayingReservesBps)] = tData.feePayingReservesBps;
        results[uint(ResultIndex.destAmountNoFee)] = tData.destAmountNoFee;
        results[uint(ResultIndex.destAmountWithNetworkFee)] = tData.destAmountWithNetworkFee;
        results[uint(ResultIndex.actualDestAmount)] = tData.actualDestAmount;

        // store token to ETH information
        for (uint i = 0; i < tokenToEthNumReserves; i++) {
            reserveAddresses[i] = tData.tokenToEth.addresses[i];
            rates[i] = tData.tokenToEth.rates[i];
            splitValuesBps[i] = tData.tokenToEth.splitValuesBps[i];
            isFeePaying[i] = tData.tokenToEth.isFeePaying[i];
            ids[i] = convertAddressToReserveId(address(reserveAddresses[i]));
        }
        
        // then store ETH to token information, but need to offset when accessing tradeData
        for (uint i = tokenToEthNumReserves; i < totalNumReserves; i++) {
            reserveAddresses[i] = tData.ethToToken.addresses[i - tokenToEthNumReserves];
            rates[i] = tData.ethToToken.rates[i - tokenToEthNumReserves];
            splitValuesBps[i] = tData.ethToToken.splitValuesBps[i - tokenToEthNumReserves];
            isFeePaying[i] = tData.ethToToken.isFeePaying[i - tokenToEthNumReserves];
            ids[i] = convertAddressToReserveId(address(reserveAddresses[i]));
        }
        // printGas("pack result end", start, Module.LOGIC);
    }

    function calcRatesAndAmountsEthToToken(IERC20 dest, uint actualTradeWei, TradeData memory tData) internal view {
        IKyberReserve reserve;
        uint rate;
        bool isFeePaying;
        
        // Eth to token
        ///////////////
        // if hinted reserves, find rates and save.
        if (tData.ethToToken.splitValuesBps.length > 1) {
            (tData.actualDestAmount, , ) = getDestQtyAndFeeDataFromSplits(tData.ethToToken, dest, actualTradeWei, false);
            //calculate actual rate
            rate = calcRateFromQty(actualTradeWei, tData.actualDestAmount, ETH_DECIMALS, tData.ethToToken.decimals);
        } else {
            //network fee for ETH -> token is in ETH amount
            uint ethToTokenNetworkFeeWei = tData.tradeWei * tData.networkFeeBps / BPS;
            // search best reserve and its corresponding dest amount
            // Have to search with tradeWei minus fees, because that is the actual src amount for ETH -> token trade
            (reserve, rate, isFeePaying) = searchBestRate(
                tData.ethToToken.addresses,
                ETH_TOKEN_ADDRESS,
                dest,
                actualTradeWei,
                ethToTokenNetworkFeeWei
            );

            //save into tradeData
            storeTradeReserveData(tData.ethToToken, reserve, rate, isFeePaying);

            // add to feePayingReservesBps if reserve is fee paying
            if (isFeePaying) {
                tData.networkFeeWei += ethToTokenNetworkFeeWei;
                tData.feePayingReservesBps += BPS; //max percentage amount for ETH -> token
                tData.numFeePayingReserves ++;
            }

            //take into account possible additional networkFee
            require(tData.tradeWei >= tData.networkFeeWei + tData.platformFeeWei, "fees exceed trade amt");
            tData.actualDestAmount = calcDstQty(tData.tradeWei - tData.networkFeeWei - tData.platformFeeWei, ETH_DECIMALS, tData.ethToToken.decimals, rate);
        }

        //finally, in both cases, we calculate destAmountWithNetworkFee and destAmountNoFee
        tData.destAmountWithNetworkFee = calcDstQty(tData.tradeWei - tData.networkFeeWei, ETH_DECIMALS, tData.ethToToken.decimals, rate);
        tData.destAmountNoFee = calcDstQty(tData.tradeWei, ETH_DECIMALS, tData.ethToToken.decimals, rate);
    }

    struct BestReserveInfo {
        uint index;
        uint destAmount;
        uint numRelevantReserves;
    }

    /* solhint-disable code-complexity */
    // Regarding complexity. Below code follows the required algorithm for choosing a reserve.
    //  It has been tested, reviewed and found to be clear enough.
    //@dev this function always src or dest are ether. can't do token to token
    //TODO: document networkFee
    function searchBestRate(IKyberReserve[] memory reserveArr, IERC20 src, IERC20 dest, uint srcAmount, uint networkFee)
        internal
        view
        returns(IKyberReserve reserve, uint, bool isFeePaying)
    {
        //use destAmounts for comparison, but return the best rate
        BestReserveInfo memory bestReserve;
        bestReserve.numRelevantReserves = 1; // assume always best reserve will be relevant

        //return 1:1 for ether to ether
        if (src == dest) return (IKyberReserve(0), PRECISION, false);
        //return zero rate for empty reserve array (unlisted token)
        if (reserveArr.length == 0) return (IKyberReserve(0), 0, false);

        uint[] memory rates = new uint[](reserveArr.length);
        uint[] memory reserveCandidates = new uint[](reserveArr.length);
        bool[] memory feePayingPerReserve = getIsFeePayingReserves(reserveArr);
        
        uint destAmount;
        uint srcAmountWithFee;

        for (uint i = 0; i < reserveArr.length; i++) {
            reserve = reserveArr[i];
            isFeePaying = feePayingPerReserve[i];
            //for ETH -> token paying reserve, networkFee is specified in amount
            if (src == ETH_TOKEN_ADDRESS && isFeePaying) {
                require(srcAmount > networkFee, "fee >= E2T tradeAmt");
                srcAmountWithFee = srcAmount - networkFee;
            } else {
                srcAmountWithFee = srcAmount;
            }
            rates[i] = reserve.getConversionRate(
                src,
                dest,
                srcAmountWithFee,
                block.number);

            destAmount = srcAmountWithFee * rates[i] / PRECISION;
             //for token -> ETH paying reserve, networkFee is specified in bps
            destAmount = (dest == ETH_TOKEN_ADDRESS && isFeePaying) ? destAmount * (BPS - networkFee) / BPS : destAmount;

            if (destAmount > bestReserve.destAmount) {
                //best rate is highest rate
                bestReserve.destAmount = destAmount;
                bestReserve.index = i;
            }
        }

        if(bestReserve.destAmount == 0) return (reserveArr[bestReserve.index], 0, false);
        
        reserveCandidates[0] = bestReserve.index;
        
        // if this reserve pays fee its actual rate is less. so smallestRelevantRate is smaller.
        bestReserve.destAmount = bestReserve.destAmount * BPS / (BPS + negligibleRateDiffBps);

        for (uint i = 0; i < reserveArr.length; i++) {

            if (i == bestReserve.index) continue;

            isFeePaying = feePayingPerReserve[i];
            srcAmountWithFee = ((src == ETH_TOKEN_ADDRESS) && isFeePaying) ? srcAmount - networkFee : srcAmount;
            destAmount = srcAmountWithFee * rates[i] / PRECISION;
            destAmount = (dest == ETH_TOKEN_ADDRESS && isFeePaying) ? destAmount * (BPS - networkFee) / BPS : destAmount;

            if (destAmount > bestReserve.destAmount) {
                reserveCandidates[bestReserve.numRelevantReserves++] = i;
            }
        }

        if (bestReserve.numRelevantReserves > 1) {
            //when encountering small rate diff from bestRate. draw from relevant reserves
            bestReserve.index = reserveCandidates[uint(blockhash(block.number-1)) % bestReserve.numRelevantReserves];
        } else {
            bestReserve.index = reserveCandidates[0];
        }

        return (reserveArr[bestReserve.index], rates[bestReserve.index], feePayingPerReserve[bestReserve.index]);
    }

    function getIsFeePayingReserves(IKyberReserve[] memory reserves) internal view 
        returns(bool[] memory feePayingArr) 
    {
        feePayingArr = new bool[](reserves.length);

        uint feePayingData = feePayingPerType;

        for (uint i = 0; i < reserves.length; i++) {
            feePayingArr[i] = (feePayingData & 1 << reserveType[address(reserves[i])] > 0);
        }
    }

    function convertReserveIdToAddress(bytes8 reserveId)
        internal
        view
        returns (address)
    {
        return reserveIdToAddresses[reserveId][0];
    }

    function convertAddressToReserveId(address reserveAddress)
        internal
        view
        returns (bytes8)
    {
        return reserveAddressToId[reserveAddress];
    }
}
