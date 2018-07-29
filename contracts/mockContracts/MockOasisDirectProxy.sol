pragma solidity 0.4.18;

import "../ERC20Interface.sol";


contract OtcInterface {
    function sellAllAmount(address, uint, address, uint) public returns (uint);
}


contract MockOasisDirectProxy {

    function() public payable {}

    function sellAllAmountPayEth(OtcInterface otc, ERC20 wethToken, ERC20 buyToken, uint minBuyAmt)
    public payable
    returns(uint buyAmt) {

        buyAmt = otc.sellAllAmount(wethToken, msg.value, buyToken, minBuyAmt);
        require(buyToken.transfer(msg.sender, buyAmt));
    }

    function sellAllAmountBuyEth(OtcInterface otc, ERC20 payToken, uint payAmt, ERC20 wethToken, uint minBuyAmt)
    public
    returns (uint wethAmt) {

        require(payToken.transferFrom(msg.sender, this, payAmt));
        wethAmt = otc.sellAllAmount(payToken, payAmt, wethToken, minBuyAmt);
        require(msg.sender.call.value(wethAmt)());
    }
}
