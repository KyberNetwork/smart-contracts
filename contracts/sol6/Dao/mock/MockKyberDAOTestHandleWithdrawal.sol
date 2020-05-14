pragma solidity 0.6.6;

import "../EpochUtils.sol";
import "../../IERC20.sol";


contract MockKyberDAOTestHandleWithdrawal is EpochUtils {
    IERC20 public kncToken;
    mapping(address => uint256) public values;

    constructor(uint256 _epochPeriod, uint256 _startTimestamp, address _kncToken) public {
        epochPeriodInSeconds = _epochPeriod;
        firstEpochStartTimestamp = _startTimestamp;
        kncToken = IERC20(_kncToken);
    }

    function handleWithdrawal(address staker, uint256 amount) public {
        // to test if staking has called this func or not when withdrawing
        values[staker] += amount;
    }
}
