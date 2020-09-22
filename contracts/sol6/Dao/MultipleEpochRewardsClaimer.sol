pragma solidity 0.6.6;

import "../IKyberDao.sol";
import "./IMultipleEpochRewardsClaimer.sol";
import "../utils/Withdrawable3.sol";


contract MultipleEpochRewardsClaimer is IMultipleEpochRewardsClaimer, Withdrawable3 {
    IKyberDao public immutable kyberDao;

    constructor(IKyberDao _kyberDao, address _admin) public Withdrawable3(_admin) {
        kyberDao = _kyberDao;
    }

    /// @dev unclaimedEpochs is asusumed to be of reasonable length
    /// otherwise txns might run of gas
    function claimMultipleRewards(
        IFeeHandler feeHandler,
        uint256[] calldata unclaimedEpochs
    ) external override {
        // full array size is expected to be of reasonable length
        // for the next 1-2 years
        // we thus start iterating from epoch 0
        for (uint256 i = 0; i < unclaimedEpochs.length; i++) {
            feeHandler.claimStakerReward(msg.sender, unclaimedEpochs[i]);
        }
    }

    function getUnclaimedEpochs(IFeeHandler feeHandler, address staker)
        external
        view
        override
        returns (uint256[] memory unclaimedEpochs)
    {
        uint256 currentEpoch = kyberDao.getCurrentEpochNumber();
        uint256[] memory tempArray = new uint256[](currentEpoch);
        uint256 i;
        uint256 j;
        for (i = 0; i < currentEpoch; i++) {
            if (
                !feeHandler.hasClaimedReward(staker, i) &&
                kyberDao.getPastEpochRewardPercentageInPrecision(staker, i) != 0
            ) {
                tempArray[j]= i;
                j++;
            }
        }
        unclaimedEpochs = new uint256[](j);
        for (i = 0; i < j; i++) {
            unclaimedEpochs[i] = tempArray[i];
        }
    }
}
