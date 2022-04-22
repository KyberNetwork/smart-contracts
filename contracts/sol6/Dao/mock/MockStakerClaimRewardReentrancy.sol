pragma solidity 0.6.6;

import "../../InimbleFeeHandler.sol";


contract MockStakerClaimRewardReentrancy {
    InimbleFeeHandler public feeHandler;
    bool public isTestingReentrant = true;

    constructor(
        InimbleFeeHandler _feeHandler
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
