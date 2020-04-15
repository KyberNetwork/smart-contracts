pragma solidity 0.5.11;

import "./MockDAO.sol";


contract MaliciousDAO is MockDAO {
    uint256 public burnInBPS;

    constructor(
        uint256 _rewardInBPS,
        uint256 _rebateInBPS,
        uint256 _epoch,
        uint256 _expiryBlockNumber
    ) public MockDAO(_rewardInBPS, _rebateInBPS, _epoch, _expiryBlockNumber) {}

    function setMockBRR(
        uint256 _burnInBPS,
        uint256 _rewardInBPS,
        uint256 _rebateInBPS
    ) public {
        rewardInBPS = _rewardInBPS;
        rebateInBPS = _rebateInBPS;
        burnInBPS = _burnInBPS;
    }

    function getLatestBRRData()
        external
        returns (
            uint256,
            uint256,
            uint256,
            uint256,
            uint256
        )
    {
        return (burnInBPS, rewardInBPS, rebateInBPS, epoch, expiryBlockNumber);
    }
}
