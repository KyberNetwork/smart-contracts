pragma solidity 0.5.11;


interface IKyberStaking {
    function epochPeriodInSeconds() external view returns(uint);
    function firstEpochStartTimestamp() external view returns(uint);
    function initAndReturnStakerDataForCurrentEpoch(address staker)
        external returns(uint _stake, uint _delegatedStake, address _delegatedAddress);
    function getStakerDataForPastEpoch(address staker, uint epoch)
        external view returns(uint _stake, uint _delegatedStake, address _delegatedAddress);
    function deposit(uint amount) external;
    function withdraw(uint amount) external;
    function delegate(address dAddr) external;
}
