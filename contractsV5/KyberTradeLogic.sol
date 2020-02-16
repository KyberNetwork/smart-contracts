pragma  solidity 0.5.11;

import "./PermissionGroupsV5.sol";
import "./IKyberReserve.sol";
import "./IKyberNetwork.sol";
import "./ITradeLogic.sol";
import "./KyberHintHandler.sol";


contract KyberTradeLogic is KyberHintHandler, ITradeLogic, PermissionGroups {
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
        uint[] splitValuesBps;
        // bytes8[] ids;

        // uint[] rates;
        // bool[] isFeePaying;
        // uint decimals;
    }

    // enable up to x reserves for token to Eth and x for eth to token
    // if not hinted reserves use 1 reserve for each trade side
    struct TradeData {
        // working arrays.
        uint[] calcIn;
        TradingReserves t2e;
        TradingReserves e2t;

        // all data below will be returned to network and reseve IDs from above
        uint[] calcOut;

        IKyberReserve[] resAddresses;
        uint[] rates;
        uint[] splitValuesBps;
        bool[] isFeePaying;
        
        //uint tradeWei;
        //uint networkFeeWei;
        //uint platformFeeWei;

        //uint[] fees;
        
        //uint numFeePayingReserves;
        //uint feePayingReservesBps; // what part of this trade is fee paying. for token to token - up to 200%
        
        //uint destAmountNoFee;
        //uint destAmountWithNetworkFee;
        //uint actualDestAmount; // all fees
    }

    function calcRatesAndAmounts(IERC20 src, IERC20 dest, uint[] calldata calcInput, bytes calldata hint)
        external view returns (
            uint[] memory calcOut,
            IKyberReserve[] memory reserveAddresses,
            uint[] memory rates,
            uint[] memory splitValuesBps,
            bool[] memory isFeePaying
            // bytes8[] memory t2eResIds,
            // bytes8[] memory e2tResIds)
        )
    {
        //initialisation
        TradeData memory tradeData;
        tradeData.calcIn = calcInput;
        tradeData.calcOut = new uint[](uint(CalcOut.size));

        parseTradeDataHint(src, dest, tradeData, hint);

        initResultArrays(tradeData);

        calcRatesAndAmountsTokenToEth(src, tradeData);

        //TODO: see if this need to be shifted below instead
        if (tradeData.calcOut[uint(CalcOut.tradeWei)] == 0) {
            //initialise ethToToken and store as zero
            // storeTradeReserveData(tradeData.e2t, IKyberReserve(0), 0, false);
            return(tradeData.calcOut, tradeData.resAddresses, tradeData.rates, tradeData.splitValuesBps,
                tradeData.isFeePaying);//, tradeData.t2e.ids, tradeData.e2t.ids);
        }

        uint startI = tradeData.calcOut[uint(CalcOut.t2eNumReserves)];

        //if split reserves, add bps for ETH -> token
        if (tradeData.e2t.splitValuesBps.length > 1) {
            for (uint i = 0; i < tradeData.e2t.addresses.length; i++) {
                //check if ETH->token split reserves are fee paying
                if (isFeePayingReserve[address(tradeData.e2t.addresses[i])]) {
                    tradeData.isFeePaying[i + startI] = true;
                    tradeData.calcOut[uint(CalcOut.feePayingReservesTotalBps)] += tradeData.e2t.splitValuesBps[i];
                    tradeData.calcOut[uint(CalcOut.numFeePayingReserves)] ++;
                }
            }
        }

        //fee deduction
        //no fee deduction occurs for masking of ETH -> token reserves, or if no ETH -> token reserve was specified
        tradeData.calcOut[uint(CalcOut.networkFeeWei)] = tradeData.calcOut[uint(CalcOut.tradeWei)] * 
            tradeData.calcIn[uint(CalcIn.takerFeeBps)] * tradeData.calcOut[uint(CalcOut.feePayingReservesTotalBps)] / (BPS * BPS);
        tradeData.calcOut[uint(CalcOut.platformFeeWei)] = tradeData.calcOut[uint(CalcOut.tradeWei)] * tradeData.calcIn[uint(CalcIn.platformFeeBps)] / BPS;

        require(tradeData.calcOut[uint(CalcOut.tradeWei)] >= 
            (tradeData.calcOut[uint(CalcOut.networkFeeWei)] + tradeData.calcOut[uint(CalcOut.platformFeeWei)]), "fees > trade qty");
        calcRatesAndAmountsEthToToken(
            dest, 
            tradeData.calcOut[uint(CalcOut.tradeWei)] - tradeData.calcOut[uint(CalcOut.networkFeeWei)] - tradeData.calcOut[uint(CalcOut.platformFeeWei)], 
            tradeData
            );

        return(tradeData.calcOut, tradeData.resAddresses, tradeData.rates, tradeData.splitValuesBps,
            tradeData.isFeePaying);//, tradeData.t2e.ids, tradeData.e2t.ids);
    }

    function initResultArrays(TradeData memory tradeData) internal view {
        uint numReserves = tradeData.calcOut[uint(CalcOut.t2eNumReserves)] + tradeData.calcOut[uint(CalcOut.e2tNumReserves)];

        // console.log("num reserves %d", numReserves);
        tradeData.resAddresses = new IKyberReserve[] (numReserves);
        tradeData.rates = new uint[](numReserves);
        tradeData.splitValuesBps = new uint[](numReserves);
        tradeData.isFeePaying = new bool[](numReserves);
    }

    function parseTradeDataHint(IERC20 src, IERC20 dest, TradeData memory tradeData, bytes memory hint) internal view {
        tradeData.t2e.addresses = (src == ETH_TOKEN_ADDRESS) ?
            new IKyberReserve[](1) : reservesPerTokenSrc[address(src)];
        tradeData.e2t.addresses = (dest == ETH_TOKEN_ADDRESS) ?
            new IKyberReserve[](1) :reservesPerTokenDest[address(dest)];

        // 'PERM' (old hint - v2) length 4 bytes, is treated as no hint, so we just return
        // relevant arrays will be initialised when storing data
        if (hint.length == 0 || hint.length == 4) return;
        
        //uint start = printGas("", 0, Module.LOGIC);
        if (src == ETH_TOKEN_ADDRESS) {
            (
                tradeData.e2t.tradeType,
                tradeData.e2t.addresses,
                tradeData.e2t.splitValuesBps
            ) = parseHintE2T(hint);
            tradeData.calcOut[uint(CalcOut.t2eNumReserves)] = 1;
            if (tradeData.e2t.tradeType == TradeType.Split) {
                tradeData.calcOut[uint(CalcOut.e2tNumReserves)] = tradeData.t2e.addresses.length;
            } else {
                tradeData.calcOut[uint(CalcOut.e2tNumReserves)] = 1;
            }
        } else if (dest == ETH_TOKEN_ADDRESS) {
            (
                tradeData.t2e.tradeType,
                tradeData.t2e.addresses,
                tradeData.t2e.splitValuesBps
            ) = parseHintT2E(hint);
            tradeData.calcOut[uint(CalcOut.e2tNumReserves)] = 1;
            if (tradeData.e2t.tradeType == TradeType.Split) {
                tradeData.calcOut[uint(CalcOut.t2eNumReserves)] = tradeData.e2t.addresses.length;
            } else {
                tradeData.calcOut[uint(CalcOut.t2eNumReserves)] = 1;
            }
        } else {
            (
                tradeData.t2e.tradeType,
                tradeData.t2e.addresses,
                tradeData.t2e.splitValuesBps,
                tradeData.e2t.tradeType,
                tradeData.e2t.addresses,
                tradeData.e2t.splitValuesBps
            ) = parseHintT2T(hint);
            if (tradeData.t2e.tradeType == TradeType.Split) {
                tradeData.calcOut[uint(CalcOut.t2eNumReserves)] = tradeData.t2e.addresses.length;
            } else {
                tradeData.calcOut[uint(CalcOut.t2eNumReserves)] = 1;
            }
            if (tradeData.e2t.tradeType == TradeType.Split) {
                tradeData.calcOut[uint(CalcOut.e2tNumReserves)] = tradeData.e2t.addresses.length;
            } else {
                tradeData.calcOut[uint(CalcOut.e2tNumReserves)] = 1;
            }
        }
        //start = printGas("parse hint", start, Module.LOGIC);

        // Apply masking out logic if mask out
        if (tradeData.t2e.tradeType == TradeType.MaskOut) {
            tradeData.t2e.addresses = maskOutReserves(reservesPerTokenSrc[address(src)], tradeData.t2e.addresses);
        }
        if (tradeData.e2t.tradeType == TradeType.MaskOut) {
            tradeData.e2t.addresses = maskOutReserves(reservesPerTokenDest[address(dest)], tradeData.e2t.addresses);
        }
    }

    function maskOutReserves(IKyberReserve[] memory allReservesPerToken, IKyberReserve[] memory maskedOutReserves)
        internal view returns (IKyberReserve[] memory filteredReserves)
    {
        //uint start = printGas("", 0, Module.LOGIC);
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
        //printGas("mask out algo", start, Module.LOGIC);
    }

    function calcRatesAndAmountsTokenToEth(IERC20 src, TradeData memory tradeData) internal view {
        // token to Eth
        ///////////////
        // if split reserves, find rates
        // can consider parsing enum hint type into tradeData for easy identification of splitHint. Or maybe just boolean flag
        if (tradeData.t2e.splitValuesBps.length > 1) {
            (tradeData.calcOut[uint(CalcOut.tradeWei)], 
             tradeData.calcOut[uint(CalcOut.feePayingReservesTotalBps)], 
             tradeData.calcOut[uint(CalcOut.numFeePayingReserves)]) = 
                getDestQtyAndFeeDataFromSplits(
                    tradeData.t2e,
                    src,
                    ETH_TOKEN_ADDRESS,
                    tradeData.calcIn[uint(CalcIn.t2eDecimals)],
                    ETH_DECIMALS,
                    tradeData.calcIn[uint(CalcIn.srcAmount)],
                    tradeData,                    
                    0);
        } else {
            // else find best rate
            (tradeData.resAddresses[0], tradeData.rates[0], tradeData.isFeePaying[0]) = searchBestRate(
                tradeData.t2e.addresses,
                src,
                ETH_TOKEN_ADDRESS,
                tradeData.calcIn[uint(CalcIn.srcAmount)],
                tradeData.calcIn[uint(CalcIn.takerFeeBps)]
            );
            //save into tradeData
            // storeTradeReserveData(tradeData.t2e, reserve, rate, isFeePaying);
            tradeData.calcOut[uint(CalcOut.tradeWei)] = 
                calcDstQty(tradeData.calcIn[uint(CalcIn.srcAmount)], tradeData.calcIn[uint(CalcIn.t2eDecimals)], ETH_DECIMALS, tradeData.rates[0]);

            //account for fees
            if (tradeData.isFeePaying[0]) {
                tradeData.calcOut[uint(CalcOut.feePayingReservesTotalBps)] = BPS; //max percentage amount for token -> ETH
                tradeData.calcOut[uint(CalcOut.numFeePayingReserves)] ++;
            }
        }
    }

    function getDestQtyAndFeeDataFromSplits(
        TradingReserves memory tradingReserves,
        IERC20 src,
        IERC20 dest,
        uint srcDecimals,
        uint destDecimals,
        uint tradeAmt,
        TradeData memory tradeData,
        uint startI
    )
        internal
        view
        returns (uint destQty, uint feePayingReservesBps, uint numFeePayingReserves)
    {
        // IKyberReserve reserve;
        uint splitAmount;
        uint amountSoFar;

        for (uint i = 0; i < tradingReserves.addresses.length; i++) {
            // reserve = tradingReserves.addresses[i];
            //calculate split and corresponding trade amounts
            splitAmount = (i == tradingReserves.splitValuesBps.length - 1) ? (tradeAmt - amountSoFar) : 
                tradingReserves.splitValuesBps[i] * tradeAmt / BPS;
            amountSoFar += splitAmount;

            tradeData.rates[startI + i] = tradingReserves.addresses[i].getConversionRate(src, dest, splitAmount, block.number);
            //if zero rate for any split reserve, return zero destQty
            if (tradeData.rates[startI + i] == 0) {
                return (0, 0, 0);
            }

            tradeData.splitValuesBps[startI + i] = tradingReserves.splitValuesBps[i];
            tradeData.resAddresses[startI + i] = tradingReserves.addresses[i];

            destQty += calcDstQty(splitAmount, srcDecimals, destDecimals, tradeData.rates[i + startI]);
            if (src != ETH_TOKEN_ADDRESS && isFeePayingReserve[address(tradingReserves.addresses[i])]) {
                tradeData.isFeePaying[startI + i] = true;
                tradeData.calcOut[uint(CalcOut.feePayingReservesTotalBps)] += tradingReserves.splitValuesBps[i];
                tradeData.calcOut[uint(CalcOut.numFeePayingReserves)] ++;
            }
        }
    }

    // function storeTradeReserveData(TradingReserves memory tradingReserves, IKyberReserve reserve, uint rate, bool isFeePaying) internal pure {
    //     //init arrays
    //     tradingReserves.addresses = new IKyberReserve[](1);
    //     tradingReserves.rates = new uint[](1);
    //     tradingReserves.splitValuesBps = new uint[](1);
    //     tradingReserves.isFeePaying = new bool[](1);

    //     //save information
    //     tradingReserves.addresses[0] = reserve;
    //     tradingReserves.rates[0] = rate;
    //     tradingReserves.splitValuesBps[0] = BPS; //max percentage amount
    //     tradingReserves.isFeePaying[0] = isFeePaying;
    // }

    // function packResults(TradeData memory tradeData) internal view returns (
    //     uint[] memory results,
    //     IKyberReserve[] memory reserveAddresses,
    //     uint[] memory rates,
    //     uint[] memory splitValuesBps,
    //     bool[] memory isFeePaying
    //     )
    // {
    //     //uint start = printGas("", 0, Module.LOGIC);
    //     uint tokenToEthNumReserves = tradeData.t2e.addresses.length;
    //     uint totalNumReserves = tokenToEthNumReserves + tradeData.e2t.addresses.length;
    //     reserveAddresses = new IKyberReserve[](totalNumReserves);
    //     rates = new uint[](totalNumReserves);
    //     splitValuesBps = new uint[](totalNumReserves);
    //     isFeePaying = new bool[](totalNumReserves);

    //     results = new uint[](uint(ResultIndex.resultLength));
    //     results[uint(ResultIndex.t2eNumReserves)] = tokenToEthNumReserves;
    //     results[uint(ResultIndex.e2tNumReserves)] = tradeData.e2t.addresses.length;
    //     results[uint(ResultIndex.tradeWei)] = tradeData.calcOut[uint(CalcOut.tradeWei)];
    //     results[uint(ResultIndex.networkFeeWei)] = tradeData.calcOut[uint(CalcOut.networkFeeWei)];
    //     results[uint(ResultIndex.platformFeeWei)] = tradeData.platformFeeWei;
    //     results[uint(ResultIndex.numFeePayingReserves)] = tradeData.numFeePayingReserves;
    //     results[uint(ResultIndex.feePayingReservesBps)] = tradeData.feePayingReservesBps;
    //     results[uint(ResultIndex.destAmountNoFee)] = tradeData.destAmountNoFee;
    //     results[uint(ResultIndex.actualDestAmount)] = tradeData.actualDestAmount;
    //     results[uint(ResultIndex.destAmountWithNetworkFee)] = tradeData.destAmountWithNetworkFee;

    //     //store token to ETH information
    //     for (uint i=0; i < tokenToEthNumReserves; i++) {
    //         reserveAddresses[i] = tradeData.t2e.addresses[i];
    //         rates[i] = tradeData.t2e.rates[i];
    //         splitValuesBps[i] = tradeData.t2e.splitValuesBps[i];
    //         isFeePaying[i] = tradeData.t2e.isFeePaying[i];
    //     }
        
    //     //then store ETH to token information, but need to offset when accessing tradeData
    //     for (uint i = tokenToEthNumReserves; i < totalNumReserves; i++) {
    //         reserveAddresses[i] = tradeData.e2t.addresses[i - tokenToEthNumReserves];
    //         rates[i] = tradeData.e2t.rates[i - tokenToEthNumReserves];
    //         splitValuesBps[i] = tradeData.e2t.splitValuesBps[i - tokenToEthNumReserves];
    //         isFeePaying[i] = tradeData.e2t.isFeePaying[i - tokenToEthNumReserves];
    //     }
    //     //printGas("pack result end", start, Module.LOGIC);
    // }
    
    function calcRatesAndAmountsEthToToken(IERC20 dest, uint actualTradeWei, TradeData memory tradeData) internal view {
        uint rate;
        
        // Eth to token
        ///////////////
        // if hinted reserves, find rates and save.
        if (tradeData.e2t.splitValuesBps.length > 1) {
            (tradeData.calcOut[uint(CalcOut.actualDestAmount)], , ) = 
                getDestQtyAndFeeDataFromSplits(
                    tradeData.e2t, 
                    ETH_TOKEN_ADDRESS, 
                    dest,
                    ETH_DECIMALS,
                    tradeData.calcIn[uint(CalcIn.e2tDecimals)],
                    actualTradeWei,
                    tradeData,                     
                    tradeData.calcOut[uint(CalcOut.t2eNumReserves)]);
            //calculate actual rate
            rate = calcRateFromQty(
                actualTradeWei, 
                tradeData.calcOut[uint(CalcOut.actualDestAmount)], 
                ETH_DECIMALS, 
                tradeData.calcIn[uint(CalcIn.e2tDecimals)]);
        } else {
            //network fee for ETH -> token is in ETH amount
            uint e2tNetworkFeeWei = tradeData.calcOut[uint(CalcOut.tradeWei)] * tradeData.calcIn[uint(CalcIn.takerFeeBps)] / BPS;
            // if(dest == ETH_TOKEN_ADDRESS) {
            //     tradeData.calcOut[uint(CalcOut.actualDestAmount)] = tradeData.calcOut[uint(CalcOut.tradeWei)];
            //     return;
            // }

            // search best reserve and its corresponding dest amount
            // Have to search with tradeWei minus fees, because that is the actual src amount for ETH -> token trade
            // console.log("num t2e res %d num e2t", tradeData.calcOut[uint(CalcOut.t2eNumReserves)], tradeData.calcOut[uint(CalcOut.e2tNumReserves)] );
            (tradeData.resAddresses[tradeData.calcOut[uint(CalcOut.t2eNumReserves)]],
             rate, 
             tradeData.isFeePaying[tradeData.calcOut[uint(CalcOut.t2eNumReserves)]]) = searchBestRate(
                tradeData.e2t.addresses,
                ETH_TOKEN_ADDRESS,
                dest,
                actualTradeWei,
                e2tNetworkFeeWei
            );

            tradeData.rates[tradeData.calcOut[uint(CalcOut.t2eNumReserves)]] = rate;
            //save into tradeData
            // storeTradeReserveData(tradeData.e2t, reserve, rate, isFeePaying);

            // add to feePayingReservesBps if reserve is fee paying
            if (tradeData.isFeePaying[tradeData.calcOut[uint(CalcOut.t2eNumReserves)]]) {
                tradeData.calcOut[uint(CalcOut.networkFeeWei)] += e2tNetworkFeeWei;
                tradeData.calcOut[uint(CalcOut.feePayingReservesTotalBps)] += BPS; //max percentage amount for ETH -> token
                tradeData.calcOut[uint(CalcOut.numFeePayingReserves)] ++;
            }

            //take into account possible additional networkFee
            // require(tradeData.calcOut[uint(CalcOut.tradeWei)] >= tradeData.calcOut[uint(CalcOut.networkFeeWei)] + tradeData.platformFeeWei, "fees > trade qty");
            tradeData.calcOut[uint(CalcOut.actualDestAmount)] = 
                calcDstQty(actualTradeWei, ETH_DECIMALS, tradeData.calcIn[uint(CalcIn.e2tDecimals)], rate);
        }

        //finally, in both cases, we calculate destAmountWithNetworkFee and destAmountNoFee
        tradeData.calcOut[uint(CalcOut.destAmountWithNetworkFee)] = 
            calcDstQty(tradeData.calcOut[uint(CalcOut.tradeWei)] - tradeData.calcOut[uint(CalcOut.networkFeeWei)], ETH_DECIMALS, 
            tradeData.calcIn[uint(CalcIn.e2tDecimals)], rate);
        tradeData.calcOut[uint(CalcOut.destAmountNoFee)] = 
            calcDstQty(tradeData.calcOut[uint(CalcOut.tradeWei)], ETH_DECIMALS, tradeData.calcIn[uint(CalcIn.e2tDecimals)], rate);
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
