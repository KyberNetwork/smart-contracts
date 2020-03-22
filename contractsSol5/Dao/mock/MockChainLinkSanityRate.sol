pragma solidity 0.5.11;

import "../ISanityRate.sol";


contract MockChainLinkSanityRate is ISanityRate {
    uint latestAnswerValue;

    function setLatestKncToEthRate(uint _kncEthRate) external {
        latestAnswerValue = _kncEthRate;
    }

    function latestAnswer() external view returns (uint) {
        return latestAnswerValue;
    }
}
