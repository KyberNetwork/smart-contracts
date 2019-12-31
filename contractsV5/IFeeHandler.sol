pragma solidity 0.5.11;


interface IFeeHandler {
    function handleFee() external returns(bool);
}
