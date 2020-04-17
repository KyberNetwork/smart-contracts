pragma solidity 0.5.11;

import "../KyberNetwork.sol";


/*
 * @title Kyber Network main contract, takes some fee and reports actual dest amount minus Fees.
 */
contract MaliciousKyberNetwork is KyberNetwork {
    uint256 public myFeeWei = 10;

    constructor(address _admin, IKyberStorage _kyberStorage)
        public
        KyberNetwork(_admin, _kyberStorage)
    {}

    function setMyFeeWei(uint256 fee) public {
        myFeeWei = fee;
    }

    /* solhint-disable function-max-lines */
    //  Most of the lines here are functions calls spread over multiple lines.
    //  We find this function readable enough
    /// @notice use token address ETH_TOKEN_ADDRESS for ether
    /// @dev trade api for kyber network.
    /// @param tData.input structure of trade inputs
    function trade(TradeData memory tData, bytes memory hint)
        internal
        nonReentrant
        returns (uint256 destAmount)
    {
        tData.networkFeeBps = getAndUpdateNetworkFee();

        require(verifyTradeInputValid(tData.input, tData.networkFeeBps), "invalid");

        // amounts excluding fees
        uint256 rateWithNetworkFee;
        (destAmount, rateWithNetworkFee) = calcRatesAndAmounts(tData, hint);

        require(rateWithNetworkFee > 0, "0 rate");
        require(rateWithNetworkFee < MAX_RATE, "rate > MAX_RATE");
        require(rateWithNetworkFee >= tData.input.minConversionRate, "rate < minConvRate");

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

            require(
                handleChange(
                    tData.input.src,
                    tData.input.srcAmount,
                    actualSrcAmount,
                    tData.input.trader
                )
            );
        } else {
            actualSrcAmount = tData.input.srcAmount;
        }

        require(
            doReserveTrades( //src to ETH
                tData.input.src,
                actualSrcAmount,
                ETH_TOKEN_ADDRESS,
                address(this),
                tData,
                tData.tradeWei
            )
        ); //tData.tradeWei (expectedDestAmount) not used if destAddress == address(this)

        require(
            doReserveTrades( //Eth to dest
                ETH_TOKEN_ADDRESS,
                tData.tradeWei - tData.networkFeeWei - tData.platformFeeWei,
                tData.input.dest,
                tData.input.destAddress,
                tData,
                destAmount
            )
        );
        require(handleFees(tData));
        emit KyberTrade({
            trader: tData.input.trader,
            src: tData.input.src,
            dest: tData.input.dest,
            srcAmount: actualSrcAmount,
            destAmount: destAmount,
            destAddress: tData.input.destAddress,
            ethWeiValue: tData.tradeWei,
            networkFeeWei: tData.networkFeeWei,
            customPlatformFeeWei: tData.platformFeeWei,
            t2eIds: tData.tokenToEth.ids,
            e2tIds: tData.ethToToken.ids,
            hint: hint
        });
        return (destAmount - myFeeWei);
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
        uint256 amount,
        IERC20 dest,
        address payable destAddress,
        TradeData memory tData,
        uint256 expectedDestAmount
    ) internal returns (bool) {
        if (src == dest) {
            //E2E, need not do anything except for T2E, transfer ETH to destAddress
            if (destAddress != (address(this))) destAddress.transfer(amount - myFeeWei);
            return true;
        }

        ReservesData memory reservesData = src == ETH_TOKEN_ADDRESS
            ? tData.ethToToken
            : tData.tokenToEth;
        uint256 callValue;
        uint256 srcAmountSoFar;

        for (uint256 i = 0; i < reservesData.addresses.length; i++) {
            uint256 splitAmount = i == (reservesData.splitsBps.length - 1)
                ? (amount - srcAmountSoFar)
                : (reservesData.splitsBps[i] * amount) / BPS;
            srcAmountSoFar += splitAmount;
            callValue = (src == ETH_TOKEN_ADDRESS) ? splitAmount : 0;

            // reserve sends tokens/eth to network. network sends it to destination
            require(
                reservesData.addresses[i].trade.value(callValue)(
                    src,
                    splitAmount,
                    dest,
                    address(this),
                    reservesData.rates[i],
                    true
                )
            );
        }

        if (destAddress != address(this)) {
            dest.safeTransfer(destAddress, (expectedDestAmount - myFeeWei));
        }

        return true;
    }
}
