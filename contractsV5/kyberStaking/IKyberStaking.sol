pragma solidity 0.5.11;


interface IKyberStaking {
    function EPOCH_PERIOD() external view returns(uint);
    function START_BLOCK() external view returns(uint);
    function initAndReturnStakerDataForCurrentEpoch(address staker)
        external returns(uint _stake, uint _delegatedStake, address _delegatedAddress);
    function getStakerDataForPastEpoch(address staker, uint epoch)
        external view returns(uint _stake, uint _delegatedStake, address _delegatedAddress);
}
