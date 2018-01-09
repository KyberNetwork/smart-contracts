pragma solidity ^0.4.18; // solhint-disable-line compiler-fixed


import "./ERC20Interface.sol";
import "./KyberNetwork.sol";
import "./Withdrawable.sol";


interface ExpectedRateInterface {
    function getExpectedRate(ERC20 source, ERC20 dest, uint srcQty) public view
        returns (uint expectedRate, uint slippageRate);
}


contract ExpectedRate is Withdrawable, ExpectedRateInterface {
    /* solhint-disable no-simple-event-func-name */

    KyberNetwork internal kyberNetwork;
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

    function setMinSlippageFactor(uint bps) public onlyOperator {
        SetMinSlippageFactor(bps, minSlippageFactorInBps, msg.sender);
        minSlippageFactorInBps = bps;
    }

    function getExpectedRate(ERC20 source, ERC20 dest, uint srcQty)
        public view
        returns (uint expectedRate, uint slippageRate)
    {
        require(quantityFactor != 0);
        require(kyberNetwork != address(0));

        uint bestReserve;
        uint minSlippage;

        (bestReserve, expectedRate) = kyberNetwork.findBestRate(source, dest, srcQty);
        (bestReserve, slippageRate) = kyberNetwork.findBestRate(source, dest, (srcQty * quantityFactor));

        minSlippage = ((10000 - minSlippageFactorInBps) * expectedRate) / 10000;
        if (slippageRate >= minSlippage) {
            slippageRate = minSlippage;
        }

        return (expectedRate, slippageRate);
    }
}
