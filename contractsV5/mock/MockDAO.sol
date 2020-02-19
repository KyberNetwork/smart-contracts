pragma solidity 0.5.11;

import "../IKyberDAO.sol";
import "../UtilsV5.sol";
import "../IFeeHandler.sol";

contract MockDAO is IKyberDAO, Utils {

    IFeeHandler public feeHandler;
    uint public rewardInBPS;
    uint public rebateInBPS;
    uint public epoch;
    uint public expiryBlockNumber;
    uint public feeBps;
    uint public epochPeriod = 200;
    uint public startBlock;
    uint data;

    constructor(uint _rewardInBPS, uint _rebateInBPS, uint _epoch, uint _expiryBlockNumber) public {
        rewardInBPS = _rewardInBPS;
        rebateInBPS = _rebateInBPS;
        epoch = _epoch;
        expiryBlockNumber = _expiryBlockNumber;
        startBlock = block.number;

    }

    function setFeeHandler(IFeeHandler _handler) public {
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

    function setTakerFeeBps(uint _feeBps) public {
        feeBps = _feeBps;
    }

    function getLatestNetworkFeeData() external view returns(uint, uint) {
        return (feeBps, expiryBlockNumber);
    }

    function getLatestNetworkFeeDataWithCache() external returns(uint feeInBps, uint expiryBlockNumber) {
        data++;
        return (feeBps, expiryBlockNumber);
    }

    function getLatestBRRData() external returns(uint, uint, uint, uint, uint) {
        return (BPS - rewardInBPS - rebateInBPS, rewardInBPS, rebateInBPS, epoch, expiryBlockNumber);
    }

    function claimStakerReward(address staker, uint percentageInPrecision, uint forEpoch) 
        external returns(bool) 
    {
        return feeHandler.claimStakerReward(staker, percentageInPrecision, forEpoch);
    }

    function EPOCH_PERIOD() external view returns(uint) {
        return epochPeriod;
    }

    function START_BLOCK() external view returns(uint) {
        return startBlock;
    }

    function handleWithdrawal(address staker, uint penaltyAmount) external returns(bool) {
        return true;
    }

    function shouldBurnRewardForEpoch(uint epoch) external view returns(bool) {
        return false;
    }
}
