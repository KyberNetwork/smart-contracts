pragma solidity 0.6.6;

import "../emergency/EmergencyFeeHandler.sol";

contract MockEmergencyFeeHandler is EmergencyKyberFeeHandler {
    constructor(
        address admin,
        address _kyberNetwork,
        uint256 _rewardBps,
        uint256 _rebateBps,
        uint256 _burnBps
    ) public EmergencyKyberFeeHandler(admin, _kyberNetwork, _rewardBps, _rebateBps, _burnBps) {}

    function calculateAndRecordFeeData(
        address,
        uint256,
        address[] calldata,
        uint256[] calldata,
        uint256
    ) external override {
        revert();
    }
}
