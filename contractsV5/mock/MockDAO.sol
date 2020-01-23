pragma solidity 0.5.11;

import "../IKyberDAO.sol";
import "../UtilsV5.sol";

contract MockDAO is IKyberDAO, Utils {

    uint public rewardInBPS;
    uint public rebateInBPS;
    uint public epoch;
    uint public expiryBlockNumber;

    constructor(uint _rewardInBPS, uint _rebateInBPS, uint _epoch, uint _expiryBlockNumber) public {
        rewardInBPS = _rewardInBPS;
        rebateInBPS = _rebateInBPS;
        epoch = _epoch;
        expiryBlockNumber = _expiryBlockNumber;
    }

    function setMockValues(uint _rewardInBPS, uint _rebateInBPS, uint _epoch, uint _expiryBlockNumber) public {
        rewardInBPS = _rewardInBPS;
        rebateInBPS = _rebateInBPS;
        epoch = _epoch;
        expiryBlockNumber = _expiryBlockNumber;
    }

    function getLatestNetworkFeeData() external view returns(uint, uint) {
        return (1, expiryBlockNumber);
    }
    function getLatestBRRData() external view returns(uint, uint, uint, uint, uint) {
        return (BPS - rewardInBPS - rebateInBPS, rewardInBPS, rebateInBPS, epoch, expiryBlockNumber);
    }
    function claimStakerReward(uint _epoch) external returns(uint) {
        return 1;
    }
    function claimReserveRebate(uint _epoch) external returns(uint) {
        return 1;
    }
}
