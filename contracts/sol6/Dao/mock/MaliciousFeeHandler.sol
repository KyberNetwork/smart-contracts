pragma solidity 0.6.6;

import "../KyberFeeHandler.sol";


contract MaliciousFeeHandler is KyberFeeHandler {
    constructor(
        address daoSetter,
        IKyberProxy _kyberNetworkProxy,
        address _kyberNetwork,
        IERC20 _knc,
        uint256 _burnBlockInterval,
        address _daoOperator
    )
        public
        KyberFeeHandler(
            daoSetter,
            _kyberNetworkProxy,
            _kyberNetwork,
            _knc,
            _burnBlockInterval,
            _daoOperator
        )
    {}

    function setTotalPayoutBalance(uint256 _amount) external {
        totalPayoutBalance = _amount;
    }

    function withdrawEther(uint256 amount, address payable sendTo) external {
        sendTo.transfer(amount);
    }
}
