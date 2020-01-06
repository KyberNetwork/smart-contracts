pragma solidity 0.5.11;


interface IKyberDAO {
    // handle withdrawal from Staking, reward should be reduced based on penaltyAmount
    function handleWithdrawal(address staker, uint penaltyAmount) external;
}