pragma solidity 0.5.11;


interface IKyberStaking {
    function getStakerDataForCurrentEpoch(address staker)
        external returns(uint _stake, uint _delegatedStake, address _delegatedAddress);
}