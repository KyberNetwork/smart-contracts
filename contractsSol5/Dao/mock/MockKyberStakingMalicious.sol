pragma solidity 0.5.11;

import "../KyberStaking.sol";

contract MockKyberStakingMalicious is KyberStaking {

    constructor(address _kncToken, uint _epochPeriod, uint _startBlock, address _admin) 
        KyberStaking(_kncToken, _epochPeriod, _startBlock, _admin) public { }

    function setLatestStake(address staker, uint amount) public {
        stakerLatestData[staker].stake = amount;
    }

    function setLatestDelegatedStake(address staker, uint amount) public {
        stakerLatestData[staker].delegatedStake = amount;
    }

    function setEpochStake(address staker, uint epoch, uint amount) public {
        stakerPerEpochData[epoch][staker].stake = amount;
    }

    function setEpochDelegatedStake(address staker, uint epoch, uint amount) public {
        stakerPerEpochData[epoch][staker].delegatedStake = amount;
    }
}

