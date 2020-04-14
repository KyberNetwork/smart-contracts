pragma solidity 0.5.11;


interface IKyberFeeHandler {
    function handleFees(
        address[] calldata eligibleWallets,
        uint256[] calldata rebatePercentages,
        address platformWallet,
        uint256 platformFeeWei
    ) external payable returns (bool);

    function claimReserveRebate(address rebateWallet)
        external
        returns (uint256);

    function claimStakerReward(
        address staker,
        uint256 percentageInPrecision,
        uint256 epoch
    ) external returns (bool);
}
