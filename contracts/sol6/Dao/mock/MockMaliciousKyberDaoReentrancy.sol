pragma solidity 0.6.6;

import "../EpochUtils.sol";
import "../KyberStaking.sol";


/// @notice Mock Malicious KyberDao tries to re-enter withdraw function in Staking
contract MockMaliciousKyberDaoReentrancy is EpochUtils {
    KyberStaking public staking;
    IERC20 public knc;

    uint256 totalDeposit = 0;

    constructor(
        uint256 _epochPeriod,
        uint256 _startTimestamp,
        KyberStaking _staking,
        IERC20 _knc
    ) public {
        epochPeriodInSeconds = _epochPeriod;
        firstEpochStartTimestamp = _startTimestamp;
        staking = _staking;
        knc = _knc;
        require(_knc.approve(address(_staking), 2**255));
    }

    function deposit(uint256 amount) public {
        staking.deposit(amount);
        totalDeposit += amount;
    }

    function withdraw(uint256 amount) public {
        totalDeposit -= amount;
        staking.withdraw(amount);
    }

    function handleWithdrawal(address, uint256) public {
        if (totalDeposit > 0) {
            // reentrant one
            uint256 amount = totalDeposit;
            totalDeposit = 0;
            staking.withdraw(amount);
        }
    }
}
