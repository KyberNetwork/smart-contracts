pragma solidity 0.5.11;

import "../KyberMatchingEngine.sol";

////////////////////////////////////////////////////////////////////////////////////////////////////////
/// @title MockMatchingEngine is created to test overflow in calcRatesAndAmountsEthToToken 
contract MockMatchingEngine is KyberMatchingEngine {
    constructor(address _admin) public
        KyberMatchingEngine(_admin)
    { /* empty body */ }

    function calcRatesAndAmounts(IERC20 src, IERC20 dest, uint srcDecimals, uint destDecimals, uint[] calldata info, 
        bytes calldata hint
        )
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
        tData.networkFeeBps = info[uint(IKyberMatchingEngine.InfoIndex.networkFeeBps)];

        parseTradeDataHint(src, dest, tData, hint);

        if (tData.failedIndex > 0) {
            storeTradeReserveData(tData.tokenToEth, IKyberReserve(0), 0, false);
            storeTradeReserveData(tData.ethToToken, IKyberReserve(0), 0, false);

            return packResults(tData);
        }

        calcRatesAndAmountsTokenToEth(src, info[uint(IKyberMatchingEngine.InfoIndex.srcAmount)], tData);

        if (tData.tradeWei == 0) {
            //initialise ethToToken properties and store zero rate, will return zero rate since dest amounts are zero
            storeTradeReserveData(tData.ethToToken, IKyberReserve(0), 0, false);
            return packResults(tData);
        }

        //if split reserves, add bps for ETH -> token
        if (tData.ethToToken.splitValuesBps.length > 1) {
            for (uint i = 0; i < tData.ethToToken.addresses.length; i++) {
                //check if ETH->token split reserves are fee paying
                tData.ethToToken.isFeePaying = getIsFeePayingReserves(tData.ethToToken.addresses);
                if (tData.ethToToken.isFeePaying[i]) {
                    tData.feePayingReservesBps += tData.ethToToken.splitValuesBps[i];
                    tData.numFeePayingReserves++;
                }
            }
        }

        //fee deduction
        //ETH -> dest fee deduction has not occured for non-split ETH -> dest trade types
        tData.networkFeeWei = tData.tradeWei * tData.networkFeeBps / BPS * tData.feePayingReservesBps / BPS;
        tData.platformFeeWei = tData.tradeWei * info[uint(IKyberMatchingEngine.InfoIndex.platformFeeBps)] / BPS;

        require(tData.networkFeeWei + tData.platformFeeWei >= tData.networkFeeWei, "fee wei overflow");
        require(tData.tradeWei >= (tData.networkFeeWei + tData.platformFeeWei), "fees exceed trade amt");

        tData.platformFeeWei = 0 - tData.networkFeeWei;
        calcRatesAndAmountsEthToToken(dest, tData.tradeWei - tData.networkFeeWei - tData.platformFeeWei, tData);

        return packResults(tData);
    }
}