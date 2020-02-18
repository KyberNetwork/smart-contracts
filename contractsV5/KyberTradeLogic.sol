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

        uint takerFeeBps;
        uint platformFeeBps;
        
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
        tData.takerFeeBps = info[uint(IKyberTradeLogic.InfoIndex.takerFeeBps)];
        tData.platformFeeBps = info[uint(IKyberTradeLogic.InfoIndex.platformFeeBps)];

        parseTradeDataHint(src, dest, tData, hint);

        calcRatesAndAmountsTokenToEth(src, info[uint(IKyberTradeLogic.InfoIndex.srcAmount)], tData);

        //TODO: see if this need to be shifted below instead
        if (tData.tradeWei == 0) {
            //initialise ethToToken and store as zero
            storeTradeReserveData(tData.ethToToken, IKyberReserve(0), 0, false);
            return packResults(tData);
        }

        //if split reserves, add bps for ETH -> token
        if (tData.ethToToken.splitValuesBps.length > 1) {
            for (uint i = 0; i < tData.ethToToken.addresses.length; i++) {
                //check if ETH->token split reserves are fee paying
                if (isFeePayingReserve[address(tData.ethToToken.addresses[i])]) {
                    tData.ethToToken.isFeePaying[i] = true;
                    tData.feePayingReservesBps += tData.ethToToken.splitValuesBps[i];
                    tData.numFeePayingReserves ++;
                }
            }
        }

        //fee deduction
        //no fee deduction occurs for masking of ETH -> token reserves, or if no ETH -> token reserve was specified
        tData.networkFeeWei = tData.tradeWei * tData.takerFeeBps * tData.feePayingReservesBps / (BPS * BPS);
        tData.platformFeeWei = tData.tradeWei * tData.platformFeeBps / BPS;

        require(tData.tradeWei >= (tData.networkFeeWei + tData.platformFeeWei), "fees exceed trade amt");
        calcRatesAndAmountsEthToToken(dest, tData.tradeWei - tData.networkFeeWei - tData.platformFeeWei, tData);

        return packResults(tData);
    }

    function parseTradeDataHint(IERC20 src, IERC20 dest, TradeData memory tData, bytes memory hint) internal view {
        
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
                tData.ethToToken.splitValuesBps
            ) = parseHintE2T(hint);
        } else if (dest == ETH_TOKEN_ADDRESS) {
            (
                tData.tokenToEth.tradeType,
                tData.tokenToEth.addresses,
                tData.tokenToEth.splitValuesBps
            ) = parseHintT2E(hint);
        } else {
            (
                tData.tokenToEth.tradeType,
                tData.tokenToEth.addresses,
                tData.tokenToEth.splitValuesBps,
                tData.ethToToken.tradeType,
                tData.ethToToken.addresses,
                tData.ethToToken.splitValuesBps
            ) = parseHintT2T(hint);
        }
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
        internal view returns (IKyberReserve[] memory filteredReserves)
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
        // can consider parsing enum hint type into tradeData for easy identification of splitHint. Or maybe just boolean flag
        if (tData.tokenToEth.splitValuesBps.length > 1) {
            (tData.tradeWei, tData.feePayingReservesBps, tData.numFeePayingReserves) = getDestQtyAndFeeDataFromSplits(tData.tokenToEth, src, srcAmount, true);
        } else {
            // else find best rate
            (reserve, rate, isFeePaying) = searchBestRate(
                tData.tokenToEth.addresses,
                src,
                ETH_TOKEN_ADDRESS,
                srcAmount,
                tData.takerFeeBps
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
                if (isFeePayingReserve[address(reserve)]) {
                    tradingReserves.isFeePaying[i] = true;
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
        results[uint(ResultIndex.e2tNumReserves)] = tData.ethToToken.addresses.length;
        results[uint(ResultIndex.tradeWei)] = tData.tradeWei;
        results[uint(ResultIndex.networkFeeWei)] = tData.networkFeeWei;
        results[uint(ResultIndex.platformFeeWei)] = tData.platformFeeWei;
        results[uint(ResultIndex.numFeePayingReserves)] = tData.numFeePayingReserves;
        results[uint(ResultIndex.feePayingReservesBps)] = tData.feePayingReservesBps;
        results[uint(ResultIndex.destAmountNoFee)] = tData.destAmountNoFee;
        results[uint(ResultIndex.actualDestAmount)] = tData.actualDestAmount;
        results[uint(ResultIndex.destAmountWithNetworkFee)] = tData.destAmountWithNetworkFee;

        //store token to ETH information
        for (uint i=0; i < tokenToEthNumReserves; i++) {
            reserveAddresses[i] = tData.tokenToEth.addresses[i];
            rates[i] = tData.tokenToEth.rates[i];
            splitValuesBps[i] = tData.tokenToEth.splitValuesBps[i];
            isFeePaying[i] = tData.tokenToEth.isFeePaying[i];
            ids[i] = convertAddressToReserveId(address(reserveAddresses[i]));
        }
        
        //then store ETH to token information, but need to offset when accessing tradeData
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
            uint ethToTokenNetworkFeeWei = tData.tradeWei * tData.takerFeeBps / BPS;
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
