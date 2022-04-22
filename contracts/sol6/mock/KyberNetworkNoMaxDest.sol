pragma solidity 0.6.6;

import "../nimbleNetwork.sol";


/*
 * @title nimble Network main contract that doesn't check max dest amount. so we can test it on proxy
 */
contract nimbleNetworkNoMaxDest is nimbleNetwork {
    constructor(address _admin, InimbleStorage _nimbleStorage)
        public
        nimbleNetwork(_admin, _nimbleStorage)
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
