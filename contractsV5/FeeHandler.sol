pragma  solidity 0.5.11;

import "./IFeeHandler.sol";

contract FeeHandler is IFeeHandler {
    function handleFees(address[] calldata eligibleWallets, uint[] calldata rebatePercentages) external payable returns(bool) {
        return true;
    }
}
