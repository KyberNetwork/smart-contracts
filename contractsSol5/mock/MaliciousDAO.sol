pragma solidity 0.5.11;

import "./MockDAO.sol";


contract MaliciousDAO is MockDAO {
    uint public burnInBPS;

    constructor(uint _rewardInBPS, uint _rebateInBPS, uint _epoch, uint _expiryTimestamp) public
        MockDAO(_rewardInBPS, _rebateInBPS, _epoch, _expiryTimestamp) {}

    function setMockBRR(uint _burnInBPS, uint _rewardInBPS, uint _rebateInBPS) public {
        rewardInBPS = _rewardInBPS;
        rebateInBPS = _rebateInBPS;
        burnInBPS = _burnInBPS;
    }

    function getLatestBRRData() external returns(uint, uint, uint, uint, uint) {
        return (burnInBPS, rewardInBPS, rebateInBPS, epoch, expiryTimestamp);
    }
}
