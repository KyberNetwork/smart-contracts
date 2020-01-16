pragma  solidity 0.5.11;

import "./IKyberReserve.sol";
import "./IKyberHint.sol";


////////////////////////////////////////////////////////////////////////////////////////////////////////
/// @title Kyber Network main contract
interface IKyberTradeLogic {

    enum ResultIndex {
         tradeWei,
         networkFeeWei,
         platformFeeWei,
         rateWithNetworkFee,
         numFeePayingReserves,
         feePayingReservesBps,
         destAmountNoFee,
         actualDestAmount,
         destAmountWithNetworkFee,
         last
    }
    
    enum FeesIndex {
        takerFee,
        customFee
    }
    
    function addReserve(address reserve, uint reserveId, bool isFeePaying) external returns(bool);
    
    function listPairForReserve(address reserve, IERC20 token, bool ethToToken, bool tokenToEth, bool add)
        external returns(bool);
        
    function searchBestRate(IKyberReserve[] calldata reserveArr, IERC20 src, IERC20 dest, uint srcAmount, uint takerFee)
        external view returns(IKyberReserve reserve, uint, bool isPayingFees);
    
    // accumulate fee wei
    function calculateRatesAndAmounts(IERC20 src, IERC20 dest, uint srcAmount, uint[] calldata fees, bytes calldata hint)
        external view 
        returns(IKyberReserve[] memory t2eAddresses, uint[] memory t2eData, uint[] memory t2eIsFeePaying, 
            IKyberReserve[] memory e2tAddresses, uint[] memory e2tData, uint[] memory e2tIsFeePaying, uint[] memory results);
}
