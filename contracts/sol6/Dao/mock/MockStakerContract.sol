pragma solidity 0.6.6;

import "../IKyberStaking.sol";
import "../../IERC20.sol";
import "../../IKyberDao.sol";


contract MockStakerContractNoFallback {

    IERC20 public kncToken;
    IKyberStaking public staking;
    IKyberDao public dao;

    constructor(IERC20 _kncToken, IKyberStaking _staking, IKyberDao _dao) public {
        kncToken = _kncToken;
        staking = _staking;
        dao = _dao;
        require(kncToken.approve(address(_staking), 2**255));
    }

    function deposit(uint amount) public {
        staking.deposit(amount);
    }

    function withdraw(uint amount) public {
        staking.withdraw(amount);
    }

    function delegate(address dAddress) public {
        staking.delegate(dAddress);
    }

    function vote(uint campaignID, uint optionID) public {
        dao.vote(campaignID, optionID);
    }

    function claimReward(uint epoch) public {
        dao.claimReward(address(this), epoch);
    }
}

contract MockStakerContractWithFallback is MockStakerContractNoFallback {
    constructor(IERC20 _kncToken, IKyberStaking _staking, IKyberDao _dao)
        public MockStakerContractNoFallback(_kncToken, _staking, _dao) {}

    receive() external payable {}
}
