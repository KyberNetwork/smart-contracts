pragma solidity 0.6.6;

import "../emergency/EmergencyFeeHandler.sol";

contract MockEmergencyFeeHandler is EmergencyNimbleFeeHandler {
    constructor(
        address admin,
        address _NimbleNetwork,
        uint256 _rewardBps,
        uint256 _rebateBps,
        uint256 _burnBps
    ) public EmergencyNimbleFeeHandler(admin, _NimbleNetwork, _rewardBps, _rebateBps, _burnBps) {}

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
