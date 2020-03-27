pragma solidity 0.5.11;

import "../KyberMatchingEngine.sol";

/// @title Malicious Matching Engine 2: return a malicious reserve to steal funds from network
/// replace tradeWei with all eth balane from network
/// set network dest token balance as expected dest amount
/// return a reserve that won't transfer any funds back when network calls trade
/// result: all eth in network will be transferred to malicious reserve
///         all dest token in network will be transferred to trader
contract MaliciousMatchingEngine2 is KyberMatchingEngine {
    IKyberReserve public maliciousReserve;

    constructor(address _admin) public
        KyberMatchingEngine(_admin)
    { /* empty body */ }

    function updateMaliciousReserve(IKyberReserve _reserve) public {
        maliciousReserve = _reserve;
    }

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
        hint;
        //initialisation
        TradeData memory tData;
        tData.tokenToEth.decimals = srcDecimals;
        tData.ethToToken.decimals = destDecimals;
        tData.networkFeeBps = info[uint(IKyberMatchingEngine.InfoIndex.networkFeeBps)];

        // only support eth -> token trade for this attack
        if (src != ETH_TOKEN_ADDRESS) {
            storeTradeReserveData(tData.tokenToEth, IKyberReserve(0), 0, false);
            storeTradeReserveData(tData.ethToToken, IKyberReserve(0), 0, false);

            return packResults(tData);
        }

        // no token -> eth trade
        storeTradeReserveData(tData.tokenToEth, IKyberReserve(0), PRECISION, false);

        // try to get all eth balance from network
        tData.tradeWei = address(networkContract).balance;

        tData.networkFeeWei = 0;
        tData.platformFeeWei = tData.tradeWei * info[uint(IKyberMatchingEngine.InfoIndex.platformFeeBps)] / BPS;

        calcRatesAndAmountsEthToToken(dest, tData.tradeWei, tData);

        return packResults(tData);
    }

    function calcRatesAndAmountsEthToToken(IERC20 dest, uint actualTradeWei, TradeData memory tData) internal view {
        // try to get all dest token from network
        uint destAmount = dest.balanceOf(address(networkContract));
        uint rate = calcRateFromQty(actualTradeWei, destAmount, ETH_DECIMALS, tData.ethToToken.decimals);
        //save into tradeData
        storeTradeReserveData(tData.ethToToken, maliciousReserve, rate, false);

        tData.actualDestAmount = destAmount;

        tData.destAmountWithNetworkFee = calcDstQty(tData.tradeWei - tData.networkFeeWei, ETH_DECIMALS, 
            tData.ethToToken.decimals, rate);
        tData.destAmountNoFee = calcDstQty(tData.tradeWei, ETH_DECIMALS, tData.ethToToken.decimals, rate);
    }
}