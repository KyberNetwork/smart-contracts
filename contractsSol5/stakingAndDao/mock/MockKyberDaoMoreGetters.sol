pragma solidity 0.5.11;

import "../KyberDAO.sol";

contract MockKyberDaoMoreGetters is KyberDAO {

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

    function checkLatestBrrData(uint _rewardInBps, uint _rebateInBps, uint _burnInBps, uint _epoch, uint _expiryBlockNumber) public returns(bool) {
        (uint burn, uint reward, uint rebate, uint epoch, uint expiryBN) = getLatestBRRData();
        require(_rewardInBps == reward, "reward bps is wrong");
        require(_rebateInBps == rebate, "rebate bps is wrong");
        require(_burnInBps == burn, "burn bps is wrong");
        require(_epoch == epoch, "epoch is wrong");
        require(_expiryBlockNumber == expiryBN, "expiry block number is wrong");
    }

    function checkLatestNetworkFeeData(uint _networkFee, uint _expiryBlockNumber) public {
        (uint networkFee, uint expiryBlock) = getLatestNetworkFeeDataWithCache();
        require(networkFee == _networkFee, "network fee is wrong");
        require(expiryBlock == _expiryBlockNumber, "expiry block number is wrong");
    }
}
