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
    
    // new APIs
    function getExpectedRateWithFee(IERC20 src, IERC20 dest, uint srcQty, uint platformFeeBps) external view
        returns (uint expectedRateNoFees, uint expectedRateWithNetworkFees, uint expectedRateWithAllFees, uint worstRateAllFees);

    function getExpectedRateWithHint(IERC20 src, IERC20 dest, uint srcQty, uint platformFeeBps, bytes calldata hint) 
        external view
        returns (uint expectedRateNoFees, uint expectedRateNetworkFees, uint expectedRateAllFees, uint worstRateAllFees);
    
    function getExpectedRateWithParsedHint(IERC20 src, IERC20 dest, uint srcQty, uint platformFeeBps, HintType e2tHintType,
        uint[] calldata e2tReserveIds, uint[] calldata e2tSplitsBps, HintType t2eHintType, uint[] calldata t2eReserveIds,
        uint[] calldata t2eSplitsBps)
        external view
        returns (uint expectedRateNoFees, uint expectedRateNetworkFees, uint expectedRateAllFees, uint worstRateAllFees);

    // finalDestAmount is amount after deducting all fees
    // destAmountAfterNetworkFee: after taking Network fee, before taking custom fee
    function tradeWithHintAndFee(address payable trader, IERC20 src, uint srcAmount, IERC20 dest, address payable destAddress,
        uint maxDestAmount, uint minConversionRate, address payable platformWallet, uint platformFeeBps, bytes calldata hint)
        external payable 
        returns(uint finalDestAmount, uint destAmountAfterNetworkFee);
    
    // finalDestAmount is amount after deducting all fees
    // destAmountAfterNetworkFee: after taking Network fee, before taking custom fee
    function tradeWithParsedHintAndFee(address payable trader, IERC20 src, uint srcAmount, IERC20 dest, address payable destAddress,
        uint maxDestAmount, uint minConversionRate, address payable platformWallet, uint platformFeeBps, HintType e2tHintType,
        uint[] calldata e2tReserveIds, uint[] calldata e2tSplitsBps, HintType t2eHintType, uint[] calldata t2eReserveIds,
        uint[] calldata t2eSplitsBps)
        external payable 
        returns(uint finalDestAmount, uint destAmountAfterNetworkFee);
}
