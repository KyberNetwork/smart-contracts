pragma solidity 0.5.11;


interface IKyberFeeHandler {
    function handleFees(address[] calldata eligibleWallets, uint[] calldata rebatePercentages,
        address platformWallet, uint platformFeeWei)
        external payable returns(bool);
    function claimReserveRebate(address rebateWallet) external returns (uint);
    function claimStakerReward(address staker, uint percentageInPrecision, uint epoch)
        external returns(bool);
}
