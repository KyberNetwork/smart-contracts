pragma solidity 0.6.6;

import "../../utils/Utils5.sol";


contract MockFeeHandlerNoContructor is Utils5 {
    mapping(uint256 => uint256) public rewards;

    constructor() public {}

    receive() external payable {}

    function setEpochReward(uint256 epoch) public payable {
        rewards[epoch] = msg.value;
    }

    function claimStakerReward(
        address payable staker,
        uint256 percentInPrecision,
        uint256 epoch
    ) public virtual returns (bool) {
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
