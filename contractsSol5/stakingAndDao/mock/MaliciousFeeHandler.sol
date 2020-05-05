pragma solidity 0.5.11;

import "../KyberFeeHandler.sol";


contract MaliciousFeeHandler is KyberFeeHandler {
    constructor(
        address daoSetter,
        IKyberNetworkProxy _kyberNetworkProxy,
        address _kyberNetwork,
        IERC20 _knc,
        uint256 _burnBlockInterval,
        address _burnConfigSetter
    )
        public
        KyberFeeHandler(
            daoSetter,
            _kyberNetworkProxy,
            _kyberNetwork,
            _knc,
            _burnBlockInterval,
            _burnConfigSetter
        )
    {}

    function setTotalPayoutBalance(uint256 _amount) external {
        totalPayoutBalance = _amount;
    }

    function withdrawEther(uint256 amount, address payable sendTo) external {
        sendTo.transfer(amount);
    }
}
