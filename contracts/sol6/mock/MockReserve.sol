pragma solidity 0.6.6;

import "../INimbleReserve.sol";
import "../INimbleSanity.sol";
import "../utils/Utils5.sol";
import "../utils/zeppelin/SafeERC20.sol";


contract MockReserve is INimbleReserve, Utils5 {
    using SafeERC20 for IERC20;

    INimbleSanity public sanityRatesContract;
    mapping(address => uint256) public buyTokenRates;
    mapping(address => uint256) public sellTokenRates;

    receive() external payable {}

    function setContracts(
        INimbleSanity _sanityRates
    ) public {
        sanityRatesContract = _sanityRates;
    }

    function setRate(
        IERC20 token,
        uint256 buyRate,
        uint256 sellRate
    ) public {
        buyTokenRates[address(token)] = buyRate;
        sellTokenRates[address(token)] = sellRate;
    }

    function withdrawAllEth() public {
        msg.sender.transfer(address(this).balance);
    }

    function withdrawAllToken(IERC20 token) public {
        token.transfer(msg.sender, token.balanceOf(address(this)));
    }

    function trade(
        IERC20 srcToken,
        uint256 srcAmount,
        IERC20 destToken,
        address payable destAddress,
        uint256 conversionRate,
        bool validate
    ) public payable override virtual returns (bool) {
        validate;
        if (srcToken == ETH_TOKEN_ADDRESS) {
            require(msg.value == srcAmount, "ETH sent != srcAmount");
        } else {
            require(msg.value == 0, "ETH was sent for token -> ETH trade");
        }

        uint256 srcDecimals = getDecimals(srcToken);
        uint256 destDecimals = getDecimals(destToken);
        uint256 destAmount = calcDstQty(srcAmount, srcDecimals, destDecimals, conversionRate);
        require(destAmount > 0, "dest amount is 0");

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
    ) public view override returns (uint256) {
        blockNumber;
        uint256 rate = (src == ETH_TOKEN_ADDRESS)
            ? buyTokenRates[address(dest)]
            : sellTokenRates[address(src)];
        uint256 srcDecimals = getDecimals(src);
        uint256 destDecimals = getDecimals(dest);
        if (srcQty > MAX_QTY || rate > MAX_RATE ) {
            return 0;
        }
        uint256 destAmount = calcDstQty(srcQty, srcDecimals, destDecimals, rate);
        if (dest == ETH_TOKEN_ADDRESS && address(this).balance < destAmount) {
            return 0;
        }
        if (dest != ETH_TOKEN_ADDRESS && dest.balanceOf(address(this)) < destAmount) {
            return 0;
        }

        if (address(sanityRatesContract) != address(0)) {
            uint sanityRate = sanityRatesContract.getSanityRate(src, dest);
            if (rate > sanityRate) return 0;
        }

        return rate;
    }
}
