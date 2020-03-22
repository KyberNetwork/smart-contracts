pragma solidity 0.5.11;

import "../KyberFeeHandler.sol";


contract MaliciousFeeHandler is KyberFeeHandler {

    constructor(address daoSetter, IKyberNetworkProxy _kyberNetworkProxy, address _kyberNetwork,
        IERC20 _knc, uint _burnBlockInterval)
        public KyberFeeHandler(daoSetter, _kyberNetworkProxy, _kyberNetwork, _knc, _burnBlockInterval)
        {}

    function setTotalPayoutBalance(uint _amount) external {
        totalPayoutBalance = _amount;
    }

    function withdrawEther(uint amount, address payable sendTo) external {
        sendTo.transfer(amount);
    }
}
