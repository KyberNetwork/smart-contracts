pragma solidity 0.5.11;

import "../KyberDAO.sol";

contract MockKyberDaoMoreGetters is KyberDAO {

    constructor(
        uint _epochPeriod, uint _startBlock,
        address _staking, address _feeHandler, address _knc,
        uint _maxNumOptions, uint _minCampDuration,
        uint _defaultNetworkFee, uint _defaultBrrData,
        address _admin
    ) KyberDAO(
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

    function getWinningOptionDecodeData(uint data) public pure returns(bool hasConcluded, uint winningOptionID) {
        (hasConcluded, winningOptionID) = decodeWinningOptionData(data);
    }

    function getWinningOptionEncodeData(bool hasConcluded, uint optionID) public pure returns(uint) {
        return encodeWinningOptionData(optionID, hasConcluded);
    }

    function getDecodeFormulaParams(uint data) public pure
        returns(uint minPercentageInPrecision, uint cInPrecision, uint tInPrecision)
    {
        FormulaData memory formulaData = decodeFormulaParams(data);
        minPercentageInPrecision = formulaData.minPercentageInPrecision;
        cInPrecision = formulaData.cInPrecision;
        tInPrecision = formulaData.tInPrecision;
    }

    function checkLatestBrrData(uint _rewardInBps, uint _rebateInBps, uint _burnInBps, uint _epoch, uint _expiryBlockNumber) public returns(bool) {
        (uint burn, uint reward, uint rebate, uint epoch, uint expiryBN) = getLatestBRRData();
        require(_rewardInBps == reward, "reward bps is wrong");
        require(_rebateInBps == rebate, "rebate bps is wrong");
        require(_burnInBps == burn, "burn bps is wrong");
        require(_epoch == epoch, "epoch is wrong");
        require(_expiryBlockNumber == expiryBN, "expiry block number is wrong");
    }

    function checkLatestNetworkFeeData(uint _networkFee, uint _expiryBlockNumber) public {
        (uint networkFee, uint expiryBlock) = getLatestNetworkFeeDataWithCache();
        require(networkFee == _networkFee, "network fee is wrong");
        require(expiryBlock == _expiryBlockNumber, "expiry block number is wrong");
    }
}
