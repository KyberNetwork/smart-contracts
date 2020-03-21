pragma solidity 0.5.11;

import "../IBurnKncSanityRate.sol";



contract MockBurnKncSanityRate is IBurnKncSanityRate {
    uint kncEthRate;

    function setKncEthRate(uint _kncEthRate) external {
        kncEthRate = _kncEthRate;
    }

    function latestAnswer() external view returns (uint) {
        return kncEthRate;
    }
}
