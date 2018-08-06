pragma solidity 0.4.18;


import "../../ERC20Interface.sol";


contract MockOtc {

    ERC20 public wethToken;
    uint public tokensForPayEth;

    function MockOtc(ERC20 _wethToken, uint _tokensForPayEth) public {
        wethToken = _wethToken;
        tokensForPayEth = _tokensForPayEth;
    }

    function() public payable {}

    function sellAllAmount(ERC20 payGem, uint payAmt, ERC20 buyGem, uint minFillAmount)
        public
        returns (uint fillAmount)
    {

        minFillAmount;

        fillAmount = getBuyAmount(buyGem, payGem, payAmt);
        require(payGem.transferFrom(msg.sender, this, payAmt));
        require(buyGem.transfer(msg.sender, fillAmount));
    }

    function getBuyAmount(ERC20 buyGem, ERC20 payGem, uint payAmt)
        public view
        returns (uint fillAmount)
    {

        buyGem;

        if (payGem == wethToken) {
            return tokensForPayEth * payAmt;
        } else {
            return payAmt / tokensForPayEth;
        }
    }
}