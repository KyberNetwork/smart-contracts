pragma solidity 0.5.11;

import "../IKyberDAO.sol";
import "../utils/Utils4.sol";
import "../IKyberFeeHandler.sol";


contract MockDAO is IKyberDAO, Utils4 {
    IKyberFeeHandler public feeHandler;
    uint public rewardInBPS;
    uint public rebateInBPS;
    uint public epoch;
    uint public expiryTimestamp;
    uint public feeBps;
    uint public epochPeriod = 160;
    uint public startTimestamp;
    uint data;
    mapping(uint => bool) public shouldBurnRewardEpoch;

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

    function setFeeHandler(IKyberFeeHandler _handler) public {
        feeHandler = _handler;
    }

    function setMockEpochAndExpiryTimestamp(
        uint256 _epoch,
        uint256 _expiryTimestamp
    ) public {
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

    function getLatestNetworkFeeData() external view returns(uint, uint) {
        return (feeBps, expiryTimestamp);
    }

    function getLatestNetworkFeeDataWithCache() external returns(uint, uint) {
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
        return (
            BPS - rewardInBPS - rebateInBPS,
            rewardInBPS,
            rebateInBPS,
            epoch,
            expiryTimestamp
        );
    }

    function claimStakerReward(
        address staker,
        uint256 percentageInPrecision,
        uint256 forEpoch
    ) external returns (bool) {
        return
            feeHandler.claimStakerReward(
                staker,
                percentageInPrecision,
                forEpoch
            );
    }

    function epochPeriodInSeconds() external view returns(uint) {
        return epochPeriod;
    }

    function firstEpochStartTimestamp() external view returns(uint) {
        return startTimestamp;
    }

    function handleWithdrawal(address staker, uint256 reduceAmount)
        external
    {
        staker;
        reduceAmount;
    }

    function shouldBurnRewardForEpoch(uint256 epochNum)
        external
        view
        returns (bool)
    {
        if (shouldBurnRewardEpoch[epochNum]) return true;
        return false;
    }

    function setShouldBurnRewardTrue(uint256 epochNum) public {
        shouldBurnRewardEpoch[epochNum] = true;
    }

    function advanceEpoch() public {
        epoch++;
        expiryTimestamp = now + epochPeriod;
    }

    function vote(uint campaignID, uint option) external {
        // must implement so it can be deployed.
        campaignID;
        option;
    }

    function claimReward(address, uint) external {}
}
