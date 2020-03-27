pragma solidity 0.5.11;

import "../IKyberReserve.sol";
import "../utils/Utils4.sol";
import "../utils/zeppelin/SafeERC20.sol";

contract MaliciousReserveNoTransferBack is IKyberReserve, Utils4 {
    using SafeERC20 for IERC20;

    function getConversionRate(IERC20, IERC20, uint, uint) public view 
        returns(uint) 
    {
        return 0;
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
        destToken;
        destAddress;
        conversionRate;
        if (srcToken == ETH_TOKEN_ADDRESS)
            require(msg.value == srcAmount, "ETH sent != srcAmount");
        else
            require(msg.value == 0, "ETH was sent for token -> ETH trade");

        // network does not approve, so we can not collect src token if src != ETH
        return true;
    }
}
