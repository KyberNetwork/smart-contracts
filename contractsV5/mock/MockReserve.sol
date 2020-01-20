pragma solidity 0.5.11;

import "../IKyberReserve.sol";
import "../UtilsV5.sol";

contract MockReserve is IKyberReserve, Utils {
    mapping(address=>uint) public tokenToEthRates;
    mapping(address=>uint) public ethToTokenRates;
    
    function() external payable {}

    function setRate(IERC20 token, uint tokenToEthRate, uint ethToTokenRate) public {
        tokenToEthRates[address(token)] = tokenToEthRate;
        ethToTokenRates[address(token)] = ethToTokenRate;
    }
    
    function getConversionRate(IERC20 src, IERC20 dest, uint srcQty, uint blockNumber) public view returns(uint) {
        blockNumber;
        uint destQty;
        uint rate;
        rate = (dest == ETH_TOKEN_ADDRESS) ? tokenToEthRates[address(src)] : ethToTokenRates[address(dest)];
        destQty = calcDestAmount(src, dest, srcQty, rate);
        uint srcDecimals = getDecimals(src);
        uint destDecimals = getDecimals(dest);
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