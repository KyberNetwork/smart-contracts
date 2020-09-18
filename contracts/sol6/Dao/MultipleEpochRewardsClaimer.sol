pragma solidity 0.6.6;

import "../IKyberDao.sol";
import "../IKyberFeeHandler.sol";

interface IFeeHandler is IKyberFeeHandler {
    function hasClaimedReward(address, uint256) external view returns (bool);
}


contract MultipleEpochRewardsClaimer {
    IKyberDao public kyberDao;
    uint256 public maxEpochs;

    constructor(IKyberDao _kyberDao, uint256 _maxEpochs) public {
        kyberDao = _kyberDao;
        maxEpochs = _maxEpochs;
    }

    function claimMultipleRewards(IFeeHandler feeHandler, uint256[] calldata unclaimedEpochs) external {
        for (uint256 i = 0; i < maxEpochs; i++) {
            feeHandler.claimStakerReward(msg.sender, unclaimedEpochs[i]);
        }
    }

    function getUnclaimedEpochs(IFeeHandler feeHandler, address staker)
        external
        view
        returns (uint256[] memory unclaimedEpochs)
    {
        uint256 currentEpoch = kyberDao.getCurrentEpochNumber();
        uint[] memory tempArray = new uint[](currentEpoch);
        uint i;
        uint j;
        for (i = 0; i < currentEpoch; i++) {
            if (
                !feeHandler.hasClaimedReward(staker, i) &&
                kyberDao.getPastEpochRewardPercentageInPrecision(staker, i) != 0
            ) {
                tempArray[j]= i;
                j++;
            }
        }
        unclaimedEpochs = new uint[](j);
        for (i = 0; i < j; i++) {
            unclaimedEpochs[i] = tempArray[i];
        }
    }
}
