pragma solidity 0.5.11;

import "../KyberNetwork.sol";


contract MockNetwork is KyberNetwork {

    constructor(address _admin) public KyberNetwork(_admin) 
        {}
    
    //over ride some functions to reduce contract size.
    function doReserveTrades(
        IERC20 src,
        uint amount,
        IERC20 dest,
        address payable destAddress,
        TradeData memory tradeData,
        uint expectedDestAmount
    )
        internal
        returns(bool)
    {
        src;
        amount;
        dest;
        destAddress;
        tradeData;
        expectedDestAmount;

        revert("must use real network");
        // return true;
    }

    function setTakerFeeData(uint _takerFeeBps, uint _expiryBlock) public {
        takerFeeData = encodeTakerFee(_expiryBlock, _takerFeeBps);
    }

    function getTakerFeeData() public view returns(uint _takerFeeBps, uint _expiryBlock) {
        (_takerFeeBps, _expiryBlock) = decodeTakerFee(takerFeeData);
    }
}
