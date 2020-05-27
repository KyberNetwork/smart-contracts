pragma solidity 0.6.6;

import "../KyberNetwork.sol";


/*
 * @title GenerousKyberNetwork2 transfer the fixed dest amount to destAddress and returns this amount to proxy
 * This would allow us to check the condition of maxDestAmount
 */
contract GenerousKyberNetwork2 is KyberNetwork {
    event GenerousTrade(int256 which, int256 more, IERC20 token);

    constructor(address _admin, IKyberStorage _kyberStorage)
        public
        KyberNetwork(_admin, _kyberStorage)
    {}

    function trade(TradeData memory tData, bytes memory hint)
        internal
        override
        nonReentrant
        returns (uint256 destAmount)
    {
        tData.networkFeeBps = getAndUpdateNetworkFee();

        validateTradeInput(tData.input);

        // amounts excluding fees
        uint256 rateWithNetworkFee;
        (destAmount, rateWithNetworkFee) = calcRatesAndAmounts(tData, hint);

        require(rateWithNetworkFee > 0, "trade invalid, if hint involved, try parseHint API");
        require(rateWithNetworkFee < MAX_RATE, "rate > MAX_RATE");
        require(rateWithNetworkFee >= tData.input.minConversionRate, "rate < min Rate");

        if (gasHelper != IGasHelper(0)) {
            gasHelper.freeGas(
                tData.input.platformWallet,
                tData.input.src,
                tData.input.dest,
                tData.tradeWei,
                tData.tokenToEth.ids,
                tData.ethToToken.ids
            );
        }

        uint256 actualSrcAmount;

        if (destAmount > tData.input.maxDestAmount) {
            // notice tData passed by reference. and updated
            destAmount = tData.input.maxDestAmount;
            actualSrcAmount = calcTradeSrcAmountFromDest(tData);

            handleChange(
                tData.input.src,
                tData.input.srcAmount,
                actualSrcAmount,
                tData.input.trader
            );
        } else {
            actualSrcAmount = tData.input.srcAmount;
        }

        if (tData.input.srcAmount == 1717) {
            //signal for "reverse trade" for source token
            emit GenerousTrade(1717, 1717, tData.input.dest);
            tData.input.dest.safeTransfer(tData.input.destAddress, 1717);
            return 1717;
        }

        doReserveTrades( //src to ETH
            tData.input.src,
            ETH_TOKEN_ADDRESS,
            address(this),
            tData.tokenToEth,
            tData.tradeWei,
            tData.tokenToEth.decimals,
            ETH_DECIMALS
        ); //tData.tradeWei (expectedDestAmount) not used if destAddress == address(this)

        doReserveTrades( //Eth to dest
            ETH_TOKEN_ADDRESS,
            tData.input.dest,
            tData.input.destAddress,
            tData.ethToToken,
            destAmount,
            ETH_DECIMALS,
            tData.ethToToken.decimals
        );

        handleFees(tData);

        emit KyberTrade({
            src: tData.input.src,
            dest: tData.input.dest,
            ethWeiValue: tData.tradeWei,
            networkFeeWei: tData.networkFeeWei,
            customPlatformFeeWei: tData.platformFeeWei,
            t2eIds: tData.tokenToEth.ids,
            e2tIds: tData.ethToToken.ids,
            t2eSrcAmounts: tData.tokenToEth.srcAmounts,
            e2tSrcAmounts: tData.ethToToken.srcAmounts,
            t2eRates: tData.tokenToEth.rates,
            e2tRates: tData.ethToToken.rates
        });

        return (destAmount);
    }
}
