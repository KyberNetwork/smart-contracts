pragma solidity 0.5.11;

import "../KyberNetworkRateHelper.sol";

contract MockNetworkRateHelper is KyberNetworkRateHelper {

    constructor(address _kyberNetwork) public KyberNetworkRateHelper(_kyberNetwork) { }

    enum ResultIndex {
        t2eNumReserves,
        tradeWei,
        numFeePayingReserves,
        feePayingReservesBps,
        destAmountNoFee,
        destAmountWithNetworkFee,
        actualDestAmount,
        resultLength
    }

    enum InfoIndex {
        srcAmount,
        networkFeeBps,
        platformFeeBps,
        infoLength
    }

    // struct for trade data.
    // list of reserve for token to Eth and for eth to token
    // if not a split trade, will have 1 reserve for each trade side
    struct TradeData {
        TradingReserves tokenToEth;
        TradingReserves ethToToken;

        uint tradeWei;
        uint networkFeeWei;
        uint platformFeeWei;

        uint networkFeeBps;
        uint platformFeeBps;

        uint srcAmount;
        uint numFeePayingReserves;
        uint feePayingReservesBps; // what part of this trade is fee paying. for token to token - up to 200%

        uint destAmountNoFee;
        uint destAmountWithNetworkFee;
        uint actualDestAmount; // all fees

        uint failedIndex; // index of error in hint
    }

    function calcRatesAndAmounts(IERC20 src, IERC20 dest, uint[] memory info, bytes memory hint
    ) public view returns (
            uint[] memory results,
            IKyberReserve[] memory reserveAddresses,
            uint[] memory rates,
            uint[] memory splitValuesBps,
            bool[] memory isFeePaying,
            bytes8[] memory ids)
    {
        //initialisation
        TradeData memory tData = initAndValidateTradeData(src, dest, info);

        calculateTradeWeiAndFeeData(src, dest, info[uint(InfoIndex.srcAmount)], hint, tData);

        if (tData.tradeWei == 0) {
            //initialise ethToToken properties and store zero rate, will return zero rate since dest amounts are zero
            storeTradeReserveData(tData.ethToToken, IKyberReserve(0), 0, false);
            return packResults(tData);
        }

        tData.networkFeeWei = tData.tradeWei * tData.networkFeeBps / BPS * tData.feePayingReservesBps / BPS;
        tData.platformFeeWei = tData.tradeWei * tData.platformFeeBps / BPS;

        require(tData.tradeWei >= (tData.networkFeeWei + tData.platformFeeWei), "fees exceed trade amt");

        calculateFinalDestAmountAndFeeData(src, dest, tData, hint);

        return packResults(tData);
    }

    // calculate data given token to eth trade data
    function calculateTradeWeiAndFeeData(IERC20 src, IERC20 dest, uint srcAmount, bytes memory hint, TradeData memory tData) internal view {
        if (src == ETH_TOKEN_ADDRESS) {
            tData.tradeWei = srcAmount;
            storeTradeReserveData(tData.tokenToEth, IKyberReserve(0), PRECISION, false);
            return;
        }

        bool isTokenToToken = (src != ETH_TOKEN_ADDRESS) && (dest != ETH_TOKEN_ADDRESS);

        (
            tData.tokenToEth.addresses,
            tData.tokenToEth.rates,
            tData.tokenToEth.splitValuesBps,
            tData.tokenToEth.isFeePaying,
            tData.tokenToEth.ids
        ) = calculateTradeData(
            src,
            srcAmount,
            tData.tokenToEth.decimals,
            true,
            isTokenToToken,
            tData.networkFeeBps,
            hint
        );

        uint destAmount;
        uint splitAmount;
        uint amountSoFar;

        for(uint i = 0; i < tData.tokenToEth.ids.length; i++) {
            splitAmount = (i == tData.tokenToEth.ids.length - 1) ? (tData.srcAmount - amountSoFar) :
                                tData.srcAmount * tData.tokenToEth.splitValuesBps[i] / BPS;
            amountSoFar += splitAmount;
            destAmount = calcDstQty(splitAmount, tData.tokenToEth.decimals, ETH_DECIMALS, tData.tokenToEth.rates[i]);
            tData.tradeWei += destAmount;
            if (tData.tokenToEth.isFeePaying[i]) {
                tData.feePayingReservesBps += tData.tokenToEth.splitValuesBps[i];
                tData.numFeePayingReserves++;
            }
        }
    }

    // calculate data given eth to token trade data
    function calculateFinalDestAmountAndFeeData(IERC20 src, IERC20 dest, TradeData memory tData, bytes memory hint) internal view {
        uint actualSrcWei = tData.tradeWei - tData.networkFeeWei - tData.platformFeeWei;
        bool isTokenToToken = (src != ETH_TOKEN_ADDRESS) && (dest != ETH_TOKEN_ADDRESS);

        if (dest == ETH_TOKEN_ADDRESS) {
            tData.actualDestAmount = actualSrcWei;
            tData.destAmountWithNetworkFee = tData.tradeWei - tData.networkFeeWei;
            tData.destAmountNoFee = tData.tradeWei;
            storeTradeReserveData(tData.ethToToken, IKyberReserve(0), PRECISION, false);
            return;
        }
        (
            tData.ethToToken.addresses,
            tData.ethToToken.rates,
            tData.ethToToken.splitValuesBps,
            tData.ethToToken.isFeePaying,
            tData.ethToToken.ids
        ) = calculateTradeData(
            dest,
            actualSrcWei,
            tData.ethToToken.decimals,
            false,
            isTokenToToken,
            tData.tradeWei * tData.networkFeeBps / BPS,
            hint
        );

        for(uint i = 0; i < tData.ethToToken.ids.length; i++) {
            if (tData.ethToToken.isFeePaying[i]) {
                tData.feePayingReservesBps += tData.ethToToken.splitValuesBps[i];
                tData.numFeePayingReserves++;
            }
        }
        tData.networkFeeWei = tData.tradeWei * tData.networkFeeBps / BPS * tData.feePayingReservesBps / BPS;
        require(tData.tradeWei >= (tData.networkFeeWei + tData.platformFeeWei), "fees exceed trade amt");

        actualSrcWei = tData.tradeWei - tData.networkFeeWei - tData.platformFeeWei;

        uint destAmount;
        uint splitAmount;
        uint amountSoFar;

        for(uint i = 0; i < tData.ethToToken.ids.length; i++) {
            splitAmount = (i == tData.ethToToken.ids.length - 1) ? (actualSrcWei - amountSoFar) :
                                actualSrcWei * tData.ethToToken.splitValuesBps[i] / BPS;
            amountSoFar += splitAmount;
            destAmount = calcDstQty(splitAmount, ETH_DECIMALS, tData.ethToToken.decimals, tData.ethToToken.rates[i]);
            tData.actualDestAmount += destAmount;
        }
        uint rate = calcRateFromQty(actualSrcWei, tData.actualDestAmount, ETH_DECIMALS, tData.ethToToken.decimals);
        tData.destAmountWithNetworkFee = calcDstQty(tData.tradeWei - tData.networkFeeWei, ETH_DECIMALS, 
            tData.ethToToken.decimals, rate);
        tData.destAmountNoFee = calcDstQty(tData.tradeWei, ETH_DECIMALS, tData.ethToToken.decimals, rate);
    }

    function initAndValidateTradeData(
        IERC20 src,
        IERC20 dest,
        uint[] memory info
    )
        internal view returns(TradeData memory tData)
    {
        tData.tokenToEth.decimals = getDecimals(src);
        tData.ethToToken.decimals = getDecimals(dest);
        tData.networkFeeBps = info[uint(InfoIndex.networkFeeBps)];
        tData.platformFeeBps = info[uint(InfoIndex.platformFeeBps)];
        tData.srcAmount = info[uint(InfoIndex.srcAmount)];
        require(tData.platformFeeBps < BPS, "platformFee high");
        require(tData.networkFeeBps < BPS / 2, "networkFee high");
        require(tData.platformFeeBps + tData.networkFeeBps * 2 < BPS, "fees high");
        return tData;
    }

    /// @notice Packs the results from tData into the return arguments for calcRatesAndAmounts
    function packResults(TradeData memory tData) internal pure returns (
        uint[] memory results,
        IKyberReserve[] memory reserveAddresses,
        uint[] memory rates,
        uint[] memory splitValuesBps,
        bool[] memory isFeePaying,
        bytes8[] memory ids
        )
    {
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
            ids[i] = tData.tokenToEth.ids[i];
        }

        // then store ETH to token information, but need to offset when accessing tradeData
        for (uint i = tokenToEthNumReserves; i < totalNumReserves; i++) {
            reserveAddresses[i] = tData.ethToToken.addresses[i - tokenToEthNumReserves];
            rates[i] = tData.ethToToken.rates[i - tokenToEthNumReserves];
            splitValuesBps[i] = tData.ethToToken.splitValuesBps[i - tokenToEthNumReserves];
            isFeePaying[i] = tData.ethToToken.isFeePaying[i - tokenToEthNumReserves];
            ids[i] = tData.ethToToken.ids[i - tokenToEthNumReserves];
        }
    }

    /// @notice Stores reserve and rate information, either from searchBestRate function,
    /// or null reserve and zero rate due to exceptions (Eg. tradeWei is zero, invalid hint)
    /// @dev Re-initialises the relevant array lengths, and stores the information
    function storeTradeReserveData(TradingReserves memory tradingReserves, IKyberReserve reserve, uint rate, 
        bool isFeePaying) 
        internal pure 
    {
        //init arrays
        tradingReserves.addresses = new IKyberReserve[](1);
        tradingReserves.rates = new uint[](1);
        tradingReserves.splitValuesBps = new uint[](1);
        tradingReserves.isFeePaying = new bool[](1);
        tradingReserves.ids = new bytes8[](1);

        //save information
        tradingReserves.addresses[0] = reserve;
        tradingReserves.rates[0] = rate;
        tradingReserves.splitValuesBps[0] = BPS; //max percentage amount
        tradingReserves.isFeePaying[0] = isFeePaying;
    }
}