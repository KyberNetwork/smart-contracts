pragma solidity 0.5.11;

import "./IERC20.sol";


/// @title Kyber Network interface
interface IKyberNetwork {
    
    enum HintType {
        MaskInHint,
        MaskOutHint,
        SplitHint
    }
    
    function maxGasPrice() external view returns(uint);
    function enabled() external view returns(bool);
    function info(bytes32 id) external view returns(uint);
    
    function getExpectedRate(IERC20 src, IERC20 dest, uint srcQty, uint platformFeeBps) external view
        returns (uint expectedRateNoFees, uint expectedRateNetworkFees, uint expectedRateAllFees, uint worstRateAllFees);

    function getExpectedRateWithHint(IERC20 src, IERC20 dest, uint srcQty, uint platformFeeBps, bytes calldata hint) 
        external view
        returns (uint expectedRateNoFees, uint expectedRateNetworkFees, uint expectedRateAllFees, uint worstRateAllFees);
    
    function getExpectedRateWithParsedHint(IERC20 src, IERC20 dest, uint srcQty, uint platformFeeBps, HintType E2THintType,
        uint[] calldata E2TReserveIds, uint[] calldata E2TSplitsBps, HintType T2EHintType, uint[] calldata T2EReserveIds,
        uint[] calldata T2ESplitsBps) 
        external view
        returns (uint expectedRateNoFees, uint expectedRateNetworkFees, uint expectedRateAllFees, uint worstRateAllFees);
    
    function tradeWithHint(address payable trader, IERC20 src, uint srcAmount, IERC20 dest, address payable destAddress,
        uint maxDestAmount, uint minConversionRate, address payable platformWallet, uint platformFeeBps, bytes calldata hint)
        external payable 
        returns(uint finalDestAmount, uint destAmountBeforeFee);
        
    function tradeWithParsedHint(address payable trader, IERC20 src, uint srcAmount, IERC20 dest, address payable destAddress,
        uint maxDestAmount, uint minConversionRate, address payable platformWallet, uint platformFeeBps, HintType E2THintType,
        uint[] calldata E2TReserveIds, uint[] calldata E2TSplitsBps, HintType T2EHintType, uint[] calldata T2EReserveIds,
        uint[] calldata T2ESplitsBps)
        external payable 
        returns(uint finalDestAmount, uint destAmountBeforeFee);
}