pragma  solidity 0.5.11;

import "./PermissionGroupsV5.sol";
import "./UtilsV5.sol";
import "./IKyberReserve.sol";
import "./IKyberHint.sol";
import "./IKyberTradeLogic.sol";


////////////////////////////////////////////////////////////////////////////////////////////////////////
/// @title Kyber Network main contract
contract KyberTradelogic is IKyberTradeLogic, PermissionGroups, Utils {

    uint            public negligibleRateDiffBps = 10; // bps is 0.01%
   
    mapping(address=>uint) public reserveAddressToId;
    mapping(uint=>address[]) public reserveIdToAddresses;
    mapping(address=>bool) public isFeePayingReserve;
    mapping(address=>IKyberReserve[]) public reservesPerTokenSrc; //reserves support token to eth
    mapping(address=>IKyberReserve[]) public reservesPerTokenDest;//reserves support eth to token

    constructor(address _admin) public
        PermissionGroups(_admin)
    { /* empty body */ }

    function() external payable {
        revert();
    }
    
    // function addReserve(IKyberReserve reserve, uint reserveId, bool isFeePaying) external returns(bool);
    function addReserve(address reserve, uint reserveId, bool isFeePaying) external onlyOperator returns(bool) {
        require(reserveIdToAddresses[reserveId].length == 0);
        require(reserveAddressToId[reserve] == uint(0));
        
        reserveAddressToId[reserve] = reserveId;

        reserveIdToAddresses[reserveId][0] = reserve;
        isFeePayingReserve[reserve] = isFeePaying;

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
        require(reserveAddressToId[reserve] != uint(0));

        if (ethToToken) {
            listPairs(IKyberReserve(reserve), token, false, add);

            emit ListReservePairs(reserve, ETH_TOKEN_ADDRESS, token, add);
        }

        if (tokenToEth) {
            listPairs(IKyberReserve(reserve), token, true, add);

            emit ListReservePairs(reserve, token, ETH_TOKEN_ADDRESS, add);
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

    struct BestReserveInfo {
        uint index;
        uint destAmount;
    }

    /* solhint-disable code-complexity */
    // Regarding complexity. Below code follows the required algorithm for choosing a reserve.
    //  It has been tested, reviewed and found to be clear enough.
    //@dev this function always src or dest are ether. can't do token to token

    function searchBestRate(IKyberReserve[] memory reserveArr, IERC20 src, IERC20 dest, uint srcAmount, uint takerFee)
        public
        view
        returns(IKyberReserve reserve, uint, bool isPayingFees)
    {
        //use destAmounts for comparison, but return the best rate
        BestReserveInfo memory bestReserve;
        uint numRelevantReserves = 1; // assume always best reserve will be relevant

        //return 1 for ether to ether, or if empty reserve array is passed
        if (src == dest || reserveArr.length == 0) return (IKyberReserve(0), PRECISION, false);

        if (reserveArr.length == 0) return (IKyberReserve(0), 0, false);

        uint[] memory rates = new uint[](reserveArr.length);
        uint[] memory reserveCandidates = new uint[](reserveArr.length);
        uint destAmount;
        uint srcAmountWithFee;

        for (uint i = 0; i < reserveArr.length; i++) {
            reserve = reserveArr[i];
            //list all reserves that support this token.
            isPayingFees = isFeePayingReserve[address(reserve)];
            //for ETH -> token paying reserve, takerFee is specified in amount
            srcAmountWithFee = ((src == ETH_TOKEN_ADDRESS) && isPayingFees) ? srcAmount - takerFee : srcAmount;
            rates[i] = reserve.getConversionRate(
                src,
                dest,
                srcAmountWithFee,
                block.number);

            destAmount = srcAmountWithFee * rates[i] / PRECISION;
            //for token -> ETH paying reserve, takerFee is specified in bps
            destAmount = (dest == ETH_TOKEN_ADDRESS && isPayingFees) ? destAmount * (BPS - takerFee) / BPS : destAmount;

            if (destAmount > bestReserve.destAmount) {
                //best rate is highest rate
                bestReserve.destAmount = destAmount;
                bestReserve.index = i;
            }
        }

        if(bestReserve.destAmount == 0) return (IKyberReserve(0), 0, false);

        reserveCandidates[0] = bestReserve.index;

        // if this reserve pays fee its actual rate is less. so smallestRelevantRate is smaller.
        bestReserve.destAmount = bestReserve.destAmount * BPS / (10000 + negligibleRateDiffBps);

        for (uint i = 0; i < reserveArr.length; i++) {

            if (i == bestReserve.index) continue;

            isPayingFees = isFeePayingReserve[address(reserve)];
            srcAmountWithFee = ((src == ETH_TOKEN_ADDRESS) && isPayingFees) ? srcAmount - takerFee : srcAmount;
            destAmount = srcAmountWithFee * rates[i] / PRECISION;
            destAmount = (dest == ETH_TOKEN_ADDRESS && isPayingFees) ? destAmount * (BPS - takerFee) / BPS : destAmount;

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
        
        isPayingFees = isFeePayingReserve[address(reserveArr[bestReserve.index])];
        return (reserveArr[bestReserve.index], rates[bestReserve.index], isPayingFees);
    }

    uint constant rateMul = 1;
    
    struct TradingReserves {
        IKyberReserve[] addresses;
        uint[] data; // data will hold hint type in cell 0. next cells for rates for x reserve, then is fee paying x reserves
        bool[] isFeePaying;
        uint decimals;
    }

    // enable up to x reserves for token to Eth and x for eth to token
    // if not hinted reserves use 1 reserve for each trade side
    struct TradeData {

        TradingReserves t2e;
        TradingReserves e2t;
        uint [] results;
        uint [] fees;
        
        uint feePayingReservesBps;
    }

    // accumulate fee wei
    function findRatesAndAmounts(IERC20 src, IERC20 dest, uint srcAmount, uint[] calldata fees, bytes calldata hint)
        external view 
        returns(IKyberReserve[] memory t2eAddresses, uint[] memory t2eData, uint[] memory t2eIsFeePaying, 
            IKyberReserve[] memory e2tAddresses, uint[] memory e2tData, uint[] memory e2tIsFeePaying, uint[] memory results)
        // function should set all TradeData so it can later be used without any ambiguity
    {
        TradeData memory tradeData;
        
        parseTradeDataHint(src, dest, fees, tradeData, hint);

        // assume TradingReserves stores the reserves to be iterated over (meaning masking has been applied
        tradeData.results[uint(ResultIndex.tradeWei)] = findRatesAndAmountsTokenToEth(src, srcAmount, tradeData);

        //TODO: see if this need to be shifted below instead
        if (tradeData.results[uint(ResultIndex.tradeWei)] == 0) {
            tradeData.results[uint(ResultIndex.rateWithNetworkFee)] = 0;
            return(tradeData.t2e.addresses, tradeData.t2e.data, t2eIsFeePaying, tradeData.e2t.addresses, 
                tradeData.e2t.data, e2tIsFeePaying, tradeData.results);
        }   

        //if split reserves, add bps for ETH -> token
        if (tradeData.e2t.addresses.length > 1) {
            for (uint i = 0; i < tradeData.e2t.addresses.length; i++) {
                if (tradeData.e2t.data[i + 1 + (2 * tradeData.e2t.addresses.length)] == 1) {
                    tradeData.results[uint(ResultIndex.feePayingReservesBps)] += tradeData.e2t.data[ i + 1 + (2 * tradeData.e2t.addresses.length)];
                    tradeData.results[uint(ResultIndex.numFeePayingReserves)]++;
                }
            }
        }

        //fee deduction
        //no fee deduction occurs for masking of ETH -> token reserves, or if no ETH -> token reserve was specified
        tradeData.results[uint(ResultIndex.networkFeeWei)] = results[uint(ResultIndex.tradeWei)] * fees[uint(FeesIndex.takerFee)] * results[uint(ResultIndex.feePayingReservesBps)] / (BPS * BPS);
        tradeData.results[uint(ResultIndex.platformFeeWei)] = results[uint(ResultIndex.tradeWei)] * fees[uint(FeesIndex.customFee)] / BPS;

        //change to if condition instead
        require(tradeData.results[uint(ResultIndex.tradeWei)] >= (tradeData.results[uint(ResultIndex.networkFeeWei)] + tradeData.results[uint(ResultIndex.platformFeeWei)]),
            "fees exceed trade amount");
        
        findRatesAndAmountsEthToToken(
            dest,
            tradeData.results[uint(ResultIndex.tradeWei)],
            tradeData.results[uint(ResultIndex.tradeWei)] - tradeData.results[uint(ResultIndex.networkFeeWei)],
            tradeData.results[uint(ResultIndex.tradeWei)] - tradeData.results[uint(ResultIndex.networkFeeWei)] - tradeData.results[uint(ResultIndex.platformFeeWei)],
            tradeData
        );

        // calc final rate
        tradeData.results[uint(ResultIndex.rateWithNetworkFee)] = calcRateFromQty(srcAmount, tradeData.results[uint(ResultIndex.destAmountWithNetworkFee)], 
            tradeData.t2e.decimals, tradeData.e2t.decimals);
    }

    function findRatesAndAmountsTokenToEth(IERC20 src, uint srcAmount, TradeData memory tradeData) internal view 
        returns(uint tradeWeiAmount)
    {
        IKyberReserve reserve;
        uint splitAmount;
        uint srcAmountSoFar;

        // token to Eth
        ///////////////
        // if split reserves, find rates
        // can consider parsing enum hint type into tradeData for easy identification of splitHint. Or maybe just boolean flag
        if (tradeData.t2e.data[0] == uint(IKyberHint.HintType.Split)) {
            for (uint i = 0; i < tradeData.t2e.addresses.length; i++) {
                reserve = tradeData.t2e.addresses[i];
                //calculate split and corresponding trade amounts
                splitAmount = (i == tradeData.t2e.addresses.length - 1) ? (srcAmount - srcAmountSoFar) : 
                    tradeData.t2e.data[i + 1] * srcAmount / BPS;
                srcAmountSoFar += splitAmount;
                tradeData.t2e.data[i + 1 + tradeData.t2e.addresses.length] = reserve.getConversionRate(src, ETH_TOKEN_ADDRESS, splitAmount, block.number);
                tradeWeiAmount += calcDstQty(splitAmount, tradeData.t2e.decimals, ETH_DECIMALS, tradeData.t2e.data[i + 1 + tradeData.t2e.addresses.length]);

                //account for fees
                if (tradeData.t2e.isFeePaying[i]) {
                    tradeData.results[uint(ResultIndex.feePayingReservesBps)] += tradeData.t2e.data[i + 1];
                    tradeData.results[uint(ResultIndex.numFeePayingReserves)] ++;
                }
            }
        } else {
            // else find best rate
            (reserve, tradeData.t2e.data[2], tradeData.t2e.isFeePaying[0]) = searchBestRate(tradeData.t2e.addresses, src, ETH_TOKEN_ADDRESS, srcAmount, tradeData.fees[uint(FeesIndex.takerFee)]);
            // save into tradeData
            tradeData.t2e.addresses[0] = reserve;
            tradeWeiAmount = calcDstQty(srcAmount, tradeData.t2e.decimals, ETH_DECIMALS, tradeData.t2e.data[2]);
            tradeData.t2e.data[1] = BPS; //max percentage amount

            //account for fees
            if (tradeData.t2e.isFeePaying[0]) {
                tradeData.results[uint(ResultIndex.feePayingReservesBps)] += BPS; //max percentage amount for token -> ETH
                tradeData.results[uint(ResultIndex.numFeePayingReserves)] += 1;
            }
        }
    }

    function findRatesAndAmountsEthToToken(
        IERC20 dest,
        uint tradeWei,
        uint tradeWeiMinusNetworkFee,
        uint tradeWeiMinusNetworkCustomFees,
        TradeData memory tradeData
    )
        internal
        view
        returns (uint actualDestAmount, uint destAmountWithNetworkFee)
    {
        IKyberReserve reserve;
        uint amountSoFarNoFee;
        uint amountSoFarWithNetworkFee;
        uint amountSoFarWithNetworkAndCustomFee;
        uint splitAmount;

        // Eth to token
        ///////////////
        // if hinted reserves, find rates and save.
        if (tradeData.e2t.data[0] == uint(IKyberHint.HintType.Split)) {
            //reset amountSoFarNoFee
            amountSoFarNoFee = 0;

            for (uint i = 0; i < tradeData.e2t.addresses.length; i++) {
                reserve = tradeData.e2t.addresses[i];

                //calculate split amount without any fee
                splitAmount = (i == tradeData.e2t.addresses.length - 1) ? (tradeWei - amountSoFarNoFee) : 
                    tradeData.e2t.data[1 + i] * tradeWei / BPS;
                amountSoFarNoFee += splitAmount;
                
                //to save gas, we make just 1 conversion rate call with splitAmount
                tradeData.e2t.data[i + 1 + tradeData.e2t.addresses.length] = reserve.getConversionRate(ETH_TOKEN_ADDRESS, dest, splitAmount, block.number);
                //save rate data
                tradeData.results[uint(ResultIndex.destAmountNoFee)] += calcDstQty(splitAmount, ETH_DECIMALS, 
                    tradeData.e2t.decimals, tradeData.e2t.data[i + 1 + tradeData.e2t.addresses.length]);

                //calculate split amount with just network fee
                splitAmount = (i == tradeData.e2t.addresses.length - 1) ? (tradeWeiMinusNetworkFee - amountSoFarWithNetworkFee) : 
                    tradeData.e2t.data[i + 1] * tradeWeiMinusNetworkFee / BPS;
                amountSoFarWithNetworkFee += splitAmount;
                tradeData.results[uint(ResultIndex.destAmountWithNetworkFee)] += 
                    calcDstQty(splitAmount, ETH_DECIMALS, tradeData.e2t.decimals, tradeData.e2t.data[i + 1 + tradeData.e2t.addresses.length]);

                //calculate split amount with both network and custom platform fee
                splitAmount = (i == tradeData.e2t.addresses.length - 1) ?
                    (tradeWeiMinusNetworkCustomFees - amountSoFarWithNetworkAndCustomFee)
                    : tradeData.e2t.data[i + 1] * tradeWeiMinusNetworkCustomFees / BPS;
                amountSoFarWithNetworkAndCustomFee += splitAmount;
                tradeData.results[uint(ResultIndex.actualDestAmount)] = 
                    calcDstQty(splitAmount, ETH_DECIMALS, tradeData.e2t.decimals, tradeData.e2t.data[i + 1 + tradeData.e2t.addresses.length]);
            }
        } else {
            // else, search best reserve and its corresponding dest amount
            // Have to search with tradeWei minus fees, because that is the actual src amount for ETH -> token trade
            require(tradeWeiMinusNetworkCustomFees >= (tradeData.results[uint(ResultIndex.tradeWei)] * tradeData.fees[uint(FeesIndex.takerFee)] / BPS), "ETH->token network fee exceeds remaining trade wei amt");
            (tradeData.e2t.addresses[0], tradeData.e2t.data[2], tradeData.e2t.isFeePaying[0]) = searchBestRate(
                tradeData.e2t.addresses,
                ETH_TOKEN_ADDRESS,
                dest,
                tradeWeiMinusNetworkCustomFees,
                tradeData.results[uint(ResultIndex.tradeWei)] * tradeData.fees[uint(FeesIndex.takerFee)] / BPS
            );
            //store chosen reserve into tradeData
            tradeData.e2t.data[1] = BPS;
            tradeData.results[uint(ResultIndex.destAmountNoFee)] = calcDstQty(tradeWei, ETH_DECIMALS, tradeData.e2t.decimals, tradeData.e2t.data[1]);

            // add to feePayingReservesBps if reserve is fee paying
            if (tradeData.e2t.isFeePaying[0]) {
                tradeData.results[uint(ResultIndex.networkFeeWei)] += 
                    tradeData.results[uint(ResultIndex.tradeWei)] * tradeData.fees[uint(FeesIndex.takerFee)] / BPS;
                tradeData.results[uint(ResultIndex.feePayingReservesBps)] += BPS; //max percentage amount for ETH -> token
                tradeData.results[uint(ResultIndex.numFeePayingReserves)]++;
            }

            // calculate destAmountWithNetworkFee and actualDestAmount
            // not using tradeWeiMinusNetworkFee and tradeWeiMinusNetworkCustomFee
            // since network fee might have increased for fee paying ETH -> token reserve
            tradeData.results[uint(ResultIndex.destAmountWithNetworkFee)] = 
                calcDstQty(tradeData.results[uint(ResultIndex.tradeWei)] - tradeData.results[uint(ResultIndex.networkFeeWei)], ETH_DECIMALS, 
                    tradeData.e2t.decimals, tradeData.e2t.data[2]);
            tradeData.results[uint(ResultIndex.actualDestAmount)] = 
                calcDstQty(tradeData.results[uint(ResultIndex.tradeWei)] - tradeData.results[uint(ResultIndex.networkFeeWei)] - 
                    tradeData.results[uint(ResultIndex.platformFeeWei)], ETH_DECIMALS, tradeData.e2t.decimals, tradeData.e2t.data[2]);
        }
    }

    bytes constant PERM_HINT = "PERM"; //for backwards compatibility
    
    function parseTradeDataHint(IERC20 src, IERC20 dest, uint[]memory fees, TradeData memory tradeData, bytes memory hint) internal view {
        tradeData.fees = fees;
        tradeData.results = new uint[](uint(ResultIndex.last));
        
        tradeData.t2e.addresses = reservesPerTokenSrc[address(src)];
        tradeData.e2t.addresses = reservesPerTokenDest[address(dest)];
        
        tradeData.t2e.data = new uint[](2);
        tradeData.e2t.data = new uint[](2);
        
        tradeData.t2e.isFeePaying = new bool[](1);
        tradeData.e2t.isFeePaying = new bool[](1);

        //
        tradeData.t2e.data[0] = uint(IKyberHint.HintType.None);
        tradeData.e2t.data[0] = uint(IKyberHint.HintType.None);
        
        //PERM_HINT is treated as no hint, so we just return
        if (hint.length == 0 || keccak256(hint) == keccak256(PERM_HINT)) return;
    }
}
