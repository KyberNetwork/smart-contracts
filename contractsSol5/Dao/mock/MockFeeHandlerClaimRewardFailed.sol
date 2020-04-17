pragma solidity 0.5.11;

import "./MockFeeHandlerNoContructor.sol";


contract MockFeeHandlerClaimRewardFailed is MockFeeHandlerNoContructor {
    function claimStakerReward(
        address payable staker,
        uint256 percentInPrecision,
        uint256 epoch
    ) public returns (bool) {
        uint256 reward = rewards[epoch];
        uint256 rewardToClaim = (percentInPrecision * reward) / PRECISION;
        require(rewardToClaim <= address(this).balance);
        staker.transfer(rewardToClaim);
        return false;
    }
}
