pragma solidity ^0.4.18;


import "./ERC20Interface.sol";
import "./KyberNetwork.sol";
import "./PermissionGroups.sol";


interface ExpectedRateInterface {
    function getExpectedRate ( ERC20 source, ERC20 dest, uint destQuantity ) public view
        returns ( uint bestPrice, uint slippagePrice );
    function setKyberNetwork ( KyberNetwork kyberNetwork ) public;
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
<<<<<<< HEAD
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
=======
        require (quantityFactor != 0);
        require (kyberNetwork != address (0));

        bestPrice = kyberNetwork.getBestRate(source, dest, srcQuantity);
        slippagePrice = kyberNetwork.getBestRate(source, dest, (srcQuantity * quantityFactor));
        return (bestPrice, slippagePrice);
    }

    function setQuantityFactor ( uint _factor ) public onlyOperator {
        quantityFactor = _factor;
>>>>>>> ddf94e8f0eed140d12b4d8a43ad09ab216fed97b
    }
}
