pragma solidity 0.5.11;

import "../EpochUtils.sol";
import "../KyberStaking.sol";

/// @notice Mock Malicious DAO tries to re-enter withdraw function in Staking
contract MockMaliciousDaoReentrancy is EpochUtils {

    KyberStaking public staking;
    IERC20 public knc;

    uint totalDeposit = 0;

    constructor(uint _epochPeriod, uint _startTimestamp, KyberStaking _staking, IERC20 _knc) public {
        EPOCH_PERIOD_SECONDS = _epochPeriod;
        FIRST_EPOCH_START_TIMESTAMP = _startTimestamp;
        staking = _staking;
        knc = _knc;
        require(_knc.approve(address(_staking), 2**255));
    }

    function deposit(uint amount) public {
        staking.deposit(amount);
        totalDeposit += amount;
    }

    function withdraw(uint amount) public {
        totalDeposit -= amount;
        staking.withdraw(amount);
    }

    function handleWithdrawal(address, uint) public returns(bool) {
        if (totalDeposit > 0) {
            // reentrant one
            uint amount = totalDeposit;
            totalDeposit = 0;
            staking.withdraw(amount);
        }
        return true;
    }
}
