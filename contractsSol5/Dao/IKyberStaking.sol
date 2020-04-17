pragma solidity 0.5.11;


interface IKyberStaking {
    function epochPeriodInSeconds() external view returns (uint256);

    function firstEpochStartTimestamp() external view returns (uint256);

    function initAndReturnStakerDataForCurrentEpoch(address staker)
        external
        returns (
            uint256 _stake,
            uint256 _delegatedStake,
            address _delegatedAddress
        );

    function getStakerDataForPastEpoch(address staker, uint256 epoch)
        external
        view
        returns (
            uint256 _stake,
            uint256 _delegatedStake,
            address _delegatedAddress
        );

    function deposit(uint256 amount) external;

    function withdraw(uint256 amount) external;

    function delegate(address dAddr) external;
}
