pragma solidity 0.6.6;

import "../KyberDao.sol";


/// @notice Mock Malicious Fee Handler tries to en-enter claim reward in KyberDao
contract MockMaliciousFeeHandlerReentrancy {
    KyberDao public dao;

    uint256 public numberCalls;

    constructor() public {}

    function setKyberDao(KyberDao _dao) public {
        dao = _dao;
    }

    function setNumberCalls(uint256 _numberCalls) public {
        numberCalls = _numberCalls;
    }

    function claimStakerReward(
        address payable staker,
        uint256,
        uint256 epoch
    ) public returns (bool) {
        if (numberCalls > 0) {
            numberCalls--;
            dao.claimReward(staker, epoch);
        }
        return true;
    }
}
