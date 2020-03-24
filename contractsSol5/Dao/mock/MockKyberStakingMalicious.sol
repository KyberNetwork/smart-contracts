pragma solidity 0.5.11;

import "../KyberStaking.sol";

contract MockKyberStakingMalicious is KyberStaking {

    constructor(address _kncToken, uint _epochPeriod, uint _startBlock, address _admin) 
        KyberStaking(_kncToken, _epochPeriod, _startBlock, _admin) public { }

    function setLatestStake(address staker, uint amount) public {
        latestStake[staker] = amount;
    }

    function setLatestDelegatedStake(address staker, uint amount) public {
        latestDelegatedStake[staker] = amount;
    }

    function setEpochStake(address staker, uint epoch, uint amount) public {
        stake[epoch][staker] = amount;
    }

    function setEpochDelegatedStake(address staker, uint epoch, uint amount) public {
        delegatedStake[epoch][staker] = amount;
    }
}

