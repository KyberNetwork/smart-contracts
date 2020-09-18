pragma solidity 0.6.6;

import "../IKyberFeeHandler.sol";

interface IFeeHandler is IKyberFeeHandler {
    function hasClaimedReward(address, uint256) external view returns (bool);
}

interface IMultipleEpochRewardsClaimer {
    function claimMultipleRewards(
        IFeeHandler feeHandler,
        uint256[] calldata unclaimedEpochs
    ) external;

    function getUnclaimedEpochs(IFeeHandler feeHandler, address staker)
        external
        view
        returns (uint256[] memory unclaimedEpochs);
}
