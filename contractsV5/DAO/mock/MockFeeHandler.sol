pragma solidity 0.5.11;

import "../../UtilsV5.sol";

contract MockFeeHandler is Utils {

    mapping(uint => uint) public rewards;

    constructor() public {}

    function () external payable {}

    function setEpochReward(uint epoch) public payable {
        rewards[epoch] = msg.value;
    }

    function claimReward(address payable staker, uint epoch, uint percentInPrecision) public returns(bool) {
        uint reward = rewards[epoch];
        uint rewardToClaim = percentInPrecision * reward / PRECISION;
        require(rewardToClaim <= address(this).balance);
        staker.transfer(rewardToClaim);
        return true;
    }
}
