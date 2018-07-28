pragma solidity ^0.4.18;


import "../ERC20Interface.sol";
import "../Utils.sol";


/// @title Mock Exchange Deposit Address
/// @author Tal Baneth
/// @dev a dummy contract that simulates an OTC.
contract MockOtc is Utils {

    function sellAllAmount(ERC20 pay_gem, uint pay_amt, ERC20 buy_gem, uint min_fill_amount)
        public
        returns (uint fill_amt) {
        if(pay_gem == ETH_TOKEN_ADDRESS)
        {
            return 481 * pay_amt;
        }
        else
        {
            return pay_amt / 481;
        }
    }
/*
    function buyAllAmount(ERC20 buy_gem, uint buy_amt, ERC20 pay_gem, uint max_fill_amount)
        public
        returns (uint fill_amt)
    {
        return 555;
    }
*/
    function getBuyAmount(ERC20 buy_gem, ERC20 pay_gem, uint pay_amt) public constant returns (uint fill_amt) {
        if(pay_gem == ETH_TOKEN_ADDRESS)
        {
            return 481 * pay_amt;
        }
        else
        {
            return pay_amt / 481;
        }
    }

/*
    function getPayAmount(ERC20 pay_gem, ERC20 buy_gem, uint buy_amt) public constant returns (uint fill_amt) {
        return 0;
    }
*/

}

/*
contract MockOasisDirectProxy is Utils {

    function sellAllAmountPayEth(MockOtc otc, ERC20 wethToken, ERC20 buyToken, uint minBuyAmt) public payable returns (uint buyAmt) {
        
    }

    function sellAllAmountBuyEth(MockOtc otc, ERC20 payToken, uint payAmt, ERC20 wethToken, uint minBuyAmt) public returns (uint wethAmt) {
        
    }

}
*/