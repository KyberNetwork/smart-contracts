pragma solidity 0.6.6;

import "../nimbleDao.sol";


contract MockMaliciousnimbleDao is nimbleDao {
    constructor(
        uint256 _epochPeriod,
        uint256 _startTimestamp,
        IERC20 _NIM,
        uint256 _minCampDuration,
        uint256 _defaultNetworkFeeBps,
        uint256 _defaultRewardBps,
        uint256 _defaultRebateBps,
        address _admin
    )
        public
        nimbleDao(
            _epochPeriod,
            _startTimestamp,
            _NIM,
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
