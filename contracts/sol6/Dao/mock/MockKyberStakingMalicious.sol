pragma solidity 0.6.6;

import "../NimbleStaking.sol";


contract MockNimbleStakingMalicious is NimbleStaking {
    constructor(
        IERC20 _kncToken,
        uint256 _epochPeriod,
        uint256 _startBlock,
        INimbleDao _admin
    ) public NimbleStaking(_kncToken, _epochPeriod, _startBlock, _admin) {}

    function setLatestStake(address staker, uint256 amount) public {
        stakerLatestData[staker].stake = amount;
    }

    function setLatestDelegatedStake(address staker, uint256 amount) public {
        stakerLatestData[staker].delegatedStake = amount;
    }

    function setEpochStake(
        address staker,
        uint256 epoch,
        uint256 amount
    ) public {
        stakerPerEpochData[epoch][staker].stake = amount;
    }

    function setEpochDelegatedStake(
        address staker,
        uint256 epoch,
        uint256 amount
    ) public {
        stakerPerEpochData[epoch][staker].delegatedStake = amount;
    }

    function getHasInitedValue(address staker, uint256 epoch) public view returns (bool) {
        return hasInited[epoch][staker];
    }
}
