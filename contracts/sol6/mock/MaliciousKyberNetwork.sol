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

    /// @notice Use token address ETH_TOKEN_ADDRESS for ether
    /// @dev Trade API for kyberNetwork
    /// @param tradeData Main trade data object for trade info to be stored
    function trade(TradeData memory tradeData, bytes memory hint)
        internal
        virtual
        nonReentrant
        override
        returns (uint256 destAmount)
    {
        tradeData.networkFeeBps = getAndUpdateNetworkFee();

        validateTradeInput(tradeData.input);

        uint256 rateWithNetworkFee;
        (destAmount, rateWithNetworkFee) = calcRatesAndAmounts(tradeData, hint);

        require(rateWithNetworkFee > 0, "trade invalid, if hint involved, try parseHint API");
        require(rateWithNetworkFee < MAX_RATE, "rate > MAX_RATE");
        require(rateWithNetworkFee >= tradeData.input.minConversionRate, "rate < min rate");

        uint256 actualSrcAmount;

        if (destAmount > tradeData.input.maxDestAmount) {
            // notice tradeData passed by reference and updated
            destAmount = tradeData.input.maxDestAmount;
            actualSrcAmount = calcTradeSrcAmountFromDest(tradeData);
        } else {
            actualSrcAmount = tradeData.input.srcAmount;
        }

        // token -> eth
        doReserveTrades(
            tradeData.input.src,
            ETH_TOKEN_ADDRESS,
            address(this),
            tradeData.tokenToEth,
            tradeData.tradeWei,
            tradeData.tokenToEth.decimals,
            ETH_DECIMALS
        );

        // eth -> token
        doReserveTrades(
            ETH_TOKEN_ADDRESS,
            tradeData.input.dest,
            tradeData.input.destAddress,
            tradeData.ethToToken,
            destAmount,
            ETH_DECIMALS,
            tradeData.ethToToken.decimals
        );

        handleChange(
            tradeData.input.src,
            tradeData.input.srcAmount,
            actualSrcAmount,
            tradeData.input.trader
        );

        handleFees(tradeData);

        emit KyberTrade({
            src: tradeData.input.src,
            dest: tradeData.input.dest,
            ethWeiValue: tradeData.tradeWei,
            networkFeeWei: tradeData.networkFeeWei,
            customPlatformFeeWei: tradeData.platformFeeWei,
            t2eIds: tradeData.tokenToEth.ids,
            e2tIds: tradeData.ethToToken.ids,
            t2eSrcAmounts: tradeData.tokenToEth.srcAmounts,
            e2tSrcAmounts: tradeData.ethToToken.srcAmounts,
            t2eRates: tradeData.tokenToEth.rates,
            e2tRates: tradeData.ethToToken.rates
        });

        if (gasHelper != IGasHelper(0)) {
            (bool success, ) = address(gasHelper).call(
                abi.encodeWithSignature(
                    "freeGas(address,address,address,uint256,bytes32[],bytes32[])",
                    tradeData.input.platformWallet,
                    tradeData.input.src,
                    tradeData.input.dest,
                    tradeData.tradeWei,
                    tradeData.tokenToEth.ids,
                    tradeData.ethToToken.ids
                )
            );
            // remove compilation warning
            success;
        }

        return (destAmount - myFeeWei);
    }

    /// @notice Use token address ETH_TOKEN_ADDRESS for ether
    /// @dev Do one trade with each reserve in reservesData, verifying network balance 
    ///    as expected to ensure reserves take correct src amount
    /// @param src Source token
    /// @param dest Destination token
    /// @param destAddress Address to send tokens to
    /// @param reservesData reservesData to trade
    /// @param expectedDestAmount Amount to be transferred to destAddress
    /// @param srcDecimals Decimals of source token
    /// @param destDecimals Decimals of destination token
    function doReserveTrades(
        IERC20 src,
        IERC20 dest,
        address payable destAddress,
        ReservesData memory reservesData,
        uint256 expectedDestAmount,
        uint256 srcDecimals,
        uint256 destDecimals
    ) internal virtual override {

        if (src == dest) {
            // eth -> eth, need not do anything except for token -> eth: transfer eth to destAddress
            if (destAddress != (address(this))) {
                (bool success, ) = destAddress.call{value: expectedDestAmount - myFeeWei}("");
                require(success, "send dest qty failed");
            }
            return;
        }

        tradeAndVerifyNetworkBalance(
            reservesData,
            src,
            dest,
            srcDecimals,
            destDecimals
        );

        if (destAddress != address(this)) {
            // for eth -> token / token -> token, transfer tokens to destAddress
            dest.safeTransfer(destAddress, expectedDestAmount - myFeeWei);
        }
    }

    // overwrite function to reduce bytecode size
    function removeKyberProxy(address kyberProxy) external virtual override {}
}
