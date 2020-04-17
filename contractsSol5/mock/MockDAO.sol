pragma solidity 0.5.11;

import "../IKyberDAO.sol";
import "../utils/Utils4.sol";
import "../IKyberFeeHandler.sol";


contract MockDAO is IKyberDAO, Utils4 {
    IKyberFeeHandler public feeHandler;
    uint256 public rewardInBPS;
    uint256 public rebateInBPS;
    uint256 public epoch;
    uint256 public expiryTimestamp;
    uint256 public feeBps;
    uint256 public epochPeriod = 160;
    uint256 public startTimestamp;
    uint256 data;
    mapping(uint256 => bool) public shouldBurnRewardEpoch;

    constructor(
        uint256 _rewardInBPS,
        uint256 _rebateInBPS,
        uint256 _epoch,
        uint256 _expiryTimestamp
    ) public {
        rewardInBPS = _rewardInBPS;
        rebateInBPS = _rebateInBPS;
        epoch = _epoch;
        expiryTimestamp = _expiryTimestamp;
        startTimestamp = now;
    }

    function getLatestNetworkFeeDataWithCache() external returns (uint256, uint256) {
        data++;
        return (feeBps, expiryTimestamp);
    }

    function getLatestBRRDataWithCache()
        external
        returns (
            uint256,
            uint256,
            uint256,
            uint256,
            uint256
        )
    {
        return (BPS - rewardInBPS - rebateInBPS, rewardInBPS, rebateInBPS, epoch, expiryTimestamp);
    }

    function claimReward(address, uint256) external {}

    function claimStakerReward(
        address staker,
        uint256 percentageInPrecision,
        uint256 forEpoch
    ) external returns (bool) {
        return feeHandler.claimStakerReward(staker, percentageInPrecision, forEpoch);
    }

    function handleWithdrawal(address staker, uint256 reduceAmount) external {
        staker;
        reduceAmount;
    }

    function vote(uint256 campaignID, uint256 option) external {
        // must implement so it can be deployed.
        campaignID;
        option;
    }

    function epochPeriodInSeconds() external view returns (uint256) {
        return epochPeriod;
    }

    function firstEpochStartTimestamp() external view returns (uint256) {
        return startTimestamp;
    }

    function getLatestNetworkFeeData() external view returns (uint256, uint256) {
        return (feeBps, expiryTimestamp);
    }

    function shouldBurnRewardForEpoch(uint256 epochNum) external view returns (bool) {
        if (shouldBurnRewardEpoch[epochNum]) return true;
        return false;
    }

    function advanceEpoch() public {
        epoch++;
        expiryTimestamp = now + epochPeriod;
    }

    function setFeeHandler(IKyberFeeHandler _handler) public {
        feeHandler = _handler;
    }

    function setShouldBurnRewardTrue(uint256 epochNum) public {
        shouldBurnRewardEpoch[epochNum] = true;
    }

    function setMockEpochAndExpiryTimestamp(uint256 _epoch, uint256 _expiryTimestamp) public {
        epoch = _epoch;
        expiryTimestamp = _expiryTimestamp;
    }

    function setMockBRR(uint256 _rewardInBPS, uint256 _rebateInBPS) public {
        rewardInBPS = _rewardInBPS;
        rebateInBPS = _rebateInBPS;
    }

    function setNetworkFeeBps(uint256 _feeBps) public {
        feeBps = _feeBps;
    }
}
