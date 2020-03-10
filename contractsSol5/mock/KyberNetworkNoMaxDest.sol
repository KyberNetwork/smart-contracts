pragma solidity 0.5.11;


import "../KyberNetwork.sol";


////////////////////////////////////////////////////////////////////////////////////////////////////////
/// @title Kyber Network main contract that doesn't check max dest amount. so we can test it on proxy
contract KyberNetworkNoMaxDest is KyberNetwork {

    constructor(address _admin) public KyberNetwork(_admin) { }

    function calcTradeSrcAmountFromDest(TradeData memory tData)
        internal pure returns(uint actualSrcAmount)
    {
        actualSrcAmount = tData.input.srcAmount;
    }
}
