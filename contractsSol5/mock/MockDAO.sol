pragma solidity 0.5.11;

import "../IKyberDAO.sol";
import "../utils/Utils4.sol";
import "../IKyberFeeHandler.sol";

contract MockDAO is IKyberDAO, Utils4 {

    IKyberFeeHandler public feeHandler;
    uint public rewardInBPS;
    uint public rebateInBPS;
    uint public epoch;
    uint public expiryBlockNumber;
    uint public feeBps;
    uint public epochPeriod = 10;
    uint public startBlock;
    uint data;
    mapping(uint => bool) public shouldBurnRewardEpoch;

    constructor(uint _rewardInBPS, uint _rebateInBPS, uint _epoch, uint _expiryBlockNumber) public {
        rewardInBPS = _rewardInBPS;
        rebateInBPS = _rebateInBPS;
        epoch = _epoch;
        expiryBlockNumber = _expiryBlockNumber;
        startBlock = block.number;

    }

    function setFeeHandler(IKyberFeeHandler _handler) public {
        feeHandler = _handler;
    }

    function setMockEpochAndExpiryBlock(uint _epoch, uint _expiryBlockNumber) public {
        epoch = _epoch;
        expiryBlockNumber = _expiryBlockNumber;
    }

    function setMockBRR(uint _rewardInBPS, uint _rebateInBPS) public {
        rewardInBPS = _rewardInBPS;
        rebateInBPS = _rebateInBPS;
    }

    function setNetworkFeeBps(uint _feeBps) public {
        feeBps = _feeBps;
    }

    function getLatestNetworkFeeData() external view returns(uint, uint) {
        return (feeBps, expiryBlockNumber);
    }

    function getLatestNetworkFeeDataWithCache() external returns(uint feeInBps, uint expiryBlock) {
        data++;
        return (feeBps, expiryBlock);
    }

    function getLatestBRRData() external returns(uint, uint, uint, uint, uint) {
        return (BPS - rewardInBPS - rebateInBPS, rewardInBPS, rebateInBPS, epoch, expiryBlockNumber);
    }

    function claimStakerReward(address staker, uint percentageInPrecision, uint forEpoch) 
        external returns(bool)
    {
        return feeHandler.claimStakerReward(staker, percentageInPrecision, forEpoch);
    }

    function EPOCH_PERIOD_BLOCKS() external view returns(uint) {
        return epochPeriod;
    }

    function FIRST_EPOCH_START_BLOCK() external view returns(uint) {
        return startBlock;
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
        expiryBlockNumber = block.number + epochPeriod;
    }
}
