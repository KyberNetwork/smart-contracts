pragma solidity ^0.4.18;


import "./ERC20Interface.sol";
import "./KyberNetwork.sol";
import "./Withdrawable.sol";


interface ExpectedRateInterface {
    function getExpectedRate(ERC20 source, ERC20 dest, uint srcQty) public view
        returns ( uint expectedPrice, uint slippagePrice );
}


contract ExpectedRate is Withdrawable, ExpectedRateInterface {

    KyberNetwork kyberNetwork;
    uint quantityFactor = 2;

    function ExpectedRate(KyberNetwork _kyberNetwork) public {
        kyberNetwork = _kyberNetwork;
    }

    function getExpectedRate(ERC20 source, ERC20 dest, uint srcQty) public view
        returns ( uint expectedPrice, uint slippagePrice )
    {
        uint bestReserve;
        require (quantityFactor != 0);
        require (kyberNetwork != address (0));

        (bestReserve, expectedPrice) = kyberNetwork.findBestRate(source, dest, srcQty);
        (bestReserve, slippagePrice) = kyberNetwork.findBestRate(source, dest, (srcQty * quantityFactor));

        return (expectedPrice, slippagePrice);
    }

    event SetQuantityFactor (uint newFactor, uint oldFactor, address sender);

    function setQuantityFactor(uint newFactor) public onlyOperator {
        SetQuantityFactor(quantityFactor, newFactor, msg.sender);
        quantityFactor = newFactor;
    }
}
