pragma solidity 0.5.11;


interface IFeeHandler {
    function handleFee(address [] calldata rebateWallets, uint[] calldata splitPerWalletBps) external payable returns(bool);
}
