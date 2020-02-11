pragma solidity 0.5.11;

import "../StakingContract.sol";


contract MockStakingContract is StakingContract {

    constructor(address _kncToken, uint _epochPeriod, uint _startBlock, address _admin) 
        StakingContract(_kncToken, _epochPeriod, _startBlock, _admin) public { }

    function getHasInitedValue(address staker, uint epoch) public view returns(bool) {
        return hasInited[epoch][staker];
    }

    function getStakesValue(address staker, uint epoch) public view returns(uint) {
        return stakes[epoch][staker];
    }

    function getDelegatedStakesValue(address staker, uint epoch) public view returns(uint) {
        return delegatedStakes[epoch][staker];
    }

    function getDelegatedAddressValue(address staker, uint epoch) public view returns(address) {
        return delegatedAddress[epoch][staker];
    }

    function checkInitAndReturnStakerDataForCurrentEpoch(
        address staker, uint expectedStake,
        uint expectedDelegatedStake, address expectedDelegatedAddress)
        public
    {
        (uint stake, uint delegatedStake, address delegatedAddr) = initAndReturnStakerDataForCurrentEpoch(staker);
        require(stake == expectedStake, "stake is incorrect");
        require(delegatedStake == expectedDelegatedStake, "delegated stake is incorrect");
        require(delegatedAddr == expectedDelegatedAddress, "delegated stake is incorrect");
    }
}
