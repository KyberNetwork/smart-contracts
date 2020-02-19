pragma solidity 0.5.11;

import "./MockFeeHandler.sol";

contract MockFeeHandlerClaimRewardFailed is MockFeeHandler {

    function claimStakerReward(address payable staker, uint percentInPrecision, uint epoch) public returns(bool) {
        uint reward = rewards[epoch];
        uint rewardToClaim = percentInPrecision * reward / PRECISION;
        require(rewardToClaim <= address(this).balance);
        staker.transfer(rewardToClaim);
        return false;
    }
}

