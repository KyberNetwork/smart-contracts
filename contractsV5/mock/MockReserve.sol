pragma solidity 0.5.11;

import "../IKyberReserve.sol";
import "../UtilsV5.sol";

contract MockReserve is IKyberReserve, Utils {
    mapping(address=>uint) public buyTokenRates;
    mapping(address=>uint) public sellTokenRates;
    
    function() external payable {}

    function setRate(IERC20 token, uint buyRate, uint sellRate) public {
        buyTokenRates[address(token)] = buyRate;
        sellTokenRates[address(token)] = sellRate;
    }
    
    function getTokenDecimals(IERC20 token) public view returns (uint) {
        return getDecimals(token);
    }
    
    function getConversionRate(IERC20 src, IERC20 dest, uint srcQty, uint blockNumber) public view returns(uint) {
        blockNumber;
        uint destQty;
        uint rate;
        rate = (src == ETH_TOKEN_ADDRESS) ? buyTokenRates[address(dest)] : sellTokenRates[address(src)];
        uint srcDecimals = getDecimals(src);
        uint destDecimals = getDecimals(dest);
        destQty = calcDstQty(srcQty, srcDecimals, destDecimals, rate);
        return calcRateFromQty(srcQty, destQty, srcDecimals, destDecimals);
    }
    
    function trade(
        IERC20 srcToken,
        uint srcAmount,
        IERC20 destToken,
        address payable destAddress,
        uint conversionRate,
        bool validate
    )
        public
        payable
        returns(bool) 
    {
        validate;
        if (srcToken == ETH_TOKEN_ADDRESS)
            require(msg.value == srcAmount);
        else
            require(msg.value == 0);
        
        uint srcDecimals = getDecimals(srcToken);
        uint destDecimals = getDecimals(destToken);
        uint destAmount = calcDstQty(srcDecimals, destDecimals, srcAmount, conversionRate);
        
        // collect src tokens
        if (srcToken != ETH_TOKEN_ADDRESS) {
            require(srcToken.transferFrom(msg.sender, address(this), srcAmount));
        }

        // send dest tokens
        if (destToken == ETH_TOKEN_ADDRESS) {
            destAddress.transfer(destAmount);
        } else {
            require(destToken.transferFrom(address(this), destAddress, destAmount));
        }    
        return true;        
    }
}
