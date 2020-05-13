pragma solidity 0.6.6;

import "./MockReserve.sol";


contract MaliciousReserve2 is MockReserve {
    // extraSrcAmount > 0: take more src amount from network
    // extraSrcAmount < 0: take less src amount from network
    int256 public extraSrcAmount;
    // extraDestAmount > 0: send more dest amount to network
    // extraDestAmount < 0: send less dest amount to network
    int256 public extraDestAmount;

    function setExtraSrcAndDestAmounts(int256 _extraSrcAmount, int256 _extraDestAmount) public {
        extraSrcAmount = _extraSrcAmount;
        extraDestAmount = _extraDestAmount;
    }

    function trade(
        IERC20 srcToken,
        uint256 srcAmount,
        IERC20 destToken,
        address payable destAddress,
        uint256 conversionRate,
        bool validate
    ) public payable override returns (bool) {
        validate;
        if (srcToken == ETH_TOKEN_ADDRESS) {
            require(msg.value == srcAmount, "ETH sent != srcAmount");
        } else {
            require(msg.value == 0, "ETH was sent for token -> ETH trade");
        }

        uint256 srcDecimals = getDecimals(srcToken);
        uint256 destDecimals = getDecimals(destToken);
        uint256 destAmount = calcDstQty(srcAmount, srcDecimals, destDecimals, conversionRate);

        // collect src tokens
        if (srcToken != ETH_TOKEN_ADDRESS) {
            srcToken.safeTransferFrom(msg.sender, address(this), uint256(int256(srcAmount) + extraSrcAmount));
        }

        // send dest tokens
        uint256 actualDestAmount = uint256(int256(destAmount) + extraDestAmount);
        if (destToken == ETH_TOKEN_ADDRESS) {
            destAddress.transfer(actualDestAmount);
        } else {
            destToken.safeTransfer(destAddress, actualDestAmount);
        }

        return true;
    }
}
