pragma solidity ^0.4.16;

//import "ds-math/math.sol";
import "../Utils.sol";

contract OtcInterface {
    function sellAllAmount(address, uint, address, uint) public returns (uint);
    function buyAllAmount(address, uint, address, uint) public returns (uint);
    function getPayAmount(address, address, uint) public constant returns (uint);
}

contract TokenInterface {
    function balanceOf(address) public returns (uint);
    function allowance(address, address) public returns (uint);
    function approve(address, uint) public;
    function transfer(address,uint) public returns (bool);
    function transferFrom(address, address, uint) public returns (bool);
    function deposit() public payable;
    function withdraw(uint) public;
}

contract MockOasisDirectProxy is Utils { ///is DSMath {

//////////////// debug events //////////////////
    event debugBuyAmt(uint buyAmt);
////////////////////////////////////////////////

    function sellAllAmountPayEth(OtcInterface otc, TokenInterface wethToken, TokenInterface buyToken, uint minBuyAmt) public payable returns (uint buyAmt) {
        buyAmt = otc.sellAllAmount(ETH_TOKEN_ADDRESS, msg.value, buyToken, minBuyAmt);
        debugBuyAmt(buyAmt);
        require(buyToken.transfer(msg.sender, buyAmt));
    }

    function sellAllAmountBuyEth(OtcInterface otc, TokenInterface payToken, uint payAmt, TokenInterface wethToken, uint minBuyAmt) public returns (uint wethAmt) {
        require(payToken.transferFrom(msg.sender, this, payAmt));
        wethAmt = otc.sellAllAmount(payToken, payAmt, ETH_TOKEN_ADDRESS, minBuyAmt);
        //problem is here:
        require(msg.sender.call.value(wethAmt)());
    }

    function() public payable {}
}
