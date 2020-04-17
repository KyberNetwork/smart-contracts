pragma solidity 0.5.11;

import "../KyberDAO.sol";


contract MockKyberDaoMoreGetters is KyberDAO {
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

    function replaceStakingContract(address _staking) public {
        staking = IKyberStaking(_staking);
    }

    function setLatestNetworkFee(uint256 _fee) public {
        latestNetworkFeeResult = _fee;
    }

    function setLatestBrrData(uint256 reward, uint256 rebate) public {
        latestBrrData.rewardInBps = reward;
        latestBrrData.rebateInBps = rebate;
    }

    function latestBrrResult() public view returns (uint256) {
        return
            getDataFromRewardAndRebateWithValidation(
                latestBrrData.rewardInBps,
                latestBrrData.rebateInBps
            );
    }

    function getNumberVotes(address staker, uint256 epoch) public view returns (uint256) {
        return numberVotes[staker][epoch];
    }

    function campaignExists(uint256 campaignID) public view returns (bool) {
        return campaignData[campaignID].campaignExists;
    }

    function checkLatestBrrData(
        uint256 _rewardInBps,
        uint256 _rebateInBps,
        uint256 _burnInBps,
        uint256 _epoch,
        uint256 _expiryTimestamp
    ) public returns (bool) {
        (
            uint256 burn,
            uint256 reward,
            uint256 rebate,
            uint256 epoch,
            uint256 expiryTime
        ) = getLatestBRRDataWithCache();
        require(_rewardInBps == reward, "reward bps is wrong");
        require(_rebateInBps == rebate, "rebate bps is wrong");
        require(_burnInBps == burn, "burn bps is wrong");
        require(_epoch == epoch, "epoch is wrong");
        require(_expiryTimestamp == expiryTime, "expiry timestamp is wrong");
    }

    function checkLatestNetworkFeeData(uint256 _networkFee, uint256 _expiryTimestamp) public {
        (uint256 networkFee, uint256 expiryTime) = getLatestNetworkFeeDataWithCache();
        require(networkFee == _networkFee, "network fee is wrong");
        require(expiryTime == _expiryTimestamp, "expiry timestamp is wrong");
    }
}
