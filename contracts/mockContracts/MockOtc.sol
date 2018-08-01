pragma solidity 0.4.18;


import "../ERC20Interface.sol";

contract MockOtc {

    ERC20 public wethToken;

    function() public payable {}

    function MockOtc(ERC20 _wethToken) public {
        wethToken = _wethToken;
    }

    function sellAllAmount(ERC20 payGem, uint payAmt, ERC20 buyGem, uint minFillAmount)
    public
    returns (uint fillAmount) {

        minFillAmount;

        fillAmount = getBuyAmount(buyGem, payGem, payAmt);
        require(payGem.transferFrom(msg.sender, this, payAmt));
        require(buyGem.transfer(msg.sender, fillAmount));
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