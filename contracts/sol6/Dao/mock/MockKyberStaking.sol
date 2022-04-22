pragma solidity 0.6.6;

import "../nimbleStaking.sol";


contract MocknimbleStaking is nimbleStaking {
    constructor(
        IERC20 _NIMToken,
        uint256 _epochPeriod,
        uint256 _startBlock,
        InimbleDao _admin
    ) public nimbleStaking(_NIMToken, _epochPeriod, _startBlock, _admin) {}

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
