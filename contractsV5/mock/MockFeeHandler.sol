pragma solidity 0.5.11;

import "../FeeHandler.sol";


contract MockFeeHandler is FeeHandler {

    constructor(address daoSetter, IKyberNetworkProxy _kyberNetworkProxy, address _kyberNetwork,
        IBurnableToken _knc, uint _burnBlockInterval) 
        public FeeHandler(daoSetter, _kyberNetworkProxy, _kyberNetwork, _knc, _burnBlockInterval)
        {}
    
    function setTotalValues(uint totalRebateWei, uint totalRewardWei) public {
        totalValues = encodeTotalValues(totalRewardWei, totalRebateWei);
    }
}

