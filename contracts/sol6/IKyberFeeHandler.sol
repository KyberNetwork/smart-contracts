pragma solidity 0.6.6;

import "./IERC20.sol";


interface IKyberFeeHandler {
    event RewardPaid(address indexed staker, uint256 indexed epoch, IERC20 indexed token, uint256 amountTwei);
    event RebatePaid(address indexed rebateWallet, IERC20 indexed token, uint256 amountTwei);
    event PlatformFeePaid(address indexed platformWallet, IERC20 indexed token, uint256 amountTwei);
    event KncBurned(uint256 kncTWei, IERC20 indexed token, uint256 amountTwei);

    function handleFees(
        address[] calldata eligibleWallets,
        uint256[] calldata rebatePercentages,
        address platformWallet,
        uint256 platformFeeWei,
        uint256 feeBRRWei
    ) external payable;

    function claimReserveRebate(address rebateWallet) external returns (uint256);

    function claimPlatformFee(address platformWallet) external returns (uint256);

    function claimStakerReward(
        address staker,
        uint256 epoch
    ) external returns(uint amountTwei);
}
