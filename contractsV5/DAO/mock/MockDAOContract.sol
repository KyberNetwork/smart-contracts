pragma solidity 0.5.11;

import "../DAOContract.sol";

contract MockDAOContract is DAOContract {

    constructor(
        uint _epochPeriod, uint _startBlock,
        address _staking, address _feeHandler, address _knc,
        uint _maxNumOptions, uint _minCampDuration,
        uint _defaultNetworkFee, uint _defaultBrrData,
        address _admin
    ) DAOContract(
        _epochPeriod, _startBlock,
        _staking, _feeHandler, _knc,
        _defaultNetworkFee, _defaultBrrData, _admin
    ) public {
        MAX_CAMP_OPTIONS = _maxNumOptions;
        MIN_CAMP_DURATION = _minCampDuration;
    }

    function replaceStakingContract(address _staking) public {
        staking = IKyberStaking(_staking);
    }

    function setLatestNetworkFee(uint _fee) public {
        latestNetworkFeeResult = _fee;
    }

    function setLatestBrrData(uint _data) public {
        latestBrrResult = _data;
    }

    function getTotalPoints(uint epoch) public view returns(uint) {
        return totalEpochPoints[epoch];
    }

    function getNumberVotes(address staker, uint epoch) public view returns(uint) {
        return numberVotes[staker][epoch];
    }

    function getWinningOptionData(uint campID) public view returns(bool hasConcluded, uint winningOptionID) {
        (hasConcluded, winningOptionID) = decodeWinningOptionData(winningOptionData[campID]);
    }

    function checkLatestBrrData(uint _rewardInBps, uint _rebateInBps, uint _burnInBps, uint _epoch, uint _expiryBlockNumber) public returns(bool) {
        (uint burn, uint reward, uint rebate, uint epoch, uint expiryBN) = getLatestBRRData();
        require(_rewardInBps == reward, "reward bps is wrong");
        require(_rebateInBps == rebate, "rebate bps is wrong");
        require(_burnInBps == burn, "burn bps is wrong");
        require(_epoch == epoch, "epoch is wrong");
        require(_expiryBlockNumber == expiryBN, "expiry block number is wrong");
    }
}
