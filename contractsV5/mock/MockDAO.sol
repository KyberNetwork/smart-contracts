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
    uint feeBps;

    constructor(uint _rewardInBPS, uint _rebateInBPS, uint _epoch, uint _expiryBlockNumber) public {
        rewardInBPS = _rewardInBPS;
        rebateInBPS = _rebateInBPS;
        epoch = _epoch;
        expiryBlockNumber = _expiryBlockNumber;
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

    function getLatestBRRData() external view returns(uint, uint, uint, uint, uint) {
        return (BPS - rewardInBPS - rebateInBPS, rewardInBPS, rebateInBPS, epoch, expiryBlockNumber);
    }

    function claimStakerReward(address staker, uint percentageInPrecision, uint forEpoch) external returns(uint) {
        return feeHandler.claimStakerReward(staker, percentageInPrecision, forEpoch);
    }
}
