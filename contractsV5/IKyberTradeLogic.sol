  
pragma  solidity 0.5.11;

import "./IKyberReserve.sol";


interface IKyberTradeLogic {

    enum ResultIndex {
        t2eNumReserves,
        e2tNumReserves,
        tradeWei,
        networkFeeWei,
        platformFeeWei,
        numFeePayingReserves,
        feePayingReservesBps,
        destAmountNoFee,
        actualDestAmount,
        destAmountWithNetworkFee,
        resultLength
    }
    
    enum FeesIndex {
        takerFeeBps,
        platformFeeBps,
        feesLength
    }

    function negligibleRateDiffBps() external view returns (uint);

    function setNegligbleRateDiffBps(uint _negligibleRateDiffBps) external returns (bool);

    function addReserve(address reserve, bytes8 reserveId, bool isFeePaying) external returns (bool);

    function removeReserve(address reserve) external returns (bytes8);

    function listPairForReserve(IKyberReserve reserve, IERC20 token, bool ethToToken, bool tokenToEth, bool add)
        external
        returns (bool);
    
    function calcRatesAndAmounts(IERC20 src, IERC20 dest, uint srcAmount, uint[] calldata fees, bytes calldata hint)
        external view
        returns (
            uint[] memory results,
            IKyberReserve[] memory reserveAddresses,
            uint[] memory rates,
            uint[] memory splitValuesBps,
            bool[] memory isFeePaying,
            bytes8[] memory t2eIds,
            bytes8[] memory e2tIds
        );

    function getRatesForToken(IERC20 token, uint optionalBuyAmount, uint optionalSellAmount, uint takerFee) external view
        returns(IKyberReserve[] memory buyReserves, uint[] memory buyRates, 
        IKyberReserve[] memory sellReserves, uint[] memory sellRates);
}
