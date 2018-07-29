pragma solidity 0.4.18;


import "../ERC20Interface.sol";
import "../Utils.sol";


contract MockOtc is Utils {

    function sellAllAmount(ERC20 payGem, uint payAmt, ERC20 buyGem, uint minFillAmount)
    public pure
    returns (uint fillAmount) {

        minFillAmount;
        buyGem;

        if (payGem == ETH_TOKEN_ADDRESS) {
            return 481 * payAmt;
        } else {
            return payAmt / 481;
        }
    }

    function getBuyAmount(ERC20 buyGem, ERC20 payGem, uint payAmt)
    public pure
    returns (uint fillAmount) {

        buyGem;

        if (payGem == ETH_TOKEN_ADDRESS) {
            return 481 * payAmt;
        } else {
            return payAmt / 481;
        }
    }
}