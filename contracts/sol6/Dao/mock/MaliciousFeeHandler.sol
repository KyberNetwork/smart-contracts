pragma solidity 0.6.6;

import "../nimbleFeeHandler.sol";


contract MaliciousFeeHandler is nimbleFeeHandler {
    constructor(
        address daoSetter,
        InimbleProxy _nimbleNetworkProxy,
        address _nimbleNetwork,
        IERC20 _NIM,
        uint256 _burnBlockInterval,
        address _daoOperator
    )
        public
        nimbleFeeHandler(
            daoSetter,
            _nimbleNetworkProxy,
            _nimbleNetwork,
            _NIM,
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
