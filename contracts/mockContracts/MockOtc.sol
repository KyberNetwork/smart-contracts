pragma solidity 0.4.18;


import "../ERC20Interface.sol";

contract MockOtc {

    ERC20 public wethToken;

    function MockOtc(ERC20 _wethToken) public {
        wethToken = _wethToken;
    }

    function sellAllAmount(ERC20 payGem, uint payAmt, ERC20 buyGem, uint minFillAmount)
    public view
    returns (uint fillAmount) {

        minFillAmount;
        buyGem;

        if (payGem == wethToken) {
            return 481 * payAmt;
        } else {
            return payAmt / 481;
        }
    }

    function getBuyAmount(ERC20 buyGem, ERC20 payGem, uint payAmt)
    public view
    returns (uint fillAmount) {

        buyGem;

        if (payGem == wethToken) {
            return 481 * payAmt;
        } else {
            return payAmt / 481;
        }
    }
}