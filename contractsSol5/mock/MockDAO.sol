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

    constructor(uint _rewardInBPS, uint _rebateInBPS, uint _epoch, uint _expiryTimestamp) public {
        rewardInBPS = _rewardInBPS;
        rebateInBPS = _rebateInBPS;
        epoch = _epoch;
        expiryTimestamp = _expiryTimestamp;
        startTimestamp = now;
    }

    function setFeeHandler(IKyberFeeHandler _handler) public {
        feeHandler = _handler;
    }

    function setMockEpochAndExpiryBlock(uint _epoch, uint _expiryTimestamp) public {
        epoch = _epoch;
        expiryTimestamp = _expiryTimestamp;
    }

    function setMockBRR(uint _rewardInBPS, uint _rebateInBPS) public {
        rewardInBPS = _rewardInBPS;
        rebateInBPS = _rebateInBPS;
    }

    function setNetworkFeeBps(uint _feeBps) public {
        feeBps = _feeBps;
    }

    function getLatestNetworkFeeData() external view returns(uint, uint) {
        return (feeBps, expiryTimestamp);
    }

    function getLatestNetworkFeeDataWithCache() external returns(uint, uint) {
        data++;
        return (feeBps, expiryTimestamp);
    }

    function getLatestBRRData() external returns(uint, uint, uint, uint, uint) {
        return (BPS - rewardInBPS - rebateInBPS, rewardInBPS, rebateInBPS, epoch, expiryTimestamp);
    }

    function claimStakerReward(address staker, uint percentageInPrecision, uint forEpoch) 
        external returns(bool)
    {
        return feeHandler.claimStakerReward(staker, percentageInPrecision, forEpoch);
    }

    function EPOCH_PERIOD_SECONDS() external view returns(uint) {
        return epochPeriod;
    }

    function FIRST_EPOCH_START_TIMESTAMP() external view returns(uint) {
        return startTimestamp;
    }

    function handleWithdrawal(address staker, uint reduceAmount) external returns(bool) {
        staker;
        reduceAmount;
        return true;
    }

    function shouldBurnRewardForEpoch(uint epochNum) external view returns(bool) {
        if (shouldBurnRewardEpoch[epochNum]) return true;
        return false;
    }

    function setShouldBurnRewardTrue(uint epochNum) public {
        shouldBurnRewardEpoch[epochNum] = true;
    }

    function advanceEpoch() public {
        epoch++;
        expiryTimestamp = now + epochPeriod;
    }

    function vote(uint campID, uint option) external {
        // must implement so it can be deployed.
        campID;
        option;
    }
}
