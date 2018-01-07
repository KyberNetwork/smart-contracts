pragma solidity ^0.4.18;


import "./ERC20Interface.sol";
import "./KyberNetwork.sol";
import "./Withdrawable.sol";


interface ExpectedRateInterface {
    function getExpectedRate(ERC20 source, ERC20 dest, uint srcQty) public view
        returns (uint expectedPrice, uint slippagePrice);
}


contract ExpectedRate is Withdrawable, ExpectedRateInterface {

    KyberNetwork kyberNetwork;
    uint public quantityFactor = 2;
    uint public minSlippageFactorInBps = 50;

    function ExpectedRate(KyberNetwork _kyberNetwork, address _admin) public {
        kyberNetwork = _kyberNetwork;
        admin = _admin;
    }

    event SetQuantityFactor (uint newFactor, uint oldFactor, address sender);

    function setQuantityFactor(uint newFactor) public onlyOperator {
        SetQuantityFactor(quantityFactor, newFactor, msg.sender);
        quantityFactor = newFactor;
    }

    event SetMinSlippageFactor (uint newMin, uint oldMin, address sender);

    function setMinSlippageFactor( uint bps ) public onlyOperator {
        SetMinSlippageFactor(bps,minSlippageFactorInBps,msg.sender);    
        minSlippageFactorInBps = bps;
    }

    function getExpectedRate(ERC20 source, ERC20 dest, uint srcQty)
        public view
        returns (uint expectedPrice, uint slippagePrice)
    {
        require (quantityFactor != 0);
        require (kyberNetwork != address (0));

        uint bestReserve;
        uint minSlippage;

        (bestReserve, expectedPrice) = kyberNetwork.findBestRate(source, dest, srcQty);
        (bestReserve, slippagePrice) = kyberNetwork.findBestRate(source, dest, (srcQty * quantityFactor));

        minSlippage = ((10000 - minSlippageFactorInBps) * expectedPrice) / 10000;
        if( slippagePrice >= minSlippage ) {
            slippagePrice = minSlippage;
        }

        return (expectedPrice, slippagePrice);
    }
}
