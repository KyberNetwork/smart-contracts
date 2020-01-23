pragma solidity 0.5.11;

import "../IKyberDAO.sol";

contract MockDAO is IKyberDAO {

    uint public feeInBPS;
    uint public expiryBlockNumber;
    uint public burnInBPS;
    uint public rewardInBPS;
    uint public rebateInBPS;

    constructor(uint _feeInBPS, uint _expiryBlockNumber, uint _burnInBPS, uint _rewardInBPS, uint _rebateInBPS) public {
        feeInBPS = _feeInBPS;
        expiryBlockNumber = _expiryBlockNumber;
        burnInBPS = _burnInBPS;
        rewardInBPS = _rewardInBPS;
        rebateInBPS = _rebateInBPS;
    }

    function setMockValues(uint _feeInBPS, uint _expiryBlockNumber, uint _burnInBPS, uint _rewardInBPS, uint _rebateInBPS) public {
        feeInBPS = _feeInBPS;
        expiryBlockNumber = _expiryBlockNumber;
        burnInBPS = _burnInBPS;
        rewardInBPS = _rewardInBPS;
        rebateInBPS = _rebateInBPS;
    }

    function getLatestNetworkFeeData() external view returns(uint feeInBps, uint expiryBlockNumber) {
        return (feeInBps, expiryBlockNumber);
    }
    function getLatestBRRData() external view returns(uint burnInBps, uint rewardInBps, uint rebateInBps, uint epoch, uint expiryBlockNumber) {
        return (burnInBps, rewardInBps, rebateInBps, epoch, expiryBlockNumber);
    }
    function claimStakerReward(uint epoch) external returns(uint) {
        return 1;
    }
    function claimReserveRebate(uint epoch) external returns(uint) {
        return 1;
    }
}