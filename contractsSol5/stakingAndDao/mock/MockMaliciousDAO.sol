pragma solidity 0.5.11;

import "../KyberDAO.sol";

contract MockMaliciousDAO is KyberDAO {

    constructor(
        uint _epochPeriod, uint _startBlock,
        address _staking, address _feeHandler, address _knc,
        uint _maxNumOptions, uint _minCampDuration,
        uint _defaultNetworkFeeBps, uint _defaultRewardBps, uint _defaultRebateBps,
        address _admin
    ) KyberDAO(
        _epochPeriod, _startBlock,
        _staking, _feeHandler, _knc,
        _defaultNetworkFeeBps, _defaultRewardBps, _defaultRebateBps,
        _admin
    ) public {
        MAX_CAMP_OPTIONS = _maxNumOptions;
        MIN_CAMP_DURATION_BLOCKS = _minCampDuration;
    }

    function setTotalEpochPoints(uint epoch, uint pts) public {
        totalEpochPoints[epoch] = pts;
    }
}
