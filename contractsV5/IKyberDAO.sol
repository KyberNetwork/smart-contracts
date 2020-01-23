pragma solidity 0.5.11;

interface IKyberDAO {
    function getLatestNetworkFeeData() external view returns(uint feeInBps, uint expiryBlockNumber);
    function getLatestBRRData() external view returns(uint burnInBps, uint rewardInBps, uint rebateInBps, uint epoch, uint expiryBlockNumber);
    function claimStakerReward(address staker, uint percentageInPrecision, uint epoch) external returns(uint);
}
