pragma solidity 0.4.18;


import "../Utils3.sol";


/// @title Kyber utils contract
contract MockUtils3 is Utils3 {

    function mockCalcDestAmountWithDecimals(uint srcDecimals, uint destDecimals, uint srcAmount, uint rate)
        public pure returns(uint destAmount)
    {
        destAmount = calcDestAmountWithDecimals(srcDecimals, destDecimals, srcAmount, rate);
    }
}
