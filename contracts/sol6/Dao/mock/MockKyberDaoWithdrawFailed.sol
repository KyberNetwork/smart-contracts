pragma solidity 0.6.6;

import "../EpochUtils.sol";
import "../../IERC20.sol";


contract MockKyberDaoWithdrawFailed is EpochUtils {
    IERC20 public kncToken;
    uint256 public value;

    constructor(uint256 _epochPeriod, uint256 _startTimestamp, address _kncToken) public {
        epochPeriodInSeconds = _epochPeriod;
        firstEpochStartTimestamp = _startTimestamp;
        kncToken = IERC20(_kncToken);
    }

    function handleWithdrawal(address, uint256) public {
        value++;
        revert();
    }
}
