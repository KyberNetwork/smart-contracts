pragma solidity ^0.4.18;


import "./ERC20Interface.sol";
import "./KyberNetwork.sol";
import "./PermissionGroups.sol";


interface ExpectedRateInterface {
    function getExpectedRateSourceQuantity ( ERC20 source, ERC20 dest, uint srcQuantity ) public view
        returns ( uint bestPrice, uint slippagePrice );
    function setQuantityFactor ( uint factor ) public;
}


contract ExpectedRate is PermissionGroups {

    KyberNetwork kyberNetwork;
    uint quantityFactor;

    function ExpectedRate ( KyberNetwork _kyberNetwork ) public {
        kyberNetwork = _kyberNetwork;
    }

    function getExpectedRateSourceQuantity ( ERC20 source, ERC20 dest, uint srcQuantity ) public view
        returns ( uint bestPrice, uint slippagePrice )
    {
        uint bestReserve;
        require (quantityFactor != 0);
        require (kyberNetwork != address (0));

        (bestReserve, bestPrice) = kyberNetwork.findBestRate(source, dest, srcQuantity);
        (bestReserve, slippagePrice) = kyberNetwork.findBestRate(source, dest, (srcQuantity * quantityFactor));

        return (bestPrice, slippagePrice);
    }

    event SetQuantityFactor ( uint newFactor, uint oldFactor, address sender );

    function setQuantityFactor ( uint newFactor ) public onlyOperator {
        SetQuantityFactor(quantityFactor, newFactor, msg.sender);
        quantityFactor = newFactor;
    }
}
