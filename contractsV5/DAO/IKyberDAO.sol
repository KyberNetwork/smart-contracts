pragma solidity 0.5.11;


interface IKyberDAO {
    function EPOCH_PERIOD() external view returns(uint);
    function START_BLOCK() external view returns(uint);
    // handle withdrawal from Staking, reward should be reduced based on penaltyAmount
    function handleWithdrawal(address staker, uint penaltyAmount) external;

    function getLatestNetworkFeeData() external view returns(uint feeInBps, uint expiryBlockNumber);
    function getLatestNetworkFeeDataWithCache() external returns(uint feeInBps, uint expiryBlockNumber);
    function getLatestBRRData()
        external returns(uint burnInBps, uint rewardInBps, uint rebateInBps, uint epoch, uint expiryBlockNumber);
}
