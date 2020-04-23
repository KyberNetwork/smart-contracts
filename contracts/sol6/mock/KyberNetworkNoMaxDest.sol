pragma solidity 0.6.6;

import "../KyberNetwork.sol";


/*
 * @title Kyber Network main contract that doesn't check max dest amount. so we can test it on proxy
 */
contract KyberNetworkNoMaxDest is KyberNetwork {
    constructor(address _admin, IKyberStorage _kyberStorage)
        public
        KyberNetwork(_admin, _kyberStorage)
    {}

    function calcTradeSrcAmountFromDest(TradeData memory tData)
        internal
        pure
        override
        returns (uint256 actualSrcAmount)
    {
        actualSrcAmount = tData.input.srcAmount;
    }
}
