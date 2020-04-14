pragma solidity 0.5.11;


interface IKyberDAO {
    function EPOCH_PERIOD_BLOCKS() external view returns (uint256);

    function FIRST_EPOCH_START_BLOCK() external view returns (uint256);

    function vote(uint256 campID, uint256 option) external;

    function handleWithdrawal(address staker, uint256 penaltyAmount)
        external
        returns (bool);

    function shouldBurnRewardForEpoch(uint256 epoch)
        external
        view
        returns (bool);

    function getLatestNetworkFeeData()
        external
        view
        returns (uint256 feeInBps, uint256 expiryBlockNumber);

    function getLatestNetworkFeeDataWithCache()
        external
        returns (uint256 feeInBps, uint256 expiryBlockNumber);

    function getLatestBRRData()
        external
        returns (
            uint256 burnInBps,
            uint256 rewardInBps,
            uint256 rebateInBps,
            uint256 epoch,
            uint256 expiryBlockNumber
        );
}
