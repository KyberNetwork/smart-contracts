pragma solidity 0.5.11;

import "./MockDAO.sol";


contract MaliciousDAO is MockDAO {

    constructor(uint _rewardInBPS, uint _rebateInBPS, uint _epoch, uint _expiryBlockNumber) public
        MockDAO(_rewardInBPS, _rebateInBPS, _epoch, _expiryBlockNumber) {}

    function getLatestBRRData() external returns(uint, uint, uint, uint, uint) {
        return (0, 0, 0, epoch, expiryBlockNumber);
    }
}
