pragma solidity 0.5.11;

import "./MockFeeHandlerNoContructor.sol";

contract MockFeeHandlerClaimRewardFailed is MockFeeHandlerNoContructor {

    function claimStakerReward(address payable staker, uint percentInPrecision, uint epoch) public returns(bool) {
        uint reward = rewards[epoch];
        uint rewardToClaim = percentInPrecision * reward / PRECISION;
        require(rewardToClaim <= address(this).balance);
        staker.transfer(rewardToClaim);
        return false;
    }
}
