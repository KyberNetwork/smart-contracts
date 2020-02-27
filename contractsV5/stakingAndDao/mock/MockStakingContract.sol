pragma solidity 0.5.11;

import "../KyberStaking.sol";

contract MockStakingContract is KyberStaking {

    constructor(address _kncToken, uint _epochPeriod, uint _startBlock, address _admin) 
        KyberStaking(_kncToken, _epochPeriod, _startBlock, _admin) public { }

    function getHasInitedValue(address staker, uint epoch) public view returns(bool) {
        return hasInited[epoch][staker];
    }

    function getStakesValue(address staker, uint epoch) public view returns(uint) {
        return stake[epoch][staker];
    }

    function getDelegatedStakesValue(address staker, uint epoch) public view returns(uint) {
        return delegatedStake[epoch][staker];
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

    function setDAOAddressWithoutCheck(address dao) public {
        daoContract = IKyberDAO(dao);
    }
}
