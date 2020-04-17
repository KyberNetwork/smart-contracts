pragma solidity 0.5.11;

import "../KyberDAO.sol";


contract MockMaliciousDAO is KyberDAO {
    constructor(
        uint256 _epochPeriod,
        uint256 _startTimestamp,
        address _staking,
        address _feeHandler,
        address _knc,
        uint256 _minCampDuration,
        uint256 _defaultNetworkFeeBps,
        uint256 _defaultRewardBps,
        uint256 _defaultRebateBps,
        address _admin
    )
        public
        KyberDAO(
            _epochPeriod,
            _startTimestamp,
            _staking,
            _feeHandler,
            _knc,
            _defaultNetworkFeeBps,
            _defaultRewardBps,
            _defaultRebateBps,
            _admin
        )
    {
        minCampaignDurationInSeconds = _minCampDuration;
    }

    function setTotalEpochPoints(uint256 epoch, uint256 pts) public {
        totalEpochPoints[epoch] = pts;
    }
}
