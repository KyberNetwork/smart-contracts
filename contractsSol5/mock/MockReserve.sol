pragma solidity 0.5.11;

import "../IKyberReserve.sol";
import "../Utils4.sol";

contract MockReserve is IKyberReserve, Utils4 {
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
    
    function getConversionRate(IERC20 src, IERC20 dest, uint srcQty, uint blockNumber) public view 
        returns(uint) 
    {
        blockNumber;
        uint rate;
        srcQty;
        
        rate = (src == ETH_TOKEN_ADDRESS) ? buyTokenRates[address(dest)] : sellTokenRates[address(src)];
        return rate;
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
            require(msg.value == srcAmount, "ETH sent != srcAmount");
        else
            require(msg.value == 0, "ETH was sent for token -> ETH trade");
        
        uint srcDecimals = getDecimals(srcToken);
        uint destDecimals = getDecimals(destToken);
        uint destAmount = calcDstQty(srcAmount, srcDecimals, destDecimals, conversionRate);
        
        // collect src tokens
        if (srcToken != ETH_TOKEN_ADDRESS) {
            require(srcToken.transferFrom(msg.sender, address(this), srcAmount), "failed to trf src tokens to reserve");
        }

        // send dest tokens
        if (destToken == ETH_TOKEN_ADDRESS) {
            destAddress.transfer(destAmount);
        } else {
            require(destToken.transfer(destAddress, destAmount), "failed to trf dest tokens to destAddress");
        }
        return true;
    }
}
