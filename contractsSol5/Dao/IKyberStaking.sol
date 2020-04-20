pragma solidity 0.5.11;


interface IKyberStaking {
    event Delegated(
        address indexed staker,
        address indexed delegatedAddress,
        uint256 indexed epoch,
        bool isDelegated
    );
    event Deposited(uint256 curEpoch, address indexed staker, uint256 amount);
    event Withdraw(uint256 indexed curEpoch, address indexed staker, uint256 amount);

    function initAndReturnStakerDataForCurrentEpoch(address staker)
        external
        returns (
            uint256 _stake,
            uint256 _delegatedStake,
            address _delegatedAddress
        );

    function deposit(uint256 amount) external;

    function delegate(address dAddr) external;

    function withdraw(uint256 amount) external;

    function getStakerDataForPastEpoch(address staker, uint256 epoch)
        external
        view
        returns (
            uint256 _stake,
            uint256 _delegatedStake,
            address _delegatedAddress
        );

    function epochPeriodInSeconds() external view returns (uint256);

    function firstEpochStartTimestamp() external view returns (uint256);
}
