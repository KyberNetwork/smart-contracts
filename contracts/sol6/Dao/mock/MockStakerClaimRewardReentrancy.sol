pragma solidity 0.6.6;

import "../../IKyberFeeHandler.sol";


contract MockStakerClaimRewardReentrancy {
    IKyberFeeHandler public feeHandler;
    bool public isTestingReentrant = true;

    constructor(
        IKyberFeeHandler _feeHandler
    )
        public
    {
        feeHandler = _feeHandler;
    }

    receive() external payable {
        if (isTestingReentrant) {
            feeHandler.claimStakerReward(address(this), 0);
        }
    }

    function setIsTestingReentrancy(bool isTesting) external {
        isTestingReentrant = isTesting;
    }
}
