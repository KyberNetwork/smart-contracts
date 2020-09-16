pragma solidity 0.6.6;

import "../IKyberDao.sol";
import "../IKyberFeeHandler.sol";

interface IFeeHandler is IKyberFeeHandler {
    function hasClaimedReward(address, uint256) external view returns (bool);
}


contract MultipleEpochRewardsClaimer {
    IKyberDao public kyberDao;

    constructor(IKyberDao _kyberDao) public {
        kyberDao = _kyberDao;
    }

    function claimAll(IFeeHandler feeHandler, uint256[] calldata unclaimedEpochs) external {
        for (uint256 i = 0; i < unclaimedEpochs.length; i++) {
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
