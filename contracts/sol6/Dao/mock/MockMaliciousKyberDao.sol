pragma solidity 0.6.6;

import "../NimbleDao.sol";


contract MockMaliciousNimbleDao is NimbleDao {
    constructor(
        uint256 _epochPeriod,
        uint256 _startTimestamp,
        IERC20 _knc,
        uint256 _minCampDuration,
        uint256 _defaultNetworkFeeBps,
        uint256 _defaultRewardBps,
        uint256 _defaultRebateBps,
        address _admin
    )
        public
        NimbleDao(
            _epochPeriod,
            _startTimestamp,
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
