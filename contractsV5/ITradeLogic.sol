  
pragma  solidity 0.5.11;

import "./IKyberReserve.sol";


interface ITradeLogic {

    // enum for unit inputs to calcRatesAndAmounts
    enum CalcIn {
        srcAmount,
        takerFeeBps,
        platformFeeBps,
        t2eDecimals,
        e2tDecimals,
        size
    }

    // calc rates and amounts uint outputs. no dependent on reserve number.
    enum CalcOut {
        t2eNumReserves,
        e2tNumReserves,
        t2eTradeType,
        e2tTradeType,
        tradeWei,
        networkFeeWei,
        platformFeeWei,
        numFeePayingReserves,
        feePayingReservesTotalBps,
        destAmountNoFee,
        destAmountWithNetworkFee,
        actualDestAmount,
        size
    }

    function negligibleRateDiffBps() external view returns (uint);

    function setNegligbleRateDiffBps(uint _negligibleRateDiffBps) external returns (bool);

    function addReserve(address reserve, bytes8 reserveId, bool isFeePaying) external returns (bool);

    function removeReserve(address reserve) external returns (bytes8);

    function listPairForReserve(IKyberReserve reserve, IERC20 token, bool ethToToken, bool tokenToEth, bool add)
        external
        returns (bool);
    
    function calcRatesAndAmounts(IERC20 src, IERC20 dest, uint[] calldata calcInput, bytes calldata hint)
        external view returns (
            uint[] memory calcOut,
            IKyberReserve[] memory reserveAddresses,
            uint[] memory rates,
            uint[] memory splitValuesBps,
            bool[] memory isFeePaying
            // bytes8[] memory t2eResIds,
            // bytes8[] memory e2tResIds);
        );
    function getRatesForToken(IERC20 token, uint optionalBuyAmount, uint optionalSellAmount, uint takerFee) external view
        returns(IKyberReserve[] memory buyReserves, uint[] memory buyRates, 
        IKyberReserve[] memory sellReserves, uint[] memory sellRates);
}
