pragma solidity 0.5.11;

import "../FeeHandler.sol";


contract MockFeeHandler is FeeHandler {

    constructor(address daoSetter, IKyberNetworkProxy _kyberNetworkProxy, address _kyberNetwork,
        IERC20 _knc, uint _burnBlockInterval) 
        public FeeHandler(daoSetter, _kyberNetworkProxy, _kyberNetwork, _knc, _burnBlockInterval)
        {}
    
    function getSavedBRR() public view returns (uint rewardBps, uint rebateBps, uint expiryBlock, uint epoch)
    {
        (rewardBps, rebateBps, expiryBlock, epoch) = decodeBRRData();
    }
}
