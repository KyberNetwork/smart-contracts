  
pragma  solidity 0.5.11;

import "./IKyberReserve.sol";


interface IKyberTradeLogic {

    enum ResultIndex {
        t2eNumReserves,
        e2tNumReserves,
        tradeWei,
        networkFeeWei,
        platformFeeWei,
        rateWithNetworkFee,
        numFeePayingReserves,
        feePayingReservesBps,
        destAmountNoFee,
        actualDestAmount,
        destAmountWithNetworkFee,
        resultLength
    }
    
    enum FeesIndex {
        takerFee,
        customFee
    }

    function addReserve(address reserve, uint reserveId, bool isFeePaying) external returns (bool);

    function removeReserve(address reserve) external returns (bool);

    function listPairForReserve(IKyberReserve reserve, IERC20 token, bool ethToToken, bool tokenToEth, bool add)
        external returns (bool);
    
    function calcRatesAndAmounts(IERC20 src, IERC20 dest, uint srcAmount, uint[] calldata fees, bytes calldata hint)
        external view
        returns (uint[] memory results, IKyberReserve[] memory reserveAddresses, uint[] rates, uint[] splitValuesBps, bool[] isFeePaying);
}