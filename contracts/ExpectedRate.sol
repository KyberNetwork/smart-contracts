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

    function getExpectedRate ( ERC20 source, ERC20 dest, uint destQuantity ) public view
        returns ( uint bestPrice, uint slippagePrice )
    {
        require (quantityFactor != 0);
        require (kyberNetwork != address (0));

        bestPrice = kyberNetwork.getBestRate(source, dest, destQuantity);
        slippagePrice = kyberNetwork.getBestRate(source, dest, (destQuantity * quantityFactor));

        return (bestPrice, slippagePrice);
    }

    function setKyberNetwork ( KyberNetwork _kyberNetwork ) public onlyAdmin {
        kyberNetwork = _kyberNetwork;
    }

    function setQuantityFactor ( uint _factor ) public onlyOperator {
        quantityFactor = _factor;
    }
}
