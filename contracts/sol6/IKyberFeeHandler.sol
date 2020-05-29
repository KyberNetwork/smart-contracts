pragma solidity 0.6.6;


interface IKyberFeeHandler {
    event RewardPaid(address indexed staker, uint256 indexed epoch, uint256 amountWei);
    event RebatePaid(address indexed rebateWallet, uint256 amountWei);
    event PlatformFeePaid(address indexed platformWallet, uint256 amountWei);
    event KncBurned(uint256 kncTWei, uint256 amountWei);

    function handleFees(
        address[] calldata eligibleWallets,
        uint256[] calldata rebatePercentages,
        address platformWallet,
        uint256 platformFeeWei
    ) external payable;

    function claimReserveRebate(address rebateWallet) external returns (uint256);

    function claimPlatformFee(address platformWallet) external returns (uint256);

    function claimStakerReward(
        address staker,
        uint256 percentageInPrecision,
        uint256 epoch
    ) external returns(uint amountWei);
}
