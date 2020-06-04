pragma solidity 0.6.6;

import "../KyberDao.sol";


contract MockKyberDaoMoreGetters is KyberDao {
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
        KyberDao(
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
}
