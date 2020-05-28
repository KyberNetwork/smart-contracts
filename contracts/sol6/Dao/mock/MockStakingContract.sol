pragma solidity 0.6.6;

import "../KyberStaking.sol";


contract MockStakingContract is KyberStaking {
    constructor(
        IERC20 _kncToken,
        uint256 _epochPeriod,
        uint256 _startBlock,
        IKyberDAO _admin
    ) public KyberStaking(_kncToken, _epochPeriod, _startBlock, _admin) {}

    function setDAOAddressWithoutCheck(address dao) public {
        daoContract = IKyberDAO(dao);
    }

    function getHasInitedValue(address staker, uint256 epoch) public view returns (bool) {
        return hasInited[epoch][staker];
    }

    function getStakesValue(address staker, uint256 epoch) public view returns (uint256) {
        return stakerPerEpochData[epoch][staker].stake;
    }

    function getDelegatedStakesValue(address staker, uint256 epoch) public view returns (uint256) {
        return stakerPerEpochData[epoch][staker].delegatedStake;
    }

    function getRepresentativeValue(address staker, uint256 epoch)
        public
        view
        returns (address)
    {
        return stakerPerEpochData[epoch][staker].representative;
    }
}
