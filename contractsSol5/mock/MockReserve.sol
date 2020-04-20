pragma solidity 0.5.11;

import "../IKyberReserve.sol";
import "../utils/Utils4.sol";
import "../utils/zeppelin/SafeERC20.sol";


contract MockReserve is IKyberReserve, Utils4 {
    using SafeERC20 for IERC20;

    mapping(address => uint256) public buyTokenRates;
    mapping(address => uint256) public sellTokenRates;

    function() external payable {}

    function setRate(
        IERC20 token,
        uint256 buyRate,
        uint256 sellRate
    ) public {
        buyTokenRates[address(token)] = buyRate;
        sellTokenRates[address(token)] = sellRate;
    }

    function trade(
        IERC20 srcToken,
        uint256 srcAmount,
        IERC20 destToken,
        address payable destAddress,
        uint256 conversionRate,
        bool validate
    ) public payable returns (bool) {
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
            srcToken.safeTransferFrom(msg.sender, address(this), srcAmount);
        }

        // send dest tokens
        if (destToken == ETH_TOKEN_ADDRESS) {
            destAddress.transfer(destAmount);
        } else {
            destToken.safeTransfer(destAddress, destAmount);
        }
        return true;
    }

    function getTokenDecimals(IERC20 token) public view returns (uint256) {
        return getDecimals(token);
    }

    function getConversionRate(
        IERC20 src,
        IERC20 dest,
        uint256 srcQty,
        uint256 blockNumber
    ) public view returns (uint256) {
        blockNumber;
        uint256 rate;
        srcQty;

        rate = (src == ETH_TOKEN_ADDRESS)
            ? buyTokenRates[address(dest)]
            : sellTokenRates[address(src)];
        return rate;
    }
}
