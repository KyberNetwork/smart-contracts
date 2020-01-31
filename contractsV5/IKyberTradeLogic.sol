  
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

    function addReserve(address reserve, uint reserveId, bool isFeePaying) external returns (bool);

    function removeReserve(address reserve) external returns (uint);

    function listPairForReserve(IKyberReserve reserve, IERC20 token, bool ethToToken, bool tokenToEth, bool add)
        external returns (bool);
    
    function calcRatesAndAmounts(IERC20 src, IERC20 dest, uint srcAmount, uint[] calldata fees, bytes calldata hint)
        external view
        returns (uint[] memory results, IKyberReserve[] memory reserveAddresses, 
            uint[] memory rates, uint[] memory splitValuesBps, bool[] memory isFeePaying);
}