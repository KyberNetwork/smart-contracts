pragma solidity 0.6.6;

import "../EpochUtils.sol";
import "../../IERC20.sol";


contract MockKyberDAOTestHandleWithdrawal is EpochUtils {
    mapping(address => uint256) public values;
    IERC20 public knc;

    constructor(uint256 _epochPeriod, uint256 _startTimestamp, address _knc) public {
        epochPeriodInSeconds = _epochPeriod;
        firstEpochStartTimestamp = _startTimestamp;
        knc = IERC20(_knc);
    }

    function handleWithdrawal(address staker, uint256 amount) public {
        // to test if staking has called this func or not when withdrawing
        values[staker] += amount;
    }
}
