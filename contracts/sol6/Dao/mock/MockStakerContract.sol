pragma solidity 0.6.6;

import "../IKyberStaking.sol";
import "../../IERC20.sol";
import "../../IKyberDAO.sol";


contract MockStakerContractNoFallback {

    IERC20 public knc;
    IKyberStaking public staking;
    IKyberDAO public dao;

    constructor(IERC20 _knc, IKyberStaking _staking, IKyberDAO _dao) public {
        knc = _knc;
        staking = _staking;
        dao = _dao;
        require(knc.approve(address(_staking), 2**255));
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
    constructor(IERC20 _knc, IKyberStaking _staking, IKyberDAO _dao)
        public MockStakerContractNoFallback(_knc, _staking, _dao) {}

    receive() external payable {}
}
