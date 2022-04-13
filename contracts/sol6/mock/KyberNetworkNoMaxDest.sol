pragma solidity 0.6.6;

import "../NimbleNetwork.sol";


/*
 * @title Nimble Network main contract that doesn't check max dest amount. so we can test it on proxy
 */
contract NimbleNetworkNoMaxDest is NimbleNetwork {
    constructor(address _admin, INimbleStorage _NimbleStorage)
        public
        NimbleNetwork(_admin, _NimbleStorage)
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
