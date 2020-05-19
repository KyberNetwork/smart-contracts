pragma solidity 0.6.6;

import "../EpochUtils.sol";
import "../../IERC20.sol";


contract MockKyberDaoWithdrawFailed is EpochUtils {
    IERC20 public knc;
    uint256 public value;

    constructor(uint256 _epochPeriod, uint256 _startTimestamp, address _knc) public {
        epochPeriodInSeconds = _epochPeriod;
        firstEpochStartTimestamp = _startTimestamp;
        knc = IERC20(_knc);
    }

    function handleWithdrawal(address, uint256) public {
        value++;
        revert();
    }
}
