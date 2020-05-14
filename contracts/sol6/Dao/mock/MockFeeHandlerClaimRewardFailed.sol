pragma solidity 0.6.6;

import "./MockFeeHandlerNoContructor.sol";


contract MockFeeHandlerClaimRewardFailed is MockFeeHandlerNoContructor {
    function claimStakerReward(
        address payable staker,
        uint256 percentInPrecision,
        uint256 epoch
    ) public override returns (bool) {
        uint256 reward = rewards[epoch];
        uint256 rewardToClaim = (percentInPrecision * reward) / PRECISION;
        require(rewardToClaim <= address(this).balance);
        staker.transfer(rewardToClaim);
        revert();
    }
}
