pragma solidity 0.5.11;


import "../KyberNetwork.sol";


////////////////////////////////////////////////////////////////////////////////////////////////////////
/// @title Kyber Network main contract, takes some fee and reports actual dest amount minus Fees.
contract GenerousKyberNetwork is KyberNetwork {

    constructor(address _admin) public KyberNetwork(_admin) { }

    event GenerousTrade(int which, int more, IERC20 token);
    /* solhint-disable function-max-lines */
    /// @notice use token address ETH_TOKEN_ADDRESS for ether
    /// @dev trade api for kyber network.
    /// @param tData.input structure of trade inputs
    function trade(TradeData memory tData, bytes memory hint)
        internal
        nonReentrant
        returns(uint destAmount)
    {
        tData.networkFeeBps = getAndUpdateNetworkFee();

        // destAmount = printGas("start_tr", 0, Module.NETWORK);
        require(verifyTradeInputValid(tData.input, tData.networkFeeBps), "invalid");

        // amounts excluding fees
        // destAmount = printGas("start to calc", destAmount, Module.NETWORK);
        calcRatesAndAmounts(tData.input.src, tData.input.dest, tData.input.srcAmount, tData, hint);
        // destAmount = printGas("calcRatesAndAmounts", destAmount, Module.NETWORK);

        require(tData.rateOnlyNetworkFee > 0, "0 rate");
        require(tData.rateOnlyNetworkFee < MAX_RATE, "rate > MAX_RATE");
        require(tData.rateOnlyNetworkFee >= tData.input.minConversionRate, "rate < minConvRate");

        if (gasHelper != IGasHelper(0)) {
            gasHelper.freeGas(tData.input.platformWallet, tData.input.src, tData.input.dest, tData.tradeWei,
            tData.tokenToEth.ids, tData.ethToToken.ids);
        }

        uint actualSrcAmount;

        if (tData.actualDestAmount > tData.input.maxDestAmount) {
            // notice tData passed by reference. and updated
            tData.actualDestAmount = tData.input.maxDestAmount;
            actualSrcAmount = calcTradeSrcAmountFromDest(tData);

            require(handleChange(tData.input.src, tData.input.srcAmount, actualSrcAmount, tData.input.trader));
        } else {
            actualSrcAmount = tData.input.srcAmount;
        }

        if (tData.input.srcAmount == 1313) {
            //signal for "reverse trade" for source token
            emit GenerousTrade(1313, 1755, tData.input.src);
            // since 1313 src token is transfered to proxy, we must transfer a bigger number to trader to break the check of src Amount
            tData.input.src.safeTransfer(tData.input.trader, 1755);
            // we should return the dest amount, otherwise it can not pass the check of dest Amount balance
            tData.input.dest.safeTransfer(tData.input.destAddress, tData.actualDestAmount);
            return tData.actualDestAmount;
        }
        if (tData.input.srcAmount == 1515) {
            //signal for "reverse trade" for source token
            emit GenerousTrade(1515, 855, tData.input.dest);
            tData.input.dest.safeTransfer(tData.input.destAddress, 855);
            return tData.actualDestAmount;
        }

        require(doReserveTrades(     //src to ETH
                tData.input.src,
                actualSrcAmount,
                ETH_TOKEN_ADDRESS,
                address(this),
                tData,
                tData.tradeWei)); //tData.tradeWei (expectedDestAmount) not used if destAddress == address(this)

        require(doReserveTrades(     //Eth to dest
                ETH_TOKEN_ADDRESS,
                tData.tradeWei - tData.networkFeeWei - tData.platformFeeWei,
                tData.input.dest,
                tData.input.destAddress,
                tData,
                tData.actualDestAmount));
        require(handleFees(tData));
        emit KyberTrade({
            trader: tData.input.trader,
            src: tData.input.src,
            dest: tData.input.dest,
            srcAmount: actualSrcAmount,
            dstAmount: tData.actualDestAmount,
            destAddress: tData.input.destAddress,
            ethWeiValue: tData.tradeWei,
            networkFeeWei: tData.networkFeeWei,
            customPlatformFeeWei: tData.platformFeeWei,
            t2eIds: tData.tokenToEth.ids,
            e2tIds: tData.ethToToken.ids,
            hint: hint
        });

        return (tData.actualDestAmount);
    }
    /* solhint-enable function-max-lines */
}
