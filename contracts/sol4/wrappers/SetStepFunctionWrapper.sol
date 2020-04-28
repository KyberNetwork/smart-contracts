pragma solidity ^0.4.18;

import "../ERC20Interface.sol";
import "../Withdrawable.sol";


interface SetStepFunctionInterface {
    function setImbalanceStepFunction(
        ERC20 token,
        int[] xBuy,
        int[] yBuy,
        int[] xSell,
        int[] ySell
    ) public;
}

contract SetStepFunctionWrapper is Withdrawable {
    SetStepFunctionInterface public rateContract;
    function SetStepFunctionWrapper(address admin, address operator) public {
        require(admin != address(0));
        require(operator != (address(0)));

        addOperator(operator);
        transferAdminQuickly(admin);
    }

    function setConversionRateAddress(SetStepFunctionInterface _contract) public onlyOperator {
        rateContract = _contract;
    }

    function setImbalanceStepFunction(
        ERC20 token,
        int[] xBuy,
        int[] yBuy,
        int[] xSell,
        int[] ySell)
        public onlyOperator
    {
        uint i;

        // check all x for buy are positive
        for( i = 0 ; i < xBuy.length ; i++ ) {
            require(xBuy[i] >= 0 );
        }

        // check all y for buy are negative
        for( i = 0 ; i < yBuy.length ; i++ ) {
            require(yBuy[i] <= 0 );
        }

        // check all x for sell are negative
        for( i = 0 ; i < xSell.length ; i++ ) {
            require(xSell[i] <= 0 );
        }

        // check all y for sell are negative
        for( i = 0 ; i < ySell.length ; i++ ) {
            require(ySell[i] <= 0 );
        }

        rateContract.setImbalanceStepFunction(token,xBuy,yBuy,xSell,ySell);
    }
}
