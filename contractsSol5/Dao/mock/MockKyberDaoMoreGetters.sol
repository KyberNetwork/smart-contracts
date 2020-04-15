pragma solidity 0.5.11;

import "../KyberDAO.sol";

contract MockKyberDaoMoreGetters is KyberDAO {

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
        MAX_CAMP_OPTIONS = _maxNumOptions;
        MIN_CAMP_DURATION_SECONDS = _minCampDuration;
    }

    function replaceStakingContract(address _staking) public {
        staking = IKyberStaking(_staking);
    }

    function setLatestNetworkFee(uint _fee) public {
        latestNetworkFeeResult = _fee;
    }

    function setLatestBrrData(uint _data) public {
        latestBrrResult = _data;
    }

    function getTotalPoints(uint epoch) public view returns(uint) {
        return totalEpochPoints[epoch];
    }

    function getNumberVotes(address staker, uint epoch) public view returns(uint) {
        return numberVotes[staker][epoch];
    }

    function checkLatestBrrData(uint _rewardInBps, uint _rebateInBps, uint _burnInBps, uint _epoch, uint _expiryTimestamp) public returns(bool) {
        (uint burn, uint reward, uint rebate, uint epoch, uint expiryTimestamp) = getLatestBRRDataWithCache();
        require(_rewardInBps == reward, "reward bps is wrong");
        require(_rebateInBps == rebate, "rebate bps is wrong");
        require(_burnInBps == burn, "burn bps is wrong");
        require(_epoch == epoch, "epoch is wrong");
        require(_expiryTimestamp == expiryTimestamp, "expiry timestamp is wrong");
    }

    function checkLatestNetworkFeeData(uint _networkFee, uint _expiryTimestamp) public {
        (uint networkFee, uint expiryTimestamp) = getLatestNetworkFeeDataWithCache();
        require(networkFee == _networkFee, "network fee is wrong");
        require(expiryTimestamp == _expiryTimestamp, "expiry timestamp is wrong");
    }
}
