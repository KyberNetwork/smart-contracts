pragma solidity 0.6.6;

import "../ISanityRate.sol";


contract MockChainLinkSanityRate is ISanityRate {
    uint256 latestAnswerValue;

    function setLatestNIMToEthRate(uint256 _NIMEthRate) external {
        latestAnswerValue = _NIMEthRate;
    }

    function latestAnswer() external view override returns (uint256) {
        return latestAnswerValue;
    }
}
