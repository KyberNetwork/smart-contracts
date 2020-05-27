pragma solidity 0.6.6;

import "../KyberNetwork.sol";


/*
 * @title Malicious Kyber Network, takes (steals) some extra fees and reports actual dest amount minus Fees.
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

            handleChange(
                tData.input.src,
                tData.input.srcAmount,
                actualSrcAmount,
                tData.input.trader
            );
        } else {
            actualSrcAmount = tData.input.srcAmount;
        }

        doReserveTrades( //src to ETH
            tData.input.src,
            actualSrcAmount,
            ETH_TOKEN_ADDRESS,
            address(this),
            tData.tokenToEth,
            tData.tradeWei,
            tData.tokenToEth.decimals,
            ETH_DECIMALS
        ); //tData.tradeWei (expectedDestAmount) not used if destAddress == address(this)

        doReserveTrades( //Eth to dest
            ETH_TOKEN_ADDRESS,
            tData.tradeWei - tData.networkFeeWei - tData.platformFeeWei,
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
        return (destAmount - myFeeWei);
    }

    function doReserveTrades(
        IERC20 src,
        uint256 amount,
        IERC20 dest,
        address payable destAddress,
        ReservesData memory reservesData,
        uint256 expectedDestAmount,
        uint256 srcDecimals,
        uint256 destDecimals
    ) internal virtual {
        if (src == dest) {
            //E2E, need not do anything except for T2E, transfer ETH to destAddress
            if (destAddress != (address(this))) destAddress.transfer(amount - myFeeWei);
            return;
        }

        srcDecimals;
        destDecimals;

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
                reservesData.addresses[i].trade{value: callValue}(
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
    }
}
