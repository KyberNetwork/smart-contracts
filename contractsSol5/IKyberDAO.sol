pragma solidity 0.5.11;


interface IKyberDAO {
    function EPOCH_PERIOD_SECONDS() external view returns(uint);
    function FIRST_EPOCH_START_TIMESTAMP() external view returns(uint);

    function handleWithdrawal(address staker, uint penaltyAmount) external returns(bool);
    function shouldBurnRewardForEpoch(uint epoch) external view returns(bool);
    function getLatestNetworkFeeData() external view returns(uint feeInBps, uint expiryTimestamp);
    function getLatestNetworkFeeDataWithCache() external returns(uint feeInBps, uint expiryTimestamp);
    function getLatestBRRData() external
        returns(uint burnInBps, uint rewardInBps, uint rebateInBps, uint epoch, uint expiryTimestamp);
    function vote(uint256 campID, uint256 option) external;
}
