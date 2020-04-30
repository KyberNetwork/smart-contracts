pragma solidity 0.6.6;


contract MockFeeHandlerReturnFalse {
    constructor() public {}

    function handleFees(
        address[] calldata rebateWallets,
        uint256[] calldata rebateBpsPerWallet,
        address platformWallet,
        uint256 platformFeeWei
    ) external payable returns (bool) {
        rebateWallets;
        rebateBpsPerWallet;
        platformWallet;
        platformFeeWei;
        return false;
    }
}
