pragma solidity 0.5.11;

import "../KyberDAO.sol";

contract MockMaliciousDAO is KyberDAO {

    constructor(
        uint _epochPeriod, uint _startTimestamp,
        address _staking, address _feeHandler, address _knc,
        uint _maxNumOptions, uint _minCampDuration,
        uint _defaultNetworkFeeBps, uint _defaultRewardBps, uint _defaultRebateBps,
        address _admin
    ) KyberDAO(
        _epochPeriod, _startTimestamp,
        _staking, _feeHandler, _knc,
        _defaultNetworkFeeBps, _defaultRewardBps, _defaultRebateBps,
        _admin
    ) public {
        MAX_CAMPAIGN_OPTIONS = _maxNumOptions;
        MIN_CAMPAIGN_DURATION_SECONDS = _minCampDuration;
    }

    function setTotalEpochPoints(uint epoch, uint pts) public {
        totalEpochPoints[epoch] = pts;
    }
}
