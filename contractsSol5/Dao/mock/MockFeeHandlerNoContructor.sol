pragma solidity 0.5.11;

import "../../utils/Utils4.sol";


contract MockFeeHandlerNoContructor is Utils4 {
    mapping(uint256 => uint256) public rewards;

    constructor() public {}

    function() external payable {}

    function setEpochReward(uint256 epoch) public payable {
        rewards[epoch] = msg.value;
    }

    function claimStakerReward(
        address payable staker,
        uint256 percentInPrecision,
        uint256 epoch
    ) public returns (bool) {
        uint256 reward = rewards[epoch];
        uint256 rewardToClaim = (percentInPrecision * reward) / PRECISION;
        require(rewardToClaim <= address(this).balance);
        staker.transfer(rewardToClaim);
        return true;
    }

    function withdrawAllETH() public {
        msg.sender.transfer(address(this).balance);
    }
}
