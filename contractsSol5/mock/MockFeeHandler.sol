pragma solidity 0.5.11;

import "../KyberFeeHandler.sol";


contract MockFeeHandler is KyberFeeHandler {

    constructor(address daoSetter, IKyberNetworkProxy _kyberNetworkProxy, address _kyberNetwork,
        IERC20 _knc, uint _burnBlockInterval, address _burnConfigSetter)
        public KyberFeeHandler(daoSetter, _kyberNetworkProxy, _kyberNetwork, _knc, _burnBlockInterval, _burnConfigSetter)
        {}

    function getSavedBRR() public view returns (uint rewardBps, uint rebateBps, uint expiryBlock, uint epoch)
    {
        (rewardBps, rebateBps, expiryBlock, epoch) = readBRRData();
    }
}
