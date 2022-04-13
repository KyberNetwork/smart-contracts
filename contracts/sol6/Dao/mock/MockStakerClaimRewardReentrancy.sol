pragma solidity 0.6.6;

import "../../INimbleFeeHandler.sol";


contract MockStakerClaimRewardReentrancy {
    INimbleFeeHandler public feeHandler;
    bool public isTestingReentrant = true;

    constructor(
        INimbleFeeHandler _feeHandler
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
