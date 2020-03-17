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

    function setNetworkFeeData(uint _networkFeeBps, uint _expiryBlock) public {
        updateNetworkFee(_expiryBlock, _networkFeeBps);
    }

    function getNetworkFeeData() public view returns(uint _networkFeeBps, uint _expiryBlock) {
        (_networkFeeBps, _expiryBlock) = readNetworkFeeData();
    }
}
