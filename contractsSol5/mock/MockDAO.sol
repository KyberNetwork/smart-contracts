pragma solidity 0.5.11;

import "../IKyberDAO.sol";
import "../utils/Utils4.sol";
import "../IKyberFeeHandler.sol";


contract MockDAO is IKyberDAO, Utils4 {
    IKyberFeeHandler public feeHandler;
    uint256 public rewardInBPS;
    uint256 public rebateInBPS;
    uint256 public epoch;
    uint256 public expiryBlockNumber;
    uint256 public feeBps;
    uint256 public epochPeriod = 10;
    uint256 public startBlock;
    uint256 data;
    mapping(uint256 => bool) public shouldBurnRewardEpoch;

    constructor(
        uint256 _rewardInBPS,
        uint256 _rebateInBPS,
        uint256 _epoch,
        uint256 _expiryBlockNumber
    ) public {
        rewardInBPS = _rewardInBPS;
        rebateInBPS = _rebateInBPS;
        epoch = _epoch;
        expiryBlockNumber = _expiryBlockNumber;
        startBlock = block.number;
    }

    function setFeeHandler(IKyberFeeHandler _handler) public {
        feeHandler = _handler;
    }

    function setMockEpochAndExpiryBlock(
        uint256 _epoch,
        uint256 _expiryBlockNumber
    ) public {
        epoch = _epoch;
        expiryBlockNumber = _expiryBlockNumber;
    }

    function setMockBRR(uint256 _rewardInBPS, uint256 _rebateInBPS) public {
        rewardInBPS = _rewardInBPS;
        rebateInBPS = _rebateInBPS;
    }

    function setNetworkFeeBps(uint256 _feeBps) public {
        feeBps = _feeBps;
    }

    function getLatestNetworkFeeData()
        external
        view
        returns (uint256, uint256)
    {
        return (feeBps, expiryBlockNumber);
    }

    function getLatestNetworkFeeDataWithCache()
        external
        returns (uint256 feeInBps, uint256 expiryBlock)
    {
        data++;
        return (feeBps, expiryBlockNumber);
    }

    function getLatestBRRData()
        external
        returns (
            uint256,
            uint256,
            uint256,
            uint256,
            uint256
        )
    {
        return (
            BPS - rewardInBPS - rebateInBPS,
            rewardInBPS,
            rebateInBPS,
            epoch,
            expiryBlockNumber
        );
    }

    function claimStakerReward(
        address staker,
        uint256 percentageInPrecision,
        uint256 forEpoch
    ) external returns (bool) {
        return
            feeHandler.claimStakerReward(
                staker,
                percentageInPrecision,
                forEpoch
            );
    }

    function EPOCH_PERIOD_BLOCKS() external view returns (uint256) {
        return epochPeriod;
    }

    function FIRST_EPOCH_START_BLOCK() external view returns (uint256) {
        return startBlock;
    }

    function handleWithdrawal(address staker, uint256 reduceAmount)
        external
        returns (bool)
    {
        staker;
        reduceAmount;
        return true;
    }

    function shouldBurnRewardForEpoch(uint256 epochNum)
        external
        view
        returns (bool)
    {
        if (shouldBurnRewardEpoch[epochNum]) return true;
        return false;
    }

    function setShouldBurnRewardTrue(uint256 epochNum) public {
        shouldBurnRewardEpoch[epochNum] = true;
    }

    function advanceEpoch() public {
        epoch++;
        expiryBlockNumber = block.number + epochPeriod;
    }

    function vote(uint256 campID, uint256 option) external {
        // must implement so it can be deployed.
        campID;
        option;
    }
}
