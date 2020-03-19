pragma solidity 0.5.11;


import "../KyberNetwork.sol";


////////////////////////////////////////////////////////////////////////////////////////////////////////
/// @title GenerousKyberNetwork2 transfer the fixed dest amount to destAddress and returns this amount to proxy
// This would allow us to check the condition of maxDestAmount
contract GenerousKyberNetwork2 is KyberNetwork {

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

        if (tData.input.srcAmount == 1717) {
            //signal for "reverse trade" for source token
            emit GenerousTrade(1717, 1717, tData.input.dest);
            tData.input.dest.safeTransfer(tData.input.destAddress, 1717);
            return 1717;
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
