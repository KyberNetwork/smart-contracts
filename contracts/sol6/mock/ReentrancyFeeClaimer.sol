pragma solidity 0.6.6;

import "../INimbleNetworkProxy.sol";
import "../utils/Utils5.sol";
import "../INimbleFeeHandler.sol";

/// @dev contract to call trade when claimPlatformFee
contract ReentrancyFeeClaimer is Utils5 {
    INimbleNetworkProxy NimbleProxy;
    INimbleFeeHandler feeHandler;
    IERC20 token;
    uint256 amount;

    bool isReentrancy = true;

    constructor(
        INimbleNetworkProxy _NimbleProxy,
        INimbleFeeHandler _feeHandler,
        IERC20 _token,
        uint256 _amount
    ) public {
        NimbleProxy = _NimbleProxy;
        feeHandler = _feeHandler;
        token = _token;
        amount = _amount;
        require(_token.approve(address(_NimbleProxy), _amount));
    }

    function setReentrancy(bool _isReentrancy) external {
        isReentrancy = _isReentrancy;
    }

    receive() external payable {
        if (!isReentrancy) {
            return;
        }

        bytes memory hint;
        NimbleProxy.tradeWithHintAndFee(
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
