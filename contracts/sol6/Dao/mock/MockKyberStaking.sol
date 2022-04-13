pragma solidity 0.6.6;

import "../NimbleStaking.sol";


contract MockNimbleStaking is NimbleStaking {
    constructor(
        IERC20 _kncToken,
        uint256 _epochPeriod,
        uint256 _startBlock,
        INimbleDao _admin
    ) public NimbleStaking(_kncToken, _epochPeriod, _startBlock, _admin) {}

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
