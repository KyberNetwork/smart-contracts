pragma  solidity 0.5.11;

import "./PermissionGroupsV5.sol";
import "./IKyberReserve.sol";
import "./IKyberNetwork.sol";
import "./IKyberTradeLogic.sol";
import "./KyberHintHandler.sol";


contract KyberTradeLogic is KyberHintHandler, IKyberTradeLogic, PermissionGroups {
    uint            public negligibleRateDiffBps = 10; // bps is 0.01%

    IKyberNetwork   public networkContract;

    mapping(address=>bytes8) public reserveAddressToId;
    mapping(bytes8=>address[]) public reserveIdToAddresses;
    mapping(address=>bool) internal isFeePayingReserve;
    mapping(address=>IKyberReserve[]) public reservesPerTokenSrc; // reserves supporting token to eth
    mapping(address=>IKyberReserve[]) public reservesPerTokenDest;// reserves support eth to token

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

    function addReserve(address reserve, bytes8 reserveId, bool isFeePaying) external onlyNetwork returns (bool) {
        require(reserveAddressToId[reserve] == bytes8(0), "reserve has id");
        require(reserveId != 0, "reserveId = 0");

        if (reserveIdToAddresses[reserveId].length == 0) {
            reserveIdToAddresses[reserveId].push(reserve);
        } else {
            require(reserveIdToAddresses[reserveId][0] == address(0), "reserveId taken");
            reserveIdToAddresses[reserveId][0] = reserve;
        }

        reserveAddressToId[reserve] = reserveId;
        isFeePayingReserve[reserve] = isFeePaying;
        return true;
    }

    function removeReserve(address reserve) external onlyNetwork returns (bytes8) {
        require(reserveAddressToId[reserve] != bytes8(0), "reserve -> 0 reserveId");
        bytes8 reserveId = reserveAddressToId[reserve];

        reserveIdToAddresses[reserveId].push(reserveIdToAddresses[reserveId][0]);
        reserveIdToAddresses[reserveId][0] = address(0);

        return reserveId;
    }

    function getRatesForToken(IERC20 token, uint optionalBuyAmount, uint optionalSellAmount, uint takerFeeBps) external view
        returns(IKyberReserve[] memory buyReserves, uint[] memory buyRates, IKyberReserve[] memory sellReserves, uint[] memory sellRates)
    {
        uint amount = optionalBuyAmount > 0 ? optionalBuyAmount : 1000;
        uint tokenDecimals = getDecimals(token);
        buyReserves = reservesPerTokenDest[address(token)];
        buyRates = new uint[](buyReserves.length);

        uint i;
        uint destAmount;
        for (i = 0; i < buyReserves.length; i++) {
            if (takerFeeBps == 0 || (!isFeePayingReserve[address(buyReserves[i])])) {
                buyRates[i] = (IKyberReserve(buyReserves[i])).getConversionRate(ETH_TOKEN_ADDRESS, token, amount, block.number);
                continue;
            }

            uint ethSrcAmount = amount - (amount * takerFeeBps / BPS);
            buyRates[i] = (IKyberReserve(buyReserves[i])).getConversionRate(ETH_TOKEN_ADDRESS, token, ethSrcAmount, block.number);
            destAmount = calcDstQty(ethSrcAmount, ETH_DECIMALS, tokenDecimals, buyRates[i]);
            //use amount instead of ethSrcAmount to account for network fee
            buyRates[i] = calcRateFromQty(amount, destAmount, ETH_DECIMALS, tokenDecimals);
        }

        amount = optionalSellAmount > 0 ? optionalSellAmount : 1000;
        sellReserves = reservesPerTokenSrc[address(token)];
        sellRates = new uint[](sellReserves.length);

        for (i = 0; i < sellReserves.length; i++) {
            sellRates[i] = (IKyberReserve(sellReserves[i])).getConversionRate(token, ETH_TOKEN_ADDRESS, amount, block.number);
            if (takerFeeBps == 0 || (!isFeePayingReserve[address(sellReserves[i])])) {
                continue;
            }
            destAmount = calcDstQty(amount, tokenDecimals, ETH_DECIMALS, sellRates[i]);
            destAmount -= takerFeeBps * destAmount / BPS;
            sellRates[i] = calcRateFromQty(amount, destAmount, tokenDecimals, ETH_DECIMALS);
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

        uint[] fees;
        
        uint numFeePayingReserves;
        uint feePayingReservesBps; // what part of this trade is fee paying. for token to token - up to 200%
        
        uint destAmountNoFee;
        uint destAmountWithNetworkFee;
        uint actualDestAmount; // all fees
    }

    function calcRatesAndAmounts(IERC20 src, IERC20 dest, uint srcAmount, uint[] calldata fees, bytes calldata hint)
        external view returns (
            uint[] memory results,
            IKyberReserve[] memory reserveAddresses,
            uint[] memory rates,
            uint[] memory splitValuesBps,
            bool[] memory isFeePaying)
    {
        //initialisation
        TradeData memory tradeData;
        tradeData.tokenToEth.decimals = getDecimals(src);
        tradeData.ethToToken.decimals = getDecimals(dest);

        parseTradeDataHint(src, dest, fees, tradeData, hint);

        calcRatesAndAmountsTokenToEth(src, srcAmount, tradeData);

        //TODO: see if this need to be shifted below instead
        if (tradeData.tradeWei == 0) {
            //initialise ethToToken and store as zero
            storeTradeReserveData(tradeData.ethToToken, IKyberReserve(0), 0, false);
            return packResults(tradeData);
        }

        //if split reserves, add bps for ETH -> token
        if (tradeData.ethToToken.splitValuesBps.length > 1) {
            for (uint i = 0; i < tradeData.ethToToken.addresses.length; i++) {
                if (tradeData.ethToToken.isFeePaying[i]) {
                    tradeData.feePayingReservesBps += tradeData.ethToToken.splitValuesBps[i];
                    tradeData.numFeePayingReserves ++;
                }
            }
        }

        //fee deduction
        //no fee deduction occurs for masking of ETH -> token reserves, or if no ETH -> token reserve was specified
        tradeData.networkFeeWei = tradeData.tradeWei * tradeData.fees[uint(FeesIndex.takerFeeBps)] * tradeData.feePayingReservesBps / (BPS * BPS);
        tradeData.platformFeeWei = tradeData.tradeWei * tradeData.fees[uint(FeesIndex.platformFeeBps)] / BPS;

        require(tradeData.tradeWei >= (tradeData.networkFeeWei + tradeData.platformFeeWei), "fees exceed trade amt");
        calcRatesAndAmountsEthToToken(dest, tradeData.tradeWei - tradeData.networkFeeWei - tradeData.platformFeeWei, tradeData);

        return packResults(tradeData);
    }

    function parseTradeDataHint(IERC20 src, IERC20 dest, uint[] memory fees, TradeData memory tradeData, bytes memory hint) internal view {
        uint failingIndex;
    
        tradeData.tokenToEth.addresses = (src == ETH_TOKEN_ADDRESS) ?
            new IKyberReserve[](1) : reservesPerTokenSrc[address(src)];
        tradeData.ethToToken.addresses = (dest == ETH_TOKEN_ADDRESS) ?
            new IKyberReserve[](1) :reservesPerTokenDest[address(dest)];

        tradeData.fees = fees;

        // PERM is treated as no hint, so we just return
        // relevant arrays will be initialised when storing data
        if (hint.length == 0 || hint.length == 4) return;

        uint start = printGas("start parsing hint", 0);
        if (src == ETH_TOKEN_ADDRESS) {
            (
                tradeData.ethToToken.tradeType,
                tradeData.ethToToken.addresses,
                tradeData.ethToToken.splitValuesBps
            ) = parseHintE2T(hint);
        } else if (dest == ETH_TOKEN_ADDRESS) {
            (
                tradeData.tokenToEth.tradeType,
                tradeData.tokenToEth.addresses,
                tradeData.tokenToEth.splitValuesBps
            ) = parseHintT2E(hint);
        } else {
            (
                tradeData.tokenToEth.tradeType,
                tradeData.tokenToEth.addresses,
                tradeData.tokenToEth.splitValuesBps,
                tradeData.ethToToken.tradeType,
                tradeData.ethToToken.addresses,
                tradeData.ethToToken.splitValuesBps
            ) = parseHintT2T(hint);
        }

        start = printGas("parsing hint done", start);

        // T2E: apply masking out logic if mask out
        if (tradeData.tokenToEth.tradeType == TradeType.MaskOut) {
            tradeData.tokenToEth.addresses = maskOutReserves(reservesPerTokenSrc[address(src)], tradeData.tokenToEth.addresses);
        // initialise relevant arrays if split
        } else if (tradeData.tokenToEth.tradeType == TradeType.Split) {
            tradeData.tokenToEth.rates = new uint[](tradeData.tokenToEth.addresses.length);
            tradeData.tokenToEth.isFeePaying = new bool[](tradeData.tokenToEth.addresses.length);
        }

        //E2T: apply masking out logic if mask out
        if (tradeData.ethToToken.tradeType == TradeType.MaskOut) {
            tradeData.ethToToken.addresses = maskOutReserves(reservesPerTokenDest[address(dest)], tradeData.ethToToken.addresses);
        // initialise relevant arrays if split
        } else if (tradeData.ethToToken.tradeType == TradeType.Split) {
            tradeData.ethToToken.rates = new uint[](tradeData.ethToToken.addresses.length);
            tradeData.ethToToken.isFeePaying = new bool[](tradeData.ethToToken.addresses.length);
        }
        // require(failingIndex > 0);
    }

    function maskOutReserves(IKyberReserve[] memory allReservesPerToken, IKyberReserve[] memory maskedOutReserves)
        internal pure returns (IKyberReserve[] memory filteredReserves)
    {
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
    }

    function calcRatesAndAmountsTokenToEth(IERC20 src, uint srcAmount, TradeData memory tradeData) internal view {
        IKyberReserve reserve;
        bool isFeePaying;
        uint rate;

        // token to Eth
        ///////////////
        // if split reserves, find rates
        // can consider parsing enum hint type into tradeData for easy identification of splitHint. Or maybe just boolean flag
        if (tradeData.tokenToEth.splitValuesBps.length > 1) {
            (tradeData.tradeWei, tradeData.feePayingReservesBps, tradeData.numFeePayingReserves) = getDestQtyAndFeeDataFromSplits(tradeData.tokenToEth, src, srcAmount, true);
        } else {
            // else find best rate
            (reserve, rate, isFeePaying) = searchBestRate(
                tradeData.tokenToEth.addresses,
                src,
                ETH_TOKEN_ADDRESS,
                srcAmount,
                tradeData.fees[uint(FeesIndex.takerFeeBps)]
            );
            //save into tradeData
            storeTradeReserveData(tradeData.tokenToEth, reserve, rate, isFeePaying);
            tradeData.tradeWei = calcDstQty(srcAmount, tradeData.tokenToEth.decimals, ETH_DECIMALS, rate);

            //account for fees
            if (isFeePaying) {
                tradeData.feePayingReservesBps = BPS; //max percentage amount for token -> ETH
                tradeData.numFeePayingReserves ++;
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
                    numFeePayingReserves ++;
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

    function packResults(TradeData memory tradeData) internal view returns (
        uint[] memory results,
        IKyberReserve[] memory reserveAddresses,
        uint[] memory rates,
        uint[] memory splitValuesBps,
        bool[] memory isFeePaying
        )
    {
        uint start = printGas("pack result Start", 0);
        uint tokenToEthNumReserves = tradeData.tokenToEth.addresses.length;
        uint totalNumReserves = tokenToEthNumReserves + tradeData.ethToToken.addresses.length;
        reserveAddresses = new IKyberReserve[](totalNumReserves);
        rates = new uint[](totalNumReserves);
        splitValuesBps = new uint[](totalNumReserves);
        isFeePaying = new bool[](totalNumReserves);

        results = new uint[](uint(ResultIndex.resultLength));
        results[uint(ResultIndex.t2eNumReserves)] = tokenToEthNumReserves;
        results[uint(ResultIndex.e2tNumReserves)] = tradeData.ethToToken.addresses.length;
        results[uint(ResultIndex.tradeWei)] = tradeData.tradeWei;
        results[uint(ResultIndex.networkFeeWei)] = tradeData.networkFeeWei;
        results[uint(ResultIndex.platformFeeWei)] = tradeData.platformFeeWei;
        results[uint(ResultIndex.numFeePayingReserves)] = tradeData.numFeePayingReserves;
        results[uint(ResultIndex.feePayingReservesBps)] = tradeData.feePayingReservesBps;
        results[uint(ResultIndex.destAmountNoFee)] = tradeData.destAmountNoFee;
        results[uint(ResultIndex.actualDestAmount)] = tradeData.actualDestAmount;
        results[uint(ResultIndex.destAmountWithNetworkFee)] = tradeData.destAmountWithNetworkFee;

        //store token to ETH information
        for (uint i=0; i < tokenToEthNumReserves; i++) {
            reserveAddresses[i] = tradeData.tokenToEth.addresses[i];
            rates[i] = tradeData.tokenToEth.rates[i];
            splitValuesBps[i] = tradeData.tokenToEth.splitValuesBps[i];
            isFeePaying[i] = tradeData.tokenToEth.isFeePaying[i];
        }
        
        //then store ETH to token information, but need to offset when accessing tradeData
        for (uint i = tokenToEthNumReserves; i < totalNumReserves; i++) {
            reserveAddresses[i] = tradeData.ethToToken.addresses[i - tokenToEthNumReserves];
            rates[i] = tradeData.ethToToken.rates[i - tokenToEthNumReserves];
            splitValuesBps[i] = tradeData.ethToToken.splitValuesBps[i - tokenToEthNumReserves];
            isFeePaying[i] = tradeData.ethToToken.isFeePaying[i - tokenToEthNumReserves];
        }
        printGas("pack result end", start);
    }
    
    function calcRatesAndAmountsEthToToken(IERC20 dest, uint actualTradeWei, TradeData memory tradeData) internal view {
        IKyberReserve reserve;
        uint rate;
        bool isFeePaying;
        
        // Eth to token
        ///////////////
        // if hinted reserves, find rates and save.
        if (tradeData.ethToToken.splitValuesBps.length > 1) {
            (tradeData.actualDestAmount, , ) = getDestQtyAndFeeDataFromSplits(tradeData.ethToToken, dest, actualTradeWei, false);
            //calculate actual rate
            rate = calcRateFromQty(actualTradeWei, tradeData.actualDestAmount, ETH_DECIMALS, tradeData.ethToToken.decimals);
        } else {
            //network fee for ETH -> token is in ETH amount
            uint ethToTokenNetworkFeeWei = tradeData.tradeWei * tradeData.fees[uint(FeesIndex.takerFeeBps)] / BPS;
            // search best reserve and its corresponding dest amount
            // Have to search with tradeWei minus fees, because that is the actual src amount for ETH -> token trade
            (reserve, rate, isFeePaying) = searchBestRate(
                tradeData.ethToToken.addresses,
                ETH_TOKEN_ADDRESS,
                dest,
                actualTradeWei,
                ethToTokenNetworkFeeWei
            );

            //save into tradeData
            storeTradeReserveData(tradeData.ethToToken, reserve, rate, isFeePaying);

            // add to feePayingReservesBps if reserve is fee paying
            if (isFeePaying) {
                tradeData.networkFeeWei += ethToTokenNetworkFeeWei;
                tradeData.feePayingReservesBps += BPS; //max percentage amount for ETH -> token
                tradeData.numFeePayingReserves ++;
            }

            //take into account possible additional networkFee
            require(tradeData.tradeWei >= tradeData.networkFeeWei + tradeData.platformFeeWei, "fees exceed trade amt");
            tradeData.actualDestAmount = calcDstQty(tradeData.tradeWei - tradeData.networkFeeWei - tradeData.platformFeeWei, ETH_DECIMALS, tradeData.ethToToken.decimals, rate);
        }

        //finally, in both cases, we calculate destAmountWithNetworkFee and destAmountNoFee
        tradeData.destAmountWithNetworkFee = calcDstQty(tradeData.tradeWei - tradeData.networkFeeWei, ETH_DECIMALS, tradeData.ethToToken.decimals, rate);
        tradeData.destAmountNoFee = calcDstQty(tradeData.tradeWei, ETH_DECIMALS, tradeData.ethToToken.decimals, rate);
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
        internal
        view
        returns(IKyberReserve reserve, uint, bool isFeePaying)
    {
        //use destAmounts for comparison, but return the best rate
        BestReserveInfo memory bestReserve;
        uint numRelevantReserves = 1; // assume always best reserve will be relevant

        //return 1:1 for ether to ether
        if (src == dest) return (IKyberReserve(0), PRECISION, false);
        //return zero rate for empty reserve array (unlisted token)
        if (reserveArr.length == 0) return (IKyberReserve(0), 0, false);

        uint[] memory rates = new uint[](reserveArr.length);
        uint[] memory reserveCandidates = new uint[](reserveArr.length);
        uint destAmount;
        uint srcAmountWithFee;

        for (uint i = 0; i < reserveArr.length; i++) {
            reserve = reserveArr[i];
            //get isFeePaying info
            isFeePaying = isFeePayingReserve[address(reserve)];
            //for ETH -> token paying reserve, takerFee is specified in amount
            if ((src == ETH_TOKEN_ADDRESS) && isFeePaying) {
                require(srcAmount > takerFee, "fee >= E2T tradeAmt");
                srcAmountWithFee = srcAmount - takerFee;
            } else {
                srcAmountWithFee = srcAmount;
            }
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

        if(bestReserve.destAmount == 0) return (reserveArr[bestReserve.index], 0, false);
        
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
