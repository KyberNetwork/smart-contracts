pragma solidity 0.6.6;

import "../InimbleNetworkProxy.sol";
import "../utils/Utils5.sol";
import "../InimbleFeeHandler.sol";

/// @dev contract to call trade when claimPlatformFee
contract ReentrancyFeeClaimer is Utils5 {
    InimbleNetworkProxy nimbleProxy;
    InimbleFeeHandler feeHandler;
    IERC20 token;
    uint256 amount;

    bool isReentrancy = true;

    constructor(
        InimbleNetworkProxy _nimbleProxy,
        InimbleFeeHandler _feeHandler,
        IERC20 _token,
        uint256 _amount
    ) public {
        nimbleProxy = _nimbleProxy;
        feeHandler = _feeHandler;
        token = _token;
        amount = _amount;
        require(_token.approve(address(_nimbleProxy), _amount));
    }

    function setReentrancy(bool _isReentrancy) external {
        isReentrancy = _isReentrancy;
    }

    receive() external payable {
        if (!isReentrancy) {
            return;
        }

        bytes memory hint;
        nimbleProxy.tradeWithHintAndFee(
            token,
            amount,
            ETH_TOKEN_ADDRESS,
            msg.sender,
            MAX_QTY,
            0,
            address(this),
            100,
            hint
        );
    }
}
